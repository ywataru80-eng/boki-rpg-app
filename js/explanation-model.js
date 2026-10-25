(function(root,factory){
  'use strict';
  let feedback=root.WrongAnswerFeedback;
  let formulas=root.ExplanationFormulas;
  if(typeof module==='object'&&module.exports){try{feedback=require('./feedback');}catch(_){} try{formulas=require('./explanation-formulas');}catch(_){}}
  const api=factory(feedback,formulas);
  if(typeof module==='object'&&module.exports) module.exports=api;
  root.ExplanationModel=api;
})(typeof window!=='undefined'?window:globalThis,function(Feedback,FormulaEngine){
  'use strict';
  const SCHEMA_VERSION=1;
  const REQUIRED_SECTIONS=Object.freeze(['sources','summary','calculation','transfer','checks','mistakes']);
  const labels={date:'日付',description:'摘要',transaction:'取引内容',account:'勘定科目',item:'項目',value:'内容',answer:'解答欄',recorded:'帳簿の記録',evidence:'証ひょう',section:'区分',quantity:'数量',unitPrice:'単価',amount:'金額',debit:'借方',credit:'貸方',balance:'残高',tbDebit:'試算表 借方',tbCredit:'試算表 貸方',adjDebit:'修正記入 借方',adjCredit:'修正記入 貸方',plDebit:'損益計算書 借方',plCredit:'損益計算書 貸方',bsDebit:'貸借対照表 借方',bsCredit:'貸借対照表 貸方',asset:'固定資産',acquisitionDate:'取得日',acquisitionCost:'取得原価',residualValue:'残存価額',life:'耐用年数',method:'償却方法',months:'使用月数',annualDepreciation:'1年分の減価償却費',openingAccumulated:'期首減価償却累計額',currentDepreciation:'当期減価償却費',closingAccumulated:'期末減価償却累計額',closingBookValue:'期末帳簿価額',disposalBookValue:'売却時帳簿価額',disposalLoss:'固定資産売却損',before:'整理前金額',adjustment:'決算整理額',after:'整理後金額'};
  const obj=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
  const arr=v=>Array.isArray(v)?v:(v==null?[]:[v]);
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  const num=v=>typeof v==='number'&&Number.isFinite(v)?v.toLocaleString('ja-JP'):String(v??'');
  const shown=v=>v!=null&&v!==''&&v!=='入力'&&v!=='—';
  const rowName=(q,r,i)=>String(['date','asset','account','item','description'].map(k=>r?.[k]).find(shown)||`${q.category||'表'} ${i+1}行目`);
  function locations(q){const m=new Map();let n=0;if(!q?.table?.rows||!Array.isArray(q.table.inputCells))return m;q.table.rows.forEach((r,ri)=>Object.entries(r).forEach(([c,v])=>{if(v==='入力'){const id=q.table.inputCells[n++];if(id)m.set(id,{ri,c,r});}}));return m;}
  const cellLabel=(q,id,p)=>q?.table?.inputMetadata?.[id]?.label||(!p?id:`${rowName(q,p.r,p.ri)}／${labels[p.c]||p.c}`);
  const materialMetaKeys=new Set(['資料','資料区分','資料種別','title','name','type','document']);
  function sourceValues(m){if(!obj(m))return[{label:'内容',value:String(m??'')}];return Object.entries(m).filter(([k,v])=>!materialMetaKeys.has(k)&&shown(v)).map(([k,v])=>({label:labels[k]||String(k),value:num(v)}));}
  const tableColumnLabel=k=>k==='unitPrice'?'単価（円／個）':k==='quantity'?'数量（個）':k==='amount'?'金額（円）':labels[k]||String(k);
  const schemaOf=m=>obj(m)?Object.keys(m).sort().join('\u0001'):'';
  const sameMaterialSchema=ms=>ms.length>1&&ms.every(obj)&&ms.every(m=>schemaOf(m)===schemaOf(ms[0]));
  const materialTableKind=columns=>{
    const keys=columns.map(String),has=k=>keys.includes(k);
    if(keys.length===3&&has('勘定科目')&&has('借方')&&has('貸方'))return 'trial-balance';
    if(keys.length<=3&&(has('date')||has('日付')||has('受取日')||has('振出日'))&&(has('transaction')||has('取引')||has('内容')||has('摘要')))return 'timeline';
    if(keys.length<=3)return 'compact';
    return 'material-grid';
  };
  function tableFromObjects(rows,kind){
    const sourceRows=arr(rows).filter(obj),columns=[...new Set(sourceRows.flatMap(row=>Object.keys(row)))];
    if(!columns.length)return null;
    return{kind:kind||materialTableKind(columns),columns:columns.map(key=>({key:String(key),label:tableColumnLabel(key)})),rows:sourceRows.map(row=>columns.map(key=>({key:String(key),value:row[key]})))};
  }
  function sourceTable(q){
    const columns=arr(q.table?.columns),rows=arr(q.table?.rows);
    if(!columns.length||!rows.length||!columns.every(key=>rows.some(row=>obj(row)&&Object.prototype.hasOwnProperty.call(row,key))))return null;
    const kind=q.type==='trial_balance'?'trial-balance':materialTableKind(columns);
    return{kind,columns:columns.map(key=>({key:String(key),label:tableColumnLabel(key)})),rows:rows.map(row=>columns.map(key=>({key:String(key),value:obj(row)?row[key]:null})))};
  }
  function parseAmountPairs(text){
    const parts=String(text||'').split('、').map(part=>part.trim()).filter(Boolean);
    if(!parts.length)return null;
    const out=[];
    for(const part of parts){
      const match=part.match(/^(.+?)(△|▲|-)?\s*([0-9][0-9,]*)(?:円)?$/u);
      if(!match)return null;
      const amount=Number(match[3].replaceAll(',',''))*(match[2]?-1:1);
      if(!Number.isFinite(amount))return null;
      out.push({label:match[1].trim(),value:amount});
    }
    return out;
  }
  function trialBalanceFromMaterial(m){
    if(!obj(m)||!shown(m['借方'])||!shown(m['貸方']))return null;
    const debit=parseAmountPairs(m['借方']),credit=parseAmountPairs(m['貸方']);
    if(!debit||!credit)return null;
    const rows=[
      ...debit.map(entry=>[{key:'account',value:entry.label},{key:'debit',value:entry.value},{key:'credit',value:null}]),
      ...credit.map(entry=>[{key:'account',value:entry.label},{key:'debit',value:null},{key:'credit',value:entry.value}])
    ];
    const debitTotal=Number(m['借方合計']),creditTotal=Number(m['貸方合計']),totalRowIndexes=[];
    if(Number.isFinite(debitTotal)&&Number.isFinite(creditTotal)){totalRowIndexes.push(rows.length);rows.push([{key:'account',value:'合計'},{key:'debit',value:debitTotal},{key:'credit',value:creditTotal}]);}
    return{kind:'trial-balance',columns:[{key:'account',label:'勘定科目'},{key:'debit',label:'借方'},{key:'credit',label:'貸方'}],rows,totalRowIndexes};
  }
  function keyValueTableFromText(text){
    const parsed=parseAmountPairs(text);
    if(!parsed||parsed.length<2)return null;
    return{kind:'key-value',columns:[{key:'item',label:'項目'},{key:'amount',label:'金額'}],rows:parsed.map(entry=>[{key:'item',value:entry.label},{key:'amount',value:entry.value}])};
  }
  const materialTitle=(q,m,i)=>{
    if(q.type==='correction')return '帳簿と証ひょう';
    return String(m?.['資料区分']||m?.['資料']||m?.['資料種別']||m?.title||m?.name||m?.type||m?.document||m?.['固定資産']||`${q.category||'確認'}の資料${arr(q.materials).length>1?` ${i+1}`:''}`);
  };
  const materialGroupTitle=(q,columns)=>{
    const keys=columns.map(String),has=k=>keys.includes(k);
    if((has('date')||has('日付'))&&(has('transaction')||has('取引')||has('内容')))return '取引資料';
    if(q.type==='worksheet')return '整理前資料';
    if(q.type==='financial_statement')return '財務諸表作成資料';
    return `${q.category||'問題'}の資料`;
  };
  const tableFocus=q=>{const format=q.format||'',category=String(q.category||'');if(format==='bookkeeping-inventory-ledger'||/商品有高帳/u.test(category))return '日付ごとに「数量 → 単価 → 金額」の順で横に確認します。';if(format==='fixed-asset-ledger'||/固定資産台帳/u.test(category))return '取得原価・耐用年数など、計算に使う条件を横に確認します。';return '表に書かれている内容と、空欄の位置を確認します。';};
  const materialFocus=(q,title='')=>{const format=q.format||'',category=String(q.category||'');if(q.type==='correction')return '帳簿の記録と証ひょうを比べる';if(/決算整理事項/u.test(title))return '決算整理事項を上から順に確認する';if(/整理前残高試算表/u.test(title))return '勘定科目が借方・貸方のどちらにあり、合計が一致しているか確認する';if(/整理前残高/u.test(title))return '整理前残高を勘定科目ごとに確認する';if(format==='bookkeeping-voucher-entry')return '取引内容と金額を確認する';if(format==='bookkeeping-notes-receivable'||format==='bookkeeping-notes-payable')return '日付・相手先・金額を確認する';if(format==='fixed-asset-ledger'||/固定資産台帳/u.test(category))return '取得原価・耐用年数など、計算に使う条件を確認する';return '資料に書かれている内容を確認する';};
  function structuredMaterialSource(q,m,i){
    const title=materialTitle(q,m,i),base={kind:'material',title,focus:materialFocus(q,title),evidenceRef:`materials[${i}]`};
    const trial=trialBalanceFromMaterial(m);
    if(trial)return{...base,values:[],table:trial};
    if(/決算整理事項/u.test(title)&&typeof m?.['内容']==='string'){
      const list=String(m['内容']).split('／').map(value=>value.trim()).filter(Boolean);
      if(list.length>1)return{...base,values:[],list};
    }
    if(/整理前残高/u.test(title)&&typeof m?.['内容']==='string'){
      const table=keyValueTableFromText(m['内容']);
      if(table)return{...base,values:[],table};
    }
    return{...base,values:sourceValues(m)};
  }
  function sources(q){
    const ms=arr(q.materials).filter(v=>v!=null);
    if(ms.length){
      if(sameMaterialSchema(ms)&&!ms.some(m=>obj(m)&&Object.prototype.hasOwnProperty.call(m,'資料区分'))){
        const table=tableFromObjects(ms);
        return[{kind:'material-group',title:materialGroupTitle(q,table?.columns?.map(column=>column.key)||[]),focus:materialFocus(q),values:[],table,evidenceRef:'materials'}];
      }
      return ms.map((m,i)=>structuredMaterialSource(q,m,i));
    }
    if(q.table?.rows?.length)return[{kind:'table',title:q.category||'問題の表',focus:tableFocus(q),values:q.table.rows.map((r,i)=>({label:rowName(q,r,i),value:Object.entries(r).filter(([,v])=>shown(v)).map(([k,v])=>`${labels[k]||k}:${num(v)}`).join(' / ')})),table:sourceTable(q),evidenceRef:'table.rows'}];
    return[{kind:'prompt',title:'問題文',focus:'問題文の条件と、何を求める問題かを確認する',values:[{label:'問題',value:String(q.question||'')}],evidenceRef:'question'}];
  }
  function valueAt(q,cells,locs,ri,c){const raw=q.table.rows[ri]?.[c];if(typeof raw==='number'&&Number.isFinite(raw))return raw;if(raw!=='入力')return null;for(const[id,p]of locs)if(p.ri===ri&&p.c===c){const v=cells[id];return typeof v==='number'&&Number.isFinite(v)?v:null;}return null;}
  const calcItem=(label,expression,result,evidenceRefs=['answer'])=>({label,expression,result,operands:[],evidenceRefs});
  const comma=v=>Number(v).toLocaleString('ja-JP');
  function ledgerCalculations(q){
    if(q?.type!=='ledger')return null;
    const cells=q.answer?.cells||{},format=q.format||'',category=String(q.category||''),materials=arr(q.materials),rows=q.table?.rows||[];
    if(format==='journal-book')return [];
    if(format==='fixed-asset-ledger'||/固定資産台帳/u.test(category)){
      const out=[];
      if(cells.annualDepreciation!=null){
        const row=rows[0]||{},cost=Number(row.acquisitionCost),life=Number(row.life),months=Number(cells.months);
        if(Number.isFinite(cost)&&Number.isFinite(life))out.push(calcItem('1年分の減価償却費',`${comma(cost)} ÷ ${life} = ${comma(cells.annualDepreciation)}`,cells.annualDepreciation,['table.rows[0]','answer.cells.annualDepreciation']));
        if(Number.isFinite(months))out.push(calcItem('当期減価償却費',`${comma(cells.annualDepreciation)} × ${months} ÷ 12 = ${comma(cells.currentDepreciation)}`,cells.currentDepreciation,['answer.cells.annualDepreciation','answer.cells.months','answer.cells.currentDepreciation']));
        if(cells.closingBookValue!=null)out.push(calcItem('期末帳簿価額',`${comma(cost)} − ${comma(cells.closingAccumulated)} = ${comma(cells.closingBookValue)}`,cells.closingBookValue,['table.rows[0]','answer.cells.closingAccumulated','answer.cells.closingBookValue']));
        return out;
      }
      if(cells.acquisitionCost!=null&&cells.currentDepreciation!=null){
        const life=Number(String(materials.find(m=>m?.['耐用年数'])?.['耐用年数']||'').replace(/[^0-9.]/g,'')),cost=Number(cells.acquisitionCost),months=Number(cells.months),annual=life?cost/life:null;
        if(Number.isFinite(annual))out.push(calcItem('1年分の減価償却費',`${comma(cost)} ÷ ${life} = ${comma(annual)}`,annual,['materials','answer.cells.acquisitionCost']));
        if(Number.isFinite(annual)&&Number.isFinite(months))out.push(calcItem('当期減価償却費',`${comma(annual)} × ${months} ÷ 12 = ${comma(cells.currentDepreciation)}`,cells.currentDepreciation,['answer.cells.months','answer.cells.currentDepreciation']));
        if(cells.closingBookValue!=null)out.push(calcItem('期末帳簿価額',`${comma(cost)} − ${comma(cells.closingAccumulated)} = ${comma(cells.closingBookValue)}`,cells.closingBookValue,['answer.cells.closingAccumulated','answer.cells.closingBookValue']));
        return out;
      }
      if(cells.annualA!=null&&cells.annualB!=null){
        const a=materials.find(m=>m?.['固定資産']==='備品A')||{},b=materials.find(m=>m?.['固定資産']==='備品B')||{},life=Number((/耐用年数\s*(\d+)年/u.exec(q.question||'')||[])[1]||5);
        out.push(calcItem('備品A 1年分の減価償却費',`${comma(a['取得原価'])} ÷ ${life} = ${comma(cells.annualA)}`,cells.annualA,['materials','answer.cells.annualA']));
        out.push(calcItem('備品A 当期減価償却費',`${comma(cells.annualA)} × ${cells.monthsA} ÷ 12 = ${comma(cells.depreciationA)}`,cells.depreciationA,['answer.cells.monthsA','answer.cells.depreciationA']));
        out.push(calcItem('備品A 売却時帳簿価額',`${comma(a['取得原価'])} − ${comma(cells.depreciationA)} = ${comma(cells.bookA)}`,cells.bookA,['materials','answer.cells.bookA']));
        out.push(calcItem('備品A 固定資産売却損',`${comma(cells.bookA)} − ${comma(a['売却価額'])} = ${comma(cells.lossA)}`,cells.lossA,['materials','answer.cells.lossA']));
        out.push(calcItem('備品B 1年分の減価償却費',`${comma(b['取得原価'])} ÷ ${life} = ${comma(cells.annualB)}`,cells.annualB,['materials','answer.cells.annualB']));
        out.push(calcItem('備品B 当期減価償却費',`${comma(cells.annualB)} × ${cells.monthsB} ÷ 12 = ${comma(cells.depreciationB)}`,cells.depreciationB,['answer.cells.monthsB','answer.cells.depreciationB']));
        out.push(calcItem('備品B 期末帳簿価額',`${comma(b['取得原価'])} − ${comma(cells.depreciationB)} = ${comma(cells.bookB)}`,cells.bookB,['materials','answer.cells.bookB']));
        return out;
      }
    }
    if(format==='bookkeeping-notes-receivable'||format==='bookkeeping-notes-payable'){
      const relevant=materials.filter(m=>!m?.['種類']||(format==='bookkeeping-notes-receivable'?String(m['種類']).includes('約束手形受取'):String(m['種類']).includes('約束手形振出')));
      const amounts=relevant.map(m=>Number(m?.['金額'])).filter(Number.isFinite),total=Number(cells.total);
      return amounts.length>1&&Number.isFinite(total)?[calcItem('手形金額合計',`${amounts.map(comma).join(' + ')} = ${comma(total)}`,total,['materials','answer.cells.total'])]:[];
    }
    if(format==='bookkeeping-cash-book'||format==='bookkeeping-checking-book'){
      const a=Number(cells.value1),b=Number(cells.value2),balance=Number(cells.value3);
      return [calcItem('残高',`${comma(a)} − ${comma(b)} = ${comma(balance)}`,balance,['answer.cells.value1','answer.cells.value2','answer.cells.value3'])];
    }
    if(format==='bookkeeping-petty-cash-book'){
      const a=Number(cells.value1),b=Number(cells.value2),total=Number(cells.value3);
      return [calcItem('補給額',`${comma(a)} + ${comma(b)} = ${comma(total)}`,total,['answer.cells.value1','answer.cells.value2','answer.cells.value3'])];
    }
    if(format==='bookkeeping-purchase-book'||format==='bookkeeping-sales-book'){
      const gross=Number(cells.value1),returns=Number(cells.value2),net=Number(cells.value3);
      return [calcItem(format==='bookkeeping-purchase-book'?'純仕入高':'純売上高',`${comma(gross)} − ${comma(returns)} = ${comma(net)}`,net,['answer.cells.value1','answer.cells.value2','answer.cells.value3'])];
    }
    if(format==='bookkeeping-inventory-ledger'){
      const match=/期首(\d+)個@([\d,]+)円、仕入(\d+)個@([\d,]+)円.*?(\d+)個を払い出/u.exec(q.question||'');
      if(match){
        const q1=Number(match[1]),p1=Number(match[2].replaceAll(',','')),q2=Number(match[3]),p2=Number(match[4].replaceAll(',','')),issued=Number(match[5]),avg=Number(cells.value1),issue=Number(cells.value2),remain=Number(cells.value3);
        return [
          calcItem('移動平均単価（円／個）',`(${q1} × ${comma(p1)} + ${q2} × ${comma(p2)}) ÷ (${q1} + ${q2}) = ${comma(avg)}`,avg,['question','answer.cells.value1']),
          calcItem('払出額',`${issued} × ${comma(avg)} = ${comma(issue)}`,issue,['question','answer.cells.value2']),
          calcItem('残高額',`(${q1+q2} − ${issued}) × ${comma(avg)} = ${comma(remain)}`,remain,['question','answer.cells.value3'])
        ];
      }
    }
    if(format==='bookkeeping-voucher-entry')return [];
    if(format==='bookkeeping-general-ledger'){
      const openingMatch=/期首(?:貸方)?残高([\d,]+)円/u.exec(q.question||''),opening=openingMatch?Number(openingMatch[1].replaceAll(',','')):null,balance=Number(cells.balance);
      if(Number.isFinite(opening)&&Number.isFinite(balance)){
        const increases=materials.map(m=>Number(m?.['増加'])).filter(Number.isFinite),decreases=materials.map(m=>Number(m?.['減少'])).filter(Number.isFinite);
        if(increases.length||decreases.length)return [calcItem('期末残高',`${[comma(opening),...increases.map(v=>'+ '+comma(v)),...decreases.map(v=>'− '+comma(v))].join(' ')} = ${comma(balance)}`,balance,['question','materials','answer.cells.balance'])];
        const debits=materials.map(m=>Number(m?.['借方'])).filter(Number.isFinite),credits=materials.map(m=>Number(m?.['貸方'])).filter(Number.isFinite);
        return [calcItem('期末残高',`${[comma(opening),...debits.map(v=>'+ '+comma(v)),...credits.map(v=>'− '+comma(v))].join(' ')} = ${comma(balance)}`,balance,['question','materials','answer.cells.balance'])];
      }
    }
    if(format==='bookkeeping-account-ledger'&&/支払利息/u.test(category)){
      const m=/借入金([\d,]+)円（年利率(\d+(?:\.\d+)?)%/u.exec(q.question||'');
      if(m){const principal=Number(m[1].replaceAll(',','')),rate=Number(m[2]),annual=Number(cells.annualPayment),half=Number(cells.currentAccrual);return[
        calcItem('1年分の支払利息',`${comma(principal)} × ${rate}% = ${comma(annual)}`,annual,['question','answer.cells.annualPayment']),
        calcItem('6か月分の未払利息',`${comma(annual)} × 6 ÷ 12 = ${comma(half)}`,half,['question','answer.cells.currentAccrual'])
      ];}
    }
    if(!format&&/買掛金元帳/u.test(category)&&rows.length>=3){
      const opening=Number(rows[0]?.balance),first=Number(rows[1]?.credit),second=Number(rows[2]?.debit),b1=Number(cells.r2_balance),b2=Number(cells.r3_balance);
      return [
        calcItem('掛仕入後の残高',`${comma(opening)} + ${comma(first)} = ${comma(b1)}`,b1,['table.rows[0]','table.rows[1]','answer.cells.r2_balance']),
        calcItem('支払後の残高',`${comma(b1)} − ${comma(second)} = ${comma(b2)}`,b2,['table.rows[2]','answer.cells.r3_balance'])
      ];
    }
    if(!format&&/商品有高帳/u.test(category)&&rows.length>=4){
      const openingQty=Number(rows[0]?.quantity),openingUnit=Number(rows[0]?.unitPrice),purchaseQty=Number(rows[1]?.quantity),purchaseUnit=Number(rows[1]?.unitPrice),issuedQty=Number(rows[2]?.quantity),issueAmount=Number(cells.r3_amount),remain=Number(cells.r4_amount);
      return [
        calcItem('払出額',`${issuedQty} × ${comma(openingUnit)} = ${comma(issueAmount)}`,issueAmount,['table.rows[0]','table.rows[2]','answer.cells.r3_amount']),
        calcItem('残高額',`(${openingQty} − ${issuedQty}) × ${comma(openingUnit)} + ${purchaseQty} × ${comma(purchaseUnit)} = ${comma(remain)}`,remain,['table.rows[0]','table.rows[1]','table.rows[2]','answer.cells.r4_amount'])
      ];
    }
    return null;
  }
  function calculations(q){const formulaItems=FormulaEngine?.build?.(q);if(Array.isArray(formulaItems)&&formulaItems.length)return formulaItems;if(q.type==='journal')return [...(q.answer?.debit||[]),...(q.answer?.credit||[])].map(r=>({label:r.account,expression:null,result:r.amount,operands:[],evidenceRefs:['answer']}));if(q.type==='trial_balance'){const cells=q.answer?.cells||{},rows=q.table?.rows||[],debits=rows.map(r=>r?.debit).filter(v=>typeof v==='number'&&Number.isFinite(v)),credits=rows.map(r=>r?.credit).filter(v=>typeof v==='number'&&Number.isFinite(v)),out=[];if(debits.length&&Number.isFinite(cells.total_debit))out.push(calcItem('借方合計',debits.map(comma).join(' + ')+' = '+comma(cells.total_debit),cells.total_debit,['table.rows','answer.cells.total_debit']));if(credits.length&&Number.isFinite(cells.total_credit))out.push(calcItem('貸方合計',credits.map(comma).join(' + ')+' = '+comma(cells.total_credit),cells.total_credit,['table.rows','answer.cells.total_credit']));return out;}const special=ledgerCalculations(q);if(special)return special;const cells=q.answer?.cells||{},locs=locations(q);return Object.entries(cells).map(([id,expected])=>{const p=locs.get(id);if(typeof expected==='number'&&p?.c==='balance'&&p.ri>0){const prev=valueAt(q,cells,locs,p.ri-1,'balance'),d=valueAt(q,cells,locs,p.ri,'debit')||0,c=valueAt(q,cells,locs,p.ri,'credit')||0;if(Number.isFinite(prev)&&prev+d-c===expected){const parts=[num(prev)];if(d)parts.push('+',num(d));if(c)parts.push('−',num(c));parts.push('=',num(expected));return{label:cellLabel(q,id,p),expression:parts.join(' '),result:expected,operands:[{label:'直前残高',value:prev},...(d?[{label:'借方記入（増加）',value:d}]:[]),...(c?[{label:'貸方記入（減少）',value:c}]:[])],evidenceRefs:[`table.rows[${p.ri-1}]`,`table.rows[${p.ri}]`,`answer.cells.${id}`]};}}if(typeof expected==='number'&&p?.c==='amount'){const qty=valueAt(q,cells,locs,p.ri,'quantity'),unit=valueAt(q,cells,locs,p.ri,'unitPrice');if(Number.isFinite(qty)&&Number.isFinite(unit)&&qty*unit===expected)return{label:cellLabel(q,id,p),expression:`${num(qty)} × ${num(unit)} = ${num(expected)}`,result:expected,operands:[{label:'数量',value:qty,semanticType:'quantity'},{label:'単価',value:unit,semanticType:'unitPrice'}],evidenceRefs:[`table.rows[${p.ri}]`,`answer.cells.${id}`]};}return{label:cellLabel(q,id,p),expression:null,result:expected,semanticType:Feedback.cellSemanticType(q,id),operands:[],evidenceRefs:[p?`table.rows[${p.ri}]`:'answer.cells',`answer.cells.${id}`]};});}
  function transfer(q){
    if(q.type==='journal')return['debit','credit'].flatMap(side=>(q.answer?.[side]||[]).map(r=>({from:'問題文・証憑',decision:r.account,to:side==='debit'?'借方':'貸方',debitCredit:side,value:r.amount,evidenceRefs:['answer.'+side]})));
    if(q.type==='correction'){
      const c=q.answer?.cells||{},out=[];
      if(c.debitAccount&&Number.isFinite(c.debitAmount))out.push({from:'帳簿と証ひょうの差',decision:'訂正仕訳',to:'借方',debitCredit:'debit',value:c.debitAccount+' '+comma(c.debitAmount)+'円',evidenceRefs:['materials','answer.cells.debitAccount','answer.cells.debitAmount']});
      if(c.creditAccount&&Number.isFinite(c.creditAmount))out.push({from:'帳簿と証ひょうの差',decision:'訂正仕訳',to:'貸方',debitCredit:'credit',value:c.creditAccount+' '+comma(c.creditAmount)+'円',evidenceRefs:['materials','answer.cells.creditAccount','answer.cells.creditAmount']});
      return out;
    }
    // Comprehensive questions already expose the final destination in the answer rows.
    // Repeating calculated final answers as transfer cards adds no new learning.
    if(q.type==='comprehensive')return[];
    const locs=locations(q),metadata=q.table?.inputMetadata||{};
    return Object.entries(q.answer?.cells||{}).map(([id,value])=>{
      const p=locs.get(id),meta=metadata[id];
      const destination=p?(labels[p.c]||p.c||cellLabel(q,id,p)):(meta?.label||labels[id]||id);
      const decision=p?cellLabel(q,id,p):(meta?.label?meta.label+'を記入':'該当欄へ記入');
      const semanticType=Feedback.cellSemanticType(q,id);
      const to=semanticType==='unitPrice'?'単価':semanticType!=='amount'&&p?.c==='amount'?(meta?.label||destination):destination;
      return{from:p?rowName(q,p.r,p.ri):(q.category||'問題資料'),decision:semanticType==='unitPrice'?decision.replace(/の金額/u,''):decision,to,debitCredit:null,value,semanticType,evidenceRefs:[p?`table.rows[${p.ri}]`:'table',`answer.cells.${id}`]};
    });
  }
  function checks(q){
    if(q.type==='journal'){
      const d=(q.answer?.debit||[]).reduce((s,r)=>s+(Number(r.amount)||0),0),c=(q.answer?.credit||[]).reduce((s,r)=>s+(Number(r.amount)||0),0);
      return[{label:'借方合計と貸方合計が合っているか確認する',expected:(d===c?num(d)+' = '+num(c):'不一致')+'。貸借一致だけでは科目や金額の正しさは保証されないため、取引条件とも照合します。',evidenceRefs:['answer.debit','answer.credit'],checkKind:'balance-consistency'}];
    }
    const cells=q.answer?.cells||{};
    if(q.type==='trial_balance'){
      const sum=column=>arr(q.table?.rows).reduce((total,row)=>total+(Number.isFinite(row[column])?row[column]:0),0),d=sum('debit'),c=sum('credit');
      return[{label:'借方合計と貸方合計が一致しているか確認する',expected:num(d)+' = '+num(c),note:'資料の借方列と貸方列を別々に集計した結果です。貸借が一致しても、科目や転記漏れは別に確認します。',evidenceRefs:['table.rows'],checkKind:'independent-balance'}];
    }
    if(q.type==='correction'){
      const d=cells.debitAmount,c=cells.creditAmount;
      return[
        {label:'訂正する部分だけを直せているか確認する',expected:'正しい部分は残す',evidenceRefs:['materials','answer.cells'],checkKind:'scope'},
        {label:'訂正仕訳の借方と貸方の金額が合っているか確認する',expected:Number.isFinite(d)&&Number.isFinite(c)?num(d)+' = '+num(c):'借方・貸方を確認',evidenceRefs:['answer.cells.debitAmount','answer.cells.creditAmount'],checkKind:'independent-balance'}
      ];
    }
    const format=q.format||'',category=String(q.category||'');
    if(q.type==='ledger'&&!format&&/総勘定元帳|売掛金元帳|買掛金元帳/u.test(category)){
      const rows=arr(q.table?.rows),opening=rows[0]?.balance,liability=/買掛金/u.test(category),increaseColumn=liability?'credit':'debit',decreaseColumn=liability?'debit':'credit';
      const sum=column=>rows.slice(1).reduce((total,row)=>total+(Number.isFinite(row[column])?row[column]:0),0),increase=sum(increaseColumn),decrease=sum(decreaseColumn);
      if(Number.isFinite(opening))return[{label:'期末残高から増減を戻し、期首残高と一致するか確認する',expected:`${num(opening+increase-decrease)} + ${num(decrease)} − ${num(increase)} = ${num(opening)}円。${liability?'買掛金は貸方で増え、借方で減ります。':'この資産勘定は借方で増え、貸方で減ります。'}`,evidenceRefs:['table.rows'],checkKind:'continuity'}];
    }
    if(q.type==='ledger'&&!format&&/商品有高帳/u.test(category)){
      const rows=arr(q.table?.rows),[opening,purchase,issue]=rows;
      if([opening?.quantity,opening?.unitPrice,purchase?.quantity,purchase?.unitPrice,issue?.quantity].every(Number.isFinite)){
        const first=Math.min(issue.quantity,opening.quantity),second=issue.quantity-first,issued=first*opening.unitPrice+second*purchase.unitPrice,remaining=(opening.quantity-first)*opening.unitPrice+(purchase.quantity-second)*purchase.unitPrice;
        return[{label:'数量と金額を、受入合計と払出後の内訳で照合する',expected:`数量：${opening.quantity} + ${purchase.quantity} − ${issue.quantity} = ${opening.quantity+purchase.quantity-issue.quantity}個。金額：${num(opening.quantity*opening.unitPrice)} + ${num(purchase.quantity*purchase.unitPrice)} = ${num(issued)} + ${num(remaining)}円。残りは古い仕入分からの払出後に残った数量と、後の仕入分に分けます。`,evidenceRefs:['table.rows'],checkKind:'inventory-reconciliation'}];
      }
    }
    if(q.type==='comprehensive'){
      if(Number.isFinite(cells.totalAssets)&&Number.isFinite(cells.totalEquityLiabilities)){
        return[{label:'貸借対照表の左右が一致しているか確認する',expected:num(cells.totalAssets)+' = '+num(cells.totalEquityLiabilities),evidenceRefs:['answer.cells.totalAssets','answer.cells.totalEquityLiabilities'],checkKind:'independent-balance'}];
      }
      if(Object.prototype.hasOwnProperty.call(cells,'endingCash')&&Object.prototype.hasOwnProperty.call(cells,'profit')){
        return[{label:'現金残高と利益を別々の考え方で求めたか確認する',expected:'現金残高＝期首現金＋現金収入－現金支出／利益＝収益－費用',evidenceRefs:['materials'],checkKind:'concept-separation'}];
      }
      if(Number.isFinite(cells.interestExpense)&&Number.isFinite(cells.interestPayable)&&cells.interestExpense===cells.interestPayable){
        return[{label:'追加計上した支払利息と未払利息が対応しているか確認する',expected:num(cells.interestExpense)+' = '+num(cells.interestPayable),evidenceRefs:['answer.cells.interestExpense','answer.cells.interestPayable'],checkKind:'accrual-reconciliation'}];
      }
      return[];
    }
    if(q.type==='worksheet'){
      if(format==='eight-column-worksheet'){
        const locs=locations(q),rows=arr(q.table?.rows),sum=column=>rows.reduce((total,row,index)=>total+(valueAt(q,cells,locs,index,column)||0),0);
        return[{label:'純利益を記入した後の損益計算書・貸借対照表の列合計を確認する',expected:`損益計算書：借方 ${num(sum('plDebit'))}円＝貸方 ${num(sum('plCredit'))}円。貸借対照表：借方 ${num(sum('bsDebit'))}円＝貸方 ${num(sum('bsCredit'))}円。利益は損益計算書の借方と貸借対照表の貸方に記入します。貸借一致に加え、整理事項と各勘定の分類も照合します。`,evidenceRefs:['table.rows','answer.cells'],checkKind:'column-reconciliation'}];
      }
      if(format==='adjusted-trial-balance')return[{label:'整理事項を反映した後、借方列と貸方列を別々に合計する',expected:'前払保険料への振替は借方合計を変えません。間接法の減価償却は、借方の費用と貸方の累計額を同額増やします。',evidenceRefs:['materials'],checkKind:'adjustment-reconciliation'}];
      if(format==='closing-entries')return[{label:'損益勘定を締め切る向きを確認する',expected:'収益は借方、費用は貸方へ振り替えて元の勘定をゼロにします。残った損益の貸方残高を借方で取り消し、繰越利益剰余金の貸方へ移します。',evidenceRefs:['question'],checkKind:'closing-reconciliation'}];
      if(/決算整理・計算問題/u.test(category))return[{label:'期間配分と帳簿価額を元の金額へ戻して確認する',expected:`当期保険料 ${num(cells.insurance_expense_after)} + 次期分 ${num(cells.insurance_adjustment)} = ${num(cells.insurance_expense_after+cells.insurance_adjustment)}円。帳簿価額 ${num(cells.equipment_book_value_after)} + 減価償却費 ${num(cells.depreciation_expense)} = ${num(cells.equipment_book_value_after+cells.depreciation_expense)}円。それぞれ問題文の保険料・取得原価と照合します。`,evidenceRefs:['question','answer.cells'],checkKind:'allocation-reconciliation'}];
      return[{label:'整理後残高を重複なく振り分けたか確認する',expected:'各残高は損益計算書または貸借対照表の所定欄へ一度だけ',evidenceRefs:['answer.cells'],checkKind:'classification'}];
    }
    if(q.type==='financial_statement'){
      if(Number.isFinite(cells.assetsTotal)&&Number.isFinite(cells.liabilitiesEquityTotal)){
        return[{label:'資産合計と負債・純資産合計が一致しているか確認する',expected:num(cells.assetsTotal)+' = '+num(cells.liabilitiesEquityTotal),evidenceRefs:['answer.cells.assetsTotal','answer.cells.liabilitiesEquityTotal'],checkKind:'independent-balance'}];
      }
      return[];
    }
    if(format==='fixed-asset-ledger'||/固定資産台帳/u.test(category)){
      const rows=arr(q.table?.rows),materials=arr(q.materials),out=[];
      const first=rows[0]||{};
      const materialCost=materials.map(item=>item?.['取得原価']).find(Number.isFinite);
      const cost=[cells.acquisitionCost,first.acquisitionCost,materialCost].find(Number.isFinite);
      const book=cells.closingBookValue;
      let accumulated=Number.isFinite(cells.closingAccumulated)?cells.closingAccumulated:null;
      if(!Number.isFinite(accumulated)&&Number.isFinite(first.openingAccumulated)&&Number.isFinite(cells.currentDepreciation))accumulated=first.openingAccumulated+cells.currentDepreciation;
      if(!Number.isFinite(accumulated)&&Number.isFinite(cells.currentDepreciation))accumulated=cells.currentDepreciation;
      if(Number.isFinite(cost)&&Number.isFinite(accumulated)&&Number.isFinite(book)&&cost-accumulated===book){
        out.push({label:'取得原価から減価償却累計額を引くと帳簿価額になるか確認する',expected:num(cost)+' − '+num(accumulated)+' = '+num(book),evidenceRefs:['table.rows','answer.cells'],checkKind:'fixed-asset-reconciliation'});
      }
      const assetA=materials.find(item=>item?.['固定資産']==='備品A')||{};
      if(Number.isFinite(cells.bookA)&&Number.isFinite(assetA['売却価額'])&&Number.isFinite(cells.lossA)&&cells.bookA-assetA['売却価額']===cells.lossA){
        out.push({label:'売却時帳簿価額と売却価額の差が売却損になるか確認する',expected:num(cells.bookA)+' − '+num(assetA['売却価額'])+' = '+num(cells.lossA),evidenceRefs:['materials','answer.cells.bookA','answer.cells.lossA'],checkKind:'fixed-asset-disposal'});
      }
      const assetB=materials.find(item=>item?.['固定資産']==='備品B')||{};
      if(Number.isFinite(assetB['取得原価'])&&Number.isFinite(cells.depreciationB)&&Number.isFinite(cells.bookB)&&assetB['取得原価']-cells.depreciationB===cells.bookB){
        out.push({label:'備品Bの取得原価から当期減価償却費を引くと期末帳簿価額になるか確認する',expected:num(assetB['取得原価'])+' − '+num(cells.depreciationB)+' = '+num(cells.bookB),evidenceRefs:['materials','answer.cells.depreciationB','answer.cells.bookB'],checkKind:'fixed-asset-reconciliation'});
      }
      return out.length?out:[{label:'帳簿価額の関係を確認する',expected:'取得原価 − 減価償却累計額 = 帳簿価額',evidenceRefs:['table.rows','answer.cells'],checkKind:'fixed-asset-reconciliation'}];
    }
    if(format==='bookkeeping-petty-cash-book'&&Number.isFinite(cells.value1)&&Number.isFinite(cells.value2)&&Number.isFinite(cells.value3)){
      return[{label:'支払合計と補給額が一致しているか確認する',expected:num(cells.value1)+' + '+num(cells.value2)+' = '+num(cells.value3),evidenceRefs:['materials','answer.cells'],checkKind:'reconciliation'}];
    }
    if(format==='bookkeeping-purchase-book'&&Number.isFinite(cells.value1)&&Number.isFinite(cells.value2)&&Number.isFinite(cells.value3)){
      return[{label:'総仕入高から仕入返品を引くと純仕入高になるか確認する',expected:num(cells.value1)+' − '+num(cells.value2)+' = '+num(cells.value3),evidenceRefs:['answer.cells'],checkKind:'reconciliation'}];
    }
    if(format==='bookkeeping-sales-book'&&Number.isFinite(cells.value1)&&Number.isFinite(cells.value2)&&Number.isFinite(cells.value3)){
      return[{label:'総売上高から売上返品を引くと純売上高になるか確認する',expected:num(cells.value1)+' − '+num(cells.value2)+' = '+num(cells.value3),evidenceRefs:['answer.cells'],checkKind:'reconciliation'}];
    }
    if(format==='bookkeeping-voucher-entry')return[{label:'現金の動きに合った伝票を選べているか確認する',expected:'増える → 入金伝票 / 減る → 出金伝票 / 動かない → 振替伝票',evidenceRefs:['table.rows'],checkKind:'classification'}];
    if(format==='bookkeeping-inventory-ledger'){
      const m=/期首(\d+)個@([\d,]+)円、仕入(\d+)個@([\d,]+)円.*?(\d+)個を払い出/u.exec(q.question||'');
      if(m){const [q1,p1,q2,p2,issued]=m.slice(1).map(v=>Number(v.replaceAll(',',''))),total=q1*p1+q2*p2,average=total/(q1+q2),remaining=q1+q2-issued;
        return[{label:'数量と金額を受入合計へ戻して確認する',expected:`数量：${issued} + ${remaining} = ${q1+q2}個。金額：${num(issued*average)} + ${num(remaining*average)} = ${num(total)}円（期首 ${num(q1*p1)}円＋仕入 ${num(q2*p2)}円）。払出分と残りには同じ移動平均単価を用います。`,evidenceRefs:['question'],checkKind:'inventory-reconciliation'}];
      }
    }
    if(format==='bookkeeping-inventory-ledger'||/商品有高帳/u.test(category))return[{label:'数量・単価・金額の流れを確認する',expected:'払出後の残りを次の行へつなげる',evidenceRefs:['table.rows'],checkKind:'continuity'}];
    if(format==='bookkeeping-account-rule')return[{label:'勘定記入法則と貸借平均を別々に確認する',expected:'資産：増加＝借方・減少＝貸方／負債：増加＝貸方・減少＝借方／借方合計＝貸方合計',evidenceRefs:['question','answer.cells'],checkKind:'concept-reconciliation'}];
    if(['bookkeeping-general-ledger','bookkeeping-account-ledger','bookkeeping-cash-book','bookkeeping-checking-book'].includes(format)||/元帳/u.test(category))return[{label:'残高を上から順に確認する',expected:'前の残高に増減を反映して次の残高へつなげる',evidenceRefs:['table.rows'],checkKind:'continuity'}];
    if(format==='bookkeeping-notes-receivable')return[{label:'受取手形だけを選べているか確認する',expected:'約束手形の受取だけを記帳対象にする',evidenceRefs:['materials'],checkKind:'selection'}];
    if(format==='bookkeeping-notes-payable')return[{label:'支払手形だけを選べているか確認する',expected:'自店振出の約束手形だけを記帳対象にする',evidenceRefs:['materials'],checkKind:'selection'}];
    return[];
  }
  function diagnostics(q,a,s,o){return Array.isArray(o?.diagnostics)?o.diagnostics:(Feedback?.diagnoseWrongAnswer?Feedback.diagnoseWrongAnswer(q,a||{},s||{correct:false}):[]);}
  function generated(q,a,s,o){const ds=diagnostics(q,a,s,o);return{schemaVersion:SCHEMA_VERSION,source:'generated',sources:sources(q),summary:String(q.question||'').trim()?[{text:String(q.question).trim(),evidenceRef:'question'}]:[],calculation:calculations(q),transfer:transfer(q),checks:checks(q),mistakes:ds.slice(0,3).map(x=>({title:x.title||'今回の間違い',reason:x.reason||'',correction:x.nextRule||x.thinking||'',diagnosticKind:x.kind||'general',cause:x.cause||x.kind||'general'})),fallback:{authoredExplanation:String(q.explanation||''),diagnostics:clone(ds)}};}
  const comparableValue=v=>{
    if(typeof v==='number'&&Number.isFinite(v))return String(v);
    const text=String(v??'').replace(/[\s,円]/g,'');
    return /^-?\d+(?:\.\d+)?$/u.test(text)?String(Number(text)):null;
  };
  function requestedOutputLabels(q){
    const labelsOut=[],metadata=q?.table?.inputMetadata||{},cells=arr(q?.table?.inputCells);
    cells.forEach(id=>{const label=Feedback.cellSemanticType(q,id)==='unitPrice'?metadata?.[id]?.label?.replace(/の金額/u,''):metadata?.[id]?.label;if(label&&!labelsOut.includes(label))labelsOut.push(label);});
    if(labelsOut.length)return labelsOut.slice(0,4);
    for(const row of arr(q?.table?.rows)){
      if(!obj(row)||!Object.values(row).includes('入力'))continue;
      const label=['item','account','description','section','asset'].map(key=>row?.[key]).find(shown);
      if(label&&!labelsOut.includes(String(label)))labelsOut.push(String(label));
    }
    return labelsOut.slice(0,4);
  }
  function learnerStrategy(q){
    const format=q.format||'',category=String(q.category||''),outputs=requestedOutputLabels(q);
    const goalSuffix=outputs.length?outputs.join('・'):'必要な金額';
    if(q.type==='journal')return[
      'この問題で求めるのは、取引を借方と貸方に分けた仕訳です。',
      'まず「何が増えたか・減ったか」を決め、次に勘定科目、最後に借方・貸方を決めます。'
    ];
    if(q.type==='trial_balance')return[
      'この問題で求めるのは、各勘定残高を借方・貸方に分けた合計です。',
      '残高の側を変えずに集計し、最後に借方合計と貸方合計を別々に求めます。'
    ];
    if(q.type==='correction')return[
      'この問題で求めるのは、誤った記録を正しい残高へ直すための訂正仕訳です。',
      '帳簿の記録と本来の正しい処理を比べ、違っている部分だけを仕訳します。'
    ];
    if(format==='adjusted-trial-balance')return['この問題で求めるのは、決算整理後の各勘定残高と試算表の貸借合計です。','整理事項を該当勘定へ反映し、残高の側に従って借方・貸方へ一度ずつ集計します。'];
    if(format==='closing-entries')return['この問題で求めるのは、収益・費用を損益勘定へ振り替え、当期純利益を繰越利益剰余金へ移す金額です。','収益と費用をそれぞれ締め切り、損益勘定の残高から当期純利益を求めます。'];
    if(q.type==='worksheet'&&/決算整理・計算問題/u.test(category))return[`この問題で求めるのは、前払振替額・当期保険料・当期減価償却費・期末帳簿価額です。`,'保険料は当期分と次期分に分けます。備品は指定の耐用年数で償却し、間接法なので取得原価から累計額を差し引いて帳簿価額を求めます。'];
    if(q.type==='worksheet')return[
      `この問題で求めるのは、決算整理後の${goalSuffix}です。`,
      '整理前残高に決算整理を反映してから、損益計算書と貸借対照表のどちらへ入るかを判断します。'
    ];
    if(q.type==='financial_statement')return[
      `この問題で求めるのは、財務諸表の${goalSuffix}です。`,
      '収益・費用は損益計算書、資産・負債・純資産は貸借対照表という区分を先に決めてから計算します。'
    ];
    if(q.type==='comprehensive'&&q.format==='exam-question-3')return[
      `この問題で求めるのは、決算整理を反映した最終的な${goalSuffix}です。`,
      '整理前残高→未処理取引→決算整理→損益計算書・貸借対照表の順に、1つの修正がどこへ波及するかを追います。'
    ];
    if(q.type==='comprehensive')return[
      `この問題で求めるのは、${goalSuffix}です。`,
      '求める金額ごとに使う取引を分けます。現金は入出金、利益は収益・費用という別の物差しで判断します。'
    ];
    if(format==='fixed-asset-ledger'||/固定資産台帳/u.test(category))return[
      `この問題で求めるのは、固定資産台帳の${goalSuffix}です。`,
      '取得原価・耐用年数・使用月数を確認し、年額→月割額→累計額・帳簿価額の順に求めます。'
    ];
    if(format==='bookkeeping-inventory-ledger'||/商品有高帳/u.test(category))return[
      `この問題で求めるのは、商品有高帳の${goalSuffix}です。`,
      '数量と単価を分けて追い、指定された払出単価の方法で払出額と残高額を順につなげます。'
    ];
    if(format==='bookkeeping-voucher-entry')return[
      'この問題で求めるのは、取引に合う伝票と記入内容です。',
      '現金が増える・減る・動かないの3つに分けて、入金伝票・出金伝票・振替伝票を選びます。'
    ];
    if(format==='bookkeeping-account-rule')return[
      'この問題で求めるのは、資産・負債の増減を記入する側と貸借平均の原理です。',
      '勘定科目の種類ごとに「増加はどちら側か」を先に決め、減少は反対側と確認したうえで、最後に借方合計と貸方合計の一致を確認します。'
    ];
    if(format==='journal-book'||/仕訳帳/u.test(category))return[
      'この問題で求めるのは、取引を日付順に仕訳帳へ記入した結果です。',
      '取引ごとに仕訳を完成させてから、日付・摘要・元丁・貸借金額を所定欄へ移します。'
    ];
    if(format==='bookkeeping-notes-receivable'||format==='bookkeeping-notes-payable')return[
      `この問題で求めるのは、${category||'手形記入帳'}の記入内容です。`,
      'まず記入対象になる手形だけを選び、その後に日付・相手先・満期日・金額を資料から拾います。'
    ];
    if(['bookkeeping-cash-book','bookkeeping-checking-book','bookkeeping-petty-cash-book','bookkeeping-purchase-book','bookkeeping-sales-book'].includes(format))return[
      `この問題で求めるのは、${category||'帳簿'}の${goalSuffix}です。`,
      Feedback.ledgerGuidance(q).join('')
    ];
    if(q.type==='ledger')return[
      `この問題で求めるのは、${category||'元帳'}の${goalSuffix}です。`,
      'その勘定がどちら側で増えるかを決め、取引を上から順に反映して残高をつなげます。'
    ];
    return[
      `この問題で求めるのは、${goalSuffix}です。`,
      '問題文の条件を分類し、使う数字と使わない数字を分けてから計算します。'
    ];
  }
  function authoredSection(q, heading){
    const text=String(q.explanation||''),marker='【'+heading+'】',start=text.indexOf(marker);
    if(start<0)return '';
    return text.slice(start+marker.length).split('【')[0].trim();
  }
  // Keep authored reasoning in the structured path without appending its answer
  // recap. This is presentation of existing evidence, not a new accounting oracle.
  function journalReason(q){
    const explicit=authoredSection(q,'処理の根拠');
    if(explicit)return explicit;
    return String(q.explanation||'').split('【')[0].split(/借方・貸方はいずれも/u)[0].trim();
  }
  function journalDecision(q,item){
    const side=item.debitCredit,sideLabel=side==='debit'?'借方':side==='credit'?'貸方':'';
    const row=arr(q.answer?.[side]).find(row=>row.account===item.decision&&row.amount===item.value);
    if(!sideLabel||!row)return item;
    const ending='するため、'+sideLabel+'を'+row.account+num(row.amount)+'円とします';
    const sentences=authoredSection(q,'この問題への当てはめ').split('。').map(text=>text.trim());
    const sentence=sentences.find(text=>text.endsWith(ending));
    let why=sentence?.slice(0,-ending.length);
    if(!why){
      const specialEnding='するため、この問題では'+sideLabel+'に'+num(row.amount)+'円を記録します';
      const index=sentences.findIndex(text=>text.startsWith(row.account+'という特殊勘定')&&text.endsWith(specialEnding));
      const definition=sentences[index-1];
      if(index<1||!definition.startsWith(row.account+'は'))return item;
      const specific=Feedback.transactionReason(q,row.account,side);
      if(!specific)return item;
      why=definition+'。'+specific;
    }
    return {...item,decision:row.account+'：'+why,evidenceRefs:[...arr(item.evidenceRefs),'explanation']};
  }
  function optimizeInstruction(q,m){
    const out={...m};
    const strategy=learnerStrategy(q);
    out.summary=strategy.map(text=>({text,evidenceRef:'question'}));
    if(q.type==='journal'||q.type==='correction'){
      const reason=journalReason(q);
      if(reason)out.summary.push({text:reason,evidenceRef:'explanation'});
      if(q.type==='journal')out.transfer=arr(out.transfer).map(item=>journalDecision(q,item));
    }
    const point=authoredSection(q,'試験のポイント');
    if(point && !out.summary.some(item=>String(item.text||'').includes(point))){
      out.summary.push({text:'試験のポイント：'+point,evidenceRef:'explanation'});
    }
    if(q.type==='comprehensive'&&!q.format){
      const contrast=String(q.explanation||'').split('【')[0].split('。').find(text=>/現金/u.test(text)&&/収益|費用|売上|前受金/u.test(text)&&!/^期末現金残高|^現金が動くか/u.test(text));
      if(contrast)out.summary.push({text:contrast+'。',evidenceRef:'explanation'});
    }
    const placementCritical=['journal','correction','worksheet'].includes(q.type);
    const calculatedValues=new Set(arr(out.calculation).filter(item=>/[×÷＋+−\-＝=]/u.test(String(item?.expression||''))).map(item=>comparableValue(item?.result)).filter(Boolean));
    if(!placementCritical&&calculatedValues.size){
      out.transfer=arr(out.transfer).flatMap(item=>{
        const key=comparableValue(item?.value);
        if(item.semanticType==='unitPrice'&&arr(out.calculation).some(calculation=>/単価/u.test(calculation.label)&&comparableValue(calculation.result)===key))return[{...item,value:'上で求めた単価（円／個）'}];
        if(!key||!calculatedValues.has(key)||(item.semanticType&&item.semanticType!=='amount'))return[item];
        if(!['ledger','trial_balance','financial_statement'].includes(q.type))return[];
        const base=String(item.decision||'').trim();
        const decision=/記入/u.test(base)?base:(base?base+'を該当欄へ記入':'計算結果を該当欄へ記入');
        return[{...item,decision,value:q.type==='trial_balance'?'上で求めた合計':'上で求めた金額'}];
      });
    }
    return out;
  }
  // Learner-facing bridge only; this does not alter QuestionData, grading or the Oracle.
  // Every amount comes from the already-derived teaching calculation, not from
  // a displayed wrong answer. These checks are consistency aids, not proof of grading.
  function clarifyFinalReporting(q, m){
    if(q.id==='F001'){
      const amounts=Object.fromEntries(arr(m.calculation)
        .filter(x=>x.cellId&&typeof x.result==='number')
        .map(x=>[x.cellId,x.result]));
      const {sales,costOfSales,expenses,netIncome}=amounts;
      if([sales,costOfSales,expenses,netIncome].every(Number.isFinite) &&
          sales-costOfSales-expenses===netIncome){
        const gross=sales-costOfSales;
        m.checks=[...arr(m.checks),
          {label:'売上総利益を確かめる',expected:`${num(sales)}円 − ${num(costOfSales)}円 ＝ ${num(gross)}円`,
            note:'売上原価は商品を販売するためにかかった原価です。',evidenceRefs:['materials'],checkKind:'profit-step'},
          {label:'当期純利益を確かめる',expected:`${num(gross)}円 − ${num(expenses)}円 ＝ ${num(netIncome)}円`,
            note:'売上原価を費用合計へ二重に含めないでください。',evidenceRefs:['materials'],checkKind:'profit-step'}];
      }
    }
    if(q.id==='C002'){
      const steps=arr(m.calculation),named=label=>steps.find(x=>x.label===label);
      const cash=named('決算後現金'),receipt=named('未記帳売上の現金受取額（税込）'),shortage=named('現金不足（雑損）');
      const sourceText=JSON.stringify(q.materials||[]);
      const bookBalance=/現金実査前帳簿([0-9,]+)/u.exec(sourceText);
      const beginning=bookBalance?Number(bookBalance[1].replaceAll(',','')):NaN;
      if([cash,receipt,shortage].every(x=>Number.isFinite(x?.result))&&
          Number.isFinite(beginning)&&
          beginning+receipt.result-cash.result===shortage.result){
        m.checks=[...arr(m.checks),{
          label:'未記帳の入金を加えてから現金実査と比べる',
          expected:`${num(beginning)}円 ＋ ${num(receipt.result)}円 − ${num(cash.result)}円 ＝ ${num(shortage.result)}円`,
          note:'帳簿と実査の比較に、未記帳の税込現金売上を反映します。',
          evidenceRefs:['materials'],checkKind:'book-cash-reconciliation'}];
      }
      const vat=named('未払消費税');
      if(Number.isFinite(vat?.result))m.checks=[...arr(m.checks),{
        label:'消費税は仮受額と仮払額を照合する',
        expected:String(vat.expression||`${num(vat.result)}円`),
        note:'未記帳売上の仮受消費税と未処理仕入の仮払消費税も含めます。',
        evidenceRefs:['materials'],checkKind:'tax-source-reconciliation'}];
      const income=named('当期純利益');
      if(typeof income?.result==='number'&&income.result<0)m.checks=[...arr(m.checks),{
        label:'赤字の符号を確認する',expected:`当期純損失：${num(-income.result)}円（入力欄は ${num(income.result)}円）`,
        note:'損失は利益欄に負の数で記入します。',
        evidenceRefs:['materials'],checkKind:'negative-income-sign'}];
    }
    // The comprehensive exercise already calculates every requested cell.
    // Expose *where* the learner should write it; do not generate a second formula.
    if(q.type==='comprehensive'){
      const expected=arr(q.table?.inputCells),byCell=new Map();
      for(const item of arr(m.calculation))if(item?.cellId && expected.includes(item.cellId)&&
        !byCell.has(item.cellId)&&item.result!=null && item.result!=='' && item.result!=='入力')byCell.set(item.cellId,item);
      if(byCell.size===expected.length && expected.length>0){
        m.transfer=expected.map(cell=>{
          const calc=byCell.get(cell),negative=typeof calc.result==='number'&&calc.result<0;
          return {from:calc.label,decision:negative?'損失は負の数で記入します。':'上の計算で求めた金額を記入します。',
            to:`${calc.label}（解答欄）`,value:calc.result,semanticType:'amount',
            evidenceRefs:['question','materials','table.inputCells']};
        });
      }
      if(q.id==='C010')m.summary=[...arr(m.summary),{
        text:'社長への報告では、現金の入出金と当月の損益を分けて説明します。掛売上は収益ですが未回収のため現金は増えません。',
        evidenceRef:'question',role:'report-intent'}];
    }
    return m;
  }
  function merge(g,a){
    if(!obj(a))return g;
    const m={...g,source:'authored'};
    const generatedHasStructuredSources=arr(g.sources).some(source=>source?.table?.columns?.length&&source?.table?.rows?.length||source?.list?.length);
    REQUIRED_SECTIONS.forEach(k=>{
      if(!Array.isArray(a[k]))return;
      if(k==='sources'&&generatedHasStructuredSources)return;
      m[k]=clone(a[k]);
    });
    if(obj(a.fallback))m.fallback={...g.fallback,...clone(a.fallback)};
    return m;
  }
  function validate(m){const e=[];if(!obj(m))return{valid:false,errors:['model must be an object']};if(m.schemaVersion!==SCHEMA_VERSION)e.push(`schemaVersion must be ${SCHEMA_VERSION}`);REQUIRED_SECTIONS.forEach(k=>{if(!Array.isArray(m[k]))e.push(`${k} must be an array`);});if(!obj(m.fallback))e.push('fallback must be an object');if(m.fallback&&typeof m.fallback.authoredExplanation!=='string')e.push('fallback.authoredExplanation must be a string');if(m.fallback&&!Array.isArray(m.fallback.diagnostics))e.push('fallback.diagnostics must be an array');return{valid:e.length===0,errors:e};}
  function build(q,a={},s={correct:false},o={}){if(!obj(q))throw new TypeError('question must be an object');const m=clarifyFinalReporting(q,optimizeInstruction(q,merge(generated(q,a,s,o),q.explanationModel))),v=validate(m);if(!v.valid)throw new Error(`invalid explanation model: ${v.errors.join('; ')}`);return m;}
  return Object.freeze({SCHEMA_VERSION,REQUIRED_SECTIONS,build,validate});
});
