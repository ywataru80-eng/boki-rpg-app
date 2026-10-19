'use strict';
// Fixed-source audit report validation only; no product grading or data writes.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib'),vm=require('node:vm'),cp=require('node:child_process');
const root=path.resolve(__dirname,'../..');
const {loadQuestions,evidenceStamp}=require(path.join(root,'scripts/audit-matrix'));
const stable=x=>Array.isArray(x)?x.map(stable):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,stable(x[k])])):x;
const hash=x=>'sha256:'+crypto.createHash('sha256').update(JSON.stringify(stable(x))).digest('hex');
const bytesHash=x=>crypto.createHash('sha256').update(x).digest('hex');
const clone=x=>JSON.parse(JSON.stringify(x));
const original=JSON.parse(fs.readFileSync(path.join(__dirname,'question-quality-ledger-20261015.json'),'utf8'));
const bundleBytes=fs.readFileSync(path.join(root,original.evidenceBundle.path));
const bundle=JSON.parse(zlib.gunzipSync(bundleBytes));
const structure=JSON.parse(bundle['audit300/structure.json']);
const visible=JSON.parse(bundle['audit300/visible-explanations.json']);
const provenance=Object.fromEntries(JSON.parse(bundle['audit300/evidence-review.json']).perId.map(r=>[r.id,r]));
const reviewFiles=['review-j001-j075.json','review-j076-j150.json','review-ledger.json','review-nonjournal.json'];
const reviews={};
for(const file of reviewFiles)for(const row of JSON.parse(bundle['audit300/'+file]).rows){assert(!reviews[row.id]);reviews[row.id]={file,row};}
assert.equal(Object.keys(reviews).length,300);
const sandbox={window:{}};vm.createContext(sandbox);
for(const file of ['data/accounting-domain.js','data/questions.js','js/explanation-formulas.js','js/explanation-model.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),sandbox,{filename:file});
const models=Object.fromEntries(Object.entries(sandbox.window.QuestionData).map(([id,q])=>[id,sandbox.window.ExplanationModel.build(q,q.answer,{correct:true})]));
const taxonomy=Object.fromEntries(JSON.parse(fs.readFileSync(path.join(root,'reports/edu-quality/question-taxonomy-2026.json'),'utf8')).rows.map(r=>[r.id,r]));
const criteria=['correctness','judgement_reason','calculation','beginner_explanation','ui_ux','learning_connection'];
const statuses=['PASS','FAIL','IMPROVEMENT','UNVERIFIED','NOT APPLICABLE'];
const verdicts=['ACCEPTED','DEFECT','IMPROVEMENT CANDIDATE','UNVERIFIED'];
const git=args=>cp.execFileSync('git',args,{cwd:root,maxBuffer:32*1024*1024});
const verdictFor=row=>{const states=criteria.map(k=>row.assessments[k].status);return states.includes('FAIL')?'DEFECT':states.includes('UNVERIFIED')?'UNVERIFIED':states.includes('IMPROVEMENT')?'IMPROVEMENT CANDIDATE':'ACCEPTED';};
const count=rows=>Object.fromEntries(verdicts.map(v=>[v,rows.filter(r=>r.overall===v).length]));
const groups=(rows,key)=>Object.fromEntries([...new Set(rows.map(r=>r[key]))].sort((a,b)=>typeof a==='number'?a-b:String(a).localeCompare(String(b))).map(k=>{const part=rows.filter(r=>r[key]===k);return[k,{total:part.length,overall:Object.fromEntries(Object.entries(count(part)).filter(([,n])=>n))}];}));
function summaryFor(rows){return {total:rows.length,overall:count(rows),byType:groups(rows,'type'),byChapter:groups(rows,'chapter'),reusedEvidenceUniqueIds:rows.filter(r=>r.evidence.B.reused==='EXACT_MAIN_ACCOUNTING_QA').length,reusedVisibleIds:rows.filter(r=>!r.newVerification.visibleRenderer).length,newSemanticReviews:rows.filter(r=>r.evidence.C.newSemanticRead).length,newIndependentCalculations:rows.filter(r=>r.newIndependentCalculation).length,newVisibleIds:rows.filter(r=>r.newVerification.visibleRenderer).length,newVisibleCases:rows.reduce((n,r)=>n+r.evidence.A.newVisibleRecords.length,0),learnerUnverified:rows.filter(r=>r.evidence.D.status==='UNVERIFIED').length,P0:rows.filter(r=>r.severity==='P0').length,P1:rows.filter(r=>r.severity==='P1').length,P2:rows.filter(r=>r.severity==='P2').length};}
// Explicit projection is shared with the frozen report format; full text stays in bundle.
function visibleProjection(r){return {...Object.fromEntries(['engine','width','gradedCorrect','sourceUnchanged','resultVisible','explanationVisible','summaryVisible','overflow','violations'].map(k=>[k,r[k]])),initialVisibleTextHash:hash(r.initialVisibleText),supplements:r.supplements.map(s=>({label:s.label,closed:s.closed,textHash:hash(s.DOMText)}))};}
function verifyVisible(rows,artifact){
 assert.equal(artifact.main,structure.head);assert.equal(artifact.status,'PASS');assert.equal(artifact.failures.length,0);assert.equal(artifact.records.length,724);
 const credited=rows.filter(r=>r.newVerification.visibleRenderer).map(r=>r.id).sort();
 assert.deepEqual(artifact.ids.slice().sort(),credited);assert.equal(new Set(credited).size,181);
 const keys=artifact.records.map(r=>r.id+'/'+r.engine+'/'+r.width),expected=credited.flatMap(id=>['chromium','webkit'].flatMap(engine=>[390,1280].map(width=>id+'/'+engine+'/'+width)));
 assert.equal(new Set(keys).size,keys.length);assert.deepEqual(keys.sort(),expected.sort());
 for(const r of artifact.records){assert(r.gradedCorrect&&r.sourceUnchanged&&r.resultVisible&&r.explanationVisible&&r.summaryVisible);assert.equal(r.violations.length,0);assert(r.supplements.every(s=>s.closed));}
 for(const row of rows){const p=provenance[row.id];assert.deepEqual(row.evidence.A.reusedDOM,p.A_DOM);assert.deepEqual(row.evidence.A.visibility,p.A_visible);assert.deepEqual(row.assessments.ui_ux.scope,p.A_visible);assert.equal(row.assessments.ui_ux.status,'PASS');assert.deepEqual(row.evidence.A.newVisibleRecords,artifact.records.filter(r=>r.id===row.id).map(visibleProjection));}
}
const number=x=>{const n=Number(String(x).replaceAll(',',''));assert(Number.isSafeInteger(n)&&n>=0);return n;};
function recalculationsFrom(questions){
 const receipts=number(questions.L044.materials[0]['収入']),payments=number(questions.L044.materials[1]['支出']);
 const deposits=number(questions.L045.materials[0]['預入']),withdrawals=number(questions.L045.materials[1]['引出']);
 const text=questions.C003.materials.map(r=>r['内容']).join('\n');
 const annualMatch=text.match(/従来備品[\d,]+円を年額([\d,]+)円/),sale=text.match(/原価([\d,]+)円、期首累計([\d,]+)円）を([\d,]+)円で売却、当期(\d+)か月分([\d,]+)円/);
 assert(annualMatch&&sale,'C003 visible source operands');
 const annual=number(annualMatch[1]),cost=number(sale[1]),prior=number(sale[2]),proceeds=number(sale[3]),months=number(sale[4]),depreciation=number(sale[5]);
 assert(months>0&&months<=12);const soldAnnual=depreciation*12/months,remaining=annual-soldAnnual,loss=cost-prior-depreciation-proceeds;
 return [{id:'L044',given:{receipts,payments},formula:`opening+${receipts}-${payments}`,counterexamples:[{hypotheticalOpening:0,closing:receipts-payments},{hypotheticalOpening:10000,closing:10000+receipts-payments}],conclusion:'opening unspecified; two source-compatible results',notProductCondition:'10000 is an isolated counterexample, not a new authored fact.'},{id:'L045',given:{deposits,withdrawals},formula:`opening+${deposits}-${withdrawals}`,counterexamples:[{hypotheticalOpening:0,closing:deposits-withdrawals},{hypotheticalOpening:10000,closing:10000+deposits-withdrawals}],conclusion:'opening unspecified; two source-compatible results',notProductCondition:'10000 is an isolated counterexample, not a new authored fact.'},{id:'C003',given:{soldAssetSixMonthDepreciation:depreciation,months,oldAssetsAnnualDepreciation:annual,cost,priorAccumulatedDepreciation:prior,proceeds},formulas:[`${depreciation}*12/${months}=${soldAnnual}`,`${annual}-${soldAnnual}=${remaining}`,`${cost}-${prior}-${depreciation}-${proceeds}=${loss}`],expected:{remainingOldDepreciation:remaining,disposalLoss:loss}}];
}
function validate(report,questions=loadQuestions(),artifact=visible){
 assert.equal(report.schemaVersion,1);assert.equal(report.rows.length,300);assert.equal(Object.keys(questions).length,300);
 assert.equal(hash(questions),report.baseline.runtimeHash);assert.equal(report.baseline.runtimeHash,structure.runtimeHash);assert.equal(report.baseline.modelHash,structure.modelHash);assert.equal(hash(models),report.baseline.modelHash);
 assert.match(report.baseline.head,/^[a-f0-9]{40}$/);assert.match(report.baseline.tree,/^[a-f0-9]{40}$/);assert.equal(report.baseline.head,structure.head);assert.equal(report.baseline.tree,structure.tree);
 assert.equal(git(['rev-parse',report.baseline.head+'^{tree}']).toString().trim(),report.baseline.tree,'actual audited Git tree');
 assert.equal(report.baseline.generation,158);assert.equal(report.baseline.release,'20261014-214');
 const codeKeys=[...Object.keys(visible.sourceSha256),'js/controller.js','js/app.js','js/model.js','js/rpg.js','index.html','reports/edu-quality/question-taxonomy-2026.json'];assert.deepEqual(Object.keys(report.baseline.codeHashes).sort(),codeKeys.sort());
 for(const[file,digest]of Object.entries(report.baseline.codeHashes)){assert.equal(bytesHash(fs.readFileSync(path.join(root,file))),digest,'current code drift '+file);assert.equal(bytesHash(git(['show',report.baseline.head+':'+file])),digest,'fixed Git content '+file);}
 assert.equal(bytesHash(bundleBytes),report.evidenceBundle.sha256);assert.deepEqual(Object.keys(bundle).sort(),Object.keys(report.evidenceBundle.files).sort());for(const[name,text]of Object.entries(bundle)){assert(!path.isAbsolute(name)&&!name.split('/').includes('..'));assert.equal(bytesHash(Buffer.from(text)),report.evidenceBundle.files[name]);}
 const ids=new Set(report.rows.map(r=>r.id));assert.equal(ids.size,300);assert.deepEqual([...ids].sort(),Object.keys(questions).sort());assert.equal(hash([...ids].sort()),report.baseline.canonicalIdsHash);assert.equal(report.baseline.canonicalIdsHash,structure.canonicalIdsHash);
 for(const row of report.rows){const q=questions[row.id],review=reviews[row.id];assert(review);assert.equal(row.chapter,q.chapter);assert.equal(row.topic,q.category);assert.equal(row.type,q.type);assert.equal(row.identity.runtimeContentHash,hash(q));assert.equal(row.identity.answerHash,hash(q.answer));assert.equal(row.identity.authoredExplanationHash,hash(q.explanation));const stamp=evidenceStamp(q);assert.equal(row.identity.legacySourceHash,stamp.sourceHash);assert.equal(row.identity.legacyAnswerSchemaHash,stamp.answerSchemaHash);assert.equal(row.identity.structuredModelHash,hash(models[row.id]));assert.equal(row.identity.taxonomyRowHash,hash(taxonomy[row.id]));assert.equal(row.cognitiveLevel,taxonomy[row.id].cognitiveLevel);assert.equal(row.learningRole,q.learningRole);assert.equal(row.format,q.format||'default');
  for(const k of criteria){assert(statuses.includes(row.assessments[k].status));assert(row.assessments[k].note.length>0);if(k!=='ui_ux')assert.deepEqual(row.assessments[k],review.row[k],'bundled semantic assessment '+row.id+'/'+k);}
  assert.equal(row.overall,review.row.overall);assert.equal(row.overall,verdictFor(row),'FAIL > UNVERIFIED > IMPROVEMENT precedence');assert.equal(row.severity,review.row.severity);assert.deepEqual(row.diagram,review.row.diagram);assert.equal(row.improvement,review.row.improvement);assert.equal(row.newIndependentCalculation,review.row.newIndependentCalculation);assert.equal(row.evidence.C.reviewSource,review.file);assert.equal(row.evidence.C.sourceQuote,review.row.judgement_reason.sourceQuote);assert(q.explanation.includes(row.evidence.C.sourceQuote));assert.equal(row.evidence.D.status,'UNVERIFIED');assert.equal(row.evidence.C.status,{'ACCEPTED':'PASS','DEFECT':'FAIL','IMPROVEMENT CANDIDATE':'IMPROVEMENT','UNVERIFIED':'UNVERIFIED'}[row.overall]);assert.equal(row.evidence.B.status,row.assessments.correctness.status);
 }
 verifyVisible(report.rows,artifact);assert.deepEqual(report.independentRecalculations,recalculationsFrom(questions),'source-bound arithmetic records');assert.deepEqual(report.rows.filter(r=>r.newIndependentCalculation).map(r=>r.id).sort(),report.independentRecalculations.map(r=>r.id).sort());assert.deepEqual(report.summary,summaryFor(report.rows),'all published groups/counters');return count(report.rows);
}
const counts=validate(original);let rejected=0;const negative=mutate=>{const altered=clone(original);mutate(altered);assert.throws(()=>validate(altered));rejected++;};
negative(r=>r.rows[0].id=r.rows[1].id);negative(r=>r.summary.overall.ACCEPTED++);negative(r=>r.rows.find(x=>x.id==='L044').overall='ACCEPTED');negative(r=>r.rows[0].evidence.C.sourceQuote='fabricated quote');negative(r=>r.rows[0].assessments.calculation.status='VERIFIED');const changed=clone(loadQuestions());changed.L039.explanation+=' tampered';assert.throws(()=>validate(original,changed));rejected++;
negative(r=>r.rows[0].identity.structuredModelHash='sha256:fake');negative(r=>r.rows[0].identity.taxonomyRowHash='sha256:fake');negative(r=>r.rows[0].evidence.C.status='FAIL');negative(r=>r.baseline.modelHash='sha256:fake');
negative(r=>r.rows[0].assessments.beginner_explanation.note+=' false note');negative(r=>r.baseline.head='1'.repeat(40));negative(r=>r.baseline.tree='2'.repeat(40));negative(r=>{const row=r.rows.find(x=>x.id==='L044');row.overall='IMPROVEMENT CANDIDATE';row.evidence.C.status='IMPROVEMENT';row.assessments.ui_ux.status='IMPROVEMENT';r.summary.overall.DEFECT--;r.summary.overall['IMPROVEMENT CANDIDATE']++;});
negative(r=>r.rows.find(x=>x.newVerification.visibleRenderer).evidence.A.newVisibleRecords[0].initialVisibleTextHash='sha256:fake');const wrongMatrix=clone(visible);wrongMatrix.records[0]=clone(wrongMatrix.records[1]);assert.throws(()=>validate(original,loadQuestions(),wrongMatrix));rejected++;
negative(r=>r.independentRecalculations[0].given.receipts++);negative(r=>r.independentRecalculations[2].formulas[0]='wrong formula');negative(r=>r.summary.P1=0);negative(r=>delete r.summary.byType.ledger);negative(r=>r.summary.total=299);negative(r=>delete r.baseline.codeHashes['js/engine.js']);
console.log(JSON.stringify({status:'PASS',baseline:original.baseline,total:300,overall:counts,newVisibleCases:visible.records.length,negativeCasesRejected:rejected,learner:'UNVERIFIED'},null,2));
