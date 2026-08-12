'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createAssetUploadUrl, registerAsset } from '../actions';

// Tải ảnh/video THẲNG từ trình duyệt lên Supabase Storage qua URL ký sẵn.
// Không đi qua server action nên không dính giới hạn 4,5MB của Vercel — video lớn tải được.
export default function AssetUploader({ kind }: { kind: 'image' | 'video' }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [title, setTitle] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const isVideo = kind === 'video';

  const onUpload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setMsg(isVideo ? 'Chọn video trước.' : 'Chọn ảnh trước.');
      return;
    }
    setBusy(true);
    setMsg('Đang tải lên...');
    try {
      // 1. Xin URL ký sẵn từ máy chủ (dùng khóa service role, an toàn).
      const { path, uploadUrl } = await createAssetUploadUrl(file.name, kind);
      // 2. Trình duyệt PUT file thẳng lên Storage bằng URL ký sẵn (không qua server action).
      const res = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'content-type': file.type || 'application/octet-stream',
          'x-upsert': 'true'
        },
        body: file
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error(`Tải lên thất bại (${res.status}). ${detail.slice(0, 200)}`);
      }
      // 3. Ghi nhận vào brand_assets để hiện trong kho.
      await registerAsset({ path, kind, title, license: 'owned' });
      setMsg('Đã tải lên xong. Chọn từ kho bên trên để gắn vào bài.');
      setTitle('');
      if (fileRef.current) fileRef.current.value = '';
      router.refresh();
    } catch (e: any) {
      setMsg('Lỗi tải lên: ' + (e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="factform">
      <input
        ref={fileRef}
        type="file"
        accept={isVideo ? 'video/*' : 'image/*'}
        aria-label={isVideo ? 'Chọn video từ máy' : 'Chọn ảnh từ máy'}
        disabled={busy}
      />
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={isVideo ? 'Tên video (tùy chọn)' : 'Tên ảnh (tùy chọn)'}
        aria-label={isVideo ? 'Tên video' : 'Tên ảnh'}
        disabled={busy}
      />
      <button className="btn ok" type="button" onClick={onUpload} disabled={busy}>
        {busy ? 'Đang tải...' : isVideo ? 'Tải video lên' : 'Tải ảnh lên'}
      </button>
      {msg ? <span className="muted">{msg}</span> : null}
    </div>
  );
}
