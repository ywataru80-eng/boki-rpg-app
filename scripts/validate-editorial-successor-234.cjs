'use strict';
// Generation188 / Release234: this is a *new* content identity. Historical
// Release230-233 assets remain immutable; only prose and story change.
const assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process'),crypto=require('node:crypto');
const PREDECESSOR='c3689f0529e10519c71073acf6d75ec75bdd253a';
const OLD='20261103-233',NEW='20261103-234';
const GEN='reports/auto-gate/audit-locks/phase-b-generation-188.json';
const git=(...args)=>cp.execFileSync('git',args,{encoding:'utf8'}).trim();
const read=p=>fs.readFileSync(p,'utf8');
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
assert.equal(cp.spawnSync('git',['merge-base','--is-ancestor',PREDECESSOR,'HEAD']).status,0,'Release234 requires exact accepted Release233 history');
const approved=new Set([
 '.github/workflows/question-quality-ledger-audit.yml','data/questions.js','form-a.html','index.html',
 'package.json','pwa-release-manifest.json','service-worker.js',
 'scripts/audit-explanations.js','scripts/qa/contract-runner.js','scripts/validate-editorial-successor-234.cjs',
 'reports/auto-gate/audit-locks/phase-b-generation-188.json',
 'reports/edu-quality/editorial-content-identity-234.json',
 'tests/audit-matrix.test.js','tests/editorial-review-230.test.js','tests/editorial-review-232.test.js',
 'tests/ledger-opening-migration.test.js','tests/l039-explanation.test.js',
 'tests/editorial-review-233.test.js','tests/editorial-review-234.test.js','tests/user-facing-copy-contract.test.js'
]);
const untracked=git('ls-files','--others','--exclude-standard').split(/\n/u).filter(Boolean);
const fixture='historical-quality/';
if(untracked.includes(fixture)){
 assert.equal(process.env.GITHUB_ACTIONS,'true','historical fixture only in CI');
 assert.equal(process.env.GITHUB_JOB,'ledger','historical fixture only in ledger job');
 assert(fs.lstatSync(fixture).isDirectory()&&!fs.lstatSync(fixture).isSymbolicLink(),'historical fixture directory');
 assert.equal(git('-C',fixture,'rev-parse','HEAD'),'37086c6ae6511a249218533375bf6f19dac231d1','historical fixture fixed SHA');
 assert.equal(git('-C',fixture,'status','--porcelain','--untracked-files=all'),'','historical fixture clean');
}
const paths=[...new Set([
 ...git('diff','--name-only',PREDECESSOR,'HEAD').split(/\n/u),
 ...git('diff','--name-only').split(/\n/u),
 ...git('diff','--cached','--name-only').split(/\n/u),
 ...untracked.filter(f=>f!==fixture)
])].filter(Boolean).filter(p=>!p.startsWith('artifacts/')&&!p.startsWith('reports/baseline-current/')).sort();
assert(paths.includes('data/questions.js')&&paths.includes(GEN),'successor must include edited data and new Generation authority');
assert(paths.every(p=>approved.has(p)),'unexpected Release234 files: '+paths.filter(p=>!approved.has(p)).join(','));
const historic=JSON.parse(cp.execFileSync('git',['show',`${PREDECESSOR}:pwa-release-manifest.json`],{encoding:'utf8'}));
assert.equal(historic.release,OLD);assert.equal(historic.previousRelease,'20261102-232');
const manifest=JSON.parse(read('pwa-release-manifest.json'));
assert.equal(manifest.release,NEW);assert.equal(manifest.previousRelease,OLD);
assert.deepEqual(Object.keys(manifest.assets).sort(),Object.keys(historic.assets).sort());
assert.deepEqual(Object.keys(manifest.pages).sort(),Object.keys(historic.pages).sort());
for(const [file,expected] of Object.entries({...manifest.assets,...manifest.pages})){
 assert.equal(hash(file),expected,`${file}: updated PWA digest must match production bytes`);
}
for(const p of ['index.html','form-a.html','service-worker.js']){
 const prior=cp.execFileSync('git',['show',`${PREDECESSOR}:${p}`],{encoding:'utf8'});
 assert.equal(read(p),prior.replaceAll(OLD,NEW),`${p}: version marker only`);
}
for(const p of ['data/accounting-oracle.js','data/accounting-domain.js','js/model.js','js/engine.js','js/rpg.js']){
 assert(fs.readFileSync(p).equals(cp.execFileSync('git',['show',`${PREDECESSOR}:${p}`])),`${p}: scoring/progress/reward authority unchanged`);
}
const meta=JSON.parse(read('reports/edu-quality/editorial-content-identity-234.json'));
assert.equal(meta.release,NEW);assert.equal(meta.predecessorSha,PREDECESSOR);
const currentBlob=git('hash-object','data/questions.js');assert.equal(currentBlob,meta.successorQuestionsGitBlob);
const fromGit=git('rev-parse',`${PREDECESSOR}:data/questions.js`);assert.equal(fromGit,meta.predecessorQuestionsGitBlob);
const originalGen=cp.execFileSync('git',['show',`${PREDECESSOR}:reports/auto-gate/audit-locks/phase-b-generation-187.json`]);
assert(fs.readFileSync('reports/auto-gate/audit-locks/phase-b-generation-187.json').equals(originalGen),'Generation187 raw bytes immutable');
const generation=JSON.parse(read(GEN));assert.equal(generation.schemaVersion,3);assert.equal(generation.generation,188);assert.equal(generation.predecessor.generation,187);
const lifecycle=require('./qa/phase-b-lifecycle');
const committed=cp.spawnSync('git',['cat-file','-e',`HEAD:${GEN}`],{encoding:'utf8'}).status===0;
const check=committed?lifecycle.verifyCurrent():lifecycle.verifyCandidate(generation);
assert(check.ok,'Generation188 authority check: '+check.errors.join('; '));
assert.equal(check.generation===undefined?generation.generation:check.generation,188);
cp.execFileSync(process.execPath,['tests/editorial-review-234.test.js'],{stdio:'inherit'});
console.log('RELEASE234_GEN188_PROSE_ONLY_SCOPE_PASS');
