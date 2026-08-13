// Soạn bốn phiên bản mô tả công việc (JD) cho bốn kênh. Ưu tiên Groq, lùi về bản ghép khi
// không có khóa hoặc mô hình lỗi. Ràng buộc giọng văn và ranh giới sản phẩm ngay trong prompt
// (điều cấm 4 và 5). Luôn trả đủ bốn kênh để trang không kẹt.

import { groqChat } from './groq';

export type JobInput = {
  title: string;
  department?: string;
  location?: string;
  short_desc?: string;
  requirements?: string;
  benefits?: string;
  nhom?: string;
};

const EMAIL = process.env.HR_CONTACT_EMAIL || 'inoudead@gmail.com';
const HOTLINE = '1900 23 23 49';
const KEYS = ['website', 'job_board', 'facebook', 'zalo_sms'] as const;

function systemPrompt(): string {
  return [
    'Bạn viết mô tả công việc (JD) cho Công ty SDVICO, ngành thiết bị biển và thủy sản, trụ sở Vũng Tàu.',
    'Viết tiếng Việt tự nhiên, chuyên nghiệp nhưng gần gũi. Không dịch máy, không sáo rỗng.',
    '',
    'Quy tắc bắt buộc:',
    '- Chỉ dùng thông tin người dùng cung cấp. Không bịa mức lương, phúc lợi, con số (điều cấm 5).',
    '  Thiếu lương hoặc phúc lợi thì ghi chung là thỏa thuận, không tự đặt con số.',
    '- Không mô tả phần mềm đối tác như năng lực của SDVICO (điều cấm 4).',
    '- Số theo chuẩn Việt Nam, dấu chấm ngăn cách hàng nghìn.',
    '- Không dùng gạch dài, mũi tên, dấu chấm tròn giữa câu, ký hiệu thay chữ và.',
    `- Cuối mỗi bản nêu cách ứng tuyển: gửi CV về ${EMAIL} hoặc gọi ${HOTLINE}.`,
    '',
    'Trả về một đối tượng JSON đúng dạng sau, không kèm chữ nào khác:',
    '{',
    '  "website": "bản đầy đủ khoảng 400 tới 700 từ: giới thiệu ngắn công ty, mô tả, yêu cầu, quyền lợi, cách ứng tuyển",',
    '  "job_board": "bản chuẩn khoảng 250 tới 450 từ cho sàn tuyển dụng, gạch đầu dòng bằng câu ngắn",',
    '  "facebook": "bản Facebook 80-130 từ. KHÔNG bắt đầu bằng tên công ty hay chữ tuyển. Đoạn 1: hook 1-2 câu chạm đúng cảm xúc hoặc khơi gợi tò mò về công việc hay ngành biển. Dòng trống. Đoạn 2: vị trí, yêu cầu chính viết ngắn như đang nói chuyện. Dòng trống. Đoạn 3: CTA rõ ràng và 2-3 hashtag. Câu ngắn, xuống dòng nhiều, dùng 1-2 emoji nếu tự nhiên.",',
    '  "zalo_sms": "bản rất ngắn khoảng 20 tới 45 từ, một đoạn, chỉ vị trí, nơi làm, một điểm chính, cách ứng tuyển"',
    '}'
  ].join('\n');
}

function userPrompt(job: JobInput): string {
  return [
    `Vị trí: ${job.title}.`,
    job.department ? `Phòng ban: ${job.department}.` : '',
    job.location ? `Nơi làm việc: ${job.location}.` : '',
    job.short_desc ? `Mô tả công việc: ${job.short_desc}.` : '',
    job.requirements ? `Yêu cầu: ${job.requirements}.` : '',
    job.benefits ? `Quyền lợi: ${job.benefits}.` : 'Quyền lợi chưa cung cấp, ghi chung là thỏa thuận.',
    '',
    'Viết đủ bốn bản theo đúng độ dài yêu cầu.'
  ].filter(Boolean).join('\n');
}

// Bản ghép cơ bản, tất định, để trang chạy được khi chưa có khóa mô hình.
export function jdFallback(job: JobInput): Record<string, string> {
  const loc = job.location ? ` tại ${job.location}` : '';
  const apply = `Ứng tuyển: gửi CV về ${EMAIL} hoặc gọi ${HOTLINE}.`;
  const benefits = job.benefits ? `Quyền lợi: ${job.benefits}.` : 'Quyền lợi: thỏa thuận theo năng lực.';
  const desc = job.short_desc ? String(job.short_desc).trim() : '';
  const req = job.requirements ? String(job.requirements).trim() : '';

  const website = [
    `Công ty SDVICO tuyển ${job.title}${loc}.`,
    job.department ? `Phòng ban: ${job.department}.` : '',
    '',
    'SDVICO cung cấp thiết bị và giải pháp công nghệ cho ngành biển và thủy sản.',
    desc ? 'Mô tả công việc:\n' + desc : '',
    req ? 'Yêu cầu:\n' + req : '',
    benefits,
    apply
  ].filter(Boolean).join('\n');

  const jobBoard = [
    `Tuyển ${job.title}${loc}.`,
    desc ? 'Mô tả: ' + desc : '',
    req ? 'Yêu cầu: ' + req : '',
    benefits,
    apply
  ].filter(Boolean).join('\n');

  const facebook = [
    `SDVICO tuyển ${job.title}${loc}.`,
    desc ? desc.split(/[.\n]/)[0].trim() + '.' : '',
    apply
  ].filter(Boolean).join(' ');

  const zaloSms = `SDVICO tuyển ${job.title}${loc}. ${apply}`;

  return { website, job_board: jobBoard, facebook, zalo_sms: zaloSms };
}

// Soạn đủ bốn phiên bản. Trả { versions, generator }.
export async function composeJdVersions(job: JobInput): Promise<{ versions: Record<string, string>; generator: string }> {
  const fb = jdFallback(job);
  try {
    const raw = await groqChat(systemPrompt(), userPrompt(job), { json: true, maxTokens: 2600 });
    if (!raw) return { versions: fb, generator: 'fallback' };

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const versions: Record<string, string> = {};
    for (const k of KEYS) {
      const v = parsed[k];
      if (typeof v === 'string' && v.trim()) versions[k] = v.trim();
    }
    if (!versions.website && !versions.facebook) throw new Error('Thiếu bản JD.');
    // Bổ khuyết bản còn thiếu bằng bản ghép để luôn đủ bốn kênh.
    for (const k of KEYS) if (!versions[k]) versions[k] = fb[k];
    return { versions, generator: 'groq' };
  } catch {
    return { versions: fb, generator: 'fallback' };
  }
}
