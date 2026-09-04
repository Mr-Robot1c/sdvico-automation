'use client';

import { useEffect, useRef, useState } from 'react';
import { decideForm } from './actions';

// Ô ghi chú, ô hẹn giờ đăng (không bắt buộc) và hai nút quyết.
// Hẹn giờ: để trống -> đăng ngay khi bấm Duyệt. Có giờ -> Facebook nhận scheduled_publish_time,
// tự đăng đúng giờ (FB yêu cầu tối thiểu 10 phút, tối đa 6 tháng kể từ hiện tại).
// Từ chối là hành động khó lấy lại, hỏi lại một lần trước khi gửi.
// Đổi giá trị datetime-local ("YYYY-MM-DDTHH:mm") thành chuỗi tiếng Việt dễ đọc để user
// kiểm lại (tránh nhầm AM/PM: 12:00 AM là 0h khuya, không phải 12h trưa).
function humanVN(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const y = d.getFullYear();
  const buoi = d.getHours() < 5 ? 'khuya' : d.getHours() < 11 ? 'sáng' : d.getHours() < 13 ? 'trưa' : d.getHours() < 18 ? 'chiều' : 'tối';
  return `${hh}:${mm} ${buoi} ${dd}/${mo}/${y}`;
}

// Nhãn tiếng Việt cho các mức riêng tư TikTok trả về trong creator_info.
const PRIVACY_LABEL: Record<string, string> = {
  PUBLIC_TO_EVERYONE: 'Công khai (mọi người xem)',
  MUTUAL_FOLLOW_FRIENDS: 'Bạn bè (theo dõi lẫn nhau)',
  FOLLOWER_OF_CREATOR: 'Người theo dõi tôi',
  SELF_ONLY: 'Chỉ mình tôi (riêng tư)',
};

type CreatorInfo = {
  ok: boolean;
  nickname?: string | null;
  privacyOptions?: string[];
  commentDisabled?: boolean;
  duetDisabled?: boolean;
  stitchDisabled?: boolean;
  error?: string;
};

// MÀN COMPOSER TIKTOK (yêu cầu audit): trước khi đăng, người duyệt thấy rõ video + caption sẽ đăng,
// tự chọn mức riêng tư (đổ từ creator_info, không bịa), và câu thông báo nội dung sẽ lên TikTok.
// Giá trị chọn đi kèm form qua input ẩn name="tiktok_privacy".
function TiktokComposer({ videoUrl, caption }: { videoUrl?: string | null; caption?: string | null }) {
  const [info, setInfo] = useState<CreatorInfo | null>(null);
  const [privacy, setPrivacy] = useState<string>('');
  const zoomRef = useRef<HTMLDialogElement | null>(null);
  const [zoomOpen, setZoomOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch('/api/tiktok/creator-info', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: CreatorInfo | null) => {
        if (!alive || !j) { setInfo({ ok: false, error: 'không gọi được creator_info' }); return; }
        setInfo(j);
        const opts = j.privacyOptions || [];
        // Mặc định: Công khai nếu đã audit; chưa thì để RIÊNG TƯ cho an toàn (người duyệt tự nâng lên
        // Followers/Bạn bè nếu muốn). Không mặc định mức rộng hơn để tránh lỡ đăng công khai ngoài ý.
        setPrivacy(
          opts.includes('PUBLIC_TO_EVERYONE') ? 'PUBLIC_TO_EVERYONE'
            : opts.includes('SELF_ONLY') ? 'SELF_ONLY'
              : opts[0] || 'SELF_ONLY'
        );
      })
      .catch(() => { if (alive) setInfo({ ok: false, error: 'lỗi mạng' }); });
    return () => { alive = false; };
  }, []);

  const opts = info?.ok ? info.privacyOptions || [] : [];
  const onlySelf = opts.length > 0 && !opts.includes('PUBLIC_TO_EVERYONE');

  return (
    <div className="tt-composer">
      <div className="tt-head">🎵 <b>Đăng lên TikTok</b></div>
      {/* Xác nhận rõ NỘI DUNG sẽ đăng (bắt buộc cho audit): video trái, mô tả phải. */}
      <div className="tt-body">
        {videoUrl ? (
          <div className="tt-prev-wrap">
            <video className="tt-prev" src={`${videoUrl}#t=2`} controls preload="metadata" />
            <button
              type="button"
              className="tt-zoom"
              title="Xem to"
              aria-label="Xem video to"
              onClick={() => { setZoomOpen(true); requestAnimationFrame(() => zoomRef.current?.showModal()); }}
            >🔍</button>
            <dialog
              ref={zoomRef}
              className="tt-zoom-dlg"
              onClose={() => setZoomOpen(false)}
              onClick={(e) => { if ((e.target as HTMLElement).tagName === 'DIALOG') zoomRef.current?.close(); }}
            >
              {zoomOpen ? (
                <>
                  <video src={`${videoUrl}#t=2`} controls autoPlay playsInline />
                  <button type="button" className="tt-zoom-x" aria-label="Đóng" onClick={() => zoomRef.current?.close()}>×</button>
                </>
              ) : null}
            </dialog>
          </div>
        ) : null}
        <div className="tt-body-text">
          {caption ? <p className="tt-cap">{caption}</p> : null}
          <p className="tt-disc">Video và mô tả sẽ được đăng lên tài khoản TikTok{info?.nickname ? ` @${info.nickname}` : ' của SDVICO'}.</p>
        </div>
      </div>

      {!info ? (
        <p className="sub">Đang lấy cài đặt tài khoản TikTok…</p>
      ) : !info.ok ? (
        <>
          <p className="sub err-note">Chưa lấy được cài đặt TikTok ({info.error || 'chưa nối tài khoản'}). Bài vẫn duyệt được; TikTok sẽ bỏ qua nếu chưa nối.</p>
          <input type="hidden" name="tiktok_privacy" value="" />
        </>
      ) : (
        <>
          <label className="tt-priv">
            <span>Ai xem được:</span>
            <select name="tiktok_privacy" value={privacy} onChange={(e) => setPrivacy(e.target.value)}>
              {opts.map((o) => (
                <option key={o} value={o}>{PRIVACY_LABEL[o] || o}</option>
              ))}
            </select>
          </label>
          {/* Tôn trọng cài đặt tài khoản: nêu rõ mục nào bị khóa (audit soi điểm này). */}
          {(info.commentDisabled || info.duetDisabled || info.stitchDisabled) ? (
            <p className="sub">Tài khoản đang tắt: {[info.commentDisabled && 'bình luận', info.duetDisabled && 'duet', info.stitchDisabled && 'stitch'].filter(Boolean).join(', ')}.</p>
          ) : null}
          {onlySelf ? (
            <p className="sub">Chưa có mục "Công khai" vì app chưa qua audit TikTok (hiện chỉ đăng được cho Người theo dõi, Bạn bè hoặc Riêng tư). Sau khi audit đậu sẽ có "Công khai (mọi người)".</p>
          ) : null}
        </>
      )}
    </div>
  );
}

export default function DecideActions({
  id,
  title,
  hasTiktok = false,
  videoUrl = null,
  caption = null,
  defaultSchedule = '',
}: {
  id: string;
  title: string;
  hasTiktok?: boolean;
  videoUrl?: string | null;
  caption?: string | null;
  defaultSchedule?: string;
}) {
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  // 4/9: Lịch đăng cố định điền sẵn giờ ô (payload.plan_time) khi còn ≥ 15 phút; người duyệt
  // vẫn xóa/đổi được, để trống = đăng ngay. hang-doi/page.tsx không truyền prop → mặc định rỗng.
  const [schedule, setSchedule] = useState(defaultSchedule);
  const preview = humanVN(schedule);

  return (
    <form
      className="decide-wrap"
      action={decideForm}
      onSubmit={(e) => {
        const action = (e.nativeEvent as SubmitEvent).submitter?.getAttribute('value');
        // Bỏ popup xác nhận Từ chối (user 19/8: "bấm popup mỗi lần tốn thời gian").
        // Từ chối chỉ đánh dấu bản ghi rejected trong hàng đợi, KHÔNG xoá dữ liệu, KHÔNG đăng gì
        // -> có thể mở lại từ Vận hành nếu lỡ bấm nhầm; hỏi lại mỗi lần là dư thừa.
        if (action === 'approve' && schedule) {
          const t = new Date(schedule).getTime();
          const now = Date.now();
          const min = now + 11 * 60 * 1000;
          const max = now + 180 * 24 * 60 * 60 * 1000;
          if (t < min) {
            const chosen = humanVN(schedule);
            const nowStr = humanVN(new Date(now - now % 60000).toISOString().slice(0, 16));
            alert(`Giờ hẹn "${chosen}" đã qua hoặc quá gần.\n\nHiện tại: ${nowStr}.\n\nHẹn ít nhất 11 phút sau hiện tại. Lưu ý: 12:00 AM = 0h khuya (không phải trưa), 12:00 PM = 12h trưa.`);
            e.preventDefault();
            return;
          }
          if (t > max) {
            alert('Facebook chỉ cho hẹn tối đa 6 tháng.');
            e.preventDefault();
            return;
          }
        }
        setBusy(action as 'approve' | 'reject');
      }}
    >
      <input type="hidden" name="id" value={id} />
      {/* TiktokComposer bỏ (user 26/8): TikTok API không post được cho account public
          của unaudited app SDVICO. Flow mới = Xuất tay ở /noi-dung sau khi bài đăng. */}
      <div className="row">
        <input className="note" name="note" placeholder="Ghi chú (không bắt buộc)" aria-label="Ghi chú" />
        <label className="schedule-lbl" title="Để trống = đăng ngay khi bấm Duyệt. Có giờ = Facebook tự đăng đúng giờ hẹn. Lưu ý AM = sáng/khuya, PM = trưa/chiều/tối.">
          <span aria-hidden="true">⏰</span>
          <input
            type="datetime-local"
            name="scheduled_at"
            value={schedule}
            onChange={(e) => setSchedule(e.target.value)}
            aria-label="Hẹn giờ đăng (không bắt buộc). AM = sáng, PM = chiều tối"
          />
          {preview ? <span className="schedule-preview">→ {preview}</span> : null}
        </label>
        <button className="btn ok" name="action" value="approve" disabled={busy !== null}>
          {busy === 'approve' ? (schedule ? 'Đang hẹn...' : 'Đang duyệt...') : (schedule ? 'Duyệt + Hẹn giờ' : 'Duyệt')}
        </button>
        <button className="btn no" name="action" value="reject" disabled={busy !== null}>
          {busy === 'reject' ? 'Đang từ chối...' : 'Từ chối'}
        </button>
      </div>
    </form>
  );
}
