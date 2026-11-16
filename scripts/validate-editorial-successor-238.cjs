'use strict';
// Release238 / Gen202: exact, prose-only correction of D002-D018 narrative endings.
// No assessed contract, storage identity, RPG progression, or historical lock may change.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const cp=require('node:child_process');
const vm=require('node:vm');
const crypto=require('node:crypto');
const ROOT_TREE='55581c2620c635d89469f27e04e421aa788eaf5d';
const RELEASE='20261116-238',PREV='20261115-237';
const LOCK_OLD='reports/auto-gate/audit-locks/phase-b-generation-201.json';
const LOCK_NEW='reports/auto-gate/audit-locks/phase-b-generation-202.json';
const git=(...args)=>cp.execFileSync('git',args,{encoding:'utf8',maxBuffer:32*1024*1024}).trim();
const before=path=>cp.execFileSync('git',['show',`${ROOT_TREE}:${path}`],{maxBuffer:32*1024*1024});
const read=path=>fs.readFileSync(path);
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
assert.equal(cp.spawnSync('git',['cat-file','-e',ROOT_TREE+'^{tree}']).status,0,'known Release237 main tree must exist');
assert.equal(git('rev-parse',ROOT_TREE+'^{tree}'),ROOT_TREE);
const allowed=new Set([
  'data/questions.js','index.html','form-a.html','service-worker.js','pwa-release-manifest.json',LOCK_NEW,
  '.github/workflows/question-quality-ledger-audit.yml','.github/visual/run-content-progress-migration.js',
  'tests/editorial-review-230.test.js','tests/editorial-review-232.test.js','tests/editorial-review-233.test.js',
  'tests/editorial-review-234.test.js','tests/issue161-inventory.test.js','tests/l039-explanation.test.js',
  'tests/ledger-opening-migration.test.js','tests/audit-matrix.test.js','tests/user-facing-copy-contract.test.js',
  'scripts/validate-editorial-successor-238.cjs'
]);
const tracked=git('diff','--name-only',ROOT_TREE).split(/\n/u).filter(Boolean);
const untracked=git('ls-files','--others','--exclude-standard').split(/\n/u)
  .filter(file=>!file.startsWith('node_modules/')&&!file.startsWith('artifacts/')&&!file.startsWith('reports/baseline-current/')&&!file.startsWith('historical-quality/'));
const changed=[...new Set([...tracked,...untracked])];
assert(changed.every(p=>allowed.has(p)), 'unapproved Release238 file: '+changed.filter(p=>!allowed.has(p)).join(','));
assert(read(LOCK_OLD).equals(before(LOCK_OLD)),'immutable Generation201 lock changed');
const oldSource=before('data/questions.js').toString('utf8'),newSource=read('data/questions.js').toString('utf8');
const original='`今回の確認事項は「${goal}」。資料の条件を照合し、根拠を整理します。`';
const revised='`今回の確認事項は「${goal}」。`';
assert.equal(oldSource.split(original).length,2,'single source anchor for the approved 17-item narrative');
assert.equal(newSource,oldSource.replace(original,revised),'D002-D018 narrative-ending change must be the only data source edit');
function load(src){const ctx={window:{},console};vm.runInNewContext(src,ctx,{filename:'data/questions.js',timeout:30000});return JSON.parse(JSON.stringify(ctx.window.QuestionData));}
const oldData=load(oldSource),newData=load(newSource);
const ids=Object.keys(oldData).sort();assert.equal(ids.length,300);assert.deepEqual(Object.keys(newData).sort(),ids);
const reviewed=Array.from({length:17},(_,i)=>`D${String(i+2).padStart(3,'0')}`);
const changedIds=[];
for(const id of ids){
  const old=oldData[id],now=newData[id];
  for(const key of new Set([...Object.keys(old),...Object.keys(now)])){
    if(key==='story')continue;
    assert.deepEqual(now[key],old[key],id+' changed assessed/non-story field '+key);
  }
  if(old.story===now.story)continue;
  changedIds.push(id);
  assert(reviewed.includes(id),'unexpected story edit '+id);
  assert(old.story.endsWith('資料の条件を照合し、根拠を整理します。'),id+' unexpected source ending');
  assert.equal(now.story,old.story.slice(0,-'資料の条件を照合し、根拠を整理します。'.length),id+' prose-only expected delta');
  assert(now.story.includes('今回の確認事項は「')&&now.story.endsWith('」。'),id+' clear case-specific goal retained');
}
assert.deepEqual(changedIds,reviewed,'exactly 17 approved D002-D018 stories changed');
const manifest=JSON.parse(read('pwa-release-manifest.json'));
const oldManifest=JSON.parse(before('pwa-release-manifest.json'));
assert.equal(manifest.release,RELEASE);assert.equal(manifest.previousRelease,PREV);assert.equal(oldManifest.release,PREV);
assert.deepEqual(Object.keys(manifest.assets).sort(),Object.keys(oldManifest.assets).sort());
assert.deepEqual(Object.keys(manifest.pages).sort(),Object.keys(oldManifest.pages).sort());
for(const [path,expected] of Object.entries({...manifest.assets,...manifest.pages}))
  assert.equal(hash(read(path)),expected,path+' release asset manifest mismatch');
for(const path of ['index.html','form-a.html','service-worker.js'])
  assert.equal(read(path).toString('utf8'),before(path).toString('utf8').replaceAll(PREV,RELEASE),path+' release marker only');
const lock=JSON.parse(read(LOCK_NEW));
assert.equal(lock.generation,202);assert.equal(lock.predecessor.generation,201);
const lifecycle=require('./qa/phase-b-lifecycle');
const committed=cp.spawnSync('git',['cat-file','-e','HEAD:'+LOCK_NEW]).status===0;
const proof=committed?lifecycle.verifyCurrent():lifecycle.verifyCandidate(lock);
assert(proof.ok,'Generation202 integrity: '+proof.errors.join(';'));
assert.deepEqual(lock.productionHashes['data/questions.js'],hash(read('data/questions.js')));
assert.equal(hash(read('js/model.js')),hash(before('js/model.js')),'content identities may not be modified');
for(const [path,text] of [
  ['tests/audit-matrix.test.js',"'20261116-238':'scripts/validate-editorial-successor-238.cjs'"],
  ['.github/workflows/question-quality-ledger-audit.yml',"'20261116-238': 'scripts/validate-editorial-successor-238.cjs'"],
  ['tests/user-facing-copy-contract.test.js',"'20261116-238'].includes(manifest.release)"],
  ['.github/visual/run-content-progress-migration.js',"'20261116-238'].includes(release)"]])
  assert(read(path).toString('utf8').includes(text),path+' new release routing missing');
console.log('RELEASE238_GEN202_PROSE_ONLY_PASS',changedIds.length,'stories, 300 assessed contracts preserved');
