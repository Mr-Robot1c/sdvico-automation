import Link from 'next/link';
import { getServerClient } from '../../lib/supabase-server';
import { updateLeadStatus, addLeadManual, addProductQa } from '../actions';
import LeadStepper, { STEP_LABEL } from './lead-stepper';
import DeleteLeadButton from './delete-lead-button';
import SaveQaButton from './save-qa-button';
import DedupLeadsBar from './dedup-leads-bar';
import DraftReplyButton, { type PendingDraft } from './draft-reply-button';
import AutoRefresh from '../auto-refresh';
import { QA_GROUPS } from '../../lib/hoi-dap-bot';
// @ts-ignore — module JS thuần
import { guessGroup, publicName } from '../../lib/gen/products.mjs';
// @ts-ignore — module JS thuần
import { INTENT_LABEL } from '../../lib/gen/lead-intent.mjs';

// 15/9 (Thanh, kế hoạch "SDVICO sửa web"): trang Khách hàng ĐEM RA NGOÀI thành mục menu riêng,
// bỏ kanban 4 cột (sếp: "nhìn quá rối, không cần mấy khối Đã liên hệ / Đã xong, phải là 1 flow
// chặt chẽ"). Một bảng, mỗi khách 1 dòng, cột "Bước" chỉ hiện bước hiện tại + nút bước kế tiếp:
//   Mới -> Đã liên hệ -> Đã mua / Không chốt (kèm lý do).
// 16/9 (Thanh: "bỏ Chuyển NV, từ nay t phụ trách trả lời luôn — chính vì vậy mới cần con bot"): bỏ nút Chuyển NV,
// khối NV nhận Zalo; cột forwarded_* trong DB giữ nhưng không hiện. Việc phụ (thêm tay, dọn trùng, rác) ở thanh góc phải.
//
// Máy chỉ ĐỌC và LƯU lead, không tự nhắn khách (điều cấm 1). Kênh online tự trả lời, tự chốt
// (lệnh sếp Long 9/9); không chốt được ghi "Không chốt" + lý do.
export const dynamic = 'force-dynamic';
// 24/9: nút "Soạn trả lời" gọi bot (chuỗi model tới ~58s) qua server action; action kế thừa maxDuration của trang.
export const maxDuration = 60;

const SOURCE_LABEL: Record<string, string> = {
  facebook_comment: '💬 Comment Facebook',
  facebook_message: '📩 Tin nhắn Facebook',
  facebook_ads: '📣 Quảng cáo Facebook',
  manual: '✍️ Nhập tay',
};
const FILTERS = ['all', 'new', 'contacted', 'won', 'lost', 'spam'] as const;
const FILTER_LABEL: Record<string, string> = { all: 'Tất cả', ...STEP_LABEL };

function fmtDateTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit',
    timeZone: 'Asia/Ho_Chi_Minh', hourCycle: 'h23',
  }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value || '';
  return `${g('hour')}:${g('minute')} ${g('day')}/${g('month')}`;
}
const fmt = (n: number) => (n || 0).toLocaleString('vi-VN');

type Lead = {
  id: string; source: string; fb_user_name: string | null; fb_profile_url: string | null; message: string;
  status: string; note: string | null; lost_reason: string | null; created_at: string; updated_at: string | null;
  content_id: string | null; forwarded_to?: string | null; forwarded_at?: string | null;
};

// 24/9: tên SP ngắn cho khối phễu (bỏ số thứ tự folder, ưu tiên tên công khai SF300B).
const spShort = (g: string | null): string => {
  if (!g) return 'Chưa rõ SP';
  const pub = publicName(g) as string | null;
  return pub || String(g).replace(/^\d+\.\s*/, '');
};

const BASE_COLS = 'id, source, fb_user_name, fb_profile_url, message, status, note, lost_reason, created_at, updated_at, content_id';

export default async function Page({ searchParams }: { searchParams?: { status?: string; q?: string } }) {
  const client = getServerClient();
  const filter = FILTERS.includes((searchParams?.status || 'all') as any) ? (searchParams?.status || 'all') : 'all';
  const q = String(searchParams?.q || '').trim().slice(0, 80);

  // Cột forwarded_* có từ migration 20260915120000; chưa áp thì rơi về bộ cột cũ, trang không vỡ.
  const build = (cols: string) => {
    let qq = client.from('mkt_leads').select(cols).order('created_at', { ascending: false }).limit(300);
    if (filter !== 'all') qq = qq.eq('status', filter);
    else qq = qq.neq('status', 'spam');
    if (q) qq = qq.or(`fb_user_name.ilike.%${q.replace(/[%,()]/g, ' ')}%,message.ilike.%${q.replace(/[%,()]/g, ' ')}%`);
    return qq;
  };
  const weekStart = (() => {
    const vn = new Date(Date.now() + 7 * 3600 * 1000);
    const dow = (vn.getUTCDay() + 6) % 7; // T2 = 0
    const mon = new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate() - dow));
    return new Date(mon.getTime() - 7 * 3600 * 1000).toISOString();
  })();
  const since7 = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

  let leadsRes = await build(`${BASE_COLS}, forwarded_to, forwarded_at`);
  if (leadsRes.error) leadsRes = await build(BASE_COLS);
  const leads = ((leadsRes.data || []) as unknown) as Lead[];

  // 24/9 (sếp Long: dữ liệu hoá chuỗi khách hỏi): kéo lead 14 ngày để dựng khối phễu. Cột intent có từ migration
  // 20260924180000; chưa áp thì rơi về bộ cột cũ, trang không vỡ (khối phễu hiện "Chưa phân loại").
  const since14 = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString();
  const funnelQ = async () => {
    const q = (cols: string) => client.from('mkt_leads').select(cols).neq('status', 'spam').gte('created_at', since14).limit(1000);
    let r = await q('status, product_guess, intent, created_at');
    if (r.error) r = await q('status, product_guess, created_at');
    return (((r.data || []) as unknown) as Array<{ status: string; product_guess: string | null; intent?: string | null }>);
  };
  const [countsRes, wonWeekRes, newWeekRes, ads7Res, goalRow, funnelRows, pendingRes] = await Promise.all([
    // Đếm theo trạng thái: 6 lượt đếm head (không kéo dòng nào về), chạy song song.
    Promise.all(['new', 'contacted', 'won', 'lost', 'closed', 'spam'].map((st) => client.from('mkt_leads').select('id', { count: 'exact', head: true }).eq('status', st).then((r) => [st, r.count || 0] as [string, number]))),
    client.from('mkt_leads').select('id', { count: 'exact', head: true }).eq('status', 'won').gte('updated_at', weekStart),
    client.from('mkt_leads').select('id', { count: 'exact', head: true }).neq('status', 'spam').gte('created_at', weekStart),
    client.from('mkt_leads').select('id', { count: 'exact', head: true }).eq('source', 'facebook_ads').gte('created_at', since7),
    client.from('app_config').select('value').eq('key', 'mkt_weekly_goal').maybeSingle(),
    funnelQ(),
    // Nháp trả lời / nhắc lại đang chờ người gửi tay (cùng map theo lead_id cho cả chạm 0 và chạm 1 đến 3).
    client.from('approval_queue').select('id, payload').eq('kind', 'mkt_send_message').eq('status', 'pending').limit(100),
  ]);
  const counts: Record<string, number> = { all: 0 };
  for (const [st, n] of countsRes) { counts[st] = n; if (st !== 'spam') counts.all += n; }
  // Mục tiêu tuần: cùng cách đọc với /tong-quan ("... 10 khách mua ..." trong mkt_weekly_goal).
  const goalText = String((goalRow.data as any)?.value?.text || '');
  const wonTarget = Number(goalText.match(/(\d+)\s*khách\s*(?:hàng\s*)?mua/i)?.[1] || 10);

  const pendingByLead = new Map<string, PendingDraft>();
  for (const r of (pendingRes.data || []) as any[]) {
    const p = r.payload || {};
    if (!p.lead_id || !p.body) continue;
    pendingByLead.set(String(p.lead_id), {
      queueId: String(r.id), body: String(p.body), note: String(p.note || ''), risk: String(p.risk || 'none'),
      needsManager: !!p.needs_manager_approval, touch: Number(p.touch) || 0,
    });
  }

  // Phễu 14 ngày, tổng hợp trong JS (không group by phía DB).
  const fAsked = funnelRows.length;
  const fContacted = funnelRows.filter((r) => ['contacted', 'won', 'lost', 'closed'].includes(r.status)).length;
  const fWon = funnelRows.filter((r) => r.status === 'won').length;
  const fLost = funnelRows.filter((r) => r.status === 'lost').length;
  const bySp = new Map<string, { total: number; won: number; known: boolean }>();
  const byIntent = new Map<string, number>();
  for (const r of funnelRows) {
    const k = spShort(r.product_guess);
    const cur = bySp.get(k) || { total: 0, won: 0, known: !!r.product_guess };
    cur.total++; if (r.status === 'won') cur.won++;
    bySp.set(k, cur);
    const ik = r.intent ? ((INTENT_LABEL as Record<string, string>)[r.intent] || r.intent) : 'Chưa phân loại';
    byIntent.set(ik, (byIntent.get(ik) || 0) + 1);
  }
  const spRank = [...bySp.entries()].sort((a, b) => b[1].won - a[1].won || b[1].total - a[1].total);
  const focus = spRank.find(([, v]) => v.known);

  const contentIds = [...new Set(leads.map((l) => l.content_id).filter(Boolean))] as string[];
  const titleOf = new Map<string, string>();
  if (contentIds.length) {
    const { data: cs } = await client.from('mkt_content').select('id, title').in('id', contentIds.slice(0, 200));
    for (const c of cs || []) titleOf.set((c as any).id, (c as any).title || '(không tên)');
  }

  const hrefFor = (s: string) => `/khach-hang${s === 'all' ? '' : `?status=${s}`}${q ? `${s === 'all' ? '?' : '&'}q=${encodeURIComponent(q)}` : ''}`;

  return (
    <main>
      <header className="head-row">
        <div>
          <h1>Khách hàng</h1>
          <p className="sub" style={{ margin: '4px 0 0' }}>
            Người hỏi mua từ comment, tin nhắn Facebook, quảng cáo và nhập tay. Mỗi khách đi một đường: <b>Mới → Đã liên hệ → Đã mua</b> hoặc <b>Không chốt</b> (ghi lý do). Máy chỉ đọc và lưu; kênh online tự trả lời khách, thiếu thông tin thì hỏi bot.
          </p>
        </div>
        <div className="head-actions lead-toolbar">
          <AutoRefresh seconds={60} />
          <details>
            <summary><span className="btn ghost sm">➕ Thêm khách</span></summary>
            <div className="lead-pop">
              <form action={addLeadManual} style={{ display: 'grid', gap: 8 }}>
                <input name="name" placeholder="Tên khách" className="note" required />
                <input name="contact" placeholder="SĐT / Zalo / link" className="note" />
                <input name="message" placeholder="Hỏi gì / sản phẩm quan tâm" className="note" />
                <select name="channel" className="note" defaultValue="zalo" title="Tin trong hộp thư có thẻ 'Bắt đầu từ quảng cáo' thì chọn Quảng cáo FB">
                  <option value="zalo">Zalo</option>
                  <option value="inbox">Inbox FB</option>
                  <option value="ads">📣 Quảng cáo FB</option>
                  <option value="call">Gọi</option>
                  <option value="meet">Gặp</option>
                </select>
                <button className="btn ok sm" type="submit">Thêm khách</button>
              </form>
            </div>
          </details>
          <DedupLeadsBar racCount={counts.spam || 0} />
          <Link className="btn ghost sm" href="/hoi-dap">📚 Kho hỏi đáp</Link>
        </div>
      </header>

      <div className="lead-week">
        <span>Tuần này: <b>{fmt(newWeekRes.count ?? 0)}</b> khách hỏi</span>
        <span>💰 Đã mua: <b>{fmt(wonWeekRes.count ?? 0)}</b> / {fmt(wonTarget)} (mục tiêu tuần)</span>
        <span>📣 Từ quảng cáo 7 ngày: <b>{fmt(ads7Res.count ?? 0)}</b></span>
      </div>

      {fAsked > 0 ? (
        <div className="lead-week" style={{ flexDirection: 'column', gap: 4 }}>
          <span>Phễu 14 ngày: Hỏi <b>{fmt(fAsked)}</b> → Đã liên hệ <b>{fmt(fContacted)}</b> → 💰 Mua <b>{fmt(fWon)}</b> | ❌ Không chốt <b>{fmt(fLost)}</b></span>
          <span>Theo SP: {spRank.map(([k, v]) => `${k} ${fmt(v.total)} (mua ${fmt(v.won)})`).join(' · ')}</span>
          <span>Câu khách hỏi: {[...byIntent.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${fmt(n)}`).join(' · ')}</span>
          {focus ? <span>Gợi ý focus (máy xếp, người quyết): <b>{focus[0]}</b> {focus[1].won > 0 ? `có ${fmt(focus[1].won)} khách mua` : 'nhiều khách hỏi nhất'} 14 ngày</span> : null}
        </div>
      ) : null}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', margin: '0 0 12px' }}>
        <nav className="filters" style={{ margin: 0 }} aria-label="Lọc theo bước">
          {FILTERS.map((s) => (
            <Link key={s} href={hrefFor(s)} className={`chip ${filter === s ? 'on' : ''}`}>
              {FILTER_LABEL[s]} <span className="n">{fmt(counts[s] || 0)}</span>
            </Link>
          ))}
        </nav>
        <form method="get" style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
          {filter !== 'all' ? <input type="hidden" name="status" value={filter} /> : null}
          <input className="search" type="search" name="q" defaultValue={q} placeholder="Tìm tên / nội dung..." aria-label="Tìm khách" style={{ maxWidth: 220 }} />
          <button className="btn ghost sm" type="submit">Tìm</button>
        </form>
      </div>

      {leads.length === 0 ? (
        <div className="empty">
          <div className="empty-icon" aria-hidden="true">👥</div>
          <p>{q ? 'Không tìm thấy khách nào khớp.' : filter === 'all' ? 'Chưa có người hỏi mua nào.' : `Chưa có khách ở bước ${FILTER_LABEL[filter]}.`}</p>
          <p className="sub">Máy bắt comment và tin nhắn hỏi mua dưới bài đăng; khách gọi / Zalo thì bấm ➕ Thêm khách.</p>
        </div>
      ) : (
        <div className="tablewrap">
          <table className="datatable lead-table">
            <thead>
              <tr>
                <th style={{ width: 92 }}>Lúc</th>
                <th style={{ width: 200 }}>Khách</th>
                <th>Hỏi gì</th>
                <th style={{ width: 330 }}>Bước</th>
                <th style={{ width: 200 }}>Ghi chú</th>
                <th style={{ width: 60 }}></th>
              </tr>
            </thead>
            <tbody>
              {leads.map((l) => {
                const relatedTitle = l.content_id ? titleOf.get(l.content_id) : null;
                const leadSummary = [
                  `🔔 Khách hỏi mua SDVICO (${fmtDateTime(l.created_at)})`,
                  `Nguồn: ${SOURCE_LABEL[l.source] || l.source}`,
                  `Người: ${l.fb_user_name || '(chưa lấy được tên)'}`,
                  `Hỏi: ${l.message}`,
                  relatedTitle ? `Bài liên quan: ${relatedTitle}` : '',
                  l.fb_profile_url ? `Link: ${l.fb_profile_url}` : '',
                  `Mở dashboard: https://sdvico-mktit.vercel.app/khach-hang`,
                ].filter(Boolean).join('\n');
                return (
                  <tr key={l.id}>
                    <td className="sub" style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(l.created_at)}</td>
                    <td>
                      <b>{l.fb_user_name || <span className="muted">(chưa lấy được tên)</span>}</b>
                      <div className="sub" style={{ fontSize: '.78rem' }}>{SOURCE_LABEL[l.source] || l.source}</div>
                      {l.fb_profile_url ? (
                        <a className="src" href={l.fb_profile_url} target="_blank" rel="noreferrer" style={{ fontSize: '.78rem' }}>
                          {l.source === 'facebook_message' ? '📩 Mở hộp thư Page ↗' : l.source === 'facebook_comment' ? '↗ Xem profile' : '↗ Liên hệ'}
                        </a>
                      ) : null}
                    </td>
                    <td>
                      <div className="lead-msg">{l.message}</div>
                      {relatedTitle ? <div className="sub" style={{ fontSize: '.78rem', marginTop: 2 }}>📎 {relatedTitle}</div> : null}
                      <div style={{ marginTop: 4 }}>
                        <SaveQaButton
                          leadId={l.id}
                          question={String(l.message || '').slice(0, 300)}
                          groups={QA_GROUPS}
                          defaultGroup={guessGroup(String(l.message || '')) || 'Chung'}
                          action={addProductQa}
                        />
                      </div>
                      <DraftReplyButton leadId={l.id} fbUrl={l.fb_profile_url} pending={pendingByLead.get(l.id) || null} />
                    </td>
                    <td>
                      <LeadStepper leadId={l.id} status={l.status} note={l.note || ''} lostReason={l.lost_reason || ''} />
                    </td>
                    <td>
                      <form action={updateLeadStatus} style={{ display: 'flex', gap: 4 }}>
                        <input type="hidden" name="lead_id" value={l.id} />
                        <input type="hidden" name="status" value={l.status} />
                        <input name="note" defaultValue={l.note || ''} placeholder="ghi chú..." className="note" style={{ width: 130, fontSize: '.82rem' }} />
                        <button className="btn ghost sm" type="submit">Lưu</button>
                      </form>
                    </td>
                    <td>
                      <DeleteLeadButton
                        leadId={l.id}
                        leadSummary={`${SOURCE_LABEL[l.source] || l.source} · ${l.fb_user_name || '(chưa lấy được tên)'} · "${(l.message || '').slice(0, 80)}"`}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
