// Đọc hộp thư nạp CV qua IMAP. Chỉ đọc, không xóa, không trả lời (điều cấm 1).
// Cấu hình lấy từ biến môi trường, KHÔNG hardcode địa chỉ hay mật khẩu (điều cấm 7).
//
// Giai đoạn test dùng hộp thư riêng theo Mức T2 của kế hoạch, không phải tuyendung@sdvico.vn.
// Trước khi CV thật của ứng viên chảy vào, phải đổi sang hộp thư do công ty kiểm soát (điều cấm 6).

import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { detectKind } from './extract.js';

// Ảnh nhỏ hơn ngưỡng này thường là logo chữ ký, không phải CV ảnh. Bỏ qua để khỏi OCR rác.
const MIN_IMAGE_BYTES = Number(process.env.CV_MIN_IMAGE_BYTES || 20000);

export function getMailConfig() {
  const host = process.env.MAIL_IMAP_HOST;
  const user = process.env.MAIL_IMAP_USER;
  const pass = process.env.MAIL_IMAP_PASSWORD;
  if (!host || !user || !pass) {
    throw new Error(
      'Thiếu MAIL_IMAP_HOST, MAIL_IMAP_USER hoặc MAIL_IMAP_PASSWORD. ' +
        'Điền vào .env. Với Gmail phải dùng App Password, không phải mật khẩu tài khoản.'
    );
  }
  return {
    host,
    port: Number(process.env.MAIL_IMAP_PORT || 993),
    secure: String(process.env.MAIL_IMAP_TLS ?? 'true') !== 'false',
    auth: { user, pass },
    mailbox: process.env.MAIL_IMAP_MAILBOX || 'INBOX'
  };
}

// Giữ lại các đính kèm là CV: PDF, DOCX, hoặc ảnh đủ lớn.
function pickCvAttachments(parsed) {
  const out = [];
  for (const att of parsed.attachments || []) {
    const filename = att.filename || 'dinh_kem';
    const mime = att.contentType || '';
    const kind = detectKind(filename, mime);
    if (kind === 'unknown') continue;
    if (kind === 'image' && att.content.length < MIN_IMAGE_BYTES) continue;
    out.push({ filename, mime, buffer: att.content, kind });
  }
  return out;
}

// Mở hộp thư, chạy hàm fn(client, mailboxConfig), rồi đóng gọn gàng dù có lỗi.
export async function withMailbox(config, fn) {
  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.auth,
    logger: false
  });
  await client.connect();
  const lock = await client.getMailboxLock(config.mailbox);
  try {
    return await fn(client, config);
  } finally {
    lock.release();
    await client.logout();
  }
}

// Lấy các thư chưa đọc có đính kèm CV. Không đánh dấu đã đọc ở đây.
// Trả về [{ uid, from, subject, date, attachments: [{filename, mime, buffer, kind}] }].
export async function fetchUnseenCvMessages(client, { limit = 50 } = {}) {
  const messages = [];
  for await (const msg of client.fetch({ seen: false }, { uid: true, source: true, envelope: true })) {
    if (messages.length >= limit) break;
    let parsed;
    try {
      parsed = await simpleParser(msg.source);
    } catch (err) {
      messages.push({ uid: msg.uid, parseError: err.message, attachments: [] });
      continue;
    }
    const attachments = pickCvAttachments(parsed);
    const env = msg.envelope || {};
    const from = env.from && env.from[0] ? env.from[0].address : (parsed.from?.value?.[0]?.address || null);
    messages.push({
      uid: msg.uid,
      from,
      subject: env.subject || parsed.subject || null,
      date: (env.date || parsed.date || null),
      attachments
    });
  }
  return messages;
}

// Đánh dấu một thư đã đọc, gọi sau khi xử lý xong để không nạp lại lượt sau.
export async function markSeen(client, uid) {
  await client.messageFlagsAdd({ uid }, ['\\Seen'], { uid: true });
}
