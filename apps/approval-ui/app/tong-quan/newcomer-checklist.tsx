'use client';

// 23/10 (đợt 1 sắp xếp lại, design-spec-app-noi-bo.md màn 1a): người mới thấy 3 việc mỗi ngày ngay trên trang Hôm nay.
// Bấm "Đã hiểu" là ẩn trên máy đó (localStorage); bộ nhớ trình duyệt bị chặn thì vẫn hiện, không lỗi.

import { useEffect, useState } from 'react';
import Link from 'next/link';

const KEY = 'sdvico-newcomer-hidden';

export default function NewcomerChecklist({ pending }: { pending: number }) {
  // Mặc định ẩn để người quen không thấy khung nháy lên rồi biến mất; đọc xong localStorage mới quyết.
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    try { setHidden(window.localStorage.getItem(KEY) === '1'); } catch { setHidden(false); }
  }, []);
  if (hidden) return null;
  const hide = () => {
    setHidden(true);
    try { window.localStorage.setItem(KEY, '1'); } catch { /* bỏ qua */ }
  };
  return (
    <section className="blk tone-accent newcomer" aria-label="Việc mỗi ngày">
      <h2><span aria-hidden="true">👋</span> 3 việc mỗi ngày</h2>
      <ol className="newcomer-steps">
        <li><Link href="/noi-dung">Duyệt bài</Link> máy vừa viết{pending ? ` (${pending} bài đang chờ)` : ''}</li>
        <li><Link href="/ke-hoach">Xem kế hoạch</Link> tuần này</li>
        <li><Link href="/do-luong/tuan">Xem số liệu</Link> bài nào đang ăn</li>
      </ol>
      <button type="button" className="btn ghost sm" onClick={hide}>Đã hiểu, ẩn đi</button>
    </section>
  );
}
