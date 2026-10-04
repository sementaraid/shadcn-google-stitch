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
exports.writeArtifacts = writeArtifacts;
exports.writeClassifications = writeClassifications;
var promises_1 = require("node:fs/promises");
var node_path_1 = require("node:path");
var KIND_COLOR = {
    container: '#3b82f6',
    text: '#22c55e',
    image: '#f97316',
    icon: '#a855f7',
    illustration: '#ec4899',
    control: '#eab308',
};
function writeArtifacts(ir, outDir, screenshotPath) {
    return __awaiter(this, void 0, void 0, function () {
        var irJson, shotName, shotDest, viewer;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, promises_1.mkdir)(outDir, { recursive: true })];
                case 1:
                    _a.sent();
                    irJson = (0, node_path_1.join)(outDir, 'ir.json');
                    return [4 /*yield*/, (0, promises_1.writeFile)(irJson, JSON.stringify(ir, null, 2))];
                case 2:
                    _a.sent();
                    shotName = (0, node_path_1.basename)(screenshotPath);
                    shotDest = (0, node_path_1.join)(outDir, shotName);
                    return [4 /*yield*/, (0, promises_1.copyFile)(screenshotPath, shotDest)];
                case 3:
                    _a.sent();
                    viewer = (0, node_path_1.join)(outDir, 'viewer.html');
                    return [4 /*yield*/, (0, promises_1.writeFile)(viewer, renderViewer(ir, shotName))];
                case 4:
                    _a.sent();
                    return [2 /*return*/, { dir: outDir, irJson: irJson, viewer: viewer, screenshot: shotDest }];
            }
        });
    });
}
function writeClassifications(classes, ambiguousList, outDir) {
    return __awaiter(this, void 0, void 0, function () {
        var path;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    path = (0, node_path_1.join)(outDir, 'classify.json');
                    return [4 /*yield*/, (0, promises_1.writeFile)(path, JSON.stringify({
                            nodes: Object.fromEntries(classes),
                            ambiguous: ambiguousList.map(function (c) { return c.nodeId; }),
                        }, null, 2))];
                case 1:
                    _a.sent();
                    return [2 /*return*/, path];
            }
        });
    });
}
function renderViewer(ir, shotName) {
    var nodes = Object.values(ir.nodes).sort(function (a, b) { return a.depth - b.depth; });
    var counts = nodes.reduce(function (acc, n) {
        var _a;
        acc[n.kind] = ((_a = acc[n.kind]) !== null && _a !== void 0 ? _a : 0) + 1;
        return acc;
    }, {});
    var legend = Object.keys(KIND_COLOR)
        .map(function (k) { var _a; return "<span class=\"key\"><i style=\"background:".concat(KIND_COLOR[k], "\"></i>").concat(k, " ").concat((_a = counts[k]) !== null && _a !== void 0 ? _a : 0, "</span>"); })
        .join('');
    var boxes = nodes
        .filter(function (n) { return n.visible; })
        .map(function (n) {
        var opacity = n.kind === 'container' ? 0.35 : 0.8;
        return "<div class=\"box\" data-id=\"".concat(n.id, "\"\n        style=\"left:").concat(n.box.x, "px;top:").concat(n.box.y, "px;width:").concat(n.box.w, "px;height:").concat(n.box.h, "px;\n               border-color:").concat(KIND_COLOR[n.kind], ";opacity:").concat(opacity, "\"\n        title=\"").concat(n.id, " ").concat(n.tag, " \u00B7 ").concat(n.kind).concat(n.repeat ? " \u00B7 \u00D7".concat(n.repeat.count) : '', "\"></div>");
    })
        .join('');
    var rows = nodes
        .filter(function (n) { return n.visible; })
        .slice(0, 400)
        .map(row)
        .join('');
    return "<!doctype html>\n<html><head><meta charset=\"utf-8\"><title>IR viewer</title>\n<style>\n  :root { color-scheme: dark }\n  body { margin:0; background:#0b0b0e; color:#e5e5e5; font:13px/1.5 ui-monospace,monospace }\n  header { padding:12px 16px; border-bottom:1px solid #26262c; position:sticky; top:0; background:#0b0b0e; z-index:10 }\n  .key { margin-right:14px; white-space:nowrap }\n  .key i { display:inline-block; width:9px; height:9px; border-radius:2px; margin-right:5px }\n  .stage { position:relative; margin:16px; width:".concat(ir.viewport.width, "px }\n  .stage img { display:block; width:").concat(ir.viewport.width, "px }\n  .box { position:absolute; border:1px solid; pointer-events:auto; box-sizing:border-box }\n  .box:hover { background:rgba(255,255,255,.08) }\n  table { border-collapse:collapse; width:100%; margin-top:8px }\n  th,td { text-align:left; padding:3px 8px; border-bottom:1px solid #1e1e24; white-space:nowrap }\n  th { color:#8b8b96; font-weight:400 }\n  .k { padding:1px 6px; border-radius:3px; color:#0b0b0e }\n  details { margin:16px } summary { cursor:pointer; color:#8b8b96 }\n  ").concat(ir.fontSubstituted.length ? '' : '', "\n</style></head>\n<body>\n<header>\n  ").concat(legend, "\n  <span class=\"key\" style=\"color:#8b8b96\">").concat(nodes.length, " nodes \u00B7 ").concat(ir.viewport.width, "\u00D7").concat(ir.viewport.height, "</span>\n  ").concat(ir.fontSubstituted.length
        ? "<div style=\"color:#f97316;margin-top:6px\">font not resolved: ".concat(ir.fontSubstituted.join(', '), " \u2014 text diff will be downweighted</div>")
        : '', "\n</header>\n<div class=\"stage\"><img src=\"").concat(shotName, "\" alt=\"\">").concat(boxes, "</div>\n<details open><summary>nodes</summary>\n<table><thead><tr><th>id</th><th>tag</th><th>kind</th><th>box</th><th>text</th><th>repeat</th></tr></thead>\n<tbody>").concat(rows, "</tbody></table>\n</details>\n</body></html>");
}
function row(n) {
    var text = n.text ? esc(n.text.slice(0, 60)) : '';
    return "<tr><td>".concat(n.id, "</td><td>").concat(esc(n.tag), "</td>\n    <td><span class=\"k\" style=\"background:").concat(KIND_COLOR[n.kind], "\">").concat(n.kind, "</span></td>\n    <td>").concat(n.box.w, "\u00D7").concat(n.box.h, " @ ").concat(n.box.x, ",").concat(n.box.y, "</td>\n    <td>").concat(text, "</td><td>").concat(n.repeat ? "\u00D7".concat(n.repeat.count) : '', "</td></tr>");
}
var esc = function (s) { return s.replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); };
