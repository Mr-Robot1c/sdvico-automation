import { getServerClient } from '../../lib/supabase-server';
import { loadAdsConfig } from '../../lib/ads-config';
import { siteUrl } from '../../lib/seo';
import { vnInt } from '../../lib/plan';
import { saveAdsConfig, createAd, updateAdResults, deleteAd } from './ad-actions';
import UtmLink from './utm-link';

export const dynamic = 'force-dynamic';

type Ad = {
  id: string;
  name: string;
  platform: string;
  objective: string | null;
  landing_path: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_content: string | null;
  budget: number | null;
  note: string | null;
  status: string;
  results: any;
  created_at: string;
};

// Ghep URL dich den co UTM cho 1 chien dich.
function buildUtmUrl(ad: Ad): string {
  const base = siteUrl();
  const path = ad.landing_path.startsWith('/') ? ad.landing_path : `/${ad.landing_path}`;
  const params = new URLSearchParams();
  params.set('utm_source', ad.utm_source);
  params.set('utm_medium', ad.utm_medium);
  params.set('utm_campaign', ad.utm_campaign);
  if (ad.utm_content) params.set('utm_content', ad.utm_content);
  return `${base}${path}?${params.toString()}`;
}

const PLATFORM_LABEL: Record<string, string> = { facebook: 'Facebook', google: 'Google', tiktok: 'TikTok', zalo: 'Zalo', khac: 'Khác' };

export default async function Page() {
  const client = getServerClient();
  const [{ data: adsData }, cfg] = await Promise.all([
    client.from('mkt_ads').select('*').order('created_at', { ascending: false }).limit(50),
    loadAdsConfig()
  ]);
  const ads = (adsData || []) as Ad[];
  const tableReady = adsData !== null; // null = bảng chưa migrate

  return (
    <main>
      <header className="head-row">
        <div>
          <h1>Quảng cáo</h1>
          <p className="sub">
            Chuẩn bị đo lường cho quảng cáo trả phí. Người quản lý chạy quảng cáo tay trên Facebook Ads Manager hoặc Google Ads, hệ thống gắn Pixel và sinh link UTM để đo đơn về từ mỗi chiến dịch. Bot không tự chạy quảng cáo, không tiêu ngân sách.
          </p>
        </div>
      </header>

      {!tableReady ? (
        <div className="applied-banner" role="alert" style={{ borderLeftColor: 'var(--no, #d33)' }}>
          <b>⚠️ Chưa chạy migration bảng quảng cáo.</b>
          <p>Chạy file <code>supabase/migrations/20260820000000_mkt_ads.sql</code> trên Supabase (xem <code>supabase/README.md</code>) rồi tải lại trang.</p>
        </div>
      ) : null}

      {/* Cấu hình Pixel + GA4 + kênh nhắn tin */}
      <section className="goal-card">
        <form action={saveAdsConfig}>
          <div className="goal-head"><b>⚙️ Mã đo lường và kênh liên hệ</b></div>
          <p className="sub" style={{ margin: '4px 0 10px' }}>
            Dán mã Pixel và GA4 vào đây, hệ thống tự gắn lên trang bài viết và trang sản phẩm công khai. Đây là mã công khai, không phải mật khẩu.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
            <label className="field-col">
              <span className="sub">Meta Pixel ID (Facebook)</span>
              <input className="note" name="pixel_id" defaultValue={cfg.pixelId || ''} placeholder="Ví dụ: 1234567890123456" style={{ maxWidth: 'none', width: '100%' }} />
            </label>
            <label className="field-col">
              <span className="sub">GA4 Measurement ID (Google)</span>
              <input className="note" name="ga4_id" defaultValue={cfg.ga4Id || ''} placeholder="Ví dụ: G-XXXXXXXXXX" style={{ maxWidth: 'none', width: '100%' }} />
            </label>
            <label className="field-col">
              <span className="sub">Messenger username (m.me/…)</span>
              <input className="note" name="messenger_username" defaultValue={cfg.messengerUsername || ''} placeholder="Ví dụ: sdvico.tbtc" style={{ maxWidth: 'none', width: '100%' }} />
            </label>
            <label className="field-col">
              <span className="sub">Zalo OA id (zalo.me/…)</span>
              <input className="note" name="zalo_oa_id" defaultValue={cfg.zaloOaId || ''} placeholder="Ví dụ: 1234567890" style={{ maxWidth: 'none', width: '100%' }} />
            </label>
          </div>
          <div style={{ marginTop: 10 }}>
            <button className="btn ok" type="submit">Lưu mã đo lường</button>
          </div>
          <p className="sub" style={{ marginTop: 8 }}>
            {cfg.pixelId ? '✅ Pixel đang gắn trên trang công khai.' : '○ Chưa gắn Pixel.'}
            {' · '}
            {cfg.ga4Id ? '✅ GA4 đang gắn.' : '○ Chưa gắn GA4.'}
          </p>
        </form>
      </section>

      {/* Tạo chiến dịch mới */}
      <section className="goal-card" style={{ marginTop: 16 }}>
        <form action={createAd}>
          <div className="goal-head"><b>➕ Thêm chiến dịch quảng cáo</b></div>
          <p className="sub" style={{ margin: '4px 0 10px' }}>
            Khai báo chiến dịch bạn sắp chạy. Hệ thống sinh link UTM để bạn dán làm đích đến khi tạo quảng cáo trên Facebook hoặc Google.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <label className="field-col">
              <span className="sub">Tên chiến dịch</span>
              <input className="note" name="name" required placeholder="Máy lọc nước tháng 8" style={{ maxWidth: 'none', width: '100%' }} />
            </label>
            <label className="field-col">
              <span className="sub">Kênh chạy</span>
              <select className="note" name="platform" defaultValue="facebook" style={{ maxWidth: 'none', width: '100%' }}>
                <option value="facebook">Facebook</option>
                <option value="google">Google</option>
                <option value="tiktok">TikTok</option>
                <option value="zalo">Zalo</option>
                <option value="khac">Khác</option>
              </select>
            </label>
            <label className="field-col">
              <span className="sub">Mục tiêu</span>
              <select className="note" name="objective" defaultValue="tin_nhan" style={{ maxWidth: 'none', width: '100%' }}>
                <option value="tin_nhan">Tin nhắn</option>
                <option value="truy_cap">Truy cập trang</option>
                <option value="cuoc_goi">Cuộc gọi</option>
                <option value="mua_hang">Mua hàng</option>
              </select>
            </label>
            <label className="field-col">
              <span className="sub">Trang đích</span>
              <input className="note" name="landing_path" defaultValue="/san-pham" placeholder="/san-pham/may-loc-nuoc-bien-sea-40" style={{ maxWidth: 'none', width: '100%' }} />
            </label>
            <label className="field-col">
              <span className="sub">Mã UTM campaign (không dấu)</span>
              <input className="note" name="utm_campaign" placeholder="may_loc_nuoc_t8" style={{ maxWidth: 'none', width: '100%' }} />
            </label>
            <label className="field-col">
              <span className="sub">Biến thể (utm_content)</span>
              <input className="note" name="utm_content" placeholder="video_a" style={{ maxWidth: 'none', width: '100%' }} />
            </label>
            <label className="field-col">
              <span className="sub">Ngân sách dự kiến (đồng)</span>
              <input className="note" name="budget" placeholder="3.000.000" style={{ maxWidth: 'none', width: '100%' }} />
            </label>
            <label className="field-col">
              <span className="sub">Ghi chú</span>
              <input className="note" name="note" placeholder="Nhắm ngư dân BRVT 35-60 tuổi" style={{ maxWidth: 'none', width: '100%' }} />
            </label>
          </div>
          <div style={{ marginTop: 10 }}>
            <button className="btn ok" type="submit">Tạo chiến dịch và sinh link</button>
          </div>
        </form>
      </section>

      <h2 style={{ marginTop: 24 }}>Chiến dịch đang theo dõi</h2>
      {ads.length === 0 ? (
        <div className="empty" style={{ padding: 28, textAlign: 'center', color: 'var(--ink-2)' }}>
          <p>Chưa có chiến dịch nào. Thêm ở trên để bắt đầu đo lường.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 16 }}>
          {ads.map((ad) => {
            const r = ad.results || {};
            const cpl = r.spend && r.leads ? Math.round(r.spend / r.leads) : null;
            return (
              <section key={ad.id} className="plan-card" style={{ padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <b style={{ fontSize: '1.05rem' }}>{ad.name}</b>
                    <div className="sub" style={{ marginTop: 2 }}>
                      <span className="badge">{PLATFORM_LABEL[ad.platform] || ad.platform}</span>
                      {' '}
                      <span className={`badge ${ad.status === 'active' ? 'tone-ok' : ad.status === 'paused' ? 'tone-default' : 'tone-no'}`}>
                        {ad.status === 'active' ? 'Đang chạy' : ad.status === 'paused' ? 'Tạm dừng' : 'Kết thúc'}
                      </span>
                      {ad.objective ? ` · ${ad.objective.replace(/_/g, ' ')}` : ''}
                      {ad.budget ? ` · Ngân sách ${vnInt(ad.budget)} đồng` : ''}
                    </div>
                  </div>
                  <form action={deleteAd}>
                    <input type="hidden" name="ad_id" value={ad.id} />
                    <button className="btn no sm" type="submit">Xóa</button>
                  </form>
                </div>

                <div style={{ margin: '12px 0' }}>
                  <div className="sub" style={{ marginBottom: 4 }}>Link đích có gắn UTM (dán vào Facebook/Google Ads):</div>
                  <UtmLink url={buildUtmUrl(ad)} />
                </div>

                {/* Nhập kết quả tay từ Ads Manager */}
                <form action={updateAdResults}>
                  <input type="hidden" name="ad_id" value={ad.id} />
                  <div className="sub" style={{ marginBottom: 6 }}>Nhập kết quả từ trình quản lý quảng cáo (cập nhật định kỳ):</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8 }}>
                    <label className="field-col"><span className="sub">Chi phí (đồng)</span><input className="note" name="spend" defaultValue={r.spend ?? ''} style={{ maxWidth: 'none', width: '100%' }} /></label>
                    <label className="field-col"><span className="sub">Tiếp cận</span><input className="note" name="reach" defaultValue={r.reach ?? ''} style={{ maxWidth: 'none', width: '100%' }} /></label>
                    <label className="field-col"><span className="sub">Lượt bấm</span><input className="note" name="clicks" defaultValue={r.clicks ?? ''} style={{ maxWidth: 'none', width: '100%' }} /></label>
                    <label className="field-col"><span className="sub">Tin nhắn</span><input className="note" name="messages" defaultValue={r.messages ?? ''} style={{ maxWidth: 'none', width: '100%' }} /></label>
                    <label className="field-col"><span className="sub">Lead</span><input className="note" name="leads" defaultValue={r.leads ?? ''} style={{ maxWidth: 'none', width: '100%' }} /></label>
                    <label className="field-col"><span className="sub">Đơn</span><input className="note" name="orders" defaultValue={r.orders ?? ''} style={{ maxWidth: 'none', width: '100%' }} /></label>
                    <label className="field-col"><span className="sub">Trạng thái</span>
                      <select className="note" name="status" defaultValue={ad.status} style={{ maxWidth: 'none', width: '100%' }}>
                        <option value="active">Đang chạy</option>
                        <option value="paused">Tạm dừng</option>
                        <option value="ended">Kết thúc</option>
                      </select>
                    </label>
                  </div>
                  <div style={{ marginTop: 8, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                    <button className="btn ghost sm" type="submit">Lưu kết quả</button>
                    {cpl ? <span className="sub">Chi phí mỗi lead: <b>{vnInt(cpl)} đồng</b></span> : null}
                  </div>
                </form>
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}
