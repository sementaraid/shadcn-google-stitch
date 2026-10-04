"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.usePalette = usePalette;
exports.classNames = classNames;
exports.textClasses = textClasses;
exports.isLayoutOnly = isLayoutOnly;
var colors_ts_1 = require("./colors.ts");
/**
 * Which families of token a colour may resolve into.
 *
 * The families are the whole guard: a border grey must never come out as
 * `bg-muted`, and body text must never come out as `bg-primary`, however close
 * the colours are. Within a family the nearest token wins.
 */
var BG_TOKENS = ['background', 'card', 'popover', 'muted', 'secondary', 'accent', 'primary'];
var FG_TOKENS = [
    'foreground',
    'muted-foreground',
    'primary-foreground',
    'secondary-foreground',
    'accent-foreground',
    'card-foreground',
    'primary',
    'destructive',
];
var LINE_TOKENS = ['border', 'input', 'ring', 'primary'];
/**
 * The generated page's palette, set once per emit run.
 *
 * A module-level handle rather than a parameter through every call site: the
 * classifier, the repeat diff and the emitter all ask the same question about
 * the same page, and threading the palette through `ClassOptions` would put a
 * page-level fact inside a per-node option bag.
 */
var PALETTE = null;
function usePalette(palette) {
    PALETTE = palette;
}
/** Same threshold the palette buckets at, so a token match is a real match. */
var TOKEN_DE = colors_ts_1.SAME_COLOR_DE;
function nearestToken(hex, family) {
    if (!PALETTE)
        return null;
    var c = (0, colors_ts_1.toOklch)(hex);
    if (!c)
        return null;
    var best = null;
    var bestD = Infinity;
    for (var _i = 0, family_1 = family; _i < family_1.length; _i++) {
        var t = family_1[_i];
        var p = (0, colors_ts_1.toOklch)(PALETTE[t]);
        if (!p)
            continue;
        var d = (0, colors_ts_1.deltaE)(c, p);
        if (d < bestD) {
            bestD = d;
            best = t;
        }
    }
    return best && bestD <= TOKEN_DE ? best : null;
}
/** A colour as a theme class when the palette holds it, otherwise the literal hex. */
function paint(prefix, hex, family) {
    var token = nearestToken(hex, family);
    return token ? "".concat(prefix, "-").concat(token) : "".concat(prefix, "-[").concat(hex, "]");
}
/** Every number in a value, in order. Shorthands need all of them, not the max. */
var nums = function (v) { var _a; return ((_a = v.match(/-?\d*\.?\d+/g)) !== null && _a !== void 0 ? _a : []).map(Number); };
/**
 * `padding` -> `p-[20px]`, `padding` `10px 16px` -> `py-[10px] px-[16px]`.
 * Tailwind arbitrary values map 1:1 to px, so the pixel diff in M5 measures the
 * same geometry the source had.
 */
function box(prefix, value) {
    var n = nums(value);
    if (!n.length || n.every(function (x) { return x === 0; }))
        return [];
    if (n.length === 1)
        return ["".concat(prefix, "-[").concat(n[0], "px]")];
    if (n.length === 2)
        return ["".concat(prefix, "y-[").concat(n[0], "px]"), "".concat(prefix, "x-[").concat(n[1], "px]")];
    if (n.length === 3)
        return ["".concat(prefix, "t-[").concat(n[0], "px]"), "".concat(prefix, "x-[").concat(n[1], "px]"), "".concat(prefix, "b-[").concat(n[2], "px]")];
    return [
        "".concat(prefix, "t-[").concat(n[0], "px]"),
        "".concat(prefix, "r-[").concat(n[1], "px]"),
        "".concat(prefix, "b-[").concat(n[2], "px]"),
        "".concat(prefix, "l-[").concat(n[3], "px]"),
    ];
}
/** `margin` is the one shorthand where the keywords carry the meaning. */
function margin(value) {
    if (!value || value === '0px')
        return [];
    var t = value.trim();
    if (/^auto$/.test(t))
        return ['m-auto'];
    // `0px auto` centres on the inline axis; the numeric part is already 0.
    if (/\bauto\b/.test(t))
        return ['mx-auto'];
    return box('m', value);
}
var TRANSPARENT = /^(rgba\(0,\s*0,\s*0,\s*0\)|transparent)$/;
/** The display a `<span>`-emitted text leaf has to restore from its source tag. */
var TEXT_DISPLAY = {
    block: 'block',
    'inline-block': 'inline-block',
    // The parent `<ul>` is emitted as a plain div, so its `list-style: none` is
    // gone; a real `list-item` would sprout a marker that the source does not have.
    'list-item': 'block',
};
var ALIGN = {
    center: 'items-center',
    'flex-start': 'items-start',
    'flex-end': 'items-end',
    stretch: 'items-stretch',
    baseline: 'items-baseline',
};
var JUSTIFY = {
    center: 'justify-center',
    'space-between': 'justify-between',
    'space-around': 'justify-around',
    'flex-start': 'justify-start',
    'flex-end': 'justify-end',
};
var WEIGHT = {
    '300': 'font-light',
    '400': 'font-normal',
    '500': 'font-medium',
    '600': 'font-semibold',
    '700': 'font-bold',
    '800': 'font-extrabold',
};
/** The Tailwind classes for one node. Ordered layout → box → paint, never sorted blindly. */
function classNames(style, opts) {
    if (opts === void 0) { opts = {}; }
    var out = [];
    if (style.display === 'flex') {
        out.push('flex');
        // A component's own base may set a column — `Card` ships `flex-col` — and
        // the browser's `row` default only wins when nothing says otherwise. On a
        // component the direction is therefore always stated, or a row of children
        // silently stacks.
        if (style.flexDirection === 'column')
            out.push('flex-col');
        else if (style.flexDirection === 'row-reverse')
            out.push('flex-row-reverse');
        else if (style.flexDirection === 'column-reverse')
            out.push('flex-col-reverse');
        else if (opts.component)
            out.push('flex-row');
    }
    else if (style.display === 'grid') {
        out.push('grid');
        var cols = style.gridTemplateColumns;
        // `none` and the no-columns defaults carry no digits; a real track list does.
        if (cols && /\d/.test(cols))
            out.push("grid-cols-[".concat(cols.replace(/\s+/g, '_'), "]"));
    }
    else if (style.display === 'none') {
        out.push('hidden');
    }
    // A component's base may also state a flow it did not have: `Badge` ships
    // `justify-center`, and a badge the source laid out from the left would centre
    // instead. Where the source says nothing, the component states nothing.
    if (style.display === 'flex') {
        if (ALIGN[style.alignItems])
            out.push(ALIGN[style.alignItems]);
        else if (opts.component)
            out.push('items-stretch');
        if (JUSTIFY[style.justifyContent])
            out.push(JUSTIFY[style.justifyContent]);
        else if (opts.component && style.flexDirection !== 'column' && style.flexDirection !== 'column-reverse')
            out.push('justify-start');
    }
    else {
        if (ALIGN[style.alignItems])
            out.push(ALIGN[style.alignItems]);
        if (JUSTIFY[style.justifyContent])
            out.push(JUSTIFY[style.justifyContent]);
    }
    // A gap is real layout even inside a component: the card's own spacing is the
    // card's, but the distance between two cards is the parent's.
    var gap = nums(style.gap)[0];
    if (gap)
        out.push("gap-[".concat(gap, "px]"));
    // A component's base may also carry spacing the source never had: `Card` ships
    // `gap-(--card-spacing)`, 16px between every child, where the source spaced its
    // children with margins. Left alone that is 16px per child of accumulated drift.
    else if (opts.component)
        out.push('gap-0');
    out.push.apply(out, box('p', style.padding));
    out.push.apply(out, margin(style.margin));
    var radius = nums(style.borderRadius)[0];
    if (radius)
        out.push(radius >= 999 ? 'rounded-full' : "rounded-[".concat(radius, "px]"));
    var bw = nums(style.borderWidth)[0];
    if (bw) {
        out.push(bw === 1 ? 'border' : "border-[".concat(bw, "px]"));
        // The base layer paints every border `border-border`, so only a different
        // colour needs saying.
        var line = TRANSPARENT.test(style.borderColor) ? null : (0, colors_ts_1.toHex)(style.borderColor);
        if (line && nearestToken(line, LINE_TOKENS) !== 'border')
            out.push(paint('border', line, LINE_TOKENS));
    }
    var bg = TRANSPARENT.test(style.backgroundColor) ? null : (0, colors_ts_1.toHex)(style.backgroundColor);
    if (bg)
        out.push(paint('bg', bg, BG_TOKENS));
    if (style.boxShadow && style.boxShadow !== 'none') {
        out.push("shadow-[".concat(style.boxShadow.replace(/\s+/g, '_'), "]"));
    }
    var op = parseFloat(style.opacity);
    if (op && op < 1)
        out.push("opacity-".concat(Math.round(op * 100)));
    if (style.overflow === 'hidden')
        out.push('overflow-hidden');
    if (!opts.skipSize) {
        var w = nums(style.width)[0];
        var h = nums(style.height)[0];
        if (style.width === '100%')
            out.push('w-full');
        else if (w && style.position !== 'absolute')
            out.push("w-[".concat(w, "px]"));
        if (style.height === '100%')
            out.push('h-full');
        else if (h && style.position !== 'absolute')
            out.push("h-[".concat(h, "px]"));
    }
    if (style.position === 'absolute')
        out.push('absolute');
    if (style.position === 'fixed')
        out.push('fixed');
    return out;
}
/** Classes that belong to the text run itself, applied to whatever element holds it. */
function textClasses(style) {
    var out = [];
    // A text leaf is emitted as a `<span>`, but the source may be a `<p>`, `<h1>`
    // or `<li>` — an inline span shrink-wraps to the glyphs and a list item loses
    // its line break, so two `<li>`s run together. `display` is restored from the
    // source so the line box matches, and its margin with it: a heading's
    // `margin-bottom: 8px` is what spaces the copy below, and a `<span>` has none.
    var display = TEXT_DISPLAY[style.display];
    if (display) {
        out.push(display);
        out.push.apply(out, box('p', style.padding));
        out.push.apply(out, margin(style.margin));
    }
    var size = nums(style.fontSize)[0];
    if (size)
        out.push("text-[".concat(size, "px]"));
    if (WEIGHT[style.fontWeight])
        out.push(WEIGHT[style.fontWeight]);
    // Tailwind's preflight sets `html { line-height: 1.5 }`, but a browser's own
    // `normal` is nearer 1.2 for a heading. Leaving it means every text block is a
    // few pixels taller than the source, and the offset compounds down the page.
    // `leading-[normal]` and not `leading-normal`: that utility means 1.5, which is
    // the very value being replaced.
    var lh = style.lineHeight;
    if (lh === 'normal')
        out.push('leading-[normal]');
    else if (/\d/.test(lh) && !lh.includes('%'))
        out.push("leading-[".concat(lh.replace(/\s+/g, '_'), "]"));
    else if (/[\d.]+%/.test(lh))
        out.push("leading-[".concat((parseFloat(lh) / 100).toFixed(2), "]"));
    var fg = TRANSPARENT.test(style.color) ? null : (0, colors_ts_1.toHex)(style.color);
    if (fg)
        out.push(paint('text', fg, FG_TOKENS));
    return out;
}
/** True when the node adds nothing a parent's flow would not already do. */
function isLayoutOnly(n) {
    return (n.children.length === 0 &&
        !n.text &&
        n.kind === 'container' &&
        !nums(n.style.padding).some(function (x) { return x !== 0; }) &&
        !nums(n.style.borderWidth).some(function (x) { return x !== 0; }));
}
