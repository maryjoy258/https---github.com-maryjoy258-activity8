"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vscode = require("vscode");
// アクティブテキストファイルの全内容を取得する
exports.getFullText = () => {
    return exports.getDocument().getText();
};
// アクティブテキストファイルの全内容を置き換える
exports.setFullText = (newText) => {
    const document = exports.getDocument();
    const invalidRange = new vscode.Range(0, 0, document.lineCount, 0);
    const fullRange = document.validateRange(invalidRange);
    const editor = exports.getEditor();
    editor.edit(builder => builder.replace(fullRange, newText));
    // 中途半端に選択された状態になるので、選択を解除する
    editor.selection = new vscode.Selection(0, 0, 0, 0);
};
// Unicode形式にエンコードする
exports.nativeToAscii = (text, lowerCase = true) => {
    return text.split('')
        .map(char => {
        const code = char.charCodeAt(0);
        if (code <= 0x7f) {
            // ASCII文字はそのまま
            return char;
        }
        // 8ビット文字は0パディングする
        const escaped = escape(char).replace('%', code <= 0xff ? '\\u00' : '\\');
        return lowerCase ? escaped.toLocaleLowerCase() : escaped;
    })
        .join('');
};
// Unicode形式からデコードする
exports.asciiToNative = (text) => {
    return unescape(text.replace(/\\(?=u[0-9A-Za-z])/g, '%'));
};
// アクティブテキストエディターを取得する
exports.getEditor = () => {
    if (vscode.window.activeTextEditor) {
        return vscode.window.activeTextEditor;
    }
    throw new Error('Text editor is not active.');
};
// アクティブテキストエディターのドキュメントを取得する
exports.getDocument = () => {
    const editor = exports.getEditor();
    if (editor.document) {
        return editor.document;
    }
    throw new Error('Text document is not active.');
};
// アクティブドキュメントの改行文字を取得する
exports.getEol = () => {
    return exports.getDocument().eol === vscode.EndOfLine.LF ? '\n' : '\r\n';
};
// アクティブドキュメントがpropertiesファイルか
exports.isActiveDocumentPropertiesFile = () => {
    const useFilesAssociations = exports.getConfigParameter('use-files.associations');
    const document = exports.getDocument();
    if (useFilesAssociations) {
        return document.languageId === 'properties';
    }
    else {
        return document.fileName.endsWith('.properties');
    }
};
// 設定パラメータを取得する
exports.getConfigParameter = (name) => {
    const config = vscode.workspace.getConfiguration('native-ascii-converter');
    return config.get(name);
};
//# sourceMappingURL=utils.js.map