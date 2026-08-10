// Chuẩn hóa văn bản CV thô thành JSON và rút thông tin liên hệ để khử trùng lặp.
// Không phụ thuộc thư viện ngoài, nên kiểm thử được độc lập.
//
// Ghi chú: bản Ngày 2 rút email, số điện thoại, và đoán tên ở mức cơ bản, kèm toàn văn.
// Việc bóc tách sâu (kỹ năng, kinh nghiệm) để skill cv-screening ở Ngày 3.

// Chuẩn hóa email: cắt khoảng trắng, đưa về chữ thường.
export function normalizeEmail(raw) {
  if (!raw) return null;
  const m = String(raw).match(/[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}/i);
  return m ? m[0].toLowerCase() : null;
}

// Chuẩn hóa số điện thoại Việt Nam về dạng 0xxxxxxxxx.
// Bỏ mọi ký tự không phải số, đổi tiền tố +84 hoặc 84 thành 0, chỉ nhận số hợp lệ dài 10 tới 11 chữ số.
export function normalizePhone(raw) {
  if (!raw) return null;
  let digits = String(raw).replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  if (digits.startsWith('84')) digits = '0' + digits.slice(2);
  if (!digits.startsWith('0') && digits.length >= 9 && digits.length <= 10) digits = '0' + digits;
  // Di động Việt Nam 10 số, một số máy bàn có thể 10 tới 11 số. Nhận 10 tới 11 chữ số bắt đầu bằng 0.
  if (/^0\d{9,10}$/.test(digits)) return digits;
  return null;
}

// Tìm email đầu tiên trong văn bản.
export function findEmail(text) {
  if (!text) return null;
  const m = String(text).match(/[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}/i);
  return m ? normalizeEmail(m[0]) : null;
}

// Tìm số điện thoại đầu tiên trông giống số Việt Nam.
// Bắt các cụm số có thể xen khoảng trắng, chấm, gạch, ngoặc, tiền tố +84.
export function findPhone(text) {
  if (!text) return null;
  const candidates = String(text).match(/(?:\+?84|0)[\d\s.\-()]{8,13}/g);
  if (!candidates) return null;
  for (const c of candidates) {
    const p = normalizePhone(c);
    if (p) return p;
  }
  return null;
}

// Đoán tên ứng viên ở mức cơ bản: dòng đầu không rỗng, không chứa email hay số điện thoại,
// độ dài hợp lý. Đây chỉ là phỏng đoán, người duyệt có thể sửa.
export function guessName(text) {
  if (!text) return null;
  const lines = String(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines.slice(0, 8)) {
    if (line.includes('@')) continue;
    if (/\d{4,}/.test(line)) continue;
    const words = line.split(/\s+/);
    if (words.length >= 2 && words.length <= 6 && line.length <= 60) {
      // Loại các dòng tiêu đề phổ biến.
      if (/^(cv|curriculum|sơ yếu|lý lịch|resume|hồ sơ)\b/i.test(line)) continue;
      return line;
    }
  }
  return null;
}

// Khóa khử trùng lặp. Ưu tiên email, không có thì dùng số điện thoại.
// Trả về null khi không có cả hai, khi đó không khử trùng được, phải để người duyệt xử lý.
export function buildDedupKey({ email, phone }) {
  const e = normalizeEmail(email);
  const p = normalizePhone(phone);
  if (e) return 'email:' + e;
  if (p) return 'phone:' + p;
  return null;
}

// Chuẩn hóa toàn bộ: nhận văn bản thô và ngữ cảnh nguồn, trả JSON ứng viên.
export function normalizeCv(rawText, context = {}) {
  const email = findEmail(rawText);
  const phone = findPhone(rawText);
  const full_name = guessName(rawText);
  return {
    full_name,
    email,
    phone,
    raw_text: (rawText || '').trim(),
    source: context.source || 'email',
    source_message: context.sourceMessage || null,
    attachments: context.attachments || [],
    parsed_at: context.parsedAt || null,
    dedup_key: buildDedupKey({ email, phone })
  };
}
