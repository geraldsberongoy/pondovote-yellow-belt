"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { connectFreighter, openWalletModal } from "@/lib/wallet";
import {
  getResults,
  getTreasuryBalance,
  getLatestLedger,
  getVoteEvents,
  vote,
  POLL_QUESTION,
  POLL_OPTIONS,
  type VoteEvent,
} from "@/lib/poll";

type TxState = "idle" | "pending" | "success" | "fail";

/**
 * Pull a readable message out of anything a wallet or the RPC can reject with.
 * Wallets reject with plain objects (`{error: {code, message}}`), so `String(e)`
 * alone yields "[object Object]" and hides the real cause.
 */
function errorText(e: unknown): string {
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object") {
    const o = e as Record<string, unknown>;
    for (const k of ["message", "error", "reason", "details", "msg"]) {
      const v = o[k];
      if (typeof v === "string" && v) return v;
      if (v && typeof v === "object") return errorText(v); // e.g. { error: { message } }
    }
    try {
      const json = JSON.stringify(e);
      if (json && json !== "{}") return json;
    } catch {
      /* circular — fall through */
    }
  }
  return String(e);
}

// Map raw wallet/network errors to the 3 required, user-facing error types.
function classifyError(e: unknown): string {
  console.error("wallet/contract error:", e); // raw object, for debugging
  const raw = errorText(e);
  const msg = raw.toLowerCase();
  // Wallet strings only — bare "not found" would swallow "account not found"
  // (unfunded account) and TX_NOT_FOUND, which belong to the funds branch below.
  if (
    msg.includes("not connected") ||
    msg.includes("wallet not found") ||
    msg.includes("no wallet") ||
    msg.includes("not installed") ||
    msg.includes("not available") ||
    msg.includes("not detected") ||
    msg.includes("modal_closed")
  ) {
    return "Wallet not found — install Freighter (or pick another wallet) and connect.";
  }
  if (msg.includes("reject") || msg.includes("declined") || msg.includes("denied")) {
    return "Signature rejected in your wallet.";
  }
  if (
    msg.includes("insufficient") ||
    msg.includes("underfunded") ||
    msg.includes("not enough") ||
    msg.includes("account not found") ||
    msg.includes("404")
  ) {
    return "Insufficient balance — fund your testnet account at friendbot.stellar.org.";
  }
  return `Transaction failed: ${raw}`;
}

export default function Home() {
  const [address, setAddress] = useState<string | null>(null);
  const [results, setResults] = useState<number[]>(POLL_OPTIONS.map(() => 0));
  const [txState, setTxState] = useState<TxState>("idle");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [network, setNetwork] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [treasury, setTreasury] = useState<bigint | null>(null);
  const [feed, setFeed] = useState<VoteEvent[]>([]);
  const cursor = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const r = await getResults();
      if (r.length) setResults(r);
    } catch {
      /* contract maybe not deployed yet — leave zeros */
    }
  }, []);

  // Real-time: re-read on-chain results + drain new `vote` events every 3s.
  useEffect(() => {
    let live = true;

    const tick = async () => {
      await refresh();
      try {
        if (cursor.current === null) {
          // Seed from ~1 minute back (5s ledgers) so the feed is not empty on load.
          cursor.current = Math.max(1, (await getLatestLedger()) - 12);
        }
        const { events, nextLedger } = await getVoteEvents(cursor.current);
        cursor.current = nextLedger;
        if (live && events.length) {
          setFeed((prev) => [...events.reverse(), ...prev].slice(0, 8));
        }
      } catch {
        /* RPC event window may lag or expire — feed is decorative, tally is truth */
      }
    };

    tick();
    const id = setInterval(tick, 3000);
    getTreasuryBalance().then((b) => live && setTreasury(b));
    return () => {
      live = false;
      clearInterval(id);
    };
  }, [refresh]);

  // Primary path: straight into Freighter. The picker stays available as a fallback.
  const connect = useCallback(async () => {
    setError(null);
    setConnecting(true);
    try {
      const c = await connectFreighter();
      setAddress(c.address);
      setNetwork(c.network);
      if (!c.onTestnet) {
        setError(`Freighter is on ${c.network} — switch it to TESTNET before voting.`);
      }
    } catch (e) {
      setError(classifyError(e));
    } finally {
      setConnecting(false);
    }
  }, []);

  const connectOther = useCallback(async () => {
    setError(null);
    try {
      setAddress(await openWalletModal());
      setNetwork(null);
    } catch (e) {
      setError(classifyError(e));
    }
  }, []);

  const castVote = useCallback(
    async (option: number) => {
      setError(null);
      setTxHash(null);
      if (!address) {
        setError("Wallet not found — connect a wallet first.");
        return;
      }
      setTxState("pending");
      // Optimistic bump; reconciled by the 3s poll.
      setResults((prev) => prev.map((c, i) => (i === option ? c + 1 : c)));
      try {
        const hash = await vote(address, option);
        setTxHash(hash);
        setTxState("success");
        refresh();
      } catch (e) {
        setTxState("fail");
        setError(classifyError(e));
        refresh(); // undo optimistic bump from truth
      }
    },
    [address, refresh],
  );

  const total = results.reduce((a, b) => a + b, 0);
  const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

  return (
    <main style={{ maxWidth: 560, margin: "0 auto", padding: "48px 20px" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <div>
          <h1 className="serif" style={{ fontSize: 24, fontWeight: 600 }}>
            PondoVote
          </h1>
          <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 4 }}>Live Budget Vote</p>
        </div>
        {address ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
            <span style={{ ...badge, borderColor: network && !error ? "var(--ok)" : "var(--border)" }}>
              <span style={{ color: "var(--ok)" }}>●</span> Connected
              {network ? ` · Freighter · ${network}` : ""}
            </span>
            <button
              onClick={() => {
                setAddress(null);
                setNetwork(null);
              }}
              style={{ ...btnGhost, border: "none", padding: 0, fontSize: 12 }}
              title={address}
            >
              {short(address)} · disconnect
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
            <button onClick={connect} disabled={connecting} style={{ ...btnAccent, opacity: connecting ? 0.6 : 1 }}>
              {connecting ? "Check Freighter…" : "Connect Freighter"}
            </button>
            <button
              onClick={connectOther}
              style={{ ...btnGhost, border: "none", padding: 0, fontSize: 12 }}
            >
              use another wallet
            </button>
          </div>
        )}
      </header>

      <p style={{ color: "var(--muted)", fontSize: 14, lineHeight: 1.6, marginBottom: 24, maxWidth: "60ch" }}>
        Student org fees form a public treasury. Members vote on how it is spent — not on who spends
        it. Every vote is an immutable Soroban contract call on Stellar testnet.
      </p>

      <section style={card}>
        <h2 className="serif" style={{ fontSize: 19, marginBottom: 20 }}>{POLL_QUESTION}</h2>

        {POLL_OPTIONS.map((opt, i) => {
          const count = results[i] ?? 0;
          const pct = total ? Math.round((count / total) * 100) : 0;
          return (
            <div key={i} style={{ marginBottom: 18 }}>
              <button
                onClick={() => castVote(i)}
                disabled={txState === "pending"}
                style={{ ...optionBtn, opacity: txState === "pending" ? 0.6 : 1 }}
              >
                <span style={{ display: "flex", flexDirection: "column", gap: 4, textAlign: "left" }}>
                  <span>
                    {opt.label}{" "}
                    <span style={{ color: "var(--muted)", fontSize: 13 }}>· {opt.amount}</span>
                  </span>
                  <span style={{ color: "var(--muted)", fontSize: 12.5, lineHeight: 1.5 }}>
                    {opt.blurb}
                  </span>
                </span>
                <span style={{ color: "var(--muted)", whiteSpace: "nowrap" }}>{count} · {pct}%</span>
              </button>
              <div style={bar}>
                <div style={{ ...barFill, width: `${pct}%` }} />
              </div>
            </div>
          );
        })}

        <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 8 }}>
          {total} vote{total === 1 ? "" : "s"} · live from testnet
          {treasury !== null && (
            <> · treasury {(Number(treasury) / 1e7).toLocaleString()} XLM</>
          )}
        </p>
      </section>

      {/* Event listening: contract `vote` events streamed from Soroban RPC. */}
      {feed.length > 0 && (
        <section style={{ ...card, marginTop: 16 }}>
          <h3 style={{ fontSize: 13, color: "var(--muted)", marginBottom: 12, letterSpacing: ".04em" }}>
            LIVE ON-CHAIN ACTIVITY
          </h3>
          {feed.map((e) => (
            <p key={`${e.txHash}-${e.ledger}`} style={{ fontSize: 13, marginBottom: 8 }}>
              <a
                href={`https://stellar.expert/explorer/testnet/tx/${e.txHash}`}
                target="_blank"
                rel="noreferrer"
                style={{ color: "var(--muted)", textDecoration: "none" }}
              >
                {short(e.voter)}
              </a>{" "}
              funded <strong>{POLL_OPTIONS[e.option]?.label ?? `option ${e.option}`}</strong>
              <span style={{ color: "var(--muted)" }}> · ledger {e.ledger}</span>
            </p>
          ))}
        </section>
      )}

      {/* Transaction status */}
      {txState !== "idle" && (
        <div style={{ ...card, marginTop: 16, fontSize: 14 }}>
          {txState === "pending" && <span>⏳ Submitting vote to the network…</span>}
          {txState === "success" && (
            <span style={{ color: "var(--ok)" }}>
              ✅ Vote confirmed.{" "}
              {txHash && (
                <a
                  href={`https://stellar.expert/explorer/testnet/tx/${txHash}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: "var(--accent)", textDecoration: "underline" }}
                >
                  View on explorer
                </a>
              )}
            </span>
          )}
          {txState === "fail" && <span style={{ color: "var(--err)" }}>❌ Vote failed.</span>}
        </div>
      )}

      {error && (
        <div style={{ ...card, marginTop: 12, color: "var(--err)", fontSize: 14 }}>{error}</div>
      )}

      <footer style={{ color: "var(--muted)", fontSize: 12, marginTop: 32, lineHeight: 1.6 }}>
        Votes are immutable once confirmed on Stellar testnet. In full PondoVote, the winning
        proposal is disbursed automatically from the on-chain treasury.
      </footer>
    </main>
  );
}

const card: React.CSSProperties = {
  background: "var(--panel)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: 20,
};
const btnAccent: React.CSSProperties = {
  background: "var(--accent)",
  color: "var(--accent-fg)",
  border: "none",
  borderRadius: 6,
  padding: "8px 14px",
  fontWeight: 600,
  cursor: "pointer",
};
const badge: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  border: "1px solid var(--border)",
  borderRadius: 999,
  padding: "5px 10px",
  fontSize: 12,
  color: "var(--muted)",
  whiteSpace: "nowrap",
};
const btnGhost: React.CSSProperties = {
  background: "transparent",
  color: "var(--muted)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  padding: "8px 12px",
  cursor: "pointer",
  fontSize: 13,
};
const optionBtn: React.CSSProperties = {
  width: "100%",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  textAlign: "left",
  background: "var(--bg)",
  color: "var(--text)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  padding: "12px 14px",
  cursor: "pointer",
  fontSize: 15,
};
const bar: React.CSSProperties = {
  height: 6,
  background: "var(--bg)",
  borderRadius: 4,
  marginTop: 6,
  overflow: "hidden",
};
const barFill: React.CSSProperties = {
  height: "100%",
  background: "var(--accent)",
  transition: "width .4s ease",
};
