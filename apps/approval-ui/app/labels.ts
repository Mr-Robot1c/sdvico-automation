// Hàm thuần, dùng chung cho cả phía máy chủ và phía trình duyệt.
// Việc: đổi mã kỹ thuật thành chữ tiếng Việt dễ hiểu cho người duyệt.

export type Tone = 'hr' | 'mkt' | 'web' | 'demo' | 'default';

export type KindMeta = { label: string; icon: string; tone: Tone };

// Nhãn loại mục. Mã trong approval_queue.kind đổi thành chữ người đọc hiểu ngay.
export function kindMeta(kind: string): KindMeta {
  switch (kind) {
    case 'hr_email':
      return { label: 'Thư tuyển dụng', icon: '✉️', tone: 'hr' };
    case 'mkt_post':
      return { label: 'Bài marketing', icon: '📣', tone: 'mkt' };
    case 'mkt_publish':
      return { label: 'Đăng nội dung', icon: '🌐', tone: 'mkt' };
    case 'mkt_publish_content':
      return { label: 'Bài chờ duyệt', icon: '📝', tone: 'mkt' };
    case 'mkt_send_message':
      return { label: 'Tin nhắn chăm sóc', icon: '💬', tone: 'mkt' };
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
  url: 'Đường dẫn'
};

export function fieldLabel(key: string): string {
  if (FIELD_LABELS[key]) return FIELD_LABELS[key];
  const s = key.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Nhãn định dạng nội dung marketing.
export function formatLabel(f?: string): string {
  switch (f) {
    case 'article': return 'Bài website';
    case 'social': return 'Bài Facebook';
    case 'video': return 'Kịch bản video';
    default: return f || 'Bài viết';
  }
}

// Nhãn độ dài text (loại theo độ dài nội dung, KHÔNG phải kênh đăng).
export function lengthLabel(f?: string): string {
  switch (f) {
    case 'article': return 'Bài dài';
    case 'social': return 'Bài ngắn';
    case 'video': return 'Kịch bản video';
    default: return f || 'Bài viết';
  }
}

// Nhãn loại content (để so sánh hiệu quả A/B).
export function contentTypeLabel(t?: string | null): string {
  switch (t) {
    case 'tips': return 'Tips / Giáo dục';
    case 'sales': return 'Bán hàng';
    case 'review': return 'Review';
    case 'ugc': return 'UGC';
    case 'other': return 'Khác';
    default: return t || 'Chưa phân loại';
  }
}

// Nhãn kênh đăng THẬT, lấy từ brief.channels (facebook, tiktok, website). Đăng ở đâu ghi ở đó.
// Trống thì mặc định Facebook.
// postReel=true (bài bán hàng có video AI gộp): Facebook đăng cả Post lẫn Reel -> ghi rõ
// "Facebook (Post + Reel)" để người duyệt biết trước khi bấm (user chốt 18/8).
export function channelsLabel(channels?: string[] | null, postReel?: boolean): string {
  const map: Record<string, string> = { facebook: postReel ? 'Facebook (Post + Reel)' : 'Facebook', tiktok: 'TikTok', website: 'Website', youtube: 'YouTube' };
  const arr = Array.isArray(channels) && channels.length ? channels : ['facebook'];
  return arr.map((c) => map[c] || c).join(' + ');
}

// Nhãn mục đích bài: bán hàng hay nội dung nuôi trang. Rõ hơn nhãn "ý định" SEO.
export function purposeLabel(postKind?: string, format?: string): string {
  if (postKind === 'content') return 'Nội dung';
  if (format === 'social') return 'Bán hàng';
  return '';
}

// Nhãn ý định tìm kiếm.
export function intentLabel(i?: string): string {
  switch (i) {
    case 'thong_tin': return 'Thông tin';
    case 'thuong_mai': return 'So sánh';
    case 'giao_dich': return 'Giao dịch';
    case 'dieu_huong': return 'Điều hướng';
    default: return i || '';
  }
}

// Nhãn và màu mức rủi ro.
export function riskMeta(r?: string): { label: string; tone: string } {
  switch (r) {
    case 'red': return { label: 'Cần xem xét hoặc ưu tiên', tone: 'no' };
    case 'amber': return { label: 'Cần rà lại', tone: 'demo' };
    default: return { label: 'Sạch', tone: 'ok' };
  }
}

// Nhãn cho từng nhóm cờ tuân thủ.
export const COMPLIANCE_LABELS: Record<string, string> = {
  regulation: 'Chạm quy định',
  partner: 'Nhắc đối tác',
  unverifiedSpecs: 'Thông số chưa xác nhận',
  testSpecs: 'Thông số test',
  style: 'Lỗi giọng văn'
};

// Thời gian tương đối, dễ đọc hơn mốc tuyệt đối. Cập nhật mỗi lần trang làm mới.
// Ngày + giờ đầy đủ theo giờ Việt Nam: "18/08/2026 17:05". Ép múi giờ Asia/Ho_Chi_Minh vì
// server Vercel chạy UTC — toLocaleString mặc định sẽ lệch 7 tiếng (user 18/8: "thêm giờ để
// biết chính xác khi nào").
export function formatDateTimeVN(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false
  });
}

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
