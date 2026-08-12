'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createAssetUploadUrl, registerAsset } from '../actions';

// Tải tư liệu (ảnh, video, âm thanh, logo) THẲNG từ trình duyệt lên Supabase Storage qua URL ký sẵn.
// Không qua server action nên video lớn tải được (vượt giới hạn 4,5MB của Vercel). Giữ tên tệp gốc
// nếu không nhập tên.
function mb(bytes: number) {
  return (bytes / (1024 * 1024)).toFixed(1);
}

export default function LibUploader() {
  const [kind, setKind] = useState('image');
  const [title, setTitle] = useState('');
  const [license, setLicense] = useState('owned');
  const [source, setSource] = useState('');
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState(0);
  const [msg, setMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

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
      setMsg('Chọn file trước.');
      return;
    }
    setBusy(true);
    setPct(0);
    setMsg(`Đang tải lên (${mb(file.size)}MB)...`);
    try {
      const { path, uploadUrl } = await createAssetUploadUrl(file.name, kind);
      await putWithProgress(uploadUrl, file);
      setMsg('Đã tải xong, đang ghi nhận...');
      await registerAsset({ path, kind, title: title.trim() || file.name, license, source });
      setMsg('Đã tải tư liệu lên kho.');
      setPct(0);
      setTitle('');
      setSource('');
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
      <input ref={fileRef} type="file" aria-label="Chọn file" disabled={busy} />
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Tên tư liệu (để trống thì giữ tên tệp gốc)"
        aria-label="Tên"
        disabled={busy}
      />
      <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Loại" disabled={busy}>
        <option value="image">Ảnh</option>
        <option value="video">Clip</option>
        <option value="audio">Âm thanh</option>
        <option value="logo">Logo</option>
      </select>
      <select value={license} onChange={(e) => setLicense(e.target.value)} aria-label="Giấy phép" disabled={busy}>
        <option value="owned">Công ty sở hữu</option>
        <option value="licensed">Có giấy phép</option>
      </select>
      <input
        value={source}
        onChange={(e) => setSource(e.target.value)}
        placeholder="Nguồn (ai quay, ở đâu)"
        aria-label="Nguồn"
        disabled={busy}
      />
      <button className="btn ok" type="button" onClick={onUpload} disabled={busy}>
        {busy ? `Đang tải... ${pct}%` : 'Tải lên'}
      </button>
      {busy && pct > 0 ? (
        <div className="uploadbar" aria-hidden="true">
          <span style={{ width: `${pct}%` }} />
        </div>
      ) : null}
      {msg ? <span className="muted">{msg}</span> : null}
    </div>
  );
}
