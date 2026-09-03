/** @type {import('next').NextConfig} */
const nextConfig = {
  // Không tự 308 redirect /privacy/ -> /privacy: TikTok verifier gọi đúng URL đã đăng ký (có "/"
  // cuối) và KHÔNG follow redirect -> "no signature". Middleware bên dưới rewrite /privacy/ tới
  // /privacy để cùng trả HTML kèm meta trong <head>. Không đổi UX cho người dùng thường (Next chỉ
  // bỏ auto-redirect; link nội bộ vẫn không dấu "/" cuối).
  skipTrailingSlashRedirect: true,

  // 3/9 GIẢM EGRESS: ảnh bucket Supabase đi qua máy nén ảnh Vercel (/_next/image) — khách và
  // Facebook kéo webp đúng cỡ từ CDN Vercel, Supabase chỉ bị gọi 1 lần mỗi cỡ. hostname CHỈ
  // nhận wildcard `*` MỘT cấp con (Next.js không cho `**` ở hostname, chỉ pathname) — bản đầu
  // dùng "**.supabase.co" bị Next lặng lẽ không khớp, /_next/image trả 400 (phát hiện lúc
  // verify production 3/9). Cache tối thiểu 31 ngày.
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co', pathname: '/storage/v1/object/public/**' },
    ],
    minimumCacheTTL: 2678400,
  },

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
