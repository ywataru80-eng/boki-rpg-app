'use strict';
// Release232 / Generation186: evidence-aligned Chapter 4; preserve all 300 runtime questions.
const assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process'),vm=require('node:vm');
const BASE='61c06adf3b6a7d59b7cb54a9b74bcc0ddc519dba',domain=fs.readFileSync('data/accounting-domain.js','utf8');
const load=src=>{const scope={window:{},console};vm.runInNewContext(domain,scope);scope.AccountingDomain=scope.window.AccountingDomain;vm.runInNewContext(src,scope);return scope.window;};
const prev=load(cp.execFileSync('git',['show',BASE+':data/questions.js'],{encoding:'utf8',maxBuffer:16*1024*1024}));
const successor=['20261103-234','20261105-235','20261107-236'].includes(JSON.parse(fs.readFileSync('pwa-release-manifest.json','utf8')).release);
const documentedSource=successor?cp.execFileSync('git',['show','c3689f0529e10519c71073acf6d75ec75bdd253a:data/questions.js'],{encoding:'utf8',maxBuffer:16*1024*1024}):fs.readFileSync('data/questions.js','utf8');
const current=load(documentedSource);
const ids=Object.keys(prev.QuestionData).sort();assert.equal(ids.length,300);assert.deepEqual(Object.keys(current.QuestionData).sort(),ids);
for(const id of ids)assert.equal(JSON.stringify(current.QuestionData[id]),JSON.stringify(prev.QuestionData[id]),id+' runtime must remain completely immutable');
assert.equal(current.AnchorScenes.length,36);
for(const old of prev.AnchorScenes){const cur=current.AnchorScenes.find(scene=>scene.sceneId===old.sceneId);assert(cur,old.sceneId);
 const fields=Object.keys(old).filter(key=>JSON.stringify(old[key])!==JSON.stringify(cur[key])).sort();
 assert.deepEqual(fields,old.sceneId==='CH04-REVERSAL'?['before','hook']:[],old.sceneId+' changed fields');
}
const scene=current.AnchorScenes.find(x=>x.sceneId==='CH04-REVERSAL');
assert(/一部.*判明/.test(scene.before)&&/残る差額.*証明しません/.test(scene.before));
assert(/原因未判明.*調査を続けます/.test(scene.hook));
assert([...scene.before].length<=120&&[...scene.hook].length<=100,'mobile surface limits');
for(const id of ['J017','J018','J020','J117','J118','J120'])assert.equal(JSON.stringify(current.QuestionData[id].answer),JSON.stringify(prev.QuestionData[id].answer));
const boss=current.AnchorScenes.find(x=>x.sceneId==='CH04-BOSS');
assert(/原因未判明/.test(boss.before),'BOSS must keep the shortage unresolved');
console.log('RELEASE232_GEN186_CH4_NARRATIVE_PASS: 300 questions immutable, one anchor corrected');
