'use client';

// Bot trạng thái học, góc dưới phải mọi trang nội bộ. Đọc số đếm qua /api/bot-status (chỉ trả số).
// 3/10 (đánh giá UI trước demo): bỏ chip chữ to đỏ nhấp nháy, thu thành MỘT nút tròn nhỏ. Có cảnh
// báo thì chỉ thêm chấm đỏ tĩnh trên nút; bấm mới mở bảng chi tiết. Bỏ luôn trạng thái "ẩn" lưu
// localStorage vì nút đã đủ gọn, không còn che nội dung.

import { useEffect, useRef, useState } from 'react';

type BotStatus = {
  internal: number;
  publicSrc: number;
  planDate: string | null;      // ISO của kế hoạch applied mới nhất, hoặc null
  suggestions: number;           // số hướng đi tuần còn lại chưa dùng
  suggestionsUsed: number;       // số đã dùng
  latestPlanId?: string | null;
  alerts?: Array<{ who: string; msg: string }>; // nguồn học quá hạn / truy vấn lỗi
};

function fmtTime(iso: string | null) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
    });
  } catch { return ''; }
}

function BotIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="8" width="16" height="11" rx="3" />
      <path d="M12 8V4.5" />
      <circle cx="12" cy="3.5" r="1" />
      <circle cx="9" cy="13.5" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="15" cy="13.5" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

export default function BotChip() {
  const [status, setStatus] = useState<BotStatus | null>(null);
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let alive = true;
    const load = () => {
      fetch('/api/bot-status', { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => { if (alive && j) setStatus(j); })
        .catch(() => {});
    };
    load();
    // 15/9 (web chậm): /api/bot-status chạy ~6 truy vấn; hỏi mỗi 5 phút.
    const id = setInterval(load, 5 * 60000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  // Esc đóng bảng và trả focus về nút.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); btnRef.current?.focus(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!status) return null;

  const totalKnowledge = status.internal + status.publicSrc;
  const alerts = status.alerts || [];
  const hasAlert = alerts.length > 0;
  if (totalKnowledge === 0 && status.suggestions === 0 && !hasAlert) return null;

  const label = hasAlert ? `Bot: ${alerts.length} việc cần xem` : 'Bot: tình hình học';

  return (
    <div className="bot-chip-wrap">
      {open ? (
        <div className="bot-panel" role="dialog" aria-label="Tình hình học của bot">
          <div className="bot-panel-head">
            <b>Tình hình học của bot</b>
            <button className="bot-x" aria-label="Đóng" onClick={() => { setOpen(false); btnRef.current?.focus(); }}>×</button>
          </div>
          <div className="bot-panel-body">
            {hasAlert ? (
              <div className="bot-alerts">
                {alerts.map((a, i) => (
                  <p key={i} className="bot-alert"><b>{a.who}:</b> {a.msg}</p>
                ))}
              </div>
            ) : null}
            <p>Đã học <b>{status.internal}</b> bản ghi nội bộ và <b>{status.publicSrc}</b> nguồn public trong 7 ngày qua.</p>
            {status.suggestions > 0 ? (
              <p>Còn <b>{status.suggestions}</b> hướng đi tuần chưa dùng{status.suggestionsUsed > 0 ? ` (đã dùng ${status.suggestionsUsed})` : ''}. Bài tự sinh sẽ bám các hướng này.</p>
            ) : status.suggestionsUsed > 0 ? (
              <p>Đã dùng hết <b>{status.suggestionsUsed}</b> hướng đi tuần. Chủ nhật hệ thống đề xuất bản mới.</p>
            ) : (
              <p className="sub">Chưa có hướng đi tuần. Chủ nhật hệ thống sẽ đề xuất.</p>
            )}
            {status.planDate ? <p className="sub">Kế hoạch mới nhất: {fmtTime(status.planDate)}</p> : null}
            <div className="bot-panel-links">
              <a href="/kho-tri-thuc" className="btn ghost sm">Mở Kho tri thức</a>
              <a href="/ke-hoach" className="btn ghost sm">Mở Kế hoạch</a>
            </div>
          </div>
        </div>
      ) : null}
      <button
        ref={btnRef}
        type="button"
        className="bot-dot-btn"
        aria-label={label}
        title={label}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <BotIcon />
        {hasAlert ? <span className="bot-dot" aria-hidden="true" /> : null}
      </button>
    </div>
  );
}
