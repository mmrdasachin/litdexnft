import { useCallback, useEffect, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { Spinner } from "@/champions/components/ui/reui-spinner";

import {
  nftRead,
  readProvider,
  useMintStatus,
  useNftArtwork,
  useRefreshAll,
  useVouchers,
} from "@/champions/hooks/useLitdex";
import { useWallet } from "@/champions/hooks/useWallet";
import { PASS_CARD_IMAGES, RARITY_ICONS } from "@/champions/lib/images";
import { showError, showSuccess } from "@/lib/feedback";
import {
  NFT_ADDRESS,
  discountLabel,
  discountedPrice,
  formatUsdt,
  mintedTokenIdsFromReceipt,
  nftContract,
  openSeaUrl,
  parseWalletError,
  prewarmMetadata,
  usdcContract,
  type Voucher,
} from "@/champions/lib/litdex";

const WALLET_LIMIT = 2;

function formatCountdown(msLeft: number) {
  const total = Math.max(0, Math.floor(msLeft / 1000));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return d > 0 ? `${d}d ${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(h)}:${pad(m)}:${pad(s)}`;
}

const mintStyle = {
  "--mint-surface": "var(--color-brand-surface)",
  "--mint-muted": "var(--color-brand-surface-2)",
  "--mint-border": "var(--color-brand-border)",
  "--mint-primary": "var(--color-brand-control)",
  "--mint-on-primary": "var(--color-brand-control-foreground)",
  "--mint-primary-light": "var(--color-brand-control)",
  "--mint-accent": "var(--color-brand-control)",
  "--mint-text": "var(--color-brand-text-primary)",
  "--mint-text-muted": "var(--color-brand-text-muted)",
  "--mint-success": "var(--color-brand-control)",
  "--mint-gradient-subtle":
    "linear-gradient(135deg, oklch(0.65 0.2 260 / 0.10), oklch(0.6 0.22 300 / 0.06))",
  "--mint-gradient-button":
    "linear-gradient(135deg, oklch(0.55 0.22 260), oklch(0.5 0.22 300))",
  "--mint-gradient-hero":
    "linear-gradient(135deg, oklch(0.97 0.01 260), oklch(0.95 0.02 300 / 0.35))",
  "--mint-gradient-premium":
    "linear-gradient(135deg, oklch(0.22 0.03 260), oklch(0.45 0.18 260))",
} as React.CSSProperties;

const OPENSEA_COLLECTION_URL = "https://opensea.io/collection/litdex";

/** LitDEX's own success popup (same one a swap uses), with an OpenSea link. */
function showMintSuccess(title: string, tokenIds: bigint[], txHash?: string) {
  const first = tokenIds[0];
  showSuccess({
    title,
    subtitle: "Litdex Genesis Champions · Base Mainnet",
    rows: [
      ...(tokenIds.length > 0
        ? [{ label: "Token", value: tokenIds.map((id) => `#${id.toString()}`).join(", ") }]
        : []),
      {
        label: "OpenSea",
        value: first !== undefined ? "Trade on OpenSea" : "View collection",
        href: first !== undefined ? openSeaUrl(first) : OPENSEA_COLLECTION_URL,
      },
      ...(txHash
        ? [{
            label: "Transaction",
            value: `${txHash.slice(0, 6)}…${txHash.slice(-4)}`,
            href: `https://basescan.org/tx/${txHash}`,
          }]
        : []),
    ],
  });
}

export function MintCard() {
  const { address, getSigner, correctNetwork, connect, connecting } = useWallet();
  const { data: mintStatus, isLoading, refetch: refetchStatus } = useMintStatus();
  const { data: voucherData, isLoading: vouchersLoading, refetch: refetchVouchers } = useVouchers();
  const refreshAll = useRefreshAll();
  const [status, setStatus] = useState<string | null>(null);
  const [mintedId, setMintedId] = useState<bigint | null>(null);
  const { data: mintedArt, isLoading: mintedArtLoading } = useNftArtwork(
    mintedId ?? undefined,
  );

  const [passIndex, setPassIndex] = useState(0);
  const [loadedPasses, setLoadedPasses] = useState<string[]>([]);
  const markPassLoaded = useCallback(
    (label: string) =>
      setLoadedPasses((prev) =>
        prev.includes(label) ? prev : [...prev, label],
      ),
    [],
  );
  const passesReady = loadedPasses.length >= PASS_CARD_IMAGES.length;
  useEffect(() => {
    if (!passesReady) return;
    const timer = setInterval(
      () => setPassIndex((i) => (i + 1) % PASS_CARD_IMAGES.length),
      2600,
    );
    return () => clearInterval(timer);
  }, [passesReady]);
  const activePass =
    PASS_CARD_IMAGES[passIndex] ?? PASS_CARD_IMAGES[0] ?? null;

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const started = mintStatus?.publicMintStarted ?? false;
  const startsAt = (mintStatus?.publicMintStart ?? 0) * 1000;
  const countdown =
    startsAt > 0 ? formatCountdown(startsAt - now) : null;
  const price = mintStatus ? BigInt(mintStatus.priceUSDT) : null;
  const soldOut =
    !!mintStatus && mintStatus.supplyCap > 0 && mintStatus.totalMinted >= mintStatus.supplyCap;
  const busy = status !== null;
  const ownedCount = mintStatus?.walletPublicMintCount ?? 0;
  const limitReached = mintStatus?.walletLimitReached ?? false;
  const progress =
    mintStatus && mintStatus.supplyCap > 0
      ? (mintStatus.totalMinted / mintStatus.supplyCap) * 100
      : 0;

  const whitelistActive = voucherData?.whitelistActive !== false;
  const whitelistStartRaw = Number(voucherData?.whitelistStart ?? 0);
  const whitelistStartMs =
    whitelistStartRaw > 0
      ? whitelistStartRaw > 1e12
        ? whitelistStartRaw
        : whitelistStartRaw * 1000
      : 0;
  const whitelistCountdown =
    !whitelistActive && whitelistStartMs > 0
      ? formatCountdown(whitelistStartMs - now)
      : null;

  const priorityVouchers = (voucherData?.vouchers ?? []).filter(
    (v) => v.category.toUpperCase() === "PRIORITY",
  );
  const priorityVoucher = priorityVouchers[0] ?? null;
  const RARITY_DISPLAY: Record<string, string> = {
    COMMON: "LitShard",
    RARE: "LitCore",
    EPIC: "LitGod",
  };
  const rarityLabel = (category: string) =>
    RARITY_DISPLAY[category.toUpperCase()] ?? category;

  const voucherGroups = (() => {
    const map = new Map<string, Voucher[]>();
    for (const v of voucherData?.vouchers ?? []) {
      const key = v.category.toUpperCase();
      if (key === "PRIORITY") continue;
      map.set(key, [...(map.get(key) ?? []), v]);
    }
    return [...map.entries()];
  })();

  const [qtyByCategory, setQtyByCategory] = useState<Record<string, number>>({});
  const qtyFor = (category: string) => qtyByCategory[category] ?? 0;
  const setQty = (category: string, next: number, max: number) =>
    setQtyByCategory((prev) => ({
      ...prev,
      [category]: Math.max(0, Math.min(next, max)),
    }));

  const selectedVouchers = voucherGroups.flatMap(([category, vouchers]) =>
    vouchers.slice(0, Math.min(qtyFor(category), vouchers.length)),
  );
  const selectedCost =
    price !== null
      ? selectedVouchers.reduce(
          (sum, v) => sum + discountedPrice(price, v.discountBps),
          0n,
        )
      : null;

  const remainingPublic = Math.max(0, WALLET_LIMIT - ownedCount);
  const [publicQty, setPublicQty] = useState(1);
  const publicQtyClamped = Math.max(1, Math.min(publicQty, Math.max(remainingPublic, 1)));

  /**
   * Every freshly minted token starts as Common level 1 — pre-warm each one so
   * the artwork is cached server-side before we render the card.
   */
  async function prewarmMintedTokens(
    receipt: { logs?: readonly { address?: string; topics: readonly string[]; data: string }[] } | null,
  ) {
    const ids = mintedTokenIdsFromReceipt(receipt);
    if (ids.length === 0) {
      try {
        const next = await nftRead().nextTokenId();
        if (next > 1n) ids.push(next - 1n);
      } catch {
        /* artwork is optional */
      }
    }
    await Promise.all(ids.map((id) => prewarmMetadata(id, "Common", 1)));
    return ids;
  }


  /**
   * Ensures the NFT contract can spend `totalCost` USDC.
   * Awaits the approve receipt AND polls the chain until the new allowance is
   * actually readable, so the follow-up mint can never hit a stale allowance.
   */
  async function ensureAllowance(
    signer: Awaited<ReturnType<typeof getSigner>>,
    owner: string,
    totalCost: bigint,
  ) {
    const reader = usdcContract(readProvider());
    const current = await reader.allowance(owner, NFT_ADDRESS);
    if (current >= totalCost) return;

    setStatus("Approving USDC…");
    const approveTx = await usdcContract(signer).approve(NFT_ADDRESS, totalCost);
    await approveTx.wait(1);

    for (let i = 0; i < 15; i++) {
      try {
        const next = await reader.allowance(owner, NFT_ADDRESS);
        if (next >= totalCost) return;
      } catch {
        /* transient RPC error — retry */
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    throw new Error("Approval confirmed but allowance not visible yet. Try minting again.");
  }

  async function handleMint(quantity: number) {
    if (!address || price === null || quantity < 1) return;
    const totalCost = price * BigInt(quantity);
    try {
      const signer = await getSigner();
      await ensureAllowance(signer, address, totalCost);

      setStatus("Minting…");
      const nft = nftContract(signer);
      const tx = await nft.mintBatch(quantity);
      const receipt = await tx.wait(1);

      setStatus("Preparing artwork…");
      const newIds = await prewarmMintedTokens(receipt);
      if (newIds.length > 0) setMintedId(newIds[newIds.length - 1]!);

      setStatus("Success");
      await refreshAll();
      await refetchStatus();
      showMintSuccess(
        quantity > 1 ? `${quantity} champions minted` : "Champion minted",
        newIds,
        receipt?.hash,
      );
    } catch (err) {
      showError(parseWalletError(err, "Mint failed, try again."));
    } finally {
      setStatus(null);
    }
  }

  async function handleVoucherMint(vouchers: Voucher[]) {
    if (!address || price === null || vouchers.length === 0) return;
    const totalCost = vouchers.reduce(
      (sum, v) => sum + discountedPrice(price, v.discountBps),
      0n,
    );
    try {
      const signer = await getSigner();
      await ensureAllowance(signer, address, totalCost);

      setStatus("Minting…");
      const nft = nftContract(signer);
      const structs = vouchers.map(
        (v) => [v.wallet, v.discountBps, v.nonce] as [string, number, string],
      );
      const signatures = vouchers.map((v) => v.signature);
      const tx =
        vouchers.length === 1
          ? await nft.mintWithVoucher(structs[0]!, signatures[0]!)
          : await nft.mintWithVouchersBatch(structs, signatures);
      const receipt = await tx.wait(1);

      setStatus("Preparing artwork…");
      const newIds = await prewarmMintedTokens(receipt);
      if (newIds.length > 0) setMintedId(newIds[newIds.length - 1]!);

      setStatus("Success");
      await refreshAll();
      await Promise.all([refetchStatus(), refetchVouchers()]);
      showMintSuccess(
        `${vouchers.length} ${vouchers.length === 1 ? "champion" : "champions"} minted at whitelist price`,
        newIds,
        receipt?.hash,
      );
    } catch (err) {
      showError(parseWalletError(err, "Voucher mint failed, try again."));
    } finally {
      setStatus(null);
    }
  }

  const publicStageCard = (
    <div className="rounded-[8px] border border-[var(--mint-border)] bg-[var(--mint-surface)] p-5 shadow-sm md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="font-mono text-[11px] font-bold uppercase tracking-widest text-[var(--mint-text-muted)]">
            Public stage
          </p>
          <p className="font-sans text-2xl font-bold text-[var(--mint-text)]">
            ${price !== null ? formatUsdt(price) : "…"} USDC
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-[8px] border border-[var(--mint-border)] bg-[var(--mint-muted)] px-3 py-1.5">
          <span
            className={`size-2 rounded-full ${
              started ? "bg-[var(--mint-primary)]" : "bg-[var(--mint-success)]"
            }`}
          />
          <span className="font-mono text-[11px] font-bold uppercase tracking-widest text-[var(--mint-text)]">
            {started ? "Minting now" : "Not started"}
          </span>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-4">

        <p className="font-mono text-[12px] font-bold uppercase tracking-widest text-[var(--mint-text-muted)]">
          {started
            ? "Minting now"
            : countdown
              ? `Starts in ${countdown}`
              : "Not scheduled"}
        </p>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2 rounded-[8px] border border-[var(--mint-border)] bg-[var(--mint-muted)] p-1">
          <button
            aria-label="Decrease public mint quantity"
            disabled={publicQtyClamped <= 1 || busy}
            onClick={() => setPublicQty(publicQtyClamped - 1)}
            className="grid size-8 place-items-center rounded-full text-[var(--mint-text)] transition-all hover:bg-[var(--mint-surface)] hover:text-[var(--mint-primary)] active:scale-90 disabled:opacity-40"
          >
            <Minus className="size-3.5" />
          </button>
          <span className="min-w-6 text-center font-mono text-sm font-bold text-[var(--mint-text)]">
            {publicQtyClamped}
          </span>
          <button
            aria-label="Increase public mint quantity"
            disabled={publicQtyClamped >= remainingPublic || busy}
            onClick={() => setPublicQty(publicQtyClamped + 1)}
            className="grid size-8 place-items-center rounded-full text-[var(--mint-text)] transition-all hover:bg-[var(--mint-surface)] hover:text-[var(--mint-primary)] active:scale-90 disabled:opacity-40"
          >
            <Plus className="size-3.5" />
          </button>
        </div>

        <button
          disabled={
            !correctNetwork ||
            soldOut ||
            busy ||
            !mintStatus ||
            !started ||
            limitReached
          }
          onClick={() => void handleMint(publicQtyClamped)}
          className="champions-cta champions-cta--auto"
        >
          {soldOut
            ? "Sold out"
            : !started
              ? "Mint when live"
              : limitReached
                ? "Limit reached"
                : status ??
                  `Mint ${publicQtyClamped} · ${
                    price !== null
                      ? formatUsdt(price * BigInt(publicQtyClamped))
                      : "…"
                  } USDC`}
        </button>
      </div>

      <p className="mt-5 text-right font-mono text-[11px] font-bold uppercase tracking-widest text-[var(--mint-text-muted)]">
        Limit {WALLET_LIMIT} per wallet · You own {ownedCount}
      </p>
    </div>
  );

  return (
    <div
      id="mint"
      style={mintStyle}
      className="scroll-mt-24 p-0 md:p-0"
    >
      <div className="mb-6 text-center">
        <h3 className="nft-action-heading">Mint a champion</h3>
        <div className="nft-action-rule" />
        <p className="nft-action-description">Common rarity to start · Base Mainnet</p>
      </div>

      <div className="mb-6">
        <div className="w-full rounded-[8px] border border-[var(--mint-border)] bg-[var(--mint-surface)] p-5 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <p className="font-mono text-[12px] font-bold uppercase tracking-widest text-[var(--mint-text-muted)]">
              Items minted
            </p>
            <p className="font-mono text-base font-bold text-[var(--mint-text)]">
              {isLoading || !mintStatus
                ? "…"
                : `${mintStatus.totalMinted} / ${mintStatus.supplyCap}`}
            </p>
          </div>
          <div className="mt-3 h-3.5 w-full overflow-hidden rounded-full bg-[var(--mint-muted)]">
            <div
              className="h-full rounded-[8px] bg-[var(--mint-primary)] transition-all duration-700"
              style={{ width: `${Math.min(progress, 100)}%` }}
            />
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        {/* Left: pass-card carousel */}
        <div className="relative flex flex-col gap-4 lg:sticky lg:top-8 lg:self-start">
          <div className="relative aspect-square w-full overflow-hidden rounded-[8px] border border-[var(--mint-border)] bg-[var(--mint-surface)] shadow-xl">
            {PASS_CARD_IMAGES.map((pass, i) => (
              <img
                key={pass.label}
                src={pass.src}
                alt={`Litdex pass card — ${pass.label}`}
                ref={(el) => {
                  if (el && el.complete) markPassLoaded(pass.label);
                }}
                onLoad={() => markPassLoaded(pass.label)}
                onError={() => markPassLoaded(pass.label)}
                className={`absolute inset-0 size-full object-cover transition-opacity duration-[900ms] ease-in-out ${
                  i === passIndex && passesReady ? "z-10 opacity-100" : "z-0 opacity-0"
                }`}
              />
            ))}
            {!passesReady && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-[var(--mint-surface)]">
                <Spinner className="size-8 text-[var(--mint-primary)]" />
                <p className="font-mono text-[11px] font-bold uppercase tracking-widest text-[var(--mint-text-muted)]">
                  Loading pass cards…
                </p>
              </div>
            )}
          </div>

          <div className="flex items-center justify-center gap-3">
            {PASS_CARD_IMAGES.map((pass, i) => (
              <button
                key={pass.label}
                type="button"
                aria-label={`Show ${pass.label} pass`}
                onClick={() => setPassIndex(i)}
                className={`h-2 rounded-full transition-all duration-500 ${
                  i === passIndex
                    ? "w-8 bg-[var(--mint-primary)]"
                    : "w-2 bg-[var(--mint-border)] hover:bg-[var(--mint-primary)]/40"
                }`}
              />
            ))}
            <span className="ml-2 rounded-[8px] border border-[var(--mint-border)] bg-[var(--mint-surface)] px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-widest text-[var(--mint-text-muted)]">
              {activePass?.label}
            </span>
          </div>
        </div>

        {/* Right: mint controls */}
        <div className="flex flex-col gap-5">
          {/* Mint actions — whitelist + public stacked full-width */}
          <div className="flex flex-col gap-4">

          {/* Whitelist — always visible. Three states: not connected, eligible, not eligible. */}
          <div className="flex flex-col gap-4 rounded-[8px] border border-[var(--mint-border)] bg-[var(--mint-surface)] p-5 shadow-sm md:p-6">
            {!address ? (
              <div className="flex flex-col items-start gap-3">
                <span className="inline-flex items-center gap-2 whitespace-nowrap rounded-[8px] border border-[var(--mint-border)] bg-[var(--mint-muted)] px-4 py-1.5 font-mono text-[11px] font-bold uppercase tracking-widest text-[var(--mint-text-muted)]">
                  Whitelist
                </span>
                <p className="font-sans text-sm font-medium text-[var(--mint-text-muted)]">
                  Connect your wallet to check whitelist eligibility.
                </p>
              </div>
            ) : vouchersLoading ? (
              <div className="flex items-center gap-3">
                <Spinner className="size-5 text-[var(--mint-primary)]" />
                <p className="font-mono text-[11px] font-bold uppercase tracking-widest text-[var(--mint-text-muted)]">
                  Checking eligibility…
                </p>
              </div>
            ) : voucherData && voucherData.totalVouchers > 0 ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className="inline-flex items-center gap-2 whitespace-nowrap rounded-[8px] bg-[var(--mint-primary)] px-4 py-1.5 font-mono text-[11px] font-bold uppercase tracking-widest text-[var(--mint-on-primary)] shadow-sm">
                      Whitelist eligible
                    </span>
                    <p className="mt-2 font-mono text-[11px] font-bold uppercase tracking-widest text-[var(--mint-text-muted)]">
                      {voucherData.totalVouchers} discounted mint
                      {voucherData.totalVouchers === 1 ? "" : "s"} available
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <div className="flex items-center gap-2 rounded-[8px] border border-[var(--mint-border)] bg-[var(--mint-muted)] px-3 py-1.5">
                      <span
                        className={`size-2 rounded-full ${
                          whitelistActive
                            ? "bg-[var(--mint-primary)]"
                            : "bg-[var(--mint-success)]"
                        }`}
                      />
                      <span className="font-mono text-[11px] font-bold uppercase tracking-widest text-[var(--mint-text)]">
                        {whitelistActive
                          ? "Minting now"
                          : whitelistCountdown
                            ? `Starts in ${whitelistCountdown}`
                            : "Not scheduled"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Priority voucher */}
                {priorityVoucher && price !== null && (
                  <div className="relative overflow-hidden rounded-[8px] border border-[var(--mint-border)] bg-[var(--mint-muted)] p-5 text-[var(--mint-text)] shadow-md">
                    <div className="absolute -right-8 -top-8 size-32 rounded-[8px] bg-[var(--mint-primary)]/20 blur-2xl" />
                    <div className="relative flex flex-wrap items-center justify-between gap-4">
                      <p className="font-sans text-base font-semibold">
                        You are eligible to mint at ${" "}
                        {formatUsdt(discountedPrice(price, priorityVoucher.discountBps))}{" "}
                        USDC
                      </p>
                      <button
                        disabled={!correctNetwork || busy || !whitelistActive}
                        onClick={() => void handleVoucherMint([priorityVoucher])}
                        className="champions-cta champions-cta--auto"
                      >
                        {!whitelistActive
                          ? whitelistCountdown
                            ? `Starts in ${whitelistCountdown}`
                            : "Not scheduled"
                          : status ?? "Mint"}
                      </button>
                    </div>
                  </div>
                )}

                {/* Category rows — Common / Rare / Epic side-by-side as compact boxes */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {voucherGroups.map(([category, vouchers]) => {
                    const qty = Math.min(qtyFor(category), vouchers.length);
                    const first = vouchers[0]!;
                    return (
                      <div
                        key={category}
                        className="relative min-h-[104px] overflow-hidden rounded-[8px] border border-[var(--mint-border)] bg-[var(--mint-muted)] p-3 transition-shadow duration-300 hover:shadow-sm"
                      >
                        {/* Diagonal corner discount ribbon — matches the whitelist-eligible gradient */}
                        <div className="pointer-events-none absolute left-0 top-0 size-[60px] overflow-hidden rounded-tl-2xl">
                          <span className="absolute left-[-46px] top-[17px] block w-[124px] -rotate-45 bg-[var(--mint-primary)] py-0.5 text-center font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--mint-on-primary)] shadow-[0_1px_3px_rgba(0,0,0,0.18)]">
                            {discountLabel(first.discountBps)}
                            <span className="block text-[7px] leading-none">off</span>
                          </span>
                        </div>

                        <span className="absolute right-3 top-3 whitespace-nowrap font-mono text-[11px] font-bold tracking-widest text-[var(--mint-text)]">
                          x {vouchers.length}
                        </span>

                        <div className="flex min-h-[78px] items-end justify-between gap-2 pl-8 pt-7">
                          <div className="flex min-w-0 items-center gap-2 self-center">
                            <img
                              src={RARITY_ICONS[category.toUpperCase()]}
                              alt=""
                              aria-hidden="true"
                              className="size-8 shrink-0 object-contain"
                            />
                            <p className="min-w-0 whitespace-nowrap font-mono text-[11px] font-bold tracking-wider text-[var(--mint-text)]">
                              {rarityLabel(category)}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-1 rounded-[8px] border border-[var(--mint-border)] bg-[var(--mint-surface)] p-0.5">
                            <button
                              aria-label={`Decrease ${category} quantity`}
                              disabled={qty <= 0 || busy}
                              onClick={() => setQty(category, qty - 1, vouchers.length)}
                              className="grid size-6 place-items-center rounded-full text-[var(--mint-text)] transition-all hover:bg-[var(--mint-muted)] hover:text-[var(--mint-primary)] active:scale-90 disabled:opacity-40"
                            >
                              <Minus className="size-2.5" />
                            </button>
                            <span className="min-w-4 text-center font-mono text-[11px] font-bold text-[var(--mint-text)]">
                              {qty}
                            </span>
                            <button
                              aria-label={`Increase ${category} quantity`}
                              disabled={qty >= vouchers.length || busy}
                              onClick={() => setQty(category, qty + 1, vouchers.length)}
                              className="grid size-6 place-items-center rounded-full text-[var(--mint-text)] transition-all hover:bg-[var(--mint-muted)] hover:text-[var(--mint-primary)] active:scale-90 disabled:opacity-40"
                            >
                              <Plus className="size-2.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <button
                  disabled={
                    !correctNetwork ||
                    busy ||
                    price === null ||
                    !whitelistActive ||
                    selectedVouchers.length === 0
                  }
                  onClick={() => void handleVoucherMint(selectedVouchers)}
                  className="champions-cta mt-1"
                >
                  {!whitelistActive
                    ? whitelistCountdown
                      ? `Starts in ${whitelistCountdown}`
                      : "Not scheduled"
                    : selectedVouchers.length === 0
                      ? "Select vouchers to mint"
                      : status ??
                        `Mint ${selectedVouchers.length} in one transaction · $${
                          selectedCost !== null ? formatUsdt(selectedCost) : "…"
                        } USDC`}
                </button>
              </>
            ) : (
              <div className="flex flex-col items-start gap-3">
                <span className="inline-flex items-center gap-2 whitespace-nowrap rounded-[8px] border border-[var(--mint-border)] bg-[var(--mint-muted)] px-4 py-1.5 font-mono text-[11px] font-bold uppercase tracking-widest text-[var(--mint-text-muted)]">
                  Not whitelisted
                </span>
                <p className="font-sans text-base font-bold text-[var(--mint-text)]">
                  You are not whitelisted
                </p>
                <p className="font-sans text-sm font-medium text-[var(--mint-text-muted)]">
                  This wallet doesn't have any discounted mints available. You can still mint in the public sale below.
                </p>
              </div>
            )}
          </div>


          {/* Not connected */}
          {!address && (
            <div className="flex flex-col gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-[8px] border border-[var(--mint-border)] bg-[var(--mint-surface)] p-5 shadow-sm transition-shadow duration-300 hover:shadow-md">
                  <p className="font-mono text-[11px] font-bold uppercase tracking-widest text-[var(--mint-text-muted)]">
                    Whitelist mint
                  </p>
                  <p className="mt-2 flex items-center gap-2 font-mono text-[12px] font-bold uppercase tracking-widest text-[var(--mint-primary)]">
                    <span className="inline-block size-2 rounded-full bg-[var(--mint-success)]" />
                    Open
                  </p>
                </div>
                <div className="rounded-[8px] border border-[var(--mint-border)] bg-[var(--mint-surface)] p-5 shadow-sm transition-shadow duration-300 hover:shadow-md">
                  <p className="font-mono text-[11px] font-bold uppercase tracking-widest text-[var(--mint-text-muted)]">
                    Public mint
                  </p>
                  <p className="mt-2 font-mono text-[12px] font-bold uppercase tracking-widest text-[var(--mint-text)]">
                    {started
                      ? "Live now"
                      : countdown
                        ? `Starts in ${countdown}`
                        : "Not scheduled"}
                  </p>
                </div>
              </div>
              <button
                onClick={() => void connect()}
                disabled={connecting}
                className="champions-cta"
              >
                {connecting ? "Connecting…" : "Connect wallet to mint"}
              </button>
            </div>
          )}

          {/* Public stage */}
          {address && (
            <div className="rounded-[8px] border border-[var(--mint-border)] bg-[var(--mint-surface)] p-5 shadow-sm md:p-6">
              {/* Header row: label + price (left, stacked), status badge (far right) */}
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-1">
                  <p className="font-mono text-[11px] font-bold uppercase tracking-widest text-[var(--mint-text-muted)]">
                    Public stage
                  </p>
                  <p className="font-sans text-2xl font-bold text-[var(--mint-text)]">
                    ${price !== null ? formatUsdt(price) : "…"} USDC
                  </p>
                </div>
                <div className="flex items-center gap-2 rounded-[8px] border border-[var(--mint-border)] bg-[var(--mint-muted)] px-3 py-1.5">
                  <span
                    className={`size-2 rounded-full ${
                      started ? "bg-[var(--mint-primary)]" : "bg-[var(--mint-success)]"
                    }`}
                  />
                  <span className="font-mono text-[11px] font-bold uppercase tracking-widest text-[var(--mint-text)]">
                    {started
                      ? "Minting now"
                      : countdown
                        ? `Starts in ${countdown}`
                        : "Not scheduled"}
                  </span>
                </div>
              </div>

              {/* Stepper + mint button row, immediately after the countdown */}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-2 rounded-[8px] border border-[var(--mint-border)] bg-[var(--mint-muted)] p-1">
                  <button
                    aria-label="Decrease public mint quantity"
                    disabled={publicQtyClamped <= 1 || busy}
                    onClick={() => setPublicQty(publicQtyClamped - 1)}
                    className="grid size-8 place-items-center rounded-full text-[var(--mint-text)] transition-all hover:bg-[var(--mint-surface)] hover:text-[var(--mint-primary)] active:scale-90 disabled:opacity-40"
                  >
                    <Minus className="size-3.5" />
                  </button>
                  <span className="min-w-6 text-center font-mono text-sm font-bold text-[var(--mint-text)]">
                    {publicQtyClamped}
                  </span>
                  <button
                    aria-label="Increase public mint quantity"
                    disabled={publicQtyClamped >= remainingPublic || busy}
                    onClick={() => setPublicQty(publicQtyClamped + 1)}
                    className="grid size-8 place-items-center rounded-full text-[var(--mint-text)] transition-all hover:bg-[var(--mint-surface)] hover:text-[var(--mint-primary)] active:scale-90 disabled:opacity-40"
                  >
                    <Plus className="size-3.5" />
                  </button>
                </div>

                <button
                  disabled={
                    !correctNetwork ||
                    soldOut ||
                    busy ||
                    !mintStatus ||
                    !started ||
                    limitReached
                  }
                  onClick={() => void handleMint(publicQtyClamped)}
                  className="champions-cta champions-cta--auto"
                >
                  {soldOut
                    ? "Sold out"
                    : !started
                      ? "Mint when live"
                      : limitReached
                        ? "Limit reached"
                        : status ??
                          `Mint ${publicQtyClamped} · $${
                            price !== null
                              ? formatUsdt(price * BigInt(publicQtyClamped))
                              : "…"
                          } USDC`}
                </button>
              </div>

              <p className="mt-4 text-right font-mono text-[11px] font-bold uppercase tracking-widest text-[var(--mint-text-muted)]">
                Limit {WALLET_LIMIT} per wallet · You own {ownedCount}
              </p>
            </div>
          )}
          </div>

          {mintedId !== null && (
            <p className="font-mono text-xs font-bold text-[var(--mint-text-muted)]">
              {mintedArtLoading
                ? "Loading artwork…"
                : `Champion #${mintedId.toString()} minted!`}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
