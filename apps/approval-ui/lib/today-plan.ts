// lib/today-plan.ts — dữ liệu khối "📅 Kế hoạch hôm nay" ở /tong-quan (user 4/9: "thiếu nội dung:
// không có giờ, ngày đăng, đăng ở đâu kênh nào group nào"). Ghép 3 nguồn:
//   1. Ô giờ hiệu lực hôm nay (lib/posting-plan.ts): giờ, kênh, group, loại bài.
//   2. Bài THẬT máy đã sinh cho ô đó (mkt_content.brief.plan_slot.date/index; bài rotation cũ
//      chưa có plan_slot thì ghép theo rotation_slot + loại bài, theo thứ tự sinh).
//   3. Trạng thái: approval_queue (chờ duyệt / từ chối / đã duyệt + giờ hẹn) và mkt_posts (đã đăng + link).
// Bài sinh ngoài lịch trong ngày (Xưởng sản xuất, trend, bung 7 góc, sinh tay) gom vào `extras`.

import type { getServerClient } from './supabase-server';
import { loadPostingPlan, slotsForDate, todayVNDate, ROTATE_RUN_TIME, type EffectiveSlot } from './posting-plan';
import { CONTENT_KIND_BY_DOW } from './plan-live';

type Client = ReturnType<typeof getServerClient>;

export type TodayStage = 'waiting' | 'missed' | 'draft' | 'pending' | 'scheduled' | 'manual' | 'published' | 'rejected';
export const TODAY_STAGE_LABEL: Record<TodayStage, string> = {
  waiting: 'Chưa tới giờ máy viết',
  missed: 'Máy chưa ra bài',
  draft: 'Nháp',
  pending: 'Chờ duyệt',
  scheduled: 'Đã lên lịch',
  manual: 'Chờ xuất TikTok tay',
  published: 'Đã đăng',
  rejected: 'Từ chối',
};

export type TodayRow = {
  slot: EffectiveSlot;
  contentId: string | null;
  title: string | null;
  product: string | null;      // bài bán: tên sản phẩm; bài content: nhãn playbook
  stage: TodayStage;
  scheduledAt: string | null;  // "YYYY-MM-DDTHH:mm" nếu đã duyệt kèm hẹn giờ
  publishedUrl: string | null;
  publishedChannels: string[];
};
export type TodayExtra = { contentId: string; title: string; stage: TodayStage; channels: string[]; generator: string; createdAt: string; publishedUrl: string | null };
export type TodayView = {
  date: string;
  dowIdx: number;
  rows: TodayRow[];
  extras: TodayExtra[];
  groups: string[];
  saved: boolean;
  overridden: boolean;
  counts: { total: number; done: number; pending: number; missed: number };
};

type C = { id: string; title: string | null; brief: any; status: string; created_at: string };
type Q = { id: string; status: string; payload: any; created_at: string };
type P = { content_id: string | null; channel: string; external_url: string | null; published_at: string | null };

const GENERATOR_LABEL: Record<string, string> = {
  'xuong-san-xuat': 'Xưởng sản xuất', trend: 'Bài trend', 'seven-angles': 'Bung 7 góc', angles: 'Bung 7 góc',
  'manual-import': 'Nhập tay từ Page', 'video-pipeline': 'Video AI', rotation: 'Vòng xoay (ngoài lịch)',
};

export async function buildTodayView(client: Client, now: Date = new Date()): Promise<TodayView> {
  const date = todayVNDate(now);
  const dowIdx = new Date(date + 'T00:00:00Z').getUTCDay();
  const dayStartIso = new Date(date + 'T00:00:00+07:00').toISOString();
  const nowHHmm = new Date(now.getTime() + 7 * 3600 * 1000).toISOString().slice(11, 16);
  const { plan, saved, shareGroups } = await loadPostingPlan(client);
  const slots = slotsForDate(plan, date, shareGroups);

  const [{ data: cRows }, { data: qRows }] = await Promise.all([
    client.from('mkt_content').select('id, title, brief, status, created_at').gte('created_at', dayStartIso).is('deleted_at', null).order('created_at', { ascending: true }).limit(60),
    client.from('approval_queue').select('id, status, payload, created_at').eq('kind', 'mkt_publish_content').gte('created_at', dayStartIso).order('created_at', { ascending: false }).limit(120),
  ]);
  const contents = (cRows || []) as C[];
  const cids = contents.map((c) => c.id);
  const { data: pRows } = cids.length
    ? await client.from('mkt_posts').select('content_id, channel, external_url, published_at').eq('status', 'published').is('deleted_at', null).in('content_id', cids)
    : { data: [] as P[] };

  const queueByCid = new Map<string, Q>();
  for (const q of (qRows || []) as Q[]) {
    const cid = String(q.payload?.content_id || '');
    if (cid && !queueByCid.has(cid)) queueByCid.set(cid, q);
  }
  const postsByCid = new Map<string, P[]>();
  for (const p of (pRows || []) as P[]) {
    if (!p.content_id) continue;
    if (!postsByCid.has(p.content_id)) postsByCid.set(p.content_id, []);
    postsByCid.get(p.content_id)!.push(p);
  }

  const stageOf = (c: C): { stage: TodayStage; scheduledAt: string | null; url: string | null; channels: string[] } => {
    const posts = postsByCid.get(c.id) || [];
    const q = queueByCid.get(c.id);
    if (posts.length) {
      const fbReal = c.brief?.fb_real_url ? String(c.brief.fb_real_url) : null;
      const first = posts.find((p) => p.external_url && !String(p.external_url).startsWith('tiktok:'));
      return { stage: 'published', scheduledAt: null, url: fbReal || (first ? String(first.external_url) : null), channels: [...new Set(posts.map((p) => p.channel))] };
    }
    if (q?.status === 'rejected') return { stage: 'rejected', scheduledAt: null, url: null, channels: [] };
    if (q?.status === 'approved') {
      const ch: string[] = Array.isArray(q.payload?.channels) ? q.payload.channels : (Array.isArray(c.brief?.channels) ? c.brief.channels : []);
      if (ch.length && ch.every((x) => x === 'tiktok')) return { stage: 'manual', scheduledAt: null, url: null, channels: [] };
      return { stage: 'scheduled', scheduledAt: q.payload?.scheduled_at ? String(q.payload.scheduled_at) : null, url: null, channels: [] };
    }
    if (q?.status === 'pending') return { stage: 'pending', scheduledAt: null, url: null, channels: [] };
    return { stage: 'draft', scheduledAt: null, url: null, channels: [] };
  };
  const productOf = (c: C): string | null => {
    const b = c.brief || {};
    if (b.post_kind === 'content' || b.rotation_group === 'Bài content') {
      return `${CONTENT_KIND_BY_DOW[dowIdx]?.label || 'Content'}${b.content_type ? ` · ${b.content_type}` : ''}`;
    }
    const g = String(b.rotation_group || b.keyword || '').replace(/^\s*\d+\.\s*/, '').trim();
    return g || null;
  };

  // Ghép bài -> ô: ưu tiên brief.plan_slot (P1), fallback bài rotation cũ theo cửa sổ + loại.
  const used = new Set<string>();
  const rotation = contents.filter((c) => c.brief?.generator === 'rotation');
  const isContent = (c: C) => c.brief?.post_kind === 'content' || c.brief?.rotation_group === 'Bài content';
  const rows: TodayRow[] = slots.map((slot) => {
    let c: C | undefined = rotation.find((x) => !used.has(x.id) && x.brief?.plan_slot?.date === date && Number(x.brief.plan_slot.index) === slot.index);
    if (!c) {
      c = rotation.find((x) => !used.has(x.id) && !x.brief?.plan_slot && (x.brief?.rotation_slot || 'chieu') === slot.window && isContent(x) === (slot.kind === 'content'));
    }
    if (c) used.add(c.id);
    if (!c) {
      const runAt = ROTATE_RUN_TIME[slot.window];
      const stage: TodayStage = nowHHmm < runAt ? 'waiting' : 'missed';
      return { slot, contentId: null, title: null, product: null, stage, scheduledAt: null, publishedUrl: null, publishedChannels: [] };
    }
    const st = stageOf(c);
    return { slot, contentId: c.id, title: c.title, product: productOf(c), stage: st.stage, scheduledAt: st.scheduledAt, publishedUrl: st.url, publishedChannels: st.channels };
  });

  const extras: TodayExtra[] = contents
    .filter((c) => !used.has(c.id) && c.brief?.generator !== 'video-pipeline')
    .map((c) => {
      const st = stageOf(c);
      const gen = String(c.brief?.generator || '');
      return { contentId: c.id, title: String(c.title || '(không tên)'), stage: st.stage, channels: Array.isArray(c.brief?.channels) ? c.brief.channels : ['facebook'], generator: GENERATOR_LABEL[gen] || gen || 'Khác', createdAt: c.created_at, publishedUrl: st.url };
    });

  const groups = [...new Set(slots.map((s) => s.group_label).filter((g): g is string => !!g))];
  return {
    date, dowIdx, rows, extras, groups, saved,
    overridden: slots[0]?.overridden ?? false,
    counts: {
      total: rows.length,
      done: rows.filter((r) => r.stage === 'published' || r.stage === 'scheduled').length,
      pending: rows.filter((r) => r.stage === 'pending' || r.stage === 'manual').length,
      missed: rows.filter((r) => r.stage === 'missed').length,
    },
  };
}
