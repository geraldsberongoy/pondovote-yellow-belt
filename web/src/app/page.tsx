"use client";

import { useCallback, useEffect, useState } from "react";
import { openWalletModal } from "@/lib/wallet";
import { getResults, vote, POLL_QUESTION, POLL_OPTIONS } from "@/lib/poll";

type TxState = "idle" | "pending" | "success" | "fail";

// Map raw wallet/network errors to the 3 required, user-facing error types.
function classifyError(e: unknown): string {
  const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
  if (
    msg.includes("not connected") ||
    msg.includes("not found") ||
    msg.includes("no wallet") ||
    msg.includes("not installed") ||
    msg.includes("modal_closed")
  ) {
    return "Wallet not found — install/select a wallet and connect.";
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
  return `Transaction failed: ${e instanceof Error ? e.message : String(e)}`;
}

export default function Home() {
  const [address, setAddress] = useState<string | null>(null);
  const [results, setResults] = useState<number[]>(POLL_OPTIONS.map(() => 0));
  const [txState, setTxState] = useState<TxState>("idle");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const r = await getResults();
      if (r.length) setResults(r);
    } catch {
      /* contract maybe not deployed yet — leave zeros */
    }
  }, []);

  // Real-time: re-read on-chain results every 3s.
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 3000);
    return () => clearInterval(id);
  }, [refresh]);

  const connect = useCallback(async () => {
    setError(null);
    try {
      setAddress(await openWalletModal());
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
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>⭐ Stellar Live Poll</h1>
        {address ? (
          <button onClick={() => setAddress(null)} style={btnGhost} title={address}>
            {short(address)} · disconnect
          </button>
        ) : (
          <button onClick={connect} style={btnAccent}>
            Connect wallet
          </button>
        )}
      </header>

      <section style={card}>
        <h2 style={{ fontSize: 18, marginBottom: 20 }}>{POLL_QUESTION}</h2>

        {POLL_OPTIONS.map((label, i) => {
          const count = results[i] ?? 0;
          const pct = total ? Math.round((count / total) * 100) : 0;
          return (
            <div key={i} style={{ marginBottom: 14 }}>
              <button
                onClick={() => castVote(i)}
                disabled={txState === "pending"}
                style={{ ...optionBtn, opacity: txState === "pending" ? 0.6 : 1 }}
              >
                <span>{label}</span>
                <span style={{ color: "var(--muted)" }}>{count} · {pct}%</span>
              </button>
              <div style={bar}>
                <div style={{ ...barFill, width: `${pct}%` }} />
              </div>
            </div>
          );
        })}

        <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 8 }}>
          {total} vote{total === 1 ? "" : "s"} · live from testnet
        </p>
      </section>

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
