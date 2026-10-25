// Unit tests for the pure game logic + deck statistics.   node build/test.js
var fs = require("fs");
var path = require("path");
var assert = require("assert");
var G = require("./lib.js");

var CARDS = G.loadCards(fs.readFileSync(path.join(__dirname, "..", "data", "cards.csv"), "utf8"));
var byFormula = {};
CARDS.forEach(function (c) { byFormula[c.formula] = c; });
function card(f) { if (!byFormula[f]) throw new Error("no card " + f); return byFormula[f]; }
function hand(list) { return list.map(card); }
function total(list, env) { return G.qstr(G.evalHand(hand(list), env).total); }

var passed = 0;
function test(name, fn) {
  try { fn(); passed++; }
  catch (e) { console.error("FAIL " + name + "\n  " + (e && e.stack || e)); process.exitCode = 1; }
}
var M = G.MINUS;

/* ---------------- rationals & formatting ---------------- */
test("rationals", function () {
  var h = G.Q(6, 4);
  assert.strictEqual(h.n, 3n); assert.strictEqual(h.d, 2n);
  assert.strictEqual(G.qstr(G.qadd(G.Q(1, 3), G.Q(1, 6))), "0.5");
  assert.strictEqual(G.qstr(G.qpow(G.Q(2), G.Q(-3))), "0.125");
  assert.strictEqual(G.qstr(G.Q(62, 3)), "20 2/3");
  assert.strictEqual(G.qstr(G.Q(-7, 2)), M + "3.5");
  assert.strictEqual(G.qstr(G.Q(2, 3)), "2/3");
  assert.strictEqual(G.qdiv(G.Q(1), G.Q(0)), null);
  assert.strictEqual(G.qpow(G.Q(0), G.Q(-1)), null);
  assert.strictEqual(G.qpow(G.Q(-1), G.Q(1000001)).n, -1n);
  assert.strictEqual(G.qpow(G.Q(3), G.Q(100000)), null, "absurdly large powers give up");
  assert.ok(/mf/.test(G.qhtml(G.Q(62, 3))));
});

/* ---------------- celebrity sequences ---------------- */
// independent digit generators to cross-check lib.js
function piGauss(D) {             // pi = 48 atan(1/18) + 32 atan(1/57) - 20 atan(1/239)
  var scale = 10n ** BigInt(D + 15);
  function atanInv(x) {
    x = BigInt(x);
    var sum = 0n, pow = scale / x, k = 0n, x2 = x * x;
    while (pow) { sum += (k % 2n ? -1n : 1n) * pow / (2n * k + 1n); pow /= x2; k++; }
    return sum;
  }
  return (48n * atanInv(18) + 32n * atanInv(57) - 20n * atanInv(239)).toString().slice(1, D + 1);
}
function eSpigot(D) {             // Sale's spigot: e = 2 + 1/2(1 + 1/3(1 + 1/4(1 + ...)))
  var n = D + 20, a = new Array(n).fill(1), out = "";
  for (var k = 0; k < D; k++) {
    var carry = 0;
    for (var i = n - 1; i >= 0; i--) { var x = a[i] * 10 + carry; a[i] = x % (i + 2); carry = Math.floor(x / (i + 2)); }
    out += carry;
  }
  return out;
}
test("sequences", function () {
  assert.strictEqual(G.piDigits().slice(0, 50), "14159265358979323846264338327950288419716939937510");
  assert.strictEqual(G.eDigits().slice(0, 50), "71828182845904523536028747135266249775724709369995");
  assert.strictEqual(G.piDigits().length, 1000);
  assert.strictEqual(G.piDigits(), piGauss(1000), "Machin vs Gauss arctan formula, all 1000 digits");
  assert.strictEqual(G.eDigits(), eSpigot(1000), "series vs spigot, all 1000 digits");
  assert.deepStrictEqual(G.seqPreview("prime", 10), ["2", "3", "5", "7", "11", "13", "17", "19", "23", "29"]);
  assert.deepStrictEqual(G.seqPreview("tri", 6), ["1", "3", "6", "10", "15", "21"]);
  assert.deepStrictEqual(G.seqPreview("fib", 8), ["1", "1", "2", "3", "5", "8", "13", "21"]);
  assert.deepStrictEqual(G.seqPreview("sigma", 12), ["1", "3", "4", "7", "6", "12", "8", "15", "13", "18", "12", "28"]);
  assert.strictEqual(G.seqTerm("prime", 1000), 7919n);
  assert.strictEqual(G.seqTerm("prime", -3), -5n, "negative X: count as positive, then negate");
  assert.strictEqual(G.seqTerm("pidigit", -2), -4n);
  assert.strictEqual(G.seqTerm("fib", 0), null);
  assert.strictEqual(G.seqTerm("pidigit", 1001), null, "off the card");
});

/* ---------------- parser / renderer ---------------- */
test("every card parses and round-trips through its plain-text form", function () {
  var rng = G.mulberry32(7);
  CARDS.forEach(function (c) {
    var again = G.parse(G.textOf(c.ast));
    for (var k = 0; k < 25; k++) {
      var env = { X: G.Q(Math.floor(rng() * 21) - 10 || 1), N: G.Q(2 + Math.floor(rng() * 4)), Y: G.Q(1 + Math.floor(rng() * 6)), V: G.Q(1 + Math.floor(rng() * 4)) };
      var a = G.evalQ(c.ast, env), b = G.evalQ(again, env);
      assert.strictEqual(a && G.qstr(a), b && G.qstr(b), c.id + " " + c.formula + " vs " + G.textOf(c.ast));
      var f = c.f({ X: G.qnum(env.X), N: G.qnum(env.N), Y: G.qnum(env.Y), V: G.qnum(env.V) });
      if (a) assert.ok(Math.abs(f - G.qnum(a)) <= 1e-9 * Math.max(1, Math.abs(f)), c.formula + " float " + f + " vs " + G.qstr(a));
      else assert.ok(f !== f, c.formula + " should be undefined");
    }
    assert.ok(c.r.h && c.r.w > 0, c.formula + " renders");
  });
});
test("parser precedence", function () {
  function v(src, x, n) { return G.qstr(G.evalQ(G.parse(src), { X: G.Q(x), N: G.Q(n || 2), Y: G.Q(1), V: G.Q(1) })); }
  assert.strictEqual(v("-X^2", 3), M + "9");
  assert.strictEqual(v("2^-X", 2), "0.25");
  assert.strictEqual(v("4N/X", 3, 3), "4");
  assert.strictEqual(v("36/(NX)", 2, 3), "6");
  assert.strictEqual(v("1+X(N-2)", 5, 4), "11");
  assert.strictEqual(v("(N-1)!", 1, 5), "24");
  assert.strictEqual(v("2X²", 3), "18");
  assert.strictEqual(v("N+X/N", 3, 3), "4");
  assert.strictEqual(v("3 × 4 − 2", 1), "10");
  assert.throws(function () { G.parse("2Z"); });
  assert.throws(function () { G.parse("(X+1"); });
  assert.throws(function () { G.parse(""); });
});
test("text forms", function () {
  assert.strictEqual(G.textOf(G.parse("4X/N")), "4X/N");
  assert.strictEqual(G.textOf(G.parse("-12/X")), M + "12/X");
  assert.strictEqual(G.textOf(G.parse("(X-N)^2")), "(X " + M + " N)²");
  assert.strictEqual(G.textOf(G.parse("X(N+2)")), "X(N + 2)");
  assert.ok(!/·/.test(G.render(G.parse("2X+4")).h), "2X is juxtaposed");
  assert.ok(/·/.test(G.render(G.parse("3*2^N")).h), "3·2ᴺ needs a dot");
});

/* ---------------- published examples ---------------- */
test("rulebook example: 6X, 2X+4, X/2", function () {
  var h = ["6X", "2X+4", "X/2"];
  assert.strictEqual(total(h, { X: 4, N: 3 }), "38");
  assert.strictEqual(total(h, { X: 1, N: 3 }), "12.5");
  assert.strictEqual(total(h, { X: 2, N: 3 }), "21");
  var an = G.analyze(hand(h), { V: 1 });
  assert.deepStrictEqual(an.solutions.map(function (s) { return s.x; }), [2]);
  assert.strictEqual(G.qstr(an.best.total), "21");
});
test("review examples", function () {
  assert.strictEqual(total(["3X", "4X"], { X: 3, N: 2 }), "21");
  [1, -5, 9].forEach(function (x) { assert.strictEqual(total(["2-2X", "10", "2X+4"], { X: x, N: 3 }), "16"); });
  assert.strictEqual(total(["X(N+2)", "2X+4"], { X: 2, N: 2 }), "16");
  assert.strictEqual(total(["X(N+2)", "2X+4"], { X: 3, N: 2 }), "22");
});
test("20 is bust, over 21 is bust", function () {
  assert.strictEqual(G.classify(G.Q(20)), "twenty");
  assert.strictEqual(G.classify(G.Q(21)), "win");
  assert.strictEqual(G.classify(G.Q(43, 2)), "bust");
  assert.strictEqual(G.classify(G.Q(41, 2)), "ok");
  assert.strictEqual(G.classify(null), "undef");
  // 4 + 10 + 3N with N = 3 is 23 for every X: no valid total at all
  var an = G.analyze(hand(["4", "10", "3N"]), { V: 1 });
  assert.strictEqual(an.best, null);
  // 10 + 5N (N = 2) is exactly 20: bust, so no valid total either
  assert.strictEqual(G.analyze(hand(["10", "5N"]), { V: 1 }).best, null);
});
test("best valid total skips exactly 20", function () {
  // 2X + 4 + 2X + 2N (N=2): 4X + 8 -> X=3 gives 20 (bust), X=2 gives 16
  var an = G.analyze(hand(["2X+4", "2X+2N"]), { V: 1 });
  assert.strictEqual(an.solutions.length, 0);
  assert.strictEqual(G.qstr(an.best.total), "16");
});
test("Y and V cards", function () {
  var an = G.analyze(hand(["XY", "Y"]), { V: 1 });                  // XY + Y = 21 -> Y(X+1) = 21
  assert.ok(an.needsY && an.solutions.length > 0);
  an.solutions.forEach(function (s) { assert.ok(s.y > 0); assert.strictEqual(s.y * (s.x + 1), 21); });
  assert.strictEqual(total(["V!", "3V"], { X: 1, N: 2, V: 3 }), "15");
  assert.strictEqual(G.evalHand(hand(["Y"]), { X: 1, N: 1 }).status, "undef", "Y must be chosen");
});
test("celebrity cards in a hand", function () {
  // Xth prime + Xth triangle number: X = 4 -> 7 + 10 = 17; X = -4 -> -17
  assert.strictEqual(total(["prime(X)", "tri(X)"], { X: 4, N: 2 }), "17");
  assert.strictEqual(total(["prime(X)", "tri(X)"], { X: -4, N: 2 }), M + "17");
  var an = G.analyze(hand(["fib(X)", "sigma(X)"]), { V: 1 });       // fib(6)+sigma(6) = 8+12 = 20 (bust); find 21s
  an.solutions.forEach(function (s) { assert.strictEqual(total(["fib(X)", "sigma(X)"], { X: s.x, N: 2 }), "21"); });
});

/* ---------------- solo game ---------------- */
function autoplaySolo(ids, seed, opts) {
  var g = new G.Solo(CARDS, ids, Object.assign({ rng: G.mulberry32(seed) }, opts || {}));
  for (var turn = 0; turn < 5000 && !g.done; turn++) {
    var an = G.analyze(g.handCards(), { V: g.V() });
    if (an.solutions.length) { var r = g.call(an.solutions[0].x, an.solutions[0].y); assert.ok(r.ok, "solver solution must score"); }
    else if (g.canDraw()) g.draw();
    else g.mulligan();
  }
  return g;
}
test("solo: official rules finish at 21+ icons", function () {
  var ids = G.deckIds(CARDS, { levels: [1, 2, 3], celebrity: false, limited: false });
  assert.strictEqual(ids.length, 54);
  var g = autoplaySolo(ids, 1);
  assert.ok(g.done && g.icons >= 21, "icons " + g.icons);
  var scoredIcons = g.scored.reduce(function (s, h) { return s + h.icons; }, 0);
  assert.strictEqual(scoredIcons, g.icons);
  g.scored.forEach(function (h, k) { assert.strictEqual(h.V, k + 1, "V = 1 + hands in score area"); });
  var seen = g.hand.length + g.deck.pile.length + g.deck.discard.length + g.outOfPlay.length;
  assert.strictEqual(seen, 54, "no card lost or duplicated");
});
test("solo: wrong call keeps the hand, mulligan redeals 2", function () {
  var ids = G.deckIds(CARDS, { levels: [1, 2, 3] });
  var g = new G.Solo(CARDS, ids, { rng: G.mulberry32(3) });
  var before = g.hand.slice();
  var an = G.analyze(g.handCards(), { V: 1 }), x = 1;
  while (an.solutions.some(function (s) { return s.x === x; })) x++;
  var r = g.call(x, 1);
  assert.ok(!r.ok); assert.deepStrictEqual(g.hand, before); assert.strictEqual(g.stats.wrong, 1);
  g.draw(); g.draw(); g.draw(); assert.strictEqual(g.hand.length, 5); assert.strictEqual(g.draw(), null, "max 5 cards");
  g.mulligan(); assert.strictEqual(g.hand.length, 2);
});
test("solo: tiny decks recycle scored cards instead of stalling", function () {
  var ids = G.deckIds(CARDS, { levels: [1] });
  assert.strictEqual(ids.length, 18);                              // only 18 icons on offer
  var g = autoplaySolo(ids, 11);
  assert.ok(g.done && g.icons >= 21, "level-1-only game still reaches 21 icons");
});

/* ---------------- duel bot ---------------- */
test("bot calls a reachable 21, stands on a good total, draws on a poor one", function () {
  var call = G.botDecide(hand(["3X", "4X"]), { V: 1 }, "medium", null);
  assert.strictEqual(call.act, "call"); assert.strictEqual(call.x, 3);
  var stand = G.botDecide(hand(["10", "4X"]), { V: 1 }, "medium", null);   // best 18 at X=2 (X=3 -> 22)
  assert.strictEqual(stand.act, "stand"); assert.strictEqual(G.qstr(stand.total), "18");
  var draw = G.botDecide(hand(["10", "4X"]), { V: 1 }, "hard", null);       // hard wants 19+
  assert.strictEqual(draw.act, "draw");
  var hold = G.botDecide(hand(["10", "4X"]), { V: 1 }, "medium", { total: G.Q(17) });
  assert.strictEqual(hold.act, "hold");
  var chase = G.botDecide(hand(["10", "4X"]), { V: 1 }, "medium", { total: G.Q(19) });
  assert.strictEqual(chase.act, "draw");
});
test("bot timeline respects the 60 s budget", function () {
  var ids = G.deckIds(CARDS, { levels: [1, 2, 3] });
  for (var seed = 1; seed <= 30; seed++) {
    var rng = G.mulberry32(seed), deck = new G.Deck(ids, rng);
    var h = [deck.draw(), deck.draw()];
    var ev = G.botTimeline(CARDS, h, function () { return deck.draw(); }, { V: 1 }, "hard", G.Q(19), G.STAND_MS, rng);
    ev.forEach(function (e) { assert.ok(e.t <= G.STAND_MS); });
    var last = ev[ev.length - 1];
    if (last && last.act === "hold") assert.ok(G.qcmp(last.total, G.Q(19)) > 0);
  }
});

/* ---------------- deck statistics (informational) ---------------- */
function stats(label, cfg) {
  var ids = G.deckIds(CARDS, cfg), rng = G.mulberry32(99), trials = 1500;
  var solved2 = 0, solvedAny = 0, cardsUsed = 0, sumAbsX = 0, nSol = 0, dist = {};
  for (var t = 0; t < trials; t++) {
    var deck = new G.Deck(ids, rng), h = [deck.draw(), deck.draw()];
    for (;;) {
      var hc = h.map(function (i) { return CARDS[i]; });
      var an = G.analyze(hc, { V: 1 }, { xMax: 200, yMax: 20 });
      if (an.solutions.length) {
        if (h.length === 2) solved2++;
        solvedAny++; cardsUsed += h.length; dist[h.length] = (dist[h.length] || 0) + 1;
        sumAbsX += Math.abs(an.solutions[0].x); nSol++;
        break;
      }
      if (h.length >= 5) break;
      h.push(deck.draw());
    }
  }
  var pct = function (n) { return (100 * n / trials).toFixed(0) + "%"; };
  console.log("  " + label + " (" + ids.length + " cards): 2-card 21s " + pct(solved2) +
    " | solvable by drawing to <=5 " + pct(solvedAny) +
    " | solved at N=2/3/4/5: " + [2, 3, 4, 5].map(function (n) { return pct(dist[n] || 0); }).join("/") +
    " | mean |X| " + (sumAbsX / Math.max(1, nSol)).toFixed(1));
}

console.log(passed + " tests passed" + (process.exitCode ? " (with failures above)" : ""));
console.log("\nDeck statistics (random hands, greedy drawing):");
stats("Level 1", { levels: [1] });
stats("Levels 1-2", { levels: [1, 2] });
stats("Core 1-3", { levels: [1, 2, 3] });
stats("Core + Celebrity", { levels: [1, 2, 3], celebrity: true });
stats("Everything", { levels: [1, 2, 3], celebrity: true, limited: true });

var t0 = Date.now(), n = 0, ids = G.deckIds(CARDS, { levels: [1, 2, 3], celebrity: true });
for (var s = 0; s < 200; s++) {
  var rr = G.mulberry32(s), dk = new G.Deck(ids, rr), hh = [];
  for (var k = 0; k < 5; k++) hh.push(CARDS[dk.draw()]);
  G.analyze(hh, { V: 1 }); n++;
}
console.log("\nanalyze(): " + ((Date.now() - t0) / n).toFixed(2) + " ms per 5-card hand (X in ±1000)");
