'use client';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import BotChat from './hoi-dap/bot-chat';

// 9/9 (Thanh: "thi công rồi nhưng không thấy con bot nào cả"): nút HỎI BOT nổi ở góc dưới phải
// MỌI trang nội bộ, bấm là mở khung chat của bot hỏi đáp (cùng BotChat với trang /hoi-dap, cùng
// API /api/hoi-dap, chỉ trả lời từ kho). Đứng phía trên chip "Bot đã học" (bot-chip.tsx) để 2 nút
// không đè nhau. Không hiện ở trang đăng nhập và trang công khai (root-shell chỉ render ở shell nội bộ).
export default function AskBotFab() {
  const path = usePathname() || '';
  const [open, setOpen] = useState(false);

  // Phím Esc đóng khung.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (path.startsWith('/dang-nhap') || path.startsWith('/hoi-dap')) return null;

  return (
    <>
      {open ? (
        <div className="askbot-panel" role="dialog" aria-label="Hỏi bot nội bộ">
          <div className="askbot-head">
            <b>🤖 Hỏi bot nội bộ</b>
            <span className="askbot-head-actions">
              <a href="/hoi-dap" className="btn ghost sm" title="Mở kho hỏi đáp để nạp, sửa, xác nhận">📚 Kho hỏi đáp</a>
              <button type="button" className="askbot-x" aria-label="Đóng" onClick={() => setOpen(false)}>×</button>
            </span>
          </div>
          <BotChat />
        </div>
      ) : null}
      <button
        type="button"
        className={`askbot-fab${open ? ' askbot-fab-on' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Đóng khung hỏi bot' : 'Hỏi bot nội bộ'}
        title="Hỏi bot: giá, thông số, bảo hành, luật đăng bài, link Shopee"
      >
        <span aria-hidden="true">💬</span>
        <span className="askbot-fab-text">{open ? 'Đóng' : 'Hỏi bot'}</span>
      </button>
    </>
  );
}
