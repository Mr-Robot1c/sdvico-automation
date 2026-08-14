import { getServerClient } from '../../lib/supabase-server';
import { deleteAsset, renameAsset, setAssetProductGroup } from '../actions';
import AssetViewer from './asset-viewer';
import LogoButton from './logo-button';
import LibUploader from './lib-uploader';
import ProductGroupSelect from './product-group-select';
// @ts-ignore — module JS thuần
import { PRODUCTS } from '../../lib/gen/products.mjs';

const PRODUCT_GROUPS: string[] = (PRODUCTS as { group: string }[]).map((p) => p.group);

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

export default async function Page() {
  const client = getServerClient();
  const { data, error } = await client
    .from('brand_assets')
    .select('id, kind, title, storage_path, license, license_note, source, product_group, created_at')
    .order('created_at', { ascending: false })
    .limit(300);

  const rows = (data || []) as Asset[];
  const urlOf = (p: string) => client.storage.from('brand-assets').getPublicUrl(p).data.publicUrl;
  const kindLabelOf = (kind: string) => KIND_LABEL[kind] || kind;
  const isVideo = (k: string) => k === 'video' || k === 'clip';

  // Gom tư liệu theo folder sản phẩm. Giữ đúng thứ tự 8 folder, cuối là nhóm chưa gán.
  const byGroup = new Map<string, Asset[]>();
  for (const g of PRODUCT_GROUPS) byGroup.set(g, []);
  byGroup.set(UNASSIGNED, []);
  for (const a of rows) {
    const key = a.product_group && byGroup.has(a.product_group) ? a.product_group : (a.product_group || UNASSIGNED);
    if (!byGroup.has(key)) byGroup.set(key, []);
    byGroup.get(key)!.push(a);
  }
  // Luôn hiện đủ 8 folder (kể cả trống để nhắc bổ sung), nhóm chưa gán chỉ hiện khi có.
  const ordered: [string, Asset[]][] = [
    ...PRODUCT_GROUPS.map((g) => [g, byGroup.get(g) || []] as [string, Asset[]]),
    ...(byGroup.get(UNASSIGNED)!.length ? [[UNASSIGNED, byGroup.get(UNASSIGNED)!] as [string, Asset[]]] : []),
  ];

  const renderCard = (a: Asset) => (
    <li key={a.id} className="assetcard">
      <div className="asset-preview">
        <AssetViewer url={urlOf(a.storage_path)} kind={a.kind} title={a.title} />
      </div>
      <div className="asset-meta">
        <span className="badge badge-format">{kindLabelOf(a.kind)}</span>
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
      </div>
    </li>
  );

  return (
    <main>
      <header className="head-row">
        <div>
          <h1>Kho tư liệu theo folder sản phẩm</h1>
          <p className="sub">Mỗi folder là một sản phẩm. Vòng xoay hằng ngày chọn 1 folder rồi đăng Facebook và TikTok. Folder cần ít nhất 1 ảnh; muốn đăng TikTok thì cần video.</p>
        </div>
      </header>

      {error ? <p className="err" role="alert">Lỗi tải dữ liệu: {error.message}</p> : null}

      <LibUploader />

      {ordered.map(([group, list]) => {
        const imgs = list.filter((a) => a.kind === 'image').length;
        const vids = list.filter((a) => isVideo(a.kind)).length;
        const label = group === UNASSIGNED ? 'Chưa gán folder' : group;
        return (
          <section key={group} className="folder-section">
            <div className="folder-head">
              <h2>{label}</h2>
              <span className="folder-count">
                {list.length === 0 ? 'trống' : `${imgs} ảnh · ${vids} video`}
                {group !== UNASSIGNED && vids === 0 && list.length > 0 ? ' · chưa đăng TikTok được' : ''}
              </span>
            </div>
            {list.length === 0 ? (
              <p className="sub folder-empty">Chưa có tư liệu. Tải ảnh/video lên rồi gán vào folder này.</p>
            ) : (
              <ul className="assetgrid">{list.map(renderCard)}</ul>
            )}
          </section>
        );
      })}
    </main>
  );
}
