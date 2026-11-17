'use strict';
// Pure scoring contract for 2027 work. Not wired into the live exam until
// syllabus/pool migration and session persistence have been independently gated.
const assert = require('node:assert/strict');
const YEAR_SCHEMES = Object.freeze({
  '2026': Object.freeze({
    year: '2026', effectiveThrough: '2027-03-31',
    sectionPoints: Object.freeze([45, 20, 35]),
    itemPoints: Object.freeze([9, 9, 9, 9, 9, 5, 5, 5, 5, 6, 6, 6, 6, 6, 5])
  }),
  '2027': Object.freeze({
    year: '2027', effectiveFrom: '2027-04-01',
    sectionPoints: Object.freeze([45, 25, 30]),
    // Internal 15-item mock-exam weighting is application-defined, NOT a
    // JCCI-prescribed item distribution or proof of official format coverage.
    itemPoints: Object.freeze([9, 9, 9, 9, 9, 7, 6, 6, 6, 5, 5, 5, 5, 5, 5])
  })
});
const splits = Object.freeze([5, 9, 15]);
function getScheme(year) {
  if (!Object.hasOwn(YEAR_SCHEMES, String(year))) throw new RangeError('unknown exam year');
  return YEAR_SCHEMES[String(year)];
}
function verifyScheme(year) {
  const scheme = getScheme(year);
  assert.equal(scheme.itemPoints.length, 15);
  assert(scheme.itemPoints.every(n => Number.isSafeInteger(n) && n > 0));
  let start = 0;
  scheme.sectionPoints.forEach((expected, i) => {
    assert.equal(scheme.itemPoints.slice(start, splits[i]).reduce((a, b) => a + b, 0), expected);
    start = splits[i];
  });
  assert.equal(scheme.itemPoints.reduce((a, b) => a + b, 0), 100);
  return true;
}
function newExamContract(year) {
  const scheme = getScheme(year);
  return { examYear:scheme.year, examPointsVersion:1, pointsByPosition:[...scheme.itemPoints] };
}
// Legacy signed sessions without a year/points snapshot MUST retain 2026 scoring.
// Partial new metadata or a mismatched points snapshot is rejected, not coerced.
function pointsForSession(session) {
  if (!session || typeof session !== 'object' || Array.isArray(session)) throw new TypeError('invalid session');
  const fields = ['examYear','examPointsVersion','pointsByPosition'];
  const present = fields.map(key => Object.hasOwn(session, key));
  if (present.every(v => !v)) return YEAR_SCHEMES['2026'].itemPoints;
  if (!present.every(Boolean) || session.examPointsVersion !== 1) throw new Error('invalid year-specific exam metadata');
  const expected = getScheme(session.examYear).itemPoints;
  if (!Array.isArray(session.pointsByPosition) || session.pointsByPosition.length !== 15 ||
      expected.some((weight, index) => session.pointsByPosition[index] !== weight)) throw new Error('unrecognized exam weights');
  return expected;
}
function scoreExam(session) {
  const weights = pointsForSession(session);
  if (!Array.isArray(session.ids) || session.ids.length !== 15 ||
      new Set(session.ids).size !== 15 || !session.scores || typeof session.scores !== 'object' || Array.isArray(session.scores)) {
    throw new TypeError('invalid exam items');
  }
  let rawTotal = 0;
  const items = session.ids.map((id, index) => {
    const entry = session.scores[id];
    const ratio = entry === undefined ? 0 : entry.ratio;
    if (!Number.isFinite(ratio) || ratio < 0 || ratio > 1) throw new RangeError('invalid score ratio');
    const raw = ratio * weights[index];
    rawTotal += raw;
    return {id, points:weights[index], earned:Math.round(raw), rawEarned:raw, unanswered:entry === undefined};
  });
  // Preserve the current controller's overall Math.round(sum), not a sum
  // of individually rounded scores (which can produce a different total).
  const points = Math.round(rawTotal);
  return {examYear:session.examYear || '2026', points, passed:points >= 70,
    unansweredCount:items.filter(item => item.unanswered).length, items,
    displayRoundingDelta:points-items.reduce((sum, item) => sum+item.earned, 0)};
}
module.exports = Object.freeze({YEAR_SCHEMES,getScheme,verifyScheme,newExamContract,pointsForSession,scoreExam});
