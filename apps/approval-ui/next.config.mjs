/** @type {import('next').NextConfig} */
const nextConfig = {
  // @napi-rs/canvas là native binary (.node) — để Next require lúc chạy, không nhồi vào bundle webpack.
  experimental: {
    serverComponentsExternalPackages: ['@napi-rs/canvas']
  }
};

export default nextConfig;
