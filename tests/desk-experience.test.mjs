import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const published=runInNewContext(read('published-news.js')+';PUBLISHED_NEWS');
const roster=JSON.parse(read('department-profiles.json'));
const settle=()=>new Promise(setImmediate);
async function desk({connected=false,hash='#news',fetcher}={}){
  const nodes=new Map(),storage=new Map(),tickets=new Map(connected?[['kyobo.jev.tab.v2','test-session']]:[]);
  const defaults={'#impact-users':'50','#impact-minutes':'12','#impact-rate':'40000','#report-depth':'detail'};
  let pdf;
  const el=selector=>{
    if(!nodes.has(selector))nodes.set(selector,{value:defaults[selector]||'',innerHTML:'',open:false,opened:0,
      setAttribute(){},focus(){},replaceChildren(){this.innerHTML='';},
      showModal(){this.open=true;this.opened++;},close(){this.open=false;this.onclose?.();}});
    return nodes.get(selector);
  };
  runInNewContext(read('public-desk.js'),{
    document:{querySelector:el,querySelectorAll:()=>[]},location:{hash},PUBLISHED_NEWS:published,NEWS_RESEARCH:{outlets:{},reports:[]},
    performance:{getEntriesByType:()=>[{type:'reload'}]},
    sessionStorage:{getItem:key=>tickets.get(key)||null,setItem:(key,value)=>tickets.set(key,value),removeItem:key=>tickets.delete(key)},
    localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},
    window:{addEventListener(){},downloadIssuePdf:async value=>{pdf=value;}},
    fetch:async(path,options)=>path.endsWith('.json')?Response.json(roster):path.endsWith('settings')?Response.json({jevConfigured:connected}):fetcher(path,options)
  });
  await settle();return {el,storage,tickets,get pdf(){return pdf;}};
}

test('all editions are initially visible and organization summaries count issues once while retaining actuarial links',async()=>{
  const d=await desk();
  for(const issue of published)assert.ok(d.el('#stories').innerHTML.includes(issue.title));
  assert.equal((d.el('#recent-editions').innerHTML.match(/data-edition=/g)||[]).length,2);
  d.el('#brief-parent').value='선임계리사';d.el('#brief-parent').onchange();
  assert.match(d.el('#parent-analysis').innerHTML,/관련 이슈 3건/);
  assert.ok(!d.el('#stories').innerHTML.includes('KDB생명 매각 협상 종료'));
  assert.equal((d.el('#role-fields').innerHTML.match(/class="directory-group"/g)||[]).length,16);
  for(const url of ['https://career.kyobo.co.kr/evt/job_intro0/pages/sounbumsu/index.html','https://actuary.or.kr/board/offerView.do?id=1383'])assert.ok(d.el('#role-fields').innerHTML.includes(url));
});

test('organization-specific report and PDF retain source facts and include only the chosen department review',async()=>{
  const issue=published[0],d=await desk({hash:'#issue/'+issue.id});
  d.el('#report-parent').onchange({target:{value:'건강보장사업부'}});
  assert.ok(d.el('#detail').innerHTML.includes(issue.facts[0].value));
  const selected=issue.reviews.find(r=>r.department==='건강상품개발팀'),other=issue.reviews.find(r=>r.department==='계리팀');
  assert.ok(d.el('#detail').innerHTML.includes(selected.reason));
  assert.ok(!d.el('#detail').innerHTML.includes(other.reason));
  d.el('#download-detail').onclick({currentTarget:{}});await settle();
  const review=d.pdf.sections.find(s=>s.title==='부서별 검토 항목').lines.join('\n');
  assert.ok(review.includes(selected.reason));assert.ok(!review.includes(other.reason));
  assert.equal(d.pdf.sources.length,issue.sources.length);
});

test('a failed Jev batch preserves articles and resumes at the first unfinished article without collecting again',async()=>{
  const articles=[0,1].map(i=>({title:'보험금 지급 기준 변경 '+i,url:'https://example.com/'+i,source:'매체',publishedAt:'2026-11-16'}));
  let collects=0,fail=true;const offsets=[];
  const d=await desk({connected:true,hash:'#collect',fetcher:async(path,options)=>{
    if(path.endsWith('collect')){collects++;return Response.json({id:'snapshot',version:'v1',articles,batchSize:1,from:'2026-11-16',to:'2026-11-20',duplicates:0,jevConfigured:true});}
    assert.ok(path.endsWith('judge'));const {offset}=JSON.parse(options.body);offsets.push(offset);
    if(offset===1&&fail){fail=false;return Response.json({error:'일시적인 한도 오류'},{status:429});}
    return Response.json({answers:[{title:articles[offset].title,status:'주요 후보',importance:2,basis:'제목',model:'test-jev',matches:[{name:'지급심사팀'}]}]});
  }});
  d.el('#run-form').onsubmit({preventDefault(){}});await settle();
  assert.match(d.el('#progress').textContent,/부서 판단 1\/2건/);
  assert.ok(d.el('#results').innerHTML.includes(articles[1].title));
  assert.ok(d.el('#results').innerHTML.includes('부서 판단 이어서 실행'));
  await d.el('#retry-judgment').onclick();await settle();
  assert.deepEqual(offsets,[0,1,1]);assert.equal(collects,1);
  assert.match(d.el('#progress').textContent,/부서 판단 완료 · 2건/);
});

test('missing keys show a dismissible introduction and the productivity model labels assumed value',async()=>{
  const d=await desk();assert.equal(d.el('#api-dialog').opened,1);
  d.el('#continue-without-key').onclick();assert.equal(d.el('#api-dialog').open,false);
  assert.equal(d.tickets.get('kyobo.api.intro.dismissed'),'1');
  const output=d.el('#impact-result').innerHTML;
  for(const value of ['229.2시간','137.5시간','6,600만원','비용 차감 전'])assert.ok(output.includes(value));
  const connected=await desk({connected:true});assert.equal(connected.el('#api-dialog').opened,0);
});
