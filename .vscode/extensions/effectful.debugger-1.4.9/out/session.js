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
exports.DebugSession = void 0;
const debugadapter_1 = require("@vscode/debugadapter");
const comms_1 = require("./comms");
const child_process_1 = require("child_process");
const path = require("path");
const wscomms_1 = require("./wscomms");
const os_1 = require("os");
const MAX_OLD_SPACE = Math.floor((0, os_1.totalmem)() / (2 * 1024 * 1024));
const normalizeDrive = typeof process !== "undefined" && process.platform === "win32"
    ? function normalizeDrive(path) {
        return path && path.length > 2 && path[1] === ":"
            ? path.charAt(0).toUpperCase() + path.slice(1)
            : path;
    }
    : function (path) {
        return path;
    };
function packageBase(name) {
    const f = name[0];
    if (f === "@")
        return name.split("/").slice(0, 2).join("/");
    if (f === "." || f === "/" || f === "~" || name[1] === ":")
        return f;
    return name.split("/")[0];
}
const runningCommands = new Map();
const RUNINTERMINAL_TIMEOUT = 60000;
const CONFIGURATION_DONE_REQUEST_TIMEOUT = 10000;
let progressCnt = 0;
const INSTAL_INSTRUCTION = `
Please, install "@effectful/debugger" manually:

 $ npm install -g @effectful/debugger

And link it to your project:
 
 $ npm link @effectful/debugger

WARNING: Installing it as your project local dependency won't work.
The runtime and the project dependencies shouldn't be deduped together.
`;
const BROWSERS_ZERO_CONFIG_NOT_SUPPORTED = `
Unfortunately, I had to remove zero-config for nextjs/browser. 
I don't have time to cope with all the breaking changes in the 
dependencies. Maybe I'll restore it in the future. 

If you can help, please let me know.

Meanwhile you still can use the debugger with nextjs and browser but 
with a simple configuration (see README).
`;
class DebugSession extends debugadapter_1.DebugSession {
    /**
     * Creates a new debug adapter that is used for one debug session.
     * We configure the default implementation of a debug adapter here.
     */
    constructor() {
        super(true);
        this.remotes = new Map();
        this.stopped = false;
        this.supportsRunInTerminalRequest = false;
        this.launched = false;
        this.breakpointsSrcs = new Map();
        this.breakpointsIds = new Map();
        this.breakpointsCount = 0;
        this.lastThread = 0;
        this.supportsProgress = false;
        this.knownThreadNames = {};
        this.configurationDone = false;
        this.breakpointLocationsCb = new Map();
        // super("effectful-debug.log");
        // this.obsolete_logFilePath = obsolete_logFilePath;
        this.on("error", event => {
            debugadapter_1.logger.error(event.body);
        });
        this.setDebuggerLinesStartAt1(false);
        this.setDebuggerColumnsStartAt1(false);
    }
    start(inStream, outStream) {
        super.start(inStream, outStream);
        debugadapter_1.logger.init(e => {
            this.sendEvent(e);
        }, "effectful-debug.log", this._isServer);
    }
    sendEvent(event) {
        if (event.event !== "output")
            debugadapter_1.logger.verbose(`sendEvent: ${JSON.stringify(event)}`);
        super.sendEvent(event);
    }
    sendRequest(command, args, timeout, cb) {
        debugadapter_1.logger.verbose(`sendRequest: ${JSON.stringify(command)}(${JSON.stringify(args)}), timeout: ${timeout}`);
        super.sendRequest(command, args, timeout, cb);
    }
    sendResponse(response) {
        debugadapter_1.logger.verbose(`sendResponse: ${JSON.stringify(response)}`);
        super.sendResponse(response);
    }
    closeRemote(remoteId) {
        return __awaiter(this, void 0, void 0, function* () {
            const remote = this.remotes.get(remoteId);
            this.remotes.delete(remoteId);
            for (const i of this.breakpointsIds.values()) {
                i.remotes.delete(remoteId);
                if (!i.remotes.size) {
                    i.response.verified = false;
                    this.sendEvent(new debugadapter_1.BreakpointEvent("changed", i.response));
                }
            }
            if (remote) {
                if (remote.dataBreakpoints) {
                    for (const i of remote.dataBreakpoints) {
                        i.verified = false;
                        this.sendEvent(new debugadapter_1.Event("breakpoint", {
                            reason: "changed",
                            breakpoint: { id: i.id, verified: false }
                        }));
                    }
                }
                this.sendEvent(new debugadapter_1.ThreadEvent("exited", remoteId));
            }
            if (!this.remotes.size) {
                const reconnect = this.awaitReconnect || 0;
                if (reconnect < 0)
                    return;
                yield new Promise(i => setTimeout(i, reconnect));
                if (this.remotes.size)
                    return;
                this.terminate(this.exitCode
                    ? `the main command exited with exit code ${this.exitCode}`
                    : "all threads are finished");
            }
        });
    }
    /**
     * The 'initialize' request is the first request called by the frontend
     * to interrogate the features the debug adapter provides.
     */
    initializeRequest(response, args) {
        this.supportsRunInTerminalRequest = !!args.supportsRunInTerminalRequest;
        this.supportsProgress = !!args.supportsProgressReporting;
        response.body = response.body || {};
        response.body.supportsConfigurationDoneRequest = true;
        response.body.supportsStepBack = true;
        response.body.supportsSetVariable = false;
        response.body.supportsSetExpression = true;
        response.body.supportsTerminateRequest = true;
        response.body.supportTerminateDebuggee = true;
        response.body.supportsLogPoints = true;
        response.body.supportsHitConditionalBreakpoints = true;
        response.body.supportsConditionalBreakpoints = true;
        response.body.supportsFunctionBreakpoints = false;
        response.body.supportsEvaluateForHovers = false;
        response.body.supportsCompletionsRequest = false;
        response.body.supportsRestartRequest = false;
        response.body.supportsRestartFrame = false;
        response.body.supportsExceptionOptions = true;
        response.body.supportsExceptionInfoRequest = false;
        response.body.supportsValueFormattingOptions = false;
        response.body.supportsTerminateThreadsRequest = true;
        response.body.supportsDataBreakpoints = false;
        response.body.supportsReadMemoryRequest = false;
        response.body.supportsDisassembleRequest = false;
        response.body.supportsCancelRequest = false;
        response.body.supportsBreakpointLocationsRequest = true;
        response.body.supportsStepInTargetsRequest = false;
        response.body.exceptionBreakpointFilters = [
            { filter: "all", label: "All Exceptions", default: false },
            { filter: "uncaught", label: "Uncaught Exceptions", default: true }
        ];
        this.sendResponse(response);
        this.sendEvent(new debugadapter_1.InitializedEvent());
    }
    sendAll(request) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.stopped) {
                for (const remote of this.remotes.values()) {
                    remote.send(request);
                }
            }
        });
    }
    sendToThread(threadId, msg) {
        const thread = this.remotes.get(threadId);
        if (!thread) {
            debugadapter_1.logger.verbose(`no remote ${threadId}`);
            this.closeRemote(threadId);
            return false;
        }
        this.lastThread = threadId;
        thread.send(msg);
        return true;
    }
    dispatchRequest(request) {
        const _super = Object.create(null, {
            dispatchRequest: { get: () => super.dispatchRequest }
        });
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            debugadapter_1.logger.verbose(`dispatchRequest: ${JSON.stringify(request)}`);
            if (this.stopped)
                return;
            switch (request.command) {
                case "restart":
                    this.sendAll(Object.assign(Object.assign({}, request), { command: "childRestart" }));
                    this.sendResponse(new debugadapter_1.Response(request));
                    return;
                case "setExceptionBreakpoints":
                    this.sendResponse(new debugadapter_1.Response(request));
                    this.exceptionArgs = request.arguments;
                    this.sendAll(Object.assign(Object.assign({}, request), { command: "childSetExceptionBreakpoints" }));
                    return;
                case "breakpointLocations":
                    this.doBreakpointsLocations(request);
                    return;
                case "setBreakpoints":
                    this.doSetBreakpoints(request);
                    return;
                case "terminateThreads":
                    const threadIds = request.arguments.threadIds;
                    if (threadIds)
                        for (const i of threadIds)
                            this.sendToThread(i, Object.assign(Object.assign({}, request), { command: "childTerminate" }));
                    this.sendResponse(new debugadapter_1.Response(request));
                    break;
                case "source":
                    {
                        const args = request.arguments;
                        if (args.sourceReference != null &&
                            this.sendToThread((0, comms_1.toThread)(args.sourceReference), request))
                            return;
                    }
                    break;
                case "setDataBreakpoints":
                    {
                        const args = request.arguments;
                        const byThread = new Map();
                        const responseBreakpoints = [];
                        for (const i of args.breakpoints) {
                            if (i.enabled === false)
                                continue;
                            const threadId = +(((_a = i.dataId) === null || _a === void 0 ? void 0 : _a.match(/^(\d+)/)) || [])[1];
                            if (isNaN(threadId))
                                continue;
                            const remote = this.remotes.get(threadId);
                            if (!remote) {
                                responseBreakpoints.push({ id: i.id, verified: false });
                                this.sendEvent(new debugadapter_1.Event("breakpoint", {
                                    reason: "removed",
                                    breakpoint: { id: i.id }
                                }));
                                continue;
                            }
                            let bps = byThread.get(threadId);
                            if (!bps) {
                                bps = [];
                                byThread.set(threadId, bps);
                            }
                            bps.push(i);
                            (remote.dataBreakpoints || (remote.dataBreakpoints = new Set())).add(i);
                            responseBreakpoints.push({ id: i.id, verified: true });
                        }
                        for (const threadId of this.remotes.keys()) {
                            args.breakpoints = byThread.get(threadId) || [];
                            this.sendToThread(threadId, request);
                        }
                        const response = new debugadapter_1.Response(request);
                        response.body = { breakpoints: responseBreakpoints };
                        this.sendResponse(response);
                    }
                    break;
                case "continue":
                case "next":
                case "stackTrace":
                case "stepIn":
                case "stepOut":
                case "stepBack":
                case "goto":
                case "pause":
                case "exceptionInfo":
                case "stackTrace":
                case "scopes":
                case "variables":
                case "evaluate":
                case "setExpression":
                case "reverseContinue":
                case "dataBreakpointInfo":
                    const args = request.arguments;
                    if (args.threadId != null) {
                        if (this.sendToThread(args.threadId, request))
                            return;
                        break;
                    }
                    if (args.frameId != null) {
                        if (this.sendToThread((0, comms_1.toThread)(args.frameId), request))
                            return;
                        break;
                    }
                    if (args.variablesReference) {
                        if (this.sendToThread((0, comms_1.toThread)(args.variablesReference), request))
                            return;
                        break;
                    }
                    if (request.command === "evaluate") {
                        this.sendToThread(this.lastThread, request);
                        return;
                    }
                    debugadapter_1.logger.error("no thread's destination");
                    break;
                case "terminate":
                    this.sendAll(Object.assign(Object.assign({}, request), { command: "childTerminate" }));
                    this.sendResponse(new debugadapter_1.Response(request));
                    this.terminate();
                    return;
                case "disconnect":
                    this.shutdown();
                    this.sendResponse(new debugadapter_1.Response(request));
                    return;
                default:
                    _super.dispatchRequest.call(this, request);
            }
        });
    }
    terminate(reason) {
        if (reason)
            debugadapter_1.logger.verbose(`termination request: ${reason}`);
        if (!this.stopped)
            this.sendEvent(new debugadapter_1.TerminatedEvent());
    }
    dispatchResponse(thread, data) {
        var _a;
        if (data.event !== "output")
            debugadapter_1.logger.verbose(`response: ${JSON.stringify(data)}`);
        if (data.type === "event") {
            let ev = data;
            switch (ev.event) {
                case "output":
                    const outev = ev;
                    if (outev.body.output.startsWith(`@progress@:`)) {
                        const [id, ...msg] = outev.body.output.split("|");
                        if (msg.length)
                            this.sendEvent(new debugadapter_1.ProgressStartEvent(`o$${id}`, msg.join("|")));
                        else
                            this.sendEvent(new debugadapter_1.ProgressEndEvent(`o$${id}`));
                        return;
                    }
                    break;
                case "loadedSources":
                    const lsev = ev;
                    if (lsev.body.breakpoints)
                        this.mergeResponseBreakpoints(lsev.body.breakpoints, thread.id);
                    delete lsev.body.breakpoints;
                    break;
                case "continued":
                case "stopped":
                case "thread":
                    ev.body.threadId = thread.id;
                    this.lastThread = thread.id;
                    ev.body.allThreadsContinued = false;
            }
            this.sendEvent(ev);
        }
        else if (data.type === "response") {
            const response = data;
            switch (response.command) {
                case "continue":
                    (response.body || (response.body = {})).allThreadsContinued = false;
                    break;
                case "breakpointLocations":
                    const cb = (_a = this.breakpointLocationsCb) === null || _a === void 0 ? void 0 : _a.get(response.request_seq);
                    if (cb)
                        cb([thread.id, response]);
                    return;
                case "childSetExceptionBreakpoints":
                case "childTerminate":
                case "childRestart":
                case "setDataBreakpoints":
                    return;
                case "childLaunch":
                    if (response.body) {
                        if (!thread.name) {
                            let threadName = response.body.name || "Thread";
                            const count = this.knownThreadNames[threadName] || 0;
                            this.knownThreadNames[threadName] = count + 1;
                            if (count !== 0)
                                threadName += `[${count}]`;
                            thread.name = threadName;
                        }
                        for (const i of response.body.breakpoints)
                            this.mergeResponseBreakpoints(i.breakpoints, thread.id);
                    }
                    this.sendEvent(new debugadapter_1.ThreadEvent("started", thread.id));
                    return;
                case "childSetBreakpoints":
                    if (!this.breakpointsResponseRemotes)
                        return;
                    this.breakpointsResponseRemotes.delete(thread.id);
                    if (response.body && response.body.breakpoints)
                        this.mergeResponseBreakpoints(response.body.breakpoints, thread.id, true);
                    if (this.breakpointsResponseRemotes.size !== 0)
                        return;
                    if (this.breakpointsResponseRemotes.size === 0 &&
                        this.breakpointsResponse) {
                        this.sendResponse(this.breakpointsResponse);
                        this.breakpointsResponse = void 0;
                    }
                    return;
            }
            this.sendResponse(response);
        }
    }
    shutdown() {
        if (this.stopped)
            return;
        this.stopped = true;
        if (this.connectCb)
            this.connectCb();
        for (const i of this.remotes.values())
            i.close();
        if (this.stopComms)
            this.stopComms();
        if (this.childProcess)
            this.childProcess.kill();
        super.shutdown();
    }
    sendErrorResponse(response, code, msg) {
        super.sendErrorResponse(response, code, msg);
        // TODO: check why VS doesn't show this itself
        // if (this.showError && msg) this.showError(msg);
    }
    /**
     * Called at the end of the configuration sequence.
     * Indicates that all breakpoints etc. have been sent to the DA and that the 'launch' can start.
     */
    configurationDoneRequest(response, args) {
        super.configurationDoneRequest(response, args);
        if (this.configurationCb)
            this.configurationCb();
        this.configurationDone = true;
    }
    launchRequest(response, args) {
        return __awaiter(this, void 0, void 0, function* () {
            debugadapter_1.logger.setup(args.verbose
                ? debugadapter_1.Logger.LogLevel.Verbose
                : args.verbose === false
                    ? debugadapter_1.Logger.LogLevel.Stop
                    : debugadapter_1.Logger.LogLevel.Log, false);
            let cwd = args.cwd;
            let progressId = this.supportsProgress && `LAUNCH$${progressCnt++}`;
            const preset = args.preset || "node";
            if (preset === "browser" || preset === "next") {
                this.sendErrorResponse(response, 1009, BROWSERS_ZERO_CONFIG_NOT_SUPPORTED);
                return;
            }
            const isNode = preset === "node";
            const needsLaunch = preset !== "listener";
            if (!cwd) {
                cwd = args.cwd = process.cwd();
            }
            const runtime = args.runtime || "@effectful/debugger";
            const runtimeBase = packageBase(runtime);
            let debuggerImpl;
            const resolvePaths = require.resolve.paths && [
                ...new Set([cwd].concat(require.resolve.paths(cwd), require.resolve.paths(__dirname)))
            ];
            debugadapter_1.logger.log(`Searching ${runtimeBase} in ${resolvePaths}`);
            try {
                debuggerImpl = resolvePaths
                    ? require.resolve(runtimeBase, { paths: resolvePaths })
                    : require.resolve(runtimeBase);
            }
            catch (e) {
                if (e.code !== "MODULE_NOT_FOUND") {
                    this.sendErrorResponse(response, 1002, `Couldn't resolve the debuggers runtime - ${e}`);
                    return;
                }
                debugadapter_1.logger.log(`couldn't find "${runtimeBase}" runtime, installing it....(please wait, this may take a few minutes)`);
                let cb;
                if (progressId)
                    this.sendEvent(new debugadapter_1.ProgressStartEvent(`i$${progressId}`, "Installing runtime (please wait, this may take a few minutes)"));
                const env = Object.assign({}, process.env);
                const child = process.platform === "win32"
                    ? (0, child_process_1.spawn)("npm", [
                        "install",
                        "--no-package-lock",
                        "--no-save",
                        "--global-style",
                        "--no-audit",
                        runtimeBase
                    ], { shell: true, cwd: path.join(__dirname, ".."), env })
                    : (0, child_process_1.spawn)(process.env.SHELL || "bash", [
                        "-ilc",
                        `"npm install --no-package-lock --no-save --global-style --no-audit ${runtimeBase}"`
                    ], { shell: true, cwd: path.join(__dirname, ".."), env });
                child.on("error", data => {
                    this.sendErrorResponse(response, 1003, `Cannot install ${runtimeBase} (${data.message}). ${INSTAL_INSTRUCTION}`);
                    this.terminate("install error: " + data.message);
                    cb(true);
                });
                child.stdout.on("data", data => {
                    debugadapter_1.logger.log("install: " + String(data));
                });
                child.stderr.on("data", data => {
                    debugadapter_1.logger.log("install: " + String(data));
                });
                child.on("exit", code => {
                    if (progressId)
                        this.sendEvent(new debugadapter_1.ProgressEndEvent(`i$${progressId}`));
                    if (!code)
                        return cb(false);
                    this.sendErrorResponse(response, 1003, `Cannot install ${runtimeBase} (Exit code: ${code}). ${INSTAL_INSTRUCTION}`);
                    cb(true);
                });
                if (yield new Promise(i => (cb = i)))
                    return;
                debuggerImpl = path.resolve(path.join(__dirname, "..", "node_modules", runtimeBase, "vscode.js"));
            }
            debugadapter_1.logger.log(`Using ${runtime} from ${debuggerImpl}`);
            debuggerImpl = path.dirname(normalizeDrive(debuggerImpl));
            const runJs = path.join(debuggerImpl, "config", preset, "run.js");
            const debuggerDeps = process.env["EFFECTFUL_DEBUGGER_DEPS"] ||
                (args.env && args.env["EFFECTFUL_DEBUGGER_DEPS"]) ||
                path.resolve(path.join(debuggerImpl, "..", ".."));
            this.stopComms = (0, wscomms_1.default)((remote) => {
                debugadapter_1.logger.verbose(`new debuggee: ${remote.id}`);
                this.remotes.set(remote.id, remote);
                remote.onclose = () => this.closeRemote(remote.id);
                remote.onmessage = data => this.dispatchResponse(remote, data);
                remote.onerror = reason => debugadapter_1.logger.error(reason);
                if (this.launched)
                    this.launchChild(remote);
                if (this.connectCb)
                    this.connectCb();
            }, args.debuggerHost || "127.0.0.1", args.debuggerPort || 20011);
            this.launchArgs = args;
            if (args.verbose)
                debugadapter_1.logger.verbose(`launch request ${JSON.stringify(args)}`);
            this.sendEvent(new debugadapter_1.CapabilitiesEvent({
                supportsStepBack: !!args.timeTravel,
                supportsRestartFrame: false,
                supportsRestartRequest: !!args.fastRestart || args.preset !== "node",
                supportsEvaluateForHovers: !!args.timeTravel,
                supportsDataBreakpoints: !!args.timeTravel
            }));
            let errMessage;
            if (args.reconnectTimeout)
                this.awaitReconnect = args.reconnectTimeout * 1000;
            if (needsLaunch) {
                const env = {};
                const host = !args.debuggerHost ||
                    args.debuggerHost === "::" ||
                    args.debuggerHost === "0.0.0.0"
                    ? "127.0.0.1"
                    : args.debuggerHost;
                if (process.env["EFFECTFUL_DEBUGGER_VERBOSE"] == null)
                    env["EFFECTFUL_DEBUGGER_VERBOSE"] = args.verbose
                        ? String(args.verbose)
                        : "0";
                if (args.moduleAliases != null) {
                    env["EFFECTFUL_MODULE_ALIASES"] = JSON.stringify(args.moduleAliases);
                }
                if (process.env["EFFECTFUL_DEBUGGER_URL"] == null)
                    env["EFFECTFUL_DEBUGGER_URL"] = `ws://${host}:${args.debuggerPort || 20011}`;
                if (runtime)
                    env["EFFECTFUL_DEBUGGER_RUNTIME"] = runtime;
                env["EFFECTFUL_DEBUGGER_OPEN"] = args.open ? String(args.open) : "0";
                env["EFFECTFUL_DEBUGGER_TIME_TRAVEL"] = args.timeTravel
                    ? String(!!args.timeTravel)
                    : "0";
                if (args.srcRoot)
                    env["EFFECTFUL_DEBUGGER_SRC_ROOT"] = args.srcRoot;
                if (args.env)
                    Object.assign(env, args.env);
                let term = this.supportsRunInTerminalRequest
                    ? args.console
                    : "internalConsole";
                if (term === true)
                    term = "externalTerminal";
                else if (!term)
                    term = "internalConsole";
                const reuse = args.reuse && term === "internalConsole";
                if (!("EFFECTFUL_DEBUGGER_RUNTIME_PACKAGES" in env ||
                    "EFFECTFUL_DEBUGGER_RUNTIME_PACKAGES" in process.env))
                    env["EFFECTFUL_DEBUGGER_RUNTIME_PACKAGES"] = debuggerDeps;
                if (args.include)
                    env["EFFECTFUL_DEBUGGER_INCLUDE"] = args.include;
                if (args.blackbox)
                    env["EFFECTFUL_DEBUGGER_BLACKBOX"] = args.blackbox;
                if (args.exclude)
                    env["EFFECTFUL_DEBUGGER_EXCLUDE"] = args.exclude;
                if (isNode) {
                    const node_path = [debuggerDeps];
                    if (env.NODE_PATH)
                        node_path.push(env.NODE_PATH);
                    env.NODE_PATH = node_path.join(path.delimiter);
                }
                const launchArgs = [`--max-old-space-size=${MAX_OLD_SPACE}`, runJs];
                if (typeof env["NODE_ARGS"] === "string")
                    launchArgs.unshift(env["NODE_ARGS"]);
                if (args.command)
                    launchArgs.push(args.command);
                if (args.args)
                    launchArgs.push(...args.args);
                if (term === "externalTerminal" || term === "integratedTerminal") {
                    const termArgs = {
                        kind: term === "integratedTerminal" ? "integrated" : "external",
                        title: "Effectful Debug Console",
                        cwd,
                        args: ["node", ...launchArgs],
                        env
                    };
                    this.runInTerminalRequest(termArgs, RUNINTERMINAL_TIMEOUT, runResponse => {
                        if (!runResponse.success) {
                            this.sendErrorResponse(response, 1001, `Cannot launch debug target in terminal (${runResponse.message}).`);
                            this.terminate("terminal error: " + runResponse.message);
                        }
                    });
                }
                else {
                    let child;
                    const cmdline = launchArgs.slice(1).join(" ");
                    let key = cmdline;
                    const timeTravel = !!args.timeTravel;
                    if (reuse) {
                        key = `${cmdline}@${cwd}/${timeTravel}/${JSON.stringify(env)}`;
                        child = runningCommands.get(key);
                    }
                    let startBuf = [];
                    if (progressId)
                        env["EFFECTFUL_PROGRESS_ID"] = `@progress@:`;
                    if (!child) {
                        const spawnArgs = {
                            cwd,
                            env: Object.assign(Object.assign({}, process.env), env),
                            shell: true
                        };
                        if (args.argv0)
                            spawnArgs.argv0 = args.argv0;
                        child = (0, child_process_1.spawn)("node", launchArgs, spawnArgs);
                        debugadapter_1.logger.verbose(`SPAWN: node ${cmdline} ${JSON.stringify(Object.assign(Object.assign({}, spawnArgs), { env }))}`);
                        child.on("error", data => {
                            this.sendErrorResponse(response, 1001, `Cannot launch debug target in terminal (${data.message}).`);
                            this.terminate("spawn error: " + data.message);
                        });
                        const { stdout, stderr } = child;
                        if (!stdout || !stderr)
                            throw new TypeError("INTERNAL: spawn channels errors");
                        stdout.on("data", data => {
                            const txt = String(data);
                            if (args.verbose)
                                debugadapter_1.logger.verbose(txt);
                            if (!this.launched)
                                startBuf.push(txt);
                        });
                        stderr.on("data", data => {
                            const txt = String(data);
                            if (args.verbose)
                                debugadapter_1.logger.error(txt);
                            if (!this.launched)
                                startBuf.push(txt);
                        });
                        child.on("exit", code => {
                            if (!this.launched && startBuf.length) {
                                errMessage = startBuf.join("");
                            }
                            debugadapter_1.logger.verbose(`command "${cmdline}" exited with ${code}`);
                            if (args.reuse && key)
                                runningCommands.delete(key);
                            this.closeRemote(0);
                        });
                        if (reuse && key)
                            runningCommands.set(key, child);
                        else
                            this.childProcess = child;
                    }
                }
            }
            if (!this.remotes.size) {
                debugadapter_1.logger.log("Awaiting a debuggee to connect back");
                if (progressId)
                    this.sendEvent(new debugadapter_1.ProgressStartEvent(`s$${progressId}`, "Awating a debuggee"));
                yield new Promise(i => (this.connectCb = i));
                debugadapter_1.logger.verbose("first connection");
                this.connectCb = undefined;
            }
            if (this.remotes.size && !this.stopped) {
                // wait until configuration has finished (and configurationDoneRequest has been called)
                if (!this.configurationDone) {
                    yield Promise.race([
                        new Promise(i => (this.configurationCb = i)),
                        new Promise(i => setTimeout(i, CONFIGURATION_DONE_REQUEST_TIMEOUT))
                    ]);
                }
                debugadapter_1.logger.verbose("config done");
                for (const remote of this.remotes.values())
                    this.launchChild(remote);
            }
            if (progressId)
                this.sendEvent(new debugadapter_1.ProgressEndEvent(`s$${progressId}`));
            if (this.stopped) {
                response.success = false;
                this.sendErrorResponse(response, 1002, errMessage || "The application has stopped");
                return;
            }
            this.launched = true;
            this.sendResponse(response);
        });
    }
    launchChild(remote) {
        const args = this.launchArgs || {};
        debugadapter_1.logger.verbose(`launching {remote.id}...`);
        remote.send({
            command: "childLaunch",
            arguments: {
                threadId: remote.id,
                noDebug: args.noDebug,
                restart: args.__restart,
                stopOnEntry: args.stopOnEntry,
                stopOnExit: args.stopOnExit,
                dirSep: path.sep,
                exceptions: this.exceptionArgs,
                fastRestart: args.fastRestart,
                timeTravelDisabled: args.timeTravelDisabled,
                onChange: args.onChange,
                breakpoints: [...this.breakpointsSrcs].map(([srcPath, breakpoints]) => ({
                    breakpoints: breakpoints.map(i => i.response),
                    source: typeof srcPath === "number"
                        ? { sourceReference: srcPath }
                        : { path: normalizeDrive(srcPath) }
                }))
            }
        });
    }
    doBreakpointsLocations(req) {
        return __awaiter(this, void 0, void 0, function* () {
            const resp = new debugadapter_1.Response(req);
            resp.body = { breakpoints: [] };
            const awaiting = new Set(this.remotes.keys());
            const args = req.arguments;
            if (args.source.path)
                args.source.path = normalizeDrive(args.source.path);
            this.sendAll(req);
            while (awaiting.size) {
                const [remote, clientResp] = yield new Promise(i => this.breakpointLocationsCb.set(req.seq, i));
                awaiting.delete(remote);
                if (clientResp.body.breakpoints.length) {
                    resp.body.breakpoints.push(...clientResp.body.breakpoints);
                    break;
                }
            }
            this.breakpointLocationsCb.delete(req.seq);
            this.sendResponse(resp);
        });
    }
    doSetBreakpoints(req) {
        const args = req.arguments;
        const srcPath = args.source.sourceReference || args.source.path || 0;
        if (args.source.path)
            args.source.path = normalizeDrive(args.source.path);
        // clear all breakpoints for this file
        const response = new debugadapter_1.Response(req);
        const bps = [];
        if (args.breakpoints) {
            for (const i of args.breakpoints) {
                const id = ++this.breakpointsCount;
                const response = Object.assign(Object.assign({}, i), { id, verified: false, source: args.source });
                const bpi = {
                    id,
                    remotes: new Map(),
                    source: args.source,
                    request: i,
                    response
                };
                bps.push(bpi);
                this.breakpointsIds.set(id, bpi);
            }
        }
        const old = this.breakpointsSrcs.get(srcPath);
        if (old) {
            for (const i of old)
                this.breakpointsIds.delete(i.id);
        }
        if (bps.length) {
            this.breakpointsSrcs.set(srcPath, bps);
        }
        else if (old) {
            this.breakpointsSrcs.delete(srcPath);
        }
        const breakpoints = bps.map(i => i.response);
        response.body = { breakpoints };
        if (this.remotes.size) {
            this.breakpointsResponse = response;
            this.breakpointsResponseRemotes = new Set(this.remotes.keys());
            for (const remote of this.remotes.values()) {
                remote.send({
                    command: "childSetBreakpoints",
                    seq: req.seq,
                    arguments: {
                        breakpoints,
                        source: args.source,
                        sourceModified: args.sourceModified
                    }
                });
            }
        }
        else {
            this.sendResponse(response);
        }
    }
    mergeResponseBreakpoints(bodyBreakpoints, remoteId, isResponse) {
        for (const i of bodyBreakpoints) {
            const bpi = this.breakpointsIds.get(i.id);
            if (!bpi)
                continue;
            const response = bpi.response;
            // NextJS removes some functions from the sources, so breakpoints move to some next line
            // we keep only the closest to the request breakpoints and ask the client to disable the
            // moved breakpoint
            if (i.verified) {
                const origLine = bpi.request.line;
                let diff = Infinity;
                let minResponse = response;
                bpi.remotes.set(remoteId, i);
                for (const bp of bpi.remotes.values()) {
                    if (!bp.line)
                        continue;
                    const curDiff = Math.abs(bp.line - origLine);
                    if (curDiff > diff)
                        continue;
                    diff = curDiff;
                    minResponse = bp;
                }
                for (const [remote, bp] of bpi.remotes) {
                    if (bp.line !== minResponse.line)
                        this.sendToThread(remote, {
                            seq: 0,
                            type: "request",
                            command: "childDisableBreakpoint",
                            arguments: { id: bp.id, source: bpi.source }
                        });
                }
                if (i.line === minResponse.line)
                    Object.assign(bpi.response, i);
            }
            else
                bpi.remotes.delete(remoteId);
            if (!bpi.remotes.size)
                response.verified = false;
            if (!isResponse)
                this.sendEvent(new debugadapter_1.BreakpointEvent("changed", response));
        }
    }
    threadsRequest(response) {
        // runtime supports now threads so just return a default thread.
        response.body = {
            threads: [...this.remotes].map(([id, thread]) => new debugadapter_1.Thread(id, thread.name || `Thread ${id}`))
        };
        this.sendResponse(response);
    }
    disconnectRequest(response, args) {
        debugadapter_1.logger.verbose("preparing disconnect");
        this.stopped = true;
        if (this.configurationCb)
            this.configurationCb();
        super.disconnectRequest(response, args);
    }
}
exports.DebugSession = DebugSession;
//# sourceMappingURL=session.js.map