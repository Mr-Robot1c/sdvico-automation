/** @type {import('next').NextConfig} */
const nextConfig = {
  // Native binary (.node / ffmpeg) — để Next require lúc chạy, không nhồi vào bundle webpack.
  experimental: {
    serverComponentsExternalPackages: ['@napi-rs/canvas', '@ffmpeg-installer/ffmpeg', 'sharp'],
    // Nhét binary ffmpeg (@ffmpeg-installer, có sẵn trong npm) vào function của Duyệt (/) và
    // test-post để chuẩn hóa video TikTok. Glob ** để bắt đúng gói theo nền tảng (linux-x64 trên Vercel).
    outputFileTracingIncludes: {
      // Nhồi binary sharp + logo asset vào function của trang /tu-lieu (bấm Ghép logo) và
      // /api/rotate (auto-logo khi sinh bài).
      '/': ['./node_modules/@ffmpeg-installer/**', './node_modules/sharp/**', './node_modules/@img/**'],
      '/tu-lieu': ['./node_modules/sharp/**', './node_modules/@img/**', './apps/approval-ui/lib/gen/assets/**'],
      '/api/rotate': ['./node_modules/sharp/**', './node_modules/@img/**', './apps/approval-ui/lib/gen/assets/**'],
      '/api/tiktok/test-post': ['./node_modules/@ffmpeg-installer/**']
    }
  }
};

export default nextConfig;
