'use strict';
// The evidence is an INVENTORY, not a certificate of human copyediting or learner success.
// Runtime questions.js executes in a sandbox to capture post-normalization, post-story-authoring prose.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const vm=require('node:vm');
const crypto=require('node:crypto');
const path=require('node:path');
const repo=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(repo,p),'utf8');
const digest=s=>crypto.createHash('sha256').update(s).digest('hex');
const sandbox={window:{},console};
vm.runInNewContext(read('data/questions.js'),sandbox,{filename:'data/questions.js',timeout:30000});
const {QuestionData,WorkCaseNarratives,AnchorScenes}=sandbox.window;
const ids=Object.keys(QuestionData||{});
assert.equal(ids.length,300,'canonical Grade3 question count');
assert.equal(new Set(ids).size,300,'canonical IDs unique');
const authored=new Set(Object.keys(WorkCaseNarratives||{}));
const scenes=Array.isArray(AnchorScenes)?AnchorScenes:[];
const rows=ids.map(id=>{
  const q=QuestionData[id],related=scenes.filter(s=>s.referenceQuestionId===id);
  for(const key of ['id','scene','story','question','explanation']){
    assert.equal(typeof q[key],'string','missing user-facing field '+id+':'+key);
    assert(q[key].trim().length>0,'blank user-facing field '+id+':'+key);
  }
  return {
    id,chapter:q.chapter,learningRole:q.learningRole||null,mode:q.timelineRole||null,
    authorship:authored.has(id)?'individual-scene':'runtime-template-or-anchor',
    anchorScenes:related.map(s=>s.sceneId),
    strings:{
      scene:q.scene,preAnswerStory:q.story,question:q.question,
      explanation:q.explanation,
      npcDialogue:q.npcDialogue||'',
      nextHook:q.nextHook||'',
      workResult:q.workResult||''
    },
    sourceHash:digest([q.scene,q.story,q.question,q.explanation].join('\n'))
  };
});
const categories=[...new Set(rows.map(r=>r.chapter))].sort((a,b)=>a-b);
assert.equal(categories.length,12);
const byChapter=categories.map(chapter=>({chapter,total:rows.filter(r=>r.chapter===chapter).length,
  authored:rows.filter(r=>r.chapter===chapter&&r.authorship==='individual-scene').length,
  templated:rows.filter(r=>r.chapter===chapter&&r.authorship!=='individual-scene').length,
  anchors:scenes.filter(s=>s.chapter===chapter).length}));
const candidates=[
  'index.html','form-a.html','js/view.js','js/controller.js','js/feedback.js',
  'js/explanation-model.js','js/form-a.js','js/form-a-scoring.js','js/app.js',
  'js/model.js','js/rpg.js','data/form-a.json'
];
const staticInventory=candidates.map(file=>{
  const source=read(file);
  const lines=source.split('\n');
  return {file,sha256:digest(source),japaneseLines:lines.flatMap((line,i)=>
    /[ぁ-んァ-ン一-龯]/u.test(line)?[{line:i+1,text:line.trim().slice(0,400)}]:[])};
});
const paths=Object.fromEntries(staticInventory.map(x=>[x.file,x]));
assert(paths['js/form-a.js'].japaneseLines.some(line=>line.text.includes('回目の挑戦です。入力内容は自動保存されます。')),'Form A attempt copy');
assert(!read('js/form-a.js').includes('この保存領域での提示 '),'legacy storage implementation copy reintroduced');
assert(read('js/controller.js').includes('復習する問題が')&&read('js/controller.js').includes('復習モードから取り組みましょう。'),'due-review copy');
assert(read('form-a.html').includes('本編のストーリーと独立しています'),'assessment isolation explained');
assert(!read('index.html').includes('伝票分類を別の取引で確認する（Form A）'),'ambiguous training CTA removed');
const output={
  schemaVersion:1,source:'current runtime data/questions.js',release:JSON.parse(read('pwa-release-manifest.json')).release,
  status:'INVENTORY_COMPLETE_NOT_EDITORIAL_APPROVAL',
  summary:{canonicalCount:ids.length,authoredSceneCount:authored.size,
    runtimeTemplateOrAnchorCount:rows.filter(r=>r.authorship!=='individual-scene').length,
    anchorSceneCount:scenes.length,chapters:12,primaryProseFieldsCaptured:7,
    sourceLineInventories:staticInventory.length},
  limitations:[
    'AI and lexical inventory do NOT establish human editorial approval, all user interaction states, or learning outcomes.',
    'Static source lines may include non-displayed words and do not include all evaluated conditional branches.',
    'Each runtime question has scene/story/question/explanation; wrong-answer text is branched, so this is not full wrong-answer DOM enumeration.',
    'Form A is independent; its result must not be represented as canonical L050 or RPG story progression.',
    'Individual scenes and generated fallback lines are not interchangeable with a narrative causal-coherence review.',
    'Rendered browser accessibility and physical iPhone / human learner tests remain separate.'
  ],
  byChapter,questions:rows,staticSources:staticInventory
};
const out=process.env.COPY_AUDIT_OUTPUT||path.join(os.tmpdir(),'boki-user-facing-prose-inventory.json');
fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(output,null,2)+'\n');
console.log('COPY_INVENTORY_COMPLETE '+JSON.stringify(output.summary));
console.log('COPY_EDITORIAL_STATUS NOT_APPROVED; human/causality review required for all 300; fallback cases remain classified.');
