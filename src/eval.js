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
exports.evalDir = evalDir;
var promises_1 = require("node:fs/promises");
var node_path_1 = require("node:path");
var ingest_ts_1 = require("./ingest.ts");
var extract_ts_1 = require("./extract.ts");
var classify_ts_1 = require("./classify/classify.ts");
var index_generated_ts_1 = require("./registry/shadcn/index.generated.ts");
/**
 * Ground truth lives in the fixture as a `stitch-node` attribute. It is read
 * here through the page, never through the IR: the walker does not capture that
 * attribute, so the classifier is provably blind to the answers.
 */
function readLabels(ing) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, ing.page.evaluate(function () {
                    return Array.from(document.querySelectorAll('[stitch-node]')).map(function (el) {
                        var _a;
                        var r = el.getBoundingClientRect();
                        return {
                            label: (_a = el.getAttribute('stitch-node')) !== null && _a !== void 0 ? _a : '',
                            tag: el.tagName.toLowerCase(),
                            box: { x: r.x, y: r.y, w: r.width, h: r.height },
                        };
                    });
                })];
        });
    });
}
var near = function (a, b) { return Math.abs(a - b) <= 0.5; };
function findNode(ir, label) {
    for (var _i = 0, _a = Object.values(ir.nodes); _i < _a.length; _i++) {
        var n = _a[_i];
        if (n.tag !== label.tag)
            continue;
        if (near(n.box.x, label.box.x) && near(n.box.y, label.box.y) && near(n.box.w, label.box.w))
            return n;
    }
    return null;
}
function runFixture(htmlPath, pngPath) {
    return __awaiter(this, void 0, void 0, function () {
        var ing, ir, classes, labels, result, _loop_1, _i, labels_1, label;
        var _a, _b, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0: return [4 /*yield*/, (0, ingest_ts_1.ingest)(htmlPath, pngPath, { deviceScaleFactor: 1 })];
                case 1:
                    ing = _d.sent();
                    _d.label = 2;
                case 2:
                    _d.trys.push([2, , 5, 7]);
                    return [4 /*yield*/, (0, extract_ts_1.extract)(ing)];
                case 3:
                    ir = _d.sent();
                    classes = (0, classify_ts_1.classify)(ir);
                    return [4 /*yield*/, readLabels(ing)];
                case 4:
                    labels = _d.sent();
                    result = {
                        name: (0, node_path_1.basename)(htmlPath),
                        labels: labels.length,
                        matched: 0,
                        truePositives: 0,
                        falsePositives: 0,
                        falseNegatives: 0,
                        negativeViolations: [],
                        mismatches: [],
                        ambiguous: (0, classify_ts_1.ambiguous)(classes, (0, classify_ts_1.interiorOf)(ir.nodes, classes)).length,
                    };
                    _loop_1 = function (label) {
                        var node = findNode(ir, label);
                        if (!node) {
                            result.mismatches.push("".concat(label.label, ": no IR node for that box (").concat(Math.round(label.box.w), "\u00D7").concat(Math.round(label.box.h), ")"));
                            return "continue";
                        }
                        result.matched++;
                        var c = classes.get(node.id);
                        var _e = label.label.split('.'), wantComponent = _e[0], wantVariant = _e[1];
                        if (wantComponent === 'NEG') {
                            if (c === null || c === void 0 ? void 0 : c.component) {
                                result.negativeViolations.push("".concat(label.label, " (").concat(node.id, ") wrongly classified as ").concat(c.component, ":").concat(c.score.toFixed(2)));
                                result.falsePositives++;
                            }
                            return "continue";
                        }
                        if ((c === null || c === void 0 ? void 0 : c.component) === wantComponent) {
                            result.truePositives++;
                            // `Button.Icon` labels the size, `Badge.Outline` the variant. Accept the
                            // label matching any variant field rather than assuming which.
                            if (wantVariant) {
                                var want_1 = wantVariant.toLowerCase();
                                // Checked-ness is state, not an enum: it is writable only through the
                                // uncontrolled prop, so assert that rather than membership in a list.
                                if (want_1 === 'checked' || want_1 === 'unchecked') {
                                    var on = c.variants.defaultChecked === 'true';
                                    if (on !== (want_1 === 'checked')) {
                                        result.mismatches.push("".concat(label.label, " (").concat(node.id, ") defaultChecked ").concat(on, " != ").concat(want_1 === 'checked'));
                                    }
                                    return "continue";
                                }
                                // Compare effective props, defaults included. The classifier omits a
                                // prop equal to the component's default because React applies it
                                // anyway, so `{}` on a Button really is variant=default size=default.
                                var axis = (_b = (_a = index_generated_ts_1.SHADCN[wantComponent]) === null || _a === void 0 ? void 0 : _a.variants) !== null && _b !== void 0 ? _b : [];
                                var effective = axis
                                    .map(function (a) { var _a; return (_a = c.variants[a.prop]) !== null && _a !== void 0 ? _a : a.default; })
                                    .filter(function (v) { return v !== null; });
                                if (effective.length && !effective.some(function (v) { return v.toLowerCase() === want_1; })) {
                                    result.mismatches.push("".concat(label.label, " (").concat(node.id, ") variants ").concat(effective.join('/'), " != ").concat(want_1));
                                }
                            }
                        }
                        else if (c === null || c === void 0 ? void 0 : c.component) {
                            result.falsePositives++;
                            result.falseNegatives++;
                            result.mismatches.push("".concat(label.label, " (").concat(node.id, ") got ").concat(c.component, ":").concat(c.score.toFixed(2), ", want ").concat(wantComponent));
                        }
                        else {
                            result.falseNegatives++;
                            var top_1 = (_c = c === null || c === void 0 ? void 0 : c.candidates) === null || _c === void 0 ? void 0 : _c[0];
                            result.mismatches.push("".concat(label.label, " (").concat(node.id, ") unclassified").concat(top_1 ? " \u2014 best ".concat(top_1.name, ":").concat(top_1.score.toFixed(2)) : ''));
                        }
                    };
                    for (_i = 0, labels_1 = labels; _i < labels_1.length; _i++) {
                        label = labels_1[_i];
                        _loop_1(label);
                    }
                    return [2 /*return*/, result];
                case 5: return [4 /*yield*/, ing.close()];
                case 6:
                    _d.sent();
                    return [7 /*endfinally*/];
                case 7: return [2 /*return*/];
            }
        });
    });
}
function evalDir(dir) {
    return __awaiter(this, void 0, void 0, function () {
        var entries, htmls, tp, fp, fn, violations, labels, _i, htmls_1, html, png, r, seen, acc, _a, _b, m, _c, _d, v, precision, recall, ok;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0: return [4 /*yield*/, (0, promises_1.readdir)(dir)];
                case 1:
                    entries = _e.sent();
                    htmls = entries.filter(function (e) { return e.endsWith('.html'); });
                    if (htmls.length === 0) {
                        console.error("no .html fixtures in ".concat(dir));
                        return [2 /*return*/, false];
                    }
                    tp = 0;
                    fp = 0;
                    fn = 0;
                    violations = 0;
                    labels = 0;
                    _i = 0, htmls_1 = htmls;
                    _e.label = 2;
                case 2:
                    if (!(_i < htmls_1.length)) return [3 /*break*/, 5];
                    html = htmls_1[_i];
                    png = html.replace(/\.html$/, '.png');
                    if (!entries.includes(png)) {
                        console.error("".concat(html, ": no matching ").concat(png, ", skipping"));
                        return [3 /*break*/, 4];
                    }
                    return [4 /*yield*/, runFixture((0, node_path_1.join)(dir, html), (0, node_path_1.join)(dir, png))];
                case 3:
                    r = _e.sent();
                    labels += r.labels;
                    tp += r.truePositives;
                    fp += r.falsePositives;
                    fn += r.falseNegatives;
                    violations += r.negativeViolations.length;
                    seen = r.truePositives + r.falseNegatives;
                    acc = seen ? ((r.truePositives / seen) * 100).toFixed(0) : '—';
                    console.error("\n".concat(r.name, ": ").concat(r.truePositives, "/").concat(seen, " labelled components (").concat(acc, "%), ").concat(r.ambiguous, " ambiguous, ").concat(r.labels, " labels"));
                    for (_a = 0, _b = r.mismatches; _a < _b.length; _a++) {
                        m = _b[_a];
                        console.error("  miss  ".concat(m));
                    }
                    for (_c = 0, _d = r.negativeViolations; _c < _d.length; _c++) {
                        v = _d[_c];
                        console.error("  NEG   ".concat(v));
                    }
                    _e.label = 4;
                case 4:
                    _i++;
                    return [3 /*break*/, 2];
                case 5:
                    precision = tp + fp ? tp / (tp + fp) : 1;
                    recall = tp + fn ? tp / (tp + fn) : 1;
                    console.error("\nprecision ".concat((precision * 100).toFixed(1), "%  recall ").concat((recall * 100).toFixed(1), "%"));
                    console.error("tp ".concat(tp, "  fp ").concat(fp, "  fn ").concat(fn, "  labels ").concat(labels, "  negative violations ").concat(violations));
                    ok = recall >= 0.8 && precision >= 0.8 && violations === 0;
                    console.error(ok ? 'PASS' : 'FAIL');
                    return [2 /*return*/, ok];
            }
        });
    });
}
