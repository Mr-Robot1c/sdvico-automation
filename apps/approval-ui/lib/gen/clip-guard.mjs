// clip-guard.mjs - rao chan cho bai content dua tren CLIP THAT (review 8/10, bai afd3d0ec).
// Su co: clip quay MAN HINH may tinh (phan mem mo phong SDNavi, R&D noi bo) bi dua vao bai content,
// model tu xung "dung tren boong", tu dung ky uc "may chuc nam truoc", hoi cau ep chon phe.
// Gom 3 viec:
//   1. looksLikeInternalRnD(text)     - clip R&D noi bo (quay man hinh, mo phong...) khong duoc vao kho Content.
//   2. buildClipContentTopic(...)     - chu de bam MO TA clip, giong Page, cam xung nguoi chung kien.
//   3. fabricatedWitnessSentences(..) - bat cau tu xung chung kien / ky uc bia / cau hoi ep chon.
// Khong import gi (Vercel goi nhe). BAN SAO y het o packages/marketing/src va apps/approval-ui/lib/gen,
// test-clip-guard.mjs kiem hai ban con giong nhau.

const fold = (s) => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/đ/g, 'd').replace(/Đ/g, 'D')
  .toLowerCase();

// Dau hieu clip R&D noi bo (da fold khong dau). "man hinh" mot minh KHONG du: man hinh giam sat
// tren tau la tu lieu that. Phai "quay man hinh" / "man hinh may tinh".
const RND_PATTERNS = [
  /quay man hinh/,
  /man hinh may tinh/,
  /phan mem mo phong/,
  /\bmo phong\b/,
  /\bgazebo\b/,
  /\bgzweb\b/,
  /\bqgroundcontrol\b/,
  /\bsdnavi\b/,
  /\busv\b/,
  /\bbo mach\b/,
  /\bban thu\b/,
];
export const RND_FOLDER = 'R&D nội bộ';

export function looksLikeInternalRnD(text) {
  const t = fold(text);
  if (!t) return false;
  return RND_PATTERNS.some((re) => re.test(t));
}

// Loc clip (title + description) khoi danh sach ung vien cho bai content.
export function dropInternalRnDClips(clips) {
  return (clips || []).filter((a) => !looksLikeInternalRnD(`${a?.title || ''} ${a?.description || ''}`));
}

// description luu kem " | Hop canh: ... | Tu khoa: ..." sau phan mo ta chinh -> chi lay phan mo ta.
export function cleanClipDescription(description, max = 600) {
  const main = String(description || '').split(/\s\|\s/)[0].replace(/\s+/g, ' ').trim();
  return main.length > max ? main.slice(0, max).replace(/\s+\S*$/, '') + '...' : main;
}

const CLIP_TOPIC_BAN = 'KHÔNG xưng người chứng kiến ("hôm nay đứng trên boong..."), KHÔNG dựng ký ức hay kinh nghiệm cá nhân ("nhớ lại mấy chục năm trước..."), KHÔNG đóng vai ngư dân; Page nói chuyện với bà con. Không bán hàng. Kết bằng MỘT câu hỏi cụ thể về trải nghiệm hoặc điều bà con quan tâm, không hỏi kiểu chọn phe, không dùng "tuyệt đối", "có dám".';

export function buildClipContentTopic(title, description) {
  const desc = cleanClipDescription(description);
  if (!desc) {
    return `Viết bài Page SDVICO dựa trên clip đội SDVICO quay: "${title}". Chỉ kể trong phạm vi tên clip, không thêm cảnh, người hay sự kiện không có trong tên clip; nói rõ SDVICO đang làm gì. ${CLIP_TOPIC_BAN}`;
  }
  return `Viết bài Page SDVICO dựa trên clip đội SDVICO quay: "${title}". NHỮNG GÌ CLIP CHO THẤY (chỉ được kể trong phạm vi này): ${desc} Kể đúng điều clip thể hiện; nói rõ SDVICO đang làm gì trong clip. ${CLIP_TOPIC_BAN}`;
}

// ---- Rao cung sau khi sinh: cau tu xung chung kien / ky uc bia / cau hoi ep chon ----
const TIME = '(?:hôm nay|sáng nay|chiều nay|tối nay|hôm qua|tối qua)';
const VERB = '(?:đứng|ngồi|nhìn|theo chân|xuống tàu|lên tàu|chứng kiến)';
// Cau MO DAU bang moc thoi gian roi toi dong tu (chu ngu luoc = nguoi ke), kem "tôi/mình" tuy chon.
const RE_WITNESS_OPEN = new RegExp(`^${TIME}\\s+(?:(?:tôi|tui|mình|em)\\s+)?(?:vừa\\s+|lại\\s+|được\\s+|mới\\s+)?${VERB}(?![\\p{L}])`, 'iu');
// "tôi/mình" lam chu ngu truoc dong tu (tru "anh em mình", "bà con mình": so nhieu, khong phai nhan chung kien).
const RE_WITNESS_I = new RegExp(`(?<![\\p{L}])(?<!(?:anh em|bà con|bạn bè|chúng)\\s+)(?:tôi|tui|mình)\\s+(?:vừa\\s+|đã\\s+|mới\\s+|được\\s+|có\\s+dịp\\s+)?${VERB}(?![\\p{L}])`, 'iu');
const RE_MEMORY = [
  // "nhớ lại" bị bắt, trừ khi câu đang mời bà con nhớ ("Bác nào còn nhớ lại chuyến đầu...").
  /^(?!.*(?:bác|bà con|bạn)\s.*nhớ lại).*nhớ lại/iu,
  /mấy chục năm trước/iu,
  /hồi\s+(?:(?:anh em|bà con)\s+)?(?:tôi|tui|mình)\s+còn/iu,
  /ngày xưa\s+(?:(?:anh em|bà con)\s+)?(?:tôi|tui|mình)/iu,
  /hồi trước\s+(?:(?:anh em|bà con)\s+)?(?:tôi|tui|mình)/iu,
];
const RE_FORCED_Q = /có dám|tuyệt đối/iu;

function splitSentences(text) {
  return String(text || '')
    .split(/\n+|(?<=[.!?…])\s+/u)
    .map((s) => s.trim())
    .filter(Boolean);
}
const stripLead = (s) => s.replace(/^[^\p{L}\p{N}#]+/u, '');

function sentenceIsFabricated(raw) {
  const s = stripLead(raw);
  if (!s || s.startsWith('#')) return false;
  if (RE_WITNESS_OPEN.test(s) || RE_WITNESS_I.test(s)) return true;
  if (RE_MEMORY.some((re) => re.test(s))) return true;
  if (s.includes('?') && RE_FORCED_Q.test(s)) return true;
  return false;
}

// Tra ve danh sach cau dinh loi (nguyen van).
export function fabricatedWitnessSentences(text) {
  return splitSentences(text).filter(sentenceIsFabricated);
}

// Cat cac cau dinh loi, giu nguyen xuong dong va hashtag. Tra {text, removed, bodyLeft}.
export function stripFabricatedSentences(text) {
  const removed = [];
  const lines = String(text || '').split('\n').map((line) => {
    const parts = line.split(/(?<=[.!?…])\s+/u);
    const kept = parts.filter((p) => {
      if (sentenceIsFabricated(p)) { removed.push(p.trim()); return false; }
      return true;
    });
    return kept.join(' ');
  });
  const out = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  const bodyLeft = out.split('\n').filter((l) => l.trim() && !l.trim().startsWith('#')).join(' ').length;
  return { text: out, removed, bodyLeft };
}

// Loi nhac cho lan sinh lai.
export function witnessRetryNote(sentences) {
  const quoted = sentences.slice(0, 3).map((s) => `"${s}"`).join('; ');
  return `LẦN TRƯỚC VIẾT ${quoted} — đây là chuyện tự thêm, tư liệu không có. Page không xưng người chứng kiến, không dựng ký ức, câu hỏi không ép chọn phe.`;
}

// Dung chung cho hai ban generateContentPost: nhan body da sinh, tra {body, warn}.
//   - con cau dinh -> cat; cat het than bai thi giu nguyen va tra warn (nguoi duyet thay).
export function resolveWitnessBody(body) {
  const bad = fabricatedWitnessSentences(body);
  if (!bad.length) return { body, warn: [] };
  const cut = stripFabricatedSentences(body);
  if (cut.bodyLeft >= 40) return { body: cut.text, warn: [] };
  return { body, warn: bad };
}
