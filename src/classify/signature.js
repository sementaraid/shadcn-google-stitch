"use strict";
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
exports.textContent = exports.iconChild = exports.isDark = exports.hasSideBorder = exports.sides = exports.isRound = exports.isFilled = exports.isOpaqueBg = exports.area = exports.descendants = exports.kids = exports.px = void 0;
exports.luminance = luminance;
/**
 * Largest length in a computed value. `padding` and friends are shorthands
 * ("10px 16px"), and `parseFloat` would silently return only the first, making
 * "is this padded?" answer 10 for `8px 4px` and 8 for `8px`.
 */
var px = function (v) {
    var found = v.match(/-?\d*\.?\d+/g);
    return found ? Math.max.apply(Math, found.map(Number)) : 0;
};
exports.px = px;
var kids = function (n, ctx) { return n.children.map(function (id) { return ctx.nodes[id]; }).filter(Boolean); };
exports.kids = kids;
var descendants = function (n, ctx) {
    var out = [];
    var stack = __spreadArray([], (0, exports.kids)(n, ctx), true);
    while (stack.length) {
        var cur = stack.pop();
        out.push(cur);
        stack.push.apply(stack, (0, exports.kids)(cur, ctx));
    }
    return out;
};
exports.descendants = descendants;
var area = function (n) { return n.box.w * n.box.h; };
exports.area = area;
var isOpaqueBg = function (v) { return Boolean(v) && !/rgba\(0, 0, 0, 0\)|transparent/.test(v); };
exports.isOpaqueBg = isOpaqueBg;
/**
 * "Is this element filled?" — the question the outline/ghost/default variants
 * actually turn on. A transparent background only counts as filled when it
 * differs from the page, which is how a dark button on a white page reads.
 */
var isFilled = function (n, ctx) {
    return (0, exports.isOpaqueBg)(n.style.backgroundColor) && n.style.backgroundColor !== ctx.pageBackground;
};
exports.isFilled = isFilled;
var isRound = function (n) { return (0, exports.px)(n.style.borderRadius) >= 4; };
exports.isRound = isRound;
/**
 * Border width per side, in CSS shorthand order (top right bottom left).
 *
 * The one-sided border is what separates a framed box from a rule: a header's
 * `border-bottom: 1px` is a divider, an Alert's `border: 1px` is a frame, and
 * `px()` reports both as framed because it keeps the largest number it finds.
 */
var sides = function (v) {
    var _a;
    var p = ((_a = v.match(/-?\d*\.?\d+px/g)) !== null && _a !== void 0 ? _a : []).map(parseFloat);
    if (p.length === 1)
        return [p[0], p[0], p[0], p[0]];
    if (p.length === 2)
        return [p[0], p[1], p[0], p[1]];
    if (p.length === 3)
        return [p[0], p[1], p[2], p[1]];
    if (p.length >= 4)
        return [p[0], p[1], p[2], p[3]];
    return [0, 0, 0, 0];
};
exports.sides = sides;
/** A border down the vertical edges — a frame — as opposed to a one-edge rule. */
var hasSideBorder = function (n) {
    var _a = (0, exports.sides)(n.style.borderWidth), right = _a[1], left = _a[3];
    return right > 0 || left > 0;
};
exports.hasSideBorder = hasSideBorder;
/** Perception-weighted luminance, 0..1. Used only for light/dark bucketing. */
function luminance(color) {
    var m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(color);
    if (!m)
        return null;
    var _a = [Number(m[1]), Number(m[2]), Number(m[3])].map(function (c) {
        var s = c / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow(((s + 0.055) / 1.055), 2.4);
    }), r = _a[0], g = _a[1], b = _a[2];
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
var isDark = function (color) { var _a; return ((_a = luminance(color)) !== null && _a !== void 0 ? _a : 1) < 0.4; };
exports.isDark = isDark;
/** A single Lucide-sized stroke icon, or nothing. */
var iconChild = function (n, ctx) { var _a; return (_a = (0, exports.kids)(n, ctx).find(function (c) { return c.kind === 'icon'; })) !== null && _a !== void 0 ? _a : null; };
exports.iconChild = iconChild;
var textContent = function (n, ctx) { var _a; return ((_a = n.text) !== null && _a !== void 0 ? _a : '') + (0, exports.descendants)(n, ctx).map(function (d) { var _a; return (_a = d.text) !== null && _a !== void 0 ? _a : ''; }).join(' '); };
exports.textContent = textContent;
