(function(root){
  'use strict';
  const script=document.currentScript,release=new URL(script.src).searchParams.get('v');
  const byId=id=>document.getElementById(id);
  let scorer,store,attempt,busy=false,draftQueue=Promise.resolve(),draftFailed=false,draftsPending=0;
  const message=text=>{byId('status').textContent=text;};
  function error(e){byId('error').textContent=e.message||'保存を確認できません。入力を控えて再試行してください。';byId('error').hidden=false;byId('reopen').hidden=false;}
  function clearError(){byId('error').hidden=true;byId('reopen').hidden=true;}
  function pending(value){busy=value;for(const id of ['start','submit','retry','reopen'])byId(id).disabled=value;for(const field of byId('fields').querySelectorAll('input,select'))field.disabled=value;}
  function node(tag,text,parent){const e=document.createElement(tag);e.textContent=text;parent?.append(e);return e;}
  const rows=()=>scorer.fixture.answerOrder.map(id=>({id,voucher:byId('voucher-'+id).value,amount:byId('amount-'+id).value}));
  function showExercise(a){
    attempt=a;byId('intro').hidden=true;byId('result').hidden=true;
    byId('question').textContent=scorer.fixture.question;byId('materials').replaceChildren();byId('fields').replaceChildren();
    for(const item of scorer.fixture.materials){const card=node('article','',byId('materials'));card.className='material';node('strong','取引 '+item.id,card);node('p',item.text,card);}
    for(const id of scorer.fixture.answerOrder){
      const row=a.draft.find(item=>item.id===id),fieldset=node('fieldset','',byId('fields'));fieldset.className='answer-row';node('legend','取引 '+id,fieldset);const pair=node('div','',fieldset);pair.className='input-pair';
      const typeLabel=node('label','伝票の種類',pair),select=node('select','',typeLabel);select.id='voucher-'+id;select.setAttribute('aria-label','取引'+id+'の伝票の種類');
      const empty=node('option','選んでください',select);empty.value='';for(const choice of scorer.fixture.choices){const option=node('option',choice,select);option.value=choice;}select.value=row.voucher;
      const label=node('label','金額',pair),line=node('span','',label);line.className='amount-line';const input=node('input','',line);input.type='text';input.inputMode='numeric';input.maxLength=64;input.id='amount-'+id;input.value=row.amount;input.setAttribute('aria-label','取引'+id+'の金額');node('span','円',line);
    }
    byId('exercise').hidden=false;message('このブラウザーの記録では'+a.ordinal+'回目の挑戦です。入力内容は自動保存されます。');byId('exercise-title').focus();
  }
  function answerList(parent,receipt){
    parent.replaceChildren();for(const row of receipt.answer){const d=receipt.result.details.find(item=>item.id===row.id),card=node('p','',parent);card.className='result-row';card.textContent='取引'+row.id+'：'+(row.voucher||'未選択')+' ／ '+(row.amount||'未入力')+'円 — 分類 '+(d.voucherCorrect?'正解':'誤答')+'・金額 '+(d.amountCorrect?'正解':'誤答');}
  }
  async function showResult(receipt){
    // Called only after the store transaction completes, never from a provisional grade.
    byId('exercise').hidden=true;byId('intro').hidden=true;byId('score').textContent=receipt.result.earned+' / 4 取引正解';
    byId('diagnostics').textContent='伝票分類 '+receipt.result.classificationCorrect+'/4 ・ 金額 '+receipt.result.amountCorrect+'/4。各取引は両方正しくて1点です。';
    byId('first-context').textContent=receipt.localFirstPresentation?'この保存領域で最初に提示した試行の結果です。過去の閲覧経験は不明です。':'再受験の結果です。この保存領域での最初の結果は変更されません。';
    answerList(byId('answers-result'),receipt);byId('explanation').textContent=scorer.fixture.explanation.initial;byId('supplement').textContent=scorer.fixture.explanation.supplement;
    byId('journals').replaceChildren();for(const [id,debit,credit,amount] of [['A','普通預金','売掛金',42000],['B','買掛金','現金',18000],['C','現金','売掛金',18000],['D','通信費','普通預金',6000]]){const tr=node('tr','',byId('journals'));for(const text of [id,debit,amount.toLocaleString('ja-JP'),credit,amount.toLocaleString('ja-JP')])node('td',text,tr);}
    const state=await store.read(),first=state.firstSubmission;
    byId('first-score').textContent=first?'最初の結果：'+first.result.earned+'/4（分類 '+first.result.classificationCorrect+'/4・金額 '+first.result.amountCorrect+'/4）':'最初の試行の提出結果はありません。';byId('first-answers').replaceChildren();if(first)answerList(byId('first-answers'),first);
    byId('result').hidden=false;message('回答と結果を保存しました。');byId('result-title').focus();
  }
  async function open(){
    if(busy)return;pending(true);clearError();
    try{
      await draftQueue;store?.close();store=await root.FormAStore.open(scorer);const state=await store.read(),last=state.attempts.at(-1);draftFailed=false;
      if(last?.receipt)await showResult(last.receipt);else if(last?.status==='issued')showExercise(last);else {byId('intro').hidden=false;message('保存領域を利用できます。開始すると最初の提示を記録します。');}
    }catch(e){error(e);}finally{pending(false);}
  }
  async function begin(retry){
    if(busy)return;pending(true);clearError();
    try {await draftQueue;const a=await store.begin(retry);draftFailed=false;if(a.receipt)await showResult(a.receipt);else showExercise(a);}
    catch(e){error(e);}finally{pending(false);}
  }
  byId('answers').addEventListener('input',()=>{
    if(busy || !attempt)return;const snapshot=rows(),id=attempt.id;draftsPending++;
    draftQueue=draftQueue.then(async()=>{try{if(attempt.id!==id)return;attempt=await store.draft(id,attempt.revision,snapshot);draftFailed=false;clearError();message('入力を保存しました。');}catch(e){draftFailed=true;error(e);}finally{draftsPending--;}});
  });
  byId('answers').addEventListener('submit',async event=>{
    event.preventDefault();if(busy)return;const answer=rows();
    pending(true);clearError();
    try {await draftQueue;const validation=scorer.grade(answer);if(!validation.valid)throw new Error(validation.errors.map(item=>(item.id?'取引'+item.id+'：':'')+item.message).join(' '));const receipt=await store.submit(attempt.id,attempt.revision,answer);draftFailed=false;await showResult(receipt);}
    catch(e){error(e);message('結果はまだ確認できません。入力を残して保存を再試行できます。');}finally{pending(false);}
  });
  byId('start').addEventListener('click',()=>begin(false));byId('retry').addEventListener('click',()=>begin(true));byId('reopen').addEventListener('click',open);
  root.addEventListener('beforeunload',event=>{if(draftFailed || busy || draftsPending){event.preventDefault();event.returnValue='';}});
  (async()=>{
    try {
      const response=await fetch('data/form-a.json?v='+encodeURIComponent(release));if(!response.ok)throw Error('教材を取得できません。オンラインで開き直してください。');
      const bytes=await response.arrayBuffer(),hash=[...new Uint8Array(await root.crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
      if(hash!==root.FormAScoring.digest)throw Error('教材の版を確認できません。画面を開き直してください。');
      scorer=root.FormAScoring.create(JSON.parse(new TextDecoder().decode(bytes)),root.GradingEngine);await open();
    }catch(e){error(e);byId('reopen').hidden=true;}
    if('serviceWorker' in root.navigator){try{const registration=await root.navigator.serviceWorker.register('./service-worker.js');const notice=()=>{if(registration.waiting){byId('update-status').hidden=false;byId('update-status').textContent='新しい版が待機しています。回答を保存してトレーニングへ戻ると、更新を確認できます。';}};notice();registration.addEventListener('updatefound',()=>registration.installing?.addEventListener('statechange',notice));}catch(_){byId('update-status').hidden=false;byId('update-status').textContent='オフライン用の準備ができませんでした。オンラインで利用し、後で開き直してください。';}}
  })();
})(window);
