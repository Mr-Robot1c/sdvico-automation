// Khối cảnh báo cho người duyệt: máy phát hiện câu có thể tự bịa trong bài content (review Codex 9/10).
// Đọc payload.gen_flags do /api/rotate và rotate-run.mjs ghi: witness_kept (còn giữ vì cắt sẽ hết bài),
// witness_cut (đã tự cắt), lost_closing_question (cắt xong bài mất câu hỏi kết).

type GenFlags = {
  witness_kept?: unknown;
  witness_cut?: unknown;
  lost_closing_question?: unknown;
};

function strList(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => String(x || '').trim()).filter(Boolean) : [];
}

// Trả về null khi phiếu không có cờ nào (không vẽ gì).
export function readGenFlags(payload: unknown): { kept: string[]; cut: string[]; lostQuestion: boolean } | null {
  if (!payload || typeof payload !== 'object') return null;
  const g = (payload as Record<string, unknown>).gen_flags as GenFlags | undefined;
  if (!g || typeof g !== 'object') return null;
  const kept = strList(g.witness_kept);
  const cut = strList(g.witness_cut);
  const lostQuestion = g.lost_closing_question === true;
  if (!kept.length && !cut.length && !lostQuestion) return null;
  return { kept, cut, lostQuestion };
}

export default function GenFlagsNotice({ payload }: { payload: unknown }) {
  const f = readGenFlags(payload);
  if (!f) return null;
  return (
    <div className="gen-flags-notice" role="alert">
      {f.kept.length ? (
        <div>
          <b>Máy phát hiện câu có thể tự bịa (chưa có trong tư liệu):</b>
          <ul>{f.kept.map((s, i) => <li key={i}>{s}</li>)}</ul>
        </div>
      ) : null}
      {f.cut.length ? (
        <div>
          <b>Đã tự cắt:</b>
          <ul>{f.cut.map((s, i) => <li key={i}>{s}</li>)}</ul>
        </div>
      ) : null}
      {f.lostQuestion ? <p>Bài mất câu hỏi kết sau khi cắt, cần viết lại câu kết.</p> : null}
    </div>
  );
}
