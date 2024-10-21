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
const source_map_1 = require("source-map");
const vscode_debugadapter_1 = require("vscode-debugadapter");
const fs = require("fs");
const path = require("path");
const glob = require("glob");
const normalize = require("normalize-path");
class SourceMapSession extends vscode_debugadapter_1.LoggingDebugSession {
    constructor() {
        super(...arguments);
        this._generatedfileToSourceMap = new Map();
        this._sourceMaps = new Map();
    }
    load_source_map(p_path) {
        return __awaiter(this, void 0, void 0, function* () {
            const json = JSON.parse(fs.readFileSync(p_path).toString());
            if (!json.sourceRoot)
                json.sources = json.sources.map(source => path.resolve(this.get_configs().sourceRoot, source));
            const smc = yield new source_map_1.SourceMapConsumer(json);
            return smc;
        });
    }
    loadSourceMaps() {
        return __awaiter(this, void 0, void 0, function* () {
            const commonArgs = this.get_configs();
            if (!commonArgs.sourceMaps)
                return;
            // options is optional
            const files = glob.sync("**/*.map", { cwd: commonArgs.cwd });
            for (const file of files) {
                const source_map_file = path.join(commonArgs.cwd, file);
                const smc = yield this.load_source_map(source_map_file);
                let js_file = normalize(source_map_file.substring(0, source_map_file.length - ".map".length));
                if (fs.existsSync(js_file)) {
                    js_file = this.global_to_relative(js_file);
                }
                else {
                    js_file = normalize(smc.file);
                }
                smc.file = js_file;
                this._generatedfileToSourceMap.set(js_file, smc);
                for (const s of smc.sources) {
                    this._sourceMaps.set(this.global_to_relative(s), smc);
                }
            }
        });
    }
    global_to_relative(p_file) {
        const normalized = normalize(p_file);
        if (!path.isAbsolute(normalized))
            return normalized;
        const commonArgs = this.get_configs();
        return path.relative(commonArgs.cwd, normalized);
    }
    relative_to_global(p_file) {
        const normalized = normalize(p_file);
        if (path.isAbsolute(normalized))
            return normalized;
        const commonArgs = this.get_configs();
        return path.join(commonArgs.cwd, normalized);
    }
    translateFileLocationToRemote(sourceLocation) {
        try {
            const workspace_path = normalize(this.global_to_relative(sourceLocation.source));
            const sm = this._sourceMaps.get(workspace_path);
            if (!sm)
                throw new Error('no source map');
            const actualSourceLocation = Object.assign({}, sourceLocation);
            actualSourceLocation.source = normalize(actualSourceLocation.source);
            var unmappedPosition = sm.generatedPositionFor(actualSourceLocation);
            if (!unmappedPosition.line === null)
                throw new Error('map failed');
            return {
                source: `res://${sm.file}`,
                // the source-map docs indicate that line is 1 based, but that seems to be wrong.
                line: (unmappedPosition.line || 0) + 1,
                column: unmappedPosition.column || 0,
            };
        }
        catch (e) {
            var ret = Object.assign({}, sourceLocation);
            ret.source = "res://" + this.global_to_relative(sourceLocation.source);
            return ret;
        }
    }
    translateRemoteLocationToLocal(sourceLocation) {
        sourceLocation.source = sourceLocation.source.replace("res://", "");
        try {
            const sm = this._generatedfileToSourceMap.get(sourceLocation.source);
            if (!sm)
                throw new Error('no source map');
            let original = sm.originalPositionFor({ line: sourceLocation.line, column: sourceLocation.column, bias: source_map_1.SourceMapConsumer.LEAST_UPPER_BOUND });
            if (this.is_null_poisition(original)) {
                throw new Error("unable to map");
            }
            return original;
        }
        catch (e) {
            var ret = Object.assign({}, sourceLocation);
            ret.source = this.relative_to_global(sourceLocation.source);
            return ret;
        }
    }
    is_null_poisition(pos) {
        const original = pos;
        return (original == null || original.line === null || original.column === null || original.source === null);
    }
}
exports.SourceMapSession = SourceMapSession;
//# sourceMappingURL=sourcemapSession.js.map