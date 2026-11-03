'use strict';
// Release234 / Generation188: strictly scoped editorial successor.
// Because assessed content is IDENTICAL, do not invalidate mastery, XP or old exam evidence.
const assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process'),vm=require('node:vm'),crypto=require('node:crypto');
const Model=require('../js/model');
const BASE='c3689f0529e10519c71073acf6d75ec75bdd253a';
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const stable=v=>Array.isArray(v)?`[${v.map(stable).join(',')}]`:v&&typeof v==='object'?`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`:JSON.stringify(v);
const project=q=>({id:q.id,type:q.type,category:q.category,question:q.question,answer:q.answer,materials:q.materials,table:q.table,format:q.format||null,learningRole:q.learningRole||null,semantic:q.semantic||null});
const script=fs.readFileSync('data/questions.js','utf8'),beforeSource=cp.execFileSync('git',['show',`${BASE}:data/questions.js`],{encoding:'utf8',maxBuffer:16*1024*1024});
const load=src=>{const box={window:{},console};vm.runInNewContext(fs.readFileSync('data/accounting-domain.js','utf8'),box);box.AccountingDomain=box.window.AccountingDomain;vm.runInNewContext(src,box);return box.window.QuestionData;};
const old=load(beforeSource),now=load(script),ids=Object.keys(old).sort();assert.equal(ids.length,300);assert.deepEqual(Object.keys(now).sort(),ids);
const expectedIDs=Array.from({length:19},(_,i)=>`D${String(i+2).padStart(3,'0')}`),storyIDs=['D004','D013','D014','D015','D016','D017','D018','D019','D020'];
const expected=new Set(expectedIDs),expectedStory=new Set(storyIDs);
const metadata=JSON.parse(fs.readFileSync('reports/edu-quality/editorial-content-identity-234.json','utf8'));
assert.equal(metadata.schemaVersion,1);assert.equal(metadata.kind,'PROSE_ONLY_EDITORIAL_CONTENT_IDENTITY');
assert.equal(metadata.release,'20261103-234');assert.equal(metadata.previousRelease,'20261103-233');
assert.equal(metadata.predecessorSha,BASE);
assert.equal(metadata.predecessorQuestionsGitBlob,cp.execFileSync('git',['rev-parse',`${BASE}:data/questions.js`],{encoding:'utf8'}).trim());
assert.equal(metadata.successorQuestionsGitBlob,cp.execFileSync('git',['hash-object','data/questions.js'],{encoding:'utf8'}).trim());
assert.equal(metadata.canonicalIds,300);
assert.equal(metadata.assessmentSetSha256,sha(stable(ids.map(id=>project(old[id])))));
assert.equal(sha(stable(ids.map(id=>project(now[id])))),metadata.assessmentSetSha256,'assessment contracts (all300) changed');
assert.deepEqual(metadata.editedRecords.map(item=>item.id),expectedIDs);
const rawOld=cp.execFileSync('git',['show',`${BASE}:data/questions.js`]);
assert.equal(sha(rawOld),sha(beforeSource));
for(const id of ids){
  const o=old[id],n=now[id],changed=[...new Set([...Object.keys(o),...Object.keys(n)])].filter(key=>stable(o[key])!==stable(n[key])).sort();
  assert.deepEqual(changed,expected.has(id)?['explanation','explanationModel',...(expectedStory.has(id)?['story']:[])]:[],`${id} unauthorized data change`);
  assert.equal(stable(project(o)),stable(project(n)),`${id} assessed data changed`);
  if(!expected.has(id))continue;
  const row=metadata.editedRecords.find(r=>r.id===id);
  assert(row,`${id} missing content identity record`);
  assert.deepEqual(row.changedFields,changed,`${id} change fields metadata`);
  assert.equal(row.assessmentIdentity,sha(stable(project(o))),`${id} assessment identity mismatch`);
  for(const field of ['story','explanation','model']){
    const get=q=>field==='model'?stable(q.explanationModel):q[field];
    assert.equal(row.before[field],sha(get(o)),`${id}: original ${field} hash`);
    assert.equal(row.after[field],sha(get(n)),`${id}: revised ${field} hash`);
  }
  assert(!n.explanationModel.summary[0].text.includes('損益計算書と貸借対照表へ振り分け'),`${id} stale summary`);
  assert(!n.explanation.includes('整理後残高を損益計算書または貸借対照表へ振り分け'),`${id} stale prose`);
  if(id==='D019')assert(/試算表/.test(n.explanationModel.summary[0].text)&&/1,300,000/.test(n.explanation),`${id} corrected closing`);
  if(id==='D020')assert(/繰越利益剰余金/.test(n.explanationModel.summary[0].text)&&/180,000/.test(n.explanation),`${id} corrected profit`);
}
const store=value=>({value,writes:0,getItem(){return this.value},setItem(_k,s){this.value=s;this.writes++;return true;}});
const clone=x=>JSON.parse(JSON.stringify(x));
// Real model persistence: old, new, mixed attempts, and a record with missing history.
const date=Date.UTC(2026,10,3,12,0,0),oldStore=store(null),oldModel=new Model(old,oldStore,'progress');
oldModel.recordAttempt('D013',true,1200,'',false,date);
oldModel.record('D013',true,date);
oldModel.setDraft('D020',clone(old.D020.answer));
oldModel.state.examHistory=[{points:84,passed:true,finishedAt:date+1000,durationMs:120000}];
oldModel.refreshEvidenceIntegrity();assert(oldModel.save());
const originalState=clone(oldModel.state),originalBytes=oldStore.value;
const nextStore=store(originalBytes),nextModel=new Model(now,nextStore,'progress');
assert.equal(nextModel.storageWriteBlocked,undefined);
for(const field of ['questionStats','answeredIds','correctIds','incorrectIds','mistakeCounts','reviewSchedule','reviewAssignments','attempts','drafts','examHistory','contentMigrationArchive','contentRecheckIds','questionContentVersions','learningEffectiveness','learningEvidenceIntegrity']){
  assert.equal(stable(nextModel.state[field]),stable(originalState[field]),`${field} lost on editorial-only upgrade`);
}
assert.equal(nextStore.writes,0,'editorial-only upgrade must not rewrite preserved progress');
assert.equal(nextModel.state.contentRevision,5,'no grading identity revision for prose-only update');
nextModel.recordAttempt('D013',false,1400,'',false,date+2000);nextModel.record('D013',false,date+2000);assert(nextModel.save());
const mixedModel=new Model(now,store(nextStore.value),'progress');
assert.equal(mixedModel.state.questionStats.D013.correctCount,1);
assert.equal(mixedModel.state.questionStats.D013.incorrectCount,1);
assert.equal(mixedModel.state.attempts.filter(x=>(x.questionId||x.id)==='D013').length,2);
assert.equal(mixedModel.state.examHistory.length,1);
const newModel=new Model(now,store(null),'progress');assert.equal(newModel.state.attempts.length,0);assert.equal(newModel.state.contentRecheckIds.length,0);
const malformed=clone(originalState);malformed.contentRevision=6;
const corruptStore=store(JSON.stringify(malformed));const blocked=new Model(now,corruptStore,'progress');
assert.equal(blocked.storageWriteBlocked,true,'future revision must block all saves');
assert.equal(corruptStore.writes,0);assert.equal(corruptStore.value,JSON.stringify(malformed));
const imported=Model.prepareBackupState(originalState,now);
assert(imported,'old valid backup must prepare against new editorial content');
assert.equal(stable(imported.questionStats),stable(originalState.questionStats));
assert.equal(stable(Model.prepareBackupState(imported,now)),stable(imported),'backup import must be idempotent');
// Independent negative probes: the worksheet audit must reject removal of the
// actual learning objective, not demand an unrelated P/L and B/S procedure.
const worksheet=require('../scripts/qa/contract-runner').typeQuestionChecks.worksheet;
for(const [id,missing] of [['D002','保険料'],['D019','決算整理後残高試算表'],['D020','繰越利益剰余金']]){
 const question=clone(now[id]);
 assert.equal(worksheet.WORKSHEET_PL_BS(question),true,id+' exact task classification');
 question.explanation=question.explanation.replaceAll(missing,'');
 assert.equal(worksheet.WORKSHEET_PL_BS(question),false,id+' corrupted objective MUST be caught');
}
for(const id of expectedIDs)assert(Array.isArray(now[id].explanationModel.summary)&&now[id].explanationModel.summary.every(x=>typeof x.text==='string'&&x.text.length>15),id+' authored summary');
console.log('RELEASE234_EDITORIAL_IDENTITY_AND_MIGRATION_PASS: 300/300 assessed contracts, 19/9 prose patches, 4 save histories, tamper blocked');
