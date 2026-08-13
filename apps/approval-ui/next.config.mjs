/** @type {import('next').NextConfig} */
const nextConfig = {
  // Native binary (.node / ffmpeg) — để Next require lúc chạy, không nhồi vào bundle webpack.
  experimental: {
    serverComponentsExternalPackages: ['@napi-rs/canvas', '@ffmpeg-installer/ffmpeg'],
    // Nhét binary ffmpeg (@ffmpeg-installer, có sẵn trong npm) vào function của Duyệt (/) và
    // test-post để chuẩn hóa video TikTok. Glob ** để bắt đúng gói theo nền tảng (linux-x64 trên Vercel).
    outputFileTracingIncludes: {
      '/': ['./node_modules/@ffmpeg-installer/**'],
      '/api/tiktok/test-post': ['./node_modules/@ffmpeg-installer/**']
    }
  }
};

export default nextConfig;
