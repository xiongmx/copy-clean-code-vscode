const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');

let callback;
let clipboard = '原有剪贴板';
let clipboardShouldFail = false;
const notifications = [];
class Position { constructor(line, character) { this.line = line; this.character = character; } }
class Range { constructor(start, end) { this.start = start; this.end = end; } }
const vscode = {
  Position, Range,
  ProgressLocation: { Window: 10 },
  commands: { registerCommand(id, fn) { assert.equal(id, 'copyCleanCode.copy'); callback = fn; return { dispose() {} }; } },
  env: { clipboard: { async writeText(text) { if (clipboardShouldFail) throw new Error('模拟剪贴板故障'); clipboard = text; } } },
  window: {
    activeTextEditor: undefined,
    showInformationMessage: text => notifications.push(text),
    showWarningMessage: text => notifications.push(text),
    showErrorMessage: text => notifications.push(text),
    setStatusBarMessage: text => notifications.push(text),
    withProgress: async (_, task) => task()
  }
};
const originalLoad = Module._load;
Module._load = function (id, parent, main) { return id === 'vscode' ? vscode : originalLoad.call(this, id, parent, main); };
const extension = require(path.resolve(__dirname, '../dist/extension.cjs'));
Module._load = originalLoad;
extension.activate({ subscriptions: [] });

function open(text, languageId, start, end) {
  const offset = p => {
    const lines = text.split('\n');
    return lines.slice(0, p.line).reduce((n, line) => n + line.length + 1, 0) + p.character;
  };
  const selection = { start: start || new Position(0, 0), end: end || start || new Position(0, 0) };
  selection.isEmpty = offset(selection.start) === offset(selection.end);
  const document = Object.freeze({
    languageId, version: 1, isDirty: false,
    getText: range => range ? text.slice(offset(range.start), offset(range.end)) : text
  });
  // No edit, applyEdit, insert or replace implementation exists: edits must never be attempted.
  vscode.window.activeTextEditor = Object.freeze({ document, selection });
  return document;
}

test('未打开编辑器：提示且不改剪贴板', async () => {
  vscode.window.activeTextEditor = undefined;
  clipboard = 'old';
  assert.equal((await callback()).status, 'no-editor');
  assert.equal(clipboard, 'old');
});

test('未知语言：拒绝猜测且保留剪贴板', async () => {
  open('not // necessarily a comment', 'plaintext');
  clipboard = 'old';
  assert.equal((await callback()).status, 'unsupported');
  assert.equal(clipboard, 'old');
});

test('无选区：复制全文且原文内容/版本/dirty完全不变', async () => {
  const source = '\n// title\nconst url = "https://example.com"; // hi\n\nconst b = 2;\n';
  const doc = open(source, 'javascript');
  assert.deepEqual(await callback(), { status: 'copied', lines: 2 });
  assert.equal(clipboard, 'const url = "https://example.com";\nconst b = 2;');
  assert.equal(doc.getText(), source);
  assert.equal(doc.version, 1);
  assert.equal(doc.isDirty, false);
});

test('选区优先于全文', async () => {
  open('const outside = 0;\n// hi\nlet selected = 2; // delete\nconst tail = 3;', 'javascript', new Position(1, 0), new Position(3, 0));
  assert.equal((await callback()).status, 'copied');
  assert.equal(clipboard, 'let selected = 2;');
});

test('选区从块注释中间开始：继承前文词法状态', async () => {
  open('/* title\nstill a comment\n*/ let a = 1; // bye', 'javascript', new Position(1, 0), new Position(2, 29));
  assert.equal((await callback()).status, 'copied');
  assert.equal(clipboard.trim(), 'let a = 1;');
});

test('全注释内容：复制空串，无多余换行', async () => {
  open('// one\n/* two */\n\n ', 'javascript');
  assert.deepEqual(await callback(), { status: 'copied', lines: 0 });
  assert.equal(clipboard, '');
});

test('剪贴板写入失败：返回error且绝不改原文', async () => {
  const doc = open('x = 1 # comment', 'python');
  clipboardShouldFail = true;
  clipboard = 'old';
  try {
    assert.equal((await callback()).status, 'error');
    assert.equal(clipboard, 'old');
    assert.equal(doc.getText(), 'x = 1 # comment');
    assert.equal(doc.version, 1);
  } finally { clipboardShouldFail = false; }
});
