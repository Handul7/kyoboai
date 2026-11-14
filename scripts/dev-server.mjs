import { createServer } from 'node:http';
import { mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createDatabase } from '../tests/helpers/d1.mjs';
import worker from '../dist/server/index.js';

mkdirSync('.local-data',{recursive:true});
const filename=resolve('.local-data/preview.sqlite');
const DB=createDatabase(filename,!existsSync(filename));
const previewAdmin=process.env.PREVIEW_ADMIN==='true';
const env={...process.env,DB,...(previewAdmin?{ADMIN_USER_IDS:'local-preview-admin',ADMIN_EMAILS:''}:{})};
const port=Number(process.env.PREVIEW_PORT||4173);
const server=createServer(async(req,res)=>{
  try{
    const url=`http://127.0.0.1:${port}${req.url}`;
    const headers=new Headers(req.headers);
    for(const k of [...headers.keys()])if(k.startsWith('oai-authenticated-'))headers.delete(k);
    if(previewAdmin){headers.set('oai-authenticated-user-id','local-preview-admin');headers.set('oai-authenticated-user-email','preview@example.invalid');}
    const chunks=[];let bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>2500000){res.writeHead(413);res.end();return;}chunks.push(chunk);}
    const request=new Request(url,{method:req.method,headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})});
    const response=await worker.fetch(request,env,{});
    res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
  }catch{res.writeHead(500);res.end('Local preview failed');}
});
server.listen(port,'127.0.0.1',()=>console.log(`Local: http://127.0.0.1:${port}/#process/operations (${previewAdmin?'local admin preview':'guest preview'}; no provider calls until configured and run)`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>{DB.sqlite.close();process.exit(0);}));
