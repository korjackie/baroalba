// shared-lang.js — 바로알바 + 업주 앱 공통 번역/언어 관리
// 이 파일 하나만 수정하면 두 앱 모두 반영됩니다.

const WORK_TYPE_LABELS = {
  ko: { regular:'정기알바', short:'단기알바', spot:'스팟', errand:'심부름' },
  en: { regular:'Regular', short:'Short-term', spot:'Spot', errand:'Errand' },
  zh: { regular:'长期兼职', short:'短期兼职', spot:'临时', errand:'跑腿' },
  ja: { regular:'定期バイト', short:'短期バイト', spot:'スポット', errand:'お使い' },
  vi: { regular:'Thường xuyên', short:'Ngắn hạn', spot:'Tạm thời', errand:'Việc vặt' },
  ru: { regular:'Постоянная', short:'Краткосрочная', spot:'Разовая', errand:'Поручение' },
  mn: { regular:'Байнгын', short:'Богино хугацаа', spot:'Нэг удаагийн', errand:'Даалгавар' },
  np: { regular:'नियमित', short:'अल्पकालीन', spot:'एकपटक', errand:'सन्देश' },
};

const VEHICLE_LABELS = {
  ko: { bicycle:'자전거', kickboard:'킥보드', motorcycle:'오토바이', car_compact:'차량 소형', car_midsize:'차량 중형', car_suv:'차량 SUV', car_large:'차량 대형', truck:'트럭/화물' },
  en: { bicycle:'Bicycle', kickboard:'Kick Scooter', motorcycle:'Motorcycle', car_compact:'Compact Car', car_midsize:'Midsize Car', car_suv:'SUV', car_large:'Large Car', truck:'Truck' },
  zh: { bicycle:'自行车', kickboard:'电动滑板车', motorcycle:'摩托车', car_compact:'小型轿车', car_midsize:'中型轿车', car_suv:'SUV', car_large:'大型车', truck:'货车' },
  ja: { bicycle:'自転車', kickboard:'電動キック', motorcycle:'バイク', car_compact:'普通車(小)', car_midsize:'普通車(中)', car_suv:'SUV', car_large:'大型車', truck:'トラック' },
  vi: { bicycle:'Xe đạp', kickboard:'Xe điện', motorcycle:'Xe máy', car_compact:'Ô tô nhỏ', car_midsize:'Ô tô vừa', car_suv:'SUV', car_large:'Ô tô lớn', truck:'Xe tải' },
  ru: { bicycle:'Велосипед', kickboard:'Самокат', motorcycle:'Мотоцикл', car_compact:'Малый авто', car_midsize:'Средний авто', car_suv:'SUV', car_large:'Большой авто', truck:'Грузовик' },
  np: { bicycle:'साइकल', kickboard:'इलेक्ट्रिक स्कुटर', motorcycle:'मोटरसाइकल', car_compact:'साना कार', car_midsize:'मझौला कार', car_suv:'SUV', car_large:'ठूलो कार', truck:'ट्रक' },
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
  np: {
    strong:'शारीरिक बल', speed:'छिटो', numbers:'संख्यामा दक्ष', design:'डिजाइन',
    experience:'विविध अनुभव', always_on:'सधैं तयार', educated:'उच्च शिक्षा', kind:'मित्रवत्',
    driving:'राम्रो चालक', language:'बहुभाषी', detail:'सूक्ष्मता', stamina:'शारीरिक क्षमता',
    night:'राति गर्न सकिन्छ', clean:'सफाई', photo:'फोटो/भिडियो', cooking:'राम्रो पकाउने',
    elderly:'वृद्धसेवा', pet:'पाल्तु जनावर OK', handyman:'हातको काम', moving:'सरसामान ढुवानी',
  },
};

const TRANSLATIONS = {
  ko: {
    // 내비게이션 (알바생 앱)
    nav_home:'홈', nav_map:'지도', nav_swipe:'스와이프', nav_applications:'바로알바', nav_chats:'채팅', nav_profile:'마이페이지',
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
    portfolio_title:'프로필 및 포트폴리오 사진',
    profile_main_photo:'프로필 사진 (메인)',
    // 폼 레이블
    birth_label:'생년월일', phone_label:'연락처', gender_label:'성별',
    gender_male:'남성', gender_female:'여성', region_label:'거주지',
    bio_label:'자기소개', exp_label:'경력/특기',
    skill_label:'보유 스킬 태그', skill_add:'+ 추가',
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
    // 업주 전용 기본
    biz_name_label:'업체명', biz_desc_label:'업체 소개', biz_photo_title:'업체 사진',
    // 업주 앱 — 내비/탭/통계
    owner_badge:'공고관리', owner_account:'공고관리',
    tab_my_postings:'내 공고', tab_applicants:'지원 관리',
    stat_open:'모집중', stat_total_applicants:'총 지원자', stat_confirmed:'확정',
    section_my_postings:'내 공고 목록', section_all_applicants:'전체 지원자',
    // 업주 마이페이지
    community_title:'커뮤니티 게시판', community_desc_owner:'업주전용 게시판 · 알바 정보',
    owner_biz_section:'업체 정보', biz_photo_hint:'(최대 5장 · 첫 번째가 대표)',
    biz_add_photo:'+ 사진 추가', owner_places_section:'내 업체 장소',
    owner_places_hint:'장소를 추가하면 공고 등록 시 바로 선택할 수 있어요',
    owner_plan_section:'이용 플랜', lang_section:'언어 설정',
    plan_free_name:'무료 플랜', plan_free_desc:'공고 3개까지, 일반 노출',
    plan_basic_name:'베이직 플랜', plan_basic_desc:'공고 10개, 지원자 필터, 통계',
    plan_pro_name:'프로 플랜 ⚡', plan_pro_desc:'무제한 공고, 프리미엄 노출, AI 매칭',
    // 업주 패널/모달
    owner_map_hint:'마커를 클릭하면 공고 정보를 볼 수 있습니다',
    chats_panel:'대화 목록', posting_detail_title:'공고 상세',
    applicant_profile:'지원자 프로필', share_posting:'공고 공유하기',
    copy_link:'링크 복사', kakao_share:'카카오톡', share_more:'더 보내기 (SNS/문자)',
    send_btn:'전송', chat_msg_placeholder:'메시지를 입력하세요',
    // 공고 등록 폼
    form_post_new:'공고 등록', form_post_edit:'공고 수정',
    job_type_alba:'일반 알바', job_type_errand:'심부름', job_type_technical:'전문기술직', job_type_care:'돌봄·케어',
    form_category_label:'업종', form_needed_label:'필요 인원', form_wage_label:'시급 (원)',
    form_days_label:'근무 요일', form_start_date:'시작일', form_end_date:'종료일',
    form_start_time:'시작 시간', form_end_time:'종료 시간',
    form_duration_label:'예상 소요시간', form_desc_label:'상세 설명',
    form_submit_post:'공고 등록하기', form_submit_edit:'수정 완료',
    same_day_label:'당일 정산', surge_mode_label:'번개 알바 모드',
    premium_label:'프리미엄 노출', age_limit_label:'만 18세 이상만 지원 가능',
    loc_tab_place:'플레이스', loc_tab_addr:'주소 검색', loc_tab_direct:'직접 입력',
    work_type_spot:'스팟', work_type_short:'단기', work_type_regular:'정기',
    status_open_label:'모집중', status_closed_label:'마감', status_expired_label:'기간만료',
    // 지도/목록 UI
    filter_cat:'카테고리', filter_work_type:'근무타입', filter_lesson:'레슨/과외', filter_technical:'전문기술', filter_more:'필터',
    sort_dist:'거리순', sort_wage_desc:'시급↑', sort_wage_asc:'시급↓', sort_date_asc:'시작빠른순', sort_date_desc:'시작느린순',
    nearby_jobs_fmt:'주변 공고 {n}개',
    today_urgent:'오늘의 급구', ai_rec_title:'맞춤 추천', ai_rec_subtitle:'조회·스와이프 기반',
    status_ongoing:'진행중', status_not_started:'시작 전', cycle_spot:'하루만',
    nearby_no_jobs:'주변에 공고가 없어요', expand_radius:'반경 {n}km로 늘리기',
    lesson_nearby:'내 주변 레슨/과외', lesson_tab_lesson:'🎾 레슨', lesson_tab_tutoring:'📚 과외', lesson_tab_technical:'🔧 전문기술', lesson_reg_title:'레슨/과외 등록', lesson_my_title:'내 레슨/과외 프로필', lesson_my_empty:'등록된 레슨/과외가 없어요', lesson_my_noworker:'알바생 프로필을 먼저 만들어주세요',
  },
  en: {
    nav_home:'Home', nav_map:'Map', nav_swipe:'Swipe', nav_applications:'Applied', nav_chats:'Chat', nav_profile:'My Page',
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
    portfolio_title:'Profile & Portfolio Photos',
    profile_main_photo:'Profile Photo (Main)',
    birth_label:'Birth Date', phone_label:'Phone', gender_label:'Gender',
    gender_male:'Male', gender_female:'Female', region_label:'Region',
    bio_label:'About Me', exp_label:'Experience',
    skill_label:'Skills', skill_add:'+ Add',
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
    owner_badge:'Owner', owner_account:'Owner Account',
    tab_my_postings:'My Jobs', tab_applicants:'Applicants',
    stat_open:'Recruiting', stat_total_applicants:'Total', stat_confirmed:'Confirmed',
    section_my_postings:'My Job Listings', section_all_applicants:'All Applicants',
    community_title:'Community', community_desc_owner:'Owner Board · Job Info',
    owner_biz_section:'Business Info', biz_photo_hint:'(Max 5 · First is main)',
    biz_add_photo:'+ Add Photo', owner_places_section:'My Places',
    owner_places_hint:'Add places to select quickly when posting',
    owner_plan_section:'Plan', lang_section:'Language',
    plan_free_name:'Free Plan', plan_free_desc:'Up to 3 jobs, standard',
    plan_basic_name:'Basic Plan', plan_basic_desc:'10 jobs, filter, stats',
    plan_pro_name:'Pro Plan ⚡', plan_pro_desc:'Unlimited, premium, AI match',
    owner_map_hint:'Click a marker to view the posting',
    chats_panel:'Chats', posting_detail_title:'Posting Detail',
    applicant_profile:'Applicant Profile', share_posting:'Share Job',
    copy_link:'Copy Link', kakao_share:'KakaoTalk', share_more:'Share More (SNS/SMS)',
    send_btn:'Send', chat_msg_placeholder:'Type a message',
    form_post_new:'Post a Job', form_post_edit:'Edit Posting',
    job_type_alba:'General', job_type_errand:'Errand', job_type_technical:'Technical', job_type_care:'Care',
    form_category_label:'Category', form_needed_label:'Staff Needed', form_wage_label:'Hourly (KRW)',
    form_days_label:'Work Days', form_start_date:'Start Date', form_end_date:'End Date',
    form_start_time:'Start Time', form_end_time:'End Time',
    form_duration_label:'Est. Duration', form_desc_label:'Description',
    form_submit_post:'Post Job', form_submit_edit:'Save Changes',
    same_day_label:'Same-Day Pay', surge_mode_label:'Flash Mode',
    premium_label:'Premium', age_limit_label:'18+ Only',
    loc_tab_place:'Place', loc_tab_addr:'Address', loc_tab_direct:'Manual',
    work_type_spot:'Spot', work_type_short:'Short-term', work_type_regular:'Regular',
    status_open_label:'Open', status_closed_label:'Closed', status_expired_label:'Expired',
    filter_cat:'Category', filter_work_type:'Work Type', filter_lesson:'Lesson', filter_technical:'Technical', filter_more:'Filter',
    sort_dist:'Nearest', sort_wage_desc:'Pay↑', sort_wage_asc:'Pay↓', sort_date_asc:'Earliest', sort_date_desc:'Latest',
    nearby_jobs_fmt:'{n} Nearby Jobs',
    today_urgent:"Today's Urgent", ai_rec_title:'For You', ai_rec_subtitle:'Based on views & swipes',
    status_ongoing:'Ongoing', status_not_started:'Not started', cycle_spot:'One day',
    nearby_no_jobs:'No jobs nearby', expand_radius:'Expand to {n}km',
    lesson_nearby:'Nearby Lessons', lesson_tab_lesson:'🎾 Lesson', lesson_tab_tutoring:'📚 Tutoring', lesson_tab_technical:'🔧 Skills', lesson_reg_title:'Add Lesson', lesson_my_title:'My Lessons', lesson_my_empty:'No lessons registered', lesson_my_noworker:'Please create a worker profile first',
  },
  zh: {
    nav_home:'首页', nav_map:'地图', nav_swipe:'滑动', nav_applications:'我的申请', nav_chats:'聊天', nav_profile:'我的',
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
    portfolio_title:'个人资料及作品集照片',
    profile_main_photo:'头像照片（主要）',
    birth_label:'出生日期', phone_label:'联系方式', gender_label:'性别',
    gender_male:'男', gender_female:'女', region_label:'居住地',
    bio_label:'自我介绍', exp_label:'经历/特长',
    skill_label:'技能标签', skill_add:'+ 添加',
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
    owner_badge:'业主', owner_account:'业主账号',
    tab_my_postings:'我的公告', tab_applicants:'求职者',
    stat_open:'招募中', stat_total_applicants:'总申请', stat_confirmed:'已确认',
    section_my_postings:'我的公告列表', section_all_applicants:'全部应聘者',
    community_title:'社区论坛', community_desc_owner:'业主专区·招聘信息',
    owner_biz_section:'业务信息', biz_photo_hint:'(最多5张·首张为封面)',
    biz_add_photo:'+ 添加照片', owner_places_section:'我的地点',
    owner_places_hint:'添加地点后发布公告时可快速选择',
    owner_plan_section:'订阅计划', lang_section:'语言设置',
    plan_free_name:'免费计划', plan_free_desc:'最多3条, 普通展示',
    plan_basic_name:'基础计划', plan_basic_desc:'10条, 筛选, 统计',
    plan_pro_name:'专业计划 ⚡', plan_pro_desc:'无限发布, 高级展示, AI匹配',
    owner_map_hint:'点击标记查看公告信息',
    chats_panel:'对话列表', posting_detail_title:'招聘详情',
    applicant_profile:'求职者资料', share_posting:'分享招聘',
    copy_link:'复制链接', kakao_share:'KakaoTalk', share_more:'更多分享 (SNS/短信)',
    send_btn:'发送', chat_msg_placeholder:'输入消息',
    form_post_new:'发布招聘', form_post_edit:'修改招聘',
    job_type_alba:'普通兼职', job_type_errand:'跑腿', job_type_technical:'专业技术', job_type_care:'护理·照料',
    form_category_label:'行业', form_needed_label:'所需人数', form_wage_label:'时薪(韩元)',
    form_days_label:'工作日', form_start_date:'开始日期', form_end_date:'结束日期',
    form_start_time:'开始时间', form_end_time:'结束时间',
    form_duration_label:'预计时长', form_desc_label:'详细说明',
    form_submit_post:'发布招聘', form_submit_edit:'修改完成',
    same_day_label:'当日结算', surge_mode_label:'闪电模式',
    premium_label:'高级展示', age_limit_label:'仅限18岁以上',
    loc_tab_place:'地点搜索', loc_tab_addr:'地址搜索', loc_tab_direct:'手动输入',
    work_type_spot:'一次性', work_type_short:'短期', work_type_regular:'长期',
    status_open_label:'招募中', status_closed_label:'已截止', status_expired_label:'已过期',
    filter_cat:'类别', filter_work_type:'工作类型', filter_lesson:'课外辅导', filter_technical:'专业技术', filter_more:'筛选',
    sort_dist:'距离近', sort_wage_desc:'时薪↑', sort_wage_asc:'时薪↓', sort_date_asc:'最早开始', sort_date_desc:'最晚开始',
    nearby_jobs_fmt:'附近{n}个招聘',
    today_urgent:'今日急聘', ai_rec_title:'为你推荐', ai_rec_subtitle:'基于浏览和滑动',
    status_ongoing:'进行中', status_not_started:'未开始', cycle_spot:'仅一天',
    nearby_no_jobs:'附近没有工作', expand_radius:'扩大到{n}公里',
    lesson_nearby:'附近课程', lesson_tab_lesson:'🎾 课程', lesson_tab_tutoring:'📚 辅导', lesson_tab_technical:'🔧 专业技能', lesson_reg_title:'添加课程', lesson_my_title:'我的课程', lesson_my_empty:'暂无课程', lesson_my_noworker:'请先创建打工者资料',
  },
  ja: {
    nav_home:'ホーム', nav_map:'地図', nav_swipe:'スワイプ', nav_applications:'応募履歴', nav_chats:'チャット', nav_profile:'マイページ',
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
    portfolio_title:'プロフィール・ポートフォリオ写真',
    profile_main_photo:'プロフィール写真（メイン）',
    birth_label:'生年月日', phone_label:'連絡先', gender_label:'性別',
    gender_male:'男性', gender_female:'女性', region_label:'居住地',
    bio_label:'自己紹介', exp_label:'経歴/特技',
    skill_label:'スキルタグ', skill_add:'+ 追加',
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
    owner_badge:'業主', owner_account:'業主アカウント',
    tab_my_postings:'求人一覧', tab_applicants:'応募者',
    stat_open:'募集中', stat_total_applicants:'総応募', stat_confirmed:'確定',
    section_my_postings:'求人一覧', section_all_applicants:'全応募者',
    community_title:'コミュニティ', community_desc_owner:'業主専用·求人情報',
    owner_biz_section:'業体情報', biz_photo_hint:'(最大5枚·最初がメイン)',
    biz_add_photo:'+ 写真追加', owner_places_section:'マイスポット',
    owner_places_hint:'場所追加で求人登録時すぐ選択できます',
    owner_plan_section:'利用プラン', lang_section:'言語設定',
    plan_free_name:'無料プラン', plan_free_desc:'求人3件まで, 通常表示',
    plan_basic_name:'ベーシックプラン', plan_basic_desc:'求人10件, フィルター, 統計',
    plan_pro_name:'プロプラン ⚡', plan_pro_desc:'無制限, プレミアム, AIマッチング',
    owner_map_hint:'マーカーをクリックで求人情報を表示',
    chats_panel:'会話リスト', posting_detail_title:'求人詳細',
    applicant_profile:'応募者プロフィール', share_posting:'求人をシェア',
    copy_link:'リンクをコピー', kakao_share:'カカオトーク', share_more:'さらに送る (SNS/SMS)',
    send_btn:'送信', chat_msg_placeholder:'メッセージを入力',
    form_post_new:'求人掲載', form_post_edit:'求人編集',
    job_type_alba:'普通バイト', job_type_errand:'お使い', job_type_technical:'専門技術職', job_type_care:'ケア',
    form_category_label:'業種', form_needed_label:'必要人数', form_wage_label:'時給(ウォン)',
    form_days_label:'勤務曜日', form_start_date:'開始日', form_end_date:'終了日',
    form_start_time:'開始時間', form_end_time:'終了時間',
    form_duration_label:'所要時間(目安)', form_desc_label:'詳細説明',
    form_submit_post:'求人を掲載する', form_submit_edit:'修正完了',
    same_day_label:'当日精算', surge_mode_label:'バーストモード',
    premium_label:'プレミアム表示', age_limit_label:'満18歳以上のみ',
    loc_tab_place:'プレイス', loc_tab_addr:'住所検索', loc_tab_direct:'直接入力',
    work_type_spot:'スポット', work_type_short:'短期', work_type_regular:'定期',
    status_open_label:'募集中', status_closed_label:'締め切り', status_expired_label:'期間満了',
    filter_cat:'カテゴリー', filter_work_type:'勤務タイプ', filter_lesson:'レッスン', filter_technical:'専門技術', filter_more:'絞込',
    sort_dist:'近い順', sort_wage_desc:'時給↑', sort_wage_asc:'時給↓', sort_date_asc:'開始早い', sort_date_desc:'開始遅い',
    nearby_jobs_fmt:'近くの求人{n}件',
    today_urgent:'今日の急募', ai_rec_title:'おすすめ', ai_rec_subtitle:'閲覧·スワイプ基準',
    status_ongoing:'進行中', status_not_started:'開始前', cycle_spot:'1日のみ',
    nearby_no_jobs:'近くに求人なし', expand_radius:'半径{n}kmに拡大',
    lesson_nearby:'近くのレッスン', lesson_tab_lesson:'🎾 レッスン', lesson_tab_tutoring:'📚 家庭教師', lesson_tab_technical:'🔧 専門技術', lesson_reg_title:'レッスン登録', lesson_my_title:'マイレッスン', lesson_my_empty:'登録されたレッスンなし', lesson_my_noworker:'先にアルバイト用プロフィールを作成してください',
  },
  vi: {
    nav_home:'Trang chủ', nav_map:'Bản đồ', nav_swipe:'Vuốt', nav_applications:'Đã ứng tuyển', nav_chats:'Chat', nav_profile:'Trang của tôi',
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
    portfolio_title:'Ảnh hồ sơ & portfolio',
    profile_main_photo:'Ảnh đại diện (chính)',
    birth_label:'Ngày sinh', phone_label:'Số điện thoại', gender_label:'Giới tính',
    gender_male:'Nam', gender_female:'Nữ', region_label:'Khu vực',
    bio_label:'Giới thiệu bản thân', exp_label:'Kinh nghiệm',
    skill_label:'Kỹ năng', skill_add:'+ Thêm',
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
    owner_badge:'Chủ', owner_account:'Tài khoản chủ',
    tab_my_postings:'Tin của tôi', tab_applicants:'Ứng viên',
    stat_open:'Đang tuyển', stat_total_applicants:'Tổng đơn', stat_confirmed:'Đã nhận',
    section_my_postings:'Danh sách tin', section_all_applicants:'Tất cả ứng viên',
    community_title:'Cộng đồng', community_desc_owner:'Dành cho chủ · Thông tin việc làm',
    owner_biz_section:'Thông tin cơ sở', biz_photo_hint:'(Tối đa 5 · Đầu tiên đại diện)',
    biz_add_photo:'+ Thêm ảnh', owner_places_section:'Địa điểm của tôi',
    owner_places_hint:'Thêm địa điểm để chọn nhanh khi đăng tin',
    owner_plan_section:'Gói dịch vụ', lang_section:'Cài đặt ngôn ngữ',
    plan_free_name:'Gói miễn phí', plan_free_desc:'Tối đa 3 tin, thông thường',
    plan_basic_name:'Gói cơ bản', plan_basic_desc:'10 tin, lọc, thống kê',
    plan_pro_name:'Gói Pro ⚡', plan_pro_desc:'Không giới hạn, nổi bật, AI',
    owner_map_hint:'Nhấn vào nhãn để xem chi tiết tin',
    chats_panel:'Danh sách chat', posting_detail_title:'Chi tiết tin',
    applicant_profile:'Hồ sơ ứng viên', share_posting:'Chia sẻ tin',
    copy_link:'Sao chép link', kakao_share:'KakaoTalk', share_more:'Chia sẻ thêm (SNS/SMS)',
    send_btn:'Gửi', chat_msg_placeholder:'Nhập tin nhắn',
    form_post_new:'Đăng tin', form_post_edit:'Sửa tin',
    job_type_alba:'Thông thường', job_type_errand:'Việc vặt', job_type_technical:'Kỹ thuật', job_type_care:'Chăm sóc',
    form_category_label:'Ngành', form_needed_label:'Số người cần', form_wage_label:'Lương/giờ (₩)',
    form_days_label:'Ngày làm', form_start_date:'Ngày bắt đầu', form_end_date:'Ngày kết thúc',
    form_start_time:'Giờ bắt đầu', form_end_time:'Giờ kết thúc',
    form_duration_label:'Dự kiến thời gian', form_desc_label:'Mô tả',
    form_submit_post:'Đăng tin ngay', form_submit_edit:'Lưu thay đổi',
    same_day_label:'Thanh toán ngay hôm đó', surge_mode_label:'Chế độ Flash',
    premium_label:'Nổi bật Premium', age_limit_label:'Chỉ từ 18 tuổi trở lên',
    loc_tab_place:'Địa điểm', loc_tab_addr:'Tìm địa chỉ', loc_tab_direct:'Nhập tay',
    work_type_spot:'Một lần', work_type_short:'Ngắn hạn', work_type_regular:'Thường xuyên',
    status_open_label:'Đang tuyển', status_closed_label:'Đã đóng', status_expired_label:'Hết hạn',
    filter_cat:'Danh mục', filter_work_type:'Loại việc', filter_lesson:'Bài học', filter_technical:'Kỹ thuật', filter_more:'Lọc',
    sort_dist:'Gần nhất', sort_wage_desc:'Lương↑', sort_wage_asc:'Lương↓', sort_date_asc:'Sớm nhất', sort_date_desc:'Muộn nhất',
    nearby_jobs_fmt:'{n} việc gần đây',
    today_urgent:'Việc gấp hôm nay', ai_rec_title:'Gợi ý cho bạn', ai_rec_subtitle:'Dựa trên lượt xem',
    status_ongoing:'Đang diễn ra', status_not_started:'Chưa bắt đầu', cycle_spot:'Một ngày',
    nearby_no_jobs:'Không có việc gần đây', expand_radius:'Mở rộng {n}km',
    lesson_nearby:'Lớp học gần đây', lesson_tab_lesson:'🎾 Bài học', lesson_tab_tutoring:'📚 Gia sư', lesson_tab_technical:'🔧 Kỹ năng', lesson_reg_title:'Thêm lớp học', lesson_my_title:'Lớp học của tôi', lesson_my_empty:'Chưa có lớp học nào', lesson_my_noworker:'Vui lòng tạo hồ sơ ứng viên trước',
  },
  mn: {
    nav_home:'Нүүр', nav_map:'Газрын зураг', nav_swipe:'Свайп', nav_applications:'Өргөдлүүд', nav_chats:'Чат', nav_profile:'Миний хуудас',
    tab_status:'Өргөдлийн байдал', tab_bookmarks:'🔖 Хадгалсан',
    status_pending:'Хянаж байна', status_accepted:'✅ Авсан', status_rejected:'❌ Татгалзсан', status_cancelled:'Цуцлагдсан',
    apply_btn:'⚡ Өргөдөл гаргах', apply_chat_btn:'💬 Ажил олгогчид бичих',
    cat_all:'Бүгд', cat_urgent:'🔥 Яаралтай',
    loading:'Газрын зураг ачааллаж байна...',
    search_placeholder:'Дүүрэг, мэргэжил хайх',
    job_search_placeholder:'Ажлын нэр, байгууллага хайх',
    work_type_label:'Ажлын төрөл', wage_label:'Цагийн хөлс', location_label:'Байршил',
    apply_success:'Өргөдөл амжилттай гаргалаа!', cancel_confirm:'Өргөдлөө цуцлах уу?',
    no_jobs:'Ойролцоо ажил байхгүй', profile_incomplete:'Профайлаа бөглөнө үү',
    login_required:'Нэвтрэх шаардлагатай',
    lang_desc:'Хэл: Монгол',
    pw_toggle:'Нууц үг солих', pw_submit:'Солих', lang_save:'Хэл хадгалах',
    terms:'Үйлчилгээний нөхцөл', privacy:'Нууцлалын бодлого',
    cancel:'Цуцлах', save:'Хадгалах', logout:'Гарах', withdraw:'Бүртгэл устгах',
    section_profile:'Миний профайл',
    portfolio_title:'Профайл ба портфолио зураг',
    profile_main_photo:'Профайл зураг (үндсэн)',
    birth_label:'Төрсөн өдөр', phone_label:'Утасны дугаар', gender_label:'Хүйс',
    gender_male:'Эрэгтэй', gender_female:'Эмэгтэй', region_label:'Дүүрэг',
    bio_label:'Өөрийн тухай', exp_label:'Туршлага',
    skill_label:'Ур чадвар', skill_add:'+ Нэмэх',
    vehicle_section:'Тээвэр', multi_select:'Олон сонгох боломжтой',
    strength_section:'Миний давуу тал', strength_max:'Хамгийн ихдээ 5',
    strength_desc:'Заавал биш · Ажил олгогчид харуулах давуу талаа сонгоорой',
    lang_ability:'Ярьдаг хэл', lang_other_add:'+ Нэмэх',
    cert_section:'Баримт бичиг', cert_owner_only:'Зөвхөн ажил олгогч үзнэ',
    cert_not_reg:'Бүртгэлгүй', cert_upload_btn:'Байршуулах',
    cert_health:'Эрүүл мэндийн дэвтэр', cert_health_desc:'Хоол, хүнсний үйлдвэр заавал',
    cert_driver:'Жолооны үнэмлэх', cert_driver_desc:'Хүргэлт, тээвэр',
    cert_food:'Хүнсний эрүүл ахуйн гэрчилгээ', cert_food_desc:'Гал тогоо, хүнсний мэргэжил',
    cert_sanitation:'Ариун цэврийн сургалт', cert_sanitation_desc:'Хүнсний ажилтны сургалт',
    cert_other:'Бусад гэрчилгээ', cert_other_desc:'Олон файл байршуулах боломжтой',
    noti_section:'Мэдэгдлийн тохиргоо',
    noti_chat:'Чатын мэдэгдэл', noti_chat_desc:'Шинэ мессеж ирэхэд',
    noti_status:'Үр дүнгийн мэдэгдэл', noti_status_desc:'Өргөдлийн байдал өөрчлөгдөхөд',
    biz_name_label:'Байгууллагын нэр', biz_desc_label:'Байгууллагын тухай', biz_photo_title:'Байгууллагын зураг',
    owner_badge:'Ажил олгогч', owner_account:'Ажил олгогчийн бүртгэл',
    tab_my_postings:'Миний зар', tab_applicants:'Өргөдөл гаргагчид',
    stat_open:'Ажилтан хайж байна', stat_total_applicants:'Нийт өргөдөл', stat_confirmed:'Баталгаажсан',
    section_my_postings:'Ажлын зарын жагсаалт', section_all_applicants:'Бүх өргөдөл гаргагч',
    community_title:'Нийгэмлэг', community_desc_owner:'Ажил олгогчдод зориулсан',
    owner_biz_section:'Байгууллагын мэдээлэл', biz_photo_hint:'(Хамгийн ихдээ 5 · Эхнийх нь үндсэн)',
    biz_add_photo:'+ Зураг нэмэх', owner_places_section:'Миний байршил',
    owner_places_hint:'Байршил нэмбэл зар оруулахад хурдан сонгоно',
    owner_plan_section:'Тарифын төлөвлөгөө', lang_section:'Хэлний тохиргоо',
    plan_free_name:'Үнэгүй төлөвлөгөө', plan_free_desc:'3 зар хүртэл, энгийн',
    plan_basic_name:'Үндсэн төлөвлөгөө', plan_basic_desc:'10 зар, шүүлтүүр, статистик',
    plan_pro_name:'Про төлөвлөгөө ⚡', plan_pro_desc:'Хязгааргүй, премиум, AI тохируулга',
    owner_map_hint:'Тэмдэглэгчийг дарж зарыг харах',
    chats_panel:'Чатны жагсаалт', posting_detail_title:'Зарын дэлгэрэнгүй',
    applicant_profile:'Өргөдөл гаргагчийн профайл', share_posting:'Зар хуваалцах',
    copy_link:'Холбоос хуулах', kakao_share:'KakaoTalk', share_more:'Цааш хуваалцах',
    send_btn:'Илгээх', chat_msg_placeholder:'Мессеж бичих',
    form_post_new:'Зар оруулах', form_post_edit:'Зар засах',
    job_type_alba:'Ердийн ажил', job_type_errand:'Даалгавар', job_type_technical:'Мэргэжлийн', job_type_care:'Асрамж',
    form_category_label:'Салбар', form_needed_label:'Хэрэгтэй хүний тоо', form_wage_label:'Цагийн хөлс (₩)',
    form_days_label:'Ажлын өдрүүд', form_start_date:'Эхлэх өдөр', form_end_date:'Дуусах өдөр',
    form_start_time:'Эхлэх цаг', form_end_time:'Дуусах цаг',
    form_duration_label:'Таамаглаж буй хугацаа', form_desc_label:'Дэлгэрэнгүй тайлбар',
    form_submit_post:'Зар оруулах', form_submit_edit:'Засварыг хадгалах',
    same_day_label:'Өдрийн тооцоо', surge_mode_label:'Яаралтай горим',
    premium_label:'Онцлох зар', age_limit_label:'18-аас дээш нас',
    loc_tab_place:'Газрын нэр', loc_tab_addr:'Хаяг хайх', loc_tab_direct:'Гараар оруулах',
    work_type_spot:'Нэг удаагийн', work_type_short:'Богино хугацаа', work_type_regular:'Байнгын',
    status_open_label:'Ажилтан хайж байна', status_closed_label:'Хаагдсан', status_expired_label:'Хугацаа дууссан',
    filter_cat:'Ангилал', filter_work_type:'Ажлын төрөл', filter_lesson:'Хичээл', filter_technical:'Мэргэжил', filter_more:'Шүүлтүүр',
    sort_dist:'Ойрыг нь эхлээд', sort_wage_desc:'Цалин↑', sort_wage_asc:'Цалин↓', sort_date_asc:'Эрт эхлэх', sort_date_desc:'Оройтой эхлэх',
    nearby_jobs_fmt:'Ойролцоо {n} ажил',
    today_urgent:'Өнөөдрийн яаралтай', ai_rec_title:'Танд зориулсан', ai_rec_subtitle:'Үзсэн болон свайп дээр үндэслэн',
    status_ongoing:'Явагдаж байна', status_not_started:'Эхлээгүй', cycle_spot:'Нэг өдөр',
    nearby_no_jobs:'Ойролцоо ажил байхгүй', expand_radius:'{n}км хүртэл өргөтгөх',
    lesson_nearby:'Ойролцоох хичээл', lesson_tab_lesson:'🎾 Хичээл', lesson_tab_tutoring:'📚 Хувийн багш', lesson_tab_technical:'🔧 Мэргэжлийн ур чадвар', lesson_reg_title:'Хичээл нэмэх', lesson_my_title:'Миний хичээлүүд', lesson_my_empty:'Бүртгэлтэй хичээл байхгүй', lesson_my_noworker:'Эхлээд ажилтны профайл үүсгэнэ үү',
  },
  ru: {
    nav_home:'Главная', nav_map:'Карта', nav_swipe:'Свайп', nav_applications:'Заявки', nav_chats:'Чат', nav_profile:'Профиль',
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
    portfolio_title:'Фото профиля и портфолио',
    profile_main_photo:'Фото профиля (главное)',
    birth_label:'Дата рождения', phone_label:'Телефон', gender_label:'Пол',
    gender_male:'Мужской', gender_female:'Женский', region_label:'Район',
    bio_label:'О себе', exp_label:'Опыт',
    skill_label:'Навыки', skill_add:'+ Добавить',
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
    owner_badge:'Работодатель', owner_account:'Аккаунт работодателя',
    tab_my_postings:'Мои вакансии', tab_applicants:'Кандидаты',
    stat_open:'Набор', stat_total_applicants:'Всего заявок', stat_confirmed:'Подтверждено',
    section_my_postings:'Список вакансий', section_all_applicants:'Все кандидаты',
    community_title:'Сообщество', community_desc_owner:'Для работодателей · Вакансии',
    owner_biz_section:'О бизнесе', biz_photo_hint:'(Макс. 5 · Первое главное)',
    biz_add_photo:'+ Добавить фото', owner_places_section:'Мои места',
    owner_places_hint:'Добавьте места для быстрого выбора при создании вакансии',
    owner_plan_section:'Тариф', lang_section:'Язык',
    plan_free_name:'Бесплатный план', plan_free_desc:'До 3 вакансий, стандарт',
    plan_basic_name:'Базовый план', plan_basic_desc:'10 вакансий, фильтр, статистика',
    plan_pro_name:'Про план ⚡', plan_pro_desc:'Безлимит, премиум, AI',
    owner_map_hint:'Нажмите маркер для просмотра вакансии',
    chats_panel:'Список чатов', posting_detail_title:'Детали вакансии',
    applicant_profile:'Профиль кандидата', share_posting:'Поделиться вакансией',
    copy_link:'Копировать ссылку', kakao_share:'KakaoTalk', share_more:'Ещё поделиться',
    send_btn:'Отправить', chat_msg_placeholder:'Введите сообщение',
    form_post_new:'Создать вакансию', form_post_edit:'Редактировать',
    job_type_alba:'Обычная работа', job_type_errand:'Поручение', job_type_technical:'Специалист', job_type_care:'Уход',
    form_category_label:'Отрасль', form_needed_label:'Кол-во человек', form_wage_label:'Ставка (₩)',
    form_days_label:'Рабочие дни', form_start_date:'Дата начала', form_end_date:'Дата окончания',
    form_start_time:'Время начала', form_end_time:'Время конца',
    form_duration_label:'Ожид. длит.', form_desc_label:'Описание',
    form_submit_post:'Опубликовать', form_submit_edit:'Сохранить изменения',
    same_day_label:'Расчёт в день работы', surge_mode_label:'Срочный режим',
    premium_label:'Премиум показ', age_limit_label:'Только 18+',
    loc_tab_place:'Место', loc_tab_addr:'Адрес', loc_tab_direct:'Вручную',
    work_type_spot:'Разовая', work_type_short:'Краткосрочная', work_type_regular:'Постоянная',
    status_open_label:'Открыт', status_closed_label:'Закрыт', status_expired_label:'Истёк',
    filter_cat:'Категория', filter_work_type:'Тип работы', filter_lesson:'Урок', filter_technical:'Спецнавык', filter_more:'Фильтр',
    sort_dist:'Ближние', sort_wage_desc:'Оплата↑', sort_wage_asc:'Оплата↓', sort_date_asc:'По дате↑', sort_date_desc:'По дате↓',
    nearby_jobs_fmt:'Вакансий рядом: {n}',
    today_urgent:'Срочно сегодня', ai_rec_title:'Для вас', ai_rec_subtitle:'По просмотрам',
    status_ongoing:'В процессе', status_not_started:'Не начато', cycle_spot:'Один день',
    nearby_no_jobs:'Нет вакансий рядом', expand_radius:'Расш. до {n}км',
    lesson_nearby:'Занятия рядом', lesson_tab_lesson:'🎾 Урок', lesson_tab_tutoring:'📚 Репетитор', lesson_tab_technical:'🔧 Спецнавык', lesson_reg_title:'Добавить урок', lesson_my_title:'Мои занятия', lesson_my_empty:'Нет занятий', lesson_my_noworker:'Сначала создайте профиль работника',
  },
  np: {
    nav_home:'घर', nav_map:'नक्सा', nav_swipe:'स्वाइप', nav_applications:'आवेदन', nav_chats:'कुराकानी', nav_profile:'मेरो पेज',
    tab_status:'आवेदनको स्थिति', tab_bookmarks:'🔖 बुकमार्क',
    status_pending:'समीक्षाधीन', status_accepted:'✅ स्वीकृत', status_rejected:'❌ अस्वीकृत', status_cancelled:'रद्द',
    apply_btn:'⚡ अहिले आवेदन गर्नुहोस्', apply_chat_btn:'💬 नियोक्तालाई सन्देश',
    cat_all:'सबै', cat_urgent:'🔥 अत्यावश्यक',
    loading:'नक्सा लोड हुँदैछ...',
    search_placeholder:'क्षेत्र, पेशा खोज्नुहोस्',
    job_search_placeholder:'काम, कम्पनी खोज्नुहोस्',
    work_type_label:'काम प्रकार', wage_label:'प्रति घण्टा', location_label:'स्थान',
    apply_success:'आवेदन सफलतापूर्वक पठाइयो!', cancel_confirm:'आवेदन रद्द गर्ने?',
    no_jobs:'नजिक कुनै काम छैन', profile_incomplete:'कृपया प्रोफाइल पूरा गर्नुहोस्',
    login_required:'लगइन आवश्यक छ',
    lang_desc:'भाषा: नेपाली',
    pw_toggle:'पासवर्ड परिवर्तन', pw_submit:'परिवर्तन', lang_save:'भाषा सुरक्षित गर्नुहोस्',
    terms:'सेवा सर्तहरू', privacy:'गोपनीयता नीति',
    cancel:'रद्द', save:'सुरक्षित', logout:'बाहिर निस्कनुहोस्', withdraw:'खाता मेटाउनुहोस्',
    section_profile:'मेरो प्रोफाइल',
    portfolio_title:'प्रोफाइल र पोर्टफोलियो फोटो',
    profile_main_photo:'प्रोफाइल फोटो (मुख्य)',
    birth_label:'जन्म मिति', phone_label:'फोन नम्बर', gender_label:'लिंग',
    gender_male:'पुरुष', gender_female:'महिला', region_label:'बस्ने ठाउँ',
    bio_label:'आफूबारे', exp_label:'अनुभव',
    skill_label:'सिप', skill_add:'+ थप्नुहोस्',
    vehicle_section:'यातायात', multi_select:'धेरै छनोट सकिन्छ',
    strength_section:'मेरो विशेषता', strength_max:'अधिकतम ५',
    strength_desc:'वैकल्पिक · नियोक्तालाई देखाउने आफ्ना विशेषता छान्नुहोस्',
    lang_ability:'बोल्न सक्ने भाषाहरू', lang_other_add:'+ थप्नुहोस्',
    cert_section:'प्रमाणपत्रहरू', cert_owner_only:'केवल नियोक्तालाई देखिन्छ',
    cert_not_reg:'दर्ता छैन', cert_upload_btn:'अपलोड',
    cert_health:'स्वास्थ्य प्रमाणपत्र', cert_health_desc:'खाद्य उद्योगमा अनिवार्य',
    cert_driver:'सवारी चालक अनुमतिपत्र', cert_driver_desc:'डेलिभरी/ट्रान्सपोर्ट',
    cert_food:'खाद्य स्वच्छता लाइसेन्स', cert_food_desc:'भान्सा/खाद्य उद्योग',
    cert_sanitation:'स्वच्छता प्रशिक्षण', cert_sanitation_desc:'खाद्य कर्मचारी शिक्षा',
    cert_other:'अन्य प्रमाणपत्र', cert_other_desc:'स्वतन्त्र रूपले अपलोड गर्नुहोस्',
    noti_section:'सूचना सेटिङ',
    noti_chat:'च्याट सूचना', noti_chat_desc:'नयाँ सन्देश प्राप्त हुँदा',
    noti_status:'आवेदन सूचना', noti_status_desc:'आवेदनको स्थिति परिवर्तन हुँदा',
    biz_name_label:'व्यापार नाम', biz_desc_label:'व्यापार विवरण', biz_photo_title:'व्यापार फोटो',
    owner_badge:'नियोक्ता', owner_account:'नियोक्ता खाता',
    tab_my_postings:'मेरो जागिर', tab_applicants:'आवेदकहरू',
    stat_open:'भर्ना', stat_total_applicants:'कुल आवेदन', stat_confirmed:'पुष्टि भयो',
    section_my_postings:'मेरो जागिर सूची', section_all_applicants:'सबै आवेदकहरू',
    community_title:'समुदाय', community_desc_owner:'नियोक्ता बोर्ड · जागिर जानकारी',
    owner_biz_section:'व्यापार जानकारी', biz_photo_hint:'(अधिकतम ५ · पहिलो मुख्य)',
    biz_add_photo:'+ फोटो थप्नुहोस्', owner_places_section:'मेरो ठाउँहरू',
    owner_places_hint:'ठाउँ थप्नुहोस् र जागिर पोस्ट गर्दा छिटो छान्नुहोस्',
    owner_plan_section:'योजना', lang_section:'भाषा सेटिङ',
    plan_free_name:'निःशुल्क योजना', plan_free_desc:'अधिकतम ३ जागिर, सामान्य',
    plan_basic_name:'आधारभूत योजना', plan_basic_desc:'१० जागिर, फिल्टर, तथ्याङ्क',
    plan_pro_name:'प्रो योजना ⚡', plan_pro_desc:'असीमित, प्रिमियम, AI',
    owner_map_hint:'नक्सा मार्कर क्लिक गर्नुहोस्',
    chats_panel:'कुराकानी सूची', posting_detail_title:'जागिर विवरण',
    applicant_profile:'आवेदकको प्रोफाइल', share_posting:'जागिर साझा गर्नुहोस्',
    copy_link:'लिंक कपी गर्नुहोस्', kakao_share:'KakaoTalk', share_more:'थप साझा गर्नुहोस्',
    send_btn:'पठाउनुहोस्', chat_msg_placeholder:'सन्देश लेख्नुहोस्',
    form_post_new:'जागिर पोस्ट गर्नुहोस्', form_post_edit:'जागिर सम्पादन',
    job_type_alba:'सामान्य', job_type_errand:'सन्देश', job_type_technical:'प्राविधिक', job_type_care:'हेरचाह',
    form_category_label:'श्रेणी', form_needed_label:'चाहिने जनशक्ति', form_wage_label:'प्रति घण्टा (₩)',
    form_days_label:'काम गर्ने दिन', form_start_date:'सुरु मिति', form_end_date:'अन्त मिति',
    form_start_time:'सुरु समय', form_end_time:'अन्त समय',
    form_duration_label:'अनुमानित अवधि', form_desc_label:'विवरण',
    form_submit_post:'जागिर पोस्ट गर्नुहोस्', form_submit_edit:'परिवर्तन सुरक्षित',
    same_day_label:'उही दिन भुक्तानी', surge_mode_label:'फ्ल्यास मोड',
    premium_label:'प्रिमियम', age_limit_label:'केवल १८+ मात्र',
    loc_tab_place:'ठाउँ', loc_tab_addr:'ठेगाना', loc_tab_direct:'म्यानुअल',
    work_type_spot:'एकपटक', work_type_short:'अल्पकालीन', work_type_regular:'नियमित',
    status_open_label:'खुला', status_closed_label:'बन्द', status_expired_label:'म्याद सकियो',
    filter_cat:'श्रेणी', filter_work_type:'काम प्रकार', filter_lesson:'पाठ', filter_technical:'प्राविधिक', filter_more:'फिल्टर',
    sort_dist:'नजिक', sort_wage_desc:'तलब↑', sort_wage_asc:'तलब↓', sort_date_asc:'सबैभन्दा पहिले', sort_date_desc:'पछि',
    nearby_jobs_fmt:'नजिक {n} काम',
    today_urgent:'आजको अत्यावश्यक', ai_rec_title:'तपाईंका लागि', ai_rec_subtitle:'हेराइ र स्वाइपमा आधारित',
    status_ongoing:'जारी छ', status_not_started:'सुरु भएको छैन', cycle_spot:'एक दिन',
    nearby_no_jobs:'नजिक कुनै काम छैन', expand_radius:'{n}km सम्म विस्तार गर्नुहोस्',
    lesson_nearby:'नजिकका पाठहरू', lesson_tab_lesson:'🎾 पाठ', lesson_tab_tutoring:'📚 ट्युटरिङ', lesson_tab_technical:'🔧 सिप', lesson_reg_title:'पाठ थप्नुहोस्', lesson_my_title:'मेरो पाठहरू', lesson_my_empty:'कुनै पाठ दर्ता छैन', lesson_my_noworker:'पहिले कर्मचारी प्रोफाइल बनाउनुहोस्',
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
  const RED = getComputedStyle(document.documentElement).getPropertyValue('--red').trim() || '#C8102E';
  _LANGS.forEach(l => {
    const isSel = l === lang;
    const b1 = document.getElementById('lang-' + l + '-btn');
    if (b1) { b1.style.background = isSel ? RED : '#f0f0f0'; b1.style.color = isSel ? '#fff' : '#666'; }
    const b2 = document.getElementById('owner-lang-' + l);
    if (b2) { b2.style.background = isSel ? RED : '#f0f0f0'; b2.style.color = isSel ? '#fff' : '#666'; }
  });
  const isSaved = lang === currentLang;
  ['lang-desc', 'owner-lang-desc'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = (TRANSLATIONS[lang] || TRANSLATIONS.ko).lang_desc + (isSaved ? '' : ' (저장 전)');
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
const _LANGS = ['ko','en','zh','ja','vi','ru','mn','np'];

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

  // ── data-i18n-btn: 선택 안 된 상태일 때만 번역 (▾ 추가) ───
  document.querySelectorAll('[data-i18n-btn]').forEach(el => {
    if (!el.classList.contains('sel')) el.textContent = t(el.dataset.i18nBtn) + ' ▾';
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

  // ── 앱별 내비 레이블 ──────────────────────────────────────────
  const navLabels = [...document.querySelectorAll('.nav-label')];
  // 통합앱(바로알바.html)은 항상 알바생 nav 사용. 업주패널은 별도 처리.
  if (false) {
    const ownerNavKeys = ['nav_map','tab_my_postings','tab_applicants','nav_chats','nav_profile'];
    navLabels.forEach((el, i) => { if (ownerNavKeys[i]) el.textContent = t(ownerNavKeys[i]); });
    // 탭 버튼
    const tabBtns = document.querySelectorAll('.tab-btn');
    if (tabBtns[0]) tabBtns[0].textContent = t('tab_my_postings');
    if (tabBtns[1]) tabBtns[1].textContent = t('tab_applicants');
    // 통계 라벨
    const statLabels = document.querySelectorAll('.stat-label');
    const statKeys = ['stat_open','stat_total_applicants','stat_confirmed'];
    statLabels.forEach((el, i) => { if (statKeys[i]) el.textContent = t(statKeys[i]); });
    // 공고 폼 — 근무형태 버튼
    [['wt-spot','work_type_spot'],['wt-short','work_type_short'],['wt-regular','work_type_regular']].forEach(([id, key]) => si(id, key));
    // 공고 폼 — 위치 탭
    const lt1 = document.getElementById('loc-tab-1'); if (lt1) lt1.textContent = '🏠 ' + t('loc_tab_place');
    const lt2 = document.getElementById('loc-tab-2'); if (lt2) lt2.textContent = '🗺 ' + t('loc_tab_addr');
    const lt3 = document.getElementById('loc-tab-3'); if (lt3) lt3.textContent = '✏️ ' + t('loc_tab_direct');
    // 채팅 placeholder
    const ci = document.getElementById('chat-input'); if (ci) ci.placeholder = t('chat_msg_placeholder');
  } else {
    // ── 알바생 앱 전용 ────────────────────────────────────────────
    // 5탭: 지도/스와이프/바로알바/채팅/마이페이지
    const navKeys = ['nav_home','nav_map','nav_applications','nav_chats','nav_profile'];
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
  }

  // 카테고리 칩
  const allChip = document.querySelector('[data-cat=""]');
  if (allChip) allChip.textContent = t('cat_all');
  const urgentChip = document.querySelector('[data-urgent]');
  if (urgentChip) urgentChip.textContent = t('cat_urgent');

  // ── 필터 버튼 ─────────────────────────────────────────────
  const _fCat = document.getElementById('flt-cat-btn');
  if (_fCat && !_fCat.classList.contains('sel')) _fCat.textContent = t('filter_cat') + ' ▾';
  const _fType = document.getElementById('flt-type-btn');
  if (_fType && !_fType.classList.contains('sel')) _fType.textContent = t('filter_work_type') + ' ▾';
  const _fLesson = document.getElementById('flt-lesson-btn');
  if (_fLesson && !_fLesson.classList.contains('sel')) _fLesson.textContent = t('filter_lesson') + ' ▾';
  const _fTech = document.getElementById('flt-technical-btn');
  if (_fTech && !_fTech.classList.contains('sel')) _fTech.textContent = t('filter_technical') + ' ▾';

  // ── 정렬 라벨 ─────────────────────────────────────────────
  const _sortEl = document.getElementById('sort-label');
  if (_sortEl && typeof currentSort !== 'undefined') {
    const _smap = { dist:'sort_dist', wage_desc:'sort_wage_desc', wage_asc:'sort_wage_asc', date_asc:'sort_date_asc', date_desc:'sort_date_desc' };
    _sortEl.textContent = t(_smap[currentSort] || 'sort_dist');
  }

  // ── 주변 공고 카운트 ──────────────────────────────────────
  const _cntEl = document.getElementById('job-count');
  const _cntParent = _cntEl?.parentElement;
  if (_cntParent && _cntParent.classList.contains('sheet-count')) {
    const _n = _cntEl ? _cntEl.textContent : '0';
    _cntParent.innerHTML = t('nearby_jobs_fmt').replace('{n}', `<span id="job-count">${_n}</span>`);
  }

  // ── 오늘의 급구 / AI 추천 헤더 ───────────────────────────
  const _urgTitle = document.getElementById('urgent-feed-title');
  if (_urgTitle) _urgTitle.textContent = '🔥 ' + t('today_urgent');
  const _aiTitle = document.getElementById('ai-rec-title');
  if (_aiTitle) _aiTitle.textContent = '✨ ' + t('ai_rec_title');
  const _aiSub = document.getElementById('ai-rec-subtitle');
  if (_aiSub) _aiSub.textContent = t('ai_rec_subtitle');

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
