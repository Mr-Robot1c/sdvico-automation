import { getServerClient } from '../supabase-server';
import { ensureCoverForContent } from '../cover-image';
import { siteUrl, slugify } from '../seo';

type Client = ReturnType<typeof getServerClient>;

// 21/9: shared "publish to blog" step. Two callers:
//  1. generateForKw auto-publish (risk-none article goes straight to the blog);
//  2. the approve flow in app/actions.ts — until today the approve loop only knew
//     facebook/tiktok/youtube, so an approved website article (e.g. gov-reviewed keyword
//     posts) was marked approved but never actually reached the blog and never got a cover.
// Steps: mark content published, insert the mkt_posts website row (idempotent), assign a
// dedicated cover image (best effort), write run_log mkt.blog_publish.
export async function publishContentToWebsite(
  client: Client,
  contentId: string,
  opts: { actor?: string; keyword?: string | null } = {}
): Promise<{ ok: boolean; url: string | null; error?: string }> {
  const { data: row, error: rowErr } = await client
    .from('mkt_content')
    .select('id, title, status, deleted_at')
    .eq('id', contentId)
    .maybeSingle();
  if (rowErr || !row) return { ok: false, url: null, error: rowErr?.message || 'khong thay bai' };
  if ((row as any).deleted_at) return { ok: false, url: null, error: 'bai da nam trong thung rac' };

  const slug = `${slugify(String((row as any).title || ''))}-${String(contentId).slice(0, 8)}`;
  const url = `${siteUrl()}/blog/${slug}`;

  // Idempotent: an existing live website row means the post is already on the blog.
  const { data: existing } = await client
    .from('mkt_posts')
    .select('id, external_url')
    .eq('content_id', contentId)
    .eq('channel', 'website')
    .eq('status', 'published')
    .is('deleted_at', null)
    .maybeSingle();

  if (!existing) {
    const { error: postErr } = await client.from('mkt_posts').insert({
      content_id: contentId,
      channel: 'website',
      status: 'published',
      external_url: url,
      published_at: new Date().toISOString()
    });
    if (postErr) return { ok: false, url: null, error: postErr.message };
  }

  if ((row as any).status !== 'published') {
    await client.from('mkt_content').update({ status: 'published' }).eq('id', contentId);
  }

  // Dedicated cover per post (3/9 rule: no duplicate blog images). Best effort only.
  let coverVia = 'skip';
  try {
    const cover = await ensureCoverForContent(client, contentId);
    coverVia = (cover as any)?.via || 'unknown';
  } catch { /* placeholder is acceptable, never block publishing */ }

  const finalUrl = (existing as any)?.external_url || url;
  await client.from('run_log').insert({
    task: 'mkt.blog_publish',
    actor: opts.actor || 'nguoi-bam',
    status: 'ok',
    detail: { content_id: contentId, url: finalUrl, keyword: opts.keyword ?? null, cover: coverVia, msg: existing ? 'bai da co tren blog (bo qua)' : 'dang blog sau khi Duyet' }
  });
  return { ok: true, url: finalUrl };
}
