// Dùng chung cho các tab của /ke-hoach (23/10: tách ?tab= thành đường dẫn riêng, mỗi tab chỉ tải dữ liệu của mình).
import { cache } from 'react';
import type { getServerClient } from '../../lib/supabase-server';
import type { Plan, Tier } from '../../lib/plan';

type Client = ReturnType<typeof getServerClient>;

export type PlanRow = {
  id: string;
  period_start: string | null;
  period_end: string | null;
  generated_by: string;
  data: Plan;
  applied: boolean;
  applied_at: string | null;
  created_at: string;
};

export const PLAN_COLS = 'id, period_start, period_end, generated_by, data, applied, applied_at, created_at';

// 23/10 (đo: đọc 12 bản kèm cột data nặng 169 KB, mất 0,5-2,7 giây, là phần chậm nhất của trang): danh sách chỉ
// lấy vài trường trong data; nội dung đầy đủ chỉ tải cho bản cần hiển thị (loadAppliedPlan, loadPlanById).
export type PlanListRow = {
  id: string;
  generated_by: string;
  applied: boolean;
  applied_at: string | null;
  created_at: string;
  origin: string | null;
  cadence: string | null;
  proposal: { week_start?: string; week_end?: string } | null;
};
const LIST_COLS = 'id, generated_by, applied, applied_at, created_at, origin:data->>origin, cadence:data->>cadence, proposal:data->proposal';

// cache() để layout và trang trong CÙNG một request chỉ đọc một lần.
export const loadPlans = cache(async (client: Client): Promise<{ rows: PlanListRow[]; error: string | null }> => {
  const { data, error } = await client
    .from('mkt_plans')
    .select(LIST_COLS)
    .order('created_at', { ascending: false })
    .limit(12);
  return { rows: (data || []) as unknown as PlanListRow[], error: error ? error.message : null };
});

export const loadAppliedPlan = cache(async (client: Client): Promise<PlanRow | null> => {
  const { data } = await client
    .from('mkt_plans')
    .select(PLAN_COLS)
    .eq('applied', true)
    .order('applied_at', { ascending: false })
    .limit(1);
  return ((data || [])[0] as PlanRow) || null;
});

export async function loadPlanById(client: Client, id: string): Promise<PlanRow | null> {
  const { data } = await client.from('mkt_plans').select(PLAN_COLS).eq('id', id).maybeSingle();
  return (data as PlanRow) || null;
}

// Lần sinh kế hoạch tay gần nhất (banner 60 giây đầu ở layout, dòng nhỏ dưới nút Lưu ở tab Cài đặt).
export const loadLastManualPlan = cache(async (client: Client): Promise<any | null> => {
  const { data } = await client
    .from('run_log')
    .select('status, detail, created_at')
    .eq('task', 'mkt.plan_manual')
    .order('created_at', { ascending: false })
    .limit(1);
  return (data || [])[0] || null;
});

export function fmtDateTime(iso: string | null): string {
  if (!iso) return '';
  // Tự ghép "HH:mm dd/mm" — toLocaleString('vi-VN') trên Node trả "16:10 20-08" (gạch).
  try {
    const p = new Intl.DateTimeFormat('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(new Date(iso));
    const g = (t: string) => p.find((x) => x.type === t)?.value || '';
    return `${g('hour')}:${g('minute')} ${g('day')}/${g('month')}`;
  } catch { return iso; }
}

export function fmtDate(d: string | null): string {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  return day && m && y ? `${day}/${m}/${y}` : d;
}

export const TIER_LABEL: Record<Tier, { text: string; icon: string; cls: string }> = {
  winner: { text: 'Đẩy mạnh', icon: '🏆', cls: 'tone-ok' },
  watch: { text: 'Giữ nhịp', icon: '➖', cls: 'tone-default' },
  weak: { text: 'Đổi góc', icon: '⚠️', cls: 'tone-no' },
  insufficient: { text: 'Gom số liệu', icon: '⏳', cls: 'tone-default' },
  manual: { text: 'Ưu tiên tay', icon: '✋', cls: 'tone-accent' }
};

export const ROLE_LABEL: Record<string, string> = {
  giao_duc: 'Giáo dục', viral: 'Viral', ca_nhan: 'Cá nhân', seeding: 'Seeding', tuong_tac: 'Tương tác',
};

// Tên sản phẩm rác lọt vào weights/products từ bài nhập tay lịch sử (cùng luật productOf
// trong lib/plan.ts) — không hiện lên bảng Sản phẩm ưu tiên.
export function isJunkProduct(name: string): boolean {
  if (!name || name === 'Khác' || name === 'Bài content' || name === 'Bài trend') return true;
  if (name.length > 60 || name.includes('\n')) return true;
  return /\d{9,}/.test(name) || /^bài (fb|đăng tay)/i.test(name);
}
