'use client';

import { useEffect, useRef, useState } from 'react';

// Nut "Chia se vao group" cho bai da dang len Facebook Page (user 20/8: Groups API bi Meta dong
// tu 2020 -> khong the tu dong post vao group; giai phap: rut gon con 2 click/group). Bam nut:
// - Hop popover hien LINK bai Post + nut Copy (auto sao chep san sang dan)
// - Danh sach GROUP: tu 20/8 luu SERVER (app_config 'mkt_share_groups' qua /api/share-groups)
//   de dung CHUNG voi lich chia se theo ngay o trang Ke hoach (truoc luu localStorage rieng ->
//   hai noi lech nhau, user bao "nhom cua t dang bi sai"). localStorage cu duoc MIGRATE len
//   server mot lan khi server con trong.
// - Moi group co nut "Mo group" (target=_blank) + nut "X" xoa. O nhap them group moi bat ky.
// Luong 2 click/group: (1) Copy link; (2) Bam "Mo group" -> paste + Post.
type SavedGroup = { id: string; label: string; url: string };

const KEY = 'fb_share_groups'; // localStorage cu — chi con dung de migrate

async function loadGroupsServer(): Promise<SavedGroup[]> {
  try {
    const r = await fetch('/api/share-groups', { cache: 'no-store' });
    if (!r.ok) return [];
    const j = await r.json();
    return Array.isArray(j?.groups) ? j.groups : [];
  } catch { return []; }
}
async function saveGroupsServer(gs: SavedGroup[]) {
  try {
    await fetch('/api/share-groups', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groups: gs }),
    });
  } catch { /* bo qua — lan luu sau se ghi lai */ }
}
function loadGroupsLocal(): SavedGroup[] {
  try { const s = localStorage.getItem(KEY); return s ? JSON.parse(s) : []; } catch { return []; }
}
function normalizeGroupUrl(input: string): { id: string; url: string } | null {
  const t = input.trim(); if (!t) return null;
  // Chap nhan: URL day du, hoac chi id, hoac /groups/xxxx
  const m = t.match(/facebook\.com\/groups\/([^/?#]+)/i) || t.match(/^\/?groups\/([^/?#]+)/i);
  const id = m ? m[1] : /^[a-z0-9._-]+$/i.test(t) ? t : null;
  if (!id) return null;
  return { id, url: `https://www.facebook.com/groups/${id}` };
}

// Chuẩn hoá tên group để so khớp fuzzy với plan groups (user gõ tên trong /ke-hoach có thể
// khác cách viết trong ShareGroups: hoa/thường, dấu, punctuation). Lowercase + bỏ dấu câu.
function norm(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}
function matchesPlan(groupLabel: string, planNames: string[]): boolean {
  if (!planNames.length) return true; // không có plan -> hiện tất cả
  const gl = norm(groupLabel);
  if (!gl) return false;
  return planNames.some((pn) => {
    const pnn = norm(pn);
    return pnn && (gl.includes(pnn) || pnn.includes(gl));
  });
}

export default function ShareGroups({
  postUrl,
  planGroupsToday = [],
}: {
  postUrl: string;
  planGroupsToday?: string[];
}) {
  const [open, setOpen] = useState(false);
  const [groups, setGroups] = useState<SavedGroup[]>([]);
  const [newG, setNewG] = useState('');
  const [copied, setCopied] = useState(false);
  // User 26/8: bài đăng ngày nào -> chỉ hiện groups đã lên plan ngày đó. Toggle "Xem tất cả"
  // để override khi user muốn chia sẻ vào group ngoài plan (case ngoại lệ).
  const [showAll, setShowAll] = useState(false);
  const popRef = useRef<HTMLDivElement | null>(null);
  // Ref giữ bản groups MỚI NHẤT cho các chỗ lưu chạy ngoài vòng render (timer, đóng popover)
  // — closure cũ từng lưu thiếu ký tự cuối khi gõ nhanh rồi bấm ra ngoài.
  const groupsRef = useRef<SavedGroup[]>(groups);
  useEffect(() => { groupsRef.current = groups; }, [groups]);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      let gs = await loadGroupsServer();
      // Migrate mot lan: server trong ma localStorage co nhom that -> day len server.
      if (!gs.length) {
        const local = loadGroupsLocal();
        if (local.length) { gs = local; await saveGroupsServer(local); }
      }
      if (alive) setGroups(gs);
    })();
    return () => { alive = false; };
  }, []);
  // Dong khi bam ra ngoai popover. LUU TEN TRUOC khi dong (user 21/8: "doi ten group het
  // duoc") — mousedown ngoai lam popover unmount TRUOC khi input kip blur, nen onBlur khong
  // bao gio chay va ten moi go bi roi mat.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) {
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveGroupsServer(groupsRef.current);
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const doCopy = async () => {
    try {
      await navigator.clipboard.writeText(postUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* bo qua */ }
  };
  const addGroup = async () => {
    const norm = normalizeGroupUrl(newG);
    if (!norm) { alert('Không nhận ra link/ID group. Ví dụ: https://www.facebook.com/groups/ngudan.vungtau hoặc ngudan.vungtau'); return; }
    if (groups.some((g) => g.id === norm.id)) { setNewG(''); return; }
    // Thu lay ten group qua Graph API (Meta hay chan Groups API tu 2020; fail -> giu ID lam ten).
    let label = norm.id;
    try {
      const r = await fetch(`/api/fb-group-name?id=${encodeURIComponent(norm.id)}`, { cache: 'no-store' });
      if (r.ok) { const j = await r.json(); if (j?.name) label = String(j.name).slice(0, 60); }
    } catch { /* giu ID */ }
    const next = [...groups, { id: norm.id, label, url: norm.url }];
    setGroups(next); saveGroupsServer(next); setNewG('');
  };
  const removeGroup = (id: string) => {
    const next = groups.filter((g) => g.id !== id);
    setGroups(next); saveGroupsServer(next);
  };
  // Go ten: doi state ngay, LUU SERVER sau 800ms ngung go (debounce — tranh moi phim 1 POST,
  // route con lam moi de xuat song). Blur hoac dong popover thi luu lien khong cho.
  const renameGroup = (id: string, label: string) => {
    setGroups((prev) => {
      const next = prev.map((g) => (g.id === id ? { ...g, label: label || g.id } : g));
      groupsRef.current = next;
      return next;
    });
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveGroupsServer(groupsRef.current), 800);
  };
  const commitRename = () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveGroupsServer(groupsRef.current);
  };

  return (
    <span style={{ marginLeft: 8, position: 'relative', display: 'inline-block' }} ref={popRef}>
      <button
        type="button"
        className="btn ghost sm"
        onClick={() => setOpen((v) => !v)}
        title="Chia sẻ vào group (rút gọn thao tác)"
      >
        📣 Chia sẻ vào group
      </button>
      {open ? (
        <div
          role="dialog"
          aria-label="Chia sẻ vào group"
          style={{
            position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 100,
            background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 10,
            padding: 12, width: 360, boxShadow: '0 10px 28px rgba(0,0,0,.18)'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ fontSize: 12, color: 'var(--ink-2)', marginBottom: 8 }}>
            Facebook không cho tự đăng vào group qua API. Rút gọn:
            <b> (1) Copy link → (2) mở group → dán + Post</b>.
          </div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            <input
              readOnly
              value={postUrl}
              onFocus={(e) => e.target.select()}
              style={{ flex: 1, minWidth: 0, padding: '6px 8px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 12, fontFamily: 'monospace', background: 'var(--surface-2)', color: 'var(--ink)' }}
            />
            <button type="button" className={`btn sm ${copied ? 'ok' : ''}`} onClick={doCopy}>
              {copied ? '✓ Đã copy' : 'Copy'}
            </button>
          </div>
          {(() => {
            // Filter theo plan groups của ngày bài đăng: chỉ hiện groups có label khớp plan
            // (fuzzy match); không có plan hoặc user bật "Xem tất cả" -> hiện hết.
            const hasPlan = planGroupsToday.length > 0;
            const filtered = hasPlan && !showAll
              ? groups.filter((g) => matchesPlan(g.label, planGroupsToday))
              : groups;
            const hidden = groups.length - filtered.length;
            return (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, gap: 8 }}>
                  <div style={{ fontSize: 12, color: 'var(--ink-2)' }}>
                    {hasPlan && !showAll
                      ? <>📋 <b>Groups theo kế hoạch hôm nay:</b></>
                      : <>Group của bạn:</>}
                  </div>
                  {hasPlan ? (
                    <button
                      type="button"
                      onClick={() => setShowAll(!showAll)}
                      className="btn ghost sm"
                      style={{ padding: '2px 8px', fontSize: 11 }}
                      title={showAll ? 'Chỉ hiện groups đã lên plan hôm nay' : 'Hiện tất cả groups (kể cả ngoài plan)'}
                    >
                      {showAll ? `📋 Theo plan (${groups.length - hidden})` : `👁 Xem tất cả (${groups.length})`}
                    </button>
                  ) : null}
                </div>
                {hasPlan && !showAll && hidden > 0 ? (
                  <p className="sub" style={{ margin: '0 0 6px', fontSize: 11, color: 'var(--ink-2)' }}>
                    Ẩn {hidden} group ngoài plan hôm nay. Plan có: <i>{planGroupsToday.join(', ')}</i>
                  </p>
                ) : null}
                {filtered.length === 0 ? (
                  hasPlan && groups.length > 0 ? (
                    <p className="sub" style={{ margin: '0 0 8px' }}>
                      Không có group nào trong plan hôm nay khớp với danh sách bên dưới. Bấm "Xem tất cả" để hiện tất cả groups.
                    </p>
                  ) : (
                    <p className="sub" style={{ margin: '0 0 8px' }}>Chưa có group nào. Thêm bên dưới.</p>
                  )
                ) : (
                  <>
                    <p className="sub" style={{ margin: '0 0 6px', fontSize: 11 }}>💡 Bấm vào ô tên để đặt lại (Meta chặn API lấy tên group tự động).</p>
                    <ul style={{ listStyle: 'none', margin: '0 0 8px', padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {filtered.map((g) => (
                <li key={g.id} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <input
                    value={g.label}
                    onChange={(e) => renameGroup(g.id, e.target.value)}
                    onBlur={commitRename}
                    placeholder="Đặt tên gợi nhớ..."
                    style={{ flex: 1, minWidth: 0, padding: '4px 6px', border: '1px solid var(--line)', borderRadius: 4, fontSize: 12, background: 'var(--surface)', color: 'var(--ink)', fontStyle: g.label === g.id ? 'italic' : 'normal', opacity: g.label === g.id ? 0.8 : 1 }}
                    title={`ID: ${g.id} — ${g.url}
Bấm để đặt tên gợi nhớ`}
                  />
                  <a className="btn ok sm" href={g.url} target="_blank" rel="noreferrer" title="Mở group (đã copy link ở trên, dán vào ô Tạo bài viết)">Mở</a>
                  <button type="button" className="btn no sm" onClick={() => removeGroup(g.id)} aria-label="Xoá" title="Xoá khỏi danh sách">✕</button>
                </li>
              ))}
                    </ul>
                  </>
                )}
              </>
            );
          })()}
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              placeholder="Dán link group hoặc ID (vd ngudan.vungtau)"
              value={newG}
              onChange={(e) => setNewG(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addGroup(); } }}
              style={{ flex: 1, minWidth: 0, padding: '6px 8px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 12, background: 'var(--surface)', color: 'var(--ink)' }}
            />
            <button type="button" className="btn ok sm" onClick={addGroup}>Thêm</button>
          </div>
        </div>
      ) : null}
    </span>
  );
}
