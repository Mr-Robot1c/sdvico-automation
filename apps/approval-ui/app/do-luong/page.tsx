import { getServerClient } from '../../lib/supabase-server';
import { contentTypeLabel } from '../labels';
import { refreshFacebookMetrics } from '../actions';

export const dynamic = 'force-dynamic';

type M = { reactions?: number; comments?: number; shares?: number; engagement?: number };

export default async function Page() {
  const client = getServerClient();

  // Số liệu Facebook mới nhất của mỗi bài (mkt_metrics là chuỗi snapshot, lấy bản mới nhất).
  const { data: mrows } = await client
    .from('mkt_metrics')
    .select('entity_ref, metrics, created_at')
    .eq('source', 'facebook')
    .order('created_at', { ascending: false })
    .limit(500);
  const latest = new Map<string, M>();
  for (const r of mrows || []) {
    const cid = (r as any).entity_ref as string | null;
    if (cid && !latest.has(cid)) latest.set(cid, ((r as any).metrics || {}) as M);
  }

  const cids = [...latest.keys()];
  const contents = new Map<string, { title: string; type: string }>();
  if (cids.length) {
    const { data: cs } = await client.from('mkt_content').select('id, title, brief').in('id', cids);
    for (const c of cs || []) {
      contents.set((c as any).id, {
        title: (c as any).title || '(không tên)',
        type: (c as any).brief?.content_type || 'other'
      });
    }
  }

  const rows = cids
    .map((cid) => {
      const m = latest.get(cid) || {};
      const c = contents.get(cid) || { title: '(không rõ)', type: 'other' };
      const reactions = m.reactions || 0;
      const comments = m.comments || 0;
      const shares = m.shares || 0;
      return { cid, title: c.title, type: c.type, reactions, comments, shares, engagement: reactions + comments + shares };
    })
    .sort((a, b) => b.engagement - a.engagement);

  const byType = new Map<string, { count: number; reactions: number; comments: number; shares: number; engagement: number }>();
  for (const r of rows) {
    const g = byType.get(r.type) || { count: 0, reactions: 0, comments: 0, shares: 0, engagement: 0 };
    g.count += 1;
    g.reactions += r.reactions;
    g.comments += r.comments;
    g.shares += r.shares;
    g.engagement += r.engagement;
    byType.set(r.type, g);
  }
  const typeRows = [...byType.entries()]
    .map(([type, g]) => ({ type, ...g, avg: g.count ? Math.round(g.engagement / g.count) : 0 }))
    .sort((a, b) => b.avg - a.avg);

  return (
    <main>
      <header className="head-row">
        <div>
          <h1>Đo lường</h1>
          <p className="sub">So sánh tương tác Facebook theo bài và theo loại content (A/B). Loại nào cao thì giữ hướng đó.</p>
        </div>
        <div className="head-actions">
          <form action={refreshFacebookMetrics}>
            <button className="btn ok" type="submit">↻ Cập nhật số liệu</button>
          </form>
        </div>
      </header>

      {rows.length === 0 ? (
        <div className="empty">
          <div className="empty-icon" aria-hidden="true">📊</div>
          <p>Chưa có số liệu.</p>
          <p className="sub">Đăng bài lên Facebook, chờ có tương tác, rồi bấm <b>Cập nhật số liệu</b>. (TikTok chưa lấy được vì app chưa audit.)</p>
        </div>
      ) : (
        <>
          <h2>Theo loại content — trung bình tương tác mỗi bài</h2>
          <div className="tablewrap">
            <table className="datatable">
              <thead>
                <tr><th>Loại content</th><th>Số bài</th><th>TB/bài</th><th>Tổng tương tác</th><th>Reactions</th><th>Comment</th><th>Share</th></tr>
              </thead>
              <tbody>
                {typeRows.map((t, i) => (
                  <tr key={t.type}>
                    <td>{i === 0 ? '🏆 ' : ''}{contentTypeLabel(t.type)}</td>
                    <td>{t.count}</td>
                    <td><b>{t.avg}</b></td>
                    <td>{t.engagement}</td>
                    <td>{t.reactions}</td>
                    <td>{t.comments}</td>
                    <td>{t.shares}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2 style={{ marginTop: 24 }}>Từng bài — xếp theo tương tác</h2>
          <div className="tablewrap">
            <table className="datatable">
              <thead>
                <tr><th>Tên bài</th><th>Loại</th><th>Tương tác</th><th>Reactions</th><th>Comment</th><th>Share</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.cid}>
                    <td className="cell-title">{r.title}</td>
                    <td>{contentTypeLabel(r.type)}</td>
                    <td><b>{r.engagement}</b></td>
                    <td>{r.reactions}</td>
                    <td>{r.comments}</td>
                    <td>{r.shares}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </main>
  );
}
