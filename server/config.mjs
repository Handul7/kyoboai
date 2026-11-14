export const PIPELINE_VERSION = 'insurance-v2';
export const LIMITS = Object.freeze({ maxArticles: 40, maxReportArticles: 12, maxImport: 100, maxBodyBytes: 2500000, concurrency: 4, classificationsPerStep: 8 });
export function configuredLimits(env) {
  const n=Number(env.NEWS_MAX_CANDIDATES);
  return {...LIMITS,maxArticles:Number.isInteger(n)&&n>=40&&n<=400?n:LIMITS.maxArticles};
}
export const SOURCES = [
  ['insnews','한국보험신문','보험 전문지',['www.insnews.co.kr','insnews.co.kr']],
  ['fins','보험매일','보험 전문지',['www.fins.co.kr','fins.co.kr']],
  ['newsis','뉴시스','통신사',['www.newsis.com','newsis.com','mobile.newsis.com','nwww.newsis.com','files.newsis.com']],
  ['chosunbiz','조선비즈','인터넷 경제매체',['biz.chosun.com']],
  ['joongang','중앙일보','종합일간지',['www.joongang.co.kr','joongang.co.kr']],
  ['chosun','조선일보','종합일간지',['www.chosun.com','chosun.com']],
  ['kmib','국민일보','종합일간지',['www.kmib.co.kr','kmib.co.kr']],
  ['mk','매일경제','경제일간지',['www.mk.co.kr','mk.co.kr']],
  ['hankyung','한국경제','경제일간지',['www.hankyung.com','hankyung.com']],
  ['yna','연합뉴스','통신사',['www.yna.co.kr','yna.co.kr']]
].map(([id,name,type,domains]) => ({id,name,type,domains}));

// API URL values are configured on the server; browser requests cannot choose a destination.
export function validEndpoint(value, allowQuery = false) {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && !u.username && !u.password && !u.port && !u.hash && (allowQuery || !u.search) &&
      !/^(localhost|.*\.localhost|.*\.local|.*\.internal|\[.*\]|[\d.]+)$/i.test(u.hostname) && u.hostname.includes('.');
  } catch { return false; }
}
