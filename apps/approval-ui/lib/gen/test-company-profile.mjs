// test-company-profile.mjs — dữ kiện công ty từ hồ sơ năng lực 2026 (23/10/2026).
// Chạy: npm run test:company
import { COMPANY_FACTS, COMPANY_SPEC_TEXT, companyLines } from './company-profile.mjs';
import { scanUnverifiedSpecs } from './compliance.mjs';
import { scanStyle } from './brand-voice-check.mjs';

let fail = 0;
const ok = (name, cond) => { console.log(`${cond ? 'OK  ' : 'FAIL'} ${name}`); if (!cond) fail++; };

ok('ISO 9001:2015 và QCVN không bị cờ thông số bịa', scanUnverifiedSpecs('Đạt ISO 9001:2015, nước đạt QCVN 02:2009/BYT, hợp quy QCVN 54:2020/BTTTT', new Set()).length === 0);
ok('mã máy và thông số bịa vẫn bị cờ', scanUnverifiedSpecs('máy SEA-99 công suất 999 W', new Set()).length === 2);
// Hồ sơ có số định danh, ngày sinh, phần vốn, doanh thu: không dòng nào được lọt vào dữ kiện cho agent.
ok('không có số định danh cá nhân', !/\b0\d{11}\b/.test(COMPANY_SPEC_TEXT));
ok('không có ngày sinh, phần vốn, doanh thu', !/(sinh|vốn góp|doanh thu|lợi nhuận|CCCD)/i.test(COMPANY_SPEC_TEXT));
ok('không có tên khách trong hợp đồng', !/(Baseafood|Hải Hà|Dacinco|Mai Hải|Đức Vinh|Trục vớt|Lạch Quèn)/i.test(COMPANY_SPEC_TEXT));
ok('không nhắc SF-50 (đang chặn)', !/SF-?50\b/i.test(COMPANY_SPEC_TEXT));
ok('dữ kiện qua được bộ kiểm giọng văn', COMPANY_FACTS.every((f) => scanStyle(f.text).length === 0));
ok('khối prompt có giới hạn số dữ kiện', companyLines({ maxUse: 1 })[0].includes('tối đa 1'));

if (fail) { console.log(`\n${fail} test hỏng`); process.exit(1); }
console.log('\nTất cả đạt');
