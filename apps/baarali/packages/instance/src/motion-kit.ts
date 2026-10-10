// The motion kit (decided 09/10/2026): the moves a professional motion
// designer reaches for — typing, a pointer that clicks, a camera, mask
// reveals, counters, a light sweep — as small functions over the Web
// Animations API, so the agent composes them instead of hand-writing
// keyframes. Each creates its animations paused at absolute times, which
// HyperFrames' waapi adapter seeks frame by frame: deterministic, renderable,
// never GSAP. Shipped in every template's page (motion-templates.ts compose)
// and documented for the agent in the Motion design skill (KIT_DOC).

/** The eases; « pro » motion starts firm and lands soft. `apple` is the keynote's. */
export const EASES: Record<string, string> = {
  out: 'cubic-bezier(.16,1,.3,1)',
  in: 'cubic-bezier(.7,0,.84,0)',
  inout: 'cubic-bezier(.65,0,.35,1)',
  snap: 'cubic-bezier(.7,0,.2,1)',
  spring: 'cubic-bezier(.2,1.6,.4,1)',
  apple: 'cubic-bezier(.22,1,.36,1)',
  linear: 'linear',
};

export const KIT_CSS = `
  .kit-mask{display:inline-block;overflow:hidden;vertical-align:bottom;padding-bottom:.08em;margin-bottom:-.08em}
  .kit-mask>span{display:inline-block}
  .kit-count::before{content:attr(data-prefix)}
  .kit-count{counter-reset:kit-n var(--kit-n)}
  .kit-count::after{content:counter(kit-n) attr(data-suffix)}
  .kit-count.pad::after{content:counter(kit-n, decimal-leading-zero) attr(data-suffix)}
  .kit-caret{display:inline-block;width:.08em;height:1.05em;margin-left:.04em;vertical-align:-.15em;background:currentColor}
  .kit-typed{white-space:pre-wrap}
  .kit-cursor{position:absolute;left:0;top:0;width:4.4cqmin;height:4.4cqmin;margin:-.46cqmin 0 0 -.73cqmin;z-index:50;pointer-events:none;transform-origin:16.7% 10.4%;filter:drop-shadow(0 .3cqmin .5cqmin rgba(0,0,0,.35))}
  .kit-ripple{position:absolute;width:6cqmin;height:6cqmin;margin:-3cqmin 0 0 -3cqmin;border-radius:50%;border:.4cqmin solid currentColor;z-index:49;pointer-events:none;opacity:0}
  .kit-shine{position:absolute;inset:0;pointer-events:none;background:linear-gradient(105deg,transparent 35%,rgba(255,255,255,.5) 50%,transparent 65%);mix-blend-mode:overlay}`;

/** The page's motion runtime: hf(), hfEl() and kit.*, in plain ES5 for any page. */
export const KIT_JS = `
  var EASES = ${JSON.stringify(EASES)};
  // An element animated twice on the same property: the later animation
  // must not hold its first frame from 0 s (fill both) over the earlier one.
  // Animate one element's property in time order.
  var __kitSeen = new WeakMap();
  function hfEl(el, frames, o){
    var props = Object.keys(Object.assign({}, frames[0], frames[frames.length - 1])).filter(function(k){ return k !== 'offset' && k !== 'easing' && k !== 'composite'; });
    var had = __kitSeen.get(el) || [];
    var again = props.some(function(p){ return had.indexOf(p) >= 0; });
    __kitSeen.set(el, had.concat(props));
    var a = el.animate(frames, {duration:Math.max(1, o.d * 1000), delay:o.at * 1000, easing:EASES[o.ease || 'out'] || o.ease, fill:again ? 'forwards' : 'both', iterations:o.n || 1});
    a.pause();
    return a;
  }
  function hf(selector, frames, o){
    document.querySelectorAll(selector).forEach(function(el, i){ hfEl(el, frames, {at:o.at + (o.stagger || 0) * i, d:o.d, ease:o.ease, n:o.n}); });
  }
  var kit = (function(){
    function one(x){ return typeof x === 'string' ? document.querySelector(x) : x; }
    function all(x){ return typeof x === 'string' ? Array.prototype.slice.call(document.querySelectorAll(x)) : (x && x.length !== undefined ? Array.prototype.slice.call(x) : [x]); }
    function root(){ return document.querySelector('[data-composition-id]'); }
    try { CSS.registerProperty({name:'--kit-n', syntax:'<integer>', inherits:true, initialValue:'0'}); } catch (e) {}
    var PRESETS = {
      rise: [{opacity:0, transform:'translateY(4cqh)'}, {opacity:1, transform:'none'}],
      drop: [{opacity:0, transform:'translateY(-4cqh)'}, {opacity:1, transform:'none'}],
      left: [{opacity:0, transform:'translateX(-6cqw)'}, {opacity:1, transform:'none'}],
      right: [{opacity:0, transform:'translateX(6cqw)'}, {opacity:1, transform:'none'}],
      fade: [{opacity:0}, {opacity:1}],
      scale: [{opacity:0, transform:'scale(.86)'}, {opacity:1, transform:'none'}],
      pop: [{opacity:0, transform:'scale(.5)'}, {opacity:1, transform:'none'}],
      blur: [{opacity:0, filter:'blur(2cqmin)', transform:'scale(1.04)'}, {opacity:1, filter:'blur(0)', transform:'none'}]
    };
    // Piecewise keyframes from [t, value] keys, each leg with its own ease.
    function legs(keys, toFrame, ease){
      var t0 = keys[0][0], t1 = keys[keys.length - 1][0], span = Math.max(.001, t1 - t0);
      var frames = keys.map(function(k, i){ var f = toFrame(k); f.offset = (k[0] - t0) / span; if (i < keys.length - 1) f.easing = EASES[ease] || ease; return f; });
      return {frames:frames, at:t0, d:span};
    }
    var api = {
      /** The centre of an element in the video frame, in pixels, ignoring animations: where to put a cursor stop. */
      center: function(sel){
        var el = one(sel), r = root(), x = el.offsetWidth / 2, y = el.offsetHeight / 2;
        while (el && el !== r) { x += el.offsetLeft; y += el.offsetTop; el = el.offsetParent; }
        return [Math.round(x), Math.round(y)];
      },
      /** Entrance of one or more elements: rise, drop, left, right, fade, scale, pop, blur. */
      enter: function(sel, preset, o){
        o = o || {};
        all(sel).forEach(function(el, i){ hfEl(el, PRESETS[preset] || PRESETS.rise, {at:o.at + (o.stagger || 0) * i, d:o.d || .7, ease:o.ease || 'out'}); });
      },
      /** The same, played backwards: the element leaves. */
      exit: function(sel, preset, o){
        o = o || {};
        all(sel).forEach(function(el, i){ hfEl(el, (PRESETS[preset] || PRESETS.fade).slice().reverse(), {at:o.at + (o.stagger || 0) * i, d:o.d || .45, ease:o.ease || 'in'}); });
      },
      /** Cuts an element's text into spans, by 'words' (default) or 'letters'; returns the spans. */
      split: function(sel, by){
        var el = one(sel), text = el.textContent, spans = [];
        el.textContent = '';
        (by === 'letters' ? Array.from(text) : text.split(/(\\s+)/)).forEach(function(part){
          if (/^\\s+$/.test(part) || part === '') { el.appendChild(document.createTextNode(part)); return; }
          var s = document.createElement('span'); s.textContent = part; s.style.display = 'inline-block'; el.appendChild(s); spans.push(s);
        });
        return spans;
      },
      /** Each word (or letter) rises out of its own mask, one after another: the keynote title. */
      reveal: function(sel, o){
        o = o || {};
        var el = one(sel), text = el.textContent, i = 0;
        el.textContent = '';
        (o.by === 'letters' ? Array.from(text) : text.split(/(\\s+)/)).forEach(function(part){
          if (/^\\s+$/.test(part) || part === '') { el.appendChild(document.createTextNode(part)); return; }
          var m = document.createElement('span'); m.className = 'kit-mask';
          var s = document.createElement('span'); s.textContent = part; m.appendChild(s); el.appendChild(m);
          hfEl(s, [{transform:'translateY(110%)'}, {transform:'none'}], {at:o.at + (o.stagger === undefined ? .08 : o.stagger) * i++, d:o.d || .8, ease:o.ease || 'apple'});
        });
      },
      /** Types the text into the element, a character at a time, with a caret; returns when it ends. */
      type: function(sel, text, o){
        o = o || {};
        var box = one(sel), cps = o.cps || 18, at = o.at;
        // One inline run inside the box: in a flex box each letter would be its own item, spaces lost.
        var el = document.createElement('span'); el.className = 'kit-typed';
        box.textContent = ''; box.appendChild(el);
        Array.from(text).forEach(function(ch, i){
          var s = document.createElement('span'); s.textContent = ch; s.style.display = 'none'; el.appendChild(s);
          hfEl(s, [{display:'none'}, {display:'inline'}], {at:at + i / cps, d:.001, ease:'linear'});
        });
        var end = at + text.length / cps;
        if (o.caret !== false) {
          var c = document.createElement('span'); c.className = 'kit-caret'; el.appendChild(c);
          // Not there before the typing starts.
          hfEl(c, [{visibility:'hidden'}, {visibility:'visible'}], {at:Math.max(0, at - .001), d:.001, ease:'linear'});
          hfEl(c, [{opacity:1, offset:0}, {opacity:1, offset:.5}, {opacity:0, offset:.51}, {opacity:0}], {at:at, d:1, ease:'linear', n:Math.max(1, Math.ceil((o.caretUntil || end + 1) - at))});
          hfEl(c, [{visibility:'visible'}, {visibility:'hidden'}], {at:o.caretUntil || end + 1, d:.001, ease:'linear'});
        }
        return end;
      },
      /**
       * A pointer moving through [t, x, y] stops (pixels in the video frame),
       * pressing at each time of o.clicks with a ripple. Pass an element to
       * move your own, or null for the default arrow. Returns the pointer.
       */
      cursor: function(sel, path, o){
        o = o || {};
        var el = sel ? one(sel) : null;
        if (!el) {
          el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          el.setAttribute('viewBox', '0 0 24 24'); el.setAttribute('class', 'kit-cursor');
          el.innerHTML = '<path d="M4 2.5v17.2l4.6-4.4 2.9 6.6 3-1.3-2.9-6.5h6.3z" fill="' + (o.color || '#fff') + '" stroke="' + (o.stroke || '#111') + '" stroke-width="1.3" stroke-linejoin="round"/>';
          root().appendChild(el);
        }
        // translate, not transform: the press's scale would shrink the move.
        var leg = legs(path, function(k){ return {translate:k[1] + 'px ' + k[2] + 'px'}; }, o.ease || 'inout');
        hfEl(el, leg.frames, {at:leg.at, d:leg.d, ease:'linear'});
        hfEl(el, [{opacity:0}, {opacity:1}], {at:Math.max(0, path[0][0] - .3), d:.3});
        (o.clicks || []).forEach(function(t){
          var p = path[0];
          for (var i = 0; i < path.length; i++) if (path[i][0] <= t) p = path[i];
          hfEl(el, [{scale:1}, {scale:.82, offset:.4}, {scale:1}], {at:t, d:.28, ease:'inout'});
          var r = document.createElement('div'); r.className = 'kit-ripple'; r.style.left = p[1] + 'px'; r.style.top = p[2] + 'px'; r.style.color = o.rippleColor || 'rgba(255,255,255,.9)';
          root().appendChild(r);
          hfEl(r, [{opacity:0, transform:'scale(.3)'}, {opacity:.9, transform:'scale(.4)', offset:.05}, {opacity:0, transform:'scale(1.6)'}], {at:t + .05, d:.55, ease:'out'});
        });
        // Gone after its last click (o.hideAt overrides), so it never lingers into the next shot.
        var last = (o.clicks || []).length ? Math.max.apply(null, o.clicks) + 1 : null;
        var hide = o.hideAt !== undefined ? o.hideAt : last;
        if (hide !== null) hfEl(el, [{opacity:1}, {opacity:0}], {at:hide, d:.3, ease:'in'});
        return el;
      },
      /** A camera on a stage element: [t, scale, x, y] keys (pixels), slow legs eased in and out. */
      camera: function(sel, keys, o){
        o = o || {};
        var leg = legs(keys, function(k){ return {transform:'translate(' + (k[2] || 0) + 'px,' + (k[3] || 0) + 'px) scale(' + k[1] + ')'}; }, o.ease || 'inout');
        hfEl(one(sel), leg.frames, {at:leg.at, d:leg.d, ease:'linear'});
      },
      /** A number counting from o.from (0) to o.to, up or down, whole numbers; o.prefix / o.suffix around it, o.pad for two digits (05). */
      count: function(sel, o){
        var el = one(sel);
        el.classList.add('kit-count'); if (o.pad) el.classList.add('pad'); el.textContent = '';
        el.setAttribute('data-prefix', o.prefix || ''); el.setAttribute('data-suffix', o.suffix || '');
        hfEl(el, [{'--kit-n':String(Math.round(o.from || 0))}, {'--kit-n':String(Math.round(o.to))}], {at:o.at, d:o.d || 1.6, ease:o.ease || 'out'});
      },
      /** A light sweep across an element (a product, a card, a title). */
      shine: function(sel, o){
        o = o || {};
        all(sel).forEach(function(el){
          if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
          el.style.overflow = 'hidden';
          var s = document.createElement('div'); s.className = 'kit-shine'; el.appendChild(s);
          hfEl(s, [{transform:'translateX(-120%)'}, {transform:'translateX(120%)'}], {at:o.at, d:o.d || 1.1, ease:o.ease || 'inout'});
        });
      },
      /** A slow idle float, so a held shot never looks frozen. */
      float: function(sel, o){
        o = o || {};
        var amp = o.amp || 10;
        all(sel).forEach(function(el, i){ hfEl(el, [{translate:'0 0'}, {translate:'0 ' + -amp + 'px'}, {translate:'0 0'}], {at:o.at + (o.stagger || 0) * i, d:o.d || 4, ease:'inout', n:o.n || 1}); });
      },
      /** A slow push on a picture: scale from o.from (1) to o.to (1.12). */
      kenburns: function(sel, o){
        o = o || {};
        hfEl(one(sel), [{scale:String(o.from || 1)}, {scale:String(o.to || 1.12)}], {at:o.at, d:o.d, ease:o.ease || 'linear'});
      }
    };
    return api;
  })();`;

/** For the Motion design skill: what the agent may call in a page's script. */
export const KIT_DOC = `The page's script has the motion kit (times in seconds from the start of the video, sizes in pixels of the video frame):
   - \`kit.enter(sel, preset, {at, d, stagger, ease})\` and \`kit.exit(…)\`: presets rise, drop, left, right, fade, scale, pop, blur.
   - \`kit.reveal(sel, {at, stagger, by:'words'|'letters'})\`: each word rises out of its own mask — the keynote title.
   - \`kit.type(sel, text, {at, cps, caretUntil})\`: typed a character at a time with a caret; returns the time it ends.
   - \`kit.cursor(null, [[t, x, y], …], {clicks:[t, …], hideAt})\`: a pointer gliding through stops and clicking with a ripple, gone 1 s after its last click; put each stop on its target with \`kit.center(sel)\` → [x, y].
   - \`kit.camera(sel, [[t, scale, x, y], …])\`: slow zooms and pans on a stage element that holds the scene.
   - \`kit.count(sel, {at, d, from, to, prefix, suffix, pad})\`: a whole number counting up or down (pad: two digits, for a clock).
   - \`kit.shine(sel, {at})\`: a light sweep across a product or a card. \`kit.float(sel, {at, d, amp})\`: an idle float. \`kit.kenburns(img, {at, d, to})\`: a slow push on a photo.
   - \`kit.split(sel, 'words'|'letters')\` returns spans to animate with \`hfEl\`. Animate one element's property in time order.`;
