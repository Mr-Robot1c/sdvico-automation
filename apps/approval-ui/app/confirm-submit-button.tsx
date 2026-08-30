'use client';

// Nút submit có HỘP XÁC NHẬN (30/8, audit M7): hành động phá hủy như DỪNG KHẨN tác động toàn
// hệ thống — bấm nhầm là chặn mọi đăng bài. Bọc window.confirm trước khi form server action
// chạy; Hủy thì preventDefault, không gửi form.
export default function ConfirmSubmitButton({
  className,
  message,
  children,
}: {
  className?: string;
  message: string;
  children: React.ReactNode;
}) {
  return (
    <button
      className={className}
      type="submit"
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
