/* Vita runtime: runs the original Design-prototype screens (.dc.html) as a real app.
   - renders the {{holes}}, <sc-if>, <sc-for>, <dc-import> template format with React
   - swaps screens in one page (links to *.dc.html navigate in-app)
   - replaces localStorage with a store that is shared between Tami and Cristian (artifact db)
   - hooks the "KI" estimate in Mahlzeiten to Claude (sample capability) */
(function () {
  'use strict';
  var h = React.createElement;
  var Fragment = React.Fragment;
  var SCREEN_DIR = 'screens/';
  var DEVICE_ID = (function () {
    try {
      var d = window.localStorage.getItem('vitaDeviceId');
      if (!d) { d = 'd' + Math.random().toString(36).slice(2, 10); window.localStorage.setItem('vitaDeviceId', d); }
      return d;
    } catch (e) { return 'd' + Math.random().toString(36).slice(2, 10); }
  })();

  /* ───────────────────────── dates ───────────────────────── */
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function dayKey(d) { d = d || new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function weekKey() {
    var d = new Date(); var idx = (d.getDay() + 6) % 7;
    var m = new Date(d.getFullYear(), d.getMonth(), d.getDate() - idx);
    return 'W' + dayKey(m);
  }
  function todayLabel() {
    var d = new Date();
    var wd = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'][d.getDay()];
    var mo = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'][d.getMonth()];
    return wd + ', ' + d.getDate() + '. ' + mo;
  }

  /* ───────────────────────── shared store ───────────────────────── */
  // Kept only on this device: which person this phone shows, navigation helpers.
  var LOCAL = { vitaActivePerson: 1, vitaNav: 1, vitaEdit: 1, vitaSelectedMeal: 1 };
  // Reset every day / every week.
  var DAILY = { vitaMealLogs: 1, vitaTrainingBurn: 1, 'vitaState:Dashboard': 1 };
  var WEEKLY = { vitaTrainingStatus: 1, vitaExtraTraining: 1, 'vitaState:Essensplan': 1, 'vitaState:Training': 1 };

  var mem = {};
  var CACHE_KEY = 'vitaSharedCache';
  try { mem = JSON.parse(window.localStorage.getItem(CACHE_KEY) || '{}') || {}; } catch (e) { mem = {}; }
  var localMem = {};
  function lsGet(k) { try { var v = window.localStorage.getItem(k); return v; } catch (e) { return k in localMem ? localMem[k] : null; } }
  function lsSet(k, v) { try { window.localStorage.setItem(k, v); } catch (e) { localMem[k] = v; } }
  function lsDel(k) { try { window.localStorage.removeItem(k); } catch (e) { delete localMem[k]; } }
  function eff(k) {
    if (DAILY[k]) return k + '@' + dayKey();
    if (WEEKLY[k]) return k + '@' + weekKey();
    return k;
  }
  function docId(e) { return e.replace(/[^A-Za-z0-9_\-.~:@+]/g, '_'); }
  var cacheTimer = null;
  function saveCache() {
    clearTimeout(cacheTimer);
    cacheTimer = setTimeout(function () { try { window.localStorage.setItem(CACHE_KEY, JSON.stringify(mem)); } catch (e) {} }, 150);
  }

  /* Backend: Supabase (table "kv" with columns k, v, ts, by; realtime on). */
  var CFG = window.VITA_CONFIG || {};
  var sb = null;          // supabase client, set once logged in
  var online = false;
  var pending = {};
  var pushTimers = {};
  function push(e) {
    pending[e] = true;
    clearTimeout(pushTimers[e]);
    pushTimers[e] = setTimeout(function () { if (online) flushKey(e); }, 250);
  }
  function flushKey(e) {
    var q = (e in mem)
      ? sb.from('kv').upsert({ k: e, v: mem[e], ts: Date.now(), by: DEVICE_ID })
      : sb.from('kv').delete().eq('k', e);
    q.then(function (r) {
      if (r && r.error) { console.warn('[vita] save failed', e, r.error.message); setSync('offline'); return; }
      delete pending[e];
    });
  }

  function personKey(k, who) {
    if (k === 'vitaOnboardingData' && who === 'basti') return 'vitaOnboardingData#basti';
    return k;
  }
  function activePerson() { return lsGet('vitaActivePerson') === 'basti' ? 'basti' : 'tamara'; }

  var store = {
    getItem: function (k) {
      k = String(k);
      if (LOCAL[k]) return lsGet(k);
      var e = eff(personKey(k, activePerson()));
      return (e in mem) ? mem[e] : null;
    },
    /* read a per-person value regardless of who is shown right now */
    getItemFor: function (k, who) {
      var e = eff(personKey(String(k), who === 'basti' || who === 'cristian' ? 'basti' : 'tamara'));
      return (e in mem) ? mem[e] : null;
    },
    setItem: function (k, v) {
      k = String(k); v = String(v);
      if (LOCAL[k]) return lsSet(k, v);
      var e = eff(personKey(k, activePerson()));
      if (mem[e] === v) return;
      mem[e] = v; saveCache(); push(e);
    },
    removeItem: function (k) {
      k = String(k);
      if (LOCAL[k]) return lsDel(k);
      var e = eff(personKey(k, activePerson()));
      if (!(e in mem)) return;
      delete mem[e]; saveCache(); push(e);
    },
    key: function () { return null; },
    clear: function () {},
    get length() { return 0; }
  };

  var listeners = [];
  function onRemoteChange(fn) { listeners.push(fn); }
  var syncState = 'connecting';
  var syncListeners = [];
  function setSync(s) { syncState = s; syncListeners.forEach(function (f) { f(s); }); }

  function applyRow(row, removed) {
    if (!row || !row.k) return false;
    var e = row.k;
    if (pending[e]) return false; // our own newer write is on its way
    if (removed) { if (e in mem) { delete mem[e]; return true; } return false; }
    if (typeof row.v === 'string' && mem[e] !== row.v) { mem[e] = row.v; return true; }
    return false;
  }
  function notify() { saveCache(); listeners.forEach(function (f) { f(); }); }

  function startSync() {
    // full load, then live changes
    return sb.from('kv').select('k,v').then(function (r) {
      if (r.error) throw r.error;
      var changed = false;
      (r.data || []).forEach(function (row) { if (applyRow(row)) changed = true; });
      online = true; setSync('live');
      Object.keys(pending).forEach(flushKey);
      if (changed) notify();
      sb.channel('vita-kv')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'kv' }, function (pl) {
          var ch = pl.eventType === 'DELETE' ? applyRow(pl.old, true) : applyRow(pl.new, false);
          if (ch) notify();
        })
        .subscribe(function (status) {
          if (status === 'SUBSCRIBED') { online = true; setSync('live'); }
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') setSync('offline');
        });
      // catch up after the phone wakes up
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState !== 'visible') return;
        sb.from('kv').select('k,v').then(function (r2) {
          if (r2.error) return;
          var c2 = false;
          (r2.data || []).forEach(function (row) { if (applyRow(row)) c2 = true; });
          Object.keys(pending).forEach(flushKey);
          if (c2) notify();
        });
      });
    });
  }

  /* ───────────────────────── KI (Supabase Edge Function "ai") ───────────────────────── */
  function askAI(prompt, tier) {
    if (!sb) return Promise.reject(new Error('offline'));
    return sb.functions.invoke('ai', { body: { prompt: prompt, tier: tier || 'quick' } }).then(function (r) {
      if (r.error) throw r.error;
      var text = r.data && r.data.text;
      if (typeof text !== 'string') throw new Error('keine Antwort');
      return text;
    });
  }
  function parseJSON(text) {
    var a = text.indexOf('{'), b = text.lastIndexOf('}');
    if (a < 0 || b < a) throw new Error('kein JSON');
    return JSON.parse(text.slice(a, b + 1));
  }
  function aiNutrition(name, amount) {
    var prompt = 'Du bist eine Ernährungsdatenbank. Schätze die Nährwerte für diese Mahlzeit, wie sie in Deutschland typisch zubereitet und portioniert wird.\n' +
      'Mahlzeit: "' + String(name).slice(0, 200) + '"\n' +
      'Menge (vom Nutzer, kann leer sein): "' + String(amount || '').slice(0, 80) + '"\n' +
      'Wenn keine Menge angegeben ist, nimm eine übliche Portion an.\n' +
      'Antworte NUR mit JSON in genau dieser Form: {"grams": Zahl, "kcal": Zahl, "p": Zahl, "c": Zahl, "f": Zahl, "parts": ["Zutat ca. X g", ...], "sure": true|false}\n' +
      'p = Protein in g, c = Kohlenhydrate in g, f = Fett in g, alle Werte gerundet für die gesamte Menge. "sure" ist false, wenn die Beschreibung zu vage ist.';
    return askAI(prompt, 'quick').then(function (text) {
      var r = parseJSON(text);
      if (!r || typeof r.kcal !== 'number') throw new Error('bad answer');
      var n = function (x) { x = Number(x); return isFinite(x) && x >= 0 ? Math.round(x) : 0; };
      return { kcal: n(r.kcal), p: n(r.p), c: n(r.c), f: n(r.f), grams: n(r.grams) || 0,
        parts: Array.isArray(r.parts) && r.parts.length ? r.parts.map(String).slice(0, 8) : [String(name)],
        sure: r.sure !== false };
    });
  }

  /* ───────────────────────── template compiler ───────────────────────── */
  var HOLE = /\{\{\s*([^}]+?)\s*\}\}/g;
  var WHOLE = /^\s*\{\{\s*([^}]+?)\s*\}\}\s*$/;
  function lookup(path, scope) {
    path = path.trim();
    if (path === 'true') return true;
    if (path === 'false') return false;
    if (path === 'null') return null;
    if (path === 'undefined') return undefined;
    if (/^-?\d+(\.\d+)?$/.test(path)) return Number(path);
    if (/^'.*'$|^".*"$/.test(path)) return path.slice(1, -1);
    var parts = path.split('.');
    var cur = scope;
    for (var i = 0; i < parts.length; i++) {
      if (cur == null) return undefined;
      cur = cur[parts[i]];
    }
    return cur;
  }
  function textOf(v) { return (v == null || typeof v === 'object' || typeof v === 'function' || v === false) ? '' : String(v); }
  function interp(str, scope) { return str.replace(HOLE, function (_, p) { return textOf(lookup(p, scope)); }); }
  function valueFn(raw) {
    var m = raw.match(WHOLE);
    if (m) { var p = m[1]; return function (s) { return lookup(p, s); }; }
    if (raw.indexOf('{{') !== -1) return function (s) { return interp(raw, s); };
    return function () { return raw; };
  }

  function camel(s) { return s.replace(/-([a-z])/g, function (_, c) { return c.toUpperCase(); }); }
  function splitDecls(css) {
    var out = [], cur = '', depth = 0, q = null;
    for (var i = 0; i < css.length; i++) {
      var ch = css[i];
      if (q) { if (ch === q) q = null; cur += ch; continue; }
      if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (ch === ';' && depth === 0) { out.push(cur); cur = ''; continue; }
      cur += ch;
    }
    if (cur.trim()) out.push(cur);
    return out;
  }
  var styleCache = {};
  function parseStyle(css) {
    if (styleCache[css]) return styleCache[css];
    var o = {};
    splitDecls(css).forEach(function (d) {
      var i = d.indexOf(':'); if (i < 0) return;
      var prop = d.slice(0, i).trim(); var val = d.slice(i + 1).trim();
      if (!prop) return;
      // artboard frames become full-screen
      if (prop === 'width' && val === '390px') val = '100%';
      if (prop === 'height' && val === '844px') val = '100%';
      var key = prop.indexOf('--') === 0 ? prop : camel(prop.replace(/^-(webkit|moz|ms)-/, function (m, v) { return (v === 'ms' ? 'ms' : v.charAt(0).toUpperCase() + v.slice(1)) + '-'; }));
      o[key] = val;
    });
    styleCache[css] = o;
    return o;
  }

  var ATTR = { 'class': 'className', 'for': 'htmlFor', tabindex: 'tabIndex', readonly: 'readOnly', maxlength: 'maxLength',
    minlength: 'minLength', inputmode: 'inputMode', autocomplete: 'autoComplete', autofocus: 'autoFocus', colspan: 'colSpan',
    rowspan: 'rowSpan', spellcheck: 'spellCheck', enterkeyhint: 'enterKeyHint', autocapitalize: 'autoCapitalize',
    contenteditable: 'contentEditable', srcset: 'srcSet', crossorigin: 'crossOrigin', 'xlink:href': 'xlinkHref' };
  var EVENTS = { click: 'onClick', input: 'onInput', change: 'onChange', keydown: 'onKeyDown', keyup: 'onKeyUp', blur: 'onBlur',
    focus: 'onFocus', submit: 'onSubmit', mousedown: 'onMouseDown', mouseup: 'onMouseUp', pointerdown: 'onPointerDown',
    pointerup: 'onPointerUp', touchstart: 'onTouchStart', touchend: 'onTouchEnd', scroll: 'onScroll', dblclick: 'onDoubleClick',
    mouseenter: 'onMouseEnter', mouseleave: 'onMouseLeave', keypress: 'onKeyPress', wheel: 'onWheel' };
  var BOOL = { disabled: 1, checked: 1, readOnly: 1, required: 1, hidden: 1, autoFocus: 1, multiple: 1, selected: 1, open: 1 };
  var SVGNS = 'http://www.w3.org/2000/svg';

  function propName(n, isSvg) {
    var low = n.toLowerCase();
    if (low.indexOf('on') === 0 && EVENTS[low.slice(2)]) return EVENTS[low.slice(2)];
    if (ATTR[low]) return ATTR[low];
    if (low.indexOf('aria-') === 0 || low.indexOf('data-') === 0) return low;
    if (isSvg && n.indexOf('-') > 0) return camel(n);
    return n;
  }

  function compileChildren(nodes) {
    var fns = [];
    for (var i = 0; i < nodes.length; i++) {
      var f = compileNode(nodes[i], i);
      if (f) fns.push(f);
    }
    return function (scope) {
      var out = [];
      for (var j = 0; j < fns.length; j++) {
        var r = fns[j](scope);
        if (r !== undefined) out.push(r);
      }
      return out;
    };
  }

  function compileNode(node, idx) {
    if (node.nodeType === 3) {
      var t = node.nodeValue;
      if (!t.trim()) { return /\n/.test(t) ? null : function () { return t; }; }
      if (t.indexOf('{{') === -1) return function () { return t; };
      return function (s) { return interp(t, s); };
    }
    if (node.nodeType !== 1) return null;
    var tag = node.localName;
    if (tag === 'helmet' || tag === 'script' || tag === 'template') return null;
    var kids = compileChildren(Array.prototype.slice.call(node.childNodes));
    if (tag === 'sc-if') {
      var cond = valueFn(node.getAttribute('value') || '');
      return function (s) { return cond(s) ? h.apply(null, [Fragment, { key: 'if' + idx }].concat(kids(s))) : null; };
    }
    if (tag === 'sc-for') {
      var list = valueFn(node.getAttribute('list') || '');
      var as = node.getAttribute('as') || 'item';
      return function (s) {
        var arr = list(s); if (!arr || !arr.length) return null;
        var items = [];
        for (var i = 0; i < arr.length; i++) {
          var sc = Object.create(s); sc[as] = arr[i]; sc.$index = i;
          items.push(h.apply(null, [Fragment, { key: i }].concat(kids(sc))));
        }
        return h.apply(null, [Fragment, { key: 'for' + idx }].concat(items));
      };
    }
    if (tag === 'dc-import') {
      var cname = node.getAttribute('name');
      var pfs = [];
      Array.prototype.forEach.call(node.attributes, function (a) {
        if (a.name === 'name' || a.name.indexOf('hint-') === 0) return;
        pfs.push([camel(a.name), valueFn(a.value)]);
      });
      return function (s) {
        var p = { key: 'imp' + idx, __name: cname };
        pfs.forEach(function (x) { p[x[0]] = x[1](s); });
        return h(DcImport, p);
      };
    }
    var isSvg = node.namespaceURI === SVGNS;
    var attrs = [];
    Array.prototype.forEach.call(node.attributes, function (a) {
      attrs.push([propName(a.name, isSvg), a.value, valueFn(a.value), a.value.indexOf('{{') !== -1]);
    });
    return function (s) {
      var p = {};
      for (var i = 0; i < attrs.length; i++) {
        var a = attrs[i], name = a[0];
        var v = a[2](s);
        if (name === 'style') { p.style = typeof v === 'string' ? parseStyle(v) : v; continue; }
        if (BOOL[name] && !a[3]) v = true;
        if (v === undefined) continue;
        p[name] = v;
      }
      if (tag === 'input' || tag === 'textarea' || tag === 'select') {
        var handler = p.onInput || p.onChange;
        if ('value' in p) {
          if (p.value == null) p.value = '';
          if (handler) { p.onChange = handler; delete p.onInput; }
          else { p.defaultValue = p.value; delete p.value; }
        }
        if ('checked' in p && !p.onChange && !p.onClick) { p.defaultChecked = !!p.checked; delete p.checked; }
      }
      if (tag === 'a' && typeof p.href === 'string' && /\.dc\.html(\?|#|$)/.test(p.href)) {
        var orig = p.onClick, href = p.href;
        p.onClick = function (e) {
          if (typeof orig === 'function') orig(e);
          e.preventDefault();
          Vita.navigate(href);
        };
      }
      return h.apply(null, [tag, p].concat(kids(s)));
    };
  }

  /* ───────────────────────── component loading ───────────────────────── */
  var GLOBALS = { get __todayLabel() { return todayLabel(); } };
  var loc = { search: '' };

  function DCLogic(props) { React.Component.call(this, props); this.state = {}; }
  DCLogic.prototype = Object.create(React.Component.prototype);
  DCLogic.prototype.constructor = DCLogic;
  DCLogic.prototype.render = function () {
    var vals = typeof this.renderVals === 'function' ? (this.renderVals() || {}) : {};
    var scope = Object.create(GLOBALS);
    for (var k in vals) scope[k] = vals[k];
    var out = this.__tpl(scope);
    return out.length === 1 ? out[0] : h.apply(null, [Fragment, null].concat(out));
  };

  var modules = {};
  var loading = {};
  var injectedHead = {};

  function loadModule(name) {
    if (modules[name]) return Promise.resolve(modules[name]);
    if (loading[name]) return loading[name];
    loading[name] = fetch(SCREEN_DIR + name + '.dc.html').then(function (r) {
      if (!r.ok) throw new Error('Screen ' + name + ' nicht gefunden');
      return r.text();
    }).then(function (text) {
      var doc = new DOMParser().parseFromString(text, 'text/html');
      var xdc = doc.querySelector('x-dc');
      var helmet = xdc && xdc.querySelector('helmet');
      if (helmet) {
        Array.prototype.forEach.call(helmet.children, function (el) {
          var sig = el.outerHTML;
          if (injectedHead[sig]) return;
          injectedHead[sig] = 1;
          var clone = document.createElement(el.localName);
          Array.prototype.forEach.call(el.attributes, function (a) { clone.setAttribute(a.name, a.value); });
          clone.textContent = el.textContent;
          document.head.appendChild(clone);
        });
      }
      var script = doc.querySelector('script[data-dc-script]');
      var defaults = {};
      try {
        var dp = JSON.parse(script.getAttribute('data-props') || '{}');
        Object.keys(dp).forEach(function (k) { if (k[0] !== '$' && dp[k] && 'default' in dp[k]) defaults[k] = dp[k]['default']; });
      } catch (e) {}
      var Klass = new Function('DCLogic', 'React', 'localStorage', '__vitaLoc', script.textContent + '\n;return Component;')(DCLogic, React, store, loc);
      if (EXT[name]) Klass = EXT[name](Klass);
      if (PERSIST[name]) Klass = withPersist(Klass, PERSIST[name]);
      var tpl = compileChildren(Array.prototype.slice.call(xdc.childNodes));
      Klass.prototype.__tpl = tpl;
      var deps = [];
      xdc.querySelectorAll('dc-import').forEach(function (d) { deps.push(d.getAttribute('name')); });
      modules[name] = { Klass: Klass, defaults: defaults };
      return Promise.all(deps.map(loadModule)).then(function () { return modules[name]; });
    });
    return loading[name];
  }

  function DcImport(props) {
    var mod = modules[props.__name];
    var st = React.useState(0);
    React.useEffect(function () {
      if (!mod) loadModule(props.__name).then(function () { st[1](1); });
    }, [props.__name]);
    if (!mod) return null;
    var p = {};
    for (var k in props) if (k !== '__name') p[k] = props[k];
    return h(mod.Klass, p);
  }

  /* screen state that the prototype only kept in memory, now saved and shared */
  var PERSIST = {
    Einkaufsliste: { key: 'vitaState:Einkaufsliste', fields: ['addedBy', 'checkedBy', 'onList', 'checked', 'custom', 'nextId', 'selected'] },
    Essensplan: { key: 'vitaState:Essensplan', fields: ['status', 'swaps'] },
    Training: { key: 'vitaState:Training', fields: ['swaps'] },
    Dashboard: { key: 'vitaState:Dashboard', fields: ['waterLogs', 'trainingLogs', 'wSaved'] },
    Profil: { key: 'vitaState:Profil', fields: ['measures', 'photos', 'rem'] }
  };
  function withPersist(K, cfg) {
    // K is an ES class; P must be one too so super() works
    var Sub = class extends K {
      constructor(props) {
        super(props);
        try {
          var saved = JSON.parse(store.getItem(cfg.key) || 'null');
          if (saved && this.state) cfg.fields.forEach((f) => { if (f in saved) this.state[f] = saved[f]; });
        } catch (e) {}
      }
      componentDidUpdate(pp, ps, snap) {
        if (super.componentDidUpdate) super.componentDidUpdate(pp, ps, snap);
        var changed = false, out = {};
        cfg.fields.forEach((f) => { out[f] = this.state[f]; if (!ps || ps[f] !== this.state[f]) changed = true; });
        if (changed) store.setItem(cfg.key, JSON.stringify(out));
      }
    };
    return Sub;
  }

  /* hooks into specific screens */
  function num(v) { return parseFloat(String(v == null ? '' : v).replace(',', '.')); }
  function readJSON(str) { try { return JSON.parse(str || '{}') || {}; } catch (e) { return {}; } }
  var EXT = {
    Dashboard: function (K) {
      return class extends K {
        buildWeightSeries() {
          var out = {};
          var weights = readJSON(store.getItem('vitaWeights'));
          ['tamara', 'basti'].forEach(function (who) {
            var ob = readJSON(store.getItemFor('vitaOnboardingData', who));
            var logs = weights[who] || {};
            var last = num(ob.weight) > 0 ? num(ob.weight) : null;
            var pts = [];
            for (var i = 6; i >= 0; i--) {
              var from = Date.now() - (i + 1) * 7 * 864e5, to = Date.now() - i * 7 * 864e5;
              var vals = Object.keys(logs).filter(function (d) { var t = new Date(d + 'T12:00:00').getTime(); return t > from && t <= to; }).map(function (d) { return logs[d]; });
              if (vals.length) last = vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
              pts.push(last);
            }
            var first = null; pts.forEach(function (v) { if (first == null && v != null) first = v; });
            if (first == null) first = who === 'tamara' ? 63 : 68;
            out[who] = pts.map(function (v) { return Math.round((v == null ? first : v) * 10) / 10; });
            var tw = num(ob.targetWeight);
            out[who === 'tamara' ? 'tamaraTarget' : 'bastiTarget'] = tw > 0 ? tw : out[who][6];
          });
          return out;
        }
        componentDidUpdate(pp, ps, snap) {
          if (super.componentDidUpdate) super.componentDidUpdate(pp, ps, snap);
          if (ps && ps.wSaved !== this.state.wSaved && this.state.wSaved) {
            var all = readJSON(store.getItem('vitaWeights'));
            var changed = false;
            Object.keys(this.state.wSaved).forEach(function (who) {
              var kg = num(this.state.wSaved[who]);
              if (!(kg > 20 && kg < 400)) return;
              all[who] = all[who] || {};
              if (all[who][dayKey()] !== kg) { all[who][dayKey()] = kg; changed = true; }
            }, this);
            if (changed) { store.setItem('vitaWeights', JSON.stringify(all)); this.weightSeries = this.buildWeightSeries(); this.forceUpdate(); }
          }
        }
      };
    },
    Mahlzeiten: function (K) {
      return class extends K {
        kickAi() {
          this.setState({ ai: 'thinking' });
          clearTimeout(this.__aiDebounce);
          var req = (this.__aiReq || 0) + 1; this.__aiReq = req;
          this.__aiDebounce = setTimeout(() => {
            var name = (this.state.fName || '').trim(), amount = (this.state.fAmount || '').trim();
            if (name.length < 2) { this.setState({ ai: 'done' }); return; }
            aiNutrition(name, amount).then((r) => {
              if (req !== this.__aiReq) return;
              this.__aiResult = { key: name + '|' + amount, r: r };
              this.setState({ ai: 'done' });
            }).catch(() => {
              if (req !== this.__aiReq) return;
              this.__aiResult = null;
              this.setState({ ai: 'done' });
            });
          }, 900);
        }
        estimate(name, amount) {
          var key = (name || '').trim() + '|' + (amount || '').trim();
          if (this.__aiResult && this.__aiResult.key === key) return this.__aiResult.r;
          return super.estimate(name, amount);
        }
        componentWillUnmount() { clearTimeout(this.__aiDebounce); this.__aiReq = -1; if (super.componentWillUnmount) super.componentWillUnmount(); }
      };
    }
  };

  /* ───────────────────────── app shell ───────────────────────── */
  var SCREENS = ['Onboarding', 'Onboarding2', 'Onboarding3', 'Onboarding4', 'Onboarding5', 'Onboarding6', 'Dashboard',
    'Mahlzeiten', 'Essensplan', 'Einkaufsliste', 'Training', 'Profil'];
  var lastInteraction = 0;
  ['pointerdown', 'keydown', 'input', 'touchstart'].forEach(function (ev) {
    document.addEventListener(ev, function () { lastInteraction = Date.now(); }, true);
  });

  var Vita = { navigate: function () {} };

  function parseHref(href) {
    var clean = String(href).replace(/^.*\//, '');
    var q = clean.indexOf('?');
    var file = q >= 0 ? clean.slice(0, q) : clean;
    return { name: file.replace(/\.dc\.html.*$/, ''), search: q >= 0 ? clean.slice(q).replace(/#.*$/, '') : '' };
  }

  function SyncBadge() {
    var s = React.useState(syncState);
    React.useEffect(function () { syncListeners.push(s[1]); return function () { syncListeners = syncListeners.filter(function (f) { return f !== s[1]; }); }; }, []);
    if (s[0] === 'live' || s[0] === 'connecting') return null;
    var txt = s[0] === 'readonly' ? 'Nur Ansicht: Änderungen werden nicht gespeichert' : (s[0] === 'local' ? 'Offline-Modus: nur auf diesem Gerät gespeichert' : 'Keine Verbindung, Änderungen werden nachgeholt');
    return h('div', { style: { position: 'absolute', left: 12, right: 12, top: 8, zIndex: 200, background: '#111111', color: '#FFFFFF', fontFamily: "'Inter',sans-serif", fontSize: 12, padding: '8px 12px', borderRadius: 999, textAlign: 'center', pointerEvents: 'none', opacity: 0.88 } }, txt);
  }

  /* keep the reading position when fresh data from the other phone re-renders a screen */
  function pathOf(el, root) {
    var path = [];
    while (el && el !== root) { path.unshift(Array.prototype.indexOf.call(el.parentNode.children, el)); el = el.parentNode; }
    return path;
  }
  function byPath(root, path) {
    var el = root;
    for (var i = 0; i < path.length && el; i++) el = el.children[path[i]];
    return el;
  }
  function saveScroll() {
    var root = document.getElementById('vita'); var out = [];
    if (!root) return out;
    root.querySelectorAll('*').forEach(function (el) { if (el.scrollTop > 0) out.push({ path: pathOf(el, root), top: el.scrollTop }); });
    return out;
  }
  function restoreScroll(saved) {
    if (!saved || !saved.length) return;
    var root = document.getElementById('vita');
    var apply = function () { saved.forEach(function (x) { var el = byPath(root, x.path); if (el) el.scrollTop = x.top; }); };
    // the screens scroll themselves to the top right after mounting (at 0 and 120 ms), so restore after that
    [0, 60, 180, 350].forEach(function (t) { setTimeout(apply, t); });
  }

  class App extends React.Component {
    constructor(p) {
      super(p);
      this.state = { screen: p.initial, epoch: 0, ready: false, error: null };
      loc.search = p.search || '';
    }
    componentDidMount() {
      Vita.navigate = (href) => this.go(href, true);
      window.addEventListener('popstate', () => {
        var name = (location.hash || '').replace('#', '');
        if (SCREENS.indexOf(name) >= 0 && name !== this.state.screen) this.go(name + '.dc.html', false);
      });
      onRemoteChange(() => this.remoteChanged());
      this.load(this.state.screen);
    }
    load(name) {
      loadModule(name).then(() => this.setState({ ready: true, error: null }))
        .catch((e) => this.setState({ error: String(e && e.message || e) }));
    }
    go(href, pushHist) {
      var t = parseHref(href);
      if (SCREENS.indexOf(t.name) < 0) return;
      loc.search = t.search;
      if (pushHist) { try { history.pushState(null, '', '#' + t.name); } catch (e) {} }
      loadModule(t.name).then(() => this.setState((s) => ({ screen: t.name, epoch: s.epoch + 1, ready: true })));
    }
    remoteChanged() {
      clearTimeout(this.__rt);
      var idle = Date.now() - lastInteraction;
      var ae = document.activeElement;
      var typing = ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA');
      if (idle > 6000 && !typing) {
        var saved = saveScroll();
        this.setState((s) => ({ epoch: s.epoch + 1 }), () => restoreScroll(saved));
      }
      else this.__rt = setTimeout(() => this.remoteChanged(), 2000);
    }
    render() {
      if (this.state.error) return h('div', { style: { padding: 24, fontFamily: 'Inter,sans-serif' } }, this.state.error);
      var mod = modules[this.state.screen];
      if (!mod) return h(Splash);
      var props = Object.assign({ key: this.state.screen + ':' + this.state.epoch }, mod.defaults);
      return h(Fragment, null, h(mod.Klass, props), h(SyncBadge));
    }
  }

  function Splash() {
    return h('div', { style: { height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F3F1EC' } },
      h('span', { style: { fontFamily: "'DM Serif Display',Georgia,serif", fontSize: 48, color: '#1F4D3A' } }, 'Vita'));
  }

  /* ───────────────────────── login & "wer bist du" ───────────────────────── */
  var F_SERIF = "'DM Serif Display',Georgia,serif", F_UI = "'Inter',sans-serif", F_NUM = "'Geist',sans-serif";
  function Shell(props) {
    return h('div', { style: { height: '100%', boxSizing: 'border-box', background: '#F3F1EC', display: 'flex', flexDirection: 'column', overflowY: 'auto', padding: '72px 20px 32px', gap: 32 } },
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: 16 } },
        h('span', { style: { width: 56, height: 56, borderRadius: 20, background: '#1F4D3A', display: 'flex', alignItems: 'center', justifyContent: 'center' } },
          h('svg', { viewBox: '0 0 24 24', width: 30, height: 30, fill: 'none', stroke: '#FFFFFF', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true' },
            h('path', { d: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z' }))),
        h('h1', { style: { margin: 0, fontFamily: F_SERIF, fontSize: 56, fontWeight: 400, letterSpacing: '-0.01em', lineHeight: 1 } }, 'Vita'),
        h('p', { style: { margin: 0, fontFamily: F_UI, fontSize: 16, lineHeight: 1.5 } }, props.lead)),
      props.children);
  }
  var inputStyle = { boxSizing: 'border-box', width: '100%', padding: '12px 16px', borderRadius: 16, border: '1px solid #E6E3DC', fontFamily: F_UI, fontSize: 15, background: '#FFFFFF', color: '#111111' };
  var labelStyle = { fontFamily: F_UI, fontSize: 13, fontWeight: 600 };
  var primaryBtn = { all: 'unset', boxSizing: 'border-box', cursor: 'pointer', display: 'block', textAlign: 'center', background: '#1F4D3A', color: '#FFFFFF', fontFamily: F_UI, fontSize: 15, fontWeight: 600, padding: 16, borderRadius: 999 };

  function Login(props) {
    var e = React.useState(''), pw = React.useState(''), busy = React.useState(false), err = React.useState('');
    function submit(ev) {
      ev.preventDefault();
      if (!e[0].trim() || !pw[0]) { err[1]('Bitte E-Mail und Passwort eingeben.'); return; }
      busy[1](true); err[1]('');
      sb.auth.signInWithPassword({ email: e[0].trim(), password: pw[0] }).then(function (r) {
        busy[1](false);
        if (r.error) { err[1](/invalid/i.test(r.error.message) ? 'E-Mail oder Passwort stimmt nicht.' : 'Anmelden hat nicht geklappt: ' + r.error.message); return; }
        props.onDone();
      });
    }
    return h(Shell, { lead: 'Meldet euch mit eurem Haushalts-Login an. Das braucht es nur einmal pro Handy.' },
      h('form', { onSubmit: submit, style: { display: 'flex', flexDirection: 'column', gap: 16 } },
        h('label', { htmlFor: 'vita-email', style: labelStyle }, 'E-Mail'),
        h('input', { id: 'vita-email', type: 'email', autoComplete: 'username', value: e[0], onChange: function (x) { e[1](x.target.value); }, style: inputStyle }),
        h('label', { htmlFor: 'vita-pw', style: labelStyle }, 'Passwort'),
        h('input', { id: 'vita-pw', type: 'password', autoComplete: 'current-password', value: pw[0], onChange: function (x) { pw[1](x.target.value); }, style: inputStyle }),
        err[0] ? h('p', { role: 'alert', style: { margin: 0, fontFamily: F_UI, fontSize: 13, color: '#A63A1E' } }, err[0]) : null,
        h('button', { type: 'submit', disabled: busy[0], style: Object.assign({}, primaryBtn, { opacity: busy[0] ? 0.6 : 1 }) }, busy[0] ? 'Einen Moment …' : 'Anmelden')));
  }

  function Who(props) {
    function card(key, name, initial, bg, fg) {
      return h('button', { type: 'button', onClick: function () { props.onPick(key); },
        style: { all: 'unset', boxSizing: 'border-box', cursor: 'pointer', flex: 1, background: '#FFFFFF', borderRadius: 20, padding: '24px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 } },
        h('span', { style: { width: 56, height: 56, borderRadius: '50%', background: bg, color: fg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: F_NUM, fontSize: 20, fontWeight: 700 } }, initial),
        h('span', { style: { fontFamily: F_UI, fontSize: 15, fontWeight: 600 } }, name));
    }
    return h(Shell, { lead: 'Wer nutzt dieses Handy? Die App öffnet dann immer mit deinem Tag.' },
      h('div', { style: { display: 'flex', gap: 12 } },
        card('tamara', 'Tami', 'T', '#E3EEE6', '#1F4D3A'),
        card('basti', 'Cristian', 'C', '#F5E3DA', '#C4532D')),
      h('p', { style: { margin: 0, fontFamily: F_UI, fontSize: 13, color: '#6F706D', lineHeight: 1.5 } }, 'Ihr könnt in der App jederzeit auf die Ansicht des anderen wechseln.'));
  }

  function Message(props) {
    return h(Shell, { lead: props.text });
  }

  /* ───────────────────────── boot ───────────────────────── */
  function boot() {
    var root = ReactDOM.createRoot(document.getElementById('vita'));
    root.render(h(Splash));
    if (!CFG.supabaseUrl || !CFG.supabaseAnonKey || !window.supabase) {
      root.render(h(Message, { text: 'Die App ist noch nicht mit eurer Datenbank verbunden. Claude trägt die Zugangsdaten ein, sobald Supabase eingerichtet ist.' }));
      return;
    }
    sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true } });

    function startApp() {
      var me = lsGet('vitaDevicePerson');
      lsSet('vitaActivePerson', me); // each phone opens on its own person
      var hash = (location.hash || '').replace('#', '');
      var onboarded = !!store.getItemFor('vitaOnboardingData', me);
      var initial = SCREENS.indexOf(hash) >= 0 ? hash : (onboarded ? 'Dashboard' : 'Onboarding');
      root.render(h(App, { initial: initial }));
    }
    function afterLogin() {
      root.render(h(Splash));
      var synced = startSync().catch(function (e) { console.warn('[vita] sync', e); setSync('offline'); });
      var hasCache = Object.keys(mem).length > 0;
      Promise.race([synced, new Promise(function (r) { setTimeout(r, hasCache ? 1500 : 8000); })]).then(function () {
        if (!lsGet('vitaDevicePerson')) root.render(h(Who, { onPick: function (k) { lsSet('vitaDevicePerson', k); startApp(); } }));
        else startApp();
      });
    }
    sb.auth.getSession().then(function (r) {
      if (r && r.data && r.data.session) afterLogin();
      else root.render(h(Login, { onDone: afterLogin }));
    }).catch(function () { root.render(h(Login, { onDone: afterLogin })); });
  }
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
  }
  window.VitaDebug = { store: store, mem: function () { return mem; } };
  boot();
})();
