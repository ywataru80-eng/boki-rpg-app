'use strict';
const assert=require('assert'),fs=require('fs'),vm=require('vm');
const Feedback=require('../js/feedback'),Model=require('../js/explanation-model');
const sandbox={window:{}};vm.runInNewContext(fs.readFileSync('data/questions.js','utf8'),sandbox);
const questions=sandbox.window.QuestionData,failures=[];
function test(name,run){try{run();console.log('PASS '+name);}catch(error){failures.push(name);console.error('FAIL '+name+': '+error.message);}}
const rules={
  L031:[/資産の増加は借方、減少は貸方/,/負債の増加は貸方、減少は借方/,/借方合計と貸方合計/],
  L005:[/取得原価/,/残存価額/,/耐用年数/,/償却方法/,/使用月数/,/累計額/,/帳簿価額/],
  L050:[/現金が増える.*入金伝票/,/現金が減る.*出金伝票/,/現金が動かない.*振替伝票/]
};
for(const [id,expected] of Object.entries(rules))for(const state of ['blank','wrong'])test(id+'/'+state,()=>{
  const q=questions[id],answer={cells:Object.fromEntries(Object.keys(q.answer.cells).map(k=>[k,state==='blank'?'':'不正値']))};
  const diagnostics=Feedback.diagnoseWrongAnswer(q,answer,{correct:false}),text=diagnostics.map(d=>d.reason).join('\n');
  assert(!/入金は加算、出金は減算|直前残高から更新/.test(text),'異なる形式に現金出納帳の解法を示さない');
  expected.forEach(rule=>assert(rule.test(text),'必要な判断関係: '+rule));
  assert.strictEqual(diagnostics.filter(d=>expected[0].test(d.reason)).length,1,'共通の解法は誤答欄ごとに重複しない');
  assert(!/勘違いしています|取り違えています/.test(text),'回答差だけで誤概念を断定しない');
  assert.deepStrictEqual(Feedback.diagnoseWrongAnswer({...q,id:'renamed'},answer,{correct:false}),diagnostics,'IDに依存しない');
  assert.strictEqual(Feedback.diagnoseWrongAnswer(q,q.answer,{correct:true}).length,0);
});
test('authored provenance / missing evidence / unmarked prose',()=>{
  const q=questions.J001,renamed={...q,id:'different-id'};
  assert.deepStrictEqual(Model.build(renamed,q.answer,{correct:true}).summary,Model.build(q,q.answer,{correct:true}).summary);
  const missing=Model.build({...q,explanation:''},{},{correct:true});
  assert.strictEqual(missing.summary.length,2,'根拠がなければ理由を推測しない');
  assert.strictEqual(missing.transfer[0].decision,'現金');
  const mismatched=Model.build({...q,explanation:q.explanation.replace('借方を現金3,000,000円','借方を現金9,000,000円')},{},{correct:true});
  assert.strictEqual(mismatched.transfer[0].decision,'現金','別の金額に対する説明を採用しない');
  const unmarked=Model.build(questions.J081,{},{correct:true});
  assert(unmarked.summary.some(i=>/固定資産税は租税公課として費用計上/.test(i.text)));
  assert(!unmarked.summary.some(i=>/48,000円/.test(i.text)),'金額確認の再掲を避ける');
});
test('journal amount difference does not prove a misconception',()=>{
  for(const id of ['J001','J035']){
    const q=questions[id],answer=JSON.parse(JSON.stringify(q.answer));answer.debit[0].amount+=1;
    const diagnostic=Feedback.diagnoseWrongAnswer(q,answer,{correct:false}).find(i=>i.kind==='amount');
    assert(diagnostic,'金額差は表示する');
    assert(!/取り違えています|勘違いしています/.test(diagnostic.reason),'金額差だけで誤概念を断定しない');
  }
});
const journalCases={J001:{reason:/株主からの払込みは純資産である資本金の増加/,rows:[['現金','資産の増加は借方','借方',3000000],['資本金','純資産の増加は貸方','貸方',3000000]]},J035:{reason:/収入印紙の未使用分は、次期以降に使用できる資産/,rows:[['貯蔵品','資産の増加は借方','借方',5000],['租税公課','費用の減少は貸方','貸方',5000]]}};
for(const [id,expected] of Object.entries(journalCases))for(const correct of [false,true])test(id+'/'+(correct?'correct':'wrong'),()=>{
  const q=questions[id],model=Model.build(q,correct?q.answer:{debit:[],credit:[]},{correct}),summary=model.summary.map(i=>i.text).join('\n');
  assert(expected.reason.test(summary),'問題固有の著者の処理根拠が表示モデルにある');
  assert(!/【金額確認】|【この問題への当てはめ】|【この問題の仕訳】/.test(summary),'著者解説全体を重複追加しない');
  for(const [account,why,to,value] of expected.rows){const card=model.transfer.find(i=>i.to===to&&i.value===value&&i.decision.includes(account));assert(card&&card.decision.includes(account+'：'+why),account+'の性質・増減と貸借方向が同一カードで結び付く');}
  assert.strictEqual(model.summary.filter(i=>expected.reason.test(i.text)).length,1);
  if(id==='J035')assert(!/売上原価|商品棚卸/.test(summary),'収入印紙を商品棚卸と混同しない');
});
test('cashbook / neutral unknown format / all 300 immutable',()=>{
  const cash=Feedback.diagnoseWrongAnswer(questions.L044,{cells:{}},{correct:false}).map(i=>i.reason).join('\n');
  assert(/入金は加算、出金は減算/.test(cash));
  const unknown={...questions.L031,format:'unknown',category:'不明'};
  assert(!/入金は加算|減価償却|入金伝票/.test(Feedback.diagnoseWrongAnswer(unknown,{cells:{}},{correct:false}).map(i=>i.reason).join('')));
  const disposal=Feedback.diagnoseWrongAnswer(questions.L040,{cells:{}},{correct:false}).map(i=>i.reason).join('');
  assert(/売却時の帳簿価額と売却価額を比べ/.test(disposal));
  assert(!/期末帳簿価額|期末の累計額/.test(Feedback.ledgerGuidance(questions.L040).join('')),'売却済み資産の帳簿価額を期末保有資産の簿価と混同しない');
  const before=JSON.stringify(questions);
  for(const q of Object.values(questions))assert(Model.validate(Model.build(q,{}, {correct:false})).valid,q.id);
  assert.strictEqual(JSON.stringify(questions),before);
});
const reviewedLedgerRules={
  L001:[/期首残高/,/増加/,/減少/,/残高方向/],
  L002:[/期首残高/,/増加/,/減少/,/残高方向/],
  L003:[/期首残高/,/増加/,/減少/,/残高方向/],
  L037:[/相手勘定/,/資産.*増加.*借方/,/負債.*増加.*貸方/,/残高方向/],
  L038:[/相手勘定/,/期首残高/,/減少/,/残高方向/],
  L039:[/再振替/,/月数/,/未払/,/損益/,/次期繰越/],
  L046:[/支払.*費用.*分類/,/合計/,/補給/],
  L047:[/総仕入高.*返品.*差し引.*純仕入高/],
  L048:[/総売上高.*返品.*差し引.*純売上高/]
};
for(const [id,rules] of Object.entries(reviewedLedgerRules))test('review ledger '+id,()=>{
  const q=questions[id],guidance=Feedback.ledgerGuidance(q).join('');
  rules.forEach(rule=>assert(rule.test(guidance),id+' format procedure '+rule));
  for(const cells of [{},Object.fromEntries(Object.keys(q.answer.cells).map(key=>[key,'不正値']))]){
    const text=Feedback.diagnoseWrongAnswer(q,{cells},{correct:false}).map(d=>d.reason).join('');
    rules.forEach(rule=>assert(rule.test(text),id+' diagnostic '+rule));
  }
  assert.deepStrictEqual(Feedback.ledgerGuidance({...q,id:'renamed'}),Feedback.ledgerGuidance(q));
});
const specialAccounts={J050:[['損益','一時的な決算勘定'],['繰越利益剰余金','会社内に留保された純資産']],J100:[['損益','一時的な決算勘定'],['繰越利益剰余金','会社内に留保された純資産']],J017:[['現金過不足','原因判明まで記録する仮勘定']],J145:[['貸倒引当金','資産の評価勘定']]};
for(const [id,accounts] of Object.entries(specialAccounts))test('review special accounts '+id,()=>{
  const q=questions[id];
  for(const correct of [true,false])for(const [account,definition] of accounts){
    const model=Model.build(q,correct?q.answer:{},{correct});
    const card=model.transfer.find(item=>item.decision.startsWith(account+'：'));
    assert(card&&card.decision.includes(definition),id+' '+account+' authored definition reaches transfer');
    assert(card.decision.includes(card.to+'に'),'transaction reason remains tied to the correct side');
    assert(!card.decision.includes('特殊勘定の増加・減少'),'an abstract special-account label is not a transaction reason');
    assert(!/円/u.test(card.decision),'金額は転記先に一度だけ表示する');
    assert(card.evidenceRefs.includes('explanation'));
  }
});
test('special-account evidence must match account, side and amount',()=>{
  const q=questions.J050;
  for(const [from,to] of [['借方に420,000円','借方に999,000円'],['借方に420,000円','貸方に420,000円'],['損益という特殊勘定','別科目という特殊勘定']]){
    const model=Model.build({...q,explanation:q.explanation.replace(from,to)},{},{correct:true});
    assert.strictEqual(model.transfer.find(item=>item.to==='借方').decision,'損益');
  }
});
test('account-ledger guidance does not infer interest from format alone',()=>{
  const q={...questions.L039,category:'任意の勘定元帳'};
  const guidance=Feedback.ledgerGuidance(q).join('');
  assert(!/利息|年利率|再振替/.test(guidance));
  assert(/相手勘定/.test(guidance));
});
if(failures.length){console.error(failures.length+' P1 regression failures');process.exitCode=1;}
