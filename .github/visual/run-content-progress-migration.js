'use strict';
const assert=require('assert'),fs=require('fs'),http=require('http'),path=require('path'),cp=require('child_process');
const {chromium,webkit}=require('playwright');
const {fixture,questions,NOW}=require('../../tests/helpers/issue207-fixtures');
const ROOT=path.resolve(__dirname,'../..'),OUTPUT=path.join(ROOT,'artifacts/content-progress-migration');
const evidence={status:'RUNNING',head:cp.execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),reports:[]};
const write=()=>{fs.mkdirSync(OUTPUT,{recursive:true});fs.writeFileSync(path.join(OUTPUT,'evidence.json'),JSON.stringify(evidence,null,2)+'\n');};
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png'};
const server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  const file=path.resolve(ROOT,pathname==='/'?'index.html':pathname.slice(1));
  if(!file.startsWith(ROOT+path.sep)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);return res.end();}
  res.setHeader('content-type',mime[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));
});
async function run(){
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url='http://127.0.0.1:'+server.address().port+'/';write();
  try{
    for(const [engine,launcher] of Object.entries({chromium,webkit})){
      const browser=await launcher.launch();
      try{
        for(const width of [320,390,768])for(const id of ['J051','L031'])for(const kind of ['old','new','mixed']){
          const context=await browser.newContext({viewport:{width,height:900}});
          const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.stack || String(error)));
          try{
            const progress=fixture(kind,id);
            progress.placement={completed:true,foundation:0,closing:0,startQuestionId:'J001',completedAt:1};
            progress.mode='desk';
            const character={xp:2000,rewardedIds:[],mastery:{},companyHP:100,totalTransactionAmount:0,confidenceOutcomes:{sureCorrect:0,sureWrong:0,unsureCorrect:0,unsureWrong:0}};
            await page.addInitScript(({progress,character})=>{
              // Seed once only, so the second navigation proves real persistence.
              if(localStorage.getItem('migration-seeded'))return;
              localStorage.setItem('boki-rpg-progress-v2',JSON.stringify(progress));
              localStorage.setItem('boki-rpg-character-v1',JSON.stringify(character));
              localStorage.setItem('migration-seeded','1');
            },{progress,character});
            await page.goto(url,{waitUntil:'load'});
            await page.waitForFunction(()=>Boolean(window.App?.controller));
            const inspect=()=>page.evaluate(id=>{
              const c=window.App.controller,s=c.model.state;
              return {revision:s.contentRevision,stats:c.model.statsForQuestion(id),draft:s.drafts[id]||null,
                archive:s.contentMigrationArchive,continuity:s.learningContinuityState,recheck:s.contentRecheckIds,
                valid:window.ProgressModel.validateBackupState(s,window.QuestionData),stored:JSON.parse(localStorage.getItem(c.model.key)),
                character:JSON.parse(localStorage.getItem(c.rpg.key))};
            },id);
            // Historical revision-5 saves upgrade to revision 6 in Release236;
            // old Release235 keeps revision 5. Never accept an arbitrary value.
            const release=JSON.parse(fs.readFileSync(path.join(ROOT,'pwa-release-manifest.json'),'utf8')).release;
            const expectedRevision=release==='20261107-236'?6:5;
            assert(['20261105-235','20261107-236'].includes(release),'unrecognized release in migration gate');
            const first=await inspect();assert.strictEqual(first.revision,expectedRevision);assert(first.valid);
            assert.deepStrictEqual(first.continuity,progress.learningContinuityState);
            assert.strictEqual(first.character.xp,character.xp);assert.deepStrictEqual(first.character.rewardedIds,character.rewardedIds);
            assert.deepStrictEqual([first.stats.correctCount,first.stats.incorrectCount],kind==='old'?[0,0]:kind==='mixed'?[1,1]:[3,0]);
            assert.deepStrictEqual(first.archive.questions[id].questionStats,progress.questionStats[id]);
            if(kind==='old'||id==='J051')assert.strictEqual(first.draft,null);
            const archiveImportRejected=await page.evaluate(async id=>{
              const c=window.App.controller,original=JSON.parse(JSON.stringify(c.model.state)),character=c.rpg.state;
              const pair=[localStorage.getItem(c.model.key),localStorage.getItem(c.rpg.key)];
              const erased=JSON.parse(JSON.stringify(original));erased.contentMigrationArchive={schemaVersion:1,questions:{},reviewAssignments:{},completed:null};erased.contentRecheckIds=[];
              const recheck=JSON.parse(JSON.stringify(original));recheck.contentRecheckIds=recheck.contentRecheckIds.includes(id)?recheck.contentRecheckIds.filter(x=>x!==id):[...recheck.contentRecheckIds,id];
              for(const progress of [erased,recheck]){
                if(await c.importBackup({text:async()=>JSON.stringify({format:'boki-rpg-backup',version:1,progress,character})})!==false)throw Error('changed migration authority imported');
                if(localStorage.getItem(c.model.key)!==pair[0]||localStorage.getItem(c.rpg.key)!==pair[1])throw Error('bad migration backup changed saved pair');
              }
              return true;
            },id);assert(archiveImportRejected);
            await page.reload({waitUntil:'load'});
            await page.waitForFunction(()=>Boolean(window.App?.controller));
            const second=await inspect();assert.deepStrictEqual(second.stats,first.stats);assert.deepStrictEqual(second.archive,first.archive);
            const review=await page.evaluate(()=>{
              const c=window.App.controller;
              c.model.state.reviewSchedule={J001:{stage:0,dueAt:1}};
              c.model.state.reviewAssignments={J001:{sourceQuestionId:'J001',reviewQuestionId:'J051',conceptId:window.QuestionData.J001.category,stage:0,dueAt:1,assignedAt:0,status:'assigned'}};
              const ids=c.reviewIds();return {ids,actual:c.model.state.reviewAssignments.J001.reviewQuestionId,mapping:c.reviewMappings.get(ids[0]).reviewQuestionId};
            });
            assert.strictEqual(review.ids.length,1);assert.notStrictEqual(review.actual,'J051');assert.strictEqual(review.actual,review.ids[0]);assert.strictEqual(review.mapping,review.actual);
            const settingsNotice=await page.evaluate(()=>{
              const c=window.App.controller, xp=c.rpg.state.xp;c.rpg.state.xp=0;c.openSettings();
              const notice=document.getElementById('content-migration-status');
              const visible=!notice.hidden&&notice.textContent.includes('JSONバックアップに保管');
              c.closeSettings();c.rpg.state.xp=xp;return visible;
            });assert(settingsNotice,'notice must be available without the level10 analysis unlock');
            await page.click('[data-mode="desk"]');await page.click('[data-action="open-log-analysis"]');
            const display=await page.evaluate(()=>{
              const panel=document.getElementById('log-analysis'),note=panel.querySelector('.content-migration-note');
              return {text:note?.textContent,hidden:panel.hidden,pageOverflow:document.documentElement.scrollWidth>window.innerWidth+1,panelOverflow:panel.scrollWidth>panel.clientWidth+1};
            });
            assert(display.text.includes('バックアップ内に保管'));assert(!display.hidden);assert(!display.pageOverflow);assert(!display.panelOverflow);assert.deepStrictEqual(errors,[]);
            const name=`${engine}-${width}-${id}-${kind}`;
            if(kind==='old')await page.screenshot({path:path.join(OUTPUT,name+'.png'),fullPage:true});
            evidence.reports.push({name,stats:[first.stats.correctCount,first.stats.incorrectCount],reloadStable:true,archivePreserved:true,archiveImportRejected,recheckImportRejected:true,reviewTarget:review.actual,display,pageErrors:errors});write();
          }finally{await context.close();}
        }
      }finally{await browser.close();}
    }
    assert.strictEqual(evidence.reports.length,36);evidence.status='PASS';write();console.log('CONTENT_PROGRESS_BROWSER 36/36 PASS');
  }catch(error){evidence.status='FAIL';evidence.error=error.stack;write();throw error;}
  finally{await new Promise(resolve=>server.close(resolve));}
}
run().catch(error=>{console.error(error.stack);process.exitCode=1;});
