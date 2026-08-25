export const metadata = { title: 'Yêu cầu xoá dữ liệu — SDVICO Marketing' };

// Trang Data Deletion Instructions — Facebook BAT BUOC co URL rieng cho viec user request
// xoa du lieu (bat buoc khi Publish app tren Facebook Developer Console). URL: /xoa-du-lieu
// tren sdvico-mktit.vercel.app. Chi tiet chinh sach chinh o /privacy.
export default function Page() {
  return (
    <main style={{ maxWidth: 780, margin: '0 auto', lineHeight: 1.6 }}>
      <h1>Yêu cầu xoá dữ liệu</h1>
      <p className="muted">SDVICO Marketing · Cập nhật: 25/08/2026</p>

      <p>
        Trang này hướng dẫn bà con cách yêu cầu SDVICO xoá thông tin cá nhân mà chúng tôi đã lưu về
        bà con (nếu có). Chi tiết loại dữ liệu chúng tôi lưu xem ở{' '}
        <a href="/privacy">Chính sách quyền riêng tư</a>.
      </p>

      <h2>Dữ liệu nào có thể xoá</h2>
      <ul>
        <li>Tên hiển thị Facebook và mã người dùng nội bộ (PSID) khi bà con để bình luận hoặc nhắn tin tới trang Facebook chính thức của SDVICO.</li>
        <li>Nội dung câu hỏi bà con để lại (bình luận hoặc tin nhắn).</li>
        <li>Ghi chú của nhân viên kinh doanh SDVICO về cuộc trao đổi với bà con (nếu có).</li>
      </ul>

      <h2>Cách yêu cầu xoá</h2>
      <p>Gửi yêu cầu qua một trong 3 kênh sau, cho biết tên Facebook bà con đã dùng để tương tác với trang SDVICO:</p>
      <ol>
        <li>
          <b>Nhắn tin Messenger</b> tới trang Facebook chính thức{' '}
          <a href="https://www.facebook.com/1266212619906410" target="_blank" rel="noreferrer">
            SDViCo - Thiết bị tàu cá
          </a>
          , ghi rõ nội dung: <i>“Yêu cầu xoá thông tin cá nhân của tôi khỏi hệ thống SDVICO.”</i>
        </li>
        <li>
          <b>Gửi email</b> tới{' '}
          <a href="mailto:tuyendung@sdvico.vn">tuyendung@sdvico.vn</a> với tiêu đề{' '}
          <i>“Yêu cầu xoá dữ liệu — [Tên Facebook của bà con]”</i>.
        </li>
        <li>
          <b>Gọi hotline</b> <a href="tel:19002323 49">1900 23 23 49</a>, bấm phím nhánh chăm sóc khách
          hàng, đề nghị xoá dữ liệu.
        </li>
      </ol>

      <h2>Thời gian xử lý</h2>
      <p>
        SDVICO xử lý và xoá thông tin trong vòng <b>7 ngày làm việc</b> kể từ khi nhận được yêu cầu
        hợp lệ. Chúng tôi sẽ trả lời xác nhận qua chính kênh bà con đã gửi yêu cầu.
      </p>

      <h2>Lưu ý</h2>
      <ul>
        <li>
          Xoá dữ liệu chỉ áp dụng cho thông tin SDVICO lưu trên hệ thống nội bộ. Bình luận / tin nhắn
          bà con để lại trên trang Facebook công khai vẫn hiển thị bên Facebook — muốn gỡ hẳn, bà con
          tự xoá trong Facebook của mình.
        </li>
        <li>
          Sau khi xoá, thông tin không thể khôi phục. Nếu bà con tiếp tục để bình luận / nhắn tin mới
          tới trang SDVICO, hệ thống sẽ lưu lại như một cuộc trao đổi mới.
        </li>
      </ul>

      <h2>Liên hệ</h2>
      <p>
        Công ty TNHH Hiệp Lực Phát Triển Việt (SDVICO)
        <br />
        Địa chỉ: 283 Nguyễn Hữu Cảnh, Vũng Tàu
        <br />
        Website: <a href="https://sdvico.vn" target="_blank" rel="noreferrer">sdvico.vn</a> — Hotline: 1900 23 23 49
      </p>
    </main>
  );
}
