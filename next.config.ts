import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // nfc-pcsc / @pokusew/pcsclite はネイティブ(.node)バインディングを読み込むため、
  // Turbopack のバンドル対象から外し、Node.js の require に解決を委ねる必要がある。
  serverExternalPackages: ["nfc-pcsc", "@pokusew/pcsclite"],
};

export default nextConfig;
