'use client';

import { useEffect, useState } from 'react';

// Nút chuyển nền sáng và tối. Nhớ lựa chọn trong localStorage, áp bằng data-theme.
export default function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const saved = localStorage.getItem('theme') as 'light' | 'dark' | null;
    const current =
      saved ||
      (document.documentElement.getAttribute('data-theme') as 'light' | 'dark' | null) ||
      (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    setTheme(current);
    // 4/9: áp LẠI thuộc tính sau hydration. Khi một trang hydration lỗi (chữ server/client
    // lệch), React vẽ lại <html> từ JSX và xoá data-theme mà script trong <head> đã đặt ->
    // trang đang sáng bỗng tối (bug Thùng rác). Effect này chạy sau cùng nên khôi phục được.
    if (saved) document.documentElement.setAttribute('data-theme', saved);
  }, []);

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    setTheme(next);
  };

  return (
    <button className="theme-toggle" onClick={toggle} aria-label={theme === 'dark' ? 'Chuyển nền sáng' : 'Chuyển nền tối'} title={theme === 'dark' ? 'Nền sáng' : 'Nền tối'}>
      <span aria-hidden="true">{theme === 'dark' ? '☀️' : '🌙'}</span>
      <span className="theme-toggle-label">{theme === 'dark' ? 'Nền sáng' : 'Nền tối'}</span>
    </button>
  );
}
