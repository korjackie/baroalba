// shared-lang.js — 바로알바 + 업주 앱 공통 번역/언어 관리
// 이 파일 하나만 수정하면 두 앱 모두 반영됩니다.

const WORK_TYPE_LABELS = {
  ko: { regular:'정기알바', short:'단기알바', spot:'스팟', errand:'심부름' },
  en: { regular:'Regular', short:'Short-term', spot:'Spot', errand:'Errand' },
  zh: { regular:'长期兼职', short:'短期兼职', spot:'临时', errand:'跑腿' },
  ja: { regular:'定期バイト', short:'短期バイト', spot:'スポット', errand:'お使い' },
  vi: { regular:'Thường xuyên', short:'Ngắn hạn', spot:'Tạm thời', errand:'Việc vặt' },
  ru: { regular:'Постоянная', short:'Краткосрочная', spot:'Разовая', errand:'Поручение' },
};

const VEHICLE_LABELS = {
  ko: { bicycle:'자전거', kickboard:'킥보드', motorcycle:'오토바이', car_compact:'차량 소형', car_midsize:'차량 중형', car_suv:'차량 SUV', car_large:'차량 대형', truck:'트럭/화물' },
  en: { bicycle:'Bicycle', kickboard:'Kick Scooter', motorcycle:'Motorcycle', car_compact:'Compact Car', car_midsize:'Midsize Car', car_suv:'SUV', car_large:'Large Car', truck:'Truck' },
  zh: { bicycle:'自行车', kickboard:'电动滑板车', motorcycle:'摩托车', car_compact:'小型轿车', car_midsize:'中型轿车', car_suv:'SUV', car_large:'大型车', truck:'货车' },
  ja: { bicycle:'自転車', kickboard:'電動キック', motorcycle:'バイク', car_compact:'普通車(小)', car_midsize:'普通車(中)', car_suv:'SUV', car_large:'大型車', truck:'トラック' },
  vi: { bicycle:'Xe đạp', kickboard:'Xe điện', motorcycle:'Xe máy', car_compact:'Ô tô nhỏ', car_midsize:'Ô tô vừa', car_suv:'SUV', car_large:'Ô tô lớn', truck:'Xe tải' },
  ru: { bicycle:'Велосипед', kickboard:'Самокат', motorcycle:'Мотоцикл', car_compact:'Малый авто', car_midsize:'Средний авто', car_suv:'SUV', car_large:'Большой авто', truck:'Грузовик' },
};

const STRENGTH_LABELS = {
  ko: {
    strong:'힘이 강함', speed:'스피드', numbers:'숫자에 밝음', design:'디자인 안목',
    experience:'다양한 경험', always_on:'상시출동 가능', educated:'좋은 학벌', kind:'친절함',
    driving:'운전 능숙', language:'외국어 가능', detail:'꼼꼼함', stamina:'체력 강함',
    night:'야간 가능', clean:'청결 철저', photo:'사진/영상', cooking:'요리 잘 함',
    elderly:'어르신 친화', pet:'반려동물 OK', handyman:'손재주 있음', moving:'이사/운반 경험',
  },
  en: {
    strong:'Strong', speed:'Fast Worker', numbers:'Numbers', design:'Design Eye',
    experience:'Varied Exp.', always_on:'Always On-Call', educated:'Well-Educated', kind:'Friendly',
    driving:'Good Driver', language:'Multilingual', detail:'Detail-Oriented', stamina:'High Stamina',
    night:'Night OK', clean:'Hygienic', photo:'Photo/Video', cooking:'Good Cook',
    elderly:'Elder Care', pet:'Pet-Friendly', handyman:'Handy', moving:'Moving Exp.',
  },
  zh: {
    strong:'体力好', speed:'速度快', numbers:'数字敏感', design:'设计眼光',
    experience:'经验丰富', always_on:'随时待命', educated:'学历好', kind:'友善',
    driving:'驾驶娴熟', language:'外语能力', detail:'细致', stamina:'体力充沛',
    night:'可夜班', clean:'爱清洁', photo:'摄影能力', cooking:'厨艺好',
    elderly:'适合老人', pet:'爱动物', handyman:'心灵手巧', moving:'搬家经验',
  },
  ja: {
    strong:'力が強い', speed:'スピード', numbers:'数字に強い', design:'デザイン眼',
    experience:'多様な経験', always_on:'常時出動OK', educated:'高学歴', kind:'親切',
    driving:'運転上手', language:'外国語可', detail:'几帳面', stamina:'体力自信',
    night:'夜勤可', clean:'清潔感', photo:'写真/動画', cooking:'料理得意',
    elderly:'高齢者OK', pet:'ペット可', handyman:'手先器用', moving:'引越経験',
  },
  vi: {
    strong:'Sức mạnh', speed:'Nhanh nhẹn', numbers:'Giỏi số', design:'Thẩm mỹ',
    experience:'Đa dạng', always_on:'Luôn sẵn sàng', educated:'Học vấn cao', kind:'Thân thiện',
    driving:'Lái xe giỏi', language:'Đa ngôn ngữ', detail:'Tỉ mỉ', stamina:'Sức bền',
    night:'Ca đêm OK', clean:'Sạch sẽ', photo:'Ảnh/Video', cooking:'Nấu ăn giỏi',
    elderly:'Chăm người cao tuổi', pet:'Thích thú cưng', handyman:'Khéo tay', moving:'Kinh nghiệm dọn nhà',
  },
  ru: {
    strong:'Сила', speed:'Скорость', numbers:'Числа', design:'Дизайн',
    experience:'Разн. опыт', always_on:'Всегда готов', educated:'Образование', kind:'Дружелюбие',
    driving:'Вождение', language:'Языки', detail:'Внимательность', stamina:'Выносливость',
    night:'Ночные смены', clean:'Чистоплотность', photo:'Фото/Видео', cooking:'Кулинария',
    elderly:'Уход за пожилыми', pet:'С животными', handyman:'Умелые руки', moving:'Переезды',
  },
};

const TRANSLATIONS = {
  ko: {
    // 내비게이션 (알바생 앱)
    nav_map:'지도', nav_swipe:'스와이프', nav_applications:'내 지원', nav_chats:'채팅', nav_profile:'마이페이지',
    // 서브탭
    tab_status:'지원 현황', tab_bookmarks:'🔖 북마크',
    // 지원 상태
    status_pending:'검토중', status_accepted:'✅ 수락', status_rejected:'❌ 거절', status_cancelled:'취소됨',
    // 버튼
    apply_btn:'⚡ 바로 지원하기', apply_chat_btn:'💬 업주에게 문의하기',
    // 카테고리
    cat_all:'전체', cat_urgent:'🔥 급구만',
    // 기타
    loading:'지도 불러오는 중...',
    search_placeholder:'지역, 업종 검색',
    job_search_placeholder:'공고명, 업체명, 업종 검색',
    work_type_label:'근무형태', wage_label:'시급', location_label:'위치',
    apply_success:'지원이 완료됐어요!', cancel_confirm:'지원을 취소하시겠어요?',
    no_jobs:'주변에 공고가 없어요', profile_incomplete:'프로필을 완성해주세요',
    login_required:'로그인이 필요해요',
    // 마이페이지 공통 UI
    lang_desc:'현재: 한국어',
    pw_toggle:'비밀번호 변경', pw_submit:'변경하기', lang_save:'언어 저장하기',
    terms:'이용약관', privacy:'개인정보처리방침',
    cancel:'취소', save:'저장하기', logout:'로그아웃', withdraw:'회원 탈퇴',
    // 프로필 섹션 헤더
    section_profile:'내 프로필',
    portfolio_title:'포트폴리오 사진',
    profile_main_photo:'프로필 사진 (메인)',
    // 폼 레이블
    birth_label:'생년월일', phone_label:'연락처', gender_label:'성별',
    gender_male:'남성', gender_female:'여성', region_label:'거주지',
    bio_label:'자기소개', exp_label:'경력/특기',
    skill_label:'보유 스킬 태그', skill_add:'추가',
    // 이동수단·강점 섹션
    vehicle_section:'이동수단', multi_select:'복수 선택 가능',
    strength_section:'나의 강점', strength_max:'최대 5개',
    strength_desc:'선택 안해도 됩니다 · 업주에게 어필할 매력포인트를 골라보세요',
    // 언어 섹션
    lang_ability:'구사 가능 언어', lang_other_add:'+ 추가',
    // 증빙서류 섹션
    cert_section:'증빙서류', cert_owner_only:'업주에게만 공개',
    cert_not_reg:'미등록', cert_upload_btn:'업로드',
    cert_health:'보건증', cert_health_desc:'외식·식품 업종 필수',
    cert_driver:'운전면허증', cert_driver_desc:'배달·운반·주차 업종',
    cert_food:'식품위생사 자격증', cert_food_desc:'주방·식품 관련 업종',
    cert_sanitation:'위생교육 수료증', cert_sanitation_desc:'식품취급 종사자 교육',
    cert_other:'기타 자격증/증빙서류', cert_other_desc:'자유롭게 업로드 (복수 가능)',
    // 알림 섹션
    noti_section:'알림 설정',
    noti_chat:'채팅 알림', noti_chat_desc:'새 메시지 수신 시 알림',
    noti_status:'합격/거절 알림', noti_status_desc:'지원 결과 변경 시 알림',
    // 업주 전용
    biz_name_label:'업체명', biz_desc_label:'업체 소개', biz_photo_title:'업체 사진',
  },
  en: {
    nav_map:'Map', nav_swipe:'Swipe', nav_applications:'Applied', nav_chats:'Chat', nav_profile:'My Page',
    tab_status:'Applications', tab_bookmarks:'🔖 Bookmarks',
    status_pending:'Pending', status_accepted:'✅ Accepted', status_rejected:'❌ Rejected', status_cancelled:'Cancelled',
    apply_btn:'⚡ Apply Now', apply_chat_btn:'💬 Message Owner',
    cat_all:'All', cat_urgent:'🔥 Urgent',
    loading:'Loading map...',
    search_placeholder:'Search by area, category',
    job_search_placeholder:'Search title, biz, category',
    work_type_label:'Work Type', wage_label:'Hourly', location_label:'Location',
    apply_success:'Application submitted!', cancel_confirm:'Cancel your application?',
    no_jobs:'No jobs nearby', profile_incomplete:'Please complete your profile',
    login_required:'Login required',
    lang_desc:'Current: English',
    pw_toggle:'Change Password', pw_submit:'Change', lang_save:'Save Language',
    terms:'Terms', privacy:'Privacy Policy',
    cancel:'Cancel', save:'Save', logout:'Logout', withdraw:'Delete Account',
    section_profile:'My Profile',
    portfolio_title:'Portfolio Photos',
    profile_main_photo:'Profile Photo (Main)',
    birth_label:'Birth Date', phone_label:'Phone', gender_label:'Gender',
    gender_male:'Male', gender_female:'Female', region_label:'Region',
    bio_label:'About Me', exp_label:'Experience',
    skill_label:'Skills', skill_add:'Add',
    vehicle_section:'Transport', multi_select:'Multiple OK',
    strength_section:'My Strengths', strength_max:'Up to 5',
    strength_desc:'Optional · Pick what makes you stand out to employers',
    lang_ability:'Languages Spoken', lang_other_add:'+ Add',
    cert_section:'Documents', cert_owner_only:'Visible to employers only',
    cert_not_reg:'Not registered', cert_upload_btn:'Upload',
    cert_health:'Health Cert.', cert_health_desc:'Required for food service',
    cert_driver:"Driver's License", cert_driver_desc:'Delivery/transport',
    cert_food:'Food Hygiene License', cert_food_desc:'Kitchen/food industry',
    cert_sanitation:'Sanitation Training', cert_sanitation_desc:'Food handler education',
    cert_other:'Other Certificates', cert_other_desc:'Upload freely (multiple OK)',
    noti_section:'Notifications',
    noti_chat:'Chat Alerts', noti_chat_desc:'New message notifications',
    noti_status:'Application Alerts', noti_status_desc:'Application status updates',
    biz_name_label:'Business Name', biz_desc_label:'About Business', biz_photo_title:'Business Photos',
  },
  zh: {
    nav_map:'地图', nav_swipe:'滑动', nav_applications:'我的申请', nav_chats:'聊天', nav_profile:'我的',
    tab_status:'申请状态', tab_bookmarks:'🔖 收藏',
    status_pending:'审核中', status_accepted:'✅ 录用', status_rejected:'❌ 拒绝', status_cancelled:'已取消',
    apply_btn:'⚡ 立即申请', apply_chat_btn:'💬 联系雇主',
    cat_all:'全部', cat_urgent:'🔥 急聘',
    loading:'地图加载中...',
    search_placeholder:'搜索地区、职种',
    job_search_placeholder:'搜索职位、公司、职种',
    work_type_label:'工作类型', wage_label:'时薪', location_label:'地点',
    apply_success:'申请成功！', cancel_confirm:'取消申请？',
    no_jobs:'附近没有职位', profile_incomplete:'请完善您的简介',
    login_required:'请先登录',
    lang_desc:'当前语言: 中文',
    pw_toggle:'修改密码', pw_submit:'修改', lang_save:'保存语言',
    terms:'使用条款', privacy:'隐私政策',
    cancel:'取消', save:'保存', logout:'退出登录', withdraw:'注销账户',
    section_profile:'我的资料',
    portfolio_title:'作品集照片',
    profile_main_photo:'头像照片（主要）',
    birth_label:'出生日期', phone_label:'联系方式', gender_label:'性别',
    gender_male:'男', gender_female:'女', region_label:'居住地',
    bio_label:'自我介绍', exp_label:'经历/特长',
    skill_label:'技能标签', skill_add:'添加',
    vehicle_section:'交通方式', multi_select:'可多选',
    strength_section:'我的优势', strength_max:'最多5个',
    strength_desc:'可不选 · 选出您的吸引力给雇主看',
    lang_ability:'会说的语言', lang_other_add:'+ 添加',
    cert_section:'证明文件', cert_owner_only:'仅对雇主公开',
    cert_not_reg:'未登记', cert_upload_btn:'上传',
    cert_health:'健康证', cert_health_desc:'餐饮·食品行业必需',
    cert_driver:'驾驶证', cert_driver_desc:'配送·运输·停车行业',
    cert_food:'食品卫生许可证', cert_food_desc:'厨房·食品相关行业',
    cert_sanitation:'卫生培训证书', cert_sanitation_desc:'食品从业者教育',
    cert_other:'其他证书/证明', cert_other_desc:'可自由上传（可多份）',
    noti_section:'通知设置',
    noti_chat:'聊天通知', noti_chat_desc:'收到新消息时通知',
    noti_status:'录取/拒绝通知', noti_status_desc:'申请结果变更时通知',
    biz_name_label:'店铺名称', biz_desc_label:'店铺简介', biz_photo_title:'店铺照片',
  },
  ja: {
    nav_map:'地図', nav_swipe:'スワイプ', nav_applications:'応募履歴', nav_chats:'チャット', nav_profile:'マイページ',
    tab_status:'応募状況', tab_bookmarks:'🔖 ブックマーク',
    status_pending:'審査中', status_accepted:'✅ 合格', status_rejected:'❌ 不合格', status_cancelled:'キャンセル',
    apply_btn:'⚡ 今すぐ応募', apply_chat_btn:'💬 雇用主に連絡',
    cat_all:'全て', cat_urgent:'🔥 急募',
    loading:'地図読み込み中...',
    search_placeholder:'地域・業種を検索',
    job_search_placeholder:'求人名・店名・業種を検索',
    work_type_label:'勤務形態', wage_label:'時給', location_label:'場所',
    apply_success:'応募が完了しました！', cancel_confirm:'応募をキャンセルしますか？',
    no_jobs:'近くに求人がありません', profile_incomplete:'プロフィールを完成させてください',
    login_required:'ログインが必要です',
    lang_desc:'現在の言語: 日本語',
    pw_toggle:'パスワード変更', pw_submit:'変更する', lang_save:'言語を保存',
    terms:'利用規約', privacy:'プライバシー',
    cancel:'キャンセル', save:'保存する', logout:'ログアウト', withdraw:'退会する',
    section_profile:'マイプロフィール',
    portfolio_title:'ポートフォリオ写真',
    profile_main_photo:'プロフィール写真（メイン）',
    birth_label:'生年月日', phone_label:'連絡先', gender_label:'性別',
    gender_male:'男性', gender_female:'女性', region_label:'居住地',
    bio_label:'自己紹介', exp_label:'経歴/特技',
    skill_label:'スキルタグ', skill_add:'追加',
    vehicle_section:'移動手段', multi_select:'複数選択可',
    strength_section:'私の強み', strength_max:'最大5つ',
    strength_desc:'選択は任意 · 雇用主へのアピールポイントを選んでください',
    lang_ability:'使用可能言語', lang_other_add:'+ 追加',
    cert_section:'証明書類', cert_owner_only:'雇用主のみ公開',
    cert_not_reg:'未登録', cert_upload_btn:'アップロード',
    cert_health:'健康診断書', cert_health_desc:'外食·食品業種必須',
    cert_driver:'運転免許証', cert_driver_desc:'配達·運搬·駐車業種',
    cert_food:'食品衛生責任者', cert_food_desc:'厨房·食品関連業種',
    cert_sanitation:'衛生教育修了証', cert_sanitation_desc:'食品取扱者教育',
    cert_other:'その他資格/証明書', cert_other_desc:'自由にアップロード可',
    noti_section:'通知設定',
    noti_chat:'チャット通知', noti_chat_desc:'新しいメッセージ受信時',
    noti_status:'合否通知', noti_status_desc:'応募結果変更時',
    biz_name_label:'店舗名', biz_desc_label:'店舗紹介', biz_photo_title:'店舗写真',
  },
  vi: {
    nav_map:'Bản đồ', nav_swipe:'Vuốt', nav_applications:'Đã ứng tuyển', nav_chats:'Chat', nav_profile:'Trang của tôi',
    tab_status:'Trạng thái', tab_bookmarks:'🔖 Đã lưu',
    status_pending:'Đang xét', status_accepted:'✅ Đã nhận', status_rejected:'❌ Từ chối', status_cancelled:'Đã hủy',
    apply_btn:'⚡ Ứng tuyển ngay', apply_chat_btn:'💬 Nhắn tin chủ',
    cat_all:'Tất cả', cat_urgent:'🔥 Gấp',
    loading:'Đang tải bản đồ...',
    search_placeholder:'Tìm khu vực, ngành nghề',
    job_search_placeholder:'Tìm tên việc, cửa hàng, ngành',
    work_type_label:'Loại việc', wage_label:'Lương/giờ', location_label:'Địa điểm',
    apply_success:'Ứng tuyển thành công!', cancel_confirm:'Hủy đơn ứng tuyển?',
    no_jobs:'Không có việc gần đây', profile_incomplete:'Vui lòng hoàn thiện hồ sơ',
    login_required:'Cần đăng nhập',
    lang_desc:'Ngôn ngữ: Tiếng Việt',
    pw_toggle:'Đổi mật khẩu', pw_submit:'Đổi', lang_save:'Lưu ngôn ngữ',
    terms:'Điều khoản', privacy:'Chính sách',
    cancel:'Hủy', save:'Lưu', logout:'Đăng xuất', withdraw:'Xóa tài khoản',
    section_profile:'Hồ sơ của tôi',
    portfolio_title:'Ảnh portfolio',
    profile_main_photo:'Ảnh đại diện (chính)',
    birth_label:'Ngày sinh', phone_label:'Số điện thoại', gender_label:'Giới tính',
    gender_male:'Nam', gender_female:'Nữ', region_label:'Khu vực',
    bio_label:'Giới thiệu bản thân', exp_label:'Kinh nghiệm',
    skill_label:'Kỹ năng', skill_add:'Thêm',
    vehicle_section:'Phương tiện', multi_select:'Chọn nhiều',
    strength_section:'Điểm mạnh của tôi', strength_max:'Tối đa 5',
    strength_desc:'Tùy chọn · Chọn điểm nổi bật để thu hút chủ lao động',
    lang_ability:'Ngôn ngữ sử dụng', lang_other_add:'+ Thêm',
    cert_section:'Giấy tờ chứng minh', cert_owner_only:'Chỉ chủ lao động xem',
    cert_not_reg:'Chưa đăng ký', cert_upload_btn:'Tải lên',
    cert_health:'Giấy khám sức khỏe', cert_health_desc:'Bắt buộc cho ngành F&B',
    cert_driver:'Bằng lái xe', cert_driver_desc:'Giao hàng/vận chuyển',
    cert_food:'Chứng chỉ vệ sinh thực phẩm', cert_food_desc:'Ngành bếp/thực phẩm',
    cert_sanitation:'Chứng chỉ an toàn thực phẩm', cert_sanitation_desc:'Giáo dục người xử lý thực phẩm',
    cert_other:'Chứng chỉ khác', cert_other_desc:'Tải nhiều file tùy ý',
    noti_section:'Cài đặt thông báo',
    noti_chat:'Thông báo chat', noti_chat_desc:'Khi nhận tin nhắn mới',
    noti_status:'Thông báo kết quả', noti_status_desc:'Khi trạng thái ứng tuyển thay đổi',
    biz_name_label:'Tên cơ sở', biz_desc_label:'Giới thiệu', biz_photo_title:'Ảnh cơ sở',
  },
  ru: {
    nav_map:'Карта', nav_swipe:'Свайп', nav_applications:'Заявки', nav_chats:'Чат', nav_profile:'Профиль',
    tab_status:'Мои заявки', tab_bookmarks:'🔖 Закладки',
    status_pending:'На рассмотрении', status_accepted:'✅ Принят', status_rejected:'❌ Отказ', status_cancelled:'Отменено',
    apply_btn:'⚡ Подать заявку', apply_chat_btn:'💬 Написать работодателю',
    cat_all:'Все', cat_urgent:'🔥 Срочно',
    loading:'Загрузка карты...',
    search_placeholder:'Поиск по району, типу',
    job_search_placeholder:'Поиск по названию, компании',
    work_type_label:'Тип работы', wage_label:'Ставка/ч', location_label:'Место',
    apply_success:'Заявка отправлена!', cancel_confirm:'Отменить заявку?',
    no_jobs:'Нет вакансий рядом', profile_incomplete:'Заполните профиль',
    login_required:'Необходим вход',
    lang_desc:'Язык: Русский',
    pw_toggle:'Сменить пароль', pw_submit:'Изменить', lang_save:'Сохранить язык',
    terms:'Условия', privacy:'Конфиденц.',
    cancel:'Отмена', save:'Сохранить', logout:'Выйти', withdraw:'Удалить аккаунт',
    section_profile:'Мой профиль',
    portfolio_title:'Фото портфолио',
    profile_main_photo:'Фото профиля (главное)',
    birth_label:'Дата рождения', phone_label:'Телефон', gender_label:'Пол',
    gender_male:'Мужской', gender_female:'Женский', region_label:'Район',
    bio_label:'О себе', exp_label:'Опыт',
    skill_label:'Навыки', skill_add:'Добавить',
    vehicle_section:'Транспорт', multi_select:'Несколько вариантов',
    strength_section:'Мои сильные стороны', strength_max:'До 5',
    strength_desc:'Необязательно · Выберите преимущества для работодателя',
    lang_ability:'Языки', lang_other_add:'+ Добавить',
    cert_section:'Документы', cert_owner_only:'Только для работодателей',
    cert_not_reg:'Не зарегистрировано', cert_upload_btn:'Загрузить',
    cert_health:'Санитарная книжка', cert_health_desc:'Обязательно для общепита',
    cert_driver:'Водительские права', cert_driver_desc:'Доставка/транспорт',
    cert_food:'Лицензия на пищевое пр-во', cert_food_desc:'Кухня/пищевое производство',
    cert_sanitation:'Санитарное обучение', cert_sanitation_desc:'Обучение работников пищевой сферы',
    cert_other:'Другие документы', cert_other_desc:'Загрузить несколько файлов',
    noti_section:'Уведомления',
    noti_chat:'Уведомления чата', noti_chat_desc:'При получении сообщений',
    noti_status:'Уведомления о приёме', noti_status_desc:'При изменении статуса заявки',
    biz_name_label:'Название заведения', biz_desc_label:'О заведении', biz_photo_title:'Фото заведения',
  },
};

// ── 현재 언어 상태 ────────────────────────────────────────────
let currentLang = localStorage.getItem('baroalba_lang') || 'ko';
let _pendingLang = currentLang;

// ── 번역 헬퍼 ─────────────────────────────────────────────────
function t(key) {
  return (TRANSLATIONS[currentLang] || TRANSLATIONS.ko)[key] || key;
}

function tWorkType(code) {
  return (WORK_TYPE_LABELS[currentLang] || WORK_TYPE_LABELS.ko)[code] || code;
}

// ── 언어 선택 (저장 전 미리보기) ────────────────────────────
function selectLang(lang) {
  _pendingLang = lang;
  _LANGS.forEach(l => {
    const b1 = document.getElementById('lang-' + l + '-btn');
    if (b1) { b1.style.background = l === lang ? '#555' : '#f0f0f0'; b1.style.color = l === lang ? '#fff' : '#666'; }
    const b2 = document.getElementById('owner-lang-' + l);
    if (b2) { b2.style.background = l === lang ? '#555' : '#f0f0f0'; b2.style.color = l === lang ? '#fff' : '#666'; }
  });
  ['lang-desc', 'owner-lang-desc'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = (TRANSLATIONS[lang] || TRANSLATIONS.ko).lang_desc + ' (저장 전)';
  });
}

// ── 언어 저장 ─────────────────────────────────────────────────
function saveLang() {
  currentLang = _pendingLang;
  localStorage.setItem('baroalba_lang', currentLang);
  applyLang();
  if (typeof showToast === 'function') showToast('✅ 언어가 저장됐습니다');
}

// ── 전체 UI 번역 적용 (두 앱 공통 ID 모두 처리) ──────────────
const _LANGS = ['ko','en','zh','ja','vi','ru'];

function applyLang() {
  _pendingLang = currentLang;

  // 언어 버튼 활성 상태
  _LANGS.forEach(l => {
    const active = l === currentLang;
    const b1 = document.getElementById('lang-' + l + '-btn');
    if (b1) { b1.style.background = active ? 'var(--red)' : '#f0f0f0'; b1.style.color = active ? '#fff' : '#666'; }
    const b2 = document.getElementById('owner-lang-' + l);
    if (b2) { b2.style.background = active ? 'var(--red)' : '#f0f0f0'; b2.style.color = active ? '#fff' : '#666'; }
  });

  // 언어 설명 텍스트
  ['lang-desc', 'owner-lang-desc'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = t('lang_desc');
  });

  // ── data-i18n 속성 자동 번역 ────────────────────────────────
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });

  // ── data-i18n-ph 속성 placeholder 번역 ─────────────────────
  document.querySelectorAll('[data-i18n-ph]').forEach(el => {
    el.placeholder = t(el.dataset.i18nPh);
  });

  // ── 이동수단 칩 (data-v) ─────────────────────────────────────
  const vl = VEHICLE_LABELS[currentLang] || VEHICLE_LABELS.ko;
  document.querySelectorAll('[data-v]').forEach(el => {
    if (vl[el.dataset.v]) el.textContent = vl[el.dataset.v];
  });

  // ── 강점 칩 (data-s) ─────────────────────────────────────────
  const sl = STRENGTH_LABELS[currentLang] || STRENGTH_LABELS.ko;
  document.querySelectorAll('[data-s]').forEach(el => {
    if (sl[el.dataset.s]) el.textContent = sl[el.dataset.s];
  });

  // ── 공통 버튼 (ID 기반) ──────────────────────────────────────
  const si = (id, key) => { const el = document.getElementById(id); if (el) el.textContent = t(key); };

  si('profile-pw-toggle-btn', 'pw_toggle');
  si('owner-pw-toggle-btn',   'pw_toggle');
  si('profile-pw-submit-btn', 'pw_submit');
  si('owner-pw-submit-btn',   'pw_submit');
  si('lang-save-btn',         'lang_save');
  si('worker-terms-link',   'terms');
  si('owner-terms-link',    'terms');
  si('worker-privacy-link', 'privacy');
  si('owner-privacy-link',  'privacy');
  si('worker-cancel-profile-btn',   'cancel');
  si('owner-settings-cancel-btn',   'cancel');
  si('worker-save-profile-btn',     'save');
  si('owner-settings-save-btn',     'save');
  si('worker-logout-btn', 'logout');
  si('owner-logout-btn',  'logout');
  si('worker-delete-btn', 'withdraw');
  si('owner-delete-btn',  'withdraw');

  // ── 알바생 앱 전용 ──────────────────────────────────────────
  // 하단 내비 레이블
  const navLabels = document.querySelectorAll('.nav-label');
  const navKeys = ['nav_map','nav_swipe','nav_applications','nav_chats','nav_profile'];
  navLabels.forEach((el, i) => { if (navKeys[i]) el.textContent = t(navKeys[i]); });

  // 서브탭
  si('subtab-status', 'tab_status');
  const sbm = document.getElementById('subtab-bookmarks');
  if (sbm) sbm.textContent = t('tab_bookmarks');

  // 검색 placeholder
  const si2 = document.getElementById('search-input');
  if (si2) si2.placeholder = t('search_placeholder');
  const jsi = document.getElementById('job-search-input');
  if (jsi) jsi.placeholder = t('job_search_placeholder');

  // 지도 로딩 텍스트
  const lt = document.querySelector('.loading-txt');
  if (lt) lt.textContent = t('loading');

  // 카테고리 칩
  const allChip = document.querySelector('[data-cat=""]');
  if (allChip) allChip.textContent = t('cat_all');
  const urgentChip = document.querySelector('[data-urgent]');
  if (urgentChip) urgentChip.textContent = t('cat_urgent');

  // 지원 버튼
  const applyBtn = document.getElementById('d-apply-btn');
  if (applyBtn) {
    const isChat = applyBtn.style.background === 'rgb(59, 130, 246)';
    applyBtn.innerHTML = isChat ? t('apply_chat_btn') : t('apply_btn');
  }

  // 근무형태 칩 (data-wt)
  document.querySelectorAll('[data-wt]').forEach(el => { el.textContent = tWorkType(el.dataset.wt); });

  // 지원현황 상태 칩 (data-status)
  document.querySelectorAll('[data-status]').forEach(el => {
    const s = el.dataset.status;
    const key = s==='pending' ? 'status_pending' : s==='accepted' ? 'status_accepted' : s==='rejected' ? 'status_rejected' : 'status_cancelled';
    el.innerHTML = t(key);
  });
}
