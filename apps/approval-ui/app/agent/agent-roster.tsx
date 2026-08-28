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

  type AgentDef = {
    icon: string; name: string; role: string; boss?: boolean;
    model: string; runsAt: string;
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
      model: 'Gemini flash-lite (env MKT_MODEL, key GEMINI_API_KEY)', runsAt: 'Vercel — cron /api/mkt-metrics-pull mỗi giờ',
      role: 'Quản lý tất cả: học số liệu tuần, ra kế hoạch tuần, mỗi tối 19h chỉnh trọng số nhẹ (±0,5). 70% học bài mới, 30% dùng lại bài cũ đã chỉnh trọng số.',
      last: mkLast(bossRow, bossRow?.task === 'mkt.live_apply' ? 'chỉnh trọng số tối' : 'ra kế hoạch'),
      href: '/ke-hoach',
    },
    {
      icon: '✍️', name: 'AI tạo kịch bản',
      model: 'Gemini flash-lite (env MKT_MODEL)', runsAt: 'Vercel — /api/rotate 2 khung giờ mỗi ngày', role: 'Viết bài + kịch bản video theo hướng đi BOSS giao (Gemini). Vòng xoay mỗi ngày 2 khung giờ.',
      last: mkLast(lastOf(['mkt.rotate', 'mkt.suggestions_refill']), 'sinh bài theo lịch'),
      href: '/noi-dung',
    },
    {
      icon: '🎬', name: 'AI làm video',
      model: 'ffmpeg (không dùng LLM)', runsAt: 'Máy local — C:/Users/ADMIN/Desktop/SDVICO Marketing/packages/marketing/src/video/build-video.mjs (Watcher)', role: 'ffmpeg trên máy local (Watcher): ghép cảnh 9:16, burn phụ đề, cân âm lượng, đưa video lên kho.',
      last: lastVideoAsset
        ? { at: lastVideoAsset.created_at, ok: true, note: `video mới nhất: ${String(lastVideoAsset.title || '').slice(0, 50)}` }
        : { at: null, ok: null, note: 'kho chưa có video nào' },
      href: '/kho-tri-thuc?ai=video-ai',
    },
    {
      icon: '🎙️', name: 'AI giọng nói',
      model: 'Gemini TTS 3.1-flash → 2.5-flash → 2.5-pro (giọng Leda); hết mức lui edge-tts vi-VN-HoaiMy', runsAt: 'Máy local — chạy cùng Watcher build-video.mjs', role: 'Gemini TTS giọng Leda đọc tiếng Việt; hết hạn mức tự lui edge-tts HoaiMy. Cả video luôn một giọng.',
      last: lastVideoAsset
        ? { at: lastVideoAsset.created_at, ok: true, note: 'chạy cùng lượt dựng video gần nhất' }
        : { at: null, ok: null, note: 'chạy cùng Watcher, chưa có video' },
      href: '/kho-tri-thuc?ai=video-ai',
    },
    {
      icon: '🔍', name: 'AI quản lý SEO',
      model: 'Gemini flash-lite (seed từ khóa)', runsAt: 'Vercel cron + script local packages/marketing (seo_audit)', role: 'Seed từ khóa, audit SEO trang công khai, giữ sitemap sạch cho Google đọc.',
      last: mkLast(lastOf(['mkt.seo_audit', 'mkt.seed_keywords']), 'audit/seed từ khóa'),
      href: '/kho-tri-thuc?ai=seo-ai',
    },
    {
      icon: '📆', name: 'AI quản lý lịch và kênh',
      model: 'Không LLM — Facebook Graph v26 · YouTube Data v3 · TikTok Display API', runsAt: 'Vercel — cron mỗi giờ + ngay khi bấm Duyệt', role: 'Bài duyệt xong tự đăng đúng kênh (FB, YouTube; TikTok xuất tay), kéo số liệu mỗi giờ.',
      last: mkLast(lastOf(['mkt.publish_facebook_ui', 'mkt.publish_facebook', 'mkt.publish_youtube', 'mkt.publish_tiktok', 'mkt.metrics_pull']), 'đăng bài / kéo số liệu'),
      href: '/kho-tri-thuc?ai=lich-kenh',
    },
    {
      icon: '📈', name: 'AI báo cáo tuần',
      model: 'Không LLM — tính trực tiếp từ mkt_metrics', runsAt: 'Vercel — cron Chủ nhật 19h', role: 'Chủ nhật 19h gom số liệu tuần từ các bài đã đăng, gửi về BOSS học và đề xuất đổi trọng số.',
      last: mkLast(lastOf(['mkt.learn_weekly']), 'học tuần xong, có đề xuất'),
      href: '/kho-tri-thuc?ai=bao-cao',
    },
    {
      icon: '🏠', name: 'AI DATA 1 — nội bộ',
      model: 'Gemini flash-lite (đọc ảnh + tóm tắt file)', runsAt: 'Vercel cron hằng ngày — nguồn bucket Supabase kho-tri-thuc-noi-bo (file Zalo)', role: 'Học tri thức nội bộ (file Zalo/tài liệu người phụ trách thả vào kho) thành insight cho BOSS.',
      last: lastInternal
        ? { at: lastInternal.created_at, ok: true, note: `${fmt(dataInternalCount.count || 0)} mẩu tri thức trong kho` }
        : { at: null, ok: null, note: 'kho tri thức nội bộ trống' },
      href: '/kho-tri-thuc?ai=noi-bo',
    },
    {
      icon: '🌐', name: 'AI DATA 2 — trên mạng',
      model: 'Google News RSS (miễn phí) + Gemini flash-lite (quét sâu CN + chấm tier)', runsAt: 'Vercel cron hằng ngày', role: 'Quét bài viết, video, keyword đang nóng trên mạng, chấm điểm tier S/A/B/C, gợi ý trend cho BOSS.',
      last: (() => {
        const r = lastOf(['mkt.knowledge_public_deep']);
        if (r) return mkLast(r, `quét xong, kho có ${fmt(dataPublicCount.count || 0)} mục`);
        return lastPublic
          ? { at: lastPublic.created_at, ok: true, note: `kho có ${fmt(dataPublicCount.count || 0)} mục` }
          : { at: null, ok: null as boolean | null, note: 'chưa quét lần nào' };
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
            <span className={`badge ${a.last.ok === true ? 'tone-ok' : a.last.ok === false ? 'tone-no' : 'tone-demo'}`}>
              {a.last.ok === true ? 'Đang chạy' : a.last.ok === false ? 'Lỗi' : 'Chưa chạy'}
            </span>
          </div>
          <p className="ag-role" style={{ margin: 0 }}>{a.role}</p>
          <p className="ag-role" style={{ margin: 0, fontSize: '.76rem' }}>🧩 <b>Model:</b> {a.model}</p>
          <p className="ag-role" style={{ margin: 0, fontSize: '.76rem' }}>📍 <b>Chạy tại:</b> {a.runsAt}</p>
          <div className="ag-last">
            {a.last.at ? `Học lần cuối ${ago(a.last.at)} (${fmtDT(a.last.at)}) — ${a.last.note}` : a.last.note}
            {a.href ? <> · <Link className="src" href={a.href}>Chi tiết →</Link></> : null}
          </div>
        </div>
      ))}
    </div>
  );
}
