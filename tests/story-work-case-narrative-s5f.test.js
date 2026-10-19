'use strict';

const assert=require('assert');
const fs=require('fs');
const vm=require('vm');

const source=fs.readFileSync('data/questions.js','utf8');
const sandbox={window:{},console};
vm.createContext(sandbox);
vm.runInContext(source,sandbox,{filename:'data/questions.js'});

const questions=sandbox.window.QuestionData;
const examIds=new Set(sandbox.window.ExamPoolDefinition||[]);
const anchors=sandbox.window.AnchorScenes||[];
const authority=sandbox.window.WorkCaseNarratives;
const acceptedS5E=require('./fixtures/story-work-case-s5e-accepted.json');

const s5fIds=['J150','F004','F006','F007','C004'].sort();
const allExpected=[...Object.keys(acceptedS5E),...s5fIds].sort();

assert(authority,'S5F WorkCaseNarratives authority must be exported');
assert(Object.isFrozen(authority),'S5F WorkCaseNarratives authority must remain immutable');
assert.strictEqual(Object.keys(acceptedS5E).length,126,'S5E accepted snapshot must remain exactly 126 entries');
assert.strictEqual(s5fIds.length,5,'S5F locked population must remain exactly 5');
assert.strictEqual(allExpected.length,131,'S5F total authority must be exactly 131 entries');

assert.deepStrictEqual(
  Object.keys(authority).sort(),
  allExpected,
  'S5F must extend WorkCaseNarratives from exactly 126 accepted entries to exactly 131 entries'
);

const j148SuccessorBefore='年度決算の予行演習中、得意先から商品販売の証憑と約束手形の記録が届きました。あなたは、販売の成立と代金を受け取る権利を分けて確認します。';
for(const [id,before] of Object.entries(acceptedS5E)){
  assert.strictEqual(
    authority[id]?.before,
    id==='J148' ? j148SuccessorBefore : before,
    `${id}: S5F must preserve S5E history except J148 successor`
  );
}

const anchorRefs=new Set(anchors.map(scene=>scene.referenceQuestionId));
for(const id of ['J050','F005','C005']){
  assert(anchorRefs.has(id),`${id}: S5F must recognize the locked Chapter 12 Anchor reference`);
  assert(!s5fIds.includes(id),`${id}: S5F must exclude Anchor authority`);
}

const story=Object.values(questions).filter(question=>
  question.learningRole!=='review'&&!examIds.has(question.id)
);
assert.strictEqual(story.length,166,'S5F must preserve accepted Story population');
assert.strictEqual(anchors.length,36,'S5F must preserve accepted 36 AnchorScenes');

const expectedTypes={
  J150:'journal',
  F004:'financial_statement',
  F006:'financial_statement',
  F007:'financial_statement',
  C004:'comprehensive'
};

const beforeTexts=[];
for(const id of s5fIds){
  const question=questions[id];
  const entry=authority[id];

  assert(question,`${id}: S5F target question must exist`);
  assert.strictEqual(question.type,expectedTypes[id],`${id}: question type must remain locked`);
  assert.strictEqual(question.chapter,12,`${id}: target must remain in Chapter 12`);
  assert(!anchorRefs.has(id),`${id}: S5F must not overwrite Anchor authority`);
  assert(question.learningRole!=='review',`${id}: target must remain outside Review`);
  assert(!examIds.has(id),`${id}: target must remain outside Exam`);
  assert(entry,`${id}: authored Before entry must exist`);
  assert.deepStrictEqual(Object.keys(entry),['before'],`${id}: S5F must remain Before-only`);

  const before=String(entry.before||'').trim();
  assert(before.length>0,`${id}: authored Before must be non-empty`);
  assert(before.length<=120,`${id}: authored Before must stay within the 120-character mobile reading bound`);
  assert(!/[0-9０-９]/u.test(before),`${id}: authored Before must not reveal numeric values`);
  assert(!/[円￥¥]/u.test(before),`${id}: authored Before must not reveal currency/amounts`);
  assert(!/借方|貸方/u.test(before),`${id}: authored Before must not coach debit/credit direction`);
  assert(/(?:あなた|自分で)/u.test(before),`${id}: Before must keep protagonist viewpoint`);
  assert(/(?:確認|確かめ|照合|比べ|見極め|追う|整理|点検|分け)/u.test(before),`${id}: Before must contain an explicit reader action`);
  assert(String(question.story||'').startsWith(before),`${id}: runtime Story must start with authored Before`);
  assert(String(question.story||'').includes('〔調査 '),`${id}: runtime Story must preserve Story progress context`);

  if(id==='J150'){
    const answerAccounts=[
      ...(question.answer?.debit||[]).map(line=>line&&line.account),
      ...(question.answer?.credit||[]).map(line=>line&&line.account)
    ].filter(Boolean);
    for(const account of new Set(answerAccounts)){
      assert(!before.includes(account),`${id}: Before must not leak correct account name "${account}"`);
    }
  }

  beforeTexts.push(before);
}

assert.strictEqual(
  new Set(beforeTexts).size,
  s5fIds.length,
  'S5F must provide 5 substantively unique authored Before strings'
);

// Case-grounding contracts for the final five Chapter 12 work cases.
assert(
  /(?:満期|取立|回収|受取側)/u.test(authority.J150.before) &&
  /(?:支払|決済|支払側)/u.test(authority.J150.before),
  'J150: must distinguish maturity collection and payment flows without leaking answer accounts'
);
assert(
  /資産/u.test(authority.F004.before) && /(?:負債|純資産)/u.test(authority.F004.before),
  'F004: must stay grounded in the displayed asset / liability / equity statement structure'
);
assert(
  /(?:保険|保険料)/u.test(authority.F006.before) &&
  /家賃/u.test(authority.F006.before) &&
  /(?:資産|負債|純資産)/u.test(authority.F006.before),
  'F006: must stay grounded in the statement containing prepaid insurance and advance rent'
);
assert(
  /資産/u.test(authority.F007.before) && /(?:負債|純資産)/u.test(authority.F007.before),
  'F007: must stay grounded in its asset / liability / equity statement structure'
);
assert(
  /(?:資料|取引)/u.test(authority.C004.before) &&
  /(?:現金|資金)/u.test(authority.C004.before) &&
  /(?:利益|損益|収益|費用)/u.test(authority.C004.before),
  'C004: must distinguish cash movement from profit determination using multiple transaction records'
);

console.log('ISSUE179_S5F_WORK_CASE_NARRATIVE_PASS');
