'use client';

import { useOptimistic, useTransition } from 'react';
import { toggleAutoPost } from '../actions';

type Props = { jobId: string; isOn: boolean };

// Toggle bật/tắt chế độ tự động đăng bài cho vị trí.
// useOptimistic cho phản hồi tức thì mà không chờ server round-trip.
export default function AutoPostToggle({ jobId, isOn }: Props) {
  const [optimisticOn, setOptimisticOn] = useOptimistic(isOn);
  const [, startTransition] = useTransition();

  const handleToggle = () => {
    startTransition(async () => {
      setOptimisticOn(!optimisticOn);
      const fd = new FormData();
      fd.set('job_id', jobId);
      fd.set('current', String(optimisticOn));
      await toggleAutoPost(fd);
    });
  };

  return (
    <button
      type="button"
      className={`toggle-pill${optimisticOn ? ' on' : ''}`}
      onClick={handleToggle}
      aria-pressed={optimisticOn}
      title={optimisticOn ? 'Tự động đăng BẬT — bấm để tắt' : 'Bấm để bật tự động đăng bài'}
    >
      <span className="toggle-knob" aria-hidden="true" />
      {optimisticOn ? 'Tự động BẬT' : 'Tự động TẮT'}
    </button>
  );
}
