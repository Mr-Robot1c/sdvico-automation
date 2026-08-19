/** @type {import('next').NextConfig} */
const nextConfig = {
  // Không tự 308 redirect /privacy/ -> /privacy: TikTok verifier gọi đúng URL đã đăng ký (có "/"
  // cuối) và KHÔNG follow redirect -> "no signature". Middleware bên dưới rewrite /privacy/ tới
  // /privacy để cùng trả HTML kèm meta trong <head>. Không đổi UX cho người dùng thường (Next chỉ
  // bỏ auto-redirect; link nội bộ vẫn không dấu "/" cuối).
  skipTrailingSlashRedirect: true,

  // Native binary (.node / ffmpeg) — để Next require lúc chạy, không nhồi vào bundle webpack.
  // Ghép logo dùng @napi-rs/canvas (external, tự trace như banner) + logo nhúng base64, không cần
  // trace thêm sharp/asset nữa.
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
