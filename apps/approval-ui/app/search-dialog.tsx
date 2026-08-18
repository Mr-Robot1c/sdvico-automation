'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

type ResultItem = {
  id: string;
  title: string;
  sub?: string | null;
  href: string;
  group: string;
};

type SearchResponse = {
  jobs: Array<{ id: string; title: string; sub: string | null; status: string }>;
  candidates: Array<{ id: string; name: string; sub: string | null }>;
  posts: Array<{ id: string; title: string; sub: string | null; status: string }>;
  employees: Array<{ id: string; name: string; sub: string | null }>;
};

// Ghép kết quả từ /api/search thành 1 danh sách phẳng, mỗi nhóm có tiêu đề riêng.
function flatten(res: SearchResponse): ResultItem[] {
  const out: ResultItem[] = [];
  for (const j of res.jobs) {
    out.push({ id: `job-${j.id}`, title: j.title, sub: j.sub, href: `/tao-jd?filter=all`, group: 'Vị trí tuyển dụng' });
  }
  for (const c of res.candidates) {
    out.push({ id: `cand-${c.id}`, title: c.name, sub: c.sub, href: `/ho-so`, group: 'Hồ sơ ứng viên' });
  }
  for (const p of res.posts) {
    out.push({ id: `post-${p.id}`, title: p.title, sub: p.sub, href: `/dang-tin`, group: 'Tin đăng' });
  }
  for (const e of res.employees) {
    out.push({ id: `emp-${e.id}`, title: e.name, sub: e.sub, href: `/nhan-vien/${e.id}`, group: 'Nhân viên' });
  }
  return out;
}

// Nhóm lại theo group để render section, giữ thứ tự flat cho arrow up/down.
function groupResults(items: ResultItem[]): { group: string; items: ResultItem[] }[] {
  const groups: Record<string, ResultItem[]> = {};
  const order: string[] = [];
  for (const it of items) {
    if (!groups[it.group]) { groups[it.group] = []; order.push(it.group); }
    groups[it.group].push(it);
  }
  return order.map((g) => ({ group: g, items: groups[g] }));
}

export default function SearchDialog() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [items, setItems] = useState<ResultItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const close = useCallback(() => {
    setOpen(false);
    setQ('');
    setItems([]);
    setActive(0);
  }, []);

  // Cmd/Ctrl+K global listener + Esc để đóng
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === 'Escape' && open) {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  // Focus input khi mở
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);

  // Debounce fetch
  useEffect(() => {
    if (!open) return;
    const term = q.trim();
    if (term.length < 2) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(term)}&limit=6`, { cache: 'no-store' });
        if (!r.ok) { setItems([]); return; }
        const data: SearchResponse = await r.json();
        const flat = flatten(data);
        setItems(flat);
        setActive(0);
      } catch { setItems([]); } finally { setLoading(false); }
    }, 220);
    return () => clearTimeout(t);
  }, [q, open]);

  const activateItem = (item: ResultItem) => {
    router.push(item.href);
    close();
  };

  const onKeyInput = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && items[active]) {
      e.preventDefault();
      activateItem(items[active]);
    }
  };

  const groups = groupResults(items);

  return (
    <>
      <button
        type="button"
        className="nav-search-trigger"
        onClick={() => setOpen(true)}
        aria-label="Tìm nhanh"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
        <span className="nav-search-label">Tìm nhanh</span>
        <span className="nav-search-hint" aria-hidden="true">⌘K</span>
      </button>

      {open ? (
        <div className="search-overlay" role="dialog" aria-modal="true" onClick={close}>
          <div className="search-box" onClick={(e) => e.stopPropagation()}>
            <div className="search-input-wrap">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="search-input-icon" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="M20 20l-3.5-3.5" />
              </svg>
              <input
                ref={inputRef}
                type="search"
                className="search-input"
                placeholder="Tìm vị trí, ứng viên, tin đăng, nhân viên..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={onKeyInput}
                aria-label="Từ khoá tìm kiếm"
              />
              <span className="search-kbd" aria-hidden="true">Esc</span>
            </div>

            <div className="search-results">
              {q.trim().length < 2 ? (
                <p className="search-empty">Gõ ít nhất 2 ký tự để tìm.</p>
              ) : loading ? (
                <p className="search-empty">Đang tìm...</p>
              ) : items.length === 0 ? (
                <p className="search-empty">Không có kết quả cho &quot;{q}&quot;.</p>
              ) : (
                groups.map((g) => (
                  <div className="search-group" key={g.group}>
                    <div className="search-group-title">{g.group}</div>
                    {g.items.map((it) => {
                      const flatIndex = items.indexOf(it);
                      const isActive = flatIndex === active;
                      return (
                        <button
                          key={it.id}
                          type="button"
                          className={`search-item${isActive ? ' is-active' : ''}`}
                          onMouseEnter={() => setActive(flatIndex)}
                          onClick={() => activateItem(it)}
                        >
                          <div className="search-item-title">{it.title}</div>
                          {it.sub ? <div className="search-item-sub muted">{it.sub}</div> : null}
                        </button>
                      );
                    })}
                  </div>
                ))
              )}
            </div>

            <div className="search-footer">
              <span><kbd>↑</kbd> <kbd>↓</kbd> chọn</span>
              <span><kbd>Enter</kbd> mở</span>
              <span><kbd>Esc</kbd> đóng</span>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
