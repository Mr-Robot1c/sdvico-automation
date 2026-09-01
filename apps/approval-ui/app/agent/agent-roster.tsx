import Link from 'next/link';
import { getServerClient } from '../../lib/supabase-server';

// 28/8 (user: "chi dung 1 dashboard the hien tat ca cac Agent"): bo 9 AI card tach ra
// component dung chung — trang /agent va trang Nguon hoc du lieu (/kho-tri-thuc tab Tong
// quan) cung render, khong con 2 bo agent cu/moi lech nhau. Server component tu query.

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

// 28/8 (user: "them so gio ma cac AI da hoc lan cuoi"): "X phut/gio/ngay truoc" kem gio tuyet doi.
function ago(iso: string | null): string {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '';
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'vừa xong';
  if (min < 60) return `${min} phút trước`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h} giờ trước`;
  return `${Math.floor(h / 24)} ngày trước`;
}

type LogRow = { task: string; status: string; detail: any; created_at: string };

export default async function AgentRoster() {
  const client = getServerClient();

  const [logRes, dataInternalCount, dataInternalLast, dataPublicCount, dataPublicLast, videoAssetRes] = await Promise.all([
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
    client.from('mkt_knowledge_public').select('*', { count: 'exact', head: true }),
    client.from('mkt_knowledge_public').select('created_at').order('created_at', { ascending: false }).limit(1),
    client.from('brand_assets').select('title, created_at').in('kind', ['video', 'clip']).order('created_at', { ascending: false }).limit(1),
  ]);

  const logs = (logRes.data || []) as LogRow[];
  const lastOf = (tasks: string[]): LogRow | null => logs.find((l) => tasks.includes(l.task)) || null;
  const lastVideoAsset = ((videoAssetRes.data || [])[0] as any) || null;
  const lastInternal = ((dataInternalLast.data || [])[0] as any) || null;
  const lastPublic = ((dataPublicLast.data || [])[0] as any) || null;

  // 1/9 (user hỏi vì sao có AI "Lỗi"/"Chưa chạy"): run_log có 3 status ok/error/skipped —
  // skipped là "bỏ qua có mục đích" (rotate đã sinh xong slot hôm nay, guard chặn dư),
  // KHÔNG phải lỗi. Trước gộp !== 'ok' thành ok:false -> UI in "Lỗi" oan.
  type AgentDef = {
    icon: string; name: string; role: string; boss?: boolean;
    model: string; runsAt: string;
    last: { at: string | null; state: 'ok' | 'error' | 'skipped' | null; note: string };
    href?: string;
  };
  const mkLast = (row: LogRow | null, okNote: string): AgentDef['last'] => {
    if (!row) return { at: null, state: null, note: 'chưa thấy lần chạy nào trong log' };
    if (row.status === 'ok') return { at: row.created_at, state: 'ok', note: okNote };
    if (row.status === 'skipped') {
      const reason = String((row as any).detail?.reason || 'bỏ qua theo lịch').slice(0, 80);
      return { at: row.created_at, state: 'skipped', note: `bỏ qua có chủ đích: ${reason}` };
    }
    return { at: row.created_at, state: 'error', note: `lỗi: ${String((row as any).detail?.error || (row as any).detail?.msg || row.status).slice(0, 80)}` };
  };

  const bossRow = lastOf(['mkt.plan', 'mkt.plan_manual', 'mkt.live_apply', 'mkt.apply_learn']);
  const agents: AgentDef[] = [
    {
      icon: '👑', name: 'AI BOSS', boss: true,
      /* 30/8 (audit H3): không phô tên biến môi trường / tên khóa / đường dẫn API ra giao diện. */
      model: 'Gemini Flash Lite', runsAt: 'Chạy trên cloud — tự động mỗi giờ',
      role: 'Quản lý tất cả: học số liệu tuần, ra kế hoạch tuần, mỗi tối 19h chỉnh trọng số nhẹ (±0,5). 70% học bài mới, 30% dùng lại bài cũ đã chỉnh trọng số.',
      last: mkLast(bossRow, bossRow?.task === 'mkt.live_apply' ? 'chỉnh trọng số tối' : 'ra kế hoạch'),
      href: '/ke-hoach',
    },
    {
      icon: '✍️', name: 'AI tạo kịch bản',
      model: 'Gemini Flash Lite', runsAt: 'Chạy trên cloud — 2 khung giờ mỗi ngày', role: 'Viết bài + kịch bản video theo hướng đi BOSS giao (Gemini). Vòng xoay mỗi ngày 2 khung giờ.',
      last: mkLast(lastOf(['mkt.rotate', 'mkt.suggestions_refill']), 'sinh bài theo lịch'),
      href: '/noi-dung',
    },
    {
      icon: '🎬', name: 'AI làm video',
      /* 1/9 (user feedback): diễn đạt cho người dùng, bỏ jargon 9:16/burn/cân âm lượng. */
      model: 'Dây chuyền dựng video (không dùng LLM)', runsAt: 'Máy nội bộ hoặc cloud', role: 'Ghép cảnh thành video dọc, gắn phụ đề, cân đều âm lượng, đưa vào kho tư liệu.',
      last: lastVideoAsset
        ? { at: lastVideoAsset.created_at, state: 'ok', note: `video mới nhất: ${String(lastVideoAsset.title || '').slice(0, 50)}` }
        : { at: null, state: null, note: 'kho chưa có video nào' },
      href: '/kho-tri-thuc?ai=video-ai',
    },
    {
      icon: '🎙️', name: 'AI giọng nói',
      /* 30/8: cập nhật thực tế 28/8 — giọng chính là Mỹ Duyên (VieNeu), Gemini/edge chỉ dự phòng. */
      model: 'VieNeu giọng Mỹ Duyên; dự phòng Gemini TTS rồi edge-tts', runsAt: 'Chạy cùng lượt dựng video', role: 'Đọc lời thoại tiếng Việt giọng Mỹ Duyên; máy chủ giọng bận thì tự lui giọng dự phòng. Cả video luôn một giọng.',
      last: lastVideoAsset
        ? { at: lastVideoAsset.created_at, state: 'ok', note: 'chạy cùng lượt dựng video gần nhất' }
        : { at: null, state: null, note: 'chạy cùng Watcher, chưa có video' },
      href: '/kho-tri-thuc?ai=video-ai',
    },
    {
      icon: '🔍', name: 'AI quản lý SEO',
      model: 'Gemini Flash Lite (seed từ khóa)', runsAt: 'Chạy trên cloud + máy nội bộ', role: 'Seed từ khóa, audit SEO trang công khai, giữ sitemap sạch cho Google đọc.',
      last: mkLast(lastOf(['mkt.seo_audit', 'mkt.seed_keywords']), 'audit/seed từ khóa'),
      href: '/kho-tri-thuc?ai=seo-ai',
    },
    {
      icon: '📆', name: 'AI quản lý lịch và kênh',
      model: 'Không LLM — Facebook Graph · YouTube Data · TikTok Display API', runsAt: 'Chạy trên cloud — mỗi giờ + ngay khi bấm Duyệt', role: 'Bài duyệt xong tự đăng đúng kênh (FB, YouTube; TikTok xuất tay), kéo số liệu mỗi giờ.',
      last: mkLast(lastOf(['mkt.publish_facebook_ui', 'mkt.publish_facebook', 'mkt.publish_youtube', 'mkt.publish_tiktok', 'mkt.metrics_pull']), 'đăng bài / kéo số liệu'),
      href: '/kho-tri-thuc?ai=lich-kenh',
    },
    {
      icon: '📈', name: 'AI báo cáo tuần',
      model: 'Không LLM — tính trực tiếp từ số liệu đo lường', runsAt: 'Chạy trên cloud — Chủ nhật 19h', role: 'Chủ nhật 19h gom số liệu tuần từ các bài đã đăng, gửi về BOSS học và đề xuất đổi trọng số.',
      last: mkLast(lastOf(['mkt.learn_weekly']), 'học tuần xong, có đề xuất'),
      href: '/kho-tri-thuc?ai=bao-cao',
    },
    {
      icon: '🏠', name: 'AI DATA 1 — nội bộ',
      model: 'Gemini Flash Lite (đọc ảnh + tóm tắt file)', runsAt: 'Chạy trên cloud hằng ngày — nguồn kho tri thức nội bộ (file Zalo)', role: 'Học tri thức nội bộ (file Zalo/tài liệu người phụ trách thả vào kho) thành insight cho BOSS.',
      last: lastInternal
        ? { at: lastInternal.created_at, state: 'ok', note: `${fmt(dataInternalCount.count || 0)} mẩu tri thức trong kho` }
        : { at: null, state: null, note: 'kho tri thức nội bộ trống' },
      href: '/kho-tri-thuc?ai=noi-bo',
    },
    {
      icon: '🌐', name: 'AI DATA 2 — trên mạng',
      model: 'Google News RSS + Gemini Flash Lite (quét sâu CN + chấm tier)', runsAt: 'Chạy trên cloud hằng ngày', role: 'Quét bài viết, video, keyword đang nóng trên mạng, chấm điểm tier S/A/B/C, gợi ý trend cho BOSS.',
      last: (() => {
        const r = lastOf(['mkt.knowledge_public_deep']);
        if (r) return mkLast(r, `quét xong, kho có ${fmt(dataPublicCount.count || 0)} mục`);
        return lastPublic
          ? { at: lastPublic.created_at, state: 'ok', note: `kho có ${fmt(dataPublicCount.count || 0)} mục` }
          : { at: null, state: null, note: 'chưa quét lần nào' };
      })(),
      href: '/kho-tri-thuc?ai=public',
    },
  ];

  return (
    <div className="agent-grid">
      {agents.map((a) => (
        <div key={a.name} className="agent-card" style={a.boss ? { borderColor: 'var(--brand-red)', background: 'var(--brand-red-bg)' } : undefined}>
          <div className="ag-head">
            <span className="ag-name">{a.icon} {a.name}</span>
            {/* 1/9 (user hỏi): "Lỗi" chỉ dành cho error thật; skipped = bỏ qua có mục đích (xanh),
                null = chưa từng chạy (xám). */}
            {(() => {
              const s = a.last.state;
              const tone = s === 'ok' || s === 'skipped' ? 'tone-ok' : s === 'error' ? 'tone-no' : 'tone-demo';
              const label = s === 'ok' ? 'Đang chạy' : s === 'skipped' ? 'Đang chạy' : s === 'error' ? 'Lỗi' : 'Chưa chạy';
              const title = s === 'skipped' ? 'Có lịch chạy đều — lần này bỏ qua có mục đích (đã đủ việc/hết trong ngày)' : undefined;
              return <span className={`badge ${tone}`} title={title}>{label}</span>;
            })()}
          </div>
          <p className="ag-role" style={{ margin: 0 }}>{a.role}</p>
          <p className="ag-role" style={{ margin: 0, fontSize: '.76rem' }}>🧩 <b>Model:</b> {a.model}</p>
          <p className="ag-role" style={{ margin: 0, fontSize: '.76rem' }}>📍 <b>Chạy tại:</b> {a.runsAt}</p>
          <div className="ag-last">
            {/* 1/9: đổi "Học lần cuối" -> "Chạy lần cuối" cho đúng — AI làm việc chứ đâu chỉ học. */}
            {a.last.at ? `Chạy lần cuối ${ago(a.last.at)} (${fmtDT(a.last.at)}) — ${a.last.note}` : a.last.note}
            {a.href ? <> · <Link className="src" href={a.href}>Chi tiết →</Link></> : null}
          </div>
        </div>
      ))}
    </div>
  );
}
