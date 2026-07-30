import type { NextConfig } from "next";

// GitHub Pages serves the site from /<repo>, so the asset paths need that prefix.
// Set BASE_PATH in CI; local `npm run dev` leaves it empty.
const basePath = process.env.BASE_PATH ?? "";

const nextConfig: NextConfig = {
  // The whole app is client-side (wallet + Soroban RPC in the browser), so a
  // static export is enough — no server needed to host it.
  output: "export",
  basePath,
  images: { unoptimized: true },
};

export default nextConfig;
