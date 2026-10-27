/* Train of Thought - the 21X card engine (no DOM): exact rationals, the card formula
   parser/renderer and the "find X so the hand makes 21" solver. Powers the 21X hand
   questions in the linear algebra round. Used by Node tests and inlined into the HTML. */
(function (global) {
  "use strict";

  var TARGET = 21;

  /* ========================= exact rationals ========================= */
  // Card values can be fractions (X/2, 4X/N, 24/X ...), so anything that decides a
  // right answer is computed exactly with BigInt rationals {n, d}: d > 0, fully reduced.
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
  function qeq(a, b) { return !!a && !!b && a.n === b.n && a.d === b.d; }
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
  // "12", "−3", "12.5", "20 2/3"
  function qstr(a) {
    if (!a) return "?";
    var n = babs(a.n), d = a.d;
    var s = d === 1n ? n.toString() : decimalOf(n, d) || ((n / d ? (n / d) + " " : "") + (n % d) + "/" + d);
    return (a.n < 0n ? MINUS : "") + s;
  }
  // same as qstr, but non-terminating fractions become a small stacked fraction
  function qhtml(a) {
    if (!a) return "?";
    var n = babs(a.n), d = a.d;
    if (d === 1n || decimalOf(n, d)) return esc(qstr(a));
    var ip = n / d;
    return (a.n < 0n ? MINUS : "") + (ip ? ip.toString() : "") +
      '<span class="mf"><span>' + (n % d) + "</span><span>" + d + "</span></span>";
  }

  /* ======================== formula parser ======================== */
  // Card formulas are written the way they are printed: 2X+4, 4N/X, X(N+2), (X-N)^2.
  // Juxtaposition multiplies; ^ binds tighter than unary minus (-X^2 = -(X^2)).
  var VARS = { X: 1, N: 1 };
  var OPS = { "+": "+", "-": "-", "−": "-", "–": "-", "*": "*", "×": "*", "·": "*", "/": "/", "÷": "/", "^": "^", "(": "(", ")": ")" };
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
        word = s.slice(i, j);
        for (var m = 0; m < word.length; m++) {                  // "NX" is N times X
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
      var base = primary();
      if (isOp("^")) { p++; return { t: "^", a: base, b: unary() }; }
      return base;
    }
    function primary() {
      var t = toks[p];
      if (!t) throw new Error("Unexpected end of \"" + src + "\"");
      p++;
      if (t.k === "num") return { t: "num", q: parseNum(t.v) };
      if (t.k === "var") return { t: "var", v: t.v };
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
  // Exact evaluation (env values are rationals). null = undefined (÷0 ...)
  function evalQ(node, env) {
    var x, y;
    switch (node.t) {
      case "num": return node.q;
      case "var": return env[node.v] || null;
      case "neg": x = evalQ(node.a, env); return x && qneg(x);
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
  // N is the number of cards in the hand. -> {values: [rational|null], total: rational|null}
  function evalHand(hand, x) {
    var env = { X: Q(x), N: Q(hand.length) }, values = [], total = Q(0);
    for (var i = 0; i < hand.length; i++) {
      var v = evalQ(hand[i].ast, env);
      values.push(v);
      total = total && v ? qadd(total, v) : null;
    }
    return { values: values, total: total };
  }
  var Q21 = Q(TARGET);
  function makes21(hand, x) { return x !== 0 && Math.floor(x) === x && qeq(evalHand(hand, x).total, Q21); }
  // Every whole X in [-xMax, xMax] (never 0) that makes exactly 21: smallest |X| first, positive first.
  function solveX(hand, xMax) {
    var out = [];
    for (var k = 1; k <= xMax; k++) { if (makes21(hand, k)) out.push(k); if (makes21(hand, -k)) out.push(-k); }
    return out;
  }
  // {a, b} when the hand's total is a X + b for every X, else null. Cards are at most
  // degree 3 in X (with at most X in the denominator), so agreeing on 6 points proves it.
  function linearForm(hand) {
    var t = [];
    for (var x = 1; x <= 6; x++) { var ev = evalHand(hand, x).total; if (!ev) return null; t.push(ev); }
    var a = qsub(t[1], t[0]);
    for (var i = 2; i < t.length; i++) if (!qeq(qsub(t[i], t[i - 1]), a)) return null;
    return { a: a, b: qsub(t[0], a) };
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
      var card = {
        i: cards.length, id: get("id") || "card" + cards.length, level: Math.min(3, Math.max(1, parseInt(get("level"), 10) || 1)),
        formula: formula, origin: get("origin"), ast: ast, vars: varsOf(ast)
      };
      card.r = render(ast);
      card.text = textOf(ast);
      cards.push(card);
    });
    return cards;
  }

  /* ---- formula rendering: AST -> HTML with stacked fractions & superscripts ---- */
  // Each result carries an estimated width (em) so cards can size the formula to fit,
  // plus the kind of glyph at each end so juxtaposition never reads ambiguously (2·3).
  function paren(r) { return { h: '<span class="p">(</span>' + r.h + '<span class="p">)</span>', w: r.w + 0.7, L: "p", R: "p" }; }
  function isSum(n) { return n.t === "+" || n.t === "-"; }
  function rn(node) {
    var A, B, s;
    switch (node.t) {
      case "num": s = qstr(node.q); return { h: '<span class="n">' + esc(s) + "</span>", w: 0.56 * s.length, L: "d", R: "d" };
      case "var": return { h: '<i class="v">' + node.v + "</i>", w: 0.72, L: "v", R: "v" };
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
        var atom = node.a.t === "var" || (node.a.t === "num" && node.a.q.n >= 0n && node.a.q.d === 1n);
        if (!atom) A = paren(A);
        return { h: A.h + '<sup class="ex">' + B.h + "</sup>", w: A.w + 0.62 * B.w + 0.05, L: A.L, R: "e" };
    }
  }
  function render(ast) { return rn(ast); }
  // plain-text version (aria labels)
  var SUP = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹" };
  function textOf(node) {
    function wrap(n) { var s = textOf(n); return isSum(n) || n.t === "neg" ? "(" + s + ")" : s; }
    switch (node.t) {
      case "num": return qstr(node.q);
      case "var": return node.v;
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
  // o: {value: rational|null (badge), vcls}
  function cardHtml(card, o) {
    o = o || {};
    var badge = o.value !== undefined ? '<div class="val ' + (o.vcls || "") + '">' + (o.value ? qhtml(o.value) : "?") + "</div>" : "";
    return '<div class="card lv' + card.level + '" role="img" aria-label="' + esc(card.text) + '">' +
      '<span class="cn tl">' + shapesHtml(card.level) + '</span><span class="cn br">' + shapesHtml(card.level) + "</span>" +
      '<div class="fx" style="--fw:' + Math.max(1.6, card.r.w).toFixed(2) + '">' + card.r.h + "</div>" + badge + "</div>";
  }

  var api = {
    TARGET: TARGET, MINUS: MINUS,
    Q: Q, qadd: qadd, qsub: qsub, qmul: qmul, qdiv: qdiv, qpow: qpow, qeq: qeq, qstr: qstr, qhtml: qhtml, esc: esc,
    parse: parse, evalQ: evalQ, render: render, textOf: textOf,
    evalHand: evalHand, makes21: makes21, solveX: solveX, linearForm: linearForm,
    parseCSV: parseCSV, loadCards: loadCards, cardHtml: cardHtml, shapesHtml: shapesHtml
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.X21 = api;
})(typeof window !== "undefined" ? window : this);
