// Runs inside the page. Plain JS on purpose: a transpiled bundle (tsx/esbuild)
// injects a `__name` helper that does not exist in the browser context.
// Keep this file dependency-free and CommonJS-free.
/**
 * `background-color` -> `backgroundColor`. The IR's style record is read as
 * `style.backgroundColor` everywhere downstream, so names are camelCased once
 * here rather than at every read site. Custom properties (`--x`) are left alone.
 */
function camelize(p) {
  if (p.charCodeAt(0) === 45 && p.charCodeAt(1) === 45) return p
  return p.replace(/-([a-z])/g, function (_, c) {
    return c.toUpperCase()
  })
}

function walkPage(styleProps, alwaysKeep) {
  // The CSS initial value per property, read once from a detached element. This
  // is the baseline that makes "uses this property" meaningful: every element
  // reports a computed value for all ~1300 properties, and `display: block` on a
  // div says nothing, while `display: flex` says everything.
  var INITIAL = (function () {
    var el = document.createElement('div')
    var cs = getComputedStyle(el)
    var out = {}
    for (var i = 0; i < styleProps.length; i++) out[styleProps[i]] = cs.getPropertyValue(styleProps[i])
    return out
  })()
  // A small core set is recorded even when it sits at its initial value, because
  // a consumer reading `padding` wants the resolved `0px`, not a missing key.
  // Everything else is kept only when it differs from initial.
  var KEEP = {}
  for (var i = 0; i < alwaysKeep.length; i++) KEEP[camelize(alwaysKeep[i])] = true

  var nodes = []
  var colorAgg = {}
  var fontAgg = {}
  // Per node, the computed-style properties that actually vary from the CSS
  // initial value. A fixed list is always wrong by omission: it cannot hold
  // `top`/`right`, per-side `border-*-width`, `max-width` or `white-space`, and
  // a node whose position depends on one of those renders in the wrong place
  // with nothing in the IR to explain why. Keeping every non-initial property
  // means the record is a superset of the true style, and any consumer (emitter,
  // diff, patch) can ask for what it needs. `style` stays keyed the same way, so
  // `style.top` is read exactly like `style.display`.
  var csCache = []
  var csIndex = {}
  var declaredAgg = {}
  function usedComputedStyle(cs) {
    var out = {}
    // The core set is read *by name* first. `CSSStyleDeclaration`'s indexed
    // iteration lists longhands only, so every shorthand — `padding`, `margin`,
    // `border-radius`, `border-width`, `gap`, `overflow`, `background` — is
    // simply absent from it, however it is spelled. Asking for the shorthand by
    // name is the only way to see its serialized value.
    for (var k = 0; k < alwaysKeep.length; k++) {
      var name = alwaysKeep[k]
      var cv = cs.getPropertyValue(name)
      if (cv === '') continue
      out[camelize(name)] = cv
      declaredAgg[name] = (declaredAgg[name] || 0) + 1
    }
    // Then every other property whose value is not its initial one.
    for (var i = 0; i < cs.length; i++) {
      var p = cs[i]
      if (KEEP[camelize(p)]) continue
      var v = cs.getPropertyValue(p)
      if (v === '' || v === INITIAL[p]) continue
      out[camelize(p)] = v
      declaredAgg[p] = (declaredAgg[p] || 0) + 1
    }
    return out
  }
  var opaque = { svg: 1, canvas: 1, img: 1, video: 1, picture: 1, iframe: 1 }
  var TRANSPARENT = { 'rgba(0, 0, 0, 0)': 1, transparent: 1 }

  var counter = 0
  function nextId() {
    counter++
    return 'n' + String(counter).padStart(4, '0')
  }

  function cssPath(el) {
    var parts = []
    var cur = el
    while (cur && cur.nodeType === 1 && parts.length < 12) {
      var sel = cur.tagName.toLowerCase()
      var parent = cur.parentElement
      if (parent) {
        var sibs = []
        for (var i = 0; i < parent.children.length; i++) {
          if (parent.children[i].tagName === cur.tagName) sibs.push(parent.children[i])
        }
        if (sibs.length > 1) sel += ':nth-of-type(' + (sibs.indexOf(cur) + 1) + ')'
      }
      parts.unshift(sel)
      cur = parent
    }
    return parts.join(' > ')
  }

  function directText(el) {
    // Only text this element owns. Nested text belongs to child nodes, and
    // duplicating it here would make every ancestor look like a text node.
    // The index of the element child the text precedes is returned too: the IR
    // keeps text and children in separate lists, and without it `<svg/>Label`
    // and `Label<svg/>` emit the same JSX.
    //
    // `runs` keeps one entry per gap *between* element children (length =
    // elementChildren + 1). The flattened `text` above cannot say where a span
    // sat inside a sentence — `a <b>c</b> d` and `a c d <b>…</b>` collapse to
    // the same string — so the emitter needs the gaps to put each back.
    var out = ''
    var buf = ''
    var runs = []
    var at = 0
    var seenText = false
    for (var i = 0; i < el.childNodes.length; i++) {
      var n = el.childNodes[i]
      if (n.nodeType === 3) {
        if ((n.nodeValue || '').trim().length && !seenText) seenText = true
        out += n.nodeValue || ''
        buf += n.nodeValue || ''
      } else if (n.nodeType === 1) {
        runs.push(buf)
        buf = ''
        if (!seenText) at++
      }
    }
    runs.push(buf)
    var t = out.replace(/\s+/g, ' ').trim()
    var norm = function (r) { return r.replace(/\s+/g, ' ').trim() }
    return { text: t.length ? t : null, at: seenText ? at : -1, runs: runs.map(norm) }
  }

  function classify(el, tag, cs, rect, ownText, childCount, opaqueLeaf) {
    if (opaqueLeaf) return tag === 'img' || tag === 'picture' ? 'image' : 'illustration'

    if (tag === 'svg') {
      // Gate before the ladder: only a 24x24 viewBox drawn with strokes reads as
      // a Lucide candidate. A brand mark or illustration is emitted verbatim
      // instead of being forced into an icon slot.
      var viewBox = el.getAttribute('viewBox') || ''
      var lucideShaped =
        viewBox === '0 0 24 24' && cs.fill === 'none' && cs.stroke !== 'none'
      return lucideShaped ? 'icon' : 'illustration'
    }

    if (cs.backgroundImage && cs.backgroundImage !== 'none' && childCount === 0) return 'image'
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || tag === 'button') return 'control'
    if (ownText && childCount === 0 && rect.height <= 80) return 'text'
    return 'container'
  }

  function visit(el, parentId, depth) {
    var cs = getComputedStyle(el)
    var rect = el.getBoundingClientRect()
    var style = usedComputedStyle(cs)

    var id = nextId()
    var childEls = el.children
    var tag = el.tagName.toLowerCase()
    var own = directText(el)
    var ownText = own.text
    var opaqueLeaf = !!opaque[tag] && childEls.length === 0
    var kind = classify(el, tag, cs, rect, ownText, childEls.length, opaqueLeaf)

    // Shape of an icon, kept so the Lucide ladder can match it later. Attributes
    // are captured raw; the normalizer runs in Node so page and registry hash
    // through the exact same code path.
    var iconShape = null
    if (tag === 'svg') {
      iconShape = { viewBox: el.getAttribute('viewBox'), className: el.getAttribute('class'), children: [] }
      for (var s = 0; s < el.children.length; s++) {
        var kid = el.children[s]
        var attrs = {}
        for (var a = 0; a < kid.attributes.length; a++) {
          attrs[kid.attributes[a].name] = kid.attributes[a].value
        }
        iconShape.children.push([kid.tagName.toLowerCase(), attrs])
      }
    }

    var raw = {
      id: id,
      path: cssPath(el),
      tag: tag,
      classList: Array.prototype.slice.call(el.classList, 0),
      role: el.getAttribute('role'),
      ariaLabel: el.getAttribute('aria-label'),
      placeholder: el.getAttribute('placeholder'),
      // An `<a>` emitted without its `href` is inert — the source anchor's link
      // target is part of what the element *is*, and no style can put it back.
      href: el.getAttribute('href'),
      text: ownText,
      textAt: own.at,
      textRuns: own.runs,
      box: {
        x: Math.round(rect.x * 100) / 100,
        y: Math.round(rect.y * 100) / 100,
        w: Math.round(rect.width * 100) / 100,
        h: Math.round(rect.height * 100) / 100,
      },
      style: style,
      children: [],
      parent: parentId,
      depth: depth,
      visible:
        rect.width > 0 &&
        rect.height > 0 &&
        cs.visibility !== 'hidden' &&
        cs.display !== 'none' &&
        Number(cs.opacity) > 0,
      kind: kind,
      isLeafOpaque: opaqueLeaf,
      iconShape: iconShape,
    }

    nodes.push(raw)

    if (raw.visible) {
      var area = rect.width * rect.height
      // backgroundColor, not the `background` shorthand: that one comes back as
      // "rgb(255, 255, 255) none repeat scroll 0% 0% / auto padding-box border-box"
      // and would never match a plain color comparison.
      var bg = cs.backgroundColor
      if (bg && !TRANSPARENT[bg]) {
        var agg = colorAgg[bg] || { count: 0, area: 0 }
        agg.count++
        agg.area += area
        colorAgg[bg] = agg
      }
      // Count text color only where the element actually paints text. Color is
      // inherited, so crediting every node's full box to its inherited color
      // lets a parent outrank the leaves that really use it.
      if (ownText) {
        var fg = cs.color
        if (fg && !TRANSPARENT[fg]) {
          var fga = colorAgg[fg] || { count: 0, area: 0 }
          fga.count++
          fga.area += area
          colorAgg[fg] = fga
        }
      }
    }

    if (raw.visible && ownText) {
      var family = cs.fontFamily.split(',')[0].trim().replace(/^["']|["']$/g, '')
      var weight = Number(cs.fontWeight) || 400
      var size = parseFloat(cs.fontSize) || 16
      if (family) {
        var f = fontAgg[family] || { weights: {}, count: 0, heading: false }
        f.weights[weight] = 1
        f.count += ownText.length
        if (size >= 24 && weight >= 600) f.heading = true
        fontAgg[family] = f
      }
    }

    for (var k = 0; k < childEls.length; k++) {
      raw.children.push(visit(childEls[k], id, depth + 1))
    }
    return id
  }

  function findRoot() {

    var body = document.body
    var visible = []
    for (var i = 0; i < body.children.length; i++) {
      var r = body.children[i].getBoundingClientRect()
      if (r.width > 0 && r.height > 0) visible.push(body.children[i])
    }
    return visible.length === 1 ? visible[0] : body
  }

  var rootId = visit(findRoot(), null, 0)

  var colors = Object.keys(colorAgg).map(function (value) {
    return { value: value, count: colorAgg[value].count, area: Math.round(colorAgg[value].area) }
  })
  var fonts = Object.keys(fontAgg).map(function (family) {
    var v = fontAgg[family]
    var weights = Object.keys(v.weights).map(Number)
    weights.sort(function (a, b) {
      return a - b
    })
    return { family: family, weights: weights, count: v.count, heading: v.heading }
  })

  // Sorted by how many nodes use each, so the head of the list is the page's
  // real vocabulary and the tail is one-off noise.
  var usedProps = Object.keys(declaredAgg).sort(function (a, b) {
    return declaredAgg[b] - declaredAgg[a]
  })

  return { nodes: nodes, rootId: rootId, colors: colors, fonts: fonts, usedProps: usedProps }
}
