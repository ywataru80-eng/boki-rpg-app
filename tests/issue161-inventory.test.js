'use strict';
const assert=require('assert'),fs=require('fs'),vm=require('vm'),cp=require('child_process');

const sandbox={window:{},console};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('data/questions.js','utf8'),sandbox,{filename:'data/questions.js'});
const questions=sandbox.window.QuestionData;
// Issue161's stored inventory is historical. Release236 changes 17 assessed
// worksheet contracts; do not rewrite the original report to fit the successor.
const release=JSON.parse(fs.readFileSync('pwa-release-manifest.json','utf8')).release;
const successor=release==='20261107-236';
const historical={window:{},console};
if(successor){
  vm.createContext(historical);
  const sha='177dadd83369b0c1bd0c95db4af379ea35515c67';
  const source=cp.execFileSync('git',['show',`${sha}:data/questions.js`],{encoding:'utf8',maxBuffer:16*1024*1024});
  vm.runInContext(source,historical,{filename:`${sha}:data/questions.js`});
}
const inventoryQuestions=successor?historical.window.QuestionData:questions;
const examPool=new Set(sandbox.window.ExamPoolDefinition||[]);
const inventory=JSON.parse(fs.readFileSync('reports/issue-161/question-inventory.json','utf8'));

const ids=Object.keys(questions);
assert.deepStrictEqual(ids,Object.keys(inventoryQuestions),'current successor retains 300 historical IDs');
assert.strictEqual(inventory.issue,161,'inventory belongs to Issue 161');
assert.strictEqual(inventory.totalQuestions,300,'inventory must cover all 300 questions');
assert.strictEqual(ids.length,300,'question corpus remains 300 questions');
assert.strictEqual(inventory.questions.length,300,'inventory contains exactly one row per question');

const rendererOf=q=>{
  const cells=q.table?.inputCells||[];
  if(q.type==='journal') return 'renderJournal';
  if(q.type==='correction') return 'renderCorrection';
  if(q.format==='journal-book'&&cells.includes('d1Account')) return 'renderJournalBook';
  if(String(q.format||'').startsWith('bookkeeping-')) return 'renderBookkeepingForm';
  if(q.format==='balance-sheet') return 'renderBalanceSheet';
  if(q.format==='fixed-asset-ledger') return 'renderFixedAssetLedger';
  return 'renderTable';
};

const rows=new Map(inventory.questions.map(row=>[row.id,row]));
assert.strictEqual(rows.size,300,'question IDs are unique in inventory');
for(const id of ids){
  const q=inventoryQuestions[id],row=rows.get(id);
  assert(row,`${id}: inventory row exists`);
  assert.strictEqual(row.type,q.type,`${id}: type`);
  assert.strictEqual(row.format,q.format||null,`${id}: format`);
  assert.strictEqual(row.renderer,rendererOf(q),`${id}: renderer`);
  assert.strictEqual(row.chapter,q.chapter,`${id}: chapter`);
  assert.strictEqual(row.category,q.category,`${id}: category`);
  assert.strictEqual(row.learningRole,q.learningRole||null,`${id}: learningRole`);
  assert.strictEqual(row.examPool,examPool.has(id),`${id}: exam pool`);
  assert.strictEqual(row.explanation.hasAuthored,Boolean(String(q.explanation||'').trim()),`${id}: authored explanation flag`);
  assert.strictEqual(row.explanation.hasModel,Boolean(q.explanationModel),`${id}: explanation model flag`);
  assert.strictEqual(row.inputs.cellCount,(q.table?.inputCells||[]).length,`${id}: input cell count`);
}

assert.strictEqual(inventory.summary.questionsWithExplanationModel,300,'all questions expose explanation models');
assert.strictEqual(inventory.summary.questionsWithAuthoredExplanation,300,'all questions have authored explanation prose');
assert.strictEqual(inventory.summary.examPoolCount,74,'explicit exam pool size');
assert.strictEqual(inventory.summary.reviewRoleCount,60,'review-role inventory count');
assert.strictEqual(inventory.summary.totalTableInputCells,536,'table input-cell census');
assert.strictEqual([...rows.values()].filter(row=>!row.renderer).length,0,'no unknown renderer');
if(successor){
  // Lock the exact successor delta: 17 new decision worksheets, 30 fewer
  // answer cells, and no unauthorized changes to the other 283 questions.
  const changed=Array.from({length:17},(_,i)=>`D${String(i+2).padStart(3,'0')}`);
  const allowed=new Set(changed);
  for(const id of ids){
    const q=questions[id],old=inventoryQuestions[id];
    const stable=x=>({id:x.id,type:x.type,chapter:x.chapter,category:x.category,learningRole:x.learningRole||null});
    assert.deepStrictEqual(JSON.parse(JSON.stringify(stable(q))),JSON.parse(JSON.stringify(stable(old))),`${id}: original pedagogical classification`);
    if(!allowed.has(id)){
      assert.strictEqual(q.format||null,old.format||null,`${id}: unchanged format`);
      assert.deepStrictEqual(JSON.parse(JSON.stringify(q.table?.inputCells||[])),JSON.parse(JSON.stringify(old.table?.inputCells||[])),`${id}: unchanged assessed inputs`);
    }else{
      assert.strictEqual(q.format,'decision-worksheet-v2',`${id}: Release236 successor format`);
      assert.strictEqual(rendererOf(q),'renderTable',`${id}: still uses table renderer`);
      assert(q.table.inputCells.length>=1 && q.table.inputCells.length<=4,`${id}: bounded successor inputs`);
    }
  }
  assert.strictEqual(ids.reduce((n,id)=>n+(questions[id].table?.inputCells||[]).length,0),506,'Release236 successor has exactly 506 input cells');
}

console.log('ISSUE161_GATE1_INVENTORY_PASS');
