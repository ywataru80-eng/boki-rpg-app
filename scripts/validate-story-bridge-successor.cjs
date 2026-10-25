'use strict';
// Release224 RPG-ONLY successor: limit the correction to four BOSS-to-event story bridges.
// The same validator accepts an explicitly dirty, narrowly scoped precommit candidate
// and a committed clean candidate. Immutable historical generations require full Git history.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const cp=require('node:child_process');
const crypto=require('node:crypto');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const baseline='eaf04671df4c892a8cfaff157926299b56125775';
const older='20261025-223',release='20261025-224';
const generationPath='reports/auto-gate/audit-locks/phase-b-generation-175.json';
const git=(...args)=>cp.execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:64*1024*1024}).trim();
const original=p=>cp.execFileSync('git',['show',`${baseline}:${p}`],{cwd:root,encoding:'utf8',maxBuffer:64*1024*1024});
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const digest=p=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex');
const expected=[
  '.github/workflows/question-quality-ledger-audit.yml','.github/workflows/verify.yml','form-a.html','index.html','js/view.js',
  'pwa-release-manifest.json',generationPath,'scripts/validate-story-bridge-successor.cjs',
  'service-worker.js','tests/audit-matrix.test.js','tests/story-business-decision.test.js'
].sort();
assert.equal(git('merge-base',baseline,'HEAD'),baseline,'must preserve accepted Release223 as ancestor');
const listed=args=>git(...args).split('\n').filter(Boolean);
// The unchanged Form A unit test writes this report during npm run verify.
// It is execution evidence, never an allowed tracked source modification.
const generatedReport='artifacts/form-a-grade-results.json';
// GitHub's canonical-ledger job checks out a fixed, independently validated historical
// source *inside* the worktree. Git sees that nested checkout as one untracked directory.
// Never broadly ignore untracked files: exempt only this exact clean checkout in its CI job.
const historicalCheckout='historical-quality/';
const untracked=listed(['ls-files','--others','--exclude-standard']);
if(untracked.includes(historicalCheckout)){
 const historicalDir=path.join(root,'historical-quality');
 assert.equal(process.env.GITHUB_ACTIONS,'true','historical fixture exemption requires GitHub Actions');
 assert.equal(process.env.GITHUB_JOB,'ledger','historical fixture exemption only applies to canonical-ledger job');
 assert(fs.existsSync(historicalDir) && fs.lstatSync(historicalDir).isDirectory()
   && !fs.lstatSync(historicalDir).isSymbolicLink(),'historical fixture must be a real directory');
 assert.equal(git('-C',historicalDir,'rev-parse','--show-toplevel'),historicalDir,
   'historical fixture must be its own Git checkout');
 assert.equal(git('-C',historicalDir,'rev-parse','HEAD'),
   '37086c6ae6511a249218533375bf6f19dac231d1',
   'historical fixture must match immutable Release214 source');
 assert.equal(git('-C',historicalDir,'status','--porcelain','--untracked-files=all'),'',
   'historical fixture checkout must be clean');
}
const changed=[...new Set([
 ...listed(['diff','--name-only',baseline,'HEAD']),
 ...listed(['diff','--name-only','HEAD']),
 ...listed(['diff','--cached','--name-only']),
 ...untracked.filter(p=>p!==generatedReport && p!==historicalCheckout)
])].sort();
assert.deepEqual(changed,expected,'Release224 requires exactly eleven approved files, no unrelated product edits');
for(const p of [
 'data/questions.js','data/accounting-domain.js','data/accounting-oracle.js','data/form-a.json',
 'js/model.js','js/rpg.js','js/engine.js','js/feedback.js','js/controller.js','js/app.js',
 'js/explanation-model.js','js/explanation-formulas.js','js/explanation-design-system.js',
 'css/style.css','css/form-a.css','manifest.webmanifest','package.json',
 'reports/auto-gate/audit-locks/phase-b-generation-174.json',
 'scripts/validate-story-milestone-successor.cjs'
])assert.equal(read(p),original(p).toString('utf8'),`${p} must remain byte-identical to Release223`);
assert.equal(digest('reports/auto-gate/audit-locks/phase-b-generation-174.json'),
 '7f5549d074eb5bdd440f3f3f7aae2191a462f2ea5959ac52eff9774e2c273013',
 'immutable Generation174 raw bytes changed');
for(const p of ['index.html','form-a.html','service-worker.js']){
 const previous=original(p).toString('utf8');
 assert(previous.includes(older),p+' had no previous release token');
 assert.equal(read(p),previous.replaceAll(older,release),p+' may only advance release token');
}
const previousView=original('js/view.js').toString('utf8').split('\n');
const currentView=read('js/view.js').split('\n');
assert.equal(currentView.length,previousView.length,'no View lines may be added or removed');
const changedViewLines=currentView.map((line,i)=>line!==previousView[i]?i+1:0).filter(Boolean);
assert.deepEqual(changedViewLines,[803,805,806,810],'exactly four previously accepted chapter objects may change');
const bridgeChecks=[
 [803,['小口現金を精算・補給','現金過不足','領収証','原因未判明']],
 [805,['使用した収入印紙','租税公課','預り金','会社負担']],
 [806,['固定資産台帳','減価償却','総勘定元帳','残高']],
 [810,['仕入代金を支払手形','仮受・仮払','納付','別資料']]
];
for(const [line,parts] of bridgeChecks){
 assert(currentView[line-1].includes("{case:"),`line ${line} must stay a chapter case record`);
 for(const phrase of parts)assert(currentView[line-1].includes(phrase),`line ${line} missing bridge: ${phrase}`);
 for(const field of ['objective:','valid:','trap:','why:','next:'])
  assert(currentView[line-1].includes(field),`line ${line} missing case field: ${field}`);
}
const oldTest=original('tests/story-business-decision.test.js').toString('utf8');
const anchor="  assert(flat(casePanel).includes('3分の振り返り目標'),'short opt-in reflection');";
const injected=[
 "  const bridges = {4:['小口現金を精算・補給','現金過不足'], 6:['収入印紙','預り金'], 7:['固定資産台帳','元帳'], 11:['支払手形','消費税']};",
 "  for (const phrase of bridges[chapter] || []) assert(flat(casePanel).includes(phrase), 'chapter '+chapter+' BOSS-to-story bridge: '+phrase);",
 "  if (chapter === 11) {",
 "    assert.equal(context.window.QuestionData.J149.category, '支払手形', 'use final runtime override, not initial literal');",
 "    assert(context.window.QuestionData.J149.question.includes('約束手形を振り出した'));",
 "  }"
].join('\n');
assert.equal(oldTest.split(anchor).length-1,1,'existing Story test insertion point must be unique');
assert.equal(read('tests/story-business-decision.test.js'),oldTest.replace(anchor,anchor+'\n'+injected),
 'Story regressions must only add the four chapter bridge assertions');
const oldMatrix=original('tests/audit-matrix.test.js').toString('utf8');
const matrixAnchor="  '20261025-223':'scripts/validate-story-milestone-successor.cjs'";
assert.equal(oldMatrix.split(matrixAnchor).length-1,1,'historical test validator anchor must be unique');
assert.equal(read('tests/audit-matrix.test.js'),oldMatrix.replace(matrixAnchor,matrixAnchor+",\n  '20261025-224':'scripts/validate-story-bridge-successor.cjs'"),
 'Release224 must only add one approved test validator route');
const previousVerify=original('.github/workflows/verify.yml').toString('utf8');
const storyGateAnchor='      - run: npm run qa:integrity\n';
assert.equal(previousVerify.split(storyGateAnchor).length-1,1,
  'baseline verify workflow must contain exactly one integrity gate');
assert.equal(read('.github/workflows/verify.yml'),
  previousVerify.replace(storyGateAnchor,storyGateAnchor+'      - run: npm run qa:story\n'),
  'always-triggered verify job must execute all four mandatory npm gates');
const oldWorkflow=original('.github/workflows/question-quality-ledger-audit.yml').toString('utf8');
const workflowAnchor="            '20261025-223': 'scripts/validate-story-milestone-successor.cjs'";
assert.equal(oldWorkflow.split(workflowAnchor).length-1,1,'CI validator anchor must be unique');
assert.equal(read('.github/workflows/question-quality-ledger-audit.yml'),oldWorkflow.replace(workflowAnchor,
 workflowAnchor+",\n            '20261025-224': 'scripts/validate-story-bridge-successor.cjs'"),
 'Release224 must only add one approved CI validator route');
const m=JSON.parse(read('pwa-release-manifest.json'));
const oldM=JSON.parse(original('pwa-release-manifest.json').toString('utf8'));
assert.equal(m.release,release);assert.equal(m.previousRelease,older);
assert.deepEqual(Object.keys(m.assets),Object.keys(oldM.assets));
assert.deepEqual(Object.keys(m.pages),Object.keys(oldM.pages));
assert.equal(Object.keys(m.assets).length,20);
for(const [p,expectedHash] of Object.entries({...m.assets,...m.pages}))assert.equal(digest(p),expectedHash,`${p} asset SHA256`);
const phase=require('./qa/phase-b-lifecycle');
const previous=JSON.parse(read('reports/auto-gate/audit-locks/phase-b-generation-174.json'));
const candidate=JSON.parse(read(generationPath));
assert.equal(candidate.generation,175);assert.equal(candidate.phase,'B_GENERATION');
assert.deepEqual(candidate.predecessor,phase.identity(previous),'exact immutable Generation174 predecessor');
let committed=false;
try{git('cat-file','-e',`HEAD:${generationPath}`);committed=true;}catch(_){/* local precommit candidate */}
if(committed){
 assert.equal(git('status','--porcelain','--untracked-files=no'),'','committed Release224 tracked files must be clean');
 const result=phase.verifyCurrent();assert(result.ok,'Generation175 committed authority failed: '+result.errors.join('; '));
 assert.equal(result.generation,175);
}else{
 const result=phase.verifyCandidate(candidate);assert(result.ok,'Generation175 precommit candidate failed: '+result.errors.join('; '));
}
console.log(`PASS Release224 ${committed?'committed':'precommit'}: 11 scoped files, 4 story bridges, 300 immutable, 20 PWA hashes, Generation175 continuity`);
