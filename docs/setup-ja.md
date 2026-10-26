# セットアップと引き継ぎ

この利用者向けの公開先は次のとおりです。

- GitHubリポジトリ: https://github.com/nematatu/running-readme
- Worker: https://running-readme-api.amtt.workers.dev
- 公開統計: https://running-readme-api.amtt.workers.dev/v1/stats
- 公開直近5件: https://running-readme-api.amtt.workers.dev/v1/workouts
- カード: https://running-readme-api.amtt.workers.dev/running.svg

このデプロイを利用する場合、GitHubリポジトリ作成、KV作成、Secret登録、Cloudflareデプロイのやり直しは不要です。iPhoneの設定を[テキスト送信の操作手順書](ios-text-upload.md)に従って進めてください。未登録のカードは `Not synced` と表示されます。

## トークンを取り出す

本番更新トークンは、このMac上の次のファイルだけに保存されています。Gitには含めていません。

```text
/Users/nematatu/src/github.com/nematatu/running-readme/.secrets/ingest-token.txt
```

親ディレクトリは権限700、ファイルは600です。値をターミナルへ表示する必要はありません。iPhoneへの移送とKeychainへの登録は[初期設定](ios-shortcuts.md)を参照してください。トークンをREADME、共有ショートカット、問い合わせ、スクリーンショットへ貼り付けないでください。

## 別の利用者が自分の環境へ導入する

1. READMEの `Deploy your own instance` のコマンドで取得・テストします。
2. `npx wrangler whoami` で自分のCloudflareアカウントを確認します。
3. `npx wrangler kv namespace create RUNNING_STATS` で新しいKVを作ります。
4. `wrangler.jsonc` の `kv_namespaces[0].id` を自分のKV IDに置き換えます。Worker名が既に存在する場合は内容を確認してから別名を使ってください。
5. READMEの手順でランダムトークンを生成し、`wrangler secret put INGEST_TOKEN` に標準入力で渡します。
6. `npm run deploy` を実行します。
7. 表示された本番URLを使い、`npm run smoke -- https://自分のWorkerのURL` を実行します。
8. READMEの画像URLとiPhoneショートカットの送信URLを自分のURLに変えます。

Macの常時起動、GitHub Actionsでの毎日のコミット、Worker側の定期ジョブは不要です。毎日の送信はiPhoneが行います。実行の制限と失敗時の再同期は[トラブルシューティング](ios-shortcuts-troubleshooting.md)に記載しています。

## トークンを変更する

新しいトークンを別の権限600ファイルへ生成し、次のコマンドでSecretを置き換えます。値をコマンドの引数へ直接書かないでください。

```sh
npx wrangler secret put INGEST_TOKEN < .secrets/new-ingest-token.txt
```

Secret更新後はiPhoneのKeychainにも新しい値を登録し、初回同期をもう一度行います。更新前のトークンでは送信できなくなります。不要になった旧ファイルは所有者の判断で削除してください。ファイルがバックアップやクリップボード履歴に残る可能性もあるため、漏えい時はファイル削除だけでなくSecret自体を変更してください。
