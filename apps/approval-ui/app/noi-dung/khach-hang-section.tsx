import Link from 'next/link';
import { getServerClient } from '../../lib/supabase-server';
import { updateLeadStatus, addLeadManual } from '../actions';
import LeadStatusSelect from '../khach-hang/lead-status-select';
import ForwardZaloButton from '../khach-hang/forward-zalo-button';
import DeleteLeadButton from '../khach-hang/delete-lead-button';
import SalesZaloEditor from '../khach-hang/sales-zalo-editor';
import DedupLeadsBar from './dedup-leads-bar';

// User 27/8: "làm như cái bảng bài viết" - chuyển /khach-hang list dạng bảng thành KANBAN
// 3 cột (Mới / Đã liên hệ / Xong) hiện thẳng trong /noi-dung?loai=khach-hang, không nhảy trang.
// Cùng pattern với BangSection (bảng bài viết).

const SOURCE_LABEL: Record<string, string> = {
  facebook_comment: '💬 Cmt FB',
  facebook_message: '📩 Tin nhắn FB',
  manual: '✍️ Nhập tay',
};

function fmtRel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'vừa xong';
  if (m < 60) return `${m} phút trước`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} giờ trước`;
  return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh', hourCycle: 'h23' }).format(d);
}

export default async function KhachHangSection() {
  const client = getServerClient();

  // 30 ngày gần nhất, không bao gồm Rác (spam).
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const [{ data: leadsRaw }, { data: salesRow }, { count: cntRac }] = await Promise.all([
    client
      .from('mkt_leads')
      .select('id, source, fb_user_name, fb_profile_url, message, status, note, created_at, content_id')
      .neq('status', 'spam')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(300),
    client.from('app_config').select('value').eq('key', 'mkt_sales_zalo').maybeSingle(),
    client.from('mkt_leads').select('id', { count: 'exact', head: true }).eq('status', 'spam'),
  ]);

  const leads = (leadsRaw || []) as any[];
  const salesPeople: Array<{ name: string; phone: string }> = Array.isArray((salesRow as any)?.value?.people) ? (salesRow as any).value.people : [];

  // Bài liên quan (join title).
  const contentIds = [...new Set(leads.map((l) => l.content_id).filter(Boolean))] as string[];
  const titleOf = new Map<string, string>();
  if (contentIds.length) {
    const { data: cs } = await client.from('mkt_content').select('id, title').in('id', contentIds);
    for (const c of cs || []) titleOf.set((c as any).id, (c as any).title || '(không tên)');
  }

  const byStatus = { new: [] as any[], contacted: [] as any[], closed: [] as any[] };
  for (const l of leads) {
    const s = l.status as keyof typeof byStatus;
    if (s in byStatus) byStatus[s].push(l);
  }

  const columns = [
    { key: 'new', label: 'Mới', icon: '🆕', tone: 'pending', items: byStatus.new, empty: 'Chưa có lead mới.' },
    { key: 'contacted', label: 'Đã liên hệ', icon: '📞', tone: 'demo', items: byStatus.contacted, empty: 'Chưa có lead đang liên hệ.' },
    { key: 'closed', label: 'Xong', icon: '✅', tone: 'published', items: byStatus.closed, empty: 'Chưa có lead đã xong.' },
  ];

  const renderCard = (l: any) => {
    const relatedTitle = l.content_id ? titleOf.get(l.content_id) : null;
    const leadSummary = [
      `🔔 Lead từ SDVICO (${fmtRel(l.created_at)})`,
      `Nguồn: ${SOURCE_LABEL[l.source] || l.source}`,
      `Người: ${l.fb_user_name || '(chưa lấy được tên)'}`,
      `Hỏi: ${l.message}`,
      relatedTitle ? `Bài liên quan: ${relatedTitle}` : '',
      l.fb_profile_url ? `Link: ${l.fb_profile_url}` : '',
      `Mở dashboard: https://sdvico-mktit.vercel.app/noi-dung?loai=khach-hang`,
    ].filter(Boolean).join('\n');
    return (
      <div key={l.id} className="card" style={{ padding: 12, marginBottom: 10, display: 'grid', gap: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontWeight: 600 }}>{l.fb_user_name || <span className="muted">(chưa lấy được tên)</span>}</div>
            <div className="sub" style={{ fontSize: '.75rem' }}>
              {SOURCE_LABEL[l.source] || l.source} · {fmtRel(l.created_at)}
            </div>
          </div>
          <DeleteLeadButton
            leadId={l.id}
            leadSummary={`${SOURCE_LABEL[l.source] || l.source} · ${l.fb_user_name || '(chưa lấy được tên)'} · "${(l.message || '').slice(0, 80)}"`}
          />
        </div>
        <div style={{ fontSize: '.9rem', wordBreak: 'break-word' }}>{l.message}</div>
        {relatedTitle ? (
          <div className="sub" style={{ fontSize: '.78rem' }}>📎 Bài: {relatedTitle}</div>
        ) : null}
        {l.fb_profile_url ? (
          <a className="src" href={l.fb_profile_url} target="_blank" rel="noreferrer" style={{ fontSize: '.78rem' }}>
            {l.source === 'facebook_message' ? '📩 Mở hộp thư Page ↗' : '↗ Xem profile'}
          </a>
        ) : null}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginTop: 4 }}>
          <LeadStatusSelect leadId={l.id} status={l.status} note={l.note || ''} action={updateLeadStatus} />
          <ForwardZaloButton salesPeople={salesPeople} leadSummary={leadSummary} />
        </div>
      </div>
    );
  };

  return (
    <section>
      {/* Section thao tác: thêm khách tay + NV Zalo + dọn tin trùng. Collapsible details. */}
      <details className="plan-card" style={{ marginBottom: 12 }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600, padding: '4px 0' }}>➕ Thêm khách hỏi mua (nhập tay)</summary>
        <form action={addLeadManual} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
          <input name="name" placeholder="Tên khách" className="note" style={{ flex: '1 1 180px' }} />
          <input name="contact" placeholder="SĐT / Zalo / link" className="note" style={{ flex: '1 1 180px' }} />
          <input name="message" placeholder="Hỏi gì / sản phẩm quan tâm" className="note" style={{ flex: '2 1 260px' }} />
          <select name="channel" defaultValue="zalo" className="note">
            <option value="zalo">Zalo</option>
            <option value="inbox">Inbox FB</option>
            <option value="call">Gọi</option>
            <option value="meet">Gặp</option>
          </select>
          <button className="btn ok" type="submit">Thêm</button>
        </form>
      </details>

      <details className="plan-card" style={{ marginBottom: 12 }} open={salesPeople.length === 0}>
        <summary style={{ cursor: 'pointer', fontWeight: 600, padding: '4px 0' }}>
          📱 NV kinh doanh nhận Zalo forward <span className="sub" style={{ fontWeight: 400, marginLeft: 8 }}>{salesPeople.length} người</span>
        </summary>
        <p className="sub" style={{ margin: '8px 0' }}>
          Thêm NV nhận Zalo forward. Bấm "📱 Chuyển NV" ở mỗi lead sẽ copy nội dung + mở tab zalo.me tới NV bạn chọn.
        </p>
        <SalesZaloEditor initial={salesPeople} />
      </details>

      <DedupLeadsBar racCount={cntRac || 0} />

      {/* Board 3 cột dòng chảy lead. */}
      <div className="kanban-wrap">
        <div className="kanban">
          {columns.map((col) => (
            <div key={col.key} className="kanban-col">
              <div className={`kanban-head tone-${col.tone}`}>
                <span aria-hidden="true">{col.icon}</span>
                <span>{col.label}</span>
                <span className="n">{col.items.length}</span>
              </div>
              {col.items.length === 0 ? (
                <div className="kanban-empty">{col.empty}</div>
              ) : null}
              {col.items.slice(0, 30).map(renderCard)}
              {col.items.length > 30 ? (
                <div className="sub" style={{ padding: 8, fontSize: '.8rem', textAlign: 'center' }}>
                  … còn {col.items.length - 30} lead nữa. Đổi trạng thái để giảm cột này.
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
