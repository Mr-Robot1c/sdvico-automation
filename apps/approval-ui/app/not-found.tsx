import Link from 'next/link';

// 404 tiếng Việt (2/10, audit đợt A: trước đây là trang tiếng Anh mặc định của Next).
// Render trong layout gốc nên tự theo shell: trang công khai (/blog, /san-pham) thấy header công khai,
// trang nội bộ thấy shell nội bộ. Chỉ link tới route công khai để không dẫn khách vào chỗ cần đăng nhập.
export const metadata = { title: 'Không tìm thấy trang | SDVICO' };

export default function NotFound() {
  return (
    <main>
      <div className="empty" style={{ maxWidth: 560, margin: '48px auto' }}>
        <div className="empty-icon" aria-hidden="true">🧭</div>
        <h1 style={{ fontSize: '1.4rem', margin: '8px 0' }}>Không tìm thấy trang</h1>
        <p className="sub">Đường dẫn này không có, hoặc bài viết đã được gỡ hoặc đổi địa chỉ. Mời quay về danh sách bài viết hoặc xem sản phẩm.</p>
        <p style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginTop: 16 }}>
          <Link href="/blog" className="btn ok">Về trang bài viết</Link>
          <Link href="/san-pham" className="btn ghost">Xem sản phẩm</Link>
        </p>
      </div>
    </main>
  );
}
