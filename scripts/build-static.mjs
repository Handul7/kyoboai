import { cp, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
await rm(resolve(root,"dist"),{recursive:true,force:true});
await mkdir(resolve(root,"dist"),{recursive:true});
for (const file of ["index.html","styles.css","public-desk.js","published-news.js","news-research.js","dossier-pdf.js","release.json","department-profiles.json","assets",".nojekyll"]) {
  await cp(resolve(root,file),resolve(root,"dist",file),{recursive:true});
}
console.log("Static interface built. Live collection and Jev require the Worker API.");
