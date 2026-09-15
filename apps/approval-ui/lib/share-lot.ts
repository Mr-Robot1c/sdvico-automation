import type { SupabaseClient } from '@supabase/supabase-js';
import { loadShareGroups, type ShareGroup } from './posting-plan';

// "Lô hôm nay" cho nút Chia sẻ group (Thanh 11/9): mỗi ngày LOT nhóm, mỗi nhóm mỗi ngày tối đa 1 bài,
// ưu tiên nhóm chưa từng chia rồi nhóm chia lâu nhất; nhóm đã chia trong 7 ngày chỉ lấy khi không
// còn nhóm khác. Nhóm đã chia HÔM NAY luôn nằm trong lô (kể cả chia bài khác) để đếm tiến độ.
// Bảng mkt_group_shares có thể CHƯA tồn tại (migration áp tay) -> coi như chưa có lượt nào.
type Client = SupabaseClient<any, any, any>;
export type ShareRow = { id: string; content_id: string | null; group_id: string; group_label: string | null; post_url: string | null; shared_at: string };
export type LotItem = ShareGroup & {
  sharedToday: { id: string; content_id: string | null; shared_at: string } | null;
  sharedThisPost: boolean;
  lastSharedAt: string | null;
  daysSince: number | null;
};
export type ShareLot = { date: string; lotSize: number; doneToday: number; lot: LotItem[]; allGroups: LotItem[] };

export const DEFAULT_LOT_SIZE = 8;
const WEEK_MS = 7 * 24 * 3600 * 1000;

export function todayVNDate(now: Date = new Date()): string {
  return new Date(now.getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

async function loadLotSize(client: Client): Promise<number> {
  const { data } = await client.from('app_config').select('value').eq('key', 'mkt_share_lot_size').maybeSingle();
  const v = Number((data as any)?.value?.size ?? (data as any)?.value);
  return Number.isInteger(v) && v >= 1 && v <= 30 ? v : DEFAULT_LOT_SIZE;
}

export async function computeShareLot(client: Client, opts: { contentId?: string | null; now?: Date } = {}): Promise<ShareLot> {
  const now = opts.now || new Date();
  const date = todayVNDate(now);
  const dayStartIso = new Date(date + 'T00:00:00+07:00').toISOString();
  const [groups, lotSize] = await Promise.all([loadShareGroups(client), loadLotSize(client)]);
  // Lượt chia 30 ngày gần nhất là đủ để tính "chia lần cuối" cho xoay vòng 7 ngày.
  const sinceIso = new Date(now.getTime() - 30 * 24 * 3600 * 1000).toISOString();
  let rows: ShareRow[] = [];
  const { data, error } = await client
    .from('mkt_group_shares')
    .select('id, content_id, group_id, group_label, post_url, shared_at')
    .gte('shared_at', sinceIso)
    .order('shared_at', { ascending: false })
    .limit(2000);
  if (!error && Array.isArray(data)) rows = data as ShareRow[];
  // error (ví dụ bảng chưa có) -> rows rỗng, không làm vỡ trang.

  const lastByGroup = new Map<string, string>();
  const todayByGroup = new Map<string, ShareRow>();
  const thisPostGroups = new Set<string>();
  for (const r of rows) {
    if (!lastByGroup.has(r.group_id)) lastByGroup.set(r.group_id, r.shared_at); // rows đã sort mới nhất trước
    if (r.shared_at >= dayStartIso && !todayByGroup.has(r.group_id)) todayByGroup.set(r.group_id, r);
    if (opts.contentId && r.content_id === opts.contentId) thisPostGroups.add(r.group_id);
  }
  const toItem = (g: ShareGroup): LotItem => {
    const last = lastByGroup.get(g.id) || null;
    const t = todayByGroup.get(g.id);
    return {
      ...g,
      sharedToday: t ? { id: t.id, content_id: t.content_id, shared_at: t.shared_at } : null,
      sharedThisPost: thisPostGroups.has(g.id),
      lastSharedAt: last,
      daysSince: last ? Math.floor((now.getTime() - new Date(last).getTime()) / (24 * 3600 * 1000)) : null,
    };
  };
  const allGroups = groups.map(toItem);
  const done = allGroups.filter((g) => g.sharedToday);
  const rest = allGroups.filter((g) => !g.sharedToday);
  // Ưu tiên: chưa từng chia -> chia lâu nhất; nhóm chia trong 7 ngày xếp cuối.
  const rank = (g: LotItem) => {
    if (!g.lastSharedAt) return 0;
    const age = now.getTime() - new Date(g.lastSharedAt).getTime();
    return age >= WEEK_MS ? 1 : 2;
  };
  const restSorted = rest
    .map((g, i) => ({ g, i }))
    .sort((a, b) => {
      const ra = rank(a.g); const rb = rank(b.g);
      if (ra !== rb) return ra - rb;
      const ta = a.g.lastSharedAt ? new Date(a.g.lastSharedAt).getTime() : 0;
      const tb = b.g.lastSharedAt ? new Date(b.g.lastSharedAt).getTime() : 0;
      if (ta !== tb) return ta - tb; // cũ hơn đứng trước
      return a.i - b.i;              // ổn định theo thứ tự danh sách
    })
    .map((x) => x.g);
  const lot = [...done, ...restSorted.slice(0, Math.max(0, lotSize - done.length))];
  return { date, lotSize, doneToday: done.length, lot, allGroups };
}

// ===== 15/9 (Thanh, kế hoạch sửa web): bảng Kế hoạch tuần phải hiện ĐỦ 4 nhóm phải chia mỗi ngày,
// không phải 1 nhóm ghim. Lô theo ngày cho cả tuần:
//   - ngày ĐÃ QUA: nhóm THẬT đã chia hôm đó (sổ mkt_group_shares);
//   - HÔM NAY: lô thật (computeShareLot: đã chia + rút bù);
//   - ngày TỚI: dự kiến — xoay tiếp danh sách theo "chia lâu nhất trước", không lặp nhóm đã
//     nằm trong lô của ngày gần hơn (đúng luật rank của computeShareLot).
// Nhóm GHIM ở Lịch đăng cố định (slot.group_id) luôn có mặt trong lô ngày đó.
export type DayLotItem = { id: string; label: string; url: string; done: boolean; pinned: boolean };
export type DayLot = { date: string; kind: 'past' | 'today' | 'future'; lotSize: number; done: number; items: DayLotItem[] };

export async function planShareLots(
  client: Client,
  dates: string[],
  pinnedByDate: Record<string, string[]> = {},
  now: Date = new Date()
): Promise<Record<string, DayLot>> {
  const today = todayVNDate(now);
  const [groups, lotSize] = await Promise.all([loadShareGroups(client), loadLotSize(client)]);
  const sinceIso = new Date(now.getTime() - 30 * 24 * 3600 * 1000).toISOString();
  let rows: ShareRow[] = [];
  const { data, error } = await client
    .from('mkt_group_shares')
    .select('id, content_id, group_id, group_label, post_url, shared_at')
    .gte('shared_at', sinceIso)
    .order('shared_at', { ascending: false })
    .limit(2000);
  if (!error && Array.isArray(data)) rows = data as ShareRow[];

  const byId = new Map(groups.map((g) => [g.id, g]));
  const dateOf = (iso: string) => new Date(new Date(iso).getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10);
  const sharedOn = new Map<string, Set<string>>(); // date -> group ids
  const lastByGroup = new Map<string, number>();
  for (const r of rows) {
    const d = dateOf(r.shared_at);
    if (!sharedOn.has(d)) sharedOn.set(d, new Set());
    sharedOn.get(d)!.add(r.group_id);
    const t = new Date(r.shared_at).getTime();
    if (!lastByGroup.has(r.group_id) || lastByGroup.get(r.group_id)! < t) lastByGroup.set(r.group_id, t);
  }

  const out: Record<string, DayLot> = {};
  // Nhóm đã được xếp cho ngày hôm nay/ngày tới trước đó (để ngày sau không lặp).
  const reserved = new Set<string>();
  const sortedDates = [...dates].sort();
  for (const date of sortedDates) {
    const pinned = new Set(pinnedByDate[date] || []);
    if (date < today) {
      const ids = [...(sharedOn.get(date) || new Set<string>())];
      const items: DayLotItem[] = ids.map((id) => ({ id, label: byId.get(id)?.label || rows.find((r) => r.group_id === id)?.group_label || id, url: byId.get(id)?.url || `https://www.facebook.com/groups/${id}`, done: true, pinned: pinned.has(id) }));
      for (const id of pinned) if (!ids.includes(id)) items.push({ id, label: byId.get(id)?.label || id, url: byId.get(id)?.url || `https://www.facebook.com/groups/${id}`, done: false, pinned: true });
      out[date] = { date, kind: 'past', lotSize, done: ids.length, items };
      continue;
    }
    const doneToday = date === today ? (sharedOn.get(date) || new Set<string>()) : new Set<string>();
    // Ứng viên: chưa chia hôm đó, chưa bị ngày gần hơn giữ; xếp theo chia lâu nhất trước.
    const rank = (id: string) => {
      const last = lastByGroup.get(id);
      if (!last) return 0;
      return now.getTime() - last >= 7 * 24 * 3600 * 1000 ? 1 : 2;
    };
    const cands = groups
      .filter((g) => !doneToday.has(g.id) && !reserved.has(g.id) && !pinned.has(g.id))
      .map((g, i) => ({ g, i }))
      .sort((a, b) => {
        const ra = rank(a.g.id), rb = rank(b.g.id);
        if (ra !== rb) return ra - rb;
        const ta = lastByGroup.get(a.g.id) || 0, tb = lastByGroup.get(b.g.id) || 0;
        if (ta !== tb) return ta - tb;
        return a.i - b.i;
      })
      .map((x) => x.g);
    const items: DayLotItem[] = [];
    for (const id of doneToday) items.push({ id, label: byId.get(id)?.label || id, url: byId.get(id)?.url || `https://www.facebook.com/groups/${id}`, done: true, pinned: pinned.has(id) });
    for (const id of pinned) if (!doneToday.has(id)) items.push({ id, label: byId.get(id)?.label || id, url: byId.get(id)?.url || `https://www.facebook.com/groups/${id}`, done: false, pinned: true });
    for (const g of cands) {
      if (items.length >= lotSize) break;
      items.push({ id: g.id, label: g.label, url: g.url, done: false, pinned: false });
    }
    for (const it of items) reserved.add(it.id);
    out[date] = { date, kind: date === today ? 'today' : 'future', lotSize, done: items.filter((x) => x.done).length, items };
  }
  return out;
}
