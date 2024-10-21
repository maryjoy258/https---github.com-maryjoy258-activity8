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
const vscode = require("vscode");
const assert = require("assert");
const helper_1 = require("./helper");
describe('Should get diagnostics', () => {
    const docUri = helper_1.getDocUri('diagnostics.txt');
    it('Diagnoses uppercase texts', () => __awaiter(void 0, void 0, void 0, function* () {
        yield testDiagnostics(docUri, [
            { message: 'ANY is all uppercase.', range: toRange(0, 0, 0, 3), severity: vscode.DiagnosticSeverity.Warning, source: 'ex' },
            { message: 'ANY is all uppercase.', range: toRange(0, 14, 0, 17), severity: vscode.DiagnosticSeverity.Warning, source: 'ex' },
            { message: 'OS is all uppercase.', range: toRange(0, 18, 0, 20), severity: vscode.DiagnosticSeverity.Warning, source: 'ex' }
        ]);
    }));
});
function toRange(sLine, sChar, eLine, eChar) {
    const start = new vscode.Position(sLine, sChar);
    const end = new vscode.Position(eLine, eChar);
    return new vscode.Range(start, end);
}
function testDiagnostics(docUri, expectedDiagnostics) {
    return __awaiter(this, void 0, void 0, function* () {
        yield helper_1.activate(docUri);
        const actualDiagnostics = vscode.languages.getDiagnostics(docUri);
        assert.equal(actualDiagnostics.length, expectedDiagnostics.length);
        expectedDiagnostics.forEach((expectedDiagnostic, i) => {
            const actualDiagnostic = actualDiagnostics[i];
            assert.equal(actualDiagnostic.message, expectedDiagnostic.message);
            assert.deepEqual(actualDiagnostic.range, expectedDiagnostic.range);
            assert.equal(actualDiagnostic.severity, expectedDiagnostic.severity);
        });
    });
}
//# sourceMappingURL=diagnostics.test.js.map