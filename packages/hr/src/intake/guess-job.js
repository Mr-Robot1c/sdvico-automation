// Đoán vị trí ứng tuyển từ subject email + văn bản CV, khớp với hr_jobs đang mở.
// CV gửi vào hộp thư chung thường KHÔNG có metadata gắn job cụ thể — đây là best-effort
// để đỡ công người vận hành gán tay. Match sai không nguy hiểm vì:
//   1. Người vận hành thấy được trong /ho-so và có nút "Đổi vị trí"
//   2. Fallback text trong thư mời vẫn hợp lý ("vị trí đã ứng tuyển")
//
// Chiến lược:
//   - Chuẩn hoá cả 2 vế (bỏ dấu, viết thường, gộp khoảng trắng)
//   - Substring match: nếu chuẩn hoá title xuất hiện trong subject/CV → khớp
//   - Ưu tiên match trong subject (rõ ý ứng viên hơn CV)
//   - Nếu nhiều title khớp, chọn cái DÀI NHẤT (specificity: "Kỹ sư backend" > "Kỹ sư")

function normalize(s) {
  return (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// Ngưỡng độ dài tối thiểu của title để tránh false-positive từ từ khoá quá ngắn
// ("nv", "it" ...). Title <5 ký tự thì cần khớp đầy đủ boundary hơn.
const MIN_TITLE_LEN = 5;

// jobs: [{ id, title }]. Trả về id job khớp tốt nhất hoặc null.
export function guessJobId(jobs, { subject = '', cvText = '' } = {}) {
  if (!Array.isArray(jobs) || jobs.length === 0) return null;

  const subjectN = normalize(subject);
  const cvN = normalize(cvText).slice(0, 5000); // chỉ scan 5k ký tự đầu CV
  if (!subjectN && !cvN) return null;

  const candidates = [];
  for (const job of jobs) {
    const titleN = normalize(job.title);
    if (!titleN || titleN.length < MIN_TITLE_LEN) continue;
    const inSubject = subjectN.includes(titleN);
    const inCv = cvN.includes(titleN);
    if (!inSubject && !inCv) continue;
    // Điểm: match subject = 100, match cv = 10. Cộng titleN.length để ưu tiên tên dài.
    const score = (inSubject ? 100 : 0) + (inCv ? 10 : 0) + titleN.length;
    candidates.push({ id: job.id, title: job.title, score });
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0].id;
}

// Helper: lấy danh sách job đang mở/nháp từ DB rồi đoán.
export async function guessJobIdForNewApplication(client, { subject, cvText }) {
  const { data, error } = await client
    .from('hr_jobs')
    .select('id, title')
    .in('status', ['open', 'draft']);
  if (error) return null;
  return guessJobId(data || [], { subject, cvText });
}
