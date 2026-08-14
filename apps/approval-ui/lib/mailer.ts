// Gửi email cho ứng viên qua Gmail SMTP (nodemailer).
// Điều cấm 1: chỉ gửi khi người dùng bấm Duyệt (người bấm = người gửi), không tự động.
// Cần env: SMTP_USER (địa chỉ Gmail), SMTP_PASS (Mật khẩu ứng dụng của Gmail), SMTP_FROM (tùy chọn).

import nodemailer from 'nodemailer';

export function mailerConfigured(): boolean {
  return Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);
}

export async function sendEmail(opts: { to: string; subject: string; text: string }): Promise<void> {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!user || !pass) throw new Error('Chưa cấu hình SMTP_USER/SMTP_PASS để gửi mail.');
  if (!opts.to || !opts.to.includes('@')) throw new Error('Địa chỉ email người nhận không hợp lệ.');

  const from = process.env.SMTP_FROM || `SDVICO Tuyển dụng <${user}>`;
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });
  await transporter.sendMail({ from, to: opts.to, subject: opts.subject, text: opts.text });
}
