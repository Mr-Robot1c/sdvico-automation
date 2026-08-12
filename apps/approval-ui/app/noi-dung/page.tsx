import { getServerClient } from '../../lib/supabase-server';
import AutoRefresh from '../auto-refresh';
import GenerateButton from '../generate-button';
import ViewModal from '../view-modal';
import { editDraft } from '../actions';
import { formatLabel, intentLabel, riskMeta, COMPLIANCE_LABELS } from '../labels';

export const dynamic = 'force-dynamic';

const STATUS: Record<string, { label: string; tone: string }> = {
  draft: { label: 'Nháp', tone: 'demo' },
  review: { label: 'Chờ duyệt', tone: 'no' },
  approved: { label: 'Đã duyệt', tone: 'ok' },
  published: { label: 'Đã đăng', tone: 'web' }
};

// Kênh đăng suy từ loại nội dung (kind): article → Website, social → Facebook, video → YouTube.
function channelOf(kind: string): string {
  switch (kind) {
    case 'article': return 'Website';
    case 'social': return 'Facebook';
    case 'video': return 'YouTube';
    default: return '—';
  }
}

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
type Brief = { keyword?: string; intent?: string; risk?: string; compliance?: Flags; assets?: Assets } | null;
type Content = { id: string; kind: string; title: string; brief: Brief; draft: string | null; status: string; created_at: string };

export default async function Page({ searchParams }: { searchParams: { loai?: string } }) {
  const tab = searchParams?.loai === 'video' ? 'video' : 'baiviet';
  const kinds = tab === 'video' ? ['video'] : ['article', 'social'];

  const client = getServerClient();
  const { data, error } = await client
    .from('mkt_content')
    .select('id, kind, title, brief, draft, status, created_at')
    .in('kind', kinds)
    .order('created_at', { ascending: false })
    .limit(200);

  const items = (data || []) as Content[];

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

  const [{ count: cBai }, { count: cVid }] = await Promise.all([
    client.from('mkt_content').select('*', { count: 'exact', head: true }).in('kind', ['article', 'social']),
    client.from('mkt_content').select('*', { count: 'exact', head: true }).eq('kind', 'video')
  ]);

  return (
    <main>
      <header className="head-row">
        <div>
          <h1>Quản lý bài viết</h1>
          <p className="sub">Danh sách bài đã sinh, đã duyệt, đã đăng. Bấm mắt để xem nội dung.</p>
        </div>
        <div className="head-actions">
          <GenerateButton />
          <AutoRefresh seconds={30} />
        </div>
      </header>

      <nav className="filters" aria-label="Loại nội dung">
        <a className={`chip ${tab === 'baiviet' ? 'on' : ''}`} href="/noi-dung">
          <span aria-hidden="true">📝</span> Bài viết <span className="n">{cBai ?? 0}</span>
        </a>
        <a className={`chip ${tab === 'video' ? 'on' : ''}`} href="/noi-dung?loai=video">
          <span aria-hidden="true">🎬</span> Video <span className="n">{cVid ?? 0}</span>
        </a>
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
          <p>Chưa có {tab === 'video' ? 'kịch bản video' : 'bài viết'} nào.</p>
          <p className="sub">Bấm Sinh nội dung ở trên để máy soạn thêm.</p>
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
                const st = STATUS[c.status] || { label: c.status, tone: 'default' };
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
                    <td>{formatLabel(c.kind)}</td>
                    <td>{channelOf(c.kind)}</td>
                    <td>{formatDate(c.created_at)}</td>
                    <td>
                      <span className={`badge tone-${st.tone}`}>{st.label}</span>
                    </td>
                    <td className="col-actions">
                      <ViewModal title={c.title} label="Xem bài viết">
                        {img || vid ? (
                          <div className="modal-media">
                            {img ? <img src={img.url} alt={img.title || 'Ảnh bài viết'} /> : null}
                            {vid ? <video src={vid.url} controls preload="metadata" /> : null}
                          </div>
                        ) : null}
                        <div className="badges">
                          <span className="badge badge-format">{formatLabel(c.kind)}</span>
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
                      </ViewModal>
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
