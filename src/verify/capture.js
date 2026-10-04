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
exports.buildProject = buildProject;
exports.capture = capture;
var node_child_process_1 = require("node:child_process");
var node_fs_1 = require("node:fs");
var promises_1 = require("node:fs/promises");
var node_http_1 = require("node:http");
var node_path_1 = require("node:path");
var playwright_1 = require("playwright");
var project_ts_1 = require("../codegen/project.ts");
function buildProject(dir) {
    return __awaiter(this, void 0, void 0, function () {
        var _a, code, log;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, ensureModules(dir)];
                case 1:
                    _b.sent();
                    return [4 /*yield*/, run('npx', ['vite', 'build', '--logLevel', 'warn'], dir)];
                case 2:
                    _a = _b.sent(), code = _a.code, log = _a.log;
                    return [2 /*return*/, { ok: code === 0, log: log }];
            }
        });
    });
}
/**
 * The generated project's dependencies.
 *
 * A symlink to the template's install is enough and is instant, which matters
 * when the loop rebuilds five times. `npm install` is the fallback for a project
 * built somewhere the template is not — the tool is offline-first, not
 * offline-only, and a missing install is worse than a slow one.
 */
function ensureModules(dir) {
    return __awaiter(this, void 0, void 0, function () {
        var target, shared;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    target = (0, node_path_1.join)(dir, 'node_modules');
                    if ((0, node_fs_1.existsSync)(target))
                        return [2 /*return*/];
                    shared = (0, node_path_1.join)(project_ts_1.TEMPLATE, 'node_modules');
                    if (!(0, node_fs_1.existsSync)(shared)) return [3 /*break*/, 2];
                    return [4 /*yield*/, (0, promises_1.symlink)(shared, target, 'dir').catch(function () { })];
                case 1:
                    _a.sent();
                    if ((0, node_fs_1.existsSync)(target))
                        return [2 /*return*/];
                    _a.label = 2;
                case 2: return [4 /*yield*/, run('npm', ['install', '--no-audit', '--no-fund'], dir).catch(function () { })];
                case 3:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
function run(cmd, args, cwd) {
    return new Promise(function (resolve) {
        var child = (0, node_child_process_1.spawn)(cmd, args, { cwd: cwd, env: __assign(__assign({}, process.env), { CI: '1' }) });
        var log = '';
        child.stdout.on('data', function (d) { return (log += d); });
        child.stderr.on('data', function (d) { return (log += d); });
        child.on('error', function (err) { return resolve({ code: 1, log: String(err) }); });
        child.on('close', function (code) { return resolve({ code: code !== null && code !== void 0 ? code : 1, log: log }); });
    });
}
var TYPES = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.woff2': 'font/woff2',
    '.woff': 'font/woff',
    '.ico': 'image/x-icon',
};
/**
 * Serve `dist/` over HTTP.
 *
 * Not `file://`: the built bundle references `/assets/*.js` at the origin root,
 * which a file URL resolves to the filesystem root and silently renders an empty
 * page. A plain static server is a dozen lines and removes a whole class of
 * "the diff is 0 and the code is fine" confusion.
 */
function serveDist(dir) {
    return new Promise(function (resolve, reject) {
        var root = (0, node_path_1.join)(dir, 'dist');
        var server = (0, node_http_1.createServer)(function (req, res) {
            var _a, _b;
            var rel = (0, node_path_1.normalize)(decodeURIComponent(((_a = req.url) !== null && _a !== void 0 ? _a : '/').split('?')[0])).replace(/^(\.\.[/\\])+/, '');
            var file = (0, node_path_1.join)(root, rel === '/' || rel === '\\' ? 'index.html' : rel);
            if (!file.startsWith(root) || !(0, node_fs_1.existsSync)(file)) {
                res.writeHead(404).end('not found');
                return;
            }
            res.writeHead(200, { 'content-type': (_b = TYPES[(0, node_path_1.extname)(file)]) !== null && _b !== void 0 ? _b : 'application/octet-stream' });
            (0, node_fs_1.createReadStream)(file).pipe(res);
        });
        server.on('error', reject);
        server.listen(0, '127.0.0.1', function () {
            var address = server.address();
            if (!address || typeof address === 'string')
                reject(new Error('no port'));
            else
                resolve({ server: server, url: "http://127.0.0.1:".concat(address.port) });
        });
    });
}
/**
 * Load the built page and read back where every emitted node landed.
 *
 * The `[data-stitch-id]` attributes the emitter writes are the whole reason this
 * works: they turn the render into something comparable to the IR rather than
 * two pictures, which is what makes a region score locatable in the source.
 */
function capture(dir, ir, families) {
    return __awaiter(this, void 0, void 0, function () {
        var _a, server, url, browser, page, boxes, found, _i, found_1, b, missingFonts, png;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, serveDist(dir)];
                case 1:
                    _a = _b.sent(), server = _a.server, url = _a.url;
                    return [4 /*yield*/, playwright_1.chromium.launch()];
                case 2:
                    browser = _b.sent();
                    _b.label = 3;
                case 3:
                    _b.trys.push([3, , 11, 13]);
                    return [4 /*yield*/, browser.newPage({
                            viewport: { width: ir.viewport.width, height: ir.viewport.height },
                            deviceScaleFactor: 1,
                        })];
                case 4:
                    page = _b.sent();
                    return [4 /*yield*/, page.goto(url, { waitUntil: 'load' })];
                case 5:
                    _b.sent();
                    return [4 /*yield*/, page.evaluate(function () { return document.fonts.ready; })
                        // The bundle mounts after `load`, so the first frame can be the empty root
                        // div. Waiting for a `[data-stitch-id]` is the page's own readiness signal.
                    ];
                case 6:
                    _b.sent();
                    // The bundle mounts after `load`, so the first frame can be the empty root
                    // div. Waiting for a `[data-stitch-id]` is the page's own readiness signal.
                    return [4 /*yield*/, page.waitForSelector('[data-stitch-id]', { timeout: 10000 }).catch(function () { })];
                case 7:
                    // The bundle mounts after `load`, so the first frame can be the empty root
                    // div. Waiting for a `[data-stitch-id]` is the page's own readiness signal.
                    _b.sent();
                    boxes = new Map();
                    return [4 /*yield*/, page.evaluate(function () {
                            var _a;
                            var out = [];
                            for (var _i = 0, _b = Array.from(document.querySelectorAll('[data-stitch-id]')); _i < _b.length; _i++) {
                                var el = _b[_i];
                                var r = el.getBoundingClientRect();
                                out.push({ id: (_a = el.getAttribute('data-stitch-id')) !== null && _a !== void 0 ? _a : '', x: r.x, y: r.y, w: r.width, h: r.height });
                            }
                            return out;
                        })];
                case 8:
                    found = _b.sent();
                    for (_i = 0, found_1 = found; _i < found_1.length; _i++) {
                        b = found_1[_i];
                        if (b.id && !boxes.has(b.id))
                            boxes.set(b.id, { x: b.x, y: b.y, w: b.w, h: b.h });
                    }
                    return [4 /*yield*/, page.evaluate(function (names) {
                            var gone = [];
                            for (var _i = 0, names_1 = names; _i < names_1.length; _i++) {
                                var n = names_1[_i];
                                if (!document.fonts.check("16px \"".concat(n, "\"")))
                                    gone.push(n);
                            }
                            return gone;
                        }, families)];
                case 9:
                    missingFonts = _b.sent();
                    return [4 /*yield*/, page.screenshot()];
                case 10:
                    png = _b.sent();
                    return [2 /*return*/, { png: Buffer.from(png), boxes: boxes, missingFonts: missingFonts }];
                case 11: return [4 /*yield*/, browser.close()];
                case 12:
                    _b.sent();
                    server.close();
                    return [7 /*endfinally*/];
                case 13: return [2 /*return*/];
            }
        });
    });
}
