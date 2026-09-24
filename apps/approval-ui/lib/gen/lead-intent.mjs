// lead-intent.mjs — đoán LOẠI CÂU HỎI của khách bằng từ khóa (24/9, sếp Long: dữ liệu hoá chuỗi
// khách hỏi để biết khách kẹt ở đâu). Thuần JS, không mạng, không LLM, chạy trong cron.
// Khách hay gõ không dấu ("gia bao nhieu v shop") nên chuẩn hóa bỏ dấu trước khi khớp.
// Cột mkt_leads.intent (migration 20260924180000). Khác miền giá trị với mkt_keywords.intent, đừng lẫn.

export const INTENTS = ['gia', 'ky_thuat', 'lap_dat', 'bao_hanh', 'so_sanh', 'khac'];

export const INTENT_LABEL = {
  gia: 'Hỏi giá',
  ky_thuat: 'Kỹ thuật',
  lap_dat: 'Lắp đặt',
  bao_hanh: 'Bảo hành',
  so_sanh: 'So sánh',
  khac: 'Khác',
};

function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/\s+/g, ' ')
    .trim();
}

// Luật theo THỨ TỰ ƯU TIÊN: khớp luật nào trước lấy luật đó.
// "gia" chỉ khớp khi đứng riêng (ranh giới từ) và sau khi bỏ các cụm "gia đình / gia tri / gia dung"
// ("gia đình tôi làm nghề biển" không phải hỏi giá). "bao nhieu" đi kèm đơn vị kỹ thuật (lít, cv...)
// là hỏi thông số, để rơi xuống ky_thuat.
const RULES = [
  ['gia', [/bao nhieu(?! (lit|cv|hp|kw|met|m)\b)/, /nhieu tien/, /\bbn tien\b/, /\bbnhieu\b/, /\bbnhiu\b/, /bao nhiu\b/, /bao gia/, /tra gop/, /khuyen mai/, /giam gia/, /\bgia\b/]],
  ['lap_dat', [/lap dat/, /\blap o\b/, /ai lap/, /lap tai/, /lap cho/, /thi cong/, /lap duoc khong/]],
  ['bao_hanh', [/bao hanh/, /bao tri/, /sua chua/, /hu thi/, /hong thi/, /doi tra/]],
  ['so_sanh', [/so voi/, /khac gi/, /tot hon/, /loai nao tot/, /nen mua loai nao/, /hon nhau/]],
  ['ky_thuat', [/cong suat/, /thong so/, /chay dau/, /loc duoc/, /may co/, /may dien/, /bao nhieu lit/, /\d\s*cv\b/, /\bcv\b/, /dung cho tau/, /tau dai/, /hoat dong/, /xai duoc/,
    // Khách tự nêu cỡ máy hoặc hãng máy của họ ("930CV Komatsu", "Cummins k19 750hp", "500 mã lực") là câu về kỹ thuật.
    /\d\s*(hp|kw|mw|ngua)\b/, /ma luc/, /may phat/, /\b(cummins|komatsu|mtu|yanmar|caterpillar|mitsubishi|hino|isuzu|daewoo|doosan|volvo|scania)\b/]],
];

export function guessIntent(text) {
  const t = normalize(text).replace(/\bgia (dinh|tri|dung)\b/g, ' ');
  if (t.length < 3) return 'khac';
  for (const [intent, res] of RULES) {
    if (res.some((re) => re.test(t))) return intent;
  }
  return 'khac';
}
