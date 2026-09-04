import { savePostingPlanAction, savePostingOverrideAction, clearPostingOverrideAction } from './goal-actions';
import {
  DOW_ORDER, DOW_LONG, DOW_SHORT, MAX_SLOTS_PER_DAY, CHANNEL_LABEL, todayVNDate,
  type LoadedPostingPlan, type PostingSlot,
} from '../../lib/posting-plan';

// Khối "🗓 Lịch đăng cố định" ở /ke-hoach (user 4/9). Form thuần (không client state): mỗi thứ
// 4 ô, ô bật bằng checkbox. Lưu -> goal-actions.savePostingPlanAction. Phần "Sửa riêng một ngày"
// ghi overrides[date] (chỉ ngày đó khác).
function SlotRow({ prefix, i, slot, groups }: { prefix: string; i: number; slot: PostingSlot | null; groups: LoadedPostingPlan['shareGroups'] }) {
  return (
    <div className="pp-slot">
      <label className="pp-on" title="Bật ô này">
        <input type="checkbox" name={`${prefix}_${i}_on`} value="1" defaultChecked={!!slot} />
        <span>Bài {i + 1}</span>
      </label>
      <input type="time" name={`${prefix}_${i}_time`} defaultValue={slot?.time || (i === 0 ? '08:00' : '14:00')} aria-label="Giờ đăng" />
      <select name={`${prefix}_${i}_kind`} defaultValue={slot?.kind || 'sale'} aria-label="Loại bài">
        <option value="sale">Bài bán</option>
        <option value="content">Bài content</option>
      </select>
      <select name={`${prefix}_${i}_channel`} defaultValue={slot?.channel || 'facebook'} aria-label="Kênh đăng">
        <option value="facebook">{CHANNEL_LABEL.facebook}</option>
        <option value="youtube">{CHANNEL_LABEL.youtube} (cần folder có clip)</option>
      </select>
      <select name={`${prefix}_${i}_group`} defaultValue={slot?.group_id || ''} aria-label="Group chia sẻ tay">
        <option value="">Không chia sẻ group</option>
        {groups.map((g) => <option key={g.id} value={g.id}>👥 {g.label}</option>)}
      </select>
    </div>
  );
}

export default function PostingPlanForm({ pp }: { pp: LoadedPostingPlan }) {
  const today = todayVNDate();
  const ovDates = Object.keys(pp.plan.overrides || {}).sort();
  const ovToday = pp.plan.overrides?.[today] || null;
  return (
    <section className="blk" id="lich-dang">
      <h2>
        🗓 Lịch đăng cố định
        <span className="sub">giờ, kênh và group của TỪNG bài mỗi ngày · máy sinh bài theo đúng lịch này, BOSS không tự đổi</span>
      </h2>
      {!pp.saved ? (
        <p className="sub" style={{ margin: '0 0 8px' }}>⚠️ Chưa lưu lần nào, đang dùng lịch mặc định (8h 1 bài bán, 14h 1 bài bán + 1 content, Facebook). Bấm Lưu để cố định.</p>
      ) : (
        <p className="sub" style={{ margin: '0 0 8px' }}>Đã lưu {pp.plan.updated_at ? new Date(pp.plan.updated_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : ''}. Ô giờ trước 12h máy viết lúc 8h, từ 12h máy viết lúc 14h; giờ ghi ở đây sẽ được điền sẵn vào ô hẹn giờ khi Duyệt.</p>
      )}
      <form action={savePostingPlanAction}>
        <div className="tablewrap">
          <table className="datatable pp-table">
            <thead><tr><th style={{ width: 90 }}>Ngày</th><th>Các bài trong ngày (bật ô, chọn giờ, loại, kênh, group)</th></tr></thead>
            <tbody>
              {DOW_ORDER.map((d) => {
                const slots = pp.plan.days[String(d)]?.slots || [];
                return (
                  <tr key={d}>
                    <td><b>{DOW_SHORT[d]}</b><div className="sub">{DOW_LONG[d]}</div></td>
                    <td>
                      {Array.from({ length: MAX_SLOTS_PER_DAY }, (_, i) => (
                        <SlotRow key={i} prefix={`s_${d}`} i={i} slot={slots[i] || null} groups={pp.shareGroups} />
                      ))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 10 }}>
          <button className="btn ok" type="submit">💾 Lưu lịch đăng</button>
          <span className="sub">Group lấy từ danh sách ở popover 📣 Chia sẻ group (Quản lý bài viết). Kênh YouTube chỉ ra bài khi folder sản phẩm có clip gốc.</span>
        </div>
      </form>

      <details className="pp-override" style={{ marginTop: 14 }} open={!!ovToday}>
        <summary className="kh-summary">✏️ Sửa riêng một ngày <span className="sub">{ovDates.length ? `đang có lịch riêng: ${ovDates.join(', ')}` : 'chưa ngày nào có lịch riêng'}</span></summary>
        <form action={savePostingOverrideAction} style={{ marginTop: 10 }}>
          <label className="kh-inline"><span className="sub">Ngày</span><input type="date" name="ov_date" defaultValue={today} required style={{ maxWidth: 170 }} /></label>
          {Array.from({ length: MAX_SLOTS_PER_DAY }, (_, i) => (
            <SlotRow key={i} prefix="ov" i={i} slot={ovToday?.slots[i] || null} groups={pp.shareGroups} />
          ))}
          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <button className="btn ok sm" type="submit">Lưu lịch riêng ngày này</button>
          </div>
        </form>
        {ovDates.length ? (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
            {ovDates.map((d) => (
              <form key={d} action={clearPostingOverrideAction}>
                <input type="hidden" name="ov_date" value={d} />
                <button className="btn ghost sm" type="submit" title="Bỏ lịch riêng, ngày này quay về lịch theo thứ">✕ Bỏ lịch riêng {d.slice(8, 10)}/{d.slice(5, 7)}</button>
              </form>
            ))}
          </div>
        ) : null}
      </details>
    </section>
  );
}
