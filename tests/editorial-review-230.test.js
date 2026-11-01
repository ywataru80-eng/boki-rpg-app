'use strict';
// Release230 / Generation184: examine exactly what changed on the 300 runtime records.
// Automated and AI editorial checks are NOT certification by an external human expert.
const assert=require('node:assert/strict');
const fs=require('node:fs'),cp=require('node:child_process'),vm=require('node:vm');
const BASE='8dc237c9fa3d7b92f8d5834827f7e6ea2d48d390';
const oldQuestions=cp.execFileSync('git',['show',BASE+':data/questions.js'],{encoding:'utf8',maxBuffer:16*1024*1024});
const domain=fs.readFileSync('data/accounting-domain.js','utf8');
const load=source=>{
 const scope={window:{},console};
 vm.runInNewContext(domain,scope,{filename:'accounting-domain.js',timeout:30000});
 scope.AccountingDomain=scope.window.AccountingDomain;
 vm.runInNewContext(source,scope,{filename:'questions.js',timeout:30000});
 return scope.window.QuestionData;
};
const before=load(oldQuestions),after=load(fs.readFileSync('data/questions.js','utf8'));
const ids=Object.keys(after).sort();
assert.equal(ids.length,300);
assert.deepEqual(ids,Object.keys(before).sort());
let explanations=0,stories=0;
const storyIds=[];
for(const id of ids){
 const a=after[id],b=before[id];
 assert.equal(a.question,b.question,id+' question statement must remain immutable');
 assert.equal(JSON.stringify(a.answer),JSON.stringify(b.answer),id+' accepted answer must remain immutable');
 const fields=Object.keys(a).filter(k=>JSON.stringify(a[k])!==JSON.stringify(b[k]));
 assert(fields.every(k=>k==='explanation'||k==='story'),id+' unexpected runtime mutation: '+fields.join(','));
 if(fields.includes('explanation'))explanations++;
 if(fields.includes('story')){stories++;storyIds.push(id);}
 assert(typeof a.story==='string'&&typeof a.explanation==='string',id+' complete text');
 assert(!a.explanation.includes('【実務での使い方】【業務の結果】'),id+' stacked headings forbidden');
 assert(!a.explanation.includes('前残・元データ → 増加または調整 → 減少または振替 → 最終値'),id+' inappropriate universal formula forbidden');
 if(a.type==='journal')assert(!a.explanation.includes('【この問題への当てはめ】問題文「'),id+' avoid full repeated prompt');
}
assert.equal(explanations,248);
assert.equal(stories,11);
assert.deepEqual(storyIds,['D012','E014','J032','J044','J103','J109','J116','J120','J127','J149','L030']);
assert(after.J120.story.includes('引き続き調べます'),'cash difference remains unresolved');
assert(after.D012.story.includes('四つの回答欄'),'D012 must name its real input type');
assert(after.L030.story.includes('年度決算'),'L030 is an annual statement problem');
assert(after.J032.story.includes('収入印紙'),'J032 ends on the actual transaction');
assert(after.E014.story.includes('訂正仕訳'),'single correction not certification of the entire trial balance');
assert(after.C001.explanation.includes('期末棚卸、貸倒見積り'),'C001 uses its own sequence');
assert(after.C002.explanation.includes('実査差額'),'C002 uses its own sequence');
assert(after.C003.explanation.includes('利息の未払計上'),'C003 uses its own sequence');
console.log('RELEASE230_EDITORIAL_RUNTIME_PASS: all300 identity, 248 explanation changes, 11 story changes. NOT_HUMAN_EXPERT_SIGNOFF');
