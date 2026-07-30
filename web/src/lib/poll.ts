// Soroban contract calls: read results (simulate) + cast vote (sign & submit).
import {
  Account,
  Address,
  BASE_FEE,
  Contract,
  Keypair,
  Networks,
  TransactionBuilder,
  nativeToScVal,
  scValToNative,
  rpc,
} from "@stellar/stellar-sdk";
import { signTx } from "./wallet";

// Filled in after `stellar contract deploy` (see README). Also settable via env.
export const CONTRACT_ID =
  process.env.NEXT_PUBLIC_CONTRACT_ID ??
  "CCWGZ23DOQLBHQ4S52CKDXREOJ77L4COIL25L6AUMEK5N7DTLZC7PRLI";

// PondoVote's production treasury contract (see ../../web3/docs/deployment-record.md).
// Read-only here: this demo shows the fund pool a budget vote allocates.
export const TREASURY_ID =
  process.env.NEXT_PUBLIC_TREASURY_ID ??
  "CC2Y445ZG6EA5ZQQUCHPVESRCZHA5HW5G4VSCT5I5FIA23S6GC5T4OFX";

const RPC_URL = "https://soroban-testnet.stellar.org";
const server = new rpc.Server(RPC_URL);

export const POLL_QUESTION = "How should the ₱50,000 org fund be spent?";
export const POLL_OPTIONS = [
  {
    label: "IT Week Hackathon",
    amount: "₱50,000",
    blurb: "48-hour campus hackathon: venue, food, and student prize pool.",
  },
  {
    label: "Org Room Computers",
    amount: "₱50,000",
    blurb: "Two workstations for the org room, open to all members.",
  },
  {
    label: "Student Welfare Fund",
    amount: "₱50,000",
    blurb: "Emergency assistance grants for members in financial need.",
  },
];

/** Simulate a read-only call and return the native decoded result. */
async function simulateRead(contractId: string, method: string) {
  const contract = new Contract(contractId);
  // Any valid, well-formed address works as a simulation source — it is never submitted.
  const source = new Account(Keypair.random().publicKey(), "0");
  const tx = new TransactionBuilder(source, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(contract.call(method))
    .setTimeout(30)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) {
    throw new Error(sim.error);
  }
  const scv = sim.result?.retval;
  return scv ? scValToNative(scv) : undefined;
}

/** Read-only: simulate `get_results`, no wallet needed. Returns counts per option. */
export async function getResults(): Promise<number[]> {
  const native = await simulateRead(CONTRACT_ID, "get_results");
  if (!native) return [];
  return (native as (number | bigint)[]).map(Number);
}

/**
 * Read-only: PondoVote treasury balance in stroops. `null` on any failure —
 * testnet resets quarterly, so a missing treasury must not break the poll UI.
 */
export async function getTreasuryBalance(): Promise<bigint | null> {
  try {
    const native = await simulateRead(TREASURY_ID, "get_balance");
    return native === undefined ? null : BigInt(native as bigint | number);
  } catch {
    return null;
  }
}

export type VoteEvent = {
  voter: string;
  option: number;
  ledger: number;
  txHash: string;
};

/** Latest ledger sequence — cursor seed for `getVoteEvents`. */
export async function getLatestLedger(): Promise<number> {
  return (await server.getLatestLedger()).sequence;
}

/**
 * Event listening: contract `vote` events from `startLedger` onwards.
 * Topics are `(Symbol("vote"), voter)`, data is the chosen option (u32).
 */
export async function getVoteEvents(
  startLedger: number,
): Promise<{ events: VoteEvent[]; nextLedger: number }> {
  const res = await server.getEvents({
    startLedger,
    filters: [
      {
        type: "contract",
        contractIds: [CONTRACT_ID],
        topics: [[nativeToScVal("vote", { type: "symbol" }).toXDR("base64"), "*"]],
      },
    ],
  });

  const events = res.events.map((e) => ({
    voter: scValToNative(e.topic[1]) as string,
    option: Number(scValToNative(e.value)),
    ledger: e.ledger,
    txHash: e.txHash,
  }));
  // `latestLedger` is inclusive, so resume from the next one to avoid re-reading.
  return { events, nextLedger: res.latestLedger + 1 };
}

/** Sign & submit a `vote`. Returns the transaction hash. Throws on rejection/failure. */
export async function vote(address: string, option: number): Promise<string> {
  const contract = new Contract(CONTRACT_ID);
  const account = await server.getAccount(address); // real sequence

  const op = contract.call(
    "vote",
    new Address(address).toScVal(),
    nativeToScVal(option, { type: "u32" }),
  );
  const built = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(op)
    .setTimeout(30)
    .build();

  // Assemble Soroban footprint + resource fees.
  const prepared = await server.prepareTransaction(built);

  const signedXdr = await signTx(prepared.toXDR(), address);
  const signed = TransactionBuilder.fromXDR(signedXdr, Networks.TESTNET);

  const sent = await server.sendTransaction(signed);
  if (sent.status === "ERROR") {
    // errorResult carries the real reason (e.g. txInsufficientBalance).
    throw new Error(
      `TX_SUBMIT_FAILED ${sent.errorResult?.result().switch().name ?? ""}`.trim(),
    );
  }

  // Poll until final.
  let result = await server.getTransaction(sent.hash);
  for (let i = 0; i < 15 && result.status === "NOT_FOUND"; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    result = await server.getTransaction(sent.hash);
  }
  if (result.status !== "SUCCESS") {
    throw new Error(`TX_${result.status}`);
  }
  return sent.hash;
}
