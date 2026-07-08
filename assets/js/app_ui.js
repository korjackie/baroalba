
// ── 금지행위 동의 바텀시트 ──────────────────────────────
let _bannedAgreeCallback = null;
function checkBannedAgree(callback) {
  if (localStorage.getItem('baro_banned_agreed')) { callback(); return; }
  _bannedAgreeCallback = callback;
  document.getElementById('banned-agree-overlay').style.display = 'flex';
}
function confirmBannedAgree() {
  localStorage.setItem('baro_banned_agreed', '1');
  document.getElementById('banned-agree-overlay').style.display = 'none';
  if (_bannedAgreeCallback) { _bannedAgreeCallback(); _bannedAgreeCallback = null; }
}
function closeBannedAgreeSheet() {
  document.getElementById('banned-agree-overlay').style.display = 'none';
  _bannedAgreeCallback = null;
}

// ── 프로필 사진 TIP 바텀시트 ─────────────────────────────
function showPhotoTip(e) {
  if (localStorage.getItem('baro_photo_tip_seen')) return;
  e.preventDefault();
  document.getElementById('photo-tip-overlay').style.display = 'flex';
}
function openPhotoPickerAndCloseTip() {
  localStorage.setItem('baro_photo_tip_seen', '1');
  document.getElementById('photo-tip-overlay').style.display = 'none';
  document.getElementById('worker-photos-input').click();
}

// ── 커스텀 confirm / alert ────────────────────────────────
let _scCallback = null;
function showConfirm(msg, onOk, opts = {}) {
  const el = document.getElementById('sc-overlay');
  if (!el) { if (onOk && (!opts || !opts.hideCancel) ? window.confirm(msg) : true) onOk?.(); return; }
  document.getElementById('sc-icon').textContent  = opts.icon  || (opts.danger ? '⚠️' : '❓');
  document.getElementById('sc-title').textContent = opts.title || '';
  document.getElementById('sc-title').style.display = opts.title ? 'block' : 'none';
  document.getElementById('sc-msg').textContent   = msg;
  document.getElementById('sc-msg').style.display = msg ? 'block' : 'none';
  const okBtn = document.getElementById('sc-ok');
  okBtn.textContent   = opts.okLabel  || '확인';
  okBtn.style.background = opts.danger ? '#C8102E' : (opts.okBg || '#374151');
  document.getElementById('sc-cancel').style.display = opts.hideCancel ? 'none' : 'block';
  _scCallback = onOk || null;
  el.style.display = 'flex';
}
function showAlert(msg, opts = {}) {
  showConfirm(msg, null, { ...opts, hideCancel: true, okLabel: opts.okLabel || '확인', okBg: '#374151' });
}
function _scOk() {
  document.getElementById('sc-overlay').style.display = 'none';
  const cb = _scCallback; _scCallback = null; cb?.();
}
function _scCancel() {
  document.getElementById('sc-overlay').style.display = 'none';
  _scCallback = null;
}

// ═══════════════════════════════════════════════════════════════════
// ── 단골 알바생 우선 알림 ──────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════
async function _notifyFavWorkers(jobId, title, wage) {
  if (!bizRecord?.id) return;
  const { data: favs } = await db.from('fav_workers')
    .select('worker_id, workers(kakao_uid)').eq('business_id', bizRecord.id);
  if (!favs?.length) return;
  const wageStr = wage ? ` · ${wage.toLocaleString()}원` : '';
  const body = `[단골 업체] ${title}${wageStr} 새 공고가 올라왔어요`;
  for (const fav of favs) {
    const uid = fav.workers?.kakao_uid;
    if (!uid) continue;
    fetch('/api/send-push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: uid,
        title: `⭐ ${bizRecord.biz_name || bizRecord.name}`,
        body,
        url: jobId ? `/바로알바.html?job=${jobId}` : '/바로알바.html'
      })
    }).catch(() => {});
  }
}

// ═══════════════════════════════════════════════════════════════════
// ── 전자계약서 자동 생성 ───────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════
// STAFF 관리 패널
// ══════════════════════════════════════════════════════════════

let _staffData = [];
let _staffFilter = 'all';

async function loadStaffPanel() {
  const el = document.getElementById('staff-list');
  if (!el) return;
  el.innerHTML = '<div style="text-align:center;padding:32px"><div class="spinner"></div></div>';
  try {
    let jobIds = postings.map(p => p.id);
    if (!jobIds.length) {
      const { data: jobs } = await db.from('job_postings').select('id').eq('business_id', bizRecord?.id);
      jobIds = (jobs || []).map(j => j.id);
    }
    if (!jobIds.length) { el.innerHTML = '<div style="text-align:center;padding:40px;color:#aaa">등록된 공고가 없어요</div>'; return; }

    const { data, error } = await db.from('applications')
      .select('id,status,applied_at,worker_rating,wage_paid,job_posting_id,workers(id,name,rating,review_count,nationality,kakao_uid), job_postings(id,title,current_wage,duration_hours,work_type)')
      .in('job_posting_id', jobIds)
      .order('applied_at', { ascending: false });

    if (error) {
      console.error('[Staff] 조회 실패:', error);
      el.innerHTML = `<div style="text-align:center;padding:40px;color:#aaa">불러오기 실패<br><span style="font-size:11px;color:#ccc">${error.message}</span><br><button onclick="loadStaffPanel()" style="margin-top:10px;background:none;border:none;color:var(--red);font-weight:700;cursor:pointer;font-size:13px">↺ 다시 시도</button></div>`;
      return;
    }
    _staffData = data || [];
    renderStaffPanel();
  } catch(e) {
    console.error('[Staff] 예외:', e);
    el.innerHTML = `<div style="text-align:center;padding:40px;color:#aaa">오류 발생<br><span style="font-size:11px;color:#ccc">${e.message}</span><br><button onclick="loadStaffPanel()" style="margin-top:10px;background:none;border:none;color:var(--red);font-weight:700;cursor:pointer;font-size:13px">↺ 다시 시도</button></div>`;
  }
}

function filterStaff(filter, chipEl) {
  _staffFilter = filter;
  document.querySelectorAll('.staff-chip').forEach(c => c.classList.remove('active'));
  if (chipEl) chipEl.classList.add('active');
  renderStaffPanel();
}

function renderStaffPanel() {
  const el = document.getElementById('staff-list');
  const now = new Date();
  const thisMonth = now.toISOString().slice(0, 7);

  let filtered = _staffData;
  if (_staffFilter === 'accepted')   filtered = _staffData.filter(a => a.status === 'accepted');
  else if (_staffFilter === 'completed') filtered = _staffData.filter(a => a.status === 'completed');
  else if (_staffFilter === 'pending')   filtered = _staffData.filter(a => a.status === 'pending' || a.status === 'reviewing');
  else if (_staffFilter === 'unpaid')    filtered = _staffData.filter(a => a.status === 'completed' && !a.wage_paid);

  // 요약 통계
  const activeCount  = _staffData.filter(a => a.status === 'accepted').length;
  const unpaidCount  = _staffData.filter(a => a.status === 'completed' && !a.wage_paid).length;
  const monthlyWage  = _staffData
    .filter(a => a.status === 'completed' && (a.completed_at||'').startsWith(thisMonth))
    .reduce((sum, a) => {
      const w = a.job_postings?.current_wage || 0;
      const h = a.job_postings?.duration_hours || 0;
      return sum + w * h;
    }, 0);

  document.getElementById('st-active').textContent = activeCount + '명';
  document.getElementById('st-unpaid').textContent = unpaidCount + '명';
  document.getElementById('st-total-wage').textContent = monthlyWage ? monthlyWage.toLocaleString() + '원' : '—';

  if (!filtered.length) {
    el.innerHTML = '<div style="text-align:center;padding:40px;color:#aaa;font-size:13px">해당 데이터가 없어요</div>';
    return;
  }

  const STATUS_LABEL = { pending:'접수', reviewing:'검토중', accepted:'근무중', rejected:'탈락', completed:'완료', noshow:'노쇼' };
  const STATUS_CLS   = { pending:'background:#FEF3C7;color:#92400E', reviewing:'background:#DBEAFE;color:#1e40af', accepted:'background:#D1FAE5;color:#065F46', rejected:'background:#F3F4F6;color:#9CA3AF', completed:'background:#EDE9FE;color:#5b21b6', noshow:'background:#FEE2E2;color:#991B1B' };

  el.innerHTML = filtered.map(a => {
    const w = a.workers || {};
    const job = a.job_postings || {};
    const wage = (job.current_wage || 0) * (job.duration_hours || 0);
    const visaBadge = w.visa_doc_url ? '<span class="staff-visa-badge">✅ 비자인증</span>' : (w.visa_type && w.visa_type !== 'KR' ? `<span class="staff-visa-badge" style="background:#FFF7ED;color:#c2410c">${w.visa_type}</span>` : '');
    const startStr  = job.start_time ? new Date(job.start_time).toLocaleDateString('ko-KR',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}) : '-';
    const sStyle    = STATUS_CLS[a.status] || '';
    const isPaid    = a.wage_paid;
    const wageStr   = wage ? wage.toLocaleString() + '원' : '-';

    return `<div class="staff-card">
      <div class="staff-card-top">
        <div class="staff-avatar">👤</div>
        <div style="flex:1;min-width:0">
          <div class="staff-name">${w.name||'—'}${visaBadge}</div>
          <div class="staff-meta">${w.phone||''} ${w.nationality ? '· '+w.nationality : ''}</div>
        </div>
        <span style="font-size:10px;font-weight:700;padding:4px 10px;border-radius:8px;${sStyle}">${STATUS_LABEL[a.status]||a.status}</span>
      </div>
      <div class="staff-rows">
        <div class="staff-row">
          <span class="staff-row-label">공고</span>
          <span class="staff-row-val" style="font-size:12px">${job.title||'-'}</span>
        </div>
        <div class="staff-row">
          <span class="staff-row-label">근무일시</span>
          <span class="staff-row-val">${startStr}</span>
        </div>
        <div class="staff-row">
          <span class="staff-row-label">시급 × 시간</span>
          <span class="staff-row-val">${(job.current_wage||0).toLocaleString()}원 × ${job.duration_hours||0}h</span>
        </div>
        <div class="staff-row">
          <span class="staff-row-label">예상 급여</span>
          <span class="staff-row-val" style="color:#C8102E;font-size:14px;font-weight:900">${wageStr}</span>
        </div>
        ${a.status === 'completed' ? `
        <div class="staff-row">
          <span class="staff-row-label">급여 지급</span>
          <button class="wage-paid-btn ${isPaid?'paid':'unpaid'}" onclick="toggleWagePaid('${a.id}',${isPaid},this)">
            ${isPaid ? '✅ 지급완료' : '❌ 미지급'}
          </button>
        </div>` : ''}
      </div>
      ${a.status === 'completed' && !isPaid && wage ? `<div style="margin:4px 0 8px"><button onclick="openWageTransferModal('${a.id}','${(w.name||'').replace(/'/g,"\\'")}','${w.phone||''}',${wage})" style="width:100%;padding:11px;background:linear-gradient(135deg,#0064FF,#0051CC);color:#fff;border:none;border-radius:12px;font-size:13px;font-weight:800;cursor:pointer">💸 토스/카카오페이로 송금하기</button></div>` : ''}
      <div class="staff-actions">
        <button class="staff-act-btn" onclick="openChat('${a.id}','${(w.name||'').replace(/'/g,"\\'")}')">💬 채팅</button>
        ${w.phone ? `<button class="staff-act-btn" onclick="window.location.href='tel:${w.phone}'">📞 전화</button>` : ''}
        ${a.status === 'completed' ? `<button class="staff-act-btn" style="background:#FFF0F0;color:#C8102E" onclick="relistPosting('${job.id||''}')">🔄 재채용</button>` : ''}
      </div>
    </div>`;
  }).join('');
}

async function toggleWagePaid(appId, currentPaid, btnEl) {
  const newPaid = !currentPaid;
  btnEl.disabled = true;
  const { error } = await db.from('applications').update({
    wage_paid: newPaid,
    wage_paid_at: newPaid ? new Date().toISOString() : null
  }).eq('id', appId);
  if (error) { showToast('저장 실패'); btnEl.disabled = false; return; }
  const app = _staffData.find(a => a.id === appId);
  if (app) app.wage_paid = newPaid;
  btnEl.className = 'wage-paid-btn ' + (newPaid ? 'paid' : 'unpaid');
  btnEl.textContent = newPaid ? '✅ 지급완료' : '❌ 미지급';
  btnEl.disabled = false;
  showToast(newPaid ? '✅ 급여 지급 완료 처리' : '급여 미지급으로 변경');
  // 요약 수치 갱신
  const unpaid = _staffData.filter(a => a.status === 'completed' && !a.wage_paid).length;
  document.getElementById('st-unpaid').textContent = unpaid + '명';
}

// ── 당일정산 송금 모달 ──────────────────────────────────────────
let _wtAppId = null, _wtWage = 0, _wtPhone = '';
function openWageTransferModal(appId, workerName, phone, wage) {
  _wtAppId = appId; _wtWage = wage; _wtPhone = phone;
  document.getElementById('wt-worker-name').textContent = workerName + ' 님의 급여';
  document.getElementById('wt-wage-display').textContent = wage.toLocaleString() + '원';
  const phoneRow = document.getElementById('wt-phone-row');
  const phoneDisp = document.getElementById('wt-phone-display');
  if (phone) {
    phoneRow.style.display = 'block';
    phoneDisp.textContent = phone;
  } else {
    phoneRow.style.display = 'none';
  }
  document.getElementById('wage-transfer-modal').style.display = 'flex';
}
function closeWageTransferModal() {
  document.getElementById('wage-transfer-modal').style.display = 'none';
  _wtAppId = null; _wtWage = 0; _wtPhone = '';
}
function sendViaToss() {
  const amount = _wtWage;
  const phone = _wtPhone ? _wtPhone.replace(/-/g, '') : '';
  // 토스 딥링크: 금액+수신자 전화번호(있을 경우)
  const params = new URLSearchParams({ amount });
  if (phone) params.append('bank', ''); // phone 기반 송금
  const deeplink = phone
    ? `supertoss://send?amount=${amount}&phone=${phone}&memo=${encodeURIComponent('바로알바 급여')}`
    : `supertoss://send?amount=${amount}&memo=${encodeURIComponent('바로알바 급여')}`;
  // Android intent fallback
  const intentUrl = `intent://send?amount=${amount}${phone?'&phone='+phone:''}&memo=${encodeURIComponent('바로알바 급여')}#Intent;scheme=supertoss;package=viva.republica.toss;end`;
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('android')) {
    window.location.href = intentUrl;
  } else {
    window.location.href = deeplink;
  }
  setTimeout(() => showToast('토스 앱이 열리지 않으면 앱을 먼저 설치해주세요'), 1200);
}
function sendViaKakaoPay() {
  const amount = _wtWage;
  const deeplink = `kakaotalk://kakaopay/money/transfer?sender_name=바로알바&amount=${amount}`;
  window.location.href = deeplink;
  setTimeout(() => showToast('카카오페이 앱이 열리지 않으면 앱을 먼저 설치해주세요'), 1200);
}
async function confirmWageSent() {
  if (!_wtAppId) return;
  const { error } = await db.from('applications').update({
    wage_paid: true, wage_paid_at: new Date().toISOString()
  }).eq('id', _wtAppId);
  if (error) { showToast('저장 실패'); return; }
  const app = _staffData.find(a => a.id === _wtAppId);
  if (app) app.wage_paid = true;
  showToast('✅ 급여 지급 완료 처리됐어요');
  closeWageTransferModal();
  renderStaffPanel();
}

// ══════════════════════════════════════════════════════════════
// 외국인 특화 비자 시스템
// ══════════════════════════════════════════════════════════════

const VISA_ELIGIBLE_JOBS = {
  'KR':    { label:'한국 국적', jobs:['전 업종 가능'], note:'취업에 제한이 없습니다.', color:'#16a34a' },
  'H-2':   { label:'H-2 방문취업', jobs:['F&B/식음료','물류/배달','청소/위생','건설보조','제조/생산','농업/어업','판매/서비스','주차/경비'], note:'동포(중국·구소련) 대상. 법무부 허용 업종 내 자유취업 가능. 단순노무 위주.', color:'#2563eb' },
  'E-9':   { label:'E-9 비전문취업', jobs:['제조업','농업','어업','건설업 일부','서비스업 일부'], note:'고용허가제 적용. 지정 업체·업종 외 근무 불가. 업체 변경 시 고용센터 신고 필요.', color:'#d97706', warn:true },
  'F-4':   { label:'F-4 재외동포', jobs:['전 업종 가능 (단순노무 제외)'], note:'단순노무(청소, 단순조립 등) 업종은 제한. 대부분 전문·사무 업종 가능.', color:'#2563eb' },
  'F-5':   { label:'F-5 영주권', jobs:['제한 없음 (전 업종)'], note:'한국 국적자와 동일하게 취업 제한 없음.', color:'#16a34a' },
  'F-6':   { label:'F-6 결혼이민', jobs:['제한 없음 (전 업종)'], note:'국민의 배우자로서 취업 제한 없음.', color:'#16a34a' },
  'F-2':   { label:'F-2 거주', jobs:['대부분 업종 가능'], note:'체류자격별 허가 범위 내 취업 가능. 허가증 업종 확인 필요.', color:'#2563eb' },
  'D-2':   { label:'D-2 유학', jobs:['시간제 알바 (주 20시간 이내)'], note:'학기 중 주 20시간 이내만 가능. 방학 중에는 시간 제한 없음.', color:'#d97706', warn:true },
  'D-4':   { label:'D-4 어학연수', jobs:['시간제 알바 (주 20시간 이내)'], note:'시간제 취업허가 필요. 주 20시간 초과 불가.', color:'#d97706', warn:true },
  'E-7':   { label:'E-7 특정활동', jobs:['허가된 전문직 업무만 가능'], note:'허가증에 명시된 직종 외 근무 불가.', color:'#7c3aed', warn:true },
  'C-4':   { label:'C-4 단기취업', jobs:['단기 허가 업종'], note:'90일 이내 단기. 허가된 업종 외 불가.', color:'#d97706', warn:true },
  'OTHER': { label:'기타 비자', jobs:['비자 종류에 따라 상이'], note:'출입국관리사무소 또는 고용지원센터에 확인하세요.', color:'#888' },
};

const ALL_JOB_TYPES = ['F&B/식음료','물류/배달','청소/위생','건설/시설','제조/생산','농업/어업','판매/서비스','주차/경비','사무/행정','IT/개발','교육/강사','미용/헬스'];

let _visaDocFile = null;
let _selectedPrefJobs = new Set();

function onVisaCountryChange() {
  const country = document.getElementById('visa-country').value;
  const visaSection = document.getElementById('visa-type-section');
  const docSection  = document.getElementById('visa-doc-section');
  visaSection.style.display = country && country !== 'KR' ? '' : 'none';
  docSection.style.display  = country && country !== 'KR' ? '' : 'none';
  if (country === 'KR') {
    document.getElementById('visa-type').value = 'KR';
    onVisaTypeChange();
  }
}

function onVisaTypeChange() {
  const vt = document.getElementById('visa-type').value;
  const sec = document.getElementById('visa-eligible-section');
  const tags = document.getElementById('visa-eligible-tags');
  const note = document.getElementById('visa-eligible-note');
  if (!vt) { sec.style.display = 'none'; return; }
  sec.style.display = '';
  const info = VISA_ELIGIBLE_JOBS[vt] || VISA_ELIGIBLE_JOBS['OTHER'];
  tags.innerHTML = info.jobs.map(j =>
    `<span class="visa-eligible-tag${info.warn?' warn':''}">${j}</span>`
  ).join('');
  note.innerHTML = (info.warn ? '⚠️ ' : 'ℹ️ ') + info.note;
  note.style.background = info.warn ? '#FFF7ED' : '#EFF6FF';
  note.style.color = info.warn ? '#92400E' : '#1e3a8a';

  // 희망 업종 칩 렌더
  renderPrefJobChips(vt);
}

function renderPrefJobChips(visaType) {
  const el = document.getElementById('pref-job-chips');
  const eligibleInfo = VISA_ELIGIBLE_JOBS[visaType] || VISA_ELIGIBLE_JOBS['OTHER'];
  const eligibleSet  = new Set(eligibleInfo.jobs.flatMap(j => ALL_JOB_TYPES.filter(t => j.includes('전') || j.includes('제한 없음') || t.includes(j.split('/')[0]))));
  el.innerHTML = ALL_JOB_TYPES.map(type => {
    const sel  = _selectedPrefJobs.has(type);
    return `<div class="job-type-chip${sel?' selected':''}" onclick="togglePrefJob('${type}',this)">${type}</div>`;
  }).join('');
}

function togglePrefJob(type, el) {
  if (_selectedPrefJobs.has(type)) { _selectedPrefJobs.delete(type); el.classList.remove('selected'); }
  else { _selectedPrefJobs.add(type); el.classList.add('selected'); }
}

function onVisaDocSelect(event) {
  const file = event.target.files[0];
  if (!file) return;
  _visaDocFile = file;
  const preview = document.getElementById('visa-doc-preview');
  preview.innerHTML = `<div style="font-size:13px;font-weight:700;color:#16a34a">✅ ${file.name}</div>
    <button onclick="document.getElementById('visa-doc-file').click()" style="margin-top:6px;padding:6px 14px;background:#f5f5f5;border:none;border-radius:8px;font-size:12px;font-weight:700;color:#555;cursor:pointer">변경</button>`;
}

async function loadVisaProfile() {
  const wid = await _getWorkerId();
  // workers DB 미등록인 경우 user_metadata에서 fallback
  const meta = (typeof currentUser !== 'undefined' && currentUser?.user_metadata) || {};
  let natVal = meta.nationality || '';
  let visaVal = meta.visa_type || '';

  if (wid) {
    const { data } = await db.from('workers').select('visa_type,visa_doc_url,pref_job_types,nationality').eq('id', wid).single();
    if (data) {
      natVal  = data.nationality  || natVal;
      visaVal = data.visa_type    || visaVal;
      if (data.pref_job_types) {
        _selectedPrefJobs = new Set(Array.isArray(data.pref_job_types) ? data.pref_job_types : []);
      }
      if (data.visa_doc_url) {
        document.getElementById('visa-doc-preview').innerHTML = `<div style="font-size:12px;color:#16a34a;font-weight:700">✅ 비자 사본 등록됨</div>
          <a href="${data.visa_doc_url}" target="_blank" style="font-size:11px;color:#3b82f6">파일 보기</a>`;
      }
    }
  }
  if (natVal) {
    const sel = document.getElementById('visa-country');
    for (const opt of sel.options) { if (opt.value === natVal) { sel.value = natVal; break; } }
  }
  if (visaVal) document.getElementById('visa-type').value = visaVal;
  document.getElementById('mp-visa-val').textContent = visaVal || (natVal === 'KR' ? '한국 국적' : '');
  onVisaCountryChange();
  onVisaTypeChange();
}

async function saveVisaProfile() {
  const wid = await _getWorkerId();
  if (!wid) return;
  const visaType   = document.getElementById('visa-type').value;
  const country    = document.getElementById('visa-country').value;
  const prefJobs   = Array.from(_selectedPrefJobs);

  let visaDocUrl = null;
  if (_visaDocFile) {
    const ext  = _visaDocFile.name.split('.').pop();
    const path = `visa/${wid}/${Date.now()}.${ext}`;
    const { data: up, error: upErr } = await db.storage.from('worker-docs').upload(path, _visaDocFile, { upsert:true });
    if (!upErr) {
      const { data: pub } = db.storage.from('worker-docs').getPublicUrl(path);
      visaDocUrl = pub.publicUrl;
    }
  }

  const payload = { visa_type: visaType || null, nationality: country || null, pref_job_types: prefJobs };
  if (visaDocUrl) payload.visa_doc_url = visaDocUrl;

  const { error } = await db.from('workers').update(payload).eq('id', wid);
  if (error) { showToast('저장 실패: ' + error.message); return; }
  document.getElementById('mp-visa-val').textContent = visaType || '';
  showToast('✅ 비자 정보가 저장됐어요!');
  closeMpSub('foreigner');
}

async function loadWageHistory() {
  const el = document.getElementById('wage-history-list');
  if (!el) return;
  el.innerHTML = '<div class="spinner" style="margin:32px auto"></div>';
  try {
    const wid = await Promise.race([
      _getWorkerId(),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000))
    ]);
    if (!wid) { el.innerHTML = '<div style="text-align:center;padding:40px;color:#aaa;font-size:13px">완료된 근무가 없어요</div>'; return; }

    const { data: apps, error: appErr } = await db.from('applications')
      .select('id, wage_paid, wage_paid_at, job_posting_id')
      .eq('worker_id', wid)
      .in('status', ['done', 'completed']);
    if (appErr) {
      el.innerHTML = `<div style="text-align:center;padding:40px;color:#aaa;font-size:13px">불러오기 실패<br><span style="font-size:10px;color:#f87171">${appErr.code || ''}: ${appErr.message || ''}</span></div>`;
      return;
    }
    if (!apps?.length) { el.innerHTML = '<div style="text-align:center;padding:40px;color:#aaa;font-size:13px">완료된 근무가 없어요</div>'; return; }

    // job 상세 별도 조회 (nested join 대신)
    const jobIds = [...new Set(apps.map(a => a.job_posting_id).filter(Boolean))];
    let jobMap = {};
    if (jobIds.length) {
      const { data: jobs } = await db.from('job_postings')
        .select('id, title, current_wage, duration_hours, start_time, biz_name')
        .in('id', jobIds);
      (jobs || []).forEach(j => { jobMap[j.id] = j; });
    }

    el.innerHTML = apps.map(a => {
      const job  = jobMap[a.job_posting_id] || {};
      const wage = (job.current_wage||0) * (job.duration_hours||0);
      const isPaid = a.wage_paid;
      const date = job.start_time ? new Date(job.start_time).toLocaleDateString('ko-KR') : '-';
      return `<div style="background:#fff;border-radius:14px;padding:14px;margin-bottom:10px;border:1px solid #f0f0f0">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <div style="font-size:13px;font-weight:800;color:#111">${job.biz_name||'업체'}</div>
          <span style="font-size:10px;font-weight:800;padding:3px 10px;border-radius:8px;${isPaid?'background:#D1FAE5;color:#065F46':'background:#FEE2E2;color:#991B1B'}">${isPaid?'✅ 수령확인':'❌ 미수령'}</span>
        </div>
        <div style="font-size:12px;color:#555">${job.title||''} · ${date}</div>
        <div style="font-size:18px;font-weight:900;color:#C8102E;margin-top:6px">${wage?wage.toLocaleString()+'원':'시급 미기재'}</div>
        ${!isPaid ? `<button onclick="workerConfirmWageReceived('${a.id}',this)" style="margin-top:8px;width:100%;padding:10px;background:#16a34a;color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:800;cursor:pointer">💴 급여 수령 확인</button>
        <button onclick="reportWageIssue('${a.id}')" style="margin-top:4px;width:100%;padding:8px;background:#f5f5f5;color:#888;border:none;border-radius:10px;font-size:12px;font-weight:700;cursor:pointer">⚠️ 임금체불 신고</button>` : `<div style="font-size:11px;color:#aaa;margin-top:6px">${a.wage_paid_at ? '수령일: ' + new Date(a.wage_paid_at).toLocaleDateString('ko-KR') : ''}</div>`}
      </div>`;
    }).join('');
  } catch(e) {
    if (el) el.innerHTML = '<div style="text-align:center;padding:40px;color:#aaa;font-size:13px">불러오기 실패<br><span style="font-size:11px">잠시 후 다시 시도해주세요</span></div>';
  }
}

async function workerConfirmWageReceived(appId, btn) {
  btn.disabled = true; btn.textContent = '저장 중...';
  const { error } = await db.from('applications').update({ wage_paid:true, wage_paid_at: new Date().toISOString() }).eq('id', appId);
  if (error) { showToast('저장 실패'); btn.disabled = false; return; }
  showToast('✅ 급여 수령 확인 완료');
  loadWageHistory();
}

function reportWageIssue(appId) {
  showToast('고용노동부 임금체불 신고: 1350으로 전화하거나 minwage.kr에서 신고하세요', 5000);
}

function openWorkerRightsGuide() {
  const lang = localStorage.getItem('baroalba_lang') || 'ko';
  const guides = {
    ko: { title:'내 권리 가이드', items:['최저시급(2025): 10,030원/시간','연장근무: 기본시급 × 1.5배','야간(22~06시): 기본시급 × 1.5배','임금체불 신고: ☎ 1350 (고용노동부)','산업재해: 근로복지공단 1588-0075','외국인근로자지원센터: 1644-0644'] },
    vi: { title:'Hướng dẫn quyền lợi', items:['Lương tối thiểu(2025): 10,030₩/giờ','Làm thêm giờ: lương × 1.5 lần','Tố cáo chậm trả lương: ☎ 1350','Hỗ trợ lao động nước ngoài: 1644-0644'] },
    ru: { title:'Руководство по правам', items:['Минимальная зарплата(2025): 10,030₩/час','Сверхурочные: зарплата × 1.5','Жалоба на задержку: ☎ 1350','Поддержка иностранных рабочих: 1644-0644'] },
    uz: { title:"Huquqlar bo'yicha qo'llanma", items:["Minimal ish haqi(2025): 10,030₩/soat","Qo'shimcha ish: maosh × 1.5","Ish haqi kechiktirilsa: ☎ 1350","Xorijiy ishchilarni qo'llab-quvvatlash: 1644-0644"] },
    mn: { title:'Эрхийн заавар', items:['Доод цалин(2025): 10,030₩/цаг','Илүү цаг: цалин × 1.5 дахин','Цалин хожигдсон бол: ☎ 1350','Гадаадын ажилчдын дэмжлэгийн төв: 1644-0644'] },
    zh: { title:'权益指南', items:['最低时薪(2025): 10,030₩/小时','加班: 工资×1.5倍','欠薪投诉: ☎ 1350','外国劳动者支援中心: 1644-0644'] },
  };
  const g = guides[lang] || guides.ko;
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9500;display:flex;align-items:flex-end';
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
  overlay.innerHTML = `<div style="background:#fff;border-radius:24px 24px 0 0;width:100%;padding:24px 20px 48px;max-height:80vh;overflow-y:auto">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px">
      <div style="font-size:17px;font-weight:900">📋 ${g.title}</div>
      <button onclick="this.closest('div[style*=fixed]').remove()" style="font-size:22px;color:#aaa;background:none;border:none;cursor:pointer">✕</button>
    </div>
    <div class="rights-card">
      <div style="font-size:12px;font-weight:800;opacity:0.7;margin-bottom:10px;letter-spacing:0.5px">WORKER RIGHTS</div>
      ${g.items.map(item => `<div style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.15);font-size:13px;font-weight:600;line-height:1.5">${item}</div>`).join('')}
    </div>
    <div style="margin-top:16px;padding:14px;background:#FEF3C7;border-radius:12px;font-size:12px;color:#92400E;line-height:1.6">
      <strong>외국인근로자지원센터 1644-0644</strong><br>
      무료 통역 서비스 · 법률 상담 · 임금체불 지원<br>
      월~금 09:00–18:00
    </div>
  </div>`;
  document.body.appendChild(overlay);
}

// mpsub-foreigner 열릴 때 데이터 로드
const _origOpenMpSub = typeof openMpSub === 'function' ? openMpSub : null;

function openWorkerReviewReplyModal(appId, bizName, review, existingReply) {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9500;display:flex;align-items:flex-end';
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
  overlay.innerHTML = `
    <div style="background:#fff;border-radius:24px 24px 0 0;width:100%;padding:24px 20px 40px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
        <div>
          <div style="font-size:17px;font-weight:900;color:#222">💬 업체 평가에 답글 달기</div>
          <div style="font-size:12px;color:#aaa;margin-top:2px">${bizName}의 나에 대한 평가</div>
        </div>
        <button onclick="this.closest('div[style*=fixed]').remove()" style="font-size:22px;color:#aaa;background:none;border:none;cursor:pointer">✕</button>
      </div>
      <div style="background:#f8f8f8;border-radius:12px;padding:12px;margin-bottom:16px;font-size:13px;color:#555;line-height:1.5;border-left:3px solid #F59E0B">
        ⭐ "${review}"
      </div>
      <textarea id="wreply-content" placeholder="이 평가에 대한 답글을 남겨주세요 (최대 200자)" maxlength="200"
        style="width:100%;box-sizing:border-box;height:90px;padding:12px 14px;border:1.5px solid #e5e7eb;border-radius:12px;font-size:14px;resize:none;font-family:inherit;line-height:1.6;outline:none">${existingReply||''}</textarea>
      <div style="font-size:11px;color:#bbb;text-align:right;margin-top:4px" id="wreply-char-count">${(existingReply||'').length}/200자</div>
      <button id="wreply-submit-btn" onclick="window._submitWorkerReviewReply('${appId}')"
        style="margin-top:16px;width:100%;padding:14px;background:#3b82f6;color:#fff;border:none;border-radius:14px;font-size:15px;font-weight:800;cursor:pointer">
        ${existingReply ? '수정하기' : '답글 등록하기'}
      </button>
    </div>`;
  document.body.appendChild(overlay);
  const ta = overlay.querySelector('#wreply-content');
  if (ta) ta.addEventListener('input', () => {
    const cnt = overlay.querySelector('#wreply-char-count');
    if (cnt) cnt.textContent = ta.value.length + '/200자';
  });
  window._submitWorkerReviewReply = async (appId) => {
    const content = (overlay.querySelector('#wreply-content')?.value || '').trim();
    if (!content) { showToast('답글 내용을 입력해주세요'); return; }
    const btn = overlay.querySelector('#wreply-submit-btn');
    if (btn) { btn.textContent = '저장 중...'; btn.disabled = true; }
    const { error } = await db.from('applications').update({
      worker_review_reply: content,
      worker_review_replied_at: new Date().toISOString()
    }).eq('id', appId);
    if (error) {
      showToast('저장 실패: ' + error.message);
      if (btn) { btn.textContent = '답글 등록하기'; btn.disabled = false; }
      return;
    }
    showToast('✅ 답글이 등록됐어요!');
    overlay.remove();
    delete window._submitWorkerReviewReply;
    showMyRatings();
  };
}

function openReviewReplyModal(appId, workerName, review, existingReply) {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9500;display:flex;align-items:flex-end';
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
  overlay.innerHTML = `
    <div style="background:#fff;border-radius:24px 24px 0 0;width:100%;padding:24px 20px 40px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
        <div>
          <div style="font-size:17px;font-weight:900;color:#222">💬 후기 답글 달기</div>
          <div style="font-size:12px;color:#aaa;margin-top:2px">${workerName}님의 후기</div>
        </div>
        <button onclick="this.closest('div[style*=fixed]').remove()" style="font-size:22px;color:#aaa;background:none;border:none;cursor:pointer">✕</button>
      </div>
      <div style="background:#FFF7ED;border-radius:12px;padding:12px;margin-bottom:16px;font-size:13px;color:#78350F;line-height:1.5;border-left:3px solid #F59E0B">
        ⭐ "${review}"
      </div>
      <textarea id="reply-content" placeholder="후기에 대한 답글을 남겨주세요 (최대 200자)" maxlength="200"
        style="width:100%;box-sizing:border-box;height:90px;padding:12px 14px;border:1.5px solid #e5e7eb;border-radius:12px;font-size:14px;resize:none;font-family:inherit;line-height:1.6;outline:none">${existingReply||''}</textarea>
      <div style="font-size:11px;color:#bbb;text-align:right;margin-top:4px" id="reply-char-count">${(existingReply||'').length}/200자</div>
      <button id="reply-submit-btn" onclick="window._submitReviewReply('${appId}')"
        style="margin-top:16px;width:100%;padding:14px;background:#C8102E;color:#fff;border:none;border-radius:14px;font-size:15px;font-weight:800;cursor:pointer">
        ${existingReply ? '수정하기' : '답글 등록하기'}
      </button>
    </div>`;
  document.body.appendChild(overlay);
  const ta = overlay.querySelector('#reply-content');
  if (ta) ta.addEventListener('input', () => {
    const cnt = overlay.querySelector('#reply-char-count');
    if (cnt) cnt.textContent = ta.value.length + '/200자';
  });
  window._submitReviewReply = async (appId) => {
    const content = (overlay.querySelector('#reply-content')?.value || '').trim();
    if (!content) { showToast('답글 내용을 입력해주세요'); return; }
    const btn = overlay.querySelector('#reply-submit-btn');
    if (btn) { btn.textContent = '저장 중...'; btn.disabled = true; }
    const { error } = await db.from('applications').update({
      review_reply: content,
      review_replied_at: new Date().toISOString()
    }).eq('id', appId);
    if (error) {
      showToast('저장 실패: ' + error.message);
      if (btn) { btn.textContent = '답글 등록하기'; btn.disabled = false; }
      return;
    }
    showToast('✅ 답글이 등록됐어요!');
    overlay.remove();
    delete window._submitReviewReply;
    loadApplicants();
  };
}

async function showContractModal(appId) {
  const { data: app } = await db.from('applications')
    .select('*, workers(name, phone), job_postings(title, start_time, hourly_wage, work_type, address, businesses(biz_name, name, phone))')
    .eq('id', appId).single();
  if (!app) return;
  const w = app.workers;
  const j = app.job_postings;
  const b = j?.businesses;
  const dateStr = new Date().toLocaleDateString('ko-KR');
  const workDate = j?.start_time
    ? new Date(j.start_time).toLocaleString('ko-KR', { year:'numeric', month:'long', day:'numeric', hour:'2-digit', minute:'2-digit' })
    : '별도 협의';
  const wage = j?.hourly_wage ? j.hourly_wage.toLocaleString() + '원/시간' : '협의';
  document.getElementById('contract-content').innerHTML = `
    <p style="margin-bottom:14px"><strong>${b?.biz_name || b?.name || '업체명'}</strong>(이하 "사용자")와 <strong>${w?.name || '근로자'}</strong>(이하 "근로자")는 다음과 같이 근로계약을 체결합니다.</p>
    <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:16px">
      <tr><td style="padding:9px 10px;border:1px solid #e5e7eb;background:#f9fafb;font-weight:700;width:32%">직무</td><td style="padding:9px 10px;border:1px solid #e5e7eb">${j?.title || '-'}</td></tr>
      <tr><td style="padding:9px 10px;border:1px solid #e5e7eb;background:#f9fafb;font-weight:700">근무일시</td><td style="padding:9px 10px;border:1px solid #e5e7eb">${workDate}</td></tr>
      <tr><td style="padding:9px 10px;border:1px solid #e5e7eb;background:#f9fafb;font-weight:700">근무지</td><td style="padding:9px 10px;border:1px solid #e5e7eb">${j?.address || '별도 안내'}</td></tr>
      <tr><td style="padding:9px 10px;border:1px solid #e5e7eb;background:#f9fafb;font-weight:700">임금</td><td style="padding:9px 10px;border:1px solid #e5e7eb"><strong style="color:#C8102E">${wage}</strong></td></tr>
      <tr><td style="padding:9px 10px;border:1px solid #e5e7eb;background:#f9fafb;font-weight:700">사용자</td><td style="padding:9px 10px;border:1px solid #e5e7eb">${b?.biz_name || '-'} (${b?.phone || '-'})</td></tr>
      <tr><td style="padding:9px 10px;border:1px solid #e5e7eb;background:#f9fafb;font-weight:700">근로자</td><td style="padding:9px 10px;border:1px solid #e5e7eb">${w?.name || '-'} (${w?.phone || '-'})</td></tr>
    </table>
    <p style="font-size:12px;color:#666;line-height:1.75">① 임금은 근무 종료 후 당일 또는 익일 지급을 원칙으로 한다.<br>② 근로자는 부득이한 사유 없이 계약된 근무를 이행하지 않을 경우 신뢰점수가 차감될 수 있다.<br>③ 사용자는 최저임금법 및 근로기준법을 준수한다.</p>
    <div style="margin-top:18px;padding-top:14px;border-top:1px solid #eee;display:flex;justify-content:space-between;font-size:12px;color:#aaa">
      <span>계약일: ${dateStr}</span>
      <span>바로알바 플랫폼 자동 생성</span>
    </div>`;
  document.getElementById('contract-modal').style.display = 'flex';
}
function _printInPage(bodyHtml, extraCss) {
  const styleId = '_ps_style', divId = '_ps_content';
  let styleEl = document.getElementById(styleId);
  if (!styleEl) { styleEl = document.createElement('style'); styleEl.id = styleId; document.head.appendChild(styleEl); }
  styleEl.textContent = `@media print{body>*:not(#${divId}){display:none!important}#${divId}{display:block!important}}${extraCss||''}`;
  let div = document.getElementById(divId);
  if (!div) { div = document.createElement('div'); div.id = divId; div.style.display = 'none'; document.body.appendChild(div); }
  div.innerHTML = bodyHtml;
  const cleanup = () => { styleEl.textContent = ''; div.innerHTML = ''; window.removeEventListener('afterprint', cleanup); };
  window.addEventListener('afterprint', cleanup);
  window.print();
}

function printContract() {
  const content = document.getElementById('contract-content').innerHTML;
  _printInPage(
    `<h2 style="text-align:center;letter-spacing:4px;margin-bottom:28px;font-size:20px">근 로 계 약 서</h2>${content}`,
    `#_ps_content{font-family:'Apple SD Gothic Neo','Noto Sans KR',sans-serif;padding:40px 48px;max-width:580px;margin:0 auto;color:#222;line-height:1.7}` +
    `#_ps_content table{width:100%;border-collapse:collapse;margin:12px 0}` +
    `#_ps_content td{padding:9px 10px;border:1px solid #ddd;font-size:13px}` +
    `@page{size:A4;margin:20mm}`
  );
}

// ═══════════════════════════════════════════════════════════════════
// ── 실시간 위치 공유 (Supabase Realtime Broadcast) ─────────────────
// ═══════════════════════════════════════════════════════════════════
let _locationChannel = null;
let _locationAppId   = null;

async function toggleLocationShare(appId, btnEl) {
  if (_locationWatchId !== null) {
    navigator.geolocation.clearWatch(_locationWatchId);
    _locationWatchId = null;
    _locationChannel?.unsubscribe();
    _locationChannel = null;
    _locationAppId   = null;
    btnEl.classList.remove('active');
    btnEl.innerHTML = '📍 위치 공유 시작';
    showToast('위치 공유를 종료했어요');
    return;
  }
  if (!navigator.geolocation) { showToast('이 기기에서 위치 공유를 지원하지 않아요'); return; }
  _locationAppId = appId;
  _locationChannel = db.channel(`location:${appId}`);
  await _locationChannel.subscribe();
  _locationWatchId = navigator.geolocation.watchPosition(
    (pos) => {
      _locationChannel.send({
        type: 'broadcast', event: 'loc',
        payload: { lat: pos.coords.latitude, lng: pos.coords.longitude, ts: Date.now() }
      }).catch(() => {});
    },
    () => showToast('위치 정보를 가져올 수 없어요'),
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
  );
  btnEl.classList.add('active');
  btnEl.innerHTML = '📍 위치 공유 중 (탭하여 종료)';
  showToast('📍 위치 공유를 시작했어요. 업주가 실시간으로 확인할 수 있어요.');
}

function subscribeWorkerLocation(appId, onUpdate) {
  const ch = db.channel(`location:${appId}`);
  ch.on('broadcast', { event: 'loc' }, ({ payload }) => onUpdate(payload)).subscribe();
  return ch;
}
// ═══════════════════════════════════════════════════════════════════
// ── 알림 히스토리 (기존 테이블에서 재구성) ────────────────────────────
// ═══════════════════════════════════════════════════════════════════
function openNotiHistory() {
  document.getElementById('mpsub-noti-history').classList.add('show');
  loadNotiHistory();
}
async function loadNotiHistory() {
  const el = document.getElementById('noti-history-list');
  if (!el) return;
  el.innerHTML = '<div style="text-align:center;color:#bbb;padding:40px 20px;font-size:14px">로딩 중...</div>';
  const items = [];
  try {
    // 0. 시스템 알림 (notifications 테이블) — 전체 사용자 공통
    if (currentUser?.id) {
      const { data: notiRows } = await db.from('notifications')
        .select('id, title, body, type, is_read, created_at')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false }).limit(20);
      notiRows?.forEach(n => {
        const typeMap = {
          admin:            { icon: '🛡️', badge: '관리자', badgeColor: '#C8102E', badgeBg: '#fff5f5' },
          mannnam_manager:  { icon: '💜', badge: '매니저',  badgeColor: '#7C3AED', badgeBg: '#f5f3ff' },
          system:           { icon: '🔔', badge: '알림',    badgeColor: '#3b82f6', badgeBg: '#eff6ff' },
        };
        const t = typeMap[n.type] || typeMap.system;
        items.push({ icon: t.icon, title: n.title, sub: n.body || '', badge: t.badge, badgeColor: t.badgeColor, badgeBg: t.badgeBg, ts: n.created_at, unread: !n.is_read, id: n.id });
      });
      // 읽음 처리 (백그라운드)
      const unreadIds = (notiRows || []).filter(n => !n.is_read).map(n => n.id);
      if (unreadIds.length) db.from('notifications').update({ is_read: true }).in('id', unreadIds).then(() => {});
    }
    if (workerRecord?.id) {
      // 1. 합격/거절 결과 알림
      const { data: apps } = await db.from('applications')
        .select('id, status, updated_at, job_postings(title, businesses(name))')
        .eq('worker_id', workerRecord.id)
        .in('status', ['accepted', 'rejected'])
        .order('updated_at', { ascending: false }).limit(20);
      apps?.forEach(a => {
        const accepted = a.status === 'accepted';
        items.push({
          icon: accepted ? '✅' : '❌',
          title: (a.job_postings?.businesses?.name || '업체') + ' · ' + (a.job_postings?.title || '공고'),
          sub: accepted ? '합격을 축하드려요! 계약서를 확인하세요.' : '이번엔 아쉽게도 거절됐어요',
          badge: accepted ? '합격' : '거절',
          badgeColor: accepted ? '#16a34a' : '#ef4444',
          badgeBg: accepted ? '#f0fdf4' : '#fef2f2',
          ts: a.updated_at
        });
      });
      // 2. 팔로우한 업체 새 공고 (최근 7일)
      const { data: follows } = await db.from('follows')
        .select('businesses(id, name)').eq('worker_id', workerRecord.id);
      if (follows?.length) {
        const bizIds = follows.map(f => f.businesses?.id).filter(Boolean);
        const cutoff = new Date(Date.now() - 7 * 86400000).toISOString();
        const { data: newJobs } = await db.from('job_postings')
          .select('id, title, created_at, businesses(name)')
          .in('business_id', bizIds).gte('created_at', cutoff)
          .order('created_at', { ascending: false }).limit(15);
        newJobs?.forEach(j => items.push({
          icon: '🔔',
          title: (j.businesses?.name || '업체') + ' · ' + j.title,
          sub: '팔로우한 업체에 새 공고가 올라왔어요',
          badge: '새 공고',
          badgeColor: '#3b82f6', badgeBg: '#eff6ff',
          ts: j.created_at
        }));
      }
    } else if (bizRecord?.id) {
      // 업주: 최근 지원자 알림
      const { data: apps } = await db.from('applications')
        .select('id, status, created_at, workers(name), job_postings(title)')
        .eq('job_postings.business_id', bizRecord.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false }).limit(20);
      apps?.forEach(a => items.push({
        icon: '👤',
        title: (a.workers?.name || '지원자') + ' · ' + (a.job_postings?.title || '공고'),
        sub: '새로운 지원서가 도착했어요',
        badge: '새 지원',
        badgeColor: '#7c3aed', badgeBg: '#f3e8ff',
        ts: a.created_at
      }));
    }
    items.sort((a, b) => new Date(b.ts) - new Date(a.ts));
    if (!items.length) {
      el.innerHTML = '<div style="text-align:center;color:#bbb;padding:60px 20px;font-size:14px">최근 7일간 알림이 없어요</div>';
      return;
    }
    el.innerHTML = items.map(item => `
      <div style="background:#fff;border-radius:12px;padding:14px 16px;display:flex;gap:12px;align-items:flex-start;${item.unread ? 'border-left:3px solid #7C3AED;' : ''}">
        <span style="font-size:20px;margin-top:2px;flex-shrink:0">${item.icon}</span>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:${item.unread ? '800' : '700'};color:#111;margin-bottom:2px">${item.title}</div>
          <div style="font-size:12px;color:#888;margin-bottom:4px">${item.sub}</div>
          <div style="font-size:11px;color:#bbb">${formatRelativeDate(item.ts)}</div>
        </div>
        <span style="font-size:11px;font-weight:800;color:${item.badgeColor};background:${item.badgeBg};padding:3px 8px;border-radius:8px;white-space:nowrap;flex-shrink:0">${item.badge}${item.unread ? ' 🆕' : ''}</span>
      </div>`).join('');
  } catch (e) {
    el.innerHTML = '<div style="text-align:center;color:#bbb;padding:40px 20px;font-size:14px">불러오기 실패</div>';
  }
}

function renderWorkerLocMap(containerId, lat, lng) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = `<div style="background:#f0f4ff;border-radius:10px;padding:14px;text-align:center;font-size:13px;color:#3b82f6;font-weight:700">
    📍 근로자 현재 위치<br>
    <a href="https://map.kakao.com/link/map/위치,${lat},${lng}" target="_blank"
       style="color:#C8102E;text-decoration:underline;font-size:12px">지도에서 보기 →</a>
    <br><span style="font-size:11px;color:#888;font-weight:400">위도 ${lat.toFixed(4)} / 경도 ${lng.toFixed(4)}</span>
  </div>`;
}
