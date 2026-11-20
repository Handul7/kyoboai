import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {calculateMetrics,validateEvaluationFixture} from "../scripts/evaluate-jev.mjs";
import profiles from "../department-profiles.json" with {type:"json"};

test("metrics compute relevance and multi-label department mistakes without model calls",()=>{
  const cases=[
    {id:"a",label:{relevant:true,departments:["actuarial","security"],review:false}},
    {id:"b",label:{relevant:false,departments:[],review:false}},
    {id:"c",label:{relevant:true,departments:["einsurance"],review:true}},
    {id:"d",label:{relevant:null,departments:[],review:true}}
  ];
  const predictions=[
    {id:"a",relevance:.95,departments:["actuarial","tm"],reviewRequired:false},
    {id:"b",relevance:.9,departments:["actuarial"],reviewRequired:false},
    {id:"c",relevance:.5,departments:[],reviewRequired:true},
    {id:"d",relevance:.5,departments:[],reviewRequired:true}
  ];
  const metrics=calculateMetrics(cases,predictions);
  assert.equal(metrics.relevance.precision,.5);
  assert.equal(metrics.relevance.recall,.5);
  assert.equal(metrics.relevance.abstained,2);
  assert.equal(metrics.departmentMicro.tp,1);
  assert.equal(metrics.departmentMicro.fp,2);
  assert.equal(metrics.departmentMicro.fn,2);
  assert.equal(metrics.departmentMicro.precision,1/3);
  assert.equal(metrics.departmentMicro.recall,1/3);
  assert.equal(metrics.departmentMacro.precision,.25);
  assert.equal(metrics.departmentMacro.recall,1/3);
  assert.equal(metrics.reviewRate,.5);
  assert.equal(metrics.expectedReviewRecall,1);
  assert.equal(metrics.knownLabelCases,3);
  assert.deepEqual(metrics.mismatches.map(m=>m.id),["a","b","c"]);
});
test("missing predictions are failures and not perfect recall; undefined metrics are null",()=>{
  const result=calculateMetrics([{id:"a",label:{relevant:true,departments:["security"],review:false}}],[]);
  assert.equal(result.completed,0);assert.equal(result.failed,1);
  assert.equal(result.relevance.precision,null);assert.equal(result.relevance.recall,null);
  assert.deepEqual(result.failedIds,["a"]);
});
test("representative draft cases cover a lead assignment for each active team and allow legacy labels",async()=>{
  const fixture=JSON.parse(await readFile(new URL("./fixtures/jev-evaluation.json",import.meta.url),"utf8"));
  validateEvaluationFixture(fixture);
  const departments=new Set(profiles.map(profile=>profile.id));
  assert.deepEqual(new Set(fixture.cases.filter(c=>c.label.lead).map(c=>c.label.lead)),departments);
  assert.ok(fixture.cases.some(c=>c.label.departments.length>1&&c.label.lead));
  assert.ok(fixture.cases.some(c=>c.sector==="life"));
  assert.ok(fixture.cases.some(c=>c.sector==="nonlife"));
  assert.ok(fixture.cases.some(c=>c.label.relevant===false));
  assert.equal(fixture.cases.filter(c=>c.label.relevant===null).length,2);
  assert.throws(()=>validateEvaluationFixture({...fixture,labelStatus:"verified_ground_truth"}));
  const legacy=structuredClone(fixture);
  legacy.cases=legacy.cases.slice(0,16);
  for(const example of legacy.cases)delete example.label.lead;
  assert.equal(validateEvaluationFixture(legacy).cases.length,16);
  const invalid=structuredClone(fixture);
  invalid.cases[0].label.lead="unlisted";
  assert.throws(()=>validateEvaluationFixture(invalid),/routing_label/);
});
test("role metrics detect swapped lead and support, and skip cases with no role labels",()=>{
  const label={relevant:true,departments:["legal_support","claims_review"],lead:"legal_support",review:false};
  const cases=[{id:"correct",label},{id:"swapped",label},{id:"old",label:{relevant:false,departments:[],review:false}}];
  const predictions=[
    {id:"correct",relevance:1,departments:label.departments,leadDepartmentId:"legal_support",supportDepartmentIds:["claims_review"],reviewRequired:false},
    {id:"swapped",relevance:1,departments:label.departments,leadDepartmentId:"claims_review",supportDepartmentIds:["legal_support"],reviewRequired:false},
    {id:"old",relevance:0,departments:[],reviewRequired:false}
  ];
  const metrics=calculateMetrics(cases,predictions);
  assert.equal(metrics.departmentMicro.precision,1);
  assert.deepEqual(metrics.routing,{labeledCases:2,leadAccuracy:.5,supportExactMatch:.5});
  assert.deepEqual(metrics.mismatches,[{id:"swapped",reasons:["lead_mismatch","support_set_mismatch"]}]);
});
