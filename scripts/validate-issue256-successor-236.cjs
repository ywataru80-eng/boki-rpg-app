'use strict';
// Release236 / Generation190 successor: D002-D018 graded content change.
// Historic Release235 must be independently validated, never overwritten.
const assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process'),crypto=require('node:crypto'),vm=require('node:vm');
const BASE='177dadd83369b0c1bd0c95db4af379ea35515c67',PREV='20261105-235',RELEASE='20261107-236';
const GEN='reports/auto-gate/audit-locks/phase-b-generation-190.json';
const git=(...args)=>cp.execFileSync('git',args,{encoding:'utf8',maxBuffer:16*1024*1024}).trim();
const old=p=>cp.execFileSync('git',['show',BASE+':'+p],{maxBuffer:16*1024*1024});
const read=p=>fs.readFileSync(p),hash=p=>crypto.createHash('sha256').update(read(p)).digest('hex');
assert.equal(cp.spawnSync('git',['merge-base','--is-ancestor',BASE,'HEAD']).status,0,'Release235 parent must remain in the ancestry');
const manifest=JSON.parse(read('pwa-release-manifest.json')),prior=JSON.parse(old('pwa-release-manifest.json'));
assert.equal(prior.release,PREV);assert.equal(manifest.release,RELEASE);assert.equal(manifest.previousRelease,PREV);
assert.deepEqual(Object.keys(manifest.assets).sort(),Object.keys(prior.assets).sort());
assert.deepEqual(Object.keys(manifest.pages).sort(),Object.keys(prior.pages).sort());
for(const [p,v]of Object.entries({...manifest.assets,...manifest.pages}))assert.equal(hash(p),v,p+' served-asset digest');
for(const file of ['index.html','form-a.html','service-worker.js'])assert.equal(read(file).toString(),old(file).toString().replaceAll(PREV,RELEASE),file+' marker-only update');
const allowed=new Set([
 'data/questions.js','js/model.js','js/explanation-model.js','js/explanation-formulas.js',
 'index.html','form-a.html','service-worker.js','pwa-release-manifest.json',
 'scripts/validate-issue256-successor-236.cjs','package.json',
 'reports/auto-gate/audit-locks/phase-b-generation-190.json',
 'reports/edu-quality/issue256-release236-review-ledger.json',
 '.github/workflows/question-quality-ledger-audit.yml',
 '.github/workflows/issue256-release236-acceptance.yml',
 '.github/workflows/issue256-release236-commit.yml',
 'tests/issue256-release236-migration.test.js',
 'tests/ledger-opening-migration.test.js',
 'tests/exam-points-visible.test.js','tests/npc-dialogue-story.test.js','tests/audit-matrix.test.js',
 'tests/editorial-review-234.test.js','tests/editorial-review-232.test.js',
 'tests/editorial-review-233.test.js','tests/editorial-review-230.test.js',
 'tests/editorial-review-231.test.js',
 'tests/editorial-review-235.test.js',
 'tests/user-facing-copy-contract.test.js'
]);
const changed=git('diff','--name-only',BASE,'HEAD').split(/\n/u).filter(Boolean);
const uncommitted=git('diff','--name-only').split(/\n/u).filter(Boolean);
const untracked=git('ls-files','--others','--exclude-standard').split(/\n/u).filter(Boolean)
 .filter(p=>!p.startsWith('artifacts/')&&!p.startsWith('reports/baseline-current/')&&p!=='historical-quality/');
const all=[...new Set([...changed,...uncommitted,...untracked])].sort();
assert(all.includes('data/questions.js')&&all.includes('js/model.js')&&all.includes(GEN),'required graded successor and Generation lock missing');
assert(all.every(p=>allowed.has(p)),'Release236 out-of-scope files: '+all.filter(p=>!allowed.has(p)).join(','));
for(const p of ['data/accounting-domain.js','data/accounting-oracle.js','js/engine.js','js/controller.js','js/rpg.js','js/view.js','reports/auto-gate/audit-locks/phase-b-generation-189.json']){
 assert(read(p).equals(old(p)),'protected grading/state/historical bytes changed: '+p);
}
const context=src=>{
 const scope={window:{},console};const domain=read('data/accounting-domain.js').toString();
 vm.runInNewContext(domain,scope);scope.AccountingDomain=scope.window.AccountingDomain;
 vm.runInNewContext(src,scope,{timeout:15000});return scope.window.QuestionData;
};
const before=context(old('data/questions.js').toString()),now=context(read('data/questions.js').toString());
const ids=Object.keys(before).sort(),edited=new Set(Array.from({length:17},(_,i)=>'D'+String(i+2).padStart(3,'0')));
assert.equal(ids.length,300);assert.deepEqual(Object.keys(now).sort(),ids);
const stable=o=>JSON.stringify(o,(k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
for(const id of ids){
 if(edited.has(id)){
  const q=now[id];assert.equal(q.type,'worksheet');assert.equal(q.format,'decision-worksheet-v2');
  assert(q.table.inputCells.length>0&&q.table.inputCells.length<=4);
  assert.equal(q.table.inputCells.length,Object.keys(q.answer.cells).length);
  assert(q.npcDialogue.includes('水野先輩')&&q.explanation.includes('【検算】'));
 } else if(['D019','D020'].includes(id)){
  const a=before[id],b=now[id];
  for(const k of new Set([...Object.keys(a),...Object.keys(b)])){
   if(['npcDialogue','nextHook'].includes(k))continue;
   assert.equal(stable(a[k]),stable(b[k]),id+' protected worksheet task/source changed: '+k);
  }
 } else assert.equal(stable(before[id]),stable(now[id]),id+' outside 17 changed');
}
const model=require('../js/model');assert.equal(Object.keys(model.currentContentVersions(now)).length,21);
const gen=JSON.parse(read(GEN));assert.equal(gen.generation,190);assert.equal(gen.predecessor.generation,189);
const lifecycle=require('./qa/phase-b-lifecycle');
const committed=cp.spawnSync('git',['cat-file','-e','HEAD:'+GEN],{encoding:'utf8'}).status===0;
const r=committed?lifecycle.verifyCurrent():lifecycle.verifyCandidate(gen);
assert(r.ok,'Generation190 ledger integrity: '+r.errors.join('; '));
cp.execFileSync(process.execPath,['tests/issue256-release236-migration.test.js'],{stdio:'inherit'});
console.log('RELEASE236_GEN190_17_AUTHORED_DECISIONS_STRICT_SCOPE_PASS');
