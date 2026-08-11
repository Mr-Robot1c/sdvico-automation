// outbound.mjs — backend soạn tin ra ngoài cho Marketing (B2C, B2B, hậu mãi).
//
// Nguyên tắc cốt lõi (Điều cấm số 1): MÁY SOẠN, NGƯỜI BẤM GỬI.
// Module này chỉ SOẠN nội dung và ĐẨY vào approval_queue ở trạng thái pending.
// Không có hàm nào gửi thẳng cho khách. Worker gửi thật chỉ chạy sau khi người duyệt
// bấm Duyệt (một dòng đổi sang approved), viết riêng, không nằm ở đây.
//
// Ràng buộc nội dung:
//  - Không nêu tên model và thông số chưa được Phòng Kinh doanh xác nhận (Điều cấm 5).
//    Các hàm dưới dùng từ chung "thiết bị giám sát hành trình", nhận tham số deviceLabel
//    để chèn tên thật KHI đã có xác nhận, mặc định để trống thì nói chung chung.
//  - Không mô tả phần mềm đối tác như của SDVICO (Điều cấm 4).
//  - Số theo chuẩn Việt Nam, câu ngắn, giọng gần gũi (skill brand-voice).
//
// Thiết kế cho di động giữa hai schema: chỉ ghi các cột CHUNG của approval_queue
// (kind, title, payload, status). Mọi chi tiết để trong payload (jsonb). Nhờ vậy chạy
// được cả trên schema cũ lẫn schema mới, không phụ thuộc biến thể core nào.

import { assessDraft } from './compliance.mjs';
import { PRODUCT_FACTS, knownFactValues } from './product-facts.mjs';

// Loại việc dùng chung cho mọi tin nhắn Marketing chờ duyệt.
export const OUTBOUND_KIND = 'mkt_send_message';

// Chuẩn hóa nhãn thiết bị. Chưa có tên thật thì nói chung.
function devicePhrase(deviceLabel) {
  return deviceLabel && deviceLabel.trim() ? deviceLabel.trim() : 'thiết bị giám sát hành trình';
}

// Tin hậu mãi theo mốc thời gian. months là 1, 3 hoặc 6.
// Trả về { title, body }. Không nêu model, không hứa pháp lý tuyệt đối.
export function buildAfterSalesMessage({ months, customerName = '', province = '', deviceLabel = '' }) {
  const dev = devicePhrase(deviceLabel);
  const chao = customerName ? `Chào ${customerName},` : 'Chào anh chị,';
  const noiDia = province ? ` tại ${province}` : '';

  let than;
  if (months <= 1) {
    than = `SDVICO hỏi thăm sau một tháng lắp ${dev}${noiDia}. Thiết bị chạy ổn, kết nối đều không ạ?`;
  } else if (months <= 3) {
    than = `Đã ba tháng từ khi lắp ${dev}. SDVICO nhắc anh chị kiểm tra kết nối và nguồn điện định kỳ.`;
  } else {
    than = `Đã sáu tháng sử dụng ${dev}. Nên kiểm tra, bảo trì để giữ kết nối ổn định trước mỗi chuyến biển.`;
  }

  const title = `Hậu mãi ${months} tháng${province ? ' - ' + province : ''}`;
  const body = [
    chao,
    than,
    'Cần hỗ trợ hoặc đặt lịch bảo trì, gọi tổng đài 1900 23 23 49.',
  ].join('\n');
  return { title, body };
}

// Tin theo dõi báo giá cho khách B2C đã quan tâm. Nói nhóm thiết bị chung, không bịa giá.
export function buildB2cFollowup({ customerName = '', province = '', deviceLabel = '' }) {
  const dev = devicePhrase(deviceLabel);
  const chao = customerName ? `Chào ${customerName},` : 'Chào anh chị,';
  const noiDia = province ? ` ở ${province}` : '';
  const title = `Theo dõi báo giá B2C${province ? ' - ' + province : ''}`;
  const body = [
    chao,
    `SDVICO gửi thông tin ${dev} phù hợp nhu cầu, kèm hỗ trợ lắp đặt và bảo trì tận bến${noiDia}.`,
    'Anh chị cần báo giá chi tiết, để lại số hoặc gọi 1900 23 23 49, có người tư vấn trực tiếp.',
  ].join('\n');
  return { title, body };
}

// Đẩy một tin nhắn vào hàng đợi duyệt. KHÔNG gửi. Trả về id của mục chờ duyệt.
// client: một Supabase client (service role).
// needsManagerApproval: đặt true khi nội dung chạm quy định nhà nước (Điều cấm 3).
export async function queueOutbound(client, {
  channel,                 // zalo | sms | email
  to,                      // người nhận (số điện thoại hoặc email), chỉ người đã đồng ý nhận
  title,
  body,
  audience = 'b2c',        // b2c | b2b
  needsManagerApproval = false,
  meta = {},
}) {
  // Tự đánh giá tuân thủ trước khi vào hàng đợi: gắn cờ đỏ nếu chạm quy định (Điều cấm 3),
  // cảnh báo nếu nhắc đối tác hoặc có thông số chưa xác nhận (Điều cấm 4 và 5).
  const assessment = assessDraft(`${title}\n${body}`, { knownFactValues: knownFactValues(PRODUCT_FACTS) });

  const payload = {
    channel,
    to,
    body,
    audience,
    // Cần cấp quản lý duyệt nếu người gọi yêu cầu, HOẶC nếu quét thấy chạm quy định.
    needs_manager_approval: needsManagerApproval || assessment.needsManagerApproval,
    risk: assessment.risk,          // red | amber | none
    compliance: assessment.flags,   // chi tiết từ khóa quy định, đối tác, thông số chưa xác nhận
    ...meta,
  };
  const { data, error } = await client
    .from('approval_queue')
    .insert({ kind: OUTBOUND_KIND, title, payload, status: 'pending' })
    .select('id')
    .single();
  if (error) throw new Error('Đẩy approval_queue lỗi: ' + error.message);
  return data.id;
}

// Ghi một dòng run_log tối giản. status 'ok' theo ràng buộc của repo (ok, error, skipped).
export async function logInfo(client, task, detail = {}) {
  const { error } = await client
    .from('run_log')
    .insert({ task, status: 'ok', detail });
  if (error) throw new Error('Ghi run_log lỗi: ' + error.message);
}
