'use client';

import Script from 'next/script';

// Meta Pixel + Google Analytics 4 cho trang CONG KHAI (item 4, 20/8). Chi nhung o /blog,
// /san-pham (RootShell nhanh public) — KHONG gan o trang duyet noi bo (khong theo doi nhan vien).
//
// Muc dich: nguoi quan ly chay AD tay tren FB Ads Manager / Google Ads; Pixel + GA4 DO don ve
// (nguoi vao trang, bam nhan tin, goi dien) de biet campaign nao hieu qua. Bot khong tu chay AD.
//
// pixelId + ga4Id doc tu app_config (dat qua UI /quang-cao). Rong -> khong chen gi (khong loi).
export default function Tracking({ pixelId, ga4Id }: { pixelId?: string | null; ga4Id?: string | null }) {
  return (
    <>
      {pixelId ? (
        <>
          <Script id="meta-pixel" strategy="afterInteractive">
            {`!function(f,b,e,v,n,t,s)
            {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
            n.callMethod.apply(n,arguments):n.queue.push(arguments)};
            if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
            n.queue=[];t=b.createElement(e);t.async=!0;
            t.src=v;s=b.getElementsByTagName(e)[0];
            s.parentNode.insertBefore(t,s)}(window,document,'script',
            'https://connect.facebook.net/en_US/fbevents.js');
            fbq('init', '${pixelId}');
            fbq('track', 'PageView');`}
          </Script>
          <noscript>
            <img
              height="1"
              width="1"
              style={{ display: 'none' }}
              alt=""
              src={`https://www.facebook.com/tr?id=${pixelId}&ev=PageView&noscript=1`}
            />
          </noscript>
        </>
      ) : null}

      {ga4Id ? (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${ga4Id}`} strategy="afterInteractive" />
          <Script id="ga4-init" strategy="afterInteractive">
            {`window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${ga4Id}');`}
          </Script>
        </>
      ) : null}
    </>
  );
}

// Ghi 1 su kien chuyen doi (nhan tin / goi dien) len ca Pixel + GA4. Goi tu nut CTA public.
export function trackContact(kind: 'message' | 'call' | 'zalo', label?: string) {
  try {
    const w = window as any;
    if (typeof w.fbq === 'function') w.fbq('track', 'Contact', { content_name: label || kind, method: kind });
    if (typeof w.gtag === 'function') w.gtag('event', 'contact', { method: kind, label: label || kind });
  } catch { /* khong de loi tracking chan dieu huong */ }
}
