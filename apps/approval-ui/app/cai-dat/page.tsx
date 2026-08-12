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

  return (
    <main>
      <header className="head-row">
        <div>
          <h1>Cài đặt thương hiệu</h1>
          <p className="sub">Thông tin công ty tự động gắn vào bài đăng Facebook. Logo dùng làm ảnh mặc định khi không có ảnh khác.</p>
        </div>
      </header>

      <form action={saveBrandConfig} className="settings-box">
        <b>Thông tin công ty</b>

        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: '0.85em', color: 'var(--muted)' }}>URL logo công ty</span>
            <input
              className="note"
              name="logo_url"
              type="url"
              defaultValue={brand.logo_url || ''}
              placeholder="https://sdvico.vn/logo.png"
              style={{ width: '100%', boxSizing: 'border-box' }}
            />
            <span style={{ fontSize: '0.78em', color: 'var(--muted)' }}>
              Dùng làm ảnh đính kèm bài Facebook khi vị trí không có ảnh Unsplash hay ảnh tải lên.
              Có thể dùng link ảnh từ Google Drive, Imgur, hoặc bất kỳ URL ảnh công khai nào.
            </span>
          </label>

          {brand.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={brand.logo_url}
              alt="Logo hiện tại"
              style={{ maxHeight: 80, maxWidth: 200, objectFit: 'contain', border: '1px solid var(--border)', borderRadius: 6, padding: 8 }}
            />
          ) : null}

          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: '0.85em', color: 'var(--muted)' }}>Hotline</span>
            <input
              className="note"
              name="hotline"
              defaultValue={brand.hotline || ''}
              placeholder="1900 23 23 49"
              style={{ width: '100%', boxSizing: 'border-box' }}
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: '0.85em', color: 'var(--muted)' }}>Email tuyển dụng</span>
            <input
              className="note"
              name="email"
              type="email"
              defaultValue={brand.email || ''}
              placeholder="tuyendung@sdvico.vn"
              style={{ width: '100%', boxSizing: 'border-box' }}
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: '0.85em', color: 'var(--muted)' }}>Website</span>
            <input
              className="note"
              name="website"
              defaultValue={brand.website || ''}
              placeholder="sdvico.vn"
              style={{ width: '100%', boxSizing: 'border-box' }}
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: '0.85em', color: 'var(--muted)' }}>Mô tả ngắn công ty (không bắt buộc)</span>
            <textarea
              name="company_desc"
              rows={2}
              defaultValue={brand.company_desc || ''}
              placeholder="Công ty SDVICO cung cấp thiết bị và giải pháp công nghệ cho ngành biển và thủy sản, trụ sở Vũng Tàu."
              style={{ width: '100%', boxSizing: 'border-box' }}
              aria-label="Mô tả công ty"
            />
          </label>
        </div>

        <div className="row" style={{ marginTop: 12 }}>
          <SubmitButton label="Lưu cài đặt" pendingLabel="Đang lưu..." />
        </div>
      </form>

      {(brand.hotline || brand.email || brand.website) ? (
        <div className="settings-box" style={{ marginTop: 12 }}>
          <b>Xem trước footer bài đăng Facebook</b>
          <p style={{ marginTop: 8, fontSize: '0.9em', color: 'var(--muted)', fontStyle: 'italic' }}>
            Đoạn sau sẽ tự động gắn vào cuối mỗi bài tuyển dụng mới soạn:
          </p>
          <pre style={{ marginTop: 6, fontSize: '0.88em' }}>
            {[
              brand.hotline ? `Hotline: ${brand.hotline}` : null,
              brand.email ? `Email: ${brand.email}` : null,
              brand.website || null,
            ].filter(Boolean).join('  |  ')}
          </pre>
        </div>
      ) : (
        <div className="settings-box" style={{ marginTop: 12 }}>
          <p className="muted" style={{ margin: 0 }}>
            Chưa có thông tin liên hệ. Điền hotline, email hoặc website ở trên để hệ thống tự gắn vào cuối bài đăng Facebook.
          </p>
        </div>
      )}
    </main>
  );
}
