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
        className="champions-cta champions-cta--auto mt-6"
      >
        {connecting ? "Connecting…" : "Connect wallet"}
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
            className="champions-cta mb-6"
          >
            switch to base
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
              className="champions-tab"
              data-active={tab === t.id}
            >
              {t.label}
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
