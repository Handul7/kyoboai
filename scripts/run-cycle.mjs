// Use from a server scheduler only. This is not installed as an automation yet.
import { DEPARTMENT_IDS, reportWindow } from '../server/core.mjs';
const args=process.argv.slice(2);
const kind=args.includes('--monthly')?'monthly':'brief';
const date=args.find(a=>/^\d{4}-\d{2}(?:-\d{2})?$/.test(a));
if(!date){console.log('Usage: node scripts/run-cycle.mjs YYYY-MM-DD [--monthly] [--live]\nDefault: plan only, no HTTP requests. --monthly accepts YYYY-MM.');process.exit(0);}
const window=reportWindow(date,kind);
if(!args.includes('--live')){console.log(JSON.stringify({dryRun:true,window,departments:DEPARTMENT_IDS,steps:['collect','classify and draft each department','human review and publish']},null,2));process.exit(0);}
const base=new URL(process.env.SITE_URL||'');
if(base.protocol!=='https:'||base.username||base.password||!process.env.JOB_TOKEN)throw Error('Configure HTTPS SITE_URL and server-only JOB_TOKEN.');
const headers={'Content-Type':'application/json',Authorization:`Bearer ${process.env.JOB_TOKEN}`};
if(process.env.SITES_ACCESS_TOKEN)headers['OAI-Sites-Authorization']=`Bearer ${process.env.SITES_ACCESS_TOKEN}`;
async function post(path,data){const response=await fetch(new URL(path,base),{method:'POST',headers,body:JSON.stringify(data),redirect:'error',signal:AbortSignal.timeout(240000)});const result=await response.json();if(!response.ok)throw Error(`HTTP ${response.status}: scheduler request failed`);return result;}
const stateResponse=await fetch(new URL('/api/status',base),{headers,redirect:'error',signal:AbortSignal.timeout(30000)});
if(!stateResponse.ok)throw Error('Cannot read server limits.');
const serverState=await stateResponse.json();
const maxSteps=Math.min(51,Math.ceil((serverState.limits?.maxArticles||40)/8)+1);
const collection=await post('/api/jobs/collect',{reportDate:date,kind});
console.log(JSON.stringify({stage:'collect',stored:collection.stored}));
let failed=false;
for(const departmentId of DEPARTMENT_IDS){let result;for(let step=0;step<maxSteps;step++){result=await post('/api/jobs/run',{reportDate:date,kind,departmentId});if(result.status!=='pending')break;}console.log(JSON.stringify({departmentId,status:result.status,counts:result.counts,reportId:result.reportId}));if(['failed','blocked','pending'].includes(result.status))failed=true;}
if(failed)process.exitCode=1;
