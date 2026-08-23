import Link from 'next/link';
import { getServerClient } from '../../lib/supabase-server';
import { collectAbPairs, type AbPair } from '../../lib/evaluator';

// NGUỒN (23/8, user: "sắp xếp lại, ghi rõ 5 AI đã học gì, nguồn nào, Evaluator so sánh thế nào"):
// một tab mỗi AI, mỗi tab = đúng những gì AI đó đã đọc / đã kết luận, đọc thẳng từ bảng dữ liệu.
//   AI Data 1 (nội bộ)  -> mkt_knowledge_internal (trừ evaluator/*)
//   AI Data 2 (public)  -> mkt_knowledge_public
//   Evaluator           -> cặp A/B + số liệu (collectAbPairs) + verdict đã ghi (evaluator/*)
//   BOSS (Kế hoạch)     -> mkt_plans bản đang áp (nguồn số liệu, trọng số, hướng đi + nguồn, nhật ký chỉnh)
//   Creator             -> mkt_content generator=rotation 7 ngày (hướng đi + insight đã dùng)
// Chỉ đọc, không tự động hóa gì. Máy soạn, người bấm (điều cấm 1) giữ nguyên.

export const dynamic = 'force-dynamic';

type Tab = 'tong-quan' | 'noi-bo' | 'public' | 'danh-gia' | 'boss' | 'creator';
const TABS: Array<{ key: Tab; label: string; icon: string }> = [
  { key: 'tong-quan', label: 'Tổng quan', icon: '🧠' },
  { key: 'noi-bo', label: 'AI Data 1', icon: '📁' },
  { key: 'public', label: 'AI Data 2', icon: '🌐' },
  { key: 'danh-gia', label: 'AI Đánh giá', icon: '⚖️' },
  { key: 'boss', label: 'AI Kế hoạch', icon: '🧭' },
  { key: 'creator', label: 'AI Sáng tạo', icon: '✍️' },
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

const STATUS_LABEL: Record<AbPair['status'], { text: string; tone: string }> = {
  thieu_ben: { text: 'Chờ bản B', tone: 'demo' },
  cho_so_lieu: { text: 'Chờ số liệu', tone: 'demo' },
  ca_hai_0: { text: 'Cả hai 0', tone: 'default' },
  da_ket_luan: { text: 'Đã kết luận', tone: 'ok' },
};

export default async function Page({ searchParams }: { searchParams: { ai?: string } }) {
  const tab: Tab = (TABS.some((t) => t.key === searchParams?.ai) ? searchParams!.ai : 'tong-quan') as Tab;
  const client = getServerClient();
  const since7 = new Date(Date.now() - 7 * 86400000).toISOString();

  const [
    { data: internalRows },
    { data: publicRows },
    { data: verdictRows },
    { data: appliedRows },
    { data: learnRows },
    { data: creatorRows },
    abPairs,
  ] = await Promise.all([
    client.from('mkt_knowledge_internal').select('id, source_path, title, summary, needs_gov_review, created_at').not('source_path', 'like', 'evaluator/%').order('created_at', { ascending: false }).limit(60),
    client.from('mkt_knowledge_public').select('id, source_url, source_title, summary, needs_gov_review, created_at').order('created_at', { ascending: false }).limit(60),
    client.from('mkt_knowledge_internal').select('id, source_path, title, summary, created_at, imported_at').like('source_path', 'evaluator/%').order('created_at', { ascending: false }).limit(30),
    client.from('mkt_plans').select('id, created_at, applied_at, generated_by, data').eq('applied', true).order('created_at', { ascending: false }).limit(1),
    client.from('mkt_plans').select('id, created_at, applied, data').eq('data->>origin', 'learn-weekly').order('created_at', { ascending: false }).limit(1),
    client.from('mkt_content').select('id, title, created_at, status, brief').eq('brief->>generator', 'rotation').gte('created_at', since7).order('created_at', { ascending: false }).limit(60),
    collectAbPairs(client),
  ]);

  const internal = (internalRows || []) as any[];
  const pub = (publicRows || []) as any[];
  const verdicts = (verdictRows || []) as any[];
  const applied = ((appliedRows || []) as any[])[0] || null;
  const plan = (applied?.data || {}) as any;
  const learn = ((learnRows || []) as any[])[0] || null;
  const creator = (creatorRows || []) as any[];
  const pairs = abPairs as AbPair[];

  const sugs: any[] = Array.isArray(plan.content_suggestions) ? plan.content_suggestions : [];
  const products: any[] = Array.isArray(plan.products) ? plan.products : [];
  const adjustLog: any[] = Array.isArray(plan.adjust_log) ? plan.adjust_log : [];
  const kn = plan.summary?.knowledge || {};
  const concluded = pairs.filter((p) => p.status === 'da_ket_luan');

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
      <header className="head-row">
        <div><h1>Nguồn</h1></div>
        <div className="head-actions"><Link className="src" href="/du-lieu-ai">Tình trạng học</Link></div>
      </header>
      {chips}

      {tab === 'tong-quan' ? (
        <div className="ai-grid">
          <Link className="ai-card" href="/kho-tri-thuc?ai=noi-bo">
            <div className="ai-head"><span className="ai-icon" aria-hidden="true">📁</span><b>AI Data 1</b><span className="muted">nội bộ</span></div>
            <div className="ai-stats"><div className="ai-stat"><b>{vn(internal.length)}</b><span>tài liệu</span></div><div className="ai-stat"><b>{vn(internal.filter((r) => r.created_at >= since7).length)}</b><span>7 ngày</span></div></div>
            <div className="ai-foot">Học từ file Zalo Phòng Kinh doanh · gần nhất {fmtDT(internal[0]?.created_at) || 'chưa có'}</div>
          </Link>
          <Link className="ai-card" href="/kho-tri-thuc?ai=public">
            <div className="ai-head"><span className="ai-icon" aria-hidden="true">🌐</span><b>AI Data 2</b><span className="muted">public</span></div>
            <div className="ai-stats"><div className="ai-stat"><b>{vn(pub.length)}</b><span>tin ngành</span></div><div className="ai-stat"><b>{vn(pub.filter((r) => r.created_at >= since7).length)}</b><span>7 ngày</span></div></div>
            <div className="ai-foot">Học từ báo ngành hằng ngày · gần nhất {fmtDT(pub[0]?.created_at) || 'chưa có'}</div>
          </Link>
          <Link className="ai-card" href="/kho-tri-thuc?ai=danh-gia">
            <div className="ai-head"><span className="ai-icon" aria-hidden="true">⚖️</span><b>AI Đánh giá</b><span className="muted">Evaluator</span></div>
            <div className="ai-stats"><div className="ai-stat"><b>{vn(pairs.length)}</b><span>cặp A/B</span></div><div className="ai-stat"><b>{vn(concluded.length)}</b><span>đã kết luận</span></div></div>
            <div className="ai-foot">So tương tác FB giữa bản A và B · {concluded[0] ? `mới nhất: bản ${concluded[0].winner} thắng` : 'chưa có kết luận'}</div>
          </Link>
          <Link className="ai-card" href="/kho-tri-thuc?ai=boss">
            <div className="ai-head"><span className="ai-icon" aria-hidden="true">🧭</span><b>AI Kế hoạch</b><span className="muted">BOSS</span></div>
            <div className="ai-stats"><div className="ai-stat"><b>{vn(products.length)}</b><span>sản phẩm xếp</span></div><div className="ai-stat"><b>{vn(sugs.length)}</b><span>hướng đi</span></div></div>
            <div className="ai-foot">{applied ? `Bản đang áp ${fmtDT(plan.generatedAt || applied.created_at)} · ${plan.measurement_source || 'số liệu 7 ngày'}` : 'Chưa có bản kế hoạch nào được áp'}</div>
          </Link>
          <Link className="ai-card" href="/kho-tri-thuc?ai=creator">
            <div className="ai-head"><span className="ai-icon" aria-hidden="true">✍️</span><b>AI Sáng tạo</b><span className="muted">Creator</span></div>
            <div className="ai-stats"><div className="ai-stat"><b>{vn(creator.length)}</b><span>bài 7 ngày</span></div><div className="ai-stat"><b>{vn(creator.filter((c) => c.brief?.insight_id).length)}</b><span>có insight</span></div></div>
            <div className="ai-foot">Viết theo hướng đi BOSS giao + insight khách · gần nhất {fmtDT(creator[0]?.created_at) || 'chưa có'}</div>
          </Link>
        </div>
      ) : null}

      {tab === 'noi-bo' ? (
        <section>
          <p className="sub" style={{ margin: '8px 0 12px' }}>Nguồn: file Phòng Kinh doanh thả qua Zalo vào bucket kho-tri-thuc-noi-bo, máy đọc và tóm tắt mỗi ngày 16h. {vn(internal.length)} tài liệu.</p>
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
          <p className="sub" style={{ margin: '8px 0 12px' }}>Nguồn: báo ngành cá và biển (Google News RSS hằng ngày, tìm sâu Chủ nhật), máy lọc tin liên quan và tóm tắt. {vn(pub.length)} tin.</p>
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
          <div className="card" style={{ padding: '10px 14px', marginBottom: 14 }}>
            <b>Cách so:</b> mỗi hướng đi có 2 bài thử (A sáng, B chiều). Khi cả hai đã có số liệu Facebook, máy cộng like + bình luận + chia sẻ của từng bản; bản cao hơn thắng, kết luận ghi vào kho nội bộ để BOSS đọc khi lên kế hoạch tuần sau. Cả hai bằng 0 thì chờ thêm, không kết luận.
          </div>
          {pairs.length === 0 ? <div className="empty"><p>Chưa có cặp A/B nào.</p></div> : (
            <div className="tablewrap">
              <table className="datatable">
                <thead><tr><th>Hướng đi</th><th>Bản A</th><th className="num">A</th><th>Bản B</th><th className="num">B</th><th>Kết luận</th></tr></thead>
                <tbody>
                  {pairs.map((p) => {
                    const a = p.sides.find((s) => s.variant === 'A');
                    const b = p.sides.find((s) => s.variant === 'B');
                    const st = STATUS_LABEL[p.status];
                    const cell = (s: typeof a) => s ? (
                      <div>
                        <div>{s.title}</div>
                        {s.insightLine ? <div className="sub" title="Insight bài này xoáy vào">🎯 {s.insightLine}</div> : null}
                        <div className="sub">{fmtDT(s.createdAt)}</div>
                      </div>
                    ) : <span className="muted">chưa sinh</span>;
                    const num = (s: typeof a) => s ? (s.engagement == null ? <span className="muted">—</span> : <span title={`${vn(s.reactions)} like, ${vn(s.comments)} bình luận, ${vn(s.shares)} chia sẻ`}>{vn(s.engagement)}</span>) : '—';
                    return (
                      <tr key={p.key}>
                        <td className="cell-title"><b>{p.sugTitle}</b></td>
                        <td style={{ background: p.winner === 'A' ? 'var(--ok-bg)' : undefined }}>{cell(a)}</td>
                        <td className="num" style={{ background: p.winner === 'A' ? 'var(--ok-bg)' : undefined }}><b>{num(a)}</b></td>
                        <td style={{ background: p.winner === 'B' ? 'var(--ok-bg)' : undefined }}>{cell(b)}</td>
                        <td className="num" style={{ background: p.winner === 'B' ? 'var(--ok-bg)' : undefined }}><b>{num(b)}</b></td>
                        <td><span className={`badge tone-${st.tone}`}>{p.winner ? `🏆 Bản ${p.winner}` : st.text}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {verdicts.length ? (
            <>
              <h2 style={{ fontSize: '1.05rem', margin: '18px 0 8px' }}>Kết luận đã ghi vào kho nội bộ ({vn(verdicts.length)})</h2>
              <ul className="kt-list">
                {verdicts.map((r) => (
                  <li key={r.id} className="kt-item">
                    <div className="kt-item-head"><b>{r.title}</b><span className="muted" style={{ fontSize: '.8rem' }}>{fmtDT(r.imported_at || r.created_at)}</span></div>
                    <p>{r.summary}</p>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </section>
      ) : null}

      {tab === 'boss' ? (
        <section>
          {!applied ? <div className="empty"><p>Chưa có bản kế hoạch nào được áp.</p><p className="sub">Bản tuần sinh Thứ 2 8h từ đo lường tuần vừa xong.</p></div> : (
            <>
              <div className="card" style={{ padding: '10px 14px', marginBottom: 14, display: 'grid', gap: 4 }}>
                <div><b>Bản đang áp</b> · tạo {fmtDT(plan.generatedAt || applied.created_at)} · nhịp {plan.cadence === 'weekly' ? 'tuần (Thứ 2)' : plan.cadence === 'update' ? 'cập nhật' : 'bấm tay'}</div>
                <div>Nguồn số liệu: <b>{plan.measurement_source || '7 ngày gần nhất'}</b></div>
                <div>Tri thức đã đọc khi lập: <b>{vn(kn.internal)}</b> nội bộ, <b>{vn(kn.publicSrc)}</b> public{concluded.length ? <>, <b>{vn(verdicts.length)}</b> kết luận A/B</> : null}</div>
                <div className="sub">Lịch: học tuần Chủ nhật 23h · kế hoạch tuần Thứ 2 8h (tự áp) · chỉnh dần mỗi tối 21h theo số liệu ngày, tối đa 0,5 điểm{learn ? ` · đề xuất học tuần gần nhất ${fmtDT(learn.created_at)}${learn.applied ? ' (đã áp)' : ' (chờ áp)'}` : ''}</div>
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
              {adjustLog.length === 0 ? <p className="sub">Chưa có lần chỉnh nào (bắt đầu từ tối 22/8, mỗi tối 21h).</p> : (
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
    </main>
  );
}
