import { Menu } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { LoadingBlock } from "@/champions/components/LoadingImage";
import { NftCard } from "@/champions/components/NftCard";
import { prefetchArtwork, useOwnedNfts } from "@/champions/hooks/useLitdex";
import { useWallet } from "@/champions/hooks/useWallet";
import type { OwnedNft } from "@/champions/lib/litdex";

const PAGE_SIZE = 3;

type RarityKey = "all" | "0" | "1" | "2" | "3";

const RARITY_OPTIONS: { value: RarityKey; label: string }[] = [
  { value: "all", label: "All rarities" },
  { value: "0", label: "Common" },
  { value: "1", label: "Rare" },
  { value: "2", label: "Epic" },
  { value: "3", label: "Legend" },
];

function RarityFilter({
  value,
  onChange,
}: {
  value: RarityKey;
  onChange: (v: RarityKey) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Filter champions by rarity"
        aria-expanded={open}
        className="btn fx-9 btn-pill btn-blue !px-3.5"
      >
        <span className="btn-label flex items-center">
          <Menu className="size-4" />
        </span>
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-48 overflow-hidden rounded-2xl border border-black/15 bg-white shadow-xl">
          {RARITY_OPTIONS.map((o) => (
            <button
              key={o.value}
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
              className={`btn-text block w-full px-4 py-3 text-left ${
                value === o.value ? "bg-[#0038FF] text-white" : "text-black hover:bg-black/5"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function NftSection({ onManage }: { onManage?: () => void }) {
  const { address, correctNetwork, switchNetwork } = useWallet();
  const { data, isLoading, isFetching, isError, error, refetch } = useOwnedNfts();
  const [rarity, setRarity] = useState<RarityKey>("all");
  const [page, setPage] = useState(0);

  const filtered = useMemo<OwnedNft[]>(() => {
    let list = [...(data ?? [])];
    if (rarity !== "all") list = list.filter((n) => n.rarity === Number(rarity));
    list.sort((a, b) => (a.tokenId > b.tokenId ? -1 : a.tokenId < b.tokenId ? 1 : 0));
    return list;
  }, [data, rarity]);

  // Warm the cache for every owned champion so paging/filtering is instant.
  useEffect(() => {
    if (!data || data.length === 0) return;
    prefetchArtwork(data.map((n) => n.tokenId));
  }, [data]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  const visible = filtered.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);

  if (!address) return null;

  return (
    <section id="champions" className="mt-16 scroll-mt-8 space-y-6">
      <div className="flex flex-col items-center gap-4 md:flex-row md:justify-between">
        <div className="md:w-1/4" />
        <h2 className="btn-heading heading-ul text-center text-black">
          My <span className="text-[#0038FF]">champions</span>
        </h2>
        <div className="flex justify-center md:w-1/4 md:justify-end">
          <RarityFilter
            value={rarity}
            onChange={(v) => {
              setRarity(v);
              setPage(0);
            }}
          />
        </div>
      </div>

      {!correctNetwork && (
        <div className="rounded-[2rem] border-2 border-dashed border-black/15 bg-[#F4F4F2] p-8 text-center">
          <p className="btn-text text-black/60">
            You&apos;re on another network — switch to Base Mainnet to see and manage your champions.
          </p>
          <button
            onClick={() => void switchNetwork()}
            className="btn fx-9 btn-pill btn-blue mt-6"
          >
            <span className="btn-label">switch to base</span>
          </button>
        </div>
      )}

      {isLoading && !isError && <LoadingBlock label="Loading your champions…" />}
      {isError && (
        <div className="rounded-[2rem] border-2 border-dashed border-red-200 bg-red-50 p-8 text-center">
          <p className="btn-text text-red-700">
            Couldn&apos;t load your champions.{" "}
            {error instanceof Error ? error.message : "Please try refreshing the page."}
          </p>
          <button
            onClick={() => void refetch()}
            className="btn fx-9 btn-pill btn-blue mt-4"
          >
            <span className="btn-label">Retry</span>
          </button>
        </div>
      )}
      {!isFetching && !isError && filtered.length === 0 && correctNetwork && (
        <div className="btn-text rounded-[2rem] border-2 border-dashed border-black/15 bg-[#F4F4F2] p-8 text-center text-black/50">
          {data && data.length > 0
            ? "No champions match this filter."
            : "You don't own any Litdex champions yet. Mint one above."}
        </div>
      )}

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((nft) => (
          <NftCard key={nft.tokenId.toString()} nft={nft} compact />
        ))}
      </div>

      {filtered.length > 0 && (
        <p className="btn-text text-center text-black/50">
          Manage, level up and transfer on the{" "}
          <button type="button" onClick={onManage} className="text-[#0038FF] hover:underline">
            levels page
          </button>
          .
        </p>
      )}

      {filtered.length > PAGE_SIZE && (
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => setPage(current - 1)}
            disabled={current === 0}
            className="btn fx-9 btn-pill btn-blue"
          >
            <span className="btn-label">Prev</span>
          </button>
          <span className="btn-text text-black/60">
            Page {current + 1} / {pageCount}
          </span>
          <button
            onClick={() => setPage(current + 1)}
            disabled={current >= pageCount - 1}
            className="btn fx-9 btn-pill btn-blue"
          >
            <span className="btn-label">Next</span>
          </button>
        </div>
      )}
    </section>
  );
}
