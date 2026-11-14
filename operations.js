/* Live operations use server APIs only. Sample articles never enter this data path. */
(() => {
  "use strict";
  const el = (selector, scope = document) => scope.querySelector(selector);
  const safe = value => String(value ?? "").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
  const state = {loaded:false,loading:false,activeRun:false,status:null,session:null,month:currentMonth(),departmentId:"",reports:[],detail:null};
  let reportRequest=0, detailRequest=0;
  const countLabels={received:"입력",candidates:"후보",permissionExcluded:"권한 제외",duplicates:"중복",processed:"판단 완료",remaining:"판단 대기",review:"검토 필요",irrelevant:"관련 없음",lowPriority:"우선순위 제외",eligible:"선정 가능",selected:"보고서 근거",deferred:"다음 검토",classified:"분류",imported:"저장"};
  const countText=counts=>Object.entries(counts||{}).map(([key,value])=>`${countLabels[key]||key} ${value}건`).join(" · ");
  const departments = () => typeof DEPARTMENTS !== "undefined" ? DEPARTMENTS : [];
  const departmentName = id => departments().find(item => item.id === id)?.name || id || "부서 미지정";
  const admin = () => state.session?.role === "admin";
  function currentMonth(){ return new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit"}).format(new Date()); }
  function currentDate(){ return new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date()); }
  function latestReportDate(){const date=new Date(`${currentDate()}T00:00:00Z`);while(![1,4].includes(date.getUTCDay()))date.setUTCDate(date.getUTCDate()-1);return date.toISOString().slice(0,10);}
  function previousMonth(){const date=new Date(`${currentMonth()}-01T00:00:00Z`);date.setUTCMonth(date.getUTCMonth()-1);return date.toISOString().slice(0,7);}
  function dateLabel(value){ if(!value)return "미발행"; const date=new Date(value); return Number.isNaN(date.valueOf())?"날짜 확인 필요":new Intl.DateTimeFormat("ko-KR",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit"}).format(date); }
  function safeLink(value){try{const url=new URL(value);return url.protocol==="https:"&&!url.username&&!url.password?url.href:null;}catch{return null;}}
  function options(selected,all=false){ return (all?'<option value="">전체 부서</option>':"")+departments().map(d=>`<option value="${safe(d.id)}" ${selected===d.id?"selected":""}>${safe(d.name)}</option>`).join(""); }
  function message(target,text,error=false){ const box=el(target);if(!box)return;box.textContent=text;box.className=`ops-message${error?" ops-error":""}`;box.hidden=!text; }
  async function api(path,options={}){
    const timeout=options.timeout || 30000;
    const response=await fetch(path,{credentials:"same-origin",cache:"no-store",...options,headers:{"Accept":"application/json",...(options.body?{"Content-Type":"application/json"}:{}),...options.headers},signal:AbortSignal.timeout(timeout)});
    let data;try{data=await response.json();}catch{throw new Error("서버 API가 연결되지 않았습니다. 정적 미리보기에서는 운영 기능을 사용할 수 없습니다.");}
    if(!response.ok){const known={401:"로그인이 필요합니다.",403:"이 작업을 수행할 권한이 없습니다.",404:"요청한 자료를 찾을 수 없습니다.",409:"진행 중이거나 이미 처리된 요청입니다. 실행 기록을 확인해 주세요.",429:"요청이 많습니다. 잠시 후 다시 시도해 주세요."};throw new Error(data.message || (typeof data.error==="string"?data.error:"") || known[response.status] || "요청을 처리하지 못했습니다. 입력과 서버 연결 상태를 확인해 주세요.");}
    return data;
  }
  function errorText(error){return error?.name==="TimeoutError"?"응답 대기 시간이 지났습니다. 다시 실행하기 전에 실행 기록을 확인해 주세요.":error?.message || "연결 상태를 확인해 주세요.";}
  function shell(){
    el("#operations-panel").innerHTML=`
      <div class="ops-heading"><div><span class="ops-kicker">API 연결 준비</span><h2>샘플에서 실제 보고서로</h2><p>기사 입력부터 검수·발행까지, 준비 상태를 여기서 확인합니다.</p></div><button class="ops-button ops-secondary" data-ops="refresh">상태 새로고침</button></div>
      <div id="ops-status" aria-live="polite"><p class="ops-message">서버 연결 상태를 확인하고 있습니다.</p></div>
      <details class="ops-details"><summary>어떤 부분을 개선했나요?<span>역할과 운영 기준</span></summary><div class="ops-details-body">
        <div class="ops-flow"><article><span class="ops-role">코딩</span><h3>입력·저장·발행</h3><p>허용된 출처와 발행일을 검사하고, 같은 URL·본문의 중복을 정리합니다. 보고 기간, 접근 권한, 원문 연결은 코드가 처리합니다.</p></article><article><span class="ops-role ops-role-jev">TypeSafe Jev</span><h3>관련성·부서 판단</h3><p>기사 제목과 본문에서 보험업 관련성, 보고 가치와 관련 부서를 판단합니다. 불확실한 판단은 검토 대상으로 남깁니다.</p></article><article><span class="ops-role ops-role-llm">LLM</span><h3>요약·인사이트</h3><p>선정된 기사만 받아 핵심 요약과 업무 시사점을 씁니다. 기사 ID로 근거를 연결하고, 검수한 초안만 발행합니다.</p></article></div>
        <ul class="ops-compact-list"><li><strong>월·목 / 월간</strong> 한국 시간으로 회차를 계산하고 지난 보고서를 월별로 찾습니다.</li><li><strong>실패·중복 처리</strong> 실행 기록을 남기고, 같은 보고서를 반복 생성하는 요청을 막습니다.</li><li><strong>출처 검증</strong> 없는 기사 ID를 인용한 결과는 저장하지 않습니다. 요약의 정확성은 사람이 검수합니다.</li><li><strong>실제 권한</strong> 실제 보고서는 서버에 등록된 부서만 열람합니다. 샘플의 관심 부서 설정과 별개입니다.</li></ul>
        <p class="ops-note">동일 사건의 다른 매체 보도까지 자동으로 합치는 기능은 후속 과제입니다. 현재 중복 제거는 동일 URL·본문 기준입니다.</p>
      </div></details>
      <section class="ops-card" aria-labelledby="ops-archive-title"><div class="ops-section-heading"><h3 id="ops-archive-title">실제 보고서</h3><span id="ops-role-label" class="ops-caption">권한 확인 중</span></div><p class="ops-note">서버에 저장된 보고서만 표시합니다. 기존 샘플 보고서는 부서 메뉴에서 볼 수 있습니다.</p><div id="ops-archive"></div><div id="ops-report-detail"></div></section>
      <div id="ops-admin" hidden></div>
      <details class="ops-details"><summary>연결 전 확인할 항목<span>첫 실행 안내</span></summary><div class="ops-details-body"><ol class="ops-compact-list"><li>본문 수집과 AI 요약이 허용된 뉴스 공급 경로를 정하고 출처 권한을 등록합니다.</li><li>서버 환경 변수에 TypeSafe 키와 LLM 연결 주소·모델·키를 등록합니다.</li><li>생보·손보·비보험·복수 부서 기사를 사람이 분류한 평가 표본으로 Jev 기준을 확인합니다.</li><li>부서별 담당자를 등록하고 한 회차를 생성해 근거 기사와 요약을 검수합니다.</li><li>수집 경로와 정기 실행을 활성화한 후 월·목 아침 보고서를 운영합니다.</li></ol><p class="ops-note">API 키는 이 화면에 입력하거나 저장하지 않습니다. 매체 10곳을 참고 대상으로 등록한 것과 본문 사용 허용은 서로 다른 상태입니다.</p><p class="ops-doc-links"><a href="https://docs.typesafe.ai/api/system-one" target="_blank" rel="noopener noreferrer">Jev API 문서 ↗</a><a href="https://docs.typesafe.ai/primitives/noul" target="_blank" rel="noopener noreferrer">부서별 Noul 판단 ↗</a></p></div></details>`;
  }
  function renderStatus(){
    const status=state.status;
    if(!status)return;
    const checks=Array.isArray(status.checks)?status.checks:[];
    const ready=checks.filter(item=>item.ready).length;
    const sources=Array.isArray(status.sources)?status.sources:[];
    el("#ops-status").innerHTML=`<section class="ops-card ops-status-card"><div class="ops-section-heading"><h3>${status.mode==="ready"?"연동 설정 확인 완료":"첫 실행을 준비하고 있어요"}</h3><span class="ops-pill ${status.mode==="ready"?"ops-pill-ready":""}">${ready} / ${checks.length} 항목</span></div><p class="ops-note">현재 설정 상태입니다. 실제 API 응답과 분류 품질까지 통과했다는 뜻은 아닙니다.</p><ul class="ops-checks">${checks.map(check=>`<li><span class="ops-check-symbol ${check.ready?"is-ready":""}" aria-hidden="true">${check.ready?"✓":"○"}</span><div><strong>${safe(check.label)}</strong><p>${safe(check.detail)}</p></div><span class="ops-caption">${check.ready?"설정됨":"준비 필요"}</span></li>`).join("")}</ul><div class="ops-facts"><span>참고 매체 <strong>${sources.length}곳</strong></span><span>입력 허용 <strong>${sources.filter(s=>s.enabled&&s.canSummarize).length}곳</strong></span><span>기준 시간 <strong>한국 시간</strong></span></div></section>`;
  }
  function renderArchive(){
    const session=state.session||{};
    el("#ops-role-label").textContent=admin()?"관리자 · 전체 부서":session.role==="member"?`${departmentName(session.departmentId)} · 구성원`:"부서 권한 미등록";
    if(!session.authenticated){el("#ops-archive").innerHTML='<p class="ops-message">실제 보고서를 읽으려면 로그인 후 부서 권한을 등록해야 합니다.</p><a class="ops-button" href="/signin-with-chatgpt?return_to=%2F%23process%2Foperations" target="_top">로그인하기</a>';return;}
    if(!admin()&&session.role!=="member"){el("#ops-archive").innerHTML=`<p class="ops-message">관리자에게 부서 등록을 요청해 주세요.</p>${session.userId?`<label class="ops-field">내 사용자 ID<input readonly value="${safe(session.userId)}" aria-label="부서 등록에 사용할 사용자 ID"></label>`:""}`;return;}
    el("#ops-archive").innerHTML=`<form id="ops-filter-form" class="ops-form-row"><label class="ops-field">보고일 기준 월<input type="month" name="month" required value="${safe(state.month)}"></label>${admin()?`<label class="ops-field">부서<select name="departmentId">${options(state.departmentId,true)}</select></label>`:""}<button class="ops-button ops-secondary" type="submit">조회</button></form><div id="ops-report-list" aria-live="polite"><p class="ops-message">보고서를 불러오는 중입니다.</p></div>`;
    loadReports();
  }
  async function loadReports(){
    const list=el("#ops-report-list");if(!list)return;
    const requestId=++reportRequest;
    list.innerHTML='<p class="ops-message">보고서를 불러오는 중입니다.</p>';
    const query=new URLSearchParams({month:state.month});if(state.departmentId)query.set("departmentId",state.departmentId);
    try{
      const data=await api(`${admin()?"/api/admin/reports":"/api/reports"}?${query}`);
      if(requestId!==reportRequest)return;
      state.reports=Array.isArray(data.reports)?data.reports:[];
      list.innerHTML=state.reports.length?`<ul class="ops-report-list">${state.reports.map(report=>`<li><button type="button" data-ops-report="${safe(report.id)}"><span class="ops-report-meta">${safe(departmentName(report.departmentId))} · ${safe(report.window?.label || report.window?.reportDate || "")}<span class="ops-pill ${report.status==="published"?"ops-pill-ready":""}">${report.status==="published"?"발행됨":"검수할 초안"}</span></span><strong>${safe(report.title || "제목 없는 초안")}</strong><span class="ops-caption">근거 ${Number(report.articleCount)||0}건 · ${report.publishedAt?dateLabel(report.publishedAt):"아직 발행하지 않았습니다"}</span></button></li>`).join("")}</ul>`:'<p class="ops-message">이 기간에 열람할 실제 보고서가 없습니다.</p>';
    }catch(error){if(requestId!==reportRequest)return;list.innerHTML=`<p class="ops-message ops-error">${safe(errorText(error))}</p><button class="ops-button ops-secondary" data-ops="reports-retry">다시 불러오기</button>`;}
  }
  function renderAdmin(){
    if(!admin())return;
    const section=el("#ops-admin");section.hidden=false;
    const date=latestReportDate();
    section.innerHTML=`<details class="ops-details ops-admin-details"><summary>관리자 작업<span>출처 · 기사 · 실행 · 권한</span></summary><div class="ops-details-body">
      <p class="ops-note">실제 서버에 저장하는 작업입니다. API 키와 접속 토큰을 입력하지 마세요.</p>
      <details class="ops-inner-details"><summary>1. 출처 사용 권한</summary><div id="ops-source-forms"></div></details>
      <details class="ops-inner-details"><summary>2. 허용된 기사 입력</summary><form id="ops-import-form" class="ops-stack"><p class="ops-note">권한이 등록된 출처의 기사 JSON 배열을 넣습니다. 1회 최대 ${Number(state.status?.limits?.maxImport)||100}건입니다.</p><button class="ops-button ops-secondary" type="button" data-ops="example">입력 형식 내려받기</button><label class="ops-field">기사 JSON<textarea name="articles" rows="7" required spellcheck="false" placeholder='[{"sourceId":"…","url":"https://…","title":"…","publishedAt":"2026-11-13T09:00:00+09:00","body":"…"}]'></textarea></label><label class="ops-field">사용 허용 근거<textarea name="permissionNote" rows="2" required placeholder="계약·허용 문서나 직접 작성 자료의 근거"></textarea></label><button class="ops-button" type="submit">기사 저장</button><p id="ops-import-message" class="ops-message" role="status" hidden></p></form></details>
      <details class="ops-inner-details"><summary>3. 보고서 초안 생성</summary><form id="ops-run-form" class="ops-stack"><div class="ops-form-row"><label class="ops-field">보고 유형<select name="kind"><option value="brief">월·목 보고서</option><option value="monthly">월간 보고서</option></select></label><label class="ops-field">부서<select name="departmentId">${options("strategy")}</select></label></div><label class="ops-field"><span id="ops-run-date-label">보고일 (월요일 또는 목요일)</span><input name="reportDate" type="date" required value="${safe(date)}"></label><p id="ops-run-window-note" class="ops-note">월요일 보고는 목~일, 목요일 보고는 월~수 기사로 작성합니다.</p><p class="ops-note">Jev·LLM API가 실제 호출됩니다. 한 번에 후보 ${Number(state.status?.limits?.maxArticles)||40}건, 요약 근거 ${Number(state.status?.limits?.maxReportArticles)||12}건까지 처리합니다. 한도는 초기 시범 운영 기준이며, 월간도 같은 제한을 적용합니다. 서버 설정으로 후보를 최대 400건까지 확대할 수 있습니다.</p><div class="ops-actions"><button class="ops-button ops-secondary" type="button" data-ops="collect">공급 API에서 가져오기</button><button class="ops-button" type="submit">초안 생성</button></div><p id="ops-run-message" class="ops-message" role="status" hidden></p></form></details>
      <details class="ops-inner-details"><summary>분류 검토</summary><p class="ops-note">Jev 판단이 불확실한 기사를 원문과 대조해 관련 부서를 지정하거나 제외합니다.</p><button class="ops-button ops-secondary" type="button" data-ops="review">검토할 기사 불러오기</button><div id="ops-review-list" aria-live="polite"></div></details>
      <details class="ops-inner-details"><summary>4. 구성원 부서 등록</summary><form id="ops-member-form" class="ops-stack"><p class="ops-note">로그인한 구성원이 이 화면에서 확인한 사용자 ID를 입력합니다. 임의로 고른 부서 이름은 로그인 권한이 아닙니다.</p><label class="ops-field">사용자 ID<input name="userId" required autocomplete="off"></label><label class="ops-field">열람 부서<select name="departmentId">${options("strategy")}</select></label><button type="submit" class="ops-button">부서 등록</button><p id="ops-member-message" class="ops-message" role="status" hidden></p></form></details>
      <details class="ops-inner-details"><summary>실행 기록</summary><button type="button" class="ops-button ops-secondary" data-ops="runs">실행 기록 불러오기</button><div id="ops-runs" aria-live="polite"></div></details>
    </div></details>`;
    renderSources(state.status?.sources||[]);
    api("/api/admin/sources").then(data=>{if(Array.isArray(data.sources))renderSources(data.sources);}).catch(()=>{});
  }
  function renderSources(sources){
    const container=el("#ops-source-forms");if(!container)return;
    container.innerHTML=`<p class="ops-note">본문 수집·저장과 AI 처리 권한을 확인한 매체만 사용 설정하세요. 참고 매체라는 이유만으로 권한이 생기지는 않습니다.</p>${sources.map(source=>`<form class="ops-source-form" data-source-id="${safe(source.id)}"><strong>${safe(source.name)}</strong><label class="ops-checkbox"><input type="checkbox" name="enabled" ${source.enabled?"checked":""}>수집 대상으로 사용</label><label class="ops-checkbox"><input type="checkbox" name="bodyAllowed" ${source.bodyAllowed?"checked":""}>본문 저장 허용</label><label class="ops-checkbox"><input type="checkbox" name="aiAllowed" ${source.aiAllowed?"checked":""}>AI 이용 허용</label><label class="ops-field">허용 근거<input name="permissionNote" required value="${safe(source.permissionNote||"")}" placeholder="계약·허용 문서"></label><button type="submit" class="ops-button ops-secondary">설정 저장</button><p class="ops-message" role="status" hidden></p></form>`).join("")}`;
  }
  async function openReport(id){
    const requestId=++detailRequest;const target=el("#ops-report-detail");target.innerHTML='<p class="ops-message">보고서를 여는 중입니다.</p>';
    try{const data=await api(`/api/reports/${encodeURIComponent(id)}`);if(requestId!==detailRequest)return;state.detail=data.report;renderDetail();target.scrollIntoView({behavior:"smooth",block:"start"});}catch(error){if(requestId!==detailRequest)return;target.innerHTML=`<p class="ops-message ops-error">${safe(errorText(error))}</p>`;}
  }
  function renderDetail(){
    const report=state.detail;if(!report)return;
    const sources=Array.isArray(report.sources)?report.sources:[];
    const ref=id=>{const i=sources.findIndex(source=>source.id===id);return i<0?"":`<a href="#ops-source-${i+1}" class="ops-reference" data-ops-reference="${i+1}" aria-label="근거 뉴스 ${i+1}번">[${i+1}]</a>`;};
    const points=(title,items)=>Array.isArray(items)&&items.length?`<section class="ops-report-section"><h4>${title}</h4><ul>${items.map(item=>`<li>${safe(item.text)} <span class="ops-references">${(item.sourceIds||[]).map(ref).join(" ")}</span></li>`).join("")}</ul></section>`:"";
    el("#ops-report-detail").innerHTML=`<article class="ops-report-detail"><div class="ops-section-heading"><span class="ops-caption">${safe(departmentName(report.departmentId))} · ${safe(report.window?.label||"")}</span><button class="ops-button ops-secondary" data-ops="close-report">닫기</button></div><h3>${safe(report.title)}</h3><p class="ops-note">${report.status==="published"?`${dateLabel(report.publishedAt)} 발행`:"미발행 초안 · 관리자 검수 필요"} · 근거 뉴스 ${sources.length}건</p>${admin()&&report.counts?`<details class="ops-report-counts"><summary>선정 현황 확인</summary><p class="ops-note">${safe(countText(report.counts))}</p><p class="ops-note">검토 필요 기사와 근거 수 제한으로 남은 기사를 확인한 후 발행하세요.</p></details>`:""}${points("핵심 요약",report.summary)}${points("주요 인사이트",report.insights)}${points("업무 제안",report.actions)}<section class="ops-report-sources"><h4>뉴스 출처</h4><ol>${sources.map((source,i)=>{const url=safeLink(source.url);return `<li id="ops-source-${i+1}">${url?`<a href="${safe(url)}" target="_blank" rel="noopener noreferrer">${safe(source.title)} ↗</a>`:safe(source.title)}<span>${safe(source.source||source.sourceId||"")} · ${dateLabel(source.publishedAt)}</span></li>`;}).join("")}</ol></section>${admin()&&report.status!=="published"?`<form id="ops-publish-form" class="ops-publish"><label class="ops-checkbox"><input type="checkbox" name="reviewed" required>근거 기사, 사실관계, 해석과 업무 제안을 검수했습니다.</label><div class="ops-actions"><button type="submit" class="ops-button">이 보고서 발행</button><button type="button" class="ops-button ops-secondary" data-ops="discard-draft">초안 삭제</button></div><p class="ops-note">수정이 필요하면 초안을 삭제한 뒤 다시 생성할 수 있습니다. 발행한 보고서는 삭제하지 않습니다.</p><p id="ops-publish-message" class="ops-message" role="status" hidden></p></form>`:""}</article>`;
  }
  async function loadReview(){
    const target=el("#ops-review-list");target.innerHTML='<p class="ops-message">검토할 기사를 불러오는 중입니다.</p>';
    try{const data=await api("/api/admin/review");target.innerHTML=data.articles?.length?data.articles.map(article=>{
      const url=safeLink(article.url),judgment=article.judgment||{};
      return `<details class="ops-review-item"><summary>${safe(article.title)}</summary><div class="ops-review-body">${url?`<a href="${safe(url)}" target="_blank" rel="noopener noreferrer">원문 열기 ↗</a>`:""}<p class="ops-review-text">${safe(article.body)}</p><form class="ops-review-form ops-stack" data-review-id="${safe(article.id)}"><label class="ops-field">처리<select name="decision"><option value="candidate">보고 후보로 사용</option><option value="irrelevant">보험업 보고에서 제외</option></select></label><fieldset><legend>관련 부서 (복수 선택)</legend>${departments().map(d=>{const probability=judgment.probabilities?.[d.id]??judgment.probabilities?.[`dept_${d.id}`];return `<label class="ops-checkbox"><input type="checkbox" name="departments" value="${safe(d.id)}" ${judgment.departments?.includes(d.id)?"checked":""}>${safe(d.name)}${typeof probability==="number"&&Number.isFinite(probability)?` <span class="ops-caption">Jev ${Math.round(probability*100)}%</span>`:""}</label>`;}).join("")}</fieldset><button class="ops-button" type="submit">검토 결과 저장</button><p class="ops-message" role="status" hidden></p></form></div></details>`;
    }).join(""):'<p class="ops-message">현재 검토할 기사가 없습니다.</p>';}catch(error){target.innerHTML=`<p class="ops-message ops-error">${safe(errorText(error))}</p>`;}
  }
  async function loadRuns(){
    const target=el("#ops-runs");target.innerHTML='<p class="ops-message">실행 기록을 불러오는 중입니다.</p>';
    try{const data=await api("/api/admin/runs");target.innerHTML=data.runs?.length?`<ul class="ops-run-list">${data.runs.map(run=>`<li><strong>${safe(({draft:"초안 생성",published:"발행",running:"실행 중",empty:"해당 기사 없음",blocked:"설정 확인 필요",failed:"실패"})[run.status]||run.status)}</strong><span>${dateLabel(run.createdAt)} · ${safe(run.id)}</span>${run.error?`<p>${safe(typeof run.error==="string"?run.error:"실행 정보를 확인해 주세요.")}</p>`:""}${run.counts?`<p>${safe(countText(run.counts))}</p>`:""}</li>`).join("")}</ul>`:'<p class="ops-message">아직 실행 기록이 없습니다.</p>';}catch(error){target.innerHTML=`<p class="ops-message ops-error">${safe(errorText(error))}</p>`;}
  }
  async function refresh(){
    if(state.activeRun){message("#ops-run-message","실행 중입니다. 완료 후 상태를 새로고침해 주세요.");return;}
    if(state.loading)return;state.loading=true;shell();
    try{const [status,session]=await Promise.all([api("/api/status"),api("/api/session")]);state.status=status;state.session=session;state.loaded=true;if(!admin())state.departmentId=session.departmentId||"";renderStatus();renderArchive();renderAdmin();}
    catch(error){state.loaded=false;el("#ops-status").innerHTML=`<div class="ops-card"><h3>연결 상태를 확인할 수 없습니다</h3><p class="ops-message ops-error">${safe(errorText(error))}</p><button class="ops-button ops-secondary" data-ops="refresh">다시 확인</button></div>`;el("#ops-archive").innerHTML='<p class="ops-message">서버 연결 후 실제 보고서를 확인할 수 있습니다.</p>';el("#ops-role-label").textContent="서버 미연결";}
    finally{state.loading=false;}
  }
  window.renderOperations=()=>{if(!state.loaded&&!state.loading)refresh();};
  document.addEventListener("click",async event=>{
    if(!event.target.closest("#operations-panel"))return;
    const report=event.target.closest("[data-ops-report]");if(report){openReport(report.dataset.opsReport);return;}
    const ref=event.target.closest("[data-ops-reference]");if(ref){event.preventDefault();el(`#ops-source-${ref.dataset.opsReference}`)?.scrollIntoView({behavior:"smooth",block:"center"});return;}
    const action=event.target.closest("[data-ops]")?.dataset.ops;
    if(action==="refresh")refresh();if(action==="reports-retry")loadReports();if(action==="runs")loadRuns();if(action==="review")loadReview();if(action==="close-report"){detailRequest++;state.detail=null;el("#ops-report-detail").innerHTML="";}
    if(action==="discard-draft"){
      const report=state.detail,button=event.target.closest("button");if(!report||report.status==="published"||button.disabled)return;
      if(!window.confirm("이 초안을 삭제할까요? 기존 기사와 Jev 판단은 유지되며, 보고서 생성 단계에서 다시 만들 수 있습니다."))return;
      button.disabled=true;try{await api(`/api/admin/reports/${encodeURIComponent(report.id)}`,{method:"DELETE",body:JSON.stringify({confirm:true})});state.detail=null;el("#ops-report-detail").innerHTML='<p class="ops-message">초안을 삭제했습니다. 관리자 작업에서 같은 회차를 다시 생성하세요.</p>';loadReports();}catch(error){message("#ops-publish-message",errorText(error),true);button.disabled=false;}
    }
    if(action==="collect"){
      const form=el("#ops-run-form"),button=event.target.closest("button");if(form.dataset.busy==="true"||!form.reportValidity())return;form.dataset.busy="true";state.activeRun=true;const buttons=[...form.querySelectorAll("button")];buttons.forEach(b=>b.disabled=true);message("#ops-run-message","등록된 공급 API에서 기사를 가져오고 있습니다.");
      try{const data=new FormData(form);const result=await api("/api/admin/collect",{method:"POST",body:JSON.stringify({reportDate:data.get("reportDate"),kind:data.get("kind")}),timeout:120000});message("#ops-run-message",result.message||"공급 API에서 기사 입력을 완료했습니다. 초안 생성을 진행할 수 있습니다.");}catch(error){message("#ops-run-message",errorText(error),true);}finally{state.activeRun=false;form.dataset.busy="false";buttons.forEach(b=>b.disabled=false);}
    }
    if(action==="example"){
      const source=state.status?.sources?.[0];const example=[{sourceId:source?.id||"source-id",url:"https://example.com/replace-with-permitted-article",title:"실제 허용된 기사 제목으로 바꾸세요",publishedAt:`${currentDate()}T09:00:00+09:00`,body:"본문 사용과 AI 처리 권한을 확보한 기사 본문으로 바꾸세요. 이 예시는 입력 형식 설명이며 실제 기사가 아닙니다."}];const url=URL.createObjectURL(new Blob([JSON.stringify(example,null,2)],{type:"application/json"}));const a=document.createElement("a");a.href=url;a.download="기사-입력형식.json";document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }
  });
  document.addEventListener("change",event=>{
    if(!event.target.matches('#ops-run-form [name="kind"]'))return;
    const monthly=event.target.value==="monthly",input=el('#ops-run-form [name="reportDate"]');input.type=monthly?"month":"date";input.value=monthly?previousMonth():latestReportDate();el("#ops-run-date-label").textContent=monthly?"대상 월":"보고일 (월요일 또는 목요일)";el("#ops-run-window-note").textContent=monthly?"선택한 달 전체의 기사로 월간 보고서를 만듭니다. 발행 기준일은 다음 달 1일입니다.":"월요일 보고는 목~일, 목요일 보고는 월~수 기사로 작성합니다.";
  });
  document.addEventListener("submit",async event=>{
    const form=event.target;if(!form.closest("#operations-panel"))return;event.preventDefault();const data=new FormData(form),button=el('[type="submit"]',form);if(button?.disabled||form.dataset.busy==="true")return;
    if(form.id==="ops-filter-form"){state.month=String(data.get("month"));state.departmentId=admin()?String(data.get("departmentId")||""):state.session.departmentId;el("#ops-report-detail").innerHTML="";loadReports();return;}
    if(button)button.disabled=true;
    if(form.id==="ops-run-form"){state.activeRun=true;form.dataset.busy="true";form.querySelectorAll("button").forEach(b=>b.disabled=true);}
    let target="";
    try{
      if(form.classList.contains("ops-source-form")){
        const note=String(data.get("permissionNote")||"").trim();if(!note)throw new Error("사용 허용 근거를 입력해 주세요.");
        await api(`/api/admin/sources/${encodeURIComponent(form.dataset.sourceId)}`,{method:"PUT",body:JSON.stringify({enabled:data.get("enabled")==="on",bodyAllowed:data.get("bodyAllowed")==="on",aiAllowed:data.get("aiAllowed")==="on",permissionNote:note})});
        const box=el('.ops-message',form);box.textContent="출처 설정을 저장했습니다.";box.hidden=false;box.classList.remove("ops-error");state.status=await api("/api/status");renderStatus();
      }
      if(form.classList.contains("ops-review-form")){
        const decision=String(data.get("decision")),selected=data.getAll("departments");if(decision==="candidate"&&!selected.length)throw new Error("보고 후보는 한 개 이상의 관련 부서를 선택해 주세요.");await api(`/api/admin/review/${encodeURIComponent(form.dataset.reviewId)}`,{method:"PUT",body:JSON.stringify({decision,departments:decision==="candidate"?selected:[]})});const box=el('.ops-message',form);box.textContent="검토 결과를 저장했습니다.";box.hidden=false;box.classList.remove("ops-error");
      }
      if(form.id==="ops-import-form"){
        target="#ops-import-message";message(target,"입력한 기사를 검증하고 있습니다.");let articles;try{articles=JSON.parse(String(data.get("articles")));}catch{throw new Error("JSON 형식이 올바르지 않습니다. 기사 객체의 배열로 입력해 주세요.");}if(!Array.isArray(articles))throw new Error("기사 객체의 배열을 입력해 주세요.");const result=await api("/api/admin/import",{method:"POST",body:JSON.stringify({articles,permissionNote:String(data.get("permissionNote"))})});message(target,result.message||"기사 입력을 완료했습니다. 실행 기록과 보고서 생성 단계에서 확인하세요.");
      }
      if(form.id==="ops-run-form"){
        target="#ops-run-message";message(target,"Jev 판단과 LLM 요약을 실행하고 있습니다. 이 화면에서 기다려 주세요.");let result;const payload=JSON.stringify({kind:data.get("kind"),departmentId:data.get("departmentId"),reportDate:data.get("reportDate")});for(let attempt=0;attempt<Math.min(51,Math.ceil((state.status?.limits?.maxArticles||40)/8)+1);attempt++){result=await api("/api/admin/run",{method:"POST",body:payload,timeout:240000});if(result.status!=="pending")break;message(target,`Jev 판단을 이어서 처리하고 있습니다. 완료 ${Number(result.counts?.processed)||0}건 · 남은 ${Number(result.counts?.remaining)||0}건`);}message(target,result.message||({pending:"처리를 일부 완료했습니다. 실행 기록을 확인한 후 같은 회차를 다시 생성하면 이어서 처리합니다.",draft:"초안을 생성했습니다. 원문과 내용을 검수한 후 발행하세요.",empty:"이 기간에 보고서로 만들 기사가 없습니다.",blocked:"실행 전 설정 확인이 필요합니다.",failed:"실행에 실패했습니다. 기록을 확인해 주세요."}[result.status]||"실행 기록을 확인해 주세요."),["blocked","failed"].includes(result.status));if(result.counts){const box=el(target);box.textContent+=` ${countText(result.counts)}`;}if(result.reportId)await openReport(result.reportId);await loadReports();
      }
      if(form.id==="ops-member-form"){
        target="#ops-member-message";await api(`/api/admin/members/${encodeURIComponent(String(data.get("userId")).trim())}`,{method:"PUT",body:JSON.stringify({departmentId:data.get("departmentId")})});message(target,"구성원의 열람 부서를 등록했습니다.");
      }
      if(form.id==="ops-publish-form"){
        target="#ops-publish-message";if(data.get("reviewed")!=="on")throw new Error("검수 확인 후 발행할 수 있습니다.");const id=state.detail.id;await api(`/api/admin/reports/${encodeURIComponent(id)}/publish`,{method:"POST",body:JSON.stringify({reviewed:true})});await openReport(id);await loadReports();
      }
    }catch(error){if(form.classList.contains("ops-source-form")||form.classList.contains("ops-review-form")){const box=el('.ops-message',form);box.textContent=errorText(error);box.hidden=false;box.classList.add("ops-error");}else if(target)message(target,errorText(error),true);}
    finally{if(button)button.disabled=false;if(form.id==="ops-run-form"){state.activeRun=false;form.dataset.busy="false";form.querySelectorAll("button").forEach(b=>b.disabled=false);}}
  });
})();
