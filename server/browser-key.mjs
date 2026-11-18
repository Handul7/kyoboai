import { PressError } from './press.mjs';

const keyCookie='__Host-kyobo-jev';
const keyLifetime=365*24*60*60;
const encode64=bytes=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const decode64=value=>Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),ch=>ch.charCodeAt(0));
async function browserCipher(env){
  if(!/^[\da-f]{64}$/i.test(env.JEV_BROWSER_SEAL_KEY||''))throw new PressError(503,'브라우저 키 저장 설정을 확인해 주세요.');
  const bytes=Uint8Array.from(env.JEV_BROWSER_SEAL_KEY.match(/../g),v=>parseInt(v,16));
  return crypto.subtle.importKey('raw',bytes,'AES-GCM',false,['encrypt','decrypt']);
}
function cipherOptions(iv,origin){
  return {name:'AES-GCM',iv,additionalData:new TextEncoder().encode('kyobo-jev-v1 '+origin)};
}
export async function savedBrowserKey(request,env){
  const value=(request.headers.get('cookie')||'').split(';').map(p=>p.trim()).find(p=>p.startsWith(keyCookie+'='))?.slice(keyCookie.length+1);
  if(!value || value.length>1500 || !/^[\w-]+\.[\w-]+$/.test(value))return null;
  const cipher=await browserCipher(env);
  try{
    const [iv,encrypted]=value.split('.').map(decode64);
    const plain=await crypto.subtle.decrypt(cipherOptions(iv,new URL(request.url).origin),cipher,encrypted);
    const record=JSON.parse(new TextDecoder().decode(plain));
    return record.expires>Date.now()&&typeof record.key==='string'?record.key:null;
  }catch{return null;}
}
export async function browserConnection(request,input,env,fetcher=fetch){
  const origin=new URL(request.url);
  if(request.headers.get('origin')!==origin.origin)throw new PressError(403,'같은 사이트에서만 키 설정을 변경할 수 있습니다.');
  if(origin.protocol!=='https:'&&!['localhost','127.0.0.1','[::1]'].includes(origin.hostname))throw new PressError(400,'HTTPS 주소에서 키를 저장해 주세요.');
  const headers={'Cache-Control':'no-store','Vary':'Cookie, Authorization','X-Content-Type-Options':'nosniff'};
  const cookie=(value,age)=>`${keyCookie}=${value}; Max-Age=${age}; Path=/; SameSite=Strict; Secure; HttpOnly`;
  if(input.action==='forget')return Response.json({connected:false},{headers:{...headers,'Set-Cookie':cookie('',0)}});
  if(input.action!=='save')throw new PressError(400,'키 저장 또는 해제를 선택해 주세요.');
  const match=/^Bearer ([!-~]{1,512})$/i.exec(request.headers.get('authorization')||'');
  if(!match)throw new PressError(400,'가림 표시나 공백이 없는 Jev API 키 원본을 입력해 주세요.');
  const cipher=await browserCipher(env);
  let response;
  try{response=await fetcher('https://api.typesafe.ai/v1/models',{headers:{Authorization:'Bearer '+match[1],Accept:'application/json'},redirect:'manual',signal:AbortSignal.timeout(12000)});}
  catch{throw new PressError(502,'TypeSafe에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.');}
  if(!response.ok){
    await response.body?.cancel();
    if([401,403].includes(response.status))throw new PressError(401,'TypeSafe가 키를 인증하지 못했습니다. 활성 상태인 키 원본을 확인해 주세요.');
    throw new PressError(502,'TypeSafe에서 모델 목록을 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.');
  }
  const data=await response.json().catch(()=>null),model=env.TYPESAFE_MODEL||'jev-latest';
  if(!Array.isArray(data?.models)||!data.models.some(m=>m.name===model))throw new PressError(422,'이 키로 설정된 Jev 모델을 사용할 수 없습니다.');
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const record=new TextEncoder().encode(JSON.stringify({key:match[1],expires:Date.now()+keyLifetime*1000}));
  const sealed=await crypto.subtle.encrypt(cipherOptions(iv,origin.origin),cipher,record);
  return Response.json({connected:true},{headers:{...headers,'Set-Cookie':cookie(encode64(iv)+'.'+encode64(new Uint8Array(sealed)),keyLifetime)}});
}

