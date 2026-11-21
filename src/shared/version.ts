/** ビルド時に package.json の version が埋め込まれる。 */
export const APP_VERSION: string = __APP_VERSION__;

/** "1.2.3" を "v1.2.3" にする。すでに v が付いていればそのまま返す。 */
export function formatVersionLabel(version: string): string {
  return version.startsWith('v') ? version : `v${version}`;
}
