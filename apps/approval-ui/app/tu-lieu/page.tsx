import { getServerClient } from '../../lib/supabase-server';
import { uploadAsset, deleteAsset } from '../actions';

export const dynamic = 'force-dynamic';
// Tải file cho phép chạy tới 60 giây.
export const maxDuration = 60;

const KIND_LABEL: Record<string, string> = {
  image: 'Ảnh', video: 'Clip', audio: 'Âm thanh', logo: 'Logo'
};

type Asset = { id: string; kind: string; path: string; license: string | null; source: string | null; note: string | null; created_at: string };

export default async function Page() {
  const client = getServerClient();
  const { data, error } = await client
    .from('brand_assets')
    .select('id, kind, path, license, source, note, created_at')
    .order('created_at', { ascending: false })
    .limit(200);

  const rows = (data || []) as Asset[];
  const urlOf = (path: string) => client.storage.from('brand-assets').getPublicUrl(path).data.publicUrl;

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
        <select name="kind" aria-label="Loại" defaultValue="image">
          <option value="image">Ảnh</option>
          <option value="video">Clip</option>
          <option value="audio">Âm thanh</option>
          <option value="logo">Logo</option>
        </select>
        <input name="source" placeholder="Nguồn (ai quay, ở đâu)" aria-label="Nguồn" />
        <input name="license" placeholder="Giấy phép (công ty sở hữu...)" aria-label="Giấy phép" />
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
          const url = urlOf(a.path);
          return (
            <li key={a.id} className="assetcard">
              <div className="asset-preview">
                {a.kind === 'image' || a.kind === 'logo' ? (
                  <img src={url} alt={a.source || 'tư liệu'} loading="lazy" />
                ) : a.kind === 'video' ? (
                  <video src={url} controls preload="metadata" />
                ) : (
                  <a href={url} target="_blank" rel="noreferrer">Mở file</a>
                )}
              </div>
              <div className="asset-meta">
                <span className="badge badge-format">{KIND_LABEL[a.kind] || a.kind}</span>
                {a.source ? <div className="metaline">Nguồn: {a.source}</div> : null}
                {a.license ? <div className="metaline">Giấy phép: {a.license}</div> : null}
                <form action={deleteAsset}>
                  <input type="hidden" name="id" value={a.id} />
                  <input type="hidden" name="path" value={a.path} />
                  <button className="btn no" type="submit" aria-label="Xóa tư liệu">Xóa</button>
                </form>
              </div>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
