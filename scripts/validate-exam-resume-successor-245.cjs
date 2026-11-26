'use strict';
// Release245: persisted exam resume eligibility and browser prerequisite acceptance; Release244 historical authority preserved.
const assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process'),crypto=require('node:crypto');
const BASE='a2b93fa52aca3a23a8ad337aa05782721c486daa',GEN='reports/auto-gate/audit-locks/phase-b-generation-209.json';
const expected=Object.freeze({
  ".github/visual/run-content-progress-migration.js": "b8368bc0d145627a4155ae730824135cd6afbfa6f8363b182d48bc11a2cac030",
  ".github/visual/run-learning-effectiveness.js": "6b629861bb47b3bbc094aa766445f758ade498126f264d27a9f0bd67136d119e",
  ".github/workflows/question-quality-ledger-audit.yml": "202315f0e15f2d3d664d512b44355b9ade51e1362fcf83312629258d164fb308",
  "form-a.html": "17d78dcdfafa8b000440381fc6639ead77f052754ab95fa15320022dfc9c4925",
  "index.html": "238f18010655d7b0b3768d596549e36d252b6b3fd48a1db95a51452ed8326db6",
  "js/controller.js": "c54269cbba14c46b26c3e03180d9197761d4ea05987ea54aa6830037a263aeff",
  "pwa-release-manifest.json": "7751e5e9f19026b6b2a9c08554aab89b147be598fbc827574755338685802ab7",
  "service-worker.js": "3207f8d2d626c449cc227242fb0c15df2600d79882b6850e5085f7c394eb8a2d",
  "tests/audit-matrix.test.js": "2ef604d0d4b9e285f45e875e11c2e6697830f25fe870c1facc6271f42f2f8ec1",
  "tests/editorial-review-230.test.js": "d1dc36611685093eb7ccbd89dda54d4af0813d3e794461597a161efb46b41a43",
  "tests/editorial-review-232.test.js": "5a58adeefc565dfdd7f83fc3f96f1d489837327fa9625e3efd1ca0974f2ff211",
  "tests/editorial-review-233.test.js": "9ca77174de7877cb153b689d4fd964490df7baa009bfa2bd259c56f6749e54d0",
  "tests/editorial-review-234.test.js": "760028423796af17134422eef9103cf42e51826d714af8df2d1429c73693235f",
  "tests/issue161-inventory.test.js": "8062b098f40be93a569707aad2d59647b40f4cfcefbebaebdd5402584f74ac43",
  "tests/issue259-exam-start-transaction.test.cjs": "690ce36692330b46d434993b9437dc6779949656ff32b79919ceb1795a40e8c7",
  "tests/l039-explanation.test.js": "ee2933d968c6aebb91ff78fdf87cc9250c5437c1a802d04cf106ce2526b0ce76",
  "tests/ledger-opening-migration.test.js": "6fc2aca5733d4f7e990583a23c95e8d2f474c5075dabbe05bfbfdfe184217a0e",
  "tests/user-facing-copy-contract.test.js": "17a0888ae783ede0e4f84b1e5fa83c53faab820f4c11573d8b4cf058f9275166"
} );
const git=(...a)=>cp.execFileSync('git',a,{encoding:'utf8',maxBuffer:32*1024*1024}).trim();
assert.equal(cp.spawnSync('git',['merge-base','--is-ancestor',BASE,'HEAD']).status,0);
const changed=git('diff','--name-only',BASE).split('\n').filter(Boolean),untracked=git('ls-files','--others','--exclude-standard').split('\n').filter(p=>p&&!['node_modules/','artifacts/','historical-quality/','reports/baseline-current/'].some(prefix=>p.startsWith(prefix)));
assert.deepEqual([...new Set([...changed,...untracked])].sort(),[...Object.keys(expected),GEN,'scripts/validate-exam-resume-successor-245.cjs'].sort(),'exact Release245 scope');
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
for(const [p,h] of Object.entries(expected))assert.equal(sha(p),h,p+' exact successor content');
const m=JSON.parse(fs.readFileSync('pwa-release-manifest.json','utf8'));assert.equal(m.release,'20261126-245');assert.equal(m.previousRelease,'20261126-244');for(const k of ['assets','pages'])for(const [p,h] of Object.entries(m[k]))assert.equal(sha(p),h,p+' manifest hash');
const gen=JSON.parse(fs.readFileSync(GEN,'utf8'));assert.equal(gen.generation,209);assert.equal(gen.predecessor.generation,208);
const l=require('./qa/phase-b-lifecycle'),committed=cp.spawnSync('git',['cat-file','-e','HEAD:'+GEN]).status===0;
const check=committed?l.verifyCurrent():l.verifyCandidate(gen);assert(check.ok,check.errors.join('; '));
cp.execFileSync(process.execPath,['tests/issue259-exam-start-transaction.test.cjs'],{stdio:'inherit'});
console.log('RELEASE245_GEN209_EXAM_RESUME_PASS');
