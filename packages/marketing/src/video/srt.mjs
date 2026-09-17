// Dựng block phụ đề từ text kịch bản (chính xác, không qua ASR) và thời lượng cảnh.
// Chia text thành mẩu ngắn dễ đọc, timing theo tỉ lệ số ký tự.

// 17/9 (ChatGPT vòng 1: "chữ đè lên người và máy"): 46 ký tự bẻ thành 2-3 dòng leo giữa khung -> rút 30.
// 17/9 vòng 5 (ChatGPT: cắt 30 ký tự greedy làm đứt cụm — "trên boong hôi" / "rình với đục ngầu",
// "SF300B giữ" / "dầu sạch bong", người xem phải ghép 3 frame mới hiểu 1 câu, còn dễ đọc nhầm chữ):
// chia THEO Ý — nguyên câu nếu vừa, rồi theo vế (dấu phẩy), vế dài thì chia ĐỀU ở ranh giới từ
// (không greedy để khỏi lòi mẩu cụt 1-2 chữ). Trần nới lên 40 ký tự (~2 dòng), vẫn dưới mức 46 bị chê.
export const MAX_CHARS = 40; // mỗi mẩu tối đa ~40 ký tự

// Từ nối hay đứng ĐẦU vế mới: cắt ngay trước các từ này thì mẩu trước trọn ý ("...hôi rình" | "với đục
// ngầu..."), cắt sau chúng thì đứt cụm. Chia đều thuần ký tự từng cắt "trên boong hôi" / "rình với...".
const CONNECTORS = new Set(['với', 'rồi', 'mà', 'thì', 'là', 'để', 'cho', 'nên', 'vì', 'và', 'hay', 'hoặc', 'đành', 'chứ', 'nhưng', 'khi', 'lúc', 'nếu', 'bằng', 'trong', 'ngoài', 'trên', 'dưới', 'vừa', 'suốt', 'sau', 'trước', 'giữa', 'theo', 'như', 'về']);
// (không đưa 'còn' vào: 'chỉ còn 3 X triệu' mà cắt trước 'còn' là đứt cụm giá)
// Mã sản phẩm (SEA-40, SF300B...): không cắt ngay trước mã để mã đi liền với tên máy.
const CODE_RE = /^[a-z]{2,}[-]?\d/i;

// Chia một cụm dài thành 2 nửa gần bằng nhau tại ranh giới từ, ưu tiên điểm cắt đứng TRƯỚC từ nối;
// nửa nào còn dài quá thì chia tiếp (đệ quy).
function splitBalanced(text) {
  if (text.length <= MAX_CHARS) return [text];
  const words = text.split(' ');
  const mid = text.length / 2;
  let best = 0;
  let bestScore = Infinity;
  for (let i = 0; i < words.length - 1; i++) {
    const prefixLen = words.slice(0, i + 1).join(' ').length;
    const next = words[i + 1].toLowerCase().replace(/[^\p{L}]/gu, '');
    // Cắt SAU mã sản phẩm là điểm ngắt đẹp (tên máy kết thúc bằng mã): thưởng thêm.
    // Cắt ngay sau CON SỐ trần thì số lìa đơn vị ("56 | triệu"): phạt.
    const score = Math.abs(prefixLen - mid) - (CONNECTORS.has(next) ? 6 : 0) + (CODE_RE.test(words[i + 1]) ? 12 : 0) - (CODE_RE.test(words[i]) ? 6 : 0) + (/^\d+([.,]\d+)?$/.test(words[i]) ? 6 : 0);
    if (score < bestScore) { bestScore = score; best = i; }
  }
  return [...splitBalanced(words.slice(0, best + 1).join(' ')), ...splitBalanced(words.slice(best + 1).join(' '))];
}

// Chia text thành các mẩu trọn ý: câu -> vế theo dấu phẩy -> chia đều theo từ.
function chunk(text) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const out = [];
  for (const sent of clean.split(/(?<=[.!?…])\s+/)) {
    if (sent.length <= MAX_CHARS) { out.push(sent); continue; }
    // Gom các vế (kết bằng dấu phẩy) vào mẩu <= MAX_CHARS.
    let cur = '';
    for (const clause of sent.split(/(?<=,)\s+/)) {
      const cand = cur ? `${cur} ${clause}` : clause;
      if (cand.length <= MAX_CHARS) { cur = cand; continue; }
      if (cur) out.push(cur);
      if (clause.length <= MAX_CHARS) { cur = clause; continue; }
      const pieces = splitBalanced(clause);
      out.push(...pieces.slice(0, -1));
      cur = pieces[pieces.length - 1];
    }
    if (cur) out.push(cur);
  }
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
