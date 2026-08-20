import Link from 'next/link';

export const dynamic = 'force-static';

// TRANG GỘP quy tắc (sếp chốt 20/8: gộp cho gọn). /privacy và /terms vẫn là URL công khai
// riêng (TikTok/Facebook review bắt buộc trỏ thẳng), trang này chỉ là cửa vào từ sidebar.
export default function Page() {
  return (
    <main>
      <header className="head-row">
        <div>
          <h1>Quy tắc</h1>
          <p className="sub">Trang công khai cho người dùng và các nền tảng (TikTok, Facebook) xem khi duyệt app.</p>
        </div>
      </header>

      <section style={{ display: 'grid', gap: 12, maxWidth: 720 }}>
        <div className="card" style={{ display: 'flex', gap: 14, alignItems: 'flex-start', padding: 16 }}>
          <span style={{ fontSize: 26 }} aria-hidden="true">🔒</span>
          <div style={{ flex: 1 }}>
            <b>Chính sách quyền riêng tư</b>
            <p className="sub" style={{ margin: '4px 0 0' }}>Thu thập gì, dùng làm gì, lưu bao lâu. Bắt buộc khi đăng ký app TikTok và Facebook.</p>
          </div>
          <Link className="btn ghost sm" href="/privacy" style={{ flex: '0 0 auto' }}>Mở</Link>
        </div>
        <div className="card" style={{ display: 'flex', gap: 14, alignItems: 'flex-start', padding: 16 }}>
          <span style={{ fontSize: 26 }} aria-hidden="true">📄</span>
          <div style={{ flex: 1 }}>
            <b>Điều khoản sử dụng</b>
            <p className="sub" style={{ margin: '4px 0 0' }}>Điều kiện dùng dịch vụ và giới hạn trách nhiệm.</p>
          </div>
          <Link className="btn ghost sm" href="/terms" style={{ flex: '0 0 auto' }}>Mở</Link>
        </div>
      </section>
    </main>
  );
}
