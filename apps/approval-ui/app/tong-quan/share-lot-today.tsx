'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

// 15/9 (Thanh: "chia sẻ group t đã chia sẻ hết rồi mà nó vẫn để 0/4, sếp không biết đã chia chưa").
// Nguyên nhân: máy KHÔNG nhìn thấy việc chia sẻ trên Facebook (Groups API đã đóng), chỉ đếm khi
// người bấm "Đã chia" — mà nút đó nằm sâu trong popover 📣 của từng bài, lại chỉ hiện khi bài đã
// Ghép link. Sửa: đưa LÔ 4 NHÓM hôm nay ra thẳng Tổng quan + Kế hoạch, mỗi nhóm 1 nút "Đã chia"
// bấm 1 chạm (kèm link mở nhóm), có hoàn tác. Lượt ghi vào mkt_group_shares như popover.

export type LotChip = {
  id: string;
  label: string;
  url: string;
  sharedToday: { id: string; content_id: string | null; shared_at: string } | null;
};

export default function ShareLotToday({
  lot, lotSize, doneToday, post, compact = false,
}: {
  lot: LotChip[];
  lotSize: number;
  doneToday: number;
  // Bài Facebook đã đăng hôm nay để gắn lượt chia (không có thì ghi lượt chia không kèm bài).
  post: { contentId: string; url: string | null } | null;
  compact?: boolean;
}) {
  const router = useRouter();
  const [items, setItems] = useState<LotChip[]>(lot);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const inFlight = useRef<Set<string>>(new Set());
  const done = items.filter((g) => g.sharedToday).length;

  const call = async (input: RequestInfo, init: RequestInit) => {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 15000);
    try { return await fetch(input, { ...init, signal: ctl.signal }); } finally { clearTimeout(t); }
  };

  const mark = async (g: LotChip) => {
    if (inFlight.current.has(g.id)) return;
    inFlight.current.add(g.id); setBusy(g.id); setErr('');
    const nowIso = new Date().toISOString();
    setItems((arr) => arr.map((x) => (x.id === g.id ? { ...x, sharedToday: { id: 'tam', content_id: post?.contentId || null, shared_at: nowIso } } : x)));
    try {
      const r = await call('/api/share-groups/shares', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content_id: post?.contentId || null, group_id: g.id, group_label: g.label, post_url: post?.url || null }),
      });
      if (!r.ok) throw new Error(r.status === 401 ? 'phiên đăng nhập hết hạn, tải lại trang' : 'máy chủ trả ' + r.status);
      const j = await r.json();
      if (j?.row?.id) setItems((arr) => arr.map((x) => (x.id === g.id ? { ...x, sharedToday: { id: String(j.row.id), content_id: j.row.content_id ?? null, shared_at: String(j.row.shared_at || nowIso) } } : x)));
      router.refresh();
    } catch (e: any) {
      setItems((arr) => arr.map((x) => (x.id === g.id ? { ...x, sharedToday: g.sharedToday } : x)));
      setErr(`Chưa ghi được lượt chia cho "${g.label}": ${e?.name === 'AbortError' ? 'máy chủ không trả lời sau 15 giây' : (e?.message || 'lỗi mạng')}.`);
    } finally { inFlight.current.delete(g.id); setBusy(null); }
  };

  const undo = async (g: LotChip) => {
    if (!g.sharedToday || g.sharedToday.id === 'tam' || inFlight.current.has(g.id)) return;
    inFlight.current.add(g.id); setBusy(g.id); setErr('');
    const prev = g.sharedToday;
    setItems((arr) => arr.map((x) => (x.id === g.id ? { ...x, sharedToday: null } : x)));
    try {
      const r = await call('/api/share-groups/shares', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: prev.id }) });
      if (!r.ok) throw new Error('máy chủ trả ' + r.status);
      router.refresh();
    } catch (e: any) {
      setItems((arr) => arr.map((x) => (x.id === g.id ? { ...x, sharedToday: prev } : x)));
      setErr(`Chưa hoàn tác được "${g.label}": ${e?.message || 'lỗi mạng'}.`);
    } finally { inFlight.current.delete(g.id); setBusy(null); }
  };

  return (
    <div className="lot-box">
      <div className="lot-head">
        <span>📣 Chia sẻ group hôm nay: <b>{done}/{lotSize}</b> nhóm</span>
        {done >= lotSize ? <span className="lot-ok">✓ đủ lô</span> : <span className="sub">bấm <b>Mở nhóm</b>, đăng xong bấm <b>Đã chia</b></span>}
      </div>
      <div className={`lot-chips ${compact ? 'compact' : ''}`}>
        {items.map((g) => (
          <div key={g.id} className={`lot-chip ${g.sharedToday ? 'done' : ''}`}>
            <span className="lot-label" title={g.label}>👥 {g.label}</span>
            <a href={g.url} target="_blank" rel="noreferrer" className="lot-open" title="Mở nhóm Facebook ở tab mới">Mở nhóm ↗</a>
            {g.sharedToday ? (
              <button type="button" className="lot-btn done" disabled={busy === g.id || g.sharedToday.id === 'tam'} onClick={() => undo(g)} title="Đã ghi lượt chia hôm nay. Bấm để hoàn tác nếu bấm nhầm.">
                ✓ Đã chia
              </button>
            ) : (
              <button type="button" className="lot-btn" disabled={busy === g.id} onClick={() => mark(g)} title="Ghi nhận bạn đã chia bài vào nhóm này hôm nay">
                {busy === g.id ? '⏳' : 'Đã chia'}
              </button>
            )}
          </div>
        ))}
        {!items.length ? <span className="sub">Chưa có nhóm nào. Thêm nhóm ở popover 📣 Chia sẻ group trong Bảng bài viết.</span> : null}
      </div>
      {err ? <p className="err-note sub" style={{ margin: '6px 0 0' }}>⛔ {err}</p> : null}
      {post?.url ? <p className="sub" style={{ margin: '6px 0 0', fontSize: '.78rem' }}>Bài Facebook hôm nay: <a href={post.url} target="_blank" rel="noreferrer" className="src">mở bài ↗</a> (sao chép link bài rồi dán vào nhóm).</p> : null}
    </div>
  );
}
