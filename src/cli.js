#!/usr/bin/env node
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
var commander_1 = require("commander");
var promises_1 = require("node:fs/promises");
var node_path_1 = require("node:path");
var ingest_ts_1 = require("./ingest.ts");
var extract_ts_1 = require("./extract.ts");
var classify_ts_1 = require("./classify/classify.ts");
var report_ts_1 = require("./report.ts");
var eval_ts_1 = require("./eval.ts");
var project_ts_1 = require("./codegen/project.ts");
var theme_ts_1 = require("./codegen/theme.ts");
var check_ts_1 = require("./codegen/check.ts");
var index_ts_1 = require("./verify/index.ts");
var program = new commander_1.Command();
program
    .name('stitch')
    .description('Stitch HTML + screenshot → Vite + React + TS + Tailwind v4 + shadcn')
    .argument('<code.html>', 'source HTML')
    .argument('<screenshot.png>', 'reference screenshot, sets the viewport')
    .option('-o, --out <dir>', 'output directory', './out')
    .option('--stack <name>', 'target stack', 'vite-react-ts')
    .option('--offline', 'skip all LLM calls', false)
    .option('--max-iter <n>', 'verify loop iterations', function (v) { return parseInt(v, 10); }, 5)
    .option('--debug-ir', 'dump ir.json + viewer.html', false)
    .option('--dpr <n>', 'device scale factor for the reference shot', function (v) { return parseFloat(v); }, 1)
    .action(function (htmlArg, shotArg, opts) { return __awaiter(void 0, void 0, void 0, function () {
    var html, shot, out, ing, ir, visible, repeats, classes, interior, s, amb, ranked, _i, _a, c, title, _b, bg, gen, art, cls, check, rankedUi, _c, _d, w, verified, _e;
    var _f;
    return __generator(this, function (_g) {
        switch (_g.label) {
            case 0:
                html = (0, node_path_1.resolve)(htmlArg);
                shot = (0, node_path_1.resolve)(shotArg);
                out = (0, node_path_1.resolve)(opts.out);
                console.error("stitch ".concat(htmlArg, " ").concat(shotArg, " \u2192 ").concat(opts.out));
                return [4 /*yield*/, (0, ingest_ts_1.ingest)(html, shot, { deviceScaleFactor: opts.dpr })];
            case 1:
                ing = _g.sent();
                _g.label = 2;
            case 2:
                _g.trys.push([2, , 12, 14]);
                return [4 /*yield*/, (0, extract_ts_1.extract)(ing)];
            case 3:
                ir = _g.sent();
                ir.source.html = html;
                visible = Object.values(ir.nodes).filter(function (n) { return n.visible; }).length;
                repeats = new Set(Object.values(ir.nodes).filter(function (n) { return n.repeat; }).map(function (n) { return n.repeat.siblingIds.join(','); })).size;
                classes = (0, classify_ts_1.classify)(ir);
                interior = (0, classify_ts_1.interiorOf)(ir.nodes, classes);
                s = (0, classify_ts_1.stats)(classes, ir, interior);
                amb = (0, classify_ts_1.ambiguous)(classes, interior);
                console.error("  ".concat(Object.keys(ir.nodes).length, " nodes (").concat(visible, " visible), ").concat(repeats, " repeat groups"));
                console.error("  ".concat(ir.colors.length, " colors, ").concat(ir.fonts.length, " font families"));
                console.error("  classified ".concat(s.accepted, " \u00B7 ").concat(s.icons, " icons \u00B7 ").concat(s.ambiguous, " ambiguous"));
                ranked = Object.entries(s.byComponent).sort(function (a, b) { return b[1] - a[1]; });
                if (ranked.length)
                    console.error("  ".concat(ranked.map(function (_a) {
                        var k = _a[0], v = _a[1];
                        return "".concat(k, "\u00D7").concat(v);
                    }).join(' ')));
                if (amb.length) {
                    console.error("  ".concat(amb.length, " ambiguous node(s) queued for the LLM pass (M6)"));
                    for (_i = 0, _a = amb.slice(0, 5); _i < _a.length; _i++) {
                        c = _a[_i];
                        console.error("    ".concat(c.nodeId, " ").concat(c.candidates.map(function (x) { return "".concat(x.name, ":").concat(x.score.toFixed(2)); }).join(' ')));
                    }
                }
                if (!(0, project_ts_1.templateExists)()) {
                    console.error('  codegen: template missing, skipping');
                    return [2 /*return*/];
                }
                _b = pageTitle;
                return [4 /*yield*/, (0, promises_1.readFile)(html, 'utf8')];
            case 4:
                title = _b.apply(void 0, [_g.sent()]);
                bg = (0, theme_ts_1.pageBackground)(ir);
                return [4 /*yield*/, (0, project_ts_1.scaffoldProject)(ir, classes, {
                        out: out,
                        html: html,
                        title: title,
                        dark: (0, theme_ts_1.isDarkPage)(bg),
                    })
                    // Debug artifacts go in a dot-directory beside the project, written after
                    // the scaffold: the scaffold replaces the output directory wholesale, and
                    // these have to survive that.
                ];
            case 5:
                gen = _g.sent();
                return [4 /*yield*/, (0, report_ts_1.writeArtifacts)(ir, (0, node_path_1.join)(out, '.stitch'), shot)];
            case 6:
                art = _g.sent();
                return [4 /*yield*/, (0, report_ts_1.writeClassifications)(classes, amb, (0, node_path_1.join)(out, '.stitch'))];
            case 7:
                cls = _g.sent();
                return [4 /*yield*/, (0, check_ts_1.parseAndCheck)(out)];
            case 8:
                check = _g.sent();
                console.error('');
                console.error("  generated ".concat(gen.files.length, " files \u2192 ").concat(out));
                console.error("  fonts     ".concat(gen.fonts.referenced.join(', ') || '(none)'));
                rankedUi = __spreadArray([], new Set(__spreadArray([], classes.values(), true).map(function (c) { return c.component; }).filter(Boolean)), true);
                console.error("  ui        ".concat(rankedUi.length, " components"));
                console.error("  ir.json   ".concat(art.irJson));
                console.error("  viewer    ".concat(art.viewer));
                console.error("  classify  ".concat(cls));
                for (_c = 0, _d = __spreadArray(__spreadArray([], gen.warnings, true), check.problems, true); _c < _d.length; _c++) {
                    w = _d[_c];
                    console.error("  warn      ".concat(w));
                }
                if (!check.ok) {
                    console.error('  ✗ generated files do not parse');
                    process.exitCode = 1;
                }
                else {
                    console.error("  \u2713 ".concat(check.files.length, " files parse clean"));
                }
                if (!check.ok) return [3 /*break*/, 11];
                _e = index_ts_1.verify;
                _f = {
                    dir: out,
                    ir: ir,
                    reference: shot,
                    maxIter: opts.maxIter,
                    // Geometry only, which is the one correction the loop can make from
                    // measurement alone. Judgement calls — wrong component, wrong variant —
                    // are the M6 LLM patcher's, and the loop runs without one.
                    patch: opts.maxIter > 0 ? (0, index_ts_1.geometryPatcher)(out) : null
                };
                return [4 /*yield*/, (0, index_ts_1.readDynamic)(html)];
            case 9: return [4 /*yield*/, _e.apply(void 0, [(_f.dynamic = _g.sent(),
                        _f.ambiguous = amb.map(function (c) { return ({ nodeId: c.nodeId, candidates: c.candidates }); }),
                        _f.onProgress = function (line) { return console.error(line); },
                        _f)])];
            case 10:
                verified = _g.sent();
                console.error('');
                console.error("  score     ".concat((verified.best.score * 100).toFixed(1), "% (ssim ").concat(verified.best.ssim.toFixed(4), ")"));
                console.error("  report    ".concat(verified.reportPath));
                if (!verified.iterations.length) {
                    console.error('  warn      the generated project did not build; nothing was scored');
                }
                _g.label = 11;
            case 11: return [3 /*break*/, 14];
            case 12: return [4 /*yield*/, ing.close()];
            case 13:
                _g.sent();
                return [7 /*endfinally*/];
            case 14: return [2 /*return*/];
        }
    });
}); });
program
    .command('eval <fixturesDir>')
    .description('regression: precision/recall against labelled fixtures')
    .action(function (dirArg) { return __awaiter(void 0, void 0, void 0, function () {
    var ok;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, (0, eval_ts_1.evalDir)((0, node_path_1.resolve)(dirArg))];
            case 1:
                ok = _a.sent();
                if (!ok)
                    process.exitCode = 1;
                return [2 /*return*/];
        }
    });
}); });
/** The page title, so the generated project is named after its source. */
function pageTitle(html) {
    var _a, _b;
    return ((_b = (_a = /<title[^>]*>([^<]*)<\/title>/i.exec(html)) === null || _a === void 0 ? void 0 : _a[1]) === null || _b === void 0 ? void 0 : _b.trim()) || (0, node_path_1.basename)(html, '.html');
}
program.parseAsync().catch(function (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
});
