// up-media-kho-tu-lieu.mjs - tu dong dua anh/video tu Zalo/media len KHO TU LIEU (bucket
// brand-assets + bang brand_assets) de vong xoay sinh bai dung duoc — buoc user chot 20/8:
// "16h Claude lay data Zalo, 16h30 AI Data 1 hoc thi cung phai up cac media do len kho".
//
// Chay SAU hoc-video.mjs (can ban tom tat de phan loai video) trong day-kho-zalo*.bat.
// Chay tay: node packages/marketing/src/up-media-kho-tu-lieu.mjs
//
// PHAN LOAI + HANG RAO (bai hoc 20/8: trong media co ca CAN CUOC CONG DAN nguoi that):
//   - Anh: gui Gemini vision -> {loai, folder, tieu_de}. loai 'giay_to_ca_nhan' hoac
//     'man_hinh_app' -> TUYET DOI KHONG up (dieu cam 6), bao ro trong log.
//   - Video: doc ban tom tat Zalo/AI/**/video-tom-tat-*-<ten>.md (hoc-video sinh) -> Gemini
//     text chon folder. Chua co tom tat -> DE LAI lan sau (khong up mu).
//   - folder phai nam trong danh sach product_group DANG CO cua kho (query DB) hoac 'Content'.
// Idempotent: brand_assets.license_note = 'zalo-media:<folder>/<ten file>' — da co thi bo qua.
import { createClient } from '@supabase/supabase-js';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { loadRealEnv } from './video/env.mjs';

const env = loadRealEnv();
const MKT_MODEL = env.MKT_MODEL || 'gemini-flash-latest';
const MAX_IMG = 15 * 1024 * 1024;
const MAX_VID = 60 * 1024 * 1024;

const client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const mediaDir = resolve(process.argv[2] || './Zalo/media');
const aiRoot = resolve('./Zalo/AI');

// Danh sach folder san pham chuan dang co trong kho (kem 'Content').
const { data: pgRows, error: pgErr } = await client.from('brand_assets').select('product_group').not('product_group', 'is', null);
if (pgErr) { console.error('Khong doc duoc danh sach folder:', pgErr.message); process.exit(1); }
const FOLDERS = [...new Set((pgRows || []).map((r) => r.product_group))].filter(Boolean);
if (!FOLDERS.includes('Content')) FOLDERS.push('Content');

// Media da co trong kho (idempotent theo license_note).
const { data: doneRows } = await client.from('brand_assets').select('license_note').like('license_note', 'zalo-media:%');
const daUp = new Set((doneRows || []).map((r) => r.license_note));

// Gom file media (de quy 2 tang nhu hoc-video).
function listMedia(dir, depth = 0) {
  const out = [];
  let items = [];
  try { items = readdirSync(dir); } catch { return out; }
  for (const name of items) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory() && depth < 2) out.push(...listMedia(full, depth + 1));
    else if (st.isFile() && /\.(jpg|jpeg|png|webp|mp4|mov|webm)$/i.test(name)) {
      out.push({ full, name, size: st.size, folder: basename(dir) });
    }
  }
  return out;
}

// Tim ban tom tat video (hoc-video dat ten video-tom-tat-<folder>-<base>.md trong AI/<ngay>/).
function findVideoSummary(folder, name) {
  const base = name.replace(/\.[^.]+$/, '');
  let days = [];
  try { days = readdirSync(aiRoot); } catch { return null; }
  for (const day of days) {
    const dd = join(aiRoot, day);
    try {
      if (!statSync(dd).isDirectory()) continue;
      for (const f of readdirSync(dd)) {
        if (f.toLowerCase().includes(base.toLowerCase()) && /\.md$/i.test(f)) {
          return readFileSync(join(dd, f), 'utf8');
        }
      }
    } catch { /* bo qua */ }
  }
  return null;
}

const { GoogleGenAI } = await import('@google/genai');
const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });

const FOLDER_LIST = FOLDERS.map((f) => `- ${f}`).join('\n');
const RULES = [
  'Ban phan loai TU LIEU marketing cho SDVICO (thiet bi tau ca).',
  'Chi tra JSON dung dang, khong them chu nao ngoai JSON:',
  '{"loai":"tu_lieu"|"giay_to_ca_nhan"|"man_hinh_app"|"khong_dung_duoc","folder":"<mot dong trong danh sach>","tieu_de":"<8-12 chu tieng Viet mo ta noi dung>"}',
  'loai "giay_to_ca_nhan": can cuoc, ho chieu, bang lai, giay to co ten/so ca nhan (KE CA chup mot phan).',
  'loai "man_hinh_app": screenshot man hinh dien thoai/app/phan mem.',
  'loai "khong_dung_duoc": mo nhoe, khong lien quan san pham hay doi song nghe ca.',
  'folder: chon DUNG MOT dong trong danh sach sau (anh doi song nghe ca/hau truong khong ro san pham -> "Content"):',
  FOLDER_LIST,
].join('\n');

function parseJson(t) {
  const m = String(t || '').match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

// Goi Gemini co fallback: flash-latest hay 503 (qua tai) -> thu lai bang flash-lite-latest.
async function genWithFallback(parts) {
  const models = [MKT_MODEL, 'gemini-flash-lite-latest'].filter((v, i, a) => a.indexOf(v) === i);
  let lastErr;
  for (const model of models) {
    try {
      const res = await ai.models.generateContent({ model, contents: [{ role: 'user', parts }], config: { temperature: 0.1 } });
      return parseJson(res.text);
    } catch (e) {
      lastErr = e;
      if (!/503|UNAVAILABLE|overloaded|high demand/i.test(String(e?.message || e))) throw e;
    }
  }
  throw lastErr;
}

async function classifyImage(buf, mime) {
  return genWithFallback([
    { inlineData: { mimeType: mime, data: buf.toString('base64') } },
    { text: RULES },
  ]);
}

async function classifyVideoBySummary(summary) {
  return genWithFallback([{ text: `${RULES}\n\nDay la BAN TOM TAT video tu lieu:\n${summary.slice(0, 3000)}` }]);
}

const media = listMedia(mediaDir);
let up = 0, skip = 0, chan = 0, loi = 0;
for (const m of media) {
  const key = `zalo-media:${m.folder}/${m.name}`;
  if (daUp.has(key)) { skip += 1; continue; }
  const isVideo = /\.(mp4|mov|webm)$/i.test(m.name);
  const max = isVideo ? MAX_VID : MAX_IMG;
  if (m.size > max) { skip += 1; console.log(`  - ${m.name}: qua lon (${Math.round(m.size / 1e6)}MB), de lai`); continue; }

  let cls = null;
  try {
    if (isVideo) {
      const summary = findVideoSummary(m.folder, m.name);
      if (!summary) { skip += 1; console.log(`  - ${m.name}: chua co ban tom tat (hoc-video chay truoc), de lan sau`); continue; }
      cls = await classifyVideoBySummary(summary);
    } else {
      const mime = /\.png$/i.test(m.name) ? 'image/png' : /\.webp$/i.test(m.name) ? 'image/webp' : 'image/jpeg';
      cls = await classifyImage(readFileSync(m.full), mime);
    }
  } catch (e) {
    loi += 1; console.error(`  X ${m.name}: Gemini loi ${e?.message || e}`); continue;
  }
  if (!cls || !cls.loai) { loi += 1; console.error(`  X ${m.name}: khong phan loai duoc`); continue; }

  if (cls.loai === 'giay_to_ca_nhan') { chan += 1; console.log(`  ⛔ ${m.folder}/${m.name}: GIAY TO CA NHAN — KHONG up (dieu cam 6). Nen xoa khoi Zalo/media.`); continue; }
  if (cls.loai === 'man_hinh_app') { chan += 1; console.log(`  ⛔ ${m.folder}/${m.name}: screenshot man hinh — khong phai tu lieu, bo qua.`); continue; }
  if (cls.loai === 'khong_dung_duoc') { skip += 1; console.log(`  - ${m.folder}/${m.name}: khong dung duoc (${cls.tieu_de || ''})`); continue; }

  const folder = FOLDERS.includes(cls.folder) ? cls.folder : 'Content';
  const title = String(cls.tieu_de || m.name).slice(0, 120);
  const ext = m.name.split('.').pop().toLowerCase();
  const mime = isVideo ? 'video/mp4' : ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
  const sp = `zalo-auto/${Date.now()}-${m.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const buf = readFileSync(m.full);

  const upRes = await client.storage.from('brand-assets').upload(sp, buf, { contentType: mime, upsert: false });
  if (upRes.error) { loi += 1; console.error(`  X ${m.name}: upload ${upRes.error.message}`); continue; }
  const ins = await client.from('brand_assets').insert({
    kind: isVideo ? 'video' : 'image',
    title, storage_path: sp, license: 'owned', license_note: key,
    source: 'zalo-auto', product_group: folder, mime, size_bytes: m.size,
  });
  if (ins.error) { loi += 1; console.error(`  X ${m.name}: insert ${ins.error.message}`); continue; }
  up += 1;
  console.log(`  ✓ ${m.folder}/${m.name} -> ${folder} | ${title}`);
}

console.log(`\nKho tu lieu: ${up} up moi, ${skip} bo qua, ${chan} bi chan (giay to/man hinh), ${loi} loi.`);
