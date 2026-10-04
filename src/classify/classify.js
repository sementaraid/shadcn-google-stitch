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
exports.AMBIGUOUS = exports.AUTO_ACCEPT = void 0;
exports.classify = classify;
exports.interiorOf = interiorOf;
exports.ambiguous = ambiguous;
exports.stats = stats;
var signatures_ts_1 = require("./signatures.ts");
var icon_ts_1 = require("./icon.ts");
var variants_ts_1 = require("./variants.ts");
var theme_ts_1 = require("../codegen/theme.ts");
/** The page background as a computed `rgb()` string, which is what IR styles hold. */
function toCss(hex) {
    var h = hex.replace('#', '');
    var _a = [0, 2, 4].map(function (i) { return parseInt(h.slice(i, i + 2), 16); }), r = _a[0], g = _a[1], b = _a[2];
    return "rgb(".concat(r, ", ").concat(g, ", ").concat(b, ")");
}
exports.AUTO_ACCEPT = 0.8;
exports.AMBIGUOUS = 0.5;
/** Ancestors that describe the page, not a component. Never worth classifying. */
var STRUCTURAL = new Set(['html', 'body', 'head', 'script', 'style', 'link', 'meta']);
function score(n, sig, ctx) {
    var _a, _b;
    if (sig.requires && !sig.requires(n, ctx))
        return null;
    var entries = Object.entries(sig.weight);
    var total = ((_a = sig.base) !== null && _a !== void 0 ? _a : 0) + entries.reduce(function (sum, _a) {
        var fn = _a[1];
        return sum + fn(n, ctx);
    }, 0);
    var evidence = [];
    for (var _i = 0, entries_1 = entries; _i < entries_1.length; _i++) {
        var _c = entries_1[_i], key = _c[0], fn = _c[1];
        var v = fn(n, ctx);
        if (v >= 0.99)
            evidence.push(key);
    }
    var variants = {};
    for (var _d = 0, _e = Object.entries((_b = sig.variants) !== null && _b !== void 0 ? _b : {}); _d < _e.length; _d++) {
        var _f = _e[_d], key = _f[0], fn = _f[1];
        var v = fn(n, ctx);
        if (v !== null)
            variants[key] = v;
    }
    return { name: sig.name, score: total / entries.length, variants: variants, evidence: evidence };
}
/**
 * A wrapper holding several finished components is a layout region, not a
 * component. Without this, every `<section>` that happens to have a border and
 * two children reads as a Card, and any row of medium-weight labels reads as a
 * Tabs. Icons are excluded: a decorative glyph is not a child component.
 *
 * Runs before `suppressNested`, which then only has to resolve the genuine case
 * of a node duplicated by its own inner content box.
 */
function demoteLayoutContainers(candidates, nodes) {
    var demoted = new Set();
    for (var _i = 0, candidates_1 = candidates; _i < candidates_1.length; _i++) {
        var _a = candidates_1[_i], id = _a[0], list = _a[1];
        var childComponents = nodes[id].children.filter(function (cid) {
            var _a;
            var best = (_a = candidates.get(cid)) === null || _a === void 0 ? void 0 : _a[0];
            return best && best.score >= exports.AUTO_ACCEPT && best.name !== 'Icon';
        });
        if (childComponents.length < 2)
            continue;
        demoted.add(id);
        for (var _b = 0, list_1 = list; _b < list_1.length; _b++) {
            var c = list_1[_b];
            c.score = Math.min(c.score, exports.AMBIGUOUS - 0.01);
        }
    }
    return demoted;
}
/**
 * Containment resolution. A card's inner wrapper often satisfies the Card
 * signals too (same border, same radius), so when a node and its ancestor both
 * claim the same component, only the outer one is real — the inner is the
 * card's own content box.
 */
function suppressNested(candidates, nodes) {
    var _loop_1 = function (id, list) {
        var accepted = list.filter(function (c) { return c.score >= exports.AUTO_ACCEPT; });
        if (accepted.length === 0)
            return "continue";
        var ancestor = nodes[id].parent;
        while (ancestor) {
            var parentList = candidates.get(ancestor);
            var clash = parentList === null || parentList === void 0 ? void 0 : parentList.find(function (c) { return c.score >= exports.AUTO_ACCEPT && accepted.some(function (a) { return a.name === c.name; }); });
            if (clash) {
                // The ancestor won; demote this node below the accept line.
                for (var _b = 0, list_2 = list; _b < list_2.length; _b++) {
                    var c = list_2[_b];
                    if (c.name === clash.name)
                        c.score = Math.min(c.score, exports.AMBIGUOUS - 0.01);
                }
            }
            ancestor = nodes[ancestor].parent;
        }
    };
    for (var _i = 0, candidates_2 = candidates; _i < candidates_2.length; _i++) {
        var _a = candidates_2[_i], id = _a[0], list = _a[1];
        _loop_1(id, list);
    }
}
function classify(ir) {
    // The modal background, so "is this element filled" can be answered against
    // the page rather than against transparency alone.
    var pageBackground = toCss((0, theme_ts_1.pageBackground)(ir));
    var ctx = { nodes: ir.nodes, pageBackground: pageBackground };
    var out = new Map();
    var candidates = new Map();
    var _loop_2 = function (n) {
        if (STRUCTURAL.has(n.tag))
            return "continue";
        if (n.kind === 'icon' && n.iconShape) {
            out.set(n.id, {
                nodeId: n.id,
                component: 'Icon',
                score: 1,
                variants: {},
                evidence: ['svg'],
                candidates: [],
                icon: (0, icon_ts_1.matchIcon)(n.iconShape),
            });
            return "continue";
        }
        // Native form elements and illustrations already have a decided identity.
        if (n.kind === 'illustration' || n.kind === 'image')
            return "continue";
        if (!n.visible)
            return "continue";
        var scored = signatures_ts_1.SIGNATURES.map(function (sig) { return score(n, sig, ctx); })
            .filter(function (c) { return c !== null; })
            .sort(function (a, b) { return b.score - a.score; });
        if (scored.length)
            candidates.set(n.id, scored);
    };
    for (var _i = 0, _a = Object.values(ir.nodes); _i < _a.length; _i++) {
        var n = _a[_i];
        _loop_2(n);
    }
    var demoted = demoteLayoutContainers(candidates, ir.nodes);
    suppressNested(candidates, ir.nodes);
    for (var _b = 0, candidates_3 = candidates; _b < candidates_3.length; _b++) {
        var _c = candidates_3[_b], id = _c[0], scored = _c[1];
        var best = scored[0];
        var component = best.score >= exports.AUTO_ACCEPT ? best.name : null;
        // A demoted wrapper keeps its evidence but reports no component: it is part
        // of the output tree, just not a component boundary.
        var evidence = demoted.has(id) ? __spreadArray(__spreadArray([], best.evidence, true), ['layout-region'], false) : best.evidence;
        // Filter against the vendored props before this leaves the classifier: a
        // signature's proposal is a hypothesis about what it saw, and only the
        // registry knows whether shadcn can express it.
        var _d = component
            ? (0, variants_ts_1.reconcile)(component, best.variants)
            : { attrs: {}, state: {}, dropped: [] }, attrs = _d.attrs, state = _d.state, dropped = _d.dropped;
        out.set(id, {
            nodeId: id,
            component: component,
            score: best.score,
            // One field for everything the emitter may write: enum props and observed
            // state both become JSX attributes.
            variants: __assign(__assign({}, attrs), state),
            evidence: dropped.length ? __spreadArray(__spreadArray([], evidence, true), dropped.map(function (d) { return "dropped:".concat(d); }), true) : evidence,
            candidates: scored.slice(0, 3),
        });
    }
    return out;
}
/**
 * Descendants of an accepted component. A `td` scoring 0.77 on Badge is not a
 * missed badge — it is a cell inside a Table that was already recognised, and
 * the emitter renders it as Table content. Asking the LLM about these would
 * flood the queue with the interior of every composite on the page.
 */
function interiorOf(nodes, classes) {
    var interior = new Set();
    for (var _i = 0, classes_1 = classes; _i < classes_1.length; _i++) {
        var _a = classes_1[_i], id = _a[0], c = _a[1];
        if (!c.component || c.component === 'Icon')
            continue;
        var stack = __spreadArray([], nodes[id].children, true);
        while (stack.length) {
            var cur = stack.pop();
            // Stop at a nested component boundary: a Button inside a Card is its own
            // component, and anything inside that button belongs to the button.
            var inner = classes.get(cur);
            if (inner === null || inner === void 0 ? void 0 : inner.component)
                continue;
            interior.add(cur);
            stack.push.apply(stack, nodes[cur].children);
        }
    }
    return interior;
}
/** Nodes the LLM pass should look at: genuinely undecided, not composite interior. */
function ambiguous(classes, interior) {
    return __spreadArray([], classes.values(), true).filter(function (c) { return c.component === null && c.score >= exports.AMBIGUOUS && !interior.has(c.nodeId); })
        .sort(function (a, b) { return b.score - a.score; });
}
function stats(classes, ir, interior) {
    var _a;
    var accepted = 0;
    var amb = 0;
    var icons = 0;
    var byComponent = {};
    for (var _i = 0, _b = classes.values(); _i < _b.length; _i++) {
        var c = _b[_i];
        if (c.component === 'Icon')
            icons++;
        else if (c.component) {
            accepted++;
            byComponent[c.component] = ((_a = byComponent[c.component]) !== null && _a !== void 0 ? _a : 0) + 1;
        }
        else if (c.score >= exports.AMBIGUOUS && !interior.has(c.nodeId)) {
            // Composite interior is undecided by design, not an open question.
            amb++;
        }
    }
    return {
        total: Object.values(ir.nodes).filter(function (n) { return n.visible && !STRUCTURAL.has(n.tag); }).length,
        accepted: accepted,
        ambiguous: amb,
        unclassified: 0,
        icons: icons,
        byComponent: byComponent,
    };
}
