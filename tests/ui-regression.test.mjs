import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const read = name => readFileSync(new URL('../'+name,import.meta.url),'utf8');
const html = read('index.html');
test('public entry points use the current scripts, revision and guest navigation',()=>{
  const release=JSON.parse(read('release.json'));
  assert.equal(release.sampleData,false);
  assert.ok(html.includes(release.version) && html.includes(release.updatedAt));
  assert.match(html,/og:title" content="희경 조장님 팟팅!/);
  const nav=html.match(/<nav[\s\S]+?<\/nav>/)[0];
  for(const route of ['news','collect','roles','process'])assert.ok(nav.includes('href="#'+route+'"') && html.includes('id="'+route+'-screen"'));
  assert.doesNotMatch(html,/login|로그인|src="\.\/(?:app|data|dossiers)\.js/);
  for(const src of html.matchAll(/<script defer src="\.\/([\w-]+\.js)/g))assert.ok(read(src[1]).length);
  for(const id of ['week-month','collection-week','week-range','run-form','roles-form','progress','edition','detail','link-form','key-form','key-forget'])assert.ok(html.includes('id="'+id+'"'));
  for(const name of ['엘','카밀라','루트','한들'])assert.ok(html.includes(name));
});
test('every published issue has an individual permalink, report sections, dated sources and a PDF route',()=>{
  const reports=runInNewContext(read('published-news.js')+'; PUBLISHED_NEWS');
  const departments=new Set(JSON.parse(read('department-profiles.json')).map(d=>d.name));
  assert.ok(reports.length>0);assert.equal(new Set(reports.map(r=>r.id)).size,reports.length);
  for(const r of reports){
    assert.match(r.id,/^[a-z0-9-]+$/);
    assert.ok([1,4].includes(new Date(r.date).getUTCDay()));
    for(const field of ['title','summary','background','impact','check'])assert.ok(r[field]?.trim());
    assert.ok(Array.isArray(r.reviews) && r.reviews.length>0, r.id+' needs a review item for the briefing');
    assert.equal(new Set(r.reviews.map(v=>v.department)).size,r.reviews.length);
    for(const review of r.reviews){
      assert.ok(departments.has(review.department) || (review.department===null && r.reviews.length===1));
      assert.ok(review.item.trim() && review.detail.trim());
    }
    assert.ok(r.sources.length>0);
    for(const s of r.sources){assert.match(s.url,/^https:\/\//);assert.ok(s.title && s.source && s.publishedAt<=r.date);}
  }
  assert.match(read('public-desk.js'),/window\.downloadIssuePdf/);
});

test('weekly search submits Monday–Sunday KST dates and caps the current week at today',async()=>{
  let now=Date.parse('2027-01-02T15:01:00Z'); // Sunday Jan 3 in Seoul
  const nodes=new Map(), requests=[];
  const element=selector=>{
    if(!nodes.has(selector))nodes.set(selector,{value:'',setAttribute(){},replaceChildren(){}});
    return nodes.get(selector);
  };
  const context={
    document:{querySelector:element,querySelectorAll:()=>[]},window:{addEventListener(){}},
    location:{hash:'#collect'},PUBLISHED_NEWS:[],NEWS_RESEARCH:{outlets:{},reports:[]},
    Date:class extends Date {static now(){return now;}},
    fetch:async(url,options)=>{
      if(url.endsWith('collect')){requests.push(JSON.parse(options.body));return Response.json({articles:[],duplicates:0});}
      return Response.json(url.endsWith('.json')?[]:{jevConfigured:false});
    }
  };
  runInNewContext(read('public-desk.js'),context);
  const month=element('#week-month'),week=element('#collection-week');
  async function collect(){
    element('#run-form').onsubmit({preventDefault(){}});
    await new Promise(setImmediate);
    return requests.at(-1);
  }
  assert.equal(month.value,'2026-12');
  assert.equal(week.value,'2026-12-28');
  assert.deepEqual(await collect(),{from:'2026-12-28',to:'2027-01-03',topic:''});
  now=Date.parse('2027-01-03T15:01:00Z'); // Monday in Seoul, still Sunday UTC
  month.value='2027-01';month.oninput();
  assert.equal(week.value,'2027-01-04');
  assert.ok(!week.innerHTML.includes('2027-01-11'));
  assert.match(element('#week-range').textContent,/오늘까지/);
  assert.deepEqual(await collect(),{from:'2027-01-04',to:'2027-01-04',topic:''});
  month.value='2024-02';month.oninput();
  assert.equal(week.value,'2024-02-26');
  assert.deepEqual(await collect(),{from:'2024-02-26',to:'2024-03-03',topic:''});
  week.value='2024-02-05';week.onchange();
  element('#topic').value=' 보험료 ';
  assert.deepEqual(await collect(),{from:'2024-02-05',to:'2024-02-11',topic:'보험료'});
  month.value='2027-02';month.oninput();assert.equal(week.disabled,true);
});
