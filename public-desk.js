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
  const roleKey = 'kyobo.press.roles.v1';
  let roles, snapshot, judgments = [], busy = false, settingsError = '';
  try {const saved=JSON.parse(localStorage.getItem(roleKey)); if(Array.isArray(saved)) roles=saved;} catch {}
  async function api(path,payload,executionKey) {
    const options = {cache:'no-store', mode:'same-origin', redirect:'error'};
    if(payload !== undefined){
      options.method='POST';
      options.headers={'Content-Type':'application/json'};
      options.body=JSON.stringify(payload);
    }
    if(path==='judge' && executionKey) options.headers.Authorization='Bearer '+executionKey;
    const response = await fetch('/api/press/'+path,options);
    if(!response.headers.get('content-type')?.includes('json'))throw Error('뉴스 수집 서버에 연결할 수 없습니다.');
    const data=await response.json();
    if(!response.ok)throw Error(data.error || `서버 응답 오류 (${response.status})`);
    return data;
  }
  function roleFields(values) {
    $('#role-fields').innerHTML=values.map((r,i)=>`<section class="role-card"><div class="role-head"><h2>부서 ${i+1}</h2><button class="small-button" type="button" data-remove="${i}" aria-label="${escape(r.name||'부서 '+(i+1))} 삭제">삭제</button></div>
      <label>부서 이름<input name="name" value="${escape(r.name)}" maxlength="30" required></label>
      <label>담당 업무<textarea name="role" rows="2" maxlength="300" required>${escape(r.role)}</textarea></label>
      <label>주요 키워드<input name="keywords" value="${escape(r.keywords)}" maxlength="180" placeholder="쉼표로 구분"></label></section>`).join('');
    $('#add-role').disabled=values.length>=8;
  }
  const readFields=()=>all('#role-fields .role-card').map(card=>Object.fromEntries(['name','role','keywords'].map(k=>[k,card.querySelector(`[name="${k}"]`).value.trim()])));
  function roleCount(){ $('#role-count').textContent=roles ? `적용할 부서 기준 ${roles.length}개` : settingsError || '부서 기준을 불러오는 중입니다.'; }
  const initialized=api('settings').then(data=>{
    roles??=data.roles;roleFields(roles);roleCount();
    if(!data.jevConfigured) $('#jev-key-help').textContent='키를 입력하면 기사 제목을 판단합니다. 비워 두면 기사만 수집합니다. 키는 저장하지 않습니다.';
  }).catch(e=>{
    settingsError=e.message;roleFields(roles||[]);roleCount();$('#roles-message').textContent='서버 기본 역할을 불러올 수 없습니다. 직접 작성한 역할은 이 브라우저에 저장할 수 있습니다.';
  });
  $('#add-role').onclick=()=>{const rows=readFields();if(rows.length<8){roleFields([...rows,{name:'',role:'',keywords:''}]);all('#role-fields input[name=name]').at(-1)?.focus();}};
  $('#role-fields').onclick=e=>{const button=e.target.closest('[data-remove]');if(button){const rows=readFields();rows.splice(Number(button.dataset.remove),1);roleFields(rows);}};
  $('#roles-form').onsubmit=e=>{
    e.preventDefault();const values=readFields();
    if(values.some(r=>!r.name||!r.role)||new Set(values.map(r=>r.name)).size!==values.length){$('#roles-message').textContent='서로 다른 부서 이름과 담당 업무를 입력해 주세요.';return;}
    try{localStorage.setItem(roleKey,JSON.stringify(values));roles=values;roleCount();$('#roles-message').textContent=`부서 역할 ${values.length}개를 저장했습니다.`;}
    catch{$('#roles-message').textContent='브라우저 저장 공간에 접근할 수 없습니다.';}
  };
  const shortDate = v => v.slice(0,10);
  function sources(rows) {return `<ol class="sources">${rows.map(s=>`<li>${link(s.url,s.title)} <small>${escape(s.source)} · ${escape(shortDate(s.publishedAt))}</small></li>`).join('')}</ol>`;}
  $('#edition').innerHTML=editions.map(d=>`<option value="${d}">${dateLabel(d)}</option>`).join('')+months.map(m=>`<option value="${m}">${m.replace('-','년 ')}월 전체</option>`).join('');
  function stories(){
    const selected=$('#edition').value;
    $('#stories').innerHTML=`<div class="stories">${PUBLISHED_NEWS.filter(s=>s.date.startsWith(selected)).map(s=>`<a class="story" href="#issue/${escape(s.id)}"><strong>${escape(s.title)}</strong><p>${escape(s.summary.split(/(?<=다\.) /)[0])}</p><span>${dateLabel(s.date)} 발행 · 근거 뉴스 ${s.sources.length}건</span></a>`).join('')}</div>`;
  }
  $('#edition').onchange=stories;stories();
  const sections=s=>[['핵심 요약',s.summary],['주요 인사이트',s.impact],['분석과 확인할 일',s.background+' '+s.check]];
  function detail(s){
    $('#detail').innerHTML=`<a href="#news">← 브리핑 목록</a><article class="report"><div class="meta">${dateLabel(s.date)} 발행 · 근거 뉴스 ${s.sources.length}건</div><h1>${escape(s.title)}</h1>${sections(s).map(([heading,p])=>`<h2>${heading}</h2><p>${escape(p)}</p>`).join('')}<h2>뉴스 출처</h2>${sources(s.sources)}<button class="secondary pdf" id="download-detail">보고서 PDF 다운로드</button></article>`;
    $('#download-detail').onclick=e=>pdf(e.currentTarget,{title:s.title,meta:`교보 뉴스브리핑 · ${s.date}`,sections:sections(s).map(([title,p])=>({title,lines:[p]})),sources:s.sources});
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
  function route(scroll=false){
    const hash=location.hash.slice(1);if(hash==='content')return;
    let view=({roles:'roles',collect:'collect',process:'process','process/news':'process','process/operations':'collect',departments:'roles'})[hash]||'news';
    if(hash.startsWith('issue/')){const story=PUBLISHED_NEWS.find(s=>s.id===hash.slice(6));if(story){view='detail';detail(story);}}
    for(const name of ['news','roles','collect','detail','process'])$('#'+name+'-screen').hidden=name!==view;
    $('#about').hidden=hash==='process/news';$('#research').hidden=hash!=='process/news';
    for(const a of all('.nav a'))a.toggleAttribute('aria-current',false);
    $(`.nav a[href="#${view==='detail'?'news':view}"]`)?.setAttribute('aria-current','page');
    for(const a of all('.tabs a')){if(a.hash===(hash==='process/news'?'#process/news':'#process'))a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');}
    if(scroll){$('#content').focus({preventScroll:true});window.scrollTo(0,0);}
  }
  window.addEventListener('hashchange',()=>route(true));route();
  const today=dateKst(Date.now()), day=86400000;
  let edition=Date.parse(today+'T12:00:00+09:00');
  while(![1,4].includes(new Date(edition).getUTCDay()))edition-=day;
  $('#to').value=dateKst(edition-day);$('#from').value=dateKst(edition-day*(new Date(edition).getUTCDay()===1?4:3));$('#from').max=today;$('#to').max=today;
  $('#direct-form').onsubmit=e=>{
    e.preventDefault();const seed=$('#seed').value.trim();if(!seed)return;
    const known=PUBLISHED_NEWS.find(s=>s.title===seed||s.sources.some(a=>a.title===seed||a.url===seed));
    if(known){location.hash='issue/'+known.id;return;}
    $('#topic').value=seed;location.hash='collect';
  };
  const resultMeta=a=>`${a.source} · ${dateKst(a.publishedAt)}`;
  function judgmentText(j){
    return j ? `${j.status} · 보고 가치 ${j.importance.toFixed(2)}/3 · 근거 ${j.basis}${j.matches.length?' · 관련 부서 '+j.matches.map(m=>m.name).join(', '):''}` : 'Jev 미판단';
  }
  function renderResults(){
    if(!snapshot){$('#results').replaceChildren();return;}
    const rows=snapshot.articles;
    $('#results').innerHTML=`<div class="list-head"><h2>수집 기사 ${rows.length}건</h2>${rows.length?'<button class="secondary" id="download-list">수집 결과 PDF</button>':''}</div>
      <p class="meta">${snapshot.from} ~ ${snapshot.to} · 중복 ${snapshot.duplicates}건 정리${snapshot.total>rows.length?' · 전체 '+snapshot.total+'건 중 최신 '+rows.length+'건':''}</p>
      <div class="results-list">${rows.map((a,i)=>`<article class="news-row"><small>${escape(resultMeta(a))}</small><strong>${link(a.url,a.title)}</strong><div class="result-label">${escape(judgmentText(judgments[i]))}</div></article>`).join('')}</div>`;
    if(rows.length)$('#download-list').onclick=e=>pdf(e.currentTarget,{title:'보험 뉴스 수집 결과',meta:`${snapshot.from} ~ ${snapshot.to} · ${rows.length}건`,sections:[{title:'기사별 판단',lines:rows.map((a,i)=>`[${i+1}] ${a.title} — ${judgmentText(judgments[i])}`)}],sources:rows.map(a=>({...a,publishedAt:dateKst(a.publishedAt)}))});
  }
  function progress(message,attention=false){const p=$('#progress');p.className='notice'+(attention?' alert':'');p.textContent=message;}
  const keyField=$('#jev-key');
  window.addEventListener('pagehide',()=>{keyField.value='';});
  $('#run-form').onsubmit=async e=>{
    e.preventDefault();if(busy)return;
    const from=$('#from').value,to=$('#to').value,topic=$('#topic').value.trim();
    if(!from||!to||from>to||to>today||Date.parse(to)-Date.parse(from)>=31*day){progress('오늘까지의 날짜를 1~31일 범위로 선택해 주세요.',true);return;}
    let executionKey=keyField.value.trim();
    if(executionKey && (!window.isSecureContext || !/^[!-~]{1,512}$/.test(executionKey))){
      progress('HTTPS 화면에서 공백이나 가림 표시가 없는 API 키 원본을 입력해 주세요.',true);keyField.focus();return;
    }
    keyField.value='';keyField.disabled=true;
    busy=true;$('#run').disabled=true;judgments=[];snapshot=null;renderResults();
    try{
      progress('뉴스 검색 RSS에서 발행일과 매체를 확인하고 있습니다.');
      await initialized;
      const criteria=roles?.map(r=>({...r}));snapshot=await api('collect',{from,to,topic});
      renderResults();
      if(!snapshot.articles.length){progress('이 기간과 검색 조건에 맞는 참고 매체 기사가 없습니다.');return;}
      if(!executionKey && !snapshot.jevConfigured){progress(`실제 기사 ${snapshot.articles.length}건 수집 완료 · Jev 판단은 키를 입력한 뒤 실행해 주세요.`);return;}
      if(!criteria){progress('기사 수집을 완료했습니다. 부서 기준을 불러온 뒤 다시 실행해 주세요.',true);return;}
      for(let offset=0;offset<snapshot.articles.length;offset+=snapshot.batchSize){
        progress(`실제 기사 ${snapshot.articles.length}건 수집 완료 · Jev 판단 중 (${offset}/${snapshot.articles.length})`);
        const res=await api('judge',{id:snapshot.id,version:snapshot.version,roles:criteria,offset,personal:!!executionKey},executionKey);
        judgments.push(...res.answers);renderResults();
      }
      progress(`실제 기사 ${judgments.length}건 판단 완료 · 주요 후보 ${judgments.filter(j=>j.status==='주요 후보').length}건 · ${judgments[0].model}`);
    }catch(err){progress((snapshot?`수집 완료 · Jev 판단 ${judgments.length}/${snapshot.articles.length}건. `:'')+err.message,true);}
    finally{executionKey='';keyField.disabled=false;busy=false;$('#run').disabled=false;}
  };
})();
