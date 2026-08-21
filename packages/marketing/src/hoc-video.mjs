// hoc-video.mjs - cho AI "xem" video tu lieu va viet ban tom tat de nap Kho tri thuc.
// Quet video trong ./Zalo/media (ke ca backlog va cac folder ngay), voi moi video chua co
// ban tom tat: gui thang file video cho Gemini (ho tro video input) -> nhan ve mo ta canh
// + loi thoai + goi y dung cho cum bai nao -> ghi thanh file .md vao ./Zalo/AI/<ngay>
// -> script upload-zalo-to-bucket.mjs se day len bucket (zalo/ai/<ngay>/), importer nap cho AI hoc.
//
// Chay tay: node packages/marketing/src/hoc-video.mjs
// Hoac tu dong: da noi vao scripts/day-kho-zalo-tudong.bat (chay truoc buoc upload).
//
// Gioi han: video <= 19MB (gui inline). Video lon hon: bao ro, de lai, khong xu.
// Idempotent: da co file tom tat cung ten trong Zalo/AI (bat ky ngay nao) thi bo qua.
import { createClient } from '@supabase/supabase-js';
import { readFileSync, readdirSync, statSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { loadRealEnv } from './video/env.mjs';

const env = loadRealEnv();
const MKT_MODEL = env.MKT_MODEL || 'gemini-flash-latest';
const MAX_BYTES = 19 * 1024 * 1024;

const mediaDir = resolve(process.argv[2] || './Zalo/media');
// Ban tom tat ghi vao Zalo/AI/<ngay> — nhat ky "AI da hoc gi" xep theo ngay (user chot 19/8).
const aiRoot = resolve('./Zalo/AI');
const todayVN = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
const outDir = join(aiRoot, todayVN);
mkdirSync(outDir, { recursive: true });
// Idempotent: gom ten ban tom tat da co trong MOI folder ngay cua Zalo/AI (va ca folder
// Hoc cu, phong file con sot) — khong tom lai video da xem hom truoc.
const daCo = new Set();
for (const root of [aiRoot, resolve('./Zalo/Học')]) {
  try {
    for (const d of readdirSync(root)) {
      const dd = join(root, d);
      try {
        if (statSync(dd).isDirectory()) { for (const f of readdirSync(dd)) daCo.add(f); }
        else daCo.add(d);
      } catch { /* bo qua */ }
    }
  } catch { /* chua co folder */ }
}

// Gom video de quy 2 tang: media/<folder>/<file>
function listVideos(dir, depth = 0) {
  const out = [];
  let items = [];
  try { items = readdirSync(dir); } catch { return out; }
  for (const name of items) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory() && depth < 2) out.push(...listVideos(full, depth + 1));
    else if (st.isFile() && /\.(mp4|mov|webm)$/i.test(name)) out.push({ full, name, size: st.size, folder: basename(dir) });
  }
  return out;
}

const videos = listVideos(mediaDir);
if (!videos.length) { console.log('Khong co video nao trong', mediaDir); process.exit(0); }

const { GoogleGenAI } = await import('@google/genai');
const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });

// 503/429 la Google qua tai tam thoi (them 19/8 sau khi dinh 503 ngay video dau):
// thu lai co gian cach, het kien nhan thi doi model du phong.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MODELS = [...new Set([MKT_MODEL, 'gemini-flash-latest', 'gemini-flash-lite-latest'])];
async function goiGemini(parts) {
  let lastErr = null;
  for (const model of MODELS) {
    for (let lan = 0; lan < 2; lan++) {
      try {
        const res = await ai.models.generateContent({ model, contents: [{ role: 'user', parts }], config: { temperature: 0.3 } });
        return (res.text || '').trim();
      } catch (e) {
        lastErr = e;
        const msg = String(e?.message || e);
        if (/503|429|UNAVAILABLE|RESOURCE_EXHAUSTED|overloaded|high demand/i.test(msg)) {
          console.log(`    ... ${model} qua tai, cho ${lan === 0 ? 8 : 20}s roi thu lai`);
          await sleep(lan === 0 ? 8000 : 20000);
          continue;
        }
        throw e; // loi khac (sai khoa, model khong ho tro video...) thi bao ngay
      }
    }
  }
  throw lastErr;
}

let done = 0, skipped = 0, errors = 0;
for (const v of videos) {
  const digestName = `video-tom-tat-${v.folder}-${v.name.replace(/\.[^.]+$/, '')}.md`;
  const digestPath = join(outDir, digestName);
  if (daCo.has(digestName) || existsSync(digestPath)) { skipped += 1; continue; }
  if (v.size > MAX_BYTES) { skipped += 1; console.log(`  - ${v.name}: ${Math.round(v.size / 1048576)}MB qua 19MB, de lai`); continue; }

  try {
    const mime = v.name.toLowerCase().endsWith('.webm') ? 'video/webm' : v.name.toLowerCase().endsWith('.mov') ? 'video/quicktime' : 'video/mp4';
    const text = await goiGemini([
      {
        text: [
          'Day la video tu lieu tu nhom Zalo noi bo cua SDVICO, cong ty phan phoi thiet bi cho ngu dan va tau ca',
          '(may loc dau, loc nuoc bien, thiet bi giam sat hanh trinh, dien thoai ve tinh...).',
          'Xem video va viet ban tom tat tieng Viet gom 3 phan:',
          '1. Canh quay: quay gi, o dau (tren tau, cang, xuong...), thay thiet bi gi, khong khi the nao.',
          '2. Loi thoai: ai noi gi (tom y, khong can nguyen van; khong co tieng noi thi ghi ro).',
          '3. Goi y su dung: tu lieu nay hop cum bai nao (ban hang, doi song ngu dan, huong dan ky thuat, hau truong lap dat), co diem gi dat gia.',
          'Van phong cau ngan, gan gui. KHONG bia chi tiet khong thay trong video.',
          'KHONG dua so dien thoai hay ten khach hang neu nghe thay - ghi chung chung la "khach".',
        ].join(' '),
      },
      { inlineData: { mimeType: mime, data: readFileSync(v.full).toString('base64') } },
    ]);
    if (!text || text.length < 40) { errors += 1; console.log(`  X ${v.name}: tra ve rong`); continue; }
    const md = [
      `# Tom tat video tu lieu: ${v.name}`,
      '',
      `Nguon: Zalo/media/${v.folder}/${v.name} (${Math.round(v.size / 1024)} KB). May tom tat tu dong bang ${MKT_MODEL}; nguoi dung truoc khi trich dan can xem lai video goc.`,
      '',
      text,
    ].join('\n');
    writeFileSync(digestPath, md, 'utf8');
    done += 1;
    console.log(`  ✓ ${v.name} -> Zalo/AI/${todayVN}/${digestName}`);
  } catch (e) {
    errors += 1;
    console.log(`  X ${v.name}: ${e?.message || e}`);
  }
  await new Promise((r) => setTimeout(r, 1500)); // gian cach nhe, tranh dap quota
}
console.log(`\nXong: ${done} video da tom tat, ${skipped} bo qua, ${errors} loi.`);
