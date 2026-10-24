'use strict';
// Release219 successor: re-execute every Release218 acceptance assertion
// against its immutable historical source, then tightly verify the new UI-only
// category masking, immutable learning/canonical content, and PWA shell.
const assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process'),
 path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const baseline='8c85fbe9bdf1c529bf2bd4e7ff23cfb85140a7ec',oldRelease='20261022-218',newRelease='20261024-219';
const ROOT=path.resolve(__dirname,'..');
const git=(args,options={})=>cp.execFileSync('git',args,{cwd:ROOT,maxBuffer:256*1024*1024,...options});
const read=file=>fs.readFileSync(path.join(ROOT,file));
const original=file=>git(['show',baseline+':'+file]);
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const head=String(git(['rev-parse','HEAD'])).trim(),pending=head===baseline;
const normalizeNames=args=>String(git(args)).trim().split(/\n/).filter(Boolean).sort();
const workflowPath='.github/workflows/question-quality-ledger-audit.yml';
const plannedOverlay=['scripts/validate-category-successor.cjs',workflowPath].sort();
const trackedOverlay=normalizeNames(['diff','--name-only','HEAD']);
const stagedOverlay=normalizeNames(['diff','--cached','--name-only']);
const overlay= !pending && head==='5853853a4a2a88d7b2bb26959f6bca8551b8a4fe'
  && JSON.stringify(trackedOverlay)===JSON.stringify(plannedOverlay)
  && stagedOverlay.length===0;
if(!pending){
  const parents=String(git(['rev-list','--parents','-n','1','HEAD'])).trim().split(' ').slice(1);
  const count=Number(String(git(['rev-list','--count',baseline+'..HEAD'])).trim());
  if(overlay){
    assert(parents.length===1&&parents[0]===baseline&&count===1,'candidate overlay must build on exact first implementation commit');
  }else if(parents.length===1&&count===1){
    assert.equal(parents[0],baseline,'first successor commit must directly follow accepted Release218');
  }else if(parents.length===1&&count===2){
    assert.equal(String(git(['rev-parse','HEAD~2'])).trim(),baseline,'two implementation commits must follow accepted Release218');
  }else if(parents.length===2&&count===3){
    assert.equal(parents[0],baseline,'normal merge first parent must be Release218');
    assert.equal(String(git(['rev-parse','HEAD^{tree}'])).trim(),String(git(['rev-parse','HEAD^2^{tree}'])).trim(),
      'normal merge tree must match tested implementation branch tree');
    assert.equal(String(git(['rev-parse','HEAD^2~2'])).trim(),baseline,'merge second parent must descend from accepted Release218');
  }else throw new Error('Unexpected release successor ancestry: '+JSON.stringify({parents,count}));
  if(overlay)assert.deepEqual(trackedOverlay,plannedOverlay,'only scoped workflow/validator edits may be uncommitted');
  else assert.equal(String(git(['status','--porcelain','--untracked-files=no'])).trim(),'','committed successor tracked sources must be clean');
  const untracked=normalizeNames(['ls-files','--others','--exclude-standard']);
  const historical='historical-quality/';
  if(untracked.some(file=>file===historical||file.startsWith(historical))){
    const historicalDir=path.join(ROOT,'historical-quality');
    const historicalHead=String(cp.execFileSync('git',['rev-parse','HEAD'],{cwd:historicalDir})).trim();
    assert.equal(historicalHead,'37086c6ae6511a249218533375bf6f19dac231d1',
      'untracked historical-quality/ must be the exact pinned Release214 test checkout');
    assert.equal(String(cp.execFileSync('git',['status','--porcelain','--untracked-files=no'],
      {cwd:historicalDir})).trim(),'','pinned historical checkout tracked sources must remain clean');
  }
  assert(untracked.every(file=>file.startsWith('artifacts/')||file===historical||file.startsWith(historical)),
    'unexpected untracked files: '+untracked.join(','));
}
const snap=fs.mkdtempSync(path.join(os.tmpdir(),'release218-accepted-test-'));
try{
 cp.execFileSync('tar',['-x','-C',snap],{input:git(['archive',baseline]),maxBuffer:256*1024*1024});
 cp.execFileSync(process.execPath,['scripts/validate-explanation-successor.cjs'],{
   cwd:snap,stdio:'inherit',env:{...process.env,GIT_DIR:String(git(['rev-parse','--absolute-git-dir'])).trim(),GIT_WORK_TREE:snap}
 });
 console.log('PASS original Release218 successor assertions on immutable historical checkout');
}finally{fs.rmSync(snap,{recursive:true,force:true});}
const tracked=Array.from(new Set([
  ...normalizeNames(pending?['diff','--name-only']:['diff','--name-only',baseline,'HEAD']),
  ...(overlay?trackedOverlay:[])
])).sort();
const authorized=['js/view.js','js/explanation-model.js','package.json','tests/audit-matrix.test.js',
'index.html','form-a.html','service-worker.js','pwa-release-manifest.json','tests/app.test.js'];
const acceptedPaths=pending?authorized:[
  ...authorized,
  'tests/preanswer-category-leak.test.js',
  'tests/exam-points-visible.test.js',
  'scripts/validate-category-successor.cjs',
  'reports/auto-gate/audit-locks/phase-b-generation-165.json',
  '.github/workflows/question-quality-ledger-audit.yml'
];
assert.deepEqual(tracked,acceptedPaths.sort(),'no missing or unexpected Release219 files');
const acceptedLedgerWorkflow=original(workflowPath).toString('utf8');
const oldRoute="      - name: Validate immutable Release217 evidence and explanation successor\n        run: node scripts/validate-explanation-successor.cjs";
const newRoute="      - name: Validate immutable evidence via strict release-specific successor\n        run: |\n          node - <<'NODE'\n          const assert = require('node:assert/strict');\n          const cp = require('node:child_process');\n          const manifest = require('./pwa-release-manifest.json');\n          const validators = Object.freeze({\n            '20261022-218': 'scripts/validate-explanation-successor.cjs',\n            '20261024-219': 'scripts/validate-category-successor.cjs'\n          });\n          const script = validators[manifest.release];\n          assert(script, 'unknown release: '+manifest.release);\n          cp.execFileSync(process.execPath, [script], {stdio:'inherit'});\n          NODE";
assert.equal(acceptedLedgerWorkflow.split(oldRoute).length,2,'historical CI route has a unique replacement anchor');
assert.equal(read(workflowPath).toString('utf8'),acceptedLedgerWorkflow.replace(oldRoute,newRoute),
  'ledger CI must replace only the old-release routing with fail-closed release-aware validation');
const core=require('./qa/audit-core'),production=core.productionFiles();
const permitted=new Set(['js/view.js','js/explanation-model.js','index.html','form-a.html','service-worker.js','pwa-release-manifest.json']);
for(const file of production){
 if(!permitted.has(file))assert(read(file).equals(original(file)),file+' immutable from accepted main');
}
for(const file of ['index.html','form-a.html','service-worker.js']){
 const historical=original(file).toString('utf8');
 assert(historical.includes(oldRelease),file+' accepted release token exists');
 assert.equal(read(file).toString('utf8'),historical.replaceAll(oldRelease,newRelease),file+' release marker only');
}
const oldView=original('js/view.js').toString('utf8');
const category='      this.byId(\'q-category\').textContent = `第${question.chapter}章｜${question.category}`;';
const replacement="      const accountCategorySpoiler = question.type === 'journal'\n        && [...(question.answer?.debit || []), ...(question.answer?.credit || [])]\n          .some(item => item.account === question.category);\n      const visibleCategory = accountCategorySpoiler ? '仕訳問題' : question.category;\n      this.byId('q-category').textContent = `第${question.chapter}章｜${visibleCategory}`;";
assert.equal(oldView.split(category).length,2,'baseline category label unique');
let viewExpected=oldView.replace(category,replacement);
const oldTask='this.byId(\'q-task\').textContent = `今回の仕事：${question.category}`;';
assert.equal(viewExpected.split(oldTask).length,2,'baseline Story task unique');
viewExpected=viewExpected.replace(oldTask,'this.byId(\'q-task\').textContent = `今回の仕事：${visibleCategory}`;');
const oldStory = "if (!story.hidden) { this.byId('q-scene').textContent = question.scene; this.byId('q-context').textContent = question.story; this.byId('q-task').textContent = `今回の仕事：${visibleCategory}`; }";
const newStory = "if (!story.hidden) {\n        // Keep the story meaningful without exposing the exact answer account\n        // through a category label embedded in the narrative.\n        let visibleStory = String(question.story || '');\n        if (accountCategorySpoiler) {\n          visibleStory = visibleStory.replaceAll(`「${question.category}」に関する`, '今回の取引に関する');\n          visibleStory = visibleStory.split('。').filter(sentence => !sentence.includes(question.category)).join('。');\n        }\n        this.byId('q-scene').textContent = question.scene;\n        this.byId('q-context').textContent = visibleStory;\n        this.byId('q-task').textContent = `今回の仕事：${visibleCategory}`;\n      }";
assert.equal(viewExpected.split(oldStory).length,2,'preanswer Story rendering anchor unique');
viewExpected=viewExpected.replace(oldStory,newStory);
assert.equal(read('js/view.js').toString('utf8'),viewExpected,'exact category/task/story masking, no other changes');
const oldAppTest=original('tests/app.test.js').toString('utf8');
const oldClaim="assert(viewSource.includes(\"this.byId('q-context').textContent = question.story\"), 'ストーリーモードで問題の場面と物語を表示する');",newClaim="assert(viewSource.includes(\"this.byId('q-context').textContent = visibleStory\") && viewSource.includes(\"this.byId('q-scene').textContent = question.scene\"), '通常の場面と物語を表示し、正答科目に一致する物語ラベルは保護する');";
assert.equal(oldAppTest.split(oldClaim).length,2,'old source-only story test present once');
assert.equal(read('tests/app.test.js').toString('utf8'),oldAppTest.replace(oldClaim,newClaim),
  'test update must assert protected Story semantics and preserve all other assertions');
const oldTeachingModel=original('js/explanation-model.js').toString('utf8');
const oldReasonAnchor="      if(q.type==='journal')out.transfer=arr(out.transfer).map(item=>journalDecision(q,item));\n    }\n    if(q.type==='comprehensive'&&!q.format){";
const newReasonContent="      if(q.type==='journal')out.transfer=arr(out.transfer).map(item=>journalDecision(q,item));\n    }\n    const point=authoredSection(q,'試験のポイント');\n    if(point && !out.summary.some(item=>String(item.text||'').includes(point))){\n      out.summary.push({text:'試験のポイント：'+point,evidenceRef:'explanation'});\n    }\n    if(q.type==='comprehensive'&&!q.format){";
assert.equal(oldTeachingModel.split(oldReasonAnchor).length,2,'teaching append anchor unique');
assert.equal(read('js/explanation-model.js').toString('utf8'),oldTeachingModel.replace(oldReasonAnchor,newReasonContent),
  'only surface authored, unmodified exam-point evidence after the core journal rationale');
const oldPkg=original('package.json').toString('utf8');
const key='"test": "node tests/feedback-missing-language.test.js &&';
assert.equal(oldPkg.split(key).length,2,'baseline test anchor unique');
assert.equal(read('package.json').toString('utf8'),
 oldPkg.replace(key,'"test": "node tests/preanswer-category-leak.test.js && node tests/exam-points-visible.test.js && node tests/feedback-missing-language.test.js &&'),
 'only register new pre-answer regression in npm test');
const oldAudit=original('tests/audit-matrix.test.js').toString('utf8');
const legacy="['scripts/validate-explanation-successor.cjs']";
assert.equal(oldAudit.split(legacy).length,2,'legacy historical audit invocation exists');
assert.equal(read('tests/audit-matrix.test.js').toString('utf8'),
 oldAudit.replace(legacy,"['scripts/validate-category-successor.cjs']"),
 'audit matrix retains existing contracts, uses strict historic+successor audit');
const manifest=JSON.parse(read('pwa-release-manifest.json'));
const prior=JSON.parse(original('pwa-release-manifest.json'));
const expected=structuredClone(prior);
expected.release=newRelease;expected.previousRelease=oldRelease;
expected.assets['js/view.js']=sha(read('js/view.js'));
expected.assets['js/explanation-model.js']=sha(read('js/explanation-model.js'));
expected.pages['form-a.html']=sha(read('form-a.html'));
assert.deepEqual(manifest,expected,'only expected Release219 manifest successor updates');
assert.equal(Object.keys(manifest.assets).length,20);
for(const [file,value] of Object.entries(manifest.assets))assert.equal(sha(read(file)),value,file+' release asset digest');
for(const [file,value] of Object.entries(manifest.pages))assert.equal(sha(read(file)),value,file+' release page digest');
const lifecycle=require('./qa/phase-b-lifecycle');
const candidate=JSON.parse(read('reports/auto-gate/audit-locks/phase-b-generation-165.json'));
assert.equal(candidate.generation,165);
if(pending) assert.equal(lifecycle.verifyCandidate(candidate).ok,true,'Generation165 exact pending successor valid');
else {
  const authorities=lifecycle.generationAuthorities();
  const g164=authorities.find(item=>item.document.generation===164);
  const g165=authorities.find(item=>item.document.generation===165);
  assert(g164&&g165,'both historical predecessor and new authority must be committed');
  assert.deepEqual(candidate.predecessor,lifecycle.identity(g164.document),'immutable Generation164 predecessor');
}
assert.equal(core.currentIntegrityCheck().ok,true,'successor must pass fail-closed integrity in either state');
cp.execFileSync(process.execPath,['tests/preanswer-category-leak.test.js'],{cwd:ROOT,stdio:'inherit'});
cp.execFileSync(process.execPath,['tests/exam-points-visible.test.js'],{cwd:ROOT,stdio:'inherit'});
console.log(JSON.stringify({status:'PASS',acceptedRelease:oldRelease,successor:newRelease,originalAcceptedAudit:'reexecuted',protectedProductionFiles:production.length-permitted.size,assetCount:Object.keys(manifest.assets).length,generation:165}));
