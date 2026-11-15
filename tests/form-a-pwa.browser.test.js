'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path'),http=require('http'),cp=require('child_process'),{chromium,webkit}=require('playwright');
const BASE='5454f8b6f6224e006a89ba298653a95b2b2d894e',oldRelease='20260924-211',release=JSON.parse(fs.readFileSync('pwa-release-manifest.json')).release,fixture=require('../data/form-a.json');
const oldFiles=new Map();let current=false;const reports=[];
const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost'),file=url.pathname==='/'?'index.html':url.pathname.slice(1),old=!current||url.searchParams.get('v')===oldRelease;try{let bytes;if(old){if(!oldFiles.has(file))oldFiles.set(file,cp.execFileSync('git',['show',BASE+':'+file],{maxBuffer:32*1024*1024}));bytes=oldFiles.get(file);}else bytes=fs.readFileSync(file);res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'})[path.extname(file)]||'application/octet-stream');res.setHeader('Cache-Control','no-store');res.end(bytes);}catch(_){res.writeHead(404);res.end();}});
async function pair(page){return page.evaluate(()=>Object.fromEntries(['boki-rpg-progress-v3','boki-rpg-character-v2'].map(key=>[key,localStorage.getItem(key)])));}
(async()=>{
for(const [name,type] of Object.entries({chromium,webkit})){
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url='http://127.0.0.1:'+server.address().port;
 current=false;const browser=await type.launch(),context=await browser.newContext();try{
  const rpg=await context.newPage();await rpg.goto(url);await rpg.waitForFunction(()=>window.App?.controller);await rpg.evaluate(()=>{const c=App.controller;c.skipPlacement();c.showMode('training');c.start('J002',{fresh:true});c.view.applyRetryDraft(QuestionData.J002,QuestionData.J002.answer);c.submit();});const before=await pair(rpg);assert(before['boki-rpg-progress-v3']);
  current=true;const form=await context.newPage();await form.goto(url+'/form-a.html');await form.locator('#start').waitFor({state:'visible'});await form.locator('#start').click();await form.locator('#exercise').waitFor({state:'visible'});
  for(const id of fixture.answerOrder){await form.locator('#voucher-'+id).selectOption(fixture.key[id].voucher);await form.locator('#amount-'+id).fill(String(fixture.key[id].amount));}await form.waitForFunction(()=>document.getElementById('status').textContent==='入力を保存しました。');const origin=await form.evaluate(()=>performance.timeOrigin);
  await rpg.evaluate(async()=>{const reg=await navigator.serviceWorker.getRegistration();await reg.update();});await rpg.locator('#app-toast-action').waitFor({state:'visible',timeout:60000});await rpg.locator('#app-toast-action').click();
  await rpg.waitForFunction(expected=>document.querySelector('script[src*="js/app.js"]').src.includes(expected),release,{timeout:60000});await rpg.waitForFunction(()=>window.App?.storageClientStatus==='waiting',{timeout:60000});
  assert.equal(await form.evaluate(()=>performance.timeOrigin),origin,'waiting-worker update does not reload Form A or discard input');assert.equal(await form.locator('#amount-C').inputValue(),'18000');assert.deepEqual(await pair(form),before,'Form A and ownership wait never write RPG keys');
  await form.waitForFunction(()=>navigator.serviceWorker.controller);
  const proof=await form.evaluate(()=>new Promise((resolve,reject)=>{const ch=new MessageChannel(),timer=setTimeout(()=>reject(new Error('worker proof timeout')),5000);ch.port1.onmessage=e=>{clearTimeout(timer);resolve(e.data);};navigator.serviceWorker.controller.postMessage({type:'BOKI_STORAGE_CLIENTS'},[ch.port2]);}));assert.equal(proof.release,release,'Form A controlled by current release');
  assert(await form.evaluate(async()=>Boolean(await caches.match('./form-a.html'))),'canonical independent route precached');
  // Stop the origin, as the existing PWA gate does: WebKit offline emulation can fail before SW navigation.
  const stopped=new Promise(resolve=>server.close(resolve));server.closeAllConnections();await stopped;
  let networkFailure;try{await fetch(url);}catch(error){networkFailure=error.cause?.code;}assert.equal(networkFailure,'ECONNREFUSED');
  await form.goto(url+'/form-a.html?resume=offline');await form.locator('#exercise').waitFor({state:'visible'});assert.equal(await form.locator('#amount-C').inputValue(),'18000');await form.locator('#submit').click();await form.locator('#result').waitFor({state:'visible'});assert((await form.locator('#score').innerText()).startsWith('4 / 4'));
  await form.reload();await form.locator('#result').waitFor({state:'visible'});assert((await form.locator('#first-score').textContent()).includes('4/4'));assert.deepEqual(await pair(form),before);await form.close();await rpg.waitForFunction(()=>window.App?.controller,{},{timeout:60000});const resumed=await pair(rpg);assert.equal(resumed['boki-rpg-character-v2'],before['boki-rpg-character-v2'],'earned RPG data unchanged after resume');
  const previous=JSON.parse(before['boki-rpg-progress-v3']),migrated=JSON.parse(resumed['boki-rpg-progress-v3']);
  // Release236 changes the assessed content of D002–D018; old completions remain archived,
  // while each successor identity must be present and must not inherit old mastery.
  assert.equal(previous.contentRevision,4);assert.equal(migrated.contentRevision,6);
  const successorVersions=Object.fromEntries(Array.from({length:17},(_,i)=>{
    const id='D'+String(i+2).padStart(3,'0');return [id,id+':closing-decision-v2'];
  }));
  assert.deepEqual(migrated.questionContentVersions,{...previous.questionContentVersions,...successorVersions,L044:'L044:cash-book-opening-zero-v1',L045:'L045:checking-book-opening-zero-v1'});
  assert.equal(previous.learningEvidenceIntegrity.schemaVersion,10);assert.equal(migrated.learningEvidenceIntegrity.schemaVersion,11);
  assert(await rpg.evaluate(saved=>ProgressModel.validateBackupState(saved,QuestionData),migrated),'stored identity-bound seal validates');
  for(const key of ['contentRevision','questionContentVersions','learningEvidenceIntegrity']){delete previous[key];delete migrated[key];}
  assert.deepEqual(migrated,previous,'only approved identity metadata/seal changes; every learning record stays intact');
  // Real training link returns to the cached independent route in the same tab.
  if(await rpg.locator('#app-notice-dialog').isVisible())await rpg.locator('#app-notice-confirm').click();
  await rpg.locator('[data-mode="training"]').click();await rpg.locator('a[href="form-a.html"]').click();await rpg.locator('#result').waitFor({state:'visible'});assert((await rpg.locator('#score').innerText()).startsWith('4 / 4'));
  reports.push({engine:name,baseline:BASE,release,update:true,networkFailure,controllerRelease:proof.release,oldTabInput:true,offlineQueryResume:true,offlineSubmit:true,receiptReload:true,canonicalBytesUnchangedBeforeRpgResume:true,approvedContentMigrationOnRpgResume:true,allOtherStateUnchanged:true,trainingLink:true});console.log(name,'Form A PWA/old-tab/offline/RPG isolation PASS');
 }finally{await context.close();await browser.close();if(server.listening)await new Promise(resolve=>server.close(resolve));}
}
fs.mkdirSync('artifacts/form-a',{recursive:true});fs.writeFileSync('artifacts/form-a/pwa.json',JSON.stringify(reports,null,2));server.close();
})().catch(error=>{console.error(error);server.close();process.exitCode=1});
