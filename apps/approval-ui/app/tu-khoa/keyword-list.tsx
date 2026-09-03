'use client';

import { useMemo, useState, useTransition } from 'react';
import { deleteKeyword, generateFromKeyword } from '../generate-action-exports';

// 3/9 (kho đã 172+ từ, Gemini thêm 10/tuần): danh sách chuyển sang client để có Ô TÌM KIẾM
// + giới hạn hiển thị, và nút "Viết bài" có trạng thái chạy (server action mất ~1 phút,
// trước đây form treo không phản hồi, dễ bấm lại).
export type KwRow = {
  id: string; keyword: string; intent: string | null;
  landing_url: string | null; source: string | null; hasPost: boolean;
};

const INTENT_LABEL: Record<string, string> = {
  thong_tin: 'Thông tin', thuong_mai: 'So sánh', giao_dich: 'Giao dịch', dieu_huong: 'Điều hướng',
};
const INTENT_TONE: Record<string, string> = {
  thong_tin: 'web', thuong_mai: 'mkt', giao_dich: 'ok', dieu_huong: 'default',
};
const SHOW_MAX = 120;

function WriteButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      className="btn ok"
      type="button"
      disabled={pending}
      title="Sinh 3 bản (web, Facebook, video) vào hàng đợi duyệt — không tự đăng"
      onClick={() => {
        const fd = new FormData();
        fd.set('id', id);
        startTransition(async () => { await generateFromKeyword(fd); });
      }}
    >
      {pending ? 'Đang viết (~1 phút)…' : 'Viết bài'}
    </button>
  );
}

export default function KeywordList({ rows }: { rows: KwRow[] }) {
  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    const needle = q.toLowerCase().trim();
    if (!needle) return rows;
    return rows.filter((r) => r.keyword.toLowerCase().includes(needle));
  }, [rows, q]);
  const shown = filtered.slice(0, SHOW_MAX);

  return (
    <>
      <div className="filters" style={{ margin: '10px 0' }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Tìm trong kho từ khóa…"
          aria-label="Tìm từ khóa"
          style={{ flex: 1, minWidth: 220 }}
        />
        <span className="sub" style={{ alignSelf: 'center', fontSize: '.85rem' }}>
          hiện {shown.length}/{filtered.length}
        </span>
      </div>
      <ul className="list">
        {shown.map((r) => {
          const it = r.intent || 'khac';
          return (
            <li key={r.id} className="card kwrow">
              <div>
                <div className="title">{r.keyword}</div>
                <div className="badges">
                  <span className={`badge tone-${INTENT_TONE[it] || 'default'}`}>{INTENT_LABEL[it] || 'Khác'}</span>
                  {r.hasPost ? <span className="badge tone-ok">đã có bài</span> : null}
                  {r.landing_url ? <span className="src">{r.landing_url}</span> : null}
                  {r.source ? <span className="src">nguồn: {r.source}</span> : null}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {!r.hasPost ? <WriteButton id={r.id} /> : null}
                <form action={deleteKeyword}>
                  <input type="hidden" name="id" value={r.id} />
                  <button className="btn no" type="submit" aria-label="Xóa từ khóa">Xóa</button>
                </form>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
