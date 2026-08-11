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

const TONGDAI = '1900 23 23 49';

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

// Tiện ích: sinh cả brief và draft cho một từ khóa bằng BẢN MẪU (tất định, không cần khóa).
export function generateContent(kw) {
  const brief = buildBrief(kw);
  const { title, body } = buildDraft(brief);
  return { title, brief, draft: body };
}

// Model marketing mặc định, đổi bằng biến MKT_MODEL. Dùng chung nhà Gemini với phần chấm CV.
const MKT_MODEL = process.env.MKT_MODEL || process.env.HR_SCREEN_MODEL || 'gemini-2.0-flash';

// Sinh draft bằng Gemini. CHỈ gọi khi có GEMINI_API_KEY. Import động để khi không có khóa,
// gói @google/genai không cần cài và bản mẫu vẫn chạy. Trả về văn bản, hoặc ném lỗi để chỗ
// gọi tự lùi về bản mẫu.
export async function generateDraftLLM(brief, facts = []) {
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
    '',
    allowed.length ? 'Thông số được phép nêu:\n' + allowed.join('\n') : 'Chưa có thông số nào được duyệt, viết chung chung, không nêu số cụ thể.',
  ].join('\n');

  const user = [
    `Viết một bài cho từ khóa: "${brief.keyword}".`,
    `Ý định tìm kiếm: ${brief.intent}.`,
    `Các phần nên có: ${(brief.sections || []).join('; ')}.`,
    'Viết tiếng Việt, dài vừa phải, sẵn sàng cho người duyệt.',
  ].join('\n');

  const res = await ai.models.generateContent({
    model: MKT_MODEL,
    contents: user,
    config: { systemInstruction: system },
  });
  const text = (res.text || '').trim();
  if (!text) throw new Error('Gemini trả về rỗng.');
  return text;
}

// Sinh nội dung, ưu tiên Gemini khi có khóa, không thì lùi về bản mẫu. Luôn trả draft dùng được.
export async function generateContentAsync(kw, { facts = [] } = {}) {
  const brief = buildBrief(kw);
  if (process.env.GEMINI_API_KEY) {
    try {
      const draft = await generateDraftLLM(brief, facts);
      return { title: draftTitle(brief), brief: { ...brief, generator: 'gemini' }, draft };
    } catch (e) {
      console.warn('Gemini lỗi, lùi về bản mẫu:', e.message);
    }
  }
  const { title, body } = buildDraft(brief);
  return { title, brief, draft: body };
}
