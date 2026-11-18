(function issueReports(){
  "use strict";
  const el=s=>document.querySelector(s);
  const escape=v=>String(v??"").replace(/[<>&"']/g,c=>({"<":"&lt;",">":"&gt;","&":"&amp;",'"':"&quot;","'":"&#39;"}[c]));
  const name=id=>(DEPARTMENTS.find(d=>d.id===id)?.name||id)+"팀";
  const isSample=d=>d.id.startsWith("sample-");
  const dayLabel=date=>new Intl.DateTimeFormat("ko-KR",{month:"long",day:"numeric",weekday:"short",timeZone:"Asia/Seoul"}).format(new Date(date+"T00:00:00+09:00"));
  const issueDate=d=>d.dates[0]?dayLabel(d.dates[0]):"직접 입력";
  const sampleById=new Map(ISSUE_EXAMPLES.map(d=>[d.id,d]));
  let live=[],role="guest",myDept=null,selectedDate="",dateChosen=false,readToken=0,loadToken=0,current=null,returnRoute="#news",available=null;
  const sampleTeam=()=>state.session?.role==="team"?state.session.departmentId:state.session?.role==="admin"&&returnRoute.startsWith("#department/")?state.briefDepartment:null;
  async function api(path,body){
    const response=await fetch(path,{method:body?"POST":"GET",headers:body?{"Content-Type":"application/json"}:{Accept:"application/json"},credentials:"same-origin",cache:"no-store",signal:AbortSignal.timeout(body?180000:20000),...(body?{body:JSON.stringify(body)}:{})});
    const data=await response.json();
    if(!response.ok)throw Error(data.error||"요청을 완료하지 못했습니다.");
    return data;
  }
  function normalize(value){
    try{const u=new URL(value);if(u.protocol!=="https:"||u.username||u.password)return "";u.hash="";for(const key of [...u.searchParams.keys()])if(/^utm_|^(fbclid|gclid)$/i.test(key))u.searchParams.delete(key);return u.href;}catch{return "";}
  }
  function sections(d,teamId){
    const own=d.teams.find(t=>t.id===teamId), teamLabel=t=>(t.role==="lead"?"주관":"협조")+" · "+name(t.id);
    const focus=t=>["우리 팀이 봐야 하는 이유  ·  "+t.why,"확인할 일  ·  "+t.check];
    const result=[];
    if(own)result.push({title:teamLabel(own),lines:focus(own),focus:true});
    result.push({title:"핵심 요약",lines:[d.summary]},{title:"배경과 변화",lines:[d.background]},{title:"보험사에 미치는 영향",lines:[d.impact]},{title:"추가로 확인할 점",lines:[d.uncertainty]});
    for(const t of d.teams)if(t!==own)result.push({title:teamLabel(t),lines:[t.why,"확인할 일  ·  "+t.check]});
    return result;
  }
  function row(d,teamId){
    const t=d.teams.find(x=>x.id===teamId);
    const lead=d.teams.find(x=>x.role==="lead");
    return `<a class="dossier-row" href="#issue/${escape(d.id)}"><span class="dossier-row-text"><strong>${escape(d.title)}</strong><span>${escape(t?t.why:d.summary)}</span>${t?`<span class="our-check">확인할 일 · ${escape(t.check)}</span>`:""}<small>${escape(t?(t.role==="lead"?"우리 팀 주관":"우리 팀 협조"):`주관 · ${name(lead.id)}`)} · 근거 ${d.sources?.length??d.sourceCount}건</small></span><span aria-hidden="true">›</span></a>`;
  }
  function teamDossiers(id){
    const inRange=d=>(!d.dates.length&&!state.archiveMonth&&!state.archiveFrom&&!state.archiveTo)||d.dates.some(date=>(!state.archiveMonth||date.startsWith(state.archiveMonth))&&(!state.archiveFrom||date>=state.archiveFrom)&&(!state.archiveTo||date<=state.archiveTo));
    return [...live.filter(d=>d.status==="published"&&(role==="admin"||id===myDept)),...ISSUE_EXAMPLES].filter(d=>d.teams.some(t=>t.id===id)&&inRange(d));
  }
  window.teamDossierCount=id=>teamDossiers(id).length;
  function showLists(){
    const published=live.filter(d=>d.status==="published");
    const dates=[...new Set([...published,...ISSUE_EXAMPLES].flatMap(d=>d.dates))].sort().reverse();
    if(!dateChosen||!dates.includes(selectedDate))selectedDate=published.flatMap(d=>d.dates).sort().at(-1)||dates[0];
    const active=published.filter(d=>d.dates.includes(selectedDate)).sort((a,b)=>b.priority-a.priority);
    const items=active.length?active:ISSUE_EXAMPLES.filter(d=>d.dates.includes(selectedDate));
    const list=el("#briefing-picks");
    if(list)list.innerHTML=`<div class="dossier-list-head"><h2>월·목 브리핑</h2><label><span class="sr-only">브리핑 회차</span><select id="dossier-date">${dates.map(date=>`<option value="${date}" ${date===selectedDate?"selected":""}>${dayLabel(date)}</option>`).join("")}</select></label></div><p class="briefing-meta"><span class="dossier-caption">${active.length?"발행한 보고서":"공개 기사로 작성한 과제 예시"} · 주요 이슈 ${items.length}건</span><button type="button" class="text-button" id="jump-to-input">기사 직접 입력 ↓</button></p><div class="dossier-list">${items.slice(0,5).map(d=>row(d,myDept)).join("")}${items.length>5?`<details><summary>나머지 이슈 ${items.length-5}건</summary>${items.slice(5).map(d=>row(d,myDept)).join("")}</details>`:""}</div>`;
    const teamList=el("#dossier-teams");
    if(teamList){
      const id=state.briefDepartment;
      const assigned=state.view==="departments"&&canViewDepartment(state.session,id)?teamDossiers(id):[];
      teamList.innerHTML=assigned.length?`<h2>우리 팀이 볼 이슈</h2>${assigned.map(d=>`<p class="dossier-caption">${issueDate(d)} · ${isSample(d)?"과제 예시":"발행본"}</p>${row(d,id)}`).join("")}`:"<p class='dossier-caption'>이 기간에 우리 팀에 배분된 이슈가 없습니다.</p>";
    }
    const drafts=el("#dossier-drafts"),pending=live.filter(d=>d.status==="draft");
    if(drafts)drafts.innerHTML=role==="admin"&&pending.length?`<details><summary>발행 대기 중인 이슈 ${pending.length}건</summary>${pending.map(d=>row(d)).join("")}</details>`:"";
    const tip=el("#input-scope");if(tip)tip.textContent=role==="admin"?"승인된 기사 주소를 입력하면 관련 보도를 찾아 검수용 초안을 만듭니다.":"과제 예시에 수록한 기사 주소나 이슈 제목으로 체험할 수 있습니다. 새 기사 수집은 운영 관리자에게 열립니다.";
    const liveTeam=el("#live-team-dossiers");
    if(liveTeam)liveTeam.innerHTML=myDept&&published.length?`<details><summary>${escape(name(myDept))} 발행 보고서</summary>${published.map(d=>row(d,myDept)).join("")}</details>`:"";
  }
  window.renderDossierLists=showLists;
  window.refreshDossiers=async()=>{
    const token=++loadToken;
    try{const data=await api("/api/dossiers");if(token!==loadToken)return;live=data.reports;role=data.viewer;myDept=data.departmentId;available=true;}
    catch{if(token!==loadToken)return;live=[];role="guest";myDept=null;available=false;}
    showLists();if(state.view==="today")renderOverview();
  };
  function meta(d){
    return (isSample(d)?"과제 예시":d.status==="draft"?"검수용 초안":"발행본")+" · "+(d.dates.length?d.dates.map(dayLabel).join(", ")+" 브리핑":"직접 입력")+" · 근거 "+d.sources.length+"건";
  }
  window.renderDossierDetail=async id=>{
    const token=++readToken,root=el("#dossier-detail");
    current=null;root.innerHTML='<p role="status">이슈 보고서를 여는 중입니다.</p>';
    try{
      let d=sampleById.get(id),team=sampleTeam();
      if(!d){const result=await api("/api/dossiers/"+encodeURIComponent(id));d=result.report;team=result.departmentId||(role==="admin"&&returnRoute.startsWith("#department/")?state.briefDepartment:null);}
      if(token!==readToken||state.view!=="issue")return;
      const blocks=sections(d,team);current={title:d.title,meta:meta(d),sections:blocks,sources:d.sources};
      document.title=d.title+" — 교보 뉴스브리핑";
      const withRefs=line=>escape(line).replace(/\[(\d+)\]/g,(match,n)=>d.sources[n-1]?`<button type="button" class="dossier-cite" data-cite-index="${n}" aria-label="출처 ${n}번">[${n}]</button>`:match);
      root.innerHTML=`<div class="dossier-tools"><a href="${escape(returnRoute)}">‹ 목록으로</a><button type="button" id="download-issue">PDF 다운로드</button></div>
      <article class="dossier-paper"><header><p class="dossier-caption">${escape(meta(d))}</p><h1>${escape(d.title)}</h1></header>
      ${blocks.map(b=>`<section class="${b.focus?"team-focus":""}"><h2>${escape(b.title)}</h2>${b.lines.map(line=>`<p>${withRefs(line)}</p>`).join("")}</section>`).join("")}
      <section><h2>뉴스 출처</h2><ol class="dossier-notes">${d.sources.map((s,i)=>`<li id="dossier-note-${i+1}"><a href="${escape(normalize(s.url))}" target="_blank" rel="noopener noreferrer">${escape(s.title)}</a> · ${escape(s.source)} · ${escape(s.publishedAt.slice(0,10))}</li>`).join("")}</ol></section>
      ${d.evidence?`<details><summary>배분 근거 문장</summary><p>${escape(d.evidence)}</p></details>`:""}</article>
      ${!isSample(d)&&d.status==="draft"?`<form id="publish-dossier" data-revision="${escape(d.revision)}"><label><input type="checkbox" required> 기사 출처, 팀 배분과 확인 사항을 검수했습니다.</label><button class="outline-button" type="submit">이슈 보고서 발행</button></form>`:""}<p role="status" id="dossier-notice"></p>`;
    }catch(error){if(token===readToken&&state.view==="issue")root.innerHTML=`<p>${escape(error.message||"보고서를 열 수 없습니다.")}</p><a href="#news">브리핑으로 돌아가기</a>`;}
  };
  window.clearDossier=()=>{++readToken;current=null;el("#dossier-detail").replaceChildren();};
  document.addEventListener("change",e=>{if(e.target.id==="dossier-date"){selectedDate=e.target.value;dateChosen=true;showLists();}});
  document.addEventListener("click",async e=>{
    const link=e.target.closest("a[href^='#issue/']");if(link&&state.view!=="issue")returnRoute=location.hash||"#news";
    if(e.target.closest("#jump-to-input")){el(".dossier-input-panel").open=true;el("#seed-input").focus();}
    if(e.target.closest("#try-input")){
      const input=el("#seed-input");input.value=ISSUE_EXAMPLES[0].sources.at(-1).url;el("#dossier-input").dataset.example='true';el("#dossier-input").requestSubmit();
    }
    const cite=e.target.closest("[data-cite-index]");if(cite)el("#dossier-note-"+cite.dataset.citeIndex)?.querySelector("a")?.focus();
    const download=e.target.closest("#download-issue");
    if(download&&current){download.disabled=true;try{await window.downloadIssuePdf(current);}catch{el("#dossier-notice").textContent="PDF를 만들 수 없습니다. 브라우저의 인쇄 메뉴에서 PDF로 저장할 수 있습니다.";}finally{download.disabled=false;}}
  });
  document.addEventListener("submit",async e=>{
    const form=e.target;
    if(form.id==="publish-dossier"){
      e.preventDefault();const button=form.querySelector("button");button.disabled=true;
      const id=state.issueId;
      try{await api("/api/admin/dossiers/"+id+"/publish",{reviewed:true,revision:form.dataset.revision});await window.refreshDossiers();if(state.view==="issue"&&state.issueId===id)await window.renderDossierDetail(id);}
      catch(err){const notice=el("#dossier-notice");if(notice)notice.textContent=err.message;}finally{button.disabled=false;}return;
    }
    if(form.id!=="dossier-input")return;
    e.preventDefault();const input=el("#seed-input").value.trim(),out=el("#input-result"),button=form.querySelector("button[type=submit]");
    if(!input||button.disabled)return;
    const url=normalize(input), needle=input.normalize("NFKC").toLowerCase();
    const matches=ISSUE_EXAMPLES.filter(d=>url?d.sources.some(s=>normalize(s.url)===url):d.title.toLowerCase().includes(needle)||d.sources.some(s=>s.title.toLowerCase().includes(needle)));
    const demoRequested=form.dataset.example==="true";delete form.dataset.example;
    if(!demoRequested&&url&&available===null)await window.refreshDossiers();
    if(matches.length&&(demoRequested||!url||role!=="admin"&&role!=="member")){if(matches.length===1){out.textContent="";returnRoute="#news";location.hash="issue/"+matches[0].id;}else out.innerHTML=matches.map(d=>row(d,null)).join("");return;}
    if(!url){out.textContent="일치하는 예시가 없습니다. 기사 전체 주소를 입력해 주세요.";return;}
    button.disabled=true;out.textContent="기사와 관련 보도를 확인하고 있습니다.";
    try{
      if(role!=="admin"){
        if(available===null)await window.refreshDossiers();
        if(role!=="admin"){
          if(role==="member"){const data=await api("/api/dossiers/lookup?url="+encodeURIComponent(url));if(data.id||matches.length){returnRoute="#news";location.hash="issue/"+(data.id||matches[0].id);out.textContent="";return;}}
          out.innerHTML=(available===false?"운영 서버에 연결할 수 없습니다.":"수록된 예시에 없는 기사입니다. 새 기사 수집에는 승인된 매체와 운영 관리자 로그인이 필요합니다.")+' <a href="#process/operations">연동·로그인 확인</a>';return;
        }
      }
      const result=await api("/api/admin/dossiers",{url});await window.refreshDossiers();returnRoute="#news";out.textContent="";location.hash="issue/"+result.id;
    }catch(error){out.textContent=error.message||"기사 처리에 실패했습니다. 다시 시도해 주세요.";}finally{button.disabled=false;}
  });
})();
