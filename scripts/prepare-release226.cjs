'use strict';
// Executed ONLY by isolated Issue235 bootstrap workflow on a fresh branch from Release225 main.
// This tool file is intentionally NOT copied into the Release226 deliverable.
const fs=require('node:fs'),cp=require('node:child_process'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const ROOT=process.cwd(),BASE='eddde65e44cc32254a27f22fa8d4f5638430be23';
const FEATURE='094635fff6e8633ffe28b79b573885e00aae5a9b';
const SOURCE_BRANCH='origin/automation/issue235-release226-preparation';
const OLDER='20261026-225',RELEASE='20261027-226';
const run=(...args)=>cp.execFileSync('git',args,{cwd:ROOT,encoding:'utf8',maxBuffer:64*1024*1024}).trim();
const read=f=>fs.readFileSync(path.join(ROOT,f),'utf8');
const write=(f,s)=>{fs.mkdirSync(path.dirname(path.join(ROOT,f)),{recursive:true});fs.writeFileSync(path.join(ROOT,f),s);};
const original=f=>cp.execFileSync('git',['show',BASE+':'+f],{encoding:'utf8',maxBuffer:64*1024*1024}).toString();
const fromRef=(ref,f)=>cp.execFileSync('git',['show',ref+':'+f],{encoding:'utf8',maxBuffer:64*1024*1024}).toString();
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT,f))).digest('hex');
assert.equal(run('rev-parse',BASE),run('rev-parse','HEAD'),'bootstrap target MUST start at validated Release225 main');
for(const f of ['js/view.js','tests/story-business-decision.test.js'])write(f,fromRef(FEATURE,f));
write('scripts/validate-gameplay-successor.cjs',fromRef(SOURCE_BRANCH,'scripts/validate-gameplay-successor.cjs'));
for(const f of ['index.html','form-a.html','service-worker.js']){
 const o=original(f);
 assert(o.includes(OLDER));
 write(f,o.replaceAll(OLDER,RELEASE));
}
for(const [f,anchor,addition] of [
 ['tests/audit-matrix.test.js',"'20261026-225':'scripts/validate-editorial-successor.cjs'",",\n  '20261027-226':'scripts/validate-gameplay-successor.cjs'"],
 ['.github/workflows/question-quality-ledger-audit.yml',"'20261026-225': 'scripts/validate-editorial-successor.cjs'",",\n            '20261027-226': 'scripts/validate-gameplay-successor.cjs'"]
]){
 const o=original(f);
 assert.equal(o.split(anchor).length,2,'strict router anchor '+f);
 write(f,o.replace(anchor,anchor+addition));
}
const previous=JSON.parse(original('pwa-release-manifest.json'));
const next={...previous,release:RELEASE,previousRelease:OLDER,assets:{...previous.assets},pages:{...previous.pages}};
for(const key of Object.keys(next.assets))next.assets[key]=sha(key);
for(const key of Object.keys(next.pages))next.pages[key]=sha(key);
write('pwa-release-manifest.json',JSON.stringify(next,null,2)+'\n');
const phase=require(path.join(ROOT,'scripts/qa/phase-b-lifecycle'));
const candidate=phase.createCandidate();
assert.equal(candidate.generation,179);
write('reports/auto-gate/audit-locks/phase-b-generation-179.json',JSON.stringify(candidate,null,2)+'\n');
const proof=phase.verifyCandidate(candidate);
assert(proof.ok,'generation179 candidate failed '+proof.errors.join('; '));
console.log('PREPARED Release226 / Generation179',JSON.stringify({
 main:BASE,source:FEATURE,files:run('status','--short').split('\n'),
 release:next.release,generation:candidate.generation,baselineIdentity:candidate.baselineIdentity
}));
