// Sinh CV tổng hợp để chạy thử pipeline mà không cần ứng viên thật (kế hoạch Phần 5.3).
// Có đủ ca khó: thiếu số điện thoại, CV tiếng Anh, trùng người, hồ sơ sơ sài.
// Đây là dữ liệu giả do đội tự dựng, không phải CV thật của ai (điều cấm 6).

import { buildDedupKey } from '../intake/normalize.js';

// Bộ hồ sơ mẫu cho các vị trí sát SDVICO: kỹ thuật, kinh doanh thiết bị biển, hỗ trợ.
const PROFILES = [
  {
    full_name: 'Trần Minh Quân', email: 'quan.tran.tech@email.vn', phone: '0905112233',
    role: 'Kỹ thuật viên điện tử', location: 'Vũng Tàu', years: 4,
    skills: ['lắp đặt thiết bị điện tử', 'đọc sơ đồ mạch', 'sửa chữa thiết bị định vị', 'thiết bị hàng hải'],
    exp: ['4 năm lắp đặt và bảo trì thiết bị giám sát hành trình tàu cá tại cảng Vũng Tàu',
      'Từng lắp máy định vị Viettel S-Tracking cho hơn 60 tàu, xử lý sự cố mất tín hiệu tại chỗ'],
    edu: 'Cao đẳng Điện tử, Trường Cao đẳng Kỹ thuật Vũng Tàu'
  },
  {
    full_name: 'Nguyễn Thị Hồng', email: 'hong.nguyen.sales@email.vn', phone: '0918445566',
    role: 'Nhân viên kinh doanh thiết bị hàng hải', location: 'Vũng Tàu', years: 3,
    skills: ['bán hàng B2B', 'chăm sóc khách hàng', 'hiểu ngành thủy sản', 'đàm phán'],
    exp: ['3 năm bán thiết bị hàng hải và dầu nhớt cho chủ tàu, doanh số trung bình 400.000.000 đồng mỗi tháng',
      'Xây dựng quan hệ với ngư dân và hợp tác xã đánh bắt tại Bà Rịa - Vũng Tàu'],
    edu: 'Đại học Kinh tế, chuyên ngành Quản trị kinh doanh'
  },
  {
    full_name: 'Lê Văn Sơn', email: 'son.le.eng@email.vn', phone: '0977889900',
    role: 'Kỹ sư điện tử viễn thông', location: 'Hồ Chí Minh', years: 6,
    skills: ['thiết kế mạch', 'firmware nhúng', 'RF và ăng ten', 'quản lý dự án kỹ thuật'],
    exp: ['6 năm phát triển và tích hợp thiết bị định vị vệ tinh cho ngành hàng hải',
      'Dẫn dắt nhóm 4 kỹ thuật viên, triển khai lắp đặt cho đội tàu 120 chiếc'],
    edu: 'Đại học Bách Khoa TP.HCM, ngành Điện tử Viễn thông'
  },
  {
    full_name: 'Phạm Thị Mai', email: 'mai.pham.mkt@email.vn', phone: '0903221144',
    role: 'Nhân viên Marketing', location: 'Hồ Chí Minh', years: 2,
    skills: ['viết nội dung', 'chạy quảng cáo Facebook', 'SEO cơ bản', 'thiết kế Canva'],
    exp: ['2 năm làm marketing cho công ty thiết bị công nghiệp, tăng tương tác trang 30 phần trăm',
      'Lên kế hoạch nội dung và quản lý fanpage ngành kỹ thuật'],
    edu: 'Đại học, ngành Marketing'
  },
  {
    full_name: 'Võ Hoàng Nam', email: 'nam.vo.tech@email.vn', phone: null, // ca khó: thiếu số điện thoại
    role: 'Kỹ thuật viên lắp đặt', location: 'Đồng Nai', years: 2,
    skills: ['lắp đặt thiết bị', 'điện dân dụng', 'chịu khó đi công tác'],
    exp: ['2 năm lắp đặt hệ thống điện và thiết bị cho tàu thuyền tại xưởng đóng tàu',
      'Quen việc leo trèo, làm ngoài trời, đi cảng thường xuyên'],
    edu: 'Trung cấp nghề Điện'
  },
  {
    full_name: 'James Nguyen', email: 'james.nguyen.dev@email.vn', phone: '0912778899',
    role: 'Embedded Software Engineer', location: 'Ho Chi Minh City', years: 5, lang: 'en',
    skills: ['C/C++', 'embedded Linux', 'GPS/GNSS modules', 'IoT firmware'],
    exp: ['5 years developing firmware for marine tracking and IoT devices',
      'Integrated satellite positioning modules for fishing vessel monitoring systems'],
    edu: 'Bachelor of Computer Engineering'
  },
  {
    full_name: 'Đặng Văn Tùng', email: 'tung.dang.tech@email.vn', phone: '0906334455',
    role: 'Kỹ thuật viên bảo hành', location: 'Vũng Tàu', years: 1,
    skills: ['sửa chữa điện tử cơ bản', 'chăm sóc khách hàng', 'ghi chép kỹ thuật'],
    exp: ['1 năm bảo hành thiết bị điện tử tiêu dùng tại trung tâm dịch vụ'],
    edu: 'Cao đẳng Điện tử'
  },
  {
    full_name: 'Bùi Thị Lan', email: 'lan.bui.acc@email.vn', phone: '0938556677',
    role: 'Kế toán', location: 'Vũng Tàu', years: 4,
    skills: ['kế toán tổng hợp', 'phần mềm MISA', 'báo cáo thuế', 'quản lý công nợ'],
    exp: ['4 năm kế toán cho doanh nghiệp thương mại thiết bị, phụ trách thuế và công nợ'],
    edu: 'Đại học, ngành Kế toán'
  },
  {
    full_name: 'Hoàng Minh Đức', email: 'duc.hoang.tech@email.vn', phone: '0902998877',
    role: 'Kỹ thuật viên định vị', location: 'Bình Dương', years: 3,
    skills: ['thiết bị GPS', 'cấu hình định vị', 'lắp đặt ăng ten', 'hỗ trợ kỹ thuật'],
    exp: ['3 năm lắp đặt và cấu hình thiết bị định vị cho xe và tàu',
      'Hướng dẫn khách sử dụng phần mềm theo dõi hành trình'],
    edu: 'Cao đẳng Công nghệ Thông tin'
  },
  {
    full_name: 'Trương Văn Hải', email: 'hai.truong.sales@email.vn', phone: '0917443322',
    role: 'Nhân viên kinh doanh', location: 'Hồ Chí Minh', years: 5,
    skills: ['bán thiết bị công nghiệp', 'mở rộng thị trường', 'quản lý đại lý'],
    exp: ['5 năm kinh doanh thiết bị công nghiệp, quản lý mạng lưới đại lý miền Nam',
      'Đạt và vượt chỉ tiêu doanh số nhiều quý liên tiếp'],
    edu: 'Đại học, ngành Quản trị kinh doanh'
  },
  {
    full_name: 'Ngô Thị Thu', email: 'thu.ngo.admin@email.vn', phone: '0904667788',
    role: 'Nhân viên hành chính', location: 'Vũng Tàu', years: 2,
    skills: ['soạn thảo văn bản', 'quản lý hồ sơ', 'tin học văn phòng'],
    exp: ['2 năm hành chính nhân sự cho công ty vừa và nhỏ'],
    edu: 'Cao đẳng Quản trị văn phòng'
  },
  {
    // Ca khó: hồ sơ sơ sài, gần như không có thông tin.
    full_name: 'Phan Văn Lợi', email: 'loi.phan@email.vn', phone: '0909001122',
    role: 'Tìm việc kỹ thuật', location: 'Vũng Tàu', years: 0, sparse: true,
    skills: [], exp: ['Có sức khỏe tốt, muốn học nghề kỹ thuật'], edu: 'Tốt nghiệp THPT'
  },
  {
    full_name: 'Đỗ Quang Huy', email: 'huy.do.tech@email.vn', phone: '0905776655',
    role: 'Kỹ thuật viên điện lạnh và điện tử', location: 'Bà Rịa - Vũng Tàu', years: 7,
    skills: ['điện lạnh', 'điện tử công suất', 'lắp đặt hệ thống', 'quản lý nhóm nhỏ'],
    exp: ['7 năm kỹ thuật điện lạnh và điện tử cho tàu và nhà xưởng',
      'Từng phụ trách nhóm 3 người lắp đặt hệ thống lọc nước và làm mát trên tàu cá'],
    edu: 'Cao đẳng Kỹ thuật, ngành Điện'
  },
  {
    // Ca khó: trùng người với hồ sơ đầu tiên (cùng email), kiểm tra khử trùng.
    full_name: 'Trần Minh Quân', email: 'quan.tran.tech@email.vn', phone: '0905112233',
    role: 'Kỹ thuật viên điện tử', location: 'Vũng Tàu', years: 4, dup: true,
    skills: ['lắp đặt thiết bị điện tử', 'thiết bị hàng hải', 'định vị vệ tinh'],
    exp: ['Cập nhật: 4 năm kinh nghiệm, bổ sung chứng chỉ an toàn lao động'],
    edu: 'Cao đẳng Điện tử'
  }
];

function buildRawTextVi(p) {
  if (p.sparse) {
    return `${p.full_name}\nEmail: ${p.email}\nĐiện thoại: ${p.phone}\nMục tiêu: ${p.exp[0]}\nHọc vấn: ${p.edu}`;
  }
  return [
    `HỒ SƠ ỨNG TUYỂN`,
    `Họ và tên: ${p.full_name}`,
    p.email ? `Email: ${p.email}` : '',
    p.phone ? `Điện thoại: ${p.phone}` : '',
    `Nơi ở: ${p.location}`,
    `Vị trí ứng tuyển: ${p.role}`,
    ``,
    `KINH NGHIỆM (${p.years} năm)`,
    ...p.exp.map((e) => `- ${e}`),
    ``,
    `KỸ NĂNG`,
    p.skills.length ? p.skills.map((s) => `- ${s}`).join('\n') : '- Đang học hỏi',
    ``,
    `HỌC VẤN`,
    `- ${p.edu}`
  ].filter(Boolean).join('\n');
}

function buildRawTextEn(p) {
  return [
    `RESUME`,
    `Name: ${p.full_name}`,
    p.email ? `Email: ${p.email}` : '',
    p.phone ? `Phone: ${p.phone}` : '',
    `Location: ${p.location}`,
    `Position: ${p.role}`,
    ``,
    `EXPERIENCE (${p.years} years)`,
    ...p.exp.map((e) => `- ${e}`),
    ``,
    `SKILLS`,
    p.skills.map((s) => `- ${s}`).join('\n'),
    ``,
    `EDUCATION`,
    `- ${p.edu}`
  ].filter(Boolean).join('\n');
}

// Trả về mảng cv object theo đúng dạng normalizeCv, sẵn sàng ghi vào hr_candidates.
export function generateSyntheticCandidates() {
  const now = new Date().toISOString();
  return PROFILES.map((p) => {
    const raw_text = p.lang === 'en' ? buildRawTextEn(p) : buildRawTextVi(p);
    return {
      full_name: p.full_name,
      email: p.email,
      phone: p.phone || null,
      raw_text,
      source: 'verify-synthetic',
      source_message: { subject: `CV giả: ${p.role}` },
      attachments: [],
      parsed_at: now,
      dedup_key: buildDedupKey({ email: p.email, phone: p.phone })
    };
  });
}
