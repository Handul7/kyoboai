import {buildJevRequest,parseJevResult,buildLlmRequest,validateReport} from "./core.mjs";

export class ProviderError extends Error {
  constructor(code,status=502) { super(code); this.name="ProviderError"; this.code=code; this.status=status; }
}
const MAX_RESPONSE_BYTES = 512000;
const MAX_ATTEMPTS = 3; // initial request + at most two bounded retries
const TIMEOUT_MS = 20000;
const sleep = ms=>new Promise(resolve=>setTimeout(resolve,ms));
function secret(value,name) {
  if(typeof value!=="string"||!value.trim()) throw new ProviderError(`${name}_not_configured`,503);
  return value.trim();
}
function endpoint(value) {
  let url;
  try { url=new URL(value); } catch { throw new ProviderError("llm_endpoint_invalid",503); }
  const host=url.hostname.toLowerCase();
  if(url.protocol!=="https:"||url.username||url.password||url.hash||url.search||url.port||host==="localhost"||host.endsWith(".localhost")||host.endsWith(".local")||host.endsWith(".internal")||!host.includes(".")||host.includes(":")||/^\d+(?:\.\d+){0,3}$/.test(host)) throw new ProviderError("llm_endpoint_invalid",503);
  return url.href;
}
async function readJson(response) {
  const announced=Number(response.headers.get("content-length"));
  if(Number.isFinite(announced)&&announced>MAX_RESPONSE_BYTES) {await response.body?.cancel();throw new ProviderError("provider_response_too_large");}
  const reader=response.body?.getReader();
  if(!reader) throw new ProviderError("provider_response_invalid");
  const parts=[];let size=0;
  try {
    while(true) {
      const {done,value}=await reader.read(); if(done)break;
      size+=value.length;
      if(size>MAX_RESPONSE_BYTES) { await reader.cancel(); throw new ProviderError("provider_response_too_large"); }
      parts.push(value);
    }
  } finally {reader.releaseLock();}
  const data=new Uint8Array(size);let offset=0;
  for(const part of parts){data.set(part,offset);offset+=part.length;}
  try {return JSON.parse(new TextDecoder().decode(data));}catch{throw new ProviderError("provider_response_invalid");}
}
async function requestJson(url,key,payload,fetchImpl) {
  for(let attempt=0;attempt<MAX_ATTEMPTS;attempt++) {
    const abort=new AbortController();const timer=setTimeout(()=>abort.abort(),TIMEOUT_MS);
    try {
      const response=await fetchImpl(url,{method:"POST",redirect:"error",headers:{"content-type":"application/json","authorization":`Bearer ${key}`},body:JSON.stringify(payload),signal:abort.signal});
      if(!response.ok) {
        const retryable=response.status===429||response.status>=500;
        const retryAfter=response.headers.get("retry-after");
        await response.body?.cancel();
        if(retryable&&attempt<MAX_ATTEMPTS-1) {
          clearTimeout(timer);
          let wait=250*2**attempt;
          if(retryAfter!==null) {const numeric=Number(retryAfter);wait=Number.isFinite(numeric)?numeric*1000:Date.parse(retryAfter)-Date.now();}
          await sleep(Math.min(2000,Math.max(0,Number.isFinite(wait)?wait:250)));
          continue;
        }
        throw new ProviderError(response.status===401||response.status===403?"provider_authentication_failed":response.status===429?"provider_rate_limited":"provider_request_failed",response.status===429?503:502);
      }
      return await readJson(response);
    } catch(error) {
      if(error instanceof ProviderError) throw error;
      // Ambiguous network failures are not replayed; upstream may have charged or completed.
      throw new ProviderError(abort.signal.aborted?"provider_timeout":"provider_unreachable");
    } finally {clearTimeout(timer);}
  }
  throw new ProviderError("provider_request_failed");
}

export async function classifyArticle(article,env,fetchImpl=fetch) {
  const key=secret(env.TYPESAFE_API_KEY,"typesafe");
  const payload=buildJevRequest(article,env.TYPESAFE_MODEL||"jev-latest");
  const result=await requestJson("https://api.typesafe.ai/v1/systemone",key,payload,fetchImpl);
  try{return parseJevResult(result,article);}catch{throw new ProviderError("jev_response_invalid");}
}

export async function summarizeArticles(articles,departmentId,window,env,fetchImpl=fetch) {
  const key=secret(env.LLM_API_KEY,"llm");
  const url=endpoint(secret(env.LLM_API_URL,"llm_endpoint"));
  const model=secret(env.LLM_MODEL,"llm_model");
  const payload=buildLlmRequest(articles,departmentId,window,model);
  const result=await requestJson(url,key,payload,fetchImpl);
  const choice=result?.choices?.[0];
  if(choice?.finish_reason!=="stop"||typeof choice?.message?.content!=="string"||choice.message.refusal) throw new ProviderError("llm_response_incomplete");
  let report;
  try{report=validateReport(JSON.parse(choice.message.content),articles,departmentId);}catch{throw new ProviderError("llm_report_invalid");}
  return {report,model:typeof result.model==="string"?result.model:model,usage:result.usage||{}};
}
