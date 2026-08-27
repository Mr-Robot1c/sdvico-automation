'use client';
// UI danh sách NV kinh doanh (thay textarea đa dòng) — user 27/8: "vẫn chưa add được NV thứ 2,
// nó chỉ thay thế người trước". Root cause: textarea 1 dòng, user không biết phải bấm Enter
// xuống dòng để thêm NV mới. Nay tách thành list rõ: mỗi NV 2 input (Tên + SĐT) + nút X xóa,
// nút "➕ Thêm 1 NV" để add. Submit compose lại string mỗi-dòng-1-NV cho saveSalesZalo (server
// action giữ nguyên, không đụng).

import { useState, useRef } from 'react';
import { saveSalesZalo } from '../actions';

type Person = { name: string; phone: string };

export default function SalesZaloEditor({ initial }: { initial: Person[] }) {
  const [people, setPeople] = useState<Person[]>(initial.length ? initial : [{ name: '', phone: '' }]);
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState('');
  const formRef = useRef<HTMLFormElement>(null);

  const update = (idx: number, key: 'name' | 'phone', val: string) => {
    setPeople((prev) => prev.map((p, i) => (i === idx ? { ...p, [key]: val } : p)));
  };
  const add = () => setPeople((prev) => [...prev, { name: '', phone: '' }]);
  const remove = (idx: number) => setPeople((prev) => prev.filter((_, i) => i !== idx));

  const submit = async () => {
    if (pending) return;
    setPending(true);
    setMsg('');
    try {
      const fd = new FormData();
      // Compose lại format "Tên | SĐT" mỗi dòng cho saveSalesZalo (không đổi server action).
      const raw = people
        .map((p) => `${p.name.trim()} | ${p.phone.replace(/\D/g, '')}`)
        .filter((line) => line.split('|')[0].trim() && line.split('|')[1].trim())
        .join('\n');
      fd.set('people', raw);
      await saveSalesZalo(fd);
      const validCount = people.filter((p) => p.name.trim() && p.phone.replace(/\D/g, '')).length;
      setMsg(`✓ Đã lưu ${validCount} nhân viên.`);
      setTimeout(() => setMsg(''), 3000);
    } catch (e: any) {
      setMsg('⚠️ Lỗi: ' + (e?.message || 'không rõ'));
    } finally {
      setPending(false);
    }
  };

  return (
    <form ref={formRef} action={submit} style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'grid', gap: 8 }}>
        {people.map((p, idx) => (
          <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 180px auto', gap: 8, alignItems: 'center' }}>
            <input
              type="text"
              placeholder={`Tên NV ${idx + 1} (VD: Anh Bình)`}
              value={p.name}
              onChange={(e) => update(idx, 'name', e.target.value)}
              className="input"
              style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)' }}
              maxLength={100}
            />
            <input
              type="tel"
              placeholder="SĐT Zalo (VD: 0939123456)"
              value={p.phone}
              onChange={(e) => update(idx, 'phone', e.target.value)}
              className="input"
              style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)' }}
              maxLength={15}
            />
            <button
              type="button"
              onClick={() => remove(idx)}
              className="btn ghost sm"
              title="Xóa NV này khỏi danh sách"
              disabled={people.length === 1 && !p.name && !p.phone}
              style={{ padding: '4px 10px' }}
            >
              ✕ Xóa
            </button>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" onClick={add} className="btn ghost sm" disabled={people.length >= 10}>
          ➕ Thêm 1 NV
        </button>
        <button type="submit" className="btn ok sm" disabled={pending}>
          {pending ? '⏳ Đang lưu...' : '💾 Lưu danh sách'}
        </button>
        {msg ? <span className="sub" style={{ fontSize: '.85rem' }}>{msg}</span> : null}
        {people.length >= 10 ? <span className="sub" style={{ fontSize: '.75rem' }}>Tối đa 10 NV.</span> : null}
      </div>
    </form>
  );
}
