'use strict';
// Release246: answer commit at exam deadline; preserve historical Gen209.
const assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process'),crypto=require('node:crypto');
const BASE='f68c087d95479aecef2e7110f78d5ed2ca165b42',GEN='reports/auto-gate/audit-locks/phase-b-generation-210.json';
const expected=Object.freeze({
  ".github/visual/run-content-progress-migration.js": "923b4d89e700ccc804ecdc992b11c04ad08a2681d11bd9c9a7b12386b4413df0",
  ".github/visual/run-learning-effectiveness.js": "a7d020da37be1bc7b69ee527acb1a5e8d11d269197903827a4e1bb130a350afe",
  ".github/workflows/question-quality-ledger-audit.yml": "cc765ef44f78ca703399bfe997956786b311409ea5609289e6466d3930261892",
  "form-a.html": "33a17c01a2b554cd65495ca34deecfa4235d35547421e72d89e500ab243c357f",
  "index.html": "7cbb3e5ce24af3af3c67fe0ed093fd37d98c89599afd35c8ebebabab269d4670",
  "js/controller.js": "5b3fee782a856c80ff93506664908636d93f7743c161b5db4500506084dd039b",
  "pwa-release-manifest.json": "019ed908ea0d6b6a6db134104a7abbb281b026675e355f638f42850baf14da1e",
  "service-worker.js": "37228432eee49cadf3b54843b4de934e5169041b97179e6e7824903aca31d74b",
  "tests/audit-matrix.test.js": "825272deb59012952a401c30ae49f9a34d5c136bc358622663a22905953b787f",
  "tests/editorial-review-230.test.js": "6fe289a0edfa9d4bceea2f1c88f85364de670a7d57a858f4e43b6796fffd4540",
  "tests/editorial-review-232.test.js": "7dcdf0d45424c2a985d0487e36c19b38ccc4897fccf1fe3bc6ce6a9801a74395",
  "tests/editorial-review-233.test.js": "51f2e1b5818a4eea692858edf3e400596a07708e67c8f9dd0a42eb5c99e5615a",
  "tests/editorial-review-234.test.js": "818e21887ac86d81399557e27d5fe306c1c8bec69a5f4eb17980a15846d8a484",
  "tests/issue161-inventory.test.js": "ce353a45976770161bb7f601b1be534e1c7bb7197ebae0d557cb143d283845bb",
  "tests/issue259-exam-start-transaction.test.cjs": "3fb4929fe7060d4c878d87d8b03db01ec7cb2f6bed98614bee2d0d28a1b9c408",
  "tests/l039-explanation.test.js": "ae8846814e1e6e5c7f7818a1e15044bd7f88297a474e542445660f5dd07aa772",
  "tests/ledger-opening-migration.test.js": "c0cc94789034d0f39729ea3c386c559fcbb5fc01eb0a5d6f08d34c7915e3b6b5",
  "tests/user-facing-copy-contract.test.js": "bae7a111111f1dad5570cf534fd690abdbc10001fec02f69c58c076ed9b62593"
} );
const git=(...a)=>cp.execFileSync('git',a,{encoding:'utf8',maxBuffer:32*1024*1024}).trim();
assert.equal(cp.spawnSync('git',['merge-base','--is-ancestor',BASE,'HEAD']).status,0);
const changed=git('diff','--name-only',BASE).split('\n').filter(Boolean),untracked=git('ls-files','--others','--exclude-standard').split('\n').filter(p=>p&&!['node_modules/','artifacts/','historical-quality/','reports/baseline-current/'].some(prefix=>p.startsWith(prefix)));
assert.deepEqual([...new Set([...changed,...untracked])].sort(),[...Object.keys(expected),GEN,'scripts/validate-exam-deadline-successor-246.cjs'].sort(),'exact Release246 scope');
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
for(const [p,h] of Object.entries(expected))assert.equal(sha(p),h,p+' exact successor content');
const m=JSON.parse(fs.readFileSync('pwa-release-manifest.json','utf8'));assert.equal(m.release,'20261126-246');assert.equal(m.previousRelease,'20261126-245');for(const k of ['assets','pages'])for(const [p,h] of Object.entries(m[k]))assert.equal(sha(p),h,p+' manifest hash');
const gen=JSON.parse(fs.readFileSync(GEN,'utf8'));assert.equal(gen.generation,210);assert.equal(gen.predecessor.generation,209);
const l=require('./qa/phase-b-lifecycle'),committed=cp.spawnSync('git',['cat-file','-e','HEAD:'+GEN]).status===0;
const check=committed?l.verifyCurrent():l.verifyCandidate(gen);assert(check.ok,check.errors.join('; '));
cp.execFileSync(process.execPath,['tests/issue259-exam-start-transaction.test.cjs'],{stdio:'inherit'});
console.log('RELEASE246_GEN210_EXAM_DEADLINE_PASS');
