import Link from 'next/link';
import { getServerClient } from '../../lib/supabase-server';
import { getYouTubeChannelInfo } from '../../lib/youtube-publish';
import { zaloOaStatus } from '../../lib/zalo-oa';
import { fbStatus, tiktokStatus } from '../../lib/platform-status';

export const dynamic = 'force-dynamic';

// TRANG GỘP 3 kênh kết nối (sếp chốt 20/8: "3 cái gộp chung 1 cái luôn, nhiều quá mà chả có
// tích sự gì"). Mỗi kênh 1 dòng trạng thái tóm gọn; trang chi tiết cũ (/facebook /tiktok
// /youtube) vẫn sống, bấm "Chi tiết" khi cần soi sâu.
// fbStatus + tiktokStatus chuyển sang lib/platform-status.ts (21/8) vì /tong-quan cũng cần.

export default async function Page() {
  const client = getServerClient();
  const [fb, tt, yt, za] = await Promise.all([fbStatus(), tiktokStatus(), getYouTubeChannelInfo(), zaloOaStatus(client)]);
  const rows = [
    { icon: '📘', name: 'Facebook', status: fb.ok, text: fb.text, href: '/facebook' },
    { icon: '🎵', name: 'TikTok', status: tt.ok, text: tt.text, href: '/tiktok' },
    {
      icon: '▶️', name: 'YouTube',
      status: !!(yt.configured && yt.channelTitle),
      text: yt.configured && yt.channelTitle
        ? `Đã kết nối kênh: ${yt.channelTitle}. Video dọc tự đăng thành Shorts khi bấm Duyệt.`
        : yt.configured
          ? `Token lỗi: ${yt.error || 'không rõ'}. Có thể hết hạn (7 ngày ở chế độ Testing) — lấy token mới theo runbook.`
          : 'Chưa cấu hình 3 biến YOUTUBE_* trên Vercel (xem docs/runbook-youtube-setup.md).',
      href: '/youtube'
    },
    { icon: '💬', name: 'Zalo OA', status: za.configured, text: za.text, href: '/ket-noi' }
  ];

  return (
    <main>
      <header className="head-row">
        <div>
          <h1>Kết nối kênh đăng</h1>
          <p className="sub">Ba kênh máy tự đăng khi người bấm Duyệt. Xanh là chạy được, đỏ là cần cấu hình lại.</p>
        </div>
      </header>

      <section style={{ display: 'grid', gap: 12, maxWidth: 720 }}>
        {rows.map((r) => (
          <div key={r.name} className="card" style={{ display: 'flex', gap: 14, alignItems: 'flex-start', padding: 16 }}>
            <span style={{ fontSize: 26 }} aria-hidden="true">{r.icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <b>{r.name}</b>
                <span className={`badge ${r.status ? 'tone-ok' : 'tone-no'}`}>{r.status ? '✅ Sẵn sàng' : '⛔ Cần cấu hình'}</span>
              </div>
              <p className="sub" style={{ margin: '4px 0 0' }}>{r.text}</p>
            </div>
            <Link className="btn ghost sm" href={r.href} style={{ flex: '0 0 auto' }}>Chi tiết</Link>
          </div>
        ))}
      </section>
    </main>
  );
}
