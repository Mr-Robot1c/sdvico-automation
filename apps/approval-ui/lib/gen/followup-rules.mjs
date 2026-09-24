// 24/9: khách "im re" một phần vì không ai nhắc lại. Máy soạn nháp nhắc theo 3 mốc, người
// đọc, tự gửi, bấm Đã gửi tay (điều cấm 1). Tin TẤT ĐỊNH, không LLM (chạy trong cron 90s),
// không con số nào ngoài tổng đài và câu giá PRICE_TEASER lấy nguyên văn (điều cấm 5).
import { PRICE_TEASER, publicName } from './products.mjs';

export const TOUCHES = [
  { touch: 1, afterHours: 24 },
  { touch: 2, afterHours: 72 },
  { touch: 3, afterHours: 168 },
];

// Lead đủ điều kiện chạm nào? Trả về số chạm kế tiếp hoặc null.
// - Chỉ lead status 'contacted'. Mốc tính giờ: updatedAt (lần người chạm khách gần nhất).
// - doneTouches: các touch >= 1 đã có trong approval_queue cho lead này (pending, approved lẫn rejected).
// - Còn nháp pending bất kỳ cho lead thì null (đừng chồng tin).
// - Mỗi lần chỉ một tin: chạm nhỏ nhất chưa làm, dù đã quá mốc chạm lớn hơn (đừng dồn).
export function nextTouch({ status, updatedAt, doneTouches, hasPending, now }) {
  if (hasPending) return null;
  now = now || new Date();
  if (status !== 'contacted') return null;
  const t0 = new Date(updatedAt).getTime();
  if (!Number.isFinite(t0)) return null;
  const hours = (new Date(now).getTime() - t0) / 3600000;
  const done = new Set((doneTouches || []).map(Number));
  const next = TOUCHES.find((t) => !done.has(t.touch));
  if (!next) return null;
  return hours >= next.afterHours ? next.touch : null;
}

// Tên gọi sản phẩm để chèn vào tin. Tin tất định không có ai soát model, nên chỉ nói LOẠI thiết bị, không nêu
// mã model chưa xác nhận (SEA-40, SF-50, MNB-01...; điều cấm 5) và không gắn tên phần mềm/dịch vụ đối tác
// vào câu (điều cấm 4). Riêng SF300B là tên công khai Thanh chốt 8/9 nên giữ.
const LABEL_BY_NO = {
  2: 'máy lọc nước biển',
  3: 'thiết bị giám sát hành trình',
  4: 'thiết bị liên lạc vệ tinh',
  5: 'điện thoại vệ tinh',
  6: 'thiết bị lọc dầu',
};
// Chỉ hạ chữ đầu khi là từ thường ("Máy lọc dầu" thành "máy lọc dầu"), giữ nguyên tên riêng ("SDFish", "PV Engine").
const lowerFirst = (t) => (/^\p{Lu}\p{Ll}/u.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t);
export function productLabel(group) {
  if (!group) return 'thiết bị';
  const pub = publicName(group);
  if (pub) return lowerFirst(pub);
  const no = Number(String(group).match(/^(\d+)\./)?.[1]);
  if (LABEL_BY_NO[no]) return LABEL_BY_NO[no];
  const bare = String(group).replace(/^\d+\.\s*/, '').trim();
  return bare ? lowerFirst(bare) : 'thiết bị';
}

// Nội dung theo chạm. group = product_guess (có thể null).
export function buildFollowupBody({ touch, customerName, group }) {
  const name = String(customerName || '').trim();
  const chao = name ? `Chào ${name},` : 'Chào anh chị,';
  const sp = productLabel(group);
  const teaser = group && PRICE_TEASER[group] ? PRICE_TEASER[group].text : '';
  if (touch === 1) {
    return `${chao} ${group ? `hôm trước anh chị có hỏi em về ${sp} bên SDVICO.` : 'hôm trước anh chị có nhắn hỏi bên SDVICO.'} Anh chị còn điều gì băn khoăn không, em giải đáp luôn ạ? Anh chị cho em biết tàu mình cỡ nào, em tư vấn đúng loại cho đỡ mất thời gian của anh chị.`;
  }
  if (touch === 2) {
    return `${chao} em gửi anh chị thêm thông tin ${sp} nhé. ${teaser ? teaser + '. ' : ''}Nếu anh chị muốn xem máy chạy thật, em gửi clip khách đã lắp cho anh chị coi trước rồi mình tính tiếp ạ.`;
  }
  return `${chao} em phiền anh chị lần này nữa thôi ạ. Nếu anh chị vẫn quan tâm ${sp}, em hỗ trợ báo chi phí trọn gói theo cỡ tàu của mình. Còn nếu chưa tiện, anh chị cứ giữ số tổng đài 1900 23 23 49, khi nào cần SDVICO có mặt ạ.`;
}

// Ghi chú cho NGƯỜI gửi (không gửi cho khách).
export function followupNote(touch, group) {
  if (touch === 2) return 'Chạm 2: đính kèm clip hoặc ảnh sản phẩm khi gửi.' + (group && PRICE_TEASER[group] ? ' Câu giá đang là mốc úp mở, inbox được nói giá đầy đủ nên sửa lại theo chính sách giá nếu cần.' : '') + ' Đọc lại, sửa theo ý mình, tự gửi trong Messenger rồi bấm Đã gửi tay.';
  if (touch === 3) return 'Chạm 3, chạm cuối: nhắc nhẹ rồi thôi. Đọc lại, sửa theo ý mình, tự gửi trong Messenger rồi bấm Đã gửi tay.';
  return 'Chạm 1: kéo khách kể cỡ tàu để báo đúng loại. Đọc lại, sửa theo ý mình, tự gửi trong Messenger rồi bấm Đã gửi tay.';
}
