'use client';

import { useState, useTransition } from 'react';
import { generateNow } from './generate-action';

// Nút "Sinh nội dung": bấm là máy soạn một bộ bài mới vào hàng đợi. Người vẫn duyệt sau.
export default function GenerateButton() {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <div className="gen-wrap">
      <button
        className="btn ok gen-btn"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setMsg(null);
            try {
              const r = await generateNow();
              setMsg(r.message);
            } catch (e) {
              setMsg('Lỗi khi sinh nội dung, thử lại.');
            }
          })
        }
      >
        {pending ? 'Đang sinh nội dung...' : 'Sinh nội dung'}
      </button>
      {msg ? <span className="gen-msg">{msg}</span> : null}
    </div>
  );
}
