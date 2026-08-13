import { getServerClient } from '../../lib/supabase-server';
import { isEmergencyStopped, getPostCount, todayVN } from '../../lib/safety';
import { toggleEmergencyStop } from '../actions';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const client = getServerClient();
  const limit = Number(process.env.MKT_MAX_POSTS_PER_DAY) || 3;
  const [stopped, fb, tt] = await Promise.all([
    isEmergencyStopped(client),
    getPostCount(client, 'facebook'),
    getPostCount(client, 'tiktok')
  ]);

  return (
    <main>
      <header className="head-row">
        <div>
          <h1>Vận hành</h1>
          <p className="sub">Công tắc dừng khẩn và hạn mức đăng bài trong ngày (cổng an toàn Phần 5.4).</p>
        </div>
      </header>

      <section className={`card tone-${stopped ? 'no' : 'ok'}`} style={{ display: 'grid', gap: 10, maxWidth: 620 }}>
        <b>Công tắc dừng khẩn</b>
        <p>
          Trạng thái:{' '}
          {stopped ? (
            <b style={{ color: 'var(--no, #e23b2e)' }}>🔴 ĐANG DỪNG — mọi bài Duyệt sẽ KHÔNG đăng lên nền tảng</b>
          ) : (
            <b>🟢 Đang chạy bình thường</b>
          )}
        </p>
        <form action={toggleEmergencyStop}>
          <input type="hidden" name="on" value={stopped ? '0' : '1'} />
          <button className={`btn ${stopped ? 'ok' : 'no'}`} type="submit">
            {stopped ? '▶ Bật lại (cho phép đăng)' : '🛑 DỪNG KHẨN (chặn mọi đăng bài)'}
          </button>
        </form>
        <p className="muted">
          Khi bật, luồng Duyệt kiểm công tắc TRƯỚC khi đăng nên chặn ngay. Bài vẫn được đánh dấu đã duyệt,
          chỉ không lên nền tảng cho tới khi tắt công tắc.
        </p>
      </section>

      <section className="card" style={{ display: 'grid', gap: 6, maxWidth: 620, marginTop: 16 }}>
        <b>Hạn mức hôm nay ({todayVN()}) — tối đa {limit} bài mỗi kênh</b>
        <div className="metaline">Facebook: <b>{fb}/{limit}</b> {fb >= limit ? '⛔ đã hết' : ''}</div>
        <div className="metaline">TikTok: <b>{tt}/{limit}</b> {tt >= limit ? '⛔ đã hết' : ''}</div>
        <p className="muted">Chạm trần thì kênh đó bị chặn tới hết ngày. Bộ đếm reset theo ngày (giờ VN). Đổi trần bằng env MKT_MAX_POSTS_PER_DAY.</p>
      </section>
    </main>
  );
}
