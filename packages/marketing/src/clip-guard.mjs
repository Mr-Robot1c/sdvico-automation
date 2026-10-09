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

// 9/10 (review Codex): không mặc định người trong clip là đội SDVICO; chỉ nói vậy khi mô tả hoặc tên clip ghi rõ.
const CLIP_WHO_RULE = "Chỉ nói người trong clip là đội SDVICO khi mô tả hoặc tên clip ghi rõ điều đó; không rõ thì gọi chung là 'trong clip', không khẳng định người trong hình là ai, không tự thêm địa điểm, khách hàng hay kết quả.";

// 9/10 (review Codex, C3): clip thiếu mô tả (chỉ có tên) thì model phải đoán cảnh, dễ bịa. Chỉ clip có
// phần mô tả chính (sau cleanClipDescription) từ 60 ký tự trở lên mới được dùng làm chủ đề bài content.
export const MIN_CLIP_DESC_CHARS = 60;
export function hasUsableClipDescription(description) {
  return cleanClipDescription(description).length >= MIN_CLIP_DESC_CHARS;
}
// Lọc ứng viên clip content: bỏ clip R&D nội bộ VÀ clip thiếu mô tả. Gọi TRƯỚC pickFreshClips.
export function dropClipsWithoutDescription(clips) {
  return (clips || []).filter((a) => hasUsableClipDescription(a?.description));
}
export function filterContentClips(clips) {
  return dropClipsWithoutDescription(dropInternalRnDClips(clips));
}

export function buildClipContentTopic(title, description) {
  const desc = cleanClipDescription(description);
  if (!desc) {
    return `Viết bài Page SDVICO dựa trên clip đội SDVICO quay: "${title}". Chỉ kể trong phạm vi tên clip, không thêm cảnh, người hay sự kiện không có trong tên clip. ${CLIP_WHO_RULE} ${CLIP_TOPIC_BAN}`;
  }
  return `Viết bài Page SDVICO dựa trên clip đội SDVICO quay: "${title}". NHỮNG GÌ CLIP CHO THẤY (chỉ được kể trong phạm vi này): ${desc} Kể đúng điều clip thể hiện. ${CLIP_WHO_RULE} ${CLIP_TOPIC_BAN}`;
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

// Câu hỏi kết: có dấu ? trong 3 dòng cuối (bỏ hashtag). Cùng luật với scanPlaybook (compliance.mjs).
export function hasClosingQuestion(text) {
  const body = String(text || '').replace(/#\S+/g, '').trim();
  const last3 = body.split(/\r?\n/).filter((s) => s.trim()).slice(-3).join(' ');
  return /\?/.test(last3);
}

// Dung chung cho hai ban generateContentPost: nhan body da sinh, tra {body, warn, cut, lostClosingQuestion}.
//   - con cau dinh -> cat (cut = cac cau da cat); cat het than bai thi giu nguyen va tra warn (nguoi duyet thay).
//   - lostClosingQuestion: da cat cau ma bai khong con cau hoi ket (can viet lai cau ket).
export function resolveWitnessBody(body) {
  const bad = fabricatedWitnessSentences(body);
  if (!bad.length) return { body, warn: [], cut: [], lostClosingQuestion: false };
  const cut = stripFabricatedSentences(body);
  if (cut.bodyLeft >= 40) {
    return { body: cut.text, warn: [], cut: cut.removed, lostClosingQuestion: !hasClosingQuestion(cut.text) };
  }
  return { body, warn: bad, cut: [], lostClosingQuestion: false };
}

// ---- Canh bao di toi nguoi duyet (9/10, review Codex C1) ----
// genFlags di kem phieu: brief.gen_flags (mkt_content) va payload.gen_flags (approval_queue).
export function buildGenFlags(fix) {
  return {
    witness_kept: Array.isArray(fix?.warn) ? fix.warn : [],
    witness_cut: Array.isArray(fix?.cut) ? fix.cut : [],
    lost_closing_question: fix?.lostClosingQuestion === true,
  };
}
// Co it nhat 1 muc khong rong/true thi moi ghi vao phieu.
export function hasGenFlags(g) {
  return !!g && ((g.witness_kept?.length || 0) > 0 || (g.witness_cut?.length || 0) > 0 || g.lost_closing_question === true);
}
// Cau con giu (khong cat duoc) hoac mat cau hoi ket = bai CAN SUA.
export function genFlagsNeedFix(g) {
  return !!g && ((g.witness_kept?.length || 0) > 0 || g.lost_closing_question === true);
}
export const GEN_FLAG_TITLE_PREFIX = '⚠️ Cần sửa: ';
// Ap len phieu: tieu de them tien to, risk toi thieu amber. Khong doi gi neu bai khong can sua.
export function applyGenFlagsToTicket({ title, risk, genFlags }) {
  if (!genFlagsNeedFix(genFlags)) return { title, risk, needsFix: false };
  return { title: `${GEN_FLAG_TITLE_PREFIX}${title}`, risk: risk === 'none' || !risk ? 'amber' : risk, needsFix: true };
}

// ---- Chan nhanh chan dung tu dung nguoi (9/10, review Codex C2, Dieu cam 5) ----
// Prompt 'portrait' bat model tu dien ten, tuoi, que, loi noi nhan vat = bia nguoi. Chan o ham sinh.
export const SAFE_ENGAGE_TOPIC = 'một chuyện nghề biển mà bà con ai cũng từng gặp, mời bà con kể lại trải nghiệm của mình';
export function safeContentType(type) {
  return type === 'portrait' ? 'engage' : type;
}
// Doi loai kem chu de: portrait -> engage thi bo chu de chan dung (tru chu de bam clip).
export function safeContentChoice(type, topicText, fromClip = false) {
  const safe = safeContentType(type);
  const swapped = safe !== type;
  return { type: safe, topicText: swapped && !fromClip ? SAFE_ENGAGE_TOPIC : topicText, swapped };
}

// Bai theo clip bam tu lieu that nen giam do sang tao (9/10, C4c).
export function contentTemperature(topic) {
  return topic && typeof topic === 'object' && topic.fromClip === true ? 0.7 : 1.05;
}
