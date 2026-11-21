// GAS の外から呼べるトップレベル関数の一覧（docs/to-be/design.md §3.3）。
// esbuild の出力に、この一覧のぶんだけ function 宣言を生成する。
// src/server/main.ts の export と同じ名前にする。
export const GAS_GLOBAL_FUNCTIONS = ['doGet'];
