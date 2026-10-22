"""Independent arithmetic from visible conditions; never imports app formulas.

Derivation receives only question/material/table fields. Answers are consulted
afterwards, solely for comparison. Direct transcription is not counted as math.
"""
import json
import re
import subprocess
import sys


def number(value):
    return float(str(value).replace(',', ''))


def capture(text, pattern):
    match = re.search(pattern, text)
    if not match:
        raise ValueError(pattern + ': ' + text)
    return number(match[1])


def derive(source):
    text, rows, materials = source['question'], source.get('table', {}).get('rows', []), source.get('materials', [])
    kind, fmt = source['type'], source.get('format')
    output = []

    def step(target, formula, value):
        output.append(dict(target=target, formula=formula, derived=value))
        return value

    amounts = [number(m) for m in re.findall(r'([\d,]+)円', text)]
    if kind == 'journal':
        if '引取運賃' in text:
            step('debit.仕入', f'{amounts[0]} + {amounts[1]}', sum(amounts[:2]))
        elif 'クレジット' in text:
            rate = capture(text, r'([\d.]+)[％%]') / 100
            fee = step('debit.支払手数料', f'{amounts[0]} * {rate}', amounts[0]*rate)
            step('debit.クレジット売掛金', f'{amounts[0]} - {fee}', amounts[0]-fee)
        elif '取得原価' in text and '売却' in text:
            cost, accumulated, proceeds = amounts[:3]
            loss = cost-accumulated-proceeds
            target = 'debit.固定資産売却損' if loss >= 0 else 'credit.固定資産売却益'
            step(target, f'abs(({cost} - {accumulated}) - {proceeds})', abs(loss))
        elif '差額補充法' in text:
            rate = capture(text, r'([\d.]+)[％%]')/100
            step('credit.貸倒引当金', f'{amounts[0]} * {rate} - {amounts[1]}', amounts[0]*rate-amounts[1])
        elif '定額法' in text and '残存価額ゼロ' in text:
            life = capture(text, r'耐用年数(\d+)年')
            step('debit.減価償却費', f'{amounts[0]} / {life}', amounts[0]/life)
        elif '給与総額' in text:
            gross, income_tax, insurance = amounts[:3]
            step('credit.普通預金', f'{gross} - {income_tax} - {insurance}', gross-income_tax-insurance)
        elif '会社負担分' in text:
            step('credit.普通預金', f'{amounts[0]} + {amounts[1]}', sum(amounts[:2]))
        elif '元本' in text and '利息' in text:
            step('credit.普通預金', f'{amounts[0]} + {amounts[1]}', sum(amounts[:2]))
        elif '仮払消費税' in text and '仮受消費税' in text:
            step('credit.未払消費税', f'{amounts[1]} - {amounts[0]}', amounts[1]-amounts[0])
        elif '小口現金係から' in text and '報告' in text:
            step('credit.当座預金', ' + '.join(map(str, amounts[:3])), sum(amounts[:3]))
        elif '仮払金' in text and '返却' in text:
            step('credit.仮払金', f'{amounts[0]} + {amounts[1]}', sum(amounts[:2]))
        elif '買掛金' in text and '記帳していた' in text:
            step('debit.買掛金', f'{amounts[0]} - {amounts[1]}', amounts[0]-amounts[1])
    elif kind == 'trial_balance':
        for side in ['debit', 'credit']:
            values = [r[side] for r in rows if isinstance(r.get(side), (int, float))]
            step('total_'+side, ' + '.join(map(str, values)), sum(values))
    elif kind == 'ledger' and not fmt and '商品有高帳' in source['category']:
        opening, purchase, issue = rows[:3]
        first = min(opening['quantity'], issue['quantity'])
        second = issue['quantity']-first
        cost = first*opening['unitPrice']+second*purchase['unitPrice']
        step('r3_unitPrice', f'{cost} / {issue["quantity"]}', cost/issue['quantity'])
        step('r3_amount', f'{first} * {opening["unitPrice"]} + {second} * {purchase["unitPrice"]}', cost)
        step('r4_amount', f'({opening["quantity"]} - {first}) * {opening["unitPrice"]} + ({purchase["quantity"]} - {second}) * {purchase["unitPrice"]}', (opening['quantity']-first)*opening['unitPrice']+(purchase['quantity']-second)*purchase['unitPrice'])
    elif kind == 'ledger' and not fmt and '元帳' in source['category']:
        balance = rows[0]['balance']
        liability = '買掛金' in source['category']
        for index, row in enumerate(rows[1:], 2):
            debit = row.get('debit') if isinstance(row.get('debit'), (int,float)) else 0
            credit = row.get('credit') if isinstance(row.get('credit'), (int,float)) else 0
            increase, decrease = (credit, debit) if liability else (debit, credit)
            balance = step(f'r{index}_balance', f'{balance} + {increase} - {decrease}', balance+increase-decrease)
    elif fmt == 'bookkeeping-inventory-ledger':
        match = re.search(r'期首(\d+)個@([\d,]+)円、仕入(\d+)個@([\d,]+)円.*?(\d+)個を払い出', text)
        q1,p1,q2,p2,issue = map(number,match.groups())
        average = step('value1', f'({q1} * {p1} + {q2} * {p2}) / ({q1} + {q2})', (q1*p1+q2*p2)/(q1+q2))
        step('value2', f'{issue} * {average}', issue*average)
        step('value3', f'({q1} + {q2} - {issue}) * {average}', (q1+q2-issue)*average)
    elif fmt == 'fixed-asset-ledger' and len(rows) == 1:
        row = rows[0]
        conditions = {k:v for m in materials for k,v in m.items()}
        cost = row.get('acquisitionCost')
        if not isinstance(cost, (int,float)):
            cost = conditions['取得原価']
        life = row.get('life') or capture(conditions['耐用年数'], r'(\d+)')
        residual = row.get('residualValue', conditions.get('残存価額',0))
        acquired = row.get('acquisitionDate')
        if not acquired or acquired == '入力':
            acquired = conditions.get('取得日','4/1')
        month = int(acquired.split('/')[0]); months = (3-month)%12+1
        annual = (cost-residual)/life
        current = annual*months/12
        opening = row.get('openingAccumulated',0)
        candidates = {'annualDepreciation':(f'({cost} - {residual}) / {life}',annual), 'months':(f'(3 - {month}) mod 12 + 1',months), 'currentDepreciation':(f'{annual} * {months} / 12',current), 'closingAccumulated':(f'{opening} + {current}',opening+current), 'closingBookValue':(f'{cost} - {opening} - {current}',cost-opening-current)}
        for key,(formula,value) in candidates.items():
            if row.get(key)=='入力':step(key,formula,value)
    elif fmt == 'fixed-asset-ledger' and len(rows) == 2:
        life = capture(text,r'耐用年数(\d+)年')
        for material,suffix in zip(materials,['A','B']):
            cost=material['取得原価'];start=int(material['取得日'].split('/')[0]);sold='売却日' in material
            end=int(material['売却日' if sold else '決算日'].split('/')[0]);months=(end-start)%12+(0 if sold else 1)
            annual=step('annual'+suffix,f'{cost} / {life}',cost/life)
            step('months'+suffix,f'({end} - {start}) mod 12 + {0 if sold else 1}',months)
            expense=step('depreciation'+suffix,f'{annual} * {months} / 12',annual*months/12)
            book=step('book'+suffix,f'{cost} - {expense}',cost-expense)
            if sold:step('lossA',f'{book} - {material["売却価額"]}',book-material['売却価額'])
    elif kind == 'worksheet' and '決算整理・計算問題' in source['category']:
        insurance=capture(text,r'保険料([\d,]+)円');fraction=capture(text,r'(\d+)分の1');cost=capture(text,r'備品([\d,]+)円');life=capture(text,r'耐用年数(\d+)年')
        prepaid=step('insurance_adjustment',f'{insurance} / {fraction}',insurance/fraction)
        step('insurance_expense_after',f'{insurance} - {prepaid}',insurance-prepaid)
        depreciation=step('depreciation_expense',f'{cost} / {life}',cost/life)
        step('equipment_book_value_after',f'{cost} - {depreciation}',cost-depreciation)
    elif fmt == 'adjusted-trial-balance':
        by={m['勘定科目']:m for m in materials}
        prepaid=capture(by['保険料']['整理事項'],r'前払分([\d,]+)円')
        insurance=step('insurance',f'{by["保険料"]["整理前借方"]} - {prepaid}',by['保険料']['整理前借方']-prepaid)
        dep=capture(by['減価償却費']['整理事項'],r'借方([\d,]+)円')
        for side,target in [('借方','debitTotal'),('貸方','creditTotal')]:
            values=[m['整理前'+side] for m in materials if isinstance(m['整理前'+side],(int,float))]
            step(target,' + '.join(map(str,values))+f' + {dep}',sum(values)+dep)
    elif fmt == 'closing-entries':
        sales=capture(text,r'売上([\d,]+)円')
        expenses=[capture(text,k+r'([\d,]+)円') for k in ['仕入','保険料','減価償却費']]
        step('profit',f'{sales} - ('+' + '.join(map(str,expenses))+')',sales-sum(expenses))
    elif fmt == 'eight-column-worksheet':
        by={m['勘定科目']:m for m in materials}
        adjustments='／'.join(source.get('adjustments',[]))+'／'+text
        prepaid=capture(adjustments,r'保険料(?:のうち)?([\d,]+)円')
        depreciation=capture(adjustments,r'(?:当期減価償却費|間接法で)([\d,]+)円')
        insurance=step('plDebit_9',f'{by["保険料"]["借方"]} - {prepaid}',by['保険料']['借方']-prepaid)
        sales=by['売上']['貸方'];purchase=by['仕入']['借方']
        profit=sales-purchase-insurance-depreciation
        for target in ['plDebit_13','bsCredit_13']:step(target,f'{sales} - {purchase} - {insurance} - {depreciation}',profit)
    elif fmt == 'income-statement':
        sums={k:sum(m['金額'] for m in materials if m['区分']==k) for k in ['収益','売上原価','費用']}
        step('expenses',' + '.join(str(m['金額']) for m in materials if m['区分']=='費用'),sums['費用'])
        step('netIncome',f'{sums["収益"]} - {sums["売上原価"]} - {sums["費用"]}',sums['収益']-sums['売上原価']-sums['費用'])
    elif fmt == 'balance-sheet':
        sums={k:sum(r['amount'] for r in rows if r['section']==k and isinstance(r['amount'],(int,float))) for k in ['資産','負債','純資産']}
        step('assetsTotal',' + '.join(str(r['amount']) for r in rows if r['section']=='資産' and isinstance(r['amount'],(int,float))),sums['資産'])
        retained=step('retainedEarnings',f'{sums["資産"]} - {sums["負債"]} - {sums["純資産"]}',sums['資産']-sums['負債']-sums['純資産'])
        step('liabilitiesEquityTotal',f'{sums["負債"]} + {sums["純資産"]} + {retained}',sums['負債']+sums['純資産']+retained)
    elif kind == 'comprehensive' and not fmt:
        cash=[];income=[];expenses=[]
        for m in materials:
            if m['date']=='決算整理事項':continue
            transaction=m['transaction'];amount=capture(transaction,r'([\d,]+)円')
            if '現金残高' in transaction or '現金で受け取' in transaction or ('現金で' in transaction and '販売' in transaction):cash.append(amount)
            elif '現金' in transaction:cash.append(-amount)
            if '販売' in transaction:income.append(amount)
            if '仕入' in transaction or '通信費' in transaction or '当月分給料' in transaction or ('減価償却費' in transaction):expenses.append(amount)
        step('endingCash',' + '.join(map(str,cash)),sum(cash))
        step('profit',' + '.join(map(str,income))+' - ('+' + '.join(map(str,expenses))+')',sum(income)-sum(expenses))
    elif fmt == 'exam-question-3':
        by={m['資料区分']:m for m in materials};adj=by['決算整理事項']['内容']
        def names(value):
            return {m[1]:number(m[2]) for m in re.finditer(r'([^、\d]+)([\d,]+)',value)}
        def given(pattern):return capture(adj,pattern)
        if '整理前残高試算表' in by:
            opening=by['整理前残高試算表'];debit=names(opening['借方']);credit=names(opening['貸方'])
            sale=given(r'未処理の掛売上([\d,]+)円');purchase=given(r'未処理の掛仕入([\d,]+)円');ending=given(r'期末商品([\d,]+)円')
            sales=step('sales',f'{credit["売上"]} + {sale}',credit['売上']+sale)
            cost=step('cost',f'{debit["繰越商品"]} + {debit["仕入"]} + {purchase} - {ending}',debit['繰越商品']+debit['仕入']+purchase-ending)
            receivable=debit['売掛金']+sale;rate=given(r'売掛金期末残高の([\d.]+)%')/100
            allowance=step('allowanceExpense',f'({debit["売掛金"]} + {sale}) * {rate} - {credit["貸倒引当金"]}',receivable*rate-credit['貸倒引当金'])
            start=given(r'(\d+)月1日に1年分');end=capture(by['会計期間']['内容'],r'翌年(\d+)月31日')
            months=(end-start)%12+1
            insurance=step('insurance',f'{debit["保険料"]} / 12 * {months}',debit['保険料']/12*months)
            dep=given(r'備品の減価償却([\d,]+)円');wage=given(r'未払給料([\d,]+)円');tax=given(r'法人税等([\d,]+)円')
            profit=step('netIncome',f'{sales} - ({cost} + {allowance} + {insurance} + {dep} + {wage} + {tax})',sales-cost-allowance-insurance-dep-wage-tax)
            assets=[debit['現金'],receivable-receivable*rate,ending,debit['備品']-credit['減価償却累計額']-dep,debit['保険料']-insurance]
            liabilities_equity=[credit['買掛金']+purchase,wage,tax,credit['資本金'],credit['繰越利益剰余金'],profit]
            step('totalAssets',' + '.join(map(str,assets)),sum(assets));step('totalEquityLiabilities',' + '.join(map(str,liabilities_equity)),sum(liabilities_equity))
        elif '現金実査額' in adj:
            base=names(by['整理前残高']['内容']);rate=capture(text,r'標準税率([\d.]+)%')/100
            sale=given(r'売上([\d,]+)円');purchase=given(r'仕入([\d,]+)円');actual=given(r'現金実査額([\d,]+)円')
            shortage=step('cashShortage',f'{base["現金実査前帳簿"]} + {sale} * (1 + {rate}) - {actual}',base['現金実査前帳簿']+sale*(1+rate)-actual)
            sales=step('sales',f'{base["売上"]} + {sale}',base['売上']+sale)
            purchases=step('purchases',f'{base["仕入"]} + {purchase}',base['仕入']+purchase)
            end=given(r'期末商品([\d,]+)円');cost=step('cost',f'{base["期首商品"]} + {purchases} - {end}',base['期首商品']+purchases-end)
            advertising=given(r'広告費([\d,]+)円');deprate=given(r'年([\d.]+)%')/100
            dep=step('depreciation',f'({base["備品"]} - {advertising}) * {deprate}',(base['備品']-advertising)*deprate)
            step('vatPayable',f'{base["仮受消費税"]} - {base["仮払消費税"]} + ({sale} - {purchase}) * {rate}',base['仮受消費税']-base['仮払消費税']+(sale-purchase)*rate)
            fees=base['受取手数料']+given(r'受取手数料([\d,]+)円');wages=base['給料']+given(r'給料([\d,]+)円');tax=given(r'法人税等([\d,]+)円')
            step('netIncome',f'({sales} + {fees}) - ({cost} + {advertising} + {dep} + {wages} + {shortage} + {tax})',sales+fees-cost-advertising-dep-wages-shortage-tax)
        else:
            base=names(by['整理前残高']['内容']);rate=given(r'売掛金の([\d.]+)%')/100
            step('allowanceExpense',f'{base["売掛金"]} * {rate} - {base["貸倒引当金"]}',base['売掛金']*rate-base['貸倒引当金'])
            int_rate=given(r'年利([\d.]+)%')/100;months=given(r'(\d+)か月分を未払計上')
            for target in ['interestExpense','interestPayable']:step(target,f'{base["借入金"]} * {int_rate} * {months} / 12',base['借入金']*int_rate*months/12)
            rent_start=given(r'受取家賃は(\d+)月1日');rent_end=given(r'翌年(\d+)月31日まで');period=capture(by['会計期間・決算日']['内容'],r'翌年(\d+)月31日')
            total_months=(rent_end-rent_start)%12+1;current_months=(period-rent_start)%12+1
            step('rentRevenue',f'{base["受取家賃"]} / {total_months} * {current_months}',base['受取家賃']/total_months*current_months)
            step('rentUnearned',f'{base["受取家賃"]} / {total_months} * ({total_months} - {current_months})',base['受取家賃']/total_months*(total_months-current_months))
            new=given(r'取得の備品([\d,]+)円');life=given(r'耐用年数(\d+)年');start=given(r'(\d+)月1日取得の備品');used=(period-start)%12+1
            step('newAssetDepreciation',f'{new} / {life} * {used} / 12',new/life*used/12)
            annual=given(r'年額([\d,]+)円');sold_current=given(r'か月分([\d,]+)円を売却時');sold_months=given(r'当期(\d+)か月分')
            step('oldAssetDepreciation',f'{annual} - {sold_current} / {sold_months} * 12',annual-sold_current/sold_months*12)
            cost=given(r'原価([\d,]+)円');accumulated=given(r'期首累計([\d,]+)円');proceeds=given(r'を([\d,]+)円で売却')
            step('saleLoss',f'{cost} - {accumulated} - {sold_current} - {proceeds}',cost-accumulated-sold_current-proceeds)
    return output


def run():
    code="const fs=require('fs'),vm=require('vm'),s={window:{}};vm.runInNewContext(fs.readFileSync('data/questions.js','utf8'),s);process.stdout.write(JSON.stringify(s.window.QuestionData));"
    questions=json.loads(subprocess.check_output(['node','-e',code],text=True))
    records=[]
    for id,q in questions.items():
        source={k:q[k] for k in ['question','type','category','format','materials','table','adjustments'] if k in q}
        source.setdefault('materials',[]);source.setdefault('table',{})
        items=derive(source)
        for item in items:
            if q['type']=='journal':
                side,account=item['target'].split('.')
                expected=next(r['amount'] for r in q['answer'][side] if r['account']==account)
            else:expected=q['answer']['cells'][item['target']]
            item.update(expected=expected,match=item['derived']==expected)
        records.append(dict(id=id,conditions=source,calculations=items,status='NEW_RECALCULATION' if items else 'REUSE_EXISTING_SOURCE_ORACLE'))
    items=[item for row in records for item in row['calculations']]
    report=dict(method='New arithmetic implementation; derive() receives no answer, explanation, model or app calculation functions. Existing source-derived oracle coverage is reported separately.',questions=sum(bool(r['calculations']) for r in records),items=len(items),matched=sum(i['match'] for i in items),mismatched=sum(not i['match'] for i in items),records=records)
    if len(sys.argv)>1:
        with open(sys.argv[1],'w') as f:json.dump(report,f,ensure_ascii=False,indent=2)
    print(json.dumps({k:v for k,v in report.items() if k!='records'},ensure_ascii=False))
    assert items and not report['mismatched']


if __name__=='__main__':run()
