'use strict';
// Release249: preserve committed Gen212 authority and protect wrong-answer history.
const assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process'),crypto=require('node:crypto');
const BASE='5c849890b56a22cbb521f214e0ea4f9baa6a4801',GEN='reports/auto-gate/audit-locks/phase-b-generation-213.json';
const expected=Object.freeze({
  ".github/visual/run-content-progress-migration.js": "d8c973f225f34b659b1264b70697f21888824c0084b74b1dbc643ceb2bfa5a8d",
  ".github/workflows/question-quality-ledger-audit.yml": "6977dcd6483031b71f723f0e731d835b37114f0fd011e3fd09a860af198c7d59",
  "form-a.html": "5e1ab9fcfe9362a87d6332a57657496f8fcc6d9d3f6689dd8edc98ac75eb060b",
  "index.html": "cf69103d04040728b398c07a4e115eb065e8ce1987f3ed86bd301dc984a9a686",
  "js/annual-storage.js": "91941324f0a7679f9bb47b52ffe5d4e7cb42637907b3744d7d42a51a17101542",
  "js/controller.js": "d579d599550cfde739b6e7968c1bd5bc60b54212b0d5fbe0115b969d6b77075d",
  "pwa-release-manifest.json": "03d25f7ef2a2a9e56f133f423ec10e76ff050196a093621eeba1da11968eb7b8",
  "service-worker.js": "7feb8c407dbe1da848645910d9cbc306f0a7b876bd0a46c55dfbe01f7b635d2a",
  "tests/annual-storage-integration.test.cjs": "21516ecccbbe2ba82a3c441aade25bc34785a6477bbc36963d15ac6a475fd193",
  "tests/annual-storage.test.cjs": "369d3819359424c7057c0d316b4bc13c3c6c72aa53f392eb0a483e16743a53e0",
  "tests/audit-matrix.test.js": "5e6080db749a1d6ea37654d85976865fcdafea31cc425029c1b5f233d1e74b14",
  "tests/editorial-review-230.test.js": "0c97817dead8db7bc4a04b978d446ccbcee96d44f09cf56be6a1a41445b2d25e",
  "tests/editorial-review-232.test.js": "b52e4aa371dad6dbb4ed4338e2d4dae6dfdd29debd9564a1b8040e1eaf98f287",
  "tests/editorial-review-233.test.js": "c50dcb4a7f8e5b0aed6cf87953d6d22317345b774401af7c4ce1f075d31877fb",
  "tests/editorial-review-234.test.js": "d35c19ceb6b5e94e946096a1b30f3939fa9686387cc4239ed89b161656f4fd85",
  "tests/foundation-extension-contract.test.js": "32d51aacbbc552ff405ade8e57f2ad2b64d3114c4350cf2ca887ed60510cf715",
  "tests/issue161-inventory.test.js": "00c74d90ab5d3f04b50f3ad89509bdb348aeb01cf58647cdab94324be58ee12d",
  "tests/l039-explanation.test.js": "5e45e7380df3ad2d04e07a86bd9d6b928f611e5fdfa049503a349d40e125e07d",
  "tests/ledger-opening-migration.test.js": "32c6a735a6c0c991ebe2f2653cdd258b357eb8a3223f23857fcedc4823c12e8e",
  "tests/storage-ownership.test.js": "7f663f622fe666547bda25d916765704886b348e76218df1b4db1ec9305cefb5",
  "tests/user-facing-copy-contract.test.js": "0ce49b0437e50d2eaf9252c8db23b489e55c2ba931407f5fa7308b62d32cb606"
});
const git=(...a)=>cp.execFileSync('git',a,{encoding:'utf8',maxBuffer:32*1024*1024}).trim();
assert.equal(cp.spawnSync('git',['merge-base','--is-ancestor',BASE,'HEAD']).status,0);
for(const p of ['reports/auto-gate/audit-locks/phase-b-generation-212.json','scripts/validate-annual-storage-successor-248.cjs'])assert(fs.readFileSync(p).equals(cp.execFileSync('git',['show',BASE+':'+p])),p+' historical bytes');
const changed=git('diff','--name-only',BASE).split('\n').filter(Boolean),untracked=git('ls-files','--others','--exclude-standard').split('\n').filter(p=>p&&!['node_modules/','artifacts/','historical-quality/','reports/baseline-current/'].some(prefix=>p.startsWith(prefix)));
assert.deepEqual([...new Set([...changed,...untracked])].sort(),[...Object.keys(expected),GEN,'scripts/validate-annual-storage-successor-249.cjs'].sort(),'exact Release249 scope');
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
for(const [p,h] of Object.entries(expected))assert.equal(sha(p),h,p+' exact successor content');
const m=JSON.parse(fs.readFileSync('pwa-release-manifest.json','utf8'));assert.equal(m.release,'20261127-249');assert.equal(m.previousRelease,'20261127-248');for(const k of ['assets','pages'])for(const [p,h] of Object.entries(m[k]))assert.equal(sha(p),h,p+' manifest hash');
const gen=JSON.parse(fs.readFileSync(GEN,'utf8'));assert.equal(gen.generation,213);assert.equal(gen.predecessor.generation,212);
const l=require('./qa/phase-b-lifecycle'),committed=cp.spawnSync('git',['cat-file','-e','HEAD:'+GEN]).status===0;
const check=committed?l.verifyCurrent():l.verifyCandidate(gen);assert(check.ok,check.errors.join('; '));
for(const p of ['tests/annual-storage.test.cjs','tests/annual-storage-integration.test.cjs','tests/fy2027-curriculum-registry.test.cjs'])cp.execFileSync(process.execPath,[p],{stdio:'inherit'});
console.log('RELEASE249_GEN213_ANNUAL_STORAGE_PASS');
