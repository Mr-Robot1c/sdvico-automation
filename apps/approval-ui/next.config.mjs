/** @type {import('next').NextConfig} */
const nextConfig = {
  // Đưa file font (dùng cho poster satori) vào bundle serverless trên Vercel.
  outputFileTracingIncludes: {
    '/api/cron/compose': ['./assets/fonts/**'],
    '/api/cron/publish': ['./assets/fonts/**'],
    '/api/poster-preview': ['./assets/fonts/**'],
    '/tao-jd': ['./assets/fonts/**'],
    '/dang-tin': ['./assets/fonts/**'],
    '/': ['./assets/fonts/**'],
  },
};

export default nextConfig;
