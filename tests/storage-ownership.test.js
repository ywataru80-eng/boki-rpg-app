'use strict';
const assert = require('assert'), fs = require('fs'), vm = require('vm');
const {MessageChannel} = require('worker_threads');
const Model = require('../js/model'), RPG = require('../js/rpg');
const questions = {Q:{id:'Q',type:'journal',category:'仕訳',difficulty:1}};
const legacyProgressKey='boki-rpg-progress-v2',legacyCharacterKey='boki-rpg-character-v1';
const progressKey='boki-rpg-progress-v3',characterKey='boki-rpg-character-v2';
const isolatedProgressKey='boki-rpg-progress-v3',isolatedCharacterKey='boki-rpg-character-v2';
const currentRelease=fs.readFileSync('index.html','utf8').match(/js\/app\.js\?v=([^"']+)/)[1];
function legacyFixture(f) {
  const load=file=>{const module={exports:{}};vm.runInNewContext(require('child_process').execFileSync('git',['show','81088e2ad3bc96a6ff5bd995e6dfcfb58a4fd62f:'+file],{encoding:'utf8'}),{module,console});return module.exports;};
  const LegacyModel=load('js/model.js'),LegacyRPG=load('js/rpg.js');
  const model=new LegacyModel(questions,f.storage),rpg=new LegacyRPG(f.storage);
  model.recordAttempt('Q',false,10,'journal-entry',false,Date.now());model.save();rpg.save();return {model,rpg};
}
const tick = () => new Promise(resolve => setImmediate(resolve));
function fixture() {
  const data = {}, storage = {reads:0,getItem(k){this.reads++;return data[k]??null;},setItem(k,v){data[k]=v;},removeItem(k){delete data[k];}};
  let tail = Promise.resolve();
  const locks = {request(_name,_options,fn){const next=tail.then(()=>fn({name:_name}));tail=next.catch(()=>{});return next;}};
  return {data,storage,locks,clients:new Set(),nextClient:0};
}
function tab(f, locks=f.locks) {
  const events = {}, warning = {hidden:true,textContent:'original warning'}, document = {currentScript:{src:'https://boki.test/js/app.js?v='+currentRelease},addEventListener(){},getElementById:id=>id==='storage-warning'?warning:null};
  const clientId='client-'+(++f.nextClient);
  const worker={state:'activated',postMessage(message,ports){if(message.type==='BOKI_STORAGE_CLIENTS')ports[0].postMessage({protocol:1,release:currentRelease,requester:clientId,clients:[...f.clients],activation:null});}};
  const registration={active:worker,waiting:null,installing:null,addEventListener(){},async update(){return this;}};
  const serviceWorker={controller:worker,async getRegistration(){f.clients.add(clientId);return registration;},async register(){f.clients.add(clientId);return registration;},addEventListener(){}};
  let reloads=0;
  const root = {localStorage:f.storage,navigator:{locks,serviceWorker},location:{protocol:'file:',reload(){reloads++;}},QuestionData:questions,CurriculumRegistry:{active:year=>year==='FY2026'?{questions,examPool:[]}:null},ProgressModel:Model,RPGModel:RPG,
    AppView:class{},validateSemanticQuestionData:()=>({}),addEventListener(name,fn){(events[name] ||= []).push(fn);},dispatchEvent(event){for(const fn of events[event.type]||[])fn(event);}};
  const sandbox = {window:root,document,navigator:root.navigator,location:root.location,console,URL,URLSearchParams,queueMicrotask,Event,MessageChannel,setTimeout,clearTimeout};
  vm.runInNewContext(fs.readFileSync('js/annual-storage.js','utf8'),sandbox);
  vm.runInNewContext(fs.readFileSync('js/controller.js','utf8'),sandbox);
  root.AppController.prototype.init=function(){};
  vm.runInNewContext(fs.readFileSync('js/app.js','utf8'),sandbox);
  return {app:root.App,root,warning,registration,worker,clientId,fire(name,event={}){if(name==='pagehide')f.clients.delete(clientId);for(const fn of events[name]||[])fn(event);},get reloads(){return reloads;}};
}
let passed=0,failed=0;
async function test(name,fn){try{await fn();passed++;console.log('PASS '+name);}catch(e){failed++;console.error('FAIL '+name+'\n'+e.stack);}}
(async()=>{
  await test('another tab cannot recover the live journal between progress and reward writes',async()=>{
    const f=fixture(),a=tab(f),b=tab(f);await a.app.init();await tick();const c=a.app.controller;
    c.model.save();c.rpg.save();const set=f.storage.setItem;let started=false;
    f.storage.setItem=function(k,v){set.call(this,k,v);if(k===progressKey&&!started){started=true;b.app.init();}};
    assert(c.learningTransaction(()=>{assert(c.model.recordAttempt('Q',true,10,'',false,Date.now()));c.rpg.state.xp+=20;return true;}));
    await tick();assert.strictEqual(b.app.controller,undefined,'second tab must not load or restore a live journal');
    assert.strictEqual(JSON.parse(f.data[progressKey]).learningEffectiveness.questions.Q.observedAttempts,1);
    assert.strictEqual(JSON.parse(f.data[characterKey]).xp,20);assert(!f.data[progressKey+':pending-answer-v1']);
    a.fire('pagehide');await tick();assert.strictEqual(b.app.controller.model.learningEffectivenessForQuestion('Q').observedAttempts,1);
    assert.strictEqual(b.app.controller.rpg.state.xp,20);b.fire('pagehide');
  });
  await test('missing Web Locks never reads, restores or writes saved data',async()=>{
    const f=fixture(),a=tab(f,null);f.data[progressKey]='existing';await a.app.init();await tick();
    assert.strictEqual(a.app.controller,undefined);assert.strictEqual(f.storage.reads,0);assert.deepStrictEqual(f.data,{[progressKey]:'existing'});
    assert.strictEqual(a.warning.hidden,false);assert(a.warning.textContent.includes('ブラウザ'));
  });
  await test('a queued page closed before ownership cannot initialize later',async()=>{
    const f=fixture(),a=tab(f),b=tab(f);await a.app.init();await tick();b.app.init();b.fire('pagehide');a.fire('pagehide');await tick();
    assert.strictEqual(b.app.controller,undefined);
  });
  await test('pagehide revokes the old adapter before ownership moves and bfcache restore reloads',async()=>{
    const f=fixture(),a=tab(f),b=tab(f);await a.app.init();await tick();const old=a.app.controller;old.model.save();old.rpg.save();
    b.app.init();a.fire('pagehide');await tick();assert(b.app.controller);const bytes=JSON.stringify(f.data);
    assert.strictEqual(old.model.save(),false);assert.strictEqual(old.rpg.save(),false);
    assert.strictEqual(old.model.storage.removeItem(progressKey),false);assert.strictEqual(old.model.storage.restoreItem(progressKey,'{}'),false);
    assert.strictEqual(old.model.storage.readItem(progressKey).ok,false);assert.strictEqual(JSON.stringify(f.data),bytes);
    a.fire('pageshow',{persisted:true});assert.strictEqual(a.reloads,1);b.fire('pagehide');
  });
  await test('duplicate initialization keeps one controller and a rejected lock fails closed',async()=>{
    const f=fixture(),a=tab(f);await a.app.init();await tick();const c=a.app.controller;a.app.init();await tick();assert.strictEqual(a.app.controller,c);a.fire('pagehide');
    const broken=fixture(),b=tab(broken,{request(){return Promise.reject(Error('denied'));}});await b.app.init();await tick();
    assert.strictEqual(b.app.controller,undefined);assert.strictEqual(broken.storage.reads,0);assert.strictEqual(b.warning.hidden,false);
  });
  await test('offline registration failure is reported without rejecting the running learning session',async()=>{
    const f=fixture(),a=tab(f),notices=[];a.root.location.protocol='https:';
    a.root.navigator.serviceWorker={...a.root.navigator.serviceWorker,register:()=>Promise.reject(Error('registration unavailable'))};
    a.app.showToast=message=>notices.push(message);
    await a.app.init();await tick();
    assert(a.app.controller);assert.strictEqual(a.app.storageOwnership.active,true);
    assert.strictEqual(notices.length,1);assert(notices[0].includes('オフライン'));
    assert.strictEqual(a.app.controller.model.save(),true);a.fire('pagehide');
  });
  await test('corrupt startup journal shows the warning after event binding without touching either saved key',async()=>{
    const f=fixture(),a=tab(f);f.data[progressKey+':pending-answer-v1']='{bad';f.data[progressKey]='original progress';f.data[characterKey]='original character';
    const before=JSON.stringify(f.data);a.root.AppController.prototype.init=function(){a.root.addEventListener('boki-storage-error',()=>{a.warning.hidden=false;});};
    await a.app.init();await tick();
    try{assert.strictEqual(a.app.controller.model.storageWriteBlocked,true);assert.strictEqual(a.warning.hidden,false);assert.strictEqual(JSON.stringify(f.data),before);}
    finally{a.fire('pagehide');}
  });
  await test('an uncooperative prior-release client prevents all startup storage access until it closes',async()=>{
    const f=fixture(),a=tab(f);f.clients.add('legacy-without-web-lock');a.app.init();await tick();
    try{
      assert.strictEqual(a.app.controller,undefined);assert.strictEqual(f.storage.reads,0);
      for(let i=0;i<100&&a.app.storageClientStatus!=='waiting';i++)await new Promise(resolve=>setTimeout(resolve,10));
      assert.strictEqual(a.app.storageClientStatus,'waiting');assert.strictEqual(a.warning.hidden,false);
      f.clients.delete('legacy-without-web-lock');await a.app.ready;assert(a.app.controller);assert.strictEqual(a.app.storageOwnership.active,true);
    }finally{f.clients.delete('legacy-without-web-lock');a.fire('pagehide');}
  });
  await test('a missing coordinator that cannot be installed does not guess that no legacy tab exists',async()=>{
    const f=fixture(),a=tab(f);f.data[progressKey]='original';
    a.root.navigator.serviceWorker={async getRegistration(){return undefined;},async register(){throw Error('cannot install coordinator');}};
    await a.app.init();await tick();
    try{assert.strictEqual(a.app.controller,undefined);assert.strictEqual(f.storage.reads,0);assert.deepStrictEqual(f.data,{[progressKey]:'original'});assert.strictEqual(a.warning.hidden,false);}
    finally{a.fire('pagehide');}
  });
  await test('a preserved Release179 heap cannot overwrite the current learning store when it resumes',async()=>{
    const loadLegacy=file=>{
      const source=require('child_process').execFileSync('git',['show','81088e2ad3bc96a6ff5bd995e6dfcfb58a4fd62f:'+file],{encoding:'utf8'});
      const module={exports:{}};vm.runInNewContext(source,{module,console});return module.exports;
    };
    const LegacyModel=loadLegacy('js/model.js'),LegacyRPG=loadLegacy('js/rpg.js');
    const f=fixture(),legacyModel=new LegacyModel(questions,f.storage),legacyRpg=new LegacyRPG(f.storage);
    legacyModel.recordAttempt('Q',false,10,'journal-entry',false,Date.now());legacyModel.save();legacyRpg.save();
    // Hold the actual old models in memory while no legacy WindowClient is
    // visible, then resume their unchanged save methods after the new answer.
    const a=tab(f),b=tab(f);await a.app.init();const current=a.app.controller;
    try{
      assert(current.learningTransaction(()=>{assert(current.model.recordAttempt('Q',true,10,'',false,Date.now()));current.rpg.state.xp+=20;return true;}));
      assert.strictEqual(current.model.learningEffectivenessForQuestion('Q').observedAttempts,1);
      legacyModel.save();legacyRpg.save();
      a.fire('pagehide');await b.app.init();
      assert.strictEqual(b.app.controller.model.learningEffectivenessForQuestion('Q').observedAttempts,1,'the resumed old heap must not erase the new observation');
      assert.strictEqual(b.app.controller.rpg.state.xp,20,'the resumed old heap must not erase the new reward');
    }finally{a.fire('pagehide');b.fire('pagehide');}
  });
  await test('a legacy source changed during startup is preserved and cannot become an assumed stable baseline',async()=>{
    const f=fixture();legacyFixture(f);const original=f.data[legacyProgressKey],changed=JSON.stringify({...JSON.parse(original),mode:'training'}),get=f.storage.getItem;
    let changedOnce=false;f.storage.getItem=function(key){const value=get.call(this,key);if(key===legacyCharacterKey&&!changedOnce){changedOnce=true;f.data[legacyProgressKey]=changed;}return value;};
    const a=tab(f);await a.app.init();await tick();
    try{assert(changedOnce);assert(a.app.controller.model.storageWriteBlocked);assert.strictEqual(f.data[legacyProgressKey],changed);assert.strictEqual(f.data[isolatedProgressKey],undefined);assert.strictEqual(f.data[isolatedCharacterKey],undefined);}
    finally{a.fire('pagehide');}
  });
  await test('an interrupted legacy copy recovers its original baseline without changing legacy bytes',async()=>{
    const f=fixture();legacyFixture(f);const before={progress:f.data[legacyProgressKey],character:f.data[legacyCharacterKey]},set=f.storage.setItem;let fail=true;
    f.storage.setItem=function(key,value){if(fail&&key===isolatedCharacterKey)throw Error('copy interrupted');set.call(this,key,value);};
    const a=tab(f),b=tab(f);await a.app.init();await tick();
    try{
      assert(a.app.controller.model.storageWriteBlocked);assert(f.data[isolatedProgressKey+':pending-answer-v1']);
      assert.strictEqual(f.data[legacyProgressKey],before.progress);assert.strictEqual(f.data[legacyCharacterKey],before.character);
      a.fire('pagehide');fail=false;await b.app.init();assert(!b.app.controller.model.storageWriteBlocked);
      assert.strictEqual(b.app.controller.model.state.questionStats.Q.incorrectCount,1);assert.strictEqual(b.app.controller.model.learningEffectivenessForQuestion('Q').initialStatus,'unknown');
      assert.strictEqual(f.data[isolatedProgressKey+':pending-answer-v1'],undefined);assert.strictEqual(f.data[legacyProgressKey],before.progress);assert.strictEqual(f.data[legacyCharacterKey],before.character);
    }finally{a.fire('pagehide');b.fire('pagehide');}
  });
  await test('a missing new-store half never silently falls back to the legacy store',async()=>{
    const f=fixture();legacyFixture(f);const a=tab(f),b=tab(f);await a.app.init();a.app.controller.model.save();a.app.controller.rpg.save();a.fire('pagehide');
    delete f.data[isolatedCharacterKey];const before=JSON.stringify(f.data);await b.app.init();await tick();
    try{assert(b.app.controller.model.storageWriteBlocked);assert.strictEqual(JSON.stringify(f.data),before);}
    finally{b.fire('pagehide');}
  });
  await test('reset preserves the old fork and a later legacy save cannot resurrect reset learning',async()=>{
    const f=fixture(),old=legacyFixture(f),a=tab(f),b=tab(f);await a.app.init();
    try{
      const legacy={progress:f.data[legacyProgressKey],character:f.data[legacyCharacterKey]};
      assert(a.app.controller.resetLearningData());assert.strictEqual(f.data[legacyProgressKey],legacy.progress);assert.strictEqual(f.data[legacyCharacterKey],legacy.character);
      a.fire('pagehide');old.model.save();old.rpg.save();await b.app.init();
      assert.deepStrictEqual(Object.keys(b.app.controller.model.state.questionStats),[]);assert.strictEqual(b.app.controller.rpg.state.xp,0);
      assert(!b.app.controller.model.storageWriteBlocked);
    }finally{a.fire('pagehide');b.fire('pagehide');}
  });
  await test('an orphaned legacy character does not invent a fresh initial-performance history',async()=>{
    const f=fixture();legacyFixture(f);delete f.data[legacyProgressKey];const before=JSON.stringify(f.data),a=tab(f);await a.app.init();await tick();
    try{assert(a.app.controller.model.storageWriteBlocked);assert.strictEqual(JSON.stringify(f.data),before);}
    finally{a.fire('pagehide');}
  });
  await test('reset rolls back each current write and never mutates any of the four legacy keys',async()=>{
    for(let boundary=0;boundary<6;boundary++){
      const f=fixture();legacyFixture(f);const a=tab(f);await a.app.init();const c=a.app.controller;
      try{
        c.model.save();c.rpg.save();const before={...f.data},keys=[progressKey,characterKey,legacyProgressKey,legacyCharacterKey,legacyProgressKey+':pending-answer-v1',progressKey+':legacy-source-v1'];assert.deepStrictEqual(Array.from(c.model.storage.resetKeys),keys.slice(0,2));
        const set=f.storage.setItem,remove=f.storage.removeItem;let failed=false;
        const fail=key=>{if(key===keys[boundary]&&!failed){failed=true;throw Error('reset boundary '+boundary);}};
        f.storage.setItem=function(key,value){fail(key);return set.call(this,key,value);};
        f.storage.removeItem=function(key){fail(key);return remove.call(this,key);};
        c.openSettings=()=>{};
        const reset=c.resetLearningData();
        if(boundary<2){assert.strictEqual(reset,false);assert(failed);assert.deepStrictEqual(f.data,before);assert.strictEqual(a.reloads,0);}
        else {assert.strictEqual(reset,true);assert.strictEqual(failed,false);for(const key of keys.slice(2))assert.strictEqual(f.data[key],before[key]);assert.strictEqual(f.data[progressKey],'null');assert.strictEqual(f.data[characterKey],'null');}
      }finally{a.fire('pagehide');}
    }
  });
  await test('corrupt legacy journal blocks migration and preserves every source byte',async()=>{
    const f=fixture();legacyFixture(f);f.data[legacyProgressKey+':pending-answer-v1']='{bad';const before={...f.data},a=tab(f);await a.app.init();await tick();
    try{assert(a.app.controller.model.storageWriteBlocked);assert.deepStrictEqual(f.data,before);}
    finally{a.fire('pagehide');}
  });
  await test('valid interrupted legacy journal is recovered into the new namespace only',async()=>{
    const f=fixture(),old=legacyFixture(f),baseline={progress:f.data[legacyProgressKey],character:f.data[legacyCharacterKey]};
    const pending={schemaVersion:1,progressKey:legacyProgressKey,characterKey:legacyCharacterKey,...baseline};
    const text=JSON.stringify([1,legacyProgressKey,legacyCharacterKey,baseline.progress,baseline.character]);let hash=2166136261;
    for(let i=0;i<text.length;i++)hash=Math.imul(hash^text.charCodeAt(i),16777619)>>>0;
    f.data[legacyProgressKey+':pending-answer-v1']=JSON.stringify({...pending,signature:hash.toString(16).padStart(8,'0')});
    old.model.recordAttempt('Q',true,10,'',false,Date.now());old.model.save();const source={...f.data},a=tab(f);await a.app.init();
    try{
      assert.strictEqual(a.app.controller.model.state.questionStats.Q.correctCount,0);assert.strictEqual(a.app.controller.model.state.questionStats.Q.incorrectCount,1);
      assert.strictEqual(a.app.controller.model.learningEffectivenessForQuestion('Q').initialStatus,'unknown');
      for(const [key,value] of Object.entries(source))assert.strictEqual(f.data[key],value);
      assert(!f.data[progressKey+':pending-answer-v1']);
    }finally{a.fire('pagehide');}
  });
  await test('fresh-store copy interrupted before its second tombstone cannot import later legacy data',async()=>{
    const f=fixture(),set=f.storage.setItem;let fail=true;
    f.storage.setItem=function(key,value){if(fail&&key===characterKey)throw Error('new store interrupted');return set.call(this,key,value);};
    const a=tab(f),b=tab(f);await a.app.init();
    try{
      assert(a.app.controller.model.storageWriteBlocked);assert(f.data[progressKey+':pending-answer-v1']);a.fire('pagehide');fail=false;legacyFixture(f);
      await b.app.init();assert(!b.app.controller.model.storageWriteBlocked);assert.deepStrictEqual(b.app.controller.model.state.questionStats,{});
      assert.strictEqual(b.app.controller.model.learningEffectivenessForQuestion('Q').initialStatus,'unanswered');assert(!f.data[progressKey+':pending-answer-v1']);
    }finally{a.fire('pagehide');b.fire('pagehide');}
  });
  await test('unreadable legacy data prevents startup and all namespace writes',async()=>{
    const f=fixture();legacyFixture(f);const before={...f.data},get=f.storage.getItem;
    f.storage.getItem=function(key){if(key===legacyProgressKey)throw Error('read denied');return get.call(this,key);};
    const a=tab(f);await a.app.init();
    try{assert.strictEqual(a.app.controller,undefined);assert.strictEqual(a.warning.hidden,false);assert.deepStrictEqual(f.data,before);}
    finally{a.fire('pagehide');}
  });
  await test('owner loss between reset writes recovers the previous learning and reward pair',async()=>{
    const f=fixture(),a=tab(f),b=tab(f);await a.app.init();const c=a.app.controller;
    assert(c.learningTransaction(()=>{c.model.recordAttempt('Q',true,10,'',false,Date.now());c.rpg.state.xp+=20;return true;}));
    const before={progress:JSON.parse(f.data[progressKey]),character:JSON.parse(f.data[characterKey])},set=f.storage.setItem;let interrupted=false;
    f.storage.setItem=function(key,value){set.call(this,key,value);if(key===progressKey&&value==='null'&&!interrupted){interrupted=true;a.fire('pagehide');}};
    c.openSettings=()=>{};assert.strictEqual(c.resetLearningData(),false);await b.app.init();
    try{
      assert(interrupted);assert.strictEqual(b.app.controller.model.learningEffectivenessForQuestion('Q').observedAttempts,1);
      assert.strictEqual(b.app.controller.model.learningEffectivenessForQuestion('Q').initialStatus,'observed');assert.strictEqual(b.app.controller.rpg.state.xp,20);
      assert.deepStrictEqual(JSON.parse(f.data[progressKey]),before.progress);assert.deepStrictEqual(JSON.parse(f.data[characterKey]),before.character);assert(!f.data[progressKey+':pending-answer-v1']);
    }finally{a.fire('pagehide');b.fire('pagehide');}
  });
  await test('a new-store empty progress marker with a remaining character fails closed',async()=>{
    const f=fixture(),a=tab(f),b=tab(f);await a.app.init();a.app.controller.rpg.save();a.fire('pagehide');const before={...f.data};await b.app.init();
    try{assert(b.app.controller.model.storageWriteBlocked);assert.deepStrictEqual(f.data,before);}
    finally{b.fire('pagehide');}
  });
  await test('failed reset cannot overwrite a later save from the actual old heap',async()=>{
    const f=fixture(),old=legacyFixture(f),a=tab(f);await a.app.init();const c=a.app.controller;c.model.save();c.rpg.save();
    const current={progress:f.data[progressKey],character:f.data[characterKey]},set=f.storage.setItem;let resumed=false,failed=false,later;
    f.storage.setItem=function(key,value){
      if(key===characterKey&&value==='null'&&!failed){failed=true;throw Error('reset write failure');}
      set.call(this,key,value);
      if(key===progressKey&&value==='null'&&!resumed){
        resumed=true;old.model.recordAttempt('Q',true,10,'',false,Date.now());old.model.save();old.rpg.state.xp+=20;old.rpg.save();
        later={progress:f.data[legacyProgressKey],character:f.data[legacyCharacterKey]};
      }
    };
    c.openSettings=()=>{};
    try{
      assert.strictEqual(c.resetLearningData(),false);assert(resumed&&failed);
      assert.strictEqual(f.data[legacyProgressKey],later.progress);assert.strictEqual(f.data[legacyCharacterKey],later.character);
      assert.strictEqual(f.data[progressKey],current.progress);assert.strictEqual(f.data[characterKey],current.character);
    }finally{a.fire('pagehide');}
  });
  await test('a stale waiting coordinator cannot activate over a current active shell',async()=>{
    const f=fixture(),a=tab(f);let activated=0;
    const stale={state:'installed',postMessage(message,ports){
      if(message.type==='BOKI_STORAGE_CLIENTS')ports[0].postMessage({protocol:1,release:'20260924-187',requester:a.clientId,clients:[...f.clients]});
      if(message.type==='SKIP_WAITING'){activated++;this.state='activated';}
    }};
    a.registration.waiting=stale;
    try{await a.app.init();assert(a.app.controller);assert.strictEqual(activated,0,'stale cache must not replace the matching active shell');}
    finally{a.fire('pagehide');}
  });
  await test('a stale-only coordinator updates to the expected release before reading saved data',async()=>{
    const f=fixture(),a=tab(f);let staleActivated=0,updated=0;
    const stale={state:'installed',postMessage(message,ports){
      if(message.type==='BOKI_STORAGE_CLIENTS')ports[0].postMessage({protocol:1,release:'20260924-187',requester:a.clientId,clients:[...f.clients]});
      if(message.type==='SKIP_WAITING'){staleActivated++;this.state='activated';}
    }};
    a.registration.active=null;a.registration.waiting=stale;
    a.registration.update=async()=>{updated++;assert.strictEqual(f.storage.reads,0);a.registration.waiting=null;a.registration.active=a.worker;};
    try{await a.app.init();assert(a.app.controller);assert.strictEqual(staleActivated,0);assert.strictEqual(updated,1);}
    finally{a.fire('pagehide');}
  });
  await test('a stale-only offline coordinator blocks without activating or touching saved data',async()=>{
    const f=fixture(),a=tab(f);let activated=0;f.data[progressKey]='original';const before={...f.data};
    const stale={state:'installed',postMessage(message,ports){
      if(message.type==='BOKI_STORAGE_CLIENTS')ports[0].postMessage({protocol:1,release:'20260924-187',requester:a.clientId,clients:[...f.clients]});
      if(message.type==='SKIP_WAITING'){activated++;this.state='activated';}
    }};
    a.registration.active=null;a.registration.waiting=stale;a.registration.update=async()=>{throw Error('origin unavailable');};
    try{await a.app.init();assert.strictEqual(a.app.controller,undefined);assert.strictEqual(activated,0);assert.strictEqual(f.storage.reads,0);assert.deepStrictEqual(f.data,before);assert.strictEqual(a.warning.hidden,false);}
    finally{a.fire('pagehide');}
  });
  for(const kind of ['older','same','newer'])await test(kind+' waiting release is offered only when it is a proven newer manual update',async()=>{
    const f=fixture(),a=tab(f),notices=[],proofs=[];a.root.location.protocol='https:';let activated=0;
    const [date,number]=currentRelease.split('-'),release=kind==='older'?'20260924-187':kind==='same'?currentRelease:date+'-'+(Number(number)+1);
    a.registration.waiting={state:'installed',postMessage(message,ports){
      if(message.type==='BOKI_STORAGE_CLIENTS')ports[0].postMessage({protocol:1,release,requester:a.clientId,clients:[...f.clients]});
      if(message.type==='SKIP_WAITING')activated++;
    }};
    const clients=a.app.storageClients.bind(a.app);
    a.app.storageClients=(...args)=>{const result=clients(...args);proofs.push(result.catch(()=>null));return result;};
    a.app.showToast=(...args)=>notices.push(args);
    try{
      await a.app.init();await tick();await Promise.all(proofs);await tick();assert(a.app.controller);
      assert.strictEqual(notices.length,kind==='newer'?1:0,'only an actually newer release is an update');
      assert.strictEqual(activated,0);
      if(kind==='newer'){assert.strictEqual(notices[0][1],'更新');notices[0][2]();assert.strictEqual(activated,1);}
    }finally{a.fire('pagehide');}
  });
  await test('a newly installed future worker remains offered after installing moves to waiting',async()=>{
    const f=fixture(),a=tab(f),notices=[],proofs=[],events={};a.root.location.protocol='https:';
    a.registration.addEventListener=(name,fn)=>{events[name]=fn;};a.app.showToast=(...args)=>notices.push(args);
    const clients=a.app.storageClients.bind(a.app);a.app.storageClients=(...args)=>{const result=clients(...args);proofs.push(result.catch(()=>null));return result;};
    const [date,number]=currentRelease.split('-');let stateChanged,activated=0;
    const future={state:'installing',addEventListener(name,fn){assert.strictEqual(name,'statechange');stateChanged=fn;},postMessage(message,ports){
      if(message.type==='BOKI_STORAGE_CLIENTS')ports[0].postMessage({protocol:1,release:date+'-'+(Number(number)+1),requester:a.clientId,clients:[...f.clients]});
      if(message.type==='SKIP_WAITING')activated++;
    }};
    try{
      await a.app.init();await tick();a.registration.installing=future;events.updatefound();
      future.state='installed';a.registration.installing=null;a.registration.waiting=future;stateChanged();
      await Promise.all(proofs);await tick();assert.strictEqual(notices.length,1);assert.strictEqual(activated,0);
      notices[0][2]();assert.strictEqual(activated,1);
    }finally{a.fire('pagehide');}
  });

  const ownProof=(f,a,activation,after=()=>{})=>{
    a.worker.postMessage=function(message,ports){
      if(message.type==='BOKI_STORAGE_CLIENTS'){
        const value={protocol:1,release:currentRelease,requester:a.clientId,clients:[...f.clients],activation:typeof activation==='function'?activation():activation};
        after();ports[0].postMessage(value);
      }
    };
  };
  const until=async condition=>{for(let i=0;i<200&&!condition();i++)await new Promise(resolve=>setTimeout(resolve,5));};
  await test('a stale activating page wrapper starts only with its active worker own activated proof',async()=>{
    const f=fixture(),a=tab(f);a.worker.state='activating';ownProof(f,a,{state:'activated',active:true});
    try{a.app.init();await until(()=>!!a.app.controller);assert(a.app.controller,'own activated coordinator must unblock the stale page wrapper');assert(a.app.storageOwnership.active);}
    finally{a.fire('pagehide');}
  });
  for(const activation of [{state:'activating',active:true},{state:'installed',active:false},undefined,{state:'activated'}, {state:'activated',active:false}])await test('page activated does not override missing, inconsistent or incomplete own activation '+JSON.stringify(activation),async()=>{
    const f=fixture(),a=tab(f);f.data[progressKey]='original';ownProof(f,a,activation);
    try{a.app.init();await new Promise(resolve=>setTimeout(resolve,40));assert.strictEqual(a.app.controller,undefined);assert.strictEqual(f.storage.reads,0);assert.deepStrictEqual(f.data,{[progressKey]:'original'});}
    finally{a.fire('pagehide');}
  });
  for(const invalidation of ['other-controller','replaced-active','redundant','pagehide'])await test('own activation proof cannot survive '+invalidation+' during the reply',async()=>{
    const f=fixture(),a=tab(f);ownProof(f,a,{state:'activated',active:true},()=>{
      if(invalidation==='other-controller')a.root.navigator.serviceWorker.controller={state:'activated'};
      if(invalidation==='replaced-active')a.registration.active={state:'activated',postMessage(){throw Error('different worker');}};
      if(invalidation==='redundant')a.worker.state='redundant';
      if(invalidation==='pagehide')a.fire('pagehide');
    });
    try{a.app.init();await new Promise(resolve=>setTimeout(resolve,40));assert.strictEqual(a.app.controller,undefined);assert.strictEqual(f.storage.reads,0);}
    finally{a.fire('pagehide');}
  });
  await test('a genuinely activating worker prevents storage reads until its own activation completes',async()=>{
    const f=fixture(),a=tab(f);a.worker.state='activating';let ownState='activating';ownProof(f,a,()=>({state:ownState,active:true}));
    try{a.app.init();await new Promise(resolve=>setTimeout(resolve,40));assert.strictEqual(f.storage.reads,0);assert.strictEqual(a.app.controller,undefined);
      ownState='activated';await until(()=>!!a.app.controller);assert(a.app.controller);}
    finally{a.fire('pagehide');}
  });
  await test('own activated proof cannot bypass an old client, and startup rechecks after that client closes',async()=>{
    const f=fixture(),a=tab(f);a.worker.state='activating';f.clients.add('old-client');ownProof(f,a,{state:'activated',active:true});
    try{a.app.init();await until(()=>a.app.storageClientStatus==='waiting');assert.strictEqual(a.app.storageClientStatus,'waiting');assert.strictEqual(f.storage.reads,0);
      f.clients.delete('old-client');await until(()=>!!a.app.controller);assert(a.app.controller);}
    finally{a.fire('pagehide');}
  });
  await test('explicitly unsupported own-state API never unlocks an activating page wrapper',async()=>{
    const f=fixture(),a=tab(f);a.worker.state='activating';
    try{a.app.init();await new Promise(resolve=>setTimeout(resolve,40));assert.strictEqual(f.storage.reads,0);assert.strictEqual(a.app.controller,undefined);}
    finally{a.fire('pagehide');}
  });
  for(const activation of [null,{state:'activated',active:true}])await test('force refresh with no controlling worker preserves normal activated coordinator startup '+JSON.stringify(activation),async()=>{
    const f=fixture(),a=tab(f);a.root.navigator.serviceWorker.controller=null;ownProof(f,a,activation);
    try{a.app.init();await until(()=>!!a.app.controller);assert(a.app.controller,'force reload remains supported without taking the stale activating exception');}
    finally{a.fire('pagehide');}
  });
  await test('startup re-enumerates clients after installed worker activation before reading saves',async()=>{
    const f=fixture(),a=tab(f);let activeProofs=0;
    const old={state:'activated',postMessage(message,ports){if(message.type==='BOKI_STORAGE_CLIENTS')ports[0].postMessage({protocol:1,release:'20260924-187',requester:a.clientId,clients:[...f.clients]});}};
    a.registration.active=old;a.registration.waiting=a.worker;a.root.navigator.serviceWorker.controller=old;a.worker.state='installed';
    a.worker.postMessage=function(message,ports){
      if(message.type==='SKIP_WAITING'){this.state='activating';a.registration.active=this;a.registration.waiting=null;a.root.navigator.serviceWorker.controller=this;f.clients.add('arrived-during-activation');}
      if(message.type==='BOKI_STORAGE_CLIENTS'){
        const activated=this.state==='activating';if(activated)activeProofs++;
        ports[0].postMessage({protocol:1,release:currentRelease,requester:a.clientId,clients:[...f.clients],activation:{state:activated?'activated':'installed',active:activated}});
      }
    };
    try{a.app.init();await until(()=>a.app.storageClientStatus==='waiting');assert.strictEqual(a.app.storageClientStatus,'waiting');assert(activeProofs>=2,'post-activation client list must be obtained again');assert.strictEqual(f.storage.reads,0);
      f.clients.delete('arrived-during-activation');await until(()=>!!a.app.controller);assert(a.app.controller);}
    finally{a.fire('pagehide');}
  });
  for(const malformed of ['duplicate-clients','missing-requester','wrong-release'])await test('own activated evidence never overrides '+malformed,async()=>{
    const f=fixture(),a=tab(f);a.worker.postMessage=function(message,ports){if(message.type==='BOKI_STORAGE_CLIENTS')ports[0].postMessage({protocol:1,release:malformed==='wrong-release'?'20260924-187':currentRelease,requester:a.clientId,clients:malformed==='duplicate-clients'?[a.clientId,a.clientId]:malformed==='missing-requester'?['another-client']:[a.clientId],activation:{state:'activated',active:true}});};
    try{await a.app.init();assert.strictEqual(a.app.controller,undefined);assert.strictEqual(f.storage.reads,0);}
    finally{a.fire('pagehide');}
  });
  await test('annual journal is recovered before the real models load after ownership loss',async()=>{
    const f=fixture(),a=tab(f),b=tab(f);await a.app.init();const c=a.app.controller;
    assert(c.learningTransaction(()=>{assert(c.model.recordAttempt('Q',true,10,'',false,Date.now()));c.rpg.state.xp+=20;return true;}));
    const before={...f.data},set=f.storage.setItem;let interrupted=false;
    f.storage.setItem=function(key,value){set.call(this,key,value);if(key===progressKey&&value==='null'&&!interrupted){interrupted=true;a.fire('pagehide');}};
    try{assert.throws(()=>c.model.storage.annualStorage.resetAll({confirm:true}),/recovery pending/);assert(f.data['boki-rpg-annual-transaction-v1']);await b.app.init();assert(interrupted);assert(!b.app.controller.model.storageWriteBlocked);assert.strictEqual(b.app.controller.rpg.state.xp,20);assert.deepStrictEqual(f.data,before);}
    finally{a.fire('pagehide');b.fire('pagehide');}
  });
  await test('unapproved future data or competing journals block all startup writes',async()=>{
    for(const values of [{'boki-rpg-progress-v3:FY2027':'null'},{'boki-rpg-progress-v3:FY2027:pending-answer-v1':'bad'},{'boki-rpg-annual-transaction-v1':'{}',[progressKey+':pending-answer-v1']:'bad'}]){
      const f=fixture(),a=tab(f);Object.assign(f.data,values);const before={...f.data};
      try{await a.app.init();assert(a.app.controller.model.storageWriteBlocked);assert.deepStrictEqual(f.data,before);assert.strictEqual(a.app.controller.model.save(),false);assert.strictEqual(a.app.controller.rpg.save(),false);}
      finally{a.fire('pagehide');}
    }
  });
  await test('current V1 backup import interrupted between progress and character recovers original pair on next startup',async()=>{
    const f=fixture(),a=tab(f),b=tab(f);await a.app.init();const c=a.app.controller;
    c.model.save();c.rpg.save();const earlier=JSON.stringify({format:'boki-rpg-backup',version:1,progress:c.model.state,character:c.rpg.state});
    assert(c.learningTransaction(()=>{assert(c.model.recordAttempt('Q',true,10,'',false,Date.now()));c.rpg.state.xp+=20;return true;}));
    const before={...f.data},set=f.storage.setItem;let interrupted=false;
    f.storage.setItem=function(key,value){set.call(this,key,value);if(key===progressKey&&!interrupted){interrupted=true;a.fire('pagehide');}};
    const original=c.document.getElementById;c.document.getElementById=id=>id==='backup-status'?{textContent:'',classList:{add(){},remove(){}}}:original(id);
    try{assert.strictEqual(await c.importBackup({text:async()=>earlier}),false);assert(f.data[progressKey+':pending-answer-v1']);await b.app.init();assert(interrupted);assert(!b.app.controller.model.storageWriteBlocked);assert.strictEqual(b.app.controller.rpg.state.xp,20);assert.deepStrictEqual(f.data,before);}
    finally{a.fire('pagehide');b.fire('pagehide');}
  });
  await test('FY2026 scoped reset restarts with earned character while FY2027 is disabled',async()=>{
    const f=fixture(),a=tab(f),b=tab(f);await a.app.init();const c=a.app.controller;
    try{assert(c.learningTransaction(()=>{assert(c.model.recordAttempt('Q',true,10,'',false,Date.now()));c.rpg.state.xp+=20;return true;}));
      assert(c.model.storage.annualStorage.resetYear('FY2026',{confirm:true}));const before={...f.data};a.fire('pagehide');await b.app.init();
      assert(!b.app.controller.model.storageWriteBlocked);assert.strictEqual(b.app.controller.rpg.state.xp,20);assert.deepStrictEqual(b.app.controller.model.state.questionStats,{});assert.deepStrictEqual(f.data,before);
      assert.strictEqual(b.app.controller.model.storage.annualStorage.exportV2().progress.FY2026.status,'reset');
    }finally{a.fire('pagehide');b.fire('pagehide');}
  });
  for(const [progress,character] of [['absent','absent'],['absent','saved'],['reset','absent']])await test('intentional '+progress+'/'+character+' restore survives reload without legacy resurrection',async()=>{
    const f=fixture();legacyFixture(f);const a=tab(f),b=tab(f);await a.app.init();const c=a.app.controller;
    try{c.model.save();c.rpg.state.xp=20;c.rpg.save();const old={progress:f.data[legacyProgressKey],character:f.data[legacyCharacterKey]};const backup=c.model.storage.annualStorage.exportV2();backup.progress.FY2026={status:progress};if(character==='absent')backup.character={status:character};
      assert(c.model.storage.annualStorage.importV2(backup,{confirmReplaceAll:true}));const before={...f.data};a.fire('pagehide');await b.app.init();const next=b.app.controller;
      assert(!next.model.storageWriteBlocked);assert.deepStrictEqual(next.model.state.questionStats,{});assert.strictEqual(next.rpg.state.xp,character==='saved'?20:0);assert.deepStrictEqual(f.data,before);assert.strictEqual(f.data[legacyProgressKey],old.progress);assert.strictEqual(f.data[legacyCharacterKey],old.character);assert.deepStrictEqual(JSON.parse(JSON.stringify(next.model.storage.annualStorage.exportV2())),JSON.parse(JSON.stringify(backup)));
    }finally{a.fire('pagehide');b.fire('pagehide');}
  });
  await test('answer rollback preserves intentional empty marker and future absence',async()=>{
    const f=fixture(),a=tab(f),b=tab(f);await a.app.init();const c=a.app.controller;
    try{c.model.save();c.rpg.save();const backup=c.model.storage.annualStorage.exportV2();backup.progress.FY2026={status:'absent'};backup.character={status:'absent'};c.model.storage.annualStorage.importV2(backup,{confirmReplaceAll:true});a.fire('pagehide');await b.app.init();const d=b.app.controller,before={...f.data},set=f.storage.setItem;let fail=true;
      f.storage.setItem=function(k,v){if(k===characterKey&&fail){fail=false;throw Error('character write interrupted');}return set.call(this,k,v);};
      assert.strictEqual(d.learningTransaction(()=>{assert(d.model.recordAttempt('Q',true,10,'',false,Date.now()));d.rpg.state.xp+=20;return true;}),false);assert(!fail);assert.deepStrictEqual(f.data,before);
    }finally{a.fire('pagehide');b.fire('pagehide');}
  });
  console.log(`STORAGE_OWNERSHIP ${passed}/${passed+failed} PASS; ${failed} FAIL`);if(failed)process.exitCode=1;
})();
