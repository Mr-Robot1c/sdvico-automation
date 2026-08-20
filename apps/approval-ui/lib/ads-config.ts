// lib/ads-config.ts — doc cau hinh do luong quang cao tu app_config (item 4, 20/8).
//
// Cac id nay CONG KHAI (Pixel/GA4 hien tren trang public), khong phai secret. Luu trong
// app_config de nguoi quan ly dat qua UI /quang-cao, khong can redeploy Vercel.

import { getServerClient } from './supabase-server';

export type AdsConfig = {
  pixelId: string | null;
  ga4Id: string | null;
  messengerUsername: string | null;  // m.me/<username>
  zaloOaId: string | null;           // zalo.me/<oa_id>
};

const KEYS = ['mkt_meta_pixel_id', 'mkt_ga4_measurement_id', 'mkt_messenger_username', 'mkt_zalo_oa_id'] as const;

// Chuan hoa gia tri app_config: jsonb co the la string, {text}, hoac null.
function strOf(v: any): string | null {
  if (v == null) return null;
  if (typeof v === 'string') return v.trim() || null;
  if (typeof v === 'object' && typeof v.text === 'string') return v.text.trim() || null;
  return null;
}

export async function loadAdsConfig(): Promise<AdsConfig> {
  try {
    const client = getServerClient();
    const { data } = await client.from('app_config').select('key, value').in('key', KEYS as unknown as string[]);
    const map = new Map<string, any>();
    for (const r of data || []) map.set((r as any).key, (r as any).value);
    return {
      pixelId: strOf(map.get('mkt_meta_pixel_id')),
      ga4Id: strOf(map.get('mkt_ga4_measurement_id')),
      messengerUsername: strOf(map.get('mkt_messenger_username')),
      zaloOaId: strOf(map.get('mkt_zalo_oa_id'))
    };
  } catch {
    // Bang mkt_ads/app_config chua migrate -> tra rong, trang public van chay khong tracking.
    return { pixelId: null, ga4Id: null, messengerUsername: null, zaloOaId: null };
  }
}

// URL nhan tin Messenger co UTM (deep link). Chua cau hinh username -> ve Page mac dinh.
export function messengerUrl(username: string | null, utm?: { source?: string; campaign?: string }): string {
  const base = username ? `https://m.me/${username}` : 'https://www.facebook.com/sdvico.tbtc';
  const params = new URLSearchParams();
  // Messenger ho tro ref param mang theo (webhook doc duoc). Nhet UTM vao ref.
  if (utm?.campaign) params.set('ref', `utm_${utm.source || 'site'}_${utm.campaign}`);
  const q = params.toString();
  return q ? `${base}?${q}` : base;
}

// URL Zalo OA.
export function zaloUrl(oaId: string | null): string | null {
  if (!oaId) return null;
  return `https://zalo.me/${oaId}`;
}
