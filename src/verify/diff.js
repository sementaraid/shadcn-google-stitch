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
exports.readPng = readPng;
exports.writePng = writePng;
exports.emptyPng = emptyPng;
exports.crop = crop;
exports.flatten = flatten;
exports.dominantColor = dominantColor;
exports.ssim = ssim;
exports.regionsOf = regionsOf;
exports.diff = diff;
var pixelmatch_1 = require("pixelmatch");
var pngjs_1 = require("pngjs");
function readPng(buf) {
    var png = pngjs_1.PNG.sync.read(buf);
    return { width: png.width, height: png.height, data: png.data };
}
function writePng(png) {
    var out = new pngjs_1.PNG({ width: png.width, height: png.height });
    png.data.copy(out.data);
    return pngjs_1.PNG.sync.write(out);
}
/** A blank canvas in the reference's dimensions. */
function emptyPng(width, height) {
    return { width: width, height: height, data: Buffer.alloc(width * height * 4) };
}
/**
 * Crop to a box, clamped to the image.
 *
 * Regions come from the IR, which was measured on the reference. The rendered
 * page can be a few pixels taller or shorter when something overflowed, and the
 * comparison should report that as a mismatch in the region, not crash.
 */
function crop(png, box) {
    var x = Math.max(0, Math.round(box.x));
    var y = Math.max(0, Math.round(box.y));
    var w = Math.min(png.width - x, Math.round(box.w));
    var h = Math.min(png.height - y, Math.round(box.h));
    if (w <= 0 || h <= 0)
        return null;
    var out = emptyPng(w, h);
    for (var row = 0; row < h; row++) {
        png.data.copy(out.data, row * w * 4, ((y + row) * png.width + x) * 4, ((y + row) * png.width + x + w) * 4);
    }
    return out;
}
/** Paint a copy of the image flat, which is how a masked region leaves the diff. */
function flatten(png, box, rgb) {
    var x0 = Math.max(0, Math.round(box.x));
    var y0 = Math.max(0, Math.round(box.y));
    var x1 = Math.min(png.width, Math.round(box.x + box.w));
    var y1 = Math.min(png.height, Math.round(box.y + box.h));
    for (var y = y0; y < y1; y++) {
        for (var x = x0; x < x1; x++) {
            var o = (y * png.width + x) * 4;
            png.data[o] = rgb[0];
            png.data[o + 1] = rgb[1];
            png.data[o + 2] = rgb[2];
            png.data[o + 3] = 255;
        }
    }
}
/** The colour that covers most of a region, quantised so near-identical pixels agree. */
function dominantColor(png, box) {
    var _a;
    var region = crop(png, box);
    if (!region)
        return null;
    var counts = new Map();
    for (var i = 0; i < region.data.length; i += 4) {
        if (region.data[i + 3] < 128)
            continue;
        var key = (region.data[i] >> 4 << 8) | (region.data[i + 1] >> 4 << 4) | (region.data[i + 2] >> 4);
        counts.set(key, ((_a = counts.get(key)) !== null && _a !== void 0 ? _a : 0) + 1);
    }
    var best = -1;
    var bestN = 0;
    for (var _i = 0, counts_1 = counts; _i < counts_1.length; _i++) {
        var _b = counts_1[_i], k = _b[0], n = _b[1];
        if (n > bestN)
            ((bestN = n), (best = k));
    }
    if (best < 0)
        return null;
    var hex = function (v) { return ((v & 0xf) * 17).toString(16).padStart(2, '0'); };
    return "#".concat(hex(best >> 8)).concat(hex(best >> 4)).concat(hex(best));
}
/**
 * Structural similarity over the whole page.
 *
 * Hand-written because `pixelmatch` answers "how many pixels differ" and SSIM
 * answers "how differently is the page structured" — the loop needs both, since
 * a page can land every pixel's colour and still have everything an inch off.
 * Standard 8×8 windows over luma, with the usual stabilising constants.
 */
function ssim(a, b, window) {
    if (window === void 0) { window = 8; }
    var w = Math.min(a.width, b.width);
    var h = Math.min(a.height, b.height);
    if (!w || !h)
        return 0;
    var la = luma(a);
    var lb = luma(b);
    var C1 = Math.pow((0.01 * 255), 2);
    var C2 = Math.pow((0.03 * 255), 2);
    var total = 0;
    var windows = 0;
    for (var y0 = 0; y0 + window <= h; y0 += window) {
        for (var x0 = 0; x0 + window <= w; x0 += window) {
            var sa = 0;
            var sb = 0;
            var saa = 0;
            var sbb = 0;
            var sab = 0;
            var n = window * window;
            for (var y = y0; y < y0 + window; y++) {
                for (var x = x0; x < x0 + window; x++) {
                    var va_1 = la[y * a.width + x];
                    var vb_1 = lb[y * b.width + x];
                    sa += va_1;
                    sb += vb_1;
                    saa += va_1 * va_1;
                    sbb += vb_1 * vb_1;
                    sab += va_1 * vb_1;
                }
            }
            var ma = sa / n;
            var mb = sb / n;
            var va = saa / n - ma * ma;
            var vb = sbb / n - mb * mb;
            var cov = sab / n - ma * mb;
            total += ((2 * ma * mb + C1) * (2 * cov + C2)) / ((ma * ma + mb * mb + C1) * (va + vb + C2));
            windows++;
        }
    }
    return windows ? total / windows : 0;
}
function luma(png) {
    var out = new Float64Array(png.width * png.height);
    for (var i = 0, p = 0; i < png.data.length; i += 4, p++) {
        out[p] = 0.2126 * png.data[i] + 0.7152 * png.data[i + 1] + 0.0722 * png.data[i + 2];
    }
    return out;
}
/** Differing pixels as a share of the region, 0 when the shape is not comparable. */
function mismatchRatio(a, b, threshold) {
    if (a.width !== b.width || a.height !== b.height)
        return 1;
    var diff = new pngjs_1.PNG({ width: a.width, height: a.height });
    var n = (0, pixelmatch_1.default)(new Uint8Array(a.data), new Uint8Array(b.data), new Uint8Array(diff.data.buffer, diff.data.byteOffset, diff.data.length), a.width, a.height, { threshold: threshold, includeAA: false });
    return n / (a.width * a.height);
}
/**
 * Regions the diff is scored over: the deepest visible nodes.
 *
 * Deepest, because they tile the page without covering each other — scoring every
 * container too would count one broken button once for each of its ancestors. The
 * exception is the *band* a container owns: the area inside it that no child
 * covers. That band is where the card's background, border and padding live, and
 * scoring leaves alone would leave a page whose every card lost its fill looking
 * perfect.
 */
function regionsOf(ir) {
    var visible = Object.values(ir.nodes).filter(function (n) { return n.visible && n.tag !== 'html' && n.tag !== 'body'; });
    var children = new Map();
    for (var _i = 0, visible_1 = visible; _i < visible_1.length; _i++) {
        var n = visible_1[_i];
        if (!n.parent)
            continue;
        var list = children.get(n.parent);
        if (list)
            list.push(n);
        else
            children.set(n.parent, [n]);
    }
    var sized = function (n) { return n.box.w >= 2 && n.box.h >= 2; };
    var leaves = visible.filter(function (n) { var _a; return !((_a = children.get(n.id)) !== null && _a !== void 0 ? _a : []).some(sized); });
    // A container whose own band is a sliver of its box (a card that is nothing but
    // children) has nothing of its own to score, and its children carry the region.
    var bands = visible.filter(function (n) {
        var _a;
        if (!sized(n) || leaves.includes(n))
            return false;
        var kids = ((_a = children.get(n.id)) !== null && _a !== void 0 ? _a : []).filter(sized);
        if (!kids.length)
            return false;
        var covered = kids.reduce(function (s, c) { return s + Math.max(0, c.box.w) * Math.max(0, c.box.h); }, 0);
        return covered / (n.box.w * n.box.h) < 0.98;
    });
    return __spreadArray(__spreadArray([], leaves, true), bands, true).filter(sized)
        .sort(function (a, b) { return b.box.w * b.box.h - a.box.w * a.box.h; });
}
/**
 * Crop to a region, painting `exclude` boxes flat first.
 *
 * Used for a container's own band: the children inside it are scored as their own
 * regions, and counting them here would score a broken child twice and let a
 * correct child paper over a wrong parent.
 */
function maskedCrop(png, box, exclude) {
    var region = crop(png, box);
    if (!region)
        return null;
    for (var _i = 0, exclude_1 = exclude; _i < exclude_1.length; _i++) {
        var e = exclude_1[_i];
        flatten(region, { x: e.x - box.x, y: e.y - box.y, w: e.w, h: e.h }, [255, 0, 255]);
    }
    return region;
}
/**
 * Score the render against the reference.
 *
 * Masked kinds are not compared pixel-wise at all — an `ImagePlaceholder` will
 * never match the photograph it stands in for, and chasing it would burn every
 * iteration the loop has. They are scored on what they *can* be held to: the box
 * they occupy, and for images the colour the region holds.
 */
function diff(reference, rendered, ir, opts) {
    var _a, _b, _c, _d, _e;
    if (opts === void 0) { opts = {}; }
    var substituted = new Set((_a = opts.substituted) !== null && _a !== void 0 ? _a : []);
    var dynamic = new Set((_b = opts.dynamic) !== null && _b !== void 0 ? _b : []);
    var maskedKinds = new Set((_c = opts.maskedKinds) !== null && _c !== void 0 ? _c : ['image', 'icon', 'illustration']);
    var threshold = (_d = opts.threshold) !== null && _d !== void 0 ? _d : 0.1;
    // Masked regions are painted out of both images before the global pass, or the
    // heatmap would point at placeholders instead of at the code.
    var refFlat = __assign(__assign({}, reference), { data: Buffer.from(reference.data) });
    var renFlat = __assign(__assign({}, rendered), { data: Buffer.from(rendered.data) });
    var maskBoxes = Object.values(ir.nodes).filter(function (n) { return n.visible && (maskedKinds.has(n.kind) || dynamic.has(n.id)) && n.box.w >= 2 && n.box.h >= 2; });
    for (var _i = 0, maskBoxes_1 = maskBoxes; _i < maskBoxes_1.length; _i++) {
        var m = maskBoxes_1[_i];
        flatten(refFlat, m.box, [255, 0, 255]);
        flatten(renFlat, m.box, [255, 0, 255]);
    }
    var regions = [];
    var scored = new Set(regionsOf(ir).map(function (r) { return r.id; }));
    var boxes = function (n) {
        return n.children
            .map(function (id) { return ir.nodes[id]; })
            .filter(function (c) { return c && c.visible && scored.has(c.id); })
            .map(function (c) { return c.box; });
    };
    var _loop_1 = function (n) {
        var area = Math.max(0, n.box.w) * Math.max(0, n.box.h);
        var weight = area / (ir.viewport.width * ir.viewport.height);
        var seen = (_e = opts.rendered) === null || _e === void 0 ? void 0 : _e.get(n.id);
        var base = { nodeId: n.id, kind: n.kind, box: n.box, weight: weight, rendered: seen };
        // Children are excluded only when they are scored themselves, which is what
        // makes a parent's band its own and not a second look at its children.
        var inner = boxes(n);
        if (dynamic.has(n.id)) {
            regions.push(__assign(__assign({}, base), { score: 1, mode: 'masked', mismatch: 0, note: 'dynamic region' }));
            return "continue";
        }
        if (maskedKinds.has(n.kind)) {
            if (!seen || seen.w <= 0 || seen.h <= 0) {
                regions.push(__assign(__assign({}, base), { score: 0, mode: 'masked', mismatch: 1, note: 'not present in render' }));
                return "continue";
            }
            // Box agreement, plus how much of the region the render actually paints:
            // a placeholder that collapsed to nothing has the right id and no area.
            // Position is checked too: an icon in the wrong corner is not a matched
            // icon, and a shape-only score would call it one.
            var dw = 1 - Math.min(1, Math.abs(seen.w - n.box.w) / Math.max(1, n.box.w));
            var dh = 1 - Math.min(1, Math.abs(seen.h - n.box.h) / Math.max(1, n.box.h));
            var dx = 1 - Math.min(1, Math.abs(seen.x - n.box.x) / Math.max(1, n.box.w));
            var dy = 1 - Math.min(1, Math.abs(seen.y - n.box.y) / Math.max(1, n.box.h));
            var shape = (dw * dh + dx * dy + Math.min(1, (seen.w * seen.h) / Math.max(1, area))) / 3;
            var score_1 = shape;
            var note = n.kind === 'icon' ? 'presence, box and position' : 'box, position and area';
            if (n.kind === 'image') {
                var a_1 = dominantColor(reference, n.box);
                var b_1 = dominantColor(renFlat, n.box);
                if (a_1 && b_1) {
                    var ca_1 = parseInt(a_1.slice(1), 16);
                    var cb_1 = parseInt(b_1.slice(1), 16);
                    var near = function (x, y) { return Math.abs(((ca_1 >> x) & 0xff) - ((cb_1 >> y) & 0xff)) / 255; };
                    var color = 1 - Math.min(1, (near(16, 16) + near(8, 8) + near(0, 0)) / 3);
                    score_1 = shape * 0.6 + color * 0.4;
                    note = "box + dominant colour (ref ".concat(a_1, ", got ").concat(b_1, ")");
                }
            }
            regions.push(__assign(__assign({}, base), { score: Math.max(0, Math.min(1, score_1)), mode: 'masked', mismatch: 1 - score_1, note: note }));
            return "continue";
        }
        var a = maskedCrop(refFlat, n.box, inner);
        var b = maskedCrop(renFlat, n.box, inner);
        if (!a || !b) {
            regions.push(__assign(__assign({}, base), { score: 1, mode: 'masked', mismatch: 0, note: 'outside the viewport' }));
            return "continue";
        }
        var mismatch = mismatchRatio(a, b, threshold);
        var score_2 = 1 - mismatch;
        // A substituted font makes every glyph in the region differ for a reason the
        // generated code cannot fix. Keeping the region at a third of its weight
        // rather than masking it: the text is still in the right place and size.
        var substitutedFont = substituted.size > 0 && isTextual(n);
        regions.push(__assign(__assign({}, base), { score: score_2, mode: substitutedFont ? 'downweighted' : 'pixel', mismatch: mismatch, note: substitutedFont ? 'font substituted' : undefined, weight: substitutedFont ? weight * 0.3 : weight }));
    };
    for (var _f = 0, _g = regionsOf(ir); _f < _g.length; _f++) {
        var n = _g[_f];
        _loop_1(n);
    }
    var totalWeight = regions.reduce(function (s, r) { return s + r.weight; }, 0) || 1;
    var score = regions.reduce(function (s, r) { return s + r.score * r.weight; }, 0) / totalWeight;
    var heat = emptyPng(reference.width, reference.height);
    if (refFlat.width === renFlat.width && refFlat.height === renFlat.height) {
        (0, pixelmatch_1.default)(new Uint8Array(refFlat.data), new Uint8Array(renFlat.data), new Uint8Array(heat.data.buffer, heat.data.byteOffset, heat.data.length), refFlat.width, refFlat.height, { threshold: threshold, includeAA: false, alpha: 0.35 });
    }
    return {
        score: score,
        ssim: ssim(refFlat, renFlat),
        regions: regions,
        worst: __spreadArray([], regions, true).sort(function (a, b) { return a.score - b.score; }),
        heatmap: heat,
    };
}
function isTextual(n) {
    return n.kind === 'text' || (n.kind === 'container' && Boolean(n.text && n.text.trim()));
}
