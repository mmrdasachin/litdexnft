import { ethers } from "ethers";
import { useCallback, useMemo } from "react";
import { useAccount, useChainId, useDisconnect, useSwitchChain } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { BASE_CHAIN_ID } from "@/champions/lib/litdex";

/**
 * Wallet state for the Champions/NFT section.
 *
 * This is intentionally backed by LitDEX's own wagmi + RainbowKit connection
 * (the same one used by the header "connect wallet" button across the rest
 * of the app) instead of talking to window.ethereum directly. That means:
 *   - there is only ONE connect flow on the whole site — the header button.
 *   - this section just reads whatever wallet is already connected there.
 *   - "connect()" here (used by in-page CTAs) opens the same RainbowKit
 *     modal as the header button, it does not create a second connection.
 *
 * The public shape of this hook (address/chainId/correctNetwork/connect/
 * disconnect/switchNetwork/getProvider/getSigner) is kept identical to the
 * original standalone version so none of the ported components (MintCard,
 * NftSection, PointsSection, ManageChampions, NftCard, ClaimModal, etc.)
 * needed to change.
 */
export function useWallet() {
  const { address, isConnected, connector } = useAccount();
  const chainId = useChainId();
  const { disconnectAsync } = useDisconnect();
  const { switchChainAsync, isPending: switching } = useSwitchChain();
  const { openConnectModal, connectModalOpen } = useConnectModal();

  const connect = useCallback(async () => {
    openConnectModal?.();
  }, [openConnectModal]);

  const disconnect = useCallback(() => {
    void disconnectAsync();
  }, [disconnectAsync]);

  const switchNetwork = useCallback(async () => {
    try {
      await switchChainAsync({ chainId: BASE_CHAIN_ID });
    } catch {
      /* user rejected the switch, or wallet doesn't support programmatic switching */
    }
  }, [switchChainAsync]);

  /** Best-effort read-only provider (kept for API compatibility; not used on the hot path). */
  const getProvider = useCallback(() => {
    const eth = (typeof window !== "undefined" ? (window as unknown as { ethereum?: ethers.Eip1193Provider }).ethereum : undefined);
    if (!eth) return null;
    return new ethers.BrowserProvider(eth);
  }, []);

  /**
   * Signer for write calls (mint, claim, level up, transfer...). Resolves the
   * EIP-1193 provider from the ACTIVE wagmi connector rather than assuming
   * window.ethereum, so this works for injected wallets, Coinbase Wallet and
   * WalletConnect sessions alike — whichever the user connected with up top.
   */
  const getSigner = useCallback(async () => {
    if (!connector || !address) throw new Error("No wallet connected");
    const raw = await connector.getProvider();
    const provider = new ethers.BrowserProvider(raw as ethers.Eip1193Provider);
    return provider.getSigner(address);
  }, [connector, address]);

  return useMemo(
    () => ({
      address: isConnected ? (address ?? null) : null,
      chainId: chainId ?? null,
      hasWallet: true,
      connecting: connectModalOpen || switching,
      correctNetwork: isConnected && chainId === BASE_CHAIN_ID,
      connect,
      disconnect,
      switchNetwork,
      getProvider,
      getSigner,
    }),
    [
      address,
      isConnected,
      chainId,
      connectModalOpen,
      switching,
      connect,
      disconnect,
      switchNetwork,
      getProvider,
      getSigner,
    ],
  );
}
