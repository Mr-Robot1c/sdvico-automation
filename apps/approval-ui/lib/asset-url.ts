// lib/asset-url.ts — MỘT chỗ đổi brand_assets.storage_path thành URL (15/9: kho tư liệu Zalo chuyển
// dần sang Google Drive, storage_path = "gdrive:<fileId>/<tên file>"; tư liệu cũ vẫn ở Supabase Storage).
// Cùng luật với packages/marketing/src/asset-url.mjs + gdrive.mjs.
import type { getServerClient } from './supabase-server';

type Client = ReturnType<typeof getServerClient>;

export function isDrivePath(storagePath: string | null | undefined): boolean {
  return /^gdrive:/.test(String(storagePath || ''));
}
export function parseDrivePath(storagePath: string): { id: string; name: string } | null {
  const m = String(storagePath || '').match(/^gdrive:([^/]+)(?:\/(.*))?$/);
  return m ? { id: m[1], name: m[2] || '' } : null;
}
export function driveUrl(storagePath: string, kind = ''): string | null {
  const p = parseDrivePath(storagePath);
  if (!p) return null;
  const isVideo = kind === 'video' || kind === 'clip' || /\.(mp4|mov|m4v|webm)$/i.test(p.name);
  return isVideo ? `https://drive.google.com/uc?export=download&id=${p.id}` : `https://lh3.googleusercontent.com/d/${p.id}`;
}
export function assetPublicUrl(client: Client, storagePath: string, kind = ''): string {
  const sp = String(storagePath || '');
  if (isDrivePath(sp)) return driveUrl(sp, kind) || '';
  return client.storage.from('brand-assets').getPublicUrl(sp).data.publicUrl;
}
export function driveConfigured(): boolean {
  const oauth = !!((process.env.GDRIVE_REFRESH_TOKEN || '').trim() && (process.env.GOOGLE_CLIENT_ID || process.env.YOUTUBE_CLIENT_ID || '').trim());
  return !!(process.env.GDRIVE_FOLDER_ID || '').trim() && (oauth || !!(process.env.GOOGLE_SA_JSON || '').trim());
}
// 16/9: Google không cho tài khoản dịch vụ giữ file My Drive -> file do OAuth tài khoản công ty tạo (GDRIVE_REFRESH_TOKEN,
// cùng client YouTube). Xoá cũng phải bằng token đó; tài khoản dịch vụ chỉ là dự phòng (Shared Drive).
async function driveToken(): Promise<string | null> {
  const rt = (process.env.GDRIVE_REFRESH_TOKEN || '').trim();
  const id = (process.env.GOOGLE_CLIENT_ID || process.env.YOUTUBE_CLIENT_ID || '').trim();
  const secret = (process.env.GOOGLE_CLIENT_SECRET || process.env.YOUTUBE_CLIENT_SECRET || '').trim();
  if (rt && id && secret) {
    const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: id, client_secret: secret, refresh_token: rt, grant_type: 'refresh_token' }), cache: 'no-store' });
    const j: any = await r.json().catch(() => ({}));
    return r.ok && j.access_token ? String(j.access_token) : null;
  }
  if ((process.env.GOOGLE_SA_JSON || '').trim()) {
    const { googleAccessToken } = await import('./google-sa');
    return googleAccessToken(['https://www.googleapis.com/auth/drive']);
  }
  return null;
}
// Xoá file trên Drive (khi người xoá tư liệu ở /tu-lieu). Không có khoá -> bỏ qua, trả false.
export async function deleteDriveFile(storagePath: string): Promise<boolean> {
  const p = parseDrivePath(storagePath);
  if (!p) return false;
  const token = await driveToken();
  if (!token) return false;
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${p.id}?supportsAllDrives=true`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
  return r.ok || r.status === 404;
}
