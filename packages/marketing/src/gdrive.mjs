// gdrive.mjs — KHO TƯ LIỆU trên GOOGLE DRIVE (15/9, sếp: "video/ảnh Zalo sau này up lên Google Drive,
// sợ Supabase mau đầy"; Thanh chốt: Drive lưu file, Supabase chỉ giữ link).
//
// Quy ước: brand_assets.storage_path = "gdrive:<fileId>/<tên file>" (tên file để suy đuôi -> mime, và
// để người nhìn hiểu). Mọi chỗ đọc URL đi qua asset-url.mjs / lib/asset-url.ts, không tự ghép URL.
// Tư liệu CŨ trên Supabase Storage giữ nguyên (không dời).
//
// Env: GOOGLE_SA_JSON (khoá tài khoản dịch vụ), GDRIVE_FOLDER_ID (thư mục đã chia sẻ cho email của
// tài khoản dịch vụ với quyền Người chỉnh sửa). Thiếu 1 trong 2 -> driveEnabled() = false, mọi thứ
// chạy như cũ trên Supabase. Xem docs/runbook-google-drive-setup.md.
import { googleAccessToken } from './google-sa.mjs';

const SCOPE = ['https://www.googleapis.com/auth/drive'];

// 16/9: Google KHÔNG cho tài khoản dịch vụ giữ file trên My Drive ("Service Accounts do not have storage
// quota"; chỉ Shared Drive của Workspace). Nên đường CHÍNH là OAuth tài khoản công ty (GDRIVE_REFRESH_TOKEN
// lấy bằng google-oauth-drive.mjs, cùng GOOGLE_CLIENT_ID/SECRET của YouTube); tài khoản dịch vụ chỉ còn là
// dự phòng khi thư mục là Shared Drive.
let oauthCache = { token: null, exp: 0 };
// OAuth client dùng chung với YouTube (trên Vercel đặt tên YOUTUBE_CLIENT_ID/SECRET; GOOGLE_CLIENT_* là tên cũ).
export function oauthClient(env = process.env) {
  const id = String(env.GOOGLE_CLIENT_ID || env.YOUTUBE_CLIENT_ID || '').trim();
  const secret = String(env.GOOGLE_CLIENT_SECRET || env.YOUTUBE_CLIENT_SECRET || '').trim();
  return id && secret ? { id, secret } : null;
}
export function driveOAuthConfigured(env = process.env) {
  return !!(String(env.GDRIVE_REFRESH_TOKEN || '').trim() && oauthClient(env));
}
export function driveEnabled(env = process.env) {
  return !!String(env.GDRIVE_FOLDER_ID || '').trim() && (driveOAuthConfigured(env) || !!String(env.GOOGLE_SA_JSON || '').trim());
}
async function driveToken(env = process.env) {
  if (driveOAuthConfigured(env)) {
    if (oauthCache.token && Date.now() < oauthCache.exp - 60_000) return oauthCache.token;
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: oauthClient(env).id, client_secret: oauthClient(env).secret, refresh_token: env.GDRIVE_REFRESH_TOKEN, grant_type: 'refresh_token' }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.access_token) throw new Error(`Drive OAuth lỗi ${r.status}: ${String(j.error_description || j.error || '').slice(0, 160)}`);
    oauthCache = { token: j.access_token, exp: Date.now() + (Number(j.expires_in) || 3600) * 1000 };
    return oauthCache.token;
  }
  return googleAccessToken(SCOPE, env);
}
export function isDrivePath(storagePath) {
  return /^gdrive:/.test(String(storagePath || ''));
}
export function parseDrivePath(storagePath) {
  const m = String(storagePath || '').match(/^gdrive:([^/]+)(?:\/(.*))?$/);
  return m ? { id: m[1], name: m[2] || '' } : null;
}
// URL công khai để trình duyệt / Facebook / ffmpeg tải thẳng. Ảnh dùng máy chủ ảnh của Google (nhanh,
// có cache); video dùng đường tải trực tiếp (file < 100 MB không qua trang cảnh báo virus).
export function driveUrl(storagePath, kind = '') {
  const p = parseDrivePath(storagePath);
  if (!p) return null;
  const isVideo = kind === 'video' || kind === 'clip' || /\.(mp4|mov|m4v|webm)$/i.test(p.name);
  return isVideo
    ? `https://drive.google.com/uc?export=download&id=${p.id}`
    : `https://lh3.googleusercontent.com/d/${p.id}`;
}

// Up 1 file (Buffer) vào thư mục kho; đặt quyền "ai có link xem được"; trả storage_path chuẩn.
export async function uploadToDrive({ name, buf, mime, folderId = process.env.GDRIVE_FOLDER_ID, env = process.env }) {
  if (!driveEnabled(env)) throw new Error('Google Drive chưa cấu hình (GDRIVE_FOLDER_ID + GDRIVE_REFRESH_TOKEN hoặc GOOGLE_SA_JSON)');
  const token = await driveToken(env);
  const meta = JSON.stringify({ name, parents: [folderId] });
  const boundary = 'sdvico' + Date.now();
  const head = Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`);
  const tail = Buffer.from(`\r\n--${boundary}--`);
  const body = Buffer.concat([head, buf, tail]);
  const r = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,size', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}`, 'Content-Length': String(body.length) },
    body,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.id) throw new Error(`Drive upload lỗi ${r.status}: ${String(j.error?.message || '').slice(0, 200)}`);
  // Quyền xem công khai theo link (để web + Facebook + ffmpeg tải được không cần token).
  const pr = await fetch(`https://www.googleapis.com/drive/v3/files/${j.id}/permissions?supportsAllDrives=true`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'reader', type: 'anyone' }),
  });
  if (!pr.ok) console.warn(`  (Drive: không đặt được quyền công khai cho ${j.id}: ${pr.status})`);
  return { id: j.id, storagePath: `gdrive:${j.id}/${name}`, size: Number(j.size) || buf.length };
}

export async function deleteFromDrive(storagePath, env = process.env) {
  const p = parseDrivePath(storagePath);
  if (!p) return false;
  const token = await driveToken(env);
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${p.id}?supportsAllDrives=true`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
  return r.ok || r.status === 404;
}

// Tải file về Buffer (dùng token nếu có, để không phụ thuộc trang cảnh báo virus của link công khai).
export async function downloadFromDrive(storagePath, env = process.env) {
  const p = parseDrivePath(storagePath);
  if (!p) throw new Error('không phải đường dẫn gdrive:');
  if (driveEnabled(env)) {
    const token = await driveToken(env);
    const r = await fetch(`https://www.googleapis.com/drive/v3/files/${p.id}?alt=media&supportsAllDrives=true`, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) throw new Error(`Drive tải ${p.id}: ${r.status}`);
    return Buffer.from(await r.arrayBuffer());
  }
  const r = await fetch(`https://drive.google.com/uc?export=download&id=${p.id}`);
  if (!r.ok) throw new Error(`Drive tải công khai ${p.id}: ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

// Dung lượng thư mục kho trên Drive (để trang Kho tư liệu hiện "đã dùng X MB").
export async function driveFolderUsage(folderId = process.env.GDRIVE_FOLDER_ID, env = process.env) {
  const token = await driveToken(env);
  let pageToken = '';
  let bytes = 0, files = 0;
  do {
    const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
    const r = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=nextPageToken,files(size)&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true${pageToken ? `&pageToken=${pageToken}` : ''}`, { headers: { Authorization: `Bearer ${token}` } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`Drive list ${r.status}`);
    for (const f of j.files || []) { bytes += Number(f.size) || 0; files += 1; }
    pageToken = j.nextPageToken || '';
  } while (pageToken);
  return { bytes, files };
}
