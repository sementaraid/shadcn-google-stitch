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
Object.defineProperty(exports, "__esModule", { value: true });
exports.pngSize = pngSize;
exports.ingest = ingest;
var promises_1 = require("node:fs/promises");
var pngjs_1 = require("pngjs");
var playwright_1 = require("playwright");
function pngSize(buf) {
    var png = pngjs_1.PNG.sync.read(buf);
    return { width: png.width, height: png.height };
}
/**
 * Load the source HTML in Chromium clamped to the screenshot's exact dimensions,
 * freeze everything that moves, and block until fonts + images have settled.
 * Without the freeze, every later pixel-diff is noise.
 */
function ingest(htmlPath, screenshotPath, opts) {
    return __awaiter(this, void 0, void 0, function () {
        var shot, _a, width, height, browser, context, page, warnings, meta, _i, warnings_1, w;
        var _this = this;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, (0, promises_1.readFile)(screenshotPath)];
                case 1:
                    shot = _b.sent();
                    _a = pngSize(shot), width = _a.width, height = _a.height;
                    return [4 /*yield*/, playwright_1.chromium.launch()];
                case 2:
                    browser = _b.sent();
                    return [4 /*yield*/, browser.newContext({
                            viewport: { width: width, height: height },
                            deviceScaleFactor: opts.deviceScaleFactor,
                        })];
                case 3:
                    context = _b.sent();
                    return [4 /*yield*/, context.newPage()];
                case 4:
                    page = _b.sent();
                    warnings = [];
                    page.on('console', function (m) {
                        if (m.type() === 'error')
                            warnings.push(m.text());
                    });
                    return [4 /*yield*/, page.goto(new URL("file://".concat(htmlPath)).href, { waitUntil: 'load' })
                        // Freeze. `animation-play-state` alone misses transitions already in flight.
                    ];
                case 5:
                    _b.sent();
                    // Freeze. `animation-play-state` alone misses transitions already in flight.
                    return [4 /*yield*/, page.addStyleTag({
                            content: "*, *::before, *::after {\n      transition: none !important;\n      animation: none !important;\n      animation-play-state: paused !important;\n      caret-color: transparent !important;\n    }\n    html { scroll-behavior: auto !important; }",
                        })];
                case 6:
                    // Freeze. `animation-play-state` alone misses transitions already in flight.
                    _b.sent();
                    return [4 /*yield*/, page.evaluate(function () { return __awaiter(_this, void 0, void 0, function () {
                            var step, y;
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0:
                                        step = window.innerHeight;
                                        y = 0;
                                        _a.label = 1;
                                    case 1:
                                        if (!(y < document.body.scrollHeight)) return [3 /*break*/, 4];
                                        window.scrollTo(0, y);
                                        return [4 /*yield*/, new Promise(function (r) { return requestAnimationFrame(function () { return r(null); }); })];
                                    case 2:
                                        _a.sent();
                                        _a.label = 3;
                                    case 3:
                                        y += step;
                                        return [3 /*break*/, 1];
                                    case 4:
                                        window.scrollTo(0, 0);
                                        return [2 /*return*/];
                                }
                            });
                        }); })];
                case 7:
                    _b.sent();
                    return [4 /*yield*/, page.evaluate(function () { return __awaiter(_this, void 0, void 0, function () {
                            var imgs;
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0: return [4 /*yield*/, document.fonts.ready];
                                    case 1:
                                        _a.sent();
                                        imgs = Array.from(document.images);
                                        return [4 /*yield*/, Promise.all(imgs.map(function (img) {
                                                return img.complete
                                                    ? Promise.resolve()
                                                    : new Promise(function (res) {
                                                        img.addEventListener('load', function () { return res(); }, { once: true });
                                                        img.addEventListener('error', function () { return res(); }, { once: true });
                                                    });
                                            }))];
                                    case 2:
                                        _a.sent();
                                        return [4 /*yield*/, new Promise(function (r) { return requestAnimationFrame(function () { return requestAnimationFrame(function () { return r(null); }); }); })];
                                    case 3:
                                        _a.sent();
                                        return [2 /*return*/];
                                }
                            });
                        }); })];
                case 8:
                    _b.sent();
                    return [4 /*yield*/, page.evaluate(function () {
                            var families = new Set();
                            for (var _i = 0, _a = Array.from(document.querySelectorAll('*')); _i < _a.length; _i++) {
                                var el = _a[_i];
                                var f = getComputedStyle(el).fontFamily;
                                if (f)
                                    families.add(f);
                            }
                            var substituted = [];
                            for (var _b = 0, families_1 = families; _b < families_1.length; _b++) {
                                var f = families_1[_b];
                                var first = f.split(',')[0].trim().replace(/^["']|["']$/g, '');
                                if (!first)
                                    continue;
                                if (!document.fonts.check("16px \"".concat(first, "\"")))
                                    substituted.push(first);
                            }
                            return {
                                title: document.title,
                                docHeight: Math.max(document.body.scrollHeight, document.documentElement.scrollHeight),
                                fontSubstituted: substituted,
                            };
                        })];
                case 9:
                    meta = _b.sent();
                    if (meta.docHeight > height + 4) {
                        warnings.push("document is ".concat(meta.docHeight, "px tall but screenshot is ").concat(height, "px \u2014 IR below the fold is present but unverifiable"));
                    }
                    for (_i = 0, warnings_1 = warnings; _i < warnings_1.length; _i++) {
                        w = warnings_1[_i];
                        console.error("  warn: ".concat(w));
                    }
                    return [2 /*return*/, {
                            page: page,
                            browser: browser,
                            viewport: { width: width, height: height },
                            screenshot: screenshotPath,
                            title: meta.title,
                            docHeight: meta.docHeight,
                            fontSubstituted: meta.fontSubstituted,
                            close: function () { return __awaiter(_this, void 0, void 0, function () {
                                return __generator(this, function (_a) {
                                    switch (_a.label) {
                                        case 0: return [4 /*yield*/, browser.close()];
                                        case 1:
                                            _a.sent();
                                            return [2 /*return*/];
                                    }
                                });
                            }); },
                        }];
            }
        });
    });
}
