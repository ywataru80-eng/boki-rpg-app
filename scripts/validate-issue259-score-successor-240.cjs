'use strict';
// Release240 / Generation204: a scoring-display-only successor. The 2026
// model, canonical questions, exam pool, already-earned rewards and old exam
// history remain untouched. The 2027 mode is not released by this successor.
const assert=require('node:assert/strict');
const fs=require('node:fs'),cp=require('node:child_process'),crypto=require('node:crypto');
const BASE='f600cdf95a4ca27838ad729b707f6777c369eba1';
const PREVIOUS='20261119-239',RELEASE='20261123-240';
const GENERATION='reports/auto-gate/audit-locks/phase-b-generation-204.json';
const git=(...args)=>cp.execFileSync('git',args,{encoding:'utf8',maxBuffer:32*1024*1024}).trim();
const original=path=>cp.execFileSync('git',['show',`${BASE}:${path}`],{maxBuffer:32*1024*1024});
const read=path=>fs.readFileSync(path);
const sha=path=>crypto.createHash('sha256').update(read(path)).digest('hex');
assert.equal(cp.spawnSync('git',['merge-base','--is-ancestor',BASE,'HEAD']).status,0,'must descend from Release239 exact main');
assert.equal(JSON.parse(original('pwa-release-manifest.json')).release,PREVIOUS,'Release239 source was not changed');
const allowed=new Set([
 'js/controller.js','package.json','tests/issue259-score-breakdown.test.js',
 'index.html','form-a.html','service-worker.js','pwa-release-manifest.json',GENERATION,
 'scripts/validate-issue259-score-successor-240.cjs',
 'tests/audit-matrix.test.js','tests/issue161-inventory.test.js',
 'tests/editorial-review-230.test.js','tests/editorial-review-232.test.js',
 'tests/editorial-review-233.test.js','tests/editorial-review-234.test.js',
 'tests/l039-explanation.test.js','tests/ledger-opening-migration.test.js',
 'tests/user-facing-copy-contract.test.js',
 '.github/visual/run-content-progress-migration.js',
 '.github/workflows/question-quality-ledger-audit.yml'
]);
const modified=git('diff','--name-only',BASE).split(/\n/u).filter(Boolean);
const untracked=git('ls-files','--others','--exclude-standard').split(/\n/u)
 .filter(path=>path&&!path.startsWith('node_modules/')&&!path.startsWith('artifacts/')&&
  !path.startsWith('reports/baseline-current/')&&!path.startsWith('historical-quality/'));
const paths=[...new Set([...modified,...untracked])];
assert(paths.length&&paths.every(path=>allowed.has(path)),
 'scope violation: '+paths.filter(path=>!allowed.has(path)).join(','));
const core=original('js/controller.js').toString('utf8');
const allocation=`    // Integer allocations are display-only; the stored total keeps the existing
    // rounded sum of raw weighted ratios. This makes row/topic totals agree with
    // the 100-point result without changing 2026 exam grades or old history.
    static allocateExamPoints(ids, scores, weights = EXAM_POINTS) {
      if (!Array.isArray(ids) || !Array.isArray(weights) || ids.length !== weights.length ||
          !ids.length || new Set(ids).size !== ids.length) throw new TypeError('Invalid exam scoring contract');
      const raw = ids.map((id, index) => {
        const weight = weights[index], ratio = scores?.[id]?.ratio ?? 0;
        if (!Number.isSafeInteger(weight) || weight <= 0 ||
            !Number.isFinite(ratio) || ratio < 0 || ratio > 1) throw new TypeError('Invalid exam score');
        return ratio * weight;
      });
      const points = Math.round(raw.reduce((sum, score) => sum + score, 0));
      const displayed = raw.map(Math.floor);
      let remaining = points - displayed.reduce((sum, score) => sum + score, 0);
      const indices = raw.map((_, index) => index).sort((left, right) => {
        const difference = (raw[right] - displayed[right]) - (raw[left] - displayed[left]);
        return Math.abs(difference) < 1e-9 ? left - right : difference;
      });
      for (const index of indices) {
        if (!remaining) break;
        if (displayed[index] < weights[index]) { displayed[index]++; remaining--; }
      }
      if (remaining || displayed.some((value, index) => value < 0 || value > weights[index]))
        throw new Error('Exam score display allocation failed');
      return { points, displayed };
    }
`;
const oneReplace=(source,from,to,label)=>{
 assert.equal(source.split(from).length,2,label+' uniqueness');return source.replace(from,to);
};
let expected=oneReplace(core,'  class Controller {\n','  class Controller {\n'+allocation,'class helper');
expected=oneReplace(expected,
 '      const earned = session.ids.reduce((sum, id, index) => sum + (session.scores[id]?.ratio || 0) * EXAM_POINTS[index], 0);\n      const points = Math.round(earned); const correct = points >= 70;',
 '      const allocation = Controller.allocateExamPoints(session.ids, session.scores);\n      const points = allocation.points; const correct = points >= 70;', 'final scoring');
expected=oneReplace(expected,
 'earned: Math.round((session.scores[id]?.ratio || 0) * EXAM_POINTS[index])',
 'earned: allocation.displayed[index]', 'individual integer scoring');
assert.equal(read('js/controller.js').toString('utf8'),expected,'controller must contain only approved score-display delta');
assert.equal(read('package.json').toString('utf8'),oneReplace(
 original('package.json').toString('utf8'),
 '"test": "node tests/exam-review-structured.test.js &&',
 '"test": "node tests/issue259-score-breakdown.test.js && node tests/exam-review-structured.test.js &&',
 'register regression test'),'package test change must be limited to one command');
for(const path of ['data/questions.js','data/accounting-domain.js','data/accounting-oracle.js','js/model.js','js/rpg.js'])
 assert(read(path).equals(original(path)),path+' 300 questions/accounting/storage/rewards changed');
for(const path of ['index.html','form-a.html','service-worker.js']){
 const old=original(path).toString('utf8');
 assert(old.includes(PREVIOUS),path+' old release absent');
 assert.equal(read(path).toString('utf8'),old.replaceAll(PREVIOUS,RELEASE),path+' unapproved production edit');
}
const manifest=JSON.parse(read('pwa-release-manifest.json')),
 oldManifest=JSON.parse(original('pwa-release-manifest.json'));
assert.equal(manifest.release,RELEASE);assert.equal(manifest.previousRelease,PREVIOUS);
assert.deepEqual(Object.keys(manifest.assets),Object.keys(oldManifest.assets));
assert.deepEqual(Object.keys(manifest.pages),Object.keys(oldManifest.pages));
for(const [path,expectedSha] of Object.entries({...manifest.assets,...manifest.pages}))
 assert.equal(sha(path),expectedSha,path+' release SHA256 mismatch');
for(const path of ['reports/auto-gate/audit-locks/phase-b-generation-202.json','reports/auto-gate/audit-locks/phase-b-generation-203.json'])
 assert(read(path).equals(original(path)),path+' historical authority changed');
const generation=JSON.parse(read(GENERATION));
assert.equal(generation.generation,204);assert.equal(generation.predecessor.generation,203);
const lifecycle=require('./qa/phase-b-lifecycle');
const committed=cp.spawnSync('git',['cat-file','-e',`HEAD:${GENERATION}`]).status===0;
const check=committed?lifecycle.verifyCurrent():lifecycle.verifyCandidate(generation);
assert(check.ok,'Generation204 lifecycle: '+check.errors.join('; '));
cp.execFileSync(process.execPath,['tests/issue259-score-breakdown.test.js'],{stdio:'inherit'});
console.log('RELEASE240_GEN204_SCORE_BREAKDOWN_SUCCESSOR_PASS (2027 production mode remains pending)');
