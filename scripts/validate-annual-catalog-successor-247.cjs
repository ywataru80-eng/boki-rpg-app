'use strict';
// Release247: isolate annual curriculum candidates; preserve historical Gen210.
const assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process'),crypto=require('node:crypto');
const BASE='cbec0ecc5cc8003b6b69ebd321b9ba727e9da954',GEN='reports/auto-gate/audit-locks/phase-b-generation-211.json';
const expected=Object.freeze({
  ".github/visual/run-content-progress-migration.js": "942d0abac0c29df7085e25bdafbc2a37d49a38ecc54649468740e9ffc9cda4e0",
  ".github/workflows/question-quality-ledger-audit.yml": "4761b6516173d8cec3f7b026f2ac80c486fbc3e494c51d7904f19b7a6f2eb353",
  "data/fy2027-curriculum.js": "25fce26192177202fa0d07eede72e2e695f47fc5bb7e7ab51efe902fe9832d10",
  "form-a.html": "cee649dae188b4714555ab322853f98ba78ae975b2b9d26d7dcde216e091d580",
  "index.html": "244e072f47263a27abfee36c3d00333a96ad6ba4ba88e2d29d82eddbf085cea2",
  "js/app.js": "e544bb3c4542c1801f086722faa63443d379fc11291c1dab0e5361c7a44bf561",
  "js/controller.js": "53159cf999dde4e520a634fdf8cca23dad48056fa2cc35d97d428e384329f598",
  "js/view.js": "bccb867af5ba9bfc1a0d774752be07278cc855606dbd80ad7f0c7e13b04dc2a7",
  "package.json": "eb5492534c4f3b976abbd8a4223f048763488955521b11b6c2f32af2b8c9f05c",
  "pwa-release-manifest.json": "3b3789f0462e30aeea28e7a4710895b7a70b59da64c13105afefcb30f0f696e3",
  "service-worker.js": "7d16aa9de3480d48ca22147e2729da44f0e6b87631e1272ac18151bad9dd05ca",
  "tests/audit-matrix.test.js": "b24c176a526bcf952824074916a4e9e33a3c8f7e4238ce50072c68ca8a597f87",
  "tests/editorial-review-230.test.js": "3bb6f966511baab4109795f05e0129a80fe5e6b37cb5df6d5548863b841e2f6e",
  "tests/editorial-review-232.test.js": "2accd67ff34f69e18ee5487df51fd3237b06dcaa3ac21cad58f355f3d9b37dc3",
  "tests/editorial-review-233.test.js": "f659b4c946eac9e06bdc7f15a3b8fab6d9ed07af94fa26226629f69f1898f1d9",
  "tests/editorial-review-234.test.js": "d02c52564c35c20335b1616d8627d8017e6ad62ea5565586e40c96f940fda1cf",
  "tests/fy2027-curriculum-registry.test.cjs": "b59cef8a4237819f695aceb1df3adf9140137db1d0f23a449a2fe5f80fb1516f",
  "tests/fy2027-visible-derive.cjs": "09e91ba556f9c4364a349f5d6cf313be49713be516559612e86d4de913ad8555",
  "tests/issue161-inventory.test.js": "22e29b1dab792b41435c42f6cd3ab64f999a5de1504f88114433be1e3ad89eac",
  "tests/l039-explanation.test.js": "095f6ce6acb79feb57906fcf4036f6ac0165260eeac039e6bf67a395ed21c546",
  "tests/ledger-opening-migration.test.js": "8b4ba8b4d01e35345e1e40f052aaa101e790d8aab774ab7935dbf870f6d59a9a",
  "tests/storage-ownership.test.js": "a6c4abbd4407a5a22f4f794c5fea9fea1c9cc75aeb01225e8cd338aac7798156",
  "tests/user-facing-copy-contract.test.js": "403bd9d44886534666ccf6f8be69cb77740fb2719674fb8a4884b019f783c7ed"
});
const git=(...a)=>cp.execFileSync('git',a,{encoding:'utf8',maxBuffer:32*1024*1024}).trim();
assert.equal(cp.spawnSync('git',['merge-base','--is-ancestor',BASE,'HEAD']).status,0);
const changed=git('diff','--name-only',BASE).split('\n').filter(Boolean),untracked=git('ls-files','--others','--exclude-standard').split('\n').filter(p=>p&&!['node_modules/','artifacts/','historical-quality/','reports/baseline-current/'].some(prefix=>p.startsWith(prefix)));
assert.deepEqual([...new Set([...changed,...untracked])].sort(),[...Object.keys(expected),GEN,'scripts/validate-annual-catalog-successor-247.cjs'].sort(),'exact Release247 scope');
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
for(const [p,h] of Object.entries(expected))assert.equal(sha(p),h,p+' exact successor content');
const m=JSON.parse(fs.readFileSync('pwa-release-manifest.json','utf8'));assert.equal(m.release,'20261126-247');assert.equal(m.previousRelease,'20261126-246');for(const k of ['assets','pages'])for(const [p,h] of Object.entries(m[k]))assert.equal(sha(p),h,p+' manifest hash');
const gen=JSON.parse(fs.readFileSync(GEN,'utf8'));assert.equal(gen.generation,211);assert.equal(gen.predecessor.generation,210);
const l=require('./qa/phase-b-lifecycle'),committed=cp.spawnSync('git',['cat-file','-e','HEAD:'+GEN]).status===0;
const check=committed?l.verifyCurrent():l.verifyCandidate(gen);assert(check.ok,check.errors.join('; '));
cp.execFileSync(process.execPath,['tests/fy2027-curriculum-registry.test.cjs'],{stdio:'inherit'});
console.log('RELEASE247_GEN211_ANNUAL_CATALOG_PASS');
