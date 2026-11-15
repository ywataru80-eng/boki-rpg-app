'use strict';
// Independently transcribed, immutable source figures for the 17 Release236
// assessment identities. No imports from runtime question answers or formulas.
// The 235 expected-answers golden remains a separate historical authority.
const SPECS=Object.freeze({
  D002:[126000,4,252000,4,null,['insurance_adjustment','insurance_expense_after','depreciation_expense','equipment_book_value_after']],
  D003:[129000,4,null,null,null,['insurance_adjustment','debitAccount']],
  D004:[132000,4,null,null,null,['insurance_expense_after']],
  D005:[135000,4,null,null,34750,['insurance_adjustment','overstatement']],
  D006:[null,null,276000,5,null,['depreciation_expense']],
  D007:[null,null,282000,5,null,['equipment_book_value_after','contraAccount']],
  D008:[null,null,288000,5,null,['depreciation_expense','equipment_book_value_after']],
  D009:[147000,3,null,null,null,['debitAccount','creditAccount','insurance_adjustment']],
  D010:[null,null,300000,5,240500,['equipment_book_value_after','overstatement']],
  D011:[153000,6,306000,6,null,['insurance_adjustment','depreciation_expense']],
  D012:[156000,6,312000,6,null,['insurance_expense_after','equipment_book_value_after']],
  D013:[159000,6,null,null,null,['insurance_adjustment','insurance_expense_after']],
  D014:[null,null,324000,6,null,['depreciation_expense','equipment_book_value_after']],
  D015:[165000,6,330000,6,null,['insurance_adjustment','insurance_expense_after','depreciation_expense']],
  D016:[168000,5,336000,3,null,['insurance_expense_after','depreciation_expense']],
  D017:[null,null,342000,3,null,['depreciation_expense','equipment_book_value_after']],
  D018:[174000,5,348000,3,null,['insurance_adjustment','insurance_expense_after','depreciation_expense','equipment_book_value_after']]
});
function expectedFor(id){
  if(!Object.hasOwn(SPECS,id))return null;
  const [paid,portion,acquisition,life,recorded,fields]=SPECS[id];
  if(paid!==null&&(!Number.isSafeInteger(paid)||!Number.isSafeInteger(portion)||portion<=0||paid%portion))throw new Error(id+': invalid independent insurance source');
  if(acquisition!==null&&(!Number.isSafeInteger(acquisition)||!Number.isSafeInteger(life)||life<=0||acquisition%life))throw new Error(id+': invalid independent asset source');
  const prepaid=paid===null?null:paid/portion,depreciation=acquisition===null?null:acquisition/life,book=acquisition===null?null:acquisition-depreciation;
  const values={insurance_adjustment:prepaid,insurance_expense_after:paid===null?null:paid-prepaid,depreciation_expense:depreciation,equipment_book_value_after:book,debitAccount:'前払保険料',creditAccount:'保険料',contraAccount:'減価償却累計額',overstatement:recorded===null?null:recorded-(paid!==null?prepaid:book)};
  const cells={};
  for(const field of fields){
    const value=values[field];
    if(value===null||value===undefined||typeof value==='number'&&!Number.isSafeInteger(value))throw new Error(id+': unavailable oracle source '+field);
    cells[field]=value;
  }
  return {cells};
}
module.exports={SPECS,expectedFor};
