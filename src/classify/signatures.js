"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SIGNATURES = void 0;
var signature_ts_1 = require("./signature.ts");
var CTRL_TAGS = new Set(['button', 'input', 'select', 'textarea']);
/**
 * Scoring is `(base + sum(signals)) / (1 + n)`. `base` is what a signature is
 * worth once its `requires` gate has passed: gates already carry real
 * information (a `<label>` tag, a 1px-tall box), so a node that clears one
 * should not have to also satisfy every soft signal to reach the accept line.
 * Signatures whose gate is weak carry no base and must earn the score.
 */
exports.SIGNATURES = [
    {
        name: 'Button',
        base: 0.3,
        requires: function (n) {
            // A pill-radius control or role=checkbox is a Switch or Checkbox, whatever
            // its tag says.
            return (n.kind === 'control' && n.role !== 'switch' && n.role !== 'checkbox') ||
                n.role === 'button' ||
                (n.tag === 'a' && n.style.cursor === 'pointer' && Boolean(n.text));
        },
        weight: {
            realControl: function (n) { return (CTRL_TAGS.has(n.tag) ? 1 : 0); },
            clickable: function (n) { return (n.style.cursor === 'pointer' ? 1 : 0); },
            sized: function (n) { return (n.box.h >= 24 && n.box.h <= 64 ? 1 : 0); },
            surface: function (n, ctx) { return ((0, signature_ts_1.isFilled)(n, ctx) || (0, signature_ts_1.px)(n.style.borderWidth) > 0 ? 1 : 0); },
            hasLabel: function (n, ctx) { return (n.text || n.ariaLabel || (0, signature_ts_1.iconChild)(n, ctx) ? 1 : 0); },
        },
        variants: {
            variant: function (n, ctx) {
                if (!n.text && !(0, signature_ts_1.textContent)(n, ctx).trim())
                    return 'ghost';
                if ((0, signature_ts_1.isFilled)(n, ctx))
                    return (0, signature_ts_1.isDark)(n.style.backgroundColor) ? 'default' : 'secondary';
                return (0, signature_ts_1.px)(n.style.borderWidth) > 0 ? 'outline' : 'ghost';
            },
            size: function (n, ctx) {
                // Shadcn gives an icon-only button its own size rather than a variant.
                return !n.text && !(0, signature_ts_1.textContent)(n, ctx).trim() ? 'icon' : n.box.h >= 44 ? 'lg' : n.box.h <= 32 ? 'sm' : 'default';
            },
        },
        conflicts: ['Badge', 'Tabs', 'Switch'],
    },
    {
        name: 'Input',
        requires: function (n, ctx) {
            return n.tag === 'input' ||
                n.tag === 'textarea' ||
                (n.kind === 'control' && n.tag === 'select') ||
                (n.kind === 'container' &&
                    n.box.w >= 80 &&
                    n.box.h >= 28 &&
                    n.box.h <= 72 &&
                    (0, signature_ts_1.px)(n.style.borderWidth) > 0 &&
                    (0, signature_ts_1.kids)(n, ctx).length <= 2);
        },
        weight: {
            formTag: function (n) { return (n.tag === 'input' || n.tag === 'textarea' ? 1 : 0); },
            bordered: function (n) { return ((0, signature_ts_1.px)(n.style.borderWidth) > 0 ? 1 : 0); },
            emptyish: function (n, ctx) { return ((0, signature_ts_1.textContent)(n, ctx).trim().length === 0 ? 1 : 0); },
            radius: function (n) { return ((0, signature_ts_1.px)(n.style.borderRadius) > 0 ? 1 : 0); },
            wide: function (n) { return (n.box.w >= 120 ? 1 : 0); },
        },
        variants: {
            // Shadcn ships these as separate components, so the variant is really a
            // component name. The emitter reads this field to pick which one.
            kind: function (n, ctx) { return (n.tag === 'textarea' ? 'Textarea' : looksLikeSelect(n, ctx) ? 'Select' : null); },
        },
        conflicts: ['Card', 'Button'],
    },
    {
        name: 'Label',
        base: 0.15,
        // `for=` is the real tell and only the tag carries it. A styled div with
        // short text is a heading or a caption far more often than a label.
        requires: function (n) { return n.tag === 'label' || n.role === 'label'; },
        weight: {
            labelTag: function (n) { return (n.tag === 'label' ? 1 : 0); },
            short: function (n) { var _a, _b; return (((_b = (_a = n.text) === null || _a === void 0 ? void 0 : _a.length) !== null && _b !== void 0 ? _b : 99) <= 40 ? 1 : 0); },
            noBg: function (n, ctx) { return ((0, signature_ts_1.isFilled)(n, ctx) ? 0 : 1); },
        },
    },
    {
        name: 'Badge',
        base: 0.1,
        requires: function (n, ctx) {
            return n.kind !== 'control' &&
                !n.isLeafOpaque &&
                Boolean(n.text) &&
                n.box.h >= 14 &&
                n.box.h <= 40 &&
                n.children.length <= 2 &&
                // A badge sits inside a line of other content rather than filling a row.
                (n.box.w <= 220 || n.style.display.startsWith('inline'));
        },
        weight: {
            small: function (n) { return (n.box.h <= 32 ? 1 : 0.5); },
            // Pill or small radius. A square-cornered box with text is a table cell.
            rounded: function (n) { return ((0, signature_ts_1.px)(n.style.borderRadius) >= 4 ? 1 : 0); },
            surface: function (n, ctx) { return ((0, signature_ts_1.isFilled)(n, ctx) || (0, signature_ts_1.px)(n.style.borderWidth) > 0 ? 1 : 0); },
            shortText: function (n) { var _a, _b; return (((_b = (_a = n.text) === null || _a === void 0 ? void 0 : _a.length) !== null && _b !== void 0 ? _b : 99) <= 24 ? 1 : 0); },
            nonInteractive: function (n) { return (n.style.cursor === 'pointer' ? 0 : 1); },
            padded: function (n) { return ((0, signature_ts_1.px)(n.style.padding) > 0 ? 1 : 0); },
        },
        variants: {
            variant: function (n, ctx) { return ((0, signature_ts_1.isFilled)(n, ctx) ? ((0, signature_ts_1.isDark)(n.style.backgroundColor) ? 'default' : 'secondary') : 'outline'); },
        },
        conflicts: ['Button', 'Card'],
    },
    {
        name: 'Card',
        base: 0.1,
        requires: function (n, ctx) {
            return n.kind === 'container' &&
                n.box.w >= 120 &&
                n.box.h >= 60 &&
                n.children.length >= 2 &&
                // An icon in the corner is the Alert's tell, and Alert outranks Card, so
                // a framed box with an icon never lands here.
                !(0, signature_ts_1.iconChild)(n, ctx) &&
                ((0, signature_ts_1.isRound)(n) || (0, signature_ts_1.px)(n.style.borderWidth) > 0 || n.style.boxShadow !== 'none' || (0, signature_ts_1.isOpaqueBg)(n.style.backgroundColor));
        },
        weight: {
            framed: function (n) {
                return (0, signature_ts_1.px)(n.style.borderWidth) > 0 || n.style.boxShadow !== 'none' ? 1 : (0, signature_ts_1.isOpaqueBg)(n.style.backgroundColor) ? 0.6 : 0;
            },
            regions: function (n, ctx) { return ((0, signature_ts_1.kids)(n, ctx).filter(function (c) { return c.visible; }).length >= 2 ? 1 : 0); },
            hasText: function (n, ctx) { return ((0, signature_ts_1.textContent)(n, ctx).trim().length > 0 ? 1 : 0); },
            padded: function (n) { return (n.style.padding.split(' ').map(signature_ts_1.px).some(function (p) { return p >= 8; }) ? 1 : 0); },
            notControl: function (n) { return (CTRL_TAGS.has(n.tag) ? 0 : 1); },
            // A card is a leaf unit of layout. A page-sized wrapper is a layout region,
            // which is also what keeps the page shell out of this signature.
            sized: function (n) { return ((0, signature_ts_1.area)(n) <= 640000 ? 1 : 0); },
        },
        variants: {
            variant: function (n, ctx) { return ((0, signature_ts_1.isFilled)(n, ctx) ? null : 'outline'); },
        },
        conflicts: ['Input', 'Alert'],
    },
    {
        name: 'Avatar',
        // The round-square gate is weak on its own, so Avatar earns its score.
        base: 0.1,
        requires: function (n) {
            var ratio = n.box.w / Math.max(n.box.h, 1);
            // The 24px floor keeps a Switch knob (16px) from reading as an avatar.
            return (n.box.w >= 24 &&
                n.box.w <= 96 &&
                ratio > 0.85 &&
                ratio < 1.18 &&
                (0, signature_ts_1.px)(n.style.borderRadius) >= Math.min(n.box.w, n.box.h) / 2 - 2);
        },
        weight: {
            round: function (n) { return ((0, signature_ts_1.px)(n.style.borderRadius) >= Math.min(n.box.w, n.box.h) / 2 - 2 ? 1 : 0); },
            square: function (n) {
                var r = n.box.w / Math.max(n.box.h, 1);
                return r > 0.88 && r < 1.14 ? 1 : 0;
            },
            // An empty circle is still an avatar: the image is just missing. Only a
            // lot of text rules it out.
            content: function (n, ctx) {
                if ((0, signature_ts_1.kids)(n, ctx).some(function (c) { return c.kind === 'image'; }))
                    return 1;
                var len = (0, signature_ts_1.textContent)(n, ctx).trim().length;
                return len === 0 ? 0.5 : len <= 3 ? 1 : 0;
            },
            sized: function (n) { return (n.box.w <= 64 ? 1 : 0.5); },
        },
        variants: {
            size: function (n) { return (n.box.w <= 28 ? 'sm' : n.box.w >= 64 ? 'lg' : 'default'); },
        },
        conflicts: ['Badge', 'Checkbox'],
    },
    {
        name: 'Checkbox',
        base: 0.1,
        requires: function (n) {
            return (n.tag === 'input' && n.role === 'checkbox') ||
                n.role === 'checkbox' ||
                (n.box.w >= 10 &&
                    n.box.w <= 32 &&
                    Math.abs(n.box.w - n.box.h) <= 6 &&
                    (0, signature_ts_1.px)(n.style.borderWidth) > 0);
        },
        weight: {
            checkboxTag: function (n) { return (n.tag === 'input' || n.role === 'checkbox' ? 1 : 0); },
            small: function (n) { return (n.box.w <= 28 ? 1 : 0); },
            square: function (n) { return (Math.abs(n.box.w - n.box.h) <= 4 ? 1 : 0); },
            smallRadius: function (n) {
                var r = (0, signature_ts_1.px)(n.style.borderRadius);
                return r >= 0 && r <= 10 ? 1 : 0;
            },
            noText: function (n, ctx) { return ((0, signature_ts_1.textContent)(n, ctx).trim().length === 0 ? 1 : 0); },
        },
        variants: {
            // Read the box, do not assume. A checked box carries a check glyph or is
            // filled with an accent colour rather than the page surface; an unchecked
            // one is the page's own background behind a border.
            checked: function (n, ctx) { return ((0, signature_ts_1.iconChild)(n, ctx) || (0, signature_ts_1.isFilled)(n, ctx) ? 'checked' : 'unchecked'); },
        },
        conflicts: ['Avatar', 'Switch'],
    },
    {
        name: 'Separator',
        requires: function (n) { return (n.box.w <= 3 && n.box.h >= 16) || (n.box.h <= 3 && n.box.w >= 16); },
        weight: {
            thin: function (n) { return (Math.min(n.box.w, n.box.h) <= 3 ? 1 : 0); },
            long: function (n) { return (Math.max(n.box.w, n.box.h) >= 24 ? 1 : 0); },
            painted: function (n) { return ((0, signature_ts_1.isOpaqueBg)(n.style.backgroundColor) || (0, signature_ts_1.px)(n.style.borderWidth) > 0 ? 1 : 0); },
            empty: function (n) { return (n.children.length === 0 && !n.text ? 1 : 0); },
        },
        variants: {
            orientation: function (n) { return (n.box.h > n.box.w ? 'vertical' : 'horizontal'); },
        },
        conflicts: ['Progress'],
    },
    {
        name: 'Table',
        base: 0.1,
        requires: function (n, ctx) {
            if (n.tag === 'table' || n.role === 'table' || n.role === 'grid')
                return true;
            // Grid shape: two or more rows, each with the same number of cells.
            var rows = (0, signature_ts_1.kids)(n, ctx).filter(function (c) { return c.visible; });
            if (rows.length < 2)
                return false;
            var cells = rows.map(function (r) { return (0, signature_ts_1.kids)(r, ctx).filter(function (c) { return c.visible; }); });
            return cells.every(function (c) { return c.length === cells[0].length; }) && cells[0].length >= 2 && cells[0].length <= 12;
        },
        weight: {
            tableTag: function (n) { return (n.tag === 'table' ? 1 : 0); },
            role: function (n) { return (n.role === 'table' || n.role === 'grid' ? 1 : 0); },
            rowParts: function (n, ctx) { return ((0, signature_ts_1.kids)(n, ctx).some(function (c) { return ['thead', 'tbody', 'tr'].includes(c.tag); }) ? 1 : 0); },
            cellTags: function (n, ctx) { return ((0, signature_ts_1.descendants)(n, ctx).some(function (d) { return d.tag === 'td' || d.tag === 'th'; }) ? 1 : 0); },
            uniform: function (n, ctx) {
                var rows = (0, signature_ts_1.kids)(n, ctx).filter(function (c) { return c.visible; });
                if (rows.length < 2)
                    return 0;
                var w = rows.map(function (r) { return Math.round(r.box.w / 8); });
                return w.every(function (x) { return x === w[0]; }) ? 1 : 0;
            },
        },
        conflicts: ['Card', 'Tabs'],
    },
    {
        name: 'Tabs',
        base: 0.15,
        // A row of same-weight labels. Real nav links are body weight, which is what
        // separates a tab strip from a menu bar.
        requires: function (n, ctx) {
            if (n.role === 'tablist' || (0, signature_ts_1.kids)(n, ctx).some(function (c) { return c.role === 'tab'; }))
                return true;
            var labelled = (0, signature_ts_1.kids)(n, ctx).filter(function (c) { return c.visible && c.text && (0, signature_ts_1.px)(c.style.fontWeight) >= 500; });
            return labelled.length >= 2;
        },
        weight: {
            // Weights describe layout, not semantics: ARIA lives in `requires`. A tab
            // strip with no ARIA at all must still be able to reach the accept line.
            heavyKids: function (n, ctx) {
                var labelled = (0, signature_ts_1.kids)(n, ctx).filter(function (c) { return c.visible && c.text && (0, signature_ts_1.px)(c.style.fontWeight) >= 500; });
                return labelled.length >= 2 ? 1 : 0;
            },
            // A tab strip usually has a rule under it and an active tab with its own
            // edge. `px` reads the shorthand, so a border on one side counts.
            underline: function (n, ctx) { return ((0, signature_ts_1.kids)(n, ctx).some(function (c) { return (0, signature_ts_1.px)(c.style.borderWidth) > 0; }) ? 1 : 0); },
            horizontal: function (n) { return (n.style.display.includes('flex') && n.style.flexDirection.startsWith('row') ? 1 : 0.5); },
            padded: function (n, ctx) { return ((0, signature_ts_1.kids)(n, ctx).some(function (c) { return (0, signature_ts_1.px)(c.style.padding) > 0; }) ? 1 : 0); },
            ruled: function (n) { return ((0, signature_ts_1.px)(n.style.borderWidth) > 0 ? 1 : 0); },
        },
        conflicts: ['Button', 'Table'],
    },
    {
        name: 'Switch',
        base: 0.1,
        requires: function (n) {
            return n.role === 'switch' ||
                ((0, signature_ts_1.px)(n.style.borderRadius) >= n.box.h / 2 - 2 &&
                    n.box.w >= 28 &&
                    n.box.w <= 72 &&
                    n.box.h >= 14 &&
                    n.box.h <= 34 &&
                    (0, signature_ts_1.isOpaqueBg)(n.style.backgroundColor));
        },
        weight: {
            role: function (n) { return (n.role === 'switch' ? 1 : 0); },
            pill: function (n) { return ((0, signature_ts_1.px)(n.style.borderRadius) >= n.box.h / 2 - 2 ? 1 : 0); },
            ratio: function (n) { return (n.box.w / Math.max(n.box.h, 1) >= 1.4 ? 1 : 0); },
            painted: function (n) { return ((0, signature_ts_1.isOpaqueBg)(n.style.backgroundColor) ? 1 : 0); },
            noText: function (n, ctx) { return ((0, signature_ts_1.textContent)(n, ctx).trim().length === 0 ? 1 : 0); },
        },
        variants: {
            // The knob's position is the state: off sits at the start edge, on is
            // translated toward the end. Measuring it beats assuming the resting
            // value, which is what an unread `checked` would amount to.
            checked: function (n, ctx) {
                var knob = (0, signature_ts_1.kids)(n, ctx).find(function (c) { return c.visible && c.box.h < n.box.h && c.box.w < n.box.w; });
                if (!knob || !n.box.w)
                    return 'unchecked';
                var lead = knob.box.x - n.box.x;
                var trail = n.box.x + n.box.w - (knob.box.x + knob.box.w);
                // Off rests at the leading edge, on is pushed to the trailing one.
                return lead + 1 < trail ? 'unchecked' : 'checked';
            },
        },
        conflicts: ['Badge', 'Checkbox'],
    },
    {
        name: 'Progress',
        base: 0.2,
        requires: function (n, ctx) {
            return n.role === 'progressbar' ||
                (n.box.h >= 4 && n.box.h <= 14 && n.box.w >= 60 && (0, signature_ts_1.isOpaqueBg)(n.style.backgroundColor) && !(0, signature_ts_1.textContent)(n, ctx).trim());
        },
        weight: {
            role: function (n) { return (n.role === 'progressbar' ? 1 : 0); },
            thin: function (n) { return (n.box.h <= 14 ? 1 : 0); },
            wide: function (n) { return (n.box.w >= 60 ? 1 : 0); },
            rounded: function (n) { return ((0, signature_ts_1.px)(n.style.borderRadius) > 0 ? 1 : 0); },
            // The track is a shell; its text, if any, sits in the fill.
            noText: function (n, ctx) { return ((0, signature_ts_1.textContent)(n, ctx).trim().length === 0 ? 1 : 0); },
        },
        variants: {
            // The filled portion is the first child, measured against the track.
            value: function (n, ctx) {
                var fill = (0, signature_ts_1.kids)(n, ctx)[0];
                if (!fill || !n.box.w)
                    return '0';
                return String(Math.round((fill.box.w / n.box.w) * 100));
            },
        },
        conflicts: ['Separator'],
    },
    {
        name: 'Alert',
        requires: function (n, ctx) {
            return n.kind === 'container' &&
                n.box.w >= 180 &&
                n.box.h >= 40 &&
                Boolean((0, signature_ts_1.iconChild)(n, ctx)) &&
                (0, signature_ts_1.textContent)(n, ctx).trim().length > 0 &&
                ((0, signature_ts_1.hasSideBorder)(n) || (0, signature_ts_1.isOpaqueBg)(n.style.backgroundColor));
        },
        weight: {
            framed: function (n) { return ((0, signature_ts_1.hasSideBorder)(n) || (0, signature_ts_1.isOpaqueBg)(n.style.backgroundColor) ? 1 : 0); },
            hasIcon: function (n, ctx) { return ((0, signature_ts_1.iconChild)(n, ctx) ? 1 : 0); },
            hasTitle: function (n, ctx) { return ((0, signature_ts_1.descendants)(n, ctx).some(function (d) { return (0, signature_ts_1.px)(d.style.fontWeight) >= 600; }) ? 1 : 0); },
            hasBody: function (n, ctx) { return ((0, signature_ts_1.kids)(n, ctx).some(function (c) { return (0, signature_ts_1.textContent)(c, ctx).trim().length > 0; }) ? 1 : 0); },
            rounded: function (n) { return ((0, signature_ts_1.px)(n.style.borderRadius) > 0 ? 1 : 0); },
        },
        conflicts: ['Card'],
    },
];
/** `select` is a control tag but presents as a form field, not a button. */
function looksLikeSelect(n, ctx) {
    if (n.tag === 'select')
        return true;
    return (n.role === 'combobox' ||
        ((0, signature_ts_1.px)(n.style.borderWidth) > 0 && (0, signature_ts_1.kids)(n, ctx).some(function (c) { return c.style.position === 'absolute'; })));
}
