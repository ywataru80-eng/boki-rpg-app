'use strict';
// Release233 / Generation187: v4.2 UI, exam-result correction, immutable 300 accounting questions.
// This validation accepts a *strictly validated* uncommitted successor candidate before the
// first commit; after commit the normal historical immutable Generation authority must verify.
const assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process'),crypto=require('node:crypto');
const BASE='86364e3944750ab25334e2c3a557d20768d05963',PREV='20261102-232',NEXT='20261103-233';
const GEN='reports/auto-gate/audit-locks/phase-b-generation-187.json';
const read=p=>fs.readFileSync(p,'utf8'),sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const git=(...args)=>cp.execFileSync('git',args,{encoding:'utf8'}).trim();
assert.equal(git('merge-base',BASE,'HEAD'),BASE,'Release233 requires historical Release232 ancestry');
const allowed=new Set([
 'form-a.html','index.html','js/view.js','package.json','pwa-release-manifest.json','service-worker.js',
 '.github/workflows/question-quality-ledger-audit.yml',
 'scripts/validate-reader-editorial-successor-233.cjs','tests/audit-matrix.test.js','tests/user-facing-copy-contract.test.js',
 'tests/editorial-review-233.test.js','tests/account-nature-teaching.test.js',GEN,
 'tests/exam-review-structured.test.js','tests/exam-review-content.test.js','tests/exam-review-authored.test.js',
 'tests/exam-review-special-notes.test.js','tests/exam-review-unanswered.test.js','tests/npc-dialogue-story.test.js'
]);
const paths=[...new Set([
 ...git('diff','--name-only',BASE,'HEAD').split(/\n/u),
 ...git('diff','--name-only').split(/\n/u),
 ...git('diff','--cached','--name-only').split(/\n/u),
 ...git('ls-files','--others','--exclude-standard').split(/\n/u)
])].filter(Boolean).filter(p=>!p.startsWith('artifacts/')&&!p.startsWith('reports/baseline-current/')).sort();
assert(paths.length>0,'Release233 must change production implementation');
assert(paths.every(p=>allowed.has(p)), 'Release233 diff has unexpected paths: '+paths.filter(p=>!allowed.has(p)).join(','));
const previous=JSON.parse(cp.execFileSync('git',['show',`${BASE}:pwa-release-manifest.json`],{encoding:'utf8'}));
assert.equal(previous.release,PREV);
assert(fs.readFileSync('data/questions.js').equals(cp.execFileSync('git',['show',`${BASE}:data/questions.js`])),'canonical 300 question bytes must remain unchanged');
const manifest=JSON.parse(read('pwa-release-manifest.json'));
assert.equal(manifest.release,NEXT);assert.equal(manifest.previousRelease,PREV);
assert.deepEqual(Object.keys(manifest.assets).sort(),Object.keys(previous.assets).sort());
assert.deepEqual(Object.keys(manifest.pages).sort(),Object.keys(previous.pages).sort());
for(const [p,h] of Object.entries({...manifest.assets,...manifest.pages}))assert.equal(sha(p),h,`${p} SHA256`);
for(const p of ['index.html','form-a.html','service-worker.js']){
 const before=cp.execFileSync('git',['show',`${BASE}:${p}`],{encoding:'utf8'});
 assert.equal(read(p),before.replaceAll(PREV,NEXT),`${p} contains only release revision`);
}
const gen=JSON.parse(read(GEN));
assert.equal(gen.schemaVersion,3);assert.equal(gen.generation,187);assert.equal(gen.predecessor.generation,186);
const lifecycle=require('./qa/phase-b-lifecycle');
const currentGenTracked=cp.spawnSync('git',['cat-file','-e',`HEAD:${GEN}`],{encoding:'utf8'}).status===0;
if(currentGenTracked){
 const r=lifecycle.verifyCurrent();assert(r.ok,'Generation187 immutable history invalid: '+r.errors.join('; '));assert.equal(r.generation,187);
}else{
 const r=lifecycle.verifyCandidate(gen);assert(r.ok,'Generation187 uncommitted candidate invalid: '+r.errors.join('; '));
}
cp.execFileSync(process.execPath,['tests/editorial-review-233.test.js'],{stdio:'inherit'});
console.log('RELEASE233_GEN187_SUCCESSOR_SCOPE_PASS');
