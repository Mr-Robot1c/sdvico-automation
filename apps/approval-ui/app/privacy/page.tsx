export const metadata = { title: 'Chính sách quyền riêng tư — SDVICO Marketing' };

// Cap nhat 25/8/2026: bo sung muc "Du lieu khach hang qua Facebook webhook" — tinh
// nang bat lead tu comment/inbox them tu 24/8, phai khai bao dung. Truoc do noi "khong
// thu thap du lieu nguoi dung khac" — khong con dung.
export default function Page() {
  return (
    <main style={{ maxWidth: 780, margin: '0 auto', lineHeight: 1.6 }}>
      <h1>Chính sách quyền riêng tư</h1>
      <p className="muted">Ứng dụng: SDVICO Marketing · Cập nhật: 25/08/2026</p>

      <p>
        SDVICO Marketing là công cụ nội bộ của Công ty TNHH Hiệp Lực Phát Triển Việt (SDVICO), dùng để
        soạn và đăng nội dung marketing của chính công ty lên các trang mạng xã hội chính thức của
        SDVICO (Facebook, TikTok, YouTube, Zalo) và bắt thông tin khách hàng quan tâm sản phẩm để nhân
        viên kinh doanh chăm sóc.
      </p>

      <h2>Dữ liệu chúng tôi xử lý</h2>
      <ul>
        <li>
          <b>Mã ủy quyền (access token, refresh token)</b> của các tài khoản mạng xã hội chính thức của
          SDVICO, do người quản trị công ty tự kết nối, dùng để đăng bài thay công ty.
        </li>
        <li>
          <b>Nội dung marketing</b> do nhân viên SDVICO soạn: văn bản, hình ảnh và video sản phẩm của
          công ty.
        </li>
        <li>
          <b>Thông tin khách hàng hỏi mua qua Facebook</b> (mới): khi bà con để bình luận hoặc nhắn tin
          Messenger tới trang Facebook chính thức của SDVICO có nội dung hỏi mua sản phẩm (ví dụ hỏi
          giá, hỏi cách lắp đặt, xin số điện thoại), hệ thống tự nhận qua Facebook Webhook và lưu lại:
          tên hiển thị công khai trên Facebook, mã người dùng nội bộ do Facebook cấp (PSID), nội dung
          câu hỏi, thời điểm hỏi, bài viết đang xem. Không thu thập email, số điện thoại, danh bạ hay
          bất kỳ dữ liệu riêng tư nào khác của bà con.
        </li>
      </ul>

      <h2>Mục đích sử dụng</h2>
      <ul>
        <li>Đăng nội dung của SDVICO lên trang mạng xã hội của SDVICO theo quy trình máy soạn, người duyệt.</li>
        <li>
          Chuyển thông tin bà con hỏi mua cho nhân viên kinh doanh của SDVICO để tư vấn sản phẩm phù
          hợp. Nhân viên kinh doanh chủ động liên hệ lại theo kênh Facebook, Zalo hoặc điện thoại. Máy
          không tự động trả lời khách.
        </li>
      </ul>

      <h2>Lưu trữ và bảo mật</h2>
      <p>
        Dữ liệu được lưu an toàn trên hạ tầng Supabase của công ty, chỉ truy cập ở phía máy chủ, có
        bảo vệ bằng Row Level Security. Nhân viên SDVICO đã đăng nhập nội bộ mới đọc được. Không chia
        sẻ dữ liệu cho bên thứ ba.
      </p>

      <h2>Thời gian lưu trữ</h2>
      <p>
        Thông tin hỏi mua qua Facebook được lưu tối đa 12 tháng kể từ ngày cuối cùng có tương tác, sau
        đó xoá tự động. Bà con có thể yêu cầu xoá sớm hơn bất cứ lúc nào theo hướng dẫn ở trang{' '}
        <a href="/xoa-du-lieu">Yêu cầu xoá dữ liệu</a>.
      </p>

      <h2>Quyền của bạn</h2>
      <ul>
        <li>
          <b>Chủ tài khoản mạng xã hội SDVICO</b> có thể thu hồi quyền truy cập bất cứ lúc nào trong
          phần cài đặt ứng dụng của Facebook hoặc TikTok. Khi thu hồi, hệ thống ngừng đăng bài thay
          tài khoản đó.
        </li>
        <li>
          <b>Bà con để lại bình luận / tin nhắn</b> có quyền yêu cầu xem lại, sửa, xoá thông tin của
          mình theo hướng dẫn ở trang <a href="/xoa-du-lieu">Yêu cầu xoá dữ liệu</a>. SDVICO xoá trong
          vòng 7 ngày làm việc kể từ khi nhận yêu cầu hợp lệ.
        </li>
      </ul>

      <h2>Liên hệ</h2>
      <p>
        Công ty TNHH Hiệp Lực Phát Triển Việt (SDVICO)
        <br />
        Địa chỉ: 283 Nguyễn Hữu Cảnh, Vũng Tàu
        <br />
        Website: <a href="https://sdvico.vn" target="_blank" rel="noreferrer">sdvico.vn</a> — Hotline: 1900 23 23 49
        <br />
        Email: tuyendung@sdvico.vn (dùng chung cho mọi yêu cầu về dữ liệu cá nhân)
      </p>
    </main>
  );
}
