import test from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase } from './helpers/d1.mjs';
import { handleApi } from '../server/index.mjs';
import { reportWindow, DEPARTMENT_IDS } from '../server/core.mjs';
import { PIPELINE_VERSION } from '../server/config.mjs';

const ORIGIN = 'https://brief.example.test';
const DATE = '2020-01-06'; // Monday, safely in the past for deterministic tests.
const WINDOW = reportWindow(DATE);
const TIMESTAMP = '2020-01-03T03:00:00.000Z';

function fixture(t) {
  const DB = createDatabase(); t.after(() => DB.sqlite.close());
  return { DB, ADMIN_USER_IDS: 'admin-1', TYPESAFE_API_KEY: 'test-jev-secret', LLM_API_KEY: 'test-llm-secret', LLM_MODEL: 'test-model', LLM_API_URL: 'https://llm.example.test/v1/chat/completions' };
}
const actor = id => id ? { 'oai-authenticated-user-id': id, 'oai-authenticated-user-email': `${id}@example.test` } : {};
async function request(env, path, { method = 'GET', data, user = 'admin-1', origin = ORIGIN, headers = {} } = {}) {
  const response = await handleApi(new Request(`${ORIGIN}${path}`, {
    method,
    headers: { ...actor(user), ...(method !== 'GET' ? { Origin: origin, 'Content-Type': 'application/json' } : {}), ...headers },
    ...(data !== undefined ? { body: JSON.stringify(data) } : {}),
  }), env);
  return { status: response.status, data: await response.json(), headers: response.headers };
}
async function allowSource(env, id = 'newsis') {
  return request(env, `/api/admin/sources/${id}`, { method: 'PUT', data: { enabled: true, bodyAllowed: true, aiAllowed: true, permissionNote: '테스트용 허가 기록이며 실제 뉴스 이용 권한이 아닙니다.' } });
}
function inputArticle(suffix = '1', overrides = {}) {
  return { sourceId: 'newsis', url: `https://www.newsis.com/view/test-${suffix}`, title: `보험회사 지급여력 제도 개선 ${suffix}`, publishedAt: TIMESTAMP, body: `시험용 자료 ${suffix}. 보험회사 지급여력 제도 개선과 상품개발, 리스크관리 업무에 관한 가상 내용입니다. 실제 기사나 모델 판단 결과를 나타내지 않습니다.`, ...overrides };
}
async function addArticle(env, suffix = '1', overrides = {}) {
  await allowSource(env);
  const imported = await request(env, '/api/admin/import', { method: 'POST', data: { articles: [inputArticle(suffix, overrides)], permissionNote: '직접 작성한 시험용 문서입니다.' } });
  assert.equal(imported.status, 200, JSON.stringify(imported.data));
  return env.DB.sqlite.prepare('SELECT * FROM articles WHERE url=?').get(inputArticle(suffix, overrides).url);
}
function draftPayload(article, options = {}) {
  return { title: '보험업 변화 보고서', summary: [{ text: '시험 문서에 기반한 핵심 내용입니다.', sourceIds: [article.id] }], insights: [], actions: [], sources: [{ id: article.id, title: article.title, url: article.url, source: '뉴시스', publishedAt: article.published_at, bodyHash: article.body_hash }], provenance: { factualReview: 'pending' }, ...options };
}
function insertReport(env, article, { id = 'report-test', dept = 'strategy', status = 'draft', key = `${WINDOW.id}:${dept}:${PIPELINE_VERSION}` } = {}) {
  const payload = draftPayload(article);
  env.DB.sqlite.prepare('INSERT INTO reports (id,run_key,department_id,window_id,window_json,title,payload,status,published_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(id, key, dept, WINDOW.id, JSON.stringify(WINDOW), payload.title, JSON.stringify(payload), status, status === 'published' ? TIMESTAMP : null, TIMESTAMP, TIMESTAMP);
  return id;
}
function wireJev({ relevance = .98, uncertain = false, questions } = {}) {
  const evidence=Object.keys(questions?.evidence?.criteria||{});
  const choice=(options,selected)=>({type:'choice',choice:selected,confidence:1,probabilities:Object.fromEntries(options.map(id=>[id,+(id===selected)]))});
  return { model: 'jev-test', answers: {
    relevance: { type: 'noul', noul: relevance },
    urgency: { type: 'noul', noul: .04 },
    lead: choice([...DEPARTMENT_IDS,'none'],'strategy'),
    ...(evidence.length?{evidence:choice(evidence,evidence[0])}:{}),
    importance: { type: 'score', score: 2, confidence: 1, probabilities: { 0: 0, 1: 0, 2: 1, 3: 0 } },
    ...Object.fromEntries(DEPARTMENT_IDS.map(id => [`dept_${id}`, { type: 'noul', noul: id === 'strategy' ? (uncertain ? .5 : .98) : .02 }])),
  }, usage: { input_tokens: 10, output_tokens: 10 } };
}
function providers(t, { citation = 'valid', uncertain = false, beforeJev } = {}) {
  const original = globalThis.fetch; const calls = [];
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async (url, init) => {
    const payload = JSON.parse(init.body); const kind = String(url).includes('typesafe.ai') ? 'jev' : 'llm'; calls.push(kind);
    if (kind === 'jev') { if (beforeJev) await beforeJev(); return Response.json(wireJev({ uncertain,questions:payload.questions })); }
    const articles = JSON.parse(payload.messages[1].content).articles;
    const report = { title: '보험업 핵심 보고서', summary: [{ text: '제공된 시험 기사에 근거한 핵심 내용입니다.', sourceIds: [citation === 'valid' ? articles[0].id : 'not-an-input-article'] }], insights: [], actions: [] };
    return Response.json({ model: 'llm-test', choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(report) } }], usage: { prompt_tokens: 20, completion_tokens: 20 } });
  };
  return calls;
}
const runRequest = env => request(env, '/api/admin/run', { method: 'POST', data: { reportDate: DATE, departmentId: 'strategy', kind: 'brief' } });

test('approved HTML article scraping feeds Jev-only routing and scoped correction review', async t => {
  const env=fixture(t);
  delete env.LLM_API_KEY;
  const item=inputArticle('html');
  const markup=input=>`<!doctype html><script type="application/ld+json">${JSON.stringify({"@context":"https://schema.org","@type":"NewsArticle",headline:input.title,datePublished:input.publishedAt,articleBody:input.body,isAccessibleForFree:input.free??true})}</script>`;
  const calls=[];
  const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});
  globalThis.fetch=async(url,options)=>{
    calls.push(String(url));
    if(String(url).includes('typesafe.ai')){
      return Response.json(wireJev({questions:JSON.parse(options.body).questions}));
    }
    assert.equal(options.redirect,'error');
    return new Response(markup({...item,free:!String(url).endsWith('paid')}),{headers:{'Content-Type':'text/html; charset=utf-8'}});
  };
  const scrape=(urls,user='admin-1')=>request(env,'/api/admin/scrape',{method:'POST',user,data:{urls}});
  assert.equal((await scrape([item.url])).status,400);
  assert.equal((await scrape([item.url],'member')).status,403);
  assert.equal(calls.length,0);
  await allowSource(env);
  assert.equal((await scrape([item.url,'https://example.com/a'])).status,400);
  assert.equal(calls.length,0);
  assert.equal((await scrape([item.url,'https://www.newsis.com/view/paid'])).status,422);
  assert.equal(env.DB.sqlite.prepare('SELECT COUNT(*) AS n FROM articles').get().n,0);
  assert.equal((await scrape([item.url])).data.stored,1);
  const classified=await request(env,'/api/admin/run',{method:'POST',data:{reportDate:DATE,classifyOnly:true}});
  assert.equal(classified.data.status,'classified',JSON.stringify(classified.data));
  assert.equal(calls.filter(u=>u.includes('typesafe.ai')).length,1);
  assert.equal(calls.some(u=>u.includes('llm.example')),false);
  const [issue]=(await request(env,'/api/issues')).data.issues;
  assert.equal(issue.lead,'strategy');assert.deepEqual(issue.support,[]);
  assert.ok(item.body.includes(issue.evidence));assert.equal(issue.body,undefined);
  assert.deepEqual((await request(env,'/api/issues',{user:null})).data.issues,[]);
  const member=departmentId=>request(env,'/api/admin/members/member',{method:'PUT',data:{departmentId}});
  const feedback=(origin=ORIGIN)=>request(env,`/api/issues/${issue.id}/feedback`,{method:'POST',origin,user:'member',data:{leadDepartmentId:'risk',note:'지급여력 규제 대응이 핵심입니다.'}});
  await member('product');assert.equal((await feedback()).status,404);
  await member('strategy');assert.equal((await feedback('https://another.example')).status,403);
  assert.equal((await feedback()).status,200);assert.equal((await feedback()).status,409);
  assert.equal((await request(env,'/api/admin/review')).data.articles[0].judgment.feedback.leadDepartmentId,'risk');
  const update=data=>request(env,`/api/admin/review/${issue.id}`,{method:'PUT',data:{decision:'candidate',leadDepartmentId:'risk',supportDepartmentIds:['strategy'],...data}});
  assert.equal((await update({evidence:'원문에 없는 문장'})).status,400);
  assert.equal((await update({supportDepartmentIds:['risk']})).status,400);
  assert.equal((await update({evidence:issue.evidence})).status,200);
  const [corrected]=(await request(env,'/api/issues',{user:'member'})).data.issues;
  assert.equal(corrected.lead,'risk');assert.deepEqual(corrected.support,['strategy']);assert.equal(corrected.feedbackPending,false);
  await request(env,'/api/admin/sources/newsis',{method:'PUT',data:{enabled:false,bodyAllowed:false,aiAllowed:false,permissionNote:''}});
  assert.deepEqual((await request(env,'/api/issues')).data.issues,[]);
});

test('unattended connection check persists an audit entry without exposing job secrets or calling models', async t => {
  const env=fixture(t);env.JOB_TOKEN='job-test';const calls=providers(t);
  const denied=await request(env,'/api/jobs/check',{method:'POST',user:null,data:{}});
  assert.equal(denied.status,403);
  const checked=await request(env,'/api/jobs/check',{method:'POST',user:null,origin:'',data:{},headers:{Authorization:'Bearer job-test'}});
  assert.equal(checked.status,200);assert.equal(checked.data.ok,true);assert.deepEqual(calls,[]);
  assert.equal(env.DB.sqlite.prepare("SELECT count(*) AS n FROM audit_log WHERE action='system.connection-check'").get().n,1);
});

test('candidate budget can be configured only within the bounded pilot range', async t => {
  const env=fixture(t);env.NEWS_MAX_CANDIDATES='200';
  assert.equal((await request(env,'/api/status')).data.limits.maxArticles,200);
  env.NEWS_MAX_CANDIDATES='999999';assert.equal((await request(env,'/api/status')).data.limits.maxArticles,40);
});

test('server enforces department isolation on lists and direct report/source detail', async t => {
  const env = fixture(t), article = await addArticle(env);
  insertReport(env, article, { id: 'strategy-published', status: 'published' });
  insertReport(env, article, { id: 'risk-published', dept: 'risk', status: 'published' });
  insertReport(env, article, { id: 'strategy-draft', key: 'different-draft' });
  env.DB.sqlite.prepare('INSERT INTO members VALUES (?,?,?)').run('member-1', 'strategy', TIMESTAMP);
  const list = await request(env, '/api/reports?departmentId=risk', { user: 'member-1' });
  assert.deepEqual(list.data.reports.map(r => r.id), ['strategy-published']);
  assert.equal((await request(env, '/api/reports/strategy-published', { user: 'member-1' })).status, 200);
  assert.equal((await request(env, '/api/reports/risk-published', { user: 'member-1' })).status, 404);
  assert.equal((await request(env, '/api/reports/strategy-draft', { user: 'member-1' })).status, 404);
  assert.equal((await request(env, '/api/reports/strategy-published', { user: null })).status, 404);
  assert.equal((await request(env, '/api/admin/reports', { user: 'member-1' })).status, 403);
  assert.equal((await request(env, '/api/admin/sources', { user: null })).status, 403);
});

test('mutation requests require same-origin JSON and cannot use job credentials on admin paths', async t => {
  const env = fixture(t); env.JOB_TOKEN = 'job-secret';
  const data = { articles: [inputArticle()], permissionNote: '시험 데이터 허가입니다.' };
  assert.equal((await request(env, '/api/admin/import', { method: 'POST', data, origin: 'https://attacker.example.test' })).status, 403);
  assert.equal((await request(env, '/api/admin/import', { method: 'POST', data, headers: { 'Content-Type': 'text/plain' } })).status, 415);
  assert.equal((await request(env, '/api/admin/import', { method: 'POST', data, user: null, headers: { Authorization: 'Bearer job-secret' } })).status, 403);
  const job = await request(env, '/api/jobs/run', { method: 'POST', user: null, origin: '', data: { reportDate: DATE, departmentId: 'strategy' }, headers: { Authorization: 'Bearer job-secret' } });
  assert.equal(job.status, 200);
  assert.equal(job.data.status, 'blocked'); // Auth succeeded; no source permission is configured.
});

test('unapproved sources reject imports and invalid batch leaves no partial records', async t => {
  const env = fixture(t);
  const data = { articles: [inputArticle()], permissionNote: '직접 만든 테스트 문서입니다.' };
  assert.equal((await request(env, '/api/admin/import', { method: 'POST', data })).status, 400);
  await allowSource(env);
  const invalid = await request(env, '/api/admin/import', { method: 'POST', data: { ...data, articles: [inputArticle(), inputArticle('bad', { url: 'https://attacker.example.test/article' })] } });
  assert.equal(invalid.status, 400);
  assert.equal(env.DB.sqlite.prepare('SELECT count(*) AS n FROM articles').get().n, 0);
  const duplicate = await request(env, '/api/admin/import', { method: 'POST', data: { ...data, articles: [inputArticle(), inputArticle('1', { url: `${inputArticle().url}?utm_source=test` })] } });
  assert.equal(duplicate.status, 200);
  assert.equal(duplicate.data.stored, 1);
  assert.equal(duplicate.data.duplicates, 1);
  assert.equal(env.DB.sqlite.prepare('SELECT count(*) AS n FROM articles').get().n, 1);
});

test('draft publication requires review confirmation and current source permission', async t => {
  const env = fixture(t), article = await addArticle(env), id = insertReport(env, article);
  assert.equal((await request(env, `/api/admin/reports/${id}/publish`, { method: 'POST', data: { reviewed: false } })).status, 400);
  env.DB.sqlite.prepare('UPDATE source_permissions SET ai_allowed=0 WHERE id=?').run('newsis');
  assert.equal((await request(env, `/api/admin/reports/${id}/publish`, { method: 'POST', data: { reviewed: true } })).status, 409);
  await allowSource(env);
  const published = await request(env, `/api/admin/reports/${id}/publish`, { method: 'POST', data: { reviewed: true } });
  assert.equal(published.status, 200);
  assert.equal(published.data.report.status, 'published');
  assert.equal(published.data.report.provenance.factualReview, 'human-approved');
});

test('changed source body makes an existing draft stale and prevents publishing', async t => {
  const env = fixture(t), article = await addArticle(env), id = insertReport(env, article);
  await addArticle(env, '1', { body: '수정된 시험 문서입니다. 기존 기사와 수치 및 결론이 달라졌습니다. 이전 초안의 사실관계 검수를 다시 해야 하는 충분히 긴 본문입니다.' });
  const result = await request(env, `/api/admin/reports/${id}/publish`, { method: 'POST', data: { reviewed: true } });
  assert.equal(result.status, 409);
});

test('revoked-source and empty windows make no model calls and remain distinguishable from failures', async t => {
  const env = fixture(t); const calls = providers(t);
  await allowSource(env);
  assert.equal((await runRequest(env)).data.status, 'empty');
  await addArticle(env);
  env.DB.sqlite.prepare('UPDATE source_permissions SET ai_allowed=0 WHERE id=?').run('newsis');
  await allowSource(env, 'fins'); // One permitted source remains but has no articles.
  const result = await runRequest(env);
  assert.equal(result.data.status, 'empty');
  assert.equal(result.data.counts.permissionExcluded, 1);
  assert.deepEqual(calls, []);
});

test('successful generation stores a draft with evidence and rerun reuses it without extra API cost', async t => {
  const env = fixture(t), article = await addArticle(env); const calls = providers(t);
  const first = await runRequest(env);
  assert.equal(first.data.status, 'draft', JSON.stringify(first.data));
  const report = await request(env, `/api/reports/${first.data.reportId}`);
  assert.equal(report.data.report.status, 'draft');
  assert.equal(report.data.report.sources[0].id, article.id);
  assert.equal(report.data.report.provenance.factualReview, 'pending');
  const again = await runRequest(env);
  assert.equal(again.data.reportId, first.data.reportId);
  assert.deepEqual(calls, ['jev', 'llm']);
  assert.equal(env.DB.sqlite.prepare('SELECT count(*) AS n FROM reports').get().n, 1);
});

test('a concurrent request cannot acquire the same run or duplicate model charges', async t => {
  const env = fixture(t); await addArticle(env);
  let release; const gate = new Promise(resolve => { release = resolve; });
  let entered; const started = new Promise(resolve => { entered = resolve; });
  const calls = providers(t, { beforeJev: async () => { entered(); await gate; } });
  const pending = runRequest(env); await started;
  const competing = await runRequest(env);
  assert.equal(competing.status, 409);
  release();
  assert.equal((await pending).data.status, 'draft');
  assert.deepEqual(calls, ['jev', 'llm']);
});

test('unknown citation prevents draft persistence; successful judgments survive a failed summary', async t => {
  const env = fixture(t); await addArticle(env); const calls = providers(t, { citation: 'invalid' });
  const result = await runRequest(env);
  assert.equal(result.data.status, 'failed');
  assert.equal(env.DB.sqlite.prepare('SELECT count(*) AS n FROM reports').get().n, 0);
  assert.equal(env.DB.sqlite.prepare('SELECT count(*) AS n FROM judgments').get().n, 1);
  assert.equal(env.DB.sqlite.prepare('SELECT status FROM runs').get().status, 'failed');
  assert.deepEqual(calls, ['jev', 'llm']);
  assert.ok(!JSON.stringify(result).includes(env.LLM_API_KEY));
});

test('uncertain classification is held for review; administrator correction enables a retry', async t => {
  const env = fixture(t), article = await addArticle(env); const calls = providers(t, { uncertain: true });
  const held = await runRequest(env);
  assert.equal(held.data.status, 'blocked');
  const queue = await request(env, '/api/admin/review');
  assert.equal(queue.data.articles[0].id, article.id);
  assert.equal((await request(env, `/api/admin/review/${article.id}`, { method: 'PUT', data: { decision: 'candidate', leadDepartmentId:'strategy',supportDepartmentIds:[] } })).status, 200);
  assert.equal((await runRequest(env)).data.status, 'draft');
  assert.deepEqual(calls, ['jev', 'llm']);
});

test('public readiness is uncached, reports real configuration and never exposes secret values', async t => {
  const env = fixture(t), result = await request(env, '/api/status', { user: null });
  assert.equal(result.status, 200);
  assert.equal(result.headers.get('cache-control'), 'no-store');
  assert.equal(result.data.mode, 'setup');
  assert.equal(result.data.sources.length, 10);
  assert.ok(result.data.sources.every(s => !s.enabled));
  assert.ok(!JSON.stringify(result.data).includes(env.TYPESAFE_API_KEY));
  assert.ok(!JSON.stringify(result.data).includes(env.LLM_API_KEY));
});

test('large runs checkpoint judgments and resume without classifying already processed articles', async t => {
  const env = fixture(t); await allowSource(env); const calls = providers(t);
  const imported = await request(env, '/api/admin/import', { method: 'POST', data: { articles: Array.from({ length: 9 }, (_, i) => inputArticle(`checkpoint-${i}`)), permissionNote: '직접 작성한 시험 문서입니다.' } });
  assert.equal(imported.status, 200);
  const first = await runRequest(env);
  assert.equal(first.data.status, 'pending');
  assert.equal(first.data.counts.processed, 8);
  assert.equal(first.data.counts.remaining, 1);
  assert.equal(calls.filter(c => c === 'llm').length, 0);
  const next = await runRequest(env);
  assert.equal(next.data.status, 'draft');
  assert.equal(calls.filter(c => c === 'jev').length, 9);
  assert.equal(calls.filter(c => c === 'llm').length, 1);
  const report = (await request(env, `/api/reports/${next.data.reportId}`)).data.report;
  assert.equal(report._evidence, undefined);
  assert.equal(report.sources.length, 1); // Only cited articles are listed as report evidence.
  assert.ok(JSON.parse(env.DB.sqlite.prepare('SELECT payload FROM reports').get().payload)._evidence.length > 0);
});

test('changed title invalidates a cached Jev judgment even when article body is unchanged', async t => {
  const env = fixture(t); await addArticle(env); const calls = providers(t, { citation: 'invalid' });
  assert.equal((await runRequest(env)).data.status, 'failed');
  await addArticle(env, '1', { title: '기사 제목의 의미가 달라진 시험 문서' });
  assert.equal((await runRequest(env)).data.status, 'failed');
  assert.deepEqual(calls, ['jev', 'llm', 'jev', 'llm']);
});

test('revoked source articles do not consume the eligible candidate cap', async t => {
  const env = fixture(t), article = await addArticle(env); const calls = providers(t);
  const insert = env.DB.sqlite.prepare('INSERT INTO articles (id,source_id,url,body_hash,title,published_at,body,received_at,permission_note) VALUES (?,?,?,?,?,?,?,?,?)');
  for (let i = 0; i < 41; i++) insert.run(`revoked-${i}`, 'fins', `https://www.fins.co.kr/test-${i}`, `hash-${i}`, `철회된 매체 ${i}`, TIMESTAMP, article.body, TIMESTAMP, '허용 범위 철회됨');
  const result = await runRequest(env);
  assert.equal(result.data.status, 'draft');
  assert.equal(result.data.counts.permissionExcluded, 41);
  assert.deepEqual(calls, ['jev', 'llm']);
});

test('candidate overflow blocks before API spending instead of silently truncating coverage', async t => {
  const env = fixture(t); await allowSource(env); const calls = providers(t);
  assert.equal((await request(env, '/api/admin/import', { method: 'POST', data: { articles: Array.from({ length: 41 }, (_, i) => inputArticle(`cap-${i}`)), permissionNote: '직접 작성한 시험 문서입니다.' } })).status, 200);
  const result = await runRequest(env);
  assert.equal(result.data.status, 'blocked');
  assert.equal(result.data.counts.received, 41);
  assert.deepEqual(calls, []);
});

test('draft deletion is explicit and cannot remove a published report', async t => {
  const env = fixture(t), article = await addArticle(env);
  insertReport(env, article, { id: 'delete-draft' });
  insertReport(env, article, { id: 'keep-published', key: 'published-key', status: 'published' });
  assert.equal((await request(env, '/api/admin/reports/delete-draft', { method: 'DELETE', data: { confirm: false } })).status, 400);
  assert.equal((await request(env, '/api/admin/reports/keep-published', { method: 'DELETE', data: { confirm: true } })).status, 409);
  assert.equal((await request(env, '/api/admin/reports/delete-draft', { method: 'DELETE', data: { confirm: true } })).status, 200);
  assert.equal(env.DB.sqlite.prepare('SELECT count(*) AS n FROM reports').get().n, 1);
});

test('feed collection sends exact period bounds and refuses partial or out-of-window payloads', async t => {
  const env = fixture(t); env.NEWS_FEED_URL = 'https://feed.example.test/articles'; env.NEWS_FEED_KEY = 'test-feed-secret';
  await allowSource(env);
  const original = globalThis.fetch; t.after(() => { globalThis.fetch = original; });
  let payload = { articles: [inputArticle()], hasMore: true };
  globalThis.fetch = async (value, init) => {
    const url = new URL(value);
    assert.equal(url.searchParams.get('from'), WINDOW.start);
    assert.equal(url.searchParams.get('to'), WINDOW.end);
    assert.equal(init.headers.Authorization, 'Bearer test-feed-secret');
    assert.equal(init.redirect, 'error');
    return Response.json(payload);
  };
  const collect = () => request(env, '/api/admin/collect', { method: 'POST', data: { reportDate: DATE, kind: 'brief' } });
  assert.equal((await collect()).status, 422);
  assert.equal(env.DB.sqlite.prepare('SELECT count(*) AS n FROM articles').get().n, 0);
  payload = { articles: [inputArticle('outside', { publishedAt: WINDOW.end })] };
  assert.equal((await collect()).status, 422);
  payload = { articles: [inputArticle()] };
  assert.equal((await collect()).data.stored, 1);
});
