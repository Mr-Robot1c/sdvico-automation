'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

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

export default function ShareGroups({
  postUrl,
  contentId = null,
}: {
  postUrl: string;
  contentId?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [groups, setGroups] = useState<SavedGroup[]>([]);
  const [newG, setNewG] = useState('');
  const [copied, setCopied] = useState(false);
  // User 26/8: bài đăng ngày nào -> chỉ hiện groups đã lên plan ngày đó. Toggle "Xem tất cả"
  // để override khi user muốn chia sẻ vào group ngoài plan (case ngoại lệ).
  const [showAll, setShowAll] = useState(false);
  type LotItem = SavedGroup & { sharedToday: { id: string; content_id: string | null; shared_at: string } | null; sharedThisPost: boolean; lastSharedAt: string | null; daysSince: number | null };
  const [lot, setLot] = useState<{ lotSize: number; doneToday: number; lot: LotItem[]; allGroups: LotItem[] } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const loadLot = async () => {
    try {
      const r = await fetch(`/api/share-groups/shares?content_id=${encodeURIComponent(contentId || '')}`, { cache: 'no-store' });
      if (r.ok) setLot(await r.json());
    } catch { /* giữ lô cũ */ }
  };
  useEffect(() => { if (open) loadLot(); }, [open]);
  // 12/9 (Thanh: "nút Đã chia không hoạt động"): trước đây bấm xong nút bị khóa cho tới khi POST + tải lại
  // lô trả về; máy chủ chậm hoặc treo là nút đứng im, không báo gì. Giờ: (1) đổi giao diện NGAY (lạc quan),
  // (2) gọi máy chủ có hạn 15 giây, (3) lỗi hay hết giờ thì trả lại như cũ và báo rõ, (4) không khóa nút
  // trong lúc tải lại lô, chỉ chặn bấm đúp cùng một nhóm.
  const fetchWithTimeout = async (input: RequestInfo, init: RequestInit, ms = 15000) => {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), ms);
    try { return await fetch(input, { ...init, signal: ctl.signal }); } finally { clearTimeout(t); }
  };
  const patchLot = (groupId: string, fn: (g: LotItem) => LotItem) => {
    setLot((prev) => {
      if (!prev) return prev;
      const map = (arr: LotItem[]) => arr.map((x) => (x.id === groupId ? fn(x) : x));
      const lotNext = map(prev.lot); const allNext = map(prev.allGroups);
      return { ...prev, lot: lotNext, allGroups: allNext, doneToday: lotNext.filter((x) => x.sharedToday).length };
    });
  };
  const inFlight = useRef<Set<string>>(new Set());
  const errText = (e: any) => (e?.name === 'AbortError' ? 'máy chủ không trả lời sau 15 giây' : (e?.message || 'lỗi mạng'));
  const markShared = async (g: LotItem) => {
    if (inFlight.current.has(g.id)) return;
    inFlight.current.add(g.id);
    setBusyId(g.id);
    const nowIso = new Date().toISOString();
    patchLot(g.id, (x) => ({ ...x, sharedToday: { id: 'tam', content_id: contentId, shared_at: nowIso }, sharedThisPost: true, lastSharedAt: nowIso, daysSince: 0 }));
    try {
      const r = await fetchWithTimeout('/api/share-groups/shares', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content_id: contentId, group_id: g.id, group_label: g.label, post_url: postUrl }),
      });
      if (!r.ok) {
        let msg = ''; try { msg = String((await r.json())?.error || ''); } catch { /* bỏ qua */ }
        throw new Error(r.status === 401 ? 'phiên đăng nhập hết hạn, tải lại trang rồi đăng nhập lại' : 'máy chủ trả ' + r.status + (msg ? ': ' + msg : ''));
      }
      const j = await r.json();
      if (j?.row?.id) patchLot(g.id, (x) => ({ ...x, sharedToday: { id: String(j.row.id), content_id: j.row.content_id ?? contentId, shared_at: String(j.row.shared_at || nowIso) } }));
      setBusyId(null);
      loadLot(); // đồng bộ nền, không khóa nút
    } catch (e: any) {
      patchLot(g.id, (x) => ({ ...x, sharedToday: g.sharedToday, sharedThisPost: g.sharedThisPost, lastSharedAt: g.lastSharedAt, daysSince: g.daysSince }));
      setBusyId(null);
      alert('Chưa ghi được lượt chia cho "' + g.label + '": ' + errText(e) + '. Bấm lại giúp em.');
    } finally { inFlight.current.delete(g.id); }
  };
  const undoShared = async (g: LotItem) => {
    if (!g.sharedToday || inFlight.current.has(g.id)) return;
    if (g.sharedToday.id === 'tam') { alert('Đang ghi lượt chia, chờ một chút rồi hoàn tác.'); return; }
    inFlight.current.add(g.id);
    setBusyId(g.id);
    const prevShared = g.sharedToday;
    patchLot(g.id, (x) => ({ ...x, sharedToday: null, sharedThisPost: false }));
    try {
      const r = await fetchWithTimeout('/api/share-groups/shares', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: prevShared.id }) });
      if (!r.ok) throw new Error('máy chủ trả ' + r.status);
      setBusyId(null);
      loadLot();
    } catch (e: any) {
      patchLot(g.id, (x) => ({ ...x, sharedToday: prevShared, sharedThisPost: g.sharedThisPost }));
      setBusyId(null);
      alert('Chưa hoàn tác được cho "' + g.label + '": ' + errText(e) + '. Bấm lại giúp em.');
    } finally { inFlight.current.delete(g.id); }
  };
  const fmtHHmm = (iso: string) => new Date(new Date(iso).getTime() + 7 * 3600 * 1000).toISOString().slice(11, 16);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const [mounted, setMounted] = useState(false);

  // Portal render lên body cần biết mounted (Next.js SSR không có document).
  useEffect(() => setMounted(true), []);

  // Tính vị trí popover theo button ref (fixed positioning, không bị table overflow cắt).
  // useLayoutEffect chạy sync trước paint để không nhấp nháy.
  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const update = () => {
      const r = btnRef.current!.getBoundingClientRect();
      const top = Math.round(r.bottom + 6);
      const right = Math.round(window.innerWidth - r.right);
      setPos({ top, right });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open]);
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
      const target = e.target as Node;
      // Bấm trong popover (portal) hoặc trong nút button đều KHÔNG đóng.
      const inPop = popRef.current && popRef.current.contains(target);
      const inBtn = btnRef.current && btnRef.current.contains(target);
      if (!inPop && !inBtn) {
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
    setGroups(next); saveGroupsServer(next); setNewG(''); loadLot();
  };
  const removeGroup = (id: string) => {
    const next = groups.filter((g) => g.id !== id);
    setGroups(next); saveGroupsServer(next); loadLot();
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

  const popContent = open && pos ? (
    <div
      ref={popRef}
      role="dialog"
      aria-label="Chia sẻ vào group"
      style={{
        position: 'fixed', top: pos.top, right: pos.right, zIndex: 9999,
        // 29/8 (user: "lỗi hiển thị màu"): --bg-1 KHÔNG tồn tại -> fallback #fff thắng luôn,
        // popover trắng giữa dark mode (cùng bệnh với popover TikTok đã fix). Var thật: --surface.
        background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 10,
        padding: 12, width: 360, boxShadow: '0 14px 42px rgba(0,0,0,.28)',
        color: 'var(--ink)',
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
            const items: LotItem[] = showAll
              ? (lot?.allGroups || groups.map((g) => ({ ...g, sharedToday: null, sharedThisPost: false, lastSharedAt: null, daysSince: null })))
              : (lot?.lot || []);
            const size = lot?.lotSize ?? 8;
            const done = lot?.doneToday ?? 0;
            const renderRow = (g: LotItem) => {
              const otherPostToday = !!g.sharedToday && !g.sharedThisPost;
              return (
                <li key={g.id} style={{ display: 'flex', gap: 4, alignItems: 'center', opacity: otherPostToday ? 0.55 : 1 }}>
                  <input
                    value={g.label}
                    onChange={(e) => renameGroup(g.id, e.target.value)}
                    onBlur={commitRename}
                    placeholder="Đặt tên gợi nhớ..."
                    style={{ flex: 1, minWidth: 0, padding: '4px 6px', border: '1px solid var(--line)', borderRadius: 4, fontSize: 12, background: 'var(--surface)', color: 'var(--ink)' }}
                    title={`ID: ${g.id}${g.lastSharedAt ? ` · chia lần cuối ${g.daysSince === 0 ? 'hôm nay' : `${g.daysSince} ngày trước`}` : ' · chưa chia lần nào'}`}
                  />
                  {showAll ? (
                    <span className="sub" style={{ fontSize: 10, whiteSpace: 'nowrap' }}>
                      {g.lastSharedAt ? (g.daysSince === 0 ? 'hôm nay' : `${g.daysSince} ngày`) : 'chưa chia'}
                    </span>
                  ) : null}
                  <a className="btn ok sm" href={g.url} target="_blank" rel="noreferrer" title="Mở group (đã copy link ở trên, dán vào ô Tạo bài viết)">Mở</a>
                  {otherPostToday ? (
                    <span className="sub" style={{ fontSize: 10, whiteSpace: 'nowrap' }} title="Mỗi group mỗi ngày 1 bài">đã nhận bài khác hôm nay</span>
                  ) : g.sharedThisPost && g.sharedToday ? (
                    <>
                      <span className="badge tone-ok" style={{ fontSize: 10 }}>✓ {fmtHHmm(g.sharedToday.shared_at)}</span>
                      <button type="button" className="btn ghost sm" disabled={busyId === g.id} onClick={() => undoShared(g)} title="Bấm nhầm thì hoàn tác">Hoàn tác</button>
                    </>
                  ) : (
                    <button type="button" className="btn sm" disabled={busyId === g.id} onClick={() => markShared(g)} title="Đã dán link và bấm Post trong group này">✓ Đã chia</button>
                  )}
                  <button type="button" className="btn no sm" onClick={() => removeGroup(g.id)} aria-label="Xoá" title="Xoá khỏi danh sách">✕</button>
                </li>
              );
            };
            return (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, gap: 8 }}>
                  <div style={{ fontSize: 12, color: 'var(--ink-2)' }}>
                    {showAll ? <>Tất cả group ({groups.length}):</> : <>📣 <b>Lô hôm nay: đã chia {done}/{size} nhóm</b></>}
                  </div>
                  <button type="button" onClick={() => setShowAll(!showAll)} className="btn ghost sm" style={{ padding: '2px 8px', fontSize: 11 }}
                    title={showAll ? 'Về lô hôm nay' : 'Hiện tất cả group kèm ngày chia gần nhất'}>
                    {showAll ? `📣 Lô hôm nay (${size})` : `👁 Xem tất cả (${groups.length})`}
                  </button>
                </div>
                {!showAll ? (
                  <p className="sub" style={{ margin: '0 0 6px', fontSize: 11 }}>
                    Mỗi ngày {size} nhóm, mỗi nhóm 1 bài, xoay đều để 7 ngày phủ hết. Dán link, bấm Post trong group rồi bấm ✓ Đã chia.
                  </p>
                ) : null}
                {items.length === 0 ? (
                  <p className="sub" style={{ margin: '0 0 8px' }}>{groups.length ? 'Đang tải lô hôm nay...' : 'Chưa có group nào. Thêm bên dưới.'}</p>
                ) : (
                  <ul style={{ listStyle: 'none', margin: '0 0 8px', padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {items.map(renderRow)}
                  </ul>
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
  ) : null;

  return (
    <span style={{ display: 'inline-block' }}>
      {/* 30/8 gộp nút: nằm trong hàng "📘 Facebook" nên nhãn rút gọn, bỏ marginLeft (hàng flex gap đều). */}
      <button
        ref={btnRef}
        type="button"
        className="btn ghost sm"
        onClick={() => setOpen((v) => !v)}
        title="Chia sẻ bài vào các group Facebook (rút gọn thao tác copy link + mở group)"
      >
        📣 Chia sẻ group
      </button>
      {mounted && popContent ? createPortal(popContent, document.body) : null}
    </span>
  );
}
