// gop-zalo.mjs — gộp kết quả quét Zalo (trich-zalo.js) vào kho trên máy, tách TIN MỚI thành file đọc được cho AI Data 1.
// 19/10/2026: thay phiên đọc Zalo trên laptop Windows. Bản cũ đẩy NGUYÊN zalo-messages.jsonl (4.562 tin) lên bucket mỗi ngày,
// còn run-knowledge-now chỉ tóm tắt 12.000 ký tự ĐẦU file, tức phần tin cũ nhất: tin mới gần như không được học.
// Nay: kho tổng giữ trên máy (DATA_DIR/kho/zalo-messages.jsonl, dùng để biết mốc đã quét), tin mới mỗi nhóm mỗi ngày
// thành DATA_DIR/Zalo/zalo-tin-<ngày>-<nhóm>.md, file nhỏ, đẩy lên bucket rồi tóm tắt từng file.
//
// Chạy (DATA_DIR mặc định ~/Desktop/SDVICO/ZALO-Data, đổi bằng env ZALO_DATA_DIR):
//   node scripts/quet-zalo/gop-zalo.mjs moc                 in JSON {tên nhóm: mốc ms đã có} cho các nhóm bat=true
//   node scripts/quet-zalo/gop-zalo.mjs gop                 gộp mọi file kho/quet/*.jsonl, ghi file tin mới, chuyển file quét sang kho/quet/da-gop
//   node scripts/quet-zalo/gop-zalo.mjs khoi-tao <file>     nạp kho tổng ban đầu (bản zalo-messages.jsonl tải từ bucket)
//   node scripts/quet-zalo/gop-zalo.mjs dong-goi            ghép mọi file da-day/*.md thành DATA/drive/zalo-<ngày giờ>.md (một file
//                                                      mỗi lần chạy, chia mục theo nhóm) để phiên Claude đẩy lên Google Drive,
//                                                      rồi XOÁ file đã ghép, file quét đã gộp, và cắt kho tổng còn 30 ngày (Thanh 19/10:
//                                                      "up lên drive để lưu trữ, khi cần kéo qua làm video, file trên máy tự xoá")
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, renameSync, appendFileSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = process.env.ZALO_DATA_DIR || join(homedir(), 'Desktop', 'SDVICO', 'ZALO-Data');
const KHO = join(DATA_DIR, 'kho');
const MASTER = join(KHO, 'zalo-messages.jsonl');
const QUET = join(KHO, 'quet');
const OUT = join(DATA_DIR, 'Zalo');
// Lần đầu hay sau nhiều ngày nghỉ: chỉ vét tối đa 14 ngày, tránh cuộn cả tháng làm Zalo treo.
const MAX_BACK_MS = 14 * 24 * 3600e3;

const CONFIG = JSON.parse(readFileSync(join(HERE, 'nhom-zalo.json'), 'utf8')).nhom;
const byName = new Map(CONFIG.flatMap((g) => [g.ten, ...(g.ten_cu || [])].map((n) => [n, g])));
const dayVN = (ts) => new Date(Number(ts) + 7 * 3600e3).toISOString().slice(0, 10);
const hhmm = (ts) => new Date(Number(ts) + 7 * 3600e3).toISOString().slice(11, 16);
const slug = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'zalo';

export function readJsonl(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8').split('\n').filter((l) => l.trim()).flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } });
}
const keyOf = (r) => `${r.group}|${r.ts}`;

export function moc(rows, now = Date.now()) {
  const out = {};
  for (const g of CONFIG.filter((x) => x.bat)) {
    const names = new Set([g.ten, ...(g.ten_cu || [])]);
    const last = Math.max(0, ...rows.filter((r) => names.has(r.group) && r.ts).map((r) => Number(r.ts)));
    out[g.ten] = Math.max(last, now - MAX_BACK_MS);
  }
  return out;
}

// Gộp: bỏ tin trùng (cùng nhóm + mốc ms), gắn groupKey, trả về tin MỚI.
export function merge(master, scanned) {
  const seen = new Set(master.map(keyOf));
  const fresh = [];
  // Zalo Web trả tên có khoảng trắng không ngắt (\u00a0) và có lúc dạng Unicode tổ hợp: chuẩn hoá trước khi so.
  const sp = (x) => (x == null ? x : String(x).normalize('NFC').replace(/\u00a0/g, ' '));
  for (const raw of scanned) {
    const r = raw && { ...raw, group: sp(raw.group), sender: sp(raw.sender), text: sp(raw.text) };
    if (!r || !r.group || !r.ts || seen.has(keyOf(r))) continue;
    const g = byName.get(r.group);
    if (!g) continue; // nhóm không có trong danh sách (vd tin nhắn riêng mở nhầm): không lưu
    seen.add(keyOf(r));
    fresh.push({ group: r.group, groupKey: g.key, ts: Number(r.ts), timeIso: r.timeIso, sender: r.sender || null, type: r.type, text: r.text ?? null, ...(r.msgId ? { msgId: r.msgId } : {}), ...(r.href ? { href: r.href } : {}) });
  }
  return fresh.sort((a, b) => a.ts - b.ts);
}

const LABEL = { image: '[ảnh]', video: '[video]', file: '[file]', link: '[link]', sticker: '[sticker]', other: '[khác]' };
export function digest(groupName, day, rows) {
  const lines = [`# Zalo nhóm "${groupName}" ngày ${day}`, '', `Tin mới đọc tự động từ Zalo Web (${rows.length} tin). Nguồn nội bộ, chỉ dùng cho AI Data 1 học.`, ''];
  for (const r of rows) {
    const tag = r.type && r.type !== 'text' ? `${LABEL[r.type] || `[${r.type}]`} ` : '';
    lines.push(`- ${hhmm(r.ts)} ${r.sender || '(không rõ)'}: ${tag}${String(r.text || '').replace(/\n+/g, ' / ')}`.trimEnd());
  }
  return lines.join('\n') + '\n';
}

function main() {
  const [cmd, arg] = process.argv.slice(2);
  mkdirSync(QUET, { recursive: true });
  mkdirSync(OUT, { recursive: true });
  const master = readJsonl(MASTER);
  if (cmd === 'moc') { console.log(JSON.stringify(moc(master), null, 1)); return; }
  if (cmd === 'khoi-tao') {
    if (master.length) { console.log(`Kho đã có ${master.length} tin, không nạp lại.`); return; }
    const rows = readJsonl(arg).filter((r) => r.group && r.ts);
    writeFileSync(MASTER, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
    console.log(`Đã nạp ${rows.length} tin vào ${MASTER}`);
    return;
  }
  if (cmd === 'gop') {
    // File trang Zalo tải về (trich-zalo.js taiVe) nằm ở Downloads: chuyển hết sang kho/quet trước, Downloads sạch.
    const DL = join(homedir(), 'Downloads');
    for (const f of (existsSync(DL) ? readdirSync(DL) : []).filter((x) => /^zalo-quet-.*\.jsonl$/.test(x))) renameSync(join(DL, f), join(QUET, f));
    const files = readdirSync(QUET).filter((f) => f.endsWith('.jsonl'));
    const scanned = files.flatMap((f) => readJsonl(join(QUET, f)));
    const fresh = merge(master, scanned);
    if (fresh.length) appendFileSync(MASTER, fresh.map((r) => JSON.stringify(r)).join('\n') + '\n');
    const buckets = new Map();
    for (const r of fresh) {
      const k = `${dayVN(r.ts)}|${r.group}`;
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k).push(r);
    }
    // Tên file kèm giờ gộp: quét 2 lần trong ngày thì ra 2 file khác tên. Bản cũ cùng tên ghi đè bản trước (mất tin trên
    // bucket) và run-knowledge-now bỏ qua vì đường dẫn đã học (lỗi 19/10, nhóm Triển Khai Kinh Doanh).
    const run = new Date(Date.now() + 7 * 3600e3).toISOString().slice(11, 16).replace(':', 'h');
    for (const [k, rows] of buckets) {
      const [day, group] = k.split('|');
      writeFileSync(join(OUT, `zalo-tin-${day}-${byName.get(group)?.key || slug(group)}-${run}.md`), digest(group, day, rows));
    }
    mkdirSync(join(QUET, 'da-gop'), { recursive: true });
    for (const f of files) renameSync(join(QUET, f), join(QUET, 'da-gop', f));
    console.log(`Gộp ${files.length} file quét: ${fresh.length} tin mới, ${buckets.size} file tin mới trong ${OUT}`);
    return;
  }
  if (cmd === 'dong-goi') {
    const DA_DAY = join(DATA_DIR, 'da-day');
    const DRIVE = join(DATA_DIR, 'drive');
    mkdirSync(DRIVE, { recursive: true });
    const mds = (existsSync(DA_DAY) ? readdirSync(DA_DAY) : []).filter((f) => /^zalo-tin-.*\.md$/.test(f)).sort();
    if (mds.length) {
      const stamp = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 16).replace('T', '-').replace(':', 'h');
      const parts = mds.map((f) => readFileSync(join(DA_DAY, f), 'utf8').replace(/^# /, '## ').trim());
      const out = join(DRIVE, `zalo-${stamp}.md`);
      writeFileSync(out, `# Zalo SDVICO, lần quét ${stamp}\n\n${mds.length} mục (mỗi nhóm mỗi ngày một mục). Dữ liệu nội bộ, không chia sẻ ra ngoài.\n\n${parts.join('\n\n')}\n`);
      for (const f of mds) unlinkSync(join(DA_DAY, f));
      console.log(`Đóng gói ${mds.length} file vào ${out}`);
    } else console.log('Không có file mới để đóng gói.');
    const DG = join(QUET, 'da-gop');
    for (const f of existsSync(DG) ? readdirSync(DG) : []) unlinkSync(join(DG, f));
    // Kho tổng chỉ cần để biết mốc đã quét: giữ 30 ngày gần nhất, cũ hơn đã nằm trên Drive và bucket.
    const keepFrom = Date.now() - 30 * 24 * 3600e3;
    const kept = master.filter((r) => Number(r.ts) >= keepFrom);
    if (kept.length < master.length) writeFileSync(MASTER, kept.map((r) => JSON.stringify(r)).join('\n') + '\n');
    console.log(`Dọn: xoá file quét đã gộp, kho tổng còn ${kept.length}/${master.length} tin (30 ngày).`);
    return;
  }
  console.log('Dùng: node scripts/quet-zalo/gop-zalo.mjs moc | gop | khoi-tao <file> | dong-goi');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
