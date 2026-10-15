// 15/10 (tối ưu giao diện đợt 1): tín hiệu cho người duyệt, dùng chung Bảng bài viết và Hàng đợi duyệt.
// Rà soát 15/10 thấy bài được duyệt sau 34 giây: thẻ chỉ ghi "Cần rà lại" mà không nói rà gì, bài có video
// trông như bài chữ, lời đọc video không hiện ở đâu. Khối này hiện LÝ DO cờ (máy quét bắt được gì) và
// lời đọc từng cảnh, để người duyệt biết phải soi chỗ nào trước khi bấm.
import { COMPLIANCE_LABELS } from './labels';

export type FlagGroup = { key: string; label: string; items: string[] };

// Thứ tự hiện: nặng trước (chạm quy định), nhẹ sau (lỗi giọng văn).
const ORDER = ['regulation', 'domain', 'partner', 'unverifiedSpecs', 'testSpecs', 'style'];

// Mã playbook (compliance.mjs scanPlaybook) đổi thành chữ người duyệt hiểu.
function playbookText(code: string): string {
  if (code === 'no_question_cta') return 'Thiếu câu hỏi ở cuối bài';
  if (code === 'no_number') return 'Bài bán chưa có con số cụ thể';
  const m = code.match(/^hook_too_long_(\d+)w$/);
  if (m) return `Câu mở đầu dài ${m[1]} chữ (nên dưới 15 chữ)`;
  return code;
}

function strList(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => String(x ?? '').trim()).filter(Boolean) : [];
}

// Cờ máy quét từ payload.compliance (bài chữ) hoặc brief.video_compliance (lời đọc video).
// Nhóm rỗng bị bỏ; mục lặp trong một nhóm chỉ giữ một lần.
export function flagGroups(compliance: unknown): FlagGroup[] {
  if (!compliance || typeof compliance !== 'object') return [];
  const c = compliance as Record<string, unknown>;
  const out: FlagGroup[] = [];
  for (const key of ORDER) {
    const items = [...new Set(strList(c[key]))];
    if (items.length) out.push({ key, label: COMPLIANCE_LABELS[key] || key, items });
  }
  return out;
}

// Gợi ý soi bài (playbook) tách riêng vì không nâng mức rủi ro, chỉ nhắc.
export function playbookNotes(compliance: unknown): string[] {
  if (!compliance || typeof compliance !== 'object') return [];
  return [...new Set(strList((compliance as Record<string, unknown>).playbook).map(playbookText))];
}

export type Scene = { role: string; start: number; end: number; text: string; cut: boolean };

const ROLE_LABEL: Record<string, string> = { hook: 'Mở đầu', story: 'Thân bài', closing: 'Kết' };

// Lời đọc từng cảnh từ brief.video_timeline (build-video.mjs ghi). Chữ mỗi cảnh bị cắt ở 90 ký tự
// khi lưu, nên đánh dấu cut để giao diện ghi rõ "nghe đủ trong video".
export function videoScenes(brief: unknown): Scene[] {
  if (!brief || typeof brief !== 'object') return [];
  const tl = (brief as Record<string, unknown>).video_timeline;
  if (!Array.isArray(tl)) return [];
  return tl
    .map((s: any) => {
      const text = String(s?.text ?? '').trim();
      return {
        role: ROLE_LABEL[String(s?.role || '')] || 'Cảnh',
        start: Number(s?.start) || 0,
        end: Number(s?.end) || 0,
        text,
        cut: text.length >= 90,
      };
    })
    .filter((s) => s.text);
}

export function videoSeconds(scenes: Scene[]): number {
  return Math.round(scenes.reduce((m, s) => Math.max(m, s.end), 0));
}

const mmss = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

// Phiếu có mức rủi ro mà không lưu lý do (bài vòng xoay social.mjs, bản tin chỉ ghi risk): nói thật là máy
// không lưu cụm cụ thể và chỉ chỗ cần soi, thay vì để trơ nhãn "Cần rà lại".
export function missingReason(risk: unknown, generator: unknown): string {
  if (generator === 'ban-tin') return 'Bản tin thủy sản luôn chạm quy định nhà nước, cấp quản lý duyệt trước khi đăng (điều cấm 3).';
  if (risk === 'red') return 'Máy chấm chạm quy định nhà nước nhưng không lưu cụm cụ thể. Soi các đoạn nói về IUU, Cục Thủy sản, Kiểm ngư, mức phạt.';
  if (risk === 'amber') return 'Máy chấm cần rà nhưng không lưu lý do. Soi thông số, tên hãng đối tác và con số trong bài.';
  return '';
}

type FlagProps = { compliance: unknown; videoCompliance?: unknown; risk?: unknown; generator?: unknown };

// Dòng cờ gọn trên thẻ: mỗi nhóm một dòng "Nhóm: mục, mục". Không có cờ thì không vẽ gì.
export function CardFlags({ compliance, videoCompliance, risk, generator }: FlagProps) {
  const text = flagGroups(compliance);
  const voice = flagGroups(videoCompliance);
  const fallback = !text.length && !voice.length ? missingReason(risk, generator) : '';
  if (!text.length && !voice.length && !fallback) return null;
  return (
    <ul className="rv-flags" aria-label="Máy quét bắt được">
      {text.map((g) => (
        <li key={`t-${g.key}`} className={`rv-flag rv-${g.key}`}><b>{g.label}:</b> {g.items.join(', ')}</li>
      ))}
      {voice.map((g) => (
        <li key={`v-${g.key}`} className={`rv-flag rv-${g.key}`}><b>Lời đọc, {g.label.toLowerCase()}:</b> {g.items.join(', ')}</li>
      ))}
      {fallback ? <li className={`rv-flag ${risk === 'red' || generator === 'ban-tin' ? 'rv-regulation' : ''}`}>{fallback}</li> : null}
    </ul>
  );
}

// Khối đầu cửa sổ xem bài: cờ bài chữ, cờ lời đọc, gợi ý playbook.
export function ModalFlags(props: FlagProps) {
  const hasFlags = flagGroups(props.compliance).length > 0 || flagGroups(props.videoCompliance).length > 0
    || !!missingReason(props.risk, props.generator);
  const notes = playbookNotes(props.compliance);
  if (!hasFlags && !notes.length) return null;
  return (
    <div className="rv-modal-flags">
      {hasFlags ? (
        <>
          <b>Cần soi trước khi duyệt:</b>
          <CardFlags {...props} />
        </>
      ) : null}
      {notes.length ? <p className="rv-notes">Gợi ý sửa: {notes.join('; ')}.</p> : null}
    </div>
  );
}

// Video và lời đọc từng cảnh, đặt TRƯỚC caption trong cửa sổ xem bài. Không có video thì không vẽ gì.
export function VideoScript({ videoUrl, scenes, poster }: { videoUrl?: string | null; scenes: Scene[]; poster?: string | null }) {
  if (!videoUrl && !scenes.length) return null;
  const secs = videoSeconds(scenes);
  return (
    <section className="rv-video" aria-label="Video và lời đọc">
      <div className="rv-video-head">
        <b>Video{secs ? ` ${secs} giây` : ''}</b>
        <span className="sub">Xem hết và đọc lời đọc trước khi duyệt. Lời đọc hay bịa giờ giấc, con số, nhân vật.</span>
      </div>
      <div className="rv-video-body">
        {videoUrl ? (
          <div className="rv-video-player">
            {/* preload none: ViewModal gọi load() khi mở, tránh tải video của mọi thẻ cùng lúc. */}
            <video src={videoUrl} controls preload="none" playsInline poster={poster || undefined} />
            <a className="src" href={videoUrl} target="_blank" rel="noreferrer">Mở video ở tab mới</a>
          </div>
        ) : null}
        {scenes.length ? (
          <ol className="rv-scenes">
            {scenes.map((s, i) => (
              <li key={i}>
                <span className="rv-scene-at">{mmss(s.start)} {s.role}</span>
                <span className="rv-scene-text">{s.text}{s.cut ? '… (nghe đủ trong video)' : ''}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="muted">Bài này chưa lưu lời đọc từng cảnh, nghe trực tiếp trong video.</p>
        )}
      </div>
    </section>
  );
}
