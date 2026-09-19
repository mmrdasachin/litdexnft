import { useState } from "react";
import { showErrorCard } from "@/lib/feedback";
import { useWallet } from "@/champions/hooks/useWallet";
import { BASE_MAINNET, chainName, parseWalletError } from "@/champions/lib/litdex";

/**
 * Not used by ChampionsDashboard (LitDEX's own header already shows the
 * connected network) — kept for any standalone embed that still wants a
 * manual "switch to Base" affordance.
 */
export function NetworkSwitcher({ tone = "light" }: { tone?: "light" | "dark" }) {
  const { chainId, correctNetwork, switchNetwork, address } = useWallet();
  const [pending, setPending] = useState(false);

  if (!address) return null;

  const handle = async () => {
    setPending(true);
    try {
      await switchNetwork();
    } catch (err) {
      showErrorCard(parseWalletError(err, `Could not switch to ${BASE_MAINNET.chainName}.`));
    } finally {
      setPending(false);
    }
  };

  const labelClass = tone === "dark" ? "text-white/70" : "text-black/60";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className={`text-xs font-semibold ${labelClass}`}>
        Network: {chainName(chainId)}
        {chainId !== null && ` (${chainId})`}
      </span>
      <button
        type="button"
        disabled={correctNetwork || pending}
        onClick={() => void handle()}
        className={`btn fx-9 btn-pill ${correctNetwork ? "btn-lime" : "btn-blue"}`}
      >
        <span className="btn-label">{pending ? "Switching…" : `Switch to ${BASE_MAINNET.chainName}`}</span>
      </button>
    </div>
  );
}
