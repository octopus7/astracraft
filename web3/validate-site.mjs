import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));const errors=[];let links=0;
for(const route of ['', 'medium','high','xhigh','ultra']){
 const file=path.join(root,route,'index.html');if(!fs.existsSync(file)){errors.push(`Missing ${route}/index.html`);continue}
 const html=fs.readFileSync(file,'utf8');
 for(const m of html.matchAll(/(?:href|src)=["']([^"']+)["']/g)){
  let url=m[1];if(/^(?:https?:|data:|#|mailto:)/.test(url))continue;url=decodeURIComponent(url.split(/[?#]/)[0]);
  let target=url.startsWith('/')?path.join(root,url):path.resolve(path.dirname(file),url);
  if(fs.existsSync(target)&&fs.statSync(target).isDirectory())target=path.join(target,'index.html');
  links++;if(!fs.existsSync(target))errors.push(`${route||'/'}: ${url}`);
 }
}
console.log(JSON.stringify({routes:5,localLinksChecked:links,errors},null,2));if(errors.length)process.exitCode=1;
