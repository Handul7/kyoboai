import { canonicalUrl } from './core.mjs';

function structuredArticle(html) {
  const candidates=[];
  for(const match of html.matchAll(/<script\b(?=[^>]*\btype\s*=\s*["']application\/ld\+json["'])[^>]*>([\s\S]*?)<\/script\s*>/gi)) {
    try {
      const value=JSON.parse(match[1]);
      for(const item of Array.isArray(value)?value:[value]) {
        if(Array.isArray(item?.["@graph"])) candidates.push(...item["@graph"]);
        else candidates.push(item);
      }
    } catch { /* Ignore unrelated malformed metadata. */ }
  }
  // Only read articleBody from visible, accessible source pages. Descriptions are not body text.
  const article=candidates.find(a=>[].concat(a?.["@type"]).some(t=>typeof t==="string"&&/^(?:https?:\/\/schema\.org\/)?(?:NewsArticle|Article|ReportageNewsArticle)$/.test(t))
    &&a.isAccessibleForFree!==false&&a.isAccessibleForFree!=="false"
    &&![].concat(a.hasPart||[]).some(part=>part?.isAccessibleForFree===false||part?.isAccessibleForFree==="false")
    &&typeof a.headline==="string"&&typeof a.datePublished==="string"&&typeof a.articleBody==="string");
  if(!article) throw Error('이 페이지에서 공개 기사 제목·발행시각·본문을 모두 확인할 수 없습니다.');
  return {title:article.headline,publishedAt:article.datePublished,body:article.articleBody};
}

export async function scrapeArticle(input,source,fetchImpl=fetch) {
  const url=canonicalUrl(input);
  if(!source?.enabled||!source.bodyAllowed||!source.aiAllowed||!source.domains.includes(new URL(url).hostname)) throw Error('본문 수집과 AI 처리를 승인한 매체의 기사 주소를 입력해 주세요.');
  const response=await fetchImpl(url,{headers:{Accept:'text/html'},redirect:'error',signal:AbortSignal.timeout(12000)});
  if(!response.ok||!/^text\/html\b/i.test(response.headers.get('content-type')||'')) throw Error('공개 기사 HTML에 접근할 수 없습니다.');
  if(!response.body||Number(response.headers.get('content-length'))>1500000) throw Error('기사 페이지가 허용 크기를 초과합니다.');
  const reader=response.body.getReader(),decoder=new TextDecoder();
  let size=0,html='';
  while(true) {
    const {value,done}=await reader.read();
    if(done)break;
    size+=value.byteLength;
    if(size>1500000){await reader.cancel();throw Error('기사 페이지가 허용 크기를 초과합니다.');}
    html+=decoder.decode(value,{stream:true});
  }
  return {sourceId:source.id,url,...structuredArticle(html+decoder.decode())};
}
