// Multi-wallet integration via StellarWalletsKit (Freighter, xBull, Albedo, ...).
// Client-only: the kit touches `window`, so we build it lazily.
import {
  StellarWalletsKit,
  WalletNetwork,
  allowAllModules,
  FREIGHTER_ID,
} from "@creit.tech/stellar-wallets-kit";

export const NETWORK_PASSPHRASE = WalletNetwork.TESTNET;

let kit: StellarWalletsKit | null = null;

function getKit(): StellarWalletsKit {
  if (typeof window === "undefined") {
    throw new Error("Wallet kit is only available in the browser");
  }
  if (!kit) {
    kit = new StellarWalletsKit({
      network: WalletNetwork.TESTNET,
      selectedWalletId: FREIGHTER_ID,
      modules: allowAllModules(),
    });
  }
  return kit;
}

/** Opens the wallet-picker modal. Resolves with the connected address. */
export function openWalletModal(): Promise<string> {
  const k = getKit();
  return new Promise((resolve, reject) => {
    k.openModal({
      onWalletSelected: async (option) => {
        try {
          k.setWallet(option.id);
          const { address } = await k.getAddress();
          resolve(address);
        } catch (e) {
          reject(e);
        }
      },
      onClosed: (err) => {
        // Modal dismissed without picking a wallet.
        reject(err ?? new Error("WALLET_MODAL_CLOSED"));
      },
    });
  });
}

/** Signs a transaction XDR with the connected wallet; returns signed XDR. */
export async function signTx(xdr: string, address: string): Promise<string> {
  const k = getKit();
  const { signedTxXdr } = await k.signTransaction(xdr, {
    address,
    networkPassphrase: NETWORK_PASSPHRASE,
  });
  return signedTxXdr;
}
