"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ws_1 = require("ws");
const comms_1 = require("./comms");
const MAX_THREAD_ID = 1 << comms_1.THREAD_BITS;
// from @effectful/debugger/state (TODO: a common module)
function subscribe(onconnect, host, port) {
    let threadCount = 0;
    if (threadCount >= MAX_THREAD_ID)
        throw new Error("Reached max threads number");
    const handlers = new Set();
    const wss = new ws_1.Server({ host, port });
    wss.on("connection", ws => {
        if (!wss)
            return;
        const id = threadCount++;
        const thread = {
            id,
            send(data) {
                ws.send(JSON.stringify(data));
            },
            close() {
                ws.close();
            }
        };
        onconnect(thread);
        ws.onerror = function (e) {
            console.error(e);
            if (thread.onerror)
                thread.onerror(e);
            ws.close();
        };
        ws.onclose = function () {
            thread.closed = true;
            if (thread.onclose)
                thread.onclose();
        };
        ws.onmessage = function (ev) {
            if (thread.onmessage)
                thread.onmessage(JSON.parse(String(ev.data)));
        };
    });
    return function () {
        handlers.delete(onconnect);
        if (wss && !handlers.size)
            wss.close();
    };
}
exports.default = subscribe;
//# sourceMappingURL=wscomms.js.map