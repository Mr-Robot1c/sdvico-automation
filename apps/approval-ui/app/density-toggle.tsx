'use client';

import { useEffect, useState } from 'react';

type Density = 'normal' | 'compact';

const STORAGE_KEY = 'sdvico-density';

function apply(density: Density) {
  if (typeof document === 'undefined') return;
  if (density === 'compact') document.documentElement.setAttribute('data-density', 'compact');
  else document.documentElement.removeAttribute('data-density');
}

export default function DensityToggle() {
  const [density, setDensity] = useState<Density>('normal');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'compact' || stored === 'normal') setDensity(stored);
    } catch { /* ignore */ }
    setMounted(true);
  }, []);

  const toggle = () => {
    const next: Density = density === 'compact' ? 'normal' : 'compact';
    setDensity(next);
    apply(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* ignore */ }
  };

  return (
    <button
      type="button"
      className={`density-toggle${density === 'compact' ? ' is-on' : ''}`}
      onClick={toggle}
      title={mounted ? (density === 'compact' ? 'Đang chật. Bấm về bình thường.' : 'Đang bình thường. Bấm để hiển thị chật hơn.') : 'Mật độ hiển thị'}
      aria-label="Chuyển mật độ hiển thị"
      aria-pressed={density === 'compact'}
    >
      <span className="density-toggle-icon" aria-hidden="true">
        <DensityIcon compact={density === 'compact'} />
      </span>
      <span className="density-toggle-label">
        {density === 'compact' ? 'Chật' : 'Bình thường'}
      </span>
    </button>
  );
}

function DensityIcon({ compact }: { compact: boolean }) {
  const common = {
    width: 16, height: 16, viewBox: '0 0 24 24',
    fill: 'none', stroke: 'currentColor', strokeWidth: 1.7,
    strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
  };
  if (compact) {
    return (
      <svg {...common}>
        <path d="M4 5h16M4 9h16M4 13h16M4 17h16M4 21h16" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M4 5h16M4 12h16M4 19h16" />
    </svg>
  );
}
