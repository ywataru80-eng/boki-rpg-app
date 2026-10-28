(function (root) {
  'use strict';
  const normalizeNumber = value => String(value ?? '')
    .replace(/[０-９]/g, digit => String.fromCharCode(digit.charCodeAt(0) - 0xfee0))
    .replace(/，/g, ',');
  const validAmountText = value => value === '' || /^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(value);
  const textSignature = text => {
    let hash = 2166136261;
    for (let index=0; index<text.length; index++) hash = Math.imul(hash ^ text.charCodeAt(index),16777619) >>> 0;
    return hash.toString(16).padStart(8,'0');
  };
  const transactionSignature = value => textSignature(JSON.stringify([value.schemaVersion,value.progressKey,value.characterKey,value.progress,value.character]));
  const progressKey='boki-rpg-progress-v3',characterKey='boki-rpg-character-v2';
  const legacyKeys=['boki-rpg-progress-v2','boki-rpg-character-v1','boki-rpg-progress-v2:pending-answer-v1'];
  const legacySignatureKey=progressKey+':legacy-source-v1';
  const primaryKey=key=>key===progressKey||key===characterKey;
  const getStorage = () => {
    const reportFailure = () => root.dispatchEvent?.(new Event('boki-storage-error'));
    try {
      const storage = root.localStorage;
      if (!storage) { queueMicrotask(reportFailure); return null; }
      const ownership = root.App?.storageOwnership;
      const owned = () => !ownership || ownership.active;
      let writable = true,namespaceReady=false;
      const adapter = {
        progressKey,characterKey,resetKeys:[progressKey,characterKey],
        getItem(key) { const result=this.readItem(key);return result.ok?result.value:null; },
        hasItem(key) { return owned()&&storage.getItem(key)!==null; },
        readItem(key) {
          if (!owned()) return {ok:false,value:null};
          try {
            const value=storage.getItem(key);
            if(namespaceReady&&primaryKey(key)&&value===null)return {ok:false,value:null};
            return {ok:true,value:primaryKey(key)&&value==='null'?null:value};
          } catch (_) { return {ok:false,value:null}; }
        },
        setItem(key, value) {
          if (!writable || !owned()) return false;
          try { storage.setItem(key, value); return true; }
          catch (_) { writable = false; reportFailure(); return false; }
        },
        removeItem(key) { if (!owned()) return false; try { if(primaryKey(key))storage.setItem(key,'null');else storage.removeItem(key);return true; } catch (_) { return false; } },
        restoreItem(key, value) { if (!owned()) return false; try { if(value===null&&primaryKey(key))storage.setItem(key,'null');else if(value===null)storage.removeItem(key);else storage.setItem(key,value);return true; } catch (_) { reportFailure(); return false; } },
        legacyChanged() {
          if(!owned()||!writable||!namespaceReady)return false;
          try { const values=legacyKeys.map(key=>storage.getItem(key));return values.some(value=>value!==null)&&storage.getItem(legacySignatureKey)!==textSignature(JSON.stringify(values)); }
          catch(_){return false;}
        }
      };
      if (!Controller.initializeStorageNamespace(adapter,root.App?.storageMigrationSnapshot||Controller.captureStorageNamespace())) {
        writable = false; adapter.readItem = () => ({ok:false,value:null}); adapter.getItem = () => null; queueMicrotask(reportFailure);
      } else { namespaceReady=true;queueMicrotask(()=>{if(adapter.legacyChanged())root.dispatchEvent?.(new Event('boki-legacy-storage-conflict'));}); }
      return adapter;
    } catch (_) { queueMicrotask(reportFailure); return null; }
  };
  // 同じ会計的性質の科目を先に提示し、単なる見た目の5択ではなく識別学習にする。
  const JOURNAL_GROUPS = [
    ['現金','普通預金','当座預金','小口現金','現金過不足'],
    ['売掛金','受取手形','電子記録債権','未収入金','未収収益','クレジット売掛金'],
    ['買掛金','支払手形','電子記録債務','未払金','未払費用','借入金'],
    ['仕入','売上','繰越商品','仕入返品','売上返品'],
    ['旅費交通費','通信費','水道光熱費','消耗品費','支払家賃','租税公課'],
    ['備品','減価償却費','減価償却累計額','固定資産売却損','固定資産売却益'],
    ['資本金','繰越利益剰余金','損益','受取利息','償却債権取立益']
  ];
  const EXAM_DURATION_MS = 60 * 60 * 1000;
  const EXAM_POINTS = Object.freeze([9, 9, 9, 9, 9, 5, 5, 5, 5, 6, 6, 6, 6, 6, 5]);
  class Controller {
    constructor(document, questions) {
      this.document = document; this.questions = questions; this.ids = Object.keys(questions); this.view = new root.AppView(document);
      const storage = getStorage();
      this.model = new root.ProgressModel(questions, storage,storage?.progressKey); this.rpg = new root.RPGModel(storage,storage?.characterKey); this.currentId = null; this.questionStartedAt = null; this.reviewSourceId = null; this.reviewMappings = new Map(); this.expression = '0'; this.calculatorTarget = null; this.examTimerId = null;
      this.calculator = { accumulator: null, operator: null, waitingForOperand: false, lastOperator: null, lastOperand: null };
      this.calculatorPositionFrame = null;
      this.filters = { query: '', account: '', mistakes: 'all' };
      this.submitting = false;
      this.learningFlow = null;
      // 問題データは起動中不変なので、300問の監査は初期化時に一度だけ行う。
      this.semanticAudit = root.validateSemanticQuestionData(this.questions);
    }
    static captureStorageNamespace() {
      const storage=root.localStorage;
      if([progressKey,characterKey,progressKey+':pending-answer-v1'].some(key=>storage.getItem(key)!==null))return {kind:'current'};
      return {kind:'legacy',values:legacyKeys.map(key=>storage.getItem(key))};
    }
    static initializeStorageNamespace(storage,snapshot) {
      const io=Controller.prototype;
      if(!Controller.recoverAnswerTransaction(storage,progressKey,characterKey))return false;
      const present=[progressKey,characterKey].map(key=>storage.hasItem(key));
      if(present.some(Boolean)){
        const pair=[progressKey,characterKey].map(key=>io.storageRead(storage,key));
        return present.every(Boolean)&&pair.every(item=>item.ok)&&!(pair[0].value===null&&pair[1].value!==null);
      }
      if(snapshot?.kind!=='legacy'||snapshot.values.length!==legacyKeys.length)return false;
      const raw=legacyKeys.map(key=>io.storageRead(storage,key));
      if(raw.some((item,index)=>!item.ok||item.value!==snapshot.values[index]))return false;
      // Recover old before-images in memory. The old release's physical keys
      // remain untouched, even if a suspended old heap later resumes writing.
      const values=Object.fromEntries(legacyKeys.map((key,index)=>[key,snapshot.values[index]]));
      const memory={getItem:key=>values[key]??null,setItem(key,value){values[key]=value;},removeItem(key){delete values[key];}};
      if(!Controller.recoverAnswerTransaction(memory,legacyKeys[0],legacyKeys[1]))return false;
      const progress=values[legacyKeys[0]]??null,character=values[legacyKeys[1]]??null;
      if(progress===null&&character!==null)return false;
      try { for(const rawValue of [progress,character])if(rawValue!==null){const value=JSON.parse(rawValue);if(!value||typeof value!=='object'||Array.isArray(value))return false;} }
      catch(_){return false;}
      const pending={schemaVersion:1,progressKey,characterKey,progress,character};
      if(!io.storageWrite(storage,legacySignatureKey,textSignature(JSON.stringify(snapshot.values)))||
          !io.storageWrite(storage,progressKey+':pending-answer-v1',JSON.stringify({...pending,signature:transactionSignature(pending)})))return false;
      return Controller.recoverAnswerTransaction(storage,progressKey,characterKey)&&[progressKey,characterKey].every(key=>storage.hasItem(key));
    }
    narrativeScenesForQuestion(question) {
      if (this.model?.state?.mode !== 'story' || !question) return [];
      return (root.AnchorScenes || []).filter(scene =>
        scene?.chapter === question.chapter && scene?.referenceQuestionId === question.id
      );
    }
    epilogueFactsForScene(scene) {
      if (scene?.epilogue !== true || !Array.isArray(scene.epilogueFacts)) return [];
      return scene.epilogueFacts.map(fact => {
        let value = this.questions?.[fact.questionId]?.answer;
        for (const key of fact.answerPath || []) value = value?.[key];
        return Number.isFinite(value)
          ? { label:fact.label, value, sourceQuestionId:fact.questionId }
          : null;
      }).filter(Boolean);
    }
    renderNarrativeResolution(question, resolved = false) {
      const mode = this.model?.state?.mode;
      if (mode !== 'story') {
        this.view?.renderNarrativeResult?.([], { mode:mode || 'training', resolved:false, epilogueFacts:[] });
        return false;
      }
      const scenes = Controller.prototype.narrativeScenesForQuestion.call(this, question);
      const epilogueScene = scenes.find(scene => scene.epilogue === true);
      const isResolved = resolved === true;
      return this.view?.renderNarrativeResult?.(
        scenes,
        {
          mode,
          resolved:isResolved,
          epilogueFacts:isResolved && epilogueScene
            ? Controller.prototype.epilogueFactsForScene.call(this, epilogueScene)
            : []
        }
      ) || false;
    }
    static accountChoices(question, correct, mode = 'story') {
      const all = [...new Set(Object.values(root.QuestionData).filter(q => q.type === 'journal').flatMap(q => [...q.answer.debit, ...q.answer.credit].map(item => item.account)))];
      if (mode === 'exam') {
        const required = question.type === 'journal'
          ? [...new Set(['debit', 'credit'].flatMap(side => (question.answer?.[side] || []).map(item => item.account)).filter(Boolean))]
          : question.format === 'journal-book'
            ? [...new Set(Object.entries(question.answer?.cells || {}).filter(([key]) => /^[dc]\d+Account$/.test(key)).map(([, account]) => account).filter(Boolean))]
            : [correct].filter(Boolean);
        const related = [...new Set(required.flatMap(account => JOURNAL_GROUPS.find(group => group.includes(account)) || []))];
        const seed = `${question.id}:exam`;
        const distractors = Controller.seededShuffle([...new Set([...related, ...all])].filter(name => !required.includes(name)), seed);
        return Controller.seededShuffle([...required, ...distractors].slice(0, 5), seed);
      }
      const related = JOURNAL_GROUPS.find(group => group.includes(correct)) || [];
      const seed = `${question.id}:${correct}`;
      const choices = Controller.seededShuffle([...new Set([correct, ...related, ...all])].slice(0, 5), seed);
      const current = choices.indexOf(correct); const target = Controller.hash(seed) % choices.length;
      [choices[current], choices[target]] = [choices[target], choices[current]];
      return choices;
    }
    static hash(text) {
      let hash = 2166136261;
      for (const char of String(text)) { hash ^= char.codePointAt(0); hash = Math.imul(hash, 16777619); }
      return hash >>> 0;
    }
    static seededShuffle(values, seed) {
      const shuffled = [...values]; let state = Controller.hash(seed) || 0x9e3779b9;
      const random = () => { state += 0x6d2b79f5; let value = state; value = Math.imul(value ^ value >>> 15, value | 1); value ^= value + Math.imul(value ^ value >>> 7, value | 61); return ((value ^ value >>> 14) >>> 0) / 4294967296; };
      for (let index = shuffled.length - 1; index > 0; index -= 1) { const target = Math.floor(random() * (index + 1)); [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]]; }
      return shuffled;
    }
    init(route = {}) {
      this.bindEvents(); this.populateAccountFilter(); this.renderModes(); this.view.updateRpg(this.rpg);
      this.model.migrateLegacyPlacement();
      if (!this.model.state.placement) { this.showPlacement(); return; }
      const routeMode = ['story', 'training', 'review', 'exam', 'desk'].includes(route.mode) ? route.mode : null;
      const explicitQuestion = typeof route.questionId === 'string' && this.questions[route.questionId];
      const savedMode = ['story', 'training', 'review', 'desk'].includes(this.model.state.mode) ? this.model.state.mode : 'story';
      const requestedMode = routeMode || (explicitQuestion ? 'story' : savedMode);
      const mode = this.hasActiveExamSession() ? 'exam' : requestedMode;
      if (this.showMode(mode) === false) return;
      if (explicitQuestion && this.questions[route.questionId] && (mode !== 'exam' || this.modeIds().includes(route.questionId))) { this.start(route.questionId); return; }
      if (!routeMode && !explicitQuestion) this.offerResume(mode);
    }
    bindEvents() {
      this.document.addEventListener('click', event => {
        const calculatorInput = event.target.closest?.('.amount-input[readonly]:not(:disabled)');
        if (calculatorInput) this.selectCalculatorTarget(calculatorInput);
        const action = event.target.closest('[data-action]'); if (!action) return;
      const handlers = { mode: () => this.showMode(action.dataset.mode), start: () => this.start(action.dataset.questionId || this.modeIds()[0], { fresh:action.dataset.startFresh === 'true' }), next: () => this.next(), save: () => this.saveDraft(true), 'hint-1': () => this.showHint(1), 'hint-2': () => this.showHint(2), 'coaching-retry': () => this.beginCoachingRetry(), 'coaching-retry-result': () => this.beginCoachingRetry(), 'reveal-answer': () => this.revealAnswer(), 'open-settings': () => this.openSettings(), 'backup-export': () => this.exportBackup(), 'reset-learning-data': () => this.requestFullReset(), 'tax-calculate': () => this.calculateTax(), 'open-log-analysis': () => this.openLogAnalysis(), 'start-rpg-mission': () => this.startRpgMission(action.dataset.questionId), 'start-boss': () => this.startBoss(action.dataset.boss), 'finish-exam': () => this.finishExam(false), 'exam-home': () => this.leaveExamResult('story'), 'exam-review': () => this.leaveExamResult('review'), 'exam-retry': () => this.retryExam(), 'placement-retake': () => { this.model.resetPlacement(); this.showPlacement(); }, 'placement-skip': () => this.skipPlacement(), calc: () => this.calcKey(action.dataset.calc), 'calc-insert': () => this.insertCalculatorResult(false), 'filter-reset': () => this.resetFilters(), 'retry-mode': () => this.restartAfterGameOver(false), 'review-game-over': () => this.restartAfterGameOver(true), 'open-related': () => this.openRelated(action.dataset.questionId) };
        if (handlers[action.dataset.action]) handlers[action.dataset.action]();
      });
      this.document.addEventListener('input', event => { if (event.target.matches('.amount-input')) this.formatAmount(event.target, event); if (event.target.matches('.amount-input, .table-text-input')) this.saveDraft(false); });
      this.document.addEventListener('focusin', event => {
        if (!event.target.matches('.amount-input:not(:disabled)')) return;
        if (event.target.readOnly && this.view?.calculatorFirstInput) return;
        this.selectCalculatorTarget(event.target);
      });
      const calculatorPanel = this.document.querySelector?.('.calculator');
      const resizeCalculator = () => {
        if (this.calculatorPositionFrame != null) root.cancelAnimationFrame?.(this.calculatorPositionFrame);
        this.calculatorPositionFrame = root.requestAnimationFrame(() => {
          this.calculatorPositionFrame = null;
          const target = this.calculatorTarget;
          if (!calculatorPanel?.open || !calculatorPanel.classList?.contains?.('calculator-contextual-float') ||
              !target || target.disabled || !this.document.body.contains(target)) return;
          // Reflow only: selecting again would discard an in-progress calculation.
          this.positionCalculatorNearTarget(target, calculatorPanel, true);
        });
      };
      root.addEventListener?.('resize', resizeCalculator);
      root.visualViewport?.addEventListener?.('resize', resizeCalculator);
      calculatorPanel?.addEventListener?.('toggle', () => {
        const active = Boolean(calculatorPanel.open && calculatorPanel.classList?.contains?.('calculator-contextual-float'));
        if (!active) {
          this.calculatorPlacement = null;
          calculatorPanel.classList?.remove?.('calculator-contextual-float');
          calculatorPanel.classList?.remove?.('calculator-placement-above');
          calculatorPanel.style?.removeProperty?.('left');
          calculatorPanel.style?.removeProperty?.('top');
          calculatorPanel.style?.removeProperty?.('width');
          calculatorPanel.style?.removeProperty?.('max-height');
          this.document.getElementById('question-form')?.classList?.remove?.('calculator-workspace-active');
          if (calculatorPanel.dataset) delete calculatorPanel.dataset.placement;
        }
      });
      this.document.addEventListener('change', event => { if (event.target.matches('.journal-row select, .correction-row select, .journal-book-account')) { this.view.updateSelectTitle(event.target); this.saveDraft(false); } });
      this.document.getElementById('filter-query').addEventListener('input', event => { this.filters.query = event.target.value; this.renderModes(); });
      ['filter-account', 'filter-mistakes'].forEach(id => this.document.getElementById(id).addEventListener('change', event => { this.filters[id === 'filter-account' ? 'account' : 'mistakes'] = event.target.value; this.renderModes(); }));
      this.document.getElementById('question-form').addEventListener('submit', event => {
        event.preventDefault();
        this.submit();
      });
      this.document.getElementById('placement-form').addEventListener('submit', event => { event.preventDefault(); this.finishPlacement(); });
      this.document.getElementById('backup-import')?.addEventListener('change', event => this.importBackup(event.target.files?.[0]));
      root.addEventListener?.('boki-storage-error', () => { const warning = this.document.getElementById('storage-warning'); if (warning) warning.hidden = false; });
      const legacyNotice=()=>{
        if(!this.model.storage?.legacyChanged?.())return;
        const warning=this.document.getElementById('storage-warning');
        if(warning){warning.textContent='以前の版の保存データに変更が見つかりました。この画面の記録は保護されています。古い画面を閉じ、必要なら古い画面でもバックアップを保存してください。';warning.hidden=false;}
      };
      root.addEventListener?.('boki-legacy-storage-conflict',legacyNotice);
      root.addEventListener?.('storage',event=>{if(event.key===null||legacyKeys.includes(event.key))legacyNotice();});
    }
    openSettings() {
      const migration = this.document.getElementById('content-migration-status');
      if (migration) {
        migration.hidden = !Object.keys(this.model.state.contentMigrationArchive?.questions || {}).length && !this.model.state.legacyProvenance;
        migration.textContent = migration.hidden ? '' : '内容を更新した問題の以前の成績・入力は、このJSONバックアップに保管されています。現在の習熟度には、更新後の内容と確認できた回答だけを使用します。';
        if (this.model.state.legacyProvenance) migration.textContent += ' 旧版で整合性を確認できない情報は未検証として保持しています。不正と判定した情報ではありません。原本はJSONバックアップに含まれます。途中入力は回答時に確認し、未検証の成績は新しい進捗判定に使用しません。';
      }
      const dialog = this.document.getElementById('settings-dialog');
      if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
    }
    closeSettings() {
      const dialog = this.document.getElementById('settings-dialog');
      if (!dialog) return;
      if (typeof dialog.close === 'function' && dialog.open) dialog.close(); else dialog.removeAttribute('open');
    }
    requestFullReset() {
      this.closeSettings();
      return this.view.showNotice('この画面の学習進捗・回答履歴・復習予定・経験値・役職を初期化します。元に戻せません。旧版の画面に残る記録は削除しません。必要な場合は先にJSONバックアップを書き出してください。', {
        title:'学習データを初期化しますか？',
        cancelLabel:'戻る',
        confirmLabel:'初期化する',
        onConfirm:() => this.resetLearningData()
      });
    }
    resetLearningData() {
      const status = this.document.getElementById('backup-status');
      const recovered = this.model.storage !== this.rpg.storage || Controller.recoverAnswerTransaction(this.model.storage,this.model.key,this.rpg.key);
      const targets=this.model.storage===this.rpg.storage&&this.model.storage?.resetKeys
        ? this.model.storage.resetKeys.map(key=>({storage:this.model.storage,key}))
        : [{storage:this.model.storage,key:this.model.key},{storage:this.rpg.storage,key:this.rpg.key}];
      const snapshots=targets.map(item=>({...item,...this.storageRead(item.storage,item.key)}));
      if (!recovered || snapshots.some(item=>!item.ok)) {
        if (status) { status.textContent = '保存データを安全に確認できないため、初期化しませんでした。'; status.classList.add('storage-error'); }
        this.openSettings(); return false;
      }
      // Keep the current pair recoverable if the document closes during reset.
      // The legacy namespace is read-only: its uncooperative writers cannot be
      // protected by a snapshot rollback or a non-atomic compare-and-restore.
      const journalKey=this.model.storage===this.rpg.storage&&this.model.storage?.resetKeys?this.model.key+':pending-answer-v1':null;
      const pending={schemaVersion:1,progressKey:this.model.key,characterKey:this.rpg.key,
        progress:snapshots[0].value,character:snapshots[1].value};
      const prepared=!journalKey||this.storageWrite(this.model.storage,journalKey,JSON.stringify({...pending,signature:transactionSignature(pending)}));
      if (!prepared || !snapshots.every(item=>this.storageRemove(item.storage,item.key)) ||
          (journalKey&&!this.storageRemove(this.model.storage,journalKey))) {
        const restored=snapshots.map(item=>this.storageRestore(item.storage,item.key,item.value)).every(Boolean);
        if(restored&&journalKey)this.storageRemove(this.model.storage,journalKey);
        if (status) {
          status.textContent = restored
            ? '初期化できなかったため、元の学習データへ戻しました。'
            : '初期化に失敗し、元の保存状態も完全には戻せませんでした。JSONバックアップがある場合は復元してください。';
          status.classList.add('storage-error');
        }
        this.openSettings(); return false;
      }
      if (status) { status.classList.remove('storage-error'); status.textContent = '学習データを初期化しました。画面を再読み込みします。'; }
      root.location?.reload?.(); return true;
    }
    calculateTax() {
      if (this.rpg.level < 5) return false;
      const input = this.document.getElementById('tax-base');
      const base = Number(normalizeNumber(input.value).replace(/,/g, ''));
      const output = this.document.getElementById('tax-result');
      if (!Number.isFinite(base) || base < 0) { output.textContent = '0以上の金額を入力してください。'; return false; }
      output.textContent = `税込 ${Math.round(base * 1.1).toLocaleString('ja-JP')}円（消費税 ${Math.round(base * .1).toLocaleString('ja-JP')}円）`;
      return true;
    }
    openLogAnalysis() {
      if (this.rpg.level < 10) return false;
      const panel = this.document.getElementById('log-analysis'); panel.hidden = false;
      const percent = metric => metric?.attempts ? `${Math.round(metric.accuracy * 100)}%` : '未回答';
      const evidence = metric => metric?.attempts ? `${metric.correctCount}/${metric.attempts}` : '回答なし';
      const make = (tag, className, text) => {
        const node = this.document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
      };

      panel.replaceChildren();
      panel.append(
        make('h4', 'log-analysis-title', '学習ログ分析'),
        make('p', 'log-analysis-note', '累積はこれまでの全回答、直近5回は最近の回答だけを集計しています。')
      );

      if (Object.keys(this.model.state.contentMigrationArchive?.questions || {}).length) {
        const recheck = (this.model.state.contentRecheckIds || []).map(id => this.questions[id]?.category).filter(Boolean);
        panel.append(make('p', 'log-analysis-note content-migration-note',
          '内容を更新した問題の以前の成績・入力は、バックアップ内に保管しています。現在の習熟度には、更新後の内容と確認できた回答だけを使用します。' +
          (recheck.length ? ` 再確認が必要：${recheck.join('、')}。` : '')));
      }

      const summary = make('div', 'learning-metric-grid');
      const overall = this.model.overallAccuracy();
      const recent = this.model.recentAccuracy({ limit:5 });
      [
        ['全体正答率（累積）', percent(overall), evidence(overall)],
        ['直近5回の正答率', percent(recent), evidence(recent)]
      ].forEach(([label, value, detail]) => {
        const card = make('section', 'learning-metric-card');
        card.append(make('small', '', label), make('strong', '', value), make('span', '', detail));
        summary.append(card);
      });
      panel.append(summary);

      const categories = [...new Set(Object.values(this.questions).map(question => question.category).filter(Boolean))]
        .map(category => ({ category, metric:this.model.categoryAccuracy(category) }))
        .filter(item => item.metric.attempts > 0)
        .sort((a,b) => a.category.localeCompare(b.category, 'ja'));
      const categorySection = make('section', 'log-analysis-section');
      categorySection.append(make('h5', '', '分野別正答率（累積）'));
      if (!categories.length) categorySection.append(make('p', 'analysis-empty', 'まだ回答データがありません。'));
      else {
        const list = make('div', 'learning-analysis-list');
        categories.forEach(({ category, metric }) => {
          const row = make('div', 'learning-analysis-item');
          row.append(make('strong', '', category), make('span', '', `${percent(metric)}（${evidence(metric)}）`));
          list.append(row);
        });
        categorySection.append(list);
      }
      panel.append(categorySection);

      const answered = Object.keys(this.model.state.questionStats || {})
        .map(id => ({ id, question:this.questions[id], mastery:this.model.learningMastery(id), recent:this.model.recentAccuracy({ questionId:id, limit:5 }) }))
        .filter(item => item.question && item.mastery?.attempts > 0)
        .sort((a,b) => b.mastery.lastAnsweredAt - a.mastery.lastAnsweredAt || a.id.localeCompare(b.id));
      const problemSection = make('section', 'log-analysis-section');
      problemSection.append(make('h5', '', `問題別の習熟度（回答済み${answered.length}問）`));
      if (!answered.length) problemSection.append(make('p', 'analysis-empty', '問題に回答すると、ここに累積成績と習熟度が表示されます。'));
      else {
        const list = make('div', 'learning-problem-list');
        answered.forEach(({ id, question, mastery, recent:recentMetric }) => {
          const card = make('article', 'learning-problem-card');
          const header = make('div', 'learning-problem-heading');
          header.append(make('strong', '', `${id}｜${question.category || '未分類'}`), make('span', 'mastery-state', mastery.state));
          const metrics = make('div', 'learning-problem-metrics');
          metrics.append(
            make('span', '', `累積 ${percent(mastery)}（${evidence(mastery)}）`),
            make('span', '', `直近5回 ${percent(recentMetric)}（${evidence(recentMetric)}）`),
            make('span', '', `最終結果 ${mastery.lastResult === true ? '正解' : mastery.lastResult === false ? '誤答' : '未回答'}`),
            make('span', '', `連続 正解${mastery.correctStreak}回 / 誤答${mastery.incorrectStreak}回`),
            make('span', '', `習熟度 ${mastery.state}（指標 ${mastery.score}/100）`)
          );
          card.append(header, metrics); list.append(card);
        });
        problemSection.append(list);
      }
      panel.append(problemSection);
      return true;
    }
    startBoss(kind) {
      const required = kind === 'annual' ? 30 : 20;
      if (this.rpg.level < required) return false;
      const types = kind === 'annual' ? ['comprehensive', 'financial_statement'] : ['worksheet', 'trial_balance'];
      const id = this.learningIds().filter(id => types.includes(this.questions[id].type)).sort((a,b) => (this.questions[b].difficulty || 0) - (this.questions[a].difficulty || 0))[0];
      if (!id) return false;
      this.model.state.mode = 'story'; this.model.save(); this.start(id); return true;
    }
    exportBackup() {
      if (this.model.storageWriteBlocked) { this.document.getElementById('backup-status').textContent='保存状態を安全に読み取れないため、書き出しませんでした。'; return false; }
      const payload = { format:'boki-rpg-backup', version:1, exportedAt:new Date().toISOString(), progress:this.model.state, character:this.rpg.state };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type:'application/json' });
      const link = this.document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `boki-rpg-backup-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(link.href);
      this.document.getElementById('backup-status').textContent = 'バックアップを書き出しました。';
    }
    async importBackup(file) {
      const status = this.document.getElementById('backup-status');
      try {
        const payload = JSON.parse(await file.text());
        if (payload?.format !== 'boki-rpg-backup' || payload.version !== 1 || !root.ProgressModel.validateBackupState(payload.progress, this.questions, this.model.examPool) || !root.RPGModel.validateBackupState(payload.character)) throw new Error('invalid');
        if (this.model.storage === this.rpg.storage && !Controller.recoverAnswerTransaction(this.model.storage,this.model.key,this.rpg.key)) throw new Error('pending-answer');
        const prepared = root.ProgressModel.prepareBackupState(payload.progress, this.questions, this.model.examPool);
        if (!prepared) throw new Error('invalid-progress-migration');
        const progressValue = JSON.stringify(prepared); const characterValue = JSON.stringify(payload.character);
        const progressSnapshot = this.storageRead(this.model.storage, this.model.key); const characterSnapshot = this.storageRead(this.rpg.storage, this.rpg.key);
        if (!progressSnapshot.ok || !characterSnapshot.ok) throw new Error('storage-read');
        let forwardFailed = false;
        if (!this.storageWrite(this.model.storage, this.model.key, progressValue)) forwardFailed = true;
        else if (!this.storageWrite(this.rpg.storage, this.rpg.key, characterValue)) forwardFailed = true;
        if (forwardFailed) {
          const progressRolledBack = this.storageRestore(this.model.storage, this.model.key, progressSnapshot.value);
          const characterRolledBack = this.storageRestore(this.rpg.storage, this.rpg.key, characterSnapshot.value);
          if (!progressRolledBack || !characterRolledBack) { const error = new Error('rollback'); error.rollbackFailed = true; throw error; }
          throw new Error('storage');
        }
        status.classList.remove('storage-error');
        status.textContent = 'バックアップを復元しました。画面を再読み込みします。'; root.location?.reload?.(); return true;
      } catch (error) { status.textContent = error.rollbackFailed ? '復元に失敗し、元の保存状態も完全には戻せませんでした。保存データが不整合な可能性があります。画面は再読み込みしていません。' : '復元できませんでした。このアプリで保存したバックアップファイルを選んでください。画面は再読み込みしていません。'; status.classList.add('storage-error'); return false; }
    }
    static recoverAnswerTransaction(storage, progressKey = 'boki-rpg-progress-v2', characterKey = 'boki-rpg-character-v1') {
      const io = Controller.prototype, key = `${progressKey}:pending-answer-v1`, read = io.storageRead(storage, key);
      if (!read.ok) return false;
      if (read.value === null || read.value === '') return true;
      try {
        const value = JSON.parse(read.value);
        if (!value || Object.keys(value).length !== 6 || value.schemaVersion !== 1 || value.signature !== transactionSignature(value) || value.progressKey !== progressKey || value.characterKey !== characterKey ||
            !['progress','character'].every(name => value[name] === null || typeof value[name] === 'string')) return false;
        // Before-images stay durable until both keys have been restored. A failed
        // rollback therefore remains recoverable on the next launch.
        for (const [name, target] of [['progress',progressKey],['character',characterKey]]) {
          const current = io.storageRead(storage, target);
          if (!current.ok || ((current.value !== value[name] || (storage.hasItem&&!storage.hasItem(target))) && !io.storageRestore(storage, target, value[name]))) return false;
        }
        return typeof storage?.removeItem === 'function' ? io.storageRemove(storage,key) : io.storageWrite(storage,key,'');
      } catch (_) { return false; }
    }
    learningTransaction(operation) {
      const model = this.model, rpg = this.rpg, io = Controller.prototype;
      // Lightweight callers without persistence use the same state operation.
      // The application always supplies both concrete model keys and one store.
      if (!model.key || !rpg.key) return operation() !== false;
      const storage = model.storage;
      if (!root.ProgressModel.validateBackupState(model.state,this.questions,model.examPool)) return false;
      if (!storage || storage !== rpg.storage || model.storageWriteBlocked ||
          !Controller.recoverAnswerTransaction(storage,model.key,rpg.key)) return false;
      const progress = io.storageRead(storage,model.key), character = io.storageRead(storage,rpg.key);
      if (!progress.ok || !character.ok) return false;
      const oldProgress = JSON.parse(JSON.stringify(model.state)), oldCharacter = JSON.parse(JSON.stringify(rpg.state)), completed = rpg.progressCompleted;
      const restoreMemory = () => { model.state=oldProgress; rpg.state=oldCharacter; rpg.progressCompleted=completed; };
      const saves = [model,rpg].map(object => ({object,own:Object.hasOwn(object,'save'),save:object.save}));
      let staged = false;
      try {
        model.save = rpg.save = () => true;
        staged = operation() !== false && root.ProgressModel.validateBackupState(model.state,this.questions,model.examPool) &&
          root.RPGModel.validateBackupState(rpg.state);
      } catch (_) { staged = false; }
      finally { for (const item of saves) { if(item.own)item.object.save=item.save;else delete item.object.save; } }
      if (!staged) { restoreMemory(); return false; }
      const key = `${model.key}:pending-answer-v1`;
      const pending = {schemaVersion:1,progressKey:model.key,characterKey:rpg.key,progress:progress.value,character:character.value};
      const journal = JSON.stringify({...pending,signature:transactionSignature(pending)});
      const nextProgress = JSON.stringify(model.state), nextCharacter = JSON.stringify(rpg.state);
      if (!io.storageWrite(storage,key,journal)) { restoreMemory(); return false; }
      const written = io.storageWrite(storage,model.key,nextProgress) && io.storageWrite(storage,rpg.key,nextCharacter);
      const committed = written && (typeof storage.removeItem === 'function' ? io.storageRemove(storage,key) : io.storageWrite(storage,key,''));
      if (committed) return true;
      const recovered = Controller.recoverAnswerTransaction(storage,model.key,rpg.key);
      restoreMemory();
      if (!recovered) { model.storageWriteBlocked = true; rpg.save = () => false; }
      return false;
    }
    storageRead(storage, key) { if (typeof storage?.readItem === 'function') return storage.readItem(key); try { return storage?.getItem ? { ok:true, value:storage.getItem(key) } : { ok:false, value:null }; } catch (_) { return { ok:false, value:null }; } }
    storageWrite(storage, key, value) { try { return Boolean(storage?.setItem) && storage.setItem(key, value) !== false; } catch (_) { return false; } }
    storageRemove(storage, key) { try { return Boolean(storage?.removeItem) && storage.removeItem(key) !== false; } catch (_) { return false; } }
    storageRestore(storage, key, value) { try { if (typeof storage?.restoreItem === 'function') return storage.restoreItem(key, value) !== false; return value === null ? Boolean(storage?.removeItem) && storage.removeItem(key) !== false : Boolean(storage?.setItem) && storage.setItem(key, value) !== false; } catch (_) { return false; } }
    showPlacement() { this.stopExamTimer(); this.document.body?.classList?.add('placement-active'); this.view.show('view-placement'); this.document.getElementById('question-filters').hidden = true; this.document.querySelector('.mode-nav').hidden = true; }
    skipPlacement() {
      const first = this.storyIds()[0] || this.ids[0];
      if (!first) return false;
      this.model.completePlacement({ foundation:0, closing:0 });
      this.model.state.currentQuestionId = first; this.model.save();
      this.document.querySelector('.mode-nav').hidden = false; this.renderModes(); this.showMode('story'); return true;
    }
    openRelated(id) {
      if (!this.questions[id] || this.examCandidateIds().includes(id) || this.questions[id].learningRole === 'review') return false;
      this.model.state.mode = 'training'; this.model.save(); this.renderModes(); this.start(id); return true;
    }
    openExamPrerequisite(id) {
      if (!this.questions[id] || !this.examPrerequisiteIds().includes(id)) return false;
      if (this.showMode('story') === false) return false;
      this.start(id); return true;
    }
    finishPlacement() {
      const form = this.document.getElementById('placement-form');
      const unanswered = [...form.querySelectorAll('fieldset')].some(fieldset => !fieldset.querySelector('input:checked'));
      const status = this.document.getElementById('placement-status');
      if (unanswered) { status.textContent = `全${form.querySelectorAll('fieldset').length}問に回答してください。`; return null; }
      const answers = [...form.querySelectorAll('input:checked')];
      const score = domain => { const selected = answers.filter(input => input.closest('fieldset').dataset.domain === domain); return Math.round(selected.filter(input => input.value === 'correct').length / selected.length * 100); };
      const scores = { foundation:score('foundation'), closing:score('closing') };
      const startId = this.model.completePlacement(scores);
      if (!startId) return null;
      this.document.body?.classList?.remove('placement-active');
      this.document.querySelector('.mode-nav').hidden = false; this.renderModes(); this.start(startId); return startId;
    }
    hasActiveExamSession(now = Date.now()) {
      const session = this.model.state.examSession;
      return Boolean(
        session &&
        (session.status || 'RUNNING') === 'RUNNING' &&
        !this.isExamExpired(now, session)
      );
    }
    showMode(mode) {
      if (mode !== 'exam' && this.hasActiveExamSession()) {
        this.view.showNotice('模試中は他のモードへ移動できません。先に試験を終了して採点してください。', { title:'模試を継続中です' });
        return false;
      }
      this.document.body?.classList?.remove('placement-active');
      if (mode === 'exam') {
        const unmet = this.unmetExamPrerequisites();
        if (unmet.length) {
          const items = unmet.map(id => ({
            id,
            label:this.questions[id]?.category || id,
            detail:this.questions[id]?.question || ''
          }));
          const legacyNotice = unmet.some(id => this.model.isUnverified?.('correctIds',id))
            ? ' 旧版の正答記録は保持されていますが、一部は確認できないため、その問題の回答で進捗を再確認します。' : '';
          this.view.showNotice(`模試の前に基礎演習を完了してください（残り${unmet.length}問）。下の未完了問題から進められます。${legacyNotice}`, {
            title:'模試を開始できません',
            items,
            itemActionLabel:'この問題を解く',
            onItemSelect:item => this.openExamPrerequisite(item.id)
          });
          return false;
        }
      }
      if (mode === 'exam') this.clearOrdinaryFilters();
      this.model.state.mode = mode;
      if (mode === 'exam') this.ensureExamSession();
      else this.stopExamTimer();
      this.model.save();
      this.renderModes();
      this.view.show(`view-${mode}`); this.document.getElementById('question-filters').hidden = mode === 'exam' || mode === 'desk';
      this.document.body?.classList?.toggle('exam-active', mode === 'exam');
      this.document.querySelectorAll('[data-action="mode"]').forEach(button => button.setAttribute('aria-current', button.dataset.mode === mode ? 'page' : 'false'));
      if (mode === 'exam') { this.updateExamStatus(); this.startExamTimer(); }
      return true;
    }
    leaveExamResult(mode) { this.currentId = null; this.showMode(mode); this.renderModes(); }
    retryExam(now = Date.now()) {
      // Finished sessions already cleared their drafts. An old unsigned result
      // list must not authorize deleting inputs saved since that exam ended.
      const previousIds = this.model.state.examSession?.ids || [];
      if (previousIds.length) this.model.clearDrafts?.(previousIds);
      this.model.state.examSession = null; this.currentId = null;
      const session = this.ensureExamSession(now);
      this.showMode('exam'); this.renderModes();
      if (session.ids[0]) this.start(session.ids[0]);
      return session;
    }
    buildExamIds() {
      const quota = { journal: 5, ledger: 2, trial_balance: 2, correction: 2, worksheet: 2, financial_statement: 1, comprehensive: 1 };
      const attempt = Number(this.model.state.examAttempt || 0);
      const semanticAudit = this.semanticAudit || root.validateSemanticQuestionData(this.questions);
      const eligible = new Set(semanticAudit.eligibleIds);
      return Object.entries(quota).flatMap(([type, count]) => {
        const pool = this.examCandidateIds().filter(id => this.questions[id].type === type && eligible.has(id));
        if (pool.length < count) throw new Error(`独立Semantic監査済みの${type}転移問題が不足しています`);
        // Walk the explicit pool in quota-sized windows. Twenty audited attempts cover
        // every candidate while pools larger than 2×quota cannot collapse to A/B sets.
        const start = (attempt * count) % pool.length;
        return Array.from({ length:count }, (_, index) => pool[(start + index) % pool.length]);
      });
    }
    examCandidateIds() {
      const contract = Array.isArray(root.ExamPoolDefinition) ? root.ExamPoolDefinition : [];
      const seen = new Set();
      return contract.filter(id => !seen.has(id) && seen.add(id) && this.questions[id]?.learningRole === 'transfer');
    }
    examPrerequisiteIds() {
      return [...new Set(this.examCandidateIds().flatMap(id => this.questions[id].curriculumPrerequisites || []))]
        .filter(id => this.questions[id] && ['core', 'drill'].includes(this.questions[id].learningRole));
    }
    unmetExamPrerequisites() {
      const correct = new Set(this.model.verifiedCorrectIds?.() || this.model.state.correctIds || []);
      return this.examPrerequisiteIds().filter(id => !correct.has(id));
    }
    learningIds() {
      const exam = new Set(this.examCandidateIds());
      const roleOrder = { core:0, drill:1, reinforcement:2, transfer:3 };
      return this.ids.map((id, index) => ({ id, index }))
        .filter(({ id }) => this.questions[id].learningRole !== 'review' && !exam.has(id))
        // Keep the authored chapter sequence while making the Core -> Drill
        // progression deterministic within a chapter. Transfer-only assessment
        // variants remain isolated by the explicit exam contract above.
        .sort((left, right) => this.questions[left.id].chapter - this.questions[right.id].chapter ||
          (roleOrder[this.questions[left.id].learningRole] ?? 2) - (roleOrder[this.questions[right.id].learningRole] ?? 2) || left.index - right.index)
        .map(item => item.id);
    }
    storyIds() {
      const flow = { journal: 0, ledger: 1, trial_balance: 2, correction: 3, worksheet: 4, financial_statement: 5, comprehensive: 6 };
      return this.learningIds().map((id, index) => ({ id, index })).sort((left, right) => {
        const a = this.questions[left.id]; const b = this.questions[right.id];
        return a.chapter - b.chapter || flow[a.type] - flow[b.type] || left.index - right.index;
      }).map(item => item.id);
    }
    reviewIds() {
      const due = this.model.dueReviewIds();
      this.reviewMappings = new Map();
      if (due.length) return due.map(sourceId => {
        const source = this.questions[sourceId];
        const stage = this.model.state.reviewSchedule[sourceId]?.stage || 0;
        const existing = this.model.state.reviewAssignments?.[sourceId];
        const scheduledIds = new Set(Object.keys(this.model.state.reviewSchedule));
        const assignedIds = new Set(Object.values(this.model.state.reviewAssignments || {}).filter(item => item?.status === 'assigned' && item.sourceQuestionId !== sourceId).map(item => item.reviewQuestionId));
        const variants = (this.ids || Object.keys(this.questions)).filter(id => this.questions[id].category === source.category && this.questions[id].learningRole === 'review')
          .filter(id => id !== sourceId && !scheduledIds.has(id) && !assignedIds.has(id) && !this.reviewMappings.has(id));
        const persistedIsSafe = existing && existing.status === 'assigned' && existing.stage === stage && existing.dueAt === this.model.state.reviewSchedule[sourceId]?.dueAt &&
          (existing.reviewQuestionId === sourceId || variants.includes(existing.reviewQuestionId));
        const reviewQuestionId = persistedIsSafe ? existing.reviewQuestionId : (variants[stage % Math.max(variants.length, 1)] || sourceId);
        const assignment = this.model.assignReview(sourceId, reviewQuestionId) || { reviewQuestionId, sourceQuestionId:sourceId, conceptId:source.category, dueAt:this.model.state.reviewSchedule[sourceId]?.dueAt || 0, stage, status:'assigned' };
        this.reviewMappings.set(reviewQuestionId, Object.freeze({ ...assignment }));
        return reviewQuestionId;
      });
      return [];
    }
    modeIds() { const mode = this.model.state.mode; if (mode === 'review') return this.reviewIds(); if (mode === 'exam') return this.model.state.examSession?.ids || this.buildExamIds(); if (mode === 'training') return this.learningIds().filter(id => this.questions[id].type !== 'journal'); return this.storyIds(); }
    ensureExamSession(now = Date.now()) {
      if (this.model.validExamSession(this.model.state.examSession)) return this.model.state.examSession;
      this.model.state.examSession = { ids: this.buildExamIds(), startedAt: now, endAt: now + EXAM_DURATION_MS, status: 'RUNNING', evidenceVersion:1, scores: {} };
      this.model.refreshEvidenceIntegrity?.(); this.model.save(); return this.model.state.examSession;
    }
    isExamExpired(now = Date.now(), session = this.model.state.examSession) {
      return !session || (session.status || 'RUNNING') !== 'RUNNING' || now >= session.endAt;
    }
    unansweredExamIds() {
      const session = this.model.state.examSession;
      return session ? session.ids.filter(id => !Object.prototype.hasOwnProperty.call(session.scores, id)) : [];
    }
    updateExamStatus(now = Date.now()) {
      const session = this.model.state.examSession; if (!session) return;
      const remaining = Math.max(0, session.endAt - now); const seconds = Math.ceil(remaining / 1000);
      const timer = this.document.getElementById('exam-timer'); const progress = this.document.getElementById('exam-progress');
      if (timer) timer.textContent = `残り ${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
      const announcement = this.document.getElementById('exam-timer-announcement');
      if (announcement && [600, 300, 60, 30].includes(seconds) && this.lastExamAnnouncement !== seconds) {
        announcement.textContent = `試験終了まで残り${seconds >= 60 ? `${seconds / 60}分` : `${seconds}秒`}です。`;
        this.lastExamAnnouncement = seconds;
      }
      const position = Math.max(0, session.ids.indexOf(this.currentId)) + 1;
      if (progress) progress.textContent = `第${position}問 / ${session.ids.length}問｜回答済み ${session.ids.length - this.unansweredExamIds().length}問`;
      if (remaining === 0) { session.status = 'EXPIRED'; this.model.refreshEvidenceIntegrity?.(); this.finishExam(true, now); }
    }
    startExamTimer() { this.stopExamTimer(); this.updateExamStatus(); this.examTimerId = root.setInterval?.(() => this.updateExamStatus(), 1000) || null; }
    stopExamTimer() { if (this.examTimerId !== null) root.clearInterval?.(this.examTimerId); this.examTimerId = null; }
    finishExam(force, now = Date.now(), confirmed = false) {
      const session = this.model.state.examSession; if (!session) return false;
      if (session.status === 'FINISHING' || session.status === 'FINISHED') return false;
      const unknownScores = Object.keys(session.scores).filter(id => this.model.isUnverified?.('examScores',id));
      if (unknownScores.length) {
        this.stopExamTimer();
        this.view.showNotice(`旧版の${unknownScores.length}問は保存答案から得点を確認できません。原本と既得報酬を保持し、この模試の得点・習熟度・報酬は確定しません。`, {
          title:'未検証の模試記録', cancelLabel:'回答に戻る', confirmLabel:'原本を保管して終了',
          onCancel:() => { if (this.model.state.examSession === session && Date.now() < session.endAt) this.startExamTimer(); },
          onConfirm:() => {
            if (this.model.state.examSession !== session) return;
            const saved = Controller.prototype.learningTransaction.call(this, () => {
              this.model.state.legacyProvenance.archivedExams.push({reason:'unverifiable-score',archivedAt:Date.now(),session:JSON.parse(JSON.stringify(session))});
              this.model.state.examSession = null;
              this.model.state.examAttempt += 1;
              this.model.state.legacyProvenance.pending.examScores = [];
              this.model.refreshEvidenceIntegrity(); return this.model.save();
            });
            if (saved) this.showMode('story');
          }
        });
        return false;
      }
      const timedOut = force || now >= session.endAt || session.status === 'EXPIRED';
      const unanswered = this.unansweredExamIds();
      if (!timedOut && unanswered.length) { this.view.showNotice(`未回答が${unanswered.length}問あります。全問回答後に採点してください。`, { title:'未回答があります' }); this.start(unanswered[0]); return false; }
      if (!timedOut && !confirmed) {
        this.view.showNotice('全15問の回答を終了し、採点しますか？', {
          title:'模試を採点しますか？',
          cancelLabel:'戻る',
          confirmLabel:'採点する',
          onConfirm:() => this.finishExam(false, Date.now(), true)
        });
        return false;
      }
      const previousProgress = {level:this.rpg.level,role:this.rpg.role};
      let review;
      const saved = Controller.prototype.learningTransaction.call(this, () => {
        session.status = 'FINISHING';
      const earned = session.ids.reduce((sum, id, index) => sum + (session.scores[id]?.ratio || 0) * EXAM_POINTS[index], 0);
      const points = Math.round(earned); const correct = points >= 70;
      session.ids.forEach(id => { const result = session.scores[id]; if (result) { this.model.record(id, result.correct); this.rpg.recordMastery(this.questions[id], result); if (result.correct) this.rpg.reward?.(this.questions[id], result, 1); } });
      this.model.clearDrafts?.(session.ids);
      review = { finishedAt: now, startedAt: session.startedAt, points, passed: correct, durationMs: Math.max(0, Math.min(now, session.endAt) - session.startedAt), unansweredCount: unanswered.length, items: session.ids.map((id, index) => ({ id, topic: this.questions[id].category, points: EXAM_POINTS[index], earned: Math.round((session.scores[id]?.ratio || 0) * EXAM_POINTS[index]), correct: session.scores[id]?.correct === true, answer: session.scores[id]?.answer ?? null })) };
      review.topicScores = review.items.reduce((out, item) => { const row = out[item.topic] || { earned: 0, possible: 0 }; row.earned += item.earned; row.possible += item.points; out[item.topic] = row; return out; }, {});
      const setSignature = [...session.ids].sort().join('|');
      session.status = 'FINISHED'; this.model.state.lastExamReview = review; this.model.state.examHistory = [...(this.model.state.examHistory || []), { finishedAt: review.finishedAt, points, passed: correct, durationMs: review.durationMs, topicScores: review.topicScores, unansweredCount: review.unansweredCount, setSignature }].slice(-10);
      this.rpg.progressCompleted = this.model.updateCompletion?.(this.rpg) === true;
      this.model.state.examAttempt += 1; this.model.state.examSession = null; this.model.refreshEvidenceIntegrity?.(); this.model.save();
        return true;
      });
      if (!saved) { this.submitting=false; this.view.showNotice?.('模試結果を保存できませんでした。回答を保持しています。保存状態を確認してから再度お試しください。',{title:'模試を記録できません'}); return false; }
      this.stopExamTimer();
      this.document?.body?.classList?.remove('exam-active');
      const achievement = { level:this.rpg.level > previousProgress.level ? this.rpg.level : null, role:this.rpg.role !== previousProgress.role ? this.rpg.role : null };
      this.view.examResult(review, this.questions, this.model.examHistoryForDisplay?.() || this.model.state.examHistory, achievement);
      this.view.show('view-result'); this.document.getElementById?.('result-status')?.focus(); return true;
    }
    questionAccounts(question) { return question.type === 'journal' ? [...question.answer.debit, ...question.answer.credit].map(item => item.account) : []; }
    populateAccountFilter(ids = this.modeIds()) {
      const select = this.document.getElementById('filter-account');
      const accounts = [...new Set(ids.flatMap(id => this.questionAccounts(this.questions[id])))].sort((a, b) => a.localeCompare(b, 'ja'));
      const current = this.filters.account;
      select.replaceChildren(new Option(accounts.length ? 'すべての勘定科目' : 'このモードでは勘定科目検索なし', ''));
      accounts.forEach(account => select.append(new Option(account, account)));
      this.filters.account = current && accounts.includes(current) ? current : '';
      select.value = this.filters.account;
      select.disabled = accounts.length === 0;
      const query = this.document.getElementById('filter-query');
      if (query) query.placeholder = accounts.length ? '問題文・カテゴリ・勘定科目' : '問題文・カテゴリ';
    }
    filteredIds(ids) {
      const normalized = this.filters.query.trim().toLocaleLowerCase('ja');
      const matches = ids.filter(id => {
        const question = this.questions[id]; const accounts = this.questionAccounts(question);
        const searchable = [id, question.category, question.question, question.scene, question.story, ...accounts].filter(Boolean).join(' ').toLocaleLowerCase('ja');
        if (normalized && !searchable.includes(normalized)) return false;
        if (this.filters.account && !accounts.includes(this.filters.account)) return false;
        const count = this.model.state.mistakeCounts[id] || 0;
        if (this.filters.mistakes === 'incorrect' && !this.model.state.incorrectIds.includes(id)) return false;
        if ((this.filters.mistakes === 'attempted' || this.filters.mistakes === 'frequent') && count === 0) return false;
        return true;
      });
      if (this.filters.mistakes === 'frequent') matches.sort((a, b) => (this.model.state.mistakeCounts[b] || 0) - (this.model.state.mistakeCounts[a] || 0));
      return matches;
    }
    clearOrdinaryFilters() {
      this.filters = { query: '', account: '', mistakes: 'all' };
      [['filter-query', ''], ['filter-account', ''], ['filter-mistakes', 'all']].forEach(([id, value]) => {
        const control = this.document.getElementById(id);
        if (control) control.value = value;
      });
    }
    resetFilters() { this.clearOrdinaryFilters(); this.renderModes(); }
    rpgMission(now = Date.now()) {
      if (!Number.isFinite(now) || now < 0) return null;
      const dueIds = this.model.dueReviewIds(now);
      const missionDetails = id => {
        const question = this.questions[id];
        if (!question) return null;
        const priority = this.model.studyPriority(id, now);
        const skill = root.RPGModel?.skillForQuestion?.(question) || null;
        return {
          id,
          question,
          priority,
          skill,
          skillMastery:skill ? this.rpg.skillMastery(skill) : null,
          learningMastery:this.model.learningMastery(id)
        };
      };
      if (dueIds.length) {
        const detail = missionDetails(dueIds[0]);
        return detail ? { ...detail, kind:'review', label:'再戦：復習期限', dueCount:dueIds.length } : null;
      }

      const story = new Set(this.storyIds());
      const training = new Set(this.learningIds().filter(id => this.questions[id]?.type !== 'journal'));
      const id = this.model.priorityStudyIds({ now }).find(candidate => story.has(candidate) || training.has(candidate));
      const detail = id ? missionDetails(id) : null;
      if (!detail?.priority) return null;
      const weak = [1,2,3].includes(detail.priority.tier);
      return { ...detail, kind:'question', label:weak ? '攻略対象' : '次の仕事' };
    }
    renderRpgMission(now = Date.now()) {
      const container = this.document.getElementById('rpg-mission');
      if (!container || !Number.isFinite(now) || now < 0) return false;
      const make = (tag, className, text) => {
        const node = this.document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
      };
      container.replaceChildren();
      const heading = make('div', 'rpg-mission-heading');
      heading.append(
        make('p', 'section-label', 'RPG STRATEGY'),
        make('h3', '', '攻略ミッション'),
        make('p', '', '学習履歴と現在の役職から、いま取り組む仕事を1件だけ示します。')
      );
      container.append(heading);

      const mission = this.rpgMission(now);
      if (!mission) {
        container.append(make('p', 'analysis-empty', '現在表示できる攻略ミッションはありません。'));
        return true;
      }

      const card = make('article', `rpg-mission-card ${mission.kind === 'review' ? 'due-review' : ''}`.trim());
      const copy = make('div', 'rpg-mission-copy');
      const reason = mission.kind === 'review'
        ? `復習する問題が${mission.dueCount}問あります。復習モードから取り組みましょう。`
        : (mission.priority?.reasons || []).join('・');
      const skillText = mission.skill
        ? `対応スキル：${mission.skill} ${Math.round(Math.max(0, Math.min(1, mission.skillMastery || 0)) * 100)}%`
        : '対応スキル：役職マスタリー対象外';
      copy.append(
        make('span', 'rpg-mission-badge', mission.label),
        make('strong', '', `${mission.question.category || '未分類'}｜${mission.id}`),
        make('p', 'rpg-mission-question', mission.question.question || ''),
        make('p', 'rpg-mission-reason', reason),
        make('small', 'rpg-mission-mastery', `習熟度：${mission.learningMastery?.state || '未着手'}`),
        make('small', 'rpg-mission-skill', skillText),
        make('small', 'rpg-mission-role', `現在：Lv.${this.rpg.level} ${this.rpg.role}`)
      );

      const button = make('button', '', mission.kind === 'review' ? '復習モードへ' : 'この仕事に挑む');
      button.type = 'button';
      if (mission.kind === 'review') {
        button.dataset.action = 'mode';
        button.dataset.mode = 'review';
      } else {
        button.dataset.action = 'start-rpg-mission';
        button.dataset.questionId = mission.id;
      }
      card.append(copy, button);
      container.append(card);
      return true;
    }
    startRpgMission(id) {
      const question = this.questions[id];
      if (!question) return false;
      const storyIds = this.storyIds();
      const trainingIds = this.learningIds().filter(candidate => this.questions[candidate]?.type !== 'journal');
      const mode = storyIds.includes(id) ? 'story' : trainingIds.includes(id) ? 'training' : null;
      if (!mode) return false;
      this.model.state.mode = mode;
      this.model.save();
      this.start(id, { fresh:true });
      return true;
    }
    rewardLearningOutcome({ question, score, beforePriority = null, afterPriority = null, reviewSourceId = null, reviewStage = null, reviewCompleted = false } = {}) {
      if (!question || score?.correct !== true) return { baseRewarded:false, bonusXp:0, bonusLabel:'' };
      const baseRewarded = this.rpg.reward(question, score, 1) === true;
      let bonusXp = 0;
      let bonusLabel = '';
      if (reviewCompleted && reviewSourceId && Number.isSafeInteger(reviewStage)) {
        const sourceQuestion = this.questions[reviewSourceId];
        bonusXp = this.rpg.reviewSuccessBonus?.(sourceQuestion, reviewStage) || 0;
        if (bonusXp > 0) bonusLabel = `復習成功 +${bonusXp} XP`;
      } else if ([1,2].includes(beforePriority?.tier) && ![0,1,2].includes(afterPriority?.tier)) {
        bonusXp = this.rpg.weakRecoveryBonus?.(question) || 0;
        if (bonusXp > 0) bonusLabel = `苦手克服 +${bonusXp} XP`;
      }
      return { baseRewarded, bonusXp, bonusLabel };
    }
    rpgAreas(now = Date.now()) {
      if (!Number.isFinite(now) || now < 0) return [];
      const allowed = Object.values(this.questions).filter(question => question &&
        typeof question.id === 'string' &&
        typeof question.category === 'string' &&
        question.category &&
        !['review','transfer','exam'].includes(question.learningRole));
      const categories = [];
      const byCategory = new Map();
      allowed.forEach(question => {
        if (!byCategory.has(question.category)) {
          byCategory.set(question.category, []);
          categories.push(question.category);
        }
        byCategory.get(question.category).push(question.id);
      });
      const due = new Set(this.model.dueReviewIds(now));
      return categories.map(category => {
        const ids = byCategory.get(category);
        const rows = ids.map(id => ({
          id,
          mastery:this.model.learningMastery(id),
          priority:this.model.studyPriority(id, now),
          skill:root.RPGModel?.skillForQuestion?.(this.questions[id]) || null
        }));
        const settledCount = rows.filter(row => row.mastery?.state === '定着').length;
        const evidenceCount = rows.filter(row => (row.mastery?.attempts || 0) > 0).length;
        const dueIds = rows.filter(row => due.has(row.id)).map(row => row.id);
        const weakRows = rows.filter(row => [1,2].includes(row.priority?.tier));
        let state = '未着手';
        if (dueIds.length || weakRows.length) state = '要再戦';
        else if (rows.length && settledCount === rows.length) state = '定着';
        else if (evidenceCount) state = '攻略中';
        const priorityId = this.model.priorityStudyIds({ now, category }).find(id => ids.includes(id)) || null;
        const skills = [...new Set(rows.map(row => row.skill).filter(Boolean))];
        const skill = skills.length === 1 ? skills[0] : null;
        const reasonRow = rows.find(row => due.has(row.id)) || weakRows[0] || rows.find(row => row.priority?.reasons?.length);
        return {
          category,
          ids:[...ids],
          state,
          settledCount,
          total:rows.length,
          percent:rows.length ? Math.round((settledCount / rows.length) * 100) : 0,
          dueCount:dueIds.length,
          priorityId,
          reason:reasonRow?.priority?.reasons?.[0] || '',
          skill,
          skillMastery:skill ? this.rpg.skillMastery(skill) : null
        };
      });
    }
    renderRpgAreas(now = Date.now()) {
      const container = this.document.getElementById('rpg-areas');
      if (!container || !Number.isFinite(now) || now < 0) return false;
      const make = (tag, className, text) => {
        const node = this.document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
      };
      container.replaceChildren();
      const areas = this.rpgAreas(now);
      const settledAreas = areas.filter(area => area.state === '定着').length;
      const heading = make('div', 'rpg-area-heading');
      heading.append(
        make('p', 'section-label', 'MASTERY MAP'),
        make('h3', '', '攻略エリア'),
        make('p', '', `論点ごとの現在地です。定着 ${settledAreas} / ${areas.length}エリア。`)
      );
      container.append(heading);
      const grid = make('div', 'rpg-area-grid');
      areas.forEach(area => {
        const card = make('article', `rpg-area-card state-${area.state}`);
        const header = make('div', 'rpg-area-card-header');
        header.append(make('strong', '', area.category), make('span', 'rpg-area-state', area.state));
        const progress = make('div', 'rpg-area-progress');
        const meter = make('progress', '', '');
        meter.max = area.total || 1;
        meter.value = area.settledCount;
        meter.setAttribute?.('aria-label', `${area.category}の定着進捗`);
        progress.append(
          meter,
          make('span', '', `定着 ${area.settledCount} / ${area.total}（${area.percent}%）`)
        );
        card.append(header, progress);
        if (area.skill) card.append(make('small', 'rpg-area-skill', `対応スキル：${area.skill} ${Math.round(Math.max(0, Math.min(1, area.skillMastery || 0)) * 100)}%`));
        if (area.state === '要再戦' && area.reason) card.append(make('p', 'rpg-area-reason', area.reason));
        if (area.state !== '定着') {
          if (area.dueCount > 0) {
            const button = make('button', '', `復習へ（${area.dueCount}問）`);
            button.type = 'button';
            button.dataset.action = 'mode';
            button.dataset.mode = 'review';
            card.append(button);
          } else if (area.priorityId) {
            const button = make('button', '', area.state === '未着手' ? 'このエリアを始める' : 'このエリアを進める');
            button.type = 'button';
            button.dataset.action = 'start-rpg-mission';
            button.dataset.questionId = area.priorityId;
            card.append(button);
          } else {
            card.append(make('small', 'rpg-area-waiting', '次の復習タイミングを待っています。'));
          }
        } else {
          card.append(make('small', 'rpg-area-settled', '現在の学習証拠では定着しています。'));
        }
        grid.append(card);
      });
      container.append(grid);
      return true;
    }
    renderLearningContinuity(targetId, now = Date.now(), title = '今日の学習サマリー') {
      if (!this.document?.getElementById || !this.document?.createElement) return false;
      const container = this.document.getElementById(targetId);
      if (!container || !Number.isFinite(now) || now < 0 || typeof this.model?.learningContinuity !== 'function') return false;
      const summary = this.model.learningContinuity(now);
      if (!summary) return false;
      const make = (tag, className, text) => {
        const node = this.document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
      };
      const percent = summary.today.accuracy === null ? '—' : `${Math.round(summary.today.accuracy * 100)}%`;
      const last = summary.lastLearningAt > 0 ? new Date(summary.lastLearningAt).toLocaleString('ja-JP') : 'まだ学習記録がありません';
      container.replaceChildren();
      container.hidden = false;
      const heading = make('div', 'learning-continuity-heading');
      heading.append(
        make('h3', '', title),
        make('p', '', '回答履歴から自動集計。保存用の別カウンターは使いません。')
      );
      const grid = make('div', 'learning-continuity-grid');
      [
        ['連続学習', `${summary.currentStreak}日`, '同じ日は1日として集計'],
        ['今日の回答', `${summary.today.attempts}回`, `正解 ${summary.today.correctCount}回`],
        ['今日の正答率', percent, `${summary.today.correctCount}/${summary.today.attempts}`],
        ['学習した問題', `${summary.today.questionCount}問`, '重複回答を除く']
      ].forEach(([label, value, detail]) => {
        const card = make('section', 'learning-continuity-card');
        card.append(make('small', '', label), make('strong', '', value), make('span', '', detail));
        grid.append(card);
      });
      const meta = make('p', 'learning-continuity-meta');
      meta.append(
        make('span', '', `復習成功 ${summary.today.reviewSuccessCount}回`),
        make('span', '', `復習期限 ${summary.dueReviewCount}問`),
        make('span', '', `最終学習 ${last}`)
      );
      container.append(heading, grid, meta);
      if (summary.verification) container.append(make('p','learning-continuity-meta',
        `${summary.verification.today === 'unverified' ? '今日の旧集計には未検証の値または残っていない内訳があります。' : ''}${summary.verification.activeDays === 'unverified' ? '旧版の学習日・継続日数は未検証です。' : ''} 原本を保持し、不足分を推測で補っていません。`));
      return true;
    }
    renderStudyRecommendations(mode, now = Date.now()) {
      const container = this.document.getElementById(`${mode}-recommendations`);
      if (!container || !['story', 'training'].includes(mode) || !Number.isFinite(now) || now < 0) return false;
      const make = (tag, className, text) => {
        const node = this.document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
      };
      container.replaceChildren();
      const heading = make('div', 'study-recommendation-heading');
      heading.append(
        make('h3', '', '今日のおすすめ'),
        make('p', '', '学習履歴から、いま取り組む理由が明確な問題を優先して表示します。')
      );
      container.append(heading);

      const dueIds = this.model.dueReviewIds(now);
      if (dueIds.length) {
        const first = this.questions[dueIds[0]];
        const card = make('article', 'study-recommendation-card due-review');
        const copy = make('div', 'study-recommendation-copy');
        copy.append(
          make('span', 'study-recommendation-badge', '復習期限'),
          make('strong', '', `復習する問題が${dueIds.length}問あります。`),
          make('p', 'study-recommendation-reason', first ? `${first.category || '学習済み問題'}から取り組みます。復習期限前の問題は含まれません。` : '復習期限に達した問題から取り組みます。')
        );
        const button = make('button', '', '復習モードへ');
        button.type = 'button';
        button.dataset.action = 'mode';
        button.dataset.mode = 'review';
        card.append(copy, button);
        container.append(card);
        return true;
      }

      const allowedIds = mode === 'training'
        ? this.learningIds().filter(id => this.questions[id]?.type !== 'journal')
        : this.storyIds();
      const allowed = new Set(allowedIds);
      const ids = this.model.priorityStudyIds({ now }).filter(id => allowed.has(id)).slice(0, 3);
      const list = make('div', 'study-recommendation-list');
      if (!ids.length) {
        list.append(make('p', 'analysis-empty', '現在おすすめできる問題はありません。'));
        container.append(list);
        return true;
      }

      ids.forEach((id, index) => {
        const question = this.questions[id];
        const priority = this.model.studyPriority(id, now);
        if (!question || !priority) return;
        const card = make('article', 'study-recommendation-card');
        const copy = make('div', 'study-recommendation-copy');
        copy.append(
          make('span', 'study-recommendation-badge', index === 0 ? 'いま優先' : '次におすすめ'),
          make('strong', '', `${question.category || '未分類'}｜${id}`),
          make('p', 'study-recommendation-question', question.question || ''),
          make('p', 'study-recommendation-reason', priority.reasons.join('・')),
          make('small', 'study-recommendation-mastery', `習熟度：${priority.mastery?.state || '未着手'}`)
        );
        const button = make('button', '', 'この問題を解く');
        button.type = 'button';
        button.dataset.action = 'start';
        button.dataset.questionId = id;
        button.dataset.startFresh = 'true';
        card.append(copy, button);
        list.append(card);
      });
      container.append(list);
      return true;
    }
    visibleIdsForMode(ids, mode) { return mode === 'exam' ? [...ids] : this.filteredIds(ids); }
    renderModes() {
      const render = (id, ids, mode) => { const filtered = this.visibleIdsForMode(ids, mode); const list = this.document.getElementById(id); list.replaceChildren(...filtered.map(qid => { const button = this.document.createElement('button'); button.type = 'button'; button.dataset.action = 'start'; button.dataset.questionId = qid; if (mode !== 'exam') button.dataset.startFresh = 'true'; const mistakes = this.model.state.mistakeCounts[qid] || 0; const hasDraft = Boolean(this.model.state.drafts?.[qid]); button.textContent = `${qid}｜${this.questions[qid].category}${mistakes ? `｜誤答 ${mistakes}回${this.model.isUnverified?.('mistakeCounts',qid) ? '（旧記録・未検証）' : ''}` : ''}${mode !== 'exam' && hasDraft ? '｜保存入力あり・最初から' : ''}`; return button; })); return filtered.length; };
      const storyIds = this.storyIds();
      const trainingIds = this.learningIds().filter(id => this.questions[id].type !== 'journal');
      const reviewIds = this.reviewIds();
      const examIds = this.model.state.examSession?.ids || this.buildExamIds();
      const pools = [storyIds, trainingIds, reviewIds, examIds];
      const modeIndex = ['story', 'training', 'review', 'exam'].indexOf(this.model.state.mode);
      this.populateAccountFilter(modeIndex < 0 ? [] : pools[modeIndex]);
      const counts = [
        render('story-list', storyIds, 'story'),
        render('training-list', trainingIds, 'training'),
        render('review-list', reviewIds, 'review'),
        render('exam-list', examIds, 'exam')
      ];
      Controller.prototype.renderLearningContinuity.call(this, 'story-learning-summary');
      this.renderStudyRecommendations('story');
      this.renderStudyRecommendations('training');
      this.renderRpgMission();
      this.renderRpgAreas();
      const count = modeIndex < 0 ? 0 : counts[modeIndex];
      const hasActiveFilter = Boolean(this.filters.query.trim() || this.filters.account || this.filters.mistakes !== 'all');
      this.document.getElementById('filter-status').textContent = count === 0 && hasActiveFilter
        ? 'このモードには条件に一致する問題がありません。'
        : `${count}問を表示しています。`;
      const currentStoryId = storyIds.includes(this.model.state.currentQuestionId) ? this.model.state.currentQuestionId : null;
      const nextId = (currentStoryId && !this.model.state.answeredIds.includes(currentStoryId) ? currentStoryId : null) || storyIds.find(id => !this.model.state.answeredIds.includes(id)) || currentStoryId || storyIds[0];
      const next = this.questions[nextId]; const chapterIds = storyIds.filter(id => this.questions[id].chapter === next.chapter);
      this.document.getElementById('resume-scene').textContent = `第${next.chapter}章｜${next.scene}`;
      this.document.getElementById('resume-task').textContent = `次の仕事「${next.question}」`;
      this.document.getElementById('resume-progress').textContent = `Chapter進捗 ${chapterIds.filter(id => this.model.state.answeredIds.includes(id)).length} / ${chapterIds.length}｜役職 ${this.rpg.role}`;
      this.document.getElementById('resume-button').dataset.questionId = nextId;
      Controller.prototype.renderStoryWorkOutcomes.call(this, storyIds, next.chapter);
    }
    // Only existing answer and correctness evidence is used; never change cash or profit.
    renderStoryWorkOutcomes(storyIds, currentChapter) {
      const panel = this.document?.getElementById?.('story-work-outcomes');
      if (!panel) return false;
      panel.replaceChildren();
      const answered = new Set(this.model.state.answeredIds || []);
      const correct = new Set(this.model.state.correctIds || []);
      const add = (element, value) => {
        const node = this.document.createElement(element);
        node.textContent = value;
        return node;
      };
      const heading = add('h3', '仕事の成果が見える経理記録');
      const note = add('p', '提出済みの回答履歴から表示しています。正答・実際の会社の残高や利益、選択肢の評価は変わりません。');
      note.className = 'story-work-outcomes-note';
      panel.append(heading, note);
      for (let chapter = Math.max(1, currentChapter - 1); chapter <= currentChapter; chapter += 1) {
        const ids = storyIds.filter(id => this.questions[id]?.chapter === chapter);
        if (!ids.length) continue;
        const count = ids.filter(id => answered.has(id)).length;
        const climax = (root.AnchorScenes || []).find(scene => scene.chapter === chapter && scene.beat === 'BOSS');
        const recorded = Boolean(climax && answered.has(climax.referenceQuestionId));
        const verified = Boolean(recorded && correct.has(climax.referenceQuestionId) &&
          !this.model.isUnverified?.('correctIds', climax.referenceQuestionId));
        const card = this.document.createElement('article');
        card.className = 'story-work-outcome-card';
        card.append(add('h4', '第' + chapter + '章｜処理した資料 ' + count + '/' + ids.length + '件'));
        const meter = this.document.createElement('progress');
        meter.max = ids.length;
        meter.value = count;
        meter.setAttribute('aria-label', '第' + chapter + '章の回答記録');
        card.append(meter);
        const state = !recorded ? '章の報告課題はこれから'
          : verified ? '章の報告課題に正答した記録あり'
          : '章の報告課題は回答済み・正答を再確認';
        card.append(add('p', state));
        if (verified && climax?.hook) card.append(add('small', '次の仕事：' + climax.hook));
        panel.append(card);
      }
      return true;
    }
    resumeCandidate(mode = this.model.state.mode) {
      if (mode === 'desk') return null;
      const answered = new Set(this.model.state.answeredIds || []);
      const current = this.model.state.currentQuestionId;
      let ids = [];
      if (mode === 'story') ids = this.storyIds();
      else if (mode === 'training') ids = this.learningIds().filter(id => this.questions[id].type !== 'journal');
      else if (mode === 'review') ids = this.reviewIds();
      else if (mode === 'exam') ids = this.model.state.examSession?.ids || [];
      if (current && ids.includes(current) && (mode === 'exam' || !answered.has(current))) return current;
      if (mode === 'exam') return this.unansweredExamIds()[0] || null;
      if (mode === 'review') return ids[0] || null;
      const firstUnanswered = ids.find(id => !answered.has(id));
      return firstUnanswered || (current && ids.includes(current) ? current : null) || ids[0] || null;
    }
    offerResume(mode = this.model.state.mode) {
      const id = this.resumeCandidate(mode);
      if (!id) return false;
      const question = this.questions[id];
      const modeLabel = { story:'ストーリー', training:'トレーニング', review:'復習', exam:'模試' }[mode] || '学習';
      const lastLearningAt = Number(this.model.state.lastLearningAt || 0);
      const lastLabel = lastLearningAt > 0 ? ` 最終学習：${new Date(lastLearningAt).toLocaleString('ja-JP')}` : '';
      return this.view.showNotice(`前回の${modeLabel}は「${question.category}｜${question.question}」まで進みました。${lastLabel} 続きから開始しますか？`, {
        title:'前回の続き',
        cancelLabel:'一覧を見る',
        confirmLabel:'続きから',
        onConfirm:() => this.start(id)
      });
    }
    start(id, options = {}) { if (!this.questions[id] || (this.model.state.mode === 'exam' && !this.modeIds().includes(id))) return; if (options.fresh === true) this.model.clearDraft?.(id); this.resetCalculator(); this.submitting = false; this.learningFlow = this.model.state.mode === 'exam' ? null : { questionId:id, phase:'I', hintStage:0, retryCount:0, nextConsumed:false, gameOverPending:false, gameOverDispatched:false }; this.currentId = id; this.learningObservationNumber = this.model.nextLearningObservation?.(id); this.questionStartedAt = Date.now(); this.reviewSourceId = this.model.state.mode === 'review' ? (this.reviewMappings.get(id)?.sourceQuestionId || (this.model.dueReviewIds().includes(id) ? id : null)) : null; this.model.state.currentQuestionId = id; this.model.save(); this.view.resetLearningSurfaces?.(); this.view.storyDecisionRenderedForQuestionId = null; this.view.storyDecisionPreviousBox = null; this.view.storyDecisionEligible = this.model.state.mode === 'story' && !(this.model.state.answeredIds || []).includes(id); this.view.renderQuestion(this.questions[id], this.model.state.drafts[id], this.model.state.mode); this.view.setAnswerMode?.('initial'); this.view.show('view-question'); this.document.getElementById('question-filters').hidden = true; this.document.getElementById?.('q-text')?.focus(); const status = this.document.getElementById('save-status'); if (status && this.model.isUnverified?.('drafts',id)) status.textContent = '旧版の未検証の途中入力です。編集でき、回答時に内容を確認します。'; if (status && this.reviewSourceId && this.model.isUnverified?.('reviewSchedule',this.reviewSourceId)) status.textContent = '旧版の復習予定は未検証です。今回の回答から予定を再評価します。過去の復習段階の達成や追加報酬は確定しません。'; }
    saveDraft(message) {
      if (!this.currentId) return false;
      if (this.model.state.mode !== 'exam' && ['W','R'].includes(this.learningFlow?.phase)) {
        this.learningFlow.coachingAnswer = this.view.readAnswer(this.questions[this.currentId]);
        if (message) { const status = this.document.getElementById('save-status'); status.textContent = '練習中の入力はこの画面だけで保持され、端末には保存されません。'; status.classList.remove('storage-error'); }
        return false;
      }
      const saved = this.model.setDraft(this.currentId, this.view.readAnswer(this.questions[this.currentId])); if (message) { const status = this.document.getElementById('save-status'); status.textContent = saved ? '入力内容を保存しました。' : '端末へ保存できません。内容はこのセッション中のみ保持されます。'; status.classList.toggle('storage-error', !saved); } return saved;
    }
    submit() {
      if (this.submitting || !this.currentId || !this.questions[this.currentId]) return;
      if (this.model.state.mode === 'exam' && this.isExamExpired()) { const session = this.model.state.examSession; if (session) session.status = 'EXPIRED'; this.model.refreshEvidenceIntegrity?.(); this.finishExam(true); return; }
      if (this.model.state.mode !== 'exam' && !['I','R'].includes(this.learningFlow?.phase)) return false;
      const question = this.questions[this.currentId]; const answer = this.view.readAnswer(question);
      if (this.model.isUnverified?.('drafts',question.id)) {
        const id = this.currentId, mode = this.model.state.mode, session = this.model.state.examSession;
        this.view.showNotice('旧版の途中入力を表示しています。内容を確認し、現在の回答として使用しますか？ この操作は過去の入力の真正性を証明するものではありません。', {
          title:'途中入力の確認', cancelLabel:'編集に戻る', confirmLabel:'この回答を使用する',
          onConfirm:() => {
            if (this.currentId !== id || this.model.state.mode !== mode || this.model.state.examSession !== session ||
                JSON.stringify(this.view.readAnswer(question)) !== JSON.stringify(answer)) return;
            if (this.model.approveDraft(id,answer)) this.submit();
            else this.view.showNotice('確認内容を保存できませんでした。入力を保持しています。',{title:'保存できません'});
          }
        });
        return false;
      }
      this.submitting = true;
      if (this.model.state.mode === 'exam' && this.isExamExpired()) { this.model.state.examSession.status = 'EXPIRED'; this.model.refreshEvidenceIntegrity?.(); this.finishExam(true); return; }
      const score = root.GradingEngine.grade(question, answer);
      if (this.model.state.mode !== 'exam' && this.learningFlow?.phase === 'R') return this.finishCoachingRetry(question, answer, score);
      const answeredAt = Date.now(); const responseMs = Math.max(0, answeredAt - (Number.isFinite(this.questionStartedAt) ? this.questionStartedAt : answeredAt));
      const reviewStage = this.reviewSourceId ? this.model.state.reviewSchedule[this.reviewSourceId]?.stage ?? null : null;
      const beforePriority = !this.reviewSourceId ? this.model.studyPriority?.(question.id, answeredAt) : null;
      const wrongType = score.correct ? '' : (score.details?.find(detail => !detail.correct)?.cellId || (question.type === 'journal' ? 'journal-entry' : 'table-cell'));
      const confidence = this.document.querySelector('input[name="confidence"]:checked')?.value || 'unsure';
      // Check the post-grading deadline before any answer evidence is persisted.
      // A timed-out, unscored item must not become a durable submitted answer.
      if (this.model.state.mode === 'exam' && this.isExamExpired(Date.now(), this.model.state.examSession)) {
        this.model.state.examSession.status = 'EXPIRED'; this.model.refreshEvidenceIntegrity?.(); this.finishExam(true); return;
      }
      const support = this.learningFlow?.hintStage ? `hint-${this.learningFlow.hintStage}` : 'none';
      const previousProgress = { level:this.rpg.level, role:this.rpg.role };
      let rewardOutcome;
      const saved = Controller.prototype.learningTransaction.call(this, () => {
        const delayedSuccess = Boolean(score.correct && this.reviewSourceId &&
          this.model.qualifiedDelayedReview?.(question.id,this.reviewSourceId,answeredAt,this.model.state.mode));
        const recorded = this.model.recordAttempt?.(question.id, score.correct, responseMs, wrongType, delayedSuccess, answeredAt, reviewStage, confidence,
          { mode:this.model.state.mode, support, observationNumber:this.learningObservationNumber, reviewSourceId:this.reviewSourceId });
        if (recorded === false) return false;
        if (this.model.state.mode === 'exam') {
          const observationNumber = this.model.state.learningEffectiveness?.questions[question.id]?.observedAttempts;
          this.model.state.examSession.scores[question.id] = { correct:score.correct, earned:score.earned, possible:score.possible, ratio:score.ratio, answer,
            ...(Number.isSafeInteger(observationNumber) ? {observationNumber} : {}) };
          if (this.model.state.legacyProvenance) this.model.state.legacyProvenance.pending.examScores =
            this.model.state.legacyProvenance.pending.examScores.filter(id => id !== question.id);
          this.model.refreshEvidenceIntegrity?.(); this.model.setDraft(question.id,answer); this.model.save();
          return true;
        }
        const reviewCompleted = this.reviewSourceId ? this.model.completeReview(this.reviewSourceId,score.correct,answeredAt,question.id) : false;
        if (!this.reviewSourceId && this.model.record(question.id,score.correct,answeredAt) === false) return false;
        this.rpg.recordMastery?.(question,score);
        this.rpg.progressCompleted = this.model.updateCompletion?.(this.rpg) === true;
        const afterPriority = !this.reviewSourceId ? this.model.studyPriority?.(question.id,answeredAt) : null;
        rewardOutcome = Controller.prototype.rewardLearningOutcome.call(this,{question,score,beforePriority,afterPriority,reviewSourceId:this.reviewSourceId,reviewStage,reviewCompleted});
        this.rpg.applyAnswer(score.correct,confidence);
        return true;
      });
      if (!saved) {
        this.submitting = false;
        this.view.showNotice?.('回答記録を保存できませんでした。入力はこの画面に残っています。保存状態を確認してから再度お試しください。',{title:'回答を記録できません'});
        return false;
      }
      if (this.model.state.mode === 'exam') {
        this.updateExamStatus();
        const unanswered = this.unansweredExamIds(); const ids = this.modeIds(); const following = ids.slice(ids.indexOf(this.currentId)+1).find(id => unanswered.includes(id));
        if (following) return this.start(following);
        if (unanswered.length) return this.start(unanswered[0]);
        this.renderModes(); this.showMode('exam'); return;
      }
      const achievement = {
        reward: rewardOutcome.bonusLabel || null,
        level: this.rpg.level > previousProgress.level ? this.rpg.level : null,
        role: this.rpg.role !== previousProgress.role ? this.rpg.role : null
      };
      this.learningFlow ||= { questionId:question.id, phase:'I', hintStage:0, retryCount:0, nextConsumed:false, gameOverPending:false, gameOverDispatched:false };
      this.learningFlow.authoritativeAnswer = answer; this.learningFlow.authoritativeScore = score; this.learningFlow.confidence = confidence; this.learningFlow.achievement = achievement;
      this.view.updateRpg(this.rpg);
      if (!score.correct) {
        this.learningFlow.phase = 'W'; this.learningFlow.gameOverPending = this.rpg.state.companyHP === 0;
        this.view.result(question, score, answer, confidence, achievement, true); Controller.prototype.renderNarrativeResolution.call(this, question, false); this.view.show('view-result'); this.document.getElementById?.('result-status')?.focus();
        return;
      }
      this.learningFlow.phase = 'C'; this.view.result(question, score, answer, confidence, achievement, false); Controller.prototype.renderNarrativeResolution.call(this, question, true); this.view.show('view-result'); this.document.getElementById?.('result-status')?.focus();
    }
    static journalRetryDraft(answer, expected) {
      const matchSide = side => { const remaining = [...(expected?.[side] || [])]; return (answer?.[side] || []).map(item => { const amount = Number(item?.amount); const index = remaining.findIndex(row => row.account === item?.account && Number.isFinite(amount) && row.amount === amount); if (index < 0) return { account:'', amount:'' }; remaining.splice(index, 1); return { account:item.account, amount:item.amount }; }); };
      return { debit:matchSide('debit'), credit:matchSide('credit') };
    }
    static tableRetryDraft(answer, details) {
      const detailMap = new Map((details || []).map(detail => [detail.cellId, detail])); const cells = {};
      Object.entries(answer?.cells || {}).forEach(([cellId, value]) => { cells[cellId] = detailMap.get(cellId)?.correct === true ? value : ''; });
      return { cells };
    }
    hintContext(question, stage) {
      return { id:question.id, type:question.type, format:question.format, question:question.question, scene:question.scene, story:question.story, table:question.table ? { columns:question.table.columns, rows:question.table.rows, inputMetadata:question.table.inputMetadata } : null, stage };
    }
    static hintText(context, stage) {
      const prompt = [context.question, context.story, context.scene].find(value => typeof value === 'string' && value.trim())?.trim() || '表示されている問題文';
      const evidence = prompt.length > 80 ? `${prompt.slice(0, 77)}…` : prompt;
      if (stage === 1) return `「${evidence}」に注目し、何が増えたか・減ったか、またはどの期間や区分かを整理しましょう。`;
      const procedure = context.type === 'journal' ? '各項目の増減を決め、資産・費用の増加は借方、負債・純資産・収益の増加は貸方という原則で左右を確認' : '表示された行・列・期間を特定し、問題中の数値だけで式を立てて入力欄の単位を確認';
      return `「${evidence}」を根拠に、①条件と数値を拾う ②${procedure}する ③自分の入力を問題文へ戻って検算しましょう。`;
    }
    showHint(stage) {
      const flow = this.learningFlow; if (!flow || flow.phase !== 'I' || stage < 1 || stage > 2 || stage > flow.hintStage + 1) return false;
      const context = this.hintContext(this.questions[this.currentId], stage); flow.hintStage = stage;
      const text = Controller.hintText(context, stage);
      this.view.renderHint(stage, text, context); return true;
    }
    beginCoachingRetry() {
      const flow = this.learningFlow; if (!flow || !['W','R'].includes(flow.phase)) return false;
      const question = this.questions[this.currentId];
      const draft = flow.coachingAnswer || (question.type === 'journal' ? Controller.journalRetryDraft(flow.authoritativeAnswer, question.answer) : Controller.tableRetryDraft(flow.authoritativeAnswer, flow.authoritativeScore?.details));
      flow.phase = 'R'; flow.coachingAnswer = draft; this.submitting = false; this.view.applyRetryDraft(question, draft); this.view.setAnswerMode?.('coaching'); this.view.hideProtectedResult?.(); this.view.show('view-question');
      const first = [...this.document.querySelectorAll('.journal-row select:not(:disabled), .journal-row input:not(:disabled), .table-input:not(:disabled)')].find(input => !input.value) || this.document.querySelector('.journal-row select:not(:disabled), .journal-row input:not(:disabled), .table-input:not(:disabled)');
      if (first?.tagName === 'SELECT' && this.view?.calculatorFirstInput) this.document.getElementById?.('q-text')?.focus?.();
      else first?.focus?.();
      return true;
    }
    finishCoachingRetry(question, answer, score) {
      const flow = this.learningFlow; flow.retryCount += 1; this.submitting = false;
      if (!score.correct) {
        flow.coachingAnswer = question.type === 'journal' ? Controller.journalRetryDraft(answer, question.answer) : Controller.tableRetryDraft(answer, score.details);
        flow.phase = 'W'; this.view.result(question, flow.authoritativeScore, flow.authoritativeAnswer, flow.confidence, flow.achievement, true); Controller.prototype.renderNarrativeResolution.call(this, question, false); this.view.show('view-result'); this.document?.getElementById?.('result-status')?.focus(); return false;
      }
      if (this.model?.recordAssistedRecovery?.(question.id, this.learningObservationNumber, Date.now()) === false) {
        this.view.showNotice?.('練習での修正を保存できませんでした。入力はこの画面に残っています。', { title:'修正を記録できません' });
        return false;
      }
      flow.phase = 'D';
      this.view.hideProtectedResult?.();
      this.view.result(question, score, answer, flow.confidence, flow.achievement, false);
      Controller.prototype.renderNarrativeResolution.call(this, question, true);
      this.view.renderAnswerComparison?.(question, flow.authoritativeScore, flow.authoritativeAnswer);
      const status = this.document.getElementById('result-status');
      const note = this.document.createElement('span'); note.className = 'coaching-success'; note.textContent = '練習で修正できました。最初の回答は誤答として記録されています。'; status?.append(note); this.view.show('view-result'); status?.focus?.(); this.dispatchPendingGameOver(); return true;
    }
    revealAnswer() {
      const flow = this.learningFlow; if (!flow || !['W','R'].includes(flow.phase)) return false;
      flow.phase = 'D'; this.view.hideProtectedResult?.(); this.view.result(this.questions[this.currentId], flow.authoritativeScore, flow.authoritativeAnswer, flow.confidence, flow.achievement, false); Controller.prototype.renderNarrativeResolution.call(this, this.questions[this.currentId], true); this.view.show('view-result'); this.document.getElementById?.('result-status')?.focus(); this.dispatchPendingGameOver(); return true;
    }
    dispatchPendingGameOver() { const flow = this.learningFlow; if (flow?.gameOverPending && !flow.gameOverDispatched) { flow.gameOverDispatched = true; this.showGameOver(); } }
    next() {
      const lifecycleManaged = Object.prototype.hasOwnProperty.call(this, 'learningFlow');
      if (this.model.state.mode !== 'exam' && lifecycleManaged) {
        const flow = this.learningFlow;
        if (!flow || !['W','C','D'].includes(flow.phase) || flow.nextConsumed) return false;
        if (flow.gameOverPending) { this.dispatchPendingGameOver(); return false; }
        flow.nextConsumed = true;
      }
      if (this.model.state.mode === 'exam' && !this.model.state.examSession) return this.leaveExamResult('story');
      if (this.model.state.mode === 'review') { const due = this.modeIds(); if (due.length) return this.start(due.find(id => id !== this.currentId) || due[0]); this.renderModes(); return this.showMode('review'); }
      if (this.model.state.mode !== 'exam') { const concept = this.questions[this.currentId]?.category; const adaptive = concept && this.model.recommendedIds(concept).find(id => id !== this.currentId && !this.model.state.answeredIds.includes(id) && !this.model.state.reviewSchedule[id]); if (adaptive) return this.start(adaptive); }
      const ids = this.modeIds(); const next = ids[ids.indexOf(this.currentId) + 1];
      if (next) this.start(next); else { this.renderModes(); this.showMode(this.model.state.mode); }
      return true;
    }
    formatAmount(input, event = {}) {
      if (event.isComposing) return true;
      const before = normalizeNumber(input.value);
      if (!validAmountText(before)) { input.setCustomValidity?.('金額は数字、または正しい3桁区切りで入力してください。'); return false; }
      input.setCustomValidity?.('');
      const selectionStart = input.selectionStart ?? before.length;
      const selectionEnd = input.selectionEnd ?? selectionStart;
      const selectionDirection = input.selectionDirection || 'none';
      const digitOffset = position => before.slice(0, position).replace(/\D/g, '').length;
      const digits = before.replace(/\D/g, '');
      const formatted = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      const caretAt = offset => {
        if (offset === 0) return 0;
        let seen = 0;
        for (let position = 0; position < formatted.length; position += 1) {
          if (/\d/.test(formatted[position])) seen += 1;
          if (seen === offset) return position + 1;
        }
        return formatted.length;
      };
      input.value = formatted;
      input.setSelectionRange?.(caretAt(digitOffset(selectionStart)), caretAt(digitOffset(selectionEnd)), selectionDirection);
      return true;
    }
    positionCalculatorNearTarget(input, calculatorPanel = this.document.querySelector?.('.calculator'), preserveScreenPosition = false) {
      if (!input || !calculatorPanel?.open || !calculatorPanel.classList?.contains?.('calculator-contextual-float')) return false;
      const inputRect = input.getBoundingClientRect?.();
      if (!inputRect) return false;
      const documentElement = this.document.documentElement || {};
      const visualViewport = root.visualViewport;
      const viewportLeft = Number(visualViewport?.offsetLeft || 0);
      const viewportTop = Number(visualViewport?.offsetTop || 0);
      const viewportWidth = Number(visualViewport?.width || root.innerWidth || documentElement.clientWidth || 0);
      const viewportHeight = Number(visualViewport?.height || root.innerHeight || documentElement.clientHeight || 0);
      if (!(viewportWidth > 0 && viewportHeight > 0)) return false;
      const viewportRight = viewportLeft + viewportWidth;
      const viewportBottom = viewportTop + viewportHeight;
      const edge = 8;
      const gap = 8;
      const width = Math.max(0, Math.min(420, viewportWidth - edge * 2));
      const previousRect = preserveScreenPosition && this.calculatorPlacement?.input === input &&
        this.calculatorPlacement.viewportWidth === viewportWidth &&
        Number.isFinite(parseFloat(calculatorPanel.style.left)) && Number.isFinite(parseFloat(calculatorPanel.style.top))
        ? calculatorPanel.getBoundingClientRect?.() : null;
      calculatorPanel.style.width = `${width}px`;
      if (previousRect) {
        // Height changes include both scrolling browser toolbars and keyboards.
        // Keep screen coordinates without guessing the cause; clamp to the new visible area.
        const maxHeight = Math.max(0, Math.min(380, viewportHeight - edge * 2));
        calculatorPanel.style.maxHeight = `${maxHeight}px`;
        const height = calculatorPanel.getBoundingClientRect().height;
        const left = Math.max(viewportLeft + edge, Math.min(previousRect.left, viewportRight - width - edge));
        const top = Math.max(viewportTop + edge, Math.min(previousRect.top, viewportBottom - height - edge));
        calculatorPanel.style.left = `${Math.round(parseFloat(calculatorPanel.style.left) + left - previousRect.left)}px`;
        calculatorPanel.style.top = `${Math.round(parseFloat(calculatorPanel.style.top) + top - previousRect.top)}px`;
        this.calculatorPlacement = { input, viewportWidth };
        return { placement:calculatorPanel.dataset?.placement, left, top, width, maxHeight };
      }
      calculatorPanel.style.maxHeight = '380px';
      let panelRect = calculatorPanel.getBoundingClientRect?.() || { height:0 };
      const naturalHeight = Math.max(0, Number(panelRect.height) || 0);
      const availableBelow = Math.max(0, viewportBottom - inputRect.bottom - gap - edge);
      const availableAbove = Math.max(0, inputRect.top - viewportTop - gap - edge);
      const requiredHeight = Math.min(naturalHeight || 280, 280);
      const placeBelow = availableBelow >= requiredHeight || availableBelow >= availableAbove;
      const available = placeBelow ? availableBelow : availableAbove;
      const visibleHeight = Math.max(0, viewportHeight - edge * 2);
      const maxHeight = Math.max(0, Math.min(380, visibleHeight, available || visibleHeight));
      calculatorPanel.style.maxHeight = `${maxHeight}px`;
      panelRect = calculatorPanel.getBoundingClientRect?.() || { height:maxHeight };
      const height = Math.max(0, Number(panelRect.height) || 0);
      const minLeft = viewportLeft + edge;
      const maxLeft = Math.max(minLeft, viewportRight - width - edge);
      const left = Math.max(minLeft, Math.min(inputRect.right - width, maxLeft));
      const top = placeBelow
        ? inputRect.bottom + gap
        : inputRect.top - gap - height;
      calculatorPanel.style.left = `${Math.round(left)}px`;
      calculatorPanel.style.top = `${Math.round(top)}px`;
      const anchoredRect = calculatorPanel.getBoundingClientRect?.();
      let anchoredTop = top;
      if (anchoredRect) {
        const expectedEdge = placeBelow ? inputRect.bottom + gap : inputRect.top - gap;
        const actualEdge = placeBelow ? anchoredRect.top : anchoredRect.bottom;
        const correction = expectedEdge - actualEdge;
        if (Number.isFinite(correction) && Math.abs(correction) > .5) {
          anchoredTop = top + correction;
          calculatorPanel.style.top = `${Math.round(anchoredTop)}px`;
        }
      }
      // Rotation can leave the selected field outside the visual viewport.
      // Keep its calculation/selection, but constrain the rendered panel itself.
      const placedRect = calculatorPanel.getBoundingClientRect?.();
      if (placedRect) {
        const visibleTop = Math.max(viewportTop + edge,
          Math.min(placedRect.top, viewportBottom - placedRect.height - edge));
        anchoredTop += visibleTop - placedRect.top;
        calculatorPanel.style.top = `${Math.round(anchoredTop)}px`;
      }
      calculatorPanel.classList?.toggle?.('calculator-placement-above', !placeBelow);
      if (calculatorPanel.dataset) calculatorPanel.dataset.placement = placeBelow ? 'below' : 'above';
      this.calculatorPlacement = { input, viewportWidth };
      return { placement: placeBelow ? 'below' : 'above', left, top:anchoredTop, width, maxHeight };
    }
    selectCalculatorTarget(input) {
      this.document.querySelectorAll('.amount-input').forEach(field => field.classList.toggle('calculator-selected', field === input));
      this.calculatorTarget = input;
      const calculatorPanel = this.document.querySelector('.calculator');
      if (input.readOnly && calculatorPanel) {
        this.document.getElementById('question-form')?.classList?.add?.('calculator-workspace-active');
        calculatorPanel.classList?.add?.('calculator-contextual-float');
        calculatorPanel.open = true;
        const revealTarget = () => {
          if (this.calculatorTarget !== input) return;
          if (this.document.body?.contains && !this.document.body.contains(input)) return;
          const horizontalScrollers = [...new Set([
            input.closest?.('.journal-grid-scroll'),
            input.closest?.('.correction-entry'),
            input.closest?.('.table-question-wrap')
          ].filter(element => element && element.scrollWidth > element.clientWidth + 1))];
          for (const horizontalScroller of horizontalScrollers) {
            const targetRect = input.getBoundingClientRect?.();
            const scrollerRect = horizontalScroller.getBoundingClientRect?.();
            if (!targetRect || !scrollerRect) continue;
            const documentElement = this.document.documentElement || {};
            const visualViewport = root.visualViewport;
            const viewportLeft = Number(visualViewport?.offsetLeft || 0);
            const viewportWidth = Number(visualViewport?.width || root.innerWidth || documentElement.clientWidth || 0);
            const viewportRight = viewportLeft + viewportWidth;
            const visibleLeft = Math.max(scrollerRect.left, viewportLeft);
            const visibleRight = Math.min(scrollerRect.right, viewportRight);
            if (targetRect.left < visibleLeft) horizontalScroller.scrollLeft -= visibleLeft - targetRect.left;
            else if (targetRect.right > visibleRight) horizontalScroller.scrollLeft += targetRect.right - visibleRight;
          }
          const inputRect = input.getBoundingClientRect?.();
          const documentElement = this.document.documentElement || {};
          const visualViewport = root.visualViewport;
          const viewportTop = Number(visualViewport?.offsetTop || 0);
          const viewportHeight = Number(visualViewport?.height || root.innerHeight || documentElement.clientHeight || 0);
          if (inputRect && viewportHeight > 0) {
            const workTop = viewportTop + viewportHeight * .3;
            const currentScrollY = Number(root.scrollY || root.pageYOffset || 0), currentScrollX = Number(root.scrollX || root.pageXOffset || 0);
            const targetScrollY = Math.max(0, currentScrollY + inputRect.top - workTop);
            if (typeof root.scrollTo === 'function') {
              try { root.scrollTo(currentScrollX, targetScrollY); }
              catch (_error) { root.scrollTo({ top:targetScrollY, left:currentScrollX, behavior:'auto' }); }
            } else if (typeof root.scrollBy === 'function') {
              const delta = inputRect.top - workTop;
              try { root.scrollBy(0, delta); }
              catch (_error) { root.scrollBy({ top:delta, left:0, behavior:'auto' }); }
            } else input.scrollIntoView?.({ block:'nearest', inline:'nearest', behavior:'auto' });
          } else if (typeof root.scrollTo !== 'function' && typeof root.scrollBy !== 'function') {
            input.scrollIntoView?.({ block:'nearest', inline:'nearest', behavior:'auto' });
          }
          const position = () => this.calculatorTarget === input
            ? this.positionCalculatorNearTarget(input, calculatorPanel)
            : false;
          if (typeof root.requestAnimationFrame === 'function') {
            root.requestAnimationFrame(() => root.requestAnimationFrame(position));
          } else position();
        };
        if (typeof root.requestAnimationFrame === 'function') root.requestAnimationFrame(revealTarget); else revealTarget();
      }
      const currentAmount = normalizeNumber(input.value).replace(/,/g, '');
      this.clearCalculator();
      if (/^\d+(?:\.\d+)?$/.test(currentAmount)) this.expression = String(Number(currentAmount));
      this.updateCalculatorDisplay();
      const target = this.document.getElementById('calculator-target');
      target.textContent = currentAmount
        ? `${input.getAttribute('aria-label')}の現在値を修正できます`
        : `${input.getAttribute('aria-label')}へ入力します`;
    }
    formatCalculatorExpression(expression) {
      return String(expression).replace(/\d+(?:\.\d*)?/g, numberText => {
        const [integer, decimal] = numberText.split('.');
        const formatted = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        return decimal === undefined ? formatted : `${formatted}.${decimal}`;
      });
    }
    updateCalculatorDisplay() {
      this.document.getElementById('calculator-display').value = this.formatCalculatorExpression(this.expression) || '0';
      const active=this.calculator?.operator || '', indicator=this.document.getElementById('calculator-operator');
      if (indicator) indicator.textContent=active;
      this.document.querySelectorAll?.('[data-action="calc"][data-calc]').forEach(button=>{
        const operator=['＋','−','×','÷'].includes(button.dataset.calc), selected=operator&&button.dataset.calc===active;
        button.classList.toggle('calculator-operator-active',selected);
        if(operator)button.setAttribute('aria-pressed',String(selected));
      });
    }
    insertCalculatorResult(shouldCalculate) {
      const selectedTarget = this.document.querySelector?.('.amount-input.calculator-selected');
      const target = this.document.body.contains(this.calculatorTarget) ? this.calculatorTarget : selectedTarget;
      if (!target || target.disabled || !this.document.body.contains(target)) { this.document.getElementById('calculator-target').textContent = '先に金額欄を選んでください'; return; }
      this.calculatorTarget = target;
      if (shouldCalculate) { try { this.expression = String(root.SafeCalculator.evaluate(this.expression)); } catch (_) { this.expression = 'エラー'; } }
      const amount = Number(this.expression);
      if (!Number.isFinite(amount) || amount < 0) { this.document.getElementById('calculator-target').textContent = '0以上の計算結果を確認してください'; this.updateCalculatorDisplay(); return; }
      target.value = String(Math.round(amount)); this.formatAmount(target); this.saveDraft(false);
      this.updateCalculatorDisplay();
      this.document.getElementById('calculator-target').textContent = `${target.getAttribute('aria-label')}へ${target.value}円を入力しました`;
    }
    calcKey(key) {
      if (key === 'AC') this.clearCalculator();
      else if (key === 'C') { this.expression = '0'; this.calculator.waitingForOperand = false; }
      else if (key === '＝') this.calculateEquals();
      else if (['＋', '−', '×', '÷'].includes(key)) this.setOperator(key);
      else this.inputCalculatorDigit(key);
      this.updateCalculatorDisplay();
    }
    clearCalculator() {
      this.expression = '0'; this.calculator = { accumulator: null, operator: null, waitingForOperand: false, lastOperator: null, lastOperand: null };
    }
    resetCalculator() {
      this.clearCalculator();
      if (this.calculatorPositionFrame !== null && typeof root.cancelAnimationFrame === 'function') root.cancelAnimationFrame(this.calculatorPositionFrame);
      this.calculatorPositionFrame=null;
      this.calculatorPlacement=null;
      this.calculatorTarget=null;
      this.updateCalculatorDisplay();
      this.document.querySelectorAll?.('.amount-input.calculator-selected')?.forEach?.(field=>field.classList?.remove?.('calculator-selected'));
      const target=this.document.getElementById('calculator-target'); if(target)target.textContent='金額欄を選ぶと、現在の数字を計算機で修正できます';
      this.document.getElementById('question-form')?.classList?.remove?.('calculator-workspace-active');
      const calculatorPanel=this.document.querySelector?.('.calculator');
      if(calculatorPanel){
        calculatorPanel.open=false;
        calculatorPanel.classList?.remove?.('calculator-contextual-float');
        calculatorPanel.classList?.remove?.('calculator-placement-above');
        calculatorPanel.style?.removeProperty?.('left');
        calculatorPanel.style?.removeProperty?.('top');
        calculatorPanel.style?.removeProperty?.('width');
        calculatorPanel.style?.removeProperty?.('max-height');
        if (calculatorPanel.dataset) delete calculatorPanel.dataset.placement;
      }
    }
    inputCalculatorDigit(key) {
      if (this.expression === 'エラー' || this.calculator.waitingForOperand) { this.expression = '0'; this.calculator.waitingForOperand = false; }
      if (key === '.') { if (!this.expression.includes('.')) this.expression += '.'; return; }
      const next = this.expression === '0' ? key.replace(/^0+(?=\d)/, '') : this.expression + key;
      if (next.replace(/[-.]/g, '').length <= 12) this.expression = next || '0';
    }
    operate(left, operator, right) {
      return root.SafeCalculator.evaluate(`${left}${operator}${right}`);
    }
    setOperator(operator) {
      const value = Number(this.expression);
      if (!Number.isFinite(value)) return this.clearCalculator();
      if (this.calculator.operator && !this.calculator.waitingForOperand) this.calculator.accumulator = this.operate(this.calculator.accumulator, this.calculator.operator, value);
      else if (this.calculator.accumulator === null) this.calculator.accumulator = value;
      this.expression = String(this.calculator.accumulator); this.calculator.operator = operator; this.calculator.waitingForOperand = true;
      this.calculator.lastOperator = null; this.calculator.lastOperand = null;
    }
    calculateEquals() {
      let operator = this.calculator.operator; let operand = Number(this.expression); const repeating = !operator && this.calculator.lastOperator;
      if (repeating) { operator = this.calculator.lastOperator; operand = this.calculator.lastOperand; }
      if (!operator || this.calculator.accumulator === null) return;
      if (this.calculator.waitingForOperand && !repeating) operand = this.calculator.accumulator;
      try {
        const result = this.operate(this.calculator.accumulator, operator, operand);
        this.expression = String(result); this.calculator.accumulator = result; this.calculator.lastOperator = operator; this.calculator.lastOperand = operand; this.calculator.operator = null; this.calculator.waitingForOperand = true;
      } catch (_) { this.expression = 'エラー'; this.calculator.accumulator = null; this.calculator.operator = null; }
    }
    showGameOver() {
      // HP 0 is a recovery state, not a dismissible notification: move the
      // learner to the unresolved-document queue before presenting guidance.
      this.model.state.mode = 'review';
      this.model.save();
      this.renderModes();
      this.view.show('view-review');
      this.document.getElementById('question-filters').hidden = true;
      const dialog = this.document.getElementById('game-over-dialog');
      if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
    }
    restartAfterGameOver(review) {
      const dialog = this.document.getElementById('game-over-dialog'); dialog.close?.(); dialog.removeAttribute('open');
      this.rpg.resetCompanyHP(); this.view.updateRpg(this.rpg); this.renderModes();
      if (review) { this.showMode('review'); return; }
      if (this.model.state.mode === 'exam') this.examScores = [];
      const first = this.modeIds()[0];
      if (first) this.start(first); else this.showMode(this.model.state.mode);
    }
  }
  root.AppController = Controller;
}(window));
