/* 21X trainer - pure game logic (no DOM).
   Used both by the Node test harness and inlined into the final HTML. */
(function (global) {
  "use strict";

  var MAX_HAND = 5, TARGET = 21, STAND_MS = 60000;

  /* ========================= exact rationals ========================= */
  // Totals can be fractions (X/2, 4X/N, 24/X ...), so anything that decides a
  // win is computed exactly with BigInt rationals {n, d}: d > 0, fully reduced.
  function babs(a) { return a < 0n ? -a : a; }
  function bgcd(a, b) { a = babs(a); b = babs(b); while (b) { var t = a % b; a = b; b = t; } return a; }
  function Q(n, d) {
    n = BigInt(n); d = d === undefined ? 1n : BigInt(d);
    if (d === 0n) return null;
    if (d < 0n) { n = -n; d = -d; }
    var g = bgcd(n, d);
    if (g > 1n) { n /= g; d /= g; }
    return { n: n, d: d };
  }
  function qadd(a, b) { return Q(a.n * b.d + b.n * a.d, a.d * b.d); }
  function qsub(a, b) { return Q(a.n * b.d - b.n * a.d, a.d * b.d); }
  function qmul(a, b) { return Q(a.n * b.n, a.d * b.d); }
  function qdiv(a, b) { return b.n === 0n ? null : Q(a.n * b.d, a.d * b.n); }
  function qneg(a) { return { n: -a.n, d: a.d }; }
  function qcmp(a, b) { var x = a.n * b.d - b.n * a.d; return x > 0n ? 1 : x < 0n ? -1 : 0; }
  function qisInt(a) { return a.d === 1n; }
  function bitlen(b) { return babs(b).toString(2).length; }
  var MAX_BITS = 20000;              // results bigger than this are far past 21 anyway
  function qpow(a, e) {
    if (!qisInt(e)) return null;     // only whole-number powers stay rational
    var k = e.n, inv = k < 0n;
    if (inv) k = -k;
    if (k === 0n) return Q(1);
    if (a.n === 0n) return inv ? null : Q(0);
    if ((babs(a.n) !== 1n || a.d !== 1n) && Number(k) * Math.max(bitlen(a.n), bitlen(a.d)) > MAX_BITS) return null;
    var n = a.n ** k, d = a.d ** k;
    return inv ? Q(d, n) : { n: n, d: d };
  }
  function qfact(a) {
    if (!qisInt(a) || a.n < 0n || a.n > 1000n) return null;
    var r = 1n;
    for (var i = 2n; i <= a.n; i++) r *= i;
    return { n: r, d: 1n };
  }
  function qnum(a) {
    var n = Number(a.n), d = Number(a.d);
    if (isFinite(d)) return n / d;
    if (!isFinite(n)) { var s = BigInt(bitlen(a.d) - 1000); return Number(a.n >> s) / Number(a.d >> s); }
    return 0;
  }

  /* ---- display ---- */
  var MINUS = "−";
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  // exact decimal string for n/d (n >= 0) if it terminates within 6 places
  function decimalOf(n, d) {
    for (var k = 1, p = 10n; k <= 6; k++, p *= 10n) {
      if (p % d !== 0n) continue;
      var m = n * (p / d), fp = (m % p).toString();
      while (fp.length < k) fp = "0" + fp;
      return (m / p).toString() + "." + fp;
    }
    return null;
  }
  var HUGE = 999999999999n;
  // "12", "−3", "12.5", "20 2/3"
  function qstr(a) {
    if (!a) return "?";
    var neg = a.n < 0n, n = babs(a.n), d = a.d, s;
    if (n / d > HUGE) s = "≈" + Math.abs(qnum(a)).toPrecision(3);
    else if (d === 1n) s = n.toString();
    else s = decimalOf(n, d) || ((n / d ? (n / d) + " " : "") + (n % d) + "/" + d);
    return (neg ? MINUS : "") + s;
  }
  // same as qstr, but non-terminating fractions become a small stacked fraction
  function qhtml(a) {
    if (!a) return "?";
    var n = babs(a.n), d = a.d;
    if (d === 1n || n / d > HUGE || decimalOf(n, d)) return esc(qstr(a));
    var ip = n / d;
    return (a.n < 0n ? MINUS : "") + (ip ? ip.toString() : "") +
      '<span class="mf"><span>' + (n % d) + "</span><span>" + d + "</span></span>";
  }
  function qapprox(a) { return a ? (Math.round(qnum(a) * 100) / 100).toString().replace("-", MINUS) : "?"; }

  /* ======================= celebrity sequences ======================= */
  // Each Celebrity card is a printed sequence: its value is the term X places along.
  // Rulebook: for a negative X, count as if X were positive, then negate the result.
  var primes = [2];
  function nthPrime(k) {
    if (k > primes.length) {
      var lim = Math.max(30, Math.ceil(k * (Math.log(k) + Math.log(Math.log(k + 2)) + 1)));
      var comp = new Uint8Array(lim + 1);
      primes = [];
      for (var i = 2; i <= lim; i++) {
        if (comp[i]) continue;
        primes.push(i);
        for (var j = i * i; j <= lim; j += i) comp[j] = 1;
      }
    }
    return primes[k - 1];
  }
  var fibs = [0n, 1n, 1n];
  function fib(k) { while (fibs.length <= k) fibs.push(fibs[fibs.length - 1] + fibs[fibs.length - 2]); return fibs[k]; }
  function sigma(k) {
    var s = 0, r = Math.floor(Math.sqrt(k));
    for (var i = 1; i <= r; i++) if (k % i === 0) { s += i; if (k / i !== i) s += k / i; }
    return s;
  }
  var DIGITS = 1000, piStr = "", eStr = "";
  function piDigits() {            // digits after "3." via Machin: pi = 16 atan(1/5) - 4 atan(1/239)
    if (piStr) return piStr;
    var scale = 10n ** BigInt(DIGITS + 12);
    function atanInv(x) {
      x = BigInt(x);
      var x2 = x * x, term = scale / x, sum = term, k = 1n, sign = -1n;
      while (term) { term /= x2; sum += sign * (term / (2n * k + 1n)); sign = -sign; k++; }
      return sum;
    }
    piStr = (16n * atanInv(5) - 4n * atanInv(239)).toString().slice(1, DIGITS + 1);
    return piStr;
  }
  function eDigits() {             // digits after "2." via e = sum 1/k!
    if (eStr) return eStr;
    var scale = 10n ** BigInt(DIGITS + 12), term = scale, sum = 0n, k = 1n;
    while (term) { sum += term; term /= k; k++; }
    eStr = sum.toString().slice(1, DIGITS + 1);
    return eStr;
  }
  var SEQ = {
    prime:   { max: 20000, f: function (k) { return BigInt(nthPrime(k)); } },
    tri:     { max: 1e9,   f: function (k) { var b = BigInt(k); return b * (b + 1n) / 2n; } },
    fib:     { max: 5000,  f: fib },
    sigma:   { max: 1e8,   f: function (k) { return BigInt(sigma(k)); } },
    pidigit: { max: DIGITS, f: function (k) { return BigInt(piDigits()[k - 1]); } },
    edigit:  { max: DIGITS, f: function (k) { return BigInt(eDigits()[k - 1]); } }
  };
  function seqTerm(name, k) {       // k: JS integer -> BigInt, or null when off the card
    var s = SEQ[name];
    if (!s || k === 0 || Math.abs(k) > s.max) return null;
    var v = s.f(Math.abs(k));
    return k < 0 ? -v : v;
  }
  function seqPreview(name, count) {
    var out = [];
    for (var k = 1; k <= count; k++) out.push(seqTerm(name, k).toString());
    return out;
  }

  /* ======================== formula parser ======================== */
  // Card formulas are written the way they are printed: 2X+4, 4N/X, X(N+2), (X-N)^2, N!,
  // prime(X). Juxtaposition multiplies; ^ binds tighter than unary minus (-X^2 = -(X^2)).
  var FN_NAMES = { prime: 1, tri: 1, fib: 1, sigma: 1, pidigit: 1, edigit: 1 };
  var VARS = { X: 1, N: 1, Y: 1, V: 1 };
  var OPS = {
    "+": "+", "-": "-", "−": "-", "–": "-", "*": "*", "×": "*", "·": "*",
    "/": "/", "÷": "/", "^": "^", "!": "!", "(": "(", ")": ")"
  };
  var SUPD = { "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9" };
  function tokenize(src) {
    var s = String(src), toks = [], i = 0, j, word;
    while (i < s.length) {
      var c = s[i];
      if (/\s/.test(c)) { i++; continue; }
      if (/[0-9.]/.test(c)) {
        for (j = i; j < s.length && /[0-9.]/.test(s[j]); j++);
        toks.push({ k: "num", v: s.slice(i, j) }); i = j; continue;
      }
      if (/[A-Za-z]/.test(c)) {
        for (j = i; j < s.length && /[A-Za-z]/.test(s[j]); j++);
        var word = s.slice(i, j);
        if (FN_NAMES[word.toLowerCase()]) toks.push({ k: "fn", v: word.toLowerCase() });
        else for (var m = 0; m < word.length; m++) {          // "NX" is N times X
          var u = word[m].toUpperCase();
          if (!VARS[u]) throw new Error("Unknown symbol '" + word[m] + "' in \"" + s + "\"");
          toks.push({ k: "var", v: u });
        }
        i = j; continue;
      }
      if (SUPD[c] !== undefined) {                               // X² etc.
        for (j = i, word = ""; j < s.length && SUPD[s[j]] !== undefined; j++) word += SUPD[s[j]];
        toks.push({ k: "op", v: "^" }, { k: "num", v: word }); i = j; continue;
      }
      if (!OPS[c]) throw new Error("Unexpected '" + c + "' in \"" + s + "\"");
      toks.push({ k: "op", v: OPS[c] }); i++;
    }
    return toks;
  }
  function parseNum(t) {
    var parts = t.split(".");
    if (parts.length > 2 || t === ".") throw new Error("Bad number '" + t + "'");
    var frac = parts[1] || "";
    return Q(BigInt((parts[0] || "0") + frac), 10n ** BigInt(frac.length));
  }
  function parse(src) {
    var toks = tokenize(src), p = 0;
    function isOp(v) { var t = toks[p]; return !!t && t.k === "op" && t.v === v; }
    function expect(v) { if (!isOp(v)) throw new Error("Expected '" + v + "' in \"" + src + "\""); p++; }
    function startsAtom() { var t = toks[p]; return !!t && (t.k !== "op" || t.v === "("); }
    function expr() {
      var a = term();
      while (isOp("+") || isOp("-")) { var op = toks[p++].v; a = { t: op, a: a, b: term() }; }
      return a;
    }
    function term() {
      var a = unary();
      for (;;) {
        if (isOp("*") || isOp("/")) { var op = toks[p++].v; a = { t: op, a: a, b: unary() }; }
        else if (startsAtom()) a = { t: "*", a: a, b: unary() };
        else return a;
      }
    }
    function unary() {
      if (isOp("-")) { p++; return { t: "neg", a: unary() }; }
      if (isOp("+")) { p++; return unary(); }
      var base = postfix();
      if (isOp("^")) { p++; return { t: "^", a: base, b: unary() }; }
      return base;
    }
    function postfix() {
      var a = primary();
      while (isOp("!")) { p++; a = { t: "!", a: a }; }
      return a;
    }
    function primary() {
      var t = toks[p];
      if (!t) throw new Error("Unexpected end of \"" + src + "\"");
      p++;
      if (t.k === "num") return { t: "num", q: parseNum(t.v) };
      if (t.k === "var") return { t: "var", v: t.v };
      if (t.k === "fn") { expect("("); var a = expr(); expect(")"); return { t: "fn", f: t.v, a: a }; }
      if (t.v === "(") { var e = expr(); expect(")"); return e; }
      throw new Error("Unexpected '" + t.v + "' in \"" + src + "\"");
    }
    if (!toks.length) throw new Error("Empty formula");
    var ast = expr();
    if (p < toks.length) throw new Error("Unexpected '" + toks[p].v + "' in \"" + src + "\"");
    return ast;
  }
  function varsOf(node, out) {
    out = out || {};
    if (node.t === "var") out[node.v] = true;
    if (node.a) varsOf(node.a, out);
    if (node.b) varsOf(node.b, out);
    return out;
  }

  /* =========================== evaluation =========================== */
  // Exact evaluation (env values are rationals). null = undefined (÷0, off a sequence card ...)
  function evalQ(node, env) {
    var x, y;
    switch (node.t) {
      case "num": return node.q;
      case "var": return env[node.v] || null;
      case "neg": x = evalQ(node.a, env); return x && qneg(x);
      case "!": x = evalQ(node.a, env); return x && qfact(x);
      case "fn":
        x = evalQ(node.a, env);
        if (!x || !qisInt(x) || babs(x.n) > 1000000000n) return null;
        y = seqTerm(node.f, Number(x.n));
        return y === null ? null : Q(y);
    }
    x = evalQ(node.a, env); if (!x) return null;
    y = evalQ(node.b, env); if (!y) return null;
    switch (node.t) {
      case "+": return qadd(x, y);
      case "-": return qsub(x, y);
      case "*": return qmul(x, y);
      case "/": return qdiv(x, y);
      case "^": return qpow(x, y);
    }
    return null;
  }
  // Fast floating-point evaluation, only used to search for candidate X values.
  var FACT = [1];
  for (var fi = 1; fi <= 170; fi++) FACT[fi] = FACT[fi - 1] * fi;
  function compileF(node) {
    var a, b, c;
    switch (node.t) {
      case "num": c = qnum(node.q); return function () { return c; };
      case "var": c = node.v; return function (env) { return env[c]; };
      case "neg": a = compileF(node.a); return function (env) { return -a(env); };
      case "!":
        a = compileF(node.a);
        return function (env) { var v = a(env); return v !== Math.round(v) || v < 0 ? NaN : v > 170 ? Infinity : FACT[v]; };
      case "fn":
        a = compileF(node.a); c = node.f;
        return function (env) {
          var k = a(env);
          if (k !== Math.round(k) || Math.abs(k) > 1e9) return NaN;
          var v = seqTerm(c, k);
          return v === null ? NaN : Number(v);
        };
    }
    a = compileF(node.a); b = compileF(node.b);
    switch (node.t) {
      case "+": return function (env) { return a(env) + b(env); };
      case "-": return function (env) { return a(env) - b(env); };
      case "*": return function (env) { return a(env) * b(env); };
      case "/": return function (env) { var d = b(env); return d === 0 ? NaN : a(env) / d; };
      case "^": return function (env) {
        var e = b(env), v = a(env);
        return e !== Math.round(e) || (v === 0 && e < 0) ? NaN : Math.pow(v, e);
      };
    }
  }

  var Q20 = Q(20), Q21 = Q(21);
  // "win" (exactly 21) | "ok" (valid, under 21) | "twenty" (20 counts as bust) | "bust" (> 21) | "undef"
  function classify(total) {
    if (!total) return "undef";
    var c = qcmp(total, Q21);
    if (c === 0) return "win";
    if (c > 0) return "bust";
    return qcmp(total, Q20) === 0 ? "twenty" : "ok";
  }
  function isValid(status) { return status === "win" || status === "ok"; }
  // env: plain integers {X, N, Y, V}
  function evalHand(hand, env) {
    var qe = { X: Q(env.X == null ? 1 : env.X), N: Q(env.N), V: Q(env.V == null ? 1 : env.V) };
    if (env.Y != null) qe.Y = Q(env.Y);
    var values = [], total = Q(0);
    for (var i = 0; i < hand.length; i++) {
      var v = evalQ(hand[i].ast, qe);
      values.push(v);
      total = total && v ? qadd(total, v) : null;
    }
    return { values: values, total: total, status: classify(total) };
  }
  function handVars(hand) {
    var out = {};
    hand.forEach(function (c) { for (var k in c.vars) out[k] = true; });
    return out;
  }
  function handIcons(hand) { return hand.reduce(function (s, c) { return s + c.icons; }, 0); }

  /* ============================= solver ============================= */
  // Searches whole-number X (and positive Y when a Y card is present) for exact 21s
  // and for the best valid total (<= 21, never exactly 20).
  function analyze(hand, ctx, opts) {
    opts = opts || {};
    var vars = handVars(hand), hasY = !!vars.Y;
    var xMax = vars.X ? (hasY ? Math.min(opts.xMax || 1000, opts.xMaxY || 200) : (opts.xMax || 1000)) : 1;
    var yMax = hasY ? (opts.yMax || 50) : 1, maxSol = opts.maxSolutions || 8;
    var env = { X: 1, N: hand.length, V: ctx.V || 1, Y: NaN };
    var sols = [], cands = [], x, y, s, i;
    for (y = 1; y <= yMax; y++) {
      if (hasY) env.Y = y;
      for (s = 1; s <= 2 * xMax; s++) {
        x = s & 1 ? (s + 1) >> 1 : -(s >> 1);                     // 1, -1, 2, -2, ...
        if (!vars.X && x < 0) continue;
        env.X = x;
        var f = 0, mag = 0;
        for (i = 0; i < hand.length; i++) { var v = hand[i].f(env); f += v; mag += Math.abs(v); }
        if (f !== f || !isFinite(f)) continue;
        var tol = 1e-9 * (1 + mag);
        if (f > 21 + tol) continue;
        cands.push([f, x, hasY ? y : null]);
        if (f >= 21 - tol && sols.length < maxSol * 3) {
          var ev = evalHand(hand, { X: x, Y: hasY ? y : null, N: env.N, V: env.V });
          if (ev.status === "win") sols.push({ x: x, y: hasY ? y : null });
        }
      }
    }
    sols.sort(function (a, b) { return (Math.abs(a.x) + (a.y || 0)) - (Math.abs(b.x) + (b.y || 0)); });
    cands.sort(function (a, b) { return b[0] - a[0]; });            // stable: simpler X first on ties
    var best = null, bestF = null;
    for (i = 0; i < cands.length && i < 200; i++) {
      if (bestF !== null && cands[i][0] < bestF - 1e-6) break;
      var e = evalHand(hand, { X: cands[i][1], Y: cands[i][2], N: env.N, V: env.V });
      if (!isValid(e.status)) continue;
      if (!best || qcmp(e.total, best.total) > 0) best = { x: cands[i][1], y: cands[i][2], total: e.total };
      if (bestF === null) bestF = cands[i][0];
    }
    return { solutions: sols.slice(0, maxSol), best: best, needsX: !!vars.X, needsY: hasY };
  }

  /* ============================ cards ============================ */
  function parseCSV(text) {
    text = String(text).replace(/\r\n?/g, "\n");
    var rows = [], row = [], field = "", q = false, i = 0, c;
    while (i < text.length) {
      c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { field += '"'; i += 2; continue; } q = false; i++; continue; }
        field += c; i++; continue;
      }
      if (c === '"') { q = true; i++; continue; }
      if (c === ",") { row.push(field); field = ""; i++; continue; }
      if (c === "\n") { row.push(field); field = ""; rows.push(row); row = []; i++; continue; }
      field += c; i++;
    }
    if (field !== "" || row.length) { row.push(field); rows.push(row); }
    return rows;
  }
  var SETS = { core: "Core", celebrity: "Celebrity", limited: "V & Y" };
  function loadCards(csvText) {
    var rows = parseCSV(csvText).filter(function (r) { return r.join("").trim(); });
    var head = rows.shift().map(function (h) { return h.trim().toLowerCase(); });
    var cards = [];
    rows.forEach(function (r) {
      function get(k) { var i = head.indexOf(k); return i < 0 || r[i] == null ? "" : String(r[i]).trim(); }
      var formula = get("formula");
      if (!formula) return;
      var ast;
      try { ast = parse(formula); } catch (e) { throw new Error("Card " + (get("id") || cards.length + 1) + ": " + e.message); }
      var level = Math.min(3, Math.max(1, parseInt(get("level"), 10) || 1));
      var set = SETS[get("set").toLowerCase()] ? get("set").toLowerCase() : "core";
      var card = {
        i: cards.length, id: get("id") || "card" + cards.length, set: set, level: level,
        formula: formula, name: get("name"), origin: get("origin"),
        ast: ast, vars: varsOf(ast), icons: level, f: compileF(ast), seq: ast.t === "fn" ? ast.f : null
      };
      card.r = render(ast);
      card.text = card.name || textOf(ast);
      cards.push(card);
    });
    return cards;
  }
  // cfg: {levels: [1,2,3], celebrity: bool, limited: bool}
  function deckIds(cards, cfg) {
    return cards.filter(function (c) {
      if (c.set === "celebrity") return !!cfg.celebrity;
      if (c.set === "limited" && !cfg.limited) return false;
      return cfg.levels.indexOf(c.level) >= 0;
    }).map(function (c) { return c.i; });
  }

  /* ---- formula rendering: AST -> HTML with stacked fractions & superscripts ---- */
  // Each result carries an estimated width (em) so cards can size the formula to fit,
  // plus the kind of glyph at each end so juxtaposition never reads ambiguously (2·3).
  var FN_TXT = { prime: "p", tri: "T", fib: "Fib", sigma: "σ", pidigit: "π", edigit: "e" };
  function paren(r) { return { h: '<span class="p">(</span>' + r.h + '<span class="p">)</span>', w: r.w + 0.7, L: "p", R: "p" }; }
  function isSum(n) { return n.t === "+" || n.t === "-"; }
  function rn(node) {
    var A, B, s;
    switch (node.t) {
      case "num": s = qstr(node.q); return { h: '<span class="n">' + esc(s) + "</span>", w: 0.56 * s.length, L: "d", R: "d" };
      case "var": return { h: '<i class="v">' + node.v + "</i>", w: 0.72, L: "v", R: "v" };
      case "fn":
        A = paren(rn(node.a)); s = FN_TXT[node.f];
        return { h: '<span class="fnm">' + esc(s) + "</span>" + A.h, w: 0.6 * s.length + A.w, L: "v", R: "p" };
      case "neg":
        A = rn(node.a); if (isSum(node.a)) A = paren(A);
        return { h: '<span class="o">' + MINUS + "</span>" + A.h, w: 0.62 + A.w, L: "o", R: A.R };
      case "+": case "-":
        var bn = node.b, op = node.t === "+" ? "+" : MINUS;
        if (node.t === "+" && bn.t === "neg") { op = MINUS; bn = bn.a; }
        A = rn(node.a); B = rn(bn);
        if (op === MINUS && (isSum(bn) || bn.t === "neg")) B = paren(B);
        return { h: A.h + '<span class="o b">' + op + "</span>" + B.h, w: A.w + 1.15 + B.w, L: A.L, R: B.R };
      case "*":
        A = rn(node.a); B = rn(node.b);
        if (isSum(node.a)) A = paren(A);
        if (isSum(node.b) || node.b.t === "neg") B = paren(B);
        var dot = B.L === "d" || (B.L === "f" && (A.R === "f" || A.R === "d"));   // never "3 ½X" or "2 3"
        return { h: A.h + (dot ? '<span class="o">·</span>' : "") + B.h, w: A.w + B.w + (dot ? 0.45 : 0.04), L: A.L, R: B.R };
      case "/":
        var num = node.a, sign = "";
        if (num.t === "neg") { sign = '<span class="o">' + MINUS + "</span>"; num = num.a; }
        A = rn(num); B = rn(node.b);
        return {
          h: sign + '<span class="fr"><span class="fr-n">' + A.h + '</span><span class="fr-d">' + B.h + "</span></span>",
          w: Math.max(A.w, B.w) * 0.94 + 0.3 + (sign ? 0.62 : 0), L: sign ? "o" : "f", R: "f"
        };
      case "^":
        A = rn(node.a); B = rn(node.b);
        var atom = node.a.t === "var" || node.a.t === "fn" || (node.a.t === "num" && node.a.q.n >= 0n && node.a.q.d === 1n);
        if (!atom) A = paren(A);
        return { h: A.h + '<sup class="ex">' + B.h + "</sup>", w: A.w + 0.62 * B.w + 0.05, L: A.L, R: "e" };
      case "!":
        A = rn(node.a); if (node.a.t !== "var" && node.a.t !== "num") A = paren(A);
        return { h: A.h + '<span class="o">!</span>', w: A.w + 0.32, L: A.L, R: "o" };
    }
  }
  function render(ast) { return rn(ast); }
  // plain-text version (aria labels, history)
  var SUP = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹" };
  function textOf(node) {
    function wrap(n) { var s = textOf(n); return isSum(n) || n.t === "neg" ? "(" + s + ")" : s; }
    switch (node.t) {
      case "num": return qstr(node.q);
      case "var": return node.v;
      case "fn": return node.f + "(" + textOf(node.a) + ")";
      case "neg": return MINUS + (isSum(node.a) ? "(" + textOf(node.a) + ")" : textOf(node.a));
      case "+": return textOf(node.a) + " + " + textOf(node.b);
      case "-": return textOf(node.a) + " " + MINUS + " " + wrap(node.b);
      case "*": return (isSum(node.a) ? "(" + textOf(node.a) + ")" : textOf(node.a)) + (node.b.t === "num" ? "·" : "") + wrap(node.b);
      case "/": return (isSum(node.a) ? "(" + textOf(node.a) + ")" : textOf(node.a)) + "/" +
        (node.b.t === "num" || node.b.t === "var" ? textOf(node.b) : "(" + textOf(node.b) + ")");
      case "^":
        var base = node.a.t === "var" || node.a.t === "num" ? textOf(node.a) : "(" + textOf(node.a) + ")";
        var ex = textOf(node.b);
        return base + (/^[0-9]+$/.test(ex) ? ex.split("").map(function (ch) { return SUP[ch]; }).join("") : "^" + ex);
      case "!": return (node.a.t === "var" || node.a.t === "num" ? textOf(node.a) : "(" + textOf(node.a) + ")") + "!";
    }
    return "";
  }

  /* ---- card faces ---- */
  var SHAPE_SVG = {
    tri: '<svg viewBox="0 0 10 10" class="sh sh-t"><polygon points="5,0.9 9.6,9.1 0.4,9.1"/></svg>',
    sq: '<svg viewBox="0 0 10 10" class="sh sh-s"><rect x="1" y="1" width="8" height="8" rx=".6"/></svg>',
    pent: '<svg viewBox="0 0 10 10" class="sh sh-p"><polygon points="5,0.5 9.6,3.9 7.8,9.4 2.2,9.4 0.4,3.9"/></svg>'
  };
  // Level 1: triangle; level 2: square + triangle; level 3: pentagon + square + triangle.
  function shapesHtml(level) {
    return (level >= 3 ? SHAPE_SVG.pent : "") + (level >= 2 ? SHAPE_SVG.sq : "") + SHAPE_SVG.tri;
  }
  var SEQ_INFO = {
    prime: "the Xth prime", tri: "the Xth triangle number", fib: "the Xth Fibonacci number",
    sigma: "the sum of the factors of X", pidigit: "the Xth digit of π after the point", edigit: "the Xth digit of e after the point"
  };
  function celebBody(card, terms) {
    var list = seqPreview(card.seq, terms || 12);
    var lead = card.seq === "pidigit" ? "3." : card.seq === "edigit" ? "2." : "";
    return '<div class="celeb"><div class="ct">' + esc(card.name || FN_TXT[card.seq] + "(X)") + "</div>" +
      '<div class="cs">' + (lead ? '<span class="lead">' + lead + "</span>" : "") +
      list.map(function (t) { return "<span>" + t + "</span>"; }).join("") + "<span>…</span></div></div>";
  }
  // o: {value: rational|null (badge), vcls, cls, attrs}
  function cardHtml(card, o) {
    o = o || {};
    var body = card.seq ? celebBody(card) :
      '<div class="fx" style="--fw:' + Math.max(1.6, card.r.w).toFixed(2) + '">' + card.r.h + "</div>";
    var badge = o.value !== undefined ? '<div class="val ' + (o.vcls || "") + '">' + (o.value ? qhtml(o.value) : "?") + "</div>" : "";
    return '<div class="card set-' + card.set + " lv" + card.level + (o.cls ? " " + o.cls : "") + '"' + (o.attrs || "") +
      ' role="img" aria-label="' + esc(card.text + ", level " + card.level) + '">' +
      '<span class="cn tl">' + shapesHtml(card.level) + '</span><span class="cn br">' + shapesHtml(card.level) + "</span>" +
      body + badge + "</div>";
  }

  /* ============================ RNG & deck ============================ */
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffle(arr, rng) {
    for (var i = arr.length - 1; i > 0; i--) { var j = Math.floor(rng() * (i + 1)), t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
    return arr;
  }
  function Deck(ids, rng) { this.rng = rng || Math.random; this.pile = shuffle(ids.slice(), this.rng); this.discard = []; this.reshuffles = 0; }
  // When the deck runs out, the discards are shuffled to form a new deck.
  Deck.prototype.draw = function () {
    if (!this.pile.length && this.discard.length) { this.pile = shuffle(this.discard, this.rng); this.discard = []; this.reshuffles++; }
    return this.pile.length ? this.pile.pop() : null;
  };
  Deck.prototype.toss = function (ids) { for (var i = 0; i < ids.length; i++) this.discard.push(ids[i]); };
  Deck.prototype.left = function () { return this.pile.length + this.discard.length; };

  /* ======================= single-player game ======================= */
  // Official solo rules: race to 21 difficulty icons in your score area. Mulligan any
  // time; draw up to 5 cards; there is no standing; V = 1 + hands in your score area.
  function Solo(cards, ids, opts) {
    opts = opts || {};
    this.cards = cards;
    this.target = opts.target || TARGET;
    this.maxHand = opts.maxHand || MAX_HAND;
    this.endless = !!opts.endless;
    this.deck = new Deck(ids, opts.rng);
    this.hand = []; this.scored = []; this.outOfPlay = [];
    this.icons = 0; this.done = false;
    this.stats = { calls: 0, wrong: 0, mulligans: 0, draws: 0, hands: 0 };
    this.deal();
  }
  Solo.prototype.handCards = function () { var c = this.cards; return this.hand.map(function (i) { return c[i]; }); };
  Solo.prototype.V = function () { return 1 + this.scored.length; };
  Solo.prototype.take = function () {
    var id = this.deck.draw();
    if (id === null && this.outOfPlay.length) {      // tiny custom decks only: recycle scored cards (points are banked)
      this.deck.toss(this.outOfPlay); this.outOfPlay = []; id = this.deck.draw();
    }
    return id;
  };
  Solo.prototype.deal = function () {
    this.hand = [];
    for (var k = 0; k < 2; k++) { var id = this.take(); if (id !== null) this.hand.push(id); }
    this.stats.hands++;
  };
  Solo.prototype.canDraw = function () {
    return !this.done && this.hand.length < this.maxHand && this.deck.left() + this.outOfPlay.length > 0;
  };
  Solo.prototype.draw = function () {
    if (!this.canDraw()) return null;
    var id = this.take();
    if (id === null) return null;
    this.hand.push(id); this.stats.draws++;
    return id;
  };
  Solo.prototype.mulligan = function () {
    if (this.done) return;
    this.deck.toss(this.hand); this.stats.mulligans++;
    this.deal();
  };
  Solo.prototype.check = function (x, y) {
    return evalHand(this.handCards(), { X: x, Y: y, N: this.hand.length, V: this.V() });
  };
  Solo.prototype.call = function (x, y) {
    var ev = this.check(x, y), hand = this.hand, cards = this.handCards();
    this.stats.calls++;
    if (ev.status !== "win") { this.stats.wrong++; return { ok: false, ev: ev }; }
    var icons = handIcons(cards);
    this.scored.push({ ids: hand.slice(), x: x, y: y, N: hand.length, V: this.V(), icons: icons });
    this.icons += icons;
    this.outOfPlay = this.outOfPlay.concat(hand);
    if (!this.endless && this.icons >= this.target) { this.done = true; this.hand = []; }
    else this.deal();
    return { ok: true, ev: ev, icons: icons, done: this.done, ids: hand.slice() };
  };

  /* ========================= duel rules & bot ========================= */
  // Multiplayer rules used by the duel: call 21 to win instantly (a wrong call knocks you out
  // of that game); stand to lock your total and start a 60s timer the other player must beat.
  // Ties go to the player who stood. Exactly 20 is bust, as is anything over 21.
  var BOTS = {
    easy:   { label: "Easy",   range: 6,  yMax: 6,  think: [15000, 24000], stand: 17 },
    medium: { label: "Medium", range: 15, yMax: 10, think: [8000, 14000],  stand: 18 },
    hard:   { label: "Hard",   range: 60, yMax: 20, think: [4000, 7000],   stand: 19 }
  };
  function botCfg(level) { return BOTS[level] || BOTS.medium; }
  // A bot "takes time to think" in proportion to how hard its hand looks.
  function botThinkMs(level, hand, rng) {
    var c = botCfg(level), t = c.think[0] + (rng || Math.random)() * (c.think[1] - c.think[0]);
    return Math.round(t * (0.6 + 0.12 * handIcons(hand)));
  }
  // opp: null, or {total} when the human has stood (the bot can't stand; it must beat that).
  function botDecide(hand, ctx, level, opp) {
    var c = botCfg(level);
    var an = analyze(hand, ctx, { xMax: c.range, yMax: c.yMax, maxSolutions: 1 });
    if (an.solutions.length) return { act: "call", x: an.solutions[0].x, y: an.solutions[0].y };
    var best = an.best, room = hand.length < MAX_HAND;
    var keep = best ? { x: best.x, y: best.y, total: best.total } : null;
    if (opp) {
      if (best && qcmp(best.total, opp.total) > 0) return extend({ act: "hold" }, keep);
      if (room) return { act: "draw" };
      return { act: "stuck" };
    }
    if (best && (!room || qnum(best.total) >= c.stand - 0.75 * (hand.length - 2))) return extend({ act: "stand" }, keep);
    return room ? { act: "draw" } : { act: "stuck" };
  }
  // After the human stands, the bot's whole reply is decided up front (the human is locked
  // and can't touch the deck), so the UI can replay it in real time or skip straight to the end.
  function botTimeline(cards, ids, draw, ctx, level, oppTotal, budgetMs, rng) {
    var events = [], t = 0, h = ids.slice();
    for (;;) {
      var hc = h.map(function (i) { return cards[i]; });
      t += botThinkMs(level, hc, rng);
      if (t > budgetMs) break;
      var d = botDecide(hc, ctx, level, { total: oppTotal });
      if (d.act === "draw") {
        var id = draw();
        if (id === null) break;
        h.push(id); events.push({ t: t, act: "draw", id: id });
        t += 700;
        continue;
      }
      events.push(extend({ t: t }, d));
      break;
    }
    return events;
  }
  function extend(a, b) { if (b) for (var k in b) a[k] = b[k]; return a; }

  var api = {
    MAX_HAND: MAX_HAND, TARGET: TARGET, STAND_MS: STAND_MS, BOTS: BOTS, SETS: SETS, MINUS: MINUS,
    Q: Q, qadd: qadd, qsub: qsub, qmul: qmul, qdiv: qdiv, qpow: qpow, qcmp: qcmp, qnum: qnum,
    qstr: qstr, qhtml: qhtml, qapprox: qapprox, esc: esc,
    seqTerm: seqTerm, seqPreview: seqPreview, SEQ_INFO: SEQ_INFO, piDigits: piDigits, eDigits: eDigits,
    parse: parse, evalQ: evalQ, compileF: compileF, render: render, textOf: textOf,
    classify: classify, isValid: isValid, evalHand: evalHand, handVars: handVars, handIcons: handIcons,
    analyze: analyze, parseCSV: parseCSV, loadCards: loadCards, deckIds: deckIds,
    cardHtml: cardHtml, celebBody: celebBody, shapesHtml: shapesHtml,
    mulberry32: mulberry32, shuffle: shuffle, Deck: Deck, Solo: Solo,
    botCfg: botCfg, botThinkMs: botThinkMs, botDecide: botDecide, botTimeline: botTimeline
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.X21 = api;
})(typeof window !== "undefined" ? window : this);
