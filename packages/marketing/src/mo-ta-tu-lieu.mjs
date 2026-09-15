// mo-ta-tu-lieu.mjs — VIẾT MÔ TẢ cho tư liệu trong kho (brand_assets.description) bằng Gemini.
// 15/9 (sếp, kế hoạch "SDVICO sửa web"): kịch bản phải đi đôi với đúng hình. Dây chuyền video chọn
// cảnh theo cột mô tả này (video/scene-match.mjs). Tư liệu cũ chưa có mô tả -> chạy script này
// bổ sung; tư liệu mới up qua up-media-kho-tu-lieu.mjs đã có mô tả ngay lúc up.
//
// Chạy: node packages/marketing/src/mo-ta-tu-lieu.mjs [--limit 40] [--only-video] [--only-image] [--faststart]
//   --faststart: video Zalo up thô (moov ở cuối file) mở trên web phải tải hết mới phát -> tải về,
//                ffmpeg -c copy -movflags +faststart, up đè cùng đường dẫn. Cần ffmpeg trong PATH.
// Idempotent: chỉ đụng dòng description IS NULL (hoặc --redo). Ảnh: gửi Gemini vision qua URL public.
// Video: dùng bản tóm tắt hoc-video (Zalo/AI/**/video-tom-tat-*.md) nếu có; không có và file <= 20MB
// thì gửi thẳng video cho Gemini; lớn hơn thì bỏ qua (ghi log).
import { createClient } from '@supabase/supabase-js';
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { loadRealEnv } from './video/env.mjs';

const env = loadRealEnv();
const MKT_MODEL = env.MKT_MODEL || 'gemini-flash-lite-latest';
const args = process.argv.slice(2);
const argVal = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const LIMIT = Number(argVal('limit', 60));
const ONLY_VIDEO = args.includes('--only-video');
const ONLY_IMAGE = args.includes('--only-image');
const FASTSTART = args.includes('--faststart');
const REDO = args.includes('--redo');
const MAX_VIDEO_INLINE = 20 * 1024 * 1024;

const client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { GoogleGenAI } = await import('@google/genai');
const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
const aiRoot = resolve('./Zalo/AI');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PROMPT = [
  'Ban mo ta TU LIEU marketing cua SDVICO (thiet bi tau ca: may loc dau, loc nuoc bien, giam sat hanh trinh, dien thoai ve tinh, son, phu gia).',
  'Muc dich: day chuyen video se doc mo ta nay de chon dung hinh cho tung canh (canh VAN DE: may hu, can dau, nuoc duc, tau cu; canh GIAI PHAP: san pham, lap dat, may chay).',
  'Chi tra JSON dung dang, khong them chu ngoai JSON:',
  '{"mo_ta":"1-2 cau tieng Viet co dau: thay gi, o dau, tinh trang (moi/cu/hu/ban/can/duc/dang sua/dang chay), co nguoi khong",',
  ' "hop_canh":["van_de"|"giai_phap"|"doi_song"|"san_pham_moi"|"lap_dat"|"huong_dan"],',
  ' "tu_khoa":["3-8 tu khoa ngan"]}',
  'KHONG bia chi tiet khong thay. Co so dien thoai / ten nguoi thi KHONG ghi.',
].join('\n');

function parseJson(t) {
  const m = String(t || '').match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}
async function gen(parts) {
  const models = [...new Set([MKT_MODEL, 'gemini-3.6-flash', 'gemini-3.5-flash'])];
  let last;
  for (const model of models) {
    for (let i = 0; i < 3; i++) {
      try {
        const res = await ai.models.generateContent({ model, contents: [{ role: 'user', parts }], config: { responseMimeType: 'application/json' } });
        return parseJson(res.text);
      } catch (e) {
        last = e;
        const msg = String(e?.message || e);
        if (!/503|429|500|UNAVAILABLE|INTERNAL|RESOURCE_EXHAUSTED/i.test(msg)) throw e;
        await sleep(1500 * 2 ** i);
      }
    }
  }
  throw last;
}
export function describeToText(j) {
  if (!j || !j.mo_ta) return null;
  const hop = Array.isArray(j.hop_canh) ? j.hop_canh.map(String).join(', ') : '';
  const tk = Array.isArray(j.tu_khoa) ? j.tu_khoa.map(String).join(', ') : '';
  return `${String(j.mo_ta).trim()}${hop ? ` | Hợp cảnh: ${hop}` : ''}${tk ? ` | Từ khoá: ${tk}` : ''}`.slice(0, 1000);
}

function findVideoSummary(name) {
  const base = String(name || '').replace(/\.[^.]+$/, '').toLowerCase();
  if (!base || !existsSync(aiRoot)) return null;
  for (const day of readdirSync(aiRoot)) {
    const dd = join(aiRoot, day);
    try {
      if (!statSync(dd).isDirectory()) continue;
      for (const f of readdirSync(dd)) if (/\.md$/i.test(f) && f.toLowerCase().includes(base)) return readFileSync(join(dd, f), 'utf8');
    } catch { /* bỏ qua */ }
  }
  return null;
}
function hasFfmpeg() { return spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0; }

const publicUrl = (p) => client.storage.from('brand-assets').getPublicUrl(p).data.publicUrl;

let q = client.from('brand_assets')
  .select('id, kind, title, storage_path, source, product_group, license_note, mime, size_bytes, description')
  .in('kind', ONLY_VIDEO ? ['video', 'clip'] : ONLY_IMAGE ? ['image'] : ['image', 'video', 'clip'])
  .neq('source', 'video-pipeline')
  .order('created_at', { ascending: false })
  .limit(LIMIT);
if (!REDO) q = q.is('description', null);
const { data: rows, error } = await q;
if (error) { console.error('Khong doc duoc brand_assets:', error.message, '(da ap migration 20260915130000 chua?)'); process.exit(1); }
console.log(`Tu lieu can mo ta: ${rows.length}${FASTSTART ? ' (kem faststart video)' : ''}`);

const tmp = join(tmpdir(), 'sdvico-mo-ta'); mkdirSync(tmp, { recursive: true });
const ff = FASTSTART && hasFfmpeg();
if (FASTSTART && !ff) console.warn('Khong thay ffmpeg trong PATH, bo qua faststart.');
let ok = 0, skip = 0, loi = 0, fast = 0;
for (const a of rows) {
  const isVideo = a.kind === 'video' || a.kind === 'clip';
  const url = publicUrl(a.storage_path);
  try {
    let j = null;
    if (!isVideo) {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`tai anh ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      const mime = a.mime || (/\.png$/i.test(a.storage_path) ? 'image/png' : /\.webp$/i.test(a.storage_path) ? 'image/webp' : 'image/jpeg');
      j = await gen([{ inlineData: { mimeType: mime, data: buf.toString('base64') } }, { text: PROMPT }]);
    } else {
      const srcName = String(a.license_note || '').replace(/^zalo-media:[^/]*\//, '') || basename(a.storage_path);
      const summary = findVideoSummary(srcName) || findVideoSummary(basename(a.storage_path).replace(/^\d+-/, ''));
      let local = null;
      if (ff) {
        const r = await fetch(url);
        if (r.ok) { local = join(tmp, basename(a.storage_path)); writeFileSync(local, Buffer.from(await r.arrayBuffer())); }
      }
      if (summary) {
        j = await gen([{ text: `${PROMPT}\n\nBAN TOM TAT VIDEO (do AI xem truoc):\n${summary.slice(0, 3000)}\nTieu de hien co: ${a.title || ''}` }]);
      } else {
        const size = Number(a.size_bytes) || (local ? statSync(local).size : 0);
        if (size && size <= MAX_VIDEO_INLINE) {
          if (!local) { const r = await fetch(url); if (!r.ok) throw new Error(`tai video ${r.status}`); local = join(tmp, basename(a.storage_path)); writeFileSync(local, Buffer.from(await r.arrayBuffer())); }
          j = await gen([{ inlineData: { mimeType: a.mime || 'video/mp4', data: readFileSync(local).toString('base64') } }, { text: PROMPT }]);
        } else {
          skip += 1; console.log(`  - ${a.title}: video ${Math.round(size / 1e6)}MB khong co ban tom tat, bo qua (chay hoc-video truoc)`);
        }
      }
      if (ff && local) {
        const outp = local.replace(/(\.[^.]+)?$/, '.fast.mp4');
        const r = spawnSync('ffmpeg', ['-y', '-i', local, '-c', 'copy', '-movflags', '+faststart', outp], { stdio: 'ignore' });
        if (r.status === 0 && existsSync(outp)) {
          const up = await client.storage.from('brand-assets').upload(a.storage_path, readFileSync(outp), { contentType: 'video/mp4', upsert: true, cacheControl: '31536000' });
          if (up.error) console.warn(`  ! faststart up de loi: ${up.error.message}`); else { fast += 1; console.log(`  ⚡ faststart: ${a.title}`); }
          try { unlinkSync(outp); } catch { /* bỏ qua */ }
        }
        try { unlinkSync(local); } catch { /* bỏ qua */ }
      }
    }
    if (!j) { if (!isVideo) { loi += 1; console.error(`  X ${a.title}: Gemini khong tra JSON`); } continue; }
    const description = describeToText(j);
    if (!description) { loi += 1; console.error(`  X ${a.title}: thieu mo_ta`); continue; }
    const { error: ue } = await client.from('brand_assets').update({ description, described_at: new Date().toISOString() }).eq('id', a.id);
    if (ue) { loi += 1; console.error(`  X ${a.title}: update ${ue.message}`); continue; }
    ok += 1;
    console.log(`  ✓ ${a.kind} | ${a.product_group || '—'} | ${a.title}\n      ${description.slice(0, 160)}`);
    await sleep(400);
  } catch (e) {
    loi += 1; console.error(`  X ${a.title}: ${e?.message || e}`);
  }
}
try {
  await client.from('run_log').insert({ task: 'mkt.asset_describe', actor: 'script', status: loi ? 'warn' : 'ok', detail: { described: ok, skipped: skip, errors: loi, faststart: fast, limit: LIMIT } });
} catch { /* bỏ qua */ }
console.log(`\nXong: ${ok} mo ta moi, ${skip} bo qua, ${loi} loi${ff ? `, ${fast} video faststart` : ''}.`);
