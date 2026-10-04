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
exports.TOKENS = exports.SAME_COLOR_DE = exports.hexOf = void 0;
exports.toHex = toHex;
exports.toOklch = toOklch;
exports.deltaE = deltaE;
exports.colorUses = colorUses;
exports.assignPalette = assignPalette;
exports.isDark = isDark;
exports.pageBackground = pageBackground;
var culori_1 = require("culori");
/**
 * The page's palette, read off the IR and answered as oklch.
 *
 * Everything here is deterministic: which colour becomes which shadcn token is
 * decided by measurement (area, contrast, position in the tree), never by a
 * guess about what a page "usually" looks like.
 */
var convertOklch = (0, culori_1.converter)('oklch');
/** Computed `rgb(r, g, b)` / `rgb(r, g, b, a)` -> hex, or null when invisible. */
function toHex(value) {
    if (!value)
        return null;
    var m = /^rgba?\(([^)]+)\)$/.exec(value.trim());
    if (!m)
        return null;
    var parts = m[1].split(',').map(function (s) { return parseFloat(s); });
    if (parts.length < 3 || parts.some(function (n) { return !Number.isFinite(n); }))
        return null;
    var r = parts[0], g = parts[1], b = parts[2], _a = parts[3], a = _a === void 0 ? 1 : _a;
    if (a === 0)
        return null;
    var h = function (n) { return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0'); };
    return "#".concat(h(r)).concat(h(g)).concat(h(b));
}
/** The IR carries `rgb()`, the palette holds hex. One conversion, in one place. */
var hexOf = function (value) { return toHex(value); };
exports.hexOf = hexOf;
function toOklch(hex) {
    var _a;
    var parsed = (0, culori_1.parse)(hex);
    if (!parsed)
        return null;
    var c = convertOklch(parsed);
    if (!c || !Number.isFinite(c.l))
        return null;
    return { l: c.l, c: (_a = c.c) !== null && _a !== void 0 ? _a : 0, h: Number.isFinite(c.h) ? c.h : 0 };
}
/**
 * Perceptual distance, in oklch.
 *
 * Chroma is down-weighted because the eye resolves lightness differences far
 * better than hue differences at low chroma: two greys 0.06 apart in `c` are
 * the same grey, while two navies 0.06 apart in `l` are visibly not.
 */
function deltaE(a, b) {
    var dl = a.l - b.l;
    var dc = (a.c - b.c) * 0.5;
    // Hue is an angle, so the shorter way round is the real distance.
    var dh = 2 * Math.sqrt(Math.max(0, a.c * b.c)) * Math.sin(((a.h - b.h) * Math.PI) / 360);
    return Math.sqrt(dl * dl + dc * dc + dh * dh);
}
var TRANSPARENT = /^(rgba\(0,\s*0,\s*0,\s*0\)|transparent)$/;
/**
 * How close two colours have to be to count as the same colour.
 *
 * Tight on purpose: computed styles carry the authored value exactly, so this
 * only has to absorb representation noise (`#fff` vs `rgb(255,255,255)`), not
 * design decisions. The page paper `#fafafa` and its cards `#ffffff` are 0.015
 * apart — a threshold that swallowed those would answer `--card` with the page
 * background and leave the cards invisible in the diff. Shared with the class
 * emitter, which must resolve a colour to a token under the same rule.
 */
exports.SAME_COLOR_DE = 0.005;
/**
 * Bucket every painted colour by perceptual closeness, then measure the buckets.
 *
 * Representative-by-area rather than by average: a bucket that is one clean white
 * plus a near-white should come out exactly white, because the page's paper *is*
 * white and rounding it to `#fcfcfd` would show up in the diff.
 */
function colorUses(ir, backgroundHex) {
    var bg = toOklch(backgroundHex);
    var nodes = Object.values(ir.nodes).filter(function (n) { return n.visible && n.tag !== 'html'; });
    var buckets = [];
    var add = function (hex, s, n, field) {
        var oklch = toOklch(hex);
        if (!oklch)
            return;
        var area = field === 'bg' ? Math.max(0, n.box.w) * Math.max(0, n.box.h) : 0;
        var bucket = buckets.find(function (b) { return deltaE(b.rep.oklch, oklch) < exports.SAME_COLOR_DE; });
        if (!bucket) {
            bucket = {
                rep: { hex: hex, oklch: oklch },
                fields: { area: 0, count: 0, textCount: 0, interactive: false, raises: false },
            };
            buckets.push(bucket);
        }
        var f = bucket.fields;
        f.area += area;
        f.count += 1;
        if (field === 'fg')
            f.textCount += 1;
        // A bigger paint of the same colour is the better representative.
        if (area > 0 && area > f.area - area)
            bucket.rep = { hex: hex, oklch: oklch };
        if (s.cursor === 'pointer')
            f.interactive = true;
        if (parseFloat(s.borderWidth) > 0 || (s.boxShadow && s.boxShadow !== 'none'))
            f.raises = true;
    };
    for (var _i = 0, nodes_1 = nodes; _i < nodes_1.length; _i++) {
        var n = nodes_1[_i];
        var s = n.style;
        if (!TRANSPARENT.test(s.backgroundColor)) {
            var hex = toHex(s.backgroundColor);
            if (hex)
                add(hex, s, n, 'bg');
        }
        if (!TRANSPARENT.test(s.color)) {
            var hex = toHex(s.color);
            if (hex)
                add(hex, s, n, 'fg');
        }
        if (parseFloat(s.borderWidth) > 0 && !TRANSPARENT.test(s.borderColor)) {
            var hex = toHex(s.borderColor);
            if (hex)
                add(hex, s, n, 'border');
        }
    }
    return buckets
        .map(function (b) { return (__assign({ hex: b.rep.hex, oklch: b.rep.oklch }, b.fields)); })
        .sort(function (a, b) { return b.area - a.area || b.count - a.count; });
}
/** The shadcn token names the generated stylesheet has to answer. */
exports.TOKENS = [
    'background',
    'foreground',
    'card',
    'card-foreground',
    'popover',
    'popover-foreground',
    'primary',
    'primary-foreground',
    'secondary',
    'secondary-foreground',
    'muted',
    'muted-foreground',
    'accent',
    'accent-foreground',
    'border',
    'input',
    'ring',
    'destructive',
];
/**
 * Which colour plays which role.
 *
 * The order matters and is the whole design: `primary` is claimed *before* the
 * foreground, because a page whose only strong fill is its call-to-action has
 * that fill in its text colours too (white on the button), and letting the text
 * rule take it first would leave the button looking like body copy.
 */
function assignPalette(backgroundHex, uses) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    var bg = toOklch(backgroundHex);
    var out = {};
    // Four decimals is finer than any display resolves, and `formatCss`'s full
    // float output turns a plain white into `oklch(1.0000000000000002 0 0)`.
    var r = function (n) { return Math.round(n * 1e4) / 1e4; };
    var round = function (c) { return (0, culori_1.formatCss)({ mode: 'oklch', l: r(c.l), c: r(c.c), h: r(c.h) }); };
    var take = function (token, hex) {
        var _a;
        var oklch = (_a = toOklch(hex)) !== null && _a !== void 0 ? _a : { l: 0, c: 0, h: 0 };
        out[token] = round(oklch);
        return { hex: hex, oklch: oklch };
    };
    var bgToken = take('background', backgroundHex);
    var background = (_a = bg !== null && bg !== void 0 ? bg : toOklch(backgroundHex)) !== null && _a !== void 0 ? _a : bgToken.oklch;
    var foreground = { l: 1 - background.l, c: 0, h: 0 };
    var role = function (c) { return (background.l < 0.5 ? 'dark' : 'light'); };
    var distinct = function (c, min) {
        if (min === void 0) { min = 0.02; }
        return bg && deltaE(c, bg) > min;
    };
    /** The strongest contrast against a surface, which is what readable text needs. */
    var bestContrast = function (against, pool) {
        return pool
            .filter(function (u) { return u.count > 0; })
            .sort(function (a, b) { return (0, culori_1.wcagContrast)(a.hex, against.hex) - (0, culori_1.wcagContrast)(b.hex, against.hex); })
            .at(-1);
    };
    // --- primary: what the page's buttons are painted with -------------------
    var interactive = uses
        .filter(function (u) { return u.interactive && u.area > 0 && distinct(u.oklch, 0.05); })
        .sort(function (a, b) { return b.area - a.area; });
    var primary = interactive[0];
    if (!primary) {
        // No filled button anywhere: the page's own strongest non-background fill is
        // still a better primary than shadcn's grey default.
        primary = uses.filter(function (u) { return u.area > 0 && distinct(u.oklch, 0.05); }).sort(function (a, b) { return b.area - a.area; })[0];
    }
    var primaryColor = primary ? take('primary', primary.hex) : take('primary', '#171717');
    // --- card / popover: a surface that is raised, not just painted ----------
    // --- card / popover: a surface that is raised, not just painted ----------
    // "Raised" alone is not enough to tell a card from a button: both draw a border
    // or a shadow. What separates them is scale — a surface covers a real share of
    // the page, a control is a chip in it. Anything smaller than a tenth of the
    // largest paint is a control, and the page's own paper is the better answer.
    var largest = (_c = (_b = uses[0]) === null || _b === void 0 ? void 0 : _b.area) !== null && _c !== void 0 ? _c : 0;
    var raised = uses.filter(function (u) { return u.area > largest * 0.1 && u.raises && distinct(u.oklch, 0.01); });
    var card = (_d = raised[0]) !== null && _d !== void 0 ? _d : { hex: backgroundHex, oklch: background };
    take('card', card.hex);
    // --- foreground: the colour the page's prose is set in -------------------
    // --- foreground: the colour the page's prose is set in -------------------
    // Ranked by how many nodes set text in it, not by paint area: a colour used for
    // a button fill *and* for 45 prose nodes is still the page's prose, and the
    // `area === 0` filter that keeps primaries out of the text pool would drop it.
    var textPool = uses.filter(function (u) { return u.textCount > 0 && distinct(u.oklch, 0.1); });
    var prose = __spreadArray([], textPool, true).sort(function (a, b) { return b.textCount - a.textCount; });
    var fgPick = (_e = prose[0]) !== null && _e !== void 0 ? _e : { hex: role(bgToken.oklch) === 'dark' ? '#fafafa' : '#0a0a0a' };
    take('foreground', fgPick.hex);
    // --- muted-foreground: the next text colour down -------------------------
    // Chosen by proximity to the foreground rather than absolute contrast, so a
    // page whose secondary grey sits near its black gets a near-black muted tone
    // and not one that happens to be far from the paper.
    var dim = textPool
        .filter(function (u) { return u.hex !== fgPick.hex; })
        .sort(function (a, b) { return deltaE(a.oklch, fgPick.oklch) - deltaE(b.oklch, fgPick.oklch); })
        .at(0);
    // No second text colour on the page: step the foreground toward the background
    // rather than inventing a hue.
    var mutedFg = dim
        ? { hex: dim.hex, oklch: dim.oklch }
        : { hex: backgroundHex, oklch: { l: (background.l + foreground.l) / 2 + 0.12, c: 0, h: 0 } };
    take('muted-foreground', mutedFg.hex);
    // --- border: the colour the page draws its hairlines with ---------------
    var borderUse = uses
        .filter(function (u) { return u.raises && distinct(u.oklch, 0.005); })
        .find(function (u) { return u.hex !== card.hex && u.hex !== primaryColor.hex; });
    take('border', (_f = borderUse === null || borderUse === void 0 ? void 0 : borderUse.hex) !== null && _f !== void 0 ? _f : mutedFg.hex);
    // --- secondary / muted / accent: the quiet surfaces ---------------------
    var quiet = (_g = uses
        .filter(function (u) { return u.area > 0 && distinct(u.oklch, 0.01) && u.hex !== primaryColor.hex && u.hex !== card.hex; })
        .sort(function (a, b) { return b.area - a.area; })[0]) !== null && _g !== void 0 ? _g : { hex: mutedFg.hex, oklch: mutedFg.oklch };
    take('secondary', quiet.hex);
    take('muted', quiet.hex);
    take('accent', quiet.hex);
    var on = function (surface) {
        var pick = bestContrast(surface, uses.filter(function (u) { return u.textCount > 0; }));
        return pick ? pick.hex : role(surface.oklch) === 'dark' ? '#fafafa' : '#0a0a0a';
    };
    take('primary-foreground', on(primaryColor));
    take('card-foreground', on(card));
    take('popover', card.hex);
    take('popover-foreground', on(card));
    take('secondary-foreground', on(quiet));
    take('accent-foreground', on(quiet));
    take('input', (_h = borderUse === null || borderUse === void 0 ? void 0 : borderUse.hex) !== null && _h !== void 0 ? _h : mutedFg.hex);
    // The focus ring is the primary at low chroma; a full-strength ring flashes
    // harder than anything the source page ever drew.
    take('ring', primaryColor.hex);
    take('destructive', '#e7000b');
    return out;
}
/**
 * Whether the page is dark, from the paper it is drawn on rather than a guess.
 *
 * `l` is perceptual lightness, so the midpoint is the honest cutoff: a page on
 * `#808080` is halfway, and either answer is defensible; above it is light.
 */
function isDark(backgroundHex) {
    var bg = toOklch(backgroundHex);
    return bg ? bg.l < 0.5 : false;
}
/** The surface the page itself is drawn on. */
function pageBackground(ir) {
    var body = Object.values(ir.nodes).find(function (n) { return n.tag === 'body' || n.tag === 'html'; });
    var own = (0, exports.hexOf)(body === null || body === void 0 ? void 0 : body.style.backgroundColor);
    if (own)
        return own;
    // No explicit body fill: the largest painted area is the next best answer.
    for (var _i = 0, _a = __spreadArray([], ir.colors, true).sort(function (a, b) { return b.area - a.area; }); _i < _a.length; _i++) {
        var c = _a[_i];
        var hex = (0, exports.hexOf)(c.value);
        if (hex)
            return hex;
    }
    return '#ffffff';
}
