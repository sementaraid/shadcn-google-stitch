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
exports.writeReport = writeReport;
var promises_1 = require("node:fs/promises");
var node_path_1 = require("node:path");
function writeReport(input, dir) {
    return __awaiter(this, void 0, void 0, function () {
        var target;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    target = (0, node_path_1.join)(dir !== null && dir !== void 0 ? dir : defaultDir(input), 'report.html');
                    return [4 /*yield*/, (0, promises_1.writeFile)(target, renderReport(input))];
                case 1:
                    _a.sent();
                    return [2 /*return*/, target];
            }
        });
    });
}
function defaultDir(input) {
    return (0, node_path_1.join)((0, node_path_1.dirname)(input.ir.source.screenshot), '.stitch');
}
var esc = function (s) { return s.replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); };
var pct = function (n) { return "".concat((n * 100).toFixed(1), "%"); };
function renderReport(input) {
    var _a, _b, _c;
    var iterations = input.iterations;
    var best = iterations.reduce(function (a, b) { return (b.score > a.score ? b : a); }, iterations[0]);
    var last = iterations.at(-1);
    var first = iterations[0];
    var regionRows = ((_a = last === null || last === void 0 ? void 0 : last.diff.worst) !== null && _a !== void 0 ? _a : [])
        .slice(0, 40)
        .map(function (r) {
        var _a;
        return "<tr class=\"".concat(r.score < 0.8 ? 'bad' : r.score < 0.95 ? 'warn' : '', "\">\n      <td><code>").concat(r.nodeId, "</code></td>\n      <td>").concat(r.kind, "</td>\n      <td>").concat(r.box.x, ",").concat(r.box.y, " ").concat(r.box.w, "\u00D7").concat(r.box.h, "</td>\n      <td class=\"num\">").concat(pct(r.score), "</td>\n      <td class=\"num\">").concat(pct(r.weight).replace('%', ''), "%</td>\n      <td>").concat(r.mode, "</td>\n      <td>").concat(esc((_a = r.note) !== null && _a !== void 0 ? _a : ''), "</td>\n    </tr>");
    })
        .join('');
    var iterationCards = iterations
        .map(function (it) {
        return "<div class=\"iter\">\n      <h3>iteration ".concat(it.index, " \u2014 ").concat(pct(it.score), " <span class=\"dim\">ssim ").concat(it.ssim.toFixed(4), "</span></h3>\n      <div class=\"shots\">\n        <figure><img src=\"").concat(rel(it.shot), "\" alt=\"render ").concat(it.index, "\"><figcaption>render</figcaption></figure>\n        <figure><img src=\"").concat(rel(it.heat), "\" alt=\"heatmap ").concat(it.index, "\"><figcaption>diff heatmap</figcaption></figure>\n      </div>\n      ").concat(it.patches.length ? "<ul class=\"patches\">".concat(it.patches.map(function (p) { return "<li>".concat(esc(p), "</li>"); }).join(''), "</ul>") : '<p class="dim">no patches</p>', "\n    </div>");
    })
        .join('');
    var lowConfidence = ((_b = input.ambiguous) !== null && _b !== void 0 ? _b : [])
        .slice(0, 40)
        .map(function (a) {
        return "<tr><td><code>".concat(a.nodeId, "</code></td><td>").concat(a.candidates.map(function (c) { return "".concat(esc(c.name), " ").concat(c.score.toFixed(2)); }).join(' · '), "</td></tr>");
    })
        .join('');
    var delta = first && last ? last.diff.score - first.diff.score : 0;
    return "<!doctype html>\n<html lang=\"en\"><head><meta charset=\"utf-8\"><title>stitch verify \u2014 ".concat(esc(input.ir.source.html), "</title>\n<style>\n  :root { color-scheme: dark }\n  * { box-sizing: border-box }\n  body { margin:0; background:#0b0b0e; color:#e5e5e5; font:14px/1.55 ui-sans-serif,system-ui,sans-serif }\n  header { padding:20px 24px; border-bottom:1px solid #26262c; position:sticky; top:0; background:#0b0b0e; z-index:5 }\n  h1 { margin:0 0 6px; font-size:17px; font-weight:600 }\n  h2 { font-size:14px; font-weight:600; margin:28px 24px 10px; color:#a1a1aa; text-transform:uppercase; letter-spacing:.06em }\n  h3 { font-size:13px; font-weight:600; margin:0 0 10px }\n  .dim { color:#8b8b96; font-weight:400 }\n  .scores { display:flex; gap:26px; margin-top:10px }\n  .score b { display:block; font-size:26px; font-weight:600 }\n  .score span { font-size:12px; color:#8b8b96 }\n  .up { color:#4ade80 } .down { color:#f87171 }\n  section { padding:0 24px }\n  table { border-collapse:collapse; width:100% }\n  th,td { text-align:left; padding:5px 10px; border-bottom:1px solid #1d1d22; font-size:12.5px }\n  th { color:#8b8b96; font-weight:500; text-transform:uppercase; font-size:11px; letter-spacing:.04em }\n  td.num { text-align:right; font-variant-numeric:tabular-nums }\n  tr.bad td { background:rgba(248,113,113,.09) }\n  tr.warn td { background:rgba(250,204,21,.07) }\n  code { font-family:ui-monospace,monospace; font-size:12px; color:#c4b5fd }\n  .iter { border:1px solid #26262c; border-radius:10px; padding:14px 16px; margin-bottom:12px; background:#111115 }\n  .shots { display:flex; gap:12px; overflow-x:auto }\n  figure { margin:0; flex:0 0 auto }\n  figure img { display:block; max-height:300px; border:1px solid #26262c; border-radius:6px; background:#fff }\n  figcaption { font-size:11px; color:#8b8b96; margin-top:5px }\n  .patches { margin:0; padding-left:18px; font-size:12.5px; color:#a1a1aa }\n  pre { background:#111115; border:1px solid #26262c; border-radius:8px; padding:12px; overflow:auto; font-size:12px; max-height:320px }\n  .empty { color:#8b8b96; font-style:italic }\n</style></head>\n<body>\n<header>\n  <h1>stitch verify \u2014 ").concat(esc(input.ir.source.html), "</h1>\n  <div class=\"dim\">").concat(input.ir.viewport.width, "\u00D7").concat(input.ir.viewport.height, " \u00B7 ").concat(iterations.length, " iteration(s)</div>\n  <div class=\"scores\">\n    <div class=\"score\"><b>").concat(best ? pct(best.score) : '—', "</b><span>best region score</span></div>\n    <div class=\"score\"><b>").concat(best ? best.ssim.toFixed(4) : '—', "</b><span>best ssim</span></div>\n    <div class=\"score\"><b class=\"").concat(delta >= 0 ? 'up' : 'down', "\">").concat(delta >= 0 ? '+' : '').concat((delta * 100).toFixed(1), "%</b><span>first \u2192 last</span></div>\n    <div class=\"score\"><b>").concat((_c = last === null || last === void 0 ? void 0 : last.diff.regions.length) !== null && _c !== void 0 ? _c : 0, "</b><span>regions scored</span></div>\n  </div>\n</header>\n\n<section>\n  <h2>iterations</h2>\n  ").concat(iterationCards || '<p class="empty">no iterations ran</p>', "\n</section>\n\n<section>\n  <h2>regions, worst first</h2>\n  ").concat(regionRows ? "<table><thead><tr><th>node</th><th>kind</th><th>box</th><th>score</th><th>weight</th><th>mode</th><th>note</th></tr></thead><tbody>".concat(regionRows, "</tbody></table>") : '<p class="empty">nothing scored</p>', "\n</section>\n\n").concat(lowConfidence ? "<section><h2>low-confidence nodes</h2><table><thead><tr><th>node</th><th>candidates</th></tr></thead><tbody>".concat(lowConfidence, "</tbody></table></section>") : '', "\n\n").concat(input.buildLog.trim() ? "<section><h2>build log</h2><pre>".concat(esc(input.buildLog.slice(-8000)), "</pre></section>") : '', "\n</body></html>\n");
}
function rel(p) {
    var parts = p.split('/');
    return parts[parts.length - 1];
}
