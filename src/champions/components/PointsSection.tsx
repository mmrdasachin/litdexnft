import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { settleBasePoints, useRefreshAll } from "@/champions/hooks/useLitdex";
import { useWallet } from "@/champions/hooks/useWallet";
import { API_BASE, formatPoints, parseWalletError, pointsContract } from "@/champions/lib/litdex";
import { showErrorCard, showSuccess } from "@/lib/feedback";

type ClaimStep = "idle" | "requesting" | "signing" | "confirming";

type LdAvailable = { available: bigint; pendingBurn: bigint; syncing: boolean };

async function fetchLdAvailable(address: string): Promise<LdAvailable> {
  const res = await fetch(`${API_BASE}/points/available/${address}`);
  const j = (await res.json().catch(() => null)) as
    | { available?: string; pendingBurn?: string; syncing?: boolean }
    | null;
  if (!res.ok || !j || j.available === undefined) throw new Error("available fetch failed");
  return {
    available: BigInt(j.available),
    pendingBurn: BigInt(j.pendingBurn ?? "0"),
    syncing: !!j.syncing,
  };
}

/**
 * Claiming happens inline — an amount field sits next to a compact Claim
 * button, so there is no second dialog on top of the page. Success is
 * reported through LitDEX's own SuccessCard (the same popup a swap uses)
 * instead of a toast, so the NFT section matches the rest of the site.
 */
export function PointsSection() {
  const { address, getSigner, correctNetwork } = useWallet();
  const refreshAll = useRefreshAll();
  const qc = useQueryClient();
  const [amount, setAmount] = useState("");
  const [step, setStep] = useState<ClaimStep>("idle");

  /**
   * LD is burned by the backend only after the Base claim confirms, so the raw
   * on-chain LD balance lags behind by a few seconds. The backend's
   * /points/available subtracts whatever has already landed on Base but is not
   * burned yet, so the number here drops the moment the claim confirms and a
   * second claim can never spend the same points twice.
   */
  const litvm = useQuery({
    queryKey: ["ldAvailable", address],
    enabled: !!address,
    refetchInterval: (q) => (q.state.data?.syncing ? 3000 : 20000),
    queryFn: () => fetchLdAvailable(address!),
  });

  const available = litvm.data ? litvm.data.available : null;
  const burnPending = !!litvm.data && (litvm.data.syncing || litvm.data.pendingBurn > 0n);
  const busy = step !== "idle";

  /**
   * Base confirmed -> ask the backend to burn now instead of waiting for its
   * 20s loop, then poll until the balance reflects it. Both calls are
   * idempotent on the backend, so the second confirm is just a safety net for
   * a node that had not seen the block yet.
   */
  async function syncAfterClaim(claimed: bigint, before: bigint | null) {
    if (!address) return;
    const confirm = () =>
      fetch(`${API_BASE}/points/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      }).catch(() => undefined);
    void confirm();
    setTimeout(() => void confirm(), 5000);

    for (let i = 0; i < 12; i++) {
      try {
        const cur = await fetchLdAvailable(address);
        qc.setQueryData(["ldAvailable", address], cur);
        if (before === null || cur.available <= before - claimed) break;
      } catch {
        /* backend busy, next attempt */
      }
      await new Promise((r) => setTimeout(r, 2500));
    }
    void qc.invalidateQueries({ queryKey: ["ldAvailable", address] });
  }

  let amountValid = false;
  try {
    const raw = amount.trim();
    if (raw !== "" && /^\d+$/.test(raw)) {
      const a = BigInt(raw);
      amountValid = a > 0n && (available === null || a <= available);
    }
  } catch {
    amountValid = false;
  }

  async function handleClaim() {
    if (!address || !amountValid) return;
    const before = available;
    setStep("requesting");
    try {
      const res = await fetch(`${API_BASE}/points/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, amount: amount.trim() }),
      });
      const body = (await res.json().catch(() => null)) as
        | { totalEarned: string; expiry: string; signature: string; error?: string; message?: string }
        | null;
      if (!res.ok || !body) {
        showErrorCard(body?.error || body?.message || "Claim request failed. Try again.");
        setStep("idle");
        return;
      }

      setStep("signing");
      const signer = await getSigner();
      const tx = await pointsContract(signer).claim(body.totalEarned, body.expiry, body.signature);
      setStep("confirming");
      const receipt = await tx.wait();

      const claimed = amount.trim();
      setAmount("");
      void syncAfterClaim(BigInt(claimed), before);
      await refreshAll();
      settleBasePoints(qc);
      showSuccess({
        title: "Points claimed",
        subtitle: "LitVM → Base Mainnet",
        rows: [
          { label: "Claimed", value: `${formatPoints(claimed)} pts` },
          { label: "Network", value: "Base Mainnet" },
          ...(receipt?.hash
            ? [{
                label: "Transaction",
                value: `${receipt.hash.slice(0, 6)}…${receipt.hash.slice(-4)}`,
                href: `https://basescan.org/tx/${receipt.hash}`,
              }]
            : []),
        ],
      });
    } catch (err) {
      showErrorCard(parseWalletError(err, "Claim failed, try again."));
    } finally {
      setStep("idle");
    }
  }

  const buttonLabel =
    step === "requesting"
      ? "Preparing…"
      : step === "signing"
        ? "Confirm…"
        : step === "confirming"
          ? "Confirming…"
          : "Claim";

  return (
    <div className="flex flex-col rounded-[2rem] bg-[#F4F4F2] p-6 md:p-8">
      <h3 className="btn-heading heading-ul text-center text-black">
        Claim your points
      </h3>
      <p className="btn-text mt-2 text-center text-black/50">
        LD points earned on LitVM convert to Base. LD is burned only after Base confirms.
      </p>

      <div className="mt-auto flex flex-col items-center gap-3 pt-8">
        <div className="rounded-[8px] bg-[#0038FF] px-6 py-3 shadow-lg">
          <p className="btn-text font-bold text-white">
            {litvm.isLoading
              ? "…"
              : litvm.isError
                ? "—"
                : formatPoints(litvm.data?.available ?? 0n)}{" "}
            <span className="text-white/70">LD available</span>
          </p>
        </div>
        {burnPending && (
          <p className="btn-text text-center text-black/50">Syncing burn…</p>
        )}

        <div className="flex w-full items-stretch gap-2">
          <div className="relative flex-1">
            <input
              inputMode="numeric"
              placeholder="Amount"
              value={amount}
              disabled={busy || !address}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))}
              className="btn-text h-full w-full rounded-[8px] border border-black/20 bg-white px-4 py-3 pr-14 text-black outline-none placeholder:text-black/40"
            />
            <button
              type="button"
              disabled={busy || available === null || available === 0n}
              onClick={() => setAmount((available ?? 0n).toString())}
              className="btn-text absolute right-2 top-1/2 -translate-y-1/2 rounded-[6px] px-2 py-1 text-black/50 hover:text-black disabled:opacity-40"
            >
              Max
            </button>
          </div>
          <button
            onClick={() => void handleClaim()}
            disabled={busy || !amountValid || !correctNetwork}
            className="champions-cta champions-cta--auto shrink-0"
          >
            {buttonLabel}
          </button>
        </div>

        {address && !correctNetwork && (
          <p className="btn-text text-center text-black/50">
            Switch to Base Mainnet to claim.
          </p>
        )}
      </div>
    </div>
  );
}
