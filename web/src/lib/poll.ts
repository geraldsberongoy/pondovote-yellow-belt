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

const RPC_URL = "https://soroban-testnet.stellar.org";
const server = new rpc.Server(RPC_URL);

export const POLL_QUESTION = "Best Stellar use case?";
export const POLL_OPTIONS = ["Payments", "DeFi", "Tokenization"];

/** Read-only: simulate `get_results`, no wallet needed. Returns counts per option. */
export async function getResults(): Promise<number[]> {
  const contract = new Contract(CONTRACT_ID);
  // Any valid, well-formed address works as a simulation source — it is never submitted.
  const source = new Account(Keypair.random().publicKey(), "0");
  const tx = new TransactionBuilder(source, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(contract.call("get_results"))
    .setTimeout(30)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) {
    throw new Error(sim.error);
  }
  const scv = sim.result?.retval;
  if (!scv) return [];
  return (scValToNative(scv) as (number | bigint)[]).map(Number);
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
    throw new Error("TX_SUBMIT_FAILED");
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
