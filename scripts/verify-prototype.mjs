import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
export async function readPrototypeData(){
  const source=await readFile(resolve(root,"data.js"),"utf8");
  return JSON.parse(vm.runInNewContext(`${source}\n;JSON.stringify({sample:true,pipeline:PIPELINE_METADATA,departments:DEPARTMENTS,articles:ARTICLE_SAMPLES,reports:REPORTS.map(report=>({...report,articleIds:getReportArticles(report.id).map(article=>article.id),briefings:Object.fromEntries(DEPARTMENTS.map(dept=>[dept.id,getReportBrief(dept.id,report.id)]))})),publications:REPORT_PUBLICATIONS});`));
}
const sorted=items=>[...items].sort();
export function verifyPrototypeData(data){
  assert.equal(data.sample,true,"This deployment is a prototype fixture.");
  assert.equal(data.pipeline.classification.apiInvoked,false,"Do not claim live Jev inference.");
  assert.equal(data.pipeline.analysis.apiInvoked,false,"Do not claim live LLM analysis.");
  assert.equal(data.pipeline.collection.scraperImplemented,false,"The collector is a simulation.");
  assert.equal(data.pipeline.authorization.mode,"not_implemented","Do not imply authentication exists.");
  const departmentIds=data.departments.map(d=>d.id);
  assert.equal(new Set(departmentIds).size,6,"Six unique departments are expected.");
  assert.deepEqual(sorted(data.reports.map(r=>r.id)),["monday","thursday"]);
  assert.equal(new Set(data.articles.map(a=>a.id)).size,data.articles.length,"Article IDs must be unique.");
  const normalizedTitles=data.articles.map(a=>a.title.normalize("NFKC").replace(/[\p{P}\p{S}\s]/gu,"").toLowerCase());
  assert.equal(new Set(normalizedTitles).size,data.articles.length,"Duplicate sample headlines must be removed.");
  const articleById=new Map(data.articles.map(article=>[article.id,article]));
  for(const article of data.articles){
    assert.ok(article.title&&article.summary&&article.reason&&article.source,`Missing evidence: ${article.id}`);
    assert.ok(article.body.length&&article.body.every(p=>typeof p==="string"&&p.trim()),`Missing sample body: ${article.id}`);
    assert.ok(article.depts.length&&article.depts.every(id=>departmentIds.includes(id)),`Unknown classification: ${article.id}`);
    assert.equal(new Set(article.depts).size,article.depts.length);
    assert.deepEqual(sorted(article.classification.departmentIds),sorted(article.depts));
    assert.equal(article.classification.apiInvoked,false);
    assert.equal(article.sourceUrl,null,"Never invent a source URL for a fictional article.");
  }
  const allCovered=new Set();
  for(const report of data.reports){
    const expectedWeekdays=report.id==="monday"?[0,4,5,6]:[1,2,3];
    assert.deepEqual(report.dates.map(date=>new Date(`${date}T12:00:00Z`).getUTCDay()).sort(),expectedWeekdays,`Wrong collection weekdays: ${report.id}`);
    const expectedArticles=data.articles.filter(a=>report.dates.includes(a.date)).map(a=>a.id);
    assert.deepEqual(sorted(report.articleIds),sorted(expectedArticles),`Missing or additional collected articles: ${report.id}`);
    for(const id of report.articleIds){assert.ok(!allCovered.has(id),`Duplicate period assignment: ${id}`);allCovered.add(id);}
    for(const dept of data.departments){
      const brief=report.briefings[dept.id];
      const expectedSources=expectedArticles.filter(id=>articleById.get(id).depts.includes(dept.id));
      assert.ok(expectedSources.length,`Empty department report: ${report.id}/${dept.id}`);
      assert.deepEqual(sorted(brief.sourceIds),sorted(expectedSources),`Cross-period or cross-department evidence: ${report.id}/${dept.id}`);
      assert.equal(brief.departmentId,dept.id);assert.equal(brief.reportId,report.id);
      assert.ok(brief.title&&brief.lead&&brief.analysis&&brief.action);
      assert.equal(brief.takeaways.length,3);assert.equal(brief.evidence.length,3);
      brief.evidence.forEach(ids=>assert.ok(ids.length&&ids.every(id=>expectedSources.includes(id)),`Unsupported summary reference: ${report.id}/${dept.id}`));
    }
  }
  assert.equal(allCovered.size,data.articles.length,"Every article must belong to one collection period.");
  assert.equal(data.publications.length,12);
  assert.equal(new Set(data.publications.map(p=>p.id)).size,12);
  for(const dept of data.departments){
    const publications=data.publications.filter(p=>p.departmentId===dept.id);
    assert.deepEqual(sorted(publications.map(p=>p.collectionId)),["monday","thursday"],`Each department needs both reports: ${dept.id}`);
  }
  for(const publication of data.publications){
    assert.ok(data.reports.find(report=>report.id===publication.collectionId));
    assert.deepEqual(publication.access.audienceDepartmentIds,[publication.departmentId],"Future access scope must match the owning department.");
    assert.equal(publication.access.enforcement,"not_implemented");
    assert.equal(publication.status,"published");
  }
  // Human-reviewed examples of the intended labels; these are not model evaluations.
  const labeledExamples={n01:["risk","strategy"],n02:["product","sales"],n03:["digital","risk"],n06:["asset","risk"],n08:["risk","strategy"],n10:["sales"],p03:["digital"]};
  for(const [id,labels] of Object.entries(labeledExamples)) assert.deepEqual(sorted(articleById.get(id).depts),sorted(labels),`Reviewed fixture label changed: ${id}`);
  return {articles:data.articles.length,collections:data.reports.length,departmentReports:data.publications.length,summaryEvidenceLinks:data.reports.reduce((count,report)=>count+Object.values(report.briefings).reduce((n,brief)=>n+brief.evidence.flat().length,0),0),liveScraperTested:false,liveJevTested:false,liveLLMTested:false};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const data=await readPrototypeData();
  const result=verifyPrototypeData(data);
  const invalidCases=[
    fixture=>{fixture.reports[0].dates[0]="2026-11-02";},
    fixture=>{fixture.reports[1].briefings.strategy.sourceIds.push("n01");},
    fixture=>{fixture.publications[0].access.audienceDepartmentIds=["digital"];},
    fixture=>{fixture.reports[1].briefings.product.evidence[0]=["n18"];}
  ];
  invalidCases.forEach(mutate=>{const fixture=structuredClone(data);mutate(fixture);assert.throws(()=>verifyPrototypeData(fixture),"Invalid data must be rejected.");});
  console.log(JSON.stringify({...result,invalidFixturesRejected:invalidCases.length},null,2));
}
