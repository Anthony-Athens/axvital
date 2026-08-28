// Webpack loads this development-only loader as CommonJS.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ts = require("typescript");
module.exports = function (source) { return ts.transpileModule(source, { fileName: this.resourcePath, compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText; };
