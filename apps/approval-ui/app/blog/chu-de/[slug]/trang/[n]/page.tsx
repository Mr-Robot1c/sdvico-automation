import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { siteUrl } from '../../../../../../lib/seo';
import { PRODUCT_CATALOG } from '../../../../../../lib/product-catalog';
import TopicHubView, { STORY_TOPIC, loadTopicPosts, topicOf } from '../../../topic-hub-view';
import { pageCountOf, parsePageParam } from '../../../../pager';

// Trang 2 trở đi của trang chủ đề (đợt C 2/10). Server render + ISR, không cookies/headers.
export const revalidate = 600;

type Props = { params: { slug: string; n: string } };

export async function generateStaticParams() {
  const out: { slug: string; n: string }[] = [];
  try {
    for (const slug of [STORY_TOPIC.slug, ...PRODUCT_CATALOG.map((p) => p.slug)]) {
      const pages = pageCountOf(((await loadTopicPosts(slug)) || []).length);
      for (let i = 2; i <= pages; i++) out.push({ slug, n: String(i) });
    }
  } catch {
    return out;
  }
  return out;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = topicOf(params.slug);
  const page = parsePageParam(params.n);
  if (!p || !page || page < 2) return { title: 'Không tìm thấy chủ đề | SDVICO' };
  const title = `${p.name}, trang ${page} | SDVICO`;
  const url = `${siteUrl()}/blog/chu-de/${p.slug}/trang/${page}`;
  return {
    title,
    description: p.short,
    openGraph: { title, url, type: 'website', siteName: 'SDVICO' },
    // Giống /blog/trang/N: canonical SELF (cùng trang 1 chủ đề, 2/10 audit lần 3: sdvico.vn là SPA
    // trả cùng 1 shell cho mọi đường dẫn, xem lib/seo.ts selfCanonicalUrl), noindex + follow.
    alternates: { canonical: url },
    robots: { index: false, follow: true }
  };
}

export default function TopicHubPageN({ params }: Props) {
  const page = parsePageParam(params.n);
  if (!page || !topicOf(params.slug)) notFound();
  if (page === 1) redirect(`/blog/chu-de/${params.slug}`);
  return <TopicHubView slug={params.slug} page={page} />;
}
