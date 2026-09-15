// lib/gsc.ts — GOOGLE SEARCH CONSOLE -> mkt_metrics (15/9, sếp: "dùng Google index xem số lượt bấm
// click... hiện thông số ở bài SEO đã đăng"). Kéo 28 ngày gần nhất theo TRANG (page), khớp về bài
// qua slug "<slug>-<8 ký tự id>" (lib/seo.ts contentIdFromSlug), ghi source='gsc' (schema đã cho phép
// từ đầu, chưa ai ghi). Mỗi ngày 1 lượt (metrics-pull hằng giờ tự gọi sau 6h VN, chống trùng bằng
// run_log mkt.gsc_pull).
//
// Env: GOOGLE_SA_JSON (tài khoản dịch vụ, đã thêm làm người dùng của property trong Search Console),
// GSC_SITE_URL (vd "sc-domain:sdvico.vn" hoặc "https://sdvico.vn/"). Thiếu -> trả lỗi mềm, không ném.
// Xem docs/runbook-search-console-setup.md.
import type { getServerClient } from './supabase-server';
import { googleAccessToken } from './google-sa';
import { contentIdFromSlug } from './seo';

type Client = ReturnType<typeof getServerClient>;
const SCOPE = ['https://www.googleapis.com/auth/webmasters.readonly'];

export type GscRow = { page: string; clicks: number; impressions: number; ctr: number; position: number };
export type GscPage = { clicks: number; impressions: number; ctr: number; position: number; page: string; days: number; from: string; to: string };

export function gscConfigured(): boolean {
  return !!((process.env.GOOGLE_SA_JSON || '').trim() && (process.env.GSC_SITE_URL || '').trim());
}
function isoDate(d: Date): string { return d.toISOString().slice(0, 10); }
function todayVN(): string { return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10); }

export async function querySearchAnalytics(opts: { days?: number; dimensions?: string[]; rowLimit?: number; pageFilter?: string } = {}): Promise<{ rows: GscRow[]; from: string; to: string }> {
  const site = (process.env.GSC_SITE_URL || '').trim();
  if (!site) throw new Error('Chưa đặt GSC_SITE_URL');
  const token = await googleAccessToken(SCOPE);
  const days = opts.days ?? 28;
  // Search Console trễ ~2 ngày; lấy tới hôm kia.
  const to = new Date(Date.now() - 2 * 24 * 3600 * 1000);
  const from = new Date(to.getTime() - (days - 1) * 24 * 3600 * 1000);
  const body: any = { startDate: isoDate(from), endDate: isoDate(to), dimensions: opts.dimensions ?? ['page'], rowLimit: opts.rowLimit ?? 500, dataState: 'final' };
  if (opts.pageFilter) body.dimensionFilterGroups = [{ filters: [{ dimension: 'page', operator: 'contains', expression: opts.pageFilter }] }];
  const r = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store',
  });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Search Console ${r.status}: ${String(j.error?.message || '').slice(0, 200)}`);
  const rows: GscRow[] = (j.rows || []).map((x: any) => ({ page: String(x.keys?.[0] || ''), clicks: Number(x.clicks) || 0, impressions: Number(x.impressions) || 0, ctr: Number(x.ctr) || 0, position: Number(x.position) || 0 }));
  return { rows, from: isoDate(from), to: isoDate(to) };
}

// Kéo số theo trang, ghi mkt_metrics: entity_ref = id bài (khớp slug), '__gsc_site__' = tổng cả site.
export async function pullSearchConsole(client: Client): Promise<{ pulled: number; matched: number; errors: string[]; skipped?: string }> {
  if (!gscConfigured()) return { pulled: 0, matched: 0, errors: [], skipped: 'chưa cấu hình GOOGLE_SA_JSON / GSC_SITE_URL' };
  const errors: string[] = [];
  let res: { rows: GscRow[]; from: string; to: string };
  try { res = await querySearchAnalytics({ days: 28, dimensions: ['page'], rowLimit: 1000 }); } catch (e: any) { return { pulled: 0, matched: 0, errors: [String(e?.message || e).slice(0, 200)] }; }
  const metricDate = todayVN();
  // Khớp slug -> id bài: id8 từ slug, tra mkt_content theo prefix (uuid không LIKE được, quét 600 bài mới nhất).
  const { data: contents } = await client.from('mkt_content').select('id').is('deleted_at', null).order('created_at', { ascending: false }).limit(600);
  const byPrefix = new Map<string, string>();
  for (const c of (contents || []) as any[]) byPrefix.set(String(c.id).slice(0, 8), String(c.id));
  const rows: any[] = [];
  let matched = 0;
  const site = { clicks: 0, impressions: 0, posW: 0 };
  for (const r of res.rows) {
    site.clicks += r.clicks; site.impressions += r.impressions; site.posW += r.position * r.impressions;
    const m = r.page.match(/\/blog\/([^/?#]+)/);
    const id8 = m ? contentIdFromSlug(m[1]) : null;
    const cid = id8 ? byPrefix.get(id8) : null;
    if (!cid) continue;
    matched += 1;
    const metrics: GscPage = { clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position, page: r.page, days: 28, from: res.from, to: res.to };
    rows.push({ source: 'gsc', entity_ref: cid, metric_date: metricDate, metrics });
  }
  rows.push({ source: 'gsc', entity_ref: '__gsc_site__', metric_date: metricDate, metrics: { clicks: site.clicks, impressions: site.impressions, ctr: site.impressions ? site.clicks / site.impressions : 0, position: site.impressions ? site.posW / site.impressions : 0, pages: res.rows.length, days: 28, from: res.from, to: res.to, site: process.env.GSC_SITE_URL } });
  const { error } = await client.from('mkt_metrics').insert(rows);
  if (error) errors.push(error.message);
  return { pulled: error ? 0 : rows.length, matched, errors };
}

// Đọc snapshot GSC mới nhất cho từng bài (trang SEO). Trả Map contentId -> GscPage, kèm tổng site.
export async function loadGscLatest(client: Client): Promise<{ byCid: Map<string, GscPage>; site: any | null; at: string | null }> {
  const { data } = await client.from('mkt_metrics').select('entity_ref, metrics, created_at').eq('source', 'gsc').order('created_at', { ascending: false }).limit(1500);
  const byCid = new Map<string, GscPage>();
  let site: any = null; let at: string | null = null;
  for (const r of (data || []) as any[]) {
    const k = String(r.entity_ref || '');
    if (!at) at = String(r.created_at);
    if (k === '__gsc_site__') { if (!site) site = r.metrics; continue; }
    if (!byCid.has(k)) byCid.set(k, r.metrics as GscPage);
  }
  return { byCid, site, at };
}
