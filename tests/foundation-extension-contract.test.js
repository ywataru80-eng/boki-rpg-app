'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm'),crypto=require('crypto');
const ROOT=path.resolve(__dirname,'..'), cases=require('./fixtures/foundation-extension-cases');
const clone=value=>JSON.parse(JSON.stringify(value));
const storage=()=>{const data=new Map();return{data,getItem:key=>data.get(key)??null,setItem:(key,value)=>{data.set(key,String(value));return true;},removeItem:key=>data.delete(key)};};
const store=storage(), root={localStorage:store,dispatchEvent(){},console};
const context=vm.createContext({window:root,console,queueMicrotask,Event:class Event{}});
for(const file of ['data/accounting-domain.js','data/questions.js','data/accounting-oracle.js','data/fy2027-curriculum.js','js/calculator.js','js/engine.js','js/model.js','js/rpg.js','js/view.js','js/annual-storage.js','js/controller.js','tests/helpers/foundation-extension-adapter.js']) vm.runInContext(fs.readFileSync(path.join(ROOT,file),'utf8'),context,{filename:file});
const api=root.FoundationExtensionAdapter,questions=api.catalog(cases),canonical=JSON.stringify(root.QuestionData);
let passed=0;
function test(name,run){run();passed++;console.log('PASS '+name);}
for(const question of Object.values(questions)) {
  test(question.id+' correct',()=>assert(root.GradingEngine.grade(question,clone(question.answer)).correct));
  test(question.id+' wrong',()=>{const wrong=clone(question.answer);if(question.type==='journal')wrong.debit[0].amount++;else wrong.cells[Object.keys(wrong.cells)[0]]='wrong';assert(!root.GradingEngine.grade(question,wrong).correct);});
  for(const [name,answer] of [['blank',question.type==='journal'?{debit:[],credit:[]}:{cells:{}}],['missing',undefined]])test(question.id+' '+name,()=>assert(!root.GradingEngine.grade(question,answer).correct));
}
for(const whole of [0,1,2,9,99,1200])for(const fraction of ['004','005','006','014','015','016','674','675','676','994','995','996']) {
  // Separate integer-minor-unit oracle; never use the helper's decimal parser or toFixed.
  const cents=whole*100+Math.floor((Number(fraction)+5)/10);
  const expected=Math.floor(cents/100)+'.'+String(cents%100).padStart(2,'0');
  test('HALF_UP '+whole+'.'+fraction,()=>assert.strictEqual(api.roundHalfUp(whole+'.'+fraction,2),expected));
}
for(const [value,precision,expected] of [['-1.005',2,'-1.01'],['-2.675',2,'-2.68'],['-0.004',2,'0.00'],['-5870',0,'-5870'],['0',0,'0'],['4130',0,'4130']])test('signed '+value,()=>assert.strictEqual(api.roundHalfUp(value,precision),expected));
for(const [expression,expected] of [['115308668+0.005','115308668.005'],['240001/200','1200.005'],['0-5870','-5870'],['(1.005+1.67)*2','5.35']])test('exact decimal expression '+expression,()=>assert.strictEqual(api.evaluateDecimalExpression(expression),expected));
test('large decimal direct HALF_UP',()=>assert.strictEqual(api.roundHalfUp(api.evaluateDecimalExpression('115308668+0.005'),2),'115308668.01'));
test('decimal division by zero is rejected',()=>assert.throws(()=>api.evaluateDecimalExpression('1/0')));
test('rational expression rounding applies HALF_UP only to the final value',()=>{
  for(const [expression,precision,expected] of [['1/3',2,'0.33'],['1/6',2,'0.17'],['-1/6',2,'-0.17'],['1/6*3',0,'1'],['-1/6*3',0,'-1'],['1/3*3',2,'1.00'],['1/3/3',2,'0.11'],['-1/300',2,'0.00']])assert.strictEqual(api.evaluateDecimalExpression(expression,precision),expected);
  for(const invalid of ['1/0','1 2','1,000/3','1e3/3','(1/3','10000000000000/3'])assert.throws(()=>api.evaluateDecimalExpression(invalid,2));
  for(const precision of [-1,3,1.5])assert.throws(()=>api.evaluateDecimalExpression('1/3',precision));
});
test('separator cannot merge numeric operands',()=>{
  for(const invalid of ['1 2','1,00+2','1,000+2','1. 2','1e3'])assert.throws(()=>api.evaluateDecimalExpression(invalid),invalid);
  assert.strictEqual(api.evaluateDecimalExpression('1 + 2'),'3');
});
test('bounded submicro decimal arithmetic preserves plain notation',()=>{
  assert.strictEqual(api.evaluateDecimalExpression('0.0000001+1'),'1.0000001');
});
for(const value of ['', 'NaN','Infinity','1e3','1,00','--1','0x10'])test('reject '+JSON.stringify(value),()=>assert.throws(()=>api.roundHalfUp(value,2)));
const input=(value,precision=2,signed=false)=>({value,dataset:{cellId:'unitCost',extensionPrecision:String(precision),extensionSigned:String(signed),extensionQuestion:cases.cost.id},selectionStart:2,selectionEnd:2,selectionDirection:'none',disabled:false,readOnly:false,error:'',classList:{toggle(){},add(){},remove(){}},setCustomValidity(value){this.error=value;},setSelectionRange(start,end,direction){this.selectionStart=start;this.selectionEnd=end;this.selectionDirection=direction;},getAttribute(){return '1個当たり原価（円/個）';}});
for(const [value,start,end,direction] of [['1,200.01',2,2,'none'],['-5,870',1,3,'backward'],['12,345.67',4,7,'forward']])test('caret '+value,()=>{const field=input(value,2,true);field.selectionStart=start;field.selectionEnd=end;field.selectionDirection=direction;assert(api.formatDecimal(field));assert.deepStrictEqual([field.selectionStart,field.selectionEnd,field.selectionDirection],[start,end,direction]);});
test('new grouping preserves logical selection',()=>{const field=input('1234.50');assert(api.formatDecimal(field));assert.strictEqual(field.value,'1,234.50');assert.strictEqual(field.selectionStart,3);});
for(const value of ['1,00','1.234','-1','1e3'])test('invalid field '+value,()=>{const field=input(value);assert.strictEqual(api.formatDecimal(field),false);assert(field.error);assert.strictEqual(field.value,value);});
test('blank is not zero',()=>{const field=input('');assert(api.formatDecimal(field));assert.strictEqual(field.value,'');});
const fields=[{...input('240001',0),dataset:{cellId:'totalCost'}},input('')];
const elements=new Map();
const doc={body:{contains:item=>fields.includes(item)},querySelectorAll:selector=>selector==='.table-input'||selector==='.amount-input'?fields:[],querySelector:()=>null,getElementById:id=>{if(!elements.has(id))elements.set(id,{textContent:'',classList:{add(){},remove(){},toggle(){}}});return elements.get(id);}};
const protectedKeys=['boki-rpg-progress-v2','boki-rpg-character-v1'];for(const key of protectedKeys)store.setItem(key,'canonical sentinel '+key);
const originalDescriptor=Object.getOwnPropertyDescriptor(root,'localStorage');
const controller=new api.ExtensionController(doc,questions,store,'foundation-ext:node:');
controller.currentId=cases.cost.id;controller.learningFlow={phase:'I'};controller.model.state.mode='training';
test('real superclass and store captured during construction',()=>{assert(controller instanceof root.AppController);assert(controller.view instanceof root.AppView);assert.deepStrictEqual(Object.getOwnPropertyDescriptor(root,'localStorage'),originalDescriptor);});
test('extension calculator chaining preserves bounded decimals',()=>{
  const field=fields[1],savedDataset={...field.dataset},oldId=controller.currentId;
  field.dataset.extensionPrecision='2';field.dataset.extensionSigned='false';field.dataset.extensionQuestion=cases.cost.id;
  controller.currentId=cases.cost.id;controller.calculatorTarget=field;controller.clearCalculator();
  controller.expression='0.0000001';controller.setOperator('＋');controller.expression='1';controller.calculator.waitingForOperand=false;controller.calculateEquals();
  assert.strictEqual(controller.expression,'1.0000001');
  controller.clearCalculator();field.dataset=savedDataset;controller.currentId=oldId;
});
test('extension calculator accepts a trailing decimal when changing operators',()=>{
  controller.calculatorTarget=fields[1];controller.clearCalculator();
  controller.expression='1.';controller.setOperator('＋');
  assert.strictEqual(controller.expression,'1');
  controller.expression='2.';controller.calculator.waitingForOperand=false;controller.calculateEquals();
  assert.strictEqual(controller.expression,'3');
  controller.calculateEquals();assert.strictEqual(controller.expression,'5');
  controller.clearCalculator();
  for(const [expression,expected] of [['1.+2.','3'],['0.+.5','0.5'],['-1.+2.','1']])assert.strictEqual(api.evaluateDecimalExpression(expression),expected);
  for(const invalid of ['1..+2','.','1. 2'])assert.throws(()=>api.evaluateDecimalExpression(invalid));
});
test('extension calculator trailing decimal equals and direct insertion preserve every precision',()=>{
  const field=fields[1],before={value:field.value,dataset:{...field.dataset}};
  const saved=store.getItem('foundation-ext:node:'+controller.model.key);
  const previousState=clone(controller.model.state);
  for(const precision of [0,1,2])for(const signed of [false,true])for(const equals of [false,true]){
    field.dataset.extensionPrecision=String(precision);field.dataset.extensionSigned=String(signed);
    controller.calculatorTarget=field;controller.clearCalculator();controller.expression=signed?'-1.':'1.';
    if(equals){controller.calculateEquals();assert.strictEqual(controller.expression,signed?'-1':'1');}
    assert.strictEqual(controller.insertCalculatorResult(false),true);
    assert.strictEqual(field.value,(signed?'-1':'1')+(precision?'.'+'0'.repeat(precision):''));
  }
  for(const invalid of ['.','1..','1. 2']){
    controller.expression=invalid;const value=field.value;
    assert.strictEqual(controller.insertCalculatorResult(false),false);assert.strictEqual(field.value,value);
  }
  controller.clearCalculator();field.value=before.value;field.dataset=before.dataset;
  controller.model.state=previousState;
  if(saved===null)store.removeItem('foundation-ext:node:'+controller.model.key);else store.setItem('foundation-ext:node:'+controller.model.key,saved);
});
test('extension divisions retain rational state until target HALF_UP insertion',()=>{
  const field=fields[1],before={value:field.value,dataset:{...field.dataset}};
  const saved=store.getItem('foundation-ext:node:'+controller.model.key),previousState=clone(controller.model.state);
  controller.calculatorTarget=field;
  const keys=value=>{for(const key of value)controller.calcKey(key);};
  for(const [precision,expected] of [[0,'0'],[1,'0.3'],[2,'0.33']]){
    field.dataset.extensionPrecision=String(precision);field.dataset.extensionSigned='true';
    controller.clearCalculator();keys('1÷3＝');
    assert.notStrictEqual(controller.expression,'エラー','Recurring divisions must remain usable');
    assert.strictEqual(controller.insertCalculatorResult(false),true);assert.strictEqual(field.value,expected);
    keys('×3＝');assert.strictEqual(controller.expression,'1','Insertion must not round the exact accumulator');
    assert.strictEqual(controller.insertCalculatorResult(false),true);
    assert.strictEqual(field.value,'1'+(precision?'.'+'0'.repeat(precision):''));
  }
  field.dataset.extensionPrecision='2';
  for(const [sequence,expected] of [['1÷6＝','0.17'],['0−1÷6＝','-0.17'],['1÷3＝＝','0.11'],['1÷6×3＝','0.50'],['1÷3＝4＋2＝','6.00'],['1÷3＝C2＋1＝','3.00']]){
    controller.clearCalculator();keys(sequence);assert.strictEqual(controller.insertCalculatorResult(false),true,sequence);assert.strictEqual(field.value,expected,sequence);
  }
  for(const [expression,precision,expected] of [['1/3',2,'0.33'],['-1/6',2,'-0.17'],['1/6*3',0,'1'],['-1/6*3',0,'-1'],['1/3*3',2,'1.00'],['(1/3)/3',2,'0.11']]){
    controller.clearCalculator();field.dataset.extensionPrecision=String(precision);controller.expression=expression;
    assert.strictEqual(controller.insertCalculatorResult(true),true);assert.strictEqual(field.value,expected);
  }
  controller.clearCalculator();field.dataset.extensionSigned='false';keys('0−1÷3＝');
  const retained=field.value,stored=store.getItem('foundation-ext:node:'+controller.model.key);
  assert.strictEqual(controller.insertCalculatorResult(false),false);assert.strictEqual(field.value,retained);assert.strictEqual(store.getItem('foundation-ext:node:'+controller.model.key),stored);
  controller.clearCalculator();keys('1÷0＝');assert.strictEqual(controller.expression,'エラー');assert.strictEqual(controller.insertCalculatorResult(false),false);assert.strictEqual(field.value,retained);
  controller.clearCalculator();field.value=before.value;field.dataset=before.dataset;controller.model.state=previousState;
  if(saved===null)store.removeItem('foundation-ext:node:'+controller.model.key);else store.setItem('foundation-ext:node:'+controller.model.key,saved);
});
test('ordinary calculator division retains superclass behavior',()=>{
  const original=fields[0].dataset;fields[0].dataset={cellId:'totalCost'};
  controller.calculatorTarget=fields[0];controller.clearCalculator();
  assert.strictEqual(controller.operate(10,'÷',3),root.SafeCalculator.evaluate('10÷3'));
  fields[0].dataset=original;
});
test('signed target selection preserves retained negative value',()=>{const field=fields[1],before={value:field.value,dataset:{...field.dataset}},currentId=controller.currentId;field.value='-5,870';field.dataset.extensionPrecision='0';field.dataset.extensionSigned='true';field.dataset.extensionQuestion=cases.npvNegative.id;controller.currentId=cases.npvNegative.id;controller.selectCalculatorTarget(field);assert.strictEqual(controller.expression,'-5870');field.value=before.value;field.dataset=before.dataset;controller.currentId=currentId;controller.clearCalculator();});
test('calculator to actual controller saveDraft and ProgressModel',()=>{
  controller.calculatorTarget=fields[1];controller.expression='1200.005';assert.strictEqual(controller.insertCalculatorResult(false),true);
  assert.strictEqual(fields[1].value,'1,200.01');const saved=JSON.parse(store.getItem('foundation-ext:node:'+controller.model.key));
  assert.strictEqual(saved.drafts[cases.cost.id].cells.unitCost,'1,200.01');assert(root.GradingEngine.grade(cases.cost,saved.drafts[cases.cost.id]).correct);
  assert(root.ProgressModel.validateBackupState(saved,questions));const fresh=new api.ExtensionController(doc,questions,store,'foundation-ext:node:');assert.deepStrictEqual(clone(fresh.model.state.drafts),saved.drafts);
});
test('unsigned calculator rejection preserves draft',()=>{const before=store.getItem('foundation-ext:node:'+controller.model.key);controller.expression='-2';assert.strictEqual(controller.insertCalculatorResult(false),false);assert.strictEqual(store.getItem('foundation-ext:node:'+controller.model.key),before);});
test('detached/stale numeric field is rejected',()=>{const before=store.getItem('foundation-ext:node:'+controller.model.key);fields[1].dataset.extensionQuestion='EXT-STALE';controller.expression='10';assert.strictEqual(controller.insertCalculatorResult(false),false);assert.strictEqual(store.getItem('foundation-ext:node:'+controller.model.key),before);fields[1].dataset.extensionQuestion=cases.cost.id;});
test('unmarked positive-integer behavior is unchanged',()=>{const ordinary=fields[0];ordinary.value='1234';controller.formatAmount(ordinary);assert.strictEqual(ordinary.value,'1,234');ordinary.value='1.23';assert.strictEqual(controller.formatAmount(ordinary),false);controller.calculatorTarget=ordinary;controller.expression='1.6';controller.insertCalculatorResult(false);assert.strictEqual(ordinary.value,'2');});
test('real controller review assignment and model completion',()=>{const q=cases.cost,now=Date.now();assert(controller.model.recordAttempt(q.id,false,10,'table-cell',false,now));controller.model.record(q.id,false,now);controller.model.state.reviewSchedule[q.id].dueAt=now-1;controller.model.state.mode='review';const ids=controller.reviewIds();assert(ids.includes(q.id));assert.strictEqual(controller.model.state.reviewAssignments[q.id].status,'assigned');const reviewAt=Math.max(now,controller.model.state.reviewAssignments[q.id].assignedAt);assert(controller.model.recordAttempt(q.id,true,10,'',true,reviewAt,0,'unsure',{mode:'review',support:'none',reviewSourceId:q.id}));assert(controller.model.completeReview(q.id,true,reviewAt,q.id));assert.strictEqual(controller.model.state.reviewAssignments[q.id],undefined);const saved=JSON.parse(store.getItem('foundation-ext:node:'+controller.model.key));assert(saved.correctIds.includes(q.id));assert.strictEqual(saved.reviewSchedule[q.id].stage,1);});
test('backup preparation is isolated and idempotent',()=>{const saved=clone(controller.model.state),bytes=JSON.stringify(saved),prepared=root.ProgressModel.prepareBackupState(saved,questions);assert(prepared);assert.strictEqual(JSON.stringify(saved),bytes);assert.deepStrictEqual(clone(root.ProgressModel.prepareBackupState(prepared,questions)),clone(prepared));});
test('canonical catalog, progress and rewards untouched',()=>{assert.strictEqual(Object.keys(root.QuestionData).length,300);assert.strictEqual(JSON.stringify(root.QuestionData),canonical);for(const key of protectedKeys)assert.strictEqual(store.getItem(key),'canonical sentinel '+key);assert(Object.keys(questions).every(id=>!root.QuestionData[id]));});
test('independent fixture arithmetic is bound to authored answers',()=>{
  assert.deepStrictEqual(cases.equipment.answer,{debit:[{account:'備品',amount:100000}],credit:[{account:'現金',amount:100000}]});
  const fxSettlement=1000*150,fxBank=fxSettlement-1000,fxGain=fxSettlement-140000;
  assert.strictEqual(fxSettlement,150000);assert.strictEqual(fxBank+1000,140000+fxGain);
  assert.deepStrictEqual(cases.fx.answer,{debit:[{account:'普通預金',amount:fxBank},{account:'支払手数料',amount:1000}],credit:[{account:'売掛金',amount:140000},{account:'為替差益',amount:fxGain}]});
  const totalCost=120000+80000+40001,unitExact=api.evaluateDecimalExpression(totalCost+'/200'),unitRounded=Number(api.roundHalfUp(unitExact,2));
  assert.strictEqual(totalCost,240001);assert.strictEqual(unitExact,'1200.005');assert.strictEqual(unitRounded,1200.01);assert.strictEqual(unitRounded*200-totalCost,1);
  assert.deepStrictEqual(cases.cost.answer.cells,{totalCost,unitCost:unitRounded});
  const pv1=60000*9091/10000,pv2=60000*8264/10000,pv=pv1+pv2;
  assert.deepStrictEqual([pv1,pv2,pv],[54546,49584,104130]);
  for(const [key,initial] of [['npvPositive',100000],['npvNegative',110000],['npvZero',104130]])assert.strictEqual(cases[key].answer.cells.npv,pv-initial);
  assert.strictEqual(cases.accrual.answer.cells.basis,'発生主義');
});
test('distinct NPV text and explicit scope',()=>{assert.strictEqual(new Set(['npvPositive','npvNegative','npvZero'].map(key=>cases[key].question)).size,3);for(const key of ['npvPositive','npvNegative','npvZero'])assert.strictEqual(cases[key].extension.scope,'cost:nineteenth2');assert(!cases.cost.question.includes('240,001'));assert(cases.cost.explanation.includes('240,002'));});
test('journal explanation gate rejects missing reasoning and reversed debit/credit sides',()=>{
  const runner=fs.readFileSync(path.join(ROOT,'.github/visual/run-foundation-extension.js'),'utf8');
  const definition=runner.match(/const explanationRequirements=(\{[^]*?\n\});/);assert(definition);
  const requirements=vm.runInNewContext('('+definition[1]+')');
  for(const key of ['equipment','fx']){
    const validate=text=>{for(const required of requirements[key])assert(text.includes(required),'Missing '+key+' teaching: '+required);};
    validate(cases[key].explanation);
    const withoutReason=cases[key].explanation.split('\n').filter(line=>!line.startsWith('【考え方】')).join('\n');
    assert.throws(()=>validate(withoutReason),/Missing/,'Account and amount tokens alone must not prove side reasoning');
    const reversed=cases[key].explanation.replace(/借方|貸方/g,side=>side==='借方'?'貸方':'借方');
    assert.throws(()=>validate(reversed),/Missing/,'Reversed debit/credit teaching must fail');
  }
});
test('browser evidence hashes served bytes and rejects changes at the same path',()=>{
  const runner=fs.readFileSync(path.join(ROOT,'.github/visual/run-foundation-extension.js'),'utf8');
  const definition=runner.match(/function recordSourceBlob\([^]*?\n\}/);
  assert(definition,'Missing source recorder');
  const record=vm.runInNewContext('('+definition[0]+')',{crypto,assert});
  const records={};
  for(const file of ['index.html','js/model.js','js/view.js','js/engine.js','css/style.css']){
    const bytes=Buffer.from('source bytes for '+file+'\n');
    assert.strictEqual(record(records,file,bytes),bytes);
    const expected=require('child_process').execFileSync('git',['hash-object','--stdin'],{input:bytes,encoding:'utf8'}).trim();
    assert.strictEqual(records[file].sha,expected);
    assert.strictEqual(record(records,file,bytes),bytes);
    assert.throws(()=>record(records,file,Buffer.from('changed bytes')),/Source changed during browser run/);
  }
  assert.strictEqual(Object.keys(records).length,5);
});
// Probe the actual browser bootstrap with isolated DOM/controller doubles; neither
// an old, completed review nor a missing due assignment may restart a fixture.
// The native Chromium/WebKit UI gate remains independently mandatory.
for(const due of [[],[cases.cost.id]])test('browser bootstrap review route '+(due.length?'due':'empty'),()=>{
  const runner=fs.readFileSync(path.join(ROOT,'.github/visual/run-foundation-extension.js'),'utf8');
  const template=runner.match(/const bootstrap=`([\s\S]*?)`;/);
  assert(template,'Missing actual bootstrap source');
  const script=template[1].match(/<script>([\s\S]*?)<\/script>/);
  assert(script,'Missing inline bootstrap controller path');
  const storageDouble={},seen={started:[],view:null,renders:0,reviewListClears:0};
  const documentDouble={getElementById(id){assert.strictEqual(id,'review-list');return{replaceChildren(...children){assert.deepStrictEqual(children,[]);seen.reviewListClears++;}};}};
  class ControllerDouble {
    constructor(document,questions,storage,prefix){
      assert.strictEqual(document,documentDouble);assert.strictEqual(storage,storageDouble);
      assert.strictEqual(prefix,'foundation-ext:test:');assert(questions[cases.cost.id]);
      this.model={state:{placement:{completed:true},mode:'training'}};
      this.rpg={};this.view={updateRpg(){},show:id=>{seen.view=id;}};
      this.currentId='PREVIOUS-ID';this.reviewSourceId='PREVIOUS-ID';
    }
    bindEvents(){}
    reviewIds(){return due;}
    renderModes(){seen.renders++;throw new Error('Full Story/Exam rendering requires the canonical catalog');}
    start(id){seen.started.push(id);this.currentId=id;this.reviewSourceId=id;}
  }
  const url='http://127.0.0.1/foundation-extension.html?fixture=cost&mode=review';
  const scope={URL,location:{href:url},document:documentDouble,window:{localStorage:storageDouble},
    FoundationExtensionCases:cases,
    FoundationExtensionAdapter:{ExtensionController:ControllerDouble,catalog:fixture=>Object.fromEntries(Object.values(fixture).map(q=>[q.id,q]))}};
  vm.runInNewContext(script[1].replace("'${prefix}'","'foundation-ext:test:'"),scope,{timeout:1000});
  const c=scope.window.extensionController;
  assert.strictEqual(c.model.state.mode,'review');
  assert.strictEqual(seen.renders,0,'An isolated review reload must not render unrelated Story/Exam pools');
  if(due.length){assert.deepStrictEqual(seen.started,due);assert.strictEqual(c.currentId,cases.cost.id);assert.strictEqual(seen.reviewListClears,0);}
  else {assert.deepStrictEqual(seen.started,[]);assert.strictEqual(c.currentId,null);
    assert.strictEqual(c.reviewSourceId,null);assert.strictEqual(seen.view,'view-review');assert.strictEqual(seen.reviewListClears,1);}
});
console.log('FOUNDATION_EXTENSION_CONTRACT '+passed+'/'+passed+' PASS');
console.log('FIXTURE_SHA256 '+crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'fixtures/foundation-extension-cases.js'))).digest('hex'));
