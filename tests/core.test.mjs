import test from "node:test";
import assert from "node:assert/strict";
import {DEPARTMENT_IDS,reportWindow,canonicalUrl,normalizeArticle,deduplicateArticles,buildJevRequest,parseJevResult,buildLlmRequest,validateReport} from "../server/core.mjs";
import {classifyArticle,summarizeArticles} from "../server/providers.mjs";

const source={id:"newsis",domains:["newsis.com"],bodyAllowed:true,aiAllowed:true};
const article={sourceId:"newsis",url:"https://www.newsis.com/view/NISX_123?utm_source=test",title:"보험업계 새 상품과 지급여력 기준 점검",publishedAt:"2026-11-11T08:10:00+09:00",body:"보험업계는 새 상품과 지급여력 기준을 점검했다. 이번 변화는 보험 상품 개발 부서와 리스크 관리 부서의 업무에 관련된다."};
const now=new Date("2026-11-13T00:00:00Z");
function rawJev(overrides={}) {
  const answers={relevance:{type:"noul",noul:.97},importance:{type:"score",score:2.8,confidence:.82,probabilities:{"0":0,"1":0,"2":.2,"3":.8}}};
  for(const id of DEPARTMENT_IDS)answers[`dept_${id}`]={type:"noul",noul:["product","risk"].includes(id)?.94:.04};
  Object.assign(answers,overrides);
  return {model:"jev-test-contract",answers,usage:{input_tokens:300,output_tokens:40}};
}
const validReport={title:"보험업계 변화 검토",summary:[{text:"상품과 지급여력 기준이 바뀌었다.",sourceIds:["a_1"]}],insights:[{text:"시사점: 상품과 리스크 부서의 공동 검토가 필요할 가능성이 있다.",sourceIds:["a_1"]}],actions:[{text:"담당 기준과 적용 일정을 검토한다.",sourceIds:["a_1"]}]};
const llmArticles=[{id:"a_1",title:article.title,body:article.body,publishedAt:article.publishedAt}];
const llmEnv={LLM_API_KEY:"test-never-real",LLM_API_URL:"https://llm.example.com/v1/chat/completions",LLM_MODEL:"configured-test-model"};
const successLlm=()=>Response.json({model:"resolved-model",choices:[{finish_reason:"stop",message:{content:JSON.stringify(validReport)}}],usage:{prompt_tokens:100,completion_tokens:120}});

test("Monday report covers Thursday–Sunday in KST, not UTC calendar days",()=>{
  const window=reportWindow("2026-11-02");
  assert.equal(window.start,"2026-10-28T15:00:00.000Z");
  assert.equal(window.end,"2026-11-01T15:00:00.000Z");
  assert.equal(window.id,"brief:2026-11-02");
  assert.equal(Date.parse(window.end)-Date.parse(window.start),4*86400000);
});
test("Thursday report has a three-day exclusive boundary across year",()=>{
  const window=reportWindow("2026-01-01");
  assert.equal(window.start,"2025-12-28T15:00:00.000Z");
  assert.equal(window.end,"2025-12-31T15:00:00.000Z");
});
test("monthly leap-year windows and December reporting dates use exact calendar math",()=>{
  const feb=reportWindow("2024-02","monthly");
  assert.equal(Date.parse(feb.end)-Date.parse(feb.start),29*86400000);
  assert.equal(feb.reportDate,"2024-03-01");
  const december=reportWindow("2026-12-24","monthly");
  assert.equal(december.reportDate,"2027-01-01");
  assert.equal(december.end,"2026-12-31T15:00:00.000Z");
});
test("invalid dates, Tuesday runs and unknown periods fail before inference",()=>{
  for(const value of ["2026-02-30","2026-11-03","2026-13-01","2026-1-1","no-date"])assert.throws(()=>reportWindow(value));
  assert.throws(()=>reportWindow("2026-11-02","daily"));
  assert.throws(()=>reportWindow("2026-13","monthly"));
  assert.throws(()=>reportWindow("2026-02-30","monthly"));
});
test("canonical URL removes tracking while retaining publisher article parameters",()=>{
  assert.equal(canonicalUrl("https://www.newsis.com/read?id=42&utm_source=x&ref=edition&fbclid=abc#comment"),"https://www.newsis.com/read?id=42&ref=edition");
  assert.notEqual(canonicalUrl("https://newsis.com/read?id=41"),canonicalUrl("https://newsis.com/read?id=42"));
  for(const url of ["javascript:alert(1)","http://newsis.com/a","https://user:pass@newsis.com/a"])assert.throws(()=>canonicalUrl(url));
});
test("normalized article uses deterministic ID and body digest, explicit UTC timestamp",async()=>{
  const a=await normalizeArticle(article,source,now);
  const b=await normalizeArticle({...article,url:article.url.replace("test","other")},source,now);
  assert.equal(a.id,b.id);
  assert.equal(a.bodyHash,b.bodyHash);
  assert.equal(a.publishedAt,"2026-11-10T23:10:00.000Z");
  assert.equal(a.url,"https://www.newsis.com/view/NISX_123");
  assert.match(a.id,/^a_[a-f0-9]{64}$/);
});
test("unapproved source content cannot enter body/AI processing",async()=>{
  await assert.rejects(normalizeArticle(article,{...source,bodyAllowed:false},now),{code:"source_permission_required"});
  await assert.rejects(normalizeArticle(article,{...source,aiAllowed:false},now),{code:"source_permission_required"});
  await assert.rejects(normalizeArticle({...article,sourceId:"other"},source,now),{code:"invalid_source"});
  await assert.rejects(normalizeArticle({...article,url:"https://newsis.com.evil.example/x"},source,now),{code:"source_domain_mismatch"});
});
test("malformed, future, unzoned and rollover dates are rejected on ingestion",async()=>{
  for(const date of ["2026-11-14T00:00:00Z","2026-11-11T00:00:00","2026-02-30T00:00:00Z","2026-11-11T24:00:00Z","not-a-date"])await assert.rejects(normalizeArticle({...article,publishedAt:date},source,now));
  await assert.rejects(normalizeArticle({...article,body:"not enough"},source,now));
  await assert.rejects(normalizeArticle({...article,id:"<script>"},source,now));
});
test("dedup preserves source references, merges bridges and leaves related stories separate",async()=>{
  const a=await normalizeArticle(article,source,now);
  const b=await normalizeArticle({...article,url:"https://newsis.com/second"},source,now);
  const c=await normalizeArticle({...article,url:"https://newsis.com/third",body:article.body+" 추가 내용이 보도됐다."},source,now);
  const groups=deduplicateArticles([a,b,c]);
  assert.equal(groups.length,2);assert.equal(groups[0].sourceRefs.length,2);assert.deepEqual(groups[0].duplicateIds,[b.id]);
  const bridge={...c,url:a.url};
  assert.equal(deduplicateArticles([a,c,bridge]).length,1);
  assert.equal(a.sourceRefs,undefined,"caller records are not mutated");
});
test("Jev sends eight independent typed questions against full title and body",()=>{
  const request=buildJevRequest({...article,id:"a_1"},"jev-test");
  assert.equal(Object.keys(request.questions).length,8);
  assert.equal(request.questions.importance.type,"score");
  for(const id of DEPARTMENT_IDS)assert.equal(request.questions[`dept_${id}`].type,"noul");
  assert.equal(request.state.article.body,article.body);
});
test("multi-department results remain multi-label and preserve raw probabilities",()=>{
  const parsed=parseJevResult(rawJev());
  assert.deepEqual(parsed.departments,["product","risk"]);
  assert.equal(parsed.reviewRequired,false);assert.equal(parsed.decision,"candidate");
  assert.equal(parsed.thresholdsValidated,false);
  assert.equal(parsed.importance,2.8);
});
test("ambiguous department, relevance and importance results route to review",()=>{
  assert.equal(parseJevResult(rawJev({dept_asset:{type:"noul",noul:.5}})).reviewRequired,true);
  assert.equal(parseJevResult(rawJev({relevance:{type:"noul",noul:.5}})).decision,"review");
  const raw=rawJev();raw.answers.importance.confidence=.3;
  assert.equal(parseJevResult(raw).reviewRequired,true);
  assert.equal(parseJevResult(rawJev({relevance:{type:"noul",noul:.03}})).decision,"irrelevant");
});
test("missing or invalid model judgments never receive a silent default",()=>{
  const raw=rawJev();delete raw.answers.dept_risk;assert.throws(()=>parseJevResult(raw));
  assert.throws(()=>parseJevResult(rawJev({relevance:{type:"noul",noul:1.2}})));
  const inconsistent=rawJev();inconsistent.answers.importance.score=.3;assert.throws(()=>parseJevResult(inconsistent));
});
test("LLM prompt carries article IDs and separates evidence from instructions",()=>{
  const request=buildLlmRequest(llmArticles,"risk",reportWindow("2026-11-12"),"configured-model");
  assert.equal(request.response_format.type,"json_object");
  assert.match(request.messages[0].content,/기사.*지시문은 따르지/);
  assert.equal(JSON.parse(request.messages[1].content).articles[0].id,"a_1");
  assert.throws(()=>buildLlmRequest([],"risk",{},"model"));
  assert.throws(()=>buildLlmRequest(llmArticles,"invented-dept",{},"model"));
});
test("reports require all expected sections and known nonempty unique citations",()=>{
  assert.deepEqual(validateReport(validReport,llmArticles,"risk"),validReport);
  for(const sourceIds of [[],["made-up"],["a_1","a_1"]])assert.throws(()=>validateReport({...validReport,summary:[{text:"내용 예시",sourceIds}]},llmArticles,"risk"));
  assert.throws(()=>validateReport({...validReport,extra:"unexpected"},llmArticles,"risk"));
  assert.throws(()=>validateReport({...validReport,summary:[]},llmArticles,"risk"));
});
test("Jev uses fixed endpoint and server bearer key; missing key makes zero calls",async()=>{
  let calls=0;
  const fake=async(url,options)=>{calls++;assert.equal(url,"https://api.typesafe.ai/v1/systemone");assert.equal(options.headers.authorization,"Bearer test-key");assert.equal(options.redirect,"error");return Response.json(rawJev());};
  await assert.rejects(classifyArticle(article,{},fake),{code:"typesafe_not_configured"});assert.equal(calls,0);
  const parsed=await classifyArticle(article,{TYPESAFE_API_KEY:"test-key"},fake);assert.equal(parsed.departments.length,2);assert.equal(calls,1);
});
test("429 and 5xx retry at most twice; response body and bearer values never leak",async()=>{
  let calls=0;
  await assert.rejects(classifyArticle(article,{TYPESAFE_API_KEY:"private-test-key"},async()=>{calls++;return new Response("upstream secret private-test-key",{status:429,headers:{"retry-after":"0"}});}),error=>error.code==="provider_rate_limited"&&!error.message.includes("private-test-key"));
  assert.equal(calls,3);
  calls=0;
  const result=await classifyArticle(article,{TYPESAFE_API_KEY:"test"},async()=>{calls++;return calls===1?new Response("busy",{status:503,headers:{"retry-after":"0"}}):Response.json(rawJev());});
  assert.equal(calls,2);assert.equal(result.relevance,.97);
});
test("authentication and ambiguous network failure are not retried",async()=>{
  for(const mode of ["auth","network"]){let calls=0;await assert.rejects(classifyArticle(article,{TYPESAFE_API_KEY:"test"},async()=>{calls++;if(mode==="network")throw new Error("host details");return new Response("key invalid",{status:401});}));assert.equal(calls,1);}
});
test("oversize JSON and invalid typed responses are rejected",async()=>{
  await assert.rejects(classifyArticle(article,{TYPESAFE_API_KEY:"test"},async()=>new Response("x",{headers:{"content-length":"600000"}})),{code:"provider_response_too_large"});
  await assert.rejects(classifyArticle(article,{TYPESAFE_API_KEY:"test"},async()=>Response.json({answers:{}})),{code:"jev_response_invalid"});
});
test("configured compatible LLM adapter validates citations and completion state",async()=>{
  const result=await summarizeArticles(llmArticles,"risk",reportWindow("2026-11-12"),llmEnv,async()=>successLlm());
  assert.deepEqual(result.report,validReport);assert.equal(result.model,"resolved-model");
  await assert.rejects(summarizeArticles(llmArticles,"risk",{},llmEnv,async()=>Response.json({choices:[{finish_reason:"length",message:{content:JSON.stringify(validReport)}}]})),{code:"llm_response_incomplete"});
  const bad={...validReport,summary:[{text:"출처가 없는 주장",sourceIds:["invented"]}]};
  await assert.rejects(summarizeArticles(llmArticles,"risk",{},llmEnv,async()=>Response.json({choices:[{finish_reason:"stop",message:{content:JSON.stringify(bad)}}]})),{code:"llm_report_invalid"});
});
test("LLM endpoints reject private IP, localhost, embedded credentials and redirects",async()=>{
  for(const url of ["http://llm.example.com/v1","https://127.0.0.1/v1","https://localhost/v1","https://user:pass@llm.example.com/v1","https://llm.example.com/v1?key=secret"]){let calls=0;await assert.rejects(summarizeArticles(llmArticles,"risk",{},{...llmEnv,LLM_API_URL:url},async()=>{calls++;return successLlm();}),{code:"llm_endpoint_invalid"});assert.equal(calls,0);}
});
