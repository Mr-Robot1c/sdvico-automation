'use client';

import { useEffect, useState } from 'react';
import { savePosterConfig } from './actions';
import { SubmitButton } from './submit-button';

type Props = {
  companyName: string;
  tagline: string;
  navy: string;
  red: string;
  accent: string;
  hotline: string;
  website: string;
  logoUrl: string;
};

function buildSrc(v: Props): string {
  const p = new URLSearchParams({
    company_name: v.companyName,
    tagline: v.tagline,
    navy: v.navy,
    red: v.red,
    accent: v.accent,
    hotline: v.hotline,
    website: v.website,
    logo: v.logoUrl,
  });
  return `/api/poster-preview?${p.toString()}`;
}

export default function PosterSettings(init: Props) {
  const [companyName, setCompanyName] = useState(init.companyName);
  const [tagline, setTagline] = useState(init.tagline);
  const [navy, setNavy] = useState(init.navy);
  const [red, setRed] = useState(init.red);
  const [accent, setAccent] = useState(init.accent);
  const current = { ...init, companyName, tagline, navy, red, accent };

  // Xem trước cập nhật sau 500ms kể từ lần chỉnh cuối (tránh gọi server liên tục).
  const [src, setSrc] = useState(() => buildSrc(current));
  useEffect(() => {
    const id = setTimeout(() => setSrc(buildSrc({ ...init, companyName, tagline, navy, red, accent })), 500);
    return () => clearTimeout(id);
  }, [companyName, tagline, navy, red, accent, init]);

  const labelStyle = { fontSize: '0.82em', color: 'var(--muted)', display: 'block', marginBottom: 3 } as const;
  const colorBox = { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 } as const;

  return (
    <div className="settings-box" style={{ marginTop: 12 }}>
      <b>Poster tuyển dụng</b>
      <p style={{ fontSize: '0.82em', color: 'var(--muted)', margin: '4px 0 12px' }}>
        Chỉnh tên hiển thị, khẩu hiệu và màu. Ảnh xem trước tự cập nhật. Bấm Lưu để áp dụng cho poster của bài mới.
      </p>

      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <form action={savePosterConfig} style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <label style={labelStyle}>Tên hiển thị trên poster</label>
            <input className="note" name="company_name" value={companyName} onChange={(e) => setCompanyName(e.target.value)} style={{ width: '100%', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={labelStyle}>Khẩu hiệu / tagline</label>
            <input className="note" name="tagline" value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder="Công nghệ số cho ngành biển và thủy sản" style={{ width: '100%', boxSizing: 'border-box' }} />
          </div>
          <div className="row" style={{ gap: 16 }}>
            <label style={colorBox}>
              <span style={labelStyle}>Nền</span>
              <input type="color" name="poster_navy" value={navy} onChange={(e) => setNavy(e.target.value)} />
            </label>
            <label style={colorBox}>
              <span style={labelStyle}>Nhấn (đỏ)</span>
              <input type="color" name="poster_red" value={red} onChange={(e) => setRed(e.target.value)} />
            </label>
            <label style={colorBox}>
              <span style={labelStyle}>Tiêu đề cột</span>
              <input type="color" name="poster_accent" value={accent} onChange={(e) => setAccent(e.target.value)} />
            </label>
          </div>
          <div className="row">
            <SubmitButton label="Lưu poster" pendingLabel="Đang lưu..." />
          </div>
        </form>

        <div style={{ flex: '1 1 280px' }}>
          <span style={labelStyle}>Xem trước:</span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="Xem trước poster" style={{ width: '100%', maxWidth: 340, borderRadius: 10, border: '1px solid var(--border)', background: '#eef' }} />
        </div>
      </div>
    </div>
  );
}
