// GAS の外から呼べる入口の一覧（docs/to-be/design.md §3.3）。名前と種類の組で、ここだけに書く。
// 種類: webapp、api、admin、simpleTrigger、ownerButton、ownerMenu、installedTrigger。
// 末尾 _ は ownerMenu と installedTrigger にだけ付ける。決まりは scripts/gas-entries.mjs で確かめる。
// src/server/main.ts の export と同じ名前にする。esbuild の包み OUCA_ だけが一覧の外。
export const GAS_ENTRIES = [{ name: 'doGet', kind: 'webapp' }];
