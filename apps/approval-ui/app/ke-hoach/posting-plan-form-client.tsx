'use client';
import { useFormState, useFormStatus } from 'react-dom';
import type { SaveReport } from './goal-actions';

// 15/9 (Thanh): "chỗ lưu lịch đăng phải có note / thông báo hiện lên mỗi khi tự động thêm hoặc
// xoá 1 bài". Bọc form Lịch đăng cố định bằng useFormState: server action trả về danh sách thay
// đổi (thêm/bỏ/đổi ô) -> hiện ngay dưới nút Lưu. Các ô (SlotTr) vẫn render phía server, truyền
// vào đây qua children.

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button className="btn ok" type="submit" disabled={pending}>{pending ? '⏳ Đang lưu...' : '💾 Lưu lịch đăng'}</button>
  );
}

export default function PostingPlanFormClient({
  action, children, hint,
}: {
  action: (prev: SaveReport, formData: FormData) => Promise<SaveReport>;
  children: React.ReactNode;
  hint: React.ReactNode;
}) {
  const [report, formAction] = useFormState(action, null as SaveReport);
  return (
    <form action={formAction}>
      {children}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 10 }}>
        <SaveButton />
        <span className="sub">{hint}</span>
      </div>
      {report ? (
        <div className={`save-report ${report.ok ? '' : 'err'}`} role="status">
          {report.ok ? <>✅ Đã lưu lịch — <b>{report.summary}</b>.</> : <>⛔ {report.summary}</>}
          {report.ok && report.changes.length ? (
            <ul>
              {report.changes.slice(0, 12).map((c, i) => <li key={i}>{c}</li>)}
              {report.changes.length > 12 ? <li>… và {report.changes.length - 12} thay đổi nữa</li> : null}
            </ul>
          ) : null}
          {report.ok && !report.changes.length ? <div className="sub">Lịch giữ nguyên số ô, giờ và nền tảng.</div> : null}
        </div>
      ) : null}
    </form>
  );
}
