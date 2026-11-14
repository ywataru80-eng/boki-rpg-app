'use strict';
// Gen200: the entire 12-chapter, 166-question Story route is submitted in its
// actual prescribed order in one browser session per engine, including a
// controlled wrong-answer branch at the beginning of each chapter.
// Unlike the 36-anchor gate, this tests cumulative state and chapter continuity.
// It does NOT assert real human gameplay, physical iPhone, or public Pages HTTPS.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const cp=require('node:child_process');
const http=require('node:http');
const {chromium,webkit}=require('playwright');
const root=path.resolve(__dirname,'../..');
const out=path.join(root,'artifacts','issue256-story166');
const evidence={
 head:cp.execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),
 mode:'one-session-sequential-controller-forms-not-human-clickthrough',status:'RUNNING',
 routeCount:166,rows:[],errors:[]
};
const persist=()=>{fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'evidence.json'),JSON.stringify(evidence,null,2)+'\n');};
const mime={'.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png'};
const server=http.createServer((req,res)=>{
 const relative=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';
 const target=path.resolve(root,relative);
 if(!target.startsWith(root+path.sep)||!fs.existsSync(target)||fs.statSync(target).isDirectory()){
  res.writeHead(404);return res.end('not found');
 }
 res.setHeader('content-type',mime[path.extname(target)]||'application/octet-stream');
 res.end(fs.readFileSync(target));
});
async function test(){
 persist();
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 try{
  for(const [engine,launcher,width] of [['chromium',chromium,390],['webkit',webkit,320]]){
   const browser=await launcher.launch();
   try{
    const context=await browser.newContext({viewport:{width,height:900}});
    const page=await context.newPage(),javascriptErrors=[];
    page.on('pageerror',err=>javascriptErrors.push(String(err?.stack||err)));
    try{
     await page.goto('http://127.0.0.1:'+server.address().port+'/',{waitUntil:'load'});
     await page.waitForFunction(()=>Boolean(window.App?.controller&&window.GradingEngine&&typeof StoryChapterIds !== 'undefined'));
     const chapters=await page.evaluate(()=>Object.entries(StoryChapterIds).map(([name,ids])=>({name,ids})));
     assert.equal(chapters.length,12,'story must have 12 ordered chapters');
     assert.equal(chapters.flatMap(ch=>ch.ids).length,166,'route must have exactly 166 actual questions');
     assert.equal(new Set(chapters.flatMap(ch=>ch.ids)).size,166,'no repeated Story question IDs');
     for(const chapter of chapters){
      const record=await page.evaluate(({chapterName,chapterIds})=>{
       const ctl=window.App.controller;
       const events=[],error=message=>{throw Error('Chapter '+chapterName+': '+message)};
       for(const [offset,id] of chapterIds.entries()){
        const q=ctl.questions[id];if(!q)error('missing data '+id);
        ctl.model.state.mode='story';
        ctl.start(id,{fresh:true});
        if(document.getElementById('q-text')?.textContent!==q.question)error(id+' question not rendered');
        const result=document.getElementById('narrative-result');
        if(result&&!result.hidden)error(id+' showed earned Story before verified answer');
        if(offset===0){
         const wrong=structuredClone(q.answer);
         if(q.type==='journal')wrong.debit[0].amount=Number(wrong.debit[0].amount)+1;
         else{
          const entry=Object.entries(wrong.cells).find(([,v])=>typeof v==='number');
          if(entry)wrong.cells[entry[0]]=entry[1]+1;
          else{
           const key=q.table.inputCells[0];wrong.cells[key]=wrong.cells[key]==='借方'?'貸方':'借方';
          }
         }
         ctl.view.applyRetryDraft(q,wrong);
         if(window.GradingEngine.grade(q,ctl.view.readAnswer(q)).correct)error(id+' invalid answer accepted');
         ctl.submit();
         if(ctl.learningFlow?.phase!=='W'||(result&&!result.hidden))error(id+' wrong answer exposed success');
         ctl.start(id,{fresh:true});
        }
        ctl.view.applyRetryDraft(q,q.answer);
        if(!window.GradingEngine.grade(q,ctl.view.readAnswer(q)).correct)error(id+' correct form rejected');
        const attemptsBefore=ctl.model.state.attempts.length;
        ctl.submit();
        if(ctl.learningFlow?.phase!=='C'||!ctl.model.state.correctIds.includes(id))error(id+' completion not recorded');
        if(ctl.model.state.attempts.length!==attemptsBefore+1)error(id+' submitted attempt not recorded once');
        if(document.documentElement.scrollWidth>innerWidth+1)error(id+' horizontal overflow');
        const scene=window.AppController.prototype.narrativeScenesForQuestion.call(ctl,q);
        if(scene.length&&(!result||result.hidden))error(id+' verified Story scene not shown');
        events.push({id,position:offset+1,chapter:q.chapter,sceneCount:scene.length});
       }
       return {chapter:chapterName,events,cumulativeCorrect:ctl.model.state.correctIds.length,
         totalAttempts:ctl.model.state.attempts.length};
      },{chapterName:chapter.name,chapterIds:chapter.ids});
      if(javascriptErrors.length)throw Error('JS exception '+javascriptErrors.join('\n'));
      assert.equal(record.events.length,chapter.ids.length,'all chapter forms must be successfully submitted');
      evidence.rows.push({engine,width,...record});persist();
     }
     const final=await page.evaluate(()=>({correctIds:window.App.controller.model.state.correctIds.length,
      attempts:window.App.controller.model.state.attempts.length,activeMode:window.App.controller.model.state.mode}));
     assert.equal(final.correctIds,166,'entire Story learning evidence remains in the same session');
     assert.equal(evidence.rows.filter(x=>x.engine===engine).flatMap(x=>x.events).length,166);
     evidence.rows.push({engine,width,final});persist();
    }catch(error){
     evidence.errors.push({engine,error:String(error?.stack||error)});persist();
     try{await page.screenshot({path:path.join(out,engine+'-failure.png'),fullPage:true,timeout:5000});}catch(_){/* best effort */}
     throw error;
    }finally{await context.close();}
   }finally{await browser.close();}
  }
  assert.equal(evidence.errors.length,0);
  evidence.status='PASS';persist();
  console.log('ISSUE256_STORY166_CHAPTER_SEQUENCE_CHROMIUM_WEBKIT_PASS');
 }catch(error){evidence.status='FAIL';evidence.errors.push({error:String(error?.stack||error)});persist();throw error;}
 finally{await new Promise(ok=>server.close(ok));}
}
test().catch(err=>{console.error(err?.stack||err);process.exitCode=1;});
