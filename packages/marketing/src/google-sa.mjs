// google-sa.mjs — xác thực TÀI KHOẢN DỊCH VỤ Google (service account) không cần thư viện googleapis
// (giữ gói nhẹ; Vercel từng cháy Functions Storage 8/9). Dùng cho Google Drive (kho tư liệu Zalo, 15/9)
// và Search Console (lib/google-sa.ts bên app là bản TS cùng thuật toán).
//
// Env: GOOGLE_SA_JSON = nội dung file JSON khoá service account (nguyên văn hoặc base64). KHÔNG commit
// (điều cấm 7). Cách lấy: docs/runbook-google-drive-setup.md.
import { createSign } from 'node:crypto';

let cached = { token: null, exp: 0, scope: '' };

export function loadServiceAccount(env = process.env) {
  const raw = String(env.GOOGLE_SA_JSON || '').trim();
  if (!raw) return null;
  try {
    const txt = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
    const j = JSON.parse(txt);
    if (!j.client_email || !j.private_key) return null;
    return { email: j.client_email, key: String(j.private_key).replace(/\\n/g, '\n') };
  } catch { return null; }
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

// Trả access token (cache tới gần hết hạn). scopes: mảng URL scope.
export async function googleAccessToken(scopes, env = process.env) {
  const sa = loadServiceAccount(env);
  if (!sa) throw new Error('Chưa đặt GOOGLE_SA_JSON (khoá tài khoản dịch vụ Google)');
  const scope = scopes.join(' ');
  if (cached.token && cached.scope === scope && Date.now() < cached.exp - 60_000) return cached.token;
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({ iss: sa.email, scope, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claim}`);
  const sig = b64url(signer.sign(sa.key));
  const assertion = `${header}.${claim}.${sig}`;
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error(`Google token lỗi ${r.status}: ${String(j.error_description || j.error || '').slice(0, 160)}`);
  cached = { token: j.access_token, exp: Date.now() + (Number(j.expires_in) || 3600) * 1000, scope };
  return cached.token;
}
