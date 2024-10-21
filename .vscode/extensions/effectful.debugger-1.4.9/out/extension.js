"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deactivate = exports.activate = void 0;
const vscode = require("vscode");
const session_1 = require("./session");
const Net = require("net");
const EMBED_DEBUG_ADAPTER = true;
function progress(title) {
    let cb = (t) => { };
    vscode.window.withProgress({
        location: vscode.ProgressLocation.Window,
        title
    }, () => new Promise(i => (cb = i)));
    return () => cb();
}
function errMessage(msg) {
    return vscode.window.showErrorMessage(msg);
}
function activate(context) {
    if (EMBED_DEBUG_ADAPTER) {
        const factory = new DebugAdapterDescriptorFactory();
        context.subscriptions.push(vscode.debug.registerDebugAdapterDescriptorFactory("effectful", factory));
        context.subscriptions.push(factory);
    }
}
exports.activate = activate;
function deactivate() { }
exports.deactivate = deactivate;
class DebugAdapterDescriptorFactory {
    createDebugAdapterDescriptor(_session, _executable) {
        if (!this.server) {
            this.server = Net.createServer(socket => {
                const session = new session_1.DebugSession();
                session.progressHandler = progress;
                session.showError = errMessage;
                session.setRunAsServer(true);
                session.start(socket, socket);
            }).listen(0);
        }
        return new vscode.DebugAdapterServer(this.server.address().port);
    }
    dispose() {
        if (this.server) {
            this.server.close();
        }
    }
}
//# sourceMappingURL=extension.js.map