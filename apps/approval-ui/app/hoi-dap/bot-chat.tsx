'use client';
import { useRef, useState } from 'react';

// Khung chat với bot hỏi đáp nội bộ (9/9/2026). Gửi câu hỏi + 6 lượt gần nhất lên /api/hoi-dap,
// hiện câu trả lời kèm dòng kho đã dùng. Không tìm thấy thì gợi ý nạp vào kho ngay bên dưới.
type Turn = { role: 'user' | 'bot'; text: string; found?: boolean; sources?: Array<{ id: string; product_group: string; question: string; verified: boolean }> };

export default function BotChat() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const boxRef = useRef<HTMLDivElement>(null);

  const ask = async () => {
    const question = q.trim();
    if (!question || busy) return;
    setErr('');
    setBusy(true);
    const history = turns.slice(-6).map((t) => ({ role: t.role, text: t.text }));
    setTurns((t) => [...t, { role: 'user', text: question }]);
    setQ('');
    try {
      const r = await fetch('/api/hoi-dap', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, history }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `Lỗi ${r.status}`);
      setTurns((t) => [...t, { role: 'bot', text: j.answer, found: j.found, sources: j.sources || [] }]);
    } catch (e: any) {
      setErr(String(e?.message || e));
      setTurns((t) => [...t, { role: 'bot', text: 'Bot chưa trả lời được. ' + String(e?.message || e), found: false }]);
    } finally {
      setBusy(false);
      setTimeout(() => boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight, behavior: 'smooth' }), 50);
    }
  };

  return (
    <div className="plan-card" style={{ marginBottom: 14 }}>
      <div ref={boxRef} style={{ maxHeight: 420, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, padding: '4px 2px' }}>
        {turns.length === 0 ? (
          <p className="sub" style={{ margin: 0 }}>
            Hỏi bất cứ gì đã nạp vào kho: giá, thông số, bảo hành, luật đăng bài, link Shopee, số hotline. Ví dụ: "giá máy lọc dầu bao nhiêu", "bài công khai được ghi giá thế nào", "S-Tracking bảo hành bao lâu".
          </p>
        ) : null}
        {turns.map((t, i) => (
          <div key={i} style={{
            alignSelf: t.role === 'user' ? 'flex-end' : 'flex-start',
            maxWidth: '85%', padding: '8px 12px', borderRadius: 12, whiteSpace: 'pre-wrap',
            background: t.role === 'user' ? 'var(--accent-soft, rgba(37,99,235,.12))' : 'var(--surface-2, rgba(0,0,0,.05))',
          }}>
            {t.text}
            {t.role === 'bot' && t.found === false ? (
              <div className="sub" style={{ marginTop: 6 }}>Kho chưa có. Nạp câu trả lời ở khung "Thêm hỏi đáp" bên dưới để lần sau bot nhớ.</div>
            ) : null}
            {t.role === 'bot' && t.sources && t.sources.length ? (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                {t.sources.map((s) => (
                  <span key={s.id} className={`badge ${s.verified ? 'tone-ok' : 'tone-demo'}`} title={`${s.product_group}: ${s.question}`} style={{ fontSize: '.75rem' }}>
                    {s.verified ? '✔' : '?'} {s.product_group.replace(/^\d+\.\s*/, '').slice(0, 28)}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        ))}
        {busy ? <div className="sub">⏳ Bot đang tìm trong kho...</div> : null}
      </div>
      <form
        onSubmit={(e) => { e.preventDefault(); ask(); }}
        style={{ display: 'flex', gap: 8, marginTop: 10 }}
      >
        <input
          className="note"
          style={{ flex: 1 }}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Hỏi bot... (Enter để gửi)"
          maxLength={600}
          disabled={busy}
        />
        <button className="btn ok" type="submit" disabled={busy || !q.trim()}>Hỏi</button>
        <button className="btn ghost" type="button" onClick={() => { setTurns([]); setErr(''); }} disabled={busy || turns.length === 0}>Xoá</button>
      </form>
      {err ? <p className="sub" style={{ color: 'var(--tone-no, #dc2626)', marginTop: 6 }}>{err}</p> : null}
    </div>
  );
}
