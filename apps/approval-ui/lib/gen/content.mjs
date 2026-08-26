// content.mjs — cỗ máy nội dung: từ một từ khóa sinh đề cương rồi bản nháp.
//
// Đây là bước /mkt-brief và /mkt-draft trong kế hoạch. Bản nháp tuân thủ skill brand-voice
// (câu ngắn, trả lời ngay, số chuẩn Việt Nam, dẫn về tổng đài) và product-boundary
// (không nêu model, thông số chưa xác nhận, không nhận vơ phần mềm đối tác).
//
// Sinh nội dung bằng BẢN MẪU tất định để chạy được ngay khi chưa có khóa mô hình. Khi có
// GEMINI_API_KEY (hoặc ANTHROPIC_API_KEY), có thể thay generateDraftText bằng lời gọi mô
// hình như phần chấm CV của HR (packages/hr/src/screen/score.js dùng gemini-2.0-flash).
// Dù sinh bằng mô hình hay bản mẫu, bản nháp vẫn qua compliance và hàng đợi duyệt.

import { DEFAULT_HASHTAGS, productHashtags, guessGroup } from './products.mjs';
import { logTokenUsage } from './token-log.mjs';

const TONGDAI = '1900 23 23 49';

// Kiểu viết theo LOẠI CONTENT (tips/sales/review/ugc) — mỗi loại một cấu trúc và giọng riêng,
// để bài không bị giống nhau. Truyền từ Xưởng sản xuất (dropdown "Loại content").
function contentTypeInstruction(t) {
  switch (t) {
    case 'sales':
      return 'KIỂU BÀI: BÁN HÀNG. Nêu bật 1-2 lợi ích thiết thực giải quyết đúng nỗi lo của bà con, rồi mời gọi tổng đài rõ ràng. Tự tin nhưng không nói quá, không hứa suông.';
    case 'review':
      return 'KIỂU BÀI: ĐÁNH GIÁ/TRẢI NGHIỆM. Viết như người đã dùng thật: cảm nhận trước và sau, điểm được, thêm một lưu ý nhỏ cho khách quan. Chân thật, tránh giọng quảng cáo.';
    case 'ugc':
      return 'KIỂU BÀI: LỜI KHÁCH HÀNG (UGC). Viết ở NGÔI THỨ NHẤT như bà con tự kể (tôi, nhà tôi, tàu tôi), mộc mạc đời thường, kể một tình huống thật rồi cảm ơn nhẹ. Không như quảng cáo.';
    case 'tips':
      return 'KIỂU BÀI: MẸO/GIÁO DỤC. Mở bằng một vấn đề bà con hay gặp, đưa 2-3 mẹo ngắn dễ làm ngay theo gạch đầu dòng, giọng chia sẻ giúp đỡ. Không nặng bán hàng, cuối bài mới nhắc SDVICO nhẹ nhàng.';
    default:
      return 'KIỂU BÀI: CHIA SẺ CHUNG. Viết hữu ích, gần gũi bà con.';
  }
}

// Vài góc tiếp cận để mỗi lần sinh ra một kiểu mở bài khác nhau (chống trùng lặp).
const DRAFT_ANGLES = [
  'mở bằng một tình huống thực tế khi ra khơi',
  'mở bằng một câu hỏi cho bà con rồi trả lời gọn',
  'nhấn mạnh lợi ích thiết thực và tiết kiệm chi phí',
  'chia sẻ như một người trong nghề nói với nhau',
  'so sánh cảm nhận trước và sau khi dùng',
  'kể một chi tiết nhỏ đời thường rồi dẫn vào nội dung',
];

// Bộ hashtag ĐÚNG theo hình: đoán sản phẩm từ tên ảnh/video + tiêu đề (guessGroup) rồi lấy thẻ
// riêng của đúng sản phẩm đó, cộng thẻ thương hiệu chung. Ảnh sơn ra thẻ sơn, không dính thẻ
// thiết bị liên lạc. Không đoán được sản phẩm thì chỉ gắn thẻ chung.
function hashtagBlockFor(hintText) {
  const group = guessGroup(hintText || '');
  const tags = [...DEFAULT_HASHTAGS, ...(group ? productHashtags(group) : [])];
  return [...new Set(tags)].join(' ');
}

// Nhãn ý định để đọc cho người.
export const INTENT_LABEL = {
  thong_tin: 'thông tin',
  thuong_mai: 'so sánh',
  giao_dich: 'giao dịch',
  dieu_huong: 'điều hướng',
};

// /mkt-brief: từ một dòng từ khóa sinh đề cương. kw là bản ghi mkt_keywords.
export function buildBrief(kw) {
  const { keyword, intent, landing_url } = kw;
  const sections = briefSections(intent, keyword);
  return {
    keyword,
    intent,
    landing_url: landing_url || null,
    goal: briefGoal(intent),
    sections,
    cta: `Gọi ${TONGDAI} để được hỗ trợ tận bến.`,
    generator: 'template', // đổi thành 'gemini' hoặc 'anthropic' khi nối mô hình
  };
}

function briefGoal(intent) {
  if (intent === 'thong_tin') return 'Giải thích rõ, giúp chủ tàu hiểu và làm đúng.';
  if (intent === 'thuong_mai') return 'Giúp chủ tàu chọn đúng thiết bị hợp nhu cầu.';
  if (intent === 'dieu_huong') return 'Dẫn người tìm tới đúng dịch vụ và liên hệ.';
  return 'Đưa người đang cần lắp hoặc xử lý sự cố tới bước liên hệ.';
}

function briefSections(intent, keyword) {
  if (intent === 'thong_tin') {
    return ['Trả lời ngắn ngay đầu', 'Bối cảnh quy định liên quan', 'Điều chủ tàu cần làm', 'Hỏi đáp ngắn'];
  }
  if (intent === 'thuong_mai') {
    return ['Trả lời ngắn ngay đầu', 'Các tiêu chí nên cân nhắc', 'Lưu ý khi chọn', 'Hỏi đáp ngắn'];
  }
  return ['Trả lời ngắn ngay đầu', 'Các bước hoặc quy trình', 'Lưu ý', 'Cách liên hệ'];
}

// /mkt-draft: từ đề cương viết bản nháp hoàn chỉnh. Trả { title, body }.
export function buildDraft(brief) {
  const title = draftTitle(brief);
  const body = draftBody(brief);
  return { title, body };
}

function draftTitle(brief) {
  const k = brief.keyword.trim();
  return k.charAt(0).toUpperCase() + k.slice(1);
}

function draftBody(brief) {
  const { intent, keyword } = brief;
  const parts = [];

  if (intent === 'thong_tin') {
    // Nhóm thông tin thường chạm quy định. Viết trung thực để compliance gắn cờ đỏ, buộc cấp
    // quản lý duyệt (Điều cấm 3). Không nêu con số phạt cụ thể chưa được kiểm chứng.
    parts.push(
      'Đây là nội dung liên quan quy định nhà nước, cần cấp quản lý duyệt trước khi đăng.',
      '',
      'Tàu cá từ 15 mét trở lên thuộc diện phải lắp thiết bị giám sát hành trình theo quy định. ' +
        'Đây là điều kiện để đăng kiểm, đăng ký và cấp giấy phép khai thác.',
      '',
      'Chủ tàu cần giữ thiết bị hoạt động và kết nối liên tục. Mất kết nối có thể ảnh hưởng tới ' +
        'chuyến biển và việc tuân thủ, mức xử phạt cụ thể theo nghị định hiện hành.',
      '',
      'Cần tư vấn thiết bị hợp quy định và lắp đặt tận bến, gọi ' + TONGDAI + '.'
    );
  } else if (intent === 'thuong_mai') {
    parts.push(
      'Chọn thiết bị giám sát hành trình nên nhìn vào độ ổn định kết nối, độ bền, và chất lượng ' +
        'hỗ trợ khi có sự cố, hơn là chỉ nhìn giá.',
      '',
      'Vài tiêu chí nên cân nhắc:',
      '- Kết nối ổn định, ít mất tín hiệu.',
      '- Bảo hành rõ ràng, có hỗ trợ tận bến.',
      '- Thiết bị hợp quy định để đăng kiểm thuận lợi.',
      '',
      'SDVICO tư vấn chọn đúng thiết bị hợp nhu cầu và hợp quy định, tránh mua nhầm. ' +
        'Gọi ' + TONGDAI + ' để được tư vấn trực tiếp.'
    );
  } else {
    // giao_dich và dieu_huong: rẽ theo chủ đề của từ khóa để mỗi bài một khác.
    parts.push(...serviceBody(keyword));
  }

  return parts.join('\n');
}

// Lấy tỉnh trong từ khóa nếu có (dạng "... ở Bình Định"), để chèn vào bài cho khác nhau.
function provinceIn(keyword) {
  const m = keyword.match(/(?:ở|tại)\s+(.+)$/i);
  return m ? m[1].trim() : '';
}

// Thân bài nhóm dịch vụ, rẽ theo chủ đề. Mỗi nhánh một nội dung riêng.
function serviceBody(keyword) {
  const k = keyword.toLowerCase();
  const tinh = provinceIn(keyword);
  const noiDia = tinh ? ` ở ${tinh}` : '';
  const chot = 'Gọi ' + TONGDAI + ' để được hỗ trợ tận bến.';

  if (/mất kết nối|mất tín hiệu|không lên tín hiệu|báo lỗi/.test(k)) {
    return [
      'Tàu mất kết nối giám sát thì bình tĩnh kiểm tra theo thứ tự dưới đây trước khi gọi hỗ trợ.',
      '',
      '1. Kiểm tra nguồn điện và cầu chì của thiết bị.',
      '2. Kiểm tra ăng-ten, xem có bị che, gãy hay lỏng dây không.',
      '3. Khởi động lại thiết bị theo hướng dẫn.',
      '4. Vẫn không lên tín hiệu thì ghi lại thời điểm và liên hệ ngay.',
      '',
      'Để bờ không thấy tàu lâu dễ ảnh hưởng chuyến biển. ' + chot,
    ];
  }
  if (/gia hạn|cước/.test(k)) {
    return [
      'Gia hạn cước giám sát hành trình đúng hạn giúp tàu không bị đứt kết nối giữa chuyến biển.',
      '',
      'Nên kiểm tra hạn cước trước mỗi chuyến đi xa. Sát hạn mới lo dễ bị gián đoạn đúng lúc cần.',
      '',
      'SDVICO hỗ trợ gia hạn nhanh và nhắc lịch giúp bà con' + noiDia + '. ' + chot,
    ];
  }
  if (/bảo trì|bảo dưỡng/.test(k)) {
    return [
      'Bảo trì thiết bị giám sát định kỳ giúp giữ kết nối ổn định, tránh hỏng hóc bất ngờ ngoài khơi.',
      '',
      'Nên kiểm tra nguồn, ăng-ten và dây kết nối trước mỗi chuyến biển dài.',
      '',
      'SDVICO nhận bảo trì tận bến' + noiDia + ', kiểm tra và xử lý sớm trước khi thành sự cố lớn. ' + chot,
    ];
  }
  if (/thay|sửa/.test(k)) {
    return [
      'Thiết bị giám sát cũ hay trục trặc nên được kiểm tra để sửa hoặc thay kịp thời, tránh hỏng giữa biển.',
      '',
      'Dấu hiệu nên thay: hay mất tín hiệu, khởi động chậm, đèn báo bất thường.',
      '',
      'SDVICO kiểm tra, sửa và thay thiết bị đạt chuẩn' + noiDia + ', hỗ trợ tận bến. ' + chot,
    ];
  }
  if (/lắp|lắp đặt/.test(k)) {
    return [
      'Lắp thiết bị giám sát hành trình' + noiDia + ' nên chọn nơi tư vấn đúng thiết bị hợp quy định và lắp tận bến.',
      '',
      'Quy trình gọn: khảo sát, chọn thiết bị hợp quy định, lắp đặt, hướng dẫn sử dụng.',
      '',
      'SDVICO phân phối và lắp đặt thiết bị đạt chuẩn, giúp chủ tàu khỏi mua nhầm. ' + chot,
    ];
  }
  if (/đại lý|ở đâu|tổng đài/.test(k)) {
    return [
      'Cần tìm nơi lắp và hỗ trợ thiết bị giám sát tàu cá' + noiDia + ' thì liên hệ SDVICO.',
      '',
      'SDVICO có mặt tại địa phương, lắp đặt và bảo trì tận bến, tư vấn đúng thiết bị hợp quy định.',
      '',
      chot,
    ];
  }
  // Mặc định cho các từ khóa dịch vụ còn lại.
  return [
    'Cần ' + keyword + ', bà con liên hệ SDVICO để được hỗ trợ nhanh, có mặt tận bến' + noiDia + '.',
    '',
    'SDVICO phân phối, lắp đặt và bảo trì thiết bị giám sát hành trình đạt chuẩn.',
    '',
    chot,
  ];
}

// Nhận diện chủ đề từ khóa, dùng chung cho cả ba định dạng.
function topicOf(keyword) {
  const k = keyword.toLowerCase();
  if (/mất kết nối|mất tín hiệu|không lên tín hiệu|báo lỗi/.test(k)) return 'suco';
  if (/gia hạn|cước/.test(k)) return 'giahan';
  if (/bảo trì|bảo dưỡng/.test(k)) return 'baotri';
  if (/thay|sửa/.test(k)) return 'thaythe';
  if (/lắp/.test(k)) return 'lapdat';
  if (/đại lý|ở đâu|tổng đài/.test(k)) return 'lienhe';
  return 'chung';
}

// Định dạng 2: bài Facebook ngắn. Hook một câu, một ý, rồi gọi tổng đài.
export function buildSocial(brief) {
  const t = topicOf(brief.keyword);
  const line = {
    suco: 'Tàu mất kết nối giám sát? Kiểm tra nguồn điện và ăng-ten, khởi động lại thiết bị. Chưa được thì gọi ngay.',
    giahan: 'Sắp hết hạn cước giám sát? Gia hạn sớm để tàu không bị đứt kết nối giữa chuyến biển.',
    baotri: 'Bảo trì thiết bị giám sát trước mỗi chuyến biển dài, tránh hỏng hóc bất ngờ ngoài khơi.',
    thaythe: 'Thiết bị giám sát hay trục trặc? Kiểm tra để sửa hoặc thay kịp thời, khỏi hỏng giữa biển.',
    lapdat: 'Lắp thiết bị giám sát hành trình đạt chuẩn, tư vấn đúng loại hợp quy định, lắp tận bến.',
    lienhe: 'Cần lắp và hỗ trợ thiết bị giám sát tàu cá? SDVICO có mặt tại địa phương, hỗ trợ tận bến.',
    chung: 'SDVICO phân phối, lắp đặt và bảo trì thiết bị giám sát hành trình đạt chuẩn, hỗ trợ tận bến.',
    thong_tin: 'Quy định lắp giám sát hành trình tàu cá, chủ tàu cần nắm để đi biển hợp lệ. Nội dung này chờ cấp quản lý duyệt.',
    thuong_mai: 'Chọn thiết bị giám sát tàu cá nên nhìn độ ổn định kết nối và hỗ trợ khi sự cố, không chỉ nhìn giá.',
  };
  const key = brief.intent === 'thong_tin' ? 'thong_tin' : brief.intent === 'thuong_mai' ? 'thuong_mai' : t;
  const draft = [line[key], '', 'Gọi ' + TONGDAI + '.'].join('\n');
  return { title: draftTitle(brief), draft };
}

// Định dạng 3: kịch bản video dọc 60 giây theo khung bốn nhịp (day2.md Phần L).
export function buildVideoScript(brief) {
  const t = brief.intent === 'thong_tin' ? 'thong_tin' : brief.intent === 'thuong_mai' ? 'thuong_mai' : topicOf(brief.keyword);
  const moi = {
    suco: 'Tàu mất kết nối giám sát giữa biển, làm gì trước?',
    giahan: 'Cước giám sát sắp hết hạn, không gia hạn kịp thì sao?',
    baotri: 'Thiết bị giám sát lâu không kiểm tra, rủi ro gì khi ra khơi?',
    thaythe: 'Thiết bị giám sát hay lỗi, khi nào nên thay?',
    lapdat: 'Lắp thiết bị giám sát tàu cá, chọn sao cho đúng quy định?',
    lienhe: 'Cần lắp và hỗ trợ thiết bị giám sát tàu cá, gọi ai?',
    chung: 'Thiết bị giám sát hành trình tàu cá, cần lưu ý gì?',
    thong_tin: 'Tàu bao nhiêu mét phải lắp giám sát hành trình?',
    thuong_mai: 'Chọn thiết bị giám sát tàu cá loại nào hợp?',
  };
  const than = brief.intent === 'thong_tin'
    ? 'Nói ngắn về quy định, trung thực, chờ cấp quản lý duyệt trước khi đăng.'
    : 'Nêu vài bước hoặc lợi ích chính, mỗi ý một câu, cầm tay chỉ việc.';
  const draft = [
    '[0-3s] Mồi: ' + (moi[t] || moi.chung),
    '[3-10s] Nêu hậu quả thật nếu không xử lý.',
    '[10-45s] ' + than,
    '[45-60s] Chốt: Gọi ' + TONGDAI + ' để được hỗ trợ tận bến. Hiện số to trên màn hình.',
    '',
    'Ghi chú: phụ đề cháy chữ, chỉ dùng tư liệu trong brand_assets, không nêu model hay thông số chưa xác nhận.',
  ].join('\n');
  return { title: draftTitle(brief), draft };
}

// Sinh cả ba định dạng bằng BẢN MẪU (không cần khóa).
export function generateFormatsTemplate(kw) {
  const brief = buildBrief(kw);
  const { title, body } = buildDraft(brief);
  return {
    brief,
    article: { title, draft: body },
    social: buildSocial(brief),
    video: buildVideoScript(brief),
  };
}

// Tiện ích cũ: sinh một bài article bằng bản mẫu.
export function generateContent(kw) {
  const brief = buildBrief(kw);
  const { title, body } = buildDraft(brief);
  return { title, brief, draft: body };
}

// Hệ chỉ dẫn dùng chung cho Gemini: giọng brand-voice và ranh giới product-boundary.
function boundarySystem(facts) {
  const allowed = facts
    .filter((f) => f.value)
    .map((f) => `${f.brand || ''} ${f.model || ''} ${f.attribute}: ${f.value}${f.verified ? '' : ' (CHƯA XÁC NHẬN, dữ liệu test)'}`.trim());
  return [
    'Bạn viết nội dung marketing cho Công ty SDVICO, nhà phân phối thiết bị hàng hải và giám sát tàu cá.',
    'Giọng gần gũi bà con ngư dân, câu ngắn, trả lời ngay ở câu đầu, đọc trên điện thoại.',
    'Số theo chuẩn Việt Nam, dấu chấm ngăn cách hàng nghìn. Không gạch dài, mũi tên, dấu chấm tròn giữa câu.',
    'CẤM bịa model và thông số. Chỉ được nêu thông số có trong danh sách đã duyệt dưới đây. Không có thì nói chung chung.',
    'CẤM mô tả phần mềm đối tác (Viettel S-Tracking, VNPT VSS, Vishipel, Thuraya) như của SDVICO, chỉ nói tương thích.',
    'Không hứa pháp lý tuyệt đối. Nội dung chạm quy định nhà nước thì nói trung thực, sẽ có người duyệt.',
    'Kết mỗi phần bằng lời mời gọi tổng đài 1900 23 23 49.',
    '',
    allowed.length ? 'Thông số được phép nêu:\n' + allowed.join('\n') : 'Chưa có thông số nào được duyệt, viết chung chung, không nêu số cụ thể.',
  ].join('\n');
}

// Sinh CẢ BA định dạng trong một lần gọi Gemini, trả JSON { article, social, video }.
export async function generateFormatsLLM(brief, facts = []) {
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  const system = boundarySystem(facts) + '\n\n' + [
    'Tạo ba phiên bản nội dung cho cùng một từ khóa:',
    '- article: bài website dài, trả lời ngay đầu bài, có vài đoạn phân tích, dẫn về tổng đài.',
    '- social: bài Facebook ngắn, hai tới bốn câu, một hook và một lời kêu gọi liên hệ.',
    '- video: kịch bản video dọc 60 giây, bốn nhịp có mốc thời gian [0-3s], [3-10s], [10-45s], [45-60s].',
  ].join('\n');

  const user = [
    `Từ khóa: "${brief.keyword}". Ý định: ${brief.intent}.`,
    `Các phần gợi ý cho bài dài: ${(brief.sections || []).join('; ')}.`,
  ].join('\n');

  const res = await genOnce(ai, {
    model: MKT_MODEL,
    contents: user,
    config: {
      systemInstruction: system,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: { article: { type: 'STRING' }, social: { type: 'STRING' }, video: { type: 'STRING' } },
        required: ['article', 'social', 'video'],
      },
    },
  });
  const parsed = JSON.parse((res.text || '{}').trim());
  if (!parsed.article || !parsed.social || !parsed.video) throw new Error('Gemini thiếu định dạng.');
  return parsed;
}

// Điều phối: sinh ba định dạng, ưu tiên Gemini khi có khóa, không thì bản mẫu.
export async function generateAllFormats(kw, { facts = [] } = {}) {
  const brief = buildBrief(kw);
  if (process.env.GEMINI_API_KEY) {
    try {
      const f = await generateFormatsLLM(brief, facts);
      const title = draftTitle(brief);
      return {
        brief: { ...brief, generator: 'gemini' },
        article: { title, draft: f.article },
        social: { title, draft: f.social },
        video: { title, draft: f.video },
      };
    } catch (e) {
      console.warn('Gemini lỗi, lùi về bản mẫu:', e.message);
    }
  }
  return generateFormatsTemplate(kw);
}

// Model marketing mặc định, đổi bằng biến MKT_MODEL. Dùng chung nhà Gemini với phần chấm CV.
// Mặc định dùng flash-lite: quota free cao hơn nhiều so với gemini-flash-latest (chỉ 20 lượt/ngày).
const MKT_MODEL = process.env.MKT_MODEL || 'gemini-flash-lite-latest';

// Gọi Gemini có TIMEOUT cứng (hủy phía client bằng AbortSignal). SDK @google/genai mặc định TỰ
// RETRY khi request quá hạn nên lần gọi chậm (vd dính quota) dễ treo rất lâu; ở đây quá hạn là
// hủy và ném lỗi để chỗ gọi lùi về bản mẫu ngay. Chỉnh thời gian bằng MKT_GEN_TIMEOUT_MS.
const GEN_TIMEOUT_MS = Number(process.env.MKT_GEN_TIMEOUT_MS) || 20000;
async function genOnce(ai, params) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), GEN_TIMEOUT_MS);
  try {
    return await ai.models.generateContent({ ...params, config: { ...(params.config || {}), abortSignal: ac.signal } });
  } finally {
    clearTimeout(timer);
  }
}

// Sinh draft bằng Gemini. CHỈ gọi khi có GEMINI_API_KEY. Import động để khi không có khóa,
// gói @google/genai không cần cài và bản mẫu vẫn chạy. Trả về văn bản, hoặc ném lỗi để chỗ
// gọi tự lùi về bản mẫu.
// Hướng dẫn định dạng theo kênh đăng, để mỗi kênh ra một kiểu nội dung khác nhau.
function formatInstruction(format) {
  if (format === 'video') {
    return [
      'ĐỊNH DẠNG: KỊCH BẢN VIDEO DỌC 60 GIÂY cho YouTube/TikTok. Chia đúng 4 nhịp có mốc thời gian:',
      '[0-3s] Mồi bằng một câu hỏi hoặc tình huống bắt trúng nỗi lo của bà con.',
      '[3-10s] Nêu hậu quả thật nếu không xử lý.',
      '[10-45s] Nội dung chính, mỗi ý một câu ngắn, cầm tay chỉ việc.',
      '[45-60s] Chốt: gọi tổng đài 1900 23 23 49, hiện số to trên màn hình.',
      'Mỗi dòng có thể kèm gợi ý cảnh quay ngắn trong ngoặc. KHÔNG viết thành đoạn văn dài.',
    ].join('\n');
  }
  if (format === 'article') {
    return 'ĐỊNH DẠNG: BÀI WEBSITE DÀI. Trả lời ngay ở câu đầu, sau đó vài đoạn phân tích rõ ràng, có thể dùng gạch đầu dòng ngắn cho các bước, kết bằng lời mời gọi tổng đài.';
  }
  return 'ĐỊNH DẠNG: BÀI FACEBOOK NGẮN. Chỉ hai tới bốn câu: một câu hook mở đầu bắt trúng vấn đề, một hai câu lợi ích, một lời kêu gọi gọi tổng đài. Không tiêu đề riêng, không dài dòng.';
}

export async function generateDraftLLM(brief, facts = [], assetHint = '', format = 'social', contentType = 'tips', client = null) {
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  const allowed = facts
    .filter((f) => f.value)
    .map((f) => `${f.brand || ''} ${f.model || ''} ${f.attribute}: ${f.value}${f.verified ? '' : ' (CHƯA XÁC NHẬN, dữ liệu test)'}`.trim());

  const system = [
    'Bạn viết nội dung marketing cho Công ty SDVICO, nhà phân phối thiết bị hàng hải và giám sát tàu cá.',
    'Giọng gần gũi bà con ngư dân, câu ngắn, trả lời ngay ở câu đầu, đọc trên điện thoại.',
    'Số theo chuẩn Việt Nam, dấu chấm ngăn cách hàng nghìn. Không gạch dài, mũi tên, dấu chấm tròn giữa câu.',
    'CẤM bịa model và thông số. Chỉ được nêu thông số có trong danh sách đã duyệt dưới đây. Không có thì nói chung chung.',
    'CẤM mô tả phần mềm đối tác (Viettel S-Tracking, VNPT VSS, Vishipel, Thuraya) như của SDVICO, chỉ nói tương thích.',
    'Không hứa pháp lý tuyệt đối. Nội dung chạm quy định nhà nước thì nói trung thực, sẽ có người duyệt.',
    'Kết bài bằng lời mời gọi tổng đài 1900 23 23 49.',
    'Chèn vài emoji hợp cảnh biển và nghề cá (⚓ 🚢 🌊 🐟 🎣 ☀️ 🔧) cho sinh động, vừa phải, không lạm dụng.',
    'KHÔNG tự viết hashtag, hệ thống sẽ tự thêm thẻ đúng theo hình.',
    '',
    allowed.length ? 'Thông số được phép nêu:\n' + allowed.join('\n') : 'Chưa có thông số nào được duyệt, viết chung chung, không nêu số cụ thể.',
  ].join('\n');

  const angle = DRAFT_ANGLES[Math.floor(Math.random() * DRAFT_ANGLES.length)];
  const user = [
    `Viết nội dung cho chủ đề/tiêu đề: "${brief.keyword}".`,
    `Ý định tìm kiếm: ${brief.intent}.`,
    contentTypeInstruction(contentType),
    formatInstruction(format),
    `Góc tiếp cận lần này: ${angle}. Viết khác các bài trước, đừng lặp mô típ cũ.`,
    assetHint
      ? `Bài đăng kèm tư liệu (ảnh và/hoặc video) tên tệp: "${assetHint}". ĐÂY LÀ TƯ LIỆU CỦA CÙNG MỘT BÀI, thường mô tả CÙNG MỘT sản phẩm hoặc chủ đề dù tên tệp khác nhau. Hãy hiểu chung rồi viết MỘT bài hoàn chỉnh, mạch lạc về sản phẩm/chủ đề đó. ĐỪNG liệt kê các tên tệp như thể chúng là những sản phẩm riêng biệt. Bám đúng thứ có trong tư liệu, không bịa chi tiết ngoài tên tệp và tiêu đề.`
      : '',
    'Viết tiếng Việt, sẵn sàng cho người duyệt.',
  ].filter(Boolean).join('\n');

  const res = await genOnce(ai, {
    model: MKT_MODEL,
    contents: user,
    config: { systemInstruction: system, temperature: 1.0 },
  });
  logTokenUsage(client, 'creator_content_old', MKT_MODEL, res?.usageMetadata);
  const text = (res.text || '').trim();
  if (!text) throw new Error('Gemini trả về rỗng.');
  return text;
}

// Sinh nội dung, ưu tiên Gemini khi có khóa, không thì lùi về bản mẫu. Luôn trả draft dùng được.
export async function generateContentAsync(kw, { facts = [], assetHint = '', format = 'social', contentType = 'tips', client = null } = {}) {
  const brief = buildBrief(kw);
  // Gắn hashtag ĐÚNG theo hình + tiêu đề cho MỌI định dạng (bài ngắn, bài dài, kịch bản video).
  const withTags = (draft) => {
    const body = String(draft || '').trim();
    const tags = hashtagBlockFor(`${assetHint} ${brief.keyword || ''}`);
    return tags ? `${body}\n\n${tags}` : body;
  };
  if (process.env.GEMINI_API_KEY) {
    try {
      const draft = await generateDraftLLM(brief, facts, assetHint, format, contentType, client);
      return { title: draftTitle(brief), brief: { ...brief, generator: 'gemini' }, draft: withTags(draft) };
    } catch (e) {
      console.warn('Gemini lỗi, lùi về bản mẫu:', e.message);
    }
  }
  // Bản mẫu theo đúng định dạng kênh khi không có Gemini (đều gắn hashtag như bản LLM).
  if (format === 'video') {
    const v = buildVideoScript(brief);
    return { title: v.title, brief, draft: withTags(v.draft) };
  }
  if (format === 'social') {
    const s = buildSocial(brief);
    return { title: s.title, brief, draft: withTags(s.draft) };
  }
  const { title, body } = buildDraft(brief);
  return { title, brief, draft: withTags(body) };
}
