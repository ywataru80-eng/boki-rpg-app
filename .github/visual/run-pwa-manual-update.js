'use strict';
// Real same-page manual update. Observers do not change worker/reload/ownership decisions.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const cp = require('child_process');
const { chromium, webkit } = require('playwright');
const ROOT = path.resolve(process.env.PWA_ROOT || process.cwd());
const OUT = path.resolve(process.env.PWA_OUTPUT || path.join(ROOT, 'artifacts/pwa-manual-update'));
const BASE = 'f1fa72436cf572b5997b81fff5aac0bee39b2be6';
const NEW_SHA = process.env.PWA_NEW_SHA || null;
const TRIALS = Number(process.env.PWA_TRIALS || 5);
assert(Number.isSafeInteger(TRIALS) && TRIALS >= 1 && TRIALS <= 5, 'PWA_TRIALS must be 1..5; final acceptance requires 5');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const blob = bytes => crypto.createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex');
const git = args => cp.execFileSync('git', args, { cwd: ROOT, maxBuffer: 32 * 1024 * 1024 });
const evidence = { status:'RUNNING', trialsPerBrowser:TRIALS, finalRepetitionCount:TRIALS === 5,
  head:git(['rev-parse','HEAD']).toString().trim(), baseHead:BASE, newSource:NEW_SHA || 'working-tree',
  playwright:require('playwright/package.json').version, reports:[], limitations:[
    'Playwright browser evidence is not physical iPhone/Safari or real learner evidence.',
    'Old L031 wrong-answer seed uses Controller.start plus real form submit, not the training list: L031 is review-only. After update, saved dueAt and existing reviewMappings select the actual source review.',
    'Date is advanced only after successful update to the real saved review dueAt; timers/worker states are not accelerated.',
    'Worker IDs are document-local JavaScript object identities; scriptURL alone does not prove identity across documents.'
  ] };
fs.mkdirSync(OUT,{recursive:true});
const write = () => fs.writeFileSync(path.join(OUT,'evidence.json'),JSON.stringify(evidence,null,2)+'\n');
const temp = fs.mkdtempSync(path.join(os.tmpdir(),'boki-pwa-manual-'));
function snapshot(label, revision) {
  const read = relative => revision ? git(['show',`${revision}:${relative}`]) : fs.readFileSync(path.join(ROOT,relative));
  const manifest = JSON.parse(read('pwa-release-manifest.json'));
  const files = [...new Set(['index.html','service-worker.js','manifest.webmanifest','icons/app-icon.svg','pwa-release-manifest.json',...Object.keys(manifest.assets),...Object.keys(manifest.pages||{})])];
  const target = path.join(temp,label), hashes = {};
  for (const relative of files) {
    const bytes = read(relative), local = path.join(target,relative);
    fs.mkdirSync(path.dirname(local),{recursive:true}); fs.writeFileSync(local,bytes);
    const gitBlob = blob(bytes);
    if (revision) assert.strictEqual(gitBlob,git(['rev-parse',`${revision}:${relative}`]).toString().trim(),`exact historical blob ${relative}`);
    if (manifest.assets[relative]) assert.strictEqual(sha(bytes),manifest.assets[relative],`manifest ${label}/${relative}`);
    if (manifest.pages?.[relative]) assert.strictEqual(sha(bytes),manifest.pages[relative],`manifest page ${label}/${relative}`);
    hashes[relative] = { sha256:sha(bytes), gitBlob };
  }
  const index = fs.readFileSync(path.join(target,'index.html'),'utf8');
  const worker = fs.readFileSync(path.join(target,'service-worker.js'),'utf8');
  assert.strictEqual(index.match(/js\/app\.js\?v=([^"']+)/)[1],manifest.release);
  assert.strictEqual(worker.match(/const RELEASE = '([^']+)'/)[1],manifest.release);
  for (const match of index.matchAll(/(?:src|href)="([^"?#]+)\?v=([^"#]+)"/g)) {
    assert.strictEqual(match[2],manifest.release,'all versioned shell URLs coherent');
    assert(hashes[match[1].replace(/^\.\//,'')],`shell URL has validated file: ${match[1]}`);
  }
  return { target, release:manifest.release, hashes, revision };
}
// This function runs in each new document, before product JS, and only observes.
function installObservers() {
  const doc = `${Date.now()}:${performance.timeOrigin}`;
  const emit = (event,data={}) => console.debug('PWA_OBSERVE:'+JSON.stringify({event,doc,at:Date.now(),monotonic:performance.now(),...data}));
  const ids = new WeakMap(); let next = 0; const id = object => { if (!object) return null; if (!ids.has(object)) ids.set(object,++next); return ids.get(object); };
  const sw = worker => worker ? {id:id(worker),scriptURL:worker.scriptURL,state:worker.state} : null;
  const watched = new WeakSet(); let previous = '';
  const watch = worker => { if(worker && !watched.has(worker)) { watched.add(worker); emit('worker-observed',sw(worker)); worker.addEventListener('statechange',()=>emit('worker-state',sw(worker))); } };
  emit('document-created');
  for (const event of ['pageshow','pagehide','load']) addEventListener(event,e=>emit(event,{persisted:e.persisted,ownership:window.App?.storageOwnership}));
  document.addEventListener('DOMContentLoaded',()=>emit('DOMContentLoaded',{app:!!window.App,controller:!!window.App?.controller}));
  navigator.serviceWorker.addEventListener('controllerchange',()=>emit('controllerchange',{controller:sw(navigator.serviceWorker.controller)}));
  navigator.serviceWorker.ready.then(r=>emit('ready-resolved',{active:sw(r.active),sameController:r.active===navigator.serviceWorker.controller}));
  // Forward all arguments unchanged; no synthetic activation or lifecycle events.
  const post = ServiceWorker.prototype.postMessage;
  ServiceWorker.prototype.postMessage = function(...args) { emit('worker-message',{worker:sw(this),type:args[0]?.type}); return Reflect.apply(post,this,args); };
  if(navigator.locks) {
    const request = navigator.locks.request;
    navigator.locks.request = function(...args) {
      const cbIndex = args.length - 1, callback = args[cbIndex];
      emit('lock-request',{name:args[0],options:typeof args[1]==='object'?args[1]:null});
      if(typeof callback === 'function') args[cbIndex] = function(lock) {
        emit('lock-acquired',{name:lock?.name || null,mode:lock?.mode || null});
        let result; try { result = Reflect.apply(callback,this,arguments); } catch(error) { emit('lock-release',{error:String(error)}); throw error; }
        return Promise.resolve(result).then(value=>{emit('lock-release',{name:lock?.name});return value;},error=>{emit('lock-release',{name:lock?.name,error:String(error)});throw error;});
      };
      return Reflect.apply(request,this,args);
    };
  }
  const inspect = async () => {
    try {
      const r = await navigator.serviceWorker.getRegistration();
      if(r&&!watched.has(r)) { watched.add(r); r.addEventListener('updatefound',()=>{emit('updatefound',{registration:id(r),installing:sw(r.installing)});watch(r.installing);}); }
      for(const worker of [r?.installing,r?.waiting,r?.active,navigator.serviceWorker.controller]) watch(worker);
      const state = {registration:id(r),installing:sw(r?.installing),waiting:sw(r?.waiting),active:sw(r?.active),controller:sw(navigator.serviceWorker.controller),sameController:!!r&&r.active===navigator.serviceWorker.controller,
        app:!!window.App,appController:!!window.App?.controller,status:window.App?.storageClientStatus,ownership:window.App?.storageOwnership,
        shell:document.querySelector('script[src*="js/app.js"]')?.src};
      const value=JSON.stringify(state); if(value!==previous) {previous=value;emit('state',state);}
    } catch(error) {emit('observer-error',{error:String(error)});}
  };
  inspect(); setInterval(inspect,250);
}
async function capture(page) {
  return page.evaluate(async()=>{
    const r = await navigator.serviceWorker.getRegistration(), sw = w=>w?{scriptURL:w.scriptURL,state:w.state}:null;
    const local = {}; for(const key of Object.keys(localStorage).sort()) local[key]=localStorage.getItem(key);
    const cacheRecords = [];
    for(const key of await caches.keys()) {
      const cache=await caches.open(key), entries=[];
      for(const req of await cache.keys()) { const bytes=await(await cache.match(req)).arrayBuffer();entries.push({url:req.url,sha256:[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('')}); }
      cacheRecords.push({key,entries});
    }
    const c=window.App?.controller;
    return {shell:document.querySelector('script[src*="js/app.js"]')?.src,app:!!window.App,appController:!!c,status:window.App?.storageClientStatus,ownership:window.App?.storageOwnership,
      worker:{installing:sw(r?.installing),waiting:sw(r?.waiting),active:sw(r?.active),controller:sw(navigator.serviceWorker.controller),sameController:r?.active===navigator.serviceWorker.controller},local,caches:cacheRecords,
      storedProgressValid:c?ProgressModel.validateBackupState(JSON.parse(local[c.model.key]),QuestionData):false,progressKey:c?.model.key,model:c?JSON.parse(JSON.stringify(c.model.state)):null,character:c?JSON.parse(JSON.stringify(c.rpg.state)):null};
  });
}
async function proof(page) {
  return page.evaluate(async()=>{
    const r=await navigator.serviceWorker.getRegistration(),w=r?.active||navigator.serviceWorker.controller;
    if(!w)return {error:'no-worker'};
    return new Promise(resolve=>{const ch=new MessageChannel(),timer=setTimeout(()=>{ch.port1.close();resolve({error:'proof-timeout',state:w.state});},2000);
      ch.port1.onmessage=e=>{clearTimeout(timer);ch.port1.close();resolve({state:w.state,data:e.data});};w.postMessage({type:'BOKI_STORAGE_CLIENTS'},[ch.port2]);});
  });
}
function checkRetained(before,after,contentUpgrade=false) {
  if(!contentUpgrade){assert.deepStrictEqual(after.local,before.local,'entire raw saved namespace survives current-version reload/offline');assert(after.storedProgressValid);} else {
  assert.strictEqual(after.progressKey,before.progressKey);assert.strictEqual(after.progressKey,'boki-rpg-progress-v3');
  const previous=JSON.parse(before.local[before.progressKey]),migrated=JSON.parse(after.local[after.progressKey]);
  const to236=after.sourceRelease==='20261107-236'||Object.values(migrated.questionContentVersions||{}).includes('D002:closing-decision-v2');
  assert.strictEqual(previous.contentRevision,4);assert.strictEqual(migrated.contentRevision,to236?6:5);
  const successorContent=to236?Object.fromEntries(Array.from({length:17},(_,i)=>{const id='D'+String(i+2).padStart(3,'0');return [id,id+':closing-decision-v2']})):{};
  assert.deepStrictEqual(migrated.questionContentVersions,{...previous.questionContentVersions,...successorContent,L044:'L044:cash-book-opening-zero-v1',L045:'L045:checking-book-opening-zero-v1'});
  assert.strictEqual(previous.learningEvidenceIntegrity.schemaVersion,10);assert.strictEqual(migrated.learningEvidenceIntegrity.schemaVersion,11);assert(after.storedProgressValid,'saved identity-bound seal validates');
  for(const key of ['contentRevision','questionContentVersions','learningEvidenceIntegrity']){delete previous[key];delete migrated[key];}
  assert.deepStrictEqual(migrated,previous,'every learning record outside approved content metadata survives update/reload');
  const oldLocal={...before.local},newLocal={...after.local};delete oldLocal[before.progressKey];delete newLocal[after.progressKey];
  assert.deepStrictEqual(newLocal,oldLocal,'all other saved namespace bytes, including RPG and original archives, survive');
  }
  assert.strictEqual(after.model.questionStats.L031.incorrectCount,before.model.questionStats.L031.incorrectCount);
  assert.deepStrictEqual(after.model.reviewSchedule.L031,before.model.reviewSchedule.L031);
  assert.deepStrictEqual(after.model.drafts.J035,before.model.drafts.J035);
  assert.strictEqual(after.character.xp,before.character.xp);
  assert.deepStrictEqual(after.character.rewardedIds,before.character.rewardedIds);
}
function checkCache(snapshot,newSource) {
  const cache=snapshot.caches.find(c=>c.key===`boki-rpg-${newSource.release}`);assert(cache,'new cache exists');
  for(const [relative,hash]of Object.entries(newSource.hashes)) {
    // Worker script/verification manifest are not APP_SHELL cache entries.
    if(['pwa-release-manifest.json','service-worker.js'].includes(relative))continue;
    const entry=cache.entries.find(e=>new URL(e.url).pathname==='/'+relative && (!new URL(e.url).searchParams.has('v') || new URL(e.url).searchParams.get('v')===newSource.release));
    assert(entry,`coherent cached ${relative}`);assert.strictEqual(entry.sha256,hash.sha256,`cache bytes ${relative}`);
  }
}
async function continueLearning(page,report,record) {
  // Advance wall-clock only to the actual persisted deadline. No fabricated review assignment/history.
  const due=await page.evaluate(()=>App.controller.model.state.reviewSchedule.L031.dueAt);
  await page.clock.setFixedTime(new Date(due+1));record('clock-review-due',{dueAt:due,now:due+1,reason:'existing 20-minute due-review contract; JS timers continue normally'});
  const reviewed=await page.evaluate(()=>{
    const c=App.controller;c.showMode('review');const ids=c.modeIds();const id=ids.find(id=>c.reviewMappings.get(id)?.sourceQuestionId==='L031');if(!id)throw Error('L031 due review mapping missing');
    c.start(id);const q=c.questions[id],wrong=structuredClone(q.answer);const key=Object.keys(wrong.cells)[0];wrong.cells[key]=typeof wrong.cells[key]==='number'?wrong.cells[key]+1:wrong.cells[key]==='借方'?'貸方':'借方';
    const source=c.reviewSourceId;c.view.applyRetryDraft(q,wrong);document.getElementById('question-form').requestSubmit();
    return {id,source,category:q.category,sourceCategory:c.questions.L031.category,gradedCorrect:c.learningFlow.authoritativeScore.correct,
      text:document.getElementById('explanation').innerText,wrongCount:c.model.state.questionStats.L031.incorrectCount,nextDue:c.model.state.reviewSchedule.L031.dueAt};
  });
  record('review-wrong',reviewed);assert.strictEqual(reviewed.source,'L031');assert.strictEqual(reviewed.category,reviewed.sourceCategory);assert.strictEqual(reviewed.gradedCorrect,false);
  assert.strictEqual(reviewed.id,'L031','current canonical review mapping must exercise exact L031 P1 explanation');
  assert(/資産の増加は借方[^。]*減少は貸方[^。]*。負債の増加は貸方[^。]*減少は借方/.test(reviewed.text),'new L031 guidance rendered after update');
  assert(!/入金は加算、出金は減算して直前残高/.test(reviewed.text),'cashbook guidance must not leak into account rules');
  await page.clock.setFixedTime(new Date(reviewed.nextDue+1));record('clock-review-due',{dueAt:reviewed.nextDue,now:reviewed.nextDue+1,reason:'second genuine due review after recorded wrong review'});
  const corrected=await page.evaluate(()=>{
    const c=App.controller;c.showMode('review');const id=c.modeIds().find(id=>c.reviewMappings.get(id)?.sourceQuestionId==='L031');if(!id)throw Error('second L031 review missing');c.start(id);c.view.applyRetryDraft(c.questions[id],c.questions[id].answer);document.getElementById('question-form').requestSubmit();
    return {id,source:c.reviewSourceId,correct:c.learningFlow.authoritativeScore.correct,stage:c.model.state.reviewSchedule.L031.stage,
      wrongCount:c.model.state.questionStats.L031.incorrectCount,attempt:c.model.state.attempts.at(-1),text:document.getElementById('explanation').innerText};
  });
  record('review-correct',corrected);assert.strictEqual(corrected.correct,true);assert.strictEqual(corrected.source,'L031');assert.strictEqual(corrected.stage,1);assert.strictEqual(corrected.wrongCount,reviewed.wrongCount,'cumulative wrong history preserved after successful review');assert.strictEqual(corrected.attempt.mode,'review');
  const draft=await page.evaluate(()=>{const c=App.controller;c.showMode('story');c.start('J035');return c.view.readAnswer(c.questions.J035);});
  assert.deepStrictEqual(draft,{debit:[{account:'貯蔵品',amount:5000}],credit:[]},'partial draft restored into real input');
  const journal=await page.evaluate(()=>{const c=App.controller;c.view.applyRetryDraft(c.questions.J035,c.questions.J035.answer);document.getElementById('question-form').requestSubmit();return{correct:c.learningFlow.authoritativeScore.correct,text:document.getElementById('explanation').innerText,summary:[...document.querySelectorAll('.explanation-summary-item')].map(e=>e.textContent).join(' '),transfers:[...document.querySelectorAll('.explanation-transfer-card')].map(e=>({from:e.querySelector('.explanation-transfer-from')?.textContent,to:e.querySelector('.explanation-transfer-to strong')?.textContent})),rewardedIds:[...c.rpg.state.rewardedIds]};});
  record('draft-resume-submit',journal);assert(journal.correct);assert(/未使用分[^。]*次期以降[^。]*資産/.test(journal.summary));assert(journal.transfers.some(c=>c.from.includes('貯蔵品')&&/資産の増加/.test(c.from)&&c.to==='借方'));assert(journal.transfers.some(c=>c.from.includes('租税公課')&&/費用の減少/.test(c.from)&&c.to==='貸方'));assert.strictEqual(journal.rewardedIds.filter(id=>id==='J001').length,1,'old reward retained once');assert.strictEqual(new Set(journal.rewardedIds).size,journal.rewardedIds.length);
  report.continuation={status:'PASS',reviewWrong:reviewed,reviewCorrect:corrected,draftResume:journal};
}
async function trial(engine,launcher,number,oldSource,newSource,oldTabBoundary=false) {
  const report={engine,trial:number,boundary:oldTabBoundary?'old-release-tab-remains':null,status:'RUNNING',oldRelease:oldSource.release,newRelease:newSource.release,errors:[],timeline:[]};evidence.reports.push(report);write();
  const start=Date.now();let stage='start',current=false,browser,context,page,before,serverStopped=false;
  const record=(kind,data={})=>report.timeline.push({ms:Date.now()-start,stage,kind,...data});
  const server=http.createServer((req,res)=>{
    const u=new URL(req.url,'http://localhost'),source=!current||u.searchParams.get('v')===oldSource.release?oldSource:newSource;
    const relative=u.pathname==='/'?'index.html':decodeURIComponent(u.pathname.slice(1));
    try { assert(source.hashes[relative],`unexpected URL ${relative}`);const bytes=fs.readFileSync(path.join(source.target,relative));record('http-served',{url:req.url,release:source.release,sha256:sha(bytes)});res.setHeader('cache-control','no-store');res.setHeader('content-type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'})[path.extname(relative)]||'application/octet-stream');res.end(bytes); }
    catch(error){record('http-error',{url:req.url,error:String(error)});res.writeHead(404);res.end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url=`http://127.0.0.1:${server.address().port}/`;
  try {
    browser=await launcher.launch();report.browserVersion=browser.version();report.executable=launcher.executablePath();
    context=await browser.newContext({viewport:{width:390,height:844}});page=await context.newPage();
    page.on('pageerror',error=>{report.errors.push(String(error));record('page-error',{error:String(error)});});
    page.on('console',message=>{const text=message.text();if(text.startsWith('PWA_OBSERVE:')){try{record('observer',JSON.parse(text.slice(12)));}catch(error){record('observer-parse-error',{error:String(error),text});}}else{record('console',{type:message.type(),text});if(message.type()==='error')report.errors.push(text);}});
    page.on('requestfailed',request=>record('request-failed',{url:request.url(),failure:request.failure()}));
    page.on('response',response=>record('response',{url:response.url(),status:response.status(),navigation:response.request().isNavigationRequest(),fromServiceWorker:typeof response.fromServiceWorker==='function'?response.fromServiceWorker():null,fromServiceWorkerSupported:typeof response.fromServiceWorker==='function'}));
    page.on('framenavigated',frame=>{if(frame===page.mainFrame())record('navigation',{url:frame.url()});});
    await page.addInitScript(installObservers);
    stage='old-app';await page.goto(url);await page.waitForFunction(()=>Boolean(window.App?.controller));await page.waitForFunction(()=>navigator.serviceWorker.controller?.state==='activated');
    stage='seed-learning';const seeded=await page.evaluate(()=>{
      const c=App.controller;c.skipPlacement();c.start('J001');c.view.applyRetryDraft(c.questions.J001,c.questions.J001.answer);document.getElementById('question-form').requestSubmit();const j=c.learningFlow.authoritativeScore.correct;
      c.showMode('training');c.start('L031');const q=c.questions.L031,a=structuredClone(q.answer),key=Object.keys(a.cells)[0];a.cells[key]=typeof a.cells[key]==='number'?a.cells[key]+1:a.cells[key]==='借方'?'貸方':'借方';c.view.applyRetryDraft(q,a);document.getElementById('question-form').requestSubmit();const l=c.learningFlow.authoritativeScore.correct;
      c.showMode('story');c.start('J035');c.view.applyRetryDraft(c.questions.J035,{debit:[{account:'貯蔵品',amount:5000}],credit:[]});c.saveDraft(false);return {j001:j,l031:l};
    });assert.strictEqual(seeded.j001,true);assert.strictEqual(seeded.l031,false);
    before=await capture(page);report.before=before;assert(before.character.xp>0);assert(before.character.rewardedIds.includes('J001'));assert.strictEqual(before.model.questionStats.L031.incorrectCount,1);assert(before.model.reviewSchedule.L031);assert(before.model.incorrectIds.includes('L031'));assert(before.ownership.active);
    let oldTab;
    if(oldTabBoundary) {
      stage='old-tab-remains';oldTab=await context.newPage();
      oldTab.on('pageerror',error=>{report.errors.push('old-tab: '+String(error));record('old-tab-page-error',{error:String(error)});});
      oldTab.on('console',message=>{if(message.type()==='error'){report.errors.push('old-tab: '+message.text());record('old-tab-console-error',{text:message.text()});}});
      await oldTab.goto(url);
      await oldTab.waitForFunction(()=>!!window.App?.storageOwnership);
      assert.strictEqual(await oldTab.evaluate(()=>!!App.controller),false,'old second tab waits for exclusive ownership');
    }
    stage='detect-update';current=true;await page.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();await r.update();});await page.waitForFunction(async()=>!!(await navigator.serviceWorker.getRegistration())?.waiting);await page.locator('#app-toast-action').waitFor({state:'visible'});report.waiting=await capture(page);
    stage='manual-update';const updateDeadline=Date.now()+30000;
    record('wait-start',{timeoutMs:30000,condition:'same-tab navigation AND new release shell AND App.controller'});
    await Promise.all([page.waitForNavigation({waitUntil:'domcontentloaded',timeout:30000}),page.locator('#app-toast-action').click()]);
    if(oldTabBoundary) {
      await page.waitForFunction(async release=>{
        if(!document.querySelector('script[src*="js/app.js"]')?.src.includes('?v='+release)||!window.App?.storageOwnership||App.controller||App.storageOwnership.active)return false;
        const locks=await navigator.locks.query(),owned=locks.held.some(lock=>lock.name==='boki-rpg-saved-learning');
        return owned&&(locks.pending.some(lock=>lock.name==='boki-rpg-saved-learning')||App.storageClientStatus==='waiting');
      },newSource.release,{timeout:Math.max(1,updateDeadline-Date.now())});
      const blocked=await capture(page);assert.strictEqual(blocked.appController,false,'old tab blocks the new learning writer');assert.strictEqual(blocked.ownership.active,false);
      assert.deepStrictEqual(blocked.local,before.local,'blocked startup never changes saved originals');
      const clients=await proof(page);assert.strictEqual(clients.data.clients.length,2,'both real documents remain visible to the worker');
      const lockState=await page.evaluate(()=>navigator.locks.query());
      assert(lockState.held.some(lock=>lock.name==='boki-rpg-saved-learning'),'exclusive lock remains held while another real client is present');
      const oldState=await oldTab.evaluate(()=>({controller:!!App.controller,ownership:App.storageOwnership,status:App.storageClientStatus}));
      assert.strictEqual(oldState.controller,false,'old waiting page cannot become a second learning writer');
      report.oldTabBoundary={status:'PASS',worker:blocked.worker,ownership:blocked.ownership,oldState,lockState,clientCount:clients.data.clients.length,savedNamespaceUnchanged:true};
      record('old-tab-blocked',report.oldTabBoundary);await oldTab.close();record('old-tab-closed');
    }
    await page.waitForFunction(release=>Boolean(window.App?.controller)&&document.querySelector('script[src*="js/app.js"]').src.includes('?v='+release),newSource.release,{timeout:Math.max(1,updateDeadline-Date.now())});
    stage='new-app';const after=await capture(page);report.after=after;checkRetained(before,after,true);checkCache(after,newSource);assert(after.ownership.active);assert(after.worker.sameController);report.workerProof=await proof(page);
    assert.strictEqual(report.workerProof.data.release,newSource.release);assert.strictEqual(report.workerProof.data.clients.length,1);assert(report.workerProof.data.clients.includes(report.workerProof.data.requester));
    assert.deepStrictEqual(report.workerProof.data.activation,{state:'activated',active:true},'the replying active worker has actually completed activation');
    assert(['activating','activated'].includes(after.worker.active.state),'page wrapper is active or the specifically proven stale activating state');report.manualUpdate='PASS';
    assert(report.timeline.some(x=>x.event==='worker-message'&&x.type==='SKIP_WAITING'),'real button sent SKIP_WAITING');assert(report.timeline.some(x=>x.event==='controllerchange'&&x.stage==='manual-update'),'same-page controllerchange observed');assert.strictEqual(context.pages().length,1,'same tab only');
    stage='learning-continuation';await continueLearning(page,report,record);const continued=await capture(page);report.continued=continued;
    stage='reload-after-update';await page.reload({waitUntil:'load'});await page.waitForFunction(()=>Boolean(window.App?.controller));const reloaded=await capture(page);checkRetained(continued,reloaded);report.reload='PASS';
    stage='offline-reload';const stopped=new Promise(resolve=>server.close(resolve));server.closeAllConnections();await stopped;serverStopped=true;
    let networkFailure;try{await fetch(url);}catch(error){networkFailure=error.cause?.code;}assert.strictEqual(networkFailure,'ECONNREFUSED','origin genuinely stopped; no browser offline flag');
    await page.reload({waitUntil:'load'});await page.waitForFunction(()=>Boolean(window.App?.controller));const offline=await capture(page);checkRetained(continued,offline);checkCache(offline,newSource);report.offline={status:'PASS',networkFailure,snapshot:offline};
    assert.deepStrictEqual(report.errors,[],'no browser page/console errors');report.status='PASS';
  } catch(error) {
    report.status='FAIL';report.failedStage=stage;report.error=error.stack;record('failure',{error:error.stack});
    if(page){try{report.failure=await capture(page);report.rawNamespacePreservedOnFailure=!!before&&JSON.stringify(before.local)===JSON.stringify(report.failure.local);report.workerProof=await proof(page);}catch(observationError){report.observationError=String(observationError);}}
  } finally {
    report.durationMs=Date.now()-start;
    const summaryTimeline=report.timeline.filter(item =>
      ['navigation','wait-start','failure'].includes(item.kind) ||
      (item.kind==='observer' && ['controllerchange','worker-state','ready-resolved','pagehide','pageshow','lock-request','lock-acquired','lock-release','updatefound'].includes(item.event)) ||
      (item.kind==='response' && item.navigation));
    console.log('PWA_MANUAL_TRIAL '+JSON.stringify({engine,trial:number,status:report.status,
      browserVersion:report.browserVersion,oldRelease:report.oldRelease,newRelease:report.newRelease,
      failedStage:report.failedStage,error:report.error,manualUpdate:report.manualUpdate,
      rawNamespacePreservedOnFailure:report.rawNamespacePreservedOnFailure,
      failure:report.failure ? {app:report.failure.app,appController:report.failure.appController,status:report.failure.status,
        shell:report.failure.shell,worker:report.failure.worker,ownership:report.failure.ownership,
        caches:report.failure.caches.map(cache=>({key:cache.key,entries:cache.entries.length}))} : undefined,
      workerProof:report.workerProof,observationError:report.observationError,
      oldTabBoundary:report.oldTabBoundary,continuation:report.continuation?.status,reload:report.reload,offline:report.offline?.status,
      errors:report.errors,timeline:summaryTimeline}));
    write();fs.writeFileSync(path.join(OUT,`${engine}-${number}.json`),JSON.stringify(report,null,2)+'\n');
    if(context)await context.close();if(browser)await browser.close();if(!serverStopped)await new Promise(resolve=>server.close(resolve));
  }
}
(async()=>{
  try {
    const oldSource=snapshot('old',BASE),newSource=snapshot('new',NEW_SHA);assert.strictEqual(oldSource.release,'20260924-202');assert(newSource.release>oldSource.release,'genuine newer release');
    evidence.sources={old:oldSource,new:newSource};write();
    for(const [engine,launcher]of Object.entries({chromium,webkit}))for(let number=1;number<=TRIALS;number++)await trial(engine,launcher,number,oldSource,newSource);
    if(TRIALS===5)for(const [engine,launcher]of Object.entries({chromium,webkit}))await trial(engine,launcher,'old-tab',oldSource,newSource,true);
    assert.strictEqual(evidence.reports.length,TRIALS*2+(TRIALS===5?2:0));evidence.status=evidence.reports.every(r=>r.status==='PASS')?'PASS':'FAIL';
  } catch(error) {evidence.status='FAIL';evidence.setupError=error.stack;}
  finally {write();fs.rmSync(temp,{recursive:true,force:true});}
  console.log(JSON.stringify({status:evidence.status,trials:evidence.reports.map(r=>({engine:r.engine,trial:r.trial,status:r.status,stage:r.failedStage,manualUpdate:r.manualUpdate,continuation:r.continuation?.status,offline:r.offline?.status})),evidence:path.join(OUT,'evidence.json')}));process.exitCode=evidence.status==='PASS'?0:1;
})();
