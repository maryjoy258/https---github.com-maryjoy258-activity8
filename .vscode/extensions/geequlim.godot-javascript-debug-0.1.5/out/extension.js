/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/
'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const vscode = require("vscode");
const quickjsDebug_1 = require("./quickjsDebug");
const Net = require("net");
const path = require("path");
const normalize = require("normalize-path");
function activate(context) {
    // register a configuration provider for 'godot-quickjs' debug type
    const provider = new QuickJSConfigurationProvider();
    context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('godot-quickjs', provider));
    // The following use of a DebugAdapter factory shows how to run the debug adapter inside the extension host (and not as a separate process).
    const factory = new QuickJSDebugAdapterDescriptorFactory();
    context.subscriptions.push(vscode.debug.registerDebugAdapterDescriptorFactory('godot-quickjs', factory));
    context.subscriptions.push(factory);
}
exports.activate = activate;
function deactivate() {
    // nothing to do
}
exports.deactivate = deactivate;
class QuickJSConfigurationProvider {
    /**
     * Massage a debug configuration just before a debug session is being launched,
     * e.g. add all missing attributes to the debug configuration.
     */
    resolveDebugConfiguration(folder, config, token) {
        const workspace_root = normalize(folder.uri.fsPath);
        config.cwd = config.cwd || workspace_root;
        config.cwd = config.cwd.replace("${workspaceFolder}", workspace_root);
        config.sourceRoot = config.sourceRoot || path.join(workspace_root, 'scripts');
        config.sourceRoot = config.sourceRoot.replace("${workspaceFolder}", workspace_root);
        if (config.program) {
            config.program = config.program.replace("${workspaceFolder}", workspace_root);
        }
        return config;
    }
}
class QuickJSDebugAdapterDescriptorFactory {
    createDebugAdapterDescriptor(session, executable) {
        if (!this.server) {
            // start listening on a random port
            this.server = Net.createServer(socket => {
                const session = new quickjsDebug_1.QuickJSDebugSession();
                session.setRunAsServer(true);
                session.start(socket, socket);
            }).listen(0);
        }
        // make VS Code connect to debug server
        return new vscode.DebugAdapterServer(this.server.address().port);
    }
    dispose() {
        if (this.server) {
            this.server.close();
        }
    }
}
//# sourceMappingURL=extension.js.map