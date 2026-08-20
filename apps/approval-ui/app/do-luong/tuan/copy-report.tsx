'use client';

import { useState } from 'react';

// Nút sao chép báo cáo TEXT vào clipboard, để người dùng dán vào Zalo/chat cho sếp.
// Không dùng tối ưu — mở đơn giản: copy xong hiện "Đã chép" 2 giây rồi trả về.
export default function CopyReport({ text }: { text: string }) {
  const [state, setState] = useState<'idle' | 'ok' | 'err'>('idle');

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setState('ok');
      setTimeout(() => setState('idle'), 2000);
    } catch {
      setState('err');
      setTimeout(() => setState('idle'), 2500);
    }
  }

  return (
    <button
      type="button"
      onClick={onCopy}
      className="btn ghost"
      title="Sao chép báo cáo dưới dạng chữ để dán vào Zalo cho sếp"
    >
      {state === 'ok' ? '✓ Đã chép' : state === 'err' ? '⛔ Lỗi copy' : '📋 Sao chép báo cáo'}
    </button>
  );
}
