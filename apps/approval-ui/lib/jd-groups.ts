// Danh mục nhóm ngành tuyển dụng của SDVICO và phân luồng kênh theo nhóm.
// Nguồn: docs/tuyen-dung-phan-luong.md. Dùng cho trang Tạo JD.

export type JobGroup = {
  key: 'A' | 'B' | 'C' | 'D';
  ten: string;
  chan_dung: string;
  vi_tri: string[];
  kenh: string[];
};

export const JOB_GROUPS: JobGroup[] = [
  {
    key: 'A',
    ten: 'Kỹ thuật, lắp đặt (hiện trường, địa phương)',
    chan_dung: 'Thợ nghề, cao đẳng hoặc trung cấp, ở Vũng Tàu và lân cận.',
    vi_tri: [
      'Kỹ thuật viên lắp đặt thiết bị giám sát hành trình tàu cá',
      'Kỹ thuật viên điện tử viễn thông',
      'Kỹ thuật viên lắp đặt và bảo trì máy lọc nước biển',
      'Nhân viên hỗ trợ kỹ thuật và bảo hành hiện trường'
    ],
    kenh: ['Facebook nhóm việc làm Vũng Tàu và nhóm ngành tàu cá', 'Việc Làm 24h', 'Zalo OA', 'Dán tin tại cảng']
  },
  {
    key: 'B',
    ten: 'Kinh doanh, thị trường',
    chan_dung: 'Có kinh nghiệm bán hàng, hiểu ngành biển.',
    vi_tri: [
      'Nhân viên kinh doanh thiết bị hàng hải',
      'Nhân viên kinh doanh dầu nhớt PVOIL',
      'Nhân viên chăm sóc khách hàng, tổng đài'
    ],
    kenh: ['TopCV', 'Việc Làm 24h', 'Facebook']
  },
  {
    key: 'C',
    ten: 'Chuyên môn, văn phòng',
    chan_dung: 'Đại học, kỹ sư, kế toán, marketing.',
    vi_tri: [
      'Kỹ sư điện tử viễn thông',
      'Nhân viên Marketing và nội dung số',
      'Kế toán',
      'Nhân viên hành chính nhân sự'
    ],
    kenh: ['TopCV', 'VietnamWorks', 'LinkedIn (vị trí kỹ sư, quản lý)']
  },
  {
    key: 'D',
    ten: 'Kho vận, vận hành',
    chan_dung: 'Lao động phổ thông.',
    vi_tri: ['Nhân viên kho, giao nhận'],
    kenh: ['Facebook địa phương', 'Việc Làm 24h', 'Zalo OA']
  }
];

export const GROUP_BY_KEY: Record<string, JobGroup> = Object.fromEntries(JOB_GROUPS.map((g) => [g.key, g]));

export type JdChannel = { key: string; ten: string; do_dai: string; tu: [number, number] };

// Bốn kênh và độ dài mục tiêu, khớp packages/hr/src/jd/channels.js.
export const JD_CHANNELS: JdChannel[] = [
  { key: 'website', ten: 'Website công ty', do_dai: 'đầy đủ', tu: [400, 700] },
  { key: 'job_board', ten: 'Trang tuyển dụng (TopCV, VietnamWorks)', do_dai: 'chuẩn', tu: [250, 450] },
  { key: 'facebook', ten: 'Facebook', do_dai: 'ngắn thu hút', tu: [80, 160] },
  { key: 'zalo_sms', ten: 'Zalo hoặc SMS', do_dai: 'rất ngắn', tu: [20, 45] }
];
