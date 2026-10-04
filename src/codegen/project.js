"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
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
exports.TEMPLATE = void 0;
exports.scaffoldProject = scaffoldProject;
exports.templateExists = templateExists;
var promises_1 = require("node:fs/promises");
var node_fs_1 = require("node:fs");
var node_path_1 = require("node:path");
var node_url_1 = require("node:url");
var emit_ts_1 = require("./emit.ts");
var fonts_ts_1 = require("./fonts.ts");
var theme_ts_1 = require("./theme.ts");
var HERE = (0, node_path_1.dirname)((0, node_url_1.fileURLToPath)(import.meta.url));
exports.TEMPLATE = (0, node_path_1.resolve)(HERE, '../../templates/vite-react-ts');
/**
 * Files the generated project owns. Everything else is copied from the template
 * untouched — the vendored shadcn components in particular, which are the whole
 * reason the output compiles.
 */
var TEMPLATE_SKIP = new Set(['node_modules', 'dist', '.git', 'tsconfig.app.tsbuildinfo', 'tsconfig.node.tsbuildinfo']);
function scaffoldProject(ir, classes, opts) {
    return __awaiter(this, void 0, void 0, function () {
        var out, _a, files, warnings, _i, files_1, _b, rel, contents, path, sourceHtml, fonts, title, cssPath, base;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    out = opts.out;
                    return [4 /*yield*/, (0, promises_1.rm)(out, { recursive: true, force: true })];
                case 1:
                    _c.sent();
                    return [4 /*yield*/, (0, promises_1.mkdir)(out, { recursive: true })];
                case 2:
                    _c.sent();
                    return [4 /*yield*/, (0, promises_1.cp)(exports.TEMPLATE, out, {
                            recursive: true,
                            filter: function (src) { var _a; return !TEMPLATE_SKIP.has((_a = src.split('/').pop()) !== null && _a !== void 0 ? _a : ''); },
                        })];
                case 3:
                    _c.sent();
                    _a = (0, emit_ts_1.emit)(ir, classes), files = _a.files, warnings = _a.warnings;
                    _i = 0, files_1 = files;
                    _c.label = 4;
                case 4:
                    if (!(_i < files_1.length)) return [3 /*break*/, 8];
                    _b = files_1[_i], rel = _b[0], contents = _b[1];
                    path = (0, node_path_1.join)(out, rel);
                    return [4 /*yield*/, (0, promises_1.mkdir)((0, node_path_1.dirname)(path), { recursive: true })];
                case 5:
                    _c.sent();
                    return [4 /*yield*/, (0, promises_1.writeFile)(path, contents)];
                case 6:
                    _c.sent();
                    _c.label = 7;
                case 7:
                    _i++;
                    return [3 /*break*/, 4];
                case 8: return [4 /*yield*/, (0, fonts_ts_1.readPageHtml)(opts.html)];
                case 9:
                    sourceHtml = _c.sent();
                    fonts = (0, fonts_ts_1.parseFontLinks)(sourceHtml);
                    title = opts.title || 'App';
                    return [4 /*yield*/, (0, promises_1.writeFile)((0, node_path_1.join)(out, 'index.html'), "<!doctype html>\n<html lang=\"en\"".concat(opts.dark ? ' class="dark"' : '', ">\n  <head>\n    <meta charset=\"UTF-8\" />\n    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />\n").concat((0, fonts_ts_1.fontLinksHtml)(fonts), "\n    <title>").concat(title, "</title>\n  </head>\n  <body>\n    <div id=\"root\"></div>\n    <script type=\"module\" src=\"/src/main.tsx\"></script>\n  </body>\n</html>\n"))
                        // The generated palette replaces the template's own `:root` / `.dark` blocks,
                        // so the output carries exactly one theme — the one the source was drawn in.
                    ];
                case 10:
                    _c.sent();
                    cssPath = (0, node_path_1.join)(out, 'src/index.css');
                    return [4 /*yield*/, (0, promises_1.readFile)(cssPath, 'utf8')];
                case 11:
                    base = _c.sent();
                    return [4 /*yield*/, (0, promises_1.writeFile)(cssPath, (0, theme_ts_1.applyTheme)(base, (0, theme_ts_1.themeCss)(ir, opts.dark, fonts)))];
                case 12:
                    _c.sent();
                    return [2 /*return*/, { files: __spreadArray([], files.keys(), true), warnings: warnings, fonts: fonts }];
            }
        });
    });
}
function templateExists() {
    return (0, node_fs_1.existsSync)((0, node_path_1.join)(exports.TEMPLATE, 'package.json'));
}
