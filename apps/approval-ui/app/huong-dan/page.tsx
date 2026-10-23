import Link from 'next/link';

// Trang /huong-dan (23/10, đợt 3 sắp xếp lại, docs/app-map/design-spec-app-noi-bo.md màn 8): người mới đọc một
// lần là biết 3 việc mỗi ngày, máy tự chạy lúc nào và luật nào không được bỏ qua. Giải thích dài trước nằm dưới
// tiêu đề từng trang, đợt 2 bỏ đi và gom về đây. Trang tĩnh, không đọc dữ liệu.

const DAILY = [
  {
    href: '/noi-dung',
    title: 'Duyệt bài',
    steps: [
      'Mở Duyệt bài, xem từng bài máy vừa viết.',
      'Đúng thì bấm Duyệt, sai chữ thì sửa rồi Lưu chỉnh sửa, không dùng được thì Từ chối.',
      'Bài có cờ đỏ (quy định nhà nước, IUU, Kiểm ngư) phải có quản lý đồng ý, tick ô "Quản lý đã duyệt" rồi mới Duyệt được.',
      'Ô YouTube chỉ Duyệt được khi bài đã có video.',
    ],
  },
  {
    href: '/ke-hoach',
    title: 'Kế hoạch',
    steps: [
      'Tab Tuần này: xem máy sẽ viết bài gì mỗi ngày, sản phẩm nào đang ưu tiên.',
      'Tab Lịch đăng: đổi giờ đăng và kênh cố định trong tuần.',
      'Tab Cài đặt: đổi mục tiêu tuần hoặc sản phẩm tập trung, rồi bấm soạn lại.',
      'Có nút "Áp dụng đề xuất mới" ở đầu trang thì xem rồi bấm để dùng bản BOSS vừa học.',
    ],
  },
  {
    href: '/do-luong/tuan',
    title: 'Số liệu',
    steps: [
      'Tab Theo tuần: tuần này so với tuần trước, bài nào ăn nhất.',
      'Tab Theo ngày: số liệu bài đăng hôm nay.',
      'Tab Theo kênh: Facebook, TikTok, YouTube từng kênh.',
      'Số liệu tự cập nhật mỗi 6 tiếng, cần ngay thì bấm "Kéo số liệu ngay".',
    ],
  },
];

// Giờ Việt Nam. Khớp vercel.json (rotate 8h, 14h) và .github/workflows (video 5h, 13h; blog 6h; số liệu mỗi 6 tiếng).
const SCHEDULE = [
  ['Mỗi ngày 5h và 13h', 'Dựng video cho các ô cần video'],
  ['Mỗi ngày 6h', 'Viết bài blog'],
  ['Mỗi ngày 8h', 'Viết bài cho các ô giờ trước 12h'],
  ['Mỗi ngày 14h', 'Viết bài cho các ô giờ từ 12h'],
  ['Mỗi ngày 20h', 'BOSS chỉnh nhẹ trọng số sản phẩm theo số liệu 4 tuần gần nhất'],
  ['Chủ nhật 8h', 'BOSS soạn kế hoạch tuần sau để bạn xem và sửa'],
  ['Chủ nhật tối', 'BOSS học số liệu cả tuần'],
  ['Thứ 2 8h', 'Máy áp kế hoạch tuần mới kèm kết quả vừa học'],
];

const RULES = [
  'Máy soạn, người bấm Duyệt. Không bài nào tự đăng khi chưa có người duyệt.',
  'Máy không tự nhắn khách. Tin trả lời khách do người trực kênh tự gửi.',
  'Bài về quy định nhà nước, IUU, Cục Thủy sản, Kiểm ngư phải qua quản lý.',
  'Không bịa số liệu, giá, khách hàng. Thấy bài có con số lạ thì Từ chối hoặc sửa.',
];

export default function Page() {
  return (
    <main>
      <header className="head-row">
        <div>
          <h1>Hướng dẫn</h1>
        </div>
        <div className="head-actions">
          <Link href="/tong-quan" className="btn ok">Về trang Hôm nay</Link>
        </div>
      </header>

      <section className="blk">
        <h2>3 việc mỗi ngày</h2>
        <div className="guide-grid">
          {DAILY.map((d, i) => (
            <div key={d.href} className="guide-card">
              <h3>{i + 1}. <Link href={d.href}>{d.title}</Link></h3>
              <ul>{d.steps.map((s) => <li key={s}>{s}</li>)}</ul>
            </div>
          ))}
        </div>
      </section>

      <section className="blk">
        <h2>Máy tự chạy lúc nào</h2>
        <div className="tablewrap">
          <table className="datatable">
            <thead><tr><th style={{ width: 180 }}>Giờ</th><th>Việc</th></tr></thead>
            <tbody>{SCHEDULE.map(([t, w]) => <tr key={t}><td data-label="Giờ"><b>{t}</b></td><td data-label="Việc">{w}</td></tr>)}</tbody>
          </table>
        </div>
      </section>

      <section className="blk">
        <h2>Luật không được bỏ qua</h2>
        <ul className="guide-rules">{RULES.map((r) => <li key={r}>{r}</li>)}</ul>
      </section>

      <section className="blk">
        <h2>Cần hỏi thêm</h2>
        <p style={{ margin: 0 }}>
          Bấm nút <b>💬 Hỏi bot</b> ở góc dưới bên phải, trang nào cũng có. Giá, thông số, bảo hành của SDVICO bot chỉ lấy
          từ <Link href="/hoi-dap">Kho hỏi đáp</Link>, kho chưa có thì bot nói chưa có.
        </p>
      </section>
    </main>
  );
}
