"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toHex = exports.pageBackground = exports.isDarkPage = void 0;
exports.themeCss = themeCss;
exports.applyTheme = applyTheme;
var colors_ts_1 = require("./colors.ts");
var colors_ts_2 = require("./colors.ts");
Object.defineProperty(exports, "isDarkPage", { enumerable: true, get: function () { return colors_ts_2.isDark; } });
Object.defineProperty(exports, "pageBackground", { enumerable: true, get: function () { return colors_ts_2.pageBackground; } });
Object.defineProperty(exports, "toHex", { enumerable: true, get: function () { return colors_ts_2.toHex; } });
/**
 * The page's palette, written over the template's shadcn tokens.
 *
 * The template ships a grey :root and a grey .dark. Both are replaced here, and
 * only one of them survives: the output is a single theme, the one the input
 * page was drawn in. Leaving the other one in place would mean a page whose
 * colours depend on a `dark` class it may never carry.
 */
/** The template's `:root` block, which the generated palette replaces. */
var ROOT_BLOCK = /:root\s*\{[^}]*\}/;
var DARK_BLOCK = /\.dark\s*\{[^}]*\}/;
function themeCss(ir, dark, fonts) {
    var _a, _b, _c, _d;
    var background = (0, colors_ts_1.pageBackground)(ir);
    var palette = (0, colors_ts_1.assignPalette)(background, (0, colors_ts_1.colorUses)(ir, background));
    // The page's own family leads the sans stack. Everything shadcn draws that is
    // not explicitly a heading inherits it, which is most of the visible text.
    var sans = (_b = (_a = fonts.families[0]) === null || _a === void 0 ? void 0 : _a.name) !== null && _b !== void 0 ? _b : 'Geist Variable';
    var heading = (_d = (_c = fonts.families[1]) === null || _c === void 0 ? void 0 : _c.name) !== null && _d !== void 0 ? _d : sans;
    var decls = colors_ts_1.TOKENS.map(function (t) { return "    --".concat(t, ": ").concat(palette[t], ";"); }).join('\n');
    var selector = dark ? '.dark' : ':root';
    return "/* --- generated from the source page --- */\n".concat(selector, " {\n").concat(decls, "\n    --radius: 0.625rem;\n}\n\n@theme inline {\n    --font-sans: '").concat(sans, "', ui-sans-serif, system-ui, sans-serif;\n    --font-heading: '").concat(heading, "', ui-sans-serif, system-ui, sans-serif;\n}\n");
}
/**
 * Fold the generated palette into the template's stylesheet.
 *
 * Replacing the two colour blocks rather than appending is what keeps the output
 * to one theme: the template's `:root` and `.dark` are the same specificity as
 * what we write, so an appended block would lose or win by source order alone,
 * which is not a decision this tool should be making by accident.
 */
function applyTheme(css, theme) {
    var stripped = css.replace(ROOT_BLOCK, '/* replaced by the generated palette */').replace(DARK_BLOCK, '');
    return "".concat(stripped, "\n").concat(theme);
}
