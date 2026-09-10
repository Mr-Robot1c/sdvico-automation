'use client';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import BotChat from './hoi-dap/bot-chat';

// 9/9 (Thanh: "thi công rồi nhưng không thấy con bot nào cả"): nút HỎI BOT nổi ở góc dưới phải
// MỌI trang nội bộ, bấm là mở khung chat của bot hỏi đáp (cùng BotChat với trang /hoi-dap, cùng
// API /api/hoi-dap, chỉ trả lời từ kho). Đứng phía trên chip "Bot đã học" (bot-chip.tsx) để 2 nút
// không đè nhau. Không hiện ở trang đăng nhập và trang công khai (root-shell chỉ render ở shell nội bộ).
// 9/9 (Thanh: "có thể lôi nó đem đi xung quanh thì càng tốt"): KÉO THẢ được. Giữ nút (hoặc thanh
// tiêu đề khung chat) rồi kéo đi đâu cũng được, khung chat đi theo nút; vị trí nhớ trong localStorage
// (chỉ trên máy đó). Nhấn nhẹ không kéo = mở/đóng khung như cũ.

type Pos = { right: number; bottom: number };
const DEFAULT_POS: Pos = { right: 20, bottom: 74 };
const STORE_KEY = 'askbot-pos';
const DRAG_THRESHOLD = 6;

function clamp(p: Pos): Pos {
  if (typeof window === 'undefined') return p;
  const maxRight = Math.max(8, window.innerWidth - 140);
  const maxBottom = Math.max(8, window.innerHeight - 60);
  return { right: Math.min(Math.max(8, p.right), maxRight), bottom: Math.min(Math.max(8, p.bottom), maxBottom) };
}

export default function AskBotFab() {
  const path = usePathname() || '';
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<Pos>(DEFAULT_POS);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ startX: number; startY: number; origin: Pos; moved: boolean } | null>(null);

  // Đọc vị trí đã nhớ (localStorage có thể ném lỗi ở chế độ riêng tư, bọc try).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        if (typeof p?.right === 'number' && typeof p?.bottom === 'number') setPos(clamp(p));
      }
    } catch { /* bỏ qua, dùng vị trí mặc định */ }
  }, []);

  // Phím Esc đóng khung.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Kéo: pointer events dùng chung cho chuột và ngón tay. Kéo theo delta so với lúc bấm.
  const onPointerDown = (e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== undefined && e.button !== 0) return;
    drag.current = { startX: e.clientX, startY: e.clientY, origin: pos, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.startX, dy = e.clientY - d.startY;
    if (!d.moved && Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
    d.moved = true;
    setDragging(true);
    setPos(clamp({ right: d.origin.right - dx, bottom: d.origin.bottom - dy }));
  };
  const endDrag = (e: React.PointerEvent<HTMLElement>, toggleOnClick: boolean) => {
    const d = drag.current;
    drag.current = null;
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    if (d?.moved) {
      setDragging(false);
      try { localStorage.setItem(STORE_KEY, JSON.stringify(pos)); } catch { /* không lưu được cũng không sao */ }
      return;
    }
    if (toggleOnClick) setOpen((v) => !v);
  };

  // 10/9: trang /agent đã có khung chat ngay đầu trang, không hiện nút nổi ở đó nữa.
  if (path.startsWith('/dang-nhap') || path.startsWith('/hoi-dap') || path === '/agent') return null;

  const fabStyle: React.CSSProperties = { right: pos.right, bottom: pos.bottom };
  // Khung chat đứng ngay trên nút, cùng mép phải.
  const panelStyle: React.CSSProperties = { right: pos.right, bottom: pos.bottom + 52 };

  return (
    <>
      {open ? (
        <div className="askbot-panel" role="dialog" aria-label="Hỏi bot nội bộ" style={panelStyle}>
          <div
            className="askbot-head askbot-drag"
            title="Giữ và kéo để dời khung chat"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={(e) => endDrag(e, false)}
            onPointerCancel={(e) => endDrag(e, false)}
          >
            <b>🤖 Hỏi bot nội bộ <span className="askbot-grip" aria-hidden="true">⋮⋮</span></b>
            <span className="askbot-head-actions" onPointerDown={(e) => e.stopPropagation()}>
              <a href="/hoi-dap" className="btn ghost sm" title="Mở kho hỏi đáp để nạp, sửa, xác nhận">📚 Kho hỏi đáp</a>
              <button type="button" className="askbot-x" aria-label="Đóng" onClick={() => setOpen(false)}>×</button>
            </span>
          </div>
          <BotChat compact />
        </div>
      ) : null}
      <button
        type="button"
        className={`askbot-fab${open ? ' askbot-fab-on' : ''}${dragging ? ' askbot-fab-drag' : ''}`}
        style={fabStyle}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => endDrag(e, true)}
        onPointerCancel={(e) => endDrag(e, false)}
        aria-label={open ? 'Đóng khung hỏi bot' : 'Hỏi bot nội bộ'}
        title="Bấm để hỏi bot. Giữ và kéo để dời nút đi chỗ khác."
      >
        <span aria-hidden="true">💬</span>
        <span className="askbot-fab-text">{open ? 'Đóng' : 'Hỏi bot'}</span>
      </button>
    </>
  );
}
