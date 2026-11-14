import {readFile,mkdir,writeFile} from "node:fs/promises";
import {fileURLToPath,pathToFileURL} from "node:url";
import {resolve,dirname} from "node:path";
import {DEPARTMENT_IDS,JEV_THRESHOLDS} from "../server/core.mjs";
import {classifyArticle} from "../server/providers.mjs";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const ratio=(numerator,denominator)=>denominator?numerator/denominator:null;
const average=values=>{const measured=values.filter(x=>x!==null);return measured.length?measured.reduce((a,b)=>a+b,0)/measured.length:null;};
const metric=counts=>({...counts,precision:ratio(counts.tp,counts.tp+counts.fp),recall:ratio(counts.tp,counts.tp+counts.fn)});

/** Recall counts abstained positives as missed among successful calls; failures are separate. */
export function calculateMetrics(cases,predictions) {
  const byId=new Map(predictions.map(p=>[p.id,p]));
  const relevance={tp:0,fp:0,fn:0,tn:0,abstained:0};
  const departments=Object.fromEntries(DEPARTMENT_IDS.map(id=>[id,{tp:0,fp:0,fn:0}]));
  let completed=0,reviewed=0,expectedReview=0,expectedReviewCaught=0,knownLabels=0;
  const mismatches=[],failedIds=[];
  for(const example of cases) {
    const prediction=byId.get(example.id),result=prediction?.result||prediction;
    if(!result||prediction.error||!Number.isFinite(result.relevance)||result.relevance<0||result.relevance>1||!Array.isArray(result.departments)||result.departments.some(id=>!DEPARTMENT_IDS.includes(id))||typeof result.reviewRequired!=="boolean") {failedIds.push(example.id);continue;}
    completed++;
    if(result.reviewRequired)reviewed++;
    if(example.label.review) {expectedReview++;if(result.reviewRequired)expectedReviewCaught++;}
    const reasons=[];
    const predicted=result.relevance>=JEV_THRESHOLDS.yes?true:result.relevance<=JEV_THRESHOLDS.no?false:null;
    if(predicted===null)relevance.abstained++;
    if(example.label.relevant!==null) {
      knownLabels++;
      if(example.label.relevant===true) {if(predicted===true)relevance.tp++;else relevance.fn++;}
      else if(predicted===true)relevance.fp++;else if(predicted===false)relevance.tn++;
      if(predicted!==example.label.relevant)reasons.push(predicted===null?"relevance_abstained":"relevance_mismatch");
      for(const id of DEPARTMENT_IDS) {
        const expected=example.label.departments.includes(id),actual=result.departments.includes(id);
        if(expected&&actual)departments[id].tp++;
        else if(!expected&&actual)departments[id].fp++;
        else if(expected&&!actual)departments[id].fn++;
        if(expected!==actual)reasons.push(`${actual?"extra":"missing"}_department:${id}`);
      }
    }
    if(example.label.review!==result.reviewRequired)reasons.push("review_route_mismatch");
    if(reasons.length)mismatches.push({id:example.id,reasons});
  }
  const byDepartment=Object.fromEntries(Object.entries(departments).map(([id,counts])=>[id,metric(counts)]));
  const total=Object.values(departments).reduce((sum,d)=>({tp:sum.tp+d.tp,fp:sum.fp+d.fp,fn:sum.fn+d.fn}),{tp:0,fp:0,fn:0});
  return {totalCases:cases.length,completed,completionRate:ratio(completed,cases.length),failed:failedIds.length,knownLabelCases:knownLabels,relevance:metric(relevance),departmentMicro:metric(total),departmentMacro:{precision:average(Object.values(byDepartment).map(d=>d.precision)),recall:average(Object.values(byDepartment).map(d=>d.recall))},byDepartment,reviewRate:ratio(reviewed,completed),expectedReviewRecall:ratio(expectedReviewCaught,expectedReview),mismatches,failedIds};
}

export function validateEvaluationFixture(fixture) {
  if(fixture?.provenance!=="authored_test_cases_not_real_news"||fixture.labelStatus!=="draft_labels_require_human_review"||!Array.isArray(fixture.cases)||fixture.cases.length<12||fixture.cases.length>16)throw new Error("invalid_evaluation_fixture");
  const ids=new Set();
  for(const example of fixture.cases) {
    if(typeof example.id!=="string"||!example.id||ids.has(example.id)||typeof example.title!=="string"||typeof example.body!=="string"||example.body.length<40||!example.label||![true,false,null].includes(example.label.relevant)||!Array.isArray(example.label.departments)||example.label.departments.some(id=>!DEPARTMENT_IDS.includes(id))||typeof example.label.review!=="boolean")throw new Error("invalid_evaluation_case");
    ids.add(example.id);
  }
  return fixture;
}

export async function main(args=process.argv.slice(2),env=process.env) {
  if(args.some(arg=>!["--live","--write-results"].includes(arg)))throw new Error("Use --live for API calls and --write-results for ignored local metrics output.");
  const fixture=validateEvaluationFixture(JSON.parse(await readFile(resolve(root,"tests/fixtures/jev-evaluation.json"),"utf8")));
  const live=args.includes("--live");
  const output={fixtureVersion:fixture.version,labelStatus:fixture.labelStatus,mode:live?"live_evaluation":"dry_run_no_api_calls",model:env.TYPESAFE_MODEL||"jev-latest",caseCount:fixture.cases.length,questionsPerCase:"10~11",thresholds:JEV_THRESHOLDS,thresholdsValidated:false,notes:["작성한 가상 기사와 초안 라벨입니다. 실제 보도나 검증 완료 정답셋이 아닙니다.","기준 라벨은 보험 업무 담당자가 검토해야 합니다.","정확도 지표는 성공한 호출에 대해 계산하며 실패 건수·완료율을 별도로 표시합니다.","알려진 양성 사례의 판단 유보는 재현율에서 누락으로 계산합니다.","모호한 정답(relevant=null)은 관련성·부서 점수에서 제외하고 검토 경로를 따로 평가합니다.","소규모 표본 점수는 운영 정확도나 자동 발행의 근거가 아닙니다."]};
  if(live) {
    if(!env.TYPESAFE_API_KEY?.trim())throw new Error("TYPESAFE_API_KEY server environment variable is required for --live.");
    const predictions=[];
    for(const example of fixture.cases) {
      const article={id:example.id,title:example.title,body:example.body,sourceId:"authored-evaluation",publishedAt:"2026-11-13T00:00:00.000Z"};
      try {
        const result=await classifyArticle(article,env);
        predictions.push({id:example.id,result:{relevance:result.relevance,departments:result.departments,reviewRequired:result.reviewRequired},model:result.model,usage:result.usage});
      } catch(error) {
        predictions.push({id:example.id,error:typeof error.code==="string"?error.code:"evaluation_request_failed"});
        // Invalid credentials should stop this paid run rather than repeating all examples.
        if(error.code==="provider_authentication_failed"||error.code==="typesafe_not_configured")break;
      }
    }
    output.metrics=calculateMetrics(fixture.cases,predictions);
    output.resolvedModels=[...new Set(predictions.filter(p=>p.model).map(p=>p.model))];
    output.usage=predictions.reduce((sum,p)=>({inputTokens:sum.inputTokens+(Number(p.usage?.input_tokens)||0),outputTokens:sum.outputTokens+(Number(p.usage?.output_tokens)||0)}),{inputTokens:0,outputTokens:0});
    output.executedAt=new Date().toISOString();
  } else output.caseIds=fixture.cases.map(example=>example.id);
  if(args.includes("--write-results")) {
    await mkdir(resolve(root,"outputs"),{recursive:true});
    await writeFile(resolve(root,"outputs/jev-evaluation-results.json"),JSON.stringify(output,null,2)+"\n");
  }
  console.log(JSON.stringify(output,null,2));
  return output;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error=>{console.error(error.message);process.exitCode=1;});
}
