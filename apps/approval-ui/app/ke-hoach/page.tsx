import { getServerClient } from '../../lib/supabase-server';
import type { Plan, Tier } from '../../lib/plan';
import { vnInt, vnDec1 } from '../../lib/plan';
import { generatePlanNow, applyPlanWeights, clearPlanWeights, deletePlan } from '../actions';
import { saveWeeklyGoal, saveFocus } from './goal-actions';
import GenerateButton from './generate-button';

export const dynamic = 'force-dynamic';

// TRANG KE HOACH sap xep lai 20/8 (user: "gon gang - the hien day du cac plan"):
//   1. HOM NAY: dang san pham nao may bai, content, chia se nhom nao (tu de xuat song).
//   2. KE HOACH TUAN: bang 7 ngay + so bai moi san pham.
//   3. HUONG DI BAI VIET: cac goc bai BOSS de xuat tu tri thuc (dung/chua dung).
//   4. CAI DAT (thu gon): muc tieu tuan, san pham tap trung, nhom chia se.
//   5. Chi tiet + lich su: giau trong <details>, bam moi xo ra.

type Row = {
  id: string;
  period_start: string | null;
  period_end: string | null;
  generated_by: string;
  data: Plan;
  applied: boolean;
  applied_at: string | null;
  created_at: string;
};

const TIER_LABEL: Record<Tier, { text: string; icon: string; cls: string }> = {
  winner: { text: 'Đẩy mạnh', icon: '🏆', cls: 'tone-ok' },
  watch: { text: 'Giữ nhịp', icon: '➖', cls: 'tone-default' },
  weak: { text: 'Đổi góc', icon: '⚠️', cls: 'tone-no' },
  insufficient: { text: 'Gom số liệu', icon: '⏳', cls: 'tone-default' }
};

function fmtDateTime(iso: string | null): string {
  if (!iso) return '';
  // Tự ghép "HH:mm dd/mm" — toLocaleString('vi-VN') trên Node trả "16:10 20-08" (gạch).
  try {
    const p = new Intl.DateTimeFormat('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(new Date(iso));
    const g = (t: string) => p.find((x) => x.type === t)?.value || '';
    return `${g('hour')}:${g('minute')} ${g('day')}/${g('month')}`;
  } catch { return iso; }
}

function fmtDate(d: string | null): string {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  return day && m && y ? `${day}/${m}/${y}` : d;
}

function todayVN(): string {
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

export default async function Page({ searchParams }: { searchParams?: { xem?: string } }) {
  const client = getServerClient();
  const [{ data, error }, { data: goalRow }, { data: focusRow }, { data: sgRow }] = await Promise.all([
    client
      .from('mkt_plans')
      .select('id, period_start, period_end, generated_by, data, applied, applied_at, created_at')
      .order('created_at', { ascending: false })
      .limit(12),
    client.from('app_config').select('value').eq('key', 'mkt_weekly_goal').maybeSingle(),
    client.from('app_config').select('value').eq('key', 'mkt_focus').maybeSingle(),
    client.from('app_config').select('value').eq('key', 'mkt_share_groups').maybeSingle()
  ]);
  const goalText = ((goalRow as any)?.value?.text as string) || '';
  const focusVal = ((focusRow as any)?.value || {}) as { groups?: string[]; until?: string };
  const focusGroups = Array.isArray(focusVal.groups) ? focusVal.groups : [];
  const focusUntil = focusVal.until ? String(focusVal.until).slice(0, 10) : '';
  const focusActive = focusGroups.length > 0 && (!focusVal.until || new Date(focusVal.until).getTime() > Date.now());
  // Nhóm chia sẻ: nguồn CHUNG với popover 📣 ở Quản lý bài viết (app_config qua /api/share-groups).
  // Phần tử có thể là object {id,label,url} — lấy label hiển thị.
  const shareGroupsRaw = Array.isArray((sgRow as any)?.value?.groups) ? (sgRow as any).value.groups : [];
  const shareGroups: string[] = shareGroupsRaw
    .map((x: any) => (typeof x === 'string' ? x.trim() : String(x?.label || x?.id || '').trim()))
    .filter(Boolean);

  const rowsInit = (data || []) as Row[];
  const planRows = rowsInit.filter((r) => r.data?.origin !== 'live');
  // 24/8 (user: "ke hoach tuan dau, huong di dau"): ban live thuong bi 12+ ban manual/update
  // ep sinh de bug day khoi limit 12 -> UI trong. Query rieng dam bao luon co.
  let liveProposal = rowsInit.find((r) => r.data?.origin === 'live');
  if (!liveProposal) {
    const { data: liveRow } = await client
      .from('mkt_plans')
      .select('id, period_start, period_end, generated_by, data, applied, applied_at, created_at')
      .eq('data->>origin', 'live')
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (liveRow) liveProposal = liveRow as Row;
  }
  const liveData = liveProposal?.data;
  const rows = rowsInit;
  const appliedRow = rows.find((r) => r.applied);
  const learnSuggestion = rows.find((r) => r.data?.origin === 'learn-weekly' && !r.applied);

  // ?xem=<id>: xem lai ban cu trong khoi chi tiet.
  const viewId = searchParams?.xem || null;
  let viewing: Row | null = viewId ? rows.find((r) => r.id === viewId) || null : null;
  if (viewId && !viewing) {
    const { data: one } = await client
      .from('mkt_plans')
      .select('id, period_start, period_end, generated_by, data, applied, applied_at, created_at')
      .eq('id', viewId)
      .maybeSingle();
    viewing = (one as Row) || null;
  }
  const latest = viewing || planRows[0];
  const history = planRows.filter((r) => r.id !== latest?.id);

  // Hom nay lam gi (tu lich cua de xuat song).
  const today = todayVN();
  const todayPlan = liveData?.daily_schedule?.find((d) => d.date === today) || null;

  // Bang chung hom nay may DA sinh bai theo huong nao (user 20/8: "tao huong di ma cha thay
  // dung"): doc mkt_content sinh hom nay co brief.suggestion_title. Huong da dung nam o ban
  // ke hoach TRUOC (bi thay giua ngay) van hien duoc o day.
  const dayStartIso = new Date(new Date(today + 'T00:00:00+07:00')).toISOString();
  const { data: todayGen } = await client
    .from('mkt_content')
    .select('brief')
    .gte('created_at', dayStartIso)
    .eq('brief->>generator', 'rotation')
    .limit(20);
  const usedTodayTitles = [...new Set(
    (todayGen || [])
      .map((r: any) => String(r.brief?.suggestion_title || '').trim())
      .filter(Boolean)
  )];

  // ĐĂNG LẠI BÀI CŨ ĂN KHÁCH (user 20/8: "máy tự đề xuất đăng lại bài cũ ăn khách"):
  // bài đã đăng từ 7 ngày trước trở lên, lấy tương tác từ snapshot metric mới nhất, chọn top 3.
  // Máy chỉ ĐỀ XUẤT — người mở bài, copy, chia sẻ lại (nút 📣 ở Quản lý bài viết).
  const sevenDaysAgoIso = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const { data: oldPosts } = await client
    .from('mkt_posts')
    .select('content_id, external_url, published_at')
    .eq('status', 'published').eq('channel', 'facebook')
    .not('external_url', 'is', null)
    .lt('published_at', sevenDaysAgoIso)
    .order('published_at', { ascending: false })
    .limit(60);
  const oldCids = [...new Set((oldPosts || []).map((p: any) => p.content_id).filter(Boolean))] as string[];
  let repostSuggestions: Array<{ title: string; url: string; publishedAt: string; engagement: number }> = [];
  if (oldCids.length) {
    const [{ data: oldMetrics }, { data: oldContents }] = await Promise.all([
      client.from('mkt_metrics').select('entity_ref, metrics, created_at')
        .eq('source', 'facebook').in('entity_ref', oldCids)
        .order('created_at', { ascending: false }).limit(300),
      client.from('mkt_content').select('id, title').in('id', oldCids)
    ]);
    const engOf = new Map<string, number>();
    for (const r of oldMetrics || []) {
      const cid = (r as any).entity_ref as string;
      if (!engOf.has(cid)) engOf.set(cid, Number((r as any).metrics?.engagement) || 0);
    }
    const titleOf = new Map((oldContents || []).map((c: any) => [c.id, String(c.title || '(không tên)')]));
    const urlOf = new Map<string, { url: string; at: string }>();
    for (const p of oldPosts || []) {
      const cid = (p as any).content_id as string;
      if (cid && !urlOf.has(cid)) urlOf.set(cid, { url: String((p as any).external_url), at: String((p as any).published_at || '') });
    }
    repostSuggestions = oldCids
      .filter((cid) => titleOf.has(cid) && (engOf.get(cid) || 0) > 0)
      .map((cid) => ({ title: titleOf.get(cid)!, url: urlOf.get(cid)!.url, publishedAt: urlOf.get(cid)!.at, engagement: engOf.get(cid) || 0 }))
      .sort((a, b) => b.engagement - a.engagement)
      .slice(0, 3);
  }

  // Huong di bai viet tu ban DANG AP (content_suggestions).
  const suggestions = appliedRow?.data?.content_suggestions || [];
  const sugFresh = suggestions.filter((s) => !s.used_at);
  // Hướng MỚI của bản đang áp = chưa dùng và KHÔNG mang cờ carried (giữ lại từ bản trước).
  // Bấm "Tạo kế hoạch ngay" xong nhìn số này + badge ✨ là biết có gì mới (user 21/8).
  const sugNew = sugFresh.filter((s) => (s as any).carried !== true && !(s as any).pending_variant);
  const appliedGeneratedAt = String(appliedRow?.data?.generatedAt || '');
  const fmtGenAt = (() => {
    const d = new Date(appliedGeneratedAt);
    if (Number.isNaN(d.getTime())) return '';
    const p = new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', timeZone: 'Asia/Ho_Chi_Minh', hourCycle: 'h23' }).formatToParts(d);
    const g = (t: string) => p.find((x) => x.type === t)?.value || '';
    return `${g('hour')}:${g('minute')} ${g('day')}/${g('month')}`;
  })();
  // Hướng bị TỪ CHỐI bản thử (rejected) tách khỏi "xong cặp" — user 21/8: hướng vừa bị
  // loại mà hiện "✓ xong cặp A + B" là sai bản chất.
  const sugRejected = suggestions.filter((s) => s.used_at && (s as any).rejected === true);
  const sugUsed = suggestions.filter((s) => s.used_at && (s as any).rejected !== true);

  // Sắp hướng đi THEO LỊCH TUẦN (user 24/8: "hướng đi sắp xếp đi theo với kế hoạch"): hướng nào
  // lịch xếp ngày nào thì đứng theo thứ tự ngày đó (kèm chip ngày); chưa vào lịch xếp sau; xong
  // cặp và đã loại xuống cuối cùng.
  const schedOrder = new Map<string, { idx: number; dow: string; date: string }>();
  (liveData?.daily_schedule || []).forEach((d: any, i: number) => {
    const t = String(d.direction?.title || '').trim().toLowerCase();
    if (t && !schedOrder.has(t)) schedOrder.set(t, { idx: i, dow: d.dow, date: d.date });
  });
  const sugKeyOf = (s: any) => String(s.title || '').trim().toLowerCase();
  const orderedSuggestions = [
    ...sugFresh.slice().sort((a, b) => (schedOrder.get(sugKeyOf(a))?.idx ?? 99) - (schedOrder.get(sugKeyOf(b))?.idx ?? 99)),
    ...sugUsed,
    ...sugRejected,
  ];

  return (
    <main>
      <header className="head-row">
        <div>
          <h1>Kế hoạch</h1>
          <p className="sub">
            Chủ nhật 19h BOSS học số liệu tuần, Thứ 2 8h ra kế hoạch tuần, mỗi tối 19h điều chỉnh nhẹ theo số liệu từng ngày. Bài vẫn chờ người bấm Duyệt mới đăng.
          </p>
        </div>
        <div className="head-actions">
          <GenerateButton action={generatePlanNow} />
        </div>
      </header>

      {error ? <p className="err" role="alert">Lỗi tải dữ liệu: {error.message}</p> : null}

      {/* ===== 0. MUC TIEU + FOCUS ngay dau (user 24/8: cai dat phai co tac dung ngay + dong nhat) ===== */}
      <section className="plan-card goal-block" style={{ marginBottom: 14 }}>
        <div className="goal-row">
          <form action={saveWeeklyGoal} className="goal-form">
            <label>
              <b>🎯 Mục tiêu tuần</b>
              <textarea name="goal_text" defaultValue={goalText} rows={2} placeholder="Ví dụ: tuần này ưu tiên lọc dầu SF-50, cần 20 cuộc gọi về tổng đài." />
            </label>
            <button className="btn ok sm" type="submit">Lưu mục tiêu</button>
          </form>
          <form action={saveFocus} className="goal-form">
            <label>
              <b>🎯 Chỉ đăng sản phẩm</b>
              <input name="focus_groups" defaultValue={focusGroups.join(', ')} placeholder="lọc dầu, lọc nước" />
              <span className="sub" style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                đến hết <input type="date" name="focus_until" defaultValue={focusUntil} style={{ maxWidth: 150 }} />
              </span>
            </label>
            <button className="btn ok sm" type="submit">Lưu tập trung</button>
          </form>
        </div>
        {(() => {
          const total = (appliedRow?.data?.content_suggestions || []).length;
          if (!focusActive || !total) return null;
          const keys = focusGroups.map((g) => String(g).toLowerCase().trim());
          const inFocus = (appliedRow!.data.content_suggestions || []).filter((sg: any) => {
            const pn = String(sg.product || '').toLowerCase();
            return keys.some((k) => pn === k || pn.includes(k) || k.includes(pn));
          }).length;
          const allIn = inFocus === total;
          return (
            <p className="sub" style={{ margin: '10px 0 0' }}>
              {allIn ? '✅' : '⚠️'} <b>{inFocus}/{total}</b> hướng đi bám đúng sản phẩm tập trung ({focusGroups.join(', ')}){focusUntil ? ` — đến ${fmtDate(focusUntil)}` : ''}. {allIn ? 'Kế hoạch đồng nhất với mục tiêu.' : 'Còn hướng cũ chưa bám focus — bấm "Lưu tập trung" để sinh lại.'}
            </p>
          );
        })()}
      </section>

      {/* ===== De xuat hoc tuan (Chu nhat) — chi hien khi co ===== */}
      {learnSuggestion ? (
        <section className="plan-card" style={{ borderLeft: '6px solid var(--ok, #1a9e6f)', marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 320px' }}>
              <b>🧪 Đề xuất cuối tuần từ số liệu</b>
              <p className="sub" style={{ margin: '4px 0' }}>
                Sinh lúc {fmtDateTime(learnSuggestion.created_at)}. {(learnSuggestion.data.narrative || [])[0] || ''}
              </p>
            </div>
            <form action={applyPlanWeights}>
              <input type="hidden" name="plan_id" value={learnSuggestion.id} />
              <button className="btn ok" type="submit">Áp dụng đề xuất</button>
            </form>
          </div>
        </section>
      ) : null}

      {/* ===== 0b. NHOM CHIA SE (24/8: user "nhom chia se cung dem len tren luon"; cung cum cau hinh) ===== */}
      <details className="plan-card" style={{ marginBottom: 14 }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '1.02rem' }}>
          👥 Nhóm chia sẻ Facebook
          <span className="sub" style={{ fontWeight: 400, marginLeft: 8 }}>{shareGroups.length} nhóm — quản lý ở Quản lý bài viết</span>
        </summary>
        <p className="sub" style={{ margin: '10px 0 6px' }}>
          Dùng chung với nút <b>📣 Chia sẻ vào group</b> ở trang Quản lý bài viết — thêm, xóa, đổi tên nhóm ở đó. BOSS đọc danh sách này để xếp lịch chia sẻ theo ngày.
        </p>
        {shareGroups.length ? (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {shareGroups.map((g) => (<span key={g} className="badge tone-default">👥 {g}</span>))}
          </div>
        ) : (
          <p className="sub" style={{ margin: 0 }}>Chưa có nhóm nào. Mở <a href="/noi-dung">Quản lý bài viết</a> để thêm.</p>
        )}
      </details>

            {/* ===== 1. HOM NAY ===== */}
      <section className="plan-card" style={{ borderLeft: '6px solid var(--accent, #1f5fbf)', marginBottom: 14 }}>
        <b style={{ fontSize: '1.05rem' }}>📌 Hôm nay ({fmtDate(today)})</b>
        {todayPlan ? (
          <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
            <div>
              <b>🕗 Bài bán:</b>{' '}
              {todayPlan.direction ? (
                <>
                  {todayPlan.direction.title}
                  <span className="sub"> — {todayPlan.direction.variant === 'AB' ? 'bản A ra 7h, bản B ra 12h30' : `bản thử ${todayPlan.direction.variant}`}</span>
                  {todayPlan.direction.done ? <span className="badge tone-ok" style={{ marginLeft: 6 }}>✓ đã sinh</span> : null}
                </>
              ) : (todayPlan.sales.length
                ? todayPlan.sales.map((s) => `${s.product} (${vnInt(s.count)} bài)`).join(', ')
                : 'không có bài bán hôm nay')}
            </div>
            <div>
              <b>🕐 Content 12h30:</b> <span title={todayPlan.contentStructure || ''}>{todayPlan.contentKindLabel || vnInt(todayPlan.contentCount)}</span>
              {(todayPlan as any).contentPurpose ? <span className="sub"> — để {(todayPlan as any).contentPurpose}</span> : null}
            </div>
            <div>
              <b>📣 Chia sẻ vào nhóm:</b>{' '}
              {todayPlan.groups.length ? todayPlan.groups.join(', ') : (shareGroups.length ? 'nghỉ hôm nay' : 'chưa nhập nhóm (mở Cài đặt bên dưới)')}
            </div>
            <p className="sub" style={{ margin: 0 }}>
              Máy tự sinh rồi chờ trong Hàng đợi duyệt. Người bấm Duyệt và tự tay chia sẻ vào nhóm (Facebook không cho máy đăng nhóm).
            </p>
          </div>
        ) : (
          <p className="sub" style={{ margin: '6px 0 0' }}>
            Chưa có lịch hôm nay. Đề xuất sống sẽ tự sinh trong vòng 30 phút tới, hoặc lưu lại Cài đặt bên dưới để sinh ngay.
          </p>
        )}
      </section>

      {/* ===== 2. KE HOACH TUAN ===== */}
      {liveData ? (
        <section className="plan-card" style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'baseline' }}>
            <b style={{ fontSize: '1.05rem' }}>📆 Kế hoạch tuần</b>
            {/* Bản live UPDATE TẠI CHỖ nên created_at của row đứng im từ lần tạo đầu — phải
                đọc data.generatedAt mới ra giờ làm mới thật (user 21/8: "chỗ này hết cập nhật"). */}
            <span className="sub">Cập nhật {fmtDateTime((liveData as any).generatedAt || liveProposal!.created_at)} · tự làm mới mỗi 30 phút</span>
          </div>

          {liveData.products?.length ? (
            <div className="tablewrap" style={{ marginTop: 10 }}>
              {/* Cột "Bài/tuần" cũ (phân bổ lý thuyết) gây hiểu lầm "lịch bảo 2 bài SEA-40 mà
                  máy sinh 1 bài lọc dầu" — thay bằng Ưu tiên (trọng số BOSS chấm): trọng số
                  cao thì HƯỚNG của sản phẩm đó được rút trước trong hàng đợi bên dưới. */}
              <table className="datatable">
                <thead><tr><th>Sản phẩm</th><th className="num">Ưu tiên</th><th className="num">Tương tác/bài</th><th>Hướng</th></tr></thead>
                <tbody>
                  {liveData.products.map((p) => {
                    const t = TIER_LABEL[p.tier];
                    return (
                      <tr key={p.product}>
                        <td>{p.product}</td>
                        <td className="num" title="Trọng số BOSS chấm từ số liệu. Cao hơn thì hướng đi của sản phẩm này được xếp chạy trước."><b>×{vnInt(p.weight)}</b></td>
                        <td className="num">{p.avgEng > 0 ? vnInt(p.avgEng) : '—'}</td>
                        <td><span className={`badge ${t.cls}`}>{t.icon} {t.text}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}

          {liveData.daily_schedule?.length ? (
            <div className="tuan-days">
              <div className="tuan-days-head">
                <span>Ngày</span>
                <span>Hướng đi + bài bán (7h + 12h30)</span>
                <span>Content 12h30</span>
                <span>Nhóm chia sẻ</span>
              </div>
              {liveData.daily_schedule.map((d) => {
                const dayTitle = d.direction?.title || (d.sales.length ? d.sales.map((s) => s.product).join(' + ') : '—');
                const kind = (d as any).contentKindLabel || 'Content';
                const dayProduct = d.direction?.product || (d.sales[0]?.product || '—');
                return (
                  <details key={d.date} className={`tuan-day ${d.date === today ? 'is-today' : ''}`}>
                    <summary className="tuan-day-summary">
                      <span className="tuan-col tuan-col-date">
                        {d.date === today ? '👉 ' : ''}<b>{d.dow.replace('Chủ nhật', 'CN').replace('Thứ ', 'T')}</b> <span className="sub">{fmtDate(d.date).slice(0, 5)}</span>
                      </span>
                      <span className="tuan-col tuan-col-huong">
                        {d.direction ? (
                          <>
                            <b>{d.direction.title}</b>
                            {d.direction.done ? <span className="badge tone-ok" style={{ marginLeft: 6 }}>✓ đã sinh</span> : null}
                            <span className="sub" style={{ display: 'block', marginTop: 2 }}>{d.direction.product}{d.direction.variant === 'AB' ? ' · A 7h + B 12h30' : ` · ${d.direction.variant}`}</span>
                          </>
                        ) : (
                          <>{d.sales.length ? d.sales.map((s) => `${s.product} ×${s.count}`).join(' + ') : '—'}</>
                        )}
                      </span>
                      <span className="tuan-col tuan-col-content">
                        <b>{kind}</b>{(d as any).contentPurpose ? <span className="sub" style={{ display: 'block', marginTop: 2 }}>để {(d as any).contentPurpose}</span> : null}
                      </span>
                      <span className="tuan-col tuan-col-nhom sub">
                        {d.groups.length ? d.groups.slice(0, 2).join(', ') + (d.groups.length > 2 ? ` +${d.groups.length - 2}` : '') : '—'}
                      </span>
                      <span className="tuan-col-caret" aria-hidden="true">▾</span>
                    </summary>
                    <div className="tuan-day-body">
                      <div className="day-block">
                        <b>🕗 7:00 — Bản A (bài bán)</b>
                        <div>Hướng đi: <b>{dayTitle}</b></div>
                        <div>Sản phẩm: {dayProduct}</div>
                        <div>Insight xoáy: <span className="sub">máy tự chọn 1 nỗi khách hàng chưa dùng gần đây</span></div>
                        <div>Kênh: <b>Facebook (Post + Reel), YouTube Shorts, TikTok</b></div>
                      </div>
                      <div className="day-block">
                        <b>🕐 12:30 — Bản B (bài bán A/B)</b>
                        <div>Cùng hướng <b>{dayTitle}</b>, cùng sản phẩm nhưng <b>xoáy insight khác</b> để đo bản nào bà con thích hơn</div>
                        <div>Kênh: <b>Facebook (Post + Reel), YouTube Shorts, TikTok</b></div>
                      </div>
                      <div className="day-block">
                        <b>🕐 12:30 — Content {kind}</b>
                        {(d as any).contentPurpose ? <div>Mục đích: <b>{(d as any).contentPurpose}</b></div> : null}
                        {(d as any).contentStructure ? <div className="sub">Cấu trúc: {(d as any).contentStructure}</div> : null}
                        <div>Kênh: <b>Facebook</b> (nuôi trang, không A/B)</div>
                      </div>
                      {d.groups.length ? (
                        <div className="day-block">
                          <b>📣 Chia sẻ vào nhóm hôm nay</b>
                          <ul style={{ margin: '4px 0 0 18px', padding: 0 }}>
                            {d.groups.map((g) => <li key={g}>{g}</li>)}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                  </details>
                );
              })}
            </div>
          ) : null}
          <p className="sub" style={{ margin: '8px 0 0' }}>
            Bài bán viết theo khung: mở nỗi lo thật, 1-2 lợi ích đúng sản phẩm, mời nhắn Page hoặc gọi 1900 23 23 49. Hướng của sản phẩm được ưu tiên cao xếp chạy trước; sếp đổi mục tiêu giữa tuần thì lịch tự xếp lại. Bài luôn chờ người bấm Duyệt mới đăng.
          </p>
        </section>
      ) : null}

      {/* ===== 3. HUONG DI BAI VIET — bang gon (user 24/8: list roi mat) ===== */}
      {suggestions.length ? (
        <section className="plan-card" style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'baseline' }}>
            <b style={{ fontSize: '1.05rem' }}>🧭 Hướng đi bài viết</b>
            <span className="sub">
              {vnInt(sugFresh.filter((s) => !(s as any).pending_variant).length)} chưa dùng · {vnInt(sugFresh.filter((s) => (s as any).pending_variant).length)} đang thử · {vnInt(sugUsed.length)} xong{sugRejected.length ? ` · ${vnInt(sugRejected.length)} đã loại` : ''}
              {sugNew.length ? <> · <b>{vnInt(sugNew.length)} mới ✨</b></> : null}
            </span>
          </div>
          <div className="tablewrap" style={{ marginTop: 10 }}>
            <table className="datatable dir-table">
              <thead>
                <tr>
                  <th style={{ width: 90 }}>Ngày</th>
                  <th>Hướng đi</th>
                  <th>Sản phẩm</th>
                  <th style={{ width: 130 }}>Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {orderedSuggestions.map((d, i) => {
                  const day = schedOrder.get(sugKeyOf(d));
                  const status = (d as any).rejected === true
                    ? { text: '⛔ đã loại', tone: 'no' }
                    : d.used_at
                    ? { text: '✓ xong cặp', tone: 'ok' }
                    : (d as any).pending_variant
                    ? { text: '🧪 chờ B', tone: 'demo' }
                    : (d as any).carried !== true
                    ? { text: '✨ mới', tone: 'ok' }
                    : { text: 'Chờ chạy', tone: 'default' };
                  return (
                    <tr key={i} style={d.used_at ? { opacity: 0.6 } : undefined} title={d.why || ''}>
                      <td className="sub" style={{ whiteSpace: 'nowrap' }}>
                        {day ? <span className="badge">{day.dow.replace('Chủ nhật', 'CN').replace('Thứ ', 'T')} {fmtDate(day.date).slice(0, 5)}</span> : <span className="muted">—</span>}
                      </td>
                      <td className="cell-title">
                        <b>{d.title}</b>
                        {d.needs_gov_review ? <span className="badge tone-no" style={{ marginLeft: 6 }}>⚠️ QL</span> : null}
                      </td>
                      <td className="sub">{d.product}</td>
                      <td><span className={`badge tone-${status.tone}`}>{status.text}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="sub" style={{ margin: '8px 0 0' }}>
            Xếp theo lịch tuần. Mỗi hướng chạy 1 ngày: bản A ra 7h, bản B ra 12h30; đủ cặp thì Evaluator so bản nào ăn hơn. Rê chuột vào dòng để đọc lý do BOSS chọn.
          </p>
        </section>
      ) : null}

      {/* ===== Dang lai bai cu an khach (may de xuat, nguoi chia se) ===== */}
      {repostSuggestions.length ? (
        <section className="plan-card" style={{ marginBottom: 14 }}>
          <b style={{ fontSize: '1.05rem' }}>🔁 Nên đăng lại — bài cũ ăn khách</b>
          <p className="sub" style={{ margin: '4px 0 8px' }}>
            Bài đăng từ 7 ngày trước có tương tác tốt nhất. Mở bài, bấm Chia sẻ trên Facebook hoặc dùng nút 📣 ở Quản lý bài viết để đưa vào nhóm.
          </p>
          <div className="tablewrap">
            <table className="datatable">
              <thead><tr><th>Bài</th><th className="num">Tương tác</th><th>Đã đăng</th><th></th></tr></thead>
              <tbody>
                {repostSuggestions.map((r) => (
                  <tr key={r.url}>
                    <td>{r.title}</td>
                    <td className="num"><b>{vnInt(r.engagement)}</b></td>
                    <td className="sub">{fmtDateTime(r.publishedAt)}</td>
                    <td><a className="btn ghost sm" href={r.url} target="_blank" rel="noopener noreferrer">Mở bài ↗</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {/* ===== 5. Ban ke hoach hien tai + lich su (gon 24/8) =====
          Bang san pham day du + tri thuc + adjust log da chuyen sang tab "AI Ke hoach" o
          /kho-tri-thuc?ai=boss (khong lap thong tin). O day chi giu: badge nhan dang ban dang
          ap, mo/gac ap dung, va lich su 3 ban gan nhat (con lai gap vao summary phu). */}
      <details className="plan-card" open={!!viewing}>
        <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '1.02rem' }}>
          📋 Bản đang áp và lịch sử
          {appliedRow ? <span className="sub" style={{ fontWeight: 400, marginLeft: 8 }}>{fmtDateTime(appliedRow.created_at)}</span> : null}
        </summary>

        {!latest ? (
          <p className="sub" style={{ marginTop: 10 }}>Chưa có bản kế hoạch nào. Bấm Tạo kế hoạch ngay ở góc trên.</p>
        ) : (
          <div style={{ marginTop: 12 }}>
            {viewing ? (
              <p className="err" role="status">
                Đang xem lại bản cũ sinh lúc {fmtDateTime(viewing.created_at)}. <a href="/ke-hoach">Về bản mới nhất</a>
              </p>
            ) : null}
            <div className="plan-meta">
              <span className="badge">{latest.generated_by === 'cron' ? '🤖 Tự động' : '✍️ Tạo tay'}</span>
              {latest.data.cadence === 'weekly' ? <span className="badge">📅 Kế hoạch tuần</span>
                : latest.data.cadence === 'update' ? <span className="badge">🔁 Cập nhật</span> : null}
              <span className="sub">Sinh {fmtDateTime(latest.created_at)}</span>
              {latest.applied ? <span className="badge tone-ok">✓ Đang áp</span> : null}
            </div>

            {latest.data.goal ? (
              <p style={{ margin: '8px 0 4px' }}><b>Mục tiêu:</b> {latest.data.goal.split('\n')[0]}</p>
            ) : null}
            <p className="sub" style={{ margin: '4px 0 6px' }}>
              Chi tiết bảng sản phẩm, tri thức đã đọc, nhật ký chỉnh dần: xem tab <a className="src" href="/kho-tri-thuc?ai=boss">AI Kế hoạch</a>.
            </p>

            <div className="plan-actions" style={{ display: 'flex', gap: 8, margin: '10px 0' }}>
              {latest.applied ? (
                <form action={clearPlanWeights}><button className="btn ghost" type="submit">Gỡ áp dụng</button></form>
              ) : (
                <form action={applyPlanWeights}>
                  <input type="hidden" name="plan_id" value={latest.id} />
                  <button className="btn ok" type="submit">Áp dụng trọng số</button>
                </form>
              )}
            </div>

            {history.length ? (
              <>
                <h3 style={{ margin: '14px 0 6px', fontSize: '.95rem', color: 'var(--ink-2)' }}>Lịch sử ({vnInt(history.length)} bản)</h3>
                <div className="tablewrap">
                  <table className="datatable">
                    <thead><tr><th>Sinh lúc</th><th>Loại</th><th>Tuần</th><th className="center"></th></tr></thead>
                    <tbody>
                      {history.slice(0, 3).map((r) => (
                        <tr key={r.id}>
                          <td><a href={`/ke-hoach?xem=${r.id}`}>{fmtDateTime(r.created_at)}</a></td>
                          <td className="sub">{r.data?.cadence === 'weekly' ? 'Tuần' : r.data?.cadence === 'update' ? 'Cập nhật' : r.generated_by === 'cron' ? 'Tự động' : 'Tạo tay'}{r.applied ? ' · đang áp' : ''}</td>
                          <td className="sub">{r.period_start ? `${fmtDate(r.period_start)}–${fmtDate(r.period_end)}` : '—'}</td>
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
                {history.length > 3 ? (
                  <details style={{ marginTop: 8 }}>
                    <summary className="sub" style={{ cursor: 'pointer' }}>Xem {vnInt(history.length - 3)} bản cũ hơn</summary>
                    <div className="tablewrap" style={{ marginTop: 8 }}>
                      <table className="datatable">
                        <tbody>
                          {history.slice(3).map((r) => (
                            <tr key={r.id}>
                              <td><a href={`/ke-hoach?xem=${r.id}`}>{fmtDateTime(r.created_at)}</a></td>
                              <td className="sub">{r.data?.cadence === 'weekly' ? 'Tuần' : r.data?.cadence === 'update' ? 'Cập nhật' : r.generated_by === 'cron' ? 'Tự động' : 'Tạo tay'}</td>
                              <td className="sub">{r.period_start ? `${fmtDate(r.period_start)}–${fmtDate(r.period_end)}` : '—'}</td>
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
                  </details>
                ) : null}
              </>
            ) : null}
          </div>
        )}
      </details>
    </main>
  );
}
