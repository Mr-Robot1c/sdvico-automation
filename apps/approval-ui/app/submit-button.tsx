'use client';
import { useFormStatus } from 'react-dom';

type Props = {
  label: string;
  pendingLabel?: string;
  className?: string;
  style?: React.CSSProperties;
};

// Nút submit tự disable và đổi nhãn khi form đang chạy.
// Dùng useFormStatus nên phải là con trực tiếp của <form>.
export function SubmitButton({ label, pendingLabel, className = 'btn ok', style }: Props) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={className}
      disabled={pending}
      aria-busy={pending}
      style={{ opacity: pending ? 0.65 : 1, cursor: pending ? 'wait' : undefined, transition: 'opacity 0.15s', ...style }}
    >
      {pending ? (pendingLabel ?? 'Đang xử lý...') : label}
    </button>
  );
}
