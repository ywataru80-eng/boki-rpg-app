'use strict';

const { loadQuestions } = require('./audit-matrix');

const BLACKLIST = ['問題文の数字と条件に印を付け','確定した金額と次の資料を照合します','元帳は、仕訳を勘定科目ごとに','だから答えが確定します','章・調査'];
const HEADING = /【([^】]+)】/gu;
const normalize = value => String(value ?? '').replace(/[\s,，円]/gu, '');
const visibleLength = value => [...String(value ?? '').replace(/\s+/gu, '').replace(HEADING, '')].length;
const semanticTypeForAudit = label => {
  // The answer noun controls the value's unit; parenthetical source context
  // such as "（6か月）の金額" does not turn a yen answer into a month count.
  if (/単価/u.test(label)) return 'unitPrice';
  if (/金額|償却費|帳簿価額|売却損益?/u.test(label)) return 'amount';
  if (/元丁/u.test(label)) return 'folio'; if (/数量|個数/u.test(label)) return 'quantity';
  if (/耐用年数|年数/u.test(label)) return 'years'; if (/月数|か月/u.test(label)) return 'months';
  if (/率|％|%/u.test(label)) return 'rate'; if (/件数/u.test(label)) return 'count';
  return null;
};
const significantTokens = question => {
  const source = `${question.category || ''}${question.question || ''}${JSON.stringify(question.materials || [])}${JSON.stringify(question.table?.rows || [])}`;
  return [...new Set([...(source.match(/[0-9０-９][0-9０-９,，.]*/gu) || []), ...(source.match(/[一-龠々ァ-ヶー]{2,}/gu) || []), question.category].filter(Boolean))];
};
const sourceCopies = question => [question.question, ...(question.materials || []).flatMap(row => Object.values(row))].map(normalize).filter(value => value.length >= 8);
const specificLength = question => String(question.explanation || '').split(/(?<=[。！？\n])/u)
  .filter(sentence => !sourceCopies(question).some(source => normalize(sentence) === source))
  .filter(sentence => significantTokens(question).some(token => normalize(sentence).includes(normalize(token))))
  .reduce((sum, sentence) => sum + visibleLength(sentence), 0);
const duplicateHeadings = explanation => {
  const headings = [...String(explanation || '').matchAll(HEADING)].map(match => match[1]);
  return [...new Set(headings.filter((heading, index) => headings.indexOf(heading) !== index))];
};
const duplicatePhrases = questions => {
  const owners = new Map(); const duplicates = [];
  for (const question of questions) for (const unit of new Set(String(question.explanation || '').split(/[。！？\n]/u).map(value => value.trim()).filter(unit => [...unit].length >= 45))) {
    const key = normalize(unit); const prior = owners.get(key);
    if (prior && prior !== question.id) duplicates.push({ phrase:unit, ids:[prior, question.id] }); else owners.set(key, question.id);
  }
  return duplicates;
};
const answerRows = question => [...(question.answer?.debit || []), ...(question.answer?.credit || [])];
const includesAmount = (text, amount) => normalize(text).includes(normalize(amount));
const explanationSentences = question => String(question.explanation || '').split(/(?<=[。！？\n])/u);
const accountReasonPresent = (question, side, row) => explanationSentences(question).some(sentence => sentence.includes(row.account) && sentence.includes(side) && /(増加|減少)/u.test(sentence) && /(資産|負債|純資産|収益|費用|資産の控除|勘定)/u.test(sentence));
const journalIssues = question => {
  const text = String(question.explanation || ''); const issues = [];
  for (const row of answerRows(question)) {
    if (!text.includes(row.account)) issues.push(`正答科目「${row.account}」がない`);
    if (!includesAmount(text, row.amount)) issues.push(`正答金額「${row.amount}」がない`);
  }
  for (const [key, label] of [['debit','借方'],['credit','貸方']]) for (const row of question.answer?.[key] || []) {
    if (!accountReasonPresent(question, label, row)) issues.push(`${label}の理由が「${row.account}」と結び付いていない`);
    const finalSection = text.split('【この問題の仕訳】')[1] || '';
    if (!finalSection.includes(row.account) || !includesAmount(finalSection, row.amount)) issues.push(`最終仕訳に「${row.account} ${row.amount}」がない`);
  }
  if (/(クレジット|貸倒引当金|減価償却$|消費税|固定資産売却|未収入金)/u.test(question.category) && !/【金額の計算】.*(?:×|÷|－).*＝/su.test(text)) issues.push('問題固有の計算式がない');
  return issues;
};
const tableIssues = question => {
  const text = String(question.explanation || ''); const issues = [];
  for (const [key, value] of Object.entries(question.answer?.cells || {})) {
    if (!includesAmount(text, value)) issues.push(`回答「${key}=${value}」がない`);
  }
  // Account-entry concepts have no opening/closing balance to calculate.
  // Require the complete semantic contract instead of exempting them from audit.
  if (question.format === 'bookkeeping-account-rule') {
    const expected = [
      ['assetIncreaseSide','資産の増加を記入する側','借方'],
      ['assetDecreaseSide','資産の減少を記入する側','貸方'],
      ['liabilityIncreaseSide','負債の増加を記入する側','貸方'],
      ['liabilityDecreaseSide','負債の減少を記入する側','借方'],
      ['balancePrinciple','貸借平均の原理：借方合計と貸方合計','一致']
    ];
    if (question.type !== 'ledger' || JSON.stringify(question.table?.inputCells) !== JSON.stringify(expected.map(([key]) => key))) issues.push('勘定記入法則の5項目が揃っていない');
    for (const [key, label, value] of expected) {
      if (!question.table?.rows?.some(row => row.item === label)) issues.push(`勘定記入法則の確認事項「${label}」がない`);
      if (question.answer?.cells?.[key] !== value) issues.push(`勘定記入法則の正答「${label}＝${value}」と不一致`);
      if (!text.includes(`${label}＝${value}`)) issues.push(`解答確認に「${label}＝${value}」がない`);
    }
    if (!['勘定記入法則','資産','負債','増減','貸借平均','借方合計','貸方合計'].every(term => String(question.question || '').includes(term))) issues.push('問題文に勘定記入法則の根拠がない');
    if (!['【使用する資料】','【判断の順序】','【解答確認】','【検算】'].every(heading => text.includes(heading))) issues.push('資料から判断・解答確認・検算へ進む説明構造がない');
    const reasoning = (text.split('【判断の順序】')[1] || '').split('【解答確認】')[0];
    if (!/資産は増加を借方[・、]減少を貸方/u.test(reasoning)) issues.push('資産の増減と借方・貸方の説明が不一致');
    if (!/負債は増加を貸方[・、]減少を借方/u.test(reasoning)) issues.push('負債の増減と借方・貸方の説明が不一致');
    if (!/一つの取引[^。]*借方[^。]*貸方[^。]*同額/u.test(reasoning) || !/借方合計と貸方合計は(?:必ず)?一致/u.test(reasoning)) issues.push('同額記録から貸借一致に至る根拠がない');
    return issues;
  }
  if (!text.includes('【使用する資料】') || !text.includes('【計算と転記】')) issues.push('資料から計算へ進む説明構造がない');
  if (question.type === 'ledger') {
    const special = /(手形記入帳|商品有高帳|固定資産台帳|仕訳帳|伝票|仕入帳|売上帳)/u.test(question.category);
    if (!special && !/(前残|期首|元データ).*(増加|加え|足し).*(減少|引い|差し引)/su.test(text)) issues.push('期首＋増加－減少の残高計算がない');
    if (/(受取|支払)手形記入帳/u.test(question.category) && !/(約束手形).*(対象外|除).*(満期日)/su.test(text)) issues.push('手形資料の選別と満期日の転記説明がない');
  }
  if (question.type === 'trial_balance') {
    const rows = question.table?.rows || [];
    for (const side of ['debit','credit']) for (const row of rows.filter(row => typeof row[side] === 'number' && row.account !== '合計')) {
      if (!text.includes(row.account) || !includesAmount(text, row[side])) issues.push(`${side === 'debit' ? '借方' : '貸方'}構成「${row.account} ${row[side]}」がない`);
    }
    if (!/(借方：).*＋.*＝.*(貸方：).*＋.*＝/su.test(text)) issues.push('借方・貸方の実数加算式がない');
    if (!/借方合計.*貸方合計.*一致/su.test(text)) issues.push('貸借一致の検算がない');
  }
  if (question.type === 'worksheet') {
    // An 8-column worksheet, a four-value adjustment exercise, a post-adjustment
    // trial balance and closing entries are DIFFERENT operations. Do not demand
    // the worksheet's PL/BS transfer steps in exercises that do not ask for them.
    if (question.category === '帳簿締切') {
      if (!/売上.*損益.*貸方/su.test(text)) issues.push('売上を損益の貸方へ振り替える説明がない');
      if (!/(?:仕入|費用).*損益.*借方/su.test(text)) issues.push('費用を損益の借方へ振り替える説明がない');
      if (!/損益.*繰越利益剰余金/su.test(text)) issues.push('当期純利益の振替先の説明がない');
      if (!/損益勘定.*残高.*ゼロ/su.test(text)) issues.push('損益勘定の締切後残高を検算していない');
    } else if (!/(整理前|元データ).*(調整|決算整理).*(整理後|最終値)/su.test(text)) {
      issues.push('整理前→調整→整理後の経路がない');
    }
    if (question.category !== '8欄精算表（8桁精算表）' && /整理後残高を損益計算書または貸借対照表へ振り分けます/u.test(text)) {
      issues.push('設問で要求しない精算表への振分けを指示している');
    }
  }
  if (question.format === 'balance-sheet') {
    const fixed = question.table.rows.filter(row => ['資産','負債','純資産'].includes(row.section) && row.amount !== '入力');
    for (const row of fixed) if (!text.includes(row.account) || !includesAmount(text, row.amount)) issues.push(`貸借対照表の根拠「${row.account} ${row.amount}」がない`);
    if (!/(資産＝負債＋純資産|資産.*負債.*純資産)/su.test(text)) issues.push('貸借対照表等式の説明がない');
  }
  return issues;
};

const auditExplanations = questionMap => {
  const questions = Object.values(questionMap); const ids = new Set();
  const result = { total:questions.length, duplicateIds:[], missingAnswerOrExplanation:[], nullishAnomalies:[], blacklistedPhrases:[], semanticErrors:[], duplicateHeadings:[], duplicateExplanations:[], lengthViolations:[], insufficientSpecificText:[], journalQuality:[], tableQuality:[], ledgerMismatch:[], duplicatePhrases:[] };
  for (const question of questions) {
    if (!question.id || ids.has(question.id)) result.duplicateIds.push(question.id || '(missing)'); ids.add(question.id);
    if (!question.answer || !normalize(question.explanation)) result.missingAnswerOrExplanation.push(question.id);
    if (/\b(?:undefined|null)\b/u.test(`${question.id}${question.question}${question.explanation}`)) result.nullishAnomalies.push(question.id);
    for (const phrase of BLACKLIST) if (String(question.explanation).includes(phrase)) result.blacklistedPhrases.push({ id:question.id, phrase });
    const text = String(question.explanation || '');
    if (/(?:^|[^A-Za-z])(?:item|recorded|evidence|transaction|account|debit|credit|balance|tbDebit|tbCredit|before)\d*(?=[^A-Za-z]|$)/u.test(text)) result.semanticErrors.push({id:question.id, issue:'内部schemaキーが利用者向け解説に露出'});
    for (const phrase of ['unitPrice','currentDepreciation','closingBookValue']) if (text.includes(phrase)) result.semanticErrors.push({id:question.id, issue:`内部ID ${phrase}`});
    if (/損益は純資産|現金過不足は(?:資産|負債)/u.test(text)) result.semanticErrors.push({id:question.id, issue:'特殊勘定の固定分類'});
    if (/(?:数量|quantity)[0-9,]+円|(?:耐用年数|life)[0-9,]+円|元丁[0-9,]+円/u.test(text)) result.semanticErrors.push({id:question.id, issue:'意味型と単位が不一致'});
    for (const metadata of Object.values(question.table?.inputMetadata || {})) {
      const expected = semanticTypeForAudit(metadata.label);
      if (expected && metadata.semanticType !== expected) result.semanticErrors.push({id:question.id, issue:`${metadata.label}:${metadata.semanticType}→${expected}`});
    }
    const repeated = duplicateHeadings(question.explanation); if (repeated.length) result.duplicateHeadings.push({ id:question.id, headings:repeated });
    const length = visibleLength(question.explanation); if (length < 150 || length > 5000) result.lengthViolations.push({ id:question.id, length });
    const specific = specificLength(question); if (specific < 100) result.insufficientSpecificText.push({ id:question.id, specific });
    const issues = question.type === 'journal' ? journalIssues(question) : tableIssues(question); if (issues.length) result[question.type === 'journal' ? 'journalQuality' : 'tableQuality'].push({ id:question.id, issues });
    if (question.type === 'ledger' && String(question.explanation).includes('元帳は、仕訳を勘定科目ごとに')) result.ledgerMismatch.push(question.id);
  }
  result.duplicatePhrases = duplicatePhrases(questions);
  const explanationOwners = new Map();
  for (const question of questions) { const key = normalize(question.explanation); const prior = explanationOwners.get(key); if (prior) result.duplicateExplanations.push({ ids:[prior, question.id] }); else explanationOwners.set(key, question.id); }
  result.ok = ['duplicateIds','missingAnswerOrExplanation','nullishAnomalies','blacklistedPhrases','semanticErrors','duplicateHeadings','duplicateExplanations','lengthViolations','insufficientSpecificText','journalQuality','tableQuality','ledgerMismatch'].every(key => result[key].length === 0);
  return result;
};

if (require.main === module) {
  const result = auditExplanations(loadQuestions());
  const output = { ...result, duplicatePhrases:{ count:result.duplicatePhrases.length, samples:result.duplicatePhrases.slice(0, 5) } };
  console.log(JSON.stringify(output, null, 2)); if (!result.ok) process.exitCode = 1;
}
module.exports = { auditExplanations, visibleLength, specificLength, journalIssues, tableIssues };
