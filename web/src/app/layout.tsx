import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Stellar Live Poll — Yellow Belt",
  description: "On-chain live poll on Stellar testnet. Multi-wallet, Soroban contract, real-time results.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
