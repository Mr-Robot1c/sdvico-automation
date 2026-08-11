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
    case 'mkt_post':
      return { label: 'Bài marketing', icon: '📣', tone: 'mkt' };
    case 'mkt_publish':
      return { label: 'Đăng nội dung', icon: '🌐', tone: 'mkt' };
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
  channel: 'Kênh',
  url: 'Đường dẫn',
  ung_vien: 'Ứng viên',
  vi_tri: 'Vị trí',
  email: 'Email',
  thu_moi: 'Thư mời (máy soạn)',
  cau_hoi_ky_thuat: 'Câu hỏi kỹ thuật',
  cau_hoi_hanh_vi: 'Câu hỏi hành vi',
  bai_ve_nha: 'Bài về nhà',
  khung_gio: 'Khung giờ đề xuất',
  luu_y: 'Lưu ý'
};

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
  return new Date(iso).toLocaleString('vi-VN');
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
