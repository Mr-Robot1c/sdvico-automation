// tai-bu-media-zalo.mjs - LUOI AN TOAN dau vao kho tu lieu (user 9/9): phien Chrome 16:00 doc
// Zalo ghi href (link CDN Zalo, tu 4/9 co cho 100% tin video) vao Zalo/zalo-messages.jsonl;
// tin nao co href ma CHUA co file trong Zalo/media (phien hut han muc 15 video, phien loi, tin
// don) thi script nay tai thang tu CDN (do 9/9: HEAD 200 khong can dang nhap), dat ten chuan,
// ghi media_file nguoc vao jsonl, noi GHI-CHU-nguon-goc.md. Chay TRUOC hoc-video trong
// scripts/day-kho-zalo*.bat. Khong dung Gemini, khong dung Supabase.
//
// Chay tay: node packages/marketing/src/tai-bu-media-zalo.mjs [--dry-run] [--limit 20] [--force-msg <msgId>]
//
// Dieu cam 6: KHONG tai anh nhom CSKH (CCCD, hoa don khach) - chi ghi chu cho nguoi xem.
// Video moi nhom deu tai; anh chi nhom tkkd/congviec/sxkt/sdfish. media_file "bo-qua: ..." la
// quyet dinh cua phien doc, ton trong, khong tai lai.
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, appendFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ZALO_DIR = resolve('./Zalo');
const JSONL = join(ZALO_DIR, 'zalo-messages.jsonl');
const MEDIA_DIR = join(ZALO_DIR, 'media');
const LOCK = join(ZALO_DIR, '.lock');
const DRY = process.argv.includes('--dry-run');
const argOf = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const LIMIT = Number(argOf('limit', '20')) || 20;
const FORCE_MSG = argOf('force-msg', null);
const MAX_BYTES = 60 * 1024 * 1024;
const GROUP_CODE = {
  'trien-khai-kinh-doanh': 'tkkd', 'sdvico-cong-viec': 'congviec', 'sdvico-san-xuat-dv-ky-thuat': 'sxkt',
  'sdvico-cskh': 'cskh', 'sdvico-sdfish': 'sdfish',
};
const IMAGE_OK_GROUPS = new Set(['tkkd', 'congviec', 'sxkt', 'sdfish']);

if (!existsSync(JSONL)) { console.log('Khong thay', JSONL, '- bo qua.'); process.exit(0); }
// Phien 16:00 dang chay (lock < 2 gio) thi de lan sau, tranh 2 ben cung ghi jsonl.
try {
  const t = Date.parse(readFileSync(LOCK, 'utf8').trim());
  if (!Number.isNaN(t) && Date.now() - t < 2 * 3600e3) { console.log('Zalo/.lock con hieu luc (phien doc dang chay) - de lan sau.'); process.exit(0); }
} catch { /* khong co lock */ }

const slug = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'zalo';
const dayVN = (ts) => new Date(Number(ts) + 7 * 3600e3).toISOString().slice(0, 10);
const timeVN = (ts) => new Date(Number(ts) + 7 * 3600e3).toISOString().slice(11, 16);

function sniff(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'jpg';
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'png';
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[8] === 0x57 && buf[9] === 0x45) return 'webp';
  if (buf.subarray(4, 8).toString('ascii') === 'ftyp') return 'mp4';
  if (buf[0] === 0xff && buf[1] === 0x0a) return 'jxl';
  return null;
}

function nextIndex(dir, day) {
  let max = 0;
  try {
    for (const f of readdirSync(dir)) {
      const m = f.match(new RegExp(`^${day}-(\\d{2})-`));
      if (m) max = Math.max(max, Number(m[1]));
    }
  } catch { /* folder chua co */ }
  return String(max + 1).padStart(2, '0');
}

const lines = readFileSync(JSONL, 'utf8').split(/\r?\n/);
const todo = [];
for (let i = 0; i < lines.length; i++) {
  const raw = lines[i];
  if (!raw.trim()) continue;
  let o; try { o = JSON.parse(raw); } catch { continue; }
  if (!/^(video|image|photo)$/.test(String(o.type || ''))) continue;
  if (!o.href || !o.ts) continue;
  const isVideo = o.type === 'video';
  const code = GROUP_CODE[o.groupKey] || 'zalo';
  const forced = FORCE_MSG && String(o.msgId) === String(FORCE_MSG);
  if (!forced) {
    if (o.media_file && /^bo-qua/i.test(o.media_file)) continue;
    if (o.media_file && existsSync(join(MEDIA_DIR, o.media_file))) continue;
    if (!isVideo && !IMAGE_OK_GROUPS.has(code)) {
      if (!o.media_file) todo.push({ i, o, skip: `anh nhom ${code}: nguoi xem truoc (dieu cam 6)` });
      continue;
    }
  }
  todo.push({ i, o, isVideo, code });
}
console.log(`Tin co href chua co file: ${todo.filter((t) => !t.skip).length} (bo qua cho nguoi xem: ${todo.filter((t) => t.skip).length})${DRY ? ' [DRY-RUN]' : ''}`);
for (const t of todo.filter((x) => x.skip)) console.log(`  - ${dayVN(t.o.ts)} msgId ${t.o.msgId}: ${t.skip}`);

let done = 0, loi = 0, changed = false;
for (const t of todo.filter((x) => !x.skip).slice(0, LIMIT)) {
  const { o, isVideo, code } = t;
  const day = dayVN(o.ts);
  const url = String(o.href).split('?')[0];
  const label = `${day} ${timeVN(o.ts)} ${code} msgId ${o.msgId}`;
  if (DRY) { console.log(`  ~ ${label}: se tai ${isVideo ? 'video' : 'anh'} ${url.replace(/^(https?:\/\/[^/]+).*/, '$1')}/...`); continue; }
  try {
    const head = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(20000) });
    const len = Number(head.headers.get('content-length') || 0);
    if (!head.ok) throw new Error(`HEAD ${head.status}`);
    if (len > MAX_BYTES) throw new Error(`qua lon ${Math.round(len / 1e6)}MB`);
    const res = await fetch(url, { signal: AbortSignal.timeout(180000) });
    if (!res.ok) throw new Error(`GET ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const kind = sniff(buf);
    if (!kind || kind === 'jxl' || (isVideo && kind !== 'mp4') || (!isVideo && kind === 'mp4')) {
      throw new Error(`file khong dung dinh dang (${kind || 'unknown'})${kind === 'jxl' ? ', anh JPEG XL de phien Chrome chuyen' : ''}`);
    }
    const dir = join(MEDIA_DIR, day);
    mkdirSync(dir, { recursive: true });
    const name = `${day}-${nextIndex(dir, day)}-${code}-${slug(o.text) || (isVideo ? 'video-zalo' : 'anh-zalo')}.${kind}`;
    writeFileSync(join(dir, name), buf);
    const rel = `${day}/${name}`;
    lines[t.i] = JSON.stringify({ ...o, media_file: rel, media_by: 'tai-bu-script' });
    changed = true;
    appendFileSync(join(dir, 'GHI-CHU-nguon-goc.md'),
      `- ${rel} | ${isVideo ? 'video' : 'anh'} | gửi ${timeVN(o.ts)} ${day.slice(8, 10)}/${day.slice(5, 7)} | ${o.sender || '?'} | ${o.group || code} | msgId ${o.msgId} | ${String(o.text || '').slice(0, 60) || 'không có chữ kèm'} | tải bù bằng script từ href | chưa kiểm mặt người, xin phép trước khi đăng công khai\n`,
      'utf8');
    done += 1;
    console.log(`  ✓ ${label} -> ${rel} (${Math.round(buf.length / 1024)} KB)`);
  } catch (e) {
    loi += 1;
    console.log(`  X ${label}: ${e?.message || e}`);
  }
}
if (changed && !DRY) writeFileSync(JSONL, lines.join('\n'), { encoding: 'utf8' });
console.log(`\nTai bu media Zalo: ${done} tai moi, ${loi} loi.`);
