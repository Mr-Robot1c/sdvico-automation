// Nạp env cho dây chuyền video chạy máy nội bộ.
// Ưu tiên SUPABASE_URL cloud (supabase.co); bỏ qua .env.local GIẢ trỏ localhost.
// Đi ngược cây thư mục tìm .env thật (checkout chính giữ .env, gitignored — điều cấm 7).
// KHÔNG in giá trị bí mật, KHÔNG commit .env.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, parse } from 'node:path';

function parseEnv(path) {
  const out = {};
  try {
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
    }
  } catch { /* bỏ qua file không đọc được */ }
  return out;
}

function isCloud(env) {
  return (env.SUPABASE_URL || '').includes('supabase.co') && !!env.SUPABASE_SERVICE_ROLE_KEY;
}

// Nạp env thật vào process.env (không ghi đè biến đã có). Trả về process.env.
export function loadRealEnv() {
  if (isCloud(process.env)) return process.env;
  let dir = dirname(fileURLToPath(import.meta.url));
  const root = parse(dir).root;
  const candidates = [];
  while (true) {
    candidates.push(join(dir, '.env'));
    candidates.push(join(dir, 'apps', 'approval-ui', '.env.local'));
    if (dir === root) break;
    dir = dirname(dir);
  }
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    const env = parseEnv(path);
    if (isCloud(env)) {
      for (const [k, v] of Object.entries(env)) if (!process.env[k]) process.env[k] = v;
      process.env._ENV_SOURCE = path;
      return process.env;
    }
  }
  throw new Error(
    'Khong tim thay .env co SUPABASE_URL cloud (supabase.co) + SERVICE_ROLE_KEY. ' +
    'May noi bo can .env that (khong commit).'
  );
}
