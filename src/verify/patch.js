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
exports.AstPatcher = void 0;
var promises_1 = require("node:fs/promises");
var node_path_1 = require("node:path");
var ts_morph_1 = require("ts-morph");
var AstPatcher = /** @class */ (function () {
    function AstPatcher(dir) {
        this.dir = dir;
        this.project = new ts_morph_1.Project({
            // Parsing only: resolving imports would pull the whole template's types in
            // and cost more than the patch is worth.
            compilerOptions: { jsx: 4 /* preserve */, allowJs: true, noResolve: true },
        });
    }
    AstPatcher.prototype.load = function () {
        return __awaiter(this, void 0, void 0, function () {
            var dir, files, _i, files_1, f;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        dir = (0, node_path_1.join)(this.dir, 'src', 'components', 'generated');
                        return [4 /*yield*/, (0, promises_1.readdir)(dir)];
                    case 1:
                        files = (_a.sent()).filter(function (f) { return f.endsWith('.tsx'); }).map(function (f) { return (0, node_path_1.join)(dir, f); });
                        files.push((0, node_path_1.join)(this.dir, 'src', 'App.tsx'));
                        for (_i = 0, files_1 = files; _i < files_1.length; _i++) {
                            f = files_1[_i];
                            this.project.addSourceFileAtPath(f);
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    /** The element carrying `data-stitch-id="<id>"`, wherever in the generated tree it is. */
    AstPatcher.prototype.find = function (nodeId) {
        var _a, _b;
        for (var _i = 0, _c = this.project.getSourceFiles(); _i < _c.length; _i++) {
            var sf = _c[_i];
            for (var _d = 0, _e = sf.getDescendantsOfKind(ts_morph_1.SyntaxKind.JsxAttribute); _d < _e.length; _d++) {
                var attr = _e[_d];
                if (attr.getNameNode().getText() !== 'data-stitch-id')
                    continue;
                if (((_a = attr.getInitializer()) === null || _a === void 0 ? void 0 : _a.getText().replace(/["']/g, '')) !== nodeId)
                    continue;
                // `<El data-stitch-id="…">` — the attribute sits at `El > JsxAttributes >
                // JsxAttribute`, and the node above that is the *opening* element for a
                // paired tag and the self-closing element for a bare one. Walking up to
                // whichever of the two is the element is what makes a paired `<div>` (and
                // so almost every patchable node) findable at all.
                var owner = (_b = attr.getParent()) === null || _b === void 0 ? void 0 : _b.getParent();
                if (!owner)
                    continue;
                var element = ts_morph_1.Node.isJsxOpeningElement(owner) ? owner.getParent() : owner;
                if (!element)
                    continue;
                if (!ts_morph_1.Node.isJsxElement(element) && !ts_morph_1.Node.isJsxSelfClosingElement(element))
                    continue;
                return { file: sf.getFilePath(), element: element };
            }
        }
        return null;
    };
    /**
     * Move a region toward where the reference measured it.
     *
     * This is the patch the loop can always make: the IR holds a box the node was
     * *supposed* to occupy — measured off the real page — and the render reports
     * where it actually landed. The delta is geometry, not a guess, so writing it
     * as an offset is deterministic. Only applied when the drift is more than a
     * pixel or two, or the loop would chatter.
     */
    AstPatcher.prototype.patchGeometry = function (nodeId, region, ir) {
        return __awaiter(this, void 0, void 0, function () {
            var node, dx, dy, dw, dh, found, classes, next, set;
            return __generator(this, function (_a) {
                node = ir[nodeId];
                if (!node || !region.rendered)
                    return [2 /*return*/, null
                        // Only in-flow nodes. An absolutely positioned or fixed node is placed by its
                        // own offsets, so its rendered box already carries them and the delta below
                        // would be zero-plus-drift — the loop would rewrite classes every round
                        // without converging on anything.
                    ];
                // Only in-flow nodes. An absolutely positioned or fixed node is placed by its
                // own offsets, so its rendered box already carries them and the delta below
                // would be zero-plus-drift — the loop would rewrite classes every round
                // without converging on anything.
                if (node.style.position !== 'static' && node.style.position !== 'relative')
                    return [2 /*return*/, null];
                dx = Math.round(node.box.x - region.rendered.x);
                dy = Math.round(node.box.y - region.rendered.y);
                dw = Math.round(node.box.w - region.rendered.w);
                dh = Math.round(node.box.h - region.rendered.h);
                if (Math.abs(dx) < 2 && Math.abs(dy) < 2 && Math.abs(dw) < 2 && Math.abs(dh) < 2)
                    return [2 /*return*/, null];
                found = this.find(nodeId);
                if (!found)
                    return [2 /*return*/, null
                        // A slotted node's className is a prop reference (`className={class2}`) shared
                        // by every instance of a repeat. Overwriting it would drop the prop and shift
                        // all the copies at once, so its classes are not this patcher's to rewrite.
                    ];
                classes = this.classesOf(found);
                if (classes === null)
                    return [2 /*return*/, null];
                next = __spreadArray([], classes, true);
                set = function (prefix, value) {
                    var i = next.findIndex(function (c) { return prefix.test(c); });
                    if (i >= 0)
                        next[i] = value;
                    else
                        next.push(value);
                };
                // Position drift is an offset from where flow put it; size drift is a size.
                // Both are relative, so a second pass that lands correctly writes zero and
                // the `Math.abs(...) < 2` guard above stops the loop from touching it again.
                if (Math.abs(dx) >= 2)
                    set(/^(translate-x-|-?ml-|left-)/, "translate-x-[".concat(dx, "px]"));
                if (Math.abs(dy) >= 2)
                    set(/^(translate-y-|-?mt-|top-)/, "translate-y-[".concat(dy, "px]"));
                if (Math.abs(dw) >= 2)
                    set(/^w-/, "w-[".concat(node.box.w, "px]"));
                if (Math.abs(dh) >= 2)
                    set(/^h-/, "h-[".concat(node.box.h, "px]"));
                this.writeClass(found, next);
                return [2 /*return*/, { nodeId: nodeId, file: found.file, note: "geometry: x".concat(dx >= 0 ? '+' : '').concat(dx, " y").concat(dy >= 0 ? '+' : '').concat(dy, " w").concat(dw >= 0 ? '+' : '').concat(dw, " h").concat(dh >= 0 ? '+' : '').concat(dh) }];
            });
        });
    };
    /** Replace a node's classes wholesale. The one write a patch is allowed to make. */
    AstPatcher.prototype.setClass = function (nodeId, className) {
        return __awaiter(this, void 0, void 0, function () {
            var found;
            return __generator(this, function (_a) {
                found = this.find(nodeId);
                if (!found)
                    return [2 /*return*/, null];
                this.writeClass(found, className.split(/\s+/).filter(Boolean));
                return [2 /*return*/, { nodeId: nodeId, file: found.file, note: "class=\"".concat(className, "\"") }];
            });
        });
    };
    /** The element's current classes, `null` when the className is not a plain string. */
    AstPatcher.prototype.classesOf = function (found) {
        var attr = this.attributesOf(found).find(function (a) { return ts_morph_1.Node.isJsxAttribute(a) && a.getNameNode().getText() === 'className'; });
        if (!attr || !ts_morph_1.Node.isJsxAttribute(attr))
            return [];
        var init = attr.getInitializer();
        if (!init)
            return [];
        // A JSX expression (`{class2}`) is a prop reference, not a literal.
        if (!ts_morph_1.Node.isStringLiteral(init))
            return null;
        return init.getLiteralText().split(/\s+/).filter(Boolean);
    };
    AstPatcher.prototype.writeClass = function (found, classes) {
        var node = this.attributedOf(found);
        var existing = node.getAttributes().find(function (a) { return ts_morph_1.Node.isJsxAttribute(a) && a.getNameNode().getText() === 'className'; });
        if (existing)
            existing.remove();
        node.addAttribute({ name: 'className', initializer: "\"".concat(classes.join(' '), "\"") });
    };
    /** `JsxElement` (the pair) and `JsxSelfClosingElement` both attribute nodes, but
     *  don't share a type in ts-morph's surface — the opening element carries them. */
    AstPatcher.prototype.attributedOf = function (found) {
        var el = found.element;
        return (ts_morph_1.Node.isJsxElement(el) ? el.getOpeningElement() : el);
    };
    AstPatcher.prototype.attributesOf = function (found) {
        return this.attributedOf(found).getAttributes();
    };
    /** Flush one file's edits; the loop calls this between iterations. */
    AstPatcher.prototype.save = function () {
        return __awaiter(this, void 0, void 0, function () {
            var written, _i, _a, sf;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        written = [];
                        _i = 0, _a = this.project.getSourceFiles();
                        _b.label = 1;
                    case 1:
                        if (!(_i < _a.length)) return [3 /*break*/, 4];
                        sf = _a[_i];
                        if (!!sf.isSaved()) return [3 /*break*/, 3];
                        return [4 /*yield*/, (0, promises_1.writeFile)(sf.getFilePath(), sf.getFullText())];
                    case 2:
                        _b.sent();
                        written.push(sf.getFilePath());
                        _b.label = 3;
                    case 3:
                        _i++;
                        return [3 /*break*/, 1];
                    case 4: return [2 /*return*/, written];
                }
            });
        });
    };
    /** Re-parse the file a patch landed in, so the next patch sees the edit. */
    AstPatcher.prototype.reload = function (file) {
        return __awaiter(this, void 0, void 0, function () {
            var text, sf;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, (0, promises_1.readFile)(file, 'utf8')];
                    case 1:
                        text = _a.sent();
                        sf = this.project.getSourceFile(file);
                        if (sf)
                            sf.replaceWithText(text);
                        return [2 /*return*/];
                }
            });
        });
    };
    return AstPatcher;
}());
exports.AstPatcher = AstPatcher;
