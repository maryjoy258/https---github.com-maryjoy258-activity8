"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toThread = exports.THREAD_BITS = void 0;
exports.THREAD_BITS = 10;
const THREAD_MASK = ~(-1 << exports.THREAD_BITS);
function toThread(local) {
    return local & THREAD_MASK;
}
exports.toThread = toThread;
//# sourceMappingURL=comms.js.map