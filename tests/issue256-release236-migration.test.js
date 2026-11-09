'use strict';
/* Issue #256 successor P1: independent effective assessment, v5/v6 historical
 * data safety. The old source comes from immutable main SHA, not QA fixtures.
 * This is a candidate test. Do not certify legacy release235 validation from it.
 */
const assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process'),vm=require('node:vm');
const BASE='177dadd83369b0c1bd0c95db4af379ea35515c67';
const old=path=>cp.execFileSync('git',['show',BASE+':'+path],{encoding:'utf8',maxBuffer:12*1024*1024});
function load(questions,model,rpg){
 const w={window:{},console};vm.runInNewContext(questions,w);vm.runInNewContext(model,w);
 if(rpg)vm.runInNewContext(rpg,w);return w.window;
}
const current=load(fs.readFileSync('data/questions.js','utf8'),fs.readFileSync('js/model.js','utf8'),fs.readFileSync('js/rpg.js','utf8'));
const previous=load(old('data/questions.js'),old('js/model.js'),old('js/rpg.js'));
const now=current.QuestionData,before=previous.QuestionData,Model=current.ProgressModel,Old=previous.ProgressModel;
const ids=Object.keys(before).sort();
const edited=Array.from({length:17},(_,i)=>'D'+String(i+2).padStart(3,'0'));
const chronologyPlaces=Object.freeze({
 J030:'給与支給後の経理室。',J079:'給与支給後の経理室。',
 J080:'社会保険料の納付期限日の経理室。',J081:'固定資産税の納付書を確認する経理室。',
 J129:'給与支給後の経理室。',J130:'給与支給後の経理室。'
});
const approvedStory=(id,original)=>{
 if(!Object.hasOwn(chronologyPlaces,id))return original;
 assert(original.startsWith('給与振込前日の経理室。'),id+': expected chronology source');
 return chronologyPlaces[id]+original.slice('給与振込前日の経理室。'.length);
};

let checks=0;
function test(name,fn){try{fn();checks++;console.log('PASS '+name)}catch(e){console.error('FAIL '+name+' '+e.stack);process.exitCode=1}}
function clone(x){return JSON.parse(JSON.stringify(x))}
function store(value=null){return{value,writes:0,getItem(){return this.value},setItem(_,data){this.value=data;this.writes++;return true},removeItem(){this.value=null;return true}}}
const equivalent=(a,b)=>assert.equal(JSON.stringify(a),JSON.stringify(b));
test('exactly 300 original IDs, unchanged D019 D020 assessed contracts',()=>{
 equivalent(Object.keys(now).sort(),ids);
 for(const id of ids.filter(x=>!edited.includes(x))){
  const a=now[id],b=before[id];
  const keep=q=>({id:q.id,type:q.type,category:q.category,format:q.format,table:q.table,answer:q.answer,question:q.question,materials:q.materials});
  equivalent(keep(a),keep(b));
 }
});
test('all supplementary story labels are removed without changing assessments or content identity',()=>{
 let removed=0;
 for(const id of ids.filter(x=>!edited.includes(x)&&!['D019','D020'].includes(x))){
  const a=before[id],b=now[id];
  const wasLabelled=/〔評価資料 \d+〕$/.test(a.story);
  if(wasLabelled){
   const original=a.story.replace(/〔評価資料 \d+〕$/,'');
   const allowedNotes=new Set(["J136", "J089", "J138", "J139", "J140", "L032", "T034", "T035", "T036", "T037", "T038", "T039", "T040", "E016", "E017", "E018", "E019", "E020", "F003", "F009", "F010", "C007", "C009", "C010"]);
   const correctedOriginal=approvedStory(id,original);
   assert(b.story.startsWith(correctedOriginal),id+': preserve original evidence-bearing scene');
   const suffix=b.story.slice(correctedOriginal.length);
   if(allowedNotes.has(id))assert(suffix.length>=10&&suffix.length<=28&&suffix.endsWith('。'),id+': needs a concrete unique cue');
   else assert.equal(suffix,'',id+': only remove the internal marker');
   removed++;
  }else assert.equal(b.story,approvedStory(id,a.story),id+': unchanged authored scene except exact approved chronology');
 }
 assert.equal(removed,126,'reviewed supplementary metadata marker count drift');
 for(const id of ids)assert(!now[id].story.includes('〔評価資料 '),id+': internal evaluation label must not reach the screen');
 assert.equal(new Set(ids.map(id=>now[id].story)).size,300,'all 300 scenes must remain unique after removing row numbers');
 assert(ids.every(id=>now[id].story.length<=120),'mobile one-read length should remain <=120');
 const migrated=new Model(now,store(),'progress');
 for(const id of ids.filter(x=>!edited.includes(x))){
  assert.equal(migrated.state.questionContentVersions[id],new Old(before,store(),'progress').state.questionContentVersions[id],id+': editorial-only copy cannot invalidate past grading');
 }
});
test('D019 and D020 use different supplied worksheets without implying numeric continuity',()=>{
 const closing=now.D020,trial=now.D019;
 assert(closing.story.includes('前の試算表の数字は引き継がず'));
 assert(closing.npcDialogue.includes('別の資料'));
 assert(trial.nextHook.includes('別に示される'));
 assert.equal(closing.answer.cells.purchases,400000);
 assert(!trial.table.rows.some(r=>r.account==='仕入'),'D019 does not supply the D020 purchases figure');
});
test('Gen194 chronology fixes exactly six user-visible stories while preserving all 300 assessments',()=>{
 const sourceSHA='b7e7f6b7a676cddc59fd0a25fce47132d7adfd3d';
 const previousGen193=load(cp.execFileSync('git',['show',sourceSHA+':data/questions.js'],{encoding:'utf8',maxBuffer:12*1024*1024}),fs.readFileSync('js/model.js','utf8'));
 const approvedGen194=load(cp.execFileSync('git',['show','d8b406a5142f7b01c42e680df853de1bd0666120:data/questions.js'],{encoding:'utf8',maxBuffer:12*1024*1024}),fs.readFileSync('js/model.js','utf8'));
 const changed=[];
 for(const id of ids){
  const original=previousGen193.QuestionData[id],next=approvedGen194.QuestionData[id];
  for(const field of ['question','answer','explanation','materials','table','category','type','chapter','explanationModel']){
   equivalent(original[field],next[field]);
  }
  if(original.story!==next.story)changed.push(id);
 }
 equivalent(changed.sort(),Object.keys(chronologyPlaces).sort());
 for(const id of changed){
  assert(!approvedGen194.QuestionData[id].story.startsWith('給与振込前日の経理室。'),id+': payment day is not payroll eve');
  assert.equal(approvedGen194.QuestionData[id].story,approvedStory(id,previousGen193.QuestionData[id].story),id+': extra story mutation');
 }
});
test('Gen195 source-specific decision narratives have no phantom documents and preserve the grading contract',()=>{
 const priorSHA='d8b406a5142f7b01c42e680df853de1bd0666120';
 const prior=load(cp.execFileSync('git',['show',priorSHA+':data/questions.js'],{encoding:'utf8',maxBuffer:12*1024*1024}),fs.readFileSync('js/model.js','utf8'));
 const scopeChanges=Object.freeze({
  D003:'insurance',D005:'insurance',D006:'equipment',D007:'equipment',
  D008:'equipment',D009:'insurance',D010:'equipment'
 });
 const touched=[];
 for(const id of ids){
  const q=now[id],previous=prior.QuestionData[id];
  for(const k of new Set([...Object.keys(previous),...Object.keys(q)])){
   if(k==='story')continue;
   equivalent(previous[k],q[k]);
  }
  if(previous.story!==q.story)touched.push(id);
 }
 equivalent(touched.sort(),Object.keys(scopeChanges).sort());
 for(const [id,source] of Object.entries(scopeChanges)){
  const oldBefore=prior.WorkCaseNarratives[id].before,newBefore=current.WorkCaseNarratives[id].before;
  assert(prior.QuestionData[id].story.startsWith(oldBefore),id+': immutable source preface');
  assert(now[id].story.startsWith(newBefore),id+': corrected preface must be visible');
  assert.equal(now[id].story.slice(newBefore.length),prior.QuestionData[id].story.slice(oldBefore.length),id+': preserve authored progress/next action');
  assert(!newBefore.includes(source==='insurance'?'備品':'保険'),id+': should not suggest missing evidence');
  assert(newBefore.includes(source==='insurance'?'保険':'備品'),id+': mention actual source');
  const materials=JSON.stringify(now[id].materials);
  assert(materials.includes(source==='insurance'?'前期保険契約':'前期固定資産台帳'));
  assert(!materials.includes(source==='insurance'?'前期固定資産台帳':'前期保険契約'));
  for(const k of new Set([...Object.keys(prior.WorkCaseNarratives[id]),...Object.keys(current.WorkCaseNarratives[id])])){
   if(k!=='before')equivalent(prior.WorkCaseNarratives[id][k],current.WorkCaseNarratives[id][k]);
  }
  assert(now[id].story.length<=120,id+': mobile prose limit');
 }
 for(const id of ids.filter(id=>!Object.hasOwn(scopeChanges,id)))
  equivalent(prior.WorkCaseNarratives[id],current.WorkCaseNarratives[id]);
 assert.equal(new Set(ids.map(id=>now[id].story)).size,300,'no duplicate scenes');
});
test('17 distinct assessment contracts, 17 independent material oracles',()=>{
 const patterns=new Set();
 for(const id of edited){
  const q=now[id],original=before[id];
  assert.equal(q.type,'worksheet');assert.equal(q.format,'decision-worksheet-v2');
  assert(q.question.includes('前期3月決算'));assert(q.npcDialogue.includes('水野先輩'));
  assert(q.explanation.includes('【判断の順序】'));assert(q.explanation.includes('【計算と転記】'));assert(q.explanation.includes('【検算】'));
  assert(q.table.inputCells.length>0 && q.table.inputCells.length<=4);
  equivalent(q.table.inputCells,Object.keys(q.answer.cells));
  const formula=current.independentlyDerivedTableCells(q);
  assert(formula,id+' no independent oracle');
  equivalent(q.answer.cells,formula);
  const r=original.table.rows,premium=r[0].before,cost=r[1].before,denom=Number(original.question.match(/うち(\d+)分の1/)?.[1]),life=Number(original.question.match(/耐用年数(\d+)年/)?.[1]);
  const four={insurance_adjustment:premium/denom,insurance_expense_after:premium-premium/denom,depreciation_expense:cost/life,equipment_book_value_after:cost-cost/life};
  for(const [key,value] of Object.entries(q.answer.cells))if(Object.hasOwn(four,key))assert.equal(value,four[key],id+' independently recomputed '+key);
  patterns.add(q.table.inputCells.join('|'));
 }
 assert(patterns.size>=9,'insufficient variation in actual required judgments');
});
test('T001-T040: independent trial balance sums are derived from printed account rows, not stored answers',()=>{
 for(let n=1;n<=40;n++){
  const id='T'+String(n).padStart(3,'0'),q=now[id];
  assert.equal(q.type,'trial_balance',id+' type');
  assert.equal(q.table.rows.at(-1).account,'合計',id+' total row');
  const entries=q.table.rows.slice(0,-1);
  const debit=entries.reduce((sum,row)=>sum+(typeof row.debit==='number'?row.debit:0),0);
  const credit=entries.reduce((sum,row)=>sum+(typeof row.credit==='number'?row.credit:0),0);
  assert(entries.every(row=>[row.debit,row.credit].filter(v=>typeof v==='number'&&v!==0).length===1),id+' trial balance entry must occupy one side');
  assert.equal(debit,credit,id+': source trial balance out of balance');
  assert.equal(q.answer.cells.total_debit,debit,id+': expected debit is not independent row sum');
  assert.equal(q.answer.cells.total_credit,credit,id+': expected credit is not independent row sum');
  assert(q.explanation.includes(debit.toLocaleString('en-US')),id+': rendered explanation omits actual sum');
 }
});
test('E001-E020: manual evidence-based correct journals minus recorded journals yield exact correction',()=>{
 // This independent expected journal ledger is authored from the evidence and question,
 // not from app QuestionData[].answer or accounting-oracle expected answer maps.
 const rules={
  E001:['広告掲載料22,500円','広告宣伝費','現金',22500],
  E002:['買掛金25,000円','買掛金','普通預金',25000],
  E003:['事務用品18,000円','消耗品費','現金',18000],
  E004:['売掛金80,000円を回収','普通預金','売掛金',80000],
  E005:['業務用複合機120,000円','備品','未払金',120000],
  E006:['買掛金60,000円を普通預金','買掛金','普通預金',60000],
  E007:['商品90,000円を掛け','売掛金','売上',90000],
  E008:['貸付金利息12,000円','普通預金','受取利息',12000],
  E009:['通信費30,000円','通信費','現金',30000],
  E010:['借入金元本100,000円','借入金','普通預金',100000],
  E011:['火災保険料24,000円','保険料','普通預金',24000], // Bank debit presumed correct from pre-recorded journal. Source "支払通知" does NOT independently establish settlement.
  E012:['商品引渡前','現金','前受金',50000],
  E013:['商品受領前','前払金','普通預金',70000],
  E014:['概算前渡し','仮払金','現金',60000],
  E015:['立替払い','立替金','現金',18000],
  E016:['収入印紙10,000円','租税公課','現金',10000],
  E017:['振込手数料3,000円','支払手数料','普通預金',3000],
  E018:['業務用パソコン280,000円','備品','未払金',280000],
  E019:['現金で回収','現金','売掛金',40000],
  E020:['給与総額300,000円','給料','普通預金',300000]
 };
 const parse=record=>{
  const m=record.match(/^（借）(.+?) ([\d,]+)／（貸）(.+?) ([\d,]+)$/u);
  assert(m,'recorded journal not parseable: '+record);
  assert.equal(Number(m[2].replaceAll(',','')),Number(m[4].replaceAll(',','')));
  return {debit:m[1],credit:m[3],amount:Number(m[2].replaceAll(',',''))};
 };
 for(const [id,[clue,debit,credit,amount]] of Object.entries(rules)){
  const q=now[id];assert.equal(q.type,'correction',id+' type');
  assert.equal(q.materials.length,1,id+' source documents count');
  assert(q.materials[0].evidence.includes(clue),id+' source evidence changed: '+clue);
  const old=parse(q.materials[0].recorded),ledger=new Map();
  const set=(acc,val)=>ledger.set(acc,(ledger.get(acc)||0)+val);
  set(debit,amount);set(credit,-amount);set(old.debit,-old.amount);set(old.credit,old.amount);
  const outstanding=[...ledger].filter(([acc,balance])=>balance!==0);
  const correctionsDebit=outstanding.filter(([_,value])=>value>0);
  const correctionsCredit=outstanding.filter(([_,value])=>value<0);
  assert.equal(correctionsDebit.length,1,id+' one debit correction');
  assert.equal(correctionsCredit.length,1,id+' one credit correction');
  const [debitAcc,debitValue]=correctionsDebit[0],[creditAcc,creditValue]=correctionsCredit[0];
  assert.equal(debitValue,-creditValue,id+' correction entry balance');
  equivalent(q.answer.cells,{debitAccount:debitAcc,debitAmount:debitValue,creditAccount:creditAcc,creditAmount:-creditValue});
  assert(q.explanation.includes(debitAcc)&&q.explanation.includes(creditAcc),id+': missing corrected account explanation');
 }
 assert.equal(Object.keys(rules).length,20);
});
test('model revision6 covers exact 17 successor content identities plus existing identities',()=>{
 const model=new Model(now,store(),'progress');assert.equal(model.state.contentRevision,6);
 for(const id of edited)assert(model.state.questionContentVersions[id].includes('decision-v2'),id);
 assert.equal(Object.keys(model.state.questionContentVersions).length,21);
 assert(Model.validateBackupState(model.state,now));
});
function oldState(id,results){
 const storage=store(),model=new Old(before,storage,'progress');
 for(let i=0;i<results.length;i++){
  const ts=Date.UTC(2026,10,7,2,0,i),correct=results[i];
  assert(model.recordAttempt(id,correct,4000,'',false,ts,null,'sure',{support:'none'}));
  assert(model.record(id,correct,ts));
  if(i===results.length-1)assert(model.setDraft(id,clone(before[id].answer)));
 }
 assert(Old.validateBackupState(model.state,before));
 return clone(model.state);
}
for(const scenario of [{label:'empty',scores:[]},{label:'old correct',scores:[true]},{label:'old wrong',scores:[false]},{label:'old mixed',scores:[false,true]}]){
 test('v5→v6 '+scenario.label+' archives old D002, retains efforts, validates and reloads',()=>{
  const legacy=oldState('D002',scenario.scores),store1=store(JSON.stringify(legacy)),migration=new Model(now,store1,'progress');
  assert(!migration.storageWriteBlocked,'refused valid legacy save');
  assert.equal(migration.state.contentRevision,6);
  assert(Model.validateBackupState(migration.state,now));
  const record=migration.state.contentMigrationArchive.questions.D002;
  if(scenario.scores.length){
   assert(record,'missing old evidence archive');
   assert.equal(record.attempts.length,scenario.scores.length);
   assert(migration.state.contentRecheckIds.includes('D002'),'recheck required');
   assert(!migration.state.correctIds.includes('D002'),'obsolete answers must not be reused as v6 mastery');
   assert(!migration.state.answeredIds.includes('D002'),'obsolete attempts must not be active');
   assert(!migration.state.drafts.D002,'obsolete draft must not survive');
  }else assert(!record,'new users have no old content archive');
  const saved=store1.value,writes=store1.writes;
  const again=new Model(now,store1,'progress');
  assert(!again.storageWriteBlocked);
  assert.equal(store1.value,saved,'revision6 reload unexpectedly mutated save');
  assert.equal(store1.writes,writes,'revision6 reload wrote again');
 });
}
test('v5 earned progress for unaffected J001 persists and obsolete D003 does not leak mastery',()=>{
 const oldState1=oldState('D003',[true]),storage=store();
 const model=new Old(before,storage,'progress');model.state=clone(oldState1);
 const ts=Date.UTC(2026,10,7,6,0,0);
 assert(model.recordAttempt('J001',true,2400,'',false,ts,null,'sure',{support:'none'}));
 assert(model.record('J001',true,ts));assert(Old.validateBackupState(model.state,before));
 const migr=store(JSON.stringify(model.state)),newModel=new Model(now,migr,'progress');
 assert(Model.validateBackupState(newModel.state,now));
 assert(newModel.state.correctIds.includes('J001'));
 assert(!newModel.state.correctIds.includes('D003'));
 assert(newModel.state.contentMigrationArchive.questions.D003);
});
test('new v6 answers seal new identity and old v5 backup is migratable without modifying original',()=>{
 const orig=oldState('D012',[true]),raw=JSON.stringify(orig);
 assert(Old.validateBackupState(orig,before));
 const prepared=Model.prepareBackupState(orig,now);
 assert(prepared && Model.validateBackupState(prepared,now));
 assert(!prepared.correctIds.includes('D012'));
 assert(prepared.contentMigrationArchive.questions.D012);
 assert.equal(JSON.stringify(orig),raw,'backup caller object mutated');
 const st=store();const model=new Model(now,st,'progress');
 const ts=Date.UTC(2026,10,7,7,0);
 assert(model.recordAttempt('D012',true,2000,'',false,ts,null,'sure',{support:'none'}));
 assert(model.record('D012',true,ts));
 assert(model.state.attempts.some(x=>x.questionId==='D012'&&x.contentIdentity===model.state.questionContentVersions.D012));
 assert(Model.validateBackupState(model.state,now));
});
test('malformed older data never overwrites user storage',()=>{
 const original=oldState('D005',[true]);
 original.questionContentVersions.L044='tampered';
 const raw=JSON.stringify(original),st=store(raw);
 const model=new Model(now,st,'progress');
 assert.equal(model.storageWriteBlocked,true);
 assert.equal(st.value,raw);
 assert.equal(st.writes,0);
 assert.equal(Model.prepareBackupState(original,now),null);
});
test('all 300 investigation counters are within bounds, supplementary decisions do not claim Story progress',()=>{
 for(const q of Object.values(now)){
  const markers=[...String(q.story||'').matchAll(/〔調査 (\d+)\/(\d+)〕/gu)];
  for(const [,n,total] of markers)assert(Number(n)>=1&&Number(n)<=Number(total),q.id+': invalid Story counter '+n+'/'+total);
 }
 for(let number=13;number<=18;number++){
  const id='D'+String(number).padStart(3,'0');
  assert(now[id].story.includes('〔追加演習 '+(number-12)+'/6〕'),id+': supplementary work falsely counted as main Story');
  assert(!now[id].story.includes('〔調査 '),id+': extra exercise must not extend locked Story cases');
 }
 const hooks=edited.map(id=>now[id].nextHook);
 assert.equal(new Set(hooks).size,17,'the 17 distinct decisions require specific next-task transitions');
});
if(!process.exitCode)console.log('ISSUE256_RELEASE236_GEN190_INDEPENDENT_MIGRATION_PASS',checks);
