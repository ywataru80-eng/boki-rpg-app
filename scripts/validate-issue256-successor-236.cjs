'use strict';
// Release236 / Generation190 successor: D002-D018 graded content change.
// Historic Release235 must be independently validated, never overwritten.
const assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process'),crypto=require('node:crypto'),vm=require('node:vm');
const BASE='177dadd83369b0c1bd0c95db4af379ea35515c67',PREV='20261105-235',RELEASE='20261107-236';
const GEN='reports/auto-gate/audit-locks/phase-b-generation-198.json';
const git=(...args)=>cp.execFileSync('git',args,{encoding:'utf8',maxBuffer:16*1024*1024}).trim();
const old=p=>cp.execFileSync('git',['show',BASE+':'+p],{maxBuffer:16*1024*1024});
const read=p=>fs.readFileSync(p),hash=p=>crypto.createHash('sha256').update(read(p)).digest('hex');
assert.equal(cp.spawnSync('git',['merge-base','--is-ancestor',BASE,'HEAD']).status,0,'Release235 parent must remain in the ancestry');
const manifest=JSON.parse(read('pwa-release-manifest.json')),prior=JSON.parse(old('pwa-release-manifest.json'));
assert.equal(prior.release,PREV);assert.equal(manifest.release,RELEASE);assert.equal(manifest.previousRelease,PREV);
assert.deepEqual(Object.keys(manifest.assets).sort(),Object.keys(prior.assets).sort());
assert.deepEqual(Object.keys(manifest.pages).sort(),Object.keys(prior.pages).sort());
for(const [p,v]of Object.entries({...manifest.assets,...manifest.pages}))assert.equal(hash(p),v,p+' served-asset digest');
for(const file of ['index.html','form-a.html','service-worker.js'])assert.equal(read(file).toString(),old(file).toString().replaceAll(PREV,RELEASE),file+' marker-only update');
const allowed=new Set([
 'data/questions.js','js/model.js','js/explanation-model.js','js/explanation-formulas.js','js/controller.js',
 'index.html','form-a.html','service-worker.js','pwa-release-manifest.json',
 'scripts/validate-issue256-successor-236.cjs','scripts/check-explanation-accounting.py','package.json',
 'reports/auto-gate/audit-locks/phase-b-generation-190.json',
 'reports/auto-gate/audit-locks/phase-b-generation-191.json',
 'reports/auto-gate/audit-locks/phase-b-generation-192.json', // immutable successor after fixing supplementary Story progress
 'reports/auto-gate/audit-locks/phase-b-generation-193.json', // immutable post-editorial authority
 'reports/auto-gate/audit-locks/phase-b-generation-194.json', // immutable six chronology fixes
 'reports/auto-gate/audit-locks/phase-b-generation-195.json', // seven exact source-bound chapter 10 Story fixes
 'reports/auto-gate/audit-locks/phase-b-generation-196.json', // E011 documentary proof correction
 'reports/auto-gate/audit-locks/phase-b-generation-197.json', // E011 story omits answer account name
 'reports/auto-gate/audit-locks/phase-b-generation-198.json', // verified Story progress cannot be faked by answer reveal
 'js/explanation-design-system.js','scripts/qa/contract-runner.js',
 'independent-audit/oracles/expected-answer-oracle.js','independent-audit/oracles/issue256-successor-expected.js',
 'tests/issue256-release236-independent-oracle.test.js',
 'tests/explanation-formula-coverage.test.js','tests/fixed-asset-ledger.test.js',
 'tests/issue161-ch11-12-final-explanation.test.js','tests/issue161-explanation-design-system.test.js',
 'tests/issue161-inventory.test.js','tests/ledger-opening-history.browser.test.js',
 'tests/editorial-review-230.test.js','tests/editorial-review-232.test.js','tests/editorial-review-233.test.js',
 'reports/edu-quality/issue256-release236-review-ledger.json',
 '.github/workflows/question-quality-ledger-audit.yml',
 '.github/workflows/issue256-release236-acceptance.yml',
 '.github/workflows/issue256-release236-commit.yml',
 'tests/issue256-release236-migration.test.js',
 'tests/story-work-case-narrative-s5e.test.js', // historical Gen194 snapshot stays fixed, Gen195 source corrections additive
 'tests/story-work-case-narrative-s5f.test.js', // same historical fixture acceptance with source-only successor
 'tests/story-work-case-narrative-s5d2.test.js', // exact Gen195 E011 source-bound successor, prior acceptance immutable
 'tests/story-narrative-result.test.js','tests/story-final-epilogue-s6.test.js', // Gen198 actual Story success authorization
 'tests/audit-matrix.test.js', // explicitly record source drift against immutable historical audit matrix
 'tests/ledger-opening-migration.test.js','tests/ledger-opening-backup.test.js','tests/l039-explanation.test.js','tests/learning-effectiveness.test.js','tests/content-progress-migration.test.js','tests/content-progress-integration.test.js',
 'tests/exam-points-visible.test.js','tests/npc-dialogue-story.test.js','tests/audit-matrix.test.js',
 'tests/form-a-pwa.browser.test.js', // Release236 revision-6 migration must be asserted in the actual offline browser test.
 'tests/editorial-review-234.test.js','tests/editorial-review-232.test.js',
 'tests/editorial-review-233.test.js','tests/editorial-review-230.test.js',
 'tests/editorial-review-231.test.js',
 'tests/editorial-review-235.test.js',
 'tests/user-facing-copy-contract.test.js',
 '.github/visual/run-pwa-manual-update.js',
 '.github/visual/run-learning-effectiveness.js', // authentic revision4 migration browser regression
 '.github/visual/run-explanation-integration.js', // D002 formula contract change only; assert exact baseline delta below.
 '.github/visual/run-issue256-d001-d020.js',
 '.github/visual/run-ch11-12-final-explanations.js', // only adjust successor profile expectation; enforce exact baseline delta below.
 '.github/visual/run-content-progress-migration.js',
 '.github/workflows/visual-gate.yml' // bounded Issue256 browser acceptance additions
]);
const changed=git('diff','--name-only',BASE,'HEAD').split(/\n/u).filter(Boolean);
const uncommitted=git('diff','--name-only').split(/\n/u).filter(Boolean);
const untracked=git('ls-files','--others','--exclude-standard').split(/\n/u).filter(Boolean)
 .filter(p=>!p.startsWith('artifacts/')&&!p.startsWith('reports/baseline-current/')&&p!=='historical-quality/');
const all=[...new Set([...changed,...uncommitted,...untracked])].sort();
assert(all.includes('data/questions.js')&&all.includes('js/model.js')&&all.includes(GEN),'required graded successor and Generation lock missing');
assert(all.every(p=>allowed.has(p)),'Release236 out-of-scope files: '+all.filter(p=>!allowed.has(p)).join(','));
// Guard the visual harness: only update the previously obsolete D002 arithmetic rendering assertion.
const baselineVisual=old('.github/visual/run-explanation-integration.js').toString();
assert.equal(baselineVisual.split("'126,000 × 1 ÷ 4 = 31,500'").length,2,'D002 baseline formula assertion must be unique');
const acceptedVisual=baselineVisual.replace("'126,000 × 1 ÷ 4 = 31,500'","'126,000 ÷ 4 = 31,500'");
assert.equal(read('.github/visual/run-explanation-integration.js').toString(),acceptedVisual,'D002 visual gate must preserve all checks apart from the exact formula rendering update');
// Guard the Chapter 11/12 visual harness: only map the new decision worksheet format
// to its declared closingDecision explanation profile, preserving all original cases.
const ch11Baseline=old('.github/visual/run-ch11-12-final-explanations.js').toString();
const ch11Old="q.type==='correction'?'correction':q.id==='D019'?",ch11New="q.type==='correction'?'correction':q.format==='decision-worksheet-v2'?'closingDecision':q.id==='D019'?";
assert.equal(ch11Baseline.split(ch11Old).length,2,'Chapter11/12 expected profile baseline must be unique');
assert.equal(read('.github/visual/run-ch11-12-final-explanations.js').toString(),
 ch11Baseline.replace(ch11Old,ch11New),'Chapter11/12 visual audit must preserve all other checks');
for(const p of ['data/accounting-domain.js','data/accounting-oracle.js','js/engine.js','js/rpg.js','js/view.js','reports/auto-gate/audit-locks/phase-b-generation-189.json']){
 assert(read(p).equals(old(p)),'protected grading/state/historical bytes changed: '+p);
}
// Fixed predecessor SHA and exact transformed byte sequence are the ONLY allowed
// changes to the otherwise-protected Controller. This preserves scoring/state.
const controller197=cp.execFileSync('git',['show','a3a4f1b7575d4e1c4d81e8151513552c56d635c7:js/controller.js'],{encoding:'utf8',maxBuffer:16*1024*1024});
const approvedControllerPatches=[["      if (scene?.epilogue !== true || !Array.isArray(scene.epilogueFacts)) return [];\n      return scene.epilogueFacts.map(fact => {","      if (scene?.epilogue !== true || !Array.isArray(scene.epilogueFacts)) return [];\n      // Answer keys alone do not prove the learner has verified the work.\n      const verified = new Set(this.model?.verifiedCorrectIds?.() || this.model?.state?.correctIds || []);\n      return scene.epilogueFacts.map(fact => {\n        if (!verified.has(fact.questionId) || this.model?.isUnverified?.('correctIds', fact.questionId) === true) return null;"],["      const isResolved = resolved === true;","      const verified = new Set(this.model?.verifiedCorrectIds?.() || this.model?.state?.correctIds || []);\n      const isResolved = resolved === true && Boolean(question?.id) && verified.has(question.id) &&\n        this.model?.isUnverified?.('correctIds', question.id) !== true;"],["      Controller.prototype.renderNarrativeResolution.call(this, question, true);\n      this.view.renderAnswerComparison?.(question, flow.authoritativeScore, flow.authoritativeAnswer);","      // Coached correction is learning evidence, not an independently verified first answer.\n      Controller.prototype.renderNarrativeResolution.call(this, question, false);\n      this.view.renderAnswerComparison?.(question, flow.authoritativeScore, flow.authoritativeAnswer);"],["Controller.prototype.renderNarrativeResolution.call(this, this.questions[this.currentId], true); this.view.show('view-result'); this.document.getElementById?.('result-status')?.focus(); this.dispatchPendingGameOver(); return true;","Controller.prototype.renderNarrativeResolution.call(this, this.questions[this.currentId], false); this.view.show('view-result'); this.document.getElementById?.('result-status')?.focus(); this.dispatchPendingGameOver(); return true;"]];
let expectedController=controller197;
for(const [beforeText,afterText] of approvedControllerPatches){
 assert.equal(expectedController.split(beforeText).length,2,'Gen198 approved Controller replacement must be unique');
 expectedController=expectedController.replace(beforeText,afterText);
}
assert.equal(read('js/controller.js').toString(),expectedController,'Gen198 Controller must contain only approved Story mastery guards');
const context=src=>{
 const scope={window:{},console};const domain=read('data/accounting-domain.js').toString();
 vm.runInNewContext(domain,scope);scope.AccountingDomain=scope.window.AccountingDomain;
 vm.runInNewContext(src,scope,{timeout:15000});return scope.window.QuestionData;
};
const before=context(old('data/questions.js').toString()),now=context(read('data/questions.js').toString());
const gen195=context(cp.execFileSync('git',['show','594db5a397cbc90d4da8d241192e4f1db0af2540:data/questions.js'],{encoding:'utf8',maxBuffer:12*1024*1024}));
const E011_EVIDENCE="銀行取引明細：店舗の火災保険料24,000円が普通預金口座から引き落とされた記録",E011_PREVIOUS_EVIDENCE="店舗の火災保険料24,000円の支払通知",E011_BEFORE="店舗の火災保険の口座引落記録と帳簿を比べると、別の費用として処理されています。あなたは、支出目的の違いを確認します。",E011_OLD_BEFORE="店舗の火災保険に関する支払通知と帳簿を比べると、別の費用として処理されています。あなたは、支出目的の違いを確認します。";
const ids=Object.keys(before).sort(),edited=new Set(Array.from({length:17},(_,i)=>'D'+String(i+2).padStart(3,'0')));
assert.equal(ids.length,300);assert.deepEqual(Object.keys(now).sort(),ids);
const stable=o=>JSON.stringify(o,(k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const chronologyPlaces=Object.freeze({
 J030:'給与支給後の経理室。',J079:'給与支給後の経理室。',
 J080:'社会保険料の納付期限日の経理室。',J081:'固定資産税の納付書を確認する経理室。',
 J129:'給与支給後の経理室。',J130:'給与支給後の経理室。'
});
const applyChronology=(id,story)=>{
 if(!Object.hasOwn(chronologyPlaces,id))return story;
 const original='給与振込前日の経理室。';
 assert(story.startsWith(original),id+' original story has unexpectedly changed');
 return chronologyPlaces[id]+story.slice(original.length);
};

for(const id of ids){
 if(edited.has(id)){
  const q=now[id];assert.equal(q.type,'worksheet');assert.equal(q.format,'decision-worksheet-v2');
  assert(q.table.inputCells.length>0&&q.table.inputCells.length<=4);
  assert.equal(q.table.inputCells.length,Object.keys(q.answer.cells).length);
  assert(q.npcDialogue.includes('水野先輩')&&q.explanation.includes('【検算】'));
 } else if(['D019','D020'].includes(id)){
  const a=before[id],b=now[id];
  for(const k of new Set([...Object.keys(a),...Object.keys(b)])){
   if(['npcDialogue','nextHook'].includes(k))continue;
   if(id==='D020'&&k==='story'){
    assert.equal(b.story,'決算整理後試算表の確認を終えると、水野先輩は別件の帳簿締切資料を渡しました。前の試算表の数字は引き継がず、この資料の売上と費用だけを使います。あなたは各勘定を損益へ振り替え、当期純利益を繰越利益剰余金へ振り替えて締切額を確認してください。','D020 source-separation prose must remain exact');
    continue;
   }
   assert.equal(stable(a[k]),stable(b[k]),id+' protected worksheet task/source changed: '+k);
  }
 } else {
  const a=before[id],b=now[id];
  for(const k of new Set([...Object.keys(a),...Object.keys(b)])){
   if(id==='E011'&&k==='materials'){
    assert.equal(stable(b.materials),stable([{...gen195.E011.materials[0],evidence:E011_EVIDENCE}]),'E011 only evidence text may change');
    continue;
   }
   if(id==='E011'&&k==='explanation'){
    assert.equal(b.explanation,gen195.E011.explanation.replaceAll(E011_PREVIOUS_EVIDENCE,E011_EVIDENCE),'E011 generated explanation changes only where evidence is quoted');
    continue;
   }
   if(id==='E011'&&k==='story'){
    assert(gen195.E011.story.startsWith(E011_OLD_BEFORE),'E011 approved Gen195 preface must exist');
    assert.equal(b.story,E011_BEFORE+gen195.E011.story.slice(E011_OLD_BEFORE.length),'E011 exact preface-only correction');
    continue;
   }
   if(k==='story'&&/〔評価資料 \d+〕$/.test(a.story)){
    const original=a.story.replace(/〔評価資料 \d+〕$/,'');
    const allowedNotes=new Set(["J136", "J089", "J138", "J139", "J140", "L032", "T034", "T035", "T036", "T037", "T038", "T039", "T040", "E016", "E017", "E018", "E019", "E020", "F003", "F009", "F010", "C007", "C009", "C010"]);
    const chronologyOriginal=applyChronology(id,original);
    assert(b.story.startsWith(chronologyOriginal),id+' must preserve original authored scene');
    const note=b.story.slice(chronologyOriginal.length);
    if(allowedNotes.has(id))assert(note.length>=10&&note.length<=28&&note.endsWith('。'),id+' must have an authored evidence-specific scene cue');
    else assert.equal(note,'',id+' must only remove obsolete supplementary metadata label');
    assert(b.story.length<=120,id+' too long for mobile');
    continue;
   }
   if(k==='story'&&Object.hasOwn(chronologyPlaces,id)){
    assert.equal(b.story,applyChronology(id,a.story),id+' chronology-only sentence change');
    continue;
   }
   assert.equal(stable(a[k]),stable(b[k]),id+' non-story data changed unexpectedly: '+k);
  }
 }
}
// Matrix is immutable. Gen193 must enumerate its 126 source changes without
// falsely recertifying historical evidence or weakening its semantic assertions.
const matrixBaseline=cp.execFileSync('git',['show','702d723e0a00c8a2c0a8f9d4fd8dac6a068d2f36:tests/audit-matrix.test.js'],{encoding:'utf8',maxBuffer:8*1024*1024});
const matrixNow=read('tests/audit-matrix.test.js').toString();
assert.equal(matrixNow.includes('approvedPreStory.window.QuestionData'),true,'matrix source provenance delta must be pinned');
assert.equal(matrixNow.includes('obsoleteSupplementalLabels.length,126'),true,'matrix drift must require the exact 126 approved source records');
assert.equal(matrixNow.includes('const expectedStale=[...new Set([...baselineStale,...reviewedStoryChanges,...successorStories,...successorChanges,...obsoleteSupplementalLabels,...chronologySourceChanges,...e011EvidenceClarification])'),true,'matrix stale scope must include only authorized supplemental changes');
assert.equal(matrixNow.includes("old.window.QuestionData).ok,true"),true,'historical evidence must remain validated');
const model=require('../js/model');assert.equal(Object.keys(model.currentContentVersions(now)).length,21);
const gen=JSON.parse(read(GEN));assert.equal(gen.generation,198);assert.equal(gen.predecessor.generation,197);
const lifecycle=require('./qa/phase-b-lifecycle');
const committed=cp.spawnSync('git',['cat-file','-e','HEAD:'+GEN],{encoding:'utf8'}).status===0;
const r=committed?lifecycle.verifyCurrent():lifecycle.verifyCandidate(gen);
assert(r.ok,'Generation198 ledger integrity: '+r.errors.join('; '));
cp.execFileSync(process.execPath,['tests/issue256-release236-migration.test.js'],{stdio:'inherit'});
console.log('RELEASE236_GEN190_17_AUTHORED_DECISIONS_STRICT_SCOPE_PASS');
