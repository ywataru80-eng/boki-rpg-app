'use strict';
const assert=require('assert'),fs=require('fs'),http=require('http'),path=require('path'),cp=require('child_process'),vm=require('vm');
const {chromium,webkit}=require('playwright');
const ROOT=path.resolve(__dirname,'../..'),OUTPUT=path.join(ROOT,'artifacts/learning-effectiveness');
// Generate a genuine prior-format save using the reviewed ancestor, without
// teaching the current implementation how to forge its predecessor's marker.
const legacyExam=(()=>{
  const legacy={window:{}};vm.runInNewContext(fs.readFileSync(path.join(ROOT,'data/questions.js'),'utf8'),legacy);
  vm.runInNewContext(cp.execFileSync('git',['show','2cf70526f3cdc18560f151d4d32134a49aef79cb:js/model.js'],{cwd:ROOT,encoding:'utf8'}),legacy);
  const questions=legacy.window.QuestionData,pool=Array.from(legacy.window.ExamPoolDefinition),model=new legacy.window.ProgressModel(questions,{getItem:()=>null,setItem:()=>true});
  model.state.mode='exam';model.state.examSession={ids:pool.slice(0,15),startedAt:100,endAt:2000,status:'RUNNING',evidenceVersion:1,scores:{}};
  const first=model.state.examSession.ids[0];assert(model.recordAttempt(first,false,10,'journal-entry',false,1000,null,'unsure',{mode:'exam',support:'none'}));
  model.state.examSession.scores[first]={correct:false,earned:0,possible:1,ratio:0,observationNumber:1};model.save();
  assert.strictEqual(model.state.learningEvidenceIntegrity.schemaVersion,5);
  assert(legacy.window.ProgressModel.validateBackupState(model.state,questions));
  const nonPoolTransfer=Object.values(questions).find(q=>q.learningRole==='transfer'&&!pool.includes(q.id));assert(nonPoolTransfer);
  return {progress:JSON.parse(JSON.stringify(model.state)),outside:['J001',nonPoolTransfer.id]};
})();
const legacyMistakes=(()=>{
  const old={window:{}};vm.runInNewContext(fs.readFileSync(path.join(ROOT,'data/questions.js'),'utf8'),old);
  vm.runInNewContext(cp.execFileSync('git',['show','86135e34047c7356aa2a020d5221ca14f205c4d9:js/model.js'],{cwd:ROOT,encoding:'utf8'}),old);
  const model=new old.window.ProgressModel(old.window.QuestionData,{getItem:()=>null,setItem:()=>true});
  assert(model.recordAttempt('J001',false,10,'journal-entry',false,1000));model.record('J001',false,1000);
  for(let i=0;i<201;i++)assert(model.recordAttempt('J002',true,10,'',false,2000+i));
  assert.strictEqual(model.state.learningEvidenceIntegrity.schemaVersion,7);assert.strictEqual(model.state.mistakeCounts.J001,1);
  assert(!model.state.attempts.some(row=>row.questionId==='J001'));assert(old.window.ProgressModel.validateBackupState(model.state,old.window.QuestionData));
  const unresolved=JSON.parse(JSON.stringify(model.state));
  for(let stage=0;stage<4;stage++){
    const due=model.state.reviewSchedule.J001.dueAt;model.assignReview('J001','J001',due-1);model.state.mode='review';
    assert(model.recordAttempt('J001',true,10,'',true,due,stage,'unsure',{mode:'review',support:'none',reviewSourceId:'J001'}));assert(model.completeReview('J001',true,due,'J001'));
  }
  model.state.mode='training';for(let i=0;i<201;i++)assert(model.recordAttempt('J002',true,10,'',false,model.state.lastLearningAt+1));
  assert(!model.state.incorrectIds.includes('J001'));assert(!model.state.attempts.some(row=>row.questionId==='J001'));
  return {unresolved,resolved:JSON.parse(JSON.stringify(model.state))};
})();
// Generate a genuine historical revision-4 / schema-2 save, not a forged
// revision-6 save with its content identity marker rewritten.
const legacyUnknown=(()=>{
  const ancestor='6e337300937dcc60a54be4bf31aab56b3208f6d0';
  const old={window:{},console};
  for(const file of ['data/questions.js','js/model.js']){
    const source=cp.execFileSync('git',['show',`${ancestor}:${file}`],{cwd:ROOT,encoding:'utf8',maxBuffer:16*1024*1024});
    vm.runInNewContext(source,old,{filename:`${ancestor}:${file}`});
  }
  const questions=old.window.QuestionData;
  const model=new old.window.ProgressModel(questions,{getItem:()=>null,setItem:()=>true});
  assert.strictEqual(model.state.contentRevision,4);
  assert.strictEqual(model.state.learningSchemaVersion,2);
  assert.strictEqual(model.state.learningEffectiveness,undefined);
  assert(model.recordAttempt('J001',false,10,'journal-entry',false,1000));
  assert(old.window.ProgressModel.validateBackupState(model.state,questions));
  return JSON.parse(JSON.stringify(model.state));
})();
const evidence={status:'RUNNING',head:cp.execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),reports:[]};
const write=()=>{fs.mkdirSync(OUTPUT,{recursive:true});fs.writeFileSync(path.join(OUTPUT,'evidence.json'),JSON.stringify(evidence,null,2)+'\n');};
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
const server=http.createServer((req,res)=>{
  const file=path.resolve(ROOT,new URL(req.url,'http://localhost').pathname.slice(1)||'index.html');
  if(!file.startsWith(ROOT+path.sep)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);return res.end();}
  res.setHeader('content-type',mime[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));
});
async function run(){
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url='http://127.0.0.1:'+server.address().port+'/';write();
  try{
    for(const [engine,launcher] of Object.entries({chromium,webkit})){
      const browser=await launcher.launch();
      try{
        for(const width of [320,390,768]){
          const context=await browser.newContext({viewport:{width,height:900}}),errors=[];
          let page=await context.newPage();
          page.on('pageerror',error=>errors.push(error.stack||String(error)));
          try{
            await page.goto(url,{waitUntil:'load'});
            await page.waitForFunction(()=>Boolean(window.App?.controller));
            const placement=await page.evaluate(async legacy=>{
              const c=window.App.controller;c.model.completePlacement({foundation:80,closing:70},1000);c.rpg.save();
              if(c.model.state.attempts.length)throw Error('placement fixture contains an answer');
              const progress=JSON.parse(JSON.stringify(c.model.state)),character=JSON.parse(JSON.stringify(c.rpg.state));
              const pair=[localStorage.getItem(c.model.key),localStorage.getItem(c.rpg.key)];
              const badPlacement=JSON.parse(JSON.stringify(progress));badPlacement.placement=null;
              const badExams=legacy.outside.map(id=>{const bad=JSON.parse(JSON.stringify(legacy.progress));bad.examSession.ids[1]=id;return bad;});
              const inflatedMistakes=JSON.parse(JSON.stringify(legacy.mistakes.unresolved));inflatedMistakes.mistakeCounts.J001=999;
              const missingMistakes=JSON.parse(JSON.stringify(legacy.mistakes.unresolved));delete missingMistakes.mistakeCounts.J001;
              const badGrades=[{earned:1,ratio:1},{ratio:0.5}].map(fields=>{const bad=JSON.parse(JSON.stringify(legacy.progress));Object.assign(bad.examSession.scores[bad.examSession.ids[0]],fields);return bad;});
              const resolvedMissing=JSON.parse(JSON.stringify(legacy.mistakes.resolved));delete resolvedMissing.mistakeCounts.J001;
              const resolvedZero=JSON.parse(JSON.stringify(legacy.mistakes.resolved));resolvedZero.mistakeCounts.J001=0;
              for(const bad of [badPlacement,...badExams,inflatedMistakes,missingMistakes,...badGrades,resolvedMissing,resolvedZero]){
                if(await c.importBackup({text:async()=>JSON.stringify({format:'boki-rpg-backup',version:1,progress:bad,character})})!==false)throw Error('incomplete placement or legacy exam accepted');
                if(localStorage.getItem(c.model.key)!==pair[0]||localStorage.getItem(c.rpg.key)!==pair[1])throw Error('rejected legacy import changed saved pair');
              }
              const migrated=ProgressModel.prepareBackupState(legacy.progress,c.questions);
              if(!migrated||JSON.stringify(migrated.examSession)!==JSON.stringify(legacy.progress.examSession))throw Error('valid legacy exam migration lost session');
              const migratedMistakes=ProgressModel.prepareBackupState(legacy.mistakes.unresolved,c.questions);
              if(!migratedMistakes||migratedMistakes.mistakeCounts.J001!==1||JSON.stringify(migratedMistakes.learningEffectiveness)!==JSON.stringify(legacy.mistakes.unresolved.learningEffectiveness))throw Error('valid legacy mistake migration changed evidence');
              const resolved=ProgressModel.prepareBackupState(legacy.mistakes.resolved,c.questions);
              if(!resolved||resolved.mistakeCounts.J001!==1||JSON.stringify(resolved.learningEffectiveness)!==JSON.stringify(legacy.mistakes.resolved.learningEffectiveness))throw Error('resolved old mistake migration lost evidence');
              return progress.placement;
            },{...legacyExam,mistakes:legacyMistakes});
            await page.reload({waitUntil:'load'});await page.waitForFunction(()=>Boolean(window.App?.controller));
            assert.deepStrictEqual(await page.evaluate(()=>App.controller.model.state.placement),placement);
            assert.strictEqual(await page.evaluate(()=>App.controller.model.state.attempts.length),0);
            assert.strictEqual(await page.locator('#view-placement').isVisible(),false);
            if(await page.locator('#app-notice-dialog').evaluate(el=>el.open)){
              const cancel=page.locator('#app-notice-cancel');
              await (await cancel.isVisible()?cancel:page.locator('#app-notice-confirm')).click();
            }
            await page.evaluate(()=>{const c=window.App.controller;c.model.state.mode='training';c.start('J003',{fresh:true});});
            await page.locator('#question-form .debit-amount').first().fill('123');
            const partial=await page.evaluate(async()=>{
              const c=window.App.controller;if(!c.saveDraft(true))throw Error('partial journal save failed');
              const tableId='L001',cells=Object.fromEntries(c.questions[tableId].table.inputCells.map((id,i)=>[id,i===0?'12':'']));
              if(!c.model.setDraft(tableId,{cells}))throw Error('partial table save failed');
              c.model.state.currentQuestionId='J003';c.model.save();
              const progress=JSON.parse(JSON.stringify(c.model.state)),character=JSON.parse(JSON.stringify(c.rpg.state)),pair=[localStorage.getItem(c.model.key),localStorage.getItem(c.rpg.key)];
              const mutations=[v=>delete v.drafts.J003,v=>v.drafts.J003.debit[0].amount=999,v=>delete v.drafts[tableId],v=>v.drafts[tableId].cells[Object.keys(cells)[0]]='99'];
              for(const mutate of mutations){const bad=JSON.parse(JSON.stringify(progress));mutate(bad);
                if(await c.importBackup({text:async()=>JSON.stringify({format:'boki-rpg-backup',version:1,progress:bad,character})})!==false)throw Error('changed partial draft accepted');
                if(localStorage.getItem(c.model.key)!==pair[0]||localStorage.getItem(c.rpg.key)!==pair[1])throw Error('draft rejection changed saved pair');
              }
              return progress.drafts;
            });
            await page.reload({waitUntil:'load'});await page.waitForFunction(()=>Boolean(window.App?.controller));
            assert.deepStrictEqual(await page.evaluate(()=>App.controller.model.state.drafts),partial);
            assert.strictEqual(await page.evaluate(()=>App.controller.model.state.attempts.length),0);
            if(await page.locator('#app-notice-dialog').evaluate(el=>el.open)){
              const cancel=page.locator('#app-notice-cancel');await (await cancel.isVisible()?cancel:page.locator('#app-notice-confirm')).click();
            }
            const restoredPartial=await page.evaluate(()=>{const c=window.App.controller;c.start('J003');return c.view.readAnswer(c.questions.J003);});
            assert.deepStrictEqual(restoredPartial,partial.J003);
            await page.evaluate(()=>{const c=window.App.controller;c.model.clearDrafts(['J003','L001']);c.model.state.mode='training';c.start('J001',{fresh:true});});
            // Submit a real blank form; coaching corrects it without changing the
            // first score, mastery, or reward ledger.
            await page.click('#question-form .confirm-button');
            const wrong=await page.evaluate(()=>{const c=window.App.controller;return {metric:c.model.learningEffectivenessForQuestion('J001'),rpg:c.rpg.state,stats:c.model.state.questionStats.J001};});
            assert.strictEqual(wrong.metric.firstAttempt.correct,false);assert.strictEqual(wrong.metric.firstAttempt.mode,'training');
            await page.click('[data-action="coaching-retry-result"]');
            await page.evaluate(()=>{const c=window.App.controller;c.view.applyRetryDraft(c.questions.J001,c.questions.J001.answer);});
            await page.click('#question-form .confirm-button');
            const coached=await page.evaluate(()=>{const c=window.App.controller;return {metric:c.model.learningEffectivenessForQuestion('J001'),rpg:c.rpg.state,stats:c.model.state.questionStats.J001};});
            assert.deepStrictEqual(coached.rpg,wrong.rpg);assert.deepStrictEqual(coached.stats,wrong.stats);
            assert.strictEqual(coached.metric.misconceptionStats['journal-entry'].assistedRecoveredCount,1);
            assert.strictEqual(coached.metric.misconceptionStats['journal-entry'].recoveredCount,0);
            await page.evaluate(()=>{const c=window.App.controller;c.model.state.mode='story';c.start('J001',{fresh:true});c.view.applyRetryDraft(c.questions.J001,c.questions.J001.answer);});
            await page.click('#question-form .confirm-button');
            const current=await page.evaluate(()=>{const c=window.App.controller;return {metric:c.model.learningEffectivenessForQuestion('J001'),rpg:c.rpg.state};});
            assert.strictEqual(current.metric.observedAttempts,2);assert.strictEqual(current.metric.misconceptionStats['journal-entry'].recoveredCount,1);
            assert(current.rpg.xp>wrong.rpg.xp);
            const beforeReload=await page.evaluate(()=>{
              const c=window.App.controller,m=c.model,now=Date.now();
              for(let i=0;i<220;i++){
                m.state.mode='review';m.state.reviewSchedule.J001={stage:i%4,dueAt:now+i};m.assignReview('J001','J001',now+i-1);
                if(!m.recordAttempt('J001',i%3!==0,10,'journal-entry',i%3!==0,now+i,i%4,'unsure',
                  {mode:'review',support:'none',observationNumber:m.nextLearningObservation('J001'),reviewSourceId:'J001'}))throw Error('durability record '+i);
                m.completeReview('J001',i%3!==0,now+i,'J001');
              }
              m.state.mode='desk';m.save();return {metric:m.learningEffectivenessForQuestion('J001'),rows:m.state.attempts.length,mistakes:m.state.mistakeCounts.J001,character:localStorage.getItem(c.rpg.key)};
            });
            assert.strictEqual(beforeReload.mistakes,1+Math.ceil(220/3));assert.strictEqual(beforeReload.rows,200);assert.strictEqual(beforeReload.metric.observedAttempts,222);
            assert.strictEqual(beforeReload.metric.delayedReview.attempts,220);assert.strictEqual(beforeReload.metric.delayedReview.successes,146);
            assert.strictEqual(beforeReload.metric.delayedReview.highestConfirmedStage,4);assert.deepStrictEqual(beforeReload.metric.firstAttempt,wrong.metric.firstAttempt);
            await page.reload({waitUntil:'load'});
            await page.waitForFunction(()=>Boolean(window.App?.controller));
            const persisted=await page.evaluate(()=>{const c=window.App.controller;return {metric:c.model.learningEffectivenessForQuestion('J001'),rows:c.model.state.attempts.length,mistakes:c.model.state.mistakeCounts.J001,character:localStorage.getItem(c.rpg.key),valid:window.ProgressModel.validateBackupState(c.model.state,c.questions)};});
            assert.strictEqual(persisted.mistakes,beforeReload.mistakes);assert(persisted.valid);assert.deepStrictEqual(persisted.metric,beforeReload.metric);assert.strictEqual(persisted.character,beforeReload.character);
            await page.evaluate(async legacyInput=>{
              const c=window.App.controller,progress=JSON.parse(JSON.stringify(c.model.state)),character=JSON.parse(JSON.stringify(c.rpg.state));
              const originalLegacy=JSON.stringify(legacyInput);
              const legacy=window.ProgressModel.prepareBackupState(legacyInput,c.questions);
              if(!legacy||!window.ProgressModel.validateBackupState(legacy,c.questions))throw Error('authentic revision4 legacy migration rejected');
              if(JSON.stringify(legacyInput)!==originalLegacy)throw Error('legacy migration mutated original bytes');
              if(legacy.learningEffectiveness.initialHistory!=='unknown')throw Error('legacy coverage');
              const missing=JSON.parse(JSON.stringify(progress));delete missing.learningEffectiveness.questions.J001;
              if(window.ProgressModel.prepareBackupState(missing,c.questions)!==null)throw Error('missing complete evidence accepted');
              const wrongRevision=JSON.parse(JSON.stringify(progress));wrongRevision.contentRevision=3;
              delete wrongRevision.questionContentVersions;delete wrongRevision.contentMigrationArchive;delete wrongRevision.contentRecheckIds;
              if(window.ProgressModel.prepareBackupState(wrongRevision,c.questions)!==null)throw Error('pre-identity evidence accepted');
              const downgraded=JSON.parse(JSON.stringify(progress));delete downgraded.learningEffectiveness;
              for(const row of downgraded.attempts){delete row.mode;delete row.support;delete row.observationNumber;}
              const unmarked=JSON.parse(JSON.stringify(progress));delete unmarked.learningEvidenceIntegrity;
              let isolatedBytes=JSON.stringify(legacy);
              const isolated=new window.ProgressModel(c.questions,{getItem:()=>isolatedBytes,setItem:(_key,value)=>{isolatedBytes=value;return true;}},'isolated');
              isolated.state.mode='training';
              if(!isolated.recordAttempt('J002',false,10,'journal-entry',false,1000))throw Error('unknown observation');
              for(let i=0;i<201;i++)if(!isolated.recordAttempt('J003',true,10,'',false,2000+i))throw Error('unknown eviction');
              if(isolated.state.attempts.some(row=>row.questionId==='J002'))throw Error('row not evicted');
              const lostUnknown=JSON.parse(JSON.stringify(isolated.state));delete lostUnknown.learningEffectiveness.questions.J002;
              const lostFlags=JSON.parse(JSON.stringify(progress));
              for(const key of ['answeredIds','correctIds'])lostFlags[key]=lostFlags[key].filter(id=>id!=='J001');
              const changedLatest=JSON.parse(JSON.stringify(isolated.state));changedLatest.questionStats.J002.lastResult=true;changedLatest.questionStats.J002.lastAnsweredAt++;
              const changedContinuity=JSON.parse(JSON.stringify(progress));changedContinuity.learningContinuityState.today.attempts++;
              if(!Object.keys(progress.reviewSchedule).length)throw Error('pending review fixture missing');
              const lostReview=JSON.parse(JSON.stringify(progress));lostReview.reviewSchedule={};lostReview.reviewAssignments={};
              isolated.state.examHistory=[{finishedAt:3000,points:80,setSignature:'native-set-a'}];isolated.updateCompletion(c.rpg);
              if(!window.ProgressModel.validateBackupState(isolated.state,c.questions))throw Error('issued exam history fixture invalid');
              const lostExamHistory=JSON.parse(JSON.stringify(isolated.state));lostExamHistory.examHistory=[];
              const lostMistakes=JSON.parse(JSON.stringify(progress));delete lostMistakes.mistakeCounts.J001;
              const alteredMistakes=JSON.parse(JSON.stringify(progress));alteredMistakes.mistakeCounts.J001++;
              c.renderModes();if(!Array.from(document.querySelectorAll('[data-question-id="J001"]')).some(el=>el.textContent.includes('誤答 75回')))throw Error('mistake badge changed after reload');
              const filters={...c.filters};c.filters={query:'',account:'',mistakes:'frequent'};
              if(!c.filteredIds(['J001','J002']).includes('J001')||c.filteredIds(['J001','J002']).includes('J002'))throw Error('mistake filter lost current totals');
              c.filters=filters;
              const beforePair=[localStorage.getItem(c.model.key),localStorage.getItem(c.rpg.key)];
              for(const bad of [missing,downgraded,unmarked,lostUnknown,lostFlags,changedLatest,changedContinuity,lostReview,lostExamHistory,lostMistakes,alteredMistakes]){
                const result=await c.importBackup({text:async()=>JSON.stringify({format:'boki-rpg-backup',version:1,progress:bad,character})});
                if(result!==false||localStorage.getItem(c.model.key)!==beforePair[0]||localStorage.getItem(c.rpg.key)!==beforePair[1])throw Error('bad evidence changed native saved state');
              }
              progress.currentQuestionId='J003';
              window.evidenceBackup={format:'boki-rpg-backup',version:1,progress,character};
            },legacyUnknown);
            // Import intentionally reloads. Wait for that navigation rather than
            // trying to return an evaluate result from a destroyed WebKit context.
            await Promise.all([page.waitForNavigation({waitUntil:'load'}),page.evaluate(()=>{
              setTimeout(()=>window.App.controller.importBackup({text:async()=>JSON.stringify(window.evidenceBackup)}),100);
            })]);
            await page.waitForFunction(()=>Boolean(window.App?.controller));
            assert.strictEqual(await page.evaluate(()=>window.App.controller.model.state.currentQuestionId),'J003');
            assert.deepStrictEqual(await page.evaluate(()=>window.App.controller.model.learningEffectivenessForQuestion('J001')),beforeReload.metric);
            const failure=await page.evaluate(()=>{
              const c=window.App.controller;c.model.state.mode='training';c.start('J002',{fresh:true});c.view.applyRetryDraft(c.questions.J002,c.questions.J002.answer);
              const before=JSON.stringify(c.model.state),character=JSON.stringify(c.rpg.state),stored=localStorage.getItem(c.model.key),set=c.model.storage.setItem;
              c.model.storage.setItem=()=>false;const result=c.submit();c.model.storage.setItem=set;
              return {rejected:result===false,stateSame:before===JSON.stringify(c.model.state),characterSame:character===JSON.stringify(c.rpg.state),bytesSame:stored===localStorage.getItem(c.model.key)};
            });
            assert(Object.values(failure).every(Boolean));
            const interrupted=await page.evaluate(()=>{
              const c=window.App.controller;c.view.applyRetryDraft(c.questions.J002,c.questions.J002.answer);
              const before={progress:JSON.parse(localStorage.getItem(c.model.key)),character:JSON.parse(localStorage.getItem(c.rpg.key))};
              const set=Storage.prototype.setItem;let writes=0;
              Storage.prototype.setItem=function(key,value){if(++writes>=3)throw new Error('simulated persistent storage failure');return set.call(this,key,value);};
              let result;try{result=c.submit();}finally{Storage.prototype.setItem=set;}
              return {before,rejected:result===false,blocked:c.model.storageWriteBlocked,pending:Boolean(localStorage.getItem(`${c.model.key}:pending-answer-v1`))};
            });
            assert(interrupted.rejected&&interrupted.blocked&&interrupted.pending);
            await page.reload({waitUntil:'load'});
            await page.waitForFunction(()=>Boolean(window.App?.controller));
            const recovered=await page.evaluate(()=>{const c=window.App.controller;return {progress:c.model.state,character:c.rpg.state,pending:localStorage.getItem(`${c.model.key}:pending-answer-v1`),blocked:Boolean(c.model.storageWriteBlocked)};});
            assert.strictEqual(recovered.pending,null);assert.strictEqual(recovered.blocked,false);
            for(const field of ['learningEffectiveness','questionStats','answeredIds','correctIds','incorrectIds','reviewSchedule'])assert.deepStrictEqual(recovered.progress[field],interrupted.before.progress[field]);
            assert.deepStrictEqual(recovered.character,interrupted.before.character);
            await page.evaluate(()=>{const c=window.App.controller;c.model.state.mode='training';c.start('J002');c.view.applyRetryDraft(c.questions.J002,c.questions.J002.answer);c.submit();});
            assert.strictEqual(await page.evaluate(()=>window.App.controller.model.learningEffectivenessForQuestion('J002').observedAttempts),1);
            // Keep a real partial journal in the owner while a second tab loads.
            // The standby must not touch either key until the owner closes.
            const livePending=await page.evaluate(()=>{
              const c=window.App.controller;c.start('J003',{fresh:true});c.view.applyRetryDraft(c.questions.J003,c.questions.J003.answer);
              const before={progress:JSON.parse(localStorage.getItem(c.model.key)),character:JSON.parse(localStorage.getItem(c.rpg.key))};
              const set=Storage.prototype.setItem;let writes=0;
              Storage.prototype.setItem=function(key,value){if(++writes>=3)throw Error('interrupted owner');return set.call(this,key,value);};
              let result;try{result=c.submit();}finally{Storage.prototype.setItem=set;}
              const raw=Object.fromEntries([c.model.key,c.rpg.key,`${c.model.key}:pending-answer-v1`].map(key=>[key,localStorage.getItem(key)]));
              return {before,raw,rejected:result===false,pending:Boolean(raw[`${c.model.key}:pending-answer-v1`])};
            });
            assert(livePending.rejected&&livePending.pending);
            const standby=await context.newPage();standby.on('pageerror',error=>errors.push(error.stack||String(error)));
            await standby.goto(url,{waitUntil:'load'});
            await standby.waitForFunction(async()=>Boolean(window.App?.storageOwnership)&&
              (await navigator.locks.query()).pending.some(lock=>lock.name==='boki-rpg-saved-learning'));
            const waiting=await standby.evaluate(keys=>({uninitialized:!window.App.controller,notice:!document.getElementById('storage-warning').hidden,
              raw:Object.fromEntries(keys.map(key=>[key,localStorage.getItem(key)]))}),Object.keys(livePending.raw));
            assert(waiting.uninitialized&&waiting.notice);assert.deepStrictEqual(waiting.raw,livePending.raw);
            await page.close();page=standby;await page.waitForFunction(()=>Boolean(window.App?.controller));
            const takeover=await page.evaluate(()=>{const c=window.App.controller;return {progress:c.model.state,character:c.rpg.state,pending:localStorage.getItem(`${c.model.key}:pending-answer-v1`)};});
            assert.strictEqual(takeover.pending,null);assert.deepStrictEqual(takeover.character,livePending.before.character);
            for(const field of ['learningEffectiveness','questionStats','answeredIds','correctIds','incorrectIds','reviewSchedule'])assert.deepStrictEqual(takeover.progress[field],livePending.before.progress[field]);
            const retried=await page.evaluate(()=>{
              const c=window.App.controller;c.model.state.mode='training';c.start('J003',{fresh:true});c.view.applyRetryDraft(c.questions.J003,c.questions.J003.answer);c.submit();
              const once=JSON.stringify({progress:c.model.state,character:c.rpg.state});c.submit();
              return {observations:c.model.learningEffectivenessForQuestion('J003').observedAttempts,replayUnchanged:once===JSON.stringify({progress:c.model.state,character:c.rpg.state})};
            });
            assert.strictEqual(retried.observations,1);assert(retried.replayUnchanged);
            const numericalBoundaries=await page.evaluate(()=>{
              const c=window.App.controller,copy=value=>JSON.parse(JSON.stringify(value)),originalCharacter=copy(c.rpg.state);
              c.model.state.mode='training';c.start('J004',{fresh:true});c.view.applyRetryDraft(c.questions.J004,c.questions.J004.answer);
              c.rpg.state.xp=Number.MAX_SAFE_INTEGER;if(!window.RPGModel.validateBackupState(c.rpg.state))throw Error('max-safe fixture invalid');c.rpg.save();
              const before=JSON.stringify({progress:c.model.state,character:c.rpg.state}),raw=[localStorage.getItem(c.model.key),localStorage.getItem(c.rpg.key)];
              if(c.submit()!==false||JSON.stringify({progress:c.model.state,character:c.rpg.state})!==before||localStorage.getItem(c.model.key)!==raw[0]||localStorage.getItem(c.rpg.key)!==raw[1])throw Error('RPG overflow was not atomic');
              if(new window.RPGModel(c.rpg.storage,c.rpg.key).state.xp!==Number.MAX_SAFE_INTEGER)throw Error('RPG boundary lost on reload');
              c.rpg.state=originalCharacter;c.rpg.save();
              // Always cross a local day boundary. Per-day counters must be
              // compared with that same day's baseline, not the last answer day.
              const due=new Date(Date.now()).setHours(0,5,0,0),at=due-20*60*1000;
              c.model.state.mode='training';if(!c.model.recordAttempt('J004',false,10,'journal-entry',false,at))throw Error('clock fixture observation');
              c.model.record('J004',false,at);c.model.assignReview('J004','J004',due);c.model.state.mode='review';c.reviewMappings.set('J004',{sourceQuestionId:'J004'});
              const originalNow=Date.now;let clock=due;Date.now=()=>clock;
              try{
                c.start('J004',{fresh:true});c.view.applyRetryDraft(c.questions.J004,c.questions.J004.answer);
                const count=c.model.learningContinuity(due-1).today.reviewSuccessCount;
                const dueCount=c.model.learningContinuity(due).today.reviewSuccessCount;
                const previousDay=JSON.stringify(c.model.learningContinuity(at).today);clock=due-1;
                if(c.submit()===false||c.model.state.attempts.at(-1).delayedSuccess||c.model.state.learningContinuityState.today.reviewSuccessCount!==count||c.model.learningEffectivenessForQuestion('J004').delayedReview.successes!==0||c.model.state.reviewSchedule.J004.stage!==0)throw Error('unqualified clock review counted');
                if(c.rpg.state.rewardedIds.some(id=>id.startsWith('@event:review-success:J004:')))throw Error('unqualified review bonus');
                clock=due;c.start('J004',{fresh:true});c.view.applyRetryDraft(c.questions.J004,c.questions.J004.answer);
                if(c.submit()===false||c.model.state.learningContinuityState.today.reviewSuccessCount!==dueCount+1||c.model.learningEffectivenessForQuestion('J004').delayedReview.successes!==1||c.model.state.reviewSchedule.J004.stage!==1)throw Error('due review did not count exactly once');
                if(JSON.stringify(c.model.learningContinuity(at).today)!==previousDay)throw Error('prior-day counters changed after review');
              }finally{Date.now=originalNow;}
              return {rpgOverflowRollback:true,clockRollbackQualified:true};
            });
            assert.deepStrictEqual(numericalBoundaries,{rpgOverflowRollback:true,clockRollbackQualified:true});
            // Complete the preceding failure/restore notice through its normal UI
            // before beginning the separate active-exam scenario.
            if(await page.locator('#app-notice-dialog').evaluate(el=>el.open)){
              const cancel=page.locator('#app-notice-cancel');
              await (await cancel.isVisible()?cancel:page.locator('#app-notice-confirm')).click();
            }
            await page.evaluate(()=>{
              const c=window.App.controller;c.model.state.mode='exam';const session=c.ensureExamSession();
              if(session.ids.length!==15||session.ids.some(id=>!c.examCandidateIds().includes(id)))throw Error('authored exam pool fixture');
              c.start(session.ids[0],{fresh:true});
            });
            await page.locator('.confirm-button').click();
            const activeExam=await page.evaluate(async()=>{
              const c=window.App.controller,progress=JSON.parse(JSON.stringify(c.model.state)),character=JSON.parse(JSON.stringify(c.rpg.state)),first=progress.examSession.ids[0];
              if(progress.examSession.scores[first]?.correct!==false||!ProgressModel.validateBackupState(progress,c.questions))throw Error('blank exam observation missing');
              const member=JSON.parse(JSON.stringify(progress));member.examSession.ids[1]='J001';
              const grading=JSON.parse(JSON.stringify(progress)),score=grading.examSession.scores[first];score.earned=score.possible;score.ratio=1;
              const attempt=JSON.parse(JSON.stringify(progress));attempt.examAttempt++;
              const pair=[localStorage.getItem(c.model.key),localStorage.getItem(c.rpg.key)];
              for(const bad of [member,grading,attempt]){
                if(await c.importBackup({text:async()=>JSON.stringify({format:'boki-rpg-backup',version:1,progress:bad,character})})!==false)throw Error('corrupt active exam imported');
                if(localStorage.getItem(c.model.key)!==pair[0]||localStorage.getItem(c.rpg.key)!==pair[1])throw Error('bad active exam changed saved pair');
              }
              return {session:progress.examSession,attempt:progress.examAttempt,character,first};
            });
            await page.reload({waitUntil:'load'});await page.waitForFunction(()=>Boolean(window.App?.controller));
            const resumed=await page.evaluate(()=>({session:App.controller.model.state.examSession,character:App.controller.rpg.state}));
            assert.deepStrictEqual(resumed.session,activeExam.session);assert.deepStrictEqual(resumed.character,activeExam.character);
            const retriedExam=await page.evaluate(({attempt,first,xp})=>{
              const c=window.App.controller;c.updateExamStatus(c.model.state.examSession.endAt);
              if(c.model.state.examSession!==null||c.model.state.examAttempt!==attempt+1||c.model.state.examHistory.at(-1)?.points!==0||c.rpg.state.xp!==xp)throw Error('expired wrong/unanswered exam did not finalize once');
              if(c.model.learningEffectivenessForQuestion(first).observedAttempts!==1||!ProgressModel.validateBackupState(c.model.state,c.questions))throw Error('expiry changed observation or invalidated saved state');
              const session=c.retryExam();if(Object.keys(session.scores).length||session.ids.some(id=>!c.examCandidateIds().includes(id)))throw Error('retry did not create a fresh authored exam');
              if(!ProgressModel.validateBackupState(c.model.state,c.questions))throw Error('retry saved an invalid marker');
              return {session,attempt:c.model.state.examAttempt,history:c.model.state.examHistory};
            },{attempt:activeExam.attempt,first:activeExam.first,xp:activeExam.character.xp});
            await page.reload({waitUntil:'load'});await page.waitForFunction(()=>Boolean(window.App?.controller));
            assert.deepStrictEqual(await page.evaluate(()=>({session:App.controller.model.state.examSession,attempt:App.controller.model.state.examAttempt,history:App.controller.model.state.examHistory})),retriedExam);
            const corruptBefore=await page.evaluate(()=>{
              const c=window.App.controller,values=Object.fromEntries([c.model.key,c.rpg.key].map(key=>[key,localStorage.getItem(key)]));
              localStorage.setItem(`${c.model.key}:pending-answer-v1`,'{bad');return values;
            });
            await page.reload({waitUntil:'load'});await page.waitForFunction(()=>Boolean(window.App?.controller));
            await page.waitForFunction(()=>document.getElementById('storage-warning').hidden===false);
            const corruptAfter=await page.evaluate(keys=>({blocked:window.App.controller.model.storageWriteBlocked,
              values:Object.fromEntries(keys.map(key=>[key,localStorage.getItem(key)])),journal:localStorage.getItem(`${window.App.controller.model.key}:pending-answer-v1`)}),Object.keys(corruptBefore));
            assert.strictEqual(corruptAfter.blocked,true);assert.deepStrictEqual(corruptAfter.values,corruptBefore);assert.strictEqual(corruptAfter.journal,'{bad');
            assert.deepStrictEqual(errors,[]);
            evidence.reports.push({engine,width,observedAttempts:222,retained:200,delayedAttempts:220,delayedSuccesses:146,initialPreserved:true,assistedSeparated:true,reload:true,backup:true,saveFailure:failure,interruptedWriteRecovery:true,liveOwnerProtected:true,closedOwnerRecovery:true,retryExactlyOnce:retried,corruptJournalWarning:true,corruptBytesPreserved:true,missingEvidenceImportRejected:true,evictedUnknownAggregateImportRejected:true,missingCompletionImportRejected:true,evictedLatestStatsImportRejected:true,continuityImportRejected:true,pendingReviewImportRejected:true,examHistoryImportRejected:true,activeExamImportRejected:true,legacyExamPoolImportRejected:true,legacyExamMigration:true,initialPlacementPreserved:true,initialPlacementImportRejected:true,mistakeTotalsImportRejected:true,legacyMistakeBoundsImportRejected:true,legacyMistakeMigration:true,legacyResolvedMistakeImportRejected:true,legacyExamArithmeticImportRejected:true,partialDraftImportRejected:true,partialDraftReload:true,badBackupImports:27,mistakeBadgesAndFiltersPreserved:true,activeExamResume:true,expiredExamAndRetry:true,...numericalBoundaries,pageErrors:errors});write();
          }finally{await context.close();}
        }
      }finally{await browser.close();}
    }
    assert.strictEqual(evidence.reports.length,6);evidence.status='PASS';write();console.log('LEARNING_EFFECTIVENESS_BROWSER 6/6 PASS');
  }catch(error){evidence.status='FAIL';evidence.error=error.stack;write();throw error;}
  finally{await new Promise(resolve=>server.close(resolve));}
}
run().catch(error=>{console.error(error.stack);process.exitCode=1;});
