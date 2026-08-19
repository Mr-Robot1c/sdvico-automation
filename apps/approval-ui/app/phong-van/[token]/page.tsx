import { getServerClient } from '../../../lib/supabase-server';
import SlotPicker from './slot-picker';

export const dynamic = 'force-dynamic';

type IvPayload = { ung_vien?: string; vi_tri?: string; khung_gio?: string[]; dia_diem?: string };

const shell = { maxWidth: 560, margin: '0 auto', padding: '28px 20px 48px' } as const;
const card = { background: '#fff', border: '1px solid #dbe5f1', borderRadius: 16, padding: 24, marginTop: 16 } as const;

function Header() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 26, fontWeight: 800, letterSpacing: 1, color: '#0b4da2' }}>SDVICO</span>
      <span style={{ fontSize: 14, color: '#5b6b7f' }}>Phòng Nhân sự · Công ty Hiệp Lực Phát Triển Việt</span>
    </div>
  );
}

export default async function Page({ params }: { params: { token: string } }) {
  const token = params.token;
  const client = getServerClient();

  const { data: app } = await client
    .from('hr_applications')
    .select('id, chosen_slot, proposed_slot, proposed_note, proposed_at')
    .eq('schedule_token', token)
    .maybeSingle();

  if (!app) {
    return (
      <main style={shell}>
        <Header />
        <div style={card}>
          <h1 style={{ fontSize: 22, margin: '0 0 8px' }}>Link không hợp lệ</h1>
          <p style={{ color: '#5b6b7f', margin: 0 }}>
            Link chọn giờ này không đúng hoặc đã hết hạn. Vui lòng liên hệ lại Phòng Nhân sự để được hỗ trợ.
          </p>
        </div>
      </main>
    );
  }

  const { data: iv } = await client
    .from('approval_queue')
    .select('payload')
    .eq('kind', 'hr_interview')
    .eq('ref_id', app.id)
    .maybeSingle();
  const payload = (iv?.payload || {}) as IvPayload;
  const slots = payload.khung_gio || [];

  return (
    <main style={shell}>
      <Header />
      <div style={card}>
        <h1 style={{ fontSize: 24, margin: '0 0 6px', color: '#06264d' }}>Chọn giờ phỏng vấn</h1>        {payload.vi_tri ? (
          <p style={{ color: '#5b6b7f', margin: '0 0 8px' }}>Vị trí: <b style={{ color: '#06264d' }}>{payload.vi_tri}</b></p>
        ) : null}
        {payload.dia_diem ? (
          <p style={{ color: '#5b6b7f', margin: '0 0 18px' }}>Địa điểm: <b style={{ color: '#06264d' }}>{payload.dia_diem}</b></p>
        ) : null}

        {app.chosen_slot ? (
          <div style={{ background: '#e7f6ec', border: '1px solid #b6e0c4', borderRadius: 12, padding: 18 }}>
            <div style={{ fontWeight: 700, color: '#1a7f43', marginBottom: 4 }}>Đã nhận lựa chọn của bạn ✓</div>
            <div>Khung giờ bạn chọn: <b>{app.chosen_slot}</b></div>
            <div style={{ marginTop: 8, color: '#5b6b7f', fontSize: 14 }}>
              Cảm ơn bạn. Phòng Nhân sự sẽ xác nhận lại và gửi chi tiết buổi phỏng vấn qua email.
            </div>
          </div>
        ) : app.proposed_slot ? (
          <div style={{ background: '#fff8e1', border: '1px solid #f0d78e', borderRadius: 12, padding: 18 }}>
            <div style={{ fontWeight: 700, color: '#8a6a00', marginBottom: 4 }}>Đã nhận đề xuất của bạn ✓</div>
            <div>Đề xuất: <b>{app.proposed_slot}</b></div>
            {app.proposed_note ? (
              <div style={{ marginTop: 6, color: '#5b6b7f', fontSize: 14 }}>Ghi chú: {app.proposed_note}</div>
            ) : null}
            <div style={{ marginTop: 8, color: '#5b6b7f', fontSize: 14 }}>
              Phòng Nhân sự sẽ liên hệ lại với bạn qua email để chốt lịch cụ thể.
            </div>
          </div>
        ) : slots.length ? (
          <>
            <p style={{ margin: '0 0 14px', color: '#33475b' }}>Vui lòng bấm chọn một khung giờ phù hợp với bạn:</p>
            <SlotPicker token={token} slots={slots} />
          </>
        ) : (
          <p style={{ color: '#5b6b7f', margin: 0 }}>
            Hiện chưa có khung giờ phỏng vấn cho hồ sơ của bạn. Vui lòng quay lại sau ít phút hoặc liên hệ Phòng Nhân sự.
          </p>
        )}
      </div>
    </main>
  );
}
