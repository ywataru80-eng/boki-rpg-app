'use strict';
const assert=require('assert'),fs=require('fs'),vm=require('vm');
const sandbox={window:{},console};vm.createContext(sandbox);
for(const file of ['data/questions.js','data/accounting-oracle.js','js/engine.js','js/model.js'])vm.runInContext(fs.readFileSync(file,'utf8'),sandbox,{filename:file});
const root=sandbox.window,ids=['L005','L010','L015','L020','L025','L030','L033','L040'];
for(const id of ids){
  const q=root.QuestionData[id],derived=root.deriveAccountingExpected(id,null,q);
  assert.strictEqual(q.format,'fixed-asset-ledger',`${id}: semantic renderer format`);
  assert.strictEqual(derived.sourceValid,true,`${id}: visible facts are sufficient`);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(derived.expected)),JSON.parse(JSON.stringify(q.answer)),`${id}: independently recomputed answer`);
  for(const cell of q.table.inputCells)assert(q.table.inputMetadata[cell]?.label&&q.table.inputMetadata[cell]?.semanticType,`${id}/${cell}: labeled semantic control`);
}
for(const id of ['L015','L033']){
  const explanation=root.QuestionData[id].explanation;
  assert(explanation.includes('耐用年数5年'),`${id}: pre-unitized useful life is preserved`);
  assert(!explanation.includes('5年年'),`${id}: useful-life unit is not duplicated`);
}
assert(root.QuestionData.L005.explanation.includes('耐用年数5年'),'numeric useful life receives one year unit');
for(const missing of ['定額法','残存価額','耐用年数']){
  const q=structuredClone(root.QuestionData.L033);
  q.question=q.question.replace(missing,''); q.materials=q.materials.map(row=>Object.fromEntries(Object.entries(row).filter(([key,value])=>key!==missing&&value!==missing)));
  assert.strictEqual(root.deriveAccountingExpected('L033',null,q).derivable,false,`missing ${missing} fails closed`);
}
const l033=root.QuestionData.L033;
for(const value of ['7/1','07/01','7月1日'])assert.strictEqual(root.GradingEngine.grade(l033,{cells:{...l033.answer.cells,acquisitionDate:value}}).correct,true,`${value} date variant`);
assert.strictEqual(root.GradingEngine.grade(l033,{cells:{...l033.answer.cells,acquisitionDate:'7/2'}}).correct,false,'wrong date rejected');
assert(root.ExamPoolDefinition.includes('L033')&&root.ExamPoolDefinition.includes('L040'),'redesigned exam questions remain in pool');
const view=fs.readFileSync('js/view.js','utf8'),css=fs.readFileSync('css/style.css','utf8');
vm.runInContext(view,sandbox,{filename:'js/view.js'});
assert(view.includes("question.format === 'fixed-asset-ledger'")&&view.includes("picker.type = 'date'")&&view.includes('makeShortDateInput'),'renderer keeps a text answer field and adds an optional native calendar helper');
assert.strictEqual(root.AppView.normalizeShortDateInput('1201'),'12/1');
assert.strictEqual(root.AppView.normalizeShortDateInput('0401'),'4/1');
assert.strictEqual(root.AppView.normalizeShortDateInput('401'),'4/1');
assert.strictEqual(root.AppView.normalizeShortDateInput('0715'),'7/15');
assert.strictEqual(root.AppView.normalizeShortDateInput('12/1'),'12/1');
assert.strictEqual(root.AppView.normalizeShortDateInput('１２月１日'),'12/1');
assert.strictEqual(root.AppView.normalizeShortDateInput('1332'),'1332','impossible compact date is not fabricated');
const shortDateHelperStart=view.indexOf('    makeShortDateInput('),shortDateHelperEnd=view.indexOf('    makeDatePicker(',shortDateHelperStart),shortDateHelperSource=view.slice(shortDateHelperStart,shortDateHelperEnd);
assert(shortDateHelperStart>=0&&shortDateHelperEnd>shortDateHelperStart&&shortDateHelperSource.includes("input.setAttribute('inputmode', 'numeric')"),'semantic date helper specifically requests a numeric-friendly mobile keyboard');
assert(/\.date-picker-control:focus-within\s*\{[^}]*outline:\s*3px solid rgba\(52,\s*152,\s*219,\s*\.45\)[^}]*outline-offset:\s*2px/s.test(css),'visible calendar wrapper exposes child focus without styling only the transparent native input');
assert(view.includes("picker.value = match ? `2000-")&&view.includes("input.value = `${Number(match[1])}/${Number(match[2])}`"),'calendar year remains helper-only while learner answer stays M/D');
const fixedRendererSource=view.slice(view.indexOf('renderFixedAssetLedger'),view.indexOf('positionStickyContextColumns'));
assert(view.includes("unit.textContent = semanticType === 'amount' ? '円' : 'か月'")&&view.includes("label.htmlFor = `fixed-asset-"),'visible labels and external units');
const fixedRenderer=view.slice(view.lastIndexOf('renderFixedAssetLedger(question'),view.indexOf('positionStickyContextColumns(table)',view.indexOf('renderFixedAssetLedger(question'))); assert(!fixedRenderer.includes('question.answer'),'renderer does not read answers or leak them in exam mode');
assert(/@media \(max-width: 430px\)[\s\S]*fixed-asset-fields/.test(css)&&/min-height: 44px/.test(css),'phone card reflow and touch targets');
assert(/\.date-picker-control\s*\{[^}]*width:\s*44px[^}]*height:\s*44px[^}]*min-width:\s*44px[^}]*min-height:\s*44px/s.test(css),'calendar affordance preserves a 44px touch target');
const questions=Object.fromEntries(root.ExamPoolDefinition.map(id=>[id,root.QuestionData[id]])); Object.assign(questions,Object.fromEntries(ids.map(id=>[id,root.QuestionData[id]])),{J001:root.QuestionData.J001});
const examIds=root.ExamPoolDefinition.slice(0,15); if(!examIds.includes('L033'))examIds[0]='L033';
const saved={mode:'exam',currentQuestionId:'L033',answeredIds:['L005'],correctIds:['L005'],incorrectIds:[],mistakeCounts:{},reviewSchedule:{},reviewAssignments:{},attempts:[{questionId:'L005',correct:true,responseMs:10}],drafts:{L005:{cells:{old:1}},L033:{cells:{old:2}},J001:{debit:[],credit:[]}},completed:false,placement:null,examAttempt:1,examSession:{ids:examIds,startedAt:1,endAt:2,status:'RUNNING',scores:{}},examHistory:[],lastExamReview:null};
let stored=JSON.stringify(saved);const storage={getItem:()=>stored,setItem:(_k,v)=>{stored=v;return true;}};
const model=new root.ProgressModel(questions,storage);
assert.strictEqual(model.state.drafts.L005,undefined);assert.strictEqual(model.state.drafts.L033,undefined);assert(model.state.drafts.J001,'unrelated draft preserved');
assert.strictEqual(JSON.stringify(model.state.answeredIds),JSON.stringify(['L005']));assert.strictEqual(JSON.stringify(model.state.correctIds),JSON.stringify(['L005']));assert.strictEqual(model.state.attempts.length,1,'progress and attempts preserved');
assert.strictEqual(model.state.examSession,null);assert.strictEqual(model.state.mode,'story','schema-incompatible exam invalidated safely');
const compatible={...saved,mode:'exam',drafts:{J001:{debit:[],credit:[]}},examSession:{...saved.examSession,ids:root.ExamPoolDefinition.filter(id=>!['L033','L040'].includes(id)).slice(0,15)}};stored=JSON.stringify(compatible);const compatibleModel=new root.ProgressModel(questions,storage);assert(compatibleModel.state.examSession,'unaffected active exam preserved');
const legacyBackup={...saved,mode:'story',examSession:null};
assert.strictEqual(root.ProgressModel.validateBackupState(legacyBackup,questions),true,'legacy backup v1 remains importable');
assert.strictEqual(root.ProgressModel.validateBackupState({...legacyBackup,contentRevision:2},questions),true,'revision 2 backup remains importable');
assert.strictEqual(root.ProgressModel.validateBackupState({...legacyBackup,contentRevision:3},questions),true,'revision 3 remains importable before migration');
assert.strictEqual(root.ProgressModel.validateBackupState({...legacyBackup,contentRevision:6},questions),false,'revision 6 without matching question identities cannot be imported as a current backup');
assert.strictEqual(root.ProgressModel.validateBackupState({...legacyBackup,contentRevision:7},questions),false,'future content revision rejected');
const futureState={...saved,contentRevision:7,mode:'exam',currentQuestionId:'L033',answeredIds:['L005'],correctIds:['L005'],incorrectIds:['L010'],drafts:{L033:{cells:{future:1}}},examSession:saved.examSession};
stored=JSON.stringify(futureState);let futureWrites=0;
const futureModel=new root.ProgressModel(questions,{getItem:()=>stored,setItem:()=>{futureWrites++;return true;}});
const cleanDefault=new root.ProgressModel(questions,{getItem:()=>null,setItem:()=>true});
assert.deepStrictEqual(JSON.parse(JSON.stringify(futureModel.state)),JSON.parse(JSON.stringify(cleanDefault.state)),'future persisted state leaves the complete safe default state intact');
assert.strictEqual(futureModel.state.contentRevision,6);assert.strictEqual(futureModel.state.learningEvidenceIntegrity.schemaVersion,11);
assert.strictEqual(futureModel.save(),false,'future state must remain write-blocked');
assert.strictEqual(futureModel.learningEffectivenessForQuestion('J001').initialStatus,'unknown','a blocked future state cannot claim a known initial history');
assert.strictEqual(futureWrites,0,'future persisted state is not silently downgraded or saved');
for(const id of ids){const item=root.QuestionData[id];assert(!JSON.stringify(item).includes('当期減価償却額'),`${id}: terminology`);assert.deepStrictEqual(JSON.parse(JSON.stringify(root.independentlyDerivedTableCells(item))),JSON.parse(JSON.stringify(item.answer.cells)),`${id}: independent arithmetic`);}
assert.strictEqual(root.QuestionData.L030.table.inputMetadata.annualDepreciation.label,'1年分の減価償却費');
assert.strictEqual(root.QuestionData.L040.table.inputMetadata.annualA.label,'備品A 1年分の減価償却費');
assert.deepStrictEqual(Object.keys(root.QuestionData.L015.materials[0]),['資料','取得日','取得原価']);
assert.strictEqual(root.QuestionData.L015.materials[1].資料,'償却条件');
assert(root.QuestionData.L015.question.includes('請求書と償却条件')&&root.QuestionData.L033.question.includes('請求書と償却条件'));
assert(root.QuestionData.L040.explanation.includes('4月から9月までの6か月')&&root.QuestionData.L040.explanation.includes('10月を使用月数に含めない'));
for(const mutate of [item=>{item.question=item.question.replace(/会計期間は4月1日から翌年3月31日までである。/u,'');},item=>{item.question=item.question.replace(/備品Aは12月1日に取得した。/u,'備品Aを取得した。');delete item.table.rows[0].acquisitionDate;},item=>{item.question=item.question.replace(/取得原価360,000円、/u,'');delete item.table.rows[0].acquisitionCost;},item=>{item.question=item.question.replace(/残存価額0円、/u,'');delete item.table.rows[0].residualValue;},item=>{item.question=item.question.replace(/耐用年数5年、/u,'');delete item.table.rows[0].life;},item=>{item.question=item.question.replace(/減価償却方法は定額法である。/u,'');delete item.table.rows[0].method;}]){const candidate=structuredClone(root.QuestionData.L030);mutate(candidate);assert.strictEqual(root.deriveAccountingExpected('L030',null,candidate).derivable,false,'L030 required visible fact fails closed');}
const l030Matching=structuredClone(root.QuestionData.L030);
assert.strictEqual(root.deriveAccountingExpected('L030',null,l030Matching).derivable,true,'L030 equivalent prompt/table acquisition dates remain valid');
const l030Conflict=structuredClone(root.QuestionData.L030);
l030Conflict.question=l030Conflict.question.replace('12月1日','11月1日');
assert.strictEqual(root.deriveAccountingExpected('L030',null,l030Conflict).derivable,false,'L030 conflicting prompt/table acquisition dates fail closed');
for(const [label,mutate] of [
  ['acquisition cost',item=>{item.table.rows[0].acquisitionCost=420000;}],
  ['residual value',item=>{item.table.rows[0].residualValue=60000;}],
  ['useful life',item=>{item.table.rows[0].life=6;}],
  ['depreciation method',item=>{item.table.rows[0].method='定率法';}]
]){
  const candidate=structuredClone(root.QuestionData.L030);mutate(candidate);
  assert.strictEqual(root.deriveAccountingExpected('L030',null,candidate).derivable,false,`L030 conflicting ${label} prompt/table evidence fails closed`);
}
const l030PromptOnly=structuredClone(root.QuestionData.L030);
for(const key of ['acquisitionDate','acquisitionCost','residualValue','life','method'])delete l030PromptOnly.table.rows[0][key];
assert.strictEqual(root.deriveAccountingExpected('L030',null,l030PromptOnly).derivable,true,'L030 prompt-only explicit depreciation evidence remains sufficient');
const l030RowOnly=structuredClone(root.QuestionData.L030);
l030RowOnly.question=l030RowOnly.question.replace('備品Aは12月1日に取得した。','備品Aを取得した。').replace('取得原価360,000円、残存価額0円、耐用年数5年、減価償却方法は定額法である。','');
assert.strictEqual(root.deriveAccountingExpected('L030',null,l030RowOnly).derivable,true,'L030 row-only explicit depreciation evidence remains sufficient');
const revision2={...saved,contentRevision:2,mode:'exam',drafts:{L005:{cells:{keep:1}},L030:{cells:{drop:1}},J001:{debit:[],credit:[]}},examSession:compatible.examSession};stored=JSON.stringify(revision2);const revision2Model=new root.ProgressModel(questions,storage);assert.strictEqual(revision2Model.state.drafts.L030,undefined);assert(revision2Model.state.drafts.L005);assert(revision2Model.state.drafts.J001);assert(revision2Model.state.examSession);
console.log('fixed asset ledger tests: ok');