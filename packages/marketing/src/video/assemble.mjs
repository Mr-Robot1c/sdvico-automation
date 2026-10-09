// Ghép video từ các cảnh: mỗi cảnh = 1 clip/ảnh + narration + phụ đề (từ kịch bản).
// Chuẩn hóa từng cảnh về đúng khung (dọc 9:16 hoặc ngang 16:9) rồi nối, phủ nhận diện.
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ffmpeg, probeDuration } from './ffmpeg.mjs';
import { buildBlocks, blocksToSrt } from './srt.mjs';
import { ensureFonts, FONT_REGULAR, FONT_BLACK } from './fonts.mjs';
import { buildBumpers } from './bumpers.mjs';

export const FORMATS = {
  // 5/9 (sếp): phụ đề nhỏ đi 10% (15 -> 13.5) và hạ thấp hơn một chút (MarginV 90 -> 70).
  // 8/9 tối (Thanh xem video thử): phụ đề hạ thấp thêm chút nữa (MarginV 70 -> 48).
  // 3/10 (vòng chấm ChatGPT: phụ đề thấp dễ bị caption/nút tương tác của TikTok và Reels che): đo bằng
  // libass thật, MarginV là đơn vị PlayRes 288 (tỉ lệ 1920/288 = 6,67 px mỗi đơn vị), nên 48 = đáy chữ
  // cách mép dưới ~330px, 56 = ~385px (vùng an toàn tối thiểu 280px, nới thêm cho Reels/Shorts).
  // brandY: lề trên của dải "SDVICO - Hotline": 30 -> 116 (mép trên của hộp nền ~100px, tránh thanh trạng thái).
  vertical: { w: 1080, h: 1920, subFont: 13.5, subMargin: 56, brandY: 116 },
  horizontal: { w: 1920, h: 1080, subFont: 13, subMargin: 55, brandY: 40 },
};

// 3/10: loudnorm 1-pass trên master cuối. Đo 3 video mẫu ra ~-19,5 LUFS, chuẩn mạng xã hội -16 tới -14.
// Trước đó bước cuối chép nguyên tiếng (-c:a copy), tiếng từng cảnh chỉ qua apad, KHÔNG có loudnorm.
// Đo thật (video thử 11s): 1-pass loudnorm chỉ lên -18,1 LUFS vì khúc khởi động của bộ lọc (khối 3 giây
// đầu) kéo tụt, nên làm 2-pass: pass 1 đo, pass 2 áp tham số đo với linear=true (đạt sát -15). Hỏng bước đo
// thì lùi về 1-pass.
// 3/10 vòng 2: TP đích -1.7 (không phải -1.5): đo 2 file ra -1,48 / -1,49 dBTP, lố nhẹ trần -1,5 đã hứa vì bộ
// lọc để lệch cỡ 0,02 dB; chừa biên 0,2 dB để kết quả thực luôn <= -1,5.
export const LOUDNORM_FILTER = 'loudnorm=I=-15:TP=-1.7:LRA=11';

// Lấy khối JSON loudnorm in cuối stderr của pass 1. Trả null nếu thiếu/đọc không được.
export function parseLoudnormStats(stderr) {
  const m = String(stderr || '').match(/\{[^{}]*"input_i"[^{}]*\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]);
    const f = (k) => Number(j[k]);
    const s = { i: f('input_i'), tp: f('input_tp'), lra: f('input_lra'), thresh: f('input_thresh'), offset: f('target_offset') };
    // Âm lượng "-inf" (video không có tiếng) hoặc thiếu số => không dùng được.
    return Object.values(s).every(Number.isFinite) ? s : null;
  } catch { return null; }
}

// Filter loudnorm cho pass 2 (dùng số đo) hoặc 1-pass khi không có số đo.
// linear=true chỉ chạy khi LRA đo được <= LRA đích; video có đoạn lặng/nhạc intro hay vượt 11 (đo thử
// 18,7 => bộ lọc rơi về dynamic, ra -16,1 thay vì -15). Nên pass 2 nâng LRA đích lên bằng LRA đo (làm tròn
// lên), khi đó chỉ tăng/giảm gain thuần, không nén dải động, I=-15 và TP=-1.7 giữ nguyên.
export function loudnormFilterFor(stats) {
  if (!stats) return LOUDNORM_FILTER;
  const lraTarget = Math.max(11, Math.ceil(stats.lra));
  return `loudnorm=I=-15:TP=-1.7:LRA=${lraTarget}:measured_I=${stats.i}:measured_TP=${stats.tp}:measured_LRA=${stats.lra}:measured_thresh=${stats.thresh}:offset=${stats.offset}:linear=true`;
}

// 3/10: cỡ chữ thẻ giá 36 -> 42 (một nấc), thẻ tối đa 2 dòng. Dòng nào quá dài (>32 ký tự) thì lùi về 38
// để thẻ không loang sang vùng nút tương tác bên phải (đo: 42 => rộng ~700px, canh giữa 190..890).
export function badgeFontSize(priceBadge, fmtW) {
  if (fmtW >= 1920) return 30;
  const longest = String(priceBadge || '').split('\n').reduce((m, l) => Math.max(m, l.length), 0);
  return longest > 32 ? 38 : 42;
}

// 17/9 vòng 3 (ChatGPT chấm lại: "nền blur hai đầu làm hình chính nhỏ lại, B2B cần nhìn máy và thao
// tác; không cần nền blur, crop mạnh hơn sẽ tốt hơn"): mặc định CROP LẤP KHUNG (cover). Ảnh tĩnh
// thêm zoom chậm ~8% cho đỡ đứng hình (ChatGPT: máy SF300B đứng nguyên 6 giây). FIT_MODE=blur về kiểu cũ.
const FIT_MODE = process.env.FIT_MODE || 'cover';

// 9/10 ĐỢT A: filter_complex cho cảnh cắt đoạn. n đầu vào video (mỗi đoạn một input), chuẩn hóa từng đoạn về
// đúng khung (crop lấp khung), nối bằng concat, nếu thiếu hình thì tpad giữ khung cuối holdSec giây (KHÔNG lặp
// đoạn), rồi phụ đề (subFilter có dấu phẩy đứng đầu, hoặc rỗng) -> nhãn [v].
export function buildPiecesFilter(n, fmt, holdSec, subFilter) {
  const parts = [];
  for (let i = 0; i < n; i++) {
    parts.push(`[${i}:v]scale=${fmt.w}:${fmt.h}:force_original_aspect_ratio=increase,crop=${fmt.w}:${fmt.h},setsar=1,fps=30,format=yuv420p,setpts=PTS-STARTPTS[p${i}]`);
  }
  let last = 'p0';
  if (n > 1) {
    parts.push(`${Array.from({ length: n }, (_, i) => `[p${i}]`).join('')}concat=n=${n}:v=1:a=0[vc]`);
    last = 'vc';
  }
  if (holdSec > 0.02) {
    parts.push(`[${last}]tpad=stop_mode=clone:stop_duration=${holdSec.toFixed(3)}[vh]`);
    last = 'vh';
  }
  parts.push(`[${last}]${subFilter ? subFilter.replace(/^,/, '') : 'null'}[v]`);
  return parts.join(';');
}

// Chuẩn hóa một cảnh -> sceneN.mp4 (đồng nhất codec để nối bằng -c copy).
// noSub (17/9 vòng 3): cảnh giá đã có tem giá to giữa hình, phụ đề đọc lại y chang = 1 thông tin hiện
// 2 chỗ (ChatGPT) -> cảnh giá tắt phụ đề, tem lo phần chữ, giọng vẫn đọc đủ.
async function buildSceneSegment(scene, fmt, workDir, index, { noSub = false } = {}) {
  const seg = `scene${index}.mp4`;
  const srtName = `scene${index}.srt`;
  // 18/9: phụ đề chia trên phần ĐỌC (trừ đệm thở padSec cuối khúc tiếng) — xem padSecOf ở build-video.
  const blocks = buildBlocks(scene.text || '', scene.durationSec, { speechSec: scene.durationSec - (Number(scene.padSec) || 0) });
  await writeFile(join(workDir, srtName), blocksToSrt(blocks), 'utf8');

  const style =
    `Fontname=${FONT_REGULAR},FontSize=${fmt.subFont},` +
    `PrimaryColour=&H00FFFFFF,OutlineColour=&H00202020,BorderStyle=1,Outline=2,Shadow=0,` +
    `Alignment=2,MarginV=${fmt.subMargin}`;
  const subFilter = noSub ? '' : `,subtitles=${srtName}:fontsdir=.:force_style='${style}'`;
  const coverImage = FIT_MODE !== 'blur' && scene.kind === 'image';
  let vf;
  if (FIT_MODE === 'blur') {
    // Kiểu cũ FIT-IN-BLUR-BACKGROUND: giữ nguyên tỷ lệ, phủ 2 đầu bằng chính hình phóng to + blur.
    vf =
      `[0:v]split[bg0][fg0];` +
      `[bg0]scale=${fmt.w}:${fmt.h}:force_original_aspect_ratio=increase,crop=${fmt.w}:${fmt.h},` +
      `boxblur=luma_radius=20:luma_power=2:chroma_radius=20:chroma_power=1,` +
      `eq=brightness=-0.05:saturation=0.85,fps=30,format=yuv420p[bg];` +
      `[fg0]scale=${fmt.w}:${fmt.h}:force_original_aspect_ratio=decrease,fps=30,format=yuv420p[fg];` +
      `[bg][fg]overlay=(W-w)/2:(H-h)/2${subFilter}[v]`;
  } else if (coverImage) {
    // Ảnh: crop lấp khung ở 2x rồi zoompan phóng chậm tới 1.08 (Ken Burns nhẹ), xuất đúng WxH.
    const totalFrames = Math.max(2, Math.round(scene.durationSec * 30));
    vf =
      `[0:v]scale=${fmt.w * 2}:${fmt.h * 2}:force_original_aspect_ratio=increase,crop=${fmt.w * 2}:${fmt.h * 2},` +
      `zoompan=z='1+0.08*on/${totalFrames}':x='(iw-iw/zoom)/2':y='(ih-ih/zoom)/2':d=${totalFrames}:s=${fmt.w}x${fmt.h}:fps=30,` +
      `format=yuv420p${subFilter}[v]`;
  } else {
    // Clip: crop lấp khung, chủ thể chiếm trọn 9:16.
    vf = `[0:v]scale=${fmt.w}:${fmt.h}:force_original_aspect_ratio=increase,crop=${fmt.w}:${fmt.h},fps=30,format=yuv420p${subFilter}[v]`;
  }

  // 9/10 ĐỢT A: cảnh có kế hoạch cắt đoạn (scene.pieces từ planSceneSegments) thì lấy ĐÚNG các đoạn
  // `-ss start -t dur` rồi nối, KHÔNG lặp clip từ giây 0. Hết đoạn mà lời còn dài (scene.holdSec) thì giữ khung
  // cuối cho phần thiếu. Chỉ áp ở kiểu crop lấp khung (mặc định); cảnh không có pieces giữ nguyên đường cũ.
  const usePieces = FIT_MODE !== 'blur' && scene.kind !== 'image' && Array.isArray(scene.pieces) && scene.pieces.length > 0;
  let audioIdx = 1;
  let inputArgs;
  if (usePieces) {
    inputArgs = scene.pieces.flatMap((p) => ['-ss', Number(p.start).toFixed(3), '-t', Number(p.dur).toFixed(3), '-i', p.path]);
    audioIdx = scene.pieces.length;
    vf = buildPiecesFilter(scene.pieces.length, fmt, Number(scene.holdSec) || 0, subFilter);
  } else {
    inputArgs = scene.kind === 'image'
      ? (coverImage ? ['-i', scene.videoPath] : ['-loop', '1', '-framerate', '30', '-i', scene.videoPath])
      : ['-stream_loop', '-1', '-i', scene.videoPath];
  }

  await ffmpeg([
    '-y', ...inputArgs, '-i', scene.audioPath,
    '-t', scene.durationSec.toFixed(3),
    '-filter_complex', vf,
    '-map', '[v]', '-map', `${audioIdx}:a`,
    // 18/9 (đo bản e335de29: tiếng AAC mỗi đoạn ngắn hơn hình 12-59ms, nối 5 đoạn thành hụt tiếng
    // ở mép cảnh): apad đắp lặng cho tiếng đầy đúng -t như hình, hết khe hụt khi concat -c copy.
    '-af', 'apad',
    '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p',
    '-r', '30', '-video_track_timescale', '30000',
    '-c:a', 'aac', '-ar', '44100', '-ac', '2',
    seg,
  ], { cwd: workDir });
  return seg;
}

// Ghép toàn bộ. scenes: [{videoPath, audioPath, durationSec, text, kind}].
// brandLine: dòng nhận diện phủ trên đầu video (vd "SDVICO - Hotline 1900 23 23 49").
// priceBadge (8/9, Thanh: giá vào video dạng úp mở): chữ tem giá (có thể 2 dòng), null = không tem.
// badgeFromScene: tem hiện từ cảnh nội dung thứ N (0-based); badgeOffsetSec: lệch thêm bao nhiêu giây
// trong cảnh đó (8/9 tối, Thanh: "gần tới lúc đọc phần giảm giá thì mới hiện tem", kẻo bà con thấy
// giá sớm rồi bỏ đi). Tem giữ tới hết phần nội dung, không đè intro/outro.
// outroKeyword (17/9): chữ in hoa trên màn hình outro ("LỌC DẦU"), null = chữ chung.
export async function assembleVideo({ scenes, format, workDir, brandLine, outPath, outroAudioPath = null, priceBadge = null, badgeFromScene = 0, badgeOffsetSec = 0, outroKeyword = null }) {
  const fmt = FORMATS[format];
  if (!fmt) throw new Error(`format khong hop le: ${format}`);
  await ensureFonts(workDir);

  const segs = [];
  for (let i = 0; i < scenes.length; i++) {
    // 17/9 vòng 3: cảnh giá có tem giá thì tắt phụ đề (1 thông tin chỉ hiện 1 chỗ).
    segs.push(await buildSceneSegment(scenes[i], fmt, workDir, i, { noSub: !!priceBadge && scenes[i].role === 'price' }));
  }

  // Intro + Outro: đóng khung hai đầu video (logo/tổng đài SDVICO). Không chặn dây chuyền nếu lỗi.
  let introSeg = null;
  let outroSeg = null;
  let introDur = 0;
  let outroDur = 0;
  try {
    const b = await buildBumpers({ workDir, fmt, outroAudioPath, outroKeyword });
    introSeg = b.introSeg;
    outroSeg = b.outroSeg;
    // Thời lượng thật để banner "SDVICO - Hotline" CHỈ hiện ở cảnh nội dung, không đè lên
    // intro/outro (đã có logo + số điện thoại to, thêm banner là trùng — sếp góp ý 18/8).
    try { introDur = introSeg ? await probeDuration(join(workDir, introSeg)) : 0; } catch { introDur = 0; }
    try { outroDur = outroSeg ? await probeDuration(join(workDir, outroSeg)) : 0; } catch { outroDur = 0; }
  } catch (e) {
    console.warn('Intro/Outro bỏ qua:', e.message);
  }

  // Nối các cảnh (cùng codec -> copy). Intro trước, cảnh chính, outro sau.
  const listName = `concat_${format}.txt`;
  const allSegs = [introSeg, ...segs, outroSeg].filter(Boolean);
  await writeFile(join(workDir, listName), allSegs.map((s) => `file '${s}'`).join('\n'), 'utf8');
  const baseName = `base_${format}.mp4`;
  await ffmpeg(['-y', '-f', 'concat', '-safe', '0', '-i', listName, '-c', 'copy', baseName], { cwd: workDir });

  // Phủ nhận diện: dải chữ trên đầu (dùng textfile để né escape).
  await writeFile(join(workDir, 'brand.txt'), brandLine || 'SDVICO', 'utf8');
  const brandFont = fmt.w >= 1920 ? 26 : 30;
  const pad = fmt.brandY;
  // enable=between(t, introDur, total-outroDur): banner chỉ ở phần nội dung chính.
  let totalDur = 0;
  try { totalDur = await probeDuration(join(workDir, baseName)); } catch { totalDur = 0; }
  const enableExpr = totalDur > 0 && (introDur > 0 || outroDur > 0)
    ? `:enable='between(t,${introDur.toFixed(2)},${(totalDur - outroDur).toFixed(2)})'`
    : '';
  const drawtext =
    `drawtext=fontfile=BeVietnamPro-Black.ttf:textfile=brand.txt:` +
    `fontcolor=white:fontsize=${brandFont}:` +
    `box=1:boxcolor=black@0.45:boxborderw=16:` +
    `x=(w-tw)/2:y=${pad}${enableExpr}`;

  // 8/9 (Thanh: giá vào video, dạng úp mở): tem giá vàng kiểu reel, hiện từ cảnh giải pháp
  // (badgeFromScene) tới hết phần nội dung, KHÔNG đè intro/outro. Chữ qua textfile (có dấu).
  let badgeFilter = '';
  if (priceBadge) {
    await writeFile(join(workDir, 'badge.txt'), priceBadge, 'utf8');
    let start = introDur;
    for (let i = 0; i < Math.min(badgeFromScene, scenes.length); i++) start += scenes[i].durationSec;
    start += Math.max(0, Number(badgeOffsetSec) || 0);
    const end = totalDur > 0 ? totalDur - outroDur : 0;
    // 17/9 vòng 4 (ChatGPT: box giá phủ lên cảnh lắp đặt khá nặng): 46 -> 36, vẫn đọc được trên điện thoại.
    // 3/10 (ChatGPT: thẻ giá nhỏ khó đọc trên điện thoại): 36 -> 42, vị trí y giữ nguyên h*0.57 (đáy thẻ
    // ~ y 1216, cách đầu phụ đề ~180px, nằm trong vùng an toàn). Chỉ đổi cỡ, KHÔNG đổi nội dung chữ giá.
    const badgeFont = badgeFontSize(priceBadge, fmt.w);
    const en = end > start ? `:enable='between(t,${start.toFixed(2)},${end.toFixed(2)})'` : '';
    badgeFilter =
      `,drawtext=fontfile=BeVietnamPro-Black.ttf:textfile=badge.txt:` +
      `fontcolor=white:fontsize=${badgeFont}:line_spacing=10:` +
      `box=1:boxcolor=0x113B64@0.92:boxborderw=24:` +
      `x=(w-tw)/2:y=h*0.57${en}`;
    // Vị trí và màu (Thanh xem 2 bản thử 8/9 tối): y=h*0.68 đè phụ đề, y=h*0.50 cao quá -> h*0.57;
    // nền xanh dương logo 0x113B64 chữ trắng thay cho vàng.
  }

  // 3/10: pass 1 đo âm lượng master (chỉ tiếng, nhanh), lỗi thì 1-pass.
  let loudStats = null;
  try {
    const r = await ffmpeg(['-y', '-i', baseName, '-vn', '-af', `${LOUDNORM_FILTER}:print_format=json`, '-f', 'null', '-'], { cwd: workDir });
    loudStats = parseLoudnormStats(r.stderr);
  } catch (e) {
    console.warn('Đo loudnorm lỗi, dùng 1-pass:', String(e?.message || e).slice(0, 80));
  }

  await ffmpeg([
    '-y', '-i', baseName,
    '-vf', drawtext + badgeFilter,
    '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p',
    // 3/10: chuẩn hóa âm lượng master cuối về -15 LUFS (xem LOUDNORM_FILTER); trước đây '-c:a copy'.
    '-af', loudnormFilterFor(loudStats),
    '-c:a', 'aac', '-b:a', '160k', '-ar', '44100', '-ac', '2', '-movflags', '+faststart',
    outPath,
  ], { cwd: workDir });

  return outPath;
}

// eslint dùng FONT_BLACK gián tiếp qua fontfile; giữ import để rõ nguồn.
void FONT_BLACK;
