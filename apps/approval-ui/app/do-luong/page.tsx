import DoLuongSection from './do-luong-section';

// Đo lường là TRANG RIÊNG trở lại (user 21/8 chiều: "bảng bài viết tách đo lường ra").
// Buổi sáng từng gộp vào /noi-dung làm tab; giờ tách: Bảng bài viết giữ phần duyệt +
// vận hành + danh sách, Đo lường đứng riêng và sẽ gánh thêm số liệu YouTube Shorts.
// Section dùng chung ở app/noi-dung/do-luong-section.tsx.
export const dynamic = 'force-dynamic';

export default function Page() {
  return (
    <main>
      <header className="head-row">
        <div>
          <h1>Đo lường</h1>
        </div>
      </header>
      <DoLuongSection />
    </main>
  );
}
