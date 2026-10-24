(function (root) {
  'use strict';
  const groups = {
    asset: ['現金','普通預金','当座預金','売掛金','受取手形','繰越商品','備品','電子記録債権','クレジット売掛金','未収入金','前払金','小口現金','仮払金','立替金','仮払消費税','前払保険料','受取商品券','差入保証金','未収利息','貯蔵品','貸付金'],
    contraAsset: ['貸倒引当金','減価償却累計額','備品減価償却累計額'],
    liability: ['買掛金','支払手形','借入金','当座借越','電子記録債務','未払金','未払配当金','前受金','所得税預り金','社会保険料預り金','仮受消費税','仮受金','前受家賃','未払利息','未払法人税等','未払消費税'],
    equity: ['資本金','利益準備金','繰越利益剰余金'], revenue: ['売上','受取利息','受取家賃','固定資産売却益','償却債権取立益','雑益'],
    expense: ['仕入','発送費','消耗品費','減価償却費','固定資産売却損','支払手数料','通信費','水道光熱費','旅費交通費','支払利息','給料','法定福利費','租税公課','貸倒引当金繰入','保険料','広告宣伝費','支払家賃','法人税、住民税及び事業税','雑損'],
    temporary: ['現金過不足'], closing: ['損益']
  };
  const accountTypes = Object.freeze(Object.fromEntries(Object.entries(groups).map(([key, names]) => [key, new Set(names)])));
  const typeLabels = Object.freeze({ asset:'資産', contraAsset:'資産の控除', liability:'負債', equity:'純資産', expense:'費用', revenue:'収益', temporary:'仮勘定', closing:'決算勘定' });
  const accountType = account => Object.entries(accountTypes).find(([, names]) => names.has(account))?.[0] || 'unknown';
  root.AccountingDomain = Object.freeze({ accountTypes, typeLabels, accountType });
})(typeof window !== 'undefined' ? window : globalThis);
