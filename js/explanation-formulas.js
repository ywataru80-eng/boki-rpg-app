(function(root,factory){
'use strict';
const api=factory();
if(typeof module==='object'&&module.exports)module.exports=api;
root.ExplanationFormulas=api;
})(typeof window!=='undefined'?window:globalThis,function(){
'use strict';
const arr=v=>Array.isArray(v)?v:[];
const comma=v=>Number(v).toLocaleString('ja-JP');
const escapeRe=v=>String(v).replace(/[.*+?^$(){}|[\]\\]/g,'\\$&');
const numberAfter=(s,label)=>{const m=String(s||'').match(new RegExp(escapeRe(label)+'[^0-9△▲-]*([△▲-]?[0-9][0-9,]*(?:\\.[0-9]+)?)'));if(!m)return Number.NaN;return(/^[△▲-]/u.test(m[1])?-1:1)*Number(m[1].replace(/[△▲,-]/g,''));};
const moneyFrom=s=>{const m=String(s||'').match(/([0-9][0-9,]*)円/u);return m?Number(m[1].replaceAll(',','')):Number.NaN;};
const namedAmounts=s=>Object.fromEntries([...String(s||'').matchAll(/([^、]+?)([0-9][0-9,]*)(?=、|$)/g)].map(m=>[m[1].trim(),Number(m[2].replaceAll(',',''))]));
const materialBy=(q,name)=>arr(q.materials).find(row=>row&&row['資料区分']===name);
const calc=(label,expression,result,refs,cellId)=>({label,expression,result,derivation:'calculated',cellId:cellId||null,operands:[],evidenceRefs:refs||['question']});
const direct=(label,result,note,refs,cellId)=>({label,expression:null,result,derivation:'direct',note,cellId:cellId||null,operands:[],evidenceRefs:refs||['question']});

function authored(q){
  const prefix=String(q.explanation||'').split('【使用する資料】')[0];
  const segments=prefix.split(/(?:。|\n)+/u).map(v=>v.replace(/^【[^】]+】\s*/u,'').trim()).filter(Boolean),out=[],seen=new Set();
  for(const segment of segments){
    if(!/[0-9]/u.test(segment)||!/[×÷＋+−－-]/u.test(segment)||!/[＝=]/u.test(segment)||seen.has(segment))continue;
    seen.add(segment);
    const ms=[...segment.matchAll(/[＝=][^0-9△▲-]*([△▲-]?[0-9][0-9,]*(?:\.[0-9]+)?)/g)],last=ms.at(-1);
    // 「帳簿価額＝300,000－180,000」has not stated its result yet.
    // Never treat the first operand after '=' as a computed result.
    const unresolved=last&&/^[\s円）)]*[×÷＋+−－-]/u.test(segment.slice(last.index+last[0].length));
    const result=last&&!unresolved?(/^[△▲-]/u.test(last[1])?-1:1)*Number(last[1].replace(/[△▲,-]/g,'')):null;
    out.push(calc('金額の計算',segment,Number.isFinite(result)?result:null,['explanation']));
  }
  return out;
}

function journal(q){
  if(q?.type!=='journal')return null;
  const text=String(q.question||''),amounts=[...text.matchAll(/([0-9][0-9,]*)円/gu)].map(match=>Number(match[1].replaceAll(',','')));
  const formula=(label,expression,result)=>calc(label,expression+' = '+comma(result),result,['question']);
  if(/取得原価/u.test(text)&&/売却/u.test(text)&&amounts.length>=3){
    const [cost,accumulated,proceeds]=amounts,book=cost-accumulated,loss=book-proceeds;
    return [formula('売却時帳簿価額',comma(cost)+' − '+comma(accumulated),book),formula(loss>=0?'固定資産売却損':'固定資産売却益',loss>=0?comma(book)+' − '+comma(proceeds):comma(proceeds)+' − '+comma(book),Math.abs(loss))];
  }
  if(/給与総額/u.test(text)&&amounts.length>=3){
    const [gross,tax,insurance]=amounts;
    return [formula('差引支給額（普通預金から支払う額）',comma(gross)+' − '+comma(tax)+' − '+comma(insurance),gross-tax-insurance)];
  }
  if(amounts.length>=2){
    const [a,b]=amounts;
    if(/引取運賃/u.test(text))return [formula('仕入原価（商品代金＋当店負担の引取運賃）',comma(a)+' + '+comma(b),a+b)];
    if(/仮払金/u.test(text)&&/返却/u.test(text))return [formula('取り消す仮払金（確定旅費＋返金）',comma(a)+' + '+comma(b),a+b)];
    if(/元本/u.test(text)&&/利息/u.test(text))return [formula('普通預金からの支払額（元本＋利息）',comma(a)+' + '+comma(b),a+b)];
    if(/会社負担分/u.test(text))return [formula('社会保険料の納付額（従業員分＋会社負担分）',comma(a)+' + '+comma(b),a+b)];
    if(/買掛金/u.test(text)&&/記帳していた/u.test(text))return [formula('追加する不足額（正しい支払額－記帳済額）',comma(a)+' − '+comma(b),a-b)];
  }
  return null;
}

function correction(q){
  if(q?.type!=='correction')return null;
  const material=arr(q.materials)[0]||{},recorded=String(material.recorded||'').match(/([0-9][0-9,]*)/u),correct=String(material.evidence||'').match(/([0-9][0-9,]*)円/u);
  if(!recorded||!correct)return null;
  const before=Number(recorded[1].replaceAll(',','')),after=Number(correct[1].replaceAll(',',''));
  if(before===after)return null;
  return[calc(before<after?'追加する不足額':'取り消す過大額',comma(Math.max(before,after))+' − '+comma(Math.min(before,after))+' = '+comma(Math.abs(before-after)),Math.abs(before-after),['materials'])];
}

function exam3(q){
  if(q&&q.format!=='exam-question-3')return null;
  const category=String(q.category||''),adj=String(materialBy(q,'決算整理事項')?.['内容']||'');
  if(/統合決算A/u.test(category)){
    const b=materialBy(q,'整理前残高試算表')||{},d=namedAmounts(b['借方']),c=namedAmounts(b['貸方']);
    const extraSales=numberAfter(adj,'未処理の掛売上'),extraPurch=numberAfter(adj,'未処理の掛仕入'),endingInv=numberAfter(adj,'期末商品');
    const sales=c['売上']+extraSales,receivables=d['売掛金']+extraSales,purchases=d['仕入']+extraPurch,cost=d['繰越商品']+purchases-endingInv;
    const rate=numberAfter(adj,'売掛金期末残高の')/100,allowanceNeeded=receivables*rate,allowanceExpense=allowanceNeeded-c['貸倒引当金'];
    const dep=numberAfter(adj,'備品の減価償却'),wages=numberAfter(adj,'未払給料'),tax=numberAfter(adj,'法人税等');
    const start=Number((/(\d+)月1日に1年分を払った保険料/u.exec(adj)||[])[1]),period=String(materialBy(q,'会計期間')?.['内容']||''),close=Number((/(\d+)月31日まで/u.exec(period)||[])[1]);
    const months=((close-start+12)%12)+1,insurance=d['保険料']*months/12,prepaid=d['保険料']-insurance;
    const profit=sales-cost-allowanceExpense-dep-insurance-wages-tax;
    const assets=d['現金']+(receivables-allowanceNeeded)+endingInv+(d['備品']-c['減価償却累計額']-dep)+prepaid;
    const equityLiab=c['買掛金']+extraPurch+wages+tax+c['資本金']+c['繰越利益剰余金']+profit;
    return[
      calc('売上高','整理前売上 '+comma(c['売上'])+' + 未処理売上 '+comma(extraSales)+' = '+comma(sales),sales,['materials'],'sales'),
      calc('当期仕入高（未処理反映後）',comma(d['仕入'])+' + '+comma(extraPurch)+' = '+comma(purchases),purchases,['materials']),
      calc('売上原価','期首商品棚卸高 + 当期仕入高 − 期末商品棚卸高 = '+comma(d['繰越商品'])+' + '+comma(purchases)+' − '+comma(endingInv)+' = '+comma(cost),cost,['materials'],'cost'),
      calc('貸倒引当金の必要額',comma(receivables)+' × '+(rate*100)+'% = '+comma(allowanceNeeded),allowanceNeeded,['materials']),
      calc('貸倒引当金繰入',comma(allowanceNeeded)+' − '+comma(c['貸倒引当金'])+' = '+comma(allowanceExpense),allowanceExpense,['materials'],'allowanceExpense'),
      direct('減価償却費',dep,'計算不要：決算整理事項に「備品の減価償却 '+comma(dep)+'円」と指定されています。',['materials'],'depreciation'),
      calc('保険料（当期分）','年間保険料 '+comma(d['保険料'])+' × 当期分 '+months+' ÷ 12 = '+comma(insurance),insurance,['materials'],'insurance'),
      direct('未払給料',wages,'計算不要：決算整理事項に未払給料 '+comma(wages)+'円と指定されています。',['materials'],'accruedWages'),
      direct('法人税等',tax,'計算不要：決算整理事項に法人税等 '+comma(tax)+'円と指定されています。',['materials'],'tax'),
      calc('当期純利益',comma(sales)+' − '+comma(cost)+' − '+comma(allowanceExpense)+' − '+comma(dep)+' − '+comma(insurance)+' − '+comma(wages)+' − '+comma(tax)+' = '+comma(profit),profit,['materials'],'netIncome'),
      calc('資産合計',comma(d['現金'])+' + ('+comma(receivables)+' − '+comma(allowanceNeeded)+') + '+comma(endingInv)+' + ('+comma(d['備品'])+' − '+comma(c['減価償却累計額'])+' − '+comma(dep)+') + '+comma(prepaid)+' = '+comma(assets),assets,['materials'],'totalAssets'),
      calc('負債・純資産合計',comma(c['買掛金']+extraPurch)+' + '+comma(wages)+' + '+comma(tax)+' + '+comma(c['資本金'])+' + '+comma(c['繰越利益剰余金'])+' + '+comma(profit)+' = '+comma(equityLiab),equityLiab,['materials'],'totalEquityLiabilities')
    ];
  }
  if(/統合決算B/u.test(category)){
    const base=namedAmounts(String(materialBy(q,'整理前残高')?.['内容']||'')),taxRate=Number((/標準税率\s*([0-9.]+)%/u.exec(q.question||'')||[])[1])/100;
    const actual=numberAfter(adj,'現金実査額'),extraSales=numberAfter(adj,'売上'),extraPurch=numberAfter(adj,'仕入'),endInv=numberAfter(adj,'期末商品'),ad=numberAfter(adj,'広告費'),equip=numberAfter(adj,'備品（訂正後'),depRate=numberAfter(adj,'年')/100,accruedIncome=numberAfter(adj,'受取手数料'),wagesAcc=numberAfter(adj,'給料'),tax=numberAfter(adj,'法人税等');
    const salesTax=extraSales*taxRate,cashReceipt=extraSales+salesTax,bookCash=base['現金実査前帳簿']+cashReceipt,shortage=bookCash-actual,sales=base['売上']+extraSales,purchases=base['仕入']+extraPurch,cost=base['期首商品']+purchases-endInv,dep=equip*depRate,inputTax=extraPurch*taxRate,vat=(base['仮受消費税']+salesTax)-(base['仮払消費税']+inputTax),fees=base['受取手数料']+accruedIncome,wages=base['給料']+wagesAcc,profit=sales+fees-cost-ad-dep-wages-shortage-tax;
    return[
      direct('決算後現金',actual,'計算不要：現金実査額 '+comma(actual)+'円を使用します。',['materials'],'cashAfter'),
      calc('未記帳売上の現金受取額（税込）',comma(extraSales)+' × (1 + '+(taxRate*100)+'%) = '+comma(cashReceipt),cashReceipt,['question','materials']),
      calc('現金不足（雑損）',comma(base['現金実査前帳簿'])+' + '+comma(cashReceipt)+' − '+comma(actual)+' = '+comma(shortage),shortage,['materials'],'cashShortage'),
      calc('売上高',comma(base['売上'])+' + '+comma(extraSales)+' = '+comma(sales),sales,['materials'],'sales'),
      calc('仕入勘定（未処理反映後）',comma(base['仕入'])+' + '+comma(extraPurch)+' = '+comma(purchases),purchases,['materials'],'purchases'),
      calc('売上原価',comma(base['期首商品'])+' + '+comma(purchases)+' − '+comma(endInv)+' = '+comma(cost),cost,['materials'],'cost'),
      direct('広告宣伝費',ad,'計算不要：誤記訂正額 '+comma(ad)+'円を使用します。',['materials'],'advertising'),
      calc('減価償却費','減価償却費 = '+comma(equip)+' × '+(depRate*100)+'% = '+comma(dep),dep,['materials'],'depreciation'),
      calc('未払消費税','未払消費税 = ('+comma(base['仮受消費税'])+' + '+comma(salesTax)+') − ('+comma(base['仮払消費税'])+' + '+comma(inputTax)+') = '+comma(vat),vat,['materials'],'vatPayable'),
      direct('未収手数料',accruedIncome,'計算不要：決算整理事項の '+comma(accruedIncome)+'円を使用します。',['materials'],'accruedIncome'),
      direct('未払給料',wagesAcc,'計算不要：決算整理事項の '+comma(wagesAcc)+'円を使用します。',['materials'],'accruedWages'),
      direct('法人税等',tax,'計算不要：決算整理事項の '+comma(tax)+'円を使用します。',['materials'],'tax'),
      calc('当期純利益',comma(sales)+' + '+comma(fees)+' − '+comma(cost)+' − '+comma(ad)+' − '+comma(dep)+' − '+comma(wages)+' − '+comma(shortage)+' − '+comma(tax)+' = '+comma(profit),profit,['materials'],'netIncome')
    ];
  }
  if(/統合決算C/u.test(category)){
    const base=namedAmounts(String(materialBy(q,'整理前残高')?.['内容']||'')),rate=numberAfter(adj,'売掛金の')/100,needed=base['売掛金']*rate,allowance=needed-base['貸倒引当金'];
    const intRate=numberAfter(adj,'年利')/100,intMonths=Number((/([0-9]+)か月分を未払計上/u.exec(adj)||[])[1]),interest=base['借入金']*intRate*intMonths/12;
    const rentTotal=Number((/翌年5月31日までの([0-9]+)か月分/u.exec(adj)||[])[1]),rentCurrent=4,rentRevenue=base['受取家賃']*rentCurrent/rentTotal,rentUnearned=base['受取家賃']-rentRevenue;
    const newCost=numberAfter(adj,'7月1日取得の備品'),newLife=numberAfter(adj,'耐用年数'),newDep=newCost/newLife*9/12;
    const oldAnnual=numberAfter(adj,'年額'),soldCost=numberAfter(adj,'従来備品（原価'),soldOpening=numberAfter(adj,'期首累計'),soldCurrent=numberAfter(adj,'当期6か月分'),salePrice=Number((/を([0-9][0-9,]*)円で売却/u.exec(adj)||[])[1]?.replaceAll(',',''));
    const oldDep=oldAnnual-soldCurrent*2,saleBook=soldCost-soldOpening-soldCurrent,saleLoss=saleBook-salePrice,receivable=numberAfter(adj,'未収利息'),tax=numberAfter(adj,'法人税等');
    return[
      calc('貸倒引当金繰入',comma(base['売掛金'])+' × '+(rate*100)+'% − '+comma(base['貸倒引当金'])+' = '+comma(allowance),allowance,['materials'],'allowanceExpense'),
      calc('当期支払利息（追加計上額）',comma(base['借入金'])+' × '+(intRate*100)+'% × '+intMonths+' ÷ 12 = '+comma(interest),interest,['materials'],'interestExpense'),
      direct('未払利息',interest,'当期支払利息の追加計上額 '+comma(interest)+'円と同額を負債計上します。',['materials'],'interestPayable'),
      calc('受取家賃（当期収益）',comma(base['受取家賃'])+' × '+rentCurrent+' ÷ '+rentTotal+' = '+comma(rentRevenue),rentRevenue,['materials'],'rentRevenue'),
      calc('前受家賃',comma(base['受取家賃'])+' × '+(rentTotal-rentCurrent)+' ÷ '+rentTotal+' = '+comma(rentUnearned),rentUnearned,['materials'],'rentUnearned'),
      calc('新備品の月割減価償却',comma(newCost)+' ÷ '+newLife+' × 9 ÷ 12 = '+comma(newDep),newDep,['materials'],'newAssetDepreciation'),
      calc('従来備品の期末減価償却（売却分を除く）',comma(oldAnnual)+' − ('+comma(soldCurrent)+' × 2) = '+comma(oldDep),oldDep,['materials'],'oldAssetDepreciation'),
      calc('固定資産売却損益','('+comma(soldCost)+' − '+comma(soldOpening)+' − '+comma(soldCurrent)+') − '+comma(salePrice)+' = '+comma(saleLoss),saleLoss,['materials'],'saleLoss'),
      direct('未収利息',receivable,'計算不要：決算整理事項の '+comma(receivable)+'円を使用します。',['materials'],'interestReceivable'),
      direct('法人税等',tax,'計算不要：決算整理事項の '+comma(tax)+'円を使用します。',['materials'],'tax')
    ];
  }
  return null;
}

function simpleComprehensive(q){
  if(q?.type!=='comprehensive'||q?.format)return null;
  const rows=arr(q.materials).filter(row=>row&&row.date!=='決算整理事項'),opening=moneyFrom(rows.find(row=>/現金残高/u.test(row.transaction))?.transaction);
  const cash=[opening],tokens=[comma(opening)],expenses=[],revenues=[];
  for(const row of rows.slice(1)){
    const text=String(row.transaction||''),amount=moneyFrom(text);if(!Number.isFinite(amount))continue;
    if(/借り入れ.*現金|内金.*現金で受け取|現金で.*販売/u.test(text)){cash.push(amount);tokens.push('+ '+comma(amount));}
    else if(/現金で.*仕入|現金で.*購入|現金で.*前払い|現金払い|現金で.*支払/u.test(text)){cash.push(-amount);tokens.push('− '+comma(amount));}
    if(/販売/u.test(text)&&!/内金/u.test(text))revenues.push(amount);
    if(/商品.*仕入/u.test(text)||/通信費/u.test(text)||/当月分給料/u.test(text)||/減価償却費/u.test(text))expenses.push(amount);
  }
  const ending=cash.reduce((s,v)=>s+v,0),profit=revenues.reduce((s,v)=>s+v,0)-expenses.reduce((s,v)=>s+v,0);
  return[calc('期末現金残高',tokens.join(' ')+' = '+comma(ending),ending,['materials'],'endingCash'),calc('3月の利益',revenues.map(comma).concat(expenses.map(v=>'− '+comma(v))).join(' ')+' = '+comma(profit),profit,['materials'],'profit')];
}

function worksheet(q){
  if(q?.type!=='worksheet')return null;
  if(/決算整理・計算問題/u.test(q.category||'')){
    const text=String(q.question||''),insurance=numberAfter(text,'保険料'),fraction=Number((/([0-9]+)分の1/u.exec(text)||[])[1]),equipment=numberAfter(text,'備品'),life=numberAfter(text,'耐用年数'),adjustment=insurance/fraction,current=insurance-adjustment,dep=equipment/life,book=equipment-dep;
    return[calc('保険料の次期分',comma(insurance)+' × 1 ÷ '+fraction+' = '+comma(adjustment),adjustment,['question'],'insurance_adjustment'),calc('保険料（当期分）',comma(insurance)+' − '+comma(adjustment)+' = '+comma(current),current,['question'],'insurance_expense_after'),calc('当期減価償却費',comma(equipment)+' ÷ '+life+' = '+comma(dep),dep,['question'],'depreciation_expense'),calc('期末帳簿価額',comma(equipment)+' − '+comma(dep)+' = '+comma(book),book,['question'],'equipment_book_value_after')];
  }
  if(q.format==='eight-column-worksheet'){
    const text=arr(q.adjustments).join('／')+'／'+String(q.question||''),adj=Number((/保険料(?:のうち)?([0-9][0-9,]*)円/u.exec(text)||[])[1]?.replaceAll(',','')),dep=Number((/(?:当期減価償却費|間接法で)([0-9][0-9,]*)円/u.exec(text)||[])[1]?.replaceAll(',','')),ms=arr(q.materials),base=Number(ms.find(r=>r?.['勘定科目']==='保険料')?.['借方']),sales=Number(ms.find(r=>r?.['勘定科目']==='売上')?.['貸方']),purchases=Number(ms.find(r=>r?.['勘定科目']==='仕入')?.['借方']);
    if(![adj,dep,base,sales,purchases].every(Number.isFinite))return null;
    const current=base-adj,profit=sales-purchases-current-dep;
    return[direct('前払保険料への振替額',adj,'計算不要：決算整理事項に '+comma(adj)+'円と指定されています。',['question']),calc('保険料（当期分）',comma(base)+' − '+comma(adj)+' = '+comma(current),current,['question','materials']),direct('減価償却費',dep,'計算不要：決算整理事項に '+comma(dep)+'円と指定されています。',['question']),calc('当期純利益',comma(sales)+' − '+comma(purchases)+' − '+comma(current)+' − '+comma(dep)+' = '+comma(profit),profit,['question'])];
  }
  if(q.format==='adjusted-trial-balance'){
    const by=Object.fromEntries(arr(q.materials).map(r=>[r?.['勘定科目'],r])),prepaid=numberAfter(by['保険料']?.['整理事項'],'前払分'),insurance=Number(by['保険料']?.['整理前借方'])-prepaid,dep=numberAfter(by['減価償却費']?.['整理事項'],'借方');
    const debits=[Number(by['現金']?.['整理前借方']),Number(by['売掛金']?.['整理前借方']),insurance,prepaid,Number(by['備品']?.['整理前借方']),dep],credits=[Number(by['買掛金']?.['整理前貸方']),dep,Number(by['資本金']?.['整理前貸方']),Number(by['繰越利益剰余金']?.['整理前貸方']),Number(by['売上']?.['整理前貸方'])],dt=debits.reduce((s,v)=>s+v,0),ct=credits.reduce((s,v)=>s+v,0);
    return[calc('保険料（整理後）',comma(Number(by['保険料']?.['整理前借方']))+' − '+comma(prepaid)+' = '+comma(insurance),insurance,['materials'],'insurance'),direct('前払保険料',prepaid,'計算不要：整理事項に前払分 '+comma(prepaid)+'円と指定されています。',['materials'],'prepaid'),direct('減価償却費',dep,'計算不要：整理事項に '+comma(dep)+'円と指定されています。',['materials'],'depreciation'),calc('整理後借方合計',debits.map(comma).join(' + ')+' = '+comma(dt),dt,['materials'],'debitTotal'),calc('整理後貸方合計',credits.map(comma).join(' + ')+' = '+comma(ct),ct,['materials'],'creditTotal')];
  }
  if(q.format==='closing-entries'){
    const text=String(q.question||''),sales=numberAfter(text,'売上'),purchases=numberAfter(text,'仕入'),insurance=numberAfter(text,'保険料'),dep=numberAfter(text,'減価償却費'),expense=purchases+insurance+dep,profit=sales-expense;
    return[direct('売上の振替額',sales,'計算不要：問題文の売上残高を使用します。',['question'],'sales'),direct('仕入の振替額',purchases,'計算不要：問題文の仕入残高を使用します。',['question'],'purchases'),direct('保険料の振替額',insurance,'計算不要：問題文の保険料残高を使用します。',['question'],'insurance'),direct('減価償却費の振替額',dep,'計算不要：問題文の減価償却費残高を使用します。',['question'],'depreciation'),calc('費用合計',comma(purchases)+' + '+comma(insurance)+' + '+comma(dep)+' = '+comma(expense),expense,['question']),calc('当期純利益',comma(sales)+' − '+comma(expense)+' = '+comma(profit),profit,['question'],'profit')];
  }
  return null;
}

function financial(q){
  if(q?.type!=='financial_statement')return null;
  if(q.format==='income-statement'){
    const ms=arr(q.materials),sum=k=>ms.filter(r=>r?.['区分']===k).reduce((s,r)=>s+Number(r?.['金額']||0),0),sales=sum('収益'),cost=sum('売上原価'),expenses=sum('費用'),net=sales-cost-expenses,expenseRows=ms.filter(r=>r?.['区分']==='費用').map(r=>Number(r?.['金額']));
    return[direct('売上高',sales,'計算不要：決算整理後データの収益額を使用します。',['materials'],'sales'),direct('売上原価',cost,'計算不要：決算整理後データの売上原価を使用します。',['materials'],'costOfSales'),calc('費用合計（売上原価を除く）',expenseRows.map(comma).join(' + ')+' = '+comma(expenses),expenses,['materials'],'expenses'),calc('当期純利益',comma(sales)+' − '+comma(cost)+' − '+comma(expenses)+' = '+comma(net),net,['materials'],'netIncome')];
  }
  if(q.format==='balance-sheet'){
    const rows=arr(q.table?.rows),assets=rows.filter(r=>r?.section==='資産'&&Number.isFinite(r.amount)).map(r=>Number(r.amount)),liabs=rows.filter(r=>r?.section==='負債'&&Number.isFinite(r.amount)).map(r=>Number(r.amount)),caps=rows.filter(r=>r?.section==='純資産'&&r?.account!=='繰越利益剰余金'&&Number.isFinite(r.amount)).map(r=>Number(r.amount));
    const at=assets.reduce((s,v)=>s+v,0),lt=liabs.reduce((s,v)=>s+v,0),cap=caps.reduce((s,v)=>s+v,0),retained=at-lt-cap,total=lt+cap+retained;
    return[calc('資産合計',assets.map(comma).join(' + ')+' = '+comma(at),at,['table.rows'],'assetsTotal'),calc('負債合計',liabs.map(comma).join(' + ')+' = '+comma(lt),lt,['table.rows']),calc('繰越利益剰余金',comma(at)+' − '+comma(lt)+' − '+comma(cap)+' = '+comma(retained),retained,['table.rows'],'retainedEarnings'),calc('負債・純資産合計',comma(lt)+' + '+comma(cap)+' + '+comma(retained)+' = '+comma(total),total,['table.rows'],'liabilitiesEquityTotal')];
  }
  return null;
}
function build(q){const special=journal(q)||correction(q)||exam3(q)||simpleComprehensive(q)||worksheet(q)||financial(q);if(special&&special.length)return special;const ledgerMatch=/^L(\d{3})$/u.exec(String(q?.id||''));if(q?.type==='ledger'&&ledgerMatch&&Number(ledgerMatch[1])>=26&&Number(ledgerMatch[1])<=50)return null;const x=authored(q);return x.length?x:null;}
return Object.freeze({build});
});
