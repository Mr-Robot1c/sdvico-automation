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

type Tab = 'tong-quan' | 'noi-bo' | 'public' | 'danh-gia' | 'boss' | 'creator' | 'token';
const TABS: Array<{ key: Tab; label: string; icon: string }> = [
  { key: 'tong-quan', label: 'Tổng quan', icon: '🧠' },
  { key: 'noi-bo', label: 'AI Data 1', icon: '📁' },
  { key: 'public', label: 'AI Data 2', icon: '🌐' },
  { key: 'danh-gia', label: 'AI Đánh giá', icon: '⚖️' },
  { key: 'boss', label: 'AI Kế hoạch', icon: '🧭' },
  { key: 'creator', label: 'AI Sáng tạo', icon: '✍️' },
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

  const since30 = new Date(Date.now() - 30 * 86400000).toISOString();
  const [
    { data: internalRows },
    { data: publicRows },
    { data: verdictRows },
    { data: appliedRows },
    { data: learnRows },
    { data: creatorRows },
    abPairs,
    { data: tokenRows },
    { data: claudeUsageRows },
  ] = await Promise.all([
    client.from('mkt_knowledge_internal').select('id, source_path, title, summary, needs_gov_review, created_at').not('source_path', 'like', 'evaluator/%').order('created_at', { ascending: false }).limit(60),
    client.from('mkt_knowledge_public').select('id, source_url, source_title, summary, needs_gov_review, created_at').order('created_at', { ascending: false }).limit(60),
    client.from('mkt_knowledge_internal').select('id, source_path, title, summary, created_at, imported_at').like('source_path', 'evaluator/%').order('created_at', { ascending: false }).limit(30),
    client.from('mkt_plans').select('id, created_at, applied_at, generated_by, data').eq('applied', true).order('created_at', { ascending: false }).limit(1),
    client.from('mkt_plans').select('id, created_at, applied, data').eq('data->>origin', 'learn-weekly').order('created_at', { ascending: false }).limit(1),
    client.from('mkt_content').select('id, title, created_at, status, brief').eq('brief->>generator', 'rotation').gte('created_at', since7).order('created_at', { ascending: false }).limit(60),
    collectAbPairs(client),
    // 24/8: token Gemini đã dùng (mkt.token_usage, ghi bởi lib/gen/token-log.mjs).
    client.from('run_log').select('detail, created_at').eq('task', 'mkt.token_usage').gte('created_at', since30).order('created_at', { ascending: false }).limit(3000),
    // 26/8: token Claude Code (Anthropic Max) đã dùng khi chat với Claude Code — nguồn khác
    // Gemini (dev tool riêng, không phải AI SDVICO chạy sản xuất). User: "sếp muốn thấy dung
    // lượng token dùng + quy đổi ra tiền". Script upload-claude-usage.mjs cron 1h/lần đọc
    // jsonl ~/.claude/projects/*SDVICO* → upsert bảng claude_code_usage.
    client.from('claude_code_usage').select('ts, model, input_tokens, cache_creation_tokens, cache_read_tokens, output_tokens, estimated_cost_usd, estimated_cost_vnd').gte('ts', since30).order('ts', { ascending: false }).limit(10000),
  ] as any);

  const internal = (internalRows || []) as any[];
  const pub = (publicRows || []) as any[];
  const verdicts = (verdictRows || []) as any[];
  const applied = ((appliedRows || []) as any[])[0] || null;
  const plan = (applied?.data || {}) as any;
  const learn = ((learnRows || []) as any[])[0] || null;
  const creator = (creatorRows || []) as any[];
  const pairs = abPairs as AbPair[];

  // Tổng hợp token: theo NGÀY (VN, 7 ngày gần nhất cho chart) + theo TÁC VỤ (30 ngày, cho
  // biết cái gì đang "đốt" nhiều nhất — user "sếp bảo đốt quá nhiều token").
  const TASK_LABEL: Record<string, string> = {
    plan_directions: '🧭 Sinh hướng đi (BOSS)',
    knowledge_internal_vision: '📁 Đọc ảnh Zalo (AI Data 1)',
    knowledge_internal_summary: '📁 Tóm tắt nội bộ (AI Data 1)',
    knowledge_public_search: '🌐 Tìm tin ngành (AI Data 2)',
    creator_social: '✍️ Viết bài bán (Creator)',
    creator_content: '✍️ Viết bài nuôi trang (Creator)',
    creator_content_old: '✍️ Viết bài theo từ khóa cũ (Creator)',
    creator_pick_image: '🖼️ Chọn ảnh Unsplash (Creator)',
    creator_video_script: '🎬 Sinh kịch bản video (Creator)',
    voice_tts: '🔊 Đọc lời video TTS (Voice)',
  };
  // 26/8: nhóm theo AI (user "quản trị token của từng AI"). Task nào chưa map thì gom "AI khác".
  const AI_OF_TASK: Record<string, string> = {
    knowledge_internal_vision: 'Data 1', knowledge_internal_summary: 'Data 1',
    knowledge_public_search: 'Data 2',
    plan_directions: 'BOSS',
    creator_social: 'Creator', creator_content: 'Creator', creator_content_old: 'Creator', creator_pick_image: 'Creator', creator_video_script: 'Creator',
    voice_tts: 'Voice',
  };
  const AI_META: Record<string, { icon: string; note: string }> = {
    'Data 1': { icon: '📁', note: 'Đọc file Zalo Phòng Kinh doanh, tóm tắt về tri thức nội bộ' },
    'Data 2': { icon: '🌐', note: 'Quét báo ngành cá hằng ngày (Google News + Chủ nhật sâu)' },
    'BOSS':   { icon: '🧭', note: 'Sinh hướng đi tuần, cập nhật kế hoạch từ tri thức + số liệu' },
    'Creator':{ icon: '✍️', note: 'Viết bài bán, bài nuôi trang, kịch bản video, chọn ảnh Unsplash' },
    'Voice':  { icon: '🔊', note: 'Đọc lời video bằng Gemini TTS (Leda), fallback edge-tts miễn phí' },
    'Evaluator': { icon: '⚖️', note: 'So cặp A/B — chỉ đọc mkt_metrics, không dùng token AI' },
  };
  const dayOfVN = (iso: string) => {
    const d = new Date(new Date(iso).getTime() + 7 * 3600 * 1000);
    return d.toISOString().slice(0, 10);
  };
  const byDay = new Map<string, number>();
  const byTask = new Map<string, { calls: number; tokens: number }>();
  let totalTokens30 = 0;
  for (const r of (tokenRows || []) as any[]) {
    const d = r.detail || {};
    const t = Number(d.totalTokens) || 0;
    if (!t) continue;
    totalTokens30 += t;
    const day = dayOfVN(r.created_at);
    byDay.set(day, (byDay.get(day) || 0) + t);
    const task = String(d.source_task || 'khac');
    const e = byTask.get(task) || { calls: 0, tokens: 0 };
    e.calls += 1;
    e.tokens += t;
    byTask.set(task, e);
  }
  const todayVN = dayOfVN(new Date().toISOString());
  const tokenToday = byDay.get(todayVN) || 0;
  const last7Days: Array<{ day: string; tokens: number }> = [];
  for (let i = 6; i >= 0; i--) {
    const day = new Date(Date.now() - i * 86400000 + 7 * 3600 * 1000).toISOString().slice(0, 10);
    last7Days.push({ day, tokens: byDay.get(day) || 0 });
  }
  const taskRows = [...byTask.entries()]
    .map(([task, e]) => ({ task, label: TASK_LABEL[task] || task, ...e }))
    .sort((a, b) => b.tokens - a.tokens);
  const maxDayTokens = Math.max(1, ...last7Days.map((d) => d.tokens));

  // Nhóm token theo AI. Evaluator luôn có row để user thấy nó KHÔNG đốt token (tránh hiểu nhầm
  // "sao thiếu Evaluator" — nó chỉ tính toán từ mkt_metrics, không gọi Gemini).
  const AI_ORDER = ['Creator', 'Voice', 'BOSS', 'Data 1', 'Data 2', 'Evaluator', 'AI khác'];
  const byAI = new Map<string, { calls: number; tokens: number; tasks: Set<string> }>();
  for (const [task, e] of byTask.entries()) {
    const ai = AI_OF_TASK[task] || 'AI khác';
    const row = byAI.get(ai) || { calls: 0, tokens: 0, tasks: new Set<string>() };
    row.calls += e.calls; row.tokens += e.tokens; row.tasks.add(task);
    byAI.set(ai, row);
  }
  if (!byAI.has('Evaluator')) byAI.set('Evaluator', { calls: 0, tokens: 0, tasks: new Set() });
  const aiRows = AI_ORDER
    .filter((ai) => byAI.has(ai))
    .map((ai) => ({ ai, ...byAI.get(ai)!, meta: AI_META[ai] || { icon: '🤖', note: '' } }));
  const maxAiTokens = Math.max(1, ...aiRows.map((r) => r.tokens));

  // Claude Code usage (26/8): parse rows từ bảng claude_code_usage. Nhóm theo model (opus /
  // sonnet / haiku / fable) + tổng chi phí quy đổi USD/VND nếu trả API pricing (bảng script
  // upload-claude-usage.mjs đã tính sẵn cột estimated_cost_usd/vnd). Sếp so sánh với Max sub
  // fixed cost $200/tháng để thấy tiết kiệm hay không.
  const ccRows = (claudeUsageRows || []) as any[];
  let ccTotalTokens30 = 0;
  let ccTotalUsd30 = 0;
  let ccTotalVnd30 = 0;
  let ccTodayTokens = 0;
  let ccTodayVnd = 0;
  const ccByDay = new Map<string, { tokens: number; vnd: number }>();
  const ccByModel = new Map<string, { calls: number; tokens: number; usd: number; vnd: number }>();
  const detectModelBucket = (m: string): string => {
    const ml = String(m || '').toLowerCase();
    if (ml.includes('opus')) return 'Opus';
    if (ml.includes('sonnet')) return 'Sonnet';
    if (ml.includes('haiku')) return 'Haiku';
    if (ml.includes('fable')) return 'Fable';
    return 'Khác';
  };
  for (const r of ccRows) {
    const t = Number(r.input_tokens || 0) + Number(r.output_tokens || 0) + Number(r.cache_creation_tokens || 0) + Number(r.cache_read_tokens || 0);
    const usd = Number(r.estimated_cost_usd || 0);
    const vnd = Number(r.estimated_cost_vnd || 0);
    ccTotalTokens30 += t;
    ccTotalUsd30 += usd;
    ccTotalVnd30 += vnd;
    const day = dayOfVN(r.ts);
    const dayEntry = ccByDay.get(day) || { tokens: 0, vnd: 0 };
    dayEntry.tokens += t; dayEntry.vnd += vnd;
    ccByDay.set(day, dayEntry);
    if (day === todayVN) { ccTodayTokens += t; ccTodayVnd += vnd; }
    const bucket = detectModelBucket(r.model);
    const me = ccByModel.get(bucket) || { calls: 0, tokens: 0, usd: 0, vnd: 0 };
    me.calls += 1; me.tokens += t; me.usd += usd; me.vnd += vnd;
    ccByModel.set(bucket, me);
  }
  const ccLast7Days: Array<{ day: string; tokens: number; vnd: number }> = [];
  for (let i = 6; i >= 0; i--) {
    const day = new Date(Date.now() - i * 86400000 + 7 * 3600 * 1000).toISOString().slice(0, 10);
    const e = ccByDay.get(day) || { tokens: 0, vnd: 0 };
    ccLast7Days.push({ day, tokens: e.tokens, vnd: e.vnd });
  }
  const ccMaxDayTokens = Math.max(1, ...ccLast7Days.map((d) => d.tokens));
  const ccModelRows = [...ccByModel.entries()]
    .map(([m, e]) => ({ model: m, ...e }))
    .sort((a, b) => b.vnd - a.vnd);

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

      {tab === 'token' ? (
        <section>
          <p className="sub" style={{ margin: '8px 0 12px' }}>
            Token Gemini đã dùng, tách theo từng AI trong hệ. Đã gắn đo: BOSS (hướng đi), Data 1 (đọc/tóm tắt file Zalo), Data 2 (báo ngành), Creator (viết bài, chọn ảnh, kịch bản video), Voice (Gemini TTS). Evaluator không dùng token (chỉ đọc số liệu). Whisper phụ đề chạy local nên không tính.
          </p>
          <div className="chart-grid" style={{ marginBottom: 18 }}>
            <div className="stat-tile">
              <div className="stat-num">{vn(tokenToday)}</div>
              <div className="stat-lbl">Token hôm nay</div>
            </div>
            <div className="stat-tile">
              <div className="stat-num">{vn(totalTokens30)}</div>
              <div className="stat-lbl">Token 30 ngày qua</div>
            </div>
          </div>

          <h2 style={{ fontSize: '1.05rem', margin: '18px 0 8px' }}>7 ngày gần nhất</h2>
          <div className="tablewrap" style={{ marginBottom: 18 }}>
            <table className="datatable">
              <thead><tr><th>Ngày</th><th className="num">Token</th><th></th></tr></thead>
              <tbody>
                {last7Days.map((d) => (
                  <tr key={d.day}>
                    <td>{d.day.split('-').reverse().join('/')}{d.day === todayVN ? ' (hôm nay)' : ''}</td>
                    <td className="num"><b>{vn(d.tokens)}</b></td>
                    <td style={{ width: 200 }}>
                      <div style={{ background: 'var(--surface-2)', borderRadius: 4, overflow: 'hidden', height: 8 }}>
                        <div style={{ width: `${Math.round((d.tokens / maxDayTokens) * 100)}%`, background: 'var(--accent, #1f5fbf)', height: '100%' }} />
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
                {aiRows.map((r) => (
                  <tr key={r.ai}>
                    <td><span aria-hidden="true" style={{ marginRight: 6 }}>{r.meta.icon}</span><b>{r.ai}</b><div className="sub" style={{ fontSize: '.8rem' }}>{r.meta.note}</div></td>
                    <td className="num">{vn(r.calls)}</td>
                    <td className="num"><b>{vn(r.tokens)}</b></td>
                    <td className="sub" style={{ fontSize: '.8rem' }}>{[...r.tasks].map((t) => TASK_LABEL[t] || t).join(', ') || (r.ai === 'Evaluator' ? 'Không gọi Gemini' : 'Chưa có')}</td>
                    <td style={{ width: 180 }}>
                      <div style={{ background: 'var(--surface-2)', borderRadius: 4, overflow: 'hidden', height: 8 }}>
                        <div style={{ width: `${Math.round((r.tokens / maxAiTokens) * 100)}%`, background: 'var(--accent, #1f5fbf)', height: '100%' }} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2 style={{ fontSize: '1.05rem', margin: '18px 0 8px' }}>Theo tác vụ (30 ngày)</h2>
          {taskRows.length === 0 ? (
            <p className="sub">Chưa có dữ liệu token — cron chạy vài lần rồi bảng này sẽ có số.</p>
          ) : (
            <div className="tablewrap">
              <table className="datatable">
                <thead><tr><th>Tác vụ</th><th className="num">Số lần gọi</th><th className="num">Tổng token</th><th className="num">TB/lần</th></tr></thead>
                <tbody>
                  {taskRows.map((t) => (
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
              token dùng + quy đổi ra tiền". Nguồn: bảng claude_code_usage, ghi bởi script
              upload-claude-usage.mjs (cron Windows 1h/lần đọc jsonl ~/.claude/projects/*SDVICO*).
              Quy đổi VND = giá nếu trả API pricing thay vì Max subscription. Sếp so sánh
              con số này với $200/tháng của Max = thấy tiết kiệm bao nhiêu. */}
          <h2 style={{ fontSize: '1.05rem', margin: '28px 0 8px' }}>🤖 Claude Code (Anthropic Max)</h2>
          <p className="sub" style={{ margin: '0 0 12px' }}>
            Token bạn dùng khi chat với Claude Code (dev tool riêng, không phải AI SDVICO chạy sản xuất). Cột "Tương đương API" là chi phí NẾU trả theo API pricing — dùng để so với Claude Max subscription ($200/tháng ≈ 5.200.000đ) xem tiết kiệm bao nhiêu. Script sync jsonl mỗi 1h (cron Windows Task Scheduler).
          </p>
          {ccRows.length === 0 ? (
            <div className="empty" style={{ padding: '20px 8px' }}>
              <p className="sub" style={{ margin: 0 }}>Chưa có dữ liệu Claude Code. Chạy tay: <code>node apps/approval-ui/scripts/upload-claude-usage.mjs</code></p>
              <p className="sub" style={{ margin: '4px 0 0' }}>Sau đó thiết lập cron 1h/lần bằng file <code>apps/approval-ui/scripts/claude-usage-cron.xml</code> (Task Scheduler → Import Task).</p>
            </div>
          ) : (
            <>
              <div className="chart-grid" style={{ marginBottom: 18 }}>
                <div className="stat-tile">
                  <div className="stat-num">{vn(ccTodayTokens)}</div>
                  <div className="stat-lbl">Token hôm nay</div>
                </div>
                <div className="stat-tile">
                  <div className="stat-num" title="Nếu trả theo API pricing thay vì subscription">{ccTodayVnd.toLocaleString('vi-VN')}đ</div>
                  <div className="stat-lbl">Tương đương API hôm nay</div>
                </div>
                <div className="stat-tile">
                  <div className="stat-num">{vn(ccTotalTokens30)}</div>
                  <div className="stat-lbl">Token 30 ngày</div>
                </div>
                <div className="stat-tile" style={{ background: 'var(--surface-2)' }}>
                  <div className="stat-num" style={{ color: 'var(--accent, #1f5fbf)' }} title={`Nếu trả API pricing = ${ccTotalUsd30.toFixed(2)} USD. Max subscription 200 USD/tháng cố định.`}>
                    {ccTotalVnd30.toLocaleString('vi-VN')}đ
                  </div>
                  <div className="stat-lbl">Tương đương API 30 ngày</div>
                </div>
              </div>

              <h3 style={{ fontSize: '.95rem', margin: '14px 0 6px' }}>Theo model (30 ngày)</h3>
              <div className="tablewrap" style={{ marginBottom: 14 }}>
                <table className="datatable">
                  <thead><tr><th>Model</th><th className="num">Lượt gọi</th><th className="num">Token</th><th className="num">USD</th><th className="num">VND (nếu trả API)</th></tr></thead>
                  <tbody>
                    {ccModelRows.map((m) => (
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
                    {ccLast7Days.map((d) => (
                      <tr key={d.day}>
                        <td>{d.day.split('-').reverse().join('/')}{d.day === todayVN ? ' (hôm nay)' : ''}</td>
                        <td className="num"><b>{vn(d.tokens)}</b></td>
                        <td className="num">{d.vnd.toLocaleString('vi-VN')}đ</td>
                        <td style={{ width: 200 }}>
                          <div style={{ background: 'var(--surface-2)', height: 8, borderRadius: 4, overflow: 'hidden' }}>
                            <div style={{ width: `${Math.round((d.tokens / ccMaxDayTokens) * 100)}%`, background: 'var(--accent, #1f5fbf)', height: '100%' }} />
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
