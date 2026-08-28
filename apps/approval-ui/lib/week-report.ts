// lib/week-report.ts — gom số liệu Facebook theo TUẦN ISO Việt Nam (Thứ 2 đến Chủ Nhật).
//
// Dùng cho hai chỗ:
//   1) Trang /do-luong/tuan — báo cáo tuần cho người quản lý (item 1a).
//   2) Cron learn-weekly — tính điểm từng bài để BOSS đề xuất trọng số tuần sau (item 1b).
//
// Điểm bài (composite score) = engagement + views*0.1 + watchSec*0.02 + reach*0.05. Đơn vị "điểm".
// Cân nhắc: engagement ~ chục, views ~ trăm/nghìn, reach ~ trăm, watchSec ~ trăm giây. Nhân hệ số
// để một chỉ số quá lớn không nuốt các chỉ số khác. Ba-spec NV12 chốt "tạm dùng engagement, khi
// có AD sẽ nâng lên CPC" — ở đây mở rộng thêm views/watchSec/reach vì user chốt 20/8 ba chỉ số.

import type { getServerClient } from './supabase-server';
// @ts-ignore — module JS thuần
import { guessGroup } from './gen/products.mjs';
// @ts-ignore — module JS thuần
import { isOtherPage } from './page-origin.mjs';
import { vnInt, vnDec1 } from './plan';

type Client = ReturnType<typeof getServerClient>;

export type WeekWindow = {
  start: string;   // YYYY-MM-DD, Thứ 2 (giờ VN)
  end: string;     // YYYY-MM-DD, Chủ Nhật (giờ VN)
  startIso: string; // ISO UTC ứng với 00:00 VN Thứ 2
  endIso: string;   // ISO UTC ứng với 00:00 VN Thứ 2 tuần kế (không bao gồm)
  label: string;   // Ví dụ "Tuần 18/8 đến 24/8/2026"
  offset: number;  // 0 = tuần này, 1 = tuần trước, ...
};

export type PostMetric = {
  reactions: number; comments: number; shares: number; engagement: number;
  views: number; watchSec: number; reach: number;
};

export type PostScore = {
  cid: string;
  title: string;
  product: string;
  isContent: boolean;      // Bài content nuôi trang (không bán)
  contentType?: string;    // qa | checklist | glossary | tip | engage | portrait | news
  publishedAt: string | null;
  url: string;
  m: PostMetric;
  conversions: number;
  score: number;           // Điểm composite
  otherPage?: boolean;     // Bài nằm trên PAGE KHÁC (không phải page hệ thống đang đăng) — user 22/8
};

export type WeekReport = {
  window: WeekWindow;
  prevWindow: WeekWindow;
  totals: {
    posts: number;
    engagement: number;
    views: number;
    reach: number;
    watchSec: number;
    conversions: number;
    avgEng: number;
    avgViews: number;
    avgScore: number;
  };
  totalsPrev: WeekReport['totals'];
  delta: {
    posts: number;         // % thay đổi so tuần trước
    engagement: number;
    views: number;
    reach: number;
    conversions: number;
  };
  posts: PostScore[];      // tất cả bài trong tuần
  topPosts: PostScore[];   // top 5 theo điểm
  byProduct: Array<{ product: string; count: number; totalScore: number; avgScore: number; totalEng: number; avgEng: number; totalViews: number; avgViews: number; conversions: number }>;
  byKind: Array<{ kind: string; label: string; count: number; avgScore: number; avgEng: number; totalEng: number }>;
  narrative: string;       // Đoạn văn dán Zalo, tuân brand-voice VN
};

const KIND_LABEL: Record<string, string> = {
  qa: 'Hỏi Đáp',
  checklist: 'Checklist',
  glossary: 'Thuật ngữ',
  tip: 'Mẹo',
  engage: 'Hỏi bà con',
  portrait: 'Chân dung',
  news: 'Thời sự',
  sales: 'Bài bán'
};

// Trả về mốc 00:00 VN của Thứ 2 tuần chứa `now` (offset=0), tuần trước (offset=1), ...
export function weekWindowVNOffset(now: Date, offset: number = 0): WeekWindow {
  const vn = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const dow = vn.getUTCDay(); // 0=CN...6=T7
  const sinceMonday = (dow + 6) % 7;
  const mondayVn = new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate()) - (sinceMonday + offset * 7) * 24 * 60 * 60 * 1000);
  const sundayVn = new Date(mondayVn.getTime() + 6 * 24 * 60 * 60 * 1000);
  const nextMondayVn = new Date(mondayVn.getTime() + 7 * 24 * 60 * 60 * 1000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  // Mốc UTC: 00:00 VN = 17:00 UTC ngày hôm trước. Trừ 7 giờ để có ISO UTC đúng ngưỡng.
  const startIso = new Date(mondayVn.getTime() - 7 * 60 * 60 * 1000).toISOString();
  const endIso = new Date(nextMondayVn.getTime() - 7 * 60 * 60 * 1000).toISOString();
  const start = fmt(mondayVn);
  const end = fmt(sundayVn);
  const label = offset === 0
    ? `Tuần này (${start.split('-').reverse().join('/')} đến ${end.split('-').reverse().join('/')})`
    : offset === 1
      ? `Tuần trước (${start.split('-').reverse().join('/')} đến ${end.split('-').reverse().join('/')})`
      : `Tuần ${start.split('-').reverse().join('/')} đến ${end.split('-').reverse().join('/')}`;
  return { start, end, startIso, endIso, label, offset };
}

// Điểm composite của bài. Tune hệ số ở đây nếu cần.
export function scoreOf(m: PostMetric): number {
  return Math.round(
    (m.engagement || 0) * 1 +
    (m.views || 0) * 0.1 +
    (m.watchSec || 0) * 0.02 +
    (m.reach || 0) * 0.05
  );
}

// Tên sản phẩm — dùng lại logic của lib/plan.ts (import guessGroup).
function productOf(brief: any, title: string, draft: string = ''): string {
  const g = brief?.rotation_group as string | undefined;
  if (brief?.post_kind === 'content' || g === 'Bài content') return 'Bài content';
  if (g && g !== 'Content' && /^\d+\.\s/.test(g)) return g.replace(/^\s*\d+\.\s*/, '').trim();
  const draftSnippet = String(draft || '').slice(0, 300);
  const guess = (guessGroup as (s: string) => string | null)(
    `${g || ''} ${brief?.keyword || ''} ${title || ''} ${draftSnippet}`
  );
  if (guess) return guess.replace(/^\s*\d+\.\s*/, '').trim();
  // 28/8: cung fix voi plan.ts — fallback title dai thanh "san pham" rac. Ten > 60 ky tu
  // hoac co xuong dong -> gop 'Khác'.
  const name = String((g ? g.replace(/^\s*\d+\.\s*/, '').trim() : '') || brief?.keyword || title || 'Khác').trim();
  if (!name || name.length > 60 || name.includes('\n')) return 'Khác';
  return name;
}

function kindOf(brief: any): { isContent: boolean; contentType?: string } {
  const isContent = brief?.post_kind === 'content' || brief?.rotation_group === 'Bài content';
  const contentType = isContent ? String(brief?.content_type || 'other') : undefined;
  return { isContent, contentType };
}

async function loadPostsInWindow(client: Client, win: WeekWindow): Promise<PostScore[]> {
  // 1. Bài ĐĂNG trong tuần (mkt_posts.published_at giữa startIso và endIso).
  const { data: postRows } = await client
    .from('mkt_posts')
    .select('content_id, channel, external_url, published_at, status')
    .eq('status', 'published')
    .eq('channel', 'facebook')
    .gte('published_at', win.startIso)
    .lt('published_at', win.endIso)
    .order('published_at', { ascending: false });
  const byCid = new Map<string, { url: string; publishedAt: string }>();
  for (const p of postRows || []) {
    const cid = (p as any).content_id as string | null;
    if (!cid) continue;
    if (!byCid.has(cid)) byCid.set(cid, { url: String((p as any).external_url || ''), publishedAt: String((p as any).published_at || '') });
  }
  const cids = [...byCid.keys()];
  if (!cids.length) return [];

  // 2. Snapshot mkt_metrics MỚI NHẤT trong tuần cho mỗi bài (không lấy snapshot sau tuần).
  const { data: metricRows } = await client
    .from('mkt_metrics')
    .select('entity_ref, metrics, created_at')
    .eq('source', 'facebook')
    .in('entity_ref', cids)
    .lt('created_at', win.endIso)                           // không lấy snapshot sau tuần
    .gte('created_at', win.startIso)                        // chỉ lấy snapshot trong tuần
    .order('created_at', { ascending: false })
    .limit(2000);
  const latest = new Map<string, PostMetric>();
  for (const r of metricRows || []) {
    const cid = (r as any).entity_ref as string | null;
    if (!cid || latest.has(cid)) continue;
    const m = ((r as any).metrics || {}) as any;
    latest.set(cid, {
      reactions: Number(m.reactions) || 0,
      comments: Number(m.comments) || 0,
      shares: Number(m.shares) || 0,
      engagement: Number(m.engagement) || (Number(m.reactions) || 0) + (Number(m.comments) || 0) + (Number(m.shares) || 0),
      views: Number(m.views) || 0,
      watchSec: Number(m.watchSec) || 0,
      reach: Number(m.reach) || 0
    });
  }

  // 3. mkt_content để lấy title, brief (sản phẩm + kind + conversions). 28/8: bỏ bài đã
  // vào Thùng rác (deleted_at) — trước đây bài xoá mềm vẫn được tính vào tuần.
  const { data: contentRows } = await client.from('mkt_content').select('id, title, brief, draft, deleted_at').in('id', cids);
  const contents = new Map<string, { title: string; brief: any; draft: string }>();
  for (const c of contentRows || []) {
    if ((c as any).deleted_at) continue;
    contents.set((c as any).id, { title: String((c as any).title || '(không tên)'), brief: (c as any).brief || {}, draft: String((c as any).draft || '') });
  }

  // Playbook 26/8 (item 1): đếm mkt_leads TRONG TUẦN theo content_id → cộng vào conversions.
  // BOSS xếp hạng tuần theo avgConv trước avgEng → bài nhiều Zalo/inbox thắng, không phải
  // bài view cao mà zero khách.
  const leadsPerContent = new Map<string, number>();
  const { data: leadRows } = await client
    .from('mkt_leads')
    .select('content_id, status')
    .in('content_id', cids)
    .neq('status', 'spam')
    .gte('created_at', win.startIso)
    .lt('created_at', win.endIso);
  for (const l of leadRows || []) {
    const id = (l as any).content_id as string | null;
    if (!id) continue;
    leadsPerContent.set(id, (leadsPerContent.get(id) || 0) + 1);
  }

  // 28/8 (user "tắt kênh phụ" + "ghép link SDVICOVN phải vào cả báo cáo tuần"): tuần chỉ
  // tính bài KÊNH CHÍNH — có brief.fb_real_url (ghép tay) hoặc vốn của page chính (import).
  // Bài máy đăng chỉ nằm page phụ bị BỎ khỏi tuần (số 0 của nó kéo lệch trung bình mà BOSS
  // học theo). Link ưu tiên fb_real_url. Content đã xoá mềm không có trong `contents` -> bỏ.
  const posts: PostScore[] = [];
  for (const cid of cids) {
    const p = byCid.get(cid)!;
    const c = contents.get(cid);
    if (!c) continue;
    const realUrl = String(c.brief?.fb_real_url || '');
    const other = !!(isOtherPage as (u: string, b: any) => boolean)(p.url, c.brief);
    if (!realUrl && !other) continue;
    const m: PostMetric = latest.get(cid) || { reactions: 0, comments: 0, shares: 0, engagement: 0, views: 0, watchSec: 0, reach: 0 };
    const product = productOf(c.brief, c.title, c.draft);
    const { isContent, contentType } = kindOf(c.brief);
    const leadCount = leadsPerContent.get(cid) || 0;
    posts.push({
      cid,
      title: c.title,
      product,
      isContent,
      contentType,
      publishedAt: p.publishedAt || null,
      url: realUrl || p.url,
      m,
      conversions: (Number(c.brief?.conversions) || 0) + leadCount,
      score: scoreOf(m),
      otherPage: other
    });
  }
  return posts;
}

function pctDelta(cur: number, prev: number): number {
  if (!prev) return cur > 0 ? 100 : 0;
  return Math.round(((cur - prev) / prev) * 100);
}

function summarize(posts: PostScore[]): WeekReport['totals'] {
  const totals = { posts: posts.length, engagement: 0, views: 0, reach: 0, watchSec: 0, conversions: 0, avgEng: 0, avgViews: 0, avgScore: 0 };
  for (const p of posts) {
    totals.engagement += p.m.engagement;
    totals.views += p.m.views;
    totals.reach += p.m.reach;
    totals.watchSec += p.m.watchSec;
    totals.conversions += p.conversions;
    totals.avgScore += p.score;
  }
  totals.avgEng = posts.length ? Math.round(totals.engagement / posts.length) : 0;
  totals.avgViews = posts.length ? Math.round(totals.views / posts.length) : 0;
  totals.avgScore = posts.length ? Math.round(totals.avgScore / posts.length) : 0;
  return totals;
}

function joinAnd(items: string[]): string {
  if (!items.length) return '';
  if (items.length === 1) return items[0];
  return items.slice(0, -1).join(', ') + ' và ' + items[items.length - 1];
}

function buildNarrative(win: WeekWindow, totals: WeekReport['totals'], byProduct: WeekReport['byProduct'], byKind: WeekReport['byKind'], delta: WeekReport['delta'], topPosts: PostScore[]): string {
  const lines: string[] = [];
  lines.push(`📊 Báo cáo ${win.label.toLowerCase()}`);
  if (totals.posts === 0) {
    lines.push('Tuần này chưa đăng được bài nào. Kiểm tra hàng đợi duyệt và cron sinh bài.');
    return lines.join('\n');
  }
  const deltaTxt = (v: number) => v === 0 ? '' : ` (${v > 0 ? '+' : ''}${v}% so tuần trước)`;
  lines.push(`Tổng: ${vnInt(totals.posts)} bài, ${vnInt(totals.engagement)} tương tác${deltaTxt(delta.engagement)}, ${vnInt(totals.views)} lượt xem${deltaTxt(delta.views)}, ${vnInt(totals.reach)} người thấy${deltaTxt(delta.reach)}.`);
  if (totals.conversions > 0) lines.push(`Đơn hoặc lead: ${vnInt(totals.conversions)}${deltaTxt(delta.conversions)}.`);
  lines.push(`Trung bình mỗi bài: ${vnInt(totals.avgEng)} tương tác, ${vnInt(totals.avgViews)} lượt xem.`);

  const salesProducts = byProduct.filter((p) => p.product !== 'Bài content');
  if (salesProducts.length) {
    const winners = salesProducts.slice(0, Math.min(2, salesProducts.length));
    lines.push(`Sản phẩm dẫn đầu: ${joinAnd(winners.map((p) => `${p.product} (${vnInt(p.avgEng)} tương tác/bài, ${vnInt(p.count)} bài)`))}`);
    const losers = salesProducts.slice(-1).filter((p) => p.avgEng < (winners[0]?.avgEng || 0) / 3);
    if (losers.length) lines.push(`Đuối nhất: ${joinAnd(losers.map((p) => `${p.product} (chỉ ${vnInt(p.avgEng)} tương tác/bài)`))}. Cân nhắc giảm nhịp hoặc đổi góc.`);
  }

  const contentKinds = byKind.filter((k) => k.kind !== 'sales' && k.count > 0).slice(0, 3);
  if (contentKinds.length) {
    lines.push(`Bài content ăn nhất: ${joinAnd(contentKinds.map((k) => `${k.label} (${vnInt(k.avgEng)} tương tác/bài)`))}`);
  }

  if (topPosts.length) {
    lines.push('');
    lines.push(`Top ${topPosts.length} bài trong tuần:`);
    topPosts.forEach((p, i) => {
      lines.push(`${i + 1}. ${p.title} — ${p.product} — ${vnInt(p.m.engagement)} tương tác, ${vnInt(p.m.views)} lượt xem`);
    });
  }
  return lines.join('\n');
}

export async function buildWeekReport(client: Client, offset: number = 0, now: Date = new Date()): Promise<WeekReport> {
  const win = weekWindowVNOffset(now, offset);
  const prevWin = weekWindowVNOffset(now, offset + 1);
  const [posts, prevPosts] = await Promise.all([
    loadPostsInWindow(client, win),
    loadPostsInWindow(client, prevWin)
  ]);

  const totals = summarize(posts);
  const totalsPrev = summarize(prevPosts);
  const delta = {
    posts: pctDelta(totals.posts, totalsPrev.posts),
    engagement: pctDelta(totals.engagement, totalsPrev.engagement),
    views: pctDelta(totals.views, totalsPrev.views),
    reach: pctDelta(totals.reach, totalsPrev.reach),
    conversions: pctDelta(totals.conversions, totalsPrev.conversions)
  };

  const topPosts = [...posts].sort((a, b) => b.score - a.score).slice(0, 5);

  const productMap = new Map<string, { count: number; totalScore: number; totalEng: number; totalViews: number; conversions: number }>();
  for (const p of posts) {
    const g = productMap.get(p.product) || { count: 0, totalScore: 0, totalEng: 0, totalViews: 0, conversions: 0 };
    g.count += 1;
    g.totalScore += p.score;
    g.totalEng += p.m.engagement;
    g.totalViews += p.m.views;
    g.conversions += p.conversions;
    productMap.set(p.product, g);
  }
  const byProduct = [...productMap.entries()]
    .map(([product, g]) => ({
      product,
      count: g.count,
      totalScore: g.totalScore,
      avgScore: g.count ? Math.round(g.totalScore / g.count) : 0,
      totalEng: g.totalEng,
      avgEng: g.count ? Math.round(g.totalEng / g.count) : 0,
      totalViews: g.totalViews,
      avgViews: g.count ? Math.round(g.totalViews / g.count) : 0,
      conversions: g.conversions
    }))
    .sort((a, b) => b.avgScore - a.avgScore);

  const kindMap = new Map<string, { count: number; totalScore: number; totalEng: number }>();
  for (const p of posts) {
    const key = p.isContent ? (p.contentType || 'other') : 'sales';
    const g = kindMap.get(key) || { count: 0, totalScore: 0, totalEng: 0 };
    g.count += 1;
    g.totalScore += p.score;
    g.totalEng += p.m.engagement;
    kindMap.set(key, g);
  }
  const byKind = [...kindMap.entries()]
    .map(([kind, g]) => ({
      kind,
      label: KIND_LABEL[kind] || kind,
      count: g.count,
      totalEng: g.totalEng,
      avgScore: g.count ? Math.round(g.totalScore / g.count) : 0,
      avgEng: g.count ? Math.round(g.totalEng / g.count) : 0
    }))
    .sort((a, b) => b.avgEng - a.avgEng);

  const narrative = buildNarrative(win, totals, byProduct, byKind, delta, topPosts);

  return { window: win, prevWindow: prevWin, totals, totalsPrev, delta, posts, topPosts, byProduct, byKind, narrative };
}
