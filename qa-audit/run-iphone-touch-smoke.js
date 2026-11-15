'use strict';
// Touch + calculator smoke against exact immutable PR260 source; never edits model or invokes controller methods.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {webkit,devices}=require('playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'artifacts','release237-iphone-touch-emulation');
fs.mkdirSync(out,{recursive:true});
const report={targetHead:'87be66ecd84cf0c3976919ac95f1d8407aef8dc5',device:'Playwright WebKit iPhone 13 emulation; NOT physical iPhone',status:'RUNNING',rows:[],errors:[]};
const save=()=>fs.writeFileSync(path.join(out,'evidence.json'),JSON.stringify(report,null,2)+'\n');
const server=http.createServer((req,res)=>{
const rel=decodeURIComponent(new URL(req.url,'http://127.0.0.1/').pathname.slice(1))||'index.html',file=path.resolve(root,rel);
if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
res.setHeader('Content-Type',{'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json'}[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));
});
const tap=async loc=>{assert.equal(await loc.count(),1);await loc.tap();};
async function fillJournal(page,q){
 for(const side of ['debit','credit'])for(let i=0;i<q.answer[side].length;i++){
  const row=q.answer[side][i];
  const select=page.locator('#view-question.active .'+side+'-account').nth(i);
  await select.selectOption(String(row.account));
  const amount=page.locator('#view-question.active .'+side+'-amount').nth(i);
  assert.equal(await amount.getAttribute('readonly'),'','iPhone calculator-first amount must be readonly');
  await amount.tap();
  const calc=page.locator('#view-question .calculator');
  await calc.locator('[data-action="calc"][data-calc="C"]').tap();
  for(const digit of String(row.amount).split('')){
   assert(/^[0-9]$/.test(digit),q.id+' expected non-negative integer');
   await calc.locator('[data-action="calc"][data-calc="'+digit+'"]').tap();
  }
  await calc.locator('[data-action="calc-insert"]').tap();
  const inputValue=(await amount.inputValue()).replaceAll(',','');
  assert.equal(inputValue,String(row.amount),q.id+' calculator amount '+side+i);
  report.rows.push({question:q.id,side,index:i,amount:row.amount,calculator:'PASS'});save();
 }
 const summary=page.locator('#view-question.active details.calculator summary');
 if(await summary.isVisible() && await page.locator('#view-question.active details.calculator').evaluate(el=>el.open)){
   await summary.tap();
 }
}
async function main(){
 save();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await webkit.launch(),ctx=await browser.newContext({...devices['iPhone 13']});
 const page=await ctx.newPage();page.setDefaultTimeout(15000);
 const errors=[];page.on('pageerror',e=>errors.push(String(e.stack||e)));
 try{
  await page.goto('http://127.0.0.1:'+server.address().port+'/',{waitUntil:'load'});
  await page.waitForFunction(()=>Boolean(window.App?.controller));
  await tap(page.locator('#view-placement.active [data-action="placement-skip"]'));
  await tap(page.locator('#view-story.active #resume-button'));
  await page.locator('#view-question.active').waitFor({state:'visible'});
  const calcFirst=await page.evaluate(()=>window.App.controller.view.calculatorFirstInput);
  assert.equal(calcFirst,true,'coarse pointer must activate calculator-first mode');
  for(let i=0;i<3;i++){
   const q=await page.evaluate(()=>JSON.parse(JSON.stringify(window.App.controller.questions[window.App.controller.currentId])));
   assert.equal(q.type,'journal','first story questions expected journal');
   await fillJournal(page,q);
   await tap(page.locator('#view-question.active #question-form .confirm-button'));
   await page.locator('#view-result.active').waitFor({state:'visible'});
   const actual=await page.evaluate(()=>({phase:window.App.controller.learningFlow?.phase,width:innerWidth,scroll:document.documentElement.scrollWidth}));
   assert.equal(actual.phase,'C','correct grade on phone '+q.id);
   assert(actual.scroll<=actual.width+1,q.id+' horizontal overflow');
   await tap(page.locator('#view-result.active #standard-result-actions [data-action="next"]'));
   report.rows.push({question:q.id,result:'PASS',mode:'real taps and calculator',iPhoneTouch:true});save();
  }
  assert.equal(errors.length,0,'JavaScript errors: '+errors.join(' | '));
  report.status='PASS';save();
  console.log('RELEASE237_IPHONE13_WEBKIT_TOUCH_CALCULATOR_SMOKE_PASS',report.rows.length);
 }catch(e){report.status='FAIL';report.errors.push(String(e.stack||e));save();
  await page.screenshot({path:path.join(out,'failure.png'),fullPage:true}).catch(()=>{});console.error(e);process.exitCode=1;
 }finally{await ctx.close();await browser.close();await new Promise(resolve=>server.close(resolve));}
}
main().catch(err=>{console.error(err);process.exitCode=1;});
