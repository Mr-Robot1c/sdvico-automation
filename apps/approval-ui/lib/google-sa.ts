// lib/google-sa.ts — xác thực TÀI KHOẢN DỊCH VỤ Google (bản TS cho app; cùng thuật toán với
// packages/marketing/src/google-sa.mjs). Không dùng googleapis để gói Vercel nhẹ (sự cố 8/9).
// Dùng cho Search Console (lib/gsc.ts) và xoá file Drive (lib/gdrive.ts).
// Env: GOOGLE_SA_JSON = JSON khoá service account (nguyên văn hoặc base64). Không commit (điều cấm 7).
import { createSign } from 'node:crypto';

let cached: { token: string | null; exp: number; scope: string } = { token: null, exp: 0, scope: '' };

export function loadServiceAccount(): { email: string; key: string } | null {
  const raw = (process.env.GOOGLE_SA_JSON || '').trim();
  if (!raw) return null;
  try {
    const txt = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
    const j = JSON.parse(txt);
    if (!j.client_email || !j.private_key) return null;
    return { email: String(j.client_email), key: String(j.private_key).replace(/\\n/g, '\n') };
  } catch { return null; }
}
export function serviceAccountEmail(): string | null { return loadServiceAccount()?.email || null; }

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

export async function googleAccessToken(scopes: string[]): Promise<string> {
  const sa = loadServiceAccount();
  if (!sa) throw new Error('Chưa đặt GOOGLE_SA_JSON (khoá tài khoản dịch vụ Google)');
  const scope = scopes.join(' ');
  if (cached.token && cached.scope === scope && Date.now() < cached.exp - 60_000) return cached.token;
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({ iss: sa.email, scope, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claim}`);
  const sig = b64url(signer.sign(sa.key));
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${header}.${claim}.${sig}` }),
    cache: 'no-store',
  });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error(`Google token lỗi ${r.status}: ${String(j.error_description || j.error || '').slice(0, 160)}`);
  cached = { token: String(j.access_token), exp: Date.now() + (Number(j.expires_in) || 3600) * 1000, scope };
  return cached.token!;
}
