import { useState } from "react";
import { LevelCard } from "@/champions/components/LevelCard";
import { ManageChampions } from "@/champions/components/ManageChampions";
import { MintCard } from "@/champions/components/MintCard";
import { NftSection } from "@/champions/components/NftSection";
import { PointsSection } from "@/champions/components/PointsSection";
import { useWallet } from "@/champions/hooks/useWallet";

type Tab = "champions" | "points" | "levels" | "mint";

const TABS: { id: Tab; label: string }[] = [
  { id: "champions", label: "Champions" },
  { id: "points", label: "My Points" },
  { id: "levels", label: "Levels" },
  { id: "mint", label: "Mint" },
];

function ConnectPrompt() {
  const { connect, connecting } = useWallet();
  return (
    <div className="rounded-[2rem] border-2 border-dashed border-black/15 bg-[#F4F4F2] p-10 text-center">
      <p className="btn-text text-black">Connect your wallet to view this section</p>
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
    <div className="champions-root rounded-[2rem] px-4 py-10 md:px-8 md:py-12">
      <div className="mx-auto w-full max-w-[1600px]">
        {/* Tab bar */}
        <div className="mb-8 flex flex-wrap justify-center gap-2">
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

        {/* Wrong-network nudge (single wallet — same one connected up top) */}
        {address && !correctNetwork && (
          <button
            onClick={() => void switchNetwork()}
            className="btn fx-9 btn-pill btn-blue mb-8 w-full"
          >
            <span className="btn-label">switch to base</span>
          </button>
        )}

        {/* Tab content */}
        <div className="rounded-[2rem] bg-white p-4 md:p-8">
          {tab === "mint" && <MintCard />}

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
