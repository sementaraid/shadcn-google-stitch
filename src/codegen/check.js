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
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isSyntactic = isSyntactic;
exports.parseAndCheck = parseAndCheck;
var promises_1 = require("node:fs/promises");
var node_path_1 = require("node:path");
var ts_morph_1 = require("ts-morph");
/** Errors that are about the shape of the code, not about resolving modules. */
function isSyntactic(d) {
    return d.getCategory() === ts_morph_1.ts.DiagnosticCategory.Error;
}
function parseAndCheck(dir) {
    return __awaiter(this, void 0, void 0, function () {
        var project, files, problems, generated, entries, _a, _i, _b, name_1, path, source, tree, _c, _d, el, attr, value;
        var _e;
        return __generator(this, function (_f) {
            switch (_f.label) {
                case 0:
                    project = new ts_morph_1.Project({
                        skipAddingFilesFromTsConfig: true,
                        compilerOptions: { jsx: ts_morph_1.ts.JsxEmit.ReactJSX, target: ts_morph_1.ts.ScriptTarget.ES2022, noResolve: true },
                    });
                    files = [];
                    problems = [];
                    generated = (0, node_path_1.join)(dir, 'src/components/generated');
                    entries = [];
                    _f.label = 1;
                case 1:
                    _f.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, (0, promises_1.readdir)(generated)];
                case 2:
                    entries = _f.sent();
                    return [3 /*break*/, 4];
                case 3:
                    _a = _f.sent();
                    return [2 /*return*/, { ok: false, files: files, problems: ["no generated components in ".concat(generated)] }];
                case 4:
                    // Syntax-only: ask the parser for a tree and walk it. A file that parsed is a
                    // file whose every element, attribute and child the AST agrees with.
                    for (_i = 0, _b = __spreadArray(__spreadArray([], entries.filter(function (f) { return f.endsWith('.tsx'); }), true), ['..'], false); _i < _b.length; _i++) {
                        name_1 = _b[_i];
                        path = name_1 === '..' ? (0, node_path_1.join)(dir, 'src/App.tsx') : (0, node_path_1.join)(generated, name_1);
                        source = project.addSourceFileAtPath(path);
                        files.push(source.getBaseName());
                        tree = source.compilerNode;
                        problems.push.apply(problems, syntaxErrors(source, tree));
                        for (_c = 0, _d = __spreadArray(__spreadArray([], source.getDescendantsOfKind(ts_morph_1.SyntaxKind.JsxSelfClosingElement), true), source.getDescendantsOfKind(ts_morph_1.SyntaxKind.JsxOpeningElement), true); _c < _d.length; _c++) {
                            el = _d[_c];
                            attr = el
                                .getAttributes()
                                .filter(function (a) { return a.getKind() === ts_morph_1.SyntaxKind.JsxAttribute; })
                                .find(function (a) { return a.getNameNode().getText() === 'data-stitch-id'; });
                            if (!attr)
                                continue;
                            value = attr.getInitializer();
                            if (!value || !/^"n\d{4}"$/.test(value.getText())) {
                                problems.push("".concat(source.getBaseName(), ": malformed data-stitch-id ").concat((_e = value === null || value === void 0 ? void 0 : value.getText()) !== null && _e !== void 0 ? _e : '(none)'));
                            }
                        }
                    }
                    return [2 /*return*/, { ok: problems.length === 0, files: files, problems: problems }];
            }
        });
    });
}
/**
 * Parse the file the way TypeScript does and keep only grammatical complaints.
 * `transpile` gives the syntactic diagnostics without ever touching the module
 * graph, which is exactly the surface this check is about.
 */
function syntaxErrors(source, _tree) {
    var _a, _b;
    var out = ts_morph_1.ts.transpileModule(source.getFullText(), {
        fileName: source.getFilePath(),
        reportDiagnostics: true,
        compilerOptions: { jsx: ts_morph_1.ts.JsxEmit.ReactJSX, target: ts_morph_1.ts.ScriptTarget.ES2022 },
    });
    var name = (_a = source.getFilePath().split('/').pop()) !== null && _a !== void 0 ? _a : 'file';
    return ((_b = out.diagnostics) !== null && _b !== void 0 ? _b : [])
        .filter(function (d) { return d.category === ts_morph_1.ts.DiagnosticCategory.Error; })
        .map(function (d) { return "".concat(name, ": ").concat(ts_morph_1.ts.flattenDiagnosticMessageText(d.messageText, ' ')); });
}
