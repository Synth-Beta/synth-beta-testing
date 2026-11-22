// Colour facts from a live web page, for `color.py measure --dom`. Evaluate this whole file in the page (devtools
// console, or any agent tool that runs JavaScript in a tab) and save the string it returns as a .json file.
// To judge one component instead of the whole page (a widget inside a demo, one section), first run
//   window.COLOR_ROOT = "<css selector>"
// It returns:
//   texts    every visible text style: its painted colour (element and ancestor opacity applied), the opaque colour
//            behind it, size, weight, a sample and a count. Gradient-clipped text lists its gradient stops; text over
//            an image or gradient is marked overImage (judge it from a screenshot). Input placeholders are included.
//   controls buttons, inputs, switches and chips: their own fill and border against the colour around them, for the
//            30 Lc floor on control boundaries
//   areas    background colours by share of the root's visible box (48 x 30 points); "gradient" and "image" separate
//   paints   every colour painted inside the root, with what paints it (text, background, border, gradient, shadow...)
//   rootBox  the root's visible box as fractions of the viewport, so `measure` can crop the screenshot to match
(() => {
  const root = (window.COLOR_ROOT && document.querySelector(window.COLOR_ROOT)) || document.body;
  const cvs = document.createElement("canvas");
  cvs.width = cvs.height = 1;
  const ctx = cvs.getContext("2d", { willReadFrequently: true });
  // Draw the colour and read the pixel back: resolves oklch(), color-mix(), named colours etc. to sRGB.
  const rgba = (css) => {
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "rgba(0,0,0,0)";
    ctx.fillStyle = css;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2], +(d[3] / 255).toFixed(3)];
  };
  const hex = (c) => "#" + c.slice(0, 3).map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase();
  const over = (top, under) => [0, 1, 2].map((i) => Math.round(top[i] * top[3] + under[i] * (1 - top[3]))).concat(1);
  const htmlBg = rgba(getComputedStyle(document.documentElement).backgroundColor);
  const bodyBg = rgba(getComputedStyle(document.body).backgroundColor);
  const canvasBg = htmlBg[3] > 0.99 ? htmlBg : bodyBg[3] > 0.99 ? bodyBg : [255, 255, 255, 1];
  const stops = (img) => (img.match(/(rgba?|oklch|oklab|lab|lch|hsla?|color)\([^()]*\)|#[0-9a-f]{3,8}\b/gi) || []).map(rgba);
  const clipsText = (s) => s.backgroundClip === "text" || s.webkitBackgroundClip === "text";

  const opacityOf = (el) => {
    let o = 1;
    for (let e = el; e; e = e.parentElement) o *= +getComputedStyle(e).opacity;
    return o;
  };
  // The opaque colour painted behind `el` (translucent layers composited); `image` when a photo or gradient is in the way.
  const behind = (el, skipSelf) => {
    const layers = [];
    let image = false;
    for (let e = skipSelf ? el.parentElement : el; e; e = e.parentElement) {
      const s = getComputedStyle(e);
      if (s.backgroundImage && s.backgroundImage !== "none" && !clipsText(s)) image = true;
      const c = rgba(s.backgroundColor);
      if (c[3] > 0) {
        layers.push(c);
        if (c[3] >= 0.99) break;
      }
    }
    let base = layers.length && layers[layers.length - 1][3] >= 0.99 ? layers.pop() : canvasBg;
    for (let i = layers.length - 1; i >= 0; i--) base = over(layers[i], base);
    return { bg: base, image };
  };

  const texts = new Map();
  const addText = (el, colour, t, tag) => {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    let clipEl = null;
    for (let e = el; e && e !== root.parentElement; e = e.parentElement) if (clipsText(getComputedStyle(e))) { clipEl = e; break; }
    const { bg, image } = behind(clipEl || el, !!clipEl);
    let fg = rgba(colour);
    fg[3] *= opacityOf(el);
    if (fg[3] < 1) fg = over(fg, bg);
    const gradient = clipEl ? stops(getComputedStyle(clipEl).backgroundImage).map(hex) : null;
    const key = [hex(fg), hex(bg), s.fontSize, s.fontWeight, image, tag, gradient].join("|");
    const k = el.offsetWidth ? r.width / el.offsetWidth : 1;
    const row = texts.get(key) || {
      text: gradient ? gradient[0] : hex(fg), bg: hex(bg), size: +(parseFloat(s.fontSize) * (k > 0.2 && k < 5 ? k : 1)).toFixed(1), weight: +s.fontWeight || 400,
      overImage: image, gradient, count: 0, sample: t.slice(0, 40), tag, inView: r.top < innerHeight && r.bottom > 0,
    };
    row.count++;
    texts.set(key, row);
  };
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n; (n = walker.nextNode()); ) {
    const t = n.textContent.replace(/\s+/g, " ").trim();
    const el = n.parentElement;
    if (!t || !el) continue;
    const s = getComputedStyle(el);
    if (s.visibility !== "visible" || s.display === "none" || opacityOf(el) === 0) continue;
    addText(el, s.color, t, el.tagName.toLowerCase());
  }
  for (const el of root.querySelectorAll("input[placeholder], textarea[placeholder]")) {
    if (!el.placeholder || el.value) continue;
    addText(el, getComputedStyle(el, "::placeholder").color, el.placeholder, "placeholder");
  }

  const controls = [];
  // Controls whose shape alone says what they are (a text label identifies the rest): switches, checkboxes, radios,
  // sliders, fields, and icon-only buttons. Their boundary (fill, border or a ::before/::after track) needs Lc 30.
  const ctlSel = "input:not([type=hidden]):not([type=submit]):not([type=button]), select, textarea, [role=switch], [role=checkbox], [role=radio], [role=slider], button, [role=button]";
  const paintOf = (st) => {
    const grad = st.backgroundImage && st.backgroundImage !== "none" ? stops(st.backgroundImage) : [];
    return grad.length ? grad[0] : rgba(st.backgroundColor);
  };
  for (const el of root.querySelectorAll(ctlSel)) {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (s.display === "none" || s.visibility === "hidden" || r.width < 4 || r.height < 4) continue;
    const label = (el.innerText || "").trim();
    const isButton = /^(button)$/i.test(el.tagName) || el.getAttribute("role") === "button";
    if (isButton && /[\p{L}\p{N}]/u.test(label)) continue;
    const parent = behind(el, true).bg;
    const parts = [paintOf(s), ...["::before", "::after"].map((p) => getComputedStyle(el, p)).filter((p) => p.content !== "none").map(paintOf)];
    const area = r.width * r.height, base = opacityOf(el) || 1;
    for (const ch of el.querySelectorAll("*")) {
      const cr = ch.getBoundingClientRect();
      if (cr.width * cr.height < 0.3 * area) continue;
      const c = paintOf(getComputedStyle(ch));
      c[3] *= opacityOf(ch) / base;
      parts.push(c);
    }
    const bw = parseFloat(s.borderTopWidth);
    const border = bw > 0 && s.borderTopStyle !== "none" ? rgba(s.borderTopColor) : null;
    const row = { tag: el.getAttribute("role") || el.type || el.tagName.toLowerCase(), sample: (label || el.value || el.placeholder || el.getAttribute("aria-label") || "").slice(0, 30),
                  parent: hex(parent), checked: el.checked ?? (el.getAttribute("aria-checked") === "true") };
    const fills = parts.filter((c) => c[3] > 0.05).map((c) => hex(over(c, parent)));
    if (fills.length) { row.fill = fills[0]; if (fills.length > 1) row.parts = fills.slice(1); }
    if (border && border[3] > 0.05) row.border = hex(over(border, parent));
    if (row.fill || row.border) controls.push(row);
  }

  const box = root === document.body ? { left: 0, top: 0, width: innerWidth, height: innerHeight } : root.getBoundingClientRect();
  const x0 = Math.max(0, box.left), y0 = Math.max(0, box.top);
  const w = Math.min(innerWidth, box.left + box.width) - x0, h = Math.min(innerHeight, box.top + box.height) - y0;
  const areas = new Map();
  const N = 48, M = 30;
  for (let i = 0; i < N && w > 0 && h > 0; i++)
    for (let j = 0; j < M; j++) {
      let hit = null;
      for (const e of document.elementsFromPoint(x0 + (i + 0.5) * w / N, y0 + (j + 0.5) * h / M)) {
        if (["img", "video", "canvas", "picture", "iframe"].includes(e.tagName.toLowerCase())) { hit = "image"; break; }
        const s = getComputedStyle(e);
        if (s.backgroundImage && s.backgroundImage !== "none" && !clipsText(s)) { hit = /gradient/.test(s.backgroundImage) ? "gradient" : "image"; break; }
        const c = rgba(s.backgroundColor);
        if (c[3] >= 0.99) { hit = hex(c); break; }
      }
      hit = hit || hex(canvasBg);
      areas.set(hit, (areas.get(hit) || 0) + 1);
    }
  const samples = [...areas.values()].reduce((a, b) => a + b, 0) || 1;

  const paints = new Map();
  const add = (c, what) => {
    if (!c || c[3] < 0.05) return;
    const k = hex(c) + (c[3] < 0.99 ? "/" + c[3] : "");
    const e = paints.get(k) || { color: k, uses: {} };
    e.uses[what] = (e.uses[what] || 0) + 1;
    paints.set(k, e);
  };
  for (const el of [root, ...root.querySelectorAll("*")]) {
    const s = getComputedStyle(el);
    if (s.display === "none" || s.visibility === "hidden") continue;
    add(rgba(s.backgroundColor), "background");
    if (s.backgroundImage && s.backgroundImage !== "none") for (const c of stops(s.backgroundImage)) add(c, clipsText(s) ? "text" : "gradient");
    if (parseFloat(s.borderTopWidth) > 0 && s.borderTopStyle !== "none") add(rgba(s.borderTopColor), "border");
    if (s.boxShadow && s.boxShadow !== "none") for (const c of stops(s.boxShadow)) add(c, "shadow");
    if (el.closest("svg")) {
      if (s.fill && !s.fill.startsWith("url")) add(rgba(s.fill), "fill");
      if (s.stroke && s.stroke !== "none" && !s.stroke.startsWith("url")) add(rgba(s.stroke), "stroke");
    }
    if ([...el.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim()) && !clipsText(s)) add(rgba(s.color), "text");
  }

  const f = (v, d) => +Math.min(1, Math.max(0, v / d)).toFixed(4);
  return JSON.stringify({
    url: location.href,
    root: window.COLOR_ROOT || null,
    rootBox: root === document.body ? null : [f(x0, innerWidth), f(y0, innerHeight), f(x0 + w, innerWidth), f(y0 + h, innerHeight)],
    viewport: [innerWidth, innerHeight],
    dpr: devicePixelRatio,
    texts: [...texts.values()].sort((a, b) => b.count - a.count).slice(0, 120),
    controls: controls.slice(0, 60),
    areas: [...areas].map(([color, n]) => ({ color, share: +((100 * n) / samples).toFixed(1) })).sort((a, b) => b.share - a.share),
    paints: [...paints.values()]
      .sort((a, b) => Object.values(b.uses).reduce((x, y) => x + y) - Object.values(a.uses).reduce((x, y) => x + y))
      .slice(0, 150),
  });
})();
