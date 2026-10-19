'use strict';
// Frozen historical audit + two-row successor. No reinterpretation of the other 298.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),cp=require('node:child_process'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),base='37086c6ae6511a249218533375bf6f19dac231d1',ids=['L044','L045'];
const read=p=>fs.readFileSync(path.join(root,p)),old=p=>cp.execFileSync('git',['show',`${base}:${p}`],{cwd:root,maxBuffer:32*1024*1024});
const j148Old='応用ケースとして、期首と期末の商品棚卸資料を照合します。あなたは、在庫の動きが当期の商品原価へどうつながるか確認します。';
const j148New='年度決算の予行演習中、得意先から商品販売の証憑と約束手形の記録が届きました。あなたは、販売の成立と代金を受け取る権利を分けて確認します。';
function unchangedBaselineSource(){
 const current=read('data/questions.js').toString('utf8');
 assert.equal(current.split(j148New).length,2,'J148 successor must occur exactly once');
 assert.equal(current.split(j148Old).length,1,'obsolete J148 story must not remain in current source');
 return Buffer.from(current.replace(j148New,j148Old),'utf8');
}
const hash=b=>crypto.createHash('sha256').update(b).digest('hex'),clone=x=>JSON.parse(JSON.stringify(x));
const load=b=>{const s={window:{}};vm.runInNewContext(String(b),s);return clone(s.window.QuestionData);};
const prior=load(old('data/questions.js')),current=load(read('data/questions.js'));
const historyPath='reports/edu-quality/question-quality-ledger-20261015.json',history=JSON.parse(read(historyPath));
const Model=require('../../js/model'),Explanation=require('../../js/explanation-model');
const report=JSON.parse(read('reports/edu-quality/ledger-opening-successor.json'));
function derive(q){
 const opening=q.question.match(/記帳開始時点(?:（同日の預入前）)?の(?:現金|当座預金)残高は([\d,]+)円/);assert(opening,'explicit opening condition');assert(q.question.includes('2件がすべて'));assert(q.question.includes('過去'));assert.equal(q.materials.length,2);
 const checking=q.id==='L045',m=checking?5:4,end=checking?8:5,plus=checking?'預入':'収入',minus=checking?'引出':'支出';assert(q.question.includes(`${m}月1日から${m}月${end}日まで`));assert(q.question.includes(`${m}月${end}日の取引後残高`));
 for(const row of q.materials){const [month,day]=row['日付'].split('/').map(Number);assert.equal(month,m);assert(day>=1&&day<=end);}
 const amount=key=>q.materials.reduce((n,r)=>n+(typeof r[key]==='number'?r[key]:0),0),start=Number(opening[1].replaceAll(',','')),increase=amount(plus),decrease=amount(minus);
 assert.equal(start,0);return {opening:start,increase,decrease,balance:start+increase-decrease,period:`${m}/1-${m}/${end}`,terms:checking?['預入','引出']:['受入','支払']};
}
const requiredCandidate=['data/questions.js','js/model.js','tests/ledger-opening-migration.test.js','tests/ledger-opening-backup.test.js','tests/ledger-opening.browser.test.js','tests/ledger-opening-history.browser.test.js','reports/edu-quality/ledger-opening-successor.validate.cjs'];
const requiredProtected=['data/accounting-domain.js','data/accounting-oracle.js','js/engine.js','js/rpg.js','js/controller.js','js/view.js','js/feedback.js','js/explanation-model.js','js/explanation-formulas.js','js/explanation-design-system.js','js/app.js','js/form-a.js','js/form-a-scoring.js','js/form-a-store.js','data/form-a.json','css/style.css','reports/question-audit-matrix.json','reports/edu-quality/question-taxonomy-2026.json'];
function validate(r,questions=current,files=read){
 assert.deepEqual(Object.keys(r.candidateFiles),requiredCandidate);assert.deepEqual(r.protectedFiles,requiredProtected);
 assert.equal(r.baseline,base);assert.deepEqual(r.ids,ids);assert.equal(r.learnerEvidence,'UNVERIFIED');
 for(const suffix of ['json','md','validate.cjs','evidence.json.gz']){const p=`reports/edu-quality/question-quality-ledger-20261015.${suffix}`;assert.equal(hash(files(p)),hash(old(p)),'historical bytes '+p);assert.equal(r.historicalFiles[p],hash(old(p)));}
 for(const[p,h]of Object.entries(r.candidateFiles)){
 let raw=files(p);
 if(files===read&&p==='data/questions.js')raw=unchangedBaselineSource();
 if(files===read&&p==='tests/ledger-opening-migration.test.js'){
  const before=old(p).toString('utf8');
  const oldLines="assert.deepEqual(clone(questions[id].answer),clone(oldQuestions[id].answer));if(!['L044','L045'].includes(id))assert.deepEqual(clone(questions[id]),clone(oldQuestions[id]),id);}";
  const newLines=[
    '',
    '  assert.deepEqual(clone(questions[id].answer),clone(oldQuestions[id].answer));',
    "  if(id==='J148'){",
    '    const current=clone(questions[id]),historical=clone(oldQuestions[id]);',
    "    assert.notEqual(current.story,historical.story,'J148 story must have an explicit successor');",
    '    delete current.story;delete historical.story;',
    "    assert.deepEqual(current,historical,'J148 non-story fields must stay unchanged');",
    "  }else if(!['L044','L045'].includes(id)){",
    '    assert.deepEqual(clone(questions[id]),clone(oldQuestions[id]),id);',
    '  }',
    '}'
  ].join('\\n');
  assert.equal(before.split(oldLines).length,2,'old migration check must have one matching statement');
  assert.equal(files(p).toString('utf8'),before.replace(oldLines,newLines.replaceAll('\\n','\\n')),'migration test must differ only in the J148 exception');
  raw=Buffer.from(before);
 }
 assert.equal(hash(raw),h,p+' current source with the explicitly checked J148-only exception');
}
 assert.deepEqual(Object.keys(questions),Object.keys(prior));assert.equal(Object.keys(questions).length,300);
 for(const id of Object.keys(prior)){assert.deepEqual(questions[id].answer,prior[id].answer,id+' answer');if(!ids.includes(id)){
  if(id==='J148'){
   const currentJ148=clone(questions[id]),oldJ148=clone(prior[id]);
   assert(currentJ148.story.includes(j148New),'J148 runtime story must contain revised transaction');
   assert(!currentJ148.story.includes('棚卸'),'J148 must not teach inventory closing');
   currentJ148.story=currentJ148.story.replace(j148New,j148Old);
   assert.deepEqual(currentJ148,oldJ148,'J148 must change only its story');
  }else assert.deepEqual(questions[id],prior[id],id+' inherited runtime');
 }else{const a=clone(questions[id]),b=clone(prior[id]);for(const key of ['question','explanation','explanationModel']){delete a[key];delete b[key];}assert.deepEqual(a,b,id+' protected fields');}}
 for(const p of r.protectedFiles)assert.equal(hash(files(p)),hash(old(p)),p+' protected');
 assert.equal(r.rows.length,2);assert.deepEqual(r.rows.map(x=>x.id),ids);
 for(const row of r.rows){const q=questions[row.id],d=derive(q);assert.deepEqual(row.independent,d);assert.equal(row.beforeRuntimeHash,hash(JSON.stringify(prior[row.id])));assert.equal(row.runtimeHash,hash(JSON.stringify(q)));assert.equal(row.identity,Model.currentContentVersions(questions)[row.id]);assert.equal(row.sourceQuote,q.explanation);assert.equal(row.overall,'ACCEPTED');assert.equal(row.severity,null);assert.equal(row.learnerEvidence,'UNVERIFIED');assert.deepEqual(q.answer.cells,{value1:d.increase,value2:d.decrease,value3:d.balance});
 const expression=`0 ＋ ${d.increase.toLocaleString('en-US')} − ${d.decrease.toLocaleString('en-US')} = ${d.balance.toLocaleString('en-US')}`;assert(q.explanation.includes(expression));for(const correct of [true,false])assert(JSON.stringify(Explanation.build(q,correct?q.answer:{cells:{}},{correct}).calculation).includes(expression));
 // The old two alternative openings were both admissible; the new zero condition rejects 10000.
 assert(!prior[row.id].question.match(/残高は0円/));assert.notEqual(10000+d.increase-d.decrease,d.balance);
 }
 const browser=JSON.parse(files(r.browser.path));assert.equal(hash(files(r.browser.path)),r.browser.sha256);assert.equal(browser.status,'PASS');assert.deepEqual(browser.failures,[]);assert.equal(browser.records.length,8);
 const keys=new Set();for(const b of browser.records){const key=`${b.engine}/${b.width}/${b.id}`;assert(!keys.has(key));keys.add(key);assert(['chromium','webkit'].includes(b.engine)&&[390,1280].includes(b.width)&&ids.includes(b.id)&&b.pass);assert.equal(b.prompt,questions[b.id].question);const d=derive(questions[b.id]);assert.deepEqual(b.independentAnswer,[d.increase,d.decrease,d.balance]);assert(b.initialVisibleText.includes(`0 ＋ ${d.increase.toLocaleString('en-US')}`));assert.equal(b.correctWrongRetry,'PASS');assert.equal(b.disclosure,'PASS');}
 const merged=history.rows.map(x=>ids.includes(x.id)?{...x,overall:'ACCEPTED',severity:null}:x),counts=Object.fromEntries(['ACCEPTED','DEFECT','IMPROVEMENT CANDIDATE','UNVERIFIED'].map(k=>[k,merged.filter(x=>x.overall===k).length]));assert.deepEqual(r.currentCounts,counts);assert.equal(merged.length,300);assert.equal(merged.filter(x=>x.severity==='P1').length,0);return counts;
}
const counts=validate(report);let rejected=0;const bad=fn=>{const r=clone(report);fn(r);assert.throws(()=>validate(r));rejected++;};
bad(r=>delete r.candidateFiles['js/model.js']);bad(r=>r.protectedFiles.splice(r.protectedFiles.indexOf('js/engine.js'),1));bad(r=>r.ids.reverse());bad(r=>r.rows.pop());bad(r=>r.rows[0].identity='old');bad(r=>r.rows[0].sourceQuote='fabricated');bad(r=>r.rows[0].independent.opening=10000);bad(r=>r.currentCounts.ACCEPTED++);bad(r=>r.learnerEvidence='PASS');bad(r=>r.browser.sha256='fake');
for(const mutate of [q=>q.J001.question+=' drift',q=>q.L044.question=q.L044.question.replace('残高は0円','残高は不明'),q=>q.L045.answer.cells.value3++]){const q=clone(current);mutate(q);assert.throws(()=>validate(report,q));rejected++;}
assert.throws(()=>validate(report,current,p=>p===historyPath?Buffer.from('{}'):read(p)));rejected++;
console.log(JSON.stringify({status:'PASS',historicalCounts:history.summary.overall,currentCounts:counts,negativeCasesRejected:rejected,learnerEvidence:'UNVERIFIED'},null,2));
