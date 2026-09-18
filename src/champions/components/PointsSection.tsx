import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useRefreshAll } from "@/champions/hooks/useLitdex";
import { useWallet } from "@/champions/hooks/useWallet";
import { API_BASE, formatPoints, parseWalletError, pointsContract } from "@/champions/lib/litdex";
import { showError, showSuccess } from "@/lib/feedback";

type ClaimStep = "idle" | "burning" | "signing" | "confirming";

/**
 * Claiming happens inline — an amount field sits next to a compact Claim
 * button, so there is no second dialog on top of the page. Success is
 * reported through LitDEX's own SuccessCard (the same popup a swap uses)
 * instead of a toast, so the NFT section matches the rest of the site.
 */
export function PointsSection() {
  const { address, getSigner, correctNetwork } = useWallet();
  const refreshAll = useRefreshAll();
  const [amount, setAmount] = useState("");
  const [step, setStep] = useState<ClaimStep>("idle");

  const litvm = useQuery({
    queryKey: ["litvmBalance", address],
    enabled: !!address,
    refetchInterval: 20000,
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/points/balance/${address}`);
      if (!res.ok) throw new Error("Could not load LitVM balance");
      return (await res.json()) as { litvmAvailable: string; baseBalance: string };
    },
  });

  const available = litvm.data ? BigInt(litvm.data.litvmAvailable || "0") : null;
  const busy = step !== "idle";

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
    setStep("burning");
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
        showError(body?.error || body?.message || "Claim request failed. Try again.");
        setStep("idle");
        return;
      }

      setStep("signing");
      const signer = await getSigner();
      const tx = await pointsContract(signer).claim(body.totalEarned, body.expiry, body.signature);
      setStep("confirming");
      const receipt = await tx.wait();
      await refreshAll();

      const claimed = amount.trim();
      setAmount("");
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
      showError(parseWalletError(err, "Claim failed, try again."));
    } finally {
      setStep("idle");
    }
  }

  const buttonLabel =
    step === "burning"
      ? "Burning…"
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
        Points earned on LitVM convert to Base.
      </p>

      <div className="mt-auto flex flex-col items-center gap-3 pt-8">
        <div className="rounded-[8px] bg-[#0038FF] px-6 py-3 shadow-lg">
          <p className="btn-text font-bold text-white">
            {litvm.isLoading
              ? "…"
              : litvm.isError
                ? "—"
                : formatPoints(litvm.data?.litvmAvailable ?? "0")}{" "}
            <span className="text-white/70">LitVM available</span>
          </p>
        </div>

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
