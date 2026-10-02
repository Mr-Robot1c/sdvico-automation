import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getPublicClient } from '../../../../lib/supabase-server';
import { loadPublicPosts, siteUrl } from '../../../../lib/seo';
import BlogListView from '../../blog-list-view';
import { pageCountOf, parsePageParam } from '../../pager';

// Trang 2 trở đi của danh sách bài (đợt C 2/10). Server render + ISR như /blog, không cookies,
// headers hay searchParams.
export const revalidate = 300;

type Props = { params: { n: string } };

// Dựng sẵn các trang 2..N theo số bài hiện có; lỗi mạng lúc build thì trả rỗng (trang vẫn được
// dựng ở lượt xem đầu rồi lưu cache).
export async function generateStaticParams() {
  try {
    const posts = await loadPublicPosts(getPublicClient(), 500);
    const pages = pageCountOf(posts.length);
    const out: { n: string }[] = [];
    for (let i = 2; i <= pages; i++) out.push({ n: String(i) });
    return out;
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = parsePageParam(params.n);
  if (!page || page < 2) return { title: 'Bài viết SDVICO' };
  const title = `Bài viết SDVICO, trang ${page}`;
  const url = `${siteUrl()}/blog/trang/${page}`;
  return {
    title,
    description: 'Kinh nghiệm sử dụng thiết bị tàu cá, mẹo tiết kiệm dầu, nước ngọt ngoài khơi và câu chuyện thực tế của ngư dân do SDVICO chia sẻ.',
    openGraph: { title, url, type: 'website', siteName: 'SDVICO' },
    // sdvico.vn (SPA của anh Thành) không có đường dẫn /blog/trang/N nên canonical tự trỏ trang
    // này, còn trang 1 canonical về sdvico.vn/blog. noindex để không nhân bản danh sách trên hai
    // tên miền; follow để Google vẫn lần theo link sang từng bài (canonical về sdvico.vn).
    alternates: { canonical: url },
    robots: { index: false, follow: true }
  };
}

export default function BlogListPageN({ params }: Props) {
  const page = parsePageParam(params.n);
  if (!page) notFound();
  if (page === 1) redirect('/blog');
  return <BlogListView page={page} />;
}
