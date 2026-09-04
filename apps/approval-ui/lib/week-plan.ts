// lib/week-plan.ts — dựng BẢNG KẾ HOẠCH TUẦN (T2..CN) cho trang /ke-hoach, làm lại 29/8
// (user: "làm lại toàn bộ, không rườm rà, thể hiện đầy đủ kế hoạch cả tuần").
//
// Nguồn dữ liệu từng ô:
//   - Ngày ĐÃ QUA + slot đã chạy hôm nay: bài THẬT đã sinh (mkt_content generator=rotation).
//   - Slot còn lại hôm nay + ngày TƯƠNG LAI: mô phỏng đúng thứ tự /api/rotate sẽ rút hướng
//     (hướng chưa dùng sort theo trọng số sản phẩm, lọc theo focus còn hạn, mỗi lượt các bài
//     phải khác sản phẩm — cùng luật usedInThisRun của rotate).
//   - Bài content: theo playbook CONTENT_KIND_BY_DOW (lịch tuần 2-2-1-1-1).
// KHÔNG phụ thuộc bản live (origin='live') — bản đó bị xoá là trang cũ mất sạch lịch tuần
// (chính là lỗi user thấy 29/8: /ke-hoach trống trơn khối lịch).

import type { getServerClient } from './supabase-server';
import { weekWindowVN } from './plan';
// @ts-ignore — module JS thuần
import { guessGroup } from './gen/products.mjs';
import { CONTENT_KIND_BY_DOW, CONTENT_PURPOSE } from './plan-live';
import { loadPostingPlan, slotsForDate, groupsForDate, type EffectiveSlot } from './posting-plan';

type Client = ReturnType<typeof getServerClient>;

export type WeekCellItem = {
  text: string;
  product?: string;
  state: 'done' | 'planned' | 'fallback';
  contentId?: string;
  time?: string;
  channel?: 'facebook' | 'youtube' | 'tiktok';
  group?: string | null;
};

export type WeekDayView = {
  date: string;      // YYYY-MM-DD (giờ VN)
  dowLabel: string;  // "Thứ 2".."Chủ nhật"
  isToday: boolean;
  isPast: boolean;
  morning: WeekCellItem[];       // sáng = ô giờ < 12h (lịch cố định)
  afternoonSale: WeekCellItem[]; // chiều = ô giờ từ 12h, bài bán
  content: WeekCellItem | null;  // ô content trong ngày (giờ tuỳ lịch)
  contentLabel: string;          // nhãn playbook ("Viral · Tự hào")
  contentPurpose?: string;
  groups: string[];              // nhóm FB cần chia sẻ hôm đó (theo Lịch đăng cố định)
  contentWindow: 'sang' | 'chieu';
  overridden: boolean;           // ngày này đang dùng lịch riêng
};

export type WeekPlanView = {
  window: { start: string; end: string };
  days: WeekDayView[];
  hasFallback: boolean; // có ô "theo trọng số" (hướng cạn) — hiện chú thích máy tự nạp thêm
  // Tên sản phẩm (không STT) có folder tư liệu ẢNH — hướng của sản phẩm ngoài danh sách này
  // rotate không rút được (matchedFolder rỗng), trang Kế hoạch báo "thiếu tư liệu".
  productsWithImages: string[];
};

const DOW_LABEL = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];

export function productNameOf(raw: string): string {
  const g = (guessGroup as (t: string) => string | null)(String(raw || ''));
  return String(g || raw || '').replace(/^\s*\d+\.\s*/, '').trim();
}

export async function buildWeekPlanView(
  client: Client,
  appliedData: any | null,
  now: Date = new Date()
): Promise<WeekPlanView> {
  const win = weekWindowVN(now);
  const todayVN = new Date(now.getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10);

  // 7 ngày T2..CN của tuần hiện tại (chuỗi YYYY-MM-DD giờ VN).
  const dayDates: string[] = [];
  const startMs = new Date(win.start + 'T00:00:00Z').getTime();
  for (let i = 0; i < 7; i++) dayDates.push(new Date(startMs + i * 24 * 3600 * 1000).toISOString().slice(0, 10));

  // Bài rotation ĐÃ SINH trong tuần, gom theo ngày VN + slot. Bài không có rotation_slot
  // (chạy force/tay thời trước) xếp theo giờ tạo: trước 12h VN = sáng, còn lại = chiều.
  const weekStartIso = new Date(win.start + 'T00:00:00+07:00').toISOString();
  const { data: rows } = await client
    .from('mkt_content')
    .select('id, title, brief, created_at, deleted_at')
    .gte('created_at', weekStartIso)
    .eq('brief->>generator', 'rotation')
    .order('created_at', { ascending: true })
    .limit(120);
  type Actual = { morning: WeekCellItem[]; afternoon: WeekCellItem[]; content: WeekCellItem | null; ranMorning: boolean; ranAfternoon: boolean };
  const actualByDate = new Map<string, Actual>();
  for (const r of (rows || []) as any[]) {
    if (r.deleted_at) continue;
    const b = r.brief || {};
    const vn = new Date(new Date(r.created_at).getTime() + 7 * 3600 * 1000);
    const date = vn.toISOString().slice(0, 10);
    if (!actualByDate.has(date)) actualByDate.set(date, { morning: [], afternoon: [], content: null, ranMorning: false, ranAfternoon: false });
    const a = actualByDate.get(date)!;
    const slot = b.rotation_slot === 'sang' ? 'sang' : b.rotation_slot === 'chieu' ? 'chieu' : (vn.getUTCHours() < 12 ? 'sang' : 'chieu');
    if (slot === 'sang') a.ranMorning = true; else a.ranAfternoon = true;
    const psl = b.plan_slot || null;
    const item: WeekCellItem = { text: String(r.title || '(không tên)'), state: 'done', contentId: String(r.id), time: psl?.time, channel: psl?.channel, group: psl?.group_label ?? null };
    if (b.post_kind === 'content' || b.rotation_group === 'Bài content') {
      if (!a.content) a.content = item;
      continue;
    }
    item.product = productNameOf(String(b.rotation_group || b.keyword || ''));
    if (slot === 'sang') a.morning.push(item); else a.afternoon.push(item);
  }

  // Hàng đợi hướng đi cho phần DỰ KIẾN — cùng luật với /api/rotate: hướng chưa dùng
  // (pending_variant thời A/B cũ coi như đã dùng), sort ổn định theo trọng số sản phẩm.
  const suggestions: any[] = Array.isArray(appliedData?.content_suggestions) ? appliedData.content_suggestions : [];
  const weights: Record<string, number> = (appliedData?.weights || {}) as Record<string, number>;
  const wOf = (s: any) => weights[productNameOf(s.product)] ?? 1;
  const queue = suggestions
    .filter((s) => !s.used_at && !s.pending_variant)
    .sort((a, b) => wOf(b) - wOf(a))
    .map((s) => ({ title: String(s.title || ''), product: productNameOf(String(s.product || '')) }));

  // Focus (sản phẩm tập trung còn hạn): hướng ngoài focus không được rút khi focus còn hiệu lực.
  const { data: focusRow } = await client.from('app_config').select('value').eq('key', 'mkt_focus').maybeSingle();
  const fv = ((focusRow as any)?.value || {}) as { groups?: string[]; until?: string };
  const focusKeys = (Array.isArray(fv.groups) ? fv.groups : []).map((s) => String(s).toLowerCase().trim()).filter(Boolean);
  const focusUntilMs = fv.until ? new Date(fv.until).getTime() : 0;
  const focusActiveOn = (date: string) =>
    focusKeys.length > 0 && (!fv.until || focusUntilMs > new Date(date + 'T00:00:00+07:00').getTime());
  const matchFocus = (product: string) => {
    const p = product.toLowerCase();
    return focusKeys.some((k) => p === k || p.includes(k) || k.includes(p));
  };

  // Folder có ẢNH (điều kiện rotate sinh được bài bán) — hướng của sản phẩm chưa có folder
  // ảnh sẽ bị rotate bỏ qua, mô phỏng phải bỏ qua giống hệt kẻo lịch hứa bài không bao giờ ra.
  const { data: assetRows } = await client
    .from('brand_assets')
    .select('product_group, kind')
    .eq('kind', 'image')
    .not('product_group', 'is', null)
    .limit(1000);
  const productsWithImages = [...new Set(
    ((assetRows || []) as any[])
      .map((a) => String(a.product_group || '').replace(/^\s*\d+\.\s*/, '').trim())
      .filter((g) => g && g !== 'Content')
  )];
  const hasImages = (product: string) => productsWithImages.some((p) => p.toLowerCase() === product.toLowerCase());

  // Số bài/ngày + nhóm chia sẻ đọc từ LỊCH ĐĂNG CỐ ĐỊNH (app_config mkt_posting_plan).
  const pp = await loadPostingPlan(client);

  // Rút n hướng dự kiến cho 1 lượt chạy: mỗi bài trong lượt phải KHÁC sản phẩm
  // (usedInThisRun của rotate); hết hướng hợp lệ thì ô đó rơi về "theo trọng số".
  let hasFallback = false;
  const draw = (date: string, n: number): WeekCellItem[] => {
    const out: WeekCellItem[] = [];
    const usedProducts = new Set<string>();
    for (let k = 0; k < n; k++) {
      const focusOn = focusActiveOn(date);
      const idx = queue.findIndex((q) => !usedProducts.has(q.product) && hasImages(q.product) && (!focusOn || matchFocus(q.product)));
      if (idx >= 0) {
        const [q] = queue.splice(idx, 1);
        usedProducts.add(q.product);
        out.push({ text: q.title, product: q.product, state: 'planned' });
      } else {
        hasFallback = true;
        out.push({ text: 'Bài theo trọng số sản phẩm', state: 'fallback' });
      }
    }
    return out;
  };

  const days: WeekDayView[] = dayDates.map((date, i) => {
    const dowIdx = (i + 1) % 7; // i=0 là Thứ 2 (dowIdx 1) ... i=6 là Chủ nhật (dowIdx 0)
    const actual = actualByDate.get(date);
    const isToday = date === todayVN;
    const isPast = date < todayVN;
    const ck = CONTENT_KIND_BY_DOW[dowIdx];
    const daySlots = slotsForDate(pp.plan, date, pp.shareGroups);
    const mSale = daySlots.filter((s) => s.window === 'sang' && s.kind === 'sale');
    const aSale = daySlots.filter((s) => s.window === 'chieu' && s.kind === 'sale');
    const cSlot = daySlots.find((s) => s.kind === 'content') || null;
    const decorate = (items: WeekCellItem[], slots: EffectiveSlot[]) => items.map((it, k) => (it.time ? it : { ...it, time: slots[k]?.time, channel: slots[k]?.channel, group: slots[k]?.group_label ?? null }));

    let morning: WeekCellItem[] = actual?.morning ? [...actual.morning] : [];
    let afternoonSale: WeekCellItem[] = actual?.afternoon ? [...actual.afternoon] : [];
    let content: WeekCellItem | null = actual?.content || null;
    if (!isPast) {
      // Slot đã chạy hôm nay thì giữ đúng bài thật (guard 1 lần/slot — thiếu bài cũng không
      // sinh thêm); slot chưa chạy (hôm nay hoặc ngày tới) mới điền dự kiến.
      if (!(isToday && actual?.ranMorning) && morning.length < mSale.length) {
        morning = [...morning, ...draw(date, mSale.length - morning.length)];
      }
      if (!(isToday && actual?.ranAfternoon)) {
        if (afternoonSale.length < aSale.length) afternoonSale = [...afternoonSale, ...draw(date, aSale.length - afternoonSale.length)];
        if (!content && cSlot) content = { text: ck?.label || 'Content', state: 'planned', time: cSlot.time, channel: cSlot.channel, group: cSlot.group_label };
      }
      morning = decorate(morning, mSale);
      afternoonSale = decorate(afternoonSale, aSale);
      if (content && !content.time && cSlot) content = { ...content, time: cSlot.time, channel: cSlot.channel, group: cSlot.group_label };
    }

    const groups = groupsForDate(pp.plan, date, pp.shareGroups);

    return {
      date,
      dowLabel: DOW_LABEL[dowIdx],
      isToday,
      isPast,
      morning,
      afternoonSale,
      content,
      contentLabel: ck?.label || 'Content',
      contentPurpose: ck ? CONTENT_PURPOSE[ck.kind] : undefined,
      groups,
      contentWindow: cSlot ? cSlot.window : 'chieu',
      overridden: daySlots[0]?.overridden ?? false,
    };
  });

  return { window: win, days, hasFallback, productsWithImages };
}
