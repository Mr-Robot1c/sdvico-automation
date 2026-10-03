// CHẾ ĐỘ DEMO (3/10, đóng gói chào bán theo lệnh sếp Long): sếp demo trên HỆ THỐNG THẬT cho đối tác, nên
// dữ liệu cá nhân của khách phải che. Bật/tắt bằng cookie sdvico_demo=1 (route /api/che-do-demo, nút ở chân
// menu). Che ở TẦNG DỮ LIỆU của từng trang (sau khi đọc DB, trước khi render) để không lọt qua props client.
// Không đổi gì trong DB. Tuyển dụng đã ẩn ở production bằng MARKETING_ONLY.
import { cookies } from 'next/headers';

export const DEMO_COOKIE = 'sdvico_demo';

export function isDemoMode(): boolean {
  try {
    return cookies().get(DEMO_COOKIE)?.value === '1';
  } catch {
    return false;
  }
}

// "Toản Hà" -> "T*** H**". Giữ chữ cái đầu mỗi từ để người demo vẫn phân biệt được các dòng.
export function maskName(name: string | null | undefined): string {
  const s = String(name || '').trim();
  if (!s) return 'Khách';
  return s
    .split(/\s+/)
    .map((w) => {
      const chars = [...w];
      return chars[0] + '*'.repeat(Math.max(2, Math.min(4, chars.length - 1)));
    })
    .join(' ');
}

// Che số điện thoại (9 tới 11 chữ số, cho phép cách bằng dấu cách/chấm/gạch, có thể +84) và email trong văn bản tự do.
const PHONE_RE = /(\+?84|0)(?:[\s.\-]?\d){8,10}/g;
const EMAIL_RE = /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g;
export function maskContacts(text: string | null | undefined): string {
  return String(text || '')
    .replace(EMAIL_RE, '***@***')
    .replace(PHONE_RE, (m) => m.replace(/\d/g, (d, i: number) => (i < 2 ? d : 'x')));
}

// Che tên khách xuất hiện trong văn bản (nháp trả lời hay chào "anh Toản"), cộng số điện thoại/email.
export function maskTextFor(text: string | null | undefined, name: string | null | undefined): string {
  let out = maskContacts(text);
  const words = String(name || '').trim().split(/\s+/).filter((w) => [...w].length >= 2);
  for (const w of words) {
    const re = new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'giu');
    out = out.replace(re, maskName(w));
  }
  return out;
}
