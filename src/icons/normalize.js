"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.canonicalizeValue = canonicalizeValue;
exports.canonicalizeAttrs = canonicalizeAttrs;
exports.normalizeShape = normalizeShape;
exports.normalizePathData = normalizePathData;
exports.hashShape = hashShape;
exports.features = features;
var node_crypto_1 = require("node:crypto");
/**
 * Attributes that vary between two copies of the same drawing without changing
 * it. `class` is the loud one: Stitch emits `<path class="st0">`, Lucide emits
 * nothing, and hashing either would never match.
 */
var IGNORED = new Set(['class', 'id', 'style', 'clip-path', 'mask']);
var isNumeric = function (s) { return /^-?\d*\.?\d+(e-?\d+)?$/i.test(s.trim()); };
function canonicalizeValue(v) {
    if (typeof v !== 'string')
        return String(v);
    if (isNumeric(v))
        return String(Math.round(Number(v) * 100) / 100);
    return v;
}
function canonicalizeAttrs(attrs) {
    return Object.entries(attrs)
        .filter(function (_a) {
        var k = _a[0];
        return !IGNORED.has(k) && !k.startsWith('data-');
    })
        // Path data carries its numbers inside the string, so it needs its own pass.
        .map(function (_a) {
        var k = _a[0], v = _a[1];
        return "".concat(k, "=").concat(k === 'd' ? normalizePathData(v) : canonicalizeValue(v));
    })
        .sort()
        .join(',');
}
/**
 * Order-insensitive shape string. Sibling order and attribute order are both
 * sorted away, so a reordered or reformatted copy of an icon hashes the same.
 */
function normalizeShape(children) {
    return children
        .map(function (_a) {
        var tag = _a[0], attrs = _a[1];
        return "".concat(tag, "|").concat(canonicalizeAttrs(attrs));
    })
        .sort()
        .join(';');
}
var NUMERIC_IN_PATH = /-?\d*\.?\d+(?:e-?\d+)?/gi;
/** Path data with every number rounded, so 12.0000001 and 12 agree. */
function normalizePathData(d) {
    return d.replace(NUMERIC_IN_PATH, function (n) { return String(Math.round(Number(n) * 100) / 100); }).replace(/\s+/g, ' ').trim();
}
function hashShape(children) {
    return (0, node_crypto_1.createHash)('sha1').update(normalizeShape(children)).digest('hex').slice(0, 16);
}
/**
 * Coarse fingerprint used only to rank candidates for the fuzzy rung. It is
 * deliberately loose: this narrows ~1850 icons to a handful, then the caller
 * shows those to a human or a model. It never decides on its own.
 */
function features(children) {
    var _a;
    var lines = 0;
    var curves = 0;
    var circles = 0;
    var rects = 0;
    var x1 = Infinity;
    var y1 = Infinity;
    var x2 = -Infinity;
    var y2 = -Infinity;
    for (var _i = 0, children_1 = children; _i < children_1.length; _i++) {
        var _b = children_1[_i], tag = _b[0], attrs = _b[1];
        if (tag === 'circle')
            circles++;
        if (tag === 'rect')
            rects++;
        var d = attrs.d;
        if (d) {
            for (var _c = 0, _d = (_a = d.match(/[a-zA-Z]/g)) !== null && _a !== void 0 ? _a : []; _c < _d.length; _c++) {
                var cmd = _d[_c];
                if ('MLHVmlhv'.includes(cmd))
                    lines++;
                else if ('CSQAcsqa'.includes(cmd))
                    curves++;
            }
            var nums = d.match(NUMERIC_IN_PATH);
            if (nums) {
                for (var i = 0; i + 1 < nums.length; i += 2) {
                    var x = Number(nums[i]);
                    var y = Number(nums[i + 1]);
                    if (!Number.isFinite(x) || !Number.isFinite(y))
                        continue;
                    if (x < x1)
                        x1 = x;
                    if (y < y1)
                        y1 = y;
                    if (x > x2)
                        x2 = x;
                    if (y > y2)
                        y2 = y;
                }
            }
        }
        for (var _e = 0, _f = Object.entries(attrs); _e < _f.length; _e++) {
            var _g = _f[_e], k = _g[0], v = _g[1];
            if (!['cx', 'cy', 'x', 'y'].includes(k))
                continue;
            var n = Number(v);
            if (!Number.isFinite(n))
                continue;
            if (k === 'cx' || k === 'x') {
                if (n < x1)
                    x1 = n;
                if (n > x2)
                    x2 = n;
            }
            else {
                if (n < y1)
                    y1 = n;
                if (n > y2)
                    y2 = n;
            }
        }
    }
    var bbox = Number.isFinite(x1) ? { x1: Math.round(x1), y1: Math.round(y1), x2: Math.round(x2), y2: Math.round(y2) } : null;
    return { parts: children.length, lines: lines, curves: curves, circles: circles, rects: rects, bbox: bbox };
}
