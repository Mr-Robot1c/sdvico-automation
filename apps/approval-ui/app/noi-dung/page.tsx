import { getServerClient } from '../../lib/supabase-server';
import AutoRefresh from '../auto-refresh';
import ViewModal from '../view-modal';
import { editDraft } from '../actions';
import { lengthLabel, channelsLabel, intentLabel, riskMeta, COMPLIANCE_LABELS } from '../labels';

export const dynamic = 'force-dynamic';

const STATUS: Record<string, { label: string; tone: string }> = {
  draft: { label: 'Nháp', tone: 'demo' },
  review: { label: 'Chờ duyệt', tone: 'demo' },
  approved: { label: 'Đã duyệt', tone: 'ok' },
  rejected: { label: 'Đã từ chối', tone: 'no' },
  published: { label: 'Đã đăng', tone: 'web' }
};

// Các mốc lọc theo trạng thái trên thanh chip.
const STATUS_TABS: { key: string; label: string }[] = [
  { key: 'review', label: 'Chờ duyệt' },
  { key: 'approved', label: 'Đã duyệt' },
  { key: 'rejected', label: 'Đã từ chối' }
];

// Mã bài viết ngắn cho cột đầu: 6 ký tự đầu của UUID viết hoa, dễ đọc trên bảng.
function shortCode(id: string): string {
  return (id || '').replace(/-/g, '').slice(0, 6).toUpperCase();
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('vi-VN');
}

type Flags = Record<string, string[] | undefined>;
type Assets = { image?: string | null; video?: string | null } | null;
type Brief = { keyword?: string; intent?: string; risk?: string; compliance?: Flags; assets?: Assets; channels?: string[] } | null;
type Content = { id: string; kind: string; title: string; brief: Brief; draft: string | null; status: string; created_at: string };

export default async function Page({ searchParams }: { searchParams: { loai?: string; trangthai?: string } }) {
  const tab = searchParams?.loai === 'video' ? 'video' : 'baiviet';
  const kinds = tab === 'video' ? ['video'] : ['article', 'social'];
  const statusFilter = searchParams?.trangthai && STATUS[searchParams.trangthai] ? searchParams.trangthai : null;

  const client = getServerClient();
  const { data, error } = await client
    .from('mkt_content')
    .select('id, kind, title, brief, draft, status, created_at')
    .in('kind', kinds)
    .order('created_at', { ascending: false })
    .limit(200);

  const rawItems = (data || []) as Content[];

  // Trạng thái duyệt là ở approval_queue (nguồn sự thật của điều cấm 1). Lấy về để suy trạng thái
  // thực của mỗi bài: đã duyệt, đã từ chối, hay còn chờ.
  const { data: qRows } = await client
    .from('approval_queue')
    .select('payload, status, decided_at')
    .eq('kind', 'mkt_publish_content');
  const queueStatus = new Map<string, string>();
  const decidedAt = new Map<string, string>();
  for (const q of qRows || []) {
    const cid = (q.payload && typeof q.payload === 'object' ? (q.payload as any).content_id : null) as string | null;
    if (cid) {
      queueStatus.set(cid, q.status as string);
      if ((q as any).decided_at) decidedAt.set(cid, (q as any).decided_at as string);
    }
  }
  const effStatus = (c: Content): string => {
    const qs = queueStatus.get(c.id);
    if (qs === 'approved') return 'approved';
    if (qs === 'rejected') return 'rejected';
    if (qs === 'pending') return 'review';
    return c.status || 'draft';
  };

  // Đếm theo trạng thái (trên tập đã lọc theo loại) để dựng thanh chip.
  const statusCount = new Map<string, number>();
  for (const c of rawItems) statusCount.set(effStatus(c), (statusCount.get(effStatus(c)) || 0) + 1);

  // Sắp xếp: bài vừa có thao tác nổi lên đầu. Mốc = thời điểm duyệt/từ chối (decided_at) nếu đã xử lý,
  // không thì thời điểm tạo. Ví dụ bài tạo 10h trước, nay mới duyệt sẽ nhảy lên đầu danh sách.
  const activityTime = (c: Content): number => {
    const t = new Date(decidedAt.get(c.id) || c.created_at).getTime();
    return Number.isNaN(t) ? 0 : t;
  };
  const items = (statusFilter ? rawItems.filter((c) => effStatus(c) === statusFilter) : rawItems)
    .slice()
    .sort((a, b) => activityTime(b) - activityTime(a));

  // Đổi id ảnh/video đã gắn (brief.assets) ra link công khai để hiện trong modal.
  const assetIds = new Set<string>();
  for (const c of items) {
    const a = c.brief?.assets;
    if (a?.image) assetIds.add(a.image);
    if (a?.video) assetIds.add(a.video);
  }
  const assetUrl = new Map<string, { url: string; kind: string; title: string }>();
  if (assetIds.size) {
    const { data: as } = await client
      .from('brand_assets')
      .select('id, storage_path, kind, title')
      .in('id', [...assetIds]);
    for (const a of as || []) {
      const url = client.storage.from('brand-assets').getPublicUrl(a.storage_path as string).data.publicUrl;
      assetUrl.set(a.id as string, { url, kind: (a.kind as string) || '', title: (a.title as string) || '' });
    }
  }

  // Bài đã đăng thật: link "Xem bài" (external_url) theo content — thay cho trang Lịch sử xuất bản đã bỏ.
  // Chỉ nhận link http (Facebook). TikTok lưu 'tiktok:publishId' không mở được nên bỏ qua.
  const publishedByContent = new Map<string, { channel: string; url: string }[]>();
  const itemIds = items.map((c) => c.id);
  if (itemIds.length) {
    const { data: posts } = await client
      .from('mkt_posts')
      .select('content_id, channel, external_url')
      .eq('status', 'published')
      .in('content_id', itemIds);
    for (const p of posts || []) {
      const cid = (p as any).content_id as string | null;
      const ext = (p as any).external_url as string | null;
      if (cid && ext && /^https?:\/\//.test(ext)) {
        if (!publishedByContent.has(cid)) publishedByContent.set(cid, []);
        publishedByContent.get(cid)!.push({ channel: (p as any).channel || '', url: ext });
      }
    }
  }

  const [{ count: cBai }, { count: cVid }] = await Promise.all([
    client.from('mkt_content').select('*', { count: 'exact', head: true }).in('kind', ['article', 'social']),
    client.from('mkt_content').select('*', { count: 'exact', head: true }).eq('kind', 'video')
  ]);

  // Giữ nguyên loại khi đổi trạng thái, và ngược lại.
  const withParams = (patch: { loai?: string | null; trangthai?: string | null }) => {
    const loai = patch.loai !== undefined ? patch.loai : (tab === 'video' ? 'video' : null);
    const tt = patch.trangthai !== undefined ? patch.trangthai : statusFilter;
    const qs = new URLSearchParams();
    if (loai) qs.set('loai', loai);
    if (tt) qs.set('trangthai', tt);
    const s = qs.toString();
    return s ? `/noi-dung?${s}` : '/noi-dung';
  };

  return (
    <main>
      <header className="head-row">
        <div>
          <h1>Quản lý bài viết</h1>
          <p className="sub">Danh sách bài đã sinh, đã duyệt, đã từ chối, đã đăng. Bấm mắt để xem nội dung.</p>
        </div>
        <div className="head-actions">
          <AutoRefresh seconds={30} />
        </div>
      </header>

      <nav className="filters" aria-label="Loại nội dung">
        <a className={`chip ${tab === 'baiviet' ? 'on' : ''}`} href={withParams({ loai: null })}>
          <span aria-hidden="true">📝</span> Bài viết <span className="n">{cBai ?? 0}</span>
        </a>
        <a className={`chip ${tab === 'video' ? 'on' : ''}`} href={withParams({ loai: 'video' })}>
          <span aria-hidden="true">🎬</span> Video <span className="n">{cVid ?? 0}</span>
        </a>
      </nav>

      <nav className="filters" aria-label="Lọc theo trạng thái">
        <a className={`chip ${!statusFilter ? 'on' : ''}`} href={withParams({ trangthai: null })}>
          Tất cả <span className="n">{rawItems.length}</span>
        </a>
        {STATUS_TABS.map((s) => (
          <a
            key={s.key}
            className={`chip ${statusFilter === s.key ? 'on' : ''}`}
            href={withParams({ trangthai: s.key })}
          >
            {s.label} <span className="n">{statusCount.get(s.key) || 0}</span>
          </a>
        ))}
      </nav>

      {tab === 'video' ? (
        <div className="pipeline">
          <span className="pipe-step">1. Máy sinh kịch bản</span>
          <span className="pipe-step">2. Người duyệt</span>
          <span className="pipe-step">3. Quay bằng tư liệu thật</span>
          <span className="pipe-step">4. Whisper + FFmpeg dựng</span>
          <span className="pipe-step">5. Duyệt và đăng</span>
        </div>
      ) : null}

      {error ? <p className="err" role="alert">Lỗi tải dữ liệu: {error.message}</p> : null}

      {!error && items.length === 0 ? (
        <div className="empty">
          <div className="empty-icon" aria-hidden="true">{tab === 'video' ? '🎬' : '📝'}</div>
          <p>Chưa có {tab === 'video' ? 'kịch bản video' : 'bài viết'} nào{statusFilter ? ` ở mục ${STATUS[statusFilter].label}` : ''}.</p>
          <p className="sub">Vào <a className="src" href="/san-xuat">Xưởng sản xuất</a> để soạn bài mới.</p>
        </div>
      ) : null}

      {!error && items.length > 0 ? (
        <div className="tablewrap">
          <table className="datatable">
            <thead>
              <tr>
                <th scope="col">Mã</th>
                <th scope="col">Tên bài viết</th>
                <th scope="col">Loại</th>
                <th scope="col">Kênh</th>
                <th scope="col">Ngày tạo</th>
                <th scope="col">Trạng thái</th>
                <th scope="col" className="col-actions">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => {
                const st = STATUS[effStatus(c)] || { label: effStatus(c), tone: 'default' };
                const risk = riskMeta(c.brief?.risk);
                const f: Flags = c.brief?.compliance || {};
                const flagRows = Object.entries(COMPLIANCE_LABELS)
                  .map(([k, label]) => ({ label, items: Array.isArray(f[k]) ? (f[k] as string[]) : [] }))
                  .filter((x) => x.items.length > 0);
                const img = c.brief?.assets?.image ? assetUrl.get(c.brief.assets.image) : undefined;
                const vid = c.brief?.assets?.video ? assetUrl.get(c.brief.assets.video) : undefined;
                return (
                  <tr key={c.id}>
                    <td className="cell-code">{shortCode(c.id)}</td>
                    <td className="cell-title">
                      <div className="cell-title-main">{c.title}</div>
                      {c.brief?.keyword ? (
                        <div className="cell-title-sub">từ khóa: {c.brief.keyword}</div>
                      ) : null}
                    </td>
                    <td>{lengthLabel(c.kind)}</td>
                    <td>{channelsLabel(c.brief?.channels)}</td>
                    <td>{formatDate(c.created_at)}</td>
                    <td>
                      <span className={`badge tone-${st.tone}`}>{st.label}</span>
                    </td>
                    <td className="col-actions">
                      <ViewModal title={c.title} label="Xem bài viết">
                        <div className="badges">
                          <span className="badge badge-format">{lengthLabel(c.kind)}</span>
                          <span className={`badge tone-${risk.tone}`}>{risk.label}</span>
                          <span className={`badge tone-${st.tone}`}>{st.label}</span>
                          {c.brief?.intent ? <span className="badge">{intentLabel(c.brief.intent)}</span> : null}
                        </div>
                        {c.brief?.keyword ? (
                          <div className="metaline">Từ khóa: {c.brief.keyword}</div>
                        ) : null}
                        {flagRows.length ? (
                          <div className="flagline">
                            {flagRows.map((x) => (
                              <span className="flagchip" key={x.label}>{x.label}: {x.items.join(', ')}</span>
                            ))}
                          </div>
                        ) : null}
                        {c.draft ? (
                          <>
                            <div className="draftbox">{c.draft}</div>
                            <details className="raw editbox">
                              <summary>Chỉnh sửa bản nháp</summary>
                              <form action={editDraft} className="editform">
                                <input type="hidden" name="content_id" value={c.id} />
                                <textarea name="draft" defaultValue={c.draft} rows={10} aria-label="Bản nháp" />
                                <button className="btn ok" type="submit">Lưu chỉnh sửa</button>
                              </form>
                            </details>
                          </>
                        ) : (
                          <p className="muted">Chưa có bản nháp.</p>
                        )}
                        {img || vid ? (
                          <div className="modal-media">
                            {img ? <img src={img.url} alt={img.title || 'Ảnh bài viết'} /> : null}
                            {vid ? <video src={vid.url} controls preload="metadata" /> : null}
                          </div>
                        ) : null}
                      </ViewModal>
                      {(publishedByContent.get(c.id) || []).map((p, i) => (
                        <a
                          key={i}
                          className="src"
                          href={p.url}
                          target="_blank"
                          rel="noreferrer"
                          style={{ marginLeft: 8, whiteSpace: 'nowrap' }}
                        >
                          ↗ Xem bài{p.channel === 'facebook' ? ' (FB)' : p.channel ? ` (${p.channel})` : ''}
                        </a>
                      ))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </main>
  );
}
