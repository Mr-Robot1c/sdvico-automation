// reply-playbook.mjs — khung câu trả lời đầu cho khách hỏi + tâm lý khách (24/9).
// Nguồn: chỉ đạo sếp Long 24/9 (nhóm Zalo): "Họ hỏi tức là đã có 10% attention, em trả lời xong nó về 0,
// thì cần xem cách nào để tăng từ 10 lên 20 lên 30", "đưa vô cho AI nó dạy về tâm lý khách hàng".
// Dùng ở 2 nơi: prompt soạn nháp trả lời lead (draftLeadReply) và kho bot /hoi-dap (mục E buildKnowledgeText).
// Đây là kinh nghiệm chung của nghề bán hàng, KHÔNG phải số liệu SDVICO: giá và thông số chỉ lấy từ kho verified.

export const REPLY_FRAME = [
  'KHUNG 3 NHỊP cho câu trả lời đầu tiên khi khách hỏi (mục tiêu: khách nhắn tiếp, attention tăng dần chứ không về 0):',
  '1. BẮT ĐÚNG Ý: nhắc lại đúng cái khách hỏi bằng 1 câu, trả lời thẳng, không vòng vo. Khách hỏi giá thì nói giá (trong inbox được nói giá đầy đủ nếu kho verified có).',
  '2. NEO LỢI ÍCH + HỎI NGƯỢC: thêm 1 lợi ích sát với câu hỏi (lấy từ kho verified), rồi kết bằng MỘT câu hỏi ngược dễ trả lời về tàu hoặc máy của khách (tàu dài bao nhiêu mét, máy bao nhiêu CV, đang chạy vùng nào). Câu hỏi ngược là thứ giữ cuộc nói chuyện còn sống: khách trả lời là attention tăng.',
  '3. MỞ BƯỚC KẾ: hứa một thứ cụ thể ngay sau câu trả lời của khách (gửi clip máy chạy thật, gửi bảng giá kèm lắp đặt, báo chi phí đúng cỡ tàu).',
  'LUẬT CỨNG: tối đa 4 câu cộng 1 câu hỏi ngược ở cuối. Không nói "dạ bên em có nhiều loại lắm". Không kết bằng "cần gì cứ nhắn em", vì đó là câu đóng hội thoại và attention về 0.',
].join('\n');

export const CUSTOMER_PSYCHOLOGY = [
  'TÂM LÝ KHÁCH NGƯ DÂN VÀ CHỦ TÀU (kinh nghiệm chung của nghề bán hàng, không phải số liệu SDVICO):',
  '- Sợ mua nhầm đồ không xài được trên tàu mình. Cho nên hỏi ngược cỡ tàu, cỡ máy trước khi báo loại nào là cách làm khách yên tâm chứ không phải làm khó khách.',
  '- Tin người đã lắp thật hơn tin lời quảng cáo. Nhắc tới clip máy chạy thật, tàu đã lắp thật sẽ thuyết phục hơn tính từ.',
  '- Hỏi giá trước không có nghĩa chỉ quan tâm giá. Đó là cách mở chuyện quen thuộc, giống hỏi "bao nhiêu vậy" ngoài chợ. Trả lời giá thẳng rồi chuyển sang nhu cầu của khách.',
  '- Ngại chữ nghĩa dài, thích nói chuyện như ngoài bến. Câu ngắn, tiếng thường ngày, không thuật ngữ.',
  '- Quyết định theo chuyến biển và theo mùa. Khách chậm trả lời thường là đang đi biển, chưa phải hết quan tâm, nên nhắc lại nhẹ nhàng chứ đừng dồn ép.',
  '- Hay mua vì người quen giới thiệu. Nói về khách cùng vùng, cùng loại tàu đã dùng có sức nặng hơn nói về công ty (chỉ nói khi kho có thật, không bịa khách).',
  '- Muốn biết ai lắp cho, hư ai sửa. Nói rõ có hỗ trợ lắp đặt và bảo hành thì đỡ một nỗi lo lớn.',
  '- Con số cụ thể (lít dầu, ngày công, số tiền) thuyết phục hơn tính từ như "tiết kiệm", "bền", "tốt".',
  '- Một câu hỏi dễ trả lời được khách đáp lại nhiều hơn ba câu hỏi cùng lúc. Mỗi tin chỉ hỏi ngược một điều.',
].join('\n');
