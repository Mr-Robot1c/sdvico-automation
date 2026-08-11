// Thang điểm chấm CV. CỐ ĐỊNH, không để mô hình tự nghĩ tiêu chí (cổng an toàn mảng, mục 2).
// Nguồn sự thật cho con người ở .claude/skills/cv-screening/SKILL.md. Hai nơi phải khớp nhau.
//
// Mỗi trục có: key (mã), label (nhãn tiếng Việt), weight (trọng số), mo_ta (định nghĩa để chấm).
// Điểm mỗi trục từ 0 tới 10. Điểm tổng là trung bình có trọng số, quy về thang 100.
//
// [CẦN XÁC NHẬN với Phòng Nhân sự: trục điểm, trọng số, và ngưỡng theo từng vị trí thực tế.
//  Bản này là thang mặc định chung, đủ để chạy, chờ Nhân sự chốt thang riêng cho mỗi vị trí.]

// Thang mặc định, dùng khi hồ sơ chưa gắn vị trí hoặc vị trí chưa có thang riêng.
export const DEFAULT_RUBRIC = {
  key: 'default',
  label: 'Thang chung SDVICO',
  version: '2026-08-11',
  axes: [
    {
      key: 'chuyen_mon',
      label: 'Chuyên môn phù hợp vị trí',
      weight: 3,
      mo_ta: 'Kỹ năng và kiến thức lõi khớp với yêu cầu công việc. Chấm theo bằng chứng cụ thể trong CV, không đoán.'
    },
    {
      key: 'kinh_nghiem',
      label: 'Kinh nghiệm liên quan',
      weight: 3,
      mo_ta: 'Số năm và mức độ liên quan của công việc đã làm. Ưu tiên kinh nghiệm sát ngành biển, thủy sản, thiết bị hàng hải, hoặc vai trò tương đương.'
    },
    {
      key: 'thanh_tuu',
      label: 'Kết quả và thành tựu đo được',
      weight: 2,
      mo_ta: 'Có kết quả cụ thể, đo được (doanh số, dự án hoàn thành, cải tiến). Không tính lời tự nhận chung chung không có số liệu.'
    },
    {
      key: 'ky_nang_mem',
      label: 'Kỹ năng mềm và giao tiếp',
      weight: 1,
      mo_ta: 'Bằng chứng về làm việc nhóm, giao tiếp, xử lý tình huống. Chấm từ mô tả công việc và hoạt động, không từ ảnh hay lời khen sáo.'
    },
    {
      key: 'on_dinh',
      label: 'Mức độ ổn định và cam kết',
      weight: 1,
      mo_ta: 'Thời gian gắn bó mỗi nơi, tính liền mạch của quá trình. Nhảy việc dày đặc không có lý do là điểm cần làm rõ, không phải cớ để loại.'
    }
  ]
};

// Chọn thang theo hồ sơ. Hiện trả thang mặc định.
// Về sau: đọc rubric riêng của vị trí từ hr_jobs khi hồ sơ đã gắn job_id.
export function pickRubric(/* application, job */) {
  return DEFAULT_RUBRIC;
}

// Tổng trọng số, để quy điểm về thang 100.
export function totalWeight(rubric) {
  return rubric.axes.reduce((s, a) => s + (a.weight || 0), 0);
}

// Tính điểm tổng thang 100 từ điểm từng trục (0..10) và trọng số.
// scores: { [axisKey]: number }. Trục thiếu điểm coi như 0.
export function weightedScore(rubric, scores) {
  const wTotal = totalWeight(rubric);
  if (!wTotal) return 0;
  let sum = 0;
  for (const axis of rubric.axes) {
    const s = Number(scores?.[axis.key]);
    const clamped = Number.isFinite(s) ? Math.max(0, Math.min(10, s)) : 0;
    sum += clamped * (axis.weight || 0);
  }
  // sum tối đa = 10 * wTotal. Quy về 100.
  return Math.round((sum / (10 * wTotal)) * 100);
}
