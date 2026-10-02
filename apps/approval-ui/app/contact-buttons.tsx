'use client';

import { trackContact } from './tracking';

// Nut lien he tren trang public (blog/san-pham). Bam -> ban tracking Contact len Pixel + GA4
// roi mo Messenger / goi / Zalo. Deep link mang theo ref/UTM de doi chieu don ve tu AD.
//
// Bot khong tu nhan tin (dieu cam 1) — day chi la nut cho NGUOI XEM tu bam lien he.
export default function ContactButtons({
  messengerUrl,
  zaloUrl,
  campaign
}: {
  messengerUrl: string;
  zaloUrl: string | null;
  campaign: string;
}) {
  return (
    <div className="contact-btns">
      <a
        className="contact-btn primary"
        href={messengerUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => trackContact('message', campaign)}
      >
        💬 Nhắn tin cho Page SDVICO
      </a>
      {/* 2/10 Thanh chốt: hotline public thống nhất 0939 243 222 (trùng bài bán, thay 0254 của 28/8). */}
      <a
        className="contact-btn"
        href="tel:0939243222"
        onClick={() => trackContact('call', campaign)}
      >
        📞 Gọi 0939 243 222
      </a>
      {zaloUrl ? (
        <a
          className="contact-btn zalo"
          href={zaloUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => trackContact('zalo', campaign)}
        >
          Chat Zalo
        </a>
      ) : null}
    </div>
  );
}
