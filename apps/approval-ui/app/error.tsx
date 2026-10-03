'use client';

// 3/10 (kiểm thử B13, B17): các server action giờ ném lỗi khi ghi DB hỏng thay vì nuốt im lặng.
// Form thường (không tự bắt lỗi) rơi vào đây thay cho trang "Application error" trắng của Next.
// Bản production Next giấu nội dung lỗi máy chủ, nên chỉ nói chung và cho thử lại. Trang công
// khai cũng có thể rơi vào đây nên không dẫn link nội bộ.
export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main>
      <header className="head-row">
        <div>
          <h1>Có lỗi khi xử lý</h1>
          <p className="sub">Thao tác hoặc trang vừa rồi gặp lỗi. Tải lại trang để xem dữ liệu hiện tại rồi thử lại. Vẫn lỗi thì báo người quản trị.</p>
        </div>
      </header>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="btn ok" onClick={() => reset()}>Thử lại</button>
        <button type="button" className="btn ghost" onClick={() => window.location.reload()}>Tải lại trang</button>
      </div>
    </main>
  );
}
