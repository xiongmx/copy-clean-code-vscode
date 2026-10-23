/* eslint-env node */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vscode = require('vscode');

const EXTENSION_ID = 'xiongmx.copy-clean-code';
const COMMAND = 'copyCleanCode.copy';
const TITLE = '复制通用版非注释和空白行到剪贴板';
const ROOT = path.resolve(__dirname, '..');
const INSTALL_DIR = path.join(ROOT, 'artifacts', 'test-extensions');
const RESULTS = path.join(ROOT, 'artifacts', 'integration-results.json');
const results = [];

function pass(name) {
  results.push({ name, status: 'PASS' });
  console.log(`PASS ${name}`);
}
function fail(name, error) {
  results.push({ name, status: 'FAIL', error: String(error && error.stack || error) });
  console.error(`FAIL ${name}: ${error && error.stack || error}`);
}
function writeResults() {
  fs.mkdirSync(path.dirname(RESULTS), { recursive: true });
  const passed = results.filter(x => x.status === 'PASS').length;
  fs.writeFileSync(RESULTS, JSON.stringify({ total: results.length, passed, failed: results.length - passed, cases: results }, null, 2) + '\n');
}
async function open(content, language) {
  const doc = await vscode.workspace.openTextDocument({ content, language });
  const editor = await vscode.window.showTextDocument(doc, { preview: false, preserveFocus: false });
  return { doc, editor };
}
async function close(doc) {
  await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  if (doc && !doc.isClosed) await vscode.commands.executeCommand('workbench.action.closeAllEditors');
}
async function invoke(name, content, language, expected, selection) {
  const { doc, editor } = await open(content, language);
  assert.equal(doc.languageId, language, `${name}: requested language mode was not registered`);
  if (selection) editor.selection = new vscode.Selection(selection.start, selection.end);
  const beforeText = doc.getText();
  const beforeVersion = doc.version;
  const beforeDirty = doc.isDirty;
  await vscode.env.clipboard.writeText('clipboard-sentinel');
  const value = await vscode.commands.executeCommand(COMMAND);
  const copied = await vscode.env.clipboard.readText();
  assert.deepEqual(value, { status: 'copied', lines: expected ? expected.split('\n').length : 0 });
  assert.equal(copied, expected, `${name}: clipboard`);
  assert.equal(doc.getText(), beforeText, `${name}: source text changed`);
  assert.equal(doc.version, beforeVersion, `${name}: document version changed`);
  assert.equal(doc.isDirty, beforeDirty, `${name}: dirty state changed`);
  await close(doc);
  pass(name);
}
async function invokeUnsupported() {
  const { doc } = await open('plain text\n// looks like a comment but plaintext is unsupported\n', 'plaintext');
  await vscode.env.clipboard.writeText('do-not-overwrite');
  const value = await vscode.commands.executeCommand(COMMAND);
  assert.deepEqual(value, { status: 'unsupported' });
  assert.equal(await vscode.env.clipboard.readText(), 'do-not-overwrite');
  await close(doc);
  pass('unsupported plaintext does not overwrite clipboard');
}
async function invokeNoEditor() {
  await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  const value = await vscode.commands.executeCommand(COMMAND);
  assert.deepEqual(value, { status: 'no-editor' });
  pass('no editor result');
}
async function main() {
  try {
    const ext = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(ext, 'installed extension is missing');
    assert.ok(path.resolve(ext.extensionPath).startsWith(path.resolve(INSTALL_DIR) + path.sep), `extension path is not isolated: ${ext.extensionPath}`);
    assert.notEqual(path.resolve(ext.extensionPath), ROOT, 'extension was loaded from project source');
    assert.equal(ext.isActive, false, 'extension was active before command');
    pass('installed extension path and lazy activation precondition');

    const manifest = JSON.parse(fs.readFileSync(path.join(ext.extensionPath, 'package.json'), 'utf8'));
    assert.equal(manifest.version, '1.0.1');
    assert.equal(manifest.contributes.commands.find(x => x.command === COMMAND).title, TITLE);
    const menus = manifest.contributes.menus || {};
    assert.ok((menus['editor/context'] || []).some(x => x.command === COMMAND), 'editor/context menu missing');
    assert.ok((menus.commandPalette || []).some(x => x.command === COMMAND), 'commandPalette menu missing');
    pass('manifest command title and menus');

    const languages = manifest.contributes.languages || [];
    const nginxLanguage = languages.find(x => x.id === 'nginx');
    assert.ok(nginxLanguage, 'nginx language registration missing');
    assert.equal(nginxLanguage.aliases && nginxLanguage.aliases[0], 'Nginx');
    assert.ok((nginxLanguage.filenames || []).includes('nginx.conf'), 'nginx.conf filename missing');
    assert.ok((nginxLanguage.extensions || []).includes('.nginx'), '.nginx extension missing');
    assert.ok(!(nginxLanguage.extensions || []).includes('.conf'), 'Nginx must not claim every .conf file');
    assert.ok(!languages.some(x => x.id === 'nginx-conf' || x.id === 'nginxconf'), 'third-party Nginx IDs must not be registered');
    pass('Nginx language registration and conservative filename matching');

    const jsonc = '{\n  // header\n  "name": "demo",\n\n  /* removed block */\n  "enabled": true\n}\n';
    await invoke('JSONC whole document', jsonc, 'jsonc', '{\n  "name": "demo",\n  "enabled": true\n}');
    assert.equal(vscode.extensions.getExtension(EXTENSION_ID).isActive, true);
    pass('command auto activation');

    const html = '<!-- page comment\n  hidden line\n-->\n<div>hello</div>\n\n<!-- tail -->\n';
    await invoke('HTML whole document', html, 'html', '<div>hello</div>');

    const python = '# module comment\n\nvalue = 1\n# trailing comment\nprint(value)\n';
    await invoke('Python whole document', python, 'python', 'value = 1\nprint(value)');
    await invoke('all-comment document copies empty string', '# one\n# two\n\n', 'python', '');

    const selected = 'const a = 1;\n// omit this\nconst b = 2;\nconst c = 3;\n';
    const selectedExpected = 'const b = 2;\nconst c = 3;';
    await invoke('selected lines only', selected, 'javascript', selectedExpected, {
      start: new vscode.Position(1, 0), end: new vscode.Position(3, selected.split('\n')[3].length)
    });

    await invoke('no selection means whole document', 'x = 1\n\n# comment\ny = 2\n', 'python', 'x = 1\ny = 2');

    const nginx = '# server comment\nserver {\n    listen 80; # inline comment\n    server_name foo#bar;\n    set $double "quoted # hash";\n    set $single \'quoted # hash\';\n    set $escaped \\#literal;\n    set $slashes // /* not nginx comments */;\n}\n';
    const nginxExpected = 'server {\n    listen 80;\n    server_name foo#bar;\n    set $double "quoted # hash";\n    set $single \'quoted # hash\';\n    set $escaped \\#literal;\n    set $slashes // /* not nginx comments */;\n}';
    await invoke('Nginx standalone inline and token-boundary comments', nginx, 'nginx', nginxExpected);
    await invoke('Nginx third-party language ID nginx-conf', nginx, 'nginx-conf', nginxExpected);
    await invoke('Nginx third-party language ID nginxconf', nginx, 'nginxconf', nginxExpected);

    const nginxSelection = 'set $value "prefix # keep"; # remove\nnext on;\n';
    await invoke('Nginx selection starts inside quoted string', nginxSelection, 'nginx', 'prefix # keep";\nnext on;', {
      start: new vscode.Position(0, 'set $value "'.length),
      end: new vscode.Position(1, 'next on;'.length)
    });

    const autoPath = path.join(ROOT, 'artifacts', 'nginx.conf');
    const ordinaryConfPath = path.join(ROOT, 'artifacts', 'integration-ordinary.conf');
    fs.mkdirSync(path.dirname(autoPath), { recursive: true });
    fs.writeFileSync(autoPath, nginx);
    fs.writeFileSync(ordinaryConfPath, nginx);
    const autoDoc = await vscode.workspace.openTextDocument(vscode.Uri.file(autoPath));
    assert.equal(autoDoc.languageId, 'nginx', 'nginx.conf must auto-detect as Nginx');
    const ordinaryDoc = await vscode.workspace.openTextDocument(vscode.Uri.file(ordinaryConfPath));
    assert.notEqual(ordinaryDoc.languageId, 'nginx', 'ordinary .conf must not auto-detect as Nginx');
    await close(autoDoc);
    await close(ordinaryDoc);
    fs.rmSync(autoPath, { force: true });
    fs.rmSync(ordinaryConfPath, { force: true });
    pass('nginx.conf auto-detection without claiming ordinary .conf');

    const commentContext = '<!--\nhidden\n-->\n<div>visible</div>\n';
    await invoke('selection starts inside multiline HTML comment', commentContext, 'html', '<div>visible</div>', {
      start: new vscode.Position(1, 0), end: new vscode.Position(3, commentContext.split('\n')[3].length)
    });
    const stringContext = '"""\nfake = 1\n"""\nreal = 2\n';
    await invoke('selection starts inside multiline Python string', stringContext, 'python', 'fake = 1\n"""\nreal = 2', {
      start: new vscode.Position(1, 0), end: new vscode.Position(3, stringContext.split('\n')[3].length)
    });

    await invokeUnsupported();
    await invokeNoEditor();
  } catch (error) {
    fail('integration execution', error);
    throw error;
  } finally {
    writeResults();
  }
  const failed = results.filter(x => x.status === 'FAIL');
  if (failed.length) throw new Error(`${failed.length} integration case(s) failed`);
}

module.exports = { run: main };
