'use client';

import { useEffect, useState } from 'react';

type ThemeMode = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'sdvico-theme';
const MODE_ORDER: ThemeMode[] = ['system', 'light', 'dark'];
const NEXT_LABEL: Record<ThemeMode, string> = {
  system: 'Đang: Theo hệ điều hành. Bấm để dùng chế độ Sáng.',
  light: 'Đang: Sáng. Bấm để chuyển Tối.',
  dark: 'Đang: Tối. Bấm để theo Hệ điều hành.',
};

// Áp dụng data-theme lên <html>. "system" xoá thuộc tính để CSS media query quyết định.
function applyTheme(mode: ThemeMode) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (mode === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', mode);
}

// Đồng bộ trạng thái ban đầu với inline script trong <head>. Trước khi client hydrate,
// script đã đặt data-theme cho đúng, ở đây chỉ đọc lại localStorage để hiện đúng label.
export default function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>('system');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
      if (stored && MODE_ORDER.includes(stored)) setMode(stored);
    } catch { /* ignore */ }
    setMounted(true);
  }, []);

  const cycle = () => {
    const idx = MODE_ORDER.indexOf(mode);
    const next = MODE_ORDER[(idx + 1) % MODE_ORDER.length];
    setMode(next);
    applyTheme(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* ignore */ }
  };

  // Render placeholder ổn định khi chưa hydrate để tránh mismatch (label khác nhau).
  const iconName: 'sun' | 'moon' | 'monitor' = mode === 'light' ? 'sun' : mode === 'dark' ? 'moon' : 'monitor';

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={cycle}
      title={mounted ? NEXT_LABEL[mode] : 'Chế độ hiển thị'}
      aria-label="Chuyển chế độ sáng/tối"
    >
      <span className="theme-toggle-icon" aria-hidden="true">
        <ThemeIcon name={iconName} />
      </span>
      <span className="theme-toggle-label">
        {mode === 'system' ? 'Theo máy' : mode === 'light' ? 'Sáng' : 'Tối'}
      </span>
    </button>
  );
}

function ThemeIcon({ name }: { name: 'sun' | 'moon' | 'monitor' }) {
  const common = {
    width: 16, height: 16, viewBox: '0 0 24 24',
    fill: 'none', stroke: 'currentColor', strokeWidth: 1.7,
    strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
  };
  if (name === 'sun') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2 12h2M20 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
      </svg>
    );
  }
  if (name === 'moon') {
    return (
      <svg {...common}>
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
      </svg>
    );
  }
  // monitor / system
  return (
    <svg {...common}>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </svg>
  );
}
