import { getServerClient } from '../../lib/supabase-server';
import type { Plan, Tier } from '../../lib/plan';
import { vnInt } from '../../lib/plan';
import { buildWeekPlanView, productNameOf } from '../../lib/week-plan';
import { generatePlanNow, applyPlanWeights, clearPlanWeights, deletePlan } from '../actions';
import { saveGoalFocusAndRegenerate, generatePostsNow } from './goal-actions';
import GeneratePostsButton from './generate-posts-button';
import SaveGenerateButton from './save-generate-button';
import GenerateButton from './generate-button';
import SevenAnglesButton from '../noi-dung/seven-angles-button';
import TrendPostButton from './trend-post-button';

export const dynamic = 'force-dynamic';
// Sinh kế hoạch gọi Gemini mất 30 giây tới ~2 phút (chuỗi 4 model fallback khi model đầu bị
// rate-limit). Server action saveGoalFocusAndRegenerate chạy trong function của trang này —
// KHÔNG set maxDuration thì bị cắt sớm, plan tạo được server-side nhưng response không về kịp
// browser -> UI không refresh (user 24/8: "bấm Lưu mà không cập nhật"). Cho 300s.
export const maxDuration = 300;

// TRANG KẾ HOẠCH LÀM LẠI TOÀN BỘ 29/8 (user: "không rườm rà rối mắt, thể hiện đầy đủ kế
// hoạch cả tuần, các block phải đều nhau, không được lỗi UI"):
//   Mọi khối dùng CHUNG .blk (nền, viền, bo góc, padding, margin giống hệt nhau).
//   1. Thanh trạng thái bản đang áp (1 dòng).
//   2. 📆 KẾ HOẠCH TUẦN: bảng 7 ngày T2..CN — ngày đã qua hiện BÀI THẬT đã sinh (✓),
//      ngày tới hiện hướng máy SẼ rút (mô phỏng đúng /api/rotate, lib/week-plan.ts).
//      KHÔNG phụ thuộc bản live trong DB nữa (bản đó bị xoá là lịch cũ trống trơn).
//   3. 🧭 Hướng đi bài viết: đủ các hướng của bản đang áp + trạng thái đã dùng/chờ.
//   4+5. Hai cột đều nhau: ⚖️ Sản phẩm ưu tiên | ⚙️ Cài đặt tuần.
//   6. Cuối trang: 2 details đều nhau (Lịch sử | Hint nút).

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

const ROLE_LABEL: Record<string, string> = {
  giao_duc: 'Giáo dục', viral: 'Viral', ca_nhan: 'Cá nhân', seeding: 'Seeding', tuong_tac: 'Tương tác',
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

// Tên sản phẩm rác lọt vào weights/products từ bài nhập tay lịch sử (cùng luật productOf
// trong lib/plan.ts) — không hiện lên bảng Sản phẩm ưu tiên.
function isJunkProduct(name: string): boolean {
  if (!name || name === 'Khác' || name === 'Bài content' || name === 'Bài trend') return true;
  if (name.length > 60 || name.includes('\n')) return true;
  return /\d{9,}/.test(name) || /^bài (fb|đăng tay)/i.test(name);
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
  const shareGroupsRaw = Array.isArray((sgRow as any)?.value?.groups) ? (sgRow as any).value.groups : [];
  const shareGroups: string[] = shareGroupsRaw
    .map((x: any) => (typeof x === 'string' ? x.trim() : String(x?.label || x?.id || '').trim()))
    .filter(Boolean);

  const rowsInit = (data || []) as Row[];
  // Bản live (origin='live') chỉ phục vụ tile Tổng quan/Quản lý bài viết — trang này không dùng.
  const planRows = rowsInit.filter((r) => r.data?.origin !== 'live');
  const appliedRow = rowsInit.find((r) => r.applied);
  const learnSuggestion = rowsInit.find((r) => r.data?.origin === 'learn-weekly' && !r.applied);

  // ?xem=<id>: xem lại bản cũ — bảng Hướng đi + Sản phẩm hiển thị theo bản đó.
  const viewId = searchParams?.xem || null;
  let viewing: Row | null = viewId ? planRows.find((r) => r.id === viewId) || null : null;
  if (viewId && !viewing) {
    const { data: one } = await client
      .from('mkt_plans')
      .select('id, period_start, period_end, generated_by, data, applied, applied_at, created_at')
      .eq('id', viewId)
      .maybeSingle();
    viewing = (one as Row) || null;
  }
  const displayRow = viewing || appliedRow || planRows[0] || null;
  const displayData = displayRow?.data || null;
  const history = planRows.filter((r) => !r.applied && r.id !== (viewing?.id || ''));

  // BẢNG TUẦN: luôn dựng theo bản ĐANG ÁP (thực tế máy chạy), kể cả khi đang xem bản cũ.
  const week = await buildWeekPlanView(client, appliedRow?.data || null);

  const suggestions = (displayData?.content_suggestions || []) as any[];
  const usedCount = suggestions.filter((s) => s.used_at || s.pending_variant).length;

  // ĐĂNG LẠI BÀI CŨ ĂN KHÁCH (giữ từ bản cũ): bài đăng từ 7 ngày trước có tương tác tốt nhất.
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

  // Log lần sinh kế hoạch tay gần nhất — banner to khi < 60 giây, dòng nhỏ dưới nút Lưu.
  const { data: lastManualPlan } = await client
    .from('run_log')
    .select('status, detail, created_at')
    .eq('task', 'mkt.plan_manual')
    .order('created_at', { ascending: false })
    .limit(1);
  const lastPlanLog = (lastManualPlan || [])[0] as any;

  // Bảng Sản phẩm ưu tiên: từ bản đang hiển thị, lọc tên rác.
  const products = ((displayData?.products || []) as Plan['products']).filter((p) => !isJunkProduct(p.product));

  return (
    <main>
      <header className="head-row">
        <div>
          <h1>Kế hoạch</h1>
          <p className="sub">
            Sáng 8h máy ra 2 bài bán, chiều 14h thêm 1 bài bán và 1 bài content. Tối 20h BOSS chỉnh nhẹ theo số liệu ngày, Chủ nhật 20h học số cả tuần, Thứ 2 8h ra kế hoạch tuần mới. Bài luôn chờ người bấm Duyệt.
          </p>
        </div>
        <div className="head-actions" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {learnSuggestion ? (
            <form action={applyPlanWeights} title={`Đề xuất cuối tuần từ số liệu — sinh ${fmtDateTime(learnSuggestion.created_at)}`}>
              <input type="hidden" name="plan_id" value={learnSuggestion.id} />
              <button className="btn ok" type="submit">🧪 Áp dụng đề xuất mới</button>
            </form>
          ) : null}
          <TrendPostButton />
          <SevenAnglesButton />
          <GenerateButton action={generatePlanNow} />
        </div>
      </header>

      {error ? <p className="err" role="alert">Lỗi tải dữ liệu: {error.message}</p> : null}

      {/* Banner kết quả bấm "Lưu & sinh kế hoạch mới" — chỉ hiện 60 giây đầu, F5 là tự ẩn. */}
      {(() => {
        if (!lastPlanLog) return null;
        const ageSec = (Date.now() - new Date(lastPlanLog.created_at).getTime()) / 1000;
        if (ageSec > 60) return null;
        const ok = lastPlanLog.status === 'ok';
        return (
          <section role="status" className="blk" style={{ borderColor: ok ? 'var(--ok, #16a34a)' : 'var(--no, #dc2626)', borderLeftWidth: 5 }}>
            <div className="kh-strip">
              <span style={{ fontSize: '1.5rem', lineHeight: 1 }}>{ok ? '✅' : '⛔'}</span>
              <div className="grow">
                <b>{ok ? 'Đã thay đổi kế hoạch mới' : 'Sinh kế hoạch thất bại'}</b>
                <div className="sub" style={{ marginTop: 2 }}>
                  {ok
                    ? <>Bản mới có {vnInt(Number(lastPlanLog.detail?.suggestions) || 0)} hướng đi và đã được áp. Bảng tuần bên dưới đã theo bản mới.</>
                    : <>Lý do: {String(lastPlanLog.detail?.error || 'không rõ').slice(0, 200)}. Kế hoạch cũ vẫn giữ nguyên.</>}
                </div>
              </div>
            </div>
          </section>
        );
      })()}

      {/* Đang xem lại bản cũ */}
      {viewing ? (
        <section className="blk" style={{ borderColor: 'var(--accent)', borderLeftWidth: 5 }} role="status">
          <div className="kh-strip">
            <div className="grow">
              👀 Đang xem lại bản sinh lúc <b>{fmtDateTime(viewing.created_at)}</b> — bảng Hướng đi và Sản phẩm bên dưới theo bản này.
            </div>
            {!viewing.applied ? (
              <form action={applyPlanWeights}>
                <input type="hidden" name="plan_id" value={viewing.id} />
                <button className="btn ok sm" type="submit">Áp dụng bản này</button>
              </form>
            ) : null}
            <a className="btn ghost sm" href="/ke-hoach">Về bản đang áp</a>
          </div>
        </section>
      ) : null}

      {/* ===== 1. THANH TRẠNG THÁI BẢN ĐANG ÁP ===== */}
      <section className="blk" style={{ borderLeft: '5px solid var(--ok, #1a9e6f)' }}>
        {appliedRow ? (
          <div className="kh-strip">
            <b>📋 Bản đang áp</b>
            <span className="badge tone-ok">✓ Đang áp</span>
            <span className="badge">{appliedRow.generated_by === 'cron' ? '🤖 Tự động' : '✍️ Tạo tay'}</span>
            <span className="sub">Sinh {fmtDateTime(appliedRow.created_at)} · {vnInt((appliedRow.data.content_suggestions || []).length)} hướng đi</span>
            {appliedRow.data.goal ? (
              <span className="grow sub" title={appliedRow.data.goal}>🎯 {appliedRow.data.goal.split('\n')[0]}</span>
            ) : <span className="grow" />}
            <a className="src" href="/kho-tri-thuc?ai=boss">Nhật ký BOSS</a>
            <form action={clearPlanWeights} title="Gỡ bản đang áp — vòng xoay chạy random theo trọng số cũ, không bám hướng đi">
              <button className="btn ghost sm" type="submit">Gỡ áp dụng</button>
            </form>
          </div>
        ) : (
          <div className="kh-strip">
            <b>⚠️ Chưa có bản kế hoạch nào đang áp</b>
            <span className="grow sub">Máy đang chạy vòng xoay random. Bấm 🔄 BOSS chạy lại ở góc trên để sinh và áp kế hoạch.</span>
          </div>
        )}
      </section>

      {/* ===== 2. KẾ HOẠCH TUẦN (T2..CN) ===== */}
      <section className="blk">
        <h2>
          📆 Kế hoạch tuần
          <span className="sub">{fmtDate(week.window.start)} – {fmtDate(week.window.end)} · bài đã sinh có ✓, còn lại là dự kiến máy sẽ rút theo thứ tự ưu tiên</span>
        </h2>
        <div className="tablewrap" style={{ marginTop: 8 }}>
          <table className="datatable week-table">
            <thead>
              <tr>
                <th style={{ width: 92 }}>Ngày</th>
                <th>🕗 8h sáng — 2 bài bán</th>
                <th>🕐 14h chiều — 1 bài bán + 1 content</th>
                <th style={{ width: 190 }}>📣 Chia sẻ nhóm (tay)</th>
              </tr>
            </thead>
            <tbody>
              {week.days.map((d) => (
                <tr key={d.date} className={d.isToday ? 'row-today' : undefined}>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <b>{d.dowLabel.replace('Chủ nhật', 'CN').replace('Thứ ', 'T')}</b> <span className="sub">{fmtDate(d.date).slice(0, 5)}</span>
                    {d.isToday ? <div className="sub">👉 hôm nay</div> : null}
                  </td>
                  <td>
                    {d.morning.length ? d.morning.map((it, k) => (
                      <div key={k} className={`wk-item ${it.state === 'fallback' ? 'is-fallback' : ''}`}>
                        <span aria-hidden="true">{it.state === 'done' ? '✅' : '▫️'}</span>
                        <span>
                          <span className="wk-t">{it.text}</span>
                          {it.product ? <span className="wk-sub"> · {it.product}</span> : null}
                        </span>
                      </div>
                    )) : <span className="sub">— máy nghỉ</span>}
                  </td>
                  <td>
                    {d.afternoonSale.map((it, k) => (
                      <div key={`s${k}`} className={`wk-item ${it.state === 'fallback' ? 'is-fallback' : ''}`}>
                        <span aria-hidden="true">{it.state === 'done' ? '✅' : '▫️'}</span>
                        <span>
                          <span className="wk-t">{it.text}</span>
                          {it.product ? <span className="wk-sub"> · {it.product}</span> : null}
                        </span>
                      </div>
                    ))}
                    {d.content ? (
                      <div className="wk-item">
                        <span aria-hidden="true">{d.content.state === 'done' ? '✅' : '📰'}</span>
                        <span title={d.contentPurpose || ''}>
                          {d.content.state === 'done'
                            ? <><span className="wk-t">{d.content.text}</span><span className="wk-sub"> · content {d.contentLabel}</span></>
                            : <><span className="wk-t">Content {d.contentLabel}</span><span className="wk-sub"> · máy viết theo playbook</span></>}
                        </span>
                      </div>
                    ) : null}
                    {!d.afternoonSale.length && !d.content ? <span className="sub">— máy nghỉ</span> : null}
                  </td>
                  <td className="sub">{d.groups.length ? d.groups.join(', ') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="sub" style={{ margin: '10px 0 0' }}>
          Tối 20h BOSS tự chỉnh trọng số theo số liệu ngày (tối đa 0,5 điểm). Chủ nhật 20h học số cả tuần trên Facebook, YouTube và TikTok. Thứ 2 8h ra kế hoạch tuần mới theo luật 70/30.
          {week.hasFallback ? ' Ô "theo trọng số" nghĩa là hướng đi đã cạn — máy tự nạp thêm hướng mới trong ngày.' : ''}
        </p>
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
          <GeneratePostsButton action={generatePostsNow} />
        </div>
      </section>

      {/* ===== 3. HƯỚNG ĐI BÀI VIẾT ===== */}
      <section className="blk">
        <h2>
          🧭 Hướng đi bài viết
          <span className="sub">BOSS sinh từ tri thức + số liệu · sản phẩm ưu tiên cao được rút trước · mỗi hướng ra đúng 1 bài</span>
        </h2>
        {suggestions.length ? (
          <div className="tablewrap" style={{ marginTop: 8 }}>
            <table className="datatable">
              <thead>
                <tr>
                  <th style={{ width: 34 }}>#</th>
                  <th>Hướng đi</th>
                  <th style={{ width: 200 }}>Sản phẩm</th>
                  <th style={{ width: 140 }}>Dạng bài</th>
                  <th style={{ width: 130 }}>Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {suggestions.map((s, i) => {
                  const used = s.used_at || s.pending_variant;
                  const noAssets = !used && !week.productsWithImages.some((p) => p.toLowerCase() === productNameOf(String(s.product || '')).toLowerCase());
                  return (
                    <tr key={i}>
                      <td className="sub">{i + 1}</td>
                      <td>
                        <div className="wk-t">{s.title}</div>
                        {s.hook ? <div className="wk-sub" title={s.why || ''}>🪝 {s.hook}</div> : (s.why ? <div className="wk-sub kh-clamp" title={s.why}>{s.why}</div> : null)}
                      </td>
                      <td className="sub">{String(s.product || '—')}{s.needs_gov_review ? ' ⚠️' : ''}</td>
                      <td className="sub">{ROLE_LABEL[String(s.role || '')] || '—'}{s.emotion ? ` · ${s.emotion}` : ''}</td>
                      <td>
                        {s.used_at
                          ? <span className="badge tone-ok">✓ đã ra bài {fmtDate(String(s.used_at).slice(0, 10)).slice(0, 5)}</span>
                          : s.pending_variant
                            ? <span className="badge tone-default">✓ đã ra bài</span>
                            : noAssets
                              ? <span className="badge tone-no" title="Folder sản phẩm này chưa có ảnh — máy không sinh bài được. Thả ảnh vào Kho tư liệu.">📷 thiếu tư liệu</span>
                              : <span className="badge tone-default">⏳ chờ tới lượt</span>}
                        {!used && s.carried ? <div className="wk-sub" style={{ marginTop: 4 }}>giữ từ bản trước</div> : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="sub" style={{ marginTop: 8 }}>Bản này chưa có hướng đi nào. Bấm 🔄 BOSS chạy lại để sinh.</p>
        )}
        <p className="sub" style={{ margin: '10px 0 0' }}>
          Đã dùng {vnInt(usedCount)}/{vnInt(suggestions.length)} hướng. Hết hướng chưa dùng thì máy tự nạp thêm mỗi ngày từ tri thức mới.
        </p>
      </section>

      {/* ===== 4+5. HAI CỘT ĐỀU NHAU ===== */}
      <div className="blk-cols">
        <section className="blk">
          <h2>⚖️ Sản phẩm ưu tiên <span className="sub">trọng số BOSS chấm — cao thì hướng của sản phẩm đó chạy trước</span></h2>
          {products.length ? (
            <div className="tablewrap" style={{ marginTop: 8 }}>
              <table className="datatable">
                <thead><tr><th>Sản phẩm</th><th className="num">Ưu tiên</th><th className="num">Tương tác/bài</th><th>Hướng xử lý</th></tr></thead>
                <tbody>
                  {products.map((p) => {
                    const t = TIER_LABEL[p.tier];
                    return (
                      <tr key={p.product}>
                        <td>{p.product}</td>
                        <td className="num"><b>×{vnInt(p.weight)}</b></td>
                        <td className="num">{p.avgEng > 0 ? vnInt(p.avgEng) : '—'}</td>
                        <td><span className={`badge ${t.cls}`}>{t.icon} {t.text}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="sub" style={{ marginTop: 8 }}>Chưa có sản phẩm nào đủ số liệu.</p>
          )}
          <p className="sub" style={{ margin: '10px 0 0' }}>
            Số liệu gộp cả Facebook, YouTube và TikTok theo bài. Bảng đầy đủ + nhật ký chỉnh từng tối: <a className="src" href="/kho-tri-thuc?ai=boss">tab AI Kế hoạch</a>.
          </p>
        </section>

        <section className="blk kh-settings">
          <h2>⚙️ Cài đặt tuần</h2>
          <form action={saveGoalFocusAndRegenerate}>
            <label>
              <b title="Câu ngắn bạn giao cho BOSS — được đưa vào prompt sinh hướng đi bài viết.">🎯 Mục tiêu tuần</b>
              <textarea name="goal_text" defaultValue={goalText} rows={2} placeholder="Ví dụ: tuần này ưu tiên lọc dầu SF-50, cần 20 cuộc gọi." />
            </label>
            <label>
              <b title="Máy chỉ đăng các sản phẩm liệt kê ở đây, sản phẩm khác bị chặn hoàn toàn.">🎯 Chỉ đăng sản phẩm này</b>
              <input name="focus_groups" defaultValue={focusGroups.join(', ')} placeholder="lọc dầu, lọc nước" />
            </label>
            <label className="kh-inline">
              <span className="sub">đến hết</span>
              <input type="date" name="focus_until" defaultValue={focusUntil} style={{ maxWidth: 160 }} />
            </label>
            <div className="settings-cta">
              <SaveGenerateButton />
            </div>
            {lastPlanLog ? (
              <p className={`sub ${lastPlanLog.status === 'error' ? 'err-note' : ''}`} style={{ margin: '8px 0 0' }}>
                Lần sinh gần nhất ({fmtDateTime(lastPlanLog.created_at)}):{' '}
                {lastPlanLog.status === 'ok'
                  ? <>✅ xong — {vnInt(Number(lastPlanLog.detail?.suggestions) || 0)} hướng</>
                  : <>⛔ lỗi — {String(lastPlanLog.detail?.error || 'không rõ').slice(0, 160)}</>}
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
                {allIn ? '✅' : '⚠️'} <b>{vnInt(inFocus)}/{vnInt(total)}</b> hướng đi bám sản phẩm tập trung ({focusGroups.join(', ')}){focusUntil ? ` — đến ${fmtDate(focusUntil)}` : ''}.{allIn ? '' : ' Hướng ngoài focus chờ tới khi hết hạn tập trung.'}
              </p>
            );
          })()}
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
            <b style={{ display: 'block', marginBottom: 6 }}>👥 Nhóm chia sẻ Facebook</b>
            {shareGroups.length ? (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {shareGroups.map((g) => (<span key={g} className="badge tone-default">👥 {g}</span>))}
              </div>
            ) : <p className="sub" style={{ margin: 0 }}>Chưa có nhóm nào.</p>}
            <p className="sub" style={{ margin: '6px 0 0' }}>Sửa danh sách ở <a href="/noi-dung">Quản lý bài viết</a>. Máy chia lịch 2 nhóm/ngày, người chia sẻ tay.</p>
          </div>
        </section>
      </div>

      {/* ===== 6. Đăng lại bài cũ ăn khách (khi có) ===== */}
      {repostSuggestions.length ? (
        <section className="blk">
          <h2>🔁 Nên đăng lại <span className="sub">bài từ 7 ngày trước có tương tác tốt nhất — người mở bài và chia sẻ tay</span></h2>
          <div className="tablewrap" style={{ marginTop: 8 }}>
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

      {/* ===== 7. HAI DETAILS ĐỀU NHAU ===== */}
      <div className="blk-cols">
        <details className="blk">
          <summary className="kh-summary">📚 Lịch sử các bản kế hoạch <span className="sub">{vnInt(history.length)} bản cũ</span></summary>
          {history.length ? (
            <div className="tablewrap" style={{ marginTop: 10 }}>
              <table className="datatable">
                <thead><tr><th>Sinh lúc</th><th>Loại</th><th className="center"></th></tr></thead>
                <tbody>
                  {history.slice(0, 6).map((r) => (
                    <tr key={r.id}>
                      <td><a href={`/ke-hoach?xem=${r.id}`}>{fmtDateTime(r.created_at)}</a></td>
                      <td className="sub">{r.data?.cadence === 'weekly' ? 'Tuần' : r.data?.cadence === 'update' ? 'Cập nhật' : r.generated_by === 'cron' ? 'Tự động' : 'Tạo tay'}</td>
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
        </details>

        <details className="blk">
          <summary className="kh-summary">❓ Khi nào bấm nút nào</summary>
          <div className="tablewrap" style={{ marginTop: 10 }}>
            <table className="datatable">
              <thead><tr><th style={{ width: 170 }}>Nút</th><th>Bấm khi nào</th></tr></thead>
              <tbody>
                <tr>
                  <td><b>💾 Lưu &amp; sinh kế hoạch mới</b></td>
                  <td className="sub">Vừa đổi Mục tiêu hoặc Sản phẩm tập trung ở Cài đặt tuần — máy lưu rồi sinh bản mới bám cài đặt đó, áp ngay.</td>
                </tr>
                <tr>
                  <td><b>🔄 BOSS chạy lại</b></td>
                  <td className="sub">Không đổi cài đặt nhưng muốn 7 hướng khác (tri thức vừa cập nhật, hướng cũ chán).</td>
                </tr>
                <tr>
                  <td><b>⚡ Sinh bài theo kế hoạch ngay</b></td>
                  <td className="sub">Vừa đổi kế hoạch giữa ngày, muốn có bài mới liền không chờ khung 8h/14h.</td>
                </tr>
                <tr>
                  <td><b>🎯 Bung 1 ý thành 7 bài</b></td>
                  <td className="sub">Có 1 chủ đề nóng cần seeding hoặc ra mắt sản phẩm — máy sinh 7 bài khác góc.</td>
                </tr>
                <tr>
                  <td><b>🔥 Sinh bài trend</b></td>
                  <td className="sub">Có sự kiện nóng ngoài ngành (bão, bóng đá...) — máy móc sự kiện sang góc ngư dân + kịch bản video.</td>
                </tr>
                <tr>
                  <td><b>🧪 Áp dụng đề xuất mới</b></td>
                  <td className="sub">Chỉ hiện sau khi BOSS học tuần Chủ nhật — nhập trọng số mới, không mất hướng đi cũ.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </details>
      </div>
    </main>
  );
}
