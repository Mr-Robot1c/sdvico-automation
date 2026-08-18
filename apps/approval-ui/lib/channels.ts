// Channel registry — nguồn sự thật khai báo cho mọi kênh đăng tuyển.
// Dùng chung cho server (actions, cron) LẪN client component ('use client'),
// nên KHÔNG import gì server-only ở đây (không getServerClient, không secrets — điều cấm 7).
//
// Phương thức đăng (method):
//  - 'api'    : có worker tự đăng sau khi duyệt (Facebook, LinkedIn khi đã nối credentials).
//  - 'manual' : không có worker. Hai đường cho người vận hành:
//       (a) đăng có hỗ trợ  : máy soạn nháp -> duyệt -> người đăng ngoài -> dán link về.
//       (b) track-only      : người tự đăng thẳng trên nền tảng -> chỉ ghi nhận link + ảnh.
//
// Thêm một sàn mới = thêm một dòng vào CHANNELS + seed hr_platforms (migration) + bật ở trang Kênh.
// Không phải sửa code lõi.

import type { SupabaseClient } from '@supabase/supabase-js';

export type ChannelMethod = 'api' | 'manual';
export type ManualDefault = 'assisted' | 'track_only';
export type ChannelLoai = 'social' | 'job_board' | 'other';

export type Channel = {
  kenh: string;              // khóa, khớp hr_job_posts.kenh và hr_platforms.kenh
  ten: string;               // tên hiển thị
  loai: ChannelLoai;
  method: ChannelMethod;
  manual_default?: ManualDefault; // chỉ dùng khi method='manual': nút nào nổi bật (luôn có cả hai)
  jd_variant: string;        // khóa trong hr_jobs.jd_versions để lấy nội dung đúng độ dài
  post_url: string | null;   // trang đăng của nền tảng (nút "Mở kênh để đăng")
  field_hints: string[];     // gợi ý điền field khi đăng tay
  char_limit: number | null;
};

// [CẦN XÁC NHẬN với Phòng Nhân sự: URL trang đăng nhà tuyển dụng chính xác từng sàn.
//  Dưới đây là trang nhà tuyển dụng mặc định hợp lý, chỉnh lại khi có tài khoản thật.]
export const CHANNELS: Channel[] = [
  {
    kenh: 'facebook',
    ten: 'Facebook',
    loai: 'social',
    method: 'api',
    jd_variant: 'facebook',
    post_url: null, // đăng qua Graph API, không cần mở trang
    field_hints: [],
    char_limit: null,
  },
  {
    kenh: 'linkedin',
    ten: 'LinkedIn',
    loai: 'social',
    method: 'api', // có adapter API; khi chưa nối credentials thì đăng tay (assisted)
    manual_default: 'assisted',
    jd_variant: 'job_board',
    post_url: 'https://www.linkedin.com/company/',
    field_hints: ['Nội dung bài đăng (dán toàn bộ)', 'Ảnh đính kèm (tải poster)'],
    char_limit: 3000,
  },
  {
    kenh: 'topcv',
    ten: 'TopCV',
    loai: 'job_board',
    method: 'manual',
    manual_default: 'track_only',
    jd_variant: 'job_board',
    post_url: 'https://tuyendung.topcv.vn/',
    field_hints: ['Tiêu đề tin', 'Ngành nghề', 'Địa điểm', 'Mức lương', 'Mô tả công việc', 'Yêu cầu', 'Quyền lợi', 'Email nhận CV', 'Hạn nộp'],
    char_limit: null,
  },
  {
    kenh: 'vietnamworks',
    ten: 'VietnamWorks',
    loai: 'job_board',
    method: 'manual',
    manual_default: 'track_only',
    jd_variant: 'job_board',
    post_url: 'https://employer.vietnamworks.com/',
    field_hints: ['Chức danh', 'Cấp bậc', 'Địa điểm', 'Lương', 'Mô tả công việc', 'Yêu cầu công việc', 'Phúc lợi', 'Email nhận hồ sơ'],
    char_limit: null,
  },
  {
    kenh: 'careerbuilder',
    ten: 'CareerBuilder',
    loai: 'job_board',
    method: 'manual',
    manual_default: 'track_only',
    jd_variant: 'job_board',
    post_url: 'https://careerbuilder.vn/vi/employers',
    field_hints: ['Tên vị trí', 'Ngành nghề', 'Nơi làm việc', 'Mức lương', 'Mô tả', 'Yêu cầu', 'Quyền lợi', 'Thông tin liên hệ'],
    char_limit: null,
  },
  {
    kenh: 'itviec',
    ten: 'ITviec',
    loai: 'job_board',
    method: 'manual',
    manual_default: 'track_only',
    jd_variant: 'job_board',
    post_url: 'https://itviec.com/employer',
    field_hints: ['Job title', 'Skills/Tech', 'Location', 'Salary', 'Job description', 'Requirements', 'Benefits'],
    char_limit: null,
  },
  {
    kenh: 'vieclam24h',
    ten: 'Vieclam24h',
    loai: 'job_board',
    method: 'manual',
    manual_default: 'track_only',
    jd_variant: 'job_board',
    post_url: 'https://vieclam24h.vn/',
    field_hints: ['Tiêu đề tuyển dụng', 'Ngành nghề', 'Khu vực', 'Mức lương', 'Mô tả công việc', 'Yêu cầu', 'Quyền lợi', 'Liên hệ'],
    char_limit: null,
  },
];

const BY_KENH = new Map(CHANNELS.map((c) => [c.kenh, c]));

// Nhãn cho các kenh cũ/khác không nằm trong registry, để hiển thị không vỡ.
const LEGACY_LABELS: Record<string, string> = {
  zalo: 'Zalo', job_board: 'Trang tuyển dụng', website: 'Website', other: 'Khác',
};

export function getChannel(kenh?: string | null): Channel | undefined {
  if (!kenh) return undefined;
  return BY_KENH.get(kenh);
}

// Phương thức của một kenh. Giá trị lạ/cũ (zalo, website, other, job_board) coi như thủ công
// để không bao giờ tự động đăng ngoài ý muốn.
export function channelMethod(kenh?: string | null): ChannelMethod {
  return getChannel(kenh)?.method ?? 'manual';
}

export function isManual(kenh?: string | null): boolean {
  return channelMethod(kenh) === 'manual';
}

// Nhãn hiển thị. Ưu tiên registry, rồi nhãn cũ, cuối cùng trả nguyên mã.
export function channelLabel(kenh?: string | null): string {
  if (!kenh) return 'Khác';
  return BY_KENH.get(kenh)?.ten || LEGACY_LABELS[kenh] || kenh;
}

export function channelPostUrl(kenh?: string | null): string | null {
  return getChannel(kenh)?.post_url ?? null;
}

// Chế độ đăng tay mặc định cho UI. api -> không áp dụng.
export function manualDefault(kenh?: string | null): ManualDefault {
  return getChannel(kenh)?.manual_default ?? 'assisted';
}

export function methodLabel(kenh?: string | null): string {
  return channelMethod(kenh) === 'api' ? 'Tự động (API)' : 'Đăng thủ công';
}

// Kênh do người dùng THÊM từ web chỉ nằm trong hr_platforms (không có trong CHANNELS code).
// Luôn là 'manual', dùng bản JD job_board, gợi ý field chung. post_url lấy từ cột hr_platforms.
type PlatformRow = { kenh: string | null; ten: string | null; loai: string | null; bat: boolean; post_url: string | null };

const GENERIC_HINTS = ['Tiêu đề tin', 'Địa điểm', 'Mức lương', 'Mô tả công việc', 'Yêu cầu', 'Quyền lợi', 'Cách ứng tuyển'];

function dbRowToChannel(r: PlatformRow): Channel {
  return {
    kenh: r.kenh as string,
    ten: r.ten || (r.kenh as string),
    loai: (r.loai as ChannelLoai) || 'job_board',
    method: 'manual',
    manual_default: 'track_only',
    jd_variant: 'job_board',
    post_url: r.post_url || null,
    field_hints: GENERIC_HINTS,
    char_limit: null,
  };
}

// Kênh kèm cờ builtin (kênh code, không xóa được) và enabled (bat trong hr_platforms).
export type ChannelView = Channel & { builtin: boolean; enabled: boolean };

// import type SupabaseClient: chỉ mượn kiểu, bị xóa khi build — KHÔNG kéo code server vào client bundle.
async function readPlatforms(client: SupabaseClient): Promise<PlatformRow[]> {
  try {
    // Thử đọc kèm post_url; nếu chưa migrate cột đó (migration 2), lùi về bản không có post_url
    // để app không vỡ (mọi kênh vẫn hiện đúng bật/tắt).
    const full = await client.from('hr_platforms').select('kenh, ten, loai, bat, post_url');
    const rows = full.error
      ? (await client.from('hr_platforms').select('kenh, ten, loai, bat')).data
      : full.data;
    return ((rows as PlatformRow[] | null) || []).filter((r) => r.kenh);
  } catch {
    // Chưa migrate cả cột kenh (migration 1): coi như chưa có kênh nào cấu hình.
    return [];
  }
}

// TẤT CẢ kênh: built-in (code) trước, rồi kênh người dùng tự thêm (chỉ trong DB).
// Built-in lấy method/jd_variant... từ code (code thắng), chỉ mượn trạng thái bật/tắt từ DB.
export async function getAllChannels(client: SupabaseClient): Promise<ChannelView[]> {
  const rows = await readPlatforms(client);
  const byKenh = new Map(rows.map((r) => [r.kenh as string, r]));
  const views: ChannelView[] = [];
  for (const c of CHANNELS) {
    views.push({ ...c, builtin: true, enabled: !!byKenh.get(c.kenh)?.bat });
  }
  for (const r of rows) {
    if (BY_KENH.has(r.kenh as string)) continue; // đã có ở built-in
    views.push({ ...dbRowToChannel(r), builtin: false, enabled: !!r.bat });
  }
  return views;
}

// Các kênh đang BẬT (built-in + người dùng thêm), theo thứ tự trên.
export async function enabledChannels(client: SupabaseClient): Promise<Channel[]> {
  return (await getAllChannels(client)).filter((c) => c.enabled);
}

// Giải một kenh về Channel: ưu tiên registry code, rồi tra hr_platforms (kênh người dùng thêm).
export async function resolveChannel(client: SupabaseClient, kenh: string): Promise<Channel | undefined> {
  const c = getChannel(kenh);
  if (c) return c;
  try {
    const { data } = await client.from('hr_platforms').select('kenh, ten, loai, bat, post_url').eq('kenh', kenh).maybeSingle();
    const row = data as PlatformRow | null;
    if (row?.kenh) return dbRowToChannel(row);
  } catch {
    // bỏ qua
  }
  return undefined;
}
