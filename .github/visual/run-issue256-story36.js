'use strict';
// Gen198: 36 accepted Story anchors through actual form grading/rendering.
// Two real browser engines; isolated local HTTP, never a physical iPhone or Pages claim.
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path'),cp=require('node:child_process');
const {chromium,webkit}=require('playwright');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'artifacts','issue256-story36');
const mime={'.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png'};
const evidence={head:cp.execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),status:'RUNNING',mode:'real-browser-form-not-full-campaign',events:[],failures:[]};
const save=()=>{fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'evidence.json'),JSON.stringify(evidence,null,2)+'\n');};
const server=http.createServer((req,res)=>{const relative=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html',file=path.resolve(root,relative);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);return res.end('missing');}res.setHeader('content-type',mime[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));});
async function main(){
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));save();
 try{
  const url='http://127.0.0.1:'+server.address().port+'/';
  for(const [browserName,launcher,width] of [['chromium',chromium,390],['webkit',webkit,320]]){
   const browser=await launcher.launch();
   try{
    for(let offset=0;offset<36;offset+=8){
     const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),pageErrors=[];
     page.on('pageerror',err=>pageErrors.push(String(err?.stack||err)));
     let current='BOOTSTRAP';
     try{
      await page.goto(url,{waitUntil:'load'});
      await page.waitForFunction(()=>Boolean(window.App?.controller&&window.GradingEngine&&window.AnchorScenes));
      const length=await page.evaluate(()=>window.AnchorScenes.length);
      assert.equal(length,36,'accepted AnchorScenes must remain 36');
      for(let i=offset;i<Math.min(offset+8,36);i++){
       current='anchor-'+(i+1);
       const row=await page.evaluate(index=>{
        const controller=App.controller,scene=window.AnchorScenes[index],q=controller.questions[scene.referenceQuestionId];
        if(!q?.answer)throw Error(scene.sceneId+': source question missing');
        controller.model.state.mode='story';
        const matched=window.AppController.prototype.narrativeScenesForQuestion.call(controller,q);
        if(!matched.some(s=>s.sceneId===scene.sceneId))throw Error(scene.sceneId+': runtime scene lookup mismatch');
        const expected=[...matched].sort((a,b)=>({OPEN:0,REVERSAL:1,BOSS:2}[a.beat]-{OPEN:0,REVERSAL:1,BOSS:2}[b.beat])).at(-1);
        controller.start(q.id,{fresh:true});
        const region=document.getElementById('narrative-result');
        const questionText=document.getElementById('q-text')?.textContent||'';
        if(questionText!==q.question||!region?.hidden)throw Error(scene.sceneId+': before/blank state failure');
        const wrong=structuredClone(q.answer);
        if(q.type==='journal')wrong.debit[0].amount=Number(wrong.debit[0].amount)+1;
        else {const first=Object.entries(wrong.cells).find(([,v])=>typeof v==='number');if(first)wrong.cells[first[0]]=first[1]+1;else {const key=q.table.inputCells[0];wrong.cells[key]=wrong.cells[key]==='借方'?'貸方':'借方';}}
        controller.view.applyRetryDraft(q,wrong);
        if(GradingEngine.grade(q,controller.view.readAnswer(q)).correct)throw Error(scene.sceneId+': intentionally wrong answer passed');
        controller.submit();
        const wrongHidden=controller.learningFlow?.phase==='W'&&region.hidden&&!region.textContent.includes(expected.after);
        if(!wrongHidden)throw Error(scene.sceneId+': wrong answer exposed unearned Story success');
        controller.start(q.id,{fresh:true});controller.view.applyRetryDraft(q,q.answer);
        if(!GradingEngine.grade(q,controller.view.readAnswer(q)).correct)throw Error(scene.sceneId+': actual correct form rejected');
        controller.submit();
        const success=controller.learningFlow?.phase==='C'&&!region.hidden&&region.dataset.sceneId===expected.sceneId&&
          region.textContent.includes(expected.after)&&region.textContent.includes(expected.hook);
        if(!success)throw Error(scene.sceneId+': actual correct attempt failed to resolve '+expected.sceneId);
        if(document.documentElement.scrollWidth>innerWidth+1)throw Error(scene.sceneId+': page overflow');
        return{sourceScene:scene.sceneId,renderedScene:region.dataset.sceneId,id:q.id,wrongHidden:true,correctVisible:true};
       },i);
       evidence.events.push({browser:browserName,width,...row});save();
       if(pageErrors.length)throw Error(current+': JS error '+pageErrors.join(';'));
      }
     }catch(e){evidence.failures.push({browser:browserName,id:current,error:String(e.stack||e)});save();try{await page.screenshot({path:path.join(out,browserName+'-'+current+'-failure.png'),fullPage:true,timeout:5000});}catch(_){}throw e;}
     finally{await context.close();}
    }
   }finally{await browser.close();}
  }
  assert.equal(evidence.events.length,72,'36 Story beats across 2 engines');
  assert.deepEqual(evidence.failures,[]);
  evidence.status='PASS';save();console.log('ISSUE256_STORY36_ACTUAL_WRONG_CORRECT_BROWSER_PASS');
 }catch(e){evidence.status='FAIL';evidence.lastError=String(e.stack||e);save();throw e;}
 finally{await new Promise(ok=>server.close(ok));}
}
main().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
