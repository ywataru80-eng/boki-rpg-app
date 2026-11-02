'use strict';
// Release232 / Gen186: strict scope and immutable 300-question successor.
const assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process'),crypto=require('node:crypto');
const BASE='61c06adf3b6a7d59b7cb54a9b74bcc0ddc519dba',OLD='20261102-231',NEXT='20261102-232';
const read=p=>fs.readFileSync(p,'utf8'),sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const changed=cp.execFileSync('git',['diff','--name-only',BASE,'HEAD'],{encoding:'utf8'}).trim().split('\n').filter(Boolean).sort();
assert.deepEqual(changed,[".github/workflows/question-quality-ledger-audit.yml","data/questions.js","form-a.html","index.html","package.json","pwa-release-manifest.json","reports/auto-gate/audit-locks/phase-b-generation-186.json","scripts/validate-reader-editorial-successor-232.cjs","service-worker.js","tests/audit-matrix.test.js","tests/editorial-review-231.test.js","tests/editorial-review-232.test.js","tests/story-anchor-context-regression.test.js","tests/user-facing-copy-contract.test.js"],'Release232 restricted patch scope');
const manifest=JSON.parse(read('pwa-release-manifest.json'));
assert.equal(manifest.release,NEXT);assert.equal(manifest.previousRelease,OLD);
for(const [p,h] of Object.entries({...manifest.assets,...manifest.pages}))assert.equal(sha(p),h,p+' SHA256');
for(const p of ['index.html','form-a.html','service-worker.js']){
 const old=cp.execFileSync('git',['show',BASE+':'+p],{encoding:'utf8'});
 assert.equal(read(p),old.replaceAll(OLD,NEXT),p+' version-only mutation');
}
const gen=JSON.parse(read('reports/auto-gate/audit-locks/phase-b-generation-186.json'));
assert.equal(gen.generation,186);assert.equal(gen.predecessor.generation,185);
const integrity=require('./qa/phase-b-lifecycle').verifyCurrent();
assert(integrity.ok,'Generation186 immutable integrity: '+integrity.errors.join('; '));
cp.execFileSync(process.execPath,['tests/editorial-review-232.test.js'],{stdio:'inherit'});
console.log('RELEASE232_GEN186_SCOPE_PASS');
