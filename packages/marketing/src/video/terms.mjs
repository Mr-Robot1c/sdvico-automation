// Từ điển thuật ngữ ngành biển và thủy sản + sản phẩm SDVICO.
// Dùng cho: (1) initial_prompt của Whisper để nhận đúng thuật ngữ khi canh phụ đề,
// (2) hậu xử lý sửa lỗi chính tả thuật ngữ trong phụ đề.
// Nguồn thuật ngữ: CLAUDE.md danh mục sản phẩm. Không thêm model/thông số bịa (điều cấm 5).

// Cụm từ mồi cho Whisper (giúp mô hình ưu tiên chính tả đúng).
export const WHISPER_PROMPT =
  'SDVICO, ngư dân, tàu cá, ra khơi, ngành biển và thủy sản, ' +
  'giám sát hành trình, S-Tracking, Thuraya, MarineStar, điện thoại vệ tinh XT-Pro, ' +
  'máy lọc nước biển thành nước ngọt, thiết bị lọc dầu, dầu diesel, ' +
  'PVOil Nano Graphene, PV Engine RMI, hải lý, IUU, hotline 1900 23 23 49.';

// Sửa lỗi chính tả thuật ngữ hay gặp khi máy nghe (trái sang phải: sai -> đúng).
// Chỉ sửa an toàn, không đổi nghĩa. Khớp không phân biệt hoa thường, biên từ.
const FIXES = [
  [/\bes[-\s]?tracking\b/gi, 'S-Tracking'],
  [/\bstracking\b/gi, 'S-Tracking'],
  [/\bthu\s?ra\s?ya\b/gi, 'Thuraya'],
  [/\bmarine\s?star\b/gi, 'MarineStar'],
  [/\bxt\s?pro\b/gi, 'XT-Pro'],
  [/\bpv\s?oil\b/gi, 'PVOil'],
  [/\bnano\s?graphene\b/gi, 'Nano Graphene'],
  [/\bi\s?u\s?u\b/gi, 'IUU'],
  [/\bsờ\s?vi\s?cô\b/gi, 'SDVICO'],
  [/\bes\s?di\s?vi\s?cô\b/gi, 'SDVICO'],
];

export function fixTerms(text) {
  let out = text;
  for (const [re, to] of FIXES) out = out.replace(re, to);
  return out;
}
