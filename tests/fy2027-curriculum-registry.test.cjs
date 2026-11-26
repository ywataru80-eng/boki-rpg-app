'use strict';
const assert=require('node:assert/strict'), fs=require('node:fs'), vm=require('node:vm'), crypto=require('node:crypto');
const {deriveOriginal,deriveReplacement}=require('./fy2027-visible-derive.cjs');
const w={};const ctx={window:w,console};
for(const p of ['data/accounting-domain.js','data/questions.js','data/accounting-oracle.js','data/fy2027-curriculum.js','js/model.js','js/engine.js','js/view.js','js/controller.js'])vm.runInNewContext(fs.readFileSync(p,'utf8'),ctx,{filename:p});
const R=w.CurriculumRegistry,M=w.ProgressModel,C=w.AppController,V=w.AppView,active=R.active('FY2026');
const plain=x=>JSON.parse(JSON.stringify(x));
const canonical=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(canonical).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
const digest=v=>crypto.createHash('sha256').update(canonical(v)).digest('hex');
assert.equal(Object.keys(active.questions).length,300);assert.equal(active.examPool.length,74);assert.deepEqual(plain(active.questions),plain(w.QuestionData));assert.deepEqual(plain(active.examPool),plain(w.ExamPoolDefinition));
assert.equal(R.candidateIds().length,28);assert.equal(R.officialFY2027Ids().length,0);assert(Object.isFrozen(R));assert(Object.isFrozen(active.questions));assert(Object.isFrozen(active.examPool));
for(const y of [null,2027,'FY2027','FY2027-CANDIDATE','exam','review','__proto__'])assert.equal(R.active(y),null);
for(const [id,q] of Object.entries(active.questions)){assert.equal(digest(q),R.identity(id).contentDigest,id);assert.deepEqual(plain(R.history('FY2026',id)),plain(q));assert.equal(R.inspectCandidate(id),null);assert.equal(R.history('FY2027',id),null);}
let labels=0;
for(const id of R.candidateIds()){
 const q=R.inspectCandidate(id);assert.equal(digest(q),R.identity(id).contentDigest,id);assert.equal(R.identity(id).fy2027Approved,false);assert.equal(q.examReadiness,'NOT_APPROVED');assert(!Object.hasOwn(active.questions,id));assert(!active.examPool.includes(id));assert.equal(R.history('FY2026',id),null);
 const expected=(q.source?deriveOriginal:deriveReplacement)({question:q.question,materials:q.materials,table:q.table});assert.equal(canonical(expected),canonical(q.answer),id);assert(w.GradingEngine.grade(q,expected).correct,id);
 const blank=q.type==='journal'?{debit:[],credit:[]}:{cells:{}};assert(!w.GradingEngine.grade(q,blank).correct,id+' blank');
 const wrong=plain(expected);if(q.type==='journal')wrong.debit[0].amount++;else{const cell=Object.keys(wrong.cells).find(k=>typeof wrong.cells[k]==='number');wrong.cells[cell]++;}assert(!w.GradingEngine.grade(q,wrong).correct,id+' wrong');
 if(q.table)for(const cell of q.table.inputCells){assert.equal(V.prototype.cellLabel.call({},q,cell),q.table.inputMetadata[cell].label,id+':'+cell);labels++;}
 q.question='mutated';q.examReadiness='APPROVED';assert.notEqual(R.inspectCandidate(id).question,'mutated');assert.equal(R.inspectCandidate(id).examReadiness,'NOT_APPROVED');const e=R.identity(id);e.fy2027Approved=true;assert.equal(R.identity(id).fy2027Approved,false);
}
const c=Object.create(C.prototype);Object.assign(c,{questions:active.questions,ids:Object.keys(active.questions),examPool:active.examPool});assert.equal(c.examCandidateIds().length,74);assert(c.learningIds().every(id=>!id.startsWith('FY27-')));assert(c.storyIds().every(id=>!id.startsWith('FY27-')));
// The active product startup receives ONLY the approved legacy catalog and its pool.
const appCtx={window:w,document:{addEventListener(){},currentScript:{src:'https://example.test/js/app.js?v=20261126-247'}},location:{protocol:'file:'},navigator:{},URL,URLSearchParams};vm.runInNewContext(fs.readFileSync('js/app.js','utf8'),appCtx);
let startup;const actual=w.AppController;w.AppController=class{constructor(_d,questions,pool){startup={questions,pool};}init(){}};w.App.setupInstallPrompt=()=>{};w.App.start();w.AppController=actual;assert.equal(startup.questions,active.questions);assert.equal(startup.pool,active.examPool);
// Old drafts, observations and in-progress exam survive the actual model load, even with an archive candidate registered.
const bytes={};const store={getItem:k=>bytes[k]??null,setItem(k,v){bytes[k]=v;return true;},removeItem(k){delete bytes[k];return true;}};
const legacy=new M(w.QuestionData,store,'p',w.ExamPoolDefinition);assert(legacy.save());assert(legacy.setDraft('J019',plain(w.QuestionData.J019.answer)));assert(legacy.recordAttempt('J019',true,100,'',false,1000));
const ids=[...active.examPool].slice(0,14);if(!ids.includes('J147'))ids.push('J147');else ids.push(active.examPool.find(id=>!ids.includes(id)));const session={...M.examProfile2026(),ids,startedAt:2000,endAt:3602000,status:'RUNNING',scores:{},evidenceVersion:1};assert(legacy.commitExamSession(session,false));assert(legacy.setDraft('J147',plain(w.QuestionData.J147.answer)));
const old=plain(legacy.state);const migrated=new M(startup.questions,store,'p',startup.pool);assert(!migrated.storageWriteBlocked);assert.deepEqual(plain(migrated.state),old);assert(migrated.validExamSession(migrated.state.examSession));assert(M.validateBackupState(migrated.state,active.questions,active.examPool));const candidateId=R.candidateIds()[0],before=bytes.p;
assert.equal(migrated.setDraft(candidateId,{debit:[],credit:[]}),false);assert.equal(migrated.recordAttempt(candidateId,true,100,'',false,2100),false);assert.equal(bytes.p,before);
const poisoned=plain(migrated.state);poisoned.examSession.ids[0]=candidateId;assert(!M.validateBackupState(poisoned,active.questions,active.examPool));
assert.equal(C.prototype.openRelated.call({questions:active.questions},candidateId),false);assert.equal(C.prototype.start.call({questions:active.questions},candidateId),undefined);
const route=w.App.initialRoute('?year=FY2027&mode=story&question='+candidateId);assert.equal(route.questionId,candidateId);assert(!Object.hasOwn(startup.questions,route.questionId));
console.log(JSON.stringify({legacyContent:300,candidatesIndependentlyCalculated:28,metadataLabels:labels,officialFY2027:0,oldDraftHistoryExam:'PASS',startupIsolation:'PASS'}));
