'use strict';
// Release243: exact reviewed draft module only; no official FY2027 activation.
const assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process'),crypto=require('node:crypto');
const BASE='65922ffe0207a3208341521f79d65f5da8d8cc8c',GEN='reports/auto-gate/audit-locks/phase-b-generation-207.json';
const expected=Object.freeze({
  ".github/visual/run-content-progress-migration.js": "69b97bd991ba5ed4f4849c7d06d357c4724f10704307afaa83002955359e9366",
  ".github/workflows/question-quality-ledger-audit.yml": "6978132a4279fa290640a68026bcd1657087553b59d9a7a55f3a7e718700b7c0",
  "data/accounting-oracle.js": "a36a61edf15a105a518d392b68267c6ff9591b929d346517f97a93ede13563a7",
  "form-a.html": "9cdc6658eb076474720dd6e4e7f9e2ba3536ea49ac80bd1a98c22c1a3afe7eaa",
  "index.html": "ee67e5b8871819f8e7b0f9bd251343fbffeecb7a29f37091993ef2bb934a80ec",
  "package.json": "d687f3ef37b4b8729b67c0c5489d8925275b96df2126de44cf77191cf45c20f2",
  "pwa-release-manifest.json": "e339046f28da824c3410cb06eddba7d5c4eb8103bfc2c75d774b21ffe37b989e",
  "service-worker.js": "f0d72e86dc9cfb714b455b213cb53203a87a1cfe9d18dc601bcf08e8ee9625b0",
  "tests/audit-matrix.test.js": "c4df17c525c34e20e955ff2e25ad65889d2fe7063b1fc9a560f1b94988a73b3c",
  "tests/editorial-review-230.test.js": "096cbcdf3307e43f8c4150bbe8a9b5f292111bc90d3610d073dbd580f32e5d35",
  "tests/editorial-review-232.test.js": "6ba1d7bd14617f720b6bafc4a30a99cfd7f0ec5494c3b9a7211d30c089c840e7",
  "tests/editorial-review-233.test.js": "e87f7e60f66f0f60db6289cd8e103e50bd3a6943a4eb850adfec58f28cb0fb89",
  "tests/editorial-review-234.test.js": "1f11f13d92183da00c39e13e5c465fe004daa30041c25f57630d92a770af4df3",
  "tests/fy2027-browser-draft.test.cjs": "c84cf7c2dc2d24779e26b6a59d23965c7472576262a3bf9aed60ea9377c719ee",
  "tests/issue161-inventory.test.js": "44e0c7535bcc06a66d735dd8467ab6cad9e3f5c4e570bd421dd4de6647489f4d",
  "tests/l039-explanation.test.js": "d280f38050e77c6b662e7e3f842bfb41b6f1be453f6e778ab0e67bb2fead3510",
  "tests/ledger-opening-migration.test.js": "d552bb9f41ea1159ee3f91fb00c240d7fa95da39789714fd1652f17a62f6a689",
  "tests/user-facing-copy-contract.test.js": "6124a3cca80da4c64697442414f166a0218cee3937773e83d84ed9200baa6f72"
});
const git=(...a)=>cp.execFileSync('git',a,{encoding:'utf8',maxBuffer:32*1024*1024}).trim();
assert.equal(cp.spawnSync('git',['merge-base','--is-ancestor',BASE,'HEAD']).status,0);
const changed=git('diff','--name-only',BASE).split('\n').filter(Boolean),untracked=git('ls-files','--others','--exclude-standard').split('\n').filter(p=>p&&!['node_modules/','artifacts/','historical-quality/','reports/baseline-current/'].some(prefix=>p.startsWith(prefix)));
assert.deepEqual([...new Set([...changed,...untracked])].sort(),[...Object.keys(expected),GEN,'scripts/validate-fy2027-draft-successor-243.cjs'].sort(),'exact Release243 scope');
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
for(const [p,h] of Object.entries(expected))assert.equal(sha(p),h,p+' exact successor content');
const m=JSON.parse(fs.readFileSync('pwa-release-manifest.json','utf8'));assert.equal(m.release,'20261126-243');assert.equal(m.previousRelease,'20261126-242');for(const k of ['assets','pages'])for(const [p,h] of Object.entries(m[k]))assert.equal(sha(p),h,p+' manifest hash');
const gen=JSON.parse(fs.readFileSync(GEN,'utf8'));assert.equal(gen.generation,207);assert.equal(gen.predecessor.generation,206);
const l=require('./qa/phase-b-lifecycle'),committed=cp.spawnSync('git',['cat-file','-e','HEAD:'+GEN]).status===0;
const check=committed?l.verifyCurrent():l.verifyCandidate(gen);assert(check.ok,check.errors.join('; '));
cp.execFileSync(process.execPath,['tests/fy2027-browser-draft.test.cjs'],{stdio:'inherit'});
console.log('RELEASE243_GEN207_FY2027_DRAFT_PASS');
