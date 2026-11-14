import { readFile, mkdir, writeFile, rm, readdir, cp } from 'node:fs/promises';
import { resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPrototypeData, verifyPrototypeData } from './verify-prototype.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
verifyPrototypeData(await readPrototypeData());
// Build one Worker ESM module; no dynamic imports or runtime build dependencies.
const modules=['core.mjs','providers.mjs','config.mjs','index.mjs'];
const source=(await Promise.all(modules.map(file=>readFile(resolve(root,'server',file),'utf8')))).map(code=>code.replace(/^import .*?;\s*$/gm,'').replace(/^export /gm,'')).join('\n');
const release=JSON.parse(await readFile(resolve(root,'release.json'),'utf8'));
const html=await readFile(resolve(root,'index.html'),'utf8');
if(!html.includes(release.version)||!html.includes(release.updatedAt))throw new Error('화면의 수정일·버전을 release.json과 일치시켜 주세요.');
const files=['index.html','styles.css','data.js','news-research.js','operations.js','app.js','release.json',...(await readdir(resolve(root,'assets'))).map(f=>`assets/${f}`)];
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.jpg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml'};
const assets=Object.fromEntries(await Promise.all(files.map(async file=>['/'+file,{type:mime[extname(file)]||'application/octet-stream',data:(await readFile(resolve(root,file))).toString('base64')}])));
const worker=`${source}\nconst STATIC_ASSETS=${JSON.stringify(assets)};
export default { async fetch(request,env) {
  const path=new URL(request.url).pathname;
  if(path.startsWith('/api/'))return handleApi(request,env);
  if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});
  const asset=STATIC_ASSETS[path==='/'?'/index.html':path];
  if(!asset)return new Response('Not found',{status:404});
  return new Response(request.method==='HEAD'?null:Uint8Array.from(atob(asset.data),c=>c.charCodeAt(0)),{headers:{'Content-Type':asset.type,'Cache-Control':'public, max-age=0, must-revalidate','X-Site-Release':${JSON.stringify(release.version)},'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin'}});
}};\n`;
await rm(resolve(root,'dist'),{recursive:true,force:true});
await mkdir(resolve(root,'dist/server'),{recursive:true});
await mkdir(resolve(root,'dist/.openai'),{recursive:true});
await writeFile(resolve(root,'dist/server/index.js'),worker);
await cp(resolve(root,'.openai/hosting.json'),resolve(root,'dist/.openai/hosting.json'));
console.log(`Worker built: ${files.length} static assets, authenticated API, D1 migrations. No provider calls during build.`);
