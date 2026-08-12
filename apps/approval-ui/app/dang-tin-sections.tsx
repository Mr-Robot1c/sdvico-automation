'use client';

import { useState, useEffect, type ReactNode } from 'react';

type Section = 'vitri' | 'tindang';

// Bộ chọn mục cho trang Vị trí & Đăng tin. Lưu tab vào sessionStorage
// để AutoRefresh (router.refresh()) không reset tab về mặc định.
export default function DangTinSections({
  viTri,
  tinDang,
  counts
}: {
  viTri: ReactNode;
  tinDang: ReactNode;
  counts: { vitri: number; tindang: number };
}) {
  const [sec, setSec] = useState<Section>('vitri');

  useEffect(() => {
    const saved = sessionStorage.getItem('dang-tin-tab') as Section | null;
    if (saved === 'vitri' || saved === 'tindang') setSec(saved);
  }, []);

  const changeTab = (tab: Section) => {
    setSec(tab);
    sessionStorage.setItem('dang-tin-tab', tab);
  };

  return (
    <>
      <div className="sortbar" role="tablist" aria-label="Chọn mục">
        <button className={`chip ${sec === 'vitri' ? 'on' : ''}`} onClick={() => changeTab('vitri')}>
          Vị trí tuyển dụng <span className="n">{counts.vitri}</span>
        </button>
        <button className={`chip ${sec === 'tindang' ? 'on' : ''}`} onClick={() => changeTab('tindang')}>
          Tin đăng <span className="n">{counts.tindang}</span>
        </button>
      </div>

      {sec === 'vitri' ? viTri : null}
      {sec === 'tindang' ? tinDang : null}
    </>
  );
}
