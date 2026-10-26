# iPhone から年間ランニング統計を同期する

この手順では、既存の Actions **Find Workout** を使い、年間距離と年間時間だけを送信します。送信先は `https://running-readme-api.amtt.workers.dev/v1/stats` です。

検証範囲を先にご確認ください。公式ドキュメントと、開発元が配布する Actions 4.0.1 の AppIntent メタデータで、以下の英語アクション名・プロパティ型を確認しています。年境界の JavaScript はローカルテスト済みです。利用者様の iPhone、インストール済み Actions のバージョン、単位変換、初回同期、22:00 の実行は未検証です。最初は既知の 1 件と比較してから自動化してください。

## 1. トークンを一度だけ Keychain に保存する

トークンの値を、この文書、GitHub、チャット、共有ショートカット本文に貼り付けないでください。

1. クリップボード履歴を保存するアプリを使用している場合は、この操作中は履歴保存を停止してください。Mac と iPhone を近くに置いてください。同じ Apple Account、Wi-Fi、Bluetooth、Handoff が必要です。[Apple のユニバーサルクリップボード手順](https://support.apple.com/en-us/102430)をご参照ください。
2. Mac のターミナルで次を実行してください。ファイル内容は画面に表示されず、クリップボードへ入ります。


   ```

3. iPhone の「ショートカット」で「+」を押し、`Set Running README Token` というショートカットを作成してください。
4. 「入力を要求」を追加してください。入力の種類を「テキスト」、質問を `Running README token` にしてください。デフォルト回答には何も入れません。
5. Actions の **Keychain: Set** を追加してください。**Key** を `running-readme.ingest-token` にします。**Value** は固定文字列ではなく、直前の「入力を要求」のマジック変数にしてください。**Sync to iCloud** はオフにします。これは端末内保存です。
6. このショートカットを手動で実行してください。入力画面へトークンだけをペーストしてください。末尾の改行や空白を取り除き、64文字の英数字であることを確認してください。`Bearer ` は付けません。
7. 保存が完了したら、Mac で `printf 'cleared' | pbcopy` を実行してください。iPhone でも無害な文字をコピーして、クリップボードを置き換えてください。
8. 設定用ショートカットは削除できます。後で使う同期ショートカットには、Keychain のキー名だけを保存します。

Mac のファイルは権限 `0600`、親ディレクトリは `0700` で保存され、Git 管理対象外です。紛失時の復旧・ローテーション用として私的に保管してください。この具体的なパスは今回のデプロイ端末用です。別の導入者はご自身のトークンファイルを使用してください。

## 2. 既存ショートカットを複製する

1. 現在 **Find Workout** を使っているショートカットを複製してください。
2. 複製した方の「…」でエディタを開き、名前を `Sync Running README` にしてください。
3. 自動化の設定は、初回の手動同期が成功するまで行わないでください。

Actions のアクション名は英語です。以下の `Year` などの変数名は、この手順で付ける名前です。iOS の日本語ラベルはバージョンによって異なる場合があるため、英語名も併記します。

## 3. 日本時間の年と検索期間を作る

端末のタイムゾーンにかかわらず、日本時間の年を使います。**Find Workout** の前に、次の順でアクションを追加してください。

1. 「テキスト」を追加し、`Tokyo` と入力してください。秘密情報ではありません。
2. Actions **Transform Text with JavaScript** を追加してください。**Text** は直前のテキストです。**JavaScript Code** に以下をそのまま貼り付けてください。[examples/year-window.js](../examples/year-window.js) と同じ式です。

   ```javascript
   (() => {
     const now = new Date();
     const year = new Date(now.getTime() + 9 * 60 * 60 * 1000).getUTCFullYear();
     return JSON.stringify({ year, start: `${year}-01-01T00:00:00+09:00`, now: now.toISOString() });
   })()
   ```

3. 「入力から辞書を取得」**Get Dictionary from Input** を追加してください。入力は **Transformed Text** です。この辞書を `Window` と名付けます。
4. 「辞書の値を取得」で `Window` のキー `year` を取得してください。数値として変数 `Year` に保存します。
5. 同じ `Window` からキー `start` を取得してください。続けて「入力から日付を取得」**Get Dates from Input** に渡し、日付型の変数 `YearStart` に保存します。
6. 同じ `Window` からキー `now` を取得してください。「入力から日付を取得」に渡し、日付型の変数 `Now` に保存します。

`YearStart` は当年 1 月 1 日 00:00:00 JST、`Now` は式を実行した時点です。例えば 2026 年なら、開始文字列は `2026-01-01T00:00:00+09:00` になります。日付の大小比較には、文字列ではなく変換後の日付変数を使ってください。

## 4. Running と記録元を確認する

1. 既存の Actions **Find Workout** を開いてください。
2. **Workout Type** の現在の **Stair Climbing** を **Running** に変更してください。
3. 結果数の **Limit** が表示される場合はオフにしてください。最新 1 件などに制限すると、年間集計になりません。
4. 初回だけ、結果の既知のランニング 1 件を「コンテンツを表示」**Show Content** で確認してください。マジック変数をタップし、種類を **Workout** にしてからプロパティを選びます。
5. **Source Bundle Identifier** を確認し、その文字列をローカルのテキスト変数 `ExpectedSource` に設定してください。空の場合は **Source Name** を使い、以後の比較も同じプロパティにしてください。Mi Fitness の識別子を推測で入力しないでください。
6. 同じ 1 件の **Total Distance** と **Duration** を確認してください。Health または Mi Fitness に表示される値と比較し、後述の変換後も一致することを確認します。
7. 確認後は、個別記録を表示するデバッグアクションを外してください。

確認した Actions 4.0.1 のクエリ仕様では、条件は **Workout Type** です。**Start Date** や記録元の条件を **Find Workout** 内に追加できることは確認していません。次の繰り返し内で日付と記録元を比較します。

## 5. 年間の距離と時間を集計する

初期化アクションを **Find Workout** の後に追加してください。「数字」アクションで `0` を作り、「変数を設定」で次の変数をそれぞれ初期化します。

- `DistanceMeters` は数値の `0` です。
- `DurationSeconds` は数値の `0` です。
- `SelectedCount` は数値の `0` です。
- `SeenIds` は項目をすべて取り除いた空の「リスト」です。

続けて「各項目を繰り返す」**Repeat with Each** を追加し、入力を **Find Workout** の **Workouts** にしてください。繰り返し対象が直前の `0` にならないよう、入力変数を明示します。

繰り返し内に「もし」**If** を順に入れ、次のすべてを満たす項目だけを処理してください。各プロパティは「繰り返し項目」**Repeat Item** のトークンをタップして選択します。

1. **Start Date** が `YearStart` より前の場合は、その項目を集計しません。「それ以外」の内側で次へ進みます。
2. **Start Date** が `Now` より後の場合は、その項目を集計しません。「それ以外」の内側で次へ進みます。
3. 選択した記録元プロパティが `ExpectedSource` と等しい場合だけ進みます。
4. **Identifier** が `SeenIds` に含まれている場合は集計しません。含まれていない場合は「変数に追加」で `SeenIds` に追加します。
5. **Total Distance** が「値がない」場合は、「通知を表示」で `距離がないため同期を中止しました` を表示し、「このショートカットを停止」**Stop This Shortcut** で全体を終了してください。
6. **Duration** が取得できない場合や変換できない場合も、同様に全体を終了してください。欠損を `0` に置き換えてはいけません。

この分岐では開始時刻が `YearStart` と等しい記録も含みます。集計年は **Start Date** で決めます。年をまたぐワークアウトは開始年に全距離・全時間を計上し、日付境界で分割しません。

有効な項目の分岐内で、以下を順に追加してください。

1. 「測定単位を変換」**Convert Measurement** を追加してください。入力は **Total Distance**、種類は長さ、変換先はメートルです。
2. 変換結果を「入力から数字を取得」**Get Numbers from Input** に渡してください。結果が 1 個の数値であることを初回確認し、`WorkoutMeters` に保存します。
3. 「計算」で `DistanceMeters + WorkoutMeters` を計算してください。「変数を設定」で結果を `DistanceMeters` に戻します。
4. 「測定単位を変換」を追加してください。入力は **Duration**、種類は時間、変換先は秒です。
5. 変換結果を「入力から数字を取得」に渡してください。結果が 1 個の数値であることを初回確認し、`WorkoutSeconds` に保存します。
6. 「計算」で `DurationSeconds + WorkoutSeconds` を計算し、結果を `DurationSeconds` に戻してください。
7. 「計算」で `SelectedCount + 1` を計算し、結果を `SelectedCount` に戻してください。
8. 「もし」の各分岐と繰り返しを終了してください。

**Total Distance** は省略可能な長さの測定値、**Duration** は時間の測定値です。表示が km や分でも、その数値を直接送信しないでください。**End Date − Start Date** は一時停止を含む可能性があるため、Duration の代用にしません。実機の測定値から数値への変換は未検証です。例えば既知の 5 km・30 分の実記録なら、変換後は `5000` と `1800` になることを確認してから先へ進んでください。この例を本番 API に送らないでください。

繰り返し後に「もし `SelectedCount` が `0`」を追加してください。「読み取れるランニングがありません。権限と対象年をご確認ください」と通知し、ショートカットを停止します。HealthKit は読み取り拒否を空結果として返すため、空結果を自動的に 0 km として送信しません。真にゼロの年の送信方法は後述します。

記録元の制限は、他アプリが同じ運動を別の記録として登録する問題を避けるためです。Identifier の確認は同じ Health オブジェクトの再出現だけを防ぎます。同じ記録元が異なる Identifier で重複登録した場合の自動判定はありません。初回は個別記録を端末内で確認してください。ヘルスケアの表示上のデータソース優先順位だけで、Actions の取得結果の重複が消えるとは確認できていません。

## 6. JSON を作り、認証して POST する

1. 「辞書」**Dictionary** を追加し、下記の 3 項目をすべて「数字」**Number** として作成してください。値にはマジック変数を選びます。

   | キー | 型 | 値 |
   | --- | --- | --- |
   | `year` | Number | `Year` |
   | `distanceMeters` | Number | `DistanceMeters` |
   | `durationSeconds` | Number | `DurationSeconds` |

2. 初回だけ、この辞書を「クイックルック」で確認してください。個々のワークアウトを含まず、値が数値であることを確認後、確認アクションを外します。[examples/stats.json](../examples/stats.json) は形式だけのサンプルです。
3. Actions **Keychain: Get** を追加し、**Key** を `running-readme.ingest-token` にしてください。
4. 戻り値が「値がない」場合は、トークン未設定の通知を表示し、ショートカットを停止してください。値がある場合は、テキスト型変数 `Token` に保存します。値そのものを表示しないでください。
5. 「URL」を追加し、`https://running-readme-api.amtt.workers.dev/v1/stats` を入力してください。
6. 「URLの内容を取得」**Get Contents of URL** を追加してください。詳細を展開し、方法 **Method** を **POST** にします。
7. ヘッダ **Headers** に `Authorization` を追加してください。値は、固定の `Bearer` と半角スペース 1 個、その後に `Token` のマジック変数です。トークンそのものを固定入力しないでください。
8. ヘッダ `Content-Type` を追加し、値を `application/json` にしてください。
9. 本文 **Request Body** を **JSON** にしてください。上の辞書と同じ 3 キーを追加し、すべて種類を **Number** にしてください。値はそれぞれ `Year`、`DistanceMeters`、`DurationSeconds` の変数です。辞書全体を文字列として 1 フィールドに入れないでください。
10. レスポンスを「入力から辞書を取得」に渡してください。
11. 「辞書の値を取得」で `ok` を取得してください。JSON の真偽値が真の場合だけ成功として扱います。iOS が数値に変換する場合は `1` と比較してください。文字列に `true` が含まれるかどうかで判定しません。
12. さらにレスポンスの `year`、`distanceMeters`、`durationSeconds` を取得し、送信値と一致することを確認してください。すべて一致した場合だけ `Running README の同期が完了しました` と通知します。
13. `ok` がない場合、偽の場合、値が一致しない場合は、失敗通知を表示してください。エラー辞書の `error.code` を確認し、[トラブルシューティング](ios-shortcuts-troubleshooting.md)をご参照ください。通知へ認証ヘッダを含めないでください。

正常保存は HTTP 200 と `{"ok":true,"year":…, "distanceMeters":…, "durationSeconds":…}` です。標準アクションでは HTTP ステータスを直接取り出す前提にせず、この成功用 JSON と値を確認します。通信エラーでアクション自体が停止した場合も失敗です。同じ年を再送しても上書きされるため、二重加算されません。

### HTTP ステータスも確認する場合

Actions **Get Contents of URL (Extended)** には **Status Code**、**Is Success**、**Body Text** があります。標準の送信アクションと置き換える場合は、**URL** を同じ送信先、**Method** を POST、**Body** を先の辞書から「入力からテキストを取得」で変換した JSON にします。**Headers (dictionary)** に文字列の `Content-Type: application/json` を渡し、**Bearer Token** には `Token` 変数だけを指定してください。この欄には `Bearer ` を付けません。**Timeout (seconds)** は `20`、**Follow Redirects** はオフにしてください。**Body** と **Headers (dictionary)** の欄は長押しで変数を選択できます。

この方法では送信前に、JSON 変換結果が数値 3 項目のオブジェクトであることを端末内で確認してください。HTTP レスポンス変数をタップし、**Status Code** が `200` であることを確認します。その後、**Body Text** を辞書に変換して同じ `ok` と値の確認を行います。これらのパラメータは Actions 4.0.1 の公式配布メタデータで確認済みですが、iPhone での実行は未検証です。

## 7. ロック解除した状態で初回同期する

1. iPhone のロックを解除し、Mi Fitness から Health への記録同期が済んでいることを確認してください。
2. `Sync Running README` を手動で実行してください。
3. Health のアクセス要求が出た場合は、ワークアウトの読み取りを許可してください。年間全体が読める権限を確認してください。距離の読み取りを個別に求められた場合も必要です。書き込み権限は不要です。
4. Shortcuts が通信先の許可を求めた場合は、今回の `running-readme-api.amtt.workers.dev` への送信であることを確認して許可してください。
5. 成功通知と、送信前に確認した年間合計を確認してください。
6. [JSON API](https://running-readme-api.amtt.workers.dev/v1/stats) を開いてください。距離は `distanceKm` として km で返り、時間は `durationSeconds` の秒です。
7. [ライト画像](https://running-readme-api.amtt.workers.dev/running.svg?theme=light) と[ダーク画像](https://running-readme-api.amtt.workers.dev/running.svg?theme=dark)を開いてください。時間は全秒から分未満を切り捨てた時間・分表示です。

保存直後は KV の結果整合性により古い値や未登録の応答が残る場合があります。60 秒以上待って再確認し、それでも古い場合は数分後に再確認してください。60 秒を更新完了の保証時間として扱わないでください。

## 8. 毎日 22:00 のオートメーションを設定する

初回の手動同期が成功してから設定してください。

1. 「ショートカット」から「オートメーション」を開いてください。
2. 「+」から新しいパーソナルオートメーションを作成し、「時刻」を選択してください。
3. 時刻を `22:00`、繰り返しを「毎日」にしてください。
4. 確認なしで実行する設定を選択してください。Apple の iOS 26 ガイドは「実行の前に尋ねる」をオフにし、「尋ねない」で確定する手順です。インストール済み iOS が「すぐに実行」を表示する場合はそちらを選択してください。この画面差は実機では未確認です。
5. 次へ進み、`Sync Running README` を指定してください。「ショートカットを実行」**Run Shortcut** を追加する画面の場合は、そのアクションから同じショートカットを選択してください。
6. 完了して保存してください。動作確認中は実行通知を有効にしておくと、結果を確認できます。
7. 一度だけ数分後の時刻に変更し、ロック解除中に実行されることを確認してください。その後 `22:00` に戻してください。
8. 普段のロック状態でも検証し、成功通知と JSON の値を確認してください。失敗した場合はロック解除後に手動で再実行してください。

「時刻」オートメーションに、固定タイムゾーンの設定があることは確認できていません。22:00 JST の運用は iPhone の時計が日本時間であることを前提にします。旅行などで端末のタイムゾーンを変更した場合は実行時刻も確認してください。集計年自体は前述の式で日本時間になります。

Health データのロック保護は、確認なしの自動実行設定では解除されません。ロック中の読み取り、バックグラウンド実行、通信成功を保証していません。22:00 に失敗しても、以前の統計を削除する処理はありません。ロック解除後の再実行で年間全件を上書き同期できます。

## 9. 本当に 0 件の年を送信する

Health の年間表示と読み取り権限を手動確認し、対象年の Running が本当にゼロと分かった場合だけ実施してください。

1. 同期ショートカットを複製し、`Confirm Empty Running Year` と名付けてください。
2. 年の算出と Keychain 読み取り、POST、成功判定を残してください。
3. Workout の検索・繰り返し・0 件時の停止を取り除き、`DistanceMeters` と `DurationSeconds` を数値の `0` にしてください。
4. ロック解除中に手動で 1 回実行し、API で `0` が登録されたことを確認してください。
5. このゼロ送信用ショートカットにはオートメーションを設定しないでください。

API はゼロを有効な値として受け付けます。日次処理の空結果を停止させるのは、Health の読み取り権限が失われた場合に、既存の年間統計をゼロで上書きしないためです。

## 参照した一次情報と未検証項目

- [Actions 公式サイト](https://sindresorhus.com/actions)と、そこから配布される 4.0.1 macOS アプリ内の `Metadata.appintents/extract.actionsdata` を確認しました。iOS 専用 Workout の型情報も含まれています。**Keychain: Set** の **Key**、**Value**、**Sync to iCloud** と、**Keychain: Get** の **Key** を確認しています。
- [Actions 公式詳細リファレンス](https://gist.githubusercontent.com/sindresorhus/fbba65a774fb9da915e624807a02a6d2/raw/actions.md)で、JavaScript 変換が JavaScriptCore を使うことを確認しています。このリファレンスには Find Workout と Keychain の詳細がまだありません。
- [Apple の変数調整手順](https://support.apple.com/ja-jp/guide/shortcuts/apda36b9018b/9.0/ios/26)と[最初の API リクエスト](https://support.apple.com/ja-jp/guide/shortcuts/apd58d46713f/9.0/ios/26)を参照しました。
- [Apple の時刻トリガー](https://support.apple.com/ja-jp/guide/shortcuts/apd932ff833f/9.0/ios/26)と[確認なしの実行設定](https://support.apple.com/ja-jp/guide/shortcuts/apd602971e63/9.0/ios/26)を参照しました。
- [Apple の Health 読み取り権限](https://developer.apple.com/documentation/healthkit/authorizing-access-to-health-data)と[Health データの保護](https://support.apple.com/en-au/guide/security/sec88be9900f/web)を確認しました。
- 利用者様の iPhone へのアクセスはありません。実際の Health 集計、単位変換、Keychain 操作、初回送信、自動化は利用者様の確認が必要です。
- [Apple の署名手順](https://support.apple.com/en-gb/guide/shortcuts-mac/apd455c82f02/mac)では共有用ショートカットの署名を説明しています。今回、正規の iOS アクション構成をインポートして実機確認できないため、`.shortcut` ファイルと iCloud 共有リンクは提供していません。
