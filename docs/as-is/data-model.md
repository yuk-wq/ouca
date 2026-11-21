# 【現行】データモデル

> 【現行】作り直す前の現行サイトについての文書。新しい設計は `docs/to-be/` を見る。

対象は渡された版（`_work/raw/provided_index.html`）と、2026-11-21 時点の公開中の `getMenuData`。
【推測】の印がない項目は、実データかコードで確かめた内容。

## 1. 全体の流れ

```mermaid
flowchart LR
  subgraph Sheet["スプレッドシート【推測】"]
    S1["メニュー設定タブ<br/>豆の行 + 設定値"]
    S2["注文記録タブ"]
  end
  subgraph GAS["GAS サーバー"]
    G1["getMenuData()"]
    G2["submitOrder(payload)"]
  end
  subgraph Browser["スマホの画面（index.html）"]
    B1["MENU<br/>（読み込んだメニュー）"]
    B2["画面の状態<br/>qty / delivery / 絞り込み"]
  end
  S1 --> G1 -->|"MENU（JSON）"| B1
  B1 --> B2
  B2 -->|"注文内容"| G2 --> S2
  G2 -->|"{ total, grams }"| Browser
```

## 2. メニュー（getMenuData の戻り値）

```mermaid
erDiagram
  MENU ||--o{ CATEGORY : cats
  MENU ||--o{ ITEM : items
  CATEGORY ||--o{ ITEM : "cat の文字列が一致"

  MENU {
    int shipping "送料 300"
    int maxGrams "合計上限 450"
    int maxTypes "種類数上限 3"
    int minGrams "1種類の最小 100"
    int step "刻み 50"
    string notice "お知らせ。空なら非表示"
  }
  CATEGORY {
    string cat "STANDARD など。表示順もこの配列順"
    int price "100g の価格。見出しに出すだけ"
  }
  ITEM {
    int order "表示順。現在 6 が欠番"
    string cat "所属カテゴリ名"
    string name "豆の名前。注文時の識別子も兼ねる"
    int price "100g の価格。金額計算はこちら"
    string emoji "カードの絵文字"
    bool isNew "NEW バッジ"
    string tags "味の短い説明。表示用の自由文"
    string desc "詳細の説明文"
    int roast "焙煎度 1-7（浅→深）"
    int sweet "甘味 1-5"
    int acid "酸味 1-5"
    int body "コク 1-5"
    int aroma "香り 1-5"
    string_array families "味わいの分類。渡された版だけが使う。未提供"
  }
```

- カテゴリと豆の結び付きは、ID ではなくカテゴリ名の文字列の一致
- デカフェの判定は「カテゴリ名が `DECAF` で始まるか」
- 現在のデータ（8件）は `_work/raw/getMenuData_2026-11-21.json`

### families とは

渡された版で追加された、豆の「味わいの分類」。1つの豆に複数付けられる文字列の配列。

| 項目 | 中身 | 用途 | 現状 |
|---|---|---|---|
| `tags` | 「柑橘・爽やか・甘い余韻」のような自由文1つ | カードに表示 | 提供あり |
| `sweet` 〜 `aroma` | 甘味・酸味・コク・香りの強さ（1〜5） | 詳細の豆アイコン、「強さ」の絞り込み | 提供あり |
| `families` | 分類名の配列（【推測】例 `["フルーティー", "柑橘"]`） | 「味わい」の絞り込みボタン | **未提供** |

- 画面は全豆の `families` から重複を除いた値を集め、その数だけ「味わい」行にボタンを作る。ボタンの種類と並び順はデータ次第で、画面側に候補の一覧はない
- 絞り込みは「選んだ分類がその豆の `families` に含まれるか」で判定する
- `families` がないと「味わい」行は「すべて」だけになる。実際の値の候補は開発者に確認する（`docs/as-is/requests-to-developer.md`）

## 3. 画面の状態（ブラウザ内だけ、保存しない）

```mermaid
flowchart TB
  qty["qty<br/>{ 豆の名前: グラム }"]
  delivery["delivery<br/>'hand' | 'post'"]
  filters["絞り込み<br/>filterRoast: all/light/mid/dark<br/>filterFamily: all/分類名<br/>filterBalance: all/sweet/acid/body/aroma<br/>filterDecaf: true/false"]
  ui["表示用<br/>openMap（詳細の開閉）<br/>blocked（上限エラーの一時表示）<br/>panelOpen（絞り込みの開閉）"]
  totals["totals()<br/>k 種類数 / g 合計グラム / t 豆代"]
  ship["送料<br/>post かつ t>0 なら shipping"]
  qty --> totals
  totals --> bar["固定バー・注文フォームの表示"]
  delivery --> ship --> bar
```

- 豆代 t = Σ（グラム ÷ 100 × `items[].price`）
- 量の選択肢 = `minGrams` から 300（直書き）まで `step` 刻み

## 4. 注文（submitOrder）

```mermaid
sequenceDiagram
  participant U as 画面
  participant G as submitOrder
  participant S as 注文記録タブ【推測】
  U->>G: { name, delivery, note, items: [{ name, grams }] }
  G->>S: 1行追加【推測】
  G-->>U: { total, grams }
  Note over U: 完了表示に total と grams を出す
  Note over G: 送料を total に含むか、上限を検証するかは未確認
```

- 価格は送らず、サーバーが豆の名前から引き直す【推測】
- 名前（LINE の名前）以外の連絡先と住所は取らない。確認は LINE で行う

## 5. スプレッドシート【推測】

```mermaid
erDiagram
  MENU_SETTING_ROW {
    int order "表示順"
    string category
    string emoji
    string name
    bool isNew
    string tags
    string desc
    int roast
    int sweet
    int acid
    int body
    int aroma
    string families "区切り文字で複数？"
    bool visible "非表示の豆は返さない"
  }
  ORDER_ROW {
    datetime received_at
    string name
    string delivery
    string note
    string items "豆と量"
    int grams
    int total
  }
```

設定値（カテゴリ価格、送料、上限、刻み、お知らせ）は同じタブの別の欄か、別のタブにあると見られる。
