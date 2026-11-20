import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const published=runInNewContext(read('published-news.js')+'; PUBLISHED_NEWS');
const issue=published.find(story=>story.reviews.some(team=>team.department && team.reason && team.checks?.length));
const review=issue.reviews.find(team=>team.department);
const roster=JSON.parse(read('department-profiles.json'));
const edited=roster.find(r=>r.id==='tm');
const newTeam=roster.find(r=>r.id==='claims_review');
const override={name:edited.name,role:'전자 청약의 본인 확인 절차를 점검합니다.',keywords:'인증, 신청, 접수'};

for(const mode of ['link','period']){
  test(mode+' results and PDF use the executed criteria and only Jev-matched teams',async()=>{
    const article={...issue.sources[0]},other={...article,url:'https://example.com/news/2',title:'보험사, 인증 절차 개선'};
    const articles=[article,other,{...other,url:'https://example.com/news/3',title:'보험금 지급 기준 변경'},{...other,url:'https://example.com/news/4',title:'모바일 인증 안내'},{...other,url:'https://example.com/news/5',title:'기타 소식'}];
    const nodes=new Map();
    const element=selector=>{
      if(!nodes.has(selector))nodes.set(selector,{value:'',innerHTML:'',setAttribute(){},replaceChildren(){this.innerHTML='';}});
      return nodes.get(selector);
    };
    let report,criteria;
    const context={
      document:{querySelector:element,querySelectorAll:()=>[]},window:{addEventListener(){},downloadIssuePdf:async data=>{report=data;}},
      location:{hash:mode==='link'?'#link':'#collect'},PUBLISHED_NEWS:published,NEWS_RESEARCH:{outlets:{},reports:[]},
      performance:{getEntriesByType:()=>[{type:'reload'}]},sessionStorage:{getItem:key=>key.includes('.jev.')?'test-ticket':null},
      localStorage:{getItem:key=>key.endsWith('v2')?JSON.stringify([{...override,name:'다이렉트(TM영업)'}]):null},
      fetch:async(path,options)=>{
        if(path.endsWith('department-profiles.json'))return Response.json(roster);
        if(path.endsWith('settings'))return Response.json({jevConfigured:true});
        if(path.endsWith('judge')){
          criteria=JSON.parse(options.body).roles;
          return Response.json({answers:[review.department,edited.name,newTeam.name,edited.name,null].map(name=>({
            status:'참고',importance:1,basis:'제목',matches:name?[{name}]:[],model:'test'
          }))});
        }
        assert.ok(path.endsWith(mode==='link'?'link':'collect'));
        return Response.json({id:'run',kind:mode,articles,from:'2026-11-16',to:'2026-11-20',jevConfigured:true,batchSize:articles.length});
      }
    };
    runInNewContext(read('public-desk.js'),context);
    element(mode==='link'?'#link-form':'#run-form').onsubmit({preventDefault(){}});
    await new Promise(setImmediate);
    assert.deepEqual(criteria.find(r=>r.name===edited.name),override);
    assert.equal(criteria.length,roster.length);
    const html=element('#results').innerHTML;
    assert.equal((html.match(/<details class="live-review"/g)||[]).length,4);
    assert.ok(html.includes(newTeam.check));
    assert.ok(html.includes(review.reason) && html.includes(review.checks[0]));
    assert.ok(html.includes(override.role));
    assert.match(html,/제목에서 확인한 키워드<\/b> 인증<\/p>/);
    element('#download-list').onclick({currentTarget:{}});
    const lines=report.sections.find(section=>section.title==='부서별 검토 기준').lines.join('\n');
    assert.ok(lines.includes(edited.name+' · [2] [4]'));
    assert.ok(lines.includes(newTeam.name+' · [3]') && lines.includes(newTeam.check));
    assert.ok(lines.includes(review.checks[0]) && lines.includes(override.role));
    assert.ok(lines.includes('제목에서 확인한 키워드 — 인증'));
  });
}
