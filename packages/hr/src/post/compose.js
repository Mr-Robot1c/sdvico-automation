// Soạn nội dung tin đăng từ dữ liệu vị trí và tiêu chí JD.
// Địa điểm lấy ưu tiên gần (HCM/Vũng Tàu và lân cận) từ JD Analyzer.

// post: { tieu_de, dia_diem, muc_luong, email, noi_dung }
export function composePosting({ title, jobBoardBody, targeting, salary = 'Thỏa thuận', email = process.env.HR_CONTACT_EMAIL || 'sdvicotuyendung@gmail.com', fallbackLocation = 'Vũng Tàu' }) {
  const chinh = (targeting?.dia_diem_uu_tien || []).filter((l) => l.uu_tien === 1).map((l) => l.dia_diem);
  const dia_diem = chinh.length ? chinh.join(', ') : fallbackLocation;
  return {
    tieu_de: title,
    dia_diem,
    muc_luong: salary,
    email,
    noi_dung: jobBoardBody || '(chưa có bản job_board, chạy /hr-jd trước)'
  };
}
