'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto'),cp=require('node:child_process');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),out=process.argv[2]||path.join(root,'artifacts/explanation-quality-render.json'),revision=process.argv[3]||null;
const readSource=file=>revision?cp.execFileSync('git',['show',revision+':'+path.relative(root,file)],{cwd:root,stdio:['ignore','pipe','ignore']}):fs.readFileSync(file);
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const server=http.createServer((req,res)=>{const pathname=new URL(req.url,'http://localhost').pathname;const file=path.resolve(root,pathname==='/'?'index.html':pathname.slice(1));if(!file.startsWith(root+'/')){res.writeHead(403);res.end();return;}try{res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.setHeader('Cache-Control','no-store');res.end(readSource(file));}catch{res.writeHead(404);res.end();}});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true});const errors=[];
try{const page=await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'allow'});page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>Boolean(window.App?.controller));
const results=await page.evaluate(()=>{
 const clone=x=>JSON.parse(JSON.stringify(x));const records=[];
 function wrong(q){const a=clone(q.answer);if(q.type==='journal'){a.debit[0].amount+=1;return {scenario:'amount',answer:a};}const entries=Object.entries(a.cells);const chosen=entries.find(([k,v])=>typeof v==='number')||entries[0];a.cells[chosen[0]]=typeof chosen[1]==='number'?chosen[1]+1:'未記入';return {scenario:/worksheet|comprehensive|financial_statement/.test(q.type)?'adjustment-calculation':'table-transfer',answer:a};}
 function render(q,scenario,a,expected){const before=JSON.stringify(q),storage=JSON.stringify(Object.keys(localStorage).sort().map(k=>[k,localStorage.getItem(k)]));const score=GradingEngine.grade(q,a);App.controller.view.questionMode='story';App.controller.view.result(q,score,a,'unsure',{},!score.correct);App.controller.view.show('view-result');const node=document.getElementById('explanation');const initial=node.innerText;const summary=document.getElementById('result-error-summary').innerText;node.querySelectorAll('details').forEach(d=>d.open=true);const expanded=node.innerText;const comparison=document.getElementById('answer-comparison')?.innerText||'';const headings=[...node.querySelectorAll('h1,h2,h3,h4,h5,h6')].map(n=>n.textContent);const model=ExplanationModel.build(q,a,score);return {scenario,answer:a,expectedCorrect:expected,score,initial,expanded,summary,comparison,headings,model,overflow:document.documentElement.scrollWidth>innerWidth+1,unchanged:before===JSON.stringify(q)&&storage===JSON.stringify(Object.keys(localStorage).sort().map(k=>[k,localStorage.getItem(k)]))};}
 for(const [id,q] of Object.entries(QuestionData)){const w=wrong(q);const variants=[render(q,'correct',clone(q.answer),true),render(q,w.scenario,w.answer,false)];
 if(['J001','J006','J017','J022','J045','J048','J050','J098','J103','J148','J150'].includes(id)){
  const account=clone(q.answer);const current=account.debit[0].account;account.debit[0].account=current==='現金'?'普通預金':current==='受取手形'?'売掛金':current==='貸倒引当金'?'貸倒損失':current==='減価償却累計額'?'減価償却費':'現金';variants.push(render(q,'wrong-account',account,false));
  variants.push(render(q,'reversed-sides',{debit:clone(q.answer.credit),credit:clone(q.answer.debit)},false));const missing=clone(q.answer);missing.debit.shift();variants.push(render(q,'missing',missing,false));if(q.answer.debit.length+q.answer.credit.length>2){const partial=clone(q.answer);partial.credit[0].amount+=100;variants.push(render(q,'compound-partial',partial,false));}
 }
 if(['L004','L025','L030','L033','L034','L040','L041','L049','D002','D019','C001'].includes(id)){
  for(const [cellId,meta] of Object.entries(q.table?.inputMetadata||{})){
   if(!['unitPrice','months','folio'].includes(meta.semanticType)&&!(id==='D019'&&cellId==='insurance')&&!(id==='C001'&&cellId==='netIncome'))continue;
   const a=clone(q.answer);a.cells[cellId]=Number(a.cells[cellId])+1;variants.push(render(q,'wrong-'+cellId,a,false));
  }
  const blank=clone(q.answer);delete blank.cells[Object.keys(blank.cells)[0]];variants.push(render(q,'missing-cell',blank,false));
 }
 const {type,format,category,question,materials,table,answer,explanation,explanationModel,teachingPresentation}=q;records.push({id,type,format,category,question,materials,table,answer,explanation,explanationModel,teachingPresentation,variants});
 }
 return records;
});
const files=['data/questions.js','js/feedback.js','js/explanation-model.js','js/explanation-formulas.js','js/explanation-design-system.js','js/view.js'];
const result={generatedAt:new Date().toISOString(),head:cp.execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),sources:Object.fromEntries(files.map(f=>[f,crypto.createHash('sha256').update(readSource(path.join(root,f))).digest('hex')])),method:'Actual Chromium AppView.result DOM via native static HTTP origin, 390x844. Programmatic result inputs, not full click-through or learner validation. Details expanded for full text, initial text separately. Fresh isolated origin and browser context; service worker enabled. Sources fixed to revision when provided.',questions:results.length,scenarios:results.reduce((n,r)=>n+r.variants.length,0),errors,records:results};fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(result));
for(const id of ['J017','J022','L004','L033','D019','C001']){
 await page.evaluate(id=>{const q=QuestionData[id];App.controller.view.result(q,GradingEngine.grade(q,q.answer),q.answer);App.controller.view.show('view-result');},id);
 await page.screenshot({path:path.join(path.dirname(out),'explanation-'+id+'.png'),fullPage:true});
}
const contentMismatch=results.some(r=>r.variants.some(v=>v.model.summary.some(item=>!v.expanded.includes(item.text))||v.model.transfer.some(item=>!v.expanded.includes(item.decision))||new Set(v.headings).size!==v.headings.length||(r.type==='worksheet'&&/決算整理・計算問題/u.test(r.category)&&v.expanded.includes('精算表'))));
if(contentMismatch)throw new Error('Rendered model content or headings mismatch');
if(result.questions!==300||errors.length||results.some(r=>r.variants.some(v=>v.score.correct!==v.expectedCorrect||!v.unchanged||v.overflow||/特殊勘定の増加・減少|払出単価内訳円|NaN|undefined/.test(v.expanded))))throw new Error('Rendered explanation audit failed; inspect '+out);

await page.evaluate(()=>navigator.serviceWorker.ready.then(()=>true));
await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
await page.context().setOffline(true);await page.reload();await page.waitForFunction(()=>Boolean(window.App?.controller));
result.offline=await page.evaluate(()=>({questions:Object.keys(QuestionData).length,unitPrice:WrongAnswerFeedback.formatValue(1200,'unitPrice'),controlled:Boolean(navigator.serviceWorker.controller)}));
if(result.offline.questions!==300||result.offline.unitPrice!=='1,200円／個'||!result.offline.controlled)throw new Error('Offline candidate boot failed');
fs.writeFileSync(out,JSON.stringify(result));
console.log(JSON.stringify({out,offline:result.offline,questions:result.questions,scenarios:result.scenarios,pageErrors:errors,gradeMismatches:results.flatMap(r=>r.variants.filter(v=>v.score.correct!==v.expectedCorrect).map(v=>[r.id,v.scenario])),mutations:results.flatMap(r=>r.variants.filter(v=>!v.unchanged).map(v=>[r.id,v.scenario]))}));
}finally{await browser.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1;server.close()});
