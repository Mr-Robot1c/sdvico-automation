import Link from 'next/link';
import { getServerClient } from '../../lib/supabase-server';
import AgentRoster from './agent-roster';

// 27/8 REDESIGN (docx "redesign web" cua sep) — trang AGENT: theo doi qua trinh hoc va
// chay cua cac AI trong he thong. 9 AI: BOSS (trung tam) + lam video + tao kich ban +
// giong noi + SEO + quan ly lich va kenh + bao cao tuan + DATA 1 (noi bo) + DATA 2 (mang).
// Kem VONG LAP: DATA 1+2 thu thap -> y tuong -> BOSS ra ke hoach -> kich ban -> video +
// giong -> cho duyet (nguoi bam) -> len lich -> dang -> bao cao tuan -> BOSS chinh trong so
// (70% hoc bai moi / 30% dung bai cu) -> lap tiep.
export const dynamic = 'force-dynamic';

function fmtDT(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit',
    timeZone: 'Asia/Ho_Chi_Minh', hourCycle: 'h23',
  }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value || '';
  return `${g('hour')}:${g('minute')} ${g('day')}/${g('month')}`;
}
const fmt = (n: number) => (n || 0).toLocaleString('vi-VN');

type LogRow = { task: string; status: string; detail: any; created_at: string };

export default async function Page() {
  const client = getServerClient();

  // 28/8: 9 AI card tach ra AgentRoster (dung chung voi trang Nguon hoc du lieu) — page nay
  // chi con query cho phan Trending Digest + fallback list.
  const [dataPublicCount, dataPublicRows, scoreLogRes] = await Promise.all([
    // 27/8 dot 2 fix: bang dung ten la mkt_knowledge_public (truoc query mkt_public_knowledge
    // KHONG TON TAI -> digest luon trong).
    client.from('mkt_knowledge_public').select('*', { count: 'exact', head: true }),
    client.from('mkt_knowledge_public').select('source_title, summary, created_at').order('created_at', { ascending: false }).limit(6),
    // Lan cham diem gan nhat — digest hien ro loi neu scoring dang fail (user 28/8: "AI
    // data 2 van chua cham diem kia").
    client.from('run_log').select('status, detail, created_at').eq('task', 'mkt.knowledge_score').order('created_at', { ascending: false }).limit(1),
  ]);

  // TRENDING DIGEST (dot 2): tri thuc 7 ngay kem tier/score/keywords/plan — can migration
  // knowledge_tier da ap. Select rieng trong try de migration CHUA ap khong lam vo trang.
  const since7d = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  let digestRows: any[] = [];
  let digestReady = false;
  try {
    const r = await client
      .from('mkt_knowledge_public')
      .select('id, source_url, source_title, summary, tier, score, angle, key_message, keywords, plan_suggestions, created_at')
      .gte('created_at', since7d)
      .order('created_at', { ascending: false })
      .limit(200);
    if (!r.error) { digestRows = r.data || []; digestReady = true; }
  } catch { /* cot tier chua co */ }

  const tierCount = { S: 0, A: 0, B: 0, C: 0 } as Record<string, number>;
  let unscored = 0;
  for (const r of digestRows) {
    const t = String(r.tier || '');
    if (t in tierCount) tierCount[t] += 1; else unscored += 1;
  }
  const topScored = [...digestRows]
    .filter((r) => r.tier)
    .sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0))
    .slice(0, 5);
  const kwCount = new Map<string, number>();
  for (const r of digestRows) {
    if (Array.isArray(r.keywords)) {
      for (const k of r.keywords) {
        const key = String(k).toLowerCase().trim();
        if (key) kwCount.set(key, (kwCount.get(key) || 0) + 1);
      }
    }
  }
  const topKeywords = [...kwCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  const TIER_CLS: Record<string, string> = { S: 'tone-no', A: 'tone-ok', B: 'tone-demo', C: 'tone-default' };

  const publicRows = (dataPublicRows.data || []) as any[];
  const lastScoreLog = ((scoreLogRes.data || [])[0] as any) || null;

  const flow = [
    'DATA 1 + DATA 2 thu thập', 'Ý tưởng', 'AI BOSS ra kế hoạch', 'AI kịch bản viết',
    'AI video + giọng nói dựng', 'Người bấm Duyệt', 'Lên lịch', 'Đăng các kênh',
    'AI báo cáo tuần đo', 'BOSS chỉnh trọng số (70/30)',
  ];

  return (
    <main>
      <header className="head-row">
        <div>
          <h1>Agent</h1>
          <p className="sub">9 AI của SDVICO đang chạy ở đâu, học được gì. Máy soạn, người bấm Duyệt — không AI nào tự đăng.</p>
        </div>
        <div className="head-actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {/* 28/8 (user): gop 2 nut thanh 1 — "Nguon hoc du lieu" (trang gop 2 tab). */}
          <Link href="/kho-tri-thuc" className="btn ghost">📚 Nguồn học dữ liệu</Link>
        </div>
      </header>

      {/* ===== VONG LAP ===== */}
      <section className="blk">
        <h2>🔁 Vòng lặp học và làm <span className="sub">chạy tự động mỗi ngày, người chỉ duyệt</span></h2>
        <div className="flow-strip">
          {flow.map((s, i) => (
            <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span className={`flow-step ${s.includes('BOSS') ? 'boss' : ''}`}>{s}</span>
              {i < flow.length - 1 ? <span className="flow-arrow" aria-hidden="true">→</span> : <span className="flow-arrow" aria-hidden="true">↩</span>}
            </span>
          ))}
        </div>
      </section>

      {/* ===== 9 AI CARD (component dung chung voi trang Nguon hoc du lieu) ===== */}
      <section className="blk">
        <h2>🤖 Các AI trong hệ thống</h2>
        <AgentRoster />
      </section>

      {/* ===== TRENDING DIGEST — DATA 2 (dot 2: tier S/A/B/C + top keywords nhu ForLife) ===== */}
      <section className="blk">
        <h2>
          📈 Trending Digest — DATA 2
          <span className="sub">
            7 ngày: {fmt(digestRows.length)} mục
            {digestReady ? <> · Tiers <b>S:{tierCount.S}</b> A:{tierCount.A} B:{tierCount.B} C:{tierCount.C}{unscored ? ` · ${fmt(unscored)} chưa chấm` : ''}</> : null}
          </span>
        </h2>
        {!digestReady ? (
          <div className="need-item warn">
            <span>⚙️</span>
            <span style={{ flex: 1 }}>Chưa chấm được tier — cần chạy migration <code>20260827233000_knowledge_tier.sql</code> trên Supabase (SQL Editor) rồi chờ cron giờ tới chấm điểm.</span>
          </div>
        ) : digestRows.length === 0 ? (
          <p className="sub" style={{ margin: 0 }}>7 ngày qua DATA 2 chưa học được mục nào. Kiểm tra cron hoặc chạy tay ở trang Nguồn.</p>
        ) : (
          <div style={{ display: 'grid', gap: 14 }}>
            {/* Top bai theo score */}
            {topScored.length ? (
              <div style={{ display: 'grid', gap: 8 }}>
                <b style={{ fontSize: '.9rem' }}>📰 Top bài đáng dùng nhất</b>
                {topScored.map((r) => (
                  <div key={r.id} className="need-item" style={{ alignItems: 'flex-start' }}>
                    <span className={`badge ${TIER_CLS[String(r.tier)] || 'tone-default'}`} title={`Tier ${r.tier} — score ${r.score}/100`} style={{ flexShrink: 0 }}>
                      {String(r.tier)} · {Number(r.score) || 0}
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <a href={String(r.source_url || '#')} target="_blank" rel="noreferrer" className="src"><b>{String(r.source_title || '(không tên)').slice(0, 90)}</b></a>
                      {r.angle ? <span className="sub" style={{ display: 'block', fontSize: '.78rem' }}>Góc: {String(r.angle)}</span> : null}
                      {r.key_message ? <span className="sub" style={{ display: 'block', fontSize: '.8rem' }}>Key: {String(r.key_message).slice(0, 140)}</span> : null}
                      {Array.isArray(r.plan_suggestions) && r.plan_suggestions.length ? (
                        <span className="sub" style={{ display: 'block', fontSize: '.78rem', marginTop: 2 }}>
                          Kế hoạch tạm: {r.plan_suggestions.slice(0, 3).map((p: any) => `[${String(p.time || '')}] ${String(p.kind || '')}: ${String(p.title || '').slice(0, 40)}`).join(' · ')}
                        </span>
                      ) : null}
                    </span>
                    <span className="sub" style={{ fontSize: '.75rem', whiteSpace: 'nowrap' }}>{fmtDT(r.created_at)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 6 }}>
                <p className="sub" style={{ margin: 0 }}>Đã có {fmt(digestRows.length)} mục nhưng chưa mục nào được chấm — cron giờ tới sẽ chấm tự động (20 mục/lượt).</p>
                {lastScoreLog ? (
                  <p className="sub" style={{ margin: 0, fontSize: '.82rem' }}>
                    Lần chấm gần nhất {fmtDT(lastScoreLog.created_at)}: {lastScoreLog.status === 'ok' ? `✅ chấm ${fmt(Number(lastScoreLog.detail?.scored) || 0)} mục` : `⛔ ${String(lastScoreLog.detail?.errors?.[0] || 'lỗi không rõ').slice(0, 160)}`}
                  </p>
                ) : (
                  <p className="sub" style={{ margin: 0, fontSize: '.82rem' }}>Chưa thấy lần chấm nào trong log — có thể cron bị hết giờ trước khi tới bước chấm. Chạy tay: <code>/api/knowledge-score?secret=...</code></p>
                )}
              </div>
            )}
            {/* Top keywords */}
            {topKeywords.length ? (
              <div>
                <b style={{ fontSize: '.9rem' }}>🔑 Top keywords tuần</b>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                  {topKeywords.map(([k, n]) => (
                    <span key={k} className="chip" style={{ fontSize: '.8rem' }}>{k} <span className="n">{n}</span></span>
                  ))}
                </div>
              </div>
            ) : null}
            <Link href="/kho-tri-thuc" className="src" style={{ fontSize: '.85rem' }}>Mở kho tri thức đầy đủ →</Link>
          </div>
        )}
        {/* Fallback: khi digest chua san sang van cho xem muc moi nhat (khong tier). */}
        {!digestReady && publicRows.length ? (
          <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
            {publicRows.map((r, i) => (
              <div key={i} className="need-item">
                <span>📄</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <b>{String(r.source_title || '(không tên)').slice(0, 90)}</b>
                  <span className="sub" style={{ display: 'block', fontSize: '.8rem' }}>{String(r.summary || '').slice(0, 160)}</span>
                </span>
                <span className="sub" style={{ fontSize: '.75rem', whiteSpace: 'nowrap' }}>{fmtDT(r.created_at)}</span>
              </div>
            ))}
          </div>
        ) : null}
      </section>
    </main>
  );
}
