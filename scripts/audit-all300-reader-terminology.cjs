'use strict';
// Full 300-ID machine review of canonical question and explanatory text.
// This is NOT a claim of independent TAC teacher approval or narrative quality.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm'),crypto=require('node:crypto');
const ROOT=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(ROOT,p),'utf8');
const source=read('data/questions.js');
const marker='const QuestionData = ';
const start=source.indexOf(marker);assert(start>=0);
const close=source.indexOf('\n};',start+marker.length);assert(close>start);
const literal=JSON.parse(source.slice(start+marker.length,close+2));
const sandbox={window:{},console};
vm.runInNewContext(source,sandbox,{filename:'data/questions.js',timeout:30000});
const runtime=sandbox.window.QuestionData;
const ids=Object.keys(runtime);
assert.equal(ids.length,300);
assert.deepEqual(ids.slice().sort(),Object.keys(literal).sort());
const prohibited=[
 {id:'LEAKED_FORM_LABEL',re:/\bForm\s*[A-Z]\b|フォーム\s*[A-Z]/iu},
 {id:'INTERNAL_TESTING',re:/\b(?:JSON|CI|QA|API|PWA|UI|Gate)\b|プロトコル|デバッグ|システム内部|開発用|内部処理/iu},
 {id:'IMPLEMENTATION_METADATA',re:/保存領域|取引ID|問題ID|content\s*identity|生成番号|Generation\s*\d+|Release\s*\d+/iu},
 {id:'UNNATURAL_GAME_MANAGEMENT',re:/\bBoss Case\b|\bNEW ROLE\b|\bLEVEL UP\b/iu}
];
const fields=['scene','story','question','explanation','workResult','npcDialogue','nextHook'];
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const issues=[],idsCovered=new Set(),rows=[];
for(const id of ids){
  const original=literal[id],shown=runtime[id];
  assert(original && shown && original.id===id&&shown.id===id);
  for(const key of ['question','explanation','scene','story']){
    assert.equal(typeof shown[key],'string',id+':'+key);
    assert(shown[key].trim(),id+':'+key+' blank');
  }
  const texts={};
  for(const field of fields) {
    const raw=typeof original[field]==='string'?original[field]:'';
    const final=typeof shown[field]==='string'?shown[field]:'';
    texts[field]={literal:raw,rendered:final,changedByRuntime:raw!==final,sha256:sha(final)};
    for(const [phase,value] of [['source',raw],['runtime',final]]){
      for(const rule of prohibited) if(rule.re.test(value))issues.push({id,field,phase,rule:rule.id,excerpt:value.slice(0,220)});
      if(/[。、]{2,}/u.test(value))issues.push({id,field,phase,rule:'REPEATED_PUNCTUATION'});
    }
  }
  const summary={id,chapter:shown.chapter,type:shown.type,category:shown.category,
   explanationLength:shown.explanation.length,questionLength:shown.question.length,
   sceneManuallyWritten:Object.prototype.hasOwnProperty.call(sandbox.window.WorkCaseNarratives||{},id),
   explanationShort:shown.explanation.length<65,
   longQuestion:shown.question.length>400,
   texts};
  rows.push(summary);idsCovered.add(id);
}
assert.equal(idsCovered.size,300);
const form=JSON.parse(read('data/form-a.json'));
const fixtureStrings=[form.question,form.explanation.initial,form.explanation.supplement];
const rawFixtureTerms=fixtureStrings.flatMap((t,i)=>/取引ID/.test(t)?[i]:[]);
const formApp=read('js/form-a.js'),html=read('form-a.html'),entry=read('index.html'),view=read('js/view.js'),rpg=read('js/rpg.js');
assert(rawFixtureTerms.length>0,'need to preserve original fixture and explicitly adapt view');
assert(formApp.includes("replaceAll('取引ID','取引の記号（A～D）')"),'render-only FormA wording missing');
assert(formApp.includes('learnerText(scorer.fixture.question)')&&formApp.includes('learnerText(scorer.fixture.explanation.initial)'), 'FormA question/explanation display not adapted');
assert(!html.includes('Form A')&&!entry.includes('Form A'),'internal Form A label visible');
assert(!html.includes('取引ID'),'internal transaction label visible');
assert(!/Boss Case|NEW ROLE|LEVEL UP/.test(view+rpg),'English placeholder in product user-facing code');
assert(!/BOKI RPGが書き出した有効なJSONファイル/.test(read('js/controller.js')),'technical backup instruction visible');
const report={version:1,date:'2026-10-29',release:JSON.parse(read('pwa-release-manifest.json')).release,
 scope:'300 literal + 300 post-authoring runtime; all 4 required prose fields and 3 adjuncts per question',
 status:issues.length?'TERMINOLOGY_FAIL':'TERMINOLOGY_LINT_PASS_NOT_HUMAN_EDITORIAL_APPROVAL',
 metrics:{ids:ids.length,sourceAndRuntimeChecks:ids.length*fields.length*2,
   templateOrAnchor:rows.filter(x=>!x.sceneManuallyWritten).length,
   authored:rows.filter(x=>x.sceneManuallyWritten).length,
   shortExplanations:rows.filter(x=>x.explanationShort).length,
   overlongQuestions:rows.filter(x=>x.longQuestion).length,
   issues:issues.length,formFixtureInternals:rawFixtureTerms.length},
 caveats:['Term lint cannot certify correct accounting explanations, all conditional wrong-answer paths or human learner comprehension.',
 'Output contains every source+runtime question and explanation, not necessarily every later personalized feedback DOM branch.',
 'Form A content identity and original fixture intentionally unchanged; display-only adaptation prevents changing stored measurement.',
 'Short source/runtime explanations require human/TAC review; do not treat a passing lint as equivalent to 300 teacher approvals.'],
 issues,records:rows};
const out=process.env.ALL300_AUDIT_OUTPUT||path.join(os.tmpdir(),'boki-all300-reader-terminology.json');
fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');
console.log('ALL300_COPY_AUDIT '+JSON.stringify(report.metrics));
console.log('ALL300_COPY_STATUS '+report.status);
if(issues.length){console.error('ALL300_COPY_FINDINGS '+JSON.stringify(issues.slice(0,40)));process.exitCode=1;}
