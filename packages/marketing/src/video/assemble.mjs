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
  vertical: { w: 1080, h: 1920, subFont: 13.5, subMargin: 48 },
  horizontal: { w: 1920, h: 1080, subFont: 13, subMargin: 55 },
};

// Chuẩn hóa một cảnh -> sceneN.mp4 (đồng nhất codec để nối bằng -c copy).
async function buildSceneSegment(scene, fmt, workDir, index) {
  const seg = `scene${index}.mp4`;
  const srtName = `scene${index}.srt`;
  const blocks = buildBlocks(scene.text || '', scene.durationSec);
  await writeFile(join(workDir, srtName), blocksToSrt(blocks), 'utf8');

  const style =
    `Fontname=${FONT_REGULAR},FontSize=${fmt.subFont},` +
    `PrimaryColour=&H00FFFFFF,OutlineColour=&H00202020,BorderStyle=1,Outline=2,Shadow=0,` +
    `Alignment=2,MarginV=${fmt.subMargin}`;
  // Filter FIT-IN-BLUR-BACKGROUND: giữ nguyên tỷ lệ ảnh gốc (không crop, không méo). Nếu ảnh
  // khác tỷ lệ khung, phủ 2 bên bằng chính ảnh đó phóng to + BLUR mạnh (kiểu TikTok/Reels).
  const vf =
    `[0:v]split[bg0][fg0];` +
    `[bg0]scale=${fmt.w}:${fmt.h}:force_original_aspect_ratio=increase,crop=${fmt.w}:${fmt.h},` +
    `boxblur=luma_radius=20:luma_power=2:chroma_radius=20:chroma_power=1,` +
    `eq=brightness=-0.05:saturation=0.85,fps=30,format=yuv420p[bg];` +
    `[fg0]scale=${fmt.w}:${fmt.h}:force_original_aspect_ratio=decrease,fps=30,format=yuv420p[fg];` +
    `[bg][fg]overlay=(W-w)/2:(H-h)/2,` +
    `subtitles=${srtName}:fontsdir=.:force_style='${style}'[v]`;

  const inputArgs = scene.kind === 'image'
    ? ['-loop', '1', '-framerate', '30', '-i', scene.videoPath]
    : ['-stream_loop', '-1', '-i', scene.videoPath];

  await ffmpeg([
    '-y', ...inputArgs, '-i', scene.audioPath,
    '-t', scene.durationSec.toFixed(3),
    '-filter_complex', vf,
    '-map', '[v]', '-map', '1:a',
    '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p',
    '-r', '30', '-video_track_timescale', '30000',
    '-c:a', 'aac', '-ar', '44100', '-ac', '2',
    seg,
  ], { cwd: workDir });
  return seg;
}

// Ghép toàn bộ. scenes: [{videoPath, audioPath, durationSec, text, kind}].
// brandLine: dòng nhận diện phủ trên đầu video (vd "SDVICO • Hotline 1900 23 23 49").
// priceBadge (8/9, Thanh: giá vào video dạng úp mở): chữ tem giá (có thể 2 dòng), null = không tem.
// badgeFromScene: tem hiện từ cảnh nội dung thứ N (0-based); badgeOffsetSec: lệch thêm bao nhiêu giây
// trong cảnh đó (8/9 tối, Thanh: "gần tới lúc đọc phần giảm giá thì mới hiện tem", kẻo bà con thấy
// giá sớm rồi bỏ đi). Tem giữ tới hết phần nội dung, không đè intro/outro.
export async function assembleVideo({ scenes, format, workDir, brandLine, outPath, outroAudioPath = null, priceBadge = null, badgeFromScene = 0, badgeOffsetSec = 0 }) {
  const fmt = FORMATS[format];
  if (!fmt) throw new Error(`format khong hop le: ${format}`);
  await ensureFonts(workDir);

  const segs = [];
  for (let i = 0; i < scenes.length; i++) {
    segs.push(await buildSceneSegment(scenes[i], fmt, workDir, i));
  }

  // Intro + Outro: đóng khung hai đầu video (logo/tổng đài SDVICO). Không chặn dây chuyền nếu lỗi.
  let introSeg = null;
  let outroSeg = null;
  let introDur = 0;
  let outroDur = 0;
  try {
    const b = await buildBumpers({ workDir, fmt, outroAudioPath });
    introSeg = b.introSeg;
    outroSeg = b.outroSeg;
    // Thời lượng thật để banner "SDVICO • Hotline" CHỈ hiện ở cảnh nội dung, không đè lên
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
  const pad = fmt.w >= 1920 ? 40 : 30;
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
    const badgeFont = fmt.w >= 1920 ? 34 : 46;
    const en = end > start ? `:enable='between(t,${start.toFixed(2)},${end.toFixed(2)})'` : '';
    badgeFilter =
      `,drawtext=fontfile=BeVietnamPro-Black.ttf:textfile=badge.txt:` +
      `fontcolor=white:fontsize=${badgeFont}:line_spacing=10:` +
      `box=1:boxcolor=0x113B64@0.92:boxborderw=24:` +
      `x=(w-tw)/2:y=h*0.57${en}`;
    // Vị trí và màu (Thanh xem 2 bản thử 8/9 tối): y=h*0.68 đè phụ đề, y=h*0.50 cao quá -> h*0.57;
    // nền xanh dương logo 0x113B64 chữ trắng thay cho vàng.
  }

  await ffmpeg([
    '-y', '-i', baseName,
    '-vf', drawtext + badgeFilter,
    '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p',
    '-c:a', 'copy', '-movflags', '+faststart',
    outPath,
  ], { cwd: workDir });

  return outPath;
}

// eslint dùng FONT_BLACK gián tiếp qua fontfile; giữ import để rõ nguồn.
void FONT_BLACK;
