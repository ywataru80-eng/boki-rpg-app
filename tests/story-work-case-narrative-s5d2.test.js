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
const acceptedS5D1=require('./fixtures/story-work-case-s5d1-accepted.json');
const acceptedS5D2=require('./fixtures/story-work-case-s5d2-accepted.json');

const s5d2Ids=[
  ...Array.from({length:21},(_,index)=>`T${String(index+1).padStart(3,'0')}`),
  ...Array.from({length:10},(_,index)=>`T${String(index+23).padStart(3,'0')}`)
].sort();
const allExpected=[...Object.keys(acceptedS5D1),...s5d2Ids].sort();

assert(authority,'S5D2 WorkCaseNarratives authority must be exported');
assert(Object.isFrozen(authority),'S5D2 WorkCaseNarratives authority must remain immutable');
assert.strictEqual(Object.keys(acceptedS5D1).length,80,'S5D1 accepted snapshot must remain exactly 80 entries');
assert.strictEqual(s5d2Ids.length,31,'S5D2 locked population must remain exactly 31');
assert.strictEqual(allExpected.length,111,'S5D2 total authority must be exactly 111 entries');

assert.deepStrictEqual(
  Object.keys(acceptedS5D2).sort(),
  allExpected,
  'S5D2 accepted snapshot must cover exactly the 111 locked entries'
);
for(const [id,before] of Object.entries(acceptedS5D2)){
  assert(authority[id], `${id}: accepted S5D2 authority entry must remain present during later S5 batches`);
  if(id==='E011'){
    // The old accepted snapshot is checked against the exact immutable Gen195
    // source, never overwritten to mask the approved successor clarification.
    const cp=require('node:child_process');
    const historical={window:{},console};
    vm.runInNewContext(cp.execFileSync('git',['show','594db5a397cbc90d4da8d241192e4f1db0af2540:data/questions.js'],{encoding:'utf8',maxBuffer:12*1024*1024}),historical);
    assert.strictEqual(historical.window.WorkCaseNarratives.E011.before,before,'E011 historical S5D2 snapshot remains immutable');
    assert.strictEqual(authority.E011.before,'店舗の火災保険料の口座引落記録と帳簿を比べると、別の費用として処理されています。あなたは、支出目的の違いを確認します。','E011 Gen196 bank debit source correction');
  } else assert.strictEqual(
    authority[id].before,
    before,
    `${id}: later S5 batches must preserve accepted S5D2 Before text byte-for-byte`
  );
}

const anchorRefs=new Set(anchors.map(scene=>scene.referenceQuestionId));
assert(anchorRefs.has('T022'),'T022 must remain a Chapter 8 Anchor reference');
assert(!s5d2Ids.includes('T022'),'T022 must be excluded from S5D2 production');

const story=Object.values(questions).filter(question=>
  question.learningRole!=='review'&&!examIds.has(question.id)
);
assert.strictEqual(story.length,166,'S5D2 must preserve accepted Story population');
assert.strictEqual(anchors.length,36,'S5D2 must preserve accepted 36 AnchorScenes');

for(const [id,before] of Object.entries(acceptedS5D1)){
  assert.strictEqual(
    authority[id]?.before,
    before,
    `${id}: S5D2 must preserve accepted S5D1 Before text byte-for-byte`
  );
}

const expectedVariants={
  trial_balance_1:new Set(Array.from({length:10},(_,i)=>`T${String(i+1).padStart(3,'0')}`)),
  trial_balance_2:new Set(Array.from({length:10},(_,i)=>`T${String(i+11).padStart(3,'0')}`)),
  trial_balance_3:new Set(['T021',...Array.from({length:8},(_,i)=>`T${String(i+23).padStart(3,'0')}`)]),
  trial_balance_4:new Set(['T031','T032'])
};

const beforeTexts=[];
for(const id of s5d2Ids){
  const question=questions[id];
  const entry=authority[id];

  assert(question,`${id}: target question must exist`);
  assert.strictEqual(question.type,'trial_balance',`${id}: type must remain trial_balance`);
  assert.strictEqual(question.chapter,8,`${id}: chapter must remain 8`);
  assert(!anchorRefs.has(id),`${id}: S5D2 must not overwrite Anchor authority`);
  assert(question.learningRole!=='review',`${id}: target must remain outside Review`);
  assert(!examIds.has(id),`${id}: target must remain outside Exam`);
  assert(entry,`${id}: authored Before entry must exist`);
  assert.deepStrictEqual(Object.keys(entry),['before'],`${id}: S5D2 must remain Before-only`);

  const before=String(entry.before||'').trim();
  assert(before.length>0,`${id}: authored Before must be non-empty`);
  assert(before.length<=120,`${id}: authored Before must stay within the 120-character mobile reading bound`);
  assert(!/[0-9０-９]/u.test(before),`${id}: authored Before must not reveal numeric values`);
  assert(!/[円￥¥]/u.test(before),`${id}: authored Before must not reveal currency/amounts`);
  assert(!/借方|貸方/u.test(before),`${id}: authored Before must not coach debit/credit direction`);
  assert(!/合計は|合計が|一致する|一致します/u.test(before),`${id}: authored Before must not reveal total/equality answers`);
  assert(/(?:あなた|自分で)/u.test(before),`${id}: Before must keep protagonist viewpoint`);
  assert(/(?:確認|確かめ|照合|比べ|見極め|追う|整理|点検)/u.test(before),`${id}: Before must contain an explicit reader action`);
  assert(String(question.story||'').startsWith(before),`${id}: runtime Story must start with authored Before`);
  assert(String(question.story||'').includes('〔調査 '),`${id}: runtime Story must preserve Story progress context`);

  const tableAccounts=(question.table?.rows||[]).map(row=>row&&row.account).filter(Boolean);
  const groundedTokens=[...new Set(tableAccounts.filter(account=>account!=='合計'))];
  assert(
    groundedTokens.some(account=>before.includes(account)) || /試算表|残高|勘定|月次|決算整理|経過勘定/u.test(before),
    `${id}: Before must be grounded in actual question/table evidence`
  );

  beforeTexts.push(before);
}

assert.strictEqual(
  new Set(beforeTexts).size,
  s5d2Ids.length,
  'S5D2 must provide 31 substantively unique authored Before strings'
);

for(const [variant,ids] of Object.entries(expectedVariants)){
  for(const id of ids){
    assert.strictEqual(questions[id].variantGroup,variant,`${id}: trial-balance variant semantics must remain ${variant}`);
  }
}

console.log('ISSUE179_S5D2_WORK_CASE_NARRATIVE_PASS');
