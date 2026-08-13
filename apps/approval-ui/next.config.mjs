/** @type {import('next').NextConfig} */
const nextConfig = {
  // Native binary (.node / ffmpeg) — để Next require lúc chạy, không nhồi vào bundle webpack.
  experimental: {
    serverComponentsExternalPackages: ['@napi-rs/canvas', 'ffmpeg-static'],
    // Nhét binary ffmpeg vào function của Duyệt (/) và test-post để chuẩn hóa video TikTok.
    outputFileTracingIncludes: {
      '/': ['./node_modules/ffmpeg-static/ffmpeg'],
      '/api/tiktok/test-post': ['./node_modules/ffmpeg-static/ffmpeg']
    }
  }
};

export default nextConfig;
