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
      {/* 28/8 sếp đổi hotline nút liên hệ public: 0254 359 6868 (số trên sdvico.vn). */}
      <a
        className="contact-btn"
        href="tel:02543596868"
        onClick={() => trackContact('call', campaign)}
      >
        📞 Gọi 0254 359 6868
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
