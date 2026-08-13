'use client';

import { removeJob } from '../actions';
import { useTransition } from 'react';

type Props = { jobId: string; jobTitle: string };

export default function RemoveJobButton({ jobId, jobTitle }: Props) {
  const [pending, startTransition] = useTransition();

  const handleClick = () => {
    if (!window.confirm(`Xoá vị trí "${jobTitle}"?\nThao tác này không thể hoàn tác.`)) return;
    const fd = new FormData();
    fd.set('job_id', jobId);
    startTransition(() => removeJob(fd));
  };

  return (
    <button
      type="button"
      className="btn no"
      style={{ fontSize: '0.8em' }}
      onClick={handleClick}
      disabled={pending}
    >
      {pending ? 'Đang xoá...' : 'Xoá vị trí'}
    </button>
  );
}
