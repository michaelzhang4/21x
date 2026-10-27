// Unit tests for the question generators and the 21X engine.   node build/test.js
// Every generated answer is re-derived independently from the rendered question.
var fs = require("fs");
var path = require("path");
var assert = require("assert");
var X21 = require("./cards.js");
var T = require("./lib.js");

var CARDS = X21.loadCards(fs.readFileSync(path.join(__dirname, "..", "data", "cards.csv"), "utf8"));
var CTX = { cards: CARDS };
var M = X21.MINUS;

var passed = 0;
function test(name, fn) {
  try { fn(); passed++; }
  catch (e) { console.error("FAIL " + name + "\n  " + (e && e.stack || e)); process.exitCode = 1; }
}

/* ---------------- 21X engine ---------------- */
function hand(list) {
  return list.map(function (f) { var c = CARDS.filter(function (k) { return k.formula === f; })[0]; if (!c) throw new Error("no card " + f); return c; });
}
test("rationals", function () {
  var h = X21.Q(6, 4);
  assert.strictEqual(h.n, 3n); assert.strictEqual(h.d, 2n);
  assert.strictEqual(X21.qstr(X21.qadd(X21.Q(1, 3), X21.Q(1, 6))), "0.5");
  assert.strictEqual(X21.qstr(X21.qpow(X21.Q(2), X21.Q(-3))), "0.125");
  assert.strictEqual(X21.qstr(X21.Q(62, 3)), "20 2/3");
  assert.strictEqual(X21.qstr(X21.Q(-7, 2)), M + "3.5");
  assert.strictEqual(X21.qdiv(X21.Q(1), X21.Q(0)), null);
  assert.ok(/mf/.test(X21.qhtml(X21.Q(62, 3))));
});
test("parser precedence", function () {
  function val(src, x, n) { return X21.qstr(X21.evalQ(X21.parse(src), { X: X21.Q(x), N: X21.Q(n || 2) })); }
  assert.strictEqual(val("-X^2", 3), M + "9");
  assert.strictEqual(val("2^-X", 2), "0.25");
  assert.strictEqual(val("4N/X", 3, 3), "4");
  assert.strictEqual(val("36/(NX)", 2, 3), "6");
  assert.strictEqual(val("1+X(N-2)", 5, 4), "11");
  assert.strictEqual(val("2X²", 3), "18");
  assert.strictEqual(val("3 × 4 − 2", 1), "10");
  assert.throws(function () { X21.parse("2Z"); });
  assert.throws(function () { X21.parse("(X+1"); });
  assert.throws(function () { X21.parse("prime(X)"); });
});
test("all 54 core cards parse and round-trip through their text form", function () {
  assert.strictEqual(CARDS.length, 54);
  CARDS.forEach(function (c) {
    var again = X21.parse(X21.textOf(c.ast));
    for (var x = -6; x <= 6; x++) for (var n = 2; n <= 3; n++) {
      var env = { X: X21.Q(x), N: X21.Q(n) }, a = X21.evalQ(c.ast, env), b = X21.evalQ(again, env);
      assert.strictEqual(a && X21.qstr(a), b && X21.qstr(b), c.formula);
    }
    assert.ok(c.r.h && c.r.w > 0 && /class="card/.test(X21.cardHtml(c)));
  });
});
test("rulebook example 6X + (2X + 4) + X/2", function () {
  var h = hand(["6X", "2X+4", "X/2"]);
  assert.strictEqual(X21.qstr(X21.evalHand(h, 4).total), "38");
  assert.strictEqual(X21.qstr(X21.evalHand(h, 1).total), "12.5");
  assert.deepStrictEqual(X21.solveX(h, 30), [2]);
  assert.ok(X21.makes21(h, 2) && !X21.makes21(h, 0) && !X21.makes21(h, 2.5));
  var lf = X21.linearForm(h);
  assert.strictEqual(X21.qstr(lf.a), "8.5"); assert.strictEqual(X21.qstr(lf.b), "4");
  assert.strictEqual(X21.linearForm(hand(["X^2", "4"])), null, "X² is not linear");
  assert.strictEqual(X21.linearForm(hand(["24/X", "4"])), null, "24/X is not linear");
  assert.deepStrictEqual(X21.solveX(hand(["X^2", "N^2"]), 30), [], "X² + 4 = 21 has no whole X");
  assert.deepStrictEqual(X21.solveX(hand(["X^2", "5N"]), 30), [], "X² + 10 = 21: none");
  assert.deepStrictEqual(X21.solveX(hand(["X^2", "N-1"]), 30), [], "X² + 1: none");
  assert.deepStrictEqual(X21.solveX(hand(["X^2", "4", "N-1"]), 30), [], "X² + 6: none");
  assert.deepStrictEqual(X21.solveX(hand(["X^2", "N/2"]), 30), [], "X² + 1: none");
  assert.deepStrictEqual(X21.solveX(hand(["X^2", "-5", "10"]), 30), [4, -4], "X² + 5 = 21: both signs, positive first");
});

/* ---------------- independent answer checks ---------------- */
// rendered question HTML -> plain text that JS can evaluate
function plain(h) {
  return String(h)
    .replace(/<span class="fr"><span class="fr-n">(.*?)<\/span><span class="fr-d">(.*?)<\/span><\/span>/g, "(($1)/($2))")
    .replace(/<sup[^>]*>(.*?)<\/sup>/g, "^($1)").replace(/<sub>(.*?)<\/sub>/g, "_$1")
    .replace(/<[^>]+>/g, "").replace(/&amp;/g, "&")
    .replace(/−/g, "-").replace(/×/g, "*").replace(/÷/g, "/").replace(/·/g, "*");
}
function calc(expr, vars) {
  var src = expr.replace(/\^/g, "**").replace(/(\d)\s*([a-zA-Z(])/g, "$1*$2").replace(/\)\s*\(/g, ")*(");
  if (!/^[0-9+\-*/(). xyk]*$/.test(src)) throw new Error("not arithmetic: " + expr);
  vars = vars || {};
  return Function("x", "y", "k", "return " + src)(vars.x, vars.y, vars.k);
}
function cells(h) {                           // every numeric / symbolic matrix cell, in reading order
  var out = [], mats = String(h).split(/<span class="mat/).slice(1);
  mats.forEach(function (chunk) {
    var body = chunk.slice(chunk.indexOf(">") + 1), depth = 0, cur = "", i = 0;
    // walk the direct <span> children of this matrix
    while (i < body.length) {
      if (body.startsWith("<span", i)) { if (depth === 0) cur = ""; else cur += body.slice(i, body.indexOf(">", i) + 1); depth++; i = body.indexOf(">", i) + 1; continue; }
      if (body.startsWith("</span>", i)) { depth--; if (depth === 0) out.push(plain(cur).trim()); else if (depth < 0) break; else cur += "</span>"; i += 7; continue; }
      cur += body[i]; i++;
    }
  });
  return out;
}
function nums(h) { return cells(h).map(Number); }
function det2(a) { return a[0] * a[3] - a[1] * a[2]; }
function sarrus(m) {
  return m[0] * m[4] * m[8] + m[1] * m[5] * m[6] + m[2] * m[3] * m[7] - m[2] * m[4] * m[6] - m[0] * m[5] * m[7] - m[1] * m[3] * m[8];
}
function idx(label) { var mm = plain(label).match(/entry \(?(\d)(?:, (\d))?/); return mm ? [+mm[1] - 1, mm[2] ? +mm[2] - 1 : null] : null; }
function matDet(A) {                          // float determinant by elimination
  var n = A.length, a = A.map(function (r) { return r.slice(); }), d = 1;
  for (var i = 0; i < n; i++) {
    var p = i; while (p < n && Math.abs(a[p][i]) < 1e-12) p++;
    if (p === n) return 0;
    if (p !== i) { var t = a[p]; a[p] = a[i]; a[i] = t; d = -d; }
    d *= a[i][i];
    for (var r = i + 1; r < n; r++) { var f = a[r][i] / a[i][i]; for (var c = i; c < n; c++) a[r][c] -= f * a[i][c]; }
  }
  return d;
}
function matMul(A, B) { return A.map(function (r) { return B[0].map(function (_, j) { return r.reduce(function (s, x, k) { return s + x * B[k][j]; }, 0); }); }); }
function diag(n, d) { var A = []; for (var i = 0; i < n; i++) { A.push([]); for (var j = 0; j < n; j++) A[i].push(i === j ? (i === 0 ? d : 1) : 0); } return A; }

var CHECK = {
  // mental maths: evaluate the expression (or the words) as written
  add: function (q) { return calc(plain(q.html)); },
  sub: function (q) { return calc(plain(q.html)); },
  mul: function (q) { return calc(plain(q.html)); },
  div: function (q) { return calc(plain(q.html)); },
  ops: function (q) { return calc(plain(q.html)); },
  near: function (q) { return calc(plain(q.html)); },
  neg: function (q) { return calc(plain(q.html)); },
  sq: function (q) { return calc(plain(q.html)); },
  pow: function (q) { return calc(plain(q.html)); },
  sqrt: function (q) { return Math.sqrt(+plain(q.html).replace("√", "")); },
  pct: function (q) {
    var p = plain(q.html), mm = p.match(/^(\d+)% of (\d+)$/);
    if (mm) return mm[1] * mm[2] / 100;
    mm = p.match(/^(\d+) (increased|decreased) by (\d+)%$/);
    return +mm[1] * (1 + (mm[2] === "increased" ? 1 : -1) * mm[3] / 100);
  },
  frac: function (q) { var mm = plain(q.html).match(/^\(\((\d+)\)\/\((\d+)\)\) of (\d+)$/); return mm[1] * mm[3] / mm[2]; },
  series: function (q) {
    var p = plain(q.html).replace(/\s/g, ""), mm = p.match(/^(\d+)\+(\d+)\+(\d+)\+⋯\+(\d+)$/), s = 0;
    for (var k = +mm[1]; k <= +mm[4]; k += mm[2] - mm[1]) s += k;
    return s;
  },
  mod: function (q) { var mm = plain(q.html).match(/^(\d+)\/(\d+)$/); return mm[1] % mm[2]; },
  mean: function (q) { var vs = plain(q.html).replace("mean of ", "").split(", ").map(Number); return vs.reduce(function (s, x) { return s + x; }, 0) / vs.length; },
  half: function (q) { var p = plain(q.html), mm = p.match(/(\d+)$/); return /double/.test(p) ? 2 * mm[1] : mm[1] / 2; },

  // linear algebra
  lin1: solveLinear, lin2: solveLinear,
  sys: function (q) {
    var parts = q.html.split("</span><span>").map(plain);               // the two equations
    var E = parts.map(function (s) { var lr = s.split("="); return function (x, y) { return calc(lr[0], { x: x, y: y }) - calc(lr[1], { x: x, y: y }); }; });
    var c = E.map(function (e) { var z = e(0, 0); return [e(1, 0) - z, e(0, 1) - z, -z]; });
    var D = c[0][0] * c[1][1] - c[0][1] * c[1][0];
    assert.ok(D !== 0, "singular system");
    var x = (c[0][2] * c[1][1] - c[0][1] * c[1][2]) / D, y = (c[0][0] * c[1][2] - c[0][2] * c[1][0]) / D;
    return /y/.test(plain(q.label)) ? y : x;
  },
  line: function (q) {
    var p = plain(q.html), pts = p.match(/\((-?\d+), (-?\d+)\)and\((-?\d+), (-?\d+)\)/);
    if (pts) return (pts[4] - pts[2]) / (pts[3] - pts[1]);
    var f = p.match(/f\((-?\d+)\)=(-?\d+)f\((-?\d+)\)=(-?\d+)/), s = +plain(q.label).match(/f\((-?\d+)\)/)[1];
    var m = (f[4] - f[2]) / (f[3] - f[1]);
    return +f[2] + m * (s - f[1]);
  },
  sing: function (q) {
    var c = cells(q.html), K = q.answer;
    function D(k) { var v = c.map(function (s) { return calc(s, { k: k }); }); return det2(v); }
    assert.strictEqual(D(K), 0, "det at the answer");
    if (c.filter(function (s) { return /k/.test(s); }).length === 1) { assert.notStrictEqual(D(K + 1), 0, "unique k"); return K; }
    // quadratic in k: the answer must be the only positive root
    var g = D(0), other = g / K;
    assert.ok(K > 0 && other <= 0 && D(other) === 0, "positive root " + K + ", other " + other);
    return K;
  },
  x21: function (q) {
    var sols = X21.solveX(q.cards, 60);
    assert.ok(sols.indexOf(q.answer) >= 0 && sols.length <= 2, "21X solutions " + sols);
    for (var x = -60; x <= 60; x++) assert.strictEqual(T.isRight(q, x), sols.indexOf(x) >= 0, "X = " + x + " accepted iff it makes 21");
    assert.strictEqual(q.cards.length, q.tier === 2 ? 2 : 3);
    return q.answer;
  },
  dot: function (q) { var c = nums(q.html), n = c.length / 2, s = 0; for (var i = 0; i < n; i++) s += c[i] * c[n + i]; return s; },
  comb: function (q) {
    var c = nums(q.html), n = c.length / 2, mm = plain(q.label).match(/^\((-?\d*)u ?([+-]) ?(\d*)v\)_(\d)$/);
    var al = mm[1] === "" ? 1 : mm[1] === "-" ? -1 : +mm[1], be = (mm[2] === "-" ? -1 : 1) * (mm[3] === "" ? 1 : +mm[3]), i = mm[4] - 1;
    return al * c[i] + be * c[n + i];
  },
  det2: function (q) { return det2(nums(q.html)); },
  det3: function (q) { return sarrus(nums(q.html)); },
  matvec: function (q) {
    var c = nums(q.html), n = c.length === 6 ? 2 : 3, i = idx(q.label)[0], s = 0;
    for (var k = 0; k < n; k++) s += c[i * n + k] * c[n * n + k];
    return s;
  },
  matmul: function (q) {
    var c = nums(q.html), n = c.length === 8 ? 2 : 3, ij = idx(q.label), s = 0;
    for (var k = 0; k < n; k++) s += c[ij[0] * n + k] * c[n * n + k * n + ij[1]];
    return s;
  },
  trace: function (q) {
    var c = nums(q.html);
    if (c.length === 4) { var A = [[c[0], c[1]], [c[2], c[3]]], A2 = matMul(A, A); return A2[0][0] + A2[1][1]; }
    var P = matMul([[c[0], c[1]], [c[2], c[3]]], [[c[4], c[5]], [c[6], c[7]]]);
    return P[0][0] + P[1][1];
  },
  eig: function (q) {
    var c = nums(q.html), tr = c[0] + c[3], dt = det2(c), disc = tr * tr - 4 * dt, r = Math.sqrt(disc);
    assert.ok(Number.isInteger(r) && r > 0, "distinct whole eigenvalues");
    return /Larger/.test(q.prompt) ? (tr + r) / 2 : (tr - r) / 2;
  },
  inv: function (q) {
    var c = nums(q.html), d = det2(c), ij = idx(q.label);
    assert.ok(Math.abs(d) === 1, "det ±1");
    return [[c[3] / d, -c[1] / d], [-c[2] / d, c[0] / d]][ij[0]][ij[1]];
  },
  norm: function (q) { return Math.sqrt(nums(q.html).reduce(function (s, x) { return s + x * x; }, 0)); },
  cross: function (q) {
    var c = nums(q.html), u = c.slice(0, 3), v = c.slice(3), k = idx(q.label)[0];
    return [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]][k];
  },
  detprop: function (q) {
    // build real matrices with those determinants and multiply them out
    var p = plain(q.html), n = +p.match(/(\d) \* \d/)[1];
    var dA = +p.match(/det A=(-?\d+)/)[1], mB = p.match(/det B=(-?\d+)/), dB = mB ? +mB[1] : 1;
    var A = diag(n, dA), B = diag(n, dB), lab = plain(q.label).replace(/^det\((.*)\)$/, "$1");
    var mm = lab.match(/^(-?\d*)(.*)$/), k = mm[1] === "" ? 1 : mm[1] === "-" ? -1 : +mm[1], rest = mm[2];
    var P = diag(n, 1), re = /([AB])(\^\((T|-1|2)\))?/g, f;
    A[n - 1][0] = 3;                           // not diagonal, so the transpose really differs
    while ((f = re.exec(rest))) {
      var X = f[1] === "A" ? A : B, e = f[3];
      if (e === "T") X = X[0].map(function (_, j) { return X.map(function (r) { return r[j]; }); });
      if (e === "2") X = matMul(X, X);
      if (e === "-1") X = inverse(X);
      P = matMul(P, X);
    }
    return Math.round(matDet(P.map(function (r) { return r.map(function (x) { return k * x; }); })) * 1e6) / 1e6;
  }
};
function inverse(A) {                         // Gauss-Jordan, floats
  var n = A.length, a = A.map(function (r, i) { return r.concat(diag(n, 1)[i]); });
  for (var i = 0; i < n; i++) {
    var p = i; while (Math.abs(a[p][i]) < 1e-12) p++;
    var t = a[p]; a[p] = a[i]; a[i] = t;
    var d = a[i][i]; a[i] = a[i].map(function (x) { return x / d; });
    for (var r = 0; r < n; r++) if (r !== i) { var f = a[r][i]; a[r] = a[r].map(function (x, c) { return x - f * a[i][c]; }); }
  }
  return a.map(function (r) { return r.slice(n); });
}
function solveLinear(q) {
  var lr = plain(q.html).split("=");
  function f(x) { return calc(lr[0], { x: x }) - calc(lr[1], { x: x }); }
  assert.ok(Math.abs(f(q.answer)) < 1e-9, "x = " + q.answer + " solves " + plain(q.html));
  assert.ok(Math.abs(f(q.answer + 1)) > 1e-9, "unique solution");
  return q.answer;
}

var SEEDS = 400;
function seedOf(s) {                          // FNV-1a, to spread test seeds
  var h = 0x811c9dc5;
  for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
test("every template, every tier: answers re-derived independently", function () {
  [["mental", T.MENTAL], ["linear", T.LINEAR]].forEach(function (pair) {
    pair[1].forEach(function (tpl) {
      assert.ok(CHECK[tpl.type], "no checker for " + tpl.type);
      tpl.tiers.forEach(function (tier) {
        for (var s = 1; s <= SEEDS; s++) {
          var r = T.mulberry32(seedOf(tpl.type + tier + ":" + s));
          var q = tpl.gen(r, tier, CTX);
          q.type = tpl.type; q.tier = tier; if (q.label === undefined) q.label = "";
          var where = tpl.type + " t" + tier + " seed " + s + ": " + plain(q.html) + " [" + plain(q.label) + "] = " + q.answer;
          assert.ok(Number.isSafeInteger(q.answer) && Math.abs(q.answer) < 1e6, "whole answer that fits the keypad: " + where);
          [q.prompt, q.html, q.why, q.label].forEach(function (s2) { assert.ok(!/NaN|undefined|Infinity|null|\[object/.test(s2), "bad text in " + where + ": " + s2); });
          assert.ok(q.prompt && q.html && q.why, where);
          var expect = CHECK[tpl.type](q);
          assert.ok(Math.abs(expect - q.answer) < 1e-9, where + " but re-derived " + expect);
          assert.ok(T.isRight(q, q.answer) && !T.isRight(q, null), where);
          if (!q.check) assert.ok(!T.isRight(q, q.answer + 1) && !T.isRight(q, -q.answer - 1 || 7), where);
          assert.ok(plain(q.why).indexOf(plain(q.answer < 0 ? M + -q.answer : String(q.answer))) >= 0, "working mentions the answer: " + where + " | " + plain(q.why));
        }
      });
    });
  });
});

/* ---------------- rounds ---------------- */
test("every question type has a unique name and id", function () {
  var all = T.MENTAL.concat(T.LINEAR), names = all.map(function (t) { return t.label; }), ids = all.map(function (t) { return t.type; });
  all.forEach(function (t) { assert.ok(typeof t.label === "string" && t.label.length > 2, t.type + " has a name"); });
  assert.strictEqual(new Set(names).size, names.length, "names are unique");
  assert.strictEqual(new Set(ids).size, ids.length, "ids are unique across both rounds (Settings keeps one list)");
});
test("every type on: 10 different questions on the ramp, repeatable from the seed", function () {
  ["mental", "linear"].forEach(function (cat) {
    Object.keys(T.RAMPS).forEach(function (diff) {
      for (var s = 0; s < 150; s++) {
        var opts = { diff: diff, seed: seedOf(cat + diff + s), cards: CARDS };
        var a = T.makeRound(cat, opts), b = T.makeRound(cat, opts);
        assert.strictEqual(a.length, T.ROUND);
        a.forEach(function (q, k) {
          assert.strictEqual(q.tier, T.RAMPS[diff][k], "follows the ramp");
          assert.strictEqual(q.n, k + 1);
          assert.strictEqual(q.html, b[k].html, "same seed, same questions");
        });
        var types = a.map(function (q) { return q.type; });
        assert.strictEqual(new Set(types).size, T.ROUND, cat + " " + diff + " repeats a type: " + types);
        if (cat === "linear") {
          var eqs = a.filter(function (q) { return q.fam === "eq"; }).length;
          assert.ok(eqs >= 4 && eqs <= 6, "equations and matrices stay balanced: " + eqs);
        }
      }
    });
  });
  var x = T.makeRound("mental", { seed: 1 }), y = T.makeRound("mental", { seed: 2 });
  assert.notDeepStrictEqual(x.map(function (q) { return q.html; }), y.map(function (q) { return q.html; }), "a new seed, a new round");
});
test("picked types only: each one comes up, shared evenly, easiest first", function () {
  var rng = T.mulberry32(99);
  ["mental", "linear"].forEach(function (cat) {
    var list = T.CATS[cat].list;
    Object.keys(T.RAMPS).forEach(function (diff) {
      for (var s = 0; s < 150; s++) {
        var types = T.shuffle(list.map(function (t) { return t.type; }), rng).slice(0, 1 + Math.floor(rng() * 12));
        var qs = T.makeRound(cat, { diff: diff, seed: seedOf("pick" + cat + diff + s), cards: CARDS, types: types }), seen = {};
        assert.strictEqual(qs.length, T.ROUND);
        qs.forEach(function (q, i) {
          assert.ok(types.indexOf(q.type) >= 0, "only picked types: " + q.type + " not in " + types);
          assert.ok(list.filter(function (t) { return t.type === q.type; })[0].tiers.indexOf(q.tier) >= 0, "a tier " + q.type + " has");
          if (i) assert.ok(q.tier >= qs[i - 1].tier, "easiest first");
          seen[q.type] = (seen[q.type] || 0) + 1;
        });
        if (types.length <= T.ROUND) {
          types.forEach(function (t) { assert.ok(seen[t] >= 1, t + " was picked but never came up (" + diff + ")"); });
          var counts = Object.keys(seen).map(function (t) { return seen[t]; });
          assert.ok(Math.max.apply(null, counts) - Math.min.apply(null, counts) <= 1, "shared evenly: " + JSON.stringify(seen));
        }
      }
    });
  });
  var both = T.MENTAL.concat(T.LINEAR);
  Object.keys(T.RAMPS).forEach(function (diff) {
    for (var s = 0; s < 150; s++) {
      var types = T.shuffle(both.map(function (t) { return t.type; }), rng).slice(0, 1 + Math.floor(rng() * 20));
      var qs = T.makeRound("all", { diff: diff, seed: seedOf("all" + diff + s), cards: CARDS, types: types }), seen = {};
      assert.strictEqual(qs.length, T.ROUND);
      qs.forEach(function (q, i) {
        assert.ok(types.indexOf(q.type) >= 0, "only picked types: " + q.type + " not in " + types);
        if (i) assert.ok(q.tier >= qs[i - 1].tier, "easiest first");
        seen[q.type] = true;
      });
      if (types.length <= T.ROUND) types.forEach(function (t) { assert.ok(seen[t], t + " was picked but never came up in a mixed round"); });
    }
  });
  var mix = T.makeRound("all", { diff: "standard", seed: 11, cards: CARDS, types: ["add", "eig"] });
  assert.ok(mix.some(function (q) { return q.type === "add"; }) && mix.some(function (q) { return q.type === "eig"; }), "a mixed round draws from both lists");
  var eig = T.makeRound("linear", { diff: "gentle", seed: 3, types: ["eig"] });
  assert.ok(eig.length === T.ROUND && eig.every(function (q) { return q.type === "eig" && q.tier === 3; }), "a hard-only type still fills a gentle round");
  assert.deepStrictEqual(T.makeRound("linear", { seed: 1, cards: CARDS, types: [] }), [], "nothing picked, no round");
  assert.deepStrictEqual(T.makeRound("linear", { seed: 1, types: ["x21"] }), [], "21X hands need the deck");
  var noCards = T.makeRound("linear", { diff: "standard", seed: 5 });
  assert.ok(noCards.length === T.ROUND && noCards.every(function (q) { return q.type !== "x21"; }), "without the deck the 21X hands are left out");
});

console.log(passed + " tests passed" + (process.exitCode ? " (with failures above)" : ""));

/* ---------------- informational ---------------- */
var t0 = Date.now(), n = 0;
for (var s = 0; s < 200; s++) { T.makeRound("linear", { diff: "spicy", seed: s, cards: CARDS }); T.makeRound("mental", { diff: "spicy", seed: s }); n += 2; }
console.log("\nmakeRound(): " + ((Date.now() - t0) / n).toFixed(2) + " ms per round");
console.log("\nAnswer ranges per template (tier: min..max):");
[T.MENTAL, T.LINEAR].forEach(function (list) {
  list.forEach(function (tpl) {
    console.log("  " + (tpl.type + "        ").slice(0, 9) + tpl.tiers.map(function (tier) {
      var lo = Infinity, hi = -Infinity;
      for (var s2 = 1; s2 <= 300; s2++) { var q = tpl.gen(T.mulberry32(s2 * 7919 + tier), tier, CTX); lo = Math.min(lo, q.answer); hi = Math.max(hi, q.answer); }
      return "t" + tier + ": " + lo + ".." + hi;
    }).join("   "));
  });
});
