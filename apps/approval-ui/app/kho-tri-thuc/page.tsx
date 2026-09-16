import Link from 'next/link';
import { getServerClient } from '../../lib/supabase-server';
import { type WeekReport } from '../../lib/week-report';
import AgentRoster from '../agent/agent-roster';
import RecentActivity from '../agent/recent-activity';
import AgentHeadCard from '../agent/agent-head-card';
import { type AgentDef } from '../../lib/agent-defs';
import { cachedAgentDefs, cachedTokenStats, cachedWeekReport } from '../../lib/cached';
import { type TokenStats } from '../../lib/token-stats';

// NGUỒN (23/8, user: "sắp xếp lại, ghi rõ 5 AI đã học gì, nguồn nào, Evaluator so sánh thế nào"):
// một tab mỗi AI, mỗi tab = đúng những gì AI đó đã đọc / đã kết luận, đọc thẳng từ bảng dữ liệu.
//   AI Data 1 (nội bộ)  -> mkt_knowledge_internal (trừ evaluator/*)
//   AI Data 2 (public)  -> mkt_knowledge_public
//   AI Đánh giá         -> bài tuần này chấm điểm (buildWeekReport) + xếp bậc học tuần (mkt_plans
//                          origin learn-weekly) + verdict A/B cũ giữ làm lịch sử (4/9)
//   BOSS (Kế hoạch)     -> mkt_plans bản đang áp (nguồn số liệu, trọng số, hướng đi + nguồn, nhật ký chỉnh)
//   Creator             -> mkt_content generator=rotation 7 ngày (hướng đi + insight đã dùng)
// Chỉ đọc, không tự động hóa gì. Máy soạn, người bấm (điều cấm 1) giữ nguyên.

export const dynamic = 'force-dynamic';

type Tab = 'tong-quan' | 'noi-bo' | 'public' | 'danh-gia' | 'boss' | 'creator' | 'video-ai' | 'lich-kenh' | 'bao-cao' | 'seo-ai' | 'token';
const TABS: Array<{ key: Tab; label: string; icon: string }> = [
  { key: 'tong-quan', label: 'Tổng quan', icon: '🧠' },
  { key: 'noi-bo', label: 'AI Data 1', icon: '📁' },
  { key: 'public', label: 'AI Data 2', icon: '🌐' },
  { key: 'danh-gia', label: 'AI Đánh giá', icon: '⚖️' },
  { key: 'boss', label: 'AI Kế hoạch', icon: '🧭' },
  { key: 'creator', label: 'AI Sáng tạo', icon: '✍️' },
  // 28/8 (user): tab chi tiet cho cac AI MOI ngoai bo cu — video/giong, lich kenh, bao cao, SEO.
  { key: 'video-ai', label: 'AI Video + Giọng', icon: '🎬' },
  { key: 'lich-kenh', label: 'AI Lịch và kênh', icon: '📆' },
  { key: 'bao-cao', label: 'AI Báo cáo tuần', icon: '📈' },
  { key: 'seo-ai', label: 'AI SEO', icon: '🔍' },
  // 24/8 (user "quản trị token các agent... sếp bảo đốt quá nhiều token rồi").
  { key: 'token', label: 'Quản trị token', icon: '⚡' },
];

function fmtDT(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value || '';
  return `${g('hour')}:${g('minute')} ${g('day')}/${g('month')}`;
}
function vn(n: number | null | undefined): string { return Math.round(Number(n) || 0).toLocaleString('vi-VN'); }
function vnDec(n: number | null | undefined): string { return (Math.round((Number(n) || 0) * 10) / 10).toLocaleString('vi-VN'); }

export default async function Page({ searchParams }: { searchParams: { ai?: string } }) {
  const tab: Tab = (TABS.some((t) => t.key === searchParams?.ai) ? searchParams!.ai : 'tong-quan') as Tab;
  const client = getServerClient();
  const since7 = new Date(Date.now() - 7 * 86400000).toISOString();

  // 16/9 (Thanh: "trang Nguồn học dữ liệu vẫn chậm và lag lắm... ưu tiên nhất"): trước đây
  // MỌI tab đều chạy đủ 12 truy vấn — kể cả 2 bảng token nặng (3.000 + 10.000 dòng) và báo
  // cáo tuần. Giờ mỗi tab chỉ tải đúng phần nó cần; phần nặng (token, báo cáo tuần, định
  // nghĩa AI) đi qua lớp cache lib/cached.ts.
  const need = {
    defs: tab !== 'tong-quan' && tab !== 'token',
    internal: tab === 'noi-bo',
    pub: tab === 'public',
    verdicts: tab === 'danh-gia' || tab === 'boss',
    applied: tab === 'boss',
    learn: tab === 'danh-gia' || tab === 'boss',
    creator: tab === 'creator',
    week: tab === 'danh-gia',
    agentLog: tab === 'lich-kenh' || tab === 'bao-cao' || tab === 'seo-ai',
    video: tab === 'video-ai',
    token: tab === 'token',
  };
  const NONE = Promise.resolve({ data: [] as any[] });
  const [
    { data: internalRows },
    { data: publicRows },
    { data: verdictRows },
    { data: appliedRows },
    { data: learnRows },
    { data: creatorRows },
    weekNow,
    { data: agentLogRows },
    { data: videoAssetRows },
    { data: videoLogRows },
    agentDefs,
    tokenStats,
  ] = await Promise.all([
    need.internal ? client.from('mkt_knowledge_internal').select('id, source_path, title, summary, needs_gov_review, created_at').not('source_path', 'like', 'evaluator/%').order('created_at', { ascending: false }).limit(60) : NONE,
    need.pub ? client.from('mkt_knowledge_public').select('id, source_url, source_title, summary, needs_gov_review, created_at').order('created_at', { ascending: false }).limit(60) : NONE,
    need.verdicts ? client.from('mkt_knowledge_internal').select('id, source_path, title, summary, created_at, imported_at').like('source_path', 'evaluator/%').order('created_at', { ascending: false }).limit(30) : NONE,
    need.applied ? client.from('mkt_plans').select('id, created_at, applied_at, generated_by, data').eq('applied', true).order('created_at', { ascending: false }).limit(1) : NONE,
    need.learn ? client.from('mkt_plans').select('id, created_at, applied, data').eq('data->>origin', 'learn-weekly').order('created_at', { ascending: false }).limit(1) : NONE,
    need.creator ? client.from('mkt_content').select('id, title, created_at, status, brief').eq('brief->>generator', 'rotation').gte('created_at', since7).order('created_at', { ascending: false }).limit(60) : NONE,
    need.week ? cachedWeekReport(0) : Promise.resolve(null),
    // 28/8: log cho cac tab AI (lich kenh / bao cao / SEO). 16/9 them mkt.gsc_pull (Search Console).
    need.agentLog ? client.from('run_log').select('task, status, detail, created_at').in('task', ['mkt.publish_facebook_ui', 'mkt.publish_facebook', 'mkt.publish_youtube', 'mkt.publish_tiktok', 'mkt.metrics_pull', 'mkt.metrics_pull_manual', 'mkt.learn_weekly', 'mkt.apply_learn', 'mkt.seo_audit', 'mkt.seed_keywords', 'mkt.keyword_suggest', 'mkt.gsc_pull']).order('created_at', { ascending: false }).limit(120) : NONE,
    need.video ? client.from('brand_assets').select('id, title, storage_path, product_group, created_at').in('kind', ['video', 'clip']).order('created_at', { ascending: false }).limit(12) : NONE,
    // 16/9 (Thanh: "bấm Chi tiết thì không thấy ghi là lỗi gì"): tab video thêm bảng lần chạy
    // dựng video gần nhất (kèm lỗi) từ run_log mkt.video_build.
    need.video ? client.from('run_log').select('task, status, detail, created_at').eq('task', 'mkt.video_build').order('created_at', { ascending: false }).limit(12) : NONE,
    // 4/9: định nghĩa 10 AI dùng chung (agent-defs.ts) — thẻ đầu mỗi tab AI (AgentHeadCard). Cache 2 phút.
    need.defs ? cachedAgentDefs() : Promise.resolve([] as AgentDef[]),
    need.token ? cachedTokenStats() : Promise.resolve(null),
  ] as any);

  const agentOf = (k: string) => (agentDefs as AgentDef[]).find((a) => a.key === k)!;

  const internal = (internalRows || []) as any[];
  const pub = (publicRows || []) as any[];
  const verdicts = (verdictRows || []) as any[];
  const applied = ((appliedRows || []) as any[])[0] || null;
  const plan = (applied?.data || {}) as any;
  const learn = ((learnRows || []) as any[])[0] || null;
  const creator = (creatorRows || []) as any[];

  // 4/9 (kiến trúc 29/8, bỏ A/B): bài tuần này đã chấm điểm sẵn ở weekNow (cachedWeekReport).
  // Lấy hướng đi (suggestion_title) gắn với từng bài để hiện ở bảng tab AI Đánh giá.
  const wk = (weekNow || { posts: [], byProduct: [], window: { label: 'tuần này' } }) as WeekReport;
  const wkCids = wk.posts.map((p) => p.cid);
  const { data: wkBriefs } = wkCids.length
    ? await client.from('mkt_content').select('id, brief').in('id', wkCids.slice(0, 200))
    : { data: [] as any[] };
  const sugOf = new Map((wkBriefs || []).map((c: any) => [String(c.id), String(c.brief?.suggestion_title || '')]));
  const avgScoreOfProduct = new Map(wk.byProduct.map((p) => [p.product, p.avgScore]));

  // 16/9: tổng hợp token (Gemini + Claude Code) chuyển sang lib/token-stats.ts, cache 5 phút
  // (cachedTokenStats) — tab Quản trị token không còn kéo 13.000 dòng mỗi lần mở.
  const ts = tokenStats as TokenStats | null;

  const sugs: any[] = Array.isArray(plan.content_suggestions) ? plan.content_suggestions : [];
  const products: any[] = Array.isArray(plan.products) ? plan.products : [];
  const adjustLog: any[] = Array.isArray(plan.adjust_log) ? plan.adjust_log : [];
  const kn = plan.summary?.knowledge || {};

  const chips = (
    <nav className="filters" aria-label="Từng AI">
      {TABS.map((t) => (
        <Link key={t.key} className={`chip ${tab === t.key ? 'on' : ''}`} href={t.key === 'tong-quan' ? '/kho-tri-thuc' : `/kho-tri-thuc?ai=${t.key}`}>
          <span aria-hidden="true">{t.icon}</span> {t.label}
        </Link>
      ))}
    </nav>
  );

  return (
    <main>
      {/* 28/8 v2 (user): GOP THAT — 1 trang duy nhat "Nguon hoc du lieu": tab Tong quan =
          dashboard TAT CA agent (AgentRoster dung chung voi /agent, bo 5 card cu) + block
          Hoat dong gan day (nhu ben Du lieu AI hoc cu). /du-lieu-ai redirect ve day. Cac
          chip AI Data 1/2... van la kho chi tiet theo AI. */}
      <header className="head-row">
        <div>
          <h1>Nguồn học dữ liệu</h1>
          <p className="sub">Tất cả AI đang chạy ở đâu, học được gì — kho tri thức chi tiết theo từng AI ở các tab dưới.</p>
        </div>
      </header>
      {chips}

      {tab === 'tong-quan' ? (
        <>
          <AgentRoster />
          <div style={{ marginTop: 18 }}>
            <RecentActivity limit={20} />
          </div>
        </>
      ) : null}

      {tab === 'noi-bo' ? (
        <section>
          <AgentHeadCard a={agentOf('data1')} extra={<>📂 <b>Nguồn:</b> file Phòng Kinh doanh thả qua Zalo, phiên 16h tải về, task 20h đẩy bucket kho-tri-thuc-noi-bo và tóm tắt. {vn(internal.length)} tài liệu gần nhất.</>} />
          {internal.length === 0 ? <div className="empty"><p>Chưa có tài liệu nội bộ.</p></div> : (
            <ul className="kt-list">
              {internal.map((r) => (
                <li key={r.id} className="kt-item">
                  <div className="kt-item-head"><b>{r.title || '(không tiêu đề)'}</b>{r.needs_gov_review ? <span className="badge tone-no">Cần duyệt QL</span> : null}<span className="muted" style={{ fontSize: '.8rem' }}>{fmtDT(r.created_at)}</span></div>
                  <div className="sub">Nguồn: <code>{r.source_path}</code></div>
                  <p>{r.summary || '(chưa có tóm tắt)'}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {tab === 'public' ? (
        <section>
          <AgentHeadCard a={agentOf('data2')} extra={<>📂 <b>Nguồn:</b> báo ngành cá và biển (Google News RSS hằng ngày, tìm sâu Chủ nhật), máy lọc tin liên quan và tóm tắt. {vn(pub.length)} tin gần nhất.</>} />
          {pub.length === 0 ? <div className="empty"><p>Chưa có tin public.</p></div> : (
            <ul className="kt-list">
              {pub.map((r) => (
                <li key={r.id} className="kt-item">
                  <div className="kt-item-head"><b><a href={r.source_url} target="_blank" rel="noopener noreferrer">{r.source_title || r.source_url}</a></b>{r.needs_gov_review ? <span className="badge tone-no">Cần duyệt QL</span> : null}<span className="muted" style={{ fontSize: '.8rem' }}>{fmtDT(r.created_at)}</span></div>
                  <p>{r.summary}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {tab === 'danh-gia' ? (
        <section>
          <AgentHeadCard a={agentOf('danh-gia')} />
          <div className="card" style={{ padding: '10px 14px', marginBottom: 14 }}>
            <b>Cách chấm (từ 29/8, bỏ hẳn A/B):</b> mỗi hướng đi BOSS giao ra đúng 1 bài. Điểm bài = tương tác + 0,1 × lượt xem + 0,02 × giây xem + 0,05 × tiếp cận.
            Bài được so với điểm trung bình của cùng sản phẩm trong tuần. Chủ nhật 19h máy gom theo sản phẩm: một phần ba đầu là Thắng (ưu tiên 3), giữa là Theo dõi (2), một phần ba cuối chưa ra đơn là Đuối (1), dưới 2 bài thì chưa xếp.
            Đề xuất chờ người bấm Áp dụng ở trang Kế hoạch. Mỗi tối 19h máy chỉnh trọng số tối đa 0,5 theo số liệu ngày. Tuần sau giữ 70% hướng mới, 30% dùng lại bài thắng.
          </div>

          <h2 style={{ fontSize: '1.05rem', margin: '0 0 8px' }}>Bài {wk.window.label.toLowerCase()} ({vn(wk.posts.length)} bài)</h2>
          {wk.posts.length === 0 ? <div className="empty"><p>Tuần này chưa có bài nào có số liệu.</p></div> : (
            <div className="tablewrap">
              <table className="datatable">
                <thead><tr><th>Bài</th><th>Hướng đi</th><th>Sản phẩm / loại</th><th className="num">Tương tác</th><th className="num">Lượt xem</th><th className="num">Điểm</th><th>So với TB nhóm</th></tr></thead>
                <tbody>
                  {[...wk.posts].sort((a, b) => b.score - a.score).map((p) => {
                    const avg = avgScoreOfProduct.get(p.product) || 0;
                    const hasData = p.m.engagement + p.m.views > 0;
                    const verdict = !hasData ? { t: 'Chưa có số', tone: 'default' } : p.score >= avg * 1.2 ? { t: 'Trên TB', tone: 'ok' } : p.score <= avg * 0.8 ? { t: 'Dưới TB', tone: 'no' } : { t: 'Ngang TB', tone: 'demo' };
                    return (
                      <tr key={p.cid}>
                        <td className="cell-title">{p.url ? <a className="src" href={p.url} target="_blank" rel="noreferrer"><b>{p.title}</b></a> : <b>{p.title}</b>}<div className="sub">{fmtDT(p.publishedAt)}</div></td>
                        <td className="sub">{sugOf.get(p.cid) || (p.isContent ? 'Bài nuôi trang theo lịch' : 'Vòng xoay')}</td>
                        <td>{p.product}{p.contentType ? <div className="sub">{p.contentType}</div> : null}</td>
                        <td className="num">{vn(p.m.engagement)}</td>
                        <td className="num">{vn(p.m.views)}</td>
                        <td className="num"><b>{vnDec(p.score)}</b></td>
                        <td><span className={`badge tone-${verdict.tone}`} title={`TB ${p.product}: ${vnDec(avg)} điểm`}>{verdict.t}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <h2 style={{ fontSize: '1.05rem', margin: '18px 0 8px' }}>Xếp bậc tuần vừa rồi (học tuần Chủ nhật)</h2>
          {!learn ? <p className="sub">Chưa có lần học tuần nào.</p> : (
            <>
              <p className="sub" style={{ margin: '0 0 8px' }}>Tạo {fmtDT(learn.created_at)} · {learn.applied ? <span className="badge tone-ok">Đã áp dụng</span> : <span className="badge tone-demo">Chờ người bấm Áp dụng ở Kế hoạch</span>}</p>
              <div className="tablewrap">
                <table className="datatable">
                  <thead><tr><th>Sản phẩm</th><th className="num">Bài</th><th className="num">TB tương tác</th><th>Bậc</th><th className="num">Ưu tiên</th><th>Ghi chú</th></tr></thead>
                  <tbody>
                    {((learn.data?.products || []) as any[]).map((p) => (
                      <tr key={p.product}>
                        <td>{p.product}</td><td className="num">{vn(p.count)}</td><td className="num">{vn(p.avgEng)}</td>
                        <td><span className={`badge tone-${p.tier === 'winner' ? 'ok' : p.tier === 'weak' ? 'no' : 'demo'}`}>{p.tier === 'winner' ? 'Thắng' : p.tier === 'watch' ? 'Theo dõi' : p.tier === 'weak' ? 'Đuối' : 'Chưa đủ bài'}</span></td>
                        <td className="num"><b>×{vnDec(p.weight)}</b></td><td className="sub">{p.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {Array.isArray(learn.data?.narrative) && learn.data.narrative.length ? (
                <ul className="kt-list" style={{ marginTop: 10 }}>{(learn.data.narrative as string[]).map((s, i) => <li key={i} className="kt-item">{s}</li>)}</ul>
              ) : null}
            </>
          )}

          {verdicts.length ? (
            <details style={{ marginTop: 18 }}>
              <summary className="sub">Kết luận A/B cũ trước 29/8 ({vn(verdicts.length)}), giữ làm lịch sử</summary>
              <ul className="kt-list" style={{ marginTop: 8 }}>
                {verdicts.map((r) => (
                  <li key={r.id} className="kt-item">
                    <div className="kt-item-head"><b>{r.title}</b><span className="muted" style={{ fontSize: '.8rem' }}>{fmtDT(r.imported_at || r.created_at)}</span></div>
                    <p>{r.summary}</p>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </section>
      ) : null}

      {tab === 'boss' ? (
        <section>
          <AgentHeadCard a={agentOf('boss')} />
          {!applied ? <div className="empty"><p>Chưa có bản kế hoạch nào được áp.</p><p className="sub">Bản tuần sinh Thứ 2 8h từ đo lường tuần vừa xong.</p></div> : (
            <>
              <div className="card" style={{ padding: '10px 14px', marginBottom: 14, display: 'grid', gap: 4 }}>
                <div><b>Bản đang áp</b> · tạo {fmtDT(plan.generatedAt || applied.created_at)} · nhịp {plan.cadence === 'weekly' ? 'tuần (Thứ 2)' : plan.cadence === 'update' ? 'cập nhật' : 'bấm tay'}</div>
                <div>Nguồn số liệu: <b>{plan.measurement_source || '7 ngày gần nhất'}</b></div>
                <div>Tri thức đã đọc khi lập: <b>{vn(kn.internal)}</b> nội bộ, <b>{vn(kn.publicSrc)}</b> public{verdicts.length ? <>, <b>{vn(verdicts.length)}</b> kết luận đánh giá</> : null}</div>
                <div className="sub">Lịch: học tuần Chủ nhật 19h · kế hoạch tuần Thứ 2 8h (tự áp) · chỉnh dần mỗi tối 19h theo số liệu ngày, tối đa 0,5 điểm{learn ? ` · đề xuất học tuần gần nhất ${fmtDT(learn.created_at)}${learn.applied ? ' (đã áp)' : ' (chờ áp)'}` : ''}</div>
              </div>

              <h2 style={{ fontSize: '1.05rem', margin: '0 0 8px' }}>Xếp hạng sản phẩm</h2>
              <div className="tablewrap">
                <table className="datatable">
                  <thead><tr><th>Sản phẩm</th><th className="num">Bài</th><th className="num">TB tương tác</th><th className="num">TB đơn</th><th>Bậc</th><th className="num">Ưu tiên</th><th>Ghi chú</th></tr></thead>
                  <tbody>
                    {products.map((p) => (
                      <tr key={p.product}>
                        <td>{p.product}</td><td className="num">{vn(p.count)}</td><td className="num">{vn(p.avgEng)}</td><td className="num">{vnDec(p.avgConv)}</td>
                        <td><span className={`badge tone-${p.tier === 'winner' ? 'ok' : p.tier === 'weak' ? 'no' : 'demo'}`}>{p.tier === 'winner' ? 'Thắng' : p.tier === 'watch' ? 'Theo dõi' : p.tier === 'weak' ? 'Yếu' : 'Thiếu mẫu'}</span></td>
                        <td className="num"><b>×{vnDec(p.weight)}</b></td><td className="sub">{p.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <h2 style={{ fontSize: '1.05rem', margin: '18px 0 8px' }}>Hướng đi giao cho AI Sáng tạo ({vn(sugs.length)})</h2>
              <div className="tablewrap">
                <table className="datatable">
                  <thead><tr><th>Hướng đi</th><th>Sản phẩm</th><th>Dựa trên nguồn</th><th>Trạng thái</th></tr></thead>
                  <tbody>
                    {sugs.map((s, i) => (
                      <tr key={i}>
                        <td className="cell-title"><b>{s.title}</b>{s.why ? <div className="sub">{s.why}</div> : null}</td>
                        <td>{s.product}</td>
                        <td className="sub">{Array.isArray(s.sources) && s.sources.length ? s.sources.join(', ') : '—'}</td>
                        <td>{s.rejected ? <span className="badge tone-no">Đã loại</span> : s.used_at ? <span className="badge tone-ok">Đã dùng</span> : s.pending_variant ? <span className="badge tone-demo">Đang thử {s.pending_variant}</span> : <span className="badge">{s.carried ? 'Chưa dùng' : '✨ Mới'}</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <h2 style={{ fontSize: '1.05rem', margin: '18px 0 8px' }}>Nhật ký chỉnh dần theo số liệu ngày</h2>
              {adjustLog.length === 0 ? <p className="sub">Chưa có lần chỉnh nào (mỗi tối 19h).</p> : (
                <ul className="kt-list">
                  {adjustLog.slice().reverse().slice(0, 20).map((a, i) => (
                    <li key={i} className="kt-item"><span className="muted" style={{ fontSize: '.8rem' }}>{fmtDT(a.at)}</span> · {a.product}: {vnDec(a.from)} {a.to > a.from ? 'lên' : 'xuống'} {vnDec(a.to)}{a.target !== a.to ? ` (đang hướng ${vnDec(a.target)})` : ''}</li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>
      ) : null}

      {tab === 'creator' ? (
        <section>
          <AgentHeadCard a={agentOf('creator')} />
          <p className="sub" style={{ margin: '8px 0 12px' }}>Bài máy viết 7 ngày qua: theo hướng đi nào của BOSS, xoáy vào insight nào. {vn(creator.length)} bài.</p>
          {creator.length === 0 ? <div className="empty"><p>Chưa có bài nào trong 7 ngày.</p></div> : (
            <div className="tablewrap">
              <table className="datatable">
                <thead><tr><th>Bài</th><th>Hướng đi BOSS giao</th><th>Insight khách</th><th>Sản phẩm</th><th>Lúc</th></tr></thead>
                <tbody>
                  {creator.map((c) => {
                    const b = c.brief || {};
                    return (
                      <tr key={c.id}>
                        <td className="cell-title"><b>{c.title}</b>{b.ab_variant ? <span className="badge badge-ab" style={{ marginLeft: 6 }}>Thử {b.ab_variant}</span> : null}</td>
                        <td>{b.suggestion_title ? b.suggestion_title : <span className="muted">{b.post_kind === 'content' ? 'Bài content (theo lịch loại)' : 'Vòng xoay'}</span>}</td>
                        <td className="sub">{b.insight_line ? `🎯 ${b.insight_line}` : '—'}</td>
                        <td>{String(b.rotation_group || '').replace(/^\s*\d+\.\s*/, '') || '—'}</td>
                        <td className="sub">{fmtDT(c.created_at)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {/* ===== 28/8: 4 TAB AI MOI (user: "layout cho cac AI con lai + noi ro model, local thi ghi dia chi") ===== */}
      {tab === 'video-ai' ? (
        <section>
          <AgentHeadCard a={agentOf('video')} extra={<>🎙 <b>Giọng:</b> {agentOf('voice').model} — {agentOf('voice').runsAt}</>} />
          <p className="sub" style={{ margin: '8px 0 12px' }}>Video đã dựng gần nhất (kho brand-assets): {vn((videoAssetRows || []).length)} bản.</p>
          {!(videoAssetRows || []).length ? <div className="empty"><p>Kho chưa có video nào.</p></div> : (
            <div className="tablewrap">
              <table className="datatable">
                <thead><tr><th>Video</th><th>Folder</th><th>Tạo lúc</th></tr></thead>
                <tbody>
                  {(videoAssetRows as any[]).map((a) => (
                    <tr key={a.id}>
                      <td className="cell-title"><b>{String(a.title || a.storage_path).slice(0, 80)}</b></td>
                      <td className="sub">{String(a.product_group || '—')}</td>
                      <td className="sub">{fmtDT(a.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {/* 16/9 (Thanh: "bấm Chi tiết thì không thấy ghi là lỗi gì"): lần chạy dựng video gần
              nhất từ run_log — dòng lỗi ghi rõ bài nào hỏng. Ô đỏ ở thẻ AI bấm vào là tới đây. */}
          <h2 style={{ fontSize: '1.05rem', margin: '18px 0 8px' }}>Lần chạy gần nhất (kèm lỗi nếu có)</h2>
          <AgentLogTable rows={(videoLogRows || []) as any[]} />
        </section>
      ) : null}

      {tab === 'lich-kenh' ? (
        <section>
          <AgentHeadCard a={agentOf('lich-kenh')} />
          <AgentLogTable rows={(agentLogRows as any[]).filter((l: any) => ['mkt.publish_facebook_ui', 'mkt.publish_facebook', 'mkt.publish_youtube', 'mkt.publish_tiktok', 'mkt.metrics_pull', 'mkt.metrics_pull_manual'].includes(l.task))} />
        </section>
      ) : null}

      {tab === 'bao-cao' ? (
        <section>
          <AgentHeadCard a={agentOf('bao-cao')} />
          <AgentLogTable rows={(agentLogRows as any[]).filter((l: any) => ['mkt.learn_weekly', 'mkt.apply_learn'].includes(l.task))} />
        </section>
      ) : null}

      {tab === 'seo-ai' ? (
        <section>
          <AgentHeadCard a={agentOf('seo')} />
          <AgentLogTable rows={(agentLogRows as any[]).filter((l: any) => ['mkt.seo_audit', 'mkt.seed_keywords', 'mkt.keyword_suggest'].includes(l.task))} />
        </section>
      ) : null}

      {tab === 'token' && ts ? (
        <section>
          <p className="sub" style={{ margin: '8px 0 12px' }}>
            Token Gemini đã dùng, tách theo từng AI trong hệ. Đã gắn đo: BOSS (hướng đi), Data 1 (đọc/tóm tắt file Zalo), Data 2 (báo ngành), Creator (viết bài, chọn ảnh, kịch bản video), Voice (Gemini TTS). Evaluator không dùng token (chỉ đọc số liệu). Whisper phụ đề chạy local nên không tính. Số chậm tối đa 5 phút.
          </p>
          <div className="chart-grid" style={{ marginBottom: 18 }}>
            <div className="stat-tile">
              <div className="stat-num">{vn(ts.gemini.today)}</div>
              <div className="stat-lbl">Token hôm nay</div>
            </div>
            <div className="stat-tile">
              <div className="stat-num">{vn(ts.gemini.total30)}</div>
              <div className="stat-lbl">Token 30 ngày qua</div>
            </div>
          </div>

          <h2 style={{ fontSize: '1.05rem', margin: '18px 0 8px' }}>7 ngày gần nhất</h2>
          <div className="tablewrap" style={{ marginBottom: 18 }}>
            <table className="datatable">
              <thead><tr><th>Ngày</th><th className="num">Token</th><th></th></tr></thead>
              <tbody>
                {ts.gemini.last7.map((d) => (
                  <tr key={d.day}>
                    <td>{d.day.split('-').reverse().join('/')}{d.day === ts.todayVN ? ' (hôm nay)' : ''}</td>
                    <td className="num"><b>{vn(d.tokens)}</b></td>
                    <td style={{ width: 200 }}>
                      <div style={{ background: 'var(--surface-2)', borderRadius: 4, overflow: 'hidden', height: 8 }}>
                        <div style={{ width: `${Math.round((d.tokens / ts.gemini.maxDay) * 100)}%`, background: 'var(--accent, #1f5fbf)', height: '100%' }} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2 style={{ fontSize: '1.05rem', margin: '18px 0 8px' }}>Theo AI (30 ngày)</h2>
          <div className="tablewrap" style={{ marginBottom: 18 }}>
            <table className="datatable">
              <thead><tr><th>AI</th><th className="num">Số lần gọi</th><th className="num">Tổng token</th><th>Tác vụ</th><th></th></tr></thead>
              <tbody>
                {ts.gemini.ais.map((r) => (
                  <tr key={r.ai}>
                    <td><span aria-hidden="true" style={{ marginRight: 6 }}>{r.icon}</span><b>{r.ai}</b><div className="sub" style={{ fontSize: '.8rem' }}>{r.note}</div></td>
                    <td className="num">{vn(r.calls)}</td>
                    <td className="num"><b>{vn(r.tokens)}</b></td>
                    <td className="sub" style={{ fontSize: '.8rem' }}>{r.taskLabels}</td>
                    <td style={{ width: 180 }}>
                      <div style={{ background: 'var(--surface-2)', borderRadius: 4, overflow: 'hidden', height: 8 }}>
                        <div style={{ width: `${Math.round((r.tokens / ts.gemini.maxAi) * 100)}%`, background: 'var(--accent, #1f5fbf)', height: '100%' }} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2 style={{ fontSize: '1.05rem', margin: '18px 0 8px' }}>Theo tác vụ (30 ngày)</h2>
          {ts.gemini.tasks.length === 0 ? (
            <p className="sub">Chưa có dữ liệu token — cron chạy vài lần rồi bảng này sẽ có số.</p>
          ) : (
            <div className="tablewrap">
              <table className="datatable">
                <thead><tr><th>Tác vụ</th><th className="num">Số lần gọi</th><th className="num">Tổng token</th><th className="num">TB/lần</th></tr></thead>
                <tbody>
                  {ts.gemini.tasks.map((t) => (
                    <tr key={t.task}>
                      <td>{t.label}</td>
                      <td className="num">{vn(t.calls)}</td>
                      <td className="num"><b>{vn(t.tokens)}</b></td>
                      <td className="num">{vn(t.calls ? t.tokens / t.calls : 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Khối "🤖 Claude Code (Anthropic Max)" — 26/8, user: "sếp muốn thấy dung lượng
              token dùng + quy đổi ra tiền". Nguồn: bảng claude_code_usage (script
              upload-claude-usage.mjs, cron Windows 1h/lần). */}
          <h2 style={{ fontSize: '1.05rem', margin: '28px 0 8px' }}>🤖 Claude Code (Anthropic Max)</h2>
          <p className="sub" style={{ margin: '0 0 12px' }}>
            Token bạn dùng khi chat với Claude Code (dev tool riêng, không phải AI SDVICO chạy sản xuất). Cột "Tương đương API" là chi phí NẾU trả theo API pricing — dùng để so với Claude Max subscription ($200/tháng ≈ 5.200.000đ) xem tiết kiệm bao nhiêu. Script sync jsonl mỗi 1h (cron Windows Task Scheduler).
          </p>
          {ts.claude.count === 0 ? (
            <div className="empty" style={{ padding: '20px 8px' }}>
              <p className="sub" style={{ margin: 0 }}>Chưa có dữ liệu Claude Code. Chạy tay: <code>node apps/approval-ui/scripts/upload-claude-usage.mjs</code></p>
              <p className="sub" style={{ margin: '4px 0 0' }}>Sau đó thiết lập cron 1h/lần bằng file <code>apps/approval-ui/scripts/claude-usage-cron.xml</code> (Task Scheduler → Import Task).</p>
            </div>
          ) : (
            <>
              <div className="chart-grid" style={{ marginBottom: 18 }}>
                <div className="stat-tile">
                  <div className="stat-num">{vn(ts.claude.todayTokens)}</div>
                  <div className="stat-lbl">Token hôm nay</div>
                </div>
                <div className="stat-tile">
                  <div className="stat-num" title="Nếu trả theo API pricing thay vì subscription">{ts.claude.todayVnd.toLocaleString('vi-VN')}đ</div>
                  <div className="stat-lbl">Tương đương API hôm nay</div>
                </div>
                <div className="stat-tile">
                  <div className="stat-num">{vn(ts.claude.total30Tokens)}</div>
                  <div className="stat-lbl">Token 30 ngày</div>
                </div>
                <div className="stat-tile" style={{ background: 'var(--surface-2)' }}>
                  <div className="stat-num" style={{ color: 'var(--accent, #1f5fbf)' }} title={`Nếu trả API pricing = ${ts.claude.total30Usd.toFixed(2)} USD. Max subscription 200 USD/tháng cố định.`}>
                    {ts.claude.total30Vnd.toLocaleString('vi-VN')}đ
                  </div>
                  <div className="stat-lbl">Tương đương API 30 ngày</div>
                </div>
              </div>

              <h3 style={{ fontSize: '.95rem', margin: '14px 0 6px' }}>Theo model (30 ngày)</h3>
              <div className="tablewrap" style={{ marginBottom: 14 }}>
                <table className="datatable">
                  <thead><tr><th>Model</th><th className="num">Lượt gọi</th><th className="num">Token</th><th className="num">USD</th><th className="num">VND (nếu trả API)</th></tr></thead>
                  <tbody>
                    {ts.claude.models.map((m) => (
                      <tr key={m.model}>
                        <td><b>{m.model}</b></td>
                        <td className="num">{vn(m.calls)}</td>
                        <td className="num">{vn(m.tokens)}</td>
                        <td className="num">${m.usd.toFixed(2)}</td>
                        <td className="num"><b>{m.vnd.toLocaleString('vi-VN')}đ</b></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <h3 style={{ fontSize: '.95rem', margin: '14px 0 6px' }}>7 ngày gần nhất (Claude Code)</h3>
              <div className="tablewrap">
                <table className="datatable">
                  <thead><tr><th>Ngày</th><th className="num">Token</th><th className="num">VND</th><th></th></tr></thead>
                  <tbody>
                    {ts.claude.last7.map((d) => (
                      <tr key={d.day}>
                        <td>{d.day.split('-').reverse().join('/')}{d.day === ts.todayVN ? ' (hôm nay)' : ''}</td>
                        <td className="num"><b>{vn(d.tokens)}</b></td>
                        <td className="num">{d.vnd.toLocaleString('vi-VN')}đ</td>
                        <td style={{ width: 200 }}>
                          <div style={{ background: 'var(--surface-2)', height: 8, borderRadius: 4, overflow: 'hidden' }}>
                            <div style={{ width: `${Math.round((d.tokens / ts.claude.maxDay) * 100)}%`, background: 'var(--accent, #1f5fbf)', height: '100%' }} />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      ) : null}
    </main>
  );
}

// 28/8: bang log dung chung cho 4 tab AI moi (lich-kenh / bao-cao / seo-ai). Hien 12 lan
// chay gan nhat: viec gi, ket qua, luc nao. Task dich sang tieng Viet de nguoi thuong doc.
function AgentLogTable({ rows }: { rows: Array<{ task: string; status: string; detail: any; created_at: string }> }) {
  const LABEL: Record<string, string> = {
    'mkt.publish_facebook_ui': 'Đăng bài lên Facebook',
    'mkt.publish_facebook': 'Đăng bài lên Facebook',
    'mkt.publish_youtube': 'Đăng video lên YouTube',
    'mkt.publish_tiktok': 'Đăng TikTok',
    'mkt.metrics_pull': 'Kéo số liệu (cron)',
    'mkt.metrics_pull_manual': 'Kéo số liệu (bấm tay)',
    'mkt.learn_weekly': 'Học số liệu tuần',
    'mkt.apply_learn': 'Áp đề xuất tuần',
    'mkt.seo_audit': 'Audit SEO',
    'mkt.seed_keywords': 'Seed từ khóa',
    'mkt.keyword_suggest': 'Đề xuất từ khóa (Gemini)',
    'mkt.video_build': 'Dựng video',
    'mkt.gsc_pull': 'Kéo số Search Console',
  };
  const top = rows.slice(0, 12);
  if (!top.length) return <div className="empty"><p>Chưa thấy lần chạy nào trong log.</p></div>;
  return (
    <div className="tablewrap">
      <table className="datatable">
        <thead><tr><th style={{ width: 200 }}>Việc</th><th style={{ width: 90 }}>Kết quả</th><th>Chi tiết</th><th style={{ width: 110 }}>Lúc</th></tr></thead>
        <tbody>
          {top.map((l, i) => (
            <tr key={i}>
              <td><b>{LABEL[l.task] || l.task}</b></td>
              <td><span className={`badge ${l.status === 'ok' ? 'tone-ok' : l.status === 'error' ? 'tone-no' : 'tone-demo'}`}>{l.status === 'ok' ? '✅ OK' : l.status === 'error' ? '⛔ Lỗi' : l.status === 'warn' ? '⚠️ Cảnh báo' : l.status}</span></td>
              {/* 16/9: lỗi dựng video ghi detail {title, exit_code} — hiện tên bài thay vì JSON thô. */}
              <td className="sub" style={{ fontSize: '.82rem' }}>{String(l.detail?.msg || l.detail?.error || (l.detail?.title ? `bài "${l.detail.title}"${l.detail?.exit_code != null ? ` (mã lỗi ${l.detail.exit_code})` : ''}` : JSON.stringify(l.detail || {}))).slice(0, 120)}</td>
              <td className="sub" style={{ fontSize: '.82rem' }}>{fmtDT(l.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
