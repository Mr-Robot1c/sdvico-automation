'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// Studio Bản tin chạy trên máy người biên tập, không nằm trên Vercel.
// Kiểm sống: GET http://localhost:8899/api/health -> { ok: true, ... } (endpoint đã mở CORS và Private Network Access).
// Chạy -> nhúng iframe (?nhung=1). Chưa chạy -> nút liên kết protocol bantin-studio:// và tự kiểm lại mỗi 2 giây.
const STUDIO_ORIGIN = 'http://localhost:8899';
const HEALTH_URL = `${STUDIO_ORIGIN}/api/health`;
const POLL_MS = 2000;

type StudioKey = 'ts' | 'noibo';
const STUDIOS: Record<StudioKey, { label: string; embed: string; direct: string; protocol: string }> = {
  ts: {
    label: 'Bản tin thủy sản',
    embed: `${STUDIO_ORIGIN}/ts/?nhung=1`,
    direct: `${STUDIO_ORIGIN}/ts/`,
    protocol: 'bantin-studio://mo/ts/'
  },
  noibo: {
    label: 'Bản tin nội bộ',
    embed: `${STUDIO_ORIGIN}/?nhung=1`,
    direct: `${STUDIO_ORIGIN}/`,
    protocol: 'bantin-studio://mo/'
  }
};
const ORDER: StudioKey[] = ['ts', 'noibo'];

type Status = 'checking' | 'offline' | 'online';

async function pingStudio(): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 2500);
  try {
    const res = await fetch(HEALTH_URL, { cache: 'no-store', signal: ctrl.signal });
    if (!res.ok) return false;
    const j = await res.json().catch(() => null);
    return !!(j && j.ok === true);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export default function StudioEmbed() {
  const [tab, setTab] = useState<StudioKey>('ts');
  // Tab đã mở thì giữ iframe sống (ẩn khi chuyển tab) để không mất việc đang dựng dở.
  const [visited, setVisited] = useState<Record<StudioKey, boolean>>({ ts: true, noibo: false });
  const [status, setStatus] = useState<Status>('checking');
  const alive = useRef(true);

  const check = useCallback(async () => {
    const ok = await pingStudio();
    if (!alive.current) return;
    setStatus(ok ? 'online' : 'offline');
  }, []);

  // Kiểm lần đầu, rồi cứ 2 giây một lần cho tới khi Studio sống. Đã sống thì dừng hỏi (khỏi đụng vào iframe đang làm việc).
  useEffect(() => {
    alive.current = true;
    void check();
    return () => { alive.current = false; };
  }, [check]);

  useEffect(() => {
    if (status !== 'offline') return;
    const id = window.setInterval(() => { void check(); }, POLL_MS);
    return () => window.clearInterval(id);
  }, [status, check]);

  const pick = (k: StudioKey) => {
    setTab(k);
    setVisited((v) => (v[k] ? v : { ...v, [k]: true }));
  };

  const cur = STUDIOS[tab];

  return (
    <section aria-label="Studio bản tin">
      <div className="filters" role="tablist" aria-label="Loại bản tin" style={{ margin: '16px 0 12px' }}>
        {ORDER.map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            id={`studio-tab-${k}`}
            aria-selected={tab === k}
            aria-controls="studio-panel"
            className={`chip${tab === k ? ' on' : ''}`}
            onClick={() => pick(k)}
          >
            {STUDIOS[k].label}
          </button>
        ))}
      </div>

      <div id="studio-panel" role="tabpanel" aria-labelledby={`studio-tab-${tab}`}>
        {status === 'checking' ? (
          <div className="card studio-state" role="status" aria-live="polite">
            <p className="sub" style={{ margin: 0 }}>Đang kiểm tra Studio trên máy này...</p>
          </div>
        ) : null}

        {status === 'offline' ? (
          <div className="card studio-state" role="status" aria-live="polite">
            <h2 style={{ margin: '0 0 6px', fontSize: 17 }}>Studio bản tin chưa chạy</h2>
            <p className="sub" style={{ margin: '0 0 12px' }}>
              Bấm nút dưới để mở {cur.label.toLowerCase()}. Lần đầu trình duyệt sẽ hỏi, chọn Mở. Studio bật xong trang này tự chuyển sang khung dựng, không cần tải lại.
            </p>
            <a className="btn" href={cur.protocol}>Mở Studio Bản tin</a>
            <p className="sub" style={{ margin: '12px 0 0', fontSize: 13 }}>
              Studio chạy trên máy người biên tập, chỉ mở được khi bạn đang ngồi đúng máy đó. Nếu trình duyệt hỏi quyền truy cập thiết bị trong mạng cục bộ, chọn Cho phép. Đang tự kiểm tra lại mỗi 2 giây.
            </p>
          </div>
        ) : null}

        {status === 'online' ? (
          <>
            <p className="sub studio-bar">
              Studio đang chạy trên máy này.{' '}
              <a className="src" href={cur.direct} target="_blank" rel="noreferrer" style={{ marginLeft: 0 }}>Mở trong cửa sổ riêng</a>
            </p>
            {ORDER.map((k) =>
              visited[k] ? (
                <iframe
                  key={k}
                  className="studio-frame"
                  title={`Studio ${STUDIOS[k].label}`}
                  src={STUDIOS[k].embed}
                  hidden={tab !== k}
                  allow="clipboard-read; clipboard-write; fullscreen"
                />
              ) : null
            )}
          </>
        ) : null}
      </div>
    </section>
  );
}
