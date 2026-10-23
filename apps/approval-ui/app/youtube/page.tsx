import { getYouTubeChannelInfo } from '../../lib/youtube-publish';

export const dynamic = 'force-dynamic';

// Trang trạng thái kết nối YouTube. Khác TikTok/Facebook (OAuth trong app), YouTube dùng
// refresh_token đặt sẵn ở 3 biến môi trường Vercel (xem docs/runbook-youtube-setup.md).
// Trang này chỉ HIỂN THỊ trạng thái, không có nút kết nối trong app (làm 1 lần bằng script).
export default async function Page() {
  const info = await getYouTubeChannelInfo();

  return (
    <main>
      <header className="head-row">
        <div>
          <h1>Kết nối YouTube</h1>
        </div>
      </header>

      <section className="card" style={{ display: 'grid', gap: 14, maxWidth: 680 }}>
        <div>
          <b>Trạng thái kết nối</b>
          {info.configured && info.channelTitle ? (
            <>
              <div className="metaline" style={{ marginTop: 6 }}>✅ Đã kết nối kênh: <b>{info.channelTitle}</b></div>
            </>
          ) : info.configured && info.error ? (
            <>
              <div className="metaline" style={{ marginTop: 6 }}>⚠️ Đã đặt token nhưng gọi kênh lỗi: {info.error}</div>
              <div className="metaline">Quyền đăng YouTube có thể đã hết hạn. Báo kỹ thuật cấp lại.</div>
            </>
          ) : (
            <>
              <div className="metaline" style={{ marginTop: 6 }}>❌ Chưa kết nối kênh YouTube. Báo kỹ thuật cài đặt.</div>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
