'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createAssetUploadUrl, registerAsset } from '../actions';

// Tải ảnh/video THẲNG từ trình duyệt lên Supabase Storage qua URL ký sẵn.
// Không đi qua server action nên không dính giới hạn 4,5MB của Vercel — video lớn tải được.
// Dùng XMLHttpRequest để hiện phần trăm tiến trình, tránh cảm giác treo với file lớn.
function mb(bytes: number) {
  return (bytes / (1024 * 1024)).toFixed(1);
}

export default function AssetUploader({ kind }: { kind: 'image' | 'video' }) {
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState(0);
  const [msg, setMsg] = useState('');
  const [title, setTitle] = useState('');
  const [fileName, setFileName] = useState('');
  const [fileSize, setFileSize] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const isVideo = kind === 'video';

  const onPick = () => {
    const f = fileRef.current?.files?.[0];
    setFileName(f?.name || '');
    setFileSize(f?.size || 0);
    setMsg('');
    setPct(0);
  };

  const putWithProgress = (url: string, file: File) =>
    new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', url);
      xhr.setRequestHeader('content-type', file.type || 'application/octet-stream');
      xhr.setRequestHeader('x-upsert', 'true');
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) setPct(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve();
        else if (xhr.status === 413) reject(new Error('File quá lớn so với giới hạn kho (bucket). Nén nhỏ lại hoặc nâng giới hạn bucket trên Supabase.'));
        else reject(new Error(`Tải lên thất bại (${xhr.status}). ${(xhr.responseText || '').slice(0, 200)}`));
      };
      xhr.onerror = () => reject(new Error('Lỗi mạng khi tải lên.'));
      xhr.send(file);
    });

  const onUpload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setMsg(isVideo ? 'Chọn video trước.' : 'Chọn ảnh trước.');
      return;
    }
    setBusy(true);
    setPct(0);
    setMsg(`Đang tải lên (${mb(file.size)}MB)...`);
    try {
      // 1. Xin URL ký sẵn từ máy chủ (dùng khóa service role, an toàn).
      const { path, uploadUrl } = await createAssetUploadUrl(file.name, kind);
      // 2. Trình duyệt PUT file thẳng lên Storage, có hiện phần trăm.
      await putWithProgress(uploadUrl, file);
      // 3. Ghi nhận vào brand_assets để hiện trong kho.
      setMsg('Đã tải xong, đang ghi nhận...');
      await registerAsset({ path, kind, title, license: 'owned' });
      setMsg('Đã tải lên xong. Chọn từ kho bên trên để gắn vào bài.');
      setPct(0);
      setTitle('');
      setFileName('');
      setFileSize(0);
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
        onChange={onPick}
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
        {busy ? `Đang tải... ${pct}%` : isVideo ? 'Tải video lên' : 'Tải ảnh lên'}
      </button>
      {busy && pct > 0 ? (
        <div className="uploadbar" aria-hidden="true">
          <span style={{ width: `${pct}%` }} />
        </div>
      ) : null}
      {fileName && !busy ? (
        <span className="muted">
          Đã chọn: {fileName} ({mb(fileSize)}MB)
        </span>
      ) : null}
      {msg ? <span className="muted">{msg}</span> : null}
    </div>
  );
}
