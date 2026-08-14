// Gửi email cho ứng viên qua Gmail SMTP (nodemailer).
// Điều cấm 1: chỉ gửi khi người dùng bấm Duyệt (người bấm = người gửi), không tự động.
// Cần env: SMTP_USER (địa chỉ Gmail), SMTP_PASS (Mật khẩu ứng dụng của Gmail), SMTP_FROM (tùy chọn).

import nodemailer from 'nodemailer';

// Dùng SMTP_* nếu có; nếu không, tái dùng chính Gmail + app password của IMAP
// (MAIL_IMAP_USER/MAIL_IMAP_PASSWORD) vì Gmail dùng chung app password cho cả đọc và gửi.
function creds(): { user?: string; pass?: string } {
  return {
    user: process.env.SMTP_USER || process.env.MAIL_IMAP_USER,
    pass: process.env.SMTP_PASS || process.env.MAIL_IMAP_PASSWORD,
  };
}

export function mailerConfigured(): boolean {
  const { user, pass } = creds();
  return Boolean(user && pass);
}

export async function sendEmail(opts: { to: string; subject: string; text: string }): Promise<void> {
  const { user, pass } = creds();
  if (!user || !pass) throw new Error('Chưa cấu hình SMTP_USER/SMTP_PASS (hoặc MAIL_IMAP_USER/MAIL_IMAP_PASSWORD) để gửi mail.');
  if (!opts.to || !opts.to.includes('@')) throw new Error('Địa chỉ email người nhận không hợp lệ.');

  const from = process.env.SMTP_FROM || `SDVICO Tuyển dụng <${user}>`;
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });
  await transporter.sendMail({ from, to: opts.to, subject: opts.subject, text: opts.text });
}
