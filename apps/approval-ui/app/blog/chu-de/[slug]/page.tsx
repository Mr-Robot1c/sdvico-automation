import type { Metadata } from 'next';
import { canonicalUrl, siteUrl } from '../../../../lib/seo';
import { PRODUCT_CATALOG } from '../../../../lib/product-catalog';
import TopicHubView, { STORY_TOPIC, topicOf } from '../topic-hub-view';

// 2/10: bo force-dynamic (de revalidate, khach lanh chiu cold-start). Khong dung cookies/headers.
export const revalidate = 600;

// TRANG CHỦ ĐỀ (topic hub) cho SEO, trang 1. Nội dung ở ../topic-hub-view.tsx (dùng chung với
// các trang phân trang /blog/chu-de/<slug>/trang/<n>, đợt C 2/10).

type Props = { params: { slug: string } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = topicOf(params.slug);
  if (!p) return { title: 'Không tìm thấy chủ đề — SDVICO' };
  const url = `${siteUrl()}/blog/chu-de/${p.slug}`;
  const title = `${p.name} — bài viết và kinh nghiệm | SDVICO`;
  return {
    title,
    description: `Tổng hợp bài viết, kinh nghiệm sử dụng và câu chuyện thực tế về ${p.name} cho tàu cá. ${p.short}`,
    openGraph: { title, description: p.short, url, type: 'website', siteName: 'SDVICO' },
    // 2/10: canonical ve ten mien cong ty sdvico.vn (og:url giu trang nay).
    alternates: { canonical: canonicalUrl(`/blog/chu-de/${p.slug}`) }
  };
}

export default function TopicHubPage({ params }: Props) {
  return <TopicHubView slug={params.slug} page={1} />;
}

export function generateStaticParams() {
  return [{ slug: STORY_TOPIC.slug }, ...PRODUCT_CATALOG.map((p) => ({ slug: p.slug }))];
}
