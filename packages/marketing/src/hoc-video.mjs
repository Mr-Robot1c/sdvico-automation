// hoc-video.mjs - cho AI "xem" video tu lieu va viet ban tom tat de nap Kho tri thuc.
// Quet video trong ./Zalo/media (ke ca backlog va cac folder ngay), voi moi video chua co
// ban tom tat: gui thang file video cho Gemini (ho tro video input) -> nhan ve mo ta canh
// + loi thoai + goi y dung cho cum bai nao -> ghi thanh file .md vao ./Zalo/AI/<ngay>
// -> script upload-zalo-to-bucket.mjs se day len bucket (zalo/ai/<ngay>/), importer nap cho AI hoc.
//
// Chay tay: node packages/marketing/src/hoc-video.mjs
// Hoac tu dong: da noi vao scripts/day-kho-zalo-tudong.bat (chay truoc buoc upload).
//
// Gioi han gui inline cua Gemini: MAX_BYTES. Video lon hon (2/9: 58MB va 27MB ket vinh vien,
// keo theo up-media-kho-tu-lieu khong up duoc vi "chua co ban tom tat") -> NEN TAM bang ffmpeg
// (co san @ffmpeg-installer, dung chung helper video/ffmpeg.mjs): ha khung hinh/fps/bitrate
// xuong muc du cho AI xem noi dung (Gemini von chi lay mau 1 hinh/giay), gui ban nen.
// File goc trong Zalo/media GIU NGUYEN; ban nen nam o thu muc tam cua he thong, xoa ngay sau khi xem.
// Nen 2 nac van qua tran (video rat dai) thi bao ro, de lai nhu cu.
// Idempotent: da co file tom tat cung ten trong Zalo/AI (bat ky ngay nao) thi bo qua (truoc ca buoc nen).
import { createClient } from '@supabase/supabase-js';
import { readFileSync, readdirSync, statSync, existsSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { loadRealEnv } from './video/env.mjs';

const env = loadRealEnv();
const MKT_MODEL = env.MKT_MODEL || 'gemini-flash-latest';
// Tran inline: body request Gemini <= 20MB, ma base64 phinh 4/3 nen file tho toi da ~15MB.
// Ban lon nhat tung gui ok la 14,2MB (backlog-tkkd/video-06). Muc 19MB cu vuot tran nay
// (file 15-19MB nhieu kha nang bi API tu choi thay vi "de lai"), ha ve 14,5MB; qua tran thi nen tam.
const MAX_BYTES = Math.round(14.5 * 1024 * 1024);
// Muc tieu ban nen (~12,5MB) de con cho tru sai so bitrate mot luot (ABR + maxrate 1,3x).
const NEN_TARGET_BYTES = Math.round(12.5 * 1024 * 1024);
const NEN_DIR = join(tmpdir(), 'sdvico-hoc-video');
// Hai nac nen: nac 1 du cho video 5-6 phut; nac 2 (nho hon, it hinh hon) cho video dai hon.
const NEN_NAC = [
  { canh: 854, fps: 15, heSo: 1.0 },
  { canh: 640, fps: 10, heSo: 0.7 },
];
const NEN_AUDIO_KBPS = 48;
const mb = (n) => (n / 1048576).toFixed(1).replace('.', ',');

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
// timeout: SDK gui kem X-Server-Timeout nen Google tra 504 sau 4 phut thay vi treo vo han
// (2/9: flash-latest can han muc ngay, request video treo 5 phut moi dut, moi video mat 10 phut
// truoc khi doi sang model du phong). Video 5 phut Gemini xem xong trong 1-2 phut, 4 phut la du.
const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY, httpOptions: { timeout: 240000 } });

// 503/429 la Google qua tai tam thoi (them 19/8 sau khi dinh 503 ngay video dau):
// thu lai co gian cach, het kien nhan thi doi model du phong. 504/"fetch failed"/timeout (2/9)
// cung la tam thoi, thu lai nhu 503.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MODELS = [...new Set([MKT_MODEL, 'gemini-flash-latest', 'gemini-flash-lite-latest'])];
async function goiGemini(parts) {
  let lastErr = null;
  for (const model of MODELS) {
    for (let lan = 0; lan < 2; lan++) {
      try {
        const res = await ai.models.generateContent({ model, contents: [{ role: 'user', parts }], config: { temperature: 0.3 } });
        // Tra kem model THAT da tra loi (fallback thi khac MKT_MODEL) de ban tom tat ghi dung nguon.
        return { text: (res.text || '').trim(), model };
      } catch (e) {
        lastErr = e;
        const msg = `${e?.message || e} ${e?.cause?.message || ''}`;
        if (/503|504|429|UNAVAILABLE|DEADLINE_EXCEEDED|RESOURCE_EXHAUSTED|overloaded|high demand|fetch failed|timeout|aborted|ECONNRESET/i.test(msg)) {
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

// Nen tam video lon xuong duoi MAX_BYTES. ffmpeg/ffprobe nap tre: video nho khong can, va
// may thieu binary thi chi video lon bi bao loi, phan con lai van chay.
// Tra ve { path, size, nac, vKbps, duration }; nem loi neu ca 2 nac van qua tran.
let ffm = null;
async function nenVideoTam(v) {
  ffm ||= await import('./video/ffmpeg.mjs');
  mkdirSync(NEN_DIR, { recursive: true });
  const out = join(NEN_DIR, `${v.folder}-${v.name.replace(/\.[^.]+$/, '')}.nen.mp4`);
  const duration = await ffm.probeDuration(v.full);
  if (!duration) throw new Error('khong doc duoc thoi luong');
  const { width, height } = await ffm.probeSize(v.full);
  const tongKbps = (NEN_TARGET_BYTES * 8) / duration / 1000;
  for (const nac of NEN_NAC) {
    // Bitrate hinh de tong dung lung ~ muc tieu, tru phan tieng; ep trong [120, 1500] kbps.
    const vKbps = Math.round(Math.min(1500, Math.max(120, (tongKbps - NEN_AUDIO_KBPS) * nac.heSo)));
    const canhDai = Math.max(width, height);
    // Giu ty le, canh dai <= nac.canh; -2 va trunc(../2)*2 de kich thuoc chan (yuv420p can chan).
    const scale = canhDai > nac.canh
      ? (width >= height ? `scale=${nac.canh}:-2` : `scale=-2:${nac.canh}`)
      : 'scale=trunc(iw/2)*2:trunc(ih/2)*2';
    await ffm.ffmpeg([
      '-y', '-v', 'error', '-i', v.full,
      '-vf', `${scale},fps=${nac.fps}`,
      '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p',
      '-b:v', `${vKbps}k`, '-maxrate', `${Math.round(vKbps * 1.3)}k`, '-bufsize', `${vKbps * 2}k`,
      '-c:a', 'aac', '-b:a', `${NEN_AUDIO_KBPS}k`, '-ac', '1',
      '-movflags', '+faststart', out,
    ]);
    const size = statSync(out).size;
    if (size <= MAX_BYTES) return { path: out, size, nac, vKbps, duration };
    console.log(`    ... nac ${nac.canh}p/${nac.fps}fps van ${mb(size)}MB, thu nac nho hon`);
  }
  rmSync(out, { force: true });
  throw new Error(`nen 2 nac van qua ${mb(MAX_BYTES)}MB (video ${Math.round(duration)}s qua dai)`);
}

let done = 0, skipped = 0, errors = 0, daNen = 0;
for (const v of videos) {
  const digestName = `video-tom-tat-${v.folder}-${v.name.replace(/\.[^.]+$/, '')}.md`;
  const digestPath = join(outDir, digestName);
  if (daCo.has(digestName) || existsSync(digestPath)) { skipped += 1; continue; }

  // Video qua tran inline: nen tam, gui ban nen (file goc khong dong toi).
  let guiPath = v.full;
  let guiMime = v.name.toLowerCase().endsWith('.webm') ? 'video/webm' : v.name.toLowerCase().endsWith('.mov') ? 'video/quicktime' : 'video/mp4';
  let nen = null;
  if (v.size > MAX_BYTES) {
    try {
      nen = await nenVideoTam(v);
      guiPath = nen.path;
      guiMime = 'video/mp4';
      daNen += 1;
      console.log(`  ~ ${v.name}: ${mb(v.size)}MB qua ${mb(MAX_BYTES)}MB, da nen tam con ${mb(nen.size)}MB (${nen.nac.canh}p, ${nen.nac.fps} hinh/giay, ${nen.vKbps}k), file goc giu nguyen`);
    } catch (e) {
      errors += 1;
      console.log(`  X ${v.name}: ${mb(v.size)}MB qua ${mb(MAX_BYTES)}MB, nen tam khong duoc (${e?.message || e}), de lai`);
      continue;
    }
  }

  try {
    const { text, model } = await goiGemini([
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
      { inlineData: { mimeType: guiMime, data: readFileSync(guiPath).toString('base64') } },
    ]);
    if (!text || text.length < 40) { errors += 1; console.log(`  X ${v.name}: tra ve rong`); continue; }
    const ghiChuNen = nen
      ? ` AI xem ban nen tam ${mb(nen.size)} MB (${nen.nac.canh}p, ${nen.nac.fps} hinh/giay) vi file goc qua tran gui inline; file goc giu nguyen.`
      : '';
    const md = [
      `# Tom tat video tu lieu: ${v.name}`,
      '',
      `Nguon: Zalo/media/${v.folder}/${v.name} (${Math.round(v.size / 1024)} KB). May tom tat tu dong bang ${model}; nguoi dung truoc khi trich dan can xem lai video goc.${ghiChuNen}`,
      '',
      text,
    ].join('\n');
    writeFileSync(digestPath, md, 'utf8');
    done += 1;
    console.log(`  ✓ ${v.name} -> Zalo/AI/${todayVN}/${digestName}`);
  } catch (e) {
    errors += 1;
    console.log(`  X ${v.name}: ${e?.message || e}`);
  } finally {
    if (nen) rmSync(nen.path, { force: true });
  }
  await new Promise((r) => setTimeout(r, 1500)); // gian cach nhe, tranh dap quota
}
console.log(`\nXong: ${done} video da tom tat (${daNen} video lon phai nen tam), ${skipped} bo qua, ${errors} loi.`);
