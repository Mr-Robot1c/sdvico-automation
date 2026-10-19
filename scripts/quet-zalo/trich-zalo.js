// trich-zalo.js — đoạn chạy TRONG TRANG chat.zalo.me (Claude in Chrome, javascript_tool) để đọc nhóm đang mở.
// 19/10/2026: thay phiên Claude trên laptop Windows (hỏng từ 09/10 vì giành phiên + đăng xuất) bằng phiên trên Mac mini.
// CHỈ ĐỌC: không gửi tin, không bấm gì trong hội thoại. Bí kíp chạy: scripts/quet-zalo/BI-KIP-QUET-ZALO.md.
//
// Cách dùng (dán cả file vào javascript_tool, rồi gọi):
//   await window.__zx.quetVaGiu({ cutoffTs: <ms>, maxRounds: 80 })  // cuộn ngược tới mốc, giữ kết quả trong trang
//   window.__zx.xuat(0), window.__zx.xuat(1)...                      // lấy từng khúc 60 dòng JSONL
// Bản ghi đúng dạng Zalo/zalo-messages.jsonl cũ: group, groupKey, ts, timeIso, sender, type, text, href
// (groupKey do gop-zalo.mjs gắn theo tên nhóm). Mã tin = mốc ms trong id "message-frame_<ms>".
(() => {
  const ME = 'Thanh Huynh';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const isoVN = (ts) => new Date(ts + 7 * 3600e3).toISOString().replace(/\.\d+Z$/, '+07:00');
  const clean = (s) => String(s || '').normalize('NFC').replace(/[\u200b\u200c\u200d\ufeff]/g, '').replace(/\u00a0/g, ' ').replace(/[ \t]+\n/g, '\n').trim();

  function groupName() {
    const t = document.querySelector('.threadChat__title');
    return t ? clean(t.innerText.split('\n')[0]) : null;
  }

  // Đo 19/10 trên nhóm Triển Khai Kinh Doanh: ảnh hiện bằng img.zimg-el với src "blob:" (không có link CDN như video,
  // tải bù không được), link là .link-message (tiêu đề + mô tả), file là .file-message__content-title.
  function mediaOf(frame) {
    const act = frame.querySelector('.message-action') || frame;
    // Video chỉ có ảnh thu nhỏ "blob:" và mã tin trong data-qid, link CDN chỉ có sau khi bấm phát (đo 19/10).
    const v = act.querySelector('video, .video-message__video-player, [class*="video-message__non-caption"]');
    if (v) return { type: 'video', href: v.currentSrc || v.src || null };
    const link = act.querySelector('.link-message');
    if (link) {
      const part = (s) => clean(link.querySelector(s)?.innerText);
      const a = link.querySelector('a[href^="http"]');
      return { type: 'link', href: a?.href || null, text: [part('.link-message__link-title'), part('.link-message__link-description'), part('.link-message__link-source')].filter(Boolean).join(' | ') || null };
    }
    const file = act.querySelector('.file-message__content-title');
    if (file) return { type: 'file', href: null, text: clean(file.innerText).replace(/\n+/g, '') };
    const img = [...act.querySelectorAll('img.zimg-el')].find((i) => !i.closest('.quoteMessage, .message-quote-fragment__container, .quote-banner-thumb-link'));
    if (img) return { type: 'image', href: /^https?:/.test(img.src) ? img.src : null };
    if (act.querySelector('[class*="sticker"]')) return { type: 'sticker', href: null };
    return null;
  }

  function textOf(frame) {
    const box = frame.querySelector('.text-message__container');
    if (!box) return '';
    const copy = box.cloneNode(true);
    copy.querySelectorAll('.message-quote-fragment__container').forEach((q) => q.remove());
    return clean(copy.innerText);
  }

  function collect(store) {
    const group = groupName();
    let lastSender = null;
    for (const f of document.querySelectorAll('.message-frame')) {
      const m = /message-frame_(\d{12,})/.exec(f.id || '');
      if (!m) continue;
      const ts = Number(m[1]);
      const item = f.closest('.chat-item');
      const own = f.querySelector('.message-sender-name-content .truncate, .message-sender-name-content');
      if (item && /\bme\b/.test(item.className)) lastSender = ME;
      else if (own) lastSender = clean(own.innerText);
      else if (item && !item.previousElementSibling?.classList?.contains('chat-item')) lastSender = null;
      const media = mediaOf(f);
      const text = media?.text || textOf(f) || null;
      if (/thu hồi/i.test(f.innerText) && !text) continue;
      const msgId = (f.querySelector('[data-qid]')?.getAttribute('data-qid') || '').split('@')[0] || null;
      const rec = { group, ts, timeIso: isoVN(ts), sender: lastSender, msgId, type: media?.type || (text ? (/^https?:\/\/\S+$/.test(text) ? 'link' : 'text') : 'other'), text, href: media?.href || null };
      const old = store.get(ts);
      if (!old || (!old.sender && rec.sender) || (!old.href && rec.href)) store.set(ts, old ? { ...old, ...Object.fromEntries(Object.entries(rec).filter(([, v]) => v)) } : rec);
    }
  }

  // Zalo chỉ nạp tin cũ khi có sự kiện wheel thật lên khung cuộn (đặt scrollTop=0 không ăn, bài học quet-zalo-ban-tin).
  async function scrollUpOnce() {
    const box = document.querySelector('#messageViewScroll')?.parentElement || document.querySelector('.message-view__scroll');
    let el = box;
    for (let i = 0; i < 4 && el; i++, el = el.parentElement) el.dispatchEvent(new WheelEvent('wheel', { deltaY: -3000, bubbles: true }));
    if (box) { box.scrollTop = 0; box.dispatchEvent(new Event('scroll', { bubbles: true })); }
    await sleep(1500);
  }

  async function quet({ cutoffTs, maxRounds = 80 } = {}) {
    const store = new Map();
    let stale = 0;
    for (let r = 0; r < maxRounds; r++) {
      const before = store.size;
      collect(store);
      const oldest = Math.min(...store.keys());
      if (cutoffTs && oldest <= cutoffTs) break;
      stale = store.size === before ? stale + 1 : 0;
      if (stale >= 4) break; // hết lịch sử hoặc Zalo không nạp thêm
      await scrollUpOnce();
    }
    collect(store);
    const rows = [...store.values()].filter((x) => !cutoffTs || x.ts > cutoffTs).sort((a, b) => a.ts - b.ts);
    const oldest = store.size ? Math.min(...store.keys()) : null;
    return { group: groupName(), count: rows.length, reachedCutoff: !cutoffTs || (oldest !== null && oldest <= cutoffTs), oldestSeen: oldest && isoVN(oldest), rows };
  }

  // Lấy kết quả lần quét gần nhất theo từng khúc (công cụ trả về có giới hạn độ dài): __zx.xuat(0), __zx.xuat(1)...
  // Mỗi khúc là các dòng JSONL, khúc rỗng là hết. Phiên Claude ghi nguyên văn ra kho/quet/<groupKey>-<ms>.jsonl.
  let last = null;
  async function quetVaGiu(opts) { last = await quet(opts); return { group: last.group, count: last.count, reachedCutoff: last.reachedCutoff, oldestSeen: last.oldestSeen, chunks: Math.ceil(last.rows.length / 60) }; }
  function xuat(i, size = 60) { return (last?.rows || []).slice(i * size, (i + 1) * size).map((x) => JSON.stringify(x)).join('\n'); }
  // Đưa kết quả ra ổ đĩa: trang tự tải file zalo-quet-<key>-<ms>.jsonl vào Downloads, rồi day-va-hoc.sh (bước gộp)
  // chuyển sang kho/quet. Đọc qua công cụ trình duyệt bị bộ lọc "query string" chặn khi tin có dấu "=" (đo 19/10),
  // nên dùng đường tải file. Brave phải TẮT "hỏi chỗ lưu trước khi tải" thì file mới tự lưu.
  function taiVe(key) {
    const body = (last?.rows || []).map((x) => JSON.stringify(x)).join('\n') + '\n';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([body], { type: 'application/x-ndjson' }));
    a.download = `zalo-quet-${key}-${Date.now()}.jsonl`;
    document.body.appendChild(a); a.click(); a.remove();
    return { file: a.download, rows: last?.rows?.length || 0 };
  }
  // Brave chặn tải tự động (gọi taiVe thẳng từ script) mà không báo gì; cú bấm chuột thật thì cho tải. Nên: nutLuu(key)
  // chèn nút "Lưu kết quả quét" giữa mép trên trang, trả toạ độ; phiên Claude bấm bằng computer left_click
  // (toạ độ ảnh chụp = x * 1512 / vw nếu ảnh chụp khung 1512 rộng), rồi kiểm ~/Downloads/zalo-quet-<key>-*.jsonl.
  function nutLuu(key) {
    document.getElementById('__zx_save')?.remove();
    const b = document.createElement('button');
    b.id = '__zx_save'; b.textContent = 'Lưu kết quả quét'; b.dataset.key = key;
    Object.assign(b.style, { position: 'fixed', top: '4px', left: '50%', zIndex: 999999, padding: '6px 14px', background: '#0068ff', color: '#fff', border: 0, borderRadius: '6px', fontSize: '14px' });
    b.onclick = () => { b.dataset.res = JSON.stringify(taiVe(b.dataset.key)); setTimeout(() => b.remove(), 500); };
    document.body.appendChild(b);
    const r = b.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), vw: innerWidth, vh: innerHeight };
  }
  window.__zx = { quet, quetVaGiu, xuat, taiVe, nutLuu, collect, groupName };
  return 'trich-zalo.js đã nạp';
})();
