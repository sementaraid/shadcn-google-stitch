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
exports.emit = emit;
var index_generated_ts_1 = require("../registry/shadcn/index.generated.ts");
var classname_ts_1 = require("./classname.ts");
var colors_ts_1 = require("./colors.ts");
var esc = function (s) {
    return s.replace(/[{}]/g, function (c) { return "{'".concat(c, "'}"); }).replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/&/g, '&amp;');
};
var pascal = function (s) {
    return s
        .split(/[^a-zA-Z0-9]+/)
        .filter(Boolean)
        .map(function (p) { return p[0].toUpperCase() + p.slice(1); })
        .join('');
};
var kebab = function (s) {
    return s
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
        .toLowerCase();
};
/** The slot of a given kind on a node, if any. */
function slotOf(ctx, id, kind) {
    var _a;
    return (_a = ctx.slots.get(id)) === null || _a === void 0 ? void 0 : _a.find(function (s) { return s.kind === kind; });
}
/** Enum props as JSX attributes. Booleans and numbers are not quoted. */
function variantAttrs(cls, ctx) {
    var _a;
    var entry = index_generated_ts_1.SHADCN[cls.component];
    if (!entry) {
        ctx.warnings.push("".concat(cls.nodeId, ": ").concat(cls.component, " is not in the registry, emitting as an element"));
        return [];
    }
    var slots = (_a = ctx.slots.get(cls.nodeId)) !== null && _a !== void 0 ? _a : [];
    // Slot props come first: the reconciler drops any value equal to the
    // component's default, so a button that is `outline` while its siblings are
    // default would otherwise lose the attribute entirely.
    var props = new Set(__spreadArray(__spreadArray([], slots.map(function (s) { return s.prop; }), true), Object.keys(cls.variants), true));
    return __spreadArray([], props, true).sort().map(function (prop) {
        var slot = slots.find(function (s) { return s.kind === 'variant' && s.prop === prop; });
        if (slot)
            return "".concat(prop, "={").concat(slot.key, "}");
        var value = cls.variants[prop];
        if (value === undefined)
            return '';
        if (/^\d+$/.test(value))
            return "".concat(prop, "={").concat(value, "}");
        if (/^(default)?(checked|open|disabled|required|multiple)$/.test(prop))
            return "".concat(prop, "={true}");
        return "".concat(prop, "=\"").concat(value, "\"");
    });
}
function stitchAttr(n) {
    // The verify pass (M5) maps a rendered element back to its IR node through
    // this attribute, so it goes on every element. `import.meta.env.DEV` is not
    // used here: the attribute is inert and Vite strips unknown data-* only if
    // asked, which is a build-config concern, not the emitter's.
    return "data-stitch-id=\"".concat(n.id, "\"");
}
/**
 * Widest-wins sizing. Arbitrary value, not `size-N`: the scale is 0.25rem per
 * step, so `size-20` is 80px, not the 20px the box measured.
 */
function iconSize(n) {
    var px = Math.round(Math.max(n.box.w, n.box.h));
    // Important: a component's base can force its descendants — `Badge` ships
    // `[&>svg]:size-3!` — and the size here is the one the source page actually
    // measured, so it has to win over the component's guess.
    return px > 0 ? "size-[".concat(px, "px]!") : null;
}
function isComponent(n, ctx) {
    var _a;
    return Boolean((_a = ctx.classes.get(n.id)) === null || _a === void 0 ? void 0 : _a.component);
}
/**
 * The classes a node actually carries.
 *
 * One function so the repeat diff and the emitter agree on what "these two
 * siblings differ" means — a diff computed off raw styles would flag props the
 * emitter never writes, and miss ones it does.
 */
function emittedClasses(n, ctx) {
    if (isComponent(n, ctx)) {
        // A component states its own flex direction, because its base may already
        // set one — `Card` ships `flex-col`, and a row of children would silently
        // stack without an explicit `flex-row`. Everything else the page measured
        // (padding, border, background, shadow) is emitted too: `cn` is
        // tailwind-merge, so the className a component appends overrides its base
        // per property rather than doubling it.
        return (0, classname_ts_1.classNames)(n.style, { component: true });
    }
    // A text leaf is styled by the type scale, not by the box model.
    if (n.text && !n.children.length)
        return (0, classname_ts_1.textClasses)(n.style);
    // An absolutely positioned node carries its own offsets, not a flow size.
    return (0, classname_ts_1.classNames)(n.style, { skipSize: n.style.position === 'absolute' });
}
function classAttrs(n, ctx) {
    var slot = slotOf(ctx, n.id, 'class');
    if (slot)
        return ["className={".concat(slot.key, "}")];
    var names = emittedClasses(n, ctx);
    // A component's base can pin its own descendants at `!important` — `Badge`
    // ships `[&>svg]:size-3!` — and a child's own class cannot out-specify that.
    // Restating the measured size as the same descendant selector on the component
    // does, because the component's base comes first in `cn`'s argument list and
    // Tailwind emits the later rule last.
    var icons = n.children.map(function (id) { return ctx.ir.nodes[id]; }).filter(function (c) { return (c === null || c === void 0 ? void 0 : c.visible) && c.kind === 'icon'; });
    var sizes = new Set(icons.map(function (c) { return iconSize(c); }));
    if (isComponent(n, ctx) && sizes.size === 1)
        names.push("[&>svg]:".concat(__spreadArray([], sizes, true)[0]));
    return names.length ? ["className=\"".concat(names.join(' '), "\"")] : [];
}
function rawSvg(n, ctx) {
    var _a;
    var shape = n.iconShape;
    var w = Math.max(1, Math.round(n.box.w));
    var h = Math.max(1, Math.round(n.box.h));
    if (!shape) {
        ctx.warnings.push("".concat(n.id, ": illustration with no captured geometry, emitting an empty box"));
        return "<span ".concat(stitchAttr(n), " className=\"inline-block w-[").concat(w, "px] h-[").concat(h, "px]\" />");
    }
    var kids = shape.children
        .map(function (_a) {
        var tag = _a[0], attrs = _a[1];
        var a = Object.entries(attrs)
            .filter(function (_a) {
            var k = _a[0];
            return k !== 'class' && k !== 'id' && !k.startsWith('data-');
        })
            .map(function (_a) {
            var k = _a[0], v = _a[1];
            return "".concat(k, "=\"").concat(v, "\"");
        })
            .join(' ');
        return "<".concat(tag).concat(a ? ' ' + a : '', " />");
    })
        .join('');
    var viewBox = (_a = shape.viewBox) !== null && _a !== void 0 ? _a : "0 0 ".concat(w, " ").concat(h);
    return "<svg ".concat(stitchAttr(n), " width=\"").concat(w, "\" height=\"").concat(h, "\" viewBox=\"").concat(viewBox, "\" fill=\"none\" stroke=\"currentColor\" strokeLinecap=\"round\" strokeLinejoin=\"round\">").concat(kids, "</svg>");
}
function iconJsx(n, cls, ctx) {
    var match = cls.icon;
    // Only the two exact rungs may become an import. A `fuzzy` hit is a ranked
    // guess for a human (or the M6 vision pass) to confirm — emitting it would
    // silently swap the page's artwork for a similar-looking one, which is worse
    // than keeping the geometry. Verified against the pricing fixture: its sparkle
    // scores 0.92 as `Leaf` and is not a Leaf.
    if (!match || match.via === 'fuzzy' || match.via === 'none') {
        if ((match === null || match === void 0 ? void 0 : match.via) === 'fuzzy') {
            ctx.warnings.push("".concat(n.id, ": icon looks like ").concat(match.name, " (").concat(match.confidence.toFixed(2), ") but was not confirmed; candidates ").concat(match.candidates.slice(0, 5).join(', '), " \u2014 kept verbatim"));
        }
        return rawSvg(n, ctx);
    }
    ctx.icons.add(match.name);
    // The icon's own colour, dropped when it is just `foreground` — lucide already
    // strokes `currentColor`, and the base layer sets that to the foreground.
    // Selected as a `text-` class that is *not* a size: `textClasses` also carries
    // `text-[14px]`, and taking the first `text*` match painted the icon's font
    // size on as if it were a colour.
    var tint = (0, classname_ts_1.textClasses)(n.style).find(function (c) { return /^text-(?!\[[\d.]+px\])/.test(c) && c !== 'text-foreground'; });
    var classes = [iconSize(n), tint].filter(Boolean);
    var attrs = [stitchAttr(n)];
    if (classes.length)
        attrs.push("className=\"".concat(classes.join(' '), "\""));
    return "<".concat(match.name, " ").concat(attrs.join(' '), " />");
}
function imageJsx(n, ctx) {
    var attrs = __spreadArray([stitchAttr(n)], classAttrs(n, ctx), true);
    if (!slotOf(ctx, n.id, 'class') && n.box.w > 0 && Math.abs(n.box.w / n.box.h - 16 / 9) < 0.15) {
        attrs[attrs.length - 1] = attrs[attrs.length - 1].replace(/"$/, ' aspect-video"');
    }
    return "<ImagePlaceholder ".concat(attrs.join(' '), " />");
}
function textJsx(n, ctx) {
    var attrs = __spreadArray([stitchAttr(n)], classAttrs(n, ctx), true);
    return "<span ".concat(attrs.join(' '), ">").concat(textInner(n, ctx), "</span>");
}
/** A node's own text and children, in the order the source had them. */
function bodyWithText(n, ctx) {
    var kids = n.children.map(function (cid) { return nodeJsx(ctx.ir.nodes[cid], ctx, {}); });
    var text = textInner(n, ctx);
    if (!text)
        return kids.join('');
    // `textAt` counts element children, so an icon drawn before the label keeps
    // the label after it. A missing index (`null`) means text-only content.
    var at = n.textAt === null ? kids.length : Math.max(0, Math.min(kids.length, n.textAt));
    kids.splice(at, 0, text);
    return kids.join('');
}
function elementJsx(n, ctx) {
    var attrs = [stitchAttr(n)];
    if (n.ariaLabel)
        attrs.push("aria-label=\"".concat(n.ariaLabel, "\""));
    attrs.push.apply(attrs, classAttrs(n, ctx));
    var body = bodyWithText(n, ctx);
    if (!body)
        return "<div ".concat(attrs.join(' '), " />");
    return "<div ".concat(attrs.join(' '), ">").concat(body, "</div>");
}
function componentJsx(n, cls, ctx) {
    var name = cls.component;
    var entry = index_generated_ts_1.SHADCN[name];
    if (!entry) {
        ctx.warnings.push("".concat(n.id, ": ").concat(name, " is not a shadcn component; emitting a div instead"));
        return elementJsx(n, ctx);
    }
    ctx.ui.set(name, entry.importPath);
    // A placeholder is the only text an empty field shows, and it survives into the
    // component path too — `Input` takes it as a plain DOM prop.
    var ph = n.placeholder ? ["placeholder=\"".concat(n.placeholder, "\"")] : [];
    var attrs = __spreadArray(__spreadArray(__spreadArray([stitchAttr(n)], ph, true), variantAttrs(cls, ctx), true), classAttrs(n, ctx), true).filter(Boolean);
    var body = bodyWithText(n, ctx);
    if (!body)
        return "<".concat(name, " ").concat(attrs.join(' '), " />");
    return "<".concat(name, " ").concat(attrs.join(' '), ">").concat(body, "</").concat(name, ">");
}
/** A node's own text, as a prop reference when it is a slot and as literal text otherwise. */
function textInner(n, ctx) {
    var slot = slotOf(ctx, n.id, 'text');
    if (slot)
        return "{".concat(slot.key, "}");
    return n.text ? esc(n.text) : '';
}
function nodeJsx(n, ctx, opts) {
    if (!n.visible)
        return '';
    // A collapsed repeat group is emitted once, at its first sibling, as a
    // `.map()` over the sibling data. The other siblings render nothing here
    // because the map already covers them.
    if (n.repeat && !opts.asTemplate) {
        var group = ctx.repeats.get(n.repeat.siblingIds[0]);
        if (group)
            return n.id === group.firstId ? repeatJsx(group) : '';
    }
    var cls = ctx.classes.get(n.id);
    if ((cls === null || cls === void 0 ? void 0 : cls.component) === 'Icon')
        return iconJsx(n, cls, ctx);
    if (n.kind === 'illustration')
        return rawSvg(n, ctx);
    if (n.kind === 'image')
        return imageJsx(n, ctx);
    if (cls === null || cls === void 0 ? void 0 : cls.component)
        return componentJsx(n, cls, ctx);
    // An unrecognised control (`<input>`, `<select>`) still renders; keeping the
    // source's element is more faithful than pretending it is a div.
    if (n.kind === 'control') {
        var attrs = [stitchAttr(n)];
        if (n.ariaLabel)
            attrs.push("aria-label=\"".concat(n.ariaLabel, "\""));
        // A placeholder is the only text an empty field shows, and the source page
        // shows it — dropping it leaves a visibly blank input in the diff.
        if (n.placeholder)
            attrs.push("placeholder=\"".concat(n.placeholder, "\""));
        if (/input|textarea|select/.test(n.tag))
            attrs.push('className="border border-input"');
        return "<".concat(n.tag, " ").concat(attrs.join(' '), " />");
    }
    if (n.text && !n.children.length)
        return textJsx(n, ctx);
    return elementJsx(n, ctx);
}
function repeatJsx(g) {
    if (!g.slots.length)
        return "{Array.from({ length: ".concat(g.count, " }, (_, i) => (<").concat(g.name, " key={i} />))}");
    return "{".concat(g.name, "Data.map((item, i) => (<").concat(g.name, " key={i} {...item} />))}");
}
/**
 * Group the siblings a repeat node stands for into a component with props.
 *
 * Values are compared by ordinal, in depth-first order: repeat detection already
 * proved the siblings share a structure hash, so ordinal `i` in one subtree
 * lines up with ordinal `i` in the next, and each ordinal that holds a differing
 * text, class or variant becomes a prop. This is also what flattens a repeat
 * nested inside a repeat (the pricing fixture's feature lists) — the inner texts
 * become props of the outer component, so no second `.map()` is needed.
 *
 * ponytail: only top-level groups collapse. Add recursive grouping when a
 * fixture needs a repeated component with a second, genuinely different inner
 * `.map()`.
 */
function buildGroup(first, ctx) {
    var _a, _b;
    var siblings = first
        .repeat.siblingIds.map(function (id) { return ctx.ir.nodes[id]; })
        .filter(function (n) { return Boolean(n === null || n === void 0 ? void 0 : n.visible); });
    if (siblings.length < 2)
        return null;
    var rows = siblings.map(function (s) { return walkOrdered(s, ctx); });
    var template = rows[0];
    if (rows.some(function (r) { return r.length !== template.length; }))
        return null;
    var slots = [];
    var counters = { text: 0, class: 0, variant: 0 };
    var _loop_1 = function (i) {
        var add = function (kind, values, prop) {
            var key = "".concat(kind).concat(counters[kind]++);
            slots.push({ key: key, kind: kind, index: i, nodeId: template[i].id, prop: prop, values: values });
        };
        if (varying(rows.map(function (r) { return r[i].text; })))
            add('text', rows.map(function (r) { return r[i].text; }));
        if (varying(rows.map(function (r) { return r[i].cls; })))
            add('class', rows.map(function (r) { return r[i].cls; }));
        // A component's variant is invisible in both text and className, so it is
        // compared on its own: the pricing fixture's Pro and Team buttons are filled
        // while Starter's is outlined, which is the difference a reader would notice.
        var node = template[i].node;
        var own = (_b = (_a = ctx.classes.get(node.id)) === null || _a === void 0 ? void 0 : _a.variants) !== null && _b !== void 0 ? _b : {};
        var _loop_2 = function (prop) {
            var values = rows.map(function (r) { return effectiveVariant(r[i].node, prop, ctx); });
            if (varying(values))
                add('variant', values, prop);
        };
        for (var _i = 0, _c = Object.keys(own).sort(); _i < _c.length; _i++) {
            var prop = _c[_i];
            _loop_2(prop);
        }
    };
    for (var i = 0; i < template.length; i++) {
        _loop_1(i);
    }
    // Filled in by `emit`, which is where the name has to be unique project-wide.
    return { name: groupName(first, ctx), firstId: first.id, module: '', slots: slots, count: siblings.length };
}
var varying = function (values) { return new Set(values).size > 1; };
/**
 * A node's value for one variant prop, with the registry default filled in.
 *
 * `reconcile` drops props equal to the component's default, which is right for
 * a one-off but wrong for a repeat slot: three cards whose buttons are default,
 * default, outline would compare as `undefined, undefined, outline` and read as
 * two distinct values when they are really just two.
 */
function effectiveVariant(n, prop, ctx) {
    var _a, _b, _c, _d, _e, _f, _g;
    var own = (_b = (_a = ctx.classes.get(n.id)) === null || _a === void 0 ? void 0 : _a.variants) === null || _b === void 0 ? void 0 : _b[prop];
    if (own !== undefined)
        return own;
    var axis = (_f = (_e = index_generated_ts_1.SHADCN[(_d = (_c = ctx.classes.get(n.id)) === null || _c === void 0 ? void 0 : _c.component) !== null && _d !== void 0 ? _d : '']) === null || _e === void 0 ? void 0 : _e.variants) === null || _f === void 0 ? void 0 : _f.find(function (v) { return v.prop === prop; });
    return (_g = axis === null || axis === void 0 ? void 0 : axis.default) !== null && _g !== void 0 ? _g : '';
}
/** A subtree's text, classes and nodes, in the depth-first order the emitter renders them. */
function walkOrdered(root, ctx) {
    var out = [];
    var walk = function (n) {
        var _a;
        if (!n.visible)
            return;
        out.push({ id: n.id, text: (_a = n.text) !== null && _a !== void 0 ? _a : '', cls: emittedClasses(n, ctx).join(' '), node: n });
        for (var _i = 0, _b = n.children; _i < _b.length; _i++) {
            var cid = _b[_i];
            var c = ctx.ir.nodes[cid];
            if (c)
                walk(c);
        }
    };
    walk(root);
    return out;
}
function groupName(n, ctx) {
    var _a, _b, _c;
    var base = (_c = (_b = (_a = ctx.classes.get(n.id)) === null || _a === void 0 ? void 0 : _a.component) !== null && _b !== void 0 ? _b : TAG_NAMES[n.tag]) !== null && _c !== void 0 ? _c : pascal(n.tag);
    var root = "Repeat".concat(base);
    var name = root;
    var i = 1;
    while (ctx.usedNames.has(name))
        name = "".concat(root).concat(i++);
    ctx.usedNames.add(name);
    return name;
}
var TAG_NAMES = {
    li: 'Item',
    div: 'Item',
    span: 'Item',
    a: 'Link',
    button: 'Button',
    td: 'Cell',
    tr: 'Row',
    option: 'Option',
};
function emit(ir, classes) {
    var _a;
    var ctx = {
        ir: ir,
        classes: classes,
        ui: new Map(),
        icons: new Set(),
        warnings: [],
        repeats: new Map(),
        slots: new Map(),
        usedNames: new Set(),
    };
    // The class emitter resolves colours against this palette, so it has to be set
    // before the first `classNames` call. Same palette the stylesheet is written
    // from — one extraction, two consumers.
    (0, classname_ts_1.usePalette)((0, colors_ts_1.assignPalette)((0, colors_ts_1.pageBackground)(ir), (0, colors_ts_1.colorUses)(ir, (0, colors_ts_1.pageBackground)(ir))));
    var body = Object.values(ir.nodes).find(function (n) { return n.tag === 'body'; });
    if (!body)
        throw new Error('no <body> in the IR — the page did not render');
    var roots = body.children.map(function (cid) { return ir.nodes[cid]; }).filter(function (n) { return n === null || n === void 0 ? void 0 : n.visible; });
    if (roots.length === 0)
        throw new Error('the page rendered no visible content');
    var files = new Map();
    // Repeat components are rendered *before* the page, and each one's imports are
    // captured and cleared in between: a `Card` only a repeat component uses must
    // be imported by that file, not by the page that merely maps over it.
    for (var _i = 0, _b = Object.values(ir.nodes); _i < _b.length; _i++) {
        var n = _b[_i];
        if (!n.repeat || !n.visible || n.repeat.siblingIds[0] !== n.id)
            continue;
        if (hasRepeatAncestor(n, ir))
            continue;
        var group = buildGroup(n, ctx);
        if (!group)
            continue;
        group.module = kebab(group.name);
        ctx.repeats.set(n.id, group);
        for (var _c = 0, _d = group.slots; _c < _d.length; _c++) {
            var s = _d[_c];
            ctx.slots.set(s.nodeId, __spreadArray(__spreadArray([], ((_a = ctx.slots.get(s.nodeId)) !== null && _a !== void 0 ? _a : []), true), [s], false));
        }
        var jsx = nodeJsx(n, ctx, { asTemplate: true });
        var imports_1 = takeImports(ctx);
        files.set("src/components/generated/".concat(group.module, ".tsx"), repeatModule(group, jsx, imports_1, ctx));
    }
    var tree = roots.map(function (n) { return nodeJsx(n, ctx, {}); }).filter(Boolean).join('\n      ');
    var groups = __spreadArray([], ctx.repeats.values(), true);
    var data = groups
        .filter(function (g) { return g.slots.length; })
        .map(function (g) { return "\nconst ".concat(g.name, "Data = [\n").concat(repeatRows(g, ctx), "\n] as const\n"); })
        .join('');
    var pageBody = "export function Page() {\n  return (\n    <div className=\"min-h-screen bg-background\" data-stitch-root>\n      ".concat(tree, "\n    </div>\n  )\n}\n");
    var imports = takeImports(ctx);
    // The props interface is exported for whoever extends the component later, not
    // for the page that maps over it, so only the value is imported here.
    var local = groups.map(function (g) { return "import { ".concat(g.name, " } from './").concat(g.module, "'"); });
    files.set('src/components/generated/page.tsx', module(__spreadArray(__spreadArray([], imports.uiLines, true), local, true), imports.icons, data + '\n' + pageBody));
    files.set('src/App.tsx', "import { Page } from '@/components/generated/page'\n\nexport default function App() {\n  return <Page />\n}\n");
    files.set('src/components/generated/image-placeholder.tsx', IMAGE_PLACEHOLDER);
    return { files: files, warnings: ctx.warnings };
}
/**
 * Whether this repeat node sits inside another one's collapsed subtree.
 *
 * Any ancestor carrying a `repeat` counts, not just the group's first sibling:
 * the pricing fixture's feature lists hang off the *second* and *third* card,
 * so checking only for a first-sibling ancestor misses them and emits a stray
 * component for each.
 */
function hasRepeatAncestor(n, ir) {
    var cur = n.parent ? ir.nodes[n.parent] : null;
    while (cur) {
        if (cur.repeat)
            return true;
        cur = cur.parent ? ir.nodes[cur.parent] : null;
    }
    return false;
}
/** Claim the imports accumulated so far, so the next module starts clean. */
function takeImports(ctx) {
    var uiLines = __spreadArray([], ctx.ui, true).sort().map(function (_a) {
        var name = _a[0], path = _a[1];
        return "import { ".concat(name, " } from '").concat(path, "'");
    });
    var icons = __spreadArray([], ctx.icons, true).sort();
    ctx.ui.clear();
    ctx.icons.clear();
    return { uiLines: uiLines, icons: icons };
}
function module(imports, icons, body) {
    var lines = __spreadArray([], imports, true);
    if (icons.length)
        lines.push("import { ".concat(icons.join(', '), " } from 'lucide-react'"));
    if (body.includes('ImagePlaceholder'))
        lines.push("import { ImagePlaceholder } from './image-placeholder'");
    return lines.length ? "".concat(lines.join('\n'), "\n\n").concat(body) : body;
}
/** The data rows that sit beside the map site, one per sibling. */
function repeatRows(g, ctx) {
    var _a, _b, _c, _d;
    // Slot values are already one-per-visible-sibling, so they are the row count.
    var count = (_d = (_b = (_a = g.slots[0]) === null || _a === void 0 ? void 0 : _a.values.length) !== null && _b !== void 0 ? _b : (_c = ctx.ir.nodes[g.firstId].repeat) === null || _c === void 0 ? void 0 : _c.count) !== null && _d !== void 0 ? _d : 0;
    return Array.from({ length: count }, function (_, i) {
        var fields = g.slots.map(function (s) { var _a; return "".concat(s.key, ": ").concat(JSON.stringify((_a = s.values[i]) !== null && _a !== void 0 ? _a : '')); });
        return "  { ".concat(fields.join(', '), " },");
    }).join('\n');
}
/**
 * The declared type of one prop slot.
 *
 * A variant slot feeds a component prop, so its type is that component's own
 * union from the vendored registry — `"secondary" | "outline"`, not `string`.
 * Emitting `string` there does not compile: `<Badge variant={variant0}>` with
 * `variant0: string` is TS2322. Text and class slots are genuinely free-form.
 */
function slotType(s, ctx) {
    var _a, _b;
    if (s.kind !== 'variant' || !s.prop)
        return 'string';
    var component = (_a = ctx.classes.get(s.nodeId)) === null || _a === void 0 ? void 0 : _a.component;
    var axis = component ? (_b = index_generated_ts_1.SHADCN[component]) === null || _b === void 0 ? void 0 : _b.variants.find(function (v) { return v.prop === s.prop; }) : undefined;
    if (!(axis === null || axis === void 0 ? void 0 : axis.options.length))
        return 'string';
    return axis.options.map(function (o) { return JSON.stringify(o); }).join(' | ');
}
function repeatModule(g, jsx, imports, ctx) {
    var iface = g.slots.length
        ? "export interface ".concat(g.name, "Props {\n").concat(g.slots.map(function (s) { return "  ".concat(s.key, ": ").concat(slotType(s, ctx)); }).join('\n'), "\n}\n\n")
        : '';
    var signature = g.slots.length ? "{ ".concat(g.slots.map(function (s) { return s.key; }).join(', '), " }: ").concat(g.name, "Props") : '';
    var body = "export function ".concat(g.name, "(").concat(signature, ") {\n  return (").concat(jsx, ")\n}\n");
    return module(imports.uiLines, imports.icons, iface + body);
}
var IMAGE_PLACEHOLDER = "import { ImageIcon } from 'lucide-react'\nimport { cn } from '@/lib/utils'\n\n/**\n * Every `img`, `<picture>` and `background-image` in the source becomes one of\n * these. Dimensions are preserved so the layout still measures true; the original\n * `src` rides along in `data-src` for whoever fills it in later.\n *\n * The verify pass masks this region: chasing a picture that was never going to\n * match would burn the patch loop.\n */\nexport function ImagePlaceholder({\n  className,\n  src,\n}: {\n  className?: string\n  src?: string\n}) {\n  return (\n    <div\n      data-placeholder\n      data-src={src}\n      className={cn('grid place-items-center bg-muted text-muted-foreground', className)}\n    >\n      <ImageIcon className=\"size-6 opacity-40\" />\n    </div>\n  )\n}\n";
