import Link from 'next/link';
import { getServerClient } from '../../lib/supabase-server';
import { saveBrandConfig } from '../actions';
import { SubmitButton } from '../submit-button';
import PosterSettings from '../poster-settings';

export const dynamic = 'force-dynamic';

type BrandConfig = {
  logo_url?: string;
  hotline?: string;
  email?: string;
  website?: string;
  company_desc?: string;
  company_name?: string;
  tagline?: string;
  poster?: { navy?: string; red?: string; accent?: string };
};

// Sub-tab đơn giản: bấm chip là navigate, không cần client state.
function SubTabs({ current }: { current: 'brand' | 'poster' }) {
  const tabs: Array<{ key: 'brand' | 'poster'; label: string; href: string }> = [
    { key: 'brand', label: 'Thương hiệu', href: '/cai-dat' },
    { key: 'poster', label: 'Poster tuyển dụng', href: '/cai-dat?tab=poster' },
  ];
  return (
    <nav className="tabbar" aria-label="Chọn nhóm cài đặt">
      {tabs.map((t) => (
        <Link key={t.key} className={`tab${current === t.key ? ' on' : ''}`} href={t.href}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

// Form thương hiệu: logo + liên hệ + mô tả. Tách khỏi Page để không phải kéo dài.
function BrandTab({ brand }: { brand: BrandConfig }) {
  return (
    <form action={saveBrandConfig} className="settings-box">
      <b>Logo công ty</b>

      <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {brand.logo_url ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={brand.logo_url}
              alt="Logo hiện tại"
              style={{ maxHeight: 64, maxWidth: 160, objectFit: 'contain', border: '1px solid var(--line)', borderRadius: 6, padding: 6, background: '#fff' }}
            />
            <span style={{ fontSize: '0.82em', color: 'var(--ink-2)' }}>Logo đang dùng</span>
          </div>
        ) : (
          <p className="muted" style={{ margin: 0, fontSize: '0.85em' }}>
            Chưa có logo. Chọn file từ máy hoặc dán URL bên dưới.
          </p>
        )}

        <label style={{ fontSize: '0.82em', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <span style={{ color: 'var(--ink-2)', whiteSpace: 'nowrap' }}>Chọn file logo từ máy:</span>
          <input type="file" name="logo_file" accept="image/*" style={{ fontSize: '0.85em' }} />
        </label>
        <span style={{ fontSize: '0.78em', color: 'var(--ink-2)' }}>
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
      <p style={{ fontSize: '0.82em', color: 'var(--ink-2)', margin: '4px 0 10px' }}>
        Tự động gắn vào cuối mỗi bài đăng tuyển dụng Facebook mới soạn.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div className="row">
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: '0.82em', color: 'var(--ink-2)', display: 'block', marginBottom: 3 }}>Hotline</label>
            <input className="note" name="hotline" defaultValue={brand.hotline || ''} placeholder="1900 23 23 49" style={{ width: '100%', boxSizing: 'border-box' }} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: '0.82em', color: 'var(--ink-2)', display: 'block', marginBottom: 3 }}>Website</label>
            <input className="note" name="website" defaultValue={brand.website || ''} placeholder="sdvico.vn" style={{ width: '100%', boxSizing: 'border-box' }} />
          </div>
        </div>
        <div>
          <label style={{ fontSize: '0.82em', color: 'var(--ink-2)', display: 'block', marginBottom: 3 }}>Email tuyển dụng</label>
          <input className="note" name="email" type="email" defaultValue={brand.email || ''} placeholder="tuyendung@sdvico.vn" style={{ width: '100%', boxSizing: 'border-box' }} />
        </div>
        <div>
          <label style={{ fontSize: '0.82em', color: 'var(--ink-2)', display: 'block', marginBottom: 3 }}>Mô tả ngắn công ty (không bắt buộc)</label>
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
  );
}

export default async function Page({ searchParams }: { searchParams?: { tab?: string } }) {
  const currentTab = searchParams?.tab === 'poster' ? 'poster' : 'brand';
  const client = getServerClient();
  const { data } = await client.from('app_config').select('value').eq('key', 'brand_config').maybeSingle();
  const brand: BrandConfig = (data?.value || {}) as BrandConfig;

  return (
    <main>
      <header className="head-row">
        <div>
          <h1>Cài đặt</h1>
          <p className="sub">Logo, liên hệ và mẫu poster cho bài tuyển dụng tự sinh.</p>
        </div>
      </header>

      <SubTabs current={currentTab} />

      {currentTab === 'brand' ? (
        <BrandTab brand={brand} />
      ) : (
        <PosterSettings
          companyName={brand.company_name || 'SDVICO'}
          tagline={brand.tagline || ''}
          navy={brand.poster?.navy || '#06264d'}
          red={brand.poster?.red || '#e4322b'}
          accent={brand.poster?.accent || '#ffd24a'}
          hotline={brand.hotline || '1900 23 23 49'}
          website={brand.website || 'sdvico.vn'}
          logoUrl={brand.logo_url || ''}
        />
      )}
    </main>
  );
}
