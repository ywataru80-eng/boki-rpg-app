(function (root) {
  'use strict';
  const ROLES = [
    { level:30, name:'決算責任者', skills:['決算整理','財務諸表'] },
    { level:20, name:'月次決算担当', skills:['帳簿','決算整理'] },
    { level:10, name:'経理主任', skills:['仕訳'] },
    { level:5, name:'経理担当', skills:['仕訳'] },
    { level:1, name:'経理見習い', skills:[] }
  ];
  class RPGModel {
    static validateBackupState(value) {
      const plain = item => item && typeof item === 'object' && !Array.isArray(item);
      const nonnegativeInteger = item => Number.isSafeInteger(item) && item >= 0;
      if (!plain(value) || !nonnegativeInteger(value.xp) || !Array.isArray(value.rewardedIds) || value.rewardedIds.some(id => typeof id !== 'string') || !plain(value.mastery)) return false;
      if (Object.values(value.mastery).some(item => !plain(item) || !Number.isFinite(item.earned) || item.earned < 0 || !Number.isFinite(item.possible) || item.possible < item.earned)) return false;
      if (!Number.isFinite(value.companyHP) || value.companyHP < 0 || value.companyHP > 100 || !Number.isFinite(value.totalTransactionAmount)) return false;
      if (value.confidenceOutcomes !== undefined) {
        if (!plain(value.confidenceOutcomes)) return false;
        for (const key of ['sureCorrect', 'sureWrong', 'unsureCorrect', 'unsureWrong']) if (!nonnegativeInteger(value.confidenceOutcomes[key])) return false;
      }
      return true;
    }
    constructor(storage, key = 'boki-rpg-character-v1') {
      this.storage = storage; this.key = key;
      this.state = { xp: 0, rewardedIds: [], mastery: {}, companyHP: 100, totalTransactionAmount: 0, confidenceOutcomes: { sureCorrect:0, sureWrong:0, unsureCorrect:0, unsureWrong:0 } };
      this.load();
    }
    load() {
      try {
        const saved = JSON.parse(this.storage?.getItem?.(this.key));
        if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return;
        this.state = {
          xp: Number.isSafeInteger(saved.xp) && saved.xp >= 0 ? saved.xp : 0,
          rewardedIds: Array.isArray(saved.rewardedIds) ? [...new Set(saved.rewardedIds.filter(id => typeof id === 'string'))] : [],
          mastery: saved.mastery && typeof saved.mastery === 'object' && !Array.isArray(saved.mastery)
            ? Object.fromEntries(Object.entries(saved.mastery).filter(([, value]) => value &&
              Number.isFinite(value.earned) && value.earned >= 0 && Number.isFinite(value.possible) && value.possible >= value.earned)) : {},
          companyHP: Number.isFinite(saved.companyHP) ? Math.max(0, Math.min(100, saved.companyHP)) : 100,
          totalTransactionAmount: Number.isFinite(saved.totalTransactionAmount) ? saved.totalTransactionAmount : 0,
          confidenceOutcomes: this.validConfidenceOutcomes(saved.confidenceOutcomes)
        };
      } catch (_) { /* An unavailable/corrupt store starts a clean character. */ }
    }
    validConfidenceOutcomes(value) {
      const clean = { sureCorrect:0, sureWrong:0, unsureCorrect:0, unsureWrong:0 };
      if (!value || typeof value !== 'object' || Array.isArray(value)) return clean;
      Object.keys(clean).forEach(key => { if (Number.isSafeInteger(value[key]) && value[key] >= 0) clean[key] = value[key]; });
      return clean;
    }
    save() { try { return this.storage?.setItem?.(this.key, JSON.stringify(this.state)) !== false; } catch (_) { return false; } }
    get unlockedTools() {
      const tools = ['標準電卓'];
      if (this.level >= 5) tools.push('税込・税抜クイック計算');
      if (this.level >= 10) tools.push('過去ログ分析');
      if (this.level >= 20) tools.push('月次決算の特別案件');
      if (this.level >= 30) tools.push('年度決算の特別案件');
      return tools;
    }
    // Lv.30 requires 12,615 XP: less than the XP available from completing the
    // authored curriculum, while still requiring broad mastery for promotion.
    get level() { return Math.min(30, Math.floor(Math.sqrt(this.state.xp / 15)) + 1); }
    static skillForQuestion(question) {
      if (!question || typeof question.type !== 'string') return null;
      if (question.type === 'journal') return '仕訳';
      if (['ledger','trial_balance','correction'].includes(question.type)) return '帳簿';
      if (question.type === 'worksheet') return '決算整理';
      if (['financial_statement','comprehensive'].includes(question.type)) return '財務諸表';
      return null;
    }
    skillMastery(skill) {
      const aggregate = this.state.mastery[`@skill:${skill}`];
      return aggregate?.possible ? aggregate.earned / aggregate.possible : 0;
    }
    unlocked(role) { return this.level >= role.level && role.skills.every(skill => this.skillMastery(skill) >= .7); }
    get role() { return ROLES.find(role => this.unlocked(role))?.name || '経理見習い'; }
    reward(question, score, multiplier = 1) {
      if (!question || typeof question.id !== 'string' || !Number.isFinite(question.difficulty) || question.difficulty < 0 || this.state.rewardedIds.includes(question.id)) return false;
      if (!score || !Number.isFinite(score.ratio) || score.ratio < 0 || score.ratio > 1 || !Number.isFinite(score.earned) || !Number.isFinite(score.possible) || score.earned < 0 || score.possible < score.earned || !Number.isFinite(multiplier) || multiplier < 0) return false;
      this.state.rewardedIds.push(question.id);
      this.state.xp += Math.round(20 * question.difficulty * score.ratio * multiplier);
      this.state.totalTransactionAmount += this.questionAmount(question);
      this.save(); return true;
    }
    rewardEvent(eventKey, xp) {
      if (typeof eventKey !== 'string' || !eventKey.startsWith('@event:') || !Number.isSafeInteger(xp) || xp <= 0 || this.state.rewardedIds.includes(eventKey)) return 0;
      this.state.rewardedIds.push(eventKey);
      this.state.xp += xp;
      this.save();
      return xp;
    }
    reviewSuccessBonus(question, stage) {
      if (!question || typeof question.id !== 'string' || !Number.isFinite(question.difficulty) || question.difficulty <= 0 || !Number.isSafeInteger(stage) || stage < 0 || stage > 3) return 0;
      const xp = Math.max(1, Math.round(2 * question.difficulty));
      return this.rewardEvent(`@event:review-success:${question.id}:stage:${stage}`, xp);
    }
    weakRecoveryBonus(question) {
      if (!question || typeof question.id !== 'string' || !Number.isFinite(question.difficulty) || question.difficulty <= 0) return 0;
      const xp = Math.max(1, Math.round(4 * question.difficulty));
      return this.rewardEvent(`@event:weak-recovery:${question.id}`, xp);
    }
    recordMastery(question, score) {
      if (!question || typeof question.category !== 'string' || !score || !Number.isFinite(score.earned) || !Number.isFinite(score.possible) || score.earned < 0 || score.possible <= 0 || score.possible < score.earned) return false;
      const mastery = this.state.mastery[question.category] || { earned: 0, possible: 0 };
      mastery.earned += score.earned; mastery.possible += score.possible;
      this.state.mastery[question.category] = mastery;
      const skill = RPGModel.skillForQuestion(question);
      if (skill) {
        const key = `@skill:${skill}`; const aggregate = this.state.mastery[key] || { earned:0, possible:0 };
        aggregate.earned += score.earned; aggregate.possible += score.possible; this.state.mastery[key] = aggregate;
      }
      this.save(); return true;
    }
    questionAmount(question) {
      if (question.type === 'journal') return (question.answer?.debit || []).reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
      return Object.values(question.answer?.cells || {}).reduce((sum, value) => sum + (Number(value) || 0), 0);
    }
    applyAnswer(correct, confidence = 'unsure') {
      const sure = confidence === 'sure';
      const key = `${sure ? 'sure' : 'unsure'}${correct ? 'Correct' : 'Wrong'}`;
      this.state.confidenceOutcomes[key] += 1;
      // A mistake lowers ledger trust but never blocks learning; correction restores it faster.
      this.state.companyHP = Math.max(0, Math.min(100, this.state.companyHP + (correct ? 10 : -5)));
      this.save();
      return this.state.companyHP;
    }
    resetCompanyHP() { this.state.companyHP = 100; this.save(); }
  }
  root.RPGModel = RPGModel;
  if (typeof module !== 'undefined') module.exports = RPGModel;
}(typeof window !== 'undefined' ? window : globalThis));
