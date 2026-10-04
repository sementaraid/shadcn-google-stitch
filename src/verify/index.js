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
Object.defineProperty(exports, "__esModule", { value: true });
exports.verify = verify;
exports.geometryPatcher = geometryPatcher;
exports.readDynamic = readDynamic;
var promises_1 = require("node:fs/promises");
var node_fs_1 = require("node:fs");
var node_path_1 = require("node:path");
var capture_ts_1 = require("./capture.ts");
var diff_ts_1 = require("./diff.ts");
var patch_ts_1 = require("./patch.ts");
var report_ts_1 = require("./report.ts");
function verify(opts) {
    return __awaiter(this, void 0, void 0, function () {
        var dir, ir, log, ref, _a, outDir, families, iterations, still, buildLog, i, built, cap, shot, heat, result, record, worst, previous, candidates, noted, _i, candidates_1, target, note, best, reportPath;
        var _b, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    dir = opts.dir, ir = opts.ir;
                    log = (_b = opts.onProgress) !== null && _b !== void 0 ? _b : (function () { });
                    _a = diff_ts_1.readPng;
                    return [4 /*yield*/, (0, promises_1.readFile)(opts.reference)];
                case 1:
                    ref = _a.apply(void 0, [_d.sent()]);
                    outDir = (0, node_path_1.join)(dir, '.stitch');
                    return [4 /*yield*/, (0, promises_1.mkdir)(outDir, { recursive: true })];
                case 2:
                    _d.sent();
                    families = ir.fonts.map(function (f) { return f.family; });
                    iterations = [];
                    still = 0;
                    buildLog = '';
                    i = 0;
                    _d.label = 3;
                case 3:
                    if (!(i <= Math.max(0, opts.maxIter))) return [3 /*break*/, 13];
                    return [4 /*yield*/, (0, capture_ts_1.buildProject)(dir)];
                case 4:
                    built = _d.sent();
                    buildLog = built.log;
                    if (!built.ok) {
                        log("  iteration ".concat(i, ": build failed").concat(built.log.trim() ? ' — see report.html' : ''));
                        return [3 /*break*/, 13];
                    }
                    return [4 /*yield*/, (0, capture_ts_1.capture)(dir, ir, families)];
                case 5:
                    cap = _d.sent();
                    shot = (0, node_path_1.join)(outDir, "render-".concat(i, ".png"));
                    heat = (0, node_path_1.join)(outDir, "heatmap-".concat(i, ".png"));
                    return [4 /*yield*/, (0, promises_1.writeFile)(shot, cap.png)];
                case 6:
                    _d.sent();
                    result = (0, diff_ts_1.diff)(ref, (0, diff_ts_1.readPng)(cap.png), ir, {
                        substituted: cap.missingFonts,
                        dynamic: opts.dynamic,
                        rendered: cap.boxes,
                    });
                    return [4 /*yield*/, (0, promises_1.writeFile)(heat, (0, diff_ts_1.writePng)(result.heatmap))];
                case 7:
                    _d.sent();
                    record = { index: i, score: result.score, ssim: result.ssim, patches: [], shot: shot, heat: heat, diff: result };
                    iterations.push(record);
                    worst = result.worst[0];
                    log("  iteration ".concat(i, ": score ").concat((result.score * 100).toFixed(1), "% \u00B7 ssim ").concat(result.ssim.toFixed(4)) +
                        " \u00B7 worst ".concat(worst ? "".concat(worst.nodeId, " ").concat((worst.score * 100).toFixed(0), "%") : '—'));
                    previous = iterations.at(-2);
                    if (previous) {
                        if (Math.abs(result.ssim - previous.ssim) < ((_c = opts.minDelta) !== null && _c !== void 0 ? _c : 0.005)) {
                            if (++still >= 2) {
                                log('  no further change; stopping');
                                return [3 /*break*/, 13];
                            }
                        }
                        else
                            still = 0;
                    }
                    if (!opts.patch || i >= opts.maxIter)
                        return [3 /*break*/, 13];
                    candidates = result.worst.filter(function (r) { return r.score < 0.9 && r.mode !== 'masked'; });
                    noted = false;
                    _i = 0, candidates_1 = candidates;
                    _d.label = 8;
                case 8:
                    if (!(_i < candidates_1.length)) return [3 /*break*/, 11];
                    target = candidates_1[_i];
                    return [4 /*yield*/, opts.patch.patch({ ir: ir.nodes, region: target })];
                case 9:
                    note = _d.sent();
                    if (!note)
                        return [3 /*break*/, 10];
                    record.patches.push(note);
                    log("  patch ".concat(target.nodeId, ": ").concat(note));
                    noted = true;
                    return [3 /*break*/, 11];
                case 10:
                    _i++;
                    return [3 /*break*/, 8];
                case 11:
                    if (!noted) {
                        log('  nothing patchable left; stopping');
                        return [3 /*break*/, 13];
                    }
                    _d.label = 12;
                case 12:
                    i++;
                    return [3 /*break*/, 3];
                case 13:
                    best = iterations.reduce(function (a, b) { return (b.score > a.score ? b : a); }, iterations[0]);
                    return [4 /*yield*/, (0, report_ts_1.writeReport)({ ir: ir, iterations: iterations, buildLog: buildLog, ambiguous: opts.ambiguous }, outDir)];
                case 14:
                    reportPath = _d.sent();
                    return [2 /*return*/, { iterations: iterations, best: best, reportPath: reportPath, buildLog: buildLog, converged: still >= 2 }];
            }
        });
    });
}
/**
 * The deterministic patcher: move a region toward the box the reference measured.
 *
 * Geometry is the one correction the loop can make without a model — the IR
 * holds where the node *was*, the render reports where it landed, and the
 * difference is arithmetic. Anything beyond that (a wrong component, a wrong
 * variant) is a judgement call and belongs to the M6 LLM patcher.
 */
function geometryPatcher(dir) {
    return {
        patch: function (_a) {
            return __awaiter(this, arguments, void 0, function (_b) {
                var patcher, result;
                var _c;
                var ir = _b.ir, region = _b.region;
                return __generator(this, function (_d) {
                    switch (_d.label) {
                        case 0:
                            patcher = new patch_ts_1.AstPatcher(dir);
                            return [4 /*yield*/, patcher.load()];
                        case 1:
                            _d.sent();
                            return [4 /*yield*/, patcher.patchGeometry(region.nodeId, region, ir)];
                        case 2:
                            result = _d.sent();
                            if (!result) return [3 /*break*/, 4];
                            return [4 /*yield*/, patcher.save()];
                        case 3:
                            _d.sent();
                            _d.label = 4;
                        case 4: return [2 /*return*/, (_c = result === null || result === void 0 ? void 0 : result.note) !== null && _c !== void 0 ? _c : null];
                    }
                });
            });
        },
    };
}
/** A `stitch.config.json` beside the source HTML, marking regions not worth chasing. */
function readDynamic(htmlPath) {
    return __awaiter(this, void 0, void 0, function () {
        var config, parsed, _a, _b, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    config = (0, node_path_1.join)((0, node_path_1.dirname)(htmlPath), 'stitch.config.json');
                    if (!(0, node_fs_1.existsSync)(config))
                        return [2 /*return*/, []];
                    _d.label = 1;
                case 1:
                    _d.trys.push([1, 3, , 4]);
                    _b = (_a = JSON).parse;
                    return [4 /*yield*/, (0, promises_1.readFile)(config, 'utf8')];
                case 2:
                    parsed = _b.apply(_a, [_d.sent()]);
                    return [2 /*return*/, Array.isArray(parsed.dynamic) ? parsed.dynamic : []];
                case 3:
                    _c = _d.sent();
                    return [2 /*return*/, []];
                case 4: return [2 /*return*/];
            }
        });
    });
}
