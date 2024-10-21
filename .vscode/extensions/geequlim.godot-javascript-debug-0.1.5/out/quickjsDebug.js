"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const CP = require("child_process");
const net_1 = require("net");
const path_1 = require("path");
const vscode_debugadapter_1 = require("vscode-debugadapter");
const sourcemapSession_1 = require("./sourcemapSession");
const path = require('path');
const Parser = require('stream-parser');
const Transform = require('stream').Transform;
var DebugType;
(function (DebugType) {
    DebugType[DebugType["Launch"] = 0] = "Launch";
    DebugType[DebugType["Attach"] = 1] = "Attach";
})(DebugType || (DebugType = {}));
/**
 * Messages from the QuickJS are in big endian length prefix json payloads.
 * The protocol is roughly just the JSON stringification of the requests.
 * Responses are intercepted to translate references into thread scoped references.
 */
class MessageParser extends Transform {
    constructor() {
        super();
        this._bytes(9, this.onLength);
    }
    onLength(buffer) {
        let length = parseInt(buffer.toString(), 16);
        this.emit('length', length);
        this._bytes(length, this.onMessage);
    }
    onMessage(buffer) {
        let json = JSON.parse(buffer.toString());
        this.emit('message', json);
        this._bytes(9, this.onLength);
    }
}
Parser(MessageParser.prototype);
class QuickJSDebugSession extends sourcemapSession_1.SourceMapSession {
    constructor() {
        super("godot-quickjs-debug.txt");
        this._threads = new Set();
        this._requests = new Map();
        // contains a list of real source files and their source mapped breakpoints.
        // ie: file1.ts -> webpack.main.js:59
        //     file2.ts -> webpack.main.js:555
        // when sending breakpoint messages, perform the mapping, note which mapped files changed,
        // then filter the breakpoint values for those touched files.
        // sending only the mapped breakpoints from file1.ts would clobber existing
        // breakpoints from file2.ts, as they both map to webpack.main.js.
        this._breakpoints = new Map();
        this._stopOnException = false;
        this._stackFrames = new Map();
        this._variables = new Map();
        this.setDebuggerLinesStartAt1(true);
        this.setDebuggerColumnsStartAt1(true);
    }
    initializeRequest(response, args) {
        // build and return the capabilities of this debug adapter:
        response.body = response.body || {};
        // make VS Code to use 'evaluate' when hovering over source
        response.body.supportsEvaluateForHovers = true;
        response.body.exceptionBreakpointFilters = [{
                label: "All Exceptions",
                filter: "exceptions",
            }];
        // make VS Code to support data breakpoints
        // response.body.supportsDataBreakpoints = true;
        // make VS Code to support completion in REPL
        response.body.supportsCompletionsRequest = true;
        response.body.completionTriggerCharacters = [".", "["];
        // make VS Code to send cancelRequests
        // response.body.supportsCancelRequest = true;
        // make VS Code send the breakpointLocations request
        // response.body.supportsBreakpointLocationsRequest = true;
        response.body.supportsConfigurationDoneRequest = true;
        response.body.supportsTerminateRequest = true;
        this.sendResponse(response);
        this.sendEvent(new vscode_debugadapter_1.InitializedEvent());
    }
    handleEvent(thread, event) {
        if (event.type === 'StoppedEvent') {
            if (event.reason !== 'entry')
                this.sendEvent(new vscode_debugadapter_1.StoppedEvent(event.reason, thread));
        }
        else if (event.type === 'terminated') {
            this._terminated('remote terminated');
        }
        else if (event.type === "ThreadEvent") {
            const threadEvent = new vscode_debugadapter_1.ThreadEvent(event.reason, thread);
            if (threadEvent.body.reason === 'new')
                this._threads.add(thread);
            else if (threadEvent.body.reason === 'exited')
                this._threads.delete(thread);
            this.sendEvent(threadEvent);
        }
    }
    handleResponse(json) {
        let request_seq = json.request_seq;
        let pending = this._requests.get(request_seq);
        if (!pending) {
            this.log(`request not found: ${request_seq}`);
            return;
        }
        this._requests.delete(request_seq);
        if (json.error)
            pending.reject(new Error(json.error));
        else
            pending.resolve(json.body);
    }
    newSession() {
        return __awaiter(this, void 0, void 0, function* () {
            let files = new Set();
            for (let bps of this._breakpoints.values()) {
                for (let bp of bps) {
                    files.add(bp.source);
                }
            }
            for (let file of files) {
                yield this.sendBreakpointMessage(file);
            }
            this.sendThreadMessage({
                type: 'stopOnException',
                stopOnException: this._stopOnException,
            });
            this.sendThreadMessage({ type: 'continue' });
        });
    }
    onSocket(socket) {
        this.closeConnection();
        this._connection = socket;
        this.newSession();
        let parser = new MessageParser();
        parser.on('message', json => {
            // the very first message will include the thread id, as it will be a stopped event.
            if (json.type === 'event') {
                const thread = json.event.thread;
                if (!this._threads.has(thread)) {
                    this._threads.add(thread);
                    this.sendEvent(new vscode_debugadapter_1.ThreadEvent("new", thread));
                    this.emit('quickjs-thread');
                }
                this.log(`received message (thread ${thread}): ${JSON.stringify(json)}`);
                this.handleEvent(thread, json.event);
            }
            else if (json.type === 'response') {
                this.handleResponse(json);
            }
            else {
                this.log(`unknown message ${json.type}`);
            }
        });
        socket.pipe(parser);
        socket.on('error', e => this._terminated(e.toString()));
        socket.on('close', () => this._terminated('close'));
    }
    disconnectRequest(response, args, request) {
        this.closeServer();
        this.closeConnection();
        this.sendResponse(response);
    }
    attachRequest(response, args, request) {
        this._commonArgs = args;
        this.connect(DebugType.Attach);
        this.sendResponse(response);
    }
    launchRequest(response, args) {
        return __awaiter(this, void 0, void 0, function* () {
            this._commonArgs = args;
            this.closeServer();
            let connection;
            try {
                connection = yield this.connect(DebugType.Launch);
            }
            catch (e) {
                this.sendErrorResponse(response, 17, e.message);
                return;
            }
            // wait a secons to setup the initial breakpoints
            yield new Promise(resolve => setTimeout(resolve, 1000));
            let cwd = args.cwd || path.dirname(args.program);
            let run_args = (args.args || []).slice();
            run_args.push(`--js-debugger-connect`);
            run_args.push(`${connection.hostname}:${connection.port}`);
            run_args.push(`--path`);
            run_args.push(cwd);
            const nodeProcess = CP.spawn(args.program, run_args);
            nodeProcess.on('error', (error) => {
                // tslint:disable-next-line:no-bitwise
                this.sendErrorResponse(response, 2017, `Cannot launch debug target (${error.message}).`);
                this._terminated(`failed to launch target (${error})`);
            });
            nodeProcess.on('exit', (params) => {
                this._terminated('target exited');
            });
            nodeProcess.on('close', (code) => {
                this._terminated('target closed');
            });
            this._captureOutput(nodeProcess);
            this._session_instance = {
                type: DebugType.Launch,
                process: nodeProcess
            };
            this.sendResponse(response);
        });
    }
    connect(type) {
        return __awaiter(this, void 0, void 0, function* () {
            vscode_debugadapter_1.logger.setup(vscode_debugadapter_1.Logger.LogLevel.Error, false);
            yield this.loadSourceMaps();
            if (type == DebugType.Launch) {
                const hostname = this.get_configs().hostname || 'localhost';
                this._server = new net_1.Server(this.onSocket.bind(this));
                this._server.listen(this.get_configs().port || 0);
                const port = this._server.address().port;
                return {
                    hostname,
                    port,
                };
            }
            else if (type == DebugType.Attach) {
                let connect = {
                    hostname: this.get_configs().hostname || 'localhost',
                    port: this.get_configs().port || 5556
                };
                let socket;
                try {
                    socket = yield new Promise((resolve, reject) => {
                        let socket = net_1.createConnection(connect.port, connect.hostname);
                        socket.on('error', reject);
                        socket.on('close', reject);
                        socket.on('connect', () => {
                            socket.removeAllListeners();
                            resolve(socket);
                        });
                    });
                }
                catch (e) {
                    this.sendEvent(new vscode_debugadapter_1.OutputEvent(`Failed connect to Godot debugger with ${connect.hostname}:${connect.port}\r\n`, 'stderr'));
                    this.stop();
                }
                if (!socket) {
                    const err = `Cannot launch connect (${connect.hostname}:${connect.port})`;
                    this.sendEvent(new vscode_debugadapter_1.OutputEvent(err + '\r\n', 'stderr'));
                    throw new Error(err);
                }
                this.onSocket(socket);
                return connect;
            }
            return {};
        });
    }
    _captureOutput(process) {
        process.stdout.on('data', (data) => {
            this.sendEvent(new vscode_debugadapter_1.OutputEvent(data.toString(), 'stdout'));
        });
        process.stderr.on('data', (data) => {
            this.sendEvent(new vscode_debugadapter_1.OutputEvent(data.toString(), 'stderr'));
        });
    }
    get_configs() {
        return this._commonArgs;
    }
    log(message) {
        if (this._commonArgs.trace) {
            this.sendEvent(new vscode_debugadapter_1.OutputEvent(message + '\n', 'console'));
        }
    }
    _terminated(reason) {
        this.log(`Debug Session Ended: ${reason}`);
        this.closeServer();
        this.closeConnection();
        if (!this._isTerminated) {
            this._isTerminated = true;
            this.sendEvent(new vscode_debugadapter_1.TerminatedEvent());
        }
    }
    closeServer() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this._server) {
                this._server.close();
                this._server = undefined;
                if (this._session_instance && this._session_instance.type == DebugType.Launch) {
                    this._session_instance.process.kill();
                }
                this._session_instance = null;
            }
        });
    }
    closeConnection() {
        if (this._connection)
            this._connection.destroy();
        this._connection = undefined;
        this._threads.clear();
    }
    terminateRequest(response, args, request) {
        return __awaiter(this, void 0, void 0, function* () {
            this.closeServer();
            this.sendResponse(response);
        });
    }
    sendBreakpointMessage(file) {
        return __awaiter(this, void 0, void 0, function* () {
            const breakpoints = [];
            for (let bpList of this._breakpoints.values()) {
                for (let bp of bpList.filter(bp => bp.source === file)) {
                    breakpoints.push({
                        line: bp.line,
                        column: bp.column,
                    });
                }
            }
            const envelope = {
                type: 'breakpoints',
                breakpoints: {
                    path: file,
                    breakpoints: breakpoints.length ? breakpoints : undefined,
                },
            };
            this.sendThreadMessage(envelope);
        });
    }
    setBreakPointsRequest(response, args) {
        return __awaiter(this, void 0, void 0, function* () {
            response.body = {
                breakpoints: []
            };
            this.log(`setBreakPointsRequest: ${JSON.stringify(args)}`);
            if (!args.source.path) {
                this.sendResponse(response);
                return;
            }
            // before clobbering the map entry, note which files currently have mapped breakpoints.
            const dirtySources = new Set();
            for (const existingBreakpoint of (this._breakpoints.get(args.source.path) || [])) {
                dirtySources.add(existingBreakpoint.source);
            }
            // map the new breakpoints for a file, and mapped files that get touched.
            const bps = args.breakpoints || [];
            const mappedBreakpoints = [];
            for (let bp of bps) {
                const mappedPositions = this.translateFileLocationToRemote({
                    source: args.source.path,
                    column: bp.column || 0,
                    line: bp.line,
                });
                dirtySources.add(mappedPositions.source);
                mappedBreakpoints.push(mappedPositions);
            }
            // update the entry for this file
            if (args.breakpoints) {
                this._breakpoints.set(args.source.path, mappedBreakpoints);
            }
            else {
                this._breakpoints.delete(args.source.path);
            }
            for (let file of dirtySources) {
                yield this.sendBreakpointMessage(file);
            }
            this.sendResponse(response);
        });
    }
    setExceptionBreakPointsRequest(response, args, request) {
        this.sendResponse(response);
        this._stopOnException = args.filters.length > 0;
        this.sendThreadMessage({
            type: 'stopOnException',
            stopOnException: this._stopOnException,
        });
    }
    threadsRequest(response) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this._threads.size === 0) {
                yield new Promise((resolve, reject) => {
                    this.once('quickjs-thread', () => {
                        resolve();
                    });
                });
            }
            response.body = {
                threads: Array.from(this._threads.keys()).map(thread => new vscode_debugadapter_1.Thread(thread, `thread 0x${thread.toString(16)}`))
            };
            this.sendResponse(response);
        });
    }
    stackTraceRequest(response, args) {
        return __awaiter(this, void 0, void 0, function* () {
            const thread = args.threadId;
            const body = yield this.sendThreadRequest(args.threadId, response, args);
            const stackFrames = [];
            for (const { id, name, filename, line, column } of body) {
                let mappedId = id + thread;
                this._stackFrames.set(mappedId, thread);
                try {
                    const mappedLocation = this.translateRemoteLocationToLocal({
                        source: filename,
                        line: line || 0,
                        column: column || 0,
                    });
                    if (!mappedLocation.source)
                        throw new Error('map failed');
                    const source = new vscode_debugadapter_1.Source(path_1.basename(mappedLocation.source), this.convertClientPathToDebugger(mappedLocation.source));
                    stackFrames.push(new vscode_debugadapter_1.StackFrame(mappedId, name, source, mappedLocation.line, mappedLocation.column));
                }
                catch (e) {
                    stackFrames.push(new vscode_debugadapter_1.StackFrame(mappedId, name, filename, line, column));
                }
            }
            const totalFrames = body.length;
            response.body = {
                stackFrames,
                totalFrames,
            };
            this.sendResponse(response);
        });
    }
    scopesRequest(response, args) {
        return __awaiter(this, void 0, void 0, function* () {
            const thread = this._stackFrames.get(args.frameId);
            if (!thread) {
                this.sendErrorResponse(response, 2030, 'scopesRequest: thread not found');
                return;
            }
            args.frameId -= thread;
            const body = yield this.sendThreadRequest(thread, response, args);
            const scopes = body.map(({ name, reference, expensive }) => {
                // todo: use counter mapping
                let mappedReference = reference + thread;
                this._variables.set(mappedReference, thread);
                return new vscode_debugadapter_1.Scope(name, mappedReference, expensive);
            });
            response.body = {
                scopes,
            };
            this.sendResponse(response);
        });
    }
    variablesRequest(response, args, request) {
        return __awaiter(this, void 0, void 0, function* () {
            const thread = this._variables.get(args.variablesReference);
            if (!thread) {
                this.sendErrorResponse(response, 2030, 'scopesRequest: thread not found');
                return;
            }
            args.variablesReference -= thread;
            const body = yield this.sendThreadRequest(thread, response, args);
            const variables = body.map(({ name, value, type, variablesReference, indexedVariables }) => {
                // todo: use counter mapping
                variablesReference = variablesReference ? variablesReference + thread : 0;
                this._variables.set(variablesReference, thread);
                return { name, value, type, variablesReference, indexedVariables };
            });
            response.body = {
                variables,
            };
            this.sendResponse(response);
        });
    }
    sendThreadMessage(envelope) {
        if (!this._connection) {
            this.log(`debug connection not avaiable`);
            return;
        }
        this.log(`sent: ${JSON.stringify(envelope)}`);
        let json = JSON.stringify(envelope);
        let jsonBuffer = Buffer.from(json);
        // length prefix is 8 hex followed by newline = 012345678\n
        // not efficient, but protocol is then human readable.
        // json = 1 line json + new line
        let messageLength = jsonBuffer.byteLength + 1;
        let length = '00000000' + messageLength.toString(16) + '\n';
        length = length.substr(length.length - 9);
        let lengthBuffer = Buffer.from(length);
        let newline = Buffer.from('\n');
        let buffer = Buffer.concat([lengthBuffer, jsonBuffer, newline]);
        this._connection.write(buffer);
    }
    sendThreadRequest(thread, response, args) {
        return new Promise((resolve, reject) => {
            let request_seq = response.request_seq;
            // todo: don't actually need to cache this. can send across wire.
            this._requests.set(request_seq, {
                resolve,
                reject,
            });
            let envelope = {
                type: 'request',
                request: {
                    request_seq,
                    command: response.command,
                    args,
                }
            };
            this.sendThreadMessage(envelope);
        });
    }
    continueRequest(response, args) {
        return __awaiter(this, void 0, void 0, function* () {
            response.body = yield this.sendThreadRequest(args.threadId, response, args);
            this.sendResponse(response);
        });
    }
    nextRequest(response, args) {
        return __awaiter(this, void 0, void 0, function* () {
            response.body = yield this.sendThreadRequest(args.threadId, response, args);
            this.sendResponse(response);
        });
    }
    stepInRequest(response, args, request) {
        return __awaiter(this, void 0, void 0, function* () {
            response.body = yield this.sendThreadRequest(args.threadId, response, args);
            this.sendResponse(response);
        });
    }
    stepOutRequest(response, args, request) {
        return __awaiter(this, void 0, void 0, function* () {
            response.body = yield this.sendThreadRequest(args.threadId, response, args);
            this.sendResponse(response);
        });
    }
    evaluateRequest(response, args) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!args.frameId) {
                this.sendErrorResponse(response, 2030, 'scopesRequest: frameId not specified');
                return;
            }
            let thread = this._stackFrames.get(args.frameId);
            if (!thread) {
                this.sendErrorResponse(response, 2030, 'scopesRequest: thread not found');
                return;
            }
            args.frameId -= thread;
            const body = yield this.sendThreadRequest(thread, response, args);
            let variablesReference = body.variablesReference;
            variablesReference = variablesReference ? variablesReference + thread : 0;
            this._variables.set(variablesReference, thread);
            body.variablesReference = variablesReference;
            response.body = body;
            this.sendResponse(response);
        });
    }
    pauseRequest(response, args, request) {
        return __awaiter(this, void 0, void 0, function* () {
            response.body = yield this.sendThreadRequest(args.threadId, response, args);
            this.sendResponse(response);
        });
    }
    completionsRequest(response, args) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!args.frameId) {
                this.sendErrorResponse(response, 2030, 'completionsRequest: frameId not specified');
                return;
            }
            let thread = this._stackFrames.get(args.frameId);
            if (!thread) {
                this.sendErrorResponse(response, 2030, 'completionsRequest: thread not found');
                return;
            }
            args.frameId -= thread;
            let expression = args.text.substr(0, args.text.length - 1);
            if (!expression) {
                this.sendErrorResponse(response, 2032, "no completion available for empty string");
                return;
            }
            const evaluateArgs = {
                frameId: args.frameId,
                expression,
            };
            response.command = 'evaluate';
            let body = yield this.sendThreadRequest(thread, response, evaluateArgs);
            if (!body.variablesReference) {
                this.sendErrorResponse(response, 2032, "no completion available for expression");
                return;
            }
            if (body.indexedVariables !== undefined) {
                this.sendErrorResponse(response, 2032, "no completion available for arrays");
                return;
            }
            const variableArgs = {
                variablesReference: body.variablesReference,
            };
            response.command = 'variables';
            body = yield this.sendThreadRequest(thread, response, variableArgs);
            response.command = 'completions';
            response.body = {
                targets: body.map((property) => ({
                    label: property.name,
                    type: 'field',
                }))
            };
            this.sendResponse(response);
        });
    }
}
exports.QuickJSDebugSession = QuickJSDebugSession;
//# sourceMappingURL=quickjsDebug.js.map