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
    // 마이페이지 공통 UI (두 앱 모두 사용)
    lang_desc:'현재: 한국어',
    pw_toggle:'비밀번호 변경', pw_submit:'변경하기', lang_save:'언어 저장하기',
    terms:'이용약관', privacy:'개인정보처리방침',
    cancel:'취소', save:'저장하기', logout:'로그아웃', withdraw:'회원 탈퇴',
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
    // 알바생 앱 버튼 ID: lang-ko-btn
    const b1 = document.getElementById('lang-' + l + '-btn');
    if (b1) { b1.style.background = l === lang ? '#555' : '#f0f0f0'; b1.style.color = l === lang ? '#fff' : '#666'; }
    // 업주 앱 버튼 ID: owner-lang-ko
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

  // ── 공통 버튼 (두 앱 모두 처리, 없으면 조용히 스킵) ────────
  const si = (id, key) => { const el = document.getElementById(id); if (el) el.textContent = t(key); };

  // 비밀번호 변경
  si('profile-pw-toggle-btn', 'pw_toggle');   // 알바생
  si('owner-pw-toggle-btn',   'pw_toggle');   // 업주
  si('profile-pw-submit-btn', 'pw_submit');
  si('owner-pw-submit-btn',   'pw_submit');

  // 언어 저장
  si('lang-save-btn', 'lang_save');

  // 약관
  si('worker-terms-link',   'terms');
  si('owner-terms-link',    'terms');
  si('worker-privacy-link', 'privacy');
  si('owner-privacy-link',  'privacy');

  // 저장/취소
  si('worker-cancel-profile-btn',   'cancel');
  si('owner-settings-cancel-btn',   'cancel');
  si('worker-save-profile-btn',     'save');
  si('owner-settings-save-btn',     'save');

  // 로그아웃/회원탈퇴
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
