"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deactivate = exports.activate = void 0;
const vscode = require("vscode");
const path = require("path");
function activate(context) {
    const vscodeInstallPath = vscode.env.appRoot.replace("resources" + path.sep + "app", "");
    var jdkFolderName = vscode.workspace.getConfiguration("jdk-setter").get("jdkFolderName");
    var finalPath = vscodeInstallPath + jdkFolderName;
    vscode.workspace.getConfiguration("java").update("home", finalPath, true);
}
exports.activate = activate;
function deactivate() { }
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map