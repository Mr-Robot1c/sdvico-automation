import { getServerClient } from '../../lib/supabase-server';
import { saveBrandConfig } from '../actions';
import { SubmitButton } from '../submit-button';

export const dynamic = 'force-dynamic';

type BrandConfig = {
  logo_url?: string;
  hotline?: string;
  email?: string;
  website?: string;
  company_desc?: string;
};

export default async function Page() {
  const client = getServerClient();
  const { data } = await client.from('app_config').select('value').eq('key', 'brand_config').maybeSingle();
  const brand: BrandConfig = (data?.value || {}) as BrandConfig;

  const footerParts = [
    brand.hotline ? `Hotline: ${brand.hotline}` : null,
    brand.email ? `Email: ${brand.email}` : null,
    brand.website || null,
  ].filter(Boolean);

  return (
    <main>
      <header className="head-row">
        <div>
          <h1>Cài đặt thương hiệu</h1>
        </div>
      </header>

      <form action={saveBrandConfig} className="settings-box">
        <b>Logo công ty</b>

        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {brand.logo_url ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={brand.logo_url}
                alt="Logo hiện tại"
                style={{ maxHeight: 64, maxWidth: 160, objectFit: 'contain', border: '1px solid var(--border)', borderRadius: 6, padding: 6, background: '#fff' }}
              />
              <span style={{ fontSize: '0.82em', color: 'var(--muted)' }}>Logo đang dùng</span>
            </div>
          ) : (
            <p className="muted" style={{ margin: 0, fontSize: '0.85em' }}>Chưa có logo. Chọn file từ máy hoặc dán URL bên dưới.</p>
          )}

          <label style={{ fontSize: '0.82em', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <span style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}>Chọn file logo từ máy:</span>
            <input type="file" name="logo_file" accept="image/*" style={{ fontSize: '0.85em' }} />
          </label>
          <span style={{ fontSize: '0.78em', color: 'var(--muted)' }}>
            Hoặc dán URL logo công khai (ưu tiên chọn file từ máy, tránh dùng link Google Drive vì hay bị chặn):
          </span>
          <input
            className="note"
            name="logo_url"
            type="url"
            defaultValue={brand.logo_url || ''}
            placeholder="https://... (URL ảnh công khai)"
            style={{ width: '100%', boxSizing: 'border-box' }}
          />
        </div>

        <b style={{ display: 'block', marginTop: 16 }}>Thông tin liên hệ</b>
        <p style={{ fontSize: '0.82em', color: 'var(--muted)', margin: '4px 0 10px' }}>
          Tự động gắn vào cuối mỗi bài đăng tuyển dụng Facebook mới soạn.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="row">
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '0.82em', color: 'var(--muted)', display: 'block', marginBottom: 3 }}>Hotline</label>
              <input className="note" name="hotline" defaultValue={brand.hotline || ''} placeholder="1900 23 23 49" style={{ width: '100%', boxSizing: 'border-box' }} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '0.82em', color: 'var(--muted)', display: 'block', marginBottom: 3 }}>Website</label>
              <input className="note" name="website" defaultValue={brand.website || ''} placeholder="sdvico.vn" style={{ width: '100%', boxSizing: 'border-box' }} />
            </div>
          </div>
          <div>
            <label style={{ fontSize: '0.82em', color: 'var(--muted)', display: 'block', marginBottom: 3 }}>Email tuyển dụng</label>
            <input className="note" name="email" type="email" defaultValue={brand.email || ''} placeholder="tuyendung@sdvico.vn" style={{ width: '100%', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ fontSize: '0.82em', color: 'var(--muted)', display: 'block', marginBottom: 3 }}>Mô tả ngắn công ty (không bắt buộc)</label>
            <textarea
              name="company_desc"
              rows={2}
              defaultValue={brand.company_desc || ''}
              placeholder="Công ty SDVICO cung cấp thiết bị và giải pháp công nghệ cho ngành biển và thủy sản, trụ sở Vũng Tàu."
              style={{ width: '100%', boxSizing: 'border-box' }}
              aria-label="Mô tả công ty"
            />
          </div>
        </div>

        <div className="row" style={{ marginTop: 12 }}>
          <SubmitButton label="Lưu cài đặt" pendingLabel="Đang lưu..." />
        </div>
      </form>

      {footerParts.length > 0 ? (
        <div className="settings-box" style={{ marginTop: 12 }}>
          <b>Xem trước footer bài Facebook</b>
          <p style={{ marginTop: 6, fontSize: '0.85em', color: 'var(--muted)' }}>Đoạn này tự gắn vào cuối bài tuyển dụng mới:</p>
          <pre style={{ marginTop: 4, fontSize: '0.88em', background: 'var(--surface)', padding: '8px 12px', borderRadius: 6 }}>
            {footerParts.join('  |  ')}
          </pre>
        </div>
      ) : (
        <div className="settings-box" style={{ marginTop: 12 }}>
          <p className="muted" style={{ margin: 0 }}>
            Chưa có thông tin liên hệ. Điền hotline, email hoặc website ở trên rồi Lưu để hệ thống gắn vào cuối bài đăng.
          </p>
        </div>
      )}
    </main>
  );
}
