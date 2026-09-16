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

// ===== 16/9 (Thanh, sửa web bản 2: "mỗi BUỔI đều phải chia sẻ 4 group khác nhau, không phải 1 ngày 4 group"):
// lô nhóm tính theo TỪNG Ô ĐĂNG Facebook (mỗi bài = 1 buổi = 4 nhóm), ngày 2 bài Facebook = 8 nhóm.
//   - ô ĐÃ QUA: nhóm THẬT đã chia cho bài đó (mkt_group_shares.content_id);
//   - ô HÔM NAY: đã chia (theo content_id, hoặc lượt chia hôm nay chưa gắn bài) + rút bù tới đủ 4;
//   - ô TỚI: dự kiến — xoay danh sách "chia lâu nhất trước", không lặp nhóm đã xếp cho ô gần hơn;
//     hết danh sách thì quay vòng từ nhóm lâu nhất.
// Nhóm GHIM ở Lịch đăng cố định (slot.group_id) luôn nằm trong lô của ô đó. Ô YouTube/TikTok không có lô
// (chia sẻ group cần link bài Facebook).
export type DayLotItem = { id: string; label: string; url: string; done: boolean; pinned: boolean };
export type SlotLotInput = { index: number; time: string; kind: string; channel: string; group_id?: string | null; contentId?: string | null };
export type SlotLot = { index: number; time: string; kind: string; channel: string; contentId: string | null; lotSize: number; done: number; items: DayLotItem[] };
export type DayLot = { date: string; kind: 'past' | 'today' | 'future'; lotSize: number; done: number; items: DayLotItem[]; slots: SlotLot[] };

export async function planShareLots(
  client: Client,
  slotsByDate: Record<string, SlotLotInput[]>,
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
  const labelOf = (id: string) => byId.get(id)?.label || rows.find((r) => r.group_id === id)?.group_label || id;
  const urlOf = (id: string) => byId.get(id)?.url || `https://www.facebook.com/groups/${id}`;
  const dateOf = (iso: string) => new Date(new Date(iso).getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10);
  const byContent = new Map<string, Set<string>>();          // content_id -> group ids đã chia
  const looseByDate = new Map<string, string[]>();           // date -> group ids chia không gắn bài
  const lastByGroup = new Map<string, number>();
  for (const r of rows) {
    const t = new Date(r.shared_at).getTime();
    if (!lastByGroup.has(r.group_id) || lastByGroup.get(r.group_id)! < t) lastByGroup.set(r.group_id, t);
    if (r.content_id) { if (!byContent.has(r.content_id)) byContent.set(r.content_id, new Set()); byContent.get(r.content_id)!.add(r.group_id); }
    else { const d = dateOf(r.shared_at); if (!looseByDate.has(d)) looseByDate.set(d, []); looseByDate.get(d)!.push(r.group_id); }
  }
  const rank = (id: string) => { const last = lastByGroup.get(id); if (!last) return 0; return now.getTime() - last >= 7 * 24 * 3600 * 1000 ? 1 : 2; };
  const sortCands = (ids: ShareGroup[]) => ids.map((g, i) => ({ g, i })).sort((a, b) => {
    const ra = rank(a.g.id), rb = rank(b.g.id); if (ra !== rb) return ra - rb;
    const ta = lastByGroup.get(a.g.id) || 0, tb = lastByGroup.get(b.g.id) || 0; if (ta !== tb) return ta - tb;
    return a.i - b.i;
  }).map((x) => x.g);

  const out: Record<string, DayLot> = {};
  const reserved = new Set<string>(); // nhóm đã xếp cho ô hôm nay / ô tới (không lặp trong lượt tính này)
  const mk = (id: string, done: boolean, pinned: boolean): DayLotItem => ({ id, label: labelOf(id), url: urlOf(id), done, pinned });
  for (const date of Object.keys(slotsByDate).sort()) {
    const kind: DayLot['kind'] = date < today ? 'past' : date === today ? 'today' : 'future';
    const looseLeft = [...(looseByDate.get(date) || [])];
    const slots: SlotLot[] = [];
    const daySlots = [...(slotsByDate[date] || [])].sort((a, b) => a.time.localeCompare(b.time));
    for (const sl of daySlots) {
      if (sl.channel !== 'facebook') { slots.push({ index: sl.index, time: sl.time, kind: sl.kind, channel: sl.channel, contentId: sl.contentId || null, lotSize: 0, done: 0, items: [] }); continue; }
      const items: DayLotItem[] = [];
      const seen = new Set<string>();
      const push = (it: DayLotItem) => { if (!seen.has(it.id)) { seen.add(it.id); items.push(it); } };
      // 1. đã chia thật cho bài này
      const doneIds = new Set<string>(sl.contentId ? byContent.get(sl.contentId) || [] : []);
      // lượt chia hôm đó không gắn bài: gán cho ô này nếu ô chưa có bài (theo thứ tự giờ)
      if (!sl.contentId && looseLeft.length) { for (const id of looseLeft.splice(0, lotSize)) doneIds.add(id); }
      for (const id of doneIds) push(mk(id, true, id === sl.group_id));
      // 2. nhóm ghim
      if (sl.group_id) push(mk(sl.group_id, doneIds.has(sl.group_id), true));
      // 3. rút bù (hôm nay + ô tới)
      if (kind !== 'past') {
        let cands = sortCands(groups.filter((g) => !seen.has(g.id) && !reserved.has(g.id)));
        if (!cands.length && groups.length > items.length) { reserved.clear(); cands = sortCands(groups.filter((g) => !seen.has(g.id))); }
        for (const g of cands) { if (items.length >= lotSize) break; push(mk(g.id, false, false)); }
      }
      for (const it of items) reserved.add(it.id);
      slots.push({ index: sl.index, time: sl.time, kind: sl.kind, channel: sl.channel, contentId: sl.contentId || null, lotSize: kind === 'past' ? Math.max(lotSize, items.length) : lotSize, done: items.filter((x) => x.done).length, items });
    }
    const all = slots.flatMap((s) => s.items);
    out[date] = { date, kind, lotSize: slots.filter((s) => s.channel === 'facebook').length * lotSize, done: all.filter((x) => x.done).length, items: all, slots };
  }
  return out;
}

// Lô của MỘT bài (popover 📣 trên thẻ bài): tra brief.plan_slot {date,index} -> ô tương ứng. Không có
// plan_slot -> rơi về lô theo ngày (computeShareLot).
export async function lotForContent(client: Client, contentId: string): Promise<ShareLot> {
  const { data: c } = await client.from('mkt_content').select('id, brief').eq('id', contentId).maybeSingle();
  const ps = (c as any)?.brief?.plan_slot;
  const date = String(ps?.date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return computeShareLot(client, { contentId });
  const { loadPostingPlan, slotsForDate } = await import('./posting-plan');
  const pp = await loadPostingPlan(client);
  const slots = slotsForDate(pp.plan, date, pp.shareGroups).map((s) => ({ index: s.index, time: s.time, kind: s.kind, channel: s.channel, group_id: s.group_id, contentId: Number(ps.index) === s.index ? contentId : null }));
  const lots = await planShareLots(client, { [date]: slots });
  const sl = lots[date]?.slots.find((s) => s.index === Number(ps.index));
  if (!sl) return computeShareLot(client, { contentId });
  const base = await computeShareLot(client, { contentId });
  const lot: LotItem[] = sl.items.map((it) => {
    const full = base.allGroups.find((g) => g.id === it.id);
    return { id: it.id, label: it.label, url: it.url, sharedToday: it.done ? (full?.sharedToday || { id: 'da-ghi', content_id: contentId, shared_at: '' }) : null, sharedThisPost: it.done, lastSharedAt: full?.lastSharedAt || null, daysSince: full?.daysSince ?? null };
  });
  return { date, lotSize: sl.lotSize, doneToday: sl.done, lot, allGroups: base.allGroups };
}
