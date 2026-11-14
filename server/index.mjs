import { DEPARTMENT_IDS, JEV_THRESHOLDS, ISSUE_ACTIONS, reportWindow, canonicalUrl, normalizeArticle, deduplicateArticles, validateReport } from './core.mjs';
import { scrapeArticle } from './scrape.mjs';
import { classifyArticle, summarizeArticles } from './providers.mjs';
import { LIMITS, SOURCES, PIPELINE_VERSION, validEndpoint, configuredLimits } from './config.mjs';

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const fail = (status, message) => { throw new HttpError(status, message); };
const json = (data, status = 200) => new Response(JSON.stringify(data), {status, headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Cookie, Authorization'}});
const now = () => new Date().toISOString();
const csv = v => String(v || '').split(',').map(s=>s.trim()).filter(Boolean);
const rows = async (db, sql, ...args) => (await db.prepare(sql).bind(...args).all()).results || [];
const first = (db, sql, ...args) => db.prepare(sql).bind(...args).first();
const run = (db, sql, ...args) => db.prepare(sql).bind(...args).run();
const department = id => { if(!DEPARTMENT_IDS.includes(id)) fail(400,'올바른 부서를 선택해 주세요.'); return id; };

async function body(request) {
  if (!(request.headers.get('content-type') || '').includes('application/json')) fail(415,'JSON 형식이 필요합니다.');
  if (Number(request.headers.get('content-length') || 0) > LIMITS.maxBodyBytes) fail(413,'입력은 2.5MB 이하여야 합니다.');
  const reader = request.body?.getReader();
  if (!reader) fail(400,'입력 내용이 없습니다.');
  let length = 0; const chunks = [];
  while(true) { const {done,value} = await reader.read(); if(done) break; length += value.byteLength; if(length>LIMITS.maxBodyBytes) {await reader.cancel(); fail(413,'입력은 2.5MB 이하여야 합니다.');} chunks.push(value); }
  const bytes = new Uint8Array(length); let offset=0; for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
  try { const data = JSON.parse(new TextDecoder().decode(bytes)); if(!data || typeof data !== 'object' || Array.isArray(data)) throw Error(); return data; } catch { fail(400,'올바른 JSON 객체를 입력해 주세요.'); }
}

async function identity(request, env) {
  // Sites dispatch supplies these headers. The Worker must only be served behind Sites.
  const userId = request.headers.get('oai-authenticated-user-id');
  const email = request.headers.get('oai-authenticated-user-email') || '';
  if (!userId) return {authenticated:false,role:'guest'};
  if(csv(env.ADMIN_USER_IDS).includes(userId) || csv(env.ADMIN_EMAILS).map(e=>e.toLowerCase()).includes(email.toLowerCase())) return {authenticated:true,role:'admin',userId,email};
  const member = env.DB ? await first(env.DB,'SELECT department_id FROM members WHERE user_id = ?',userId) : null;
  return {authenticated:true,role:member ? 'member' : 'guest',userId,email,departmentId:member?.department_id || null};
}

async function sources(env) {
  const saved = env.DB ? await rows(env.DB,'SELECT * FROM source_permissions') : [];
  return SOURCES.map(s=>{const p=saved.find(p=>p.id===s.id); return {...s,enabled:p?.enabled===1,bodyAllowed:p?.body_allowed===1,aiAllowed:p?.ai_allowed===1,canSummarize:p?.body_allowed===1&&p?.ai_allowed===1,permissionNote:p?.permission_note||'',updatedAt:p?.updated_at||null};});
}
async function audit(env, actor, action, target) {
  await run(env.DB,'INSERT INTO audit_log (id,actor,action,target,created_at) VALUES (?,?,?,?,?)',crypto.randomUUID(),actor,action,target,now());
}

async function readiness(env) {
  let database=false; try { if(env.DB) {await first(env.DB,'SELECT id FROM articles LIMIT 1'); database=true;} } catch {}
  const configured = database ? await sources(env) : SOURCES.map(s=>({...s,enabled:false,canSummarize:false}));
  const checks = [
    {id:'database',label:'기사·보고서 저장소',ready:database,detail:database?'서버 DB 연결됨':'저장소 연결 또는 마이그레이션 필요'},
    {id:'admin',label:'관리자 계정',ready:!!(env.ADMIN_USER_IDS||env.ADMIN_EMAILS),detail:'서버에 등록한 계정만 수집·검수·발행'},
    {id:'sources',label:'뉴스 이용 범위',ready:configured.some(s=>s.enabled&&s.canSummarize),detail:'허용 근거를 등록한 매체만 본문 저장·AI 처리'},
    {id:'feed',label:'뉴스 공급 API',ready:validEndpoint(env.NEWS_FEED_URL,true),detail:'계약한 JSON 공급 API 연결 필요 · 승인된 파일은 수동 등록 가능'},
    {id:'jev',label:'Jev API',ready:!!env.TYPESAFE_API_KEY,detail:'서버 환경 변수 TYPESAFE_API_KEY'},
    {id:'llm',label:'LLM API',ready:!!env.LLM_API_KEY&&!!env.LLM_MODEL&&validEndpoint(env.LLM_API_URL),detail:'서버 환경 변수 LLM_API_KEY · LLM_MODEL · LLM_API_URL'},
    {id:'evaluation',label:'실제 기사 평가',ready:env.EVALUATION_APPROVED==='true',detail:'임시 임계값 사용 중 · 생보·손보·경계 기사 정답과 실제 Jev 결과 비교 필요'},
    {id:'schedule',label:'월·목 자동 실행',ready:env.SCHEDULE_VERIFIED==='true'&&!!env.JOB_TOKEN,detail:'자동 실행은 아직 활성화하지 않음 · 수동 실행부터 검증'}
  ];
  return {mode:checks.every(c=>c.ready)?'ready':'setup',checks,sources:configured.map(({domains,permissionNote,...s})=>s),limits:configuredLimits(env),pipelineVersion:PIPELINE_VERSION,schedule:{timezone:'Asia/Seoul',time:'07:00',days:['월','목'],monthly:'다음 달 1일, 전월 기준',activated:env.SCHEDULE_VERIFIED==='true'}};
}

function articleRecord(r) { return {id:r.id,sourceId:r.source_id,url:r.url,bodyHash:r.body_hash,title:r.title,publishedAt:r.published_at,body:r.body,receivedAt:r.received_at}; }
function reportRecord(r, full=false) {
  const p=JSON.parse(r.payload), window=JSON.parse(r.window_json);
  const base={id:r.id,departmentId:r.department_id,window,title:r.title,status:r.status,publishedAt:r.published_at,createdAt:r.created_at,articleCount:p.sources?.length||0,counts:p.counts||{}};
  const {_evidence,...visible}=p;
  return full ? {...visible,...base} : base;
}
function authorizeReport(user,r) { if(user.role!=='admin' && (user.role!=='member'||user.departmentId!==r.department_id||r.status!=='published')) fail(404,'열람할 수 있는 보고서가 없습니다.'); }

async function importArticles(input,env,user) {
  if(!Array.isArray(input.articles)||!input.articles.length||input.articles.length>LIMITS.maxImport) fail(400,`기사는 1~${LIMITS.maxImport}건씩 등록해 주세요.`);
  if(typeof input.permissionNote!=='string'||input.permissionNote.trim().length<5||input.permissionNote.length>2000) fail(400,'본문 저장·AI 이용 권한의 근거를 5~2,000자로 기록해 주세요.');
  const registry=await sources(env), normalized=[];
  for(let i=0;i<input.articles.length;i++) {
    const a=input.articles[i]; const source=registry.find(s=>s.id===a?.sourceId);
    if(!source?.enabled) fail(400,`${i+1}번째 기사의 매체가 활성화되지 않았습니다.`);
    try { normalized.push(await normalizeArticle(a,source)); } catch(e) { fail(400,`${i+1}번째 기사: ${e.message}`); }
  }
  const unique = [...new Map(normalized.map(a=>[a.id,a])).values()];
  await env.DB.batch(unique.map(a=>env.DB.prepare('INSERT INTO articles (id,source_id,url,body_hash,title,published_at,body,received_at,permission_note) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET body_hash=excluded.body_hash,title=excluded.title,published_at=excluded.published_at,body=excluded.body,received_at=excluded.received_at,permission_note=excluded.permission_note').bind(a.id,a.sourceId,a.url,a.bodyHash,a.title,a.publishedAt,a.body,a.receivedAt,input.permissionNote.trim())));
  await audit(env,user.userId,'articles.import',String(unique.length));
  return {received:input.articles.length,stored:unique.length,duplicates:input.articles.length-unique.length,message:'기사를 서버에 저장했습니다. 기존 URL은 갱신하며 발행된 보고서는 유지합니다.'};
}

async function collect(input,env,user) {
  if(!validEndpoint(env.NEWS_FEED_URL,true)) fail(503,'서버에 허용된 뉴스 공급 API를 먼저 설정해 주세요.');
  const window=reportWindow(input.reportDate,input.kind||'brief');
  if(Date.parse(window.end)>Date.now()) fail(400,'아직 마감되지 않은 기간입니다.');
  const url=new URL(env.NEWS_FEED_URL); url.searchParams.set('from',window.start);url.searchParams.set('to',window.end);url.searchParams.set('limit',String(LIMITS.maxImport));
  let response;
  try { response=await fetch(url,{headers:{Accept:'application/json',...(env.NEWS_FEED_KEY?{Authorization:`Bearer ${env.NEWS_FEED_KEY}`}:{})},redirect:'error',signal:AbortSignal.timeout(30000)}); } catch {fail(502,'뉴스 공급 API 요청이 실패했습니다. 기존 기사는 유지됩니다.');}
  if(!response.ok) fail(502,`뉴스 공급 API 오류 (${response.status}). 기존 기사는 유지됩니다.`);
  const data=await body(response);
  if(!Array.isArray(data.articles)||data.hasMore===true||data.nextCursor) fail(422,'단일 회차 전체를 반환하는 JSON 공급 API가 필요합니다. 잘린 응답은 저장하지 않습니다.');
  if(!data.articles.length) return {received:0,stored:0,duplicates:0,message:'해당 기간 공급 API의 기사가 0건입니다.'};
  if(data.articles.some(a=>!a.publishedAt||Date.parse(a.publishedAt)<Date.parse(window.start)||Date.parse(a.publishedAt)>=Date.parse(window.end))) fail(422,'공급 API가 요청 기간 밖의 기사를 반환했습니다.');
  return importArticles({articles:data.articles,permissionNote:'등록된 공급 API 및 매체별 허용 근거에 따라 수집'},env,user);
}

async function mapBounded(list,worker) {
  const result=new Array(list.length);let cursor=0;
  const settled=await Promise.allSettled(Array.from({length:Math.min(LIMITS.concurrency,list.length)},async()=>{while(cursor<list.length){const i=cursor++;result[i]=await worker(list[i]);}}));
  const failed=settled.find(r=>r.status==='rejected');if(failed)throw failed.reason;
  return result;
}

async function generate(input,env,user) {
  const limits=configuredLimits(env);
  const classifyOnly=input.classifyOnly===true;
  const dept=classifyOnly?'issues':department(input.departmentId), window=reportWindow(input.reportDate,input.kind||'brief');
  if(Date.parse(window.end)>Date.now()) fail(400,'아직 마감되지 않은 기간입니다.');
  const key=`${window.id}:${dept}:${PIPELINE_VERSION}`;
  const existing=await first(env.DB,'SELECT * FROM reports WHERE run_key = ?',key);
  if(existing) return {runId:existing.id,status:existing.status,reportId:existing.id,message:'이미 생성된 보고서를 불러왔습니다. API를 다시 호출하지 않았습니다.'};
  if(!env.TYPESAFE_API_KEY) fail(503,'Jev 서버 설정을 먼저 완료해 주세요.');
  if(!classifyOnly&&(!env.LLM_API_KEY||!env.LLM_MODEL||!validEndpoint(env.LLM_API_URL))) fail(503,'LLM 서버 설정을 먼저 완료해 주세요.');
  const started=now(),owner=crypto.randomUUID(),runId=`run_${crypto.randomUUID()}`,lease=new Date(Date.now()+10*60*1000).toISOString();
  const claimed=await run(env.DB,"INSERT INTO runs (id,run_key,window_id,department_id,status,created_at,updated_at,error,counts,lease_until,owner_token) VALUES (?,?,?,?, 'running',?,?,NULL,'{}',?,?) ON CONFLICT(run_key) DO UPDATE SET status='running',updated_at=excluded.updated_at,error=NULL,lease_until=excluded.lease_until,owner_token=excluded.owner_token WHERE runs.status!='running' OR runs.lease_until < excluded.updated_at",runId,key,window.id,dept,started,started,lease,owner);
  if(!claimed.meta?.changes) fail(409,'같은 회차·부서를 처리 중입니다. 실행 기록에서 완료 여부를 확인해 주세요.');
  const active=await first(env.DB,'SELECT id FROM runs WHERE run_key=?',key); const id=active.id;
  let counts={};
  const finish=async(status,message,extra={})=>{await run(env.DB,'UPDATE runs SET status=?,updated_at=?,error=?,counts=?,lease_until=? WHERE run_key=? AND owner_token=?',status,now(),message||null,JSON.stringify(counts),now(),key,owner);return {runId:id,status,message,counts,...extra};};
  try {
    const registry=await sources(env),allowed=new Set(registry.filter(s=>s.enabled&&s.canSummarize).map(s=>s.id));
    const total=await first(env.DB,'SELECT COUNT(*) AS n FROM articles WHERE published_at>=? AND published_at<?',window.start,window.end);
    counts.received=total.n;
    if(!allowed.size) return finish('blocked','본문 저장·AI 이용을 허용한 매체가 없습니다.');
    const placeholders=[...allowed].map(()=>'?').join(',');
    const eligibleCount=await first(env.DB,`SELECT COUNT(*) AS n FROM articles WHERE published_at>=? AND published_at<? AND source_id IN (${placeholders})`,window.start,window.end,...allowed);
    counts.permissionExcluded=total.n-eligibleCount.n;
    if(eligibleCount.n>limits.maxArticles) return finish('blocked',`허용된 기간 내 기사가 ${limits.maxArticles}건을 초과했습니다. 서버 NEWS_MAX_CANDIDATES 한도와 예산을 확인해 주세요. 일부 기사만 임의 발행하지 않습니다.`);
    const raw=await rows(env.DB,`SELECT * FROM articles WHERE published_at>=? AND published_at<? AND source_id IN (${placeholders}) ORDER BY published_at DESC`,window.start,window.end,...allowed);
    const eligible=raw.map(articleRecord);
    const articles=deduplicateArticles(eligible);counts.duplicates=eligible.length-articles.length;
    if(!articles.length) return finish('empty','처리할 수 있는 기사가 없습니다. 기사 등록과 매체 이용 범위를 확인해 주세요.');
    const judged=[],pending=[];
    const fingerprint=article=>JSON.stringify([article.title,article.bodyHash,article.sourceId,article.publishedAt,env.TYPESAFE_MODEL||'jev-latest']);
    for(const article of articles) {
      const saved=await first(env.DB,'SELECT * FROM judgments WHERE article_id=?',article.id);
      const judgment=saved?JSON.parse(saved.payload):null;
      if(saved?.body_hash===article.bodyHash&&saved.pipeline_version===PIPELINE_VERSION&&judgment?.stateFingerprint===fingerprint(article)) judged.push({article,judgment});
      else pending.push(article);
    }
    const completed=await mapBounded(pending.slice(0,LIMITS.classificationsPerStep),async article=>{
        const judgment={...await classifyArticle(article,env),stateFingerprint:fingerprint(article)};
        await run(env.DB,'INSERT INTO judgments (article_id,body_hash,pipeline_version,payload,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(article_id) DO UPDATE SET body_hash=excluded.body_hash,pipeline_version=excluded.pipeline_version,payload=excluded.payload,updated_at=excluded.updated_at',article.id,article.bodyHash,PIPELINE_VERSION,JSON.stringify(judgment),now());
      return {article,judgment};
    });
    judged.push(...completed);counts.processed=judged.length;counts.remaining=articles.length-judged.length;
    if(counts.remaining>0) return finish('pending',`${judged.length}/${articles.length}건 분류를 저장했습니다. 다음 요청에서 이어서 처리합니다.`);
    counts.review=judged.filter(x=>x.judgment.reviewRequired).length;
    counts.irrelevant=judged.filter(x=>x.judgment.decision==='irrelevant').length;
    counts.urgent=judged.filter(x=>x.judgment.urgencyCandidate).length;
    counts.lowPriority=judged.filter(x=>!x.judgment.reviewRequired&&x.judgment.decision==='candidate'&&x.judgment.importance<JEV_THRESHOLDS.briefScore&&!x.judgment.reviewedBy).length;
    if(classifyOnly) return finish('classified',`부서 배분을 저장했습니다. 확인이 필요한 기사 ${counts.review}건, 긴급 검토 후보 ${counts.urgent}건입니다.`);
    const relevant=judged.filter(x=>!x.judgment.reviewRequired&&!x.judgment.feedback&&x.judgment.decision==='candidate'&&(x.judgment.importance>=JEV_THRESHOLDS.briefScore||x.judgment.reviewedBy)&&x.judgment.departments.includes(dept)).sort((a,b)=>b.judgment.importance-a.judgment.importance||a.article.id.localeCompare(b.article.id));
    counts.eligible=relevant.length;
    if(!relevant.length) return finish(counts.review?'blocked':'empty',counts.review?'불확실한 분류가 있습니다. 기사 검토에서 분류를 확인한 후 다시 실행해 주세요.':'이 부서의 보고서에 넣을 기사가 없습니다.');
    const selected=[];let inputCharacters=0;counts.budgetDeferred=0;
    for(const {article,judgment} of relevant) {if(selected.length>=LIMITS.maxReportArticles)break;if(inputCharacters+article.body.length>90000){counts.budgetDeferred++;continue;}selected.push({...article,leadDepartmentId:judgment.leadDepartmentId,supportDepartmentIds:judgment.supportDepartmentIds});inputCharacters+=article.body.length;}
    counts.selected=selected.length;counts.deferred=relevant.length-selected.length;
    const generated=await summarizeArticles(selected,dept,window,env);
    validateReport(generated.report,selected,dept);
    const cited=new Set([...generated.report.summary,...generated.report.insights,...generated.report.actions].flatMap(x=>x.sourceIds));
    const payload={...generated.report,sources:selected.filter(a=>cited.has(a.id)).map(a=>({id:a.id,title:a.title,url:a.url,source:registry.find(s=>s.id===a.sourceId)?.name||a.sourceId,publishedAt:a.publishedAt,bodyHash:a.bodyHash,alternates:a.sourceRefs?.filter(s=>s.id!==a.id)||[]})),_evidence:selected.map(a=>({id:a.id,title:a.title,body:a.body,bodyHash:a.bodyHash})),counts,provenance:{pipelineVersion:PIPELINE_VERSION,generatedAt:now(),model:generated.model,usage:generated.usage,factualReview:'pending',thresholds:'provisional'}};
    const reportId=`report_${crypto.randomUUID()}`;
    const saved=await run(env.DB,"INSERT INTO reports (id,run_key,department_id,window_id,window_json,title,payload,status,published_at,created_at,updated_at) SELECT ?,?,?,?,?,?,?,'draft',NULL,?,? WHERE EXISTS (SELECT 1 FROM runs WHERE run_key=? AND owner_token=? AND status='running') ON CONFLICT(run_key) DO NOTHING",reportId,key,dept,window.id,JSON.stringify(window),payload.title,JSON.stringify(payload),now(),now(),key,owner);
    if(!saved.meta?.changes) return finish('failed','다른 실행이 먼저 처리했습니다. 실행 기록을 확인해 주세요.');
    await audit(env,user.userId,'report.draft',reportId);
    return finish('draft','초안을 저장했습니다. 원문·수치·누락 기사를 검토한 후 발행해 주세요.',{reportId});
  } catch(error) {
    // Do not persist provider response bodies, secrets, or stack traces.
    return finish('failed','처리를 완료하지 못했습니다. API 설정·사용 한도·응답 형식을 확인 후 재실행해 주세요. 성공한 기사 분류와 기존 발행본은 유지합니다.');
  }
}

export async function handleApi(request,env) {
  const url=new URL(request.url),path=url.pathname,method=request.method;
  try {
    if(path==='/api/status'&&method==='GET') return json(await readiness(env));
    const user=await identity(request,env);
    if(path==='/api/session'&&method==='GET') return json(user);
    if(!env.DB) fail(503,'서버 저장소 연결을 준비 중입니다.');
    const service=path.startsWith('/api/jobs/')&&env.JOB_TOKEN&&request.headers.get('authorization')===`Bearer ${env.JOB_TOKEN}`;
    const operator=service?{role:'admin',userId:'scheduled-job'}:user;
    if(path.startsWith('/api/admin/')||path.startsWith('/api/jobs/')) {
      if(operator.role!=='admin') fail(403,'등록된 관리자 계정으로 로그인해 주세요.');
      if(method!=='GET'&&!service&&request.headers.get('origin')!==url.origin) fail(403,'같은 사이트에서 요청해 주세요.');
    }
    if(path==='/api/admin/sources'&&method==='GET') return json({sources:await sources(env)});
    if(path==='/api/jobs/check'&&method==='POST') {
      await body(request);
      const id=crypto.randomUUID();await run(env.DB,'INSERT INTO audit_log (id,actor,action,target,created_at) VALUES (?,?,?,?,?)',id,operator.userId,'system.connection-check','D1',now());
      return json({ok:!!await first(env.DB,'SELECT id FROM audit_log WHERE id=?',id),message:'서버 인증과 저장·조회 확인 완료. 뉴스·모델 호출 없음.'});
    }
    if(path.startsWith('/api/admin/sources/')&&method==='PUT') {
      const id=decodeURIComponent(path.split('/').pop());if(!SOURCES.some(s=>s.id===id)) fail(404,'알 수 없는 매체입니다.');
      const p=await body(request);
      if(['enabled','bodyAllowed','aiAllowed'].some(k=>typeof p[k]!=='boolean')) fail(400,'수집·본문 저장·AI 이용 여부를 각각 지정해 주세요.');
      if(typeof p.permissionNote!=='string'||p.permissionNote.length>2000||((p.enabled||p.bodyAllowed||p.aiAllowed)&&p.permissionNote.trim().length<5)) fail(400,'확인한 이용 권한의 근거를 기록해 주세요.');
      await run(env.DB,'INSERT INTO source_permissions (id,enabled,body_allowed,ai_allowed,permission_note,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET enabled=excluded.enabled,body_allowed=excluded.body_allowed,ai_allowed=excluded.ai_allowed,permission_note=excluded.permission_note,updated_at=excluded.updated_at',id,+p.enabled,+p.bodyAllowed,+p.aiAllowed,p.permissionNote.trim(),now());
      await audit(env,user.userId,'source.permissions',id);return json({sources:await sources(env)});
    }
    if(path.startsWith('/api/admin/members/')&&method==='PUT') {
      const id=decodeURIComponent(path.split('/').pop()),p=await body(request);if(!id||id.length>200) fail(400,'로그인 사용자 ID를 확인해 주세요.');
      if(p.departmentId===null) {await run(env.DB,'DELETE FROM members WHERE user_id=?',id);} else {department(p.departmentId);await run(env.DB,'INSERT INTO members (user_id,department_id,updated_at) VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET department_id=excluded.department_id,updated_at=excluded.updated_at',id,p.departmentId,now());}
      await audit(env,user.userId,'member.update',id);return json({updated:true});
    }
    if(path==='/api/admin/import'&&method==='POST') return json(await importArticles(await body(request),env,operator));
    if(path==='/api/admin/scrape'&&method==='POST') {
      const p=await body(request);
      if(!Array.isArray(p.urls)||p.urls.length<1||p.urls.length>5) fail(400,'기사 URL을 1~5개 입력해 주세요.');
      const registry=await sources(env), prepared=[];
      for(const url of p.urls) {
        const host=new URL(canonicalUrl(url)).hostname;
        const source=registry.find(s=>s.enabled&&s.canSummarize&&s.domains.includes(host));
        if(!source) fail(400,'수집·본문 저장·AI 이용이 승인된 매체 주소만 입력해 주세요.');
        prepared.push({url,source});
      }
      let articles;
      try { articles=await mapBounded(prepared,({url,source})=>scrapeArticle(url,source)); }
      catch { fail(422,'공개 본문을 확인할 수 없는 페이지가 있습니다. 본문·발행 시각과 이용 범위를 확인해 주세요. 이번 입력은 저장하지 않았습니다.'); }
      return json(await importArticles({articles,permissionNote:'관리자가 설정한 매체별 수집·본문 저장·AI 이용 권한에 따라 공개 HTML에서 수집'},env,operator));
    }
    if(['/api/admin/collect','/api/jobs/collect'].includes(path)&&method==='POST') return json(await collect(await body(request),env,operator));
    if(['/api/admin/run','/api/jobs/run'].includes(path)&&method==='POST') return json(await generate(await body(request),env,operator));
    const feedbackPath=path.match(/^\/api\/issues\/(a_[0-9a-f]{64})\/feedback$/);
    if((path==='/api/issues'&&method==='GET')||(feedbackPath&&method==='POST')) {
      if(feedbackPath&&(user.role==='guest'||request.headers.get('origin')!==url.origin)) fail(403,'등록된 구성원이 같은 사이트에서 요청해 주세요.');
      if(user.role==='guest') return json({issues:[],authorized:false});
      const found=await rows(env.DB,`SELECT a.id,a.title,a.url,a.published_at,a.source_id,j.payload FROM judgments j
        JOIN articles a ON a.id=j.article_id AND a.body_hash=j.body_hash
        JOIN source_permissions s ON s.id=a.source_id AND s.enabled=1 AND s.body_allowed=1 AND s.ai_allowed=1
        WHERE j.pipeline_version=? AND json_extract(j.payload,'$.decision')='candidate' AND json_extract(j.payload,'$.reviewRequired')=0
        AND (json_extract(j.payload,'$.importance')>=? OR json_extract(j.payload,'$.reviewedBy') IS NOT NULL)
        AND json_extract(json_extract(j.payload,'$.stateFingerprint'),'$[0]')=a.title
        AND json_extract(json_extract(j.payload,'$.stateFingerprint'),'$[2]')=a.source_id
        AND json_extract(json_extract(j.payload,'$.stateFingerprint'),'$[3]')=a.published_at
        AND json_extract(json_extract(j.payload,'$.stateFingerprint'),'$[4]')=?
        AND (?=1 OR EXISTS (SELECT 1 FROM json_each(json_extract(j.payload,'$.departments')) WHERE value=?))
        AND (? IS NULL OR a.id=?)
        ORDER BY a.published_at DESC,a.id LIMIT 60`,
        PIPELINE_VERSION,JEV_THRESHOLDS.briefScore,env.TYPESAFE_MODEL||'jev-latest',+(user.role==='admin'),user.departmentId||'',feedbackPath?.[1]||null,feedbackPath?.[1]||null);
      if(feedbackPath) {
        const issue=found[0];if(!issue) fail(404,'신고할 수 있는 이슈가 없습니다.');
        const p=await body(request),note=typeof p.note==='string'?p.note.trim():'';
        if(note.length<5||note.length>400) fail(400,'수정 이유를 5~400자로 적어 주세요.');
        const suggested=department(p.leadDepartmentId);
        const saved=await run(env.DB,"UPDATE judgments SET payload=json_set(payload,'$.feedback',json(?)),updated_at=? WHERE article_id=? AND pipeline_version=? AND payload=? AND json_extract(payload,'$.feedback') IS NULL",JSON.stringify({note,leadDepartmentId:suggested,reportedBy:user.userId,reportedAt:now()}),now(),issue.id,PIPELINE_VERSION,issue.payload);
        if(!saved.meta?.changes) fail(409,'이미 검토 요청이 있거나 배분이 변경됐습니다. 목록을 새로고침해 주세요.');
        await audit(env,user.userId,'article.feedback',issue.id);
        return json({submitted:true});
      }
      return json({authorized:true,issues:found.flatMap(r=>{
        const j=JSON.parse(r.payload);if(!DEPARTMENT_IDS.includes(j.leadDepartmentId))return [];
        const urgent=!!j.urgencyCandidate&&!j.feedback&&Date.now()-Date.parse(r.published_at)<72*3600000;
        const support=j.supportDepartmentIds||[];
        return [{id:r.id,title:r.title,url:r.url,publishedAt:r.published_at,source:SOURCES.find(s=>s.id===r.source_id)?.name||r.source_id,lead:j.leadDepartmentId,support,actions:Object.fromEntries(j.departments.map(d=>[d,ISSUE_ACTIONS[d]])),joint:support.length?"협조팀은 아래 검토 결과를 주관팀에 공유하고, 주관팀은 기사 근거와 함께 후속 조치와 담당 일정을 정리합니다.":null,evidence:j.evidence,urgent,reviewed:!!j.reviewedBy,feedbackPending:!!j.feedback}];
      })});
    }
    if(path==='/api/admin/runs'&&method==='GET') return json({runs:(await rows(env.DB,'SELECT * FROM runs ORDER BY updated_at DESC LIMIT 30')).map(r=>({id:r.id,status:r.status,departmentId:r.department_id,windowId:r.window_id,createdAt:r.created_at,error:r.error,counts:JSON.parse(r.counts)}))});
    if(path==='/api/admin/review'&&method==='GET') {
      const found=await rows(env.DB,"SELECT a.*,j.payload FROM judgments j JOIN articles a ON a.id=j.article_id JOIN source_permissions s ON s.id=a.source_id AND s.enabled=1 AND s.body_allowed=1 AND s.ai_allowed=1 WHERE j.body_hash=a.body_hash AND j.pipeline_version=? AND (json_extract(j.payload,'$.reviewRequired')=1 OR json_extract(j.payload,'$.feedback') IS NOT NULL) ORDER BY j.updated_at ASC LIMIT 40",PIPELINE_VERSION);
      return json({articles:found.map(r=>({...articleRecord(r),judgment:JSON.parse(r.payload)}))});
    }
    if(path.startsWith('/api/admin/review/')&&method==='PUT') {
      const id=decodeURIComponent(path.split('/').pop()),p=await body(request),a=await first(env.DB,'SELECT * FROM articles WHERE id=?',id);
      if(!a) fail(404,'기사가 없습니다.');
      if(!['candidate','irrelevant'].includes(p.decision)||!Array.isArray(p.supportDepartmentIds)||p.supportDepartmentIds.length>5) fail(400,'처리 결과와 협조팀을 확인해 주세요.');
      const lead=p.decision==='candidate'?department(p.leadDepartmentId):null;
      const support=lead?[...new Set(p.supportDepartmentIds.map(department))]:[];
      if(support.includes(lead)) fail(400,'주관팀은 협조팀에서 제외해 주세요.');
      const old=await first(env.DB,'SELECT * FROM judgments WHERE article_id=? AND pipeline_version=? AND body_hash=?',id,PIPELINE_VERSION,a.body_hash);if(!old) fail(400,'현재 기사에 대한 Jev 판단 후 검토할 수 있습니다.');
      const previous=JSON.parse(old.payload);
      if(previous.stateFingerprint!==JSON.stringify([a.title,a.body_hash,a.source_id,a.published_at,env.TYPESAFE_MODEL||'jev-latest'])) fail(409,'기사나 모델이 변경됐습니다. 다시 분류해 주세요.');
      const evidence=typeof p.evidence==='string'?p.evidence.trim():previous.evidence;
      if(evidence&&(evidence.length>400||!a.body.includes(evidence))) fail(400,'근거는 원문과 일치하는 문장을 사용해 주세요.');
      const {feedback,...prior}=previous;
      const judgment={...prior,decision:p.decision,leadDepartmentId:lead,supportDepartmentIds:support,departments:lead?[lead,...support]:[],urgencyCandidate:!!(lead&&evidence&&previous.probabilities?.urgency>=JEV_THRESHOLDS.yes&&previous.importance>=JEV_THRESHOLDS.urgentScore),evidence:evidence||null,reviewRequired:false,reviewedBy:user.userId,reviewedAt:now()};
      const saved=await run(env.DB,'UPDATE judgments SET payload=?,updated_at=? WHERE article_id=? AND pipeline_version=? AND body_hash=? AND payload=?',JSON.stringify(judgment),now(),id,PIPELINE_VERSION,a.body_hash,old.payload);
      if(!saved.meta?.changes) fail(409,'배분이 변경됐습니다. 검토 목록을 새로고침해 주세요.');
      await audit(env,user.userId,'article.review',id);return json({updated:true});
    }
    if(path==='/api/reports'||path==='/api/admin/reports') {
      if(method!=='GET') fail(405,'지원하지 않는 요청입니다.');
      if(user.role==='guest') return json({reports:[],message:'로그인 후 관리자가 부서를 배정하면 실제 보고서를 볼 수 있습니다.'});
      const dept=user.role==='admin'?url.searchParams.get('departmentId'):user.departmentId;
      const month=url.searchParams.get('month');if(dept) department(dept);if(month&&!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) fail(400,'월을 YYYY-MM 형식으로 지정해 주세요.');
      let sql='SELECT * FROM reports WHERE 1=1';const params=[];
      if(dept){sql+=' AND department_id=?';params.push(dept);}if(user.role!=='admin'||path==='/api/reports'){sql+=" AND status='published'";}
      if(month){sql+=" AND json_extract(window_json,'$.reportDate') LIKE ?";params.push(`${month}%`);}
      sql+=' ORDER BY created_at DESC LIMIT 100';return json({reports:(await rows(env.DB,sql,...params)).map(r=>reportRecord(r))});
    }
    const pub=path.match(/^\/api\/admin\/reports\/([^/]+)\/publish$/);
    if(pub&&method==='POST') {
      const p=await body(request);if(p.reviewed!==true) fail(400,'출처와 본문을 검토한 뒤 발행해 주세요.');
      const r=await first(env.DB,'SELECT * FROM reports WHERE id=?',pub[1]);if(!r) fail(404,'보고서가 없습니다.');
      if(r.status==='published') return json({report:reportRecord(r,true)});
      const payload=JSON.parse(r.payload),registry=await sources(env);const allowed=new Set(registry.filter(s=>s.enabled&&s.canSummarize).map(s=>s.id));
      for(const s of payload.sources) {const a=await first(env.DB,'SELECT source_id,body_hash,title FROM articles WHERE id=?',s.id);if(!a||!allowed.has(a.source_id)) fail(409,'이용 권한이 변경된 출처가 있어 발행할 수 없습니다.');if(a.body_hash!==s.bodyHash||a.title!==s.title)fail(409,'근거 기사가 수정되었습니다. 기존 초안을 삭제하고 다시 생성·검토해 주세요.');}
      payload.provenance.factualReview='human-approved';payload.provenance.reviewedBy=user.userId;payload.provenance.reviewedAt=now();
      await run(env.DB,"UPDATE reports SET status='published',published_at=?,updated_at=?,payload=? WHERE id=? AND status='draft'",now(),now(),JSON.stringify(payload),r.id);
      await audit(env,user.userId,'report.publish',r.id);return json({report:reportRecord(await first(env.DB,'SELECT * FROM reports WHERE id=?',r.id),true)});
    }
    const detail=path.match(/^\/api\/reports\/([^/]+)$/);
    if(detail&&method==='GET') {const r=await first(env.DB,'SELECT * FROM reports WHERE id=?',detail[1]);if(!r) fail(404,'보고서가 없습니다.');authorizeReport(user,r);return json({report:reportRecord(r,true)});}
    const draft=path.match(/^\/api\/admin\/reports\/([^/]+)$/);
    if(draft&&method==='DELETE') {const p=await body(request);if(p.confirm!==true)fail(400,'초안 삭제를 확인해 주세요.');const r=await first(env.DB,'SELECT * FROM reports WHERE id=?',draft[1]);if(!r||r.status!=='draft')fail(409,'초안만 삭제할 수 있습니다. 발행본은 유지합니다.');await run(env.DB,"DELETE FROM reports WHERE id=? AND status='draft'",r.id);await audit(env,user.userId,'report.draft.delete',r.id);return json({deleted:true});}
    fail(404,'요청한 API가 없습니다.');
  } catch(e) { return json({error:e instanceof HttpError?e.message:'요청을 처리하지 못했습니다. 입력 또는 서버 연결 상태를 확인해 주세요.'},e instanceof HttpError?e.status:400); }
}
