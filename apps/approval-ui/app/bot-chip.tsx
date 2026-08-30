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
  alerts?: Array<{ who: string; msg: string }>; // AI dang DOI / cron dung -> canh bao do
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
  const alertsEarly = status.alerts || [];
  // Chua co gi de bao VA khong co canh bao -> an. Co canh bao thi LUON hien (ke ca da an truoc do).
  if (totalKnowledge === 0 && status.suggestions === 0 && alertsEarly.length === 0) return null;

  // 30/8 (audit H4): đã ẩn thì LUÔN tôn trọng — kể cả khi có cảnh báo (trước đây alert ép chip
  // to hiện lại, che link "Mở" dòng cuối bảng). Cảnh báo thể hiện bằng chấm đỏ trên icon nhỏ.
  const hasAlertEarly = alertsEarly.length > 0;
  if (dismissed) {
    return (
      <button
        className={`bot-reopen${hasAlertEarly ? ' bot-reopen-alert' : ''}`}
        aria-label={hasAlertEarly ? 'Bot có cảnh báo — mở thông báo' : 'Mở lại thông báo Bot'}
        title={hasAlertEarly ? 'Bot có cảnh báo — bấm để xem' : 'Mở lại thông báo Bot'}
        onClick={() => { setDismissed(false); setOpen(true); try { localStorage.removeItem('bot-chip-dismiss'); } catch {} }}
      >
        {hasAlertEarly ? '⚠️' : '🤖'}
      </button>
    );
  }

  const alerts = status.alerts || [];
  const hasAlert = alerts.length > 0;
  const shortMsg = hasAlert
    ? `${alerts.length} AI đang đói`
    : status.suggestions > 0
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
            {hasAlert ? (
              <div className="bot-alerts">
                {alerts.map((a, i) => (
                  <p key={i} className="bot-alert"><b>⚠️ {a.who}:</b> {a.msg}</p>
                ))}
              </div>
            ) : null}
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
        <span className="bot-chip-row">
          <button className={`bot-chip${hasAlert ? ' bot-chip-alert' : ''}`} onClick={() => setOpen(true)} aria-label="Xem chi tiết Bot AI">
            <span className="bot-chip-icon" aria-hidden="true">{hasAlert ? '⚠️' : '🤖'}</span>
            <span className="bot-chip-text">{hasAlert ? 'Bot cần chú ý' : 'Bot đã học'} · <b>{shortMsg}</b></span>
          </button>
          {/* 30/8 (audit H4): thu gọn NGAY trên chip, khỏi phải mở panel mới thấy nút Ẩn. */}
          <button
            className="bot-chip-min"
            aria-label="Thu gọn thông báo Bot"
            title="Thu gọn thành icon nhỏ"
            onClick={() => { setDismissed(true); try { localStorage.setItem('bot-chip-dismiss', '1'); } catch {} }}
          >
            ×
          </button>
        </span>
      )}
    </div>
  );
}
