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
  }, []);

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    setTheme(next);
  };

  return (
    <button className="theme-toggle" onClick={toggle} aria-label="Đổi giao diện sáng tối">
      <span aria-hidden="true">{theme === 'dark' ? '☀️' : '🌙'}</span>
      {theme === 'dark' ? 'Nền sáng' : 'Nền tối'}
    </button>
  );
}
