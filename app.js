/*
 * LIFE:BRIEF — interactive academic sample.
 * All articles, Jev labels, and LLM analyses below are authored examples.
 * Presentation views use fixed samples. Actual server workflows live in operations.js.
 */
"use strict";

const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
const icon = (name, className = "") => `<svg${className ? ` class="${className}"` : ""} aria-hidden="true"><use href="#i-${name}"/></svg>`;
const escapeHTML = (value) => String(value).replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
const STORAGE_KEY = "lifebrief-sample-v1";
const PRESENTATION_MODE = true;
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
const state = {view:"news",reportId:REPORTS[0].id,archiveKind:"period",archiveMonth:"",archiveFrom:"",archiveTo:"",publicationId:null,briefDepartment:stored.interests[0] || "strategy",query:"",sort:"latest",limit:6,...stored};
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
  return `<span class="meta-source">${escapeHTML(article.source)}</span><span class="meta-dot"></span><time datetime="${article.date}">${article.date.slice(5).replace("-", ".")}</time>`;
}
function saveButton(article, className = "") {
  if (!state.session) return "";
  const saved = state.saved.includes(article.id);
  return `<button class="bookmark-button ${className} ${saved ? "saved" : ""}" data-save="${article.id}" aria-label="${saved ? "스크랩 취소" : "기사 스크랩"}: ${escapeHTML(article.title)}" aria-pressed="${saved}">${icon("bookmark")}</button>`;
}
function articleRow(article) {
  return `<article class="article-row ${state.session ? "has-bookmark" : ""}" data-article-row="${article.id}">
    <h3><button class="article-open" data-article="${article.id}">${escapeHTML(article.title)}</button></h3>
    <p class="article-description">${escapeHTML(article.summary)}</p>
    <div class="article-meta">${articleMeta(article)}</div>
    ${saveButton(article,"row-bookmark")}
  </article>`;
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
function filteredArticles() {
  let articles = reportArticles();
  const query = state.query.trim().toLocaleLowerCase();
  if (query) articles = articles.filter(a => [a.title,a.summary,a.company,a.source,...a.keywords,...a.depts.map(id => departmentById(id).name),...(a.body || [])].join(" ").toLocaleLowerCase().includes(query));
  return [...articles].sort((a,b) => state.sort === "priority" ? b.priority - a.priority || b.date.localeCompare(a.date) || b.time.localeCompare(a.time) : b.date.localeCompare(a.date) || b.time.localeCompare(a.time));
}
function renderFeed() {
  const articles = filteredArticles();
  $("#feed-heading").innerHTML = `기사 <span class="count-label">${articles.length}건</span>`;
  $("#article-list").innerHTML = articles.length ? articles.slice(0,state.limit).map(articleRow).join("") : `<div class="empty-state">${icon("search")}<h3>검색 결과가 없습니다.</h3><p>다른 키워드로 다시 검색해 보세요.</p><button class="outline-button" id="reset-filters">검색 초기화</button></div>`;
  if (!state.reportId) {
    $("#article-list").innerHTML = '<div class="empty-state"><h3>해당 기간의 뉴스가 없습니다.</h3><p>발행 월이나 날짜를 바꿔보세요.</p><button class="outline-button" id="reset-news-archive">전체 기간 보기</button></div>';
  }
  $("#show-more").hidden = state.limit >= articles.length;
  if (!$("#show-more").hidden) $("#show-more").innerHTML = `기사 더 보기 (${Math.min(state.limit,articles.length)}/${articles.length}) ${icon("down")}`;
  const info = $("#active-filter-info");
  info.hidden = !state.query.trim();
  info.textContent = `“${state.query.trim()}” 검색 결과 ${articles.length}건`;
}
function publicationContent(publication) {
  const monthly = publication.kind === "monthly";
  const report = monthly ? monthlyReportById(publication.collectionId) : reportById(publication.collectionId);
  const articles = (monthly ? getMonthlyArticles(report.id) : getReportArticles(report.id)).filter(article => article.depts.includes(publication.departmentId));
  const brief = monthly ? getMonthlyBrief(publication.departmentId, report.id) : getReportBrief(publication.departmentId, report.id);
  return {report, articles, brief};
}
function renderReportDetail() {
  if (!canViewDepartment(state.session, state.briefDepartment)) return;
  const department = departmentById(state.briefDepartment);
  const publication = publicationById(state.publicationId);
  if (!publication) return;
  const {report, articles, brief} = publicationContent(publication);
  $("#department-content").innerHTML = `
    <button class="back-link" data-department="${department.id}">${icon("arrow")} 보고서 목록</button>
    <article class="report-document" aria-labelledby="report-title">
      <header class="report-header">
        <p class="report-meta">${department.name}팀 · ${report.shortName}</p>
        <p class="report-publication"><time datetime="${report.publishedAt}">${report.publishedAt.replaceAll("-", ".")} 발행</time><span>근거 뉴스 ${articles.length}건</span></p>
        <h1 id="report-title">${escapeHTML(brief.title.replace("\n", " "))}</h1>
      </header>
      <section class="report-section report-summary">
        <h2>핵심 요약</h2>
        <ul class="takeaway-list">${brief.takeaways.map((text, index) => `
          <li class="takeaway"><p>${escapeHTML(text)}<sup class="point-sources">${brief.evidence[index].map(id => {
            const number = articles.findIndex(article => article.id === id) + 1;
            return `<a href="#source-${id}" data-source="${id}" aria-label="근거 기사 ${number} 보기">${number}</a>`;
          }).join(",")}</sup></p></li>`).join("")}
        </ul>
      </section>
      <section class="report-section"><h2>주요 인사이트</h2><p>${escapeHTML(brief.insight)}</p></section>
      <section class="report-section"><h2>분석 레포트</h2><p>${escapeHTML(brief.action)}</p></section>
      <section class="report-section report-sources">
        <h2>뉴스 출처</h2>
        <ol class="source-list">${articles.map((article, index) => `
          <li class="source-row" id="source-${article.id}">
            <a class="source-title source-entry" href="#article-${article.id}" data-article="${article.id}"><span class="source-index">[${index + 1}]</span><span class="source-label">${escapeHTML(article.title)}</span><span class="source-meta"> (${escapeHTML(article.source)}, ${article.date.slice(5).replace("-", ".")})</span></a>
          </li>`).join("")}
        </ol>
        <p class="source-note">과제용 샘플 기사입니다.</p>
      </section>
    </article>`;
}
function filteredReports(kind = state.view === "news" ? "period" : state.archiveKind) {
  if (state.archiveFrom && state.archiveTo && state.archiveFrom > state.archiveTo) return [];
  const reports = kind === "monthly" ? MONTHLY_REPORTS : REPORTS;
  return reports.filter(report =>
    (!state.archiveMonth || (report.month || report.publishedAt).startsWith(state.archiveMonth)) &&
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
  const collectionSelect = state.view === "news" ? `<label class="collection-select-label">뉴스 회차<select id="collection-select" ${reports.length ? "" : "disabled"}>${reports.length ? reports.map(report => `<option value="${report.id}" ${state.reportId === report.id ? "selected" : ""}>${report.shortName} · ${report.publishedAt}</option>`).join("") : '<option>해당 기간의 회차 없음</option>'}</select></label>` : "";
  const kindSelector = state.view === "news" ? "" : `<div class="report-kind-switch" role="group" aria-label="보고서 유형">
    <button data-report-kind="period" aria-pressed="${state.archiveKind === "period"}">회차별</button>
    <button data-report-kind="monthly" aria-pressed="${state.archiveKind === "monthly"}">월간</button>
  </div>`;
  $("#report-selector").innerHTML = `${kindSelector}${collectionSelect}
    <details id="archive-drawer" ${state.archiveOpen ? "open" : ""}>
    <summary>${state.archiveKind === "monthly" && state.view !== "news" ? "보고 월·날짜 선택" : "지난 보고서 찾기"}${state.archiveMonth || state.archiveFrom || state.archiveTo ? '<span>필터 적용</span>' : ""}${icon("down")}</summary>
    <div class="archive-filter-heading"><button class="text-button" id="reset-archive">전체 기간</button></div>
    <div class="archive-filter-fields">
      <label>${state.archiveKind === "monthly" && state.view !== "news" ? "보고 월" : "발행 월"}<select id="archive-month"><option value="">전체 월</option>${months.map(month => `<option value="${month}" ${state.archiveMonth === month ? "selected" : ""}>${month.replace("-", "년 ")}월</option>`).join("")}</select></label>
      <label>발행 시작일<input id="archive-from" type="date" value="${state.archiveFrom}" aria-invalid="${Boolean(invalidRange)}"></label>
      <label>발행 종료일<input id="archive-to" type="date" value="${state.archiveTo}" aria-invalid="${Boolean(invalidRange)}"></label>
    </div>
    ${invalidRange ? '<p class="archive-error" role="status">종료일을 시작일 이후로 설정해 주세요.</p>' : ""}
    </details>`;
}
function updateArchiveFilter(key, value) {
  state.archiveOpen = $("#archive-drawer")?.open === true;
  state[key] = value;
  const reports = filteredReports("period");
  if (!reports.some(report => report.id === state.reportId)) state.reportId = reports[0]?.id || null;
  state.limit = 6;
  renderAll();
}
function renderOverview(){
  $("#directory-team-count").textContent = `${allowedDepartments().length}개 팀`;
  const sorted=allowedDepartments().sort((a,b)=>Number(state.interests.includes(b.id))-Number(state.interests.includes(a.id)));
  $("#department-overview").innerHTML=sorted.map(d=>`<button class="department-choice" data-department="${d.id}" aria-label="${d.name} 보고서 목록"><span class="directory-icon" style="--dept-bg:${d.bg};--dept-text:${d.text}">${icon(d.icon)}</span><span class="directory-name">${d.name}</span><span class="directory-count">보고서 ${departmentPublications(d.id).filter(publication => publication.kind === state.archiveKind && filteredReports().some(report => report.id === publication.collectionId)).length}개</span>${icon("chevron","directory-arrow")}</button>`).join("");
}
function renderDepartmentList() {
  if (!canViewDepartment(state.session, state.briefDepartment)) return;
  const department = departmentById(state.briefDepartment);
  const reportIds = filteredReports().map(report => report.id);
  const publications = departmentPublications(department.id).filter(publication => publication.kind === state.archiveKind && reportIds.includes(publication.collectionId));
  $("#department-report-list").innerHTML = `
    ${state.session.role === "admin" ? `<button class="back-link" data-view="today">${icon("arrow")} 전체 팀</button>` : ""}
    <p class="archive-count">보고서 ${publications.length}개</p>
    <div class="publication-list">${publications.map(publication => {
      const {report: collection, articles} = publicationContent(publication);
      const count = articles.length;
      return `<button class="publication-item" data-publication="${publication.id}">

        <span class="publication-copy"><strong>${publication.title}</strong>
          <span class="publication-date">${publication.publishedAt.replaceAll("-", ".")} 발행 · 근거 뉴스 ${count}건</span>
        </span>${icon("chevron", "publication-arrow")}</button>`;
    }).join("") || '<div class="empty-state"><h3>해당 기간의 보고서가 없습니다.</h3><p>발행 월이나 날짜를 바꿔보세요.</p><button class="outline-button" id="reset-archive-empty">전체 기간 보기</button></div>'}</div>
    `;
}
function openPublication(id,scroll=true,replace=false){
  const publication=publicationById(id);
  if(!publication||!DEPARTMENTS.some(dept=>dept.id===publication.departmentId)||![...REPORTS,...MONTHLY_REPORTS].some(report=>report.id===publication.collectionId)){
    navigate("today",null,scroll,replace);toast("보고서를 찾을 수 없습니다.","info");return;
  }
  if (!requireDepartment(publication.departmentId)) return;
  state.publicationId = publication.id;
  state.archiveKind = publication.kind;
  if (publication.kind === "period") state.reportId = publication.collectionId;
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
function renderNewsResearch() {
  const { outlets, reports, coverageLabels } = NEWS_RESEARCH;
  const coverages = Object.keys(coverageLabels);
  const tally = issues => coverages.map(coverage => issues.filter(issue => issue.coverage === coverage).length);
  const isBaseline = issue => issue.sources.some(source => outlets[source.outlet].baseline);
  const counts = issues => tally(issues).join(" / ");
  const allIssues = reports.flatMap(report => report.issues);
  const deduplicate = issues => [...new Map(issues.map(issue => [issue.event || issue.title, issue])).values()];
  const baselineIssues = allIssues.filter(isBaseline);
  const uniqueIssues = deduplicate(allIssues);
  const uniqueBaseline = deduplicate(baselineIssues);
  const added = uniqueIssues.length - uniqueBaseline.length;
  const publishers = Object.values(outlets);
  const publisherGroup = (heading, baseline) => {
    const group = publishers.filter(outlet => outlet.baseline === baseline);
    return `<section class="research-publisher-group"><h3>${heading} <span>${group.length}곳</span></h3><ul>${group.map(({ name, type, homepage }) => `<li><a href="${escapeHTML(homepage)}" target="_blank" rel="noopener noreferrer"><strong>${escapeHTML(name)}</strong><span>${escapeHTML(type)} ↗</span></a></li>`).join("")}</ul></section>`;
  };
  const compareRow = ({ date, period, issues }) => `<tr><th scope="row">${escapeHTML(date)}<small>${escapeHTML(period)}</small></th><td>${counts(issues.filter(isBaseline))}</td><td>${counts(issues)}</td><td class="research-delta">+${issues.filter(issue => !isBaseline(issue)).length}</td></tr>`;
  const issueRow = issue => {
    const sources = issue.sources.map(({ outlet, date, url }) => `<a href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(outlets[outlet].name)} ${escapeHTML(date.slice(5).replace("-", "/"))} ↗</a>`).join("");
    const departments = issue.departments.map(id => departmentById(id).name).join(" · ");
    return `<li><span class="research-coverage">${escapeHTML(coverageLabels[issue.coverage])}${isBaseline(issue) ? "" : " · 추가 발견"}</span><h4>${escapeHTML(issue.title)}</h4><p>${escapeHTML(departments)}${issue.relevance ? ` — ${escapeHTML(issue.relevance)}` : ""}</p><div class="research-links">${sources}</div></li>`;
  };

  $("#research-panel").innerHTML = `
    <div class="research-intro"><h2>참고 뉴스 매체 ${publishers.length}곳</h2><p>생명보험과 손해보험을 함께 살펴본 출처입니다. 과제용 조사에 참고했으며 자동 수집은 미연동 상태입니다.</p></div>
    <div class="research-publishers">${publisherGroup("우선 참고", true)}${publisherGroup("비교·확장 후보", false)}</div>
    <details class="research-comparison">
    <summary>2주간 기사 비교 결과</summary>
    <div class="research-comparison-content">
    <p class="research-note">2026년 10월 29일–11월 11일 · 월·목 보고서 4회분</p>
    <p class="research-result"><strong>${uniqueBaseline.length}건 → ${uniqueIssues.length}건</strong><span>2주 전체 고유 이슈 +${added}건</span></p>
    <table class="research-table">
      <caption>회차별 고유 이슈 수 <span>생보 / 손보 / 공통 순</span></caption>
      <thead><tr><th scope="col">보고일</th><th scope="col">5곳</th><th scope="col">10곳</th><th scope="col">추가</th></tr></thead>
      <tbody>${reports.map(compareRow).join("")}</tbody>
      <tfoot><tr><th scope="row">2주 고유</th><td>${counts(uniqueBaseline)}</td><td>${counts(uniqueIssues)}</td><td class="research-delta">+${added}</td></tr></tfoot>
    </table>
    <p class="research-note">10개 매체의 공개 기사 검색 표본입니다. 국내 보험사·감독 이슈와 국내 상품에 참고할 해외 보도를 포함했습니다. 같은 사건은 회차별로 한 건으로 묶고, 생·손보 공통은 공통에 한 번만 셌습니다. 2주 고유 수에는 다른 회차에 재보도된 이슈도 한 번만 들어갑니다.</p>
    <p class="research-note"><strong>운영 후보</strong> 기본 5곳을 유지하고, 손보 상품과 보상 이슈가 필요하면 매일경제와 한국경제를 먼저 검토할 만합니다. 이 표본에서 2주 전체에 새로 더해진 이슈는 두 매체에서 확인됐습니다.</p>
    <section class="research-evidence" aria-labelledby="research-evidence-title"><h3 id="research-evidence-title">회차별 이슈와 관련 부서</h3>
      ${reports.map(report => `<details><summary><span>${escapeHTML(report.date)} 보고 <small>${escapeHTML(report.period)}</small></span><span class="research-delta">+${report.issues.filter(issue => !isBaseline(issue)).length}건</span></summary><ul>${report.issues.slice().sort((a,b) => Number(isBaseline(a)) - Number(isBaseline(b))).map(issueRow).join("")}</ul></details>`).join("")}
    </section>
    <p class="research-note">같은 회차의 우선 참고 매체 5곳에서 확인되지 않은 이슈는 ‘추가 발견’으로 표시했습니다.</p>
    </div></details>`;
}

function renderHeading() {
  const title = {
    today: "팀별 보고서",
    news: "전체 뉴스",
    departments: `${departmentById(state.briefDepartment).name}팀 보고서`,
    report: "요약 보고서",
    saved: "나의 스크랩",
    process: "서비스 소개"
  }[state.view];
  $(".page-heading").hidden = state.view === "report";
  $("#page-title").textContent = title;
  $("#breadcrumb-current").textContent = title;
  document.title = `${title} — 교보 뉴스브리핑`;
}
function renderImplementationNote() {
  document.body.classList.toggle("presentation-mode", PRESENTATION_MODE);
  $("#implementation-note").hidden = !PRESENTATION_MODE;
  if (!PRESENTATION_MODE) return;
  const notes = {
    today: {code:"팀 선택·열람 범위·보고서 목록", jev:"기사의 관련 부서 판단", llm:"부서별 보고서 작성"},
    departments: {code:"팀별 조회·월간/회차·날짜 필터", jev:"기사의 관련 부서 판단", llm:"보고서 제목·요약 작성"},
    news: {code:"기사 조회·검색·정렬", jev:"보험업 관련성·보고 가치·관련 부서 판단", llm:"기사 한줄 요약"},
    report: {code:"기간 집계·근거 기사 연결", jev:"보고서에 넣을 기사 선별·부서 분류", llm:"핵심 요약·인사이트·분석 레포트"},
    saved: {code:"스크랩 저장·검색·내보내기", jev:"저장 화면에서는 호출하지 않음", llm:"저장 화면에서는 호출하지 않음"},
    process: {code:"수집·화면·저장·권한 처리", jev:"보험 관련성·보고 가치·부서 판단", llm:"선정 기사 요약·업무 시사점 작성"}
  };
  const note = notes[state.view];
  const live = state.view === "process" && state.processTab === "operations";
  const research = state.view === "process" && state.processTab === "news";
  const explanation = live
    ? "실제 서버의 연결 상태를 표시합니다. Jev·LLM은 서버 API 설정 후 관리자 실행에서 호출합니다."
    : research
      ? "뉴스 매체 비교는 공개 기사를 직접 조사한 표본입니다. Jev·LLM 자동 수집 결과가 아닙니다."
      : "현재 일반 뉴스·팀 보고서는 샘플입니다. Jev·LLM 판단·요약은 작성한 예시이며 이 화면에서 모델을 호출하지 않습니다.";
  $("#implementation-note").innerHTML = `<details>
    <summary><span>발표용</span><span class="implementation-tag">코딩</span><span class="implementation-tag jev-tag">Jev</span><span class="implementation-tag llm-tag">LLM</span>${icon("down")}</summary>
    <div><p><strong>코딩</strong> ${note.code}</p><p><strong>Jev</strong> ${note.jev}</p><p><strong>LLM</strong> ${note.llm}</p><p class="implementation-fixture">${explanation}</p></div>
  </details>`;
}
function renderAll() {
  renderHeading(); renderSidebar(); renderReportSelector(); renderOverview(); renderImplementationNote();
  $$("main>.view").forEach(el => el.hidden = el.id !== `${state.view}-view`);
  renderFeed(); renderSaved();
  if(state.view==="departments") renderDepartmentList(); else $("#department-report-list").innerHTML="";
  if(state.view==="report") renderReportDetail(); else $("#department-content").innerHTML="";
  const showResearch = state.view === "process" && state.processTab === "news";
  const showOperations = state.view === "process" && state.processTab === "operations";
  $("#overview-panel").hidden = showResearch || showOperations;
  $("#research-panel").hidden = !showResearch;
  $("#operations-panel").hidden = !showOperations;
  $(".ops-live-entry").hidden = showOperations;
  if (showOperations) renderOperations();
  $("#overview-tab").setAttribute("aria-current", showResearch || showOperations ? "false" : "page");
  $("#research-tab").setAttribute("aria-current", showResearch ? "page" : "false");
  $("#operations-tab").setAttribute("aria-current", showOperations ? "page" : "false");
}

function navigate(view,department,scroll=true,replace=false,processTab="overview"){
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
  state.processTab=processTab;
  if(view!=="report") state.publicationId=null;
  const route=view==="departments"?`department/${state.briefDepartment}`:view==="report"?`report/${state.publicationId}`:view==="process"&&["news","operations"].includes(processTab)?`process/${processTab}`:view;
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
  $("#article-detail").innerHTML = `
    <div class="article-dialog-top"><span class="implementation-inline">발표용 · 코딩</span><button class="icon-button" data-close="article-dialog" aria-label="기사 닫기">${icon("close")}</button></div>
    <div class="article-detail-body">
      <p class="article-fixture-note">과제용 샘플 기사</p>
      <h2 id="article-dialog-title">${escapeHTML(article.title)}</h2>
      <div class="article-meta">${articleMeta(article)}</div>
      <div class="detail-content">${body.map(paragraph => `<p>${escapeHTML(paragraph)}</p>`).join("")}</div>
      <details class="classification-box"><summary>관련 팀과 분류 근거</summary><p>${escapeHTML(article.reason)}</p><div class="article-tags">${article.depts.map(tag).join("")}</div></details>
    </div>
    <div class="article-dialog-actions">
      <button class="outline-button ${saved ? "saved" : ""}" data-save="${id}" aria-pressed="${saved}" aria-label="${saved ? "스크랩 취소" : "기사 스크랩"}: ${escapeHTML(article.title)}">${icon("bookmark")}<span class="save-label">${saved ? "스크랩 완료" : "기사 스크랩"}</span></button>
      <button class="text-button" data-article-brief="${article.depts[0]}">팀 보고서 보기 ${icon("arrow")}</button>
    </div>`;
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
  const action = event.target.closest("button, a[data-article], a[data-source]");
  if (!action) return;
  if (action.tagName === "A") event.preventDefault();
  if (action.dataset.reportKind) {
    state.archiveKind = action.dataset.reportKind;
    state.archiveMonth = "";
    state.archiveFrom = "";
    state.archiveTo = "";
    renderAll();
    return;
  }
  if (action.dataset.loginTeam) { setSession({role:"team", departmentId:action.dataset.loginTeam}); return; }
  if (action.dataset.save) {toggleSaved(action.dataset.save); return;}
  if (action.dataset.article) {openArticle(action.dataset.article); return;}
  if (action.dataset.close) {document.getElementById(action.dataset.close).close(); return;}
  if (action.dataset.articleBrief) { const article=ARTICLE_SAMPLES.find(a=>a.id===activeArticleId); if(article) state.reportId=REPORTS.find(report=>report.dates.includes(article.date))?.id||state.reportId; $("#article-dialog").close(); openDepartmentReport(action.dataset.articleBrief); return;}
  if (action.dataset.view) {navigate(action.dataset.view); return;}
  if (action.dataset.department) {navigate("departments",action.dataset.department); return;}
  if (action.dataset.publication) {openPublication(action.dataset.publication); return;}
  if (action.dataset.brief) {openDepartmentReport(action.dataset.brief); return;}
  if (action.dataset.source) {const source=document.getElementById(`source-${action.dataset.source}`);if(source){source.scrollIntoView({behavior:"smooth",block:"center"});$(".source-title",source).focus({preventScroll:true});}return;}
  if (action.dataset.report) {setReport(action.dataset.report); return;}
  if (action.classList.contains("settings-trigger")) {openSettings(); return;}
  switch(action.id) {
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
    case "collection-done": $("#collection-dialog").close(); state.query=""; state.limit=6; $("#news-search").value=""; navigate("today"); toast("수집·분류·분석이 완료된 부서별 요약을 확인하세요."); break;
    case "show-more": state.limit+=6; renderFeed(); break;
    case "export-saved": exportSaved(); break;
    case "reset-filters": state.query=""; state.limit=6; $("#news-search").value=""; renderFeed();$("#news-search").focus();break;
  }
});
document.addEventListener("change", event => {
  const keys = {"archive-month":"archiveMonth", "archive-from":"archiveFrom", "archive-to":"archiveTo"};
  if (keys[event.target.id]) updateArchiveFilter(keys[event.target.id], event.target.value);
  if (event.target.id === "collection-select") setReport(event.target.value);
});
document.addEventListener("toggle", event => {
  if (event.target.id === "archive-drawer" && event.target.isConnected) state.archiveOpen = event.target.open;
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
  if(hash==="process/news"){navigate("process",null,false,true,"news");return;}
  if(hash==="process/operations"){navigate("process",null,false,true,"operations");return;}
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
renderNewsResearch();
readHash();

