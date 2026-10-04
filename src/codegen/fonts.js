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
exports.parseFontLinks = parseFontLinks;
exports.fontLinksHtml = fontLinksHtml;
exports.readPageHtml = readPageHtml;
var promises_1 = require("node:fs/promises");
/** Generic CSS families are the tail of a stack, never a webfont to fetch. */
var GENERIC = new Set([
    'sans-serif',
    'serif',
    'monospace',
    'cursive',
    'fantasy',
    'system-ui',
    'ui-sans-serif',
    'ui-serif',
    'ui-monospace',
    'inherit',
    'initial',
    'unset',
]);
/**
 * Read the families the source page asked Google for. Three shapes exist in the
 * wild and Stitch emits all three, so all three are parsed rather than
 * assuming the modern one.
 */
function parseFontLinks(html) {
    var families = new Map();
    var order = [];
    var remember = function (family, weights) {
        var name = family.replace(/\+/g, ' ').trim();
        if (!name || GENERIC.has(name.toLowerCase()))
            return;
        if (!families.has(name)) {
            families.set(name, new Set());
            order.push(name);
        }
        var set = families.get(name);
        for (var _i = 0, weights_1 = weights; _i < weights_1.length; _i++) {
            var w = weights_1[_i];
            set.add(w);
        }
    };
    var add = function (url) {
        var _a;
        // css2 form: `family=Inter:wght@400;500;700` (repeats for several families)
        for (var _i = 0, _b = url.matchAll(/family=([^&:]+)(?::wght@([^&]+))?/g); _i < _b.length; _i++) {
            var m = _b[_i];
            var weights = ((_a = m[2]) !== null && _a !== void 0 ? _a : '')
                .split(/[;,]/)
                .flatMap(function (part) {
                var range = /^(\d+)\.\.(\d+)$/.exec(part);
                return range ? [Number(range[1]), Number(range[2])] : [Number(part)];
            })
                .filter(function (n) { return Number.isFinite(n) && n > 0; });
            remember(m[1], weights.length ? weights : [400]);
        }
        // legacy v1 form: `family=Roboto:400,700`
        for (var _c = 0, _d = url.matchAll(/family=([^&:]+):(\d[\d,]*)/g); _c < _d.length; _c++) {
            var m = _d[_c];
            remember(m[1], m[2].split(',').map(Number));
        }
        // v1 without weights: `family=Lato`
        for (var _e = 0, _f = url.matchAll(/family=([A-Za-z+ ]+)(?:&|$|')/g); _e < _f.length; _e++) {
            var m = _f[_e];
            remember(m[1], []);
        }
    };
    for (var _i = 0, _a = html.matchAll(/<link[^>]+href=["']([^"']*fonts\.googleapis\.com[^"']*)["']/gi); _i < _a.length; _i++) {
        var m = _a[_i];
        add(m[1]);
    }
    for (var _b = 0, _c = html.matchAll(/@import\s+url\(["']?([^"')]*fonts\.googleapis\.com[^"')]*)["']?\)/gi); _b < _c.length; _b++) {
        var m = _c[_b];
        add(m[1]);
    }
    // Request exactly what the source asked Google for. Narrowing to the weights
    // this emitter happens to write is what broke fidelity: the source's own CSS
    // rarely states a weight, because `<strong>` and `<th>` get theirs from the UA
    // stylesheet, so a filter over `font-weight:` dropped the bold face and the
    // browser synthesised one from a different weight instead — visibly wider text
    // that then wrapped. The declared list is already the author's own narrowing.
    var list = order.map(function (name) {
        var declared = __spreadArray([], families.get(name), true).sort(function (a, b) { return a - b; });
        return { name: name, weights: declared.length ? declared : [400] };
    });
    if (list.length === 0)
        return { families: [], href: null, referenced: [] };
    // Dedupe, sort, and emit one URL. `display=swap` because the verify screenshot
    // waits on `document.fonts.ready`, and a blocked font would stall it.
    var query = __spreadArray([], list, true).sort(function (a, b) { return a.name.localeCompare(b.name); })
        .map(function (f) { return "family=".concat(f.name.replace(/ /g, '+'), ":wght@").concat(f.weights.sort(function (a, b) { return a - b; }).join(';')); })
        .join('&');
    return {
        families: list,
        href: "https://fonts.googleapis.com/css2?".concat(query, "&display=swap"),
        referenced: list.map(function (f) { return f.name; }),
    };
}
function fontLinksHtml(link) {
    if (!link.href)
        return '  <title>App</title>';
    return [
        '  <link rel="preconnect" href="https://fonts.googleapis.com">',
        '  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
        "  <link rel=\"stylesheet\" href=\"".concat(link.href, "\">"),
    ].join('\n');
}
function readPageHtml(path) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, (0, promises_1.readFile)(path, 'utf8')];
        });
    });
}
