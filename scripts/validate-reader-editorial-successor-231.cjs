'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process'),crypto=require('node:crypto');
const BASE='fde4d327115666e78a28d1662d74692df55802aa',OLD='20261101-230',NEXT='20261102-231';
const read=p=>fs.readFileSync(p,'utf8'),sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const changed=cp.execFileSync('git',['diff','--name-only',BASE,'HEAD'],{encoding:'utf8'}).trim().split('\n').filter(Boolean).sort();
assert.deepEqual(changed,[".github/workflows/question-quality-ledger-audit.yml","data/questions.js","form-a.html","index.html","package.json","pwa-release-manifest.json","reports/auto-gate/audit-locks/phase-b-generation-185.json","scripts/validate-reader-editorial-successor-231.cjs","service-worker.js","tests/audit-matrix.test.js","tests/editorial-review-231.test.js","tests/user-facing-copy-contract.test.js"],'Release231 scope protection');
const manifest=JSON.parse(read('pwa-release-manifest.json'));
assert.equal(manifest.release,NEXT);assert.equal(manifest.previousRelease,OLD);
for(const [p,h] of Object.entries({...manifest.assets,...manifest.pages}))assert.equal(sha(p),h,p+' SHA256');
for(const p of ['index.html','form-a.html','service-worker.js']){
 const old=cp.execFileSync('git',['show',BASE+':'+p],{encoding:'utf8'});
 assert.equal(read(p),old.replaceAll(OLD,NEXT),p+' version-only mutation');
}
const g=JSON.parse(read('reports/auto-gate/audit-locks/phase-b-generation-185.json'));
assert.equal(g.generation,185);assert.equal(g.predecessor.generation,184);
const integrity=require('./qa/phase-b-lifecycle').verifyCurrent();
assert(integrity.ok,'Generation185 immutable integrity: '+integrity.errors.join('; '));
cp.execFileSync(process.execPath,['tests/editorial-review-231.test.js'],{stdio:'inherit'});
console.log('RELEASE231_GEN185_SCOPE_PASS');
