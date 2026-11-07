'use strict';
const assert=require('assert'),fs=require('fs'),vm=require('vm');
const FormulaEngine=require('../js/explanation-formulas');
const ExplanationModel=require('../js/explanation-model');
const sandbox={window:{}};
vm.runInNewContext(fs.readFileSync('data/questions.js','utf8'),sandbox,{filename:'data/questions.js'});
const data=sandbox.window.QuestionData,values=Object.values(data);
assert.strictEqual(values.length,300,'question count');

const meaningful=item=>/[×÷＋+−－-]/u.test(String(item.expression||''))&&/[＝=]/u.test(String(item.expression||''));
let formulaQuestions=0,formulaItems=0,directItems=0,cellChecks=0;
for(const q of values){
  const items=FormulaEngine.build(q)||[];
  if(items.length)formulaQuestions++;
  for(const item of items){
    assert(!String(item.expression||'').includes('NaN'),q.id+': formula must not contain NaN');
    assert(!String(item.note||'').includes('NaN'),q.id+': direct note must not contain NaN');
    if(item.derivation==='calculated'){
      formulaItems++;
      assert(meaningful(item)||item.label==='未払利息',q.id+': calculated item needs arithmetic expression: '+item.label);
    }else if(item.derivation==='direct'){
      directItems++;
      assert(item.note&&String(item.note).trim(),q.id+': direct item needs reason: '+item.label);
    }else assert.fail(q.id+': derivation classification missing');
    if(item.cellId&&Object.prototype.hasOwnProperty.call(q.answer?.cells||{},item.cellId)&&Number.isFinite(Number(q.answer.cells[item.cellId]))&&Number.isFinite(Number(item.result))){
      cellChecks++;
      assert.strictEqual(Number(item.result),Number(q.answer.cells[item.cellId]),q.id+'/'+item.cellId+': source-derived result must equal answer');
    }
  }
}
assert(formulaQuestions>=56,'at least the 56 known authored-formula questions must expose formulas');
assert(formulaItems>=80,'formula coverage must materially exceed Generation 63');

const formulaLike=/[0-9０-９][^。\n]*[×÷＋+−－-][^。\n]*[＝=]/u;
const hidden=[];
for(const q of values){
  const prefix=String(q.explanation||'').split('【使用する資料】')[0];
  if(!formulaLike.test(prefix))continue;
  const model=ExplanationModel.build(q,q.type==='journal'?{}:{cells:{}},{correct:false},{diagnostics:[]});
  if(!(model.calculation||[]).some(meaningful))hidden.push(q.id);
}
assert.deepStrictEqual(hidden,[],'authored arithmetic must not disappear from structured explanation');

const requireCells=(id,ids)=>{
  const q=data[id],items=FormulaEngine.build(q)||[],covered=new Set(items.map(item=>item.cellId).filter(Boolean));
  ids.forEach(cell=>assert(covered.has(cell),id+': formula/direct derivation missing for '+cell));
  items.filter(item=>item.cellId&&ids.includes(item.cellId)).forEach(item=>assert.strictEqual(Number(item.result),Number(q.answer.cells[item.cellId]),id+'/'+item.cellId+': recalculation mismatch'));
};
requireCells('C001',['sales','cost','allowanceExpense','depreciation','insurance','accruedWages','tax','netIncome','totalAssets','totalEquityLiabilities']);
requireCells('C002',['cashAfter','cashShortage','sales','purchases','cost','advertising','depreciation','vatPayable','accruedIncome','accruedWages','tax','netIncome']);
requireCells('C003',['allowanceExpense','interestExpense','interestPayable','rentRevenue','rentUnearned','newAssetDepreciation','oldAssetDepreciation','saleLoss','interestReceivable','tax']);
for(let i=4;i<=10;i++)requireCells('C'+String(i).padStart(3,'0'),['endingCash','profit']);
for(let i=2;i<=18;i++){
  const id='D'+String(i).padStart(3,'0'),q=data[id];
  assert.strictEqual(q.format,'decision-worksheet-v2',id+': successor worksheet identity');
  // Check all and only the live assessment fields, not the historical four-column drill.
  requireCells(id,[...q.table.inputCells]);
}
requireCells('D020',['sales','purchases','insurance','depreciation','profit']);
requireCells('F001',['sales','costOfSales','expenses','netIncome']);
for(let i=2;i<=10;i++)requireCells('F'+String(i).padStart(3,'0'),['retainedEarnings','assetsTotal','liabilitiesEquityTotal']);

const c1=FormulaEngine.build(data.C001);
const find=(items,label)=>items.find(item=>item.label===label);
assert.strictEqual(find(c1,'売上原価').result,1420000,'C001 COGS');
assert(find(c1,'売上原価').expression.includes('期首商品棚卸高 + 当期仕入高 − 期末商品棚卸高'),'C001 shows COGS formula');
assert.strictEqual(find(c1,'保険料（当期分）').result,60000,'C001 insurance');
assert(find(c1,'保険料（当期分）').expression.includes('120,000 × 当期分 6 ÷ 12 = 60,000'),'C001 shows monthly insurance formula');
assert.strictEqual(find(c1,'減価償却費').derivation,'direct','C001 depreciation is supplied adjustment, not fabricated formula');
assert(find(c1,'減価償却費').note.includes('決算整理事項'),'C001 depreciation explains direct source');

const d1=FormulaEngine.build(data.D001);
assert(find(d1,'保険料（当期分）')?.expression.includes('200,000 − 40,000 = 160,000'),'D001 uses stated insurance adjustment');
assert(find(d1,'減価償却費')?.note.includes('60,000'),'D001 uses stated depreciation adjustment');

console.log(JSON.stringify({status:'PASS',questionCount:values.length,formulaQuestions,formulaItems,directItems,cellChecks},null,2));