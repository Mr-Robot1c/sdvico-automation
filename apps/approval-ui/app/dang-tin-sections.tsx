'use client';

import { useState, type ReactNode } from 'react';

// Bộ chọn mục cho trang Vị trí & Đăng tin, để khỏi kéo dài. Chọn mục nào hiện mục đó.
export default function DangTinSections({
  viTri,
  nenTang,
  tinDang,
  counts
}: {
  viTri: ReactNode;
  nenTang: ReactNode;
  tinDang: ReactNode;
  counts: { vitri: number; nentang: number; tindang: number };
}) {
  const [sec, setSec] = useState<'vitri' | 'nentang' | 'tindang'>('vitri');
  return (
    <>
      <div className="sortbar" role="tablist" aria-label="Chọn mục">
        <button className={`chip ${sec === 'vitri' ? 'on' : ''}`} onClick={() => setSec('vitri')}>
          Vị trí tuyển dụng <span className="n">{counts.vitri}</span>
        </button>
        <button className={`chip ${sec === 'nentang' ? 'on' : ''}`} onClick={() => setSec('nentang')}>
          Nền tảng <span className="n">{counts.nentang}</span>
        </button>
        <button className={`chip ${sec === 'tindang' ? 'on' : ''}`} onClick={() => setSec('tindang')}>
          Tin đăng <span className="n">{counts.tindang}</span>
        </button>
      </div>

      {sec === 'vitri' ? viTri : null}
      {sec === 'nentang' ? nenTang : null}
      {sec === 'tindang' ? tinDang : null}
    </>
  );
}
