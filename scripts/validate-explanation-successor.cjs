'use strict';
// Preserve every assertion of the Release217 audit at its immutable source,
// then enforce the narrower explanation-only successor against the current tree.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process'),vm=require('node:vm'),crypto=require('node:crypto'),zlib=require('node:zlib');
const root=path.resolve(__dirname,'..'),baseline='be673ac30d110cac22257c989ca6f53b2977e842';
const git=args=>cp.execFileSync('git',args,{cwd:root,maxBuffer:256*1024*1024});
const read=p=>fs.readFileSync(path.join(root,p)),old=p=>git(['show',baseline+':'+p]);
const snapshot=fs.mkdtempSync(path.join(os.tmpdir(),'boki-explanation-history-'));
try{
  cp.execFileSync('tar',['-x','-C',snapshot],{input:git(['archive',baseline]),maxBuffer:256*1024*1024});
  cp.execFileSync(process.execPath,['reports/edu-quality/ledger-opening-successor.validate.cjs'],{
    cwd:snapshot,stdio:'inherit',env:{...process.env,GIT_DIR:String(git(['rev-parse','--absolute-git-dir'])).trim(),GIT_WORK_TREE:snapshot}
  });
}finally{fs.rmSync(snapshot,{recursive:true,force:true});}
const permitted=new Set(['js/feedback.js','js/explanation-model.js','js/explanation-formulas.js','js/view.js','index.html','form-a.html','service-worker.js','pwa-release-manifest.json']);
const historical=String(git(['ls-tree','-r','--name-only',baseline,'--','data','js','css','independent-audit','reports/auto-gate/audit-locks','reports/edu-quality'])).trim().split('\n');
function verifyProtected(readCurrent=read){
  for(const p of historical)if(!permitted.has(p))assert(readCurrent(p).equals(old(p)),p+' must retain accepted bytes');
  for(const p of ['index.html','form-a.html','service-worker.js']){
    const expected=old(p).toString().replaceAll('20261020-217','20261022-218');
    assert.equal(readCurrent(p).toString(),expected,p+' release marker only');
  }
}
verifyProtected();
const load=bytes=>{const s={window:{}};vm.runInNewContext(String(bytes),s);return JSON.parse(JSON.stringify(s.window.QuestionData));};
const previous=load(old('data/questions.js')),current=load(read('data/questions.js'));
assert.equal(Object.keys(current).length,300);assert.deepEqual(current,previous,'all question, answer, story and explanation data remain unchanged');
const Progress=require('../js/model');
assert.deepEqual(Progress.currentContentVersions(current),Progress.currentContentVersions(previous),'display changes do not replace learning content identities');
for(const p of ['data/questions.js','js/engine.js','js/model.js','js/rpg.js','js/controller.js','js/explanation-design-system.js']){
  assert.throws(()=>verifyProtected(file=>file===p?Buffer.from('mutation'):read(file)),p+' protection must fail closed');
}
cp.execFileSync(process.execPath,['tests/explanation-quality.test.js'],{cwd:root,stdio:'inherit'});
// These checks establish evidence identity/completeness, not human editorial approval.
const report=JSON.parse(read('reports/edu-quality/explanation-quality-20261022.json'));
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
assert.equal(report.baselineHead,baseline);
assert.deepEqual(report.records.map(r=>r.id).sort(),Object.keys(current).sort());
// The Release218 browser archive is immutable evidence for the prior PR HEAD.
// Preserve and verify that provenance; the new feedback revision has its own
// bound successor source hash and must pass the current CI/browser gates.
const priorRenderedHead='5f1523933f99dcdeee2671619df52d7e15a9a76f';
for(const [file,hash] of Object.entries(report.sourceHashes)){
  const archivedSource=file==='js/feedback.js'?git(['show',priorRenderedHead+':'+file]):read(file);
  assert.equal(digest(archivedSource),hash,file+' historical render evidence must describe its original bytes');
}
const successor=JSON.parse(read('reports/edu-quality/feedback-missing-20261024.json'));
assert.equal(successor.predecessorHead,priorRenderedHead);
assert.equal(successor.generationCandidate,163);
assert.equal(successor.sourceHashes.previousFeedback,digest(git(['show',priorRenderedHead+':js/feedback.js'])));
assert.equal(successor.sourceHashes.currentFeedback,digest(read('js/feedback.js')));
assert.equal(successor.sourceHashes.currentManifest,digest(read('pwa-release-manifest.json')));
assert.equal(String(git(['rev-parse','HEAD:data/questions.js'])).trim(),successor.protectedQuestionData);
cp.execFileSync(process.execPath,['tests/feedback-missing-language.test.js'],{cwd:root,stdio:'inherit'});
for(const [file,artifact] of Object.entries(report.artifacts)){
  const bytes=read('reports/edu-quality/'+file);
  assert.equal(digest(bytes),artifact.sha256,file+' compressed evidence identity');
  assert.equal(digest(zlib.gunzipSync(bytes)),artifact.uncompressedSha256,file+' original evidence identity');
}
const rendered=JSON.parse(zlib.gunzipSync(read('reports/edu-quality/explanation-quality-20261022-render-final.json.gz')));
assert.deepEqual(rendered.sources,report.sourceHashes);
assert.equal(rendered.records.length,300);
assert.equal(rendered.scenarios,report.summary.scenarios);
for(const record of rendered.records){
  const reviewed=report.records.find(r=>r.id===record.id);
  assert(record.variants.some(v=>v.expectedCorrect)&&record.variants.some(v=>!v.expectedCorrect),record.id+' both result states');
  for(const variant of record.variants){
    const evidence=reviewed.scenarios.find(v=>v.name===variant.scenario);
    assert.equal(digest(variant.initial),evidence.initialSha256);
    assert.equal(digest(variant.expanded),evidence.expandedSha256);
    assert.equal(variant.score.correct,variant.expectedCorrect);
    assert(variant.unchanged&&!variant.overflow,record.id+' state and viewport');
  }
}
console.log(JSON.stringify({status:'PASS',baseline,questions:300,protectedFiles:historical.filter(p=>!permitted.has(p)).length,negativeCasesRejected:6,identities:'unchanged',historicalAudit:'executed at fixed source'}));
