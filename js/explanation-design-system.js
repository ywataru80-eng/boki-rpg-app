(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.ExplanationDesignSystem=api;
})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  // A data-driven presentation contract. Accounting truth stays with QuestionData,
  // ExplanationModel and the independently audited Oracle.
  const COMPONENTS=Object.freeze({
    goal:'求めること',source:'資料の着眼点',decision:'判断の順序',
    formula:'計算の道筋',transfer:'転記の道筋',journalTable:'仕訳票',
    timeline:'時系列',beforeAfter:'訂正前と訂正後',
    check:'別の根拠で検算',misconception:'間違えやすい判断',takeaway:'類題への応用'
  });
  const common=['goal','source','decision','transfer','check','misconception','takeaway'];
  const profile=(label,path,extra=[])=>Object.freeze({
    label,path:Object.freeze(path),components:Object.freeze([...new Set([...common,...extra])])
  });
  const PROFILES=Object.freeze({
    journal:profile('仕訳',['取引事実','勘定科目','増減を判断','借方・貸方','金額','仕訳票','貸借一致'],['journalTable']),
    journalBook:profile('仕訳帳',['取引資料','仕訳を完成','日付・摘要','元丁と金額','仕訳帳へ記入','資料と照合'],['journalTable','timeline']),
    ledger:profile('元帳・補助簿',['元資料','対象勘定','増減と相手勘定','元帳へ転記','残高を確認']),
    accountRule:profile('勘定記入法則',['勘定の種類','増加か減少か','借方・貸方を対応','貸借を照合','原理を言葉で確認']),
    inventory:profile('商品有高帳',['取引資料','数量と単価','払出単価を決定','払出額と残高','数量・金額を検算'],['formula']),
    cashBook:profile('現金・預金出納帳',['日付順の入出金','受入・支払の区分','該当欄へ記入','直前残高から更新','資料と残高を照合'],['timeline','formula']),
    pettyCash:profile('小口現金出納帳',['領収証と精算書','費用科目を判断','支払を記入','支払合計と補給','残高を照合'],['formula']),
    notes:profile('手形記入帳',['手形資料','記帳対象を選別','日付と相手先','金額と満期日','記入帳と資料を照合'],['timeline']),
    purchaseSales:profile('仕入帳・売上帳',['取引資料','仕入・売上と返品','日付順に記入','純額を計算','資料と残高を照合'],['formula','timeline']),
    voucher:profile('伝票',['取引資料','現金の増減を判断','伝票の種類を決定','科目と金額を記入','取引内容と照合'],['journalTable']),
    fixedAsset:profile('固定資産台帳',['取得日・取得原価','耐用年数と償却方法','１年分の償却費','使用月数と月割り','累計額と帳簿価額','残高の関係を検算'],['formula','timeline']),
    trialBalance:profile('試算表',['各勘定の残高','残高の借貸を判断','試算表へ転記','各列を合計','貸借合計を検算'],['formula']),
    correction:profile('訂正仕訳',['記録済みの仕訳','本来の正しい仕訳','誤りの差分を抽出','訂正仕訳へ反映','訂正後を資料と照合'],['journalTable','beforeAfter']),
    worksheet:profile('精算表',['整理前残高','決算整理を判断','修正記入','損益計算書と貸借対照表','利益と貸借を検算'],['formula','beforeAfter']),
    closingDecision:profile('決算整理の個別判断',['資料の条件を確認','当期・次期や原価の関係を判断','設問に必要な金額・科目を算定','指定の欄に記入','原資料から別の方法で照合'],['formula']),
    adjustedTrial:profile('整理後残高試算表',['整理前残高','決算整理を反映','整理後の残高','試算表へ転記','貸借合計を検算'],['formula','beforeAfter']),
    closingEntries:profile('決算振替仕訳',['決算整理後の残高','損益勘定への振替','当期利益の振替','締切後の残高','貸借を検算'],['journalTable','beforeAfter']),
    financialPL:profile('損益計算書',['整理後の残高','収益と費用を分類','損益計算書へ転記','各区分を集計','利益を検算'],['formula']),
    financialBS:profile('貸借対照表',['整理後の残高','資産・負債・純資産','貸借対照表へ転記','区分と合計','貸借を検算'],['formula']),
    comprehensive:profile('総合問題',['資料と求める答え','必要な処理を分離','各取引を計算・転記','集計して答えを記入','別根拠で照合'],['formula','journalTable','beforeAfter']),
    comprehensiveClosing:profile('総合決算',['整理前残高','未処理取引','決算整理','損益計算書と貸借対照表','利益と貸借を検算'],['formula','journalTable','beforeAfter'])
  });
  // Explicit matrix: every concrete type/format combination must be deliberately classified.
  const MATRIX=Object.freeze({
    'journal/default':'journal',
    'ledger/default':'ledger',
    'ledger/journal-book':'journalBook',
    'ledger/fixed-asset-ledger':'fixedAsset',
    'ledger/bookkeeping-account-ledger':'ledger',
    'ledger/bookkeeping-account-rule':'accountRule',
    'ledger/bookkeeping-general-ledger':'ledger',
    'ledger/bookkeeping-cash-book':'cashBook',
    'ledger/bookkeeping-checking-book':'cashBook',
    'ledger/bookkeeping-petty-cash-book':'pettyCash',
    'ledger/bookkeeping-inventory-ledger':'inventory',
    'ledger/bookkeeping-notes-receivable':'notes',
    'ledger/bookkeeping-notes-payable':'notes',
    'ledger/bookkeeping-purchase-book':'purchaseSales',
    'ledger/bookkeeping-sales-book':'purchaseSales',
    'ledger/bookkeeping-voucher-entry':'voucher',
    'trial_balance/default':'trialBalance',
    'correction/default':'correction',
    'worksheet/default':'worksheet',
    'worksheet/decision-worksheet-v2':'closingDecision',
    'worksheet/eight-column-worksheet':'worksheet',
    'worksheet/adjusted-trial-balance':'adjustedTrial',
    'worksheet/closing-entries':'closingEntries',
    'financial_statement/income-statement':'financialPL',
    'financial_statement/balance-sheet':'financialBS',
    'comprehensive/default':'comprehensive',
    'comprehensive/exam-question-3':'comprehensiveClosing'
  });
  const keyFor=q=>String(q?.type||'')+'/'+String(q?.format||'default');
  function classify(q){
    const key=keyFor(q);
    // Legacy Chapter 7/8 商品有高帳 uses ledger/default, but pedagogically it
    // follows the same quantity → unit price → amount flow as inventory-ledger.
    if(key==='ledger/default'&&/商品有高帳/u.test(String(q?.category||'')))return 'inventory';
    const id=MATRIX[key];
    if(!id)throw new Error('EXPLANATION_FORMAT_NOT_CLASSIFIED:'+key);
    return id;
  }
  const getFirstText=(values,field)=>Array.isArray(values)?values.find(item=>typeof item?.[field]==='string'&&item[field].trim())?.[field].trim():null;
  function planFor(q,options={}){
    const profileId=classify(q),p=PROFILES[profileId],m=options.model;
    const meaningfulFormula=!m||!Array.isArray(m.calculation)||m.calculation.some(item=>/[×÷＋+−\-＝=]/u.test(String(item?.expression||'')));
    const components=p.components.filter(id=>(id!=='misconception'||options.correct!==true)&&(id!=='formula'||meaningfulFormula));
    const evidence=m?[
      {id:'source',label:'まず見る資料',text:getFirstText(m.sources,'focus')},
      {id:'decision',label:'判断の根拠',text:getFirstText(m.summary?.slice(1),'text')},
      ...(meaningfulFormula?[{id:'formula',label:'必要な計算',text:getFirstText(m.calculation,'expression')}]:[]),
      {id:'check',label:'別の根拠で確認',text:getFirstText(m.checks,'label')}
    ].filter(item=>item.text):[];
    return Object.freeze({
      schemaVersion:1,formatKey:keyFor(q),profileId,title:p.label,
      path:Object.freeze([...p.path]),
      components:Object.freeze(components.map(id=>Object.freeze({id,label:COMPONENTS[id]}))),
      evidence:Object.freeze(evidence.map(item=>Object.freeze(item)))
    });
  }
  const node=(doc,tag,className,text)=>{
    const el=doc.createElement(tag);
    if(className)el.className=className;
    if(text!=null)el.textContent=String(text);
    return el;
  };
  function render(doc,plan){
    const section=node(doc,'section','explanation-route');
    section.setAttribute('aria-label','解答までの道筋');
    section.dataset.explanationProfile=plan.profileId;
    const title=node(doc,'h4','explanation-route-title','解答までの道筋');
    const intro=node(doc,'p','explanation-route-intro',plan.title+'：この順番で確認します。');
    const list=node(doc,'ol','explanation-route-list');
    plan.path.forEach((label,index)=>{
      const item=node(doc,'li','explanation-route-step');
      item.append(node(doc,'span','explanation-route-number',index+1),node(doc,'span','explanation-route-label',label));
      list.append(item);
    });
    section.append(title,intro,list);
    if(plan.evidence.length){
      const details=node(doc,'details','explanation-route-evidence');
      const summary=node(doc,'summary','', 'この問題の資料・判断・検算を確認');
      const facts=node(doc,'dl','explanation-route-facts');
      plan.evidence.forEach(item=>{
        const row=node(doc,'div','explanation-route-fact');
        row.dataset.component=item.id;
        row.append(node(doc,'dt','',item.label),node(doc,'dd','',item.text));
        facts.append(row);
      });
      details.append(summary,facts);section.append(details);
    }
    return section;
  }
  return Object.freeze({SCHEMA_VERSION:1,COMPONENTS,PROFILES,MATRIX,classify,planFor,render});
});
