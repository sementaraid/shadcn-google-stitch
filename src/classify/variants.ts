import { SHADCN } from '../registry/shadcn/index.generated.ts'

/**
 * Reconcile classifier output with the props shadcn actually ships.
 *
 * The signatures propose variants from what they see on the page; this is the
 * only place allowed to decide whether a proposal is expressible. It exists
 * because a wrong guess is not a style difference — `<Card variant="outline">`
 * does not compile, since this Card has `size` and no `variant` at all.
 *
 * Two rules, both from the vendored source:
 *   - an enum prop must take a value from its own union
 *   - a non-enum prop passes through if the component destructures it
 * Anything else is dropped. Emitting a value equal to the component's own
 * default is dropped too: React applies it anyway, and writing it out is noise.
 */
export interface ReconcileResult {
  /** Enum props safe to write as JSX, defaults omitted. */
  attrs: Record<string, string>
  /** Observed runtime state (checked/…), mapped to the prop that expresses it. */
  state: Record<string, string>
  /** Non-state proposals rejected, for the report. */
  dropped: string[]
}

/**
 * Props that exist on every component but are the emitter's business, not the
 * classifier's. `props` is the rest-spread: writing it would be meaningless.
 */
const INTERNAL = new Set(['className', 'props', 'children', 'ref', 'key', 'style', 'asChild'])

/**
 * Runtime state the classifier observes but shadcn does not expose as an enum.
 * A switch's position is not a `variant` — Radix styles it through
 * `data-checked` — so the emitter has to render it as an uncontrolled initial
 * value. Kept here, next to the enum validation, so the one place that decides
 * what is writable stays one place.
 */
const STATE_PROPS: Record<string, string> = {
  checked: 'defaultChecked',
}

export function reconcile(component: string, proposed: Record<string, string>): ReconcileResult {
  const entry = SHADCN[component]
  const attrs: Record<string, string> = {}
  const state: Record<string, string> = {}
  const dropped: string[] = []

  for (const [prop, value] of Object.entries(proposed)) {
    if (!entry) {
      dropped.push(`${component}.${prop}=${value} — component not in registry`)
      continue
    }
    if (INTERNAL.has(prop)) {
      dropped.push(`${component}.${prop} — emitter-owned prop`)
      continue
    }

    const target = STATE_PROPS[prop]
    if (target) {
      // Writing it on a component that is not a control would be a lie: only a
      // source that styles on `data-checked` can honour it.
      if (!entry.stateful) {
        dropped.push(`${component}.${target}=${value} — component is not stateful`)
        continue
      }
      // Only write state that differs from the component's resting value.
      if (value === 'unchecked' || value === '') continue
      state[target] = value === 'checked' ? 'true' : value
      continue
    }

    const axis = entry.variants.find((v) => v.prop === prop)

    if (axis) {
      if (!axis.options.includes(value)) {
        dropped.push(`${component}.${prop}=${value} — not in [${axis.options.join('|')}]`)
        continue
      }
      if (axis.default === value) continue
      attrs[prop] = value
      continue
    }

    // Not an enum. The component destructures it, so it is a real prop with a
    // domain this tool cannot enumerate (Radix's `orientation`, a numeric
    // `value`). Passing it through is faithful; guessing an enum for it is not.
    if (entry.props.includes(prop)) {
      attrs[prop] = value
      continue
    }

    dropped.push(`${component}.${prop}=${value} — no such prop`)
  }

  return { attrs, state, dropped }
}

/** Every prop name the component accepts, for the emitter's sanity checks. */
export function propNames(component: string): string[] {
  const entry = SHADCN[component]
  if (!entry) return []
  return [...new Set([...entry.props, ...entry.variants.map((v) => v.prop)])].sort()
}

export function componentExists(name: string): boolean {
  return name in SHADCN
}
