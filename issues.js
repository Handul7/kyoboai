/* The sample desk and authorized live issues intentionally use separate data paths. */
(() => {
  "use strict";
  const sample = [
    {
      id:"rates-sample", kind:"가상 시나리오", title:"기준금리 인하와 해약환급금 규제 변경", urgent:true,
      lead:"product", support:["asset","risk"],
      actions:{product:"예정이율·해약환급금 조정이 필요한 상품을 가려냅니다.",asset:"새 금리 가정으로 자산·부채 듀레이션 갭을 점검합니다.",risk:"해약률과 지급여력(K-ICS)의 변화를 시나리오별로 분석합니다."},
      joint:"상품개발이 조정안을 만들고, 자산운용과 리스크관리가 같은 금리·해약률 가정으로 영향을 비교합니다.",
      evidence:"가상 상황: 해약환급금 산정 기준 변경이 다음 영업일부터 적용되고, 기준금리도 인하됐다.",
      signals:"보험업 0.98 · 주관 상품개발 0.81 · 협조 자산운용 0.94 / 리스크관리 0.91 · 보고 가치 2.80 / 3 · 긴급 0.90"
    },
    {
      id:"fraud-reference", kind:"공개 기사 · 수동 배분 예시", title:"보험사기 가담 모집인·손해사정사 제재", urgent:false,
      source:"뉴시스 · 2026.10.29", url:"https://www.newsis.com/view/NISX20261029_0003846175",
      lead:"risk", support:["sales"],
      actions:{risk:"제재 사례를 바탕으로 부정 청구와 모집인 내부통제 항목을 점검합니다.",sales:"모집인 교육과 현장 점검에 추가할 사례를 정리합니다."},
      joint:"리스크관리팀이 사고 유형을 정리하면 영업마케팅팀이 현장 교육과 점검표에 반영합니다.",
      evidence:"보험 가입 과정에서 고지의무를 위반하거나 타인의 서명을 위조한 사례도 제재 대상에 포함됐다."
    }
  ];
  const $ = (selector, root = document) => root.querySelector(selector);
  const esc = value => String(value ?? "").replace(/[&<>"']/g,s=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[s]);
  const team = id => DEPARTMENTS.find(d=>d.id===id)?.name || "미지정";
  const teamOptions = selected => DEPARTMENTS.map(d=>`<option value="${esc(d.id)}" ${d.id===selected?"selected":""}>${esc(d.name)}</option>`).join("");
  const safeLink = value => {try{const u=new URL(value);return u.protocol==="https:"&&!u.username&&!u.password?u.href:null;}catch{return null;}};
  const selectedIssues = new Map();
  function pickedSample(issue) {
    try {const v=JSON.parse(localStorage.getItem(`kyobo-issue-feedback:${issue.id}`));if(v?.lead&&DEPARTMENTS.some(d=>d.id===v.lead)&&typeof v.note==="string")return v;} catch {}
    return null;
  }
  function card(issue,live=false) {
    selectedIssues.set(issue.id,issue);
    const url=safeLink(issue.url), note=live?null:pickedSample(issue);
    const status=issue.feedbackPending?"정정 검토 중":issue.reviewed?"관리자 검토 완료":live?"Jev 배분 후보":issue.kind;
    const roleRows=[[issue.lead,"주관"],...issue.support.map(d=>[d,"협조"])];
    return `<article class="issue-card">
      <div class="issue-meta"><span>${esc(status)}</span>${issue.source?`<span>${esc(issue.source)}</span>`:""}</div>
      <h3>${esc(issue.title)}</h3>
      <p class="issue-at-a-glance"><strong>주관</strong> ${esc(team(issue.lead))}<span><strong>협조</strong> ${esc(issue.support.length?issue.support.map(team).join(" · "):"없음")}</span></p>
      <details class="issue-response"><summary>대응 포인트와 근거</summary>
        <dl>${roleRows.map(([id,role])=>`<div><dt>${role} · ${esc(team(id))}</dt><dd>${esc(issue.actions[id])}</dd></div>`).join("")}</dl>
        ${issue.joint?`<p class="issue-joint"><strong>공동 대응</strong> ${esc(issue.joint)}</p>`:""}
        ${issue.evidence?`<details class="issue-evidence"><summary>${live||url?"근거 문장 보기":"가상 근거 보기"}</summary><blockquote><mark>${esc(issue.evidence)}</mark></blockquote></details>`:""}
        ${url?`<a class="text-button issue-source" href="${esc(url)}" target="_blank" rel="noopener noreferrer">원문 열기 ↗</a>`:""}
        ${issue.signals?`<p class="issue-caption">가상 Jev 출력: ${esc(issue.signals)}</p>`:""}
        ${live&&issue.feedbackPending?'<p class="issue-caption">관리자 검토를 기다리고 있습니다.</p>':`<details class="issue-feedback"><summary>오분류 신고${live?"":" 체험"}</summary>
          <form data-issue-feedback="${esc(issue.id)}" data-live="${live}">
            <label>제안 주관팀<select name="lead" required>${teamOptions(note?.lead||issue.lead)}</select></label>
            <label>수정 이유<textarea name="note" rows="2" minlength="5" maxlength="400" required>${esc(note?.note||"")}</textarea></label>
            <button class="outline-button" type="submit">${live?"검토 요청":"체험 신고 저장"}</button>
            <p class="issue-caption" role="status">${note?"이 브라우저에 저장했습니다. 실제 검토함으로 전송되지 않습니다.":""}</p>
          </form></details>`}
      </details>
    </article>`;
  }
  function lane(title,description,issues,live) {
    return `<section class="issue-lane"><h3>${esc(title)}</h3><p class="issue-caption">${esc(description)}</p>${issues.map(i=>card(i,live)).join("")}</section>`;
  }
  window.bootIssueDesk = async () => {
    const root=$("#issue-desk");
    root.innerHTML=`<div class="issue-intro"><span class="issue-kicker">과제 1 · 뉴스 운영</span><h2>보험 이슈와 팀 대응</h2><p>기사마다 주관팀 한 곳과 협조팀을 확인하세요.</p><a href="#process">과제 2 · 작동 방식과 Jev 판단 기준 →</a></div>
    <div id="issue-live" aria-live="polite"><p class="issue-caption">실제 수집 상태 확인 중…</p></div>
      <section class="issue-examples" aria-labelledby="issue-examples-title"><h3 id="issue-examples-title">배분 예시</h3>
      <p class="issue-caption">가상 시나리오와 공개 기사에 수동 배분한 예시입니다.</p>
      ${lane("긴급 검토 예시","정기 브리핑 전에 확인이 필요한 이슈",sample.filter(x=>x.urgent),false)}
      ${lane("정기 브리핑 예시","월·목 브리핑에서 검토할 이슈",sample.filter(x=>!x.urgent),false)}</section>`;
    await refreshLiveIssues();
  };
  async function refreshLiveIssues() {
    const live=$("#issue-live");
    if(!live)return;
    const api=async path=>{const response=await fetch(path,{headers:{Accept:"application/json"},credentials:"same-origin",signal:AbortSignal.timeout(8000)});if(!response.ok)throw Error();return response.json();};
    const [status,assigned]=await Promise.allSettled([api("/api/status"),api("/api/issues")]);
    const checks=status.value?.checks||[];
    const ready=id=>checks.some(c=>c.id===id&&c.ready);
    const issues=assigned.value?.issues||[];
    if(issues.length){
      live.innerHTML=`<h3>실제 수집 이슈</h3>${issues.some(i=>i.urgent)?lane("긴급 검토 후보","화면에서 표시합니다. 외부 알림은 보내지 않습니다.",issues.filter(i=>i.urgent),true):""}${issues.some(i=>!i.urgent)?lane("정기 검토 후보","최근 수집·배분 기사",issues.filter(i=>!i.urgent),true):""}`;
    } else {
      const configured=ready("sources")&&ready("jev");
      const label=status.status!=="fulfilled"?"실제 수집 상태를 확인할 수 없습니다.":configured?"기사 수집과 부서 배분을 실행하면 등록된 계정으로 이슈를 확인할 수 있습니다.":"실제 수집 준비 중 · 매체 승인과 Jev 연결이 필요합니다.";
      live.innerHTML=`<p class="issue-state">${esc(label)} <a href="#process/operations">연동 상태·운영 로그인</a></p>`;
    }
  }
  window.refreshLiveIssues=refreshLiveIssues;
  document.addEventListener("submit",async event=>{
    const form=event.target;if(!form.matches("[data-issue-feedback]"))return;
    event.preventDefault();
    const issue=selectedIssues.get(form.dataset.issueFeedback), output=$("[role=status]",form), button=$("button[type=submit]",form);
    if(!issue||button.disabled)return;
    const data=new FormData(form),lead=String(data.get("lead")),note=String(data.get("note")).trim();
    if(note.length<5){output.textContent="수정 이유를 5자 이상 적어 주세요.";return;}
    button.disabled=true;
    try {
      if(form.dataset.live==="true"){
        const response=await fetch(`/api/issues/${encodeURIComponent(issue.id)}/feedback`,{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({leadDepartmentId:lead,note}),signal:AbortSignal.timeout(10000)});
        const result=await response.json();if(!response.ok)throw Error(result.error||"신고를 저장하지 못했습니다.");
        output.textContent="관리자 검토를 요청했습니다.";return;
      }
      localStorage.setItem(`kyobo-issue-feedback:${issue.id}`,JSON.stringify({lead,note}));
      output.textContent="이 브라우저에 저장했습니다. 실제 검토함으로 전송되지 않습니다.";
    } catch(error){output.textContent=form.dataset.live==="true"?(error.message||"다시 시도해 주세요."):"브라우저에 저장하지 못했습니다.";}
    button.disabled=false;
  });
})();
