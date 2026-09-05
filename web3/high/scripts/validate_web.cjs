const {chromium}=require(process.env.PLAYWRIGHT_PATH || 'playwright');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--disable-gpu-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:1600,height:1000},deviceScaleFactor:1});const errors=[],requests=[];
 page.on('pageerror',e=>errors.push(String(e)));page.on('requestfailed',r=>errors.push(r.url()+': '+r.failure()?.errorText));page.on('request',r=>requests.push(r.url()));
 await page.goto('http://127.0.0.1:8132',{waitUntil:'networkidle'});await page.waitForFunction(()=>window.afterlight?.loaded,{timeout:120000});await page.waitForTimeout(1500);
 await page.screenshot({path:path.join(root,'docs/viewer-desktop.png')});
 const before=await page.evaluate(()=>window.afterlight.camera.position.toArray());
 await page.mouse.move(800,410);await page.mouse.down();await page.mouse.move(1010,460,{steps:14});await page.mouse.up();await page.waitForTimeout(500);
 const after=await page.evaluate(()=>window.afterlight.camera.position.toArray());if(before.every((v,i)=>Math.abs(v-after[i])<.01))throw new Error('Orbit did not move camera');
 await page.locator('#pan').click();const panBefore=await page.evaluate(()=>window.afterlight.controls.target.toArray());await page.mouse.move(800,450);await page.mouse.down();await page.mouse.move(900,440,{steps:8});await page.mouse.up();await page.waitForTimeout(500);const panAfter=await page.evaluate(()=>window.afterlight.controls.target.toArray());if(panBefore.every((v,i)=>Math.abs(v-panAfter[i])<.01))throw new Error('Pan failed');
 const dist=await page.evaluate(()=>window.afterlight.camera.position.distanceTo(window.afterlight.controls.target));await page.mouse.wheel(0,-300);await page.waitForTimeout(700);const zoom=await page.evaluate(()=>window.afterlight.camera.position.distanceTo(window.afterlight.controls.target));if(zoom>=dist)throw new Error('Zoom failed');
 await page.getByRole('button',{name:'Recenter'}).click();await page.getByRole('button',{name:'Scene files'}).click();await page.waitForSelector('#downloads:not([hidden])');
 const links=await page.locator('#downloads a').evaluateAll(a=>a.map(x=>x.href));const downloads=[];for(const href of links){const r=await page.request.get(href);downloads.push({url:href,status:r.status(),bytes:(await r.body()).length});if(!r.ok())errors.push('Missing download '+href)}
 await page.getByRole('button',{name:'Close downloads'}).click();await page.getByRole('button',{name:'Slow orbit'}).click();if(!await page.evaluate(()=>window.afterlight.controls.autoRotate))errors.push('Tour failed');await page.getByRole('button',{name:'Pause orbit'}).click();
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Recenter'}).click();await page.waitForTimeout(1000);await page.screenshot({path:path.join(root,'docs/viewer-mobile.png')});
 const result={passed:errors.length===0,errors,externalRequests:requests.filter(x=>/^https?:/.test(x)&&!x.startsWith('http://127.0.0.1:8132')),downloads,orbit:true,pan:true,zoom:true,reset:true,tour:true,desktop:[1600,1000],mobile:[390,844],stats:await page.evaluate(()=>({meshes:window.afterlight.meshes,triangles:window.afterlight.renderer.info.render.triangles,calls:window.afterlight.renderer.info.render.calls}))};
 fs.writeFileSync(path.join(root,'docs/web-validation.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));await browser.close();if(errors.length)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1});
