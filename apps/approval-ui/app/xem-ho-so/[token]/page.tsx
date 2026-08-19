// Trang PUBLIC (không cần đăng nhập) cho sếp xem CV + ra quyết định phỏng vấn.
// HR tạo link ở /ho-so, copy gửi sếp qua chat. Token 48 ký tự random, hết hạn 7 ngày.
// Sau khi sếp bấm quyết → token revoke, link không dùng lại.
//
// Điều cấm 6: link công khai nên vẫn cần cân nhắc — HR chỉ gửi qua kênh nội bộ (Zalo/Slack).
// Người dùng đã chọn "hiện đầy đủ contact" — email/sđt ứng viên hiện luôn để sếp tự chủ động.

import { getServerClient } from '../../../lib/supabase-server';
import BossDecisionForm from './boss-decision-form';

export const dynamic = 'force-dynamic';

type CvJson = { raw_text?: string; address?: string; source_message?: { subject?: string } };
type ScoreJson = { diem_tung_truc?: Record<string, unknown> };

const shell = { maxWidth: 780, margin: '0 auto', padding: '28px 20px 48px' } as const;
const card = { background: '#fff', border: '1px solid #dbe5f1', borderRadius: 16, padding: 24, marginTop: 16 } as const;

function Header() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 26, fontWeight: 800, letterSpacing: 1, color: '#0b4da2' }}>SDVICO</span>
      <span style={{ fontSize: 14, color: '#5b6b7f' }}>Phòng Nhân sự · Công ty Hiệp Lực Phát Triển Việt</span>
    </div>
  );
}

function ErrorCard({ title, message }: { title: string; message: string }) {
  return (
    <main style={shell}>
      <Header />
      <div style={card}>
        <h1 style={{ fontSize: 22, margin: '0 0 8px' }}>{title}</h1>
        <p style={{ color: '#5b6b7f', margin: 0 }}>{message}</p>
      </div>
    </main>
  );
}

export default async function Page({ params }: { params: { token: string } }) {
  const token = params.token;
  const client = getServerClient();

  const { data: app } = await client
    .from('hr_applications')
    .select('id, stage, candidate_id, job_id, review_token_expires_at, boss_reviewed_at, boss_decision, note, score_json, summary, strengths, clarifications')
    .eq('review_token', token)
    .maybeSingle();

  if (!app) {
    return <ErrorCard title="Link không hợp lệ" message="Link xem hồ sơ này không đúng hoặc đã bị thu hồi. Vui lòng liên hệ Phòng Nhân sự để được gửi lại." />;
  }
  if (!app.review_token_expires_at || new Date(app.review_token_expires_at) < new Date()) {
    return <ErrorCard title="Link đã hết hạn" message="Link này đã quá 7 ngày và đã hết hiệu lực. Liên hệ Phòng Nhân sự để tạo link mới." />;
  }
  if (app.boss_reviewed_at) {
    const label = app.boss_decision === 'interview' ? 'hẹn phỏng vấn' : app.boss_decision === 'reject' ? 'không phù hợp' : 'chờ thêm thông tin';
    return <ErrorCard title="Bạn đã xử lý hồ sơ này" message={`Quyết định đã ghi nhận: ${label}. Phòng Nhân sự đang xử lý bước tiếp theo. Nếu cần đổi quyết định, liên hệ Phòng Nhân sự.`} />;
  }

  // Load candidate + job title.
  const { data: cand } = await client
    .from('hr_candidates')
    .select('full_name, email, phone, source, cv_json, created_at')
    .eq('id', app.candidate_id)
    .maybeSingle();
  if (!cand) return <ErrorCard title="Hồ sơ không tồn tại" message="Ứng viên đã bị xóa hoặc không có dữ liệu." />;

  let jobTitle = '';
  if (app.job_id) {
    const { data: job } = await client.from('hr_jobs').select('title').eq('id', app.job_id).maybeSingle();
    jobTitle = (job?.title as string) || '';
  }

  const cvJson = (cand.cv_json || {}) as CvJson;
  const rawText = (cvJson.raw_text || '').trim();
  const address = cvJson.address || '';
  const subject = cvJson.source_message?.subject || '';

  const scoreJson = (app.score_json || {}) as ScoreJson;
  const axes = (scoreJson.diem_tung_truc || {}) as Record<string, number>;
  const strengths = (Array.isArray(app.strengths) ? app.strengths : []) as string[];
  const clarifications = (Array.isArray(app.clarifications) ? app.clarifications : []) as string[];

  return (
    <main style={shell}>
      <Header />

      <div style={card}>
        <h1 style={{ fontSize: 24, margin: '0 0 6px', color: '#06264d' }}>Xem hồ sơ ứng viên</h1>
        <p style={{ color: '#5b6b7f', margin: 0, fontSize: 14 }}>
          Bạn đang xem qua link do Phòng Nhân sự cấp. Chọn 1 trong 3 quyết định ở cuối trang.
          Sau khi bấm, link này sẽ được thu hồi và HR sẽ liên hệ ứng viên theo quyết định của bạn.
        </p>
      </div>

      <div style={card}>
        <h2 style={{ fontSize: 18, margin: '0 0 12px', color: '#06264d' }}>Thông tin ứng viên</h2>
        <dl style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: '8px 16px', margin: 0 }}>
          <dt style={{ color: '#5b6b7f', fontSize: 14 }}>Họ tên</dt>
          <dd style={{ margin: 0, fontWeight: 600 }}>{cand.full_name || 'Chưa rõ'}</dd>

          <dt style={{ color: '#5b6b7f', fontSize: 14 }}>Vị trí ứng tuyển</dt>
          <dd style={{ margin: 0 }}>{jobTitle || <em style={{ color: '#8a8a8a' }}>Chưa gắn vị trí</em>}</dd>

          <dt style={{ color: '#5b6b7f', fontSize: 14 }}>Email</dt>
          <dd style={{ margin: 0 }}>{cand.email || <em style={{ color: '#8a8a8a' }}>Không có</em>}</dd>

          <dt style={{ color: '#5b6b7f', fontSize: 14 }}>Điện thoại</dt>
          <dd style={{ margin: 0 }}>{cand.phone || <em style={{ color: '#8a8a8a' }}>Không có</em>}</dd>

          {address ? (
            <>
              <dt style={{ color: '#5b6b7f', fontSize: 14 }}>Địa chỉ</dt>
              <dd style={{ margin: 0 }}>{address}</dd>
            </>
          ) : null}

          {subject ? (
            <>
              <dt style={{ color: '#5b6b7f', fontSize: 14 }}>Tiêu đề mail</dt>
              <dd style={{ margin: 0, fontStyle: 'italic', color: '#5b6b7f' }}>{subject}</dd>
            </>
          ) : null}
        </dl>
      </div>

      {app.summary || strengths.length > 0 || clarifications.length > 0 || Object.keys(axes).length > 0 ? (
        <div style={card}>
          <h2 style={{ fontSize: 18, margin: '0 0 12px', color: '#06264d' }}>Đánh giá tự động</h2>
          {app.summary ? (
            <p style={{ margin: '0 0 12px' }}><strong>Tóm tắt:</strong> {app.summary}</p>
          ) : null}
          {Object.keys(axes).length > 0 ? (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Điểm từng phần (thang 10):</div>
              {Object.entries(axes).map(([k, v]) => (
                <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, padding: '2px 0' }}>
                  <span style={{ minWidth: 160, color: '#5b6b7f' }}>{k}</span>
                  <span style={{ flex: 1, height: 8, background: '#f0f4f9', borderRadius: 4, overflow: 'hidden' }}>
                    <span style={{ display: 'block', height: '100%', width: `${Math.min(100, Number(v) * 10)}%`, background: '#0b4da2' }} />
                  </span>
                  <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{Number(v)}/10</span>
                </div>
              ))}
            </div>
          ) : null}
          {strengths.length > 0 ? (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Điểm mạnh:</div>
              <ul style={{ margin: '0 0 0 20px', padding: 0 }}>
                {strengths.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
          ) : null}
          {clarifications.length > 0 ? (
            <div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Điểm cần làm rõ:</div>
              <ul style={{ margin: '0 0 0 20px', padding: 0 }}>
                {clarifications.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      {rawText ? (
        <div style={card}>
          <h2 style={{ fontSize: 18, margin: '0 0 12px', color: '#06264d' }}>Nội dung CV</h2>
          <pre style={{
            whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'inherit', fontSize: 14,
            background: '#f8fafc', border: '1px solid #eaeef4', borderRadius: 8, padding: 12, maxHeight: 500, overflowY: 'auto',
          }}>{rawText}</pre>
        </div>
      ) : (
        <div style={card}>
          <p style={{ color: '#5b6b7f', margin: 0 }}>Chưa có nội dung CV để hiển thị.</p>
        </div>
      )}

      <div style={card}>
        <h2 style={{ fontSize: 18, margin: '0 0 12px', color: '#06264d' }}>Quyết định của bạn</h2>
        <BossDecisionForm token={token} />
      </div>
    </main>
  );
}
