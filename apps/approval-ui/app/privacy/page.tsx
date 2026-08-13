export const metadata = { title: 'Chính sách quyền riêng tư — SDVICO Marketing' };

export default function Page() {
  return (
    <main style={{ maxWidth: 780, margin: '0 auto', lineHeight: 1.6 }}>
      <h1>Chính sách quyền riêng tư</h1>
      <p className="muted">Ứng dụng: SDVICO Marketing · Cập nhật: 13/08/2026</p>

      <p>
        SDVICO Marketing là công cụ nội bộ của Công ty TNHH Hiệp Lực Phát Triển Việt (SDVICO), dùng để
        soạn và đăng nội dung marketing của chính công ty lên các trang mạng xã hội chính thức của
        SDVICO (Facebook, TikTok).
      </p>

      <h2>Dữ liệu chúng tôi xử lý</h2>
      <ul>
        <li>
          Mã ủy quyền (access token, refresh token) của các tài khoản mạng xã hội <b>chính thức của
          SDVICO</b>, do người quản trị công ty tự kết nối, dùng để đăng bài thay công ty.
        </li>
        <li>Nội dung marketing do nhân viên SDVICO soạn: văn bản, hình ảnh và video sản phẩm của công ty.</li>
      </ul>
      <p>
        Chúng tôi <b>không</b> thu thập dữ liệu cá nhân của người dùng Facebook hay TikTok khác, không
        thu thập thông tin người xem, không mua bán dữ liệu.
      </p>

      <h2>Mục đích sử dụng</h2>
      <p>Chỉ để đăng nội dung của SDVICO lên trang của SDVICO, theo quy trình máy soạn, người duyệt.</p>

      <h2>Lưu trữ và bảo mật</h2>
      <p>
        Mã ủy quyền được lưu an toàn trên hạ tầng của công ty (Supabase), chỉ truy cập ở phía máy chủ,
        không chia sẻ cho bên thứ ba.
      </p>

      <h2>Quyền của bạn và cách thu hồi</h2>
      <p>
        Chủ tài khoản mạng xã hội có thể thu hồi quyền truy cập bất cứ lúc nào trong phần cài đặt ứng
        dụng của Facebook hoặc TikTok. Khi thu hồi, hệ thống ngừng đăng bài thay tài khoản đó.
      </p>

      <h2>Liên hệ</h2>
      <p>
        Công ty TNHH Hiệp Lực Phát Triển Việt (SDVICO)
        <br />
        Website: sdvico.vn — Hotline: 1900 23 23 49
      </p>
    </main>
  );
}
