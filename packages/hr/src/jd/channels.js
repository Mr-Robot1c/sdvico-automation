// Bốn kênh đăng tin và độ dài tương ứng cho lệnh /hr-jd.
// Dùng chung: lệnh /hr-jd đọc để biết yêu cầu từng bản, save-jd.mjs đọc để kiểm bản nộp đủ bốn kênh.
//
// Ghi chú nghiệp vụ: kế hoạch chốt "bốn phiên bản độ dài cho bốn kênh" nhưng chưa nêu tên bốn kênh.
// Đây là bộ mặc định hợp lý cho ngành tuyển dụng ở Việt Nam. Phòng Nhân sự có thể tinh chỉnh.
// [CẦN XÁC NHẬN với Phòng Nhân sự: danh sách bốn kênh chính thức và giới hạn ký tự từng nơi]

export const JD_CHANNELS = [
  {
    key: 'website',
    ten: 'Website tuyển dụng công ty (sdvico.vn)',
    do_dai: 'đầy đủ',
    muc_tieu_tu: [400, 700],
    yeu_cau:
      'Bản đầy đủ nhất. Có giới thiệu ngắn về SDVICO, mô tả công việc, yêu cầu, quyền lợi, cách ứng tuyển. ' +
      'Viết trang trọng, rõ ràng, đủ ý để ứng viên tự đánh giá phù hợp.'
  },
  {
    key: 'job_board',
    ten: 'Trang tuyển dụng chuyên (TopCV, VietnamWorks)',
    do_dai: 'chuẩn',
    muc_tieu_tu: [250, 450],
    yeu_cau:
      'Bản chuẩn cho sàn tuyển dụng. Gọn hơn website, đi thẳng vào mô tả công việc, yêu cầu và quyền lợi. ' +
      'Dùng gạch đầu dòng bằng câu ngắn, dễ quét mắt.'
  },
  {
    key: 'facebook',
    ten: 'Mạng xã hội (Facebook)',
    do_dai: 'ngắn thu hút',
    muc_tieu_tu: [80, 160],
    yeu_cau:
      'Bản ngắn, thân thiện, thu hút để đăng lên trang. Nêu vị trí, một hai điểm hấp dẫn nhất, mức lương nếu được công bố, ' +
      'nơi làm việc và lời kêu gọi ứng tuyển. Tránh liệt kê dài. Có thể thêm vài hashtag ngành biển và thủy sản.'
  },
  {
    key: 'zalo_sms',
    ten: 'Tin nhắn Zalo hoặc SMS',
    do_dai: 'rất ngắn',
    muc_tieu_tu: [20, 45],
    yeu_cau:
      'Bản rất ngắn để nhắn tin. Chỉ vị trí, nơi làm việc, một điểm chính, và cách ứng tuyển. Một đoạn duy nhất, không gạch đầu dòng.'
  }
];

export const JD_CHANNEL_KEYS = JD_CHANNELS.map((c) => c.key);

// Kiểm một đối tượng jd_versions có đủ bốn kênh và có nội dung không rỗng.
// Trả về { ok, thieu, rong } để nơi gọi báo lỗi rõ ràng.
export function validateJdVersions(versions) {
  const thieu = [];
  const rong = [];
  for (const key of JD_CHANNEL_KEYS) {
    if (!(key in (versions || {}))) {
      thieu.push(key);
    } else if (!String(versions[key] || '').trim()) {
      rong.push(key);
    }
  }
  return { ok: thieu.length === 0 && rong.length === 0, thieu, rong };
}
