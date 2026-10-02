import type { Metadata } from 'next';
import { publicBlogUrl, siteUrl } from '../../lib/seo';
import BlogListView from './blog-list-view';

// 2/10 (Thanh: giao dien muot): BO force-dynamic — no DE revalidate nen khach lanh nao cung chiu
// cold-start (do that 12,9 giay). Trang khong dung cookies/headers/searchParams nen cho ISR.
export const revalidate = 300; // 5 phut — bai moi hien nhanh, khong go tay

const SITE_TITLE = 'Bài viết SDVICO — Công nghệ số cho tàu cá';
const SITE_DESC = 'Kinh nghiệm sử dụng thiết bị tàu cá, mẹo tiết kiệm dầu, nước ngọt ngoài khơi và câu chuyện thực tế của ngư dân do SDVICO chia sẻ.';

export const metadata: Metadata = {
  title: SITE_TITLE,
  description: SITE_DESC,
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESC,
    type: 'website',
    url: `${siteUrl()}/blog`,
    siteName: 'SDVICO'
  },
  // 7/9: canonical -> sdvico.vn/blog (og:url giữ trang này, xem lib/seo.ts publicBlogBase).
  alternates: { canonical: publicBlogUrl() }
};

// Trang 1 của danh sách bài (18 bài). Các trang sau ở /blog/trang/[n] (đợt C 2/10), cùng
// BlogListView. Không dùng searchParams để giữ ISR.
export default function BlogListPage() {
  return <BlogListView page={1} />;
}
