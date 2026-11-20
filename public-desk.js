(function insuranceDesk() {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const all = selector => [...document.querySelectorAll(selector)];
  const escape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'})[ch]);
  const link = (url,title) => `<a href="${escape(url)}" target="_blank" rel="noopener noreferrer">${escape(title)}</a>`;
  const dateKst = stamp => new Date(new Date(stamp).getTime()+9*3600000).toISOString().slice(0,10);
  const dateLabel = value => new Intl.DateTimeFormat('ko-KR',{month:'long',day:'numeric',weekday:'short',timeZone:'Asia/Seoul'}).format(new Date(value+'T12:00:00+09:00'));
  const editions = [...new Set(PUBLISHED_NEWS.map(s=>s.date))].sort().reverse();
  const months = [...new Set(editions.map(d=>d.slice(0,7)))];
  const roleKey = 'kyobo.press.roles.v2';
  const previousRoleKey = 'kyobo.press.roles.v1';
  let profiles=[];
  let roles,settingsError='',mode='period';
  const providers={gpt:'GPT',jev:'Jev'};
  const sessions={gpt:'',jev:''};
  const slot=provider=>'kyobo.'+provider+'.tab.v2';
  for(const provider of Object.keys(providers)){
    try{
      if(performance.getEntriesByType('navigation')[0]?.type==='reload')sessions[provider]=sessionStorage.getItem(slot(provider))||'';
      else sessionStorage.removeItem(slot(provider));
    }catch{}
  }
  function setTabSession(provider,value){
    sessions[provider]=value;
    try{
      if(value)sessionStorage.setItem(slot(provider),value);
      else sessionStorage.removeItem(slot(provider));
    }catch{}
  }
  const emptyRun=()=>({snapshot:null,judgments:[],criteria:[],summary:null,summaryBusy:false,summaryError:'',busy:false,message:'',attention:false,parent:'',status:''});
  const runs={period:emptyRun(),link:emptyRun()};
  async function api(path,payload,{provider='jev',apiKey,session=sessions[provider],signal}={}) {
    const options = {cache:'no-store', mode:'same-origin', redirect:'error',signal};
    if(payload !== undefined){
      options.method='POST';
      options.headers={'Content-Type':'application/json'};
      options.body=JSON.stringify(payload);
    }
    if(session || apiKey){
      options.headers??={};
      options.headers.Authorization=path==='connection' && apiKey?'Bearer '+apiKey:(provider==='gpt'?'GptSession ':'JevSession ')+session;
    }
    const response = await fetch('/api/press/'+path,options);
    if(!response.headers.get('content-type')?.includes('json'))throw Error('뉴스 수집 서버에 연결할 수 없습니다.');
    const data=await response.json();
    if(!response.ok){const error=Error(data.error || `서버 응답 오류 (${response.status})`);error.status=response.status;error.code=data.code;throw error;}
    return data;
  }
  function loadRoles(defaults) {
    let saved;
    for (const key of [roleKey,previousRoleKey]) {
      try {saved=JSON.parse(localStorage.getItem(key));} catch {continue;}
      if(Array.isArray(saved))break;
    }
    const overrides=Array.isArray(saved)?saved:[];
    return defaults.map(({id,name,aliases=[],role,keywords})=>{
      const entry=overrides.find(item=>item?.id===id)
        || overrides.find(item=>item?.name===name)
        || overrides.find(item=>aliases.includes(item?.name));
      return {
        name,
        role:typeof entry?.role==='string' && entry.role.trim() && entry.role.length<=300 ? entry.role.trim() : role,
        keywords:typeof entry?.keywords==='string' && entry.keywords.length<=180 ? entry.keywords.trim() : keywords
      };
    });
  }
  function persistRoles(values) {
    const edits=[];
    values.forEach(({role,keywords},i)=>{
      const profile=profiles[i];
      if(role===profile.role && keywords===profile.keywords)return;
      const entry={id:profile.id,name:profile.name};
      if(role!==profile.role)entry.role=role;
      if(keywords!==profile.keywords)entry.keywords=keywords;
      edits.push(entry);
    });
    localStorage.setItem(roleKey,JSON.stringify(edits));
    localStorage.removeItem(previousRoleKey);
  }
  function roleCardContent(profile,criteria) {
    const terms=criteria.keywords.split(',').map(value=>value.trim()).filter(Boolean);
    const references=(profile.sources || []).map(s=>`<li>${link(s.url,s.label)}</li>`).join('');
    return `<div class="role-read"><dl><dt>이 부서가 검토할 업무</dt><dd>${escape(criteria.role)}</dd></dl>
      ${profile.check && criteria.role===profile.role?`<p class="role-check"><b>먼저 확인할 일</b>${escape(profile.check)}</p>`:''}
      ${terms.length?`<p class="role-terms"><b>주요 키워드</b> ${escape(terms.join(' · '))}</p>`:''}
      ${profile.jobReference?`<p class="job-ref">직무기술서 목록 · ${escape(profile.jobReference)}</p>`:''}
      ${references?`<details class="role-sources"><summary>관련 공개 자료</summary><ul>${references}</ul></details>`:''}
      <button type="button" class="secondary edit-role">이 부서 기준 편집</button></div>
      <form class="role-editor" hidden>
        <label>검토할 업무<textarea name="role" maxlength="300" rows="4" required>${escape(criteria.role)}</textarea></label>
        <label>주요 키워드<textarea name="keywords" maxlength="180" rows="2" placeholder="쉼표로 구분">${escape(criteria.keywords)}</textarea></label>
        <div class="form-foot"><button type="submit" class="primary">이 브라우저에 저장</button><button type="button" class="secondary cancel-role">취소</button></div>
      </form><p class="role-feedback" role="status"></p>`;
  }
  function filterDirectory() {
    const query=$('#role-search').value.trim().toLocaleLowerCase('ko').split(/\s+/).filter(Boolean);
    const group=$('#role-group').value,parent=$('#role-parent').value;
    const shown=new Set();
    const groupCounts=new Map();
    profiles.forEach((profile,i)=>{
      if(group && profile.group!==group || parent && profile.parent!==parent)return;
      const words=[profile.name,profile.parent,profile.group,...(profile.aliases || []),roles[i].role,roles[i].keywords].join(' ').toLocaleLowerCase('ko');
      if(!query.every(term=>words.includes(term)))return;
      shown.add(i);
      groupCounts.set(profile.parent,(groupCounts.get(profile.parent) || 0)+1);
    });
    for(const card of all('#role-fields .role-card'))card.hidden=!shown.has(Number(card.dataset.index));
    for(const block of all('#role-fields .directory-group')){
      const count=groupCounts.get(block.dataset.group) || 0;
      block.hidden=count===0;
      block.querySelector('.group-count').textContent=count;
    }
    $('#directory-count').textContent=shown.size===profiles.length?`전체 ${shown.size}개 부서`:`전체 ${profiles.length}개 중 ${shown.size}개 부서`;
    $('#role-empty').hidden=shown.size>0;
  }
  function roleFields() {
    const groups=[...new Set(profiles.map(p=>p.group))],parents=[...new Set(profiles.map(p=>p.parent))];
    $('#role-group').innerHTML='<option value="">전체 분야</option>'+groups.map(g=>`<option>${escape(g)}</option>`).join('');
    const options='<option value="">전체 조직</option>'+parents.map(g=>`<option>${escape(g)}</option>`).join('');
    $('#role-parent').innerHTML=options;$('#brief-parent').innerHTML=options;
    $('#role-fields').innerHTML=parents.map(parent=>`<section class="directory-group" data-group="${escape(parent)}">
      <h2>${escape(parent)} <span class="group-count"></span></h2>
      ${profiles.map((p,i)=>p.parent===parent?`<details class="role-card" data-index="${i}">
        <summary><span><strong>${escape(p.name)}</strong><small>${escape(p.group)}</small></span></summary>
        <div class="role-body">${roleCardContent(p,roles[i])}</div></details>`:'').join('')}</section>`).join('');
    filterDirectory();stories();
  }
  $('#role-search').oninput=filterDirectory;
  $('#role-group').onchange=filterDirectory;
  $('#role-parent').onchange=filterDirectory;
  function roleCount(){ $('#role-count').textContent=roles ? roles.length+'개 부서' : settingsError || '불러오는 중'; }
  const rosterReady=fetch('./department-profiles.json',{cache:'no-cache'}).then(async response=>{
    if(!response.ok)throw Error();
    profiles=await response.json();
    roles=loadRoles(profiles);
    try {if(localStorage.getItem(previousRoleKey)!==null)persistRoles(roles);} catch {}
    roleFields();roleCount();
    if(location.hash.startsWith('#issue/'))route();
  }).catch(()=>{
    settingsError='부서 기준을 불러오지 못했습니다. 새로고침해 주세요.';
    $('#roles-message').textContent=settingsError;roleCount();
  });
  async function refreshKey(provider){
    try{
      const state=await api('settings',undefined,{provider});
      if(!state[provider+'Configured'])setTabSession(provider,'');
      showConnection(provider);
    }catch{$('#'+provider+'-message').textContent='연결 상태를 확인할 수 없습니다.';}
  }
  const initialized=Promise.all([rosterReady,refreshKey('jev'),sessions.gpt?refreshKey('gpt'):Promise.resolve()]);
  $('#role-fields').onclick=event=>{
    const button=event.target.closest('.edit-role,.cancel-role');
    if(!button)return;
    const card=button.closest('.role-card'), form=card.querySelector('form');
    const editing=button.classList.contains('edit-role');
    if(!editing)form.reset();
    form.hidden=!editing;
    card.querySelector('.role-read').hidden=editing;
    card.querySelector('.role-feedback').textContent='';
    card.querySelector(editing?'textarea':'.edit-role').focus();
  };
  $('#role-fields').onsubmit=event=>{
    event.preventDefault();
    const form=event.target, card=form.closest('.role-card'), index=Number(card.dataset.index);
    const role=form.elements.role.value.trim(), keywords=form.elements.keywords.value.trim();
    if(!role){form.elements.role.focus();card.querySelector('.role-feedback').textContent='검토할 업무를 입력해 주세요.';return;}
    const values=roles.slice();
    values[index]={name:profiles[index].name,role,keywords};
    try {persistRoles(values);} catch {card.querySelector('.role-feedback').textContent='브라우저 저장 공간에 접근할 수 없습니다.';return;}
    roles=values;
    card.querySelector('.role-body').innerHTML=roleCardContent(profiles[index],values[index]);
    filterDirectory();
    (card.hidden?$('#role-search'):card.querySelector('.edit-role')).focus();
    const feedback=card.hidden?$('#roles-message'):card.querySelector('.role-feedback');
    feedback.textContent=values[index].name+' 기준을 이 브라우저에 저장했습니다. 다음 뉴스 확인부터 적용됩니다.';
  };
  const shortDate = v => v.slice(0,10);
  function sources(rows) {return `<ol class="sources">${rows.map(s=>`<li>${link(s.url,s.title)} <small>${escape(s.source)} · ${escape(shortDate(s.publishedAt))}</small></li>`).join('')}</ol>`;}
  $('#edition').innerHTML='<option value="all">전체 주요 회차</option>'+editions.map(d=>`<option value="${d}">${dateLabel(d)}</option>`).join('')+months.map(m=>`<option value="${m}">${m.replace('-','년 ')}월 전체</option>`).join('');
  function reviewer(review){
    if(!review.department)return '공통 참고';
    const assignments={lead:'주관',support:'협조',reference:'참고'};
    const assignment=assignments[review.assignment] || (review.referenceOnly?'참고':'');
    return assignment ? assignment+' · '+review.department : review.department;
  }
  function reviewNotes(review) {
    const notes=[];
    if(review.reason)notes.push({label:review.department?'검토 이유':'공통으로 보는 이유',lines:[review.reason]});
    const checks=review.checks?.length?review.checks:[review.detail].filter(Boolean);
    if(checks.length)notes.push({label:'확인할 점',lines:checks});
    return notes;
  }
  function reviewRows(reviews, detailed=false) {
    return reviews.map(review=>`<div class="brief-review">
      <div class="review-line"><b class="review-team${!review.department||review.referenceOnly||review.assignment==='reference'?' reference':review.assignment==='support'?' support':''}">${escape(reviewer(review))}</b>
      <span class="review-item">${escape(review.item)}</span></div>
      ${detailed?`<dl class="review-notes">${reviewNotes(review).map(({label,lines})=>
        `<dt>${escape(label)}</dt><dd>${lines.length===1?escape(lines[0]):`<ul>${lines.map(line=>`<li>${escape(line)}</li>`).join('')}</ul>`}</dd>`).join('')}</dl>`:''}</div>`).join('');
  }
  function parentOf(name){return profiles.find(p=>p.name===name)?.parent || '소속 확인 중';}
  function organizationHtml(issues,parent){
    if(!parent)return '';
    const linked=issues.flatMap(issue=>issue.reviews.filter(r=>parentOf(r.department)===parent).map(review=>({issue,review})));
    const names=[...new Set(linked.map(x=>x.review.department))];
    return `<section class="organization-summary"><h3>${escape(parent)} 산하 분석</h3><p>관련 이슈 ${new Set(linked.map(x=>x.issue.id)).size}건 · 관련 부서 ${names.length}개</p><p>${escape(names.join(' · ') || '선택한 회차에서 관련 부서가 없습니다.')}</p>${linked.length?`<ul>${linked.map(({issue,review})=>`<li><b>${escape(review.department)}</b> · ${escape(review.item)}</li>`).join('')}</ul>`:''}</section>`;
  }
  function stories(){
    const selected=$('#edition').value,parent=$('#brief-parent').value;
    const issues=PUBLISHED_NEWS.filter(s=>(selected==='all'||s.date.startsWith(selected))&&(!parent||s.reviews.some(r=>parentOf(r.department)===parent)));
    $('#recent-editions').innerHTML=editions.slice(0,4).map(d=>{
      const items=PUBLISHED_NEWS.filter(s=>s.date===d);
      return `<button type="button" class="edition-card" data-edition="${escape(d)}" aria-pressed="${selected===d}"><span>발행 브리핑</span><strong>${dateLabel(d)}</strong><span>주요 이슈 ${items.length}건 · 근거 ${items.reduce((n,s)=>n+s.sources.length,0)}건</span></button>`;
    }).join('');
    $('#parent-analysis').innerHTML=organizationHtml(issues,parent);
    $('#issue-count').textContent=issues.length+'건';
    $('#stories').innerHTML=`<div class="stories">${issues.map(s=>`<a class="story" href="#issue/${escape(s.id)}">
      <div class="story-meta"><time datetime="${escape(s.date)}">${dateLabel(s.date)} 발행</time><span>근거 ${s.sources.length}건</span></div>
      <h3>${escape(s.title)}</h3>
      <p class="story-summary">${escape(s.summary.split(/(?<=다\.) /)[0])}</p>
      <div class="story-reviews">
      ${reviewRows(s.reviews.slice(0,1))}
      ${s.reviews.length>1?`<p class="also-reviews">${escape(s.reviews.slice(1).map(reviewer).join('　'))}</p>`:''}
      </div></a>`).join('')}</div>`;
  }
  $('#edition').value='all';
  $('#edition').onchange=stories;$('#brief-parent').onchange=stories;
  $('#recent-editions').onclick=e=>{const button=e.target.closest('button[data-edition]');if(button){$('#edition').value=button.dataset.edition;stories();}};
  stories();
  function actionState(issueId,department,index){
    try{return JSON.parse(localStorage.getItem('kyobo.review.'+issueId)||'{}')[department+'|'+index] || '미확인';}catch{return '미확인';}
  }
  function reportReviews(s,parent){return s.reviews.filter(r=>!parent||parentOf(r.department)===parent);}
  function detail(s,parent='',depth='detail'){
    const reviews=reportReviews(s,parent),parents=[...new Set(s.reviews.map(r=>parentOf(r.department)))];
    const actions=reviews.flatMap(r=>(r.checks||[r.detail]).map((text,i)=>({department:r.department,text,index:i})));
    const questions=s.uncertainty || ['원문과 내부 자료를 대조한 뒤 적용 범위와 후속 조치 여부를 확인합니다.'];
    $('#detail').innerHTML=`<a class="back-link" href="#news">브리핑 목록으로</a><article class="report">
      <div class="report-top"><span class="eyebrow">담당 산하별 이슈 보고서</span><span class="meta">${dateLabel(s.date)} 발행 · 근거 뉴스 ${s.sources.length}건</span></div><h1>${escape(s.title)}</h1>
      <div class="report-controls"><label>담당 산하별 보기<select id="report-parent"><option value="">전체 관련 조직</option>${parents.map(p=>`<option ${p===parent?'selected':''}>${escape(p)}</option>`).join('')}</select></label><label>읽기 방식<select id="report-depth"><option value="detail" ${depth==='detail'?'selected':''}>실무 검토 상세</option><option value="brief" ${depth==='brief'?'selected':''}>담당 책임자 요약</option></select></label></div>
      <p class="report-lead">${escape(s.summary)}</p>
      ${s.facts?.length?`<div class="fact-grid">${s.facts.map(f=>`<div class="fact"><b>${escape(f.value)}</b><span>${escape(f.label)}</span><small>${escape(f.basis)}</small></div>`).join('')}</div>`:''}
      ${organizationHtml([s],parent)}
      <h2>업무에 미치는 영향</h2><p>${escape(s.impact)}</p>
      <section class="report-reviews"><h2>부서별 검토 항목</h2>${reviews.map(r=>`<div class="review-parent">${escape(parentOf(r.department))}</div>`+reviewRows([r],depth==='detail')).join('')}</section>
      ${depth==='detail'?`<h2>배경과 변화</h2><p>${escape(s.background)}</p><h2>확인할 자료와 실행 항목</h2><p class="hint">상태는 이 브라우저에만 저장합니다. 사내 업무 배정이나 승인 기록을 대신하지 않습니다.</p><ul class="action-list">${actions.map((a,i)=>`<li><div class="action-copy"><b>${escape(a.department)}</b>${escape(a.text)}</div><label><span class="hint">검토 상태</span><select data-action="${i}" aria-label="${escape(a.department)} 확인 항목 ${a.index+1} 상태">${['미확인','검토 중','완료','추가 검토'].map(v=>`<option ${actionState(s.id,a.department,a.index)===v?'selected':''}>${v}</option>`).join('')}</select></label></li>`).join('')}</ul><p class="hint" id="action-feedback" role="status"></p>`:''}
      <section class="report-questions"><h2>아직 확인할 내용</h2><ul>${questions.map(q=>`<li>${escape(q)}</li>`).join('')}</ul><p class="hint">${escape(s.changeNote||'이전 회차와 같은 이슈의 비교 자료가 없어 자동으로 변화량을 계산하지 않았습니다.')}</p></section>
      <h2>뉴스 출처</h2>${sources(s.sources)}<div class="report-bottom"><button class="secondary pdf" id="download-detail">맞춤 보고서 PDF 다운로드</button><span class="hint">원문을 검토한 발행본 · 업무 영향과 확인 항목은 분석</span></div></article>`;
    $('#report-parent').onchange=e=>{detail(s,e.target.value,$('#report-depth').value);$('#report-parent').focus();};
    $('#report-depth').onchange=e=>{detail(s,$('#report-parent').value,e.target.value);$('#report-depth').focus();};
    for(const select of all('#detail [data-action]'))select.onchange=()=>{
      const a=actions[Number(select.dataset.action)];
      try{const key='kyobo.review.'+s.id,stored=JSON.parse(localStorage.getItem(key)||'{}');stored[a.department+'|'+a.index]=select.value;localStorage.setItem(key,JSON.stringify(stored));$('#action-feedback').textContent='검토 상태를 이 브라우저에 저장했습니다.';}
      catch{$('#action-feedback').textContent='저장하지 못했습니다. 브라우저 저장 공간을 확인해 주세요.';}
    };
    $('#download-detail').onclick=e=>{
      const reviewSection={title:'부서별 검토 항목',lines:reviews.flatMap(r=>[parentOf(r.department)+' / '+reviewer(r)+' — '+r.item,...reviewNotes(r).flatMap(({label,lines})=>[label,...lines])])};
      const output=[{title:'핵심 요약',lines:[s.summary]},...(s.facts?.length?[{title:'핵심 수치와 기준',lines:s.facts.map(f=>f.label+' '+f.value+' · '+f.basis)}]:[]),{title:'업무 영향',lines:[s.impact]},reviewSection];
      if(depth==='detail')output.push({title:'배경과 변화',lines:[s.background]},{title:'확인할 자료와 검토 상태',lines:actions.map(a=>a.department+' — '+a.text+' ['+actionState(s.id,a.department,a.index)+']')});
      output.push({title:'아직 확인할 내용',lines:questions});
      pdf(e.currentTarget,{title:s.title,meta:`교보 뉴스브리핑 · ${s.date} · ${parent||'전체 관련 조직'}`,sections:output,sources:s.sources});
    };
  }
  async function pdf(button,data){button.disabled=true;try{await window.downloadIssuePdf(data);}catch{window.alert('PDF를 생성하지 못했습니다. 다시 시도해 주세요.');}finally{button.disabled=false;}}
  function research(){
    const outlets=Object.values(NEWS_RESEARCH.outlets);
    $('#outlet-count').textContent=outlets.length+'곳';
    $('#research').innerHTML=`<h2>참고 매체 ${outlets.length}곳</h2><p>보험 전문지 2곳을 포함해 생명보험과 손해보험을 함께 살펴봅니다. 기간 수집에는 검색 RSS에 노출된 제목·매체·발행일·기사 링크가 들어옵니다.</p><table class="research-table"><thead><tr><th>매체</th><th>유형</th><th>범위</th></tr></thead><tbody>${outlets.map(o=>`<tr><td>${link(o.homepage,o.name)}</td><td>${escape(o.type)}</td><td>${o.baseline?'기본 5곳':'확장 5곳'}</td></tr>`).join('')}</tbody></table><h2>회차별 매체 비교</h2><p>기록된 기사 표본에서 같은 이슈를 한 건으로 묶었습니다. 회차를 누르면 비교 근거를 볼 수 있습니다.</p>${NEWS_RESEARCH.reports.map(report=>{
      const base=report.issues.filter(i=>i.sources.some(s=>NEWS_RESEARCH.outlets[s.outlet]?.baseline));
      return `<details class="panel"><summary>${escape(report.date)} · 기본 ${base.length}건 / 확장 포함 ${report.issues.length}건</summary>${report.issues.map(i=>`<p><strong>${escape(i.title)}</strong><br>${escape(NEWS_RESEARCH.coverageLabels[i.coverage])} · ${escape(i.relevance)}<br>${i.sources.map(s=>link(s.url,NEWS_RESEARCH.outlets[s.outlet].name)).join(' · ')}</p>`).join('')}</details>`;
    }).join('')}`;
  }
  research();
  const keyDialog=$('#api-dialog'),keyOperations=new Map();
  function openKeyDialog(provider){
    if(typeof keyDialog.showModal!=='function')return;
    if(!keyDialog.open)keyDialog.showModal();
    const target=provider?'#'+provider+(sessions[provider]?'-forget':'-key'):'#api-title';
    $(target).focus();
  }
  $('#open-api-keys').onclick=()=>openKeyDialog();
  $('#close-api-keys').onclick=()=>keyDialog.close();
  $('#continue-without-key').onclick=()=>keyDialog.close();
  function clearKeyInputs(){
    for(const provider of Object.keys(providers))$('#'+provider+'-key').value='';
    for(const operation of keyOperations.values())operation.abort();
  }
  keyDialog.onclose=()=>{clearKeyInputs();try{sessionStorage.setItem('kyobo.api.intro.dismissed','1');}catch{}};
  window.addEventListener('pagehide',clearKeyInputs);
  function route(scroll=false){
    const hash=location.hash.slice(1);if(hash==='content')return;
    let view=({roles:'roles',collect:'collect',link:'collect',connect:'collect',process:'process','process/news':'process','process/operations':'collect',departments:'roles'})[hash]||'news';
    if(hash.startsWith('issue/')){const story=PUBLISHED_NEWS.find(s=>s.id===hash.slice(6));if(story){view='detail';detail(story);}}
    for(const name of ['news','roles','collect','detail','process'])$('#'+name+'-screen').hidden=name!==view;
    mode=hash==='link'||hash==='connect'?'link':'period';
    $('#run-form').hidden=mode==='link';$('#link-form').hidden=mode!=='link';
    for(const a of all('#collect-screen .tabs a')){if(a.hash===(mode==='link'?'#link':'#collect'))a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');}
    if(view==='collect')renderRun();
    $('#about').hidden=hash==='process/news';$('#research').hidden=hash!=='process/news';
    for(const a of all('.nav a'))a.toggleAttribute('aria-current',false);
    $(`.nav a[href="#${view==='detail'?'news':view}"]`)?.setAttribute('aria-current','page');
    for(const a of all('#process-screen .tabs a')){if(a.hash===(hash==='process/news'?'#process/news':'#process'))a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');}
    if(scroll){$('#content').focus({preventScroll:true});window.scrollTo(0,0);}
    if(hash==='connect')openKeyDialog();
  }
  window.addEventListener('hashchange',()=>route(true));route();
  const monthField=$('#week-month'), weekField=$('#collection-week');
  // Arithmetic on ISO calendar dates is independent of the visitor's time zone.
  function shiftDay(date,offset){
    return new Date(Date.parse(date+'T00:00:00Z')+offset*86400000).toISOString().slice(0,10);
  }
  function mondayOf(date){
    const weekday=new Date(date+'T00:00:00Z').getUTCDay();
    return shiftDay(date,-((weekday+6)%7));
  }
  function selectedWeek(){
    const from=weekField.value;
    if(!from)return null;
    const sunday=shiftDay(from,6),today=dateKst(Date.now());
    return {from,to:sunday<today?sunday:today};
  }
  function showWeekRange(){
    const range=selectedWeek();
    if(!range){$('#week-range').textContent='조회할 수 있는 월을 선택해 주세요.';return;}
    const end=range.to<shiftDay(range.from,6)?' · 오늘까지':'';
    $('#next-week').disabled=range.from>=mondayOf(dateKst(Date.now()));
    $('#week-range').textContent=`수집 기간　${dateLabel(range.from)} ~ ${dateLabel(range.to)}${end} (한국 시간)`;
  }
  function updateWeeks(){
    const previous=weekField.value;
    const currentMonday=mondayOf(dateKst(Date.now()));
    monthField.max=currentMonday.slice(0,7);
    const month=monthField.value, mondays=[];
    if(/^\d{4}-(0[1-9]|1[0-2])$/.test(month) && month>'0000-12' && month<=monthField.max){
      const first=month+'-01';
      let start=mondayOf(first);
      if(start<first)start=shiftDay(start,7);
      for(;start.startsWith(month)&&start<=currentMonday;start=shiftDay(start,7))mondays.push(start);
    }
    weekField.innerHTML=mondays.map((start,i)=>`<option value="${start}">${i+1}주차 · ${start===currentMonday?'이번 주':Number(start.slice(-2))+'일 시작'}</option>`).join('');
    weekField.value=mondays.includes(previous)?previous:mondays.at(-1)||'';
    weekField.disabled=!mondays.length;
    showWeekRange();
  }
  monthField.value=mondayOf(dateKst(Date.now())).slice(0,7);
  monthField.oninput=updateWeeks;
  weekField.onchange=showWeekRange;
  window.addEventListener('focus',updateWeeks);
  updateWeeks();
  function chooseWeek(start){monthField.value=start.slice(0,7);updateWeeks();weekField.value=start;showWeekRange();}
  $('#previous-week').onclick=()=>{if(weekField.value)chooseWeek(shiftDay(weekField.value,-7));};
  $('#current-week').onclick=()=>chooseWeek(mondayOf(dateKst(Date.now())));
  $('#next-week').onclick=()=>{const next=shiftDay(weekField.value,7);if(next<=mondayOf(dateKst(Date.now())))chooseWeek(next);};

  function showConnection(provider){
    const connected=!!sessions[provider],field=$('#'+provider+'-key');
    field.hidden=connected;field.disabled=connected;
    $('#'+provider+'-save').hidden=connected;
    $('#'+provider+'-state').hidden=!connected;
    $('#'+provider+'-forget').hidden=!connected;
    const count=Object.values(sessions).filter(Boolean).length;
    $('#open-api-keys').textContent=count?'API 연결 '+count+'/2':'API 키 입력';
  }
  async function configureKey(provider,action){
    if(keyOperations.has(provider))return;
    const connecting=action==='connect',field=$('#'+provider+'-key'),msg=$('#'+provider+'-message');
    let key=connecting?field.value.trim().replace(/^Bearer\s+/i,'').trim():'';
    if(connecting && (!window.isSecureContext||!/^[!-~]{1,512}$/.test(key))){
      msg.textContent='HTTPS 화면에서 활성 키 원본을 입력해 주세요.';return;
    }
    field.value='';
    const controller=new AbortController(),{signal}=controller;
    const timeout=setTimeout(()=>controller.abort('timeout'),45000);
    keyOperations.set(provider,controller);
    const buttons=[$('#'+provider+'-save'),$('#'+provider+'-forget')];
    buttons.forEach(b=>b.disabled=true);
    msg.textContent=connecting?'키 인증과 이 탭의 연결을 확인하고 있습니다.':'연결을 해제하고 있습니다.';
    msg.className='provider-message';
    try{
      await initialized;
      if(signal.aborted)return;
      if(!connecting){
        const pending=api('connection',{action,provider},{provider});
        setTabSession(provider,'');showConnection(provider);
        await pending;msg.textContent='연결을 해제했습니다.';return;
      }
      const request=api('connection',{action,provider},{provider,apiKey:key,signal});
      key='';
      const result=await request;
      if(!result.connected||!result.session)throw Error('세션을 시작할 수 없습니다. 다시 연결해 주세요.');
      const state=await api('settings',undefined,{provider,session:result.session,signal});
      if(signal.aborted||!keyDialog.open)return;
      if(!state[provider+'Configured'])throw Error('이 사이트의 쿠키를 허용한 뒤 다시 연결해 주세요.');
      setTabSession(provider,result.session);showConnection(provider);msg.textContent=providers[provider]+' 연결을 확인했습니다.';
    }catch(e){
      if(!signal.aborted){msg.textContent=connecting?e.message:'이 탭의 연결을 종료했습니다. 서버의 해제 응답은 확인하지 못했습니다.';msg.className='provider-message error';}
      else if(signal.reason==='timeout'){msg.textContent='연결 확인이 오래 걸립니다. 네트워크 상태를 확인하고 다시 연결해 주세요.';msg.className='provider-message error';}
    }finally{
      clearTimeout(timeout);keyOperations.delete(provider);buttons.forEach(b=>b.disabled=false);
      if(runs[mode].snapshot)renderRun();
    }
  }
  for(const provider of Object.keys(providers)){
    $('#'+provider+'-form').onsubmit=e=>{e.preventDefault();configureKey(provider,'connect');};
    $('#'+provider+'-forget').onclick=()=>configureKey(provider,'disconnect');
  }
  function judgmentText(j){
    if(!j)return 'Jev 미판단';
    const same=j.sameEvent===undefined?'':j.sameEvent>=.8?'같은 이슈 · ':j.sameEvent<=.2?'다른 이슈 · ':'동일 이슈 검토 필요 · ';
    return `${same}${j.status} · 보고 가치 ${j.importance.toFixed(2)}/3 · 근거 ${j.basis}${j.matches.length?' · 관련 부서 '+j.matches.map(m=>m.name).join(', '):''}`;
  }
  function publishedForArticle(article){
    return PUBLISHED_NEWS.find(issue=>issue.sources.some(source=>source.url===article.url ||
      (source.title===article.title && source.source===article.source)));
  }
  function departmentNotes(article,judgment,criteria){
    if(!judgment?.matches.length)return [];
    const issue=publishedForArticle(article);
    return judgment.matches.flatMap(({name})=>{
      const applied=criteria.find(r=>r.name===name);
      if(!applied)return [];
      const keywords=[...new Set(applied.keywords.split(',').map(v=>v.trim()).filter(Boolean))];
      const mentioned=keywords.filter(word=>article.title.includes(word));
      const original=profiles.find(r=>r.name===name);
      const usesDefault=original?.role===applied.role && original?.keywords===applied.keywords;
      const review=usesDefault && issue?.reviews.find(r=>r.department===name && r.reason && r.checks?.length);
      const fields=[];
      if(mentioned.length)fields.push(['제목에서 확인한 키워드',mentioned.join(' · ')]);
      if(review){
        fields.push(['검토 이유 · 발행 보고서',review.reason],...review.checks.map(check=>['확인할 일',check]));
      }else{
        fields.push(['이번 판단에 적용한 부서 업무',applied.role]);
        const check=original?.role===applied.role && original.check ? original.check : mentioned.length
          ? '원문에서 '+mentioned.map(word=>'「'+word+'」').join('·')+'에 관한 변경이 있는지 확인하세요. 해당하면 적용 대상과 시점을 기록하세요.'
          : '기사 원문에서 이 업무에 영향을 주는 조치가 있는지, 있다면 어떤 절차를 바꿔야 하는지 확인하세요.';
        fields.push(['확인할 일',check]);
      }
      return [{team:review?reviewer(review):name,fields}];
    });
  }
  function noteDetails(notes,expanded){
    if(!notes.length)return '';
    return `<details class="live-review"${expanded?' open':''}><summary>부서별 검토 기준</summary>${notes.map(note=>
      `<section><h4>${escape(note.team)}</h4>${note.fields.map(([label,value])=>`<p><b>${escape(label)}</b> ${escape(value)}</p>`).join('')}</section>`).join('')}</details>`;
  }
  function renderRun(){
    const run=runs[mode],{snapshot,judgments,criteria,summary,summaryBusy,summaryError,busy,message,attention}=run;
    const progress=$('#progress');progress.className=message?'notice'+(attention?' alert':''):'';progress.textContent=message;
    $(mode==='link'?'#check-link':'#run').disabled=busy;
    $('#run-stages').innerHTML=['뉴스 수집','부서 판단','요약과 검토'].map((label,i)=>`<li class="${(i===0&&busy&&!snapshot)||(i===1&&busy&&snapshot)||(i===2&&snapshot&&!busy)?'active':''}">${label}</li>`).join('');
    if(!snapshot){
      $('#results').innerHTML=attention&&mode==='period'?'<nav class="search-recovery" aria-label="다른 방법으로 뉴스 확인"><a class="secondary" href="#link">기사 링크로 확인</a><a class="secondary" href="#news">발행 브리핑 보기</a></nav>':'';
      return;
    }
    const isLink=snapshot.kind==='link',rows=snapshot.articles;
    const heading=isLink?'기사 확인 결과':`수집 기사 ${rows.length}건`;
    const label=isLink?`입력 기사 1건 · 관련 보도 후보 ${rows.length-1}건`:`${snapshot.from} ~ ${snapshot.to} · 중복 ${snapshot.duplicates}건 정리${snapshot.total>rows.length?' · 전체 '+snapshot.total+'건 중 최신 '+rows.length+'건':''}`;
    const story=isLink&&rows.length&&publishedForArticle(rows[0]);
    const notes=rows.map((article,i)=>departmentNotes(article,judgments[i],criteria));
    const parents=[...new Set(judgments.flatMap(j=>j.matches.map(m=>parentOf(m.name))))];
    const displayed=rows.map((article,index)=>({article,index})).filter(({index})=>
      (!run.parent||judgments[index]?.matches.some(m=>parentOf(m.name)===run.parent))&&(!run.status||judgments[index]?.status===run.status));
    const expanded=new Set(all('#results .live-review[open]').map(el=>el.closest('article').querySelector('a').getAttribute('href')));
    const counts=status=>judgments.filter(j=>j.status===status).length;
    const matchedNames=[...new Set(judgments.flatMap(j=>j.matches.filter(m=>!run.parent||parentOf(m.name)===run.parent).map(m=>m.name)))];
    $('#results').innerHTML=`<div class="list-head"><h2>${heading}</h2>${rows.length?'<button class="secondary" id="download-list">결과 PDF</button>':''}</div>
      <p class="meta">${escape(label)}${isLink?` · 관련 보도 검색 ${escape(snapshot.from)} ~ ${escape(snapshot.to)}`:''}</p>
      ${snapshot.relatedUnavailable?'<p class="hint">관련 보도 검색 공급처의 응답을 받지 못했습니다. 입력 기사는 계속 확인할 수 있습니다.</p>':''}
      ${story?`<p class="report-match"><a href="#issue/${escape(story.id)}">이 이슈의 발행 보고서 보기</a></p>`:''}
      ${rows.length?`<div class="result-metrics"><span>주요 ${counts('주요 후보')}건</span><span>참고 ${counts('참고')}건</span><span>검토 필요 ${counts('검토 필요')}건</span><span>제외 ${counts('제외')}건</span><span>미판단 ${rows.length-judgments.length}건</span></div>
      ${judgments.length<rows.length?`<button type="button" class="secondary" id="retry-judgment" ${busy?'disabled':''}>${sessions.jev?'부서 판단 이어서 실행':'Jev 연결 후 부서 판단'}</button>`:''}
      <div class="result-toolbar"><label>담당 산하별 결과<select id="result-parent"><option value="">전체 관련 조직</option>${parents.map(p=>`<option ${run.parent===p?'selected':''}>${escape(p)}</option>`).join('')}</select></label><label>검토 우선순위<select id="result-status"><option value="">전체 결과</option>${['주요 후보','참고','검토 필요','제외'].map(v=>`<option ${run.status===v?'selected':''}>${v}</option>`).join('')}</select></label></div>
      ${run.parent?`<section class="organization-summary"><h3>${escape(run.parent)} 산하 분석</h3><p>${displayed.length}개 기사 · ${escape(matchedNames.join(' · '))}</p><p class="hint">제목과 부서 업무의 관련성 판단입니다. 실제 업무 영향은 원문과 내부 자료를 대조하세요.</p></section>`:''}
      <section class="press-summary"><h3>GPT 요약 <small>${escape(run.parent||'전체 조직')} · 기사 제목 기준</small></h3>
        ${summary?`<ul>${summary.items.map(item=>`<li>${escape(item.text)} ${item.sources.map(n=>link(rows[n-1].url,'['+n+']')).join(' ')}</li>`).join('')}</ul>`:
          `<button type="button" class="secondary" id="make-summary" ${summaryBusy?'disabled':''}>${summaryBusy?'요약 중…':sessions.gpt?'GPT 요약 생성':'GPT 키 연결'}</button>`}
        ${summaryError?`<p class="hint" role="status">${escape(summaryError)}</p>`:''}</section>`:''}
      <div class="results-list">${displayed.map(({article:a,index:i})=>`<article class="news-row"><small>${isLink?(i===0?'입력 기사':'관련 후보')+' · ':''}${escape(a.source)} · ${a.publishedAt?dateKst(a.publishedAt):'발행일 미확인'}</small><strong>${link(a.url,a.title)}</strong><div class="result-label">${escape(judgmentText(judgments[i]))}</div>${noteDetails(notes[i].filter(note=>!run.parent||parentOf(note.team.replace(/^(주관|협조|참고) · /,''))===run.parent),expanded.has(a.url))}</article>`).join('')}</div>
      ${rows.length&&!displayed.length?'<p class="result-empty">선택한 조건에 맞는 기사가 없습니다. 담당이나 우선순위를 바꿔보세요.</p>':''}`;
    if(rows.length){
      $('#result-parent').onchange=e=>{run.parent=e.target.value;run.summary=null;run.summaryError='';renderRun();$('#result-parent').focus();};
      $('#result-status').onchange=e=>{run.status=e.target.value;renderRun();$('#result-status').focus();};
    }
    if(rows.length&&!summary)$('#make-summary').onclick=()=>generateSummary(mode);
    if(rows.length&&judgments.length<rows.length)$('#retry-judgment').onclick=()=>{if(!sessions.jev)openKeyDialog('jev');else judgeSnapshot(mode);};
    if(rows.length)$('#download-list').onclick=e=>{
      const sections=[];
      if(summary)sections.push({title:'GPT 요약 · 기사 제목 기준',lines:summary.items.map(item=>item.text+' '+item.sources.map(n=>'['+n+']').join(' '))});
      sections.push({title:'기사별 판단',lines:displayed.map(({article,index})=>`[${index+1}] ${article.title} — ${judgmentText(judgments[index])}`)});
      const groups=new Map();
      displayed.forEach(({index:i})=>notes[i].filter(note=>!run.parent||parentOf(note.team.replace(/^(주관|협조|참고) · /,''))===run.parent).forEach(note=>{
        const key=JSON.stringify(note);
        if(!groups.has(key))groups.set(key,{note,sources:[]});
        groups.get(key).sources.push('['+(i+1)+']');
      }));
      if(groups.size)sections.push({title:'부서별 검토 기준',lines:[...groups.values()].flatMap(({note,sources})=>[
        note.team+' · '+sources.join(' '),...note.fields.map(([label,value])=>label+' — '+value)
      ])});
      pdf(e.currentTarget,{title:isLink?rows[0].title:'보험 뉴스 수집 결과',meta:label+(run.parent?' · '+run.parent:''),sections,sources:rows.map(a=>({...a,publishedAt:a.publishedAt?dateKst(a.publishedAt):'발행일 미확인'}))});
    };
  }
  async function generateSummary(type){
    const run=runs[type],snapshot=run.snapshot,session=sessions.gpt,parent=run.parent;
    if(!snapshot?.articles.length||run.summaryBusy||run.summary)return;
    if(!session){openKeyDialog('gpt');return;}
    run.summaryBusy=true;run.summaryError='';renderRun();
    try{
      const result=await api('summary',{id:snapshot.id,version:snapshot.version,parent},{provider:'gpt',session});
      if(run.snapshot===snapshot&&sessions.gpt===session&&run.parent===parent)run.summary=result;
    }catch(e){
      if(run.snapshot===snapshot&&sessions.gpt===session&&run.parent===parent)run.summaryError=e.message;
      if(e.status===401){setTabSession('gpt','');showConnection('gpt');openKeyDialog('gpt');}
    }finally{
      if(run.snapshot===snapshot){run.summaryBusy=false;if(mode===type)renderRun();}
    }
  }
  async function judgeSnapshot(type){
    const run=runs[type],snap=run.snapshot,runSession=sessions.jev;
    if(!snap?.articles.length)return;
    const update=(message,attention=false)=>{Object.assign(run,{message,attention});if(mode===type)renderRun();};
    if(!runSession){update('기사 수집 완료 · Jev를 연결하면 이 기사에서 부서 판단을 이어갈 수 있습니다.');return;}
    const criteria=run.criteria.length?run.criteria:roles?.map(r=>({...r}));
    if(!criteria){update('부서 기준을 불러오지 못했습니다. 새로고침 후 확인해 주세요.',true);return;}
    run.criteria=criteria;run.busy=true;
    try{
      for(let offset=run.judgments.length;offset<snap.articles.length;offset+=snap.batchSize){
        if(runSession!==sessions.jev){update('Jev 연결이 변경되었습니다. 연결 후 이어서 실행해 주세요.',true);return;}
        update(`Jev 부서 판단 중 · ${offset}/${snap.articles.length}건`);
        const result=await api('judge',{id:snap.id,version:snap.version,roles:criteria,offset},{session:runSession});
        if(runSession!==sessions.jev)return;
        run.judgments.push(...result.answers);
      }
      update(`부서 판단 완료 · ${run.judgments.length}건 · ${run.judgments[0]?.model||'Jev'}`);
    }catch(e){
      update(`수집 기사는 유지했습니다 · 부서 판단 ${run.judgments.length}/${snap.articles.length}건. `+e.message,true);
      if(e.status===401){setTabSession('jev','');showConnection('jev');openKeyDialog('jev');}
    }finally{run.busy=false;if(mode===type)renderRun();}
  }
  async function checkNews(type,payload){
    const run=runs[type];if(run.busy)return;
    Object.assign(run,emptyRun(),{busy:true});
    try{
      run.message=type==='link'?'입력 기사와 관련 보도를 확인하고 있습니다.':'선택한 주의 뉴스를 수집하고 있습니다.';
      if(mode===type)renderRun();
      await initialized;
      const snap=await api(type==='link'?'link':'collect',payload);
      run.snapshot=snap;
      if(!snap.articles.length){run.message='검색 조건에 맞는 기사가 없습니다.';return;}
      if(!snap.jevConfigured)setTabSession('jev','');
      showConnection('jev');
      await judgeSnapshot(type);
    }catch(e){run.message=e.message;run.attention=true;}
    finally{run.busy=false;if(mode===type)renderRun();}
  }
  $('#link-form').onsubmit=e=>{e.preventDefault();checkNews('link',{url:$('#seed').value.trim()});};
  $('#run-form').onsubmit=e=>{
    e.preventDefault();
    updateWeeks();
    const range=selectedWeek();
    if(!range){monthField.focus();return;}
    checkNews('period',{...range,topic:$('#topic').value.trim()});
  };

  function updateImpact(){
    const number=(id,min,max)=>Math.min(max,Math.max(min,Number($(id).value)||0));
    const users=number('#impact-users',1,10000),minutes=number('#impact-minutes',0,240),rate=number('#impact-rate',0,1000000);
    const potential=(25+users*minutes)*22/60,realized=potential*.6,annual=realized*rate*12;
    $('#impact-result').innerHTML=`<div><strong>${potential.toLocaleString('ko-KR',{maximumFractionDigits:1})}시간</strong><span>월 절감 가능 시간</span></div><div><strong>${realized.toLocaleString('ko-KR',{maximumFractionDigits:1})}시간</strong><span>실현율 60% 반영</span></div><div><strong>${Math.round(annual/10000).toLocaleString('ko-KR')}만원</strong><span>연 생산성 환산액 · 비용 차감 전</span></div>`;
  }
  for(const id of ['#impact-users','#impact-minutes','#impact-rate'])$(id).oninput=updateImpact;
  updateImpact();
  initialized.then(()=>{
    let dismissed=false;try{dismissed=sessionStorage.getItem('kyobo.api.intro.dismissed')==='1';}catch{}
    if(!sessions.jev&&!sessions.gpt&&!dismissed)openKeyDialog();
  });
})();
