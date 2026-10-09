// segment-clips.mjs — MÔ TẢ ĐOẠN trong clip + XÁC ĐỊNH CỤM BUỔI QUAY (ĐỢT A, 9/10). Chạy tay, máy nội bộ.
//
// Vì sao: assemble.mjs lấy clip từ giây 0 rồi lặp, scene-match chấm từng cảnh riêng nên video nhảy giữa nhiều
// buổi quay khác nhau. Script này cho Gemini XEM từng clip, ghi ra các ĐOẠN (start, end, hành động thấy thật),
// rồi xét xem những clip nào CÙNG BUỔI QUAY (cùng tàu, khoang, thiết bị, người, hoạt động) và ghi
// brand_assets.segments + brand_assets.shoot_cluster (migration 20261009120000).
//
// Ngày Zalo + nhóm sản phẩm chỉ là ỨNG VIÊN cụm, chưa chứng minh cùng buổi quay. Bước 2 đối chiếu thiết bị,
// người, khoang tàu, hoạt động; chưa chắc thì confidence = "co_the".
//
// ĐỢT A2 (9/10): mỗi đoạn thêm 4 nhãn phục vụ chọn đoạn theo câu đang nói: subject (người / thiết bị / cả hai / cảnh chung
// trong khung dọc), product_visible + product_clear_from (thiết bị chính có hiện rõ ngay từ đầu đoạn không), stage (chuẩn bị,
// thao tác, hoàn tất, vận hành). Thêm chế độ --date: lấy ứng viên MỌI nhóm cùng ngày Zalo (Content lẫn thư mục sản phẩm) rồi
// gom cụm cùng buổi như cũ, vì đợt A thấy SD12-300 và Content ngày 19/9 là CÙNG buổi nhưng bị tách khi gom theo nhóm.
//
// Chạy:
//   node packages/marketing/src/video/segment-clips.mjs --date 2026-09-19 [--dry-run] [--redo]
//   node packages/marketing/src/video/segment-clips.mjs --cluster 2026-09-19 "6. Thiết bị lọc dầu SF-50" [--dry-run] [--redo]
//   node packages/marketing/src/video/segment-clips.mjs --ids 839e1acd,fb72cad5 [--dry-run] [--redo]
//   --dry-run: gọi Gemini và in kết quả, KHÔNG ghi DB.   --redo: mô tả lại cả clip đã có segments.
//   Clip có đoạn từ đợt A mà chưa có nhãn A2 (thiếu stage / subject / product_visible) tự được mô tả lại, khỏi cần --redo.
// CHỈ thử trên ngày / cụm chỉ định (chưa mô tả cả kho). Khoá API đọc từ .env thật, không in ra.
import { mkdir, readFile, stat, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { normalizeSegments } from './segments.mjs';
import { extractFirstJson } from './scene-match.mjs';

// ---------- hàm thuần (test được) ----------

// "zalo-media:2026-09-19/xxx.mp4" -> "2026-09-19"; không đúng dạng -> null.
export function zaloDateOf(licenseNote) {
  const m = String(licenseNote || '').match(/^zalo-media:(\d{4}-\d{2}-\d{2})\//);
  return m ? m[1] : null;
}

// id cụm: "<ngày>|<nhóm>|<số>".
export function clusterIdOf(date, group, n) {
  return `${date}|${group}|${n}`;
}

// Chuẩn hóa câu trả lời bước 2 thành Map(clipId -> { id, confidence, basis } | null).
// raw: { clusters: [{ clips: [idx...], confidence, basis }], isolated: [idx...] } với idx là chỉ số 1-based
// trong clipIds. Mỗi clip tối đa 1 cụm; cụm chỉ 1 clip thì bỏ (không phải cụm); confidence lạ -> 'co_the'.
export function assignClusters(raw, clipIds, { date, group, checkedAt = new Date().toISOString() } = {}) {
  const out = new Map(clipIds.map((id) => [id, null]));
  const clusters = Array.isArray(raw?.clusters) ? raw.clusters : [];
  let n = 0;
  for (const c of clusters) {
    const idxs = [...new Set((Array.isArray(c?.clips) ? c.clips : []).map((x) => Number(x)).filter((x) => Number.isInteger(x) && x >= 1 && x <= clipIds.length))]
      .filter((x) => out.get(clipIds[x - 1]) === null);
    if (idxs.length < 2) continue;
    n += 1;
    const confidence = String(c?.confidence || '').toLowerCase() === 'chac' ? 'chac' : 'co_the';
    const basis = String(c?.basis || '').replace(/\s+/g, ' ').trim().slice(0, 450) || 'không ghi cơ sở';
    const id = clusterIdOf(date, group, n);
    for (const x of idxs) out.set(clipIds[x - 1], { id, confidence, basis, checked_at: checkedAt });
  }
  return out;
}

// Clip đã có đoạn nhưng đoạn CHƯA mang nhãn A2 (đoạn đợt A) -> cần mô tả lại để lấy nhãn mới.
export function needsRelabel(segments) {
  if (!Array.isArray(segments) || !segments.length) return true;
  return segments.some((x) => !x || !('stage' in x) || !('subject' in x) || !('product_visible' in x));
}

// Cắt giây về dạng "m:ss" cho bảng in.
export function fmtT(sec) {
  const s = Math.max(0, Number(sec) || 0);
  return `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
}

// ---------- phần chạy thật ----------

const MAX_INLINE = Math.round(14.5 * 1024 * 1024);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SEG_PROMPT = (duration) => [
  'Bạn xem một clip tư liệu của SDVICO (công ty phân phối và lắp đặt thiết bị cho tàu cá: máy lọc dầu, lọc nước biển, giám sát hành trình...).',
  `Clip dài ${duration.toFixed(1)} giây. Hãy chia clip thành các ĐOẠN liên tục, mỗi đoạn dài từ 2 tới 12 giây, phủ những khúc có HÀNH ĐỘNG RÕ. Bỏ khúc rung, mờ, bị che, chuyển cảnh, người nhìn vào máy quay.`,
  'Mỗi đoạn ghi:',
  '- start, end: giây (số thực), 0 <= start < end <= độ dài clip.',
  '- action: hành động THỰC SỰ thấy trong đoạn đó (động từ + đối tượng, ví dụ "siết đầu nối ống vào thân máy lọc"). Không đoán, không suy từ tên file.',
  '- people: số người thấy trong đoạn và mỗi người đang làm gì ("0" nếu không thấy ai). Không ghi tên riêng.',
  '- equipment: thiết bị và vật thấy rõ (máy lọc dầu inox, ống dẫn, van khóa, máy khoan tay, bình...).',
  '- setting: bối cảnh (khoang máy chật hẹp, hầm tàu, boong, xưởng, bến cảng...).',
  '- vertical_ok: true nếu cắt khung dọc 9:16 ở GIỮA hình vẫn thấy rõ chủ thể chính; false nếu chủ thể nằm sát mép trái hoặc phải, hoặc là cảnh rộng ngang.',
  '- note: ghi chú ngắn về chất lượng hình hoặc chi tiết đáng chú ý, hoặc chuỗi rỗng.',
  '- subject: chủ thể NỔI BẬT NHẤT trong khung DỌC 9:16 cắt ở giữa. "nguoi" = thấy người (thợ, ngư dân) là chủ thể; "thiet_bi" = máy / thiết bị / đường ống là chủ thể, không thấy người rõ; "ca_hai" = thấy rõ cả người lẫn thiết bị; "canh_chung" = cảnh rộng, tàu, cảng, biển, không có chủ thể nào nổi. Không chắc thì "canh_chung".',
  '- product_visible: THIẾT BỊ CHÍNH của clip (máy lọc dầu, máy lọc nước, thiết bị định vị, thiết bị đang được lắp hay vận hành, KHÔNG phải động cơ hay ống chung chung) có thấy rõ không. "ro_tu_dau" = thấy rõ, không bị che, ngay từ giây đầu đoạn; "ro_sau" = ban đầu bị che hoặc chưa vào khung (tay thợ che, người đứng chắn, máy chưa lộ ra) và chỉ thấy rõ từ một giây nào đó trong đoạn; "mo" = có thấy nhưng nhỏ, mờ, góc khuất, bị che một phần suốt đoạn; "khong" = không có thiết bị chính. Không chắc thì "mo".',
  '- product_clear_from: CHỈ khi product_visible = "ro_sau": giây (số thực, nằm trong đoạn, tính từ đầu CLIP như start và end) mà thiết bị chính bắt đầu hiện rõ không bị che. Các trường hợp khác ghi null.',
  '- stage: công đoạn việc đang diễn ra. "chuan_bi" = chuẩn bị, mang thiết bị tới, đo đạc, tháo đồ cũ, dọn chỗ; "thao_tac" = đang lắp, siết, đấu nối, thao tác chính; "hoan_tat" = xong việc, kiểm tra lại, bàn giao; "van_hanh" = thiết bị đang chạy, nước hay dầu chảy ra; "khac" = không thuộc công đoạn nào hoặc không chắc.',
  'TUYỆT ĐỐI KHÔNG BỊA: không thấy thì không ghi, đoạn nào không chắc thì bỏ đoạn đó, nhãn nào không chắc thì ghi giá trị trung tính ("canh_chung", "mo", "khac"). Không ghi số điện thoại, biển số, tên người.',
  'Chỉ trả JSON, không thêm chữ ngoài JSON:',
  '{"segments":[{"start":0.0,"end":4.5,"action":"...","people":"...","equipment":"...","setting":"...","vertical_ok":true,"note":"","subject":"nguoi|thiet_bi|ca_hai|canh_chung","product_visible":"ro_tu_dau|ro_sau|mo|khong","product_clear_from":null,"stage":"chuan_bi|thao_tac|hoan_tat|van_hanh|khac"}]}',
].join('\n');

const CLUSTER_PROMPT = [
  'Bạn là người dựng video của SDVICO. Dưới đây là các clip tư liệu cùng ngày nhóm Zalo, kèm các ĐOẠN đã mô tả (hành động, người, thiết bị, bối cảnh).',
  'Nhiệm vụ: xác định clip nào CÙNG MỘT BUỔI QUAY, tức cùng một tàu / khoang / thiết bị cụ thể / người / chuỗi việc liên tiếp, để dựng chung một video mà người xem thấy là một việc xuyên suốt.',
  'Cùng ngày và cùng nhóm sản phẩm CHƯA chứng minh cùng buổi quay. Các clip có thể nằm ở NHIỀU thư mục (Content và thư mục sản phẩm): clip Content và clip thư mục sản phẩm CÙNG NGÀY vẫn có thể là cùng một buổi lắp đặt, hãy so cả hai bên, đừng tách theo thư mục. Phải đối chiếu chi tiết:',
  '- confidence "chac": có ÍT NHẤT 2 chi tiết ĐỊNH DANH RIÊNG khớp giữa các clip: cùng một người nhận ra được (áo, mũ, dáng, giới tính), cùng một vị trí máy trên vách hoặc cùng khoang nhận ra được, cùng một chi tiết lạ (loại dây điện, bình, khay, giá đỡ riêng), hoặc công đoạn nối tiếp nhau đúng thứ tự. Nói rõ từng chi tiết trong basis.',
  '- Chi tiết CHUNG của mọi lần lắp đặt của SDVICO (máy lọc dầu inox, ống nhựa trong suốt, khoang máy chật, thợ cúi thao tác) KHÔNG đủ cho "chac". Chỉ khớp những thứ chung đó thì là "co_the".',
  '- confidence "co_the": chỉ khớp loại việc hoặc bối cảnh chung (đều là thợ lắp máy trong khoang), chưa đủ chi tiết định danh để chắc.',
  '- Clip dùng cùng loại thiết bị và cùng loại khoang với một cụm nhưng chưa đủ chi tiết để chắc thì VẪN GỘP vào cụm đó với confidence "co_the" (ghi rõ trong basis vì sao chưa chắc), đừng bỏ.',
  '- Chỉ để vào "isolated" khi clip thật sự khác: tàu khác, thiết bị khác, việc khác hẳn (xưởng, bến, ăn uống, khách khen...), hoặc quá ít hình để so.',
  'Mỗi clip chỉ ở tối đa MỘT cụm. Cụm phải có ít nhất 2 clip. "basis" là 1-2 câu tiếng Việt nêu CHI TIẾT cụ thể đã đối chiếu (không nói chung chung).',
  'Chỉ trả JSON, không thêm chữ ngoài JSON:',
  '{"clusters":[{"clips":[1,3],"confidence":"chac|co_the","basis":"..."}],"isolated":[2]}',
  'Các số trong "clips" và "isolated" là số thứ tự clip (bắt đầu từ 1) trong danh sách bên dưới. Trong "basis", gọi clip bằng MÃ 8 KÝ TỰ trong ngoặc vuông của clip đó (ví dụ "6c21e687 và 1ab6252a"), không gọi bằng số thứ tự.',
].join('\n');

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes('--dry-run');
  const redo = args.includes('--redo');
  const ci = args.indexOf('--cluster');
  const ii = args.indexOf('--ids');
  const di = args.indexOf('--date');
  if (ci < 0 && ii < 0 && di < 0) {
    console.error('Cú pháp: segment-clips.mjs --date <YYYY-MM-DD> | --cluster <YYYY-MM-DD> "<nhóm>" | --ids id1,id2 [--dry-run] [--redo]');
    process.exit(1);
  }
  const { createClient } = await import('@supabase/supabase-js');
  const { loadRealEnv } = await import('./env.mjs');
  const { downloadAsset, probeDuration, ffmpeg } = await import('./ffmpeg.mjs');
  const env = loadRealEnv();
  const client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY, httpOptions: { timeout: 240000 } });
  const MODELS = [...new Set([env.SEGMENT_MODEL, 'gemini-flash-latest', env.MKT_MODEL, 'gemini-3.5-flash', 'gemini-flash-lite-latest'].filter(Boolean))];

  async function gen(parts, validate) {
    let last;
    for (const model of MODELS) {
      for (let i = 0; i < 2; i++) {
        try {
          const res = await ai.models.generateContent({ model, contents: [{ role: 'user', parts }], config: { responseMimeType: 'application/json', temperature: 0.2 } });
          const j = extractFirstJson(res.text || '');
          if (j && validate(j)) return { j, model };
          throw new Error('429 khong-dung-khuon: ' + String(res.text || '').replace(/\s+/g, ' ').slice(0, 100));
        } catch (e) {
          last = e;
          const msg = `${e?.message || e} ${e?.cause?.message || ''}`;
          if (!/503|504|429|500|UNAVAILABLE|RESOURCE_EXHAUSTED|DEADLINE|overloaded|fetch failed|timeout|aborted|ECONNRESET/i.test(msg)) throw e;
          console.log(`    ... ${model} bận (${msg.slice(0, 60)}), chờ rồi thử lại`);
          await sleep(i === 0 ? 6000 : 15000);
        }
      }
    }
    throw last;
  }

  // 1) Lấy clip
  const COLS = 'id, kind, title, storage_path, product_group, license_note, description, size_bytes, mime, segments, shoot_cluster';
  let clips = [];
  let date = null;
  let group = null;
  if (di >= 0) {
    // ĐỢT A2: mọi nhóm cùng NGÀY Zalo (Content + thư mục sản phẩm), gom cụm chung một lượt.
    date = args[di + 1];
    group = 'ca-ngay';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) { console.error('--date cần <YYYY-MM-DD>'); process.exit(1); }
    const { data, error } = await client.from('brand_assets').select(COLS).in('kind', ['video', 'clip']).neq('source', 'video-pipeline');
    if (error) throw new Error('đọc brand_assets: ' + error.message);
    clips = (data || []).filter((a) => zaloDateOf(a.license_note) === date);
  } else if (ci >= 0) {
    date = args[ci + 1];
    group = args[ci + 2];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !group) { console.error('--cluster cần <YYYY-MM-DD> "<nhóm sản phẩm>"'); process.exit(1); }
    const { data, error } = await client.from('brand_assets').select(COLS).in('kind', ['video', 'clip']).eq('product_group', group).neq('source', 'video-pipeline');
    if (error) throw new Error('đọc brand_assets: ' + error.message);
    clips = (data || []).filter((a) => zaloDateOf(a.license_note) === date);
  } else {
    const wants = String(args[ii + 1] || '').split(',').map((s) => s.trim()).filter(Boolean);
    const { data, error } = await client.from('brand_assets').select(COLS).in('kind', ['video', 'clip']).neq('source', 'video-pipeline');
    if (error) throw new Error('đọc brand_assets: ' + error.message);
    clips = (data || []).filter((a) => wants.some((w) => a.id.startsWith(w)));
    const dates = [...new Set(clips.map((a) => zaloDateOf(a.license_note)).filter(Boolean))];
    const groups = [...new Set(clips.map((a) => a.product_group).filter(Boolean))];
    date = dates.length === 1 ? dates[0] : 'nhieu-ngay';
    group = groups.length === 1 ? groups[0] : 'nhieu-nhom';
  }
  clips.sort((a, b) => String(a.license_note).localeCompare(String(b.license_note)));
  if (clips.length < 1) { console.error('Không thấy clip nào.'); process.exit(1); }
  console.log(`Cụm ứng viên: ${date} | ${group} | ${clips.length} clip${dry ? ' (DRY-RUN, không ghi DB)' : ''}\n`);

  const tmp = join(tmpdir(), 'sdvico-segment-clips');
  await mkdir(tmp, { recursive: true });

  // 2) Mô tả đoạn từng clip
  for (const a of clips) {
    if (Array.isArray(a.segments) && a.segments.length && !redo && !needsRelabel(a.segments)) { console.log(`  = ${a.id.slice(0, 8)} đã có ${a.segments.length} đoạn kèm nhãn A2, bỏ qua (--redo để làm lại)`); continue; }
    const ext = (String(a.storage_path).split('.').pop() || 'mp4').replace(/[^a-z0-9]/gi, '').slice(0, 4) || 'mp4';
    const local = join(tmp, `${a.id.slice(0, 8)}.${ext}`);
    let sendPath = local;
    try {
      await downloadAsset(client, a.storage_path, local);
      const duration = await probeDuration(local);
      if (!duration) throw new Error('không đọc được độ dài clip');
      let size = (await stat(local)).size;
      if (size > MAX_INLINE) {
        // Nén tạm để gửi inline (độ dài giữ nguyên nên mốc giây vẫn đúng).
        sendPath = join(tmp, `${a.id.slice(0, 8)}.nen.mp4`);
        await ffmpeg(['-y', '-v', 'error', '-i', local, '-vf', 'scale=-2:480,fps=10', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-b:v', '500k', '-c:a', 'aac', '-b:a', '48k', '-ac', '1', '-movflags', '+faststart', sendPath]);
        size = (await stat(sendPath)).size;
        if (size > MAX_INLINE) throw new Error(`nén vẫn ${Math.round(size / 1e6)}MB, quá trần gửi inline`);
      }
      const data = (await readFile(sendPath)).toString('base64');
      const mime = sendPath.endsWith('.mov') ? 'video/quicktime' : sendPath.endsWith('.webm') ? 'video/webm' : 'video/mp4';
      const { j, model } = await gen([{ inlineData: { mimeType: mime, data } }, { text: SEG_PROMPT(duration) }], (x) => Array.isArray(x?.segments));
      a._duration = duration;
      a._segments = normalizeSegments(j.segments, duration);
      a._model = model;
      console.log(`  ✓ ${a.id.slice(0, 8)} ${duration.toFixed(1)}s -> ${a._segments.length} đoạn (${j.segments.length} thô) [${model}] ${a.title}`);
    } catch (e) {
      a._error = String(e?.message || e);
      console.error(`  X ${a.id.slice(0, 8)} ${a.title}: ${a._error}`);
    } finally {
      await rm(local, { force: true }).catch(() => {});
      if (sendPath !== local) await rm(sendPath, { force: true }).catch(() => {});
    }
    await sleep(500);
  }

  // clip dùng cho bước cụm: đoạn mới (nếu vừa mô tả) hoặc đoạn đã lưu
  for (const a of clips) a._use = a._segments || (Array.isArray(a.segments) ? a.segments : []);
  const usable = clips.filter((a) => a._use.length);

  // 3) Xét cụm buổi quay (1 lần gọi)
  let assignment = new Map(clips.map((a) => [a.id, null]));
  let clusterModel = null;
  if (usable.length >= 2) {
    const blocks = usable.map((a, i) => [
      `CLIP ${i + 1} [${a.id.slice(0, 8)}] | thư mục: ${a.product_group || '?'} | tên: ${a.title || ''} | mô tả cũ: ${String(a.description || '').replace(/\s+/g, ' ').slice(0, 260)}`,
      ...a._use.map((s) => `   - ${s.start.toFixed(1)}-${s.end.toFixed(1)}s | việc: ${s.action} | người: ${s.people} | thiết bị: ${s.equipment} | bối cảnh: ${s.setting}${s.stage ? ` | công đoạn: ${s.stage}` : ''}${s.note ? ` | ghi chú: ${s.note}` : ''}`),
    ].join('\n')).join('\n\n');
    try {
      const scope = group === 'ca-ngay' ? 'NHIỀU THƯ MỤC (mọi nhóm cùng ngày)' : group;
      const { j, model } = await gen([{ text: `${CLUSTER_PROMPT}\n\nNGÀY NHÓM ZALO: ${date}. NHÓM SẢN PHẨM: ${scope}.\n\n${blocks}` }], (x) => Array.isArray(x?.clusters));
      clusterModel = model;
      assignment = assignClusters(j, usable.map((a) => a.id), { date, group });
      for (const a of clips) if (!assignment.has(a.id)) assignment.set(a.id, null);
    } catch (e) {
      console.error('  X bước xét cụm lỗi:', String(e?.message || e));
    }
  } else {
    console.log('Dưới 2 clip có đoạn, không xét cụm.');
  }

  // 4) Ghi DB + bảng kết quả
  const rows = [];
  for (const a of clips) {
    const segs = a._segments;
    const cl = assignment.get(a.id) ?? null;
    if (!dry) {
      const patch = {};
      if (segs) patch.segments = segs;
      if (a._use.length) patch.shoot_cluster = cl; // null = lạc cụm
      if (Object.keys(patch).length) {
        const { error } = await client.from('brand_assets').update(patch).eq('id', a.id);
        if (error) { console.error(`  X ghi ${a.id.slice(0, 8)}: ${error.message}`); a._error = (a._error || '') + ` ghi:${error.message}`; }
      }
    }
    rows.push({ a, segs: a._use, cl });
  }
  if (!dry) {
    try {
      await client.from('run_log').insert({ task: 'mkt.clip_segments', actor: 'script', status: clips.some((a) => a._error) ? 'warn' : 'ok', detail: { cluster: `${date}|${group}`, clips: clips.length, segmented: clips.filter((a) => a._segments).length, model: clusterModel } });
    } catch { /* bỏ qua */ }
  }

  console.log(`\n===== KẾT QUẢ ${date} | ${group} (${dry ? 'dry-run' : 'đã ghi DB'}) =====`);
  for (const { a, segs, cl } of rows) {
    console.log(`\n${a.id.slice(0, 8)} | [${a.product_group || '?'}] ${a.title} | ${segs.length} đoạn${a._error ? ` | LỖI: ${a._error.slice(0, 80)}` : ''}`);
    console.log(`   cụm: ${cl ? `${cl.id} (${cl.confidence}) — ${cl.basis}` : 'KHÔNG (lạc cụm hoặc chưa đủ dữ liệu)'}`);
    for (const s of segs) console.log(`   ${fmtT(s.start)}-${fmtT(s.end)} | ${s.action.slice(0, 70)} | chủ thể=${s.subject ?? '?'} | máy=${s.product_visible ?? '?'}${s.product_clear_from != null ? `@${Number(s.product_clear_from).toFixed(1)}s` : ''} | stage=${s.stage ?? '?'} | dọc=${s.vertical_ok}`);
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((e) => { console.error('LỖI:', e?.message || e); process.exit(1); });
}
