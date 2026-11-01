'use strict';
// Release231 / Generation185: additive, strict runtime editorial regression.
// Never count this automated test as an independent human expert sign-off.
const assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process'),vm=require('node:vm');
const BASE='fde4d327115666e78a28d1662d74692df55802aa',domain=fs.readFileSync('data/accounting-domain.js','utf8');
const old=cp.execFileSync('git',['show',BASE+':data/questions.js'],{encoding:'utf8',maxBuffer:16*1024*1024});
const load=source=>{const scope={window:{},console};vm.runInNewContext(domain,scope,{filename:'domain.js'});scope.AccountingDomain=scope.window.AccountingDomain;vm.runInNewContext(source,scope,{filename:'questions.js'});return scope.window;};
const a=load(old),b=load(fs.readFileSync('data/questions.js','utf8'));
const ids=Object.keys(b.QuestionData).sort();assert.equal(ids.length,300);assert.deepEqual(ids,Object.keys(a.QuestionData).sort());
const special=new Set('J017 J018 J022 J045 J046 J047 J050 J051 J067 J068 J072 J095 J096 J097 J100 J117 J118 J122 J137 J145 J146'.split(' ')),scenes=new Set(["CH07-REVERSAL","CH07-BOSS","CH08-REVERSAL","CH08-BOSS","CH10-REVERSAL","CH10-BOSS"]);
for(const id of ids){
 const n=b.QuestionData[id],p=a.QuestionData[id];
 assert.equal(n.question,p.question,id+' question must not change');
 assert.equal(JSON.stringify(n.answer),JSON.stringify(p.answer),id+' answer must not change');
 const fields=Object.keys(n).filter(k=>JSON.stringify(n[k])!==JSON.stringify(p[k]));
 assert.deepEqual(fields,special.has(id)?['explanation']:[],id+' only the 21 approved explanations may change');
 if(special.has(id)){
   assert(!n.explanation.includes('特殊勘定の増加・減少を取引の目的に沿って処理するため'),id+' circular reasoning');
   assert(/借方|貸方/.test(n.explanation)&&/増加|減少/.test(n.explanation),id+' account movement and side');
 }
}
assert.equal(b.AnchorScenes.length,36);
for(const s of b.AnchorScenes){
 const oldScene=a.AnchorScenes.find(x=>x.sceneId===s.sceneId);assert(oldScene,s.sceneId+' must already exist');
 const fields=Object.keys(s).filter(k=>JSON.stringify(s[k])!==JSON.stringify(oldScene[k]));
 assert.deepEqual(fields,scenes.has(s.sceneId)?['before','after','hook']:[],s.sceneId+' restricted scene edit');
 for(const [field,limit] of [['before',120],['after',100],['hook',100]])assert([...s[field]].length<=limit,s.sceneId+' mobile text');
}
const scene=id=>b.AnchorScenes.find(s=>s.sceneId===id);
assert(/年度決算/.test(scene('CH07-BOSS').after));
assert(/合計の一致だけでは/.test(scene('CH08-REVERSAL').after));
assert(/試算表全体/.test(scene('CH08-BOSS').after));
assert(/四つの/.test(scene('CH10-BOSS').before));
console.log('RELEASE231_EDITORIAL_RUNTIME_PASS: all300 immutable answers; 21 explanation edits; 6 anchored scene edits');
