import Link from 'next/link';
import { getServerClient } from '../../lib/supabase-server';

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

  const [logRes, dataInternalCount, dataInternalLast, dataPublicCount, dataPublicRows, videoAssetRes] = await Promise.all([
    client
      .from('run_log')
      .select('task, status, detail, created_at')
      .in('task', [
        'mkt.plan', 'mkt.plan_manual', 'mkt.live_apply', 'mkt.apply_learn',
        'mkt.rotate', 'mkt.suggestions_refill',
        'mkt.seo_audit', 'mkt.seed_keywords',
        'mkt.publish_facebook_ui', 'mkt.publish_facebook', 'mkt.publish_youtube', 'mkt.publish_tiktok', 'mkt.metrics_pull',
        'mkt.learn_weekly',
        'mkt.knowledge_public_deep',
      ])
      .order('created_at', { ascending: false })
      .limit(300),
    client.from('mkt_knowledge_internal').select('*', { count: 'exact', head: true }),
    client.from('mkt_knowledge_internal').select('created_at').order('created_at', { ascending: false }).limit(1),
    // 27/8 dot 2 fix: bang dung ten la mkt_knowledge_public (truoc query mkt_public_knowledge
    // KHONG TON TAI -> digest luon trong).
    client.from('mkt_knowledge_public').select('*', { count: 'exact', head: true }),
    client.from('mkt_knowledge_public').select('source_title, summary, created_at').order('created_at', { ascending: false }).limit(6),
    client.from('brand_assets').select('title, created_at').in('kind', ['video', 'clip']).order('created_at', { ascending: false }).limit(1),
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

  const logs = (logRes.data || []) as LogRow[];
  const lastOf = (tasks: string[]): LogRow | null => logs.find((l) => tasks.includes(l.task)) || null;

  const lastVideoAsset = ((videoAssetRes.data || [])[0] as any) || null;
  const lastInternal = ((dataInternalLast.data || [])[0] as any) || null;
  const publicRows = (dataPublicRows.data || []) as any[];

  type AgentDef = {
    icon: string; name: string; role: string; boss?: boolean;
    last: { at: string | null; ok: boolean | null; note: string };
    href?: string;
  };
  const mkLast = (row: LogRow | null, okNote: string): AgentDef['last'] =>
    row
      ? { at: row.created_at, ok: row.status === 'ok', note: row.status === 'ok' ? okNote : `lỗi: ${String(row.detail?.error || row.detail?.msg || row.status).slice(0, 80)}` }
      : { at: null, ok: null, note: 'chưa thấy lần chạy nào trong log' };

  const bossRow = lastOf(['mkt.plan', 'mkt.plan_manual', 'mkt.live_apply', 'mkt.apply_learn']);
  const agents: AgentDef[] = [
    {
      icon: '👑', name: 'AI BOSS', boss: true,
      role: 'Quản lý tất cả: học số liệu tuần, ra kế hoạch tuần, mỗi tối 19h chỉnh trọng số nhẹ (±0,5). 70% học bài mới, 30% dùng lại bài cũ đã chỉnh trọng số.',
      last: mkLast(bossRow, bossRow?.task === 'mkt.live_apply' ? 'chỉnh trọng số tối' : 'ra kế hoạch'),
      href: '/ke-hoach',
    },
    {
      icon: '✍️', name: 'AI tạo kịch bản', role: 'Viết bài + kịch bản video theo hướng đi BOSS giao (Gemini). Vòng xoay mỗi ngày 2 khung giờ.',
      last: mkLast(lastOf(['mkt.rotate', 'mkt.suggestions_refill']), 'sinh bài theo lịch'),
      href: '/noi-dung?loai=bang',
    },
    {
      icon: '🎬', name: 'AI làm video', role: 'ffmpeg trên máy local (Watcher): ghép cảnh 9:16, burn phụ đề, cân âm lượng, đưa video lên kho.',
      last: lastVideoAsset
        ? { at: lastVideoAsset.created_at, ok: true, note: `video mới nhất: ${String(lastVideoAsset.title || '').slice(0, 50)}` }
        : { at: null, ok: null, note: 'kho chưa có video nào' },
      href: '/video',
    },
    {
      icon: '🎙️', name: 'AI giọng nói', role: 'Gemini TTS giọng Leda đọc tiếng Việt; hết hạn mức tự lui edge-tts HoaiMy. Cả video luôn một giọng.',
      last: lastVideoAsset
        ? { at: lastVideoAsset.created_at, ok: true, note: 'chạy cùng lượt dựng video gần nhất' }
        : { at: null, ok: null, note: 'chạy cùng Watcher, chưa có video' },
      href: '/video',
    },
    {
      icon: '🔍', name: 'AI quản lý SEO', role: 'Seed từ khóa, audit SEO trang công khai, giữ sitemap sạch cho Google đọc.',
      last: mkLast(lastOf(['mkt.seo_audit', 'mkt.seed_keywords']), 'audit/seed từ khóa'),
      href: '/seo',
    },
    {
      icon: '📆', name: 'AI quản lý lịch và kênh', role: 'Bài duyệt xong tự đăng đúng kênh (FB, YouTube; TikTok xuất tay), kéo số liệu mỗi giờ.',
      last: mkLast(lastOf(['mkt.publish_facebook_ui', 'mkt.publish_facebook', 'mkt.publish_youtube', 'mkt.publish_tiktok', 'mkt.metrics_pull']), 'đăng bài / kéo số liệu'),
      href: '/kenh',
    },
    {
      icon: '📈', name: 'AI báo cáo tuần', role: 'Chủ nhật 19h gom số liệu tuần từ các bài đã đăng, gửi về BOSS học và đề xuất đổi trọng số.',
      last: mkLast(lastOf(['mkt.learn_weekly']), 'học tuần xong, có đề xuất'),
      href: '/do-luong/tuan',
    },
    {
      icon: '🏠', name: 'AI DATA 1 — nội bộ', role: 'Học tri thức nội bộ (file Zalo/tài liệu người phụ trách thả vào kho) thành insight cho BOSS.',
      last: lastInternal
        ? { at: lastInternal.created_at, ok: true, note: `${fmt(dataInternalCount.count || 0)} mẩu tri thức trong kho` }
        : { at: null, ok: null, note: 'kho tri thức nội bộ trống' },
      href: '/kho-tri-thuc',
    },
    {
      icon: '🌐', name: 'AI DATA 2 — trên mạng', role: 'Quét bài viết, video, keyword đang nóng trên mạng, chấm điểm, gợi ý trend cho BOSS.',
      last: (() => {
        const r = lastOf(['mkt.knowledge_public_deep']);
        if (r) return mkLast(r, `quét xong, kho có ${fmt(dataPublicCount.count || 0)} mục`);
        return publicRows[0]
          ? { at: publicRows[0].created_at, ok: true, note: `kho có ${fmt(dataPublicCount.count || 0)} mục` }
          : { at: null, ok: null as boolean | null, note: 'chưa quét lần nào' };
      })(),
      href: '/kho-tri-thuc?ai=public',
    },
  ];

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

      {/* ===== 9 AI CARD ===== */}
      <section className="blk">
        <h2>🤖 Các AI trong hệ thống</h2>
        <div className="agent-grid">
          {agents.map((a) => (
            <div key={a.name} className="agent-card" style={a.boss ? { borderColor: 'var(--brand-red)', background: 'var(--brand-red-bg)' } : undefined}>
              <div className="ag-head">
                <span className="ag-name">{a.icon} {a.name}</span>
                <span className={`badge ${a.last.ok === true ? 'tone-ok' : a.last.ok === false ? 'tone-no' : 'tone-demo'}`}>
                  {a.last.ok === true ? 'Đang chạy' : a.last.ok === false ? 'Lỗi' : 'Chưa chạy'}
                </span>
              </div>
              <p className="ag-role" style={{ margin: 0 }}>{a.role}</p>
              <div className="ag-last">
                {a.last.at ? `Gần nhất ${fmtDT(a.last.at)} — ${a.last.note}` : a.last.note}
                {a.href ? <> · <Link className="src" href={a.href}>Chi tiết →</Link></> : null}
              </div>
            </div>
          ))}
        </div>
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
              <p className="sub" style={{ margin: 0 }}>Đã có {fmt(digestRows.length)} mục nhưng chưa mục nào được chấm — cron giờ tới sẽ chấm tự động (20 mục/lượt).</p>
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
