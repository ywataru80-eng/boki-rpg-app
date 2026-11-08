'use strict';
// Issue256: D001-D020 actual browser path: displayed unanswered input,
// committed wrong attempt, committed correct attempt, rendered explanations.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),cp=require('node:child_process');
const {chromium,webkit}=require('playwright');
const ROOT=path.resolve(__dirname,'../..'),OUT=path.join(ROOT,'artifacts/issue256-closing-ui');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const server=http.createServer((req,res)=>{
 const file=path.resolve(ROOT,new URL(req.url,'http://localhost').pathname.slice(1)||'index.html');
 if(!file.startsWith(ROOT+path.sep)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);return res.end('missing');}
 res.setHeader('content-type',mime[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));
});
const evidence={head:cp.execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim(),status:'RUNNING',results:[],failures:[]};
const save=()=>{fs.mkdirSync(OUT,{recursive:true});fs.writeFileSync(path.join(OUT,'evidence.json'),JSON.stringify(evidence,null,2)+'\n');};
async function main(){
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));const origin='http://127.0.0.1:'+server.address().port+'/';save();
 try{
  for(const [engine,launcher] of Object.entries({chromium,webkit})){
   const browser=await launcher.launch();
   try{
    for(const width of [320,390])for(let n=1;n<=20;n++){
     const id='D'+String(n).padStart(3,'0');
     const context=await browser.newContext({viewport:{width,height:900}});
     const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e.stack||e)));
     try{
      await page.goto(origin,{waitUntil:'load'});
      await page.waitForFunction(()=>Boolean(window.App?.controller));
      const blank=await page.evaluate(id=>{
       const c=App.controller,q=c.questions[id];if(q?.type!=='worksheet')throw Error(id+': unknown question/type');
       c.model.state.mode='training';const count=c.model.state.attempts.length;
       c.start(id,{fresh:true});
       const inputs=[...document.querySelectorAll('#question-form .table-input')];
       const values=c.view.readAnswer(q).cells;
       return {count:inputs.length,expected:q.table.inputCells.length,unique:new Set(inputs.map(x=>x.dataset.cellId)).size,
        blank:Object.values(values).every(x=>String(x).trim()===''),unanswered:c.model.state.attempts.length===count,
        text:(document.getElementById('q-text')?.textContent||'').slice(0,120),correct:c.model.state.correctIds.includes(id)};
      },id);
      assert(blank.unanswered&&blank.blank&&!blank.correct&&blank.text.length>12,id+': unsubmitted answer changed result');
      assert.equal(blank.count,blank.expected,id+': missing input');assert.equal(blank.unique,blank.expected,id+': input IDs');
      const wrong=await page.evaluate(id=>{
       const c=App.controller,before=c.model.state.attempts.length;c.submit();
       return {phase:c.learningFlow?.phase,attempts:c.model.state.attempts.length-before,correct:c.model.state.correctIds.includes(id),
        text:document.getElementById('explanation')?.textContent?.slice(0,240)||'',
        flow:!!document.querySelector('#explanation .explanation-flow'),
        comparison:!document.getElementById('answer-comparison')?.hidden};
      },id);
      assert(wrong.phase==='W'&&wrong.attempts===1&&!wrong.correct&&wrong.flow&&wrong.text.length>40,id+': wrong/blank result failure');
      const correct=await page.evaluate(id=>{
       const c=App.controller,q=c.questions[id];c.start(id,{fresh:true});c.view.applyRetryDraft(q,q.answer);
       if(!GradingEngine.grade(q,c.view.readAnswer(q)).correct)throw Error(id+': valid form values rejected by grader');
       const before=c.model.state.attempts.length;c.submit();
       return {phase:c.learningFlow?.phase,attempts:c.model.state.attempts.length-before,correct:c.model.state.correctIds.includes(id),
        text:document.getElementById('explanation')?.textContent?.slice(0,240)||'',
        flow:!!document.querySelector('#explanation .explanation-flow')};
      },id);
      assert(correct.phase==='C'&&correct.attempts===1&&correct.correct&&correct.flow&&correct.text.length>40,id+': correct/result failure');
      assert.equal(errors.length,0,id+': script errors '+errors.join(';'));
      if(engine==='chromium'&&width===390){
       const dialog=page.locator('#app-notice-dialog');
       if(await dialog.count()&&await dialog.evaluate(el=>el.open))await dialog.evaluate(el=>el.close());
       await page.screenshot({path:path.join(OUT,id+'-correct.png'),fullPage:true});
      }
      evidence.results.push({engine,width,id,blank,wrong,correct});save();
     }catch(e){
      evidence.failures.push({engine,width,id,error:String(e.stack||e)});save();
      try{await page.screenshot({path:path.join(OUT,engine+'-'+width+'-'+id+'-error.png'),fullPage:true,timeout:5000});}catch(_){}
      // Fail at the first violated contract; repeating the same failure for all
      // 80 browser cases would obscure the root cause and exhaust the CI job.
      throw e;
     }finally{await context.close();}
    }
   }finally{await browser.close();}
  }
  assert.equal(evidence.results.length,80,'20 questions across 2 browsers and 2 widths');
  assert.deepEqual(evidence.failures,[],'D001-D020 browser failures');
  evidence.status='PASS';save();console.log('ISSUE256_20x2x2_BLANK_WRONG_CORRECT_UI_PASS');
 }catch(e){evidence.status='FAIL';evidence.error=String(e.stack||e);save();throw e;}
 finally{await new Promise(ok=>server.close(ok));}
}
main().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
