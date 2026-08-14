// Dựng block phụ đề từ text kịch bản (chính xác, không qua ASR) và thời lượng cảnh.
// Chia text thành mẩu ngắn dễ đọc, timing theo tỉ lệ số ký tự.

const MAX_CHARS = 46; // mỗi mẩu tối đa ~46 ký tự cho dễ đọc

// Chia câu dài thành các mẩu <= MAX_CHARS, cắt ở ranh giới từ.
function chunk(text) {
  const words = text.replace(/\s+/g, ' ').trim().split(' ');
  const out = [];
  let cur = '';
  for (const w of words) {
    if (cur && (cur.length + 1 + w.length) > MAX_CHARS) {
      out.push(cur);
      cur = w;
    } else {
      cur = cur ? `${cur} ${w}` : w;
    }
  }
  if (cur) out.push(cur);
  return out;
}

function fmt(sec) {
  if (sec < 0) sec = 0;
  const ms = Math.round(sec * 1000);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const r = ms % 1000;
  const p = (n, l = 2) => String(n).padStart(l, '0');
  return `${p(h)}:${p(m)}:${p(s)},${p(r, 3)}`;
}

// Trả về [{start,end,text}] cho một cảnh dài durationSec giây (tính từ 0).
export function buildBlocks(text, durationSec) {
  const parts = chunk(text);
  if (!parts.length) return [];
  const totalChars = parts.reduce((a, p) => a + p.length, 0) || 1;
  const blocks = [];
  let t = 0;
  for (let i = 0; i < parts.length; i++) {
    const share = (parts[i].length / totalChars) * durationSec;
    const start = t;
    let end = i === parts.length - 1 ? durationSec : t + share;
    if (end - start < 0.6) end = Math.min(durationSec, start + 0.6);
    blocks.push({ start, end, text: parts[i] });
    t = end;
  }
  return blocks;
}

// Đổi blocks (thời gian tương đối) thành chuỗi SRT.
export function blocksToSrt(blocks) {
  return blocks
    .map((b, i) => `${i + 1}\n${fmt(b.start)} --> ${fmt(b.end)}\n${b.text}\n`)
    .join('\n');
}
