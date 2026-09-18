import { useState } from "react";
import { LevelCard } from "@/champions/components/LevelCard";
import { ManageChampions } from "@/champions/components/ManageChampions";
import { MintCard } from "@/champions/components/MintCard";
import { NftSection } from "@/champions/components/NftSection";
import { PointsSection } from "@/champions/components/PointsSection";
import { useWallet } from "@/champions/hooks/useWallet";

type Tab = "champions" | "points" | "levels";

const TABS: { id: Tab; label: string }[] = [
  { id: "champions", label: "Champions" },
  { id: "points", label: "My Points" },
  { id: "levels", label: "Levels" },
];

function ConnectPrompt() {
  const { connect, connecting } = useWallet();
  return (
    <div className="champions-empty rounded-[2rem] border-2 border-dashed p-10 text-center">
      <p className="btn-text">Connect your wallet to view this section</p>
      <button
        onClick={() => void connect()}
        disabled={connecting}
        className="btn fx-9 btn-pill btn-lime mt-6"
      >
        <span className="btn-label">{connecting ? "Connecting…" : "Connect wallet"}</span>
      </button>
    </div>
  );
}

export function ChampionsDashboard() {
  const { address, correctNetwork, switchNetwork } = useWallet();
  const [tab, setTab] = useState<Tab>("champions");

  return (
    <div className="champions-root rounded-[8px]">
      <div className="mx-auto w-full max-w-[1600px]">
        {/* Wrong-network nudge — single wallet, same one connected in the header */}
        {address && !correctNetwork && (
          <button
            onClick={() => void switchNetwork()}
            className="btn fx-9 btn-pill btn-blue mb-6 w-full"
          >
            <span className="btn-label">switch to base</span>
          </button>
        )}

        {/* Mint is always the first thing under "Trade your champions" — no tab for it */}
        <MintCard />

        {/* Tabs for everything else */}
        <div className="mt-10 mb-6 flex flex-wrap justify-center gap-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`btn fx-9 btn-pill ${tab === t.id ? "btn-lime" : "btn-ghost"}`}
            >
              <span className="btn-label">{t.label}</span>
            </button>
          ))}
        </div>

        <div className="champions-panel rounded-[8px] p-4 md:p-8">
          {tab === "champions" &&
            (address ? (
              <NftSection onManage={() => setTab("levels")} />
            ) : (
              <ConnectPrompt />
            ))}

          {tab === "points" &&
            (address ? (
              <div className="grid gap-6 md:grid-cols-2">
                <PointsSection />
                <LevelCard />
              </div>
            ) : (
              <ConnectPrompt />
            ))}

          {tab === "levels" &&
            (address ? (
              <ManageChampions onBack={() => setTab("champions")} />
            ) : (
              <ConnectPrompt />
            ))}
        </div>
      </div>
    </div>
  );
}
