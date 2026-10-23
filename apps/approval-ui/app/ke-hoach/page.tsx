import { Suspense } from 'react';
import { getServerClient } from '../../lib/supabase-server';
import { vnInt, proposalTargetWeekVN } from '../../lib/plan';
import { buildWeekPlanView, weekRowsOf, type WeekRow } from '../../lib/week-plan';
import { loadPostingPlan } from '../../lib/posting-plan';
import ShareLotToday from '../tong-quan/share-lot-today';
import { applyPlanWeights, clearPlanWeights } from '../actions';
import { generatePostsNow } from './goal-actions';
import GeneratePostsButton from './generate-posts-button';
import { loadPlans, loadAppliedPlan, fmtDate, fmtDateTime } from './shared';

export const dynamic = 'force-dynamic';
// Nút "Sinh bài ngay" (generatePostsNow) chạy rotate trong function của trang này, có thể quá 1 phút.
export const maxDuration = 300;

// TAB TUẦN NÀY — làm lại 23/10 (user: "giao diện vẫn còn rối rắm, đặc biệt là phần kế hoạch", "chuyển trang bị lag"):
//   1. Một dòng trạng thái bản đang áp (+ banner bản đề xuất tuần sau nếu có).
//   2. Chia sẻ nhóm hôm nay: việc người phải làm, đặt trước lịch.
//   3. Lưới 7 ngày, mỗi bài một ô nhỏ; bấm ô mới mở chi tiết (sản phẩm, lô nhóm).
//   4. Nên đăng lại: tải sau (Suspense), không giữ chân cả trang.
// Hướng đi + Sản phẩm ưu tiên chuyển sang tab /ke-hoach/huong-di; các tab khác là đường dẫn riêng.

const CH_SHORT: Record<string, string> = { facebook: 'Facebook', youtube: 'YouTube', tiktok: 'TikTok' };
const KIND_SHORT: Record<WeekRow['kind'], string> = { sale: 'Bài bán', content: 'Content', bantin: 'Bản tin' };

function rowTitle(r: WeekRow): string {
  return r.state === 'fallback' ? 'Bài theo trọng số sản phẩm' : r.label;
}

// Link cũ /ke-hoach?tab=... và ?xem=<id> chuyển sang đường dẫn mới ở next.config.mjs (redirects).
export default async function Page() {
  const client = getServerClient();
  const [{ rows }, appliedRow, pp, { data: focusRow }] = await Promise.all([
    loadPlans(client),
    loadAppliedPlan(client),
    loadPostingPlan(client),
    client.from('app_config').select('value').eq('key', 'mkt_focus').maybeSingle(),
  ]);
  const proposalWeek = proposalTargetWeekVN(new Date());
  const weeklyProposal = rows.find((r) => !r.applied && r.proposal?.week_start === proposalWeek.start) || null;

  // BẢNG TUẦN luôn dựng theo bản ĐANG ÁP (thực tế máy chạy).
  const week = await buildWeekPlanView(client, appliedRow?.data || null, new Date(), { pp, focus: (focusRow as any)?.value || null });
  const today = week.days.find((d) => d.isToday) || null;
  const todayShare = today ? weekRowsOf(today).filter((r) => r.lot && r.lot.channel === 'facebook' && r.lot.items.length) : [];

  return (
    <>
      {/* 1. Trạng thái bản đang áp */}
      <section className="blk tone-ok kh-status">
        {appliedRow ? (
          <>
            <div className="kh-strip">
              <b>Bản đang áp</b>
              <span className="sub">
                {appliedRow.generated_by === 'cron' ? 'Tự động' : 'Tạo tay'}, sinh {fmtDateTime(appliedRow.created_at)}, {vnInt((appliedRow.data.content_suggestions || []).length)} hướng đi
              </span>
              <span className="grow" />
              <a className="src" href="/kho-tri-thuc?ai=boss">Nhật ký BOSS</a>
              <form action={clearPlanWeights} title="Gỡ bản đang áp: vòng xoay chạy ngẫu nhiên theo trọng số cũ, không bám hướng đi">
                <button className="btn ghost sm" type="submit">Gỡ áp dụng</button>
              </form>
            </div>
            {appliedRow.data.goal ? (
              <p className="kh-goal" title={appliedRow.data.goal}>Mục tiêu: {appliedRow.data.goal.split('\n')[0]}</p>
            ) : null}
          </>
        ) : (
          <div className="kh-strip">
            <b>Chưa có bản kế hoạch nào đang áp</b>
            <a className="btn ghost sm" href="/ke-hoach/cai-dat">Soạn kế hoạch</a>
          </div>
        )}
      </section>

      {weeklyProposal ? (
        <section className="blk tone-accent" role="status">
          <div className="kh-strip">
            <div className="grow">
              BOSS đã soạn <b>kế hoạch tuần {fmtDate(proposalWeek.start)} tới {fmtDate(proposalWeek.end)}</b> lúc {fmtDateTime(weeklyProposal.created_at)}. Máy tự áp <b>Thứ 2 8h sáng</b>.
            </div>
            <a className="btn ghost sm" href={`/ke-hoach/huong-di?xem=${weeklyProposal.id}`}>Xem bản này</a>
            <form action={applyPlanWeights}>
              <input type="hidden" name="plan_id" value={weeklyProposal.id} />
              <button className="btn ok sm" type="submit">Áp ngay</button>
            </form>
          </div>
        </section>
      ) : null}

      {/* 2. Chia sẻ nhóm hôm nay */}
      {todayShare.length ? (
        <section className="blk">
          <h2>Chia sẻ nhóm hôm nay</h2>
          <div className="kh-share">
            {todayShare.map((r) => (
              <div key={`${r.slotIndex}-${r.time}`} className="kh-share-row">
                <div className="kh-share-post">
                  <span className="wk-time">{r.time || (r.window === 'sang' ? 'sáng' : 'chiều')}</span>
                  <span className="kh-share-title">{rowTitle(r)}</span>
                </div>
                <ShareLotToday
                  compact
                  lot={r.lot!.items.map((g) => ({ id: g.id, label: g.label, url: g.url, sharedToday: g.done ? { id: 'da-ghi', content_id: r.contentId || null, shared_at: '' } : null }))}
                  lotSize={r.lot!.lotSize}
                  doneToday={r.lot!.done}
                  post={r.contentId ? { contentId: r.contentId, url: null } : null}
                />
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* 3. Lưới 7 ngày */}
      <section className="blk">
        <div className="kh-week-head">
          <h2>Kế hoạch tuần</h2>
          <span className="sub">{fmtDate(week.window.start).slice(0, 5)} – {fmtDate(week.window.end)}</span>
          <span className="grow" />
          <span className="kh-legend"><i className="wk-dot done" /> đã sinh <i className="wk-dot planned" /> dự kiến</span>
        </div>
        <div className="wk-grid">
          {week.days.map((d) => {
            const dayRows = weekRowsOf(d);
            return (
              <div key={d.date} className={`wk-col${d.isToday ? ' is-today' : ''}${d.isPast ? ' is-past' : ''}`}>
                <div className="wk-col-head">
                  <b>{d.dowLabel.replace('Chủ nhật', 'CN').replace('Thứ ', 'T')}</b>
                  <span className="sub">{fmtDate(d.date).slice(0, 5)}</span>
                  {d.isToday ? <span className="wk-today">Hôm nay</span> : null}
                  {d.overridden ? <span className="sub" title="Ngày này dùng lịch riêng">lịch riêng</span> : null}
                </div>
                <div className="wk-cards">
                  {dayRows.length ? dayRows.map((r, k) => (
                    <details key={k} className={`wk-card ${r.state}`}>
                      <summary>
                        <span className="wk-card-top">
                          <span className="wk-time">{r.time || (r.window === 'sang' ? 'sáng' : 'chiều')}</span>
                          <span className={`wk-ch ${r.channel || 'facebook'}`}>{CH_SHORT[r.channel || 'facebook']}</span>
                          <i className={`wk-dot ${r.state === 'done' ? 'done' : 'planned'}`} aria-label={r.state === 'done' ? 'đã sinh' : 'dự kiến'} />
                        </span>
                        <span className="wk-card-title">{rowTitle(r)}</span>
                      </summary>
                      <div className="wk-card-more">
                        <div>{KIND_SHORT[r.kind]}{r.kind === 'content' ? `, ${d.contentLabel}` : ''}</div>
                        {r.product && r.kind === 'sale' ? <div>Sản phẩm: {r.product}</div> : null}
                        {r.kind === 'bantin' ? <div>Video người dựng gửi, máy soạn caption, cần sếp duyệt.</div> : null}
                        {r.group ? <div>Nhóm ghim: {r.group}</div> : null}
                        {r.state === 'fallback' ? <div>Hướng đi đã hết, máy tự nạp thêm trong ngày.</div> : null}
                        {r.lot && r.lot.channel === 'facebook' && r.lot.items.length ? (
                          <div>
                            {d.isPast ? `Đã chia ${r.lot.done}/${r.lot.lotSize} nhóm` : `Dự kiến chia ${r.lot.lotSize} nhóm`}:
                            <ul className="wk-lot-ul">
                              {r.lot.items.map((g) => <li key={g.id}>{g.done ? '✓ ' : ''}{g.label}</li>)}
                            </ul>
                          </div>
                        ) : null}
                      </div>
                    </details>
                  )) : <p className="sub wk-off">Máy nghỉ</p>}
                </div>
              </div>
            );
          })}
        </div>
        <div className="kh-week-foot">
          <GeneratePostsButton action={generatePostsNow} />
        </div>
      </section>

      {/* 4. Nên đăng lại: tải sau, không chặn phần trên */}
      <Suspense fallback={null}>
        <RepostBlock />
      </Suspense>
    </>
  );
}

// ĐĂNG LẠI BÀI CŨ ĂN KHÁCH: bài Facebook đăng từ 7 ngày trước có tương tác tốt nhất.
async function RepostBlock() {
  const client = getServerClient();
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
  if (!oldCids.length) return null;
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
  const list = oldCids
    .filter((cid) => titleOf.has(cid) && (engOf.get(cid) || 0) > 0)
    .map((cid) => ({ title: titleOf.get(cid)!, url: urlOf.get(cid)!.url, publishedAt: urlOf.get(cid)!.at, engagement: engOf.get(cid) || 0 }))
    .sort((a, b) => b.engagement - a.engagement)
    .slice(0, 3);
  if (!list.length) return null;
  return (
    <section className="blk">
      <h2>Nên đăng lại</h2>
      <ul className="kh-repost">
        {list.map((r) => (
          <li key={r.url}>
            <a href={r.url} target="_blank" rel="noopener noreferrer">{r.title}</a>
            <span className="sub">{vnInt(r.engagement)} tương tác, đăng {fmtDateTime(r.publishedAt)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
