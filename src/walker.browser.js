// Runs inside the page. Plain JS on purpose: a transpiled bundle (tsx/esbuild)
// injects a `__name` helper that does not exist in the browser context.
// Keep this file dependency-free and CommonJS-free.
function walkPage(styleProps) {
  var nodes = []
  var colorAgg = {}
  var fontAgg = {}
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
    var out = ''
    var at = 0
    var seenText = false
    for (var i = 0; i < el.childNodes.length; i++) {
      var n = el.childNodes[i]
      if (n.nodeType === 3) {
        if ((n.nodeValue || '').trim().length && !seenText) seenText = true
        out += n.nodeValue || ''
      } else if (n.nodeType === 1 && !seenText) {
        at++
      }
    }
    var t = out.replace(/\s+/g, ' ').trim()
    return { text: t.length ? t : null, at: seenText ? at : -1 }
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
    var style = {}
    for (var i = 0; i < styleProps.length; i++) style[styleProps[i]] = cs[styleProps[i]] || ''

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
      text: ownText,
      textAt: own.at,
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

  return { nodes: nodes, rootId: rootId, colors: colors, fonts: fonts }
}
