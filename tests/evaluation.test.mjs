import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {calculateMetrics,validateEvaluationFixture} from "../scripts/evaluate-jev.mjs";

test("metrics compute relevance and multi-label department mistakes without model calls",()=>{
  const cases=[
    {id:"a",label:{relevant:true,departments:["product","risk"],review:false}},
    {id:"b",label:{relevant:false,departments:[],review:false}},
    {id:"c",label:{relevant:true,departments:["digital"],review:true}},
    {id:"d",label:{relevant:null,departments:[],review:true}}
  ];
  const predictions=[
    {id:"a",relevance:.95,departments:["product","sales"],reviewRequired:false},
    {id:"b",relevance:.9,departments:["product"],reviewRequired:false},
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
  const result=calculateMetrics([{id:"a",label:{relevant:true,departments:["risk"],review:false}}],[]);
  assert.equal(result.completed,0);assert.equal(result.failed,1);
  assert.equal(result.relevance.precision,null);assert.equal(result.relevance.recall,null);
  assert.deepEqual(result.failedIds,["a"]);
});
test("authored fixture contains 16 unique bounded insurance examples with explicit draft labels",async()=>{
  const fixture=JSON.parse(await readFile(new URL("./fixtures/jev-evaluation.json",import.meta.url),"utf8"));
  assert.equal(validateEvaluationFixture(fixture).cases.length,16);
  assert.ok(fixture.cases.some(c=>c.sector==="life"));
  assert.ok(fixture.cases.some(c=>c.sector==="nonlife"));
  assert.ok(fixture.cases.some(c=>c.label.relevant===false));
  assert.equal(fixture.cases.filter(c=>c.label.relevant===null).length,2);
  assert.throws(()=>validateEvaluationFixture({...fixture,labelStatus:"verified_ground_truth"}));
});
