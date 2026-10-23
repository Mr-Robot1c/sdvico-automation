import { getServerClient } from '../../../lib/supabase-server';
import { vnInt } from '../../../lib/plan';
import { deletePlan } from '../../actions';
import { loadPlans, fmtDate, fmtDateTime } from '../shared';

export const dynamic = 'force-dynamic';

// TAB LỊCH SỬ (23/10, đường dẫn riêng thay ?tab=lich-su): các bản kế hoạch cũ, bấm để xem ở tab Hướng đi.
export default async function Page() {
  const { rows } = await loadPlans(getServerClient());
  const history = rows.filter((r) => r.origin !== 'live' && !r.applied);

  return (
    <section className="blk">
      <h2>Các bản kế hoạch cũ <span className="sub">{vnInt(history.length)} bản</span></h2>
      {history.length ? (
        <div className="tablewrap table-scroll" style={{ marginTop: 10 }}>
          <table className="datatable">
            <thead><tr><th>Sinh lúc</th><th>Loại</th><th className="center"></th></tr></thead>
            <tbody>
              {history.slice(0, 6).map((r) => (
                <tr key={r.id}>
                  <td><a href={`/ke-hoach/huong-di?xem=${r.id}`}>{fmtDateTime(r.created_at)}</a></td>
                  <td className="sub">{r.proposal ? `Đề xuất tuần ${fmtDate(r.proposal.week_start || null)}` : r.cadence === 'weekly' ? 'Tuần' : r.cadence === 'update' ? 'Cập nhật' : r.generated_by === 'cron' ? 'Tự động' : 'Tạo tay'}</td>
                  <td className="center">
                    <form action={deletePlan} style={{ display: 'inline' }}>
                      <input type="hidden" name="plan_id" value={r.id} />
                      <button className="btn no sm" type="submit" aria-label="Xóa kế hoạch">Xóa</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="sub" style={{ marginTop: 10 }}>Chưa có bản cũ nào.</p>}
      {history.length > 6 ? <p className="sub" style={{ margin: '8px 0 0' }}>Chỉ hiện 6 bản gần nhất.</p> : null}
    </section>
  );
}
