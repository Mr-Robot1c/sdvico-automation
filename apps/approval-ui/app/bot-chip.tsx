'use client';

// BOT chip - noi bat goc duoi phai moi trang. Thong bao "AI da hoc gi" tu Kho tri thuc.
// Doc counts qua /api/bot-status (khong auth vi chi tra so, khong lo du lieu).
// Auto refresh 60s. Dismissible - luu 'bot-chip-dismiss' vao localStorage; open lai qua nut nho.
// Click chip mo popup nho voi highlights + link /kho-tri-thuc + /ke-hoach.

import { useEffect, useState } from 'react';

type BotStatus = {
  internal: number;
  publicSrc: number;
  planDate: string | null;      // ISO cua ke hoach applied moi nhat, hoac null
  suggestions: number;           // so content_suggestions con lai chua dung
  suggestionsUsed: number;       // so da dung
  latestPlanId?: string | null;
};

function fmtTime(iso: string | null) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
    });
  } catch { return ''; }
}

export default function BotChip() {
  const [status, setStatus] = useState<BotStatus | null>(null);
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // Doc trang thai dismiss tu localStorage 1 lan luc mount.
  useEffect(() => {
    try {
      const d = localStorage.getItem('bot-chip-dismiss');
      if (d === '1') setDismissed(true);
    } catch {}
  }, []);

  // Fetch bot status ngay + moi 60s.
  useEffect(() => {
    let alive = true;
    const load = () => {
      fetch('/api/bot-status', { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => { if (alive && j) setStatus(j); })
        .catch(() => {});
    };
    load();
    const id = setInterval(load, 60000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  if (!status) return null;

  const totalKnowledge = status.internal + status.publicSrc;
  if (totalKnowledge === 0 && status.suggestions === 0) return null; // chua co gi de bao

  if (dismissed) {
    return (
      <button
        className="bot-reopen"
        aria-label="Mo lai thong bao BOT"
        title="Mo lai thong bao BOT"
        onClick={() => { setDismissed(false); try { localStorage.removeItem('bot-chip-dismiss'); } catch {} }}
      >
        🤖
      </button>
    );
  }

  const shortMsg = status.suggestions > 0
    ? `${status.suggestions} hướng đi sẵn`
    : `${totalKnowledge} nguồn`;

  return (
    <div className="bot-chip-wrap">
      {open ? (
        <div className="bot-panel" role="dialog" aria-label="Chi tiết Bot AI">
          <div className="bot-panel-head">
            <b>🤖 Bot AI</b>
            <button className="bot-x" aria-label="Đóng" onClick={() => setOpen(false)}>×</button>
          </div>
          <div className="bot-panel-body">
            <p>Đã học <b>{status.internal}</b> bản ghi nội bộ và <b>{status.publicSrc}</b> nguồn public trong 7 ngày qua.</p>
            {status.suggestions > 0 ? (
              <p>Có <b>{status.suggestions}</b> hướng đi tuần chưa dùng {status.suggestionsUsed > 0 ? `(đã dùng ${status.suggestionsUsed})` : ''}. Vòng xoay sinh bài sẽ bám hướng đi này.</p>
            ) : status.suggestionsUsed > 0 ? (
              <p>Đã dùng hết <b>{status.suggestionsUsed}</b> hướng đi tuần. Cron Chủ nhật sinh bản mới.</p>
            ) : (
              <p className="sub">Chưa có hướng đi tuần. Cron Chủ nhật sẽ sinh, hoặc chạy tay <code>scripts/generate-plan-directions.mjs</code>.</p>
            )}
            {status.planDate ? <p className="sub">Kế hoạch mới nhất: {fmtTime(status.planDate)}</p> : null}
            <div className="bot-panel-links">
              <a href="/kho-tri-thuc" className="btn ghost sm">Mở Kho tri thức</a>
              <a href="/ke-hoach" className="btn ghost sm">Mở Kế hoạch</a>
            </div>
          </div>
          <button className="bot-dismiss" onClick={() => { setDismissed(true); setOpen(false); try { localStorage.setItem('bot-chip-dismiss', '1'); } catch {} }}>
            Ẩn thông báo
          </button>
        </div>
      ) : (
        <button className="bot-chip" onClick={() => setOpen(true)} aria-label="Xem chi tiết Bot AI">
          <span className="bot-chip-icon" aria-hidden="true">🤖</span>
          <span className="bot-chip-text">Bot đã học · <b>{shortMsg}</b></span>
        </button>
      )}
    </div>
  );
}
