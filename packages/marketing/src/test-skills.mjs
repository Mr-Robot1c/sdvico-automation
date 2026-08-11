// test-skills.mjs — kiểm thử hai skill brand-voice và product-boundary trên 20 đoạn gài lỗi.
// Chạy: npm run test:skills
//
// Mỗi đoạn cố tình gài MỘT lỗi. Skill tốt là bắt được lỗi. Chạy qua cả hai bộ rà:
// brand-voice-check (giọng) và compliance (sản phẩm và quy định). Đoạn được coi là "bắt"
// nếu ít nhất một bộ phát hiện vấn đề. Kèm 3 đoạn SẠCH làm đối chứng, phải KHÔNG bị bắt.

import { scanStyle } from './brand-voice-check.mjs';
import { assessDraft } from './compliance.mjs';
import { PRODUCT_FACTS, knownFactValues, testFactValues } from './product-facts.mjs';

const opts = { knownFactValues: knownFactValues(PRODUCT_FACTS), testFactValues: testFactValues(PRODUCT_FACTS) };

function detect(text) {
  const style = scanStyle(text);
  const a = assessDraft(text, opts);
  const boundary = [
    ...a.flags.regulation.map((x) => 'quy định: ' + x),
    ...a.flags.partner.map((x) => 'đối tác: ' + x),
    ...a.flags.unverifiedSpecs.map((x) => 'thông số bịa: ' + x),
    ...a.flags.testSpecs.map((x) => 'thông số test: ' + x),
  ];
  const issues = [...style, ...boundary];
  return { caught: issues.length > 0, risk: a.risk, issues };
}

// 20 đoạn có lỗi cài sẵn, ba nhóm: sai giọng, sai sản phẩm, chạm quy định.
const flawed = [
  { loai: 'giọng: gạch dài', text: 'Thiết bị giám sát tàu cá — thứ không thể thiếu cho mỗi chuyến biển an toàn.' },
  { loai: 'giọng: mũi tên', text: 'Quy trình lắp đặt gọn nhẹ: khảo sát -> lắp đặt -> nghiệm thu tận bến.' },
  { loai: 'giọng: chấm tròn', text: 'Chúng tôi hỗ trợ tận bến • lắp đặt nhanh • bảo trì chu đáo quanh năm.' },
  { loai: 'giọng: ký hiệu và', text: 'SDVICO nhận lắp đặt & bảo trì thiết bị giám sát hành trình cho tàu cá.' },
  { loai: 'giọng: số sai chuẩn', text: 'Chi phí lắp đặt trọn gói chỉ từ 3,000,000 đồng cho mỗi tàu.' },
  { loai: 'giọng: hoa mỹ', text: 'Giải pháp giám sát đẳng cấp, tối tân, hoàn hảo cho mọi con tàu ra khơi.' },
  { loai: 'giọng: hứa pháp lý', text: 'Cứ lắp thiết bị của chúng tôi là chắc chắn không bị phạt khi đi biển.' },
  { loai: 'giọng: khẳng định quá', text: 'SDVICO là đơn vị số 1 và tốt nhất về thiết bị hàng hải tại Việt Nam.' },
  { loai: 'sản phẩm: phần mềm đối tác', text: 'Phần mềm S-Tracking của SDVICO giúp theo dõi tàu mọi lúc mọi nơi.' },
  { loai: 'sản phẩm: nhận vơ Thuraya', text: 'Điện thoại vệ tinh Thuraya do SDVICO sản xuất, sóng khỏe khắp đại dương.' },
  { loai: 'sản phẩm: bịa model', text: 'Máy lọc nước biển SEA-40 của SDVICO cho nước ngọt tức thì trên tàu.' },
  { loai: 'sản phẩm: bịa thông số', text: 'Thiết bị đạt chuẩn kháng nước IP69, chịu được sóng lớn ngoài khơi xa.' },
  { loai: 'sản phẩm: nhận vơ VNPT', text: 'SDVICO tích hợp sẵn hệ thống VSS của VNPT vào thiết bị của mình.' },
  { loai: 'sản phẩm: nhận vơ Vishipel', text: 'Đài thông tin Vishipel là dịch vụ độc quyền của riêng SDVICO.' },
  { loai: 'sản phẩm: bịa công suất', text: 'Máy lọc dầu công suất 50 L/h, giúp động cơ bền hơn hẳn khi đi biển.' },
  { loai: 'quy định: nghị định và phạt', text: 'Tàu từ 15 mét không lắp giám sát sẽ bị xử phạt theo nghị định hiện hành.' },
  { loai: 'quy định: IUU', text: 'EU vẫn giữ thẻ vàng IUU nên Cục Thủy sản đang siết chặt khâu giám sát.' },
  { loai: 'quy định: Kiểm ngư', text: 'Lực lượng Kiểm ngư sẽ kiểm tra thiết bị giám sát trước mỗi chuyến ra khơi.' },
  { loai: 'sản phẩm: bịa giải thưởng', text: 'Năm ngoái SDVICO nhận giải thưởng thiết bị hàng hải tốt nhất toàn quốc.' },
  { loai: 'hỗn hợp: số sai và khẳng định', text: 'Hơn 10,000 chủ tàu lớn nhất cả nước đều tin dùng thiết bị của SDVICO.' },
];

// 3 đoạn SẠCH, phải KHÔNG bị bắt.
const clean = [
  { loai: 'sạch', text: 'Tàu mất kết nối giám sát, hãy kiểm tra nguồn điện và ăng-ten trước, rồi khởi động lại thiết bị. Cần hỗ trợ, gọi 1900 23 23 49.' },
  { loai: 'sạch', text: 'SDVICO phân phối, lắp đặt và bảo trì thiết bị giám sát hành trình đạt chuẩn, có mặt tận bến ở nhiều tỉnh ven biển.' },
  { loai: 'sạch', text: 'Gia hạn cước đúng hạn giúp tàu không bị đứt kết nối giữa chuyến biển. Kiểm tra hạn cước định kỳ để yên tâm ra khơi.' },
];

console.log('=== 20 đoạn có lỗi cài sẵn (mong đợi BẮT hết) ===');
let caught = 0;
flawed.forEach((c, i) => {
  const r = detect(c.text);
  if (r.caught) caught++;
  console.log(`${r.caught ? 'BẮT ' : 'SÓT!'} ${String(i + 1).padStart(2)}. [${c.loai}] -> ${r.issues.join('; ') || '(không bắt được)'}`);
});

console.log('\n=== 3 đoạn sạch (mong đợi KHÔNG bắt) ===');
let falsePos = 0;
clean.forEach((c, i) => {
  const r = detect(c.text);
  if (r.caught) falsePos++;
  console.log(`${r.caught ? 'BẮT OAN!' : 'ĐẠT   '} ${i + 1}. -> ${r.issues.join('; ') || 'sạch'}`);
});

console.log(`\nKết quả: bắt ${caught}/20 đoạn lỗi, bắt oan ${falsePos}/3 đoạn sạch.`);
process.exit(caught === 20 && falsePos === 0 ? 0 : 1);
