"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
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
exports.STYLE_PROPS = void 0;
exports.detectRepeats = detectRepeats;
exports.extract = extract;
var promises_1 = require("node:fs/promises");
var node_url_1 = require("node:url");
exports.STYLE_PROPS = [
    'display', 'position', 'flexDirection', 'alignItems', 'justifyContent', 'gap',
    'width', 'height', 'padding', 'margin', 'borderRadius', 'borderWidth', 'borderColor', 'backgroundColor',
    'background', 'color', 'fontSize', 'fontWeight', 'fontFamily', 'lineHeight',
    'letterSpacing', 'boxShadow', 'opacity', 'overflow', 'cursor', 'zIndex',
    'gridTemplateColumns',
];
var WALKER_SRC = (0, node_url_1.fileURLToPath)(new URL('./walker.browser.js', import.meta.url));
var walkerFn = null;
function loadWalker() {
    return __awaiter(this, void 0, void 0, function () {
        var src;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!(walkerFn === null)) return [3 /*break*/, 2];
                    return [4 /*yield*/, (0, promises_1.readFile)(WALKER_SRC, 'utf8')];
                case 1:
                    src = _a.sent();
                    walkerFn = "(() => { ".concat(src, "\nreturn walkPage(").concat(JSON.stringify(exports.STYLE_PROPS), "); })()");
                    _a.label = 2;
                case 2: return [2 /*return*/, walkerFn];
            }
        });
    });
}
/**
 * Width is bucketed to 16px and height ignored: siblings in a flex row share a
 * height but their widths differ by whatever text they contain, so exact
 * geometry would keep a card list from ever grouping into one `.map()`.
 */
var bucket = function (px) { return Math.round(px / 16); };
/**
 * Two DOM subtrees are "the same component repeated" when they line up after
 * text is blanked out. Text must be blanked, otherwise six cards with different
 * copy read as six unrelated structures and never become a `.map()`.
 */
function detectRepeats(nodes) {
    var _a, _b, _c;
    var shape = new Map();
    var hash = function (id) {
        var n = nodes[id];
        if (!n)
            return '';
        // Text is deliberately absent, and children are sorted so reordered markup
        // still hashes the same.
        var kids = n.children.map(hash).sort().join(',');
        return "".concat(n.tag, "|").concat(n.style.display, "|").concat(n.style.flexDirection, "|w").concat(bucket(n.box.w), "|[").concat(kids, "]");
    };
    for (var _i = 0, _d = Object.values(nodes); _i < _d.length; _i++) {
        var n = _d[_i];
        if (!n.visible || n.isLeafOpaque)
            continue;
        var key = hash(n.id);
        if (!key)
            continue;
        var bucket_1 = (_a = shape.get(key)) !== null && _a !== void 0 ? _a : [];
        bucket_1.push(n.id);
        shape.set(key, bucket_1);
    }
    for (var _e = 0, _f = shape.values(); _e < _f.length; _e++) {
        var ids = _f[_e];
        if (ids.length < 2)
            continue;
        // Only group siblings: a shape recurring under two unrelated parents is a
        // coincidence, not a list.
        var byParent = new Map();
        for (var _g = 0, ids_1 = ids; _g < ids_1.length; _g++) {
            var id = ids_1[_g];
            var p = (_b = nodes[id].parent) !== null && _b !== void 0 ? _b : '__root__';
            var arr = (_c = byParent.get(p)) !== null && _c !== void 0 ? _c : [];
            arr.push(id);
            byParent.set(p, arr);
        }
        var _loop_1 = function (parent_1, group) {
            if (group.length < 2)
                return "continue";
            // A repeat emits its template once and `.map()`s the copies, so the group has
            // to be run of *adjacent* siblings. Two buttons that bucket to the same width
            // with an unrelated sibling between them are not a list, and emitting them as
            // one would move the middle sibling out of the row it belongs to.
            var parentNode = nodes[parent_1];
            var order = parentNode ? parentNode.children : group;
            var runs = [];
            for (var _k = 0, _l = __spreadArray([], group, true).sort(function (a, b) { return order.indexOf(a) - order.indexOf(b); }); _k < _l.length; _k++) {
                var id = _l[_k];
                var run = runs[runs.length - 1];
                if (run && order.indexOf(id) === order.indexOf(run[run.length - 1]) + 1)
                    run.push(id);
                else
                    runs.push([id]);
            }
            for (var _m = 0, runs_1 = runs; _m < runs_1.length; _m++) {
                var run = runs_1[_m];
                if (run.length < 2)
                    continue;
                var info = { count: run.length, siblingIds: __spreadArray([], run, true).sort() };
                for (var _o = 0, run_1 = run; _o < run_1.length; _o++) {
                    var id = run_1[_o];
                    nodes[id].repeat = info;
                }
            }
        };
        for (var _h = 0, byParent_1 = byParent; _h < byParent_1.length; _h++) {
            var _j = byParent_1[_h], parent_1 = _j[0], group = _j[1];
            _loop_1(parent_1, group);
        }
    }
}
function extract(ing) {
    return __awaiter(this, void 0, void 0, function () {
        var script, _a, raw, rootId, colors, fonts, nodes, _i, raw_1, n, used, fontSubstituted;
        var _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, loadWalker()];
                case 1:
                    script = _c.sent();
                    return [4 /*yield*/, ing.page.evaluate(script)];
                case 2:
                    _a = (_c.sent()), raw = _a.nodes, rootId = _a.rootId, colors = _a.colors, fonts = _a.fonts;
                    nodes = {};
                    for (_i = 0, raw_1 = raw; _i < raw_1.length; _i++) {
                        n = raw_1[_i];
                        nodes[n.id] = __assign(__assign({}, n), { repeat: null, cropPath: null, textAt: n.text && ((_b = n.textAt) !== null && _b !== void 0 ? _b : -1) >= 0 ? n.textAt : null });
                    }
                    detectRepeats(nodes);
                    used = new Set(fonts.map(function (f) { return f.family; }));
                    fontSubstituted = ing.fontSubstituted.filter(function (f) { return used.has(f); });
                    return [2 /*return*/, {
                            source: { html: '', screenshot: ing.screenshot },
                            viewport: ing.viewport,
                            colors: __spreadArray([], colors, true).sort(function (a, b) { return b.area - a.area; }).slice(0, 64),
                            fonts: __spreadArray([], fonts, true).sort(function (a, b) { return b.count - a.count; }),
                            fontSubstituted: fontSubstituted,
                            nodes: nodes,
                            root: rootId,
                        }];
            }
        });
    });
}
