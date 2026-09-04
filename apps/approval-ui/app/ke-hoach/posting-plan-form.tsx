import { savePostingPlanAction, savePostingOverrideAction, clearPostingOverrideAction, proposePostingPlanAction } from './goal-actions';
import {
  DOW_ORDER, DOW_LONG, DOW_SHORT, MAX_SLOTS_PER_DAY, CHANNEL_LABEL, todayVNDate,
  type LoadedPostingPlan, type PostingSlot,
} from '../../lib/posting-plan';
import { CONTENT_KIND_BY_DOW } from '../../lib/plan-live';

// Khối "🗓 Lịch đăng cố định" ở /ke-hoach.
// 4/9 khuya (user): (1) lịch do BOSS XẾP MỖI SÁNG THỨ 2 cho cả tuần, trong tuần đứng yên, chỉ
// người sửa/thêm hoặc bấm "🧠 BOSS xếp lại lịch"; (2) mỗi bài 1 HÀNG, cột tách rõ Bật | Giờ |
// Loại bài | Nền tảng | Group.
// Form thuần (không client state). Tên field s_<dow>_<i>_{on,time,kind,channel,group} giữ như đợt 1
// nên goal-actions.readSlots không đổi.

function fmtVN(iso?: string): string {
  if (!iso) return '';
  try {
    const p = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso));
    const g = (t: string) => p.find((x) => x.type === t)?.value || '';
    return `${g('hour')}:${g('minute')} ${g('day')}/${g('month')}`;
  } catch { return iso; }
}

// Một HÀNG = một bài. `dayCell` chỉ truyền ở hàng đầu của ngày (rowSpan).
function SlotTr({ prefix, i, slot, groups, dowIdx, dayCell }: {
  prefix: string; i: number; slot: PostingSlot | null; groups: LoadedPostingPlan['shareGroups']; dowIdx: number | null; dayCell?: React.ReactNode;
}) {
  const ck = dowIdx !== null ? CONTENT_KIND_BY_DOW[dowIdx] : null;
  return (
    <tr className={slot ? 'pp-row on' : 'pp-row'}>
      {dayCell !== undefined ? dayCell : null}
      <td className="pp-c-on">
        <label title="Bật ô này">
          <input type="checkbox" name={`${prefix}_${i}_on`} value="1" defaultChecked={!!slot} />
          {' '}Bài {i + 1}
        </label>
      </td>
      <td className="pp-c-time"><input type="time" name={`${prefix}_${i}_time`} defaultValue={slot?.time || (i === 0 ? '08:00' : i === 1 ? '14:00' : '19:30')} aria-label="Giờ đăng" /></td>
      <td className="pp-c-kind">
        <select name={`${prefix}_${i}_kind`} defaultValue={slot?.kind || (i === 2 ? 'content' : 'sale')} aria-label="Loại bài">
          <option value="sale">Bài bán</option>
          <option value="content">Bài content</option>
        </select>
        {slot?.kind === 'content' && ck ? <div className="sub" style={{ fontSize: '.76rem', marginTop: 2 }}>{ck.label}</div> : null}
      </td>
      <td className="pp-c-channel">
        <select name={`${prefix}_${i}_channel`} defaultValue={slot?.channel || 'facebook'} aria-label="Nền tảng đăng">
          <option value="facebook">{CHANNEL_LABEL.facebook}</option>
          <option value="youtube">{CHANNEL_LABEL.youtube}</option>
        </select>
      </td>
      <td className="pp-c-group">
        <select name={`${prefix}_${i}_group`} defaultValue={slot?.group_id || ''} aria-label="Group chia sẻ tay">
          <option value="">Không chia sẻ group</option>
          {groups.map((g) => <option key={g.id} value={g.id}>👥 {g.label}</option>)}
        </select>
      </td>
    </tr>
  );
}

function SlotHead() {
  return (
    <thead>
      <tr>
        <th style={{ width: 84 }}>Ngày</th>
        <th style={{ width: 84 }}>Bật</th>
        <th style={{ width: 110 }}>Giờ đăng</th>
        <th style={{ width: 150 }}>Loại bài</th>
        <th style={{ width: 170 }}>Nền tảng</th>
        <th>Chia sẻ group (tay)</th>
      </tr>
    </thead>
  );
}

export default function PostingPlanForm({ pp }: { pp: LoadedPostingPlan }) {
  const today = todayVNDate();
  const ovDates = Object.keys(pp.plan.overrides || {}).sort();
  const ovToday = pp.plan.overrides?.[today] || null;
  const src = pp.plan.source || 'default';
  const ws = pp.plan.week_start || '';
  const weekLabel = ws ? `tuần ${ws.slice(8, 10)}/${ws.slice(5, 7)}` : 'tuần này';
  const statusLine = !pp.saved || src === 'default'
    ? '⚠️ Chưa có lịch tuần này. Cron giờ tới sẽ tự xếp, hoặc bấm "BOSS xếp lịch" ngay: BOSS chia giờ, nền tảng, group cho cả tuần rồi lịch đứng yên tới sáng Thứ 2 tuần sau.'
    : src === 'boss'
      ? `🧠 BOSS xếp ${weekLabel} lúc ${fmtVN(pp.plan.proposed_at)} — cố định trong tuần, sáng Thứ 2 tuần sau BOSS ra bản mới. Sửa ô nào thì sửa rồi bấm Lưu.`
      : `✍️ Bạn sửa ${weekLabel} lúc ${fmtVN(pp.plan.updated_at)}${pp.plan.proposed_at ? ` (BOSS xếp gốc ${fmtVN(pp.plan.proposed_at)})` : ''} — giữ tới sáng Thứ 2 tuần sau.`;

  return (
    <section className="blk" id="lich-dang">
      <h2>
        🗓 Lịch đăng cố định
        <span className="sub">BOSS xếp mỗi sáng Thứ 2 cho cả tuần: giờ, loại bài, nền tảng, group chia đều để không loãng · trong tuần đứng yên, chỉ bạn sửa hoặc thêm</span>
      </h2>
      <div className="kh-strip" style={{ marginBottom: 8 }}>
        <span className="grow sub">{statusLine}</span>
        <form action={proposePostingPlanAction}>
          <button className={`btn sm ${pp.saved && src !== 'default' ? 'ghost' : 'ok'}`} type="submit" title="BOSS chia lại giờ / nền tảng / group cho cả tuần theo group hiện có và điều kiện YouTube. Các ngày đã Sửa riêng được giữ.">
            🧠 {pp.saved && src !== 'default' ? 'BOSS xếp lại lịch' : 'BOSS xếp lịch'}
          </button>
        </form>
      </div>
      {pp.plan.notes?.length ? (
        <ul className="pp-notes">
          {pp.plan.notes.map((n, i) => <li key={i}>{n}</li>)}
        </ul>
      ) : null}

      <form action={savePostingPlanAction}>
        <div className="tablewrap">
          <table className="datatable pp-table">
            <SlotHead />
            <tbody>
              {DOW_ORDER.map((d) => {
                const slots = pp.plan.days[String(d)]?.slots || [];
                return Array.from({ length: MAX_SLOTS_PER_DAY }, (_, i) => (
                  <SlotTr
                    key={`${d}-${i}`} prefix={`s_${d}`} i={i} slot={slots[i] || null} groups={pp.shareGroups} dowIdx={d}
                    dayCell={i === 0 ? <td rowSpan={MAX_SLOTS_PER_DAY} className="pp-c-day"><b>{DOW_SHORT[d]}</b><div className="sub">{DOW_LONG[d]}</div></td> : undefined}
                  />
                ));
              })}
            </tbody>
          </table>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 10 }}>
          <button className="btn ok" type="submit">💾 Lưu lịch đăng</button>
          <span className="sub">Ô giờ trước 12h máy viết lúc 8h, từ 12h máy viết lúc 14h; giờ ở đây được điền sẵn vào ô hẹn giờ khi Duyệt. Group lấy từ popover 📣 Chia sẻ group. YouTube chỉ ra bài khi folder sản phẩm có clip.</span>
        </div>
      </form>

      <details className="pp-override" style={{ marginTop: 14 }} open={!!ovToday}>
        <summary className="kh-summary">✏️ Sửa riêng một ngày <span className="sub">{ovDates.length ? `đang có lịch riêng: ${ovDates.join(', ')}` : 'chưa ngày nào có lịch riêng'}</span></summary>
        <form action={savePostingOverrideAction} style={{ marginTop: 10 }}>
          <label className="kh-inline"><span className="sub">Ngày</span><input type="date" name="ov_date" defaultValue={today} required style={{ maxWidth: 170 }} /></label>
          <div className="tablewrap" style={{ marginTop: 8 }}>
            <table className="datatable pp-table">
              <SlotHead />
              <tbody>
                {Array.from({ length: MAX_SLOTS_PER_DAY }, (_, i) => (
                  <SlotTr key={i} prefix="ov" i={i} slot={ovToday?.slots[i] || null} groups={pp.shareGroups} dowIdx={null}
                    dayCell={i === 0 ? <td rowSpan={MAX_SLOTS_PER_DAY} className="pp-c-day sub">ngày chọn ở trên</td> : undefined} />
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <button className="btn ok sm" type="submit">Lưu lịch riêng ngày này</button>
          </div>
        </form>
        {ovDates.length ? (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
            {ovDates.map((d) => (
              <form key={d} action={clearPostingOverrideAction}>
                <input type="hidden" name="ov_date" value={d} />
                <button className="btn ghost sm" type="submit" title="Bỏ lịch riêng, ngày này quay về lịch cố định">✕ Bỏ lịch riêng {d.slice(8, 10)}/{d.slice(5, 7)}</button>
              </form>
            ))}
          </div>
        ) : null}
      </details>
    </section>
  );
}
