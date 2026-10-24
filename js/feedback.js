(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.WrongAnswerFeedback = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const yen = value => Number(value).toLocaleString('ja-JP');
  const normalize = value => String(value ?? '').replace(/[０-９]/g, digit => String.fromCharCode(digit.charCodeAt(0) - 0xfee0)).replace(/[，,\s]/g, '');
  const sameValue = (actual, expected) => typeof expected === 'number' ? normalize(actual) !== '' && Number(normalize(actual)) === expected : String(actual ?? '').trim() === String(expected).trim();
  const all = answer => [...(answer?.debit || []), ...(answer?.credit || [])];
  const entry = (kind, title, reason, thinking, nextRule, cause = kind) => ({ kind, title, reason, thinking, nextRule, cause });

  const MISCONCEPTIONS = Object.freeze({
    '未払金→買掛金': ['「未払金」は商品以外の物品・サービスを後払いした債務です。今回は営業用の商品仕入による掛代金なので「買掛金」です。', '後払いかだけでなく、商品仕入なら買掛金、商品以外なら未払金と判別します。'],
    '買掛金→未払金': ['「買掛金」は営業用商品の掛仕入による債務です。商品以外の備品やサービスの未払いは「未払金」です。', '債務の原因が商品売買か、それ以外かを確認します。'],
    '売掛金→未収入金': ['「売掛金」は商品の掛売上など本来の営業取引による債権です。今回は商品売買ではなく固定資産売却なので、未回収代金は「未収入金」です。', '後日受取というだけで売掛金にせず、商品売買なら売掛金、固定資産売却など商品売買以外なら未収入金と判別します。'],
    '未収入金→売掛金': ['「未収入金」は商品売買以外の未回収代金です。商品の掛売上は本来の営業取引なので「売掛金」です。', '未回収代金が営業用商品の販売から生じたかを確認します。'],
    '売掛金→受取手形': ['売掛金は通常の掛代金ですが、約束手形を受け取った債権は「受取手形」です。', '手形の受取りがあれば受取手形、通常の掛けなら売掛金と判別します。'],
    '買掛金→支払手形': ['「買掛金」は、商品を掛けで仕入れ、代金をまだ支払っていないときの債務です。一方「支払手形」は、その代金を約束手形の振出しによって決済する債務です。', '商品仕入から生じた債務という点は同じでも、通常の掛けのままか、約束手形を振り出して決済したかという決済手段の違いで区別します。']
  });

  const concepts = {
    現金:'手元にある通貨・通貨代用証券', 普通預金:'普通預金口座の残高', 当座預金:'小切手決済に使う当座預金', 売掛金:'営業用商品の掛売上から生じる債権', 買掛金:'営業用商品の掛仕入から生じる債務',
    未収入金:'商品売買以外から生じる未回収代金', 未払金:'商品売買以外から生じる未払債務', 未払配当金:'株主総会等で確定した配当について、株主へ支払うまでの債務', 受取手形:'受け取った約束手形による債権', 支払手形:'振り出した約束手形による債務',
    電子記録債権:'電子記録によって発生した債権', 電子記録債務:'電子記録によって発生した債務', 前払金:'商品を受け取る前に支払った手付金', 前受金:'商品を渡す前に受け取った手付金',
    前払保険料:'翌期分を先に支払った保険料という資産', 未払利息:'当期に発生したが未払いの利息', 未収利息:'当期に発生したが未回収の利息', 前受家賃:'翌期分を先に受け取った家賃という負債',
    仕入:'販売目的の商品を取得した原価', 売上:'営業用商品を販売して得た収益', 備品:'長期使用する営業用資産の取得原価', 減価償却累計額:'固定資産の過年度を含む減価償却額を控除する評価勘定',
    貸倒引当金:'売上債権の将来の貸倒見積額を控除する評価勘定', 損益:'収益と費用を集合して当期純損益を確定する決算勘定', 現金過不足:'帳簿残高と実際有高の原因不明差額を一時処理する勘定',
    クレジット売掛金:'クレジットカード会社に対する商品売上代金の債権', 仕入返品:'仕入商品の返品による仕入高の減少', 売上返品:'販売商品の返品による売上高の減少',
    仮受消費税:'売上時に取引先から預かった消費税', 仮払消費税:'仕入時に取引先へ支払った消費税', 未払消費税:'仮受消費税から仮払消費税を控除した納税義務',
    仮受金:'入金理由または最終科目が未確定の受取額', 仮払金:'支払目的または最終金額が未確定の支出額', 立替金:'本来は他者が負担する金額を一時的に立て替えた債権',
    保険料:'当期の保険契約期間に対応する費用', 受取利息:'貸付金や預金から当期に発生した利息収益', 支払利息:'借入金について当期に発生した利息費用',
    借入金:'金融機関などから借り入れて返済義務を負う元本', 貸付金:'他者へ貸し付けて返済を受ける権利を持つ元本', 差入保証金:'契約の担保として差し入れ、将来返還を受ける金額',
    償却債権取立益:'前期以前に貸倒処理した債権を回収した当期収益', 固定資産売却損:'固定資産の帳簿価額が売却価額を上回る差額費用', 固定資産売却益:'固定資産の売却価額が帳簿価額を上回る差額収益',
    受取家賃:'建物などを貸して当期に得た家賃収益', 支払家賃:'建物などを借りて当期に負担する家賃費用', 未収収益:'当期に発生済みだが未回収の収益を表す資産', 未払費用:'当期に発生済みだが未払いの費用を表す負債',
    受取商品券:'商品券で代金を受け取り発行者へ換金請求できる債権', 小口現金:'日常の少額支払に備えて担当者へ前渡しした現金', 当座借越:'当座預金残高を超えて支払ったことによる銀行への短期債務',
    所得税預り金:'従業員給与から源泉徴収して国へ納付するまでの債務', 社会保険料預り金:'従業員負担の社会保険料を給与から控除し納付するまでの債務', 法定福利費:'社会保険料などの会社負担分として生じる費用',
    旅費交通費:'業務上の移動や出張に要した費用', 支払手数料:'振込や仲介などのサービス提供を受けて負担する費用', 水道光熱費:'営業に使用した電気・ガス・水道の費用', 通信費:'郵便・電話・インターネット等の業務上の費用',
    消耗品費:'短期間に消費する事務用品等の使用額', 発送費:'販売商品の発送について自社が負担する費用', 租税公課:'事業に課された印紙税や固定資産税などの費用', 給料:'従業員の労働に対して会社が負担する費用',
    減価償却費:'固定資産の取得原価を使用期間へ配分した当期費用', 貸倒引当金繰入:'必要な貸倒引当金を当期に追加設定する費用', 貯蔵品:'未使用の郵便切手や収入印紙など次期に使用できる資産',
    繰越商品:'期首または期末に在庫として残る商品の原価', 資本金:'株主が会社へ払い込んだ金額を基礎とする純資産', 繰越利益剰余金:'過年度から蓄積した利益のうち社内に留保された純資産', 未払法人税等:'確定した法人税等を納付するまでの債務',
    '法人税、住民税及び事業税':'当期所得などに基づき会社が負担する税金費用', 電子記録債権:'電子債権記録機関の記録によって発生する金銭債権', 電子記録債務:'電子債権記録機関の記録によって発生する金銭債務'
  };
  const genericConcept = account => concepts[account] || '定義を登録できていない勘定（教材監査エラー）';
  const misconception = (wrong, correct, question) => {
    const known = MISCONCEPTIONS[`${wrong}→${correct}`];
    if (known) return known;
    return [`「${wrong}」は${genericConcept(wrong)}です。一方「${correct}」は${genericConcept(correct)}です。問題文の取引は「${correct}」の定義に該当するため、「${wrong}」では取引の対象・原因または決済手段が異なります。`, `名称の印象で選ばず、「何を取引したか」「いつ認識するか」「どの決済手段か」を問題文「${question.question}」から特定し、${correct}の定義と照合します。`];
  };

  // Diagnostics describe only this attempt. The authored lesson is rendered once
  // by AppView, rather than copied into every incorrect-field card.
  const context = question => {
    const base = `${question.category}では、問題文の事実を勘定科目・貸借・金額（または表の行と列）へ順に対応させます。`;
    const rows = all(question.answer); const cost = rows.find(row => row.account === '備品')?.amount; const accumulated = rows.find(row => /減価償却累計額/.test(row.account))?.amount;
    const proceeds = rows.find(row => ['現金','普通預金','未収入金'].includes(row.account))?.amount;
    return cost && accumulated && proceeds ? `${base} 取得原価${yen(cost)}円－減価償却累計額${yen(accumulated)}円＝帳簿価額${yen(cost - accumulated)}円で、売却額${yen(proceeds)}円との差額を売却損益にします。` : base;
  };
  const cashOverShort = question => /現金過不足|帳簿.*現金|実際有高/.test(`${question.question} ${question.explanation}`);
  // Explain the transaction, not a permanent asset/liability classification.
  function transactionReason(question, account, side) {
    const text = String(question.question || ''), debit = side === 'debit';
    if (account === '現金過不足') {
      if (/記帳漏れ|仮処理していた|処理済み/.test(text)) return debit
        ? '原因が判明した分の貸方の仮勘定残高を取り消すため、現金過不足の借方に記入します。現金は仮処理時に修正済みなので、再び増減させません。'
        : '不足額を仮処理した借方残高のうち、原因が判明した分を取り消すため、現金過不足の貸方に記入します。記帳漏れの通信費を借方に計上し、現金は再び減らしません。';
      return debit
        ? '実際有高に合わせて現金を貸方で減らします。原因不明の不足額は、原因が判明するまで現金過不足の借方に仮記入します。'
        : '実際有高に合わせて現金を借方で増やします。原因不明の超過額は、原因が判明するまで現金過不足の貸方に仮記入します。';
    }
    if (account === '減価償却累計額') {
      if (debit && /売却/.test(text)) return '備品を売却するため、これまで計上した減価償却累計額を取り消します。通常は貸方残高を持つので、取り消すときは借方に記入します。';
      if (!debit && /定額法|減価償却/.test(text)) return '当期の減価償却費を借方に計上し、同額を減価償却累計額の貸方に積み上げます。間接法では備品の取得原価を残し、累計額で帳簿価額を減らします。';
    }
    if (account === '貸倒引当金') {
      if (debit && /回収不能/.test(text)) return '前期に発生した売掛金の貸倒れに、計上済みの貸倒引当金を充てます。貸方残高の引当金を取り崩すので借方、回収できなくなった売掛金は貸方です。';
      if (!debit && /差額補充法/.test(text)) return '売掛金残高に貸倒見積率を掛けた必要額と、整理前の貸方残高を比べます。不足する差額だけを貸倒引当金の貸方に追加し、同額を貸倒引当金繰入として借方に計上します。';
    }
    if (account === '損益' && /当期純利益.*繰越利益剰余金/.test(text) && debit) return '損益勘定の貸方残高は当期純利益です。損益勘定を締め切るため同額を借方に記入し、繰越利益剰余金の貸方へ振り替えます。';
    if (account === '繰越利益剰余金') {
      if (!debit && /当期純利益/.test(text)) return '当期純利益を会社に蓄積した利益へ加えるため、純資産である繰越利益剰余金の貸方に記入します。';
      if (debit && /配当/.test(text)) return '配当の決議により会社に蓄積した利益を減らすため、繰越利益剰余金の借方に記入します。まだ支払っていない配当は、未払配当金の貸方に計上します。';
    }
    // Interpret both halves of compound entries separately; the same account can
    // legitimately appear on opposite sides for different amounts.
    if (question.category === '売上原価' && /期首商品棚卸高.*期末商品棚卸高/.test(text)) {
      if (account === '仕入' && debit) return '期首の在庫を当期の売上原価に含めるため、資産である繰越商品から費用である仕入へ振り替えます。仕入の増加なので借方です。';
      if (account === '繰越商品' && !debit) return '期首に繰り越した商品を当期の売上原価へ振り替えます。期首在庫の資産を減らすので、繰越商品の貸方です。';
      if (account === '繰越商品' && debit) return '期末に売れ残った商品は翌期に繰り越す資産です。期末在庫を資産として計上するため、繰越商品の借方です。';
      if (account === '仕入' && !debit) return '期末に売れ残った商品は当期の売上原価に含めません。仕入から期末在庫を控除するため、仕入の貸方へ振り替えます。';
    }
    if (question.category === '手形の取立と支払' && /受取手形.*満期.*支払手形.*満期/.test(text)) {
      if (account === '当座預金' && debit) return '受取手形の満期取立てにより当座預金が増えます。預金は資産なので、増加を借方に記録します。';
      if (account === '受取手形' && !debit) return '受取手形は取立てが終わると債権が消滅します。資産である受取手形の減少を貸方に記録します。';
      if (account === '支払手形' && debit) return '支払手形を満期に決済したため、手形債務が消滅します。負債の減少なので借方に記録します。';
      if (account === '当座預金' && !debit) return '支払手形の満期決済で当座預金から代金が支払われます。資産である預金の減少を貸方に記録します。';
    }
    if (account === '未払配当金' && !debit && /配当/.test(text)) return '配当決議により株主に支払う債務が発生します。未払配当金は負債なので、増加を貸方に記録します。';
    // Use the already-authored, question-specific explanation only when the
    // account, exact amount, account class, change direction and side agree.
    // Reject unexpected formats rather than inventing an accounting rationale.
    const entries = (question.answer?.[side] || []).filter(row => row.account === account);
    if (entries.length === 1) {
      const amount = Number(entries[0].amount);
      const section = String(question.explanation || '').split('【この問題への当てはめ】')[1]?.split('【この問題の仕訳】')[0] || '';
      const sideLabel = debit ? '借方' : '貸方';
      const marker = sideLabel + 'を' + account + yen(amount) + '円とします。';
      const index = section.indexOf(marker);
      if (index >= 0 && section.indexOf(marker, index + marker.length) === -1) {
        const previous = section.lastIndexOf('。', index - 1);
        const beginning = section.lastIndexOf('。', previous - 1) + 1;
        const passage = section.slice(beginning, index + marker.length).trim();
        const match = passage.match(/^(.+?)は(資産|負債|純資産|費用|収益)で、この取引では([0-9,]+)円の(増加|減少)です。/u);
        if (match && match[1] === account && Number(match[3].replace(/,/g, '')) === amount) {
          const growsOnDebit = match[2] === '資産' || match[2] === '費用';
          const correctSide = growsOnDebit === (match[4] === '増加') ? 'debit' : 'credit';
          if (correctSide === side) return passage;
        }
      }
    }
    return '';
  }
  const directionReason = (account, side, question) => {
    const specific = transactionReason(question, account, side);
    if (cashOverShort(question) && !/記帳漏れ|仮処理していた|処理済み/.test(question.question)) {
      const shortage = (question.answer?.debit || []).some(row => row.account === '現金過不足');
      return shortage
        ? '帳簿上の現金が実際有高より多いため、実際有高へ合わせて現金を減らし貸方へ記入します。原因不明の不足額は一時的に「現金過不足」の借方へ記録します。'
        : '帳簿上の現金が実際有高より少ないため、実際有高へ合わせて現金を増やし借方へ記入します。原因不明の過剰額は一時的に「現金過不足」の貸方へ記録します。';
    }
    if (specific) return specific;
    if (account === '損益') return `損益は決算時に収益・費用を集合する勘定です。通常の資産・負債の増減ではなく、収益・費用を締め切る振替の相手側として${side === 'debit' ? '借方' : '貸方'}へ記入します。`;
    if (/^(貸倒引当金|減価償却累計額)$/.test(account)) return `${account}は資産そのものではなく資産の控除項目です。設定・増加は貸方、取崩し・減少は借方なので、この取引では${side === 'debit' ? '借方' : '貸方'}です。`;
    return `${account}の定義（${genericConcept(account)}）と、この取引による増減を照合すると${side === 'debit' ? '借方' : '貸方'}です。資産・費用の増加は借方、負債・純資産・収益の増加は貸方、減少は反対側です。`;
  };

  function diagnoseJournal(question, answer) {
    const expected = question.answer; const result = []; const entered = all(answer); const correct = all(expected);
    for (const side of ['debit','credit']) for (const item of expected[side] || []) {
      const opposite = side === 'debit' ? 'credit' : 'debit';
      // The same account may legitimately occur on both sides of a compound entry.
      const same = (answer?.[side] || []).find(row => row.account === item.account);
      const rowLabel = (expected[opposite] || []).some(row => row.account === item.account) ? `${side === 'debit' ? '借方' : '貸方'}の${item.account}` : item.account;
      const oppositeEntry = !(expected[opposite] || []).some(row => row.account === item.account) && (answer?.[opposite] || []).some(row => row.account === item.account);
      if (!same && oppositeEntry) result.push(entry('side', `${item.account}の貸借が逆です`, directionReason(item.account, side, question), context(question), cashOverShort(question) ? '現金過不足の仮処理と、原因判明後の振替を区別し、今回記入する側を確認します。' : `勘定の性質と増減を分けて判断し、${item.account}を${side === 'debit' ? '借方' : '貸方'}へ記入します。`, `side:${item.account}`));
      if (same && Number(same.amount) !== item.amount) result.push(entry('amount', `${rowLabel}の金額が違います`, `入力した${Number.isFinite(Number(same.amount)) ? yen(same.amount)+'円' : '未入力または不正な金額'}ではなく${yen(item.amount)}円です。問題文の金額と入力値を照合し、計算が必要な場合は総額・控除額・差額の役割を確認します。`, context(question), '問題文の数値へ役割を書き添え、必要な加減算を式にしてから転記します。', `amount:${item.account}`));
      if (!same && !oppositeEntry && !(answer?.[side] || []).some(row => row.account && !(expected[side] || []).some(value => value.account === row.account))) result.push(entry('missing', `${rowLabel}が未記入です`, `${side === 'debit' ? '借方' : '貸方'}に「${item.account}」${yen(item.amount)}円を記入します。`, context(question), transactionReason(question, item.account, side) || `問題文で「${item.account}」に該当する取引を確認し、${side === 'debit' ? '借方' : '貸方'}に記入する根拠と金額を確かめましょう。`, `missing:${item.account}`));
    }
    const remainingExpected = [...correct]; const wrongRows = [];
    for (const row of entered.filter(row => row.account)) { const match = remainingExpected.findIndex(expectedRow => expectedRow.account === row.account); if (match >= 0) remainingExpected.splice(match, 1); else wrongRows.push(row); }
    for (const wrong of wrongRows) {
      const candidates = remainingExpected; const target = candidates.find(row => MISCONCEPTIONS[`${wrong.account}→${row.account}`]) || candidates[0];
      if (!target) continue; const [reason, rule] = misconception(wrong.account, target.account, question);
      result.push(entry('account', `${wrong.account}ではなく${target.account}です`, reason, context(question), rule, `account:${wrong.account}→${target.account}`));
      remainingExpected.splice(remainingExpected.indexOf(target), 1);
    }
    return result;
  }

  function diagnoseCorrection(question, answer) {
    const expected = question.answer.cells; const actual = answer?.cells || {};
    const wrong = Object.keys(expected).filter(id => !sameValue(actual[id], expected[id]));
    if (!wrong.length) return [];
    const material = question.materials?.[0] || {};
    const correction = `（借）${expected.debitAccount} ${yen(expected.debitAmount)}円／（貸）${expected.creditAccount} ${yen(expected.creditAmount)}円`;
    const labels = wrong.map(id => ({ debitAccount:'借方科目', debitAmount:'借方金額', creditAccount:'貸方科目', creditAmount:'貸方金額' }[id] || id)).join('・');
    const reason = `①帳簿の記録「${material.recorded || '記録なし'}」を確認します。②証憑「${material.evidence || '証憑なし'}」から本来の処理を判断します。③すでに正しい部分は残し、帳簿との差だけを「${correction}」で直します。この訂正仕訳を既存の記録へ加えると証憑どおりになります。`;
    return [entry('correction', `${labels}を3段階で確認します`, reason, '訂正仕訳は、誤った仕訳を丸ごと書き直すのではなく、既存記録と証憑上の正しい処理との差額だけを追加します。', '帳簿の記録→証憑から分かる正しい処理→両者の差、の順に書き出してから仕訳します。', `correction:${labels}`)];
  }

  function cellInfo(question, id) {
    if (!question?.table) return { label:question?.category || '回答欄', column:'回答欄' };
    const fixedLabels = { debitAccount:'訂正仕訳の借方科目', debitAmount:'訂正仕訳の借方金額', creditAccount:'訂正仕訳の貸方科目', creditAmount:'訂正仕訳の貸方金額', total_debit:'借方合計', total_credit:'貸方合計', netIncome:'当期純利益' };
    if (fixedLabels[id]) return { label:fixedLabels[id], column:'回答欄' };
    const metadataLabel = question.table.inputMetadata?.[id]?.label;
    if (metadataLabel) return { label:String(metadataLabel), column:'回答欄' };
    const index = question.table.inputCells.indexOf(id); let cursor = -1;
    for (const row of question.table.rows) for (const [column, value] of Object.entries(row)) if (value === '入力' && ++cursor === index) {
      let label = ['account','item','description'].map(key => row[key]).find(item => item != null && item !== '' && item !== '入力' && item !== '—') || Object.values(row).find(item => item !== '入力' && item !== '—') || question.category;
      if (label === id || /^(?:value|field|row)\d+$/.test(String(label))) label = `${question.category} ${index + 1}番目の記入欄`;
      return { label:String(label), column };
    }
    return { label:question.category, column:'金額' };
  }
  function cellSemanticType(question, id) {
    // Some legacy generic value fields label a price as an amount. Resolve the
    // displayed meaning without changing the input schema or grading contract.
    const meta = question.table?.inputMetadata?.[id];
    if (/単価/.test(meta?.label || '')) return 'unitPrice';
    return meta?.semanticType || question.table?.inputTypes?.[id] || 'text';
  }
  function formatValue(value, semanticType = 'amount') {
    const units = {amount:'円', unitPrice:'円／個', quantity:'個', years:'年', life:'年', months:'か月'};
    if (typeof value !== 'number' || !Number.isFinite(value)) return String(value ?? '');
    return yen(value) + (units[semanticType] || '');
  }
  const humanLabel = (question, id) => { const info = cellInfo(question, id); const label = cellSemanticType(question, id) === 'unitPrice' ? info.label.replace(/の金額/u, '') : info.label; return `${label}／${info.column}`; };
  function derivation(question, id, expected, actual) {
    if (question.id === 'D019' && ['insurance','prepaid'].includes(id)) return '整理前の保険料200,000円のうち翌期分40,000円は当期費用ではありません。保険料は200,000－40,000＝160,000円、前払保険料は40,000円です。';
    if (question.id === 'D020' && id === 'profit') return '損益勘定では、売上800,000円－（仕入400,000円＋保険料160,000円＋減価償却費60,000円）＝当期純利益180,000円です。';
    if (question.type === 'financial_statement' && /income|profit/i.test(id)) return `当期純利益は収益から売上原価と費用を控除して求めます。${context(question)}`;
    // A coincidental subset sum of numbers in the prompt is not a derivation.
    // The structured explanation supplies the transaction-specific formulas.
    return context(question);
  }
  // Shared by diagnostics and the legacy explanation path. A ledger is not
  // necessarily a cashbook; explicit formats take precedence over old categories.
  function ledgerGuidance(question) {
    const format = question.format || '', category = String(question.category || '');
    if (format === 'bookkeeping-account-rule') return ['資産の増加は借方、減少は貸方に記録します。','負債の増加は貸方、減少は借方に記録します。','借方合計と貸方合計の一致を確認します。'];
    if (format === 'bookkeeping-account-ledger' && /支払利息/u.test(category)) return ['前期末の見越し、当期首の再振替、当期の支払、当期末の未払計上を時系列に並べます。','元本・年利率・対象月数から各期間の利息を求め、費用と未払額を区別して借方・貸方へ記入します。','費用勘定の当期額を損益へ振り替え、次期繰越をゼロにします。未払利息は負債として次期へ繰り越します。'];
    if (format === 'bookkeeping-general-ledger' || format === 'bookkeeping-account-ledger' || (!format && /総勘定元帳|売掛金元帳|買掛金元帳/u.test(category))) return ['仕訳の日付・相手勘定・金額を、その勘定の借方または貸方へ転記します。','資産の増加は借方、負債の増加は貸方で、減少はそれぞれ反対側です。期首残高に増加を加え、減少を差し引き、残高方向も確認します。'];
    if (format === 'bookkeeping-petty-cash-book') return ['支払報告の摘要を読み、支払を対応する費用科目へ分類して科目別に合計します。','定額資金前渡法では、報告された支払額と同額を補給する条件を確認し、その合計を補給額にします。'];
    if (format === 'bookkeeping-purchase-book') return ['仕入と仕入返品を分けて仕入帳へ記帳し、総仕入高から返品額を差し引いて純仕入高を求めます。'];
    if (format === 'bookkeeping-sales-book') return ['売上と売上返品を分けて売上帳へ記帳し、総売上高から返品額を差し引いて純売上高を求めます。'];
    if (format === 'fixed-asset-ledger' || (!format && /固定資産台帳/u.test(category))) return ['取得原価・残存価額・耐用年数・償却方法・使用月数を資料から確認します。','指定された償却方法で、売却時や決算時など問題で指定された時点までの減価償却費を求め、期首の累計額に加えます。','取得原価からその時点の減価償却累計額を差し引いて帳簿価額を求めます。売却損益を求める場合は、売却時の帳簿価額と売却価額を比べます。'];
    if (format === 'bookkeeping-voucher-entry') return ['現金が増える取引は入金伝票、現金が減る取引は出金伝票、現金が動かない取引は振替伝票を選びます。','取引内容と金額を資料に照らして記入します。'];
    if (format === 'bookkeeping-cash-book' || (!format && /現金出納帳/u.test(category))) return ['証憑を日付順に転記し、入金は加算、出金は減算して直前残高から更新します。','日付・摘要・残高を資料と照合します。'];
    if (format === 'bookkeeping-checking-book') return ['当座預金の預入と引出を分け、預入を加え、引出を差し引いて残高をつなげます。'];
    if (format === 'bookkeeping-inventory-ledger' || (!format && /商品有高帳/u.test(category))) return ['数量と単価を区別し、指定された払出単価の計算方法で払出額と残高額を求めます。'];
    if (format === 'journal-book' || (!format && /仕訳帳/u.test(category))) return ['取引の勘定科目と貸借を決め、日付順に仕訳帳へ記入します。','元丁は転記先の総勘定元帳を示す番号として確認します。'];
    if (format === 'bookkeeping-notes-receivable') return ['約束手形の受取を記帳対象に選び、振出人・金額・満期日を資料と照合します。'];
    if (format === 'bookkeeping-notes-payable') return ['自店が振り出した約束手形を記帳対象に選び、金額・満期日を資料と照合します。'];
    return ['求められている記入欄の意味を確認し、その帳簿の対象となる取引・勘定科目・金額を資料と照合します。'];
  }
  const typeRule = question => ({
    ledger:ledgerGuidance(question).join(''),
    trial_balance:'各勘定残高を借方・貸方の正しい列へ一度だけ集計し、両側の合計一致で検算します。',
    correction:'元の誤仕訳を逆仕訳で取り消し、正しい仕訳を加えた差額が訂正仕訳です。科目と貸借をこの順で確認します。',
    worksheet:question.format === 'adjusted-trial-balance' ? '整理事項を反映した各勘定残高を、試算表の借方・貸方へ一度ずつ集計します。' : question.format === 'closing-entries' ? '収益・費用を損益へ振り替えて締め切り、当期純利益を繰越利益剰余金へ移します。' : /決算整理・計算問題/.test(question.category) ? '保険料の当期分・次期分を分け、備品は償却条件から減価償却費と帳簿価額を求めます。' : '整理前残高に決算整理仕訳を反映し、損益計算書と貸借対照表へ勘定の性質ごとに振り分けます。',
    financial_statement:'収益－売上原価－費用で利益を計算し、資産・負債・純資産は貸借対照表へ分類します。',
    comprehensive:'資料ごとに仕訳し、転記、集計、決算整理の順に処理して各段階の貸借一致を確認します。'
  }[question.type] || '資料、会計ルール、計算式、転記先の順に確認します。');
  function diagnoseTable(question, answer) {
    return Object.entries(question.answer.cells).filter(([id, expected]) => !sameValue(answer?.cells?.[id], expected)).map(([id, expected], index) => {
      const actual = answer?.cells?.[id]; const normalized = normalize(actual); const numeric = normalized !== '' && Number.isFinite(Number(normalized)); const semanticType = cellSemanticType(question, id); const shown = actual == null || String(actual).trim() === '' ? '未入力' : (typeof expected === 'number' ? (numeric ? formatValue(Number(normalized), semanticType) : `入力値「${String(actual)}」`) : `「${actual}」`); const label = humanLabel(question, id); const correct = typeof expected === 'number' ? formatValue(expected, semanticType) : `「${expected}」`;
      const rule = question.type === 'ledger' && index > 0 ? '' : typeRule(question);
      return entry('cell', `${label}を見直します`, `${label}は${shown}ではなく${correct}です。${rule}`, derivation(question, id, expected, shown), `「${label}」の意味を確認し、根拠となる資料と計算式を照合して${correct}を記入します。`, `${question.type}:${label}`);
    });
  }
  function diagnoseWrongAnswer(question, answer, score) {
    if (!question || score?.correct) return [];
    const diagnostics = question.type === 'journal' ? diagnoseJournal(question, answer || {}) : question.type === 'correction' ? diagnoseCorrection(question, answer || {}) : diagnoseTable(question, answer || {});
    return diagnostics.length ? diagnostics : [entry('general', '正解との差を確認します', '入力した科目・金額・位置の組合せが会計処理と一致していません。', context(question), typeRule(question))];
  }
  return Object.freeze({ diagnoseWrongAnswer, MISCONCEPTIONS, humanLabel, ledgerGuidance, transactionReason, cellSemanticType, formatValue });
});
