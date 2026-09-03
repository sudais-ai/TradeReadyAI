import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow the dev server to be reached via the machine's LAN address in
  // addition to localhost. This fixes the "Blocked cross-origin request"
  // error that surfaces as NextAuth's generic "Configuration" error.
  allowedDevOrigins: ["192.168.1.4", "localhost", "127.0.0.1"],
};

export default nextConfig;
