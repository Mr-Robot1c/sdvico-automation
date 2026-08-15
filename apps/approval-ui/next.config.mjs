/** @type {import('next').NextConfig} */
const nextConfig = {
  // Đưa file font (dùng cho poster satori) vào bundle serverless trên Vercel.
  // Next 14 đọc khóa này trong experimental. Đặt ở ngoài thì Next báo
  // "Unrecognized key" rồi bỏ qua, hàm serverless thiếu font và poster lỗi ENOENT.
  // Lên Next 15 thì chuyển ngược ra ngoài.
  experimental: {
    outputFileTracingIncludes: {
      '/api/cron/compose': ['./assets/fonts/**'],
      '/api/cron/publish': ['./assets/fonts/**'],
      '/api/poster-preview': ['./assets/fonts/**'],
      '/tao-jd': ['./assets/fonts/**'],
      '/dang-tin': ['./assets/fonts/**'],
      '/vi-tri': ['./assets/fonts/**'],
      '/': ['./assets/fonts/**'],
    },
  },
};

export default nextConfig;
