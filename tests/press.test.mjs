import test from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase } from './helpers/d1.mjs';
import { searchPress, searchLinkedPress, judgePress, pressRange, pressRoles, pressDefaultRoles, parsePressFeed } from '../server/press.mjs';
import { handleApi } from '../server/index.mjs';

const when='Mon, 16 Nov 2026 14:59:59 GMT';
const item=(title,date=when,host='https://www.insnews.co.kr')=>'<item><title>'+title+' - 매체</title><link>https://news.google.com/rss/articles/abc</link><pubDate>'+date+'</pubDate><source url="'+host+'">매체</source></item>';
const rss='<rss><channel>'+item('실손 보장 개정')+item('실손 보장 개정')+item('다음 날 기사','Mon, 16 Nov 2026 15:00:00 GMT')+item('범위 밖 매체',when,'https://example.org')+'</channel></rss>';
test('exact Korean calendar dates, allowed publishers, normalized duplicates and honest feed errors',async()=>{
  assert.equal(parsePressFeed(rss,'2026-11-16').length,2);
  assert.throws(()=>parsePressFeed('<html/>','2026-11-16'));
  assert.throws(()=>pressRange('2026-02-30','2026-03-01'));
  assert.throws(()=>pressRange('2025-03-01','2025-04-01'));
  assert.throws(()=>pressRoles([{name:'상품',role:'설계',keywords:''},{name:'상품',role:'중복',keywords:''}]));
  const env={DB:createDatabase()},range={from:'2026-11-16',to:'2026-11-16'};
  const run=await searchPress(range,env,async()=>new Response(rss));
  assert.equal(run.duplicates,1);assert.equal(run.articles.length,1);assert.equal(run.jevConfigured,false);
  assert.equal((await searchPress(range,env,()=>assert.fail('cached'))).cached,true);
  await assert.rejects(judgePress({},env),e=>e.status===503);
  env.DB.sqlite.close();
});
test('validates provider answers, uses saved roles and server-captured articles, reuses a completed judgment',async()=>{
  const env={DB:createDatabase(),TYPESAFE_API_KEY:'test-only'};
  const run=await searchPress({from:'2026-11-16',to:'2026-11-16'},env,async()=>new Response(rss));
  const savedRoles=[{name:'보험계리팀',role:'보장 개정에 따른 준비금 점검',keywords:'준비금'}];
  const roles=pressRoles(savedRoles);
  const input={id:run.id,version:run.version,offset:0,roles:savedRoles};
  const provider=(url,init)=>{
    assert.equal(new URL(url).hostname,'api.typesafe.ai');
    const p=JSON.parse(init.body);assert.deepEqual(p.state.roles,roles);assert.equal(p.state.articles[0].title,'실손 보장 개정');
    assert.ok(!p.state.roles.some(r=>r.name==='보험계리팀'));
    return Response.json({model:'test-model',answers:{insurance0:{type:'noul',noul:.95},value0:{type:'score',confidence:.8,score:2,probabilities:{0:0,1:0,2:1,3:0}},...Object.fromEntries(roles.map((r,i)=>['role0_'+i,{type:'noul',noul:r.name==='계리팀'?.9:.1}]))}});
  };
  await assert.rejects(judgePress(input,env,async()=>Response.json({model:'test-model',answers:{}})),e=>e.status===502);
  const result=await judgePress(input,env,provider);
  assert.equal(result.answers[0].basis,'제목');assert.equal(result.answers[0].status,'주요 후보');assert.deepEqual(result.answers[0].matches,[{name:'계리팀',probability:.9}]);
  assert.equal((await judgePress(input,env,()=>assert.fail('unexpected provider call'))).cached,true);
  await assert.rejects(judgePress({...input,version:'changed'},env,provider),e=>e.status===409);
  env.DB.sqlite.close();
});
test('old roster names preserve custom criteria under current Jev candidate names and fill in new teams',()=>{
  const names=['정보보안팀','계리팀','다이렉트사업부','디지털채널/e보험팀'];
  const previous=['정보보안팀','보험계리팀','다이렉트(TM영업)','e보험팀'];
  const edits=previous.map((name,i)=>({name,role:'개별 검토 '+i,keywords:'기준 '+i}));
  const criteria=pressRoles([...edits,{name:'상품개발',role:'상품 요율 점검',keywords:'상품'}]);
  assert.deepEqual(pressRoles([]).map(r=>r.name),pressDefaultRoles.map(r=>r.name));
  for(const [i,name] of names.entries()){
    assert.deepEqual(criteria.find(role=>role.name===name),{...edits[i],name});
  }
  assert.equal(criteria.length,pressDefaultRoles.length);
  assert.deepEqual(pressRoles(criteria),criteria);
  assert.ok(criteria.some(role=>role.name==="지급심사팀"));
  assert.throws(()=>pressRoles([edits[1],{...edits[1],name:'계리팀'}]),error=>error.status===400);
  assert.ok(criteria.every(r=>Object.keys(r).length===3));
  assert.ok(pressDefaultRoles.every(r=>r.parent && r.keywords && r.role && r.check));
});
test('public settings expose only configuration state and regular cadence',async()=>{
  const response=await handleApi(new Request('https://example.com/api/press/settings'),{TYPESAFE_API_KEY:'test-only'});
  const state=await response.json();assert.equal(state.jevConfigured,false);assert.deepEqual(state.regularDays,[1,4]);assert.equal(state.regularTime,'07:00');assert.ok(!JSON.stringify(state).includes('test-only'));
  assert.deepEqual(state.roles.map(r=>[r.id,r.name]),pressDefaultRoles.map(r=>[r.id,r.name]));
  assert.ok(state.roles.some(r=>r.name==='지급심사팀'));
  const crossed=await handleApi(new Request('https://example.com/api/press/judge',{method:'POST',headers:{Origin:'https://other.example'}}),{});assert.equal(crossed.status,403);
});

test('complete roster is checked for every article, exclusions have no teams, and retry resumes a legacy snapshot',async t=>{
  const env={DB:createDatabase(),TYPESAFE_API_KEY:'test-organization'};
  t.after(()=>env.DB.sqlite.close());
  const titles=['보험금 심사 개편','은행 그림대회','보험금 청구 변경'];
  const xml='<rss><channel>'+titles.map((title,i)=>item(title).replace('articles/abc','articles/'+i)).join('')+'</channel></rss>';
  const snap=await searchPress({from:'2026-11-16',to:'2026-11-16'},env,async()=>new Response(xml));
  assert.equal(snap.batchSize,1);
  const input={id:snap.id,version:snap.version,offset:0,roles:pressRoles([])};
  const calls=[];
  let interrupted=false;
  const fetcher=async(url,init)=>{
    const {state,questions}=JSON.parse(init.body),title=state.articles[0].title;
    calls.push(title);
    assert.equal(state.articles.length,1);
    assert.deepEqual(state.roles.map(r=>r.name),input.roles.map(r=>r.name));
    assert.equal(Object.keys(questions).filter(key=>key.startsWith('role')).length,input.roles.length);
    assert.ok(Object.keys(questions).length<=32);
    if(!interrupted&&title===titles[1]){interrupted=true;return Response.json({model:'test',answers:{}});}
    const answers={insurance0:{type:'noul',noul:title===titles[1]?0:.99},value0:{type:'score',confidence:1,score:2,probabilities:{0:0,1:0,2:1,3:0}}};
    state.roles.forEach((r,i)=>answers['role0_'+i]={type:'noul',noul:title===titles[1]||r.name==='지급심사팀'?.98:.01});
    return Response.json({model:'test',answers});
  };
  const stored=JSON.parse(env.DB.sqlite.prepare('SELECT payload FROM press_searches WHERE id=?').get(snap.id).payload);
  env.DB.sqlite.prepare('UPDATE press_searches SET payload=? WHERE id=?').run(JSON.stringify({...stored,batchSize:4}),snap.id);
  await assert.rejects(judgePress(input,env,fetcher),e=>e.status===502);
  const result=await judgePress(input,env,fetcher);
  assert.deepEqual(calls,[titles[0],titles[1],titles[1],titles[2]]);
  assert.deepEqual(result.answers.map(a=>a.title),titles);
  assert.deepEqual(result.answers.map(a=>a.matches.map(team=>team.name)),[['지급심사팀'],[],['지급심사팀']]);
  assert.ok((await judgePress(input,env,()=>assert.fail('complete cache expected'))).cached);
});

test('tab sessions require both credentials, isolate tabs in one browser and ignore the old persistent cookie',async t=>{
  const origin='https://example.com',key='test-first-device',other='test-second-device';
  const env={DB:createDatabase(),TYPESAFE_API_KEY:'unused-admin',JEV_BROWSER_SEAL_KEY:'ef'.repeat(32)};
  t.after(()=>env.DB.sqlite.close());
  const src='https://www.insnews.co.kr/news/articleView.html?idxno=1';
  const dates={from:'2026-11-16',to:'2026-11-16'};
  const api=(path,payload,{cookie,token,session,host=origin,from=host}={})=>handleApi(new Request(host+'/api/press/'+path,{
    method:payload?'POST':'GET',headers:{Origin:from,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{}),...(token?{Authorization:'Bearer '+token}:session?{Authorization:'JevSession '+session}:{})},...(payload?{body:JSON.stringify(payload)}:{})
  }),env);
  const used=[];
  t.mock.method(globalThis,'fetch',async(url,init)=>{
    if(url===src)return new Response('<meta property="og:type" content="article"><meta property="og:title" content="보험금 제도 개선"><meta property="article:published_time" content="2026-11-16T15:00:00+09:00">',{headers:{'Content-Type':'text/html'}});
    if(url.startsWith('https://news.google.com/rss/'))return new Response(rss);
    assert.equal(init.redirect,'manual');
    if(url.endsWith('/v1/models'))return [key,other].some(v=>init.headers.Authorization==='Bearer '+v)?Response.json({models:[{name:'jev-latest'}]}):new Response(null,{status:401});
    assert.equal(url,'https://api.typesafe.ai/v1/systemone');used.push(init.headers.authorization);
    const p=JSON.parse(init.body);assert.deepEqual(p.state.roles,pressRoles([]));assert.ok(!init.body.includes(key));const answers={};
    for(const [name,spec] of Object.entries(p.questions))answers[name]=spec.type==='noul'?{type:'noul',noul:.9}:{type:'score',score:2,confidence:1,probabilities:{0:0,1:0,2:1,3:0}};
    return Response.json({model:'test-jev',answers});
  });
  const connect=async token=>{
    const res=await api('connection',{action:'connect'},{token});assert.equal(res.status,200);
    const set=res.headers.get('set-cookie'),data=await res.json();
    for(const flag of ['HttpOnly','Secure','SameSite=Strict','Path=/'])assert.ok(set.includes(flag));
    assert.doesNotMatch(set,/Max-Age|Expires/i);
    assert.ok(!set.includes(token) && !data.session.includes(token));
    assert.ok(data.connected);return {cookie:set.split(';')[0],session:data.session};
  };
  const a=await connect(key),b=await connect(other),jar=[a.cookie,b.cookie].join('; ');
  const configured=async opts=>(await (await api('settings',null,opts)).json()).jevConfigured;
  assert.equal(await configured({cookie:jar}),false);
  assert.equal(await configured({session:a.session}),false);
  assert.equal(await configured({cookie:b.cookie,session:a.session}),false);
  assert.equal(await configured({...a,host:'https://other.example'}),false);
  assert.equal(await configured({...a,cookie:a.cookie.replace('=','=z')}),false);
  assert.equal(await configured({session:a.session+'x',cookie:jar}),false);
  assert.equal(await configured({session:a.session,cookie:jar}),true);
  const migrated=await api('settings',null,{cookie:'__Host-kyobo-jev=old-sealed-key'});
  assert.equal((await migrated.json()).jevConfigured,false);
  assert.match(migrated.headers.get('set-cookie'),/__Host-kyobo-jev=; Max-Age=0/);
  assert.equal((await api('connection',{action:'connect'},{...a,token:'bad'})).headers.get('set-cookie'),null);
  assert.equal((await api('connection',{action:'disconnect'},{...a,from:'https://other.example'})).status,403);
  for(const [op,payload,tab] of [['link',{url:src},a],['collect',dates,a],['collect',dates,b]]){
    const opts={cookie:jar,session:tab.session};
    const snap=await (await api(op,payload,opts)).json();assert.equal(snap.jevConfigured,true);
    const args={id:snap.id,version:snap.version,roles:[],offset:0};
    assert.equal((await api('judge',args,{cookie:jar})).status,401);
    const answers=[];
    for(let offset=0;offset<snap.articles.length;offset+=snap.batchSize){
      const judgment=await api('judge',{...args,offset},opts);assert.equal(judgment.status,200);
      answers.push(...(await judgment.json()).answers);
    }
    if(op==='link'){assert.equal(snap.articles[0].url,src);assert.equal(snap.kind,'link');assert.equal(answers[1].sameEvent,.9);}
  }
  assert.deepEqual(used,['Bearer '+key,'Bearer '+key,'Bearer '+key,'Bearer '+other]);
  const forgotten=await api('connection',{action:'disconnect'},{cookie:jar,session:a.session});
  assert.ok(forgotten.headers.get('set-cookie').startsWith(a.cookie.split('=')[0]+'=; Max-Age=0;'));
  assert.equal(await configured(b),true);
  assert.equal(env.DB.sqlite.prepare('SELECT COUNT(*) AS n FROM press_checks').get().n,0);
});
test('linked article stays visible when related feed fails and an off-site redirect is refused',async t=>{
  const env={DB:createDatabase()};t.after(()=>env.DB.sqlite.close());
  const url='https://www.insnews.co.kr/news/articleView.html?idxno=1';
  const snap=await searchLinkedPress({url},env,async target=>target===url?new Response('<meta property="og:type" content="article"><meta property="og:title" content="보험 이슈">',{headers:{'Content-Type':'text/html'}}):new Response(null,{status:503}));
  assert.equal(snap.articles.length,1);assert.equal(snap.articles[0].publishedAt,null);assert.equal(snap.relatedUnavailable,true);
  await assert.rejects(searchLinkedPress({url},env,async target=>{assert.equal(target,url);return new Response(null,{status:302,headers:{Location:'https://example.org/'}});}),e=>e.status===422);
});

test('GPT and Jev connect independently and GPT summarizes only the articles in the selected snapshot',async t=>{
  const origin='https://example.com',env={DB:createDatabase(),JEV_BROWSER_SEAL_KEY:'f1'.repeat(32),LLM_API_KEY:'unused-admin'};
  t.after(()=>env.DB.sqlite.close());
  const api=(path,payload,authorization='',cookie='')=>handleApi(new Request(origin+'/api/press/'+path,{
    method:payload?'POST':'GET',headers:{Origin:origin,'Content-Type':'application/json',Authorization:authorization,Cookie:cookie},
    ...(payload?{body:JSON.stringify(payload)}:{})
  }),env);
  const linked='https://www.insnews.co.kr/news/articleView.html?idxno=2';
  let citation=1;
  const calls=[];
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    if(url===linked)return new Response('<meta property="og:type" content="article"><meta property="og:title" content="실손 보험 보장 기준"><meta property="article:published_time" content="2026-11-16T12:00:00+09:00">',{headers:{'Content-Type':'text/html'}});
    if(url.startsWith('https://news.google.com/rss/'))return new Response(rss);
    if(url==='https://api.typesafe.ai/v1/models'){
      assert.equal(options.headers.Authorization,'Bearer local-jev');
      return Response.json({models:[{name:'jev-latest'}]});
    }
    if(url==='https://api.openai.com/v1/models/gpt-4.1-mini')return options.headers.Authorization==='Bearer local-gpt'?Response.json({id:'gpt-4.1-mini'}):new Response(null,{status:401});
    assert.equal(url,'https://api.openai.com/v1/chat/completions');
    assert.equal(options.headers.authorization,'Bearer local-gpt');
    const prompt=JSON.parse(options.body);assert.equal(prompt.store,false);
    const input=JSON.parse(prompt.messages[1].content);
    assert.ok(input.articles.every(a=>Object.keys(a).sort().join(',')==='number,publishedAt,source,title'));
    assert.doesNotMatch(options.body,/ignored-client-content|local-gpt/);
    calls.push(input);
    return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({items:[{text:'실손 보장 기준 검토',sources:[citation]}]})}}]});
  });
  async function connect(provider){
    const res=await api('connection',{action:'connect',provider},'Bearer local-'+provider);
    assert.equal(res.status,200);
    const {session}=await res.json(),cookie=res.headers.get('set-cookie').split(';')[0];
    return {session,cookie,auth:(provider==='gpt'?'GptSession ':'JevSession ')+session};
  }
  assert.equal((await api('connection',{action:'connect',provider:'gpt'},'Bearer invalid')).status,401);
  const gpt=await connect('gpt'),jev=await connect('jev'),jar=gpt.cookie+'; '+jev.cookie;
  for(const [token,expectedGpt,expectedJev] of [[gpt.auth,true,false],[jev.auth,false,true],['GptSession '+jev.session,false,false]]){
    const state=await (await api('settings',null,token,jar)).json();
    assert.equal(state.gptConfigured,expectedGpt);assert.equal(state.jevConfigured,expectedJev);
  }
  for(const [path,payload] of [['collect',{from:'2026-11-16',to:'2026-11-16'}],['link',{url:linked}]]){
    const snap=await (await api(path,payload)).json(),input={id:snap.id,version:snap.version,articles:['ignored-client-content']};
    assert.equal((await api('summary',input,'',jar)).status,401);
    assert.equal((await api('summary',input,gpt.auth,jev.cookie)).status,401);
    assert.equal((await api('summary',input,jev.auth,jar)).status,401);
    assert.equal((await api('judge',input,gpt.auth,jar)).status,401);
    assert.equal((await api('summary',{...input,version:'changed'},gpt.auth,jar)).status,409);
    const res=await api('summary',input,gpt.auth,jar);assert.equal(res.status,200);
    assert.deepEqual((await res.json()).items[0].sources,[1]);
    assert.equal(calls.at(-1).articles[0].title,snap.articles[0].title);
    citation=999;assert.equal((await api('summary',input,gpt.auth,jar)).status,502);citation=1;
  }
  assert.deepEqual(calls.map(c=>c.selection),['주간','주간','링크','링크']);
  const off=await api('connection',{action:'disconnect',provider:'gpt'},gpt.auth,jar);
  assert.ok(off.headers.get('set-cookie').startsWith(gpt.cookie.split('=')[0]+'=; Max-Age=0'));
  assert.equal((await (await api('settings',null,jev.auth,jev.cookie)).json()).jevConfigured,true);
});
