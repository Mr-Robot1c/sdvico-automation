import { getServerClient } from '../../lib/supabase-server';
import { deleteAsset, renameAsset, setAssetProductGroup } from '../actions';
import AssetViewer from './asset-viewer';
import LogoButton from './logo-button';
import LibUploader from './lib-uploader';
import ProductGroupSelect from './product-group-select';
// @ts-ignore — module JS thuần
import { PRODUCTS, CONTENT_GROUP } from '../../lib/gen/products.mjs';

// KHO TƯ LIỆU kiểu trình quản lý file (user 21/8 gửi mẫu): cây folder bên TRÁI (bấm chọn),
// lưới thumbnail bên PHẢI với tên + loại + ngày. Thao tác đổi tên / chuyển folder / xóa nằm
// gọn trong nút "chi tiết" của từng ô, không choán chỗ như bản cũ.
// 8 folder sản phẩm + folder Content; vòng xoay hằng ngày vẫn đọc theo product_group như cũ.
const PRODUCT_GROUPS: string[] = [
  ...(PRODUCTS as { group: string }[]).map((p) => p.group),
  CONTENT_GROUP as string,
];

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const KIND_LABEL: Record<string, string> = {
  image: 'Ảnh', video: 'Clip', clip: 'Clip', audio: 'Âm thanh', logo: 'Logo', doc: 'Tài liệu'
};

type Asset = {
  id: string;
  kind: string;
  title: string;
  storage_path: string;
  license: string | null;
  license_note: string | null;
  source: string | null;
  product_group: string | null;
  created_at: string;
};

const UNASSIGNED = '__chua_gan__';

// Nhãn hiển thị: bỏ tiền tố số thứ tự "N. " cho gọn sidebar (dữ liệu vẫn giữ tên đầy đủ).
function folderLabel(group: string): string {
  if (group === UNASSIGNED) return 'Chưa gán folder';
  return group.replace(/^\s*\d+\.\s*/, '');
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  // Tự ghép dd/mm — toLocaleDateString('vi-VN') trên Node trả "21-08" (gạch) sai chuẩn Việt.
  const p = new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' }).formatToParts(d);
  const get = (t: string) => p.find((x) => x.type === t)?.value || '';
  return `${get('day')}/${get('month')}`;
}

export default async function Page({ searchParams }: { searchParams: { folder?: string } }) {
  const client = getServerClient();
  const { data, error } = await client
    .from('brand_assets')
    .select('id, kind, title, storage_path, license, license_note, source, product_group, created_at')
    .order('created_at', { ascending: false })
    .limit(300);

  const rows = (data || []) as Asset[];
  const urlOf = (p: string) => client.storage.from('brand-assets').getPublicUrl(p).data.publicUrl;
  const isVideo = (k: string) => k === 'video' || k === 'clip';

  // Gom theo folder. Giữ đúng thứ tự 8 folder + Content, cuối là nhóm chưa gán (nếu có).
  const byGroup = new Map<string, Asset[]>();
  for (const g of PRODUCT_GROUPS) byGroup.set(g, []);
  byGroup.set(UNASSIGNED, []);
  for (const a of rows) {
    const key = a.product_group && byGroup.has(a.product_group) ? a.product_group : (a.product_group || UNASSIGNED);
    if (!byGroup.has(key)) byGroup.set(key, []);
    byGroup.get(key)!.push(a);
  }
  const folderKeys: string[] = [
    ...PRODUCT_GROUPS,
    ...[...byGroup.keys()].filter((k) => !PRODUCT_GROUPS.includes(k) && k !== UNASSIGNED),
    ...(byGroup.get(UNASSIGNED)!.length ? [UNASSIGNED] : []),
  ];

  // Folder đang chọn từ URL (?folder=...). Mặc định: Tất cả.
  const rawSel = searchParams?.folder || '';
  const selected = rawSel && (folderKeys.includes(rawSel) || rawSel === UNASSIGNED) ? rawSel : '';
  const shown = selected ? (byGroup.get(selected) || []) : rows;
  const shownLabel = selected ? folderLabel(selected) : 'Tất cả tư liệu';

  return (
    <main>
      <header className="head-row">
        <div>
          <h1>Kho tư liệu</h1>
        </div>
      </header>

      {error ? <p className="err" role="alert">Lỗi tải dữ liệu: {error.message}</p> : null}

      <div className="lib-layout">
        {/* Cây folder bên trái */}
        <nav className="lib-side" aria-label="Folder tư liệu">
          <div className="lib-side-title">Thư viện</div>
          <a className={`lib-folder ${!selected ? 'on' : ''}`} href="/tu-lieu">
            <span aria-hidden="true">🗂️</span> Tất cả <span className="n">{rows.length}</span>
          </a>
          {folderKeys.map((g) => {
            const list = byGroup.get(g) || [];
            return (
              <a
                key={g}
                className={`lib-folder ${selected === g ? 'on' : ''}`}
                href={`/tu-lieu?folder=${encodeURIComponent(g)}`}
                title={g === UNASSIGNED ? 'Tư liệu chưa gán vào folder nào' : g}
              >
                <span aria-hidden="true">📁</span> {folderLabel(g)} <span className="n">{list.length || ''}</span>
              </a>
            );
          })}
        </nav>

        {/* Lưới thumbnail bên phải */}
        <div className="lib-main">
          <LibUploader />
          <p className="sub" style={{ margin: '12px 0 0' }}>
            <b>{shownLabel}</b>: {shown.filter((a) => a.kind === 'image').length} ảnh, {shown.filter((a) => isVideo(a.kind)).length} video
            {selected && selected !== UNASSIGNED && shown.length > 0 && !shown.some((a) => isVideo(a.kind)) ? ' (chưa đăng TikTok được vì thiếu video)' : ''}
          </p>

          {shown.length === 0 ? (
            <div className="lib-empty">
              <div style={{ fontSize: 30 }} aria-hidden="true">📁</div>
              <p style={{ margin: '6px 0 0' }}>Folder này chưa có tư liệu.</p>
              <p className="sub" style={{ margin: '2px 0 0' }}>Tải ảnh hoặc video lên rồi gán vào folder này.</p>
            </div>
          ) : (
            <ul className="lib-grid">
              {shown.map((a) => (
                <li key={a.id} className="lib-card">
                  <div className="lib-thumb">
                    <AssetViewer url={urlOf(a.storage_path)} kind={a.kind} title={a.title} />
                  </div>
                  <div className="lib-meta">
                    <span className="lib-name" title={a.title}>{a.title}</span>
                    <span className="lib-sub">
                      {KIND_LABEL[a.kind] || a.kind} · {fmtDate(a.created_at)}
                      {!selected && a.product_group ? ` · ${folderLabel(a.product_group)}` : ''}
                    </span>
                    <details className="lib-more">
                      <summary>Sửa, chuyển folder, xóa</summary>
                      <form action={renameAsset} className="rename-form">
                        <input type="hidden" name="id" value={a.id} />
                        <input name="title" defaultValue={a.title} aria-label="Tên tư liệu" title="Đặt tên mô tả rõ để AI sinh text bám theo" />
                        <button className="btn ghost sm" type="submit">Đổi tên</button>
                      </form>
                      <ProductGroupSelect id={a.id} value={a.product_group || ''} options={PRODUCT_GROUPS} action={setAssetProductGroup} />
                      {a.kind === 'image' ? <LogoButton id={a.id} /> : null}
                      {a.source ? <div className="metaline">Nguồn: {a.source}</div> : null}
                      <div className="metaline">{a.license === 'licensed' ? 'Có giấy phép' : 'Công ty sở hữu'}</div>
                      <form action={deleteAsset}>
                        <input type="hidden" name="id" value={a.id} />
                        <input type="hidden" name="storage_path" value={a.storage_path} />
                        <button className="btn no sm" type="submit" aria-label="Xóa tư liệu">Xóa</button>
                      </form>
                    </details>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </main>
  );
}
