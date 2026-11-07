/*
 * LIFE:BRIEF — interactive academic sample.
 * All articles, Jev labels, and LLM analyses below are authored examples.
 * No scraping, model API request, or scheduled task runs in this static site.
 */
"use strict";

const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
const icon = (name, className = "") => `<svg${className ? ` class="${className}"` : ""} aria-hidden="true"><use href="#i-${name}"/></svg>`;
const escapeHTML = (value) => String(value).replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
const STORAGE_KEY = "lifebrief-sample-v1";
function readStoredState() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return {
      saved: Array.isArray(stored.saved) ? stored.saved.filter(id => ARTICLE_SAMPLES.some(a => a.id === id)) : [],
      interests: Array.isArray(stored.interests) ? stored.interests.filter(id => DEPARTMENTS.some(d => d.id === id)) : ["strategy","risk"],
      collected: stored.collected === true
    };
  } catch { return {saved:[],interests:["strategy","risk"],collected:false}; }
}
const stored = readStoredState();
const state = {view:"news",reportId:REPORTS[0].id,archiveMonth:"",archiveFrom:"",archiveTo:"",publicationId:null,department:"all",briefDepartment:stored.interests[0] || "strategy",query:"",sort:"latest",mode:"list",limit:6,...stored};
const SESSION_KEY = "kyobo-demo-session-v1";
function readSession() {
  try { return normalizeDemoSession(JSON.parse(sessionStorage.getItem(SESSION_KEY))); }
  catch { return null; }
}
state.session = readSession();
const allowedDepartments = () => DEPARTMENTS.filter(department => canViewDepartment(state.session, department.id));
function openLogin() {
  $("#team-login-options").innerHTML = DEPARTMENTS.map(department => `
    <button class="team-login-choice" data-login-team="${department.id}" aria-pressed="${state.session?.departmentId === department.id}">
      <span>${department.name}팀</span>${icon("chevron")}
    </button>`).join("");
  $("#logout-button").hidden = !state.session;
  if (!$("#login-dialog").open) $("#login-dialog").showModal();
}
function setSession(session) {
  state.session = normalizeDemoSession(session);
  try {
    if (state.session) sessionStorage.setItem(SESSION_KEY, JSON.stringify(state.session));
    else sessionStorage.removeItem(SESSION_KEY);
  } catch { /* The selected team still works for this page when storage is unavailable. */ }
  $$("dialog[open]").forEach(dialog => dialog.close());
  state.department = "all";
  state.query = "";
  $("#news-search").value = "";
  navigate(state.session ? "today" : "news");
}
function requireDepartment(departmentId) {
  if (canViewDepartment(state.session, departmentId)) return true;
  navigate(state.session ? "today" : "news");
  if (state.session) toast("우리 팀 보고서만 열람할 수 있습니다.", "info");
  else openLogin();
  return false;
}
let toastTimer;
let collecting = false;
let activeArticleId = null;

function persist() {
  try {localStorage.setItem(STORAGE_KEY, JSON.stringify({saved:state.saved,interests:state.interests,collected:state.collected}));}
  catch {toast("브라우저 저장 공간을 사용할 수 없어 현재 화면에서만 유지됩니다.", "info");}
}
function toast(message, type = "check") {
  clearTimeout(toastTimer);
  const element = $("#toast");
  if ($("#article-dialog").open) $("#article-dialog").appendChild(element);
  else document.body.appendChild(element);
  element.innerHTML = `${icon(type)}<span>${escapeHTML(message)}</span>`;
  element.classList.add("visible");
  toastTimer = setTimeout(() => element.classList.remove("visible"), 3400);
}
const reportArticles = () => state.reportId ? getReportArticles(state.reportId) : [];
function tag(deptId) {
  const d = departmentById(deptId);
  return `<span class="category-tag" style="--dept-text:${d.text};--dept-bg:${d.bg}">${d.name}</span>`;
}
function articleMeta(article) {
  return `<span class="meta-source">${article.source}</span><span class="meta-dot"></span><span>${article.time}</span><span class="meta-dot"></span><span class="meta-company">${article.company}</span>`;
}
function saveButton(article, className = "") {
  if (!state.session) return "";
  const saved = state.saved.includes(article.id);
  return `<button class="bookmark-button ${className} ${saved ? "saved" : ""}" data-save="${article.id}" aria-label="${saved ? "스크랩 취소" : "기사 스크랩"}: ${escapeHTML(article.title)}" aria-pressed="${saved}">${icon("bookmark")}</button>`;
}
function articleRow(article) {
  return `<article class="article-row" data-article-row="${article.id}"><div class="article-row-top"><div class="article-tags">${article.depts.map(tag).join("")}${article.priority >= 8 ? '<span class="priority-label">주요 이슈</span>' : ""}</div></div><h3><button class="article-open" data-article="${article.id}">${escapeHTML(article.title)}</button></h3><p class="article-description">${escapeHTML(article.summary)}</p><div class="article-meta">${articleMeta(article)}</div>${saveButton(article,"row-bookmark")}</article>`;
}
function featuredCard(article, index) {
  return `<article class="featured-card"><div class="featured-image"><img src="./assets/${article.image || ["architecture.jpg","planning.jpg","data.jpg"][index]}" alt="${["도심의 현대적인 오피스 건축","문서와 데이터를 검토하는 업무 현장","데이터와 지표가 담긴 업무 화면"][index]}" ${index ? 'loading="lazy"' : 'fetchpriority="high"'} width="800" height="400"><span class="featured-image-tag">${article.pick || "EDITOR’S PICK"}</span></div><div class="featured-body"><div class="featured-tags">${article.depts.map(tag).join("")}</div><h3><button class="article-open" data-article="${article.id}">${escapeHTML(article.title)}</button></h3><div class="featured-meta"><span>${article.source}</span><span class="meta-dot"></span><span>${article.time}</span>${saveButton(article)}</div></div></article>`;
}

function renderSidebar() {
  const departments = allowedDepartments();
  $("#sidebar-departments").innerHTML = departments.map(department => `
    <button data-department="${department.id}" class="${state.briefDepartment === department.id && ["departments", "report"].includes(state.view) ? "active" : ""}">
      <span class="department-dot" style="--dept-color:${department.color}"></span>${department.name}팀
    </button>`).join("");
  $(".department-label").hidden = !state.session;
  $(".department-label span").textContent = departments.length;
  $("#login-trigger").textContent = state.session?.role === "admin" ? "관리자" : state.session ? `${departmentById(state.session.departmentId).name}팀` : "로그인";
  $("#login-trigger").setAttribute("aria-label", state.session ? "로그인 팀 변경 또는 로그아웃" : "로그인");
  $$(".primary-nav [data-view], .mobile-nav [data-view]").forEach(button => {
    const view = button.dataset.view;
    button.hidden = !state.session && ["today", "saved"].includes(view);
    if (view === "today") $("span", button).textContent = state.session?.role === "admin" ? "전체 팀" : "우리 팀";
    button.classList.toggle("active", view === state.view || ["departments", "report"].includes(state.view) && view === "today");
  });
  $(".mobile-nav").classList.toggle("guest-nav", !state.session);
  $$(".settings-trigger").forEach(button => button.hidden = !state.session);
  $$(".saved-count").forEach(element => element.textContent = state.saved.length);
  $(".mobile-saved-count").textContent = state.saved.length;
  $(".mobile-saved-count").hidden = !state.saved.length;
}
function renderTabs() {
  const counts = Object.fromEntries(DEPARTMENTS.map(d => [d.id,reportArticles().filter(a => a.depts.includes(d.id)).length]));
  $("#department-tabs").innerHTML = `<button class="department-tab ${state.department === "all" ? "active" : ""}" data-dept="all" aria-pressed="${state.department === "all"}">전체 <span>${reportArticles().length}</span></button>` + DEPARTMENTS.map(d => `<button class="department-tab ${state.department === d.id ? "active" : ""}" data-dept="${d.id}" aria-pressed="${state.department === d.id}">${d.name} <span>${counts[d.id]}</span></button>`).join("");
}
function filteredArticles() {
  let articles = reportArticles().filter(a => state.department === "all" || a.depts.includes(state.department));
  const query = state.query.trim().toLocaleLowerCase();
  if (query) articles = articles.filter(a => [a.title,a.summary,a.company,a.source,...a.keywords,...a.depts.map(id => departmentById(id).name),...(a.body || [])].join(" ").toLocaleLowerCase().includes(query));
  return [...articles].sort((a,b) => state.sort === "priority" ? b.priority - a.priority || b.date.localeCompare(a.date) || b.time.localeCompare(a.time) : b.date.localeCompare(a.date) || b.time.localeCompare(a.time));
}
function renderFeed() {
  const articles = filteredArticles();
  const title = state.department === "all" ? "모든 뉴스" : `${departmentById(state.department).name} 뉴스`;
  $("#feed-heading").innerHTML = `${title} <span class="count-label">${articles.length}</span>`;
  $("#article-list").classList.toggle("grid-mode",state.mode === "grid");
  $("#article-list").innerHTML = articles.length ? articles.slice(0,state.limit).map(articleRow).join("") : `<div class="empty-state">${icon("search")}<h3>검색 결과가 없습니다.</h3><p>다른 키워드로 검색하거나<br>전체 부서에서 다시 찾아보세요.</p><button class="outline-button" id="reset-filters">검색과 필터 초기화</button></div>`;
  if (!state.reportId) {
    $("#article-list").innerHTML = '<div class="empty-state"><h3>해당 기간의 뉴스가 없습니다.</h3><p>발행 월이나 날짜를 바꿔보세요.</p><button class="outline-button" id="reset-news-archive">전체 기간 보기</button></div>';
  }
  $("#result-count").textContent = `${articles.length}개의 기사`;
  $("#show-more").hidden = state.limit >= articles.length;
  if (!$("#show-more").hidden) $("#show-more").innerHTML = `기사 더 보기 (${Math.min(state.limit,articles.length)}/${articles.length}) ${icon("down")}`;
  const info = $("#active-filter-info");
  info.hidden = !state.query.trim();
  info.textContent = `“${state.query.trim()}” 검색 결과 ${articles.length}건`;
}
function renderRail() {
  const showBrief = Boolean(state.session && state.reportId);
  $(".insight-card").hidden = !showBrief;
  $(".insight-rail").hidden = !showBrief;
  $(".feed-layout").classList.toggle("without-brief", !showBrief);
  if (!showBrief) { $("#rail-brief").innerHTML = ""; return; }
  const id = state.session.role === "team" ? state.session.departmentId : state.department === "all" ? state.interests[0] || "strategy" : state.department;
  const d = departmentById(id), brief = getReportBrief(id,state.reportId);
  const count = reportArticles().filter(a => a.depts.includes(id)).length;
  $("#rail-brief").innerHTML = `<div class="rail-dept">${d.name}<small>관련 기사 ${count}건</small></div><h3 class="rail-title">${brief.short}</h3><p class="rail-summary">${brief.lead}</p><div class="rail-implication"><span>${icon("bulb")}업무에 연결해 보면</span><p>${brief.implication}</p></div>`;
  $("#open-brief").dataset.brief = id;
  const keywords = new Map();
  reportArticles().forEach(a => a.keywords.forEach(key => keywords.set(key,(keywords.get(key) || 0) + 1)));
  const top = [...keywords].sort((a,b) => b[1] - a[1]).slice(0,5);
  $("#keyword-list").innerHTML = top.map(([word,count],index) => `<div class="keyword-row"><span class="keyword-number">${String(index+1).padStart(2,"0")}</span><span class="keyword-word">${word}</span><span class="keyword-bar"><span style="--bar:${Math.round(count / top[0][1] * 100)}%"></span></span><span class="keyword-value">${count}</span></div>`).join("");
}
function renderReportDetail() {
  if (!canViewDepartment(state.session, state.briefDepartment)) return;
  const d=departmentById(state.briefDepartment);
  const report=reportById(state.reportId);
  const articles=reportArticles().filter(article=>article.depts.includes(d.id));
  const brief=getReportBrief(d.id,state.reportId);
  $("#department-content").innerHTML=`<button class="back-link" data-department="${d.id}">${icon("arrow")} ${d.name} 보고서 목록</button><div class="brief-overview"><article class="brief-primary"><div class="brief-overline"><span>${d.name} INSIGHT REPORT</span><span class="example-label">${report.shortName}</span></div><h2>${brief.title.replace("\n","<br>")}</h2><p class="brief-lead">${brief.lead}</p><div class="brief-stats"><span>근거 뉴스<strong>${articles.length}건</strong></span><span>뉴스 수집 범위<strong>${report.periodShort}</strong></span><span>분류 · 요약<strong>Jev · LLM</strong></span></div></article><article class="brief-takeaways"><h3>${icon("spark")}핵심 요약</h3>${brief.takeaways.map((text,index)=>`<div class="takeaway"><span>${index+1}</span><p>${text}<span class="point-sources">${brief.evidence[index].map(id=>`<button data-source="${id}" aria-label="근거 기사 ${articles.findIndex(a=>a.id===id)+1} 보기">[${articles.findIndex(a=>a.id===id)+1}]</button>`).join("")}</span></p></div>`).join("")}</article></div><div class="analysis-blocks"><article class="analysis-block"><h3>${icon("chart")}주요 인사이트</h3><p>${brief.analysis}</p></article><article class="analysis-block"><h3>${icon("bulb")}우리 부서의 업무 시사점</h3><p>${brief.action}</p></article></div><div class="brief-method-note">${icon("info")}<span>이 보고서는 ${report.period} 주요 보험 뉴스를 ${d.name} 부서의 관점에서 정리한 요약·분석입니다. 아래 근거 뉴스를 통해 내용을 더 자세히 살펴보세요.</span></div><section class="report-sources"><div class="section-heading"><h3 class="related-heading">뉴스 출처 <span class="count-label">${articles.length}건</span></h3><span class="source-section-label">요약·분석의 근거 기사</span></div><ol class="source-list">${articles.map((article,index)=>`<li class="source-row" id="source-${article.id}"><span class="source-index">${String(index+1).padStart(2,"0")}</span><div><button class="source-title" data-article="${article.id}">${escapeHTML(article.title)}</button><p>${article.source}<span>·</span>${article.company}<span>·</span>${article.date.slice(5).replace("-",".")}</p></div><button class="source-read" data-article="${article.id}" aria-label="기사 내용 보기: ${escapeHTML(article.title)}">${icon("arrow")}</button></li>`).join("")}</ol><p class="source-note">프로토타입의 기사·매체명은 예시입니다. 실제 서비스에서는 각 기사에 원문 URL이 연결됩니다.</p></section>`;
}
function filteredReports() {
  if (state.archiveFrom && state.archiveTo && state.archiveFrom > state.archiveTo) return [];
  return REPORTS.filter(report =>
    (!state.archiveMonth || report.publishedAt.startsWith(state.archiveMonth)) &&
    (!state.archiveFrom || report.publishedAt >= state.archiveFrom) &&
    (!state.archiveTo || report.publishedAt <= state.archiveTo)
  );
}
function renderReportSelector() {
  const visible = ["news", "departments", "today"].includes(state.view);
  $("#report-selector").hidden = !visible;
  if (!visible) return;
  const reports = filteredReports();
  const months = [...new Set(REPORTS.map(report => report.publishedAt.slice(0, 7)))];
  const invalidRange = state.archiveFrom && state.archiveTo && state.archiveFrom > state.archiveTo;
  $("#report-selector").innerHTML = `
    <details id="archive-drawer" ${state.view === "news" || state.archiveOpen ? "open" : ""}>
    <summary>지난 보고서 찾기${state.archiveMonth || state.archiveFrom || state.archiveTo ? '<span>필터 적용</span>' : ""}${icon("down")}</summary>
    <div class="archive-filter-heading"><button class="text-button" id="reset-archive">전체 기간</button></div>
    <div class="archive-filter-fields">
      <label>발행 월<select id="archive-month"><option value="">전체 월</option>${months.map(month => `<option value="${month}" ${state.archiveMonth === month ? "selected" : ""}>${month.replace("-", "년 ")}월</option>`).join("")}</select></label>
      <label>시작일<input id="archive-from" type="date" value="${state.archiveFrom}" aria-invalid="${Boolean(invalidRange)}"></label>
      <label>종료일<input id="archive-to" type="date" value="${state.archiveTo}" aria-invalid="${Boolean(invalidRange)}"></label>
      ${state.view === "news" ? `<label class="collection-select-label">뉴스 회차<select id="collection-select" ${reports.length ? "" : "disabled"}>${reports.length ? reports.map(report => `<option value="${report.id}" ${state.reportId === report.id ? "selected" : ""}>${report.shortName} · ${report.publishedAt}</option>`).join("") : '<option>해당 기간의 회차 없음</option>'}</select></label>` : ""}
    </div>
    ${invalidRange ? '<p class="archive-error" role="status">종료일을 시작일 이후로 설정해 주세요.</p>' : ""}
    </details>`;
}
function updateArchiveFilter(key, value) {
  state[key] = value;
  const reports = filteredReports();
  if (!reports.some(report => report.id === state.reportId)) state.reportId = reports[0]?.id || null;
  state.limit = 6;
  renderAll();
}
function renderOverview(){
  $("#directory-team-count").textContent = `${allowedDepartments().length}개 팀`;
  const sorted=allowedDepartments().sort((a,b)=>Number(state.interests.includes(b.id))-Number(state.interests.includes(a.id)));
  $("#department-overview").innerHTML=sorted.map(d=>`<button class="department-choice" data-department="${d.id}" aria-label="${d.name} 보고서 목록"><span class="directory-icon" style="--dept-bg:${d.bg};--dept-text:${d.text}">${icon(d.icon)}</span><span class="directory-name">${d.name}</span><span class="directory-count">보고서 ${departmentPublications(d.id).filter(publication => filteredReports().some(report => report.id === publication.collectionId)).length}개</span>${icon("chevron","directory-arrow")}</button>`).join("");
}
function renderDepartmentList() {
  if (!canViewDepartment(state.session, state.briefDepartment)) return;
  const department = departmentById(state.briefDepartment);
  const reportIds = filteredReports().map(report => report.id);
  const publications = departmentPublications(department.id).filter(publication => reportIds.includes(publication.collectionId));
  $("#department-report-list").innerHTML = `
    ${state.session.role === "admin" ? `<button class="back-link" data-view="today">${icon("arrow")} 전체 팀</button>` : ""}
    <div class="report-archive-heading"><h2>요약 보고서</h2><span>${publications.length}개</span></div>
    <div class="publication-list">${publications.map(publication => {
      const collection = reportById(publication.collectionId);
      const count = getReportBrief(department.id, collection.id).sourceIds.length;
      return `<button class="publication-item" data-publication="${publication.id}">
        <span class="publication-day">${collection.sequence}<small>회차</small></span>
        <span class="publication-copy"><strong>${publication.title}</strong>
          <span class="publication-date">${publication.publishedAt.replaceAll("-", ".")} 발행</span>
          <span class="publication-period">${collection.dates[0].slice(5).replace("-", ".")}–${collection.dates.at(-1).slice(5).replace("-", ".")} 뉴스 · 근거 ${count}건</span>
        </span>${icon("chevron", "publication-arrow")}</button>`;
    }).join("") || '<div class="empty-state"><h3>해당 기간의 보고서가 없습니다.</h3><p>발행 월이나 날짜를 바꿔보세요.</p><button class="outline-button" id="reset-archive-empty">전체 기간 보기</button></div>'}</div>
    <p class="archive-cadence">${icon("clock")} 1회는 월요일, 2회는 목요일 발행 · 주차는 해당 주 월요일 기준</p>`;
}
function openPublication(id,scroll=true,replace=false){
  const publication=publicationById(id);
  if(!publication||!DEPARTMENTS.some(dept=>dept.id===publication.departmentId)||!REPORTS.some(report=>report.id===publication.collectionId)){
    navigate("today",null,scroll,replace);toast("보고서를 찾을 수 없습니다.","info");return;
  }
  if (!requireDepartment(publication.departmentId)) return;
  state.publicationId=publication.id;state.reportId=publication.collectionId;
  navigate("report",publication.departmentId,scroll,replace);
}
function openDepartmentReport(departmentId,collectionId=state.reportId){
  if (!requireDepartment(departmentId)) return;
  const publication=departmentPublications(departmentId).find(item=>item.collectionId===collectionId);
  if(publication) openPublication(publication.id);
}

function renderSaved() {
  const articles = state.session ? state.saved.map(id => ARTICLE_SAMPLES.find(a => a.id === id)).filter(Boolean) : [];
  $("#saved-total").textContent = articles.length;
  $("#export-saved").hidden = !articles.length;
  $("#saved-list").innerHTML = articles.length ? articles.map(articleRow).join("") : `<div class="empty-state">${icon("bookmark")}<h3>다시 읽고 싶은 뉴스를 모아보세요.</h3><p>기사의 북마크 아이콘을 누르면 여기에 저장됩니다.<br>스크랩은 현재 브라우저에서 유지됩니다.</p><button class="primary-button" data-view="news">주요 보험 뉴스 둘러보기 ${icon("arrow")}</button></div>`;
}
function renderHeading() {
  const content={
    today:["DEPARTMENT REPORTS","우리 부서의<br class=\"mobile-break\"> 뉴스 브리핑<span>.</span>","부서를 선택하고, 월·목요일 보고서를 확인하세요.","부서 선택"],
    news:["THE NEWS BEHIND THE BRIEF","요약의 근거가 되는,<br class=\"mobile-break\"> 주요 보험 뉴스<span>.</span>","발행 회차를 선택하고 보험 뉴스를 찾아보세요.","전체 뉴스"],
    departments:["DEPARTMENT ARCHIVE",`${departmentById(state.briefDepartment).name}<br class=\"mobile-break\"> 보고서<span>.</span>`,"주차와 회차, 발행일을 확인하고 보고서를 선택하세요.",`${departmentById(state.briefDepartment).name} 보고서`],
    report:["SUMMARY & INSIGHTS",`${departmentById(state.briefDepartment).name}<br class=\"mobile-break\"> 요약 보고서<span>.</span>`,`${reportById(state.reportId).shortName} · ${reportById(state.reportId).publishedAt.replaceAll("-", ".")} 발행`,"요약 보고서"],
    saved:["YOUR PERSONAL READING ROOM","다시 꺼내 읽을,<br class=\"mobile-break\"> 나만의 인사이트<span>.</span>","중요한 소식을 스크랩하고, 생각의 단서를 한곳에 모아보세요.","나의 스크랩"],
    process:["THE IDEA BEHIND THE BRIEF","뉴스를 부서의 관점으로,<br class=\"mobile-break\"> 주 2회 보험 브리핑<span>.</span>","보험 뉴스 수집, Jev 부서 분류, LLM 요약·분석의 흐름입니다.","서비스 소개"]
  }[state.view];
  $("#page-eyebrow").textContent=content[0];$("#page-title").innerHTML=content[1];$("#page-description").textContent=content[2];$("#breadcrumb-current").textContent=content[3];
  document.title=`${content[3]} — 교보 뉴스브리핑`;
}

function renderAll() {
  renderHeading(); renderSidebar(); renderTabs(); renderReportSelector(); renderOverview();
  $$("main>.view").forEach(el => el.hidden = el.id !== `${state.view}-view`);
  $("#stat-total").textContent = reportArticles().length;
  $("#featured-news").innerHTML = reportArticles().slice(0,3).map(featuredCard).join("");
  $(".featured-section").hidden = !reportArticles().length;
  renderFeed(); renderRail(); renderSaved();
  if(state.view==="departments") renderDepartmentList(); else $("#department-report-list").innerHTML="";
  if(state.view==="report") renderReportDetail(); else $("#department-content").innerHTML="";
}

function navigate(view,department,scroll=true,replace=false){
  if(!["today","news","departments","report","saved","process"].includes(view)) view="today";
  if (view === "today") {
    if (!state.session) view = "news";
    else if (state.session.role === "team") { view = "departments"; department = state.session.departmentId; }
  }
  if (["departments", "report", "saved"].includes(view) && !state.session) {
    state.publicationId = null;
    navigate("news", null, scroll, true);
    openLogin();
    return;
  }
  if (["departments", "report"].includes(view) && !canViewDepartment(state.session, department || state.briefDepartment)) {
    toast("우리 팀 보고서만 열람할 수 있습니다.", "info");
    view = state.session.role === "team" ? "departments" : "today";
    department = state.session.departmentId;
    state.publicationId = null;
  }
  if(department){
    if(!DEPARTMENTS.some(d=>d.id===department)){view="news";}
    else state.briefDepartment=department;
  }
  state.view=view;
  if(view!=="report") state.publicationId=null;
  const route=view==="departments"?`department/${state.briefDepartment}`:view==="report"?`report/${state.publicationId}`:view;
  if(location.hash!==`#${route}`) history[replace?"replaceState":"pushState"](null,"",`#${route}`);
  renderAll();
  if(scroll){window.scrollTo({top:0,behavior:"instant"});$("#main-content").focus({preventScroll:true});}
}
function setReport(id){
  if(!REPORTS.some(report=>report.id===id)) return;
  state.reportId=id;state.limit=6;state.query="";$("#news-search").value="";
  renderAll();
}

function toggleSaved(id) {
  if (!state.session) { openLogin(); return; }
  if (!ARTICLE_SAMPLES.some(a => a.id === id)) return;
  const wasSaved = state.saved.includes(id);
  state.saved = wasSaved ? state.saved.filter(savedId => savedId !== id) : [...state.saved,id];
  persist();
  // Update in place so saving from the feed keeps keyboard focus and scroll position.
  $$(`[data-save="${id}"]`).forEach(button => {
    const saved = !wasSaved;
    button.classList.toggle("saved",saved);
    button.setAttribute("aria-pressed",String(saved));
    button.setAttribute("aria-label",`${saved ? "스크랩 취소" : "기사 스크랩"}: ${ARTICLE_SAMPLES.find(a => a.id === id).title}`);
    const label = $(".save-label",button);
    if (label) label.textContent = saved ? "스크랩 완료" : "기사 스크랩";
  });
  renderSidebar();
  if (state.view === "saved") renderSaved();
  toast(wasSaved ? "스크랩을 해제했습니다." : "나의 스크랩에 저장했습니다.");
}
function openArticle(id) {
  const article = ARTICLE_SAMPLES.find(a => a.id === id);
  if (!article) return;
  activeArticleId = id;
  const body = article.body || [article.summary,`이번 기사에서는 ${article.keywords.slice(0,2).join(", ")} 등의 주제를 중심으로 생명보험회사의 업무 관련성을 살펴봅니다. ${article.depts.map(d => departmentById(d).name).join(", ")} 부서는 각자의 관점에서 검토할 항목을 정리할 수 있습니다.`,"기사의 핵심을 부서의 업무 맥락과 연결해 살펴보면, 변화의 의미와 후속 검토 사항을 구체적으로 정리할 수 있습니다. 관련 기사들을 함께 읽고 서로 연결되는 주제를 확인하는 것이 도움이 됩니다."];
  const saved = state.saved.includes(id);
  $("#article-detail").innerHTML = `<div class="article-dialog-top"><img src="./assets/${article.image || (article.depts.includes("digital") ? "data.jpg" : article.depts.includes("product") ? "planning.jpg" : "architecture.jpg")}" alt="${article.depts.includes("digital") ? "데이터와 지표가 담긴 업무 화면" : article.depts.includes("product") ? "문서를 검토하는 업무 현장" : "도심의 오피스 건축"}"><button class="icon-button" data-close="article-dialog" aria-label="기사 닫기">${icon("close")}</button></div><div class="article-detail-body"><div class="article-tags">${article.depts.map(tag).join("")}<span class="example-label">샘플 기사</span></div><h2 id="article-dialog-title">${escapeHTML(article.title)}</h2><div class="article-meta">${articleMeta(article)}<span class="meta-dot"></span><span>${article.date.replaceAll("-",".")}</span></div><div class="detail-sample-note">${icon("info")}<span>프로토타입용 기사입니다. 주요 뉴스 수집, Jev 부서 분류, LLM 분석이 완료된 상태를 보여주는 샘플입니다.</span></div><div class="detail-content">${body.map(paragraph => `<p>${escapeHTML(paragraph)}</p>`).join("")}</div><div class="classification-box"><h3>${icon("flow")}Jev 부서 분류<span class="example-label">판단 근거</span></h3><p>${escapeHTML(article.reason)}</p><div class="article-tags">${article.depts.map(tag).join("")}</div></div></div><div class="article-dialog-actions"><button class="outline-button ${saved ? "saved" : ""}" data-save="${id}" aria-pressed="${saved}" aria-label="${saved ? "스크랩 취소" : "기사 스크랩"}: ${escapeHTML(article.title)}">${icon("bookmark")}<span class="save-label">${saved ? "스크랩 완료" : "기사 스크랩"}</span></button><button class="text-button" data-article-brief="${article.depts[0]}">부서 브리핑 읽기 ${icon("arrow")}</button></div>`;
  const briefLink = $("[data-article-brief]", $("#article-detail"));
  const accessibleDepartment = article.depts.find(id => canViewDepartment(state.session, id));
  if (accessibleDepartment) briefLink.dataset.articleBrief = accessibleDepartment;
  else briefLink.remove();
  if (!state.session) $(".article-dialog-actions .outline-button").hidden = true;
  const dialog = $("#article-dialog");
  dialog.setAttribute("aria-labelledby","article-dialog-title");
  if (!dialog.open) dialog.showModal();
  dialog.scrollTop = 0;
}
function openSettings() {
  $("#department-settings").innerHTML = DEPARTMENTS.map(d => `<label><input type="checkbox" name="interest" value="${d.id}" ${state.interests.includes(d.id) ? "checked" : ""}>${d.name}</label>`).join("");
  $("#settings-dialog").showModal();
}
function saveSettings() {
  state.interests = $$("#department-settings input:checked").map(input => input.value);
  persist();
  $("#settings-dialog").close();
  renderAll();
  toast("관심 부서를 저장했습니다.");
}
async function collectSample() {
  if (collecting) return;
  collecting = true;
  const dialog = $("#collection-dialog");
  dialog.classList.remove("complete");
  $("#collection-done").hidden = true;
  $$(".collection-steps>div").forEach((el,index) => {el.className=""; $("span",el).textContent=index+1;});
  $(".collection-animation",dialog).innerHTML = icon("refresh");
  $("h2",dialog).textContent = "부서별 요약을 준비합니다.";
  dialog.showModal();
  for (let i=0;i<3;i++) {
    const step = $(`#collect-step-${i}`);
    step.className = "running";
    await new Promise(resolve => setTimeout(resolve,750));
    step.className = "done";
    $("span",step).innerHTML = icon("check");
  }
  state.collected = true; persist(); collecting = false;
  dialog.classList.add("complete");
  $(".collection-animation",dialog).innerHTML = icon("check");
  $("h2",dialog).textContent = "부서별 요약이 준비됐습니다.";
  $("#collection-done").hidden = false;
  $("#collection-done").focus({preventScroll:true});
}
function exportSaved() {
  const articles = state.saved.map(id => ARTICLE_SAMPLES.find(a => a.id === id)).filter(Boolean);
  if (!articles.length) return;
  const text = ["교보 뉴스브리핑 · 나의 스크랩","대학원 과제용 샘플 — 아래 기사와 분류는 실제 보도가 아닌 고정 예시입니다.","",...articles.flatMap((a,index) => [`${index+1}. ${a.title}`,`${a.date} ${a.time} | ${a.source} | ${a.depts.map(d => departmentById(d).name).join(", ")}`,a.summary,`분류 근거 예시: ${a.reason}`,""])].join("\n");
  const blob = new Blob(["\uFEFF",text],{type:"text/plain;charset=utf-8"});
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = "교보뉴스브리핑-스크랩.txt";
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url),1000);
  toast("저장한 기사를 텍스트로 내보냈습니다.");
}

document.addEventListener("click",event => {
  if(event.target.closest(".brand, .mobile-brand")){event.preventDefault();navigate("today");return;}
  const button = event.target.closest("button");
  if (!button) return;
  if (button.dataset.loginTeam) { setSession({role:"team", departmentId:button.dataset.loginTeam}); return; }
  if (button.dataset.save) {toggleSaved(button.dataset.save); return;}
  if (button.dataset.article) {openArticle(button.dataset.article); return;}
  if (button.dataset.close) {document.getElementById(button.dataset.close).close(); return;}
  if (button.dataset.articleBrief) { const article=ARTICLE_SAMPLES.find(a=>a.id===activeArticleId); if(article) state.reportId=REPORTS.find(report=>report.dates.includes(article.date))?.id||state.reportId; $("#article-dialog").close(); openDepartmentReport(button.dataset.articleBrief); return;}
  if (button.dataset.view) {navigate(button.dataset.view); return;}
  if (button.dataset.department) {navigate("departments",button.dataset.department); return;}
  if (button.dataset.publication) {openPublication(button.dataset.publication); return;}
  if (button.dataset.brief) {openDepartmentReport(button.dataset.brief); return;}
  if (button.dataset.source) {const source=document.getElementById(`source-${button.dataset.source}`);if(source){source.scrollIntoView({behavior:"smooth",block:"center"});$(".source-title",source).focus({preventScroll:true});}return;}
  if (button.dataset.dept) {
    state.department = button.dataset.dept; state.limit=6;
    renderTabs(); renderFeed(); renderRail();
    const replacement = $(`[data-dept="${state.department}"]`);
    replacement.focus({preventScroll:true});
    const tabs = $("#department-tabs");
    const offset = replacement.offsetLeft - tabs.offsetLeft - (tabs.clientWidth - replacement.clientWidth)/2;
    tabs.scrollTo({left:offset,behavior:"smooth"});
    return;
  }
  if (button.dataset.report) {setReport(button.dataset.report); return;}
  if (button.classList.contains("settings-trigger")) {openSettings(); return;}
  switch(button.id) {
    case "login-trigger": openLogin(); break;
    case "admin-login": setSession({role:"admin"}); break;
    case "logout-button": setSession(null); break;
    case "reset-news-archive":
    case "reset-archive-empty":
    case "reset-archive":
      state.archiveMonth = "";
      state.archiveFrom = "";
      state.archiveTo = "";
      updateArchiveFilter("reportId", REPORTS[0].id);
      break;
    case "save-settings": saveSettings(); break;
    case "collect-trigger": collectSample(); break;
    case "collection-done": $("#collection-dialog").close(); state.department="all"; state.query=""; state.limit=6; $("#news-search").value=""; navigate("today"); toast("수집·분류·분석이 완료된 부서별 요약을 확인하세요."); break;
    case "show-more": state.limit+=6; renderFeed(); break;
    case "export-saved": exportSaved(); break;
    case "reset-filters": state.query=""; state.department="all"; state.limit=6; $("#news-search").value=""; renderTabs();renderFeed();renderRail();$("#news-search").focus();break;
    case "grid-mode": state.mode="grid"; renderFeed(); updateViewButtons(); break;
    case "list-mode": state.mode="list"; renderFeed(); updateViewButtons(); break;
  }
});
function updateViewButtons() {
  ["grid","list"].forEach(mode => {const button=$(`#${mode}-mode`);button.classList.toggle("active",mode===state.mode);button.setAttribute("aria-pressed",String(mode===state.mode));});
}
document.addEventListener("change", event => {
  const keys = {"archive-month":"archiveMonth", "archive-from":"archiveFrom", "archive-to":"archiveTo"};
  if (keys[event.target.id]) updateArchiveFilter(keys[event.target.id], event.target.value);
  if (event.target.id === "collection-select") setReport(event.target.value);
});
document.addEventListener("toggle", event => {
  if (event.target.id === "archive-drawer" && state.view !== "news") state.archiveOpen = event.target.open;
}, true);
$("#news-search").addEventListener("input",event => {state.query=event.target.value;state.limit=6;renderFeed();});
$("#news-sort").addEventListener("change",event => {state.sort=event.target.value;state.limit=6;renderFeed();});
document.addEventListener("keydown",event => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k" && !$("dialog[open]")) {
    event.preventDefault();
    if(state.view!=="news") navigate("news",null,false);
    $("#news-search").focus();
    $("#news-search").scrollIntoView({block:"center",behavior:"smooth"});
  }
});
// Native dialogs trap focus and support Escape. Close on a genuine backdrop click.
let backdropPointerDown = null;
$$('dialog').forEach(dialog => {
  dialog.addEventListener("pointerdown",event => {backdropPointerDown=event.target===dialog ? dialog : null;});
  dialog.addEventListener("click",event => {
    const rect = dialog.getBoundingClientRect();
    const outside = event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
    if(backdropPointerDown===dialog && event.target===dialog && outside && !(dialog.id==="collection-dialog" && collecting)) dialog.close();
  });
  dialog.addEventListener("cancel",event => {if(dialog.id==="collection-dialog" && collecting) event.preventDefault();});
  dialog.addEventListener("close",() => {
    if(dialog.id==="article-dialog") {
      activeArticleId=null;
      const toastElement=$("#toast");
      if(dialog.contains(toastElement)) {toastElement.classList.remove("visible");document.body.appendChild(toastElement);}
    }
  });
});
function readHash(){
  const hash=location.hash.slice(1);
  const parts=hash.split("/");
  if(parts[0]==="department"&&parts.length===2&&DEPARTMENTS.some(d=>d.id===parts[1])){navigate("departments",parts[1],false,true);return;}
  if (parts[0] === "report" && parts.length === 2) { openPublication(parts[1], false, true); return; }
  if(parts[0]==="report"&&parts.length===3){
    const publication=REPORT_PUBLICATIONS.find(item=>item.departmentId===parts[1]&&item.collectionId===parts[2]);
    if(publication){openPublication(publication.id,false,true);return;}
  }
  if(hash.startsWith("article-")){renderAll();openArticle(hash.slice(8));return;}
  if(hash.startsWith("brief-")&&DEPARTMENTS.some(d=>d.id===hash.slice(6))){navigate("departments",hash.slice(6),false,true);return;}
  if(["today","news","departments","saved","process"].includes(hash)){navigate(hash,null,false,true);return;}
  navigate("today",null,false,true);
}
window.addEventListener("hashchange",readHash);
readHash();

