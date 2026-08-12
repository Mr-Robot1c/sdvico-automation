import { getServerClient } from '../../lib/supabase-server';
import { uploadAsset, deleteAsset, renameAsset } from '../actions';
import AssetViewer from './asset-viewer';

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
  created_at: string;
};

export default async function Page() {
  const client = getServerClient();
  const { data, error } = await client
    .from('brand_assets')
    .select('id, kind, title, storage_path, license, license_note, source, created_at')
    .order('created_at', { ascending: false })
    .limit(200);

  const rows = (data || []) as Asset[];
  const urlOf = (p: string) => client.storage.from('brand-assets').getPublicUrl(p).data.publicUrl;

  return (
    <main>
      <header className="head-row">
        <div>
          <h1>Kho tư liệu (brand_assets)</h1>
          <p className="sub">Ảnh và clip THẬT của công ty. Chỉ dùng tư liệu công ty sở hữu hoặc có giấy phép.</p>
        </div>
      </header>

      {error ? <p className="err" role="alert">Lỗi tải dữ liệu: {error.message}</p> : null}

      <p className="err" role="status">
        Video dùng để dựng phải là cảnh quay thật. FFmpeg lấy tư liệu từ đây để ghép. File lớn hơn 4,5MB thì tải thẳng qua Supabase Storage, bucket brand-assets.
      </p>

      <form className="factform" action={uploadAsset} encType="multipart/form-data">
        <input type="file" name="file" aria-label="Chọn file" required />
        <input name="title" placeholder="Tên tư liệu" aria-label="Tên" />
        <select name="kind" aria-label="Loại" defaultValue="image">
          <option value="image">Ảnh</option>
          <option value="video">Clip</option>
          <option value="audio">Âm thanh</option>
          <option value="logo">Logo</option>
        </select>
        <select name="license" aria-label="Giấy phép" defaultValue="owned">
          <option value="owned">Công ty sở hữu</option>
          <option value="licensed">Có giấy phép</option>
        </select>
        <input name="source" placeholder="Nguồn (ai quay, ở đâu)" aria-label="Nguồn" />
        <button className="btn ok" type="submit">Tải lên</button>
      </form>

      {!error && rows.length === 0 ? (
        <div className="empty">
          <div className="empty-icon" aria-hidden="true">🎞️</div>
          <p>Kho tư liệu đang trống.</p>
          <p className="sub">Tải ảnh và clip thật của công ty lên để FFmpeg dựng video.</p>
        </div>
      ) : null}

      <ul className="assetgrid">
        {rows.map((a) => {
          const url = urlOf(a.storage_path);
          return (
            <li key={a.id} className="assetcard">
              <div className="asset-preview">
                <AssetViewer url={url} kind={a.kind} title={a.title} />
              </div>
              <div className="asset-meta">
                <span className="badge badge-format">{KIND_LABEL[a.kind] || a.kind}</span>
                <form action={renameAsset} className="rename-form">
                  <input type="hidden" name="id" value={a.id} />
                  <input name="title" defaultValue={a.title} aria-label="Tên tư liệu" title="Đặt tên mô tả rõ để AI sinh text bám theo" />
                  <button className="btn ghost sm" type="submit">Đổi tên</button>
                </form>
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
        })}
      </ul>
    </main>
  );
}
