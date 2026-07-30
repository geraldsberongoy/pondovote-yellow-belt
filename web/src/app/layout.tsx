import type { Metadata } from "next";
import { Playfair_Display } from "next/font/google";
import "./globals.css";

const playfair = Playfair_Display({
  subsets: ["latin"],
  weight: ["600"],
  variable: "--font-playfair",
});

export const metadata: Metadata = {
  title: "PondoVote — Live Budget Vote",
  description:
    "Participatory budgeting for student organizations on Stellar. Multi-wallet, Soroban contract, real-time on-chain results.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={playfair.variable}>
      <body>{children}</body>
    </html>
  );
}
