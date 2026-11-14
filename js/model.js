(function (root) {
  'use strict';
  const CONTENT_REVISION = 6;
  // These identities describe reviewed content contracts, not a release
  // timestamp. A later replacement requires an explicit new identity/migration.
  const CONTENT_IDENTITIES = Object.freeze({
    D002: Object.freeze({category:'決算整理・計算問題',type:'worksheet',identity:'D002:closing-decision-v2',legacy:'D002:four-amount-worksheet-v1',sinceRevision:6}),
    D003: Object.freeze({category:'決算整理・計算問題',type:'worksheet',identity:'D003:closing-decision-v2',legacy:'D003:four-amount-worksheet-v1',sinceRevision:6}),
    D004: Object.freeze({category:'決算整理・計算問題',type:'worksheet',identity:'D004:closing-decision-v2',legacy:'D004:four-amount-worksheet-v1',sinceRevision:6}),
    D005: Object.freeze({category:'決算整理・計算問題',type:'worksheet',identity:'D005:closing-decision-v2',legacy:'D005:four-amount-worksheet-v1',sinceRevision:6}),
    D006: Object.freeze({category:'決算整理・計算問題',type:'worksheet',identity:'D006:closing-decision-v2',legacy:'D006:four-amount-worksheet-v1',sinceRevision:6}),
    D007: Object.freeze({category:'決算整理・計算問題',type:'worksheet',identity:'D007:closing-decision-v2',legacy:'D007:four-amount-worksheet-v1',sinceRevision:6}),
    D008: Object.freeze({category:'決算整理・計算問題',type:'worksheet',identity:'D008:closing-decision-v2',legacy:'D008:four-amount-worksheet-v1',sinceRevision:6}),
    D009: Object.freeze({category:'決算整理・計算問題',type:'worksheet',identity:'D009:closing-decision-v2',legacy:'D009:four-amount-worksheet-v1',sinceRevision:6}),
    D010: Object.freeze({category:'決算整理・計算問題',type:'worksheet',identity:'D010:closing-decision-v2',legacy:'D010:four-amount-worksheet-v1',sinceRevision:6}),
    D011: Object.freeze({category:'決算整理・計算問題',type:'worksheet',identity:'D011:closing-decision-v2',legacy:'D011:four-amount-worksheet-v1',sinceRevision:6}),
    D012: Object.freeze({category:'決算整理・計算問題',type:'worksheet',identity:'D012:closing-decision-v2',legacy:'D012:four-amount-worksheet-v1',sinceRevision:6}),
    D013: Object.freeze({category:'決算整理・計算問題',type:'worksheet',identity:'D013:closing-decision-v2',legacy:'D013:four-amount-worksheet-v1',sinceRevision:6}),
    D014: Object.freeze({category:'決算整理・計算問題',type:'worksheet',identity:'D014:closing-decision-v2',legacy:'D014:four-amount-worksheet-v1',sinceRevision:6}),
    D015: Object.freeze({category:'決算整理・計算問題',type:'worksheet',identity:'D015:closing-decision-v2',legacy:'D015:four-amount-worksheet-v1',sinceRevision:6}),
    D016: Object.freeze({category:'決算整理・計算問題',type:'worksheet',identity:'D016:closing-decision-v2',legacy:'D016:four-amount-worksheet-v1',sinceRevision:6}),
    D017: Object.freeze({category:'決算整理・計算問題',type:'worksheet',identity:'D017:closing-decision-v2',legacy:'D017:four-amount-worksheet-v1',sinceRevision:6}),
    D018: Object.freeze({category:'決算整理・計算問題',type:'worksheet',identity:'D018:closing-decision-v2',legacy:'D018:four-amount-worksheet-v1',sinceRevision:6}),
    J051: Object.freeze({ category:'剰余金の配当', type:'journal', identity:'J051:dividend-declaration-v1' }),
    L031: Object.freeze({ category:'勘定記入法則', type:'ledger', identity:'L031:account-entry-rules-v1' }),
    L044: Object.freeze({ category:'現金出納帳', type:'ledger', identity:'L044:cash-book-opening-zero-v1', legacy:'L044:cash-book-opening-unspecified-v0' }),
    L045: Object.freeze({ category:'当座預金出納帳', type:'ledger', identity:'L045:checking-book-opening-zero-v1', legacy:'L045:checking-book-opening-unspecified-v0' })
  });
  const cloneContent = value => JSON.parse(JSON.stringify(value));
  const validExamIdentity = value => value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === 3 && ['startedAt','endAt','attempt'].every(key => Object.hasOwn(value,key)) &&
    Number.isFinite(value.startedAt) && value.startedAt >= 0 && Number.isFinite(value.endAt) && value.endAt > value.startedAt &&
    Number.isSafeInteger(value.attempt) && value.attempt >= 0;
  const examIdentity = state => ({startedAt:state.examSession.startedAt,endAt:state.examSession.endAt,attempt:state.examAttempt});
  const sameExamIdentity = (left,right) => validExamIdentity(left) && validExamIdentity(right) &&
    ['startedAt','endAt','attempt'].every(key => left[key] === right[key]);
  const emptyContentArchive = () => ({ schemaVersion:1, questions:{}, reviewAssignments:{}, completed:null });
  const LEARNING_SCHEMA_VERSION = 3;
  const EVIDENCE_MODES = ['story','training','review','exam','desk'];
  const EVIDENCE_SUPPORT = ['none','hint-1','hint-2','unknown'];
  // Bounded checksums detect accidental disagreement in the retained log and
  // durable evidence. They are integrity metadata, not authentication of user JSON.
  const valueSignature = value => {
    let hash = 2166136261;
    const text = JSON.stringify(value);
    for (let index=0; index<text.length; index++) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619) >>> 0;
    return hash.toString(16).padStart(8, '0');
  };
  // Completion and observation are separate operations (notably in an active
  // exam). Bind the issued values without deriving completion from an answer.
  const evidenceStateSignature = (state, version = 11) => valueSignature([state.learningEffectiveness, state.questionStats,
    state.lastLearningAt, state.answeredIds, state.correctIds, state.incorrectIds,
    ...(version >= 3 ? [state.learningContinuityState] : []),
    ...(version >= 4 ? [state.reviewSchedule, state.reviewAssignments] : []),
    ...(version >= 5 ? [state.examHistory] : []),
    ...(version >= 6 ? [state.examSession,state.examAttempt,state.contentMigrationArchive,state.contentRecheckIds] : []),
    ...(version >= 7 ? [state.placement] : []),
    ...(version >= 8 ? [state.mistakeCounts] : []),
    ...(version >= 9 ? [state.drafts] : []),
    ...(version >= 10 ? [state.learningDayHistory, state.legacyProvenance, state.completed, state.lastExamReview] : []),
    ...(version >= 11 ? [state.contentRevision, state.questionContentVersions] : [])]);
  const emptyEffectiveness = (initialHistory = 'complete', attempts = []) => ({ schemaVersion:1, initialHistory, retainedAttemptsSignature:valueSignature(attempts), questions:{} });
  const emptyEvidence = () => ({
    observedAttempts:0, correctCount:0, incorrectCount:0, firstObservedAt:null, lastObservedAt:null, firstAttempt:null,
    modes:Object.fromEntries(EVIDENCE_MODES.map(mode => [mode, { attempts:0, successes:0 }])),
    delayedReview:{ attempts:0, successes:0, lastAt:null, highestConfirmedStage:null, receipts:{correct:null,incorrect:null},
      stages:Array.from({ length:5 }, () => ({ attempts:0, successes:0 })) },
    reviewBindings:{}, lastExamObservation:null, misconceptionStats:{}
  });
  const FIXED_ASSET_SCHEMA_REVISION_2_IDS = new Set(['L005','L010','L015','L020','L025','L030','L033','L040']);
  class ProgressModel {
    static currentContentVersions(questions = {}, revision = CONTENT_REVISION) {
      return Object.fromEntries(Object.entries(CONTENT_IDENTITIES).filter(([id, spec]) =>
        (revision >= (spec.sinceRevision || (spec.legacy ? 5 : 1))) && questions[id]?.category === spec.category && questions[id]?.type === spec.type).map(([id, spec]) => [id, spec.identity]));
    }
    static validContentMetadata(value, questions = {}) {
      const plain = item => item && typeof item === 'object' && !Array.isArray(item);
      const fields = ['questionContentVersions','contentMigrationArchive','contentRecheckIds'];
      if ((value.contentRevision || 1) < 4) return fields.every(key => value[key] === undefined);
      const versions = ProgressModel.currentContentVersions(questions, value.contentRevision);
      if (!plain(value.questionContentVersions) || Object.keys(value.questionContentVersions).length !== Object.keys(versions).length ||
          Object.keys(versions).some(id => value.questionContentVersions[id] !== versions[id] &&
            !(value.contentRevision === 5 && CONTENT_IDENTITIES[id]?.legacy === value.questionContentVersions[id]))) return false;
      if (value.contentRevision >= 5 && value.learningEvidenceIntegrity?.schemaVersion !== 11) return false;
      if (!Array.isArray(value.contentRecheckIds) || new Set(value.contentRecheckIds).size !== value.contentRecheckIds.length ||
          value.contentRecheckIds.some(id => !Object.hasOwn(versions, id))) return false;
      const archive = value.contentMigrationArchive;
      if (!plain(archive) || archive.schemaVersion !== 1 || !plain(archive.questions) || !plain(archive.reviewAssignments) ||
          !(archive.completed === null || typeof archive.completed === 'boolean')) return false;
      const probe = Object.create(ProgressModel.prototype);
      for (const [id, item] of Object.entries(archive.questions)) {
        if (!Object.hasOwn(versions, id) || !plain(item) || item.toIdentity !== versions[id] || value.questionContentVersions[id] !== versions[id] ||
            !Number.isSafeInteger(item.fromRevision) || item.fromRevision < 1 || item.fromRevision > (CONTENT_IDENTITIES[id]?.legacy ? 5 : 3) ||
            !(item.questionStats === null || probe.validQuestionStats(item.questionStats)) ||
            !Array.isArray(item.attempts) || item.attempts.some(attempt => !plain(attempt) || (attempt.questionId || attempt.id) !== id || typeof attempt.correct !== 'boolean') ||
            !plain(item.flags) || ['answered','correct','incorrect'].some(key => typeof item.flags[key] !== 'boolean') ||
            !(item.draft === null || plain(item.draft)) || !(item.reviewSchedule === null || plain(item.reviewSchedule)) ||
            !(item.mistakeCount === null || (Number.isSafeInteger(item.mistakeCount) && item.mistakeCount > 0)) ||
            typeof item.provenComplete !== 'boolean') return false;
        if (CONTENT_IDENTITIES[id]?.legacy && !ProgressModel.validOpeningArchive(item, id, questions)) return false;
      }
      for (const [id, assignment] of Object.entries(archive.reviewAssignments)) {
        if (!questions[id] || !plain(assignment) || assignment.sourceQuestionId !== id || !questions[assignment.reviewQuestionId]) return false;
      }
      if (value.contentRecheckIds.some(id => !Object.hasOwn(archive.questions, id))) return false;
      if (!Array.isArray(value.attempts) || value.attempts.some(attempt => {
        const id = attempt?.questionId || attempt?.id;
        if (!Object.hasOwn(versions,id)) return false;
        const identity=value.questionContentVersions[id];
        return identity === CONTENT_IDENTITIES[id]?.legacy
          ? attempt.contentIdentity !== undefined && attempt.contentIdentity !== identity
          : attempt.contentIdentity !== versions[id];
      })) return false;
      return true;
    }
    static validOpeningArchive(item, id, questions) {
      const plain = value => value && typeof value === 'object' && !Array.isArray(value);
      if (item.fromIdentity !== CONTENT_IDENTITIES[id].legacy || !['complete','unknown'].includes(item.initialHistory) ||
          !Array.isArray(item.examHistory) || item.examHistory.some(row => !plain(row) || !Number.isFinite(row.finishedAt) || !Number.isFinite(row.points)) ||
          !plain(item.reviewAssignments) || !(item.examSession === null || plain(item.examSession)) || !(item.lastExamReview === null || plain(item.lastExamReview))) return false;
      if (item.learningEvidence !== null && !ProgressModel.validLearningEffectiveness({schemaVersion:1,initialHistory:item.initialHistory,
          retainedAttemptsSignature:valueSignature(item.attempts),questions:{[id]:item.learningEvidence}}, questions)) return false;
      return true;
    }
    static prepareBackupState(value, questions = {}, examPool = root.ExamPoolDefinition) {
      if (!ProgressModel.validateBackupState(value, questions, examPool)) return null;
      // Run migration before either real storage key is touched. The controller's
      // existing two-key transaction retains rollback ownership.
      let bytes = JSON.stringify(value);
      const isolated = { getItem:() => bytes, setItem:(_key, next) => { bytes = next; return true; } };
      const model = new ProgressModel(questions, isolated, 'backup-migration', examPool);
      return !model.storageWriteBlocked && ProgressModel.validateBackupState(model.state, questions, examPool) ? cloneContent(model.state) : null;
    }
    static legacyExamGrade(state, id, questions) {
      // marker-v5 and the current release have byte-identical canonical questions
      // and grading engine. Earlier content revisions cannot use this oracle.
      const score = state.examSession?.scores?.[id], question = questions[id];
      const engine = root.GradingEngine || (typeof require === 'function' ? require('./engine') : null);
      if (![4,5,CONTENT_REVISION].includes(state.contentRevision) || !score?.answer || !question?.answer || !engine) return null;
      try { return engine.grade(question, score.answer); } catch (_) { return null; }
    }
    static validLegacyExamGrades(state, questions) {
      if (!(state.learningEvidenceIntegrity?.schemaVersion < 6)) return true;
      return Object.entries(state.examSession?.scores || {}).every(([id, score]) => {
        const grade = ProgressModel.legacyExamGrade(state, id, questions);
        return !grade || ['correct','earned','possible','ratio'].every(key => grade[key] === score[key]);
      });
    }
    static validMigrationMetadata(state, questions) {
      const plain = value => value && typeof value === 'object' && !Array.isArray(value);
      if (!plain(state.learningDayHistory) || !Object.hasOwn(state, 'legacyProvenance')) return false;
      const probe = Object.create(ProgressModel.prototype); probe.questions = questions;
      for (const [key, day] of Object.entries(state.learningDayHistory)) {
        if (day?.dayKey !== key || !probe.validLearningContinuityState({activeDayKeys:state.learningContinuityState.activeDayKeys,today:day})) return false;
      }
      const today = state.learningContinuityState.today;
      if (today && valueSignature(state.learningDayHistory[today.dayKey]) !== valueSignature(today)) return false;
      const provenance = state.legacyProvenance;
      if (provenance === null) return true;
      if (!plain(provenance) || provenance.schemaVersion !== 1 || typeof provenance.original !== 'string' ||
          !Number.isSafeInteger(provenance.markerVersion) || provenance.markerVersion < 0 || provenance.markerVersion > 9 ||
          !plain(provenance.pending) || !plain(provenance.approvedDrafts) || !Array.isArray(provenance.unsignedFields) ||
          !Array.isArray(provenance.archivedExams) ||
          (provenance.progressionVersion !== undefined && ![2,3,4].includes(provenance.progressionVersion))) return false;
      for (const field of ['continuityDays','activeDays']) if (!Array.isArray(provenance.pending[field]) ||
          provenance.pending[field].some(key => !Number.isSafeInteger(probe.dayOrdinalFromKey(key)))) return false;
      for (const archive of provenance.archivedExams) if (!plain(archive) || archive.reason !== 'unverifiable-score' ||
          !Number.isFinite(archive.archivedAt) || archive.archivedAt < 0 || !plain(archive.session) ||
          !Array.isArray(archive.session.ids) || archive.session.ids.some(id => !Object.hasOwn(questions,id))) return false;
      for (const field of ['drafts','reviewSchedule','examScores','examHistory','mistakeCounts']) {
        const list = provenance.pending[field];
        if (!Array.isArray(list) || new Set(list).size !== list.length || list.some(id => typeof id !== 'string' ||
            (field !== 'examHistory' && !Object.hasOwn(questions,id)))) return false;
      }
      for (const field of ['answeredIds','correctIds','incorrectIds']) {
        const list = provenance.pending[field];
        // Older marker-v10 previews predate progression provenance.
        if (list !== undefined && (!Array.isArray(list) || new Set(list).size !== list.length ||
            list.some(id => !Object.hasOwn(questions,id)))) return false;
      }
      if (typeof provenance.pending.placement !== 'boolean' || typeof provenance.pending.completed !== 'boolean') return false;
      try {
        const original = JSON.parse(provenance.original);
        if ((original.learningEvidenceIntegrity?.schemaVersion || 0) !== provenance.markerVersion ||
            !ProgressModel.validEffectivenessState(original, questions)) return false;
      } catch (_) { return false; }
      return true;
    }
    static validateBackupState(value, questions = {}, examPool = root.ExamPoolDefinition) {
      const plain = item => item && typeof item === 'object' && !Array.isArray(item);
      const finite = number => typeof number === 'number' && Number.isFinite(number);
      const dangerousKeys = new Set(['__proto__', 'prototype', 'constructor']);
      const safeValue = item => item === null || ['string', 'boolean'].includes(typeof item) || finite(item) ||
        (Array.isArray(item) && item.every(safeValue)) || (plain(item) && Object.keys(item).every(key => !dangerousKeys.has(key) && safeValue(item[key])));
      const knownId = id => typeof id === 'string' && Boolean(questions[id]);
      const idList = item => Array.isArray(item) && item.every(knownId);
      if (!plain(value) || !safeValue(value) || !ProgressModel.validContentMetadata(value, questions)) return false;
      if (!ProgressModel.validEffectivenessState(value, questions)) return false;
      if (!ProgressModel.validLegacyExamGrades(value, questions)) return false;
      const mandatoryV1Core = ['mode', 'currentQuestionId', 'answeredIds', 'correctIds', 'incorrectIds', 'mistakeCounts', 'reviewSchedule', 'reviewAssignments', 'attempts', 'drafts', 'completed', 'placement', 'examAttempt', 'examSession', 'examHistory', 'lastExamReview'];
      if (!mandatoryV1Core.every(key => Object.prototype.hasOwnProperty.call(value, key))) return false;
      if (value.contentRevision !== undefined && !(Number.isSafeInteger(value.contentRevision) && value.contentRevision >= 1 && value.contentRevision <= CONTENT_REVISION)) return false;
      if (value.learningSchemaVersion !== undefined && ![1, 2, LEARNING_SCHEMA_VERSION].includes(value.learningSchemaVersion)) return false;
      if (value.learningSchemaVersion >= 2 && !Object.prototype.hasOwnProperty.call(value, 'learningContinuityState')) return false;
      if (value.learningContinuityState !== undefined) {
        const continuityProbe = Object.create(ProgressModel.prototype); continuityProbe.questions = questions;
        if (!continuityProbe.validLearningContinuityState(value.learningContinuityState)) return false;
      }
      if (value.lastLearningAt !== undefined && !(finite(value.lastLearningAt) && value.lastLearningAt >= 0)) return false;
      if (value.questionStats !== undefined) {
        const validStats = item => plain(item) && ['correctCount','incorrectCount','correctStreak','incorrectStreak'].every(key => nonnegativeSafeInteger(item[key])) &&
          (item.lastResult === null || typeof item.lastResult === 'boolean') && finite(item.lastAnsweredAt) && item.lastAnsweredAt >= 0;
        function nonnegativeSafeInteger(number) { return Number.isSafeInteger(number) && number >= 0; }
        if (!plain(value.questionStats) || Object.entries(value.questionStats).some(([id, item]) => !knownId(id) || !validStats(item))) return false;
      }
      if (value.mode !== undefined && !['story', 'training', 'review', 'exam', 'desk'].includes(value.mode)) return false;
      if (value.currentQuestionId !== undefined && value.currentQuestionId !== null && !knownId(value.currentQuestionId)) return false;
      for (const key of ['answeredIds', 'correctIds', 'incorrectIds']) if (value[key] !== undefined && !idList(value[key])) return false;
      if (value.completed !== undefined && typeof value.completed !== 'boolean') return false;
      if (value.examAttempt !== undefined && !(Number.isSafeInteger(value.examAttempt) && value.examAttempt >= 0)) return false;
      if (value.mistakeCounts !== undefined && (!plain(value.mistakeCounts) || Object.entries(value.mistakeCounts).some(([id, count]) => !knownId(id) || !Number.isSafeInteger(count) || count <= 0))) return false;
      const validDraft = (id, draft) => {
        if (!knownId(id) || !plain(draft)) return false;
        if (questions[id].type === 'journal') {
          const side = rows => Array.isArray(rows) && rows.every(row => plain(row) && typeof row.account === 'string' && (row.amount === null || finite(row.amount)));
          return side(draft.debit) && side(draft.credit);
        }
        return plain(draft.cells) && Object.values(draft.cells).every(cell => typeof cell === 'string' || finite(cell) || cell === null);
      };
      if (value.drafts !== undefined && (!plain(value.drafts) || Object.entries(value.drafts).some(([id, draft]) => !validDraft(id, draft)))) return false;
      if (value.reviewSchedule !== undefined && (!plain(value.reviewSchedule) || Object.entries(value.reviewSchedule).some(([id, item]) => !knownId(id) || !plain(item) || !Number.isSafeInteger(item.stage) || item.stage < 0 || item.stage > 4 || !finite(item.dueAt) || item.dueAt < 0))) return false;
      if (value.reviewAssignments !== undefined && (!plain(value.reviewAssignments) || Object.entries(value.reviewAssignments).some(([id, item]) => !knownId(id) || !plain(item) || item.sourceQuestionId !== id || !knownId(item.reviewQuestionId) || typeof item.conceptId !== 'string' || !Number.isSafeInteger(item.stage) || item.stage < 0 || item.stage > 4 || !finite(item.dueAt) || !finite(item.assignedAt) || !['assigned', 'completed'].includes(item.status)))) return false;
      if (value.attempts !== undefined && (!Array.isArray(value.attempts) || value.attempts.some(item => !plain(item) || !knownId(item.questionId || item.id) || typeof item.correct !== 'boolean' || !finite(item.responseMs) || item.responseMs < 0))) return false;
      if (value.attempts?.some(item => (item.mode !== undefined && !EVIDENCE_MODES.includes(item.mode)) ||
          (item.support !== undefined && !EVIDENCE_SUPPORT.includes(item.support)) ||
          (item.observationNumber !== undefined && !(Number.isSafeInteger(item.observationNumber) && item.observationNumber > 0)))) return false;
      if (value.placement !== undefined && value.placement !== null && (!plain(value.placement) || value.placement.completed !== true || !knownId(value.placement.startQuestionId) || !finite(value.placement.foundation) || !finite(value.placement.closing))) return false;
      if (value.examSession !== undefined && value.examSession !== null) {
        const probe = Object.create(ProgressModel.prototype); probe.questions = questions; probe.examPool = examPool;
        if (!probe.validExamSession(value.examSession)) return false;
      }
      if (value.examHistory !== undefined && (!Array.isArray(value.examHistory) || value.examHistory.some(item => !plain(item) || !finite(item.finishedAt) || !finite(item.points)))) return false;
      if (value.lastExamReview !== undefined && value.lastExamReview !== null && !plain(value.lastExamReview)) return false;
      return true;
    }
    static evidenceTags(question) {
      if (question.type === 'journal') return ['journal-entry'];
      return ['table-cell', ...new Set((question.table?.inputCells || []).map(cell => `cell:${typeof cell === 'string' ? cell : cell.key}`))];
    }
    static validEffectivenessState(state, questions = {}) {
      const evidence = state.learningEffectiveness, integrity = state.learningEvidenceIntegrity;
      if (state.learningSchemaVersion >= 3 && integrity === undefined) return false;
      if (integrity !== undefined && (state.learningSchemaVersion !== LEARNING_SCHEMA_VERSION || !integrity || typeof integrity !== 'object' || Array.isArray(integrity) ||
          Object.keys(integrity).length !== 2 || ![1,2,3,4,5,6,7,8,9,10,11].includes(integrity.schemaVersion) || evidence === undefined ||
          integrity.signature !== (integrity.schemaVersion === 1 ? valueSignature(evidence) : evidenceStateSignature(state,integrity.schemaVersion)))) return false;
      if (evidence === undefined) {
        // Old releases never issued observation receipts. Their presence proves
        // that missing aggregates are corruption, rather than an old schema.
        return !Array.isArray(state.attempts) || !state.attempts.some(row => row && Object.hasOwn(row, 'observationNumber'));
      }
      if (![4,5,CONTENT_REVISION].includes(state.contentRevision) || ![2,LEARNING_SCHEMA_VERSION].includes(state.learningSchemaVersion) ||
          !ProgressModel.validLearningEffectiveness(evidence, questions) || !Number.isFinite(state.lastLearningAt) || state.lastLearningAt < 0 ||
          !state.questionStats || typeof state.questionStats !== 'object' || Array.isArray(state.questionStats) || !Array.isArray(state.attempts) ||
          state.attempts.length > 200 || evidence.retainedAttemptsSignature !== valueSignature(state.attempts)) return false;
      const complete = evidence.initialHistory === 'complete';
      const probe = Object.create(ProgressModel.prototype);
      probe.questions = questions;
      if (!probe.validLearningContinuityState(state.learningContinuityState)) return false;
      if (integrity?.schemaVersion >= 10 && !ProgressModel.validMigrationMetadata(state, questions)) return false;
      for (const [id, stats] of Object.entries(state.questionStats)) {
        if (!Object.hasOwn(questions, id) || !probe.validQuestionStats(stats)) return false;
        const item = evidence.questions[id];
        if (complete && (stats.correctCount !== (item?.correctCount || 0) || stats.incorrectCount !== (item?.incorrectCount || 0))) return false;
      }
      for (const [id, item] of Object.entries(evidence.questions)) {
        const stats = state.questionStats[id];
        if (item.observedAttempts && (!stats || stats.correctCount < item.correctCount || stats.incorrectCount < item.incorrectCount)) return false;
      }
      const retained = {};
      for (const row of state.attempts) {
        const id = row?.questionId || row?.id, item = evidence.questions[id];
        if (!Object.hasOwn(questions, id) || (complete && !item?.observedAttempts)) return false;
        if (row.observationNumber === undefined) { if (complete) return false; continue; }
        if (!Number.isSafeInteger(row.observationNumber) || row.observationNumber < 1 || !item || row.observationNumber > item.observedAttempts ||
            row.questionId !== id || row.id !== id || typeof row.correct !== 'boolean' || !EVIDENCE_MODES.includes(row.mode) ||
            !EVIDENCE_SUPPORT.includes(row.support) || !Number.isFinite(row.timestamp) || row.at !== row.timestamp ||
            row.timestamp < 0 || row.timestamp > item.lastObservedAt || !Number.isFinite(row.responseMs) || row.responseMs < 0) return false;
        if (row.reviewSourceId !== null && (!Object.hasOwn(questions,row.reviewSourceId) || row.mode !== 'review' ||
            questions[row.reviewSourceId].category !== questions[id].category || !Number.isSafeInteger(row.reviewStage) || row.reviewStage < 0 || row.reviewStage > 4)) return false;
        if (row.examSession !== null && (row.mode !== 'exam' || !validExamIdentity(row.examSession))) return false;
        const rows = retained[id] ||= [];
        if (rows.length && row.observationNumber !== rows.at(-1).observationNumber + 1) return false;
        rows.push(row);
        if (row.observationNumber === 1 && (row.timestamp !== item.firstObservedAt || (complete &&
            ['correct','mode','support'].some(key => row[key] !== item.firstAttempt[key])))) return false;
      }
      for (const [id, rows] of Object.entries(retained)) {
        const item = evidence.questions[id], last = rows.at(-1), stats = state.questionStats[id];
        if (last.observationNumber !== item.observedAttempts || last.correct !== stats.lastResult || (complete ? item.lastObservedAt !== stats.lastAnsweredAt : item.lastObservedAt > stats.lastAnsweredAt)) return false;
        for (const mode of EVIDENCE_MODES) {
          const selected = rows.filter(row => row.mode === mode), successes = selected.filter(row => row.correct).length, aggregate = item.modes[mode];
          if (selected.length > aggregate.attempts || successes > aggregate.successes || selected.length-successes > aggregate.attempts-aggregate.successes ||
              (rows[0].observationNumber === 1 && (selected.length !== aggregate.attempts || successes !== aggregate.successes))) return false;
        }
      }
      for (const [id,item] of Object.entries(evidence.questions)) {
        const exam = item.lastExamObservation;
        const row = exam && retained[id]?.find(row => row.observationNumber === exam.observationNumber);
        if (row && (row.mode !== 'exam' || row.correct !== exam.correct || row.timestamp !== exam.at || !sameExamIdentity(row.examSession,exam.session))) return false;
        for (const [sourceId,bindings] of Object.entries(item.reviewBindings)) for (const [kind,binding] of Object.entries(bindings)) {
          const receipt = evidence.questions[sourceId]?.delayedReview.receipts[kind];
          if (!receipt || receipt.questionId !== id || ['observationNumber','at','stage'].some(key => binding[key] !== receipt[key])) return false;
        }
      }
      const usedReviewReceipts = new Set();
      for (const [sourceId,item] of Object.entries(evidence.questions)) for (const [kind, receipt] of Object.entries(item.delayedReview.receipts)) {
        if (!receipt) continue;
        const identity = JSON.stringify([receipt.questionId,receipt.observationNumber]);
        if (receipt.sourceId !== sourceId || usedReviewReceipts.has(identity)) return false;
        usedReviewReceipts.add(identity);
        const target = evidence.questions[receipt.questionId], correct = kind === 'correct';
        if (!target || receipt.observationNumber > target.observedAttempts || receipt.at > target.lastObservedAt || questions[sourceId].category !== questions[receipt.questionId].category ||
            (correct ? target.modes.review.successes < 1 : target.modes.review.attempts <= target.modes.review.successes)) return false;
        const binding = target.reviewBindings[sourceId]?.[kind];
        if (!binding || ['observationNumber','at','stage'].some(key => binding[key] !== receipt[key])) return false;
        const row = retained[receipt.questionId]?.find(row => row.observationNumber === receipt.observationNumber);
        if (row && (row.correct !== correct || row.timestamp !== receipt.at || row.mode !== 'review' || row.reviewSourceId !== sourceId || row.reviewStage !== receipt.stage)) return false;
      }
      if (state.examSession?.scores) for (const [id,score] of Object.entries(state.examSession.scores)) {
        // Uninstrumented answers in an unfinished legacy exam remain unknown.
        // All new sessions and scored observations require a session-bound receipt.
        if (!complete && state.examSession.evidenceVersion !== 1 && score?.observationNumber === undefined &&
            !(evidence.questions[id]?.modes.exam.attempts > 0)) continue;
        const exam = evidence.questions[id]?.lastExamObservation;
        if (!exam || exam.observationNumber !== score?.observationNumber || exam.correct !== score.correct ||
            !sameExamIdentity(exam.session,examIdentity(state))) return false;
      }
      if (integrity && integrity.schemaVersion < 8 && complete) {
        // Old markers did not bind finalized mistake totals. Reject contradictions
        // to their protected observations, without inventing a completion count.
        // A failed review is counted on its source, not necessarily its answer ID.
        const mistakes = state.mistakeCounts;
        if (!mistakes || typeof mistakes !== 'object' || Array.isArray(mistakes)) return false;
        for (const [id,count] of Object.entries(mistakes)) {
          const item = evidence.questions[id], wrong = item?.incorrectCount || 0;
          const reviewFailures = item ? item.delayedReview.attempts - item.delayedReview.successes : 0;
          if (!Object.hasOwn(questions,id) || !Number.isSafeInteger(count) || count <= 0 ||
              (count > wrong && count - wrong > reviewFailures)) return false;
        }
        for (const [id,item] of Object.entries(evidence.questions)) {
          // Ordinary answers and due-review completions were saved atomically by
          // the legacy controller. An unfinished exam observation is not completion.
          const ordinaryWrong = ['story','training','desk'].reduce((sum,mode) => sum + (item.modes[mode].attempts - item.modes[mode].successes),0);
          const reviewFailures = item.delayedReview.attempts - item.delayedReview.successes, count = mistakes[id] || 0;
          // Legacy history has no session identity. A timeout's clamped duration
          // cannot prove which retry completed, especially across clock rollback.
          // Its signed answered count can still prove one finalized wrong answer:
          // every observed candidate must have answered, and this ID never had an
          // exam success. Use only a lower bound, never invent a cumulative total.
          const finalizedWrong = integrity.schemaVersion >= 6 && item.modes.exam.successes === 0 && state.examHistory?.some(history => {
            const ids = typeof history.setSignature === 'string' ? history.setSignature.split('|') : [];
            if (ids.length !== 15 || new Set(ids).size !== 15 || ids.some(key => !Object.hasOwn(questions,key)) ||
                !ids.includes(id) || !Number.isInteger(history.unansweredCount) || history.unansweredCount < 0 || history.unansweredCount > 15) return false;
            const candidates = ids.filter(key => evidence.questions[key]?.modes.exam.attempts > 0), answered = 15 - history.unansweredCount;
            return answered > 0 && candidates.includes(id) && answered === candidates.length;
          }) ? 1 : 0;
          if (count < ordinaryWrong + reviewFailures + finalizedWrong) return false;
        }
        if (Array.isArray(state.incorrectIds) && state.incorrectIds.some(id => !(mistakes[id] > 0))) return false;
      }
      return ['answeredIds','correctIds','incorrectIds'].every(key => Array.isArray(state[key]) && (!complete || state[key].every(id => {
        const item = evidence.questions[id];
        if (!item) return false;
        if (key === 'correctIds') return item.correctCount > 0 || item.delayedReview.receipts.correct !== null;
        if (key === 'incorrectIds') return item.incorrectCount > 0 || item.delayedReview.receipts.incorrect !== null;
        return item.observedAttempts > 0 || item.delayedReview.attempts > 0;
      })));
    }

    static validLearningEffectiveness(value, questions = {}) {
      const plain = item => item && typeof item === 'object' && !Array.isArray(item);
      const exact = (item, keys) => plain(item) && Object.keys(item).length === keys.length && keys.every(key => Object.hasOwn(item, key));
      const count = n => Number.isSafeInteger(n) && n >= 0;
      const time = n => typeof n === 'number' && Number.isFinite(n) && n >= 0;
      const pair = item => exact(item, ['attempts','successes']) && count(item.attempts) && count(item.successes) && item.successes <= item.attempts;
      if (!exact(value, ['schemaVersion','initialHistory','retainedAttemptsSignature','questions']) || value.schemaVersion !== 1 ||
          !['complete','unknown'].includes(value.initialHistory) || !/^[0-9a-f]{8}$/.test(value.retainedAttemptsSignature) || !plain(value.questions)) return false;
      for (const [id, item] of Object.entries(value.questions)) {
        if (!Object.hasOwn(questions, id) || !exact(item, Object.keys(emptyEvidence())) ||
            !['observedAttempts','correctCount','incorrectCount'].every(key => count(item[key])) ||
            item.correctCount + item.incorrectCount !== item.observedAttempts ||
            !(item.observedAttempts ? time(item.firstObservedAt) && time(item.lastObservedAt) && item.lastObservedAt >= item.firstObservedAt
              : item.firstObservedAt === null && item.lastObservedAt === null)) return false;
        const first = item.firstAttempt;
        if (value.initialHistory === 'complete' && item.observedAttempts) {
          if (!exact(first, ['correct','at','mode','support']) || typeof first.correct !== 'boolean' || first.at !== item.firstObservedAt ||
              !EVIDENCE_MODES.includes(first.mode) || !EVIDENCE_SUPPORT.includes(first.support)) return false;
        } else if (first !== null) return false;
        if (!exact(item.modes, EVIDENCE_MODES) || !Object.values(item.modes).every(pair) ||
            Object.values(item.modes).reduce((sum, mode) => sum + mode.attempts, 0) !== item.observedAttempts ||
            Object.values(item.modes).reduce((sum, mode) => sum + mode.successes, 0) !== item.correctCount) return false;
        if (first && (item[first.correct ? 'correctCount' : 'incorrectCount'] < 1 || item.modes[first.mode].attempts < 1 ||
            (first.correct ? item.modes[first.mode].successes < 1 : item.modes[first.mode].successes === item.modes[first.mode].attempts))) return false;
        if (!plain(item.reviewBindings)) return false;
        for (const [sourceId,bindings] of Object.entries(item.reviewBindings)) {
          if (!Object.hasOwn(questions,sourceId) || questions[sourceId].category !== questions[id].category || !plain(bindings) ||
              Object.keys(bindings).length < 1 || Object.keys(bindings).length > 2) return false;
          for (const [kind,binding] of Object.entries(bindings)) if (!['correct','incorrect'].includes(kind) ||
              !exact(binding,['observationNumber','at','stage']) || !count(binding.observationNumber) || binding.observationNumber < 1 ||
              binding.observationNumber > item.observedAttempts || !time(binding.at) || binding.at > item.lastObservedAt ||
              !count(binding.stage) || binding.stage > 4 || (kind === 'correct' ? item.modes.review.successes < 1 : item.modes.review.attempts <= item.modes.review.successes)) return false;
        }
        const exam = item.lastExamObservation;
        if (exam !== null && (!exact(exam,['observationNumber','correct','at','session']) || !count(exam.observationNumber) ||
            exam.observationNumber < 1 || exam.observationNumber > item.observedAttempts || typeof exam.correct !== 'boolean' ||
            !time(exam.at) || exam.at > item.lastObservedAt || !validExamIdentity(exam.session) ||
            (exam.correct ? item.modes.exam.successes < 1 : item.modes.exam.attempts <= item.modes.exam.successes))) return false;
        const delayed = item.delayedReview;
        if (!exact(delayed, ['attempts','successes','lastAt','highestConfirmedStage','receipts','stages']) || !count(delayed.attempts) ||
            !count(delayed.successes) || delayed.successes > delayed.attempts ||
            !(delayed.attempts ? time(delayed.lastAt) : delayed.lastAt === null) ||
            !Array.isArray(delayed.stages) || delayed.stages.length !== 5 || !delayed.stages.every(pair) ||
            delayed.stages.reduce((sum, stage) => sum + stage.attempts, 0) !== delayed.attempts ||
            delayed.stages.reduce((sum, stage) => sum + stage.successes, 0) !== delayed.successes) return false;
        if (!exact(delayed.receipts, ['correct','incorrect'])) return false;
        for (const [kind, receipt] of Object.entries(delayed.receipts)) {
          const events = kind === 'correct' ? delayed.successes : delayed.attempts-delayed.successes;
          if (!events) { if (receipt !== null) return false; continue; }
          if (!exact(receipt, ['sourceId','questionId','observationNumber','at','stage']) || receipt.sourceId !== id || !Object.hasOwn(questions, receipt.questionId) ||
              !Number.isSafeInteger(receipt.observationNumber) || receipt.observationNumber < 1 || !time(receipt.at) || receipt.at > delayed.lastAt ||
              !Number.isSafeInteger(receipt.stage) || receipt.stage < 0 || receipt.stage > 4 ||
              (kind === 'correct' ? delayed.stages[receipt.stage].successes < 1 : delayed.stages[receipt.stage].attempts <= delayed.stages[receipt.stage].successes)) return false;
        }
        const confirmed = delayed.stages.flatMap((stage, index) => stage.successes ? [Math.min(index + 1, 4)] : []);
        if (delayed.highestConfirmedStage !== (confirmed.length ? Math.max(...confirmed) : null)) return false;
        const tags = ProgressModel.evidenceTags(questions[id]);
        if (!plain(item.misconceptionStats)) return false;
        for (const [tag, error] of Object.entries(item.misconceptionStats)) {
          if (!tags.includes(tag) || !exact(error, ['occurrences','recoveredCount','assistedRecoveredCount','lastOccurredAt','lastRecoveredAt','lastAssistedRecoveredAt','pending','assisted']) ||
              !count(error.occurrences) || error.occurrences < 1 || error.occurrences > item.incorrectCount ||
              !count(error.recoveredCount) || error.recoveredCount > error.occurrences || error.recoveredCount > item.correctCount ||
              !count(error.assistedRecoveredCount) || error.assistedRecoveredCount > error.occurrences ||
              !time(error.lastOccurredAt) || !(error.recoveredCount ? time(error.lastRecoveredAt) : error.lastRecoveredAt === null) ||
              !(error.assistedRecoveredCount ? time(error.lastAssistedRecoveredAt) : error.lastAssistedRecoveredAt === null) ||
              typeof error.pending !== 'boolean' || typeof error.assisted !== 'boolean' ||
              (error.pending && error.recoveredCount === error.occurrences) || (error.assisted && !error.assistedRecoveredCount)) return false;
        }
        if (Object.values(item.misconceptionStats).reduce((sum, error) => sum + error.occurrences, 0) !== item.incorrectCount) return false;
      }
      return true;
    }
    constructor(questions, storage, key = 'boki-rpg-progress-v2', examPool = root.ExamPoolDefinition) {
      this.questions = questions && typeof questions === 'object' ? questions : {}; this.storage = storage; this.key = key;
      // Authored assessment membership comes from trusted catalog configuration, never a save.
      this.examPool = Array.isArray(examPool) ? [...examPool] : null;
      this.state = { contentRevision:CONTENT_REVISION, questionContentVersions:ProgressModel.currentContentVersions(this.questions), contentMigrationArchive:emptyContentArchive(), contentRecheckIds:[], learningSchemaVersion:LEARNING_SCHEMA_VERSION, lastLearningAt:0, learningContinuityState:{ activeDayKeys:[], today:null }, questionStats:{}, mode: 'story', currentQuestionId: null, answeredIds: [], correctIds: [], incorrectIds: [], mistakeCounts: {}, reviewSchedule: {}, reviewAssignments: {}, attempts: [], drafts: {}, completed: false, placement: null, examAttempt: 0, examSession: null, examHistory: [], lastExamReview: null };
      this.state.learningEffectiveness = emptyEffectiveness();
      this.state.learningDayHistory = {};
      this.state.legacyProvenance = null;
      this.refreshEvidenceIntegrity();
      this.load();
    }
    load() {
      try {
        const read = typeof this.storage?.readItem === 'function' ? this.storage.readItem(this.key)
          : { ok:typeof this.storage?.getItem === 'function', value:this.storage?.getItem?.(this.key) };
        if (!read?.ok) { this.storageWriteBlocked = true; return; }
        if (read.value === null) return;
        const saved = JSON.parse(read.value);
        if (!saved || typeof saved !== 'object' || Array.isArray(saved)) { this.storageWriteBlocked = true; return; }
        if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
          // Never overwrite a future or malformed versioned state with defaults.
          if ((Number.isSafeInteger(saved.contentRevision) && saved.contentRevision > CONTENT_REVISION) ||
              !ProgressModel.validContentMetadata(saved, this.questions) ||
              !ProgressModel.validEffectivenessState(saved, this.questions) ||
              !ProgressModel.validLegacyExamGrades(saved, this.questions) ||
              (saved.examSession != null && !this.validExamSession(saved.examSession))) {
            this.storageWriteBlocked = true; return;
          }
          const savedContentRevision = Number.isSafeInteger(saved.contentRevision) ? saved.contentRevision : 1;
          const needsRevision2Migration = savedContentRevision < 2;
          const needsRevision3Migration = savedContentRevision < 3;
          const needsOpeningMigration = Object.entries(ProgressModel.currentContentVersions(this.questions)).some(([id,identity]) =>
            CONTENT_IDENTITIES[id]?.legacy && saved.questionContentVersions?.[id] !== identity);
          const needsContentMigration = savedContentRevision < CONTENT_REVISION || needsOpeningMigration;
          const savedLearningSchemaVersion = Number.isSafeInteger(saved.learningSchemaVersion) ? saved.learningSchemaVersion : 0;
          if (savedLearningSchemaVersion > LEARNING_SCHEMA_VERSION) { this.storageWriteBlocked = true; return; }
          const hasLearningSchemaV1 = savedLearningSchemaVersion >= 1;
          const needsLearningMigration = savedLearningSchemaVersion < LEARNING_SCHEMA_VERSION;
          const migratedDrafts = saved.drafts && typeof saved.drafts === 'object' && !Array.isArray(saved.drafts)
            ? Object.fromEntries(Object.entries(saved.drafts).filter(([id, draft]) => this.questions[id] && draft && typeof draft === 'object' &&
              !(needsRevision2Migration && FIXED_ASSET_SCHEMA_REVISION_2_IDS.has(id)) &&
              !(needsRevision3Migration && id === 'L030'))) : {};
          const incompatibleExam = needsRevision2Migration && saved.examSession?.ids?.some(id => id === 'L033' || id === 'L040');
          const migratedAttempts = Array.isArray(saved.attempts) ? saved.attempts.filter(item => item && this.questions[item.questionId || item.id] && typeof item.correct === 'boolean' && Number.isFinite(item.responseMs) && item.responseMs >= 0).slice(-200) : [];
          const migratedQuestionStats = hasLearningSchemaV1 && saved.questionStats && typeof saved.questionStats === 'object' && !Array.isArray(saved.questionStats)
            ? Object.fromEntries(Object.entries(saved.questionStats).filter(([id, item]) => this.questions[id] && this.validQuestionStats(item)))
            : this.aggregateQuestionStats(migratedAttempts);
          const migratedLastLearningAt = hasLearningSchemaV1 && Number.isFinite(saved.lastLearningAt) && saved.lastLearningAt >= 0
            ? saved.lastLearningAt
            : migratedAttempts.reduce((latest, item) => Math.max(latest, Number(item.timestamp || item.at || 0) || 0), 0);
          const migratedLearningContinuityState = savedLearningSchemaVersion >= 2 && this.validLearningContinuityState(saved.learningContinuityState)
            ? this.normalizeLearningContinuityState(saved.learningContinuityState)
            : this.continuityStateFromAttempts(migratedAttempts);
          this.state = Object.assign(this.state, saved, {
          contentRevision:CONTENT_REVISION,
          learningSchemaVersion:LEARNING_SCHEMA_VERSION,
          lastLearningAt:migratedLastLearningAt,
          learningContinuityState:migratedLearningContinuityState,
          questionStats:migratedQuestionStats,
          mode: ['story', 'training', 'review', 'exam', 'desk'].includes(saved.mode) ? saved.mode : 'story',
          currentQuestionId: this.questions[saved.currentQuestionId] ? saved.currentQuestionId : null,
          answeredIds: Array.isArray(saved.answeredIds) ? saved.answeredIds.filter(id => this.questions[id]) : [],
          // Legacy saves did not have correctIds. Only validated attempt evidence may be
          // migrated; an old "answered" flag is deliberately not promoted to competence.
          correctIds: Array.isArray(saved.correctIds) ? [...new Set(saved.correctIds.filter(id => this.questions[id]))]
            : [...new Set((Array.isArray(saved.attempts) ? saved.attempts : []).filter(item => item?.correct === true && this.questions[item.questionId || item.id]).map(item => item.questionId || item.id))],
          incorrectIds: Array.isArray(saved.incorrectIds) ? saved.incorrectIds.filter(id => this.questions[id]) : [],
          drafts: migratedDrafts,
          mistakeCounts: saved.mistakeCounts && typeof saved.mistakeCounts === 'object'
            ? Object.fromEntries(Object.entries(saved.mistakeCounts).filter(([id, count]) => this.questions[id] && Number.isSafeInteger(count) && count > 0)) : {},
          reviewSchedule: saved.reviewSchedule && typeof saved.reviewSchedule === 'object' && !Array.isArray(saved.reviewSchedule)
            ? Object.fromEntries(Object.entries(saved.reviewSchedule).filter(([id, item]) => this.questions[id] && item &&
              Number.isSafeInteger(item.stage) && item.stage >= 0 && item.stage <= 4 && Number.isFinite(item.dueAt) && item.dueAt >= 0)) : {},
          reviewAssignments: saved.reviewAssignments && typeof saved.reviewAssignments === 'object' && !Array.isArray(saved.reviewAssignments)
            ? Object.fromEntries(Object.entries(saved.reviewAssignments).filter(([sourceId, item]) => this.questions[sourceId] && item &&
              item.sourceQuestionId === sourceId && this.questions[item.reviewQuestionId] && typeof item.conceptId === 'string' &&
              Number.isSafeInteger(item.stage) && item.stage >= 0 && item.stage <= 4 && Number.isFinite(item.dueAt) &&
              Number.isFinite(item.assignedAt) && ['assigned', 'completed'].includes(item.status))) : {},
          attempts:migratedAttempts,
          completed: saved.completed === true,
          placement: saved.placement && saved.placement.completed === true && this.questions[saved.placement.startQuestionId] &&
            Number.isFinite(saved.placement.foundation) && Number.isFinite(saved.placement.closing)
            ? { completed:true, foundation:Math.max(0, Math.min(100, saved.placement.foundation)), closing:Math.max(0, Math.min(100, saved.placement.closing)), startQuestionId:saved.placement.startQuestionId, completedAt:Number(saved.placement.completedAt) || 0, ...(saved.placement.migrated === true ? {migrated:true} : {}) } : null,
          examAttempt: Number.isSafeInteger(saved.examAttempt) && saved.examAttempt >= 0 ? saved.examAttempt : 0,
          examSession: !incompatibleExam && this.validExamSession(saved.examSession) ? saved.examSession : null,
          examHistory: Array.isArray(saved.examHistory) ? saved.examHistory.filter(item => item && Number.isFinite(item.finishedAt) && Number.isFinite(item.points)).slice(-10) : [],
          lastExamReview: saved.lastExamReview && typeof saved.lastExamReview === 'object' ? saved.lastExamReview : null
          });
          if (incompatibleExam && this.state.mode === 'exam') this.state.mode = 'story';
          if (savedContentRevision < 4) this.migrateContentIdentity(savedContentRevision, hasLearningSchemaV1 ? saved.questionStats : null);
          // A missing row/flag in an old save cannot prove a never-attempted question.
          const needsEvidenceMigration = saved.learningEffectiveness === undefined;
          if (needsEvidenceMigration) this.state.learningEffectiveness = emptyEffectiveness('unknown', this.state.attempts);
          const needsIntegrityMigration = !(saved.learningEvidenceIntegrity?.schemaVersion >= 10);
          const needsIdentitySeal = saved.learningEvidenceIntegrity?.schemaVersion !== 11;
          if (needsIntegrityMigration) this.migrateUnsignedFields(saved, read.value);
          const needsProgressionMigration = !needsIntegrityMigration && this.state.legacyProvenance?.markerVersion < 2 &&
            this.state.legacyProvenance.progressionVersion !== 4;
          if (needsProgressionMigration) this.migrateUnsignedProgression(JSON.parse(this.state.legacyProvenance.original),true);
          if (needsOpeningMigration) this.migrateOpeningBalances(saved);
          this.state.learningEffectiveness.retainedAttemptsSignature = valueSignature(this.state.attempts);
          if (needsContentMigration || needsEvidenceMigration || needsIntegrityMigration || needsProgressionMigration || needsIdentitySeal) this.refreshEvidenceIntegrity();
          if (!ProgressModel.validateBackupState(this.state,this.questions,this.examPool)) { this.storageWriteBlocked = true; return; }
          if (needsContentMigration || needsLearningMigration || needsEvidenceMigration || needsIntegrityMigration || needsProgressionMigration || needsIdentitySeal) this.save();
        }
      } catch (_) { this.storageWriteBlocked = true; }
    }
    migrateUnsignedFields(saved, original) {
      const version = saved.learningEvidenceIntegrity?.schemaVersion || 0;
      this.state.learningDayHistory = this.state.learningContinuityState.today
        ? {[this.state.learningContinuityState.today.dayKey]:cloneContent(this.state.learningContinuityState.today)} : {};
      const minimum = {answeredIds:2,correctIds:2,incorrectIds:2,learningContinuityState:3,reviewSchedule:4,reviewAssignments:4,examHistory:5,
        examSession:6,examAttempt:6,contentMigrationArchive:6,contentRecheckIds:6,placement:7,mistakeCounts:8,drafts:9,completed:10,lastExamReview:10};
      const unsignedFields = Object.keys(minimum).filter(field => version < minimum[field]);
      // A complete retained signed log can corroborate the old continuity value.
      // Otherwise keep its numbers visible, explicitly unverified. Older formats
      // retained only one day's counters; do not invent totals for the other days.
      const evidence = saved.learningEffectiveness;
      const completeLog = evidence?.initialHistory === 'complete' && Object.values(evidence.questions).reduce((n,item) => n + item.observedAttempts,0) === saved.attempts.length;
      const continuityCorroborated = completeLog && valueSignature(this.continuityStateFromAttempts(saved.attempts)) === valueSignature(saved.learningContinuityState);
      const unsignedDays = version < 3 && !continuityCorroborated ? [...this.state.learningContinuityState.activeDayKeys] : [];
      const pending = {drafts:version < 9 ? Object.keys(this.state.drafts) : [],
        continuityDays:this.state.learningContinuityState.activeDayKeys.filter(key => unsignedDays.includes(key) || key !== this.state.learningContinuityState.today?.dayKey),
        activeDays:unsignedDays,
        reviewSchedule:version < 4 ? Object.keys(this.state.reviewSchedule) : [],
        examHistory:version < 5 ? this.state.examHistory.map(valueSignature) : [],
        examScores:version < 6 ? Object.keys(this.state.examSession?.scores || {}).filter(id => !ProgressModel.legacyExamGrade(saved,id,this.questions)) : [],
        mistakeCounts:version < 8 ? Object.keys(this.state.mistakeCounts).filter(id => {
          const evidence = saved.learningEffectiveness, item = evidence?.questions[id];
          if (evidence?.initialHistory !== 'complete' || !item || item.modes.exam.attempts) return true;
          const ordinary = ['story','training','desk'].reduce((sum,mode) => sum + item.modes[mode].attempts - item.modes[mode].successes,0);
          return this.state.mistakeCounts[id] !== ordinary + item.delayedReview.attempts - item.delayedReview.successes;
        }) : [],
        placement:version < 7, completed:true};
      this.state.legacyProvenance = {schemaVersion:1,markerVersion:version,original,unsignedFields,pending,approvedDrafts:{},archivedExams:[]};
      if (version < 2) this.migrateUnsignedProgression(saved);
    }
    migrateUnsignedProgression(original, alreadySealed = false) {
      const provenance = this.state.legacyProvenance;
      const retainVerifiedProgression = [2,3].includes(provenance.progressionVersion);
      const previewWithoutProgression = alreadySealed && provenance.pending.correctIds === undefined;
      const proven = {answeredIds:new Set(),correctIds:new Set(),incorrectIds:new Set()};
      for (const [id,item] of Object.entries(this.state.learningEffectiveness.questions)) {
        // Ordinary observations and source-bound delayed reviews were committed
        // atomically with record(). Review targets and unfinished exams were not.
        const ordinary = ['story','training','desk'].map(mode => item.modes[mode]);
        if (ordinary.some(mode => mode.attempts > 0) || item.delayedReview.attempts > 0) proven.answeredIds.add(id);
        if (ordinary.some(mode => mode.successes > 0) || item.delayedReview.successes > 0) proven.correctIds.add(id);
        if (alreadySealed) {
          const observations = new Map();
          const retain = exam => {
            if (!exam?.session) return;
            const key = JSON.stringify(exam.session), previous = observations.get(key);
            if (!previous || exam.observationNumber > previous.observationNumber) observations.set(key,exam);
          };
          for (const row of this.state.attempts) if (row.questionId === id && row.mode === 'exam')
            retain({session:row.examSession,observationNumber:row.observationNumber,correct:row.correct});
          retain(item.lastExamObservation);
          // Earlier previews resealed an unsigned legacy lastExamReview. Only a
          // different, subsequently saved review can corroborate finalization.
          // History alone omits startedAt, so duration cannot identify a retry.
          const review = this.state.lastExamReview;
          if (review && valueSignature(review) !== valueSignature(original.lastExamReview ?? null) &&
              Array.isArray(review.items) && review.items.length === 15 && new Set(review.items.map(row => row.id)).size === 15) {
            const result = review.items.find(row => row.id === id);
            for (const exam of observations.values()) if (exam.correct && result?.correct === true &&
                exam.session.attempt < this.state.examAttempt && review.startedAt === exam.session.startedAt &&
                this.verifiedExamHistory().some(history => history === this.state.examHistory.at(-1) && history.setSignature === review.items.map(row => row.id).sort().join('|') &&
                  ['finishedAt','durationMs','points','unansweredCount'].every(key => history[key] === review[key]) &&
                  history.finishedAt >= exam.session.startedAt &&
                  history.durationMs === Math.max(0,Math.min(history.finishedAt,exam.session.endAt)-exam.session.startedAt))) {
              proven.answeredIds.add(id); proven.correctIds.add(id);
            }
          }
        }
      }
      if (alreadySealed && [4,5,CONTENT_REVISION].includes(original.contentRevision) &&
          valueSignature(original.questionContentVersions ?? null) === valueSignature(ProgressModel.currentContentVersions(this.questions,original.contentRevision))) {
        // Legacy schedules start quarantined. Only a current record() creates
        // or confirms one; the preview's flawed flag migration never does.
        // A promoted stage requires a correct completion. At stage zero, a
        // wrong completion always leaves incorrectIds set. This proof survives
        // the bounded exam display history without inventing missing receipts.
        for (const [id,schedule] of Object.entries(this.state.reviewSchedule)) {
          if (this.isUnverified('reviewSchedule',id)) continue;
          proven.answeredIds.add(id);
          if (schedule.stage > 0 || !this.state.incorrectIds.includes(id)) proven.correctIds.add(id);
        }
        // The preview's catalog and grading engine are unchanged. Signed topic
        // totals can corroborate older completions after lastExamReview advances.
        // Each question contributes nonnegative rounded loss. Only a topic loss
        // below this question's minimum possible incorrect loss proves correct.
        // Unknown ordering uses the minimum over all issued point weights.
        for (const history of this.verifiedExamHistory()) {
          const ids = typeof history.setSignature === 'string' ? history.setSignature.split('|') : [];
          if (ids.length !== 15 || new Set(ids).size !== 15 || ids.some(id => !Object.hasOwn(this.questions,id))) continue;
          for (const id of ids) {
            const question = this.questions[id], topic = history.topicScores?.[question.category];
            const count = ids.filter(key => this.questions[key].category === question.category).length;
            if (!topic || !Number.isSafeInteger(topic.earned) || !Number.isSafeInteger(topic.possible) || topic.earned < 0 ||
                topic.earned > topic.possible || topic.possible < 5 * count || topic.possible > 9 * count) continue;
            const cells = question.answer?.cells;
            const units = question.type === 'journal' ? 1 : ['ledger','trial_balance','correction','worksheet','financial_statement','comprehensive'].includes(question.type) &&
              cells && typeof cells === 'object' && !Array.isArray(cells) ? Object.keys(cells).length : 0;
            if (!Number.isSafeInteger(units) || units < 1) continue;
            const minimumLoss = Math.min(...[5,6,9].map(weight => weight - Math.round(((units - 1) / units) * weight)));
            if (minimumLoss > 0 && topic.possible - topic.earned < minimumLoss) {
              proven.answeredIds.add(id); proven.correctIds.add(id);
            }
          }
        }
      }
      for (const field of Object.keys(proven)) {
        if (!provenance.unsignedFields.includes(field)) provenance.unsignedFields.push(field);
        // Versions 2/3 were issued only after the unsafe preview additions were
        // quarantined. Its subsequent current completions remain authoritative.
        if (retainVerifiedProgression && Array.isArray(provenance.pending[field]))
          for (const id of this.state[field]) if (!provenance.pending[field].includes(id)) proven[field].add(id);
        // The first preview did not synthesize flags from exam history. Later
        // progression previews did, so their additions need independent proof.
        // Preserve every candidate, including additions that remain unverified.
        if (previewWithoutProgression && [4,5,CONTENT_REVISION].includes(original.contentRevision) && Array.isArray(original[field]))
          for (const id of this.state[field]) if (!original[field].includes(id)) proven[field].add(id);
        if (field !== 'incorrectIds') this.state[field] = [...new Set([...this.state[field],...proven[field]])];
        // incorrectIds is mutable recovery state, not a cumulative wrong count.
        // Preserve the candidate; only a current answer can settle it.
        provenance.pending[field] = this.state[field].filter(id => !proven[field].has(id));
      }
      provenance.progressionVersion = 4;
    }
    isUnverified(field, id) {
      const pending = this.state.legacyProvenance?.pending[field];
      return Array.isArray(pending) ? pending.includes(id) : pending === true;
    }
    verifiedCorrectIds() { return this.state.correctIds.filter(id => !this.isUnverified('correctIds',id)); }
    approveDraft(id, answer, now = Date.now()) {
      if (!this.isUnverified('drafts',id) || !answer || typeof answer !== 'object' || !Number.isFinite(now) || now < 0) return false;
      const before = cloneContent(this.state), provenance = this.state.legacyProvenance;
      provenance.pending.drafts = provenance.pending.drafts.filter(value => value !== id);
      provenance.approvedDrafts[id] = {answer:cloneContent(answer),approvedAt:now};
      this.state.drafts[id] = cloneContent(answer); this.refreshEvidenceIntegrity();
      if (!ProgressModel.validateBackupState(this.state,this.questions,this.examPool) || !this.save()) { this.state = before; return false; }
      return true;
    }
    isOldContentExam(item) { return Object.values(this.state.contentMigrationArchive.questions).some(row => row.examHistory?.some(old => valueSignature(old) === valueSignature(item))); }
    verifiedExamHistory() { return this.state.examHistory.filter(item => !this.isUnverified('examHistory',valueSignature(item)) && !this.isOldContentExam(item)); }
    examHistoryForDisplay() { return this.state.examHistory.map(item => ({...item,unverified:this.isUnverified('examHistory',valueSignature(item)) || this.isOldContentExam(item)})); }
    migrateContentIdentity(fromRevision, savedQuestionStats) {
      const state = this.state, versions = ProgressModel.currentContentVersions(this.questions,4);
      const archive = emptyContentArchive(), complete = new Set();
      const statsKeys = ['correctCount','incorrectCount','correctStreak','incorrectStreak','lastResult','lastAnsweredAt'];
      const changed = new Set(Object.keys(versions));
      for (const id of changed) {
        const original = state.attempts.filter(item => (item.questionId || item.id) === id);
        const current = original.filter(item => (item.contentIdentity === undefined || item.contentIdentity === versions[id]) &&
          item.category === this.questions[id].category && item.concept === this.questions[id].category &&
          Number.isFinite(item.timestamp ?? item.at) && (item.timestamp ?? item.at) >= 0);
        const derived = this.aggregateQuestionStats(current)[id];
        // Only an original lifetime aggregate can corroborate a complete log.
        // Reaggregating that same rolling log would be circular provenance.
        const oldStats = this.validQuestionStats(savedQuestionStats?.[id]) ? savedQuestionStats[id] : null;
        const provenComplete = Boolean(derived && current.length === original.length && oldStats &&
          statsKeys.every(key => oldStats[key] === derived[key]));
        if (provenComplete) complete.add(id);
        const flags = { answered:state.answeredIds.includes(id), correct:state.correctIds.includes(id), incorrect:state.incorrectIds.includes(id) };
        const hasEvidence = oldStats || original.length || Object.values(flags).some(Boolean) ||
          state.drafts[id] || state.reviewSchedule[id] || state.mistakeCounts[id];
        if (hasEvidence) {
          archive.questions[id] = cloneContent({ toIdentity:versions[id], fromRevision, questionStats:oldStats,
            attempts:original, flags, draft:state.drafts[id] || null, reviewSchedule:state.reviewSchedule[id] || null,
            mistakeCount:state.mistakeCounts[id] || null, provenComplete });
        }
        // A shared journal shape does not prove which content an unversioned draft
        // belongs to. L031 has disjoint old/new input keys, so schema is sufficient.
        const draft = state.drafts[id];
        const inputKeys = new Set((this.questions[id].table?.inputCells || []).map(cell => typeof cell === 'string' ? cell : cell.key));
        const compatibleDraft = id === 'L031' && draft?.cells && Object.keys(draft.cells).length > 0 &&
          Object.keys(draft.cells).every(key => inputKeys.has(key));
        if (!compatibleDraft) delete state.drafts[id];
        if (!provenComplete) {
          if (derived) state.questionStats[id] = derived; else delete state.questionStats[id];
          for (const key of ['answeredIds','correctIds','incorrectIds']) state[key] = state[key].filter(value => value !== id);
          if (current.length) state.answeredIds.push(id);
          if (current.some(item => item.correct)) state.correctIds.push(id);
          if (current.some(item => !item.correct)) state.incorrectIds.push(id);
          delete state.mistakeCounts[id];
          if (derived?.incorrectCount) state.mistakeCounts[id] = derived.incorrectCount;
          const schedule = state.reviewSchedule[id];
          delete state.reviewSchedule[id];
          if (schedule && derived) state.reviewSchedule[id] = { stage:0, dueAt:derived.lastAnsweredAt + 20 * 60 * 1000 };
        }
        // Lifetime effort is kept in learningContinuityState and in the archive;
        // recent accuracy/adaptation must not consume obsolete-content attempts.
        const confirmed = new Set(current);
        state.attempts = state.attempts.filter(item => (item.questionId || item.id) !== id || confirmed.has(item))
          .map(item => (item.questionId || item.id) === id ? { ...item, contentIdentity:versions[id] } : item);
      }
      for (const [sourceId, assignment] of Object.entries(state.reviewAssignments)) {
        const targetId = assignment.reviewQuestionId;
        if (!changed.has(sourceId) && !changed.has(targetId)) continue;
        const source = this.questions[sourceId], target = this.questions[targetId], schedule = state.reviewSchedule[sourceId];
        const safe = (!changed.has(sourceId) || complete.has(sourceId)) && (!changed.has(targetId) || complete.has(targetId)) &&
          assignment.conceptId === source.category && target.category === source.category &&
          schedule && assignment.stage === schedule.stage && assignment.dueAt === schedule.dueAt;
        if (!safe) { archive.reviewAssignments[sourceId] = cloneContent(assignment); delete state.reviewAssignments[sourceId]; }
      }
      if (state.completed && !this.practicalEvidencePassed()) { archive.completed = true; state.completed = false; }
      state.questionContentVersions = versions;
      state.contentMigrationArchive = archive;
      state.contentRecheckIds = Object.keys(archive.questions).filter(id => !complete.has(id));
    }
    migrateOpeningBalances(saved) {
      const state=this.state, versions=ProgressModel.currentContentVersions(this.questions);
      const changed=Object.keys(versions).filter(id => CONTENT_IDENTITIES[id]?.legacy && saved.questionContentVersions?.[id] !== versions[id]);
      const archive=state.contentMigrationArchive, originalSession=state.examSession, originalReview=state.lastExamReview;
      for (const id of changed) {
        // Neither category, identical numeric answers nor shared cell keys prove
        // that an answer was made with the new opening-balance condition.
        if (archive.questions[id]) throw new Error('opening archive already exists');
        const attempts=state.attempts.filter(row => (row.questionId || row.id) === id);
        const assignments=Object.fromEntries(Object.entries(state.reviewAssignments).filter(([source,row]) => source===id || row.reviewQuestionId===id));
        const exams=state.examHistory.filter(row => typeof row.setSignature==='string' && row.setSignature.split('|').includes(id));
        const session=originalSession?.ids.includes(id) ? originalSession : null;
        const lastReview=originalReview?.items?.some(row=>row.id===id) ? originalReview : null;
        // Archived unverified sessions remain in provenance; exposure is not mastery.
        const archivedExposure=state.legacyProvenance?.archivedExams.some(row=>row.session.ids.includes(id));
        const flags={answered:state.answeredIds.includes(id),correct:state.correctIds.includes(id),incorrect:state.incorrectIds.includes(id)};
        const hasEvidence=attempts.length || state.questionStats[id] || state.learningEffectiveness.questions[id] ||
          Object.values(flags).some(Boolean) || state.drafts[id] || state.reviewSchedule[id] || state.mistakeCounts[id] ||
          Object.keys(assignments).length || exams.length || session || lastReview || archivedExposure;
        if (hasEvidence) {
          archive.questions[id]=cloneContent({fromRevision:saved.contentRevision || 1,fromIdentity:CONTENT_IDENTITIES[id].legacy,toIdentity:versions[id],
            questionStats:state.questionStats[id] || null,attempts,flags,draft:state.drafts[id] || null,
            reviewSchedule:state.reviewSchedule[id] || null,mistakeCount:state.mistakeCounts[id] || null,provenComplete:false,
            learningEvidence:state.learningEffectiveness.questions[id] || null,initialHistory:state.learningEffectiveness.initialHistory,
            reviewAssignments:assignments,examSession:session,examHistory:exams,lastExamReview:lastReview});
          if (!state.contentRecheckIds.includes(id)) state.contentRecheckIds.push(id);
        }
        for (const key of ['questionStats','drafts','reviewSchedule','mistakeCounts']) delete state[key][id];
        delete state.learningEffectiveness.questions[id];
        for (const key of ['answeredIds','correctIds','incorrectIds']) state[key]=state[key].filter(value=>value!==id);
        state.attempts=state.attempts.filter(row=>(row.questionId || row.id)!==id);
        for (const source of Object.keys(assignments)) delete state.reviewAssignments[source];
        // Keep original legacy provenance bytes and their archive; remove only
        // active candidates that could reinstate this obsolete answer/schedule.
        if (state.legacyProvenance) for (const list of Object.values(state.legacyProvenance.pending))
          if (Array.isArray(list)) { const at=list.indexOf(id); if(at>=0)list.splice(at,1); }
        if (session) { state.examSession=null; if(state.mode==='exam')state.mode='story'; }
        if (lastReview) state.lastExamReview=null;
      }
      if (state.completed && (!this.practicalEvidencePassed() || new Set(this.verifiedExamHistory().filter(row=>row.points>=70 && row.setSignature).map(row=>row.setSignature)).size<2)) {
        if (archive.completed === null) archive.completed=true;
        state.completed=false;
      }
      state.questionContentVersions=versions;
    }
    validQuestionStats(item) {
      return item && typeof item === 'object' && !Array.isArray(item) &&
        ['correctCount','incorrectCount','correctStreak','incorrectStreak'].every(key => Number.isSafeInteger(item[key]) && item[key] >= 0) &&
        (item.lastResult === null || typeof item.lastResult === 'boolean') && Number.isFinite(item.lastAnsweredAt) && item.lastAnsweredAt >= 0;
    }
    aggregateQuestionStats(attempts = []) {
      const stats = {};
      attempts.forEach(item => {
        const id = item?.questionId || item?.id;
        if (!this.questions[id] || typeof item.correct !== 'boolean') return;
        this.applyQuestionStat(stats, id, item.correct, Number(item.timestamp || item.at || 0) || 0);
      });
      return stats;
    }
    localDayKey(value) {
      const date = new Date(Number(value));
      if (!Number.isFinite(date.getTime())) return null;
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    dayOrdinalFromKey(key) {
      if (typeof key !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
      const [year, month, day] = key.split('-').map(Number);
      if (!Number.isSafeInteger(year) || year < 1970 || !Number.isSafeInteger(month) || !Number.isSafeInteger(day)) return null;
      const value = Date.UTC(year, month - 1, day);
      const date = new Date(value);
      if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
      return Math.floor(value / 86400000);
    }
    validLearningContinuityState(value) {
      const plain = item => item && typeof item === 'object' && !Array.isArray(item);
      if (!plain(value) || !Array.isArray(value.activeDayKeys)) return false;
      const ordinals = value.activeDayKeys.map(key => this.dayOrdinalFromKey(key));
      if (ordinals.some(item => !Number.isSafeInteger(item))) return false;
      if (new Set(value.activeDayKeys).size !== value.activeDayKeys.length) return false;
      for (let index = 1; index < ordinals.length; index += 1) if (ordinals[index] <= ordinals[index - 1]) return false;
      if (value.today === null) return true;
      const today = value.today;
      if (!plain(today) || !Number.isSafeInteger(this.dayOrdinalFromKey(today.dayKey))) return false;
      if (!Number.isSafeInteger(today.attempts) || today.attempts <= 0) return false;
      if (!Number.isSafeInteger(today.correctCount) || today.correctCount < 0 || today.correctCount > today.attempts) return false;
      if (!Number.isSafeInteger(today.reviewSuccessCount) || today.reviewSuccessCount < 0 || today.reviewSuccessCount > today.correctCount) return false;
      if (!Array.isArray(today.questionIds) || today.questionIds.some(id => typeof id !== 'string' || !this.questions[id])) return false;
      if (new Set(today.questionIds).size !== today.questionIds.length || today.questionIds.length > today.attempts) return false;
      if (!value.activeDayKeys.includes(today.dayKey)) return false;
      return true;
    }
    normalizeLearningContinuityState(value) {
      return {
        activeDayKeys:[...value.activeDayKeys],
        today:value.today === null ? null : {
          dayKey:value.today.dayKey,
          attempts:value.today.attempts,
          correctCount:value.today.correctCount,
          questionIds:[...value.today.questionIds],
          reviewSuccessCount:value.today.reviewSuccessCount
        }
      };
    }
    continuityStateFromAttempts(attempts = []) {
      const daily = new Map();
      (Array.isArray(attempts) ? attempts : []).forEach(item => {
        const id = item?.questionId || item?.id;
        const timestamp = Number(item?.timestamp ?? item?.at);
        const key = this.localDayKey(timestamp);
        const ordinal = this.dayOrdinalFromKey(key);
        if (!this.questions[id] || typeof item?.correct !== 'boolean' || !Number.isFinite(timestamp) || timestamp < 0 || !Number.isSafeInteger(ordinal)) return;
        const day = daily.get(key) || { dayKey:key, attempts:0, correctCount:0, questionIds:new Set(), reviewSuccessCount:0 };
        day.attempts += 1;
        if (item.correct === true) day.correctCount += 1;
        day.questionIds.add(id);
        if (item.correct === true && item.delayedSuccess === true) day.reviewSuccessCount += 1;
        daily.set(key, day);
      });
      const activeDayKeys = [...daily.keys()].sort((a, b) => this.dayOrdinalFromKey(a) - this.dayOrdinalFromKey(b));
      const latestKey = activeDayKeys.at(-1) || null;
      const latest = latestKey ? daily.get(latestKey) : null;
      return {
        activeDayKeys,
        today:latest ? {
          dayKey:latest.dayKey,
          attempts:latest.attempts,
          correctCount:latest.correctCount,
          questionIds:[...latest.questionIds],
          reviewSuccessCount:latest.reviewSuccessCount
        } : null
      };
    }
    recordLearningContinuity(id, correct, delayedSuccess, now) {
      const dayKey = this.localDayKey(now);
      const ordinal = this.dayOrdinalFromKey(dayKey);
      if (!this.questions[id] || typeof correct !== 'boolean' || !Number.isSafeInteger(ordinal)) return false;
      const current = this.validLearningContinuityState(this.state.learningContinuityState)
        ? this.state.learningContinuityState
        : { activeDayKeys:[], today:null };
      if (!current.activeDayKeys.includes(dayKey)) {
        current.activeDayKeys.push(dayKey);
        current.activeDayKeys.sort((a, b) => this.dayOrdinalFromKey(a) - this.dayOrdinalFromKey(b));
      }
      if (!current.today || current.today.dayKey !== dayKey) {
        current.today = this.state.learningDayHistory[dayKey]
          ? cloneContent(this.state.learningDayHistory[dayKey])
          : { dayKey, attempts:0, correctCount:0, questionIds:[], reviewSuccessCount:0 };
      }
      current.today.attempts += 1;
      if (correct) current.today.correctCount += 1;
      if (!current.today.questionIds.includes(id)) current.today.questionIds.push(id);
      if (correct && delayedSuccess === true) current.today.reviewSuccessCount += 1;
      this.state.learningDayHistory[dayKey] = cloneContent(current.today);
      this.state.learningContinuityState = current;
      return true;
    }
    applyQuestionStat(target, id, correct, answeredAt) {
      const previous = target[id] || { correctCount:0, incorrectCount:0, correctStreak:0, incorrectStreak:0, lastResult:null, lastAnsweredAt:0 };
      const next = { ...previous };
      if (correct) {
        next.correctCount += 1; next.correctStreak = previous.lastResult === true ? previous.correctStreak + 1 : 1; next.incorrectStreak = 0;
      } else {
        next.incorrectCount += 1; next.incorrectStreak = previous.lastResult === false ? previous.incorrectStreak + 1 : 1; next.correctStreak = 0;
      }
      next.lastResult = correct; next.lastAnsweredAt = Math.max(previous.lastAnsweredAt || 0, Number(answeredAt) || 0); target[id] = next; return next;
    }
    statsForQuestion(id) {
      return this.state.questionStats[id] || { correctCount:0, incorrectCount:0, correctStreak:0, incorrectStreak:0, lastResult:null, lastAnsweredAt:0 };
    }
    aggregateAccuracy(filter = () => true) {
      let correctCount = 0, incorrectCount = 0;
      Object.entries(this.state.questionStats).forEach(([id, item]) => { if (!filter(this.questions[id], id)) return; correctCount += item.correctCount; incorrectCount += item.incorrectCount; });
      const attempts = correctCount + incorrectCount;
      return { correctCount, incorrectCount, attempts, accuracy:attempts ? correctCount / attempts : 0 };
    }
    overallAccuracy() { return this.aggregateAccuracy(); }
    categoryAccuracy(category) { return this.aggregateAccuracy(question => question?.category === category); }
    questionAccuracy(id) {
      if (!this.questions[id]) return null;
      const stats = this.statsForQuestion(id);
      const attempts = stats.correctCount + stats.incorrectCount;
      return {
        correctCount:stats.correctCount,
        incorrectCount:stats.incorrectCount,
        attempts,
        accuracy:attempts ? stats.correctCount / attempts : null
      };
    }
    recentAccuracy({ questionId = null, category = null, limit = 5 } = {}) {
      const safeLimit = Number.isSafeInteger(limit) && limit > 0 ? limit : 5;
      const filtered = this.state.attempts.filter(item => {
        const id = item.questionId || item.id;
        if (questionId && id !== questionId) return false;
        if (category && item.category !== category && item.concept !== category) return false;
        return true;
      });
      const recent = filtered.slice(-safeLimit);
      const correctCount = recent.filter(item => item.correct === true).length;
      const incorrectCount = recent.length - correctCount;
      return {
        correctCount,
        incorrectCount,
        attempts:recent.length,
        accuracy:recent.length ? correctCount / recent.length : null
      };
    }
    learningContinuity(now = Date.now()) {
      const safeNow = Number(now);
      const emptyToday = { attempts:0, correctCount:0, incorrectCount:0, accuracy:null, questionCount:0, reviewSuccessCount:0 };
      const fallback = { currentStreak:0, activeDays:0, today:emptyToday, dueReviewCount:0, lastLearningAt:0 };
      if (!Number.isFinite(safeNow) || safeNow < 0) return fallback;
      const todayKey = this.localDayKey(safeNow);
      const todayOrdinal = this.dayOrdinalFromKey(todayKey);
      if (!Number.isSafeInteger(todayOrdinal)) return fallback;
      const continuity = this.validLearningContinuityState(this.state.learningContinuityState)
        ? this.state.learningContinuityState
        : { activeDayKeys:[], today:null };
      const activeOrdinals = continuity.activeDayKeys
        .map(key => this.dayOrdinalFromKey(key))
        .filter(ordinal => Number.isSafeInteger(ordinal) && ordinal <= todayOrdinal)
        .sort((a, b) => b - a);
      let currentStreak = 0;
      const latest = activeOrdinals[0];
      if (Number.isSafeInteger(latest) && (latest === todayOrdinal || latest === todayOrdinal - 1)) {
        const days = new Set(activeOrdinals);
        for (let cursor = latest; days.has(cursor); cursor -= 1) currentStreak += 1;
      }
      const today = this.state.learningDayHistory[todayKey] || (continuity.today?.dayKey === todayKey ? continuity.today : null);
      const attempts = today?.attempts || 0;
      const correctCount = today?.correctCount || 0;
      return {
        currentStreak,
        activeDays:activeOrdinals.length,
        ...(this.isUnverified('continuityDays',todayKey) || this.state.legacyProvenance?.pending.activeDays.some(key => key <= todayKey)
          ? {verification:{today:this.isUnverified('continuityDays',todayKey) ? 'unverified' : 'verified',
              activeDays:this.state.legacyProvenance.pending.activeDays.some(key => key <= todayKey) ? 'unverified' : 'verified'}} : {}),
        today:{
          attempts,
          correctCount,
          incorrectCount:attempts - correctCount,
          accuracy:attempts ? correctCount / attempts : null,
          questionCount:today?.questionIds.length || 0,
          reviewSuccessCount:today?.reviewSuccessCount || 0
        },
        dueReviewCount:this.dueReviewIds(safeNow).length,
        lastLearningAt:Number.isFinite(this.state.lastLearningAt) && this.state.lastLearningAt >= 0 ? this.state.lastLearningAt : 0
      };
    }
    learningMastery(id) {
      const accuracy = this.questionAccuracy(id);
      if (!accuracy) return null;
      const stats = this.statsForQuestion(id);
      const evidenceFactor = Math.min(1, accuracy.attempts / 3);
      const score = accuracy.attempts ? Math.round(100 * accuracy.accuracy * evidenceFactor) : 0;
      let state = '未着手';
      if (accuracy.attempts > 0) {
        if (stats.lastResult === false || stats.incorrectStreak >= 2) state = '要復習';
        else if (accuracy.attempts < 3 || score < 80 || stats.correctStreak < 2) state = '学習中';
        else if (stats.lastResult === true) state = '定着';
      }
      return {
        ...accuracy,
        evidenceFactor,
        score,
        state,
        correctStreak:stats.correctStreak,
        incorrectStreak:stats.incorrectStreak,
        lastResult:stats.lastResult,
        lastAnsweredAt:stats.lastAnsweredAt
      };
    }
    validExamSession(session) {
      if (!(session && typeof session === 'object' && Array.isArray(session.ids) && session.ids.length === 15 &&
        Array.isArray(this.examPool) && session.ids.every(id => this.questions[id] && this.examPool.includes(id)) && new Set(session.ids).size === session.ids.length &&
        Number.isFinite(session.startedAt) && Number.isFinite(session.endAt) && session.endAt > session.startedAt &&
        ['RUNNING', 'EXPIRED', 'FINISHING'].includes(session.status || 'RUNNING') &&
        (session.evidenceVersion === undefined || session.evidenceVersion === 1) &&
        session.scores && typeof session.scores === 'object' && !Array.isArray(session.scores))) return false;
      return Object.entries(session.scores).every(([id, score]) => {
        if (!session.ids.includes(id) || !score || typeof score.correct !== 'boolean' ||
            !Number.isSafeInteger(score.earned) || !Number.isSafeInteger(score.possible) || score.earned < 0 || score.possible <= 0 ||
            score.earned > score.possible || score.correct !== (score.earned === score.possible) || score.ratio !== score.earned / score.possible) return false;
        const question = this.questions[id], cells = question.answer?.cells;
        const possible = question.type === 'journal' ? 1 : cells && typeof cells === 'object' ? Object.keys(cells).length : null;
        return possible === null || score.possible === possible;
      });
    }
    refreshEvidenceIntegrity() { this.state.learningEvidenceIntegrity = {schemaVersion:11,signature:evidenceStateSignature(this.state)}; }
    save() { if (this.storageWriteBlocked || typeof this.storage?.setItem !== 'function') return false; try { return this.storage.setItem(this.key, JSON.stringify(this.state)) !== false; } catch (_) { return false; } }
    setDraft(id, answer) { if (!this.questions[id] || !answer || typeof answer !== 'object') return false; this.state.drafts[id] = answer; this.state.currentQuestionId = id; this.refreshEvidenceIntegrity(); return this.save(); }
    discardDraftCandidate(id) {
      if (this.state.legacyProvenance) this.state.legacyProvenance.pending.drafts = this.state.legacyProvenance.pending.drafts.filter(value => value !== id);
    }
    clearDraft(id) { if (!this.questions[id]) return false; delete this.state.drafts[id]; this.discardDraftCandidate(id); this.refreshEvidenceIntegrity(); return this.save(); }
    clearDrafts(ids) { if (!Array.isArray(ids)) return false; ids.filter(id => this.questions[id]).forEach(id => { delete this.state.drafts[id]; this.discardDraftCandidate(id); }); this.refreshEvidenceIntegrity(); return this.save(); }
    record(id, correct, now = Date.now()) {
      if (!this.questions[id]) return false;
      if (this.state.learningEffectiveness && !this.state.learningEffectiveness.questions[id]) {
        this.state.learningEffectiveness.questions[id] = emptyEvidence();
      }
      if (!this.state.answeredIds.includes(id)) this.state.answeredIds.push(id);
      if (correct && !this.state.correctIds.includes(id)) this.state.correctIds.push(id);
      const intervals = [20 * 60 * 1000, 24 * 60 * 60 * 1000, 3 * 24 * 60 * 60 * 1000, 7 * 24 * 60 * 60 * 1000];
      const unverifiedSchedule = this.isUnverified('reviewSchedule',id);
      const scheduled = unverifiedSchedule ? null : this.state.reviewSchedule[id];
      if (!correct) {
        if (!this.state.incorrectIds.includes(id)) this.state.incorrectIds.push(id);
        this.state.mistakeCounts[id] = (this.state.mistakeCounts[id] || 0) + 1;
        this.state.reviewSchedule[id] = { stage:0, dueAt:now + intervals[0] };
      } else if (scheduled && now >= scheduled.dueAt) {
        const nextStage = scheduled.stage + 1;
        if (nextStage >= intervals.length) {
          this.state.incorrectIds = this.state.incorrectIds.filter(value => value !== id);
          delete this.state.reviewSchedule[id];
        } else this.state.reviewSchedule[id] = { stage:nextStage, dueAt:now + intervals[nextStage] };
      } else if (!scheduled) {
        this.state.incorrectIds = this.state.incorrectIds.filter(value => value !== id);
        this.state.reviewSchedule[id] = { stage:0, dueAt:now + intervals[0] };
      }
      if (correct === true) this.state.contentRecheckIds = this.state.contentRecheckIds.filter(value => value !== id);
      if (unverifiedSchedule) this.state.legacyProvenance.pending.reviewSchedule = this.state.legacyProvenance.pending.reviewSchedule.filter(value => value !== id);
      for (const field of ['answeredIds','incorrectIds',...(correct ? ['correctIds'] : [])]) {
        const pending = this.state.legacyProvenance?.pending[field];
        if (Array.isArray(pending)) this.state.legacyProvenance.pending[field] = pending.filter(value => value !== id);
      }
      delete this.state.drafts[id]; this.refreshEvidenceIntegrity(); this.save(); return true;
    }
    dueReviewIds(now = Date.now()) {
      return Object.keys(this.state.reviewSchedule).filter(id => this.state.reviewSchedule[id].dueAt <= now)
        .sort((a, b) => (this.state.reviewSchedule[a]?.dueAt || 0) - (this.state.reviewSchedule[b]?.dueAt || 0));
    }
    assignReview(sourceQuestionId, reviewQuestionId, now = Date.now()) {
      const schedule = this.state.reviewSchedule[sourceQuestionId];
      if (!this.questions[sourceQuestionId] || !this.questions[reviewQuestionId] || !schedule) return null;
      const current = this.state.reviewAssignments[sourceQuestionId];
      if (current && current.status === 'assigned' && current.stage === schedule.stage && current.dueAt === schedule.dueAt && current.reviewQuestionId === reviewQuestionId && current.conceptId === (this.questions[sourceQuestionId].category || '') && this.questions[current.reviewQuestionId]) return current;
      const assignment = { sourceQuestionId, reviewQuestionId, conceptId:this.questions[sourceQuestionId].category || '', stage:schedule.stage, dueAt:schedule.dueAt, assignedAt:now, status:'assigned' };
      this.state.reviewAssignments[sourceQuestionId] = assignment; this.refreshEvidenceIntegrity(); this.save(); return assignment;
    }
    completeReview(sourceQuestionId, correct, now = Date.now(), reviewQuestionId = null) {
      const assignment = this.state.reviewAssignments[sourceQuestionId];
      if (!assignment || assignment.status !== 'assigned' || now < assignment.dueAt) return false;
      const unverified = this.isUnverified('reviewSchedule',sourceQuestionId);
      const recorded = this.record(sourceQuestionId, correct, now);
      if (recorded) {
        const actualReviewId = reviewQuestionId || assignment.reviewQuestionId;
        if (actualReviewId && actualReviewId !== sourceQuestionId && this.questions[actualReviewId]) delete this.state.drafts[actualReviewId];
        delete this.state.reviewAssignments[sourceQuestionId];
        this.refreshEvidenceIntegrity(); this.save();
      }
      // Current practice starts a new schedule; an unverified old deadline/stage
      // cannot earn a delayed-review completion or its bonus.
      return recorded && !unverified;
    }
    learningEffectivenessForQuestion(id) {
      if (!Object.hasOwn(this.questions, id)) return null;
      const evidence = this.state.learningEffectiveness;
      const item = cloneContent(evidence.questions[id] || emptyEvidence());
      item.initialStatus = evidence.initialHistory === 'unknown' || this.storageWriteBlocked || Boolean(this.state.contentMigrationArchive.questions[id]?.fromIdentity) ? 'unknown' : item.firstAttempt ? 'observed' : 'unanswered';
      return item;
    }
    nextLearningObservation(id) {
      if (!Object.hasOwn(this.questions, id)) return null;
      const next = (this.state.learningEffectiveness.questions[id]?.observedAttempts || 0) + 1;
      return Number.isSafeInteger(next) ? next : null;
    }
    qualifiedDelayedReview(id, sourceId, now, mode) {
      if (mode !== 'review' || !Object.hasOwn(this.questions, sourceId)) return null;
      if (this.isUnverified('reviewSchedule',sourceId)) return null;
      const assignment = this.state.reviewAssignments[sourceId], schedule = this.state.reviewSchedule[sourceId];
      if (!assignment || !schedule || assignment.status !== 'assigned' || assignment.sourceQuestionId !== sourceId ||
          assignment.reviewQuestionId !== id || assignment.stage !== schedule.stage || assignment.dueAt !== schedule.dueAt ||
          assignment.conceptId !== (this.questions[sourceId].category || '') || this.questions[id].category !== this.questions[sourceId].category ||
          !Number.isSafeInteger(schedule.stage) || schedule.stage < 0 || schedule.stage > 4 ||
          !Number.isFinite(schedule.dueAt) || schedule.dueAt < 0 || !Number.isFinite(assignment.assignedAt) || assignment.assignedAt < 0 ||
          now < schedule.dueAt) return null;
      return { sourceId, stage:schedule.stage };
    }
    applyRecovery(item, support, now) {
      let changed = false;
      for (const error of Object.values(item.misconceptionStats)) {
        if (!error.pending) continue;
        const recoveredAt = Math.max(now,item.lastObservedAt ?? 0,error.lastOccurredAt ?? 0,error.lastRecoveredAt ?? 0,error.lastAssistedRecoveredAt ?? 0);
        if (support === 'none') {
          error.recoveredCount += 1; error.lastRecoveredAt = recoveredAt; error.pending = false; changed = true;
        } else if (['hint-1','hint-2','coaching'].includes(support) && !error.assisted) {
          error.assistedRecoveredCount += 1; error.lastAssistedRecoveredAt = recoveredAt; error.assisted = true; changed = true;
        }
      }
      return changed;
    }
    recordAssistedRecovery(id, observationNumber, now = Date.now()) {
      const item = this.state.learningEffectiveness.questions[id];
      if (this.storageWriteBlocked || !Object.hasOwn(this.questions, id) || !item || !Number.isSafeInteger(observationNumber) ||
          observationNumber < 1 || observationNumber !== item.observedAttempts || this.statsForQuestion(id).lastResult !== false ||
          !Number.isFinite(now) || now < 0) return false;
      const before = cloneContent(this.state);
      const changed = this.applyRecovery(item, 'coaching', now); this.refreshEvidenceIntegrity();
      if (!changed || !ProgressModel.validLearningEffectiveness(this.state.learningEffectiveness, this.questions) || !this.save()) {
        this.state = before; return false;
      }
      return true;
    }
    recordAttempt(id, correct, responseMs, wrongType = '', delayedSuccess = false, now = Date.now(), reviewStage = null, confidence = 'unsure', context = {}) {
      if (this.storageWriteBlocked || !Object.hasOwn(this.questions, id) || typeof correct !== 'boolean' || !Number.isFinite(responseMs) || responseMs < 0 ||
          !Number.isFinite(now) || now < 0 || !context || typeof context !== 'object') return false;
      const mode = context.mode ?? this.state.mode, support = context.support ?? 'unknown';
      const observationNumber = context.observationNumber ?? this.nextLearningObservation(id);
      if (!EVIDENCE_MODES.includes(mode) || mode !== this.state.mode || !EVIDENCE_SUPPORT.includes(support) ||
          !Number.isSafeInteger(observationNumber) || observationNumber < 1 || observationNumber !== this.nextLearningObservation(id)) return false;
      const before = cloneContent(this.state);
      const evidence = this.state.learningEffectiveness;
      const item = evidence.questions[id] ||= emptyEvidence();
      const delayed = this.qualifiedDelayedReview(id, context.reviewSourceId, now, mode);
      const examSession = mode === 'exam' && this.validExamSession(this.state.examSession) && this.state.examSession.ids.includes(id)
        ? examIdentity(this.state) : null;
      if (item.observedAttempts === 0) {
        item.firstObservedAt = now;
        if (evidence.initialHistory === 'complete') item.firstAttempt = { correct, at:now, mode, support };
      }
      item.observedAttempts += 1; item[correct ? 'correctCount' : 'incorrectCount'] += 1;
      item.lastObservedAt = Math.max(item.lastObservedAt ?? 0, now);
      item.modes[mode].attempts += 1; if (correct) item.modes[mode].successes += 1;
      if (examSession) item.lastExamObservation = {observationNumber,correct,at:now,session:examSession};
      if (correct) this.applyRecovery(item, support, now);
      else {
        const tags = ProgressModel.evidenceTags(this.questions[id]);
        const tag = tags.includes(`cell:${wrongType}`) ? `cell:${wrongType}` : tags[0];
        const error = item.misconceptionStats[tag] ||= { occurrences:0, recoveredCount:0, assistedRecoveredCount:0,
          lastOccurredAt:null, lastRecoveredAt:null, lastAssistedRecoveredAt:null, pending:false, assisted:false };
        error.occurrences += 1; error.lastOccurredAt = now; error.pending = true; error.assisted = false;
      }
      if (delayed) {
        const retention = (evidence.questions[delayed.sourceId] ||= emptyEvidence()).delayedReview;
        const kind = correct ? 'correct' : 'incorrect', previous = retention.receipts[kind];
        // One reverse binding per source/outcome: at most 2 * question count.
        // Remove the previous target's binding when a newer observation replaces it.
        if (previous) {
          const bindings = evidence.questions[previous.questionId].reviewBindings;
          delete bindings[delayed.sourceId][kind];
          if (!Object.keys(bindings[delayed.sourceId]).length) delete bindings[delayed.sourceId];
        }
        (item.reviewBindings[delayed.sourceId] ||= {})[kind] = {observationNumber,at:now,stage:delayed.stage};
        retention.receipts[kind] = { sourceId:delayed.sourceId, questionId:id, observationNumber, at:now, stage:delayed.stage };
        retention.attempts += 1; retention.lastAt = Math.max(retention.lastAt ?? 0, now); retention.stages[delayed.stage].attempts += 1;
        if (correct) {
          retention.successes += 1; retention.stages[delayed.stage].successes += 1;
          retention.highestConfirmedStage = Math.max(retention.highestConfirmedStage ?? 0, Math.min(delayed.stage + 1, 4));
        }
      }
      this.state.attempts.push({ questionId:id, id, ...(this.state.questionContentVersions[id] ? { contentIdentity:this.state.questionContentVersions[id] } : {}), concept:this.questions[id].category, category:this.questions[id].category, difficulty:Number(this.questions[id].difficulty || 1), correct, confidence:confidence === 'sure' ? 'sure' : 'unsure', responseMs, wrongType:String(wrongType || ''), reviewStage:delayed ? delayed.stage : Number.isSafeInteger(reviewStage) ? reviewStage : null, reviewSourceId:delayed?.sourceId || null, delayedSuccess:delayedSuccess === true, timestamp:now, at:now, mode, support, observationNumber, examSession });
      this.state.attempts = this.state.attempts.slice(-200);
      evidence.retainedAttemptsSignature = valueSignature(this.state.attempts);
      this.recordLearningContinuity(id, correct, delayedSuccess === true, now);
      const stats = this.applyQuestionStat(this.state.questionStats, id, correct, now);
      this.state.lastLearningAt = Math.max(this.state.lastLearningAt || 0, now);
      this.refreshEvidenceIntegrity();
      if (!this.validQuestionStats(stats) || !Number.isSafeInteger(stats.correctCount + stats.incorrectCount) ||
          !this.validLearningContinuityState(this.state.learningContinuityState) ||
          !ProgressModel.validLearningEffectiveness(evidence, this.questions) || !this.save()) {
        this.state = before; return false;
      }
      return true;
    }
    adaptiveDifficulty(concept, fallback = 2) {
      const recent = this.state.attempts.filter(item => item.concept === concept).slice(-6);
      if (!recent.length) return Math.max(1, Math.min(4, fallback));
      const accuracy = recent.filter(item => item.correct).length / recent.length;
      const fast = recent.filter(item => item.correct && item.responseMs <= 60000).length / recent.length;
      const delayed = recent.some(item => item.delayedSuccess);
      const current = recent[recent.length - 1].difficulty;
      if (!recent[recent.length - 1].correct && recent[recent.length - 1].confidence === 'sure') return Math.max(1, current - 1);
      if (recent.slice(-2).every(item => !item.correct)) return Math.max(1, current - 1);
      if (recent.length >= 3 && accuracy >= .8 && fast >= .6 && delayed) return Math.min(4, current + 1);
      return current;
    }
    studyPriority(id, now = Date.now()) {
      const question = this.questions[id];
      if (!question || ['review', 'transfer', 'exam'].includes(question.learningRole) || !Number.isFinite(now) || now < 0) return null;
      const lifetime = this.questionAccuracy(id);
      const recent = this.recentAccuracy({ questionId:id, limit:5 });
      const stats = this.statsForQuestion(id);
      const schedule = this.state.reviewSchedule[id] || null;
      const due = Boolean(schedule && !this.isUnverified('reviewSchedule',id) && Number.isFinite(schedule.dueAt) && schedule.dueAt <= now);
      const attempts = lifetime?.attempts || 0;
      const inactiveMs = attempts && stats.lastAnsweredAt > 0 ? Math.max(0, now - stats.lastAnsweredAt) : null;
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
      let tier = 5;
      const reasons = [];
      if (this.isUnverified('reviewSchedule',id)) reasons.push('旧版の復習予定あり（未検証）');
      if (due) {
        tier = 0;
        reasons.push('復習期限を過ぎています');
      } else if (stats.lastResult === false || stats.incorrectStreak >= 2) {
        tier = 1;
        if (stats.lastResult === false) reasons.push('直近の回答が誤答です');
        if (stats.incorrectStreak >= 2) reasons.push(`連続誤答${stats.incorrectStreak}回です`);
      } else {
        const recentWeak = recent.attempts > 0 && recent.accuracy < .6;
        const lifetimeWeak = attempts >= 2 && lifetime.accuracy < .6;
        if (recentWeak || lifetimeWeak) {
          tier = 2;
          if (recentWeak) reasons.push(`直近${recent.attempts}回の正答率が60%未満です`);
          if (lifetimeWeak) reasons.push('累積正答率が60%未満です');
        } else if (attempts > 0 && inactiveMs >= sevenDaysMs) {
          tier = 3;
          reasons.push('最終回答から7日以上経過しています');
        } else if (attempts === 0) {
          tier = 4;
          reasons.push('まだ回答していない問題です');
        } else {
          reasons.push('現在の学習順で進められます');
        }
      }
      return {
        id,
        tier,
        reasons,
        due,
        dueAt:schedule?.dueAt ?? null,
        overdueMs:due ? Math.max(0, now - schedule.dueAt) : 0,
        inactiveMs,
        lifetime,
        recent,
        mastery:this.learningMastery(id)
      };
    }
    priorityStudyIds({ now = Date.now(), limit = Infinity, category = null } = {}) {
      if (!Number.isFinite(now) || now < 0) return [];
      const safeLimit = Number.isSafeInteger(limit) && limit >= 0 ? limit : Infinity;
      const order = new Map(Object.keys(this.questions).map((id, index) => [id, index]));
      return Object.values(this.questions)
        .filter(question => !category || question.category === category)
        .map(question => this.studyPriority(question.id, now))
        .filter(Boolean)
        // A future spaced-review assignment is authoritative: ordinary recommendations
        // must not pull it forward before its due time.
        .filter(item => item.due || !this.state.reviewSchedule[item.id])
        .sort((a, b) => a.tier - b.tier ||
          (a.tier === 0 ? (a.dueAt || 0) - (b.dueAt || 0) : 0) ||
          (order.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.id) ?? Number.MAX_SAFE_INTEGER))
        .slice(0, safeLimit)
        .map(item => item.id);
    }
    recommendedIds(concept, now = Date.now()) {
      const attempted = new Set(this.state.attempts.map(item => item.questionId || item.id));
      // Review items are released only by dueReviewIds; transfer items are reserved for unseen assessment.
      const candidates = Object.values(this.questions).filter(item => item.category === concept && !['review', 'transfer', 'exam'].includes(item.learningRole));
      const target = this.adaptiveDifficulty(concept, candidates[0]?.difficulty || 2);
      const roleOrder = { core:0, drill:1, reinforcement:1, review:2, transfer:3, exam:4 };
      const priority = id => this.studyPriority(id, now)?.tier ?? Number.MAX_SAFE_INTEGER;
      return candidates.sort((a,b) => priority(a.id)-priority(b.id) ||
        Number(attempted.has(a.id))-Number(attempted.has(b.id)) ||
        (roleOrder[a.learningRole] ?? 2)-(roleOrder[b.learningRole] ?? 2) || Math.abs(a.difficulty-target)-Math.abs(b.difficulty-target)).map(item => item.id);
    }
    placementStart(scores = {}) {
      const foundation = Math.max(0, Math.min(100, Number(scores.foundation) || 0));
      const closing = Math.max(0, Math.min(100, Number(scores.closing) || 0));
      const targetChapter = foundation >= 80 ? (closing >= 70 ? 10 : 7) : (foundation >= 50 ? 4 : 1);
      return Object.values(this.questions)
        .filter(item => item.learningRole === 'core' || item.learningRole === 'drill')
        .sort((a, b) => a.chapter - b.chapter || a.difficulty - b.difficulty)
        .find(item => item.chapter >= targetChapter)?.id || Object.keys(this.questions)[0] || null;
    }
    completePlacement(scores = {}, now = Date.now()) {
      const foundation = Math.max(0, Math.min(100, Number(scores.foundation) || 0));
      const closing = Math.max(0, Math.min(100, Number(scores.closing) || 0));
      const startQuestionId = this.placementStart({ foundation, closing });
      if (!startQuestionId) return null;
      this.state.placement = { completed:true, foundation, closing, startQuestionId, completedAt:now };
      if (this.state.legacyProvenance) this.state.legacyProvenance.pending.placement = false;
      this.state.currentQuestionId = startQuestionId; this.state.mode = 'story'; this.refreshEvidenceIntegrity(); this.save();
      return startQuestionId;
    }
    migrateLegacyPlacement(now = Date.now()) {
      if (this.state.placement || (!this.state.attempts.length && !this.state.answeredIds.length)) return false;
      const startQuestionId = this.state.currentQuestionId || this.state.answeredIds.at(-1) || Object.keys(this.questions)[0] || null;
      if (!startQuestionId) return false;
      this.state.placement = { completed:true, foundation:0, closing:0, startQuestionId, completedAt:now, migrated:true };
      this.refreshEvidenceIntegrity(); this.save(); return true;
    }
    resetPlacement() { this.state.placement = null; if (this.state.legacyProvenance) this.state.legacyProvenance.pending.placement = false; this.refreshEvidenceIntegrity(); this.save(); }
    practicalEvidencePassed() {
      const practicalTypes = ['ledger','worksheet','financial_statement','comprehensive'];
      // Graduation represents repeatable competence, not one lucky answer in each
      // format.  IDs are de-duplicated on load, but use a Set here as a final
      // defensive boundary for callers that construct state in memory.
      const correctEvidence = new Set(this.verifiedCorrectIds());
      const minimumEvidencePerType = 3;
      return practicalTypes.every(type => {
        const distinctCorrect = [...correctEvidence].map(id => this.questions[id]).filter(question => question?.type === type);
        // Repeated numeric variants must not masquerade as breadth.  Require both
        // three independent answers and two accounting structures (category plus
        // authored variant/format) in every practical format.
        const structures = new Set(distinctCorrect.map(question =>
          `${question.category || 'uncategorized'}::${question.variantGroup || question.format || 'base'}`));
        return distinctCorrect.length >= minimumEvidencePerType && structures.size >= 2;
      });
    }
    updateCompletion(rpg) {
      const passedExams = this.verifiedExamHistory().filter(item => item.points >= 70 && item.setSignature).map(item => item.setSignature);
      const practicalPassed = this.practicalEvidencePassed();
      const masteryPassed = ['仕訳','帳簿','決算整理','財務諸表'].every(skill => rpg?.skillMastery?.(skill) >= .7);
      const verified = practicalPassed && masteryPassed && new Set(passedExams).size >= 2;
      if (verified || !this.isUnverified('completed')) this.state.completed = verified;
      if (verified && this.state.legacyProvenance) this.state.legacyProvenance.pending.completed = false;
      this.refreshEvidenceIntegrity(); this.save(); return verified;
    }
  }
  root.ProgressModel = ProgressModel;
  if (typeof module !== 'undefined') module.exports = ProgressModel;
}(typeof window !== 'undefined' ? window : globalThis));
