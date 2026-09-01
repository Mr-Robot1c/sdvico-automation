import Link from 'next/link';
import { getServerClient } from '../../lib/supabase-server';
import PlatformLogo from '../noi-dung/platform-logo';

// 27/8 REDESIGN (docx "redesign web" cua sep) — trang VIDEO: luong lam video bang AI cua
// SDVICO (thay vidpod/OpenMontage cua ForLife bang Gemini + ffmpeg cua minh):
//   Kich ban (Gemini) -> Giong doc (Gemini TTS) -> Ghep (ffmpeg Watcher local) -> Luu tru
//   (Supabase Storage) -> Dang (FB / YouTube Shorts / TikTok).
// + Bai dang cho Watcher dung, + Artifact dang nam o dau (video moi nhat trong kho).
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

export default async function Page() {
  const client = getServerClient();
  const since30 = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();

  const [contentRes, assetsRes, postsRes] = await Promise.all([
    // Bai co video_requested / video_scenes gan day — filter JS vi JSONB ->> khong reliable.
    client
      .from('mkt_content')
      .select('id, title, brief, created_at')
      .is('deleted_at', null)
      .gte('created_at', since30)
      .order('created_at', { ascending: false })
      .limit(200),
    client
      .from('brand_assets')
      .select('id, kind, title, storage_path, product_group, created_at')
      .in('kind', ['video', 'clip'])
      .order('created_at', { ascending: false })
      .limit(12),
    client
      .from('mkt_posts')
      .select('channel, content_id')
      .eq('status', 'published')
      .is('deleted_at', null)
      .in('channel', ['facebook', 'youtube', 'tiktok'])
      .limit(1000),
  ]);

  const contents = (contentRes.data || []) as any[];
  const assets = (assetsRes.data || []) as any[];
  const postRows = (postsRes.data || []) as any[];

  const waiting = contents.filter((c) => c.brief?.video_requested === true || String(c.brief?.video_requested) === 'true');
  const generating = contents.filter((c) => c.brief?.trend_generating === true || String(c.brief?.trend_generating) === 'true');
  const builtRecently = contents.filter((c) => c.brief?.trend_video_built_at || c.brief?.assets?.video_v || c.brief?.assets?.video);
  const ytCount = postRows.filter((p) => p.channel === 'youtube').length;
  const ttCount = postRows.filter((p) => p.channel === 'tiktok').length;

  // So VIDEO da dang len Facebook: FB tron lan bai text/anh/video nen chi dem bai co video
  // that (kind='video' hoac brief.assets.video/video_v). YT/TikTok von chi co video -> dem het.
  const fbCids = [...new Set(postRows.filter((p) => p.channel === 'facebook').map((p) => String(p.content_id || '')).filter(Boolean))].slice(0, 500);
  let fbVideoCount = 0;
  if (fbCids.length) {
    const { data: fbContents } = await client.from('mkt_content').select('id, kind, brief').in('id', fbCids);
    fbVideoCount = (fbContents || []).filter((c: any) => c.kind === 'video' || c.brief?.assets?.video || c.brief?.assets?.video_v).length;
  }

  const urlOf = (p: string) => client.storage.from('brand-assets').getPublicUrl(p).data.publicUrl;

  // 1/9 (user feedback): văn phong cho NGƯỜI DÙNG, không phô jargon (ffmpeg, 1080x1920,
  // burn phụ đề, cân âm lượng, brand-assets, Supabase). Diễn đạt việc bằng ngôn ngữ nghiệp vụ.
  const steps = [
    { icon: '📝', name: 'Viết kịch bản', tool: 'AI viết theo hướng đi của tuần', desc: 'BOSS ra hướng đi, máy viết kịch bản 3-8 cảnh (mở đầu hút mắt — đồng cảm — lối ra) và kịch bản bài trend kèm cảnh minh họa.' },
    { icon: '🎙️', name: 'Đọc giọng', tool: 'Giọng Mỹ Duyên (dự phòng Gemini/Edge)', desc: 'Đọc tiếng Việt giọng Mỹ Duyên; máy chủ giọng bận thì tự lui giọng dự phòng. Cả video luôn dùng một giọng.' },
    { icon: '🎬', name: 'Dựng video', tool: 'Máy nội bộ hoặc cloud', desc: 'Ghép các cảnh thành video dọc chuẩn TikTok/Reel, gắn phụ đề vào hình, cân đều âm lượng cho dễ nghe.' },
    { icon: '☁️', name: 'Lưu vào kho', tool: 'Kho tư liệu của SDVICO', desc: 'Mỗi bài giữ MỘT video mới nhất trong kho, bản cũ tự dọn.' },
    { icon: '📤', name: 'Đăng', tool: 'Facebook Reel · YouTube Shorts · TikTok', desc: 'Người bấm Duyệt mới đăng. TikTok xuất tay qua nút Xuất video (ứng dụng chưa qua duyệt của TikTok).' },
  ];

  return (
    <main>
      <header className="head-row">
        <div>
          <h1>Video</h1>
          <p className="sub">Dây chuyền làm video bằng AI của SDVICO — từ kịch bản đến video dọc có giọng đọc và phụ đề, sẵn sàng đăng TikTok/Reel/Shorts.</p>
        </div>
        <div className="head-actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link href="/san-xuat" className="btn ghost">🎬 Xưởng sản xuất</Link>
          <Link href="/tu-lieu" className="btn ghost">🎞️ Kho tư liệu</Link>
        </div>
      </header>

      {/* ===== TILE TRANG THAI (28/8: gop Da dang thanh 1 block chia 3 o FB | YT | TikTok) ===== */}
      <div className="pl-tiles">
        <div className={`pl-tile ${generating.length ? 'hot' : ''}`}><b>{fmt(generating.length)}</b><span>Đang sinh kịch bản</span></div>
        <div className={`pl-tile ${waiting.length ? 'hot' : ''}`}><b>{fmt(waiting.length)}</b><span>Chờ Watcher dựng</span></div>
        <div className="pl-tile"><b>{fmt(builtRecently.length)}</b><span>Video dựng xong (30 ngày)</span></div>
        <div className="pl-tile" style={{ gridColumn: 'span 2', minWidth: 260 }}>
          <span style={{ marginTop: 0, fontWeight: 600 }}>Đã đăng</span>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 8 }}>
            <div style={{ textAlign: 'center', borderRight: '1px solid var(--line)' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><PlatformLogo platform="facebook" size={15} /><b style={{ fontSize: '1.25rem' }}>{fmt(fbVideoCount)}</b></span>
              <span style={{ display: 'block', fontSize: '.75rem', color: 'var(--ink-2)' }}>Video Facebook</span>
            </div>
            <div style={{ textAlign: 'center', borderRight: '1px solid var(--line)' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><PlatformLogo platform="youtube" size={15} /><b style={{ fontSize: '1.25rem' }}>{fmt(ytCount)}</b></span>
              <span style={{ display: 'block', fontSize: '.75rem', color: 'var(--ink-2)' }}>Video YouTube</span>
            </div>
            <div style={{ textAlign: 'center' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><PlatformLogo platform="tiktok" size={15} /><b style={{ fontSize: '1.25rem' }}>{fmt(ttCount)}</b></span>
              <span style={{ display: 'block', fontSize: '.75rem', color: 'var(--ink-2)' }}>Video TikTok</span>
            </div>
          </div>
        </div>
      </div>

      {/* ===== LUONG LAM VIDEO ===== */}
      <section className="blk">
        <h2><span aria-hidden="true">⚙️</span> Luồng làm video <span className="sub">5 bước, AI của SDVICO tự chạy — người chỉ bấm Duyệt</span></h2>
        <div className="blk-cols" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', marginBottom: 0 }}>
          {steps.map((s, i) => (
            <div key={s.name} className="agent-card">
              <div className="ag-head">
                <span className="ag-name">{s.icon} {i + 1}. {s.name}</span>
              </div>
              <span className="badge tone-demo" style={{ justifySelf: 'start' }}>{s.tool}</span>
              <p className="ag-role" style={{ margin: 0 }}>{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ===== BAI DANG CHO DUNG ===== */}
      {waiting.length || generating.length ? (
        <section className="blk">
          <h2><span aria-hidden="true">⏳</span> Bài đang trong dây chuyền</h2>
          <div style={{ display: 'grid', gap: 8 }}>
            {generating.map((c) => (
              <div key={c.id} className="need-item">
                <span>📝</span>
                <span style={{ flex: 1 }}><b>{String(c.title || '(không tên)').slice(0, 80)}</b> — Gemini đang viết kịch bản + tìm cảnh Pexels (~30 giây, F5 để cập nhật).</span>
              </div>
            ))}
            {waiting.map((c) => (
              <div key={c.id} className="need-item">
                <span>🎬</span>
                <span style={{ flex: 1 }}><b>{String(c.title || '(không tên)').slice(0, 80)}</b> — chờ Watcher máy local dựng (máy local phải đang bật script Watcher).</span>
                <span className="sub" style={{ fontSize: '.78rem', whiteSpace: 'nowrap' }}>{fmtDT(c.created_at)}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* ===== ARTIFACT DANG NAM O DAU ===== */}
      <section className="blk">
        <h2><span aria-hidden="true">📦</span> Video mới nhất trong kho <span className="sub">brand-assets trên Supabase Storage — bấm để mở xem</span></h2>
        {assets.length === 0 ? (
          <p className="sub" style={{ margin: 0 }}>Kho chưa có video nào.</p>
        ) : (
          <div className="tablewrap">
            <table className="datatable">
              <thead>
                <tr>
                  <th>Video</th>
                  <th style={{ width: 140 }}>Folder</th>
                  <th style={{ width: 120 }}>Tạo lúc</th>
                  <th style={{ width: 80 }}>Mở</th>
                </tr>
              </thead>
              <tbody>
                {assets.map((a) => (
                  <tr key={a.id}>
                    <td className="cell-title"><b>{String(a.title || a.storage_path).slice(0, 80)}</b></td>
                    <td className="sub" style={{ fontSize: '.82rem' }}>{String(a.product_group || '—')}</td>
                    <td className="sub" style={{ fontSize: '.82rem' }}>{fmtDT(a.created_at)}</td>
                    <td><a className="src" href={urlOf(String(a.storage_path))} target="_blank" rel="noreferrer">↗ Xem</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="sub" style={{ margin: '10px 0 0', fontSize: '.85rem' }}>
          <Link href="/tu-lieu" className="src">Mở Kho tư liệu đầy đủ →</Link>
          {' · '}
          <Link href="/san-xuat" className="src">Tự ghép bài mới ở Xưởng sản xuất →</Link>
        </p>
      </section>
    </main>
  );
}
