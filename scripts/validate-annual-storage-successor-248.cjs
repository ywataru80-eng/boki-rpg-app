'use strict';
// Release248: annual storage preparation and current backup crash recovery.
const assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process'),crypto=require('node:crypto');
const BASE='9d9bd36ffa1ceb4d7c2cd0733392e23201319c2f',GEN='reports/auto-gate/audit-locks/phase-b-generation-212.json';
const expected=Object.freeze({
  ".github/visual/run-content-progress-migration.js": "ba3262b61068bb8079b654ced4c725be25bc800d2c0f2ca3061cf957c37320e7",
  ".github/workflows/question-quality-ledger-audit.yml": "0ad8928debc7ac4bf2c45928303924172512918c2f2f4b559559382d45b0a13e",
  "form-a.html": "493e6bb81d4b970ee53192f15a5ec28f4e69387a9a879254ed974180b6ac23d5",
  "index.html": "7e0516e0565d4030fd762093bb0b83f1b55f98fdca8d81cd956540677bd3be40",
  "js/annual-storage.js": "b0dbb035dcb341c5c8e8e04788b352080193e0e4a8fed130d4cc1d2f75591258",
  "js/controller.js": "d579d599550cfde739b6e7968c1bd5bc60b54212b0d5fbe0115b969d6b77075d",
  "package.json": "d1e1504f2c827d2427769c52d674a4983fa788381e578eaeb371ebc70ba8a6e1",
  "pwa-release-manifest.json": "10f34c648cdac81b36d2c92e4b7363dda9ff82d35ea9d89246cc73b025390865",
  "service-worker.js": "1c15ac1c13a42fb204e5821dc90ed733e8cdde6a7e78c4527fafc26978c81939",
  "tests/annual-storage-integration.test.cjs": "92c007ff06d2c8f19da5c718e16114a7ddd0e0c00d97bdf971c6262a927f9103",
  "tests/annual-storage.test.cjs": "369d3819359424c7057c0d316b4bc13c3c6c72aa53f392eb0a483e16743a53e0",
  "tests/audit-matrix.test.js": "60357d53d901171775e53e1f41323be317f4105963173a0661fa0a72f0ba814f",
  "tests/editorial-review-230.test.js": "2c0ac618b53b0d126795999d1cd2024e97cfd64819a7cdd8cf295fc0672c843d",
  "tests/editorial-review-232.test.js": "707db9bf194935478e6eee5b66f605e349a96b3f06d836b630e65922ff903d19",
  "tests/editorial-review-233.test.js": "189b97ca4f9d8421327ce593f3c7e6405b35b25204552e4c0d6d81e3febc79c2",
  "tests/editorial-review-234.test.js": "8e76d1cb0e28ec3e3eb930c0504e616a600ad7df0c57650ce8b796ba169939c6",
  "tests/foundation-extension-contract.test.js": "32d51aacbbc552ff405ade8e57f2ad2b64d3114c4350cf2ca887ed60510cf715",
  "tests/issue161-inventory.test.js": "562d98b22c47858f3c7923124fa6a3a4ad58ac24ddc30160ad22cd00b0fd1ad6",
  "tests/l039-explanation.test.js": "686b09d2043360bf9441e0324fdaf8e0756972b5131a777ebf7a115f5e178483",
  "tests/ledger-opening-migration.test.js": "a8bc431cd6cb9fce675c22b4b2c8fb00d42ffa7ceb9c520f67173078f39109f4",
  "tests/storage-ownership.test.js": "7f663f622fe666547bda25d916765704886b348e76218df1b4db1ec9305cefb5",
  "tests/user-facing-copy-contract.test.js": "2e8ac0ef828d84c926704efa8413550484b80438e255291f785031a33d430359"
});
const git=(...a)=>cp.execFileSync('git',a,{encoding:'utf8',maxBuffer:32*1024*1024}).trim();
assert.equal(cp.spawnSync('git',['merge-base','--is-ancestor',BASE,'HEAD']).status,0);
const changed=git('diff','--name-only',BASE).split('\n').filter(Boolean),untracked=git('ls-files','--others','--exclude-standard').split('\n').filter(p=>p&&!['node_modules/','artifacts/','historical-quality/','reports/baseline-current/'].some(prefix=>p.startsWith(prefix)));
assert.deepEqual([...new Set([...changed,...untracked])].sort(),[...Object.keys(expected),GEN,'scripts/validate-annual-storage-successor-248.cjs'].sort(),'exact Release248 scope');
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
for(const [p,h] of Object.entries(expected))assert.equal(sha(p),h,p+' exact successor content');
const m=JSON.parse(fs.readFileSync('pwa-release-manifest.json','utf8'));assert.equal(m.release,'20261127-248');assert.equal(m.previousRelease,'20261126-247');for(const k of ['assets','pages'])for(const [p,h] of Object.entries(m[k]))assert.equal(sha(p),h,p+' manifest hash');
const gen=JSON.parse(fs.readFileSync(GEN,'utf8'));assert.equal(gen.generation,212);assert.equal(gen.predecessor.generation,211);
const l=require('./qa/phase-b-lifecycle'),committed=cp.spawnSync('git',['cat-file','-e','HEAD:'+GEN]).status===0;
const check=committed?l.verifyCurrent():l.verifyCandidate(gen);assert(check.ok,check.errors.join('; '));
for(const p of ['tests/annual-storage.test.cjs','tests/annual-storage-integration.test.cjs','tests/fy2027-curriculum-registry.test.cjs'])cp.execFileSync(process.execPath,[p],{stdio:'inherit'});
console.log('RELEASE248_GEN212_ANNUAL_STORAGE_PASS');
