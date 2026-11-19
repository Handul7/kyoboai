import { PressError, PRESS_GPT_MODEL } from './press.mjs';

const legacyCookie='__Host-kyobo-jev';
const bindingName=(provider,id)=>'__Host-kyobo-'+provider+'-session-'+id;
const cookieFlags='Path=/; SameSite=Strict; Secure; HttpOnly';
const idPattern=/^[0-9a-f]{32}$/;
const encode64=bytes=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const decode64=value=>Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),ch=>ch.charCodeAt(0));
async function browserCipher(env){
  if(!/^[\da-f]{64}$/i.test(env.JEV_BROWSER_SEAL_KEY||''))throw new PressError(503,'API 세션 암호화 설정을 확인해 주세요.');
  const bytes=Uint8Array.from(env.JEV_BROWSER_SEAL_KEY.match(/../g),v=>parseInt(v,16));
  return crypto.subtle.importKey('raw',bytes,'AES-GCM',false,['encrypt','decrypt']);
}
function cookieValue(request,name){
  const pair=(request.headers.get('cookie')||'').split(';').map(p=>p.trim()).find(p=>p.startsWith(name+'='));
  return pair?.slice(name.length+1);
}
export function expireLegacyConnection(request,response){
  if(cookieValue(request,legacyCookie))response.headers.append('Set-Cookie',legacyCookie+'=; Max-Age=0; '+cookieFlags);
  return response;
}
function sessionParts(request,provider){
  const header=request.headers.get('authorization')||'';
  if(header.length>1500)return null;
  const scheme=provider==='gpt'?'GptSession ':'JevSession ';
  if(!header.startsWith(scheme))return null;
  return /^([0-9a-f]{32})\.([\w-]{16})\.([\w-]{23,710})$/.exec(header.slice(scheme.length));
}
function cipherOptions(iv,origin,id,binding,provider){
  return {name:'AES-GCM',iv,additionalData:new TextEncoder().encode(['kyobo-'+provider+'-v2',origin,id,binding].join(' '))};
}
export async function sessionKey(request,env,provider){
  const parts=sessionParts(request,provider);
  if(!parts)return null;
  const [,id,iv,encrypted]=parts,binding=cookieValue(request,bindingName(provider,id));
  if(!binding || !idPattern.test(binding))return null;
  const cipher=await browserCipher(env);
  try{
    const plain=await crypto.subtle.decrypt(cipherOptions(decode64(iv),new URL(request.url).origin,id,binding,provider),cipher,decode64(encrypted));
    return new TextDecoder().decode(plain);
  }catch{return null;}
}
export async function browserConnection(request,input,env,fetcher=fetch){
  const origin=new URL(request.url);
  if(request.headers.get('origin')!==origin.origin)throw new PressError(403,'같은 사이트에서만 연결을 변경할 수 있습니다.');
  if(origin.protocol!=='https:'&&!['localhost','127.0.0.1','[::1]'].includes(origin.hostname))throw new PressError(400,'HTTPS 주소에서 연결해 주세요.');
  const provider=input.provider===undefined?'jev':input.provider;
  if(provider!=='jev'&&provider!=='gpt')throw new PressError(400,'연결할 API를 확인해 주세요.');
  const isGpt=provider==='gpt',label=isGpt?'OpenAI':'TypeSafe';
  const headers=new Headers({'Cache-Control':'no-store','Vary':'Cookie, Authorization','X-Content-Type-Options':'nosniff'});
  if(input.action==='disconnect'){
    const parts=sessionParts(request,provider);
    if(parts)headers.set('Set-Cookie',bindingName(provider,parts[1])+'=; Max-Age=0; '+cookieFlags);
    return Response.json({connected:false},{headers});
  }
  if(input.action!=='connect')throw new PressError(400,'새로고침한 뒤 이 탭에서 API 키를 연결해 주세요.');
  const match=/^Bearer ([!-~]{1,512})$/i.exec(request.headers.get('authorization')||'');
  if(!match)throw new PressError(400,'가림 표시나 공백이 없는 API 키 원본을 입력해 주세요.');
  const cipher=await browserCipher(env);
  const model=isGpt?PRESS_GPT_MODEL:env.TYPESAFE_MODEL||'jev-latest';
  const modelsUrl=isGpt?'https://api.openai.com/v1/models/'+model:'https://api.typesafe.ai/v1/models';
  let response;
  try{response=await fetcher(modelsUrl,{headers:{Authorization:'Bearer '+match[1],Accept:'application/json'},redirect:'manual',signal:AbortSignal.timeout(12000)});}
  catch{throw new PressError(502,label+'에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.');}
  if(!response.ok){
    await response.body?.cancel();
    if([401,403].includes(response.status))throw new PressError(401,label+'에서 키를 인증하지 못했습니다. 활성 상태인 키 원본을 확인해 주세요.');
    throw new PressError(502,label+'에서 모델 접근 권한을 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.');
  }
  const data=await response.json().catch(()=>null);
  const available=isGpt?data?.id===model:Array.isArray(data?.models)&&data.models.some(m=>m.name===model);
  if(!available)throw new PressError(422,'이 키로 '+model+' 모델을 사용할 수 없습니다.');
  // A ticket or its browser binding alone cannot authorize a provider request.
  const id=crypto.randomUUID().replaceAll('-','');
  const binding=crypto.randomUUID().replaceAll('-','');
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const sealed=await crypto.subtle.encrypt(cipherOptions(iv,origin.origin,id,binding,provider),cipher,new TextEncoder().encode(match[1]));
  headers.set('Set-Cookie',bindingName(provider,id)+'='+binding+'; '+cookieFlags);
  return Response.json({connected:true,session:[id,encode64(iv),encode64(new Uint8Array(sealed))].join('.')},{headers});
}
