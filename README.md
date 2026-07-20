# ⭐ Stellar Live Poll — Yellow Belt (Level 2)

A multi-wallet dApp on **Stellar Testnet**. One on-chain poll: connect any Stellar wallet, cast a
vote through a **Soroban smart contract**, and watch results update in real time.

Built for the Risein *Stellar: Journey to Mastery* **Level 2 / Yellow Belt** challenge.

## Requirements coverage

| Requirement | How it's met |
| --- | --- |
| Multi-wallet integration | `StellarWalletsKit` modal — Freighter, xBull, Albedo, Lobstr, … (`web/src/lib/wallet.ts`) |
| 3 error types handled | Wallet not found · signature rejected · insufficient balance (`web/src/app/page.tsx`, `classifyError`) |
| Contract deployed on testnet | `contracts/poll` Soroban contract (address below) |
| Contract called from frontend | `vote()` write + `get_results()` read via Soroban RPC (`web/src/lib/poll.ts`) |
| Transaction status visible | `idle → pending → success/fail` with explorer link |
| Real-time integration | `get_results()` polled every 3s + optimistic update; contract emits `vote` events |

## 📸 Wallet options screenshot

> _Add `screenshots/wallets.png` — the StellarWalletsKit modal showing the available wallets — and it renders here:_

![Wallet options](screenshots/wallets.png)

## 🔗 Deployment info

- **Deployed contract address:** `REPLACE_WITH_DEPLOYED_CONTRACT_ID`
  - Explorer: `https://stellar.expert/explorer/testnet/contract/REPLACE_WITH_DEPLOYED_CONTRACT_ID`
- **Sample vote transaction hash:** `REPLACE_WITH_TX_HASH`
  - Explorer: `https://stellar.expert/explorer/testnet/tx/REPLACE_WITH_TX_HASH`
- **Live demo:** _(optional — add Vercel/Netlify URL)_

## Stack

Next.js 16 · React 19 · TypeScript · Tailwind v4 · `@stellar/stellar-sdk` · `@creit.tech/stellar-wallets-kit` · Soroban (Rust).

---

## Setup

### 1. Toolchain (one-time)

```bash
# Rust
winget install Rustlang.Rustup           # or download rustup-init.exe
rustup target add wasm32v1-none

# Stellar CLI
winget install --id Stellar.StellarCLI    # or: cargo install --locked stellar-cli

# Fund a deployer identity on testnet
stellar keys generate --global deployer --network testnet --fund
```

### 2. Build, deploy & initialize the contract

```bash
cd contracts/poll
stellar contract build

# Deploy -> prints the CONTRACT_ID
stellar contract deploy \
  --wasm target/wasm32v1-none/release/poll.wasm \
  --source deployer --network testnet

# One-time init: question symbol + number of options (matches the 3 UI options)
stellar contract invoke --id <CONTRACT_ID> \
  --source deployer --network testnet \
  -- init --question usecase --num_options 3
```

Put the printed `CONTRACT_ID` in `web/.env.local`:

```
NEXT_PUBLIC_CONTRACT_ID=<CONTRACT_ID>
```

(or hardcode it in `web/src/lib/poll.ts`), and update the address/tx-hash placeholders above.

### 3. Run the frontend

```bash
cd web
npm install
npm run dev            # http://localhost:3000
```

Connect a wallet (fund it via https://friendbot.stellar.org), vote, and the tally updates live.

## Contract API (`contracts/poll/src/lib.rs`)

- `init(question: Symbol, num_options: u32)` — one-time setup.
- `vote(voter: Address, option: u32)` — `require_auth()`, increments the count, emits a `vote` event.
- `get_results() -> Vec<u32>` — live tally, index = option.
- `get_question() -> Symbol`.

Run the contract tests: `cd contracts/poll && cargo test`.
