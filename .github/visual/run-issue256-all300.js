'use strict';
// Release236 Gen198: actual unanswered/wrong/correct form submissions on 300 IDs
// in Chromium 390px and WebKit 320px. Runner-local, not a real iPhone/Pages gate.
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path'),cp=require('node:child_process');
const {chromium,webkit}=require('playwright');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'artifacts','issue256-all300');
const mime={'.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png'};
const proof={head:cp.execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),status:'RUNNING',transport:'RUNNER_LOCAL_HTTP_NOT_PUBLIC',rows:[],failures:[]};
const save=()=>{fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'evidence.json'),JSON.stringify(proof,null,2)+'\n');};
const server=http.createServer((req,res)=>{
 const relative=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';
 const file=path.resolve(root,relative);
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);return res.end('not found');}
 res.setHeader('content-type',mime[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));
});
async function main(){
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));save();
 const url='http://127.0.0.1:'+server.address().port+'/';
 try{
  for(const [name,launcher,width] of [['chromium',chromium,390],['webkit',webkit,320]]){
   const browser=await launcher.launch();
   try{
    let expectedIds=null;
    for(let offset=0;offset<300;offset+=15){
     const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),errors=[];
     page.on('pageerror',e=>errors.push(String(e?.stack||e)));
     let currentId='BOOTSTRAP';
     try{
      await page.goto(url,{waitUntil:'load'});
      await page.waitForFunction(()=>Boolean(window.App?.controller&&window.QuestionData&&window.GradingEngine));
      const ids=await page.evaluate(()=>Object.keys(window.QuestionData));
      assert.equal(ids.length,300,'all 300 effective runtime IDs must exist');
      if(expectedIds===null)expectedIds=ids;
      else assert.deepEqual(ids,expectedIds,'browser sessions must agree on the same 300 IDs');
      for(const id of ids.slice(offset,offset+15)){
       currentId=id;
       const result=await page.evaluate(id=>{
        const c=App.controller,q=c.questions[id];if(!q?.answer)throw Error(id+': missing question/answer');
        c.model.state.mode='training';
        const before=c.model.state.attempts.length;
        c.start(id,{fresh:true});
        if(document.getElementById('q-text')?.textContent!==q.question||c.model.state.attempts.length!==before)
         throw Error(id+': unanswered display failed or start wrote attempt');
        const empty=c.view.readAnswer(q);
        // Journal readAnswer intentionally omits untouched rows, while
        // table readAnswer retains blank cells keyed by input ID.
        const values=q.type==='journal'?[...empty.debit,...empty.credit].flatMap(x=>[x.account,x.amount]):Object.values(empty.cells||{});
        const isBlank=q.type==='journal'
          ?empty.debit.length===0&&empty.credit.length===0
          :values.length>0&&values.every(x=>String(x??'').trim()==='');
        if(!isBlank)throw Error(id+': unanswered inputs are not blank');
        const fields=[...document.querySelectorAll('#question-form '+(q.type==='journal'?'.debit-account, .credit-account, .debit-amount, .credit-amount':'.table-input'))];
        const minimum=q.type==='journal'?Math.max(q.answer.debit.length,q.answer.credit.length)*4:q.table.inputCells.length;
        if(fields.length<minimum)throw Error(id+': some answer form fields are missing');
        const wrong=structuredClone(q.answer);
        if(q.type==='journal')wrong.debit[0].amount=Number(wrong.debit[0].amount)+1;
        else {
         const item=Object.entries(wrong.cells).find(([,value])=>typeof value==='number');
         if(item)wrong.cells[item[0]]=item[1]+1;
         else {const key=q.table.inputCells[0];wrong.cells[key]=wrong.cells[key]==='借方'?'貸方':'借方';}
        }
        c.view.applyRetryDraft(q,wrong);
        if(GradingEngine.grade(q,c.view.readAnswer(q)).correct)throw Error(id+': invalid answer graded as correct');
        c.submit();
        const wasWrong=c.learningFlow?.phase==='W'&&c.model.state.attempts.length===before+1&&!c.model.state.correctIds.includes(id)&&!!document.querySelector('#explanation .explanation-flow');
        if(!wasWrong)throw Error(id+': wrong submission/result failed');
        c.start(id,{fresh:true});c.view.applyRetryDraft(q,q.answer);
        if(!GradingEngine.grade(q,c.view.readAnswer(q)).correct)throw Error(id+': authored answer rejected by form');
        const beforeCorrect=c.model.state.attempts.length;
        c.submit();
        const wasCorrect=c.learningFlow?.phase==='C'&&c.model.state.attempts.length===beforeCorrect+1&&c.model.state.correctIds.includes(id)&&!!document.querySelector('#explanation .explanation-flow');
        if(!wasCorrect)throw Error(id+': correct submission/result failed');
        if(document.documentElement.scrollWidth>innerWidth+1)throw Error(id+': page horizontal overflow '+document.documentElement.scrollWidth+'/'+innerWidth);
        return {id,type:q.type,fields:fields.length,blank:true,wrong:true,correct:true};
       },id);
       proof.rows.push({browser:name,width,...result});
       if(errors.length)throw Error(id+': browser script exception '+errors.join(';'));
      }
      save();
     }catch(e){
      proof.failures.push({browser:name,width,id:currentId,error:String(e.stack||e)});save();
      try{await page.screenshot({path:path.join(out,name+'-'+currentId+'-failure.png'),fullPage:true,timeout:5000});}catch(_){}
      throw e;
     }finally{await context.close();}
    }
   }finally{await browser.close();}
  }
  assert.equal(proof.rows.length,600,'two engines x 300 fully submitted cases');
  assert.deepEqual(proof.failures,[]);
  proof.status='PASS';save();console.log('ISSUE256_ALL300_BROWSER_BLANK_WRONG_CORRECT_PASS');
 }catch(e){proof.status='FAIL';proof.lastError=String(e.stack||e);save();throw e;}
 finally{await new Promise(resolve=>server.close(resolve));}
}
main().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
