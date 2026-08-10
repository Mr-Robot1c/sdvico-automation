// Trích văn bản từ tệp CV. Ba loại: PDF, DOCX, và ảnh (OCR tiếng Việt).
// Nạp thư viện theo kiểu động để thiếu một thư viện không làm hỏng các loại còn lại,
// và để kiểm cú pháp module được ngay cả khi chưa cài phụ thuộc.

const IMAGE_EXT = ['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.tif', '.tiff'];

// Suy ra loại tệp từ tên và mime. Trả về 'pdf' | 'docx' | 'image' | 'unknown'.
export function detectKind(filename = '', mime = '') {
  const name = filename.toLowerCase();
  const m = (mime || '').toLowerCase();
  if (name.endsWith('.pdf') || m === 'application/pdf') return 'pdf';
  if (
    name.endsWith('.docx') ||
    m === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    return 'docx';
  }
  if (IMAGE_EXT.some((e) => name.endsWith(e)) || m.startsWith('image/')) return 'image';
  return 'unknown';
}

async function extractPdf(buffer) {
  // Nạp thẳng lib để tránh đoạn thử nghiệm trong index.js của pdf-parse.
  const mod = await import('pdf-parse/lib/pdf-parse.js');
  const pdfParse = mod.default || mod;
  const data = await pdfParse(buffer);
  const text = (data.text || '').trim();
  // PDF quét thành ảnh sẽ ra rất ít chữ. Đánh dấu để người duyệt biết cần OCR tay hoặc gửi lại bản chữ.
  const needsOcr = text.replace(/\s/g, '').length < 30;
  return { text, needsOcr, pages: data.numpages || null };
}

async function extractDocx(buffer) {
  const mod = await import('mammoth');
  const mammoth = mod.default || mod;
  const { value } = await mammoth.extractRawText({ buffer });
  return { text: (value || '').trim(), needsOcr: false };
}

async function extractImage(buffer, { lang = 'vie+eng' } = {}) {
  const mod = await import('tesseract.js');
  const { createWorker } = mod;
  const worker = await createWorker(lang);
  try {
    const { data } = await worker.recognize(buffer);
    return { text: (data.text || '').trim(), needsOcr: false, ocr: true };
  } finally {
    await worker.terminate();
  }
}

// Trích văn bản từ một tệp đính kèm.
// attachment: { filename, mime, buffer }
// Trả về { kind, text, needsOcr, error }.
export async function extractText(attachment, opts = {}) {
  const kind = detectKind(attachment.filename, attachment.mime);
  try {
    if (kind === 'pdf') return { kind, ...(await extractPdf(attachment.buffer)) };
    if (kind === 'docx') return { kind, ...(await extractDocx(attachment.buffer)) };
    if (kind === 'image') return { kind, ...(await extractImage(attachment.buffer, opts)) };
    return { kind, text: '', needsOcr: false, error: 'Loại tệp không hỗ trợ trích văn bản' };
  } catch (err) {
    return { kind, text: '', needsOcr: false, error: err.message };
  }
}
