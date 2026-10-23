import * as vscode from 'vscode';
import { stripComments, isSupported } from './strip.mjs';

export const COMMAND_ID = 'copyCleanCode.copy';

export function activate(context) {
  context.subscriptions.push(vscode.commands.registerCommand(COMMAND_ID, async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showInformationMessage('请先打开一个文本编辑器。');
      return { status: 'no-editor' };
    }
    const document = editor.document;
    if (!isSupported(document.languageId)) {
      vscode.window.showWarningMessage(`暂不支持语言“${document.languageId}”，未改动剪贴板。请切换到受支持的语言模式；支持范围请见扩展说明。`);
      return { status: 'unsupported' };
    }
    // Snapshot first: the user may switch editors while the tokenizer is loading.
    const selection = editor.selection;
    const hasSelection = !selection.isEmpty;
    const text = hasSelection ? document.getText(selection) : document.getText();
    const prefix = hasSelection
      ? document.getText(new vscode.Range(new vscode.Position(0, 0), selection.start))
      : '';
    const language = document.languageId;
    try {
      const output = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Window, title: '正在识别注释并清理空白行…' },
        () => stripComments(text, language, { prefix })
      );
      await vscode.env.clipboard.writeText(output);
      const lines = output.length === 0 ? 0 : output.split('\n').length;
      vscode.window.setStatusBarMessage(
        `已复制${hasSelection ? '选区' : '全文'}清理结果（${lines} 行），原文未修改。`, 5000
      );
      return { status: 'copied', lines };
    } catch (error) {
      // Fail closed: never replace the clipboard with guessed stripping output.
      vscode.window.showErrorMessage(`复制失败，原文未修改：${error instanceof Error ? error.message : String(error)}`);
      return { status: 'error' };
    }
  }));
}

export function deactivate() {}
