import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { readPrototypeData, verifyPrototypeData } from "./verify-prototype.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const data=await readPrototypeData();
verifyPrototypeData(data);
await mkdir(resolve(root,"data"),{recursive:true});
await writeFile(resolve(root,"data/sample-week.json"),JSON.stringify(data,null,2)+"\n");
await rm(resolve(root,"dist"),{recursive:true,force:true});
await mkdir(resolve(root,"dist"),{recursive:true});
for (const file of ["index.html","styles.css","data.js","news-research.js","issues.js","operations.js","app.js","release.json","assets","data",".nojekyll"]) {
  await cp(resolve(root,file),resolve(root,"dist",file),{recursive:true});
}
console.log(`Static build ready: ${data.articles.length} articles, ${data.reports.length} reporting periods, ${data.reports.length*data.departments.length} department reports. No dependencies or API keys required.`);
