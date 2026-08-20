'use server';

// Server actions cho trang Quang cao (item 4, 20/8). Do luong AD, KHONG tu chay AD.
//   - saveAdsConfig: luu Pixel ID + GA4 ID + Messenger username + Zalo OA id (app_config).
//   - createAd / updateAdResults / deleteAd: quan ly chien dich AD nguoi quan ly khai bao.

import { revalidatePath } from 'next/cache';
import { getServerClient } from '../../lib/supabase-server';

// Chuan hoa 1 doan text ngan cho app_config (Pixel ID chi so + chu, GA4 dang G-XXXX...).
function clean(v: FormDataEntryValue | null, max = 120): string {
  return String(v || '').trim().slice(0, max);
}

export async function saveAdsConfig(formData: FormData) {
  const client = getServerClient();
  const rows = [
    { key: 'mkt_meta_pixel_id', value: clean(formData.get('pixel_id')) },
    { key: 'mkt_ga4_measurement_id', value: clean(formData.get('ga4_id')) },
    { key: 'mkt_messenger_username', value: clean(formData.get('messenger_username')) },
    { key: 'mkt_zalo_oa_id', value: clean(formData.get('zalo_oa_id')) }
  ];
  for (const r of rows) {
    const { error } = await client.from('app_config').upsert({
      key: r.key,
      value: r.value || null,
      updated_at: new Date().toISOString()
    });
    if (error) throw new Error(`Khong luu duoc ${r.key}: ${error.message}`);
  }
  revalidatePath('/quang-cao');
  revalidatePath('/blog');
  revalidatePath('/san-pham');
}

// Chuan hoa ma UTM campaign: bo dau tieng Viet, thay khoang trang bang gach duoi, chi giu
// [a-z0-9_-]. Tranh khoang trang trong URL (SEO + Ads tool ky tinh).
function slugCode(s: string): string {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60) || 'campaign';
}

export async function createAd(formData: FormData) {
  const client = getServerClient();
  const name = clean(formData.get('name'), 200);
  if (!name) throw new Error('Thieu ten chien dich');
  const platform = clean(formData.get('platform')) || 'facebook';
  const objective = clean(formData.get('objective'));
  const landingPath = clean(formData.get('landing_path')) || '/';
  const utmCampaign = slugCode(clean(formData.get('utm_campaign')) || name);
  const utmContent = clean(formData.get('utm_content'));
  const budgetRaw = clean(formData.get('budget'));
  const budget = budgetRaw ? Number(budgetRaw.replace(/[.,\s]/g, '')) : null;
  const note = clean(formData.get('note'), 500);

  const utmSourceMap: Record<string, string> = { facebook: 'facebook', google: 'google', tiktok: 'tiktok', zalo: 'zalo', khac: 'other' };
  const { error } = await client.from('mkt_ads').insert({
    name,
    platform,
    objective: objective || null,
    landing_path: landingPath.startsWith('/') ? landingPath : `/${landingPath}`,
    utm_source: utmSourceMap[platform] || 'other',
    utm_medium: platform === 'zalo' ? 'social' : 'cpc',
    utm_campaign: utmCampaign,
    utm_content: utmContent || null,
    budget: Number.isFinite(budget as number) ? budget : null,
    note: note || null,
    status: 'active'
  });
  if (error) throw new Error('Khong tao duoc chien dich: ' + error.message);
  revalidatePath('/quang-cao');
}

// Nhap ket qua tay tu FB Ads Manager (bot khong doc Ads API phien nay).
export async function updateAdResults(formData: FormData) {
  const client = getServerClient();
  const id = clean(formData.get('ad_id'));
  if (!id) return;
  const num = (k: string): number | null => {
    const v = clean(formData.get(k)).replace(/[.,\s]/g, '');
    if (!v) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const results = {
    spend: num('spend'),
    reach: num('reach'),
    clicks: num('clicks'),
    messages: num('messages'),
    leads: num('leads'),
    orders: num('orders')
  };
  const status = clean(formData.get('status')) || 'active';
  const { error } = await client
    .from('mkt_ads')
    .update({ results, status, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error('Khong luu duoc ket qua: ' + error.message);
  revalidatePath('/quang-cao');
}

export async function deleteAd(formData: FormData) {
  const client = getServerClient();
  const id = clean(formData.get('ad_id'));
  if (!id) return;
  const { error } = await client.from('mkt_ads').delete().eq('id', id);
  if (error) throw new Error('Khong xoa duoc: ' + error.message);
  revalidatePath('/quang-cao');
}
