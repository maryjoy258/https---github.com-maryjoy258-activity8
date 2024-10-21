"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
/*******************************************************************************
 * Copyright (c) 2019 IBM Corporation and others.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v2.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v20.html
 *
 * Contributors:
 *     IBM Corporation - initial API and implementation
 *******************************************************************************/
const path = require("path");
const net = require("net");
const vscode_1 = require("vscode");
const vscode_languageclient_1 = require("vscode-languageclient");
const util_1 = require("util");
const tarfs = require("tar-fs");
const Docker = require("dockerode");
const ip = require("ip");
const docker = new Docker();
const followProgress = util_1.promisify(docker.modem.followProgress);
const clientPort = 3333;
const dockerRepo = 'ibmcom';
const dockerImage = 'codewind-java-profiler-language-server';
const dockerTag = 'latest';
const dockerFullImageName = `${dockerRepo}/${dockerImage}:${dockerTag}`;
let clientServer;
let client;
let serverConnected = false;
let connectionSocket;
function activate(context) {
    return __awaiter(this, void 0, void 0, function* () {
        // start socket server that the container connects to
        clientServer = net.createServer();
        clientServer.maxConnections = 1;
        clientServer.listen(clientPort);
        // start docker container
        const dockerBinds = vscode_1.workspace.workspaceFolders.map(wsFolder => `${wsFolder.uri.toString(true).replace('file://', '')}:/profiling/${wsFolder.name}`);
        dockerBinds.forEach(a => console.log(a));
        let serverOptions = () => startServerDockerContainer(dockerBinds);
        // Options to control the language client
        let clientOptions = {
            // Register the server for plain text documents
            documentSelector: [{ scheme: 'file', language: 'java' }],
            synchronize: {
                // Notify the server about file changes to '.hdc files contained in the workspace
                fileEvents: vscode_1.workspace.createFileSystemWatcher('**/*.hdc')
            }
        };
        // Create the language client and start the client.
        client = new vscode_languageclient_1.LanguageClient('codewindJavaProfiler', 'Codewind Java Profiler', serverOptions, clientOptions);
        // Start the client. This will also launch the server
        client.start();
    });
}
exports.activate = activate;
function startServerDockerContainer(dockerBinds) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            yield removeExistingContainer();
        }
        catch (err) {
            // don't care if already removed
        }
        try {
            console.log(`Trying to pull image ${dockerFullImageName}`);
            yield pullDockerImage();
            console.log('Pull completed!');
        }
        catch (error) {
            console.log('Pull failed, building from local Dockerfile');
            yield buildLocalDockerImage();
            console.log(error);
        }
        yield startContainer(dockerBinds);
        setupConnectionListeners();
        const serverSocket = yield waitForServerConnection();
        // Connect to language server via socket
        let result = {
            writer: serverSocket,
            reader: serverSocket
        };
        return Promise.resolve(result);
    });
}
function waitForServerConnection() {
    return new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
        const timeout = 30;
        let currentTime = 0;
        console.log(`Waiting for server connection on port ${clientPort}`);
        while (!serverConnected) {
            if (currentTime >= timeout) {
                reject(`Server didn't connect in ${timeout} seconds`);
            }
            yield sleep(1000);
            currentTime++;
        }
        resolve(connectionSocket);
    }));
}
function pullDockerImage() {
    return __awaiter(this, void 0, void 0, function* () {
        const stream = yield docker.pull(dockerFullImageName, {});
        // wait for the pull to complete
        yield followProgress(stream);
    });
}
function buildLocalDockerImage() {
    return __awaiter(this, void 0, void 0, function* () {
        const pack = tarfs.pack(path.join(__dirname, '../..', 'server'));
        const stream = yield docker.buildImage(pack, { t: dockerFullImageName });
        // wait for the build to finish
        yield new Promise((resolve, reject) => {
            docker.modem.followProgress(stream, (err, res) => err ? reject(err) : resolve(res), (event) => {
                console.log(event.stream);
            });
        });
    });
}
function removeExistingContainer() {
    return __awaiter(this, void 0, void 0, function* () {
        let originalContainer;
        originalContainer = yield docker.getContainer(dockerImage);
        try {
            yield originalContainer.stop();
        }
        catch (error) {
            // don't care if already stopped
        }
        yield originalContainer.remove();
    });
}
function startContainer(dockerBinds) {
    return __awaiter(this, void 0, void 0, function* () {
        const container = yield docker.createContainer({
            Image: dockerFullImageName,
            name: dockerImage,
            Env: [`CLIENT_PORT=${clientPort}`, `CLIENT_HOST=${ip.address()}`, `BINDS="${dockerBinds}"`],
            HostConfig: {
                Binds: dockerBinds
            }
        });
        container.start();
    });
}
function setupConnectionListeners() {
    // wait for the language server to connect
    clientServer.setMaxListeners(1);
    clientServer.on('connection', socket => {
        console.log('Language Server connected');
        serverConnected = true;
        connectionSocket = socket;
        socket.on('close', (hadError) => {
            console.log('Language Server disconnected' + (hadError ? 'with error.' : '.'));
            serverConnected = false;
            connectionSocket = null;
            clientServer.removeAllListeners();
        });
    });
}
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
//# sourceMappingURL=extension.js.map