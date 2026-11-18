import test from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase } from './helpers/d1.mjs';
import { searchPress, judgePress, pressRange, pressRoles, parsePressFeed } from '../server/press.mjs';
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
  const roles=[{name:'상품',role:'보장 범위 설계',keywords:'보장'}];
  const input={id:run.id,version:run.version,offset:0,roles};
  const provider=(url,init)=>{
    assert.equal(new URL(url).hostname,'api.typesafe.ai');
    const p=JSON.parse(init.body);assert.deepEqual(p.state.roles,roles);assert.equal(p.state.articles[0].title,'실손 보장 개정');
    return Response.json({model:'test-model',answers:{insurance0:{type:'noul',noul:.95},value0:{type:'score',confidence:.8,score:2,probabilities:{0:0,1:0,2:1,3:0}},role0_0:{type:'noul',noul:.9}}});
  };
  await assert.rejects(judgePress(input,env,async()=>Response.json({model:'test-model',answers:{}})),e=>e.status===502);
  const result=await judgePress(input,env,provider);
  assert.equal(result.answers[0].basis,'제목');assert.equal(result.answers[0].status,'주요 후보');assert.equal(result.answers[0].matches[0].name,'상품');
  assert.equal((await judgePress(input,env,()=>assert.fail('unexpected provider call'))).cached,true);
  await assert.rejects(judgePress({...input,version:'changed'},env,provider),e=>e.status===409);
  env.DB.sqlite.close();
});
test('public settings expose only configuration state and regular cadence',async()=>{
  const response=await handleApi(new Request('https://example.com/api/press/settings'),{TYPESAFE_API_KEY:'test-only'});
  const state=await response.json();assert.equal(state.jevConfigured,true);assert.deepEqual(state.regularDays,[1,4]);assert.equal(state.regularTime,'07:00');assert.ok(!JSON.stringify(state).includes('test-only'));
  const crossed=await handleApi(new Request('https://example.com/api/press/judge',{method:'POST',headers:{Origin:'https://other.example'}}),{});assert.equal(crossed.status,403);
});
