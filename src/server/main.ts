import { APP_VERSION, formatVersionLabel } from '../shared/version';

// 外から呼べる関数（入口）をここで export したら、scripts/gas-globals.mjs の一覧（名前と種類の組）にも足す。
// 補助の関数は export しない。末尾 _ は ownerMenu と installedTrigger の入口にだけ付ける（docs/to-be/design.md §3.3）。

export function doGet(_e?: GoogleAppsScript.Events.DoGet): GoogleAppsScript.HTML.HtmlOutput {
  // createTemplateFromFile は使わない（docs/to-be/design.md §4.2）
  return HtmlService.createHtmlOutputFromFile('index').setTitle(
    `OUCA ${formatVersionLabel(APP_VERSION)}`,
  );
}
