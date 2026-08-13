import { getServerClient } from '../../lib/supabase-server';

export const dynamic = 'force-dynamic';

type Token = {
  open_id: string | null;
  scope: string | null;
  expires_at: string | null;
  refresh_expires_at: string | null;
  updated_at: string | null;
};

function fmt(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('vi-VN');
}

export default async function Page({ searchParams }: { searchParams: { connected?: string; error?: string } }) {
  const hasClientKey = !!process.env.TIKTOK_CLIENT_KEY;
  const hasClientSecret = !!process.env.TIKTOK_CLIENT_SECRET;

  let token: Token | null = null;
  let tableMissing = false;
  try {
    const client = getServerClient();
    const { data, error } = await client
      .from('mkt_oauth_tokens')
      .select('open_id, scope, expires_at, refresh_expires_at, updated_at')
      .eq('provider', 'tiktok')
      .maybeSingle();
    if (error && /relation .* does not exist|mkt_oauth_tokens/i.test(error.message)) tableMissing = true;
    token = (data as Token) || null;
  } catch {
    tableMissing = true;
  }

  const scopeHasPublish = (token?.scope || '').includes('video.publish');

  return (
    <main>
      <header className="head-row">
        <div>
          <h1>Kết nối TikTok</h1>
          <p className="sub">Cấp quyền cho hệ thống đăng video lên tài khoản TikTok của SDVICO (Direct Post).</p>
        </div>
      </header>

      {searchParams?.connected ? (
        <p className="ok" role="status">✅ Đã kết nối TikTok thành công.</p>
      ) : null}
      {searchParams?.error ? (
        <p className="err" role="alert">Lỗi: {searchParams.error}</p>
      ) : null}

      <section className="card" style={{ display: 'grid', gap: 12, maxWidth: 640 }}>
        <div>
          <b>Cấu hình app TikTok</b>
          <div className="metaline">TIKTOK_CLIENT_KEY: {hasClientKey ? '✅ đã đặt' : '❌ chưa đặt (Vercel env)'}</div>
          <div className="metaline">TIKTOK_CLIENT_SECRET: {hasClientSecret ? '✅ đã đặt' : '❌ chưa đặt (Vercel env)'}</div>
        </div>

        {tableMissing ? (
          <p className="err">Chưa có bảng <code>mkt_oauth_tokens</code>. Chạy migration <code>20260813000000_mkt_oauth_tokens.sql</code> trong Supabase SQL Editor trước.</p>
        ) : token ? (
          <div>
            <b>Trạng thái token</b>
            <div className="metaline">open_id: {token.open_id || '—'}</div>
            <div className="metaline">scope: {token.scope || '—'} {scopeHasPublish ? '✅ có video.publish' : '⚠️ thiếu video.publish'}</div>
            <div className="metaline">access_token hết hạn: {fmt(token.expires_at)}</div>
            <div className="metaline">refresh_token hết hạn: {fmt(token.refresh_expires_at)}</div>
            <div className="metaline">cập nhật: {fmt(token.updated_at)}</div>
          </div>
        ) : (
          <p className="muted">Chưa kết nối tài khoản TikTok nào.</p>
        )}

        <div>
          <a className="btn ok" href="/api/tiktok/connect">
            {token ? 'Kết nối lại TikTok' : 'Kết nối TikTok'}
          </a>
          {!hasClientKey ? (
            <p className="muted">Đặt TIKTOK_CLIENT_KEY và TIKTOK_CLIENT_SECRET trên Vercel rồi Redeploy trước khi bấm.</p>
          ) : null}
        </div>
      </section>
    </main>
  );
}
