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
  const emptyRun=()=>({snapshot:null,judgments:[],summary:null,summaryBusy:false,summaryError:'',busy:false,message:'',attention:false});
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
    if(!response.ok)throw Error(data.error || `서버 응답 오류 (${response.status})`);
    return data;
  }
  function loadRoles(defaults) {
    let saved;
    for (const key of [roleKey,previousRoleKey]) {
      try {saved=JSON.parse(localStorage.getItem(key));} catch {continue;}
      if(Array.isArray(saved))break;
    }
    const overrides=Array.isArray(saved)?saved:[];
    return defaults.map(({name,role,keywords})=>{
      const entry=overrides.find(item=>item?.name===name);
      if(typeof entry?.role==='string' && entry.role.trim() && entry.role.length<=300 &&
         typeof entry.keywords==='string' && entry.keywords.length<=180)
        return {name,role:entry.role.trim(),keywords:entry.keywords.trim()};
      return {name,role,keywords};
    });
  }
  function persistRoles(values) {
    const edits=values.filter((r,i)=>r.role!==profiles[i].role || r.keywords!==profiles[i].keywords);
    localStorage.setItem(roleKey,JSON.stringify(edits));
    localStorage.removeItem(previousRoleKey);
  }
  function roleFields(editing=false) {
    $('#edit-roles').hidden=editing;
    $('#role-actions').hidden=!editing;
    $('#role-fields').innerHTML=roles.map((r,i)=>{
      const fields=editing
        ? `<label>검토할 업무<textarea name="role" aria-label="${escape(r.name)} 검토할 업무" maxlength="300" rows="4" required>${escape(r.role)}</textarea></label>
           <label>주요 키워드<textarea name="keywords" aria-label="${escape(r.name)} 주요 키워드" maxlength="180" rows="2" placeholder="쉼표로 구분">${escape(r.keywords)}</textarea></label>`
        : `<p>${escape(r.role)}</p>${r.keywords?'<p class="role-terms"><b>주요 키워드</b> '+escape(r.keywords.split(',').map(k=>k.trim()).filter(Boolean).join(' · '))+'</p>':''}`;
      return `<section class="role-card"><h2>${escape(r.name)}</h2>${fields}
        <div class="role-sources">${profiles[i].sources.map(s=>link(s.url,s.label)).join(' · ')}</div></section>`;
    }).join('');
  }
  function roleCount(){ $('#role-count').textContent=roles ? `적용할 부서 기준 ${roles.length}개` : settingsError || '부서 기준을 불러오는 중입니다.'; }
  const rosterReady=fetch('./department-profiles.json',{cache:'no-cache'}).then(async response=>{
    if(!response.ok)throw Error();
    profiles=await response.json();
    roles=loadRoles(profiles);
    try {if(localStorage.getItem(previousRoleKey)!==null)persistRoles(roles);} catch {}
    roleFields();roleCount();$('#edit-roles').disabled=false;
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
  $('#edit-roles').onclick=()=>{
    roleFields(true);$('#roles-message').textContent='';
    $('#role-fields textarea').focus();
  };
  $('#cancel-roles').onclick=()=>{roleFields();$('#edit-roles').focus();};
  $('#roles-form').onsubmit=e=>{
    e.preventDefault();
    const values=all('#role-fields .role-card').map((card,i)=>({
      name:roles[i].name,role:card.querySelector('[name="role"]').value.trim(),keywords:card.querySelector('[name="keywords"]').value.trim()
    }));
    if(values.some(r=>!r.role)){$('#roles-message').textContent='각 부서가 검토할 업무를 입력해 주세요.';return;}
    try {persistRoles(values);} catch {$('#roles-message').textContent='브라우저 저장 공간에 접근할 수 없습니다.';return;}
    roles=values;roleFields();roleCount();$('#edit-roles').focus();
    $('#roles-message').textContent='이 브라우저에 저장했습니다. 다음 뉴스 확인부터 적용됩니다.';
  };
  const shortDate = v => v.slice(0,10);
  function sources(rows) {return `<ol class="sources">${rows.map(s=>`<li>${link(s.url,s.title)} <small>${escape(s.source)} · ${escape(shortDate(s.publishedAt))}</small></li>`).join('')}</ol>`;}
  $('#edition').innerHTML=editions.map(d=>`<option value="${d}">${dateLabel(d)}</option>`).join('')+months.map(m=>`<option value="${m}">${m.replace('-','년 ')}월 전체</option>`).join('');
  const reviewer = review => review.department ? review.department+(review.referenceOnly?' · 참고':'') : '공통 참고';
  function reviewRows(reviews, detailed=false) {
    return reviews.map(review=>`<div class="brief-review">
      <div class="review-line"><b class="review-team${!review.department||review.referenceOnly?' reference':''}">${escape(reviewer(review))}</b>
      <span class="review-item">${escape(review.item)}</span></div>
      ${detailed?`<p class="review-detail">${escape(review.detail)}</p>`:''}</div>`).join('');
  }
  function stories(){
    const selected=$('#edition').value;
    const issues=PUBLISHED_NEWS.filter(s=>s.date.startsWith(selected));
    $('#stories').innerHTML=`<div class="stories">${issues.map(s=>`<a class="story" href="#issue/${escape(s.id)}">
      <strong>${escape(s.title)}</strong>
      ${reviewRows(s.reviews)}
      <p>${escape(s.summary.split(/(?<=다\.) /)[0])}</p>
      <small>${dateLabel(s.date)} 발행 · 근거 뉴스 ${s.sources.length}건</small></a>`).join('')}</div>`;
  }
  $('#edition').onchange=stories;stories();
  const sections=s=>[['핵심 요약',s.summary],['주요 인사이트',s.impact],['분석과 확인할 일',s.background+' '+s.check]];
  function detail(s){
    const heading='부서별 검토 항목';
    $('#detail').innerHTML=`<a href="#news">← 브리핑 목록</a><article class="report"><div class="meta">${dateLabel(s.date)} 발행 · 근거 뉴스 ${s.sources.length}건</div><h1>${escape(s.title)}</h1>
      <section class="report-reviews"><h2>${heading}</h2>${reviewRows(s.reviews,true)}</section>
      ${sections(s).map(([title,p])=>`<h2>${title}</h2><p>${escape(p)}</p>`).join('')}<h2>뉴스 출처</h2>${sources(s.sources)}<button class="secondary pdf" id="download-detail">보고서 PDF 다운로드</button></article>`;
    const reviewSection={title:heading,lines:s.reviews.flatMap(r=>[reviewer(r)+' — '+r.item,r.detail])};
    $('#download-detail').onclick=e=>pdf(e.currentTarget,{title:s.title,meta:`교보 뉴스브리핑 · ${s.date}`,sections:[reviewSection,...sections(s).map(([title,p])=>({title,lines:[p]}))],sources:s.sources});
  }
  async function pdf(button,data){button.disabled=true;try{await window.downloadIssuePdf(data);}catch{window.alert('PDF를 생성하지 못했습니다. 다시 시도해 주세요.');}finally{button.disabled=false;}}
  function research(){
    const outlets=Object.values(NEWS_RESEARCH.outlets);
    $('#research').innerHTML=`<h2>참고 매체 ${outlets.length}곳</h2><p>보험 전문지 2곳을 포함해 생명보험과 손해보험을 함께 살펴봅니다. 기간 수집에는 검색 RSS에 노출된 제목·매체·발행일·기사 링크가 들어옵니다.</p><table class="research-table"><thead><tr><th>매체</th><th>유형</th><th>범위</th></tr></thead><tbody>${outlets.map(o=>`<tr><td>${link(o.homepage,o.name)}</td><td>${escape(o.type)}</td><td>${o.baseline?'기본 5곳':'확장 5곳'}</td></tr>`).join('')}</tbody></table><h2>회차별 매체 비교</h2><p>기록된 기사 표본에서 같은 이슈를 한 건으로 묶었습니다. 회차를 누르면 비교 근거를 볼 수 있습니다.</p>${NEWS_RESEARCH.reports.map(report=>{
      const base=report.issues.filter(i=>i.sources.some(s=>NEWS_RESEARCH.outlets[s.outlet]?.baseline));
      return `<details class="panel"><summary>${escape(report.date)} · 기본 ${base.length}건 / 확장 포함 ${report.issues.length}건</summary>${report.issues.map(i=>`<p><strong>${escape(i.title)}</strong><br>${escape(NEWS_RESEARCH.coverageLabels[i.coverage])} · ${escape(i.relevance)}<br>${i.sources.map(s=>link(s.url,NEWS_RESEARCH.outlets[s.outlet].name)).join(' · ')}</p>`).join('')}</details>`;
    }).join('')}`;
  }
  research();
  const keyDialog=$('#api-dialog'),keyOperations=new Map();
  function openKeyDialog(provider='gpt'){
    if(!keyDialog.open)keyDialog.showModal();
    $('#'+provider+(sessions[provider]?'-forget':'-key')).focus();
  }
  $('#open-api-keys').onclick=()=>openKeyDialog();
  $('#close-api-keys').onclick=()=>keyDialog.close();
  function clearKeyInputs(){
    for(const provider of Object.keys(providers))$('#'+provider+'-key').value='';
    for(const operation of keyOperations.values())operation.abort();
  }
  keyDialog.onclose=clearKeyInputs;
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

  function showConnection(provider){
    const connected=!!sessions[provider],field=$('#'+provider+'-key');
    field.hidden=connected;field.disabled=connected;
    $('#'+provider+'-save').hidden=connected;
    $('#'+provider+'-state').hidden=!connected;
    $('#'+provider+'-forget').hidden=!connected;
  }
  async function configureKey(provider,action){
    if(keyOperations.has(provider))return;
    const connecting=action==='connect',field=$('#'+provider+'-key'),msg=$('#'+provider+'-message');
    let key=connecting?field.value.trim():'';
    if(connecting && (!window.isSecureContext||!/^[!-~]{1,512}$/.test(key))){
      msg.textContent='HTTPS 화면에서 활성 키 원본을 입력해 주세요.';return;
    }
    field.value='';
    const controller=new AbortController(),{signal}=controller;
    keyOperations.set(provider,controller);
    const buttons=[$('#'+provider+'-save'),$('#'+provider+'-forget')];
    buttons.forEach(b=>b.disabled=true);
    msg.textContent=connecting?'키를 확인하고 있습니다.':'연결을 해제하고 있습니다.';
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
      setTabSession(provider,result.session);showConnection(provider);msg.textContent='';
    }catch(e){
      if(!signal.aborted)msg.textContent=connecting?e.message:'이 탭의 연결을 종료했습니다. 서버의 해제 응답은 확인하지 못했습니다.';
    }finally{
      keyOperations.delete(provider);buttons.forEach(b=>b.disabled=false);
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
  function renderRun(){
    const {snapshot,judgments,summary,summaryBusy,summaryError,busy,message,attention}=runs[mode];
    const progress=$('#progress');progress.className=message?'notice'+(attention?' alert':''):'';progress.textContent=message;
    $(mode==='link'?'#check-link':'#run').disabled=busy;
    if(!snapshot){$('#results').replaceChildren();return;}
    const isLink=snapshot.kind==='link',rows=snapshot.articles;
    const heading=isLink?'기사 확인 결과':`수집 기사 ${rows.length}건`;
    const label=isLink?`입력 기사 1건 · 관련 보도 후보 ${rows.length-1}건`:`${snapshot.from} ~ ${snapshot.to} · 중복 ${snapshot.duplicates}건 정리${snapshot.total>rows.length?' · 전체 '+snapshot.total+'건 중 최신 '+rows.length+'건':''}`;
    const story=isLink&&PUBLISHED_NEWS.find(s=>s.sources.some(a=>a.url===rows[0].url||a.title===rows[0].title));
    $('#results').innerHTML=`<div class="list-head"><h2>${heading}</h2>${rows.length?'<button class="secondary" id="download-list">결과 PDF</button>':''}</div>
      <p class="meta">${escape(label)}${isLink?` · 관련 보도 검색 ${escape(snapshot.from)} ~ ${escape(snapshot.to)}`:''}</p>
      ${snapshot.relatedUnavailable?'<p class="hint">관련 보도 검색 공급처의 응답을 받지 못했습니다.</p>':''}
      ${story?`<p class="report-match"><a href="#issue/${escape(story.id)}">이 이슈의 발행 보고서 보기</a></p>`:''}
      ${rows.length?`<section class="press-summary"><h3>GPT 요약 <small>기사 제목 기준</small></h3>
        ${summary?`<ul>${summary.items.map(item=>`<li>${escape(item.text)} ${item.sources.map(n=>link(rows[n-1].url,'['+n+']')).join(' ')}</li>`).join('')}</ul>`:
          `<button type="button" class="secondary" id="make-summary" ${summaryBusy?'disabled':''}>${summaryBusy?'요약 중…':sessions.gpt?'GPT 요약 생성':'GPT 키 연결'}</button>`}
        ${summaryError?`<p class="hint" role="status">${escape(summaryError)}</p>`:''}</section>`:''}
      <div class="results-list">${rows.map((a,i)=>`<article class="news-row"><small>${isLink?(i===0?'입력 기사':'관련 후보')+' · ':''}${escape(a.source)} · ${a.publishedAt?dateKst(a.publishedAt):'발행일 미확인'}</small><strong>${link(a.url,a.title)}</strong><div class="result-label">${escape(judgmentText(judgments[i]))}</div></article>`).join('')}</div>`;
    if(rows.length&&!summary)$('#make-summary').onclick=()=>generateSummary(mode);
    if(rows.length)$('#download-list').onclick=e=>pdf(e.currentTarget,{title:isLink?rows[0].title:'보험 뉴스 수집 결과',meta:label,sections:[...(summary?[{title:'GPT 요약 · 기사 제목 기준',lines:summary.items.map(item=>item.text+' '+item.sources.map(n=>'['+n+']').join(' '))}]:[]),{title:'기사별 판단',lines:rows.map((a,i)=>`[${i+1}] ${a.title} — ${judgmentText(judgments[i])}`)}],sources:rows.map(a=>({...a,publishedAt:a.publishedAt?dateKst(a.publishedAt):'발행일 미확인'}))});
  }
  async function generateSummary(type){
    const run=runs[type],snapshot=run.snapshot,session=sessions.gpt;
    if(!snapshot?.articles.length||run.summaryBusy||run.summary)return;
    if(!session){openKeyDialog('gpt');return;}
    run.summaryBusy=true;run.summaryError='';renderRun();
    try{
      const result=await api('summary',{id:snapshot.id,version:snapshot.version},{provider:'gpt',session});
      if(run.snapshot===snapshot&&sessions.gpt===session)run.summary=result;
    }catch(e){
      if(run.snapshot===snapshot&&sessions.gpt===session)run.summaryError=e.message;
    }finally{
      if(run.snapshot===snapshot){run.summaryBusy=false;if(mode===type)renderRun();}
    }
  }
  async function checkNews(type,payload){
    const run=runs[type];if(run.busy)return;
    Object.assign(run,emptyRun(),{busy:true});
    const update=(message,attention=false)=>{
      Object.assign(run,{message,attention});if(mode===type)renderRun();
    };
    try{
      update(type==='link'?'입력 기사와 관련 보도를 확인하고 있습니다.':'기간에 해당하는 실제 기사를 수집하고 있습니다.');
      await initialized;
      const criteria=roles?.map(r=>({...r})),runSession=sessions.jev;
      const snap=await api(type==='link'?'link':'collect',payload);
      run.snapshot=snap;
      if(!snap.articles.length){update('검색 조건에 맞는 기사가 없습니다.');return;}
      if(runSession!==sessions.jev){update('Jev 연결이 변경되었습니다. 다시 실행해 주세요.');return;}
      if(!snap.jevConfigured)setTabSession('jev','');
      showConnection('jev');
      if(!sessions.jev){update('기사 확인 완료 · 부서 판단은 상단 API 키 입력에서 Jev를 연결한 뒤 실행할 수 있습니다.');return;}
      if(!criteria)throw Error('부서 역할을 불러올 수 없습니다. 화면을 새로고침해 주세요.');
      for(let offset=0;offset<snap.articles.length;offset+=snap.batchSize){
        if(runSession!==sessions.jev){update('Jev 연결이 변경되어 추가 판단을 중단했습니다.');return;}
        update(`Jev 판단 중 · ${offset}/${snap.articles.length}건`);
        const result=await api('judge',{id:snap.id,version:snap.version,roles:criteria,offset});
        run.judgments.push(...result.answers);
      }
      update(`Jev 판단 완료 · ${run.judgments.length}건 · ${run.judgments[0].model}`);
    }catch(e){update((run.snapshot?`기사 확인 완료 · Jev 판단 ${run.judgments.length}/${run.snapshot.articles.length}건. `:'')+e.message,true);}
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

})();
