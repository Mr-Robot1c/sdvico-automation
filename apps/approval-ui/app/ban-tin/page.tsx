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
          <p className="sub" style={{ margin: '4px 0 0' }}>
            Xưởng dựng video bản tin (gói độc lập trên máy biên tập). Dựng xong, bản tin được nạp vào Hàng đợi duyệt như mọi bài khác.
          </p>
        </div>
      </header>
      <StudioEmbed />
    </main>
  );
}
