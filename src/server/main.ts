import { APP_VERSION, formatVersionLabel } from '../shared/version';

// 外から呼べる関数をここに足したら、scripts/gas-globals.mjs の一覧と
// test/gas-globals.test.ts の期待する一覧も変える。補助の関数は末尾に _ を付ける。

export function doGet(_e?: GoogleAppsScript.Events.DoGet): GoogleAppsScript.HTML.HtmlOutput {
  // createTemplateFromFile は使わない（docs/to-be/design.md §4.2）
  return HtmlService.createHtmlOutputFromFile('index').setTitle(
    `OUCA ${formatVersionLabel(APP_VERSION)}`,
  );
}
