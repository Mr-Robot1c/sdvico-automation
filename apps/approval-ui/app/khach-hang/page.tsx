import { getServerClient } from '../../lib/supabase-server';
import { updateLeadStatus, addLeadManual } from '../actions';
import LeadStatusSelect from './lead-status-select';

// Trang "Theo dõi người mua" (24/8, user: "thông tin khách hàng sẽ được gửi về cho nhân
// viên kinh doanh"). Nhân viên vào đây xem danh sách người hỏi mua bắt được từ comment/tin
// nhắn Facebook, tự đánh dấu đã liên hệ chưa. Gửi Zalo tự động CHƯA làm (OA chưa xác thực,
// xem docs/runbook-zalo-oa-setup.md) — trang này là bước 1: hiện trong web trước.
//
// NGUỒN LEAD (24/8): webhook /api/facebook/webhook bắt comment (đang hoạt động, không cần
// quyền đặc biệt) + tin nhắn Messenger (cần pages_messaging, đang chờ Facebook duyệt). Chưa
// duyệt xong thì chỉ có lead từ comment + lead nhập tay.
export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  new: { text: '🆕 Mới', cls: 'tone-accent' },
  contacted: { text: '📞 Đã liên hệ', cls: 'tone-ok' },
  closed: { text: '✅ Xong', cls: 'tone-default' },
  spam: { text: '🚫 Rác', cls: 'tone-no' },
};
const SOURCE_LABEL: Record<string, string> = {
  facebook_comment: '💬 Comment Facebook',
  facebook_message: '📩 Tin nhắn Facebook',
  manual: '✍️ Nhập tay',
};

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit',
    timeZone: 'Asia/Ho_Chi_Minh', hourCycle: 'h23',
  }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value || '';
  return `${g('hour')}:${g('minute')} ${g('day')}/${g('month')}`;
}

export default async function Page({ searchParams }: { searchParams?: { status?: string } }) {
  const client = getServerClient();
  const filter = searchParams?.status || 'all';

  let q = client.from('mkt_leads').select('id, source, fb_user_name, fb_profile_url, message, status, note, created_at, content_id').order('created_at', { ascending: false }).limit(200);
  if (filter !== 'all' && ['new', 'contacted', 'closed', 'spam'].includes(filter)) q = q.eq('status', filter);
  const { data: leadsRaw } = await q;
  const leads = (leadsRaw || []) as any[];

  const contentIds = [...new Set(leads.map((l) => l.content_id).filter(Boolean))] as string[];
  const titleOf = new Map<string, string>();
  if (contentIds.length) {
    const { data: cs } = await client.from('mkt_content').select('id, title').in('id', contentIds);
    for (const c of cs || []) titleOf.set((c as any).id, (c as any).title || '(không tên)');
  }

  // Đếm theo trạng thái (không lọc) để hiện tab.
  const { data: allForCount } = await client.from('mkt_leads').select('status');
  const counts: Record<string, number> = { all: (allForCount || []).length };
  for (const r of (allForCount || []) as any[]) counts[r.status] = (counts[r.status] || 0) + 1;

  return (
    <main>
      <header className="head-row">
        <div>
          <h1>Theo dõi người mua</h1>
          <p className="sub">
            Người hỏi mua bắt được từ comment/tin nhắn Facebook dưới bài đăng. Máy chỉ ĐỌC và LƯU, không tự nhắn lại khách — bạn tự liên hệ và đánh dấu trạng thái ở đây.
          </p>
        </div>
      </header>

      <details className="plan-card" style={{ marginBottom: 14 }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>➕ Thêm khách hỏi mua (nhập tay)</summary>
        <form action={addLeadManual} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
          <input name="name" placeholder="Tên khách" className="note" style={{ flex: '1 1 180px' }} />
          <input name="contact" placeholder="SĐT / Zalo / link" className="note" style={{ flex: '1 1 180px' }} />
          <input name="message" placeholder="Hỏi gì / sản phẩm quan tâm" className="note" style={{ flex: '2 1 260px' }} />
          <button className="btn ok" type="submit">Thêm</button>
        </form>
      </details>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        {(['all', 'new', 'contacted', 'closed', 'spam'] as const).map((s) => (
          <a key={s} href={`/khach-hang${s === 'all' ? '' : `?status=${s}`}`}
            className={`btn sm ${filter === s ? 'ok' : 'ghost'}`} style={{ textDecoration: 'none' }}>
            {s === 'all' ? 'Tất cả' : STATUS_LABEL[s].text} ({counts[s] || 0})
          </a>
        ))}
      </div>

      {leads.length === 0 ? (
        <div className="empty">
          <div className="empty-icon" aria-hidden="true">👥</div>
          <p>Chưa có người hỏi mua nào.</p>
          <p className="sub">Webhook Facebook bắt comment hỏi mua tự động dưới bài đăng, hoặc thêm tay ở khung trên.</p>
        </div>
      ) : (
        <div className="tablewrap">
          <table className="datatable">
            <thead>
              <tr><th>Lúc</th><th>Nguồn</th><th>Người</th><th>Nội dung hỏi</th><th>Bài liên quan</th><th style={{ width: 150 }}>Trạng thái</th><th>Ghi chú</th></tr>
            </thead>
            <tbody>
              {leads.map((l) => {
                const st = STATUS_LABEL[l.status] || STATUS_LABEL.new;
                return (
                  <tr key={l.id}>
                    <td className="sub" style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(l.created_at)}</td>
                    <td className="sub" style={{ whiteSpace: 'nowrap' }}>{SOURCE_LABEL[l.source] || l.source}</td>
                    <td>
                      {l.fb_user_name || <span className="muted">(chưa lấy được tên)</span>}
                      {l.fb_profile_url ? (
                        <div style={{ marginTop: 2 }}>
                          <a className="src" href={l.fb_profile_url} target="_blank" rel="noreferrer" style={{ fontSize: '.8rem' }}>
                            {l.source === 'facebook_message' ? '📩 Mở hộp thư Page ↗' : '↗ Xem profile'}
                          </a>
                        </div>
                      ) : null}
                    </td>
                    <td style={{ maxWidth: 280 }}>{l.message}</td>
                    <td className="sub">{l.content_id ? (titleOf.get(l.content_id) || '—') : '—'}</td>
                    <td>
                      <LeadStatusSelect leadId={l.id} status={l.status} note={l.note || ''} action={updateLeadStatus} />
                    </td>
                    <td>
                      <form action={updateLeadStatus} style={{ display: 'flex', gap: 4 }}>
                        <input type="hidden" name="lead_id" value={l.id} />
                        <input type="hidden" name="status" value={l.status} />
                        <input name="note" defaultValue={l.note || ''} placeholder="ghi chú..." className="note" style={{ width: 120, fontSize: '.85rem' }} />
                        <button className="btn ghost sm" type="submit">Lưu</button>
                      </form>
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
