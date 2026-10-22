'use strict';
const assert=require('assert'),fs=require('fs'),vm=require('vm');
const ExplanationModel=require('../js/explanation-model');
const sandbox={window:{}};
vm.runInNewContext(fs.readFileSync('data/questions.js','utf8'),sandbox,{filename:'data/questions.js'});
const questions=Array.from({length:25},(_,index)=>sandbox.window.QuestionData[`L${String(index+26).padStart(3,'0')}`]);
assert.strictEqual(questions.length,25,'旧Chapter 8相当のL026-L050を25問保持');
assert(questions.every(Boolean),'L026-L050の全IDが存在する');
assert(questions.every(q=>q.type==='ledger'),'L026-L050は全問ledger');
assert(questions.every(q=>q.explanationModel),'L026-L050全25問にstructured explanationを持たせる');
const noArithmetic=new Set(['L031','L034','L041','L050']);
for(const q of questions){
  const wrong={cells:Object.fromEntries((q.table?.inputCells||[]).map(id=>[id,'']))};
  const model=ExplanationModel.build(q,wrong,{correct:false});
  assert.strictEqual(ExplanationModel.validate(model).valid,true,`${q.id}: model valid`);
  assert(model.sources.length>0,`${q.id}: sources`);
  assert(model.summary.length>=2,`${q.id}: learner strategy`);
  assert(String(model.summary[0]?.text||'').startsWith('この問題で求めるのは'),`${q.id}: requested output first`);
  const calculated=new Set((model.calculation||[]).filter(item=>/[×÷＋+−\-＝=]/u.test(String(item.expression||''))).map(item=>String(item.result??'').replace(/[,\s円]/g,'')).filter(Boolean));
  for(const transfer of model.transfer)assert(!calculated.has(String(transfer.value??'').replace(/[,\s円]/g,'')),`${q.id}: transfer adds information beyond calculation`);
  const answerValues=new Set(Object.values(q.answer?.cells||{}).filter(Number.isFinite).map(value=>String(value)));
  for(const check of model.checks){
    const normalized=String(check.expected??'').replace(/[\s,円]/g,'');
    assert(!(answerValues.has(normalized)&&!/[=＝→／/]/u.test(String(check.expected??''))),`${q.id}: check must add independent information`);
  }
  assert(model.mistakes.length>0,`${q.id}: mistakes`);
  const learnerMeta=[...model.sources.map(item=>item.focus||''),...model.checks.map(item=>item.label||'')].join(' ');
  assert(!/正答値|項目と数値|記載されている数値|帳簿値|対応づける|条件と整合/u.test(learnerMeta),`${q.id}: 学習者向け解説にシステム寄り表現を残さない`);
  const rawSourceLabels=model.sources.flatMap(item=>(item.values||[]).map(value=>String(value.label||'')));
  assert(!rawSourceLabels.some(label=>/^(?:date|description|transaction|account|item|quantity|unitPrice|amount)$/u.test(label)),`${q.id}: 資料ラベルに内部英語キーを出さない`);
  const meaningful=model.calculation.some(item=>/[×÷＋+−\-＝=]/u.test(String(item.expression||'')));
  assert.strictEqual(meaningful,!noArithmetic.has(q.id),`${q.id}: arithmetic visibility`);
}
const formulas={
  L028:'440,000 + 134,000 = 574,000',
  L029:'(69 − 25) × 1,200 + 20 × 1,500 = 82,800',
  L030:'72,000 × 4 ÷ 12 = 24,000',
  L035:'70,000 + 85,000 + 45,000 = 200,000',
  L037:'40,000 + 120,000 − 90,000 = 70,000',
  L039:'600,000 × 3% = 18,000',
  L040:'540,000 − 420,000 = 120,000',
  L042:'180,000 + 120,000 = 300,000',
  L044:'0 ＋ 50,000 − 18,000 = 32,000',
  L045:'0 ＋ 300,000 − 85,000 = 215,000',
  L046:'4,800 + 7,200 = 12,000',
  L047:'120,000 − 20,000 = 100,000',
  L049:'12 × 1,100 = 13,200'
};
for(const [id,formula] of Object.entries(formulas)){
  const model=ExplanationModel.build(sandbox.window.QuestionData[id],{cells:{}},{correct:false});
  assert(model.calculation.some(item=>item.expression===formula),`${id}: expected formula ${formula}`);
}
const inventoryModel=ExplanationModel.build(sandbox.window.QuestionData.L029,{cells:{}},{correct:false});
const inventorySource=inventoryModel.sources[0];
assert.strictEqual(inventorySource.kind,'table','L029は表形式の資料として扱う');
assert.strictEqual(inventorySource.focus,'日付ごとに「数量 → 単価 → 金額」の順で横に確認します。','L029は初学者が見る順番を明示する');
assert.deepStrictEqual(JSON.parse(JSON.stringify(inventorySource.table.columns.map(column=>column.label))),['日付','摘要','数量（個）','単価（円／個）','金額（円）'],'L029の確認表は元の商品有高帳5列と意味に合う単位を保持する');
assert.strictEqual(inventorySource.table.rows.length,4,'L029の確認表は4行を保持する');
assert.strictEqual(inventorySource.table.rows.flat().filter(cell=>cell.value==='入力').length,3,'L029の未回答3欄は正答値へ展開しない');
const voucherModel=ExplanationModel.build(sandbox.window.QuestionData.L050,{cells:{}},{correct:false});
assert.strictEqual(voucherModel.sources.length,1,'L050は3取引を1つの確認表にまとめる');
assert.strictEqual(voucherModel.sources[0].title,'伝票（3伝票制）の資料','L050は資料全体を示す見出しにする');
assert(voucherModel.sources[0].table,'L050は取引資料を表として表示する');
assert.deepStrictEqual(JSON.parse(JSON.stringify(voucherModel.sources[0].table.columns.map(column=>column.label))),['資料','取引','金額'],'L050は資料・取引・金額の3列を保持する');
assert.strictEqual(voucherModel.sources[0].table.rows.length,3,'L050は3取引を3行で表示する');
const voucherTransactions=voucherModel.sources[0].table.rows.map(row=>row[1]?.value);
assert(voucherTransactions.includes('商品を現金で販売'),'L050は現金売上取引を資料に含む');
assert(voucherTransactions.includes('備品を現金で購入'),'L050は備品現金購入を資料に含む');
assert(voucherTransactions.includes('商品を掛けで仕入'),'L050は掛仕入取引を資料に含む');
assert(!/\b(?:item|account):/u.test(JSON.stringify(voucherModel.sources)),'L050の資料表示へ内部英語キーを漏らさない');
assert.strictEqual(voucherModel.sources[0].focus,'取引内容と金額を確認する','L050は何を見る資料かを具体的に示す');
assert(voucherModel.summary.some(item=>item.text.includes('現金が増える・減る・動かないの3つに分けて')),'L050は初学者がそのまま行動できる判断ルールを示す');
assert(voucherModel.checks.some(item=>item.label==='現金の動きに合った伝票を選べているか確認する'),'L050は自然な日本語で最後の確認を表示する');
assert(voucherModel.checks.some(item=>item.expected==='増える → 入金伝票 / 減る → 出金伝票 / 動かない → 振替伝票'),'L050は現金の増減と伝票の対応を短く示す');
assert(!/取引ごとに現金の動きと伝票の種類を対応づける|現金の受取＝入金伝票|正答値|帳簿値|資料の項目と数値/u.test(JSON.stringify(voucherModel)),'L050へ旧来の硬い表現を残さない');
assert(!voucherModel.checks.some(item=>/残高または帳簿値|次の行の計算/u.test(`${item.label} ${item.expected}`)),'L050へ元帳用の残高更新チェックを表示しない');
assert.deepStrictEqual(JSON.parse(JSON.stringify(sandbox.window.QuestionData.L050.answer.cells)),{value1:50000,value2:20000,value3:30000},'L050の正答金額は変更しない');
console.log('Chapter 8 structured explanation tests: PASS');
