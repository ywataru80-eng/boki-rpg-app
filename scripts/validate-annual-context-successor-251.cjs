'use strict';
// Release251 candidate: atomic annual slot identity and guarded writes.
const assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process'),crypto=require('node:crypto');
const BASE='f9709ae15765fe35aabf221776e6e844f3667870',GEN='reports/auto-gate/audit-locks/phase-b-generation-215.json';
const expected=Object.freeze({
  ".github/workflows/question-quality-ledger-audit.yml": "fdbbedd6582083a37d74ba5440b3a6a761c2e7b635640004fcf3301541bf6e58",
  "form-a.html": "3914650aa2e5c69ef6d54284e11a3fcb164cc4ed07407e83fea46f5e9c246d96",
  "index.html": "2393108f8431d2e468a223eb530d7565e0c0196958ad0dc9981b72ba99a13586",
  "js/annual-storage.js": "013cab9ce64a2b28e8c7c089b55f1c297aea0851860766d8f0f6afaabd372c69",
  "js/app.js": "a66750d4fb3f24b173bc10d7e28663465d0c1a9106c5b8e021af3557b2e60909",
  "js/controller.js": "f7bff1e95f7d661db6b6d186453574c87b0dc6369a51577528ae203321afbc7e",
  "package.json": "f5f1be4a9f76babcc167c548795f44d0c1e4a3db75ee9b18236c66dc129bf917",
  "pwa-release-manifest.json": "dc1d56aefa06c3da1f28a1ed05905387dbe3c88c2bf12ab634b52f624431f36c",
  "service-worker.js": "dd61f8e906ba1d6ab28d9237456bc5804fd257913acfe9b1349b6ca49174451e",
  "tests/annual-context-candidate.test.cjs": "33e7bc08cc9eeecd3931dcdaf5a59d6a40a80db5613901c4743e73b4d86722c9",
  "tests/audit-matrix.test.js": "7a93ae03ac6868d790927e3b55503040f2e3e723209797f7f90c607e2b708f60",
  "tests/editorial-review-230.test.js": "7fbb0ff078708aef8963a96cdc7a2e25abb2a716b85f208d1c5f1a10cc422372",
  "tests/editorial-review-232.test.js": "20f9fbd7c0fd43a08affe98e3ed799c7e74a37bcbb03f34a50698f0c95c05f33",
  "tests/editorial-review-233.test.js": "d96af73a7311c29ab6e07b0924699d068d4611793877e4c4c2f5168f8342337f",
  "tests/editorial-review-234.test.js": "cf405509e90c007dd3e8b5e65eb625048d9d60a65ab5f4824ef9a86ad4a0af89",
  "tests/issue161-inventory.test.js": "fcf569b31a2a7903e9824c0fb6452fb5da818228edb440df222d4d4ac4bc1f1f",
  "tests/l039-explanation.test.js": "888ff870c25df206081a3bba858e024917c471723051abf0c21d9c24c6848383",
  "tests/ledger-opening-migration.test.js": "9b85ea779392bc22b414021a2a13f448d74ca704b7bee9a3bf1ec4f5beb821de",
  "tests/user-facing-copy-contract.test.js": "859c6a8192a978ebed7518266bfe36b256688e268a4272d340437493de6177a2"
});
const git=(...a)=>cp.execFileSync('git',a,{encoding:'utf8',maxBuffer:32*1024*1024}).trim();
assert.equal(cp.spawnSync('git',['merge-base','--is-ancestor',BASE,'HEAD']).status,0);
for(const p of ['reports/auto-gate/audit-locks/phase-b-generation-214.json','scripts/validate-storage-lifecycle-successor-250.cjs'])assert(fs.readFileSync(p).equals(cp.execFileSync('git',['show',BASE+':'+p])),p+' historical bytes');
const changed=git('diff','--name-only',BASE).split('\n').filter(Boolean),untracked=git('ls-files','--others','--exclude-standard').split('\n').filter(p=>p&&!['node_modules/','artifacts/','historical-quality/','reports/baseline-current/'].some(prefix=>p.startsWith(prefix)));
assert.deepEqual([...new Set([...changed,...untracked])].sort(),[...Object.keys(expected),GEN,'scripts/validate-annual-context-successor-251.cjs'].sort(),'exact Release251 scope');
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
for(const [p,h] of Object.entries(expected))assert.equal(sha(p),h,p+' exact successor content');
const m=JSON.parse(fs.readFileSync('pwa-release-manifest.json','utf8'));assert.equal(m.release,'20261128-251');assert.equal(m.previousRelease,'20261128-250');for(const k of ['assets','pages'])for(const [p,h] of Object.entries(m[k]))assert.equal(sha(p),h,p+' manifest hash');
const gen=JSON.parse(fs.readFileSync(GEN,'utf8'));assert.equal(gen.generation,215);assert.equal(gen.predecessor.generation,214);
const l=require('./qa/phase-b-lifecycle'),committed=cp.spawnSync('git',['cat-file','-e','HEAD:'+GEN]).status===0;
const check=committed?l.verifyCurrent():l.verifyCandidate(gen);assert(check.ok,check.errors.join('; '));
for(const p of ['tests/annual-context-candidate.test.cjs','tests/annual-storage-lifecycle.test.cjs','tests/annual-storage.test.cjs','tests/annual-storage-integration.test.cjs','tests/fy2027-curriculum-registry.test.cjs'])cp.execFileSync(process.execPath,[p],{stdio:'inherit'});
console.log('RELEASE251_GEN215_ANNUAL_CONTEXT_PASS');
