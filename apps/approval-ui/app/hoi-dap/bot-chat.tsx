'use client';
import { useRef, useState } from 'react';

// Khung chat với bot nội bộ (9/9/2026). Gửi câu hỏi + 8 lượt gần nhất lên /api/hoi-dap.
// 10/9 (Thanh: "muốn chatbot như 1 con claude, hỏi bên ngoài mà nó vẫn biết"): bot trả lời cả câu
// hỏi chung (có tìm Google), hiện nhãn phạm vi (Kho SDVICO / Kiến thức chung / Kết hợp), nguồn web
// kèm link; gợi ý nạp kho CHỈ khi câu về SDVICO mà kho chưa có. Ô nhập là textarea, Enter gửi,
// Shift+Enter xuống dòng.
type Turn = {
  role: 'user' | 'bot'; text: string; found?: boolean; scope?: 'noi_bo' | 'chung' | 'hon_hop'; model?: string;
  sources?: Array<{ id: string; product_group: string; question: string; verified: boolean }>;
  web?: Array<{ url: string; title: string }>;
};

const SCOPE_LABEL: Record<string, string> = { noi_bo: '📚 Kho SDVICO', chung: '🌐 Kiến thức chung', hon_hop: '📚🌐 Kết hợp' };

export default function BotChat({ compact = false }: { compact?: boolean }) {
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
    const history = turns.slice(-8).map((t) => ({ role: t.role, text: t.text }));
    setTurns((t) => [...t, { role: 'user', text: question }]);
    setQ('');
    try {
      const r = await fetch('/api/hoi-dap', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, history }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `Lỗi ${r.status}`);
      setTurns((t) => [...t, { role: 'bot', text: j.answer, found: j.found, scope: j.scope, model: j.model, sources: j.sources || [], web: j.web_sources || [] }]);
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
      <div ref={boxRef} style={{ maxHeight: compact ? 360 : 460, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, padding: '4px 2px' }}>
        {turns.length === 0 ? (
          <p className="sub" style={{ margin: 0 }}>
            Hỏi gì cũng được, như hỏi Claude hay ChatGPT: kiến thức chung, kỹ thuật, tin mới, nhờ soạn chữ, dịch, tính toán. Riêng giá, thông số, bảo hành, link sàn của SDVICO thì bot chỉ lấy từ kho đã nạp, kho chưa có thì nói chưa có. Ví dụ: "giá máy lọc dầu bao nhiêu", "máy lọc nước biển RO hoạt động thế nào", "soạn giúp tin trả lời khách hỏi bảo hành".
          </p>
        ) : null}
        {turns.map((t, i) => (
          <div key={i} style={{
            alignSelf: t.role === 'user' ? 'flex-end' : 'flex-start',
            maxWidth: '88%', padding: '8px 12px', borderRadius: 12, whiteSpace: 'pre-wrap',
            background: t.role === 'user' ? 'var(--accent-soft, rgba(37,99,235,.12))' : 'var(--surface-2, rgba(0,0,0,.05))',
          }}>
            {t.text}
            {t.role === 'bot' && t.scope ? (
              <div className="sub" style={{ marginTop: 6, fontSize: '.75rem' }} title={t.model ? `Model: ${t.model}` : undefined}>
                {SCOPE_LABEL[t.scope] || ''}{t.model && t.model.includes('Search') ? ' · có tìm Google' : ''}
              </div>
            ) : null}
            {t.role === 'bot' && t.found === false && t.scope !== 'chung' ? (
              <div className="sub" style={{ marginTop: 6 }}>Kho SDVICO chưa có phần này. Nạp câu trả lời ở <a href="/hoi-dap#them">Kho hỏi đáp</a> để lần sau bot nhớ.</div>
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
            {t.role === 'bot' && t.web && t.web.length ? (
              <div className="sub" style={{ marginTop: 8, fontSize: '.78rem', display: 'grid', gap: 2 }}>
                <span>Nguồn ngoài:</span>
                {t.web.map((w) => (
                  <a key={w.url} href={w.url} target="_blank" rel="noreferrer" className="src" style={{ overflowWrap: 'anywhere' }}>{w.title}</a>
                ))}
              </div>
            ) : null}
          </div>
        ))}
        {busy ? <div className="sub">⏳ Bot đang suy nghĩ (có thể tìm Google, mất tới 30 giây)...</div> : null}
      </div>
      <form
        onSubmit={(e) => { e.preventDefault(); ask(); }}
        style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'flex-end' }}
      >
        <textarea
          className="note"
          style={{ flex: 1, resize: 'vertical', minHeight: 40, maxHeight: 160 }}
          rows={compact ? 1 : 2}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(); } }}
          placeholder="Hỏi bot... (Enter gửi, Shift+Enter xuống dòng)"
          maxLength={2000}
          disabled={busy}
        />
        <button className="btn ok" type="submit" disabled={busy || !q.trim()}>Hỏi</button>
        <button className="btn ghost" type="button" onClick={() => { setTurns([]); setErr(''); }} disabled={busy || turns.length === 0}>Xoá</button>
      </form>
      {err ? <p className="sub" style={{ color: 'var(--tone-no, #dc2626)', marginTop: 6 }}>{err}</p> : null}
    </div>
  );
}
