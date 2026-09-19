import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { ethers } from "ethers";
import { useCallback } from "react";
import { useWallet } from "./useWallet";
import {
  API_BASE,
  BASE_CHAIN_ID,
  BASE_RPC_URL,
  CONFIG_GAMES_REQUIRED,
  CONFIG_REPAIR_COST,
  artworkUrl,
  nftContract,
  parseRarity,
  pointsContract,
  usdtContract,
  type OwnedNft,
  type VoucherResponse,
} from "@/champions/lib/litdex";

const READ_RPC = BASE_RPC_URL;

export function readProvider() {
  return new ethers.JsonRpcProvider(READ_RPC, BASE_CHAIN_ID, { staticNetwork: true });
}

export const nftRead = () => nftContract(readProvider());
export const pointsRead = () => pointsContract(readProvider());
export const usdtRead = () => usdtContract(readProvider());

export function useBasePoints() {
  const { address } = useWallet();
  return useQuery({
    queryKey: ["basePoints", address],
    enabled: !!address,
    queryFn: async (): Promise<bigint> => pointsRead().balance(address!),
    refetchInterval: 20000,
  });
}

export function useMintInfo() {
  return useQuery({
    queryKey: ["mintInfo"],
    queryFn: async () => {
      const c = nftRead();
      const [price, cap, minted] = await Promise.all([
        c.mintPriceUSDT(),
        c.commonSupplyCap(),
        c.rarityMinted(0),
      ]);
      return { price, cap, minted };
    },
    refetchInterval: 30000,
  });
}

export type MintStatus = {
  totalMinted: number;
  supplyCap: number;
  publicMintStart: number;
  publicMintStarted: boolean;
  walletPublicMintCount: number;
  walletLimitReached: boolean;
  priceUSDT: string;
};

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export function useMintStatus() {
  const { address } = useWallet();
  const target = address ?? ZERO_ADDRESS;
  return useQuery({
    queryKey: ["mintStatus", target],
    refetchInterval: 15000,
    retry: false,
    queryFn: async (): Promise<MintStatus> => {
      const res = await fetch(`${API_BASE}/mint-status/${target}`);
      const json = (await res.json()) as MintStatus & { error?: string };
      if (!res.ok || json.error) throw new Error(json.error ?? "mint status failed");
      return json;
    },
  });
}


export function useVouchers() {
  const { address } = useWallet();
  return useQuery({
    queryKey: ["vouchers", address],
    enabled: !!address,
    refetchInterval: 30000,
    retry: false,
    queryFn: async (): Promise<VoucherResponse> => {
      const res = await fetch(`${API_BASE}/whitelist/vouchers/${address}`);
      const json = (await res.json()) as VoucherResponse & { error?: string };
      if (!res.ok || json.error) throw new Error(json.error ?? "voucher fetch failed");
      return json;
    },
  });
}

export function useGameConfig() {
  return useQuery({
    queryKey: ["gameConfig"],
    queryFn: async () => {
      const c = nftRead();
      const [repairCost, gamesRequired] = await Promise.all([
        c.config(CONFIG_REPAIR_COST),
        c.config(CONFIG_GAMES_REQUIRED),
      ]);
      return { repairCost, gamesRequired };
    },
    staleTime: 5 * 60 * 1000,
  });
}

const OWNED_CACHE_PREFIX = "litdex:owned:";

export type TokenState = { rarity: number; level: number; damaged: boolean; gamesAtMaxLevel: number };

/**
 * State we read straight from chain right after a level up / promote / repair.
 * The /champions API can lag behind the chain (cached or a slower node), and
 * used to overwrite the card with the old tier. While an entry here is newer
 * than what the API reports, the on-chain state wins. It is dropped as soon as
 * the API catches up, or after FRESH_TTL_MS.
 */
const FRESH_TTL_MS = 5 * 60 * 1000;
const freshTokenState = new Map<string, { state: TokenState; ts: number }>();

const sameState = (a: TokenState, b: TokenState) =>
  a.rarity === b.rarity && a.level === b.level && a.damaged === b.damaged && a.gamesAtMaxLevel === b.gamesAtMaxLevel;

export function applyFreshTokenState(qc: QueryClient, address: string, tokenId: bigint, state: TokenState) {
  freshTokenState.set(tokenId.toString(), { state, ts: Date.now() });
  const key = ["ownedNfts", address];
  const old = qc.getQueryData<OwnedNft[]>(key);
  if (!old) return;
  const next = old.map((n) => (n.tokenId === tokenId ? { ...n, ...state } : n));
  qc.setQueryData(key, next);
  writeOwnedCache(address, next);
}

/** Base RPC nodes can trail a block or two; re-read the points balance a bit later too. */
export function settleBasePoints(qc: QueryClient) {
  for (const ms of [2500, 6000]) {
    setTimeout(() => void qc.invalidateQueries({ queryKey: ["basePoints"] }), ms);
  }
}

type CachedNft = Omit<OwnedNft, "tokenId"> & { tokenId: string };

function readOwnedCache(address: string): OwnedNft[] | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.localStorage.getItem(OWNED_CACHE_PREFIX + address.toLowerCase());
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as CachedNft[];
    return parsed.map((n) => ({ ...n, tokenId: BigInt(n.tokenId) }));
  } catch {
    return undefined;
  }
}

function writeOwnedCache(address: string, nfts: OwnedNft[]) {
  if (typeof window === "undefined") return;
  try {
    const serialisable: CachedNft[] = nfts.map((n) => ({ ...n, tokenId: n.tokenId.toString() }));
    window.localStorage.setItem(
      OWNED_CACHE_PREFIX + address.toLowerCase(),
      JSON.stringify(serialisable),
    );
  } catch {
    /* storage full / private mode — ignore */
  }
}

type ChampionsApiItem = {
  tokenId?: string | number;
  token_id?: string | number;
  rarity?: number | string;
  rarityName?: string;
  rarity_name?: string;
  tier?: number | string;
  level?: number | string;
  damaged?: boolean;
  gamesAtMaxLevel?: number;
  games_at_max_level?: number;
};

type ChampionsApiResponse =
  | { totalOwned?: number; champions?: ChampionsApiItem[]; nfts?: ChampionsApiItem[] }
  | ChampionsApiItem[];

const FETCH_TIMEOUT_MS = 30000;

export function useOwnedNfts() {
  const { address } = useWallet();
  return useQuery({
    queryKey: ["ownedNfts", address],
    enabled: !!address,
    // One retry only. The default (3 x 30s timeout) meant a failing request
    // sat on "Loading your champions…" for two minutes before the UI ever
    // admitted something was wrong.
    retry: 1,
    // Show the last known list instantly, then refresh in the background.
    initialData: () => (address ? readOwnedCache(address) : undefined),
    initialDataUpdatedAt: 0,
    queryFn: async (): Promise<OwnedNft[]> => {
      if (!address) throw new Error("wallet not connected");
      const url = `${API_BASE}/champions/${address}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      try {
        const res = await fetch(url, { signal: controller.signal });
        const json = (await res.json()) as ChampionsApiResponse;
        if (!res.ok) {
          const err = (json as { error?: string }).error;
          throw new Error(err ?? `champions fetch failed (${res.status})`);
        }
        const items = Array.isArray(json)
          ? json
          : json.champions ?? json.nfts ?? [];
        if (!Array.isArray(items)) {
          throw new Error("unexpected champions response format");
        }
        const parsed = items.map((item) => {
          const tokenIdRaw = item.tokenId ?? item.token_id ?? "0";
          const rarity =
            parseRarity(item.rarity) ??
            parseRarity(item.rarityName) ??
            parseRarity(item.rarity_name) ??
            parseRarity(item.tier);
          const levelNum = Number(item.level);
          return {
            tokenId: BigInt(tokenIdRaw),
            rarity,
            level: Number.isFinite(levelNum) && levelNum > 0 ? levelNum : null,
            damaged: Boolean(item.damaged),
            gamesAtMaxLevel: Number(item.gamesAtMaxLevel ?? item.games_at_max_level ?? 0),
          };
        });

        // The API only tells us WHICH tokens the wallet owns. Rarity, level and
        // damage are always read from chain: the API was caught returning an
        // old level after a level up while the artwork (built from chain) was
        // already on the new tier. If a chain read fails we fall back to the
        // API's numbers for that token.
        const contract = nftRead();
        const readOne = async (item: (typeof parsed)[number]): Promise<OwnedNft> => {
          try {
            const s = await contract.tokenState(item.tokenId);
            return {
              tokenId: item.tokenId,
              rarity: Number(s[0]),
              level: Number(s[1]),
              damaged: Boolean(s[2]),
              gamesAtMaxLevel: Number(s[3]),
            };
          } catch {
            return {
              ...item,
              rarity: item.rarity ?? 0,
              level: item.level ?? 1,
            } as OwnedNft;
          }
        };
        const result: OwnedNft[] = [];
        for (let i = 0; i < parsed.length; i += 10) {
          result.push(...(await Promise.all(parsed.slice(i, i + 10).map(readOne))));
        }

        const now = Date.now();
        const merged = result.map((n) => {
          const id = n.tokenId.toString();
          const fresh = freshTokenState.get(id);
          if (!fresh) return n;
          if (sameState(fresh.state, n) || now - fresh.ts > FRESH_TTL_MS) {
            freshTokenState.delete(id);
            return n;
          }
          return { ...n, ...fresh.state };
        });
        writeOwnedCache(address, merged);
        return merged;
      } finally {
        clearTimeout(timeout);
      }
    },
    refetchInterval: 30000,
  });
}

export function useLevelCost(level: number) {
  const nextLevel = level + 1;
  return useQuery({
    queryKey: ["levelCost", nextLevel],
    enabled: nextLevel <= 9,
    queryFn: async (): Promise<bigint> => nftRead().pointsPerLevel(nextLevel),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Resolves the artwork for a token. The predictable API URL is returned
 * immediately as placeholder data so the image starts downloading at once;
 * the on-chain tokenURI is resolved in the background and only swaps the
 * source if it points somewhere else.
 */
export function useNftArtwork(tokenId: bigint | undefined, version?: string) {
  return useQuery({
    queryKey: ["nftArtwork", tokenId?.toString(), version ?? ""],
    enabled: tokenId !== undefined,
    retry: false,
    staleTime: Infinity,
    placeholderData: tokenId !== undefined ? artworkUrl(tokenId, version) : null,
    queryFn: async (): Promise<string | null> => {
      const uri = await nftRead().tokenURI(tokenId!);
      const httpUri = uri.startsWith("ipfs://")
        ? uri.replace("ipfs://", "https://ipfs.io/ipfs/")
        : uri;
      let image: string | null = null;
      if (httpUri.startsWith("data:application/json")) {
        const json = JSON.parse(atob(httpUri.split(",")[1] ?? ""));
        image = json.image ?? null;
      } else {
        const res = await fetch(httpUri);
        if (!res.ok) return artworkUrl(tokenId!, version);
        const json = await res.json();
        image = json.image ?? null;
      }
      if (image && image.startsWith("ipfs://")) {
        image = image.replace("ipfs://", "https://ipfs.io/ipfs/");
      }
      if (!image) return artworkUrl(tokenId!, version);
      if (version && image.startsWith(API_BASE)) {
        image += `${image.includes("?") ? "&" : "?"}v=${encodeURIComponent(version)}`;
      }
      return image;
    },
  });
}

/** Warm the browser cache for a batch of token artworks. */
export function prefetchArtwork(tokenIds: bigint[]) {
  if (typeof window === "undefined") return;
  for (const id of tokenIds) {
    const img = new Image();
    img.decoding = "async";
    img.src = artworkUrl(id);
  }
}

export function useRefreshAll() {
  const qc = useQueryClient();
  return useCallback(async () => {
    await qc.invalidateQueries();
    // Force every mounted query to re-read so on-screen numbers update
    // immediately after a transaction, without a page refresh.
    await qc.refetchQueries({ type: "active" });
  }, [qc]);
}

/**
 * Polls the chain until a token's on-chain state differs from the snapshot we
 * had before the transaction. Prevents the UI from re-reading a stale block.
 */
export async function waitForTokenStateChange(
  tokenId: bigint,
  previous: { rarity: number; level: number; damaged: boolean; gamesAtMaxLevel: number },
  attempts = 10,
): Promise<TokenState | null> {
  const c = nftRead();
  for (let i = 0; i < attempts; i++) {
    try {
      const s = await c.tokenState(tokenId);
      const changed =
        Number(s[0]) !== previous.rarity ||
        Number(s[1]) !== previous.level ||
        Boolean(s[2]) !== previous.damaged ||
        Number(s[3]) !== previous.gamesAtMaxLevel;
      if (changed) {
        return {
          rarity: Number(s[0]),
          level: Number(s[1]),
          damaged: Boolean(s[2]),
          gamesAtMaxLevel: Number(s[3]),
        };
      }
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 1200));
  }
  return null;
}

