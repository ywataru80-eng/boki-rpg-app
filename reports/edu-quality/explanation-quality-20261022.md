# 全300問の解説品質改善 — Release218候補

## 範囲と正本

RPG-ONLY。開始mainは `be673ac30d110cac22257c989ca6f53b2977e842`、TREEは `2bd922f8e210a96d16b1e873dac0d601ebf1f7f4`。作業ブランチは `fix/explanation-quality-20261022`。Issue #153/#177/#226とOpen PRを確認し、[writer宣言](https://github.com/ywataru80-eng/boki-rpg-app/issues/226#issuecomment-6326402953)を記録した。製品コードのwriterは主担当Codexのみ。読み取り分担は利用上限で停止したため、独立した別担当による完了レビューとは扱わない。

問題データ300問を全面置換していない。`data/questions.js`、正答、採点、content identity、保存・復習・習熟・RPG・入力契約は変更しない。公開更新に備えたRelease218 / Generation162の候補を追加し、Generation1〜161の既存バイトを保護する。マージ・公開は本作業に含まない。

## A. 変更内容

| ファイル・関数 | 変更と理由 |
|---|---|
| `js/feedback.js` — `transactionReason`, `directionReason`, `diagnoseJournal` | 現金過不足、累計額、引当金、損益、利益剰余金の取引別理由。同一科目が両側にある仕訳の金額誤り・記入漏れを貸借逆転と誤診しない。引当金繰入費用を資産控除と混同しない。 |
| 同 — `cellSemanticType`, `formatValue`, `humanLabel`, `diagnoseTable`, `derivation` | 金額・単価・数量・年・月・元丁を区別。日付等を含む任意の数値の部分和から「計算根拠」を捏造する探索を削除。 |
| `js/explanation-model.js` — `calculations`, `transfer`, `checks`, `learnerStrategy`, `journalDecision`, `applyPedagogy` | 単位と転記先、取引別理由、訂正・現金損益の著者の説明を実画面へ反映。元帳逆算、FIFO数量・金額照合、試算表の資料列別集計、実際の解答形式に合う手順。 |
| `js/explanation-formulas.js` — `authored`, `journal`, `correction`, `exam3` | 未完の式の第1項を答えとみなさない。取得付随費用、給与控除、元利返済、旅費精算、社会保険料、売却損益、訂正差額、税込現金受取の式。 |
| `js/view.js` — `comparisonValue`, `explanationTeachingProfile`, `renderStructuredExplanation`, `renderExplanation` | 意味型に応じた表示。主説明と補足の重複見出しを区別。計算問題を精算表と呼ぶ補足も解消。 |
| Release関連4ファイル | `index.html` / `form-a.html` / `service-worker.js`は参照番号のみ、manifestは後継番号と実バイトのハッシュ。 |
| テスト・検証スクリプト・workflow・本報告 | 再発防止、資料独立検算、実DOM収集、歴史証拠と今回の後継契約を分けた検証。 |

すべて共通の生成・表示経路の修正。特定形式・取引に限定した分岐はあるが、300問の著者解説や正答を書き換えていない。影響IDは[問題別台帳](explanation-quality-20261022.json)の `changeGroups` / `records` に列挙する。

代表的な前後差分：

- J017：抽象的な「特殊勘定の増加・減少を取引の目的に沿って処理」から、「実際有高に合わせて現金を貸方で減らす。不足額は原因判明まで現金過不足の借方に仮記入」へ。
- J022：累計額が通常貸方残高を持つことと、売却による取り消しは借方である理由を表示。`300,000 − 180,000 = 120,000`、`120,000 − 100,000 = 20,000`を提示。
- L004：単価 `1,200円` → `1,200円／個`。L025：使用月数 `6円` → `6か月`。L049：「移動平均単価の金額」→単価として案内。
- L001：既存の `305,000 + 53,000 = 358,000`、`358,000 − 26,500 = 331,500` は維持。逆算 `331,500 + 26,500 − 53,000 = 305,000` を追加。既存計算が欠落していたとは報告しない。
- E004：既存の売掛金回収なのに売上を二重計上した点を説明する著者の理由が画面に届くようにした。
- D002〜D018：精算表への振分け案内から、期間配分・償却条件・計算欄への記入と逆算へ。

「払出単価内訳円」という完全一致の文字列は開始mainの実DOMでは再現しなかった。実際に再現した単価・月数の単位誤表示を修正した。件数は問題数で集計し、同じ文の正誤答・補足への反復を修正件数として水増ししない。

## B. 教材校閲と実表示

問題別台帳は `generation`（生成）、`mechanical`（機械検査）、`editorial`（校閲）を別々に記録する。監査範囲は仕訳150、帳簿50、試算表40、訂正20、決算整理20、財務諸表10、総合10の計300問。

校閲方法はCodexによる主説明・計算・転記理由・補足・誤答文の読み取り。同じ文章は文型単位で校閲を共有し、各IDの条件・数値・科目・貸借・転記先は問題別モデル、既存source-derived oracle、新規独立算術と対応付けて確認した。すべての数値違いの文章を人間が別々に読んだという意味ではない。AI校閲済み300、未校閲0、人間の専門家による監修0。教育効果の実証はしていない。

実ブラウザはChromium・390×844・新規ローカルHTTP origin。`GradingEngine.grade` と実際の `AppView.result` を呼び、正解・誤答の初期表示と全補足展開後を別々に取得した。画面遷移の全クリック操作を網羅するテストではない。正誤600ケースに科目違い、貸借逆転、記入漏れ、複合仕訳部分誤り、単価・月数・元丁、決算計算の境界66ケースを加え、合計666ケースを確認。

資料は次のgzip JSONで全文保存する。標準の `gzip -dc <file>` で展開できる。台帳にファイルハッシュ、各ケースの初期/展開後テキストハッシュとソースハッシュを収録。抽出時の `head` はコミット前の親HEADであり、候補の実バイトは `sources` が識別する。

- [開始mainの実DOM](explanation-quality-20261022-render-baseline.json.gz)
- [最終候補の実DOM](explanation-quality-20261022-render-final.json.gz)
- [問題別校閲・変更台帳](explanation-quality-20261022.json)

J017/J022/L004/L033/D019/C001の縦画面スクリーンショットも主担当が確認。ブラウザのエラー・ページ全体の横はみ出し・問題オブジェクト/保存データ変更・採点結果の食い違いを検査する。実機iPhone・Safariは未検証。任意の全入力組合せは網羅しない。

## C. 会計検算

新規の独立実装 `scripts/check-explanation-accounting.py` は149問・348計算項目、一致348、不一致0。`derive()`へ渡すのは問題文・資料・表・整理事項のみで、正答・著者解説・アプリの計算関数は渡さない。計算後に初めて正答と比較する。条件・式・算出値・正答値・一致判定を[検算明細](explanation-quality-20261022-accounting.json.gz)へ収録した。

減価償却、貸倒引当金、消費税、固定資産売却、給与控除、売上原価、FIFO・移動平均、経過勘定、試算表・精算表・総合問題を対象とする。新しい算術実装を追加していない151問は台帳の `newArithmeticNotAdded` に明記。直接転記・選択・定性的な仕訳のほか、L039等の既存source-derived oracleを再利用した計算も含むため、「151問すべて計算不要」とは扱わない。

既存300問のsource-derived oracle・入力改変検知・資料感応性の回帰も維持。これは新規149問とは別の証拠であり、新規独立検算300問と水増ししない。画面の貸借一致は整合性確認であって正答の十分条件ではない。D001等の答え欄の列合計と、検証スクリプトの資料からの独立計算を区別する。

## D. 回帰・履歴保護

最終製品コード・テスト・証拠ファイルを対象に、`npm run verify` は終了コード0でPASS（`verify-commit.log`）。`npm run qa:test` も終了コード0でPASS。後者は最後の見出し・診断ラベル調整前に実行しており、その後の製品変更には全体verifyと最新Generation162の `npm run qa:integrity` を再実行しPASSした。会計検算・666ケースのブラウザ検査もPASS。サービスワーカー制御下でネットワークを遮断して再読込し、300問と新しい単価表示が動作することも確認した。

実行コマンド：

```sh
PATH="/workspace/boki-quality-tools/node_modules/.bin:$PATH" npm run verify
npm run qa:test
npm run qa:integrity
python3 scripts/check-explanation-accounting.py
node tests/explanation-quality.browser.cjs /workspace/boki-explanation-quality/render-final.json
```

ローカルはNode24.19、TypeScript5.9.3、システムChromiumと環境提供Playwright。TypeScriptはリポジトリ外にインストールし、依存関係を製品へ追加していない。GitHub CIのNode20と区別する。

Release217の旧validatorは説明ファイル4件の完全同一性を要求するため、説明変更後の現在ファイルへ直接適用するものではない。旧validator・旧レポートのバイトとアサーションは維持し、固定mainを一時展開して旧監査を実行。その後、`scripts/validate-explanation-successor.cjs` が今回の狭い変更許可、対象外の不変、300問とcontent identity不変、6件の保護破壊negativeを検証する。旧検証を除外したり、失敗を無視したりしない。

## E. GitHubと残件

PRの最終HEAD・URL・CIはPR本文と最終作業報告へ記録する。mainは未マージ、公開元も更新しない。確認時点ではmainの `protected=false`、rulesetは0件。運用指示をサーバー側の強制保護と表現せず、管理設定も変更しない。

既存の回答前カテゴリ露出・J103開示はIssue #226の別作業として保留。今回の結果表示修正に混在させない。実機確認と学習者による教育効果確認は残件であり、本PRの自動監査PASSから推定しない。

### ローカル実行ログの同一性

ローカルの検証ログは `/workspace/boki-explanation-quality/` に保存。以下はコミット前の実行結果であり、GitHub CI結果とは区別する。

| ログ | SHA-256 | 結果 |
|---|---|---|
| `verify-commit.log` | `492cef062564f369397ef212e156faa313ffe5b30b17201727bd214f76e708bb` | PASS |
| `qa-test.log` | `ad2e4212f26629aab959dd68ca24b5c1bc12c2fe9992643785d981b9666d1d95` | PASS |
| `qa-integrity-final.log` | `1288751f2b6fc03e769b7f22e75f873bed1ac6d52ec708efd7dbdd1aadb46497` | PASS |
| `final-pipeline.log` | `891b9119a01cab957750c55f9fac2a42c5afc71f3fd8a48dc6da352e7d8f90be` | PASS |

### CI専用ブラウザ検証の追補

旧い「この問題では…に記録します」と単価「円」、D002の精算表見出しを固定したCI期待を、今回の具体的な処理理由・意味型単位・計算形式に更新。科目定義、貸借、金額、表構造のassertionを保持し、取引別の理由・旧抽象文の禁止・見出し重複禁止を追加した。製品コードと300問のDOM証拠は変更していない。

追補のローカル確認：既存ハーネスを隔離worktreeでシステムChromiumに接続し、解説integration 100ケース、P1 285ケースがPASS。Form Aは16ケースとPWA更新・旧タブ・オフラインもPASS。WebKitはローカル配信先403のため、このローカル実行には含めていない。ハーネス変更後の `npm run verify` は終了コード0（`verify-ci-harness.log`）。CI初回のForm A失敗は別に追跡し、ローカルPASSをその解消証拠にはしていない。
