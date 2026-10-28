(function (root) {
  'use strict';
  const normalizeNumber = value => String(value ?? '')
    .replace(/[０-９]/g, digit => String.fromCharCode(digit.charCodeAt(0) - 0xfee0))
    .replace(/，/g, ',');
  const validAmountText = value => value === '' || /^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(value);
  const normalizeShortDateInput = value => {
    const original = String(value ?? '').trim();
    const normalized = original
      .replace(/[０-９]/g, digit => String.fromCharCode(digit.charCodeAt(0) - 0xfee0))
      .replace(/／/g, '/')
      .replace(/年/g, '/')
      .replace(/月/g, '/')
      .replace(/日/g, '')
      .replace(/-/g, '/');
    let month; let day;
    const explicit = normalized.match(/^(\d{1,2})\/(\d{1,2})$/u);
    if (explicit) { month = Number(explicit[1]); day = Number(explicit[2]); }
    else if (/^\d{3,4}$/u.test(normalized)) {
      const split = normalized.length === 3 ? 1 : 2;
      month = Number(normalized.slice(0, split)); day = Number(normalized.slice(split));
    } else return original;
    const monthDays = [31,29,31,30,31,30,31,31,30,31,30,31];
    if (!Number.isInteger(month) || !Number.isInteger(day) || month < 1 || month > 12 || day < 1 || day > monthDays[month - 1]) return original;
    return `${month}/${day}`;
  };
  const yen = value => Number(value).toLocaleString('ja-JP');
  const GENERIC_AMOUNT_CONTENT_GLYPHS = 9;
  const journalAccountFontSize = value => {
    const glyphs = [...String(value ?? '').trim()].length;
    if (!glyphs || glyphs <= 5) return 16;
    if (glyphs <= 8) return 15;
    if (glyphs <= 10) return 14;
    return 13;
  };
  const genericTableInputCharacters = question => {
    const widths=new Map(); let inputIndex=0;
    for(const row of question.table?.rows||[]) Object.values(row).forEach((value,columnIndex)=>{
      if(value!=='入力')return;
      const column=question.table.columns[columnIndex],cellId=question.table.inputCells[inputIndex++];
      if((question.table.inputTypes?.[cellId]||'amount')!=='amount')return;
      widths.set(column,GENERIC_AMOUNT_CONTENT_GLYPHS);
    });
    return widths;
  };
  // accounting-domain.js is the production source of truth.  The two special
  // values below only keep isolated view unit tests fail-safe when scripts are
  // intentionally evaluated without the application bootstrap.
  const DOMAIN = root.AccountingDomain || { accountType: account => ({ '現金過不足':'temporary', '損益':'closing' })[account] || 'unknown', typeLabels:{ temporary:'仮勘定', closing:'決算勘定' } };
  const TABLE_LABELS = {
    account: '勘定科目', acquisitionCost: '取得原価', acquisitionDate: '取得日', amount: '金額', answer: '解答', asset: '固定資産',
    annualDepreciation: '年間減価償却額', balance: '残高', closingAccumulated: '期末減価償却累計額', closingBookValue: '期末帳簿価額', credit: '貸方', currentDepreciation: '当期減価償却額',
    date: '日付', debit: '借方', debitAccount: '借方科目', debitAmount: '借方金額', description: '摘要',
    disposalBookValue: '売却時帳簿価額', disposalLoss: '固定資産売却損', evidence: '証憑', item: '項目', life: '耐用年数', method: '償却方法', months: '使用月数', openingAccumulated: '期首減価償却累計額', quantity: '数量', residualValue: '残存価額',
    recorded: '帳簿の記録', section: '区分', transaction: '取引内容', unitPrice: '単価', value: '内容',
    creditAccount: '貸方科目', creditAmount: '貸方金額'
  };
  class AppView {
    constructor(document) { this.document = document; this.calculatorFirstInput = AppView.prefersCalculatorFirst(root); }
    static prefersCalculatorFirst(environment) {
      return environment.matchMedia?.('(hover: none) and (pointer: coarse)').matches === true;
    }
    static genericTableInputCharacters(question) { return genericTableInputCharacters(question); }
    static normalizeShortDateInput(value) { return normalizeShortDateInput(value); }
    static journalAccountFontSize(value) { return journalAccountFontSize(value); }
    byId(id) { return this.document.getElementById(id); }
    tableLabel(value) { return TABLE_LABELS[value] || value; }
    show(id) { this.document.querySelectorAll('.view').forEach(view => view.classList.toggle('active', view.id === id)); }
    showNotice(message, options = {}) {
      const dialog = this.byId('app-notice-dialog'); if (!dialog) return false;
      const title = this.byId('app-notice-title'); const body = this.byId('app-notice-message');
      const itemsBox = this.byId('app-notice-items');
      const cancel = this.byId('app-notice-cancel'); const confirm = this.byId('app-notice-confirm');
      title.textContent = options.title || 'お知らせ'; body.textContent = String(message ?? '');
      confirm.textContent = options.confirmLabel || '閉じる';
      cancel.hidden = !options.cancelLabel; cancel.textContent = options.cancelLabel || '戻る';
      const close = () => { if (typeof dialog.close === 'function' && dialog.open) dialog.close(); else dialog.removeAttribute('open'); };
      const noticeItems = Array.isArray(options.items) ? options.items.filter(item => item && item.id) : [];
      itemsBox.replaceChildren(...noticeItems.map(item => {
        const card = this.document.createElement('div'); card.className = 'app-notice-item';
        const copy = this.document.createElement('div'); copy.className = 'app-notice-item-copy';
        const label = this.document.createElement('strong'); label.textContent = item.label || item.id;
        const detail = this.document.createElement('p'); detail.textContent = item.detail || '';
        copy.append(label, detail);
        const button = this.document.createElement('button'); button.type = 'button'; button.className = 'secondary-button app-notice-item-action';
        button.textContent = options.itemActionLabel || '開く';
        button.setAttribute('aria-label', `${label.textContent}を開く`);
        button.onclick = () => { close(); if (typeof options.onItemSelect === 'function') options.onItemSelect(item); };
        card.append(copy, button); return card;
      }));
      itemsBox.hidden = noticeItems.length === 0;
      const cancelNotice = () => { close(); if (typeof options.onCancel === 'function') options.onCancel(); };
      cancel.onclick = cancelNotice;
      dialog.oncancel = event => { event.preventDefault(); cancelNotice(); };
      confirm.onclick = () => { close(); if (typeof options.onConfirm === 'function') options.onConfirm(); };
      if (typeof dialog.showModal === 'function') { if (!dialog.open) dialog.showModal(); }
      else dialog.setAttribute('open', '');
      (itemsBox.querySelector?.('button') || confirm).focus?.(); return true;
    }
    updateRpg(rpg) {
      const status = this.byId('player-status');
      const items = [
        ['現在の役割', `Lv.${rpg.level} ${rpg.role}`],
        ['経験値', `${yen(rpg.state.xp)} EXP`],
        ['帳簿信頼度', `${rpg.state.companyHP} / 100`]
      ];
      status.replaceChildren(...items.map(([label, value]) => {
        const group = this.document.createElement('div');
        const term = this.document.createElement('dt'); term.textContent = label;
        const description = this.document.createElement('dd'); description.textContent = value;
        group.append(term, description); return group;
      }));
      const details = `総取引処理額 ${yen(rpg.state.totalTransactionAmount)}円。解放ツール ${rpg.unlockedTools.join('・')}`;
      status.title = details;
      status.setAttribute('aria-label', `学習ステータス。${items.map(([label, value]) => `${label} ${value}`).join('。')}。${details}${rpg.progressCompleted ? '。主要実務を修了済みです' : ''}`);
      if (rpg.progressCompleted) status.setAttribute('data-completed', 'true'); else status.removeAttribute('data-completed');
      this.renderOperations(rpg);
    }
    renderOperations(rpg) {
      const panel = this.byId('unlocked-operations'); if (!panel) return;
      const operations = [
        { level:5, label:'税込・税抜クイック計算', action:'tax-calculate', detail:'請求書の税込額を即座に確認' },
        { level:10, label:'過去ログ分析', action:'open-log-analysis', detail:'誤答傾向から次の調査先を特定' },
        { level:20, label:'月次決算の特別案件', action:'start-boss', boss:'monthly', detail:'試算表・精算表の難関案件' },
        { level:30, label:'年度決算の特別案件', action:'start-boss', boss:'annual', detail:'財務諸表を完成させ社長へ報告' }
      ];
      panel.replaceChildren(...operations.map(item => {
        const card = this.document.createElement('article'); card.className = `operation-card${rpg.level >= item.level ? ' unlocked' : ' locked'}`;
        const badge = this.document.createElement('small'); badge.textContent = rpg.level >= item.level ? '解放済み' : `Lv.${item.level}で解放`;
        const title = this.document.createElement('strong'); title.textContent = item.label;
        const detail = this.document.createElement('p'); detail.textContent = item.detail;
        const button = this.document.createElement('button'); button.type = 'button'; button.dataset.action = item.action; if (item.boss) button.dataset.boss = item.boss;
        button.textContent = rpg.level >= item.level ? (item.boss ? '案件に挑む' : 'ツールを開く') : '未解放'; button.disabled = rpg.level < item.level;
        if (item.level === 5) button.addEventListener('click', () => { const tool = this.byId('tax-tool'); tool.hidden = !tool.hidden; });
        card.append(badge, title, detail, button); return card;
      }));
    }
    renderQuestion(question, draft, mode = 'story') {
      this.questionMode = mode;
      const hintSupport = this.byId('protected-learning'); if (hintSupport) hintSupport.hidden = mode === 'exam';
      const accountCategorySpoiler = question.type === 'journal'
        && [...(question.answer?.debit || []), ...(question.answer?.credit || [])]
          .some(item => item.account === question.category);
      const visibleCategory = accountCategorySpoiler ? '仕訳問題' : question.category;
      this.byId('q-category').textContent = `第${question.chapter}章｜${visibleCategory}`;
      const story = this.byId('q-story'); story.hidden = mode !== 'story';
      if (!story.hidden) {
        // Keep the story meaningful without exposing the exact answer account
        // through a category label embedded in the narrative.
        let visibleStory = String(question.story || '');
        if (accountCategorySpoiler) {
          visibleStory = visibleStory.replaceAll(`「${question.category}」に関する`, '今回の取引に関する');
          visibleStory = visibleStory.split('。').filter(sentence => !sentence.includes(question.category)).join('。');
        }
        this.byId('q-scene').textContent = question.scene;
        this.byId('q-context').textContent = visibleStory;
        this.byId('q-task').textContent = `今回の仕事：${visibleCategory}`;
      }
      this.byId('q-text').textContent = question.question;
      this.renderMaterials(question);
      const journalContainer = this.byId('journal-container');
      const tableContainer = this.byId('table-container');
      journalContainer.hidden = question.type !== 'journal';
      tableContainer.hidden = question.type === 'journal';
      if (question.type === 'journal') tableContainer.replaceChildren();
      else journalContainer.replaceChildren();
      if (question.type === 'journal') this.renderJournal(question, draft, mode);
      else if (question.type === 'correction') this.renderCorrection(question, draft);
      else if (question.format === 'journal-book' && question.table?.inputCells?.includes('d1Account')) this.renderJournalBook(question, draft, mode);
      else if (question.format?.startsWith('bookkeeping-')) this.renderBookkeepingForm(question, draft);
      else if (question.format === 'balance-sheet') this.renderBalanceSheet(question, draft);
      else if (question.format === 'fixed-asset-ledger') this.renderFixedAssetLedger(question, draft);
      else this.renderTable(question, draft);
    }
    parseComprehensiveTrialBalance(value) {
      return String(value ?? '').split('、').map(item => item.trim()).filter(Boolean).map(item => {
        const match = item.match(/^(.*?)(-?[0-9０-９,，]+)$/u);
        if (!match) return { account:item, amount:null };
        return {
          account:match[1].trim(),
          amount:Number(normalizeNumber(match[2]).replace(/,/g, ''))
        };
      });
    }
    renderComprehensiveTrialBalanceMobile(material) {
      const table = this.document.createElement('table'); table.className = 'comprehensive-trial-balance-mobile';
      const head = table.createTHead().insertRow();
      ['勘定科目','借方','貸方'].forEach(label => {
        const th = this.document.createElement('th'); th.scope = 'col'; th.textContent = label; head.append(th);
      });
      const body = table.createTBody();
      const appendRow = (entry, side) => {
        const row = body.insertRow();
        const account = row.insertCell(); account.textContent = entry.account;
        const debit = row.insertCell(); const credit = row.insertCell();
        if (entry.amount != null) (side === 'debit' ? debit : credit).textContent = yen(entry.amount);
      };
      this.parseComprehensiveTrialBalance(material['借方']).forEach(entry => appendRow(entry, 'debit'));
      this.parseComprehensiveTrialBalance(material['貸方']).forEach(entry => appendRow(entry, 'credit'));
      const total = body.insertRow(); total.className = 'comprehensive-trial-balance-total';
      const label = total.insertCell(); label.textContent = '合計';
      const debitTotal = total.insertCell(); debitTotal.textContent = yen(material['借方合計']);
      const creditTotal = total.insertCell(); creditTotal.textContent = yen(material['貸方合計']);
      return table;
    }
    renderComprehensiveMaterialsMobile(question) {
      const flow = this.document.createElement('div'); flow.className = 'comprehensive-material-flow';
      question.materials.forEach((material, index) => {
        const card = this.document.createElement('section'); card.className = 'comprehensive-material-card';
        const title = this.document.createElement('h4'); title.textContent = material['資料区分'] || `資料${index + 1}`;
        card.append(title);
        if (title.textContent === '整理前残高試算表') {
          card.append(this.renderComprehensiveTrialBalanceMobile(material));
          flow.append(card);
          return;
        }
        Object.entries(material).forEach(([key, value]) => {
          if (key === '資料区分' || value == null || value === '') return;
          if (key === '内容' && title.textContent === '決算整理事項') {
            const list = this.document.createElement('ol'); list.className = 'comprehensive-adjustment-list';
            String(value).split('／').filter(Boolean).forEach(text => { const item = this.document.createElement('li'); item.textContent = text; list.append(item); });
            card.append(list); return;
          }
          const field = this.document.createElement('div'); field.className = 'comprehensive-material-field';
          const label = this.document.createElement('strong'); label.textContent = this.tableLabel(key);
          const content = this.document.createElement('span'); content.textContent = typeof value === 'number' ? yen(value) : String(value);
          field.append(label, content); card.append(field);
        });
        flow.append(card);
      });
      return flow;
    }
    renderMaterials(question) {
      let container = this.byId('question-materials');
      if (!container) { container = this.document.createElement('section'); container.id = 'question-materials'; container.className = 'question-materials'; this.byId('q-text').after(container); }
      container.replaceChildren(); container.hidden = !Array.isArray(question.materials) || question.materials.length === 0;
      if (container.hidden) return;
      container.dataset.questionType = question.type;
      const heading = this.document.createElement('h3'); heading.textContent = question.materialTitle || '資料';
      if (question.type === 'comprehensive' && this.compactWorksheetViewport()) {
        container.append(heading, this.renderComprehensiveMaterialsMobile(question));
        return;
      }
      const wrap = this.document.createElement('div'); wrap.className = 'materials-table-wrap';
      const table = this.document.createElement('table'); table.className = 'materials-table';
      const columns = [...new Set(question.materials.flatMap(row => Object.keys(row)))];
      const compact = (question.type === 'worksheet' || question.type === 'financial_statement') && columns.length <= 3;
      wrap.classList.toggle('materials-table-wrap-compact', compact); table.classList.toggle('materials-table-compact', compact);
      const head = table.createTHead().insertRow(); columns.forEach(column => { const th = this.document.createElement('th'); th.textContent = this.tableLabel(column); head.append(th); });
      const body = table.createTBody(); question.materials.forEach(material => { const row = body.insertRow(); columns.forEach(column => { const cell = row.insertCell(); const value = material[column]; cell.textContent = value == null ? '—' : typeof value === 'number' ? yen(value) : value; }); });
      wrap.append(table); container.append(heading, wrap);
      if (Array.isArray(question.adjustments) && question.adjustments.length) {
        const section = this.document.createElement('section'); section.className = 'question-adjustments'; section.setAttribute('aria-label', '決算整理事項');
        const title = this.document.createElement('h4'); title.textContent = '決算整理事項';
        const list = this.document.createElement('ol'); question.adjustments.forEach(text => { const item = this.document.createElement('li'); item.textContent = text; list.append(item); });
        section.append(title, list); container.append(section);
      }
    }
    makeAmount(className, label, value = '') {
      const input = this.document.createElement('input'); input.type = 'text'; input.setAttribute('inputmode', this.calculatorFirstInput ? 'none' : 'numeric');
      input.setAttribute('autocomplete', 'off'); input.setAttribute('enterkeyhint', 'done');
      input.className = `${className} amount-input`; input.setAttribute('aria-label', label); input.setAttribute('pattern', '(?:[0-9０-９]+|[0-9０-９]{1,3}(?:[,，][0-9０-９]{3})+)');
      input.readOnly = this.calculatorFirstInput;
      input.setAttribute('title', this.calculatorFirstInput ? '金額欄を選び、アプリ内計算機で入力します' : '数字を直接入力できます。必要に応じて計算機も使えます'); input.maxLength = 24; input.value = value;
      return input;
    }
    makeText(className, label, value = '') {
      const input = this.document.createElement('input'); input.type = 'text'; input.className = `${className} table-text-input`;
      input.setAttribute('aria-label', label); input.setAttribute('enterkeyhint', 'done'); input.setAttribute('autocomplete', 'off'); input.maxLength = 120; input.value = value; return input;
    }
    makeShortDateInput(className, label, value = '', placeholder = '例：7/1') {
      const input = this.makeText(className, label, value); input.classList.add('short-date-input'); input.setAttribute('inputmode', 'numeric'); input.maxLength = 8; input.placeholder = placeholder;
      const normalize = () => { const next = normalizeShortDateInput(input.value); if (next !== input.value) { input.value = next; const EventCtor = input.ownerDocument?.defaultView?.Event || root.Event; if (EventCtor) input.dispatchEvent(new EventCtor('input', { bubbles:true })); } };
      input.addEventListener('blur', normalize); input.addEventListener('change', normalize); return input;
    }
    makeDatePicker(input, label) {
      const control = this.document.createElement('span'); control.className = 'date-picker-control';
      const icon = this.document.createElement('span'); icon.className = 'date-picker-icon'; icon.setAttribute('aria-hidden', 'true'); icon.textContent = '📅';
      const picker = this.document.createElement('input'); picker.type = 'date'; picker.className = 'date-picker-native'; picker.setAttribute('aria-label', `カレンダーから${label}を選ぶ`);
      const sync = () => { const value = normalizeShortDateInput(input.value); const match = value.match(/^(\d{1,2})\/(\d{1,2})$/u); picker.value = match ? `2000-${String(Number(match[1])).padStart(2,'0')}-${String(Number(match[2])).padStart(2,'0')}` : ''; };
      input.addEventListener('blur', sync); input.addEventListener('change', sync); sync();
      picker.addEventListener('change', () => { const match = picker.value.match(/^\d{4}-(\d{2})-(\d{2})$/u); if (!match) return; input.value = `${Number(match[1])}/${Number(match[2])}`; const EventCtor = input.ownerDocument?.defaultView?.Event || root.Event; if (EventCtor) { input.dispatchEvent(new EventCtor('input', { bubbles:true })); input.dispatchEvent(new EventCtor('change', { bubbles:true })); } });
      control.append(icon, picker); return control;
    }
    updateJournalAccountPresentation(select) {
      const value = select.value || '';
      select.style.setProperty('--journal-account-font-size', `${journalAccountFontSize(value)}px`);
      select.dataset.accountGlyphs = String([...String(value)].length);
    }
    updateSelectTitle(select) {
      const text = select.selectedOptions[0]?.textContent || '';
      select.title = text;
      if (select.classList?.contains('debit-account') || select.classList?.contains('credit-account') || select.classList?.contains('correction-account')) this.updateJournalAccountPresentation(select);
      const display = select.parentElement?.querySelector?.('.journal-account-display');
      if (display) {
        display.textContent = text;
        display.dataset.empty = select.value ? 'false' : 'true';
      }
    }
    journalAccountControl(select) {
      const control = this.document.createElement('span'); control.className = 'journal-account-control';
      const display = this.document.createElement('span'); display.className = 'journal-account-display'; display.setAttribute('aria-hidden', 'true');
      control.append(select, display); this.updateSelectTitle(select); return control;
    }
    renderJournal(question, draft = {}, mode = 'story') {
      const container = this.byId('journal-container'); container.replaceChildren();
      if (mode === 'exam') {
        const instruction = this.document.createElement('p'); instruction.className = 'journal-instruction';
        instruction.textContent = '必要な行だけ入力し、不要な行は空欄のままにしてください。'; container.append(instruction);
      }
      const grid = this.document.createElement('div'); grid.className = 'journal-grid-scroll';
      const header = this.document.createElement('div'); header.className = 'journal-header'; header.innerHTML = '<span>借方科目</span><span>借方金額</span><span>貸方科目</span><span>貸方金額</span>'; grid.append(header);
      const count = mode === 'exam' ? 3 : Math.max(question.answer.debit.length, question.answer.credit.length);
      for (let index = 0; index < count; index += 1) {
        const row = this.document.createElement('div'); row.className = 'journal-row';
        ['debit', 'credit'].forEach(side => {
          const answer = mode === 'exam' ? null : question.answer[side][index];
          const enabled = mode === 'exam' || Boolean(answer);
          const select = this.document.createElement('select'); select.className = `${side}-account`; select.disabled = !enabled;
          select.innerHTML = `<option value="">${enabled ? '--勘定科目--' : '--入力なし--'}</option>`;
          if (enabled) root.AppController.accountChoices(question, answer?.account, mode).forEach(name => select.append(new Option(name, name)));
          const saved = draft[side] && draft[side][index]; if (saved) select.value = saved.account;
          const amount = this.makeAmount(`${side}-amount`, `${side === 'debit' ? '借方' : '貸方'} ${index + 1}行目の金額`, saved ? saved.amount : '');
          if (!enabled) amount.disabled = true;
          row.append(this.journalAccountControl(select), amount);
        }); grid.append(row);
      }
      container.append(grid);
    }
    renderCorrection(question, draft = {}) {
      const container = this.byId('table-container'); container.replaceChildren();
      container.classList.remove('worksheet-scroll');
      const entry = this.document.createElement('div'); entry.className = 'correction-entry';
      const header = this.document.createElement('div'); header.className = 'correction-header';
      header.innerHTML = '<span>借方科目</span><span>借方金額</span><span>貸方科目</span><span>貸方金額</span>';
      const row = this.document.createElement('div'); row.className = 'correction-row';
      ['debitAccount', 'debitAmount', 'creditAccount', 'creditAmount'].forEach(cellId => {
        const label = this.tableLabel(cellId); const inputType = question.table.inputTypes?.[cellId];
        let input;
        if (inputType === 'account') {
          input = this.document.createElement('select'); input.className = 'table-input correction-account'; input.setAttribute('aria-label', label);
          input.append(new Option('--勘定科目--', ''));
          root.AppController.accountChoices(question, question.answer.cells[cellId]).forEach(name => input.append(new Option(name, name)));
          input.value = draft.cells?.[cellId] ?? '';
        } else input = this.makeAmount('table-input correction-amount', `${label}（金額）`, draft.cells?.[cellId] ?? '');
        input.dataset.cellId = cellId; input.dataset.inputType = inputType;
        row.append(inputType === 'account' ? this.journalAccountControl(input) : input);
      });
      entry.append(header, row); container.append(entry);
    }
    renderJournalBook(question, draft = {}, mode = 'story') {
      const container = this.byId('table-container'); container.replaceChildren();
      container.classList.add('journal-book-scroll');
      const guidance = this.document.createElement('div'); guidance.className = 'journal-book-guidance';
      const folioHelp = this.document.createElement('p'); folioHelp.id = 'journal-book-folio-help'; folioHelp.className = 'journal-book-folio-help'; folioHelp.textContent = '元丁：総勘定元帳の転記先を示す番号';
      const scrollHelp = this.document.createElement('p'); scrollHelp.className = 'journal-book-scroll-note'; scrollHelp.textContent = '横にスクロールして借方・貸方を入力できます。';
      guidance.append(folioHelp, scrollHelp); container.append(guidance);
      const table = this.document.createElement('table'); table.className = 'journal-book-entry';
      const head = table.createTHead().insertRow();
      ['日付', '摘要', '元丁', '借方', '貸方'].forEach(label => {
        const th = this.document.createElement('th'); th.textContent = label; th.scope = 'col'; head.append(th);
      });
      const body = table.createTBody();
      const accountControl = (cellId, amountContext) => {
        const label = this.cellLabel(question, cellId);
        const select = this.document.createElement('select'); select.className = 'table-input journal-book-account'; select.setAttribute('aria-label', label);
        select.append(new Option('--勘定科目--', ''));
        root.AppController.accountChoices(question, question.answer.cells[cellId], mode).forEach(name => select.append(new Option(name, name)));
        select.value = draft.cells?.[cellId] ?? ''; select.dataset.cellId = cellId; select.dataset.inputType = 'account'; select.dataset.semanticType = 'account';
        const updateAmountContext = () => { const name = select.value || '科目'; amountContext.textContent = name; amountContext.title = select.value || '勘定科目を選択してください'; };
        select.addEventListener('change', updateAmountContext); updateAmountContext();
        this.updateSelectTitle(select); return select;
      };
      const folioControl = cellId => {
        const label = this.cellLabel(question, cellId); const input = this.makeText('table-input folio-input', label, draft.cells?.[cellId] ?? '');
        input.dataset.cellId = cellId; input.dataset.inputType = 'folio'; input.dataset.semanticType = 'folio'; input.setAttribute('aria-describedby', folioHelp.id); return input;
      };
      const amountControl = cellId => {
        const label = this.cellLabel(question, cellId); const input = this.makeAmount('table-input', `${label}（金額）`, draft.cells?.[cellId] ?? '');
        input.dataset.cellId = cellId; input.dataset.inputType = 'amount'; input.dataset.semanticType = 'amount'; return input;
      };
      const amountContext = () => { const context = this.document.createElement('span'); context.className = 'journal-book-amount-context'; context.setAttribute('aria-hidden', 'true'); context.textContent = '科目'; return context; };
      const appendAmount = (cell, input, context) => {
        const line = this.document.createElement('span'); line.className = 'bookkeeping-input-line'; line.append(context, input);
        const unit = this.document.createElement('span'); unit.className = 'bookkeeping-unit'; unit.textContent = '円'; line.append(unit); cell.append(line);
      };
      for (let index = 1; question.table.inputCells.includes(`d${index}Account`); index += 1) {
        const dateId = `date${index}`;
        const dateLabel = this.cellLabel(question, dateId);
        const debit = body.insertRow(); debit.className = 'journal-book-transaction-start';
        const dateCell = debit.insertCell(); dateCell.className = 'journal-book-date-cell'; dateCell.rowSpan = 2;
        const dateInput = this.makeShortDateInput('table-input journal-book-date', dateLabel, draft.cells?.[dateId] ?? '', '月/日');
        dateInput.dataset.cellId = dateId; dateInput.dataset.inputType = 'date'; dateInput.dataset.semanticType = 'date'; dateCell.append(dateInput);
        const debitContext = amountContext();
        const debitSummary = debit.insertCell(); debitSummary.className = 'journal-book-summary-cell'; debitSummary.append(accountControl(`d${index}Account`, debitContext));
        const debitFolio = debit.insertCell(); debitFolio.className = 'journal-book-folio-cell'; debitFolio.append(folioControl(`d${index}Ref`));
        const debitAmount = debit.insertCell(); debitAmount.className = 'journal-book-amount-cell'; appendAmount(debitAmount, amountControl(`d${index}Amount`), debitContext);
        const debitBlank = debit.insertCell(); debitBlank.className = 'journal-book-empty-cell'; debitBlank.setAttribute('aria-hidden', 'true');

        const credit = body.insertRow(); credit.className = 'journal-book-credit-row';
        const creditContext = amountContext();
        const creditSummary = credit.insertCell(); creditSummary.className = 'journal-book-summary-cell'; creditSummary.append(accountControl(`c${index}Account`, creditContext));
        const creditFolio = credit.insertCell(); creditFolio.className = 'journal-book-folio-cell'; creditFolio.append(folioControl(`c${index}Ref`));
        const creditBlank = credit.insertCell(); creditBlank.className = 'journal-book-empty-cell'; creditBlank.setAttribute('aria-hidden', 'true');
        const creditAmount = credit.insertCell(); creditAmount.className = 'journal-book-amount-cell'; appendAmount(creditAmount, amountControl(`c${index}Amount`), creditContext);
      }
      container.append(table);
    }
    renderBookkeepingForm(question, draft = {}) {
      const wrap = this.byId('table-container'); wrap.replaceChildren();
      wrap.classList.remove('worksheet-scroll', 'journal-book-scroll');
      const book = this.document.createElement('section'); book.className = `bookkeeping-form ${question.format}`; book.setAttribute('aria-label', question.category);
      const heading = this.document.createElement('h3'); heading.className = 'bookkeeping-form-title'; heading.textContent = question.category; book.append(heading);
      const cells = question.table.inputCells || [];
      const fallbackLabels = Object.fromEntries(cells.map((id, index) => [id, Object.values(question.table.rows?.[index] || {})[0]]));
      const numberedRecords = /^bookkeeping-notes-/.test(question.format) && cells.some(id => /1$/.test(id))
        ? [['手形1', cells.filter(id => /1$/.test(id))], ['手形2', cells.filter(id => /2$/.test(id))], ['合計', cells.filter(id => !/[12]$/.test(id))]]
        : [[question.format === 'bookkeeping-account-ledger' ? '勘定の流れ' : '記入する帳簿行', cells]];
      const records = this.document.createElement('div'); records.className = 'bookkeeping-records';
      for (const [recordTitle, recordCells] of numberedRecords.filter(([, ids]) => ids.length)) {
        const record = this.document.createElement('section'); record.className = 'bookkeeping-record';
        const recordHeading = this.document.createElement('h4'); recordHeading.className = 'bookkeeping-record-title'; recordHeading.textContent = recordTitle; record.append(recordHeading);
        const fields = this.document.createElement('div'); fields.className = 'bookkeeping-record-fields';
        for (const cellId of recordCells) {
        const metadata = question.table.inputMetadata?.[cellId] || {};
        const semanticType = metadata.semanticType || question.table.inputTypes?.[cellId] || 'text';
        const field = this.document.createElement('div'); field.className = 'bookkeeping-field'; field.dataset.semanticType = semanticType; field.dataset.cell = cellId;
        const label = this.document.createElement('label'); label.textContent = metadata.label || fallbackLabels[cellId] || this.tableLabel(cellId); label.htmlFor = `bookkeeping-${question.id}-${cellId}`;
        const amountLike = semanticType === 'amount' || semanticType === 'unitPrice';
        const input = amountLike ? this.makeAmount('table-input bookkeeping-input', `${label.textContent}（金額）`, draft.cells?.[cellId] ?? '') : semanticType === 'date' ? this.makeShortDateInput('table-input bookkeeping-input', label.textContent, draft.cells?.[cellId] ?? '', '例：6/5') : this.makeText('table-input bookkeeping-input', label.textContent, draft.cells?.[cellId] ?? '');
        input.id = label.htmlFor; input.dataset.cellId = cellId; input.dataset.inputType = semanticType; input.dataset.semanticType = semanticType;
        if (semanticType === 'folio') input.classList.add('folio-input');
        if (semanticType === 'account') input.classList.add('account-input');
        const line = this.document.createElement('div'); line.className = 'bookkeeping-input-line'; if (semanticType === 'date') line.append(input, this.makeDatePicker(input, label.textContent)); else line.append(input);
        const units = { amount:'円', unitPrice:'円', months:'か月', years:'年' };
        if (units[semanticType]) { const unit = this.document.createElement('span'); unit.className = 'bookkeeping-unit'; unit.textContent = units[semanticType]; line.append(unit); }
        field.append(label, line); fields.append(field);
        }
        record.append(fields); records.append(record);
      }
      book.append(records); wrap.append(book);
    }
    accountType(account) {
      return DOMAIN.accountType(account);
    }
    accountLabel(account) {
      const wrap = this.document.createElement('span'); wrap.className = 'account-with-badge';
      const name = this.document.createElement('span'); name.textContent = account || '（未入力）'; wrap.append(name);
      if (account) { const type = this.accountType(account); const badge = this.document.createElement('span'); badge.className = `account-badge account-badge-${type}`; badge.textContent = DOMAIN.typeLabels[type] || '科目'; wrap.append(badge); }
      return wrap;
    }
    compactWorksheetViewport() {
      return Boolean(root.matchMedia?.('(max-width: 900px)').matches);
    }
    renderWorksheetMobile(question, draft, wrap) {
      const adjustmentGuide = Array.isArray(question.adjustments) && question.adjustments.length
        ? question.adjustments.join('／')
        : '決算整理事項を確認します。';
      const groups = [
        {
          title:'試算表',
          instruction:'元の残高を確認します。',
          reference:'元試算表：勘定科目ごとの借方・貸方残高を確認します。',
          columns:[1,2]
        },
        {
          title:'修正記入',
          instruction:'決算整理事項を借方・貸方へ反映します。',
          reference:`決算整理事項：${adjustmentGuide}`,
          columns:[3,4]
        },
        {
          title:'損益計算書',
          instruction:'収益・費用を損益計算書へ振り分けます。',
          reference:'元試算表の売上・仕入・保険料と、修正記入で反映した決算整理事項を確認します。',
          columns:[5,6]
        },
        {
          title:'貸借対照表',
          instruction:'資産・負債・純資産を貸借対照表へ振り分けます。',
          reference:'元試算表の資産・負債・純資産と、修正記入で反映した決算整理事項、損益計算書の貸借差額を確認します。',
          columns:[7,8]
        }
      ];
      const cellIds = new Map(); let inputIndex = 0;
      (question.table.rows || []).forEach((rowData, rowIndex) => Object.values(rowData).forEach((value, columnIndex) => {
        if (value === '入力') cellIds.set(rowIndex + ':' + columnIndex, question.table.inputCells[inputIndex++]);
      }));
      const flow = this.document.createElement('div'); flow.className = 'worksheet-mobile-flow'; flow.setAttribute('aria-label', '8欄精算表を4つの処理に分けて入力');
      const appendValue = (cell, value, rowIndex, columnIndex) => {
        if (value !== '入力') {
          cell.textContent = value == null || value === '' ? '—' : typeof value === 'number' ? yen(value) : this.tableLabel(value);
          if (typeof value === 'number') cell.classList.add('amount-cell');
          return;
        }
        const id = cellIds.get(rowIndex + ':' + columnIndex);
        const inputType = question.table.inputTypes?.[id] || 'amount';
        const metadata = question.table.inputMetadata?.[id];
        const label = metadata?.label || this.cellLabel(question, id);
        const input = inputType === 'amount'
          ? this.makeAmount('table-input worksheet-mobile-input', label + '（金額）', draft.cells?.[id] ?? '')
          : this.makeText('table-input worksheet-mobile-input', label, draft.cells?.[id] ?? '');
        input.dataset.cellId = id; input.dataset.inputType = inputType; cell.classList.add('worksheet-mobile-editable');
        cell.append(input);
      };
      groups.forEach((group, groupIndex) => {
        const section = this.document.createElement('section'); section.className = 'worksheet-mobile-section'; section.dataset.worksheetGroup = group.title;
        const header = this.document.createElement('div'); header.className = 'worksheet-mobile-section-head';
        const step = this.document.createElement('span'); step.className = 'worksheet-mobile-step'; step.textContent = (groupIndex + 1) + '/4';
        const title = this.document.createElement('h3'); title.textContent = group.title;
        const instruction = this.document.createElement('p'); instruction.textContent = group.instruction;
        const reference = this.document.createElement('aside'); reference.className = 'worksheet-mobile-reference';
        const referenceLabel = this.document.createElement('strong'); referenceLabel.textContent = 'ここを見る';
        const referenceText = this.document.createElement('p'); referenceText.textContent = group.reference;
        reference.append(referenceLabel, referenceText);
        header.append(step, title); section.append(header, instruction, reference);
        const table = this.document.createElement('table'); table.className = 'worksheet-mobile-table';
        const head = table.createTHead().insertRow(); ['勘定科目','借方','貸方'].forEach(label => { const th = this.document.createElement('th'); th.textContent = label; th.scope = 'col'; head.append(th); });
        const body = table.createTBody();
        (question.table.rows || []).forEach((rowData, rowIndex) => {
          const values = Object.values(rowData); const debit = values[group.columns[0]], credit = values[group.columns[1]];
          const empty = [debit, credit].every(value => value == null || value === '' || value === '—');
          if (empty) return;
          const row = body.insertRow(); const account = row.insertCell(); account.className = 'worksheet-mobile-account'; account.textContent = values[0];
          const debitCell = row.insertCell(); appendValue(debitCell, debit, rowIndex, group.columns[0]);
          const creditCell = row.insertCell(); appendValue(creditCell, credit, rowIndex, group.columns[1]);
        });
        section.append(table); flow.append(section);
      });
      wrap.append(flow);
    }
    renderTable(question, draft = {}) {
      const wrap = this.byId('table-container'); wrap.replaceChildren();
      const compactWorksheet = question.format === 'eight-column-worksheet' && this.compactWorksheetViewport();
      wrap.classList.toggle('worksheet-scroll', question.format === 'eight-column-worksheet' && !compactWorksheet);
      wrap.classList.toggle('worksheet-mobile-mode', compactWorksheet);
      if (question.format === 'eight-column-worksheet') {
        const guide = this.document.createElement('aside'); guide.className = 'worksheet-guide';
        const title = this.document.createElement('strong'); title.textContent = '8欄精算表は、4組の借方・貸方を一つにつないだ表です';
        const detail = this.document.createElement('p'); detail.textContent = compactWorksheet
          ? 'スマートフォンでは、試算表 → 修正記入 → 損益計算書 → 貸借対照表の順に3列ずつ表示します。'
          : '試算表・修正記入・損益計算書・貸借対照表に、それぞれ借方と貸方があります。';
        guide.append(title, detail); wrap.append(guide);
        if (compactWorksheet) { this.renderWorksheetMobile(question, draft, wrap); return; }
      }
      const table = this.document.createElement('table'); table.className = `answer-table${question.format === 'eight-column-worksheet' ? ' eight-column-worksheet' : ''}`;
      table.dataset.questionType = question.type;
      const columnTypes = new Map((question.table.columns || []).map(column => [column, 'text']));
      const inputCharacters = genericTableInputCharacters(question);
      if (question.format !== 'eight-column-worksheet') {
        let profileInputIndex = 0;
        for (const row of question.table.rows || []) Object.values(row).forEach((value, columnIndex) => {
          const column = question.table.columns[columnIndex];
          if (value === '入力') {
            const cellId = question.table.inputCells[profileInputIndex++];
            columnTypes.set(column, question.table.inputTypes?.[cellId] === 'account' ? 'account' : question.table.inputTypes?.[cellId] === 'text' ? 'text' : 'numeric');
          } else if (typeof value === 'number' && columnTypes.get(column) === 'text') columnTypes.set(column, 'numeric');
        });
        for (const column of question.table.columns || []) {
          if (column === 'life') columnTypes.set(column, 'years');
          else if (column === 'date') columnTypes.set(column, 'date');
          else if (column === 'quantity') columnTypes.set(column, 'quantity');
          else if (column === 'unitPrice') columnTypes.set(column, 'unit-price');
          else if (column === 'description') columnTypes.set(column, 'description');
          else if (/account/i.test(column) || column === 'account') columnTypes.set(column, 'account');
        }
        if (inputCharacters.size) table.style.setProperty('--table-input-ch', `${Math.max(...inputCharacters.values())}ch`);
        table.dataset.sizing = 'semantic-content';
      }
      if (question.format === 'eight-column-worksheet') table.setAttribute('role', 'grid');
      const thead = table.createTHead();
      if (question.format === 'eight-column-worksheet') {
        const groupHead = thead.insertRow();
        const accountHead = this.document.createElement('th'); accountHead.textContent = '勘定科目'; accountHead.rowSpan = 2; accountHead.scope = 'col'; groupHead.append(accountHead);
        ['試算表', '修正記入', '損益計算書', '貸借対照表'].forEach(label => { const th = this.document.createElement('th'); th.textContent = label; th.colSpan = 2; th.scope = 'colgroup'; groupHead.append(th); });
        const sideHead = thead.insertRow();
        for (let index = 0; index < 4; index += 1) ['借方', '貸方'].forEach(label => { const th = this.document.createElement('th'); th.textContent = label; th.scope = 'col'; sideHead.append(th); });
      } else {
        const head = thead.insertRow(); question.table.columns.forEach(column => { const th = this.document.createElement('th'); th.textContent = this.tableLabel(column); th.scope = 'col'; th.dataset.columnKey = column; th.dataset.columnType = columnTypes.get(column); head.append(th); });
      }
      const body = table.createTBody(); let inputIndex = 0;
      question.table.rows.forEach(rowData => {
        const row = body.insertRow(); if (question.type === 'trial_balance' && Object.values(rowData).includes('入力')) row.classList.add('trial-balance-total-row'); if (question.format === 'eight-column-worksheet') row.setAttribute('role', 'row'); Object.values(rowData).forEach((value, columnIndex) => {
          const cell = row.insertCell();
          if (question.format !== 'eight-column-worksheet') { cell.dataset.columnKey = question.table.columns[columnIndex]; cell.dataset.columnType = columnTypes.get(question.table.columns[columnIndex]); }
          if (question.format === 'eight-column-worksheet') cell.setAttribute('role', 'gridcell');
          if (question.format === 'eight-column-worksheet' && columnIndex > 0) cell.classList.add('worksheet-value-cell');
          if (value === '入力') {
            const id = question.table.inputCells[inputIndex++]; const inputType = question.table.inputTypes?.[id] || 'amount';
            const metadata = question.table.inputMetadata?.[id]; const label = metadata?.label || this.cellLabel(question, id);
            const input = inputType === 'amount' ? this.makeAmount('table-input', `${label}（金額）`, draft.cells?.[id] ?? '') : inputType === 'date' ? this.makeShortDateInput('table-input', label, draft.cells?.[id] ?? '') : this.makeText('table-input', label, draft.cells?.[id] ?? '');
            if (inputType === 'amount') cell.classList.add('amount-cell');
            if (inputType === 'amount') cell.style.setProperty('--column-input-ch', `${inputCharacters.get(question.table.columns[columnIndex]) || 9}ch`);
            input.dataset.cellId = id; input.dataset.inputType = inputType; if (inputType === 'date') { const line = this.document.createElement('div'); line.className = 'table-date-input-line'; line.append(input, this.makeDatePicker(input, label)); cell.append(line); } else cell.append(input);
          }
          else { cell.textContent = value == null ? '' : typeof value === 'number' ? yen(value) : this.tableLabel(value); if (typeof value === 'number') cell.classList.add('amount-cell'); }
        });
      }); wrap.append(table); if (question.format !== 'eight-column-worksheet') this.positionStickyContextColumns(table);
    }
    renderFixedAssetLedger(question, draft = {}) {
      const wrap = this.byId('table-container'); wrap.replaceChildren();
      wrap.classList.remove('worksheet-scroll', 'journal-book-scroll');
      const ledger = this.document.createElement('div'); ledger.className = 'fixed-asset-ledger'; let inputIndex = 0;
      for (const [rowIndex, row] of question.table.rows.entries()) {
        const section = this.document.createElement('section'); section.className = 'fixed-asset-card';
        const title = this.document.createElement('h3'); title.textContent = row.asset || `固定資産${rowIndex + 1}`; section.append(title);
        const fields = this.document.createElement('div'); fields.className = 'fixed-asset-fields';
        for (const [key, value] of Object.entries(row)) {
          if (key === 'asset') continue;
          const field = this.document.createElement('div'); field.className = 'fixed-asset-field'; field.dataset.field = key;
          if (value === '入力') {
            const cellId = question.table.inputCells[inputIndex++]; const metadata = question.table.inputMetadata?.[cellId] || {};
            const semanticType = metadata.semanticType || 'amount'; const label = this.document.createElement('label');
            label.textContent = metadata.label || this.tableLabel(key); label.htmlFor = `fixed-asset-${question.id}-${cellId}`;
            const input = semanticType === 'amount' ? this.makeAmount('table-input fixed-asset-input', `${label.textContent}（金額）`, draft.cells?.[cellId] ?? '') : semanticType === 'date' ? this.makeShortDateInput('table-input fixed-asset-input', label.textContent, draft.cells?.[cellId] ?? '', '例：7/1') : this.makeText('table-input fixed-asset-input', label.textContent, draft.cells?.[cellId] ?? '');
            input.id = label.htmlFor; input.dataset.cellId = cellId; input.dataset.inputType = question.table.inputTypes?.[cellId] || 'text'; input.dataset.semanticType = semanticType;
            if (semanticType === 'months') input.inputMode = 'numeric';
            const line = this.document.createElement('div'); line.className = 'fixed-asset-input-line'; if (semanticType === 'date') line.append(input, this.makeDatePicker(input, label.textContent)); else line.append(input);
            if (semanticType === 'amount' || semanticType === 'months') { const unit = this.document.createElement('span'); unit.className = 'fixed-asset-unit'; unit.textContent = semanticType === 'amount' ? '円' : 'か月'; line.append(unit); }
            field.append(label, line);
          } else {
            const label = this.document.createElement('span'); label.className = 'fixed-asset-label'; label.textContent = this.tableLabel(key);
            const shown = this.document.createElement('strong'); shown.textContent = typeof value === 'number' ? yen(value) : String(value ?? '—');
            const unit = ['acquisitionCost','residualValue','openingAccumulated','salePrice'].includes(key) ? '円' : key === 'life' ? '年' : ''; if (unit) shown.textContent += unit;
            field.append(label, shown);
          }
          fields.append(field);
        }
        section.append(fields); ledger.append(section);
      }
      wrap.append(ledger);
    }
    positionStickyContextColumns(table) {
      this.stickyContextObserver?.disconnect();
      const update = () => this.updateStickyContextColumns(table);
      update();
      if (root.ResizeObserver) {
        this.stickyContextObserver = new root.ResizeObserver(update);
        this.stickyContextObserver.observe(table);
      }
    }
    updateStickyContextColumns(table) {
      const keys = ['description','quantity']; let left = 0;
      for (const key of keys) {
        const cells = [...table.querySelectorAll(`[data-column-key="${key}"]`)]; if (!cells.length) continue;
        cells.forEach(cell => { cell.dataset.stickyContext = 'true'; cell.style.setProperty('--sticky-left', `${left}px`); });
        left += cells[0].getBoundingClientRect().width;
      }
      table.style.setProperty('--sticky-context-width', `${left}px`);
    }
    renderBalanceSheet(question, draft = {}, comparison = null) {
      const wrap = comparison ? this.document.createElement('div') : this.byId('table-container');
      if (!comparison) wrap.replaceChildren();
      wrap.classList.add(comparison ? 'balance-sheet-comparison-wrap' : 'balance-sheet-wrap');
      const table = this.document.createElement('table'); table.className = 'balance-sheet-table';
      table.setAttribute('aria-label', '貸借対照表');
      const groups = table.createTHead().insertRow();
      [['資産', 2], ['負債・純資産', 2]].forEach(([label, span]) => { const th = this.document.createElement('th'); th.textContent = label; th.colSpan = span; th.scope = 'colgroup'; groups.append(th); });
      const columns = table.tHead.insertRow();
      ['科目', '金額', '科目', '金額'].forEach(label => { const th = this.document.createElement('th'); th.textContent = label; th.scope = 'col'; columns.append(th); });
      const sourceRows = question.table.rows.filter(row => row.section !== '合計');
      const left = sourceRows.filter(row => row.section === '資産');
      const right = sourceRows.filter(row => row.section === '負債' || row.section === '純資産');
      const isSectionStart = (rows, index) => index === 0 || rows[index]?.section !== rows[index - 1]?.section;
      const appendValue = (tr, row, sectionStart) => {
        const account = tr.insertCell(); account.className = 'balance-account'; account.textContent = row?.account || '';
        const amount = tr.insertCell(); amount.className = 'balance-amount';
        if (!row) return;
        if (row && sectionStart) {
          const section = this.document.createElement('span'); section.className = 'balance-section-label'; section.textContent = `${row.section}の部`; account.prepend(section);
          tr.classList.add('balance-section-start');
        }
        const cellId = row.inputCellId;
        if (row.amount !== '入力') { amount.textContent = typeof row.amount === 'number' ? yen(row.amount) : row.amount; return; }
        if (comparison) {
          const actual = this.document.createElement('span'); actual.className = 'comparison-actual'; actual.textContent = `入力 ${this.comparisonValue(question, cellId, comparison.user.cells?.[cellId])}`;
          const expected = this.document.createElement('span'); expected.className = 'comparison-expected'; expected.textContent = `正解 ${this.comparisonValue(question, cellId, question.answer.cells[cellId])}`;
          amount.append(actual, expected); return;
        }
        const input = this.makeAmount('table-input', `${row.account}（金額）`, draft.cells?.[cellId] ?? ''); input.dataset.cellId = cellId; input.dataset.inputType = 'amount'; amount.append(input);
      };
      const body = table.createTBody();
      for (let index = 0; index < Math.max(left.length, right.length); index += 1) { const tr = body.insertRow(); appendValue(tr, left[index], isSectionStart(left, index)); appendValue(tr, right[index], isSectionStart(right, index)); }
      const foot = table.createTFoot().insertRow();
      const appendTotal = (label, cellId) => {
        const name = foot.insertCell(); name.className = 'balance-total-label'; name.textContent = label;
        const amount = foot.insertCell(); amount.className = 'balance-amount balance-total-amount';
        if (comparison) {
          amount.innerHTML = `<span class="comparison-actual">入力 ${this.comparisonValue(question, cellId, comparison.user.cells?.[cellId])}</span><span class="comparison-expected">正解 ${this.comparisonValue(question, cellId, question.answer.cells[cellId])}</span>`;
        } else { const input = this.makeAmount('table-input', `${label}（金額）`, draft.cells?.[cellId] ?? ''); input.dataset.cellId = cellId; input.dataset.inputType = 'amount'; amount.append(input); }
      };
      const totals = question.table.rows.filter(row => row.section === '合計');
      appendTotal(totals[0]?.account || '資産合計', totals[0]?.inputCellId); appendTotal(totals[1]?.account || '負債・純資産合計', totals[1]?.inputCellId);
      wrap.append(table); return wrap;
    }
    readAnswer(question) {
      if (question.type !== 'journal') { const cells = {}; this.document.querySelectorAll('.table-input').forEach(input => { cells[input.dataset.cellId] = input.value; }); return { cells }; }
      const side = name => [...this.document.querySelectorAll(`.${name}-account`)].map((account, index) => {
        const raw = this.document.querySelectorAll(`.${name}-amount`)[index].value.trim();
        const source = normalizeNumber(raw);
        return { account: account.value, amount: source === '' || !validAmountText(source) ? Number.NaN : Number(source.replace(/,/g, '')), attempted: Boolean(account.value || raw) };
      }).filter(item => item.attempted).map(({ account, amount }) => ({ account, amount }));
      return { debit: side('debit'), credit: side('credit') };
    }
    result(question, score, userAnswer, confidence = 'unsure', achievement = {}, retryAuthorized = false) {
      const standardActions = this.byId('standard-result-actions'); const examActions = this.byId('exam-result-actions');
      if (standardActions) standardActions.hidden = false; if (examActions) examActions.hidden = true;
      const retryAction = this.document.querySelector('[data-action="coaching-retry-result"]');
      if (retryAction) retryAction.hidden = !retryAuthorized;
      const nextAction = standardActions?.querySelector('[data-action="next"]');
      if (nextAction) nextAction.classList.toggle('secondary-button', !score.correct);
      const topActions = this.byId('top-result-actions'); if (topActions) topActions.hidden = !score.correct;
      const box = this.byId('result-status'); box.className = `result-box ${score.correct ? 'result-correct' : 'result-incorrect'}`;
      const calibration = confidence === 'sure'
        ? (score.correct ? '自信ありとして回答し、正解しました。解説で判断の根拠を確認しましょう。' : '自信ありとして回答しました。下の相違点と解説で判断の根拠を確かめましょう。')
        : (score.correct ? 'まだ自信なしとして回答し、正解しました。解説で判断の根拠を確認しましょう。' : 'まだ自信なしとして回答しました。下の相違点を確認してから解説へ進みましょう。');
      const headline = this.document.createElement('strong'); headline.className = 'result-headline'; headline.textContent = score.correct ? '正解です！' : 'もう一歩です';
      const confidenceFeedback = this.document.createElement('span'); confidenceFeedback.className = `confidence-feedback confidence-${confidence}-${score.correct ? 'correct' : 'wrong'}`;
      confidenceFeedback.textContent = `${confidence === 'sure' ? '自信あり' : 'まだ自信なし'} × ${score.correct ? '正解' : '要確認'}｜${calibration}`;
      box.replaceChildren(headline, confidenceFeedback);
      this.renderErrorSummary(question, score, userAnswer);
      this.renderAnswerComparison(question, score, userAnswer);
      this.renderCorrectJournal(question);
      this.renderExplanation(question, score, userAnswer);
      this.renderAchievement(this.byId('explanation'), achievement);
      if (typeof this.renderStoryCaseDecision === 'function') this.renderStoryCaseDecision(question, score);
    }
    renderErrorSummary(question, score, userAnswer) {
      const panel = this.byId('result-error-summary');
      if (!panel) return;
      panel.replaceChildren(); panel.hidden = true;
      if (score.correct || !userAnswer) return;
      const items = [];
      if (question.type === 'journal') {
        for (const [side, label] of [['debit', '借方'], ['credit', '貸方']]) {
          const entered = [...(userAnswer[side] || [])];
          const expected = [...(question.answer?.[side] || [])];
          // Complete matches first: preserve journal line order independence.
          const unmatched = expected.filter(row => {
            const index = entered.findIndex(value => value.account === row.account && value.amount === row.amount);
            if (index < 0) return true;
            entered.splice(index, 1); return false;
          });
          // Reserve all same-account rows before pairing remaining different accounts.
          // Keep expected-row order without consuming a later row's amount-only match.
          const sameAccount = unmatched.map(row => {
            const index = entered.findIndex(value => value.account === row.account);
            return index < 0 ? null : entered.splice(index, 1)[0];
          });
          unmatched.forEach((row, rowIndex) => {
            if (sameAccount[rowIndex]) {
              const actual = sameAccount[rowIndex];
              items.push(`${label}「${row.account}」の金額：入力 ${Number.isFinite(actual.amount) ? yen(actual.amount) + '円' : '未入力'}／正答 ${yen(row.amount)}円`);
            } else if (entered.length) {
              const actual = entered.shift();
              items.push(`${label}の勘定科目・金額：入力 ${actual.account || '未入力'} ${Number.isFinite(actual.amount) ? yen(actual.amount) + '円' : '未入力'}／正答 ${row.account} ${yen(row.amount)}円`);
            } else {
              items.push(`${label}に必要な「${row.account}」${yen(row.amount)}円を確認`);
            }
          });
          entered.forEach(row => items.push(`${label}の余分な入力：${row.account || '未選択'} ${Number.isFinite(row.amount) ? yen(row.amount) + '円' : '金額未入力'}`));
        }
      } else {
        for (const detail of score.details || []) {
          if (detail.correct === true) continue;
          const label = question.table?.inputMetadata?.[detail.cellId]?.label || this.cellLabel(question, detail.cellId);
          items.push(`${label}：入力 ${this.comparisonValue(question, detail.cellId, userAnswer.cells?.[detail.cellId])}／正答 ${this.comparisonValue(question, detail.cellId, question.answer?.cells?.[detail.cellId])}`);
        }
      }
      const heading = this.document.createElement('h3'); heading.textContent = 'まず、ここを確認';
      const lead = this.document.createElement('p');
      lead.textContent = 'あなたの回答と正答の相違点です。正答の判断根拠は解説で確かめましょう。';
      const list = this.document.createElement('ul');
      (items.length ? items.slice(0, 3) : ['貸借の合計と各入力欄を確認してください。']).forEach(message => {
        const item = this.document.createElement('li'); item.textContent = message; list.append(item);
      });
      panel.append(heading, lead, list);
      if (items.length > 3) {
        const rest = this.document.createElement('p'); rest.textContent = `ほか${items.length - 3}件は下の解答比較で確認できます。`; panel.append(rest);
      }
      panel.hidden = false;
    }
    // Optional post-answer business judgement. This never grades, rewards or stores data.
    // Chapter cases are reflections, not authoritative answers to the current transaction.
    renderStoryCaseDecision(question, score) {
      if (this.questionMode !== 'story' || !question || !score || typeof score.correct !== 'boolean') return false;
      // This is a chapter climax, not a question-by-question repeated quiz.
      // The only authority is the authored BOSS anchor and the existing answer history.
      const climax = (root.AnchorScenes || []).find(scene => scene.chapter === question.chapter && scene.beat === 'BOSS');
      if (!this.storyDecisionEligible || !climax || climax.referenceQuestionId !== question.id) return false;
      const target = this.byId('explanation');
      if (!target) return false;
      // An incorrect first answer can be followed by the same result on reveal.
      // Reattach the SAME card so the learner's selection/feedback is preserved.
      if (this.storyDecisionRenderedForQuestionId === question.id && this.storyDecisionPreviousBox) {
        target.append(this.storyDecisionPreviousBox);
        return true;
      }
      const cases = [
        {case:'追加出資の資金はどこへ動いた？', objective:'資金の増加と資金の置き場所を分けて追う', valid:'出資の証憑と現金・預金の移動記録を別々に照合する', trap:'入金があればすべて売上だと報告する', why:'出資は収益ではありません。資金の入手理由と資産内部の移動は別の事象です。', next:'水野先輩へ、出資と預け替えの違いを説明しよう。'},
        {case:'営業の売上報告と伝票が食い違う？', objective:'納品・返品・付随費用を取引単位で確認する', valid:'納品書・返品票・配送伝票を突き合わせる', trap:'営業担当の売上見込みを、そのまま確定した会計数値にする', why:'納品、返品、負担する運賃は資料に基づいて区別します。売上見込みだけでは確定できません。', next:'高橋へ、資料を照合した結果を根拠付きで説明しよう。'},
        {case:'売れたはずの代金が口座にない？', objective:'売掛・買掛と現金・預金の違いを確認する', valid:'債権債務の成立と入出金の時点を分けて照合する', trap:'入金前の売上を現金残高に含める', why:'掛取引の成立と現金の受払いは別です。現金残高に入金前の債権を足しません。', next:'社長へ、回収予定と現在の資金を分けて報告しよう。'},
        {case:'小口現金を精算・補給した。原因不明の現金差額も同じ処理でよい？', objective:'小口現金の支出記録と現金過不足の原因調査を区別する', valid:'支出は領収証から精算し、実査差額は原因未判明なら現金過不足で仮処理する', trap:'理由が分からなくても適当な費用科目へ振り替える', why:'領収証のある小口現金の支出と、原因未判明の現金差額は別です。後者は現金過不足で仮処理し、根拠なく費用へ断定しません。', next:'森へ、調査で確定した事実と未確定の差額を伝えよう。'},
        {case:'同じ支払いでも意味が違う？', objective:'設備・仮払・立替・借入を区分する', valid:'証憑から資産取得、費用発生、債権債務を区別する', trap:'支出した金額をすべて当期の費用にする', why:'現金の支出だけで費用は決まりません。資産や前渡金となる取引もあります。', next:'水野先輩へ、支払いの中身を勘定別に整理して伝えよう。'},
        {case:'使用した収入印紙の支出と、給与から預かったお金は同じ扱い？', objective:'収入印紙の費用と、給与控除・会社負担・納付義務を区別する', valid:'使用した収入印紙は租税公課、給与の本人控除は預り金として資料を分ける', trap:'給与から引いた額を会社の収益として処理する', why:'使用した収入印紙は租税公課（費用）です。従業員から預かった控除額は収益ではなく、納付までの預り金（負債）です。会社負担分とも区別します。', next:'担当者へ、印紙税の費用と本人控除・会社負担の違いを説明しよう。'},
        {case:'固定資産台帳の減価償却額を出した。元帳の残高確認は必要？', objective:'固定資産台帳の計算と仕訳・総勘定元帳の転記・残高をつなげる', valid:'固定資産台帳の償却計算を根拠に仕訳帳と元帳への転記・残高を照合する', trap:'台帳の計算が合えば元帳の残高確認は不要とする', why:'台帳の償却額を正しく計算するだけでは不十分です。実際の記帳・転記・残高への反映を別途確認して報告します。', next:'月次報告前に、転記と残高の照合状況を伝えよう。'},
        {case:'試算表が合わない原因は？', objective:'差異を仕訳・転記・集計の順に追跡する', valid:'元資料と帳簿を照合し、誤りの場所を特定して訂正する', trap:'帳尻が合うように根拠のない仕訳を足す', why:'貸借を合わせることだけが目的ではありません。原因と正しい仕訳の根拠を確認します。', next:'どこに差異が生じたかを根拠付きで報告しよう。'},
        {case:'支払日と当期の費用は同じ？', objective:'前払・未払・前受・未収の期間帰属を確認する', valid:'役務の提供期間と決算日を確認して当期分を計上する', trap:'現金が出入りした日だけで全額を当期損益にする', why:'現金収支と費用・収益の期間帰属は同じではありません。', next:'当期に属する金額を決算整理へ引き継ごう。'},
        {case:'整理前の利益を報告してよい？', objective:'見積り・減価償却・決算整理を反映する', valid:'決算整理事項を確認し精算表へ反映してから利益を求める', trap:'整理前試算表の収支差を確定利益として報告する', why:'償却や見越し・繰延べなどの処理後に当期利益を判断します。', next:'社長へ、整理後の数字を用いて利益を説明しよう。'},
        {case:'仕入代金を支払手形で記録する。それだけで消費税の納付額まで分かる？', objective:'仕入に伴う支払手形と、消費税の仮受・仮払・納付義務を分ける', valid:'支払手形の記録を確認し、消費税は別資料で仮受・仮払を照合する', trap:'支払手形の振出だけで消費税の納付義務まで確定したと報告する', why:'支払手形は商品仕入に伴う債務です。振り出しただけで消費税の納付額は分かりません。消費税は仮受と仮払を別資料で照合します。', next:'社長へ、支払手形の債務と消費税の納付義務を別資料で説明しよう。'},
        {case:'会社の一年を数字で説明できる？', objective:'当期純利益と財務諸表をつなげる', valid:'損益と貸借対照表を照合し、利益・財政状態を分けて報告する', trap:'現金が多いかどうかだけで利益を決める', why:'利益は収益と費用から求め、財政状態は資産・負債・純資産で示します。', next:'最終報告では数字の根拠を自分の言葉で説明しよう。'}
      ];
      const chapter = Number(question.chapter);
      if (!Number.isSafeInteger(chapter) || chapter < 1 || chapter > cases.length) return false;
      const task = cases[chapter - 1];
      const box = this.document.createElement('section');
      box.className = 'story-case-decision';
      box.setAttribute('aria-label', '章の事件と実務判断');
      const heading = this.document.createElement('h3'); heading.textContent = '第' + chapter + '章｜いま起きている経理事件';
      const mystery = this.document.createElement('p'); mystery.className = 'story-case-mystery';
      mystery.textContent = chapter === 4
        ? task.case + ' 第4章ではすでに現金実査額と帳簿残高の不一致が確認されています。J120の14,000円の小口現金精算・小切手補給は、別の原因未判明の差額を解消する仕訳ではありません。森「残る差額は、何から調べたらいいですか？」'
        : task.case;
      const status = this.document.createElement('p'); status.className = 'story-case-status';
      status.textContent = score.correct
        ? '今回の解答は確認できました。ただし、この章の業務全体が完了したという意味ではありません。'
        : '今回の解答には相違点があります。報告を確定せず、根拠の確認を続けましょう。';
      const goal = this.document.createElement('p'); goal.textContent = '3分の振り返り目標：' + task.objective;
      const prompt = this.document.createElement('p'); prompt.className = 'story-case-prompt';
      prompt.textContent = chapter === 4
        ? '森への報告に向け、最初に何を確認しますか？（任意・採点や報酬に影響しません）'
        : '社内報告へ進むなら、どちらの確認方法を選びますか？（任意・採点や報酬に影響しません）';
      const choices = this.document.createElement('div'); choices.className = 'story-case-choices';
      const feedback = this.document.createElement(chapter === 4 ? 'div' : 'p'); feedback.className = 'story-case-choice-feedback';
      feedback.setAttribute('role', 'status');
      // Chapter 4 pilot: the two evidence-first approaches are both legitimate.
      // They lead to different investigative findings, never fabricated postings.
      const options = chapter === 4
        ? [
          {valid:true,label:'現金出納帳と実査記録から差額を調べる',
            finding:'帳簿残高と実際の現金の差を特定するための記録を確認できます。',
            outstanding:'差額の原因は、この資料だけでは確定しません。',
            followup:'続けて領収証と支払伝票を照合します。',
            character:'森「出納帳と実査記録で差額を確認します。原因はまだ決めつけません。」'},
          {valid:true,label:'領収証と支払伝票から記帳漏れを調べる',
            finding:'記録された支払の根拠と未記帳の取引を調べられます。',
            outstanding:'現金の実査額との差は、帳簿との照合なしには確定しません。',
            followup:'続けて現金出納帳と実査記録を照合します。',
            character:'森「領収証と支払伝票を照合します。漏れがあるかはまだ分かりません。」'},
          {valid:false,label:'原因を調べずに雑費として処理する',
            finding:'費用と断定するための証拠がありません。',
            outstanding:'現金差額の原因は未判明のままです。',
            followup:'差額は根拠なく雑費とせず、現金過不足として仮処理する必要性を含め確認します。',
            character:'森「証拠がないまま雑費にはしません。資料を確かめます。」'}
        ]
        : chapter % 2
          ? [{valid:false,label:task.trap},{valid:true,label:task.valid}]
          : [{valid:true,label:task.valid},{valid:false,label:task.trap}];
      for (const option of options) {
        const button = this.document.createElement('button');
        button.type = 'button'; button.className = 'story-case-choice'; button.textContent = option.label;
        button.addEventListener('click', () => {
          feedback.textContent = chapter === 4
            ? (option.valid ? '調査の入口として合理的です。' : 'このままでは根拠が不足しています。')
            : option.valid ? '根拠を優先した判断です。' + task.why + ' ' + task.next
              : 'その判断はまだ根拠が不足しています。' + task.why + ' ' + task.next;
          if (chapter === 4) {
            for (const [label, value] of [
              ['確認できること', option.finding],
              ['まだ分からないこと', option.outstanding],
              ['次に行うこと', option.followup]
            ]) {
              const detail = this.document.createElement('p');
              detail.textContent = label + '：' + value;
              feedback.append(detail);
            }
            const reaction = this.document.createElement('p');
            reaction.textContent = option.character;
            feedback.append(reaction);
            if (option.valid) {
              const other = options.find(candidate => candidate !== option && candidate.valid);
              const inspect = this.document.createElement('button');
              inspect.type = 'button';
              inspect.className = 'story-case-choice';
              inspect.textContent = 'もう一方の資料も確認する（任意）';
              inspect.addEventListener('click', () => {
                if (inspect.disabled) return;
                const comparison = this.document.createElement('p');
                comparison.textContent = '追加照合の視点：' + other.finding + ' ' + other.outstanding;
                const response = this.document.createElement('p');
                response.textContent = '森「両方の資料を見比べ、説明できない原因は調査を続けます。」';
                feedback.append(comparison, response);
                inspect.disabled = true;
                inspect.textContent = '追加照合の確認済み';
              });
              feedback.append(inspect);
            }
          }
          // A visible record of the decision, not a fictional ledger mutation.
          const outcome = this.document.createElement('p');
          outcome.className = 'story-case-outcome';
          const ready = option.valid && score.correct;
          outcome.textContent = chapter === 4
            ? ready
              ? '仕事の成果：調査の手順を整理しました。原因や章全体の完了はまだ確定していません。'
              : '仕事の状態：報告は保留です。証拠と仕訳の確認を続けましょう。'
            : ready
              ? '仕事の成果：根拠のある確認方針を整理しました。次の報告に進む準備ができました。' + task.next
              : '仕事の状態：報告は保留です。証憑と仕訳を確認し、判断の根拠を整えましょう。' + task.next;
          feedback.append(outcome);
          for (const sibling of choices.children) {
            sibling.disabled = true;
            sibling.setAttribute('aria-pressed', sibling === button ? 'true' : 'false');
          }
        });
        choices.append(button);
      }
      const foot = this.document.createElement('p'); foot.className = 'story-case-footnote';
      foot.textContent = 'この振り返りは章全体の判断練習です。今回の仕訳・金額の正答根拠は上の解説で確認してください。';
      box.append(heading, mystery, status, goal, prompt, choices, feedback, foot);
      target.append(box);
      this.storyDecisionRenderedForQuestionId = question.id;
      this.storyDecisionPreviousBox = box;
      return true;
    }
    renderNarrativeResult(scenes = [], { mode = 'story', resolved = false, epilogueFacts = [] } = {}) {
      if (typeof this.document?.getElementById !== 'function') return false;
      const container = this.byId('narrative-result');
      if (!container) return false;
      container.replaceChildren();
      container.hidden = true;
      container.className = 'narrative-result';
      if (container.dataset) delete container.dataset.sceneId;
      if (mode !== 'story' || resolved !== true || !Array.isArray(scenes) || !scenes.length) return false;
      const order = { OPEN:0, REVERSAL:1, BOSS:2 };
      const scene = [...scenes].sort((a, b) => (order[a.beat] ?? 99) - (order[b.beat] ?? 99)).at(-1);
      if (!scene) return false;
      const isEpilogue = scene.epilogue === true;
      const heading = this.document.createElement('h2');
      heading.id = 'narrative-result-heading';
      heading.textContent = isEpilogue ? '一年の結末' : '仕事の結果';
      const after = this.document.createElement('p');
      after.className = 'narrative-result-after';
      after.textContent = scene.after;
      const content = [heading, after];
      if (isEpilogue && scene.protagonistStatement) {
        const statement = this.document.createElement('p');
        statement.className = 'narrative-result-epilogue-statement';
        statement.textContent = scene.protagonistStatement;
        content.push(statement);
      }
      if (isEpilogue && Array.isArray(epilogueFacts) && epilogueFacts.length) {
        const summary = this.document.createElement('section');
        summary.className = 'narrative-result-epilogue-summary';
        const summaryHeading = this.document.createElement('h3');
        summaryHeading.textContent = '最終章で確定した数字';
        const list = this.document.createElement('ul');
        for (const fact of epilogueFacts) {
          const item = this.document.createElement('li');
          const label = this.document.createElement('span');
          label.textContent = fact.label;
          const value = this.document.createElement('strong');
          value.textContent = `${Number(fact.value).toLocaleString('ja-JP')}円`;
          item.append(label, value);
          list.append(item);
        }
        summary.append(summaryHeading, list);
        content.push(summary);
      }
      const hookLabel = this.document.createElement('strong');
      hookLabel.className = 'narrative-result-hook-label';
      hookLabel.textContent = isEpilogue ? 'エピローグ' : '次の展開';
      const hook = this.document.createElement('p');
      hook.className = 'narrative-result-hook';
      hook.textContent = scene.hook;
      content.push(hookLabel, hook);
      container.append(...content);
      container.className = `narrative-result${isEpilogue ? ' narrative-result-epilogue' : ''}`;
      if (container.dataset) container.dataset.sceneId = scene.sceneId;
      container.hidden = false;
      return true;
    }
    protectedResult(confidence = 'unsure', retry = false) {
      const panel = this.byId('protected-learning'); const status = this.byId('protected-status');
      panel.hidden = false;
      status.hidden = false;
      status.replaceChildren();
      const headline = this.document.createElement('strong'); headline.className = 'result-headline'; headline.textContent = retry ? '練習の回答はまだ要確認です' : '最初の回答はもう一歩です';
      const guidance = this.document.createElement('span'); guidance.className = 'confidence-feedback'; guidance.textContent = confidence === 'sure' ? '自信ありとして記録しました。根拠を順に確認しましょう。' : 'まだ自信なしとして記録しました。ヒントを使って確認できます。';
      status.append(headline, guidance); status.focus?.();
    }
    applyRetryDraft(question, draft = {}) {
      if (question.type === 'journal') {
        ['debit','credit'].forEach(side => {
          const accounts = this.document.querySelectorAll(`.${side}-account`); const amounts = this.document.querySelectorAll(`.${side}-amount`);
          accounts.forEach((account, index) => { const row = draft[side]?.[index]; account.value = row?.account || ''; if (amounts[index]) amounts[index].value = row?.amount ?? ''; this.updateSelectTitle(account); });
        });
        return;
      }
      this.document.querySelectorAll('.table-input').forEach(input => { input.value = draft.cells?.[input.dataset.cellId] ?? ''; if (input.tagName === 'SELECT') this.updateSelectTitle(input); });
    }
    setAnswerMode(mode) {
      const form = this.byId('question-form'); const locked = mode === 'protected'; const coaching = mode === 'coaching';
      form?.querySelectorAll('input, select, textarea').forEach(field => {
        if (locked && !field.disabled) { field.dataset.flowLocked = 'true'; field.disabled = true; }
        else if (!locked && field.dataset.flowLocked === 'true') { field.disabled = false; delete field.dataset.flowLocked; }
      });
      const actions = form?.querySelector('.question-actions'); if (actions) actions.hidden = locked;
      const confidence = form?.querySelector('.confidence-selector'); if (confidence) confidence.hidden = coaching;
      const save = form?.querySelector('.save-button'); if (save) save.hidden = coaching;
      const saveStatus = this.byId('save-status'); if (saveStatus) saveStatus.hidden = coaching;
      const protectedPanel = this.byId('protected-learning'); if (protectedPanel) protectedPanel.hidden = coaching || this.questionMode === 'exam';
      const submit = form?.querySelector('button[type="submit"]'); if (submit) submit.textContent = coaching ? '練習回答を確認する' : '回答を確定する';
      form?.setAttribute('data-answer-mode', mode);
    }
    resetLearningSurfaces() {
      const protectedPanel = this.byId('protected-learning'); if (protectedPanel) protectedPanel.hidden = false;
      const protectedStatus = this.byId('protected-status'); if (protectedStatus) { protectedStatus.hidden = true; protectedStatus.replaceChildren(); }
      const hintPanel = this.byId('hint-panel'); if (hintPanel) hintPanel.hidden = true;
      const heading = this.byId('hint-heading'); if (heading) heading.textContent = '';
      const text = this.byId('hint-text'); if (text) text.textContent = '';
      const first = this.document.querySelector('[data-action="hint-1"]'); if (first) { first.hidden = false; first.disabled = false; }
      const second = this.document.querySelector('[data-action="hint-2"]'); if (second) { second.hidden = true; second.disabled = false; }
      ['result-status','answer-comparison','correct-journal','explanation'].forEach(id => this.byId(id)?.replaceChildren());
      const narrativeResult = this.byId('narrative-result'); if (narrativeResult) { narrativeResult.hidden = true; narrativeResult.replaceChildren(); narrativeResult.className = 'narrative-result'; if (narrativeResult.dataset) delete narrativeResult.dataset.sceneId; }
      const errorSummary = this.byId('result-error-summary'); if (errorSummary) { errorSummary.hidden = true; errorSummary.replaceChildren(); }
      const top = this.byId('top-result-actions'); if (top) top.hidden = true;
    }
    hideProtectedResult() { const panel = this.byId('protected-learning'); if (panel) panel.hidden = true; const status = this.byId('protected-status'); if (status) { status.hidden = true; status.replaceChildren(); } }
    renderHint(stage, text) {
      const panel = this.byId('hint-panel'); const heading = this.byId('hint-heading');
      panel.hidden = false; heading.textContent = `ヒント ${stage}`; this.byId('hint-text').textContent = text;
      const second = this.document.querySelector('[data-action="hint-2"]'); if (second) second.hidden = stage < 1;
      const first = this.document.querySelector('[data-action="hint-1"]'); if (first) first.hidden = stage >= 1;
      if (second && stage >= 2) second.hidden = true;
      heading.focus?.();
    }
    renderAchievement(anchor, achievement = {}) {
      let banner = this.byId('achievement-banner');
      if (!banner) { banner = this.document.createElement('aside'); banner.id = 'achievement-banner'; banner.className = 'achievement-banner'; banner.setAttribute('role', 'status'); banner.setAttribute('aria-live', 'polite'); anchor.after(banner); }
      const unlocks = [achievement.reward || '', achievement.level ? `レベルアップ！ Lv.${achievement.level}` : '', achievement.role ? `新しい役職「${achievement.role}」に昇格しました。新しい仕事と機能を確認できます` : ''].filter(Boolean);
      banner.hidden = unlocks.length === 0; banner.textContent = unlocks.join(' ／ ');
      anchor.after(banner);
    }
    journalTable(answer) {
      const wrap = this.document.createElement('div'); wrap.className = 'journal-table-wrap';
      const table = this.document.createElement('table'); table.className = 'journal-table';
      const tableHead = table.createTHead(); const sideHead = tableHead.insertRow();
      [['借方', 'debit'], ['貸方', 'credit']].forEach(([label, side]) => { const th = this.document.createElement('th'); th.colSpan = 2; th.scope = 'colgroup'; th.className = `journal-side-${side}`; th.textContent = label; sideHead.append(th); });
      const columnHead = tableHead.insertRow();
      const columnLabels = ['借方科目', '借方金額', '貸方科目', '貸方金額'];
      columnLabels.forEach(label => { const th = this.document.createElement('th'); th.scope = 'col'; th.textContent = label; columnHead.append(th); });
      const body = table.createTBody(); const rows = Math.max(answer.debit.length, answer.credit.length, 1);

      const mobile = this.document.createElement('div'); mobile.className = 'journal-review-mobile'; mobile.setAttribute('aria-label', '仕訳票');
      const mobileHeader = this.document.createElement('div'); mobileHeader.className = 'journal-review-header';
      columnLabels.forEach(label => { const cell = this.document.createElement('span'); cell.textContent = label; mobileHeader.append(cell); });
      mobile.append(mobileHeader);

      for (let index = 0; index < rows; index += 1) {
        const debit = answer.debit[index]; const credit = answer.credit[index];
        const row = body.insertRow();
        [debit, credit].forEach(item => {
          const account = row.insertCell();
          const amount = row.insertCell(); amount.className = 'journal-amount';
          if (!item) { account.textContent = ''; amount.textContent = ''; return; }
          account.append(this.accountLabel(item.account));
          amount.textContent = Number.isFinite(Number(item.amount)) ? `${yen(item.amount)}円` : '—';
        });

        const mobileRow = this.document.createElement('div'); mobileRow.className = 'journal-review-row';
        [
          ['journal-review-account', debit ? (debit.account || '（未入力）') : ''],
          ['journal-review-amount', debit ? (Number.isFinite(Number(debit.amount)) ? yen(debit.amount) : '—') : ''],
          ['journal-review-account', credit ? (credit.account || '（未入力）') : ''],
          ['journal-review-amount', credit ? (Number.isFinite(Number(credit.amount)) ? yen(credit.amount) : '—') : '']
        ].forEach(([className, text]) => {
          const cell = this.document.createElement('span'); cell.className = `journal-review-cell ${className}`; cell.textContent = text; mobileRow.append(cell);
        });
        mobile.append(mobileRow);
      }
      wrap.append(table, mobile); return wrap;
    }
    correctionJournal(answer = {}) {
      const cells = answer.cells || answer;
      const row = side => ({ account:cells[`${side}Account`] || '', amount:Number(normalizeNumber(cells[`${side}Amount`] ?? '').replace(/,/g, '')) });
      return { debit:[row('debit')], credit:[row('credit')] };
    }
    comparisonValue(question, cellId, value) {
      if (value == null || value === '' || (typeof value === 'number' && !Number.isFinite(value))) return '未入力';
      const semanticType = root.WrongAnswerFeedback?.cellSemanticType(question, cellId) || question.table?.inputMetadata?.[cellId]?.semanticType;
      if (['amount','unitPrice','quantity','months','years','life'].includes(semanticType) && Number.isFinite(Number(normalizeNumber(value).replace(/,/g, '')))) {
        const number = Number(normalizeNumber(value).replace(/,/g, ''));
        return root.WrongAnswerFeedback?.formatValue(number, semanticType) ?? `${yen(number)}${({amount:'円',unitPrice:'円／個',quantity:'個',months:'か月',years:'年',life:'年'})[semanticType]}`;
      }
      return String(value);
    }
    tableAnswerComparison(question, score, userAnswer) {
      const detailMap = new Map((score.details || []).map(detail => [detail.cellId, detail]));
      const wrap = this.document.createElement('div'); wrap.className = 'answer-comparison-table-wrap';
      const table = this.document.createElement('table'); table.className = 'answer-comparison-table';
      const head = table.createTHead().insertRow();
      ['項目', 'あなたの解答', '正しい解答', '判定'].forEach(label => { const th = this.document.createElement('th'); th.scope = 'col'; th.textContent = label; head.append(th); });
      const body = table.createTBody();
      const mobile = this.document.createElement('div'); mobile.className = 'answer-comparison-mobile-list'; mobile.setAttribute('aria-label', '自分の解答と正しい解答の比較');
      question.table.inputCells.forEach(cellId => {
        const correct = detailMap.get(cellId)?.correct === true; const row = body.insertRow();
        if (!correct) row.className = 'comparison-row-mismatch';
        const labelText = question.table.inputMetadata?.[cellId]?.label || this.cellLabel(question, cellId);
        const actualText = this.comparisonValue(question, cellId, userAnswer.cells?.[cellId]);
        const expectedText = this.comparisonValue(question, cellId, question.answer.cells?.[cellId]);
        const label = row.insertCell(); label.textContent = labelText;
        const actual = row.insertCell(); actual.textContent = actualText;
        if (!correct) actual.className = 'cell-mismatch';
        const expected = row.insertCell(); expected.textContent = expectedText;
        const status = row.insertCell(); status.className = `comparison-status ${correct ? 'comparison-status-match' : 'comparison-status-mismatch'}`; status.textContent = correct ? '一致' : '要確認';

        const card = this.document.createElement('article'); card.className = `answer-comparison-mobile-card${correct ? '' : ' comparison-row-mismatch'}`;
        const cardHead = this.document.createElement('div'); cardHead.className = 'answer-comparison-mobile-head';
        const item = this.document.createElement('strong'); item.textContent = labelText;
        const badge = this.document.createElement('span'); badge.className = `comparison-status ${correct ? 'comparison-status-match' : 'comparison-status-mismatch'}`; badge.textContent = correct ? '一致' : '要確認';
        cardHead.append(item, badge);
        const pair = this.document.createElement('div'); pair.className = 'answer-comparison-mobile-pair';
        const actualBox = this.document.createElement('div'); actualBox.className = `answer-comparison-mobile-value comparison-actual${correct ? '' : ' cell-mismatch'}`;
        const actualLabel = this.document.createElement('span'); actualLabel.className = 'answer-comparison-mobile-label'; actualLabel.textContent = 'あなたの解答';
        const actualValue = this.document.createElement('strong'); actualValue.textContent = actualText;
        actualBox.append(actualLabel, actualValue);
        const expectedBox = this.document.createElement('div'); expectedBox.className = 'answer-comparison-mobile-value comparison-expected';
        const expectedLabel = this.document.createElement('span'); expectedLabel.className = 'answer-comparison-mobile-label'; expectedLabel.textContent = '正しい解答';
        const expectedValue = this.document.createElement('strong'); expectedValue.textContent = expectedText;
        expectedBox.append(expectedLabel, expectedValue);
        pair.append(actualBox, expectedBox); card.append(cardHead, pair); mobile.append(card);
      });
      wrap.append(table, mobile); return wrap;
    }
    worksheetAnswerComparisonMobile(question, score, userAnswer) {
      const details = new Map((score.details || []).map(detail => [detail.cellId, detail.correct === true]));
      const cellIds = new Map(); let inputIndex = 0;
      (question.table.rows || []).forEach((rowData, rowIndex) => Object.values(rowData).forEach((value, columnIndex) => {
        if (value === '入力') cellIds.set(rowIndex + ':' + columnIndex, question.table.inputCells[inputIndex++]);
      }));
      const groups = [
        { title:'試算表', columns:[1,2] },
        { title:'修正記入', columns:[3,4] },
        { title:'損益計算書', columns:[5,6] },
        { title:'貸借対照表', columns:[7,8] }
      ];
      const flow = this.document.createElement('div'); flow.className = 'worksheet-comparison-mobile-flow'; flow.setAttribute('aria-label', '8欄精算表の入力と正解を4つの処理に分けて比較');
      const appendValue = (cell, value, rowIndex, columnIndex) => {
        if (value !== '入力') {
          cell.textContent = value == null || value === '' ? '—' : typeof value === 'number' ? yen(value) : this.tableLabel(value);
          return;
        }
        const cellId = cellIds.get(rowIndex + ':' + columnIndex); const correct = details.get(cellId) === true;
        const pair = this.document.createElement('div'); pair.className = `worksheet-comparison-pair${correct ? '' : ' cell-mismatch'}`;
        const actual = this.document.createElement('span'); actual.className = 'comparison-actual'; actual.textContent = `入力 ${this.comparisonValue(question, cellId, userAnswer.cells?.[cellId])}`;
        const expected = this.document.createElement('span'); expected.className = 'comparison-expected'; expected.textContent = `正解 ${this.comparisonValue(question, cellId, question.answer.cells?.[cellId])}`;
        pair.append(actual, expected); cell.append(pair);
      };
      groups.forEach((group, groupIndex) => {
        const section = this.document.createElement('section'); section.className = 'worksheet-comparison-mobile-section'; section.dataset.worksheetComparisonGroup = group.title;
        const header = this.document.createElement('div'); header.className = 'worksheet-comparison-mobile-head';
        const step = this.document.createElement('span'); step.className = 'worksheet-mobile-step'; step.textContent = (groupIndex + 1) + '/4';
        const title = this.document.createElement('h4'); title.textContent = group.title; header.append(step, title); section.append(header);
        const table = this.document.createElement('table'); table.className = 'worksheet-comparison-mobile-table';
        const head = table.createTHead().insertRow(); ['勘定科目','借方','貸方'].forEach(label => { const th = this.document.createElement('th'); th.scope = 'col'; th.textContent = label; head.append(th); });
        const body = table.createTBody();
        (question.table.rows || []).forEach((rowData, rowIndex) => {
          const values = Object.values(rowData); const debit = values[group.columns[0]], credit = values[group.columns[1]];
          const empty = [debit, credit].every(value => value == null || value === '' || value === '—');
          if (empty) return;
          const row = body.insertRow(); const account = row.insertCell(); account.className = 'worksheet-comparison-mobile-account'; account.textContent = values[0];
          const debitCell = row.insertCell(); appendValue(debitCell, debit, rowIndex, group.columns[0]);
          const creditCell = row.insertCell(); appendValue(creditCell, credit, rowIndex, group.columns[1]);
        });
        section.append(table); flow.append(section);
      });
      return flow;
    }
    worksheetAnswerComparison(question, score, userAnswer) {
      if (this.compactWorksheetViewport()) return this.worksheetAnswerComparisonMobile(question, score, userAnswer);
      const details = new Map((score.details || []).map(detail => [detail.cellId, detail.correct === true]));
      const wrap = this.document.createElement('div'); wrap.className = 'answer-comparison-table-wrap';
      const table = this.document.createElement('table'); table.className = 'answer-comparison-table worksheet-answer-comparison';
      const head = table.createTHead().insertRow(); question.table.columns.forEach(column => { const th = this.document.createElement('th'); th.scope = 'col'; th.textContent = this.tableLabel(column); head.append(th); });
      const body = table.createTBody(); let inputIndex = 0;
      question.table.rows.forEach(rowData => {
        const row = body.insertRow();
        Object.values(rowData).forEach(value => {
          const cell = row.insertCell();
          if (value !== '入力') { cell.textContent = typeof value === 'number' ? yen(value) : this.tableLabel(value); return; }
          const cellId = question.table.inputCells[inputIndex++]; const correct = details.get(cellId) === true;
          const pair = this.document.createElement('div'); pair.className = `worksheet-comparison-pair${correct ? '' : ' cell-mismatch'}`;
          const actual = this.document.createElement('span'); actual.className = 'comparison-actual'; actual.textContent = `入力 ${this.comparisonValue(question, cellId, userAnswer.cells?.[cellId])}`;
          const expected = this.document.createElement('span'); expected.className = 'comparison-expected'; expected.textContent = `正解 ${this.comparisonValue(question, cellId, question.answer.cells?.[cellId])}`;
          pair.append(actual, expected); cell.append(pair);
        });
      });
      wrap.append(table); return wrap;
    }
    renderAnswerComparison(question, score, userAnswer) {
      const container = this.byId('answer-comparison'); container.replaceChildren();
      container.hidden = true;
      if (score.correct || !userAnswer) return;
      container.hidden = false;
      const heading = this.document.createElement('h3');
      if (question.type === 'journal') {
        heading.textContent = '最初の仕訳（誤答）';
        const note = this.document.createElement('p'); note.textContent = '下の「正しい仕訳」と、科目・貸借・金額を一つずつ見比べましょう。';
        container.append(heading, note, this.journalTable(userAnswer));
        return;
      }
      if (question.type === 'correction') {
        heading.textContent = '最初の訂正仕訳（誤答）';
        const note = this.document.createElement('p'); note.textContent = '下の「正しい訂正仕訳」と、借方・貸方の科目と金額を見比べましょう。';
        container.append(heading, note, this.journalTable(this.correctionJournal(userAnswer)));
        return;
      }
      if (question.type === 'worksheet') {
        heading.textContent = '最初の回答を決算整理表で比較';
        const note = this.document.createElement('p'); note.textContent = '問題と同じ行・列の中で、入力した値と正解を横に見比べましょう。';
        container.append(heading, note, this.worksheetAnswerComparison(question, score, userAnswer));
        return;
      }
      if (question.format === 'balance-sheet') {
        heading.textContent = '最初の回答を貸借対照表で比較';
        const note = this.document.createElement('p'); note.textContent = '資産と負債・純資産の左右を保ったまま、入力と正解を見比べましょう。';
        container.append(heading, note, this.renderBalanceSheet(question, {}, { user:userAnswer, score }));
        return;
      }
      heading.textContent = '最初の解答と正しい解答';
      const note = this.document.createElement('p'); note.textContent = '「要確認」は最初の回答時の判定です。最初の入力と正解の違いを確認しましょう。';
      container.append(heading, note, this.tableAnswerComparison(question, score, userAnswer));
    }
    renderDiagnostics(question, answer, score) {
      const diagnostics = root.WrongAnswerFeedback.diagnoseWrongAnswer(question, answer, score);
      if (!diagnostics.length) return null;
      const section = this.document.createElement('section'); section.className = 'wrong-answer-feedback'; section.setAttribute('aria-label', '誤答理由と考え方');
      const appendCard = (parent, diagnostic) => { const card = this.document.createElement('article'); card.className = `diagnostic-card diagnostic-${diagnostic.kind}`; const title = this.document.createElement('h4'); title.textContent = diagnostic.title; const reason = this.document.createElement('p'); reason.textContent = diagnostic.reason; card.append(title, reason); parent.append(card); };
      diagnostics.slice(0, 3).forEach(diagnostic => appendCard(section, diagnostic));
      if (diagnostics.length > 3) { const details = this.document.createElement('details'); details.className = 'diagnostic-details'; const summary = this.document.createElement('summary'); summary.textContent = `残り${diagnostics.length - 3}件の正答と根拠を見る`; details.append(summary); diagnostics.slice(3).forEach(diagnostic => appendCard(details, diagnostic)); section.append(details); }
      const diagnostic = diagnostics[0];
      const next = this.document.createElement('p'); next.className = 'diagnostic-next'; next.textContent = `次の確認：${diagnostic.nextRule}`; section.append(next);
      return section;
    }
    explanationTeachingProfile(question) {
      const format = question.format || '', category = String(question.category || '');
      const profile = (summary, transfer, takeaway) => ({summary, transfer, takeaway});
      if (format === 'adjusted-trial-balance') return profile('決算整理を残高へ反映する','整理後残高試算表に記入する',[
        '決算整理事項を該当勘定へ反映し、各残高を借方・貸方の正しい側へ集計します。',
        '間接法では備品の取得原価を維持し、減価償却累計額を貸方に計上します。'
      ]);
      if (format === 'closing-entries') return profile('収益と費用を締め切る','振替金額を記入する',[
        '収益と費用を損益勘定へ集め、その差額で当期純損益を求めます。',
        '当期純利益は損益勘定の借方から繰越利益剰余金の貸方へ振り替えます。'
      ]);
      if (question.type === 'worksheet' && /決算整理・計算問題/u.test(category)) return profile('期間と償却条件を整理する','各計算欄に記入する',[
        '保険料の次期分は当期費用から除き、前払保険料へ振り替えます。',
        '定額法の年額は（取得原価－残存価額）÷耐用年数です。帳簿価額は取得原価から減価償却累計額を差し引きます。'
      ]);
      if (question.type === 'journal') return profile('どういう取引か考える','借方・貸方を決めて仕訳する',[
        '勘定科目は、取引で何が増え、何が減ったかを基準に選びます。',
        '借方・貸方は勘定の性質と増減で決め、最後に貸借一致で確認します。'
      ]);
      if (format === 'journal-book' || /仕訳帳/u.test(category)) return profile('どういう取引か考える','借方・貸方を決めて仕訳帳に記入する',[
        '仕訳帳は、取引を日付順に記録します。',
        '摘要欄には勘定科目、元丁には総勘定元帳の転記先を示す番号、借方・貸方には証憑に基づく金額を記入します。',
        '証憑に金額が示されている場合は、その金額をそのまま記入し、計算が必要かどうかを先に見分けます。'
      ]);
      if (format === 'fixed-asset-ledger' || /固定資産台帳/u.test(category)) return profile('償却条件を整理する','固定資産台帳に記入する',[
        '減価償却は、固定資産の取得原価を使用期間へ配分する処理です。',
        '期中取得・売却は月割りし、帳簿価額は取得原価－減価償却累計額で考えます。'
      ]);
      if (format === 'bookkeeping-notes-receivable') return profile('記帳する受取手形を選ぶ','受取手形記入帳に記入する',[
        '受取手形記入帳には、受け取った約束手形を受取日順に記録します。',
        '小切手など対象外の資料を混ぜず、振出人・満期日・支払場所・金額を手形ごとに確認します。'
      ]);
      if (format === 'bookkeeping-notes-payable') return profile('記帳する支払手形を選ぶ','支払手形記入帳に記入する',[
        '支払手形記入帳には、自店が振り出した約束手形を振出日順に記録します。',
        '他店振出手形の受取などを混ぜず、受取人・満期日・支払場所・金額を確認します。'
      ]);
      if (format === 'bookkeeping-cash-book') return profile('受入と支払を分ける','現金出納帳に記入する',[
        '現金出納帳は、現金の受入と支払を日付順に記録します。',
        '残高は、受入を加え、支払を差し引いて更新します。'
      ]);
      if (format === 'bookkeeping-checking-book') return profile('預入と引出を分ける','当座預金出納帳に記入する',[
        '当座預金出納帳は、預入と引出を日付順に記録します。',
        '残高は、預入を加え、引出を差し引いて更新します。'
      ]);
      if (format === 'bookkeeping-petty-cash-book') return profile('支払内容を科目に分ける','小口現金出納帳に記入する',[
        '小口現金の支払は、領収証や精算書の内容から費用科目を判断します。',
        '定額資金前渡法で支払額と同額を補給する場合、補給額はその期間の支払合計になります。'
      ]);
      if (format === 'bookkeeping-purchase-book') return profile('仕入と返品を分ける','仕入帳に記入する',[
        '仕入帳では仕入と仕入返品を区別して記録します。',
        '純仕入高は、総仕入高から仕入返品を差し引いて求めます。'
      ]);
      if (format === 'bookkeeping-sales-book') return profile('売上と返品を分ける','売上帳に記入する',[
        '売上帳では売上と売上返品を区別して記録します。',
        '純売上高は、総売上高から売上返品を差し引いて求めます。'
      ]);
      if (format === 'bookkeeping-inventory-ledger' || /商品有高帳/u.test(category)) return profile('数量と単価の動きを整理する','商品有高帳に記入する',[
        '商品有高帳では、数量と単価を分けて追います。',
        '払出単価は問題で指定された方法に従い、払出後の数量と金額まで連続して確認します。'
      ]);
      if (format === 'bookkeeping-voucher-entry') return profile('現金が増えるか、減るか、動かないかを確認する','使う伝票を決めて記入する',[
        '現金が増えるなら入金伝票、減るなら出金伝票に記入します。',
        '現金が動かない取引は振替伝票に記入します。'
      ]);
      if (format === 'bookkeeping-general-ledger' || format === 'bookkeeping-account-ledger' || /元帳/u.test(category)) return profile('増減と相手勘定を整理する','元帳に転記する',[
        '元帳では、その勘定が借方・貸方のどちらで増えるかを先に確認します。',
        '取引ごとに相手勘定と金額を転記し、残高を順に更新します。'
      ]);
      if (question.type === 'trial_balance') return profile('残高の置き場所を決める','試算表に記入する',['試算表は、各勘定の最終残高を残高方向ごとに集計する表です。','貸借一致は正解の保証ではなく、転記漏れや二重計上を見つけるための検算です。']);
      if (question.type === 'correction') return profile('どこが違うか整理する','訂正仕訳を書く',['訂正仕訳は、既存の記録と本来の正しい処理との差だけを直す仕訳です。','正しい部分まで取り消さず、誤っている部分だけを修正します。']);
      if (question.type === 'worksheet') return profile('決算整理を反映する','精算表に記入する',['精算表は「整理前残高 → 決算整理 → 損益計算書・貸借対照表」をつなぐ表です。','決算整理後の各勘定は、その性質に応じて損益計算書か貸借対照表へ振り分けます。']);
      if (question.type === 'financial_statement') return profile('どの区分に入るか決める','財務諸表に記入する',['損益計算書は期間の収益・費用と利益、貸借対照表は期末の資産・負債・純資産を示します。','金額が合っていても表示区分が違えば誤りなので、区分まで確認します。']);
      if (question.type === 'comprehensive' && format === 'exam-question-3') return profile('決算整理を順に反映する','答えに反映する',['総合決算では、個々の整理事項が利益と貸借対照表の両方へ波及します。','最後の確認は答えの再読ではなく、貸借一致など別の根拠で行います。']);
      if (question.type === 'comprehensive') return profile('現金と利益を分けて考える','答えに反映する',['現金残高は現金の入出金、利益は収益と費用で求めるため、同じものではありません。','借入・売掛金回収・備品購入・前払いなどは、現金と損益への影響が一致しない代表例です。']);
      return profile('問題文の条件を整理する','答えに記入する',['問題文の条件を整理し、必要な会計処理を一つずつ決めます。','答えを書いたら、問題の条件に合っているか確認します。']);
    }
    explanationDisclosure(label) {
      const details = this.document.createElement('details'); details.className = 'explanation-supplement';
      const summary = this.document.createElement('summary'); summary.textContent = label;
      details.append(summary);
      return details;
    }
    renderStructuredExplanation(question, userAnswer, score) {
      const structuredAlways = question.teachingPresentation === 'structured-always';
      if ((score.correct && !structuredAlways) || !question.explanationModel || !root.ExplanationModel?.build) return null;
      const model = root.ExplanationModel.build(question, userAnswer || {}, score);
      const valueText = (value, semanticType) => value === true ? '確認' : root.WrongAnswerFeedback.formatValue(value, semanticType);
      const flow = this.document.createElement('section'); flow.className = 'explanation-flow'; flow.setAttribute('aria-label', 'この問題をもう一度解く手順');
      const intro = this.document.createElement('h4'); intro.className = 'explanation-flow-title'; intro.textContent = score.correct ? 'この問題の解き方を確認' : 'この問題をもう一度解く手順'; flow.append(intro);
      const hasMeaningfulCalculation = (model.calculation || []).some(item => /[×÷＋+−\-＝=]/u.test(String(item.expression || '')));
      const teachingProfile = this.explanationTeachingProfile(question);
      const definitions = [
        [teachingProfile.summary,'summary'],
        ['使う資料を整理する','sources'],
        ...(hasMeaningfulCalculation ? [['必要な金額を出す','calculation']] : []),
        [teachingProfile.transfer,'transfer'],
        ['最後に確認','checks'],
        ['間違えやすいところ','mistakes']
      ].filter(([,key]) => (model[key] || []).length > 0);
      const element = (tag, className, text) => { const node = this.document.createElement(tag); if (className) node.className = className; if (text != null) node.textContent = text; return node; };
      const supplementary = this.explanationDisclosure('資料・解き方の補足・検算を確認');
      const renderSection = (label, key, items, index) => {
        const section = element('section', 'explanation-flow-section'); section.dataset.section = key;
        const head = element('div', 'explanation-flow-head');
        if (index != null) head.append(element('div', 'explanation-flow-step', String(index + 1)));
        head.append(element('h5', '', label)); section.append(head);
        if (key === 'sources') items.forEach(item => {
          const card = element('article', 'explanation-source-card');
          card.append(element('h6', '', item.title), element('p', 'explanation-source-focus', item.focus));
          if (item.table?.columns?.length && item.table?.rows?.length) {
            const wrap = element('div', 'explanation-source-table-wrap'); wrap.dataset.questionType = question.type; wrap.tabIndex = 0; wrap.setAttribute('aria-label', `${item.title}の確認表`);
            const table = element('table', 'explanation-source-table'); table.dataset.questionType = question.type;
            if (item.table.kind) { wrap.dataset.tableKind = item.table.kind; table.dataset.tableKind = item.table.kind; }
            table.dataset.columnCount = String(item.table.columns.length);
            const thead = element('thead', ''), headRow = element('tr', '');
            item.table.columns.forEach(column => { const th = element('th', '', column.label); th.scope = 'col'; if(column.key) th.dataset.columnKey=column.key; headRow.append(th); });
            thead.append(headRow); table.append(thead);
            const tbody = element('tbody', '');
            item.table.rows.forEach((row,rowIndex) => {
              const tr = element('tr', '');
              if (item.table.totalRowIndexes?.includes?.(rowIndex)) tr.classList.add('explanation-source-total-row');
              row.forEach(cell => { const unknown = cell.value === '入力', className = unknown ? 'explanation-source-unknown' : (typeof cell.value === 'number' ? 'is-number' : ''); const shownValue = unknown ? '？' : (cell.value == null || cell.value === '' ? '—' : (typeof cell.value === 'number' ? cell.value.toLocaleString('ja-JP') : String(cell.value))); const td=element('td', className, shownValue); if(cell.key) td.dataset.columnKey=cell.key; tr.append(td); });
              tbody.append(tr);
            });
            table.append(tbody); wrap.append(table); card.append(wrap);
          } else if (item.list?.length) {
            const list = element('ol', 'explanation-source-list'); item.list.forEach(value => list.append(element('li', '', String(value)))); card.append(list);
          } else {
            const list = element('dl', 'explanation-source-values');
            (item.values || []).forEach(value => { const row = element('div', 'explanation-source-value'); row.append(element('dt', '', value.label), element('dd', '', valueText(value.value, value.semanticType))); list.append(row); });
            card.append(list);
          }
          section.append(card);
        });
        if (key === 'summary') { const list = element('div', 'explanation-summary-list'); items.forEach(item => list.append(element('p', 'explanation-summary-item', item.text))); section.append(list); }
        if (key === 'calculation') items.forEach(item => { const card = element('article', 'explanation-formula'); const shownFormula = item.derivation === 'direct' ? (item.note || `計算不要：${valueText(item.result, item.semanticType)}を使用`) : (item.expression || `答え：${valueText(item.result, item.semanticType)}`); card.append(element('div', 'explanation-formula-label', item.label), element('strong', '', shownFormula)); if (item.operands?.length) { const operands = element('div', 'explanation-operands'); item.operands.forEach(value => operands.append(element('span', 'explanation-operand', `${value.label} ${valueText(value.value, value.semanticType)}`))); card.append(operands); } section.append(card); });
        if (key === 'transfer') items.forEach(item => { const card = element('article', 'explanation-transfer-card'), from = element('div', 'explanation-transfer-from'), to = element('div', 'explanation-transfer-to'); from.append(element('strong', '', item.from), element('div', '', item.decision)); to.append(element('strong', '', item.to), element('div', '', valueText(item.value, item.semanticType))); const arrow = element('div', 'explanation-transfer-arrow', '→'); arrow.setAttribute('aria-hidden', 'true'); card.append(from, arrow, to); section.append(card); });
        if (key === 'checks') { const list = element('div', 'explanation-checks'); items.forEach(item => { const card = element('article', 'explanation-check-item'); card.append(element('div', 'explanation-check-mark', '✓')); const body = element('div', 'explanation-check-body'); body.append(element('strong', '', item.label), element('span', '', valueText(item.expected))); if (item.note) body.append(element('span', '', item.note)); card.append(body); list.append(card); }); section.append(list); }
        if (key === 'mistakes') items.forEach(item => { const card = element('article', 'explanation-mistake-card'); card.append(element('h6', '', item.title), element('p', '', item.reason), element('p', 'explanation-mistake-fix', `直し方：${item.correction}`)); section.append(card); });
        return section;
      };
      let primaryIndex = 0;
      definitions.forEach(([label, key]) => {
        const items = model[key] || [];
        let primary = items, extra = [];
        if (key === 'sources' || key === 'checks') {
          // A real separate check for comprehensive closing deserves a first glance;
          // do not invent an answer-echo check when no independent check exists.
          if (key === 'checks' && question.type === 'comprehensive') {
            primary = items.slice(0, 1); extra = items.slice(1);
          } else { primary = []; extra = items; }
        }
        if (key === 'summary' && items.some(item => item.evidenceRef === 'explanation')) {
          primary = items.filter(item => item.evidenceRef === 'explanation');
          extra = items.filter(item => item.evidenceRef !== 'explanation');
        }
        if (key === 'mistakes') {
          primary = score.correct ? [] : items.slice(0, 1);
          extra = items.slice(primary.length);
        }
        if (primary.length) flow.append(renderSection(key === 'mistakes' ? 'まず確認する点（原因の候補）' : label, key, primary, primaryIndex++));
        if (extra.length) supplementary.append(renderSection(key === 'summary' && primary.length ? '考え方の補足' : key === 'checks' && primary.length ? '追加の検算' : label, key, extra, null));
        // The author-provided arithmetic remains the authority. Clarify what the
        // result means without creating a fake independent check or duplicate card.
        if (key === 'summary' && ['F001','C002','C010'].includes(question.id)) {
          const guides = {
            F001:'売上総利益は売上高から売上原価を引いた金額です。その残りから売上原価以外の費用を引くと当期純利益になります。売上原価を二重に引かないように確認します。',
            C002:'現金の実査では未記帳の税込売上を帳簿に反映した後で差額を求めます。消費税は仮受と仮払を照合し、赤字は損失として負の数で記入します。',
            C010:'社長への報告は現金の出入りと当月の収益・費用を分けて説明します。掛売上は収益でも現金の入金ではありません。'
          };
          const card = element('section','explanation-meaning-guide');
          card.append(element('h5','','この仕事で判断すること'),element('p','',guides[question.id]));
          flow.append(card);
        }
        if (key === 'calculation' && question.type === 'comprehensive') {
          const inputs=question.table?.inputCells || [];
          const slots=inputs.map(id=>({id,calculation:model.calculation.find(item=>item.cellId===id)}));
          if(inputs.length && slots.every(slot=>slot.calculation)){
            const card=element('section','explanation-placement-guide');
            card.append(element('h5','','解答欄への記入を確認'),element('p','','計算で求めた金額を、同じ項目の解答欄へ記入します。金額は上の計算で確認し、ここでは二度表示しません。'));
            // The first destination is visible at a glance. Only additional
            // destinations need disclosure; never reprint calculated answers.
            const destinations=slots.map(slot=>{
              const label=question.table?.inputMetadata?.[slot.id]?.label || slot.calculation.label;
              return slot.calculation.label+' → '+label+'欄';
            });
            card.append(element('p','explanation-placement-first','最初の記入先：'+destinations[0]));
            if (destinations.length>1) {
              const details=this.explanationDisclosure('残り'+(destinations.length-1)+'項目の記入先を確認');
              const list=element('ol','explanation-placement-list');
              destinations.slice(1).forEach(destination=>list.append(element('li','',destination)));
              details.append(list);card.append(details);
            }
            flow.append(card);
          }
        }
      });
      if (supplementary.children.length > 1) flow.append(supplementary);
      return flow;
    }
    renderLearningTakeaway(question, container) {
      const rules = this.explanationTeachingProfile(question).takeaway;
      const card = this.document.createElement('section'); card.className = 'explanation-card explanation-takeaway';
      const heading = this.document.createElement('h4'); heading.textContent = 'この問題で覚えること';
      const list = this.document.createElement('ul'); list.className = 'explanation-takeaway-list';
      rules.forEach(rule => { const item = this.document.createElement('li'); item.textContent = rule; list.append(item); });
      card.append(heading, list); container.append(card);
      this.renderKnowledgeLinks(question, container);
    }
    appendAuthoredExplanation(question, container, authoredOnly = false) {
      if (question.npcDialogue) { const dialogue = this.document.createElement('blockquote'); dialogue.className = 'npc-dialogue'; dialogue.textContent = question.npcDialogue; container.append(dialogue); }
      if (question.type === 'journal' && question.answer) { const badges = this.document.createElement('div'); badges.className = 'explanation-accounts'; [...question.answer.debit, ...question.answer.credit].forEach(item => badges.append(this.accountLabel(item.account))); container.append(badges); }
      let explanation = String(question.explanation || '');
      if (authoredOnly) {
        const markers = ['【この問題への当てはめ】','【使用する資料】'].map(marker => explanation.indexOf(marker)).filter(index => index >= 0);
        if (markers.length) explanation = explanation.slice(0, Math.min(...markers)).trimEnd();
      }
      this.explanationSections(explanation).forEach(section => { const card = this.document.createElement('section'); card.className = `explanation-card explanation-card-${section.kind}`; const title = this.document.createElement('h4'); title.textContent = section.label; const text = this.document.createElement('p'); text.className = 'explanation-text'; text.textContent = section.text; card.append(title, text); container.append(card); });
      this.renderKnowledgeLinks(question, container);
    }
    renderAccountNature(question, container) {
      // Explain the five elements only AFTER the answer is submitted.
      // The correction entry is the net adjustment, not the original transaction.
      if (question.type !== 'journal' && question.type !== 'correction') return;
      const answer = question.type === 'journal' ? question.answer : this.correctionJournal(question.answer);
      const lines = [...(answer?.debit || []).map(item => ({...item, side:'debit'})),
        ...(answer?.credit || []).map(item => ({...item, side:'credit'}))].filter(item => item.account);
      if (!lines.length) return;
      const section = this.document.createElement('section');
      section.className = 'account-nature-explanation';
      const heading = this.document.createElement('h4');
      heading.textContent = '勘定科目の区分と借方・貸方の理由';
      const list = this.document.createElement('ul');
      for (const item of lines) {
        const type = this.accountType(item.account);
        const label = DOMAIN.typeLabels[type] || '未分類';
        const side = item.side === 'debit' ? '借方' : '貸方';
        const normalDebit = type === 'asset' || type === 'expense';
        const normalCredit = type === 'liability' || type === 'equity' || type === 'revenue';
        const contra = type === 'contraAsset';
        let movement;
        if (contra) movement = item.side === 'credit' ? '資産を減額する控除額が増加' : '資産を減額する控除額が減少';
        else if (normalDebit || normalCredit) {
          const increasing = (normalDebit && item.side === 'debit') || (normalCredit && item.side === 'credit');
          movement = increasing ? '増加' : '減少';
        }
        const li = this.document.createElement('li');
        const strong = this.document.createElement('strong');
        strong.textContent = item.account + '（' + label + '）';
        const reason = this.document.createElement('span');
        // Special accounts are not ordinary five-element balances. Determine
        // the event from both sides of the completed journal, not the side alone.
        const paired = (postingSide, account) => lines.some(entry =>
          entry.side === postingSide && entry.account === account);
        let specialReason = '';
        if (type === 'temporary') {
          if (question.type === 'correction') {
            specialReason = '訂正仕訳では、現金の実査差額について誤って記録した部分を直すため、差額として' + side + 'に記入します。もとの仕訳と正しい仕訳の差を確認してください。';
          } else if (item.side === 'debit' && paired('credit', '現金')) {
            specialReason = '現金の実際有高が帳簿残高より少ないため、現金（資産）を貸方で減らし、帳簿を実際有高に合わせます。原因未判明の不足額を一時的に受ける相手科目として、現金過不足を借方に記入します。';
          } else if (item.side === 'credit' && paired('debit', '現金')) {
            specialReason = '現金の実際有高が帳簿残高より多いため、現金（資産）を借方で増やし、帳簿を実際有高に合わせます。原因未判明の過剰額を一時的に受ける相手科目として、現金過不足を貸方に記入します。';
          } else if (item.side === 'credit') {
            specialReason = '先に借方へ仮記録した現金不足を、原因判明または決算に伴って正しい科目へ振り替え、仮記録を減らすため現金過不足を貸方に記入します。現金は不足発見時に調整済みなので、ここでは重ねて増減させません。';
          } else {
            specialReason = '先に貸方へ仮記録した現金過剰を、原因判明または決算に伴って正しい科目へ振り替え、仮記録を減らすため現金過不足を借方に記入します。現金は過剰発見時に調整済みなので、ここでは重ねて増減させません。';
          }
        } else if (type === 'closing') {
          if (question.type !== 'correction' && item.side === 'debit' && paired('credit', '繰越利益剰余金')) {
            specialReason = '決算で収益が費用を上回り、損益に貸方残高（当期純利益）が残っています。これをゼロにするため損益を借方に記入し、利益を繰越利益剰余金（純資産）の貸方へ振り替えます。';
          } else if (question.type !== 'correction' && item.side === 'credit' && paired('debit', '繰越利益剰余金')) {
            specialReason = '決算で費用が収益を上回り、損益に借方残高（当期純損失）が残っています。これをゼロにするため損益を貸方に記入し、損失を繰越利益剰余金（純資産）の借方へ振り替えます。';
          } else if (item.side === 'debit' && lines.some(entry => entry.side === 'credit' && this.accountType(entry.account) === 'expense')) {
            specialReason = '費用勘定の借方残高を締め切り、決算勘定へ集めるため、費用を貸方に戻して同額を損益の借方に記入します。';
          } else if (item.side === 'credit' && lines.some(entry => entry.side === 'debit' && this.accountType(entry.account) === 'revenue')) {
            specialReason = '収益勘定の貸方残高を締め切り、決算勘定へ集めるため、収益を借方に戻して同額を損益の貸方に記入します。';
          } else {
            specialReason = '損益は収益を貸方、費用を借方へ集め、残った利益・損失を純資産へ振り替える決算勘定です。この仕訳の相手科目と振替目的を確認して' + side + 'に記入します。';
          }
        }
        reason.textContent = specialReason
          ? '：' + specialReason
          : movement
            ? '：' + movement + 'するため' + side + 'に記入します。'
            : '：この科目の区分は未登録のため、通常の五要素だけでは記入方向を断定できません。元の取引と仕訳の根拠を確認してください。';
        li.append(strong, reason);
        list.append(li);
      }
      const note = this.document.createElement('p');
      note.textContent = question.type === 'correction'
        ? 'ここに示すのは訂正仕訳の増減です。もとの誤仕訳と本来の正しい仕訳の差を、以下の解説で確認してください。'
        : '科目を選ぶ取引固有の理由と金額の求め方は、続く解説で確認してください。';
      section.append(heading, list, note);
      container.append(section);
    }
    renderExplanation(question, score, userAnswer) {
      const container = this.byId('explanation'); container.replaceChildren();
      const heading = this.document.createElement('h3'); heading.textContent = '今回の解説'; container.append(heading);
      const lead = this.document.createElement('p'); lead.className = 'explanation-summary';
      lead.textContent = score.correct
        ? '正解です。この問題の処理と答えの根拠を確認しましょう。'
        : 'この問題の処理と答えの根拠を確認しましょう。回答との差だけで、間違えた原因は断定できません。';
      container.append(lead);
      this.renderAccountNature(question, container);
      const supplementary = this.explanationDisclosure('解答の道筋・学習のポイントを確認');
      if (root.ExplanationDesignSystem?.planFor && root.ExplanationDesignSystem?.render) {
        const routeModel = question.explanationModel && root.ExplanationModel?.build
          ? root.ExplanationModel.build(question, userAnswer || {}, score)
          : null;
        const baseRoute = root.ExplanationDesignSystem.planFor(question, { model:routeModel, correct:score.correct });
        const route = question.type === 'worksheet' && /決算整理・計算問題/u.test(question.category || '')
          ? {...baseRoute, title:'決算整理の計算', path:['保険料の対象期間','当期分と次期分','償却条件','減価償却費と帳簿価額','元の金額へ戻して確認']}
          : baseRoute;
        supplementary.append(root.ExplanationDesignSystem.render(this.document, route));
      }
      const structured = this.renderStructuredExplanation(question, userAnswer, score);
      if (structured) { container.append(structured); this.renderLearningTakeaway(question, supplementary); container.append(supplementary); return; }
      const solution = this.document.createElement('section'); solution.className = 'solution-steps';
      const solutionHeading = this.document.createElement('h4'); solutionHeading.textContent = '解き方（この順番で考える）';
      const list = this.document.createElement('ol');
      const steps = {
        journal:['取引によって増えたものと減ったものを拾います。','それぞれに適切な勘定科目を当てはめます。','資産・費用の増加は借方、負債・純資産・収益の増加は貸方に置き、減少は反対側に置きます。','借方合計と貸方合計が一致するまで金額を確認します。'],
        correction:['帳簿に記録済みの仕訳を、借方・貸方に分けて書き出します。','証憑から本来の正しい仕訳を作ります。','誤った部分を逆向きにして取り消し、正しい処理との差額だけを訂正仕訳にします。','訂正仕訳を元の帳簿へ加え、証憑どおりの科目・金額になっているか確認します。'],
        ledger:root.WrongAnswerFeedback?.ledgerGuidance(question) || ['求められている記入欄と資料を照合します。'],
        trial_balance:['各勘定の最終残高と残高方向を確認します。','借方残高は借方列、貸方残高は貸方列へ一度だけ転記します。','各列を合計します。','借方合計と貸方合計が一致するか見て、転記漏れや二重計上がないか確認します。'],
        worksheet:['試算表の残高を出発点にします。','決算整理事項を仕訳にし、修正記入の借方・貸方へ記入します。','修正後の各勘定を、収益・費用は損益計算書、資産・負債・純資産は貸借対照表へ振り分けます。','各欄の借方・貸方を合計し、差額となる当期純利益まで一致を確認します。'],
        financial_statement:['資料から収益・費用・資産・負債・純資産を分類します。','収益から売上原価と費用を差し引いて利益を求めます。','期末残高を対応する財務諸表の欄へ転記します。','合計や貸借の一致を確認します。'],
        comprehensive:['資料ごとに必要な取引を仕訳します。','仕訳を帳簿へ転記して残高を集計します。','決算整理事項を反映します。','各段階で貸借が合っているか確認し、最後の金額を記入します。']
      }[question.type] || ['資料の条件を整理します。','必要な会計処理を決めます。','計算して対応する欄へ転記します。','合計が合っているか、元の資料と見比べて確認します。'];
      steps.forEach(step => { const item = this.document.createElement('li'); item.textContent = step; list.append(item); });
      solution.append(solutionHeading, list); supplementary.append(solution);
      const diagnostics = this.renderDiagnostics(question, userAnswer, score);
      if (diagnostics) container.append(diagnostics);
      this.appendAuthoredExplanation(question, container);
      container.append(supplementary);
    }
    renderKnowledgeLinks(question, container) {
      const links = question.knowledgeLinks;
      if (!links) return;
      const card = this.document.createElement('section'); card.className = 'knowledge-links';
      const heading = this.document.createElement('h4'); heading.textContent = '理解をつなぐ次の一歩'; card.append(heading);
      const list = this.document.createElement('ul');
      [['prerequisite', '先に確認'], ['related', '関連'], ['nextConcept', '次の疑問'], ['reviewOf', '復習元']].forEach(([key, label]) => {
        const ids = Array.isArray(links[key]) ? links[key] : links[key] ? [links[key]] : [];
        ids.forEach(id => { const item = this.document.createElement('li'); const button = this.document.createElement('button'); button.type = 'button'; button.className = 'knowledge-link'; button.dataset.action = 'open-related'; button.dataset.questionId = id; button.textContent = `${label}：${id}`; item.append(button); list.append(item); });
      });
      if (list.children.length) { card.append(list); container.append(card); }
    }
    answerReviewBlock(label, question, answer) {
      const section = this.document.createElement('section'); section.className = 'exam-answer-review';
      const heading = this.document.createElement('h4'); heading.textContent = label; section.append(heading);
      if (!answer) { const empty = this.document.createElement('p'); empty.textContent = '未回答'; section.append(empty); return section; }
      if (question.type === 'journal') section.append(this.journalTable(answer));
      else {
        const list = this.document.createElement('dl'); list.className = 'exam-cell-review';
        question.table.inputCells.forEach(cellId => { const term = this.document.createElement('dt'); term.textContent = this.cellLabel(question, cellId); const value = this.document.createElement('dd'); value.textContent = answer.cells?.[cellId] === '' || answer.cells?.[cellId] == null ? '未入力' : String(answer.cells[cellId]); list.append(term, value); });
        section.append(list);
      }
      return section;
    }
    cellLabel(question, cellId) {
      const index = question.table.inputCells.indexOf(cellId); let seen = -1;
      for (const row of question.table.rows) {
        if (Object.values(row).includes('入力')) { seen += 1; if (seen === index) { const fixed = Object.values(row).find(value => value !== '入力' && value != null && value !== ''); if (fixed != null) return String(fixed); } }
      }
      return `回答欄${index + 1}`;
    }
    examResult(review, questions, history, achievement = {}) {
      const standardActions = this.byId('standard-result-actions'); const examActions = this.byId('exam-result-actions');
      if (standardActions) standardActions.hidden = true; if (examActions) examActions.hidden = false;
      const box = this.byId('result-status'); box.className = `result-box ${review.passed ? 'result-correct' : 'result-incorrect'}`;
      box.textContent = `${review.points}点 / 100点（${review.passed ? '合格圏' : '要復習'}）｜未回答 ${review.unansweredCount}問`;
      this.renderAchievement(box, achievement);
      this.byId('answer-comparison').hidden = true; this.byId('correct-journal').replaceChildren();
      const container = this.byId('explanation'); container.replaceChildren();
      const heading = this.document.createElement('h3'); heading.textContent = '問題別レビュー'; container.append(heading);
      review.items.forEach((item, index) => { const question = questions[item.id]; const details = this.document.createElement('details'); const summary = this.document.createElement('summary'); summary.textContent = `第${index + 1}問｜${item.earned}/${item.points}点｜${item.correct ? '正解' : item.answer ? '不正解' : '未回答'}｜${item.topic}`; details.append(summary, this.answerReviewBlock('自分の回答', question, item.answer), this.answerReviewBlock('正解', question, question.answer)); const diagnostics = this.renderDiagnostics(question, item.answer, { correct: item.correct }); if (diagnostics) details.append(diagnostics); const explanation = this.document.createElement('p'); explanation.className = 'exam-review-explanation'; explanation.textContent = question.explanation; details.append(explanation); this.renderAccountNature(question, details); container.append(details); });
      const historyHeading = this.document.createElement('h3'); historyHeading.textContent = '直近の成績'; container.append(historyHeading);
      const list = this.document.createElement('ol'); history.slice(-5).reverse().forEach(item => { const row = this.document.createElement('li'); row.textContent = `${new Date(item.finishedAt).toLocaleString('ja-JP')}｜${item.points}点${item.unverified ? '（旧記録・未検証）' : ''}｜${item.passed ? '合格圏' : '要復習'}｜所要${Math.ceil(item.durationMs / 60000)}分｜未回答${item.unansweredCount}問`; list.append(row); }); container.append(list);
    }
    explanationSections(explanation = '') {
      const parts = String(explanation).split(/【([^】]+)】/); const sections = [];
      if (parts[0].trim()) sections.push({ label: '解説', kind: 'memo', text: parts[0].trim() });
      for (let index = 1; index < parts.length; index += 2) {
        const raw = parts[index]; const label = /試験|ポイント/.test(raw) ? '試験POINT' : /根拠/.test(raw) ? '実務MEMO' : raw;
        sections.push({ label, kind: label === '試験POINT' ? 'point' : 'memo', text: (parts[index + 1] || '').trim() });
      }
      return sections.length ? sections : [{ label: '解説', kind: 'memo', text: '' }];
    }
    renderCorrectJournal(question) {
      let container = this.byId('correct-journal');
      if (!container) {
        container = this.document.createElement('div'); container.id = 'correct-journal'; container.className = 'correct-journal';
        this.byId('explanation').before(container);
      }
      container.replaceChildren();
      if (!['journal', 'correction'].includes(question.type) || !question.answer) return;
      const heading = this.document.createElement('h3'); heading.textContent = question.type === 'correction' ? '正しい訂正仕訳' : '正しい仕訳';
      const answer = question.type === 'correction' ? this.correctionJournal(question.answer) : question.answer;
      container.append(heading, this.journalTable(answer));
    }
  }
  root.AppView = AppView;
}(window));
