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
exports.reconcile = reconcile;
exports.propNames = propNames;
exports.componentExists = componentExists;
var index_generated_ts_1 = require("../registry/shadcn/index.generated.ts");
/**
 * Props that exist on every component but are the emitter's business, not the
 * classifier's. `props` is the rest-spread: writing it would be meaningless.
 */
var INTERNAL = new Set(['className', 'props', 'children', 'ref', 'key', 'style', 'asChild']);
/**
 * Runtime state the classifier observes but shadcn does not expose as an enum.
 * A switch's position is not a `variant` — Radix styles it through
 * `data-checked` — so the emitter has to render it as an uncontrolled initial
 * value. Kept here, next to the enum validation, so the one place that decides
 * what is writable stays one place.
 */
var STATE_PROPS = {
    checked: 'defaultChecked',
};
function reconcile(component, proposed) {
    var entry = index_generated_ts_1.SHADCN[component];
    var attrs = {};
    var state = {};
    var dropped = [];
    var _loop_1 = function (prop, value) {
        if (!entry) {
            dropped.push("".concat(component, ".").concat(prop, "=").concat(value, " \u2014 component not in registry"));
            return "continue";
        }
        if (INTERNAL.has(prop)) {
            dropped.push("".concat(component, ".").concat(prop, " \u2014 emitter-owned prop"));
            return "continue";
        }
        var target = STATE_PROPS[prop];
        if (target) {
            // Writing it on a component that is not a control would be a lie: only a
            // source that styles on `data-checked` can honour it.
            if (!entry.stateful) {
                dropped.push("".concat(component, ".").concat(target, "=").concat(value, " \u2014 component is not stateful"));
                return "continue";
            }
            // Only write state that differs from the component's resting value.
            if (value === 'unchecked' || value === '')
                return "continue";
            state[target] = value === 'checked' ? 'true' : value;
            return "continue";
        }
        var axis = entry.variants.find(function (v) { return v.prop === prop; });
        if (axis) {
            if (!axis.options.includes(value)) {
                dropped.push("".concat(component, ".").concat(prop, "=").concat(value, " \u2014 not in [").concat(axis.options.join('|'), "]"));
                return "continue";
            }
            if (axis.default === value)
                return "continue";
            attrs[prop] = value;
            return "continue";
        }
        // Not an enum. The component destructures it, so it is a real prop with a
        // domain this tool cannot enumerate (Radix's `orientation`, a numeric
        // `value`). Passing it through is faithful; guessing an enum for it is not.
        if (entry.props.includes(prop)) {
            attrs[prop] = value;
            return "continue";
        }
        dropped.push("".concat(component, ".").concat(prop, "=").concat(value, " \u2014 no such prop"));
    };
    for (var _i = 0, _a = Object.entries(proposed); _i < _a.length; _i++) {
        var _b = _a[_i], prop = _b[0], value = _b[1];
        _loop_1(prop, value);
    }
    return { attrs: attrs, state: state, dropped: dropped };
}
/** Every prop name the component accepts, for the emitter's sanity checks. */
function propNames(component) {
    var entry = index_generated_ts_1.SHADCN[component];
    if (!entry)
        return [];
    return __spreadArray([], new Set(__spreadArray(__spreadArray([], entry.props, true), entry.variants.map(function (v) { return v.prop; }), true)), true).sort();
}
function componentExists(name) {
    return name in index_generated_ts_1.SHADCN;
}
