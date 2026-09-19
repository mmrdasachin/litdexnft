import { Check, ChevronDown, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { showErrorCard, showSuccess } from "@/lib/feedback";
import { useRefreshAll, waitForTokenStateChange } from "@/champions/hooks/useLitdex";
import { useWallet } from "@/champions/hooks/useWallet";
import {
  API_BASE,
  nftContract,
  parseWalletError,
  type GameCompleteResponse,
  type GameRoundResult,
  type GameStartResponse,
  type OwnedNft,
} from "@/champions/lib/litdex";

const COOLDOWN_SECONDS = 12;

type Phase = "idle" | "playing" | "cooldown" | "settling" | "done";

/** Rarity/level a token lands on after a game settles on-chain. */
export function expectedStateAfterGame(
  nft: { rarity: number; level: number },
  won: boolean,
): { rarity: number; level: number } {
  if (!won) return { rarity: nft.rarity, level: Math.max(1, nft.level - 1) };
  if (!isMaxTier(nft)) return { rarity: nft.rarity, level: nft.level + 1 };
  return { rarity: Math.min(nft.rarity + 1, 3), level: 1 };
}

export function PredictGame({
  nft,
  onPrewarm,
}: {
  nft: OwnedNft;
  onPrewarm?: (expected: { rarity: number; level: number }) => Promise<void>;
}) {
  const { address, getSigner, correctNetwork } = useWallet();
  const refreshAll = useRefreshAll();

  const [phase, setPhase] = useState<Phase>("idle");
  const [session, setSession] = useState<GameStartResponse | null>(null);
  const [guess, setGuess] = useState("");
  const [round, setRound] = useState(0);
  const [lives, setLives] = useState<number | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [result, setResult] = useState<GameCompleteResponse | null>(null);
  const [showVerify, setShowVerify] = useState(false);
  const [busy, setBusy] = useState(false);
  const pending = useRef<string | null>(null);

  useEffect(() => {
    if (phase !== "cooldown") return;
    const id = setInterval(() => {
      setSeconds((s) => {
        if (s <= 1) {
          clearInterval(id);
          setPhase("playing");
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [phase]);

  async function start() {
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/game/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tokenId: nft.tokenId.toString() }),
      });
      const json = (await res.json()) as GameStartResponse & { error?: string };
      if (!res.ok || json.error) throw new Error(json.error ?? "Could not start the game.");
      setSession(json);
      setLives(json.livesRemaining ?? 5);
      setRound(0);
      setResult(null);
      setGuess("");
      setPhase("playing");
    } catch (err) {
      showErrorCard((err as Error).message || "Could not start the game.");
    } finally {
      setBusy(false);
    }
  }

  async function submitGuess() {
    if (!session) return;
    const value = Number(guess);
    if (!Number.isInteger(value) || value < 1 || value > 10) {
      showErrorCard("Pick a whole number between 1 and 10.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/game/guess`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: session.sessionId, guess: value }),
      });
      const json = (await res.json()) as Record<string, unknown> & { error?: string };
      if (res.status === 429) {
        const waitMs = Number(json["waitMs"] ?? COOLDOWN_SECONDS * 1000);
        setSeconds(Math.max(1, Math.ceil(waitMs / 1000)));
        setPhase("cooldown");
        return;
      }
      if (!res.ok || json.error) throw new Error((json.error as string) ?? "Guess failed.");

      if (json["isComplete"]) {
        const complete = json as unknown as GameCompleteResponse;
        setResult(complete);
        setRound(5);
        setPhase("settling");
        setGuess("");
        await settle(complete);
        setPhase("done");
        return;
      }

      setRound(Number(json["roundNumber"] ?? round + 1));
      setLives(Number(json["livesRemaining"] ?? lives ?? 0));
      setGuess("");
      setSeconds(COOLDOWN_SECONDS);
      setPhase("cooldown");
    } catch (err) {
      showErrorCard((err as Error).message || "Guess failed.");
    } finally {
      setBusy(false);
    }
  }

  async function settle(complete: GameCompleteResponse) {
    if (!address) return;
    pending.current = "settle";
    const before = {
      rarity: nft.rarity,
      level: nft.level,
      damaged: nft.damaged,
      gamesAtMaxLevel: nft.gamesAtMaxLevel,
    };
    try {
      const signer = await getSigner();
      const g = complete.gameResult;
      const tx = await nftContract(signer).playPredictGame(
        [BigInt(g.tokenId), g.won, g.nonce, BigInt(g.expiry)],
        complete.signature,
      );
      await tx.wait();
      await onPrewarm?.(expectedStateAfterGame(nft, complete.won));
      await waitForTokenStateChange(nft.tokenId, before);
      await refreshAll();
      showSuccess({ title: complete.won ? "Tier up confirmed" : "Result recorded on-chain", subtitle: "Base Mainnet", rows: [] });
    } catch (err) {
      showErrorCard(parseWalletError(err, "Could not record the result on-chain."));
    } finally {
      pending.current = null;
    }
  }

  const disabled = !correctNetwork || busy || !address;

  return (
    <div className="space-y-3 border-t border-black/10 pt-4">
      <p className="btn-text text-black">Predict the number</p>

      {phase === "idle" && (
        <button
          onClick={() => void start()}
          disabled={disabled}
          className="btn fx-9 btn-pill btn-lime w-full"
        >
          <span className="btn-label">{busy ? "Starting…" : "Play: guess the number"}</span>
        </button>
      )}

      {(phase === "playing" || phase === "cooldown") && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="btn-text text-black/60">Guess {Math.min(round + 1, 5)} of 5</span>
            <span className="btn-text rounded-full bg-[#0038FF] px-3 py-1 text-white">
              {lives ?? 5} lives
            </span>
          </div>

          {phase === "cooldown" ? (
            <p className="btn-text rounded-[1.5rem] bg-[#F4F4F2] p-4 text-center text-black/60">
              Guess submitted, next guess in {seconds}s
            </p>
          ) : (
            <div className="flex gap-2">
              <input
                type="number"
                min={1}
                max={10}
                inputMode="numeric"
                placeholder="1-10"
                value={guess}
                onChange={(e) => setGuess(e.target.value)}
                disabled={disabled}
                className="btn-text w-full rounded-full border border-black/20 bg-white px-4 py-2 text-black outline-none placeholder:text-black/40 focus:border-[#0038FF]"
              />
              <button
                onClick={() => void submitGuess()}
                disabled={disabled || guess === ""}
                className="btn fx-9 btn-pill btn-lime shrink-0"
              >
                <span className="btn-label">{busy ? "…" : "Submit guess"}</span>
              </button>
            </div>
          )}
        </div>
      )}

      {phase === "settling" && (
        <p className="btn-text text-black/60">Confirming the result on-chain…</p>
      )}

      {result && (phase === "settling" || phase === "done") && (
        <div className="space-y-3">
          <div
            className="btn-text rounded-[1.5rem] p-4 text-center text-white"
            style={{ backgroundColor: result.won ? "#0038FF" : "#FF4D4D" }}
          >
            {result.won ? "You won — tier up!" : "You lost — tier down, repair required"}
          </div>

          <div className="grid grid-cols-5 gap-2">
            {result.results.map((r: GameRoundResult) => (
              <div
                key={r.round}
                className="rounded-2xl border border-black/10 bg-white p-2 text-center"
              >
                <p className="btn-text text-black/40">R{r.round}</p>
                <p className="btn-text text-black">{r.guess}</p>
                <p className="btn-text text-black/50">{r.correctNumber}</p>
                {r.correct ? (
                  <Check className="mx-auto size-4 text-[#0038FF]" />
                ) : (
                  <X className="mx-auto size-4 text-[#FF4D4D]" />
                )}
              </div>
            ))}
          </div>

          <p className="btn-text text-black/60">{result.correctCount} of 5 correct</p>

          <div className="rounded-2xl bg-[#F4F4F2] p-3">
            <button
              onClick={() => setShowVerify((v) => !v)}
              className="btn-text flex w-full items-center justify-between text-[#0038FF]"
            >
              Provably fair — verify this round
              <ChevronDown className={`size-4 ${showVerify ? "rotate-180" : ""}`} />
            </button>
            {showVerify && (
              <div className="mt-2 space-y-1">
                <p className="btn-text text-black/60">Drand round: {result.verify.drandRound}</p>
                <a
                  href={result.verify.drandVerifyUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-text text-[#0038FF] hover:underline"
                >
                  Verify the randomness
                </a>
                <p className="btn-text text-black/50">{result.verify.note}</p>
              </div>
            )}
          </div>

          {phase === "done" && (
            <button
              onClick={() => {
                setPhase("idle");
                setResult(null);
                setSession(null);
                setRound(0);
              }}
              className="btn fx-9 btn-pill btn-ghost w-full"
            >
              <span className="btn-label">Close</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function isMaxTier(nft: { rarity: number; level: number }) {
  const caps: Record<number, number> = { 0: 9, 1: 5, 2: 3 };
  if (nft.rarity >= 3) return true;
  const cap = caps[nft.rarity];
  return cap !== undefined && nft.level >= cap;
}
