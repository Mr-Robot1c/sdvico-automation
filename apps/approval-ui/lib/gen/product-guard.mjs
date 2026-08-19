// product-guard.mjs — SỰ THẬT NGHỀ theo sản phẩm: lợi ích ĐƯỢC nói và KHÔNG ĐƯỢC nói.
//
// Vì sao có file này: 19/8/2026 bài SEA-40 máy tự suy ra "bớt chở nước, nhẹ tàu, tiết kiệm dầu"
// -> cấp trên trong nhóm Zalo nội bộ phản hồi: SAI. Tàu cá CỐ Ý lấy nước để ĐẰM tàu khi lấy đá;
// tàu nhẹ quá (đĩnh) chạy không được. Gốc lỗi: prompt gợi ý chung "tiết kiệm nhiên liệu và nước
// ngọt" cho MỌI sản phẩm, không có dòng sự thật riêng cho từng sản phẩm -> Gemini ghép bừa.
//
// Cách dùng: guardLines(tên/chủ đề) -> chèn vào prompt sinh bài + kịch bản video;
// guardViolations(text, tên) -> quét sau khi sinh, dính thì sinh lại / gắn cờ "Sai nghề".
// Bản sao y hệt ở packages/marketing/src/product-guard.mjs (dây chuyền video chạy ngoài app).
// Khi Phòng KD / hiện trường phản hồi thêm, thêm dòng vào đây — đây là nơi DUY NHẤT giữ luật này.

export const PRODUCT_GUARD = [
  {
    key: 'sea40',
    match: /l[oọ]c\s*n[uư][oớ]c|sea[\s-]?40|n[uư][oớ]c\s*ng[oọ]t|m[aá]y\s*l[oọ]c/i,
    product: 'Máy lọc nước biển SEA-40',
    allowed: [
      'chủ động nước ngọt sinh hoạt (uống, nấu ăn, tắm rửa) cho cả chuyến biển dài ngày',
      'không lo cạn nước ngọt giữa biển, bớt phụ thuộc nước chở từ bờ',
      'nước sạch hơn cho sức khoẻ anh em thuyền viên',
      'lắp gọn trên tàu, dùng điện tàu, SDVICO lắp đặt tận bến và bảo hành',
    ],
    forbidden: [
      'bớt chở nước', 'đỡ chở nước', 'khỏi chở nước', 'không cần chở nước',
      'nhẹ tàu', 'giảm tải', 'tốn diện tích chở nước', 'đỡ tốn chỗ', 'tiết kiệm chỗ',
      'tiết kiệm dầu', 'tiết kiệm nhiên liệu', 'đỡ tốn dầu', 'giảm hao dầu',
    ],
    why: 'Tàu cá CỐ Ý lấy nước để đằm tàu khi lấy đá; tàu nhẹ quá (đĩnh) chạy không được. Máy lọc nước KHÔNG liên quan tới nhiên liệu hay tải trọng tàu. (Phản hồi cấp trên, nhóm Zalo nội bộ 19/8/2026.)',
  },
  {
    key: 'fuel',
    match: /l[oọ]c\s*d[aầ]u|sf[\s-]?50|x[uử]\s*l[yý]\s*d[aầ]u|nano\s*graphene|pv\s*engine|pvoil|d[aầ]u\s*nh[oớ]t|rmi/i,
    product: 'Thiết bị lọc dầu SF-50 / Dầu nhớt PVOIL Nano Graphene / PV Engine RMI',
    allowed: [
      'giữ dầu sạch, bảo vệ máy, máy nổ êm và bền hơn',
      'tiết kiệm dầu diesel cho tàu cá (chỉ nói khi tài liệu sản phẩm có ghi, không tự bịa con số phần trăm)',
      'giảm hỏng vặt, đỡ nằm bờ sửa máy',
    ],
    forbidden: [
      'nhẹ tàu', 'giảm tải',
    ],
    why: 'Đây là NHÓM DUY NHẤT được nói tới tiết kiệm dầu/nhiên liệu. Tuyệt đối không tự bịa con số phần trăm tiết kiệm nếu tài liệu không ghi.',
  },
  {
    key: 'comm',
    match: /s[\s-]?tracking|thuraya|marinestar|xt[\s-]?pro|v[eệ]\s*tinh|gi[aá]m\s*s[aá]t\s*h[aà]nh\s*tr[iì]nh|đ[iị]nh\s*v[iị]|vnpt\s*vss|vishipel/i,
    product: 'Thiết bị giám sát hành trình / điện thoại vệ tinh',
    allowed: [
      'giữ liên lạc với bờ khi ra khơi xa, gọi được khi có sự cố',
      'đáp ứng quy định giám sát hành trình tàu cá (chỉ nói chung, không nêu mốc/văn bản cụ thể)',
      'SDVICO phân phối, lắp đặt, bảo hành; phần mềm và dịch vụ là của hãng',
    ],
    forbidden: [
      'tiết kiệm dầu', 'tiết kiệm nhiên liệu', 'nhẹ tàu', 'giảm tải',
    ],
    why: 'Thiết bị liên lạc/giám sát không liên quan nhiên liệu hay tải trọng. Không mô tả phần mềm hãng như của SDVICO (điều cấm 4).',
  },
  {
    key: 'battery',
    match: /[aắ]c\s*quy|accu|b[iì]nh\s*[đd]i[eệ]n/i,
    product: 'Ắc quy Accu Nano SDViCo',
    allowed: ['khởi động máy chắc, cấp điện ổn cho thiết bị trên tàu', 'bền, ít phải thay giữa mùa'],
    forbidden: ['tiết kiệm dầu', 'tiết kiệm nhiên liệu', 'nhẹ tàu'],
    why: 'Ắc quy không liên quan nhiên liệu.',
  },
  {
    key: 'paint',
    match: /s[oơ]n\s*rare|s[oơ]n\s*ch[oố]ng\s*n[oó]ng|s[oơ]n/i,
    product: 'Sơn RARE',
    allowed: ['giảm nóng hầm tàu, khoang lái', 'bảo vệ bề mặt, lâu phải sơn lại'],
    forbidden: ['tiết kiệm dầu', 'tiết kiệm nhiên liệu', 'nhẹ tàu'],
    why: 'Sơn không liên quan nhiên liệu.',
  },
];

// Luật CHUNG cho mọi bài/kịch bản.
export const GENERAL_GUARD_LINES = [
  'SỰ THẬT NGHỀ (bắt buộc): KHÔNG tự suy ra lợi ích vật lý của sản phẩm (nhẹ tàu, bớt chở, đỡ tốn chỗ, chạy nhanh hơn) nếu tài liệu không ghi. Tàu cá CỐ Ý chở nước để đằm tàu khi lấy đá, nên "bớt chở nước/nhẹ tàu" KHÔNG phải lợi ích.',
  'Chỉ nói "tiết kiệm dầu/nhiên liệu" cho thiết bị lọc dầu, thiết bị xử lý dầu và dầu nhớt. Máy lọc nước, thiết bị định vị, điện thoại vệ tinh, ắc quy, sơn KHÔNG được gán lợi ích này.',
];

function entriesFor(topicText) {
  const t = String(topicText || '');
  return PRODUCT_GUARD.filter((g) => g.match.test(t));
}

// Dòng chèn vào prompt: luật chung + lợi ích được/không được cho sản phẩm đang viết.
export function guardLines(topicText) {
  const lines = [...GENERAL_GUARD_LINES];
  for (const g of entriesFor(topicText)) {
    lines.push(`Sản phẩm "${g.product}": CHỈ nêu lợi ích trong danh sách này: ${g.allowed.join('; ')}.`);
    if (g.forbidden.length) lines.push(`CẤM viết các ý/cụm: ${g.forbidden.join(', ')}. Lý do: ${g.why}`);
  }
  return lines;
}

// Quét text sau khi sinh. Trả về [{phrase, product, why}] (rỗng = sạch).
export function guardViolations(text, topicText) {
  const t = String(text || '').toLowerCase();
  const out = [];
  const entries = entriesFor(topicText);
  // Không khớp sản phẩm nào -> vẫn áp luật chung cho "nhẹ tàu/bớt chở nước" (sai với mọi tàu cá).
  const generic = ['bớt chở nước', 'nhẹ tàu', 'giảm tải'];
  const check = (phrases, product, why) => {
    for (const p of phrases) if (t.includes(p.toLowerCase())) out.push({ phrase: p, product, why });
  };
  if (!entries.length) check(generic, 'chung', GENERAL_GUARD_LINES[0]);
  for (const g of entries) check(g.forbidden, g.product, g.why);
  return out;
}

// Bỏ các CÂU chứa cụm cấm (dự phòng khi sinh lại vẫn dính). Giữ câu còn lại, không chèn gì thêm.
export function stripViolatingSentences(text, topicText) {
  const viol = guardViolations(text, topicText);
  if (!viol.length) return text;
  const bad = viol.map((v) => v.phrase.toLowerCase());
  return String(text)
    .split(/(?<=[.!?…])\s+|\n/)
    .filter((s) => !bad.some((b) => s.toLowerCase().includes(b)))
    .join(' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
