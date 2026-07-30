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

export type Connection = { address: string; network: string; onTestnet: boolean };

/**
 * Connects Freighter directly — no picker. The kit calls Freighter's
 * `requestAccess()`, which shows the approval popup the first time this site
 * asks; afterwards Freighter answers silently (revoke under Freighter >
 * Settings > Connected apps to see the prompt again). Reads the network back
 * from the extension so the UI can prove what it is actually talking to.
 */
export async function connectFreighter(): Promise<Connection> {
  const k = getKit();
  k.setWallet(FREIGHTER_ID);
  const { address } = await k.getAddress();
  const { network, networkPassphrase } = await k.getNetwork();
  return { address, network, onTestnet: networkPassphrase === NETWORK_PASSPHRASE };
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
