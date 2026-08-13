export const dynamic = 'force-dynamic';

// Trạng thái token đăng Facebook (đặt trong Vercel env, không phải OAuth như TikTok). KHÔNG lộ token.
async function fbTokenCheck() {
  const VERSION = process.env.FACEBOOK_GRAPH_VERSION || 'v21.0';
  const TOKEN = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
  const PAGE_ID = process.env.FACEBOOK_PAGE_ID;
  const check: any = { configured: !!TOKEN, pageIdSet: !!PAGE_ID };
  if (!TOKEN) return check;
  try {
    const meRes = await fetch(`https://graph.facebook.com/${VERSION}/me?fields=id,name,category`, {
      headers: { Authorization: `Bearer ${TOKEN}` }
    });
    const me: any = await meRes.json();
    check.me = me?.error ? { error: me.error?.message } : { id: me?.id, name: me?.name, category: me?.category };
  } catch (e: any) {
    check.me = { error: String(e?.message || e) };
  }
  try {
    const dbgRes = await fetch(
      `https://graph.facebook.com/${VERSION}/debug_token?input_token=${encodeURIComponent(TOKEN)}`,
      { headers: { Authorization: `Bearer ${TOKEN}` } }
    );
    const dbg: any = await dbgRes.json();
    const d = dbg?.data || {};
    check.type = d.type || null;
    check.expiresAt = typeof d.expires_at === 'number' ? d.expires_at : null;
    check.isPermanent = d.expires_at === 0;
    check.scopes = d.scopes || null;
    check.hasManagePosts = Array.isArray(d.scopes) ? d.scopes.includes('pages_manage_posts') : null;
    check.hasManageEngagement = Array.isArray(d.scopes) ? d.scopes.includes('pages_manage_engagement') : null;
    if (dbg?.error) check.debugError = dbg.error?.message;
  } catch (e: any) {
    check.debugError = String(e?.message || e);
  }
  return check;
}

function yn(v: boolean | null | undefined) {
  return v ? '✅' : '❌';
}

export default async function Page() {
  const c = await fbTokenCheck();
  return (
    <main>
      <header className="head-row">
        <div>
          <h1>Kết nối Facebook</h1>
          <p className="sub">Trạng thái token đăng bài lên Facebook Page của SDVICO.</p>
        </div>
      </header>

      <section className="card" style={{ display: 'grid', gap: 12, maxWidth: 640 }}>
        {!c.configured ? (
          <p className="err">Chưa đặt <code>FACEBOOK_PAGE_ACCESS_TOKEN</code> trong Vercel env.</p>
        ) : (
          <>
            <div>
              <b>Trang</b>
              <div className="metaline">Tên Page: {c.me?.name || c.me?.error || '—'}</div>
              <div className="metaline">Loại token: {c.type || '—'} {c.type === 'PAGE' ? '✅ đúng Page token' : c.type ? '⚠️ nên là PAGE' : ''}</div>
              <div className="metaline">Vĩnh viễn: {yn(c.isPermanent)} {c.isPermanent ? '(không hết hạn)' : c.expiresAt ? `(hết hạn ${new Date(c.expiresAt * 1000).toLocaleString('vi-VN')})` : ''}</div>
            </div>
            <div>
              <b>Quyền</b>
              <div className="metaline">pages_manage_posts (đăng bài): {yn(c.hasManagePosts)}</div>
              <div className="metaline">pages_manage_engagement (thả ảnh vào bình luận): {yn(c.hasManageEngagement)}</div>
              {c.debugError ? <div className="metaline muted">Ghi chú: {c.debugError}</div> : null}
            </div>
          </>
        )}
        <p className="muted">
          Token Facebook đặt trong Vercel env <code>FACEBOOK_PAGE_ACCESS_TOKEN</code> (không có nút Kết nối như
          TikTok). Đổi token: cập nhật env trên Vercel rồi Redeploy.
        </p>
      </section>
    </main>
  );
}
