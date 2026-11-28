'use strict';
const assert=require('assert'),fs=require('fs'),http=require('http'),path=require('path'),cp=require('child_process');
const {chromium,webkit}=require('playwright');
const ROOT=path.resolve(__dirname,'../..'),OUT=path.join(ROOT,'artifacts/storage-upgrade');
const BASE='81088e2ad3bc96a6ff5bd995e6dfcfb58a4fd62f',legacyFiles=new Map();
const STALE='34dbae424c232304db19db73327d2f98698d367b';
let legacy=true,staleRelease=false;
const evidence={status:'RUNNING',head:cp.execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),legacyHead:BASE,reports:[]};
const write=()=>{fs.mkdirSync(OUT,{recursive:true});fs.writeFileSync(path.join(OUT,'evidence.json'),JSON.stringify(evidence,null,2)+'\n');};
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const server=http.createServer((req,res)=>{
  const request=new URL(req.url,'http://localhost'),oldRequest=legacy||request.pathname==='/legacy.html'||request.searchParams.get('v')==='20260924-179';
  const relative=request.pathname==='/legacy.html'?'index.html':request.pathname.slice(1)||'index.html',file=path.resolve(ROOT,relative);
  if(!file.startsWith(ROOT+path.sep)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);return res.end();}
  try{
    const revision=oldRequest?BASE:staleRelease?STALE:null,key=revision+':'+relative;
    if(revision&&!legacyFiles.has(key))legacyFiles.set(key,cp.execFileSync('git',['show',key],{cwd:ROOT}));
    res.setHeader('content-type',mime[path.extname(file)]||'application/octet-stream');res.setHeader('cache-control','no-store');
    res.end(revision?legacyFiles.get(key):fs.readFileSync(file));
  }catch(error){res.writeHead(500);res.end(String(error));}
});
async function run(){
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url='http://127.0.0.1:'+server.address().port+'/';write();
  try{
    for(const [engine,launcher] of Object.entries({chromium,webkit})){
      const browser=await launcher.launch();
      try{
        const context=await browser.newContext({viewport:{width:390,height:844}}),old=await context.newPage(),errors=[];
        try{
          old.on('pageerror',error=>errors.push(String(error)));legacy=true;
          await old.goto(url,{waitUntil:'load'});await old.waitForFunction(()=>Boolean(window.App?.controller));
          await old.evaluate(()=>navigator.serviceWorker.ready);await old.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
          const partial=await old.evaluate(()=>{
            const c=window.App.controller;c.skipPlacement();c.model.state.mode='training';c.start('J001',{fresh:true});c.view.applyRetryDraft(c.questions.J001,c.questions.J001.answer);c.model.save();c.rpg.save();
            const set=Storage.prototype.setItem;
            Storage.prototype.setItem=function(key,value){if(key===c.rpg.key){window.pendingOldCharacter=value;return;}return set.call(this,key,value);};
            try{c.submit();}finally{Storage.prototype.setItem=set;}
            return {progress:localStorage.getItem(c.model.key),character:localStorage.getItem(c.rpg.key),finalCharacter:window.pendingOldCharacter,
              stats:c.model.state.questionStats.J001,release:document.querySelector('script[src*="js/app.js"]').getAttribute('src'),lockHeld:Boolean(window.App.storageOwnership)};
          });
          assert(partial.release.includes('20260924-179'));assert.strictEqual(partial.lockHeld,false);
          assert(partial.finalCharacter&&partial.character!==partial.finalCharacter,'real old progress/RPG save gap must exist');
          legacy=false;let current=await context.newPage();current.on('pageerror',error=>errors.push(String(error)));
          await current.goto(url+'?upgrade=1',{waitUntil:'load'});
          const early=await current.evaluate(()=>({initialized:Boolean(window.App?.controller),progress:localStorage.getItem('boki-rpg-progress-v2'),character:localStorage.getItem('boki-rpg-character-v1')}));
          console.log(JSON.stringify({engine,oldRelease:partial.release,newInitializedDuringOldWrite:early.initialized,oldProgressChanged:early.progress!==partial.progress}));
          assert.strictEqual(early.initialized,false,'new release must not initialize while the prior release can write');
          await current.waitForFunction(()=>window.App?.storageClientStatus==='waiting');
          const waiting=await current.evaluate(()=>({initialized:Boolean(window.App.controller),progress:localStorage.getItem('boki-rpg-progress-v2'),character:localStorage.getItem('boki-rpg-character-v1')}));
          assert.strictEqual(waiting.initialized,false);assert.strictEqual(waiting.progress,partial.progress);assert.strictEqual(waiting.character,partial.character);
          await old.evaluate(()=>localStorage.setItem(window.App.controller.rpg.key,window.pendingOldCharacter));await old.close();
          await current.waitForFunction(()=>Boolean(window.App?.controller));
          const migrated=await current.evaluate(()=>{const c=window.App.controller;return {stats:c.model.state.questionStats.J001,character:c.rpg.state,metric:c.model.learningEffectivenessForQuestion('J001')};});
          assert.deepStrictEqual(migrated.stats,partial.stats);assert.deepStrictEqual(migrated.character,JSON.parse(partial.finalCharacter));
          assert.strictEqual(migrated.metric.initialStatus,'unknown');assert.strictEqual(migrated.metric.firstAttempt,null);
          await current.evaluate(()=>{const c=window.App.controller;c.model.state.mode='training';c.start('J002',{fresh:true});c.view.applyRetryDraft(c.questions.J002,c.questions.J002.answer);c.submit();});
          const saved=await current.evaluate(()=>{const c=window.App.controller;return {metric:c.model.learningEffectivenessForQuestion('J002'),character:c.rpg.state};});assert.strictEqual(saved.metric.observedAttempts,1);
          const protectedPair=await current.evaluate(()=>{const c=window.App.controller;return {progress:localStorage.getItem(c.model.key),character:localStorage.getItem(c.rpg.key),keys:[c.model.key,c.rpg.key]};});
          assert.deepStrictEqual(protectedPair.keys,['boki-rpg-progress-v3','boki-rpg-character-v2']);
          // Execute the unchanged old release after migration. This models a
          // late old writer without claiming that Playwright restored BFCache.
          const late=await context.newPage();late.on('pageerror',error=>errors.push(String(error)));
          await late.goto(url+'legacy.html',{waitUntil:'load'});await late.waitForFunction(()=>Boolean(window.App?.controller));
          const lateSaved=await late.evaluate(()=>{
            const c=window.App.controller;c.model.state.mode='training';c.start('J003',{fresh:true});c.view.applyRetryDraft(c.questions.J003,c.questions.J003.answer);c.submit();
            return {release:document.querySelector('script[src*="js/app.js"]').getAttribute('src'),keys:[c.model.key,c.rpg.key],observations:c.model.state.questionStats.J003.correctCount,
              source:localStorage.getItem(c.model.key),lockHeld:Boolean(window.App.storageOwnership)};
          });
          assert(lateSaved.release.includes('20260924-179'));assert.strictEqual(lateSaved.lockHeld,false);
          assert.deepStrictEqual(lateSaved.keys,['boki-rpg-progress-v2','boki-rpg-character-v1']);assert.strictEqual(lateSaved.observations,1);
          await current.waitForFunction(()=>!document.getElementById('storage-warning').hidden&&document.getElementById('storage-warning').textContent.includes('以前の版'));
          const afterLate=await current.evaluate(()=>{const c=window.App.controller;return {progress:localStorage.getItem(c.model.key),character:localStorage.getItem(c.rpg.key),keys:[c.model.key,c.rpg.key]};});
          assert.deepStrictEqual(afterLate,protectedPair);await late.close();
          await current.reload({waitUntil:'load'});await current.waitForFunction(()=>Boolean(window.App?.controller));
          const isolated=await current.evaluate(()=>{const c=window.App.controller;return {metric:c.model.learningEffectivenessForQuestion('J002'),character:c.rpg.state,
            oldAnswerMerged:Boolean(c.model.state.questionStats.J003),legacy:localStorage.getItem('boki-rpg-progress-v2')};});
          assert.deepStrictEqual({metric:isolated.metric,character:isolated.character},saved);assert.strictEqual(isolated.oldAnswerMerged,false);assert.strictEqual(isolated.legacy,lateSaved.source);
          // Install the actual prior protocol-capable release as a waiting
          // worker while the current active worker and owner remain alive.
          await current.evaluate(async()=>{const registration=await navigator.serviceWorker.getRegistration();await registration.update();});
          await current.waitForFunction(async()=>{const r=await navigator.serviceWorker.getRegistration();return !r.installing&&!r.waiting&&r.active===navigator.serviceWorker.controller;});
          staleRelease=true;
          await current.evaluate(async()=>{const registration=await navigator.serviceWorker.getRegistration();await registration.update();});
          const staleProof=await current.evaluate(async()=>{
            let worker;
            for(let i=0;i<120;i++){
              worker=(await navigator.serviceWorker.getRegistration()).waiting;
              if(worker?.state==='installed')break;
              await new Promise(resolve=>setTimeout(resolve,100));
            }
            if(worker?.state!=='installed')throw Error('prior release did not become waiting');
            return new Promise((resolve,reject)=>{
              const channel=new MessageChannel(),timer=setTimeout(()=>{channel.port1.close();reject(Error('waiting proof timeout'));},5000);
              channel.port1.onmessage=event=>{clearTimeout(timer);channel.port1.close();resolve(event.data);};
              worker.postMessage({type:'BOKI_STORAGE_CLIENTS'},[channel.port2]);
            });
          });
          assert.strictEqual(staleProof.release,'20260924-187');staleRelease=false;
          const staleOffered=await current.evaluate(()=>!document.getElementById('app-toast').hidden&&document.getElementById('app-toast-message').textContent.includes('新しいバージョン'));
          assert.strictEqual(staleOffered,false,'an older waiting release is not a manual update');
          const replacement=await context.newPage();replacement.on('pageerror',error=>errors.push(String(error)));
          await replacement.goto(url+'?release-proof=1',{waitUntil:'load'});await current.close();current=replacement;
          await current.waitForFunction(()=>Boolean(window.App?.controller));
          const releaseProof=await current.evaluate(async()=>({
            shell:new URL(document.querySelector('script[src*="js/app.js"]').src).searchParams.get('v'),
            active:await window.App.storageClients(navigator.serviceWorker.controller)
          }));
          assert.strictEqual(releaseProof.active.release,releaseProof.shell);assert.notStrictEqual(releaseProof.active.release,staleProof.release);
          // Remove the real origin, including existing connections. This tests
          // cache fallback without relying on a browser-driver offline flag.
          const port=server.address().port,stopped=new Promise(resolve=>server.close(resolve));server.closeAllConnections();await stopped;
          let networkFailure=null;try{await fetch(url);}catch(error){networkFailure=error.cause?.code;}
          assert.strictEqual(networkFailure,'ECONNREFUSED','the origin must actually be unreachable');
          await current.reload({waitUntil:'load'});await current.waitForFunction(()=>Boolean(window.App?.controller));
          const offline=await current.evaluate(()=>{const c=window.App.controller;return {metric:c.model.learningEffectivenessForQuestion('J002'),character:c.rpg.state};});
          assert.deepStrictEqual(offline,saved);assert.deepStrictEqual(errors,[]);
          await new Promise(resolve=>server.listen(port,'127.0.0.1',resolve));
          // Same-document writes after a committed replacement must fail even
          // before pagehide, with the actual controller and browser storage.
          const probe=async(kind)=>current.evaluate(kind=>{
            const c=window.App.controller,a=c.model.storage,annual=a.annualStorage;
            const charBefore=localStorage.getItem(c.rpg.key);
            if(kind==='year')annual.resetYear('FY2026',{confirm:true});
            else {const b=annual.exportV2();b.progress.FY2026={status:'absent'};b.character={status:'absent'};annual.importV2(b,{confirmReplaceAll:true});}
            const bytes=()=>JSON.stringify([localStorage.getItem(c.model.key),localStorage.getItem(c.rpg.key)]),before=bytes();
            const results=[c.model.save(),c.rpg.save(),a.restoreItem(c.model.key,'{}'),a.removeItem(c.rpg.key)];
            return {results,unchanged:before===bytes(),retained:charBefore===localStorage.getItem(c.rpg.key)};
          },kind);
          const reset=await probe('year');assert.deepStrictEqual(reset,{results:[false,false,false,false],unchanged:true,retained:true});
          await current.reload({waitUntil:'load'});await current.waitForFunction(()=>Boolean(window.App?.controller));
          const restarted=await current.evaluate(()=>({xp:window.App.controller.rpg.state.xp,correct:window.App.controller.model.state.correctIds.length}));
          assert.deepStrictEqual(restarted,{xp:saved.character.xp,correct:0});
          const restored=await probe('absent');assert.deepStrictEqual(restored,{results:[false,false,false,false],unchanged:true,retained:false});
          await current.reload({waitUntil:'load'});await current.waitForFunction(()=>Boolean(window.App?.controller));
          assert.deepStrictEqual(await current.evaluate(()=>({xp:window.App.controller.rpg.state.xp,correct:window.App.controller.model.state.correctIds.length})),{xp:0,correct:0});
          assert.deepStrictEqual(errors,[]);
          evidence.reports.push({engine,priorRelease:'20260924-179',partialWriteProtected:true,legacyStatsPreserved:true,rewardsPreserved:true,firstRemainsUnknown:true,lateLegacyWriterIsolated:true,legacyForkPreserved:true,legacyChangeNotice:true,staleWaitingRelease:staleProof.release,activeRelease:releaseProof.active.release,staleWaitingNotActivated:true,bfcacheRestorationTested:false,networkUnavailableReload:true,storageLifecycleResetRestore:true,networkFailure,browserOfflineFlagUsed:false,pageErrors:errors});write();
        }finally{await context.close();}
      }finally{await browser.close();}
    }
    assert.strictEqual(evidence.reports.length,2);evidence.status='PASS';write();console.log('STORAGE_UPGRADE_BROWSER 2/2 PASS');
  }catch(error){evidence.status='FAIL';evidence.error=error.stack;write();throw error;}
  finally{if(server.listening)await new Promise(resolve=>server.close(resolve));}
}
run().catch(error=>{console.error(error.stack);process.exitCode=1;});
