'use strict';
// Release244: atomic exam progress start/retry and shared annual profile guard only.
const assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process'),crypto=require('node:crypto');
const BASE='130919ecedc0fc72fa6402893763e7859f87dd4b',GEN='reports/auto-gate/audit-locks/phase-b-generation-208.json';
const expected=Object.freeze({
  ".github/visual/run-content-progress-migration.js": "04f24b54451d24e448c4b81a8466ffa1046fb25bb8216083584fc7f7fcec6ff4",
  ".github/workflows/question-quality-ledger-audit.yml": "128743b32c9579b9b1fc2fb2d0c4e3b568e47990d2a5650b3a863501079e80cb",
  "form-a.html": "b9ffad96831f730c9ce561b1e3ad00aab7fcec738da9ce614ca7d1b17af8745f",
  "index.html": "155d09ddd4937f9e828eac9b3026c61c394579bd3c45f5fa71955380d848b1e3",
  "js/controller.js": "e50d7341bdb2523acbd3eca2a098901ffbcc664fbe7a58af0a0628b4b4246918",
  "js/model.js": "0b36c00dc180f70af0627c9b4de44a386874114541fc3c2c56f89e4a30ee6958",
  "package.json": "120ad69365fe1e42f1265f296427acdc08a13bf17d598f63ec8309173d04d664",
  "pwa-release-manifest.json": "bd2decb9fe714a4fc4cc37589ffc5bd593800e4349b8a55ae01322bef16d76de",
  "service-worker.js": "92d73e72a52574732b494061faa4179683c0b03fe2acf13bc8ac1013db19c328",
  "tests/app.test.js": "8d0dfeef69539ac650e9b1d23c538f875a4262fa1aa696753c0d9d470f1a5192",
  "tests/audit-matrix.test.js": "551e6309ee159d6ffd82f9d73242bd161a4215b68e24d6bab4fd844012e29e3d",
  "tests/editorial-review-230.test.js": "43c0fd41d03a747a44de1a5d20ebc8c63c97fb5d454dbe465694163455c4285a",
  "tests/editorial-review-232.test.js": "b27a90ee62b7ab0be5d98b86cf0a145d05e20d0f88d98dd70e1c7df20a6e281b",
  "tests/editorial-review-233.test.js": "9080dfd5214f773885e80a8e02f758eaf6217f167bfa117ff4b265a1d579ab28",
  "tests/editorial-review-234.test.js": "351009537795d15e4ddf2d1a83af823fc2ba1108f251214237de5b157b8a7845",
  "tests/issue161-inventory.test.js": "002f584a46b0a9a4deff48c911d79646ff4fae5217fbd134f81bf0f7bcd92918",
  "tests/issue259-exam-start-transaction.test.cjs": "bdff8ad9dfc1dfbfda74a068cd17f5482bf355cb4df8c68b5daed7f69e295055",
  "tests/issue259-fy2026-profile-guard.test.js": "641652879e5b476c58125efd43f3372791e4dae807d4bc8ec6f972227a8a8d69",
  "tests/issue259-score-breakdown.test.js": "8d04a5a94254b36d97166ba0a8a7df3b6c61eb1428a3bde687e22e45db3bc410",
  "tests/l039-explanation.test.js": "51407cd7ff150de0bd391665083fd81ba989535db67d29b8ff3482d7a07e3665",
  "tests/learning-effectiveness-integration.test.js": "3689fbb0d885ab621047ec8248af4173140c1e84f39e15e0a7f1e27ac20f1851",
  "tests/ledger-opening-migration.test.js": "ffd13499997b8cd737d2b3a0a7637ef8336299423259aaa641265a821399f967",
  "tests/user-facing-copy-contract.test.js": "8abe1e512d690d517c5e2f87c6e965870104834c56a4f8943c9caeb612b11ea3"
});
const git=(...a)=>cp.execFileSync('git',a,{encoding:'utf8',maxBuffer:32*1024*1024}).trim();
assert.equal(cp.spawnSync('git',['merge-base','--is-ancestor',BASE,'HEAD']).status,0);
const changed=git('diff','--name-only',BASE).split('\n').filter(Boolean),untracked=git('ls-files','--others','--exclude-standard').split('\n').filter(p=>p&&!['node_modules/','artifacts/','historical-quality/','reports/baseline-current/'].some(prefix=>p.startsWith(prefix)));
assert.deepEqual([...new Set([...changed,...untracked])].sort(),[...Object.keys(expected),GEN,'scripts/validate-exam-start-successor-244.cjs'].sort(),'exact Release244 scope');
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
for(const [p,h] of Object.entries(expected))assert.equal(sha(p),h,p+' exact successor content');
const m=JSON.parse(fs.readFileSync('pwa-release-manifest.json','utf8'));assert.equal(m.release,'20261126-244');assert.equal(m.previousRelease,'20261126-243');for(const k of ['assets','pages'])for(const [p,h] of Object.entries(m[k]))assert.equal(sha(p),h,p+' manifest hash');
const gen=JSON.parse(fs.readFileSync(GEN,'utf8'));assert.equal(gen.generation,208);assert.equal(gen.predecessor.generation,207);
const l=require('./qa/phase-b-lifecycle'),committed=cp.spawnSync('git',['cat-file','-e','HEAD:'+GEN]).status===0;
const check=committed?l.verifyCurrent():l.verifyCandidate(gen);assert(check.ok,check.errors.join('; '));
cp.execFileSync(process.execPath,['tests/issue259-exam-start-transaction.test.cjs'],{stdio:'inherit'});
console.log('RELEASE244_GEN208_EXAM_START_TRANSACTION_PASS');
