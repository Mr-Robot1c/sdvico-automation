'use client';
import { useRef } from 'react';

// Dropdown chọn folder sản phẩm cho tư liệu, tự lưu khi đổi (gọi server action).
export default function ProductGroupSelect({
  id,
  value,
  options,
  action,
}: {
  id: string;
  value: string;
  options: string[];
  action: (formData: FormData) => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form ref={formRef} action={action} className="pg-form">
      <input type="hidden" name="id" value={id} />
      <select
        name="product_group"
        defaultValue={value}
        aria-label="Folder sản phẩm"
        title="Gán tư liệu vào folder sản phẩm cho vòng xoay đăng bài"
        onChange={() => formRef.current?.requestSubmit()}
      >
        <option value="">(chưa gán folder)</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </form>
  );
}
