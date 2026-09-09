'use client';
import { useState } from 'react';

// Nút "📚 Lưu hỏi đáp" ở từng khách (lệnh sếp Long 9/9: mọi câu khách hỏi + câu trả lời đã dùng gom
// vào kho kiến thức từng sản phẩm). Mở form nhỏ, câu hỏi lấy sẵn từ nội dung khách hỏi, người nhập
// câu trả lời đã dùng rồi bấm Lưu -> server action addProductQa (kèm lead_id để đối chiếu).
export default function SaveQaButton({
  leadId, question, groups, defaultGroup, action,
}: { leadId: string; question: string; groups: string[]; defaultGroup: string; action: (formData: FormData) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  if (done) return <span className="sub">✓ Đã vào kho</span>;
  return (
    <div>
      <button type="button" className="btn ghost sm" onClick={() => setOpen((v) => !v)} title="Lưu câu hỏi này và câu trả lời đã dùng vào kho hỏi đáp">
        📚 Lưu hỏi đáp
      </button>
      {open ? (
        <form
          action={async (fd) => { await action(fd); setDone(true); }}
          style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6, minWidth: 260 }}
        >
          <input type="hidden" name="lead_id" value={leadId} />
          <select name="product_group" className="note" defaultValue={defaultGroup}>
            {groups.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
          <input name="question" className="note" defaultValue={question} placeholder="Câu hỏi" required />
          <textarea name="answer" className="note" rows={3} placeholder="Câu trả lời đã dùng" required />
          <input name="source" className="note" placeholder="Nguồn (ai cấp info)" />
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn ok sm" type="submit">Lưu</button>
            <button className="btn ghost sm" type="button" onClick={() => setOpen(false)}>Đóng</button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
