// Soạn BẢN CHỮ bài tuyển dụng Facebook theo bố cục người dùng chốt:
//   [mở đầu ngắn, giao lưu]  →  [chi tiết NGUYÊN VĂN từ JD]  →  [liên hệ]  →  [hashtag]
//
// Vì sao tách như vậy (yêu cầu người dùng): poster đã hiển thị đầy đủ chi tiết, nhưng bản
// chữ vẫn phải có phần chi tiết ĐẦY ĐỦ và ĐÚNG NGUYÊN VĂN những gì đã ghi ở phần Tạo JD —
// không để AI tóm tắt hay xào lại (tránh sai lệch, tránh bịa: điều cấm 5). AI CHỈ viết phần
// mở đầu; phần chi tiết ghép nguyên văn bằng buildJobDetailSection.
//
// Giọng văn (CLAUDE.md mục 4): không gạch dài, không mũi tên, không dấu chấm tròn giữa câu.

import { buildJobDetailSection } from './job-detail';

// Hệ prompt cho AI: chỉ viết PHẦN MỞ ĐẦU, trả JSON kèm hashtag + lương/giờ (để dựng poster).
export function fbIntroSystem(opts: { styleNote?: string; isRefresh?: boolean } = {}): string {
  return [
    'Bạn viết PHẦN MỞ ĐẦU (chỉ vài dòng) cho bài tuyển dụng Facebook của SDVICO — công ty thiết bị và giải pháp công nghệ cho ngành biển và thủy sản, trụ sở Vũng Tàu.',
    opts.styleNote || 'Giọng gần gũi, thân thiện với anh em thợ và ngư dân, đọc như người thật viết.',
    opts.isRefresh ? 'Đây là bài đăng lại cho vị trí đã đăng trước, diễn đạt khác đi để tránh trùng.' : '',
    '',
    'Yêu cầu phần mở đầu:',
    '- Dòng đầu: 🔥 SDVICO TUYỂN DỤNG: <tên vị trí> 📣',
    '- Sau đó 1 đến 3 câu chào hỏi, giao lưu gần gũi, nêu vắn tắt vị trí và nơi làm (nếu có).',
    '- TUYỆT ĐỐI KHÔNG liệt kê mô tả công việc, yêu cầu hay quyền lợi ở đây. Phần chi tiết sẽ được ghép nguyên văn ngay bên dưới, viết lại là thừa và dễ sai.',
    '- KHÔNG ghi thông tin liên hệ (email, hotline) ở đây. Liên hệ đặt ở cuối bài, hệ thống tự thêm.',
    '',
    'Quy tắc: CHỈ dùng thông tin được cung cấp, KHÔNG bịa lương hay số liệu (điều cấm 5). Không mô tả phần mềm đối tác như năng lực SDVICO (điều cấm 4). Không dùng gạch dài, không mũi tên.',
    '',
    'Chỉ trả về JSON đúng dạng sau, không kèm chữ nào khác:',
    '{"mo_dau":"<phần mở đầu>","hashtags":"<3 đến 4 hashtag tiếng Việt cách nhau bằng dấu cách, vd #TuyenDung #VungTau #SDVICO>","luong":"<mức lương ngắn nếu nguồn có nêu, vd 8-12 triệu; để trống nếu không nêu>","gio_lam":"<giờ làm nếu có; để trống nếu không nêu>"}',
  ].filter(Boolean).join('\n');
}

// Ghép bản chữ hoàn chỉnh: mở đầu → chi tiết nguyên văn → liên hệ → hashtag.
export function assembleFacebookPost(opts: {
  intro: string;
  short_desc?: string | null;
  requirements?: string | null;
  benefits?: string | null;
  contactEmail: string;
  hotline: string;
  hashtags?: string | null;
}): string {
  const intro = String(opts.intro || '').trim();
  // buildJobDetailSection trả '' nếu không có chi tiết, hoặc '\n\n📋 ...' nếu có.
  const details = buildJobDetailSection({
    short_desc: opts.short_desc,
    requirements: opts.requirements,
    benefits: opts.benefits,
  });
  const contact = `📞 Liên hệ: gửi CV về ${opts.contactEmail}, hotline/Zalo ${opts.hotline}`;
  const tags = String(opts.hashtags || '').trim();

  let out = intro;
  out += details;                 // đã kèm sẵn hai dòng trống ngăn cách ở đầu
  out += `\n\n${contact}`;
  if (tags) out += `\n\n${tags}`;
  return out.trim();
}

// Bản mở đầu dự phòng khi AI hỏng, để bản chữ luôn có mở đầu tử tế.
export function fallbackIntro(title: string, location?: string | null): string {
  const noiLam = location ? ` tại ${location}` : '';
  return [
    `🔥 SDVICO TUYỂN DỤNG: ${title} 📣`,
    '',
    `Chào anh em! SDVICO đang cần thêm ${title}${noiLam} về cùng đội, làm thiết bị phục vụ bà con ngư dân vươn khơi. Thông tin chi tiết ngay bên dưới.`,
  ].join('\n');
}
