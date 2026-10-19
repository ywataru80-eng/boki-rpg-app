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
const acceptedS5D2=require('./fixtures/story-work-case-s5d2-accepted.json');
const acceptedS5E=require('./fixtures/story-work-case-s5e-accepted.json');

const s5eIds=[
  'J043',
  'J046','J047','J048','J148',
  'D001','D002','D003','D005','D006','D007','D008','D009','D010','D011'
].sort();
const allExpected=[...Object.keys(acceptedS5D2),...s5eIds].sort();

assert(authority,'S5E WorkCaseNarratives authority must be exported');
assert(Object.isFrozen(authority),'S5E WorkCaseNarratives authority must remain immutable');
assert.strictEqual(Object.keys(acceptedS5D2).length,111,'S5D2 accepted snapshot must remain exactly 111 entries');
assert.strictEqual(s5eIds.length,15,'S5E locked population must remain exactly 15');
assert.strictEqual(allExpected.length,126,'S5E total authority must be exactly 126 entries');

assert.deepStrictEqual(
  Object.keys(acceptedS5E).sort(),
  allExpected,
  'S5E accepted snapshot must cover exactly the 126 locked entries'
);
const j148SuccessorBefore='年度決算の予行演習中、得意先から商品販売の証憑と約束手形の記録が届きました。あなたは、販売の成立と代金を受け取る権利を分けて確認します。';
for(const [id,before] of Object.entries(acceptedS5E)){
  assert(authority[id], `${id}: accepted S5E authority entry must remain present during later S5 batches`);
  assert.strictEqual(
    authority[id].before,
    id==='J148' ? j148SuccessorBefore : before,
    `${id}: accepted S5E Before must preserve history except J148 successor`
  );
}

const anchorRefs=new Set(anchors.map(scene=>scene.referenceQuestionId));
for(const id of ['J041','J042','J044','J045','D004','D012']){
  assert(anchorRefs.has(id),`${id}: S5E must recognize the locked Chapter 9-10 Anchor reference`);
  assert(!s5eIds.includes(id),`${id}: S5E must exclude Anchor authority`);
}

const story=Object.values(questions).filter(question=>
  question.learningRole!=='review'&&!examIds.has(question.id)
);
assert.strictEqual(story.length,166,'S5E must preserve accepted Story population');
assert.strictEqual(anchors.length,36,'S5E must preserve accepted 36 AnchorScenes');

const expectedTypes={
  J043:'journal',J046:'journal',J047:'journal',J048:'journal',J148:'journal',
  D001:'worksheet',D002:'worksheet',D003:'worksheet',D005:'worksheet',D006:'worksheet',
  D007:'worksheet',D008:'worksheet',D009:'worksheet',D010:'worksheet',D011:'worksheet'
};

const beforeTexts=[];
for(const id of s5eIds){
  const question=questions[id];
  const entry=authority[id];

  assert(question,`${id}: S5E target question must exist`);
  assert.strictEqual(question.type,expectedTypes[id],`${id}: question type must remain locked`);
  assert([9,10].includes(question.chapter),`${id}: chapter must remain 9 or 10`);
  assert(!anchorRefs.has(id),`${id}: S5E must not overwrite Anchor authority`);
  assert(question.learningRole!=='review',`${id}: target must remain outside Review`);
  assert(!examIds.has(id),`${id}: target must remain outside Exam`);
  assert(entry,`${id}: authored Before entry must exist`);
  assert.deepStrictEqual(Object.keys(entry),['before'],`${id}: S5E must remain Before-only`);

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

  const answer=question.answer||{};
  const answerAccounts=[
    ...(answer.debit||[]).map(line=>line&&line.account),
    ...(answer.credit||[]).map(line=>line&&line.account),
    ...Object.entries(answer.cells||{})
      .filter(([key])=>/Account$/u.test(key))
      .map(([,value])=>value)
  ].filter(Boolean);
  for(const account of new Set(answerAccounts)){
    assert(!before.includes(account),`${id}: Before must not leak correct account name "${account}"`);
  }

  beforeTexts.push(before);
}

assert.strictEqual(
  new Set(beforeTexts).size,
  s5eIds.length,
  'S5E must provide 15 substantively unique authored Before strings'
);

// Case-grounding contracts.
assert(/(?:家賃|期間|次期|繰延|契約)/u.test(authority.J043.before),'J043: must stay grounded in rent period allocation');
assert(/(?:回収不能|債権|前期|回収)/u.test(authority.J046.before),'J046: must stay grounded in the bad-debt evidence');
assert(/(?:備品|使用期間|耐用|償却)/u.test(authority.J047.before),'J047: must stay grounded in fixed-asset use/depreciation evidence');
assert(/(?:棚卸|商品|期首|期末|在庫|売上原価)/u.test(authority.J048.before),
  'J048: must stay grounded in inventory / cost-of-sales closing evidence');
assert(/商品販売/u.test(authority.J148.before) && /約束手形/u.test(authority.J148.before),
  'J148: must describe a goods sale settled by promissory note');
assert(!/(?:棚卸|売上原価|受取手形)/u.test(authority.J148.before),
  'J148: must not describe inventory closing or disclose the correct account');
assert(/約束手形/u.test(questions.J148.question) && /売り上げ/u.test(questions.J148.question),
  'J148: story contract must match the actual question');

for(const id of ['D001','D002','D003','D005','D006','D007','D008','D009','D010','D011']){
  assert(
    /(?:保険|期間|次期|備品|使用|償却|帳簿価額|決算)/u.test(authority[id].before),
    `${id}: worksheet Before must be grounded in insurance period allocation and/or fixed-asset evaluation`
  );
}

console.log('ISSUE179_S5E_WORK_CASE_NARRATIVE_PASS');
