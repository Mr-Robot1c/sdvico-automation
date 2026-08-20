// lib/product-catalog.ts — danh mục sản phẩm SDVICO cho trang public /san-pham.
//
// Nguồn: CLAUDE.md phần "Danh mục sản phẩm" (trang chính thức sdvico.vn, tra 10/8/2026)
// + product-guard.mjs (allowed/forbidden/why).
//
// Ba nguyên tắc CỨNG khi soạn nội dung ở đây (điều cấm 4 và 5):
//   1. Phân biệt rõ SẢN PHẨM DO SDVICO PHÁT TRIỂN (máy lọc nước) và THIẾT BỊ SDVICO PHÂN
//      PHỐI + LẮP ĐẶT (giám sát hành trình, điện thoại vệ tinh, dầu nhớt PVOIL).
//   2. KHÔNG mô tả phần mềm của hãng (Viettel, Thuraya, PVOIL) như năng lực SDVICO.
//   3. Không bịa thông số kỹ thuật. Chỉ nêu công dụng ở mức đã có tài liệu chính thức.
//
// Slug cố định (không sinh từ tên) để URL bền vững cả khi đổi tên hiển thị.

export type ProductItem = {
  slug: string;            // /san-pham/<slug>
  name: string;            // Tên hiển thị
  productGroup: string;    // Khớp brand_assets.product_group (không STT)
  role: 'san-xuat' | 'phan-phoi';  // SDVICO phát triển hay phân phối
  hangGoc: string | null;  // Hãng gốc nếu là phân phối (null nếu SDVICO tự làm)
  short: string;           // 1 câu tóm tắt cho card list
  intro: string;           // Đoạn giới thiệu dưới hero
  loiIch: string[];        // Bulletlist lợi ích cho ngư dân (chỉ nêu công dụng chung, không thông số)
  luuY: string;            // Ghi chú vai trò SDVICO (phân phối vs sản xuất) — tuân điều cấm 4
};

export const PRODUCT_CATALOG: ProductItem[] = [
  {
    slug: 'may-loc-nuoc-bien-sea-40',
    name: 'Máy lọc nước biển SEA-40',
    productGroup: 'Máy lọc nước biển SEA-40',
    role: 'san-xuat',
    hangGoc: null,
    short: 'Máy lọc nước biển thành nước ngọt cho tàu cá, do SDVICO nghiên cứu và sản xuất từ 2014.',
    intro: 'SEA-40 là máy lọc nước biển thành nước ngọt gắn trên tàu cá, thuộc dòng sản phẩm chủ lực do SDVICO nghiên cứu và sản xuất. Máy giúp bà con chủ động nguồn nước ngọt sinh hoạt và nấu ăn ngoài khơi, giảm bớt gánh nặng chở nước theo tàu.',
    loiIch: [
      'Chủ động nước ngọt cho anh em thợ trên tàu, không phải lo hết nước giữa chuyến biển dài.',
      'Giảm số can nước phải chở theo, dành khoang tàu cho việc chính là đánh bắt.',
      'Lắp đặt tận bến, hướng dẫn sử dụng và bảo hành trực tiếp bởi thợ SDVICO.'
    ],
    luuY: 'Sản phẩm do SDVICO nghiên cứu và sản xuất, không phải phân phối từ hãng khác.'
  },
  {
    slug: 'thiet-bi-loc-dau-sf-50',
    name: 'Thiết bị lọc dầu SF-50',
    productGroup: 'Thiết bị lọc dầu SF-50',
    role: 'san-xuat',
    hangGoc: null,
    short: 'Thiết bị lọc và xử lý dầu diesel cho tàu cá, giúp tiết kiệm nhiên liệu qua nhiều chuyến biển.',
    intro: 'SF-50 là thiết bị xử lý và lọc dầu diesel gắn trên tàu cá, giúp bà con tiết kiệm chi phí nhiên liệu qua nhiều chuyến biển. Đây là dòng thiết bị xử lý dầu trong danh mục sản phẩm SDVICO chia sẻ trên sdvico.vn.',
    loiIch: [
      'Giảm chi phí nhiên liệu cho mỗi chuyến biển, tính trên nhiều chuyến sẽ thấy rõ.',
      'Máy chạy êm hơn nhờ dầu sạch, kéo dài tuổi thọ động cơ.',
      'Thợ SDVICO lắp đặt và hướng dẫn tận bến, bảo hành trực tiếp.'
    ],
    luuY: 'Sản phẩm thuộc nhóm xử lý dầu do SDVICO cung cấp và lắp đặt cho tàu cá.'
  },
  {
    slug: 'thiet-bi-giam-sat-hanh-trinh-viettel-s-tracking',
    name: 'Thiết bị giám sát hành trình Viettel S-Tracking',
    productGroup: 'Viettel S-Tracking',
    role: 'phan-phoi',
    hangGoc: 'Viettel',
    short: 'Thiết bị giám sát hành trình tàu cá Viettel S-Tracking — SDVICO phân phối và lắp đặt.',
    intro: 'Viettel S-Tracking là thiết bị giám sát hành trình bắt buộc cho tàu cá theo quy định của Bộ Nông nghiệp và Phát triển nông thôn. SDVICO là đơn vị phân phối, lắp đặt và hỗ trợ bảo hành thiết bị này tại khu vực Bà Rịa Vũng Tàu và các cảng cá lân cận.',
    loiIch: [
      'Đáp ứng yêu cầu giám sát hành trình theo quy định, tàu ra khơi hợp lệ.',
      'Kết nối hạ tầng của Viettel, phủ sóng tốt ở vùng biển Việt Nam.',
      'SDVICO lắp đặt tận bến, hỗ trợ hồ sơ và thao tác đăng ký.'
    ],
    luuY: 'SDVICO là đơn vị PHÂN PHỐI, LẮP ĐẶT và bảo hành thiết bị của Viettel. Phần mềm và dịch vụ giám sát thuộc quyền của Viettel, không phải do SDVICO phát triển.'
  },
  {
    slug: 'thuraya-marinestar-mnb-01',
    name: 'Thuraya MarineStar MNB-01',
    productGroup: 'Thuraya MarineStar MNB-01',
    role: 'phan-phoi',
    hangGoc: 'Thuraya',
    short: 'Thiết bị giám sát hành trình vệ tinh Thuraya MarineStar, hỗ trợ nghe gọi — SDVICO phân phối.',
    intro: 'Thuraya MarineStar MNB-01 là thiết bị giám sát hành trình tàu cá qua vệ tinh, có hỗ trợ nghe gọi ngoài khơi. SDVICO là đơn vị phân phối và lắp đặt cho tàu cá tại Việt Nam.',
    loiIch: [
      'Giám sát hành trình + gọi điện qua vệ tinh, phù hợp tàu đi xa bờ.',
      'Bà con và gia đình ở nhà liên lạc được kể cả khi ngoài vùng phủ sóng di động.',
      'SDVICO lắp đặt, hướng dẫn sử dụng và hỗ trợ bảo hành.'
    ],
    luuY: 'SDVICO là đơn vị PHÂN PHỐI, LẮP ĐẶT thiết bị của hãng Thuraya. Dịch vụ vệ tinh do Thuraya cung cấp.'
  },
  {
    slug: 'dien-thoai-ve-tinh-xt-pro',
    name: 'Điện thoại vệ tinh XT-Pro',
    productGroup: 'XT-Pro',
    role: 'phan-phoi',
    hangGoc: 'Thuraya',
    short: 'Điện thoại vệ tinh Thuraya XT-Pro cho tàu cá đi xa bờ — SDVICO phân phối.',
    intro: 'XT-Pro là điện thoại vệ tinh Thuraya dành cho tàu cá và ngư dân đi xa bờ, giữ liên lạc kể cả khi ngoài vùng phủ sóng di động. SDVICO phân phối và hỗ trợ dịch vụ trong nước.',
    loiIch: [
      'Liên lạc với gia đình và cơ quan chức năng ở vùng biển xa.',
      'Nhắn tin và gọi khẩn cấp trong tình huống thời tiết xấu, sự cố.',
      'SDVICO hỗ trợ mua thẻ nạp và hướng dẫn sử dụng.'
    ],
    luuY: 'Thiết bị của Thuraya, SDVICO là đơn vị phân phối. Dịch vụ vệ tinh và cước phí thuộc quyền của Thuraya và đối tác.'
  },
  {
    slug: 'dau-nhot-pvoil-nano-graphene',
    name: 'Dầu nhớt PVOIL Nano Graphene',
    productGroup: 'PVOIL Nano Graphene',
    role: 'phan-phoi',
    hangGoc: 'PVOIL',
    short: 'Dầu nhớt PVOIL Nano Graphene cho động cơ diesel tàu cá — SDVICO là nhà phân phối ủy quyền.',
    intro: 'SDVICO là nhà phân phối ủy quyền dòng dầu nhớt PVOIL, trong đó có PVOIL Nano Graphene và PV Engine RMI Nano Graphene cho động cơ diesel tàu cá. Bà con đặt trực tiếp qua SDVICO để được giao và tư vấn.',
    loiIch: [
      'Dòng dầu nhớt chuyên cho động cơ diesel tàu cá, được PVOIL công bố công nghệ Nano Graphene.',
      'SDVICO giao hàng tận bến và tư vấn loại dầu phù hợp cho động cơ.',
      'Nguồn hàng chính hãng, hoá đơn đầy đủ.'
    ],
    luuY: 'SDVICO là NHÀ PHÂN PHỐI UỶ QUYỀN của PVOIL, không phải hãng sản xuất dầu.'
  }
];

export function findProductBySlug(slug: string): ProductItem | undefined {
  return PRODUCT_CATALOG.find((p) => p.slug === slug);
}
