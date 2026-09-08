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

  // Native binary (.node) — để Next require lúc chạy, không nhồi vào bundle webpack.
  // Ghép logo dùng @napi-rs/canvas (external, tự trace như banner) + logo nhúng base64.
  experimental: {
    serverComponentsExternalPackages: ['@napi-rs/canvas'],
    // 8/9 GIẢM FUNCTIONS STORAGE (Vercel báo team a-644f hết 10 GB): trước đây
    // outputFileTracingIncludes nhét binary ffmpeg linux (~68 MB, nén ~23 MB) vào MỌI function
    // -> mỗi bản deploy ~37 MB, 320 bản trong 18 ngày ~ 12 GB. Đường đăng TikTok qua API đã
    // BỎ từ 26/8 (xuất tay), normalizeVideo đã có fallback file gốc, nên KHÔNG đóng gói ffmpeg
    // nữa. Loại hẳn @ffmpeg-installer khỏi trace ở mọi route (node_modules nằm ở gốc monorepo
    // nên liệt kê cả 3 đường). Muốn có lại ffmpeg trên Vercel: đặt FFMPEG_PATH hoặc tải binary
    // lúc chạy, KHÔNG bật lại outputFileTracingIncludes.
    outputFileTracingExcludes: {
      '*': [
        './node_modules/@ffmpeg-installer/**',
        '../../node_modules/@ffmpeg-installer/**',
        '**/node_modules/@ffmpeg-installer/**'
      ]
    }
  }
};

export default nextConfig;
