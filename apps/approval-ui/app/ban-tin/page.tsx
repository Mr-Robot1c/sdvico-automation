import StudioEmbed from './studio-embed';

// 2/10 (lệnh Thanh và sếp): tab "Bản tin" nhúng Studio Bản tin. Studio là gói ĐỘC LẬP chạy trên máy
// người biên tập (localhost:8899), nên toàn bộ việc kiểm sống và nhúng làm ở trình duyệt (studio-embed.tsx),
// trang này không gọi Supabase và không phụ thuộc Studio có chạy hay không.
export default function Page() {
  return (
    <main>
      <header className="head-row">
        <div>
          <h1>Studio bản tin</h1>
        </div>
      </header>
      <StudioEmbed />
    </main>
  );
}
