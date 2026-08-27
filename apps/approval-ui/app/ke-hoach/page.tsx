import { getServerClient } from '../../lib/supabase-server';
import type { Plan, Tier } from '../../lib/plan';
import { vnInt, vnDec1 } from '../../lib/plan';
import { generatePlanNow, applyPlanWeights, clearPlanWeights, deletePlan } from '../actions';
import { saveGoalFocusAndRegenerate, generatePostsNow } from './goal-actions';
import GeneratePostsButton from './generate-posts-button';
import SaveGenerateButton from './save-generate-button';
import GenerateButton from './generate-button';
import SevenAnglesButton from '../noi-dung/seven-angles-button';

export const dynamic = 'force-dynamic';
// Sinh kế hoạch gọi Gemini mất 30 giây tới ~2 phút (chuỗi 4 model fallback khi model đầu bị
// rate-limit). Server action saveGoalFocusAndRegenerate chạy trong function của trang này —
// KHÔNG set maxDuration thì bị cắt sớm, plan tạo được server-side nhưng response không về kịp
// browser -> UI không refresh (user 24/8: "bấm Lưu mà không cập nhật"). Cho 300s.
export const maxDuration = 300;

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

  // Huong di bai viet tu ban DANG AP (chi con dung `suggestions.length` cho badge header +
  // dong chan doan focus). Section "Huong di bai viet" rieng da xoa 24/8 — chi tiet nam
  // trong lich 7 ngay + trang /kho-tri-thuc?ai=boss.
  const suggestions = appliedRow?.data?.content_suggestions || [];

  // Log lan sinh ke hoach tay gan nhat (task=mkt.plan_manual) — hien duoi nut submit "Luu &
  // sinh ke hoach moi" de user biet ket qua (24/8: user "bam luu khong duoc" — truoc silent).
  const { data: lastManualPlan } = await client
    .from('run_log')
    .select('status, detail, created_at')
    .eq('task', 'mkt.plan_manual')
    .order('created_at', { ascending: false })
    .limit(1);
  const lastPlanLog = (lastManualPlan || [])[0] as any;

  // Insight_line THAT cua bai rotation HOM NAY (user 24/8: "insight ngay nao hien ngay do,
  // dung hien ca 3"). Chi hom nay moi co bai da sinh (ngay mai tro di chua sinh); tuong lai
  // hien "may chon 1 insight chua dung gan day" nhu cu.
  const dayStartIsoInsight = new Date(new Date(today + 'T00:00:00+07:00')).toISOString();
  const { data: todayRot } = await client
    .from('mkt_content')
    .select('brief, created_at')
    .gte('created_at', dayStartIsoInsight)
    .eq('brief->>generator', 'rotation')
    .limit(20);
  const insightsByVariant = new Map<'A' | 'B', string>();
  for (const r of (todayRot || []) as any[]) {
    const v: 'A' | 'B' = r.brief?.ab_variant === 'B' ? 'B' : 'A';
    const line = String(r.brief?.insight_line || '').trim();
    if (line && !insightsByVariant.has(v)) insightsByVariant.set(v, line);
  }
  const appliedGeneratedAt = String(appliedRow?.data?.generatedAt || '');
  const fmtGenAt = (() => {
    const d = new Date(appliedGeneratedAt);
    if (Number.isNaN(d.getTime())) return '';
    const p = new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', timeZone: 'Asia/Ho_Chi_Minh', hourCycle: 'h23' }).formatToParts(d);
    const g = (t: string) => p.find((x) => x.type === t)?.value || '';
    return `${g('hour')}:${g('minute')} ${g('day')}/${g('month')}`;
  })();

  return (
    <main>
      <header className="head-row">
        <div>
          <h1>Kế hoạch</h1>
          <p className="sub">
            Chủ nhật 19h BOSS học số liệu tuần, Thứ 2 8h ra kế hoạch tuần, mỗi tối 19h điều chỉnh nhẹ theo số liệu từng ngày. Bài vẫn chờ người bấm Duyệt mới đăng.
          </p>
          {/* Thong tin "Dang ap" da chuyen xuong banner rieng ngay duoi header. */}
        </div>
        <div className="head-actions" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Nut "Ap dung de xuat moi" giu o header (learn-weekly hiem hoi, khi co thi user
              se muon bam ngay). "Go ap dung" da chuyen xuong banner "Ban dang ap" ngay
              duoi header — hop cum, thay ngay khi keo top of page. */}
          {learnSuggestion ? (
            <form action={applyPlanWeights} title={`Đề xuất cuối tuần từ số liệu — sinh ${fmtDateTime(learnSuggestion.created_at)}`}>
              <input type="hidden" name="plan_id" value={learnSuggestion.id} />
              <button className="btn ok" type="submit">🧪 Áp dụng đề xuất mới</button>
            </form>
          ) : null}
          <SevenAnglesButton />
          <GenerateButton action={generatePlanNow} />
        </div>
      </header>

      {error ? <p className="err" role="alert">Lỗi tải dữ liệu: {error.message}</p> : null}

      {/* ===== BANNER "VUA THAY DOI KE HOACH" (24/8, user "UI m lam xau nhu cut, khong biet
          co doi hay khong"). Hien LON, ROI khi log mkt.plan_manual < 60 giay tuoi — sau
          F5 se tu bien mat vi tuoi log > nguong. ===== */}
      {(() => {
        if (!lastPlanLog) return null;
        const ageSec = (Date.now() - new Date(lastPlanLog.created_at).getTime()) / 1000;
        if (ageSec > 60) return null; // qua han, khong hien banner lon (dong sub o duoi nut van co)
        const ok = lastPlanLog.status === 'ok';
        return (
          <section role="status" style={{
            padding: '14px 18px', marginBottom: 14, borderRadius: 10,
            border: `2px solid var(--${ok ? 'ok' : 'no'}, ${ok ? '#16a34a' : '#dc2626'})`,
            background: `var(--${ok ? 'ok-bg' : 'no-bg'}, ${ok ? '#dcfce7' : '#fee2e2'})`,
            color: 'var(--ink)',
            display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
          }}>
            <span style={{ fontSize: '1.8rem', lineHeight: 1 }}>{ok ? '✅' : '⛔'}</span>
            <div style={{ flex: '1 1 300px', minWidth: 0 }}>
              <b style={{ fontSize: '1.05rem' }}>{ok ? 'Đã thay đổi kế hoạch mới' : 'Sinh kế hoạch thất bại'}</b>
              <div style={{ marginTop: 4 }}>
                {ok ? (
                  <>Kế hoạch tuần vừa sinh <b>{vnInt(Number(lastPlanLog.detail?.suggestions) || 0)} hướng đi bài viết</b>, đã áp và thay bản cũ. F5 hoặc kéo xuống xem chi tiết ở khối "📆 Kế hoạch tuần" bên dưới.</>
                ) : (
                  <>Lý do: {String(lastPlanLog.detail?.error || 'không rõ').slice(0, 240)}. Kế hoạch cũ vẫn còn nguyên (không bị xoá). Kiểm tra Gemini API key/quota rồi bấm lại.</>
                )}
              </div>
              <div className="sub" style={{ marginTop: 4 }}>Thao tác lúc {fmtDateTime(lastPlanLog.created_at)}. Banner này tự ẩn sau 1 phút.</div>
            </div>
          </section>
        );
      })()}

      {/* ===== HINT 3 NUT (24/8, user "chua co hint canh bao ...de lam gi ca") ===== */}
      <details className="plan-card" style={{ marginBottom: 14, padding: '10px 14px' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
          ❓ Khi nào bấm nút nào? <span className="sub" style={{ fontWeight: 400 }}>(bấm để xem)</span>
        </summary>
        <div className="tablewrap" style={{ marginTop: 10 }}>
          <table className="datatable">
            <thead>
              <tr><th style={{ width: 220 }}>Nút</th><th style={{ width: 190 }}>Ở đâu</th><th>Bấm khi nào — làm gì</th></tr>
            </thead>
            <tbody>
              <tr>
                <td><b>💾 Lưu &amp; sinh kế hoạch mới</b></td>
                <td className="sub">Cài đặt tuần (nút xanh giữa trang)</td>
                <td>Bấm khi bạn <b>vừa gõ đổi Mục tiêu hoặc Sản phẩm tập trung</b> trong khối Cài đặt tuần và muốn máy dùng đúng cài đặt mới. Máy lưu cài đặt + sinh kế hoạch mới bám cài đặt đó + áp NGAY.</td>
              </tr>
              <tr>
                <td><b>🔄 BOSS chạy lại (giữ cài đặt)</b></td>
                <td className="sub">Góc phải header</td>
                <td>Bấm khi <b>KHÔNG đổi gì trong Cài đặt tuần</b> nhưng muốn ép BOSS chạy lại NGAY để ra 7 hướng khác (VD: tri thức nội bộ vừa cập nhật, hướng cũ nghe chán, muốn thử vòng khác). GIỮ NGUYÊN mục tiêu + focus + nhóm chia sẻ hiện có.</td>
              </tr>
              <tr>
                <td><b>🎯 Bung 1 ý thành 7 bài</b></td>
                <td className="sub">Góc phải header</td>
                <td>Bấm khi <b>có 1 chủ đề nóng cần seeding</b> hoặc <b>ra mắt sản phẩm mới</b>. Máy sinh 7 bài Facebook khác nhau về góc tiếp cận (cảnh báo · case study · so sánh · hướng dẫn · phản biện · cảm xúc · listicle) — vào Bảng bài viết duyệt/xóa.</td>
              </tr>
              <tr>
                <td><b>🧪 Áp dụng đề xuất mới</b></td>
                <td className="sub">Header (khi có)</td>
                <td>Chỉ hiện <b>khi BOSS học tuần xong</b> (mỗi CN 19h) đề xuất đổi trọng số sản phẩm. Bấm để nhập weights mới vào kế hoạch đang áp, KHÔNG mất hướng đi cũ.</td>
              </tr>
              <tr>
                <td><b>Gỡ áp dụng</b></td>
                <td className="sub">Banner Bản đang áp</td>
                <td>Khi <b>muốn máy đăng đủ sản phẩm không tập trung</b> nữa. Vòng xoay sẽ chạy random theo trọng số cũ, không bám hướng đi mới.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </details>

      {/* ===== BẢN ĐANG ÁP — banner LÊN DÀU (user 24/8 nhac 3 lan: "dem cai ap dung len dau",
          "sao m ngu qua vay"). Truoc nam trong <details> cuoi trang, phai keo xuong. ===== */}
      {appliedRow ? (
        <section className="plan-card" style={{ borderLeft: '6px solid var(--ok, #1a9e6f)', marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div style={{ flex: '1 1 320px', minWidth: 0 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <b style={{ fontSize: '1.02rem' }}>📋 Bản đang áp</b>
                <span className="badge tone-ok">✓ Đang áp</span>
                <span className="badge">{appliedRow.generated_by === 'cron' ? '🤖 Tự động' : '✍️ Tạo tay'}</span>
                {appliedRow.data.cadence === 'weekly' ? <span className="badge">📅 Tuần</span>
                  : appliedRow.data.cadence === 'update' ? <span className="badge">🔁 Cập nhật</span> : null}
                <span className="sub">Sinh {fmtDateTime(appliedRow.created_at)} · {suggestions.length} hướng</span>
              </div>
              {appliedRow.data.goal ? (
                <p style={{ margin: '8px 0 4px' }}><b>Mục tiêu:</b> {appliedRow.data.goal.split('\n')[0]}</p>
              ) : null}
              <p className="sub" style={{ margin: '4px 0 0' }}>
                Chi tiết bảng sản phẩm, tri thức đã đọc, nhật ký chỉnh dần: xem tab <a className="src" href="/kho-tri-thuc?ai=boss">AI Kế hoạch</a>.
              </p>
            </div>
            <form action={clearPlanWeights} title="Gỡ bản đang áp — vòng xoay sẽ chạy random, không theo trọng số/hướng đi">
              <button className="btn ghost" type="submit">Gỡ áp dụng</button>
            </form>
          </div>
        </section>
      ) : null}

      {/* ===== CÀI ĐẶT TUẦN — GỘP 1 FORM 1 NÚT (24/8: user "3 nut cha biet bam gi, gop
          lai 1 nut cho de"). Truoc 2 form 2 nut (Luu muc tieu / Luu tap trung), moi lan
          bam la sinh plan moi -> 2 plan trong 30s. Gio 1 form voi 2 field, 1 nut =
          1 plan. Nhom chia se van hien inline (khong sua o day, xu ly o /noi-dung). ===== */}
      <section className="plan-card" style={{ marginBottom: 14 }}>
        <b style={{ fontSize: '1.02rem', display: 'block', marginBottom: 10 }}>⚙️ Cài đặt tuần</b>
        <form action={saveGoalFocusAndRegenerate}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
            <label className="goal-form">
              <b title="Câu ngắn bạn giao cho BOSS — sẽ được đưa vào prompt sinh hướng đi bài viết.">🎯 Mục tiêu tuần</b>
              <textarea name="goal_text" defaultValue={goalText} rows={2} placeholder="Ví dụ: tuần này ưu tiên lọc dầu SF-50, cần 20 cuộc gọi." />
            </label>
            <label className="goal-form">
              <b title="Máy chỉ đăng các sản phẩm liệt kê ở đây, sản phẩm khác bị chặn hoàn toàn.">🎯 Chỉ đăng sản phẩm này</b>
              <input name="focus_groups" defaultValue={focusGroups.join(', ')} placeholder="lọc dầu, lọc nước" />
              <span className="sub" style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                đến hết <input type="date" name="focus_until" defaultValue={focusUntil} style={{ maxWidth: 150 }} />
              </span>
            </label>
            <div>
              <b title="Nhóm Facebook mà bạn sẽ chia sẻ bài đã duyệt vào (chia sẻ tay). Sửa danh sách này ở trang Quản lý bài viết.">👥 Nhóm chia sẻ Facebook</b>
              <div className="sub" style={{ marginTop: 4 }}>
                {shareGroups.length} nhóm — sửa ở <a href="/noi-dung">Quản lý bài viết</a>
              </div>
              {shareGroups.length ? (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                  {shareGroups.map((g) => (<span key={g} className="badge tone-default">👥 {g}</span>))}
                </div>
              ) : (
                <p className="sub" style={{ margin: '6px 0 0' }}>Chưa có nhóm nào.</p>
              )}
            </div>
          </div>
          <div className="settings-cta">
            <SaveGenerateButton />
          </div>
          {lastPlanLog ? (
            <p className={`sub ${lastPlanLog.status === 'error' ? 'err-note' : ''}`} style={{ margin: '8px 0 0' }}>
              Lần sinh gần nhất ({fmtDateTime(lastPlanLog.created_at)}):{' '}
              {lastPlanLog.status === 'ok'
                ? <>✅ xong — {vnInt(Number(lastPlanLog.detail?.suggestions) || 0)} hướng</>
                : <>⛔ lỗi — {String(lastPlanLog.detail?.error || 'không rõ').slice(0, 200)}</>}
            </p>
          ) : null}
        </form>
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
              {allIn ? '✅' : '⚠️'} <b>{inFocus}/{total}</b> hướng đi bám đúng sản phẩm tập trung ({focusGroups.join(', ')}){focusUntil ? ` — đến ${fmtDate(focusUntil)}` : ''}. {allIn ? 'Kế hoạch đồng nhất với mục tiêu.' : 'Còn hướng cũ chưa bám focus — bấm nút xanh để sinh lại.'}
            </p>
          );
        })()}
      </section>

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
              Máy tự sinh lúc 7h và 12h30 rồi chờ trong Hàng đợi duyệt. Người bấm Duyệt và tự tay chia sẻ vào nhóm (Facebook không cho máy đăng nhóm).
            </p>
          </div>
        ) : (
          <p className="sub" style={{ margin: '6px 0 0' }}>
            Chưa có lịch hôm nay. Đề xuất sống sẽ tự sinh trong vòng 30 phút tới, hoặc lưu lại Cài đặt bên dưới để sinh ngay.
          </p>
        )}
        {/* 24/8 (user "doi ke hoach ma khong sinh bai moi"): nut sinh bai NGAY, bo guard
            1 bai/slot/ngay. Dung khi vua doi ke hoach giua ngay muon thay bai lien. */}
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
          <GeneratePostsButton action={generatePostsNow} />
        </div>
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
              {/* 24/8: BO header row 4 cot (user: "chu dinh lien khong cach, dai vo nghia").
                  BO cac dong phu SP/content/nhom o summary — chi tiet da co trong bang khi bam
                  expand, dup vao summary chi lam chat. Summary chi giu: ngay + huong di + badge. */}
              {liveData.daily_schedule.map((d) => {
                const dayTitle = d.direction?.title || (d.sales.length ? d.sales.map((s) => s.product).join(' + ') : '—');
                const kind = (d as any).contentKindLabel || 'Content';
                const dayProduct = d.direction?.product || (d.sales[0]?.product || '—');
                return (
                  <details key={d.date} className={`tuan-day ${d.date === today ? 'is-today' : ''}`}>
                    <summary className="tuan-day-summary" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', cursor: 'pointer', listStyle: 'none' }}>
                      <span style={{ whiteSpace: 'nowrap', minWidth: 78 }}>
                        {d.date === today ? '👉 ' : ''}<b>{d.dow.replace('Chủ nhật', 'CN').replace('Thứ ', 'T')}</b> <span className="sub">{fmtDate(d.date).slice(0, 5)}</span>
                      </span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        {d.direction ? (
                          <>
                            <b>{d.direction.title}</b>
                            {d.direction.done ? <span className="badge tone-ok" style={{ marginLeft: 8 }}>✓ đã sinh</span> : null}
                          </>
                        ) : (
                          <span className="sub">{d.sales.length ? d.sales.map((s) => `${s.product} ×${s.count}`).join(' + ') : '—'}</span>
                        )}
                      </span>
                      <span aria-hidden="true" style={{ color: 'var(--ink-2)' }}>▾</span>
                    </summary>
                    {/* 24/8 refactor: 4 day-block xep doc chiem ~240px -> bang datatable 3 cot
                        (Khung gio / Noi dung / Kenh) co thead giong bang "Ke hoach tuan" o tren
                        cho dong bo. Insight: hom nay = insight_line THAT tu bai rotation da sinh;
                        ngay khac = placeholder "may chon 1 insight chua dung". */}
                    <div className="tuan-day-body">
                      <table className="datatable dir-table" style={{ margin: 0 }}>
                        <thead>
                          <tr>
                            <th style={{ width: 130 }}>Khung giờ</th>
                            <th>Nội dung</th>
                            <th style={{ width: 240 }}>Kênh đăng</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td style={{ whiteSpace: 'nowrap', width: 130 }}><b>🕗 7h — Bản A</b><div className="sub">bài bán</div></td>
                            <td>
                              <b>{dayTitle}</b>
                              <div className="sub">{dayProduct}</div>
                              {d.date === today && insightsByVariant.get('A') ? (
                                <div className="sub">🎯 {insightsByVariant.get('A')}</div>
                              ) : (
                                <div className="sub">🎯 <i>máy chọn 1 insight chưa dùng gần đây</i></div>
                              )}
                            </td>
                            <td className="sub" style={{ whiteSpace: 'nowrap' }}>FB Post+Reel · YT Shorts · TikTok</td>
                          </tr>
                          <tr>
                            <td style={{ whiteSpace: 'nowrap' }}><b>🕐 12h30 — Bản B</b><div className="sub">bài bán A/B</div></td>
                            <td>
                              Cùng hướng, <b>xoáy insight khác</b> để so
                              {d.date === today && insightsByVariant.get('B') ? (
                                <div className="sub">🎯 {insightsByVariant.get('B')}</div>
                              ) : null}
                            </td>
                            <td className="sub" style={{ whiteSpace: 'nowrap' }}>FB Post+Reel · YT Shorts · TikTok</td>
                          </tr>
                          <tr>
                            <td style={{ whiteSpace: 'nowrap' }}><b>🕐 12h30 — Content</b><div className="sub">{kind}</div></td>
                            <td>
                              {(d as any).contentPurpose ? <>Mục đích: <b>{(d as any).contentPurpose}</b></> : <span className="sub">(theo lịch tuần)</span>}
                              {(d as any).contentStructure ? <div className="sub">Cấu trúc: {(d as any).contentStructure}</div> : null}
                            </td>
                            <td className="sub" style={{ whiteSpace: 'nowrap' }}>Facebook (nuôi trang)</td>
                          </tr>
                          {d.groups.length ? (
                            <tr>
                              <td style={{ whiteSpace: 'nowrap' }}><b>📣 Nhóm</b><div className="sub">chia sẻ tay</div></td>
                              <td>{d.groups.join(', ')}</td>
                              <td className="sub" style={{ whiteSpace: 'nowrap' }}>Facebook Groups</td>
                            </tr>
                          ) : null}
                        </tbody>
                      </table>
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

      {/* ===== Huong di bai viet: XOA khoi trang chinh (24/8, user "roi va khong dong nhat").
          Da nam trong lich 7 ngay o "Ke hoach tuan" — moi ngay bam <details> ra thay huong,
          insight, san pham, kenh. Danh sach full con o /kho-tri-thuc?ai=boss. ===== */}

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

      {/* ===== LICH SU CAC BAN (gon 24/8) — Ban dang ap chuyen len banner tren dau; day chi
          con lich su cac ban cu de xem lai / xoa. Bang san pham day du + tri thuc + adjust
          log o tab "AI Ke hoach" (/kho-tri-thuc?ai=boss). ===== */}
      <details className="plan-card" open={!!viewing}>
        <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '1.02rem' }}>
          📚 Lịch sử các bản kế hoạch
          <span className="sub" style={{ fontWeight: 400, marginLeft: 8 }}>{vnInt(planRows.length)} bản</span>
        </summary>

        {!latest ? (
          <p className="sub" style={{ marginTop: 10 }}>Chưa có bản kế hoạch nào. Bấm 🔄 BOSS chạy lại ở góc trên.</p>
        ) : (
          <div style={{ marginTop: 12 }}>
            {viewing ? (
              <p className="err" role="status">
                Đang xem lại bản cũ sinh lúc {fmtDateTime(viewing.created_at)}.{' '}
                {!viewing.applied ? (
                  <form action={applyPlanWeights} style={{ display: 'inline-block', marginLeft: 8 }}>
                    <input type="hidden" name="plan_id" value={viewing.id} />
                    <button className="btn ok sm" type="submit">Áp dụng bản này</button>
                  </form>
                ) : null}
                {' '}<a href="/ke-hoach">Về bản mới nhất</a>
              </p>
            ) : null}

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
