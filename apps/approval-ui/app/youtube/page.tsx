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
          <p className="sub">Đăng video dọc (9:16) lên kênh YouTube dưới dạng Shorts. Cấu hình một lần bằng token, sau đó bài có video tự đăng khi được duyệt.</p>
        </div>
      </header>

      <section className="card" style={{ display: 'grid', gap: 14, maxWidth: 680 }}>
        <div>
          <b>Trạng thái kết nối</b>
          {info.configured && info.channelTitle ? (
            <>
              <div className="metaline" style={{ marginTop: 6 }}>✅ Đã kết nối kênh: <b>{info.channelTitle}</b></div>
              <div className="metaline">Bài có video dọc sẽ tự đăng lên đây khi người duyệt bấm Duyệt.</div>
            </>
          ) : info.configured && info.error ? (
            <>
              <div className="metaline" style={{ marginTop: 6 }}>⚠️ Đã đặt token nhưng gọi kênh lỗi: {info.error}</div>
              <div className="metaline">Token có thể đã hết hạn (chế độ Testing hết hạn sau 7 ngày). Chạy lại script lấy token mới, cập nhật biến <code>YOUTUBE_REFRESH_TOKEN</code> trên Vercel rồi Redeploy.</div>
            </>
          ) : (
            <>
              <div className="metaline" style={{ marginTop: 6 }}>❌ Chưa kết nối. Thiếu một trong ba biến môi trường trên Vercel:</div>
              <div className="metaline"><code>YOUTUBE_CLIENT_ID</code></div>
              <div className="metaline"><code>YOUTUBE_CLIENT_SECRET</code></div>
              <div className="metaline"><code>YOUTUBE_REFRESH_TOKEN</code></div>
            </>
          )}
        </div>

        <div style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }}>
          <b>Cách hoạt động</b>
          <ol style={{ margin: '6px 0 0', paddingLeft: 20, lineHeight: 1.7 }}>
            <li>Cron sinh bài có video, hệ thống tự thêm kênh YouTube vào bài.</li>
            <li>Người duyệt vào hàng đợi, bấm Duyệt.</li>
            <li>Bản video dọc 9:16 được đăng lên kênh dưới dạng Shorts (kèm mô tả, hashtag, số tổng đài).</li>
          </ol>
        </div>

        <div style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }}>
          <b>Lưu ý</b>
          <div className="metaline" style={{ marginTop: 6 }}>Cách lấy token và cấu hình: xem file <code>docs/runbook-youtube-setup.md</code> trong mã nguồn.</div>
          <div className="metaline">App đang chế độ Testing nên token sống khoảng 7 ngày. Hết hạn thì chạy lại script lấy token mới. Muốn bền lâu thì publish app trong Google Auth Platform (mục Audience).</div>
        </div>
      </section>
    </main>
  );
}
