// lib/posting-plan.ts — LỊCH ĐĂNG CỐ ĐỊNH theo kênh (user chốt 4/9/2026: "chia việc đăng bài
// trên từng kênh ra tránh loãng, chia luôn group FB; kế hoạch cố định, muốn chỉnh thì chỉnh
// ngay hôm đó hoặc tạo thêm 1 bài mới").
//
// Nguồn sự thật DUY NHẤT về "mỗi ngày đăng mấy bài, giờ nào, lên kênh nào, chia sẻ group nào":
// app_config key 'mkt_posting_plan'. Người sửa ở /ke-hoach (khối Lịch đăng cố định). Máy KHÔNG
// tự đổi lịch này (BOSS chỉ đổi trọng số + hướng đi bài viết, không đổi lịch).
//
// Ai đọc:
//   - app/api/rotate/route.ts: số bài + kênh + group từng lượt (slot sang = ô giờ < 12h, chieu =
//     từ 12h); ghi brief.plan_slot + payload.plan_time để nút Duyệt điền sẵn giờ hẹn.
//   - lib/week-plan.ts (bảng tuần /ke-hoach), lib/plan-live.ts (bản sống), lib/today-plan.ts
//     (khối Kế hoạch hôm nay /tong-quan), noi-dung/bang-section.tsx (lọc group popover 📣).
//
// Chưa có key trong DB -> lịch MẶC ĐỊNH = đúng nhịp đang chạy (8h 1 bài bán FB, 14h 1 bài bán FB
// + 1 content FB, group xoay 2 nhóm/ngày như công thức cũ) để hành vi không đổi tới khi người Lưu.

import type { getServerClient } from './supabase-server';

type Client = ReturnType<typeof getServerClient>;

export const POSTING_PLAN_KEY = 'mkt_posting_plan';
export const MAX_SLOTS_PER_DAY = 4;

// Kênh v1: chỉ 2 kênh máy đăng được qua API khi bấm Duyệt (actions.ts decideForm).
// TikTok (xuất tay) và Zalo (chưa nối API) KHÔNG đưa vào lịch.
export type PostingChannel = 'facebook' | 'youtube';
export type PostingKind = 'sale' | 'content';
export type PostingSlot = {
  time: string;                 // "HH:mm" giờ VN
  channel: PostingChannel;
  kind: PostingKind;
  group_id?: string | null;     // facebook: sau khi đăng Page, người chia sẻ tay vào group này
};
export type PostingDay = { slots: PostingSlot[] };
export type PostingPlan = {
  version: 1;
  days: Record<string, PostingDay>;      // key '0'..'6' theo getUTCDay của ngày VN (0 = CN, 1 = T2)
  overrides: Record<string, PostingDay>; // key 'YYYY-MM-DD' -> lịch riêng chỉ ngày đó
  updated_at?: string;
};
export type ShareGroup = { id: string; label: string; url: string };
export type EffectiveSlot = PostingSlot & {
  date: string;
  dowIdx: number;
  index: number;                // vị trí trong ngày sau khi sort theo giờ (0..)
  window: 'sang' | 'chieu';     // khớp ?slot= của /api/rotate
  group_label: string | null;
  overridden: boolean;          // ngày này đang dùng lịch riêng
};

export const CHANNEL_LABEL: Record<PostingChannel, string> = { facebook: 'Facebook Page', youtube: 'YouTube' };
export const KIND_LABEL: Record<PostingKind, string> = { sale: 'Bài bán', content: 'Bài content' };
export const DOW_SHORT = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
export const DOW_LONG = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
// Thứ tự hiển thị T2..CN (giá trị = index getUTCDay).
export const DOW_ORDER = [1, 2, 3, 4, 5, 6, 0];
// Giờ cron Vercel sinh bài cho từng cửa sổ (vercel.json: 0 1 / 0 7 UTC).
export const ROTATE_RUN_TIME: Record<'sang' | 'chieu', string> = { sang: '08:00', chieu: '14:00' };

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function slotWindow(time: string): 'sang' | 'chieu' {
  const h = Number(String(time).slice(0, 2));
  return Number.isFinite(h) && h < 12 ? 'sang' : 'chieu';
}
export function todayVNDate(now: Date = new Date()): string {
  return new Date(now.getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}
export function dowIdxOfDate(date: string): number {
  return new Date(date + 'T00:00:00Z').getUTCDay();
}
// "YYYY-MM-DDTHH:mm" giờ VN — cùng định dạng ô hẹn giờ datetime-local của nút Duyệt.
export function planTimeLocal(date: string, time: string): string {
  return `${date}T${time}`;
}
// Chuỗi "YYYY-MM-DDTHH:mm" (giờ VN) còn cách hiện tại >= minMinutes phút?
export function isFutureVNLocal(s: string, minMinutes = 0, now: Date = new Date()): boolean {
  const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return false;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] - 7, +m[5]) - now.getTime() >= minMinutes * 60 * 1000;
}

export function normalizeSlot(raw: any): PostingSlot | null {
  if (!raw || typeof raw !== 'object') return null;
  const time = String(raw.time || '').trim();
  if (!TIME_RE.test(time)) return null;
  const channel: PostingChannel = raw.channel === 'youtube' ? 'youtube' : 'facebook';
  const kind: PostingKind = raw.kind === 'content' ? 'content' : 'sale';
  const gid = raw.group_id ? String(raw.group_id).trim().slice(0, 120) : '';
  return { time, channel, kind, group_id: channel === 'facebook' && gid ? gid : null };
}
function normalizeDay(raw: any): PostingDay {
  const arr: any[] = Array.isArray(raw?.slots) ? raw.slots : [];
  const slots = arr
    .map(normalizeSlot)
    .filter((s): s is PostingSlot => !!s)
    .sort((a, b) => a.time.localeCompare(b.time))
    .slice(0, MAX_SLOTS_PER_DAY);
  return { slots };
}
export function normalizePostingPlan(raw: any): PostingPlan | null {
  if (!raw || typeof raw !== 'object' || !raw.days || typeof raw.days !== 'object') return null;
  const days: Record<string, PostingDay> = {};
  for (let d = 0; d < 7; d++) days[String(d)] = normalizeDay(raw.days[String(d)]);
  const overrides: Record<string, PostingDay> = {};
  const ov = raw.overrides && typeof raw.overrides === 'object' ? raw.overrides : {};
  for (const k of Object.keys(ov)) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(k)) overrides[k] = normalizeDay(ov[k]);
  }
  return { version: 1, days, overrides, updated_at: raw.updated_at ? String(raw.updated_at) : undefined };
}

// Lịch mặc định = nhịp đang chạy trước plan này (rotate 4/9): 8h 1 bài bán, 14h 1 bài bán + 1
// content, tất cả Facebook; group xoay 2 nhóm/ngày đúng công thức cũ (i*2+k) % n với i = vị trí
// ngày trong tuần T2..CN — để lịch mặc định hiện y hệt bảng tuần trước đây.
export function defaultPostingPlan(shareGroups: ShareGroup[] = []): PostingPlan {
  const days: Record<string, PostingDay> = {};
  DOW_ORDER.forEach((dowIdx, i) => {
    const g = (k: number) => (shareGroups.length ? shareGroups[(i * 2 + k) % shareGroups.length].id : null);
    days[String(dowIdx)] = {
      slots: [
        { time: '08:00', channel: 'facebook', kind: 'sale', group_id: g(0) },
        { time: '14:00', channel: 'facebook', kind: 'sale', group_id: g(1) },
        { time: '14:00', channel: 'facebook', kind: 'content', group_id: null },
      ],
    };
  });
  return { version: 1, days, overrides: {} };
}

// Danh sách group dùng chung với popover 📣 (app_config mkt_share_groups, cùng luật normalize
// như /api/share-groups). Phần tử có thể là chuỗi id hoặc {id,label,url}.
export async function loadShareGroups(client: Client): Promise<ShareGroup[]> {
  const { data } = await client.from('app_config').select('value').eq('key', 'mkt_share_groups').maybeSingle();
  const v = (data as any)?.value;
  const arr: any[] = Array.isArray(v?.groups) ? v.groups : Array.isArray(v) ? v : [];
  const out: ShareGroup[] = [];
  for (const g of arr) {
    if (typeof g === 'string') {
      const id = g.trim();
      if (id) out.push({ id, label: id, url: `https://www.facebook.com/groups/${id}` });
    } else if (g && typeof g === 'object' && g.id) {
      out.push({
        id: String(g.id).slice(0, 120),
        label: String(g.label || g.id).slice(0, 120),
        url: String(g.url || `https://www.facebook.com/groups/${g.id}`).slice(0, 300),
      });
    }
  }
  return out.slice(0, 12);
}

export type LoadedPostingPlan = { plan: PostingPlan; saved: boolean; shareGroups: ShareGroup[] };

export async function loadPostingPlan(client: Client): Promise<LoadedPostingPlan> {
  const [shareGroups, { data }] = await Promise.all([
    loadShareGroups(client),
    client.from('app_config').select('value').eq('key', POSTING_PLAN_KEY).maybeSingle(),
  ]);
  const parsed = normalizePostingPlan((data as any)?.value);
  if (parsed) return { plan: parsed, saved: true, shareGroups };
  return { plan: defaultPostingPlan(shareGroups), saved: false, shareGroups };
}

export async function savePostingPlan(client: Client, plan: PostingPlan): Promise<void> {
  const nowIso = new Date().toISOString();
  const { error } = await client.from('app_config').upsert({
    key: POSTING_PLAN_KEY,
    value: { ...plan, version: 1, updated_at: nowIso },
    updated_at: nowIso,
  });
  if (error) throw new Error('Không lưu được lịch đăng: ' + error.message);
}

// Các ô giờ HIỆU LỰC của 1 ngày: ưu tiên lịch riêng ngày đó (overrides), không có thì theo thứ.
export function slotsForDate(plan: PostingPlan, date: string, shareGroups: ShareGroup[] = []): EffectiveSlot[] {
  const dowIdx = dowIdxOfDate(date);
  const ov = plan.overrides?.[date];
  const day = ov || plan.days?.[String(dowIdx)] || { slots: [] };
  const labelOf = (id: string | null | undefined): string | null => {
    if (!id) return null;
    const g = shareGroups.find((x) => x.id === id);
    return g ? g.label : id;
  };
  return [...day.slots]
    .sort((a, b) => a.time.localeCompare(b.time))
    .map((s, index) => ({
      ...s, date, dowIdx, index,
      window: slotWindow(s.time),
      group_label: labelOf(s.group_id),
      overridden: !!ov,
    }));
}

// Tên group cần chia sẻ tay trong ngày (khử trùng, giữ thứ tự giờ).
export function groupsForDate(plan: PostingPlan, date: string, shareGroups: ShareGroup[] = []): string[] {
  const out: string[] = [];
  for (const s of slotsForDate(plan, date, shareGroups)) {
    if (s.group_label && !out.includes(s.group_label)) out.push(s.group_label);
  }
  return out;
}

// Số bài bán của 1 ngày (plan-live dùng để chia hàng đợi hướng đi theo ngày).
export function saleSlotsCount(plan: PostingPlan, date: string): number {
  return slotsForDate(plan, date).filter((s) => s.kind === 'sale').length;
}

// Tóm tắt 1 dòng cho tiêu đề trang Kế hoạch.
export function summarizePlan(plan: PostingPlan): string {
  const parts = DOW_ORDER.map((d) => {
    const s = plan.days[String(d)]?.slots || [];
    return `${s.filter((x) => x.kind === 'sale').length}/${s.filter((x) => x.kind === 'content').length}`;
  });
  if (parts.every((p) => p === parts[0])) {
    const [sale, content] = parts[0].split('/');
    return `mỗi ngày ${sale} bài bán + ${content} bài content`;
  }
  return DOW_ORDER.map((d, i) => `${DOW_SHORT[d]} ${parts[i].replace('/', ' bán + ')} content`).join(' · ');
}
