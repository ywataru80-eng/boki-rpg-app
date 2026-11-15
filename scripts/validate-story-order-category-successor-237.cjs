'use strict';
// Release 237: exact UI-flow and category-disclosure successor to the sealed
// Release236/Generation200 candidate. No question, answer, historical audit
// or learning-state authority may change here.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const path = require('node:path');
const BASE = 'e5b142b9df40e37d736930871c0d61dcc9d4ab1f';
const PREV = '20261107-236';
const RELEASE = '20261115-237';
const GEN200 = 'reports/auto-gate/audit-locks/phase-b-generation-200.json';
const GEN201 = 'reports/auto-gate/audit-locks/phase-b-generation-201.json';
const git = (...args) => cp.execFileSync('git', args, {encoding:'utf8',maxBuffer:24*1024*1024}).trim();
const before = file => cp.execFileSync('git',['show',`${BASE}:${file}`],{maxBuffer:24*1024*1024});
const read = file => fs.readFileSync(file);
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const expectHash = Object.freeze({
  'js/controller.js':'bd6e54fe3092e0cd5bf3bc85c9241043f38ec6bc3033aac09b044100ca36a2b6',
  'js/view.js':'8fe743d0f29a4ba03ba74bbc6d12fc1e93e5b7b0a6d03f3846a447fe98161aec',
  'tests/preanswer-category-leak.test.js':'67dbbf2ed99a99abbd4e9208b6c958faf9ab568bcfee1c95e782fbd403f1cee6',
  'tests/story-next-ordered.test.js':'f1fce2a7d0ba9b6fdfade18f269997dd55bd52d6b6869fb240d948b5b5bd0add'
});
assert.equal(cp.spawnSync('git',['merge-base','--is-ancestor',BASE,'HEAD']).status,0,
  'sealed Release236/Generation200 must be an ancestor');
assert(read(GEN200).equals(before(GEN200)),'Gen200 immutable authority must retain exact bytes');
const allowed=new Set([
  'js/controller.js','js/view.js','tests/preanswer-category-leak.test.js','tests/story-next-ordered.test.js','package.json',
  'index.html','form-a.html','service-worker.js','pwa-release-manifest.json',GEN201,
  'scripts/validate-story-order-category-successor-237.cjs',
  '.github/workflows/question-quality-ledger-audit.yml',
  'tests/editorial-review-230.test.js','tests/editorial-review-232.test.js','tests/editorial-review-233.test.js',
  'tests/ledger-opening-migration.test.js','tests/l039-explanation.test.js',
  'tests/editorial-review-234.test.js','tests/issue161-inventory.test.js',
  'tests/user-facing-copy-contract.test.js','tests/audit-matrix.test.js',
  '.github/visual/run-content-progress-migration.js'
]);
const changed=git('diff','--name-only',BASE).split(/\n/u).filter(Boolean);
const untracked=git('ls-files','--others','--exclude-standard').split(/\n/u)
  .filter(file=>!file.startsWith('artifacts/')&&!file.startsWith('reports/baseline-current/')&&!file.startsWith('historical-quality/')&&!file.startsWith('node_modules/'));
const all=[...new Set([...changed,...untracked])].sort();
assert(all.every(file=>allowed.has(file)), 'out-of-scope Release237 changes: '+all.filter(file=>!allowed.has(file)).join(', '));
for(const file of [...allowed].filter(file=>file!=='scripts/validate-story-order-category-successor-237.cjs')){
  assert(fs.existsSync(file),'Release237 required file missing: '+file);
}
assert(!fs.existsSync('.github/workflows/qa-source-snapshot-20261115.yml'),
  'temporary QA source-export workflow must not ship');
// Historical tests remain intact: the sole accepted change to each test is to
// recognize this successor release where its predecessor's semantics still hold.
const inherited = Object.freeze({
  'tests/editorial-review-230.test.js': ["'20261107-236'].includes", "'20261107-236','20261115-237'].includes"],
  'tests/editorial-review-232.test.js': ["'20261107-236'].includes", "'20261107-236','20261115-237'].includes"],
  'tests/editorial-review-233.test.js': ["'20261107-236'].includes", "'20261107-236','20261115-237'].includes"],
  'tests/ledger-opening-migration.test.js': ["'20261107-236'].includes", "'20261107-236','20261115-237'].includes"],
  'tests/l039-explanation.test.js': [["'20261107-236'].includes", "'20261107-236','20261115-237'].includes"],["release==='20261107-236'", "['20261107-236','20261115-237'].includes(release)"]],
  'tests/editorial-review-234.test.js': ["release==='20261107-236'", "['20261107-236','20261115-237'].includes(release)"],
  'tests/issue161-inventory.test.js': ["release==='20261107-236'", "['20261107-236','20261115-237'].includes(release)"],
  'tests/user-facing-copy-contract.test.js': [["['20261105-235','20261107-236'].includes(manifest.release)", "['20261105-235','20261107-236','20261115-237'].includes(manifest.release)"],["only the validated Release235 baseline and explicit Release236 successor are supported", "only explicitly validated releases may be used"]],
  'tests/audit-matrix.test.js': [[".release==='20261107-236'?", ".release==='20261107-236'||JSON.parse(fs.readFileSync('pwa-release-manifest.json','utf8')).release==='20261115-237'?"],["const release236=JSON.parse(fs.readFileSync('pwa-release-manifest.json','utf8')).release==='20261107-236';", "const release236=['20261107-236','20261115-237'].includes(JSON.parse(fs.readFileSync('pwa-release-manifest.json','utf8')).release);"],["'20261107-236':'scripts/validate-issue256-successor-236.cjs'", "'20261107-236':'scripts/validate-issue256-successor-236.cjs',\n  '20261115-237':'scripts/validate-story-order-category-successor-237.cjs'"]],
  '.github/visual/run-content-progress-migration.js': [["release==='20261107-236'?6:5", "['20261107-236','20261115-237'].includes(release)?6:5"],["['20261105-235','20261107-236'].includes(release)", "['20261105-235','20261107-236','20261115-237'].includes(release)"]]
});
for(const [file,changes] of Object.entries(inherited)){
  let expected=before(file).toString('utf8');
  const edits=typeof changes[0]==='string'?[changes]:changes;
  for(const [oldText,newText] of edits){
    assert(expected.includes(oldText),file+' historical scope anchor missing');
    expected=expected.replaceAll(oldText,newText);
  }
  assert.equal(read(file).toString('utf8'),expected,file+' only inherited release routing is allowed');
}

for(const [file,digest] of Object.entries(expectHash)) assert.equal(sha(read(file)),digest, file+' exact reviewed source hash drift');
const manifest=JSON.parse(read('pwa-release-manifest.json'));
const previous=JSON.parse(before('pwa-release-manifest.json'));
assert.equal(previous.release,PREV);
assert.equal(manifest.release,RELEASE);
assert.equal(manifest.previousRelease,PREV);
assert.deepEqual(Object.keys(manifest.assets).sort(),Object.keys(previous.assets).sort());
assert.deepEqual(Object.keys(manifest.pages).sort(),Object.keys(previous.pages).sort());
for(const [file,digest] of Object.entries({...manifest.assets,...manifest.pages}))
  assert.equal(sha(read(file)),digest,'Release237 PWA asset drift: '+file);
for(const file of ['index.html','form-a.html','service-worker.js'])
  assert.equal(read(file).toString('utf8'),before(file).toString('utf8').replaceAll(PREV,RELEASE),
    file+' may change release marker only');
const original=JSON.parse(before('package.json'));
const updated=JSON.parse(read('package.json'));
const a='node tests/preanswer-category-leak.test.js && node tests/exam-points-visible.test.js';
const b='node tests/preanswer-category-leak.test.js && node tests/story-next-ordered.test.js && node tests/exam-points-visible.test.js';
assert.equal(original.scripts.test.split(a).length,2,'original suite entry must be unique');
original.scripts.test=original.scripts.test.replace(a,b);
assert.deepEqual(updated,original,'package.json may only add the new regression test to the full suite');
const priorWorkflow=before('.github/workflows/question-quality-ledger-audit.yml').toString('utf8');
const oldLine="'20261107-236': 'scripts/validate-issue256-successor-236.cjs'";
const newLine=oldLine+",\n            '20261115-237': 'scripts/validate-story-order-category-successor-237.cjs'";
assert.equal(priorWorkflow.split(oldLine).length,2,'prior strict ledger mapping must be unique');
assert.equal(read('.github/workflows/question-quality-ledger-audit.yml').toString('utf8'),
  priorWorkflow.replace(oldLine,newLine),'Ledger route must only add new validator; prior release checks retained');
const gen=JSON.parse(read(GEN201));
assert.equal(gen.generation,201);
assert.equal(gen.predecessor.generation,200);
const lifecycle=require('./qa/phase-b-lifecycle');
const committed=cp.spawnSync('git',['cat-file','-e','HEAD:'+GEN201],{encoding:'utf8'}).status===0;
const verified=committed?lifecycle.verifyCurrent():lifecycle.verifyCandidate(gen);
assert(verified.ok,'Generation201 integrity: '+verified.errors.join('; '));
cp.execFileSync(process.execPath,['tests/preanswer-category-leak.test.js'],{stdio:'inherit'});
cp.execFileSync(process.execPath,['tests/story-next-ordered.test.js'],{stdio:'inherit'});
console.log('RELEASE237_GEN201_STRICT_SUCCESSOR_PASS');
