// Hàm thuần, dùng chung cho cả phía máy chủ và phía trình duyệt.
// Việc: đổi mã kỹ thuật thành chữ tiếng Việt dễ hiểu cho người duyệt.

export type Tone = 'hr' | 'mkt' | 'web' | 'demo' | 'default';

export type KindMeta = { label: string; icon: string; tone: Tone };

// Nhãn loại mục. Mã trong approval_queue.kind đổi thành chữ người đọc hiểu ngay.
export function kindMeta(kind: string): KindMeta {
  switch (kind) {
    case 'hr_email':
      return { label: 'Thư tuyển dụng', icon: '✉️', tone: 'hr' };
    case 'hr_interview':
      return { label: 'Thư mời phỏng vấn', icon: '📅', tone: 'hr' };
    case 'hr_offer':
      return { label: 'Thư mời nhận việc', icon: '🎉', tone: 'hr' };
    case 'hr_reject':
      return { label: 'Thư từ chối', icon: '✉️', tone: 'hr' };
    case 'hr_jd':
      return { label: 'Vị trí tuyển dụng', icon: '💼', tone: 'hr' };
    case 'hr_job_post':
      return { label: 'Tin tuyển dụng', icon: '📣', tone: 'hr' };
    case 'fb_comment_reply':
      return { label: 'Trả lời bình luận', icon: '💬', tone: 'hr' };
    case 'mkt_post':
      return { label: 'Bài marketing', icon: '📣', tone: 'mkt' };
    case 'mkt_publish':
      return { label: 'Đăng nội dung', icon: '🌐', tone: 'mkt' };
    case 'mkt_publish_content':
      return { label: 'Nội dung marketing', icon: '📢', tone: 'mkt' };
    case 'mkt_publish_video':
      return { label: 'Video marketing', icon: '🎬', tone: 'mkt' };
    case 'mkt_publish_reel':
      return { label: 'Reel marketing', icon: '🎞️', tone: 'mkt' };
    case 'mkt_reply':
      return { label: 'Trả lời khách hàng', icon: '💬', tone: 'mkt' };
    case 'browser_action':
      return { label: 'Thao tác web', icon: '🖥️', tone: 'web' };
    case 'browser_barrier':
      return { label: 'Gặp rào chắn web', icon: '🚧', tone: 'web' };
    case 'demo':
      return { label: 'Mục thử', icon: '🧪', tone: 'demo' };
    default:
      return { label: kind, icon: '📄', tone: 'default' };
  }
}

// Nhãn cho các khóa hay gặp trong payload. Khóa lạ thì giữ nguyên.
const FIELD_LABELS: Record<string, string> = {
  ghi_chu: 'Ghi chú',
  sinh_luc: 'Sinh lúc',
  account: 'Tài khoản',
  task: 'Tác vụ',
  message: 'Thông báo',
  screenshotPath: 'Ảnh chụp',
  from: 'Từ',
  to: 'Tới',
  subject: 'Tiêu đề',
  body: 'Nội dung',
  candidate_id: 'Mã ứng viên',
  job_id: 'Mã vị trí',
  post_id: 'Mã tin đăng',
  kenh: 'Kênh',
  dia_diem: 'Địa điểm',
  nguon_soan: 'Nguồn soạn',
  channel: 'Kênh',
  url: 'Đường dẫn',
  ung_vien: 'Ứng viên',
  vi_tri: 'Vị trí',
  email: 'Email',
  thu_moi: 'Thư mời (máy soạn)',
  thu: 'Nội dung thư (máy soạn)',
  cau_hoi_ky_thuat: 'Câu hỏi kỹ thuật',
  cau_hoi_hanh_vi: 'Câu hỏi hành vi',
  bai_ve_nha: 'Bài về nhà',
  khung_gio: 'Khung giờ đề xuất',
  luu_y: 'Lưu ý',
  comment_id: 'Mã bình luận',
  fb_comment_id: 'Mã bình luận Facebook',
  goi_y_tra_loi: 'Gợi ý trả lời (máy soạn)',
  reply_text: 'Nội dung trả lời',
  // Nhánh marketing
  caption: 'Chú thích',
  noi_dung: 'Nội dung',
  text: 'Nội dung',
  keyword: 'Từ khóa',
  intent: 'Mục tiêu',
  format: 'Định dạng',
  channels: 'Kênh đăng',
  assets: 'Ảnh / video đính kèm',
  content_id: 'Mã nội dung',
  ab_pair_id: 'Cặp A/B',
  ab_variant: 'Bản A/B',
  authored: 'Do',
  risk: 'Mức rủi ro',
  has_video: 'Có video',
  post_reel: 'Đăng Reel',
  suggestion_sources: 'Nguồn gợi ý',
  from_plan_direction: 'Theo kế hoạch',
  needs_gov_review: 'Cần duyệt cấp quản lý',
};

// Trường nào là "nội dung chính" cần đưa lên đầu thẻ duyệt (đọc ngay là hiểu bài viết gì)?
// Các trường còn lại đẩy vào phần "Chi tiết kỹ thuật" gập lại để không lấn nội dung.
const PRIMARY_KEYS = new Set([
  'subject', 'body', 'noi_dung', 'text', 'caption',
  'thu_moi', 'thu', 'goi_y_tra_loi', 'reply_text',
]);

// Chia payload thành hai nhóm: primary (đọc ngay) và secondary (kỹ thuật, có thể gập).
export function splitPayload(payload: unknown): { primary: PayloadRow[]; secondary: PayloadRow[] } {
  const rows = payloadRows(payload);
  const primary: PayloadRow[] = [];
  const secondary: PayloadRow[] = [];
  for (const r of rows) {
    if (PRIMARY_KEYS.has(r.key)) primary.push(r);
    else secondary.push(r);
  }
  return { primary, secondary };
}

export function fieldLabel(key: string): string {
  return FIELD_LABELS[key] || key;
}

// Thời gian tương đối, dễ đọc hơn mốc tuyệt đối. Cập nhật mỗi lần trang làm mới.
export function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const secs = Math.round((Date.now() - then) / 1000);
  if (secs < 45) return 'vừa xong';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} phút trước`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} ngày trước`;
  return formatDateTime(iso);
}

// Ngày dd/MM/yyyy — chuẩn hiển thị Việt Nam.
export function formatDate(iso: string | Date | null | undefined): string {
  if (!iso) return '';
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// dd/MM/yyyy HH:mm — không giây, không AM/PM, cùng cách viết ở mọi trang.
export function formatDateTime(iso: string | Date | null | undefined): string {
  if (!iso) return '';
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const date = d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const time = d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${date} ${time}`;
}

export type PayloadRow = { key: string; label: string; value: string; long: boolean };

// Biến payload JSON tùy ý thành các dòng nhãn và giá trị dễ đọc.
// Giá trị là chuỗi hoặc số thì hiện thẳng, là đối tượng hay mảng thì rút gọn thành JSON.
export function payloadRows(payload: unknown): PayloadRow[] {
  if (payload == null) return [];
  if (typeof payload !== 'object' || Array.isArray(payload)) {
    return [{ key: '_', label: 'Dữ liệu', value: safeStringify(payload), long: true }];
  }
  const rows: PayloadRow[] = [];
  for (const [k, v] of Object.entries(payload as Record<string, unknown>)) {
    if (v == null || v === '') continue;
    let value: string;
    let long = false;
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      value = String(v);
      long = value.length > 80;
    } else {
      value = safeStringify(v);
      long = true;
    }
    rows.push({ key: k, label: fieldLabel(k), value, long });
  }
  return rows;
}

// Nhãn và màu cho trạng thái hồ sơ ứng tuyển (hr_applications.stage).
export function stageMeta(stage: string): { label: string; tone: string } {
  switch (stage) {
    case 'new': return { label: 'Mới nhận', tone: 'hr' };
    case 'screening': return { label: 'Đang chấm', tone: 'mkt' };
    case 'review': return { label: 'Chờ xem', tone: 'mkt' };
    case 'interview': return { label: 'Phỏng vấn', tone: 'web' };
    case 'offer': return { label: 'Mời nhận việc', tone: 'ok' };
    case 'rejected': return { label: 'Từ chối', tone: 'no' };
    case 'pool': return { label: 'Lưu nguồn', tone: 'demo' };
    default: return { label: stage, tone: 'default' };
  }
}

// Nhãn các trục điểm chấm CV (khớp packages/hr/src/screen/rubric.js).
const AXIS_LABELS: Record<string, string> = {
  chuyen_mon: 'Chuyên môn',
  kinh_nghiem: 'Kinh nghiệm',
  thanh_tuu: 'Thành tựu',
  ky_nang_mem: 'Kỹ năng mềm',
  on_dinh: 'Ổn định'
};

export function axisLabel(key: string): string {
  return AXIS_LABELS[key] || key;
}

// Nhãn kênh đăng tin. Nguồn sự thật ở lib/channels.ts (registry) để không lặp nhiều nơi.
import { channelLabel } from '../lib/channels';

export function kenhLabel(kenh?: string | null): string {
  return channelLabel(kenh);
}

// Nhãn nguồn ứng viên.
export function sourceLabel(source?: string | null): string {
  switch (source) {
    case 'email': return 'Hộp thư';
    case 'verify-synthetic': return 'Dữ liệu test';
    case 'dry-file': return 'Tệp cục bộ';
    default: return source || 'Không rõ';
  }
}

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}
