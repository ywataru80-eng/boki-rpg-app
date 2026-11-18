'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process'),crypto=require('node:crypto');
const BASE='b90b70db8eff129a396ff8ef977cc9336b7bf313',PREV='20261116-238',RELEASE='20261119-239';
const OLD='reports/auto-gate/audit-locks/phase-b-generation-202.json',NEW='reports/auto-gate/audit-locks/phase-b-generation-203.json';
const git=(...a)=>cp.execFileSync('git',a,{encoding:'utf8',maxBuffer:32*1024*1024}).trim();
const prior=p=>cp.execFileSync('git',['show',BASE+':'+p],{maxBuffer:32*1024*1024});
const read=p=>fs.readFileSync(p),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
assert.equal(cp.spawnSync('git',['merge-base','--is-ancestor',BASE,'HEAD']).status,0,'Release238 ancestry');
assert(read(OLD).equals(prior(OLD)),'historical Generation202 changed');
const allowed=new Set(['data/accounting-domain.js','data/questions.js','js/controller.js','index.html','form-a.html','service-worker.js','pwa-release-manifest.json',NEW,
 'tests/fy2027-account-compatibility.test.js','scripts/validate-fy2027-account-successor-239.cjs','tests/audit-matrix.test.js','tests/user-facing-copy-contract.test.js','.github/workflows/question-quality-ledger-audit.yml','.github/visual/run-content-progress-migration.js',
 'tests/l039-explanation.test.js','tests/editorial-review-234.test.js','tests/editorial-review-232.test.js','tests/editorial-review-233.test.js','tests/issue161-inventory.test.js','tests/editorial-review-230.test.js','tests/ledger-opening-migration.test.js','.github/workflows/visual-gate.yml']);
const modified=git('diff','--name-only',BASE).split(/\n/u).filter(Boolean);
const untracked=git('ls-files','--others','--exclude-standard').split(/\n/u).filter(p=>p&&!p.startsWith('node_modules/')&&!p.startsWith('reports/baseline-current/')&&!p.startsWith('historical-quality/')&&!p.startsWith('artifacts/'));
const paths=[...new Set([...modified,...untracked])];
assert(paths.length>0&&paths.every(p=>allowed.has(p)),'out of scope files: '+paths.filter(p=>!allowed.has(p)).join(','));
const edits={
 'data/accounting-domain.js':[["'繰越商品','備品'","'繰越商品','商品','備品'"],["expense: ['仕入','発送費'","expense: ['仕入','売上原価','固定資産除却損','発送費'"]],
 'data/questions.js':[["'繰越商品','備品'","'繰越商品','商品','備品'"],["expense:new Set(['仕入','発送費'","expense:new Set(['仕入','売上原価','固定資産除却損','発送費'"]],
 'js/controller.js':[["['資本金','繰越利益剰余金','損益','受取利息','償却債権取立益']","['資本金','繰越利益剰余金','損益','受取利息','償却債権取立益'],\n    // FY2027-only concepts: appended groups avoid reordering accepted 2026 options.\n    ['商品','売上原価','仕入','繰越商品','売上'],\n    ['固定資産除却損','固定資産売却損','固定資産売却益','減価償却費','備品']"]]
};
for(const [p,changes] of Object.entries(edits)){
 let expected=prior(p).toString('utf8');
 for(const [a,b] of changes){assert.equal(expected.split(a).length,2,p+' not unique');expected=expected.replace(a,b)}
 assert.equal(read(p).toString('utf8'),expected,p+' unapproved changes');
}
for(const file of ["tests/l039-explanation.test.js","tests/editorial-review-234.test.js","tests/editorial-review-232.test.js","tests/editorial-review-233.test.js","tests/issue161-inventory.test.js","tests/editorial-review-230.test.js","tests/ledger-opening-migration.test.js"]){
 const original=prior(file).toString('utf8');
 assert(original.includes("'20261116-238'"),file+' old release not listed');
 assert.equal(read(file).toString('utf8'),original.replaceAll("'20261116-238'","'20261116-238','20261119-239'"),file+' release whitelist expansion only');
}
// Keep every browser gate unchanged; only improve the Ubuntu dependency mirror and runtime ceiling.
const originalVisual=prior('.github/workflows/visual-gate.yml').toString('utf8');
const revisedVisual=originalVisual.replace("    timeout-minutes: 30","    timeout-minutes: 60").replace("      - name: Install Chromium and WebKit\n        run: npx playwright install --with-deps chromium webkit","      - name: Install Chromium and WebKit\n        run: |\n          set -euo pipefail\n          # The EC2 Ubuntu mirror stalled for >30 min on 2026-11-19; use the official mirror.\n          if [ -f /etc/apt/sources.list.d/ubuntu.sources ]; then\n            sudo sed -i -E 's#https?://[a-z0-9.-]+\\.ec2\\.archive\\.ubuntu\\.com/ubuntu#https://archive.ubuntu.com/ubuntu#g' /etc/apt/sources.list.d/ubuntu.sources\n          fi\n          npx playwright install --with-deps chromium webkit");
assert(!revisedVisual.includes('timeout-minutes: 30'),'visual job timeout not extended');
assert.equal(read('.github/workflows/visual-gate.yml').toString('utf8'),revisedVisual,'visual gate setup only; no skipped tests');
for(const p of ['index.html','form-a.html','service-worker.js'])assert.equal(read(p).toString('utf8'),prior(p).toString('utf8').replaceAll(PREV,RELEASE),p+' marker only');
const a=JSON.parse(read('pwa-release-manifest.json')),b=JSON.parse(prior('pwa-release-manifest.json'));
assert.equal(a.release,RELEASE);assert.equal(a.previousRelease,PREV);assert.equal(b.release,PREV);
assert.deepEqual(Object.keys(a.assets).sort(),Object.keys(b.assets).sort());
assert.deepEqual(Object.keys(a.pages).sort(),Object.keys(b.pages).sort());
for(const [p,h] of Object.entries({...a.assets,...a.pages}))assert.equal(sha(read(p)),h,p+' hash mismatch');
assert(read('.github/workflows/question-quality-ledger-audit.yml').toString('utf8').includes("'20261119-239': 'scripts/validate-fy2027-account-successor-239.cjs'"),'workflow mapping absent');
assert(read('.github/visual/run-content-progress-migration.js').toString('utf8').includes(RELEASE),'PWA version absent');
const g=JSON.parse(read(NEW));assert.equal(g.generation,203);assert.equal(g.predecessor.generation,202);
const lifecycle=require('./qa/phase-b-lifecycle');const committed=cp.spawnSync('git',['cat-file','-e','HEAD:'+NEW]).status===0;
const verified=committed?lifecycle.verifyCurrent():lifecycle.verifyCandidate(g);
assert(verified.ok,'Gen203 lifecycle: '+verified.errors.join(','));
cp.execFileSync(process.execPath,['tests/fy2027-account-compatibility.test.js'],{stdio:'inherit'});
console.log('RELEASE239_GEN203_ACCOUNT_TAXONOMY_ONLY_PASS');
