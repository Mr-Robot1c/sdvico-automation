import Link from 'next/link';
import { getServerClient } from '../../lib/supabase-server';
import { getYouTubeChannelInfo } from '../../lib/youtube-publish';

export const dynamic = 'force-dynamic';

// TRANG GỘP 3 kênh kết nối (sếp chốt 20/8: "3 cái gộp chung 1 cái luôn, nhiều quá mà chả có
// tích sự gì"). Mỗi kênh 1 dòng trạng thái tóm gọn; trang chi tiết cũ (/facebook /tiktok
// /youtube) vẫn sống, bấm "Chi tiết" khi cần soi sâu.

async function fbStatus(): Promise<{ ok: boolean; text: string }> {
  const TOKEN = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
  if (!TOKEN) return { ok: false, text: 'Chưa đặt token (FACEBOOK_PAGE_ACCESS_TOKEN trên Vercel).' };
  try {
    const VERSION = process.env.FACEBOOK_GRAPH_VERSION || 'v21.0';
    // no-store: tranh Next Data Cache dong bang response loi (cung bai hoc voi YouTube 20/8).
    const r = await fetch(`https://graph.facebook.com/${VERSION}/me?fields=name`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
      cache: 'no-store'
    });
    const j: any = await r.json();
    if (j?.error) return { ok: false, text: `Token lỗi: ${j.error.message}` };
    return { ok: true, text: `Đã kết nối Page: ${j?.name || '(không đọc được tên)'}. Máy tự đăng khi bấm Duyệt.` };
  } catch (e: any) {
    return { ok: false, text: 'Không gọi được Facebook: ' + String(e?.message || e) };
  }
}

async function tiktokStatus(): Promise<{ ok: boolean; text: string }> {
  try {
    const client = getServerClient();
    const { data } = await client
      .from('mkt_oauth_tokens')
      .select('open_id, scope, refresh_expires_at')
      .eq('provider', 'tiktok')
      .maybeSingle();
    if (!data) return { ok: false, text: 'Chưa kết nối. Vào trang chi tiết bấm Kết nối TikTok.' };
    const hasPublish = String((data as any).scope || '').includes('video.publish');
    return {
      ok: hasPublish,
      text: hasPublish
        ? 'Đã kết nối, máy tự đăng video khi bấm Duyệt. Chưa qua audit nên chỉ đăng được chế độ riêng tư/bạn bè.'
        : 'Đã kết nối nhưng thiếu quyền video.publish — kết nối lại ở trang chi tiết.'
    };
  } catch {
    return { ok: false, text: 'Không đọc được trạng thái token.' };
  }
}

export default async function Page() {
  const [fb, tt, yt] = await Promise.all([fbStatus(), tiktokStatus(), getYouTubeChannelInfo()]);
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
    }
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
