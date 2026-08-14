// Áp một file .sql lên Supabase qua DATABASE_URL (máy nội bộ, dùng .env thật, không commit khóa).
// Repo trước đây không áp được migration cục bộ; công cụ này lấp chỗ đó cho máy nội bộ.
// Chạy: node packages/marketing/src/db-apply.mjs supabase/migrations/<ten>.sql
//   (nhiều file: liệt kê nhiều đường dẫn; chạy tuần tự trong 1 transaction mỗi file)
// CHỈ chạy tay khi biết rõ nội dung SQL. Không dùng cho migration phá hủy mà chưa rà.
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { loadRealEnv } from './video/env.mjs';

const env = loadRealEnv();
const url = env.DATABASE_URL;
if (!url) { console.error('Thiếu DATABASE_URL trong .env thật.'); process.exit(1); }

const files = process.argv.filter((a) => a.endsWith('.sql'));
const force = process.argv.includes('--force');
if (!files.length) { console.error('Cú pháp: db-apply.mjs <file.sql> [file2.sql ...] [--force]'); process.exit(1); }

// CHỐT AN TOÀN: DATABASE_URL phải cùng project với SUPABASE_URL, nếu không dễ áp nhầm DB.
// (Từng dính: .env có DATABASE_URL trỏ project cũ còn SUPABASE_URL là project mới.)
const ref = (env.SUPABASE_URL || '').match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
if (ref && !url.includes(ref) && !force) {
  console.error(`TỪ CHỐI: DATABASE_URL không chứa project ref của SUPABASE_URL (${ref}).`);
  console.error('DATABASE_URL đang trỏ project khác. Sửa .env cho khớp, hoặc chạy lại với --force nếu cố ý.');
  process.exit(2);
}

// Tự tách connection string (né parser URL của pg vốn kén ký tự đặc biệt trong mật khẩu:
// # ? / % ... mà mật khẩu Supabase hay có). Lấy @ CUỐI làm ranh giới mật khẩu | host.
function parsePg(u) {
  const m = u.match(/^postgres(?:ql)?:\/\/([^:@/]+):(.*)@([^:/]+):(\d+)\/(.+?)(?:\?.*)?$/);
  if (!m) return null;
  return { user: m[1], password: m[2], host: m[3], port: Number(m[4]), database: m[5] };
}
const parsed = parsePg(url);
if (!parsed) { console.error('DATABASE_URL không đúng dạng postgres://user:pass@host:port/db.'); process.exit(1); }
const client = new pg.Client({ ...parsed, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  for (const f of files) {
    const sql = readFileSync(f, 'utf8');
    console.log(`\n== Áp ${f} (${sql.length} ký tự) ==`);
    await client.query('begin');
    try {
      await client.query(sql);
      await client.query('commit');
      console.log('  OK');
    } catch (e) {
      await client.query('rollback');
      console.error('  LỖI (đã rollback):', e.message);
      process.exitCode = 1;
    }
  }
  // Nạp lại schema cache của PostgREST để supabase-js (REST) thấy cột/bảng mới ngay.
  try {
    await client.query("notify pgrst, 'reload schema'");
    console.log('\nĐã yêu cầu PostgREST nạp lại schema.');
  } catch (e) {
    console.warn('Không notify pgrst được:', e.message);
  }
} finally {
  await client.end();
}
