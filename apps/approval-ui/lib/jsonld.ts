// 29/8 (audit bảo mật): JSON-LD nhét thẳng vào thẻ <script> qua dangerouslySetInnerHTML.
// JSON.stringify KHÔNG thoát dấu < — tiêu đề hay mô tả bài chứa chuỗi "</script>" là bẻ
// được ra khỏi thẻ và chạy mã trên trang CÔNG KHAI (blog, sản phẩm); nội dung này do AI
// sinh, AI lại đọc tin RSS bên ngoài nên chuỗi không tin được. Thoát dấu < thành chuỗi
// unicode-escape (backslash u003c): JSON giữ nguyên nghĩa với Google, hết chỗ bẻ thẻ.
export function safeJsonLd(obj: unknown): string {
  return JSON.stringify(obj).replace(/</g, '\\u003c');
}
