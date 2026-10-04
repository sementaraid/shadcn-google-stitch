"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toPascal = toPascal;
exports.canonicalName = canonicalName;
exports.matchIcon = matchIcon;
var normalize_ts_1 = require("../icons/normalize.ts");
var index_generated_ts_1 = require("../registry/lucide/index.generated.ts");
var NAMES = index_generated_ts_1.LUCIDE_NAMES;
/** `arrow-right` -> `ArrowRight`, `arrow-down-0-1` -> `ArrowDown01`. */
function toPascal(kebab) {
    return kebab
        .split('-')
        .filter(Boolean)
        .map(function (p) { return p[0].toUpperCase() + p.slice(1); })
        .join('');
}
/** Resolve a possibly-renamed Lucide name to its current spelling. */
function canonicalName(name) {
    var _a;
    var resolved = (_a = index_generated_ts_1.LUCIDE_ALIASES[name]) !== null && _a !== void 0 ? _a : name;
    return NAMES.includes(resolved) ? resolved : null;
}
/**
 * Coarse similarity in 0..1. Command counts carry most of the signal; the
 * bounding box only separates icons that are otherwise the same complexity.
 * This ranks candidates for review, it never auto-accepts on its own.
 */
function similarity(a, b) {
    var prim = function (f) { return f.parts * 4 + f.lines + f.curves * 1.5 + f.circles * 2 + f.rects * 2; };
    var pa = prim(a);
    var pb = prim(b);
    var primScore = 1 - Math.abs(pa - pb) / Math.max(pa, pb, 1);
    var bboxScore = 0.5;
    if (a.bbox && b.bbox) {
        var d = Math.abs(a.bbox.x1 - b.bbox.x1) +
            Math.abs(a.bbox.y1 - b.bbox.y1) +
            Math.abs(a.bbox.x2 - b.bbox.x2) +
            Math.abs(a.bbox.y2 - b.bbox.y2);
        bboxScore = Math.max(0, 1 - d / 48);
    }
    return 0.6 * primScore + 0.4 * bboxScore;
}
var FUZZY_FLOOR = 0.55;
/**
 * The Lucide ladder. Deterministic rungs first: an explicit class, then an exact
 * shape hash. Only when both miss do we rank candidates, and even then we return
 * them for review rather than guessing.
 */
function matchIcon(shape) {
    var _a;
    // Rung 1 — Stitch and shadcn both leave `lucide lucide-<name>` on the element.
    for (var _i = 0, _b = ((_a = shape.className) !== null && _a !== void 0 ? _a : '').split(/\s+/); _i < _b.length; _i++) {
        var token = _b[_i];
        var m = /^lucide-(.+)$/.exec(token);
        if (!m)
            continue;
        var name_1 = canonicalName(toPascal(m[1]));
        if (name_1)
            return { via: 'class', name: name_1, confidence: 1 };
    }
    // Rung 2 — exact shape, order and formatting normalized away.
    var hit = index_generated_ts_1.LUCIDE_BY_HASH[(0, normalize_ts_1.hashShape)(shape.children)];
    if (hit)
        return { via: 'pathHash', name: hit, confidence: 0.98 };
    // Rung 3 — rank by coarse fingerprint. LLM vision (rung 4) plugs in here.
    // The prefilter matters more than the metric: a 5-part drawing can never be
    // the same icon as a 1-part one, and comparing it to every export wastes the
    // candidate list on shapes that only look similar in aggregate. Ranking runs
    // over the feature map, which is keyed by canonical name and holds one entry
    // per distinct drawing — every alias shares its shape.
    var f = (0, normalize_ts_1.features)(shape.children);
    var spread = Math.max(1, Math.round(f.parts * 0.5));
    var ranked = Object.keys(index_generated_ts_1.LUCIDE_FEATURES)
        .filter(function (name) { return Math.abs(index_generated_ts_1.LUCIDE_FEATURES[name].parts - f.parts) <= spread; })
        .map(function (name) { return ({ name: name, score: similarity(f, index_generated_ts_1.LUCIDE_FEATURES[name]) }); })
        .filter(function (c) { return c.score >= FUZZY_FLOOR; })
        .sort(function (a, b) { return b.score - a.score; })
        .slice(0, 5);
    if (ranked.length === 0) {
        // Rung 5 — not a Lucide icon at all. Caller emits it verbatim.
        return { via: 'none', candidates: [] };
    }
    return { via: 'fuzzy', name: ranked[0].name, confidence: ranked[0].score, candidates: ranked.map(function (c) { return c.name; }) };
}
