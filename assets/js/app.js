
// ── 전역 상태 ─────────────────────────────────────────────
const { createClient } = supabase;
const db = createClient(APP_CONFIG.SUPABASE_URL, APP_CONFIG.SUPABASE_ANON_KEY);

// 로그아웃되면 로그인 화면으로 이동
db.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT') { window.location.href = '/login.html'; return; }
  if ((event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') && session?.access_token) {
    if (window.AndroidBridge?.saveAuthToken) window.AndroidBridge.saveAuthToken(session.access_token);
    // 토큰 갱신 시 SW에도 전달 (인라인 답장 기능 — Supabase는 1시간마다 토큰 자동 갱신)
    navigator.serviceWorker?.controller?.postMessage({ type: 'SET_AUTH', token: session.access_token, userId: session.user.id });
  }
});

let kakaoMap = null;
const _savedCenter = JSON.parse(localStorage.getItem('mapCenter') || 'null');
let mapCenter = _savedCenter || { lat: APP_CONFIG.DEFAULT_LAT, lng: APP_CONFIG.DEFAULT_LNG };
function saveMapCenter(lat, lng) {
  mapCenter = { lat, lng };
  localStorage.setItem('mapCenter', JSON.stringify(mapCenter));
}
let currentRadius = APP_CONFIG.DEFAULT_RADIUS_M;
let currentCategory = '';   // 하위 호환용 (레거시)
let currentWorkType = '';   // 하위 호환용 (레거시)
let selectedDate = null;        // 날짜 슬라이더 필터
let selectedDistrict = null;    // 구 필터
const _subwayCache = {};        // 지하철역 검색 캐시
let selectedCategories = new Set();  // 업종 복수 선택
let selectedWorkTypes  = new Set();  // 형태 복수 선택 (regular/short/spot/errand)
let filterRemote = false;
let includeLesson = false;           // 레슨/과외 마커 포함
let urgentOnly = false;
let sortByWage = false;
let sortMode = 'dist'; // dist|wage_desc|wage_asc|date_asc|date_desc
let jobs = [];
let _jobsLoaded = false;
let _myAge = null;
let _langFilterActive = false;
let _myLangs = [];
let markers = [];
let overlays = [];
let selectedJobId = null;
let jobImgs = []; // {src: blobUrl|existingUrl, file: File|null} - 순서 = 대표 우선
let moimImgs = []; // 모임 사진 (jobImgs와 동일 구조)
let _jobImgCropQueue = [];
let _jobImgDragSrc = null;
let myLocationOverlay = null;
let _locationWatchId = null;
let minWageFilter = 0;
let dateFilter = '';
let timeFilter = '';
let currentUser = null;
let isGuest = false;
let _isAdmin = false;
let sheetState = 'peek'; // peek | half | full
let _myAppsCache = null;
let _calYear = null, _calMonth = null;

// ── 뒤로가기 전역 핸들러 ──────────────────────────────────
const _PANEL_CLOSE_MAP = {
  'panel-home':          () => { const sr = document.getElementById('home-search-results'); if (sr && sr.style.display !== 'none') clearHomeFilter(); },
  'panel-dashboard':     () => { /* 기본 탭, 닫지 않음 */ },
  'panel-chats':         () => { /* 기본 탭, 닫지 않음 */ },
  'panel-lesson-manage': () => closeLessonManagePanel(),
  'panel-community':     () => closeCommunityPanel(),
  'panel-applications':  () => document.getElementById('panel-applications')?.classList.remove('show'),
  'panel-profile':       () => document.getElementById('panel-profile')?.classList.remove('show'),
  'panel-posting-detail':() => closePostingDetail(),
  'panel-app-job-detail':() => document.getElementById('panel-app-job-detail')?.classList.remove('show'),
  'panel-owner-settings':() => { document.getElementById('panel-owner-settings')?.classList.remove('show'); ownerSwitchTab('postings', document.querySelectorAll('.tab-btn')[0]); },
  'panel-owner-chats':   () => { document.getElementById('panel-owner-chats')?.classList.remove('show'); ownerSwitchTab('postings', document.querySelectorAll('.tab-btn')[0]); },
  'panel-owner-map':     () => { document.getElementById('panel-owner-map')?.classList.remove('show'); ownerSwitchTab('postings', document.querySelectorAll('.tab-btn')[0]); },
  'panel-moim':          () => closeMoimPanel(),
  'panel-moim-create':   () => closeMoimCreate(),
  'panel-moim-detail':   () => closeMoimDetail(),
  'panel-moim-chat':     () => closeMoimChat(),
};
// ── 바텀시트 핸들바 드래그로 닫기 (공용) ───────────────────
// handleEl: 핸들바 요소, panelEl: 드래그에 따라 움직일 패널, closeFn: 임계값 이상 당겼을 때 호출할 닫기 함수
function bindSheetDragClose(handleEl, panelEl, closeFn) {
  if (!handleEl || !panelEl || handleEl.dataset.dragBound) return;
  handleEl.dataset.dragBound = '1';
  handleEl.style.touchAction = 'none';
  handleEl.style.cursor = 'grab';
  let startY = 0, dragging = false;
  const move = y => {
    if (!dragging) return;
    const dy = Math.max(0, y - startY);
    panelEl.style.transform = `translateY(${dy}px)`;
  };
  const end = y => {
    if (!dragging) return;
    dragging = false;
    const dy = Math.max(0, y - startY);
    panelEl.style.transition = 'transform 0.25s ease';
    if (dy > 80) {
      panelEl.style.transform = 'translateY(100%)';
      setTimeout(() => { panelEl.style.transition = ''; panelEl.style.transform = ''; closeFn(); }, 200);
    } else {
      panelEl.style.transform = '';
      setTimeout(() => { panelEl.style.transition = ''; }, 250);
    }
  };
  handleEl.addEventListener('touchstart', e => { startY = e.touches[0].clientY; dragging = true; panelEl.style.transition = 'none'; }, { passive: true });
  handleEl.addEventListener('touchmove',  e => move(e.touches[0].clientY), { passive: true });
  handleEl.addEventListener('touchend',   e => end(e.changedTouches[0].clientY), { passive: true });
  handleEl.addEventListener('mousedown', e => {
    startY = e.clientY; dragging = true; panelEl.style.transition = 'none';
    const mv = ev => move(ev.clientY);
    const up = ev => { end(ev.clientY); window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); };
    window.addEventListener('mousemove', mv);
    window.addEventListener('mouseup', up);
  });
}

// ── 범용 바텀시트 (openBottomSheet(html)로 임의 내용 삽입) ──
function openBottomSheet(html) {
  const overlay = document.getElementById('generic-bottom-sheet-overlay');
  const panel   = document.getElementById('generic-bottom-sheet-panel');
  const handle  = document.getElementById('generic-bottom-sheet-handle');
  const body    = document.getElementById('generic-bottom-sheet-body');
  if (!overlay || !panel || !body) return;
  body.innerHTML = html;
  overlay.style.display = 'block';
  bindSheetDragClose(handle, panel, closeBottomSheet);
}
function closeBottomSheet() {
  const overlay = document.getElementById('generic-bottom-sheet-overlay');
  if (overlay) overlay.style.display = 'none';
}

// ── 가운데 FAB("바로+") 등록 액션시트 ──────────────────────
// 바로알바/바로모임/바로만남을 아우르는 통합 서비스가 되면서 이 버튼을
// 조회용 대시보드가 아니라 "등록/개설" 전용 액션으로 재정의함
function openCreateActionSheet() {
  const row = (icon, title, desc, onclick) => `
    <div onclick="${onclick}" style="display:flex;align-items:center;gap:14px;padding:14px 20px;cursor:pointer">
      <div style="width:44px;height:44px;border-radius:12px;background:#f8f8f8;display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0">${icon}</div>
      <div style="min-width:0">
        <div style="font-size:15px;font-weight:800;color:#222">${title}</div>
        <div style="font-size:12px;color:#999;margin-top:2px">${desc}</div>
      </div>
    </div>`;
  openBottomSheet(`
    <div style="padding:4px 20px 12px;font-size:17px;font-weight:900;color:#111">무엇을 등록하시겠어요?</div>
    <div style="display:flex;flex-direction:column;padding-bottom:8px">
      ${row('🍻', '바로모임 개설', '취미·운동·스터디 등 모임을 열어보세요', "closeBottomSheet();openMoimPanel(true)")}
      ${row('💼', '공고 등록', '알바 공고를 올리고 지원자를 받아보세요', "closeBottomSheet();openOwnerPanel('postings')")}
      ${row('📚', '레슨/과외 등록', '레슨·과외 공고를 등록·관리해보세요', "closeBottomSheet();openLessonManagePanel()")}
      ${row('📢', '모임/만남 개설 요청하기', '"이런 모임 만들어주세요" 요청을 남겨보세요', "closeBottomSheet();openGatheringRequestSheet()")}
    </div>
  `);
}

// ── 모임/만남 개설 요청 (바로미팅/바로스팟은 관리자 큐레이션 방식이라
// 유저가 직접 개설할 수 없어, 대신 요청만 남기고 관리자가 검토 후 개설) ──
function openGatheringRequestSheet() {
  if (!currentUser || isGuest) { showLoginPrompt('로그인 후 요청할 수 있어요','모임/만남 개설 요청은 로그인이 필요합니다.'); return; }
  openBottomSheet(`
    <div style="padding:4px 20px 4px;font-size:17px;font-weight:900;color:#111">모임/만남 개설 요청하기</div>
    <div style="padding:0 20px 4px;font-size:12.5px;color:#999;line-height:1.5">원하는 지역과 종류를 남겨주시면 검토 후 개설해드려요.</div>
    <div style="display:flex;flex-direction:column;gap:8px;padding:12px 20px 20px">
      <select id="greq-type" style="padding:11px 14px;border:1.5px solid #eee;border-radius:10px;font-size:14px;outline:none;background:#fff">
        <option value="moim">🍻 바로모임</option>
        <option value="baromeeting">💕 바로만남 (바로미팅·바로스팟)</option>
      </select>
      <input id="greq-region" type="text" placeholder="희망 지역 (예: 판교, 강남역)" style="padding:11px 14px;border:1.5px solid #eee;border-radius:10px;font-size:14px;outline:none">
      <textarea id="greq-desc" placeholder="어떤 모임/미팅을 원하시는지 자유롭게 적어주세요" rows="3" style="padding:11px 14px;border:1.5px solid #eee;border-radius:10px;font-size:14px;outline:none;resize:none;font-family:inherit"></textarea>
      <button onclick="submitGatheringRequest()" style="padding:13px;background:var(--red);color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:800;cursor:pointer">요청 보내기</button>
    </div>
  `);
}
async function submitGatheringRequest() {
  const region = document.getElementById('greq-region').value.trim();
  const description = document.getElementById('greq-desc').value.trim();
  const request_type = document.getElementById('greq-type').value;
  if (!region) { showToast('희망 지역을 입력해주세요'); return; }
  const { error } = await db.from('gathering_requests').insert({
    requester_id: currentUser.id, request_type, region, description: description || null,
  });
  if (error) { showToast('요청 실패: ' + error.message); return; }
  closeBottomSheet();
  showToast('✅ 요청이 접수됐어요. 검토 후 개설해드릴게요!');
}

history.pushState({ panel: null }, ''); // 초기 기준점
window.addEventListener('popstate', () => {
  // 1. 공고 상세 (detail-overlay .open)
  const detailEl = document.getElementById('detail-overlay');
  if (detailEl && detailEl.classList.contains('open')) {
    detailEl.classList.remove('open');
    selectedJobId = null;
    history.pushState({ panel: null }, '');
    return;
  }
  // 2. 레슨 상세 모달 (.open)
  const lessonModal = document.getElementById('lesson-detail-modal');
  if (lessonModal && lessonModal.classList.contains('open')) {
    closeLessonDetailModal();
    history.pushState({ panel: null }, '');
    return;
  }
  // 3. 공유 모달 (.open)
  const shareEl = document.getElementById('share-overlay');
  if (shareEl && shareEl.classList.contains('open')) {
    closeShareModal();
    history.pushState({ panel: null }, '');
    return;
  }
  // 4. 채팅 오버레이 - 업주 side (display:flex)
  const chatEl = document.getElementById('chat-overlay');
  if (chatEl && chatEl.style.display === 'flex') {
    closeChat(false);
    history.pushState({ panel: null }, '');
    return;
  }
  // 4-1. 알바생 채팅 오버레이 - wchat (display:flex)
  const wchatEl = document.getElementById('wchat-overlay');
  if (wchatEl && wchatEl.style.display === 'flex') {
    closeWChat(false);
    history.pushState({ panel: null }, '');
    return;
  }
  // 5. 외국인환영 언어 패널
  const foreignerEl = document.getElementById('panel-foreigner-lang');
  if (foreignerEl && foreignerEl.style.display === 'block') {
    closeForeignerLangPanel();
    history.pushState({ panel: null }, '');
    return;
  }
  // 6. RANK 패널
  const rankEl = document.getElementById('panel-rank');
  if (rankEl && rankEl.style.display === 'block') {
    closeRankPanel();
    history.pushState({ panel: null }, '');
    return;
  }
  // 6-0.5. 바로미팅 상세 (바로만남 패널 위에 뜨는 오버레이 - 먼저 닫혀야 함)
  const baromeetDetailEl = document.getElementById('baromeet-detail-overlay');
  if (baromeetDetailEl && baromeetDetailEl.style.display === 'flex') {
    closeBaromeetDetail();
    history.pushState({ panel: null }, '');
    return;
  }
  // 6-1. 바로만남 패널
  const mannnamEl = document.getElementById('mannnam-panel');
  if (mannnamEl && (mannnamEl.style.display === 'flex' || mannnamEl.style.display === 'block')) {
    closeMannnamPanel();
    history.pushState({ panel: null }, '');
    return;
  }
  // 6-2. 포인트 내역 패널
  const pointHistEl = document.getElementById('point-history-panel');
  if (pointHistEl && pointHistEl.style.display === 'block') {
    closePointHistory();
    history.pushState({ panel: null }, '');
    return;
  }
  // 6-3. 포인트 충전 바텀시트
  const pointChargeEl = document.getElementById('point-charge-overlay');
  if (pointChargeEl && pointChargeEl.style.display === 'flex') {
    closePointCharge();
    history.pushState({ panel: null }, '');
    return;
  }
  // 6-4. 쿠폰 바텀시트
  const couponEl = document.getElementById('couponSheet');
  if (couponEl && couponEl.classList.contains('show')) {
    closeCouponSheet();
    history.pushState({ panel: null }, '');
    return;
  }
  // 6-5. 범용 바텀시트 (바로스팟 이용권 구매 등)
  const genericSheetEl = document.getElementById('generic-bottom-sheet-overlay');
  if (genericSheetEl && genericSheetEl.style.display === 'block') {
    closeBottomSheet();
    history.pushState({ panel: null }, '');
    return;
  }
  // 7. 공고 등록/수정 폼 오버레이 (.open)
  const formEl = document.getElementById('form-overlay');
  if (formEl && formEl.classList.contains('open')) {
    closePostingForm();
    history.pushState({ panel: null }, '');
    return;
  }
  // 7.5. 홈 검색결과 화면 (급구/외국인환영/AI추천/전체보기 등으로 진입) - 안 닫으면
  // 뒤로가기 후에도 "외국인 환영 공고 0개" 같은 이전 필터 라벨이 홈 화면에 계속 남아있었음
  const homeSrEl = document.getElementById('home-search-results');
  if (homeSrEl && homeSrEl.style.display !== 'none') {
    clearHomeFilter();
    history.pushState({ panel: null }, '');
    return;
  }
  // 8. 홈 필터 오버레이 (display:block)
  const filterEl = document.getElementById('home-filter-overlay');
  if (filterEl && filterEl.style.display === 'block') {
    closeHomeFilter();
    history.pushState({ panel: null }, '');
    return;
  }
  // 8.5. 소프트 키보드 방어 — INPUT/TEXTAREA 포커스 중엔 full-panel 닫지 않음
  // Android WebView에서 키보드 표시/숨김 시 spurious popstate가 발생해 패널이 닫히는 버그 방지
  const _focEl = document.activeElement;
  if (_focEl && (_focEl.tagName === 'INPUT' || _focEl.tagName === 'TEXTAREA')) {
    history.pushState({ panel: null }, '');
    return;
  }
  // 9. full-panel.show (기존)
  const visible = [...document.querySelectorAll('.full-panel.show')]
    .sort((a, b) => (parseInt(b.style.zIndex) || 100) - (parseInt(a.style.zIndex) || 100));
  if (visible.length) {
    const id = visible[0].id;
    const closeFn = _PANEL_CLOSE_MAP[id];
    if (closeFn) closeFn();
    else visible[0].classList.remove('show');
    history.pushState({ panel: null }, '');
    return;
  }
  // 아무것도 없음 — 히스토리 기준점 재설정 (브라우저 뒤로가기/지도 이탈 방지)
  history.pushState({ panel: null }, '');
});


// ── 상태표시줄 높이 감지 (standalone PWA에서 env(safe-area-inset-top)=0인 경우 대비) ──
(function() {
  var probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:env(safe-area-inset-top,0px);pointer-events:none;visibility:hidden';
  document.documentElement.appendChild(probe);
  var sat = probe.offsetHeight;
  probe.remove();
  var isStandalone = window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
  if (isStandalone && sat === 0) sat = 28; // Android 비노치 기기 기본 상태표시줄 높이
  document.documentElement.style.setProperty('--status-bar-h', sat + 'px');
  // --status-bar-h를 계산만 하고 실제 CSS 어디서도 쓰지 않던 문제 수정 -
  // --sat/--sat-safe가 이 값을 참조하도록 --sat 자체를 덮어써서, 상태표시줄이
  // 헤더를 가리던 모든 화면(바로만남 패널·마이페이지 서브패널 등)에 일괄 반영.
  // 네이티브 Android 앱은 MainActivity.java가 이후 실측값으로 다시 덮어써 정확해짐.
  if (sat > 0) document.documentElement.style.setProperty('--sat', sat + 'px');
})();

// ── 초기화 ────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  // head 안전 타이머 즉시 취소 — 여기서 reveal 타이밍을 직접 제어
  if (window._headVizTimer) { clearTimeout(window._headVizTimer); window._headVizTimer = null; }
  // 앱 버전 캐시 강제 초기화 — SW CacheStorage + HTTP캐시 모두 우회.
  // 예전엔 <head> 인라인 스크립트가 URL에 ?_v= 를 붙여 리다이렉트하고 여기서 그 값을 검사했는데,
  // head 스크립트의 버전 상수가 이 _APP_V와 따로 놀아서(수동 동기화 필요) 어긋난 뒤로
  // 캐시 초기화 자체가 계속 실행되지 않던 버그가 있었음. localStorage 하나만 기준으로 삼아 단순화.
  const _APP_V = '440';
  const _lastV = localStorage.getItem('_baroV');
  if (_lastV !== _APP_V) {
    localStorage.setItem('_baroV', _APP_V);
    if ('caches' in window) await caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))));
    if (navigator.serviceWorker) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
    }
    // 이번 로드는 이미 구버전 리소스로 실행 중일 수 있으므로 캐시 삭제 후 한 번 새로고침해서
    // 완전히 새로 받아옴 (localStorage를 먼저 갱신했으므로 다음 로드에선 이 블록이 재실행되지 않음)
    location.reload();
    return;
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js?v=440').catch(()=>{});
    // controllerchange 리스너 없음: 앱 사용 중 새 SW 배포 시 강제 리로드 방지
  }

  // 카카오 공유 SDK 초기화 (지도 SDK kakao.maps와 별개)
  if (window.Kakao && !Kakao.isInitialized()) Kakao.init(APP_CONFIG.KAKAO_JS_KEY);

  // 세션 확인 (카카오 SDK는 동기 로드이므로 이미 준비됨)
  const { data: { session } } = await db.auth.getSession();

  if (session) {
    currentUser = session.user;
    if (window._pendingFCMToken) _saveFCMToken(window._pendingFCMToken); // 로그인 전 수신된 토큰 저장
    if (window.AndroidBridge?.saveAuthToken) window.AndroidBridge.saveAuthToken(session.access_token);
    // SW에 인증 토큰 저장 (알림 인라인 답장 기능용)
    if (navigator.serviceWorker?.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'SET_AUTH', token: session.access_token, userId: session.user.id });
    }
    // 어드민 여부 로드 (app_admins 테이블) — Naver 등 일부 OAuth는 email이 user_metadata에만 존재
    const _authEmail = session.user.email || session.user.user_metadata?.email || '';
    db.from('app_admins').select('email').eq('email', _authEmail).maybeSingle()
      .then(({ data: ad }) => {
        _isAdmin = !!ad;
        const ab = document.getElementById('admin-banner');
        if (ab) ab.style.display = _isAdmin ? 'flex' : 'none';
      });
    // 나이·언어 미리 로드
    db.from('workers').select('age, birth_date, languages').eq('kakao_uid', session.user.id).maybeSingle()
      .then(({ data: w }) => {
        if (!w) return;
        _myAge = w.age || (w.birth_date ? calcAgeFromBirth(w.birth_date) : null);
        _myLangs = Array.isArray(w.languages) ? w.languages : [];
        _updateLangFilterBtn();
      });
    // 신규 가입 감지 → 환영 이메일 (가입 후 5분 이내 + 중복 발송 방지)
    const _createdAgo = Date.now() - new Date(session.user.created_at).getTime();
    if (_createdAgo < 5 * 60 * 1000 && !localStorage.getItem('welcome_sent_' + session.user.id)) {
      localStorage.setItem('welcome_sent_' + session.user.id, '1');
      _sendWelcomeEmail(session.user);
    }
    // 알림 배지 초기화
    setTimeout(updateNotiBadge, 1500);
    setTimeout(checkPushPermission, 3000); // 알림 배너 표시
    // 결제 완료 후 리다이렉트 처리
    setTimeout(handlePaymentResult, 500);
    setTimeout(handlePointPaymentResult, 600);
    // 광고 배너 로드
    loadAdBanner();
    const isCommunityMode = !!new URLSearchParams(location.search).get('community');
    if (isCommunityMode) {
      setTimeout(() => openCommunityPanel(), 800);
    }
  } else if (localStorage.getItem('baroalba_guest') || new URLSearchParams(location.search).get('job')) {
    isGuest = true;
    document.getElementById('guest-banner').classList.add('show');
    // 프로필 탭을 "로그인"으로 강조
    const profileNav = document.querySelector('.nav-item:last-child');
    profileNav.querySelector('.nav-icon').textContent = '\u{1F511}';
    profileNav.querySelector('.nav-label').textContent = '로그인';
    profileNav.querySelector('.nav-label').style.color = 'var(--red)';
  } else {
    goToLogin();
    return;
  }


  const _tryInitMap = () => {
    try {
      if (window.kakao && window.kakao.maps) { initMap(); }
      else {
        let _tries = 0;
        const _wait = setInterval(() => {
          _tries++;
          if (window.kakao && window.kakao.maps) { clearInterval(_wait); initMap(); }
          else if (_tries > 50) { clearInterval(_wait); document.getElementById('map-loading')?.classList.add('hidden'); console.error('kakao.maps 로드 타임아웃'); }
        }, 200);
      }
    } catch(e) { console.error('initMap 실패:', e); document.getElementById('map-loading')?.classList.add('hidden'); }
  };
  _tryInitMap();
  setupSheet();
  setupSearch();
  applyLang();
  loadCategoriesWorker();
  const deepJobId = new URLSearchParams(location.search).get('job') || sessionStorage.getItem('pending_deep_job');
  if (deepJobId) sessionStorage.removeItem('pending_deep_job');
  const _dParams = new URLSearchParams(location.search);
  const deepChatId   = _dParams.get('chat') || sessionStorage.getItem('pending_deep_chat');
  const deepChatView = _dParams.get('view') || sessionStorage.getItem('pending_deep_chat_view');
  if (deepChatId) { sessionStorage.removeItem('pending_deep_chat'); sessionStorage.removeItem('pending_deep_chat_view'); }

  // 탭 파라미터 먼저 확인 — 홈은 loadJobs 전에 즉시 표시해야 지도가 기본으로 보이는 현상 방지
  const tabParam = new URLSearchParams(location.search).get('tab');
  const _navItems = document.querySelectorAll('.nav-item');
  if (tabParam === 'applications' || tabParam === 'dashboard') {
    if (_navItems[2]) setNav(_navItems[2], 'dashboard');
  } else if (tabParam === 'profile') {
    if (_navItems[4]) setNav(_navItems[4], 'profile');
  } else {
    // 기본 진입: 홈으로 바로 표시 (지도 깜빡임 제거)
    if (_navItems[0]) setNav(_navItems[0], 'home');
  }

  // 급구 배너 미리 조회 (숨겨진 상태에서 병렬 실행)
  _preloadHomeUrgent();

  // loadJobs 완료 후 공개 → 급구 건수가 처음부터 최종값으로 표시됨
  const _revealTimer = setTimeout(() => { document.documentElement.style.visibility = ''; }, 5000);
  await loadJobs();
  clearTimeout(_revealTimer);
  document.documentElement.style.visibility = '';
  // loadJobs 완료 후 홈 job 섹션 갱신 (저장 위치 기반 초기 조회 결과 반영)
  if (!tabParam || tabParam === 'home') {
    const _hp = document.getElementById('panel-home');
    if (_hp?.classList.contains('show')) {
      clearTimeout(_homeJobRetryTimer);
      _renderHomeUrgent(); _renderHomeAI(); _renderHomeSameDay();
      _renderHomeRecent(); _renderHomeForeigner();
    }
  }


  if (deepJobId) openDeepLink(deepJobId);
  // 바로모임 딥링크 처리
  const deepMoimCode = _dParams.get('moim');
  if (deepMoimCode) setTimeout(() => handleMoimDeeplink(deepMoimCode), 800);
  // 바로미팅 딥링크 처리
  const deepBaromeetId = _dParams.get('baromeet');
  if (deepBaromeetId) setTimeout(() => handleBaromeetDeeplink(deepBaromeetId), 800);
  if (deepChatId && currentUser) setTimeout(() => {
    if (deepChatView === 'worker') openWChat(deepChatId, '업주');
    else openChat(deepChatId, '채팅');
  }, 500);
  setupRealtime();
  setupMessageNotifications();
  if (currentUser) initOwnerFeatures().catch(console.error);

  // 키보드 가림 방지: 슬라이드업 패널을 키보드 위로 올리고 높이 축소
  if (window.visualViewport) {
    let _vpT;
    const _adjKb = () => {
      clearTimeout(_vpT);
      _vpT = setTimeout(() => {
        const kbH = Math.max(0, window.innerHeight - window.visualViewport.height);
        // 슬라이드업 오버레이 계열 모두 처리
        document.querySelectorAll('.overlay-panel.show, .full-panel.show, [id$="-overlay"].open, [id$="-overlay"].show').forEach(el => {
          const panel = el.classList.contains('detail-panel') ? el : el.querySelector('.detail-panel, [style*="border-radius:20px"]');
          if (kbH > 80) {
            el.style.paddingBottom = kbH + 'px';
            if (panel) {
              panel.style.maxHeight = (window.visualViewport.height - 60) + 'px';
              const f = document.activeElement;
              if (f && f.matches('input,textarea')) {
                const fRect = f.getBoundingClientRect();
                const vis = window.visualViewport.height - 16;
                if (fRect.bottom > vis) panel.scrollTop += fRect.bottom - vis + 16;
              }
            }
          } else {
            el.style.paddingBottom = '';
            if (panel) panel.style.maxHeight = '';
          }
        });
      }, 50);
    };
    window.visualViewport.addEventListener('resize', _adjKb);
  }

  // 서비스워커 메시지: 알림 탭 → 이미 열린 앱 창에 채팅 바로 열기
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', e => {
      if (e.data?.type === 'OPEN_CHAT' && e.data.appId) {
        if (e.data.view === 'worker') openWChat(e.data.appId, '업주');
        else openChat(e.data.appId, '채팅');
      }
      // SW 인라인 답장 전송 실패 시 — 앱에서 직접 전송
      if (e.data?.type === 'PENDING_REPLY' && e.data.appId && e.data.content) {
        (async () => {
          // currentUser가 null이면 세션 재조회 (앱이 백그라운드였던 경우 대비)
          let uid = currentUser?.id;
          if (!uid) {
            const { data: { session: _s } } = await db.auth.getSession();
            uid = _s?.user?.id;
          }
          if (!uid) { showToast('답장 전송 실패 — 다시 로그인 후 시도해주세요'); return; }
          const { error } = await db.from('messages').insert({
            application_id: e.data.appId,
            sender_id: uid,
            content: e.data.content,
            is_read: false,
          });
          if (!error) showToast('답장을 전송했습니다 ✓');
          else showToast(`답장 전송 실패 (${error.code || error.message}) — 채팅창에서 확인해주세요`);
        })();
      }
    });
  }
});

// ── 카카오맵 초기화 ───────────────────────────────────────
function initMap() {
  const container = document.getElementById('map');
  const options = {
    center: new kakao.maps.LatLng(mapCenter.lat, mapCenter.lng),
    level: 5
  };
  kakaoMap = new kakao.maps.Map(container, options);

  // 지도 이동 시 재검색
  kakao.maps.event.addListener(kakaoMap, 'dragend', () => {
    const c = kakaoMap.getCenter();
    saveMapCenter(c.getLat(), c.getLng());
    loadJobs();
  });

  // 내 위치 시도
  moveToMyLocation(true);
  document.getElementById('map-loading').classList.add('hidden');
}

// ── 신규 가입 환영 이메일 ─────────────────────────────────
async function _sendWelcomeEmail(user) {
  try {
    const email = user.email || user.user_metadata?.email;
    if (!email) return;
    const name     = user.user_metadata?.name || user.user_metadata?.full_name || '회원';
    const provider = user.app_metadata?.provider || 'social';
    await fetch('/api/welcome-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, name, provider })
    });
  } catch(e) { /* 환영 이메일 실패는 조용히 무시 */ }
}

// ── 브라우저 접속 여부 감지 → 헤더 "앱 설치" 버튼 표시 ──────
(function() {
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const inNativeApp  = /BaroAlbaApp/i.test(navigator.userAgent);
  if (!isStandalone && !inNativeApp) {
    const btn = document.getElementById('header-install-btn');
    if (btn) btn.style.display = 'block';
  }
})();

function headerInstallClick() {
  if (_installPrompt) {
    _installPrompt.prompt();
    _installPrompt.userChoice.then(c => { if (c.outcome === 'accepted') { document.getElementById('header-install-btn').style.display = 'none'; } _installPrompt = null; });
  } else {
    // iOS / 설치 불가 브라우저 → 안내 토스트
    const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (isIOS) showToast('Safari에서 공유 → 홈 화면에 추가를 선택하세요', 4000);
    else showToast('브라우저 메뉴 → 앱 설치(홈 화면에 추가)를 선택하세요', 4000);
  }
}

// ── PWA 설치 배너 ─────────────────────────────────────────
let _installPrompt = null;

function _showInstallBanner() {
  const banner = document.getElementById('install-banner');
  if (!banner) return;
  banner.style.display = 'flex';
  document.querySelector('.top-bar').style.top = 'calc(var(--header-h) + ' + banner.offsetHeight + 'px)';
}
function _hideInstallBanner() {
  const banner = document.getElementById('install-banner');
  if (!banner) return;
  banner.style.display = 'none';
  document.querySelector('.top-bar').style.top = 'var(--header-h)';
}

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  _installPrompt = e;
  if (!localStorage.getItem('pwa_install_dismissed')) _showInstallBanner();
});

window.addEventListener('appinstalled', () => {
  _hideInstallBanner();
  _installPrompt = null;
  const hBtn = document.getElementById('header-install-btn');
  if (hBtn) hBtn.style.display = 'none';
});

function triggerInstall() {
  if (!_installPrompt) return;
  _installPrompt.prompt();
  _installPrompt.userChoice.then(choice => {
    if (choice.outcome === 'accepted') _hideInstallBanner();
    _installPrompt = null;
  });
}

function dismissInstall() {
  _hideInstallBanner();
  localStorage.setItem('pwa_install_dismissed', '1');
}

// iOS Safari 홈화면 추가 안내 배너
(function() {
  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const isStandalone = window.navigator.standalone === true;
  const inNativeApp = /BaroAlbaApp/i.test(navigator.userAgent);
  if (!isIOS || isStandalone || inNativeApp || localStorage.getItem('ios_install_dismissed')) return;
  setTimeout(() => {
    if (window.navigator.standalone) return;
    const el = document.createElement('div');
    el.id = 'ios-install-banner';
    el.style.cssText = 'position:fixed;bottom:calc(var(--nav-h) + var(--sab-safe) + 10px);left:12px;right:12px;background:#1a1a1a;color:#fff;border-radius:16px;padding:14px 16px;z-index:400;box-shadow:0 4px 20px rgba(0,0,0,0.35);display:flex;align-items:center;gap:12px;animation:slideUp 0.3s ease';
    el.innerHTML = `<span style="font-size:22px">📲</span><div style="flex:1"><div style="font-size:13px;font-weight:800;margin-bottom:2px">앱처럼 사용하기</div><div style="font-size:11px;color:#bbb">하단 <b style="color:#fff">공유 버튼</b> → <b style="color:#fff">홈 화면에 추가</b></div></div><button onclick="document.getElementById('ios-install-banner').remove();localStorage.setItem('ios_install_dismissed','1')" style="background:none;border:none;color:#888;font-size:20px;cursor:pointer;padding:4px 6px;line-height:1">✕</button>`;
    document.body.appendChild(el);
  }, 3000);
})();

// ── 딥링크 ────────────────────────────────────────────────
async function openDeepLink(jobId) {
  // 이미 로드된 목록에서 먼저 탐색
  let job = jobs.find(j => j.id === jobId);
  if (!job) {
    // 없으면 DB에서 직접 조회 (다른 지역 공고)
    const { data, error: dlErr } = await db.from('job_postings')
      .select(`id, title, category, base_wage, current_wage, status, lat, lng, address,
               start_time, duration_hours, needed_count, filled_count,
               description, surge_enabled, surge_amount, surge_interval_min, surge_max_wage,
               work_type, same_day_payment, noshow_deposit, is_remote,
               businesses(name, rating, kindness_rating, review_count)`)
      .eq('id', jobId).single();
    if (!data) { showToast('해당 공고를 찾을 수 없어요' + (dlErr ? ': ' + dlErr.message : '')); return; }
    const b = data.businesses || {};
    job = {
      ...data,
      wage_delta: data.current_wage - data.base_wage,
      biz_name: b.name, biz_rating: b.rating,
      biz_kindness: b.kindness_rating, biz_reviews: b.reviews_count,
      distance_m: null,
    };
    jobs = [job, ...jobs];
    // 지도 해당 위치로 이동 (비대면 공고는 lat/lng 없음)
    if (job.lat && job.lng) {
      saveMapCenter(job.lat, job.lng);
      kakaoMap.setCenter(new kakao.maps.LatLng(job.lat, job.lng));
      renderMarkers();
    }
  }
  openDetail(job.id);
}

// ── 공고 불러오기 ─────────────────────────────────────────
async function loadCategoriesWorker() {
  try {
    const { data } = await db.from('job_categories').select('name,icon').eq('active', true).order('display_order');
    if (!data?.length) return;
    const row = document.getElementById('filter-row');
    if (!row) return;
    // 이사도우미가 DB에 없으면 항상 추가
    if (!data.find(c => c.name === '이사도우미')) data.push({ name:'이사도우미', icon:'' });
    // 전체 + 급구만 칩은 유지하고 중간 카테고리 칩을 교체
    const allChip = row.querySelector('[data-cat=""]');
    const urgentChip = row.querySelector('[data-urgent]');
    // 기존 카테고리 칩 제거 (전체, 급구만 제외)
    row.querySelectorAll('.chip:not([data-urgent])').forEach(c => { if (c !== allChip) c.remove(); });
    // 새 칩 삽입 (urgentChip 앞에)
    data.forEach(cat => {
      const chip = document.createElement('div');
      chip.className = 'chip';
      chip.dataset.cat = cat.name;
      chip.textContent = cat.name;
      chip.onclick = () => setCategory(chip, cat.name);
      row.insertBefore(chip, urgentChip);
    });
  } catch(e) { /* keep hardcoded chips */ }
}

async function loadJobs() {
  if (_currentMapMode === 'moim') return; // 모임 모드에서는 알바 공고 로드 안 함
  const _skList = document.getElementById('job-cards-container');
  if (_skList) _skList.innerHTML = Array(4).fill(`<div class="sk-card"><div class="sk-line" style="height:16px;width:55%;margin-bottom:8px"></div><div class="sk-line" style="height:22px;width:38%;margin-bottom:10px"></div><div style="display:flex;gap:8px"><div class="sk-line" style="height:13px;width:30%"></div><div class="sk-line" style="height:13px;width:25%"></div></div></div>`).join('');
  try {
    // 지도가 초기화되었으면 현재 시각적 중심 사용 (저장값 override)
    if (kakaoMap) {
      const c = kakaoMap.getCenter();
      mapCenter = { lat: c.getLat(), lng: c.getLng() };
    }
    const { data, error } = await db.rpc('nearby_jobs', {
      user_lat: mapCenter.lat,
      user_lng: mapCenter.lng,
      radius_meters: currentRadius,
      job_category: selectedCategories.size === 1 ? [...selectedCategories][0] : null
    });
    if (error) throw error;

    let result = data || [];

    // is_remote 패치 (nearby_jobs RPC가 미포함 시 보정)
    if (result.length && result[0].is_remote === undefined) {
      const _remIds = result.map(j => j.id);
      const { data: _remFix } = await db.from('job_postings').select('id, is_remote').in('id', _remIds);
      if (_remFix) {
        const _remMap = new Map(_remFix.map(d => [d.id, d.is_remote || false]));
        result = result.map(j => ({ ...j, is_remote: _remMap.get(j.id) ?? false }));
      }
    }

    // 비대면 공고 별도 로드 (lat/lng=null → nearby_jobs 미포함)
    const { data: _remotePosts } = await db.from('job_postings')
      .select(`id, title, category, base_wage, current_wage, status, lat, lng, address,
               start_time, duration_hours, needed_count, filled_count, description,
               surge_enabled, surge_amount, surge_interval_min, surge_max_wage,
               work_type, same_day_payment, noshow_deposit, age_limit, return_bonus,
               preferred_languages, is_remote, work_end_date, work_days,
               businesses(name, rating, kindness_rating, review_count)`)
      .eq('is_remote', true)
      .in('status', ['open', 'urgent'])
      .order('created_at', { ascending: false })
      .limit(30);
    if (_remotePosts) {
      const _existIds = new Set(result.map(j => j.id));
      for (const rj of _remotePosts) {
        if (!_existIds.has(rj.id)) {
          const _rb = rj.businesses || {};
          result.push({
            ...rj,
            wage_delta: (rj.current_wage || 0) - (rj.base_wage || 0),
            biz_name: _rb.name || '', biz_rating: _rb.rating,
            biz_kindness: _rb.kindness_rating,
            distance_m: null,
          });
        }
      }
    }

    // 이미 지원한 공고 → 제외하지 않고 applied_status 마킹 (그레이 표시용)
    if (currentUser && !isGuest) {
      const wid = await _getWorkerId() || '';
      if (wid) {
        const { data: myApps } = await db.from('applications')
          .select('job_posting_id, status')
          .eq('worker_id', wid)
          .not('status', 'in', '("cancelled")');
        if (myApps?.length) {
          const appliedMap = new Map(myApps.map(a => [a.job_posting_id, a.status]));
          result = result.map(j => ({ ...j, applied_status: appliedMap.get(j.id) || null }));
        }
      }
    }

    // 기간 만료된 공고 제외
    const todayStr = new Date().toISOString().slice(0, 10);
    result = result.filter(j => !j.work_end_date || j.work_end_date >= todayStr);

    // preferred_languages 배치 fetch (RPC 미포함 대비)
    if (result.length && result[0].preferred_languages === undefined) {
      const ids = result.map(j => j.id);
      const { data: langData } = await db.from('job_postings').select('id, preferred_languages').in('id', ids);
      if (langData) {
        const langMap = new Map(langData.map(d => [d.id, d.preferred_languages || []]));
        result = result.map(j => ({ ...j, preferred_languages: langMap.get(j.id) || [] }));
      }
    }

    // 복수 카테고리 클라이언트 필터 (2개 이상 선택 시)
    if (selectedCategories.size > 1) result = result.filter(j => selectedCategories.has(j.category));
    // 전문기술 mid 필터
    if (includeTechnical) {
      if (_technicalFilterMids.size > 0) {
        const validCats = new Set([..._technicalFilterMids]);
        result = result.filter(j => j.job_type === 'technical' && validCats.has(j.category));
      } else {
        result = result.filter(j => j.job_type === 'technical');
      }
    }
    // 형태 복수 필터
    if (selectedWorkTypes.size > 0) {
      result = result.filter(j => {
        if (selectedWorkTypes.has('spot'))    return !j.work_type || j.work_type === 'spot';
        return selectedWorkTypes.has(j.work_type);
      });
    }
    if (urgentOnly) result = result.filter(j => j.status === 'urgent');
    if (filterRemote) result = result.filter(j => j.is_remote);
    if (_langFilterActive && _myLangs.length) result = result.filter(j => (j.preferred_languages || []).some(l => _myLangs.includes(l)));
    if      (sortMode === 'wage_desc') result.sort((a,b) => b.current_wage - a.current_wage);
    else if (sortMode === 'wage_asc')  result.sort((a,b) => a.current_wage - b.current_wage);
    else if (sortMode === 'date_asc')  result.sort((a,b) => (a.start_time||'').localeCompare(b.start_time||''));
    else if (sortMode === 'date_desc') result.sort((a,b) => (b.start_time||'').localeCompare(a.start_time||''));
    else if (sortByWage) result.sort((a,b) => b.current_wage - a.current_wage);

    // 고급 필터
    if (minWageFilter > 10000) result = result.filter(j => (j.current_wage || 0) >= minWageFilter);
    if (dateFilter) {
      const now = new Date();
      const todayD = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const tmrD   = new Date(todayD.getTime() + 86400000);
      const day    = now.getDay();
      const sat    = new Date(todayD.getTime() + ((6 - day + 7) % 7) * 86400000);
      const sun    = new Date(sat.getTime() + 86400000);
      result = result.filter(j => {
        if (!j.start_time) return false;
        const d = new Date(j.start_time);
        const jd = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        if (dateFilter === 'today') return jd.getTime() === todayD.getTime();
        if (dateFilter === 'tmr')   return jd.getTime() === tmrD.getTime();
        if (dateFilter === 'wknd')  return jd.getTime() === sat.getTime() || jd.getTime() === sun.getTime();
        return true;
      });
    }
    if (timeFilter) {
      result = result.filter(j => {
        if (!j.start_time) return false;
        const h = new Date(j.start_time).getHours();
        if (timeFilter === 'am')  return h >= 6  && h < 12;
        if (timeFilter === 'pm')  return h >= 12 && h < 18;
        if (timeFilter === 'eve') return h >= 18;
        return true;
      });
    }

    // 필터 없이 주변 공고 0개면 → 위치 무관 전체 최신 공고 fallback (홈화면용)
    const _noActiveFilter = !selectedCategories.size && !selectedWorkTypes.size && !urgentOnly && !filterRemote && !minWageFilter && !dateFilter && !timeFilter;
    if (result.length === 0 && _noActiveFilter) {
      const { data: _fallback } = await db.from('job_postings')
        .select(`id, title, category, base_wage, current_wage, status, lat, lng, address,
                 start_time, duration_hours, needed_count, filled_count, description,
                 surge_enabled, surge_amount, surge_interval_min, surge_max_wage,
                 work_type, same_day_payment, noshow_deposit, age_limit, return_bonus,
                 preferred_languages, is_remote, work_end_date, work_days,
                 biz_name, businesses(name, rating, kindness_rating, review_count)`)
        .in('status', ['open', 'urgent'])
        .order('created_at', { ascending: false })
        .limit(50);
      if (_fallback?.length) {
        result = _fallback.map(j => {
          const _rb = j.businesses || {};
          return { ...j, wage_delta: (j.current_wage||0)-(j.base_wage||0), biz_name: j.biz_name||_rb.name||'', biz_rating: _rb.rating, biz_kindness: _rb.kindness_rating, distance_m: null };
        });
      }
    }

    jobs = result;
    _jobsLoaded = true;
    // 홈 패널이 표시 중이면 job 섹션 갱신 (GPS 위치 확정 후 재호출 시 반영)
    if (document.getElementById('panel-home')?.classList.contains('show')) {
      try { _renderHomeUrgent(); } catch(e) {}
      try { _renderHomeAI(); } catch(e) {}
      try { _renderHomeSameDay(); } catch(e) {}
      try { _renderHomeRecent(); } catch(e) {}
      try { _renderHomeForeigner(); } catch(e) {}
    }
    renderMarkers();
    renderDateSlider();
    renderDistrictFilter();
    renderList();
  } catch(e) {
    jobs = [];
    renderMarkers();
    renderList();
    // 에러 내용 표시 (디버깅용)
    const el = document.getElementById('job-cards-container');
    if (el) el.innerHTML = `<div class="empty-state">
      <div class="empty-icon">⚠️</div>
      <div class="empty-txt" style="font-size:12px;color:#e53935">공고 로드 실패<br><span style="font-size:10px;color:#aaa;word-break:break-all">${e.message || JSON.stringify(e)}</span></div>
    </div>`;
  }
}

function showMockBanner() {
  if (document.getElementById('mock-banner')) return;
  const banner = document.createElement('div');
  banner.id = 'mock-banner';
  banner.style.cssText = 'position:fixed;top:88px;left:50%;transform:translateX(-50%);background:#FF9500;color:#fff;font-size:11px;font-weight:800;padding:6px 14px;border-radius:20px;z-index:350;pointer-events:none;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.15)';
  banner.textContent = '\u{1F9EA} 테스트 데이터 표시 중 — 실제 공고가 없습니다';
  document.body.appendChild(banner);
  setTimeout(() => banner.remove(), 6000);
}

// ── 마커 렌더링 ───────────────────────────────────────────
function renderMarkers() {
  // 기존 마커/오버레이 제거
  markers.forEach(m => m.setMap(null));
  overlays.forEach(o => o.setMap(null));
  markers = []; overlays = [];

  // 비대면 필터 활성화 시 지도 마커 없음 (비대면 공고는 위치 없음)
  const _remoteBanner = document.getElementById('map-remote-banner');
  if (filterRemote) {
    if (_remoteBanner) _remoteBanner.style.display = 'flex';
    return;
  }
  if (_remoteBanner) _remoteBanner.style.display = 'none';

  // 심부름 카테고리 → 아이콘 매핑 (work_type 없는 구공고 fallback용)
  const ERRAND_ICON_MAP = {
    '물건 픽업/전달':'\u{1F4E6}','대리 줄서기':'\u{1F9CD}','서류/우편':'\u{1F4EE}','쇼핑 대행':'\u{1F6D2}',
    '벌레 퇴치':'\u{1FAB2}','반려동물 산책':'\u{1F415}','이사/짐 보조':'\u{1F69A}','음식 배달':'\u{1F371}',
    '차량 이동/주차':'\u{1F697}','약국/병원 대행':'\u{1F48A}','장보기 대행':'\u{1F96C}','기타 심부름':'\u{1F3C3}',
    '운반/짐 이동':'\u{1F4E6}','퀵배달':'\u{1F6F5}','청소 대행':'\u{1F9F9}','이사도우미':'\u{1F69A}'
  };
  const ERRAND_CAT_NAMES = new Set(Object.keys(ERRAND_ICON_MAP));

  // 카테고리 → 마커 짧은 이름
  const CAT_SHORT = {
    'F&B':'F&B', '물류':'운송', '판매':'판매', '청소':'청소',
    '이벤트':'이벤트', '커플알바':'커플', '컨텐츠':'촬영', '챌린지':'챌린지',
    '물건 픽업/전달':'픽업', '대리 줄서기':'줄서기', '서류/우편':'서류',
    '쇼핑 대행':'쇼핑', '벌레 퇴치':'해충', '반려동물 산책':'펫돌봄',
    '이사/짐 보조':'이사', '이사도우미':'이사', '음식 배달':'배달',
    '차량 이동/주차':'주차대행', '약국/병원 대행':'병원대행',
    '장보기 대행':'장보기', '기타 심부름':'심부름',
    '운반/짐 이동':'운반', '퀵배달':'퀵', '청소 대행':'청소'
  };

  jobs.forEach(job => {
    if (!job.lat || !job.lng) return;
    const isUrgent = job.status === 'urgent';
    const hasSurge = job.wage_delta > 0;
    const wageStr = (job.current_wage / 10000).toFixed(1) + '만';

    // work_type 없는 구공고는 카테고리로 심부름 판별
    const isErrand = job.work_type === 'errand' || ERRAND_CAT_NAMES.has(job.category);

    const wageUnit = isErrand ? '/건' : '/시간';
    const catName  = CAT_SHORT[job.category] || (isErrand ? '심부름' : (job.category || '알바'));

    const bubbleCls = isErrand ? 'mk-errand' : (isUrgent ? 'mk-asap' : (job.work_type === 'regular' ? 'mk-regular' : (job.work_type === 'short' ? 'mk-short' : '')));
    const tailCls   = isErrand ? 'mk-errand' : (job.work_type === 'regular' ? 'mk-regular' : (job.work_type === 'short' ? 'mk-short' : ''));
    const surgeHtml = hasSurge
      ? `<div class="surge-badge">↑${(job.wage_delta/1000).toFixed(0)}k</div>` : '';
    const { str: ddayStr, cls: ddayCls } = calcDDay(job.start_time);
    const _TYPE_CLS = { regular:'mt-reg', short:'mt-short', errand:'mt-errnd' };
    const _TYPE_CHR = { regular:'정', short:'단', errand:'심' };
    const mkTypeCls = _TYPE_CLS[job.work_type] || 'mt-spot';
    const mkTypeChr = _TYPE_CHR[job.work_type] || '스';
    const catShort  = catName.length > 5 ? catName.slice(0,5) : catName;

    const _teamBadge = (() => { if (!job.is_team_job) return ''; const _r = job.needed_count - (job.filled_count||0); return _r > 0 ? `<div style="position:absolute;top:-8px;right:-8px;background:#7C3AED;color:#fff;font-size:9px;font-weight:900;padding:2px 5px;border-radius:8px;white-space:nowrap">👥${_r}자리</div>` : ''; })();
    const content = `
      <div class="marker-wrap" onclick="openDetail('${job.id}')" style="position:relative">
        ${surgeHtml}
        ${_teamBadge}
        <div class="marker-bubble ${bubbleCls}">
          <div class="mk-row1">
            <span class="mk-type ${mkTypeCls}">${mkTypeChr}</span>
            <span class="mk-cat">${catShort}</span>
            ${ddayStr ? `<span class="mk-dday ${ddayCls}">${ddayStr}</span>` : ''}
          </div>
          <span class="mk-wage">${wageStr}<span class="mk-unit">${wageUnit}</span></span>
        </div>
        <div class="marker-tail ${tailCls}"></div>
      </div>`;

    const pos = new kakao.maps.LatLng(job.lat, job.lng);
    const overlay = new kakao.maps.CustomOverlay({
      position: pos,
      content,
      yAnchor: 1.1
    });
    overlay.setMap(kakaoMap);
    overlays.push(overlay);
  });
}

// ── 미소 벤치마킹: 날짜 슬라이더 ────────────────────────
function renderDateSlider() {
  const wrap = document.getElementById('date-slider-wrap');
  if (!wrap) return;
  const today = new Date();
  const dayNames = ['일','월','화','수','목','금','토'];
  let html = `<button onclick="selectDate(null)" style="flex-shrink:0;padding:6px 14px;border-radius:20px;border:none;font-size:12px;font-weight:700;cursor:pointer;background:${selectedDate===null?'#C8102E':'#f0f0f0'};color:${selectedDate===null?'#fff':'#777'}">전체</button>`;
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const dateStr = d.toISOString().split('T')[0];
    const isSel = selectedDate === dateStr;
    const isSun = d.getDay() === 0, isSat = d.getDay() === 6;
    const labelColor = isSel ? 'rgba(255,255,255,0.75)' : (isSun ? '#E53935' : isSat ? '#1976D2' : '#999');
    const numColor   = isSel ? '#fff'                    : (isSun ? '#E53935' : isSat ? '#1976D2' : '#111');
    html += `<button onclick="selectDate('${dateStr}')" style="flex-shrink:0;display:flex;flex-direction:column;align-items:center;padding:5px 11px;border-radius:14px;border:${isSel?'none':'1.5px solid #eee'};cursor:pointer;min-width:40px;background:${isSel?'#C8102E':'#fff'}">
      <span style="font-size:10px;font-weight:700;color:${labelColor}">${i===0?'오늘':dayNames[d.getDay()]}</span>
      <span style="font-size:16px;font-weight:900;color:${numColor}">${d.getDate()}</span>
    </button>`;
  }
  wrap.innerHTML = html;
}
function selectDate(dateStr) {
  selectedDate = dateStr;
  renderDateSlider();
  renderList();
}

// ── 미소 벤치마킹: 구별 공고수 필터 ─────────────────────
function renderDistrictFilter() {
  const wrap = document.getElementById('district-filter-wrap');
  if (!wrap) return;
  const counts = {};
  jobs.forEach(j => {
    const m = (j.address||'').match(/([가-힣]+구)/);
    if (m) counts[m[1]] = (counts[m[1]]||0)+1;
  });
  const districts = Object.entries(counts).sort((a,b)=>b[1]-a[1]);
  if (!districts.length) { wrap.style.display='none'; return; }
  wrap.style.display = 'flex';
  let html = `<button onclick="selectDistrict(null)" style="flex-shrink:0;padding:5px 12px;border-radius:20px;border:none;font-size:11px;font-weight:700;cursor:pointer;background:${selectedDistrict===null?'#222':'#f0f0f0'};color:${selectedDistrict===null?'#fff':'#666'}">전체</button>`;
  districts.forEach(([d,cnt]) => {
    const isA = selectedDistrict === d;
    html += `<button onclick="selectDistrict('${d}')" style="flex-shrink:0;padding:5px 12px;border-radius:20px;border:none;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap;background:${isA?'#222':'#f0f0f0'};color:${isA?'#fff':'#555'}">${d} <span style="font-size:10px;opacity:0.65">${cnt}</span></button>`;
  });
  wrap.innerHTML = html;
}
function selectDistrict(d) {
  selectedDistrict = d;
  renderDistrictFilter();
  renderList();
}

// ── 미소 벤치마킹: 반복 주기 라벨 ───────────────────────
function getJobCycleLabel(job) {
  if (job.work_type === 'errand') return null;
  const DAY = {mon:'월',tue:'화',wed:'수',thu:'목',fri:'금',sat:'토',sun:'일'};
  const days = (job.work_days||'').split(',').map(d=>DAY[d.trim()]||d).filter(Boolean).join('·');
  if (job.work_type === 'regular') return days ? `매주 반복 (${days})` : '정기 반복';
  if (job.work_type === 'short')   return days ? `단기 (${days})` : '단기';
  return t('cycle_spot'); // spot
}

// ── 미소 벤치마킹: 지하철역 도보시간 비동기 로드 ──────────
function loadSubwayInfo(jobsList) {
  if (!window.kakao?.maps?.services) return;
  const ps = new kakao.maps.services.Places();
  jobsList.forEach(job => {
    if (!job.lat || !job.lng) return;
    if (_subwayCache[job.id] !== undefined) {
      const el = document.getElementById(`subway-${job.id}`);
      if (el) {
        if (_subwayCache[job.id]) el.textContent = '🚇 ' + _subwayCache[job.id];
        else el.remove();
      }
      return;
    }
    _subwayCache[job.id] = ''; // 검색 중 표시
    ps.categorySearch('SW8', (result, status) => {
      const el = document.getElementById(`subway-${job.id}`);
      if (status === kakao.maps.services.Status.OK && result.length > 0) {
        const walkMin = Math.ceil(parseInt(result[0].distance)/67);
        const _parseStn = name => {
          const c = name.replace(/\s*\([^)]*\)/g,'').trim();
          let s = c.replace(/\s+(?:\d+호선|GTX-[A-Z]|경의중앙선|분당선|신분당선|공항철도|경춘선|수인선|경강선|인천\d+호선).*/,'').trim();
          if (!s.endsWith('역')) s += '역';
          const m = c.match(/\d+호선|GTX-[A-Z]|경의중앙선|분당선|신분당선|공항철도|경춘선/);
          return { s, line: m ? m[0] : null };
        };
        const { s: sName } = _parseStn(result[0].place_name);
        const baseDist = parseInt(result[0].distance);
        const lines = [];
        for (const r of result) {
          if (Math.abs(parseInt(r.distance) - baseDist) > 80) break;
          const { s: s2, line: l } = _parseStn(r.place_name);
          if (s2 === sName && l && !lines.includes(l)) lines.push(l);
        }
        const info = `${sName}${lines.length ? ' ' + lines.join(' ') : ''} 도보 ${walkMin}분`;
        _subwayCache[job.id] = info;
        const _stripL = s => s.replace(/\s+(?:\d+호선|GTX-[A-Z]|경의중앙선|분당선|신분당선|공항철도|경춘선)/g,'');
        if (el) el.textContent = '🚇 ' + _stripL(info);
      } else {
        _subwayCache[job.id] = null;
        if (el) el.remove();
      }
    }, { location: new kakao.maps.LatLng(job.lat, job.lng), radius: 1500, sort: kakao.maps.services.SortBy.DISTANCE });
  });
}

// ── 목록 렌더링 ───────────────────────────────────────────
function renderList() {
  // 날짜/구 슬라이더 필터 (displayJobs = 화면에 보이는 공고)
  let displayJobs = jobs;
  if (selectedDate) {
    displayJobs = displayJobs.filter(j => !j.start_time || j.start_time.startsWith(selectedDate));
  }
  if (selectedDistrict) {
    displayJobs = displayJobs.filter(j => (j.address||'').includes(selectedDistrict));
  }
  // 외국인 워커에게 '한국인만' 공고 숨김
  const _myNat = currentUser?.user_metadata?.nationality;
  if (_myNat && _myNat !== 'KR') {
    displayJobs = displayJobs.filter(j => j.nationality_requirement !== 'korean_only');
  }

  const _sheetCnt = document.querySelector('.sheet-count');
  if (_sheetCnt) _sheetCnt.innerHTML = t('nearby_jobs_fmt').replace('{n}', `<span id="job-count">${displayJobs.length}</span>`);
  else { const _jc = document.getElementById('job-count'); if (_jc) _jc.textContent = displayJobs.length; }
  const list = document.getElementById('job-cards-container');

  // AI 맞춤 추천 갱신
  renderAiRecommendations();
  // 오늘의 급구 피드 렌더
  renderUrgentFeed();
  // 투데이 추천 카드 (가장 가까운 급구, 없으면 첫 번째 공고)
  renderTodayPick();

  if (displayJobs.length === 0) {
    const nextRadius = currentRadius < 3000 ? 3 : currentRadius < 5000 ? 5 : currentRadius < 10000 ? 10 : null;
    const expandBtn = nextRadius ? `<button onclick="setRadius(${nextRadius * 1000})" style="margin-top:16px;padding:12px 24px;background:#C8102E;color:#fff;border:none;border-radius:12px;font-size:14px;font-weight:800;cursor:pointer">반경 ${nextRadius}km로 늘리기</button>` : '';
    const guestBtn = isGuest ? `<button onclick="showLoginPrompt('공고를 올려보세요!','업주로 로그인하면 직접 알바 공고를 올릴 수 있어요.')" style="margin-top:8px;padding:12px 24px;background:#f5f5f5;color:#555;border:none;border-radius:12px;font-size:13px;font-weight:700;cursor:pointer;display:block;width:100%">공고 올리기 (업주)</button>` : '';
    list.innerHTML = `<div class="empty-state">
      <div class="empty-icon">📭</div>
      <div class="empty-txt">주변 ${(currentRadius/1000).toFixed(0)}km 내<br>공고가 없어요</div>
      <div style="font-size:12px;color:#bbb;margin-top:6px">다른 지역을 탐색하거나 반경을 늘려보세요</div>
      ${expandBtn}
      ${guestBtn}
    </div>`;
    return;
  }

  surgeTimerHandles.forEach(h => clearInterval(h));
  surgeTimerHandles = [];
  list.innerHTML = displayJobs.map(job => {
    const isUrgent = job.status === 'urgent';
    const hasSurge = job.wage_delta > 0;
    const catClass = getCatClass(job.category);
    const isErrand = job.work_type === 'errand';
    const _ap0 = (job.address||'').split('\n');
    const _da0 = _ap0[0] ? (_ap0[1] ? _ap0[0] + ' · ' + _ap0[1].split(' ').slice(0,3).join(' ') : _ap0[0]) : null;
    const dist = job.is_remote ? '<span style="color:#0369A1;font-weight:700;font-size:11px">🖥️ 비대면</span>' : _distStr(job.distance_m, job.lat, job.lng, _da0);
    const startStr = job.start_time ? formatTime(job.start_time) : '미정';
    const surgeTimer = job.surge_enabled ? buildSurgeTimer(job) : '';
    const appSt = job.applied_status;
    const APP_LABEL = { pending:'검토중', reviewing:'\u{1F50D} 검토중', accepted:'✅ 합격', completed:'\u{1F3C1} 완료' };
    const appliedBadge = appSt ? `<span style="font-size:11px;font-weight:800;color:#888;background:#f0f0f0;padding:2px 8px;border-radius:10px;margin-left:auto">${APP_LABEL[appSt] || '지원완료'}</span>` : '';
    // ① 반복 주기 라벨
    const cycleLabel = getJobCycleLabel(job);
    const cycleLabelHtml = cycleLabel ? `<span style="font-size:10px;font-weight:800;color:#3B82F6;margin-right:4px">${cycleLabel}</span>` : '';
    // ② 총액 표시 (시급 × 시간)
    const totalWageHtml = (!isErrand && job.duration_hours > 0 && job.current_wage > 0)
      ? `<div style="font-size:10px;color:#aaa;font-weight:600;margin-top:1px">총 ${(job.current_wage * job.duration_hours).toLocaleString()}원</div>`
      : '';
    // ③ 재방문 인센티브 배지
    const returnBadge = (job.return_bonus > 0)
      ? `<span class="tag" style="background:#FFF8E1;color:#F59E0B;border:1px solid #FDE68A;font-weight:800">&#11088; 재방문 +${job.return_bonus.toLocaleString()}원</span>`
      : '';
    // ⑤ 언어 우대 배지
    const _LANG_FLAG = {ko:'&#127472;&#127479;',en:'&#127482;&#127480;',zh:'&#127464;&#127475;',ja:'&#127471;&#127477;',vi:'&#127483;&#127475;',ru:'&#127479;&#127482;',mn:'&#127474;&#127475;'};
    const _LANG_NAME = {ko:'한국어',en:'영어',zh:'중국어',ja:'일본어',vi:'베트남어',ru:'러시아어',mn:'몽골어'};
    const langBadge = (job.preferred_languages && job.preferred_languages.length)
      ? job.preferred_languages.map(l => `<span class="tag" style="background:#EFF6FF;color:#1D4ED8;border:1px solid #BFDBFE;font-weight:700">${_LANG_FLAG[l]||''} ${_LANG_NAME[l]||l} 우대</span>`).join('')
      : '';
    // ④ 지하철역 span (loadSubwayInfo가 비동기로 채워줌)
    const subwaySpan = (job.lat && job.lng)
      ? `<span id="subway-${job.id}" style="color:#888;font-size:11px">🚇 ...</span>`
      : '';
    return `
    <div class="job-card ${isUrgent ? 'urgent-card' : ''}" onclick="openDetail('${job.id}')" style="${appSt ? 'opacity:0.65;' : ''}">
      ${cycleLabelHtml ? `<div style="margin-bottom:2px">${cycleLabelHtml}</div>` : ''}
      <div class="card-top">
        <div class="card-left">
          <div class="card-biz">${job.biz_name}${appliedBadge}</div>
          <div class="card-title">${job.title}${_isAdmin ? _adminBtn('job_postings',job.id,'title',job.title,'공고 제목') : ''}</div>
        </div>
        <div class="card-right">
          <div class="card-wage" id="wage-${job.id}">${job.current_wage.toLocaleString()}원${isErrand ? '<span style="font-size:10px;font-weight:700;color:#aaa">/건</span>' : ''}</div>
          <div id="wagedelta-${job.id}">${hasSurge ? `<div class="wage-delta">↑${job.wage_delta.toLocaleString()}원</div>` : ''}</div>
          ${totalWageHtml}
          ${job.surge_max_wage ? `<div style="font-size:10px;color:#aaa">최대 ${job.surge_max_wage.toLocaleString()}원</div>` : ''}
        </div>
      </div>
      ${surgeTimer}
      <div class="card-tags">
        ${job.is_remote ? '<span class="tag" style="background:#F0F9FF;color:#0369A1;border:1px solid #BAE6FD;font-weight:700">🖥️ 비대면</span>' : ''}
        ${isErrand ? '<span class="tag" style="background:#F3E8FF;color:#7C3AED;font-weight:700">심부름</span>' : ''}
        ${job.work_type === 'short'   ? '<span class="tag" style="background:#EFF6FF;color:#3B82F6;font-weight:700">단기</span>' : ''}
        ${job.work_type === 'regular' ? '<span class="tag" style="background:#F0FFF4;color:#16a34a;font-weight:700">정기</span>' : ''}
        ${isUrgent ? '<span class="tag urgent-tag">ASAP</span>' : ''}
        ${job.surge_enabled ? '<span class="tag" style="background:#FFF3E0;color:#FF9500;font-weight:700">번개</span>' : ''}
        ${job.is_team_job ? '<span class="tag" style="background:#F5F3FF;color:#7C3AED;border:1px solid #DDD6FE;font-weight:800">👥 팀모집</span>' : ''}
        ${job.same_day_payment ? '<span class="tag payday-tag">💰 당일정산</span>' : ''}
        ${job.nationality_requirement === 'korean_only'       ? '<span class="tag" style="background:#FFF1F2;color:#9f1239;border:1px solid #FECDD3;font-weight:800">🇰🇷 한국인만</span>' : ''}
        ${job.nationality_requirement === 'foreigner_welcome' ? '<span class="tag" style="background:#F0FFF4;color:#166534;border:1px solid #86EFAC;font-weight:800">🌏 외국인환영</span>' : ''}
        ${job.nationality_requirement === 'korean_lang'       ? '<span class="tag" style="background:#FFF7ED;color:#B45309;border:1px solid #FDE68A;font-weight:800">💬 한국어필수</span>' : ''}
        ${job.beginner_ok === true ? '<span class="tag" style="background:#F0FFF4;color:#16a34a;border:1px solid #86EFAC;font-weight:800">🌱 초보OK</span>' : (job.beginner_ok === false ? '<span class="tag" style="background:#FFF1F2;color:#9f1239;border:1px solid #FECDD3;font-weight:800">🔰 경력자</span>' : '')}
        ${job.meal_included ? '<span class="tag" style="background:#FFF7ED;color:#D97706;border:1px solid #FDE68A;font-weight:800">🍱 식사제공</span>' : ''}
        ${returnBadge}
        ${langBadge}
        ${job.category ? `<span class="tag ${catClass}">${job.category}</span>` : ''}
        <span class="tag">${isErrand ? (job.duration_hours ? `약 ${job.duration_hours}시간` : '소요시간 협의') : (job.duration_hours ?? '-') + '시간'}</span>
        ${(() => {
          const rem = job.needed_count - job.filled_count;
          if (rem <= 0) return '';
          if (rem === 1) return `<span class="tag" style="background:#FFF0F0;color:#C8102E;border:1px solid #FCA5A5;font-weight:800">🔥 마감임박 1자리</span>`;
          if (rem <= 2) return `<span class="tag" style="background:#FFF7ED;color:#EA580C;font-weight:800">⚡ ${rem}자리 남음</span>`;
          return `<span class="tag">${rem}자리 남음</span>`;
        })()}
      </div>
      ${job.is_team_job && job.needed_count > 0 ? (() => {
        const filled = job.filled_count || 0;
        const needed = job.needed_count || 1;
        const pct = Math.min(100, Math.round(filled / needed * 100));
        const rem = needed - filled;
        return `<div style="padding:0 14px 10px">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
            <span style="font-size:10px;font-weight:700;color:#7C3AED">👥 ${needed}명 팀 모집</span>
            <span style="font-size:10px;font-weight:800;color:${rem<=1?'#C8102E':rem<=2?'#EA580C':'#7C3AED'}">${rem > 0 ? rem+'자리 남음' : '모집완료'}</span>
          </div>
          <div style="height:5px;background:#EDE9FE;border-radius:3px;overflow:hidden">
            <div style="height:100%;width:${pct}%;background:${pct>=80?'#C8102E':'#7C3AED'};border-radius:3px;transition:width 0.4s"></div>
          </div>
        </div>`;
      })() : ''}
      <div class="card-meta">
        <span>${dist}</span>
        <span>${startStr}</span>
        ${subwaySpan}
        <span class="card-star">★ ${job.biz_rating || '-'}</span>
      </div>
    </div>`;
  }).join('');

  setTimeout(startSurgeTimers, 50);
  // ⑤ 지하철역 비동기 로드
  setTimeout(() => loadSubwayInfo(displayJobs), 200);
}

function renderUrgentFeed() {
  const urgentJobs = jobs.filter(j => j.status === 'urgent').slice(0, 6);
  const section = document.getElementById('urgent-feed-section');
  const feedList = document.getElementById('urgent-feed-list');
  if (!section || !feedList) return;
  if (!urgentJobs.length) { section.style.display = 'none'; return; }
  section.style.display = 'block';
  feedList.innerHTML = urgentJobs.map(job => {
    const _ap1 = (job.address||'').split('\n');
    const _da1 = _ap1[0] ? (_ap1[1] ? _ap1[0] + ' · ' + _ap1[1].split(' ').slice(0,3).join(' ') : _ap1[0]) : null;
    const dist = _distStr(job.distance_m, job.lat, job.lng, _da1);
    const emoji = getCatEmoji(job.category);
    const bg = CAT_BG[job.category] || '#f5f5f5';
    return `
    <div onclick="openDetail('${job.id}')" style="flex-shrink:0;width:150px;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,0.10);cursor:pointer;border:2px solid #C8102E">
      <div style="background:${bg};padding:10px 12px 8px;position:relative">
        <div style="font-size:28px;line-height:1;margin-bottom:4px">${emoji}</div>
        <div style="font-size:11px;font-weight:900;color:#111;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${job.title || job.biz_name}</div>
        <span style="position:absolute;top:8px;right:8px;background:#C8102E;color:#fff;font-size:9px;font-weight:800;padding:2px 5px;border-radius:6px">🔥급구</span>
      </div>
      <div style="padding:8px 10px">
        <div style="font-size:14px;font-weight:900;color:#C8102E">${(job.current_wage/10000).toFixed(1)}만원</div>
        <div style="font-size:10px;color:#888;font-weight:700;margin-top:2px">📍 ${dist}</div>
      </div>
    </div>`;
  }).join('');

}

function renderTodayPick() {}

// ══════════════════════════════════════════════════════════
// ── 바로모임 (Baro Moim) ────────────────────────────────────
// ══════════════════════════════════════════════════════════

const MOIM_CAT_EMOJI = { 스포츠:'🏃', 취미:'🎨', 친목:'🤝', 챌린지:'🔥', 기타:'💡' };
const MOIM_PLAN_LIMITS = { free: 1, basic: 10, pro: Infinity };

let _currentMoimId = null;   // 상세 보고 있는 모임 id
let _moimDetailData = null; // openMoimDetail에서 로드된 원본 객체
let _editingMoim = null;    // 수정 모드에서 원본 데이터
let _moimRealtimeCh = null;  // 단체채팅 Realtime 채널
let _moimList = [];          // 전체 모임 목록
let _moimMapMode = false;    // 지도 모임 모드
let _moimOverlays = [];      // 지도 모임 마커

// ── 패널 열기/닫기 ────────────────────────────────────────
async function autoCloseExpiredGatherings() {
  if (!currentUser) return;
  const now = new Date().toISOString();
  await db.from('gatherings')
    .update({ status: 'closed' })
    .eq('status', 'open')
    .eq('host_id', currentUser.id)
    .not('gathering_date', 'is', null)
    .lt('gathering_date', now);
}

function openMoimPanel(showCreate = false) {
  document.getElementById('panel-moim').classList.add('show');
  autoCloseExpiredGatherings().catch(() => {});
  loadMoimList();
  if (showCreate) setTimeout(() => openMoimCreate(), 300);
}
function closeMoimPanel() { document.getElementById('panel-moim').classList.remove('show'); }
function closeMoimDetail() { document.getElementById('panel-moim-detail').classList.remove('show'); }
function openMoimCreate(editData = null) {
  _editingMoim = editData || null;
  const panel = document.getElementById('panel-moim-create');
  panel.classList.add('show');
  const _mcFab2 = document.getElementById('posting-fab');
  if (_mcFab2) _mcFab2.style.display = 'none';
  _resetMoimForm();
  if (_editingMoim) _fillMoimForm(_editingMoim);
  document.getElementById('moim-create-title').textContent = _editingMoim ? '모임 수정' : '모임 만들기';
  document.getElementById('moim-submit-btn').textContent = _editingMoim ? '수정 완료' : '모임 개설하기';
}
function closeMoimCreate() {
  document.getElementById('panel-moim-create').classList.remove('show');
  const _mcFab2 = document.getElementById('posting-fab');
  const _ownerPanelEl2 = document.getElementById('panel-owner');
  if (_mcFab2 && _ownerPanelEl2 && _ownerPanelEl2.style.display !== 'none') _mcFab2.style.display = 'flex';
}
// 뒤로가기(헤더 화살표/기기 back 제스처)는 그냥 "닫기"일 뿐이지 "나가기"가 아님 -
// 참가 취소는 아래 leaveBaromeetChat()처럼 명시적으로 "나가기"를 눌렀을 때만 실행
function closeMoimChat() {
  const _mc = document.getElementById('panel-moim-chat');
  _mc.classList.remove('show');
  _mc.style.bottom = '';
  if (_moimRealtimeCh) { db.removeChannel(_moimRealtimeCh); _moimRealtimeCh = null; }
  if (_baromeetRealtimeCh) { db.removeChannel(_baromeetRealtimeCh); _baromeetRealtimeCh = null; }
  const _mcInput = document.getElementById('moim-chat-input');
  if (_mcInput) delete _mcInput.dataset.baromeet;
  _baromeetChatId = null;
  _baromeetAnonLabel = null;
  _baromeetShowPhoto = false;
  _baromeetPhotoUrl = null;
  _mc.style.paddingBottom = '';
  // FAB 복원 — owner 패널이 열려있을 때만
  const _mcFab = document.getElementById('posting-fab');
  const _ownerPanelEl = document.getElementById('panel-owner');
  if (_mcFab && _ownerPanelEl && _ownerPanelEl.style.display !== 'none') _mcFab.style.display = 'flex';
}

async function _cancelBaromeetApplication(meetingId) {
  if (!currentUser) return;
  const { data: app } = await db.from('gathering_applications')
    .select('id, status').eq('gathering_id', meetingId).eq('applicant_id', currentUser.id).maybeSingle();
  if (!app) return;
  const wasHoldingSeat = app.status === 'approved' || app.status === 'pending';
  await db.from('gathering_applications').update({ status: 'cancelled' }).eq('id', app.id);
  if (wasHoldingSeat) {
    const { data: wRow } = await db.from('workers').select('gender').eq('kakao_uid', currentUser.id).maybeSingle();
    const col = wRow?.gender === 'male' ? 'baromeeting_male_cur' : wRow?.gender === 'female' ? 'baromeeting_female_cur' : null;
    if (col) {
      const { data: g } = await db.from('gatherings').select(col).eq('id', meetingId).single();
      const cur = g?.[col] || 0;
      await db.from('gatherings').update({ [col]: Math.max(0, cur - 1) }).eq('id', meetingId);
    }
  }
  showToast('참가 신청이 취소됐어요');
}

// 헤더의 명시적 "나가기" 버튼 전용 - 뒤로가기와 달리 실제로 참가를 취소하고 나감
function leaveBaromeetChat() {
  if (!_baromeetChatId) { closeMoimChat(); return; }
  const meetingId = _baromeetChatId;
  showConfirm('채팅방에서 나가면 바로미팅 참가 신청이 취소돼요.\n정말 나가시겠어요?', async () => {
    await _cancelBaromeetApplication(meetingId);
    closeMoimChat();
  });
}

// ── 모임 목록 로드 ────────────────────────────────────────
let _moimLoadVer = 0; // race condition 방지: 마지막 요청만 렌더링
let _moimHostPlans = {}; // host_id(kakao_uid) -> businesses.plan
async function loadMoimList(cat = '') {
  const myVer = ++_moimLoadVer;

  const container = document.getElementById('moim-list-container');
  const homeList  = document.getElementById('home-moim-list');
  if (!container && !homeList) return; // 둘 다 없으면 패스

  if (container) container.innerHTML = '<div style="text-align:center;padding:40px;color:#bbb"><div style="font-size:28px">🤝</div><div style="font-size:13px;margin-top:8px">불러오는 중...</div></div>';

  const MOIM_PLACEHOLDER = '<div onclick="openMoimPanel(true)" style="flex-shrink:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;width:140px;height:80px;border-radius:13px;border:1.5px dashed #c4b5fd;background:#faf5ff;cursor:pointer"><span style="font-size:22px">🤝</span><span style="font-size:11px;font-weight:800;color:#7C3AED">첫 모임 만들기</span></div>';

  try {
    const _moimNow = new Date().toISOString();
    let q = db.from('gatherings')
      .select('*')
      .eq('is_public', true)
      .eq('status', 'open')
      .neq('category', 'baromeeting') // 바로미팅은 바로만남 진입점 전용 - 바로모임 리스트에는 안 섞이게
      .or(`gathering_date.is.null,gathering_date.gte.${_moimNow}`)
      .order('created_at', { ascending: false });
    if (cat) q = q.eq('category', cat);

    const { data, error } = await q.limit(50);
    if (myVer !== _moimLoadVer) return; // 더 최신 요청이 왔으면 무시
    if (error) throw error;
    _moimList = data || [];

    // 모임장의 실제 구독 플랜 조회 (PRO/BASIC 뱃지용)
    const hostIds = [...new Set(_moimList.map(m => m.host_id).filter(Boolean))];
    if (hostIds.length) {
      const { data: hostBiz } = await db.from('businesses').select('kakao_uid,plan').in('kakao_uid', hostIds);
      _moimHostPlans = Object.fromEntries((hostBiz || []).map(b => [b.kakao_uid, b.plan]));
    } else {
      _moimHostPlans = {};
    }
  } catch(e) {
    if (myVer !== _moimLoadVer) return;
    _moimList = [];
    if (container) container.innerHTML = '<div style="text-align:center;padding:40px;color:#bbb"><div style="font-size:28px">🤝</div><div style="font-size:13px;margin-top:8px;line-height:1.6">불러오기에 실패했어요<br>잠시 후 다시 시도해 주세요</div></div>';
    if (homeList) homeList.innerHTML = MOIM_PLACEHOLDER;
    return;
  }

  if (myVer !== _moimLoadVer) return; // 렌더링 전 한번 더 확인

  if (container) {
    try { _renderMoimCards(container, _moimList); }
    catch(e) { container.innerHTML = '<div style="text-align:center;padding:40px;color:#bbb">표시 오류</div>'; }
  }

  // 홈 패널 미리보기 갱신 (모임 패널 컨테이너 존재 여부와 무관)
  if (homeList) {
    if (_moimList.length) {
      try {
        homeList.innerHTML = _moimList.slice(0, 6).map(m => {
          try { return _moimHomeCard(m); } catch(e) { return ''; }
        }).join('');
      } catch(e) { homeList.innerHTML = MOIM_PLACEHOLDER; }
    } else {
      homeList.innerHTML = MOIM_PLACEHOLDER;
    }
  }
}

function _moimHomeCard(m) {
  const catColor = { 스포츠:'#2563eb',취미:'#7c3aed',친목:'#0891b2',기타:'#6b7280' };
  const cat = m.category || '기타';
  const color = catColor[cat] || '#7c3aed';
  const dateStr = m.gathering_date ? new Date(m.gathering_date).toLocaleDateString('ko-KR',{month:'short',day:'numeric',weekday:'short'}) : '일정 미정';
  const rem = (m.max_count||10) - (m.current_count||0);
  
  // 모임장(host)의 실제 구독 플랜 기준 PRO/BASIC 뱃지 (loadMoimList에서 조회한 _moimHostPlans 사용)
  const hostPlan = _moimHostPlans[m.host_id] || 'free';
  const isPro = hostPlan === 'pro';
  const isBasic = hostPlan === 'basic';
  const tierClass = isPro ? 'pro' : (isBasic ? 'basic' : '');
  const tierBadge = isPro ? '<span class="tier-badge tier-pro">PRO</span>' : (isBasic ? '<span class="tier-badge tier-basic">BASIC</span>' : '');

  return `<div onclick="openMoimDetail('${m.id}')" class="moim-card ${tierClass}" style="flex-shrink:0;width:160px;background:#fff;border-radius:12px;padding:16px;cursor:pointer;">
    ${tierBadge}
    <div class="mc-cat" style="color:${color}">${cat.toUpperCase()}</div>
    <div class="mc-title">${m.title}</div>
    <div class="mc-date">${dateStr}</div>
    <div class="mc-slots">${rem > 0 ? rem + '자리 남음' : '마감'}</div>
    <div class="mc-fee" style="color:#d97706">각자 분담</div>
  </div>`;
}

function _renderMoimCards(container, list) {
  if (!list.length) {
    container.innerHTML = '<div style="text-align:center;padding:60px 20px;color:#bbb"><div style="font-size:40px;margin-bottom:12px">🤝</div><div style="font-size:14px;font-weight:600">모임이 없어요<br>첫 번째 모임을 만들어보세요!</div></div>';
    return;
  }
  container.innerHTML = list.map(m => {
    const emoji = MOIM_CAT_EMOJI[m.category] || '🤝';
    const dateStr = m.gathering_date
      ? new Date(m.gathering_date).toLocaleDateString('ko-KR', { month:'long', day:'numeric', weekday:'short', hour:'2-digit', minute:'2-digit' })
      : '날짜 미정';
    const rem = (m.max_count || 10) - (m.current_count || 0);
    const pct = Math.min(100, Math.round((m.current_count || 0) / (m.max_count || 10) * 100));
    return `<div class="moim-card" onclick="openMoimDetail('${m.id}')" style="margin-bottom:12px">
      <div style="display:flex;gap:12px;padding:14px">
        <div style="width:52px;height:52px;border-radius:14px;background:linear-gradient(135deg,#EDE9FE,#DDD6FE);display:flex;align-items:center;justify-content:center;font-size:26px;flex-shrink:0">${emoji}</div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">
            <div style="font-size:15px;font-weight:900;color:#111;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1">${m.title}${_isAdmin ? _adminBtn('gatherings',m.id,'title',m.title,'모임 제목') : ''}</div>
            ${m.entry_fee < 0 ? '<div style="font-size:12px;font-weight:700;color:#D97706;flex-shrink:0">각자 분담</div>' : m.entry_fee > 0 ? `<div style="font-size:13px;font-weight:800;color:#D97706;flex-shrink:0">${m.entry_fee.toLocaleString()}원</div>` : '<div style="font-size:12px;font-weight:700;color:#16a34a;flex-shrink:0">무료</div>'}
          </div>
          <div style="font-size:12px;color:#888;margin-top:3px">📅 ${dateStr}</div>
          ${m.location_name ? `<div style="font-size:12px;color:#888;margin-top:1px">📍 ${m.location_name}</div>` : ''}
          <div style="display:flex;align-items:center;gap:6px;margin-top:6px;flex-wrap:wrap">
            <span style="font-size:10px;font-weight:800;background:#EDE9FE;color:#7C3AED;padding:2px 8px;border-radius:8px">${m.category || '기타'}</span>
            ${m.sub_category ? `<span style="font-size:10px;font-weight:700;background:#f5f5f5;color:#555;padding:2px 8px;border-radius:8px">${m.sub_category}</span>` : ''}
            ${m.skill_level && m.skill_level !== '무관' ? `<span style="font-size:10px;font-weight:700;background:#FFF7ED;color:#B45309;padding:2px 8px;border-radius:8px">🏅${m.skill_level}</span>` : ''}
            ${m.gender_req !== 'any' ? `<span style="font-size:10px;font-weight:700;background:#F0F9FF;color:#0369A1;padding:2px 8px;border-radius:8px">${m.gender_req === 'male' ? '남성만' : '여성만'}</span>` : ''}
          </div>
        </div>
      </div>
      <div style="padding:0 14px 12px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
          <span style="font-size:11px;color:#888">${m.current_count || 0}/${m.max_count || 10}명</span>
          <span style="font-size:11px;font-weight:800;color:${rem<=2?'#C8102E':rem<=4?'#EA580C':'#7C3AED'}">${rem > 0 ? rem+'자리 남음' : '🔒 마감'}</span>
        </div>
        <div style="height:4px;background:#EDE9FE;border-radius:2px;overflow:hidden">
          <div style="height:100%;width:${pct}%;background:${pct>=90?'#C8102E':'#7C3AED'};border-radius:2px;transition:width 0.4s"></div>
        </div>
      </div>
    </div>`;
  }).join('');
}

function filterMoimList(btn, cat) {
  document.querySelectorAll('.moim-cat-chip').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  loadMoimList(cat);
}

// ── 모임 상세 ────────────────────────────────────────────
async function openMoimDetail(moimId) {
  _currentMoimId = moimId;
  // 로딩 전 버튼 초기화 — 이전 모임 상태 잔류 방지
  const _apb = document.getElementById('moim-apply-btn');
  if (_apb) { _apb.textContent = '불러오는 중...'; _apb.style.background = '#9CA3AF'; _apb.disabled = true; _apb.style.display = 'block'; }
  document.getElementById('panel-moim-detail').classList.add('show');
  document.getElementById('moim-detail-body').innerHTML = '<div style="text-align:center;padding:60px;color:#bbb">불러오는 중...</div>';

  const { data: m } = await db.from('gatherings').select('*').eq('id', moimId).single();
  if (!m) { showToast('모임 정보를 불러올 수 없어요'); return; }
  _moimDetailData = m;

  const _mdt = document.getElementById('moim-detail-title');
  _mdt.textContent = m.title;
  if (_isAdmin) {
    const _eb = document.createElement('button');
    _eb.onclick = e => { e.stopPropagation(); adminQuickEdit('gatherings', m.id, 'title', m.title, '모임 제목'); };
    _eb.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;background:#FEF3C7;border:1px solid #FDE68A;border-radius:4px;font-size:10px;cursor:pointer;margin-left:6px;vertical-align:middle;flex-shrink:0';
    _eb.title = '어드민 수정'; _eb.textContent = '✏️';
    _mdt.appendChild(_eb);
  }
  const isHost = currentUser && m.host_id === currentUser.id;
  const emoji = MOIM_CAT_EMOJI[m.category] || '🤝';
  const dateStr = m.gathering_date ? new Date(m.gathering_date).toLocaleString('ko-KR', { year:'numeric', month:'long', day:'numeric', weekday:'long', hour:'2-digit', minute:'2-digit' }) : '날짜 미정';
  const rem = (m.max_count || 10) - (m.current_count || 0);
  const pct = Math.min(100, Math.round((m.current_count || 0) / (m.max_count || 10) * 100));

  // 내 신청 상태 조회
  let myApp = null;
  if (currentUser && !isHost) {
    const { data: apps } = await db.from('gathering_applications').select('*').eq('gathering_id', moimId).eq('applicant_id', currentUser.id).limit(1);
    myApp = apps?.[0] || null;
  }

  // 단체채팅 버튼 표시 조건: 승인된 참가자 또는 주최자
  const canChat = isHost || myApp?.status === 'approved';

  document.getElementById('moim-detail-body').innerHTML = `
    <div style="background:linear-gradient(135deg,#EDE9FE,#F5F3FF);padding:24px 20px 20px;text-align:center">
      <div style="font-size:56px;margin-bottom:8px">${emoji}</div>
      <div style="font-size:11px;font-weight:800;color:#7C3AED;margin-bottom:6px">${m.category || ''} ${m.sub_category ? '· '+m.sub_category : ''}</div>
      <div style="font-size:20px;font-weight:900;color:#111;line-height:1.3">${m.title}</div>
    </div>

    <div style="padding:16px 20px;display:flex;flex-direction:column;gap:12px">
      <!-- 모집 현황 -->
      <div style="background:#F5F3FF;border-radius:14px;padding:14px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <span style="font-size:13px;font-weight:800;color:#7C3AED">👥 모집 현황</span>
          <span style="font-size:13px;font-weight:900;color:${rem<=2?'#C8102E':'#7C3AED'}">${m.current_count||0}/${m.max_count||10}명 ${rem>0?'('+rem+'자리 남음)':'(마감)'}</span>
        </div>
        <div style="height:8px;background:#DDD6FE;border-radius:4px;overflow:hidden">
          <div style="height:100%;width:${pct}%;background:${pct>=90?'#C8102E':'#7C3AED'};border-radius:4px"></div>
        </div>
      </div>

      <!-- 기본 정보 -->
      ${m.gathering_date ? `<div style="display:flex;align-items:flex-start;gap:12px"><div style="font-size:20px;flex-shrink:0">📅</div><div><div style="font-size:12px;font-weight:700;color:#888">일시</div><div style="font-size:14px;font-weight:800;color:#111">${dateStr}</div></div></div>` : ''}
      ${m.location_name ? `<div style="display:flex;align-items:flex-start;gap:12px"><div style="font-size:20px;flex-shrink:0">📍</div><div><div style="font-size:12px;font-weight:700;color:#888">장소</div><div style="font-size:14px;font-weight:800;color:#111">${m.location_name}</div>${m.location_address?`<div style="font-size:12px;color:#888">${m.location_address}</div>`:''}</div></div>` : ''}
      <div style="display:flex;align-items:flex-start;gap:12px">
        <div style="font-size:20px;flex-shrink:0">💰</div>
        <div><div style="font-size:12px;font-weight:700;color:#888">참가비</div>
        <div style="font-size:14px;font-weight:800;color:${m.entry_fee<0?'#D97706':m.entry_fee>0?'#D97706':'#16a34a'}">${m.entry_fee < 0 ? '각자 분담 (현장 N분의1)' : m.entry_fee > 0 ? m.entry_fee.toLocaleString()+'원 (현장 납부)' : '무료'}</div></div>
      </div>
      ${m.skill_level && m.skill_level !== '무관' ? `<div style="display:flex;align-items:flex-start;gap:12px"><div style="font-size:20px;flex-shrink:0">🏅</div><div><div style="font-size:12px;font-weight:700;color:#888">실력 조건</div><div style="font-size:14px;font-weight:800;color:#B45309">${m.skill_level}${m.skill_desc?' · '+m.skill_desc:''}</div></div></div>` : ''}
      ${m.gender_req !== 'any' ? `<div style="display:flex;align-items:flex-start;gap:12px"><div style="font-size:20px;flex-shrink:0">👤</div><div><div style="font-size:12px;font-weight:700;color:#888">성별 조건</div><div style="font-size:14px;font-weight:800;color:#0369A1">${m.gender_req==='male'?'남성만':'여성만'}</div></div></div>` : ''}
      ${m.description ? `<div style="background:#f9fafb;border-radius:14px;padding:14px"><div style="font-size:12px;font-weight:700;color:#888;margin-bottom:6px">📝 모임 소개</div><div style="font-size:13px;color:#333;line-height:1.7;white-space:pre-wrap">${m.description}</div></div>` : ''}

      ${canChat ? `<button onclick="openMoimChat('${m.id}','${m.title}')" style="width:100%;padding:12px;background:#EDE9FE;color:#7C3AED;border:1.5px solid #DDD6FE;border-radius:14px;font-size:14px;font-weight:800;cursor:pointer;margin-top:4px">💬 단체채팅방 입장</button>` : ''}

      ${isHost ? `
        <div style="border-top:1px solid #f0f0f0;padding-top:16px">
          <div style="font-size:13px;font-weight:800;color:#374151;margin-bottom:10px">🛠️ 주최자 관리</div>
          <div style="display:flex;gap:8px">
            <button onclick="_editingMoim=_moimDetailData;openMoimCreate(_moimDetailData)" style="flex:1;padding:10px;border:1.5px solid #7C3AED;color:#7C3AED;background:#fff;border-radius:12px;font-size:13px;font-weight:700;cursor:pointer">✏️ 수정</button>
            <button onclick="loadMoimApplicants('${m.id}')" style="flex:1;padding:10px;background:#7C3AED;color:#fff;border:none;border-radius:12px;font-size:13px;font-weight:700;cursor:pointer">👥 신청자 관리</button>
          </div>
        </div>
        <div id="moim-applicants-section" style="display:none"></div>
      ` : ''}
    </div>`;

  // 하단 버튼 상태
  const applyBtn = document.getElementById('moim-apply-btn');
  if (isHost) {
    applyBtn.style.display = 'none';
  } else if (myApp) {
    applyBtn.style.display = 'block';
    if (myApp.status === 'pending')  { applyBtn.textContent = '⏳ 승인 대기 중'; applyBtn.style.background = '#9CA3AF'; applyBtn.disabled = true; }
    if (myApp.status === 'approved') { applyBtn.textContent = '✅ 참가 확정됨'; applyBtn.style.background = '#16a34a'; applyBtn.disabled = true; }
    if (myApp.status === 'rejected') { applyBtn.textContent = '❌ 신청 거절됨'; applyBtn.style.background = '#9CA3AF'; applyBtn.disabled = true; }
  } else if (rem <= 0) {
    applyBtn.textContent = '🔒 마감된 모임'; applyBtn.style.background = '#9CA3AF'; applyBtn.disabled = true;
  } else {
    applyBtn.textContent = '참가 신청하기'; applyBtn.style.background = '#7C3AED'; applyBtn.disabled = false;
  }
}

async function applyMoim() {
  if (!currentUser) { showLoginPrompt('로그인 후 신청할 수 있어요', '모임 참가는 로그인이 필요합니다.'); return; }
  if (currentUser.id === _moimDetailData?.host_id) { showToast('내가 만든 모임이에요'); return; }
  const { data: existing } = await db.from('gathering_applications').select('id').eq('gathering_id', _currentMoimId).eq('applicant_id', currentUser.id).limit(1);
  if (existing?.length) { showToast('이미 신청한 모임이에요'); return; }
  showConfirm('이 모임에 참가 신청할까요?\n주최자 승인 후 확정됩니다.', async () => {
    const { error } = await db.from('gathering_applications').insert({ gathering_id: _currentMoimId, applicant_id: currentUser.id, status: 'pending' });
    if (error) { showToast('신청 중 오류가 발생했어요'); return; }
    showToast('✅ 신청 완료! 주최자 승인을 기다려주세요');
    openMoimDetail(_currentMoimId); // 버튼 상태 갱신
  }, { icon:'🤝', title:'참가 신청', okLabel:'신청하기' });
}

async function loadMoimApplicants(gatheringId) {
  const sec = document.getElementById('moim-applicants-section');
  if (!sec) return;
  sec.style.display = 'block';
  sec.innerHTML = '<div style="padding:12px;text-align:center;color:#bbb;font-size:13px">불러오는 중...</div>';
  const { data } = await db.from('gathering_applications')
    .select('id,gathering_id,applicant_id,status,fee_paid,fee_paid_at,created_at')
    .eq('gathering_id', gatheringId).order('created_at', { ascending: false });
  if (!data?.length) { sec.innerHTML = '<div style="padding:12px;text-align:center;color:#bbb;font-size:13px">신청자가 없어요</div>'; return; }
  const { data: profileRows } = await db.from('profiles').select('id,name,rating,review_count,nationality').in('id', data.map(a => a.applicant_id));
  const _pMap = Object.fromEntries((profileRows || []).map(p => [p.id, p]));
  const m = _moimDetailData;
  const hasFee = m && (m.entry_fee > 0 || m.entry_fee < 0);
  const _NAT_FLAG = { KR:'🇰🇷', MN:'🇲🇳', NP:'🇳🇵', VN:'🇻🇳', RU:'🇷🇺', CN:'🇨🇳', UZ:'🇺🇿' };
  sec.innerHTML = `<div style="font-size:12px;font-weight:800;color:#374151;margin-bottom:8px;padding:0 2px">신청자 ${data.length}명</div>` + data.map(app => {
    const w = _pMap[app.applicant_id] || {};
    const statusColor = { pending:'#D97706', approved:'#16a34a', rejected:'#9CA3AF' }[app.status] || '#888';
    const statusLabel = { pending:'대기중', approved:'승인됨', rejected:'거절됨' }[app.status] || app.status;
    const feePaidHtml = (hasFee && app.status === 'approved') ? `
      <div style="margin-top:8px;padding-top:8px;border-top:1px solid #f5f5f5;display:flex;align-items:center;justify-content:space-between">
        <span style="font-size:11px;color:#888">${m.entry_fee > 0 ? '참가비 ' + m.entry_fee.toLocaleString() + '원' : '각자분담'} · 현장납부</span>
        <button id="fee-btn-${app.id}" onclick="toggleMoimFeePaid('${app.id}','${gatheringId}',${!!app.fee_paid},this)"
          style="padding:5px 12px;border-radius:8px;border:none;font-size:11px;font-weight:800;cursor:pointer;${app.fee_paid ? 'background:#dcfce7;color:#15803d' : 'background:#f3f4f6;color:#6b7280'}">
          ${app.fee_paid ? '✅ 납부확인' : '□ 미납부'}
        </button>
      </div>` : '';
    return `<div style="padding:12px;border:1px solid #f0f0f0;border-radius:12px;margin-bottom:6px;background:#fff">
      <div style="display:flex;align-items:center;gap:10px">
        <div style="font-size:24px">${_NAT_FLAG[w?.nationality] || '👤'}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:800;color:#111">${w?.name || '익명'}</div>
          ${w?.rating ? `<div style="font-size:11px;color:#888">⭐ ${Number(w.rating).toFixed(1)} (${w.review_count||0}건)</div>` : ''}
        </div>
        <span style="font-size:11px;font-weight:800;color:${statusColor};background:${statusColor}22;padding:4px 10px;border-radius:10px">${statusLabel}</span>
        ${app.status === 'pending' ? `
          <div style="display:flex;gap:4px">
            <button onclick="decideMoimApp('${app.id}','approved','${gatheringId}')" style="padding:6px 10px;border-radius:10px;background:#16a34a;color:#fff;border:none;font-size:11px;font-weight:700;cursor:pointer">승인</button>
            <button onclick="decideMoimApp('${app.id}','rejected','${gatheringId}')" style="padding:6px 10px;border-radius:10px;background:#e5e7eb;color:#555;border:none;font-size:11px;font-weight:700;cursor:pointer">거절</button>
          </div>` : ''}
      </div>
      ${feePaidHtml}
    </div>`;
  }).join('');
}

async function toggleMoimFeePaid(appId, gatheringId, currentPaid, btn) {
  const newPaid = !currentPaid;
  btn.disabled = true;
  const { error } = await db.from('gathering_applications').update({
    fee_paid: newPaid,
    fee_paid_at: newPaid ? new Date().toISOString() : null
  }).eq('id', appId);
  if (error) { showToast('저장 실패'); btn.disabled = false; return; }
  btn.style.background = newPaid ? '#dcfce7' : '#f3f4f6';
  btn.style.color = newPaid ? '#15803d' : '#6b7280';
  btn.textContent = newPaid ? '✅ 납부확인' : '□ 미납부';
  btn.onclick = () => toggleMoimFeePaid(appId, gatheringId, newPaid, btn);
  btn.disabled = false;
  showToast(newPaid ? '✅ 참가비 납부 확인' : '납부 확인 취소');
}

async function decideMoimApp(appId, decision, gatheringId) {
  const { error } = await db.from('gathering_applications').update({ status: decision }).eq('id', appId);
  if (error) { showToast('처리 중 오류가 발생했어요'); return; }
  // 승인 시 current_count 증가
  if (decision === 'approved') {
    const { data: g } = await db.from('gatherings').select('current_count').eq('id', gatheringId).single();
    await db.from('gatherings').update({ current_count: (g?.current_count || 0) + 1 }).eq('id', gatheringId);
  }
  showToast(decision === 'approved' ? '✅ 승인했습니다' : '거절했습니다');
  loadMoimApplicants(gatheringId);
}

// ── 모임 개설/수정 폼 ─────────────────────────────────────
async function searchMoimPlace() {
  const query = document.getElementById('f-moim-place-search').value.trim();
  if (!query) { showToast('장소명을 입력해주세요'); return; }
  const btn = event?.target;
  if (btn) { btn.textContent = '검색 중...'; btn.disabled = true; }
  const results = await new Promise(resolve => {
    try {
      new kakao.maps.services.Places().keywordSearch(query, (r, s) => {
        resolve(s === kakao.maps.services.Status.OK ? r : []);
      });
    } catch { resolve([]); }
  });
  if (btn) { btn.textContent = '검색'; btn.disabled = false; }
  const box = document.getElementById('moim-place-results');
  if (!results.length) { box.style.display = 'none'; showToast('검색 결과가 없어요'); return; }
  box.style.display = 'block';
  box.innerHTML = results.slice(0, 5).map(r => `
    <div onclick="selectMoimPlace('${r.place_name.replace(/'/g,"\\'")}','${(r.road_address_name||r.address_name).replace(/'/g,"\\'")}',${r.y},${r.x})"
      style="padding:11px 14px;border-bottom:1px solid #EDE9FE;cursor:pointer;display:flex;flex-direction:column;gap:2px;-webkit-tap-highlight-color:transparent"
      onmousedown="this.style.background='#F5F3FF'" onmouseup="this.style.background=''" ontouchstart="this.style.background='#F5F3FF'" ontouchend="this.style.background=''">
      <div style="font-size:13px;font-weight:800;color:#111">${r.place_name}</div>
      <div style="font-size:11px;color:#888">${r.road_address_name || r.address_name}</div>
      ${r.category_name ? `<div style="font-size:10px;color:#7C3AED;font-weight:600">${r.category_name}</div>` : ''}
    </div>`).join('');
}

function selectMoimPlace(name, addr, lat, lng) {
  document.getElementById('f-moim-location').value = name;
  document.getElementById('f-moim-address').value = addr;
  document.getElementById('f-moim-lat').value = lat;
  document.getElementById('f-moim-lng').value = lng;
  document.getElementById('moim-place-results').style.display = 'none';
  document.getElementById('moim-place-selected').style.display = 'block';
  document.getElementById('moim-place-sel-name').textContent = name;
  document.getElementById('moim-place-sel-addr').textContent = addr;
  document.getElementById('f-moim-place-search').value = name;
}

function _resetMoimForm() {
  document.getElementById('f-moim-id').value = '';
  document.getElementById('f-moim-cat').value = '';
  document.getElementById('f-moim-subcat').value = '';
  document.getElementById('f-moim-title').value = '';
  document.getElementById('f-moim-desc').value = '';
  document.getElementById('f-moim-date').value = '';
  document.getElementById('f-moim-time').value = '14:00';
  document.getElementById('f-moim-location').value = '';
  document.getElementById('f-moim-address').value = '';
  document.getElementById('f-moim-lat').value = '';
  document.getElementById('f-moim-lng').value = '';
  document.getElementById('f-moim-place-search').value = '';
  document.getElementById('moim-place-results').style.display = 'none';
  document.getElementById('moim-place-selected').style.display = 'none';
  document.getElementById('f-moim-maxcount').value = '10';
  document.getElementById('f-moim-fee').value = '0';
  document.getElementById('f-moim-skill').value = '무관';
  document.getElementById('f-moim-gender').value = 'any';
  document.getElementById('f-moim-public').value = 'true';
  // 버튼 상태 초기화
  document.querySelectorAll('#moim-cat-select button').forEach(b => { b.style.background='#f9fafb'; b.style.borderColor='#e5e7eb'; b.style.color='#555'; });
  document.querySelectorAll('#moim-skill-btns button').forEach(b => { b.style.background=(b.textContent==='무관'?'#fff':'#f9fafb'); b.style.borderColor=(b.textContent==='무관'?'#DDD6FE':'#e5e7eb'); b.style.color=(b.textContent==='무관'?'#7C3AED':'#555'); });
  selectMoimPublic(true);
  document.getElementById('moim-skill-section').style.display = 'none';
  document.getElementById('moim-subcat-section').style.display = 'none';
  document.getElementById('moim-subcat-btns').innerHTML = '';
  moimImgs = [];
  renderMoimImgPreview();
}
function _fillMoimForm(m) {
  document.getElementById('f-moim-id').value = m.id;
  document.getElementById('f-moim-cat').value = m.category || '';
  document.getElementById('f-moim-subcat').value = m.sub_category || '';
  document.getElementById('f-moim-title').value = m.title || '';
  document.getElementById('f-moim-desc').value = m.description || '';
  if (m.gathering_date) {
    const d = new Date(m.gathering_date);
    document.getElementById('f-moim-date').value = d.toISOString().slice(0,10);
    document.getElementById('f-moim-time').value = d.toTimeString().slice(0,5);
  }
  document.getElementById('f-moim-location').value = m.location_name || '';
  document.getElementById('f-moim-address').value = m.location_address || '';
  document.getElementById('f-moim-maxcount').value = m.max_count || 10;
  selectMoimFee(m.entry_fee < 0 ? 'split' : m.entry_fee > 0 ? 'fixed' : 'free', m.entry_fee > 0 ? m.entry_fee : '');
  selectMoimPublic(m.is_public !== false);
  if (m.category) { const btn = [...document.querySelectorAll('#moim-cat-select button')].find(b => b.textContent.includes(m.category)); if (btn) selectMoimCat(btn, m.category); }
  if (m.sub_category) { const subBtn = [...document.querySelectorAll('#moim-subcat-btns button')].find(b => b.textContent.trim().includes(m.sub_category)); if (subBtn) selectMoimSubcat(subBtn, m.sub_category); }
  if (m.skill_level) { const btn = [...document.querySelectorAll('#moim-skill-btns button')].find(b => b.textContent === m.skill_level); if (btn) selectMoimSkill(btn, m.skill_level); }
  if (m.gender_req) {
    const genderBtn = [...document.querySelectorAll('[onclick*=selectMoimGender]')].find(b => b.getAttribute('onclick').includes(`'${m.gender_req}'`));
    if (genderBtn) selectMoimGender(genderBtn, m.gender_req);
  }
  moimImgs = (m.images || []).map(url => ({ src: url, file: null }));
  renderMoimImgPreview();
}

const _MOIM_SUBCATS = {
  '스포츠': ['스크린골프','테니스','라운딩','탁구','배드민턴','수영','클라이밍','헬스/PT','자전거','러닝','요가/필라테스','기타 스포츠'],
  '취미':   ['보드게임','게임','그림/드로잉','영화','요리','등산/트레킹','독서','기타 취미'],
  '친목':   ['와인','위스키','맥주/펍','커피/카페','맛집탐방','여행','기타 친목'],
  '기타':   [],
};
const _MOIM_SUBCAT_EMOJI = {
  '스크린골프':'⛳','테니스':'🎾','라운딩':'🏌️','탁구':'🏓','배드민턴':'🏸','수영':'🏊',
  '클라이밍':'🧗','헬스/PT':'💪','자전거':'🚴','러닝':'🏃','요가/필라테스':'🧘','기타 스포츠':'🏅',
  '보드게임':'🎲','게임':'🎮','그림/드로잉':'🎨','영화':'🎬','요리':'🍳',
  '등산/트레킹':'🏔️','독서':'📚','기타 취미':'✨',
  '와인':'🍷','위스키':'🥃','맥주/펍':'🍺','커피/카페':'☕','맛집탐방':'🍜','여행':'✈️','기타 친목':'🤝',
};
function selectMoimCat(btn, cat) {
  document.querySelectorAll('#moim-cat-select button').forEach(b => { b.style.background='#f9fafb'; b.style.borderColor='#e5e7eb'; b.style.color='#555'; });
  btn.style.background='#EDE9FE'; btn.style.borderColor='#7C3AED'; btn.style.color='#7C3AED';
  document.getElementById('f-moim-cat').value = cat;
  document.getElementById('moim-skill-section').style.display = cat === '스포츠' ? 'block' : 'none';
  const subs = _MOIM_SUBCATS[cat] || [];
  const sec = document.getElementById('moim-subcat-section');
  const btnsEl = document.getElementById('moim-subcat-btns');
  document.getElementById('f-moim-subcat').value = '';
  if (subs.length) {
    btnsEl.innerHTML = subs.map(s => {
      const em = _MOIM_SUBCAT_EMOJI[s] || '';
      return `<button type="button" onclick="selectMoimSubcat(this,'${s}')" style="padding:7px 12px;border-radius:20px;border:1.5px solid #e5e7eb;background:#f9fafb;font-size:12px;font-weight:700;cursor:pointer;color:#555">${em} ${s}</button>`;
    }).join('');
    sec.style.display = 'block';
  } else {
    sec.style.display = 'none';
  }
}
function selectMoimSubcat(btn, val) {
  document.querySelectorAll('#moim-subcat-btns button').forEach(b => { b.style.background='#f9fafb'; b.style.borderColor='#e5e7eb'; b.style.color='#555'; });
  btn.style.background='#EDE9FE'; btn.style.borderColor='#7C3AED'; btn.style.color='#7C3AED';
  document.getElementById('f-moim-subcat').value = val;
}
function selectMoimSkill(btn, val) {
  document.querySelectorAll('#moim-skill-btns button').forEach(b => { b.style.background='#f9fafb'; b.style.borderColor='#e5e7eb'; b.style.color='#555'; });
  btn.style.background='#EDE9FE'; btn.style.borderColor='#7C3AED'; btn.style.color='#7C3AED';
  document.getElementById('f-moim-skill').value = val;
}
function selectMoimFee(type, amount) {
  const styles = { active: { background:'#EDE9FE', borderColor:'#7C3AED', color:'#7C3AED' }, inactive: { background:'#f9fafb', borderColor:'#e5e7eb', color:'#555' } };
  ['free','split','fixed'].forEach(t => {
    const b = document.getElementById(`fee-btn-${t}`);
    if (!b) return;
    const s = styles[t === type ? 'active' : 'inactive'];
    b.style.background = s.background; b.style.borderColor = s.borderColor; b.style.color = s.color;
    b.style.border = `2px solid ${s.borderColor}`;
  });
  const amtEl = document.getElementById('f-moim-fee-amt');
  const feeEl = document.getElementById('f-moim-fee');
  const hintEl = document.getElementById('f-moim-fee-hint');
  const hints = {
    free:  '',
    split: '금액을 미리 정하지 않아요. 모임 당일 실제 비용(식사비 등)을 참가자끼리 그 자리에서 나눠 냅니다.',
    fixed: '호스트가 정한 금액을 참가 전 미리 안내합니다. 참가자는 이 금액을 알고 신청해요.',
  };
  if (hintEl) hintEl.textContent = hints[type] || '';
  if (type === 'free')  { if (amtEl) amtEl.style.display = 'none'; if (feeEl) feeEl.value = '0'; }
  if (type === 'split') { if (amtEl) amtEl.style.display = 'none'; if (feeEl) feeEl.value = '-1'; }
  if (type === 'fixed') {
    if (amtEl) { amtEl.style.display = 'block'; if (amount) amtEl.value = amount; }
    if (feeEl) feeEl.value = amount || '';
  }
}
function selectMoimGender(btn, val) {
  btn.parentElement.querySelectorAll('button').forEach(b => { b.style.background='#f9fafb'; b.style.borderColor='#e5e7eb'; b.style.color='#555'; b.style.border='2px solid #e5e7eb'; });
  btn.style.background='#7C3AED'; btn.style.color='#fff'; btn.style.borderColor='#7C3AED';
  document.getElementById('f-moim-gender').value = val;
}
function selectMoimPublic(isPublic) {
  document.getElementById('f-moim-public').value = String(isPublic);
  document.getElementById('pub-btn-public').style.background  = isPublic ? '#EDE9FE' : '#f9fafb';
  document.getElementById('pub-btn-public').style.borderColor = isPublic ? '#7C3AED' : '#e5e7eb';
  document.getElementById('pub-btn-public').style.color       = isPublic ? '#7C3AED' : '#555';
  document.getElementById('pub-btn-private').style.background  = !isPublic ? '#EDE9FE' : '#f9fafb';
  document.getElementById('pub-btn-private').style.borderColor = !isPublic ? '#7C3AED' : '#e5e7eb';
  document.getElementById('pub-btn-private').style.color       = !isPublic ? '#7C3AED' : '#555';
}

function toggleQuickMoim() {
  const input = document.getElementById('f-moim-is-quick');
  const toggle = document.getElementById('quick-toggle');
  const dot = document.getElementById('quick-toggle-dot');
  const section = document.getElementById('quick-duration-section');
  const isNowOn = input.value !== 'true';
  input.value = isNowOn ? 'true' : 'false';
  toggle.style.background = isNowOn ? '#f59e0b' : '#e5e7eb';
  dot.style.left = isNowOn ? '22px' : '2px';
  section.style.display = isNowOn ? 'block' : 'none';
}
function selectQuickDuration(btn, minutes) {
  document.getElementById('f-moim-quick-minutes').value = minutes;
  btn.closest('div').querySelectorAll('button').forEach(b => {
    b.style.border = '1.5px solid #e5e7eb';
    b.style.background = '#f9fafb';
    b.style.color = '#555';
    b.style.fontWeight = '700';
  });
  btn.style.border = '1.5px solid #fde68a';
  btn.style.background = '#fef3c7';
  btn.style.color = '#92400e';
  btn.style.fontWeight = '800';
}

async function submitMoimForm() {
  if (!currentUser) { showLoginPrompt('로그인 후 모임을 만들 수 있어요', ''); return; }
  const cat = document.getElementById('f-moim-cat').value;
  const title = document.getElementById('f-moim-title').value.trim();
  const dateVal = document.getElementById('f-moim-date').value;
  if (!cat) { showToast('카테고리를 선택해주세요'); return; }
  if (!title) { showToast('모임 제목을 입력해주세요'); return; }

  // 무료 플랜 월 1개 제한 체크
  const editId = document.getElementById('f-moim-id').value;
  if (!editId) {
    const plan = (typeof _currentPlan !== 'undefined' ? _currentPlan : 'free');
    const limit = MOIM_PLAN_LIMITS[plan] ?? 1;
    if (isFinite(limit)) {
      const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0,0,0,0);
      const { count } = await db.from('gatherings').select('id', { count:'exact', head:true }).eq('host_id', currentUser.id).gte('created_at', monthStart.toISOString());
      if ((count || 0) >= limit) {
        const planName = { free:'무료', basic:'베이직', pro:'프로' }[plan] || '현재';
        showAlert(`${planName} 플랜은 월 ${limit}개까지 모임을 개설할 수 있어요.\n베이직(₩9,900/월)은 월 10개, 프로(₩29,900/월)는 무제한입니다.`, { icon:'⭐', title:'플랜 업그레이드' });
        return;
      }
    }
  }

  const dateTime = dateVal ? new Date(`${dateVal}T${document.getElementById('f-moim-time').value || '14:00'}:00`) : null;
  const isPublic = document.getElementById('f-moim-public').value === 'true';
  const invite_code = !isPublic ? crypto.randomUUID() : null;

  const payload = {
    host_id:          currentUser.id,
    category:         cat,
    sub_category:     document.getElementById('f-moim-subcat').value.trim() || null,
    title,
    description:      document.getElementById('f-moim-desc').value.trim() || null,
    gathering_date:   dateTime?.toISOString() || null,
    location_name:    document.getElementById('f-moim-location').value.trim() || null,
    location_address: document.getElementById('f-moim-address').value.trim() || null,
    lat: parseFloat(document.getElementById('f-moim-lat')?.value) || null,
    lng: parseFloat(document.getElementById('f-moim-lng')?.value) || null,
    max_count:        parseInt(document.getElementById('f-moim-maxcount').value) || 10,
    entry_fee:        (() => { const amt = document.getElementById('f-moim-fee-amt'); const v = parseInt(document.getElementById('f-moim-fee').value); if (v === -1) return -1; if (amt && amt.style.display !== 'none') return parseInt(amt.value) || 0; return v || 0; })(),
    skill_level:      document.getElementById('f-moim-skill').value || '무관',
    skill_desc:       document.getElementById('f-moim-skill-desc')?.value.trim() || null,
    gender_req:       document.getElementById('f-moim-gender').value || 'any',
    is_public:        isPublic,
    invite_code,
    status:           'open',
    is_quick:         document.getElementById('f-moim-is-quick').value === 'true',
    quick_expires_at: (() => {
      if (document.getElementById('f-moim-is-quick').value !== 'true') return null;
      const mins = parseInt(document.getElementById('f-moim-quick-minutes').value) || 30;
      return new Date(Date.now() + mins * 60000).toISOString();
    })(),
  };

  const btn = document.getElementById('moim-submit-btn');
  btn.disabled = true; btn.textContent = '처리 중...';

  // 사진 업로드
  const sess = currentSession;
  const _uploadedMoimUrls = [];
  if (moimImgs.some(img => img.file)) btn.textContent = '사진 업로드 중...';
  for (const img of moimImgs) {
    if (!img.file) {
      _uploadedMoimUrls.push(img.src);
    } else {
      const path = 'moim/' + currentUser.id + '/' + Date.now() + '_' + Math.random().toString(36).slice(2) + '.jpg';
      try {
        const r = await fetch(APP_CONFIG.SUPABASE_URL + '/storage/v1/object/job-images/' + path, {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + (sess?.access_token || ''), 'Content-Type': 'image/jpeg' },
          body: img.file
        });
        if (r.ok) {
          _uploadedMoimUrls.push(APP_CONFIG.SUPABASE_URL + '/storage/v1/object/public/job-images/' + path);
        } else {
          showToast('사진 업로드 실패 — 사진 없이 저장됩니다', 5000);
        }
      } catch(e) {
        showToast('사진 업로드 중 오류 — 사진 없이 저장됩니다', 5000);
      }
    }
  }
  payload.images = _uploadedMoimUrls;
  btn.textContent = '처리 중...';

  let error, data;
  if (editId) {
    ({ error, data } = await db.from('gatherings').update(payload).eq('id', editId).select().single());
  } else {
    ({ error, data } = await db.from('gatherings').insert(payload).select().single());
  }

  btn.disabled = false; btn.textContent = editId ? '수정 완료' : '모임 개설하기';
  if (error) { showToast('오류가 발생했어요: ' + error.message); return; }

  showToast(editId ? '✅ 모임을 수정했어요' : '✅ 모임을 개설했어요!');
  closeMoimCreate();

  // 비공개 모임은 즉시 초대 링크 공유 안내
  if (!isPublic && data?.invite_code) {
    const link = `${location.origin}${location.pathname}?moim=${data.invite_code}`;
    showConfirm('비공개 모임이 개설됐어요.\n초대 링크를 복사하시겠어요?', () => {
      navigator.clipboard.writeText(link).then(() => showToast('📋 초대 링크 복사됨')).catch(() => showToast(link));
    }, { icon:'🔐', title:'초대 링크', okLabel:'복사하기' });
  }

  loadMoimList();
}

// ── 공유 / 딥링크 ─────────────────────────────────────────
async function shareMoim() {
  if (!_currentMoimId) return;
  const m = _moimDetailData;
  if (!m) return;
  const code = m.is_public ? _currentMoimId : m.invite_code;
  const link = `${location.origin}${location.pathname}?moim=${code}`;

  // 공유 메시지 구성
  const dateStr = m.gathering_date
    ? new Date(m.gathering_date).toLocaleString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' })
    : '일정 미정';
  const feeStr = m.entry_fee < 0 ? '각자 분담' : m.entry_fee > 0 ? `${m.entry_fee.toLocaleString()}원` : '무료';
  const locationStr = m.location_name || '장소 미정';
  const shareTitle = `[바로모임] ${m.title}`;
  // 줄바꿈 포맷 메시지
  const shareText = `[바로모임] ${m.title}\n📅 ${dateStr}\n📍 ${locationStr}\n💰 참가비 ${feeStr}\n같이 참가해요!`;
  // Kakao description용 단행 요약
  const descLine = `📅 ${dateStr}  📍 ${locationStr}  💰 ${feeStr}`;

  // Android: AndroidBridge 네이티브 공유 시트 (줄바꿈 지원)
  if (/Android/i.test(navigator.userAgent) && window.AndroidBridge) {
    window.AndroidBridge.share(shareTitle, shareText, link);
    return;
  }

  // Kakao SDK 공유
  if (window.Kakao?.isInitialized?.()) {
    try {
      Kakao.Share.sendDefault({
        objectType: 'feed',
        content: {
          title: shareTitle,
          description: descLine,
          imageUrl: `${location.origin}/icons/og-share.png`,
          link: { mobileWebUrl: link, webUrl: link }
        },
        buttons: [{ title: '모임 참여하기', link: { mobileWebUrl: link, webUrl: link } }]
      });
      return;
    } catch(e) {}
  }

  // Web Share API (iOS Safari 등)
  if (navigator.share) {
    navigator.share({ title: shareTitle, text: shareText, url: link }).catch(() => {});
    return;
  }

  // 최종 fallback: 링크 복사
  navigator.clipboard.writeText(link).then(() => showToast('📋 링크 복사됨')).catch(() => showToast(link));
}

async function handleMoimDeeplink(codeOrId) {
  // public: id 직접, private: invite_code로 검색
  let { data: m } = await db.from('gatherings').select('*').eq('id', codeOrId).maybeSingle();
  if (!m) {
    const { data: m2 } = await db.from('gatherings').select('*').eq('invite_code', codeOrId).maybeSingle();
    m = m2;
  }
  if (!m) { showToast('유효하지 않은 모임 링크입니다'); return; }
  openMoimPanel();
  setTimeout(() => openMoimDetail(m.id), 300);
}

// ── 단체 채팅 ────────────────────────────────────────────
async function openMoimChat(gatheringId, title) {
  document.getElementById('panel-moim-chat').classList.add('show');
  // 바로모임(보라)/바로미팅(로즈)을 색으로 구분 - 안전영역 얇은 띠만으로는 눈에 잘 안 띄어서
  // 헤더 배경 전체를 옅은 색으로 tint (바로알바 1:1 채팅은 기존 화이트 그대로 유지)
  const _mcSafearea = document.getElementById('moim-chat-safearea');
  if (_mcSafearea) _mcSafearea.style.background = '#7C3AED';
  const _mcHeader = document.getElementById('moim-chat-header');
  if (_mcHeader) _mcHeader.style.background = '#F5F3FF';
  const _mcSendBtn = document.querySelector('#moim-chat-input-bar button[onclick="sendMoimChat()"]');
  if (_mcSendBtn) _mcSendBtn.style.background = '#7C3AED';
  // FAB(z-index:520)이 panel-moim-chat(z-index:400) 위로 뚫고 나오는 현상 방지
  const _mcFab = document.getElementById('posting-fab');
  if (_mcFab) _mcFab.style.display = 'none';
  document.getElementById('moim-chat-title').textContent = title || '모임 채팅';
  document.getElementById('moim-chat-messages').innerHTML = '<div style="text-align:center;padding:24px;color:#bbb;font-size:13px">채팅 불러오는 중...</div>';
  // 날짜 부제목 — _moimDetailData에서 읽음
  const chatSub = document.getElementById('moim-chat-members-text');
  if (_moimDetailData?.gathering_date) {
    const dStr = new Date(_moimDetailData.gathering_date).toLocaleDateString('ko-KR', { month:'short', day:'numeric', weekday:'short' });
    chatSub.textContent = `📅 ${dStr} · 참가자 로딩 중`;
  }

  // 참가자 수
  const { count } = await db.from('gathering_applications').select('id', { count:'exact', head:true }).eq('gathering_id', gatheringId).eq('status', 'approved');
  const memberCount = (count || 0) + 1; // 주최자 포함
  const dStr2 = _moimDetailData?.gathering_date ? new Date(_moimDetailData.gathering_date).toLocaleDateString('ko-KR', { month:'short', day:'numeric', weekday:'short' }) + ' · ' : '';
  document.getElementById('moim-chat-members-text').textContent = `${dStr2}참가자 ${memberCount}명`;
  document.getElementById('moim-chat-participants').style.display = 'none';
  document.getElementById('moim-chat-members-arrow').textContent = '▾';
  // 나가기 링크/내 프로필 배지는 바로미팅 익명채팅 전용 - 일반 모임 채팅에서는 숨김
  const _mcLeave = document.getElementById('moim-chat-leave-link');
  if (_mcLeave) _mcLeave.style.display = 'none';
  const _mcProfile = document.getElementById('moim-chat-myprofile');
  if (_mcProfile) _mcProfile.style.display = 'none';

  // 기존 메시지 로드 (sender_name은 insert 시 denormalize된 값)
  const { data: msgs } = await db.from('gathering_chats').select('*').eq('gathering_id', gatheringId).order('sent_at').limit(100);
  _renderMoimChatMessages(msgs || []);

  // Realtime 구독
  if (_moimRealtimeCh) db.removeChannel(_moimRealtimeCh);
  _moimRealtimeCh = db.channel('moim-chat-' + gatheringId)
    .on('postgres_changes', { event:'INSERT', schema:'public', table:'gathering_chats', filter:`gathering_id=eq.${gatheringId}` }, payload => {
      _appendMoimChatMsg(payload.new);
    }).subscribe();

  // 채팅 인풋 gatheringId 저장
  document.getElementById('moim-chat-input').dataset.gatheringId = gatheringId;
}

function _renderMoimChatMessages(msgs) {
  const el = document.getElementById('moim-chat-messages');
  if (!msgs.length) { el.innerHTML = '<div style="text-align:center;padding:32px;color:#bbb;font-size:13px">아직 메시지가 없어요<br>첫 인사를 남겨보세요 👋</div>'; return; }
  el.innerHTML = msgs.map(m => _moimChatBubble(m)).join('');
  el.scrollTop = el.scrollHeight;
}
function _appendMoimChatMsg(msg) {
  const el = document.getElementById('moim-chat-messages');
  el.insertAdjacentHTML('beforeend', _moimChatBubble(msg));
  el.scrollTop = el.scrollHeight;
}

// 참석자 목록 - 몇 명이 들어와 있는지 전혀 알 수 없다는 피드백으로 추가.
// 바로미팅은 익명 채팅이라 닉네임/아바타만, 바로모임은 실명/사진으로 표시
async function toggleMoimChatParticipants() {
  const box = document.getElementById('moim-chat-participants');
  const arrow = document.getElementById('moim-chat-members-arrow');
  const isOpen = box.style.display !== 'none';
  if (isOpen) { box.style.display = 'none'; arrow.textContent = '▾'; return; }
  box.style.display = 'block';
  arrow.textContent = '▴';
  box.innerHTML = '<div style="text-align:center;padding:10px;color:#bbb;font-size:12px">불러오는 중...</div>';

  const gatheringId = document.getElementById('moim-chat-input').dataset.gatheringId;
  const isBaromeet = document.getElementById('moim-chat-input').dataset.baromeet === '1';
  if (!gatheringId) { box.innerHTML = ''; return; }

  const { data: apps } = await db.from('gathering_applications')
    .select('applicant_id').eq('gathering_id', gatheringId).eq('status', 'approved');
  const applicantIds = [...new Set((apps || []).map(a => a.applicant_id).filter(Boolean))];
  const { data: g } = await db.from('gatherings').select('host_id').eq('id', gatheringId).maybeSingle();
  const allIds = [...new Set([...(g?.host_id ? [g.host_id] : []), ...applicantIds])];
  if (!allIds.length) { box.innerHTML = '<div style="text-align:center;padding:10px;color:#bbb;font-size:12px">참가자 정보가 없어요</div>'; return; }

  const selectCols = isBaromeet ? 'kakao_uid, name, gender, baromeet_nick, baromeet_avatar, photo_url' : 'kakao_uid, name, photo_url';
  const { data: workers } = await db.from('workers').select(selectCols).in('kakao_uid', allIds);
  const workerMap = Object.fromEntries((workers || []).map(w => [w.kakao_uid, w]));

  box.innerHTML = allIds.map(uid => {
    const w = workerMap[uid];
    const isHost = uid === g?.host_id;
    if (isBaromeet) {
      const nick = w?.baromeet_nick || '익명참가자';
      const avatarUrl = _resolveBaromeetAvatarUrl(w?.baromeet_avatar, w?.photo_url);
      const avatarHtml = avatarUrl && avatarUrl.startsWith('emoji:')
        ? `<div style="width:32px;height:32px;border-radius:50%;background:#FFF1F2;display:flex;align-items:center;justify-content:center;font-size:17px;flex-shrink:0">${avatarUrl.slice(6)}</div>`
        : avatarUrl
        ? `<img src="${avatarUrl}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;flex-shrink:0">`
        : `<div style="width:32px;height:32px;border-radius:50%;background:#f1f5f9;display:flex;align-items:center;justify-content:center;font-size:15px;color:#94a3b8;flex-shrink:0">?</div>`;
      return `<div style="display:flex;align-items:center;gap:8px;padding:6px 4px">
        ${avatarHtml}
        <span style="font-size:13px;font-weight:700;color:#333">${nick}</span>
        ${isHost ? '<span style="font-size:10px;color:#e11d48;font-weight:700">주최</span>' : ''}
      </div>`;
    }
    const name = w?.name || '참가자';
    const avatarHtml = w?.photo_url
      ? `<img src="${w.photo_url}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;flex-shrink:0">`
      : `<div style="width:32px;height:32px;border-radius:50%;background:#F5F3FF;display:flex;align-items:center;justify-content:center;font-size:15px;color:#7C3AED;flex-shrink:0">${name[0]||'?'}</div>`;
    return `<div style="display:flex;align-items:center;gap:8px;padding:6px 4px">
      ${avatarHtml}
      <span style="font-size:13px;font-weight:700;color:#333">${name}</span>
      ${isHost ? '<span style="font-size:10px;color:#7C3AED;font-weight:700">방장</span>' : ''}
    </div>`;
  }).join('');
}
function _moimChatBubble(m) {
  const isMine = currentUser && m.sender_id === currentUser.id;
  const name = m.sender_name || '참가자';
  const time = new Date(m.sent_at).toLocaleTimeString('ko-KR', { hour:'2-digit', minute:'2-digit' });
  // 오픈카톡 스타일 - 실사진(URL) 또는 'emoji:🐱' 형식의 캐릭터 아바타 중 하나
  let avatar = '';
  if (m.sender_photo_url?.startsWith('emoji:')) {
    avatar = `<span style="width:18px;height:18px;border-radius:50%;background:#ede9fe;display:flex;align-items:center;justify-content:center;font-size:12px;flex-shrink:0">${m.sender_photo_url.slice(6)}</span>`;
  } else if (m.sender_photo_url) {
    avatar = `<img src="${m.sender_photo_url}" style="width:18px;height:18px;border-radius:50%;object-fit:cover;flex-shrink:0">`;
  }
  const isImg = m.message?.startsWith('[img]');
  const bubbleContent = isImg
    ? `<img src="${m.message.slice(5)}" style="max-width:220px;border-radius:12px;display:block;cursor:pointer;border:1px solid #eee" onclick="window.open('${m.message.slice(5)}','_blank')" loading="lazy">`
    : `<div style="max-width:72%;padding:9px 13px;border-radius:${isMine?'16px 4px 16px 16px':'4px 16px 16px 16px'};background:${isMine?'#7C3AED':'#f0f0f0'};color:${isMine?'#fff':'#111'};font-size:14px;word-break:break-word;line-height:1.5">${m.message}</div>`;
  return `<div style="display:flex;flex-direction:column;align-items:${isMine?'flex-end':'flex-start'};margin-bottom:4px">
    ${!isMine ? `<div style="display:flex;align-items:center;gap:5px;margin-bottom:2px;padding-left:4px">${avatar}<span style="font-size:10px;color:#999;font-weight:600">${name}</span></div>` : ''}
    <div style="display:flex;align-items:flex-end;gap:4px;flex-direction:${isMine?'row-reverse':'row'}">
      ${bubbleContent}
      <div style="font-size:10px;color:#bbb;white-space:nowrap">${time}</div>
    </div>
  </div>`;
}

async function _doSendMoimChat(msg) {
  const input = document.getElementById('moim-chat-input');
  const gatheringId = input.dataset.gatheringId;
  if (!msg || !gatheringId || !currentUser) return;
  // 바로미팅 채팅방은 익명 - 실명 대신 본인이 설정한 익명 닉네임 사용, 사진공개 설정 시에만 사진 첨부
  const isBaromeet = input.dataset.baromeet === '1';
  const senderName = isBaromeet
    ? (_baromeetAnonLabel || '참가자')
    : (currentUser.user_metadata?.full_name || currentUser.user_metadata?.name || currentUser.email?.split('@')[0] || '참가자');
  const senderPhotoUrl = isBaromeet ? (_baromeetPhotoUrl || null) : null;
  const { error: _gcErr } = await db.from('gathering_chats').insert({ gathering_id: gatheringId, sender_id: currentUser.id, sender_name: senderName, sender_photo_url: senderPhotoUrl, message: msg });
  if (_gcErr) { showToast('전송 실패: ' + _gcErr.message); }
}

async function sendMoimChat() {
  if (_pendingMoimFiles.length) { await _uploadAndSendMoimChatImage(); return; }
  const input = document.getElementById('moim-chat-input');
  const msg = input.value.trim();
  if (!msg) return;
  input.value = '';
  await _doSendMoimChat(msg);
}

let _pendingMoimFiles = [];
function sendMoimChatImage(inputEl) {
  const files = Array.from(inputEl.files || []).filter(f => f.size <= 10 * 1024 * 1024);
  if (inputEl.files.length && !files.length) { showToast('10MB 이하 이미지만 전송 가능합니다'); }
  inputEl.value = '';
  closeMediaPanel('moim');
  if (!files.length) return;
  _pendingMoimFiles = files;
  const bar = document.getElementById('moim-img-preview-bar');
  const thumb = document.getElementById('moim-img-preview-thumb');
  thumb.src = URL.createObjectURL(files[0]);
  _setImgPreviewCountBadge('moim', files.length);
  bar.style.display = 'flex';
}
function cancelMoimChatImage() {
  _pendingMoimFiles = [];
  document.getElementById('moim-img-preview-bar').style.display = 'none';
}
async function _uploadAndSendMoimChatImage() {
  const files = _pendingMoimFiles;
  _pendingMoimFiles = [];
  document.getElementById('moim-img-preview-bar').style.display = 'none';
  showToast(files.length > 1 ? `이미지 ${files.length}장 전송 중...` : '이미지 전송 중...');
  for (const file of files) {
    try {
      const url = await uploadChatImage(file);
      await _doSendMoimChat('[img]' + url);
    } catch(e) { showToast('이미지 전송 실패'); }
  }
}

// ── 지도 모임 모드 ────────────────────────────────────────
let _currentMapMode = 'job'; // 'all' | 'job' | 'moim' | 'baromeet'
let _baromeetOverlays = [];

function setMapMode(mode) {
  _currentMapMode = mode;
  document.getElementById('mapmode-all').classList.toggle('active', mode === 'all');
  document.getElementById('mapmode-job').classList.toggle('active', mode === 'job');
  document.getElementById('mapmode-moim').classList.toggle('active', mode === 'moim');
  document.getElementById('mapmode-baromeet').classList.toggle('active', mode === 'baromeet');

  const topBar = document.querySelector('.top-bar');
  const bottomSheet = document.getElementById('bottom-sheet');
  const radiusBadge = document.getElementById('radius-badge');
  const floatBtn = document.getElementById('map-swipe-float');
  const jobFilterBar = document.querySelector('#map-filter-panel-collapsible .filter-bar-wrapper');
  const ageFilterRow = document.getElementById('bm-age-filter-row');
  const feeFilterRow = document.getElementById('bm-fee-filter-row');
  const moimCatFilterRow = document.getElementById('moim-cat-filter-row');
  const filterToggleBtn = document.getElementById('map-filter-toggle-btn');

  // 알바 전용 하단시트/반경뱃지는 job 모드에서만 - 다른 모드는 지도 위 핀만 보여줌.
  // 검색바+필터버튼 자체는 모드마다 내용만 바뀌며 계속 노출(만남 모드는 연령대 필터를 씀)
  const showJobUI = mode === 'job';
  if (topBar) topBar.style.display = '';
  if (bottomSheet) bottomSheet.style.display = showJobUI ? '' : 'none';
  if (radiusBadge) radiusBadge.style.display = showJobUI ? '' : 'none';
  if (floatBtn) floatBtn.style.display = showJobUI ? '' : 'none';
  if (jobFilterBar) jobFilterBar.style.display = showJobUI ? '' : 'none';
  // 연령대/참가비 필터는 바로만남 전용, 카테고리 필터는 바로모임 전용 - "전체" 모드는
  // 알바/모임/만남을 있는 그대로 다 보여줘야 하므로 어느 필터도 적용하지 않음
  if (ageFilterRow) ageFilterRow.style.display = (mode === 'baromeet') ? 'flex' : 'none';
  if (feeFilterRow) feeFilterRow.style.display = (mode === 'baromeet') ? 'flex' : 'none';
  if (moimCatFilterRow) moimCatFilterRow.style.display = (mode === 'moim') ? 'flex' : 'none';
  if (filterToggleBtn) filterToggleBtn.style.display = 'flex';

  // 모임/만남 모드 전용 "목록 보기" 플로팅 버튼 - 알바 전용인 기존 bottom-sheet를 건드리지 않고 별도 시트로 목록 제공
  const listFloat = document.getElementById('map-list-float');
  if (listFloat) {
    if (mode === 'moim' || mode === 'baromeet' || mode === 'all') {
      listFloat.style.display = 'flex';
      listFloat.style.background = mode === 'baromeet' ? '#e11d48' : mode === 'moim' ? '#7C3AED' : '#1e293b';
    } else {
      listFloat.style.display = 'none';
    }
  }

  // 알바 마커
  overlays.forEach(o => o.setMap((mode === 'job' || mode === 'all') ? kakaoMap : null));
  // 모임 마커
  if (mode === 'moim' || mode === 'all') {
    _renderMoimMarkers();
  } else {
    _moimOverlays.forEach(o => o.setMap(null));
    _moimOverlays = [];
  }
  // 바로미팅/바로만남 마커
  if (mode === 'baromeet' || mode === 'all') {
    _renderBaromeetMarkers();
  } else {
    _baromeetOverlays.forEach(o => o.setMap(null));
    _baromeetOverlays = [];
  }
}

let _moimCatFilter = '';
function setMoimCatFilter(el, cat) {
  _moimCatFilter = cat;
  document.querySelectorAll('#moim-cat-filter-row .chip').forEach(c => c.classList.toggle('active', c === el));
  _renderMoimMarkers();
}

let _moimMarkerData = [];
async function _renderMoimMarkers() {
  _moimOverlays.forEach(o => o.setMap(null));
  _moimOverlays = [];
  if (!kakaoMap) return;

  // 바로미팅(category='baromeeting')은 _renderBaromeetMarkers()가 별도로 그리므로 여기서는 제외
  const { data: allMoims } = await db.from('gatherings').select('id,title,category,gathering_date,current_count,max_count,lat,lng').eq('status','open').eq('is_public',true).neq('category','baromeeting').not('lat','is',null);
  // 카테고리 필터는 "모임" 모드에서만 적용 - "전체" 모드에서는 필터 없이 전부 보여줌
  const moims = (_moimCatFilter && _currentMapMode === 'moim') ? (allMoims || []).filter(m => m.category === _moimCatFilter) : allMoims;
  _moimMarkerData = moims || [];
  if (!moims?.length) return;

  moims.forEach(m => {
    if (!m.lat || !m.lng) return;
    const emoji = MOIM_CAT_EMOJI[m.category] || '🤝';
    const rem = (m.max_count || 10) - (m.current_count || 0);
    const titleShort = m.title ? (m.title.length > 11 ? m.title.slice(0, 10) + '…' : m.title) : (m.category || '모임');
    const dateStr = m.gathering_date
      ? new Date(m.gathering_date).toLocaleDateString('ko-KR', { month:'numeric', day:'numeric', weekday:'short' })
      : '';
    const content = `<div onclick="openMoimPanel();setTimeout(()=>openMoimDetail('${m.id}'),300)" style="position:relative;display:inline-flex;flex-direction:column;align-items:center;cursor:pointer;width:max-content">
      <div style="background:#7C3AED;color:#fff;border-radius:12px;padding:6px 10px;font-size:12px;font-weight:800;line-height:1.4;box-shadow:0 2px 8px rgba(124,58,237,0.4);white-space:nowrap;max-width:150px">
        <div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${emoji} ${titleShort}</div>
        <div style="font-size:10px;font-weight:700;opacity:0.85;margin-top:2px;white-space:nowrap">${dateStr ? dateStr + ' · ' : ''}${rem > 0 ? rem + '자리' : '마감'}</div>
      </div>
      <div style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:8px solid #7C3AED"></div>
    </div>`;
    const overlay = new kakao.maps.CustomOverlay({ position: new kakao.maps.LatLng(m.lat, m.lng), content, yAnchor: 1.1 });
    overlay.setMap(kakaoMap);
    _moimOverlays.push(overlay);
  });
}

// 지도 모임/만남 모드에서 현재 핀으로 찍힌 항목들을 목록으로도 볼 수 있게 -
// 알바 전용인 기존 #bottom-sheet는 건드리지 않고 범용 바텀시트를 재사용
function _moimListRow(m) {
  const emoji = MOIM_CAT_EMOJI[m.category] || '🤝';
  const rem = (m.max_count || 10) - (m.current_count || 0);
  const dateStr = m.gathering_date ? new Date(m.gathering_date).toLocaleDateString('ko-KR', { month:'numeric', day:'numeric', weekday:'short' }) : '일정 미정';
  return `<div onclick="closeBottomSheet();openMoimPanel();setTimeout(()=>openMoimDetail('${m.id}'),300)" style="display:flex;align-items:center;gap:10px;padding:12px 20px;border-bottom:1px solid #f5f5f5;cursor:pointer">
    <div style="width:38px;height:38px;border-radius:10px;background:#F5F3FF;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">${emoji}</div>
    <div style="min-width:0;flex:1">
      <div style="font-size:14px;font-weight:800;color:#111;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${m.title || '바로모임'}</div>
      <div style="font-size:12px;color:#7C3AED;font-weight:700;margin-top:2px">${dateStr} · ${rem > 0 ? rem + '자리 남음' : '마감'}</div>
    </div>
  </div>`;
}
function _baromeetListRow(m) {
  const maleLeft = (m.baromeeting_male_max || 4) - (m.baromeeting_male_cur || 0);
  const femaleLeft = (m.baromeeting_female_max || 4) - (m.baromeeting_female_cur || 0);
  const isFull = maleLeft <= 0 && femaleLeft <= 0;
  const dateStr = m.gathering_date ? new Date(m.gathering_date).toLocaleDateString('ko-KR', { month:'numeric', day:'numeric', weekday:'short' }) : '일정 미정';
  return `<div onclick="closeBottomSheet();openBaromeetDetail('${m.id}')" style="display:flex;align-items:center;gap:10px;padding:12px 20px;border-bottom:1px solid #f5f5f5;cursor:pointer">
    <div style="width:38px;height:38px;border-radius:10px;background:#FFF1F2;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">💕</div>
    <div style="min-width:0;flex:1">
      <div style="font-size:14px;font-weight:800;color:#111;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${m.title || '바로미팅'}</div>
      <div style="font-size:12px;color:#e11d48;font-weight:700;margin-top:2px">${m.target_age_range ? m.target_age_range + ' · ' : ''}${dateStr} · ${isFull ? '마감' : '모집중'}</div>
      <div style="font-size:11px;color:#999;margin-top:1px">${m.location_name || '장소 미정'}</div>
    </div>
  </div>`;
}
function openMapListSheet() {
  const mode = _currentMapMode;
  let rows = '';
  if (mode === 'moim') rows = _moimMarkerData.map(_moimListRow).join('');
  else if (mode === 'baromeet') rows = _baromeetMarkerData.map(_baromeetListRow).join('');
  else rows = _moimMarkerData.map(_moimListRow).join('') + _baromeetMarkerData.map(_baromeetListRow).join('');
  const title = mode === 'moim' ? '🤝 주변 바로모임' : mode === 'baromeet' ? '💕 주변 바로미팅' : '🗺️ 주변 모임·미팅';
  openBottomSheet(`
    <div style="padding:0 20px 10px;font-size:16px;font-weight:900;color:#111">${title}</div>
    ${rows || '<div style="padding:32px 20px;text-align:center;color:#bbb;font-size:13px">이 지역엔 아직 없어요</div>'}
  `);
}

let _bmAgeFilter = '';
function setBmAgeFilter(el, age) {
  _bmAgeFilter = age;
  document.querySelectorAll('#bm-age-filter-row .chip').forEach(c => c.classList.toggle('active', c === el));
  _renderBaromeetMarkers();
}

let _bmFeeFilter = '';
function setBmFeeFilter(el, fee) {
  _bmFeeFilter = fee;
  document.querySelectorAll('#bm-fee-filter-row .chip').forEach(c => c.classList.toggle('active', c === el));
  _renderBaromeetMarkers();
}

// 출장 등으로 다른 지역 지도를 보고 싶을 때 - 반경 필터 대신 주요 지역으로 지도 중심을 바로 옮겨줌
// (핀 자체는 현재도 반경 제한 없이 전체를 불러오므로 재조회 없이 지도만 이동하면 됨)
// 부산/대구/대전/광주/울산처럼 잘 알려진 광역시는 대분류 단계 없이 최상단에서 바로 이동,
// 서울/경기처럼 세부지역이 여러 곳인 경우와 그 외 기타 지방 도시만 2단계(대분류→세부)로 남김
const MAP_REGION_GROUPS = {
  '서울': [['종로',37.5735,126.9788], ['강남',37.4979,127.0276], ['여의도',37.5219,126.9245], ['잠실',37.5133,127.1000], ['성수',37.5446,127.0557], ['강서',37.5509,126.8495], ['목동',37.5266,126.8642], ['강북',37.6396,127.0257]],
  '경기': [['판교/분당',37.3947,127.1112], ['광명',37.4794,126.8646], ['용인',37.2411,127.1776], ['동탄',37.2003,127.0736], ['남양주/구리',37.6152,127.1731]],
  '지방': [['세종',36.4801,127.2890], ['창원',35.2280,128.6811], ['전주',35.8242,127.1480], ['천안',36.8151,127.1139], ['제주',33.4996,126.5312]],
};
function toggleMapRegionGroup(el, group) {
  document.querySelectorAll('#map-region-group-row .chip').forEach(c => c.classList.toggle('active', c === el));
  const sub = document.getElementById('map-region-sub-row');
  const list = MAP_REGION_GROUPS[group] || [];
  sub.innerHTML = list.map(([name, lat, lng]) =>
    `<div class="chip" onclick="jumpMapRegion(${lat},${lng},'${name}')" style="flex-shrink:0">${name}</div>`
  ).join('');
  sub.style.display = 'flex';
}
function jumpMapRegion(lat, lng, name, el) {
  if (!kakaoMap) return;
  if (el) {
    document.querySelectorAll('#map-region-group-row .chip').forEach(c => c.classList.toggle('active', c === el));
    document.getElementById('map-region-sub-row').style.display = 'none';
  }
  kakaoMap.setCenter(new kakao.maps.LatLng(lat, lng));
  kakaoMap.setLevel(6);
  showToast(`📍 ${name}(으)로 이동했어요`);
  toggleMapFilterPanel(); // 패널을 닫아야 지도가 이동한 게 바로 보임
}

let _baromeetMarkerData = [];
async function _renderBaromeetMarkers() {
  _baromeetOverlays.forEach(o => o.setMap(null));
  _baromeetOverlays = [];
  if (!kakaoMap) return;

  const { data: allMeets } = await db.from('gatherings')
    .select('id,title,location_name,location_address,gathering_date,host_id,entry_fee,description,tags,baromeeting_male_max,baromeeting_female_max,baromeeting_male_cur,baromeeting_female_cur,target_age_range,lat,lng')
    .eq('status', 'open').eq('category', 'baromeeting').not('lat', 'is', null);
  // 연령대/참가비 필터는 "만남" 모드에서만 적용 - "전체" 모드에서는 필터 없이 전부 보여줌
  const applyBmFilters = _currentMapMode === 'baromeet';
  let meets = allMeets;
  if (applyBmFilters && _bmAgeFilter) meets = (meets || []).filter(m => m.target_age_range === _bmAgeFilter);
  if (applyBmFilters && _bmFeeFilter) meets = (meets || []).filter(m => (m.entry_fee || 0) < parseInt(_bmFeeFilter));
  _baromeetMarkerData = meets || [];
  if (!meets?.length) return;

  meets.forEach(m => {
    if (!m.lat || !m.lng) return;
    _baromeetListCache[m.id] = m; // openBaromeetDetail()이 이 캐시를 참조 - 목록 탭을 안 거쳐도 상세가 열리도록
    const maleLeft = (m.baromeeting_male_max || 4) - (m.baromeeting_male_cur || 0);
    const femaleLeft = (m.baromeeting_female_max || 4) - (m.baromeeting_female_cur || 0);
    const isFull = maleLeft <= 0 && femaleLeft <= 0;
    const titleShort = m.title ? (m.title.length > 11 ? m.title.slice(0, 10) + '…' : m.title) : '바로미팅';
    const dateStr = m.gathering_date
      ? new Date(m.gathering_date).toLocaleDateString('ko-KR', { month:'numeric', day:'numeric', weekday:'short' })
      : '';
    const content = `<div onclick="openBaromeetDetail('${m.id}')" style="position:relative;display:inline-flex;flex-direction:column;align-items:center;cursor:pointer;width:max-content">
      <div style="background:#e11d48;color:#fff;border-radius:12px;padding:6px 10px;font-size:12px;font-weight:800;line-height:1.4;box-shadow:0 2px 8px rgba(225,29,72,0.4);white-space:nowrap;max-width:150px">
        <div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">💕 ${titleShort}</div>
        <div style="font-size:10px;font-weight:700;opacity:0.85;margin-top:2px;white-space:nowrap">${m.target_age_range ? m.target_age_range + ' · ' : ''}${dateStr ? dateStr + ' · ' : ''}${isFull ? '마감' : '모집중'}</div>
      </div>
      <div style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:8px solid #e11d48"></div>
    </div>`;
    const overlay = new kakao.maps.CustomOverlay({ position: new kakao.maps.LatLng(m.lat, m.lng), content, yAnchor: 1.1 });
    overlay.setMap(kakaoMap);
    _baromeetOverlays.push(overlay);
  });
}

// ══════════════════════════════════════════════════════════
// ── 홈 패널 ───────────────────────────────────────────────
// ══════════════════════════════════════════════════════════
let _homeFilterCat = '';
let _homeFilterWage = '';
let _homeFilterNat = '';
let _homeFilterJobType = '';
let _homeFilterWorkType = '';
let _homeFilterSearch = '';
let _homeSort = 'latest';
let _hfPendingCat = '';
let _hfPendingWage = '';
let _hfPendingNat = '';
let _hfPendingJobType = '';
let _hfPendingWorkType = '';
let _hfPendingSearch = '';

function _wageUnit(j) {
  const t = j?.wage_type;
  if (t === 'daily')                       return '/일';
  if (t === 'per_unit' || t === 'per-job') return '/건';
  if (t === 'monthly')                     return '/월';
  if (t === 'weekly')                      return '/주';
  return '/시간';
}
function _wageLabel(j) {
  const t = j?.wage_type;
  if (t === 'daily')                       return '일급';
  if (t === 'per_unit' || t === 'per-job') return '건당';
  if (t === 'monthly')                     return '월급';
  if (t === 'weekly')                      return '주급';
  return '시급';
}
function _wageStr(j, color) {
  const w = j?.current_wage || 0;
  const lbl = _wageLabel(j);
  const amt = w > 0 ? w.toLocaleString('ko-KR') + '원' : '협의';
  const c = color || '#C8102E';
  return `<span style="font-weight:900;color:${c}">${amt}</span><span style="font-size:10px;font-weight:800;background:rgba(200,16,46,0.08);color:${c};padding:2px 6px;border-radius:5px;margin-left:5px">${lbl}</span>`;
}

let _homeJobRetryTimer = null;
function loadHomePanel() {
  // 외국인 프로필이면 외국인환영 섹션 표시
  const _myNat = currentUser?.user_metadata?.nationality;
  const isForeigner = _myNat && _myNat !== 'KR';
  const fSection = document.getElementById('home-foreigner-section');
  if (fSection) fSection.style.display = isForeigner ? 'block' : 'none';

  _renderHomeUrgent();
  _renderHomeAI();
  _renderHomeSameDay();
  _renderHomeForeigner(); // 외국인환영: 외국인 여부 무관하게 항상 표시 (언어 패널 진입점)
  _renderHomeRecent();
  _loadHomeTopPartners();
  _renderHomeLessonHot().catch(() => {}); // 레슨/과외 HOT
  // 바로모임 미리보기
  loadMoimList('').catch(() => {});
  // 바로미팅 홈 미리보기 카드 표시
  _loadHomeBaromeetTeaser().catch(() => {});

  // 공고가 없으면 GPS 확보 후 재조회 (홈 진입 시 watchPosition이 중단되므로 getCurrentPosition 사용)
  clearTimeout(_homeJobRetryTimer);
  if (!jobs || jobs.length === 0) {
    _homeJobRetryTimer = setTimeout(() => {
      const _retryRender = () => {
        if (document.getElementById('panel-home')?.classList.contains('show')) {
          _renderHomeUrgent(); _renderHomeAI(); _renderHomeSameDay();
          _renderHomeRecent(); _renderHomeForeigner();
        }
      };
      const _retryLoad = () => loadJobs().then(_retryRender).catch(_retryRender);
      if (navigator.geolocation && kakaoMap) {
        navigator.geolocation.getCurrentPosition(
          pos => {
            saveMapCenter(pos.coords.latitude, pos.coords.longitude);
            kakaoMap.setCenter(new kakao.maps.LatLng(pos.coords.latitude, pos.coords.longitude));
            _retryLoad();
          },
          () => _retryLoad(),
          { maximumAge: 5000, timeout: 5000, enableHighAccuracy: false }
        );
      } else {
        _retryLoad();
      }
    }, 1500);
  }

  // 지도에 주변알바 플로팅 버튼 상태 복원 (지도 탭 진입 시 표시)
  const floatBtn = document.getElementById('map-swipe-float');
  if (floatBtn) floatBtn.style.display = 'none';
}

function _homeJobCard(job) {
  const wage = job.current_wage || 0;
  const label = _wageLabel(job);
  return `<div onclick="openDetail('${job.id}')" style="flex-shrink:0;width:152px;background:#fff;border-radius:15px;overflow:hidden;cursor:pointer;border:1.5px solid #f0f0f0;box-shadow:0 2px 8px rgba(0,0,0,0.04)">
    <div style="padding:13px 13px 8px">
      <div style="font-size:9px;font-weight:700;letter-spacing:.3px;color:#d0d0d0;margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${job.category||''}</div>
      <div style="font-size:13px;font-weight:900;color:#111;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.3">${job.title || job.biz_name}</div>
      ${job.biz_name ? `<div style="font-size:10px;color:#c8c8c8;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px">${job.biz_name}</div>` : ''}
    </div>
    <div style="padding:8px 13px 12px;border-top:1px solid #f5f5f5">
      <div style="font-size:18px;font-weight:900;color:#C8102E;line-height:1.1;letter-spacing:-0.5px">${wage > 0 ? wage.toLocaleString('ko-KR')+'원' : '협의'}</div>
      <div style="display:flex;gap:4px;margin-top:6px;flex-wrap:wrap;align-items:center">
        <span style="font-size:9px;font-weight:800;background:#fff0f2;color:#C8102E;padding:3px 7px;border-radius:6px">${label}</span>
        ${job.same_day_payment ? '<span style="font-size:9px;font-weight:800;background:#f0fdf4;color:#15803d;padding:3px 7px;border-radius:6px">당일</span>' : ''}
        ${job.status === 'urgent' ? '<span style="font-size:9px;font-weight:800;background:#fff0f2;color:#C8102E;padding:3px 7px;border-radius:6px">급구</span>' : ''}
      </div>
    </div>
  </div>`;
}

// 급구 공고가 실제로 있으면 벤토 배너 내용을 진짜 공고로 교체, 없으면 기본 마케팅 카피 유지
// (전엔 별도 home-urgent-section이 이 배너와 분리돼 있어서 이 배너 자체는 항상 정적 카피만 보여주고 있었음)
const _BENTO_DEFAULT_HTML = `
    <div class="bento-top">
      <span class="bento-tag">당일 지급</span>
      <span class="bento-urgent">URGENT NOW</span>
    </div>
    <div class="bento-title">지금 당장 출근하고<br>오늘 바로 일당받기</div>
    <div class="bento-desc">급하게 일손이 필요한 사장님들이 기다리고 있어요!</div>
    <div class="bento-btn">전체보기 ➔</div>
`;
function _applyUrgentBentoContent(urgentJobs) {
  const section = document.getElementById('home-urgent-section');
  const banner = section?.querySelector('.bento-banner');
  if (!section || !banner) return;
  if (!urgentJobs.length) {
    banner.innerHTML = _BENTO_DEFAULT_HTML;
    section.onclick = () => showAllJobs();
    return;
  }
  const top = urgentJobs[0];
  const wageText = top.current_wage > 0 ? `${top.current_wage.toLocaleString('ko-KR')}원 ${_wageLabel(top)}` : '협의';
  banner.innerHTML = `
    <div class="bento-top">
      <span class="bento-tag">급구 ${urgentJobs.length}건</span>
      <span class="bento-urgent">URGENT NOW</span>
    </div>
    <div class="bento-title" style="font-size:18px">${top.title || top.category}</div>
    <div class="bento-desc">${wageText}${top.biz_name ? ' · ' + top.biz_name : ''}</div>
    <div class="bento-btn">전체보기 ➔</div>
  `;
  section.onclick = () => showHomeUrgentList();
}

async function _preloadHomeUrgent() {
  const section = document.getElementById('home-urgent-section');
  if (!section) return;
  if (jobs?.length) return; // loadJobs가 먼저 끝났으면 _renderHomeUrgent가 처리
  const { data } = await db.from('job_postings')
    .select('id, title, category, current_wage, status, biz_name, wage_type')
    .eq('status', 'urgent')
    .limit(8);
  if (!data?.length) return; // 급구 없으면 기본 마케팅 카피 그대로 둠
  if (jobs?.length) return; // 그 사이 loadJobs가 완료된 경우 스킵
  _applyUrgentBentoContent(data);
}

function _renderHomeUrgent() {
  const urgentJobs = jobs.filter(j => j.status === 'urgent').slice(0, 8);
  _applyUrgentBentoContent(urgentJobs);
}
function showHomeUrgentList() {
  // 급구만 필터 — 기존 필터 상태 초기화 후 직접 렌더
  _homeFilterSearch = ''; _homeFilterCat = ''; _homeFilterWage = '';
  _homeFilterNat = ''; _homeFilterJobType = ''; _homeFilterWorkType = '';
  const urgentJobs = jobs.filter(j => j.status === 'urgent');
  const srEl = document.getElementById('home-search-results');
  const defaultEl = document.getElementById('home-default-content');
  if (!srEl || !defaultEl) return;
  srEl.style.display = 'block';
  defaultEl.style.display = 'none';
  const label = document.getElementById('home-search-result-label');
  if (label) label.textContent = `급구 공고 ${urgentJobs.length}개`;
  _renderHomeSearchList(urgentJobs);
}

function _renderHomeAI() {
  const hwSection = document.getElementById('home-sameday-section');
  const section = document.getElementById('home-ai-section');
  if (!section) return;
  section.style.display = 'flex';
  if (hwSection) hwSection.style.gridColumn = '';
  try {
    const raw = localStorage.getItem(_aiKey());
    const prefs = raw ? JSON.parse(raw) : null;
    if (!prefs || (prefs.totalSignals || 0) < 3) {
      section.innerHTML = `
        <div style="font-size:9px;font-weight:900;letter-spacing:1px;color:#C8102E;margin-bottom:6px">AI PICKS</div>
        <div style="font-size:12px;color:#bbb;line-height:1.6">공고를 둘러볼수록<br>맞춤 추천이 시작돼요</div>
        <div style="margin-top:auto;padding-top:8px;font-size:10px;color:#e0e0e0;font-weight:700">🤖 AI 학습 중...</div>
      `;
      section.onclick = null;
      return;
    }
    const scored = (jobs||[]).filter(j=>j.status==='open'||j.status==='urgent')
      .map(j=>({job:j,score:_aiScoreJob(j,prefs)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score);
    if (!scored.length) {
      if (!jobs || jobs.length === 0) {
        section.style.display = 'none'; // GPS 미확보 - 카드 숨김, 높은시급 카드가 전체 차지
        if (hwSection) hwSection.style.gridColumn = '1 / -1';
      } else {
        section.style.display = 'flex';
        section.innerHTML = `
          <div style="font-size:9px;font-weight:900;letter-spacing:1px;color:#C8102E;margin-bottom:6px">AI PICKS</div>
          <div style="font-size:12px;color:#bbb;line-height:1.6">지금 주변에 맞춤<br>공고가 없어요</div>
          <div style="margin-top:auto;padding-top:8px;font-size:10px;color:#e0e0e0;font-weight:700">🤖 계속 학습 중...</div>
        `;
      }
      section.onclick = null;
      return;
    }
    if (hwSection) hwSection.style.gridColumn = '';
    const top = scored[0].job;
    section.innerHTML = `
      <div style="font-size:9px;font-weight:900;letter-spacing:1px;color:#C8102E;margin-bottom:5px">AI PICKS</div>
      <div style="font-size:13px;font-weight:800;color:#111;line-height:1.3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${top.title||top.biz_name}</div>
      <div style="font-size:11px;color:#bbb;margin-top:2px">${top.category||''}</div>
      <div style="margin-top:auto;padding-top:6px;display:flex;align-items:baseline;gap:4px"><span style="font-size:15px;font-weight:900;color:#C8102E">${top.current_wage>0?top.current_wage.toLocaleString('ko-KR')+'원':'협의'}</span>${top.current_wage>0?`<span style="font-size:10px;font-weight:900;background:#fff0f2;color:#C8102E;padding:2px 6px;border-radius:5px">${_wageLabel(top)}</span>`:''}</div>
    `;
    section.onclick = () => openDetail(top.id);
  } catch(e) {
    section.innerHTML = `<div style="font-size:9px;font-weight:900;letter-spacing:1px;color:#C8102E;margin-bottom:6px">AI PICKS</div><div style="font-size:12px;color:#ddd">준비 중</div>`;
  }
}

function _renderHomeSameDay() {
  const section = document.getElementById('home-sameday-section');
  if (!section) return;
  // 모든 임금 유형을 시급으로 환산 (공고의 근무시간 정보 활용)
  const toHourly = j => {
    const w = j.current_wage || 0;
    const h = j.duration_hours || 0; // 1회 근무 시간
    const t = j.wage_type;
    const daysPerWeek = (j.work_days || '').split(',').filter(Boolean).length || 0;
    if (!t || t === 'hourly') return w;
    if (t === 'daily') return h > 0 ? Math.round(w / h) : null;
    if (t === 'weekly') {
      const weeklyH = daysPerWeek > 0 ? daysPerWeek * h : h; // work_days 없으면 1일치로 간주
      return weeklyH > 0 ? Math.round(w / weeklyH) : null;
    }
    if (t === 'monthly') {
      const weeklyH = daysPerWeek > 0 ? daysPerWeek * h : h;
      return weeklyH > 0 ? Math.round(w / (weeklyH * 4.333)) : null;
    }
    return null; // 건당/기타 제외
  };
  const hwJobs = (jobs||[])
    .filter(j => (j.status==='open'||j.status==='urgent') && j.current_wage > 0 && toHourly(j) !== null)
    .sort((a,b) => toHourly(b) - toHourly(a));
  if (!hwJobs.length) {
    if (!jobs || jobs.length === 0) {
      section.style.display = 'none'; // GPS 미확보 상태 - 카드 숨김
    } else {
      section.style.display = 'flex';
      section.innerHTML = `<div style="font-size:9px;font-weight:900;letter-spacing:1px;color:#C8102E;margin-bottom:5px">높은 시급</div><div style="font-size:12px;color:#ddd;margin-top:auto">공고 없음</div>`;
    }
    return;
  }
  const top = hwJobs[0];
  const hourly = toHourly(top);
  section.style.display = 'flex';
  section.innerHTML = `
    <div style="font-size:9px;font-weight:900;letter-spacing:1px;color:#C8102E;margin-bottom:5px">높은 시급</div>
    <div style="font-size:13px;font-weight:800;color:#111;line-height:1.3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${top.title||top.biz_name}</div>
    <div style="font-size:11px;color:#bbb;margin-top:2px">${top.category||''}</div>
    <div style="margin-top:auto;padding-top:6px;display:flex;align-items:baseline;gap:4px"><span style="font-size:15px;font-weight:900;color:#C8102E">${hourly.toLocaleString('ko-KR')}원</span><span style="font-size:10px;font-weight:900;background:#fff0f2;color:#C8102E;padding:2px 6px;border-radius:5px">시급</span></div>
  `;
  section.onclick = () => openDetail(top.id);
}

function _renderHomeForeigner() {
  const section = document.getElementById('home-foreigner-section');
  const fjobs = jobs.filter(j => j.nationality_requirement==='foreigner_welcome'&&(j.status==='open'||j.status==='urgent'));
  const langJobs = jobs.filter(j => (j.status==='open'||j.status==='urgent') && j.preferred_languages?.length);
  const total = fjobs.length + langJobs.length;
  // B3: 숏컷 아이콘 배지 업데이트
  const badge = document.getElementById('shortcut-foreigner-badge');
  if (badge) {
    if (total > 0) { badge.textContent = total; badge.style.display = ''; }
    else { badge.style.display = 'none'; }
  }
}

function openWageFilter() {
  _homeSort = 'wage';
  window._homeFilterApplied = true;
  const wageJobs = (jobs||[]).filter(j=>(j.status==='open'||j.status==='urgent')&&j.current_wage>0);
  const srEl = document.getElementById('home-search-results');
  const defEl = document.getElementById('home-default-content');
  const label = document.getElementById('home-search-result-label');
  if (label) label.textContent = `💰 높은 시급 공고 ${wageJobs.length}개`;
  if (srEl) srEl.style.display = 'block';
  if (defEl) defEl.style.display = 'none';
  _renderHomeSearchList(wageJobs);
}

function openAIFilter() {
  window._homeFilterApplied = true;
  const srEl = document.getElementById('home-search-results');
  const defEl = document.getElementById('home-default-content');
  const label = document.getElementById('home-search-result-label');
  const list = document.getElementById('home-search-result-list');
  if (srEl) srEl.style.display = 'block';
  if (defEl) defEl.style.display = 'none';
  try {
    const raw = localStorage.getItem(_aiKey());
    const prefs = raw ? JSON.parse(raw) : null;
    if (!prefs || (prefs.totalSignals || 0) < 3) {
      if (label) label.textContent = '🤖 AI 추천 공고';
      if (list) list.innerHTML = '<div style="text-align:center;padding:40px 20px;color:#bbb"><div style="font-size:40px;margin-bottom:12px">🤖</div><div style="font-size:13px;font-weight:700;line-height:1.7">공고를 더 둘러볼수록<br>맞춤 추천이 시작돼요!</div></div>';
      return;
    }
    const scored = (jobs||[]).filter(j=>j.status==='open'||j.status==='urgent')
      .map(j=>({job:j,score:_aiScoreJob(j,prefs)})).filter(x=>x.score>0)
      .sort((a,b)=>b.score-a.score).map(x=>x.job);
    if (label) label.textContent = `🤖 AI 추천 공고 ${scored.length}개`;
    _renderHomeSearchList(scored);
  } catch(e) {
    if (label) label.textContent = '🤖 AI 추천 공고';
    if (list) list.innerHTML = '<div style="text-align:center;padding:32px 0;color:#bbb;font-size:13px">잠시 후 다시 시도해주세요</div>';
  }
}

function showForeignerInHome() {
  window._homeFilterApplied = true;
  // 배지 숫자(_renderHomeForeigner)와 동일한 기준으로 필터링 - 이전엔 여기서
  // nationality_requirement만 봐서, preferred_languages로 카운트된 배지 숫자와
  // 실제 결과가 어긋나 "배지엔 1인데 눌러보면 0개"가 되는 불일치가 있었음
  const filtered = (jobs||[]).filter(j=>(j.status==='open'||j.status==='urgent')
    && (j.nationality_requirement==='foreigner_welcome' || j.preferred_languages?.length));
  const srEl = document.getElementById('home-search-results');
  const defEl = document.getElementById('home-default-content');
  const label = document.getElementById('home-search-result-label');
  if (label) label.textContent = `🌏 외국인 환영 공고 ${filtered.length}개`;
  if (srEl) srEl.style.display = 'block';
  if (defEl) defEl.style.display = 'none';
  _renderHomeSearchList(filtered);
}

function showForeignerLangPanel() {
  const _flSheet = document.querySelector('#panel-foreigner-lang > div');
  if (_flSheet) { _flSheet.style.transform = ''; _flSheet.style.transition = ''; }
  document.getElementById('panel-foreigner-lang').style.display = 'block';
}
function closeForeignerLangPanel() {
  document.getElementById('panel-foreigner-lang').style.display = 'none';
}
function applyForeignerLangFilter(langCode) {
  closeForeignerLangPanel();
  window._homeFilterApplied = true;
  const langNames = {vi:'베트남어',ru:'러시아어',zh:'중국어',mn:'몽골어',np:'네팔어',en:'영어',uz:'중앙아시아',ja:'일본어',ko:'한국어 가능'};
  const flags = {vi:'🇻🇳',ru:'🇷🇺',zh:'🇨🇳',mn:'🇲🇳',en:'🇺🇸',uz:'🇺🇿',ja:'🇯🇵',ko:'🇰🇷'};
  let filtered, labelText;
  if (langCode === 'any') {
    filtered = (jobs||[]).filter(j => (j.status==='open'||j.status==='urgent') && j.nationality_requirement==='foreigner_welcome');
    labelText = '🌏 외국인 환영 공고';
  } else if (langCode === 'ko') {
    filtered = (jobs||[]).filter(j => (j.status==='open'||j.status==='urgent') && (j.nationality_requirement==='korean_only'||j.nationality_requirement==='korean_lang'));
    labelText = '🇰🇷 한국어 가능 공고';
  } else {
    filtered = (jobs||[]).filter(j => (j.status==='open'||j.status==='urgent') && (j.preferred_languages||[]).includes(langCode));
    labelText = `${flags[langCode]||''} ${langNames[langCode]||langCode} 우대 공고`;
  }
  const srEl = document.getElementById('home-search-results');
  const defEl = document.getElementById('home-default-content');
  const label = document.getElementById('home-search-result-label');
  if (label) label.textContent = `${labelText} ${filtered.length}개`;
  if (srEl) srEl.style.display = 'block';
  if (defEl) defEl.style.display = 'none';
  _renderHomeSearchList(filtered);
}

async function _renderHomeLessonHot() {
  const section = document.getElementById('home-lesson-section');
  const list = document.getElementById('home-lesson-list');
  if (!section || !list) return;
  try {
    const { data, error } = await db.from('lesson_profiles')
      .select('id, main_category, subject, price_per_session, is_available_now, location_type, workers(name, rating, review_count)')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(6);
    if (error || !data?.length) { section.style.display = 'none'; return; }
    const sorted = [...data].sort((a,b) => {
      const ra = a.workers?.rating || 0, rb = b.workers?.rating || 0;
      return rb - ra;
    });
    section.style.display = 'block';
    list.innerHTML = sorted.map(p => {
      const price = p.price_per_session ? Number(p.price_per_session).toLocaleString() + '원/회' : '협의';
      const onAir = p.is_available_now ? `<span style="font-size:9px;font-weight:800;background:#dcfce7;color:#16a34a;padding:2px 5px;border-radius:5px;margin-bottom:4px;display:inline-block">지금가능</span>` : '';
      const locIcon = p.location_type === '비대면' ? '💻' : p.location_type === '방문레슨' ? '🚗' : '🏫';
      return `<div onclick="openLessonDetail('${p.id}')" style="flex-shrink:0;width:130px;background:#f8faff;border:1.5px solid #dbeafe;border-radius:12px;padding:10px;cursor:pointer">
        ${onAir}
        <div style="font-size:11px;font-weight:800;color:#1d4ed8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.main_category||'레슨'} · ${p.subject||'기타'}</div>
        <div style="font-size:10px;color:#888;margin:3px 0">${locIcon} ${p.location_type||''}</div>
        <div style="font-size:13px;font-weight:900;color:#C8102E">${price}</div>
        <div style="font-size:10px;color:#aaa;margin-top:3px">⭐ ${(p.workers?.rating||0).toFixed(1)}</div>
      </div>`;
    }).join('');
  } catch(e) { section.style.display = 'none'; }
}

let _rankCurrentTab = 'employer';
let _rankCurrentCat = '';

const _trustScore = (rating, cnt) => (rating || 0) * Math.log(1 + (cnt || 0));

function showRankPanel(type) {
  _rankCurrentTab = type || 'employer';
  _rankCurrentCat = '';
  document.getElementById('panel-rank').style.display = 'block';
  _renderRankPanel();
}
function closeRankPanel() {
  document.getElementById('panel-rank').style.display = 'none';
}
function switchRankTab(tab) {
  _rankCurrentTab = tab;
  _rankCurrentCat = '';
  _renderRankPanel();
}

async function _renderRankPanel() {
  const isEmployer = _rankCurrentTab === 'employer';
  document.getElementById('rank-panel-title').textContent = isEmployer ? '추천 업체 RANK' : '우수 알바생 RANK';
  const et = document.getElementById('rank-tab-employer');
  const wt = document.getElementById('rank-tab-worker');
  if (et) { et.style.background = isEmployer ? '#b45309' : '#fff'; et.style.color = isEmployer ? '#fff' : '#888'; et.style.borderColor = isEmployer ? '#b45309' : '#e5e7eb'; }
  if (wt) { wt.style.background = !isEmployer ? '#15803d' : '#fff'; wt.style.color = !isEmployer ? '#fff' : '#888'; wt.style.borderColor = !isEmployer ? '#15803d' : '#e5e7eb'; }

  const cats = isEmployer
    ? ['전체','F&B','물류','판매','청소','이벤트','제조','IT','기타']
    : ['전체','F&B','물류','판매','청소','이벤트','챌린지','컨텐츠','기타'];
  const catEl = document.getElementById('rank-cat-filter');
  if (catEl) catEl.innerHTML = cats.map(c => `<button onclick="_setRankCat('${c}')" style="flex-shrink:0;padding:5px 12px;border-radius:20px;border:1.5px solid ${_rankCurrentCat===c||(!_rankCurrentCat&&c==='전체')?'#b45309':'#e5e7eb'};background:${_rankCurrentCat===c||(!_rankCurrentCat&&c==='전체')?'#b45309':'#fff'};color:${_rankCurrentCat===c||(!_rankCurrentCat&&c==='전체')?'#fff':'#888'};font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap">${c}</button>`).join('');

  const listEl = document.getElementById('rank-list');
  listEl.innerHTML = '<div style="text-align:center;padding:32px;color:#ddd">불러오는 중...</div>';
  try {
    let data;
    if (isEmployer) {
      let q = db.from('businesses').select('id,name,biz_type,rating,review_count,photo_url').not('rating','is',null).gte('review_count',1).order('review_count',{ascending:false}).limit(50);
      const r = await q;
      data = r.data || [];
      if (_rankCurrentCat && _rankCurrentCat !== '전체') data = data.filter(d => d.biz_type === _rankCurrentCat);
    } else {
      const pref = _rankCurrentCat && _rankCurrentCat !== '전체' ? _rankCurrentCat : null;
      let q = db.from('workers').select('id,name,rating,review_count,photo_url,pref_categories,nationality').not('rating','is',null).gte('review_count',1).order('review_count',{ascending:false}).limit(50);
      const r = await q;
      data = r.data || [];
      if (pref) data = data.filter(d => {
        const cats = Array.isArray(d.pref_categories) ? d.pref_categories : (d.pref_categories ? JSON.parse(d.pref_categories) : []);
        return cats.includes(pref);
      });
    }
    const sorted = data.sort((a,b) => _trustScore(b.rating,b.review_count) - _trustScore(a.rating,a.review_count)).slice(0,20);
    if (!sorted.length) { listEl.innerHTML = '<div style="text-align:center;padding:32px;color:#bbb;font-size:13px">해당 업종 데이터가 없어요</div>'; return; }
    const _NAT = {KR:'🇰🇷',MN:'🇲🇳',NP:'🇳🇵',VN:'🇻🇳',RU:'🇷🇺',CN:'🇨🇳',UZ:'🇺🇿',KZ:'🇰🇿',JP:'🇯🇵',US:'🇺🇸'};
    const medalColors = ['#FFD700','#C0C0C0','#CD7F32'];
    listEl.innerHTML = sorted.map((d,i) => {
      const ac = avatarColor(d.name||'?');
      const medal = i < 3 ? `<span style="font-size:16px">${['🥇','🥈','🥉'][i]}</span>` : `<span style="font-size:13px;font-weight:900;color:#ccc;min-width:20px;text-align:center">${i+1}</span>`;
      const avatar = d.photo_url
        ? `<img src="${d.photo_url}" style="width:40px;height:40px;border-radius:${isEmployer?'10px':'50%'};object-fit:cover;flex-shrink:0">`
        : `<div style="width:40px;height:40px;border-radius:${isEmployer?'10px':'50%'};background:${ac.bg};display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:900;color:${ac.text};flex-shrink:0">${(d.name||'?')[0]}</div>`;
      const sub = isEmployer ? (d.biz_type||'') : `${_NAT[d.nationality]||'👤'} ${d.name?d.name[0]+'*'.repeat(Math.max(1,(d.name.length||2)-1)):'익명'}`;
      const trust = _trustScore(d.rating, d.review_count);
      return `<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid #f5f5f5">
        <div style="width:24px;display:flex;justify-content:center;flex-shrink:0">${medal}</div>
        ${avatar}
        <div style="flex:1;min-width:0">
          <div style="font-size:14px;font-weight:800;color:#111;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${isEmployer?(d.name||'업체'):sub}</div>
          <div style="font-size:11px;color:#aaa;margin-top:1px">${isEmployer?sub:''} ⭐ ${(d.rating||0).toFixed(1)} <span style="color:#ddd">(${d.review_count}건)</span></div>
        </div>
        <div style="text-align:right;flex-shrink:0">
          <div style="font-size:12px;font-weight:900;color:${isEmployer?'#b45309':'#15803d'}">${trust.toFixed(2)}</div>
          <div style="font-size:10px;color:#bbb">신뢰도</div>
        </div>
      </div>`;
    }).join('');
  } catch(e) { listEl.innerHTML = `<div style="text-align:center;padding:32px;color:#bbb;font-size:13px">불러오기 실패<br>${e.message}</div>`; }
}
function _setRankCat(cat) {
  _rankCurrentCat = cat === '전체' ? '' : cat;
  _renderRankPanel();
}

function _renderHomeRecent() {
  const section = document.getElementById('home-recent-section');
  const list = document.getElementById('home-recent-list');
  if (!section || !list) return;
  const available = (jobs || []).filter(j => j.status === 'open' || j.status === 'urgent').slice(0, 10);
  if (!available.length) {
    if (!_jobsLoaded) return; // 아직 로딩 중 → 스켈레톤 유지
    list.innerHTML = '<div style="color:#bbb;font-size:12px;padding:4px 0 8px;white-space:nowrap">주변 공고가 없어요</div>';
    return;
  }
  list.innerHTML = available.map(j => _homeJobCard(j)).join('');
}

function showAllJobs() {
  _homeFilterSearch = ''; _homeFilterCat = ''; _homeFilterWage = '';
  _homeFilterNat = ''; _homeFilterJobType = ''; _homeFilterWorkType = '';
  const srEl = document.getElementById('home-search-results');
  const defaultEl = document.getElementById('home-default-content');
  if (!srEl || !defaultEl) return;
  srEl.style.display = 'block';
  defaultEl.style.display = 'none';
  const label = document.getElementById('home-search-result-label');
  const allJobs = (jobs || []).filter(j => j.status === 'open' || j.status === 'urgent');
  if (label) label.textContent = `전체 공고 ${allJobs.length}개`;
  _renderHomeSearchList(allJobs);
}

async function _loadHomeTopPartners() {

  // ── 이달의 추천 업체: businesses 테이블 기준 ──────────────────
  try {
    const { data: biz } = await db.from('businesses')
      .select('id,name,biz_type,photo_url,rating,review_count')
      .not('rating', 'is', null).gte('review_count', 2)
      .order('review_count', { ascending: false }).limit(8);
    const empEl = document.getElementById('home-top-employer');
    if (empEl && biz && biz.length) {
      const sorted = [...biz].sort((a,b) => _trustScore(b.rating,b.review_count) - _trustScore(a.rating,a.review_count));
      empEl.innerHTML = sorted.slice(0,2).map(e => {
        const ac = avatarColor(e.name||'?');
        const avatarHtml = e.photo_url
          ? `<img src="${e.photo_url}" style="width:32px;height:32px;border-radius:9px;object-fit:cover;flex-shrink:0" onerror="this.style.display='none';this.nextSibling.style.display='flex'">`
          : '';
        const fallback = `<div style="width:32px;height:32px;border-radius:9px;background:${ac.bg};display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:900;color:${ac.text};flex-shrink:0${e.photo_url?';display:none':''}">${(e.name||'?')[0]}</div>`;
        const typeTag = e.biz_type ? `<span style="font-size:10px;background:#fff7ed;color:#b45309;border-radius:4px;padding:2px 6px;font-weight:800">${e.biz_type}</span>` : '';
        return `<div onclick="_showDetailBizProfile('${e.id}')" style="display:flex;align-items:center;gap:9px;margin-bottom:10px;cursor:pointer;-webkit-tap-highlight-color:transparent" title="${e.name} 프로필 보기">
          ${avatarHtml}${fallback}
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap">
              <span style="font-size:13px;font-weight:800;color:#111;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:80px">${e.name||'업체'}</span>
              ${typeTag}
            </div>
            <div style="font-size:12px;color:#b45309;font-weight:700;margin-top:2px">⭐ ${(e.rating||0).toFixed(1)} <span style="color:#ccc;font-weight:500">(${e.review_count}건)</span></div>
          </div>
        </div>`;
      }).join('');
    }
  } catch(e) {}

  // ── 이달의 우수 알바생: workers 테이블 기준 ───────────────────
  try {
    const { data: wk } = await db.from('workers')
      .select('id,name,rating,review_count,nationality,photo_url,pref_categories,skills')
      .not('rating', 'is', null).gte('review_count', 2)
      .order('review_count', { ascending: false }).limit(8);
    const wkEl = document.getElementById('home-top-worker');
    const _NAT_FLAG = { KR:'🇰🇷', MN:'🇲🇳', NP:'🇳🇵', VN:'🇻🇳', RU:'🇷🇺', CN:'🇨🇳', UZ:'🇺🇿', KZ:'🇰🇿', JP:'🇯🇵', US:'🇺🇸' };
    const _CAT_ICON = { 'F&B':'☕', '물류':'📦', '판매':'🛍', '청소':'🧹', '이벤트':'🎉', '커플알바':'💑', '컨텐츠':'🎬', '챌린지':'🏆' };
    if (wkEl && wk && wk.length) {
      const sorted = [...wk].sort((a,b) => _trustScore(b.rating,b.review_count) - _trustScore(a.rating,a.review_count));
      wkEl.innerHTML = sorted.slice(0,2).map(w => {
        const flag = _NAT_FLAG[w.nationality] || '👤';
        const anonName = w.name ? w.name[0] + '*'.repeat(Math.max(1, (w.name.length||2)-1)) : '익명';
        const avatarHtml = w.photo_url
          ? `<img src="${w.photo_url}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;flex-shrink:0" onerror="this.style.display='none';this.nextSibling.style.display='flex'">`
          : '';
        const flagFallback = `<div style="width:32px;height:32px;border-radius:50%;background:#f0fdf4;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0${w.photo_url?';display:none':''}">${flag}</div>`;
        // 전문 분야 태그: pref_categories 우선, 없으면 skills[0]
        const cats = Array.isArray(w.pref_categories) ? w.pref_categories : (typeof w.pref_categories === 'string' && w.pref_categories ? JSON.parse(w.pref_categories) : []);
        const skls = Array.isArray(w.skills) ? w.skills : (typeof w.skills === 'string' && w.skills ? JSON.parse(w.skills) : []);
        const specialty = cats[0] || skls[0] || '';
        const specIcon = _CAT_ICON[specialty] || '';
        const specTag = specialty ? `<span style="font-size:10px;background:#f0fdf4;color:#15803d;border-radius:4px;padding:2px 6px;font-weight:800">${specIcon} ${specialty}</span>` : '';
        return `<div style="display:flex;align-items:center;gap:9px;margin-bottom:10px">
          ${avatarHtml}${flagFallback}
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap">
              <span style="font-size:13px;font-weight:800;color:#111">${anonName}</span>
              ${specTag}
            </div>
            <div style="font-size:12px;color:#15803d;font-weight:700;margin-top:2px">⭐ ${(w.rating||0).toFixed(1)} <span style="color:#ccc;font-weight:500">(${w.review_count}건)</span></div>
          </div>
        </div>`;
      }).join('');
    }
  } catch(e) {}
}

function _onHomeSearchFocus() {
  // 검색바 탭 → 필터 패널 열기 (직접 타이핑은 필터 안에서)
  const input = document.getElementById('home-search-input');
  if (input) input.blur(); // 키보드가 두 번 뜨는 것 방지
  openHomeFilterFromBar();
}
function openHomeFilterFromBar() {
  // 빨간 필터 아이콘 클릭: 현재 검색바 텍스트를 필터 패널에 반영하고 열기
  const barText = (document.getElementById('home-search-input')?.value || '').trim();
  if (barText) _homeFilterSearch = barText; // 검색바 텍스트를 필터 검색어로 동기화
  openHomeFilter();
}
function openHomeFilter() {
  _hfPendingCat = _homeFilterCat; _hfPendingWage = _homeFilterWage; _hfPendingNat = _homeFilterNat;
  _hfPendingJobType = _homeFilterJobType; _hfPendingWorkType = _homeFilterWorkType;
  _hfPendingSearch = _homeFilterSearch;
  document.querySelectorAll('.hfc-cat').forEach(b => b.classList.toggle('active', b.dataset.cat === _hfPendingCat));
  document.querySelectorAll('.hfc-jtype').forEach(b => b.classList.toggle('active', b.dataset.jtype === _hfPendingJobType));
  document.querySelectorAll('.hfc-wtype').forEach(b => b.classList.toggle('active', b.dataset.wtype === _hfPendingWorkType));
  const si = document.getElementById('hfc-search-input'); if (si) { si.value = _hfPendingSearch; }
  const sd = document.getElementById('hfc-toggle-sd'); if (sd) sd.classList.toggle('on', _hfPendingWage==='same_day');
  const nat = document.getElementById('hfc-toggle-nat'); if (nat) nat.classList.toggle('on', _hfPendingNat==='foreigner');
  _updateHomeFilterCount();
  document.getElementById('home-filter-overlay').style.display = 'block';
  // 키보드 자동실행 금지 — 사용자가 직접 검색어 입력창을 탭할 때만 키보드 열림
}
function closeHomeFilter() { document.getElementById('home-filter-overlay').style.display = 'none'; }
function resetHomeFilter() {
  _hfPendingCat = ''; _hfPendingWage = ''; _hfPendingNat = '';
  _hfPendingJobType = ''; _hfPendingWorkType = ''; _hfPendingSearch = '';
  document.querySelectorAll('.hfc-cat').forEach(b => b.classList.toggle('active', b.dataset.cat === ''));
  document.querySelectorAll('.hfc-jtype').forEach(b => b.classList.toggle('active', b.dataset.jtype === ''));
  document.querySelectorAll('.hfc-wtype').forEach(b => b.classList.toggle('active', b.dataset.wtype === ''));
  const si = document.getElementById('hfc-search-input'); if (si) si.value = '';
  const sd = document.getElementById('hfc-toggle-sd'); if (sd) sd.classList.remove('on');
  const nat = document.getElementById('hfc-toggle-nat'); if (nat) nat.classList.remove('on');
  _updateHomeFilterCount();
}
function selectHomeFilterCat(btn, cat) {
  _hfPendingCat = cat;
  document.querySelectorAll('.hfc-cat').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  _updateHomeFilterCount();
}
function selectHomeFilterJobType(btn, jtype) {
  _hfPendingJobType = jtype;
  document.querySelectorAll('.hfc-jtype').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  _updateHomeFilterCount();
}
function selectHomeFilterWorkType(btn, wtype) {
  _hfPendingWorkType = wtype;
  document.querySelectorAll('.hfc-wtype').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  _updateHomeFilterCount();
}
function toggleHFCond(cond) {
  if (cond === 'same_day') {
    _hfPendingWage = _hfPendingWage === 'same_day' ? '' : 'same_day';
    const el = document.getElementById('hfc-toggle-sd'); if (el) el.classList.toggle('on', _hfPendingWage==='same_day');
  } else if (cond === 'foreigner') {
    _hfPendingNat = _hfPendingNat === 'foreigner' ? '' : 'foreigner';
    const el = document.getElementById('hfc-toggle-nat'); if (el) el.classList.toggle('on', _hfPendingNat==='foreigner');
  }
  _updateHomeFilterCount();
}
function _updateHomeFilterCount() {
  let f = jobs.filter(j => j.status==='open'||j.status==='urgent');
  const q = (document.getElementById('hfc-search-input')?.value || '').trim().toLowerCase();
  if (q) f = f.filter(j => (j.title||'').toLowerCase().includes(q)||(j.biz_name||'').toLowerCase().includes(q)||(j.category||'').toLowerCase().includes(q)||(j.address||'').includes(q));
  if (_hfPendingCat) f = f.filter(j => j.category===_hfPendingCat);
  if (_hfPendingJobType) f = f.filter(j => j.job_type===_hfPendingJobType);
  if (_hfPendingWorkType) f = f.filter(j => _hfPendingWorkType==='lesson'?(j.work_type==='lesson'||j.job_type==='technical'):(j.work_type||'spot')===_hfPendingWorkType);
  if (_hfPendingWage==='same_day') f = f.filter(j => j.same_day_payment);
  if (_hfPendingNat==='foreigner') f = f.filter(j => j.nationality_requirement==='foreigner_welcome');
  const btn = document.getElementById('home-filter-apply-btn');
  if (btn) btn.textContent = `공고보기 ${f.length}개`;
}
function applyHomeFilter() {
  _homeFilterSearch = (document.getElementById('hfc-search-input')?.value || '').trim();
  _homeFilterCat = _hfPendingCat; _homeFilterWage = _hfPendingWage; _homeFilterNat = _hfPendingNat;
  _homeFilterJobType = _hfPendingJobType; _homeFilterWorkType = _hfPendingWorkType;
  const si = document.getElementById('home-search-input');
  if (si) si.value = _homeFilterSearch;
  window._homeFilterApplied = true; // 필터 명시 적용 — 전체여도 결과창 유지
  closeHomeFilter();
  _doHomeFilterRender();
}

function setHomeFilter(btn, cat, wage, nat) {
  // 타일에서 직접 호출 시 전체 필터 상태 초기화 후 특정 필터만 설정
  _homeFilterSearch = ''; _homeFilterJobType = ''; _homeFilterWorkType = '';
  _homeFilterCat = cat || '';
  _homeFilterWage = wage || '';
  _homeFilterNat = nat || '';
  const si = document.getElementById('home-search-input');
  if (si) si.value = '';
  document.querySelectorAll('.home-filter-chip').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  _doHomeFilterRender();
}

function clearHomeFilter() {
  _homeFilterSearch = ''; _homeFilterCat = ''; _homeFilterWage = '';
  _homeFilterNat = ''; _homeFilterJobType = ''; _homeFilterWorkType = '';
  _homeSort = 'latest';
  window._homeFilterApplied = false;
  const si = document.getElementById('home-search-input'); if (si) si.value = '';
  document.getElementById('home-search-results').style.display = 'none';
  document.getElementById('home-default-content').style.display = 'block';
}

function _doHomeFilterRender() {
  let filtered = jobs.filter(j => j.status === 'open' || j.status === 'urgent');
  if (_homeFilterSearch) { const ql = _homeFilterSearch.toLowerCase(); filtered = filtered.filter(j => (j.title||'').toLowerCase().includes(ql)||(j.biz_name||'').toLowerCase().includes(ql)||(j.category||'').toLowerCase().includes(ql)||(j.address||'').includes(_homeFilterSearch)); }
  if (_homeFilterCat) filtered = filtered.filter(j => j.category === _homeFilterCat);
  if (_homeFilterJobType) filtered = filtered.filter(j => j.job_type === _homeFilterJobType);
  if (_homeFilterWorkType) filtered = filtered.filter(j => _homeFilterWorkType==='lesson'?(j.work_type==='lesson'||j.job_type==='technical'):(j.work_type||'spot')===_homeFilterWorkType);
  if (_homeFilterWage === 'same_day') filtered = filtered.filter(j => j.same_day_payment);
  if (_homeFilterNat === 'foreigner') filtered = filtered.filter(j => j.nationality_requirement === 'foreigner_welcome');

  const hasFilter = window._homeFilterApplied || _homeFilterSearch || _homeFilterCat || _homeFilterWage || _homeFilterNat || _homeFilterJobType || _homeFilterWorkType;
  const srEl = document.getElementById('home-search-results');
  const defaultEl = document.getElementById('home-default-content');
  if (!hasFilter) {
    srEl.style.display = 'none';
    defaultEl.style.display = 'block';
    return;
  }
  srEl.style.display = 'block';
  defaultEl.style.display = 'none';
  const label = document.getElementById('home-search-result-label');
  const parts = [];
  if (_homeFilterSearch) parts.push(`"${_homeFilterSearch}"`);
  if (_homeFilterCat) parts.push(_homeFilterCat);
  if (_homeFilterJobType) parts.push({alba:'일반알바',errand:'심부름',technical:'전문기술',care:'돌봄'}[_homeFilterJobType]||_homeFilterJobType);
  if (_homeFilterWorkType) parts.push({spot:'스팟',short:'단기',regular:'정기',lesson:'레슨/과외'}[_homeFilterWorkType]||_homeFilterWorkType);
  if (_homeFilterWage === 'same_day') parts.push('당일정산');
  if (_homeFilterNat === 'foreigner') parts.push('외국인환영');
  if (label) label.textContent = `${parts.join(' · ')} 공고 ${filtered.length}개`;
  _renderHomeSearchList(filtered);
}

let _homeSearchDebounce = null;
function doHomeSearch() {
  const q = (document.getElementById('home-search-input')?.value || '').trim();
  if (!q) { clearHomeFilter(); return; }
  clearTimeout(_homeSearchDebounce);
  _homeSearchDebounce = setTimeout(() => {
    // 검색어만 적용, 나머지 필터 초기화
    _homeFilterSearch = q; _homeFilterCat = ''; _homeFilterWage = '';
    _homeFilterNat = ''; _homeFilterJobType = ''; _homeFilterWorkType = '';
    _doHomeFilterRender();
  }, 200);
}

function selectHomeSort(sort) {
  _homeSort = sort;
  document.querySelectorAll('.home-sort-btn').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById('home-sort-' + sort);
  if (btn) btn.classList.add('active');
  _doHomeFilterRender();
}

function _sortHomeJobs(list) {
  if (_homeSort === 'wage') {
    return [...list].sort((a, b) => {
      const _hw = j => { const w = j.current_wage||0; return j.wage_type==='daily'?w/8:w; };
      return _hw(b) - _hw(a);
    });
  }
  if (_homeSort === 'distance') {
    const lat = (typeof mapCenter !== 'undefined' && mapCenter?.lat) || null;
    const lng = (typeof mapCenter !== 'undefined' && mapCenter?.lng) || null;
    if (!lat) return list; // 위치 없으면 그대로
    const _dist = j => {
      if (!j.lat || !j.lng) return 999999;
      const dlat = (j.lat - lat) * 111000;
      const dlng = (j.lng - lng) * 111000 * Math.cos(lat * Math.PI / 180);
      return Math.sqrt(dlat*dlat + dlng*dlng);
    };
    return [...list].sort((a, b) => _dist(a) - _dist(b));
  }
  // 최신순 (default)
  return [...list].sort((a, b) => new Date(b.created_at||0) - new Date(a.created_at||0));
}

function _renderHomeSearchList(filtered) {
  const list = document.getElementById('home-search-result-list');
  if (!list) return;
  // 정렬 버튼 상태 동기화
  document.querySelectorAll('.home-sort-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('home-sort-' + _homeSort)?.classList.add('active');
  // 정렬 적용
  filtered = _sortHomeJobs(filtered);
  if (!filtered.length) {
    list.innerHTML = '<div style="text-align:center;padding:32px 0;color:#bbb"><div style="font-size:28px;margin-bottom:8px">🔍</div><div style="font-size:13px;font-weight:600">검색 결과가 없어요</div></div>';
    return;
  }
  list.innerHTML = filtered.slice(0, 20).map(job => {
    const emoji = getCatEmoji ? getCatEmoji(job.category) : '💼';
    const wage = job.current_wage || 0;
    const rem = (job.needed_count||1) - (job.filled_count||0);
    return `<div onclick="openDetail('${job.id}')" style="display:flex;align-items:center;gap:12px;padding:12px;background:#fff;border-radius:14px;margin-bottom:8px;box-shadow:0 1px 6px rgba(0,0,0,0.07);cursor:pointer;border:1px solid #f0f0f0">
      <div style="width:44px;height:44px;border-radius:12px;background:#f5f5f5;display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0">${emoji}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:11px;font-weight:700;color:#888;margin-bottom:2px">${job.biz_name || ''}</div>
        <div style="font-size:14px;font-weight:900;color:#111;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${job.title}</div>
        <div style="display:flex;align-items:center;gap:5px;margin-top:3px">
          <span style="font-size:13px;font-weight:900;color:#C8102E">${wage > 0 ? wage.toLocaleString('ko-KR')+'원' : '협의'}</span>
          ${wage > 0 ? `<span style="font-size:9px;font-weight:900;background:#fff0f2;color:#C8102E;padding:2px 6px;border-radius:4px">${_wageLabel(job)}</span>` : ''}
          ${job.same_day_payment ? '<span style="font-size:9px;font-weight:900;background:#f0fdf4;color:#15803d;padding:2px 6px;border-radius:4px">당일</span>' : ''}
        </div>
      </div>
      ${rem > 0 && rem <= 3 ? `<div style="font-size:11px;font-weight:800;color:#C8102E;white-space:nowrap">🔥${rem}자리</div>` : ''}
    </div>`;
  }).join('');
}

function openNearbySwipe() {
  // 현재 지도에서 스와이프 탭으로 전환 (지도 중심 기준 반경 필터는 이미 jobs에 적용됨)
  const swipeScreen = document.getElementById('swipe-screen');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelector('.top-bar').style.display = 'none';
  document.getElementById('bottom-sheet').style.display = 'none';
  document.getElementById('radius-badge').style.display = 'none';
  const mapLocBtn = document.getElementById('map-loc-btn');
  if (mapLocBtn) mapLocBtn.style.display = 'none';
  const floatBtn = document.getElementById('map-swipe-float');
  if (floatBtn) floatBtn.style.display = 'none';
  // 지도에서 진입한 경우 뒤로가기 버튼 표시
  const backBtn = document.getElementById('swipe-back-btn');
  if (backBtn) backBtn.style.display = 'flex';
  swipeScreen.style.display = 'flex';
  initSwipe();
}

function closeSwipeBackToMap() {
  const backBtn = document.getElementById('swipe-back-btn');
  if (backBtn) backBtn.style.display = 'none';
  const mapNavItem = document.querySelectorAll('.nav-item')[1]; // 지도 탭 (홈 다음)
  setNav(mapNavItem, 'map');
}

// ── 공고 상세 ─────────────────────────────────────────────
function openDetail(jobId) {
  const job = jobs.find(j => j.id === jobId);
  if (!job) {
    db.from('job_postings').select(`id, title, category, base_wage, current_wage, status, lat, lng, address,
      start_time, duration_hours, needed_count, filled_count, description, biz_name,
      surge_enabled, surge_amount, surge_interval_min, surge_max_wage, wage_delta,
      work_type, same_day_payment, noshow_deposit, age_limit, return_bonus, is_remote,
      businesses(name, rating, kindness_rating, review_count)`)
      .eq('id', jobId).maybeSingle()
      .then(({ data }) => { if (data) { jobs.push(data); openDetail(jobId); } });
    return;
  }
  selectedJobId = jobId;
  if (job.category) aiRecordSignal(job.category, job.current_wage, 0.5);

  const isUrgent = job.status === 'urgent';
  const hasSurge = job.wage_delta > 0;
  const _ap2 = (job.address||'').split('\n');
  const _da2 = _ap2[0] ? (_ap2[1] ? _ap2[0] + ' · ' + _ap2[1].split(' ').slice(0,3).join(' ') : _ap2[0]) : null;
  const dist = job.is_remote ? '🖥️ 비대면' : _distStr(job.distance_m, job.lat, job.lng, _da2);

  document.getElementById('d-status').textContent = isUrgent ? '\u{1F525} 급구' : '모집중';
  document.getElementById('d-status').className = `detail-status ${isUrgent ? 'status-urgent' : 'status-open'}`;
  document.getElementById('d-cat').textContent = job.category;
  document.getElementById('d-title').textContent = job.title;
  const typeBadgeEl = document.getElementById('d-type-badge');
  if (job.category === '심부름') {
    typeBadgeEl.innerHTML = '<span style="background:#F3E8FF;color:#7C3AED;font-size:11px;font-weight:900;padding:2px 8px;border-radius:20px;white-space:nowrap">\u{1F49C} 심부름</span>';
  } else if (job.work_type === 'short') {
    typeBadgeEl.innerHTML = '<span style="background:#EFF6FF;color:#3B82F6;font-size:11px;font-weight:900;padding:2px 8px;border-radius:20px;white-space:nowrap">\u{1F4C5} 단기</span>';
  } else if (job.work_type === 'regular') {
    typeBadgeEl.innerHTML = '<span style="background:#F0FFF4;color:#16a34a;font-size:11px;font-weight:900;padding:2px 8px;border-radius:20px;white-space:nowrap">\u{1F504} 정기</span>';
  } else {
    typeBadgeEl.innerHTML = '';
  }
  document.getElementById('d-biz').textContent = job.biz_name;
  document.getElementById('d-rating').textContent = `★ ${job.biz_rating || '-'} (${job.biz_reviews || 0}개)`;
  // 업주 아바타 + 팔로우 버튼 (알바생일 때만)
  const _bizAv = document.getElementById('d-biz-avatar');
  const _bizFwWrap = document.getElementById('d-follow-wrap');
  const _bizFwBtn = document.getElementById('d-follow-btn');
  if (_bizAv) {
    const _ac = avatarColor(job.biz_name || '?');
    _bizAv.innerHTML = `<div style="width:36px;height:36px;border-radius:10px;background:${_ac.bg};display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:900;color:${_ac.fg}">${(job.biz_name||'?').charAt(0)}</div>`;
    _bizAv.setAttribute('data-biz-id', job.business_id || '');
    _bizAv.setAttribute('data-biz-name', job.biz_name || '');
  }
  if (_bizFwWrap && _bizFwBtn && job.business_id && !bizRecord) {
    _bizFwWrap.style.display = 'block';
    const _bname = job.biz_name || '';
    const _bid = job.business_id;
    if (!window._myFollows) {
      _loadMyFollows().then(() => _updateFollowBtn(_bizFwBtn, _bid, _bname));
    } else {
      _updateFollowBtn(_bizFwBtn, _bid, _bname);
    }
  } else if (_bizFwWrap) {
    _bizFwWrap.style.display = 'none';
  }
  const wageLabels = { hourly:'시급', daily:'일급', 'per-job':'건당', monthly:'월급', other:'급여' };
  const wLabelEl = document.getElementById('d-wage-label');
  if (wLabelEl) wLabelEl.textContent = wageLabels[job.wage_type] || '시급';
  const dWageEl = document.getElementById('d-wage');
  if (job.wage_type === 'other' && job.wage_label) {
    dWageEl.textContent = job.wage_label;
  } else {
    dWageEl.textContent = (job.current_wage || 0).toLocaleString() + '원';
  }

  // 주휴수당 자동 계산 (정기/단기 공고, 주 15시간 이상)
  const _juhuBox = document.getElementById('d-juhu-box');
  if (_juhuBox) {
    const _DAY_IDX = { '일':0, '월':1, '화':2, '수':3, '목':4, '금':5, '토':6 };
    const _workDays = (job.work_days || '').split(',').map(d => d.trim()).filter(d => _DAY_IDX[d] !== undefined);
    const _weeklyHours = _workDays.length * (job.duration_hours || 0);
    const _showJuhu = job.wage_type !== 'per-job' && job.wage_type !== 'other' &&
                      job.work_type !== 'spot' && job.work_type !== 'errand' &&
                      _weeklyHours >= 15 && (job.current_wage || 0) > 0;
    if (_showJuhu) {
      const _juhuPerWeek  = Math.round((_weeklyHours / 40) * 8 * job.current_wage);
      const _weeklyTotal  = job.current_wage * _weeklyHours + _juhuPerWeek;
      document.getElementById('d-juhu-val').textContent = _weeklyTotal.toLocaleString() + '원';
      _juhuBox.style.display = 'flex';
    } else {
      _juhuBox.style.display = 'none';
    }
  }

  document.getElementById('d-time').textContent = job.start_time ? formatTime(job.start_time) : '미정';
  document.getElementById('d-duration').textContent = job.duration_hours + '시간';
  document.getElementById('d-needed').textContent = `${Math.max(0, job.needed_count - job.filled_count)}/${job.needed_count}명`;
  document.getElementById('d-dist').textContent = dist;
  const _distLabel = document.getElementById('d-dist-label');
  const _distItem  = document.getElementById('d-dist-item');
  if (_distLabel) _distLabel.textContent = job.is_remote ? '근무 방식' : '거리';
  if (_distItem)  _distItem.style.background = job.is_remote ? '#F0F9FF' : '';
  // GPS가 없으면 역지오코딩으로 거리 셀 주소 표시
  if (job.lat && job.lng && !window._myLat && typeof kakao !== 'undefined' && kakao.maps?.services) {
    const _gc = new kakao.maps.services.Geocoder();
    _gc.coord2RegionCode(job.lng, job.lat, (result, status) => {
      if (status === kakao.maps.services.Status.OK && document.getElementById('d-dist')) {
        const dong = result.find(r => r.region_type === 'H') || result[0];
        if (dong) document.getElementById('d-dist').textContent = `${dong.region_2depth_name} ${dong.region_3depth_name}`;
      }
    });
  }
  document.getElementById('d-desc').textContent = job.description || '';

  // 공고 사진 (RPC 결과에 없을 수 있으므로 별도 fetch)
  const _dImgEl = document.getElementById('d-images');
  if (_dImgEl) {
    _dImgEl.style.display = 'none';
    _dImgEl.innerHTML = '';
    fetch(APP_CONFIG.SUPABASE_URL + '/rest/v1/job_postings?id=eq.' + jobId + '&select=images,main_image_idx', {
      headers: { 'apikey': APP_CONFIG.SUPABASE_ANON_KEY }
    }).then(r => r.json()).then(rows => {
      const imgs = rows[0]?.images;
      if (!imgs || !imgs.length) return;
      const mainIdx = rows[0]?.main_image_idx || 0;
      const ordered = [...imgs];
      if (mainIdx > 0 && mainIdx < ordered.length) { const [m] = ordered.splice(mainIdx, 1); ordered.unshift(m); }
      _dImgEl.innerHTML = '<div style="overflow-x:auto;display:flex;gap:8px;padding:0 20px 12px;-webkit-overflow-scrolling:touch;scrollbar-width:none">' +
        ordered.map(u => '<img src="' + u + '" onclick="openImgViewer(\'' + u + '\')" style="height:175px;' + (ordered.length === 1 ? 'width:calc(100% - 40px);' : 'min-width:240px;max-width:240px;') + 'object-fit:cover;border-radius:14px;cursor:pointer;flex-shrink:0">').join('') +
        '</div>';
      _dImgEl.style.display = 'block';
    }).catch(() => {});
  }

  if (hasSurge) {
    document.getElementById('d-surge').style.display = 'inline-flex';
    document.getElementById('d-surge-amt').textContent = '+' + job.wage_delta.toLocaleString() + '원';
    document.getElementById('d-base-wage').textContent = `기본시급 ${job.base_wage.toLocaleString()}원에서 인상됨`;
  } else {
    document.getElementById('d-surge').style.display = 'none';
    document.getElementById('d-base-wage').textContent = '';
  }

  // 비대면 배지
  document.getElementById('d-remote-badge').style.display = job.is_remote ? 'block' : 'none';

  // 팀 모집 현황
  const teamEl = document.getElementById('d-team-job');
  if (teamEl) {
    if (job.is_team_job && job.needed_count > 0) {
      const _filled = job.filled_count || 0;
      const _needed = job.needed_count;
      const _rem = _needed - _filled;
      const _pct = Math.min(100, Math.round(_filled / _needed * 100));
      teamEl.style.display = 'block';
      document.getElementById('d-team-bar').style.width = _pct + '%';
      document.getElementById('d-team-bar').style.background = _pct >= 80 ? '#C8102E' : '#7C3AED';
      const remainEl = document.getElementById('d-team-remain');
      remainEl.textContent = _rem > 0 ? `${_needed}명 중 ${_rem}자리 남음` : '모집 완료';
      remainEl.style.color = _rem <= 1 ? '#C8102E' : '#7C3AED';
      const descEl = document.getElementById('d-team-desc');
      if (job.team_desc) { descEl.textContent = job.team_desc; descEl.style.display = 'block'; }
      else { descEl.style.display = 'none'; }
    } else { teamEl.style.display = 'none'; }
  }

  // 국적 조건 배지
  const _NR_INFO = {
    korean_only:       { text:'🇰🇷 한국인만 지원 가능', bg:'#FFF1F2', color:'#9f1239', border:'1.5px solid #FECDD3' },
    korean_lang:       { text:'💬 외국인 가능 — 한국어 구사 필수', bg:'#FFF7ED', color:'#B45309', border:'1.5px solid #FDE68A' },
    foreigner_welcome: { text:'🌏 외국인 환영 — 언어 무관', bg:'#F0FFF4', color:'#166534', border:'1.5px solid #86EFAC' },
  };
  const natreqEl = document.getElementById('d-natreq');
  const natreqBadge = document.getElementById('d-natreq-badge');
  const _nri = _NR_INFO[job.nationality_requirement];
  if (_nri) {
    natreqBadge.textContent = _nri.text;
    natreqBadge.style.background = _nri.bg; natreqBadge.style.color = _nri.color; natreqBadge.style.border = _nri.border;
    natreqEl.style.display = 'block';
  } else { natreqEl.style.display = 'none'; }

  // 픽업 장소 배지
  const pickupEl = document.getElementById('d-pickup');
  if (job.pickup_location) {
    pickupEl.style.display = 'block';
    document.getElementById('d-pickup-text').textContent = job.pickup_location;
  } else {
    pickupEl.style.display = 'none';
  }

  // 초보 가능 / 식사 배지
  const beginnerBadge = document.getElementById('d-beginner-badge');
  if (job.beginner_ok === true) {
    beginnerBadge.style.display = 'inline-flex'; beginnerBadge.textContent = '🌱 초보 가능';
    beginnerBadge.style.background = '#F0FFF4'; beginnerBadge.style.color = '#16a34a'; beginnerBadge.style.border = '1.5px solid #86EFAC';
  } else if (job.beginner_ok === false) {
    beginnerBadge.style.display = 'inline-flex'; beginnerBadge.textContent = '🔰 경력자 우대';
    beginnerBadge.style.background = '#FFF1F2'; beginnerBadge.style.color = '#9f1239'; beginnerBadge.style.border = '1.5px solid #FECDD3';
  } else {
    beginnerBadge.style.display = 'none';
  }
  const mealBadge = document.getElementById('d-meal-badge');
  if (mealBadge) mealBadge.style.display = job.meal_included ? 'inline-flex' : 'none';
  const badgesRow = document.getElementById('d-badges-row');
  if (badgesRow) badgesRow.style.display = (job.beginner_ok !== undefined || job.meal_included) ? 'flex' : 'none';

  // 당일정산 배지
  document.getElementById('d-same-day').style.display = job.same_day_payment ? 'block' : 'none';

  // 노쇼 보증금 배지
  const depositAmt = job.noshow_deposit || 0;
  if (depositAmt > 0) {
    const _dAmt = document.getElementById('d-deposit-amount');
    if (_dAmt) _dAmt.textContent = Number(depositAmt).toLocaleString('ko-KR') + '원';
    document.getElementById('d-deposit').style.display = 'block';
  } else {
    document.getElementById('d-deposit').style.display = 'none';
  }

  // 위치 섹션 렌더링 (address 없으면 DB에서 보완)
  if (job.address) {
    _renderDetailLocation(job);
  } else {
    _renderDetailLocation(job); // lat/lng 우선 표시
    fetch(`${APP_CONFIG.SUPABASE_URL}/rest/v1/job_postings?id=eq.${jobId}&select=address`, {
      headers: { 'apikey': APP_CONFIG.SUPABASE_ANON_KEY }
    }).then(r => r.json()).then(rows => {
      const addr = rows[0]?.address;
      if (addr) {
        job.address = addr;
        if (selectedJobId === jobId) {
          const addrEl = document.getElementById('d-address-text');
          const copyBtn = document.getElementById('d-addr-copy-btn');
          if (addrEl) { const _p = addr.split('\n'); addrEl.textContent = _p.length > 1 ? _p[1] : _p[0]; addrEl.style.color = '#333'; }
          if (copyBtn) copyBtn.style.display = 'block';
        }
      }
    }).catch(() => {});
  }

  // 지원하기 버튼 초기화
  const applyBtn = document.getElementById('d-apply-btn');
  applyBtn.style.background = '';
  applyBtn.textContent = '⚡ 바로 지원하기';
  applyBtn.disabled = false;
  applyBtn.onclick = applyJob;

  // 북마크 버튼 상태 초기화
  document.getElementById('d-bookmark-btn').textContent = '\u{1F516}';
  // 평점 버튼 초기화
  const _rateRow = document.getElementById('d-rate-row');
  if (_rateRow) { _rateRow.style.display = 'none'; }
  const _rateBtn = document.getElementById('d-rate-btn');
  if (_rateBtn) { _rateBtn.textContent = '⭐ 업주 평점 남기기'; _rateBtn.style.background = '#FEF3C7'; _rateBtn.style.color = '#D97706'; _rateBtn.onclick = openBizRatingModal; _rateBtn.style.cursor = 'pointer'; }
  const _qrRow = document.getElementById('d-qr-row');
  if (_qrRow) _qrRow.style.display = (bizRecord && job.business_id === bizRecord.id) ? 'block' : 'none';

  // 상세 패널 팔로우 버튼 초기화 (알바생으로 볼 때만)
  if (job.business_id && !bizRecord) {
    _initDetailFollowBtn(job.business_id, job.biz_name || '');
  }

  document.getElementById('detail-overlay').classList.add('open');
  // 오버레이 애니메이션 완료 후 미니맵 relayout (숨겨진 컨테이너에서 초기화 시 크기 0 문제 해결)
  setTimeout(() => { if (_detailMiniMap) _detailMiniMap.relayout(); }, 350);
  checkAlreadyApplied(jobId);
  checkBookmarkState(jobId);

  // 조회수 increment (백그라운드, 비로그인/오류 무시)
  if (currentUser) {
    db.from('job_postings').select('view_count').eq('id', jobId).single()
      .then(({ data }) => {
        if (data !== null) db.from('job_postings').update({ view_count: (data.view_count || 0) + 1 }).eq('id', jobId);
      }).catch(() => {});
  }

  // 미성년자 보호: age_limit 공고는 만 18세 미만 지원 차단
  if (currentUser && _myAge !== null && _myAge < 18) {
    db.from('job_postings').select('age_limit').eq('id', jobId).single()
      .then(({ data }) => {
        if (data?.age_limit) {
          const btn = document.getElementById('d-apply-btn');
          if (btn && !btn.classList.contains('applied-state')) {
            btn.disabled = true;
            btn.style.background = '#d1d5db';
            btn.style.color = '#6b7280';
            btn.textContent = '\u{1F51E} 만 18세 이상만 지원 가능';
            btn.onclick = null;
          }
        }
      }).catch(() => {});
  }

  // 지도 해당 위치로 이동
  kakaoMap.setCenter(new kakao.maps.LatLng(job.lat, job.lng));
}

let _detailMiniMap = null;
let _detailJob = null;

function _renderDetailLocation(job) {
  _detailJob = job;
  const section = document.getElementById('d-location-section');
  const addrEl = document.getElementById('d-address-text');
  const miniMapEl = document.getElementById('d-mini-map');
  if (!section || !addrEl || !miniMapEl) return;

  const hasLatLng = job.lat && job.lng;
  const hasAddr = job.address && job.address.trim();

  if (!hasLatLng && !hasAddr) {
    section.style.display = 'none';
    return;
  }

  section.style.display = 'block';
  const copyBtn = document.getElementById('d-addr-copy-btn');
  if (hasAddr) {
    const parts = job.address.split('\n');
    if (parts.length > 1) {
      // "업체명\n도로명주소" 포맷: 둘 다 표시
      const shortAddr = parts[1].split(' ').slice(0,3).join(' ');
      addrEl.innerHTML = '<div style="font-weight:800;color:#222">' + parts[0] + '</div><div style="font-size:12px;color:#777;margin-top:2px">' + shortAddr + '</div>';
    } else {
      addrEl.textContent = parts[0];
    }
    addrEl.style.color = '#333';
    if (copyBtn) copyBtn.style.display = 'block';
  } else if (hasLatLng && typeof kakao !== 'undefined' && kakao.maps?.services) {
    // 역지오코딩으로 행정동 주소 표시
    addrEl.textContent = '위치 불러오는 중...';
    addrEl.style.color = '#aaa';
    const geocoder = new kakao.maps.services.Geocoder();
    geocoder.coord2RegionCode(job.lng, job.lat, (result, status) => {
      if (status === kakao.maps.services.Status.OK) {
        const dong = result.find(r => r.region_type === 'H') || result[0];
        if (dong) {
          const addrStr = `${dong.region_1depth_name} ${dong.region_2depth_name} ${dong.region_3depth_name}`;
          addrEl.textContent = addrStr;
          addrEl.style.color = '#555';
        }
      }
    });
    if (copyBtn) copyBtn.style.display = 'none';
  } else {
    addrEl.textContent = '지도에서 위치 확인';
    addrEl.style.color = '#aaa';
    if (copyBtn) copyBtn.style.display = 'none';
  }

  if (!hasLatLng) {
    miniMapEl.style.display = 'none';
    return;
  }
  miniMapEl.style.display = 'block';

  // 카카오맵 SDK 로드 확인 후 미니맵 생성
  const _initMiniMap = () => {
    miniMapEl.innerHTML = '';
    const latlng = new kakao.maps.LatLng(job.lat, job.lng);
    _detailMiniMap = new kakao.maps.Map(miniMapEl, { center: latlng, level: 3 });
    _detailMiniMap.setDraggable(false);
    _detailMiniMap.setZoomable(false);
    // relayout 후 마커 추가 (숨겨진 컨테이너 대응)
    setTimeout(() => {
      _detailMiniMap.relayout();
      _detailMiniMap.setCenter(latlng);
      new kakao.maps.Marker({ position: latlng, map: _detailMiniMap });
    }, 380);
  };

  if (typeof kakao !== 'undefined' && kakao.maps) {
    _initMiniMap();
  } else {
    miniMapEl.innerHTML = '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:12px;color:#aaa">지도 로딩 중...</div>';
    const _wait = setInterval(() => {
      if (typeof kakao !== 'undefined' && kakao.maps) { clearInterval(_wait); _initMiniMap(); }
    }, 300);
  }

  // 지하철 정보 표시
  const subwayEl = document.getElementById('d-subway-info');
  if (subwayEl && hasLatLng) {
    const cached = _subwayCache[job.id];
    if (cached) {
      _renderDetailSubway(subwayEl, cached);
    } else if (cached === undefined && window.kakao?.maps?.services) {
      subwayEl.style.display = 'none';
      const ps = new kakao.maps.services.Places();
      ps.categorySearch('SW8', (result, status) => {
        if (status === kakao.maps.services.Status.OK && result.length > 0) {
          const walkMin = Math.ceil(parseInt(result[0].distance) / 67);
          const _parseStn2 = name => {
            const c = name.replace(/\s*\([^)]*\)/g,'').trim();
            let s = c.replace(/\s+(?:\d+호선|GTX-[A-Z]|경의중앙선|분당선|신분당선|공항철도|경춘선|수인선|경강선|인천\d+호선).*/,'').trim();
            if (!s.endsWith('역')) s += '역';
            const m = c.match(/\d+호선|GTX-[A-Z]|경의중앙선|분당선|신분당선|공항철도|경춘선/);
            return { s, line: m ? m[0] : null };
          };
          const { s: sName2 } = _parseStn2(result[0].place_name);
          const baseDist2 = parseInt(result[0].distance);
          const lines2 = [];
          for (const r of result) {
            if (Math.abs(parseInt(r.distance) - baseDist2) > 80) break;
            const { s: s2, line: l } = _parseStn2(r.place_name);
            if (s2 === sName2 && l && !lines2.includes(l)) lines2.push(l);
          }
          const info = `${sName2}${lines2.length ? ' ' + lines2.join(' ') : ''} 도보 ${walkMin}분`;
          _subwayCache[job.id] = info;
          _renderDetailSubway(subwayEl, info);
        }
      }, { location: new kakao.maps.LatLng(job.lat, job.lng), radius: 1500, sort: kakao.maps.services.SortBy.DISTANCE });
    } else {
      subwayEl.style.display = 'none';
    }
  }
}

function _getSubwayLineColor(stationName) {
  const LINE_COLORS = {
    '1호선':'#0052A4','2호선':'#00A84D','3호선':'#EF7C1C','4호선':'#00A5DE',
    '5호선':'#996CAC','6호선':'#CD7C2F','7호선':'#747F00','8호선':'#E6186C',
    '9호선':'#BDB092','경의중앙선':'#73B2B9','분당선':'#FDD835','신분당선':'#D4003B',
    'GTX-A':'#8B4513','경춘선':'#178946','공항철도':'#4A7BBE','인천1호선':'#7CA8D5',
    '인천2호선':'#F5A200','수인선':'#F5A200','경강선':'#003DA5',
  };
  for (const [k, v] of Object.entries(LINE_COLORS)) {
    if (stationName.includes(k)) return { line: k, color: v };
  }
  return null;
}

function _renderDetailSubway(el, infoStr) {
  if (!infoStr || !el) return;
  const LC = _getSubwayLineColor.LINE_COLORS || (() => {
    const m = {};
    Object.entries({'1호선':'#0052A4','2호선':'#00A84D','3호선':'#EF7C1C','4호선':'#00A5DE','5호선':'#996CAC','6호선':'#CD7C2F','7호선':'#747F00','8호선':'#E6186C','9호선':'#BDB092','경의중앙선':'#73B2B9','분당선':'#FDD835','신분당선':'#D4003B','GTX-A':'#8B4513','경춘선':'#178946','공항철도':'#4A7BBE','인천1호선':'#7CA8D5','인천2호선':'#F5A200'}).forEach(([k,v])=>m[k]=v);
    return m;
  })();
  let badges = '';
  for (const [line, color] of Object.entries(LC)) {
    if (infoStr.includes(line)) {
      badges += `<span style="display:inline-flex;align-items:center;background:${color};color:#fff;font-size:10px;font-weight:900;padding:2px 7px;border-radius:20px;margin-right:4px;white-space:nowrap">${line}</span>`;
    }
  }
  const cleanText = infoStr.replace(/\s+(?:\d+호선|GTX-[A-Z]|경의중앙선|분당선|신분당선|공항철도|경춘선|인천\d+호선)/g,'').replace(/\s+/g,' ').trim();
  el.innerHTML = `<div style="display:flex;align-items:center;flex-wrap:wrap;gap:2px;font-size:12px;color:#555;font-weight:600;padding:0 20px 12px">
    <span style="font-size:14px;margin-right:4px">🚇</span>${badges}<span>${cleanText}</span>
  </div>`;
  el.style.display = 'block';
}

function copyDetailAddress() {
  const raw = _detailJob?.address || '';
  if (!raw) { showToast('주소 정보가 없어요'); return; }
  const parts = raw.split('\n');
  const addr = parts.length > 1 ? parts[1] : parts[0];
  navigator.clipboard?.writeText(addr).then(() => showToast('주소가 복사됐어요')).catch(() => showToast(addr));
}

function openKakaoMapApp() {
  if (!_detailJob) return;
  const { lat, lng, address, title } = _detailJob;
  const addrLine = (address || '').split('\n')[0].trim();
  // 도착지 이름은 주소로 표시 (공고명 대신)
  const placeName = encodeURIComponent(addrLine || title || '근무지');
  if (lat && lng) {
    window.open(`https://map.kakao.com/link/to/${placeName},${lat},${lng}`, '_blank');
  } else if (addrLine) {
    window.open(`https://map.kakao.com/link/search/${encodeURIComponent(addrLine)}`, '_blank');
  } else {
    showToast('위치 정보가 없어요');
  }
}

function closeDetail(e) {
  if (e.target === document.getElementById('detail-overlay')) {
    document.getElementById('detail-overlay').classList.remove('open');
    selectedJobId = null;
  }
}

// 상세 패널 드래그 다운으로 닫기
(function setupDetailDrag() {
  let startY = 0, isDragging = false;
  const getHandle = () => document.getElementById('detail-drag-handle');
  const getSheet = () => document.getElementById('detail-sheet');
  const getOverlay = () => document.getElementById('detail-overlay');

  document.addEventListener('touchstart', e => {
    const handle = getHandle();
    if (!handle || !handle.contains(e.target)) return;
    startY = e.touches[0].clientY;
    isDragging = true;
    const sheet = getSheet();
    if (sheet) sheet.style.transition = 'none';
  }, { passive: true });

  document.addEventListener('touchmove', e => {
    if (!isDragging) return;
    const dy = e.touches[0].clientY - startY;
    if (dy > 0) {
      const sheet = getSheet();
      if (sheet) sheet.style.transform = `translateY(${dy}px)`;
    }
  }, { passive: true });

  document.addEventListener('touchend', e => {
    if (!isDragging) return;
    isDragging = false;
    const dy = e.changedTouches[0].clientY - startY;
    const sheet = getSheet();
    if (sheet) {
      sheet.style.transition = '';
      sheet.style.transform = '';
    }
    if (dy > 120) {
      const overlay = getOverlay();
      if (overlay) overlay.classList.remove('open');
      selectedJobId = null;
    }
  }, { passive: true });
})();

// 바텀시트 공통 드래그 핸들러 (외국인환영/RANK/홈필터) — touchmove 애니메이션 포함
(function setupBottomSheetDrags() {
  const _bshMap = [
    { id: 'bsh-fl', sheetSel: '#panel-foreigner-lang > div', close: () => closeForeignerLangPanel() },
    { id: 'bsh-rk', sheetSel: '#panel-rank > div',           close: () => closeRankPanel() },
    { id: 'bsh-hf', sheetSel: '#home-filter-overlay > div > div', close: () => closeHomeFilter() },
  ];
  let _bshCur = null, _bshSy = 0, _bshSheet = null;
  document.addEventListener('touchstart', e => {
    _bshCur = null; _bshSheet = null;
    for (const m of _bshMap) {
      const el = document.getElementById(m.id);
      if (el && el.contains(e.target)) {
        _bshCur = m; _bshSy = e.touches[0].clientY;
        _bshSheet = document.querySelector(m.sheetSel);
        if (_bshSheet) _bshSheet.style.transition = 'none';
        break;
      }
    }
  }, { passive: true });
  document.addEventListener('touchmove', e => {
    if (!_bshCur || !_bshSheet) return;
    const dy = Math.max(0, e.touches[0].clientY - _bshSy);
    _bshSheet.style.transform = `translateY(${dy}px)`;
  }, { passive: true });
  document.addEventListener('touchend', e => {
    if (!_bshCur) return;
    const dy = e.changedTouches[0].clientY - _bshSy;
    if (dy > 80) {
      if (_bshSheet) { _bshSheet.style.transition = 'transform 0.15s ease'; _bshSheet.style.transform = 'translateY(100%)'; }
      setTimeout(() => { if (_bshSheet) { _bshSheet.style.transform = ''; _bshSheet.style.transition = ''; } _bshCur?.close(); }, 140);
    } else {
      if (_bshSheet) { _bshSheet.style.transition = 'transform 0.2s ease'; _bshSheet.style.transform = ''; }
    }
    _bshCur = null; _bshSheet = null;
  }, { passive: true });
})();

// bsh-hf 전용 직접 핸들러 — panel-home(overflow-y:auto) 안에 있어서
// document 레벨 passive 핸들러로는 브라우저 스크롤 개시를 막지 못하는 문제 해결
(function() {
  let _sy = 0, _sheet = null;
  const el = document.getElementById('bsh-hf');
  if (!el) return;
  el.addEventListener('touchstart', e => {
    e.stopPropagation(); // document _bshMap 핸들러 중복 방지
    e.preventDefault();  // panel-home 스크롤 개시 차단
    _sy = e.touches[0].clientY;
    _sheet = document.querySelector('#home-filter-overlay > div > div');
    if (_sheet) _sheet.style.transition = 'none';
  }, { passive: false });
  el.addEventListener('touchmove', e => {
    e.preventDefault();
    if (!_sheet) return;
    _sheet.style.transform = `translateY(${Math.max(0, e.touches[0].clientY - _sy)}px)`;
  }, { passive: false });
  el.addEventListener('touchend', e => {
    if (!_sheet) return;
    const dy = e.changedTouches[0].clientY - _sy;
    if (dy > 80) {
      _sheet.style.transition = 'transform 0.15s ease';
      _sheet.style.transform = 'translateY(100%)';
      const s = _sheet; _sheet = null;
      setTimeout(() => { s.style.transform = ''; s.style.transition = ''; closeHomeFilter(); }, 140);
    } else {
      _sheet.style.transition = 'transform 0.2s ease';
      _sheet.style.transform = '';
      _sheet = null;
      if (Math.abs(dy) < 5) closeHomeFilter(); // 탭으로 닫기
    }
  }, { passive: false });
})();

function isRealJobId(id) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

function showLoginPrompt(title, desc) {
  document.getElementById('guest-modal-title').textContent = title || '로그인이 필요해요';
  document.getElementById('guest-modal-desc').innerHTML = (desc || '지원하려면 로그인이 필요합니다.<br>30초면 가입 완료!');
  const m = document.getElementById('guest-login-modal');
  m.style.display = 'flex';
}
function closeGuestLoginModal() {
  document.getElementById('guest-login-modal').style.display = 'none';
}

function applyJob() {
  if (isGuest || !currentUser) {
    showLoginPrompt('로그인 후 지원할 수 있어요', '공고에 지원하고 업주와 채팅하려면<br>로그인이 필요합니다. 30초면 완료!');
    return;
  }
  if (!selectedJobId) return;
  if (!isRealJobId(selectedJobId)) {
    showToast('\u{1F9EA} 테스트 공고입니다\n실제 등록된 공고에만 지원 가능해요');
    return;
  }

  // 국적 조건 게이트
  const _applyJob = jobs.find(j => j.id === selectedJobId);
  if (_applyJob && _applyJob.nationality_requirement === 'korean_only') {
    const _wNat = currentUser?.user_metadata?.nationality || _workerProfile?.nationality;
    if (_wNat && _wNat !== 'KR') {
      showConfirm('이 공고는 한국 국적 지원자만 지원 가능합니다.\n지원이 어렵습니다.', null, {
        icon:'🇰🇷', title:'한국인만 지원 가능', okLabel:'확인', hideCancel: true
      });
      return;
    }
  }

  const _openApplyModal = () => {
    const job = jobs.find(j => j.id === selectedJobId);
    document.getElementById('apply-msg-job-title').textContent = job ? job.title + ' · ' + (job.biz_name || '') : '';
    document.getElementById('apply-msg-text').value = '';
    document.getElementById('apply-msg-count').textContent = '0';
    document.getElementById('apply-msg-modal').style.display = 'flex';
    if (window.visualViewport) window.visualViewport.addEventListener('resize', _applyMsgKbResize);
    window.addEventListener('resize', _applyMsgKbResize);
    setTimeout(() => { document.getElementById('apply-msg-text')?.focus(); _applyMsgKbResize(); }, 400);
  };
  // 노쇼 보증금 동의 확인
  const depositEl = document.getElementById('d-deposit');
  if (depositEl && depositEl.style.display !== 'none') {
    const depositTxt = document.getElementById('d-deposit-badge')?.textContent || '노쇼 보증금';
    showConfirm('지원 시 보증금에 동의한 것으로 간주됩니다.', _openApplyModal, {icon:'🛡️', title:depositTxt, okLabel:'동의하고 지원'});
    return;
  }
  _openApplyModal();
}

function _applyMsgKbResize() {
  const modal = document.getElementById('apply-msg-modal');
  if (!modal || modal.style.display === 'none') return;
  const vp = window.visualViewport;
  if (!vp) return;
  const kbH = Math.max(0, window.innerHeight - vp.height - vp.offsetTop);
  const inner = document.getElementById('apply-msg-inner');
  if (!inner) return;
  inner.style.maxHeight = (vp.height - 20) + 'px';
  inner.style.transform = kbH > 0 ? `translateY(-${kbH}px)` : '';
}

function closeApplyMsg() {
  if (window.visualViewport) window.visualViewport.removeEventListener('resize', _applyMsgKbResize);
  window.removeEventListener('resize', _applyMsgKbResize);
  const modal = document.getElementById('apply-msg-modal');
  const inner = document.getElementById('apply-msg-inner');
  if (inner) { inner.style.maxHeight = ''; inner.style.transform = ''; }
  if (modal) { modal.style.display = 'none'; }
}

async function submitApplyWithMsg(skipMsg) {
  const msg = skipMsg ? '' : (document.getElementById('apply-msg-text').value.trim());
  closeApplyMsg();

  // 나이제한 체크 (프로필 미오픈 시에도 안전하게)
  const curJob = jobs.find(j => j.id === selectedJobId);
  if (curJob?.age_limit) {
    if (_myAge === null) {
      const { data: w } = await db.from('workers').select('age, birth_date').eq('kakao_uid', currentUser.id).maybeSingle();
      _myAge = w?.age || (w?.birth_date ? calcAgeFromBirth(w.birth_date) : null);
    }
    if (_myAge !== null && _myAge < 18) {
      showToast('\u{1F51E} 만 18세 이상만 지원 가능한 공고입니다');
      return;
    }
  }

  const btn = document.getElementById('d-apply-btn');
  btn.textContent = '지원 중...';
  btn.disabled = true;

  try {
    let wid = await _getWorkerId();
    if (!wid) {
      const meta = currentUser.user_metadata || {};
      const name = meta.full_name || meta.name || currentUser.email?.split('@')[0] || '알바생';
      const { data: created, error: ce } = await db.from('workers')
        .insert({ kakao_uid: currentUser.id, name }).select('id').single();
      if (ce || !created) { showToast('프로필 생성 실패'); btn.textContent = '⚡ 바로 지원하기'; btn.disabled = false; return; }
      window._myWorkerId = created.id;
      wid = created.id;
    }

    const payload = { job_posting_id: selectedJobId, worker_id: wid };
    if (msg) payload.apply_message = msg;

    const { data: appData, error } = await db.from('applications').insert(payload).select('id').single();

    if (error?.code === '23505') {
      // 기존 지원 기록이 있음 - 취소된 건이면 재지원으로 되살리고, 아니면 이미 지원한 것으로 안내
      const { data: existing } = await db.from('applications')
        .select('id, status').eq('job_posting_id', selectedJobId).eq('worker_id', wid).single();
      if (existing?.status === 'cancelled') {
        const { data: revived, error: reviveErr } = await db.from('applications')
          .update({ status: 'pending', apply_message: msg || null, cancel_deadline: null })
          .eq('id', existing.id).select('id').single();
        if (reviveErr) {
          showToast('재지원 처리 중 오류가 발생했습니다');
          btn.textContent = '⚡ 바로 지원하기'; btn.disabled = false;
        } else {
          showToast('✅ 지원 완료!');
          showAppliedState(revived.id);
          _notifyOwnerNewApplicant(selectedJobId);
        }
      } else {
        if (existing) showAppliedState(existing.id);
        showToast('이미 지원한 공고입니다');
      }
    } else if (error) {
      showToast('오류가 발생했습니다: ' + error.message);
      btn.textContent = '⚡ 바로 지원하기'; btn.disabled = false;
    } else {
      showToast('✅ 지원 완료!');
      showAppliedState(appData.id);
      // 업주에게 새 지원자 Push 알림
      _notifyOwnerNewApplicant(selectedJobId);
    }
  } catch(e) {
    showToast('오류: ' + e.message);
    btn.textContent = '⚡ 바로 지원하기'; btn.disabled = false;
  }
}

function showAppliedState(applicationId) {
  const btn = document.getElementById('d-apply-btn');
  btn.style.background = '#3B82F6';
  btn.textContent = '\u{1F4AC} 업주에게 문의하기';
  btn.disabled = false;
  btn.onclick = () => openWChat(applicationId, jobs.find(j=>j.id===selectedJobId)?.biz_name || '업주');
}

const _BIZ_STAR_LABELS = ['', '별로예요', '그저그래요', '보통이에요', '좋아요', '최고예요!'];
function openQRModal() {
  const job = jobs.find(j => j.id === selectedJobId);
  if (!job) return;
  const url = 'https://baroalba.multimove.co.kr/바로알바.html?job=' + job.id;
  const canvas = document.getElementById('qr-code-canvas');
  if (canvas && typeof QRCode !== 'undefined') {
    QRCode.toCanvas(canvas, url, { width: 200, margin: 1, color: { dark: '#1a1a1a', light: '#ffffff' } }, err => {
      if (err) console.error('QR 생성 실패:', err);
    });
  }
  const wageLabels = { hourly:'시급', daily:'일급', 'per-job':'건당', monthly:'월급', other:'급여' };
  const wLabel = wageLabels[job.wage_type] || '시급';
  const timeStr = job.start_time ? formatTime(job.start_time) : '미정';
  const daysStr = job.work_days || '';
  document.getElementById('qr-job-info').innerHTML =
    '<div style="font-size:15px;font-weight:900;color:#111;margin-bottom:8px">' + job.title + '</div>' +
    '<div><b>업체명</b> ' + job.biz_name + '</div>' +
    (job.category ? '<div><b>직종</b> ' + job.category + '</div>' : '') +
    '<div><b>' + wLabel + '</b> ' + (job.current_wage || 0).toLocaleString() + '원</div>' +
    (job.same_day_payment ? '<div style="color:#15803d;font-weight:700">💰 당일정산</div>' : '') +
    '<div><b>근무시간</b> ' + timeStr + ' / ' + (job.duration_hours || '-') + '시간</div>' +
    (daysStr ? '<div><b>근무요일</b> ' + daysStr + '</div>' : '') +
    '<div style="margin-top:10px;padding-top:10px;border-top:1px solid #e5e7eb;font-size:11px;color:#999;text-align:center">QR 코드를 스캔하면 공고로 바로 이동합니다</div>';
  document.getElementById('qr-modal').style.display = 'flex';
}

function closeQRModal() {
  document.getElementById('qr-modal').style.display = 'none';
}

function printQR() {
  const job = jobs.find(j => j.id === selectedJobId);
  const title = job ? job.title : '바로알바 공고';
  const canvas = document.getElementById('qr-code-canvas');
  const qrDataUrl = canvas ? canvas.toDataURL('image/png') : '';
  const jobInfo = document.getElementById('qr-job-info').innerHTML;
  _printInPage(
    `<h2 style="text-align:center;font-size:20px;margin-bottom:20px">📋 알바 공고 모집</h2>` +
    (qrDataUrl ? `<img src="${qrDataUrl}" style="display:block;margin:0 auto 16px;width:200px;height:200px">` : '') +
    `<div style="background:#f8f9fa;border-radius:12px;padding:16px;line-height:1.9;font-size:14px">${jobInfo}</div>`,
    `#_ps_content { font-family:'Apple SD Gothic Neo',sans-serif; padding:40px; max-width:500px; margin:0 auto; }`
  );
}

let _bizRatingAppId = null;

function openBizRatingModal() {
  const btn = document.getElementById('d-rate-btn');
  _bizRatingAppId = btn?.dataset.appId || null;
  const bizName = jobs.find(j => j.id === selectedJobId)?.biz_name || '업주';
  document.getElementById('biz-rating-biz-name').textContent = bizName;
  document.getElementById('biz-rating-val').value = '0';
  document.getElementById('biz-review-text').value = '';
  document.getElementById('biz-star-label').textContent = '';
  document.querySelectorAll('#biz-star-row span').forEach(s => { s.textContent = '☆'; s.style.color = '#ddd'; });
  document.getElementById('biz-rating-modal').style.display = 'flex';
}

function closeBizRatingModal() {
  document.getElementById('biz-rating-modal').style.display = 'none';
}

function setBizStar(val) {
  document.getElementById('biz-rating-val').value = String(val);
  document.querySelectorAll('#biz-star-row span').forEach(s => {
    const sv = parseInt(s.dataset.v);
    s.textContent = sv <= val ? '★' : '☆';
    s.style.color = sv <= val ? '#F59E0B' : '#ddd';
    s.style.transform = sv === val ? 'scale(1.25)' : 'scale(1)';
    setTimeout(() => { s.style.transform = 'scale(1)'; }, 150);
  });
  document.getElementById('biz-star-label').textContent = _BIZ_STAR_LABELS[val] || '';
}

async function submitBizRating() {
  const rating = parseFloat(document.getElementById('biz-rating-val').value);
  if (!rating || rating < 1) { showToast('별점을 선택해주세요'); return; }
  if (!_bizRatingAppId) { showToast('오류: 지원 정보가 없습니다'); return; }
  const review = document.getElementById('biz-review-text').value.trim();
  const sess = currentSession;
  if (!sess) { showToast('로그인이 필요합니다'); return; }
  const btn = document.getElementById('biz-rating-submit-btn');
  btn.disabled = true; btn.textContent = '등록 중...';
  try {
    const res = await fetch(APP_CONFIG.SUPABASE_URL + '/rest/v1/applications?id=eq.' + _bizRatingAppId, {
      method: 'PATCH',
      headers: { 'apikey': APP_CONFIG.SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + sess.access_token, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify({ biz_rating: rating, biz_review: review || null })
    });
    if (!res.ok) throw new Error('status ' + res.status);
    closeBizRatingModal();
    showToast('✅ 평점이 등록됐습니다!');
    // 버튼 상태 업데이트
    const rateRow = document.getElementById('d-rate-row');
    const rateBtn = document.getElementById('d-rate-btn');
    if (rateRow && rateBtn) {
      rateBtn.textContent = '⭐ 평점 ' + rating + '점 남김';
      rateBtn.style.background = '#f0fdf4'; rateBtn.style.color = '#16a34a';
      rateBtn.onclick = null; rateBtn.style.cursor = 'default';
    }
  } catch(e) {
    showToast('등록 실패: ' + e.message);
  } finally {
    btn.disabled = false; btn.textContent = '평점 등록';
  }
}


// ── 채팅 알림 (전역 — Broadcast 방식, RLS 우회) ────────────
let _workerGlobalChatSub = null, _ownerGlobalChatSub = null;
function setupMessageNotifications() {
  if (isGuest || !currentUser) return;
  if (_workerGlobalChatSub) { try { _workerGlobalChatSub.unsubscribe(); } catch(e) {} _workerGlobalChatSub = null; }
  if (_ownerGlobalChatSub) { try { _ownerGlobalChatSub.unsubscribe(); } catch(e) {} _ownerGlobalChatSub = null; }

  function _handleNewMsg(payload) {
    if (!payload || payload.sender_id === currentUser.id) return;
    if (payload.application_id) {
      var hidden = JSON.parse(localStorage.getItem('baroalba_hidden_chats') || '[]');
      var idx = hidden.indexOf(payload.application_id);
      if (idx !== -1) { hidden.splice(idx, 1); localStorage.setItem('baroalba_hidden_chats', JSON.stringify(hidden)); }
    }
    showToast('\u{1F4AC} 새 메시지: ' + (payload.content || '').slice(0, 20) + ((payload.content || '').length > 20 ? '...' : ''));
    var badge = document.getElementById('chat-unread-badge');
    if (badge) {
      var cnt = parseInt(badge.textContent || '0') + 1;
      badge.textContent = cnt;
      badge.style.display = 'flex';
    }
  }

  const _myKakaoId = currentUser.user_metadata?.kakao_uid || currentUser.user_metadata?.provider_id || currentUser.id;
  _workerGlobalChatSub = db.channel('worker-' + _myKakaoId + '-notify')
    .on('broadcast', { event: 'new_msg' }, function(e) { _handleNewMsg(e.payload); })
    .subscribe();

  _ownerGlobalChatSub = db.channel('owner-' + _myKakaoId + '-notify')
    .on('broadcast', { event: 'new_msg' }, function(e) { _handleNewMsg(e.payload); })
    .subscribe();
}

async function refreshWorkerChatBadge() {
  const badge = document.getElementById('chat-unread-badge');
  if (!badge || !currentUser) return;
  try {
    const wid = await _getWorkerId();
    if (!wid) { badge.style.display = 'none'; return; }
    const { data: apps } = await db.from('applications').select('id').eq('worker_id', wid);
    if (!apps?.length) { badge.textContent = '0'; badge.style.display = 'none'; return; }
    const { count } = await db.from('messages')
      .select('id', { count: 'exact', head: true })
      .in('application_id', apps.map(a => a.id))
      .eq('is_read', false)
      .neq('sender_id', currentUser.id);
    const n = count || 0;
    badge.textContent = n > 0 ? String(n) : '0';
    badge.style.display = n > 0 ? 'flex' : 'none';
  } catch(e) {}
}

// ── 채팅 (알바생) ─────────────────────────────────────────
let _wchatAppId = null, _wchatSub = null;

// 지원자 카드 상단 클릭 → 지원자 상세 정보 바텀시트
async function openWorkerProfileDirect(appId) {
  let app = (_allApplicants || []).find(a => a.id === appId);
  if (!app) {
    const { data } = await db.from('applications')
      .select('*, workers(id, name, phone, rating, review_count, noshow_count, skills), job_postings(title)')
      .eq('id', appId).maybeSingle();
    if (!data) return;
    app = data;
  }
  const w = app.workers;
  if (!w) return;
  document.getElementById('_wd-sheet')?.remove();
  const el = document.createElement('div');
  el.id = '_wd-sheet';
  el.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9000;display:flex;align-items:flex-end';
  el.onclick = e => { if (e.target === el) el.remove(); };
  const rating = w.rating != null ? Number(w.rating).toFixed(1) : '-';
  const reviews = w.review_count || 0;
  const noshow = w.noshow_count || 0;
  const phone = w.phone ? w.phone.replace(/(\d{3})(\d{3,4})(\d{4})/, '$1-$2-$3') : '';
  const b = _STATUS_BADGE[app.status] || _STATUS_BADGE.pending;
  const wname = (w.name || '이름없음').replace(/'/g, '&#39;');
  const close = `document.getElementById('_wd-sheet').remove();`;
  const total = reviews + noshow;
  const attendRate = total > 0 ? Math.round(reviews / total * 100) : null;
  const trustScore = calcBakalbaScore(w);

  let statusActions = '';
  if (app.status === 'pending') {
    statusActions = `
      <button onclick="${close}updateApplication('${app.id}','reviewing')" style="flex:1;padding:13px;background:#FFF7ED;color:#D97706;border:1.5px solid #FDE68A;border-radius:12px;font-size:13px;font-weight:800;cursor:pointer">⭐ 1차합격</button>
      <button onclick="${close}updateApplication('${app.id}','on_hold')" style="flex:1;padding:13px;background:#EFF6FF;color:#3B82F6;border:none;border-radius:12px;font-size:13px;font-weight:800;cursor:pointer">📌 보류</button>`;
  } else if (app.status === 'reviewing') {
    statusActions = `
      <button onclick="${close}confirmAccept('${app.id}')" style="flex:1;padding:13px;background:#22c55e;color:#fff;border:none;border-radius:12px;font-size:13px;font-weight:800;cursor:pointer">✅ 최종합격</button>
      <button onclick="${close}updateApplication('${app.id}','on_hold')" style="flex:1;padding:13px;background:#EFF6FF;color:#3B82F6;border:none;border-radius:12px;font-size:13px;font-weight:800;cursor:pointer">📌 보류</button>
      <button onclick="${close}updateApplication('${app.id}','rejected')" style="flex:1;padding:13px;background:#f5f5f5;color:#888;border:none;border-radius:12px;font-size:13px;font-weight:800;cursor:pointer">✗ 탈락</button>`;
  } else if (app.status === 'on_hold') {
    statusActions = `
      <button onclick="${close}updateApplication('${app.id}','reviewing')" style="flex:1;padding:13px;background:#FFF7ED;color:#D97706;border:1.5px solid #FDE68A;border-radius:12px;font-size:13px;font-weight:800;cursor:pointer">↩ 1차합격</button>
      <button onclick="${close}updateApplication('${app.id}','rejected')" style="flex:1;padding:13px;background:#f5f5f5;color:#888;border:none;border-radius:12px;font-size:13px;font-weight:800;cursor:pointer">✗ 탈락</button>`;
  } else if (app.status === 'accepted') {
    statusActions = `
      <button onclick="${close}showRatingModal('${app.id}','${w.id||''}')" style="flex:1;padding:13px;background:#22c55e;color:#fff;border:none;border-radius:12px;font-size:13px;font-weight:800;cursor:pointer">🏁 근무완료</button>
      <button onclick="${close}markNoshow('${app.id}','${w.id||''}')" style="flex:1;padding:13px;background:#FEE2E2;color:#DC2626;border:none;border-radius:12px;font-size:13px;font-weight:800;cursor:pointer">😶 노쇼</button>`;
  }

  el.innerHTML = `<div style="background:#fff;border-radius:24px 24px 0 0;width:100%;padding:20px 20px 40px;max-height:80vh;overflow-y:auto">
    <div style="width:36px;height:4px;background:#eee;border-radius:2px;margin:0 auto 16px"></div>

    <!-- 지원자 헤더 -->
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:14px">
      <div style="width:52px;height:52px;border-radius:50%;background:#f1f5f9;border:2px solid #e2e8f0;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:24px">👤</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:18px;font-weight:900;color:#222">${w.name || '이름없음'}</div>
        <div style="display:flex;align-items:center;gap:6px;margin-top:3px;flex-wrap:wrap">
          <span style="font-size:12px;color:#666">★ ${rating}</span>
          <span style="font-size:11px;color:#aaa">·</span>
          <span style="font-size:12px;color:#666">완료 ${reviews}건</span>
          ${noshow > 0 ? `<span style="font-size:11px;font-weight:800;color:#DC2626">⚠️ 노쇼 ${noshow}</span>` : ''}
          ${attendRate !== null ? `<span style="font-size:11px;font-weight:700;color:${attendRate >= 80 ? '#16a34a' : '#D97706'}">출근율 ${attendRate}%</span>` : ''}
        </div>
        <div style="margin-top:4px;display:flex;gap:5px;flex-wrap:wrap">
          ${total >= 2 ? `<span style="font-size:10px;font-weight:800;padding:2px 8px;border-radius:8px;background:${trustScore>=80?'#D1FAE5':trustScore>=60?'#E2E8F0':'#F3F4F6'};color:${trustScore>=80?'#065F46':trustScore>=60?'#475569':'#6B7280'}">신뢰 ${trustScore}점</span>` : ''}
          ${w.age ? `<span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:8px;background:#f1f5f9;color:#475569">만 ${w.age}세</span>` : ''}
          ${w.gender ? `<span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:8px;background:#f1f5f9;color:#475569">${w.gender==='male'?'남성':w.gender==='female'?'여성':w.gender}</span>` : ''}
        </div>
      </div>
      <span style="background:${b.bg};color:${b.color};padding:4px 12px;border-radius:20px;font-size:11px;font-weight:800;flex-shrink:0">${b.label}</span>
    </div>

    <!-- 지원 공고 -->
    <div style="background:#f8fafc;border-radius:10px;padding:10px 12px;margin-bottom:10px">
      <div style="font-size:10px;color:#aaa;font-weight:700;margin-bottom:2px">📋 지원 공고</div>
      <div style="font-size:13px;font-weight:700;color:#222">${app.job_postings?.title || '-'}</div>
    </div>

    <!-- 실시간 위치 공유 (알바생이 공유 시작한 경우에만) -->
    ${app.status === 'accepted' ? `
    <div style="margin-bottom:10px">
      <div style="font-size:10px;color:#aaa;font-weight:700;margin-bottom:4px">📍 실시간 위치</div>
      <div id="wd-loc-map" style="width:100%;height:170px;border-radius:12px;background:#f0f0f0"></div>
      <div id="wd-loc-status" style="font-size:11px;color:#bbb;margin-top:4px;text-align:center">위치 공유 대기 중...</div>
    </div>` : ''}

    <!-- 지원 메시지 -->
    ${app.apply_message ? `<div style="margin-bottom:10px;padding:10px 12px;background:#f8fafc;border-radius:10px;border-left:3px solid #cbd5e1;font-size:12px;color:#444;line-height:1.5"><span style="font-size:10px;font-weight:800;color:#64748b;display:block;margin-bottom:3px">💬 지원 메시지</span>${app.apply_message.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>` : ''}

    <!-- 전화 버튼 -->
    ${phone ? `<a href="tel:${w.phone}" style="display:block;width:100%;padding:12px;background:#f0fdf4;color:#16a34a;border:1.5px solid #86efac;border-radius:12px;font-size:14px;font-weight:800;cursor:pointer;text-align:center;text-decoration:none;margin-bottom:10px;box-sizing:border-box">📞 ${phone} 전화하기</a>` : ''}

    <!-- 상태별 액션 -->
    ${statusActions ? `<div style="display:flex;gap:8px;margin-bottom:8px">${statusActions}</div>` : ''}

    <!-- 채팅 + 지원서 보기 -->
    <div style="display:flex;gap:8px;margin-bottom:8px">
      <button onclick="${close}openChat('${app.id}','${wname}')" style="flex:1;padding:13px;background:#f1f5f9;color:#475569;border:none;border-radius:12px;font-size:13px;font-weight:800;cursor:pointer">💬 채팅</button>
      <button onclick="${close}_chatAppId='${app.id}';openWorkerProfile()" style="flex:1;padding:13px;background:#f1f5f9;color:#475569;border:none;border-radius:12px;font-size:13px;font-weight:800;cursor:pointer">📋 지원서 보기</button>
    </div>

    <!-- 닫기 -->
    <button onclick="${close}" style="width:100%;padding:12px;background:#f0f0f0;color:#555;border:none;border-radius:12px;font-size:14px;font-weight:700;cursor:pointer">닫기</button>
  </div>`;
  document.body.appendChild(el);

  // 실시간 위치 공유 지도 구독 - 알바생이 toggleLocationShare()로 브로드캐스트하는 좌표를 받아서 표시.
  // 실시간 신호는 알바생이 앱을 닫으면 끊기므로, 우선 DB에 저장된 마지막 위치부터 보여주고
  // 그 위에 실시간 신호가 오면 최신 위치로 갱신함
  let _wdLocChannel = null, _wdLocMap = null, _wdLocMarker = null;
  if (app.status === 'accepted') {
    requestAnimationFrame(async () => {
      const mapEl = document.getElementById('wd-loc-map');
      if (!mapEl || !window.kakao?.maps) return;
      _wdLocMap = new kakao.maps.Map(mapEl, { center: new kakao.maps.LatLng(37.5665, 126.978), level: 4 });

      const { data: locRow } = await db.from('applications').select('last_lat, last_lng, last_location_at').eq('id', app.id).maybeSingle();
      const statusEl = document.getElementById('wd-loc-status');
      if (locRow?.last_lat && locRow?.last_lng) {
        const pos = new kakao.maps.LatLng(locRow.last_lat, locRow.last_lng);
        _wdLocMap.setCenter(pos);
        _wdLocMarker = new kakao.maps.Marker({ position: pos, map: _wdLocMap });
        if (statusEl) statusEl.textContent = '🕐 마지막 확인 위치 · ' + new Date(locRow.last_location_at).toLocaleString('ko-KR', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' });
      }

      _wdLocChannel = subscribeWorkerLocation(app.id, (payload) => {
        const pos = new kakao.maps.LatLng(payload.lat, payload.lng);
        _wdLocMap.setCenter(pos);
        if (_wdLocMarker) _wdLocMarker.setMap(null);
        _wdLocMarker = new kakao.maps.Marker({ position: pos, map: _wdLocMap });
        if (statusEl) statusEl.textContent = '🟢 실시간 위치 공유 중 · ' + new Date(payload.ts).toLocaleTimeString('ko-KR', { hour:'2-digit', minute:'2-digit' });
      });
    });
  }
  const _origWdRemove = el.remove.bind(el);
  el.remove = () => {
    if (_wdLocChannel) { _wdLocChannel.unsubscribe(); _wdLocChannel = null; }
    _origWdRemove();
  };
}

function _chatItemClick(e, appId, name, side) {
  const inner = e.currentTarget;
  if (inner && inner.classList.contains('revealed')) {
    inner.classList.remove('revealed');
    e.stopPropagation();
    return;
  }
  // gathering side면 바로모임/바로미팅 단체채팅, 업주 side면 owner 채팅(chat-overlay), worker side면 worker 채팅(wchat-overlay)
  if (side === 'gathering') {
    const gatheringId = appId.startsWith('g_') ? appId.slice(2) : appId;
    const item = _allChats.find(a => a.id === appId);
    if (item?.gatheringCategory === 'baromeeting') openBaromeetChat(gatheringId, name);
    else openMoimChat(gatheringId, name);
  } else if (side === 'owner') {
    openChat(appId, name);
  } else {
    openWChat(appId, name);
  }
}

function confirmLeaveChat(appId, name) {
  // 스와이프 상태 복원
  const wrap = document.getElementById('csw-' + appId);
  if (wrap) wrap.querySelector('.chat-swipe-inner')?.classList.remove('revealed');

  const modal = document.createElement('div');
  modal.style.cssText = 'position:fixed;inset:0;z-index:3000;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;padding:24px';
  modal.innerHTML = `
    <div style="background:#fff;border-radius:20px;padding:28px 24px;width:100%;max-width:320px;text-align:center">
      <div style="font-size:32px;margin-bottom:12px">💬</div>
      <div style="font-size:17px;font-weight:900;color:#222;margin-bottom:8px">채팅방 나가기</div>
      <div style="font-size:14px;color:#666;line-height:1.6;margin-bottom:24px"><b>${name}</b>님과의 채팅방을<br>나가시겠어요?<br><span style="font-size:12px;color:#bbb">새 메시지가 오면 자동으로 다시 표시됩니다.</span></div>
      <div style="display:flex;gap:10px">
        <button onclick="this.closest('div[style*=fixed]').remove()" style="flex:1;padding:13px;background:#f5f5f5;color:#555;border:none;border-radius:12px;font-size:14px;font-weight:700;cursor:pointer">취소</button>
        <button onclick="leaveChatItem('${appId}');this.closest('div[style*=fixed]').remove()" style="flex:1;padding:13px;background:#ef4444;color:#fff;border:none;border-radius:12px;font-size:14px;font-weight:800;cursor:pointer">나가기</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

function leaveChatItem(appId) {
  const hidden = JSON.parse(localStorage.getItem('baroalba_hidden_chats') || '[]');
  if (!hidden.includes(appId)) hidden.push(appId);
  localStorage.setItem('baroalba_hidden_chats', JSON.stringify(hidden));
  const wrap = document.getElementById('csw-' + appId);
  if (wrap) wrap.remove();
}

// 채팅목록에서 모임/만남 채팅방을 스와이프해서 나가는 경우 - 바로미팅은 실제 참가취소,
// 바로모임은 1:1 채팅과 동일하게 로컬에서만 숨김(새 메시지 오면 다시 보임)
function confirmLeaveGatheringChat(rowId, gatheringId, category, name) {
  const wrap = document.getElementById('csw-' + rowId);
  if (wrap) wrap.querySelector('.chat-swipe-inner')?.classList.remove('revealed');

  const isBaromeet = category === 'baromeeting';
  const modal = document.createElement('div');
  modal.style.cssText = 'position:fixed;inset:0;z-index:3000;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;padding:24px';
  modal.innerHTML = `
    <div style="background:#fff;border-radius:20px;padding:28px 24px;width:100%;max-width:320px;text-align:center">
      <div style="font-size:32px;margin-bottom:12px">${isBaromeet ? '💕' : '🤝'}</div>
      <div style="font-size:17px;font-weight:900;color:#222;margin-bottom:8px">채팅방 나가기</div>
      <div style="font-size:14px;color:#666;line-height:1.6;margin-bottom:24px"><b>${name}</b><br>${isBaromeet ? '나가면 참가 신청이 취소돼요.' : '채팅방을 나가시겠어요?<br><span style="font-size:12px;color:#bbb">새 메시지가 오면 자동으로 다시 표시됩니다.</span>'}</div>
      <div style="display:flex;gap:10px">
        <button onclick="this.closest('div[style*=fixed]').remove()" style="flex:1;padding:13px;background:#f5f5f5;color:#555;border:none;border-radius:12px;font-size:14px;font-weight:700;cursor:pointer">취소</button>
        <button onclick="_leaveGatheringChatConfirmed('${rowId}','${gatheringId}',${isBaromeet});this.closest('div[style*=fixed]').remove()" style="flex:1;padding:13px;background:#ef4444;color:#fff;border:none;border-radius:12px;font-size:14px;font-weight:800;cursor:pointer">나가기</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}
async function _leaveGatheringChatConfirmed(rowId, gatheringId, isBaromeet) {
  if (isBaromeet) await _cancelBaromeetApplication(gatheringId);
  else leaveChatItem(rowId);
  const wrap = document.getElementById('csw-' + rowId);
  if (wrap) wrap.remove();
}

async function openWChat(applicationId, bizName) {
  if (!applicationId) { showToast('채팅을 열 수 없습니다 (ID 없음)'); return; }
  const name = bizName || (window._chatBizNames && window._chatBizNames[applicationId]) || '업주';
  _wchatAppId = applicationId;
  window._wchatCounterpart = { name, photoUrl: null, type: 'business' };
  document.getElementById('wchat-title').textContent = t('chat_with_name').replace('{name}', name);
  document.getElementById('wchat-sub').textContent = '';
  _updateCpHeader('wchat', window._wchatCounterpart);
  const _wo = document.getElementById('wchat-overlay');
  _wo.style.display = 'flex';
  history.pushState({ overlay: 'wchat' }, '');
  document.getElementById('wchat-input').value = '';
  // 상대방(업주) 정보 — 메시지 로드 전에 먼저 fetch (아바타 사진 반영)
  // 같은 상대와 여러 건 지원 시 어느 공고 얘기인지 구분되도록 공고 제목도 같이 표시
  try {
    const { data: _appData } = await db.from('applications').select('job_postings(title,businesses(id,name,photo_url,biz_type,region))').eq('id', applicationId).single();
    const biz = _appData?.job_postings?.businesses;
    const jobTitle = _appData?.job_postings?.title;
    if (_wchatAppId === applicationId) {
      const subEl = document.getElementById('wchat-sub');
      if (subEl) subEl.textContent = jobTitle || '';
    }
    if (biz && _wchatAppId === applicationId) {
      window._wchatCounterpart = { name: biz.name || name, photoUrl: biz.photo_url || null, id: biz.id, bizType: biz.biz_type, region: biz.region, type: 'business' };
      document.getElementById('wchat-title').textContent = t('chat_with_name').replace('{name}', window._wchatCounterpart.name);
      _updateCpHeader('wchat', window._wchatCounterpart);
    }
  } catch(_e2) {}
  try {
    await loadWChatMessages();
    subscribeWChatMessages();
    markWMessagesRead(applicationId).then(() => {
      refreshWorkerChatBadge();
      const b = document.getElementById(`unread-badge-${applicationId}`);
      if (b) b.remove();
    });
  } catch(e) {
    console.error('채팅 로드 실패:', e);
    document.getElementById('wchat-messages').innerHTML = '<div style="text-align:center;color:#e53e3e;font-size:13px;margin-top:40px">채팅을 불러오지 못했습니다<br>잠시 후 다시 시도해주세요</div>';
  }
}

function closeWChat(navigate = true) {
  const wo = document.getElementById('wchat-overlay');
  if (!wo) return;
  wo.style.display = 'none';
  wo.style.paddingBottom = '';
  if (window._clearChatKbOffset) window._clearChatKbOffset();
  // SHOW_FORCED 해제 — 채팅창 닫을 때 키보드도 같이 내림
  if (window.AndroidBridge && window.AndroidBridge.hideKeyboard) {
    window.AndroidBridge.hideKeyboard();
  }
  if (_wchatSub) { try { _wchatSub.unsubscribe(); } catch(e) {} _wchatSub = null; }
  _wchatAppId = null;
  window._wchatCounterpart = null;
  if (navigate) {
    const chatBtn = document.querySelectorAll('.nav-item')[3];
    if (chatBtn) setNav(chatBtn, 'chats');
  }
}


// ── 채팅 메시지 스크롤 (scroll 컨테이너 기준) ─────────────
function scrollChatToBottom(scrollId) {
  var el = document.getElementById(scrollId);
  if (el) el.scrollTop = el.scrollHeight;
}

// ── FCM 토큰 수신 → Supabase 저장 ──
async function _saveFCMToken(token) {
  if (!token || !currentUser || !db) return;
  const uid = currentUser.id;
  const kakaoUid = currentUser.user_metadata?.kakao_uid || currentUser.user_metadata?.provider_id;
  const payload = [{ user_id: uid, token, updated_at: new Date().toISOString() }];
  if (kakaoUid && kakaoUid !== uid) {
    payload.push({ user_id: kakaoUid, token, updated_at: new Date().toISOString() });
  }
  const { error } = await db.from('fcm_tokens').upsert(payload, { onConflict: 'user_id' });
  if (error) showToast('FCM저장실패: ' + (error.message || error.code));
}
window._onFCMToken = function(token) {
  window._pendingFCMToken = token;
  var tries = 0;
  var tryStore = function() {
    if (currentUser && db) {
      _saveFCMToken(token);
    } else if (tries < 20) {
      tries++;
      setTimeout(tryStore, 500);
    }
  };
  tryStore();
};

// ── 키보드 대응 (v202: 네이티브 IME 인셋 브리지) ──
(function() {
  // 네이티브 WebView → JS 브리지: MainActivity가 IME 높이를 dp로 직접 전달
  window._lastKbDp = 0;
  window._kbSendGuard = false;
  window._onNativeKbChange = function(dp) {
    var wo = document.getElementById('wchat-overlay');
    var co = document.getElementById('chat-overlay');
    window._lastKbDp = dp;
    var val = dp > 80 ? (dp + 16) + 'px' : '';
    if (wo && wo.style.display === 'flex') {
      wo.style.paddingBottom = val;
      if (dp > 80) {
        requestAnimationFrame(function() { requestAnimationFrame(function() {
          var sc = document.getElementById('wchat-scroll');
          if (sc) sc.scrollTop = sc.scrollHeight;
        }); });
      }
    }
    if (co && co.style.display === 'flex') {
      co.style.paddingBottom = val;
      if (dp > 80) {
        requestAnimationFrame(function() { requestAnimationFrame(function() {
          var csc = document.getElementById('chat-scroll');
          if (csc) csc.scrollTop = csc.scrollHeight;
        }); });
      }
    }
    // 바로모임/바로미팅 단체채팅 (panel-moim-chat) — wchat/chat과 동일한 네이티브 IME 방식 적용
    var mc = document.getElementById('panel-moim-chat');
    if (mc && mc.classList.contains('show')) {
      mc.style.paddingBottom = dp > 80 ? (dp + 16) + 'px' : '';
      if (dp > 80) {
        requestAnimationFrame(function() { requestAnimationFrame(function() {
          var mm = document.getElementById('moim-chat-messages');
          if (mm) mm.scrollTop = mm.scrollHeight;
        }); });
      }
    }
    // 업체 후기 남기기 바텀시트 (openJobReview) - review-content textarea가 키보드에 가려지던 문제
    var jr = document.getElementById('job-review-overlay');
    if (jr) jr.style.paddingBottom = dp > 80 ? dp + 'px' : '';
    // 범용 바텀시트(openBottomSheet) - 개설요청 등 텍스트 입력이 있는 시트가 키보드에 가리던 문제
    var gbs = document.getElementById('generic-bottom-sheet-overlay');
    if (gbs && gbs.style.display !== 'none') {
      var gbsPanel = document.getElementById('generic-bottom-sheet-panel');
      if (gbsPanel) gbsPanel.style.paddingBottom = dp > 80 ? (dp + 16) + 'px' : '';
    }
    var rm = document.getElementById('rating-modal-inner');
    if (rm) {
      rm.style.paddingBottom = dp > 80 ? (dp + 40) + 'px' : '40px';
      if (dp > 80) {
        requestAnimationFrame(function() {
          var ta = document.getElementById('review-text');
          if (ta) ta.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
      }
    }
    // 지원 메시지 모달 키보드 처리 (네이티브 IME 높이 기반, dp = CSS px)
    var am = document.getElementById('apply-msg-modal');
    var ai = document.getElementById('apply-msg-inner');
    if (am && am.style.display === 'flex' && ai) {
      ai.style.transform = dp > 80 ? 'translateY(-' + dp + 'px)' : '';
      ai.style.maxHeight = dp > 80 ? (window.innerHeight - dp - 60) + 'px' : '';
    }
  };

  // 브라우저 환경 폴백 (WebView 외에서 접속 시)
  // 네이티브 앱에서는 _onNativeKbChange가 이미 정확한 IME 높이를 적용하므로
  // 이 폴백을 같이 실행하면 나중에 실행되는 쪽이 값을 덮어써 패딩이 과도해지는 문제가 있었음
  function applyKbPad(overlayEl) {
    if (window.AndroidBridge) return;
    var baseH = window.innerHeight;
    var baseVV = window.visualViewport ? window.visualViewport.height : baseH;
    var attempts = 0;
    if (overlayEl._kbPoll) clearInterval(overlayEl._kbPoll);
    overlayEl._kbPoll = setInterval(function() {
      attempts++;
      var curH  = window.innerHeight;
      var curVV = window.visualViewport ? window.visualViewport.height : curH;
      var kbH = Math.max(baseH - curH, baseVV - curVV, 0);
      if (kbH > 80) {
        overlayEl.style.paddingBottom = kbH + 'px';
        clearInterval(overlayEl._kbPoll);
        overlayEl._kbPoll = null;
      } else if (attempts > 20) {
        clearInterval(overlayEl._kbPoll);
        overlayEl._kbPoll = null;
      }
    }, 80);
  }

  function clearKbPad(overlayEl) {
    if (overlayEl._kbPoll) { clearInterval(overlayEl._kbPoll); overlayEl._kbPoll = null; }
    setTimeout(function() { overlayEl.style.paddingBottom = ''; }, 200);
  }

  document.addEventListener('DOMContentLoaded', function() {
    var wi = document.getElementById('wchat-input');
    var ci = document.getElementById('chat-input');
    var wo = document.getElementById('wchat-overlay');
    var co = document.getElementById('chat-overlay');
    if (wi && wo) {
      wi.addEventListener('focus', function() { applyKbPad(wo); });
      wi.addEventListener('blur',  function() {
        // 150ms 뒤에도 여전히 포커스를 잃은 경우만 키보드 패딩 제거
        // (메시지 전송 후 즉시 재포커스되면 패딩 유지)
        setTimeout(function() {
          if (document.activeElement !== wi) clearKbPad(wo);
        }, 150);
      });
    }
    if (ci && co) {
      ci.addEventListener('focus', function() { applyKbPad(co); });
      ci.addEventListener('blur',  function() { clearKbPad(co); });
    }
    var mi = document.getElementById('moim-chat-input');
    var mo = document.getElementById('panel-moim-chat');
    if (mi && mo) {
      mi.addEventListener('focus', function() { applyKbPad(mo); });
      mi.addEventListener('blur',  function() { clearKbPad(mo); });
    }
    // 범용 바텀시트(openBottomSheet) 내부는 내용이 동적으로 삽입되므로 위임 방식으로 바인딩
    // (개설요청 등 텍스트 입력 폼이 나중에 추가돼도 항상 커버되도록)
    var gbsPanel = document.getElementById('generic-bottom-sheet-panel');
    if (gbsPanel) {
      gbsPanel.addEventListener('focusin', function(e) {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') applyKbPad(gbsPanel);
      });
      gbsPanel.addEventListener('focusout', function() { clearKbPad(gbsPanel); });
    }
    window.addEventListener('popstate', function() {
      if (co && co.style.display === 'flex') { closeChat(); return; }
      if (wo && wo.style.display === 'flex') { closeWChat(); }
    });
  });

  window._clearChatKbOffset = function() { void 0; };
})();


// ── 내 지원 현황 ──────────────────────────────────────────
async function loadMyApplications() {
  if (isGuest || !currentUser) return;
  const el = document.getElementById('my-applications-list');
  el.innerHTML = '<div style="text-align:center;padding:32px"><div class="spinner"></div></div>';

  const wid = await _getWorkerId();
  if (!wid) {
    el.innerHTML = '<div style="text-align:center;padding:48px 20px;color:#aaa"><div style="font-size:40px;margin-bottom:12px">\u{1F464}</div><div style="font-size:15px;font-weight:700;margin-bottom:6px">알바생 프로필이 없어요</div><div style="font-size:13px;line-height:1.6">공고에 처음 지원하면 프로필이 생성됩니다.<br>지도 탭에서 공고를 찾아 지원해보세요!</div></div>';
    return;
  }

  const { data: apps } = await db.from('applications')
    .select('*, job_postings(title, current_wage, duration_hours, start_time, work_type, work_end_date, work_days, category, address, businesses(name, phone))')
    .eq('worker_id', wid)
    .order('applied_at', { ascending: false });

  _myAppsCache = apps || [];

  // 통계 바 렌더링
  const _statsBar = document.getElementById('app-stats-bar');
  const _statsGrid = document.getElementById('app-stats-grid');
  if (_statsBar && _statsGrid && apps && apps.length) {
    const _total = apps.length;
    const _accepted = apps.filter(a => ['accepted','completed'].includes(a.status)).length;
    const _rate = _total > 0 ? Math.round(_accepted / _total * 100) : 0;
    const _nowM = new Date(); const _thisYM = `${_nowM.getFullYear()}-${String(_nowM.getMonth()+1).padStart(2,'0')}`;
    const _monthEarnings = apps.filter(a => a.status === 'completed' && (a.completed_at||'').startsWith(_thisYM))
      .reduce((s,a) => s + ((a.job_postings?.current_wage||0) * (a.job_postings?.duration_hours||0)), 0);
    const _pending = apps.filter(a => ['pending','reviewing'].includes(a.status)).length;
    const mkStat = (v, lbl, color) =>
      `<div style="background:#fff;border-radius:10px;padding:8px 4px;text-align:center;border:1px solid #f0f0f0">
        <div style="font-size:17px;font-weight:900;color:${color}">${v}</div>
        <div style="font-size:9px;color:#aaa;font-weight:700;margin-top:2px;line-height:1.3">${lbl}</div>
      </div>`;
    _statsGrid.innerHTML =
      mkStat(_total + '건', '총 지원', '#555') +
      mkStat(_pending + '건', '검토중', '#F59E0B') +
      mkStat(_rate + '%', '합격률', '#16a34a') +
      mkStat(_monthEarnings > 0 ? Math.round(_monthEarnings/10000) + '만' : '-', '이달수입', '#3B82F6');
    _statsBar.style.display = 'block';
  }

  if (!apps || !apps.length) {
    el.innerHTML = '<div style="text-align:center;padding:48px 20px;color:#aaa"><div style="font-size:40px;margin-bottom:12px">\u{1F4CB}</div><div style="font-size:15px;font-weight:700">아직 지원한 공고가 없어요</div><div style="font-size:13px;margin-top:6px">지도에서 공고를 찾아 지원해보세요!</div></div>';
    return;
  }

  const STATUS = {
    pending:   { label: '검토중',   color: '#888',    bg: '#f5f5f5' },
    reviewing: { label: '\u{1F50D} 검토중', color: '#F59E0B', bg: '#FFF7ED' },
    accepted:  { label: '✅ 합격',  color: '#16a34a', bg: '#f0fdf4' },
    rejected:  { label: '❌ 탈락',  color: '#dc2626', bg: '#fef2f2' },
    cancelled: { label: '취소됨',   color: '#aaa',    bg: '#f0f0f0' },
    completed: { label: '\u{1F3C1} 완료',  color: '#3B82F6', bg: '#EFF6FF' },
    noshow:    { label: '⚠️ 노쇼', color: '#D97706', bg: '#FEF3C7' },
  };
  const WORK_TYPE = {
    spot:    { label: '스팟',   emoji: '⚡', bg: '#f8f8f8',  color: '#666' },
    short:   { label: '단기',   emoji: '\u{1F4C5}', bg: '#EFF6FF',  color: '#3B82F6' },
    regular: { label: '정기',   emoji: '\u{1F504}', bg: '#F0FDF4',  color: '#16a34a' },
    errand:  { label: '심부름', emoji: '\u{1F3C3}', bg: '#F3E8FF',  color: '#7C3AED' },
  };
  const fmtPhone = p => p ? p.replace(/(\d{3})(\d{3,4})(\d{4})/, '$1-$2-$3') : '';

  el.innerHTML = apps.map(a => {
    const job = a.job_postings || {};
    const biz = job.businesses || {};
    const s  = STATUS[a.status]  || { label: a.status || '검토중', color: '#888', bg: '#f5f5f5' };
    const wt = WORK_TYPE[job.work_type] || WORK_TYPE.spot;
    const cancelDlPassed = a.status === 'accepted' && a.cancel_deadline && new Date(a.cancel_deadline) <= new Date();
    const canCancel  = a.status === 'pending' || a.status === 'reviewing' || (a.status === 'accepted' && !cancelDlPassed);
    const isAccepted = a.status === 'accepted';
    const canChat    = ['pending','reviewing','accepted'].includes(a.status);

    const cancelDlChip = (() => {
      if (a.status !== 'accepted' || !a.cancel_deadline) return '';
      const dl = new Date(a.cancel_deadline);
      const now = new Date();
      if (dl <= now) return '<span style="font-size:11px;color:#EF4444;font-weight:700;background:#FFF0F0;padding:3px 8px;border-radius:8px">취소마감 지남</span>';
      const diffH = Math.floor((dl - now) / 3600000);
      if (diffH < 24) return `<span style="font-size:11px;color:#F59E0B;font-weight:700;background:#FFF7ED;padding:3px 8px;border-radius:8px">⏰ 취소가능 ${diffH}시간 남음</span>`;
      const diffD = Math.ceil(diffH / 24);
      return `<span style="font-size:11px;color:#16a34a;font-weight:700;background:#F0FDF4;padding:3px 8px;border-radius:8px">취소가능 D-${diffD}</span>`;
    })();

    const wageStr = job.current_wage
      ? job.duration_hours
        ? `${job.current_wage.toLocaleString()}원/시 · ${job.duration_hours}시간 (총 ${(job.current_wage * job.duration_hours).toLocaleString()}원 예상)`
        : `${job.current_wage.toLocaleString()}원/시`
      : '';

    const startStr = (() => {
      if (!job.start_time) return '';
      const d = new Date(job.start_time);
      return `${d.getMonth()+1}/${d.getDate()}(${['일','월','화','수','목','금','토'][d.getDay()]}) ${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}`;
    })();
    const workEndStr  = job.work_end_date ? `~${job.work_end_date.slice(5).replace('-','/')}` : '';
    const workDaysStr = job.work_days || '';
    const appliedStr  = a.applied_at ? (() => { const d = new Date(a.applied_at); return `${d.getMonth()+1}/${d.getDate()} 지원`; })() : '';

    // 주소: 시/구 단위까지만 축약
    const addrShort = (() => {
      const addr = job.address || '';
      if (!addr) return '';
      const parts = addr.split(' ');
      return parts.slice(0, Math.min(3, parts.length)).join(' ');
    })();

    return `
    <div onclick="openApplicationJobDetail('${a.job_posting_id}')" style="background:#fff;border-radius:16px;padding:16px;margin-bottom:10px;box-shadow:0 1px 6px rgba(0,0,0,0.05);cursor:pointer">
      <!-- 헤더: 공고 유형 + 상태 -->
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <div style="display:flex;align-items:center;gap:6px">
          <span style="font-size:11px;font-weight:800;padding:3px 8px;border-radius:6px;background:${wt.bg};color:${wt.color}">${wt.emoji} ${wt.label}</span>
          ${job.category ? `<span style="font-size:11px;color:#aaa;font-weight:600">${job.category}</span>` : ''}
        </div>
        <div style="font-size:12px;font-weight:800;color:${s.color};background:${s.bg};padding:3px 10px;border-radius:20px;white-space:nowrap">${s.label}</div>
      </div>

      <!-- 공고명 + 업체명 -->
      <div style="font-size:15px;font-weight:800;color:#222;margin-bottom:2px">${job.title || '공고'}</div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <span style="font-size:13px;color:#666;font-weight:700">${biz.name || ''}</span>
        ${addrShort ? `<span style="font-size:12px;color:#aaa">\u{1F4CD} ${addrShort}</span>` : ''}
      </div>

      <!-- 시급 -->
      <div style="font-size:14px;font-weight:700;color:var(--red);margin-bottom:8px">${wageStr}</div>

      <!-- 날짜/시간 칩 -->
      <div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:6px">
        ${startStr    ? `<span style="font-size:11px;color:#555;font-weight:700;background:#f8f8f8;padding:4px 9px;border-radius:8px">\u{1F550} ${startStr}</span>` : ''}
        ${workEndStr  ? `<span style="font-size:11px;color:#3B82F6;font-weight:700;background:#EFF6FF;padding:4px 9px;border-radius:8px">\u{1F4C5} ${workEndStr}까지</span>` : ''}
        ${workDaysStr ? `<span style="font-size:11px;color:#16a34a;font-weight:700;background:#F0FDF4;padding:4px 9px;border-radius:8px">\u{1F504} ${workDaysStr}</span>` : ''}
        ${appliedStr  ? `<span style="font-size:11px;color:#bbb;font-weight:600;padding:4px 0">\u{1F4CC} ${appliedStr}</span>` : ''}
        ${cancelDlChip}
      </div>

      <!-- 업체 연락처 -->
      ${biz.phone ? `<div style="font-size:12px;color:#888;margin-top:2px">\u{1F4DE} ${fmtPhone(biz.phone)}</div>` : ''}

      <!-- 후기 (완료 공고) -->
      ${a.status === 'completed' ? (() => {
        if (a.employer_rating) {
          const _stars = '★'.repeat(a.employer_rating) + '☆'.repeat(5 - a.employer_rating);
          return `<div onclick="event.stopPropagation()" style="margin-top:10px;background:#FFFBEB;border-radius:10px;padding:10px 12px;border:1px solid #FDE68A">
            <div style="display:flex;align-items:center;justify-content:space-between">
              <span style="font-size:12px;font-weight:700;color:#92400E">내 후기</span>
              <span style="font-size:13px;color:#F59E0B;font-weight:900">${_stars}</span>
            </div>
            ${a.employer_review ? `<div style="font-size:12px;color:#78350F;margin-top:4px;line-height:1.5">"${a.employer_review}"</div>` : ''}
            <button onclick="event.stopPropagation();openJobReview('${a.id}','${(job.title||'').replace(/'/g,"\\'")}','${(biz.name||'').replace(/'/g,"\\'")}',${a.employer_rating||0},'${(a.employer_review||'').replace(/'/g,"\\'")}')" style="margin-top:6px;font-size:11px;color:#92400E;background:none;border:none;text-decoration:underline;cursor:pointer;padding:0">수정</button>
          </div>`;
        }
        return `<button onclick="event.stopPropagation();openJobReview('${a.id}','${(job.title||'').replace(/'/g,"\\'")}','${(biz.name||'').replace(/'/g,"\\'")}',0,'')" style="margin-top:10px;width:100%;padding:10px;background:linear-gradient(135deg,#FFF7ED,#FEF3C7);color:#92400E;border:1.5px solid #FDE68A;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer">⭐ 후기 남기기</button>`;
      })() : ''}
      <!-- 액션 버튼 -->
      ${canChat ? `<button onclick="event.stopPropagation();openWChat('${a.id}','${biz.name||'업주'}')" style="margin-top:10px;width:100%;padding:10px;background:#f0f4ff;color:#3B82F6;border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer">\u{1F4AC} 업주에게 문의하기</button>` : ''}
      ${isAccepted ? `<button id="loc-btn-${a.id}" class="loc-share-btn" onclick="event.stopPropagation();toggleLocationShare('${a.id}',this)">📍 위치 공유 시작</button>` : ''}
      ${canCancel ? `<button onclick="event.stopPropagation();cancelApplication('${a.id}')" style="margin-top:10px;width:100%;padding:10px;background:#FFF0F0;color:#C8102E;border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer">지원 취소</button>` : ''}
    </div>`;
  }).join('');
}

// 마이페이지 - MY 바로알바 미리보기 (지원현황 상세는 alba-detail 서브패널로 이동)
async function loadMyAlbaPreview() {
  const el = document.getElementById('mp-alba-preview');
  const badge = document.getElementById('mp-alba-badge');
  if (!el || !currentUser) return;
  const wid = await _getWorkerId();
  if (!wid) { el.innerHTML = ''; if (badge) badge.textContent = ''; return; }
  const { data: apps } = await db.from('applications')
    .select('id, status, job_postings(title, current_wage)')
    .eq('worker_id', wid).order('applied_at', { ascending: false }).limit(5);
  const statusLabel = { pending:'검토중', reviewing:'검토중', accepted:'합격', rejected:'불합격', completed:'완료', canceled:'취소' };
  const statusColor = { pending:'#F59E0B', reviewing:'#F59E0B', accepted:'#16a34a', rejected:'#94a3b8', completed:'#3b82f6', canceled:'#94a3b8' };
  if (badge) {
    const activeCount = (apps || []).filter(a => ['pending','reviewing','accepted'].includes(a.status)).length;
    badge.textContent = activeCount > 0 ? `진행중 ${activeCount}건` : '';
  }
  if (!apps?.length) { el.innerHTML = '<div style="font-size:12px;color:#bbb;padding:6px 0">아직 지원한 공고가 없어요</div>'; return; }
  el.innerHTML = apps.slice(0, 2).map(a => `
    <div onclick="event.stopPropagation();goToMyApplications()" style="display:flex;justify-content:space-between;align-items:center;background:#fafafa;border-radius:10px;padding:9px 12px;cursor:pointer">
      <div style="min-width:0">
        <div style="font-size:12.5px;font-weight:800;color:#222;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${a.job_postings?.title || '공고'}</div>
        <div style="font-size:11px;color:#999;margin-top:1px">${a.job_postings?.current_wage ? a.job_postings.current_wage.toLocaleString()+'원' : ''}</div>
      </div>
      <span style="flex-shrink:0;font-size:10.5px;font-weight:800;color:${statusColor[a.status]||'#999'}">${statusLabel[a.status]||a.status}</span>
    </div>`).join('');
}

// 마이페이지 - MY 바로모임 미리보기 (실제 참가/신청한 모임을 바로 보여줌)
async function loadMyMoimPreview() {
  const el = document.getElementById('mp-moim-preview');
  if (!el || !currentUser) return;
  const { data: apps } = await db.from('gathering_applications').select('gathering_id').eq('applicant_id', currentUser.id);
  const ids = [...new Set((apps || []).map(a => a.gathering_id))];
  if (!ids.length) { el.innerHTML = '<div style="font-size:12px;color:#bbb;padding:6px 0">아직 참가한 모임이 없어요</div>'; return; }
  const { data: gatherings } = await db.from('gatherings')
    .select('id, title, category, gathering_date').in('id', ids).neq('category', 'baromeeting')
    .order('gathering_date', { ascending: true });
  if (!gatherings?.length) { el.innerHTML = '<div style="font-size:12px;color:#bbb;padding:6px 0">아직 참가한 모임이 없어요</div>'; return; }
  el.innerHTML = gatherings.slice(0, 5).map(g => {
    const dateStr = g.gathering_date ? new Date(g.gathering_date).toLocaleDateString('ko-KR',{month:'short',day:'numeric',weekday:'short'}) : '일정 미정';
    return `<div onclick="event.stopPropagation();openMoimDetail('${g.id}')" style="flex-shrink:0;width:140px;background:#faf5ff;border-radius:10px;padding:10px 12px;cursor:pointer">
      <div style="font-size:12px;font-weight:800;color:#111;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${g.title||'모임'}</div>
      <div style="font-size:10.5px;color:#7C3AED;margin-top:3px">${dateStr}</div>
    </div>`;
  }).join('');
}

// 마이페이지 - MY 바로미팅 미리보기 (실제 참가/신청한 미팅을 바로 보여줌)
async function loadMyBaromeetPreview() {
  const el = document.getElementById('mp-baromeet-preview');
  if (!el || !currentUser) return;
  const { data: apps } = await db.from('gathering_applications').select('gathering_id, status').eq('applicant_id', currentUser.id);
  const statusMap = {};
  (apps || []).forEach(a => { statusMap[a.gathering_id] = a.status; });
  const ids = [...new Set((apps || []).map(a => a.gathering_id))];
  if (!ids.length) { el.innerHTML = '<div style="font-size:12px;color:#bbb;padding:6px 0">아직 참가한 바로미팅이 없어요</div>'; return; }
  const { data: gatherings } = await db.from('gatherings')
    .select('id, title, description, tags, location_name, location_address, gathering_date, baromeeting_male_max, baromeeting_female_max, baromeeting_male_cur, baromeeting_female_cur')
    .in('id', ids).eq('category', 'baromeeting')
    .order('gathering_date', { ascending: true });
  if (!gatherings?.length) { el.innerHTML = '<div style="font-size:12px;color:#bbb;padding:6px 0">아직 참가한 바로미팅이 없어요</div>'; return; }
  el.innerHTML = gatherings.slice(0, 5).map(g => {
    g._myStatus = statusMap[g.id] || null;
    _baromeetListCache[g.id] = g; // openBaromeetDetail()이 참조하는 캐시에 미리 채워둠 (바로만남 패널을 안 거쳐도 상세가 열리도록)
    const dateStr = g.gathering_date ? new Date(g.gathering_date).toLocaleDateString('ko-KR',{month:'short',day:'numeric',weekday:'short'}) : '일정 미정';
    const statusTag = g._myStatus === 'pending' ? ' · 승인대기중' : g._myStatus === 'rejected' ? ' · 거절됨' : '';
    return `<div onclick="event.stopPropagation();openBaromeetDetail('${g.id}')" style="flex-shrink:0;width:140px;background:#fff1f2;border-radius:10px;padding:10px 12px;cursor:pointer">
      <div style="font-size:12px;font-weight:800;color:#111;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${g.title||'바로미팅'}</div>
      <div style="font-size:10.5px;color:#e11d48;margin-top:3px">${dateStr}${statusTag}</div>
    </div>`;
  }).join('');
}

function openMpSub(name) {
  const el = document.getElementById('mpsub-' + name);
  if (!el) return;
  el.classList.add('show');
  if (name === 'income')        loadWorkerIncome();
  if (name === 'foreigner')     loadVisaProfile();
  if (name === 'wage-history')  loadWageHistory();
  if (name === 'gatherings')    loadMyGatheringActivity();
}

// 마이페이지 - 내가 신청한 바로모임/바로미팅 현황 + 공지사항 (둘 다 흩어져 있어 한 곳에서 확인 불가하던 문제)
async function loadMyGatheringActivity() {
  const noticeEl = document.getElementById('mp-gathering-notices');
  const listEl = document.getElementById('mp-gathering-list');
  if (!currentUser) { noticeEl.innerHTML = ''; listEl.innerHTML = '<div style="text-align:center;padding:16px;color:#bbb;font-size:12px">로그인이 필요해요</div>'; return; }

  // 공지사항
  const { data: notices } = await db.from('notifications')
    .select('title, body, created_at').eq('user_id', currentUser.id)
    .order('created_at', { ascending: false }).limit(20);
  if (!notices?.length) {
    noticeEl.innerHTML = '<div style="text-align:center;padding:12px;color:#bbb;font-size:12px">아직 받은 공지가 없어요</div>';
  } else {
    noticeEl.innerHTML = notices.map(n => `
      <div style="background:#F5F3FF;border-radius:12px;padding:12px 14px;margin-bottom:6px">
        <div style="font-size:12.5px;font-weight:800;color:#7C3AED;margin-bottom:3px">${n.title || '공지'}</div>
        <div style="font-size:12px;color:#555;line-height:1.5">${n.body || ''}</div>
        <div style="font-size:10.5px;color:#bbb;margin-top:4px">${new Date(n.created_at).toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})}</div>
      </div>`).join('');
  }

  // 신청 현황 (바로모임 + 바로미팅 공통)
  const { data: apps } = await db.from('gathering_applications')
    .select('gathering_id, status').eq('applicant_id', currentUser.id);
  const gatheringIds = [...new Set((apps || []).map(a => a.gathering_id))];
  const mpVal = document.getElementById('mp-gatherings-val');
  if (!gatheringIds.length) {
    listEl.innerHTML = '<div style="text-align:center;padding:24px;color:#bbb;font-size:12px">아직 신청한 모임/미팅이 없어요</div>';
    if (mpVal) mpVal.textContent = '';
    return;
  }
  if (mpVal) mpVal.textContent = `${gatheringIds.length}건`;

  const { data: gatherings } = await db.from('gatherings')
    .select('id, title, category, gathering_date, status').in('id', gatheringIds);
  const gMap = Object.fromEntries((gatherings || []).map(g => [g.id, g]));
  const statusLabel = { pending: '대기', approved: '확정', rejected: '거절' };
  listEl.innerHTML = apps.map(a => {
    const g = gMap[a.gathering_id];
    if (!g) return '';
    const catLabel = g.category === 'baromeeting' ? '🤝 바로미팅' : '👥 바로모임';
    const dateStr = g.gathering_date ? new Date(g.gathering_date).toLocaleDateString('ko-KR',{month:'short',day:'numeric',weekday:'short'}) : '일정 미정';
    const openFn = g.category === 'baromeeting' ? `openBaromeetChat('${g.id}','${(g.title||'').replace(/'/g,"\\'")}')` : `openMoimDetail('${g.id}')`;
    return `<div onclick="${openFn}" style="background:#fff;border:1px solid #f0f0f0;border-radius:12px;padding:12px 14px;margin-bottom:8px;cursor:pointer">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
        <div style="min-width:0">
          <div style="font-size:10.5px;font-weight:800;color:#7C3AED;margin-bottom:2px">${catLabel}</div>
          <div style="font-size:13px;font-weight:800;color:#111">${g.title || '제목 없음'}</div>
          <div style="font-size:11px;color:#999;margin-top:2px">${dateStr}</div>
        </div>
        <span style="flex-shrink:0;font-size:10px;font-weight:800;padding:3px 8px;border-radius:8px;background:${a.status==='approved'?'#dcfce7':a.status==='rejected'?'#fee2e2':'#f1f5f9'};color:${a.status==='approved'?'#16a34a':a.status==='rejected'?'#dc2626':'#64748b'}">${statusLabel[a.status]||a.status}</span>
      </div>
    </div>`;
  }).join('') || '<div style="text-align:center;padding:24px;color:#bbb;font-size:12px">아직 신청한 모임/미팅이 없어요</div>';
}
function closeMpSub(name) {
  const el = document.getElementById('mpsub-' + name);
  if (el) el.classList.remove('show');
}

function goToMyApplications() {
  document.getElementById('panel-profile')?.classList.remove('show');
  window._fromProfile = true;
  openDashPanel('applications');
}

function openJobReview(appId, jobTitle, bizName, existingRating, existingReview) {
  const overlay = document.createElement('div');
  overlay.id = 'job-review-overlay'; // 키보드 가림 방지(_onNativeKbChange)에서 이 id로 찾아서 패딩 적용
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9500;display:flex;align-items:flex-end';
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };

  let _selectedRating = existingRating || 0;
  const renderStars = () => {
    const starsEl = overlay.querySelector('#review-stars');
    if (!starsEl) return;
    starsEl.innerHTML = [1,2,3,4,5].map(i =>
      `<span onclick="window._reviewSetStar(${i})" style="font-size:36px;cursor:pointer;color:${i<=_selectedRating?'#F59E0B':'#d1d5db'};transition:color 0.15s;user-select:none">${i<=_selectedRating?'★':'☆'}</span>`
    ).join('');
  };
  window._reviewSetStar = (n) => { _selectedRating = n; renderStars(); };

  overlay.innerHTML = `
    <div style="background:#fff;border-radius:24px 24px 0 0;width:100%;padding:24px 20px 40px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
        <div>
          <div style="font-size:17px;font-weight:900;color:#222">⭐ 업체 후기 남기기</div>
          <div style="font-size:12px;color:#aaa;margin-top:2px">${bizName} · ${jobTitle}</div>
        </div>
        <button onclick="this.closest('div[style*=fixed]').remove();delete window._reviewSetStar" style="font-size:22px;color:#aaa;background:none;border:none;cursor:pointer;padding:4px">✕</button>
      </div>
      <div style="text-align:center;margin-bottom:20px">
        <div style="font-size:12px;font-weight:700;color:#aaa;margin-bottom:10px">근무 만족도</div>
        <div id="review-stars" style="display:flex;justify-content:center;gap:6px"></div>
        <div style="font-size:11px;color:#aaa;margin-top:8px" id="review-rating-label">별점을 선택해주세요</div>
      </div>
      <textarea id="review-content" placeholder="근무 환경, 업주 태도, 일의 난이도 등 솔직한 후기를 남겨주세요 (선택)" maxlength="200" style="width:100%;box-sizing:border-box;height:100px;padding:12px 14px;border:1.5px solid #e5e7eb;border-radius:12px;font-size:14px;resize:none;font-family:inherit;line-height:1.6;color:#333">${existingReview||''}</textarea>
      <div style="font-size:11px;color:#bbb;text-align:right;margin-top:4px"><span id="review-char-count">${(existingReview||'').length}</span>/200자</div>
      <button id="review-submit-btn" onclick="window._submitReview('${appId}')" style="margin-top:16px;width:100%;padding:14px;background:${existingRating?'#16a34a':'#e5e7eb'};color:${existingRating?'#fff':'#aaa'};border:none;border-radius:14px;font-size:15px;font-weight:800;cursor:${existingRating?'pointer':'default'}">후기 등록하기</button>
    </div>`;

  document.body.appendChild(overlay);
  renderStars();

  // 키보드 가림 방지 - 브라우저(visualViewport 지원) 폴백. 네이티브 앱은 _onNativeKbChange가 처리
  const _ta0 = overlay.querySelector('#review-content');
  const _jrKbHandler = () => {
    if (!window.visualViewport) return;
    const kbH = Math.max(0, window.innerHeight - window.visualViewport.height);
    overlay.style.paddingBottom = kbH > 80 ? kbH + 'px' : '';
  };
  if (window.visualViewport) window.visualViewport.addEventListener('resize', _jrKbHandler);
  const _jrCleanup = () => { if (window.visualViewport) window.visualViewport.removeEventListener('resize', _jrKbHandler); };
  const _origRemove = overlay.remove.bind(overlay);
  overlay.remove = () => { _jrCleanup(); _origRemove(); };

  // 별점 선택 시 레이블 + 버튼 색 업데이트
  const _LABELS = ['','😢 많이 힘들었어요','😕 아쉬웠어요','😊 보통이에요','😄 좋았어요','🤩 최고였어요!'];
  const origRender = renderStars;
  window._reviewSetStar = (n) => {
    _selectedRating = n;
    const lbl = overlay.querySelector('#review-rating-label');
    if (lbl) lbl.textContent = _LABELS[n] || '';
    const btn = overlay.querySelector('#review-submit-btn');
    if (btn) { btn.style.background = '#16a34a'; btn.style.color = '#fff'; btn.style.cursor = 'pointer'; }
    origRender();
  };

  // 글자수 카운터
  const _ta = overlay.querySelector('#review-content');
  if (_ta) _ta.addEventListener('input', () => {
    const cnt = overlay.querySelector('#review-char-count');
    if (cnt) cnt.textContent = _ta.value.length;
  });
  if (_selectedRating) { window._reviewSetStar(_selectedRating); }

  window._submitReview = async (appId) => {
    if (!_selectedRating) { showToast('별점을 선택해주세요'); return; }
    const content = (overlay.querySelector('#review-content')?.value || '').trim();
    const btn = overlay.querySelector('#review-submit-btn');
    if (btn) { btn.textContent = '저장 중...'; btn.disabled = true; }
    const { error } = await db.from('applications').update({
      employer_rating: _selectedRating,
      employer_review: content || null,
      employer_reviewed_at: new Date().toISOString()
    }).eq('id', appId);
    if (error) { showToast('저장 실패: ' + error.message); if (btn) { btn.textContent = '후기 등록하기'; btn.disabled = false; } return; }
    showToast('✅ 후기가 등록됐어요!');
    overlay.remove();
    delete window._reviewSetStar;
    delete window._submitReview;
    _myAppsCache = null;
    loadMyApplications();
  };
}

async function showMyRatings() {
  if (!currentUser) return;
  const { data: apps } = await db.from('applications')
    .select('id, worker_review, worker_rating, review_reply, worker_review_reply, job_postings(title, businesses(name))')
    .eq('worker_id', (await _getWorkerId()) || '')
    .not('worker_rating', 'is', null)
    .order('completed_at', { ascending: false });

  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9000;display:flex;align-items:flex-end';
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
  const reviews = apps?.filter(a => a.worker_rating) || [];
  overlay.innerHTML = `
    <div style="background:#fff;border-radius:24px 24px 0 0;width:100%;max-height:70vh;overflow-y:auto;padding:20px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
        <div style="font-size:17px;font-weight:900">⭐ 내 평점 리뷰</div>
        <button onclick="this.closest('div[style*=fixed]').remove()" style="font-size:22px;color:#aaa;background:none;border:none;cursor:pointer">✕</button>
      </div>
      ${reviews.length === 0
        ? '<div style="text-align:center;padding:32px;color:#aaa">아직 받은 평점이 없어요</div>'
        : reviews.map(a => `
          <div style="background:#f8f8f8;border-radius:14px;padding:14px;margin-bottom:10px">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
              <div style="font-size:13px;font-weight:800;color:#222">${a.job_postings?.businesses?.name || '업체'} · ${a.job_postings?.title || ''}</div>
              <div style="font-size:14px;font-weight:900;color:#F59E0B">${'★'.repeat(Math.round(a.worker_rating))} ${a.worker_rating?.toFixed(1)}</div>
            </div>
            ${a.worker_review ? `<div style="font-size:13px;color:#555;line-height:1.6">"${a.worker_review}"</div>` : ''}
            ${a.worker_review ? `
              <div style="margin-top:8px;display:flex;justify-content:flex-end">
                <button onclick="openWorkerReviewReplyModal('${a.id}','${(a.job_postings?.businesses?.name||'업체').replace(/'/g,"\\'")}','${(a.worker_review||'').replace(/'/g,"\\'").replace(/\n/g,' ')}','${(a.worker_review_reply||'').replace(/'/g,"\\'").replace(/\n/g,' ')}')"
                  style="font-size:11px;font-weight:700;color:${a.worker_review_reply?'#3b82f6':'#aaa'};background:${a.worker_review_reply?'#eff6ff':'#f5f5f5'};border:none;border-radius:8px;padding:5px 10px;cursor:pointer">
                  ${a.worker_review_reply ? '✏️ 내 답글 수정' : '💬 답글 달기'}
                </button>
              </div>
              ${a.worker_review_reply ? `<div style="margin-top:6px;padding:8px 10px;background:#eff6ff;border-radius:8px;border-left:2px solid #3b82f6;font-size:12px;color:#1e3a8a;line-height:1.5"><span style="font-weight:800">내 답글:</span> ${a.worker_review_reply}</div>` : ''}
            ` : ''}
            ${a.review_reply ? `<div style="margin-top:8px;padding:8px 10px;background:#FEF3C7;border-radius:8px;border-left:2px solid #F59E0B;font-size:12px;color:#92400E;line-height:1.5"><span style="font-weight:800">업체 답글:</span> ${a.review_reply}</div>` : ''}
          </div>`).join('')}
    </div>`;
  document.body.appendChild(overlay);
}

async function openApplicationJobDetail(jobPostingId) {
  if (!jobPostingId) return;
  const panel = document.getElementById('panel-app-job-detail');
  const body  = document.getElementById('ajd-body');
  body.innerHTML = '<div style="text-align:center;padding:48px"><div class="spinner"></div></div>';
  panel.classList.add('show');

  const { data: j } = await db.from('job_postings')
    .select('*, businesses(id, name, rating, kindness_rating, review_count, phone, description, is_verified, photo_url)')
    .eq('id', jobPostingId).single();
  if (!j) { showToast('공고 정보를 불러올 수 없어요'); panel.classList.remove('show'); return; }

  // 내 지원 상태 조회
  let myApp = null;
  if (currentUser && !isGuest) {
    const wid = await _getWorkerId();
    if (wid) {
      const { data: a } = await db.from('applications').select('id,status,cancel_deadline').eq('job_posting_id', jobPostingId).eq('worker_id', wid).single();
      myApp = a;
    }
  }

  const biz = j.businesses || {};
  const fmtDate = iso => { if (!iso) return '미정'; const d = new Date(iso); return `${d.getMonth()+1}/${d.getDate()}(${['일','월','화','수','목','금','토'][d.getDay()]}) ${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}`; };
  const fmtPhone = p => p ? p.replace(/(\d{3})(\d{3,4})(\d{4})/, '$1-$2-$3') : '';

  const wage = (j.current_wage || j.base_wage || 0);
  const isUrgent = j.status === 'urgent';
  const WORK_TYPE = { spot:'⚡ 스팟', short:'\u{1F4C5} 단기', regular:'\u{1F504} 정기', errand:'\u{1F3C3} 심부름' };
  const STATUS_INFO = {
    pending:   { label:'검토중',   color:'#888',    bg:'#f5f5f5' },
    reviewing: { label:'\u{1F50D} 검토중', color:'#F59E0B', bg:'#FFF7ED' },
    accepted:  { label:'✅ 합격',  color:'#16a34a', bg:'#f0fdf4' },
    rejected:  { label:'❌ 탈락',  color:'#dc2626', bg:'#fef2f2' },
    cancelled: { label:'취소됨',   color:'#aaa',    bg:'#f0f0f0' },
    completed: { label:'\u{1F3C1} 완료',  color:'#3B82F6', bg:'#EFF6FF' },
    noshow:    { label:'⚠️ 노쇼', color:'#D97706', bg:'#FEF3C7' },
  };
  const appStatus = myApp ? (STATUS_INFO[myApp.status] || STATUS_INFO.pending) : null;
  const _dlPassed  = myApp?.status === 'accepted' && myApp?.cancel_deadline && new Date(myApp.cancel_deadline) <= new Date();
  const canCancel  = myApp && (myApp.status === 'pending' || myApp.status === 'reviewing' || (myApp.status === 'accepted' && !_dlPassed));
  const isAccepted = myApp && myApp.status === 'accepted';
  const canChat    = myApp && ['pending','reviewing','accepted'].includes(myApp.status);

  body.innerHTML = `
    <div style="padding:0 20px 20px">

      <!-- 공고 상태 -->
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:14px;padding-top:4px;flex-wrap:wrap">
        <span style="font-size:12px;font-weight:800;color:${isUrgent?'#C8102E':'#16a34a'};background:${isUrgent?'#fff0f0':'#f0fdf4'};padding:4px 12px;border-radius:20px">${isUrgent?'\u{1F525} 급구':'모집중'}</span>
        <span style="font-size:12px;font-weight:700;color:#666;background:#f5f5f5;padding:4px 10px;border-radius:20px">${WORK_TYPE[j.work_type]||'스팟'}</span>
        ${j.category ? `<span style="font-size:12px;color:#999;font-weight:600">${j.category}</span>` : ''}
        ${appStatus ? `<span style="font-size:12px;font-weight:800;color:${appStatus.color};background:${appStatus.bg};padding:4px 12px;border-radius:20px;margin-left:auto">${appStatus.label}</span>` : ''}
      </div>

      <!-- 공고명 -->
      <div style="font-size:22px;font-weight:900;color:#111;line-height:1.3;margin-bottom:18px">${j.title}</div>

      <!-- 업체 정보 카드 -->
      <div style="background:#f8f8f8;border-radius:16px;padding:16px;margin-bottom:16px">
        <div style="font-size:11px;color:#aaa;font-weight:700;margin-bottom:10px">업체 정보</div>
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
          ${biz.id ? `<div onclick="_showDetailBizProfile('${biz.id}')" style="cursor:pointer;flex-shrink:0" title="업체 프로필 보기">${_bizAvatarHtml(biz, 40)}</div>` : ''}
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
              <span style="font-size:17px;font-weight:900;color:#222">${biz.name || '업체명 없음'}</span>
              ${biz.is_verified ? '<span style="font-size:10px;font-weight:800;background:#DCFCE7;color:#16a34a;padding:2px 7px;border-radius:8px;white-space:nowrap">✓ 인증</span>' : ''}
            </div>
            ${biz.id && !bizRecord ? `<div style="margin-top:5px"><button id="detail-follow-btn" onclick="_toggleDetailFollow('${biz.id}','${(biz.name||'').replace(/'/g,'')}')" style="padding:4px 14px;border-radius:20px;font-size:12px;font-weight:800;cursor:pointer;border:1.5px solid #e0e0e0;background:#fff;color:#555;transition:all .15s">...</button></div>` : ''}
          </div>
        </div>
        <!-- 평점 -->
        <div style="display:flex;gap:12px;margin-bottom:8px;flex-wrap:wrap">
          <div style="display:flex;align-items:center;gap:4px">
            <span style="font-size:16px">⭐</span>
            <span style="font-size:14px;font-weight:800;color:#F59E0B">${biz.rating ? biz.rating.toFixed(1) : '-'}</span>
            <span style="font-size:12px;color:#aaa">(${biz.review_count || 0}개 리뷰)</span>
          </div>
          ${biz.kindness_rating ? `<div style="display:flex;align-items:center;gap:4px">
            <span style="font-size:14px">\u{1F60A}</span>
            <span style="font-size:13px;font-weight:700;color:#3B82F6">친절도 ${biz.kindness_rating.toFixed(1)}</span>
          </div>` : ''}
        </div>
        <!-- 업체 설명 -->
        ${biz.description ? `<div style="font-size:13px;color:#666;line-height:1.5;margin-bottom:10px;padding:10px;background:#fff;border-radius:10px">${biz.description}</div>` : ''}
        <!-- 전화번호 -->
        ${biz.phone ? `<a href="tel:${biz.phone}" style="display:flex;align-items:center;gap:8px;padding:10px;background:#fff;border-radius:10px;text-decoration:none;color:#222">
          <span style="font-size:18px">\u{1F4DE}</span>
          <div>
            <div style="font-size:11px;color:#aaa;font-weight:700">업체 연락처</div>
            <div style="font-size:14px;font-weight:800;color:#1D4ED8">${fmtPhone(biz.phone)}</div>
          </div>
          <span style="margin-left:auto;font-size:12px;color:#3B82F6;font-weight:700">전화</span>
        </a>` : ''}
      </div>

      <!-- 시급 -->
      <div style="background:linear-gradient(135deg,#fff0f0,#fff8f8);border-radius:16px;padding:16px;margin-bottom:16px">
        <div style="font-size:11px;color:#aaa;font-weight:700;margin-bottom:4px">시급</div>
        <div style="font-size:28px;font-weight:900;color:var(--red)">${wage.toLocaleString()}<span style="font-size:16px">원</span></div>
        ${j.duration_hours ? `<div style="font-size:13px;color:#888;margin-top:4px">· ${j.duration_hours}시간 근무 = 총 <strong style="color:#333">${(wage * j.duration_hours).toLocaleString()}원</strong> 예상</div>` : ''}
        ${j.same_day_payment ? '<div style="font-size:12px;color:#16a34a;font-weight:700;margin-top:6px">\u{1F4B4} 근무 당일 현금 지급</div>' : ''}
      </div>

      <!-- 근무 일정 -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">
        <div style="background:#f8f8f8;border-radius:12px;padding:12px">
          <div style="font-size:11px;color:#aaa;font-weight:700;margin-bottom:4px">근무 시작</div>
          <div style="font-size:13px;font-weight:800;color:#333">${fmtDate(j.start_time)}</div>
        </div>
        <div style="background:#f8f8f8;border-radius:12px;padding:12px">
          <div style="font-size:11px;color:#aaa;font-weight:700;margin-bottom:4px">근무 종료</div>
          <div style="font-size:13px;font-weight:800;color:#333">${(() => { if (!j.start_time || !j.duration_hours) return j.duration_hours ? j.duration_hours + '시간' : '-'; const e = new Date(j.start_time); e.setHours(e.getHours() + j.duration_hours); return fmtDate(e.toISOString()); })()}</div>
        </div>
        <div style="background:#f8f8f8;border-radius:12px;padding:12px">
          <div style="font-size:11px;color:#aaa;font-weight:700;margin-bottom:4px">모집 인원</div>
          <div style="font-size:13px;font-weight:800;color:#333">${j.needed_count ?? 1}명</div>
        </div>
        ${j.work_end_date ? `<div style="background:#EFF6FF;border-radius:12px;padding:12px">
          <div style="font-size:11px;color:#3B82F6;font-weight:700;margin-bottom:4px">모집 마감일</div>
          <div style="font-size:13px;font-weight:800;color:#1E3A8A">~${j.work_end_date.slice(5).replace('-','/')}</div>
        </div>` : ''}
        ${j.work_days ? `<div style="background:#F0FDF4;border-radius:12px;padding:12px;grid-column:1/-1">
          <div style="font-size:11px;color:#16a34a;font-weight:700;margin-bottom:4px">근무 요일</div>
          <div style="font-size:13px;font-weight:800;color:#166534">${j.work_days}</div>
        </div>` : ''}
      </div>

      <!-- 위치 -->
      ${(j.address || (j.lat && j.lng)) ? `<div style="background:#f8f8f8;border-radius:12px;padding:14px;margin-bottom:16px;display:flex;align-items:flex-start;gap:10px">
        <span style="font-size:20px">\u{1F4CD}</span>
        <div style="flex:1">
          <div style="font-size:11px;color:#aaa;font-weight:700;margin-bottom:2px">업체 위치</div>
          <div id="ajd-address-text" style="font-size:14px;font-weight:700;color:#333;line-height:1.6;white-space:pre-wrap">${(j.address && !j.address.includes('위도') && !j.address.includes('경도')) ? j.address : '위치 확인 중...'}</div>
        </div>
      </div>` : ''}

      <!-- 공고 내용 -->
      ${j.description ? `<div style="background:#fffef0;border-radius:12px;padding:14px;margin-bottom:20px;border-left:3px solid #F59E0B">
        <div style="font-size:11px;color:#F59E0B;font-weight:700;margin-bottom:6px">공고 내용</div>
        <div style="font-size:14px;color:#555;line-height:1.6;white-space:pre-wrap">${j.description}</div>
      </div>` : ''}

      <!-- 지원 관련 버튼 -->
      ${canChat ? `<button onclick="openWChat('${myApp.id}','${biz.name||'업주'}')" style="width:100%;padding:14px;background:${isAccepted?'#3B82F6':'#f0f4ff'};color:${isAccepted?'#fff':'#3B82F6'};border:none;border-radius:14px;font-size:15px;font-weight:800;cursor:pointer;margin-bottom:10px">\u{1F4AC} 업주에게 문의하기</button>` : ''}
      ${canCancel ? `<button onclick="cancelApplication('${myApp.id}')" style="width:100%;padding:14px;background:#FFF0F0;color:#C8102E;border:none;border-radius:14px;font-size:15px;font-weight:800;cursor:pointer">지원 취소</button>` : ''}
    </div>`;

  // 역지오코딩: 좌표형 주소 → 행정동 주소
  if (j.lat && j.lng && typeof kakao !== 'undefined' && kakao.maps?.services) {
    const _addrEl = document.getElementById('ajd-address-text');
    if (_addrEl && (!j.address || j.address.includes('위도') || j.address.includes('경도'))) {
      const _gc2 = new kakao.maps.services.Geocoder();
      _gc2.coord2RegionCode(j.lng, j.lat, (res, st) => {
        if (st === kakao.maps.services.Status.OK) {
          const h = res.find(r => r.region_type === 'H') || res[0];
          if (h && _addrEl) _addrEl.textContent = h.address_name || h.region_1depth_name + ' ' + h.region_2depth_name;
        }
      });
    }
  }
}

function showConfirm(message, onOk) {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:4000;display:flex;align-items:center;justify-content:center;padding:24px';
  overlay.innerHTML = `
    <div style="background:#fff;border-radius:18px;padding:24px;width:100%;max-width:300px;text-align:center">
      <div style="font-size:15px;font-weight:700;color:#222;margin-bottom:20px;line-height:1.6">${message}</div>
      <div style="display:flex;gap:10px">
        <button onclick="this.closest('[style*=position]').remove()" style="flex:1;padding:12px;background:#f0f0f0;color:#555;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer">아니오</button>
        <button id="_confirm_ok" style="flex:1;padding:12px;background:#C8102E;color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:800;cursor:pointer">예</button>
      </div>
    </div>`;
  overlay.querySelector('#_confirm_ok').addEventListener('click', () => { overlay.remove(); onOk(); });
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

async function cancelApplication(appId) {
  const { data: appCheck } = await db.from('applications').select('status, cancel_deadline').eq('id', appId).single();
  if (appCheck?.status === 'accepted' && appCheck?.cancel_deadline && new Date(appCheck.cancel_deadline) <= new Date()) {
    showToast('취소 마감일이 지났습니다. 업주에게 직접 연락해주세요.');
    return;
  }
  showConfirm('지원을 취소하시겠어요?', async () => {
    const { data, error } = await db.from('applications')
      .update({ status: 'cancelled' })
      .eq('id', appId)
      .select('id');
    if (error) { showToast('취소 실패: ' + error.message); return; }
    if (!data?.length) {
      // RLS silent failure: 0행 업데이트 → 권한 없음
      showToast('취소 실패: 권한이 없거나 이미 처리됐습니다');
      return;
    }
    showToast('✅ 지원이 취소됐습니다');
    loadMyApplications();
  });
}

// ── 내 지원 서브탭 ────────────────────────────────────────
function switchAppSubtab(tab) {
  const statusEl   = document.getElementById('my-applications-list');
  const bookmarkEl = document.getElementById('my-bookmarks-list');
  const calendarEl = document.getElementById('my-calendar-view');
  const btns = ['subtab-status','subtab-bookmarks','subtab-calendar'].map(id => document.getElementById(id));

  [statusEl, bookmarkEl, calendarEl].forEach(el => { if (el) el.style.display = 'none'; });
  btns.forEach(btn => { if (btn) { btn.style.color = '#bbb'; btn.style.borderBottom = '2.5px solid transparent'; } });

  const activate = (el, btnIdx) => {
    if (el) el.style.display = 'block';
    if (btns[btnIdx]) { btns[btnIdx].style.color = 'var(--red)'; btns[btnIdx].style.borderBottom = '2.5px solid var(--red)'; }
  };

  if (tab === 'status') {
    activate(statusEl, 0);
    loadMyApplications();
  } else if (tab === 'calendar') {
    if (calendarEl) calendarEl.style.display = 'flex';
    if (btns[2]) { btns[2].style.color = 'var(--red)'; btns[2].style.borderBottom = '2.5px solid var(--red)'; }
    if (_myAppsCache) {
      renderAppCalendar();
    } else {
      loadMyApplications().then(() => renderAppCalendar());
    }
  } else {
    activate(bookmarkEl, 1);
    loadBookmarks();
  }
}

// ── 달력 뷰 ──────────────────────────────────────────────
function renderAppCalendar() {
  const el = document.getElementById('my-calendar-view');
  if (!el) return;

  const now = new Date();
  if (_calYear === null) { _calYear = now.getFullYear(); _calMonth = now.getMonth(); }

  const apps = _myAppsCache || [];
  const DAY_IDX = { '일':0, '월':1, '화':2, '수':3, '목':4, '금':5, '토':6 };
  const firstDay = new Date(_calYear, _calMonth, 1);
  const lastDay  = new Date(_calYear, _calMonth + 1, 0);
  const dateMap  = {};

  apps.forEach(a => {
    const job = a.job_postings || {};
    if (!job.start_time) return;
    const startD = new Date(job.start_time);
    const hasWorkDays = job.work_days && job.work_type !== 'spot' && job.work_type !== 'errand';

    if (!hasWorkDays) {
      if (startD.getFullYear() === _calYear && startD.getMonth() === _calMonth) {
        const k = `${_calYear}-${String(_calMonth+1).padStart(2,'0')}-${String(startD.getDate()).padStart(2,'0')}`;
        (dateMap[k] = dateMap[k] || []).push({ status: a.status, title: job.title || '공고', appId: a.job_posting_id });
      }
    } else {
      const wdIdxs = (job.work_days||'').split(',').map(d => DAY_IDX[d.trim()]).filter(x => x !== undefined);
      const rangeStart = new Date(Math.max(startD, firstDay));
      const rangeEnd   = job.work_end_date ? new Date(Math.min(new Date(job.work_end_date), lastDay)) : lastDay;
      for (let cur = new Date(rangeStart); cur <= rangeEnd; cur.setDate(cur.getDate()+1)) {
        if (wdIdxs.includes(cur.getDay())) {
          const k = `${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,'0')}-${String(cur.getDate()).padStart(2,'0')}`;
          (dateMap[k] = dateMap[k] || []).push({ status: a.status, title: job.title || '공고', appId: a.job_posting_id });
        }
      }
    }
  });

  // 이달 완료 수입 합산
  let monthEarnings = 0;
  apps.forEach(a => {
    if (a.status !== 'completed') return;
    const job = a.job_postings || {};
    if (job.current_wage && job.duration_hours) monthEarnings += job.current_wage * job.duration_hours;
  });

  const WEEKDAYS = ['일','월','화','수','목','금','토'];
  const MONTH_NAMES = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
  const firstDow = firstDay.getDay();
  const totalDays = lastDay.getDate();
  const STATUS_COLOR = { pending:'#C8102E', reviewing:'#F59E0B', accepted:'#16a34a', completed:'#3B82F6', rejected:'#d1d5db', cancelled:'#d1d5db', noshow:'#D97706' };

  let cells = '';
  for (let i = 0; i < firstDow; i++) cells += '<div></div>';
  for (let d = 1; d <= totalDays; d++) {
    const k = `${_calYear}-${String(_calMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const da = dateMap[k] || [];
    const isToday = now.getFullYear() === _calYear && now.getMonth() === _calMonth && now.getDate() === d;
    const dow = (firstDow + d - 1) % 7;
    const dots = da.slice(0,3).map(a => `<div style="width:5px;height:5px;border-radius:50%;background:${STATUS_COLOR[a.status]||'#aaa'};flex-shrink:0"></div>`).join('');
    cells += `<div onclick="showCalendarDay('${k}')" style="cursor:${da.length?'pointer':'default'};padding:4px 2px;display:flex;flex-direction:column;align-items:center;gap:3px;border-radius:8px;${isToday?'background:#FFF1F2':''}">
      <div style="font-size:14px;font-weight:${isToday?'900':(da.length?'700':'400')};width:28px;height:28px;display:flex;align-items:center;justify-content:center;border-radius:50%;${isToday?'background:#C8102E;color:#fff':'color:'+(dow===0?'#ef4444':dow===6?'#3B82F6':'#222')}">${d}</div>
      <div style="display:flex;gap:2px;min-height:6px">${dots}</div>
    </div>`;
  }

  el.innerHTML = `
    <div style="width:100%">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
        <button onclick="calNavMonth(-1)" style="background:none;border:none;font-size:22px;color:#666;cursor:pointer;padding:4px 10px;line-height:1">‹</button>
        <div style="font-size:17px;font-weight:900;color:#222">${_calYear}년 ${MONTH_NAMES[_calMonth]}</div>
        <button onclick="calNavMonth(1)" style="background:none;border:none;font-size:22px;color:#666;cursor:pointer;padding:4px 10px;line-height:1">›</button>
      </div>
      ${monthEarnings > 0 ? `<div style="background:#EFF6FF;border-radius:12px;padding:11px 16px;margin-bottom:14px;display:flex;align-items:center;justify-content:space-between"><div style="font-size:12px;font-weight:700;color:#1E40AF">🏁 이달 완료 수입</div><div style="font-size:15px;font-weight:900;color:#1D4ED8">${monthEarnings.toLocaleString()}원</div></div>` : ''}
      <div style="display:grid;grid-template-columns:repeat(7,1fr);margin-bottom:4px">
        ${WEEKDAYS.map((w,i)=>`<div style="text-align:center;font-size:11px;font-weight:700;color:${i===0?'#ef4444':i===6?'#3B82F6':'#aaa'};padding:4px 0">${w}</div>`).join('')}
      </div>
      <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px">${cells}</div>
      <div id="cal-day-detail" style="margin-top:14px"></div>
      <div style="display:flex;gap:14px;margin-top:16px;padding:12px;background:#f9f9f9;border-radius:12px;flex-wrap:wrap">
        <div style="display:flex;align-items:center;gap:5px;font-size:11px;color:#666"><div style="width:8px;height:8px;border-radius:50%;background:#C8102E"></div>검토중</div>
        <div style="display:flex;align-items:center;gap:5px;font-size:11px;color:#666"><div style="width:8px;height:8px;border-radius:50%;background:#16a34a"></div>합격</div>
        <div style="display:flex;align-items:center;gap:5px;font-size:11px;color:#666"><div style="width:8px;height:8px;border-radius:50%;background:#3B82F6"></div>완료</div>
      </div>
    </div>
  `;
}

function calNavMonth(dir) {
  _calMonth += dir;
  if (_calMonth > 11) { _calMonth = 0; _calYear++; }
  if (_calMonth < 0)  { _calMonth = 11; _calYear--; }
  renderAppCalendar();
}

function showCalendarDay(dateKey) {
  const detailEl = document.getElementById('cal-day-detail');
  if (!detailEl) return;
  const [y, m, d] = dateKey.split('-').map(Number);
  const targetDate = new Date(y, m-1, d);
  const dow = targetDate.getDay();
  const DAY_IDX = { '일':0, '월':1, '화':2, '수':3, '목':4, '금':5, '토':6 };
  const DAY_NAME = ['일','월','화','수','목','금','토'];

  const dayApps = (_myAppsCache || []).filter(a => {
    const job = a.job_postings || {};
    if (!job.start_time) return false;
    const startD = new Date(job.start_time);
    const hasWorkDays = job.work_days && job.work_type !== 'spot' && job.work_type !== 'errand';
    if (!hasWorkDays) {
      return startD.getFullYear()===y && startD.getMonth()===m-1 && startD.getDate()===d;
    }
    const wdIdxs = (job.work_days||'').split(',').map(s=>DAY_IDX[s.trim()]).filter(x=>x!==undefined);
    if (!wdIdxs.includes(dow)) return false;
    const sd = new Date(startD.getFullYear(), startD.getMonth(), startD.getDate());
    const ed = job.work_end_date ? new Date(job.work_end_date) : new Date(2099,0,1);
    return targetDate >= sd && targetDate <= ed;
  });

  if (!dayApps.length) { detailEl.innerHTML = ''; return; }

  const STATUS = { pending:{label:'검토중',color:'#C8102E'}, reviewing:{label:'검토중',color:'#F59E0B'}, accepted:{label:'✅ 합격',color:'#16a34a'}, completed:{label:'🏁 완료',color:'#3B82F6'}, rejected:{label:'❌ 탈락',color:'#dc2626'}, cancelled:{label:'취소됨',color:'#aaa'}, noshow:{label:'⚠️ 노쇼',color:'#D97706'} };
  detailEl.innerHTML = `
    <div style="font-size:13px;font-weight:900;color:#222;margin-bottom:8px">${m}/${d}(${DAY_NAME[dow]}) 근무 예정</div>
    ${dayApps.map(a=>{
      const job = a.job_postings||{};
      const s = STATUS[a.status]||{label:a.status,color:'#888'};
      const wage = job.current_wage ? job.current_wage.toLocaleString()+'원/시' : '';
      const hours = job.duration_hours ? job.duration_hours+'시간' : '';
      return `<div onclick="openApplicationJobDetail('${a.job_posting_id}')" style="background:#fff;border-radius:12px;padding:12px 14px;margin-bottom:8px;border:1px solid #f0f0f0;cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:8px">
        <div style="min-width:0"><div style="font-size:14px;font-weight:800;color:#222;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${job.title||'공고'}</div><div style="font-size:12px;color:#aaa;margin-top:2px">${[wage,hours].filter(Boolean).join(' · ')}</div></div>
        <div style="font-size:12px;font-weight:800;color:${s.color};flex-shrink:0">${s.label}</div>
      </div>`;
    }).join('')}`;
}

// ── 북마크 ────────────────────────────────────────────────
async function loadBookmarks() {
  if (isGuest || !currentUser) return;
  const el = document.getElementById('my-bookmarks-list');
  el.innerHTML = '<div style="text-align:center;padding:32px"><div class="spinner"></div></div>';

  const wid = await _getWorkerId();
  if (!wid) {
    el.innerHTML = '<div style="text-align:center;padding:48px 20px;color:#aaa"><div style="font-size:40px;margin-bottom:12px">\u{1F516}</div><div style="font-size:15px;font-weight:700">북마크가 없어요</div></div>';
    return;
  }

  const { data: bookmarks } = await db.from('bookmarks')
    .select('*, job_postings(id, title, current_wage, category, status, businesses(name))')
    .eq('worker_id', wid)
    .order('created_at', { ascending: false });

  if (!bookmarks || !bookmarks.length) {
    el.innerHTML = '<div style="text-align:center;padding:48px 20px;color:#aaa"><div style="font-size:40px;margin-bottom:12px">\u{1F516}</div><div style="font-size:15px;font-weight:700">북마크한 공고가 없어요</div><div style="font-size:13px;margin-top:6px">공고 상세에서 북마크 버튼을 눌러보세요</div></div>';
    return;
  }

  // 재오픈 감지: localStorage 이전 상태와 비교
  const _bmCacheKey = 'baro_bm_status_' + (currentUser?.id || '');
  const _bmPrev = (() => { try { return JSON.parse(localStorage.getItem(_bmCacheKey) || '{}'); } catch(e) { return {}; } })();
  const _bmCurr = {};
  const _reopened = [];
  bookmarks.forEach(bm => {
    const job = bm.job_postings || {};
    if (!job.id) return;
    _bmCurr[job.id] = job.status;
    const prev = _bmPrev[job.id];
    if (prev && prev !== job.status && (job.status === 'open' || job.status === 'urgent')) {
      _reopened.push(job.title || '공고');
    }
  });
  localStorage.setItem(_bmCacheKey, JSON.stringify(_bmCurr));

  // 재오픈 배너 표시
  const _existingBanner = document.getElementById('bm-reopen-banner');
  if (_existingBanner) _existingBanner.remove();
  if (_reopened.length > 0) {
    const _bn = document.createElement('div');
    _bn.id = 'bm-reopen-banner';
    _bn.style.cssText = 'background:#EFF6FF;border:1.5px solid #BFDBFE;border-radius:12px;padding:12px 14px;margin-bottom:12px;display:flex;align-items:flex-start;gap:10px';
    _bn.innerHTML = `<div style="font-size:20px;flex-shrink:0">🔔</div><div style="flex:1"><div style="font-size:13px;font-weight:800;color:#1E40AF">북마크 공고가 다시 열렸어요!</div><div style="font-size:12px;color:#3B82F6;margin-top:3px;line-height:1.5">${_reopened.slice(0,3).join(', ')}${_reopened.length > 3 ? ' 외 ' + (_reopened.length-3) + '개' : ''}</div></div><button onclick="this.closest('#bm-reopen-banner').remove()" style="background:none;border:none;color:#94a3b8;font-size:18px;cursor:pointer;flex-shrink:0;padding:0;line-height:1">✕</button>`;
    el.before(_bn);
  }

  el.innerHTML = bookmarks.map(bm => {
    const job = bm.job_postings || {};
    const biz = job.businesses || {};
    const isOpen = job.status === 'open' || job.status === 'urgent';
    return `
    <div style="background:#fff;border-radius:16px;padding:16px;margin-bottom:10px;box-shadow:0 1px 6px rgba(0,0,0,0.05)">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">
        <div style="flex:1;min-width:0;cursor:pointer" onclick="openDetail('${job.id}')">
          <div style="font-size:15px;font-weight:800;color:#222;margin-bottom:3px">${job.title || '공고'}</div>
          <div style="font-size:13px;color:#888;margin-bottom:4px">${biz.name || ''}</div>
          <div style="font-size:14px;font-weight:700;color:var(--red)">${job.current_wage ? job.current_wage.toLocaleString() + '원/시' : ''}</div>
        </div>
        <button onclick="toggleBookmark('${job.id}')" style="padding:6px 12px;background:#FFF0F0;color:#C8102E;border:none;border-radius:10px;font-size:12px;font-weight:800;cursor:pointer;flex-shrink:0">북마크 해제</button>
      </div>
      <div style="margin-top:8px;font-size:11px;font-weight:700;display:inline-block;padding:3px 8px;border-radius:8px;background:${isOpen ? '#EFF6FF' : '#f0f0f0'};color:${isOpen ? '#3B82F6' : '#aaa'}">${job.status === 'urgent' ? '\u{1F525} 급구' : isOpen ? '모집중' : '마감'}</div>
    </div>`;
  }).join('');
}

async function toggleBookmark(jobId) {
  if (isGuest || !currentUser) { showToast('로그인 후 북마크할 수 있어요'); return; }
  if (!jobId || !isRealJobId(jobId)) { showToast('\u{1F9EA} 테스트 공고는 북마크할 수 없어요'); return; }
  try {
    let wid = await _getWorkerId();
    if (!wid) {
      const meta = currentUser.user_metadata || {};
      const name = meta.full_name || meta.name || currentUser.email?.split('@')[0] || '알바생';
      const { data: created, error: cerr } = await db.from('workers').insert({ kakao_uid: currentUser.id, name }).select('id').maybeSingle();
      if (cerr || !created) { showToast('프로필 생성 실패'); return; }
      window._myWorkerId = created.id;
      wid = created.id;
    }

    const { data: existing } = await db.from('bookmarks')
      .select('id').eq('worker_id', wid).eq('job_posting_id', jobId).maybeSingle();

    if (existing) {
      await db.from('bookmarks').delete().eq('id', existing.id);
      showToast('북마크가 해제됐어요');
      document.getElementById('d-bookmark-btn').textContent = '\u{1F516}';
    } else {
      const { error } = await db.from('bookmarks').insert({ worker_id: wid, job_posting_id: jobId });
      if (error) { showToast('북마크 실패: ' + error.message); return; }
      showToast('\u{1F516} 북마크에 추가됐어요');
      document.getElementById('d-bookmark-btn').textContent = '\u{1F516}✅';
    }
  } catch(e) { showToast('북마크 오류: ' + e.message); }
}

async function checkBookmarkState(jobId) {
  if (isGuest || !currentUser || !isRealJobId(jobId)) return;
  try {
    const wid = await _getWorkerId();
    if (!wid) return;
    const { data: bm } = await db.from('bookmarks')
      .select('id').eq('worker_id', wid).eq('job_posting_id', jobId).maybeSingle();
    document.getElementById('d-bookmark-btn').textContent = bm ? '\u{1F516}✅' : '\u{1F516}';
  } catch(e) {}
}

// ── 공고 키워드 검색 ──────────────────────────────────────
function filterJobsByKeyword(keyword) {
  const q = (keyword || '').trim();
  if (!q) { renderList(); return; }
  const filtered = jobs.filter(j =>
    (j.title || '').includes(q) ||
    (j.biz_name || '').includes(q) ||
    (j.category || '').includes(q)
  );
  const tempJobs = jobs;
  document.getElementById('job-count').textContent = filtered.length;
  const list = document.getElementById('job-cards-container');
  if (filtered.length === 0) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">\u{1F50D}</div><div class="empty-txt">"${q}" 검색 결과가 없어요</div></div>`;
    return;
  }
  jobs = filtered;
  renderList();
  jobs = tempJobs;
}

// ── 한국어/다국어 전환 ─────────────────────────────────────
// TRANSLATIONS, WORK_TYPE_LABELS, t(), tWorkType(), currentLang, _pendingLang,
// selectLang(), saveLang(), applyLang() → shared-lang.js 에서 로드됨

// ── 채팅 아바타 색상 ──────────────────────────────────────
const AVATAR_PALETTE = [
  { bg:'#DBEAFE', fg:'#1D4ED8' },
  { bg:'#D1FAE5', fg:'#065F46' },
  { bg:'#EDE9FE', fg:'#5B21B6' },
  { bg:'#FEF3C7', fg:'#92400E' },
  { bg:'#FCE7F3', fg:'#9D174D' },
  { bg:'#CCFBF1', fg:'#0F766E' },
];
function avatarColor(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h + str.charCodeAt(i)) % AVATAR_PALETTE.length;
  return AVATAR_PALETTE[h];
}

// ── Follow ────────────────────────────────────────────────
window._myFollows = new Set();
window._myWorkerId = null;

async function _getWorkerId() {
  if (window._myWorkerId) return window._myWorkerId;
  if (!currentUser) return null;
  const { data } = await db.from('workers').select('id').eq('kakao_uid', currentUser.id).maybeSingle();
  if (data?.id) window._myWorkerId = data.id;
  return window._myWorkerId;
}

async function _loadMyFollows() {
  if (!currentUser) return;
  try {
    const wid = await _getWorkerId();
    if (!wid) return;
    const { data: rows } = await db.from('follows').select('business_id').eq('worker_id', wid);
    window._myFollows = new Set((rows || []).map(r => r.business_id));
  } catch(e) { console.warn('[follows] load failed:', e); }
}

async function _toggleFollow(businessId, bizName) {
  if (!currentUser) { showToast('로그인이 필요해요'); return; }
  if (!window._myWorkerId) {
    await _loadMyFollows();
    if (!window._myWorkerId) { showToast('알바생 계정에서만 사용할 수 있어요'); return; }
  }
  const isFollowing = window._myFollows.has(businessId);
  try {
    if (isFollowing) {
      await db.from('follows').delete().eq('worker_id', window._myWorkerId).eq('business_id', businessId);
      window._myFollows.delete(businessId);
      showToast(`${bizName} 팔로우를 취소했어요`);
    } else {
      await db.from('follows').insert({ worker_id: window._myWorkerId, business_id: businessId });
      window._myFollows.add(businessId);
      showToast(`${bizName}을 팔로우했어요 🔔`);
    }
    // 프로필 모달 버튼 갱신
    const btn = document.getElementById('follow-modal-btn');
    if (btn) _updateFollowBtn(btn, businessId, bizName);
    // 마이페이지 팔로잉 섹션 갱신
    _renderFollowingSection();
  } catch(e) { showToast('처리 중 오류가 발생했어요'); console.error(e); }
}

function _updateFollowBtn(btn, businessId, bizName) {
  const isFollowing = window._myFollows?.has(businessId);
  btn.textContent = isFollowing ? '✔ 팔로잉' : '+ 팔로우';
  btn.style.background = isFollowing ? '#f0fdf4' : 'var(--red)';
  btn.style.color = isFollowing ? '#16a34a' : '#fff';
  btn.style.borderColor = isFollowing ? '#86efac' : 'var(--red)';
  btn.onclick = () => _toggleFollow(businessId, bizName);
}

async function _toggleDetailFollow(businessId, bizName) {
  if (!currentUser) { showToast('로그인이 필요해요'); return; }
  if (!window._myWorkerId) {
    await _loadMyFollows();
    if (!window._myWorkerId) { showToast('알바생 계정에서만 팔로우할 수 있어요'); return; }
  }
  await _toggleFollow(businessId, bizName);
  // 공고 상세 버튼도 갱신
  const detailBtn = document.getElementById('detail-follow-btn');
  if (detailBtn) _updateFollowBtn(detailBtn, businessId, bizName);
}

function _initDetailFollowBtn(businessId, bizName) {
  const btn = document.getElementById('detail-follow-btn');
  if (!btn) return;
  if (!window._myFollows) {
    _loadMyFollows().then(() => _updateFollowBtn(btn, businessId, bizName));
  } else {
    _updateFollowBtn(btn, businessId, bizName);
  }
}

// 이름 이니셜 아바타 HTML 반환 (소셜 사진 없을 때)
function _initialAvatar(char, size) {
  const c = char || '?';
  const ac = avatarColor(c);
  return `<div style="width:${size}px;height:${size}px;background:${ac.bg};display:flex;align-items:center;justify-content:center;font-size:${Math.round(size*0.42)}px;font-weight:900;color:${ac.fg}">${c}</div>`;
}

// 바로출근 토글
let _availableNow = false;

function _setAvailableNowUI(on) {
  _availableNow = on;
  const dot = document.getElementById('available-now-dot');
  const toggle = document.getElementById('available-now-toggle');
  const thumb = document.getElementById('available-now-thumb');
  const card = document.getElementById('available-now-card');
  if (!dot || !toggle || !thumb) return;
  dot.style.background = on ? '#22c55e' : '#ddd';
  toggle.style.background = on ? '#22c55e' : '#ddd';
  thumb.style.left = on ? '22px' : '2px';
  if (card) card.style.background = on ? '#f0fdf4' : '#f8f8f8';
}

async function toggleAvailableNow() {
  if (!currentUser) return;
  const next = !_availableNow;
  _setAvailableNowUI(next);
  const { error } = await db.from('workers').update({ is_available_now: next }).eq('kakao_uid', currentUser.id);
  if (error) {
    _setAvailableNowUI(!next); // 롤백
    showToast('저장 실패: ' + error.message);
    return;
  }
  showToast(next ? '✅ 바로출근 가능 상태가 됐어요' : '바로출근 상태가 해제됐어요');
}

// 업주 → 알바생 즐겨찾기
window._myFavWorkers = window._myFavWorkers || new Set();

async function _loadFavWorkers() {
  if (!bizRecord?.id) return;
  try {
    const { data } = await db.from('fav_workers').select('worker_id').eq('business_id', bizRecord.id);
    window._myFavWorkers = new Set((data || []).map(r => r.worker_id));
  } catch(e) {}
}

async function _toggleWorkerFav(workerId, workerName) {
  if (!bizRecord?.id) { showToast('업주 계정에서만 사용 가능해요'); return; }
  const isFav = window._myFavWorkers.has(workerId);
  try {
    if (isFav) {
      await db.from('fav_workers').delete().eq('business_id', bizRecord.id).eq('worker_id', workerId);
      window._myFavWorkers.delete(workerId);
      showToast(`${workerName} 즐겨찾기 해제`);
    } else {
      await db.from('fav_workers').insert({ business_id: bizRecord.id, worker_id: workerId });
      window._myFavWorkers.add(workerId);
      showToast(`${workerName} 즐겨찾기 추가`);
    }
    _updateFavWorkerBtn(workerId);
  } catch(e) { showToast('처리 중 오류가 발생했어요'); }
}

function _updateFavWorkerBtn(workerId) {
  const btn = document.getElementById('fav-worker-btn');
  if (!btn) return;
  const isFav = window._myFavWorkers.has(workerId);
  btn.textContent = isFav ? '★ 즐겨찾기' : '☆ 즐겨찾기';
  btn.style.background = isFav ? '#FFF0F0' : '#f5f5f5';
  btn.style.color = isFav ? '#C8102E' : '#555';
  btn.style.borderColor = isFav ? '#C8102E' : '#e0e0e0';
}

async function _renderFollowingSection() {
  const row = document.getElementById('mp-following-row');
  const list = document.getElementById('following-list');
  const cnt = document.getElementById('following-count');
  if (!list) return;
  if (!window._myWorkerId || window._myFollows.size === 0) {
    if (row) row.style.display = 'none'; return;
  }
  if (row) row.style.display = 'flex';
  const bizIds = [...window._myFollows];
  cnt.textContent = `${bizIds.length}개 업체`;
  const { data: bizList } = await db.from('businesses').select('id, name, photo_url, biz_type, region').in('id', bizIds);
  if (!bizList?.length) { if (row) row.style.display = 'none'; return; }
  const mpFollowingVal = document.getElementById('mp-following-val');
  if (mpFollowingVal) mpFollowingVal.textContent = `${bizIds.length}개`;
  list.innerHTML = bizList.map(b => {
    const ac = avatarColor(b.name || '?');
    const avHtml = b.photo_url
      ? `<img src="${b.photo_url}" style="width:44px;height:44px;border-radius:50%;object-fit:cover;flex-shrink:0;border:1.5px solid #eee">`
      : `<div style="width:44px;height:44px;border-radius:50%;background:${ac.bg};display:flex;align-items:center;justify-content:center;font-size:17px;font-weight:900;color:${ac.fg};flex-shrink:0">${(b.name||'?').charAt(0)}</div>`;
    return `<div style="display:flex;align-items:center;gap:12px;background:#fff;border-radius:14px;padding:12px 14px;border:1px solid #f0f0f0">
      ${avHtml}
      <div style="flex:1;min-width:0">
        <div style="font-size:14px;font-weight:800;color:#222">${b.name}</div>
        <div style="font-size:11px;color:#aaa;margin-top:2px">${[b.biz_type, b.region].filter(Boolean).join(' · ') || '업체'}</div>
      </div>
      <button onclick="_toggleFollow('${b.id}','${(b.name||'').replace(/'/g,"\\'")}');_renderFollowingSection()" style="padding:6px 14px;background:#f9f9f9;color:#888;border:1px solid #e0e0e0;border-radius:20px;font-size:12px;font-weight:700;cursor:pointer">취소</button>
    </div>`;
  }).join('');
}

// ── 채팅 목록 ─────────────────────────────────────────────
let _chatTab = 'all';
let _allChats = [], _latestMsg = {}, _unreadCnt = {};

function setChatTab(tab) {
  _chatTab = tab;
  ['all','unread','fav'].forEach(t => {
    const btn = document.getElementById(`chat-tab-${t}`);
    if (!btn) return;
    const on = t === tab;
    btn.style.borderBottom = `2.5px solid ${on ? 'var(--red)' : 'transparent'}`;
    btn.style.color = on ? 'var(--red)' : '#bbb';
    btn.style.fontWeight = on ? '800' : '700';
    btn.style.marginBottom = '-1.5px';
  });
  _renderChatList();
}

function _toggleChatFav(appId, e) {
  e.stopPropagation();
  const favs = JSON.parse(localStorage.getItem('baroalba_chat_favs') || '[]');
  const idx = favs.indexOf(appId);
  if (idx > -1) favs.splice(idx, 1); else favs.push(appId);
  localStorage.setItem('baroalba_chat_favs', JSON.stringify(favs));
  _renderChatList();
}

function _renderChatList() {
  const el = document.getElementById('my-chats-list');
  if (!el) return;
  const favs = JSON.parse(localStorage.getItem('baroalba_chat_favs') || '[]');
  let display = _allChats;
  if (_chatTab === 'unread') display = display.filter(a => (_unreadCnt[a.id] || 0) > 0);
  if (_chatTab === 'fav')    display = display.filter(a => favs.includes(a.id));

  const totalUnread = _allChats.filter(a => (_unreadCnt[a.id] || 0) > 0).length;
  const cntEl = document.getElementById('chat-unread-tab-cnt');
  if (cntEl) { cntEl.textContent = totalUnread; cntEl.style.display = totalUnread > 0 ? 'inline' : 'none'; }

  if (!display.length) {
    const msg = _chatTab === 'fav' ? '즐겨찾기한 채팅이 없어요' : _chatTab === 'unread' ? '읽지 않은 채팅이 없어요' : '아직 대화가 없어요';
    el.innerHTML = `<div style="text-align:center;padding:56px 20px;color:#ccc"><div style="font-size:32px;margin-bottom:12px">${_chatTab==='fav'?'⭐':_chatTab==='unread'?'💬':'🗨️'}</div><div style="font-size:15px;font-weight:700;color:#aaa">${msg}</div></div>`;
    return;
  }

  const _makeChatRow = (a) => {
    const msg = _latestMsg[a.id];
    const unread = _unreadCnt[a.id] || 0;
    const isFav = favs.includes(a.id);
    const isMine = msg.sender_id === currentUser.id;
    const msgDate = new Date(msg.created_at);
    const isToday = msgDate.toDateString() === new Date().toDateString();
    const timeStr = isToday
      ? msgDate.toLocaleTimeString('ko-KR', { hour:'2-digit', minute:'2-digit' })
      : `${msgDate.getMonth()+1}/${msgDate.getDate()}`;
    const ac = avatarColor(a.counterpartName);
    const sz = 46;
    const isGathering = a.side === 'gathering';
    const avatarHtml = isGathering
      ? `<div style="width:${sz}px;height:${sz}px;border-radius:50%;background:${a.gatheringCategory==='baromeeting'?'#F5F3FF':'#EDE9FE'};display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0">${a.gatheringCategory==='baromeeting'?'🤝':'👥'}</div>`
      : a.photoUrl
      ? `<img src="${a.photoUrl}" style="width:${sz}px;height:${sz}px;border-radius:50%;object-fit:cover;flex-shrink:0;border:2px solid #f0f0f0" onerror="this.outerHTML='<div style=\\'width:${sz}px;height:${sz}px;border-radius:50%;background:${ac.bg};display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:900;color:${ac.fg};flex-shrink:0\\'>${a.counterpartName.charAt(0)}</div>'">`
      : `<div style="width:${sz}px;height:${sz}px;border-radius:50%;background:${ac.bg};display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:900;color:${ac.fg};flex-shrink:0">${a.counterpartName.charAt(0)}</div>`;
    const preview = msg.content?.startsWith('[img]') ? '📷 사진' : (isMine ? `나: ${msg.content}` : msg.content);
    // 바로알바(1:1 채팅)는 화이트 유지, 바로모임(퍼플)/바로미팅(로즈)만 카드 색으로 구분
    const rowBg = isGathering
      ? (a.gatheringCategory === 'baromeeting' ? '#ffe4e8' : '#e9e3ff')
      : '#fff';
    const rowBorder = isGathering
      ? (a.gatheringCategory === 'baromeeting' ? '#e11d48' : '#7C3AED')
      : 'transparent';
    return `<div class="chat-swipe-wrap" id="csw-${a.id}">
      <div class="chat-swipe-inner" data-app-id="${a.id}" data-name="${a.counterpartName}" data-side="${a.side}" onclick="_chatItemClick(event,'${a.id}','${a.counterpartName}','${a.side}')" style="gap:12px;padding:11px 16px;background:${unread>0?'#FFFAFA':rowBg};border-left:3.5px solid ${unread>0?'var(--red)':rowBorder}">
        <div style="position:relative;flex-shrink:0">
          ${avatarHtml}
          ${unread>0?`<div style="position:absolute;bottom:0;right:0;width:12px;height:12px;background:var(--red);border-radius:50%;border:2px solid #fff"></div>`:''}
        </div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:2px">
            <div style="font-size:14px;font-weight:${unread>0?'900':'700'};color:${unread>0?'#111':'#222'}">${a.counterpartName}</div>
            <div style="font-size:11px;color:${unread>0?'var(--red)':'#bbb'};font-weight:${unread>0?'700':'400'}">${timeStr}</div>
          </div>
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
            <div style="font-size:12px;color:${unread>0?'#333':'#aaa'};font-weight:${unread>0?'600':'400'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${preview}</div>
            ${unread>0?`<div style="min-width:18px;height:18px;background:var(--red);color:#fff;border-radius:9px;font-size:10px;font-weight:900;display:flex;align-items:center;justify-content:center;padding:0 4px;flex-shrink:0">${unread}</div>`:''}
          </div>
          <div style="font-size:11px;color:#7C3AED;font-weight:600;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${a.title}</div>
        </div>
      </div>
      <button class="chat-fav-btn" onclick="_toggleChatFav('${a.id}',event)">${isFav?'⭐':'☆'}</button>
      ${isGathering
        ? `<button class="chat-leave-btn" onclick="confirmLeaveGatheringChat('${a.id}','${a.gatheringId}','${a.gatheringCategory}','${a.counterpartName.replace(/'/g,"\\'")}')">나가기</button>`
        : `<button class="chat-leave-btn" onclick="confirmLeaveChat('${a.id}','${a.counterpartName.replace(/'/g,"\\'")}')">나가기</button>`}
    </div>`;
  };

  // 즐겨찾기된 것은 상단 섹션으로, 나머지는 그 아래 일반 목록
  const favItems = _chatTab === 'all' ? display.filter(a => favs.includes(a.id)) : [];
  const normalItems = _chatTab === 'all' ? display.filter(a => !favs.includes(a.id)) : display;
  const favSection = favItems.length
    ? `<div style="padding:10px 16px 4px;font-size:11px;font-weight:800;color:#F59E0B;letter-spacing:0.3px">⭐ 즐겨찾기</div>${favItems.map(_makeChatRow).join('')}<div style="height:8px;background:#f7f7f7;margin:4px 0"></div><div style="padding:6px 16px 4px;font-size:11px;font-weight:800;color:#aaa;letter-spacing:0.3px">전체</div>`
    : '';
  el.innerHTML = favSection + normalItems.map(_makeChatRow).join('');

  el.querySelectorAll('.chat-swipe-wrap').forEach(wrap => {
    let sx = 0, sy = 0;
    wrap.addEventListener('touchstart', e => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
    wrap.addEventListener('touchend', e => {
      const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
      if (Math.abs(dx) > Math.abs(dy) * 1.5 && Math.abs(dx) > 36) {
        const inner = wrap.querySelector('.chat-swipe-inner');
        el.querySelectorAll('.chat-swipe-inner.revealed').forEach(o => { if (o !== inner) o.classList.remove('revealed'); });
        inner.classList.toggle('revealed', dx < 0);
      }
    }, { passive: true });
  });
  el.querySelectorAll('.chat-swipe-inner').forEach(inner => {
    let lpTimer, lpStartX, lpStartY, lpFired = false;
    inner.addEventListener('pointerdown', e => { lpFired=false; lpStartX=e.clientX; lpStartY=e.clientY; lpTimer=setTimeout(()=>{lpFired=true;confirmLeaveChat(inner.dataset.appId,inner.dataset.name);},600); });
    inner.addEventListener('pointermove', e => { if(Math.abs(e.clientX-lpStartX)>10||Math.abs(e.clientY-lpStartY)>10)clearTimeout(lpTimer); });
    inner.addEventListener('pointerup', ()=>clearTimeout(lpTimer));
    inner.addEventListener('pointercancel', ()=>clearTimeout(lpTimer));
    inner.addEventListener('click', e => { if(lpFired){e.stopImmediatePropagation();lpFired=false;} });
    inner.addEventListener('contextmenu', e=>e.preventDefault());
  });
  document.addEventListener('click', function(e){
    if(!e.target.closest('.chat-swipe-wrap')) el.querySelectorAll('.chat-swipe-inner.revealed').forEach(i=>i.classList.remove('revealed'));
  }, {once:false,capture:true});
}

async function loadMyChatList() {
  if (isGuest || !currentUser) return;
  const el = document.getElementById('my-chats-list');
  el.innerHTML = '<div style="text-align:center;padding:32px"><div class="spinner"></div></div>';

  const allApps = [], appMap = {};
  const [wid, bizRes] = await Promise.all([
    _getWorkerId(),
    db.from('businesses').select('id').eq('kakao_uid', currentUser.id).maybeSingle()
  ]);

  if (wid) {
    const { data: apps } = await db.from('applications')
      .select('id, job_postings(title, businesses(name, photo_url))')
      .eq('worker_id', wid);
    (apps || []).forEach(a => {
      const obj = { id: a.id, title: a.job_postings?.title || '', counterpartName: a.job_postings?.businesses?.name || '업체', photoUrl: a.job_postings?.businesses?.photo_url || null, side: 'worker' };
      allApps.push(obj); appMap[a.id] = obj;
    });
  }

  const biz = bizRecord || bizRes.data;
  if (biz) {
    const { data: myJobs } = await db.from('job_postings').select('id').eq('business_id', biz.id);
    if (myJobs?.length) {
      const { data: apps } = await db.from('applications')
        .select('id, workers(name, photo_url), job_postings(title)')
        .in('job_posting_id', myJobs.map(j => j.id));
      (apps || []).forEach(a => {
        if (!appMap[a.id]) {
          const obj = { id: a.id, title: a.job_postings?.title || '', counterpartName: a.workers?.name || '지원자', photoUrl: a.workers?.photo_url || null, side: 'owner' };
          allApps.push(obj); appMap[a.id] = obj;
        }
      });
    }
  }

  _latestMsg = {}; _unreadCnt = {};

  if (allApps.length) {
    const { data: messages } = await db.from('messages')
      .select('*').in('application_id', allApps.map(a => a.id))
      .order('created_at', { ascending: false });
    (messages || []).forEach(m => {
      if (!_latestMsg[m.application_id]) _latestMsg[m.application_id] = m;
      if (!m.is_read && m.sender_id !== currentUser.id)
        _unreadCnt[m.application_id] = (_unreadCnt[m.application_id] || 0) + 1;
    });
  }

  // 바로모임/바로미팅 단체채팅도 같은 목록에 포함 - "채팅 메뉴에서 못 찾겠다"는 피드백 반영.
  // gathering_chats는 개인별 읽음여부를 저장하지 않아 안읽음 뱃지는 표시하지 않음
  const { data: myGatherApps } = await db.from('gathering_applications')
    .select('gathering_id').eq('applicant_id', currentUser.id).eq('status', 'approved');
  const gatheringIds = [...new Set((myGatherApps || []).map(a => a.gathering_id))];
  if (gatheringIds.length) {
    const [{ data: gatherings }, { data: gMsgs }] = await Promise.all([
      db.from('gatherings').select('id, title, category').in('id', gatheringIds),
      db.from('gathering_chats').select('*').in('gathering_id', gatheringIds).order('sent_at', { ascending: false }),
    ]);
    const gLatest = {};
    (gMsgs || []).forEach(m => { if (!gLatest[m.gathering_id]) gLatest[m.gathering_id] = m; });
    (gatherings || []).forEach(g => {
      const rowId = 'g_' + g.id;
      const isBaromeeting = g.category === 'baromeeting';
      const obj = {
        id: rowId, gatheringId: g.id, gatheringCategory: g.category,
        title: isBaromeeting ? '🤝 바로미팅' : '👥 바로모임',
        counterpartName: g.title || (isBaromeeting ? '바로미팅' : '바로모임'),
        photoUrl: null, side: 'gathering',
      };
      allApps.push(obj); appMap[rowId] = obj;
      const lm = gLatest[g.id];
      _latestMsg[rowId] = lm
        ? { content: lm.message, created_at: lm.sent_at, sender_id: lm.sender_id }
        : { content: '아직 메시지가 없어요 · 먼저 인사해보세요', created_at: new Date(0).toISOString(), sender_id: null };
    });
  }

  const badge = document.getElementById('chat-unread-badge');
  if (badge) { badge.textContent = '0'; badge.style.display = 'none'; }

  const hiddenChats = JSON.parse(localStorage.getItem('baroalba_hidden_chats') || '[]');
  _allChats = allApps.filter(a => (a.side === 'gathering' || _latestMsg[a.id]) && !hiddenChats.includes(a.id));
  _allChats.sort((a, b) => new Date(_latestMsg[b.id]?.created_at || 0) - new Date(_latestMsg[a.id]?.created_at || 0));
  _renderChatList();
}

function chatListClick(e) {
  const item = e.target.closest('._chat-item');
  if (item) openWChat(item.dataset.appId, item.dataset.bizName);
}

async function loadWChatMessages() {
  const { data } = await db.from('messages')
    .select('*').eq('application_id', _wchatAppId)
    .order('created_at', { ascending: true });
  renderWChatMessages(data || []);
}

function _chatBubble(content, isMine) {
  if (content && content.startsWith('[img]')) {
    const url = content.slice(5);
    return `<img src="${url}" style="max-width:220px;border-radius:12px;display:block;cursor:pointer;border:1px solid #eee" onclick="window.open('${url}','_blank')" loading="lazy">`;
  }
  return `<div style="display:inline-block;max-width:75vw;min-width:2em;padding:10px 14px;border-radius:${isMine?'18px 18px 4px 18px':'18px 18px 18px 4px'};background:${isMine?'var(--red)':'#f0f0f0'};color:${isMine?'#fff':'#222'};font-size:14px;line-height:1.5;word-break:break-word">${content}</div>`;
}

function _bizAvatarHtml(biz, size) {
  const ac = avatarColor(biz.name || '?');
  const initial = (biz.name || '?').charAt(0);
  const photoUrl = biz.photo_url || biz.logo_url;
  if (photoUrl) {
    return `<img src="${photoUrl}" style="width:${size}px;height:${size}px;border-radius:12px;object-fit:cover;border:1.5px solid #eee" onerror="this.outerHTML='<div style=\\'width:${size}px;height:${size}px;border-radius:12px;background:${ac.bg};display:flex;align-items:center;justify-content:center;font-size:${Math.round(size*0.38)}px;font-weight:900;color:${ac.fg}\\'>${initial}</div>'">`;
  }
  return `<div style="width:${size}px;height:${size}px;border-radius:12px;background:${ac.bg};display:flex;align-items:center;justify-content:center;font-size:${Math.round(size*0.38)}px;font-weight:900;color:${ac.fg}">${initial}</div>`;
}

function _showDetailBizProfileById() {
  const avEl = document.getElementById('d-biz-avatar');
  const bizId = avEl?.getAttribute('data-biz-id');
  if (bizId) _showDetailBizProfile(bizId);
}

async function _showDetailBizProfile(bizId) {
  const { data: biz } = await db.from('businesses')
    .select('id, name, biz_type, region, description, rating, review_count, photo_url, is_verified')
    .eq('id', bizId).single();
  if (!biz) { showToast('업체 정보를 불러올 수 없어요'); return; }
  const existing = document.getElementById('cp-profile-modal');
  if (existing) existing.remove();
  const ac = avatarColor(biz.name || '?');
  const avatarBig = biz.photo_url
    ? `<img src="${biz.photo_url}" style="width:72px;height:72px;border-radius:18px;object-fit:cover;border:1.5px solid #eee" onerror="this.style.display='none'">`
    : `<div style="width:72px;height:72px;border-radius:18px;background:${ac.bg};display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:900;color:${ac.fg}">${(biz.name||'?').charAt(0)}</div>`;
  const showFollow = !!window._myWorkerId || !bizRecord;
  const modal = document.createElement('div');
  modal.id = 'cp-profile-modal';
  modal.style.cssText = 'position:fixed;inset:0;z-index:9000;display:flex;align-items:flex-end;background:rgba(0,0,0,0.4)';
  modal.innerHTML = `<div style="width:100%;background:#fff;border-radius:24px 24px 0 0;padding:24px 24px 36px;max-height:80vh;overflow-y:auto" onclick="event.stopPropagation()">
    <div style="width:40px;height:4px;background:#e0e0e0;border-radius:2px;margin:0 auto 20px"></div>
    <div style="display:flex;flex-direction:column;align-items:center;gap:10px;margin-bottom:20px">
      ${avatarBig}
      <div style="font-size:18px;font-weight:900;color:#111">${biz.name}</div>
      <div style="font-size:12px;color:#aaa">업체 · ${biz.biz_type || ''}</div>
      ${showFollow ? `<button id="detail-biz-follow-btn" style="padding:8px 28px;border-radius:24px;font-size:14px;font-weight:800;cursor:pointer;border:1.5px solid #e0e0e0;background:#fff;color:#555">...</button>` : ''}
    </div>
    <div style="font-size:13px;color:#555;line-height:1.7;padding:0 4px">
      ${biz.rating ? `<div style="margin-bottom:8px">⭐ ${biz.rating.toFixed(1)} (${biz.review_count||0}개 리뷰)</div>` : ''}
      ${biz.description ? `<div style="padding:12px;background:#f8f9fa;border-radius:12px">${biz.description}</div>` : ''}
      ${biz.region ? `<div style="margin-top:8px;color:#aaa">📍 ${biz.region}</div>` : ''}
    </div>
  </div>`;
  if (showFollow) {
    const fbtn = modal.querySelector('#detail-biz-follow-btn');
    if (fbtn) {
      if (!window._myFollows) {
        _loadMyFollows().then(() => _updateFollowBtn(fbtn, biz.id, biz.name));
      } else {
        _updateFollowBtn(fbtn, biz.id, biz.name);
      }
    }
  }
  modal.addEventListener('click', () => modal.remove());
  document.body.appendChild(modal);
}

function _cpAvatarHtml(cp, size) {
  if (!cp) return '';
  const ac = avatarColor(cp.name || '?');
  if (cp.photoUrl) {
    return `<img src="${cp.photoUrl}" style="width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;border:1.5px solid #eee" onerror="this.outerHTML='<div style=\\'width:${size}px;height:${size}px;border-radius:50%;background:${ac.bg};display:flex;align-items:center;justify-content:center;font-size:${Math.round(size*0.38)}px;font-weight:900;color:${ac.fg}\\'>${(cp.name||'?').charAt(0)}</div>'">`;
  }
  return `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${ac.bg};display:flex;align-items:center;justify-content:center;font-size:${Math.round(size*0.38)}px;font-weight:900;color:${ac.fg}">${(cp.name||'?').charAt(0)}</div>`;
}

function _updateCpHeader(type, cp) {
  const avEl = document.getElementById(type === 'wchat' ? 'wchat-cp-avatar' : 'chat-cp-avatar');
  if (avEl) avEl.innerHTML = _cpAvatarHtml(cp, 38);
}

async function _showCounterpartProfile(type) {
  const cp = type === 'wchat' ? window._wchatCounterpart : window._chatCounterpart;
  if (!cp) return;
  const existing = document.getElementById('cp-profile-modal');
  if (existing) existing.remove();
  const isWorker = cp.type === 'worker';

  // DB에서 최신 전체 프로필 로드
  if (isWorker && cp.id) {
    try {
      const { data: fw } = await db.from('workers')
        .select('name, photo_url, bio, experience, gender, age, region, skills, vehicles, strengths, languages')
        .eq('id', cp.id).single();
      if (fw) {
        if (fw.photo_url) cp.photoUrl = fw.photo_url;
        cp.selfIntro = fw.bio || cp.selfIntro;
        cp.skills = fw.skills || cp.skills;
        cp.vehicles = fw.vehicles;
        cp.strengths = fw.strengths;
        cp.languages = fw.languages;
        cp.experience = fw.experience;
        if (fw.gender) cp.gender = fw.gender;
        if (fw.age)    cp.age    = fw.age;
        if (fw.region) cp.region = fw.region;
      }
    } catch(e) {}
  } else if (!isWorker && cp.id) {
    // 업주 프로필도 최신 photo_url 로드
    try {
      const { data: fb } = await db.from('businesses')
        .select('photo_url, description, rating, review_count, biz_type, region, is_verified')
        .eq('id', cp.id).single();
      if (fb) {
        if (fb.photo_url) cp.photoUrl = fb.photo_url;
        if (!cp.bizType && fb.biz_type) cp.bizType = fb.biz_type;
        if (!cp.region && fb.region) cp.region = fb.region;
        cp.description = fb.description;
        cp.rating = fb.rating;
        cp.reviewCount = fb.review_count;
      }
    } catch(e) {}
  }
  const ac = avatarColor(cp.name || '?');
  const avatarBig = cp.photoUrl
    ? `<img src="${cp.photoUrl}" style="width:80px;height:80px;border-radius:50%;object-fit:cover;border:2px solid #eee" onerror="this.style.display='none'">`
    : `<div style="width:80px;height:80px;border-radius:50%;background:${ac.bg};display:flex;align-items:center;justify-content:center;font-size:32px;font-weight:900;color:${ac.fg}">${(cp.name||'?').charAt(0)}</div>`;
  const _row = (label, val) => `<div style="display:flex;justify-content:space-between;align-items:flex-start;padding:11px 0;border-bottom:1px solid #f5f5f5"><span style="color:#aaa;font-size:13px;flex-shrink:0">${label}</span><span style="font-size:13px;font-weight:700;color:#222;text-align:right;max-width:65%">${val}</span></div>`;
  const rows = [];
  if (isWorker) {
    // 평점/실적 (가장 중요한 정보 최상단)
    const ratingNum = cp.rating ? parseFloat(cp.rating).toFixed(1) : null;
    const stars = ratingNum ? '★'.repeat(Math.round(cp.rating)) + '☆'.repeat(5 - Math.round(cp.rating)) : null;
    const completedCount = cp.reviewCount || 0;
    const noshowCount = cp.noshowCount || 0;
    const attendRate = completedCount + noshowCount > 0 ? Math.round(completedCount / (completedCount + noshowCount) * 100) : null;
    if (ratingNum) rows.push(_row('평점', `<span style="color:#C8102E">${stars}</span> <span style="color:#888;font-size:12px">${ratingNum}</span>`));
    rows.push(_row('완료 건수', `${completedCount}건${attendRate !== null ? ` · 출근율 ${attendRate}%` : ''}`));
    // 기본 정보
    if (cp.age && cp.age >= 10) rows.push(_row('나이', `${cp.age}세`));
    const genderMap = { M: '남성', F: '여성', male: '남성', female: '여성', 남: '남성', 여: '여성' };
    if (cp.gender) rows.push(_row('성별', genderMap[cp.gender] || cp.gender));
    if (cp.region) rows.push(_row('지역', cp.region));
    if (cp.experience) rows.push(_row('경력', cp.experience));
    if (cp.skills) rows.push(_row('보유 스킬', Array.isArray(cp.skills) ? cp.skills.join(', ') : cp.skills));
    if (cp.strengths && cp.strengths.length) rows.push(_row('강점', Array.isArray(cp.strengths) ? cp.strengths.join(' · ') : cp.strengths));
    if (cp.vehicles && cp.vehicles.length) rows.push(_row('이동수단', Array.isArray(cp.vehicles) ? cp.vehicles.join(', ') : cp.vehicles));
    if (cp.languages && cp.languages.length) rows.push(_row('언어', Array.isArray(cp.languages) ? cp.languages.join(', ') : cp.languages));
    if (cp.selfIntro) rows.push(`<div style="padding:12px 0;border-bottom:1px solid #f5f5f5"><div style="color:#aaa;font-size:13px;margin-bottom:6px">자기소개</div><div style="font-size:13px;color:#333;line-height:1.6">${cp.selfIntro}</div></div>`);
  } else {
    const bizRatingNum = cp.rating ? parseFloat(cp.rating).toFixed(1) : null;
    if (bizRatingNum) {
      const bizStars = '★'.repeat(Math.round(cp.rating)) + '☆'.repeat(5 - Math.round(cp.rating));
      rows.push(_row('평점', `<span style="color:#C8102E">${bizStars}</span> <span style="color:#888;font-size:12px">${bizRatingNum}</span>`));
    }
    if (cp.reviewCount) rows.push(_row('리뷰', `${cp.reviewCount}건`));
    if (cp.bizType) rows.push(_row('업종', cp.bizType));
    if (cp.region) rows.push(_row('지역', cp.region));
    if (cp.description) rows.push(`<div style="padding:12px 0;border-bottom:1px solid #f5f5f5"><div style="color:#aaa;font-size:13px;margin-bottom:6px">업체 소개</div><div style="font-size:13px;color:#333;line-height:1.6">${cp.description}</div></div>`);
  }
  const modal = document.createElement('div');
  modal.id = 'cp-profile-modal';
  modal.style.cssText = 'position:fixed;inset:0;z-index:9000;display:flex;align-items:flex-end;background:rgba(0,0,0,0.4)';
  const showFollowBtn = !isWorker && cp.id && !bizRecord; // 알바생이 업주 프로필 볼 때만
  const showFavBtn = isWorker && cp.id && !!bizRecord; // 업주가 알바생 프로필 볼 때 즐겨찾기
  const followBtnHtml = showFollowBtn ? `<button id="follow-modal-btn" style="padding:8px 28px;border-radius:24px;font-size:14px;font-weight:800;cursor:pointer;border:1.5px solid;transition:all 0.15s"></button>` : '';
  const favBtnHtml = showFavBtn ? `<button id="fav-worker-btn" onclick="_toggleWorkerFav('${cp.id}','${cp.name}')" style="padding:8px 24px;border-radius:24px;font-size:14px;font-weight:800;cursor:pointer;border:1.5px solid #e0e0e0;background:#f5f5f5;color:#555;transition:all 0.15s">즐겨찾기</button>` : '';
  modal.innerHTML = `<div style="width:100%;background:#fff;border-radius:24px 24px 0 0;padding:24px 24px 36px;max-height:80vh;overflow-y:auto" onclick="event.stopPropagation()">
    <div style="width:40px;height:4px;background:#e0e0e0;border-radius:2px;margin:0 auto 20px"></div>
    <div style="display:flex;flex-direction:column;align-items:center;gap:10px;margin-bottom:20px">
      ${avatarBig}
      <div style="font-size:18px;font-weight:900;color:#111">${cp.name}</div>
      <div style="font-size:12px;color:#aaa">${isWorker ? '알바지원자' : '업체'}</div>
      ${followBtnHtml}${favBtnHtml}
    </div>
    ${rows.length ? `<div style="margin-top:4px">${rows.join('')}</div>` : '<div style="text-align:center;color:#ccc;font-size:13px;padding:16px 0">등록된 추가 정보가 없어요</div>'}
  </div>`;
  if (showFollowBtn) {
    const btn = document.getElementById('follow-modal-btn');
    _updateFollowBtn(btn, cp.id, cp.name);
  }
  if (showFavBtn) _updateFavWorkerBtn(cp.id);
  modal.addEventListener('click', () => modal.remove());
  document.body.appendChild(modal);
}

function _chatMsgRow(m, isMine, time, cp, type) {
  const bubble = _chatBubble(m.content, isMine);
  if (isMine) {
    return `<div style="display:flex;flex-direction:column;align-items:flex-end;gap:2px;width:100%">
      ${bubble}
      <div style="font-size:10px;color:#bbb">${time}${m.is_read ? ' · 읽음' : ''}</div>
    </div>`;
  }
  const avatar = cp ? `<div onclick="_showCounterpartProfile('${type}')" style="cursor:pointer;flex-shrink:0;align-self:flex-end">${_cpAvatarHtml(cp, 34)}</div>` : '';
  return `<div style="display:flex;flex-direction:column;align-items:flex-start;gap:2px;width:100%">
    <div style="display:flex;align-items:flex-end;gap:8px;max-width:85%;min-width:0;width:100%">
      ${avatar}
      <div style="flex:1;min-width:0">
        ${cp ? `<div style="font-size:11px;font-weight:700;color:#777;margin-bottom:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${cp.name}</div>` : ''}
        ${bubble}
      </div>
    </div>
    <div style="font-size:10px;color:#bbb;padding-left:${cp?42:0}px">${time}</div>
  </div>`;
}

function renderWChatMessages(msgs) {
  const el = document.getElementById('wchat-messages');
  if (!msgs.length) {
    el.innerHTML = '<div style="text-align:center;color:#aaa;font-size:13px;margin-top:40px">아직 메시지가 없어요<br>업주에게 궁금한 점을 남겨보세요 ✉️</div>';
    return;
  }
  el.innerHTML = msgs.map(m => {
    const isMine = m.sender_id === currentUser?.id;
    const time = new Date(m.created_at).toLocaleTimeString('ko-KR', { hour:'2-digit', minute:'2-digit' });
    return _chatMsgRow(m, isMine, time, isMine ? null : window._wchatCounterpart, 'wchat');
  }).join('');
  const sc = document.getElementById('wchat-scroll');
  if (sc) sc.scrollTop = sc.scrollHeight;
}

function subscribeWChatMessages() {
  if (_wchatSub) _wchatSub.unsubscribe();
  _wchatSub = db.channel('wchat-' + _wchatAppId)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages',
      filter: `application_id=eq.${_wchatAppId}` }, payload => {
      const el = document.getElementById('wchat-messages');
      const msg = payload.new;
      const isMine = msg.sender_id === currentUser?.id;
      const time = new Date(msg.created_at).toLocaleTimeString('ko-KR', { hour:'2-digit', minute:'2-digit' });
      const div = document.createElement('div');
      div.innerHTML = _chatMsgRow(msg, isMine, time, isMine ? null : window._wchatCounterpart, 'wchat');
      el.appendChild(div.firstElementChild || div);
      const sc = document.getElementById('wchat-scroll');
      if (sc) sc.scrollTop = sc.scrollHeight;
      if (!isMine) markWMessagesRead(_wchatAppId);
      if (isMine) {
        if (window.AndroidBridge?.setScrollKbGuard) window.AndroidBridge.setScrollKbGuard(false);
        const _wo = document.getElementById('wchat-overlay');
        if (_wo && _wo.style.display === 'flex' && window._lastKbDp > 80) {
          _wo.style.paddingBottom = (window._lastKbDp + 16) + 'px';
        }
        requestAnimationFrame(() => { requestAnimationFrame(() => {
          const sc = document.getElementById('wchat-scroll');
          if (sc) sc.scrollTop = sc.scrollHeight;
        }); });
        if (!window.AndroidBridge) {
          setTimeout(() => { const inp = document.getElementById('wchat-input'); if (inp) inp.focus(); }, 100);
        }
      }
    }).subscribe();
}

function toggleMediaPanel(prefix) {
  const panel = document.getElementById(prefix + '-media-panel');
  const btn   = document.getElementById(prefix + '-plus-btn');
  const isOpen = panel.style.display !== 'none';
  panel.style.display = isOpen ? 'none' : 'block';
  btn.style.transform = isOpen ? '' : 'rotate(45deg)';
  btn.style.background = isOpen ? '#f0f0f0' : '#e8e8e8';
}
function closeMediaPanel(prefix) {
  const panel = document.getElementById(prefix + '-media-panel');
  const btn   = document.getElementById(prefix + '-plus-btn');
  if (panel) { panel.style.display = 'none'; }
  if (btn)   { btn.style.transform = ''; btn.style.background = '#f0f0f0'; }
}

async function uploadChatImage(file) {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const path = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await db.storage.from('chat-images').upload(path, file, { contentType: file.type || 'image/jpeg' });
  if (error) throw error;
  const { data } = db.storage.from('chat-images').getPublicUrl(path);
  return data.publicUrl;
}

let _pendingWChatFiles = [];
let _pendingChatFiles = [];

function sendWChatImage(inputEl) {
  const files = Array.from(inputEl.files || []).filter(f => f.size <= 10 * 1024 * 1024);
  if (inputEl.files.length && !files.length) { showToast('10MB 이하 이미지만 전송 가능합니다'); }
  inputEl.value = '';
  closeMediaPanel('wchat');
  if (!files.length) return;
  _pendingWChatFiles = files;
  const bar = document.getElementById('wchat-img-preview-bar');
  const thumb = document.getElementById('wchat-img-preview-thumb');
  thumb.src = URL.createObjectURL(files[0]);
  _setImgPreviewCountBadge('wchat', files.length);
  bar.style.display = 'flex';
}

function cancelWChatImage() {
  _pendingWChatFiles = [];
  document.getElementById('wchat-img-preview-bar').style.display = 'none';
}

function sendChatImage(inputEl) {
  const files = Array.from(inputEl.files || []).filter(f => f.size <= 10 * 1024 * 1024);
  if (inputEl.files.length && !files.length) { showToast('10MB 이하 이미지만 전송 가능합니다'); }
  inputEl.value = '';
  closeMediaPanel('chat');
  if (!files.length) return;
  _pendingChatFiles = files;
  const bar = document.getElementById('chat-img-preview-bar');
  const thumb = document.getElementById('chat-img-preview-thumb');
  thumb.src = URL.createObjectURL(files[0]);
  _setImgPreviewCountBadge('chat', files.length);
  bar.style.display = 'flex';
}

function cancelChatImage() {
  _pendingChatFiles = [];
  document.getElementById('chat-img-preview-bar').style.display = 'none';
}

// 여러 장 선택 시 미리보기 썸네일 위에 "+N" 뱃지 표시 (미리보기 자체는 1장만 보여주고
// 실제 전송은 선택한 장수만큼 순서대로 개별 메시지로 전송됨)
function _setImgPreviewCountBadge(prefix, count) {
  const thumbWrap = document.getElementById(prefix + '-img-preview-thumb')?.parentElement;
  if (!thumbWrap) return;
  let badge = document.getElementById(prefix + '-img-preview-count');
  if (count <= 1) { if (badge) badge.remove(); return; }
  if (!badge) {
    badge = document.createElement('div');
    badge.id = prefix + '-img-preview-count';
    badge.style.cssText = 'position:absolute;top:-6px;right:-6px;background:var(--red);color:#fff;font-size:10px;font-weight:900;border-radius:10px;padding:2px 6px;line-height:1.2';
    thumbWrap.style.position = thumbWrap.style.position || 'relative';
    thumbWrap.appendChild(badge);
  }
  badge.textContent = `+${count - 1}`;
}

async function _uploadAndSendWChatImage() {
  const files = _pendingWChatFiles;
  _pendingWChatFiles = [];
  document.getElementById('wchat-img-preview-bar').style.display = 'none';
  showToast(files.length > 1 ? `이미지 ${files.length}장 전송 중...` : '이미지 전송 중...');
  for (const file of files) {
    try {
      const url = await uploadChatImage(file);
      await _doSendWChat('[img]' + url);
    } catch(e) { showToast('이미지 전송 실패'); }
  }
}

async function _uploadAndSendChatImage() {
  const files = _pendingChatFiles;
  _pendingChatFiles = [];
  document.getElementById('chat-img-preview-bar').style.display = 'none';
  showToast(files.length > 1 ? `이미지 ${files.length}장 전송 중...` : '이미지 전송 중...');
  for (const file of files) {
    try {
      const url = await uploadChatImage(file);
      await _doSendChat('[img]' + url);
    } catch(e) { showToast('이미지 전송 실패'); }
  }
}

async function _doSendWChat(content) {
  if (!content || !_wchatAppId) return;
  const { error: _wsendErr } = await db.from('messages').insert({ application_id: _wchatAppId, sender_id: currentUser.id, content });
  if (_wsendErr) { showToast('메시지 전송 실패: ' + _wsendErr.message); return; }
  try {
    const { data: ad } = await db.from('applications')
      .select('job_postings(businesses(kakao_uid))').eq('id', _wchatAppId).single();
    const ownerUid = ad?.job_postings?.businesses?.kakao_uid;
    if (ownerUid) {
      const ch = db.channel(`owner-${ownerUid}-notify`);
      ch.subscribe(status => {
        if (status === 'SUBSCRIBED') {
          ch.send({ type:'broadcast', event:'new_msg', payload:{ application_id:_wchatAppId, content, sender_id:currentUser.id } });
          setTimeout(() => ch.unsubscribe(), 1500);
        }
      });
      const senderName = currentUser?.user_metadata?.full_name || currentUser?.user_metadata?.name || '알바생';
      const pushBody = content.startsWith('[img]') ? '📷 이미지를 보냈습니다' : (content.length > 40 ? content.slice(0,40)+'…' : content);
      fetch('/api/send-push', { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ user_id:ownerUid, title:`${senderName}님으로부터 메시지`, body:pushBody, url:'/바로알바.html?chat='+_wchatAppId+'&view=owner', app_id:_wchatAppId, type:'chat' })
      }).catch(()=>{});
    }
  } catch(e) {}
}

const _BAD_PATTERNS = [
  /씨[바발벌빨팔]/,/시[바발벌빨팔]/,/ㅅ[ㅂㅃ]/,/ㅆ[ㅂㅃ]/,
  /개새끼|개색끼|개쌔끼/,
  /병신/,/지랄/,/존나|졸라|존내/,
  /창녀|보지|자지|섹스|야동/,
  /살인|살해|죽여|죽이|칼부림|폭행|협박|강간|성폭|납치|테러/,
  /불법|마약|대마|필로폰|히로뽕|도박|총기/,
];
function _hasBadWord(text) {
  // 원본 검사 + 공백/숫자/특수문자 제거 후 재검사 (창1녀, 섹 스 등 우회 차단)
  const normalized = text.replace(/[\s\d\W_]+/g, '');
  return _BAD_PATTERNS.some(p => p.test(text) || p.test(normalized));
}

async function sendWChatMessage() {
  if (_pendingWChatFiles.length) { await _uploadAndSendWChatImage(); return; }
  const input = document.getElementById('wchat-input');
  const content = input.value.trim();
  if (!content || !_wchatAppId) return;
  if (_hasBadWord(content)) { showToast('비속어가 포함된 메시지는 전송할 수 없어요'); return; }
  input.value = '';
  input.focus();
  if (window.AndroidBridge?.showKeyboard && window._lastKbDp < 80) window.AndroidBridge.showKeyboard();
  if (window.AndroidBridge?.setScrollKbGuard) window.AndroidBridge.setScrollKbGuard(true);
  _doSendWChat(content).catch(() => {});
}


async function markWMessagesRead(appId) {
  const { data, error } = await db.from('messages').update({ is_read: true })
    .eq('application_id', appId).neq('sender_id', currentUser?.id || '').select('id');
  if (error) console.error('[markWMessagesRead] update failed:', error.message);
  else if (!data?.length) console.warn('[markWMessagesRead] 0 rows updated (RLS 정책이 막고 있을 수 있음) appId=', appId);
}

// 공고 상세 열 때 이미 지원했으면 채팅 버튼으로
async function checkAlreadyApplied(jobId) {
  if (!currentUser || isGuest || !isRealJobId(jobId)) return;
  try {
    const wid = await _getWorkerId();
    if (!wid) return;
    const { data: app, error: ae } = await db.from('applications')
      .select('id, status, biz_rating').eq('job_posting_id', jobId).eq('worker_id', wid).single();
    if (ae && ae.code !== 'PGRST116') console.error('checkAlreadyApplied: 지원 조회 실패', ae);
    // 취소된 지원은 "이미 지원한 상태"로 취급하지 않음 - 재지원 가능해야 함
    if (app && app.status !== 'cancelled') {
      showAppliedState(app.id);
      // 근무 완료 + 아직 평점 없으면 평점 버튼 표시
      const rateRow = document.getElementById('d-rate-row');
      if (rateRow) {
        if (app.status === 'completed' && !app.biz_rating) {
          rateRow.style.display = 'block';
          document.getElementById('d-rate-btn').dataset.appId = app.id;
        } else if (app.status === 'completed' && app.biz_rating) {
          rateRow.style.display = 'block';
          const btn = document.getElementById('d-rate-btn');
          btn.textContent = '⭐ 평점 ' + app.biz_rating + '점 남김';
          btn.style.background = '#f0fdf4'; btn.style.color = '#16a34a'; btn.onclick = null; btn.style.cursor = 'default';
        } else {
          rateRow.style.display = 'none';
        }
      }
    }
  } catch(e) { console.error('checkAlreadyApplied:', e); }
}

// ── 내 위치로 이동 ────────────────────────────────────────
function moveToMyLocation(silent = false) {
  if (!navigator.geolocation) { if (!silent) showToast('위치 정보를 사용할 수 없습니다'); return; }
  // 기존 추적 중단 후 재시작
  if (_locationWatchId !== null) { navigator.geolocation.clearWatch(_locationWatchId); _locationWatchId = null; }
  let firstFix = true;
  _locationWatchId = navigator.geolocation.watchPosition(pos => {
    window._myLat = pos.coords.latitude;
    window._myLng = pos.coords.longitude;
    const latlng = new kakao.maps.LatLng(pos.coords.latitude, pos.coords.longitude);
    setMyLocationMarker(latlng);
    if (firstFix) {
      firstFix = false;
      saveMapCenter(pos.coords.latitude, pos.coords.longitude);
      kakaoMap.setCenter(latlng);
      loadJobs();
    }
  }, () => {
    if (!silent) showToast('위치 권한이 필요합니다');
  }, { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 });
}

function stopLocationWatch() {
  if (_locationWatchId !== null) { navigator.geolocation.clearWatch(_locationWatchId); _locationWatchId = null; }
  if (myLocationOverlay) { myLocationOverlay.setMap(null); myLocationOverlay = null; }
}

function setMyLocationMarker(latlng) {
  if (myLocationOverlay) { myLocationOverlay.setMap(null); myLocationOverlay = null; }
  const wrap = document.createElement('div');
  wrap.style.cssText = 'width:26px;height:35px;display:flex;align-items:center;justify-content:center';
  const img = document.createElement('img');
  img.src = './icons/marker-logo.png';
  img.style.cssText = 'width:26px;height:35px;object-fit:contain;pointer-events:none';
  wrap.appendChild(img);
  myLocationOverlay = new kakao.maps.CustomOverlay({ position: latlng, content: wrap, yAnchor: 0.5, zIndex: 10 });
  myLocationOverlay.setMap(kakaoMap);
}

// ── 필터 ─────────────────────────────────────────────────
// ── 복수 필터 선택 ─────────────────────────────────────────
const _CAT_LABEL = {'F&B':'F&B','물류':'운송/물류','판매':'판매','청소':'청소','이벤트':'이벤트','커플알바':'커플알바','컨텐츠':'촬영','챌린지':'챌린지','이사도우미':'이사','운반/짐 이동':'운반','퀵배달':'퀵','청소 대행':'청소대행','__errand__':'심부름'};
const _TYPE_LABEL = {'regular':'정기','short':'단기','spot':'스팟','errand':'심부름'};
const _WT_MAP = {'__regular__':'regular','__short__':'short','__spot__':'spot','__errand__':'errand'};

let _lessonFilterMains = new Set(); // 지도 필터: 선택된 메인(레슨/과외)
let _lessonFilterMids  = new Set(); // 지도 필터: 선택된 중간카테고리
let includeTechnical = false;       // 전문기술 필터 활성화
let _technicalFilterMids = new Set(); // 선택된 전문기술 leaf 카테고리

function _syncCatBtn() {
  const btn = document.getElementById('flt-cat-btn');
  if (!btn) return;
  const total = selectedCategories.size;
  if (total === 0) { btn.textContent = t('filter_cat') + ' ▾'; btn.classList.remove('sel'); }
  else if (total === 1) {
    const cat = _CAT_LABEL[[...selectedCategories][0]] || [...selectedCategories][0];
    btn.textContent = cat + ' ✓'; btn.classList.add('sel');
  } else { btn.textContent = `${t('filter_cat')} ${total}✓`; btn.classList.add('sel'); }
}
function _syncTechnicalBtn() {
  const btn = document.getElementById('flt-technical-btn');
  if (!btn) return;
  if (!includeTechnical) { btn.textContent = t('filter_technical') + ' ▾'; btn.classList.remove('sel'); return; }
  const n = _technicalFilterMids.size;
  if (n === 0) { btn.textContent = t('filter_technical') + ' ✓'; btn.classList.add('sel'); }
  else if (n === 1) { btn.textContent = [..._technicalFilterMids][0] + ' ✓'; btn.classList.add('sel'); }
  else { btn.textContent = `${t('filter_technical')} ${n}✓`; btn.classList.add('sel'); }
}

function toggleTechnicalChip(el, mid) {
  if (mid === '') {
    includeTechnical = false;
    _technicalFilterMids.clear();
    document.querySelectorAll('#filter-sheet-technical .chip').forEach(c => c.classList.remove('active'));
    el.classList.add('active');
  } else {
    document.querySelector('#filter-sheet-technical .chip[data-tmid=""]')?.classList.remove('active');
    includeTechnical = true;
    if (_technicalFilterMids.has(mid)) { _technicalFilterMids.delete(mid); el.classList.remove('active'); }
    else { _technicalFilterMids.add(mid); el.classList.add('active'); }
    if (_technicalFilterMids.size === 0) {
      includeTechnical = false;
      document.querySelector('#filter-sheet-technical .chip[data-tmid=""]')?.classList.add('active');
    }
  }
  _syncTechnicalBtn();
  loadJobs();
}

function _syncLessonBtn() {
  const btn = document.getElementById('flt-lesson-btn');
  if (!btn) return;
  if (!includeLesson) { btn.textContent = t('filter_lesson') + ' ▾'; btn.classList.remove('sel'); return; }
  const total = _lessonFilterMains.size + _lessonFilterMids.size;
  if (total === 0) { btn.textContent = t('filter_lesson') + ' ✓'; btn.classList.add('sel'); }
  else if (total === 1) {
    const lbl = _lessonFilterMids.size ? [..._lessonFilterMids][0] : ([..._lessonFilterMains][0]);
    btn.textContent = lbl + ' ✓'; btn.classList.add('sel');
  } else { btn.textContent = `${t('filter_lesson')} ${total}✓`; btn.classList.add('sel'); }
}
function toggleLessonChip(el, main, mid) {
  if (main === '' && mid === '') {
    // 전체: 모든 필터 초기화
    includeLesson = false;
    _lessonFilterMains.clear();
    _lessonFilterMids.clear();
    document.querySelectorAll('#filter-sheet-lesson .chip').forEach(c => c.classList.remove('active'));
    el.classList.add('active');
    _clearLessonOverlays();
  } else {
    document.querySelector('#filter-sheet-lesson .chip[data-lmain=""][data-lmid=""]')?.classList.remove('active');
    includeLesson = true;
    if (mid === '') {
      if (_lessonFilterMains.has(main)) { _lessonFilterMains.delete(main); el.classList.remove('active'); }
      else { _lessonFilterMains.add(main); el.classList.add('active'); }
    } else {
      if (_lessonFilterMids.has(mid)) { _lessonFilterMids.delete(mid); el.classList.remove('active'); }
      else { _lessonFilterMids.add(mid); el.classList.add('active'); }
    }
    if (_lessonFilterMains.size === 0 && _lessonFilterMids.size === 0) {
      includeLesson = false;
      document.querySelector('#filter-sheet-lesson .chip[data-lmain=""][data-lmid=""]')?.classList.add('active');
      _clearLessonOverlays();
    } else {
      _loadLessonMarkersForMap();
    }
  }
  _syncLessonBtn();
}
function toggleLessonCategoryChip(el, subject) { toggleLessonChip(el, '', ''); }
async function _loadLessonMarkersForMap() {
  if (!kakaoMap || !includeLesson) { _clearLessonOverlays(); return; }
  _clearLessonOverlays();
  try {
    let q = db.from('lesson_profiles')
      .select('id, lat, lng, main_category, mid_category, subject, subject_detail, price_per_session, is_available_now, worker_kakao_uid, workers(name, rating)')
      .eq('is_active', true);
    if (_lessonFilterMains.size === 1 && _lessonFilterMids.size === 0) {
      q = q.eq('main_category', [..._lessonFilterMains][0]);
    }
    const { data } = await q;
    if (!data?.length) return;
    let filtered = data;
    if (_lessonFilterMids.size > 0) {
      filtered = data.filter(p =>
        _lessonFilterMids.has(p.mid_category) || _lessonFilterMids.has(_getSubjectMidCat(p.subject))
      );
    }
    if (filtered.length) _renderLessonMarkers(filtered);
  } catch(e) {}
}
function _getSubjectMidCat(subject) {
  const map = {
    '골프':'스포츠','테니스':'스포츠','탁구':'스포츠','수영':'스포츠','PT/필라테스':'스포츠','배드민턴':'스포츠','클라이밍':'스포츠',
    '보컬':'음악','기타':'음악','피아노':'음악','드럼':'음악','바이올린':'음악','악기':'음악',
    'K-pop댄스':'댄스','발레':'댄스','힙합':'댄스','현대무용':'댄스','댄스':'댄스',
    '그림':'미술','디자인':'미술','공예':'미술',
    '영어':'어학','중국어':'어학','일본어':'어학','스페인어':'어학','기타외국어':'어학',
    '수학':'수학/과학','과학':'수학/과학','물리':'수학/과학','화학':'수학/과학',
    '국어':'국어/인문','역사':'국어/인문','논술':'국어/인문','한국사':'국어/인문',
  };
  return map[subject] || '기타레슨';
}
function _syncTypeBtn() {
  const btn = document.getElementById('flt-type-btn');
  if (!btn) return;
  const dday = document.getElementById('chip-dday')?.classList.contains('active');
  const total = selectedWorkTypes.size + (dday ? 1 : 0);
  if (total === 0) { btn.textContent = '형태 ▾'; btn.classList.remove('sel'); }
  else if (total === 1) {
    const lbl = dday && !selectedWorkTypes.size ? 'D-DAY' : (_TYPE_LABEL[[...selectedWorkTypes][0]] || '형태');
    btn.textContent = lbl + ' ✓'; btn.classList.add('sel');
  } else { btn.textContent = `형태 ${total}개 ✓`; btn.classList.add('sel'); }
}

function toggleCategoryChip(el, cat) {
  // 전체 리셋
  if (cat === '') {
    selectedCategories.clear(); includeLesson = false;
    document.querySelectorAll('#filter-sheet-cat .chip[data-cat]').forEach(c => c.classList.remove('active'));
    el.classList.add('active');
    _clearLessonOverlays();
    _syncCatBtn(); loadJobs(); return;
  }
  // 레슨/과외 → 마커 토글 (패널 없이)
  if (cat === '__lesson__') {
    includeLesson = !includeLesson;
    el.classList.toggle('active', includeLesson);
    document.querySelector('#filter-sheet-cat .chip[data-cat=""]')?.classList.remove('active');
    if (includeLesson) { _loadLessonMarkersForMap(); } else { _clearLessonOverlays(); }
    _syncCatBtn(); _syncLessonBtn(); return;
  }
  // 일반 업종 토글
  if (selectedCategories.has(cat)) selectedCategories.delete(cat);
  else selectedCategories.add(cat);
  el.classList.toggle('active', selectedCategories.has(cat));
  // 아무것도 선택 안 됐으면 전체 활성화
  const hasAny = selectedCategories.size > 0 || includeLesson;
  document.querySelector('#filter-sheet-cat .chip[data-cat=""]')?.classList.toggle('active', !hasAny);
  _syncCatBtn(); loadJobs();
}

function toggleWorkTypeChip(el, raw) {
  const wt = _WT_MAP[raw] || raw;
  if (selectedWorkTypes.has(wt)) selectedWorkTypes.delete(wt);
  else selectedWorkTypes.add(wt);
  el.classList.toggle('active', selectedWorkTypes.has(wt));
  _syncTypeBtn(); loadJobs();
}

// 지도/홈 상단 필터바가 항상 펼쳐져 있으면 화면이 복잡해 보인다는 피드백으로
// "필터설정" 버튼을 눌러야만 기존 필터바(카테고리/근무타입/급구/레슨/전문기술 등)가 보이도록 감쌈.
// 필터 로직 자체는 그대로 재사용 - 이 패널은 단순히 보이기/숨기기만 담당
function toggleMapFilterPanel() {
  const panel = document.getElementById('map-filter-panel-collapsible');
  if (!panel) return;
  const isOpen = panel.style.display !== 'none';
  panel.style.display = isOpen ? 'none' : 'block';
  const btn = document.getElementById('map-filter-toggle-btn');
  if (btn) btn.style.background = isOpen ? '#fff' : '#f5f5f5';
}

let _activeFilterSheet = null;
function toggleFilterSheet(type) {
  const catSheet       = document.getElementById('filter-sheet-cat');
  const typeSheet      = document.getElementById('filter-sheet-type');
  const lessonSheet    = document.getElementById('filter-sheet-lesson');
  const technicalSheet = document.getElementById('filter-sheet-technical');
  const catBtn         = document.getElementById('flt-cat-btn');
  const typeBtn        = document.getElementById('flt-type-btn');
  const lessonBtn      = document.getElementById('flt-lesson-btn');
  const technicalBtn   = document.getElementById('flt-technical-btn');
  const isAlreadyOpen = _activeFilterSheet === type;
  [catSheet, typeSheet, lessonSheet, technicalSheet].forEach(s => s?.classList.remove('open'));
  [catBtn, typeBtn, lessonBtn, technicalBtn].forEach(b => b?.classList.remove('open'));
  if (!isAlreadyOpen) {
    const sheet = type === 'cat' ? catSheet : type === 'type' ? typeSheet : type === 'technical' ? technicalSheet : lessonSheet;
    const btn   = type === 'cat' ? catBtn   : type === 'type' ? typeBtn   : type === 'technical' ? technicalBtn   : lessonBtn;
    sheet?.classList.add('open');
    btn?.classList.add('open');
    _activeFilterSheet = type;
  } else { _activeFilterSheet = null; }
}
function closeFilterSheet() {
  ['filter-sheet-cat','filter-sheet-type','filter-sheet-lesson','filter-sheet-technical'].forEach(id =>
    document.getElementById(id)?.classList.remove('open'));
  ['flt-cat-btn','flt-type-btn','flt-lesson-btn','flt-technical-btn'].forEach(id =>
    document.getElementById(id)?.classList.remove('open'));
  _activeFilterSheet = null;
}
function _updateFilterBtn(type, label) {
  const catLabels  = {'F&B':'F&B','물류':'운송/물류','판매':'판매','청소':'청소','이벤트':'이벤트','커플알바':'커플알바','컨텐츠':'촬영','챌린지':'챌린지','이사도우미':'이사','운반/짐 이동':'운반','퀵배달':'퀵','청소 대행':'청소대행','__errand__':'심부름'};
  const typeLabels = {'__regular__':'정기','__short__':'단기','__spot__':'스팟','regular':'정기','short':'단기','spot':'스팟','errand':'심부름'};
  const btn = document.getElementById(type === 'cat' ? 'flt-cat-btn' : 'flt-type-btn');
  if (!btn) return;
  if (!label) {
    btn.textContent = (type === 'cat' ? t('filter_cat') : t('filter_work_type')) + ' ▾';
    btn.classList.remove('sel');
  } else {
    const name = type === 'cat' ? (catLabels[label] || label) : (typeLabels[label] || label);
    btn.textContent = name + ' ✓';
    btn.classList.add('sel');
  }
}

function setCategory(el, cat) {
  if (cat === '__lesson__') {
    document.querySelectorAll('.chip[data-cat]').forEach(c => c.classList.remove('active'));
    el.classList.add('active');
    openLessonPanel();
    return;
  }
  const _WT_MAP = { '__errand__':'errand', '__regular__':'regular', '__short__':'short', '__spot__':'spot' };
  const newWT = _WT_MAP[cat] || '';

  // 같은 근무유형 칩 재클릭 → 토글 off → 전체로 복귀
  if (newWT && currentWorkType === newWT) {
    currentWorkType = '';
    currentCategory = '';
    document.querySelectorAll('.chip[data-cat]').forEach(c => c.classList.remove('active'));
    const allChip = document.querySelector('#filter-row .chip[data-cat=""]');
    if (allChip) allChip.classList.add('active');
    loadJobs();
    return;
  }

  document.querySelectorAll('.chip[data-cat]').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  if (newWT) {
    currentCategory = ''; currentWorkType = newWT;
    _updateFilterBtn('type', newWT);
    _updateFilterBtn('cat', '');
  } else {
    currentCategory = cat; currentWorkType = '';
    _updateFilterBtn('cat', cat);
    _updateFilterBtn('type', '');
  }
  loadJobs();
}

function toggleUrgent(el) {
  urgentOnly = !urgentOnly;
  el.classList.toggle('active', urgentOnly);
  loadJobs();
}

function toggleDday(el) {
  dateFilter = dateFilter === 'today' ? '' : 'today';
  el.classList.toggle('active', dateFilter === 'today');
  _syncTypeBtn();
  loadJobs();
}

function setSortMode(mode) {
  sortMode = mode;
}

function calcDDay(st) {
  if (!st) return { str:'', cls:'' };
  const today = new Date(); today.setHours(0,0,0,0);
  const d = new Date(st); d.setHours(0,0,0,0);
  const diff = Math.round((d - today) / 86400000);
  if (diff < 0)   return { str:t('status_ongoing'), cls:'dd-later' };
  if (diff === 0) return { str:'D-DAY',  cls:'dd-today' };
  if (diff <= 3)  return { str:`D-${diff}`, cls:'dd-soon' };
  return { str:`D-${diff}`, cls:'dd-later' };
}

function setRadius(m) {
  currentRadius = m;
  document.getElementById('radius-txt').textContent = (m/1000).toFixed(0) + 'km';
  toggleRadiusPopup();
  loadJobs();
}
function setRadiusSlider(m) {
  currentRadius = m;
  document.getElementById('radius-txt').textContent = (m/1000).toFixed(0) + 'km';
  toggleRadiusPopup();
  loadJobs();
}

function toggleRadiusPopup() {
  document.getElementById('radius-popup').classList.toggle('open');
}

// ── 고급 필터 시트 ────────────────────────────────────────
function openAdvFilter() {
  document.getElementById('adv-filter-overlay').style.display = 'block';
  renderRecentSearches();
}
function closeAdvFilter() {
  document.getElementById('adv-filter-overlay').style.display = 'none';
  const wage = parseInt(document.getElementById('wage-slider')?.value || 0);
  minWageFilter = wage > 10000 ? wage : 0;
  const chip = document.getElementById('chip-adv-filter');
  const active = minWageFilter > 10000 || dateFilter || timeFilter;
  if (chip) { chip.classList.toggle('active', active); chip.textContent = active ? '필터●' : '필터'; }
  loadJobs();
}
function resetAdvFilter() {
  minWageFilter = 0; dateFilter = ''; timeFilter = '';
  const sl = document.getElementById('wage-slider');
  if (sl) { sl.value = 10000; document.getElementById('wage-val').textContent = '10,000원'; }
  ['flt-date-any','flt-date-today','flt-date-tmr','flt-date-wknd'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.cssText = el.style.cssText.replace(/background:[^;]+/, `background:${id==='flt-date-any'?'var(--red)':'#f0f0f0'}`).replace(/color:[^;]+/, `color:${id==='flt-date-any'?'#fff':'#555'}`);
  });
  ['flt-time-any','flt-time-am','flt-time-pm','flt-time-eve'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.cssText = el.style.cssText.replace(/background:[^;]+/, `background:${id==='flt-time-any'?'var(--red)':'#f0f0f0'}`).replace(/color:[^;]+/, `color:${id==='flt-time-any'?'#fff':'#555'}`);
  });
}
function setDateFilter(val) {
  dateFilter = val;
  const map = { '':'flt-date-any', 'today':'flt-date-today', 'tmr':'flt-date-tmr', 'wknd':'flt-date-wknd' };
  Object.entries(map).forEach(([k,id]) => {
    const el = document.getElementById(id); if (!el) return;
    const on = k === val;
    el.style.background = on ? 'var(--red)' : '#f0f0f0';
    el.style.color = on ? '#fff' : '#555';
  });
}
function setTimeFilter(val) {
  timeFilter = val;
  const map = { '':'flt-time-any', 'am':'flt-time-am', 'pm':'flt-time-pm', 'eve':'flt-time-eve' };
  Object.entries(map).forEach(([k,id]) => {
    const el = document.getElementById(id); if (!el) return;
    const on = k === val;
    el.style.background = on ? 'var(--red)' : '#f0f0f0';
    el.style.color = on ? '#fff' : '#555';
  });
}

// ── 최근 검색어 ──────────────────────────────────────────
function saveRecentSearch(q) {
  if (!q || q.length < 2) return;
  const key = 'baro_recent_search';
  let arr = [];
  try { arr = JSON.parse(localStorage.getItem(key) || '[]'); } catch(e) {}
  arr = [q, ...arr.filter(s => s !== q)].slice(0, 8);
  localStorage.setItem(key, JSON.stringify(arr));
}
function renderRecentSearches() {
  const sec = document.getElementById('recent-search-section');
  const list = document.getElementById('recent-search-list');
  if (!sec || !list) return;
  let arr = [];
  try { arr = JSON.parse(localStorage.getItem('baro_recent_search') || '[]'); } catch(e) {}
  if (!arr.length) { sec.style.display = 'none'; return; }
  sec.style.display = 'block';
  list.innerHTML = arr.map(q =>
    `<button onclick="applyRecentSearch('${q.replace(/'/g,"\\'")}')" style="padding:6px 12px;background:#f0f0f0;color:#555;border:none;border-radius:16px;font-size:12px;font-weight:700;cursor:pointer">${q}</button>`
  ).join('');
}
function applyRecentSearch(q) {
  closeAdvFilter();
  const inp = document.getElementById('job-search-input');
  if (inp) { inp.value = q; filterJobsByKeyword(q); }
}

// ── 공고 공유 ────────────────────────────────────────────
let _shareJobData = null;
async function shareJob() {
  if (!selectedJobId) return;
  let job = jobs.find(j => j.id === selectedJobId);
  if (!job) {
    // jobs 배열에 없으면 DB에서 직접 조회 (새 공고 등)
    const { data } = await db.from('job_postings').select('id, title, address, current_wage').eq('id', selectedJobId).single();
    if (!data) { showToast('공고 정보를 불러올 수 없어요.'); return; }
    job = data;
  }
  _shareJobData = job;
  const url = `${location.origin}${location.pathname}?job=${job.id}`;
  document.getElementById('worker-share-url').textContent = url;
  const nativeBtn = document.getElementById('worker-share-native-btn');
  if (navigator.share) nativeBtn.style.display = 'block';
  document.getElementById('worker-share-overlay').style.display = 'block';
}
function closeWorkerShare() {
  document.getElementById('worker-share-overlay').style.display = 'none';
}
function copyWorkerShareUrl() {
  const url = `${location.origin}${location.pathname}?job=${_shareJobData?.id || ''}`;
  navigator.clipboard.writeText(url).then(() => { showToast('링크 복사 완료!'); closeWorkerShare(); })
    .catch(() => { showToast('복사 실패. URL을 직접 선택해 복사해주세요.'); });
}
function shareJobKakao() {
  const job = _shareJobData;
  if (!job) { showToast('공고 정보를 불러올 수 없어요.'); return; }
  const url = `${location.href.split('?')[0]}?job=${job.id}`;

  if (/Android/i.test(navigator.userAgent)) {
    if (window.AndroidBridge) {
      const wage = job.current_wage || job.wage;
      const text = (job.title || '알바 공고') + (wage ? ` | ${wage.toLocaleString()}원` : '') + ' - 바로알바';
      window.AndroidBridge.share('바로알바 공고', text, url);
      closeWorkerShare();
      return;
    }
    // Kakao SDK로 kakaolink:// URL 추출 후 직접 이동
    navigator.clipboard?.writeText(url);
    showToast('링크가 복사됐습니다');
    closeWorkerShare();
    return;
  }

  // iOS / 데스크탑: Kakao SDK
  if (window.Kakao && !Kakao.isInitialized()) Kakao.init(APP_CONFIG.KAKAO_JS_KEY);
  if (!window.Kakao?.isInitialized?.()) {
    if (navigator.share) navigator.share({ title: job.title || '바로알바 공고', url }).catch(() => {});
    else { navigator.clipboard?.writeText(url); showToast('링크가 복사됐습니다'); }
    closeWorkerShare();
    return;
  }
  const wage = job.current_wage || job.wage;
  try {
    Kakao.Share.sendDefault({
      objectType: 'feed',
      content: {
        title: job.title || '알바 공고',
        description: `\u{1F4CD} ${job.address?.split('\n')[0] || ''} | \u{1F4B0} ${wage ? wage.toLocaleString()+'원' : ''}`,
        imageUrl: `${location.origin}/icons/logo-share.png`,
        link: { mobileWebUrl: url, webUrl: url }
      },
      buttons: [{ title: '공고 보러 가기', link: { mobileWebUrl: url, webUrl: url } }]
    });
    closeWorkerShare();
  } catch(e) {
    if (navigator.share) navigator.share({ title: job.title || '바로알바 공고', url }).catch(() => {});
    else { navigator.clipboard?.writeText(url); showToast('링크가 복사됐습니다'); }
    closeWorkerShare();
  }
}
function shareJobNative() {
  const job = _shareJobData;
  const url = `${location.origin}${location.pathname}?job=${job.id}`;
  navigator.share({ title: job.title || '바로알바 공고', text: `${job.title || '알바 공고'} - 바로알바`, url })
    .then(() => closeWorkerShare()).catch(() => {});
}

function toggleSort() {
  const cycle  = ['dist','wage_desc','wage_asc','date_asc','date_desc'];
  const _skeys = { dist:'sort_dist', wage_desc:'sort_wage_desc', wage_asc:'sort_wage_asc', date_asc:'sort_date_asc', date_desc:'sort_date_desc' };
  sortMode = cycle[(cycle.indexOf(sortMode) + 1) % cycle.length];
  const label = t(_skeys[sortMode] || 'sort_dist');
  document.getElementById('sort-label').textContent = label;
  const sortBtn = document.getElementById('chip-sort-btn');
  if (sortBtn) sortBtn.textContent = '↕ ' + label;
  setSortMode(sortMode);
  loadJobs();
}

// ── 하단 시트 드래그 ──────────────────────────────────────
function setupSheet() {
  const sheet = document.getElementById('bottom-sheet');
  // 핸들 + 요약 행 모두 드래그 가능
  const dragEls = [
    document.querySelector('.sheet-handle-area'),
    document.querySelector('.sheet-summary'),
  ].filter(Boolean);

  let startY = 0, isDragging = false;

  function onStart(clientY) {
    startY = clientY;
    isDragging = true;
    sheet.style.transition = 'none';
  }

  function onMove(clientY) {
    if (!isDragging) return;
    const dy = clientY - startY;
    const order = ['peek','half','full'];
    const idx = order.indexOf(sheetState);
    const base = sheetState === 'peek' ? '100% - var(--sheet-peek)' : sheetState === 'half' ? '15%' : '0%';
    if ((dy < 0 && idx < 2) || (dy > 0 && idx > 0)) {
      sheet.style.transform = `translateY(calc(${base} + ${dy}px))`;
    }
  }

  function onEnd(clientY) {
    if (!isDragging) return;
    isDragging = false;
    sheet.style.transition = '';
    sheet.style.transform = '';

    const dy = clientY - startY;
    const THRESHOLD = 30; // 더 민감하게
    const order = ['peek','half','full'];
    const idx = order.indexOf(sheetState);

    if      (dy < -THRESHOLD && idx < 2) setSheetState(order[idx + 1]);
    else if (dy >  THRESHOLD && idx > 0) setSheetState(order[idx - 1]);
    else setSheetState(sheetState);
  }

  dragEls.forEach(el => {
    el.style.cursor = 'grab';
    el.addEventListener('touchstart', e => onStart(e.touches[0].clientY), { passive: true });
    el.addEventListener('touchmove',  e => { e.preventDefault(); e.stopPropagation(); onMove(e.touches[0].clientY); }, { passive: false });
    el.addEventListener('touchend',   e => onEnd(e.changedTouches[0].clientY), { passive: true });
    // 마우스 드래그 (데스크톱)
    el.addEventListener('mousedown',  e => onStart(e.clientY));
    window.addEventListener('mousemove', e => { if(isDragging) onMove(e.clientY); });
    window.addEventListener('mouseup',   e => { if(isDragging) onEnd(e.clientY); });
    // 탭/클릭으로 상태 전환
    el.addEventListener('click', e => {
      if (Math.abs(startY - e.clientY) > 5) return; // 드래그와 클릭 구분
      const order = ['peek','half','full'];
      setSheetState(order[(order.indexOf(sheetState) + 1) % 3]);
    });
  });
}

function setSheetState(state) {
  const sheet = document.getElementById('bottom-sheet');
  sheet.style.transform = '';
  sheet.classList.remove('sheet-peek', 'sheet-half', 'sheet-full');
  sheet.classList.add('sheet-' + state);
  sheetState = state;
}

// ── 검색 (위치 검색 + 공고 텍스트 필터 통합) ─────────────
function setupSearch() {
  const input = document.getElementById('search-input');
  let timer;

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      clearTimeout(timer);
      searchLocation(input.value.trim());
    }
  });

  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (!q) { renderList(); return; }
    timer = setTimeout(() => {
      const filtered = jobs.filter(j =>
        j.title.includes(q) || j.biz_name.includes(q) || j.category.includes(q)
      );
      renderFilteredList(filtered);
    }, 400);
  });
}

async function searchLocation(q) {
  if (!q) return;
  try {
    const res = await fetch(`/api/naver-search?query=${encodeURIComponent(q)}`);
    const data = await res.json();
    if (!res.ok || !data.items?.length) { showToast('검색 결과가 없어요'); return; }
    const first = data.items[0];
    saveMapCenter(first.lat, first.lng);
    kakaoMap.setCenter(new kakao.maps.LatLng(first.lat, first.lng));
    kakaoMap.setLevel(5);
    showToast(`\u{1F4CD} ${first.title} 근처로 이동`);
    document.getElementById('search-input').blur();
    loadJobs();
  } catch(e) {
    showToast('검색 중 오류가 발생했어요');
  }
}

function renderFilteredList(filtered) {
  // 외국인 워커에게 '한국인만' 공고 숨김
  const _fNat = currentUser?.user_metadata?.nationality;
  if (_fNat && _fNat !== 'KR') filtered = filtered.filter(j => j.nationality_requirement !== 'korean_only');
  document.getElementById('job-count').textContent = filtered.length;
  const list = document.getElementById('job-cards-container');
  if (filtered.length === 0) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">\u{1F50D}</div><div class="empty-txt">검색 결과가 없어요</div></div>`;
    return;
  }
  // renderList와 동일 로직이지만 filtered 배열 사용
  const tempJobs = jobs;
  jobs = filtered;
  renderList();
  jobs = tempJobs;
}

// ── Supabase Realtime (시급 실시간 반영) ──────────────────
function setupRealtime() {
  db.channel('wage-changes')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'job_postings' }, payload => {
      const updated = payload.new;
      const idx = jobs.findIndex(j => j.id === updated.id);
      if (idx !== -1) {
        jobs[idx].current_wage = updated.current_wage;
        jobs[idx].wage_delta = updated.current_wage - jobs[idx].base_wage;
        jobs[idx].status = updated.status;
        renderMarkers();
        renderList();
        if (updated.current_wage > updated.base_wage) {
          const job = jobs[idx];
          showToast(`\u{1F525} ${job.title} 시급 ${updated.current_wage.toLocaleString()}원으로 인상!`);
        }
      }
    })
    .subscribe();
}

// ── 바로알바 대시보드 ─────────────────────────────────────
async function loadDashboard() {
  const cards = document.getElementById('dash-summary-cards');
  if (!cards) return;
  if (!currentUser) { cards.innerHTML = ''; return; }

  let appCount = 0, postingCount = 0, lessonCount = 0;
  try {
    const [wid, bizRes, lessonRes] = await Promise.all([
      _getWorkerId(),
      db.from('businesses').select('id').eq('kakao_uid', currentUser.id).maybeSingle(),
      db.from('lesson_profiles').select('id').eq('worker_kakao_uid', currentUser.id).eq('is_active', true)
    ]);
    if (wid) {
      const { data: apps } = await db.from('applications').select('id').eq('worker_id', wid).in('status', ['pending', 'accepted']);
      appCount = apps?.length || 0;
    }
    const biz = bizRecord || bizRes.data;
    if (biz) {
      const { data: posts } = await db.from('job_postings').select('id').eq('business_id', biz.id).in('status', ['open', 'urgent']);
      postingCount = posts?.length || 0;
    }
    lessonCount = lessonRes.data?.length || 0;
  } catch(e) {}

  // 출근 알림: 오늘/내일 합격 공고 체크
  try {
    const _wid2 = await _getWorkerId();
    if (_wid2) {
      const { data: _shiftApps } = await db.from('applications')
        .select('job_postings(title, start_time, duration_hours, current_wage, businesses(name))')
        .eq('worker_id', _wid2)
        .eq('status', 'accepted');
      const _now = new Date();
      const _today = _now.toDateString();
      const _tomorrow = new Date(_now.getTime() + 86400000).toDateString();
      const _upcoming = (_shiftApps || []).filter(a => {
        if (!a.job_postings?.start_time) return false;
        const sd = new Date(a.job_postings.start_time).toDateString();
        return sd === _today || sd === _tomorrow;
      }).sort((a,b) => new Date(a.job_postings.start_time) - new Date(b.job_postings.start_time));
      const _banner = document.getElementById('dash-shift-alert');
      if (_banner && _upcoming.length > 0) {
        const _sh = _upcoming[0];
        const _sd = new Date(_sh.job_postings.start_time);
        const _isToday = _sd.toDateString() === _today;
        const _h = _sd.getHours(), _m = String(_sd.getMinutes()).padStart(2,'0');
        document.getElementById('dash-shift-alert-icon').textContent = _isToday ? '⏰' : '📅';
        document.getElementById('dash-shift-alert-label').textContent = _isToday ? '오늘 근무 있어요!' : '내일 근무 있어요!';
        document.getElementById('dash-shift-alert-title').textContent = _sh.job_postings.title || '공고';
        document.getElementById('dash-shift-alert-time').textContent =
          `${_sh.job_postings.businesses?.name || ''} · ${_h}:${_m} 출근${_sh.job_postings.duration_hours ? ' · ' + _sh.job_postings.duration_hours + '시간' : ''}`;
        _banner.style.display = 'block';
        // 브라우저 알림 예약 (오늘 출근이고 30분 이상 남았을 때)
        if (_isToday && 'Notification' in window && Notification.permission === 'granted') {
          const _msLeft = _sd.getTime() - Date.now() - 30 * 60 * 1000;
          if (_msLeft > 0 && _msLeft < 3 * 3600 * 1000) {
            setTimeout(() => {
              new Notification('⏰ 출근 30분 전이에요!', {
                body: `${_sh.job_postings.title} · ${_h}:${_m} 출근`,
                icon: './icons/icon-192.png'
              });
            }, _msLeft);
          }
        }
      } else if (_banner) {
        _banner.style.display = 'none';
      }
    }
  } catch(e) {}

  const mkCard = (val, label, color, fn) =>
    `<div onclick="${fn}" style="background:#f8f8f8;border-radius:14px;padding:14px 8px;text-align:center;cursor:pointer;-webkit-tap-highlight-color:rgba(0,0,0,0.05)">
      <div style="font-size:26px;font-weight:900;color:${color}">${val}</div>
      <div style="font-size:10px;color:#aaa;font-weight:700;margin-top:4px;line-height:1.4">진행 중<br>${label}</div>
    </div>`;

  cards.innerHTML =
    mkCard(appCount,      '지원',    '#8B5CF6', "openDashPanel('applications')") +
    mkCard(postingCount,  '공고',    '#C8102E', "openDashPanel('owner')")        +
    mkCard(lessonCount,   '레슨',    '#3b82f6', "openDashPanel('lesson')");
}

function openDashPanel(which) {
  if (isGuest || !currentUser) {
    showLoginPrompt('로그인이 필요해요', '지원 현황, 공고 관리 등<br>모든 서비스 기능은 로그인 후 이용 가능합니다.');
    return;
  }
  if (which === 'applications') {
    document.getElementById('panel-applications')?.classList.add('show');
    switchAppSubtab('status');
  } else if (which === 'owner') {
    openOwnerPanel('postings');
  } else if (which === 'lesson') {
    openLessonManagePanel();
  } else if (which === 'community') {
    openCommunityPanel();
  }
}

// ── 내비게이션 ────────────────────────────────────────────
function openChatPanel() {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const swipeScreen = document.getElementById('swipe-screen');
  const topBar      = document.querySelector('.top-bar');
  const bottomSheet = document.getElementById('bottom-sheet');
  const radiusBadge = document.getElementById('radius-badge');
  const mapLocBtn   = document.getElementById('map-loc-btn');
  swipeScreen.style.display = 'none';
  topBar.style.display = 'none';
  bottomSheet.style.display = 'none';
  radiusBadge.style.display = 'none';
  if (mapLocBtn) mapLocBtn.style.display = 'none';
  document.getElementById('panel-applications')?.classList.remove('show');
  document.getElementById('panel-profile')?.classList.remove('show');
  document.getElementById('panel-chats')?.classList.add('show');
  loadMyChatList();
}

function openOwnerPanel(tab) {
  if (!currentUser) { goToLogin(); return; }
  const panel = document.getElementById('panel-owner');
  panel.style.display = 'block';
  const fab = document.getElementById('posting-fab');
  if (fab) fab.style.display = 'flex';
  const doTab = (t) => {
    if (t === 'chats') {
      document.getElementById('panel-owner-chats').classList.add('show');
      loadOwnerChatList();
    } else if (t === 'applicants') {
      ownerSwitchTab('applicants', document.querySelectorAll('.tab-btn')[1]);
    } else if (t) {
      ownerSwitchTab(t, document.querySelectorAll('.tab-btn')[0]);
    }
  };
  if (!bizRecord) {
    initOwnerFeatures().then(() => { if (tab) doTab(tab); }).catch(console.error);
  } else {
    if (tab) doTab(tab);
  }
}

function closeOwnerPanel() {
  const panel = document.getElementById('panel-owner');
  const fab = document.getElementById('posting-fab');
  if (fab) fab.style.display = 'none';
  if (panel.style.display === 'none') return;
  panel.style.display = 'none';
  if (window._fromProfile) {
    window._fromProfile = false;
    setNav(document.querySelectorAll('.nav-item')[4], 'profile');
  }
}

function goToPostJob() {
  openOwnerPanel('postings');
}

function setNav(el, tab) {
  if ((isGuest || !currentUser) && tab === 'chats') {
    showLoginPrompt('채팅하려면 로그인이 필요해요', '공고에 지원하고 업주와<br>채팅하려면 로그인이 필요합니다.<br>30초면 완료!');
    return;
  }
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  el.classList.add('active');
  const swipeScreen = document.getElementById('swipe-screen');
  const topBar      = document.querySelector('.top-bar');
  const bottomSheet = document.getElementById('bottom-sheet');
  const radiusBadge   = document.getElementById('radius-badge');
  const mapLocBtn     = document.getElementById('map-loc-btn');
  const panelApps      = document.getElementById('panel-applications');
  const panelHome      = document.getElementById('panel-home');
  const panelDash      = document.getElementById('panel-dashboard');
  const panelChats     = document.getElementById('panel-chats');
  const panelProfile   = document.getElementById('panel-profile');

  // 탭 전환 시 열린 오버레이/패널 모두 닫기 (z-index 높은 것 먼저)
  closeOwnerPanel();
  closeWChat(false);
  closeChat(false);
  document.getElementById('cp-profile-modal')?.remove();
  // z-index:500 이상 오버레이 강제 숨김 (이전 탭에서 남은 레이어 차단 방지)
  const _wo = document.getElementById('wchat-overlay');
  if (_wo) _wo.style.display = 'none';
  const _co = document.getElementById('chat-overlay');
  if (_co) _co.style.display = 'none';
  document.getElementById('detail-overlay')?.classList.remove('open');
  document.getElementById('panel-app-job-detail')?.classList.remove('show');
  document.getElementById('panel-community')?.classList.remove('show');
  document.getElementById('panel-lesson')?.classList.remove('show');
  document.getElementById('panel-lesson-manage')?.classList.remove('show');
  document.querySelectorAll('.mpsub-panel').forEach(p => p.classList.remove('show'));
  // 모임 패널 닫기
  closeMoimCreate();
  closeMoimDetail();
  closeMoimPanel();
  closeMoimChat();
  // 기타 플로팅 오버레이 닫기
  closePostingForm();
  closeShareModal();
  closeLessonDetailModal();
  const _rankEl = document.getElementById('panel-rank');
  if (_rankEl) _rankEl.style.display = 'none';
  closeForeignerLangPanel();
  closeHomeFilter();

  // 모든 패널 숨기기
  swipeScreen.style.display = 'none';
  panelHome?.classList.remove('show');
  panelApps.classList.remove('show');
  panelDash?.classList.remove('show');
  panelChats.classList.remove('show');
  panelProfile.classList.remove('show');

  if (tab !== 'map') stopLocationWatch();

  if (tab === 'home') {
    topBar.style.display      = 'none';
    bottomSheet.style.display = 'none';
    radiusBadge.style.display = 'none';
    if (mapLocBtn) mapLocBtn.style.display = 'none';
    const _homeFloat = document.getElementById('map-swipe-float');
    if (_homeFloat) _homeFloat.style.display = 'none';
    const _homeFab = document.getElementById('posting-fab');
    if (_homeFab) _homeFab.style.display = 'none';
    panelHome?.classList.add('show');
    // 다른 탭에 갔다가 돌아왔을 때 이전에 적용된 필터(외국인환영 등)로 인해
    // 검색결과 화면에 갇힌 채 기본 홈 화면이 안 보이던 문제 방지
    const _homeSR = document.getElementById('home-search-results');
    if (_homeSR && _homeSR.style.display !== 'none') clearHomeFilter();
    loadHomePanel();
  } else if (tab === 'swipe') {
    topBar.style.display      = 'none';
    bottomSheet.style.display = 'none';
    radiusBadge.style.display = 'none';
    if (mapLocBtn) mapLocBtn.style.display = 'none';
    swipeScreen.style.display = 'flex';
    initSwipe();
  } else if (tab === 'dashboard') {
    topBar.style.display      = 'none';
    bottomSheet.style.display = 'none';
    radiusBadge.style.display = 'none';
    if (mapLocBtn) mapLocBtn.style.display = 'none';
    panelDash?.classList.add('show');
    loadDashboard();
  } else if (tab === 'chats') {
    topBar.style.display      = 'none';
    bottomSheet.style.display = 'none';
    radiusBadge.style.display = 'none';
    if (mapLocBtn) mapLocBtn.style.display = 'none';
    panelChats.classList.add('show');
    // 채팅 목록 탭 진입: 배지 숨김 (개별 채팅 열 때만 is_read 처리)
    const _badge = document.getElementById('chat-unread-badge');
    if (_badge) { _badge.style.display = 'none'; }
    loadMyChatList();
  } else if (tab === 'profile') {
    topBar.style.display      = 'none';
    bottomSheet.style.display = 'none';
    radiusBadge.style.display = 'none';
    if (mapLocBtn) mapLocBtn.style.display = 'none';
    panelProfile.classList.add('show');
    openProfile();
  } else {
    topBar.style.display      = '';
    bottomSheet.style.display = '';
    radiusBadge.style.display = '';
    if (mapLocBtn) mapLocBtn.style.display = 'flex';
    if (tab === 'map') {
      setSheetState('peek');
      if (kakaoMap) setTimeout(() => { try { kakaoMap.relayout(); } catch(e) {} }, 50);
      // 지도 탭에 들어올 때마다 내 위치 마커를 자동으로 표시 (버튼을 눌러야만 보이던 문제 수정) -
      // setNav()가 다른 탭으로 나갈 때 stopLocationWatch()로 마커를 지우기 때문에 재진입 시 다시 켜줘야 함
      moveToMyLocation(true);
      // 지도 모드 토글 표시 (알바|모임)
      const _modeToggle = document.getElementById('map-mode-toggle');
      if (_modeToggle) _modeToggle.style.display = 'flex';
      if (typeof setMapMode === 'function' && kakaoMap) setMapMode('job'); // 알바 모드로 시작
      // 주변알바 스와이프 버튼 표시 (공고 있을 때)
      const _floatBtn = document.getElementById('map-swipe-float');
      if (_floatBtn) {
        const _nearCount = (jobs || []).filter(j => j.status === 'open' || j.status === 'urgent').length;
        if (_nearCount > 0) {
          document.getElementById('map-swipe-float-txt').textContent = t('swipe_nearby_count_txt').replace('{n}', _nearCount);
          _floatBtn.style.display = 'flex';
        }
      }
    } else {
      const _floatBtn = document.getElementById('map-swipe-float');
      if (_floatBtn) _floatBtn.style.display = 'none';
      const _modeToggle = document.getElementById('map-mode-toggle');
      if (_modeToggle) _modeToggle.style.display = 'none';
    }
    // 채팅 탭에서 다른 탭으로 이동 시 실제 미읽음 수로 배지 갱신
    refreshWorkerChatBadge();
  }
}

// ── AI 맞춤 추천 ─────────────────────────────────────────
function _aiKey() { return 'baro_ai_' + (currentUser?.id || 'guest'); }

function aiRecordSignal(category, wage, score) {
  try {
    const raw = localStorage.getItem(_aiKey());
    const prefs = raw ? JSON.parse(raw) : { cats: {}, wages: [], totalSignals: 0 };
    prefs.cats[category] = (prefs.cats[category] || 0) + score;
    if (score > 0 && wage > 0) {
      prefs.wages.push(wage);
      if (prefs.wages.length > 20) prefs.wages.shift(); // 최근 20개만 유지
    }
    prefs.totalSignals = (prefs.totalSignals || 0) + (score > 0 ? 1 : 0);
    localStorage.setItem(_aiKey(), JSON.stringify(prefs));
    if (prefs.totalSignals >= 3) renderAiRecommendations();
    // Supabase 비동기 저장 (기기 간 동기화)
    if (currentUser && !isGuest) {
      db.from('workers').update({ ai_prefs: prefs }).eq('kakao_uid', currentUser.id).then(null, () => {});
    }
  } catch(e) {}
}

function _aiScoreJob(job, prefs) {
  let score = 0;
  const catScore = prefs.cats[job.category] || 0;
  score += Math.max(0, catScore) * 2; // 긍정 카테고리 가중치
  if (prefs.wages.length >= 2) {
    const avgWage = prefs.wages.reduce((a, b) => a + b, 0) / prefs.wages.length;
    if (job.current_wage >= avgWage * 0.85) score += 3; // 선호 시급대 매칭
  }
  if (job.status === 'urgent') score += 1; // 급구는 살짝 우선
  return score;
}

function renderAiRecommendations() {
  const el = document.getElementById('ai-rec-section');
  if (!el) return;
  try {
    const raw = localStorage.getItem(_aiKey());
    if (!raw) return;
    const prefs = JSON.parse(raw);
    if ((prefs.totalSignals || 0) < 3) return;

    // 현재 공개 공고에서 점수 계산 후 상위 5개
    const scored = (jobs || [])
      .filter(j => j.status === 'open' || j.status === 'urgent')
      .map(j => ({ job: j, score: _aiScoreJob(j, prefs) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    if (!scored.length) { el.style.display = 'none'; return; }

    // 카테고리별 그라디언트 배경
    const _CAT_BG = {
      'F&B':'linear-gradient(135deg,#FFF7ED,#FEE2E2)',
      '물류':'linear-gradient(135deg,#F5F3FF,#EDE9FE)',
      '판매':'linear-gradient(135deg,#F0FDF4,#DCFCE7)',
      '청소':'linear-gradient(135deg,#F0F9FF,#DBEAFE)',
      '이벤트':'linear-gradient(135deg,#FDF4FF,#FAE8FF)',
      '심부름':'linear-gradient(135deg,#F5F3FF,#EDE9FE)',
    };
    const _getBg = cat => _CAT_BG[cat] || 'linear-gradient(135deg,#F8FAFC,#F1F5F9)';

    el.style.display = 'block';
    el.innerHTML = `
      <div style="padding:12px 0 8px;display:flex;align-items:center;justify-content:space-between">
        <div style="display:flex;align-items:center;gap:7px">
          <div style="width:22px;height:22px;background:linear-gradient(135deg,#FF6B6B,#C8102E);border-radius:7px;display:flex;align-items:center;justify-content:center;font-size:12px;color:#fff;font-weight:900;flex-shrink:0">✦</div>
          <span style="font-size:13px;font-weight:900;color:#222">${t('ai_rec_title')}</span>
        </div>
        <span style="font-size:11px;color:#ccc;font-weight:600">${t('ai_rec_subtitle')}</span>
      </div>
      <div style="display:flex;gap:10px;overflow-x:auto;padding:2px 0 12px;-webkit-overflow-scrolling:touch;scrollbar-width:none">
        ${scored.map(({ job: j }) => {
          const wage = (j.current_wage || 0).toLocaleString();
          const cat = j.category || '';
          const emoji = CAT_EMOJI[cat] || '💼';
          const urgent = j.status === 'urgent';
          const startStr = j.start_time ? formatTime(j.start_time) : '';
          return `
          <div onclick="openDetail('${j.id}')" style="flex-shrink:0;width:140px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);cursor:pointer;border:${urgent ? '2px solid #FF9500' : '1px solid #f0f0f0'}">
            <div style="height:70px;background:${_getBg(cat)};display:flex;align-items:center;justify-content:center;position:relative">
              <span style="font-size:30px;line-height:1">${emoji}</span>
              ${urgent ? '<span style="position:absolute;top:6px;right:6px;font-size:9px;font-weight:900;background:#FF9500;color:#fff;padding:2px 6px;border-radius:8px">ASAP</span>' : ''}
            </div>
            <div style="padding:9px 11px 11px">
              <div style="font-size:11px;font-weight:800;color:#555;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:3px">${j.biz_name || j.title}</div>
              <div style="font-size:15px;font-weight:900;color:var(--red)">${wage}원</div>
              <div style="font-size:10px;color:#aaa;font-weight:700;margin-top:2px">${cat}${startStr ? ' · ' + startStr : ''}</div>
            </div>
          </div>`;
        }).join('')}
      </div>`;
  } catch(e) {}
}

// ── 스와이프 ─────────────────────────────────────────────
let swipeJobs = [];
let swipeIdx = 0;
const appliedSwipeIds = new Set();

function initSwipe() {
  swipeJobs = jobs
    .filter(j => !j.applied_status && !appliedSwipeIds.has(j.id))
    .sort(() => Math.random() - 0.5);
  swipeIdx = 0;
  renderSwipeStack();
}

const CAT_EMOJI = {
  // 일반 알바
  'F&B':'\u{1F37D}','물류':'\u{1F4E6}','판매':'\u{1F6CD}','청소':'\u{1F9F9}',
  '의류/패션':'\u{1F457}','의료/병원':'\u{1F3E5}','이벤트':'\u{1F389}',
  '숙박/호텔':'\u{1F3E8}','교육/과외':'\u{1F4DA}','스포츠/레저':'\u{26BD}',
  '뷰티/헤어':'\u{1F485}','커플알바':'\u{1F491}','컨텐츠':'\u{1F4F1}',
  '유튜브/틱톡':'\u{1F3AC}','모델/촬영':'\u{1F4F8}','이사도우미':'\u{1F69A}',
  '챌린지':'\u{1F3C6}','기타':'\u{1F4CB}',
  // 심부름
  '물건 픽업/전달':'\u{1F4E6}','대리 줄서기':'\u{1F9CD}','서류/우편':'\u{1F4EE}',
  '쇼핑 대행':'\u{1F6D2}','벌레 퇴치':'\u{1FAB2}','반려동물 산책':'\u{1F415}',
  '이사/짐 보조':'\u{1F69A}','운반/짐 이동':'\u{1F4E6}','퀵배달':'\u{1F6F5}',
  '청소 대행':'\u{1F9F9}','음식 배달':'\u{1F371}','차량 이동/주차':'\u{1F697}',
  '약국/병원 대행':'\u{1F48A}','장보기 대행':'\u{1F96C}','기타 심부름':'\u{1F3C3}',
  // 돌봄·케어
  '반려동물케어':'\u{1F43E}','아이돌봄':'\u{1F476}','어르신돌봄':'\u{1F474}',
  '병원동행':'\u{1F3E5}','가사도우미':'\u{1F3E1}',
  // 전문기술직
  '설비·수리':'\u{1F527}','전기·전자':'\u{26A1}','인테리어':'\u{1F3E0}',
  '청소·방역':'\u{1F9F9}','이사·운반':'\u{1F69A}','조경·정원':'\u{1F33F}',
  '사진 촬영':'\u{1F4F8}','영상 촬영·편집':'\u{1F3AC}','그래픽·디자인':'\u{1F3A8}',
  '웹디자인·UI':'\u{1F4BB}','SNS·마케팅':'\u{1F4F1}','3D·모션':'\u{2728}',
  '웹·앱 개발':'\u{2328}','데이터 분석':'\u{1F4CA}','자동화·스크립트':'\u{1F916}',
  '기타 IT':'\u{1F4BE}','헤어':'\u{1F487}','메이크업·네일':'\u{1F485}','피부 관리':'\u{2728}',
};
function getCatEmoji(cat) { return CAT_EMOJI[cat] || '\u{1F4BC}'; }
const CAT_BG = {
  'F&B':'#FFF8E1','물류':'#F3F0FF','판매':'#E6FBF4','청소':'#F3F4F6',
  '의류/패션':'#FDF2F8','의료/병원':'#F0FDF4','이벤트':'#FDF2F8',
  '숙박/호텔':'#FFF7ED','교육/과외':'#EFF6FF','스포츠/레저':'#F0FDF4',
  '뷰티/헤어':'#FDF2F8','커플알바':'#FFF0F5','컨텐츠':'#F0F4FF',
  '유튜브/틱톡':'#FEF2F2','모델/촬영':'#FDF2F8','이사도우미':'#F3F0FF',
  '챌린지':'#FFF3E0','기타':'#F9FAFB',
  '청소·방역':'#F3F4F6','설비·수리':'#FFF7ED','전기·전자':'#FFFBEB',
  '인테리어':'#FFF7ED','이사·운반':'#F3F0FF','조경·정원':'#F0FDF4',
  '사진 촬영':'#FDF2F8','영상 촬영·편집':'#FEF2F2','그래픽·디자인':'#FDF2F8',
  '웹디자인·UI':'#EFF6FF','반려동물케어':'#F0FDF4','아이돌봄':'#FFF7ED',
  '어르신돌봄':'#FFF7ED','가사도우미':'#F3F4F6',
};

function renderSwipeStack() {
  const stack = document.getElementById('swipe-stack');
  stack.innerHTML = '';
  const remaining = swipeJobs.length - swipeIdx;
  document.getElementById('swipe-counter').textContent = remaining > 0 ? `${remaining}개 남음` : '';

  if (remaining === 0) {
    stack.innerHTML = `<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:10px;padding:32px">
      <div style="width:80px;height:80px;border-radius:50%;background:#FFF0F0;display:flex;align-items:center;justify-content:center;margin-bottom:4px">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#C8102E" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/>
          <polyline points="22 4 12 14.01 9 11.01"/>
        </svg>
      </div>
      <div style="font-size:18px;font-weight:900;color:#222">주변 알바 다 봤어요!</div>
      <div style="font-size:13px;color:#aaa;line-height:1.6">반경을 넓히거나<br>내일 다시 확인해보세요</div>
      <button onclick="initSwipe()" style="margin-top:12px;padding:13px 32px;background:var(--red);color:#fff;border:none;border-radius:99px;font-size:14px;font-weight:800;cursor:pointer;letter-spacing:-0.3px">다시 보기</button>
    </div>`;
    return;
  }

  // 뒷 카드 2장 미리 렌더 (stack 효과)
  for (let i = Math.min(swipeIdx + 2, swipeJobs.length - 1); i >= swipeIdx; i--) {
    const card = makeSwipeCard(swipeJobs[i], i === swipeIdx);
    stack.appendChild(card);
    const offset = (i - swipeIdx) * 6;
    card.style.transform = `translateY(${offset}px) scale(${1 - (i - swipeIdx) * 0.04})`;
    card.style.zIndex = 10 - (i - swipeIdx);
    card.style.opacity = i === swipeIdx ? '1' : '0.85';
  }

  // 최상단 카드에 드래그 바인딩
  const top = stack.querySelector('[data-top="true"]');
  if (top) bindSwipeDrag(top);
}

function makeSwipeCard(job, isTop) {
  const card = document.createElement('div');
  card.dataset.top = isTop;
  card.dataset.jobId = job.id;
  const bg = CAT_BG[job.category] || '#f5f5f5';
  const emoji = getCatEmoji(job.category);
  const _apSw = (job.address || '').split('\n');
  const _addrFallback = _apSw[0] ? (_apSw[1] ? _apSw[0] + ' · ' + _apSw[1].split(' ').slice(0,3).join(' ') : _apSw[0]) : null;
  const dist = (job.distance_m == null || isNaN(job.distance_m)) ? (_addrFallback || '위치 미설정') : job.distance_m < 1000 ? Math.round(job.distance_m) + 'm' : (job.distance_m/1000).toFixed(1) + 'km';

  // 날짜/시간 포맷
  let dateStr = '날짜 미정', timeStr = '';
  if (job.start_time) {
    const d = new Date(job.start_time);
    const days = ['일','월','화','수','목','금','토'];
    dateStr = (d.getMonth()+1) + '월 ' + d.getDate() + '일(' + days[d.getDay()] + ')';
    timeStr = String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
  }
  const endTime = job.start_time && job.duration_hours
    ? (() => { const e = new Date(new Date(job.start_time).getTime() + job.duration_hours*3600000); return String(e.getHours()).padStart(2,'0')+':'+String(e.getMinutes()).padStart(2,'0'); })()
    : '';
  const timeRange = timeStr ? `${timeStr}${endTime ? ' ~ '+endTime : ''}` : '시간 미정';

  const isUrgent = job.status === 'urgent';
  const hasSurge = job.wage_delta > 0;
  const neededLeft = (job.needed_count||1) - (job.filled_count||0);
  const _swLangFlag = {ko:'&#127472;&#127479;',en:'&#127482;&#127480;',zh:'&#127464;&#127475;',ja:'&#127471;&#127477;',vi:'&#127483;&#127475;',ru:'&#127479;&#127482;',mn:'&#127474;&#127475;'};
  const _swLangName = {ko:'한국어',en:'영어',zh:'중국어',ja:'일본어',vi:'베트남어',ru:'러시아어',mn:'몽골어'};
  const swLangBadge = (job.preferred_languages && job.preferred_languages.length)
    ? '<div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:8px">' +
      job.preferred_languages.map(l => `<span style="background:#EFF6FF;color:#1D4ED8;border:1px solid #BFDBFE;font-weight:700;padding:2px 7px;border-radius:8px;font-size:11px">${_swLangFlag[l]||''} ${_swLangName[l]||l} 우대</span>`).join('') +
      '</div>'
    : '';

  card.style.cssText = `position:absolute;inset:0;border-radius:24px;background:#fff;box-shadow:0 8px 32px rgba(0,0,0,0.12);overflow:hidden;cursor:grab;touch-action:none;user-select:none;display:flex;flex-direction:column;`;

  // 공고 업로드 사진 lazy-load — 우측 섬네일로 표시
  if (isTop) {
    setTimeout(() => {
      fetch(APP_CONFIG.SUPABASE_URL + '/rest/v1/job_postings?id=eq.' + job.id + '&select=images,main_image_idx', {
        headers: { 'apikey': APP_CONFIG.SUPABASE_ANON_KEY, 'Accept': 'application/json' }
      }).then(r => r.json()).then(rows => {
        const imgs = rows[0]?.images;
        if (!imgs?.length) return;
        const mi = rows[0]?.main_image_idx || 0;
        const mainImg = imgs[Math.min(mi, imgs.length - 1)] || imgs[0];
        const thumb = card.querySelector('[data-card-thumb]');
        if (!thumb) return;
        thumb.innerHTML = `<img src="${mainImg}" style="width:100%;height:100%;object-fit:cover;border-radius:12px;cursor:pointer;display:block" onclick="event.stopPropagation();openImgViewer('${mainImg}')" loading="lazy">`;
        thumb.style.display = 'block';
        const countEl = card.querySelector('[data-img-count]');
        if (countEl && imgs.length > 1) countEl.textContent = `+${imgs.length - 1}`;
      }).catch(() => {});
    }, 100);
  }

  card.innerHTML = `
    <!-- 상단 컬러 헤더: 카테고리 + 업체명 -->
    <div data-card-header style="background:${bg};padding:18px 16px 14px;flex-shrink:0;position:relative">
      <div style="display:flex;align-items:flex-start;gap:10px">
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
            <span style="font-size:32px;line-height:1">${emoji}</span>
            <div>
              <div style="font-size:11px;font-weight:800;color:#555">${job.category}</div>
              <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap">
                <div style="font-size:15px;font-weight:900;color:#111">${job.biz_name || ''}</div>
                ${job.biz_rating ? `<span style="background:#FEF3C7;color:#D97706;font-size:10px;font-weight:900;padding:1px 6px;border-radius:20px">★${job.biz_rating}</span>` : ''}
                ${isUrgent ? '<span style="background:#C8102E;color:#fff;font-size:10px;font-weight:800;padding:2px 7px;border-radius:20px">\u{1F525} 급구</span>' : ''}
              </div>
            </div>
          </div>
          <div style="font-size:18px;font-weight:900;color:#111;line-height:1.3;margin-bottom:4px">${job.title}</div>
          <div style="display:inline-flex;align-items:center;gap:3px;background:rgba(0,0,0,0.07);border-radius:20px;padding:3px 8px">
            <span style="font-size:12px">\u{1F4CD}</span>
            <span style="font-size:12px;font-weight:800;color:#333">${dist}</span>
          </div>
        </div>
        <!-- 공고 사진 섬네일 -->
        <div data-card-thumb style="display:none;width:72px;height:72px;flex-shrink:0;border-radius:12px;overflow:hidden;position:relative;box-shadow:0 2px 8px rgba(0,0,0,0.15)">
          <span data-img-count style="position:absolute;bottom:3px;right:3px;background:rgba(0,0,0,0.6);color:#fff;font-size:9px;font-weight:800;padding:1px 4px;border-radius:5px;z-index:1"></span>
        </div>
      </div>
    </div><!-- card-header -->

    <!-- 핵심 정보 블록 -->
    <div style="padding:16px 20px;flex:1;display:flex;flex-direction:column;justify-content:space-between">

      <!-- 시급 + 서지 -->
      <div style="background:#FFF5F5;border-radius:14px;padding:14px 16px;margin-bottom:12px">
        <div style="display:flex;align-items:baseline;gap:6px">
          <span style="font-size:36px;font-weight:900;color:var(--red)">${job.current_wage.toLocaleString()}</span>
          <span style="font-size:16px;font-weight:700;color:var(--red)">원/시간</span>
          ${hasSurge ? `<span style="font-size:12px;font-weight:800;color:#FF9500;background:#FFF3E0;padding:3px 8px;border-radius:8px;margin-left:4px">↑ ${job.wage_delta.toLocaleString()}원</span>` : ''}
        </div>
        ${job.duration_hours ? `<div style="font-size:13px;color:#888;font-weight:700;margin-top:4px">총 ${Math.round(job.current_wage * job.duration_hours).toLocaleString()}원 예상</div>` : ''}
      </div>

      <!-- 날짜/시간/거리/인원 그리드 -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">
        <div style="background:#f8f8f8;border-radius:12px;padding:10px 12px">
          <div style="font-size:10px;color:#aaa;font-weight:700;margin-bottom:3px">\u{1F4C5} 근무일</div>
          <div style="font-size:13px;font-weight:800;color:#222">${dateStr}</div>
        </div>
        <div style="background:#f8f8f8;border-radius:12px;padding:10px 12px">
          <div style="font-size:10px;color:#aaa;font-weight:700;margin-bottom:3px">⏰ 근무시간</div>
          <div style="font-size:13px;font-weight:800;color:#222">${timeRange}</div>
        </div>
        <div style="background:#f8f8f8;border-radius:12px;padding:10px 12px">
          <div style="font-size:10px;color:#aaa;font-weight:700;margin-bottom:3px">\u{1F4CD} 거리</div>
          <div style="font-size:13px;font-weight:800;color:#222">${dist}</div>
        </div>
        <div style="background:#f8f8f8;border-radius:12px;padding:10px 12px">
          <div style="font-size:10px;color:#aaa;font-weight:700;margin-bottom:3px">\u{1F465} 모집인원</div>
          <div style="font-size:13px;font-weight:800;color:${neededLeft<=1?'#C8102E':'#222'}">${neededLeft > 0 ? neededLeft + '명 남음' : '마감임박'}</div>
        </div>
      </div>

      <!-- 설명 -->
      <div onclick="event.stopPropagation();openDetail('${job.id}')" style="font-size:13px;color:#666;line-height:1.6;background:#f8f8f8;border-radius:12px;padding:10px 12px;cursor:pointer">
        ${(job.description||'업무 내용을 확인하려면 탭해보세요.').slice(0,70)}${(job.description||'').length>70?'…':''}
      </div>
      ${swLangBadge}
    </div>

    <!-- 스와이프 힌트 -->
    <div style="padding:10px 20px;border-top:1px solid #f0f0f0;display:flex;justify-content:space-between;font-size:11px;color:#ccc;font-weight:700;flex-shrink:0">
      <span>← 패스</span>
      <span>${job.biz_reviews ? `리뷰 ${job.biz_reviews}개` : '스와이프로 지원'}</span>
      <span>지원 →</span>
    </div>

    <!-- 스와이프 오버레이 -->
    <div class="sw-overlay-left" style="position:absolute;inset:0;background:rgba(200,16,46,0.15);display:flex;align-items:center;justify-content:flex-end;padding:24px;opacity:0;transition:opacity 0.1s;pointer-events:none">
      <div style="font-size:48px;font-weight:900;color:#C8102E;border:4px solid #C8102E;border-radius:12px;padding:8px 16px;transform:rotate(15deg)">패스</div>
    </div>
    <div class="sw-overlay-right" style="position:absolute;inset:0;background:rgba(16,185,129,0.15);display:flex;align-items:center;justify-content:flex-start;padding:24px;opacity:0;transition:opacity 0.1s;pointer-events:none">
      <div style="font-size:48px;font-weight:900;color:#10B981;border:4px solid #10B981;border-radius:12px;padding:8px 16px;transform:rotate(-15deg)">지원!</div>
    </div>
    <div class="sw-overlay-up" style="position:absolute;inset:0;background:rgba(255,149,0,0.15);display:flex;align-items:flex-end;justify-content:center;padding:24px;opacity:0;transition:opacity 0.1s;pointer-events:none">
      <div style="font-size:36px;font-weight:900;color:#FF9500;border:4px solid #FF9500;border-radius:12px;padding:8px 20px">⚡ 번개지원</div>
    </div>`;
  return card;
}

function bindSwipeDrag(card) {
  let startX = 0, startY = 0, isDragging = false;

  const onStart = (cx, cy) => { startX = cx; startY = cy; isDragging = true; card.style.transition = 'none'; };
  const onMove = (cx, cy) => {
    if (!isDragging) return;
    const dx = cx - startX, dy = cy - startY;
    const rot = dx / 18;
    card.style.transform = `translate(${dx}px,${dy}px) rotate(${rot}deg)`;
    const absX = Math.abs(dx), absY = Math.abs(dy);
    card.querySelector('.sw-overlay-left').style.opacity  = dx < -40 ? Math.min(1,(absX-40)/80) : 0;
    card.querySelector('.sw-overlay-right').style.opacity = dx > 40  ? Math.min(1,(absX-40)/80) : 0;
    card.querySelector('.sw-overlay-up').style.opacity    = dy < -60 && absY > absX ? Math.min(1,(Math.abs(dy)-60)/60) : 0;
  };
  const onEnd = (cx, cy) => {
    if (!isDragging) return;
    isDragging = false;
    const dx = cx - startX, dy = cy - startY;
    card.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
    if (dx > 80)       flyCard(card, 'right');
    else if (dx < -80) flyCard(card, 'left');
    else if (dy < -100 && Math.abs(dy) > Math.abs(dx)) flyCard(card, 'up');
    else {
      card.style.transform = '';
      card.querySelector('.sw-overlay-left').style.opacity = '0';
      card.querySelector('.sw-overlay-right').style.opacity = '0';
      card.querySelector('.sw-overlay-up').style.opacity = '0';
    }
  };

  card.addEventListener('touchstart', e => onStart(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
  card.addEventListener('touchmove',  e => onMove(e.touches[0].clientX, e.touches[0].clientY),  { passive: true });
  card.addEventListener('touchend',   e => onEnd(e.changedTouches[0].clientX, e.changedTouches[0].clientY), { passive: true });
  card.addEventListener('mousedown',  e => onStart(e.clientX, e.clientY));
  window.addEventListener('mousemove', e => { if (isDragging) onMove(e.clientX, e.clientY); });
  window.addEventListener('mouseup',   e => { if (isDragging) onEnd(e.clientX, e.clientY); });
}

function _restoreCard(card, overlaySelector) {
  card.style.transition = 'transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)';
  card.style.transform = '';
  const ov = card.querySelector(overlaySelector);
  if (ov) ov.style.opacity = '0';
  setTimeout(() => { card.style.transition = ''; }, 400);
}

async function flyCard(card, dir) {
  const job = swipeJobs[swipeIdx];

  // 번개지원: 카드 날리기 전 자격 검사 (카드가 사라지면 복구 불가)
  if (dir === 'up') {
    const eligible = await checkQuickApplyEligible();
    if (!eligible) { _restoreCard(card, '.sw-overlay-up'); return; }
  }

  // 일반/번개 지원 모두: 연령제한 공고면 카드를 날리기 전에 막아서
  // "지원된 것처럼" 보이지 않게 한다 (차단 안내가 먼저 뜨고 카드는 그대로 남음)
  if ((dir === 'right' || dir === 'up') && job) {
    const ageOk = await checkSwipeAgeGate(job);
    if (!ageOk) { _restoreCard(card, dir === 'up' ? '.sw-overlay-up' : '.sw-overlay-right'); return; }
  }

  if (navigator.vibrate) navigator.vibrate(dir === 'right' ? 50 : dir === 'up' ? [30,20,30] : 20);
  const targets = { left:[-1200,100,'-30deg'], right:[1200,100,'30deg'], up:[0,-1200,'0deg'] };
  const [tx, ty, rot] = targets[dir];
  card.style.transform = `translate(${tx}px,${ty}px) rotate(${rot})`;
  card.style.opacity = '0';

  if (dir === 'right') {
    applySwipeJob(job, false).then(ok => { if (ok) showToast('✅ 지원됐습니다!'); });
    if (job?.category) aiRecordSignal(job.category, job.current_wage, 2);
  } else if (dir === 'up') {
    applySwipeJob(job, true).then(ok => { if (ok) showToast('⚡ 번개 지원!'); });
    if (job?.category) aiRecordSignal(job.category, job.current_wage, 3);
  } else {
    showToast('패스');
    if (job?.category) aiRecordSignal(job.category, job.current_wage, -1);
  }

  setTimeout(() => { swipeIdx++; renderSwipeStack(); }, 350);
}

function swipeAction(dir) {
  const top = document.querySelector('[data-top="true"]');
  if (top) { top.style.transition = 'transform 0.3s ease, opacity 0.3s ease'; flyCard(top, dir); }
}

// ── 번개지원 자격 체크 ─────────────────────────────────────
const QUICK_GRADE = { minRating: 4.3, minReviews: 3 };

async function checkQuickApplyEligible() {
  if (isGuest || !currentUser) { showToast('로그인 후 이용 가능합니다'); return false; }

  // 오늘 이미 사용했는지 확인 (localStorage)
  const today = new Date().toISOString().slice(0, 10);
  const usedDate = localStorage.getItem('quick_apply_date_' + currentUser.id);
  if (usedDate === today) {
    showQuickGradeModal('limit');
    return false;
  }

  // 워커 데이터 조회
  const { data: w } = await db.from('workers')
    .select('rating, review_count, noshow_count').eq('kakao_uid', currentUser.id).single();

  const rating  = w?.rating      || 0;
  const reviews = w?.review_count || 0;
  const noshows = w?.noshow_count || 0;
  const isEligible = rating >= QUICK_GRADE.minRating && reviews >= QUICK_GRADE.minReviews && noshows === 0;

  if (!isEligible) {
    showQuickGradeModal('not_eligible', { rating, reviews, noshows });
    return false;
  }
  return true;
}

function showQuickGradeModal(type, data = {}) {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:3000;display:flex;align-items:flex-end;justify-content:center';

  let content = '';
  if (type === 'limit') {
    content = `
      <div style="font-size:40px;margin-bottom:12px">⚡</div>
      <div style="font-size:18px;font-weight:900;color:#222;margin-bottom:8px">오늘 번개지원을 이미 사용했어요</div>
      <div style="font-size:13px;color:#888;line-height:1.7">번개지원은 하루 1회만 사용 가능합니다.<br>내일 다시 사용할 수 있어요.</div>`;
  } else {
    const rOk = data.rating >= QUICK_GRADE.minRating;
    const rCnt = data.reviews >= QUICK_GRADE.minReviews;
    content = `
      <div style="font-size:40px;margin-bottom:12px">⚡</div>
      <div style="font-size:18px;font-weight:900;color:#222;margin-bottom:12px">번개등급 자격이 필요해요</div>
      <div style="background:#f8f8f8;border-radius:14px;padding:14px;margin-bottom:16px;text-align:left;width:100%">
        <div style="font-size:12px;color:#aaa;font-weight:700;margin-bottom:8px">번개등급 달성 조건</div>
        <div style="font-size:14px;color:${rOk?'#22c55e':'#EF4444'};font-weight:700;margin-bottom:6px">
          ${rOk?'✅':'❌'} 평점 ${QUICK_GRADE.minRating}점 이상 (현재 ${data.rating ? data.rating.toFixed(1) : '없음'})
        </div>
        <div style="font-size:14px;color:${rCnt?'#22c55e':'#EF4444'};font-weight:700">
          ${rCnt?'✅':'❌'} 완료 알바 ${QUICK_GRADE.minReviews}회 이상 (현재 ${data.reviews}회)
        </div>
        <div style="font-size:14px;color:${data.noshows===0?'#22c55e':'#EF4444'};font-weight:700">
          ${data.noshows===0?'✅':'❌'} 노쇼 0회 (현재 ${data.noshows||0}회)
        </div>
      </div>
      <div style="font-size:12px;color:#aaa;margin-bottom:16px">성실하게 알바를 완료하면 번개등급을 획득할 수 있어요!</div>`;
  }

  overlay.innerHTML = `
    <div style="background:#fff;border-radius:24px 24px 0 0;padding:32px 24px 40px;width:100%;max-width:480px;text-align:center">
      ${content}
      <button class="modal-close-btn" style="width:100%;padding:14px;background:var(--red);color:#fff;border:none;border-radius:14px;font-size:15px;font-weight:800;cursor:pointer">확인</button>
    </div>`;
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  overlay.querySelector('.modal-close-btn').addEventListener('click', () => overlay.remove());
  document.body.appendChild(overlay);
}

// 18세 미만 차단 (나이 미확인 시 차단) - flyCard의 사전검사와 applySwipeJob의 최종검사 양쪽에서 재사용
async function checkSwipeAgeGate(job) {
  if (!job?.age_limit) return true;
  if (_myAge === null) {
    const { data: w } = await db.from('workers').select('age, birth_date').eq('kakao_uid', currentUser.id).maybeSingle();
    _myAge = w?.age || (w?.birth_date ? calcAgeFromBirth(w.birth_date) : null);
  }
  if (_myAge === null) {
    showToast('\u{1F51E} 만 18세 이상 지원 가능. 마이페이지에서 생년월일을 등록해주세요');
    return false;
  }
  if (_myAge < 18) {
    showToast('\u{1F51E} 만 18세 이상만 지원 가능한 공고입니다');
    return false;
  }
  return true;
}

async function applySwipeJob(job, isQuick = false) {
  if (isGuest || !currentUser) return false;
  if (!(await checkSwipeAgeGate(job))) return false;
  appliedSwipeIds.add(job.id);
  let wid = await _getWorkerId();
  if (!wid) {
    const meta = currentUser.user_metadata || {};
    const name = meta.full_name || meta.name || currentUser.email?.split('@')[0] || '알바생';
    const { data: created } = await db.from('workers').insert({ kakao_uid: currentUser.id, name }).select('id').single();
    if (!created) return false;
    window._myWorkerId = created.id;
    wid = created.id;
  }
  const { error } = await db.from('applications').insert({ job_posting_id: job.id, worker_id: wid });
  if (error && error.code !== '23505') {
    showToast('지원 처리 중 오류가 발생했습니다');
    return false;
  }
  if (isQuick) {
    const today = new Date().toISOString().slice(0, 10);
    localStorage.setItem('quick_apply_date_' + currentUser.id, today);
  }
  // 내 지원 탭이 열려 있으면 즉시 갱신
  const panelApps = document.getElementById('panel-applications');
  if (panelApps?.classList.contains('show')) loadMyApplications();
  return true;
}

function openProfile() {
  if (currentUser) {
    const meta = currentUser.user_metadata || {};
    const role = meta.baroalba_role;
    // identities 배열 우선 (Google/Kakao OAuth), 없으면 user_metadata (네이버 커스텀), 최후 app_metadata
    const identities = currentUser.identities || [];
    const oauthProvider = identities.find(i => i.provider !== 'email')?.provider;
    const provider = oauthProvider || meta.provider || currentUser.app_metadata?.provider || '';
    document.getElementById('profile-name').textContent = meta.full_name || currentUser.email?.split('@')[0] || '사용자';
    document.getElementById('profile-email').textContent = currentUser.email || '';
    // 아바타는 loadWorkerProfileForm()에서 photo_url 우선으로 처리 — 여기서는 임시 이니셜만 표시
    const avatarInner = document.getElementById('header-avatar-inner');
    if (avatarInner && !avatarInner.querySelector('img[src]:not([src=""])')) {
      const meta2 = currentUser?.user_metadata || {};
      avatarInner.innerHTML = _initialAvatar((meta2.full_name || currentUser.email || '?').charAt(0), 58);
    }
    const adminBanner = document.getElementById('admin-banner');
    if (adminBanner) adminBanner.style.display = _isAdmin ? 'flex' : 'none';
    document.getElementById('profile-role').style.display = 'none';
    const providerMap = {
      email:  {
        html: `<span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:700;background:#f0f0f0;color:#555;padding:3px 9px;border-radius:20px">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#555" stroke-width="2" stroke-linecap="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 7 10 7 10-7"/></svg>이메일</span>`
      },
      kakao: {
        html: `<span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:800;background:#FEE500;color:#3C1E1E;padding:3px 9px;border-radius:20px">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="#3C1E1E"><path d="M12 3C6.477 3 2 6.477 2 10.875c0 2.73 1.69 5.13 4.25 6.57L5.2 21l5.18-2.34C10.76 18.88 11.37 19 12 19c5.523 0 10-3.477 10-7.875C22 6.477 17.523 3 12 3z"/></svg>카카오</span>`
      },
      naver: {
        html: `<span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:800;background:#03C75A;color:#fff;padding:3px 9px;border-radius:20px">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="#fff"><path d="M16 3v7.5L8 3H3v18h5v-7.5L16 21h5V3z"/></svg>네이버</span>`
      },
      google: {
        html: `<span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:700;background:#fff;color:#444;padding:3px 9px;border-radius:20px;border:1.5px solid #e0e0e0">
          <svg width="13" height="13" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>Google</span>`
      }
    };
    const pInfo = providerMap[provider] || providerMap.email;
    const pEl = document.getElementById('profile-provider');
    pEl.innerHTML = pInfo.html;
    pEl.style.background = 'none';
    pEl.style.padding = '0';
    pEl.style.display = 'block';
    // profile-biz-btn removed
    document.getElementById('profile-pw-section').style.display = provider === 'email' ? 'block' : 'none';
    document.getElementById('worker-profile-edit').style.display = 'block';
    document.getElementById('worker-cert-section').style.display = 'block';
    document.getElementById('worker-grade-section').style.display = 'block';
    document.getElementById('owner-profile-edit').style.display = 'none';
    document.getElementById('owner-settings-shortcut').style.display = 'none';
    document.getElementById('profile-logged-in').style.display = 'block';
    document.getElementById('profile-guest').style.display = 'none';
    loadWorkerProfileForm();
    loadWorkerGrade();
    loadOwnerProfileForm();
    // 외국인 근로자 섹션 표시 (워커 role인 경우)
    const fSec = document.getElementById('foreigner-section');
    if (fSec) fSec.style.display = 'block';
  } else {
    document.getElementById('profile-logged-in').style.display = 'none';
    document.getElementById('profile-guest').style.display = 'block';
  }
  initNotiToggles();
}


let _workerGender = null;
let _workerEdu = null;
let _notifyCategories = [];

function onNotifyToggle(cb) {
  const on = cb.checked;
  document.getElementById('notify-track').style.background = on ? 'var(--red)' : '#ddd';
  document.getElementById('notify-thumb').style.left = on ? '22px' : '2px';
  document.getElementById('notify-pref-body').style.display = on ? 'block' : 'none';
  if (on) _buildNotifyCatChips();
}

function _buildNotifyCatChips() {
  const el = document.getElementById('notify-cat-chips');
  if (!el || el.children.length) return; // 이미 렌더됨
  const cats = Object.keys(CAT_EMOJI);
  el.innerHTML = cats.map(c => `
    <button type="button" data-cat="${c}" onclick="toggleNotifyCat(this)"
      style="padding:6px 12px;border-radius:8px;border:1.5px solid #e5e7eb;background:#f8f8f8;color:#555;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;transition:all 0.15s"
      class="${_notifyCategories.includes(c) ? 'ncat-active' : ''}">${CAT_EMOJI[c] || ''} ${c}</button>`).join('');
  _syncNotifyCatStyles();
}

function toggleNotifyCat(btn) {
  const cat = btn.dataset.cat;
  const idx = _notifyCategories.indexOf(cat);
  if (idx >= 0) _notifyCategories.splice(idx, 1); else _notifyCategories.push(cat);
  btn.classList.toggle('ncat-active', _notifyCategories.includes(cat));
  _syncNotifyCatStyles();
}

function _syncNotifyCatStyles() {
  document.querySelectorAll('#notify-cat-chips button').forEach(b => {
    const active = _notifyCategories.includes(b.dataset.cat);
    b.style.background = active ? '#fff0f0' : '#f8f8f8';
    b.style.borderColor = active ? '#FFAAAA' : '#e5e7eb';
    b.style.color = active ? 'var(--red)' : '#555';
    b.style.fontWeight = active ? '700' : '600';
  });
}

function setEdu(btn) {
  _workerEdu = btn.dataset.edu || null;
  document.querySelectorAll('#edu-chips .edu-chip').forEach(el => el.classList.remove('active'));
  btn.classList.add('active');
}

function setGender(val) {
  _workerGender = val;
  const mBtn = document.getElementById('gender-male-btn');
  const fBtn = document.getElementById('gender-female-btn');
  const activeStyle = 'padding:8px 16px;border:1.5px solid var(--red);border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;background:var(--red);color:#fff';
  const idleStyle   = 'padding:8px 16px;border:1.5px solid #eee;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;background:#f8f8f8;color:#555';
  mBtn.style.cssText = val === 'male'   ? activeStyle : idleStyle;
  fBtn.style.cssText = val === 'female' ? activeStyle : idleStyle;
}

async function loadWorkerProfileForm() {
  if (!currentUser) return;
  const { data: w } = await db.from('workers').select('name, phone, age, birth_date, bio, experience, gender, education, region, skills, vehicles, strengths, languages, photo_url, activity_area, activity_lat, activity_lng, notify_enabled, notify_categories, notify_min_wage, ai_prefs')
    .eq('kakao_uid', currentUser.id).single();
  // pref_categories, avail_days, avail_times는 DDL 추가 후 위 SELECT에 포함할 것
  let wExtra = null;
  try {
    const { data: _we } = await db.from('workers').select('pref_categories, avail_days, avail_times')
      .eq('kakao_uid', currentUser.id).maybeSingle();
    wExtra = _we;
  } catch(e) { /* 컬럼 미존재 시 무시 */ }
  if (!w) return;
  // 아바타: photo_url → 소셜 → 이니셜 우선순위
  {
    const inner = document.getElementById('header-avatar-inner');
    if (inner) {
      if (w.photo_url) {
        const _fc = (currentUser?.user_metadata?.full_name || currentUser?.email || '?').charAt(0);
        inner.innerHTML = `<img src="${w.photo_url}?t=${Date.now()}" style="width:100%;height:100%;object-fit:cover" onerror="this.parentElement.innerHTML=_initialAvatar('${_fc}',58)">`;
      } else {
        const meta2 = currentUser?.user_metadata || {};
        const identityAvatar = (currentUser.identities || []).find(i => i.identity_data?.avatar_url)?.identity_data?.avatar_url;
        const socialAvatar = meta2.avatar_url || meta2.picture || identityAvatar || null;
        if (socialAvatar) {
          const initChar = (meta2.full_name || currentUser.email || '?').charAt(0);
          inner.innerHTML = `<img src="${socialAvatar}" style="width:100%;height:100%;object-fit:cover" onerror="this.parentElement.innerHTML=_initialAvatar('${initChar}',58)">`;
        } else {
          inner.innerHTML = _initialAvatar((meta2.full_name || currentUser.email || '?').charAt(0), 58);
        }
      }
    }
  }
  // 포트폴리오 사진 로드
  loadWorkerPhotos().catch(() => {});
  // 증빙서류 상태 확인
  const { data: certFiles } = await db.storage.from('health-certs').list(currentUser.id);
  if (certFiles?.length) {
    const fileNames = certFiles.map(f => f.name);
    const certChecks = [
      { key: 'health-cert',    id: 'cert-status-health' },
      { key: 'driver-license', id: 'cert-status-driver' },
      { key: 'food-hygiene',   id: 'cert-status-food' },
      { key: 'sanitation',     id: 'cert-status-sanitation' },
    ];
    certChecks.forEach(({ key, id }) => {
      if (fileNames.some(n => n.startsWith(key))) {
        const el = document.getElementById(id);
        if (el) { el.textContent = '✅ 등록됨'; el.style.color = '#16a34a'; }
      }
    });
  }
  loadOtherCerts().catch(() => {});
  const birthEl = document.getElementById('worker-birth');
  if (w.birth_date) {
    birthEl.value = w.birth_date;
    updateAgePreview(w.birth_date);
  } else if (w.age) {
    birthEl.placeholder = `저장된 나이: 만 ${w.age}세 (생년월일 입력 시 갱신)`;
  }
  _workerSkills = Array.isArray(w.skills) ? [...w.skills] : [];
  renderSkillTags();
  renderVehicleChips(Array.isArray(w.vehicles) ? w.vehicles : []);
  renderStrengthChips(Array.isArray(w.strengths) ? w.strengths : []);
  renderLangAbilityChips(Array.isArray(w.languages) ? w.languages : []);
  const meta = currentUser?.user_metadata || {};
  const rawPhone = w.phone || meta.phone || '';
  document.getElementById('worker-phone').value = rawPhone.replace(/^(\d{3})(\d{3,4})(\d{4})$/, '$1-$2-$3');
  document.getElementById('worker-bio').value = w.bio || '';
  updateBioCounter(document.getElementById('worker-bio'));
  document.getElementById('worker-experience').value = w.experience || '';
  document.getElementById('worker-region').value = w.region || '';
  // 주요 활동 지역 복원
  _activityLat = w.activity_lat || null;
  _activityLng = w.activity_lng || null;
  _activityAreaName = w.activity_area || '';
  const selEl = document.getElementById('activity-area-selected');
  const tagEl = document.getElementById('activity-area-tag');
  if (_activityAreaName && selEl && tagEl) {
    tagEl.textContent = '📍 ' + _activityAreaName;
    selEl.style.display = 'flex';
  }
  if (w.gender) setGender(w.gender);
  // 희망직종 복원 (wExtra에서 읽음 — DDL 추가 전까지 별도 쿼리)
  _prefCats = Array.isArray(wExtra?.pref_categories) ? [...wExtra.pref_categories] : [];
  document.querySelectorAll('#pref-cat-chips .pref-cat-chip').forEach(btn => btn.classList.toggle('on', _prefCats.includes(btn.dataset.cat)));
  // 근무가능 요일/시간대 복원
  _availDays = Array.isArray(wExtra?.avail_days) ? [...wExtra.avail_days] : [];
  _availTimes = Array.isArray(wExtra?.avail_times) ? [...wExtra.avail_times] : [];
  document.querySelectorAll('#avail-day-btns .avail-day-btn').forEach(btn => btn.classList.toggle('on', _availDays.includes(btn.dataset.day)));
  document.querySelectorAll('#avail-time-chips .pref-cat-chip').forEach(btn => btn.classList.toggle('on', _availTimes.includes(btn.dataset.time)));
  _workerEdu = w.education || null;
  document.querySelectorAll('#edu-chips .edu-chip').forEach(el => {
    el.classList.toggle('active', el.dataset.edu === (w.education || ''));
  });
  // 알림 설정 복원
  const notifyOn = !!w.notify_enabled;
  const notifyToggle = document.getElementById('notify-enabled-toggle');
  if (notifyToggle) {
    notifyToggle.checked = notifyOn;
    document.getElementById('notify-track').style.background = notifyOn ? 'var(--red)' : '#ddd';
    document.getElementById('notify-thumb').style.left = notifyOn ? '22px' : '2px';
    document.getElementById('notify-pref-body').style.display = notifyOn ? 'block' : 'none';
    _notifyCategories = Array.isArray(w.notify_categories) ? [...w.notify_categories] : [];
    document.getElementById('notify-min-wage').value = w.notify_min_wage || '';
    if (notifyOn) _buildNotifyCatChips();
  }
  // ai_prefs: 서버값이 더 많은 신호면 로컬에 덮어쓰기 (기기 간 동기화)
  if (w.ai_prefs && typeof w.ai_prefs === 'object') {
    try {
      const localRaw = localStorage.getItem(_aiKey());
      const local = localRaw ? JSON.parse(localRaw) : { totalSignals: 0 };
      if ((w.ai_prefs.totalSignals || 0) > (local.totalSignals || 0)) {
        localStorage.setItem(_aiKey(), JSON.stringify(w.ai_prefs));
        renderAiRecommendations();
      }
    } catch(e) {}
  }
  else if (meta.gender) setGender(meta.gender);
  // 모든 필드 세팅 완료 후 완성도 + 섹션 요약 업데이트
  setTimeout(() => { updateProfileCompletion(); updateAllProfileSummaries(); }, 0);
}

async function loadWorkerGrade() {
  if (!currentUser) return;
  const { data: w, error: _wErr } = await db.from('workers')
    .select('rating, review_count, noshow_count, age, birth_date, is_available_now').eq('kakao_uid', currentUser.id).maybeSingle();
  if (_wErr) console.warn('loadWorkerGrade workers query:', _wErr.code, _wErr.message);

  // 바로출근 토글
  const avSec = document.getElementById('available-now-section');
  if (avSec) {
    avSec.style.display = 'block';
    _setAvailableNowUI(!!w?.is_available_now);
  }

  // 나이 헤더 반영
  const ageEl = document.getElementById('profile-age');
  if (ageEl) {
    const age = w?.age || (w?.birth_date ? calcAgeFromBirth(w.birth_date) : null);
    ageEl.textContent = age ? `· ${age}세` : '';
    _myAge = age;
  }

  // 팔로잉 섹션
  _loadMyFollows().then(() => _renderFollowingSection());

  // stats 그리드
  const statsGrid = document.getElementById('worker-stats-grid');
  if (statsGrid) {
    statsGrid.style.display = 'grid';
    const { data: apps } = await db.from('applications')
      .select('id, noshow, completed_at')
      .eq('worker_id', (await _getWorkerId()) || '');
    const total = apps?.length || 0;
    const done  = apps?.filter(a => a.completed_at && !a.noshow).length || 0;
    document.getElementById('stat-apply-count').textContent = total;
    document.getElementById('stat-complete-count').textContent = done;
    document.getElementById('stat-rating').textContent = w?.rating ? `★${w.rating.toFixed(1)}` : '-';
    const _ts = document.getElementById('stat-trust-score');
    if (_ts) _ts.textContent = (w && parseInt(w?.review_count || 0) > 0) ? `${calcBakalbaScore(w)}점` : '-';
    const mpApply = document.getElementById('mp-apply-val');
    if (mpApply) mpApply.textContent = total > 0 ? `${total}건` : '';
    const mpRating = document.getElementById('mp-rating-val');
    if (mpRating) mpRating.textContent = w?.rating ? `★${w.rating.toFixed(1)}` : '';
    loadWorkerIncome();
    loadUserPoints();
    loadMyAlbaPreview();
    loadMyMoimPreview();
    loadMyBaromeetPreview();
  }

  const rating  = w?.rating      || 0;
  const reviews = w?.review_count || 0;
  const noshows = w?.noshow_count || 0;
  const isQuick = rating >= QUICK_GRADE.minRating && reviews >= QUICK_GRADE.minReviews && noshows === 0;

  const badge = document.getElementById('worker-grade-badge');
  const progress = document.getElementById('worker-grade-progress');

  const inlineBadge = document.getElementById('profile-grade-inline');
  if (isQuick) {
    badge.innerHTML = t('grade_quick_badge');
    badge.style.color = '#F59E0B';
    progress.innerHTML = `<span style="color:#22c55e;font-weight:700">${t('grade_quick_unlock_msg')}</span> · ${t('grade_quick_daily_limit')}`;
    if (inlineBadge) { inlineBadge.textContent = t('grade_quick_short'); inlineBadge.style.cssText += ';background:#FEF3C7;color:#D97706;display:inline-block'; }
    // 번개등급 신규 달성 감지 → 알림
    const gradeKey = `quick_grade_notified_${currentUser?.id}`;
    if (!localStorage.getItem(gradeKey)) {
      localStorage.setItem(gradeKey, '1');
      setTimeout(() => showToast(t('grade_congrats_toast')), 800);
    }
  } else {
    badge.innerHTML = t('grade_normal_badge');
    badge.style.color = '#888';
    const rOk = rating >= QUICK_GRADE.minRating;
    const cOk = reviews >= QUICK_GRADE.minReviews;
    const nOk = noshows === 0;
    progress.innerHTML = `
      <div style="font-weight:700;color:#555;margin-bottom:4px">${t('grade_progress_title')}</div>
      <div style="color:${rOk?'#22c55e':'#EF4444'}">
        ${rOk?'✅':'❌'} ${t('grade_cond_rating').replace('{n}', QUICK_GRADE.minRating).replace('{cur}', rating ? rating.toFixed(1) : t('no_data_label'))}
      </div>
      <div style="color:${cOk?'#22c55e':'#EF4444'}">
        ${cOk?'✅':'❌'} ${t('grade_cond_completed').replace('{n}', QUICK_GRADE.minReviews).replace('{cur}', reviews)}
      </div>
      <div style="color:${nOk?'#22c55e':'#EF4444'}">
        ${nOk?'✅':'❌'} ${t('grade_cond_noshow').replace('{cur}', noshows)}
      </div>`;
  }
}

function showGradeInfoModal() {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:3000;display:flex;align-items:flex-end;justify-content:center';
  overlay.innerHTML = `
    <div style="background:#fff;border-radius:24px 24px 0 0;padding:28px 24px 40px;width:100%;max-width:480px">
      <div style="font-size:20px;font-weight:900;color:#222;margin-bottom:20px">${t('grade_modal_title')}</div>
      <div style="background:#FFF9E6;border:1.5px solid #FCD34D;border-radius:14px;padding:16px;margin-bottom:16px">
        <div style="font-size:13px;font-weight:900;color:#D97706;margin-bottom:8px">${t('grade_modal_cond_title')}</div>
        <div style="font-size:13px;color:#555;line-height:2">
          ✅ ${t('grade_modal_cond_rating').replace('{n}', QUICK_GRADE.minRating)}<br>
          ✅ ${t('grade_modal_cond_completed').replace('{n}', QUICK_GRADE.minReviews)}<br>
          ✅ ${t('grade_modal_cond_noshow')}
        </div>
      </div>
      <div style="background:#FFF0F0;border-radius:14px;padding:16px;margin-bottom:16px">
        <div style="font-size:13px;font-weight:900;color:#C8102E;margin-bottom:8px">${t('grade_modal_benefit_title')}</div>
        <div style="font-size:13px;color:#555;line-height:2">
          \u{1F51D} ${t('grade_modal_benefit_1')}<br>
          ⚡ ${t('grade_modal_benefit_2')}<br>
          \u{1F680} ${t('grade_modal_benefit_3')}
        </div>
      </div>
      <div style="background:#F0FFF4;border-radius:14px;padding:16px;margin-bottom:20px">
        <div style="font-size:13px;font-weight:900;color:#16a34a;margin-bottom:8px">${t('grade_modal_normal_title')}</div>
        <div style="font-size:13px;color:#555;line-height:2">
          · ${t('grade_modal_normal_1')}<br>
          · ${t('grade_modal_normal_2')}
        </div>
      </div>
      <div style="font-size:11px;color:#aaa;margin-bottom:16px;text-align:center">${t('grade_modal_footer')}</div>
      <button class="modal-close-btn" style="width:100%;padding:14px;background:var(--red);color:#fff;border:none;border-radius:14px;font-size:15px;font-weight:800;cursor:pointer">${t('btn_confirm')}</button>
    </div>`;
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  overlay.querySelector('.modal-close-btn').addEventListener('click', () => overlay.remove());
  document.body.appendChild(overlay);
}

function updateAgePreview(val) {
  const preview = document.getElementById('age-preview');
  if (val.length !== 6) { preview.textContent = ''; return; }
  const age = calcAgeFromBirth(val);
  preview.textContent = age ? `만 ${age}세` : '';
}

let _incomeWorkerId = null;

async function loadWorkerIncome() {
  const sec = document.getElementById('income-section');
  if (!sec || !currentUser) return;

  // worker ID 캐싱
  if (!_incomeWorkerId) {
    _incomeWorkerId = await _getWorkerId();
    if (!_incomeWorkerId) return;
  }

  sec.style.display = 'block';
  _initIncomeSelectors();

  const yearSel  = document.getElementById('income-year-sel');
  const monthSel = document.getElementById('income-month-sel');
  const selY = parseInt(yearSel?.value  || new Date().getFullYear());
  const selM = parseInt(monthSel?.value ?? new Date().getMonth());

  // 선택 월 데이터
  const from = new Date(selY, selM, 1).toISOString();
  const to   = new Date(selY, selM + 1, 0, 23, 59, 59).toISOString();
  const { data: apps } = await db.from('applications')
    .select('completed_at, job_postings(title, current_wage, duration_hours, wage_type, category)')
    .eq('worker_id', _incomeWorkerId)
    .eq('status', 'completed')
    .gte('completed_at', from)
    .lte('completed_at', to)
    .order('completed_at', { ascending: false });

  const list = apps || [];
  const calcEarned = a => {
    const jp = a.job_postings || {};
    const w = jp.current_wage || 0;
    const h = jp.duration_hours || 1;
    return (jp.wage_type === 'daily' || jp.wage_type === 'per-job') ? w : w * h;
  };
  const monthTotal = list.reduce((s, a) => s + calcEarned(a), 0);

  const labelEl = document.getElementById('income-month-label');
  const totalEl = document.getElementById('income-total');
  const countEl = document.getElementById('income-count');
  if (labelEl) labelEl.textContent = `${selY}년 ${selM + 1}월 수입`;
  if (totalEl) totalEl.textContent = monthTotal > 0 ? monthTotal.toLocaleString() + '원' : '완료된 근무 없음';
  if (countEl) countEl.textContent = list.length > 0 ? `근무 ${list.length}건` : '';

  // 해당 월 목록
  const listEl = document.getElementById('income-list');
  if (listEl) {
    listEl.innerHTML = list.length ? list.map(a => {
      const jp = a.job_postings || {};
      const earned = calcEarned(a);
      const d = new Date(a.completed_at);
      return `<div style="display:flex;align-items:center;justify-content:space-between;background:#fff;border:1px solid #f0f0f0;border-radius:12px;padding:10px 14px">
        <div>
          <div style="font-size:13px;font-weight:800;color:#222">${jp.title || '근무 완료'}</div>
          <div style="font-size:11px;color:#aaa;margin-top:2px">${d.getMonth()+1}/${d.getDate()} · ${jp.duration_hours || '-'}시간 · ${jp.category || ''}</div>
        </div>
        <div style="font-size:14px;font-weight:900;color:#15803d;white-space:nowrap">+${earned > 0 ? earned.toLocaleString() + '원' : '-'}</div>
      </div>`;
    }).join('') : '<div style="text-align:center;font-size:12px;color:#bbb;padding:10px 0">이 달 완료된 근무가 없습니다</div>';
  }

  // 12개월 바차트 (비동기)
  _loadIncomeChart(selY, selM);
}

function _initIncomeSelectors() {
  const yearSel  = document.getElementById('income-year-sel');
  const monthSel = document.getElementById('income-month-sel');
  if (!yearSel || yearSel.options.length > 0) return; // 이미 초기화됨
  const now = new Date();
  for (let y = now.getFullYear(); y >= now.getFullYear() - 2; y--) {
    const opt = document.createElement('option');
    opt.value = y; opt.textContent = y + '년';
    if (y === now.getFullYear()) opt.selected = true;
    yearSel.appendChild(opt);
  }
  for (let m = 0; m < 12; m++) {
    const opt = document.createElement('option');
    opt.value = m; opt.textContent = (m + 1) + '월';
    if (m === now.getMonth()) opt.selected = true;
    monthSel.appendChild(opt);
  }
}

async function _loadIncomeChart(selY, selM) {
  const chartEl  = document.getElementById('income-chart');
  const labelsEl = document.getElementById('income-chart-labels');
  const cumEl    = document.getElementById('income-cumulative');
  if (!chartEl || !_incomeWorkerId) return;

  // 지난 12개월치 조회
  const now = new Date();
  const chartFrom = new Date(now.getFullYear(), now.getMonth() - 11, 1).toISOString();
  const { data: allApps } = await db.from('applications')
    .select('completed_at, job_postings(current_wage, duration_hours, wage_type)')
    .eq('worker_id', _incomeWorkerId)
    .eq('status', 'completed')
    .gte('completed_at', chartFrom)
    .order('completed_at', { ascending: true });

  // 월별 합산
  const monthly = {};
  (allApps || []).forEach(a => {
    const d = new Date(a.completed_at);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const jp = a.job_postings || {};
    const w = jp.current_wage || 0, h = jp.duration_hours || 1;
    const earned = (jp.wage_type === 'daily' || jp.wage_type === 'per-job') ? w : w * h;
    monthly[key] = (monthly[key] || 0) + earned;
  });

  // 12개월 슬롯 생성
  const slots = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    slots.push({ y: d.getFullYear(), m: d.getMonth(), key: `${d.getFullYear()}-${d.getMonth()}`, amount: monthly[`${d.getFullYear()}-${d.getMonth()}`] || 0 });
  }

  const maxAmt = Math.max(...slots.map(s => s.amount), 1);
  const cumulative = slots.reduce((s, sl) => s + sl.amount, 0);
  if (cumEl) cumEl.textContent = cumulative > 0 ? cumulative.toLocaleString() + '원' : '-';

  const monthNames = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
  chartEl.innerHTML = slots.map(sl => {
    const pct = maxAmt > 0 ? Math.max(Math.round((sl.amount / maxAmt) * 100), sl.amount > 0 ? 6 : 2) : 2;
    const isSel = sl.y === selY && sl.m === selM;
    const color = isSel ? '#C8102E' : (sl.amount > 0 ? '#22c55e' : '#e5e7eb');
    return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%">
      <div title="${sl.amount > 0 ? sl.amount.toLocaleString() + '원' : '없음'}" style="width:100%;background:${color};border-radius:4px 4px 0 0;height:${pct}%;min-height:2px;cursor:pointer" onclick="document.getElementById('income-year-sel').value=${sl.y};document.getElementById('income-month-sel').value=${sl.m};loadWorkerIncome()"></div>
    </div>`;
  }).join('');

  if (labelsEl) labelsEl.innerHTML = slots.map(sl =>
    `<div style="flex:1;text-align:center;font-size:9px;color:${sl.y===selY&&sl.m===selM?'#C8102E':'#aaa'};font-weight:${sl.y===selY&&sl.m===selM?'900':'600'}">${monthNames[sl.m]}</div>`
  ).join('');
}

// ── 크롭 모달 ────────────────────────────────────────
let _cropper = null;
let _cropCallback = null;

function openCropModal(file, callback, aspectRatio = 1) {
  if (file.size > 15 * 1024 * 1024) { showToast('15MB 이하 이미지만 업로드 가능합니다'); return; }
  const reader = new FileReader();
  reader.onload = e => {
    window._cropSourceUrl = e.target.result; // 원본 dataURL 저장 (applyCrop 직접 그리기용)
    const img = document.getElementById('crop-source');
    img.src = e.target.result;
    document.getElementById('crop-modal').style.display = 'flex';
    if (_cropper) { _cropper.destroy(); _cropper = null; }
    img.onload = () => {
      _cropper = new Cropper(img, {
        aspectRatio: aspectRatio,
        viewMode: 1,
        dragMode: 'move',
        autoCropArea: 0.85,
        guides: false,
        center: true,
        highlight: false,
        cropBoxMovable: true,
        cropBoxResizable: true,
        toggleDragModeOnDblclick: false,
      });
    };
    _cropCallback = callback;
  };
  reader.readAsDataURL(file);
}

function closeCropModal() {
  document.getElementById('crop-modal').style.display = 'none';
  if (_cropper) { _cropper.destroy(); _cropper = null; }
  _cropCallback = null;
}

function applyCrop() {
  if (!_cropper || !_cropCallback) return;
  const cb = _cropCallback;
  const d = _cropper.getData(true);
  closeCropModal();
  const src = window._cropSourceUrl;
  if (!src) { showToast('❌ 원본 이미지 없음'); return; }
  const img2 = new Image();
  img2.onerror = () => showToast('❌ 이미지 로드 실패');
  img2.onload = () => {
    try {
      console.log('[crop] 이미지 로드됨, 크기:', img2.naturalWidth, 'x', img2.naturalHeight, '크롭:', d);
      const c = document.createElement('canvas');
      c.width = 400; c.height = 400;
      c.getContext('2d').drawImage(img2, d.x, d.y, d.width, d.height, 0, 0, 400, 400);
      c.toBlob(blob => {
        if (!blob) { console.error('[crop] toBlob 결과 null'); showToast('이미지 변환 실패', 5000); return; }
        console.log('[crop] blob 생성 성공, 크기:', blob.size);
        cb(blob);
      }, 'image/jpeg', 0.88);
    } catch(e) {
      console.error('[crop] onload 오류:', e);
      showToast('크롭 처리 실패: ' + e.message, 5000);
    }
  };
  img2.src = src;
}

// ── Storage 업로드 ────────────────────────────────────
async function uploadAvatar(input) {
  const file = input.files[0];
  if (!file || !currentUser) { input.value = ''; return; }
  input.value = '';
  openCropModal(file, blob => {
    _pendingAvatarBlob = blob;
    const inner = document.getElementById('header-avatar-inner');
    if (inner) {
      const fc = (currentUser?.user_metadata?.full_name || currentUser?.email || '?').charAt(0);
      const url = URL.createObjectURL(blob);
      inner.innerHTML = `<img src="${url}" style="width:100%;height:100%;object-fit:cover" onerror="this.parentElement.innerHTML=_initialAvatar('${fc}',58)">`;
    }
    showToast('✅ 사진 준비됨 — 저장하기를 눌러주세요');
  });
}

// ── 포트폴리오 사진 (다중, 최대 5장) ─────────────────────
async function loadWorkerPhotos() {
  if (!currentUser) return;
  const prefix = `${currentUser.id}`;
  const { data: files, error } = await db.storage.from('biz-photos').list(prefix);
  if (error) { console.error('loadWorkerPhotos error:', error); return; }
  const photos = (files || [])
    .filter(f => f.name.startsWith('portfolio_'))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(f => ({
      id: f.name,
      photo_url: db.storage.from('biz-photos').getPublicUrl(`${prefix}/${f.name}`).data.publicUrl
    }));
  _renderWorkerPhotos(photos);
}

let _wPhotos = [], _wDragSrcId = null, _pendingAvatarBlob = null;
let _activityLat = null, _activityLng = null, _activityAreaName = '';

function _renderWorkerPhotos(photos) {
  _wPhotos = photos;
  const grid = document.getElementById('worker-photos-grid');
  const addBtn = document.getElementById('worker-photos-add-btn');
  const countEl = document.getElementById('worker-photos-count');
  if (!grid) return;
  countEl.textContent = `${photos.length}/5`;
  grid.innerHTML = photos.map((p, i) => `
    <div draggable="true" data-photo-id="${p.id}"
      ondragstart="wPhotoDragStart(event,'${p.id}')"
      ondragover="wPhotoDragOver(event)"
      ondragenter="wPhotoDragEnter(event,this)"
      ondragleave="wPhotoDragLeave(event,this)"
      ondrop="wPhotoDrop(event,'${p.id}',this)"
      onclick="openImgViewer('${p.photo_url}')"
      style="position:relative;aspect-ratio:1;border-radius:10px;overflow:hidden;background:#e5e7eb;cursor:pointer">
      <img src="${p.photo_url}" style="width:100%;height:100%;object-fit:cover;pointer-events:none">
      <span style="position:absolute;bottom:3px;left:4px;background:rgba(0,0,0,0.45);color:#fff;font-size:9px;font-weight:800;padding:1px 5px;border-radius:4px;pointer-events:none">${i+1}</span>
      <button onclick="event.stopPropagation();deleteWorkerPhoto('${p.id}')" style="position:absolute;top:4px;right:4px;width:22px;height:22px;border-radius:50%;background:rgba(0,0,0,0.5);color:#fff;border:none;font-size:13px;cursor:pointer;line-height:1;display:flex;align-items:center;justify-content:center">✕</button>
    </div>`).join('');
  addBtn.style.display = photos.length < 5 ? 'flex' : 'none';
  _setupTouchDnd(grid, () => {});
}

function wPhotoDragStart(e, photoId) { _wDragSrcId = photoId; e.dataTransfer.effectAllowed = 'move'; }
function wPhotoDragOver(e) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }
function wPhotoDragEnter(e, el) { e.preventDefault(); if (!el.contains(e.relatedTarget)) { el.style.outline = '3px solid #C8102E'; el.style.outlineOffset = '-3px'; } }
function wPhotoDragLeave(e, el) { if (!el.contains(e.relatedTarget)) { el.style.outline = ''; el.style.outlineOffset = ''; } }
function wPhotoDrop(e, photoId, el) {
  e.preventDefault();
  el.style.outline = ''; el.style.outlineOffset = '';
  _wDragSrcId = null;
}

function _setupTouchDnd(grid, swapFn, attr = 'data-photo-id') {
  document.querySelectorAll('.dnd-ghost').forEach(g => g.remove());
  let srcEl = null, ghostEl = null;
  const sel = '[' + attr + ']';
  const cleanup = () => {
    if (ghostEl) { ghostEl.remove(); ghostEl = null; }
    if (srcEl) { srcEl.style.opacity = ''; srcEl = null; }
    grid.querySelectorAll('[draggable]').forEach(c => { c.style.outline = ''; c.style.outlineOffset = ''; });
  };
  grid.querySelectorAll('[draggable]').forEach(el => {
    el.addEventListener('touchstart', e => {
      cleanup();
      srcEl = el;
      const r = el.getBoundingClientRect();
      ghostEl = el.cloneNode(true);
      ghostEl.classList.add('dnd-ghost');
      Object.assign(ghostEl.style, {
        position:'fixed', zIndex:'9999', pointerEvents:'none', opacity:'0.75',
        width: r.width+'px', height: r.height+'px', top: r.top+'px', left: r.left+'px',
        borderRadius:'10px', boxShadow:'0 8px 24px rgba(0,0,0,0.3)', transition:'none'
      });
      document.body.appendChild(ghostEl);
      el.style.opacity = '0.3';
    }, { passive: true });
    el.addEventListener('touchmove', e => {
      if (!ghostEl) return;
      e.preventDefault();
      const t = e.touches[0];
      ghostEl.style.left = (t.clientX - ghostEl.offsetWidth / 2) + 'px';
      ghostEl.style.top  = (t.clientY - ghostEl.offsetHeight / 2) + 'px';
      ghostEl.style.visibility = 'hidden';
      const under = document.elementFromPoint(t.clientX, t.clientY);
      ghostEl.style.visibility = '';
      grid.querySelectorAll('[draggable]').forEach(c => { c.style.outline = ''; c.style.outlineOffset = ''; });
      const tgt = under?.closest(sel);
      if (tgt && tgt !== srcEl) { tgt.style.outline = '3px solid #C8102E'; tgt.style.outlineOffset = '-3px'; }
    }, { passive: false });
    el.addEventListener('touchend', e => {
      const savedSrc = srcEl;
      cleanup();
      const t = e.changedTouches[0];
      const under = document.elementFromPoint(t.clientX, t.clientY);
      const tgt = under?.closest(sel);
      if (tgt && savedSrc && tgt !== savedSrc) swapFn(savedSrc.getAttribute(attr), tgt.getAttribute(attr));
    }, { passive: true });
    el.addEventListener('touchcancel', cleanup, { passive: true });
  });
}

async function uploadWorkerPhoto(input) {
  const files = [...input.files];
  input.value = '';
  if (!files.length || !currentUser) return;
  const available = 5 - _wPhotos.length;
  if (available <= 0) { showToast('최대 5장까지 등록 가능합니다'); return; }
  const toProcess = files.slice(0, available);
  if (files.length > available) showToast(`${available}장만 추가 가능합니다`);

  if (toProcess.length === 1) {
    openCropModal(toProcess[0], blob => {
      _renderWorkerPhotos([..._wPhotos, { id: 'pending_' + Date.now(), photo_url: URL.createObjectURL(blob), blob }]);
      showToast('저장하기를 눌러 사진을 확정하세요');
    });
  } else {
    for (const file of toProcess) {
      const blob = await new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = e => {
          const img = new Image();
          img.onload = () => {
            const sz = Math.min(img.width, img.height, 1200);
            const c = document.createElement('canvas');
            c.width = c.height = sz;
            c.getContext('2d').drawImage(img, (img.width-sz)/2, (img.height-sz)/2, sz, sz, 0, 0, sz, sz);
            c.toBlob(resolve, 'image/jpeg', 0.85);
          };
          img.src = e.target.result;
        };
        reader.readAsDataURL(file);
      });
      if (blob) _renderWorkerPhotos([..._wPhotos, { id: 'pending_' + Date.now(), photo_url: URL.createObjectURL(blob), blob }]);
    }
    showToast(`${toProcess.length}장 추가됨 — 저장하기를 눌러 확정하세요`);
  }
}

async function deleteWorkerPhoto(photoId) {
  const photo = _wPhotos.find(p => p.id === photoId);
  if (!photo) return;
  if (photo.blob) {
    URL.revokeObjectURL(photo.photo_url);
    _renderWorkerPhotos(_wPhotos.filter(p => p.id !== photoId));
    return;
  }
  const path = `${currentUser.id}/${photoId}`;
  const { error } = await db.storage.from('biz-photos').remove([path]);
  if (error) { showToast('삭제 실패: ' + error.message); return; }
  _renderWorkerPhotos(_wPhotos.filter(p => p.id !== photoId));
}

function searchActivityArea() {
  const q = document.getElementById('activity-area-input').value.trim();
  if (!q) return;
  const geocoder = new kakao.maps.services.Geocoder();
  geocoder.addressSearch(q, (result, status) => {
    if (status === kakao.maps.services.Status.OK && result.length) {
      _showActivityResults(result.slice(0, 5).map(r => ({ name: r.address_name, lat: parseFloat(r.y), lng: parseFloat(r.x) })));
    } else {
      // 주소 검색 실패 → 키워드 검색으로 fallback
      const ps = new kakao.maps.services.Places();
      ps.keywordSearch(q, (data, pStatus) => {
        if (pStatus !== kakao.maps.services.Status.OK || !data.length) {
          showToast('검색 결과가 없습니다'); return;
        }
        _showActivityResults(data.slice(0, 5).map(p => ({ name: p.address_name || p.place_name, lat: parseFloat(p.y), lng: parseFloat(p.x) })));
      }, { size: 5 });
    }
  });
}

function _showActivityResults(items) {
  const el = document.getElementById('activity-area-results');
  el.style.display = 'block';
  el.innerHTML = items.map((item, i) =>
    `<div onclick="_selectActivityArea('${item.name.replace(/'/g,"\\'")}',${item.lat},${item.lng})"
      style="padding:10px 14px;font-size:13px;color:#333;cursor:pointer;${i > 0 ? 'border-top:1px solid #f0f0f0' : ''}">
      &#128205; ${item.name}
    </div>`
  ).join('');
}

function _selectActivityArea(name, lat, lng) {
  _activityAreaName = name;
  _activityLat = lat;
  _activityLng = lng;
  document.getElementById('activity-area-input').value = '';
  document.getElementById('activity-area-results').style.display = 'none';
  const tag = document.getElementById('activity-area-tag');
  const sel = document.getElementById('activity-area-selected');
  if (tag) tag.textContent = '📍 ' + name;
  if (sel) sel.style.display = 'flex';
}

function clearActivityArea() {
  _activityAreaName = '';
  _activityLat = null;
  _activityLng = null;
  document.getElementById('activity-area-input').value = '';
  document.getElementById('activity-area-results').style.display = 'none';
  const sel = document.getElementById('activity-area-selected');
  if (sel) sel.style.display = 'none';
}

const CERT_META = {
  health:     { label: '보건증',            file: 'health-cert',   statusId: 'cert-status-health' },
  driver:     { label: '운전면허증',         file: 'driver-license', statusId: 'cert-status-driver' },
  food:       { label: '식품위생사 자격증',   file: 'food-hygiene',  statusId: 'cert-status-food' },
  sanitation: { label: '위생교육 수료증',     file: 'sanitation',    statusId: 'cert-status-sanitation' },
};

// ── 증빙서류 메타 관리 (Supabase storage _meta.json) ────────
async function getDocMeta() {
  try {
    const { data } = await db.storage.from('health-certs').download(`${currentUser.id}/_meta.json`);
    if (!data) return {};
    return JSON.parse(await data.text());
  } catch { return {}; }
}

async function setDocMeta(meta) {
  const blob = new Blob([JSON.stringify(meta)], { type:'application/json' });
  await db.storage.from('health-certs').upload(`${currentUser.id}/_meta.json`, blob, { upsert:true });
}

function renderOtherCertItem(filename, displayName, signedUrl) {
  const fn = filename.replace(/'/g, "\\'");
  const listEl = document.getElementById('other-cert-list');
  if (!listEl) return;
  const item = document.createElement('div');
  item.dataset.path = filename;
  item.style.cssText = 'padding:10px 12px;background:#fff;border-radius:10px;border:1px solid #e5e7eb';
  item.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px">
      <span style="font-size:15px;flex-shrink:0">📎</span>
      <a href="${signedUrl||'#'}" target="_blank" style="flex:1;font-size:13px;font-weight:600;color:#222;text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${displayName}">${displayName}</a>
      <div style="display:flex;gap:5px;flex-shrink:0">
        <button type="button" onclick="renameOtherCert('${fn}')" style="font-size:11px;color:#fff;background:#C8102E;border:none;border-radius:6px;padding:5px 10px;cursor:pointer;white-space:nowrap">수정</button>
        <label style="font-size:11px;color:#fff;background:#C8102E;border-radius:6px;padding:5px 10px;cursor:pointer;white-space:nowrap;display:inline-block">파일<input type="file" accept="image/*,application/pdf" style="display:none" onchange="reuploadOtherCert('${fn}',this)"></label>
        <button type="button" onclick="deleteOtherCert('${fn}')" style="font-size:11px;color:#C8102E;background:#fee2e2;border:none;border-radius:6px;padding:5px 10px;cursor:pointer;white-space:nowrap">삭제</button>
      </div>
    </div>`;
  listEl.appendChild(item);
}

async function loadOtherCerts() {
  if (!currentUser) return;
  const listEl = document.getElementById('other-cert-list');
  if (!listEl) return;
  listEl.innerHTML = '';
  const { data: files } = await db.storage.from('health-certs').list(currentUser.id);
  if (!files?.length) return;
  const otherFiles = files.filter(f => f.name.startsWith('other-'));
  if (!otherFiles.length) return;
  const meta = await getDocMeta();
  for (const f of otherFiles) {
    const displayName = meta[f.name] || f.name.replace(/^other-\d+-?/, '').replace(/\.[^.]+$/, '') || '기타서류';
    const { data: urlData } = await db.storage.from('health-certs').createSignedUrl(`${currentUser.id}/${f.name}`, 3600);
    renderOtherCertItem(f.name, displayName, urlData?.signedUrl || '');
  }
}

async function renameOtherCert(filename) {
  const newName = prompt('새 서류명을 입력하세요:', '');
  if (!newName?.trim()) return;
  const meta = await getDocMeta();
  meta[filename] = newName.trim();
  await setDocMeta(meta);
  const el = document.querySelector(`[data-path="${filename}"] a`);
  if (el) { el.textContent = newName.trim(); el.title = newName.trim(); }
  showToast('✅ 이름이 변경됐습니다');
}

async function reuploadOtherCert(filename, input) {
  const file = input.files[0];
  if (!file || !currentUser) return;
  if (file.size > 10 * 1024 * 1024) { showToast('10MB 이하 파일만 가능합니다'); return; }
  showToast('업로드 중...');
  const ext = file.name.split('.').pop();
  const meta = await getDocMeta();
  const displayName = meta[filename] || filename;
  // Delete old file
  await db.storage.from('health-certs').remove([`${currentUser.id}/${filename}`]);
  // Upload new file with same display name but new timestamp
  const newFilename = `other-${Date.now()}.${ext}`;
  const { error } = await db.storage.from('health-certs').upload(`${currentUser.id}/${newFilename}`, file, { upsert:false });
  if (error) { showToast('업로드 실패: ' + error.message); return; }
  delete meta[filename];
  meta[newFilename] = displayName;
  await setDocMeta(meta);
  await loadOtherCerts();
  showToast('✅ 파일이 변경됐습니다');
}

function deleteOtherCert(filename) {
  showConfirm('삭제 후 복구할 수 없습니다.', async () => {
    await db.storage.from('health-certs').remove([`${currentUser.id}/${filename}`]);
    const meta = await getDocMeta();
    delete meta[filename];
    await setDocMeta(meta);
    const el = document.querySelector(`[data-path="${filename}"]`);
    if (el) el.remove();
    showToast('삭제됐습니다');
  }, {icon:'🗑️', title:'서류 삭제', okLabel:'삭제', danger:true});
}

async function uploadDoc(certType, input) {
  const file = input.files[0];
  if (!file || !currentUser) return;
  if (file.size > 10 * 1024 * 1024) { showToast('10MB 이하 파일만 업로드 가능합니다'); return; }
  showToast('업로드 중...');
  const ext = file.name.split('.').pop();

  if (certType === 'other') {
    const nameInput = document.getElementById('other-cert-name');
    const certName = nameInput?.value.trim();
    if (!certName) { showToast('서류명을 먼저 입력해주세요'); input.value = ''; return; }
    const filename = `other-${Date.now()}.${ext}`;
    const { error } = await db.storage.from('health-certs').upload(`${currentUser.id}/${filename}`, file, { upsert:false });
    if (error) { showToast('업로드 실패: ' + error.message); return; }
    const meta = await getDocMeta();
    meta[filename] = certName;
    await setDocMeta(meta);
    const { data: urlData } = await db.storage.from('health-certs').createSignedUrl(`${currentUser.id}/${filename}`, 3600);
    renderOtherCertItem(filename, certName, urlData?.signedUrl || '');
    if (nameInput) nameInput.value = '';
    showToast(`✅ ${certName} 등록됐습니다`);
    return;
  }

  const meta = CERT_META[certType];
  if (!meta) return;
  const path = `${currentUser.id}/${meta.file}.${ext}`;
  const { error } = await db.storage.from('health-certs').upload(path, file, { upsert: true });
  if (error) { showToast('업로드 실패: ' + error.message); return; }
  const statusEl = document.getElementById(meta.statusId);
  if (statusEl) { statusEl.textContent = '✅ 등록됨'; statusEl.style.color = '#16a34a'; }
  showToast(`✅ ${meta.label} 등록됐습니다`);
}

// ── 이동수단 & 강점 & 언어 태그 ──────────────────────────
let _workerVehicles = [];
let _workerStrengths = [];
let _workerLanguages = [];
let _prefCats = [];
let _availDays = [];
let _availTimes = [];

function togglePrefCat(btn) {
  const cat = btn.dataset.cat;
  const idx = _prefCats.indexOf(cat);
  if (idx >= 0) { _prefCats.splice(idx, 1); btn.classList.remove('on'); }
  else { _prefCats.push(cat); btn.classList.add('on'); }
}
function toggleAvailDay(btn) {
  const day = btn.dataset.day;
  const idx = _availDays.indexOf(day);
  if (idx >= 0) { _availDays.splice(idx, 1); btn.classList.remove('on'); }
  else { _availDays.push(day); btn.classList.add('on'); }
}
function toggleAvailTime(btn) {
  const time = btn.dataset.time;
  const idx = _availTimes.indexOf(time);
  if (idx >= 0) { _availTimes.splice(idx, 1); btn.classList.remove('on'); }
  else { _availTimes.push(time); btn.classList.add('on'); }
}

// ── 온보딩 튜토리얼 ──────────────────────────────────────
const _OB_KEY = 'baroalba_ob_v2';
let _obStep = 0;
const _OB_SLIDES = [
  {
    bg: 'linear-gradient(145deg,#fff1f2,#ffe4e6)',
    illus: `<svg width="160" height="160" viewBox="0 0 160 160" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="80" cy="78" r="66" fill="#C8102E" opacity="0.07"/>
      <circle cx="80" cy="78" r="46" fill="#C8102E" opacity="0.1"/>
      <circle cx="80" cy="74" r="34" fill="#C8102E"/>
      <circle cx="80" cy="74" r="27" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="2"/>
      <text x="80" y="85" font-size="26" fill="white" font-weight="900" text-anchor="middle" font-family="-apple-system,Arial,sans-serif">&#8361;</text>
      <circle cx="30" cy="60" r="13" fill="#fca5a5"/>
      <text x="30" y="65" font-size="11" fill="#9f1239" font-weight="800" text-anchor="middle" font-family="Arial,sans-serif">&#8361;</text>
      <circle cx="132" cy="50" r="10" fill="#fecdd3"/>
      <text x="132" y="55" font-size="9" fill="#be123c" font-weight="800" text-anchor="middle" font-family="Arial,sans-serif">&#8361;</text>
      <path d="M118 24 L113 38 L120 36 L115 52" stroke="#C8102E" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.5"/>
      <rect x="50" y="117" width="60" height="22" rx="11" fill="#C8102E" opacity="0.9"/>
      <text x="80" y="132" font-size="11" fill="white" font-weight="800" text-anchor="middle" font-family="-apple-system,Arial,sans-serif">&#45817;&#51068; &#51221;&#49328;</text>
      <path d="M36 98 L36 87 M33 91 L36 87 L39 91" stroke="#C8102E" stroke-width="2" stroke-linecap="round" opacity="0.4"/>
      <path d="M48 104 L48 96 M45 100 L48 96 L51 100" stroke="#C8102E" stroke-width="2" stroke-linecap="round" opacity="0.3"/>
    </svg>`,
    title: '일한 당일,\n통장에 바로 꽂힌다',
    desc: '기다림은 없다. 일하고 집에 가는 길\n이미 입금 완료입니다',
    chips: ['💰 당일 정산', '⚡ 즉시 매칭', '🔔 실시간 알림']
  },
  {
    bg: 'linear-gradient(145deg,#f0fdf4,#dcfce7)',
    illus: `<svg width="160" height="160" viewBox="0 0 160 160" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="80" cy="80" r="66" fill="#16a34a" opacity="0.07"/>
      <circle cx="80" cy="80" r="48" fill="#16a34a" opacity="0.1"/>
      <rect x="46" y="28" width="68" height="104" rx="12" fill="white" stroke="#bbf7d0" stroke-width="2"/>
      <rect x="52" y="34" width="56" height="82" rx="8" fill="#f0fdf4"/>
      <line x1="52" y1="55" x2="108" y2="55" stroke="#bbf7d0" stroke-width="1"/>
      <line x1="52" y1="76" x2="108" y2="76" stroke="#bbf7d0" stroke-width="1"/>
      <line x1="52" y1="97" x2="108" y2="97" stroke="#bbf7d0" stroke-width="1"/>
      <line x1="73" y1="34" x2="73" y2="116" stroke="#bbf7d0" stroke-width="1"/>
      <line x1="94" y1="34" x2="94" y2="116" stroke="#bbf7d0" stroke-width="1"/>
      <circle cx="78" cy="67" r="11" fill="#C8102E"/>
      <path d="M78 72 L78 81" stroke="#C8102E" stroke-width="2.5" stroke-linecap="round"/>
      <circle cx="78" cy="64" r="4.5" fill="white"/>
      <circle cx="95" cy="55" r="8" fill="#16a34a" opacity="0.85"/>
      <path d="M95 59 L95 66" stroke="#16a34a" stroke-width="2" stroke-linecap="round"/>
      <circle cx="63" cy="82" r="6.5" fill="#f59e0b" opacity="0.85"/>
      <path d="M63 87 L63 93" stroke="#f59e0b" stroke-width="1.5" stroke-linecap="round"/>
      <circle cx="83" cy="90" r="9" fill="white" stroke="#3b82f6" stroke-width="2.5"/>
      <circle cx="83" cy="90" r="4.5" fill="#3b82f6"/>
      <circle cx="83" cy="90" r="14" fill="none" stroke="#3b82f6" stroke-width="1.2" opacity="0.3"/>
    </svg>`,
    title: '지금 내 주변\n일자리가 보인다',
    desc: '걸어갈 수 있는 거리의 공고를\n지도에서 바로 발견하세요',
    chips: ['📍 위치 기반', '🗺 지도 탐색', '🔍 스마트 필터']
  },
  {
    bg: 'linear-gradient(145deg,#eef2ff,#e0e7ff)',
    illus: `<svg width="160" height="160" viewBox="0 0 160 160" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="80" cy="80" r="66" fill="#6366f1" opacity="0.07"/>
      <circle cx="80" cy="80" r="48" fill="#6366f1" opacity="0.1"/>
      <circle cx="80" cy="78" r="35" fill="#eef2ff" opacity="0.7" stroke="#c7d2fe" stroke-width="2.5"/>
      <ellipse cx="80" cy="78" rx="17" ry="35" fill="none" stroke="#c7d2fe" stroke-width="1.5"/>
      <line x1="45" y1="78" x2="115" y2="78" stroke="#c7d2fe" stroke-width="1.5"/>
      <path d="M49 61 Q80 56 111 61" stroke="#c7d2fe" stroke-width="1" fill="none"/>
      <path d="M49 95 Q80 100 111 95" stroke="#c7d2fe" stroke-width="1" fill="none"/>
      <circle cx="80" cy="78" r="5" fill="#6366f1"/>
      <line x1="80" y1="52" x2="80" y2="73" stroke="#6366f1" stroke-width="1" opacity="0.4" stroke-dasharray="3,2"/>
      <line x1="108" y1="58" x2="84" y2="76" stroke="#6366f1" stroke-width="1" opacity="0.4" stroke-dasharray="3,2"/>
      <line x1="115" y1="84" x2="85" y2="79" stroke="#6366f1" stroke-width="1" opacity="0.4" stroke-dasharray="3,2"/>
      <line x1="97" y1="100" x2="82" y2="82" stroke="#6366f1" stroke-width="1" opacity="0.4" stroke-dasharray="3,2"/>
      <line x1="64" y1="100" x2="78" y2="82" stroke="#6366f1" stroke-width="1" opacity="0.4" stroke-dasharray="3,2"/>
      <line x1="45" y1="84" x2="75" y2="79" stroke="#6366f1" stroke-width="1" opacity="0.4" stroke-dasharray="3,2"/>
      <line x1="52" y1="58" x2="76" y2="76" stroke="#6366f1" stroke-width="1" opacity="0.4" stroke-dasharray="3,2"/>
      <circle cx="80" cy="40" r="13" fill="#C8102E"/>
      <text x="80" y="46" font-size="9" fill="white" font-weight="800" text-anchor="middle" font-family="Arial,sans-serif">KR</text>
      <circle cx="110" cy="54" r="12" fill="#3b82f6"/>
      <text x="110" y="60" font-size="9" fill="white" font-weight="800" text-anchor="middle" font-family="Arial,sans-serif">EN</text>
      <circle cx="117" cy="86" r="12" fill="#dc2626"/>
      <text x="117" y="92" font-size="9" fill="#fde047" font-weight="800" text-anchor="middle" font-family="Arial,sans-serif">CN</text>
      <circle cx="97" cy="112" r="12" fill="#dc2626"/>
      <text x="97" y="118" font-size="9" fill="white" font-weight="800" text-anchor="middle" font-family="Arial,sans-serif">JA</text>
      <circle cx="63" cy="112" r="12" fill="#dc2626"/>
      <text x="63" y="118" font-size="9" fill="#fde047" font-weight="800" text-anchor="middle" font-family="Arial,sans-serif">VN</text>
      <circle cx="43" cy="86" r="12" fill="#1d4ed8"/>
      <text x="43" y="92" font-size="9" fill="white" font-weight="800" text-anchor="middle" font-family="Arial,sans-serif">MN</text>
      <circle cx="50" cy="54" r="12" fill="#1d4ed8"/>
      <text x="50" y="60" font-size="9" fill="white" font-weight="800" text-anchor="middle" font-family="Arial,sans-serif">RU</text>
    </svg>`,
    title: '7개 언어로\n누구나 바로 취업',
    desc: '한국어·영어·중국어·일본어\n베트남어·러시아어·몽골어\n공고 검색부터 채팅까지 완벽 지원',
    chips: ['🌍 7개국어 완벽 지원', '🤝 외국인 환영', '💬 번역 채팅']
  },
  {
    bg: 'linear-gradient(145deg,#fffbeb,#fef3c7)',
    illus: `<svg width="160" height="160" viewBox="0 0 160 160" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="80" cy="80" r="66" fill="#f59e0b" opacity="0.08"/>
      <circle cx="80" cy="80" r="48" fill="#f59e0b" opacity="0.1"/>
      <circle cx="80" cy="80" r="20" fill="#fef9c3" stroke="#fbbf24" stroke-width="2.5"/>
      <path d="M73 80 L78 85 L89 74" stroke="#f59e0b" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="80" cy="30" r="15" fill="#fde68a" stroke="#fbbf24" stroke-width="2"/>
      <circle cx="80" cy="26" r="7" fill="#f59e0b" opacity="0.75"/>
      <path d="M72 36 Q80 41 88 36" stroke="#f59e0b" stroke-width="2" fill="none" stroke-linecap="round"/>
      <circle cx="130" cy="80" r="15" fill="#fed7aa" stroke="#fb923c" stroke-width="2"/>
      <circle cx="130" cy="76" r="7" fill="#f97316" opacity="0.75"/>
      <path d="M122 86 Q130 91 138 86" stroke="#f97316" stroke-width="2" fill="none" stroke-linecap="round"/>
      <circle cx="80" cy="130" r="15" fill="#bbf7d0" stroke="#22c55e" stroke-width="2"/>
      <circle cx="80" cy="126" r="7" fill="#16a34a" opacity="0.75"/>
      <path d="M72 136 Q80 141 88 136" stroke="#16a34a" stroke-width="2" fill="none" stroke-linecap="round"/>
      <circle cx="30" cy="80" r="15" fill="#bfdbfe" stroke="#3b82f6" stroke-width="2"/>
      <circle cx="30" cy="76" r="7" fill="#2563eb" opacity="0.75"/>
      <path d="M22 86 Q30 91 38 86" stroke="#2563eb" stroke-width="2" fill="none" stroke-linecap="round"/>
      <line x1="80" y1="45" x2="80" y2="60" stroke="#fbbf24" stroke-width="1.5" stroke-dasharray="4,2"/>
      <line x1="115" y1="80" x2="100" y2="80" stroke="#fbbf24" stroke-width="1.5" stroke-dasharray="4,2"/>
      <line x1="80" y1="115" x2="80" y2="100" stroke="#fbbf24" stroke-width="1.5" stroke-dasharray="4,2"/>
      <line x1="45" y1="80" x2="60" y2="80" stroke="#fbbf24" stroke-width="1.5" stroke-dasharray="4,2"/>
    </svg>`,
    title: '같이 일할 사람\n바로 모아라',
    desc: '팀 모집부터 스포츠·스터디까지\n바로알바에서 함께 성장하세요',
    chips: ['🤝 팀 모집', '⚽ 스포츠 모임', '📚 스터디 그룹']
  },
  {
    bg: 'linear-gradient(145deg,#f0f9ff,#e0f2fe)',
    illus: `<svg width="160" height="160" viewBox="0 0 160 160" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="80" cy="80" r="66" fill="#0284c7" opacity="0.07"/>
      <circle cx="80" cy="80" r="48" fill="#0284c7" opacity="0.1"/>
      <rect x="40" y="26" width="70" height="94" rx="10" fill="white" stroke="#bae6fd" stroke-width="2"/>
      <rect x="62" y="20" width="26" height="17" rx="8.5" fill="#0284c7" opacity="0.85"/>
      <rect x="50" y="50" width="50" height="8" rx="4" fill="#bae6fd"/>
      <rect x="50" y="64" width="38" height="6" rx="3" fill="#e0f2fe"/>
      <rect x="50" y="76" width="44" height="6" rx="3" fill="#e0f2fe"/>
      <rect x="50" y="88" width="32" height="6" rx="3" fill="#e0f2fe"/>
      <rect x="50" y="100" width="42" height="6" rx="3" fill="#e0f2fe"/>
      <circle cx="110" cy="108" r="25" fill="#16a34a"/>
      <path d="M100 108 L107 115 L122 100" stroke="white" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="22" cy="80" r="11" fill="#7dd3fc"/>
      <path d="M13 96 Q22 91 31 96" stroke="#0284c7" stroke-width="2" fill="none" stroke-linecap="round"/>
      <path d="M35 80 L46 80 M42 76 L46 80 L42 84" stroke="#0284c7" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`,
    title: '공고 올리면\n지원자가 알아서 온다',
    desc: '3분이면 공고 등록 완료\n실시간 알림으로 지원자를 바로 만나세요',
    chips: ['📋 빠른 공고 등록', '👥 지원자 관리', '💬 실시간 채팅']
  }
];
let _obTouchX = 0;
function showOnboarding() {
  const el = document.getElementById('onboarding-overlay');
  if (!el) return;
  _obStep = 0;
  _renderObSlide();
  el.style.display = 'flex';
  const illus = document.getElementById('ob-illus');
  if (illus) {
    illus.addEventListener('touchstart', e => { _obTouchX = e.touches[0].clientX; }, { passive: true });
    illus.addEventListener('touchend', e => {
      const dx = e.changedTouches[0].clientX - _obTouchX;
      if (Math.abs(dx) > 40) { if (dx < 0) obNext(); else obPrev(); }
    }, { passive: true });
  }
}
function closeOnboarding() {
  const el = document.getElementById('onboarding-overlay');
  if (el) el.style.display = 'none';
  localStorage.setItem(_OB_KEY, '1');
}
function _renderObSlide() {
  const s = _OB_SLIDES[_obStep];
  const illus = document.getElementById('ob-illus');
  if (illus) {
    illus.style.opacity = '0';
    illus.style.transition = 'opacity 0.2s';
    setTimeout(() => {
      illus.style.background = s.bg;
      illus.innerHTML = s.illus;
      illus.style.opacity = '1';
    }, 150);
  }
  const titleEl = document.getElementById('ob-title');
  const descEl = document.getElementById('ob-desc');
  if (titleEl) { titleEl.style.opacity='0'; setTimeout(()=>{ titleEl.textContent=s.title; titleEl.style.transition='opacity 0.25s'; titleEl.style.opacity='1'; },150); }
  if (descEl) { descEl.style.opacity='0'; setTimeout(()=>{ descEl.textContent=s.desc; descEl.style.transition='opacity 0.25s'; descEl.style.opacity='1'; },150); }
  const chips = document.getElementById('ob-chips');
  if (chips) { chips.style.opacity='0'; setTimeout(()=>{ chips.innerHTML=s.chips.map(c=>`<span style="background:#f5f5f5;color:#333;font-size:13px;font-weight:700;padding:6px 14px;border-radius:20px">${c}</span>`).join(''); chips.style.transition='opacity 0.25s'; chips.style.opacity='1'; },200); }
  document.querySelectorAll('#onboarding-overlay .ob-dot').forEach((d, i) => d.classList.toggle('active', i === _obStep));
  const backBtn = document.getElementById('ob-back-btn');
  if (backBtn) backBtn.style.visibility = _obStep > 0 ? 'visible' : 'hidden';
  document.getElementById('ob-next-btn').textContent = _obStep === _OB_SLIDES.length - 1 ? '시작하기' : '다음';
}
function obNext() {
  if (_obStep < _OB_SLIDES.length - 1) { _obStep++; _renderObSlide(); }
  else closeOnboarding();
}
function obPrev() {
  if (_obStep > 0) { _obStep--; _renderObSlide(); }
}
function obGoTo(i) {
  if (i >= 0 && i < _OB_SLIDES.length && i !== _obStep) { _obStep = i; _renderObSlide(); }
}

function toggleVehicle(el) {
  const v = el.dataset.v;
  if (_workerVehicles.includes(v)) {
    _workerVehicles = _workerVehicles.filter(x => x !== v);
    el.classList.remove('active');
  } else {
    _workerVehicles.push(v);
    el.classList.add('active');
  }
}

function toggleStrength(el) {
  const s = el.dataset.s;
  if (_workerStrengths.includes(s)) {
    _workerStrengths = _workerStrengths.filter(x => x !== s);
    el.classList.remove('active');
  } else {
    if (_workerStrengths.length >= 5) { showToast('강점은 최대 5개까지 선택 가능합니다'); return; }
    _workerStrengths.push(s);
    el.classList.add('active');
  }
}

function toggleProfileSection(id) {
  const body = document.getElementById(id + '-body');
  const arrow = document.getElementById(id + '-arrow');
  if (!body) return;
  const isOpen = body.style.display !== 'none';
  if (isOpen) {
    updateProfileSectionSummary(id);
    body.style.display = 'none';
    if (arrow) arrow.textContent = '▼';
  } else {
    body.style.display = 'block';
    if (arrow) arrow.textContent = '▲';
  }
}

function updateProfileSectionSummary(id) {
  const el = document.getElementById(id + '-summary');
  if (!el) return;
  let text = '';
  if (id === 'vehicles') {
    const sel = [...document.querySelectorAll('#vehicle-chips .v-chip.active')].map(b => b.textContent.trim());
    text = sel.length ? sel.join(' · ') : '미선택';
  } else if (id === 'strengths') {
    const sel = [...document.querySelectorAll('#strength-chips .s-chip.active')].map(b => b.textContent.trim());
    text = sel.length ? (sel.slice(0, 3).join(' · ') + (sel.length > 3 ? ' 외 ' + (sel.length - 3) + '개' : '')) : '미선택';
  } else if (id === 'languages') {
    const preset = [...document.querySelectorAll('#lang-ability-chips .l-chip.active')].map(b => b.textContent.trim().split(' ').slice(-1)[0]);
    const others = _workerLanguages.filter(e => parseLangEntry(e).type === 'other').map(e => parseLangEntry(e).name);
    const all = [...preset, ...others];
    text = all.length ? all.join(' · ') : '미선택';
  }
  el.textContent = text;
}

function updateAllProfileSummaries() {
  ['vehicles', 'strengths', 'languages'].forEach(id => updateProfileSectionSummary(id));
}

function renderVehicleChips(arr) {
  _workerVehicles = arr || [];
  document.querySelectorAll('#vehicle-chips .v-chip').forEach(el => {
    el.classList.toggle('active', _workerVehicles.includes(el.dataset.v));
  });
}

function renderStrengthChips(arr) {
  _workerStrengths = arr || [];
  document.querySelectorAll('#strength-chips .s-chip').forEach(el => {
    el.classList.toggle('active', _workerStrengths.includes(el.dataset.s));
  });
}

// ── 언어 숙련도 ─────────────────────────────────────────
const LANG_LABELS = { ko:'🇰🇷 한국어', en:'🇺🇸 영어', zh:'🇨🇳 중국어', ja:'🇯🇵 일본어', vi:'🇻🇳 베트남어', ru:'🇷🇺 러시아어', mn:'🇲🇳 몽골어' };
let _langProfTarget = null;  // { type:'preset'|'other', code, name }
let _langProfLevels = { speak:'중', read:'중', write:'중' };

function parseLangEntry(entry) {
  if (entry.includes('::')) {
    const p = entry.split('::');
    if (p[0] === 'other') return { type:'other', code:'other::'+p[1], name:p[1], speak:p[2]||'중', read:p[3]||'중', write:p[4]||'중' };
    return { type:'preset', code:p[0], speak:p[1]||'중', read:p[2]||'중', write:p[3]||'중' };
  }
  if (entry.startsWith('other:')) return { type:'other', code:'other::'+entry.slice(6), name:entry.slice(6), speak:'중', read:'중', write:'중' };
  return { type:'preset', code:entry, speak:'중', read:'중', write:'중' };
}

function encodeLangEntry(p) {
  if (p.type === 'other') return `other::${p.name}::${p.speak}::${p.read}::${p.write}`;
  return `${p.code}::${p.speak}::${p.read}::${p.write}`;
}

function toggleLangAbility(el) {
  const code = el.dataset.l;
  const existing = _workerLanguages.find(e => parseLangEntry(e).code === code);
  _langProfTarget = { type:'preset', code };
  if (existing) {
    const p = parseLangEntry(existing);
    _langProfLevels = { speak:p.speak, read:p.read, write:p.write };
    openLangProfPanel(LANG_LABELS[code] || code, true);
  } else {
    _langProfLevels = { speak:'중', read:'중', write:'중' };
    openLangProfPanel(LANG_LABELS[code] || code, false);
  }
}

function addOtherLang() {
  const input = document.getElementById('lang-other-input');
  const val = input.value.trim();
  if (!val) return;
  const exists = _workerLanguages.some(e => { const p = parseLangEntry(e); return p.type === 'other' && p.name === val; });
  if (exists) { showToast('이미 추가된 언어입니다'); return; }
  _langProfTarget = { type:'other', name:val };
  _langProfLevels = { speak:'중', read:'중', write:'중' };
  openLangProfPanel('🌐 ' + val, false);
}

function openLangProfPanel(displayName, isEdit) {
  const panel = document.getElementById('lang-prof-panel');
  if (!panel) return;
  document.getElementById('lang-prof-title').textContent = displayName + ' 숙련도 설정';
  ['speak','read','write'].forEach(skill => {
    document.querySelectorAll(`#lang-prof-${skill} .lang-level-btn`).forEach(btn => {
      btn.classList.toggle('active', btn.dataset.v === _langProfLevels[skill]);
    });
  });
  document.getElementById('lang-prof-remove-btn').style.display = isEdit ? '' : 'none';
  panel.style.display = '';
  panel.scrollIntoView({ behavior:'smooth', block:'nearest' });
}

function setLangLevel(btn) {
  const skill = btn.dataset.skill;
  _langProfLevels[skill] = btn.dataset.v;
  btn.closest('div').querySelectorAll('.lang-level-btn').forEach(b => b.classList.toggle('active', b === btn));
}

function confirmLangProficiency() {
  if (!_langProfTarget) return;
  const { speak, read, write } = _langProfLevels;
  if (_langProfTarget.type === 'preset') {
    const code = _langProfTarget.code;
    _workerLanguages = _workerLanguages.filter(e => parseLangEntry(e).code !== code);
    _workerLanguages.push(`${code}::${speak}::${read}::${write}`);
    updatePresetLangChips();
  } else {
    const name = _langProfTarget.name;
    _workerLanguages = _workerLanguages.filter(e => { const p = parseLangEntry(e); return !(p.type === 'other' && p.name === name); });
    _workerLanguages.push(`other::${name}::${speak}::${read}::${write}`);
    const input = document.getElementById('lang-other-input');
    if (input) input.value = '';
    renderOtherLangChips();
  }
  cancelLangProficiency();
}

function cancelLangProficiency() {
  const panel = document.getElementById('lang-prof-panel');
  if (panel) panel.style.display = 'none';
  _langProfTarget = null;
}

function removeLangProficiency() {
  if (!_langProfTarget) return;
  if (_langProfTarget.type === 'preset') {
    const code = _langProfTarget.code;
    _workerLanguages = _workerLanguages.filter(e => parseLangEntry(e).code !== code);
    updatePresetLangChips();
  } else {
    const name = _langProfTarget.name;
    _workerLanguages = _workerLanguages.filter(e => { const p = parseLangEntry(e); return !(p.type === 'other' && p.name === name); });
    renderOtherLangChips();
  }
  cancelLangProficiency();
}

function updatePresetLangChips() {
  document.querySelectorAll('#lang-ability-chips .l-chip').forEach(el => {
    const code = el.dataset.l;
    const entry = _workerLanguages.find(e => parseLangEntry(e).code === code);
    if (entry) {
      const p = parseLangEntry(entry);
      el.classList.add('active');
      el.textContent = (LANG_LABELS[code] || code) + ` · ${p.speak}/${p.read}/${p.write}`;
    } else {
      el.classList.remove('active');
      el.textContent = LANG_LABELS[code] || code;
    }
  });
}

function renderOtherLangChips() {
  const others = _workerLanguages.filter(e => parseLangEntry(e).type === 'other');
  const container = document.getElementById('lang-other-chips');
  if (!container) return;
  container.innerHTML = others.map(e => {
    const p = parseLangEntry(e);
    const key = e.replace(/'/g, "\\'");
    return `<span class="l-chip active" style="display:inline-flex;align-items:center;gap:4px;cursor:pointer" onclick="editOtherLang('${key}')">🌐 ${p.name} · ${p.speak}/${p.read}/${p.write}<button type="button" onclick="event.stopPropagation();removeOtherLangByName('${p.name.replace(/'/g,"\\'")}')" style="background:none;border:none;cursor:pointer;font-size:11px;color:inherit;padding:0;line-height:1;margin-left:2px">✕</button></span>`;
  }).join('');
}

function editOtherLang(entry) {
  const p = parseLangEntry(entry);
  _langProfTarget = { type:'other', name:p.name };
  _langProfLevels = { speak:p.speak, read:p.read, write:p.write };
  openLangProfPanel('🌐 ' + p.name, true);
}

function removeOtherLangByName(name) {
  _workerLanguages = _workerLanguages.filter(e => { const p = parseLangEntry(e); return !(p.type === 'other' && p.name === name); });
  renderOtherLangChips();
}

function renderLangAbilityChips(arr) {
  _workerLanguages = (arr || []);
  updatePresetLangChips();
  renderOtherLangChips();
}

// ── 스킬 태그 ──────────────────────────────────────────
let _workerSkills = [];

function renderSkillTags() {
  const el = document.getElementById('skill-tags');
  if (!el) return;
  el.innerHTML = _workerSkills.map((s, i) =>
    `<span style="display:inline-flex;align-items:center;gap:4px;background:#fff;border:1.5px solid #eee;padding:5px 10px;border-radius:20px;font-size:12px;font-weight:700;color:#444">
      ${s}
      <button onclick="removeSkillTag(${i})" style="background:none;border:none;color:#bbb;cursor:pointer;font-size:14px;line-height:1;padding:0">×</button>
    </span>`
  ).join('');
  updateProfileCompletion();
}

function addSkillTag() {
  const input = document.getElementById('skill-input');
  const val = input.value.trim();
  if (!val || _workerSkills.includes(val) || _workerSkills.length >= 15) return;
  _workerSkills.push(val);
  input.value = '';
  renderSkillTags();
}

function removeSkillTag(idx) {
  _workerSkills.splice(idx, 1);
  renderSkillTags();
}

function updateProfileCompletion() {
  const wrap = document.getElementById('profile-completion-wrap');
  if (!wrap) return;
  wrap.style.display = 'block';
  const checks = [
    { label: '생년월일', ok: !!calcAgeFromBirth(document.getElementById('worker-birth')?.value) },
    { label: '연락처',   ok: (document.getElementById('worker-phone')?.value || '').replace(/-/g,'').length >= 10 },
    { label: '성별',     ok: !!_workerGender },
    { label: '거주지',   ok: !!document.getElementById('worker-region')?.value },
    { label: '자기소개', ok: (document.getElementById('worker-bio')?.value?.trim().length || 0) > 10 },
    { label: '경력/특기',ok: !!document.getElementById('worker-experience')?.value },
    { label: '학력',     ok: !!_workerEdu },
    { label: '스킬 태그',ok: _workerSkills.length > 0 },
  ];
  const done = checks.filter(c => c.ok).length;
  const pct = Math.round(done / checks.length * 100);
  document.getElementById('completion-pct').textContent = pct + '%';
  document.getElementById('completion-bar').style.width = pct + '%';
  document.getElementById('completion-items').innerHTML = checks.map(c =>
    `<span style="font-size:11px;padding:2px 8px;border-radius:99px;font-weight:700;background:${c.ok?'#dcfce7':'#f3f4f6'};color:${c.ok?'#16a34a':'#aaa'}">${c.ok?'✓':'+'}${c.label}</span>`
  ).join('');
}

function calcAgeFromBirth(yymmdd) {
  if (!yymmdd || yymmdd.length !== 6) return null;
  const yy = parseInt(yymmdd.slice(0,2));
  const mm = parseInt(yymmdd.slice(2,4));
  const dd = parseInt(yymmdd.slice(4,6));
  if (!mm || !dd || mm > 12 || dd > 31) return null;
  const fullYear = yy <= new Date().getFullYear() % 100 ? 2000 + yy : 1900 + yy;
  const today = new Date();
  let age = today.getFullYear() - fullYear;
  if (today.getMonth() + 1 < mm || (today.getMonth() + 1 === mm && today.getDate() < dd)) age--;
  return age > 0 && age < 120 ? age : null;
}

async function saveWorkerProfile() {
  if (!currentUser) return;
  const birthVal = document.getElementById('worker-birth').value.trim();
  if (birthVal && !calcAgeFromBirth(birthVal)) {
    showToast('생년월일을 올바르게 입력해주세요 (예: 990115)');
    return;
  }
  const age = calcAgeFromBirth(birthVal) || null;
  const phone = document.getElementById('worker-phone').value.trim().replace(/-/g, '');
  const bio = document.getElementById('worker-bio').value.trim();
  if (bio.length > 0 && bio.length < 20) { showToast('자기소개는 20자 이상 입력해주세요'); return false; }
  const experience = document.getElementById('worker-experience').value.trim();
  const region = document.getElementById('worker-region').value.trim();
  const meta = currentUser.user_metadata || {};
  const name = meta.full_name || currentUser.email?.split('@')[0] || '알바생';
  const payload = { kakao_uid: currentUser.id, name, age, birth_date: birthVal || null, phone, bio, experience, region, skills: _workerSkills, vehicles: _workerVehicles, strengths: _workerStrengths, languages: _workerLanguages, activity_area: _activityAreaName || null, activity_lat: _activityLat, activity_lng: _activityLng, pref_categories: _prefCats, avail_days: _availDays, avail_times: _availTimes };
  if (_workerGender) payload.gender = _workerGender;
  if (_workerEdu) payload.education = _workerEdu;
  // 가입 시 저장된 국적·비자 정보 반영 (workers 테이블에 nationality, visa_type 미기입 상태일 때만)
  if (meta.nationality) payload.nationality = meta.nationality;
  if (meta.visa_type)   payload.visa_type   = meta.visa_type;
  const notifyOn = document.getElementById('notify-enabled-toggle')?.checked || false;
  payload.notify_enabled = notifyOn;
  payload.notify_categories = notifyOn ? _notifyCategories : [];
  payload.notify_min_wage = notifyOn ? (parseInt(document.getElementById('notify-min-wage')?.value) || 0) : 0;
  let { error } = await db.from('workers').upsert(payload, { onConflict: 'kakao_uid' });
  if (error?.message?.includes('languages')) {
    // languages 컬럼 미존재 → 없이 재저장 (DDL 실행 전 임시 처리)
    const { languages: _l, ...payloadNoLang } = payload;
    const res = await db.from('workers').upsert(payloadNoLang, { onConflict: 'kakao_uid' });
    error = res.error;
    if (!error) showToast('✅ 저장됐습니다 (언어는 DB 설정 후 적용됩니다)');
  } else if (!error) {
    showToast('✅ 프로필이 저장됐습니다');
  }
  if (error) { showToast('저장 실패: ' + error.message); return false; }
  loadWorkerGrade();
  updateProfileCompletion();
  return true;
}

async function loadOwnerProfileForm() {
  if (!currentUser) return;
  const { data: biz } = await db.from('businesses')
    .select('name, phone, description').eq('kakao_uid', currentUser.id).single();
  if (!biz) {
    // businesses 레코드 없으면 섹션 숨김
    document.getElementById('owner-profile-edit').style.display = 'none';
    return;
  }
  document.getElementById('owner-biz-name').value = biz.name || '';
  document.getElementById('owner-biz-phone').value = biz.phone || '';
  document.getElementById('owner-biz-desc').value = biz.description || '';
  // 업체명이 있으면 프로필 최상단 이름도 업체명으로 표시
  if (biz.name) document.getElementById('profile-name').textContent = biz.name;
}

async function saveOwnerProfile() {
  if (!currentUser) return true;
  const name = document.getElementById('owner-biz-name')?.value.trim();
  const phone = document.getElementById('owner-biz-phone')?.value.trim();
  const description = document.getElementById('owner-biz-desc')?.value.trim();
  if (!name) return true; // 업체명 없으면 조용히 통과 (비업주 계정)
  const { error } = await db.from('businesses')
    .update({ name, phone, description }).eq('kakao_uid', currentUser.id);
  if (error) { showToast('저장 실패: ' + error.message); return false; }
  return true;
}

async function saveAllProfileSettings() {
  if (!currentUser) return;
  const dKey = 'baro_disclaimer_' + currentUser.id;
  if (!localStorage.getItem(dKey)) {
    showDisclaimerSheet(() => { localStorage.setItem(dKey, '1'); _doSaveAllProfileSettings(); });
    return;
  }
  _doSaveAllProfileSettings();
}
async function _doSaveAllProfileSettings() {
  try {
    currentLang = _pendingLang;
    localStorage.setItem('baroalba_lang', currentLang);

    const pendingPortfolio = _wPhotos.filter(p => p.blob);

    console.log('[photo] blob 존재:', !!_pendingAvatarBlob, '| 포트폴리오:', pendingPortfolio.length);

    if (_pendingAvatarBlob) {
      const path = `${currentUser.id}/avatar_${Date.now()}.jpg`;
      console.log('[photo] Storage 업로드 시작:', path);
      const { error: upErr } = await db.storage.from('biz-photos').upload(path, _pendingAvatarBlob, { contentType: 'image/jpeg' });
      if (!upErr) {
        const newUrl = db.storage.from('biz-photos').getPublicUrl(path).data.publicUrl;
        console.log('[photo] Storage 업로드 성공, URL:', newUrl);
        const { error: dbErr } = await db.from('workers').upsert(
          { kakao_uid: currentUser.id, photo_url: newUrl },
          { onConflict: 'kakao_uid' }
        );
        if (dbErr) {
          console.error('[photo] DB 저장 실패:', dbErr);
          showToast('사진 저장 실패: ' + dbErr.message, 6000);
        } else {
          console.log('[photo] DB 저장 성공');
          showToast('사진 저장 완료', 4000);
        }
        if (bizRecord) await db.from('businesses').update({ photo_url: newUrl }).eq('kakao_uid', currentUser.id);
      } else {
        console.error('[photo] Storage 업로드 실패:', upErr);
        showToast('사진 업로드 실패: ' + upErr.message, 6000);
      }
      _pendingAvatarBlob = null;
    }
    for (const p of pendingPortfolio) {
      const path = `${currentUser.id}/portfolio_${Date.now()}_${Math.random().toString(36).slice(2,5)}.jpg`;
      const { error: upErr } = await db.storage.from('biz-photos').upload(path, p.blob, { contentType: 'image/jpeg' });
      if (!upErr) URL.revokeObjectURL(p.photo_url);
      else { console.error('[photo] 포트폴리오 실패:', upErr); showToast('포트폴리오 업로드 실패: ' + upErr.message, 6000); }
    }

    await saveWorkerProfile();
    await saveOwnerProfile();
    location.reload();
  } catch(e) {
    showToast('❌ 저장 오류: ' + e.message);
    console.error('[doSave]', e);
  }
}

function closeProfileIfBg(e) {
  void e;
}

function showAvatarTip(inputId) {
  const existing = document.getElementById('avatar-tip-overlay');
  if (existing) { existing.remove(); return; }
  const el = document.createElement('div');
  el.id = 'avatar-tip-overlay';
  el.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:9999;display:flex;align-items:flex-end';
  el.onclick = e => { if (e.target === el) el.remove(); };
  el.innerHTML = `
    <div style="background:#fff;border-radius:24px 24px 0 0;width:100%;padding:20px 20px 44px">
      <div style="width:32px;height:3px;background:#e5e7eb;border-radius:2px;margin:0 auto 22px"></div>
      <div style="margin-bottom:20px">
        <div style="font-size:18px;font-weight:900;color:#111;margin-bottom:4px">사진 등록</div>
        <div style="font-size:13px;color:#9ca3af">좋은 사진은 매칭 확률을 높여줍니다</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:24px">
        <div style="display:flex;align-items:center;gap:12px;padding:13px 14px;background:#f9fafb;border-radius:12px">
          <div style="width:24px;height:24px;border-radius:50%;background:#dcfce7;display:flex;align-items:center;justify-content:center;flex-shrink:0"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>
          <span style="font-size:14px;color:#374151;font-weight:600">얼굴이 잘 보이는 정면 사진</span>
        </div>
        <div style="display:flex;align-items:center;gap:12px;padding:13px 14px;background:#f9fafb;border-radius:12px">
          <div style="width:24px;height:24px;border-radius:50%;background:#dcfce7;display:flex;align-items:center;justify-content:center;flex-shrink:0"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>
          <span style="font-size:14px;color:#374151;font-weight:600">밝고 깔끔한 배경</span>
        </div>
        <div style="display:flex;align-items:center;gap:12px;padding:13px 14px;background:#f9fafb;border-radius:12px">
          <div style="width:24px;height:24px;border-radius:50%;background:#fee2e2;display:flex;align-items:center;justify-content:center;flex-shrink:0"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></div>
          <span style="font-size:14px;color:#6b7280;font-weight:500">단체 사진 · 풍경 사진</span>
        </div>
        <div style="display:flex;align-items:center;gap:12px;padding:13px 14px;background:#f9fafb;border-radius:12px">
          <div style="width:24px;height:24px;border-radius:50%;background:#fee2e2;display:flex;align-items:center;justify-content:center;flex-shrink:0"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></div>
          <span style="font-size:14px;color:#6b7280;font-weight:500">선글라스 · 마스크 착용 사진</span>
        </div>
      </div>
      <label style="display:flex;align-items:center;justify-content:center;width:100%;padding:16px;background:#C8102E;color:#fff;border-radius:16px;font-size:16px;font-weight:800;cursor:pointer;box-sizing:border-box;gap:8px">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
        사진 선택하기
        <input type="file" accept="image/*" style="display:none" onchange="document.getElementById('avatar-tip-overlay').remove();uploadAvatar(this)">
      </label>
    </div>`;
  document.body.appendChild(el);
}

function showDisclaimerSheet(onConfirm) {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:9999;display:flex;align-items:flex-end';
  el.innerHTML = `
    <div style="background:#fff;border-radius:24px 24px 0 0;width:100%;padding:24px 20px 40px">
      <div style="width:40px;height:4px;background:#eee;border-radius:2px;margin:0 auto 18px"></div>
      <div style="font-size:17px;font-weight:800;color:#222;margin-bottom:4px">&#9888;&#65039; 서비스 이용 동의</div>
      <div style="font-size:13px;color:#999;font-weight:400;margin-bottom:16px">아래 내용을 확인하고 동의해주세요</div>
      <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:20px">
        <div style="background:#f8f8f8;border-radius:12px;padding:12px 14px;font-size:13px;color:#555;font-weight:400;line-height:1.6">&#128286; 만 19세 이상만 이용 가능합니다</div>
        <div style="background:#f8f8f8;border-radius:12px;padding:12px 14px;font-size:13px;color:#555;font-weight:400;line-height:1.6">&#128683; 주류·담배·의약품 대리 구매 등 불법 매칭 시 즉시 계정 정지</div>
        <div style="background:#f8f8f8;border-radius:12px;padding:12px 14px;font-size:13px;color:#555;font-weight:400;line-height:1.6">&#128274; 타인 개인정보 유출 및 사기 행위 금지</div>
      </div>
      <button id="disclaimer-ok-btn" style="width:100%;padding:15px;background:#C8102E;color:#fff;border:none;border-radius:16px;font-size:15px;font-weight:800;cursor:pointer">동의하고 저장하기</button>
    </div>`;
  document.body.appendChild(el);
  el.querySelector('#disclaimer-ok-btn').onclick = () => { el.remove(); if (onConfirm) onConfirm(); };
}

function openAccountInfoModal() { document.getElementById('modal-account-info').style.display = 'block'; }
function closeAccountInfoModal() { document.getElementById('modal-account-info').style.display = 'none'; }
function openOwnerAccountInfoModal() { document.getElementById('modal-owner-account-info').style.display = 'block'; }
function closeOwnerAccountInfoModal() { document.getElementById('modal-owner-account-info').style.display = 'none'; }

async function submitProfilePw() {
  const pw  = document.getElementById('profile-new-pw').value;
  const pw2 = document.getElementById('profile-new-pw2').value;
  if (pw.length < 6) { showToast('비밀번호는 6자 이상이어야 해요'); return; }
  if (pw !== pw2)    { showToast('비밀번호가 일치하지 않아요'); return; }
  const { error } = await db.auth.updateUser({ password: pw });
  if (error) { showToast('변경 실패: ' + error.message); return; }
  showToast('✅ 비밀번호가 변경됐어요');
  document.getElementById('profile-new-pw').value = '';
  document.getElementById('profile-new-pw2').value = '';
  closeAccountInfoModal();
}

async function changePassword() {
  const pw  = document.getElementById('pw-change-new')?.value || '';
  const pw2 = document.getElementById('pw-change-confirm')?.value || '';
  const msg = document.getElementById('pw-change-msg');
  if (!msg) return;
  msg.style.display = 'none';
  if (pw.length < 6) { msg.textContent = '비밀번호는 6자 이상이어야 합니다.'; msg.style.color = '#C8102E'; msg.style.display = 'block'; return; }
  if (pw !== pw2)    { msg.textContent = '비밀번호가 일치하지 않습니다.'; msg.style.color = '#C8102E'; msg.style.display = 'block'; return; }
  const { error } = await db.auth.updateUser({ password: pw });
  if (error) { msg.textContent = '변경 실패: ' + error.message; msg.style.color = '#C8102E'; }
  else {
    msg.textContent = '✅ 비밀번호가 변경됐습니다.'; msg.style.color = '#16a34a';
    document.getElementById('pw-change-new').value = '';
    document.getElementById('pw-change-confirm').value = '';
  }
  msg.style.display = 'block';
}

function deleteUserAccount() {
  showConfirm('공고, 지원 이력 등 모든 데이터가 삭제됩니다.', async () => {
    const uid = currentUser?.id;
    if (!uid) return;
    const { data: biz } = await db.from('businesses').select('id').eq('kakao_uid', uid).single();
    if (biz?.id) {
      await db.from('job_postings').delete().eq('business_id', biz.id);
      await db.from('businesses').delete().eq('id', biz.id);
    }
    // 탈퇴 후에도 workers 테이블에 이름/전화번호/사진 등 개인정보가 그대로 남아있던 문제 수정 -
    // 지원이력(applications) 등 다른 테이블이 worker_id를 참조하므로 행 자체는 삭제하지 않고
    // 개인식별 정보만 익명화한다 (delete_user_account RPC는 auth 계정 삭제만 담당)
    await db.from('workers').update({
      name: '탈퇴한 사용자',
      phone: null,
      photo_url: null,
      birth_date: null,
      age: null,
      gender: null,
      region: null,
      bio: null,
    }).eq('kakao_uid', uid);
    const { error } = await db.rpc('delete_user_account', { uid });
    if (error) { showToast('탈퇴 실패: ' + error.message); return; }
    await db.auth.signOut();
    localStorage.removeItem('baroalba_guest');
    location.href = '/login.html';
  }, {icon:'🚫', title:'정말 탈퇴하시겠어요?', okLabel:'탈퇴', danger:true});
}

function goToLogin() {
  localStorage.removeItem('baroalba_guest');
  const jobId = new URLSearchParams(location.search).get('job') || (typeof selectedJobId !== 'undefined' && selectedJobId ? selectedJobId : null);
  if (jobId) sessionStorage.setItem('pending_deep_job', jobId);
  location.href = '/login.html';
}

function updateBioCounter(textarea) {
  const len = textarea.value.length;
  const counter = document.getElementById('worker-bio-counter');
  const hint    = document.getElementById('worker-bio-hint');
  if (!counter) return;
  counter.textContent = len + ' / 200';
  if (len === 0) {
    counter.style.color = '#bbb';
    if (hint) hint.style.display = 'none';
    textarea.style.borderColor = '#eee';
  } else if (len < 20) {
    counter.style.color = '#C8102E';
    if (hint) hint.style.display = 'block';
    textarea.style.borderColor = '#C8102E';
  } else {
    counter.style.color = '#16a34a';
    if (hint) hint.style.display = 'none';
    textarea.style.borderColor = '#16a34a';
  }
}

function saveNotiSetting(key, val) {
  localStorage.setItem('baro_noti_' + key, val ? '1' : '0');
  const track = document.getElementById('noti-track-' + key);
  const thumb = document.getElementById('noti-thumb-' + key);
  if (track) track.style.background = val ? 'var(--red)' : '#ddd';
  if (thumb) thumb.style.transform = val ? 'translateX(20px)' : 'translateX(0)';
}
function initNotiToggles() {
  ['chat','status','comment'].forEach(key => {
    const on = localStorage.getItem('baro_noti_' + key) !== '0'; // default ON
    const el = document.getElementById('noti-toggle-' + key);
    if (el) el.checked = on;
    saveNotiSetting(key, on);
  });
}
function getNotiSetting(key) {
  return localStorage.getItem('baro_noti_' + key) !== '0'; // default ON
}

async function doLogout() {
  window._myWorkerId = null;
  _pendingAvatarBlob = null;
  await db.auth.signOut();
  localStorage.removeItem('baroalba_guest');
  location.href = '/login.html';
}

// ── 알림 배너 ─────────────────────────────────────────────
function checkPushPermission() {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return;
  // 이미 허용됐으면 그냥 구독 등록
  if (Notification.permission === 'granted') { subscribePush(); return; }
  // 영구 거절됐으면 배너 표시 안 함
  if (Notification.permission === 'denied') return;
  // "나중에" 누른 지 3일 이내면 표시 안 함
  const snoozed = localStorage.getItem('push_banner_snooze');
  if (snoozed && Date.now() - parseInt(snoozed) < 3 * 24 * 60 * 60 * 1000) return;
  const banner = document.getElementById('push-banner');
  if (banner) banner.style.display = 'block';
}

async function allowPushFromBanner() {
  document.getElementById('push-banner').style.display = 'none';
  await subscribePush();
}

function dismissPushBanner() {
  document.getElementById('push-banner').style.display = 'none';
  localStorage.setItem('push_banner_snooze', Date.now().toString());
}

// ── Web Push 구독 ─────────────────────────────────────────
const VAPID_PUBLIC_KEY = 'BPVIiIOwTmprH-GOodwKdzAEpq1C8j-7D3GWWM5-LzA9r9fFAPER-VSdSguAWs1ZDzMqqTMpN1ON8wjNsDxZ7UM';

function urlBase64ToUint8Array(b64) {
  const pad = '='.repeat((4 - b64.length % 4) % 4);
  const base64 = (b64 + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

async function subscribePush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  if (!currentUser) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return;
    // 기존 구독 취소 후 재구독 (VAPID 키 변경 시 반드시 필요)
    let sub = await reg.pushManager.getSubscription();
    if (sub) await sub.unsubscribe();
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
    });
    await db.from('push_subscriptions')
      .upsert({ user_id: currentUser.id, subscription: sub.toJSON() }, { onConflict: 'user_id' });
  } catch(e) {
    console.log('Push 구독 실패:', e.message);
  }
}

// ── 유틸 ──────────────────────────────────────────────────
// ── 번개 알바 타이머 ──────────────────────────────────────
let surgeTimerHandles = [];

function buildSurgeTimer(job) {
  if (!job.surge_enabled || !job.surge_interval_min) return '';
  return `<div class="surge-timer" id="stimer-${job.id}">
    <span class="surge-timer-label">⚡ +${(job.surge_amount||1000).toLocaleString()}원</span>
    <div class="surge-timer-bar-wrap"><div class="surge-timer-bar" id="sbar-${job.id}" style="width:100%"></div></div>
    <span class="surge-timer-count" id="scnt-${job.id}">--:--</span>
  </div>`;
}

function startSurgeTimers() {
  surgeTimerHandles.forEach(h => clearInterval(h));
  surgeTimerHandles = [];
  jobs.filter(j => j.surge_enabled && j.surge_interval_min).forEach(job => {
    const intervalMs = job.surge_interval_min * 60 * 1000;
    const updated = new Date(job.updated_at || Date.now());
    let lastCycleApplied = Math.floor((Date.now() - updated.getTime()) / intervalMs);

    const handle = setInterval(async () => {
      const cnt = document.getElementById(`scnt-${job.id}`);
      const bar = document.getElementById(`sbar-${job.id}`);
      if (!cnt) { clearInterval(handle); return; }

      const elapsed = Date.now() - updated.getTime();
      const currentCycle = Math.floor(elapsed / intervalMs);
      const remaining = intervalMs - (elapsed % intervalMs);
      const pct = Math.max(0, (remaining / intervalMs) * 100);
      const m = Math.floor(remaining / 60000);
      const s = Math.floor((remaining % 60000) / 1000);
      cnt.textContent = `${m}:${String(s).padStart(2,'0')}`;
      bar.style.width = pct + '%';
      if (remaining < 10000) {
        cnt.style.color = '#C8102E';
        bar.style.background = '#C8102E';
      } else {
        cnt.style.color = '';
        bar.style.background = '';
      }

      // 사이클 완료 → 가격 인상
      if (currentCycle > lastCycleApplied) {
        lastCycleApplied = currentCycle;
        const maxWage = job.surge_max_wage || 9999999;
        if ((job.current_wage || 0) < maxWage) {
          const newWage = Math.min((job.current_wage || job.base_wage) + (job.surge_amount || 1000), maxWage);
          job.current_wage = newWage;
          job.wage_delta = newWage - (job.base_wage || newWage);
          // DB 업데이트
          db.from('job_postings').update({ current_wage: newWage }).eq('id', job.id).then(null, console.warn);
          // 카드 DOM 직접 업데이트
          const wageEl = document.getElementById(`wage-${job.id}`);
          const deltaWrap = document.getElementById(`wagedelta-${job.id}`);
          if (wageEl) {
            wageEl.innerHTML = newWage.toLocaleString() + '원' +
              (job.work_type === 'errand' ? '<span style="font-size:10px;font-weight:700;color:#aaa">/건</span>' : '');
          }
          if (deltaWrap) {
            deltaWrap.innerHTML = `<div class="wage-delta">↑${job.wage_delta.toLocaleString()}원</div>`;
          }
          // 타이머 배경 잠깐 강조
          const timerEl = document.getElementById(`stimer-${job.id}`);
          if (timerEl) {
            timerEl.style.background = 'linear-gradient(90deg,#FFE0B2,#FFF3E0)';
            setTimeout(() => { if (timerEl) timerEl.style.background = ''; }, 1500);
          }
        }
      }
    }, 1000);
    surgeTimerHandles.push(handle);
  });
}

function getCatClass(cat) {
  const map = { 'F&B': 'fnb-tag', '물류': 'logistics-tag', '판매': 'sales-tag', '청소': 'cleaning-tag', '이벤트': 'event-tag' };
  return map[cat] || '';
}

function _distStr(distM, lat, lng, addrFallback) {
  if (distM != null && !isNaN(distM)) {
    return distM < 1000 ? Math.round(distM)+'m' : (distM/1000).toFixed(1)+'km';
  }
  if (lat && lng && window._myLat != null) {
    const R = 6371e3, toRad = x => x * Math.PI / 180;
    const dLat = toRad(window._myLat - lat), dLng = toRad(window._myLng - lng);
    const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat))*Math.cos(toRad(window._myLat))*Math.sin(dLng/2)**2;
    const d = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return d < 1000 ? Math.round(d)+'m' : (d/1000).toFixed(1)+'km';
  }
  if (addrFallback) return addrFallback;
  if (lat && lng) return '지도에서 확인';
  return '위치 미설정';
}

function formatTime(iso) {
  const d = new Date(iso);
  const now = new Date();
  const diff = d - now;
  if (diff < 0) return t('status_ongoing');
  if (diff < 3600000) return Math.round(diff/60000) + '분 후';
  if (diff < 86400000) return Math.round(diff/3600000) + '시간 후';
  return `${d.getMonth()+1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}`;
}

let toastTimer;
function showToast(msg, duration) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), duration || 2800);
}

// ── 목업 데이터 (Supabase 미연결 시 폴백) ─────────────────
function getMockJobs() {
  // 현재 지도 중심 기준으로 좌표 생성
  const c = mapCenter;
  const d = 0.005; // ~500m 단위 오프셋
  return [
    { id:'1', title:'음료 제조 및 홀 서빙', biz_name:'근처 카페', category:'F&B', base_wage:10000, current_wage:13000, wage_delta:3000, status:'urgent', lat:c.lat+d*0.2, lng:c.lng+d*0.3, distance_m:120, start_time: new Date(Date.now()+600000).toISOString(), duration_hours:6, needed_count:2, filled_count:0, description:'주말 오전 갑작스러운 결원! 음료 제조 경험 우대.', biz_rating:4.8, biz_kindness:4.9, biz_reviews:42 },
    { id:'2', title:'물류 센터 입·출고 보조', biz_name:'근처 마트', category:'물류', base_wage:11000, current_wage:12000, wage_delta:1000, status:'urgent', lat:c.lat-d*0.8, lng:c.lng-d*0.5, distance_m:580, start_time: new Date(Date.now()+14400000).toISOString(), duration_hours:4, needed_count:5, filled_count:1, description:'체력이 좋으신 분 환영. 점심 제공.', biz_rating:4.1, biz_kindness:3.9, biz_reviews:87 },
    { id:'3', title:'판매 도우미 (주말 한정)', biz_name:'근처 올리브영', category:'판매', base_wage:10500, current_wage:10500, wage_delta:0, status:'open', lat:c.lat+d*0.9, lng:c.lng+d*1.1, distance_m:840, start_time: new Date(Date.now()+10800000).toISOString(), duration_hours:5, needed_count:1, filled_count:0, description:'뷰티 제품 판매 보조 및 재고 정리.', biz_rating:4.6, biz_kindness:4.7, biz_reviews:31 },
    { id:'4', title:'홀·카운터 보조', biz_name:'근처 카페', category:'F&B', base_wage:9860, current_wage:11000, wage_delta:1140, status:'urgent', lat:c.lat-d*0.4, lng:c.lng+d*0.8, distance_m:300, start_time: new Date(Date.now()+1800000).toISOString(), duration_hours:3, needed_count:1, filled_count:0, description:'카운터 경험 없어도 됩니다. 친절한 교육 후 투입.', biz_rating:3.9, biz_kindness:3.7, biz_reviews:15 },
    { id:'5', title:'행사 진행 보조 스태프', biz_name:'근처 행사팀', category:'이벤트', base_wage:11500, current_wage:13500, wage_delta:2000, status:'urgent', lat:c.lat+d*0.5, lng:c.lng-d*0.7, distance_m:450, start_time: new Date(Date.now()+18000000).toISOString(), duration_hours:5, needed_count:8, filled_count:3, description:'주말 야외 행사. 유니폼+식사 2회 제공.', biz_rating:4.5, biz_kindness:4.6, biz_reviews:9 },
    { id:'6', title:'청소 보조', biz_name:'청소업체', category:'청소', base_wage:13000, current_wage:13000, wage_delta:0, status:'open', lat:c.lat+d*1.2, lng:c.lng-d*0.2, distance_m:720, start_time: new Date(Date.now()+64800000).toISOString(), duration_hours:8, needed_count:3, filled_count:0, description:'신축 건물 청소. 도구 제공.', biz_rating:4.3, biz_kindness:4.2, biz_reviews:28 },
    { id:'7', title:'커플 팝업스토어 도우미', surge_enabled:true, surge_max_wage:18000, surge_amount:1000, surge_interval_min:15, updated_at: new Date(Date.now()-7*60000).toISOString(), biz_name:'팝업스토어', category:'커플알바', base_wage:12000, current_wage:14000, wage_delta:2000, status:'urgent', lat:c.lat-d*0.3, lng:c.lng-d*1.0, distance_m:310, start_time: new Date(Date.now()+7200000).toISOString(), duration_hours:5, needed_count:4, filled_count:0, description:'커플 2인 1팀! 드레스코드 있음.', biz_rating:4.7, biz_kindness:4.9, biz_reviews:12 },
    { id:'8', title:'틱톡 챌린지 영상 출연', biz_name:'바이럴컴퍼니', category:'컨텐츠', base_wage:15000, current_wage:20000, wage_delta:5000, status:'urgent', lat:c.lat+d*0.1, lng:c.lng+d*0.5, distance_m:180, start_time: new Date(Date.now()+3600000).toISOString(), duration_hours:2, needed_count:6, filled_count:1, description:'틱톡 브랜드 챌린지 영상 출연. 즉시 현금 지급.', biz_rating:4.5, biz_kindness:4.6, biz_reviews:8 },
    { id:'9', title:'철봉 오래매달리기 챌린지', biz_name:'스포츠브랜드', category:'챌린지', base_wage:10000, current_wage:30000, wage_delta:20000, status:'urgent', lat:c.lat+d*0.7, lng:c.lng-d*0.4, distance_m:420, start_time: new Date(Date.now()+1800000).toISOString(), duration_hours:1, needed_count:10, filled_count:3, description:'30초 이상 매달리면 3만원! 누구나 가능.', biz_rating:4.2, biz_kindness:4.1, biz_reviews:5 },
  ];
}

// 지도 밖 클릭 시 반경 팝업 닫기
document.getElementById('map').addEventListener('click', () => {
  document.getElementById('radius-popup').classList.remove('open');
});

// ── 알림 시스템 ──────────────────────────────────────────
function _notiKey() { return 'noti_last_seen_' + (currentUser?.id || 'guest'); }

async function _fetchWorkerNotifications() {
  if (!currentUser) return [];
  const { data: w } = await db.from('workers').select('id, rating, review_count, noshow_count').eq('kakao_uid', currentUser.id).single();
  if (!w) return [];

  const { data: apps } = await db.from('applications')
    .select('id, status, updated_at, completed_at, worker_rating, worker_review, job_postings(title, businesses(name))')
    .eq('worker_id', w.id)
    .not('status', 'in', '(pending,reviewing)')
    .order('updated_at', { ascending: false })
    .limit(40);

  const items = [];

  // 등급 업 조건 달성 알림 (번개등급)
  const QUICK = { minRating: 4.3, minReviews: 3 };
  if ((w.rating || 0) >= QUICK.minRating && (w.review_count || 0) >= QUICK.minReviews && (w.noshow_count || 0) === 0) {
    items.push({ id: 'grade_up', icon: '⚡', color: '#F59E0B', title: t('grade_up_noti_title'), body: t('grade_up_noti_body'), time: null, isGrade: true });
  }

  (apps || []).forEach(app => {
    const biz = app.job_postings?.businesses?.name || '업체';
    const jobTitle = app.job_postings?.title || '공고';
    const t = app.updated_at;
    if (app.status === 'accepted') {
      items.push({ id: app.id + '_acc', icon: '✅', color: '#16a34a', title: `${biz} 합격 확정!`, body: `"${jobTitle}" 공고에서 합격됐어요`, time: t });
    } else if (app.status === 'rejected') {
      items.push({ id: app.id + '_rej', icon: '❌', color: '#EF4444', title: `${biz} 지원 거절`, body: `"${jobTitle}"`, time: t });
    } else if (app.status === 'completed' && app.worker_rating) {
      const stars = '★'.repeat(Math.round(app.worker_rating));
      items.push({ id: app.id + '_rev', icon: '⭐', color: '#F59E0B', title: `${biz}에서 평점 ${app.worker_rating.toFixed(1)}점!`, body: app.worker_review ? `"${app.worker_review}"` : `${stars}`, time: t });
    } else if (app.status === 'completed') {
      items.push({ id: app.id + '_done', icon: '\u{1F3C1}', color: '#3B82F6', title: `${biz} 근무 완료`, body: `"${jobTitle}"`, time: t });
    } else if (app.status === 'noshow') {
      items.push({ id: app.id + '_ns', icon: '⚠️', color: '#BE123C', title: `${biz}에서 노쇼 처리됐어요`, body: `"${jobTitle}"`, time: t });
    }
  });

  // 커뮤니티 댓글 알림 (내 게시글에 달린 새 댓글)
  const lastSeen = parseInt(localStorage.getItem(_notiKey()) || '0');
  if (w.id && lastSeen > 0 && getNotiSetting('comment')) {
    try {
      const { data: myPosts } = await db.from('community_posts')
        .select('id, title').eq('worker_id', w.id).eq('is_deleted', false);
      if (myPosts?.length) {
        const ids = myPosts.map(p => p.id);
        const postMap = Object.fromEntries(myPosts.map(p => [p.id, p.title]));
        const { data: newCmts } = await db.from('community_comments')
          .select('id, content, created_at, post_id, workers(name)')
          .in('post_id', ids)
          .gt('created_at', new Date(lastSeen).toISOString())
          .neq('worker_id', w.id)
          .order('created_at', { ascending: false })
          .limit(10);
        (newCmts || []).forEach(c => {
          const title = postMap[c.post_id] || '게시글';
          const commenter = c.workers?.name || '누군가';
          items.push({
            id: 'comm_cmt_' + c.id, icon: '&#x1F4AC;', color: '#7C3AED',
            title: `"${title.slice(0,20)}"에 댓글이 달렸어요`,
            body: `${commenter}: "${c.content.slice(0,40)}"`,
            time: c.created_at
          });
        });
      }
    } catch(e) {}
  }

  return items;
}

function _timeAgo(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return '방금';
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}일 전`;
  return new Date(iso).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
}

// ── 검색 오버레이 ─────────────────────────────────────────
const REGION_GU = {
  '서울특별시': ['강남구','강동구','강북구','강서구','관악구','광진구','구로구','금천구','노원구','도봉구','동대문구','동작구','마포구','서대문구','서초구','성동구','성북구','송파구','양천구','영등포구','용산구','은평구','종로구','중구','중랑구'],
  '경기도': ['수원시','성남시','고양시','용인시','부천시','안산시','안양시','화성시','평택시','의정부시','시흥시','파주시','광명시','김포시','광주시','군포시','하남시','오산시','양주시','이천시','구리시','남양주시','안성시','의왕시','여주시','동두천시','과천시'],
  '인천광역시': ['중구','동구','미추홀구','연수구','남동구','부평구','계양구','서구','강화군','옹진군'],
  '부산광역시': ['중구','서구','동구','영도구','부산진구','동래구','남구','북구','해운대구','사하구','금정구','강서구','연제구','수영구','사상구','기장군'],
  '대구광역시': ['중구','동구','서구','남구','북구','수성구','달서구','달성군'],
  '대전광역시': ['동구','중구','서구','유성구','대덕구'],
  '광주광역시': ['동구','서구','남구','북구','광산구'],
  '울산광역시': ['중구','남구','동구','북구','울주군'],
  '세종특별자치시': ['세종시'],
  '강원도': ['춘천시','원주시','강릉시','동해시','태백시','속초시','삼척시','홍천군','횡성군','영월군','평창군','정선군','철원군','화천군','양구군','인제군','고성군','양양군'],
  '충청북도': ['청주시','충주시','제천시','보은군','옥천군','영동군','증평군','진천군','괴산군','음성군','단양군'],
  '충청남도': ['천안시','공주시','보령시','아산시','서산시','논산시','계룡시','당진시','금산군','부여군','서천군','청양군','홍성군','예산군','태안군'],
  '전라북도': ['전주시','군산시','익산시','정읍시','남원시','김제시','완주군','진안군','무주군','장수군','임실군','순창군','고창군','부안군'],
  '전라남도': ['목포시','여수시','순천시','나주시','광양시','담양군','곡성군','구례군','고흥군','보성군','화순군','장흥군','강진군','해남군','영암군','무안군','함평군','영광군','장성군','완도군','진도군','신안군'],
  '경상북도': ['포항시','경주시','김천시','안동시','구미시','영주시','영천시','상주시','문경시','경산시','의성군','청송군','영양군','영덕군','청도군','고령군','성주군','칠곡군','예천군','봉화군','울진군','울릉군'],
  '경상남도': ['창원시','진주시','통영시','사천시','김해시','밀양시','거제시','양산시','의령군','함안군','창녕군','고성군','남해군','하동군','산청군','함양군','거창군','합천군'],
  '제주특별자치도': ['제주시','서귀포시']
};

let srchState = { type: '', cat: '' };

function openSearchOverlay() {
  const el = document.getElementById('search-overlay');
  el.style.display = 'flex';
  requestAnimationFrame(() => el.classList.add('show'));
  document.getElementById('srch-text').focus();
}

function closeSearchOverlay() {
  const el = document.getElementById('search-overlay');
  el.classList.remove('show');
  el.addEventListener('transitionend', () => { if (!el.classList.contains('show')) el.style.display = 'none'; }, { once: true });
}

function updateGuList(si) {
  const sel = document.getElementById('srch-gu');
  sel.innerHTML = '<option value="">구/시 전체</option>';
  (REGION_GU[si] || []).forEach(gu => {
    const opt = document.createElement('option');
    opt.value = gu; opt.textContent = gu;
    sel.appendChild(opt);
  });
}

function setSrchType(btn, val) {
  document.querySelectorAll('.srch-type-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  srchState.type = val;
}

function setSrchCat(btn, val) {
  document.querySelectorAll('.srch-cat-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  srchState.cat = val;
}

function resetSearchToFilter() {
  document.getElementById('srch-result-panel').style.display = 'none';
  document.getElementById('srch-filter-panel').style.display = '';
}

async function runSearch() {
  const si  = document.getElementById('srch-si').value;
  const gu  = document.getElementById('srch-gu').value;
  const txt = (document.getElementById('srch-text').value || '').trim();
  const { type, cat } = srchState;

  document.getElementById('srch-result-list').innerHTML = '<div class="srch-empty"><div class="srch-empty-icon">\u{1F50D}</div><div class="srch-empty-txt">검색 중...</div></div>';
  document.getElementById('srch-filter-panel').style.display = 'none';
  document.getElementById('srch-result-panel').style.display = 'flex';

  try {
    const today = new Date().toISOString().slice(0, 10);
    let q = db.from('job_postings').select(`
      id, title, category, work_type, status,
      base_wage, current_wage, start_time, duration_hours,
      needed_count, filled_count, address, lat, lng, work_end_date,
      businesses(name)
    `).neq('status', 'closed')
      .or(`work_end_date.is.null,work_end_date.gte.${today}`);

    // 지역 필터
    const regionKw = gu || si;
    if (regionKw) q = q.ilike('address', `%${regionKw}%`);

    // 공고 유형 필터
    if (type === 'urgent') q = q.eq('status', 'urgent');
    else if (type === 'regular') q = q.eq('work_type', 'regular');
    else if (type === 'short')   q = q.eq('work_type', 'short');
    else if (type === 'spot')    q = q.or('work_type.eq.spot,work_type.is.null');

    // 업무 종류 필터
    if (cat === '__errand__') q = q.eq('work_type', 'errand');
    else if (cat === '반려동물 산책') q = q.or('category.eq.반려동물 산책,category.ilike.%펫%');
    else if (cat) q = q.eq('category', cat);

    // 텍스트 검색
    if (txt) q = q.or(`title.ilike.%${txt}%,address.ilike.%${txt}%`);

    const { data, error } = await q.order('created_at', { ascending: false }).limit(60);
    if (error) throw error;

    const list = (data || []).map(j => ({ ...j, wage_delta: (j.current_wage||0) - (j.base_wage||0) }));
    document.getElementById('srch-count').textContent = list.length;
    renderSearchResults(list);
  } catch (e) {
    document.getElementById('srch-result-list').innerHTML = `<div class="srch-empty"><div class="srch-empty-icon">⚠️</div><div class="srch-empty-txt">검색 중 오류가 발생했습니다.<br>${e.message}</div></div>`;
  }
}

function renderSearchResults(list) {
  const el = document.getElementById('srch-result-list');
  if (!list.length) {
    el.innerHTML = '<div class="srch-empty"><div class="srch-empty-icon">\u{1F645}</div><div class="srch-empty-txt">조건에 맞는 공고가 없어요.<br>필터를 바꿔 다시 검색해보세요.</div></div>';
    return;
  }
  // openDetail()이 전역 jobs 배열에서 찾으므로 검색 결과 병합
  list.forEach(j => { if (!jobs.find(e => e.id === j.id)) jobs.push(j); });

  const TYPE_LABEL = { regular:'정기', short:'단기', errand:'심부름', spot:'스팟' };
  const TYPE_COLOR = { regular:'#16a34a', short:'#3B82F6', errand:'#7C3AED', spot:'#C8102E' };

  el.innerHTML = list.map(job => {
    const isUrgent = job.status === 'urgent';
    const isErrand = job.work_type === 'errand';
    const wageUnit = isErrand ? '/건' : '/시간';
    const bizName  = job.businesses?.name || '';
    const addrPart = (job.address || '').split('\n')[1] || (job.address || '');
    const regionShort = addrPart.split(' ').slice(0, 3).join(' ');
    const wt = job.work_type || 'spot';
    const typeLabel = TYPE_LABEL[wt] || '스팟';
    const typeColor = TYPE_COLOR[wt] || '#C8102E';

    const urgentBadge = isUrgent
      ? `<span style="font-size:10px;font-weight:700;color:#DC2626;background:#FEF2F2;padding:2px 7px;border-radius:20px">⚡ ASAP</span>` : '';
    const typeBadge = `<span style="font-size:10px;font-weight:700;color:${typeColor};background:${typeColor}18;padding:2px 7px;border-radius:20px">${typeLabel}</span>`;

    return `<div class="srch-card" onclick="closeSearchOverlay();openDetail('${job.id}')">
      <div class="srch-card-top">
        <div class="srch-card-badges">${urgentBadge}${typeBadge}</div>
      </div>
      <div class="srch-card-title">${job.title || '공고'}</div>
      <div class="srch-card-biz">${bizName}</div>
      <div class="srch-card-wage-row">
        <span class="srch-card-wage">${(job.current_wage||0).toLocaleString()}</span>
        <span class="srch-card-wage-unit">원${wageUnit}</span>
      </div>
      <div class="srch-card-info">
        ${regionShort ? `<span class="srch-card-chip">${regionShort}</span>` : ''}
        ${job.duration_hours ? `<span class="srch-card-chip">${job.duration_hours}시간</span>` : ''}
        ${job.category ? `<span class="srch-card-chip">${job.category}</span>` : ''}
      </div>
    </div>`;
  }).join('');
}

async function updateNotiBadge() {
  if (!currentUser || isGuest) return;
  const items = await _fetchWorkerNotifications();
  const lastSeen = parseInt(localStorage.getItem(_notiKey()) || '0');
  const unread = items.filter(it => it.isGrade ? !localStorage.getItem('noti_grade_seen_' + (currentUser?.id || '')) : (it.time && new Date(it.time).getTime() > lastSeen)).length;
  const badge = document.getElementById('noti-badge');
  const bell = document.getElementById('noti-bell-btn');
  if (bell) bell.style.display = 'block';
  if (!badge) return;
  if (unread > 0) {
    badge.textContent = unread > 9 ? '9+' : unread;
    badge.style.display = 'flex';
    // 업주 모드(bizRecord 있음)에서는 앱 배지를 건드리지 않음 — 업주 알림이 기준이어야 함
    if (!bizRecord && 'setAppBadge' in navigator) navigator.setAppBadge(unread).catch(() => {});
  } else {
    badge.style.display = 'none';
    if (!bizRecord && 'clearAppBadge' in navigator) navigator.clearAppBadge().catch(() => {});
  }
}

async function openNotifications() {
  const lastSeen = parseInt(localStorage.getItem(_notiKey()) || '0');
  // 등급 알림 읽음 처리
  if (currentUser) localStorage.setItem('noti_grade_seen_' + currentUser.id, '1');
  // 읽음 시각 업데이트
  localStorage.setItem(_notiKey(), Date.now().toString());
  document.getElementById('noti-badge').style.display = 'none';
  // 앱 아이콘 배지도 즉시 0으로
  if ('clearAppBadge' in navigator) navigator.clearAppBadge().catch(() => {});

  const existing = document.getElementById('noti-overlay');
  if (existing) { existing.remove(); return; }

  const overlay = document.createElement('div');
  overlay.id = 'noti-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:9000;display:flex;align-items:flex-end';
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
  overlay.innerHTML = `
    <div style="background:#fff;border-radius:24px 24px 0 0;width:100%;max-height:80vh;display:flex;flex-direction:column">
      <div style="padding:16px 20px 12px;border-bottom:1px solid #f0f0f0;display:flex;align-items:center;justify-content:space-between;flex-shrink:0">
        <div style="font-size:17px;font-weight:900">\u{1F514} 알림</div>
        <button onclick="document.getElementById('noti-overlay').remove()" style="font-size:22px;color:#aaa;background:none;border:none;cursor:pointer">✕</button>
      </div>
      <div id="noti-list-inner" style="overflow-y:auto;padding:10px 16px 40px;flex:1">
        <div style="text-align:center;padding:24px"><div class="spinner"></div></div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const items = await _fetchWorkerNotifications();
  const listEl = document.getElementById('noti-list-inner');
  if (!listEl) return;

  if (!items.length) {
    listEl.innerHTML = '<div style="text-align:center;padding:40px 0;color:#aaa"><div style="font-size:36px;margin-bottom:10px">\u{1F515}</div><div style="font-size:14px;font-weight:700">아직 알림이 없어요</div><div style="font-size:12px;margin-top:4px">공고에 지원하면 합격/거절 소식을 받아요</div></div>';
    return;
  }

  listEl.innerHTML = items.map(it => {
    const isNew = it.isGrade
      ? !localStorage.getItem('noti_grade_seen_' + (currentUser?.id || ''))
      : (it.time && new Date(it.time).getTime() > lastSeen);
    return `
      <div style="display:flex;gap:12px;padding:12px 0;border-bottom:1px solid #f8f8f8;align-items:flex-start">
        <div style="width:40px;height:40px;border-radius:50%;background:${it.color}22;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0">${it.icon}</div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px">
            <div style="font-size:14px;font-weight:800;color:#222;line-height:1.4">${it.title}</div>
            ${isNew ? '<span style="min-width:7px;height:7px;border-radius:50%;background:#C8102E;flex-shrink:0;display:inline-block"></span>' : ''}
          </div>
          ${it.body ? `<div style="font-size:12px;color:#888;line-height:1.5">${it.body}</div>` : ''}
          ${it.time ? `<div style="font-size:11px;color:#bbb;margin-top:4px">${_timeAgo(it.time)}</div>` : ''}
        </div>
      </div>`;
  }).join('');
}

// ── 신고하기 ─────────────────────────────────────────────
let _reportTargetType = null;
let _reportTargetId = null;

const REPORT_REASONS_JOB = ['허위/과장 공고', '최저임금 이하 시급', '불법/유해 업종', '개인정보 요구', '기타'];
const REPORT_REASONS_USER = ['부적절한 언행', '허위 프로필', '개인정보 침해', '노쇼/무단이탈', '기타'];

function openReportModal(targetType, targetId) {
  if (!currentUser) { showToast('로그인 후 신고할 수 있습니다'); return; }
  if (!targetId) return;
  _reportTargetType = targetType;
  _reportTargetId = targetId;
  const reasons = targetType === 'job' ? REPORT_REASONS_JOB : REPORT_REASONS_USER;
  document.getElementById('report-reason-list').innerHTML = reasons.map(r =>
    `<label style="display:flex;align-items:center;gap:10px;padding:12px 14px;background:#f8f8f8;border-radius:12px;cursor:pointer;font-size:14px;font-weight:600;color:#333">
      <input type="radio" name="report-reason" value="${r}" style="accent-color:var(--red);width:16px;height:16px">${r}
    </label>`
  ).join('');
  document.getElementById('report-detail').value = '';
  document.getElementById('report-modal').classList.add('open');
}

function closeReportModal() {
  document.getElementById('report-modal').classList.remove('open');
  _reportTargetType = null;
  _reportTargetId = null;
}

async function submitReport() {
  const reason = document.querySelector('input[name="report-reason"]:checked')?.value;
  if (!reason) { showToast('신고 사유를 선택해주세요'); return; }
  const detail = document.getElementById('report-detail').value.trim();
  try {
    const { error } = await db.from('reports').insert({
      reporter_id: currentUser.id,
      target_id: _reportTargetId,
      target_type: _reportTargetType,
      reason,
      detail: detail || null
    });
    if (error) throw error;
    // 관리자 이메일 알림 (실패해도 사용자 경험에 영향 없음)
    fetch('/api/report-notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reporter_id: currentUser.id, target_id: _reportTargetId, target_type: _reportTargetType, reason, detail: detail || null })
    }).catch(() => {});
    showToast('신고가 접수됐습니다. 검토 후 조치하겠습니다');
  } catch(e) {
    console.error('report error:', e);
    showToast('신고 접수 중 오류가 발생했습니다');
  }
  closeReportModal();
}

// ── 커뮤니티 게시판 ──────────────────────────────────────────
let _commCurrentCat = 'all';
let _commCurrentPostId = null;
let _commCurrentPostLikes = 0;
let _commWriteCat = 'free';
let _commEditPostId = null;

function _commIsOwner() {
  return currentUser?.user_metadata?.baroalba_role === 'business';
}

function _buildCommTabs() {
  const tabs = [
    { cat: 'all',    label: '전체' },
    { cat: 'free',   label: '자유' },
    { cat: 'review', label: '업체후기' },
    { cat: 'info',   label: '정보공유' },
  ];
  const el = document.getElementById('community-cat-tabs');
  const btnBase = 'padding:11px 4px;background:none;border:none;font-size:13px;cursor:pointer;white-space:nowrap;flex-shrink:0';
  el.innerHTML = `<div style="display:flex;min-width:100%;align-items:stretch">` +
    tabs.map((t, i) => {
      const active = i === 0;
      const color = active ? 'var(--red)' : '#888';
      const weight = active ? '700' : '600';
      const border = active ? 'var(--red)' : 'transparent';
      return `<button onclick="loadCommunityPosts('${t.cat}')" class="comm-cat-btn" data-cat="${t.cat}"
        style="${btnBase};flex:1;color:${color};font-weight:${weight};border-bottom:2px solid ${border}">
        ${t.label}
      </button>`;
    }).join('') + `</div>`;
}

function _buildWriteCats() {
  const cats = [
    { cat: 'review', label: '업체후기' },
    { cat: 'info',   label: '정보공유' },
    { cat: 'free',   label: '자유' },
  ];
  const el = document.getElementById('comm-write-cats');
  el.innerHTML = cats.map((c, i) => {
    const sel = i === 2; // 자유 기본 선택
    return `<button onclick="selectWriteCat(this,'${c.cat}')" data-cat="${c.cat}"
      style="padding:8px 14px;border-radius:20px;border:1.5px solid ${sel?'var(--red)':'#eee'};font-size:13px;font-weight:700;background:${sel?'#FFF0F0':'#fff'};color:${sel?'var(--red)':'#888'};cursor:pointer">${c.label}</button>`;
  }).join('');
  _commWriteCat = 'free';
}

function openCommunityPanel() {
  document.getElementById('panel-community').classList.add('show');
  history.pushState({ panel: 'community' }, '');
  _buildCommTabs();
  loadCommunityPosts('all');
}

function closeCommunityPanel() {
  document.getElementById('panel-community').classList.remove('show');
}

function closeCommunityPost() {
  document.getElementById('community-post-overlay').classList.remove('open');
}

function openCommunityWriteOverlay() {
  if (!currentUser || isGuest) { showToast('로그인 후 글을 작성할 수 있어요'); return; }
  _commEditPostId = null;
  document.getElementById('comm-write-title').value = '';
  document.getElementById('comm-write-content').value = '';
  document.getElementById('comm-write-anon').checked = false;
  document.getElementById('comm-write-title-h').textContent = '글쓰기';
  document.getElementById('comm-write-submit-btn').textContent = '게시하기';
  _buildWriteCats();
  document.getElementById('community-write-overlay').classList.add('open');
}

function closeCommunityWriteOverlay() {
  document.getElementById('community-write-overlay').classList.remove('open');
  _commEditPostId = null;
}

function selectWriteCat(btn, cat) {
  _commWriteCat = cat;
  document.querySelectorAll('#comm-write-cats button').forEach(b => {
    b.style.background = '#fff'; b.style.color = '#888'; b.style.borderColor = '#eee';
  });
  btn.style.background = '#FFF0F0'; btn.style.color = 'var(--red)'; btn.style.borderColor = 'var(--red)';
}

async function loadCommunityPosts(cat) {
  _commCurrentCat = cat;
  document.querySelectorAll('.comm-cat-btn').forEach(b => {
    const active = b.dataset.cat === cat;
    b.style.color = active ? 'var(--red)' : '#888';
    b.style.fontWeight = active ? '700' : '600';
    b.style.borderBottomColor = active ? 'var(--red)' : 'transparent';
  });

  // 전용 게시판 접근 권한 체크
  const isOwner = _commIsOwner();
  const el = document.getElementById('community-post-list');
  el.innerHTML = '<div style="text-align:center;padding:32px"><div class="spinner"></div></div>';

  let q = db.from('community_posts')
    .select('id, category, title, content, likes, comments_count, is_anonymous, created_at, workers(name), businesses(biz_name)')
    .order('created_at', { ascending: false })
    .limit(50);

  if (cat !== 'all') {
    q = q.eq('category', cat);
  }

  const { data: posts } = await q;
  if (!posts?.length) {
    el.innerHTML = '<div style="text-align:center;padding:48px 20px;color:#aaa"><div style="font-size:40px;margin-bottom:12px">💬</div><div style="font-size:15px;font-weight:700">아직 게시글이 없어요</div><div style="font-size:13px;margin-top:6px">첫 글을 작성해보세요!</div></div>';
    return;
  }

  const CAT_INFO = {
    review:{ bg:'#FFF7ED', color:'#EA580C', label:'업체후기' },
    info:  { bg:'#EFF6FF', color:'#3B82F6', label:'정보공유' },
    free:  { bg:'#F5F3FF', color:'#7C3AED', label:'자유' },
    owner: { bg:'#FEF3C7', color:'#D97706', label:'업주전용' },
    worker:{ bg:'#E0F2FE', color:'#0284C7', label:'알바생전용' },
  };
  const fmtRel = iso => { const d = new Date(iso); const now = new Date(); const diffH = (now - d) / 3600000; if (diffH < 1) return Math.floor(diffH * 60) + '분 전'; if (diffH < 24) return Math.floor(diffH) + '시간 전'; return `${d.getMonth()+1}/${d.getDate()}`; };

  el.innerHTML = posts.map(p => {
    const ct = CAT_INFO[p.category] || CAT_INFO.free;
    const author = p.is_anonymous ? '익명' : (p.workers?.name || p.businesses?.biz_name || '사용자');
    const preview = (p.content || '').slice(0, 55) + ((p.content || '').length > 55 ? '...' : '');
    return `<div onclick="openCommunityPost('${p.id}')" style="background:#fff;border-radius:14px;padding:14px 16px;margin-bottom:8px;box-shadow:0 1px 5px rgba(0,0,0,0.05);cursor:pointer">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
        <span style="font-size:11px;font-weight:800;padding:2px 8px;border-radius:20px;background:${ct.bg};color:${ct.color}">${ct.label}</span>
        <span style="font-size:11px;color:#bbb;margin-left:auto">${fmtRel(p.created_at)}</span>
      </div>
      <div style="font-size:14px;font-weight:800;color:#222;margin-bottom:4px">${p.title}</div>
      <div style="font-size:13px;color:#888;margin-bottom:8px;line-height:1.5">${preview}</div>
      <div style="display:flex;align-items:center;gap:12px">
        <span style="font-size:12px;color:#aaa;font-weight:600">${author}</span>
        <span style="font-size:12px;color:#aaa">❤️ ${p.likes || 0}</span>
        <span style="font-size:12px;color:#aaa">💬 ${p.comments_count || 0}</span>
      </div>
    </div>`;
  }).join('');
}

async function openCommunityPost(postId) {
  _commCurrentPostId = postId;
  const overlay = document.getElementById('community-post-overlay');
  const body = document.getElementById('comm-post-body');
  body.innerHTML = '<div style="text-align:center;padding:32px"><div class="spinner"></div></div>';
  overlay.classList.add('open');

  const [{ data: post }, { data: comments }] = await Promise.all([
    db.from('community_posts').select('*, workers(name,kakao_uid), businesses(biz_name,kakao_uid)').eq('id', postId).single(),
    db.from('community_comments').select('*, workers(name,kakao_uid), businesses(biz_name,kakao_uid)').eq('post_id', postId).order('created_at', { ascending: true })
  ]);

  if (!post) { body.innerHTML = '<div style="padding:20px;color:#aaa">게시글을 불러올 수 없어요</div>'; return; }

  _commCurrentPostLikes = post.likes || 0;
  document.getElementById('comm-post-title-h').textContent = post.title;

  const CAT_INFO = {
    review:{ bg:'#FFF7ED', color:'#EA580C', label:'업체후기' },
    info:  { bg:'#EFF6FF', color:'#3B82F6', label:'정보공유' },
    free:  { bg:'#F5F3FF', color:'#7C3AED', label:'자유' },
    owner: { bg:'#FEF3C7', color:'#D97706', label:'업주전용' },
    worker:{ bg:'#E0F2FE', color:'#0284C7', label:'알바생전용' },
  };
  const ct = CAT_INFO[post.category] || CAT_INFO.free;
  const author = post.is_anonymous ? '익명' : (post.workers?.name || post.businesses?.biz_name || '사용자');
  const fmtFull = iso => { const d = new Date(iso); return `${d.getFullYear()}.${d.getMonth()+1}.${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}`; };
  const fmtRel = iso => { const d = new Date(iso); const now = new Date(); const diffH = (now - d) / 3600000; if (diffH < 1) return Math.floor(diffH * 60) + '분 전'; if (diffH < 24) return Math.floor(diffH) + '시간 전'; return `${d.getMonth()+1}/${d.getDate()}`; };

  const isMyPost = currentUser && (post.workers?.kakao_uid === currentUser.id || post.businesses?.kakao_uid === currentUser.id);
  const myPostBtns = isMyPost ? `
    <div style="display:flex;gap:8px;margin-top:12px">
      <button onclick="openEditCommPost()" style="padding:7px 14px;border:1.5px solid #ddd;border-radius:20px;background:#fff;font-size:12px;font-weight:700;color:#555;cursor:pointer">✏️ 수정</button>
      <button onclick="deleteCommPost()" style="padding:7px 14px;border:1.5px solid #fca5a5;border-radius:20px;background:#fff3f3;font-size:12px;font-weight:700;color:#c53030;cursor:pointer">🗑 삭제</button>
    </div>` : '';

  const commentsHtml = comments?.length
    ? comments.map(c => {
        const ca = c.is_anonymous ? '익명' : (c.workers?.name || c.businesses?.biz_name || '사용자');
        const isMyComment = currentUser && (c.workers?.kakao_uid === currentUser.id || c.businesses?.kakao_uid === currentUser.id);
        return `<div style="padding:12px 0;border-top:1px solid #f5f5f5">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
            <span style="font-size:12px;font-weight:700;color:#555">${ca}</span>
            <span style="font-size:11px;color:#ccc">${fmtRel(c.created_at)}</span>
            ${isMyComment ? `<button onclick="deleteCommComment('${c.id}')" style="margin-left:auto;padding:3px 8px;border:none;background:none;font-size:11px;color:#ccc;cursor:pointer">삭제</button>` : ''}
          </div>
          <div style="font-size:13px;color:#333;line-height:1.6">${c.content}</div>
        </div>`;
      }).join('')
    : '<div style="color:#bbb;font-size:13px;padding:16px 0">첫 댓글을 달아보세요</div>';

  body.innerHTML = `
    <div style="padding-bottom:12px;border-bottom:1px solid #f0f0f0;margin-bottom:14px">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">
        <span style="font-size:11px;font-weight:800;padding:2px 8px;border-radius:20px;background:${ct.bg};color:${ct.color}">${ct.label}</span>
      </div>
      <div style="font-size:13px;color:#aaa;margin-bottom:14px">${author} · ${fmtFull(post.created_at)}</div>
      <div style="font-size:14px;color:#333;line-height:1.8;white-space:pre-wrap">${post.content}</div>
      ${myPostBtns}
      <button id="comm-like-btn" onclick="likeCommunityPost()" style="margin-top:16px;display:inline-flex;align-items:center;gap:6px;padding:8px 18px;border:1.5px solid #eee;border-radius:24px;background:#fff;font-size:13px;font-weight:700;color:${_getLikedPosts().has(postId)?'#C8102E':'#555'};cursor:pointer">
        ❤️ <span id="comm-like-count">${post.likes || 0}</span>
      </button>
    </div>
    <div style="font-size:12px;font-weight:800;color:#999;margin-bottom:8px">댓글 ${comments?.length || 0}개</div>
    <div id="comm-comments-list">${commentsHtml}</div>
    <div style="height:20px"></div>
  `;
}

function _getLikedPosts() {
  return new Set(JSON.parse(localStorage.getItem('baro_liked_' + (currentUser?.id || '')) || '[]'));
}
function _saveLikedPost(postId) {
  const s = _getLikedPosts(); s.add(postId);
  localStorage.setItem('baro_liked_' + (currentUser?.id || ''), JSON.stringify([...s]));
}

async function likeCommunityPost() {
  if (!_commCurrentPostId || !currentUser) return;
  if (_getLikedPosts().has(_commCurrentPostId)) {
    showToast('이미 좋아요를 눌렀어요');
    return;
  }
  _commCurrentPostLikes++;
  const el = document.getElementById('comm-like-count');
  if (el) el.textContent = _commCurrentPostLikes;
  const btn = document.getElementById('comm-like-btn');
  if (btn) btn.style.color = '#C8102E';
  _saveLikedPost(_commCurrentPostId);
  await db.rpc('increment_post_likes', { p_post_id: _commCurrentPostId });
  loadCommunityPosts(_commCurrentCat);
}

async function submitCommunityPost() {
  if (!currentUser || isGuest) { showToast('로그인 후 작성할 수 있어요'); return; }
  const title = document.getElementById('comm-write-title').value.trim();
  const content = document.getElementById('comm-write-content').value.trim();
  const anon = document.getElementById('comm-write-anon').checked;
  if (!title) { showToast('제목을 입력해주세요'); return; }
  if (!content) { showToast('내용을 입력해주세요'); return; }

  // 수정 모드
  if (_commEditPostId) {
    const { error } = await db.from('community_posts')
      .update({ title, content, category: _commWriteCat, is_anonymous: anon })
      .eq('id', _commEditPostId);
    if (error) { showToast('수정 실패: ' + error.message); return; }
    showToast('✅ 게시글이 수정됐습니다');
    closeCommunityWriteOverlay();
    loadCommunityPosts(_commCurrentCat);
    openCommunityPost(_commCurrentPostId);
    return;
  }

  // 신규 등록
  const role = currentUser?.user_metadata?.baroalba_role;
  const insertData = { category: _commWriteCat, title, content, is_anonymous: anon };

  if (role === 'business') {
    const { data: b } = await db.from('businesses').select('id').eq('kakao_uid', currentUser.id).single();
    if (!b) { showToast('업체 정보를 먼저 등록해주세요'); return; }
    insertData.business_id = b.id;
  } else {
    const wid = await _getWorkerId();
    if (!wid) { showToast('프로필 등록 후 작성할 수 있어요'); return; }
    insertData.worker_id = wid;
  }

  const { error } = await db.from('community_posts').insert(insertData);
  if (error) { showToast('작성 실패: ' + error.message); return; }

  showToast('✅ 게시글이 등록됐습니다');
  closeCommunityWriteOverlay();
  loadCommunityPosts(_commCurrentCat);
}

function openEditCommPost() {
  const body = document.getElementById('comm-post-body');
  const title = document.getElementById('comm-post-title-h')?.textContent || '';
  // 현재 렌더된 내용에서 category / content / anon을 복원하기 위해 DB 재조회
  db.from('community_posts').select('title,content,category,is_anonymous').eq('id', _commCurrentPostId).single()
    .then(({ data: p }) => {
      if (!p) return;
      _commEditPostId = _commCurrentPostId;
      _commWriteCat = p.category || 'free';
      document.getElementById('comm-write-title').value = p.title || '';
      document.getElementById('comm-write-content').value = p.content || '';
      document.getElementById('comm-write-anon').checked = !!p.is_anonymous;
      _buildWriteCats();
      document.getElementById('comm-write-title-h').textContent = '게시글 수정';
      document.getElementById('comm-write-submit-btn').textContent = '수정하기';
      document.getElementById('community-write-overlay').classList.add('open');
    });
}

function deleteCommPost() {
  if (!_commCurrentPostId) return;
  showConfirm('댓글도 함께 삭제됩니다.', async () => {
    const { error } = await db.from('community_posts').delete().eq('id', _commCurrentPostId);
    if (error) { showToast('삭제 실패'); return; }
    showToast('🗑 게시글이 삭제됐습니다');
    closeCommunityPost();
    loadCommunityPosts(_commCurrentCat);
  }, {icon:'🗑️', title:'게시글 삭제', okLabel:'삭제', danger:true});
}

function deleteCommComment(commentId) {
  showConfirm('', async () => {
    const { error } = await db.from('community_comments').delete().eq('id', commentId);
    if (error) { showToast('삭제 실패'); return; }
    const { data: p } = await db.from('community_posts').select('comments_count').eq('id', _commCurrentPostId).single();
    if (p) await db.from('community_posts').update({ comments_count: Math.max(0, (p.comments_count || 1) - 1) }).eq('id', _commCurrentPostId);
    showToast('댓글이 삭제됐습니다');
    openCommunityPost(_commCurrentPostId);
  }, {icon:'🗑️', title:'댓글 삭제', okLabel:'삭제', danger:true});
}

async function submitCommunityComment() {
  if (!currentUser || isGuest) { showToast('로그인 후 댓글을 달 수 있어요'); return; }
  if (!_commCurrentPostId) return;
  const input = document.getElementById('comm-comment-input');
  const content = input.value.trim();
  if (!content) return;

  const role = currentUser?.user_metadata?.baroalba_role;
  const anonChk = document.getElementById('comm-comment-anon');
  const insertData = { post_id: _commCurrentPostId, content, is_anonymous: !!(anonChk && anonChk.checked) };

  if (role === 'business') {
    const { data: b } = await db.from('businesses').select('id').eq('kakao_uid', currentUser.id).single();
    if (!b) { showToast('업체 정보를 먼저 등록해주세요'); return; }
    insertData.business_id = b.id;
  } else {
    const wid = await _getWorkerId();
    if (!wid) { showToast('프로필 등록 후 이용할 수 있어요'); return; }
    insertData.worker_id = wid;
  }

  const { error } = await db.from('community_comments').insert(insertData);
  if (error) { showToast('댓글 실패: ' + error.message); return; }

  // 댓글수 직접 증가 (RPC 대신)
  const { data: cur } = await db.from('community_posts').select('comments_count, worker_id, business_id, title, is_anonymous').eq('id', _commCurrentPostId).single();
  await db.from('community_posts').update({ comments_count: (cur?.comments_count || 0) + 1 }).eq('id', _commCurrentPostId);

  // 게시글 작성자에게 댓글 알림 (본인 댓글 제외)
  if (cur) {
    const commenterName = anonChk?.checked ? '익명' : (currentUser?.user_metadata?.full_name || '누군가');
    const targetWorkerUid = cur.worker_id
      ? (await db.from('workers').select('kakao_uid').eq('id', cur.worker_id).single()).data?.kakao_uid
      : null;
    const targetBizUid = cur.business_id
      ? (await db.from('businesses').select('kakao_uid').eq('id', cur.business_id).single()).data?.kakao_uid
      : null;
    const targetUid = targetWorkerUid || targetBizUid;
    if (targetUid && targetUid !== currentUser.id) {
      const { data: subs } = await db.from('push_subscriptions').select('endpoint, p256dh, auth, fcm_token').eq('user_id', targetUid).limit(3);
      if (subs?.length) {
        subs.forEach(sub => {
          fetch('/api/send-push', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              subscription: { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
              fcmToken: sub.fcm_token,
              title: '💬 새 댓글',
              body: `${commenterName}님이 댓글을 달았어요: "${cur.title}"`,
              url: './바로알바.html',
              tag: 'comm-comment-' + _commCurrentPostId,
            })
          }).catch(() => {});
        });
      }
    }
  }

  input.value = '';
  if (anonChk) anonChk.checked = false;
  loadCommunityPosts(_commCurrentCat);
  await openCommunityPost(_commCurrentPostId);
}


// ── owner 기능 JS (병합) ──
document.write('<scr'+'ipt src="//dapi.kakao.com/v2/maps/sdk.js?appkey='+APP_CONFIG.KAKAO_JS_KEY+'&libraries=services"><\/scr'+'ipt>');


let bizRecord = null;
let miniMap = null;
let miniMarker = null;
let selectedLatLng = null;
let postings = [];
let editingId = null;

// ── 초기화 ──────────────────────────────────────────────
async function initOwnerFeatures() {
  buildTimeSelects();
  loadCategories();
  applyLang();
  const { data: { session } } = await db.auth.getSession();
  if (!session) { location.href = '/login.html'; return; }
  currentUser = session.user;
  currentSession = session;
  if (window._pendingFCMToken) _saveFCMToken(window._pendingFCMToken); // 로그인 전 수신된 토큰 저장

  // 첫 로그인 온보딩 튜토리얼
  if (!localStorage.getItem(_OB_KEY)) setTimeout(showOnboarding, 800);

  // 업주 레코드 조회
  const { data: biz } = await db.from('businesses')
    .select('*').eq('kakao_uid', currentUser.id).single();

  if (!biz) {
    // businesses 레코드 자동 생성
    const meta = currentUser.user_metadata || {};
    const newName = meta.full_name || meta.name || currentUser.email?.split('@')[0] || '내 업체';
    const { data: created, error: createErr } = await db.from('businesses')
      .insert({ kakao_uid: currentUser.id, name: newName })
      .select().single();
    if (createErr || !created) {
      document.getElementById('postings-list').innerHTML = '<div style="text-align:center;padding:32px;color:#aaa"><div style="font-size:32px;margin-bottom:8px">⚠️</div><div>업주 프로필 생성 실패<br>로그아웃 후 다시 로그인해주세요</div></div>';
      document.getElementById('applicants-list').innerHTML = '';
      return;
    }
    bizRecord = created;
  } else {
    bizRecord = biz;
  }

  // 결제 직후에만 메모리에 반영되고 새로고침하면 항상 'free'로 리셋되던 문제 수정 -
  // 로그인 시 실제 businesses.plan 값을 읽어와 플랜 상태를 복원한다
  _currentPlan = bizRecord.plan || 'free';
  renderPlanUI();

  autoCloseExpiredPostings();
  checkSurgeSchedules();
  checkSurgeIntervals();
  setInterval(() => { checkSurgeSchedules(); checkSurgeIntervals(); }, 60000);
  _loadFavWorkers();
  loadMyPlaces();
  loadFavWorkers();
  loadFavWorkersFromSupabase();
  loadPostings();
  loadApplicants();
  setTimeout(updateOwnerNotiBadge, 1500);

  // 새로고침 시 마지막 활성 탭 복원
  const savedTab = sessionStorage.getItem('ownerActiveTab');
  if (savedTab && savedTab !== 'postings') {
    const navIdx = { map:0, postings:1, applicants:2, chats:3, settings:4 };
    const idx = navIdx[savedTab] ?? 1;
    ownerSetNav(document.querySelectorAll('.nav-item')[idx], savedTab);
  }
}

// ── 내 공고 불러오기 ─────────────────────────────────────
async function loadPostings() {
  const { data, error } = await db
    .from('job_postings')
    .select('*')
    .eq('business_id', bizRecord.id)
    .order('created_at', { ascending: false });

  if (error) { showToast('공고 불러오기 실패'); return; }
  postings = data || [];

  // 기간 만료된 open/urgent 공고 자동 마감
  const today = new Date().toISOString().slice(0, 10);
  const toClose = postings.filter(p =>
    (p.status === 'open' || p.status === 'urgent') && p.work_end_date && p.work_end_date < today
  );
  if (toClose.length) {
    await db.from('job_postings').update({ status: 'closed' })
      .in('id', toClose.map(p => p.id));
    toClose.forEach(p => { p.status = 'closed'; });
  }

  renderPostings();
  updateStats();
  subscribeOwnerGlobalChat();
}

function renderPostings() {
  const el = document.getElementById('postings-list');
  if (!postings.length) {
    el.innerHTML = '<div class="empty"><div class="empty-icon">\u{1F4DD}</div><div class="empty-txt">등록한 공고가 없어요<br>+ 버튼을 눌러 첫 공고를 올려보세요</div></div>';
    return;
  }
  el.innerHTML = postings.map(p => {
    const isOpen = p.status === 'open' || p.status === 'urgent';
    const today = new Date().toISOString().slice(0, 10);
    const isExpired = p.work_end_date && p.work_end_date < today;
    const surge = p.current_wage - p.base_wage;
    const statusLabel = p.status === 'urgent' ? 'ASAP' : p.status === 'open' ? t('status_open_label') : t('status_closed_label');
    const statusCls = p.status === 'urgent' ? 'urgent' : p.status === 'open' ? 'open' : 'closed';
    const start = p.start_time ? formatTime(p.start_time) : '미정';
    // 날짜 표시 헬퍼
    const fmtDate = iso => { const d = new Date(iso); return `${d.getMonth()+1}/${d.getDate()}(${['일','월','화','수','목','금','토'][d.getDay()]}) ${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}`; };
    const fmtDay  = iso => { const d = new Date(iso); return `${d.getMonth()+1}/${d.getDate()}`; };
    const createdStr = p.created_at ? fmtDay(p.created_at) + ' 등록' : '';
    const workTimeStr = p.start_time ? fmtDate(p.start_time) : '';
    const workRangeStr = p.work_end_date ? `~${p.work_end_date.slice(5).replace('-','/')}` : '';
    const workDaysStr = p.work_days || '';
    // 공고 유형 배지
    const cat = p.category || '';
    const jobTypeBadge = cat.startsWith('\u{1F527}')||cat.startsWith('⚡')||cat.startsWith('\u{1F3E0}')||cat.startsWith('\u{1F69A}')||cat.startsWith('\u{1F6CB}')||cat.startsWith('\u{1F511}')||cat.startsWith('\u{1F9FD}')||cat.startsWith('\u{1F528}')
      ? '<span style="font-size:10px;font-weight:800;background:#EEF2FF;color:#4F46E5;padding:2px 6px;border-radius:6px">\u{1F527} 기술직</span>'
      : cat.startsWith('\u{1F436}')||cat.startsWith('\u{1F43E}')||cat.startsWith('\u{1F476}')||cat.startsWith('\u{1F474}')||cat.startsWith('\u{1F3E5}')||cat.startsWith('\u{1F3E1}')
      ? '<span style="font-size:10px;font-weight:800;background:#F0FDF4;color:#16a34a;padding:2px 6px;border-radius:6px">\u{1F91D} 돌봄</span>'
      : '';

    const WT = { errand:{bg:'#F3E8FF',color:'#7C3AED',label:'심부름'}, short:{bg:'#EFF6FF',color:'#3B82F6',label:'단기'}, regular:{bg:'#F0FFF4',color:'#16a34a',label:'정기'}, spot:{bg:'#FFF7ED',color:'#F59E0B',label:'스팟'} };
    const wtStyle = WT[p.work_type] || null;
    const workTypeBadge = wtStyle ? `<span style="font-size:10px;font-weight:700;background:${wtStyle.bg};color:${wtStyle.color};padding:2px 7px;border-radius:6px">${wtStyle.label}</span>` : '';
    const statusDot = p.status === 'urgent' ? `<span style="color:#C8102E;font-weight:800;font-size:12px">● ASAP</span>` : p.status === 'open' ? `<span style="color:#555;font-weight:700;font-size:12px">● 모집중</span>` : `<span style="color:#bbb;font-weight:600;font-size:12px">● 마감</span>`;
    const timeInfo = workTimeStr ? workTimeStr : workRangeStr ? `~${workRangeStr}` : createdStr;
    return `
    <div class="posting-card ${p.status === 'urgent' ? 'urgent-card' : ''} ${!isOpen ? 'closed-card' : ''}" id="card-${p.id}" onclick="openPostingDetail('${p.id}')">
      <!-- 상단: 카테고리 + 태그 + 토글 -->
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px">
        <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap">
          <span style="font-size:11px;color:#888;font-weight:600">${p.category}</span>
          ${workTypeBadge}
          ${jobTypeBadge}
          ${p.surge_enabled ? '<span style="font-size:10px;font-weight:800;background:#FFF3E0;color:#FF9500;padding:2px 7px;border-radius:6px">⚡ 번개</span>' : ''}
          ${p.is_premium ? '<span style="font-size:10px;font-weight:700;background:#EDE9FE;color:#7C3AED;padding:2px 6px;border-radius:6px">PRO</span>' : ''}
          ${p.age_limit ? '<span style="font-size:10px;font-weight:700;background:#FFF7ED;color:#EA580C;padding:2px 6px;border-radius:6px">18+</span>' : ''}
          ${isExpired ? '<span style="font-size:10px;font-weight:700;background:#FEF2F2;color:#EF4444;padding:2px 6px;border-radius:6px">기간만료</span>' : ''}
        </div>
        <!-- 토글 스위치 -->
        <button class="posting-toggle" onclick="event.stopPropagation();quickTogglePosting('${p.id}','${p.status}')"
          style="background:${isOpen ? '#22c55e' : '#ddd'}" title="${isOpen ? '마감하기' : '재오픈'}">
          <div class="posting-toggle-knob" style="left:${isOpen ? '23px' : '3px'}"></div>
        </button>
      </div>
      <!-- 제목 -->
      <div style="font-size:16px;font-weight:800;color:#111;margin-bottom:10px;line-height:1.3">${p.title}</div>
      <!-- 구분선 + 시급/시간/지원자/재등록 -->
      <div style="border-top:1px solid #f5f5f5;padding-top:10px;display:flex;align-items:flex-end;justify-content:space-between">
        <div>
          <div style="display:flex;align-items:baseline;gap:6px">
            <span style="font-size:20px;font-weight:900;color:var(--red);line-height:1">${p.current_wage.toLocaleString()}원</span>
            <span style="font-size:12px;color:#aaa;font-weight:600">/시간</span>
            ${surge > 0 ? `<span style="font-size:11px;color:#FF9500;font-weight:700">↑${surge.toLocaleString()}원</span>` : ''}
          </div>
          <div style="font-size:11px;color:#888;margin-top:4px;font-weight:600">${timeInfo}</div>
        </div>
        <div style="display:flex;align-items:center;gap:6px">
          ${!isOpen ? `<button onclick="event.stopPropagation();relistPosting('${p.id}')" class="posting-relist-btn">재등록</button>` : ''}
          <button onclick="event.stopPropagation();toggleApplicantInline('${p.id}')"
            style="display:flex;align-items:center;gap:4px;background:#FFF0F0;border:none;border-radius:20px;padding:6px 12px;cursor:pointer;font-size:13px;font-weight:700;color:var(--red);white-space:nowrap;flex-shrink:0">
            👥 <span id="app-count-${p.id}">...</span>명
            <span id="chevron-app-${p.id}" style="font-size:10px;transition:transform 0.2s">▼</span>
          </button>
        </div>
      </div>
      <!-- 인라인 지원자 목록 (토글) -->
      <div id="inline-apps-${p.id}" style="display:none;border-top:1px solid #f5f5f5;padding-top:12px;margin-top:10px">
        <div id="inline-apps-body-${p.id}"></div>
      </div>
    </div>`;
  }).join('');

  // + 새 공고 작성 CTA
  el.innerHTML += `<div class="posting-new-cta" onclick="openPostingForm()">
    <div style="font-size:14px;color:#bbb;font-weight:700">+ 새 공고 작성</div>
  </div>`;

  postings.forEach(p => loadApplicantCount(p.id));
}

function toggleApplicantInline(jobId) {
  const box     = document.getElementById(`inline-apps-${jobId}`);
  const chevron = document.getElementById(`chevron-app-${jobId}`);
  const isOpen  = box.style.display === 'none';
  box.style.display = isOpen ? 'block' : 'none';
  chevron.style.transform = isOpen ? 'rotate(180deg)' : '';
  if (isOpen) loadInlineApplicants(jobId, `inline-apps-body-${jobId}`);
}

function openPostingDetail(jobId) {
  window._pdJobId = jobId;
  const p = postings.find(x => x.id === jobId);
  if (!p) return;

  const isOpen = p.status === 'open' || p.status === 'urgent';
  const today  = new Date().toISOString().slice(0, 10);
  const isExpired = p.work_end_date && p.work_end_date < today;
  const surge  = p.current_wage - p.base_wage;
  const fmtDate = iso => { const d = new Date(iso); return `${d.getMonth()+1}/${d.getDate()} (${['일','월','화','수','목','금','토'][d.getDay()]}) ${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}`; };
  const fmtDay  = iso => { const d = new Date(iso); return `${d.getMonth()+1}/${d.getDate()}`; };

  const WORK_TYPE_LABEL = { spot:'스팟', short:'단기', regular:'정기', errand:'심부름' };
  const typeLabel = WORK_TYPE_LABEL[p.work_type] || '스팟';
  const statusColor = p.status==='urgent' ? '#C8102E' : p.status==='open' ? '#16a34a' : '#888';
  const statusLabel = p.status==='urgent' ? 'ASAP' : p.status==='open' ? t('status_open_label') : t('status_closed_label');

  document.getElementById('pd-body').innerHTML = `
    <div style="padding:0 20px 20px">
      ${!isOpen ? `<button onclick="reopenWithEdit('${p.id}')" style="width:100%;padding:14px;background:#C8102E;color:#fff;border:none;border-radius:12px;font-size:15px;font-weight:800;cursor:pointer;margin-bottom:14px">공고 재오픈 (내용 수정)</button>` : ''}
      <!-- 상태/유형 -->
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:12px;padding-top:4px">
        <span style="font-size:12px;font-weight:800;color:${statusColor};background:${statusColor}18;padding:4px 12px;border-radius:20px">${statusLabel}</span>
        <span style="font-size:12px;font-weight:700;color:#666;background:#f5f5f5;padding:4px 10px;border-radius:20px">${typeLabel}</span>
        ${isExpired ? '<span style="font-size:12px;font-weight:800;color:#EF4444;background:#FEF2F2;padding:4px 10px;border-radius:20px">⏰ 기간만료</span>' : ''}
      </div>

      <!-- 공고명 -->
      <div style="font-size:22px;font-weight:900;color:#111;line-height:1.3;margin-bottom:4px">${p.title}</div>
      <div style="font-size:13px;color:#999;margin-bottom:20px">${p.category || ''}</div>

      <!-- 시급 -->
      <div style="background:linear-gradient(135deg,#fff0f0,#fff8f8);border-radius:16px;padding:16px;margin-bottom:16px">
        <div style="font-size:11px;color:#aaa;font-weight:700;margin-bottom:4px">시급</div>
        <div style="font-size:28px;font-weight:900;color:var(--red)">${p.current_wage.toLocaleString()}<span style="font-size:16px">원</span></div>
        ${surge > 0 ? `<div style="font-size:12px;color:#FF9500;font-weight:700;margin-top:4px">⚡ 기본 ${p.base_wage.toLocaleString()}원 → 서지 +${surge.toLocaleString()}원 인상</div>` : ''}
        ${p.same_day_payment ? '<div style="font-size:12px;color:#16a34a;font-weight:700;margin-top:4px">\u{1F4B4} 근무 당일 현금 지급</div>' : ''}
      </div>

      <!-- 근무 정보 그리드 -->
      ${(() => {
        const isRegular = p.work_type === 'regular';
        const fmtTime = iso => { const d = new Date(iso); return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; };
        if (isRegular && p.start_time) {
          const startT = fmtTime(p.start_time);
          const endT = p.duration_hours ? (() => { const e = new Date(p.start_time); e.setHours(e.getHours() + p.duration_hours); return fmtTime(e.toISOString()); })() : null;
          return `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">
        <div style="background:#f8f8f8;border-radius:12px;padding:12px;grid-column:1/-1">
          <div style="font-size:11px;color:#aaa;font-weight:700;margin-bottom:4px">근무 시간</div>
          <div style="font-size:13px;font-weight:800;color:#333">${startT}${endT ? ' ~ ' + endT : ''}${p.duration_hours ? ` (${p.duration_hours}시간)` : ''}</div>
        </div>`;
        }
        const endStr = (p.start_time && p.duration_hours) ? (() => {
          const e = new Date(p.start_time); e.setHours(e.getHours() + p.duration_hours); return fmtDate(e.toISOString());
        })() : null;
        return `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">
        <div style="background:#f8f8f8;border-radius:12px;padding:12px">
          <div style="font-size:11px;color:#aaa;font-weight:700;margin-bottom:4px">근무 시작</div>
          <div style="font-size:13px;font-weight:800;color:#333">${p.start_time ? fmtDate(p.start_time) : '미정'}</div>
        </div>
        <div style="background:#f8f8f8;border-radius:12px;padding:12px">
          <div style="font-size:11px;color:#aaa;font-weight:700;margin-bottom:4px">근무 종료</div>
          <div style="font-size:13px;font-weight:800;color:#333">${endStr || (p.duration_hours ? p.duration_hours + '시간' : '-')}</div>
        </div>`;
      })()}
        <div style="background:#f8f8f8;border-radius:12px;padding:12px">
          <div style="font-size:11px;color:#aaa;font-weight:700;margin-bottom:4px">필요 인원</div>
          <div style="font-size:13px;font-weight:800;color:#333">${p.filled_count ?? 0}/${p.needed_count ?? 1}명 (${p.needed_count - p.filled_count}명 모집 중)</div>
        </div>
        ${p.work_end_date ? `<div style="background:#EFF6FF;border-radius:12px;padding:12px">
          <div style="font-size:11px;color:#3B82F6;font-weight:700;margin-bottom:4px">모집 마감</div>
          <div style="font-size:13px;font-weight:800;color:#1E3A8A">~${p.work_end_date.slice(5).replace('-','/')}</div>
        </div>` : ''}
        ${p.work_days ? `<div style="background:#F0FDF4;border-radius:12px;padding:12px;grid-column:1/-1">
          <div style="font-size:11px;color:#16a34a;font-weight:700;margin-bottom:4px">근무 요일</div>
          <div style="font-size:13px;font-weight:800;color:#166534">${p.work_days}</div>
        </div>` : ''}
      </div>

      <!-- 위치 -->
      ${(p.address || (p.lat && p.lng)) ? `<div style="background:#f8f8f8;border-radius:12px;padding:14px;margin-bottom:16px;display:flex;align-items:flex-start;gap:10px">
        <span style="font-size:20px">\u{1F4CD}</span>
        <div>
          <div style="font-size:11px;color:#aaa;font-weight:700;margin-bottom:2px">위치</div>
          <div id="pd-addr-text" style="font-size:14px;font-weight:700;color:#333;line-height:1.6;white-space:pre-wrap">${p.address || '위치 불러오는 중...'}</div>
        </div>
      </div>` : '<div style="background:#FFF7ED;border-radius:12px;padding:14px;margin-bottom:16px;font-size:13px;color:#F59E0B;font-weight:700">\u{1F4CD} 위치 정보 없음 — 수정 탭에서 위치를 설정해주세요</div>'}

      <!-- 공고 설명 -->
      ${p.description ? `<div style="background:#fffef0;border-radius:12px;padding:14px;margin-bottom:20px;border-left:3px solid #F59E0B">
        <div style="font-size:11px;color:#F59E0B;font-weight:700;margin-bottom:6px">공고 내용</div>
        <div style="font-size:14px;color:#555;line-height:1.6;white-space:pre-wrap">${p.description}</div>
      </div>` : ''}

      <!-- 등록일 + 조회수 -->
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
        ${p.created_at ? `<div style="font-size:12px;color:#ccc">\u{1F4CC} ${fmtDay(p.created_at)} 등록</div>` : '<div></div>'}
        <div style="font-size:12px;color:#bbb;font-weight:700">\u{1F441} ${p.view_count || 0}회 조회</div>
      </div>

      <!-- 지원자 -->
      <div style="font-size:14px;font-weight:800;color:#222;margin-bottom:10px">\u{1F465} 지원자 목록</div>
      <div id="pd-applicants" style="margin-bottom:20px">
        <div style="text-align:center;padding:16px"><div class="spinner"></div></div>
      </div>

      <!-- 액션 버튼 -->
      <div style="display:flex;flex-direction:column;gap:8px">
        <div style="display:flex;gap:8px">
          <button onclick="openEditForm('${p.id}')" style="flex:1;padding:14px;background:#fff;color:#333;border:1.5px solid #e0e0e0;border-radius:12px;font-size:14px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:5px"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>수정</button>
          <button onclick="${isOpen ? `toggleStatus('${p.id}','${p.status}')` : `reopenWithEdit('${p.id}')`}" style="flex:1;padding:14px;background:${isOpen?'#FFF0F0':'#C8102E'};color:${isOpen?'#EF4444':'#fff'};border:${isOpen?'1.5px solid #EF4444':'none'};border-radius:12px;font-size:14px;font-weight:700;cursor:pointer">${isOpen ? '마감' : '재오픈'}</button>
        </div>
        <div style="display:flex;gap:8px">
          ${p.status === 'open' ? `<button onclick="setPostingUrgent('${p.id}',true)" style="flex:1;padding:10px;background:#FFF0F0;color:#C8102E;border:1.5px solid #FECACA;border-radius:10px;font-size:12px;font-weight:800;cursor:pointer">🔥 급구 설정</button>` : ''}
          ${p.status === 'urgent' ? `<button onclick="surgeWage('${p.id}',${p.current_wage})" style="flex:1;padding:10px;background:#FFF7ED;color:#D97706;border:1.5px solid #FDE68A;border-radius:10px;font-size:12px;font-weight:700;cursor:pointer">⚡ 서지(시급↑)</button>` : ''}
          <button onclick="openShareModal('${p.id}')" style="flex:1;padding:10px;background:#FEE500;color:#3C1E1E;border:none;border-radius:10px;font-size:12px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:4px"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>공유</button>
        </div>
        ${p.status === 'urgent' ? `<button onclick="setPostingUrgent('${p.id}',false)" style="background:none;border:none;color:#aaa;font-size:12px;padding:4px;cursor:pointer;width:100%;text-align:center;font-weight:600">급구 해제 → 일반 모집으로 전환</button>` : ''}
        <button onclick="deletePosting('${p.id}')" style="background:none;border:none;color:#EF4444;font-size:13px;padding:6px;cursor:pointer;width:100%;text-align:center;font-weight:600">공고 삭제</button>
      </div>
    </div>`;

  // 지원자 로드
  loadPostingDetailApplicants(p.id);

  // FAB 숨기기 (패널 위에 겹침 방지)
  const _pdFab = document.getElementById('posting-fab');
  if (_pdFab) _pdFab.style.display = 'none';

  // 패널 열기
  document.getElementById('panel-posting-detail').classList.add('show');

  // 주소 없고 좌표만 있으면 역지오코딩으로 주소 표시
  if (!p.address && p.lat && p.lng && typeof kakao !== 'undefined' && kakao.maps?.services) {
    const _gc = new kakao.maps.services.Geocoder();
    _gc.coord2Address(p.lng, p.lat, (result, status) => {
      const el = document.getElementById('pd-addr-text');
      if (!el) return;
      if (status === kakao.maps.services.Status.OK && result[0]) {
        const r = result[0];
        el.textContent = r.road_address ? r.road_address.address_name : r.address.address_name;
      } else {
        el.textContent = '주소를 불러올 수 없습니다';
        el.style.color = '#aaa';
      }
    });
  }
}

function closePostingDetail() {
  document.getElementById('panel-posting-detail').classList.remove('show');
  const _pdFab = document.getElementById('posting-fab');
  if (_pdFab) _pdFab.style.display = 'flex';
}

async function loadPostingDetailApplicants(jobId) {
  const el = document.getElementById('pd-applicants');
  if (!el) return;
  try {
    const { data: apps, error } = await db.from('applications')
      .select('*')
      .eq('job_posting_id', jobId)
      .order('applied_at', { ascending: false });
    if (error) throw error;
    if (!apps?.length) {
      el.innerHTML = '<div style="font-size:13px;color:#aaa;text-align:center;padding:16px">아직 지원자가 없어요</div>';
      return;
    }
    const wids = [...new Set(apps.filter(a => a.worker_id).map(a => a.worker_id))];
    let workerMap = {};
    if (wids.length) {
      const { data: wks } = await db.from('workers')
        .select('id, name, phone, rating, review_count, noshow_count')
        .in('id', wids);
      (wks || []).forEach(w => { workerMap[w.id] = w; });
    }
    const enriched = apps.map(a => ({ ...a, workers: workerMap[a.worker_id] || null }));
    el.innerHTML = enriched.map(a => makeApplicantCardHtml(a, { stopProp: false })).join('');
  } catch(e) {
    console.error('[applicants]', e);
    el.innerHTML = `<div style="font-size:13px;color:#aaa;text-align:center;padding:16px">지원자 목록을 불러오지 못했어요<br><span style="font-size:11px;color:#ddd">${e?.message||''}</span><br><button onclick="loadPostingDetailApplicants('${jobId}')" style="margin-top:10px;background:none;border:none;color:var(--red);font-weight:700;cursor:pointer;font-size:13px">↺ 다시 시도</button></div>`;
  }
}

async function loadInlineApplicants(jobId, targetId) {
  const elId = targetId || `applicants-inline-${jobId}`;
  const el = document.getElementById(elId);
  if (!el) return;
  const { data: apps } = await db.from('applications')
    .select('*')
    .eq('job_posting_id', jobId)
    .order('applied_at', { ascending: false });
  if (!apps?.length) {
    el.innerHTML = '<div style="font-size:12px;color:#aaa;padding:8px 0">아직 지원자가 없어요</div>';
    return;
  }
  const wids = [...new Set(apps.filter(a => a.worker_id).map(a => a.worker_id))];
  let workerMap = {};
  if (wids.length) {
    const { data: wks } = await db.from('workers')
      .select('id, name, phone, rating, review_count, noshow_count')
      .in('id', wids);
    (wks || []).forEach(w => { workerMap[w.id] = w; });
  }
  const enriched = apps.map(a => ({ ...a, workers: workerMap[a.worker_id] || null }));
  el.innerHTML = enriched.map(a => makeApplicantCardHtml(a, { stopProp: true })).join('');
}

function deleteApplication(appId) {
  showConfirm('복구할 수 없습니다.', async () => {
    const { error } = await db.from('applications').delete().eq('id', appId);
    if (error) { showToast('삭제 실패: ' + error.message); return; }
    document.getElementById('app-card-' + appId)?.remove();
    showToast('✅ 지원자가 삭제됐습니다');
    loadPostings();
  }, {icon:'🗑️', title:'지원자 삭제', okLabel:'삭제', danger:true});
}

function deletePosting(jobId) {
  showConfirm('지원자·채팅 데이터도 함께 삭제됩니다.\n삭제 후 복구가 불가능합니다.', async () => {
    const sess = currentSession;
    if (!sess) { showToast('로그인 세션이 만료됐습니다. 새로고침 후 재로그인해주세요'); return; }
    const res = await fetch(
      APP_CONFIG.SUPABASE_URL + '/rest/v1/job_postings?id=eq.' + jobId,
      { method: 'DELETE', headers: { 'apikey': APP_CONFIG.SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + sess.access_token, 'Content-Type': 'application/json', 'Prefer': 'return=representation' } }
    );
    if (!res.ok) {
      let msg = '삭제 실패';
      try { const err = await res.json(); msg += ': ' + (err.message || err.details || JSON.stringify(err)); } catch {}
      showToast(msg); return;
    }
    const deleted = await res.json();
    if (!deleted?.length) { showToast('삭제 실패: 권한이 없거나 이미 삭제된 공고입니다'); return; }
    showToast('✅ 공고가 삭제됐습니다');
    closePostingDetail(); loadPostings();
  }, {icon:'🗑️', title:'공고 삭제', okLabel:'삭제', danger:true});
}

// ── 지원자 카드 공통 생성 함수 ──────────────────────────────
const _STATUS_BADGE = {
  pending:   { bg:'#F3F4F6', color:'#6B7280', label:'검토 전' },
  reviewing: { bg:'#FFF7ED', color:'#D97706', label:'1차합격' },
  on_hold:   { bg:'#EFF6FF', color:'#3B82F6', label:'보류' },
  accepted:  { bg:'#D1FAE5', color:'#065F46', label:'✅ 최종합격' },
  rejected:  { bg:'#F5F5F5', color:'#888',    label:'탈락' },
  cancelled: { bg:'#F5F5F5', color:'#aaa',    label:'지원취소' },
  completed: { bg:'#DBEAFE', color:'#1e40af', label:'🏁 근무완료' },
  noshow:    { bg:'#FEE2E2', color:'#DC2626', label:'노쇼' },
};

function _adminBtn(table, id, field, value, label) {
  const safe = (value || '').replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/"/g,'&quot;');
  return `<button onclick="event.stopPropagation();adminQuickEdit('${table}','${id}','${field}','${safe}','${label}')" style="display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;background:#FEF3C7;border:1px solid #FDE68A;border-radius:4px;font-size:10px;cursor:pointer;margin-left:4px;vertical-align:middle;flex-shrink:0" title="어드민 수정">✏️</button>`;
}
function adminQuickEdit(table, id, field, currentValue, label) {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:99000;display:flex;align-items:center;justify-content:center;padding:24px';
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
  overlay.innerHTML = `
    <div style="background:#fff;border-radius:20px;padding:24px;width:100%;max-width:360px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
        <span style="font-size:18px">🛡️</span>
        <div style="font-size:16px;font-weight:900;color:#222">어드민 수정</div>
      </div>
      <div style="font-size:12px;color:#aaa;margin-bottom:14px">${label}</div>
      <textarea id="_aqe-input" style="width:100%;box-sizing:border-box;height:72px;padding:12px;border:1.5px solid #e5e7eb;border-radius:12px;font-size:14px;resize:none;font-family:inherit;line-height:1.5;outline:none"></textarea>
      <div style="display:flex;gap:8px;margin-top:12px">
        <button onclick="this.closest('div[style*=fixed]').remove()" style="flex:1;padding:12px;background:#f5f5f5;color:#555;border:none;border-radius:12px;font-size:14px;font-weight:700;cursor:pointer">취소</button>
        <button id="_aqe-save" style="flex:1;padding:12px;background:#1e293b;color:#fff;border:none;border-radius:12px;font-size:14px;font-weight:800;cursor:pointer">저장</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const ta = overlay.querySelector('#_aqe-input');
  ta.value = currentValue || '';
  setTimeout(() => ta.focus(), 80);
  overlay.querySelector('#_aqe-save').onclick = async () => {
    const val = ta.value.trim();
    if (!val) { showToast('내용을 입력해주세요'); return; }
    const { error } = await db.from(table).update({ [field]: val }).eq('id', id);
    if (error) { showToast('저장 실패: ' + error.message); return; }
    showToast('✅ 수정됐어요');
    overlay.remove();
    if (table === 'job_postings') loadJobs();
    else if (table === 'gatherings') loadMoimList();
    else if (table === 'community_posts') loadCommunityPosts?.();
  };
}

function calcBakalbaScore(w) {
  const reviews = Math.min(parseInt(w?.review_count) || 0, 20);
  const noshow  = Math.min(parseInt(w?.noshow_count) || 0, 10);
  // 후기가 없으면 rating 기여 없음 (신규 유저 점수 인플레이션 방지)
  const rating  = reviews > 0 ? (parseFloat(w?.rating) || 0) : 0;
  const score = Math.round(
    40 +                           // 기본 40점
    (rating / 5) * 35 +            // 평점 최대 35점
    Math.min(reviews, 10) * 1.5 -  // 완료횟수 최대 15점
    noshow * 8                      // 노쇼 패널티 -8점/건
  );
  return Math.max(0, Math.min(99, score));
}
function trustBadgeHtml(w) {
  const s = calcBakalbaScore(w);
  const cls = s >= 80 ? 'trust-high' : s >= 60 ? 'trust-mid' : 'trust-low';
  return `<span class="trust-badge ${cls}">신뢰 ${s}점</span>`;
}

function makeApplicantCardHtml(a, opts = {}) {
  const { stopProp = false, isFav = false, isCmp = false, showExtras = false, lastWorked = null } = opts;
  const sp = 'event.stopPropagation();';
  const w = a.workers;
  const wid = w?.id || '';
  const name = w?.name || '이름없음';
  const rating = w?.rating != null ? Number(w.rating).toFixed(1) : '-';
  const reviews = w?.review_count || 0;
  const noshow = w?.noshow_count || 0;
  const total = reviews + noshow;
  const attendanceHtml = total > 0
    ? ` · <span style="color:${noshow > 0 ? '#dc2626' : '#16a34a'};font-weight:700">출근율 ${Math.round(reviews/total*100)}%</span>${noshow > 0 ? ` <span style="color:#dc2626">⚠️노쇼${noshow}</span>` : ''}`
    : '';
  const trustBadge = total >= 2 ? trustBadgeHtml(w) : '';
  const phone = w?.phone ? w.phone.replace(/(\d{3})(\d{3,4})(\d{4})/, '$1-$2-$3') : '';
  const b = _STATUS_BADGE[a.status] || _STATUS_BADGE.pending;
  const badge = `<span style="background:${b.bg};color:${b.color};padding:3px 10px;border-radius:20px;font-size:11px;font-weight:800;white-space:nowrap">${b.label}</span>`;
  const avatarSvg = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FF9999" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;

  // 액션 버튼 (상태별로 필요한 것만)
  let actions = `<button onclick="${sp}openChat('${a.id}','${name}')" class="ac-btn ac-chat">💬 채팅</button>`;
  if (a.status === 'pending') {
    actions += `<button onclick="${sp}updateApplication('${a.id}','reviewing')" class="ac-btn ac-pass">⭐ 1차합격</button>`;
    actions += `<button onclick="${sp}updateApplication('${a.id}','on_hold')" class="ac-btn ac-sub">📌 보류</button>`;
  } else if (a.status === 'reviewing') {
    actions += `<button onclick="${sp}confirmAccept('${a.id}')" class="ac-btn ac-pass" style="background:#22c55e;color:#fff">✅ 최종합격</button>`;
    actions += `<button onclick="${sp}updateApplication('${a.id}','on_hold')" class="ac-btn ac-sub">📌 보류</button>`;
    actions += `<button onclick="${sp}updateApplication('${a.id}','rejected')" class="ac-btn ac-fail">✗ 탈락</button>`;
  } else if (a.status === 'on_hold') {
    actions += `<button onclick="${sp}updateApplication('${a.id}','reviewing')" class="ac-btn ac-sub">↩ 1차합격으로</button>`;
    actions += `<button onclick="${sp}updateApplication('${a.id}','rejected')" class="ac-btn ac-fail">✗ 탈락</button>`;
  } else if (a.status === 'accepted') {
    actions += `<button onclick="${sp}showRatingModal('${a.id}','${wid}')" class="ac-btn ac-done">🏁 완료</button>`;
    actions += `<button onclick="${sp}markNoshow('${a.id}','${wid}')" class="ac-btn ac-fail">노쇼</button>`;
  } else if (a.status === 'rejected') {
    actions += `<button onclick="${sp}updateApplication('${a.id}','on_hold')" class="ac-btn ac-sub">↩ 보류로</button>`;
  } else if (a.status === 'completed') {
    const stars = a.worker_rating ? '⭐'.repeat(a.worker_rating) : '';
    if (stars) actions += `<span style="font-size:13px;letter-spacing:1px">${stars}</span>`;
    if (a.worker_review) {
      actions += `<button onclick="${sp}openReviewReplyModal('${a.id}','${name.replace(/'/g,"\\'")}','${a.worker_review.replace(/'/g,"\\'").replace(/\n/g,' ')}','${(a.review_reply||'').replace(/'/g,"\\'").replace(/\n/g,' ')}')" class="ac-btn ac-sub" style="font-size:11px;max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${a.review_reply ? '💬 답글' : '📝 답글달기'}</button>`;
    }
  }
  if (showExtras && wid) {
    const isRec = _recommendedWorkers.has(wid);
    const isBlk = _blockedWorkers.has(wid);
    actions += `<button onclick="${sp}toggleFavWorker('${wid}')" class="ac-btn ac-sub" style="flex:0;padding:8px 10px;background:${isFav?'#FEF3C7':'#f5f5f5'};color:${isFav?'#D97706':'#aaa'}" title="즐겨찾기">${isFav?'♥':'♡'}</button>`;
    actions += `<button onclick="${sp}toggleRecommendWorker('${wid}')" class="ac-btn ac-rec" style="flex:0;padding:8px 10px;background:${isRec?'#FEF3C7':'#f5f5f5'};color:${isRec?'#D97706':'#aaa'}" title="추천">${isRec?'👍':'추천'}</button>`;
    actions += `<button onclick="${sp}toggleBlockWorker('${wid}','${name.replace(/'/g,'&#39;')}')" class="ac-btn ac-blk" style="flex:0;padding:8px 10px;background:${isBlk?'#FFF1F2':'#f5f5f5'};color:${isBlk?'#BE123C':'#aaa'}" title="차단">${isBlk?'🚫':'차단'}</button>`;
    actions += `<button onclick="${sp}toggleCompare('${a.id}')" class="ac-btn ac-sub" style="flex:0;padding:8px 10px;background:${isCmp?'#EFF6FF':'#f5f5f5'};color:${isCmp?'#3B82F6':'#aaa'}">${isCmp?'✓비교':'비교'}</button>`;
  }

  const quickBadge = a.is_quick ? `<span style="font-size:10px;font-weight:900;background:#FFF9E6;color:#D97706;padding:2px 6px;border-radius:6px;margin-right:4px">⚡번개</span>` : '';
  const jobTitle = showExtras && a.job_postings?.title ? `<span style="font-size:10px;color:#bbb;margin-left:4px">· ${a.job_postings.title}</span>` : '';

  return `
  <div class="applicant-card s-${a.status}${isCmp?' cmp-selected':''}" id="app-card-${a.id}" onclick="${sp}">
    <div class="ac-top" onclick="${sp}openWorkerProfileDirect('${a.id}')">
      <div class="applicant-avatar">${avatarSvg}</div>
      <div class="ac-info">
        <div class="ac-name">${quickBadge}${name}${trustBadge}${jobTitle}</div>
        <div class="ac-meta">★ ${rating} · 완료 ${reviews}건${attendanceHtml}${phone ? ' · '+phone : ''}${showExtras && lastWorked ? ` · <span style="color:#94a3b8">근무 ${formatRelativeDate(lastWorked)}</span>` : ''}</div>
      </div>
      ${badge}
    </div>
    ${a.apply_message ? `<div style="margin:0 14px 10px;padding:9px 12px;background:#F8F9FA;border-radius:10px;border-left:3px solid #C8102E;font-size:12px;color:#444;line-height:1.5">${a.apply_message.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>` : ''}
    ${a.status === 'completed' && a.worker_review ? `
    <div style="margin:0 14px 10px;padding:10px 12px;background:#FFF7ED;border-radius:10px;border-left:3px solid #F59E0B">
      <div style="font-size:10px;font-weight:700;color:#92400E;margin-bottom:3px">⭐ ${name}님의 후기</div>
      <div style="font-size:12px;color:#78350F;line-height:1.5">"${a.worker_review.replace(/</g,'&lt;').replace(/>/g,'&gt;')}"</div>
      ${a.review_reply ? `<div style="margin-top:6px;padding:6px 8px;background:#FEF3C7;border-radius:8px;font-size:11px;color:#92400E"><span style="font-weight:800">업체 답글:</span> ${a.review_reply.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>` : ''}
    </div>` : ''}
    ${a.status === 'completed' && a.worker_rating && a.worker_review_reply ? `
    <div style="margin:0 14px 10px;padding:10px 12px;background:#EFF6FF;border-radius:10px;border-left:3px solid #3b82f6">
      <div style="font-size:10px;font-weight:700;color:#1e40af;margin-bottom:3px">💬 ${name}님의 평가 답글</div>
      <div style="font-size:12px;color:#1e3a8a;line-height:1.5">"${a.worker_review_reply.replace(/</g,'&lt;').replace(/>/g,'&gt;')}"</div>
    </div>` : ''}
    <div class="ac-actions" onclick="${sp}">${actions}</div>
  </div>`;
}

// ══════════════════════════════════════════════
// 레슨/과외 기능
// ══════════════════════════════════════════════
const TOSS_ENABLED = false;
let _currentLessonProfileId = null;
let _lessonMainFilter = '';   // '' | '레슨' | '과외'
let _lessonSubFilter  = '';
let _lessonOverlays   = [];   // 지도 마커 배열

const LESSON_MIDS = {
  '레슨':     [{v:'스포츠',e:'⚽'},{v:'음악',e:'🎵'},{v:'댄스',e:'💃'},{v:'미술',e:'🎨'},{v:'기타',e:''}],
  '과외':     [{v:'어학',e:'🌍'},{v:'수학/과학',e:'📐'},{v:'국어/인문',e:'📝'},{v:'기타(과외)',e:''}],
  '전문기술': [{v:'현장·시설',e:'🔧'},{v:'크리에이티브',e:'🎨'},{v:'IT·개발',e:'💻'},{v:'뷰티·케어',e:'💄'},{v:'언어·기타',e:'🌐'}]
};
const LESSON_SUBS = {
  '스포츠':      [{v:'골프',e:'⛳'},{v:'테니스',e:'🎾'},{v:'탁구',e:'🏓'},{v:'수영',e:'🏊'},{v:'PT/필라테스',e:'💪'},{v:'배드민턴',e:'🏸'},{v:'클라이밍',e:'🧗'},{v:'요가',e:'🧘'}],
  '음악':        [{v:'보컬',e:'🎤'},{v:'기타',e:'🎸'},{v:'피아노',e:'🎹'},{v:'드럼',e:'🥁'},{v:'바이올린',e:'🎻'},{v:'우쿨렐레',e:'🎵'}],
  '댄스':        [{v:'K-pop댄스',e:'🕺'},{v:'발레',e:'🩰'},{v:'힙합',e:'💃'},{v:'현대무용',e:'🩱'},{v:'재즈댄스',e:'✨'}],
  '미술':        [{v:'그림/수채화',e:'🎨'},{v:'디자인',e:'✏️'},{v:'공예',e:'🖼️'},{v:'캘리그라피',e:'🖊️'}],
  '기타':        [],
  '어학':        [{v:'영어',e:'🇺🇸'},{v:'중국어',e:'🇨🇳'},{v:'일본어',e:'🇯🇵'},{v:'스페인어',e:'🇪🇸'},{v:'기타외국어',e:'🌐'}],
  '수학/과학':   [{v:'수학',e:'📐'},{v:'과학',e:'🔬'},{v:'물리',e:'⚡'},{v:'화학',e:'🧪'},{v:'생물',e:'🌿'}],
  '국어/인문':   [{v:'국어',e:'📝'},{v:'역사',e:'📖'},{v:'논술',e:'✍️'},{v:'한국사',e:'🏛️'},{v:'사회',e:'🗺️'}],
  '기타(과외)':  [],
  '현장·시설':   [{v:'설비·수리',e:'🔧'},{v:'전기·전자',e:'⚡'},{v:'인테리어',e:'🏠'},{v:'청소·방역',e:'🧹'},{v:'이사·운반',e:'🚚'},{v:'조경·정원',e:'🌿'}],
  '크리에이티브':[{v:'사진 촬영',e:'📸'},{v:'영상 촬영·편집',e:'🎬'},{v:'그래픽·디자인',e:'🎨'},{v:'웹디자인·UI',e:'💻'},{v:'SNS·마케팅',e:'📱'},{v:'3D·모션',e:'✨'}],
  'IT·개발':     [{v:'웹·앱 개발',e:'⌨️'},{v:'데이터 분석',e:'📊'},{v:'자동화·스크립트',e:'🤖'},{v:'기타 IT',e:'💾'}],
  '뷰티·케어':   [{v:'헤어',e:'💇'},{v:'메이크업·네일',e:'💅'},{v:'피부 관리',e:'✨'}],
  '언어·기타':   [{v:'번역·통역',e:'🌐'},{v:'행사·MC',e:'🎤'},{v:'음식·케이터링',e:'🍽️'},{v:'기타 전문',e:'⭐'}],
};

function openLessonPanel() {
  _lessonMainFilter = ''; _lessonSubFilter = '';
  document.getElementById('panel-lesson').classList.add('show');
  const _lpFab = document.getElementById('posting-fab');
  if (_lpFab) _lpFab.style.display = 'none';
  _updateLessonSubcatRow();
  loadLessons();
}
function closeLessonPanel() {
  document.getElementById('panel-lesson').classList.remove('show');
  const _lpFab = document.getElementById('posting-fab');
  const _ownerPanelEl = document.getElementById('panel-owner');
  if (_lpFab && _ownerPanelEl && _ownerPanelEl.style.display !== 'none') _lpFab.style.display = 'flex';
  _clearLessonOverlays();
  document.querySelectorAll('.chip[data-cat]').forEach(c => c.classList.remove('active'));
  const allChip = document.querySelector('#filter-row .chip[data-cat=""]');
  if (allChip) allChip.classList.add('active');
  currentCategory = ''; currentWorkType = '';
}

function _clearLessonOverlays() {
  _lessonOverlays.forEach(o => o.setMap(null));
  _lessonOverlays = [];
}

function filterLessonMain(el, main) {
  _lessonMainFilter = main; _lessonSubFilter = '';
  // 탭 스타일
  ['lp-tab-all','lp-tab-lesson','lp-tab-tutoring','lp-tab-technical'].forEach(id => {
    const t = document.getElementById(id);
    if (t) { t.style.borderBottomColor='transparent'; t.style.color='#888'; }
  });
  el.style.borderBottomColor = '#C8102E'; el.style.color = '#C8102E';
  _updateLessonSubcatRow();
  loadLessons();
}

function _updateLessonSubcatRow() {
  const row = document.getElementById('lesson-subcat-row');
  const mids = _lessonMainFilter ? (LESSON_MIDS[_lessonMainFilter] || []) : [];
  if (!mids.length) {
    row.innerHTML = `<button class="lesson-cat-btn active" data-sub="" onclick="filterLessonSub(this,'')">전체</button>`;
    return;
  }
  row.innerHTML = `<button class="lesson-cat-btn active" data-sub="" onclick="filterLessonSub(this,'')">전체</button>`
    + mids.map(m => `<button class="lesson-cat-btn" data-sub="${m.v}" onclick="filterLessonSub(this,'${m.v}')">${m.e} ${m.v}</button>`).join('');
}

function filterLessonSub(el, sub) {
  document.querySelectorAll('#lesson-subcat-row .lesson-cat-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  _lessonSubFilter = sub;
  loadLessons();
}

let _lessonPriceMax = 0; // 0=전체, -1=협의만, 양수=최대금액
function filterLessonPrice(el, maxPrice) {
  document.querySelectorAll('#lesson-price-row .lesson-cat-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  _lessonPriceMax = maxPrice;
  loadLessons();
}

async function loadLessons() {
  const el = document.getElementById('lesson-list');
  el.innerHTML = '<div class="empty"><div class="empty-icon" style="font-size:32px">🧑‍🏫</div><div class="empty-txt">불러오는 중...</div></div>';
  _clearLessonOverlays();
  try {
    let q = db.from('lesson_profiles')
      .select('*, workers(name, rating, review_count, noshow_count)')
      .eq('is_active', true)
      .order('created_at', { ascending: false });
    if (_lessonMainFilter) q = q.eq('main_category', _lessonMainFilter);
    const { data, error } = await q;
    if (error) throw error;
    let lessons = data || [];
    if (_lessonSubFilter) {
      lessons = lessons.filter(p =>
        (p.mid_category && p.mid_category === _lessonSubFilter) ||
        (!p.mid_category && _getSubjectMidCat(p.subject) === _lessonSubFilter)
      );
    }
    if (_lessonPriceMax === -1) {
      lessons = lessons.filter(p => !p.price_per_session);
    } else if (_lessonPriceMax > 0) {
      if (_lessonPriceMax === 999999) {
        lessons = lessons.filter(p => p.price_per_session && p.price_per_session > 100000);
      } else {
        lessons = lessons.filter(p => p.price_per_session && p.price_per_session <= _lessonPriceMax);
      }
    }
    if (!lessons.length) {
      const emptyTxt = _lessonMainFilter === '전문기술' ? '등록된 전문기술 서비스가 없어요' : '등록된 레슨/과외가 없어요';
      el.innerHTML = `<div class="empty"><div class="empty-icon" style="font-size:36px">🧑‍🏫</div><div class="empty-txt">${emptyTxt}<br><span style="font-size:13px;color:#bbb">첫 번째로 등록해보세요!</span></div></div>`;
      return;
    }
    el.innerHTML = lessons.map(p => makeLessonCardHtml(p)).join('');
    _renderLessonMarkers(lessons);
  } catch(e) {
    el.innerHTML = '<div class="empty"><div class="empty-txt">불러오기 실패</div></div>';
  }
}

// ── 레슨 관리 패널 탭 전환 + 문의함 ──────────────────────────
function switchLessonManageTab(tab) {
  const profileList = document.getElementById('my-lesson-list');
  const inqList = document.getElementById('my-lesson-inquiries');
  const tabProfile = document.getElementById('lm-tab-profile');
  const tabInq = document.getElementById('lm-tab-inquiries');
  const regBtn = document.getElementById('lm-register-btn');
  if (tab === 'profile') {
    profileList.style.display = 'block';
    inqList.style.display = 'none';
    tabProfile.style.borderBottomColor = '#3b82f6'; tabProfile.style.color = '#3b82f6';
    tabInq.style.borderBottomColor = 'transparent'; tabInq.style.color = '#888';
    regBtn.style.display = '';
  } else {
    profileList.style.display = 'none';
    inqList.style.display = 'block';
    tabProfile.style.borderBottomColor = 'transparent'; tabProfile.style.color = '#888';
    tabInq.style.borderBottomColor = '#3b82f6'; tabInq.style.color = '#3b82f6';
    regBtn.style.display = 'none';
    loadMyLessonInquiries();
  }
}

async function loadMyLessonInquiries() {
  if (!currentUser) return;
  const el = document.getElementById('my-lesson-inquiries');
  el.innerHTML = '<div style="text-align:center;padding:40px;color:#bbb;font-size:13px">불러오는 중...</div>';
  try {
    // 내가 강사인 프로필에 들어온 문의
    const { data: profiles } = await db.from('lesson_profiles').select('id,subject,main_category').eq('worker_id', currentUser.id);
    if (!profiles?.length) {
      el.innerHTML = '<div style="text-align:center;padding:40px;color:#bbb;font-size:13px">등록된 레슨 프로필이 없어요</div>';
      return;
    }
    const profileIds = profiles.map(p => p.id);
    const profileMap = Object.fromEntries(profiles.map(p => [p.id, p]));
    const { data: inquiries } = await db.from('lesson_inquiries')
      .select('*, profiles!seeker_kakao_uid(name,nationality)')
      .in('lesson_profile_id', profileIds)
      .order('created_at', { ascending: false });
    if (!inquiries?.length) {
      el.innerHTML = '<div style="text-align:center;padding:60px 20px;color:#bbb;font-size:13px">아직 문의가 없어요<br><span style="font-size:12px">수강생이 문의하면 여기서 확인할 수 있어요</span></div>';
      const badge = document.getElementById('lm-inq-badge');
      if (badge) badge.style.display = 'none';
      return;
    }
    const STATUS_MAP = { pending:'대기중', accepted:'수락됨', rejected:'거절됨', closed:'종료' };
    const STATUS_COLOR = { pending:'#D97706', accepted:'#16a34a', rejected:'#9CA3AF', closed:'#9CA3AF' };
    el.innerHTML = inquiries.map(inq => {
      const seeker = inq.profiles || {};
      const prof = profileMap[inq.lesson_profile_id] || {};
      const stColor = STATUS_COLOR[inq.status] || '#888';
      const stLabel = STATUS_MAP[inq.status] || inq.status;
      const dateStr = inq.created_at ? new Date(inq.created_at).toLocaleDateString('ko-KR', {month:'short',day:'numeric'}) : '';
      const isPending = inq.status === 'pending';
      return `<div style="background:#fff;border:1px solid #f0f0f0;border-radius:14px;padding:14px;margin-bottom:10px">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:8px">
          <div>
            <div style="font-size:13px;font-weight:800;color:#111">${seeker.name || '수강생'}</div>
            <div style="font-size:11px;color:#888;margin-top:1px">${prof.main_category||'레슨'} · ${prof.subject||''} · ${dateStr}</div>
          </div>
          <span style="font-size:11px;font-weight:800;color:${stColor};background:${stColor}22;padding:3px 9px;border-radius:8px">${stLabel}</span>
        </div>
        ${inq.message ? `<div style="font-size:12px;color:#555;background:#f9fafb;border-radius:8px;padding:9px 11px;margin-bottom:8px;line-height:1.6">"${inq.message}"</div>` : ''}
        ${inq.proposed_price ? `<div style="font-size:12px;color:#C8102E;font-weight:700;margin-bottom:8px">제안 금액: ${Number(inq.proposed_price).toLocaleString()}원/회</div>` : ''}
        <div style="display:flex;gap:6px">
          <button onclick="openLessonInquiryChat('${inq.id}')" style="flex:1;padding:8px;background:#eff6ff;color:#1d4ed8;border:none;border-radius:10px;font-size:12px;font-weight:700;cursor:pointer">💬 채팅</button>
          ${isPending ? `
          <button onclick="decideLessonInquiry('${inq.id}','accepted')" style="flex:1;padding:8px;background:#16a34a;color:#fff;border:none;border-radius:10px;font-size:12px;font-weight:700;cursor:pointer">✅ 수락</button>
          <button onclick="decideLessonInquiry('${inq.id}','rejected')" style="flex:1;padding:8px;background:#f3f4f6;color:#6b7280;border:none;border-radius:10px;font-size:12px;font-weight:700;cursor:pointer">거절</button>
          ` : ''}
        </div>
      </div>`;
    }).join('');
    // 대기중 뱃지
    const pendingCnt = inquiries.filter(i => i.status === 'pending').length;
    const badge = document.getElementById('lm-inq-badge');
    if (badge) { badge.textContent = pendingCnt; badge.style.display = pendingCnt > 0 ? 'inline-block' : 'none'; }
  } catch(e) {
    el.innerHTML = '<div style="text-align:center;padding:40px;color:#bbb;font-size:13px">불러오기 실패</div>';
  }
}

async function decideLessonInquiry(inquiryId, decision) {
  const { error } = await db.from('lesson_inquiries').update({ status: decision, decided_at: new Date().toISOString() }).eq('id', inquiryId);
  if (error) { showToast('처리 실패'); return; }
  showToast(decision === 'accepted' ? '✅ 문의를 수락했어요' : '문의를 거절했어요');
  loadMyLessonInquiries();
}

async function openLessonInquiryChat(inquiryId) {
  const { data: inq } = await db.from('lesson_inquiries')
    .select('id,seeker_kakao_uid,lesson_profile_id,profiles!seeker_kakao_uid(name)')
    .eq('id', inquiryId).single();
  if (!inq) { showToast('문의 정보를 찾을 수 없어요'); return; }
  const seekerName = inq.profiles?.name || '문의자';
  _openLessonChatOverlay(inquiryId, seekerName, inq.seeker_kakao_uid);
}

function _renderLessonMarkers(data) {
  if (!kakaoMap) return;
  data.forEach(p => {
    if (!p.lat || !p.lng) return;
    const price = p.price_per_session ? Math.round(p.price_per_session/1000)+'K' : '-';
    const catColor = p.main_category === '과외' ? '#7c3aed' : '#0891b2';
    const onAir = p.is_available_now;
    const glow = onAir ? 'box-shadow:0 0 0 3px #22c55e,0 2px 12px rgba(34,197,94,0.5);' : 'box-shadow:0 2px 8px rgba(0,0,0,0.18);';
    const onAirDot = onAir ? '<span style="width:7px;height:7px;background:#22c55e;border-radius:50%;display:inline-block;margin-right:4px"></span>' : '';
    const content = `<div onclick="openLessonDetail('${p.id}')" style="background:${catColor};color:#fff;font-size:11px;font-weight:800;padding:5px 9px;border-radius:20px;white-space:nowrap;cursor:pointer;${glow}display:flex;align-items:center">${onAirDot}${p.subject} ${price}원</div>`;
    const overlay = new kakao.maps.CustomOverlay({
      position: new kakao.maps.LatLng(p.lat, p.lng),
      content, yAnchor: 1.2
    });
    overlay.setMap(kakaoMap);
    _lessonOverlays.push(overlay);
  });
}

function makeLessonCardHtml(p) {
  const w = p.workers;
  const rating = w?.rating != null ? Number(w.rating).toFixed(1) : '-';
  const reviews = w?.review_count || 0;
  const price = p.price_per_session ? Number(p.price_per_session).toLocaleString() + '원/회' : '-';
  const days = p.available_days?.join(' · ') || '';
  const locTypeMap = {방문레슨:'🚗 방문레슨', 센터방문:'🏫 센터방문', 비대면:'💻 비대면'};
  const locTypeBadge = p.location_type ? `<span style="font-size:10px;background:#f0f9ff;color:#0891b2;padding:2px 6px;border-radius:6px">${locTypeMap[p.location_type]||p.location_type}</span>` : '';
  const onAirBadge = p.is_available_now ? `<span style="font-size:10px;font-weight:800;background:#dcfce7;color:#16a34a;padding:2px 7px;border-radius:6px;display:inline-flex;align-items:center;gap:3px"><span style="width:6px;height:6px;background:#16a34a;border-radius:50%;display:inline-block"></span>지금 가능</span>` : '';
  const certBadge = p.cert_status === 'verified' ? `<span style="font-size:10px;font-weight:800;background:#fef3c7;color:#d97706;padding:2px 7px;border-radius:6px">✓ 인증</span>` : '';
  const retentionBadge = p._retention ? `<span style="font-size:10px;background:#f0fdf4;color:#16a34a;padding:2px 6px;border-radius:6px">재수강 ${p._retention}%</span>` : '';
  const titleText = `${p.main_category||'레슨'} · ${p.subject||'기타'}`;
  return `
  <div class="lesson-card" onclick="openLessonDetail('${p.id}')">
    <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin-bottom:5px">${onAirBadge}${certBadge}${locTypeBadge}</div>
    <div class="lesson-name">${titleText}</div>
    ${p.subject_detail ? `<div style="font-size:12px;color:#777;margin-top:2px;margin-bottom:2px;line-height:1.4">${p.subject_detail}</div>` : ''}
    <div style="display:flex;align-items:center;justify-content:space-between;margin-top:6px">
      <div class="lesson-price">${price}</div>
      <div style="font-size:12px;color:#888;display:flex;align-items:center;gap:6px">★ ${rating} · ${reviews}건${retentionBadge}</div>
    </div>
    <div class="lesson-meta">${[p.location_name, days].filter(Boolean).join(' · ') || '위치 협의'}</div>
  </div>`;
}

async function openLessonDetail(profileId) {
  _currentLessonProfileId = profileId;
  const [{ data: p }, { data: bookings }] = await Promise.all([
    db.from('lesson_profiles').select('*, workers(name, rating, review_count, noshow_count, phone, kakao_uid)').eq('id', profileId).single(),
    db.from('lesson_bookings').select('student_kakao_uid').eq('profile_id', profileId).eq('status', 'completed'),
  ]);
  if (!p) { showToast('정보를 불러올 수 없어요'); return; }
  const w = p.workers;
  const rating = w?.rating != null ? Number(w.rating).toFixed(1) : '-';
  const reviews = w?.review_count || 0;
  const price = p.price_per_session ? Number(p.price_per_session).toLocaleString() : '-';
  const days = p.available_days?.join(', ') || '협의';
  const locTypeMap = {방문레슨:'🚗 방문레슨', 센터방문:'🏫 센터/학원 방문', 비대면:'💻 비대면(온라인)'};

  // 재수강률 계산
  let retentionHtml = '';
  if (bookings?.length >= 3) {
    const freq = {};
    bookings.forEach(b => { freq[b.student_kakao_uid] = (freq[b.student_kakao_uid]||0)+1; });
    const returning = Object.values(freq).filter(c => c >= 2).length;
    const total = Object.keys(freq).length;
    if (total > 0) {
      const pct = Math.round(returning / total * 100);
      retentionHtml = `<div style="background:#f0fdf4;border-radius:10px;padding:10px 14px;margin-top:10px;font-size:13px;color:#16a34a;font-weight:700">🔄 재수강률 ${pct}% (${bookings.length}회 완료)</div>`;
    }
  }

  // 인증 배지
  const certHtml = p.cert_status === 'verified'
    ? `<span style="font-size:11px;font-weight:800;background:#fef3c7;color:#d97706;padding:3px 8px;border-radius:8px;margin-left:6px">✓ 자격 인증</span>`
    : p.cert_status === 'pending'
    ? `<span style="font-size:11px;background:#f1f5f9;color:#94a3b8;padding:3px 8px;border-radius:8px;margin-left:6px">인증 심사 중</span>` : '';

  // 온에어 배지
  const onAirHtml = p.is_available_now
    ? `<div style="background:#dcfce7;color:#16a34a;font-size:12px;font-weight:800;padding:6px 14px;border-radius:20px;display:inline-flex;align-items:center;gap:5px;margin-bottom:10px"><span style="width:7px;height:7px;background:#16a34a;border-radius:50%"></span>지금 바로 레슨 가능</div>` : '';

  document.getElementById('lesson-detail-body').innerHTML = `
    ${onAirHtml}
    <div style="margin-bottom:16px">
      <div style="display:flex;align-items:center;flex-wrap:wrap;gap:6px;margin-bottom:8px">
        <span style="font-size:11px;font-weight:800;background:${p.main_category==='과외'?'#f5f3ff':'#e0f7fa'};color:${p.main_category==='과외'?'#7c3aed':'#0891b2'};padding:3px 8px;border-radius:8px">${p.main_category||'레슨'}</span>
        <span class="lesson-subject-tag">${p.subject||'기타'}</span>${certHtml}
      </div>
      <div style="font-size:19px;font-weight:900;color:#222;margin-bottom:4px">${p.main_category||'레슨'} · ${p.subject||'기타'}</div>
      ${p.subject_detail ? `<div style="font-size:14px;color:#555;margin-bottom:6px;line-height:1.5">${p.subject_detail}</div>` : ''}
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <span style="font-size:13px;color:#888">강사: <strong style="color:#222">${w?.name||'알 수 없음'}</strong></span>
        <span style="font-size:13px">${_renderStars(w?.rating)} <strong>${rating}</strong></span>
        <span style="font-size:12px;color:#888">후기 ${reviews}건</span>
      </div>
    </div>
    <div style="background:#f8fafc;border-radius:14px;padding:14px;margin-bottom:16px">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div><div style="font-size:11px;color:#aaa;font-weight:600">1회 금액</div><div style="font-size:16px;font-weight:800;color:#C8102E;margin-top:3px">${price}원</div></div>
        <div><div style="font-size:11px;color:#aaa;font-weight:600">소요 시간</div><div style="font-size:16px;font-weight:800;color:#222;margin-top:3px">${p.session_duration||60}분</div></div>
        <div><div style="font-size:11px;color:#aaa;font-weight:600">가능 요일</div><div style="font-size:13px;font-weight:700;color:#222;margin-top:3px">${days}</div></div>
        <div><div style="font-size:11px;color:#aaa;font-weight:600">수업 형태</div><div style="font-size:13px;font-weight:700;color:#222;margin-top:3px">${locTypeMap[p.location_type]||'협의'}</div></div>
      </div>
      ${p.location_name ? `<div style="margin-top:10px;padding-top:10px;border-top:1px solid #e2e8f0;font-size:12px;color:#666">📍 ${p.location_name}</div>` : ''}
      ${p.available_times ? `<div style="margin-top:6px;font-size:12px;color:#666">🕐 ${(()=>{try{return JSON.parse(p.available_times).join(' · ')}catch{return p.available_times}})()}</div>` : ''}
      ${retentionHtml}
    </div>
    ${(()=>{
      try {
        const pkgs = p.packages ? JSON.parse(p.packages) : [];
        if (!pkgs.length) return '';
        return `<div style="margin-bottom:16px">
          <div style="font-size:13px;font-weight:800;color:#222;margin-bottom:8px">패키지 구성</div>
          <div style="display:flex;flex-direction:column;gap:6px">
            ${pkgs.map(pkg=>`
            <div style="display:flex;justify-content:space-between;align-items:center;background:#f8fafc;border-radius:10px;padding:10px 14px">
              <span style="font-size:14px;font-weight:700;color:#222">${pkg.label}</span>
              <div style="text-align:right">
                <span style="font-size:15px;font-weight:800;color:#C8102E">${Number(pkg.price).toLocaleString()}원</span>
                ${pkg.sessions?`<span style="font-size:11px;color:#aaa;margin-left:4px">(${Math.round(pkg.price/pkg.sessions).toLocaleString()}원/회)</span>`:''}
              </div>
            </div>`).join('')}
          </div>
        </div>`;
      } catch { return ''; }
    })()}
    <div style="display:flex;gap:10px;margin-bottom:12px">
      <button onclick="openLessonConsult('${p.id}','${(w?.name||'강사').replace(/'/g,"\\'")}','${w?.kakao_uid||''}')"
        style="flex:1;padding:14px;background:#f0fdf4;color:#16a34a;border:1.5px solid #86efac;border-radius:14px;font-size:15px;font-weight:800;cursor:pointer">💬 무료 상담</button>
      <button onclick="document.getElementById('lesson-booking-form').style.display='block';this.style.display='none';document.querySelector('.lesson-cta-row').style.display='none'"
        style="flex:1;padding:14px;background:#C8102E;color:#fff;border:none;border-radius:14px;font-size:15px;font-weight:800;cursor:pointer">📅 예약하기</button>
    </div>
    <div class="lesson-cta-row"></div>`;
  document.getElementById('lesson-booking-form').style.display = 'none';
  document.getElementById('lesson-detail-modal').classList.add('open');
}
function closeLessonDetailModal() {
  document.getElementById('lesson-detail-modal').classList.remove('open');
}

// ── 등록 ──────────────────────────────────────
let _selectedLessonSubject = '';
let _selectedMainCategory  = '레슨';
let _selectedMidCategory   = '';
let _selectedLrLocType     = '';
let _selectedLrDays        = [];
let _selectedLrTimes       = [];
let _certFile              = null;

function onCertFileSelected(input) {
  _certFile = input.files[0] || null;
  const nameEl = document.getElementById('cert-file-name');
  const btnEl  = document.getElementById('cert-upload-btn');
  if (_certFile) {
    nameEl.textContent = '✓ ' + _certFile.name;
    nameEl.style.display = 'block';
    btnEl.style.borderColor = '#16a34a';
    btnEl.style.color = '#16a34a';
    btnEl.textContent = '📎 ' + _certFile.name.slice(0, 20) + ((_certFile.name.length > 20) ? '…' : '');
  } else {
    nameEl.style.display = 'none';
    btnEl.style.borderColor = '#fbbf24';
    btnEl.style.color = '#a16207';
    btnEl.textContent = '📎 서류 업로드 (사진/PDF)';
  }
}

function openLessonRegisterModal() {
  _selectedLessonSubject = '';
  _selectedMainCategory  = '레슨';
  _selectedMidCategory   = '';
  _selectedLrLocType     = '';
  _selectedLrDays        = [];
  _selectedLrTimes       = [];
  document.querySelectorAll('#lr-main-cat-row .booking-day-btn').forEach((b,i) => b.classList.toggle('active', i===0));
  document.querySelectorAll('#lr-loctype-row .booking-day-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('#lr-days-row .booking-day-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('#lr-times-row .booking-day-btn').forEach(b => b.classList.remove('active'));
  // 분야(중간카테고리) 초기화
  const mids = LESSON_MIDS['레슨'] || [];
  document.getElementById('lr-mid-cat-row').innerHTML =
    mids.map(m => `<button type="button" class="booking-day-btn" style="flex-shrink:0" onclick="selectLessonMidCat(this,'${m.v}')">${m.e} ${m.v}</button>`).join('');
  document.getElementById('lesson-subject-chips').innerHTML = '';
  document.getElementById('lr-subject-label').style.display = 'none';
  ['lr-subject-custom','lr-detail','lr-price','lr-location'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  document.getElementById('lr-duration').value = '60';
  _certFile = null;
  document.getElementById('lr-cert-file').value = '';
  document.getElementById('lr-cert-note').value = '';
  document.getElementById('cert-file-name').style.display = 'none';
  const btn = document.getElementById('cert-upload-btn');
  if (btn) { btn.style.borderColor='#fbbf24'; btn.style.color='#a16207'; btn.textContent='📎 서류 업로드 (사진/PDF)'; }
  const pkgRows = document.getElementById('pkg-rows');
  if (pkgRows) { pkgRows.innerHTML = ''; _pkgRowIdx = 0; }
  document.getElementById('lesson-register-modal').classList.add('open');
}
function closeLessonRegisterModal() {
  document.getElementById('lesson-register-modal').classList.remove('open');
}
function selectLessonMainCat(el, cat) {
  _selectedMainCategory = cat; _selectedMidCategory = ''; _selectedLessonSubject = '';
  document.querySelectorAll('#lr-main-cat-row .booking-day-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  const mids = LESSON_MIDS[cat] || [];
  document.getElementById('lr-mid-cat-row').innerHTML =
    mids.map(m => `<button type="button" class="booking-day-btn" style="flex-shrink:0" onclick="selectLessonMidCat(this,'${m.v}')">${m.e} ${m.v}</button>`).join('');
  document.getElementById('lesson-subject-chips').innerHTML = '';
  document.getElementById('lr-subject-label').style.display = 'none';
  document.getElementById('lr-subject-custom').value = '';
  // 전문기술 선택 시 레이블/플레이스홀더 변경
  const isTech = cat === '전문기술';
  const detailLbl = document.getElementById('lr-detail-label');
  const priceLbl  = document.getElementById('lr-price-label');
  const detailInp = document.getElementById('lr-detail');
  if (detailLbl) detailLbl.innerHTML = isTech
    ? '서비스 소개 * <span style="font-size:11px;font-weight:500;color:#aaa">의뢰인에게 보이는 한 줄 설명</span>'
    : '강의 소개 * <span style="font-size:11px;font-weight:500;color:#aaa">수강생에게 보이는 한 줄 설명</span>';
  if (priceLbl)  priceLbl.textContent = isTech ? '건당 / 시간당 단가 (원) *' : '1회 기본 단가 (원) *';
  if (detailInp) detailInp.placeholder = isTech
    ? '예) 사진 촬영 10년 경력 · 제품/프로필/웨딩 가능'
    : '예) 골프 국가대표 출신 · 초보 전문 / 중국 10년 거주 원어민급';
}
function selectLessonMidCat(el, mid) {
  _selectedMidCategory = mid; _selectedLessonSubject = '';
  document.querySelectorAll('#lr-mid-cat-row .booking-day-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  const isEtc = mid === '기타' || mid === '기타(과외)';
  document.getElementById('lesson-subject-chips').innerHTML = '';
  if (isEtc) {
    document.getElementById('lr-subject-label').style.display = 'none';
    document.getElementById('lr-subject-custom').placeholder = '종목/과목 직접 입력';
  } else {
    document.getElementById('lr-subject-label').style.display = '';
    document.getElementById('lr-subject-custom').placeholder = '직접 입력 (예: 배드민턴, 드럼 등)';
    _renderRegisterSubChips(mid);
  }
}
function _renderRegisterSubChips(key) {
  const subs = LESSON_SUBS[key] || [];
  document.getElementById('lesson-subject-chips').innerHTML =
    subs.map(s => `<button type="button" class="booking-day-btn" style="flex-shrink:0;white-space:nowrap" onclick="selectLessonSubject(this,'${s.v}')">${s.e} ${s.v}</button>`).join('');
  _updateChipsArrows();
}
function _scrollChips(dir) {
  const el = document.getElementById('lesson-subject-chips');
  if (el) el.scrollBy({ left: dir * 160, behavior: 'smooth' });
}
function _updateChipsArrows() {
  const el = document.getElementById('lesson-subject-chips');
  const prev = document.getElementById('lr-chips-prev');
  const next = document.getElementById('lr-chips-next');
  if (!el || !prev || !next) return;
  const hasOverflow = el.scrollWidth > el.clientWidth + 4;
  prev.style.display = hasOverflow ? 'block' : 'none';
  next.style.display = hasOverflow ? 'block' : 'none';
}
function selectLessonSubject(el, val) {
  document.querySelectorAll('#lesson-subject-chips .booking-day-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  _selectedLessonSubject = val;
  document.getElementById('lr-subject-custom').value = '';
}
function selectLrLocType(el, val) {
  document.querySelectorAll('#lr-loctype-row .booking-day-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  _selectedLrLocType = val;
}
function toggleLrDay(el, day) {
  el.classList.toggle('active');
  if (_selectedLrDays.includes(day)) _selectedLrDays = _selectedLrDays.filter(d => d !== day);
  else _selectedLrDays.push(day);
}
function toggleLrTime(el, slot) {
  el.classList.toggle('active');
  if (_selectedLrTimes.includes(slot)) _selectedLrTimes = _selectedLrTimes.filter(s => s !== slot);
  else _selectedLrTimes.push(slot);
}
let _pkgRowIdx = 0;
const _PKG_SESSION_OPTS = [1,2,3,4,5,6,7,8,9,10,12,16,20];

function addPackageRow(sessions, price) {
  const idx = _pkgRowIdx++;
  const opts = _PKG_SESSION_OPTS.map(n =>
    `<option value="${n}" ${sessions === n ? 'selected' : ''}>${n}회</option>`
  ).join('') + `<option value="0" ${sessions === 0 ? 'selected' : ''}>월정액</option>`;
  const row = document.createElement('div');
  row.id = `pkg-row-${idx}`;
  row.style.cssText = 'display:grid;grid-template-columns:100px 1fr auto auto;align-items:center;gap:6px';
  row.innerHTML = `
    <select style="padding:9px 6px;border:1.5px solid #e0e0e0;border-radius:10px;font-size:13px;font-weight:700;color:#333;background:#fff;cursor:pointer;width:100%">
      ${opts}
    </select>
    <input type="number" inputmode="numeric" placeholder="총금액" value="${price||''}"
      style="padding:9px 10px;border:1.5px solid #e0e0e0;border-radius:10px;font-size:13px;outline:none;width:100%;box-sizing:border-box">
    <span style="font-size:11px;color:#aaa;white-space:nowrap">원</span>
    <button type="button" onclick="document.getElementById('pkg-row-${idx}').remove()"
      style="background:none;border:none;color:#ccc;font-size:20px;cursor:pointer;padding:0 2px;line-height:1">✕</button>`;
  document.getElementById('pkg-rows').appendChild(row);
}

function _collectPackages() {
  const pkgs = [];
  document.querySelectorAll('#pkg-rows > div').forEach(row => {
    const sel = row.querySelector('select');
    const inp = row.querySelector('input[type="number"]');
    if (!sel || !inp) return;
    const sessions = parseInt(sel.value);
    const price    = parseInt(inp.value);
    if (!price || price <= 0) return;
    const label = sessions === 0 ? '월정액' : `${sessions}회권`;
    pkgs.push({ label, sessions: sessions === 0 ? null : sessions, price });
  });
  return pkgs.length ? pkgs : null;
}
function _renderStars(rating) {
  if (!rating && rating !== 0) return '<span style="color:#ccc">★★★★★</span>';
  const full = Math.floor(rating);
  const half = rating - full >= 0.5 ? 1 : 0;
  const empty = 5 - full - half;
  return `<span style="color:#FBBF24">${'★'.repeat(full)}${'½'.repeat(half)}</span><span style="color:#e5e7eb">${'★'.repeat(empty)}</span>`;
}
async function openLessonConsult(profileId, workerName, workerKakaoUid) {
  if (!currentUser || isGuest) { showToast('로그인 후 상담 가능해요'); return; }
  if (workerKakaoUid === currentUser.id) { showToast('본인 프로필이에요'); return; }
  // lesson_inquiries 테이블에서 기존 상담 조회 또는 생성
  let { data: inq } = await db.from('lesson_inquiries')
    .select('id').eq('lesson_profile_id', profileId).eq('seeker_kakao_uid', currentUser.id).maybeSingle();
  if (!inq) {
    const { data: newInq, error } = await db.from('lesson_inquiries').insert({
      lesson_profile_id: profileId, seeker_kakao_uid: currentUser.id, worker_kakao_uid: workerKakaoUid
    }).select('id').single();
    if (error) { showToast('상담 연결 실패: ' + error.message); return; }
    inq = newInq;
  }
  document.getElementById('lesson-detail-modal')?.classList.remove('open');
  _openLessonChatOverlay(inq.id, workerName, workerKakaoUid);
}
function _openLessonChatOverlay(inquiryId, workerName, workerKakaoUid) {
  _chatAppId = null;
  _chatInquiryId = inquiryId;
  _chatWorkerName = workerName;
  _chatWorkerUserId = workerKakaoUid;
  document.getElementById('chat-title').textContent = t('chat_with_tutor').replace('{name}', workerName);
  document.getElementById('chat-sub').textContent = '레슨 관련 무료 상담';
  const _co1 = document.getElementById('chat-overlay');
  _co1.style.display = 'flex';
  document.getElementById('chat-input').value = '';
  loadChatMessages();
  subscribeChatMessages();
}

async function saveLessonProfile() {
  if (!currentUser || isGuest) { showToast('로그인이 필요해요'); return; }
  const subject  = document.getElementById('lr-subject-custom').value.trim() || _selectedLessonSubject;
  const detail   = document.getElementById('lr-detail').value.trim();
  const price    = parseInt(document.getElementById('lr-price').value);
  const duration = parseInt(document.getElementById('lr-duration').value) || 60;
  const location = document.getElementById('lr-location').value.trim();
  if (!subject)  { showToast('종목/과목을 선택하거나 입력해주세요'); return; }
  if (!detail)   { showToast('한 줄 소개를 입력해주세요'); return; }
  if (!price || price < 1000) { showToast('금액을 올바르게 입력해주세요'); return; }
  if (!_selectedLrLocType) { showToast('수업 형태를 선택해주세요'); return; }
  const wid = await _getWorkerId();
  if (!wid) { showToast('알바생 프로필을 먼저 완성해주세요'); return; }

  // 주소 → 좌표 변환
  let lat = mapCenter?.lat || null, lng = mapCenter?.lng || null;
  if (location) {
    await new Promise(resolve => {
      new kakao.maps.services.Geocoder().addressSearch(location, (r, s) => {
        if (s === kakao.maps.services.Status.OK && r[0]) { lat = parseFloat(r[0].y); lng = parseFloat(r[0].x); }
        else {
          new kakao.maps.services.Places().keywordSearch(location, (r2, s2) => {
            if (s2 === kakao.maps.services.Status.OK && r2[0]) { lat = parseFloat(r2[0].y); lng = parseFloat(r2[0].x); }
            resolve();
          });
          return;
        }
        resolve();
      });
    });
  }

  const certNote = document.getElementById('lr-cert-note')?.value.trim() || null;

  // 자격증 파일 업로드
  let certFileUrl = null, certStatus = 'none';
  if (_certFile) {
    const ext = _certFile.name.split('.').pop();
    const path = `${currentUser.id}/${Date.now()}.${ext}`;
    const { data: upData, error: upErr } = await db.storage.from('lesson-certs').upload(path, _certFile, { upsert: true });
    if (upErr) { showToast('파일 업로드 실패: ' + upErr.message); return; }
    const { data: urlData } = db.storage.from('lesson-certs').getPublicUrl(path);
    certFileUrl = urlData?.publicUrl || null;
    certStatus = 'pending';
  } else if (certNote) {
    certStatus = 'pending';
  }

  const { error } = await db.from('lesson_profiles').insert({
    worker_id: wid,
    main_category: _selectedMainCategory,
    mid_category: _selectedMidCategory || null,
    subject, subject_detail: detail,
    price_per_session: price, session_duration: duration,
    location_type: _selectedLrLocType,
    location_name: location || null,
    available_days: _selectedLrDays.length ? _selectedLrDays : null,
    available_times: _selectedLrTimes.length ? JSON.stringify(_selectedLrTimes) : null,
    packages: _collectPackages() ? JSON.stringify(_collectPackages()) : null,
    lat, lng,
    cert_note: certNote,
    cert_file_url: certFileUrl,
    cert_status: certStatus,
  });
  if (error) { showToast('등록 실패: ' + error.message); return; }
  closeLessonRegisterModal();
  const certMsg = certStatus === 'pending' ? '\n인증 서류는 검토 후 배지가 부여됩니다.' : '';
  showToast('등록 완료! 수강생 모집이 시작됐어요' + certMsg);
  loadLessons();
  loadMyLessons();
}

async function confirmBooking() {
  if (!currentUser || isGuest) { showToast('로그인이 필요해요'); return; }
  const date = document.getElementById('bk-date').value;
  const time = document.getElementById('bk-time').value;
  const note = document.getElementById('bk-note').value.trim();
  if (!date) { showToast('희망 날짜를 선택해주세요'); return; }
  if (!time) { showToast('희망 시간을 선택해주세요'); return; }
  const payment = document.querySelector('input[name="bk-payment"]:checked')?.value || 'offline';
  if (payment === 'toss' && !TOSS_ENABLED) { showToast('토스 결제는 준비 중이에요'); return; }
  const { error } = await db.from('lesson_bookings').insert({
    profile_id: _currentLessonProfileId,
    student_kakao_uid: currentUser.id,
    session_date: date, session_time: time,
    note: note || null, payment_method: payment, status: 'pending',
  });
  if (error) { showToast('예약 실패: ' + error.message); return; }
  closeLessonDetailModal();
  showToast('예약 신청 완료! 제공자가 확인 후 연락드려요');
}

// ── 내 레슨/과외 관리 ─────────────────────────
function openLessonManagePanel() {
  document.getElementById('panel-profile').classList.remove('show');
  setTimeout(() => {
    document.getElementById('panel-lesson-manage').classList.add('show');
    history.pushState({ panel: 'lesson-manage' }, '');
    switchLessonManageTab('profile');
    loadMyLessons();
    // 문의 뱃지 비동기 갱신
    if (currentUser) {
      db.from('lesson_profiles').select('id').eq('worker_id', currentUser.id).then(({ data: profs }) => {
        if (!profs?.length) return;
        db.from('lesson_inquiries').select('id', { count: 'exact' })
          .in('lesson_profile_id', profs.map(p => p.id)).eq('status', 'pending').then(({ count }) => {
            const badge = document.getElementById('lm-inq-badge');
            if (badge) { badge.textContent = count || 0; badge.style.display = count > 0 ? 'inline-block' : 'none'; }
          });
      });
    }
  }, 50);
}
function closeLessonManagePanel() {
  document.getElementById('panel-lesson-manage').classList.remove('show');
  document.getElementById('panel-profile').classList.add('show');
}
async function loadMyLessons() {
  if (!currentUser || isGuest) return;
  const el = document.getElementById('my-lesson-list');
  const wid = await _getWorkerId();
  if (!wid) { el.innerHTML = '<div class="empty"><div class="empty-txt">' + t('lesson_my_noworker') + '</div></div>'; return; }
  const { data } = await db.from('lesson_profiles').select('*').eq('worker_id', wid).order('created_at', { ascending: false });
  if (!data?.length) {
    el.innerHTML = '<div class="empty"><div class="empty-icon" style="font-size:36px">\u{1F9D1}‍\u{1F3EB}</div><div class="empty-txt">' + t('lesson_my_empty') + '<br><span style="font-size:12px;color:#bbb">+ 등록</span></div></div>';
    return;
  }
  const locTypeMap = {방문레슨:'🚗 방문레슨', 센터방문:'🏫 센터방문', 비대면:'💻 비대면'};
  el.innerHTML = data.map(p => `
    <div class="lesson-card" style="border-left:3px solid ${p.is_active ? '#3b82f6' : '#ddd'}">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
          <span style="font-size:10px;font-weight:800;background:${p.main_category==='과외'?'#f5f3ff':'#e0f7fa'};color:${p.main_category==='과외'?'#7c3aed':'#0891b2'};padding:2px 7px;border-radius:6px">${p.main_category||'레슨'}</span>
          <span class="lesson-subject-tag">${p.subject}</span>
          ${p.cert_status==='verified'?'<span style="font-size:10px;background:#fef3c7;color:#d97706;padding:2px 6px;border-radius:6px">✓인증</span>':''}
        </div>
        <span style="font-size:11px;font-weight:700;color:${p.is_active ? '#16a34a' : '#aaa'}">${p.is_active ? '● 활성' : '● 비활성'}</span>
      </div>
      <div class="lesson-name">${p.main_category||'레슨'} · ${p.subject}</div>
      ${p.subject_detail ? `<div style="font-size:12px;color:#777;margin-top:2px;margin-bottom:4px">${p.subject_detail}</div>` : ''}
      <div class="lesson-price" style="margin-top:4px">${Number(p.price_per_session).toLocaleString()}원/회 · ${p.session_duration}분 · ${locTypeMap[p.location_type]||''}</div>
      <!-- 지도 표시 + 온에어 -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:10px">
        <div style="padding:8px 10px;background:#f8fafc;border-radius:10px">
          <div style="font-size:10px;color:#aaa;font-weight:700;margin-bottom:4px">지도 표시</div>
          <div style="font-size:11px;font-weight:800;color:${p.is_active?'#16a34a':'#aaa'}">${p.is_active?'● 수강생에게 노출 중':'● 숨김 상태'}</div>
        </div>
        <div style="padding:8px 10px;background:${p.is_available_now?'#f0fdf4':'#f8fafc'};border-radius:10px;display:flex;align-items:center;justify-content:space-between">
          <div>
            <div style="font-size:10px;color:#aaa;font-weight:700;margin-bottom:4px">지금 가능</div>
            <div style="font-size:11px;font-weight:800;color:${p.is_available_now?'#16a34a':'#aaa'}">${p.is_available_now?'🟢 ON AIR':'⚫ 오프라인'}</div>
          </div>
          <label style="position:relative;display:inline-block;width:38px;height:20px;cursor:pointer;flex-shrink:0">
            <input type="checkbox" ${p.is_available_now?'checked':''} onchange="toggleLessonOnAir('${p.id}',this.checked)"
              style="opacity:0;width:0;height:0;position:absolute">
            <span style="position:absolute;inset:0;background:${p.is_available_now?'#16a34a':'#cbd5e1'};border-radius:20px;transition:.2s">
              <span style="position:absolute;width:16px;height:16px;background:#fff;border-radius:50%;top:2px;left:${p.is_available_now?'20':'2'}px;transition:.2s"></span>
            </span>
          </label>
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button onclick="toggleLessonActive('${p.id}',${!p.is_active})" style="flex:1;padding:8px;border-radius:10px;border:1.5px solid ${p.is_active?'#e2e8f0':'#3b82f6'};background:${p.is_active?'#fff':'#eff6ff'};font-size:12px;font-weight:700;color:${p.is_active?'#888':'#3b82f6'};cursor:pointer">${p.is_active ? '지도에서 숨기기' : '지도에 표시하기'}</button>
        <button onclick="deleteLessonProfile('${p.id}')" style="padding:8px 14px;border-radius:10px;border:none;background:#fff0f0;color:#C8102E;font-size:12px;font-weight:700;cursor:pointer">삭제</button>
      </div>
    </div>`).join('');
}
async function toggleLessonActive(id, val) {
  await db.from('lesson_profiles').update({ is_active: val }).eq('id', id);
  loadMyLessons();
}
async function toggleLessonOnAir(id, val) {
  await db.from('lesson_profiles').update({ is_available_now: val }).eq('id', id);
  showToast(val ? '🟢 온에어! 수강생에게 노출됩니다' : '오프라인으로 전환됐어요');
  loadMyLessons();
  if (document.getElementById('panel-lesson')?.classList.contains('show')) loadLessons();
}
function deleteLessonProfile(id) {
  showConfirm('', async () => {
    await db.from('lesson_profiles').delete().eq('id', id);
    showToast('삭제됐어요'); loadMyLessons();
  }, {icon:'🗑️', title:'레슨 프로필 삭제', okLabel:'삭제', danger:true});
}

// ── 단골 알바생 (Supabase 연동) ───────────────
async function syncFavWorkerToSupabase(workerId, add) {
  if (!currentUser || isGuest) return;
  if (add) {
    await db.from('favorite_workers').upsert({ owner_kakao_uid: currentUser.id, worker_id: workerId }, { onConflict: 'owner_kakao_uid,worker_id' });
  } else {
    await db.from('favorite_workers').delete().eq('owner_kakao_uid', currentUser.id).eq('worker_id', workerId);
  }
}
async function loadFavWorkersFromSupabase() {
  if (!currentUser || isGuest) return;
  const { data } = await db.from('favorite_workers').select('worker_id').eq('owner_kakao_uid', currentUser.id);
  if (data?.length) {
    data.forEach(r => _favWorkers.add(r.worker_id));
    localStorage.setItem('baro_fav_' + (bizRecord?.id||'guest'), JSON.stringify([..._favWorkers]));
  }
}

// ══════════════════════════════════════════════
function formatRelativeDate(dateStr) {
  if (!dateStr) return '';
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 86400000);
  if (diff === 0) return '오늘';
  if (diff === 1) return '어제';
  if (diff < 7) return `${diff}일 전`;
  if (diff < 30) return `${Math.floor(diff / 7)}주 전`;
  if (diff < 365) return `${Math.floor(diff / 30)}개월 전`;
  return `${Math.floor(diff / 365)}년 전`;
}

// 하위 호환용 래퍼 (기존 buildStatusHtml 호출부는 모두 makeApplicantCardHtml로 대체됨)
function buildStatusHtml(a, stopProp) { return ''; }

async function loadApplicantCount(jobId) {
  const { data } = await db.from('applications')
    .select('id')
    .eq('job_posting_id', jobId);
  const el = document.getElementById(`app-count-${jobId}`);
  if (el) el.textContent = (data?.length) ?? 0;
}

async function updateStats() {
  const open = postings.filter(p => p.status === 'open' || p.status === 'urgent').length;
  document.getElementById('stat-open').textContent = open;

  const { count: total } = await db.from('applications')
    .select('id', { count: 'exact', head: true })
    .in('job_posting_id', postings.map(p => p.id));
  document.getElementById('stat-applicants').textContent = total || 0;

  const { count: accepted } = await db.from('applications')
    .select('id', { count: 'exact', head: true })
    .in('job_posting_id', postings.map(p => p.id))
    .eq('status', 'accepted');
  document.getElementById('stat-accepted').textContent = accepted || 0;
}

function checkMinWage(val) {
  const type = document.getElementById('f-wage-type')?.value || 'hourly';
  const w = document.getElementById('wage-warn');
  if (w) w.style.display = (type === 'hourly' && val && parseInt(val) < 10030) ? 'block' : 'none';
}

function setWageType(type) {
  document.getElementById('f-wage-type').value = type;
  const labels = { hourly:'시급', daily:'일급', 'per-job':'건당', monthly:'월급', other:'기타' };
  const placeholders = { hourly:'10030', daily:'80000', 'per-job':'50000', monthly:'2500000', other:'' };
  // 버튼 스타일 갱신
  ['hourly','daily','per-job','monthly','other'].forEach(t => {
    const btn = document.getElementById('wt-' + t);
    if (!btn) return;
    const on = t === type;
    btn.style.background = on ? '#C8102E' : '#fff';
    btn.style.color = on ? '#fff' : '#888';
    btn.style.borderColor = on ? '#C8102E' : '#eee';
  });
  // 라벨·입력 갱신
  const lbl = document.getElementById('f-wage-label');
  const inp = document.getElementById('f-wage');
  const otherInp = document.getElementById('f-wage-other');
  if (type === 'other') {
    if (lbl) lbl.style.display = 'none';
    if (inp) inp.style.display = 'none';
    if (otherInp) otherInp.style.display = 'block';
    document.getElementById('wage-warn').style.display = 'none';
  } else {
    if (lbl) { lbl.style.display = ''; lbl.textContent = labels[type] + ' (원) *'; }
    if (inp) { inp.style.display = ''; inp.placeholder = placeholders[type] || '0'; inp.min = type === 'hourly' ? 10030 : 0; }
    if (otherInp) otherInp.style.display = 'none';
    checkMinWage(inp?.value);
  }
}

// ── 시급 서지 (급구 상태에서만 사용) ──────────────────────
async function surgeWage(jobId, currentWage) {
  const newWage = currentWage + 1000;
  const { error } = await db.from('job_postings')
    .update({ current_wage: newWage })
    .eq('id', jobId);
  if (error) { showToast('시급 인상 실패: ' + error.message); return; }
  showToast(`⚡ 시급 ${newWage.toLocaleString()}원으로 인상!`);
  loadPostings();
}

// ── 급구 상태 설정/해제 ───────────────────────────────────
async function setPostingUrgent(jobId, makeUrgent) {
  const newStatus = makeUrgent ? 'urgent' : 'open';
  const { error } = await db.from('job_postings').update({ status: newStatus }).eq('id', jobId);
  if (error) { showToast('상태 변경 실패: ' + error.message); return; }
  showToast(makeUrgent ? '🔥 급구 설정됐습니다 — 홈 급구 섹션에 노출돼요' : '일반 모집으로 전환됐습니다');
  loadPostings();
  closePostingDetail();
}

// ── 시급 서지 자동 스케줄 ───────────────────────────────────
const SURGE_SCHED_KEY = 'baro_surge_schedules';

function getSurgeSchedules() {
  try { return JSON.parse(localStorage.getItem(SURGE_SCHED_KEY) || '{}'); } catch(e) { return {}; }
}
function getSurgeSchedule(jobId) {
  return getSurgeSchedules()[jobId] || null;
}
function saveSurgeSchedule(jobId, triggerAt, amount) {
  const s = getSurgeSchedules();
  s[jobId] = { triggerAt, amount };
  localStorage.setItem(SURGE_SCHED_KEY, JSON.stringify(s));
}
function cancelSurgeSchedule(jobId) {
  const s = getSurgeSchedules();
  delete s[jobId];
  localStorage.setItem(SURGE_SCHED_KEY, JSON.stringify(s));
}

function openSurgeScheduler(jobId, currentWage) {
  const existing = getSurgeSchedule(jobId);
  if (existing) {
    const rem = Math.max(0, Math.round((existing.triggerAt - Date.now()) / 60000));
    showConfirm(`${rem}분 후 +${existing.amount.toLocaleString()}원 자동 인상 예약이 취소됩니다.`, () => {
      cancelSurgeSchedule(jobId);
      showToast('자동 서지 예약이 취소됐습니다');
      loadPostings();
    }, {icon:'⏰', title:'서지 예약 취소', okLabel:'예약 취소', okBg:'#EA580C'});
    return;
  }
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:3000;display:flex;align-items:flex-end';
  overlay.innerHTML = `
    <div style="background:#fff;border-radius:24px 24px 0 0;padding:24px 24px 40px;width:100%" onclick="event.stopPropagation()">
      <div style="font-size:17px;font-weight:900;color:#222;margin-bottom:4px">⏰ 자동 시급 서지 예약</div>
      <div style="font-size:12px;color:#aaa;margin-bottom:20px">현재 시급 ${currentWage.toLocaleString()}원 → N시간 후 자동으로 +1,000원</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px">
        ${[2,4,8,12,24].map(h => `<button onclick="scheduleSurge('${jobId}',${currentWage},${h},this.closest('[style*=fixed]'))"
          style="padding:14px;background:#FFF7ED;color:#D97706;border:none;border-radius:12px;font-size:14px;font-weight:800;cursor:pointer">${h}시간 후</button>`).join('')}
      </div>
      <button onclick="this.closest('[style*=fixed]').remove()" style="width:100%;padding:12px;background:#f5f5f5;color:#888;border:none;border-radius:12px;font-size:14px;font-weight:700;cursor:pointer">취소</button>
    </div>`;
  overlay.addEventListener('click', () => overlay.remove());
  document.body.appendChild(overlay);
}

function scheduleSurge(jobId, currentWage, hours, overlayEl) {
  const triggerAt = Date.now() + hours * 3600000;
  saveSurgeSchedule(jobId, triggerAt, 1000);
  overlayEl.remove();
  showToast(`⏰ ${hours}시간 후 시급이 자동으로 +1,000원 인상됩니다`);
  loadPostings();
}

async function checkSurgeSchedules() {
  const schedules = getSurgeSchedules();
  const now = Date.now();
  for (const [jobId, sched] of Object.entries(schedules)) {
    if (sched.triggerAt <= now) {
      const { data: p } = await db.from('job_postings').select('current_wage,status').eq('id', jobId).single();
      if (p && p.status === 'urgent') {
        const newWage = (p.current_wage || 0) + sched.amount;
        await db.from('job_postings').update({ current_wage: newWage }).eq('id', jobId);
        showToast(`⚡ 예약된 시급 서지 실행! ${newWage.toLocaleString()}원`);
      }
      cancelSurgeSchedule(jobId);
    }
  }
}

// ── 번개알바 자동 인상 (surge_interval_min 기반, 60초마다 호출) ──
async function checkSurgeIntervals() {
  if (!bizRecord) return;
  const { data: surgePostings } = await db.from('job_postings')
    .select('id, current_wage, base_wage, surge_max_wage, surge_amount, surge_interval_min, updated_at')
    .eq('surge_enabled', true)
    .eq('business_id', bizRecord.id)
    .eq('status', 'urgent');
  if (!surgePostings?.length) return;
  const now = Date.now();
  let anyUpdated = false;
  for (const p of surgePostings) {
    const intervalMs = (p.surge_interval_min || 30) * 60 * 1000;
    const lastUpdate = new Date(p.updated_at).getTime();
    const elapsed = now - lastUpdate;
    if (elapsed < intervalMs) continue;
    const cyclesPassed = Math.floor(elapsed / intervalMs);
    const maxWage = p.surge_max_wage || 9999999;
    const currentWage = p.current_wage || p.base_wage || 0;
    const newWage = Math.min(currentWage + (p.surge_amount || 1000) * cyclesPassed, maxWage);
    if (newWage <= currentWage) continue;
    await db.from('job_postings')
      .update({ current_wage: newWage, updated_at: new Date().toISOString() })
      .eq('id', p.id);
    anyUpdated = true;
    showToast(`⚡ 시급 자동 인상 → ${newWage.toLocaleString()}원 (+${(newWage - currentWage).toLocaleString()}원)`);
  }
  if (anyUpdated) loadPostings();
}

// ── 상태 토글 ─────────────────────────────────────────────
async function toggleStatus(jobId, currentStatus) {
  const isOpen = currentStatus === 'open' || currentStatus === 'urgent';
  const newStatus = isOpen ? 'closed' : 'open';
  const { error } = await db.from('job_postings').update({ status: newStatus }).eq('id', jobId);
  if (error) { showToast('상태 변경 실패'); return; }
  showToast(isOpen ? '공고가 마감됐습니다' : '공고가 재오픈됐습니다');
  loadPostings();
}

// ── 근무완료 평점 모달 ─────────────────────────────────────
function showRatingModal(appId, workerId) {
  let selectedRating = 0;
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:3000;display:flex;align-items:flex-end;justify-content:center';

  window._subRatings = { sincerity: 0, skill: 0, communication: 0 };

  overlay.innerHTML = `
    <div id="rating-modal-inner" style="background:#fff;border-radius:24px 24px 0 0;padding:28px 24px 40px;width:100%;max-width:480px;max-height:90vh;overflow-y:auto;box-sizing:border-box" onclick="event.stopPropagation()">
      <div style="font-size:18px;font-weight:900;color:#222;margin-bottom:4px">\u{1F3C1} 근무 완료 처리</div>
      <div style="font-size:13px;color:#aaa;margin-bottom:20px">세부 항목별 평점을 남겨주세요</div>

      ${[
        { key:'sincerity',     label:'성실도', emoji:'\u{1F4AA}', desc:'시간 준수, 책임감' },
        { key:'skill',         label:'실력',   emoji:'⭐', desc:'업무 숙련도, 퀄리티' },
        { key:'communication', label:'소통',   emoji:'\u{1F4AC}', desc:'지시 이해, 의사소통' }
      ].map(({ key, label, emoji, desc }) => `
        <div style="margin-bottom:16px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
            <span style="font-size:13px;font-weight:800;color:#333">${emoji} ${label}</span>
            <span style="font-size:11px;color:#aaa">${desc}</span>
          </div>
          <div style="display:flex;gap:6px" id="sub-stars-${key}">
            ${[1,2,3,4,5].map(i => `<span onclick="selectSubRating('${key}',${i})" style="font-size:28px;cursor:pointer;transition:transform 0.1s">☆</span>`).join('')}
          </div>
        </div>`).join('')}

      <div id="sub-avg-label" style="text-align:center;font-size:14px;font-weight:800;color:#aaa;margin:12px 0 16px">항목별 평점의 평균이 최종 점수입니다</div>

      <textarea id="review-text" placeholder="종합 후기를 남겨주세요 (선택)" maxlength="200"
        style="width:100%;padding:12px;border:1.5px solid #eee;border-radius:12px;font-size:14px;resize:none;height:80px;box-sizing:border-box;font-family:inherit;outline:none"></textarea>

      <div style="display:flex;gap:8px;margin-top:16px">
        <button onclick="this.closest('[style*=fixed]').remove()" style="flex:1;padding:14px;background:#f5f5f5;color:#555;border:none;border-radius:12px;font-size:14px;font-weight:700;cursor:pointer">취소</button>
        <button id="submit-rating-btn" onclick="submitRating('${appId}','${workerId}')"
          style="flex:2;padding:14px;background:#3B82F6;color:#fff;border:none;border-radius:12px;font-size:14px;font-weight:800;cursor:pointer">완료 처리</button>
      </div>
    </div>`;

  overlay.addEventListener('click', () => overlay.remove());
  document.body.appendChild(overlay);
}

function selectSubRating(key, n) {
  window._subRatings[key] = n;
  document.querySelectorAll(`#sub-stars-${key} span`).forEach((el, i) => {
    el.textContent = i < n ? '⭐' : '☆';
    el.style.transform = i < n ? 'scale(1.1)' : 'scale(1)';
  });
  const vals = Object.values(window._subRatings).filter(v => v > 0);
  const avg = vals.length ? (vals.reduce((a,b)=>a+b,0) / vals.length).toFixed(1) : null;
  const lbl = document.getElementById('sub-avg-label');
  if (lbl && avg) { lbl.textContent = `최종 평점: ⭐ ${avg}`; lbl.style.color = '#F59E0B'; }
}

async function submitRating(appId, workerId) {
  const sub = window._subRatings || {};
  const vals = Object.values(sub).filter(v => v > 0);
  if (vals.length < 3) { showToast('3개 항목 모두 평점을 선택해주세요'); return; }
  const rating = Math.round(vals.reduce((a,b)=>a+b,0) / vals.length * 10) / 10;
  const review = document.getElementById('review-text')?.value.trim() || '';

  const btn = document.getElementById('submit-rating-btn');
  if (btn) { btn.disabled = true; btn.textContent = '처리 중...'; }

  // 1. 지원서 완료 처리
  const { error: appErr } = await db.from('applications').update({
    status: 'completed',
    worker_rating: rating,
    worker_review: review || null,
    completed_at: new Date().toISOString()
  }).eq('id', appId);
  if (appErr) {
    if (btn) { btn.disabled = false; btn.textContent = '완료 처리'; }
    showToast('처리 실패: ' + appErr.message);
    return;
  }

  // 2. 워커 평점/완료횟수 업데이트
  if (workerId) {
    const { data: w } = await db.from('workers').select('rating, review_count, kakao_uid').eq('id', workerId).single();
    const oldCount  = w?.review_count || 0;
    const newCount  = oldCount + 1;
    const newRating = ((w?.rating || 0) * oldCount + rating) / newCount;
    await db.from('workers').update({ rating: Math.round(newRating * 10) / 10, review_count: newCount }).eq('id', workerId);

    // 3. 알바생에게 리뷰 요청 Push
    if (w?.kakao_uid) {
      fetch('/api/send-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: w.kakao_uid,
          title: '\u{1F3C1} 근무 완료! 업주 평점을 남겨주세요',
          body: `${bizRecord?.name || '업주'}와의 근무가 완료됐습니다. 업주 평점을 남겨보세요!`,
          url: '/바로알바.html'
        })
      }).catch(() => {});
    }
  }

  document.querySelector('[style*="fixed"][style*="3000"]')?.remove();
  window._subRatings = {};
  showToast('\u{1F3C1} 근무 완료 처리됐습니다');
  loadApplicants(); loadPostings();
  if (window._pdJobId) loadPostingDetailApplicants(window._pdJobId);
}

function markNoshow(appId, workerId) {
  showConfirm('해당 알바생의 번개등급이 박탈됩니다.\n신중하게 처리해주세요.', async () => {
  const { error } = await db.from('applications').update({
    status: 'noshow', noshow: true
  }).eq('id', appId);
  if (error) { showToast('처리 실패: ' + error.message); return; }

  // 워커 노쇼 카운트 증가
    if (workerId) {
      const { data: w } = await db.from('workers').select('noshow_count').eq('id', workerId).single();
      await db.from('workers').update({ noshow_count: (w?.noshow_count || 0) + 1 }).eq('id', workerId);
    }
    showToast('\u{1F613} 노쇼 처리됐습니다');
    loadApplicants(); loadPostings();
    if (window._pdJobId) loadPostingDetailApplicants(window._pdJobId);
  }, {icon:'⚠️', title:'노쇼 처리', okLabel:'처리', danger:true});
}

// ── 지원자 필터 (대시보드 클릭) ──────────────────────────
let _allApplicants = [];
let _compareSet = new Set();
let _favWorkers = new Set();
let _recommendedWorkers = new Set();
let _blockedWorkers = new Set();

function loadFavWorkers() {
  if (!bizRecord) return;
  try { _favWorkers = new Set(JSON.parse(localStorage.getItem('baro_fav_' + bizRecord.id) || '[]')); } catch(e) {}
  try { _recommendedWorkers = new Set(JSON.parse(localStorage.getItem('baro_rec_' + bizRecord.id) || '[]')); } catch(e) {}
  try { _blockedWorkers = new Set(JSON.parse(localStorage.getItem('baro_blk_' + bizRecord.id) || '[]')); } catch(e) {}
  updateWorkerShortcutCounts();
}
function toggleFavWorker(workerId) {
  const adding = !_favWorkers.has(workerId);
  if (adding) _favWorkers.add(workerId); else _favWorkers.delete(workerId);
  localStorage.setItem('baro_fav_' + (bizRecord?.id||'guest'), JSON.stringify([..._favWorkers]));
  syncFavWorkerToSupabase(workerId, adding);
  renderApplicants(_allApplicants);
  showToast(adding ? '♥ 단골 등록됐어요' : '단골 해제됐어요');
}

function toggleRecommendWorker(workerId) {
  if (_recommendedWorkers.has(workerId)) _recommendedWorkers.delete(workerId);
  else _recommendedWorkers.add(workerId);
  localStorage.setItem('baro_rec_' + bizRecord.id, JSON.stringify([..._recommendedWorkers]));
  updateWorkerShortcutCounts();
  renderApplicants(_allApplicants);
}

function toggleBlockWorker(workerId, name) {
  if (_blockedWorkers.has(workerId)) {
    _blockedWorkers.delete(workerId);
    showToast('차단이 해제됐습니다');
  } else {
    showConfirm('내 공고 검색 결과에서 제외됩니다.', () => {
      _blockedWorkers.add(workerId);
      showToast('🚫 차단됐습니다');
      localStorage.setItem('baro_blk_' + bizRecord.id, JSON.stringify([..._blockedWorkers]));
      updateWorkerShortcutCounts();
      renderApplicants(_allApplicants);
    }, {icon:'🚫', title:`${name}님 차단`, okLabel:'차단', danger:true});
    return;
  }
  localStorage.setItem('baro_blk_' + bizRecord.id, JSON.stringify([..._blockedWorkers]));
  updateWorkerShortcutCounts();
  renderApplicants(_allApplicants);
}

function updateWorkerShortcutCounts() {
  const rec = document.getElementById('rec-count');
  const blk = document.getElementById('blk-count');
  if (rec) rec.textContent = _recommendedWorkers.size + '명';
  if (blk) blk.textContent = _blockedWorkers.size + '명';
}

function filterFavApplicants() {
  const filtered = _allApplicants.filter(a => _favWorkers.has(a.workers?.id));
  document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
  document.getElementById('fchip-fav')?.classList.add('active');
  renderApplicants(filtered);
  showToast(`즐겨찾기 ${filtered.length}명`);
}

function showRecommendedWorkers() {
  ownerSwitchTab('applicants', document.querySelectorAll('.tab-btn')[1]);
  const filtered = _allApplicants.filter(a => _recommendedWorkers.has(a.workers?.id));
  document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
  if (!filtered.length) { showToast('추천한 알바생이 없어요'); return; }
  renderApplicants(filtered);
  showToast(`추천 알바생 ${filtered.length}명`);
}

function showBlockedWorkers() {
  ownerSwitchTab('applicants', document.querySelectorAll('.tab-btn')[1]);
  const filtered = _allApplicants.filter(a => _blockedWorkers.has(a.workers?.id));
  document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
  document.getElementById('fchip-blocked')?.classList.add('active');
  if (!filtered.length) { showToast('차단한 지원자가 없어요'); renderApplicants([]); return; }
  renderApplicants(filtered);
  showToast(`차단한 지원자 ${filtered.length}명`);
}

async function quickTogglePosting(jobId, currentStatus) {
  const newStatus = (currentStatus === 'open' || currentStatus === 'urgent') ? 'closed' : 'open';
  const { error } = await db.from('job_postings').update({ status: newStatus }).eq('id', jobId);
  if (error) { showToast('상태 변경 실패'); return; }
  showToast(newStatus === 'open' ? '✅ 공고 모집 재개' : '⏹ 공고 마감');
  loadPostings();
}

function relistPosting(jobId) {
  const p = postings.find(x => x.id === jobId);
  if (!p) return;
  showConfirm('기존 지원자 데이터가 초기화되고\n새로 모집을 시작합니다.', async () => {
    // 기존 지원자를 cancelled로 전환 (재공고 시 새 라운드) - hard delete는 RLS상
    // 업주 권한으로 조용히 0건 처리될 수 있어, 재지원이 이미 가능한 cancelled 상태로 통일
    await db.from('applications').update({ status: 'cancelled' }).eq('job_posting_id', jobId);
    // 공고 초기화: 상태·임금 복원, 충원수 리셋, 마감일 제거
    const { error } = await db.from('job_postings').update({
      status: 'open',
      current_wage: p.base_wage,
      filled_count: 0,
      work_end_date: null
    }).eq('id', jobId);
    if (error) { showToast('재등록 실패: ' + error.message); return; }
    showToast('✅ 공고가 재등록됐습니다');
    closePostingDetail(); loadPostings();
  }, {icon:'🔄', title:`"${p.title}" 재등록`, okLabel:'재등록'});
}
function toggleCompare(appId) {
  if (_compareSet.has(appId)) { _compareSet.delete(appId); }
  else if (_compareSet.size < 2) { _compareSet.add(appId); }
  else { showToast('최대 2명까지 선택 가능합니다'); return; }
  renderApplicants(_allApplicants);
  const btn = document.getElementById('compare-fab');
  if (btn) btn.style.display = _compareSet.size === 2 ? 'flex' : 'none';
}
function openCompareModal() {
  const ids = [..._compareSet];
  const apps = ids.map(id => _allApplicants.find(a => a.id === id)).filter(Boolean);
  if (apps.length < 2) { showToast('2명을 선택해주세요'); return; }
  const col = (a) => {
    const w = a.workers || {};
    const isFav = _favWorkers.has(w.id);
    return `<div style="flex:1;min-width:0;padding:0 8px">
      <div style="text-align:center;margin-bottom:12px">
        <div style="width:56px;height:56px;border-radius:50%;background:#f0f0f0;margin:0 auto 8px;display:flex;align-items:center;justify-content:center;font-size:24px">\u{1F464}</div>
        <div style="font-size:15px;font-weight:900;color:#222">${w.name||'이름없음'}</div>
        <div style="font-size:11px;color:#aaa;margin-top:2px">${a.job_postings?.title||''}</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;font-size:12px">
        <div style="background:#f8f8f8;border-radius:10px;padding:10px">
          <div style="color:#aaa;font-weight:700;margin-bottom:2px">평점</div>
          <div style="font-weight:900;color:#F59E0B;font-size:15px">★ ${w.rating?.toFixed(1)||'-'}</div>
        </div>
        <div style="background:#f8f8f8;border-radius:10px;padding:10px">
          <div style="color:#aaa;font-weight:700;margin-bottom:2px">완료 알바</div>
          <div style="font-weight:900;color:#333;font-size:15px">${w.review_count||0}회</div>
        </div>
        <div style="background:#f8f8f8;border-radius:10px;padding:10px">
          <div style="color:#aaa;font-weight:700;margin-bottom:2px">노쇼</div>
          <div style="font-weight:900;color:${w.noshow_count>0?'#EF4444':'#16a34a'};font-size:15px">${w.noshow_count||0}회</div>
        </div>
        <div style="background:#f8f8f8;border-radius:10px;padding:10px">
          <div style="color:#aaa;font-weight:700;margin-bottom:4px">스킬</div>
          <div style="display:flex;flex-wrap:wrap;gap:4px">${(w.skills||[]).map(s=>`<span style="background:#EFF6FF;color:#3B82F6;border-radius:6px;padding:2px 6px;font-size:10px;font-weight:700">${s}</span>`).join('')||'<span style="color:#aaa">없음</span>'}</div>
        </div>
        <div style="background:#f8f8f8;border-radius:10px;padding:10px">
          <div style="color:#aaa;font-weight:700;margin-bottom:2px">연락처</div>
          <div style="font-weight:700;color:#333">${w.phone||'-'}</div>
        </div>
      </div>
      <div style="display:flex;gap:6px;margin-top:12px">
        <button onclick="openChat('${a.id}','${w.name||'지원자'}')" style="flex:1;padding:8px;background:#EFF6FF;color:#3B82F6;border:none;border-radius:10px;font-size:12px;font-weight:700;cursor:pointer">\u{1F4AC} 채팅</button>
        <button onclick="toggleFavWorker('${w.id}')" style="padding:8px 12px;background:${isFav?'#FEF3C7':'#f0f0f0'};color:${isFav?'#D97706':'#888'};border:none;border-radius:10px;font-size:14px;cursor:pointer">${isFav?'♥':'♡'}</button>
      </div>
    </div>`;
  };
  const ov = document.createElement('div');
  ov.style.cssText='position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:4000;display:flex;align-items:flex-end';
  ov.onclick=e=>{if(e.target===ov)ov.remove();};
  ov.innerHTML=`<div style="background:#fff;border-radius:24px 24px 0 0;width:100%;padding:20px 16px 36px;max-height:85vh;overflow-y:auto" onclick="event.stopPropagation()">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
      <div style="font-size:17px;font-weight:900">\u{1F50D} 지원자 비교</div>
      <button onclick="this.closest('div[style*=fixed]').remove()" style="font-size:20px;background:none;border:none;color:#aaa;cursor:pointer">✕</button>
    </div>
    <div style="display:flex;gap:0;border-top:1px solid #f0f0f0;padding-top:16px">${apps.map(col).join('<div style="width:1px;background:#f0f0f0;margin:0 4px"></div>')}</div>
  </div>`;
  document.body.appendChild(ov);
}
function filterApplicants(status) {
  if (!_allApplicants.length) return;
  const filtered = status === 'all' ? _allApplicants : _allApplicants.filter(a => a.status === status);
  renderApplicants(filtered);
  // 필터 칩 active 상태 갱신
  document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
  const chipMap = { all:'fchip-all', pending:'fchip-pending', reviewing:'fchip-reviewing', accepted:'fchip-accepted', rejected:'fchip-rejected', completed:'fchip-completed' };
  if (chipMap[status]) document.getElementById(chipMap[status])?.classList.add('active');
  const labels = { all:'전체 지원자', accepted:'연락중', pending:'검토 전', reviewing:'검토중', rejected:'탈락', cancelled:'지원취소', completed:'근무완료' };
  showToast(`${labels[status] || status} ${filtered.length}명`);
}

// ── 지원자 불러오기 ──────────────────────────────────────
async function loadApplicants() {
  if (!bizRecord) return;

  // postings가 아직 로드 안됐을 수 있으므로 DB에서 직접 job ID 조회
  let jobIds = postings.map(p => p.id);
  if (!jobIds.length) {
    const { data: jobs } = await db.from('job_postings').select('id').eq('business_id', bizRecord.id);
    jobIds = (jobs || []).map(j => j.id);
  }

  if (!jobIds.length) {
    document.getElementById('applicants-list').innerHTML =
      '<div class="empty"><div class="empty-icon">\u{1F465}</div><div class="empty-txt">지원자가 없어요</div></div>';
    return;
  }

  const { data, error } = await db.from('applications')
    .select('*, apply_message, workers(id, name, phone, rating, review_count, noshow_count, skills), job_postings(title)')
    .in('job_posting_id', jobIds)
    .order('applied_at', { ascending: false });

  if (error) { showToast('지원자 불러오기 실패'); return; }
  const apps = (data || []).sort((a, b) => (b.is_quick ? 1 : 0) - (a.is_quick ? 1 : 0));
  // 마지막 근무일 배치 조회
  const wIds = apps.map(a => a.workers?.id).filter(Boolean);
  let lastWorkedMap = {};
  if (wIds.length) {
    const { data: lw } = await db.from('applications')
      .select('worker_id, completed_at')
      .in('worker_id', wIds)
      .eq('status', 'completed')
      .not('completed_at', 'is', null)
      .order('completed_at', { ascending: false });
    (lw || []).forEach(j => { if (!lastWorkedMap[j.worker_id]) lastWorkedMap[j.worker_id] = j.completed_at; });
  }
  _allApplicants = apps.map(a => ({ ...a, _lastWorked: lastWorkedMap[a.workers?.id] || null }));
  renderApplicants(_allApplicants);
}

function renderApplicants(apps) {
  const el = document.getElementById('applicants-list');
  if (!apps.length) {
    el.innerHTML = '<div class="empty"><div class="empty-icon">\u{1F465}</div><div class="empty-txt">아직 지원자가 없어요</div></div>';
    return;
  }
  // 즐겨찾기 → 노쇼 없는 사람 → 출근율 높은 순 → 최신순
  const sorted = [...apps].sort((a, b) => {
    const af = _favWorkers.has(a.workers?.id), bf = _favWorkers.has(b.workers?.id);
    if (af !== bf) return af ? -1 : 1;
    const aNs = (a.workers?.noshow_count || 0) > 0;
    const bNs = (b.workers?.noshow_count || 0) > 0;
    if (aNs !== bNs) return aNs ? 1 : -1;
    const aRev = a.workers?.review_count || 0, aNo = a.workers?.noshow_count || 0;
    const bRev = b.workers?.review_count || 0, bNo = b.workers?.noshow_count || 0;
    const aRate = (aRev + aNo) > 0 ? aRev / (aRev + aNo) : 0.5;
    const bRate = (bRev + bNo) > 0 ? bRev / (bRev + bNo) : 0.5;
    return bRate - aRate;
  });
  el.innerHTML = sorted.map(a => {
    const isFav = _favWorkers.has(a.workers?.id);
    const isCmp = _compareSet.has(a.id);
    return makeApplicantCardHtml(a, { stopProp: true, showExtras: true, isFav, isCmp, lastWorked: a._lastWorked });
  }).join('');
  const fab = document.getElementById('compare-fab');
  if (fab) fab.style.display = _compareSet.size === 2 ? 'flex' : 'none';
}

async function showPostingApplicants(jobId, title) {
  const { data } = await db.from('applications')
    .select('*, apply_message, workers(id, name, phone, rating, review_count, noshow_count)')
    .eq('job_posting_id', jobId)
    .order('applied_at', { ascending: false });
  ownerSwitchTab('applicants', document.querySelectorAll('.tab-btn')[1]);
  renderApplicants(data || []);
}

function calcCancelDeadline(workType, startTime) {
  if (!startTime) return null;
  const start = new Date(startTime);
  const OFFSETS = { regular: 7 * 24 * 3600000, short: 3 * 24 * 3600000 };
  const offset = OFFSETS[workType] ?? (2 * 3600000);
  return new Date(start.getTime() - offset).toISOString();
}

async function confirmAccept(appId) {
  const confirmed = await showConfirmDialog('최종합격 확정', '최종합격하면 근무 확정 메시지가 발송됩니다.\n인원이 다 채워지면 공고도 자동 마감됩니다.\n\n진행하시겠습니까?', '✅ 최종합격', '취소');
  if (!confirmed) return;
  updateApplication(appId, 'accepted');
}

function showConfirmDialog(title, msg, okLabel, cancelLabel) {
  return new Promise(resolve => {
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
    el.innerHTML = `<div style="background:#fff;border-radius:20px;padding:24px;max-width:320px;width:100%;text-align:center">
      <div style="font-size:16px;font-weight:900;color:#111;margin-bottom:12px">${title}</div>
      <div style="font-size:13px;color:#555;line-height:1.7;margin-bottom:20px;white-space:pre-line">${msg}</div>
      <div style="display:flex;gap:10px">
        <button style="flex:1;padding:13px;background:#f0f0f0;color:#555;border:none;border-radius:12px;font-size:14px;font-weight:700;cursor:pointer" onclick="this.closest('[style]').remove();"></button>
        <button style="flex:1;padding:13px;background:#C8102E;color:#fff;border:none;border-radius:12px;font-size:14px;font-weight:800;cursor:pointer" onclick="this.closest('[style]').remove();"></button>
      </div>
    </div>`;
    document.body.appendChild(el);
    const btns = el.querySelectorAll('button');
    btns[0].textContent = cancelLabel;
    btns[0].onclick = () => { el.remove(); resolve(false); };
    btns[1].textContent = okLabel;
    btns[1].onclick = () => { el.remove(); resolve(true); };
  });
}

async function updateApplication(appId, status) {
  // 낙관적 업데이트
  const _aIdx = _allApplicants.findIndex(a => a.id === appId);
  if (_aIdx !== -1) {
    _allApplicants[_aIdx] = { ..._allApplicants[_aIdx], status };
    renderApplicants(_allApplicants);
  }

  let updateData = { status };

  if (status === 'accepted') {
    const { data: appData } = await db.from('applications')
      .select('job_posting_id, job_postings(work_type, start_time, needed_count, filled_count)')
      .eq('id', appId).single();
    const dl = calcCancelDeadline(appData?.job_postings?.work_type, appData?.job_postings?.start_time);
    if (dl) updateData.cancel_deadline = dl;

    const { error } = await db.from('applications').update(updateData).eq('id', appId);
    if (error) { showToast('처리 실패'); loadApplicants(); return; }

    // filled_count 증가 + 자동마감
    if (appData?.job_posting_id) {
      const { data: jp } = await db.from('job_postings')
        .select('needed_count, filled_count, status').eq('id', appData.job_posting_id).single();
      if (jp) {
        const newFilled = (jp.filled_count || 0) + 1;
        const updJob = { filled_count: newFilled };
        if (newFilled >= (jp.needed_count || 1) && jp.status !== 'closed') {
          updJob.status = 'closed';
          showToast('🏁 인원 충족 — 공고가 자동 마감됐습니다');
        }
        await db.from('job_postings').update(updJob).eq('id', appData.job_posting_id);
      }
    }

    await sendAcceptMessage(appId);
    sendAppStatusPush(appId, 'accepted');
    showToast('✅ 최종합격 확정! 합격 메시지를 전송했습니다');
    setTimeout(() => showContractModal(appId), 500);
    loadPostings();
    return;
  }

  const { error } = await db.from('applications').update(updateData).eq('id', appId);
  if (error) { showToast('처리 실패'); loadApplicants(); return; }

  if (status === 'reviewing') {
    showToast('⭐ 1차합격 처리됐습니다');
  } else if (status === 'on_hold') {
    showToast('📌 보류 처리됐습니다');
  } else if (status === 'rejected') {
    sendAppStatusPush(appId, 'rejected');
    showToast('탈락 처리됐습니다');
  } else {
    showToast('처리됐습니다');
  }
  loadPostings();
}

async function _notifyOwnerNewApplicant(jobId) {
  try {
    const { data: jp } = await db.from('job_postings')
      .select('title, businesses(kakao_uid)').eq('id', jobId).single();
    const ownerUid = jp?.businesses?.kakao_uid;
    if (!ownerUid) return;
    const workerName = currentUser?.user_metadata?.full_name || currentUser?.user_metadata?.name || '알바생';
    fetch('/api/send-push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: ownerUid,
        title: '📨 새 지원자가 있어요',
        body: `${workerName}님이 "${jp?.title || '공고'}"에 지원했습니다`,
        url: '/바로알바.html'
      })
    }).catch(() => {});
  } catch(e) {}
}

async function sendAppStatusPush(appId, status) {
  try {
    const { data: app } = await db.from('applications')
      .select('workers(kakao_uid), job_postings(title)').eq('id', appId).single();
    const uid = app?.workers?.kakao_uid;
    if (!uid) return;
    const title = status === 'accepted' ? '\u{1F389} 합격 확정!' : '\u{1F4CB} 지원 결과 안내';
    const body  = status === 'accepted'
      ? `${bizRecord?.name || '업주'}의 "${app?.job_postings?.title || '공고'}"에 합격하셨습니다!`
      : `${bizRecord?.name || '업주'}의 "${app?.job_postings?.title || '공고'}" 지원 결과를 확인해보세요.`;
    fetch('/api/send-push', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ user_id: uid, title, body, url: '/바로알바.html' }) }).catch(()=>{});
  } catch(e) {}
}

async function sendAcceptMessage(appId) {
  const sess = currentSession;
  if (!sess) return;
  try {
    const res = await fetch(APP_CONFIG.SUPABASE_URL + '/rest/v1/messages', {
      method: 'POST',
      headers: {
        'apikey': APP_CONFIG.SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + sess.access_token,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        application_id: appId,
        sender_id: currentUser.id,
        content: '\u{1F389} 축하합니다! 최종 합격하셨습니다. 곧 상세 안내 드리겠습니다.',
      }),
    });
    if (!res.ok) console.error('합격 메시지 전송 실패:', res.status, await res.text().catch(() => ''));
  } catch(e) {
    console.error('합격 메시지 전송 오류:', e);
  }
}

// ── 공고 등록/수정 폼 ────────────────────────────────────
function openPostingForm() {
  editingId = null;
  document.getElementById('editing-id').value = '';
  document.getElementById('form-title').textContent = t('form_post_new');
  document.getElementById('submit-btn').textContent = t('form_submit_post');
  document.getElementById('f-title').value = '';
  setJobType('alba');     // 유형 탭 초기화
  setWorkType('spot');    // 근무형태 스팟으로 강제 초기화
  setWageType('hourly');  // 급여 유형 시급으로 초기화
  // 요일 버튼 전체 초기화
  document.querySelectorAll('#f-days-wrap button').forEach(btn => {
    btn.style.background  = '#fff';
    btn.style.color       = btn.dataset.day === '토' ? '#3B82F6' : btn.dataset.day === '일' ? '#C8102E' : '#888';
    btn.style.borderColor = '#eee';
  });
  document.getElementById('f-work-days').value = '';
  const _ps0 = document.getElementById('f-period-start'); if (_ps0) _ps0.value = '';
  const _pe0 = document.getElementById('f-period-end');   if (_pe0) _pe0.value = '';
  document.getElementById('f-wage').value = '';
  document.getElementById('f-needed').value = 1;
  document.getElementById('f-desc').value = '';
  document.getElementById('f-address').value = '';
  document.getElementById('f-lat').value = '';
  document.getElementById('f-lng').value = '';
  document.getElementById('location-result').style.display = 'none';
  document.getElementById('mini-map').style.display = 'none';

  const now = new Date();
  now.setMinutes(0, 0, 0);
  now.setHours(now.getHours() + 1);
  const todayStr = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0');
  const dateInp = document.getElementById('f-start-date');
  if (dateInp) dateInp.min = todayStr;
  const ps = document.getElementById('f-period-start'); if (ps) ps.min = todayStr;
  const pe = document.getElementById('f-period-end');   if (pe) pe.min = todayStr;
  setTimeSelects('start', now);
  const end = new Date(now.getTime() + 1 * 3600000);
  setTimeSelects('end', end);

  document.getElementById('naver-url-status').style.display = 'none';
  document.getElementById('f-naver-url-input').value = '';
  // 사진 초기화
  jobImgs = [];
  renderJobImgPreview();
  // surge 초기화
  surgeOn = false;
  document.getElementById('f-surge-enabled').value = 'false';
  document.getElementById('surge-toggle').style.background = '#ddd';
  document.getElementById('surge-knob').style.left = '2px';
  document.getElementById('surge-settings').style.display = 'none';
  document.getElementById('surge-preview').textContent = '';
  // 당일정산 + 노쇼보증금 + 재방문인센티브 + 비대면 + 초보/식사 초기화
  setSameDay(false); setDeposit(false); setReturnBonusOn(false); toggleRemoteMode(false);
  setBeginnerOk(false); setMealIncluded(false); setNatReq('any'); setTeamJob(false);
  const _pu0 = document.getElementById('f-pickup-location'); if (_pu0) _pu0.value = '';
  const _td0 = document.getElementById('f-team-desc'); if (_td0) _td0.value = '';
  renderMyPlacesQuick();
  // 기본 장소가 있으면 자동 적용
  const defaultPlace = _bizPlaces.find(p => p.is_default);
  if (defaultPlace && !document.getElementById('f-lat').value) {
    applyPlaceToForm(defaultPlace.id);
  }
  document.getElementById('form-overlay').classList.add('open');
  const _fab = document.getElementById('posting-fab');
  if (_fab) _fab.style.display = 'none';
}

// ── 근무형태 선택 ─────────────────────────────────────────
function setWorkType(type) {
  document.getElementById('f-work-type').value = type;
  const btns = { spot:'wt-spot', short:'wt-short', regular:'wt-regular', errand:'wt-errand' };
  const descs = {
    spot:    '⚡ 1회성 단발 근무 (날짜·시간 1회 지정)',
    short:   '\u{1F4C5} 기간제 단기 근무 (시작일~종료일 + 요일 지정)',
    regular: '\u{1F504} 장기 정기 근무 (요일 고정 + 주휴수당 설정)',
    errand:  '\u{1F3C3} 단순 심부름 (건당 금액, 예상 소요시간 지정)',
  };
  Object.keys(btns).forEach(k => {
    const el = document.getElementById(btns[k]);
    if (!el) return;
    el.style.background = k === type ? '#fff' : 'transparent';
    el.style.color = k === type ? '#C8102E' : '#888';
    el.style.boxShadow = k === type ? '0 1px 4px rgba(0,0,0,0.1)' : 'none';
  });
  document.getElementById('wt-desc').textContent = descs[type] || '';
  const isErrand = type === 'errand';
  const showSched = type !== 'spot' && !isErrand;
  document.getElementById('f-schedule-section').style.display = showSched ? 'block' : 'none';
  document.getElementById('f-start-date').style.display = showSched ? 'none' : '';
  document.getElementById('f-start-date-wrap').style.display = showSched ? 'none' : '';
  document.getElementById('f-time-label').textContent = showSched ? '근무 시작 시간 (시/분) *' : (isErrand ? '심부름 가능 시간 *' : '시작 시간 *');
  document.getElementById('f-end-time-group').style.display = isErrand ? 'none' : 'block';
  document.getElementById('f-errand-section').style.display = isErrand ? 'block' : 'none';
  document.getElementById('f-holiday-pay-wrap').style.display = type === 'regular' ? 'block' : 'none';
  document.getElementById('f-period-end-wrap').style.opacity = type === 'short' ? '1' : '0.4';
  renderCategorySelect();
}

function toggleDay(btn) {
  const active = btn.style.background === 'rgb(200, 16, 46)';
  btn.style.background = active ? '#fff' : '#C8102E';
  btn.style.color = active ? '#888' : '#fff';
  btn.style.borderColor = active ? '#eee' : '#C8102E';
  const days = Array.from(document.querySelectorAll('#f-days-wrap button'))
    .filter(b => b.style.background === 'rgb(200, 16, 46)').map(b => b.dataset.day);
  document.getElementById('f-work-days').value = days.join(',');
}

function toggleHolidayPay() {
  const on = document.getElementById('f-holiday-pay').value !== 'true';
  document.getElementById('f-holiday-pay').value = on;
  document.getElementById('holiday-pay-track').style.background = on ? '#22c55e' : '#ddd';
  document.getElementById('holiday-pay-knob').style.left = on ? '20px' : '2px';
}

function openEditForm(jobId) {
  const p = postings.find(x => x.id === jobId);
  if (!p) return;
  editingId = jobId;
  document.getElementById('editing-id').value = jobId;
  document.getElementById('form-title').textContent = t('form_post_edit');
  document.getElementById('submit-btn').textContent = t('form_submit_edit');
  document.getElementById('f-title').value = p.title;
  // 급여 유형 (시급/일급/건당/월급/기타) 복원
  setWageType(p.wage_type || 'hourly');
  document.getElementById('f-category').value = p.category;
  document.getElementById('f-wage').value = p.base_wage;
  document.getElementById('f-wage-preview').textContent = p.base_wage ? parseInt(p.base_wage).toLocaleString() + '원' : '—';
  document.getElementById('f-needed').value = p.needed_count;
  document.getElementById('f-desc').value = p.description || '';
  document.getElementById('f-lat').value = p.lat || '';
  document.getElementById('f-lng').value = p.lng || '';
  // 공고 유형 + 근무형태(스팟/단기/정기) 복원
  const _editJobType = p.work_type === 'errand' ? 'errand' : 'alba';
  setJobType(_editJobType);
  if (p.work_type && p.work_type !== 'errand') setWorkType(p.work_type);
  // 근무 요일 버튼 복원
  if (p.work_days) {
    const _activeDays = new Set(p.work_days.split(',').map(d => d.trim()));
    document.querySelectorAll('#f-days-wrap button').forEach(btn => {
      const on = _activeDays.has(btn.dataset.day);
      btn.style.background   = on ? '#C8102E' : '#fff';
      btn.style.color        = on ? '#fff' : (btn.dataset.day === '토' ? '#3B82F6' : btn.dataset.day === '일' ? '#C8102E' : '#888');
      btn.style.borderColor  = on ? '#C8102E' : '#eee';
    });
    document.getElementById('f-work-days').value = p.work_days;
  } else {
    // 요일 버튼 전체 초기화
    document.querySelectorAll('#f-days-wrap button').forEach(btn => {
      btn.style.background  = '#fff';
      btn.style.color       = btn.dataset.day === '토' ? '#3B82F6' : btn.dataset.day === '일' ? '#C8102E' : '#888';
      btn.style.borderColor = '#eee';
    });
    document.getElementById('f-work-days').value = '';
  }
  // 기간(시작일/종료일) 복원
  if (p.work_type === 'short' || p.work_type === 'regular') {
    const _startDate = p.period_start || (p.start_time ? p.start_time.slice(0, 10) : '');
    const _ps = document.getElementById('f-period-start');
    if (_ps && _startDate) _ps.value = _startDate;
    const _pe = document.getElementById('f-period-end');
    if (_pe && p.work_end_date) _pe.value = p.work_end_date;
  }
  // 기존 사진 로드 (main_image_idx가 가리키는 사진을 첫 번째로)
  const _rawImgs = p.images || [];
  const _mi = p.main_image_idx || 0;
  jobImgs = _rawImgs.map(url => ({ src: url, file: null }));
  if (_mi > 0 && _mi < jobImgs.length) { const [m] = jobImgs.splice(_mi, 1); jobImgs.unshift(m); }
  renderJobImgPreview();
  const _todayStr2 = new Date().toISOString().slice(0, 10);
  const _dateInp2 = document.getElementById('f-start-date');
  if (_dateInp2) _dateInp2.min = _todayStr2;
  const _ps2 = document.getElementById('f-period-start'); if (_ps2) _ps2.min = _todayStr2;
  const _pe2 = document.getElementById('f-period-end');   if (_pe2) _pe2.min = _todayStr2;
  if (p.start_time) {
    const s = new Date(p.start_time);
    setTimeSelects('start', s);
    const endMs = p.end_time ? new Date(p.end_time) : new Date(s.getTime() + (p.duration_hours || 4) * 3600000);
    setTimeSelects('end', endMs);
  } else {
    const def = new Date(); def.setDate(def.getDate() + 1); def.setHours(9, 0, 0, 0);
    setTimeSelects('start', def);
    setTimeSelects('end', new Date(def.getTime() + 4 * 3600000));
  }
  if (p.lat && p.lng) {
    showMiniMap(p.lat, p.lng, p.address || '');
    if (p.address) {
      document.getElementById('f-address').value = p.address;
      const _eParts = p.address.split('\n');
      const _eLabel = _eParts.length > 1
        ? _eParts[0] + ' · ' + _eParts[1].split(' ').slice(0,3).join(' ')
        : _eParts[0];
      document.getElementById('location-result').textContent = '\u{1F4CD} ' + _eLabel;
      document.getElementById('location-result').style.display = 'block';
    }
  }
  surgeOn = false;
  document.getElementById('f-surge-enabled').value = 'false';
  document.getElementById('surge-toggle').style.background = '#ddd';
  document.getElementById('surge-knob').style.left = '2px';
  document.getElementById('surge-settings').style.display = 'none';
  document.getElementById('surge-preview').textContent = '';
  document.getElementById('f-surge-max').value = '';
  if (p.surge_enabled) {
    toggleSurge();
    if (p.surge_max_wage)     document.getElementById('f-surge-max').value = p.surge_max_wage;
    if (p.surge_amount)       document.getElementById('f-surge-amount').value = p.surge_amount;
    if (p.surge_interval_min) document.getElementById('f-surge-interval').value = p.surge_interval_min;
    updateSurgePreview();
  }
  setSameDay(p.same_day_payment || false);
  setBeginnerOk(p.beginner_ok || false);
  setMealIncluded(p.meal_included || false);
  const _pu = document.getElementById('f-pickup-location');
  if (_pu) _pu.value = p.pickup_location || '';
  setNatReq(p.nationality_requirement || 'any');
  setTeamJob(p.is_team_job || false);
  const _td = document.getElementById('f-team-desc'); if (_td) _td.value = p.team_desc || '';
  setAgeLimit(p.age_limit || false);
  setJobLangs(p.preferred_languages || []);
  const dep = p.noshow_deposit || 0;
  setDeposit(dep > 0);
  if (dep > 0) setDepositAmount(dep);
  const rb = p.return_bonus || 0;
  setReturnBonusOn(rb > 0);
  if (rb > 0) setReturnBonus(rb);
  toggleRemoteMode(p.is_remote || false);
  renderMyPlacesQuick();
  document.getElementById('form-overlay').classList.add('open');
  const _fab = document.getElementById('posting-fab');
  if (_fab) _fab.style.display = 'none';
}

function closePostingForm() {
  document.getElementById('form-overlay').classList.remove('open');
  const _fab = document.getElementById('posting-fab');
  const _ownerEl = document.getElementById('panel-owner');
  if (_fab && _ownerEl && _ownerEl.style.display !== 'none') _fab.style.display = 'flex';
}
function closeFormIfBg(e) { if (e.target === document.getElementById('form-overlay')) closePostingForm(); }

function addJobImages(input) {
  const fileList = input.files;
  if (!fileList || !fileList.length) { showToast('선택된 파일이 없습니다'); return; }
  const remaining = 3 - jobImgs.length;
  if (remaining <= 0) { showToast('사진은 최대 3장까지 가능합니다'); return; }
  const files = Array.from(fileList).slice(0, remaining);
  let added = 0;
  files.forEach(f => {
    try {
      jobImgs.push({ src: URL.createObjectURL(f), file: f });
      added++;
    } catch(e) { showToast('사진 오류: ' + (f.name || f.type || '알 수 없음')); }
  });
  // iOS WebKit: value 초기화는 항상 비동기로
  setTimeout(() => { try { input.value = ''; } catch(e) {} }, 200);
  if (added > 0) { renderJobImgPreview(); showToast('📷 ' + added + '장 추가됨'); }
}


function editJobImg(idx) {
  const img = jobImgs[idx];
  if (!img || !img.file) return; // 기존 URL 이미지는 크롭 불가
  openCropModal(img.file, blob => {
    URL.revokeObjectURL(img.src);
    jobImgs[idx] = { src: URL.createObjectURL(blob), file: new File([blob], 'job.jpg', { type: 'image/jpeg' }) };
    renderJobImgPreview();
  }, NaN);
}

function renderJobImgPreview() {
  const container = document.getElementById('job-img-preview');
  if (!container) return;
  container.innerHTML = jobImgs.map((img, i) => `
    <div draggable="true" data-job-img-idx="${i}"
      ondragstart="_jobImgDragSrc=${i};event.dataTransfer.effectAllowed='move'"
      ondragover="event.preventDefault();event.dataTransfer.dropEffect='move'"
      ondragenter="if(!this.contains(event.relatedTarget)){this.style.outline='3px solid var(--red)';this.style.outlineOffset='-3px'}"
      ondragleave="if(!this.contains(event.relatedTarget)){this.style.outline='';this.style.outlineOffset=''}"
      ondrop="event.preventDefault();this.style.outline='';this.style.outlineOffset='';if(_jobImgDragSrc!==null&&_jobImgDragSrc!==${i})jobImgSwap(_jobImgDragSrc,${i});_jobImgDragSrc=null"
      style="position:relative;aspect-ratio:1;border-radius:12px;overflow:hidden;border:${i === 0 ? '3px solid var(--red)' : '2px solid #eee'};cursor:grab">
      <img src="${img.src}" onclick="openImgViewer('${img.src}')" style="width:100%;height:100%;object-fit:cover;cursor:pointer">
      ${img.file ? `<button onclick="event.stopPropagation();editJobImg(${i})" style="position:absolute;bottom:3px;right:3px;width:22px;height:22px;border-radius:50%;background:rgba(0,0,0,0.55);border:none;color:#fff;font-size:11px;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;line-height:1">✏</button>` : ''}
      <!-- 순서 번호 뱃지 -->
      <div style="position:absolute;top:3px;left:4px;width:18px;height:18px;border-radius:50%;background:${i === 0 ? 'var(--red)' : 'rgba(0,0,0,0.55)'};color:#fff;font-size:10px;font-weight:800;display:flex;align-items:center;justify-content:center;pointer-events:none">${i + 1}</div>
      ${i === 0 ? '<div style="position:absolute;bottom:0;left:0;right:0;background:rgba(200,16,46,0.85);color:#fff;font-size:9px;font-weight:800;text-align:center;padding:3px;pointer-events:none">대표</div>' : ''}
      <button onclick="event.stopPropagation();removeJobImg(${i})" style="position:absolute;top:3px;right:3px;width:20px;height:20px;border-radius:50%;background:rgba(0,0,0,0.55);border:none;color:#fff;font-size:11px;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;line-height:1">✕</button>
    </div>`).join('');
  const addBtn = document.getElementById('job-img-add-btn');
  if (addBtn) addBtn.style.display = jobImgs.length >= 3 ? 'none' : 'flex';
  _setupTouchDnd(container, (a, b) => jobImgSwap(parseInt(a), parseInt(b)), 'data-job-img-idx');
}

function jobImgSwap(a, b) {
  if (a < 0 || b < 0 || a >= jobImgs.length || b >= jobImgs.length) return;
  [jobImgs[a], jobImgs[b]] = [jobImgs[b], jobImgs[a]];
  renderJobImgPreview();
}

function removeJobImg(idx) {
  if (jobImgs[idx]?.src.startsWith('blob:')) URL.revokeObjectURL(jobImgs[idx].src);
  jobImgs.splice(idx, 1);
  renderJobImgPreview();
}

// ── 모임 사진 ────────────────────────────────────────────
function addMoimImages(input) {
  const fileList = input.files;
  if (!fileList || !fileList.length) { showToast('선택된 파일이 없습니다'); return; }
  const remaining = 3 - moimImgs.length;
  if (remaining <= 0) { showToast('사진은 최대 3장까지 가능합니다'); return; }
  const files = Array.from(fileList).slice(0, remaining);
  let added = 0;
  files.forEach(f => {
    try { moimImgs.push({ src: URL.createObjectURL(f), file: f }); added++; }
    catch(e) { showToast('사진 오류: ' + (f.name || f.type || '알 수 없음')); }
  });
  setTimeout(() => { try { input.value = ''; } catch(e) {} }, 200);
  if (added > 0) { renderMoimImgPreview(); showToast('📷 ' + added + '장 추가됨'); }
}
function renderMoimImgPreview() {
  const container = document.getElementById('moim-img-preview');
  if (!container) return;
  container.innerHTML = moimImgs.map((img, i) => `
    <div style="position:relative;aspect-ratio:1;border-radius:12px;overflow:hidden;border:${i===0?'3px solid #7C3AED':'2px solid #eee'}">
      <img src="${img.src}" onclick="openImgViewer('${img.src}')" style="width:100%;height:100%;object-fit:cover;cursor:pointer">
      <div style="position:absolute;top:3px;left:4px;width:18px;height:18px;border-radius:50%;background:${i===0?'#7C3AED':'rgba(0,0,0,0.55)'};color:#fff;font-size:10px;font-weight:800;display:flex;align-items:center;justify-content:center;pointer-events:none">${i+1}</div>
      ${i===0?'<div style="position:absolute;bottom:0;left:0;right:0;background:rgba(124,58,237,0.85);color:#fff;font-size:9px;font-weight:800;text-align:center;padding:3px;pointer-events:none">대표</div>':''}
      <button onclick="event.stopPropagation();removeMoimImg(${i})" style="position:absolute;top:3px;right:3px;width:20px;height:20px;border-radius:50%;background:rgba(0,0,0,0.55);border:none;color:#fff;font-size:11px;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;line-height:1">✕</button>
    </div>`).join('');
  const addBtn = document.getElementById('moim-img-add-btn');
  if (addBtn) addBtn.style.display = moimImgs.length >= 3 ? 'none' : 'flex';
}
function removeMoimImg(idx) {
  if (moimImgs[idx]?.src.startsWith('blob:')) URL.revokeObjectURL(moimImgs[idx].src);
  moimImgs.splice(idx, 1);
  renderMoimImgPreview();
}

// ── 급여 계산기 ────────────────────────────────────────────
function openWageCalc(prefillWage) {
  const w = prefillWage || (jobs.find(j => j.id === selectedJobId)?.current_wage) || 10030;
  document.getElementById('wc-wage').value = w;
  document.getElementById('wc-hours').value = 8;
  document.getElementById('wc-days').value = 5;
  document.getElementById('wc-tax').value = '0.033';
  document.getElementById('wage-calc-modal').style.display = 'flex';
  calcWage();
}

function closeWageCalc() {
  document.getElementById('wage-calc-modal').style.display = 'none';
}

function calcWage() {
  const wage  = parseFloat(document.getElementById('wc-wage').value)  || 0;
  const hours = parseFloat(document.getElementById('wc-hours').value) || 0;
  const days  = parseFloat(document.getElementById('wc-days').value)  || 0;
  const tax   = parseFloat(document.getElementById('wc-tax').value)   || 0;

  const daily   = wage * hours;
  const weekly  = daily * days;
  const weeklyH = days * hours; // 주당 총 근무시간

  // 주휴수당: 주 15시간 이상 시 (주 근무시간 / 40) × 8 × 시급
  const hasHoliday = weeklyH >= 15;
  const holidayPay = hasHoliday ? Math.round((weeklyH / 40) * 8 * wage) : 0;

  // 월급: (주급 + 주휴수당) × 4.345주
  const monthly = Math.round((weekly + holidayPay) * 4.345);
  const net     = Math.round(monthly * (1 - tax));

  const fmt = n => n.toLocaleString('ko-KR') + '원';

  document.getElementById('wc-daily').textContent   = fmt(Math.round(daily));
  document.getElementById('wc-weekly').textContent  = fmt(Math.round(weekly));
  document.getElementById('wc-monthly').textContent = fmt(monthly);
  document.getElementById('wc-net').textContent     = fmt(net);

  const hrEl = document.getElementById('wc-holiday-row');
  const hlEl = document.getElementById('wc-holiday');
  if (hasHoliday) {
    hrEl.style.display = 'flex';
    hlEl.textContent = '+' + fmt(holidayPay) + ' / 주';
    document.getElementById('wc-holiday-notice').textContent =
      '✅ 주 ' + weeklyH + '시간 근무 → 주휴수당 대상 (주 15시간 이상). 월급에 포함됨.';
  } else {
    hrEl.style.display = 'none';
    document.getElementById('wc-holiday-notice').textContent =
      '⚠️ 주 ' + weeklyH + '시간 근무 → 주휴수당 미해당 (주 15시간 미만).';
  }

  const taxPct = tax > 0 ? (tax * 100).toFixed(1) + '% 공제 후' : '공제 없음';
  document.getElementById('wc-net').parentElement.children[0].textContent = '실수령액 (' + taxPct + ')';
}

function openImgViewer(url) {
  const ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.93);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
  ov.onclick = () => ov.remove();
  ov.innerHTML = '<img src="' + url + '" style="max-width:100%;max-height:100%;object-fit:contain;border-radius:10px">';
  document.body.appendChild(ov);
}

function setLocTab(n) {
  [1, 2, 3].forEach(i => {
    const tab = document.getElementById(`loc-tab-${i}`);
    const panel = document.getElementById(`loc-panel-${i}`);
    const active = i === n;
    tab.style.background = active ? '#fff' : 'transparent';
    tab.style.color = active ? '#C8102E' : '#888';
    tab.style.boxShadow = active ? '0 1px 3px rgba(0,0,0,0.1)' : 'none';
    panel.style.display = active ? 'block' : 'none';
  });
}

function setLocationResult(lat, lng, label) {
  document.getElementById('f-lat').value = lat;
  document.getElementById('f-lng').value = lng;
  document.getElementById('f-address').value = label;
  document.getElementById('location-result').textContent = '\u{1F4CD} ' + label;
  document.getElementById('location-result').style.display = 'block';
  document.getElementById('addr-results').style.display = 'none';
  showMiniMap(lat, lng);
  showToast('✅ 위치가 설정됐어요');
}

// 탭2: 주소 검색
async function searchAddress() {
  const query = document.getElementById('f-addr-search').value.trim();
  if (!query) { showToast('주소를 입력해주세요'); return; }
  const btn = event.target;
  btn.textContent = '검색 중...'; btn.disabled = true;
  const results = await new Promise(resolve => {
    try {
      new kakao.maps.services.Geocoder().addressSearch(query, (r, s) => {
        resolve(s === kakao.maps.services.Status.OK ? r : []);
      });
    } catch { resolve([]); }
  });
  btn.textContent = '검색'; btn.disabled = false;
  if (!results.length) { showToast('주소를 찾을 수 없어요. 더 자세히 입력해주세요'); return; }
  const box = document.getElementById('addr-results');
  box.style.display = 'block';
  box.innerHTML = results.slice(0, 5).map((r, i) => `
    <div onclick="setLocationResult(${r.y},${r.x},'${(r.road_address?.address_name || r.address_name).replace(/'/g, '')}')"
      style="padding:10px 14px;border-bottom:1px solid #eee;cursor:pointer;font-size:13px"
      onmouseover="this.style.background='#fff'" onmouseout="this.style.background=''">
      <div style="font-weight:700;color:#222">${r.road_address?.address_name || r.address_name}</div>
      ${r.road_address ? `<div style="font-size:11px;color:#aaa">${r.address_name}</div>` : ''}
    </div>`).join('');
}

// 탭3: 직접 텍스트 입력 (키워드 검색으로 근사 좌표)
async function applyDirectAddr() {
  const text = document.getElementById('f-direct-addr').value.trim();
  if (!text) { showToast('위치를 입력해주세요'); return; }
  const btn = event.target;
  btn.textContent = '검색 중...'; btn.disabled = true;
  // 키워드 검색으로 근사 좌표 시도
  const found = await new Promise(resolve => {
    try {
      new kakao.maps.services.Places().keywordSearch(text, (r, s) => {
        resolve(s === kakao.maps.services.Status.OK && r[0] ? r[0] : null);
      });
    } catch { resolve(null); }
  });
  btn.textContent = '적용'; btn.disabled = false;
  if (found) {
    setLocationResult(parseFloat(found.y), parseFloat(found.x), text);
  } else if (bizRecord?.lat && bizRecord?.lng) {
    document.getElementById('f-lat').value = bizRecord.lat;
    document.getElementById('f-lng').value = bizRecord.lng;
    document.getElementById('f-address').value = text;
    document.getElementById('location-result').textContent = '\u{1F4CD} ' + text + ' (업체 위치 기준)';
    document.getElementById('location-result').style.display = 'block';
    showMiniMap(bizRecord.lat, bizRecord.lng);
    showToast('\u{1F4CD} 정확한 좌표를 못 찾아 업체 위치로 등록해요');
  } else {
    showToast('위치를 찾을 수 없어요. 더 구체적으로 입력해주세요');
  }
}

// ── 네이버 플레이스 URL 감지 ─────────────────────────────
function handleNaverUrl(val) {
  const status = document.getElementById('naver-url-status');
  const isNaverUrl = /naver\.me|map\.naver\.com|m\.place\.naver\.com/.test(val);
  if (!val) { status.style.display = 'none'; document.getElementById('f-naver-link').value = ''; return; }
  if (isNaverUrl) {
    document.getElementById('f-naver-link').value = val;
    status.textContent = '✅ 네이버 플레이스 URL 인식됨 — 위 검색창에서 업체명도 검색해 좌표를 설정해주세요';
    status.style.cssText = 'display:block;color:#1a7d3b;font-size:11px;font-weight:700;padding:4px 2px';
  } else {
    status.textContent = '⚠️ 네이버 플레이스 URL 형식이 아닙니다';
    status.style.cssText = 'display:block;color:#FF9500;font-size:11px;font-weight:700;padding:4px 2px';
  }
}

// ── 네이버 플레이스 검색 (5개씩 start 페이징) ──────────
async function searchNaverPlace(start = 1) {
  const query = document.getElementById('f-address').value.trim();
  if (!query) { showToast('시·구·업체명을 입력해주세요\n예: 부산 사하구 스타벅스'); return; }

  const btn = document.querySelector('.search-addr-btn');
  btn.textContent = '검색 중...'; btn.disabled = true;

  try {
    const res = await fetch(`/api/naver-search?query=${encodeURIComponent(query)}&start=${start}`);
    const data = await res.json();
    if (!res.ok || !data.items?.length) {
      if (start === 1) showToast('검색 결과가 없어요.\n지역명+업체명으로 검색해보세요\n예: 서울 신라스테이');
      else showToast('마지막 페이지입니다');
      return;
    }
    renderPlaceResults(data.items, query, start, data.total || 0);
  } catch(e) {
    showToast('검색 중 오류가 발생했어요');
  } finally {
    btn.textContent = '\u{1F50D} 검색'; btn.disabled = false;
  }
}

function renderPlaceResults(items, usedQuery, start = 1, total = 0) {
  const box = document.getElementById('place-results');
  box.style.display = 'block';
  window._naverPlaceItems = items;

  const end = start + items.length - 1;
  const hasPrev = start > 1;
  const hasNext = total > end;
  const tip = total > 20
    ? `<div style="padding:6px 14px;font-size:11px;color:#F59E0B;background:#FFFBEB;border-bottom:1px solid #FDE68A">\u{1F4A1} 결과가 많아요. 지역+업체명으로 검색하면 더 정확해요 (예: 서울 ${usedQuery})</div>`
    : '';
  const header = `<div style="padding:8px 14px;font-size:11px;color:#888;border-bottom:1px solid #eee">"${usedQuery}" 총 ${total}개 · ${start}~${end}번째</div>`;

  const pageBar = (hasPrev || hasNext) ? `
    <div style="display:flex;align-items:center;gap:6px;padding:8px 12px;border-top:1px solid #eee;background:#fafafa">
      ${hasPrev
        ? `<button onclick="searchNaverPlace(${Math.max(1, start - 5)})" style="flex:1;padding:7px;border:1.5px solid #ddd;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;background:#fff">◀ 이전</button>`
        : `<div style="flex:1"></div>`}
      <span style="font-size:11px;color:#bbb;flex-shrink:0">${Math.ceil(start/5)} / ${Math.ceil(total/5)}p</span>
      ${hasNext
        ? `<button onclick="searchNaverPlace(${start + 5})" style="flex:1;padding:7px;border:1.5px solid #ddd;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;background:#fff">다음 ▶</button>`
        : `<div style="flex:1"></div>`}
    </div>` : '';

  box.innerHTML = header + tip + items.map((item, i) => `
    <div onclick="selectPlace(${i})" data-idx="${i}" style="padding:12px 14px;border-bottom:1px solid #eee;cursor:pointer;transition:background 0.1s;" onmouseover="this.style.background='#fff'" onmouseout="this.style.background=''">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">
        <span style="font-size:13px;font-weight:800;color:#222">${item.title}</span>
        ${item.link ? '<span style="font-size:10px;font-weight:700;background:#E6F4EA;color:#1a7d3b;padding:2px 6px;border-radius:6px">N 플레이스</span>' : ''}
      </div>
      <div style="font-size:11px;color:#aaa">${item.roadAddress || item.address}</div>
    </div>`).join('') + pageBar;
}

function selectPlace(idx) {
  const item = window._naverPlaceItems[idx];
  const pLat = parseFloat(item.lat), pLng = parseFloat(item.lng);
  if (isNaN(pLat) || isNaN(pLng) || pLat < 33 || pLat > 38.6 || pLng < 124.6 || pLng > 131.9) {
    showToast('⚠️ 이 장소의 좌표가 올바르지 않아요. 다른 결과를 선택하거나 주소를 직접 검색해주세요');
    return;
  }
  document.getElementById('f-lat').value = pLat;
  document.getElementById('f-lng').value = pLng;
  document.getElementById('f-naver-link').value = item.link || '';
  const roadAddr = item.roadAddress || item.address || '';
  // DB에 장소명 + 도로명 주소 모두 저장
  document.getElementById('f-address').value = item.title + (roadAddr ? '\n' + roadAddr : '');
  const locLabel = `\u{1F4CD} ${item.title}${roadAddr ? ' · ' + roadAddr : ''}${item.link ? '  ✅' : ''}`;
  document.getElementById('location-result').textContent = locLabel;
  document.getElementById('location-result').style.display = 'block';
  document.getElementById('place-results').style.display = 'none';
  showMiniMap(pLat, pLng);
}

function searchKakaoFallback(query) {
  const geocoder = new kakao.maps.services.Geocoder();
  geocoder.addressSearch(query, (result, status) => {
    if (status === kakao.maps.services.Status.OK && result.length > 0) {
      const r = result[0];
      document.getElementById('f-lat').value = r.y;
      document.getElementById('f-lng').value = r.x;
      document.getElementById('location-result').textContent = '\u{1F4CD} ' + r.address_name;
      document.getElementById('location-result').style.display = 'block';
      document.getElementById('place-results').style.display = 'none';
      showMiniMap(parseFloat(r.y), parseFloat(r.x));
    } else {
      showToast('장소를 찾을 수 없어요. 다시 입력해주세요.');
    }
  });
}

function showMiniMap(lat, lng, addr) {
  const el = document.getElementById('mini-map');
  el.style.display = 'block';
  requestAnimationFrame(() => {
    const pos = new kakao.maps.LatLng(lat, lng);
    if (!miniMap) {
      miniMap = new kakao.maps.Map(el, { center: pos, level: 4 });
    } else {
      miniMap.relayout();
      miniMap.setCenter(pos);
    }
    if (miniMarker) miniMarker.setMap(null);
    miniMarker = new kakao.maps.Marker({ position: pos, map: miniMap });
  });
}

// ── 공고 제출 ─────────────────────────────────────────────
async function submitPosting() {
  const title = document.getElementById('f-title').value.trim();
  const category = document.getElementById('f-category').value;
  const wageType = document.getElementById('f-wage-type')?.value || 'hourly';
  const wageOther = document.getElementById('f-wage-other')?.value.trim() || '';
  const wage = wageType === 'other' ? 0 : parseInt(document.getElementById('f-wage').value);
  const needed = parseInt(document.getElementById('f-needed').value);
  const lat = parseFloat(document.getElementById('f-lat').value);
  const lng = parseFloat(document.getElementById('f-lng').value);
  const desc = document.getElementById('f-desc').value.trim();
  const wt = document.getElementById('f-work-type').value || 'spot';
  const isErrand = wt === 'errand';
  const isScheduled = wt !== 'spot' && !isErrand;
  if (isScheduled && !document.getElementById('f-period-start').value) {
    showToast('시작일을 입력해주세요'); return;
  }
  const startTime = getTimeValue('start');
  let endTime = isErrand ? null : getTimeValue('end');
  if (!isErrand && isScheduled && startTime && endTime && endTime <= startTime) {
    endTime = new Date(endTime.getTime() + 86400000);
  }
  const errandDuration = isErrand ? (parseFloat(document.getElementById('f-errand-duration').value) || null) : null;
  const duration = isErrand ? errandDuration : (startTime && endTime ? Math.round((endTime - startTime) / 360000) / 10 : null);

  if (!title) { showToast('직무명을 입력해주세요'); return; }
  if (_hasBadWord(title) || (desc && _hasBadWord(desc))) { showToast('금지된 표현이 포함되어 있습니다'); return; }
  if (_hasBadWord(title) || _hasBadWord(desc)) { showToast('제목 또는 설명에 사용할 수 없는 단어가 포함되어 있어요'); return; }
  if (wageType === 'other') {
    if (!wageOther) { showToast('급여 조건을 입력해주세요'); return; }
  } else if (wageType === 'hourly' && (!wage || wage < 10030)) {
    showToast('시급은 2025 최저임금(10,030원) 이상이어야 해요'); return;
  } else if (wageType !== 'hourly' && !wage) {
    showToast('금액을 입력해주세요'); return;
  }
  if (!startTime || isNaN(startTime.getTime())) { showToast('시작 시간을 입력해주세요'); return; }
  if (!isErrand && startTime < new Date()) { showToast('이미 지난 시간은 선택할 수 없어요'); return; }
  if (!isErrand && (!endTime || isNaN(endTime.getTime()) || endTime <= startTime)) { showToast('종료 시간은 시작 시간보다 늦어야 해요'); return; }
  // 비대면 공고는 위치 불필요
  const _isRemote = document.getElementById('f-is-remote').value === 'true';
  const finalLat = _isRemote ? null : parseFloat(document.getElementById('f-lat').value);
  const finalLng = _isRemote ? null : parseFloat(document.getElementById('f-lng').value);
  if (!_isRemote && (isNaN(finalLat) || isNaN(finalLng) || !finalLat || !finalLng)) {
    const locEl = document.getElementById('location-result');
    locEl.style.display = 'block';
    locEl.style.color = 'var(--red)';
    locEl.textContent = '⚠️ 위치 탭에서 장소를 검색하고 미니맵을 확인한 후 등록해주세요';
    locEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => { locEl.style.color = ''; if (locEl.textContent.startsWith('⚠️')) locEl.style.display = 'none'; }, 4000);
    showToast('\u{1F4CD} 위치를 먼저 설정해주세요');
    return;
  }

  // 세션 체크 — btn 비활성화 전에 먼저 (동기 즉시 확인)
  const sess = currentSession;
  if (!sess) { showToast('로그인이 만료됐습니다. 새로고침 후 다시 로그인해주세요.'); return; }

  const surgeEnabled  = document.getElementById('f-surge-enabled').value === 'true';
  const surgeMax      = parseInt(document.getElementById('f-surge-max').value) || null;
  const surgeAmount   = parseInt(document.getElementById('f-surge-amount').value) || 1000;
  const surgeInterval = parseInt(document.getElementById('f-surge-interval').value) || 30;
  const sameDayPayment = document.getElementById('f-same-day-on').value === 'true';

  const workType   = document.getElementById('f-work-type').value || 'spot';
  const workDays   = document.getElementById('f-work-days').value || '';
  const periodEnd  = document.getElementById('f-period-end').value || null;
  const holidayPay = document.getElementById('f-holiday-pay').value === 'true';

  const _todayChk = new Date().toISOString().slice(0, 10);
  const _startDateVal = document.getElementById('f-start-date')?.value;
  if (_startDateVal && _startDateVal < _todayChk) {
    showToast('시작 날짜는 오늘 이후여야 합니다'); return;
  }
  if (workType === 'short' && periodEnd && periodEnd < _todayChk) {
    showToast('단기 공고 종료일은 오늘 이후여야 합니다'); return;
  }

  const addrText = document.getElementById('f-address')?.value.trim()
    || document.getElementById('f-direct-addr')?.value.trim() || null;

  const payload = {
    business_id: bizRecord.id,
    title, category, description: desc,
    wage_type: wageType,
    wage_label: wageType === 'other' ? wageOther : null,
    current_wage: wageType === 'other' ? 0 : wage,
    base_wage: wageType === 'other' ? 0 : wage,
    lat: finalLat, lng: finalLng,
    address: addrText,
    duration_hours: duration,
    needed_count: needed || 1,
    start_time: startTime.toISOString(),
    status: surgeEnabled ? 'urgent' : 'open',
    surge_enabled:      surgeEnabled,
    surge_max_wage:     surgeEnabled ? (surgeMax || wage + surgeAmount * 3) : null,
    surge_amount:       surgeEnabled ? surgeAmount : null,
    surge_interval_min: surgeEnabled ? surgeInterval : null,
    same_day_payment:   sameDayPayment,
    noshow_deposit:     document.getElementById('f-deposit-on').value === 'true' ? (parseInt(document.getElementById('f-deposit-amount')?.value) || 0) : 0,
    return_bonus:       document.getElementById('f-return-bonus-on').value === 'true' ? (parseInt(document.getElementById('f-return-bonus')?.value) || 0) : 0,
    work_type:          workType,
    work_days:          workDays || null,
    work_end_date:      workType === 'short' ? periodEnd : null,
    holiday_pay:        workType === 'regular' ? holidayPay : false,
    age_limit:          document.getElementById('f-age-limit').value === 'true',
    preferred_languages: JSON.parse(document.getElementById('f-pref-langs')?.value || '[]'),
    is_remote:          document.getElementById('f-is-remote').value === 'true',
    beginner_ok:             document.getElementById('f-beginner-ok').value === 'true',
    meal_included:           document.getElementById('f-meal-included').value === 'true',
    pickup_location:         document.getElementById('f-pickup-location').value.trim() || null,
    nationality_requirement: document.getElementById('f-nat-req').value || 'any',
    is_team_job:             document.getElementById('f-team-job').value === 'true',
    team_desc:               document.getElementById('f-team-desc')?.value.trim() || null,
  };

  const btn = document.getElementById('submit-btn');
  const btnOrigText = editingId ? t('form_submit_edit') : t('form_submit_post');
  btn.disabled = true; btn.textContent = '저장 중...';

  // 이미지 업로드 (새 파일만, 기존 URL은 그대로 유지)
  const _uploadedUrls = [];
  if (jobImgs.some(img => img.file)) btn.textContent = '사진 업로드 중...';
  for (const img of jobImgs) {
    if (!img.file) {
      _uploadedUrls.push(img.src); // 기존 URL 유지
    } else {
      const path = sess.user.id + '/' + Date.now() + '_' + Math.random().toString(36).slice(2) + '.jpg';
      try {
        const r = await fetch(APP_CONFIG.SUPABASE_URL + '/storage/v1/object/job-images/' + path, {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + sess.access_token, 'Content-Type': 'image/jpeg' },
          body: img.file
        });
        if (r.ok) {
          _uploadedUrls.push(APP_CONFIG.SUPABASE_URL + '/storage/v1/object/public/job-images/' + path);
        } else {
          const errTxt = await r.text().catch(() => r.status);
          console.error('[job-image] 업로드 실패:', r.status, errTxt);
          showToast('사진 업로드 실패 (' + r.status + ') — 사진 없이 저장됩니다', 5000);
        }
      } catch(e) {
        console.error('[job-image] 업로드 네트워크 오류:', e);
        showToast('사진 업로드 중 오류가 발생했습니다 — 사진 없이 저장됩니다', 5000);
      }
    }
  }
  payload.images = _uploadedUrls;
  payload.main_image_idx = 0; // 배열 첫 번째가 항상 대표
  btn.textContent = '저장 중...';

  try {

    const headers = {
      'apikey': APP_CONFIG.SUPABASE_ANON_KEY,
      'Authorization': 'Bearer ' + sess.access_token,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    };

    // 10초 타임아웃
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 10000);

    let res;
    try {
      if (editingId) {
        res = await fetch(
          APP_CONFIG.SUPABASE_URL + '/rest/v1/job_postings?id=eq.' + editingId,
          { method: 'PATCH', headers, body: JSON.stringify(payload), signal: ctrl.signal }
        );
      } else {
        payload.base_wage = wage;
        res = await fetch(
          APP_CONFIG.SUPABASE_URL + '/rest/v1/job_postings',
          { method: 'POST', headers, body: JSON.stringify(payload), signal: ctrl.signal }
        );
      }
      clearTimeout(tid);
    } catch(fetchErr) {
      clearTimeout(tid);
      console.error('fetch error:', fetchErr);
      showToast('저장 중 오류가 발생했습니다. 다시 시도해주세요.');
      return;
    }

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      console.error('save failed', res.status, errBody);
      let errDetail = errBody;
      try { const j = JSON.parse(errBody); errDetail = j.message || j.hint || errBody; } catch(e) {}
      showAlert('저장 실패 (' + res.status + ')\n' + errDetail, {icon:'❌', title:'공고 저장 실패'});
      showToast('저장 실패 (' + res.status + ')', 4000);
      return;
    }

    closePostingForm();
    loadPostings();
    if (!editingId) {
      const { data: fresh } = await db.from('job_postings')
        .select('id').eq('business_id', bizRecord.id).order('created_at', { ascending: false }).limit(1).single();
      openShareModal(fresh?.id, true);
      // 비동기로 매칭 알림 발송 + 팔로워 알림 + 단골 우선 알림 (UI 차단 없음)
      notifyMatchingWorkers(category, wage, addrText).catch(() => {});
      _notifyFollowers(fresh?.id, title, wage).catch(() => {});
      _notifyFavWorkers(fresh?.id, title, wage).catch(() => {});
    } else {
      showToast('✅ 공고가 수정됐습니다');
    }
  } finally {
    btn.disabled = false;
    btn.textContent = btnOrigText;
  }
}

// ── 팔로워 알림 발송 ──────────────────────────────────────
async function _notifyFollowers(jobId, title, wage) {
  if (!bizRecord?.id) return;
  const { data: followers } = await db.from('follows')
    .select('workers(kakao_uid, name)').eq('business_id', bizRecord.id);
  if (!followers?.length) return;
  const wageStr = wage ? ' · ' + wage.toLocaleString() + '원' : '';
  const body = `${title}${wageStr} 새 공고가 올라왔어요`;
  for (const f of followers) {
    const uid = f.workers?.kakao_uid;
    if (!uid) continue;
    fetch('/api/send-push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: uid, title: `🔔 ${bizRecord.name}`, body, url: jobId ? `/바로알바.html?job=${jobId}` : '/바로알바.html' })
    }).catch(() => {});
  }
}

// ── 맞춤 공고 알림 발송 ────────────────────────────────────
async function notifyMatchingWorkers(category, wage, address) {
  try {
    // notify_enabled=true 이고 최소시급 조건 맞는 알바생 조회 (최대 50명)
    const { data: workers } = await db.from('workers')
      .select('kakao_uid, notify_categories, notify_min_wage')
      .eq('notify_enabled', true)
      .lte('notify_min_wage', wage)
      .limit(50);
    if (!workers?.length) return;

    const targets = workers.filter(w => {
      const cats = w.notify_categories;
      return !cats?.length || cats.includes(category); // 빈 배열 = 전체 업종
    });
    if (!targets.length) return;

    const bizName = bizRecord?.name || '업주';
    const title = `🔔 ${category} 새 공고 — ${bizName}`;
    const body = `시급 ${wage.toLocaleString()}원 · ${address || '위치 확인'}`;

    await Promise.allSettled(targets.map(w =>
      fetch('/api/send-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: w.kakao_uid, title, body, url: './바로알바.html' })
      })
    ));
  } catch(e) {
    console.log('notify error:', e.message);
  }
}

// ── 번개 알바 토글 ────────────────────────────────────────
let surgeOn = false;
function toggleSurge() {
  surgeOn = !surgeOn;
  document.getElementById('f-surge-enabled').value = surgeOn;
  const knob    = document.getElementById('surge-knob');
  const toggle  = document.getElementById('surge-toggle');
  const settings = document.getElementById('surge-settings');
  toggle.style.background  = surgeOn ? '#FF9500' : '#ddd';
  knob.style.left          = surgeOn ? '22px' : '2px';
  settings.style.display   = surgeOn ? 'block' : 'none';
  updateSurgePreview();
}

// ── 비대면 근무 토글 ─────────────────────────────────────
function toggleRemoteMode(val) {
  document.getElementById('f-is-remote').value = val ? 'true' : 'false';
  document.getElementById('remote-track').style.background = val ? '#0369A1' : '#ddd';
  document.getElementById('remote-knob').style.left = val ? '22px' : '2px';
  document.getElementById('location-form-group').style.display = val ? 'none' : 'block';
}

// ── 비대면 필터 토글 ─────────────────────────────────────
function toggleRemoteFilter(el) {
  filterRemote = !filterRemote;
  el.classList.toggle('active', filterRemote);
  loadJobs();
  if (typeof renderMarkers === 'function') renderMarkers();
}

// ── 당일 정산 토글 ────────────────────────────────────────
function setSameDay(val) {
  document.getElementById('f-same-day-on').value = val ? 'true' : 'false';
  document.getElementById('same-day-track').style.background = val ? '#16a34a' : '#ddd';
  document.getElementById('same-day-knob').style.left = val ? '22px' : '2px';
}

function toggleTeamJob() {
  const cur = document.getElementById('f-team-job').value === 'true';
  setTeamJob(!cur);
}
function setTeamJob(val) {
  document.getElementById('f-team-job').value = val ? 'true' : 'false';
  document.getElementById('team-job-track').style.background = val ? '#7C3AED' : '#e5e7eb';
  document.getElementById('team-job-knob').style.transform = val ? 'translateX(20px)' : 'translateX(0)';
  document.getElementById('team-job-detail').style.display = val ? 'block' : 'none';
}

function setBeginnerOk(val) {
  document.getElementById('f-beginner-ok').value = val ? 'true' : 'false';
  document.getElementById('beginner-ok-track').style.background = val ? '#16a34a' : '#e5e7eb';
  document.getElementById('beginner-ok-knob').style.transform = val ? 'translateX(20px)' : 'translateX(0)';
}

function setMealIncluded(val) {
  document.getElementById('f-meal-included').value = val ? 'true' : 'false';
  document.getElementById('meal-included-track').style.background = val ? '#D97706' : '#e5e7eb';
  document.getElementById('meal-included-knob').style.transform = val ? 'translateX(20px)' : 'translateX(0)';
}

function setNatReq(val) {
  document.getElementById('f-nat-req').value = val;
  const _NR_STYLE = {
    any:               { bg:'#EFF6FF', color:'#1D4ED8', border:'#BFDBFE' },
    korean_only:       { bg:'#FFF1F2', color:'#9f1239', border:'#FECDD3' },
    korean_lang:       { bg:'#FFF7ED', color:'#B45309', border:'#FDE68A' },
    foreigner_welcome: { bg:'#F0FFF4', color:'#166534', border:'#86EFAC' },
  };
  ['any','korean_only','korean_lang','foreigner_welcome'].forEach(k => {
    const btn = document.getElementById('nreq-' + k);
    if (!btn) return;
    if (k === val) {
      const s = _NR_STYLE[k];
      btn.style.background = s.bg; btn.style.color = s.color; btn.style.borderColor = s.border;
    } else {
      btn.style.background = '#f9fafb'; btn.style.color = '#374151'; btn.style.borderColor = '#e5e7eb';
    }
  });
}

// ── 노쇼 보증금 토글 ─────────────────────────────────────
function setDeposit(val) {
  document.getElementById('f-deposit-on').value = val ? 'true' : 'false';
  document.getElementById('deposit-track').style.background = val ? '#C8102E' : '#ddd';
  document.getElementById('deposit-knob').style.left = val ? '22px' : '2px';
  document.getElementById('deposit-amount-row').style.display = val ? 'block' : 'none';
  if (val) {
    const cur = parseInt(document.getElementById('f-deposit-amount')?.value) || 0;
    if (!cur) setDepositAmount(10000);
  }
}
function setDepositAmount(amt) {
  document.querySelectorAll('.deposit-amt-btn').forEach(b => b.classList.toggle('active', parseInt(b.dataset.amt) === amt));
  document.getElementById('f-deposit-amount').value = amt;
}

// ── 재방문 인센티브 ───────────────────────────────────────
function toggleReturnBonus() {
  const cur = document.getElementById('f-return-bonus-on').value === 'true';
  setReturnBonusOn(!cur);
}
function setReturnBonusOn(val) {
  document.getElementById('f-return-bonus-on').value = val ? 'true' : 'false';
  document.getElementById('return-bonus-track').style.background = val ? '#D97706' : '#e5e7eb';
  document.getElementById('return-bonus-knob').style.transform = val ? 'translateX(20px)' : 'none';
  document.getElementById('return-bonus-row').style.display = val ? 'block' : 'none';
  if (val) {
    const cur = parseInt(document.getElementById('f-return-bonus')?.value) || 0;
    if (!cur) setReturnBonus(3000);
  }
}
function setReturnBonus(amt) {
  document.querySelectorAll('[id^="rb-btn-"]').forEach(b => {
    b.classList.toggle('active', b.id === `rb-btn-${amt}`);
  });
  document.getElementById('f-return-bonus').value = amt;
}

// ── 공고 복사 재등록 ──────────────────────────────────────
function copyPosting(jobId) {
  const p = postings.find(x => x.id === jobId);
  if (!p) return;
  editingId = null;
  document.getElementById('editing-id').value = '';
  document.getElementById('form-title').textContent = t('form_post_new') + ' (복사)';
  document.getElementById('submit-btn').textContent = t('form_submit_post');
  document.getElementById('f-title').value = p.title;
  document.getElementById('f-category').value = p.category;
  document.getElementById('f-wage').value = p.base_wage;
  document.getElementById('f-needed').value = p.needed_count;
  document.getElementById('f-desc').value = p.description || '';
  document.getElementById('f-lat').value = p.lat;
  document.getElementById('f-lng').value = p.lng;
  document.getElementById('f-address').value = '';
  if (p.start_time) {
    const s = new Date(p.start_time);
    setTimeSelects('start', s);
    const endMs = p.end_time ? new Date(p.end_time) : new Date(s.getTime() + (p.duration_hours || 4) * 3600000);
    setTimeSelects('end', endMs);
  }
  if (p.lat && p.lng) showMiniMap(p.lat, p.lng, p.address || '');
  // surge 초기화 (복사 시 surge는 off로)
  surgeOn = false;
  document.getElementById('f-surge-enabled').value = 'false';
  document.getElementById('surge-toggle').style.background = '#ddd';
  document.getElementById('surge-knob').style.left = '2px';
  document.getElementById('surge-settings').style.display = 'none';
  document.getElementById('surge-preview').textContent = '';
  setSameDay(p.same_day_payment || false);
  setAgeLimit(p.age_limit || false);
  setJobLangs(p.preferred_languages || []);
  const _rb2 = p.return_bonus || 0;
  setReturnBonusOn(_rb2 > 0);
  if (_rb2 > 0) setReturnBonus(_rb2);
  // 공고 유형(심부름/일반알바 등) 복사
  const jobType = p.work_type === 'errand' ? 'errand' : 'alba';
  setJobType(jobType);
  // 근무형태(스팟/단기/정기) 복사 — 심부름이 아닐 때만
  if (p.work_type && p.work_type !== 'errand') setWorkType(p.work_type);
  document.getElementById('location-result').style.display = 'none';
  document.getElementById('naver-url-status').style.display = 'none';
  document.getElementById('f-naver-url-input').value = '';
  renderMyPlacesQuick();
  document.getElementById('form-overlay').classList.add('open');
  const _fab = document.getElementById('posting-fab');
  if (_fab) _fab.style.display = 'none';
}

// ── 마감된 공고 재오픈 (날짜/상세정보 수정 후 재오픈) ──────────
// copyPosting()과 거의 동일하되, 새 공고를 만드는 게 아니라 같은 공고를 수정하는 것이라
// editingId를 채워서 편집모드로 열고, 주소는 지우지 않고 그대로 보여줌.
// submitPosting()은 서지업 아닐 때 항상 status:'open'으로 저장하므로 저장하면 자동 재오픈됨.
function reopenWithEdit(jobId) {
  const p = postings.find(x => x.id === jobId);
  if (!p) return;
  editingId = jobId;
  document.getElementById('editing-id').value = jobId;
  document.getElementById('form-title').textContent = '공고 재오픈 (내용 수정)';
  document.getElementById('submit-btn').textContent = '수정하고 재오픈';
  document.getElementById('f-title').value = p.title;
  document.getElementById('f-category').value = p.category;
  document.getElementById('f-wage').value = p.base_wage;
  document.getElementById('f-needed').value = p.needed_count;
  document.getElementById('f-desc').value = p.description || '';
  document.getElementById('f-lat').value = p.lat;
  document.getElementById('f-lng').value = p.lng;
  document.getElementById('f-address').value = p.address || '';
  if (p.start_time) {
    const s = new Date(p.start_time);
    setTimeSelects('start', s);
    const endMs = p.end_time ? new Date(p.end_time) : new Date(s.getTime() + (p.duration_hours || 4) * 3600000);
    setTimeSelects('end', endMs);
  }
  if (p.lat && p.lng) showMiniMap(p.lat, p.lng, p.address || '');
  surgeOn = false;
  document.getElementById('f-surge-enabled').value = 'false';
  document.getElementById('surge-toggle').style.background = '#ddd';
  document.getElementById('surge-knob').style.left = '2px';
  document.getElementById('surge-settings').style.display = 'none';
  document.getElementById('surge-preview').textContent = '';
  setSameDay(p.same_day_payment || false);
  setAgeLimit(p.age_limit || false);
  setJobLangs(p.preferred_languages || []);
  const _rb3 = p.return_bonus || 0;
  setReturnBonusOn(_rb3 > 0);
  if (_rb3 > 0) setReturnBonus(_rb3);
  const jobType = p.work_type === 'errand' ? 'errand' : 'alba';
  setJobType(jobType);
  if (p.work_type && p.work_type !== 'errand') setWorkType(p.work_type);
  document.getElementById('location-result').style.display = 'none';
  document.getElementById('naver-url-status').style.display = 'none';
  document.getElementById('f-naver-url-input').value = '';
  renderMyPlacesQuick();
  document.getElementById('form-overlay').classList.add('open');
  const _fab2 = document.getElementById('posting-fab');
  if (_fab2) _fab2.style.display = 'none';
}

function updateSurgePreview() {
  const wage     = parseInt(document.getElementById('f-wage').value) || 0;
  const max      = parseInt(document.getElementById('f-surge-max').value) || 0;
  const amount   = parseInt(document.getElementById('f-surge-amount').value) || 1000;
  const interval = parseInt(document.getElementById('f-surge-interval').value) || 30;
  if (!wage) return;
  const steps    = max ? Math.floor((max - wage) / amount) : 3;
  const maxWage  = max || wage + amount * 3;
  document.getElementById('surge-preview').textContent =
    `${interval}분마다 +${amount.toLocaleString()}원 → 최대 ${maxWage.toLocaleString()}원 (최대 ${steps}회 인상)`;
}

// ── Realtime ──────────────────────────────────────────────
// ── 만료 공고 자동 마감 ───────────────────────────────────
async function autoCloseExpiredPostings() {
  if (!bizRecord) return;
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date();

  // 1) work_end_date 기준: 종료일 지난 공고
  await db.from('job_postings')
    .update({ status: 'closed' })
    .eq('business_id', bizRecord.id)
    .in('status', ['open', 'urgent'])
    .not('work_end_date', 'is', null)
    .lt('work_end_date', today);

  // 2) start_time + duration_hours 기준: 단건 공고(work_end_date 없음)가 끝난 경우
  const { data: oneshots } = await db.from('job_postings')
    .select('id, start_time, duration_hours')
    .eq('business_id', bizRecord.id)
    .in('status', ['open', 'urgent'])
    .is('work_end_date', null)
    .not('start_time', 'is', null);
  if (oneshots?.length) {
    const expiredIds = oneshots
      .filter(p => {
        if (!p.start_time) return false;
        const end = new Date(p.start_time);
        end.setHours(end.getHours() + (p.duration_hours || 0));
        return end < now;
      })
      .map(p => p.id);
    if (expiredIds.length) {
      await db.from('job_postings')
        .update({ status: 'closed' })
        .in('id', expiredIds);
    }
  }
}

function setupRealtime() {
  db.channel('owner-updates')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'applications' }, () => {
      showToast('\u{1F514} 새 지원자가 있습니다!');
      loadApplicants();
      loadPostings();
      updateOwnerNotiBadge();
    })
    .subscribe();

  // 메시지 알림 구독 (내 공고의 지원자들로부터 온 메시지)
  setupOwnerChatNotify();
}

async function setupOwnerChatNotify() {
  if (!bizRecord) return;
  // 내 공고의 application_id 목록 수집
  const myJobIds = postings.map(p => p.id);
  if (!myJobIds.length) return;

  const { data: apps } = await db.from('applications')
    .select('id').in('job_posting_id', myJobIds);
  if (!apps || !apps.length) return;

  const myAppIds = new Set(apps.map(a => a.id));

  // 초기 안읽은 메시지 수 → nav 뱃지 반영
  const { data: unreadMsgs } = await db.from('messages')
    .select('id').in('application_id', [...myAppIds])
    .eq('is_read', false).neq('sender_id', currentUser.id);
  const initUnread = unreadMsgs?.length || 0;
  const msgBadge = document.getElementById('owner-msg-badge');
  if (msgBadge && initUnread > 0) {
    msgBadge.textContent = initUnread; msgBadge.style.display = 'flex';
  }

  db.channel('owner-msg-notify')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
      const msg = payload.new;
      if (!myAppIds.has(msg.application_id)) return;
      if (msg.sender_id === currentUser?.id) return;

      // 채팅창 열려있으면 건너뜀
      const chatOpen = document.getElementById('chat-overlay')?.style.display === 'flex';
      if (chatOpen) return;

      showToast('\u{1F4AC} 새 메시지: ' + msg.content.slice(0, 20) + (msg.content.length > 20 ? '…' : ''));

      // 채팅 탭 nav badge 업데이트
      const badge = document.getElementById('owner-msg-badge');
      const cnt = parseInt(badge.textContent || '0') + 1;
      badge.textContent = cnt;
      badge.style.display = 'flex';
    })
    .subscribe();
}

// ── 채팅 아바타 색상 ──────────────────────────────────────
// ── 업주 채팅 목록 ────────────────────────────────────────
async function loadOwnerChatList() {
  const el = document.getElementById('owner-chats-list');
  el.innerHTML = '<div style="text-align:center;padding:32px"><div class="spinner"></div></div>';
  if (!bizRecord) return;

  const { data: myJobs } = await db.from('job_postings').select('id').eq('business_id', bizRecord.id);
  const jobIds = (myJobs || []).map(j => j.id);
  if (!jobIds.length) {
    el.innerHTML = '<div style="text-align:center;padding:48px 20px;color:#aaa"><div style="font-weight:700">등록한 공고가 없어요</div></div>';
    return;
  }

  const { data: apps } = await db.from('applications')
    .select('id, status, workers(name, phone, photo_url), job_postings(title)')
    .in('job_posting_id', jobIds);

  if (!apps?.length) {
    el.innerHTML = '<div style="text-align:center;padding:48px 20px;color:#aaa"><div style="font-size:40px;margin-bottom:12px">\u{1F4AC}</div><div style="font-weight:700">아직 대화가 없어요</div></div>';
    return;
  }

  const appIds = apps.map(a => a.id);
  const { data: msgs } = await db.from('messages')
    .select('*').in('application_id', appIds)
    .order('created_at', { ascending: false });

  const latestMsg = {}, unreadCnt = {};
  (msgs || []).forEach(m => {
    if (!latestMsg[m.application_id]) latestMsg[m.application_id] = m;
    if (!m.is_read && m.sender_id !== currentUser.id)
      unreadCnt[m.application_id] = (unreadCnt[m.application_id] || 0) + 1;
  });

  // nav 뱃지 업데이트
  const totalUnread = Object.values(unreadCnt).reduce((s, n) => s + n, 0);
  const msgBadge = document.getElementById('owner-msg-badge');
  if (msgBadge) {
    if (totalUnread > 0) { msgBadge.textContent = totalUnread; msgBadge.style.display = 'flex'; }
    else { msgBadge.textContent = '0'; msgBadge.style.display = 'none'; }
  }

  const chats = apps.filter(a => latestMsg[a.id]);
  if (!chats.length) {
    el.innerHTML = '<div style="text-align:center;padding:48px 20px;color:#aaa"><div style="font-weight:700">아직 대화가 없어요</div><div style="font-size:13px;margin-top:6px">채팅을 시작해보세요</div></div>';
    return;
  }

  el.innerHTML = chats.map(a => {
    const msg = latestMsg[a.id];
    const unread = unreadCnt[a.id] || 0;
    const isMine = msg.sender_id === currentUser.id;
    const time = new Date(msg.created_at).toLocaleTimeString('ko-KR', { hour:'2-digit', minute:'2-digit' });
    const workerName = a.workers?.name || a.job_postings?.title || '지원자';
    const wac = avatarColor(workerName);
    const photoUrl = a.workers?.photo_url;
    const avatarHtml = photoUrl
      ? `<img src="${photoUrl}" style="width:44px;height:44px;border-radius:12px;object-fit:cover;flex-shrink:0">`
      : `<div style="width:44px;height:44px;border-radius:12px;background:${wac.bg};display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:900;color:${wac.fg};flex-shrink:0">${workerName.charAt(0)}</div>`;
    return `
    <div onclick="openChat('${a.id}','${workerName}')" style="background:#fff;border-radius:16px;padding:14px 16px;margin-bottom:8px;box-shadow:0 1px 6px rgba(0,0,0,0.05);cursor:pointer;display:flex;align-items:center;gap:12px">
      ${avatarHtml}
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:3px">
          <div style="font-size:14px;font-weight:800;color:#222">${workerName}</div>
          <div style="font-size:11px;color:#bbb">${time}</div>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
          <div style="font-size:13px;color:#888;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${isMine ? '나: ' : ''}${msg.content?.startsWith('[img]') ? '\u{1F4F7} 사진' : msg.content}</div>
          ${unread > 0 ? `<div style="min-width:18px;height:18px;background:var(--red);color:#fff;border-radius:9px;font-size:10px;font-weight:900;display:flex;align-items:center;justify-content:center;padding:0 4px;flex-shrink:0">${unread}</div>` : ''}
        </div>
        <div style="font-size:11px;color:#7C3AED;font-weight:600;margin-top:2px">${a.job_postings?.title || ''}</div>
      </div>
    </div>`;
  }).join('');
}

// ── 유틸 ──────────────────────────────────────────────────
function ownerSwitchTab(name, btn) {
  if (name === 'settings') { openOwnerSettings(); return; }
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  if (btn) btn.classList.add('active');
  document.getElementById('tab-' + name).classList.add('active');
  if (name === 'applicants' && bizRecord) loadApplicants();
  if (name === 'staff' && bizRecord) loadStaffPanel();
}

function ownerSetNav(el, tab) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  el.classList.add('active');
  sessionStorage.setItem('ownerActiveTab', tab);

  // 모든 패널 숨기기
  document.getElementById('panel-owner-chats').classList.remove('show');
  document.getElementById('panel-owner-map').classList.remove('show');
  document.getElementById('panel-owner-settings').classList.remove('show');
  document.getElementById('panel-posting-detail').classList.remove('show');
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));

  const locFab = document.getElementById('owner-loc-fab');
  if (tab === 'map') {
    document.getElementById('panel-owner-map').classList.add('show');
    if (locFab) locFab.style.display = 'flex';
    initOwnerMap();
  } else if (tab === 'postings') {
    if (locFab) locFab.style.display = 'none';
    ownerSwitchTab('postings', document.querySelectorAll('.tab-btn')[0]);
  } else if (tab === 'applicants') {
    const badge = document.getElementById('owner-chat-badge');
    badge.textContent = '0'; badge.style.display = 'none';
    ownerSwitchTab('applicants', document.querySelectorAll('.tab-btn')[1]);
  } else if (tab === 'chats') {
    document.getElementById('panel-owner-chats').classList.add('show');
    const msgBadge = document.getElementById('owner-msg-badge');
    if (msgBadge) { msgBadge.textContent = '0'; msgBadge.style.display = 'none'; }
    loadOwnerChatList();
  } else if (tab === 'settings') {
    openOwnerSettings();
  }
}

// ── 채팅 ───────────────────────────────────────────────────
let _chatAppId = null, _chatInquiryId = null, _chatSub = null, _chatWorkerUserId = null, _chatWorkerName = '';

// ── 지도 탭 (업주용 주변 공고 조회) ──────────────────────
let _ownerMap = null, _ownerOverlays = [], _ownerWorkerOverlays = [], _ownerMapDragBound = false, _ownerLocOverlay = null;
let _ownerMapCat = '', _ownerMapWorkType = '', _ownerMapUrgentOnly = false;
let _ownerRadius = 10000, _ownerMapMode = 'jobs';
let _ownerSheetState = 'peek', _ownerMapJobs = [];
let _ownerDdayOnly = false, _ownerSortMode = 'dist';
const _OWNER_SORT_CYCLE = ['dist','wage_desc','wage_asc','date_asc','date_desc'];
const _OWNER_SORT_LABEL = { dist:'거리순', wage_desc:'시급↑', wage_asc:'시급↓', date_asc:'시작빠른순', date_desc:'시작느린순' };

function initOwnerMap() {
  if (_ownerMap) { loadOwnerMapJobs(); return; }
  setTimeout(() => {
    const container = document.getElementById('owner-map-container');
    const center = bizRecord?.lat
      ? new kakao.maps.LatLng(bizRecord.lat, bizRecord.lng)
      : new kakao.maps.LatLng(APP_CONFIG.DEFAULT_LAT, APP_CONFIG.DEFAULT_LNG);
    _ownerMap = new kakao.maps.Map(container, { center, level: 5 });
    const rb = document.getElementById('owner-radius-badge');
    if (rb) rb.style.display = 'block';
    setupOwnerSheet();
    loadOwnerMapJobs();
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(pos => {
        const latlng = new kakao.maps.LatLng(pos.coords.latitude, pos.coords.longitude);
        _ownerMap.setCenter(latlng);
        setOwnerLocationMarker(latlng);
        loadOwnerMapJobs();
      }, () => {});
    }
  }, 100);
}

async function loadOwnerMapJobs() {
  if (!_ownerMap) return;
  const center = _ownerMap.getCenter();
  const { data, error: mapErr } = await db.rpc('nearby_jobs', {
    user_lat: center.getLat(), user_lng: center.getLng(),
    radius_meters: _ownerRadius
  });
  if (mapErr) { console.error('[ownerMap] nearby_jobs error:', mapErr); }

  const ERRAND_ICON_MAP = {
    '물건 픽업/전달':'\u{1F4E6}','대리 줄서기':'\u{1F9CD}','서류/우편':'\u{1F4EE}','쇼핑 대행':'\u{1F6D2}',
    '벌레 퇴치':'\u{1FAB2}','반려동물 산책':'\u{1F415}','이사/짐 보조':'\u{1F69A}','음식 배달':'\u{1F371}',
    '차량 이동/주차':'\u{1F697}','약국/병원 대행':'\u{1F48A}','장보기 대행':'\u{1F96C}','기타 심부름':'\u{1F3C3}'
  };
  const ERRAND_CATS = new Set(Object.keys(ERRAND_ICON_MAP));

  (_ownerOverlays || []).forEach(o => o.setMap(null));
  _ownerOverlays = [];

  let jobs = data || [];
  // D-DAY 필터
  if (_ownerDdayOnly) {
    const ts = new Date().toISOString().slice(0, 10);
    jobs = jobs.filter(j => j.start_time && j.start_time.slice(0, 10) === ts);
  }
  // 카테고리/워크타입 필터
  if (_ownerMapWorkType === 'errand')        jobs = jobs.filter(j => j.work_type === 'errand' || ERRAND_CATS.has(j.category));
  else if (_ownerMapWorkType === 'regular')  jobs = jobs.filter(j => j.work_type === 'regular');
  else if (_ownerMapWorkType === 'short')    jobs = jobs.filter(j => j.work_type === 'short');
  else if (_ownerMapWorkType === 'spot')     jobs = jobs.filter(j => !j.work_type || j.work_type === 'spot');
  if (_ownerMapUrgentOnly) jobs = jobs.filter(j => j.status === 'urgent');
  // 정렬
  if      (_ownerSortMode === 'wage_desc') jobs.sort((a,b) => b.current_wage - a.current_wage);
  else if (_ownerSortMode === 'wage_asc')  jobs.sort((a,b) => a.current_wage - b.current_wage);
  else if (_ownerSortMode === 'date_asc')  jobs.sort((a,b) => (a.start_time||'').localeCompare(b.start_time||''));
  else if (_ownerSortMode === 'date_desc') jobs.sort((a,b) => (b.start_time||'').localeCompare(a.start_time||''));

  const CAT_SHORT_O = {
    'F&B':'F&B', '물류':'운송', '판매':'판매', '청소':'청소', '이벤트':'이벤트',
    '이사도우미':'이사', '컨텐츠':'촬영', '물건 픽업/전달':'픽업', '대리 줄서기':'줄서기',
    '벌레 퇴치':'벌레', '반려동물 산책':'펫돌봄', '음식 배달':'배달',
  };

  jobs.forEach(job => {
    const isUrgent = job.status === 'urgent';
    const isErrand = job.work_type === 'errand' || ERRAND_CATS.has(job.category);
    const wageStr  = (job.current_wage / 10000).toFixed(1) + '만';
    const wageUnit = isErrand ? '/건' : '/시간';
    const catName  = CAT_SHORT_O[job.category] || (isErrand ? '심부름' : (job.category || '알바'));
    const catShort = catName.length > 5 ? catName.slice(0,5) : catName;

    const bubbleCls = isErrand ? 'mk-errand' : (isUrgent ? 'mk-asap' : (job.work_type === 'regular' ? 'mk-regular' : (job.work_type === 'short' ? 'mk-short' : '')));
    const tailCls   = isErrand ? 'mk-errand' : (job.work_type === 'regular' ? 'mk-regular' : (job.work_type === 'short' ? 'mk-short' : ''));
    const { str: ddayStr, cls: ddayCls } = calcOwnerDDay(job.start_time);
    const _OT_CLS = { regular:'mt-reg', short:'mt-short', errand:'mt-errnd' };
    const _OT_CHR = { regular:'정', short:'단', errand:'심' };
    const mkTypeCls = _OT_CLS[job.work_type] || 'mt-spot';
    const mkTypeChr = _OT_CHR[job.work_type] || '스';

    const content = `
      <div class="marker-wrap" onclick="ownerMapInfo('${job.id}')">
        <div class="marker-bubble ${bubbleCls}">
          <div class="mk-row1">
            <span class="mk-type ${mkTypeCls}">${mkTypeChr}</span>
            <span class="mk-cat">${catShort}</span>
            ${ddayStr ? `<span class="mk-dday ${ddayCls}">${ddayStr}</span>` : ''}
          </div>
          <span class="mk-wage">${wageStr}<span class="mk-unit">${wageUnit}</span></span>
        </div>
        <div class="marker-tail ${tailCls}"></div>
      </div>`;

    const overlay = new kakao.maps.CustomOverlay({
      position: new kakao.maps.LatLng(job.lat, job.lng),
      content, yAnchor: 1.1
    });
    overlay.setMap(_ownerMap);
    _ownerOverlays.push(overlay);
  });

  _ownerMapJobs = jobs;
  renderOwnerSheetJobs(jobs);
  const _cntEl = document.getElementById('owner-sheet-count');
  if (_cntEl) _cntEl.innerHTML = `주변 공고 <span>${jobs.length}</span>개`;

  if (!_ownerMapDragBound) {
    kakao.maps.event.addListener(_ownerMap, 'dragend', loadOwnerMapJobs);
    _ownerMapDragBound = true;
  }
}

function calcOwnerDDay(st) {
  if (!st) return { str:'', cls:'' };
  const today = new Date(); today.setHours(0,0,0,0);
  const d = new Date(st); d.setHours(0,0,0,0);
  const diff = Math.round((d - today) / 86400000);
  if (diff < 0)   return { str:t('status_ongoing'), cls:'dd-later' };
  if (diff === 0) return { str:'D-DAY',  cls:'dd-today' };
  if (diff <= 3)  return { str:`D-${diff}`, cls:'dd-soon' };
  return { str:`D-${diff}`, cls:'dd-later' };
}

function toggleOwnerDday(el) {
  _ownerDdayOnly = !_ownerDdayOnly;
  el.classList.toggle('active', _ownerDdayOnly);
  loadOwnerMapJobs();
}

function setOwnerWorkType(el, wt) {
  ['owner-chip-regular','owner-chip-short','owner-chip-spot'].forEach(id => document.getElementById(id)?.classList.remove('active'));
  if (_ownerMapWorkType === wt) { _ownerMapWorkType = ''; }
  else { _ownerMapWorkType = wt; el.classList.add('active'); }
  loadOwnerMapJobs();
}

function cycleOwnerSort(el) {
  const idx = _OWNER_SORT_CYCLE.indexOf(_ownerSortMode);
  _ownerSortMode = _OWNER_SORT_CYCLE[(idx + 1) % _OWNER_SORT_CYCLE.length];
  const label = _OWNER_SORT_LABEL[_ownerSortMode];
  if (el) { el.textContent = label; el.classList.toggle('active', _ownerSortMode !== 'dist'); }
  const sheetLbl = document.getElementById('owner-sort-sheet-label');
  if (sheetLbl) sheetLbl.textContent = '↕ ' + label;
  loadOwnerMapJobs();
}

function setOwnerMapFilter(el, cat, workType) {
  document.querySelectorAll('.om-chip:not([data-urgent]):not(#owner-chip-dday):not(#owner-chip-regular):not(#owner-chip-short):not(#owner-chip-spot):not(#owner-sort-btn)').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  _ownerMapCat = cat;
  if (!workType) { _ownerMapWorkType = ''; ['owner-chip-regular','owner-chip-short','owner-chip-spot'].forEach(id => document.getElementById(id)?.classList.remove('active')); }
  else _ownerMapWorkType = workType;
  loadOwnerMapJobs();
}

function setOwnerMapUrgent(el) {
  _ownerMapUrgentOnly = !_ownerMapUrgentOnly;
  el.classList.toggle('active', _ownerMapUrgentOnly);
  loadOwnerMapJobs();
}

function setOwnerMapMode(mode) {
  _ownerMapMode = mode;
  const tabJobs    = document.getElementById('map-tab-jobs');
  const tabWorkers = document.getElementById('map-tab-workers');
  const jobsUI     = document.getElementById('map-mode-jobs-ui');
  const btPanel    = document.getElementById('barotouip-panel');
  const sheetCount = document.getElementById('owner-sheet-count');
  const sheetList  = document.getElementById('owner-sheet-list');
  const radiusBadge = document.getElementById('owner-radius-badge');
  const radiusPopup = document.getElementById('owner-radius-popup');
  if (mode === 'jobs') {
    tabJobs.style.background    = '#C8102E'; tabJobs.style.color    = '#fff';
    tabWorkers.style.background = '#fff';     tabWorkers.style.color = '#888';
    if (jobsUI)  jobsUI.style.display  = 'flex';
    if (btPanel) btPanel.style.display = 'none';
    if (sheetCount) sheetCount.innerHTML = '주변 공고 <span>0</span>개';
    if (sheetList) sheetList.innerHTML = '';
    if (radiusBadge) radiusBadge.style.display = 'block';
    (_ownerWorkerOverlays || []).forEach(o => o.setMap(null));
    _ownerWorkerOverlays = [];
    loadOwnerMapJobs();
  } else {
    tabJobs.style.background    = '#fff';     tabJobs.style.color    = '#888';
    tabWorkers.style.background = '#C8102E'; tabWorkers.style.color = '#fff';
    if (jobsUI)  jobsUI.style.display  = 'none';
    if (radiusBadge) radiusBadge.style.display = 'none';
    if (radiusPopup) radiusPopup.style.display = 'none';
    if (sheetCount) sheetCount.innerHTML = '바로출근 가능 <span>0</span>명';
    if (sheetList) sheetList.innerHTML = '';
    (_ownerOverlays || []).forEach(o => o.setMap(null));
    _ownerOverlays = [];
    loadBarotouipList();
  }
}

function toggleOwnerRadiusPopup() {
  const p = document.getElementById('owner-radius-popup');
  if (p) p.style.display = p.style.display === 'none' ? 'block' : 'none';
}

function setOwnerRadius(meters) {
  _ownerRadius = meters;
  const km = Math.round(meters / 1000);
  const txt = document.getElementById('owner-radius-txt');
  if (txt) txt.textContent = km + 'km';
  document.getElementById('owner-radius-popup').style.display = 'none';
  loadOwnerMapJobs();
}

async function loadBarotouipList() {
  const countEl = document.getElementById('barotouip-count');
  const btPanel = document.getElementById('barotouip-panel');

  // clear existing worker overlays
  (_ownerWorkerOverlays || []).forEach(o => o.setMap(null));
  _ownerWorkerOverlays = [];

  // query workers available now with location data
  const { data: workers, error } = await db.from('workers')
    .select('id, kakao_uid, name, photo_url, rating, review_count, phone, skills, languages, region, activity_lat, activity_lng, activity_area')
    .eq('is_available_now', true)
    .not('activity_lat', 'is', null)
    .not('activity_lng', 'is', null)
    .not('name', 'is', null)
    .limit(80);

  const list = error ? [] : (workers || []).filter(w => w.activity_lat && w.activity_lng);

  if (countEl) countEl.textContent = '바로출근 ' + list.length + '명';

  if (btPanel) btPanel.style.display = 'none';

  if (!list.length) {
    const sheetList = document.getElementById('owner-sheet-list');
    if (sheetList) sheetList.innerHTML = '<div style="text-align:center;padding:32px;color:#aaa"><div style="font-size:13px;margin-bottom:6px">현재 바로출근 가능한 알바생이 없습니다</div><div style="font-size:11px;color:#bbb">알바생이 마이페이지에서 바로출근 버튼을 켜면<br>이 화면에 마커로 표시됩니다</div></div>';
    return;
  }

  const personSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#bbb" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
  list.forEach(w => {
    const avatar = w.photo_url
      ? `<img src="${w.photo_url}" style="width:100%;height:100%;object-fit:cover;pointer-events:none">`
      : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#f4f4f4;pointer-events:none">${personSvg}</div>`;
    const nameShort = (w.name || '').substring(0, 4);
    const ratingStr = w.rating ? `★${parseFloat(w.rating).toFixed(1)}` : '';
    const content = `<div style="text-align:center;cursor:pointer" onclick="showBarotouipContact('${w.kakao_uid}','${(w.name||'').replace(/'/g,"\\'")}','${w.phone||''}')">
      <div style="width:46px;height:46px;border-radius:50%;border:2.5px solid #C8102E;overflow:hidden;box-shadow:0 2px 10px rgba(200,16,46,0.4)">${avatar}</div>
      <div style="margin-top:3px;background:rgba(0,0,0,0.72);color:#fff;font-size:9px;font-weight:800;padding:1px 5px;border-radius:4px;max-width:52px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${nameShort}${ratingStr ? ' '+ratingStr : ''}</div>
    </div>`;
    const overlay = new kakao.maps.CustomOverlay({
      position: new kakao.maps.LatLng(w.activity_lat, w.activity_lng),
      content, yAnchor: 1.1, zIndex: 5
    });
    overlay.setMap(_ownerMap);
    _ownerWorkerOverlays.push(overlay);
  });

  const _wCntEl = document.getElementById('owner-sheet-count');
  if (_wCntEl) _wCntEl.innerHTML = `주변 알바생 <span>${list.length}</span>명`;
}

function showBarotouipContact(kakaoUid, name, phone) {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:flex-end';
  el.onclick = e => { if (e.target === el) el.remove(); };
  el.innerHTML = `
    <div style="background:#fff;border-radius:24px 24px 0 0;width:100%;padding:24px 20px 40px">
      <div style="width:36px;height:4px;background:#eee;border-radius:2px;margin:0 auto 18px"></div>
      <div style="font-size:17px;font-weight:900;color:#222;margin-bottom:4px">&#128100; ${name}님에게 연락</div>
      <div style="font-size:13px;color:#888;margin-bottom:18px">직접 연락하거나 스카우트 제안을 보내세요</div>
      <button onclick="showScoutModal('${kakaoUid}','${name.replace(/'/g,"\\'")}');this.closest('div[style*=fixed]').remove()" style="width:100%;padding:14px;background:linear-gradient(135deg,#C8102E,#e53935);color:#fff;border:none;border-radius:14px;font-size:15px;font-weight:800;cursor:pointer;margin-bottom:10px">\u{1F3AF} 스카우트 제안 보내기</button>
      ${phone ? `<button onclick="window.location.href='tel:${phone}'" style="width:100%;padding:14px;background:#16a34a;color:#fff;border:none;border-radius:14px;font-size:15px;font-weight:800;cursor:pointer;margin-bottom:10px">&#128222; 전화하기 (${phone})</button>` : `<div style="padding:14px;background:#f8f8f8;border-radius:14px;font-size:13px;color:#aaa;text-align:center;margin-bottom:10px">연락처 미공개</div>`}
      <button onclick="this.closest('div[style*=fixed]').remove()" style="width:100%;padding:13px;background:#f0f0f0;color:#555;border:none;border-radius:14px;font-size:14px;font-weight:700;cursor:pointer">닫기</button>
    </div>`;
  document.body.appendChild(el);
}

function showScoutModal(workerKakaoUid, workerName) {
  const activePostings = (postings || []).filter(p => p.status === 'open' || p.status === 'urgent');
  const postingOptions = activePostings.length
    ? activePostings.map(p => `<option value="${p.id}">${p.title}</option>`).join('')
    : '<option value="">등록된 공고 없음</option>';

  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:10000;display:flex;align-items:flex-end';
  el.onclick = e => { if (e.target === el) el.remove(); };
  el.innerHTML = `
    <div style="background:#fff;border-radius:24px 24px 0 0;width:100%;padding:24px 20px 40px">
      <div style="width:36px;height:4px;background:#eee;border-radius:2px;margin:0 auto 16px"></div>
      <div style="font-size:17px;font-weight:900;color:#222;margin-bottom:4px">\u{1F3AF} ${workerName}님께 스카우트 제안</div>
      <div style="font-size:13px;color:#888;margin-bottom:16px">공고를 선택하면 알림이 전송됩니다</div>
      ${activePostings.length ? `
      <select id="scout-posting-select" style="width:100%;padding:12px;border:1.5px solid #eee;border-radius:12px;font-size:14px;font-weight:700;margin-bottom:12px;outline:none;background:#fff">
        ${postingOptions}
      </select>` : `<div style="padding:12px;background:#fff5f5;border-radius:12px;color:#C8102E;font-size:13px;font-weight:700;margin-bottom:12px;text-align:center">먼저 공고를 등록해주세요</div>`}
      <textarea id="scout-msg-text" placeholder="추가 메시지 (선택)" style="width:100%;padding:12px;border:1.5px solid #eee;border-radius:12px;font-size:13px;resize:none;height:72px;box-sizing:border-box;margin-bottom:12px;outline:none;font-family:inherit"></textarea>
      ${activePostings.length ? `<button onclick="sendScoutProposal('${workerKakaoUid}','${workerName.replace(/'/g,"\\'")}',this)" style="width:100%;padding:14px;background:#C8102E;color:#fff;border:none;border-radius:14px;font-size:15px;font-weight:800;cursor:pointer;margin-bottom:10px">\u{1F4E8} 제안 보내기</button>` : ''}
      <button onclick="this.closest('div[style*=fixed]').remove()" style="width:100%;padding:13px;background:#f0f0f0;color:#555;border:none;border-radius:14px;font-size:14px;font-weight:700;cursor:pointer">취소</button>
    </div>`;
  document.body.appendChild(el);
}

async function sendScoutProposal(workerKakaoUid, workerName, btn) {
  const sel = document.getElementById('scout-posting-select');
  const extraMsg = (document.getElementById('scout-msg-text')?.value || '').trim();
  const postingId = sel?.value;
  const posting = (postings || []).find(p => p.id === postingId);
  if (!posting) { showToast('공고를 선택해주세요'); return; }

  const biz = (businesses || []).find(b => b.owner_id === currentUser?.id);
  const bizName = biz?.name || '업체';
  const title = `\u{1F3AF} ${bizName}에서 스카우트 제안이 왔어요!`;
  const body = `"${posting.title}" · ${posting.current_wage?.toLocaleString()}원/시간${extraMsg ? '\n' + extraMsg : ''}`;

  btn.disabled = true; btn.textContent = '전송 중...';
  try {
    const res = await fetch('/api/send-push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: workerKakaoUid, title, body, url: '/바로알바.html' })
    });
    btn.closest('div[style*=fixed]')?.remove();
    showToast('✅ 스카우트 제안을 보냈습니다!');
  } catch(e) {
    btn.disabled = false; btn.textContent = '\u{1F4E8} 제안 보내기';
    showToast('전송 실패: ' + e.message);
  }
}

async function searchOwnerLocation(q) {
  if (!q) return;
  try {
    const res  = await fetch(`/api/naver-search?query=${encodeURIComponent(q)}`);
    const data = await res.json();
    if (!res.ok || !data.items?.length) { showToast('검색 결과가 없어요'); return; }
    const first = data.items[0];
    _ownerMap.setCenter(new kakao.maps.LatLng(first.lat, first.lng));
    _ownerMap.setLevel(5);
    showToast(`\u{1F4CD} ${first.title} 근처로 이동`);
    document.getElementById('owner-map-search').blur();
    loadOwnerMapJobs();
  } catch(e) {
    showToast('검색 중 오류가 발생했어요');
  }
}

function setOwnerLocationMarker(latlng) {
  if (_ownerLocOverlay) { _ownerLocOverlay.setMap(null); _ownerLocOverlay = null; }
  const wrap = document.createElement('div');
  wrap.style.cssText = 'width:26px;height:35px;display:flex;align-items:center;justify-content:center';
  const img = document.createElement('img');
  img.src = './icons/marker-logo.png';
  img.style.cssText = 'width:26px;height:35px;object-fit:contain;pointer-events:none';
  wrap.appendChild(img);
  _ownerLocOverlay = new kakao.maps.CustomOverlay({ position: latlng, content: wrap, yAnchor: 0.5, zIndex: 10 });
  _ownerLocOverlay.setMap(_ownerMap);
}

function ownerMapMyLocation() {
  if (!navigator.geolocation) { showToast('위치 정보를 사용할 수 없습니다'); return; }
  navigator.geolocation.getCurrentPosition(pos => {
    const latlng = new kakao.maps.LatLng(pos.coords.latitude, pos.coords.longitude);
    _ownerMap.setCenter(latlng);
    setOwnerLocationMarker(latlng);
    loadOwnerMapJobs();
  }, () => showToast('위치 권한이 필요합니다'));
}

// ── 업주 지도 바텀시트 (워커 맵 setupSheet 동일 구조) ──────
function setOwnerSheetState(state) {
  const sheet = document.getElementById('owner-bottom-sheet');
  if (!sheet) return;
  const T = { peek: 'translateY(calc(100% - 56px))', half: 'translateY(30%)', full: 'translateY(0)' };
  sheet.style.transform = T[state] || T.peek;
  _ownerSheetState = state;
}

function setupOwnerSheet() {
  const sheet    = document.getElementById('owner-bottom-sheet');
  const handleArea = document.getElementById('owner-sheet-handle-area');
  const summary  = document.getElementById('owner-sheet-summary');
  if (!sheet || !handleArea) return;
  const dragEls = [handleArea, summary].filter(Boolean);
  let startY = 0, isDragging = false;

  function onStart(y) { startY = y; isDragging = true; sheet.style.transition = 'none'; }
  function onMove(y) {
    if (!isDragging) return;
    const dy = y - startY;
    const order = ['peek','half','full'];
    const idx = order.indexOf(_ownerSheetState);
    const base = _ownerSheetState === 'peek' ? '100% - 56px' : _ownerSheetState === 'half' ? '30%' : '0%';
    if ((dy < 0 && idx < 2) || (dy > 0 && idx > 0)) {
      sheet.style.transform = `translateY(calc(${base} + ${dy}px))`;
    }
  }
  function onEnd(y) {
    if (!isDragging) return;
    isDragging = false;
    sheet.style.transition = '';
    sheet.style.transform = '';
    const dy = y - startY;
    const THRESHOLD = 30;
    const order = ['peek','half','full'];
    const idx = order.indexOf(_ownerSheetState);
    if (dy < -THRESHOLD && idx < 2) setOwnerSheetState(order[idx + 1]);
    else if (dy > THRESHOLD && idx > 0) setOwnerSheetState(order[idx - 1]);
    else setOwnerSheetState(_ownerSheetState);
  }
  dragEls.forEach(el => {
    el.addEventListener('touchstart', e => onStart(e.touches[0].clientY), { passive: true });
    el.addEventListener('touchmove', e => { e.preventDefault(); e.stopPropagation(); onMove(e.touches[0].clientY); }, { passive: false });
    el.addEventListener('touchend', e => onEnd(e.changedTouches[0].clientY), { passive: true });
    el.addEventListener('mousedown', e => onStart(e.clientY));
    window.addEventListener('mousemove', e => { if (isDragging) onMove(e.clientY); });
    window.addEventListener('mouseup',   e => { if (isDragging) onEnd(e.clientY); });
    el.addEventListener('click', e => {
      if (Math.abs(startY - e.clientY) > 5) return;
      const order = ['peek','half','full'];
      setOwnerSheetState(order[(order.indexOf(_ownerSheetState) + 1) % 3]);
    });
  });
}

function renderOwnerSheetJobs(jobs) {
  const list = document.getElementById('owner-sheet-list');
  if (!list) return;
  if (!jobs.length) {
    list.innerHTML = '<div style="text-align:center;padding:32px;color:#aaa;font-size:13px">주변에 공고가 없습니다</div>';
    return;
  }
  const ERRAND_CATS = new Set(['물건 픽업/전달','대리 줄서기','서류/우편','쇼핑 대행','벌레 퇴치','반려동물 산책','이사/짐 보조','음식 배달','차량 이동/주차','약국/병원 대행','장보기 대행','기타 심부름']);
  list.innerHTML = jobs.map(j => {
    const isUrgent = j.status === 'urgent';
    const isErrand = j.work_type === 'errand' || ERRAND_CATS.has(j.category);
    const wage = (j.current_wage / 10000).toFixed(1) + '만/' + (isErrand ? '건' : '시간');
    const dist = j.distance_m < 1000 ? Math.round(j.distance_m) + 'm' : (j.distance_m / 1000).toFixed(1) + 'km';
    return `<div onclick="ownerMapInfo('${j.id}')" style="background:#fff;border:1px solid #f0f0f0;border-radius:14px;padding:12px 14px;margin-bottom:8px;cursor:pointer">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
        <span style="font-size:10px;font-weight:700;color:#888;background:#f5f5f5;padding:2px 7px;border-radius:6px">${j.category || ''}</span>
        ${isUrgent ? '<span style="font-size:10px;font-weight:800;color:#fff;background:#C8102E;padding:2px 6px;border-radius:6px">🔥 급구</span>' : ''}
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div>
          <div style="font-size:14px;font-weight:800;color:#111">${j.title || ''}</div>
          <div style="font-size:11px;color:#aaa;margin-top:2px">${j.biz_name || ''} &middot; 📍 ${dist}</div>
        </div>
        <div style="font-size:15px;font-weight:900;color:#C8102E;white-space:nowrap">${wage}</div>
      </div>
    </div>`;
  }).join('');
}

function ownerMapInfo(jobId) {
  const own = (postings || []).find(p => p.id === jobId);
  if (own) { openPostingDetail(jobId); return; }
  db.from('job_postings').select('title, biz_name, current_wage, status, category, work_type')
    .eq('id', jobId).single().then(({ data: j }) => {
      if (!j) return;
      const isErrand = j.work_type === 'errand';
      showToast(`${j.biz_name||''} · ${j.title} · ${j.current_wage.toLocaleString()}원/${isErrand?'건':'시간'}`);
    });
}

// ── 지원자 프로필 ─────────────────────────────────────────
let _chatWorkerId = null;

async function openWorkerProfile() {
  if (!_chatAppId) return;
  const { data: app } = await db.from('applications')
    .select('*, workers(*), job_postings(title)')
    .eq('id', _chatAppId).single();
  if (!app) return;
  const w = app.workers || {};
  const STATUS = { pending:'⏳ 접수중', reviewing:'\u{1F50D} 검토중', accepted:'✅ 합격', rejected:'❌ 탈락', completed:'\u{1F3C1} 완료', cancelled:'취소' };

  const infoRow = (label, value) => `
    <div style="background:#f8f8f8;border-radius:12px;padding:14px">
      <div style="font-size:11px;color:#aaa;font-weight:700;margin-bottom:4px">${label}</div>
      ${value
        ? `<div style="font-size:14px;font-weight:700;color:#222;line-height:1.5">${String(value).replace(/</g,'&lt;')}</div>`
        : `<div style="font-size:13px;color:#ccc;font-weight:600">미입력</div>`}
    </div>`;

  const phoneRow = w.phone
    ? `<div style="background:#f8f8f8;border-radius:12px;padding:14px">
        <div style="font-size:11px;color:#aaa;font-weight:700;margin-bottom:6px">\u{1F4DE} 연락처</div>
        <div style="display:flex;align-items:center;justify-content:space-between">
          <div style="font-size:16px;font-weight:800;color:#222">${w.phone.replace(/^(\d{3})(\d{3,4})(\d{4})$/, '$1-$2-$3')}</div>
          <a href="tel:${w.phone}" style="background:#22c55e;color:#fff;font-size:12px;font-weight:800;padding:6px 14px;border-radius:8px;text-decoration:none">\u{1F4DE} 전화</a>
        </div>
      </div>`
    : infoRow('\u{1F4DE} 연락처', null);

  const emailRow = w.email
    ? `<div style="background:#f8f8f8;border-radius:12px;padding:14px">
        <div style="font-size:11px;color:#aaa;font-weight:700;margin-bottom:6px">✉️ 이메일</div>
        <div style="display:flex;align-items:center;justify-content:space-between">
          <div style="font-size:13px;font-weight:700;color:#222">${w.email}</div>
          <a href="mailto:${w.email}" style="background:#4B82FF;color:#fff;font-size:12px;font-weight:800;padding:6px 14px;border-radius:8px;text-decoration:none">메일</a>
        </div>
      </div>`
    : infoRow('✉️ 이메일', null);

  document.getElementById('_wp-overlay')?.remove();
  const el = document.createElement('div');
  el.id = '_wp-overlay';
  el.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9100;display:flex;align-items:flex-end;justify-content:center';
  el.onclick = e => { if (e.target === el) el.remove(); };
  el.innerHTML = `<div style="background:#fff;border-radius:24px 24px 0 0;width:100%;max-width:600px;padding:20px 20px 40px;max-height:90vh;overflow-y:auto">
    <div style="width:36px;height:4px;background:#eee;border-radius:2px;margin:0 auto 16px"></div>

    <!-- 헤더 -->
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:20px">
      <div style="width:64px;height:64px;border-radius:50%;background:#FFF0F0;display:flex;align-items:center;justify-content:center;font-size:32px;flex-shrink:0">\u{1F464}</div>
      <div style="flex:1">
        <div style="font-size:20px;font-weight:900;color:#222">${w.name || '이름없음'}</div>
        <div style="display:flex;gap:8px;margin-top:4px;flex-wrap:wrap">
          ${w.age ? `<span style="background:#FFF0F0;color:#C8102E;font-size:12px;font-weight:800;padding:3px 10px;border-radius:20px">만 ${w.age}세</span>` : '<span style="background:#f5f5f5;color:#bbb;font-size:12px;font-weight:700;padding:3px 10px;border-radius:20px">나이 미입력</span>'}
          ${w.gender ? `<span style="background:#EFF6FF;color:#3B82F6;font-size:12px;font-weight:800;padding:3px 10px;border-radius:20px">${w.gender==='male'?'남성':w.gender==='female'?'여성':w.gender}</span>` : ''}
          <span style="background:#f5f5f5;color:#888;font-size:12px;font-weight:700;padding:3px 10px;border-radius:20px">★ ${w.rating || '-'} · ${w.review_count || 0}건</span>
        </div>
      </div>
    </div>

    <!-- 지원 공고 -->
    <div style="background:#FFF5F5;border-radius:12px;padding:14px;margin-bottom:14px">
      <div style="font-size:11px;color:#aaa;font-weight:700;margin-bottom:4px">\u{1F4CB} 지원 공고</div>
      <div style="font-size:15px;font-weight:800;color:#222;margin-bottom:4px">${app.job_postings?.title || '-'}</div>
      <div style="font-size:12px;color:#666">지원 상태: <span style="font-weight:800">${STATUS[app.status] || app.status}</span></div>
    </div>

    <!-- 지원 메시지 -->
    ${app.apply_message ? `<div style="margin-bottom:12px;padding:12px;background:#FFFBEB;border-radius:12px;border-left:3px solid #F59E0B;font-size:13px;color:#444;line-height:1.6"><span style="font-size:10px;font-weight:800;color:#D97706;display:block;margin-bottom:4px">💬 지원 메시지</span>${app.apply_message.replace(/</g,'&lt;')}</div>` : ''}

    <!-- 연락처 -->
    <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:14px">
      ${phoneRow}
      ${emailRow}
    </div>

    <!-- 상세 정보 -->
    <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:14px">
      ${infoRow('\u{1F4DD} 자기소개', w.bio)}
      ${infoRow('\u{1F4BC} 경력 / 특기', w.experience)}
      ${w.skills?.length ? `<div style="background:#f8f8f8;border-radius:12px;padding:14px"><div style="font-size:11px;color:#aaa;font-weight:700;margin-bottom:8px">\u{1F3F7}️ 보유 스킬</div><div style="display:flex;flex-wrap:wrap;gap:6px">${w.skills.map(s=>`<span style="background:#fff;border:1.5px solid #eee;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700;color:#444">${s}</span>`).join('')}</div></div>` : ''}
      ${w.languages?.length ? `<div style="background:#f8f8f8;border-radius:12px;padding:14px"><div style="font-size:11px;color:#aaa;font-weight:700;margin-bottom:8px">\u{1F5E3} 구사 가능 언어</div><div style="display:flex;flex-wrap:wrap;gap:6px">${w.languages.map(l=>{const M={ko:'\u{1F1F0}\u{1F1F7} 한국어',en:'\u{1F1FA}\u{1F1F8} 영어',zh:'\u{1F1E8}\u{1F1F3} 중국어',ja:'\u{1F1EF}\u{1F1F5} 일본어',vi:'\u{1F1FB}\u{1F1F3} 베트남어',ru:'\u{1F1F7}\u{1F1FA} 러시아어',mn:'\u{1F1F2}\u{1F1F3} 몽골어'};return `<span style="background:#F0FDF4;color:#16a34a;border:1.5px solid #86EFAC;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700">${M[l]||l}</span>`;}).join('')}</div></div>` : ''}
      ${w.vehicles?.length ? `<div style="background:#f8f8f8;border-radius:12px;padding:14px"><div style="font-size:11px;color:#aaa;font-weight:700;margin-bottom:8px">\u{1F697} 보유 이동수단</div><div style="display:flex;flex-wrap:wrap;gap:6px">${w.vehicles.map(v=>{const M={bicycle:'\u{1F6B2} 자전거',kickboard:'\u{1F6F4} 킥보드',motorcycle:'\u{1F6F5} 오토바이',car_compact:'\u{1F697} 차량(소형)',car_midsize:'\u{1F699} 차량(중형)',car_suv:'\u{1F690} 차량(SUV)',car_large:'\u{1F68C} 차량(대형)',truck:'\u{1F69A} 트럭/화물'};return `<span style="background:#EFF6FF;color:#3B82F6;border:1.5px solid #BFDBFE;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700">${M[v]||v}</span>`;}).join('')}</div></div>` : ''}
    </div>

    <!-- 액션 버튼 -->
    ${app.status === 'pending' ? `<div style="display:flex;gap:8px;margin-bottom:8px">
      <button onclick="updateApplicationFromProfile('${app.id}','reviewing')" style="flex:1;padding:13px;background:#FFF7ED;color:#D97706;border:1.5px solid #FDE68A;border-radius:12px;font-size:13px;font-weight:800;cursor:pointer">⭐ 1차합격</button>
      <button onclick="updateApplicationFromProfile('${app.id}','on_hold')" style="flex:1;padding:13px;background:#EFF6FF;color:#3B82F6;border:none;border-radius:12px;font-size:13px;font-weight:800;cursor:pointer">📌 보류</button>
    </div>` : ''}
    ${app.status === 'reviewing' ? `<div style="display:flex;gap:8px;margin-bottom:8px">
      <button onclick="updateApplicationFromProfile('${app.id}','accepted')" style="flex:1;padding:13px;background:#22c55e;color:#fff;border:none;border-radius:12px;font-size:14px;font-weight:800;cursor:pointer">✅ 최종합격</button>
      <button onclick="updateApplicationFromProfile('${app.id}','on_hold')" style="flex:1;padding:13px;background:#EFF6FF;color:#3B82F6;border:none;border-radius:12px;font-size:13px;font-weight:800;cursor:pointer">📌 보류</button>
      <button onclick="updateApplicationFromProfile('${app.id}','rejected')" style="flex:1;padding:13px;background:#f5f5f5;color:#888;border:none;border-radius:12px;font-size:14px;font-weight:800;cursor:pointer">❌ 탈락</button>
    </div>` : ''}
    ${app.status === 'on_hold' ? `<div style="display:flex;gap:8px;margin-bottom:8px">
      <button onclick="updateApplicationFromProfile('${app.id}','reviewing')" style="flex:1;padding:13px;background:#FFF7ED;color:#D97706;border:1.5px solid #FDE68A;border-radius:12px;font-size:13px;font-weight:800;cursor:pointer">↩ 1차합격으로</button>
      <button onclick="updateApplicationFromProfile('${app.id}','rejected')" style="flex:1;padding:13px;background:#f5f5f5;color:#888;border:none;border-radius:12px;font-size:14px;font-weight:800;cursor:pointer">❌ 탈락</button>
    </div>` : ''}

    <div style="display:flex;align-items:center;justify-content:space-between;margin-top:6px">
      <button onclick="openOwnerReport('worker','${w.kakao_uid || w.id || ''}')" style="background:none;border:none;font-size:12px;color:#ccc;cursor:pointer;font-weight:600">신고하기</button>
      <button onclick="printWorkerProfile('${app.id}')" style="background:none;border:none;font-size:12px;color:#3B82F6;cursor:pointer;font-weight:700">📄 지원서 출력</button>
    </div>
    <button onclick="document.getElementById('_wp-overlay').remove()" style="width:100%;margin-top:10px;padding:12px;background:#f0f0f0;color:#555;border:none;border-radius:12px;font-size:14px;font-weight:700;cursor:pointer">닫기</button>
  </div>`;
  document.body.appendChild(el);
}

async function printWorkerProfile(appId) {
  const { data: app } = await db.from('applications')
    .select('*, workers(*), job_postings(title)')
    .eq('id', appId).single();
  if (!app) return;
  const w = app.workers || {};
  const STATUS = { pending:'접수중', reviewing:'검토중', accepted:'합격', rejected:'탈락', completed:'완료', cancelled:'취소' };
  const rating = w.rating != null ? Number(w.rating).toFixed(1) : '-';
  const today = new Date().toLocaleDateString('ko-KR');

  const row = (label, val) => val
    ? `<tr><td style="padding:8px 10px;border:1px solid #ddd;background:#f9f9f9;font-weight:700;white-space:nowrap;width:28%">${label}</td><td style="padding:8px 10px;border:1px solid #ddd">${val}</td></tr>`
    : '';

  const skills = (w.skills || []).join(', ') || null;
  const vehicles = (w.vehicles || []).map(v => ({'bicycle':'자전거','kickboard':'킥보드','motorcycle':'오토바이','car_compact':'차량(소형)','car_midsize':'차량(중형)','car_suv':'차량(SUV)','car_large':'차량(대형)','truck':'트럭/화물'}[v]||v)).join(', ') || null;
  const langs = (w.languages || []).map(l => ({'ko':'한국어','en':'영어','zh':'중국어','ja':'일본어','vi':'베트남어','ru':'러시아어','mn':'몽골어'}[l]||l)).join(', ') || null;
  const phone = w.phone ? w.phone.replace(/^(\d{3})(\d{3,4})(\d{4})$/, '$1-$2-$3') : null;

  _printInPage(
    `<h2 style="text-align:center;letter-spacing:3px;margin-bottom:6px;font-size:20px">지 원 서</h2>
     <p style="text-align:center;font-size:12px;color:#888;margin-bottom:24px">바로알바 플랫폼 자동 생성 · ${today}</p>
     <table style="width:100%;border-collapse:collapse;margin-bottom:20px;font-size:13px">
       ${row('지원 공고', app.job_postings?.title)}
       ${row('지원 상태', STATUS[app.status] || app.status)}
       ${row('이름', w.name)}
       ${row('나이', w.age ? `만 ${w.age}세` : null)}
       ${row('성별', w.gender === 'male' ? '남성' : w.gender === 'female' ? '여성' : w.gender)}
       ${row('연락처', phone)}
       ${row('이메일', w.email)}
       ${row('평점', `★ ${rating} (완료 ${w.review_count||0}건 · 노쇼 ${w.noshow_count||0}건)`)}
       ${row('보유 스킬', skills)}
       ${row('구사 언어', langs)}
       ${row('이동수단', vehicles)}
     </table>
     ${w.bio ? `<div style="margin-bottom:14px"><div style="font-weight:700;font-size:13px;margin-bottom:6px;border-left:3px solid #C8102E;padding-left:8px">자기소개</div><div style="font-size:13px;line-height:1.7;color:#333">${w.bio.replace(/</g,'&lt;')}</div></div>` : ''}
     ${w.experience ? `<div style="margin-bottom:14px"><div style="font-weight:700;font-size:13px;margin-bottom:6px;border-left:3px solid #C8102E;padding-left:8px">경력 / 특기</div><div style="font-size:13px;line-height:1.7;color:#333">${w.experience.replace(/</g,'&lt;')}</div></div>` : ''}
     ${app.apply_message ? `<div style="margin-bottom:14px"><div style="font-weight:700;font-size:13px;margin-bottom:6px;border-left:3px solid #C8102E;padding-left:8px">지원 메시지</div><div style="font-size:13px;line-height:1.7;color:#333">${app.apply_message.replace(/</g,'&lt;')}</div></div>` : ''}`,
    `#_ps_content{font-family:'Apple SD Gothic Neo','Noto Sans KR',sans-serif;padding:40px 48px;max-width:580px;margin:0 auto;color:#222;line-height:1.7}@page{size:A4;margin:20mm}`
  );
}

async function updateApplicationFromProfile(appId, status) {
  document.getElementById('_wp-overlay')?.remove();
  await updateApplication(appId, status);
}

async function openChat(applicationId, workerName) {
  _chatAppId = applicationId;
  _chatWorkerName = workerName;
  _chatWorkerUserId = null;
  window._chatCounterpart = { name: workerName, photoUrl: null, type: 'worker' };
  document.getElementById('chat-title').textContent = t('chat_with_name').replace('{name}', workerName);
  document.getElementById('chat-sub').textContent = '';
  _updateCpHeader('chat', window._chatCounterpart);
  const _co2 = document.getElementById('chat-overlay');
  _co2.style.display = 'flex';
  history.pushState({ overlay: 'chat' }, '');
  document.getElementById('chat-input').value = '';
  // 알바생 정보 조회 (Push 알림용 kakao_uid + 프로필) - 같은 지원자와 여러 건
  // 지원 시 어느 공고 얘기인지 구분되도록 공고 제목도 같이 표시
  const { data: app } = await db.from('applications')
    .select('job_postings(title), workers(id,name,photo_url,kakao_uid,age,gender,region,rating,review_count,noshow_count,bio,skills)').eq('id', applicationId).single();
  const chatSubEl = document.getElementById('chat-sub');
  if (chatSubEl) chatSubEl.textContent = app?.job_postings?.title || '';
  if (app?.workers?.kakao_uid) _chatWorkerUserId = app.workers.kakao_uid;
  if (app?.workers) {
    const w = app.workers;
    window._chatCounterpart = { name: w.name || workerName, photoUrl: w.photo_url || null, id: w.id, age: w.age, gender: w.gender, region: w.region, rating: w.rating, reviewCount: w.review_count, noshowCount: w.noshow_count, selfIntro: w.bio, skills: w.skills, type: 'worker' };
    document.getElementById('chat-title').textContent = t('chat_with_name').replace('{name}', window._chatCounterpart.name);
    _updateCpHeader('chat', window._chatCounterpart);
  }
  await loadChatMessages();
  subscribeChatMessages();
  markMessagesRead(applicationId).then(() => {
    const badge = document.getElementById('owner-chat-badge');
    if (badge) { badge.textContent = '0'; badge.style.display = 'none'; }
  });
}

function closeChat(navigate = true) {
  const co = document.getElementById('chat-overlay');
  if (!co) return;
  co.style.display = 'none';
  co.style.paddingBottom = '';
  if (window._clearChatKbOffset) window._clearChatKbOffset();
  if (_chatSub) { _chatSub.unsubscribe(); _chatSub = null; }
  _chatAppId = null;
  _chatInquiryId = null;
  _chatWorkerUserId = null;
  window._chatCounterpart = null;
  if (navigate) {
    const chatBtn = document.querySelectorAll('.nav-item')[3];
    if (chatBtn) setNav(chatBtn, 'chats');
  }
}

async function loadChatMessages() {
  let query = db.from('messages').select('*').order('created_at', { ascending: true });
  if (_chatInquiryId) query = query.eq('inquiry_id', _chatInquiryId);
  else query = query.eq('application_id', _chatAppId);
  const { data } = await query;
  renderChatMessages(data || []);
}

function renderChatMessages(msgs) {
  const el = document.getElementById('chat-messages');
  if (!msgs.length) {
    el.innerHTML = '<div style="text-align:center;color:#aaa;font-size:13px;margin-top:40px">아직 메시지가 없어요<br>지원자에게 먼저 연락해보세요 💬</div>';
    return;
  }
  el.innerHTML = msgs.map(m => {
    const isMine = m.sender_id === currentUser?.id;
    const time = new Date(m.created_at).toLocaleTimeString('ko-KR', { hour:'2-digit', minute:'2-digit' });
    return _chatMsgRow(m, isMine, time, isMine ? null : window._chatCounterpart, 'chat');
  }).join('');
  const csc = document.getElementById('chat-scroll');
  if (csc) csc.scrollTop = csc.scrollHeight; else el.scrollTop = el.scrollHeight;
}

function subscribeChatMessages() {
  if (_chatSub) _chatSub.unsubscribe();
  const isInquiry = !!_chatInquiryId;
  const channelId = isInquiry ? ('inq-' + _chatInquiryId) : ('chat-' + _chatAppId);
  const filterStr = isInquiry ? `inquiry_id=eq.${_chatInquiryId}` : `application_id=eq.${_chatAppId}`;
  _chatSub = db.channel(channelId)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages',
      filter: filterStr }, payload => {
      const el = document.getElementById('chat-messages');
      const msg = payload.new;
      const isMine = msg.sender_id === currentUser?.id;
      const time = new Date(msg.created_at).toLocaleTimeString('ko-KR', { hour:'2-digit', minute:'2-digit' });
      const div = document.createElement('div');
      div.innerHTML = _chatMsgRow(msg, isMine, time, isMine ? null : window._chatCounterpart, 'chat');
      el.appendChild(div.firstElementChild || div);
      const csc = document.getElementById('chat-scroll');
      if (csc) csc.scrollTop = csc.scrollHeight; else el.scrollTop = el.scrollHeight;
      if (!isMine && !isInquiry) markMessagesRead(_chatAppId);
      if (isMine) {
        if (window.AndroidBridge?.setScrollKbGuard) window.AndroidBridge.setScrollKbGuard(false);
        const _co = document.getElementById('chat-overlay');
        if (_co && _co.style.display === 'flex' && window._lastKbDp > 80) {
          _co.style.paddingBottom = (window._lastKbDp + 16) + 'px';
        }
        requestAnimationFrame(() => { requestAnimationFrame(() => {
          const csc = document.getElementById('chat-scroll');
          if (csc) csc.scrollTop = csc.scrollHeight;
        }); });
      }
    }).subscribe();
}

async function _doSendChat(content) {
  if (!content || (!_chatAppId && !_chatInquiryId)) return;
  const msgRow = { sender_id: currentUser.id, content };
  if (_chatInquiryId) msgRow.inquiry_id = _chatInquiryId;
  else msgRow.application_id = _chatAppId;
  const { error: _sendErr } = await db.from('messages').insert(msgRow);
  if (_sendErr) { showToast('메시지 전송 실패: ' + _sendErr.message); return; }
  if (_chatWorkerUserId) {
    try {
      const ch = db.channel(`worker-${_chatWorkerUserId}-notify`);
      ch.subscribe(status => {
        if (status === 'SUBSCRIBED') {
          ch.send({ type:'broadcast', event:'new_msg', payload:{ application_id:_chatAppId, content, sender_id:currentUser.id } });
          setTimeout(() => ch.unsubscribe(), 1500);
        }
      });
    } catch(e) {}
    const ownerBiz = (typeof bizRecord !== 'undefined' && bizRecord?.name) || currentUser?.user_metadata?.full_name || '업주';
    const pushBody = content.startsWith('[img]') ? '📷 이미지를 보냈습니다' : (content.length > 40 ? content.slice(0,40)+'…' : content);
    fetch('/api/send-push', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ user_id:_chatWorkerUserId, title:`${ownerBiz}님으로부터 메시지`, body:pushBody, url:'/바로알바.html?chat='+_chatAppId+'&view=worker', app_id:_chatAppId, type:'chat' })
    }).catch(()=>{});
  }
}

async function sendChatMessage() {
  if (_pendingChatFiles.length) { await _uploadAndSendChatImage(); return; }
  const input = document.getElementById('chat-input');
  const content = input.value.trim();
  if (!content) return;
  if (_hasBadWord(content)) { showToast('비속어가 포함된 메시지는 전송할 수 없어요'); return; }
  input.value = '';
  input.focus();
  if (window.AndroidBridge?.showKeyboard && window._lastKbDp < 80) window.AndroidBridge.showKeyboard();
  if (window.AndroidBridge?.setScrollKbGuard) window.AndroidBridge.setScrollKbGuard(true);
  await _doSendChat(content);
}

async function markMessagesRead(appId) {
  const { data, error } = await db.from('messages')
    .update({ is_read: true })
    .eq('application_id', appId)
    .neq('sender_id', currentUser?.id || '')
    .select('id');
  if (error) console.error('[markMessagesRead] update failed:', error.message);
  else if (!data?.length) console.warn('[markMessagesRead] 0 rows updated (RLS 정책이 막고 있을 수 있음) appId=', appId);
}

// ── 업주 글로벌 채팅 알림 (Broadcast 방식 - RLS 우회) ──
function subscribeOwnerGlobalChat() {
  if (!currentUser) return;
  if (_ownerGlobalChatSub) { try { _ownerGlobalChatSub.unsubscribe(); } catch(e) {} _ownerGlobalChatSub = null; }

  const _ownerKakaoId = currentUser.user_metadata?.kakao_uid || currentUser.user_metadata?.provider_id || currentUser.id;
  _ownerGlobalChatSub = db.channel(`owner-${_ownerKakaoId}-notify`)
    .on('broadcast', { event: 'new_msg' }, ({ payload }) => {
      if (!payload || payload.sender_id === currentUser.id) return;
      const chatOpen = document.getElementById('chat-overlay')?.style.display === 'flex';
      if (chatOpen && _chatAppId === payload.application_id) return;
      const badge = document.getElementById('owner-chat-badge');
      if (badge) {
        const cnt = parseInt(badge.textContent || '0') + 1;
        badge.textContent = cnt;
        badge.style.display = 'flex';
      }
      showToast('\u{1F4AC} 새 메시지: ' + (payload.content || '').slice(0, 20) + ((payload.content || '').length > 20 ? '…' : ''));
    })
    .subscribe();
}

// ── 공유 ───────────────────────────────────────────────────
let _shareJobId = null;

function openShareModal(jobId, showPostedToast) {
  _shareJobId = jobId;
  const base = 'https://baroalba.multimove.co.kr/%EB%B0%94%EB%A1%9C%EC%95%8C%EB%B0%94.html';
  const url = jobId ? `${base}?job=${encodeURIComponent(jobId)}` : base;
  document.getElementById('share-url-text').textContent = url;
  document.getElementById('share-native-btn').style.display = navigator.share ? 'block' : 'none';
  document.getElementById('share-overlay').classList.add('open');
  if (showPostedToast) showToast('✅ 공고가 등록됐습니다');
}
function closeShareModal() {
  document.getElementById('share-overlay').classList.remove('open');
}
function shareNative() {
  const url = document.getElementById('share-url-text').textContent;
  navigator.share({ title: '바로알바 공고', url }).catch(() => {});
}

function copyShareUrl() {
  const url = document.getElementById('share-url-text').textContent;
  navigator.clipboard.writeText(url).then(() => showToast('✅ 링크가 복사됐습니다'));
}

function shareKakao() {
  const url = document.getElementById('share-url-text').textContent;

  if (/Android/i.test(navigator.userAgent)) {
    if (window.AndroidBridge) {
      window.AndroidBridge.share('바로알바 공고', '지금 바로 지원하세요!', url);
      return;
    }
    navigator.clipboard?.writeText(url);
    showToast('링크가 복사됐습니다');
    return;
  }

  // iOS / 데스크탑: Kakao SDK 정상 동작
  if (window.Kakao && !Kakao.isInitialized()) Kakao.init(APP_CONFIG.KAKAO_JS_KEY);
  if (!window.Kakao?.isInitialized?.()) {
    if (navigator.share) navigator.share({ title: '바로알바 공고', url }).catch(() => {});
    else { navigator.clipboard?.writeText(url); showToast('링크가 복사됐습니다'); }
    return;
  }
  try {
    Kakao.Share.sendDefault({
      objectType: 'feed',
      content: {
        title: '바로알바 — 지금 바로 지원하세요!',
        description: '실시간 지도 기반 알바 매칭. 지금 공고를 확인해보세요.',
        imageUrl: 'https://baroalba.multimove.co.kr/icons/og-share.png',
        link: { mobileWebUrl: url, webUrl: url },
      },
      buttons: [{ title: '공고 보기', link: { mobileWebUrl: url, webUrl: url } }],
    });
  } catch(e) {
    if (navigator.share) navigator.share({ title: '바로알바 공고', url }).catch(() => {});
    else { navigator.clipboard?.writeText(url); showToast('링크가 복사됐습니다'); }
  }
}

function shareNative() {
  const url = document.getElementById('share-url-text').textContent;
  if (navigator.share) {
    navigator.share({ title: '바로알바 공고', text: '지금 바로 지원하세요!', url });
  }
}

// ── 카테고리 ───────────────────────────────────────────────
const DEFAULT_CATEGORIES = [
  { name:'F&B',        icon:'\u{1F37D}', display_order:1  },
  { name:'물류',       icon:'\u{1F4E6}', display_order:2  },
  { name:'판매',       icon:'\u{1F6CD}', display_order:3  },
  { name:'청소',       icon:'\u{1F9F9}', display_order:4  },
  { name:'의류/패션',  icon:'\u{1F457}', display_order:5  },
  { name:'의료/병원',  icon:'\u{1F3E5}', display_order:6  },
  { name:'이벤트',     icon:'\u{1F389}', display_order:7  },
  { name:'숙박/호텔',  icon:'\u{1F3E8}', display_order:8  },
  { name:'교육/과외',  icon:'\u{1F4DA}', display_order:9  },
  { name:'스포츠/레저',icon:'⚽', display_order:10 },
  { name:'뷰티/헤어',  icon:'\u{1F485}', display_order:11 },
  { name:'커플알바',   icon:'\u{1F491}', display_order:12 },
  { name:'컨텐츠',     icon:'\u{1F4F1}', display_order:13 },
  { name:'유튜브/틱톡',icon:'\u{1F3AC}', display_order:14 },
  { name:'모델/촬영',  icon:'\u{1F4F8}', display_order:15 },
  { name:'이사도우미', icon:'\u{1F69A}', display_order:16 },
  { name:'기타',       icon:'\u{1F4CB}', display_order:99 },
];

// 전문기술직 — 중간카테고리 그룹 구조
const TECHNICAL_MIDS = {
  '현장·시설': [
    {v:'설비·수리',  e:'🔧'},
    {v:'전기·전자',  e:'⚡'},
    {v:'인테리어',   e:'🏠'},
    {v:'청소·방역',  e:'🧹'},
    {v:'이사·운반',  e:'🚚'},
    {v:'조경·정원',  e:'🌿'},
    {v:'기타 현장',  e:'🔨'},
  ],
  '크리에이티브': [
    {v:'사진 촬영',      e:'📸'},
    {v:'영상 촬영·편집', e:'🎬'},
    {v:'그래픽·디자인',  e:'🎨'},
    {v:'웹디자인·UI',    e:'💻'},
    {v:'SNS·마케팅',     e:'📱'},
  ],
  'IT·개발': [
    {v:'웹·앱 개발',      e:'⌨️'},
    {v:'데이터 분석',     e:'📊'},
    {v:'자동화·스크립트', e:'🤖'},
    {v:'기타 IT',         e:'💾'},
  ],
  '뷰티·케어': [
    {v:'헤어',          e:'💇'},
    {v:'메이크업·네일', e:'💅'},
    {v:'피부 관리',     e:'✨'},
  ],
  '언어·기타': [
    {v:'번역·통역',     e:'🌐'},
    {v:'행사·MC',       e:'🎤'},
    {v:'음식·케이터링', e:'🍽️'},
    {v:'기타 전문',     e:'⭐'},
  ],
};
// 필터/폼에서 flat list 필요할 때 사용
const TECHNICAL_CATEGORIES = Object.values(TECHNICAL_MIDS).flat().map(c => ({ name: c.v, icon: c.e }));
// mid → 포함 leaf 카테고리 배열
function _getTechnicalCatsForMid(mid) { return (TECHNICAL_MIDS[mid] || []).map(c => c.v); }

// 돌봄·케어(바로돌봄) 카테고리
const CARE_CATEGORIES = [
  { name:'펫시팅/산책', icon:'\u{1F436}' },
  { name:'반려동물케어', icon:'\u{1F43E}' },
  { name:'아이돌봄',    icon:'\u{1F476}' },
  { name:'어르신돌봄',  icon:'\u{1F474}' },
  { name:'병원동행',    icon:'\u{1F3E5}' },
  { name:'가사도우미',  icon:'\u{1F3E1}' },
];

const ERRAND_CATEGORIES = [
  { name: '물건 픽업/전달', icon: '\u{1F4E6}', display_order: 1  },
  { name: '대리 줄서기',   icon: '\u{1F9CD}', display_order: 2  },
  { name: '서류/우편',     icon: '\u{1F4EE}', display_order: 3  },
  { name: '쇼핑 대행',     icon: '\u{1F6D2}', display_order: 4  },
  { name: '벌레 퇴치',     icon: '\u{1FAB2}', display_order: 5  },
  { name: '반려동물 산책', icon: '\u{1F415}', display_order: 6  },
  { name: '이사/짐 보조',  icon: '\u{1F69A}', display_order: 7  },
  { name: '운반/짐 이동',  icon: '\u{1F4E6}', display_order: 8  },
  { name: '퀵배달',        icon: '\u{1F6F5}', display_order: 9  },
  { name: '청소 대행',     icon: '\u{1F9F9}', display_order: 10 },
  { name: '음식 배달',     icon: '\u{1F371}', display_order: 11 },
  { name: '차량 이동/주차',icon: '\u{1F697}', display_order: 12 },
  { name: '약국/병원 대행',icon: '\u{1F48A}', display_order: 13 },
  { name: '장보기 대행',   icon: '\u{1F96C}', display_order: 14 },
  { name: '기타 심부름',   icon: '\u{1F3C3}', display_order: 99 },
];

let categories = [...DEFAULT_CATEGORIES];

// 공고 유형별 라벨/플레이스홀더
const JOB_TYPE_META = {
  alba:      { label:'일반 알바',  placeholder:'예: 홀 서빙 보조, 물류 입출고',           wageLabel:'시급 (원) *' },
  errand:    { label:'심부름',     placeholder:'예: 서류 우체국 제출, 물건 픽업/전달',     wageLabel:'건당 금액 (원) *' },
  technical: { label:'전문기술직', placeholder:'예: 싱크대 막힘 수리, 도어락 교체',       wageLabel:'작업비 (원) *' },
  care:      { label:'돌봄·케어',  placeholder:'예: 강아지 3시간 펫시팅, 아이 하원 돌봄', wageLabel:'시급/건당 (원) *' },
};

function setJobType(type) {
  document.getElementById('f-job-type').value = type;
  const isErrand = type === 'errand';

  // 탭 스타일 업데이트
  document.querySelectorAll('.job-type-tab').forEach(btn => {
    const active = btn.dataset.type === type;
    btn.style.background = active ? '#fff' : 'transparent';
    btn.style.color = active ? '#C8102E' : '#888';
    btn.style.boxShadow = active ? '0 1px 4px rgba(0,0,0,0.1)' : 'none';
  });

  // 심부름: 근무형태 탭 숨기고 errand 모드 활성화
  document.getElementById('work-type-group').style.display = isErrand ? 'none' : 'block';
  if (isErrand) {
    setWorkType('errand');
  } else {
    // 비심부름: 근무형태 스팟으로 초기화
    if (document.getElementById('f-work-type').value === 'errand') setWorkType('spot');
  }

  // 카테고리 업데이트
  const sel = document.getElementById('f-category');
  if (type === 'technical') {
    sel.innerHTML = Object.entries(TECHNICAL_MIDS).map(([grp, cats]) =>
      `<optgroup label="${grp}">${cats.map(c => `<option value="${c.v}">${c.e} ${c.v}</option>`).join('')}</optgroup>`
    ).join('');
  } else {
    const list = isErrand ? ERRAND_CATEGORIES : type === 'care' ? CARE_CATEGORIES : categories;
    sel.innerHTML = list.map(c => `<option value="${c.name}">${c.icon || ''} ${c.name}</option>`).join('');
  }

  // 라벨/플레이스홀더 업데이트
  const meta = JOB_TYPE_META[type];
  document.getElementById('f-title').placeholder = meta.placeholder;
  document.getElementById('f-title-label').textContent = meta.label + ' 직무명 *';
  document.getElementById('f-wage-label').textContent = meta.wageLabel;
  document.getElementById('f-wage').min = isErrand ? '1000' : '9860';
  document.getElementById('f-wage').placeholder = isErrand ? '20000' : '10000';
}

async function loadCategories() {
  try {
    const { data, error } = await db.from('job_categories').select('*').eq('active', true).order('display_order');
    if (!error && data?.length) categories = data;
  } catch(e) { /* fallback to defaults */ }
  if (!categories.find(c => c.name === '이사도우미')) {
    categories.push({ name:'이사도우미', icon:'\u{1F69A}', display_order:16, active:true });
  }
  renderCategorySelect();
}

function renderCategorySelect() {
  const wt = document.getElementById('f-work-type')?.value || 'spot';
  const cats = wt === 'errand' ? ERRAND_CATEGORIES : categories;
  const sel = document.getElementById('f-category');
  const prev = sel.value;
  sel.innerHTML = cats.map(c => `<option value="${c.name}">${c.icon} ${c.name}</option>`).join('');
  if (prev && cats.find(c => c.name === prev)) sel.value = prev;
}

async function renderAdminSection() {
  const sec = document.getElementById('admin-cat-section');
  if (!sec) return;

  // 카테고리 항상 DB에서 최신 상태로 로드
  try {
    const { data: freshCats } = await db.from('job_categories').select('*').eq('active', true).order('display_order');
    if (freshCats?.length) categories = freshCats;
    else if (!categories.length) categories = [...DEFAULT_CATEGORIES]; // DB도 비어있으면 기본값 복원
  } catch(e) {
    if (!categories.length) categories = [...DEFAULT_CATEGORIES];
  }

  const { data: admins } = await db.from('app_admins').select('email, added_at').order('added_at');
  const _selfEmail = (currentUser?.email || '').toLowerCase();
  const adminRows = (admins || []).map(a => {
    const isSelf = a.email.toLowerCase() === _selfEmail;
    return `<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:#f8f8f8;border-radius:10px;margin-bottom:4px">
      <span style="font-size:14px">🛡️</span>
      <span style="flex:1;font-size:13px;font-weight:700;color:#222;word-break:break-all">${a.email}</span>
      ${isSelf
        ? '<span style="font-size:11px;color:#aaa;flex-shrink:0">(본인)</span>'
        : `<button onclick="removeAdminEmail('${a.email}')" style="padding:4px 10px;background:#FFF0F0;color:#C8102E;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;flex-shrink:0">삭제</button>`}
    </div>`;
  }).join('');

  const catRows = categories.map(c => `
    <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:#f8f8f8;border-radius:10px;margin-bottom:4px">
      <span style="font-size:18px">${c.icon || '📋'}</span>
      <span style="flex:1;font-size:14px;font-weight:700">${c.name}</span>
      <button onclick="deleteCategory('${c.name}')" style="padding:4px 10px;background:#FFF0F0;color:#C8102E;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer">삭제</button>
    </div>`).join('');

  sec.innerHTML = `
    <div style="font-size:12px;font-weight:800;color:#3B82F6;margin-bottom:10px;display:flex;align-items:center;gap:6px">🛡️ 어드민 계정 관리</div>
    <div id="admin-email-list">${adminRows}</div>
    <div style="display:flex;gap:6px;margin-top:8px">
      <input id="new-admin-email" type="email" placeholder="추가할 이메일" style="flex:1;padding:9px 12px;border:1.5px solid #e5e7eb;border-radius:10px;font-size:13px;outline:none;font-family:inherit">
      <button onclick="addAdminEmail()" style="padding:9px 14px;background:#1e3a8a;color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:800;cursor:pointer;white-space:nowrap">+ 추가</button>
    </div>

    <div style="height:1px;background:#eee;margin:16px 0"></div>

    <div style="font-size:12px;font-weight:800;color:#7C3AED;margin-bottom:10px">📂 카테고리 관리 (${categories.length}개)</div>
    <div id="admin-cat-list">${catRows || '<div style="font-size:13px;color:#aaa;padding:8px 0">카테고리 없음 — 아래에서 추가하세요</div>'}</div>
    <div style="display:flex;gap:6px;margin-top:8px">
      <input id="admin-cat-icon" placeholder="🍕" style="width:44px;text-align:center;padding:9px 6px;border:1.5px solid #e5e7eb;border-radius:10px;font-size:16px;outline:none;font-family:inherit">
      <input id="admin-cat-name" placeholder="카테고리명" style="flex:1;padding:9px 12px;border:1.5px solid #e5e7eb;border-radius:10px;font-size:13px;outline:none;font-family:inherit">
      <button onclick="addCategory()" style="padding:9px 14px;background:#7C3AED;color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:800;cursor:pointer;white-space:nowrap">+ 추가</button>
    </div>`;

  // 키보드가 올라올 때 입력창 가림 방지 — visualViewport 기반
  ['new-admin-email', 'admin-cat-name'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('focus', () => {
      const scrollBox = document.querySelector('#panel-owner-settings > div[style*="overflow-y"]');
      if (!scrollBox) return;
      const doScroll = () => {
        const elRect = el.getBoundingClientRect();
        const boxRect = scrollBox.getBoundingClientRect();
        if (elRect.bottom > boxRect.bottom - 20) {
          scrollBox.scrollTop += elRect.bottom - boxRect.bottom + 40;
        }
      };
      if (window.visualViewport) {
        const onResize = () => { doScroll(); window.visualViewport.removeEventListener('resize', onResize); };
        window.visualViewport.addEventListener('resize', onResize);
        setTimeout(() => window.visualViewport.removeEventListener('resize', onResize), 2000);
      } else {
        setTimeout(doScroll, 400);
      }
    });
  });
}

function renderAdminCatList() {
  const list = document.getElementById('admin-cat-list');
  if (!list) return;
  list.innerHTML = categories.map(c => `
    <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:#f8f8f8;border-radius:10px;margin-bottom:4px">
      <span style="font-size:18px">${c.icon}</span>
      <span style="flex:1;font-size:14px;font-weight:700">${c.name}</span>
      <button onclick="deleteCategory('${c.name}')" style="padding:4px 10px;background:#FFF0F0;color:#C8102E;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer">삭제</button>
    </div>`).join('');
}

async function addAdminEmail() {
  const input = document.getElementById('new-admin-email');
  const email = (input?.value || '').trim().toLowerCase();
  if (!email || !email.includes('@')) { showToast('올바른 이메일을 입력해주세요'); return; }
  const { error } = await db.from('app_admins').insert({ email });
  if (error) { showToast(error.code === '23505' ? '이미 등록된 이메일이에요' : '저장 실패: ' + error.message); return; }
  if (input) input.value = '';
  showToast('✅ 어드민 추가됐어요');
  // 본인 이메일을 추가한 경우 즉시 어드민 권한 활성화 (재로그인 불필요)
  const _myEmail = (currentUser?.email || '').toLowerCase();
  if (email === _myEmail && !_isAdmin) {
    _isAdmin = true;
    const adminBanner = document.getElementById('admin-banner');
    if (adminBanner) adminBanner.style.display = 'flex';
    const ownerAdminBanner = document.getElementById('owner-admin-banner');
    if (ownerAdminBanner) ownerAdminBanner.style.display = 'block';
    const adminCatSec = document.getElementById('admin-cat-section');
    if (adminCatSec) adminCatSec.style.display = 'block';
  }
  renderAdminSection();
}

async function removeAdminEmail(email) {
  showConfirm('', async () => {
    await db.from('app_admins').delete().eq('email', email);
    showToast('삭제됐어요');
    renderAdminSection();
  }, { icon:'🛡️', title:`${email} 어드민 삭제`, okLabel:'삭제', danger:true });
}

async function addCategory() {
  const icon = document.getElementById('admin-cat-icon')?.value.trim() || '📋';
  const name = document.getElementById('admin-cat-name')?.value.trim();
  if (!name) { showToast('카테고리명을 입력해주세요'); return; }
  if (categories.find(c => c.name === name)) { showToast('이미 있는 카테고리예요'); return; }
  const newOrder = Math.max(...categories.map(c => c.display_order || 0), 0) + 1;
  const { error } = await db.from('job_categories').insert({ name, icon, display_order: newOrder, active: true });
  if (!error) categories.push({ name, icon, display_order: newOrder });
  const iconEl = document.getElementById('admin-cat-icon');
  const nameEl = document.getElementById('admin-cat-name');
  if (iconEl) iconEl.value = '';
  if (nameEl) nameEl.value = '';
  renderCategorySelect();
  renderAdminCatList();
  showToast(`✅ '${name}' 추가됨`);
}

function deleteCategory(name) {
  showConfirm('', async () => {
    await db.from('job_categories').update({ active: false }).eq('name', name);
    categories = categories.filter(c => c.name !== name);
    renderCategorySelect();
    renderAdminCatList();
  }, { icon:'🗑️', title:`'${name}' 카테고리 삭제`, okLabel:'삭제', danger:true });
}

async function openOwnerSettings() {
  if (currentUser) {
    const meta = currentUser.user_metadata || {};
    document.getElementById('settings-name').textContent = bizRecord?.name || meta.full_name || '업주';
    document.getElementById('settings-email').textContent = currentUser.email || '';
    if (bizRecord?.photo_url) {
      const inner = document.getElementById('owner-header-avatar-inner');
      if (inner) inner.innerHTML = `<img src="${bizRecord.photo_url}" style="width:100%;height:100%;object-fit:cover">`;
    }

    // 로그인 방식 배지
    const identities = currentUser.identities || [];
    const oauthProvider = identities.find(i => i.provider !== 'email')?.provider;
    const provider = oauthProvider || meta.provider || currentUser.app_metadata?.provider || '';
    const providerMap = {
      email:  { label: '\u{1F4E7} 이메일', bg: '#f0f0f0', color: '#555' },
      kakao:  { label: '\u{1F49B} 카카오', bg: '#FEE500', color: '#3C1E1E' },
      naver:  { label: '\u{1F7E2} 네이버', bg: '#03C75A', color: '#fff' },
      google: { label: '\u{1F535} 구글',   bg: '#4285F4', color: '#fff' }
    };
    const pInfo = providerMap[provider] || { label: '\u{1F511} 소셜', bg: '#f0f0f0', color: '#555' };
    const pEl = document.getElementById('owner-provider-badge');
    if (pEl) { pEl.textContent = pInfo.label; pEl.style.background = pInfo.bg; pEl.style.color = pInfo.color; pEl.style.display = 'block'; }

    // 스탯
    const openCount = (postings || []).filter(p => p.status === 'open' || p.status === 'urgent').length;
    document.getElementById('owner-stat-postings').textContent = openCount;
    const ratingVal = bizRecord?.rating;
    document.getElementById('owner-stat-rating').textContent = ratingVal ? parseFloat(ratingVal).toFixed(1) : '-';
    let hiredCount = 0;
    if (bizRecord?.id && postings?.length) {
      const { count } = await db.from('applications')
        .select('id', { count: 'exact', head: true })
        .in('job_posting_id', postings.map(p => p.id))
        .eq('status', 'completed');
      hiredCount = count || 0;
    }
    document.getElementById('owner-stat-hired').textContent = hiredCount;

    // 내 등급
    const rating = parseFloat(ratingVal) || 0;
    const gradeBadge = document.getElementById('owner-grade-badge');
    const gradeDesc = document.getElementById('owner-grade-desc');
    if (gradeBadge && gradeDesc) {
      if (hiredCount >= 30 && rating >= 4.5) {
        gradeBadge.innerHTML = '⭐ 프리미엄 업주';
        gradeDesc.innerHTML = '✅ 완료 알바 30회 이상<br>✅ 평점 4.5 이상';
      } else if (hiredCount >= 10 && rating >= 4.0) {
        gradeBadge.innerHTML = '\u{1F31F} 우수 업주';
        gradeDesc.innerHTML = `${hiredCount>=30?'✅':'❌'} 완료 알바 30회 이상 (현재 ${hiredCount}회)<br>${rating>=4.5?'✅':'❌'} 평점 4.5 이상 (현재 ${rating>0?rating.toFixed(1):'없음'})`;
      } else {
        gradeBadge.innerHTML = '\u{1F3EA} 일반 업주';
        gradeDesc.innerHTML = `❌ 완료 알바 10회 이상 (현재 ${hiredCount}회)<br>❌ 평점 4.0 이상 (현재 ${rating>0?rating.toFixed(1):'없음'})`;
      }
    }

    document.getElementById('settings-biz-name').value  = bizRecord?.name || '';
    document.getElementById('settings-biz-phone').value = bizRecord?.phone || '';
    document.getElementById('settings-biz-desc').value  = bizRecord?.description || '';
    updateBizDescCounter(document.getElementById('settings-biz-desc'));
    document.getElementById('admin-cat-section').style.display = _isAdmin ? 'block' : 'none';
    const ownerAdminBanner = document.getElementById('owner-admin-banner');
    if (ownerAdminBanner) ownerAdminBanner.style.display = _isAdmin ? 'block' : 'none';
    if (_isAdmin) renderAdminSection();
    loadMyPlaces();
    renderPlanUI();
    loadBizPhotos();
    applyLang();
    initOwnerNotiToggles();
    loadMannamSpotStatus();

    // 프로필 완성도 (biz_photos / places는 비동기 로드 후 업데이트)
    _updateOwnerCompletion();
  }
  document.getElementById('panel-owner-settings').classList.add('show');
}

function _updateOwnerCompletion() {
  const checks = [
    { label: '업체명',   ok: !!(bizRecord?.name) },
    { label: '연락처',   ok: !!(bizRecord?.phone) },
    { label: '업체소개', ok: !!(bizRecord?.description) },
    { label: '프로필사진', ok: !!(bizRecord?.photo_url) },
    { label: '업체사진', ok: !!(_bizPhotos?.length > 0) },
    { label: '업체장소', ok: !!(_bizPlaces?.length > 0) },
  ];
  const pct = Math.round(checks.filter(c => c.ok).length / checks.length * 100);
  const pctEl = document.getElementById('owner-completion-pct');
  const barEl = document.getElementById('owner-completion-bar');
  const itemsEl = document.getElementById('owner-completion-items');
  if (pctEl) pctEl.textContent = pct + '%';
  if (barEl) barEl.style.width = pct + '%';
  if (itemsEl) itemsEl.innerHTML = checks.map(c =>
    `<span style="font-size:11px;padding:2px 8px;border-radius:99px;font-weight:700;background:${c.ok?'#dcfce7':'#f3f4f6'};color:${c.ok?'#16a34a':'#aaa'}">${c.ok?'✓':'+'}${c.label}</span>`
  ).join('');
}

// ── 업주 알림 설정 ─────────────────────────────────────────
function updateBizDescCounter(textarea) {
  const len     = textarea.value.length;
  const counter = document.getElementById('biz-desc-counter');
  const hint    = document.getElementById('biz-desc-hint');
  if (!counter) return;
  counter.textContent = len + ' / 200';
  if (len === 0) {
    counter.style.color = '#bbb';
    if (hint) hint.style.display = 'none';
    textarea.style.borderColor = '#eee';
  } else if (len < 20) {
    counter.style.color = '#C8102E';
    if (hint) hint.style.display = 'block';
    textarea.style.borderColor = '#C8102E';
  } else {
    counter.style.color = '#16a34a';
    if (hint) hint.style.display = 'none';
    textarea.style.borderColor = '#16a34a';
  }
}

function saveOwnerNotiSetting(key, val) {
  localStorage.setItem('owner_noti_' + key, val ? '1' : '0');
  const track = document.getElementById('owner-noti-track-' + key);
  const thumb = document.getElementById('owner-noti-thumb-' + key);
  if (track) track.style.background = val ? '#C8102E' : '#ddd';
  if (thumb) thumb.style.transform  = val ? 'translateX(20px)' : 'translateX(0)';
}
function initOwnerNotiToggles() {
  ['chat','apply','comment'].forEach(key => {
    const on = localStorage.getItem('owner_noti_' + key) !== '0';
    const el = document.getElementById('owner-noti-toggle-' + key);
    if (el) el.checked = on;
    saveOwnerNotiSetting(key, on);
  });
}
function getOwnerNotiSetting(key) {
  return localStorage.getItem('owner_noti_' + key) !== '0';
}

// ── 업주 프로필 TIP 바텀시트 ───────────────────────────────
function showOwnerAvatarTip(inputId) {
  const existing = document.getElementById('owner-avatar-tip-overlay');
  if (existing) { existing.remove(); return; }
  const el = document.createElement('div');
  el.id = 'owner-avatar-tip-overlay';
  el.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:9999;display:flex;align-items:flex-end';
  el.onclick = e => { if (e.target === el) el.remove(); };
  el.innerHTML = `
    <div style="background:#fff;border-radius:24px 24px 0 0;width:100%;padding:20px 20px 44px">
      <div style="width:32px;height:3px;background:#e5e7eb;border-radius:2px;margin:0 auto 22px"></div>
      <div style="margin-bottom:20px">
        <div style="font-size:18px;font-weight:900;color:#111;margin-bottom:4px">대표 사진 등록</div>
        <div style="font-size:13px;color:#9ca3af">신뢰도 높은 사진이 지원자를 끌어모아요</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:24px">
        <div style="display:flex;align-items:center;gap:12px;padding:13px 14px;background:#f9fafb;border-radius:12px">
          <div style="width:24px;height:24px;border-radius:50%;background:#dcfce7;display:flex;align-items:center;justify-content:center;flex-shrink:0"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>
          <span style="font-size:14px;color:#374151;font-weight:600">업체·매장 로고 또는 외관 사진</span>
        </div>
        <div style="display:flex;align-items:center;gap:12px;padding:13px 14px;background:#f9fafb;border-radius:12px">
          <div style="width:24px;height:24px;border-radius:50%;background:#dcfce7;display:flex;align-items:center;justify-content:center;flex-shrink:0"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>
          <span style="font-size:14px;color:#374151;font-weight:600">대표자·직원 사진 (활기찬 분위기)</span>
        </div>
        <div style="display:flex;align-items:center;gap:12px;padding:13px 14px;background:#f9fafb;border-radius:12px">
          <div style="width:24px;height:24px;border-radius:50%;background:#fee2e2;display:flex;align-items:center;justify-content:center;flex-shrink:0"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></div>
          <span style="font-size:14px;color:#6b7280;font-weight:500">저작권 위반 이미지 · 타업체 사진</span>
        </div>
      </div>
      <label style="display:flex;align-items:center;justify-content:center;width:100%;padding:16px;background:#C8102E;color:#fff;border-radius:16px;font-size:16px;font-weight:800;cursor:pointer;box-sizing:border-box;gap:8px">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
        사진 선택하기
        <input type="file" accept="image/*" style="display:none" onchange="document.getElementById('owner-avatar-tip-overlay').remove();uploadOwnerAvatar(this)">
      </label>
    </div>`;
  document.body.appendChild(el);
}

// ── 완료 알바 목록 바텀시트 ────────────────────────────────
async function showCompletedWorkers() {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:flex-end';
  el.onclick = e => { if (e.target === el) el.remove(); };
  el.innerHTML = `
    <div style="background:#fff;border-radius:24px 24px 0 0;width:100%;max-height:75vh;display:flex;flex-direction:column">
      <div style="padding:16px 20px 12px;border-bottom:1px solid #f0f0f0;flex-shrink:0;display:flex;align-items:center;justify-content:space-between">
        <div style="font-size:17px;font-weight:900">&#127937; 완료 알바 목록</div>
        <button onclick="this.closest('div[style*=fixed]').remove()" style="font-size:22px;color:#aaa;background:none;border:none;cursor:pointer">✕</button>
      </div>
      <div id="completed-workers-list" style="overflow-y:auto;padding:10px 16px 40px;flex:1">
        <div style="text-align:center;padding:24px"><div class="spinner"></div></div>
      </div>
    </div>`;
  document.body.appendChild(el);

  if (!bizRecord?.id) return;
  const { data: myPostings } = await db.from('job_postings').select('id,title').eq('business_id', bizRecord.id);
  const postingIds = (myPostings || []).map(p => p.id);
  if (!postingIds.length) {
    document.getElementById('completed-workers-list').innerHTML = '<div style="text-align:center;padding:40px;color:#aaa">완료된 알바가 없습니다</div>';
    return;
  }
  const titleMap = Object.fromEntries((myPostings||[]).map(p => [p.id, p.title]));
  const { data: apps } = await db.from('applications')
    .select('id, job_posting_id, updated_at, workers(name, photo_url, rating)')
    .in('job_posting_id', postingIds)
    .eq('status', 'completed')
    .order('updated_at', { ascending: false })
    .limit(50);
  const listEl = document.getElementById('completed-workers-list');
  if (!listEl) return;
  if (!(apps||[]).length) {
    listEl.innerHTML = '<div style="text-align:center;padding:40px;color:#aaa">완료된 알바가 없습니다</div>';
    return;
  }
  listEl.innerHTML = (apps||[]).map(a => {
    const w = a.workers || {};
    const d = a.updated_at ? new Date(a.updated_at) : null;
    const dateStr = d ? `${d.getMonth()+1}/${d.getDate()}` : '';
    const avatar = w.photo_url
      ? `<img src="${w.photo_url}" style="width:100%;height:100%;object-fit:cover">`
      : `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#bbb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
    return `<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid #f5f5f5">
      <div style="width:38px;height:38px;border-radius:50%;background:#f4f4f4;overflow:hidden;flex-shrink:0;display:flex;align-items:center;justify-content:center">${avatar}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:14px;font-weight:800;color:#222">${w.name||'이름 없음'}</div>
        <div style="font-size:12px;color:#aaa">${titleMap[a.job_posting_id]||'공고'}</div>
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div style="font-size:12px;color:#aaa">${dateStr}</div>
        ${w.rating ? `<div style="font-size:12px;color:#F59E0B;font-weight:700">★ ${parseFloat(w.rating).toFixed(1)}</div>` : ''}
      </div>
    </div>`;
  }).join('');
}

// ── 내 평점 바텀시트 ───────────────────────────────────────
function showOwnerRatings() {
  const rating  = parseFloat(bizRecord?.rating) || 0;
  const kind    = parseFloat(bizRecord?.kindness_rating) || 0;
  const reviews = bizRecord?.review_count || 0;
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:flex-end';
  el.onclick = e => { if (e.target === el) el.remove(); };
  const stars = n => n > 0 ? '★'.repeat(Math.round(n)) + '☆'.repeat(5 - Math.round(n)) : '☆☆☆☆☆';
  el.innerHTML = `
    <div style="background:#fff;border-radius:24px 24px 0 0;width:100%;padding:24px 20px 40px">
      <div style="width:40px;height:4px;background:#eee;border-radius:2px;margin:0 auto 18px"></div>
      <div style="font-size:17px;font-weight:900;margin-bottom:16px">&#11088; 내 평점 현황</div>
      <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:20px">
        <div style="background:#f8f8f8;border-radius:14px;padding:14px 16px">
          <div style="display:flex;align-items:center;justify-content:space-between">
            <div>
              <div style="font-size:13px;color:#888;margin-bottom:2px">종합 평점</div>
              <div style="font-size:28px;font-weight:900;color:#F59E0B">${rating > 0 ? rating.toFixed(1) : '-'}</div>
            </div>
            <div style="text-align:right">
              <div style="font-size:18px;color:#F59E0B;letter-spacing:2px">${stars(rating)}</div>
              <div style="font-size:12px;color:#aaa;margin-top:2px">리뷰 ${reviews}건</div>
            </div>
          </div>
        </div>
        ${kind > 0 ? `<div style="background:#f8f8f8;border-radius:14px;padding:14px 16px">
          <div style="font-size:13px;color:#888;margin-bottom:4px">친절도</div>
          <div style="display:flex;align-items:center;gap:8px">
            <div style="font-size:20px;font-weight:900;color:#F59E0B">${kind.toFixed(1)}</div>
            <div style="font-size:16px;color:#F59E0B">${stars(kind)}</div>
          </div>
        </div>` : ''}
        <div style="background:#FFF0F0;border-radius:14px;padding:12px 14px;font-size:12px;color:#888;line-height:1.6">
          &#128161; 평점은 알바 완료 후 알바생이 남긴 후기를 기반으로 집계됩니다. 높은 평점은 더 많은 지원자를 끌어모아요.
        </div>
      </div>
      <button onclick="this.closest('div[style*=fixed]').remove()" style="width:100%;padding:14px;background:#f0f0f0;color:#555;border:none;border-radius:14px;font-size:14px;font-weight:700;cursor:pointer">닫기</button>
    </div>`;
  document.body.appendChild(el);
}

async function uploadOwnerAvatar(input) {
  const file = input.files[0];
  if (!file || !currentUser || !bizRecord?.id) { if (input) input.value = ''; return; }
  input.value = '';
  openBizCropModal(file, async blob => {
    showToast('업로드 중...');
    const path = `${currentUser.id}/biz-logo_${Date.now()}.jpg`;
    const { error } = await db.storage.from('biz-photos').upload(path, blob, { contentType: 'image/jpeg' });
    if (error) { showToast('업로드 실패: ' + error.message); return; }
    const { data: { publicUrl } } = db.storage.from('biz-photos').getPublicUrl(path);
    await db.from('businesses').update({ photo_url: publicUrl }).eq('id', bizRecord.id);
    bizRecord = { ...bizRecord, photo_url: publicUrl };
    const inner = document.getElementById('owner-header-avatar-inner');
    if (inner) inner.innerHTML = `<img src="${publicUrl}?t=${Date.now()}" style="width:100%;height:100%;object-fit:cover">`;
    showToast('✅ 업체 프로필 사진이 업데이트됐습니다');
  });
}

async function uploadBizPhoto(input) {
  const file = input.files[0];
  if (!file || !currentUser) return;
  if (file.size > 5 * 1024 * 1024) { showToast('5MB 이하 이미지만 업로드 가능합니다'); return; }
  showToast('업로드 중...');
  const path = `${currentUser.id}/biz-photo.jpg`;
  await db.storage.from('biz-photos').remove([path]);
  const { error } = await db.storage.from('biz-photos').upload(path, file, { contentType: 'image/jpeg' });
  if (error) { showToast('업로드 실패: ' + error.message); return; }
  const { data: { publicUrl } } = db.storage.from('biz-photos').getPublicUrl(path);
  await db.from('businesses').update({ photo_url: publicUrl }).eq('id', bizRecord.id);
  bizRecord = { ...bizRecord, photo_url: publicUrl };
  const p = document.getElementById('biz-photo-preview');
  if (p) p.innerHTML = `<img src="${publicUrl}?t=${Date.now()}" style="width:100%;height:100%;object-fit:cover">`;
  showToast('✅ 업체 사진이 업데이트됐습니다');
}

// ── 내 업체 장소 관리 ─────────────────────────────────────
let _bizPlaces = [];
let _addPlaceLat = null, _addPlaceLng = null;

function renderMyPlacesQuick() {
  const wrap = document.getElementById('my-places-quick');
  const list  = document.getElementById('my-places-quick-list');
  if (!wrap || !list) return;
  if (!_bizPlaces.length) { wrap.style.display = 'none'; return; }
  wrap.style.display = 'block';
  const curLat = parseFloat(document.getElementById('f-lat')?.value);
  const curLng = parseFloat(document.getElementById('f-lng')?.value);
  list.innerHTML = _bizPlaces.map(p => {
    const isActive = !isNaN(curLat) && !isNaN(curLng)
      ? Math.abs(p.lat - curLat) < 0.0001 && Math.abs(p.lng - curLng) < 0.0001
      : p.is_default;
    return `
    <button type="button" onclick="applyPlaceToForm('${p.id}')"
      style="width:100%;text-align:left;padding:9px 12px;background:${isActive?'#FFF0F0':'#f8f8f8'};border:1.5px solid ${isActive?'#C8102E':'#eee'};border-radius:10px;cursor:pointer;display:flex;align-items:center;gap:8px">
      <span style="font-size:16px">\u{1F4CD}</span>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:800;color:#222">${p.name}${p.is_default?' <span style="font-size:10px;color:#C8102E">(기본)</span>':''}${isActive?' <span style="font-size:10px;color:#C8102E">✓ 선택됨</span>':''}</div>
        <div style="font-size:11px;color:#aaa;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.address||''}</div>
      </div>
    </button>`;
  }).join('');
}

function applyPlaceToForm(placeId) {
  const p = _bizPlaces.find(x => x.id === placeId);
  if (!p) return;
  document.getElementById('f-lat').value = p.lat;
  document.getElementById('f-lng').value = p.lng;
  if (p.naver_url) document.getElementById('f-naver-link').value = p.naver_url;
  showMiniMap(p.lat, p.lng, p.address || p.name);
  // "업체명\n도로명주소" 포맷으로 저장 — 위치 미설정 방지 + 상세 표기
  const addrSave = p.name + (p.address ? '\n' + p.address : '');
  document.getElementById('f-address').value = addrSave;
  const shortAddr = p.address ? p.address.split(' ').slice(0,3).join(' ') : '';
  document.getElementById('location-result').textContent = '\u{1F4CD} ' + p.name + (shortAddr ? ' · ' + shortAddr : '');
  document.getElementById('location-result').style.display = 'block';
  renderMyPlacesQuick(); // 선택 상태(✓ 선택됨 하이라이트)를 즉시 갱신 - 이게 빠져서 클릭해도 리스트 표시가 안 바뀌던 버그
  showToast(`\u{1F4CD} ${p.name} 선택됨`);
}

// ── 바로만남 미팅 스팟 셀프 등록 (업주) ──────────────────────
async function loadMannamSpotStatus() {
  if (!currentSession?.access_token) return;
  const badge = document.getElementById('mannam-spot-status-badge');
  try {
    const res = await fetch('/api/mannam-owner?action=my_spot', {
      headers: { 'Authorization': 'Bearer ' + currentSession.access_token }
    });
    const data = await res.json();
    const spot = data?.spot;
    if (spot) {
      document.getElementById('mspot-name').value = spot.name || '';
      document.getElementById('mspot-address').value = spot.address || '';
      document.getElementById('mspot-phone').value = spot.phone || '';
      document.getElementById('mspot-menu').value = spot.menu_description || '';
      document.getElementById('mspot-female-price').value = spot.female_price || '';
      document.getElementById('mspot-male-price').value = spot.male_price || '';
      document.getElementById('mspot-discount').value = spot.discount_pct || '';
      if (badge) {
        badge.style.display = 'inline-block';
        if (spot.is_active) { badge.textContent = '운영중'; badge.style.background = '#dcfce7'; badge.style.color = '#16a34a'; }
        else { badge.textContent = '승인대기'; badge.style.background = '#fef3c7'; badge.style.color = '#d97706'; }
      }
    } else if (badge) {
      badge.style.display = 'none';
    }
  } catch (e) { console.error('loadMannamSpotStatus:', e); }
}

async function submitMannamSpot() {
  if (!currentSession?.access_token) { showToast('로그인이 필요합니다'); return; }
  const name = document.getElementById('mspot-name').value.trim();
  const address = document.getElementById('mspot-address').value.trim();
  if (!name) { showToast('매장명을 입력해주세요'); return; }
  if (!address) { showToast('주소를 입력해주세요'); return; }
  const payload = {
    name, address,
    phone: document.getElementById('mspot-phone').value.trim(),
    menu_description: document.getElementById('mspot-menu').value.trim(),
    female_price: document.getElementById('mspot-female-price').value,
    male_price: document.getElementById('mspot-male-price').value,
    discount_pct: document.getElementById('mspot-discount').value,
  };
  try {
    const res = await fetch('/api/mannam-owner?action=submit_spot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + currentSession.access_token },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) { showToast(data.error || '등록에 실패했습니다'); return; }
    showToast('✅ 신청 완료! 관리자 승인 후 노출됩니다');
    loadMannamSpotStatus();
  } catch (e) { showToast('등록 중 오류가 발생했어요'); }
}

async function loadMyPlaces() {
  if (!bizRecord) return;
  const { data } = await db.from('business_places')
    .select('*').eq('business_id', bizRecord.id).order('created_at');
  _bizPlaces = data || [];
  renderMyPlacesList();
  _updateOwnerCompletion();
}

function renderMyPlacesList() {
  const el = document.getElementById('my-places-list');
  if (!_bizPlaces.length) {
    el.innerHTML = `<div style="font-size:12px;color:#bbb;text-align:center;padding:8px">${t('owner_places_hint')}</div>`;
    return;
  }
  el.innerHTML = _bizPlaces.map(p => `
    <div style="display:flex;align-items:center;gap:8px;background:#fff;border-radius:10px;padding:10px 12px;border:1.5px solid ${p.is_default?'#C8102E':'#f0f0f0'}">
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:800;color:#222">${p.name}</div>
        <div style="font-size:11px;color:#aaa;margin-top:2px">${p.address||''}</div>
      </div>
      ${p.is_default ? '<span style="font-size:10px;font-weight:800;color:#C8102E;background:#FFF0F0;padding:2px 6px;border-radius:6px;white-space:nowrap">기본</span>' : `<button onclick="setDefaultPlace('${p.id}')" style="font-size:10px;color:#888;background:#f5f5f5;border:none;border-radius:6px;padding:3px 7px;cursor:pointer">기본 설정</button>`}
      <button onclick="deletePlace('${p.id}')" style="font-size:14px;color:#ccc;background:none;border:none;cursor:pointer;line-height:1;flex-shrink:0">✕</button>
    </div>`).join('');
}

function showAddPlaceForm() {
  document.getElementById('add-place-form').style.display = 'block';
  document.getElementById('place-search-q').value = '';
  document.getElementById('place-add-results').style.display = 'none';
  document.getElementById('place-add-selected').style.display = 'none';
  document.getElementById('place-naver-url').value = '';
  document.getElementById('place-name').value = '';
  document.getElementById('place-address').value = '';
  document.getElementById('place-address-detail').value = '';
  document.getElementById('place-coords-preview').style.display = 'none';
  _addPlaceLat = null; _addPlaceLng = null;
}

async function searchNaverPlaceForAdd(start = 1) {
  const query = document.getElementById('place-search-q').value.trim();
  if (!query) { showToast('업체명을 입력해주세요\n예: 부산 사하구 스타벅스'); return; }
  const btn = document.getElementById('place-search-add-btn');
  btn.textContent = '검색 중...'; btn.disabled = true;
  try {
    const res = await fetch(`/api/naver-search?query=${encodeURIComponent(query)}&start=${start}`, { cache: 'no-store' });
    const data = await res.json();
    if (!res.ok || !data.items?.length) {
      if (start === 1) showToast('검색 결과가 없어요.\n지역명+업체명으로 검색해보세요\n예: 서울 강남 스타벅스');
      else showToast('마지막 페이지입니다');
      return;
    }
    renderPlaceAddResults(data.items, query, start, data.total || 0);
  } catch(e) {
    showToast('검색 중 오류가 발생했어요');
  } finally {
    btn.textContent = '\u{1F50D} 검색'; btn.disabled = false;
  }
}

function renderPlaceAddResults(items, query, start = 1, total = 0) {
  const box = document.getElementById('place-add-results');
  box.style.display = 'block';
  window._naverPlaceAddItems = items;
  const end = start + items.length - 1;
  const hasPrev = start > 1;
  const hasNext = total > end;
  const header = `<div style="padding:7px 12px;font-size:11px;color:#888;border-bottom:1px solid #eee">"${query}" ${total}개 · ${start}~${end}번째</div>`;
  const pageBar = (hasPrev || hasNext) ? `
    <div style="display:flex;align-items:center;gap:6px;padding:7px 10px;border-top:1px solid #eee;background:#fafafa">
      ${hasPrev ? `<button onclick="searchNaverPlaceForAdd(${Math.max(1,start-5)})" style="flex:1;padding:6px;border:1.5px solid #ddd;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;background:#fff">◀ 이전</button>` : `<div style="flex:1"></div>`}
      <span style="font-size:10px;color:#bbb">${Math.ceil(start/5)}/${Math.ceil(total/5)}p</span>
      ${hasNext ? `<button onclick="searchNaverPlaceForAdd(${start+5})" style="flex:1;padding:6px;border:1.5px solid #ddd;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;background:#fff">다음 ▶</button>` : `<div style="flex:1"></div>`}
    </div>` : '';
  box.innerHTML = header + items.map((item, i) => `
    <div onclick="selectPlaceForAdd(${i})" style="padding:10px 12px;border-bottom:1px solid #eee;cursor:pointer" onmouseover="this.style.background='#fff'" onmouseout="this.style.background=''">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px">
        <span style="font-size:13px;font-weight:800;color:#222">${item.title}</span>
        ${item.link ? '<span style="font-size:10px;font-weight:700;background:#E6F4EA;color:#1a7d3b;padding:2px 5px;border-radius:5px">N</span>' : ''}
      </div>
      <div style="font-size:11px;color:#aaa">${item.roadAddress || item.address || ''}</div>
    </div>`).join('') + pageBar;
}

function selectPlaceForAdd(idx) {
  const item = window._naverPlaceAddItems[idx];
  _addPlaceLat = item.lat;
  _addPlaceLng = item.lng;
  document.getElementById('place-name').value = item.title;
  document.getElementById('place-naver-url').value = item.link || '';
  document.getElementById('place-address').value = item.roadAddress || item.address || '';
  document.getElementById('place-add-results').style.display = 'none';
  const selBox = document.getElementById('place-add-selected');
  selBox.style.display = 'block';
  document.getElementById('place-add-selected-name').textContent = item.title;
  document.getElementById('place-add-selected-addr').textContent = item.roadAddress || item.address || '';
  const preview = document.getElementById('place-coords-preview');
  preview.textContent = `✅ ${item.roadAddress || item.address}`;
  preview.style.display = 'block';
}

function geocodePlaceAddress() {
  if (!window.daum?.Postcode) { showToast('주소 검색 서비스 로딩 중...'); return; }
  new daum.Postcode({
    oncomplete(data) {
      // 도로명 주소 우선, 없으면 지번 주소
      const addr = data.roadAddress || data.jibunAddress;
      document.getElementById('place-address').value = addr;
      document.getElementById('place-address-detail').focus();

      // 카카오 지오코딩으로 위도/경도 자동 획득
      if (!window.kakao?.maps?.services) { showToast('좌표 변환 서비스 로딩 중...'); return; }
      new kakao.maps.services.Geocoder().addressSearch(addr, (result, status) => {
        if (status !== kakao.maps.services.Status.OK) { showToast('좌표 변환 실패. 다시 시도해주세요'); return; }
        _addPlaceLat = parseFloat(result[0].y);
        _addPlaceLng = parseFloat(result[0].x);
        const preview = document.getElementById('place-coords-preview');
        preview.textContent = `✅ ${addr}`;
        preview.style.display = 'block';
      });
    }
  }).open();
}

async function savePlaceToList() {
  const name       = document.getElementById('place-name').value.trim();
  const baseAddr   = document.getElementById('place-address').value.trim();
  const detailAddr = document.getElementById('place-address-detail').value.trim();
  const address    = detailAddr ? `${baseAddr} ${detailAddr}` : baseAddr;
  const naverUrl   = document.getElementById('place-naver-url').value.trim();
  if (!name) { showToast('장소 이름을 입력해주세요'); return; }
  if (!_addPlaceLat || !_addPlaceLng) { showToast('업체명 검색으로 장소를 선택하거나\n기본주소 \u{1F4CD}찾기를 해주세요'); return; }

  const isFirst = _bizPlaces.length === 0;
  const { error } = await db.from('business_places').insert({
    business_id: bizRecord.id,
    name, address, lat: _addPlaceLat, lng: _addPlaceLng,
    naver_url: naverUrl || null,
    is_default: isFirst
  });
  if (error) { showToast('저장 실패: ' + error.message); return; }
  document.getElementById('add-place-form').style.display = 'none';
  showToast('✅ 장소가 추가됐습니다');
  await loadMyPlaces();
}

async function setDefaultPlace(placeId) {
  await db.from('business_places').update({ is_default: false }).eq('business_id', bizRecord.id);
  await db.from('business_places').update({ is_default: true }).eq('id', placeId);
  await loadMyPlaces();
}

function deletePlace(placeId) {
  showConfirm('', async () => {
    await db.from('business_places').delete().eq('id', placeId);
    await loadMyPlaces();
  }, {icon:'🗑️', title:'장소 삭제', okLabel:'삭제', danger:true});
}

async function saveOwnerSettingsProfile() {
  if (!bizRecord) return;
  const name  = document.getElementById('settings-biz-name').value.trim();
  const phone = document.getElementById('settings-biz-phone').value.trim();
  const desc  = document.getElementById('settings-biz-desc').value.trim();
  if (desc.length > 0 && desc.length < 20) { showToast('업체 소개는 20자 이상 입력해주세요'); return; }
  const { error } = await db.from('businesses')
    .update({ name: name || bizRecord.name, phone, description: desc })
    .eq('id', bizRecord.id);
  if (error) { showToast('저장 실패: ' + error.message); return; }
  localStorage.setItem('baroalba_lang', _pendingLang);
  location.reload();
}

function toggleOwnerPwForm() {
  const f = document.getElementById('owner-pw-form');
  f.style.display = f.style.display === 'none' ? 'block' : 'none';
}

async function submitOwnerPw() {
  const pw  = document.getElementById('owner-new-pw').value;
  const pw2 = document.getElementById('owner-new-pw2').value;
  if (pw.length < 6) { showToast('비밀번호는 6자 이상이어야 합니다'); return; }
  if (pw !== pw2)    { showToast('비밀번호가 일치하지 않습니다'); return; }
  const { error } = await db.auth.updateUser({ password: pw });
  if (error) { showToast('변경 실패: ' + error.message); return; }
  showToast('✅ 비밀번호가 변경됐습니다');
  document.getElementById('owner-pw-form').style.display = 'none';
  document.getElementById('panel-owner-settings').classList.remove('show');
}

function deleteOwnerAccount() {
  showConfirm('등록한 공고와 지원자 데이터가 모두 삭제됩니다.', () => {
    showConfirm('탈퇴 후 복구가 불가능합니다.', async () => {
      if (bizRecord) await db.from('businesses').delete().eq('id', bizRecord.id);
      await db.auth.signOut();
      localStorage.removeItem('baroalba_guest');
      showAlert('탈퇴가 완료됐습니다.\n로그인 화면으로 이동합니다.', {icon:'👋'});
      setTimeout(() => location.href = '/login.html', 1800);
    }, {icon:'⚠️', title:'마지막 확인', okLabel:'탈퇴 확정', danger:true});
  }, {icon:'🚫', title:'정말 탈퇴하시겠어요?', okLabel:'계속', danger:true});
}

// ── 플랜 & 결제 ──────────────────────────────────────────
let _currentPlan = 'free';
let _selectedPlan = 'free';

const PLAN_INFO = {
  free:  { name: '무료 플랜',   amount: '₩0',        monthly: 0 },
  basic: { name: '베이직 플랜', amount: '₩9,900/월',  monthly: 9900 },
  pro:   { name: '프로 플랜',   amount: '₩29,900/월', monthly: 29900 },
};
const TOSS_CLIENT_KEY = 'test_ck_24xLea5zVA660wge91nyrQAMYNwW'; // API 개별 연동 키 (v1 SDK용)
let _selectedPayMethod = '카드';

function selectPayMethod(el, method) {
  _selectedPayMethod = method;
  document.querySelectorAll('#pay-method-grid > div').forEach(d => {
    d.style.border = '1.5px solid #e5e7eb';
    d.style.background = '#fff';
  });
  el.style.border = '2px solid #C8102E';
  el.style.background = '#fff9f9';
}

const PLAN_DETAILS = {
  basic: {
    color: '#C8102E',
    badge: '베이직',
    features: [
      '<strong style="font-size:11px;color:#888;display:block;margin-bottom:4px">💼 업주 혜택</strong>',
      '📢 공고 등록 슬롯 <strong>5개</strong> (무료: 1개)',
      '⚡ 시급 서지 자동 스케줄 설정',
      '👥 지원자 2명 나란히 비교',
      '📋 공고 복사 1클릭 재등록',
      '📊 공고별 조회수 트래킹',
      '⭐ 즐겨찾는 알바생 북마크',
      '<strong style="font-size:11px;color:#7C3AED;display:block;margin-top:6px;margin-bottom:4px">🤝 바로모임 혜택</strong>',
      '🎪 모임 <strong>월 10개</strong> 개설 (무료: 1개)',
      '🔗 비공개 모임 초대링크 무제한',
      '💬 단체채팅방 개설 무제한',
    ],
  },
  pro: {
    color: '#7C3AED',
    badge: '프로',
    features: [
      '<strong style="font-size:11px;color:#888;display:block;margin-bottom:4px">💼 업주 혜택</strong>',
      '🔥 프리미엄 노출 — 검색 상단 고정 (지원율 3배)',
      '📢 공고 등록 슬롯 <strong>무제한</strong>',
      '⚡ 시급 서지 자동 스케줄 설정',
      '👥 지원자 2명 나란히 비교',
      '📋 공고 복사 1클릭 재등록',
      '📊 공고별 조회수 트래킹',
      '⭐ 즐겨찾는 알바생 북마크',
      '<strong style="font-size:11px;color:#7C3AED;display:block;margin-top:6px;margin-bottom:4px">🤝 바로모임 혜택</strong>',
      '🎪 모임 <strong>무제한</strong> 개설',
      '🔗 비공개 모임 초대링크 무제한',
      '💬 단체채팅방 개설 무제한',
      '⭐ 모임 상단 추천 노출',
    ],
  },
};

function renderPlanDetails(plan) {
  const el = document.getElementById('pay-plan-details');
  if (!el) return;
  const d = PLAN_DETAILS[plan];
  if (!d) { el.innerHTML = ''; return; }
  el.innerHTML = `
    <div style="border:2px solid ${d.color}22;border-radius:12px;overflow:hidden">
      <div style="background:${d.color}11;padding:10px 14px;border-bottom:1px solid ${d.color}22">
        <span style="font-size:12px;font-weight:800;color:${d.color}">${d.badge} 플랜 혜택</span>
      </div>
      <div style="padding:12px 14px;display:flex;flex-direction:column;gap:7px">
        ${d.features.map(f => `<div style="font-size:12px;color:#333;line-height:1.4">${f}</div>`).join('')}
      </div>
    </div>`;
}

function renderPlanUI() {
  const badge = document.getElementById('plan-badge');
  if (!badge) return;
  const p = PLAN_INFO[_currentPlan];
  badge.textContent = p.name;
  badge.style.background = _currentPlan === 'pro' ? '#EDE9FE' : _currentPlan === 'basic' ? '#FFF0F0' : '#e5e7eb';
  badge.style.color      = _currentPlan === 'pro' ? '#7C3AED' : _currentPlan === 'basic' ? '#C8102E' : '#555';
  ['free','basic','pro'].forEach(k => {
    const card = document.getElementById('plan-' + k);
    if (!card) return;
    card.style.border = k === _currentPlan ? '2px solid #C8102E' : '2px solid transparent';
    card.style.background = k === _currentPlan ? '#FFF5F5' : '#fff';
  });
}

function togglePremiumPosting(el) {
  const isOn = el.dataset.on === 'true';
  if (!isOn && _currentPlan === 'free') {
    showToast('⭐ 프리미엄 노출은 프로 플랜 전용 기능입니다\n마이페이지에서 플랜을 업그레이드해 보세요!');
    return;
  }
  const next = !isOn;
  el.dataset.on = String(next);
  el.style.background = next ? '#7C3AED' : '#e5e7eb';
  el.querySelector('div').style.transform = next ? 'translateX(20px)' : 'translateX(0)';
  document.getElementById('f-is-premium').value = String(next);
}

function toggleAgeLimit(el) {
  const next = el.dataset.on !== 'true';
  el.dataset.on = String(next);
  el.style.background = next ? '#EA580C' : '#e5e7eb';
  el.querySelector('div').style.transform = next ? 'translateX(20px)' : 'translateX(0)';
  document.getElementById('f-age-limit').value = String(next);
}

function setAgeLimit(val) {
  document.getElementById('f-age-limit').value = val ? 'true' : 'false';
  const el = document.getElementById('age-limit-toggle');
  if (!el) return;
  el.dataset.on = String(val);
  el.style.background = val ? '#EA580C' : '#e5e7eb';
  el.querySelector('div').style.transform = val ? 'translateX(20px)' : 'translateX(0)';
}

function toggleJobLang(btn) {
  btn.classList.toggle('l-chip-on');
  const selected = [...document.querySelectorAll('#f-lang-chips [data-l].l-chip-on')].map(b => b.dataset.l);
  document.getElementById('f-pref-langs').value = JSON.stringify(selected);
}

function setJobLangs(langs) {
  document.querySelectorAll('#f-lang-chips [data-l]').forEach(b => b.classList.remove('l-chip-on'));
  const arr = Array.isArray(langs) ? langs : [];
  arr.forEach(l => {
    const b = document.querySelector(`#f-lang-chips [data-l="${l}"]`);
    if (b) b.classList.add('l-chip-on');
  });
  document.getElementById('f-pref-langs').value = JSON.stringify(arr);
}

function _updateLangFilterBtn() {
  const btn = document.getElementById('flt-lang-btn');
  if (!btn) return;
  btn.style.display = _myLangs.length ? '' : 'none';
}

function toggleLangFilter() {
  _langFilterActive = !_langFilterActive;
  const btn = document.getElementById('flt-lang-btn');
  if (btn) btn.classList.toggle('active', _langFilterActive);
  loadJobs();
}

async function selectPlan(plan) {
  if (plan === _currentPlan) { showToast('현재 이용 중인 플랜입니다'); return; }
  if (plan === 'free') { showToast('무료 플랜은 언제든 해지 시 자동 전환됩니다'); return; }
  if (!currentUser) { showLoginPrompt('로그인이 필요해요', '플랜 구독은 로그인 후 이용 가능합니다.'); return; }
  _selectedPlan = plan;
  _selectedPayMethod = '카드';
  const info = PLAN_INFO[plan];
  document.getElementById('pay-title').textContent = info.name + ' 구독';
  document.getElementById('pay-plan-name').textContent = info.name;
  document.getElementById('pay-amount').textContent = info.amount;
  renderPlanDetails(plan);
  // 결제수단 초기화 (카드 기본 선택)
  const cardEl = document.getElementById('pm-card');
  if (cardEl) selectPayMethod(cardEl, '카드');
  document.getElementById('payment-overlay').style.display = 'block';
}

function closePayment() {
  document.getElementById('payment-overlay').style.display = 'none';
  const btn = document.getElementById('payment-confirm-btn');
  if (btn) { btn.disabled = false; btn.textContent = '결제하기'; }
  _selectedPlan = null;
}
// 토스 결제창에서 뒤로가기 시 버튼 상태 복원
window.addEventListener('pageshow', () => {
  const btn = document.getElementById('payment-confirm-btn');
  if (btn && btn.textContent === '처리 중...') { btn.disabled = false; btn.textContent = '결제하기'; }
});

async function requestTossPayment() {
  if (!_selectedPlan) return;
  if (typeof TossPayments === 'undefined') { showToast('결제 모듈 로드 실패. 페이지를 새로고침 해주세요.'); return; }
  const btn = document.getElementById('payment-confirm-btn');
  if (btn) { btn.disabled = true; btn.textContent = '처리 중...'; }
  const info = PLAN_INFO[_selectedPlan];
  const orderId = `baro-${_selectedPlan}-${Date.now()}`;
  const base = window.location.origin + window.location.pathname;
  try {
    const tossPayments = TossPayments(TOSS_CLIENT_KEY);
    await tossPayments.requestPayment(_selectedPayMethod, {
      amount: info.monthly,
      orderId,
      orderName: info.name + ' 월 구독',
      successUrl: `${base}?payment=success&orderId=${orderId}&plan=${_selectedPlan}&amount=${info.monthly}`,
      failUrl: `${base}?payment=fail`,
      customerEmail: currentUser.email || '',
      customerName: currentUser.user_metadata?.full_name || '사업주',
    });
  } catch (e) {
    console.error('Toss requestPayment error:', e);
    if (e.code !== 'USER_CANCEL') showToast('결제 오류: ' + (e.message || JSON.stringify(e)));
    if (btn) { btn.disabled = false; btn.textContent = '결제하기'; }
  }
}

// 결제 완료 후 URL 파라미터 처리
async function handlePaymentResult() {
  const params = new URLSearchParams(window.location.search);
  const result = params.get('payment');
  if (!result) return;
  // URL 파라미터 제거
  window.history.replaceState({}, '', window.location.pathname);
  if (result === 'fail') { showToast('결제가 취소됐습니다'); return; }
  if (result !== 'success') return;
  const paymentKey = params.get('paymentKey');
  const orderId = params.get('orderId');
  const amount = params.get('amount');
  const plan = params.get('plan');
  if (!paymentKey || !orderId || !amount) return;
  showToast('결제 확인 중...');
  try {
    const res = await fetch('/api/toss-confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentKey, orderId, amount: Number(amount), plan, businessId: currentUser?.id }),
    });
    const data = await res.json();
    if (data.success) {
      showToast('✅ 결제가 완료됐습니다! ' + PLAN_INFO[plan]?.name + ' 이용을 시작합니다.');
      _currentPlan = plan;
      renderPlanUI();
    } else {
      showToast('결제 확인 실패: ' + (data.error || '오류'));
    }
  } catch (e) {
    showToast('결제 확인 중 오류가 발생했습니다');
  }
}

// 기존 startTossPayment 호환 (버튼에서 혹시 호출 시)
function startTossPayment() { requestTossPayment(); }

// ── 시작/종료 시간 셀렉트 헬퍼 ──────────────────────────────
function buildTimeSelects() {
  initDateSelects();
  ['f-start-hour','f-end-hour'].forEach(id => {
    const el = document.getElementById(id);
    if (!el || el.options.length) return;
    for (let h = 0; h < 24; h++) {
      const o = document.createElement('option');
      o.value = h;
      o.textContent = String(h).padStart(2,'0') + '시';
      el.appendChild(o);
    }
  });
  ['f-start-min','f-end-min'].forEach(id => {
    const el = document.getElementById(id);
    if (!el || el.options.length) return;
    for (let m = 0; m < 60; m += 5) {
      const o = document.createElement('option');
      o.value = m;
      o.textContent = String(m).padStart(2,'0') + '분';
      el.appendChild(o);
    }
  });
  ['f-start-hour','f-start-min','f-end-hour','f-end-min'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', updateDurationDisplay);
  });
}

function initDateSelects() {
  // 오늘 날짜를 기본값으로 표시
  const inp = document.getElementById('f-start-date');
  if (!inp) return;
  const now = new Date();
  const y = now.getFullYear(), mo = String(now.getMonth()+1).padStart(2,'0'), d = String(now.getDate()).padStart(2,'0');
  inp.value = `${y}-${mo}-${d}`;
  inp.min   = `${y}-${mo}-${d}`;
  updateStartDateDisplay();
}

function updateStartDateDisplay() {
  const val = document.getElementById('f-start-date')?.value;
  const disp = document.getElementById('f-start-date-display');
  if (!disp) return;
  if (!val) { disp.textContent = '날짜 선택'; return; }
  const [y, mo, d] = val.split('-');
  disp.textContent = `${y}년 ${parseInt(mo)}월 ${parseInt(d)}일`;
}

function syncDateHidden() {} // 구형 코드 호환 유지

function setTimeSelects(prefix, date) {
  if (prefix === 'start') {
    const y  = date.getFullYear();
    const mo = String(date.getMonth()+1).padStart(2,'0');
    const d  = String(date.getDate()).padStart(2,'0');
    const inp = document.getElementById('f-start-date');
    if (inp) { inp.value = `${y}-${mo}-${d}`; updateStartDateDisplay(); }
  }
  const h = document.getElementById(`f-${prefix}-hour`);
  const m = document.getElementById(`f-${prefix}-min`);
  if (h) h.value = date.getHours();
  if (m) m.value = Math.round(date.getMinutes() / 5) * 5 % 60;
  updateDurationDisplay();
}

function getTimeValue(prefix) {
  const h = parseInt(document.getElementById(`f-${prefix}-hour`)?.value) || 0;
  const m = parseInt(document.getElementById(`f-${prefix}-min`)?.value) || 0;
  const workType = document.getElementById('f-work-type')?.value || 'spot';
  const isScheduled = workType !== 'spot' && workType !== 'errand';
  const dateStr = isScheduled
    ? document.getElementById('f-period-start')?.value
    : document.getElementById('f-start-date')?.value;
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  d.setHours(h, m, 0, 0);
  return d;
}

function updateDurationDisplay() {
  const s = getTimeValue('start');
  const e = getTimeValue('end');
  const el = document.getElementById('f-duration-display');
  if (!el) return;
  if (s && e && e > s) {
    const mins = Math.round((e - s) / 60000);
    const h = Math.floor(mins / 60), min = mins % 60;
    el.textContent = min ? `${h}시간 ${min}분` : `${h}시간`;
    el.style.color = '#333';
  } else if (s && e && e <= s) {
    el.textContent = '⚠️';
    el.style.color = '#E53935';
  } else {
    el.textContent = '';
  }
}

function formatTime(iso) {
  if (!iso) return '미정';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '미정';
  const now = new Date();
  const diff = d - now;
  if (diff < 0) return t('status_ongoing');
  if (diff < 3600000) return Math.round(diff/60000) + '분 후';
  if (diff < 86400000) return Math.round(diff/3600000) + '시간 후';
  return `${d.getMonth()+1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}`;
}

async function logout() {
  await db.auth.signOut();
  localStorage.removeItem('baroalba_guest');
  location.href = '/login.html';
}

// ── 업주 알림 시스템 ─────────────────────────────────────
function _ownerNotiKey() { return 'owner_noti_last_seen_' + (currentUser?.id || 'guest'); }
function _ownerTimeAgo(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return '방금'; if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  return d < 7 ? `${d}일 전` : new Date(iso).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
}

async function _fetchOwnerNotifications() {
  if (!currentUser || !bizRecord) return [];
  // 내 공고의 최근 지원자 이벤트
  const { data: apps } = await db.from('applications')
    .select('id, status, applied_at, updated_at, workers(name), job_postings(title)')
    .eq('job_postings.businesses.kakao_uid', currentUser.id)
    .order('applied_at', { ascending: false })
    .limit(40);

  // bizRecord.id로 직접 조회 (FK join 복잡도 우회)
  const { data: myPostings } = await db.from('job_postings').select('id').eq('business_id', bizRecord.id);
  const postingIds = (myPostings || []).map(p => p.id);
  if (!postingIds.length) return [];

  const { data: recentApps } = await db.from('applications')
    .select('id, status, applied_at, updated_at, workers(name), job_postings(title)')
    .in('job_posting_id', postingIds)
    .order('applied_at', { ascending: false })
    .limit(40);

  const items = [];
  (recentApps || []).forEach(app => {
    const name = app.workers?.name || '지원자';
    const title = app.job_postings?.title || '공고';
    if (app.status === 'pending') {
      items.push({ icon: '\u{1F4E5}', color: '#C8102E', title: `${name}님이 지원했어요`, body: `"${title}"`, time: app.applied_at });
    } else if (app.status === 'accepted') {
      items.push({ icon: '\u{2705}', color: '#C8102E', title: `${name}님 합격 처리됨`, body: `"${title}"`, time: app.updated_at });
    } else if (app.status === 'cancelled') {
      items.push({ icon: '\u{1F6AB}', color: '#aaa', title: `${name}님이 지원 취소했어요`, body: `"${title}"`, time: app.updated_at });
    } else if (app.status === 'completed') {
      items.push({ icon: '\u{1F3C1}', color: '#C8102E', title: `${name}님 근무 완료`, body: `"${title}"`, time: app.updated_at });
    } else if (app.status === 'noshow') {
      items.push({ icon: '\u{1F613}', color: '#aaa', title: `${name}님 노쇼 처리됨`, body: `"${title}"`, time: app.updated_at });
    }
  });

  // 커뮤니티 댓글 알림 (내 게시글에 달린 새 댓글)
  if (getOwnerNotiSetting('comment')) {
    const lastSeen = parseInt(localStorage.getItem(_ownerNotiKey()) || '0');
    if (lastSeen > 0) {
      try {
        const { data: myPosts } = await db.from('community_posts')
          .select('id, title').eq('business_id', bizRecord.id).eq('is_deleted', false);
        if (myPosts?.length) {
          const ids = myPosts.map(p => p.id);
          const postMap = Object.fromEntries(myPosts.map(p => [p.id, p.title]));
          const { data: newCmts } = await db.from('community_comments')
            .select('id, content, created_at, post_id, workers(name), businesses(biz_name)')
            .in('post_id', ids)
            .gt('created_at', new Date(lastSeen).toISOString())
            .is('business_id', null)
            .order('created_at', { ascending: false })
            .limit(10);
          (newCmts || []).forEach(c => {
            const ptitle = postMap[c.post_id] || '게시글';
            const commenter = c.workers?.name || c.businesses?.biz_name || '누군가';
            items.push({
              id: 'comm_cmt_' + c.id, icon: '&#x1F4AC;', color: '#7C3AED',
              title: `"${ptitle.slice(0,20)}"에 댓글이 달렸어요`,
              body: `${commenter}: "${c.content.slice(0,40)}"`,
              time: c.created_at
            });
          });
        }
      } catch(e) {}
    }
  }

  return items;
}

async function updateOwnerNotiBadge() {
  if (!currentUser) return;
  const items = await _fetchOwnerNotifications();
  const lastSeen = parseInt(localStorage.getItem(_ownerNotiKey()) || '0');
  const unread = items.filter(it => it.time && new Date(it.time).getTime() > lastSeen).length;
  const badge = document.getElementById('owner-noti-badge');
  const bell = document.getElementById('owner-noti-bell');
  if (bell) bell.style.display = 'block';
  if (!badge) return;
  if (unread > 0) {
    badge.textContent = unread > 9 ? '9+' : unread; badge.style.display = 'flex';
    if ('setAppBadge' in navigator) navigator.setAppBadge(unread).catch(() => {});
  } else {
    badge.style.display = 'none';
    if ('clearAppBadge' in navigator) navigator.clearAppBadge().catch(() => {});
  }
}

async function openOwnerNotifications() {
  const lastSeen = parseInt(localStorage.getItem(_ownerNotiKey()) || '0');
  localStorage.setItem(_ownerNotiKey(), Date.now().toString());
  const badge = document.getElementById('owner-noti-badge');
  if (badge) badge.style.display = 'none';
  if ('clearAppBadge' in navigator) navigator.clearAppBadge().catch(() => {});

  const existing = document.getElementById('owner-noti-overlay');
  if (existing) { existing.remove(); return; }

  const overlay = document.createElement('div');
  overlay.id = 'owner-noti-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:9000;display:flex;align-items:flex-end';
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
  overlay.innerHTML = `
    <div style="background:#fff;border-radius:24px 24px 0 0;width:100%;max-height:80vh;display:flex;flex-direction:column">
      <div style="padding:16px 20px 12px;border-bottom:1px solid #f0f0f0;display:flex;align-items:center;justify-content:space-between;flex-shrink:0">
        <div style="font-size:17px;font-weight:900">\u{1F514} 알림</div>
        <button onclick="document.getElementById('owner-noti-overlay').remove()" style="font-size:22px;color:#aaa;background:none;border:none;cursor:pointer">✕</button>
      </div>
      <div id="owner-noti-list" style="overflow-y:auto;padding:10px 16px 40px;flex:1">
        <div style="text-align:center;padding:24px"><div class="spinner"></div></div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const items = await _fetchOwnerNotifications();
  const listEl = document.getElementById('owner-noti-list');
  if (!listEl) return;

  if (!items.length) {
    listEl.innerHTML = '<div style="text-align:center;padding:40px 0;color:#aaa"><div style="font-size:36px;margin-bottom:10px">\u{1F515}</div><div style="font-size:14px;font-weight:700">아직 알림이 없어요</div><div style="font-size:12px;margin-top:4px">공고를 등록하면 지원자 알림을 받아요</div></div>';
    return;
  }

  listEl.innerHTML = items.map(it => {
    const isNew = it.time && new Date(it.time).getTime() > lastSeen;
    return `
      <div style="display:flex;gap:12px;padding:12px 0;border-bottom:1px solid #f8f8f8;align-items:flex-start">
        <div style="width:40px;height:40px;border-radius:50%;background:${it.color}22;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0">${it.icon}</div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px">
            <div style="font-size:14px;font-weight:800;color:#222;line-height:1.4">${it.title}</div>
            ${isNew ? '<span style="min-width:7px;height:7px;border-radius:50%;background:#C8102E;flex-shrink:0;display:inline-block"></span>' : ''}
          </div>
          ${it.body ? `<div style="font-size:12px;color:#888">${it.body}</div>` : ''}
          ${it.time ? `<div style="font-size:11px;color:#bbb;margin-top:4px">${_ownerTimeAgo(it.time)}</div>` : ''}
        </div>
      </div>`;
  }).join('');
}

// ── 신고하기 ─────────────────────────────────────────────
let _ownerReportType = null;
let _ownerReportTargetId = null;

const OWNER_REPORT_REASONS = ['부적절한 언행', '허위 프로필', '개인정보 침해', '노쇼/무단이탈', '기타'];

function openOwnerReport(targetType, targetId) {
  if (!currentUser || !targetId) return;
  _ownerReportType = targetType;
  _ownerReportTargetId = targetId;
  document.getElementById('owner-report-reason-list').innerHTML = OWNER_REPORT_REASONS.map(r =>
    `<label style="display:flex;align-items:center;gap:10px;padding:12px 14px;background:#f8f8f8;border-radius:12px;cursor:pointer;font-size:14px;font-weight:600;color:#333">
      <input type="radio" name="owner-report-reason" value="${r}" style="accent-color:var(--red);width:16px;height:16px">${r}
    </label>`
  ).join('');
  document.getElementById('owner-report-detail').value = '';
  document.getElementById('owner-report-modal').classList.add('open');
}

function closeOwnerReport() {
  document.getElementById('owner-report-modal').classList.remove('open');
}

async function submitOwnerReport() {
  const reason = document.querySelector('input[name="owner-report-reason"]:checked')?.value;
  if (!reason) { showToast('신고 사유를 선택해주세요'); return; }
  const detail = document.getElementById('owner-report-detail').value.trim();
  try {
    const sess = (await db.auth.getSession()).data.session;
    const res = await fetch(`${SUPABASE_URL}/rest/v1/reports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sess?.access_token },
      body: JSON.stringify({ reporter_id: currentUser.id, target_id: _ownerReportTargetId, target_type: _ownerReportType, reason, detail })
    });
    if (!res.ok) throw new Error(await res.text());
    showToast('신고가 접수됐습니다. 검토 후 조치하겠습니다');
  } catch(e) {
    showToast('신고 접수 중 오류가 발생했습니다');
  }
  closeOwnerReport();
}



// OWNER_LANG_DESC, OWNER_UI, ownerApplyLang, ownerSelectLang, ownerSaveLang
// → shared-lang.js의 applyLang(), selectLang()으로 통합됨

// ── 업체 사진 (최대 5장) ─────────────────────────────────
let _bizPhotos = [];
let _bizCropper = null;
let _bizCropCallback = null;

function openBizCropModal(file, callback) {
  _bizCropCallback = callback;
  const modal = document.getElementById('biz-crop-modal');
  modal.style.display = 'flex';
  const img = document.getElementById('biz-crop-source');
  const reader = new FileReader();
  reader.onload = e => {
    img.src = e.target.result;
    if (_bizCropper) { _bizCropper.destroy(); _bizCropper = null; }
    img.onload = () => {
      _bizCropper = new Cropper(img, { aspectRatio: 1, viewMode: 1, autoCropArea: 0.9 });
    };
  };
  reader.readAsDataURL(file);
}

function closeBizCropModal() {
  document.getElementById('biz-crop-modal').style.display = 'none';
  if (_bizCropper) { _bizCropper.destroy(); _bizCropper = null; }
}

function applyBizCrop() {
  if (!_bizCropper || !_bizCropCallback) return;
  _bizCropper.getCroppedCanvas({ width: 800, height: 800 }).toBlob(blob => {
    closeBizCropModal();
    _bizCropCallback(blob);
  }, 'image/jpeg', 0.88);
}

async function loadBizPhotos() {
  if (!bizRecord?.id) return;
  const { data } = await db.from('business_photos').select('*').eq('business_id', bizRecord.id).order('sort_order');
  _bizPhotos = data || [];
  _renderBizPhotos();
  _updateOwnerCompletion();
}

let _dragSrcId = null;

function _renderBizPhotos() {
  const grid = document.getElementById('biz-photos-grid');
  const addBtn = document.getElementById('biz-add-photo-btn');
  if (!grid) return;
  grid.innerHTML = _bizPhotos.map((p, i) =>
    `<div draggable="true" data-photo-id="${p.id}"
      ondragstart="bizPhotoDragStart(event,'${p.id}')"
      ondragover="bizPhotoDragOver(event)"
      ondragenter="bizPhotoDragEnter(event,this)"
      ondragleave="bizPhotoDragLeave(event,this)"
      ondrop="bizPhotoDrop(event,'${p.id}',this)"
      onclick="openImgViewer('${p.photo_url}')"
      style="position:relative;aspect-ratio:1;border-radius:10px;overflow:hidden;border:2px solid #eee;cursor:pointer;transition:outline 0.1s">
      <img src="${p.photo_url}" style="width:100%;height:100%;object-fit:cover;pointer-events:none">
      <span style="position:absolute;bottom:3px;left:4px;background:rgba(0,0,0,0.45);color:#fff;font-size:9px;font-weight:800;padding:1px 5px;border-radius:4px;pointer-events:none">${i+1}</span>
      <button onclick="event.stopPropagation();deleteBizPhoto('${p.id}')" style="position:absolute;top:3px;right:3px;width:20px;height:20px;border-radius:50%;background:rgba(0,0,0,0.55);color:#fff;border:none;font-size:13px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center">×</button>
    </div>`
  ).join('');
  if (addBtn) addBtn.style.display = _bizPhotos.length < 5 ? 'block' : 'none';
  _setupTouchDnd(grid, async (srcId, dstId) => {
    const src = _bizPhotos.find(p => p.id === srcId);
    const dst = _bizPhotos.find(p => p.id === dstId);
    if (!src || !dst) return;
    await Promise.all([
      db.from('business_photos').update({ sort_order: dst.sort_order }).eq('id', src.id),
      db.from('business_photos').update({ sort_order: src.sort_order }).eq('id', dst.id),
    ]);
    loadBizPhotos();
  });
}

function bizPhotoDragStart(e, photoId) {
  _dragSrcId = photoId;
  e.dataTransfer.effectAllowed = 'move';
}
function bizPhotoDragOver(e) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }
function bizPhotoDragEnter(e, el) {
  e.preventDefault();
  if (!el.contains(e.relatedTarget)) { el.style.outline = '3px solid #C8102E'; el.style.outlineOffset = '-3px'; }
}
function bizPhotoDragLeave(e, el) {
  if (!el.contains(e.relatedTarget)) { el.style.outline = ''; el.style.outlineOffset = ''; }
}
async function bizPhotoDrop(e, photoId, el) {
  e.preventDefault();
  el.style.outline = ''; el.style.outlineOffset = '';
  if (!_dragSrcId || _dragSrcId === photoId) { _dragSrcId = null; return; }
  const src = _bizPhotos.find(p => p.id === _dragSrcId);
  const dst = _bizPhotos.find(p => p.id === photoId);
  if (!src || !dst) { _dragSrcId = null; return; }
  const srcOrder = src.sort_order, dstOrder = dst.sort_order;
  await Promise.all([
    db.from('business_photos').update({ sort_order: dstOrder }).eq('id', src.id),
    db.from('business_photos').update({ sort_order: srcOrder }).eq('id', dst.id),
  ]);
  _dragSrcId = null;
  await loadBizPhotos();
}

function _setupTouchDnd(grid, swapFn, attr = 'data-photo-id') {
  document.querySelectorAll('.dnd-ghost').forEach(g => g.remove());
  let srcEl = null, ghostEl = null;
  const sel = '[' + attr + ']';
  const cleanup = () => {
    if (ghostEl) { ghostEl.remove(); ghostEl = null; }
    if (srcEl) { srcEl.style.opacity = ''; srcEl = null; }
    grid.querySelectorAll('[draggable]').forEach(c => { c.style.outline = ''; c.style.outlineOffset = ''; });
  };
  grid.querySelectorAll('[draggable]').forEach(el => {
    el.addEventListener('touchstart', e => {
      cleanup();
      srcEl = el;
      const r = el.getBoundingClientRect();
      ghostEl = el.cloneNode(true);
      ghostEl.classList.add('dnd-ghost');
      Object.assign(ghostEl.style, {
        position:'fixed', zIndex:'9999', pointerEvents:'none', opacity:'0.75',
        width: r.width+'px', height: r.height+'px', top: r.top+'px', left: r.left+'px',
        borderRadius:'10px', boxShadow:'0 8px 24px rgba(0,0,0,0.3)', transition:'none'
      });
      document.body.appendChild(ghostEl);
      el.style.opacity = '0.3';
    }, { passive: true });
    el.addEventListener('touchmove', e => {
      if (!ghostEl) return;
      e.preventDefault();
      const t = e.touches[0];
      ghostEl.style.left = (t.clientX - ghostEl.offsetWidth / 2) + 'px';
      ghostEl.style.top  = (t.clientY - ghostEl.offsetHeight / 2) + 'px';
      ghostEl.style.visibility = 'hidden';
      const under = document.elementFromPoint(t.clientX, t.clientY);
      ghostEl.style.visibility = '';
      grid.querySelectorAll('[draggable]').forEach(c => { c.style.outline = ''; c.style.outlineOffset = ''; });
      const tgt = under?.closest(sel);
      if (tgt && tgt !== srcEl) { tgt.style.outline = '3px solid #C8102E'; tgt.style.outlineOffset = '-3px'; }
    }, { passive: false });
    el.addEventListener('touchend', e => {
      const savedSrc = srcEl;
      cleanup();
      const t = e.changedTouches[0];
      const under = document.elementFromPoint(t.clientX, t.clientY);
      const tgt = under?.closest(sel);
      if (tgt && savedSrc && tgt !== savedSrc) swapFn(savedSrc.getAttribute(attr), tgt.getAttribute(attr));
    }, { passive: true });
    el.addEventListener('touchcancel', cleanup, { passive: true });
  });
}

async function addBizPhoto(input) {
  const file = input.files[0];
  input.value = '';
  if (!file || !bizRecord?.id) return;
  openBizCropModal(file, async (blob) => {
    showToast('업로드 중...');
    const path = `${currentUser.id}/biz-${Date.now()}.jpg`;
    const { error } = await db.storage.from('biz-photos').upload(path, blob, { contentType: 'image/jpeg' });
    if (error) { showToast('업로드 실패: ' + error.message); return; }
    const { data: { publicUrl } } = db.storage.from('biz-photos').getPublicUrl(path);
    await db.from('business_photos').insert({
      business_id: bizRecord.id,
      photo_url: publicUrl,
      is_main: false,
      sort_order: _bizPhotos.length
    });
    await loadBizPhotos();
    showToast('✅ 사진이 추가됐습니다');
  });
}

function deleteBizPhoto(photoId) {
  showConfirm('', async () => {
    await db.from('business_photos').delete().eq('id', photoId);
    await loadBizPhotos();
    showToast('사진이 삭제됐습니다');
  }, {icon:'🗑️', title:'사진 삭제', okLabel:'삭제', danger:true});
}

// ── 광고 배너 ──────────────────────────────────────────────
async function loadAdBanner() {
  try {
    const { data } = await db.from('banners')
      .select('*').eq('active', true)
      .order('display_order', { ascending: true }).limit(1);
    const el = document.getElementById('home-ad-banner');
    if (!el || !data?.length) return;
    const b = data[0];
    el.style.display = 'block';
    const wrap = document.createElement('div');
    wrap.style.cssText = `background:${b.bg_gradient || 'linear-gradient(135deg,#667eea,#764ba2)'};border-radius:15px;padding:14px 16px;display:flex;align-items:center;gap:12px;cursor:pointer;-webkit-tap-highlight-color:transparent`;
    wrap.onclick = () => {
      if (b.link_type === 'mannnam') openMannnamPanel();
      else if (b.link_type === 'moim') openMoimPanel();
      else if (b.link_url) window.open(b.link_url, '_blank');
    };
    const imgHtml = b.image_url
      ? `<img src="${b.image_url}" style="width:48px;height:48px;border-radius:10px;object-fit:cover;flex-shrink:0" onerror="this.style.display='none'">`
      : `<div style="width:40px;height:40px;background:rgba(255,255,255,0.2);border-radius:10px;flex-shrink:0"></div>`;
    const titleEsc = (b.title || '').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const subtitleEsc = (b.subtitle || '').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    wrap.innerHTML = `
      ${imgHtml}
      <div style="flex:1;min-width:0">
        <div style="font-size:14px;font-weight:900;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${titleEsc}</div>
        ${subtitleEsc ? `<div style="font-size:10px;color:rgba(255,255,255,0.7);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${subtitleEsc}</div>` : ''}
      </div>
      <span style="color:rgba(255,255,255,0.7);font-size:18px;flex-shrink:0">›</span>`;
    el.appendChild(wrap);
  } catch(_) {}
}

// ── 바로만남 패널 ──────────────────────────────────────────
function openMannnamPanel() {
  const p = document.getElementById('mannnam-panel');
  if (!p) return;
  p.style.display = 'flex';
  switchMannnamTab('meeting');
  _loadBaromeetList();
}
function closeMannnamPanel() {
  const p = document.getElementById('mannnam-panel');
  if (p) p.style.display = 'none';
}
function switchMannnamTab(tab) {
  const isMeet = tab === 'meeting';
  document.getElementById('mnm-content-meeting').style.display = isMeet ? 'block' : 'none';
  document.getElementById('mnm-content-spot').style.display = isMeet ? 'none' : 'block';
  const tMeet = document.getElementById('mnm-tab-meeting');
  const tSpot = document.getElementById('mnm-tab-spot');
  if (tMeet) { tMeet.style.borderBottomColor = isMeet ? '#7C3AED' : 'transparent'; tMeet.style.color = isMeet ? '#7C3AED' : '#aaa'; tMeet.style.fontWeight = isMeet ? '800' : '700'; }
  if (tSpot) { tSpot.style.borderBottomColor = isMeet ? 'transparent' : '#f43f5e'; tSpot.style.color = isMeet ? '#aaa' : '#f43f5e'; tSpot.style.fontWeight = isMeet ? '700' : '800'; }
  if (!isMeet) _loadBarospotList();
}

// ── 바로미팅/바로스팟 신청 완료 후 실시간 추적화면 (지도 + 드래그형 하단시트) ──
// 배달앱의 "배달 현황" 화면 레이아웃을 벤치마킹: 지도 위에 카운트다운 + 진행 단계
// + 드래그로 펼치면 장소·일정 상세가 나오는 하단시트
let _trackMap = null, _trackVenueMarker = null, _trackMeMarker = null, _trackTimer = null;

function bindTrackSheetDrag(handleEl, sheetEl) {
  if (!handleEl || handleEl.dataset.trackDragBound) return;
  handleEl.dataset.trackDragBound = '1';
  let startY = 0, dragging = false;
  const move = y => {
    if (!dragging) return;
    const dy = y - startY;
    const follow = Math.max(-30, Math.min(30, dy * 0.3)); // 손가락을 살짝 따라가는 느낌만 주고, 실제 확장/축소는 놓을 때 결정
    sheetEl.style.transform = `translateY(${follow}px)`;
  };
  const end = y => {
    if (!dragging) return;
    dragging = false;
    const dy = y - startY;
    sheetEl.style.transition = 'transform 0.25s ease';
    sheetEl.style.transform = '';
    setTimeout(() => { sheetEl.style.transition = ''; }, 250);
    if (dy < -40) sheetEl.classList.add('expanded');       // 위로 드래그 → 펼쳐서 합쳐짐
    else if (dy > 40) sheetEl.classList.remove('expanded'); // 아래로 드래그 → 다시 접힘
    else sheetEl.classList.toggle('expanded');              // 짧게 탭한 경우 토글
  };
  handleEl.addEventListener('touchstart', e => { startY = e.touches[0].clientY; dragging = true; }, { passive: true });
  handleEl.addEventListener('touchmove',  e => move(e.touches[0].clientY), { passive: true });
  handleEl.addEventListener('touchend',   e => end(e.changedTouches[0].clientY), { passive: true });
  handleEl.addEventListener('mousedown', e => {
    startY = e.clientY; dragging = true;
    const mv = ev => move(ev.clientY);
    const up = ev => { end(ev.clientY); window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); };
    window.addEventListener('mousemove', mv);
    window.addEventListener('mouseup', up);
  });
}

function _renderTrackSteps(labels, activeIdx) {
  const el = document.getElementById('track-steps');
  el.innerHTML = labels.map((l, i) => `
    <div class="track-step ${i <= activeIdx ? 'done' : ''}">
      <div class="track-step-dot"></div>
      <div class="track-step-label">${l}</div>
    </div>`).join('');
}

function _tickTrackCountdown(whenISO) {
  const el = document.getElementById('track-countdown'), sub = document.getElementById('track-subtime');
  const diffMs = whenISO ? new Date(whenISO) - new Date() : NaN;
  if (isNaN(diffMs)) { el.textContent = '일정 확인 중'; sub.textContent = ''; return; }
  if (diffMs <= 0) { el.textContent = '시작!'; sub.textContent = ''; return; }
  const mins = Math.round(diffMs / 60000);
  el.textContent = mins >= 60 ? `${Math.floor(mins/60)}시간 ${mins%60}분 남음` : `${mins}분 남음`;
  sub.textContent = new Date(whenISO).toLocaleTimeString('ko-KR', { hour:'numeric', minute:'2-digit' });
}

function _placeVenueMarker(y, x) {
  const pos = new kakao.maps.LatLng(y, x);
  _trackMap.setCenter(pos);
  if (_trackVenueMarker) _trackVenueMarker.setMap(null);
  _trackVenueMarker = new kakao.maps.Marker({ position: pos, map: _trackMap });
}

// 주소(location_address)는 카카오 주소 검색(Geocoder)으로, 안 되면 장소명(location_name)으로
// 키워드 검색(Places) 시도 - 네이버에서 가져온 소규모/신규 업체는 카카오 자체 장소DB에
// 없는 경우가 많아 키워드 검색 하나만으로는 지도에 마커가 안 찍히는 경우가 있었음
function _geocodeAndShowVenue(address, name) {
  if (!_trackMap) return;
  const tryKeyword = () => {
    if (!name) { showToast('📍 정확한 위치를 찾지 못했어요'); return; }
    new kakao.maps.services.Places().keywordSearch(name, (result, status) => {
      if (status === kakao.maps.services.Status.OK && result.length) _placeVenueMarker(result[0].y, result[0].x);
      else showToast('📍 정확한 위치를 찾지 못했어요');
    });
  };
  if (address) {
    new kakao.maps.services.Geocoder().addressSearch(address, (result, status) => {
      if (status === kakao.maps.services.Status.OK && result.length) _placeVenueMarker(result[0].y, result[0].x);
      else tryKeyword();
    });
  } else {
    tryKeyword();
  }
}

function _showMyLocationOnTrackMap(hasVenue) {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(pos => {
    const latlng = new kakao.maps.LatLng(pos.coords.latitude, pos.coords.longitude);
    if (_trackMeMarker) _trackMeMarker.setMap(null);
    _trackMeMarker = new kakao.maps.Marker({ position: latlng, map: _trackMap });
    if (!hasVenue) _trackMap.setCenter(latlng); // 표시할 장소가 아직 없으면 내 위치를 기준으로 지도 중심을 맞춘다
  }, () => {}, { enableHighAccuracy: true, maximumAge: 5000, timeout: 8000 });
}

// opts: { brand, title, place, addressQuery, placeName, whenISO, whenText, steps, stepIndex, chat:{gatheringId,title}|null }
function openTrackingSheet(opts) {
  try {
    document.getElementById('track-overlay').style.display = 'block';
    document.getElementById('track-brand').textContent = opts.brand;
    document.getElementById('track-desc').textContent = opts.title || '-';
    document.getElementById('track-place').textContent = opts.place || '-';
    document.getElementById('track-when').textContent = opts.whenText || '-';
    document.getElementById('track-sheet').classList.remove('expanded');
    _renderTrackSteps(opts.steps || ['신청완료','확정','진행중','종료'], opts.stepIndex ?? 0);
    bindTrackSheetDrag(document.getElementById('track-sheet-handle'), document.getElementById('track-sheet'));

    const chatBtn = document.getElementById('track-chat-btn');
    if (opts.chat) {
      chatBtn.style.display = 'block';
      chatBtn.onclick = () => openBaromeetChat(opts.chat.gatheringId, opts.chat.title);
    } else {
      chatBtn.style.display = 'none';
    }
  } catch (e) {
    console.error('[openTrackingSheet] 정보 표시 실패:', e);
  }

  if (_trackVenueMarker) { _trackVenueMarker.setMap(null); _trackVenueMarker = null; } // 이전 세션의 장소 마커 제거
  // 컨테이너가 display:none에서 막 block으로 바뀐 직후라 즉시 relayout하면 크기 계산이
  // 틀어질 수 있어 rAF보다 한 틱 더 늦게(50ms) 초기화 - 지도만 뜨고 시트 정보가 그려지지
  // 않는 것처럼 보이던 증상에 대한 방어적 보강
  setTimeout(() => {
    try {
      const el = document.getElementById('track-map');
      if (!_trackMap) _trackMap = new kakao.maps.Map(el, { center: new kakao.maps.LatLng(37.5665, 126.978), level: 5 });
      else _trackMap.relayout();
      _geocodeAndShowVenue(opts.addressQuery, opts.placeName);
      _showMyLocationOnTrackMap(!!(opts.addressQuery || opts.placeName));
    } catch (e) {
      console.error('[openTrackingSheet] 지도 초기화 실패:', e);
    }
  }, 60);

  if (_trackTimer) clearInterval(_trackTimer);
  _tickTrackCountdown(opts.whenISO);
  _trackTimer = setInterval(() => _tickTrackCountdown(opts.whenISO), 30000);
}

function closeTrackingSheet() {
  document.getElementById('track-overlay').style.display = 'none';
  if (_trackTimer) { clearInterval(_trackTimer); _trackTimer = null; }
}

// 홈화면 바로미팅 미리보기 카드 (바로모임 카드와 동일한 형태 - 바로모임 리스트에서 빠진 만큼 홈 노출 보강)
async function _loadHomeBaromeetTeaser() {
  const section = document.getElementById('home-baromeet-section');
  const list = document.getElementById('home-baromeet-list');
  if (!section || !list) return;
  const { data } = await db.from('gatherings')
    .select('id,title,gathering_date,baromeeting_male_max,baromeeting_female_max,baromeeting_male_cur,baromeeting_female_cur')
    .eq('status', 'open').eq('category', 'baromeeting')
    .order('created_at', { ascending: false }).limit(6);
  if (!data?.length) { section.style.display = 'none'; return; }
  section.style.display = 'block';
  list.innerHTML = data.map(m => _baromeetHomeCard(m)).join('');
}
function _baromeetHomeCard(m) {
  const maleLeft = (m.baromeeting_male_max || 4) - (m.baromeeting_male_cur || 0);
  const femaleLeft = (m.baromeeting_female_max || 4) - (m.baromeeting_female_cur || 0);
  const isFull = maleLeft <= 0 && femaleLeft <= 0;
  const remTotal = Math.max(0, maleLeft) + Math.max(0, femaleLeft);
  const dateStr = m.gathering_date ? new Date(m.gathering_date).toLocaleDateString('ko-KR',{month:'short',day:'numeric',weekday:'short'}) : '일정 미정';
  // 바로모임 홈카드(_moimHomeCard)와 동일한 구성/아이콘(.mc-cat/.mc-title/.mc-date/.mc-slots/.mc-fee)을 재사용
  return `<div onclick="openMannnamPanel()" class="moim-card" style="flex-shrink:0;width:160px;padding:16px">
    <div class="mc-cat" style="color:#e11d48">바로미팅</div>
    <div class="mc-title">${m.title||'바로미팅'}</div>
    <div class="mc-date">${dateStr}</div>
    <div class="mc-slots">${isFull ? '마감' : remTotal+'자리 남음'}</div>
    <div class="mc-fee" style="color:${isFull?'#94a3b8':'#e11d48'}">${isFull?'마감':'자리있음'}</div>
  </div>`;
}

let _baromeetListCache = {};
// 바로미팅 목록 로드
async function _loadBaromeetList() {
  const el = document.getElementById('mnm-meeting-list');
  if (!el) return;
  el.innerHTML = '<div style="text-align:center;padding:32px"><div class="spinner"></div></div>';
  try {
    // 현재 위치 기반 필터 (gatherings 테이블, category='baromeeting')
    let q = db.from('gatherings')
      .select('id,title,location_name,location_address,gathering_date,host_id,entry_fee,description,tags,baromeeting_male_max,baromeeting_female_max,baromeeting_male_cur,baromeeting_female_cur')
      .eq('status','open')
      .eq('category','baromeeting')
      .order('gathering_date',{ascending:true})
      .limit(20);
    const { data, error } = await q;
    if (error || !data?.length) {
      el.innerHTML = `<div style="text-align:center;padding:44px 20px">
        <div style="font-size:40px;margin-bottom:10px">🤝</div>
        <div style="font-size:14px;font-weight:800;color:#999;margin-bottom:6px">모집 중인 바로미팅</div>
        <div style="font-size:12px;color:#bbb;line-height:1.65">현재 반경 5km 내 진행 중인 미팅이 없어요<br>곧 새 미팅이 오픈될 예정이에요</div>
      </div>`;
      return;
    }
    // 내가 이미 신청한 미팅 - 익명 단체채팅방 입장 버튼 표시용.
    // 내 신청 상태(승인대기/확정)를 미팅별로 조회 - 관리자 승인 전에는 채팅 입장 불가
    let statusMap = {};
    if (currentUser) {
      const { data: myApps } = await db.from('gathering_applications')
        .select('gathering_id, status').eq('applicant_id', currentUser.id)
        .in('gathering_id', data.map(m => m.id));
      (myApps || []).forEach(a => { statusMap[a.gathering_id] = a.status; });
    }
    _baromeetListCache = {};
    data.forEach(m => { m._myStatus = statusMap[m.id] || null; _baromeetListCache[m.id] = m; });
    el.innerHTML = data.map(m => _renderBaromeetCard(m, m._myStatus)).join('');
    document.getElementById('mnm-meet-loctext').textContent = `${data.length}개 미팅 모집 중`;
  } catch(e) {
    el.innerHTML = '<div style="text-align:center;padding:44px 20px;color:#bbb;font-size:13px">불러오기 실패<br>잠시 후 다시 시도해주세요</div>';
  }
}
function _renderBaromeetCard(m, myStatus) {
  const maleMax = m.baromeeting_male_max || 4;
  const femaleMax = m.baromeeting_female_max || 4;
  const maleCur = m.baromeeting_male_cur || 0;
  const femaleCur = m.baromeeting_female_cur || 0;
  const maleLeft = maleMax - maleCur;
  const femaleLeft = femaleMax - femaleCur;
  const isFull = maleLeft <= 0 && femaleLeft <= 0;
  const dtStr = m.gathering_date ? (() => {
    const d = new Date(m.gathering_date);
    const days = ['일','월','화','수','목','금','토'];
    return `${d.getMonth()+1}/${d.getDate()}(${days[d.getDay()]}) ${d.getHours()<12?'오전':'오후'} ${((d.getHours()-1)%12)+1}:${String(d.getMinutes()).padStart(2,'0')}`;
  })() : '날짜 미정';
  const tags = Array.isArray(m.tags) ? m.tags : [];
  const _maleSlots = Array.from({length:maleMax}).map((_,i)=>i<maleCur?'<span style="color:#3b82f6;font-size:14px">●</span>':'<span style="color:#ddd;font-size:14px">○</span>').join('');
  const _femaleSlots = Array.from({length:femaleMax}).map((_,i)=>i<femaleCur?'<span style="color:#f43f5e;font-size:14px">●</span>':'<span style="color:#ddd;font-size:14px">○</span>').join('');
  return `<div onclick="openBaromeetDetail('${m.id}')" style="background:#fff;border-radius:16px;padding:16px;margin-bottom:12px;border:1px solid #f0f0f0;cursor:pointer">
    <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:10px">
      <div style="flex:1">
        <div style="font-size:15px;font-weight:900;color:#111;margin-bottom:3px">${m.title||'바로미팅'}</div>
        <div style="display:flex;align-items:center;gap:6px;font-size:11px;color:#888">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#aaa" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="10" r="3"/><path d="M12 2a8 8 0 0 1 8 8c0 5.25-8 12-8 12S4 15.25 4 10a8 8 0 0 1 8-8z"/></svg>${m.location_name||m.location_address||'장소 확인 후 안내'}
        </div>
        <div style="font-size:11px;color:#aaa;margin-top:2px">🕐 ${dtStr}</div>
      </div>
      <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
        <button onclick="event.stopPropagation();shareBaromeet('${m.id}','${(m.title||'바로미팅').replace(/'/g,"\\'")}')" style="background:#f5f5f5;border:none;border-radius:8px;width:26px;height:26px;display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0" title="공유">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#888" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
        </button>
        <span style="font-size:10px;font-weight:800;padding:4px 10px;border-radius:8px;${isFull?'background:#f5f5f5;color:#bbb':'background:#ede9fe;color:#7C3AED'}">${isFull?'마감':'자리있음'}</span>
      </div>
    </div>
    <!-- 모집현황 -->
    <div style="display:flex;gap:10px;background:#fafafa;border-radius:10px;padding:10px 12px;margin-bottom:10px">
      <div style="flex:1;text-align:center">
        <div style="font-size:10px;color:#f43f5e;font-weight:800;margin-bottom:4px">여성 ${femaleCur}/${femaleMax}명</div>
        <div style="letter-spacing:1px">${_femaleSlots}</div>
        <div style="font-size:10px;color:#bbb;margin-top:2px">${femaleLeft>0?femaleLeft+'자리 남음':'마감'}</div>
      </div>
      <div style="width:1px;background:#eee"></div>
      <div style="flex:1;text-align:center">
        <div style="font-size:10px;color:#3b82f6;font-weight:800;margin-bottom:4px">남성 ${maleCur}/${maleMax}명</div>
        <div style="letter-spacing:1px">${_maleSlots}</div>
        <div style="font-size:10px;color:#bbb;margin-top:2px">${maleLeft>0?maleLeft+'자리 남음':'마감'}</div>
      </div>
    </div>
    ${tags.length ? `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:10px">${tags.map(t=>`<span style="font-size:10px;background:#f5f5f5;color:#666;padding:3px 8px;border-radius:6px">#${t}</span>`).join('')}</div>` : ''}
    ${myStatus === 'approved'
      ? `<button onclick="event.stopPropagation();openBaromeetChat('${m.id}','${(m.title||'바로미팅').replace(/'/g,"\\'")}')" style="width:100%;padding:12px;background:#7C3AED;color:#fff;border:none;border-radius:12px;font-size:14px;font-weight:800;cursor:pointer">💬 익명 단체채팅방 입장</button>`
      : myStatus === 'pending'
      ? `<button disabled style="width:100%;padding:12px;background:#f5f5f5;color:#aaa;border:none;border-radius:12px;font-size:14px;font-weight:800;cursor:default">⏳ 관리자 승인 대기중</button>`
      : `<button onclick="event.stopPropagation();applyBaromeet('${m.id}',${maleLeft},${femaleLeft})" style="width:100%;padding:12px;background:${isFull?'#f5f5f5':'#7C3AED'};color:${isFull?'#bbb':'#fff'};border:none;border-radius:12px;font-size:14px;font-weight:800;cursor:pointer" ${isFull?'disabled':''}>${isFull?'모집 마감':'참가 신청하기 →'}</button>`}
  </div>`;
}

// 바로미팅 상세 정보 + 진행방식 안내 (카드 클릭 시)
function openBaromeetDetail(id) {
  const m = _baromeetListCache[id];
  if (!m) return;
  const overlay = document.getElementById('baromeet-detail-overlay');
  const body = document.getElementById('baromeet-detail-body');
  if (!overlay || !body) return;
  const maleMax = m.baromeeting_male_max || 4, femaleMax = m.baromeeting_female_max || 4;
  const maleCur = m.baromeeting_male_cur || 0, femaleCur = m.baromeeting_female_cur || 0;
  const maleLeft = maleMax - maleCur, femaleLeft = femaleMax - femaleCur;
  const isFull = maleLeft <= 0 && femaleLeft <= 0;
  const myStatus = m._myStatus || null;
  const dtStr = m.gathering_date ? (() => {
    const d = new Date(m.gathering_date);
    const days = ['일','월','화','수','목','금','토'];
    return `${d.getMonth()+1}/${d.getDate()}(${days[d.getDay()]}) ${d.getHours()<12?'오전':'오후'} ${((d.getHours()-1)%12)+1}:${String(d.getMinutes()).padStart(2,'0')}`;
  })() : '날짜 미정';
  const tags = Array.isArray(m.tags) ? m.tags : [];

  body.innerHTML = `
    <div style="padding:20px 20px 4px">
      <div style="font-size:19px;font-weight:900;color:#111;margin-bottom:8px">${m.title||'바로미팅'}</div>
      <div style="display:flex;align-items:center;gap:6px;font-size:13px;color:#666;margin-bottom:4px">📍 ${m.location_name||m.location_address||'장소 확인 후 안내'}</div>
      <div style="font-size:13px;color:#666">🕐 ${dtStr}</div>
    </div>
    <button onclick="_openBaromeetTracking('${m.id}')" style="display:flex;align-items:center;gap:10px;width:calc(100% - 40px);margin:14px 20px 0;padding:12px 14px;background:#F5F3FF;border:1px solid #ede9fe;border-radius:12px;cursor:pointer;text-align:left">
      <span style="font-size:18px">🗺️</span>
      <span style="flex:1;font-size:13px;font-weight:800;color:#7C3AED">위치 · 남은 시간 실시간으로 보기</span>
      <span style="color:#c4b5fd;font-size:16px">›</span>
    </button>
    <div style="margin:16px 20px;display:flex;gap:10px;background:#fafafa;border-radius:12px;padding:14px">
      <div style="flex:1;text-align:center">
        <div style="font-size:12px;color:#f43f5e;font-weight:800;margin-bottom:4px">여성 ${femaleCur}/${femaleMax}명</div>
        <div style="font-size:11px;color:#bbb">${femaleLeft>0?femaleLeft+'자리 남음':'마감'}</div>
      </div>
      <div style="width:1px;background:#eee"></div>
      <div style="flex:1;text-align:center">
        <div style="font-size:12px;color:#3b82f6;font-weight:800;margin-bottom:4px">남성 ${maleCur}/${maleMax}명</div>
        <div style="font-size:11px;color:#bbb">${maleLeft>0?maleLeft+'자리 남음':'마감'}</div>
      </div>
    </div>
    ${tags.length ? `<div style="margin:0 20px 16px;display:flex;flex-wrap:wrap;gap:4px">${tags.map(t=>`<span style="font-size:11px;background:#f5f5f5;color:#666;padding:4px 9px;border-radius:6px">#${t}</span>`).join('')}</div>` : ''}
    ${m.description ? `<div style="margin:0 20px 16px;background:#f9fafb;border-radius:12px;padding:14px"><div style="font-size:12px;font-weight:700;color:#888;margin-bottom:6px">📝 소개</div><div style="font-size:13px;color:#333;line-height:1.7;white-space:pre-wrap">${m.description}</div></div>` : ''}
    <div style="margin:0 20px 20px;background:#F5F3FF;border-radius:12px;padding:16px">
      <div style="font-size:13px;font-weight:900;color:#7C3AED;margin-bottom:10px">🤝 어떻게 진행되나요?</div>
      <div style="display:flex;flex-direction:column;gap:10px">
        <div style="display:flex;gap:10px;align-items:flex-start"><span style="font-size:13px;font-weight:900;color:#7C3AED;flex-shrink:0">1</span><span style="font-size:12.5px;color:#555;line-height:1.6">참가 신청 (이용권 또는 포인트 차감)</span></div>
        <div style="display:flex;gap:10px;align-items:flex-start"><span style="font-size:13px;font-weight:900;color:#7C3AED;flex-shrink:0">2</span><span style="font-size:12.5px;color:#555;line-height:1.6">신청과 동시에 익명 단체채팅방에 바로 입장</span></div>
        <div style="display:flex;gap:10px;align-items:flex-start"><span style="font-size:13px;font-weight:900;color:#7C3AED;flex-shrink:0">3</span><span style="font-size:12.5px;color:#555;line-height:1.6">채팅에서 다른 참가자들과 미리 인사하며 정원이 찰 때까지 대화</span></div>
        <div style="display:flex;gap:10px;align-items:flex-start"><span style="font-size:13px;font-weight:900;color:#7C3AED;flex-shrink:0">4</span><span style="font-size:12.5px;color:#555;line-height:1.6">채팅으로 시간·장소를 맞춰 만나요</span></div>
        <div style="display:flex;gap:10px;align-items:flex-start"><span style="font-size:13px;font-weight:900;color:#7C3AED;flex-shrink:0">5</span><span style="font-size:12.5px;color:#555;line-height:1.6">식사비는 현장 결제가 아니라 <b>${BANK_INFO.bank} ${BANK_INFO.account}</b>(${BANK_INFO.holder})로 입금</span></div>
      </div>
    </div>
    <div style="padding:0 20px 24px">
      ${myStatus === 'approved'
        ? `<button onclick="closeBaromeetDetail();openBaromeetChat('${m.id}','${(m.title||'바로미팅').replace(/'/g,"\\'")}')" style="width:100%;padding:14px;background:#7C3AED;color:#fff;border:none;border-radius:14px;font-size:15px;font-weight:800;cursor:pointer">💬 익명 단체채팅방 입장</button>`
        : myStatus === 'pending'
        ? `<button disabled style="width:100%;padding:14px;background:#f5f5f5;color:#aaa;border:none;border-radius:14px;font-size:15px;font-weight:800;cursor:default">⏳ 관리자 승인 대기중</button>`
        : `<button onclick="closeBaromeetDetail();applyBaromeet('${m.id}',${maleLeft},${femaleLeft})" style="width:100%;padding:14px;background:${isFull?'#f5f5f5':'#7C3AED'};color:${isFull?'#bbb':'#fff'};border:none;border-radius:14px;font-size:15px;font-weight:800;cursor:pointer" ${isFull?'disabled':''}>${isFull?'모집 마감':'참가 신청하기 →'}</button>`}
    </div>
  `;
  overlay.style.display = 'flex';
}
function closeBaromeetDetail() {
  const overlay = document.getElementById('baromeet-detail-overlay');
  if (overlay) overlay.style.display = 'none';
}

// ── 바로미팅 공유 (바로모임 shareMoim()과 동일한 패턴) ──────
async function shareBaromeet(id, title) {
  const { data: m } = await db.from('gatherings')
    .select('title, location_name, location_address, gathering_date')
    .eq('id', id).single();
  const dateStr = m?.gathering_date
    ? new Date(m.gathering_date).toLocaleString('ko-KR', { month:'long', day:'numeric', weekday:'short', hour:'2-digit', minute:'2-digit' })
    : '일정 미정';
  const locationStr = m?.location_name || m?.location_address || '장소 미정';
  const link = `${location.origin}${location.pathname}?baromeet=${id}`;
  const shareTitle = `[바로미팅] ${m?.title || title}`;
  const shareText = `[바로미팅] ${m?.title || title}\n📅 ${dateStr}\n📍 ${locationStr}\n같이 참가해요!`;
  const descLine = `📅 ${dateStr}  📍 ${locationStr}`;

  if (/Android/i.test(navigator.userAgent) && window.AndroidBridge) {
    window.AndroidBridge.share(shareTitle, shareText, link);
    return;
  }
  if (window.Kakao?.isInitialized?.()) {
    try {
      Kakao.Share.sendDefault({
        objectType: 'feed',
        content: {
          title: shareTitle,
          description: descLine,
          imageUrl: `${location.origin}/icons/og-share.png`,
          link: { mobileWebUrl: link, webUrl: link }
        },
        buttons: [{ title: '바로미팅 참가하기', link: { mobileWebUrl: link, webUrl: link } }]
      });
      return;
    } catch(e) {}
  }
  if (navigator.share) {
    navigator.share({ title: shareTitle, text: shareText, url: link }).catch(() => {});
    return;
  }
  navigator.clipboard.writeText(link).then(() => showToast('📋 링크 복사됨')).catch(() => showToast(link));
}

async function handleBaromeetDeeplink(id) {
  const { data: m } = await db.from('gatherings').select('id, status').eq('id', id).eq('category', 'baromeeting').maybeSingle();
  if (!m) { showToast('유효하지 않은 바로미팅 링크입니다'); return; }
  openMannnamPanel();
  if (m.status !== 'open') showToast('이미 마감되었거나 종료된 바로미팅이에요');
}

// 첫 이용 무료체험 이벤트: 이벤트 기간 내 + 바로미팅 신청 이력이 한 번도 없는 유저는
// 포인트/이용권 차감 없이 신청, 대신 식사비는 멀티무브 계좌로 입금
// (프로모션 종료 시 enabled만 false로 바꾸면 됨)
const BAROMEET_TRIAL_EVENT = {
  enabled: true,
  start: '2026-07-11T00:00:00+09:00',
  end: '2026-08-10T23:59:59+09:00',
};
async function _isBaromeetTrialEligible(userId) {
  if (!BAROMEET_TRIAL_EVENT.enabled || !userId) return false;
  const now = Date.now();
  const start = new Date(BAROMEET_TRIAL_EVENT.start).getTime();
  const end = new Date(BAROMEET_TRIAL_EVENT.end).getTime();
  if (now < start || now > end) return false;
  // 이 유저가 신청한 gathering_id 목록 중 바로미팅 카테고리가 하나라도 있으면 이미 이용한 것
  const { data: myApps } = await db.from('gathering_applications').select('gathering_id').eq('applicant_id', userId);
  const gatheringIds = (myApps || []).map(a => a.gathering_id);
  if (!gatheringIds.length) return true; // 신청 이력 자체가 없음 = 첫 이용
  const { count } = await db.from('gatherings')
    .select('id', { count: 'exact', head: true })
    .eq('category', 'baromeeting')
    .in('id', gatheringIds);
  return (count || 0) === 0;
}

async function applyBaromeet(meetingId, maleLeft, femaleLeft) {
  if (!currentUser || isGuest) { showLoginPrompt('로그인 후 신청할 수 있어요','바로미팅 참가는 로그인이 필요합니다.'); return; }

  const { data: existing } = await db.from('gathering_applications').select('id').eq('gathering_id', meetingId).eq('applicant_id', currentUser.id).limit(1);
  if (existing?.length) { showToast('이미 신청한 바로미팅이에요'); return; }

  const { data: wRow } = await db.from('workers').select('gender').eq('kakao_uid', currentUser.id).maybeSingle();
  const gender = wRow?.gender;
  if (!gender) { showToast('바로만남 > 바로스팟에서 성별을 먼저 등록해주세요'); return; }

  // 이벤트 기간 중 첫 이용자는 포인트/이용권 차감 없이 무료 체험 신청 (식사비만 멀티무브 계좌로 입금)
  if (await _isBaromeetTrialEligible(currentUser.id)) {
    showConfirm(`🎉 첫 이용 무료체험으로 포인트 차감 없이 신청할 수 있어요!\n식사비만 아래 계좌로 입금해주세요.\n${BANK_INFO.bank} ${BANK_INFO.account} (${BANK_INFO.holder})`, async () => {
      const ae = await _finalizeBaromeetJoin(meetingId, gender);
      if (ae) { showToast('신청 중 오류가 발생했어요'); return; }
      showToast('✅ 무료 체험 신청 완료! 관리자 승인 후 채팅방을 이용할 수 있어요');
      await _loadBaromeetList();
    }, { icon:'🎉', title:'바로미팅 무료체험 신청', okLabel:'무료로 신청하기' });
    return;
  }

  // 이용권(바로스팟/바로미팅 공용)이 있으면 이용권으로, 없으면 1회권과 같은 가격의 포인트로 결제
  const { data: passRow } = await db.from('barospot_passes')
    .select('id, remaining_count').eq('user_id', currentUser.id).eq('gender', gender).eq('status', 'active').maybeSingle();

  if (passRow && passRow.remaining_count >= 1) {
    showConfirm('이용권 1회가 차감됩니다.\n신청하시겠어요?', async () => {
      const { error: pe } = await db.from('barospot_passes')
        .update({ remaining_count: passRow.remaining_count - 1 }).eq('id', passRow.id);
      if (pe) { showToast('오류: ' + pe.message); return; }
      const ae = await _finalizeBaromeetJoin(meetingId, gender);
      if (ae) {
        // 신청 실패 시 차감된 이용권 롤백
        await db.from('barospot_passes').update({ remaining_count: passRow.remaining_count }).eq('id', passRow.id);
        showToast('신청 중 오류가 발생했어요');
        return;
      }
      showToast('✅ 이용권으로 신청 완료! 관리자 승인 후 채팅방을 이용할 수 있어요');
      await _loadBaromeetList();
    }, { icon:'🤝', title:'바로미팅 참가 신청', okLabel:'이용권 사용하고 신청' });
    return;
  }

  // 이용권이 없을 때는 관리자페이지(설정 > 바로스팟 이용권 가격)의 1회권 가격을 그대로 포인트로 결제
  // - 예전엔 이 금액이 1회권 가격과 무관하게 2,000P로 고정돼 있던 버그
  const products = await loadBarospotPassProducts();
  const onePass = (products[gender] || []).find(p => p.qty === 1);
  const price = onePass?.price ?? 2000;

  showConfirm(`이용권이 없어 포인트로 결제합니다.\n참가 신청 시 ${price.toLocaleString()}P가 차감됩니다.`, async () => {
    const pts = await loadUserPoints();
    if (pts < price) { closeMannnamPanel(); openPointCharge(); showToast('포인트가 부족해요. 충전 후 신청해주세요'); return; }
    const { data: acct } = await db.from('point_accounts').select('id, balance').eq('user_id', currentUser.id).single();
    if (!acct || acct.balance < price) { showToast('포인트가 부족해요'); return; }
    const { error: pe } = await db.from('point_accounts').update({ balance: acct.balance - price }).eq('id', acct.id);
    if (pe) { showToast('포인트 차감 실패: ' + pe.message); return; }
    const ae = await _finalizeBaromeetJoin(meetingId, gender);
    if (ae) {
      await db.from('point_accounts').update({ balance: acct.balance }).eq('id', acct.id); // 롤백
      showToast('신청 중 오류가 발생했어요');
      return;
    }
    showToast(`✅ ${price.toLocaleString()}P 차감 후 신청 완료! 관리자 승인 후 채팅방을 이용할 수 있어요`);
    await loadUserPoints();
    await _loadBaromeetList();
  }, { icon:'🤝', title:'바로미팅 참가 신청', okLabel:`${price.toLocaleString()}P 차감하고 신청` });
}

// 신청 완료 직후 모임 정보를 불러와 실시간 추적화면을 연다
async function _openBaromeetTracking(meetingId) {
  const { data: m } = await db.from('gatherings')
    .select('title, location_name, location_address, gathering_date')
    .eq('id', meetingId).single();
  if (!m) return;
  const whenText = m.gathering_date ? new Date(m.gathering_date).toLocaleString('ko-KR', { month:'long', day:'numeric', hour:'numeric', minute:'2-digit' }) : '일정 미정';
  openTrackingSheet({
    brand: '🤝 바로미팅',
    title: m.title || '바로미팅',
    place: m.location_name || m.location_address || '-',
    addressQuery: m.location_address,
    placeName: m.location_name,
    whenISO: m.gathering_date,
    whenText,
    steps: ['신청완료','확정','모임 진행','종료'],
    stepIndex: 1,
  });
}

// 신청 확정 처리: 성별 인원수 카운터 증가 + gathering_applications를 approved로 저장
// (바로미팅은 별도 매니저 승인 단계가 없는 즉시확정 방식)
// 신청 시점에 결제(포인트/이용권)가 이미 끝난 상태라 정원 카운트는 바로 반영(자리 선점)하되,
// 관리자 승인 전까지는 status='pending'으로 두고 단체채팅 입장은 승인 후에만 가능하도록 함
async function _finalizeBaromeetJoin(meetingId, gender) {
  const col = gender === 'male' ? 'baromeeting_male_cur' : 'baromeeting_female_cur';
  const { data: g } = await db.from('gatherings').select(col).eq('id', meetingId).single();
  const nextCur = (g?.[col] || 0) + 1;
  await db.from('gatherings').update({ [col]: nextCur }).eq('id', meetingId);
  const { error } = await db.from('gathering_applications')
    .insert({ gathering_id: meetingId, applicant_id: currentUser.id, status: 'pending' });
  if (error) {
    // 신청 저장 실패 시 카운터도 롤백
    await db.from('gatherings').update({ [col]: nextCur - 1 }).eq('id', meetingId);
  }
  return error;
}

// ── 바로미팅 익명 단체채팅방 (정원이 다 찬 미팅에 확정 참가자만 입장) ──
let _baromeetChatId = null;
let _baromeetAnonLabel = null;
let _baromeetShowPhoto = false;
let _baromeetPhotoUrl = null;
let _baromeetRealtimeCh = null;
let _pendingBaromeetChat = null; // 닉네임 미설정 시 설정 완료 후 이어서 입장할 { gatheringId, title }

// 오픈카톡 스타일 익명 아바타: '내 사진' / '캐릭터' / '표시안함' 중 선택
// workers.baromeet_avatar(text)에 null(표시안함) / 'photo'(실사진) / 'emoji:🐱'(캐릭터)로 저장 -
// 기기가 아니라 계정에 저장되므로 다른 기기에서 로그인해도 동일하게 유지됨
const BAROMEET_AVATAR_EMOJIS = ['🐱','🐶','🐰','🦊','🐻','🐼','🐯','🐨','🦁','🐮','🐷','🐸'];
let _baromeetAvatarType = 'none';   // 'none' | 'emoji' | 'photo'
let _baromeetAvatarEmoji = '';
// UI 선택 상태(type/emoji) → DB에 저장할 baromeet_avatar 컬럼 값으로 변환
function _baromeetAvatarToColumnValue() {
  if (_baromeetAvatarType === 'emoji') return 'emoji:' + (_baromeetAvatarEmoji || BAROMEET_AVATAR_EMOJIS[0]);
  if (_baromeetAvatarType === 'photo') return 'photo';
  return null;
}
// DB의 baromeet_avatar 값 + 실사진 URL을 합쳐 채팅에 실제로 표시할 아바타 값을 결정
function _resolveBaromeetAvatarUrl(baromeetAvatar, dbPhotoUrl) {
  if (!baromeetAvatar) return null;
  if (baromeetAvatar.startsWith('emoji:')) return baromeetAvatar;
  if (baromeetAvatar === 'photo') return dbPhotoUrl || null;
  return null;
}
function _renderBmAvatarEmojiGrid() {
  const grid = document.getElementById('bm-avatar-emoji-grid');
  if (!grid) return;
  grid.innerHTML = BAROMEET_AVATAR_EMOJIS.map(e => `<button type="button" onclick="selectBaromeetAvatarEmoji('${e}')" style="width:38px;height:38px;border-radius:50%;border:2px solid ${e===_baromeetAvatarEmoji?'#7C3AED':'transparent'};background:#fff;font-size:18px;cursor:pointer;padding:0">${e}</button>`).join('');
}
function selectBaromeetAvatarEmoji(e) {
  _baromeetAvatarEmoji = e;
  _renderBmAvatarEmojiGrid();
}
function setBaromeetAvatarType(type) {
  _baromeetAvatarType = type;
  ['none','emoji','photo'].forEach(t => {
    const btn = document.getElementById('bm-avatar-type-' + t);
    if (!btn) return;
    const active = t === type;
    btn.style.borderColor = active ? '#7C3AED' : '#e5e7eb';
    btn.style.background  = active ? '#F5F3FF' : '#fff';
    btn.style.color       = active ? '#7C3AED' : '#666';
  });
  const grid = document.getElementById('bm-avatar-emoji-grid');
  if (grid) grid.style.display = type === 'emoji' ? 'flex' : 'none';
  if (type === 'emoji') {
    if (!_baromeetAvatarEmoji) _baromeetAvatarEmoji = BAROMEET_AVATAR_EMOJIS[0];
    _renderBmAvatarEmojiGrid();
  }
}

async function openBaromeetChat(gatheringId, title) {
  if (!currentUser) return;
  const { data: w, error } = await db.from('workers').select('baromeet_nick, baromeet_avatar, photo_url').eq('kakao_uid', currentUser.id).maybeSingle();
  if (error) { showToast('프로필 조회 실패: ' + error.message); return; }
  if (!w?.baromeet_nick) {
    _pendingBaromeetChat = { gatheringId, title };
    openBaromeetAnonSetup();
    return;
  }
  const avatarUrl = _resolveBaromeetAvatarUrl(w.baromeet_avatar, w.photo_url);
  await _enterBaromeetChat(gatheringId, title, w.baromeet_nick, !!avatarUrl, avatarUrl);
}

function openBaromeetAnonSetup() {
  db.from('workers').select('baromeet_nick, baromeet_avatar').eq('kakao_uid', currentUser.id).maybeSingle().then(({ data: w }) => {
    document.getElementById('baromeet-nick-input').value = w?.baromeet_nick || '';
    const av = w?.baromeet_avatar || '';
    if (av.startsWith('emoji:')) {
      _baromeetAvatarEmoji = av.slice(6) || BAROMEET_AVATAR_EMOJIS[0];
      setBaromeetAvatarType('emoji');
    } else if (av === 'photo') {
      setBaromeetAvatarType('photo');
    } else {
      setBaromeetAvatarType('none');
    }
    document.getElementById('baromeet-anon-overlay').style.display = 'flex';
  });
}
function closeBaromeetAnonSetup() {
  document.getElementById('baromeet-anon-overlay').style.display = 'none';
  _pendingBaromeetChat = null;
}

async function saveBaromeetAnonProfile() {
  const nick = document.getElementById('baromeet-nick-input').value.trim();
  if (!nick) { showToast('닉네임을 입력해주세요'); return; }
  const avatarValue = _baromeetAvatarToColumnValue();
  // 신규가입자는 아직 workers 행이 없을 수 있음 - update만 하면 조용히 0건 처리되던
  // 문제(설정한 성별이 저장 안 되던 버그와 동일 원인)를 여기서도 동일하게 방지
  const { data: existing } = await db.from('workers').select('id').eq('kakao_uid', currentUser.id).maybeSingle();
  let error;
  if (existing) {
    ({ error } = await db.from('workers').update({ baromeet_nick: nick, baromeet_avatar: avatarValue }).eq('kakao_uid', currentUser.id));
  } else {
    const meta = currentUser.user_metadata || {};
    const name = meta.full_name || meta.name || currentUser.email?.split('@')[0] || '알바생';
    ({ error } = await db.from('workers').insert({ kakao_uid: currentUser.id, name, baromeet_nick: nick, baromeet_avatar: avatarValue }));
  }
  if (error) { showToast('저장 실패: ' + error.message); return; }
  document.getElementById('baromeet-anon-overlay').style.display = 'none';
  showToast('✅ 익명 프로필이 저장됐어요');

  const pending = _pendingBaromeetChat;
  _pendingBaromeetChat = null;
  if (pending) {
    const { data: w } = await db.from('workers').select('photo_url').eq('kakao_uid', currentUser.id).maybeSingle();
    const avatarUrl = _resolveBaromeetAvatarUrl(avatarValue, w?.photo_url);
    await _enterBaromeetChat(pending.gatheringId, pending.title, nick, !!avatarUrl, avatarUrl);
  } else if (_baromeetChatId) {
    // 이미 채팅방에 들어와 있는 상태에서 닉네임/아바타 설정을 바꾼 경우 즉시 반영
    const { data: w } = await db.from('workers').select('photo_url').eq('kakao_uid', currentUser.id).maybeSingle();
    const avatarUrl = _resolveBaromeetAvatarUrl(avatarValue, w?.photo_url);
    _baromeetAnonLabel = nick;
    _baromeetShowPhoto = !!avatarUrl;
    _baromeetPhotoUrl = avatarUrl;
    _updateBaromeetMyProfileBadge();
  }
}

// 헤더 우측 상단의 "내 익명 프로필" 배지(캐릭터/사진 + 닉네임) 갱신
function _updateBaromeetMyProfileBadge() {
  const badge = document.getElementById('moim-chat-myprofile');
  const avatarEl = document.getElementById('moim-chat-myprofile-avatar');
  const nameEl = document.getElementById('moim-chat-myprofile-name');
  if (!badge || !avatarEl || !nameEl) return;
  badge.style.display = 'flex';
  nameEl.textContent = _baromeetAnonLabel || '';
  if (_baromeetPhotoUrl && _baromeetPhotoUrl.startsWith('emoji:')) {
    avatarEl.innerHTML = '';
    avatarEl.textContent = _baromeetPhotoUrl.slice(6);
  } else if (_baromeetPhotoUrl) {
    avatarEl.innerHTML = `<img src="${_baromeetPhotoUrl}" style="width:100%;height:100%;object-fit:cover">`;
  } else {
    avatarEl.innerHTML = '';
    avatarEl.textContent = '👤';
  }
}

async function _enterBaromeetChat(gatheringId, title, nick, showPhoto, photoUrl) {
  _baromeetChatId = gatheringId;
  _baromeetAnonLabel = nick;
  _baromeetShowPhoto = !!showPhoto;
  _baromeetPhotoUrl = showPhoto ? (photoUrl || null) : null;

  document.getElementById('panel-moim-chat').classList.add('show');
  // 바로모임(보라)/바로미팅(로즈)을 색으로 구분 - 헤더 배경 전체를 옅게 tint
  // (바로알바 1:1 채팅은 기존 화이트 그대로 유지)
  const _bcSafearea = document.getElementById('moim-chat-safearea');
  if (_bcSafearea) _bcSafearea.style.background = '#e11d48';
  const _bcHeader = document.getElementById('moim-chat-header');
  if (_bcHeader) _bcHeader.style.background = '#FFF1F2';
  const _bcSendBtn = document.querySelector('#moim-chat-input-bar button[onclick="sendMoimChat()"]');
  if (_bcSendBtn) _bcSendBtn.style.background = '#e11d48';
  // FAB(z-index:520)이 panel-moim-chat(z-index:400) 위로 뚫고 나오는 현상 방지 + 키보드 가림 방지
  // (openMoimChat과 동일한 panel-moim-chat DOM을 공유하면서도 이 등록이 빠져있던 게 원인)
  const _bcFab = document.getElementById('posting-fab');
  if (_bcFab) _bcFab.style.display = 'none';
  document.getElementById('moim-chat-title').textContent = (title || '바로미팅') + ' (익명)';
  document.getElementById('moim-chat-messages').innerHTML = '<div style="text-align:center;padding:24px;color:#bbb;font-size:13px">채팅 불러오는 중...</div>';
  const memberEl = document.getElementById('moim-chat-members-text');
  // 참가자 수를 눈에 보이게 앞에 붙임 - 예전엔 이 자리를 "나는 OO으로 표시돼요"가 통째로
  // 차지해서 참가자 목록을 볼 수 있다는 게 전혀 티가 안 났음(모임 채팅은 그냥 "참가자 N명"이라
  // 바로 보이는데, 익명 바로미팅 채팅만 이 줄이 다른 용도로 바뀌어 있었음)
  const { count: _bcCount } = await db.from('gathering_applications').select('id', { count:'exact', head:true }).eq('gathering_id', gatheringId).eq('status', 'approved');
  if (memberEl) memberEl.textContent = `👥 ${(_bcCount || 0) + 1}명`;
  // 참가자수 옆 "나가기"는 작은 텍스트링크로, 내 프로필(캐릭터+닉네임)은 헤더 우측 상단 배지로 분리
  const leaveLink = document.getElementById('moim-chat-leave-link');
  if (leaveLink) leaveLink.style.display = 'inline';
  _updateBaromeetMyProfileBadge();
  document.getElementById('moim-chat-participants').style.display = 'none';
  document.getElementById('moim-chat-members-arrow').textContent = '▾';

  const { data: msgs } = await db.from('gathering_chats').select('*').eq('gathering_id', gatheringId).order('sent_at').limit(100);
  _renderMoimChatMessages(msgs || []);

  if (_baromeetRealtimeCh) db.removeChannel(_baromeetRealtimeCh);
  _baromeetRealtimeCh = db.channel('baromeet-chat-' + gatheringId)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'gathering_chats', filter: `gathering_id=eq.${gatheringId}` }, payload => {
      _appendMoimChatMsg(payload.new);
    }).subscribe();

  document.getElementById('moim-chat-input').dataset.baromeet = '1';
  document.getElementById('moim-chat-input').dataset.gatheringId = gatheringId;
}

// ── 바로스팟 ────────────────────────────────────────────────
// 이용권 가격표 - 관리자페이지(설정 > 바로스팟 이용권 가격)에서 관리, DB에서 조회
let _barospotPassProducts = null; // { female:[...], male:[...] }
async function loadBarospotPassProducts(force = false) {
  if (_barospotPassProducts && !force) return _barospotPassProducts;
  const { data } = await db.from('barospot_pass_products')
    .select('id,gender,qty,price,label,discount_pct')
    .eq('is_active', true).order('display_order');
  const grouped = { female: [], male: [] };
  (data || []).forEach(p => {
    if (grouped[p.gender]) grouped[p.gender].push({ id: p.id, qty: p.qty, price: p.price, label: p.label, discount: p.discount_pct });
  });
  _barospotPassProducts = grouped;
  return grouped;
}

let _spotGender = null;
let _spotPassCount = 0;
let _selectedSpotPass = null;

async function _loadBarospotList() {
  const show = id => {
    ['mnm-spot-init','mnm-spot-gender-prompt','mnm-spot-female','mnm-spot-male']
      .forEach(sid => { const e = document.getElementById(sid); if(e) e.style.display = sid===id ? 'block' : 'none'; });
  };
  if (!currentUser) { show('mnm-spot-gender-prompt'); return; }
  show('mnm-spot-init');

  // workers 테이블에서 gender 조회
  const { data: wRow } = await db.from('workers').select('gender').eq('kakao_uid', currentUser.id).maybeSingle();
  _spotGender = wRow?.gender || null;
  if (!_spotGender) { show('mnm-spot-gender-prompt'); return; }

  // 이용권 잔여 조회
  const { data: passRow } = await db.from('barospot_passes')
    .select('remaining_count').eq('user_id', currentUser.id).eq('gender', _spotGender).eq('status', 'active').maybeSingle();
  _spotPassCount = passRow?.remaining_count ?? 0;

  if (_spotGender === 'female') {
    const el = document.getElementById('mnm-f-pass-count');
    if (el) el.textContent = _spotPassCount;
    await _loadFemaleApplications();
    show('mnm-spot-female');
  } else {
    const el = document.getElementById('mnm-m-pass-count');
    if (el) el.textContent = _spotPassCount;
    await _loadSpotEvents();
    show('mnm-spot-male');
  }
}

async function setSpotGender(gender) {
  if (!currentUser) return;
  // 신규가입자는 아직 workers 행이 없을 수 있음 - update()만 하면 매칭되는 행이 없어
  // 조용히 0건 처리되고 성별이 저장 안 된 것처럼 보이던 버그 (행이 없으면 새로 생성)
  const { data: existing } = await db.from('workers').select('id').eq('kakao_uid', currentUser.id).maybeSingle();
  let error;
  if (existing) {
    ({ error } = await db.from('workers').update({ gender }).eq('kakao_uid', currentUser.id));
  } else {
    const meta = currentUser.user_metadata || {};
    const name = meta.full_name || meta.name || currentUser.email?.split('@')[0] || '알바생';
    ({ error } = await db.from('workers').insert({ kakao_uid: currentUser.id, name, gender }));
  }
  if (error) { showToast('성별 저장 실패: ' + error.message); return; }
  _spotGender = gender;
  showToast('성별이 저장되었습니다');
  await _loadBarospotList();
}

async function openSpotPassSheet(gender) {
  const all = await loadBarospotPassProducts();
  const products = all[gender] || [];
  const color = gender === 'female' ? '#f43f5e' : '#3b82f6';
  const bgColor = gender === 'female' ? '#fff0f4' : '#eff6ff';
  let html = `<div style="padding:20px 16px 0">
    <div style="font-size:16px;font-weight:900;color:#111;margin-bottom:16px">이용권 구매</div>
    ${products.map(p => `
      <div onclick="selectSpotPass('${p.id}')" id="ssp-${p.id}" style="border:2px solid #e5e7eb;border-radius:14px;padding:14px 16px;margin-bottom:10px;cursor:pointer;display:flex;justify-content:space-between;align-items:center">
        <div>
          <span style="font-size:14px;font-weight:800;color:#111">${p.label}</span>
          ${p.discount ? `<span style="font-size:11px;background:${bgColor};color:${color};padding:2px 7px;border-radius:8px;margin-left:7px;font-weight:700">${p.discount}% 할인</span>` : ''}
          <div style="font-size:11px;color:#aaa;margin-top:3px">${Math.round(p.price/p.qty).toLocaleString()}원/회</div>
        </div>
        <div style="font-size:16px;font-weight:900;color:#111">${p.price.toLocaleString()}<span style="font-size:11px;color:#aaa">원</span></div>
      </div>`).join('')}
  </div>
  <div style="padding:12px 16px;padding-bottom:calc(12px + env(safe-area-inset-bottom,0px));display:flex;gap:10px;border-top:1px solid #ebebeb;background:#f5f5f5;flex-shrink:0">
    <button onclick="closeBottomSheet()" style="flex:1;padding:13px;background:#e5e7eb;color:#555;border:none;border-radius:12px;font-size:14px;font-weight:700;cursor:pointer">취소</button>
    <button id="ssp-buy-btn" onclick="buySpotPass('${gender}')" style="flex:2;padding:13px;background:${color};color:#fff;border:none;border-radius:12px;font-size:14px;font-weight:800;cursor:pointer;opacity:0.4" disabled>결제하기</button>
  </div>`;
  _selectedSpotPass = null;
  openBottomSheet(html);
}

function selectSpotPass(id) {
  document.querySelectorAll('[id^="ssp-"]').forEach(el => {
    if (el.id === 'ssp-buy-btn') return;
    el.style.border = '2px solid #e5e7eb';
  });
  const el = document.getElementById('ssp-' + id);
  const color = _spotGender === 'female' ? '#f43f5e' : '#3b82f6';
  if (el) el.style.border = `2px solid ${color}`;
  _selectedSpotPass = id;
  const btn = document.getElementById('ssp-buy-btn');
  if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
}

async function buySpotPass(gender) {
  if (!_selectedSpotPass || !currentUser) return;
  const all = await loadBarospotPassProducts();
  const allProducts = [...all.female, ...all.male];
  const prod = allProducts.find(p => p.id === _selectedSpotPass);
  if (!prod) return;
  closeBottomSheet();
  showToast('결제 처리 중...');
  // 실제 결제는 Toss Payments 연동 전까지 관리자 확인 방식으로 처리
  // 이용권 레코드 upsert (기존 잔여 + 추가)
  const { data: existing } = await db.from('barospot_passes')
    .select('id, remaining_count').eq('user_id', currentUser.id).eq('gender', gender).eq('status', 'active').maybeSingle();
  let err;
  if (existing) {
    const { error } = await db.from('barospot_passes')
      .update({ remaining_count: existing.remaining_count + prod.qty }).eq('id', existing.id);
    err = error;
  } else {
    const { error } = await db.from('barospot_passes')
      .insert({ user_id: currentUser.id, gender, remaining_count: prod.qty, status: 'active' });
    err = error;
  }
  if (err) { showToast('이용권 등록 실패: ' + err.message); return; }
  showToast(`${prod.label} 구매 완료! 이용권이 추가되었습니다`);
  await _loadBarospotList();
}

async function applyBarospot() {
  if (!currentUser) { showToast('로그인 후 이용하세요'); return; }
  if (_spotPassCount < 1) {
    showToast('이용권이 없습니다. 먼저 구매해주세요');
    openSpotPassSheet('female');
    return;
  }
  const confirmed = await showConfirmDialog('바로스팟 신청', '이용권 1회가 차감됩니다.\n매니저가 제휴 식당과 일정을 배정해드립니다.\n신청하시겠어요?', '신청하기', '취소');
  if (!confirmed) return;
  const { data: passRow } = await db.from('barospot_passes')
    .select('id, remaining_count').eq('user_id', currentUser.id).eq('gender', 'female').eq('status', 'active').maybeSingle();
  if (!passRow || passRow.remaining_count < 1) { showToast('이용권이 없습니다'); return; }
  const { error: pe } = await db.from('barospot_passes')
    .update({ remaining_count: passRow.remaining_count - 1 }).eq('id', passRow.id);
  if (pe) { showToast('오류: ' + pe.message); return; }
  const { error: ae } = await db.from('barospot_applications')
    .insert({ user_id: currentUser.id, gender: 'female', status: 'pending' });
  if (ae) { showToast('신청 오류: ' + ae.message); return; }
  showToast('신청 완료! 매니저가 검토 후 배정을 안내해드립니다');
  await _loadBarospotList();
  // 이 시점엔 아직 매니저가 식당/일정을 배정하기 전이라 지도에 표시할 장소가 없음 -
  // 배정 대기 상태만 보여준다 (배정 완료 후 상세는 마이페이지 > 신청 내역에서 확인)
  openTrackingSheet({
    brand: '📍 바로스팟',
    title: '매니저 배정 대기 중',
    place: '식당 배정 후 안내됩니다',
    addressQuery: null,
    whenISO: null,
    whenText: '배정 대기 중',
    steps: ['신청완료','매니저 배정 대기','확정','종료'],
    stepIndex: 0,
  });
}

async function _loadFemaleApplications() {
  if (!currentUser) return;
  const el = document.getElementById('mnm-f-apps');
  if (!el) return;
  const { data, error } = await db.from('barospot_applications')
    .select('id, status, created_at, barospot_events(restaurant_name, event_date, event_time)')
    .eq('user_id', currentUser.id).eq('gender', 'female')
    .order('created_at', { ascending: false }).limit(10);
  if (error || !data?.length) { el.innerHTML = '<div style="text-align:center;padding:32px;color:#bbb;font-size:13px">신청 내역이 없어요</div>'; return; }
  const statusLabel = { pending:'검토 중', matched:'식당 배정 완료', confirmed:'일정 확정', cancelled:'취소됨' };
  const statusColor = { pending:'#f59e0b', matched:'#8b5cf6', confirmed:'#10b981', cancelled:'#9ca3af' };
  el.innerHTML = data.map(a => {
    const ev = a.barospot_events;
    const st = a.status;
    return `<div style="background:#fff;border-radius:12px;padding:14px 16px;margin-bottom:10px;border:1px solid #f0f0f0">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:${ev?'8px':'0'}">
        <div style="font-size:13px;font-weight:800;color:#222">신청 #${a.id.slice(-6).toUpperCase()}</div>
        <div style="font-size:11px;font-weight:700;color:${statusColor[st]||'#aaa'};background:${statusColor[st]||'#aaa'}18;padding:3px 8px;border-radius:8px">${statusLabel[st]||st}</div>
      </div>
      ${ev ? `<div style="font-size:12px;color:#666">${ev.restaurant_name} · ${ev.event_date} ${ev.event_time}</div>` : ''}
    </div>`;
  }).join('');
}

async function _loadSpotEvents() {
  const el = document.getElementById('mnm-m-events');
  const cntEl = document.getElementById('mnm-spot-event-count');
  if (!el) return;
  const { data, error } = await db.from('barospot_events')
    .select('id, restaurant_name, event_date, event_time, male_slots, male_remaining, menu_description, male_price')
    .eq('status', 'open').order('event_date', { ascending: true });
  if (error || !data?.length) {
    if (cntEl) cntEl.textContent = '0';
    el.innerHTML = `<div style="text-align:center;padding:44px 20px;color:#bbb"><div style="font-size:40px;margin-bottom:10px">📍</div><div style="font-size:14px;font-weight:800;color:#999;margin-bottom:6px">모집 중인 스팟</div><div style="font-size:12px;line-height:1.65">현재 남성 참가자를 모집 중인<br>스팟 이벤트가 없어요</div></div>`;
    return;
  }
  if (cntEl) cntEl.textContent = data.length;
  el.innerHTML = data.map(ev => _renderSpotEventCard(ev)).join('');
}

function _renderSpotEventCard(ev) {
  const full = ev.male_remaining <= 0;
  return `<div style="background:#fff;border-radius:16px;padding:16px;margin-bottom:12px;border:1px solid #e8eaed;overflow:hidden">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">
      <div>
        <div style="font-size:15px;font-weight:900;color:#111;margin-bottom:3px">${ev.restaurant_name}</div>
        <div style="font-size:12px;color:#888">${ev.event_date} ${ev.event_time}</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:11px;color:#888;margin-bottom:2px">남성 잔여</div>
        <div style="font-size:16px;font-weight:900;color:${full?'#ccc':'#3b82f6'}">${ev.male_remaining}<span style="font-size:11px;color:#aaa">/${ev.male_slots}</span></div>
      </div>
    </div>
    ${ev.menu_description ? `<div style="font-size:12px;color:#666;background:#f8f9fa;border-radius:8px;padding:8px 10px;margin-bottom:10px">${ev.menu_description}</div>` : ''}
    <div style="display:flex;justify-content:space-between;align-items:center">
      <div style="font-size:13px;font-weight:800;color:#3b82f6">${ev.male_price?.toLocaleString()}원 <span style="font-size:11px;color:#aaa;font-weight:400">식사비 포함</span></div>
      <button onclick="applySpotEvent('${ev.id}')" ${full?'disabled':''} style="padding:9px 18px;background:${full?'#e5e7eb':'#3b82f6'};color:${full?'#aaa':'#fff'};border:none;border-radius:10px;font-size:13px;font-weight:800;cursor:${full?'default':'pointer'}">${full?'마감':'참가하기'}</button>
    </div>
  </div>`;
}

async function applySpotEvent(eventId) {
  if (!currentUser) { showToast('로그인 후 이용하세요'); return; }
  if (_spotPassCount < 1) {
    showToast('이용권이 없습니다. 먼저 구매해주세요');
    openSpotPassSheet('male');
    return;
  }
  const confirmed = await showConfirmDialog('바로스팟 참가', '이용권 1회가 차감됩니다.\n참가 신청 후 매니저가 최종 확정합니다.\n신청하시겠어요?', '신청하기', '취소');
  if (!confirmed) return;
  const { data: passRow } = await db.from('barospot_passes')
    .select('id, remaining_count').eq('user_id', currentUser.id).eq('gender', 'male').eq('status', 'active').maybeSingle();
  if (!passRow || passRow.remaining_count < 1) { showToast('이용권이 없습니다'); return; }
  const { error: pe } = await db.from('barospot_passes')
    .update({ remaining_count: passRow.remaining_count - 1 }).eq('id', passRow.id);
  if (pe) { showToast('오류: ' + pe.message); return; }
  const { error: ae } = await db.from('barospot_applications')
    .insert({ user_id: currentUser.id, event_id: eventId, gender: 'male', status: 'pending' });
  if (ae) { showToast('신청 오류: ' + ae.message); return; }
  showToast('참가 신청 완료! 매니저가 확인 후 안내드립니다');
  await _loadSpotEvents();
  _openSpotEventTracking(eventId);
}

// 신청 완료 직후 스팟 이벤트 정보를 불러와 실시간 추적화면을 연다
// (바로스팟 여성 신청(applyBarospot)은 이 시점엔 매장/일정이 아직 매니저 배정 전이라
// 추적할 대상이 없음 - 남성이 참가하는 이미 개설된 이벤트(applySpotEvent)만 해당)
async function _openSpotEventTracking(eventId) {
  const { data: ev } = await db.from('barospot_events')
    .select('restaurant_name, event_date, event_time')
    .eq('id', eventId).single();
  if (!ev) return;
  const whenISO = ev.event_date && ev.event_time ? `${ev.event_date}T${ev.event_time}` : null;
  const whenText = whenISO ? new Date(whenISO).toLocaleString('ko-KR', { month:'long', day:'numeric', hour:'numeric', minute:'2-digit' }) : `${ev.event_date || ''} ${ev.event_time || ''}`.trim();
  openTrackingSheet({
    brand: '📍 바로스팟',
    title: ev.restaurant_name || '바로스팟',
    place: ev.restaurant_name || '-',
    placeName: ev.restaurant_name,
    whenISO,
    whenText: whenText || '일정 확인 중',
    steps: ['신청완료','매니저 확인 중','확정','종료'],
    stepIndex: 0,
  });
}

// ── 포인트 시스템 ──────────────────────────────────────────
// 충전 보너스 공식: 충전액의 10% + (2만원당 1,000P) — 커스텀 금액에도 동일 적용
function _chargeBonusFor(amount) {
  return Math.floor(amount * 0.10) + Math.floor(amount / 20000) * 1000;
}
// 충전 티어: { amount(KRW), bonus(P 추가 지급), total(최종 포인트), label }
const CHARGE_TIERS = [
  { amount: 5000,  bonus: 500,  total: 5500,  promo: true  },  // 런칭 이벤트
  { amount: 10000, bonus: 1000, total: 11000, promo: false },
  { amount: 30000, bonus: 4000, total: 34000, promo: false },
  { amount: 50000, bonus: 7000, total: 57000, promo: false },
];
const BANK_INFO = { bank: '하나은행', account: '149-910031-24204', holder: '멀티무브 주식회사' };

let _selectedChargeTier = null;   // 선택된 티어 (null=기타)
let _selectedChargeAmt  = 0;      // 최종 KRW 금액 (기타 포함)
// 최종 충전 포인트 (티어 선택 시 total, 기타 금액이면 원금+보너스 직접 계산)
function _currentChargeTotalPts() {
  if (_selectedChargeTier) return _selectedChargeTier.total;
  return _selectedChargeAmt ? _selectedChargeAmt + _chargeBonusFor(_selectedChargeAmt) : 0;
}
let _selectedChargeMethod = '';   // 'toss' | 'cash'

async function loadUserPoints() {
  if (!currentUser) return 0;
  try {
    const { data } = await db.from('point_accounts')
      .select('balance').eq('user_id', currentUser.id).single();
    const bal = data?.balance ?? 0;
    const mpEl = document.getElementById('mp-point-val');
    if (mpEl) mpEl.textContent = bal.toLocaleString() + 'P';
    const phBal = document.getElementById('ph-balance');
    if (phBal) phBal.textContent = bal.toLocaleString();
    const ccb = document.getElementById('charge-balance-display');
    if (ccb) ccb.textContent = bal.toLocaleString();
    return bal;
  } catch(_) { return 0; }
}

function openPointCharge() {
  if (!currentUser) { showLoginPrompt('로그인이 필요해요', '포인트 충전은 로그인 후 이용 가능합니다.'); return; }
  _selectedChargeTier = null;
  _selectedChargeAmt  = 0;
  _selectedChargeMethod = '';
  loadUserPoints();
  _pcGoToStep('method');
  const overlay = document.getElementById('point-charge-overlay');
  if (overlay) { overlay.style.display = 'flex'; overlay.style.alignItems = 'flex-end'; }
  bindSheetDragClose(document.getElementById('point-charge-handle'), document.getElementById('point-charge-panel'), closePointCharge);
}

function closePointCharge() {
  const overlay = document.getElementById('point-charge-overlay');
  if (overlay) overlay.style.display = 'none';
}

function _pcGoToStep(step) {
  ['method','amount','bank'].forEach(s => {
    const el = document.getElementById(`pc-step-${s}`);
    if (el) el.style.display = s === step ? 'block' : 'none';
  });
  // 금액 단계 진입 시 그리드 초기화
  if (step === 'amount') _buildChargeAmtGrid();
  // 계좌이체 단계 진입 시 은행 정보 + 입금자명 초기화
  if (step === 'bank') {
    const ni = document.getElementById('pc-depositor-name');
    if (ni) ni.value = currentUser?.user_metadata?.full_name || '';
    const totalPts = _currentChargeTotalPts();
    const bnEl = document.getElementById('pc-bank-name');    if (bnEl) bnEl.textContent = BANK_INFO.bank;
    const baEl = document.getElementById('pc-bank-account'); if (baEl) baEl.textContent = BANK_INFO.account;
    const bhEl = document.getElementById('pc-bank-holder');  if (bhEl) bhEl.textContent = BANK_INFO.holder;
    const amEl = document.getElementById('pc-bank-amount');  if (amEl) amEl.textContent = `₩${_selectedChargeAmt.toLocaleString()} → ${totalPts.toLocaleString()}P`;
    _updateCashBtn();
  }
}

function selectChargeMethod(method) {
  _selectedChargeMethod = method;
  document.querySelectorAll('.pc-method-btn').forEach(b => {
    const isSelected = b.dataset.method === method;
    b.style.borderColor  = isSelected ? '#7C3AED' : '#e0e0e0';
    b.style.background   = isSelected ? '#f3e8ff' : '#fff';
    b.style.color        = isSelected ? '#7C3AED' : '#555';
    b.style.fontWeight   = isSelected ? '900' : '600';
  });
  const nextBtn = document.getElementById('pc-method-next');
  if (nextBtn) {
    nextBtn.disabled = false;
    nextBtn.style.cssText = 'width:100%;padding:14px;border:none;border-radius:14px;background:linear-gradient(135deg,#7C3AED,#a855f7);color:#fff;font-size:15px;font-weight:900;cursor:pointer;margin-top:14px';
    nextBtn.textContent = method === 'cash' ? '계좌이체로 충전 ›' : '토스로 결제 ›';
  }
}

function _buildChargeAmtGrid() {
  const grid = document.getElementById('point-amt-grid');
  if (!grid) return;
  // 티어 버튼
  const tierHtml = CHARGE_TIERS.map((t, i) => {
    const bonusLabel = t.promo
      ? `<div style="font-size:9px;font-weight:900;color:#fff;background:#f43f5e;border-radius:4px;padding:1px 5px;display:inline-block;margin-top:2px">🎉 런칭 이벤트!</div>`
      : (t.bonus > 0
        ? `<div style="font-size:9px;font-weight:800;color:#f43f5e;margin-top:2px">+${t.bonus.toLocaleString()}P 보너스</div>`
        : `<div style="font-size:9px;color:transparent;margin-top:2px">ㅡ</div>`);
    const border = t.promo ? '#f43f5e' : '#e0e0e0';
    const bg     = t.promo ? '#fff5f5' : '#fff';
    return `<button class="pc-amt-btn" data-tier="${i}" onclick="selectChargeTier(this,${i})"
      style="border:1.5px solid ${border};border-radius:12px;padding:10px 6px;background:${bg};cursor:pointer;text-align:center;line-height:1.3;transition:all .15s;position:relative">
      <div style="font-size:13px;font-weight:900;color:#333">₩${t.amount.toLocaleString()}</div>
      <div style="font-size:12px;font-weight:900;color:#7C3AED;margin-top:2px">${t.total.toLocaleString()}P</div>
      ${bonusLabel}
    </button>`;
  }).join('');
  // 기타금액 (10% + 2만원당 1,000P 보너스 자동 계산)
  const customHtml = `<div style="grid-column:1/-1;margin-top:4px">
    <div style="font-size:11px;color:#aaa;margin-bottom:5px;font-weight:700">기타 금액 (최소 5,000원 · 10% + 2만원당 1,000P 보너스)</div>
    <div style="display:flex;gap:8px;align-items:center">
      <input id="pc-custom-amt" type="number" min="5000" max="500000" step="1000" placeholder="직접 입력"
        oninput="onCustomAmtInput(this)"
        style="flex:1;border:1.5px solid #e0e0e0;border-radius:10px;padding:10px 12px;font-size:13px;font-weight:700;outline:none">
      <span style="font-size:12px;color:#888;flex-shrink:0">원</span>
    </div>
    <div id="pc-custom-preview" style="font-size:11px;color:#7C3AED;font-weight:700;margin-top:5px;min-height:16px"></div>
  </div>`;
  grid.innerHTML = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">${tierHtml}</div>${customHtml}`;

  const proceedBtn = document.getElementById('pc-amt-proceed');
  if (proceedBtn) { proceedBtn.disabled = true; proceedBtn.style.background = '#e0e0e0'; proceedBtn.style.color = '#aaa'; proceedBtn.style.cursor = 'not-allowed'; proceedBtn.textContent = '금액을 선택해주세요'; }
}

function selectChargeTier(btn, tierIdx) {
  _selectedChargeTier = CHARGE_TIERS[tierIdx];
  _selectedChargeAmt  = _selectedChargeTier.amount;
  // 커스텀 입력 초기화
  const ci = document.getElementById('pc-custom-amt');
  if (ci) ci.value = '';
  // 버튼 스타일
  document.querySelectorAll('.pc-amt-btn').forEach(b => {
    b.style.borderColor = '#e0e0e0'; b.style.background = '#fff';
  });
  btn.style.borderColor = '#7C3AED'; btn.style.background = '#f3e8ff';
  _updateAmtProceedBtn();
}

function onCustomAmtInput(inp) {
  const v = parseInt(inp.value, 10);
  const preview = document.getElementById('pc-custom-preview');
  if (v >= 5000) {
    _selectedChargeTier = null;
    _selectedChargeAmt  = v;
    document.querySelectorAll('.pc-amt-btn').forEach(b => { b.style.borderColor = '#e0e0e0'; b.style.background = '#fff'; });
    const bonus = _chargeBonusFor(v);
    const total = v + bonus;
    if (preview) preview.textContent = bonus > 0
      ? `→ ${total.toLocaleString()}P (+${bonus.toLocaleString()}P 보너스)`
      : `→ ${total.toLocaleString()}P`;
    _updateAmtProceedBtn();
  } else {
    _selectedChargeTier = null;
    _selectedChargeAmt  = 0;
    if (preview) preview.textContent = v > 0 && v < 5000 ? '최소 5,000원 이상 입력해주세요' : '';
    _updateAmtProceedBtn();
  }
}

function copyBankAccount() {
  const acc = BANK_INFO.account;
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(acc).then(() => showToast('계좌번호가 복사됐습니다 ✓'));
  } else {
    const ta = document.createElement('textarea');
    ta.value = acc; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); showToast('계좌번호가 복사됐습니다 ✓'); } catch(_) {}
    document.body.removeChild(ta);
  }
}

function _updateAmtProceedBtn() {
  const btn = document.getElementById('pc-amt-proceed');
  if (!btn) return;
  if (!_selectedChargeAmt) {
    btn.disabled = true; btn.style.background = '#e0e0e0'; btn.style.color = '#aaa'; btn.style.cursor = 'not-allowed'; btn.textContent = '금액을 선택해주세요';
    return;
  }
  const totalPts = _currentChargeTotalPts();
  btn.disabled = false;
  btn.style.cssText = 'width:100%;padding:14px;border:none;border-radius:14px;background:linear-gradient(135deg,#7C3AED,#a855f7);color:#fff;font-size:15px;font-weight:900;cursor:pointer';
  btn.textContent = `💎 ${totalPts.toLocaleString()}P 충전 (₩${_selectedChargeAmt.toLocaleString()})`;
}

function proceedFromAmount() {
  if (!_selectedChargeAmt) return;
  if (_selectedChargeMethod === 'cash') {
    _pcGoToStep('bank');
  } else {
    requestTossPointPayment();
  }
}

async function requestTossPointPayment() {
  if (!_selectedChargeAmt) return;
  if (typeof TossPayments === 'undefined') { showToast('결제 모듈 로드 실패. 새로고침 후 시도해주세요.'); return; }
  const btn = document.getElementById('pc-amt-proceed');
  if (btn) { btn.disabled = true; btn.textContent = '처리 중...'; }
  const totalPts = _currentChargeTotalPts();
  const orderId = `point-${(currentUser.id || '').slice(0,8)}-${Date.now()}`;
  const base = window.location.origin + window.location.pathname;
  try {
    const tossPayments = TossPayments(TOSS_CLIENT_KEY);
    await tossPayments.requestPayment('카드', {
      amount: _selectedChargeAmt,
      orderId,
      orderName: `바로알바 포인트 ${totalPts.toLocaleString()}P`,
      successUrl: `${base}?point_payment=success&orderId=${orderId}&amount=${_selectedChargeAmt}`,
      failUrl: `${base}?point_payment=fail`,
      customerEmail: currentUser.email || '',
      customerName: currentUser.user_metadata?.full_name || '사용자',
    });
  } catch (e) {
    if (e.code !== 'USER_CANCEL') showToast('결제 오류: ' + (e.message || '다시 시도해주세요'));
    if (btn) { btn.disabled = false; _updateAmtProceedBtn(); }
  }
}

async function handlePointPaymentResult() {
  const params = new URLSearchParams(window.location.search);
  const result = params.get('point_payment');
  if (!result) return;
  window.history.replaceState({}, '', window.location.pathname);
  if (result === 'fail') { showToast('포인트 충전이 취소됐습니다'); return; }
  if (result !== 'success') return;
  const paymentKey = params.get('paymentKey');
  const orderId    = params.get('orderId');
  const amount     = params.get('amount');
  if (!paymentKey || !orderId || !amount) return;
  showToast('포인트 충전 확인 중...');
  try {
    const res = await fetch('/api/toss-points', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentKey, orderId, amount: Number(amount), userId: currentUser?.id }),
    });
    const data = await res.json();
    if (data.success) {
      showToast(`✅ ${(data.totalPoints || Number(amount)).toLocaleString()}P 충전 완료!`);
      loadUserPoints();
    } else {
      showToast('충전 확인 실패: ' + (data.error || '오류'));
    }
  } catch (e) {
    showToast('충전 확인 중 오류 발생');
  }
}

function _updateCashBtn() {
  const ni = document.getElementById('pc-depositor-name');
  const btn = document.getElementById('pc-cash-submit');
  if (!btn) return;
  const hasName = ni?.value.trim().length > 0;
  btn.disabled = !hasName;
  btn.style.background = hasName ? 'linear-gradient(135deg,#16a34a,#22c55e)' : '#e0e0e0';
  btn.style.color = hasName ? '#fff' : '#aaa';
  btn.style.cursor = hasName ? 'pointer' : 'not-allowed';
}

async function submitCashDeposit() {
  const depositorName = document.getElementById('pc-depositor-name')?.value.trim();
  if (!depositorName) { showToast('입금자명을 입력해주세요'); return; }
  if (!_selectedChargeAmt) return;
  const btn = document.getElementById('pc-cash-submit');
  if (btn) { btn.disabled = true; btn.textContent = '처리 중...'; }
  const totalPts = _currentChargeTotalPts();
  try {
    const { error } = await db.from('point_charge_requests').insert({
      user_id: currentUser.id,
      user_name: currentUser.user_metadata?.full_name || depositorName,
      user_email: currentUser.email || '',
      amount: _selectedChargeAmt,
      bonus_points: _selectedChargeTier ? _selectedChargeTier.bonus : 0,
      total_points: totalPts,
      method: 'cash',
      status: 'pending',
      deposit_name: depositorName,
    });
    if (error) throw error;
    closePointCharge();
    showToast(`✅ 입금 신청 완료! 확인 후 ${totalPts.toLocaleString()}P가 지급됩니다.`);
  } catch (e) {
    showToast('신청 중 오류: ' + (e.message || '다시 시도해주세요'));
    if (btn) { btn.disabled = false; btn.textContent = '입금 완료 알림 보내기'; }
  }
}

async function openPointHistory() {
  if (!currentUser) { showLoginPrompt('로그인이 필요해요', '포인트 내역은 로그인 후 이용 가능합니다.'); return; }
  const panel = document.getElementById('point-history-panel');
  if (!panel) return;
  panel.style.display = 'block';
  history.pushState({ panel: null }, '');
  panel.scrollTop = 0;
  const bal = await loadUserPoints();
  const phBal = document.getElementById('ph-balance');
  if (phBal) phBal.textContent = (bal ?? 0).toLocaleString();
  const listEl = document.getElementById('ph-list');
  if (listEl) listEl.innerHTML = '<div style="text-align:center;color:#bbb;font-size:13px;padding:20px 0">로딩중...</div>';
  try {
    const { data } = await db.from('point_transactions')
      .select('*').eq('user_id', currentUser.id)
      .order('created_at', { ascending: false }).limit(50);
    if (!data?.length) {
      if (listEl) listEl.innerHTML = '<div style="text-align:center;color:#bbb;font-size:13px;padding:30px 0">거래 내역이 없습니다</div>';
      return;
    }
    if (listEl) listEl.innerHTML = data.map(t => {
      const isPlus = t.amount > 0;
      const dt = new Date(t.created_at);
      const dtStr = `${dt.getFullYear()}.${String(dt.getMonth()+1).padStart(2,'0')}.${String(dt.getDate()).padStart(2,'0')}`;
      return `<div style="background:#fff;border-radius:12px;padding:14px 16px;display:flex;align-items:center;gap:12px">
        <div style="width:36px;height:36px;border-radius:10px;background:${isPlus ? '#f3e8ff' : '#fef2f2'};display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0">${isPlus ? '💎' : '✨'}</div>
        <div style="flex:1">
          <div style="font-size:13px;font-weight:700;color:#222">${(t.description || (isPlus ? '포인트 충전' : '포인트 사용')).replace(/</g,'&lt;')}</div>
          <div style="font-size:11px;color:#aaa;margin-top:2px">${dtStr} · 잔액 ${(t.balance_after||0).toLocaleString()}P</div>
        </div>
        <div style="font-size:15px;font-weight:900;color:${isPlus ? '#7C3AED' : '#C8102E'}">${isPlus ? '+' : ''}${t.amount.toLocaleString()}P</div>
      </div>`;
    }).join('');
  } catch(_) {
    if (listEl) listEl.innerHTML = '<div style="text-align:center;color:#bbb;font-size:13px;padding:30px 0">내역을 불러올 수 없습니다</div>';
  }
}

function closePointHistory() {
  const panel = document.getElementById('point-history-panel');
  if (panel) panel.style.display = 'none';
}

