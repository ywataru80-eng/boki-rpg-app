'use strict';
// Independent UI-driven 166-question acceptance; never calls AppController.start/next/submit.
// Runs exclusively on a temporary audit branch against the exact sealed PR #260 tree.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium,webkit}=require('playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'artifacts','release237-166-ui');
fs.mkdirSync(out,{recursive:true});
const evidence={release:'20261115-237',targetHead:'87be66ecd84cf0c3976919ac95f1d8407aef8dc5',status:'RUNNING',results:[],errors:[]};
const persist=()=>fs.writeFileSync(path.join(out,'evidence.json'),JSON.stringify(evidence,null,2)+'\n');
const mime={'.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{
 const rel=decodeURIComponent(new URL(req.url,'http://localhost/').pathname.slice(1))||'index.html';
 const file=path.resolve(root,rel);
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end('not found');return;}
 res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));
});
async function waitStarted(page){
 await page.goto('http://127.0.0.1:'+server.address().port+'/',{waitUntil:'load'});
 await page.waitForFunction(()=>Boolean(window.App?.controller && window.GradingEngine));
 await page.locator('#view-placement.active [data-action="placement-skip"]').click();
 await page.locator('#view-story.active #resume-button').click();
 await page.locator('#view-question.active').waitFor({state:'visible'});
}
async function readState(page){return page.evaluate(()=>{
 const c=window.App.controller;return {
 id:c.currentId,mode:c.model.state.mode,phase:c.learningFlow?.phase,
 answered:c.model.state.answeredIds.length,correct:c.model.state.correctIds.length,
 attempts:c.model.state.attempts.length,active:[...document.querySelectorAll('.view.active')].map(v=>v.id),
 width:innerWidth,scrollWidth:document.documentElement.scrollWidth
 };
});}
async function setInput(loc,value,label){
 assert.equal(await loc.count(),1,label+': expected one input');
 const type=await loc.evaluate(el=>el.tagName);
 if(type==='SELECT'){
  const opts=await loc.locator('option').evaluateAll(es=>es.map(e=>e.value));
  assert(opts.includes(String(value)),label+': option missing '+String(value));
  await loc.selectOption(String(value));
 }else{
  assert(!(await loc.getAttribute('readonly')),label+': readonly field should be editable in desktop-pointer profile');
  await loc.fill(String(value));await loc.dispatchEvent('change');await loc.blur();
 }
}
async function fill(page,q){
 if(q.type==='journal'){
  for(const side of ['debit','credit'])for(let i=0;i<q.answer[side].length;i++){
   let row=q.answer[side][i];
   await setInput(page.locator('#view-question .'+side+'-account').nth(i),row.account,q.id+':'+side+i+' account');
   await setInput(page.locator('#view-question .'+side+'-amount').nth(i),row.amount,q.id+':'+side+i+' amount');
  }
 }else{
  for(const [cell,value] of Object.entries(q.answer.cells))
   await setInput(page.locator('#view-question .table-input[data-cell-id="'+cell+'"]'),value,q.id+':'+cell);
 }
}
async function successPath(browser,engine,width){
 const ctx=await browser.newContext({viewport:{width,height:900},hasTouch:false,isMobile:false});
 const page=await ctx.newPage(),errors=[];page.setDefaultTimeout(12000);
 page.on('pageerror',e=>errors.push(String(e.stack||e)));
 try{
  await waitStarted(page);
  const order=await page.evaluate(()=>window.App.controller.storyIds());
  assert.equal(order.length,166);assert.equal(new Set(order).size,166);
  for(let index=0;index<order.length;index++){
   const id=order[index],start=await readState(page);
   assert.equal(start.mode,'story');assert.equal(start.id,id,'Question '+(index+1)+' after button Next');
   assert(start.active.includes('view-question'),id+': question view missing');
   const q=await page.evaluate(id=>JSON.parse(JSON.stringify(window.App.controller.questions[id])),id);
   assert.equal(await page.locator('#q-text').textContent(),q.question,id+': question text');
   await fill(page,q);
   await page.locator('#view-question.active #question-form .confirm-button').click();
   await page.locator('#view-result.active').waitFor({state:'visible'});
   const answered=await readState(page);
   assert.equal(answered.phase,'C',id+': wrong grade');
   assert.equal(answered.correct,index+1,id+': verified correct count');
   assert(answered.scrollWidth<=answered.width+1,id+': horizontal overflow');
   assert.equal(errors.length,0,'browser exceptions '+errors.join(' | '));
   await page.locator('#view-result.active #standard-result-actions [data-action="next"]').click();
   if(index===29){
    await page.reload({waitUntil:'load'});
    await page.waitForFunction(()=>Boolean(window.App?.controller));
    const notice=page.locator('#app-notice-dialog');
    if(await notice.evaluate(el=>el.open))await page.locator('#app-notice-confirm').click();
    else await page.locator('#view-story.active #resume-button').click();
    await page.locator('#view-question.active').waitFor({state:'visible'});
   }
   if(index<order.length-1){
    const next=await readState(page);
    assert.equal(next.id,order[index+1],id+': button Next should lead to '+order[index+1]);
   }else await page.locator('#view-story.active').waitFor({state:'visible'});
   if(index%10===9 || index===order.length-1){
    evidence.results.push({engine,width,passed:index+1,lastId:id,next:index<order.length-1?order[index+1]:null});persist();
   }
  }
  evidence.results.push({engine,width,result:'PASS',questions:order.length,resumeAfterQuestion:30});persist();
 }catch(e){
  evidence.errors.push({engine,width,error:String(e.stack||e),state:await readState(page).catch(()=>null)});persist();
  await page.screenshot({path:path.join(out,engine+'-'+width+'-failure.png'),fullPage:true}).catch(()=>{});
  throw e;
 }finally{await ctx.close();}
}
async function wrongRecovery(browser,engine,width){
 const ctx=await browser.newContext({viewport:{width,height:900},hasTouch:false,isMobile:false});
 const page=await ctx.newPage();page.setDefaultTimeout(12000);
 try{
  await waitStarted(page);
  const q=await page.evaluate(()=>JSON.parse(JSON.stringify(window.App.controller.questions[window.App.controller.currentId])));
  const wrong=JSON.parse(JSON.stringify(q));if(wrong.type==='journal')wrong.answer.debit[0].amount+=1;
  else {
   const key=Object.keys(wrong.answer.cells).find(k=>typeof wrong.answer.cells[k]==='number');
   assert(key,'wrong case needs numeric answer');wrong.answer.cells[key]++;
  }
  await fill(page,wrong);
  await page.locator('#view-question.active #question-form .confirm-button').click();
  await page.locator('#view-result.active').waitFor({state:'visible'});
  let state=await readState(page);
  assert.equal(state.phase,'W','first incorrect attempt');
  assert(await page.locator('#narrative-result').isHidden(),'wrong may not display verified story');
  await page.locator('#view-result.active [data-action="coaching-retry-result"]').click();
  await page.locator('#view-question.active').waitFor({state:'visible'});
  await fill(page,q);
  await page.locator('#view-question.active #question-form .confirm-button').click();
  await page.locator('#view-result.active').waitFor({state:'visible'});
  state=await readState(page);
  assert.equal(state.phase,'D','assisted recovery must be marked');
  assert.equal(state.correct,0,'assisted recovery may not count as independent correct');
  assert(await page.locator('#narrative-result').isHidden(),'assisted recovery must not show verified scene');
  evidence.results.push({engine,width,wrongRecovery:'PASS',question:q.id});persist();
 }catch(e){evidence.errors.push({engine,width,wrongRecovery:String(e.stack||e)});persist();throw e;}
 finally{await ctx.close();}
}
async function main(){
 persist();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  for(const [engine,launcher,width] of [['chromium',chromium,390],['webkit',webkit,320]]){
   const browser=await launcher.launch();
   try{await successPath(browser,engine,width);await wrongRecovery(browser,engine,width);}
   finally{await browser.close();}
  }
  assert.equal(evidence.errors.length,0);
  evidence.status='PASS';persist();
  console.log('RELEASE237_166_STORY_UI_BUTTONS_CHROMIUM_WEBKIT_PASS');
 }catch(e){evidence.status='FAIL';persist();console.error(e);process.exitCode=1;}
 finally{await new Promise(resolve=>server.close(resolve));}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
