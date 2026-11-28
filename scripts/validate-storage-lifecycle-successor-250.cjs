'use strict';
// Release250: revoke replaced storage sessions and constrain recovery.
const assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process'),crypto=require('node:crypto');
const BASE='044b2df4554f870b8d95d27540d4174bf90a5e62',GEN='reports/auto-gate/audit-locks/phase-b-generation-214.json';
const expected=Object.freeze({
  ".github/visual/run-content-progress-migration.js": "762e4e5dfdf0d23fba1345bf14f1e323ace25234cc68d1b5cd2a12b291a0b1ef",
  ".github/visual/run-storage-upgrade.js": "02c821a63c9843d79048137766e29bedafe209c95b7d2220d39d5c74b69e1dde",
  ".github/workflows/question-quality-ledger-audit.yml": "5d5b3dd1c88e897159caac52f24d3793e7f857555929b4ac51cd610608b6eaaf",
  "form-a.html": "c0bcf8d003aaa25c48b13ac1bb3a6ff8b0f0205855d96daf6c20d10f3d2b985d",
  "index.html": "214891ed5212ff00100e9b32db6ea8538bda26da34964132186dbbdb86030b5c",
  "js/annual-storage.js": "a2ce0f5c9656269f7eeac5464814b9d475514ac0d2c8fc66d31c1f68293d6f37",
  "js/controller.js": "04826dec840ecdc2a3a9d54726f83ff63fafe0501ab5b657ac6d329946c00676",
  "package.json": "75b07e4ad72b5c4154dabe77e9d165e90a1ef747cbd3221dcb4a86a23d87f00a",
  "pwa-release-manifest.json": "51d5dfa7dd927b58e9d9e591b5fce612956251e27a327c8e4320b3e2bb20b906",
  "service-worker.js": "61e3092c27d049f321975761aa49044501c9f5178cfb5223ea415c29083b41e9",
  "tests/annual-storage-lifecycle.test.cjs": "ea6e88e86480fd35ace5413b43dc4d96118b22e94a034be224fe2e272e3427fe",
  "tests/audit-matrix.test.js": "72c4eb767cf293ad7e9304cbe34efe52dd3558bf76b11d92f2c1f57d40b7cbb9",
  "tests/editorial-review-230.test.js": "341ee9a944026dd03d31622aaeb8e0719f527c22c4179e17f181563a335c82b1",
  "tests/editorial-review-232.test.js": "81268e72296fc291891ed309621ea5353769d908fb6aa7d20afeee71b2eb620f",
  "tests/editorial-review-233.test.js": "17e08272fb0ce2fd1e6fe932af521d9e44e2e238b4210fc80bc75f03b1c7f1e1",
  "tests/editorial-review-234.test.js": "611a39354bc58176b77a5bf2c04055c7ba30d5556e3c0a19a483cc547184862d",
  "tests/issue161-inventory.test.js": "e4c0b665da50bdf0202581f277f9c0e5754ffc9223fe964232404c22a103dc85",
  "tests/l039-explanation.test.js": "27f34fdf59f05fae90622d4c8cd38b30782440687b97c11da2b93c4934adc541",
  "tests/ledger-opening-migration.test.js": "ccc190515a0850659dc7e008e7134899b1297089934bc70b9649f103904a965f",
  "tests/user-facing-copy-contract.test.js": "090aa5dae74aa1fbecf678968e0cf6e6249d9906bd363f4550114d86ea747c0a"
});
const git=(...a)=>cp.execFileSync('git',a,{encoding:'utf8',maxBuffer:32*1024*1024}).trim();
assert.equal(cp.spawnSync('git',['merge-base','--is-ancestor',BASE,'HEAD']).status,0);
for(const p of ['reports/auto-gate/audit-locks/phase-b-generation-213.json','scripts/validate-annual-storage-successor-249.cjs'])assert(fs.readFileSync(p).equals(cp.execFileSync('git',['show',BASE+':'+p])),p+' historical bytes');
const changed=git('diff','--name-only',BASE).split('\n').filter(Boolean),untracked=git('ls-files','--others','--exclude-standard').split('\n').filter(p=>p&&!['node_modules/','artifacts/','historical-quality/','reports/baseline-current/'].some(prefix=>p.startsWith(prefix)));
assert.deepEqual([...new Set([...changed,...untracked])].sort(),[...Object.keys(expected),GEN,'scripts/validate-storage-lifecycle-successor-250.cjs'].sort(),'exact Release250 scope');
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
for(const [p,h] of Object.entries(expected))assert.equal(sha(p),h,p+' exact successor content');
const m=JSON.parse(fs.readFileSync('pwa-release-manifest.json','utf8'));assert.equal(m.release,'20261128-250');assert.equal(m.previousRelease,'20261127-249');for(const k of ['assets','pages'])for(const [p,h] of Object.entries(m[k]))assert.equal(sha(p),h,p+' manifest hash');
const gen=JSON.parse(fs.readFileSync(GEN,'utf8'));assert.equal(gen.generation,214);assert.equal(gen.predecessor.generation,213);
const l=require('./qa/phase-b-lifecycle'),committed=cp.spawnSync('git',['cat-file','-e','HEAD:'+GEN]).status===0;
const check=committed?l.verifyCurrent():l.verifyCandidate(gen);assert(check.ok,check.errors.join('; '));
for(const p of ['tests/annual-storage-lifecycle.test.cjs','tests/annual-storage.test.cjs','tests/annual-storage-integration.test.cjs','tests/fy2027-curriculum-registry.test.cjs'])cp.execFileSync(process.execPath,[p],{stdio:'inherit'});
console.log('RELEASE250_GEN214_STORAGE_LIFECYCLE_PASS');
