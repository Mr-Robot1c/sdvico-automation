import { getServerClient } from '../../lib/supabase-server';
import { vnInt } from '../../lib/plan';
import { metricsAlert } from '../../lib/metrics-alert';

// Trang "Dữ liệu" (nhóm AI, user 18/8): 5 AI trong vòng lặp kín (docs/flowchart-v3.html)
// đang học tới đâu, kết quả gì — để người quản lý biết AI có THẬT SỰ học hay không.
// Đọc thẳng từ bảng dữ liệu (nguồn sự thật), không cần bảng mới:
//   AI Data 1 (nội bộ)  -> mkt_knowledge_internal (trừ evaluator/*)
//   AI Data 2 (public)  -> mkt_knowledge_public
//   BOSS Planner        -> mkt_plans (bản mới nhất, cadence, số hướng đi, đã áp chưa)
//   Creator             -> mkt_content generator=rotation có ab_variant / video gộp
//   Evaluator           -> mkt_knowledge_internal source_path evaluator/* (kết luận A/B)
// Không tự động hoá gì ở đây, chỉ đọc. Máy soạn, người bấm (điều cấm 1) giữ nguyên.

export const dynamic = 'force-dynamic';

type Health = 'ok' | 'warn' | 'idle';

function fmtDT(iso: string | null | undefined): string {
  if (!iso) return 'chưa có';
  try {
    return new Date(iso).toLocaleString('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
    });
  } catch { return String(iso); }
}
function ago(iso: string | null | undefined): string {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.floor(ms / 3600000);
  if (h < 1) return `${Math.max(1, Math.floor(ms / 60000))} phút trước`;
  if (h < 48) return `${h} giờ trước`;
  return `${Math.floor(h / 24)} ngày trước`;
}
// Học trong 24h -> ok; 24-72h -> warn; lâu hơn hoặc chưa có -> idle.
function healthOf(iso: string | null | undefined): Health {
  if (!iso) return 'idle';
  const h = (Date.now() - new Date(iso).getTime()) / 3600000;
  return h <= 24 ? 'ok' : h <= 72 ? 'warn' : 'idle';
}
const HEALTH_LABEL: Record<Health, { text: string; tone: string }> = {
  ok: { text: 'Đang học đều', tone: 'ok' },
  warn: { text: 'Học chậm lại', tone: 'demo' },
  idle: { text: 'Chưa học / lâu chưa học', tone: 'no' },
};

export default async function Page() {
  const client = getServerClient();
  const since7 = new Date(Date.now() - 7 * 86400000).toISOString();

  const [
    { data: internal7 },
    { count: internalAll },
    { data: public7 },
    { count: publicAll },
    { data: plans },
    { data: creator },
    { data: evaluator },
    { data: recentInternal },
    { data: recentPublic },
  ] = await Promise.all([
    client.from('mkt_knowledge_internal').select('id, title, created_at, source_path').gte('created_at', since7).not('source_path', 'like', 'evaluator/%').order('created_at', { ascending: false }),
    client.from('mkt_knowledge_internal').select('id', { count: 'exact', head: true }).not('source_path', 'like', 'evaluator/%'),
    client.from('mkt_knowledge_public').select('id, source_title, created_at').gte('created_at', since7).order('created_at', { ascending: false }),
    client.from('mkt_knowledge_public').select('id', { count: 'exact', head: true }),
    client.from('mkt_plans').select('id, created_at, applied, generated_by, data').order('created_at', { ascending: false }).limit(5),
    client.from('mkt_content').select('id, title, created_at, brief').eq('brief->>generator', 'rotation').gte('created_at', since7).order('created_at', { ascending: false }).limit(200),
    client.from('mkt_knowledge_internal').select('id, title, summary, created_at, imported_at').like('source_path', 'evaluator/%').order('imported_at', { ascending: false }).limit(20),
    client.from('mkt_knowledge_internal').select('title, created_at, source_path').order('created_at', { ascending: false }).limit(6),
    client.from('mkt_knowledge_public').select('source_title, created_at').order('created_at', { ascending: false }).limit(6),
  ]);

  // ---- AI Data 1: nội bộ ----
  const d1Last = internal7?.[0]?.created_at || null;
  const d1Latest = internal7?.[0]?.title || null;

  // ---- AI Data 2: public ----
  const d2Last = public7?.[0]?.created_at || null;
  const d2Latest = public7?.[0]?.source_title || null;

  // ---- BOSS ----
  const latestPlan = (plans || [])[0] as any;
  const appliedPlan = (plans || []).find((p: any) => p.applied) as any;
  // Số liệu thẻ BOSS đọc từ bản ĐANG ÁP (24/8: bản mới nhất có thể là đề xuất learn-weekly
  // không có hướng đi -> thẻ hiện 0 hướng đi, 0 nguồn dù bản đang áp đầy đủ).
  const bossPlan = (appliedPlan || latestPlan) as any;
  const bossLast = latestPlan?.created_at || null;
  const bossSug: any[] = bossPlan?.data?.content_suggestions || [];
  const bossSugUsed = bossSug.filter((s) => s.used_at).length;
  const bossSugPending = bossSug.filter((s) => !s.used_at && s.pending_variant).length;
  const bossKnowledge = bossPlan?.data?.summary?.knowledge;
  const bossCadence = latestPlan?.data?.origin === 'learn-weekly' ? 'Học tuần (Chủ nhật)' : latestPlan?.data?.cadence === 'weekly' ? 'Kế hoạch tuần (Thứ 2)' : latestPlan?.data?.cadence === 'update' ? 'Cập nhật giữa tuần (Thứ 6)' : latestPlan?.generated_by === 'manual' ? 'Tạo tay' : 'Tự động';

  // ---- Creator ----
  const cr = (creator || []) as any[];
  const crLast = cr[0]?.created_at || null;
  const crAB = cr.filter((c) => c.brief?.ab_variant);
  const crPairs = new Set(crAB.map((c) => c.brief?.ab_pair_id).filter(Boolean)).size;
  const crVideo = cr.filter((c) => c.brief?.assets?.video_h).length;
  const crFromPlan = cr.filter((c) => c.brief?.suggestion_title).length;

  // ---- Evaluator ----
  const ev = (evaluator || []) as any[];
  const evLast = ev[0]?.imported_at || ev[0]?.created_at || null;
  const evLatest = ev[0]?.summary || null;

  // Cảnh báo ĐÓI ở đầu trang (cùng logic /api/bot-status): AI nào quá lâu không học, số liệu
  // FB có kéo về không — kèm nguyên nhân khả dĩ để người quản lý biết phải kiểm chỗ nào.
  // Phần Đo lường: đọc run_log lượt kéo gần nhất để nói ĐÚNG lỗi Facebook trả (lib/metrics-alert.ts).
  const metric = await metricsAlert(client);
  const hrs = (iso?: string | null) => (iso ? (Date.now() - new Date(iso).getTime()) / 3600000 : Infinity);
  const alerts: string[] = [];
  if (hrs(d1Last) > 30) alerts.push(d1Last ? `AI Data 1 đã ${Math.floor(hrs(d1Last))} giờ không có bản ghi nội bộ mới — phiên đọc Zalo hôm nay có chạy không, file đã lên bucket chưa (task Windows SDVICO-DayKhoZalo 8:15 / 16:30 / 20:30)?` : 'AI Data 1 chưa học nội bộ bao giờ.');
  if (hrs(d2Last) > 30) alerts.push(d2Last ? `AI Data 2 đã ${Math.floor(hrs(d2Last))} giờ không có nguồn public mới — cron mkt-metrics-pull (chạy học public mỗi ngày) có thể đang không chạy.` : 'AI Data 2 chưa học public bao giờ.');
  if (metric.alert) alerts.push(`Đo lường: ${metric.alert.message} BOSS và Evaluator chưa có số để học.`);

  const cards = [
    {
      key: 'data1', icon: '🔒', name: 'AI Data 1 · Nội bộ',
      role: 'Đọc file Zalo (Cowork xuất, thả vào bucket) mỗi ngày, tóm tắt thành bản ghi tri thức.',
      last: d1Last, health: healthOf(d1Last),
      stats: [
        { n: internal7?.length || 0, l: '7 ngày' },
        { n: internalAll || 0, l: 'tổng' },
      ],
      latest: d1Latest ? `Học gần nhất: ${d1Latest}` : 'Chưa có bản ghi nào trong 7 ngày. Thả file Zalo vào bucket để AI học.',
      link: '/kho-tri-thuc',
    },
    {
      key: 'data2', icon: '🌐', name: 'AI Data 2 · Public ngành cá',
      role: 'Lên mạng đọc tin ngành thủy sản, IUU, giá dầu, VMS mỗi ngày (Google News); Chủ nhật quét sâu thêm.',
      last: d2Last, health: healthOf(d2Last),
      stats: [
        { n: public7?.length || 0, l: '7 ngày' },
        { n: publicAll || 0, l: 'tổng' },
      ],
      latest: d2Latest ? `Học gần nhất: ${d2Latest}` : 'Chưa có nguồn public trong 7 ngày.',
      link: '/kho-tri-thuc',
    },
    {
      key: 'boss', icon: '🧠', name: 'AI Planner · BOSS',
      role: 'CN 19h học số liệu tuần, Thứ 2 8h ra kế hoạch tuần, mỗi tối 19h chỉnh nhẹ; gom tri thức 2 AI Data + kết luận A/B để ra hướng đi cho Creator.',
      last: bossLast, health: bossLast ? ((Date.now() - new Date(bossLast).getTime()) / 86400000 <= 7 ? 'ok' : 'warn') : 'idle',
      stats: [
        { n: bossSug.length, l: 'hướng đi' },
        { n: bossSugUsed, l: 'đã dùng' },
        { n: bossKnowledge ? (bossKnowledge.internal || 0) + (bossKnowledge.publicSrc || 0) : 0, l: 'nguồn đã đọc' },
      ],
      latest: latestPlan
        ? `Bản mới nhất: ${bossCadence}, ${fmtDT(bossLast)}${appliedPlan ? (appliedPlan.id === latestPlan.id ? ' — đang áp dụng' : ' — bản đang áp dụng là bản cũ hơn') : ' — chưa áp dụng'}${bossPlan?.data?.goal ? `. Mục tiêu: ${bossPlan.data.goal}` : '. Không có mục tiêu giao, BOSS tự định hướng.'}${bossSugPending ? ` ${vnInt(bossSugPending)} hướng đang chờ bản B.` : ''}`
        : 'Chưa có bản kế hoạch nào.',
      link: '/ke-hoach',
    },
    {
      key: 'creator', icon: '✍️', name: 'AI Creator · Sáng tạo',
      role: 'Nhận hướng đi từ BOSS, viết bài A/B (mỗi ngày 1 bản), dựng video AI cho sản phẩm có clip gốc, chọn ảnh khớp chủ đề.',
      last: crLast, health: healthOf(crLast),
      stats: [
        { n: cr.length, l: 'bài 7 ngày' },
        { n: crPairs, l: 'cặp A/B' },
        { n: crVideo, l: 'có video AI' },
      ],
      latest: cr[0] ? `Bài gần nhất: ${cr[0].title}${crFromPlan ? ` · ${vnInt(crFromPlan)} bài bám hướng đi kế hoạch` : ''}` : 'Chưa sinh bài nào trong 7 ngày.',
      link: '/noi-dung',
    },
    {
      key: 'evaluator', icon: '🧪', name: 'AI Evaluator · Đánh giá',
      role: 'Mỗi ngày so cặp A/B theo tương tác thật, ghi kết luận về Nguồn để BOSS và các AI học cho vòng sau.',
      last: evLast, health: ev.length ? healthOf(evLast) : 'idle',
      stats: [
        { n: ev.length, l: 'kết luận A/B' },
      ],
      latest: evLatest ? `Kết luận gần nhất: ${evLatest}` : 'Chưa có cặp A/B nào đủ số liệu để so (cần bài đã đăng vài ngày và có tương tác). Đây là bình thường ở tuần khởi động.',
      link: '/kho-tri-thuc',
    },
  ] as const;

  // Dòng thời gian gộp: học nội bộ, học public, kế hoạch, bài Creator, kết luận Evaluator.
  type Ev = { at: string; who: string; icon: string; text: string };
  const timeline: Ev[] = [];
  for (const r of recentInternal || []) {
    const isEval = String((r as any).source_path || '').startsWith('evaluator/');
    timeline.push({ at: (r as any).created_at, who: isEval ? 'Evaluator' : 'Data 1', icon: isEval ? '🧪' : '🔒', text: `${isEval ? 'Kết luận A/B' : 'Học nội bộ'}: ${(r as any).title || ''}` });
  }
  for (const r of recentPublic || []) timeline.push({ at: (r as any).created_at, who: 'Data 2', icon: '🌐', text: `Học public: ${(r as any).source_title || ''}` });
  for (const p of (plans || []).slice(0, 3) as any[]) timeline.push({ at: p.created_at, who: 'BOSS', icon: '🧠', text: `Sinh kế hoạch (${p.data?.cadence === 'weekly' ? 'tuần' : p.data?.cadence === 'update' ? 'cập nhật' : p.generated_by === 'manual' ? 'tạo tay' : 'tự động'}), ${vnInt((p.data?.content_suggestions || []).length)} hướng đi${p.applied ? ', đang áp dụng' : ''}` });
  for (const c of cr.slice(0, 6)) timeline.push({ at: c.created_at, who: 'Creator', icon: '✍️', text: `Sinh bài${c.brief?.ab_variant ? ` (thử ${c.brief.ab_variant})` : ''}${c.brief?.assets?.video_h ? ' + video AI' : ''}: ${c.title}` });
  timeline.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  const timelineTop = timeline.slice(0, 20);

  return (
    <main>
      <header className="head-row">
        <div>
          <h1>Dữ liệu AI</h1>
          <p className="sub">5 AI trong vòng lặp: Data 1 + Data 2 học nguyên liệu → BOSS lập kế hoạch → Creator viết bài dựng video → Evaluator so kết quả trả lại BOSS.</p>
        </div>
      </header>

      {alerts.length ? (
        <div className="ai-alerts" role="alert">
          <b>⚠️ AI đang đói / mắt xích chưa chạy</b>
          <ul>{alerts.map((t, i) => <li key={i}>{t}</li>)}</ul>
        </div>
      ) : (
        <p className="ai-ok">✅ Mọi AI đều học trong 30 giờ qua và số liệu đang chảy về.</p>
      )}

      <div className="dai-grid">
        {cards.map((c) => {
          const h = HEALTH_LABEL[c.health];
          const top2 = c.stats.slice(0, 2);
          return (
            <a key={c.key} className="dai-card" href={c.link} title={c.role}>
              <div className="dai-head">
                <span className="dai-icon" aria-hidden="true">{c.icon}</span>
                <b className="dai-name">{c.name}</b>
                <span className={`badge tone-${h.tone} dai-health`}>{h.text}</span>
              </div>
              <div className="dai-stats">
                {top2.map((s) => (
                  <div key={s.l} className="dai-stat"><b>{vnInt(s.n)}</b><span>{s.l}</span></div>
                ))}
              </div>
              <div className="dai-foot">
                {c.last ? <span>Gần nhất {ago(c.last)}</span> : <span className="muted">Chưa học</span>}
              </div>
              <p className="dai-latest sub">{c.latest}</p>
            </a>
          );
        })}
      </div>

      <section className="ai-timeline">
        <h2>Hoạt động gần đây</h2>
        {timelineTop.length === 0 ? (
          <p className="sub">Chưa có hoạt động nào được ghi nhận.</p>
        ) : (
          <ul className="ai-tl-list">
            {timelineTop.map((e, i) => (
              <li key={i} className="ai-tl-item">
                <span className="ai-tl-time">{fmtDT(e.at)}</span>
                <span className="ai-tl-who"><span aria-hidden="true">{e.icon}</span> {e.who}</span>
                <span className="ai-tl-text">{e.text}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
