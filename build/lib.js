/* Train of Thought - question generators, daily rounds, streaks (no DOM).
   Used both by the Node test harness and inlined into the final HTML. */
(function (global) {
  "use strict";
  var X21 = global.X21 || require("./cards.js");

  var ROUND = 10, GEN = "tot1";          // bump GEN when generators change (it reseeds every daily set)
  var M = "−";

  /* ============================ RNG ============================ */
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
  function hashStr(s) {                     // FNV-1a
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return h >>> 0;
  }
  function ri(r, a, b) { return a + Math.floor(r() * (b - a + 1)); }
  function pick(r, arr) { return arr[Math.floor(r() * arr.length)]; }
  function nz(r, a, b) { var v; do v = ri(r, a, b); while (v === 0); return v; }
  function sgn(r) { return r() < 0.5 ? -1 : 1; }
  function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { var t = a % b; a = b; b = t; } return a; }
  function shuffle(arr, r) {
    for (var i = arr.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)), t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
    return arr;
  }

  /* ======================== HTML & text helpers ======================== */
  function sn(n) { return n < 0 ? M + (-n) : String(n); }                  // −5
  function sp(n) { return n < 0 ? "(" + M + (-n) + ")" : String(n); }      // (−5), for products
  function v(name) { return '<i class="v">' + name + "</i>"; }
  function o(op) { return '<span class="o">' + op + "</span>"; }          // spaced binary operator
  var EQ = '<span class="o">=</span>';
  function w(text) { return '<span class="w">' + text + "</span>"; }      // words inside maths
  function fn(name) { return '<span class="fn">' + name + "</span>"; }    // upright operator names: det, tr
  function frac(n, d) { return '<span class="fr"><span class="fr-n">' + n + '</span><span class="fr-d">' + d + "</span></span>"; }
  function pw(b, e) { return b + '<sup class="ex">' + e + "</sup>"; }
  function sub(s) { return "<sub>" + s + "</sub>"; }
  function cell(x) { return "<span>" + (typeof x === "number" ? sn(x) : x) + "</span>"; }
  function mat(rows, det) {
    return '<span class="mat' + (det ? " det" : "") + '" style="--c:' + rows[0].length + '">' +
      rows.map(function (row) { return row.map(cell).join(""); }).join("") + "</span>";
  }
  function col(vals) { return mat(vals.map(function (x) { return [x]; })); }
  function sys(lines) { return '<span class="sys">' + lines.map(function (l) { return "<span>" + l + "</span>"; }).join("") + "</span>"; }
  function stack(lines) { return '<span class="stk">' + lines.map(function (l) { return "<span>" + l + "</span>"; }).join("") + "</span>"; }
  // [[coef, name], [const]] -> "3x − y + 4"; zero terms are dropped
  function lin(terms) {
    var out = "";
    terms.forEach(function (t) {
      var c = t[0], name = t[1] || "";
      if (!c) return;
      var a = Math.abs(c), body = name ? (a === 1 ? "" : a) + name : String(a);
      out += out ? o(c < 0 ? M : "+") + body : (c < 0 ? M : "") + body;
    });
    return out || "0";
  }
  // [12, −5, −4] -> "12 − 5 − 4"
  function sumText(vals) {
    return vals.map(function (x, i) { return i === 0 ? sn(x) : x < 0 ? " " + M + " " + -x : " + " + x; }).join("");
  }
  // [[3, 4], [−1, 5]] -> "3·4 + (−1)·5"
  function prodSum(pairs) {
    return pairs.map(function (p, i) { return (i ? " + " : "") + sp(p[0]) + "·" + sp(p[1]); }).join("");
  }
  function dotWhy(pairs) {
    var terms = pairs.map(function (p) { return p[0] * p[1]; });
    var total = terms.reduce(function (s, x) { return s + x; }, 0);
    return prodSum(pairs) + " = " + (pairs.length > 1 ? sumText(terms) + " = " : "") + sn(total);
  }
  var ORD = ["", "first", "second", "third"];

  /* ============================ templates ============================ */
  // A template turns (rng, tier 1-3, ctx) into a question:
  //   {prompt, html, label, answer, why, check?}   (answers are always whole numbers)
  // fam groups templates so a round mixes its topics.
  var MENTAL = [], LINEAR = [];
  function T(list, type, tiers, fam, gen) { list.push({ type: type, tiers: tiers, fam: fam, gen: gen }); }

  /* ------------------------- mental maths ------------------------- */
  function addWhy(a, b) {
    var unit = b >= 100 ? 100 : 10, B = Math.round(b / unit) * unit, d = B - b;
    if (d > 0 && d <= unit * 0.3) return a + " + " + B + " " + M + " " + d + " = " + (a + B) + " " + M + " " + d + " = " + (a + b);
    var hi = b - b % unit, lo = b % unit;
    if (!hi || !lo) return a + " + " + b + " = " + (a + b);
    return a + " + " + hi + " = " + (a + hi) + ", then + " + lo + " = " + (a + b);
  }
  T(MENTAL, "add", [1, 2, 3], "arith", function (r, t) {
    var a, b;
    if (t === 1) do { a = ri(r, 21, 89); b = ri(r, 12, 89); } while (a % 10 + b % 10 < 10);
    else if (t === 2) do { a = ri(r, 120, 899); b = ri(r, 120, 899); } while (a % 10 + b % 10 < 10 && a % 100 + b % 100 < 100);
    else do { a = ri(r, 1200, 8999); b = ri(r, 1200, 4999); } while (a % 100 + b % 100 < 100);
    return { prompt: "Add", html: a + o("+") + b, answer: a + b, why: addWhy(a, b) };
  });

  function subWhy(a, b) {
    if (a === 1000 || a === 10000) {
      return "Take each digit of " + b + " from 9, and the last from 10: " + (a - b);
    }
    var unit = b >= 100 ? 100 : 10, B = Math.ceil(b / unit) * unit, d = B - b;
    if (d > 0 && d <= unit * 0.4) return a + " " + M + " " + B + " + " + d + " = " + (a - B) + " + " + d + " = " + (a - b);
    var hi = b - b % unit, lo = b % unit;
    if (!hi || !lo) return a + " " + M + " " + b + " = " + (a - b);
    return a + " " + M + " " + hi + " = " + (a - hi) + ", then " + M + " " + lo + " = " + (a - b);
  }
  T(MENTAL, "sub", [1, 2, 3], "arith", function (r, t) {
    var a, b;
    if (t === 1) do { a = ri(r, 52, 99); b = ri(r, 13, a - 10); } while (a % 10 >= b % 10);
    else if (t === 2) do { a = ri(r, 300, 999); b = ri(r, 110, a - 60); } while (a % 10 >= b % 10 && a % 100 >= b % 100);
    else if (r() < 0.35) { a = pick(r, [1000, 10000]); do b = a === 1000 ? ri(r, 123, 987) : ri(r, 1234, 8765); while (b % 10 === 0); }
    else do { a = ri(r, 2000, 9999); b = ri(r, 1100, a - 300); } while (a % 100 >= b % 100);
    return { prompt: "Subtract", html: a + o(M) + b, answer: a - b, why: subWhy(a, b) };
  });

  function mulWhy(a, b) {
    var x, y, Y, d, hi, lo;
    if (a <= 12 && b <= 12) {
      if (a === 11 || a === 12) return "10 × " + b + " + " + (a - 10) + " × " + b + " = " + 10 * b + " + " + (a - 10) * b + " = " + a * b;
      if (b === 11 || b === 12) return a + " × 10 + " + a + " × " + (b - 10) + " = " + 10 * a + " + " + a * (b - 10) + " = " + a * b;
      return a + " × " + b + " = " + a * b;
    }
    if (b < 10) { hi = a - a % 10; lo = a % 10; return hi + " × " + b + " + " + lo + " × " + b + " = " + hi * b + " + " + lo * b + " = " + a * b; }
    for (var k = 0; k < 2; k++) {                 // round whichever factor is close to a multiple of 10
      x = k ? b : a; y = k ? a : b;
      if (y % 10 >= 8) { Y = y + 10 - y % 10; d = Y - y; return x + " × " + Y + " " + M + " " + x + " × " + d + " = " + x * Y + " " + M + " " + x * d + " = " + a * b; }
    }
    x = Math.max(a, b); y = Math.min(a, b); hi = y - y % 10; lo = y % 10;
    return x + " × " + hi + " + " + x + " × " + lo + " = " + x * hi + " + " + x * lo + " = " + a * b;
  }
  T(MENTAL, "mul", [1, 2, 3], "arith", function (r, t) {
    var a, b;
    if (t === 1) do { a = ri(r, 3, 12); b = ri(r, 3, 12); } while (a === 10 || b === 10 || (a < 6 && b < 6));
    else if (t === 2) { do a = ri(r, 13, 99); while (a % 10 === 0); b = ri(r, 3, 9); }
    else do { a = ri(r, 13, 99); b = ri(r, 13, 99); } while (a % 10 === 0 || b % 10 === 0 || a === 11 || b === 11);
    return { prompt: "Multiply", html: a + o("×") + b, answer: a * b, why: mulWhy(a, b) };
  });

  T(MENTAL, "div", [1, 2, 3], "arith", function (r, t) {
    var b, q;
    if (t === 1) do { b = ri(r, 3, 12); q = ri(r, 3, 12); } while (b === 10 || q === 10);
    else if (t === 2) { b = ri(r, 3, 9); do q = ri(r, 14, 199); while (q * b < 100 || q % 10 === 0); }
    else { do b = ri(r, 13, 29); while (b === 20); do q = ri(r, 12, 89); while (q % 10 === 0); }
    var a = b * q, hi = q - q % 10, lo = q % 10;
    var why = q <= 12 ? b + " × " + q + " = " + a :
      a + " = " + b * hi + " + " + b * lo + " = " + b + " × " + hi + " + " + b + " × " + lo + ", so " + hi + " + " + lo + " = " + q;
    return { prompt: "Divide", html: a + o("÷") + b, answer: q, why: why };
  });

  function sqWhy(n) {
    if (n % 10 === 5) { var t = (n - 5) / 10; return t * 10 + " × " + (t + 1) * 10 + " + 25 = " + t * (t + 1) * 100 + " + 25 = " + n * n; }
    var R = Math.round(n / 10) * 10, d = n - R, s = d < 0 ? " " + M + " " : " + ";
    return "(" + R + s + Math.abs(d) + ")² = " + R * R + s + Math.abs(2 * R * d) + " + " + d * d + " = " + n * n;
  }
  T(MENTAL, "sq", [2, 3], "num", function (r, t) {
    var n; do n = t === 2 ? ri(r, 13, 25) : ri(r, 26, 99); while (n % 10 === 0);
    return { prompt: "Square", html: pw(n, 2), answer: n * n, why: sqWhy(n) };
  });

  function sqrtWhy(n) {
    var N = n * n;
    if (n <= 25) return n + "² = " + N;
    var lo = n - n % 10, hi = lo + 10, L = N % 10, mid = lo + 5, cands = [];
    for (var c = 1; c <= 9; c++) if (c * c % 10 === L) cands.push(lo + c);
    var s = lo + "² = " + lo * lo + " and " + hi + "² = " + hi * hi + ". It ends in " + L + ", so " + cands.join(" or ");
    if (cands.length === 1) return s;
    return s + ". " + (N < mid * mid ? N + " < " : N + " > ") + mid + "² = " + mid * mid + ", so " + n;
  }
  T(MENTAL, "sqrt", [2, 3], "num", function (r, t) {
    var n; do n = t === 2 ? ri(r, 11, 25) : ri(r, 26, 99); while (n % 10 === 0);
    return { prompt: "Square root", html: '<span class="rt">√<span>' + n * n + "</span></span>", answer: n, why: sqrtWhy(n) };
  });

  // how to take p% of v in your head
  function pctWhy(p, v) {
    var x = p * v / 100, ten = v / 10;
    if (p === 50) return "Half of " + v + " = " + x;
    if (p === 25) return v + " ÷ 4 = " + x;
    if (p === 75) return v + " ÷ 4 = " + v / 4 + ", × 3 = " + x;
    if (p === 20) return v + " ÷ 5 = " + x;
    if (p === 10) return v + " ÷ 10 = " + x;
    if (p === 5) return "10% = " + ten + ", half of that = " + x;
    if (p % 10 === 0) return "10% = " + ten + ", × " + p / 10 + " = " + x;
    if (p % 10 === 5) return "10% = " + ten + ", 5% = " + ten / 2 + " → " + (p - 5) / 10 + " × " + ten + " + " + ten / 2 + " = " + x;
    if (p === 12) return "10% = " + ten + ", 2% = " + v / 50 + " → " + x;
    return p + "% of " + v + " = " + v + "% of " + p + " = " + x;   // swap trick (4%, 8% of 25, 75 ...)
  }
  function pctPick(r, p, lo, hi) { var step = 100 / gcd(p, 100); return step * ri(r, Math.ceil(lo / step), Math.floor(hi / step)); }
  T(MENTAL, "pct", [1, 2, 3], "pct", function (r, t) {
    var p, val;
    if (t === 1) { p = pick(r, [10, 20, 25, 50, 75, 5]); val = pctPick(r, p, 20, 400); }
    else if (t === 2) {
      p = pick(r, [15, 35, 45, 12, 30, 40, 60, 65, 4, 8]);
      val = p === 4 || p === 8 ? pick(r, [25, 50, 75, 125, 150, 175, 225, 250]) : pctPick(r, p, 40, 800);
    }
    else {
      p = pick(r, [5, 10, 15, 20, 25, 30, 35, 40, 12, 60]); val = pctPick(r, p, 60, 900);
      var up = r() < 0.5, x = p * val / 100;
      return { prompt: "Percentage change", html: val + " " + w(up ? "increased by" : "decreased by") + " " + p + "%",
        answer: up ? val + x : val - x, why: pctWhy(p, val) + (up ? ", " + val + " + " + x : ", " + val + " " + M + " " + x) + " = " + (up ? val + x : val - x) };
    }
    return { prompt: "Percentage", html: p + "% " + w("of") + " " + val, answer: p * val / 100, why: pctWhy(p, val) };
  });

  T(MENTAL, "frac", [2, 3], "pct", function (r, t) {
    var b = t === 2 ? pick(r, [3, 4, 5, 6, 8]) : pick(r, [7, 9, 12, 15, 16]), a;
    do a = ri(r, 1, b - 1); while (gcd(a, b) !== 1 || (a === 1 && r() < 0.6));
    var k = t === 2 ? ri(r, 4, 30) : ri(r, 6, 25), val = b * k;
    return { prompt: "Fraction of", html: frac(a, b) + " " + w("of") + " " + val, answer: a * k,
      why: val + " ÷ " + b + " = " + k + (a > 1 ? ", × " + a + " = " + a * k : "") };
  });

  T(MENTAL, "ops", [1, 2, 3], "arith", function (r, t) {
    var a, b, c, d, e, p, q, form = t === 1 ? ri(r, 0, 1) : t === 2 ? ri(r, 2, 4) : ri(r, 5, 7);
    var X = o("×"), D = o("÷"), P = o("+"), S = o(M);
    switch (form) {
      case 0: a = ri(r, 2, 30); b = ri(r, 2, 9); c = ri(r, 2, 12); p = b * c;
        return { prompt: "Order of operations", html: a + P + b + X + c, answer: a + p, why: "× first: " + b + " × " + c + " = " + p + ", then " + a + " + " + p + " = " + (a + p) };
      case 1: a = ri(r, 3, 12); b = ri(r, 3, 9); p = a * b; c = ri(r, 2, p - 1);
        return { prompt: "Order of operations", html: a + X + b + S + c, answer: p - c, why: a + " × " + b + " = " + p + ", then " + p + " " + M + " " + c + " = " + (p - c) };
      case 2: case 4: a = ri(r, 3, 12); b = ri(r, 3, 9); c = ri(r, 3, 12); d = ri(r, 3, 9); p = a * b; q = c * d;
        if (form === 2) return { prompt: "Order of operations", html: a + X + b + P + c + X + d, answer: p + q, why: p + " + " + q + " = " + (p + q) };
        return { prompt: "Order of operations", html: a + X + b + S + c + X + d, answer: p - q, why: p + " " + M + " " + q + " = " + sn(p - q) };
      case 3: b = ri(r, 3, 9); p = ri(r, 3, 12); a = b * p; c = ri(r, 3, 12); d = ri(r, 3, 9); q = c * d; e = ri(r, 2, 20);
        return { prompt: "Order of operations", html: a + D + b + P + c + X + d + S + e, answer: p + q - e,
          why: a + " ÷ " + b + " = " + p + ", " + c + " × " + d + " = " + q + ", then " + p + " + " + q + " " + M + " " + e + " = " + sn(p + q - e) };
      case 5: a = ri(r, 2, 15); b = ri(r, 4, 20); c = ri(r, 3, 9); e = ri(r, 2, 9); p = (a - b) * c; d = e * ri(r, 2, 9); q = d / e;
        return { prompt: "Order of operations", html: "(" + a + S + b + ")" + X + c + S + d + D + e, answer: p - q,
          why: "(" + a + " " + M + " " + b + ") × " + c + " = " + sn(a - b) + " × " + c + " = " + sn(p) + ", " + d + " ÷ " + e + " = " + q + ", then " + sn(p) + " " + M + " " + q + " = " + sn(p - q) };
      case 6: a = ri(r, 6, 15); b = ri(r, 3, 12); c = ri(r, 3, 12); p = a * a; q = b * c;
        return { prompt: "Order of operations", html: pw(a, 2) + S + b + X + c, answer: p - q, why: a + "² = " + p + ", " + b + " × " + c + " = " + q + ", then " + p + " " + M + " " + q + " = " + sn(p - q) };
      default: a = ri(r, 3, 12); b = ri(r, 2, 9); c = ri(r, 4, 15); d = ri(r, 5, 40); p = a * (b - c);
        return { prompt: "Order of operations", html: a + X + "(" + b + S + c + ")" + P + d, answer: p + d,
          why: a + " × " + sp(b - c) + " = " + sn(p) + ", then " + sn(p) + " + " + d + " = " + sn(p + d) };
    }
  });

  T(MENTAL, "near", [2, 3], "num", function (r, t) {
    var a, m, d, form = t === 2 ? pick(r, ["x5", "x25", "x11", "x9"]) : pick(r, ["x99", "x101", "dsq", "x15", "x125"]);
    switch (form) {
      case "x5": do a = 2 * ri(r, 11, 99); while (a % 10 === 0);
        return { prompt: "Multiply", html: a + o("×") + 5, answer: a * 5, why: "× 5 is ÷ 2 then × 10: " + a / 2 + " × 10 = " + a * 5 };
      case "x25": do a = 4 * ri(r, 3, 49); while (a % 20 === 0);
        return { prompt: "Multiply", html: a + o("×") + 25, answer: a * 25, why: "× 25 is ÷ 4 then × 100: " + a / 4 + " × 100 = " + a * 25 };
      case "x11": do a = ri(r, 12, 98); while (a % 10 === 0);
        var t1 = Math.floor(a / 10), u = a % 10;
        return { prompt: "Multiply", html: a + o("×") + 11, answer: a * 11,
          why: t1 + u < 10 ? "Put " + t1 + " + " + u + " = " + (t1 + u) + " between the digits: " + a * 11 : a + "0 + " + a + " = " + a * 11 };
      case "x9": do a = ri(r, 13, 99); while (a % 10 === 0);
        return { prompt: "Multiply", html: a + o("×") + 9, answer: a * 9, why: a + " × 10 " + M + " " + a + " = " + a * 10 + " " + M + " " + a + " = " + a * 9 };
      case "x99": do a = ri(r, 13, 99); while (a % 10 === 0);
        return { prompt: "Multiply", html: a + o("×") + 99, answer: a * 99, why: a + " × 100 " + M + " " + a + " = " + a * 100 + " " + M + " " + a + " = " + a * 99 };
      case "x101": do a = ri(r, 13, 99); while (a % 10 === 0);
        return { prompt: "Multiply", html: a + o("×") + 101, answer: a * 101, why: a + " × 100 + " + a + " = " + a * 101 };
      case "dsq": m = 10 * ri(r, 2, 9); d = ri(r, 1, 9);
        return { prompt: "Multiply", html: (m - d) + o("×") + (m + d), answer: m * m - d * d,
          why: "(" + m + " " + M + " " + d + ")(" + m + " + " + d + ") = " + m + "² " + M + " " + d + "² = " + m * m + " " + M + " " + d * d + " = " + (m * m - d * d) };
      case "x15": do a = 2 * ri(r, 7, 49); while (a % 10 === 0);
        return { prompt: "Multiply", html: a + o("×") + 15, answer: a * 15, why: a + " × 10 + half of that = " + a * 10 + " + " + a * 5 + " = " + a * 15 };
      default: do a = 8 * ri(r, 2, 12); while (a % 10 === 0);
        return { prompt: "Multiply", html: a + o("×") + 125, answer: a * 125, why: "× 125 is ÷ 8 then × 1000: " + a / 8 + " × 1000 = " + a * 125 };
    }
  });

  T(MENTAL, "pow", [2, 3], "num", function (r, t) {
    var b, k, opts = t === 2 ? [[2, 5, 10], [3, 3, 5], [4, 3, 5], [5, 3, 4], [6, 3, 3]] : [[2, 11, 13], [3, 6, 7], [5, 5, 5], [6, 4, 4], [7, 3, 4], [9, 3, 4], [12, 3, 3], [11, 3, 3]];
    var o2 = pick(r, opts);
    b = o2[0]; k = ri(r, o2[1], o2[2]);
    var x = Math.pow(b, k), prev = Math.pow(b, k - 1);
    var why = b === 2 && k > 10 ? "2¹⁰ = 1024, then double " + (k === 11 ? "once" : k - 10 + " times") + ": " + x :
      b + "<sup>" + (k - 1) + "</sup> = " + prev + ", × " + b + " = " + x;
    return { prompt: "Power", html: pw(b, k), answer: x, why: why };
  });

  T(MENTAL, "series", [2, 3], "num", function (r, t) {
    var n, D = o("+") + "⋯" + o("+");
    if (t === 2) {
      n = ri(r, 8, 20);
      return { prompt: "Sum of odd numbers", html: "1" + o("+") + "3" + o("+") + "5" + D + (2 * n - 1), answer: n * n,
        why: "There are " + n + " odd numbers, and the first n odd numbers add up to n²: " + n + "² = " + n * n };
    }
    n = ri(r, 21, 60);
    if (r() < 0.3) {
      return { prompt: "Sum of even numbers", html: "2" + o("+") + "4" + o("+") + "6" + D + 2 * n, answer: n * (n + 1),
        why: "2 × (1 + ⋯ + " + n + ") = " + n + " × " + (n + 1) + " = " + n * (n + 1) };
    }
    return { prompt: "Sum", html: "1" + o("+") + "2" + o("+") + "3" + D + n, answer: n * (n + 1) / 2,
      why: "n(n + 1)/2 = " + n + " × " + (n + 1) + " ÷ 2 = " + n * (n + 1) / 2 };
  });

  function digitSum(n) { return String(n).split("").reduce(function (s, c) { return s + +c; }, 0); }
  T(MENTAL, "mod", [2, 3], "num", function (r, t) {
    var m = t === 2 ? pick(r, [3, 4, 5, 9]) : pick(r, [7, 8, 11, 12]), N = ri(r, 1000, 9999), x = N % m, why, s, L;
    if (m === 9 || m === 3) { s = digitSum(N); why = "Digit sum " + String(N).split("").join(" + ") + " = " + s + ", and " + s + " leaves " + x; }
    else if (m === 4) { L = N % 100; why = "Only the last two digits matter: " + L + " ÷ 4 leaves " + x; }
    else if (m === 5) { why = "Only the last digit matters: " + (N % 10) + " leaves " + x; }
    else if (m === 8) { L = N % 1000; why = "Only the last three digits matter: " + L + " = 8 × " + Math.floor(L / 8) + " + " + x; }
    else if (m === 11) {
      var ds = String(N).split("").reverse(), alt = 0;
      ds.forEach(function (c, i) { alt += i % 2 ? -c : +c; });
      why = "Alternating digit sum from the right: " + ds.map(function (c, i) { return i ? (i % 2 ? " " + M + " " : " + ") + c : c; }).join("") + " = " + sn(alt) +
        (alt < 0 || alt >= 11 ? ", which leaves " + x : "");
    } else { var q = Math.floor(N / m); why = m + " × " + q + " = " + m * q + ", and " + N + " " + M + " " + m * q + " = " + x; }
    return { prompt: "Remainder", html: N + o("÷") + m, label: w("remainder"), answer: x, why: why };
  });

  T(MENTAL, "neg", [1, 2], "arith", function (r, t) {
    var a, b, c, p;
    if (t === 1) {
      a = ri(r, 5, 60); b = ri(r, 10, 70); c = ri(r, 3, 40);
      return { prompt: "Negatives", html: M + a + o("+") + b + o(M) + c, answer: -a + b - c,
        why: M + a + " + " + b + " = " + sn(b - a) + ", then " + M + " " + c + " = " + sn(b - a - c) };
    }
    a = ri(r, 3, 12); b = ri(r, 3, 9); c = ri(r, 10, 90); p = a * b;
    if (r() < 0.5) {
      return { prompt: "Negatives", html: "(" + M + a + ")" + o("×") + "(" + M + b + ")" + o(M) + c, answer: p - c,
        why: "negative × negative is positive: " + p + ", then " + p + " " + M + " " + c + " = " + sn(p - c) };
    }
    return { prompt: "Negatives", html: c + o("+") + "(" + M + a + ")" + o("×") + b, answer: c - p,
      why: "(" + M + a + ") × " + b + " = " + M + p + ", then " + c + " " + M + " " + p + " = " + sn(c - p) };
  });

  T(MENTAL, "mean", [2], "pct", function (r) {
    var k = ri(r, 4, 5), m = ri(r, 12, 60), offs = [], s = 0, i;
    for (i = 0; i < k - 1; i++) { offs.push(ri(r, -12, 12)); s += offs[i]; }
    offs.push(-s);
    if (Math.abs(offs[k - 1]) > 15 || m + Math.min.apply(null, offs) < 2) { offs = offs.map(function () { return 0; }); offs[0] = 7; offs[1] = -7; }
    var vals = shuffle(offs.map(function (d) { return m + d; }), r), sum = m * k;
    return { prompt: "Mean (average)", html: w("mean of") + " " + vals.join(", "), answer: m,
      why: vals.join(" + ") + " = " + sum + ", and " + sum + " ÷ " + k + " = " + m };
  });

  T(MENTAL, "half", [1], "pct", function (r) {
    var a;
    if (r() < 0.5) {
      do a = ri(r, 156, 489); while (a % 10 < 5 && Math.floor(a / 10) % 10 < 5);
      var hi = a - a % 100;
      return { prompt: "Double", html: w("double") + " " + a, answer: 2 * a, why: "2 × " + hi + " + 2 × " + (a - hi) + " = " + 2 * hi + " + " + 2 * (a - hi) + " = " + 2 * a };
    }
    do a = 2 * ri(r, 61, 499); while (Math.floor(a / 100) % 2 === 0 || a % 100 === 0);
    var h = a - a % 100;
    return { prompt: "Half", html: w("half of") + " " + a, answer: a / 2, why: "Half of " + h + " + half of " + (a - h) + " = " + h / 2 + " + " + (a - h) / 2 + " = " + a / 2 };
  });

  /* ------------------------- linear algebra: equations ------------------------- */
  var X_ = v("x"), Y_ = v("y"), mi = " " + M + " ";
  function divisors(P, lim) {                        // positive f <= lim with |P/f| <= lim
    var out = [];
    for (var f = 1; f <= lim; f++) if (P % f === 0 && Math.abs(P / f) <= lim) out.push(f);
    return out;
  }

  T(LINEAR, "lin1", [1, 2], "eq", function (r, t) {
    var x = nz(r, -6, 12), a, b, c, q;
    if (t === 1) {
      a = ri(r, 2, 9); b = nz(r, -20, 30); c = a * x + b;
      return { prompt: "Solve for x", html: lin([[a, X_], [b]]) + EQ + sn(c), label: X_, answer: x,
        why: a + X_ + " = " + sn(c) + (b < 0 ? " + " + -b : mi + b) + " = " + sn(c - b) + ", so " + X_ + " = " + sn(c - b) + " ÷ " + a + " = " + sn(x) };
    }
    if (r() < 0.5) {
      a = ri(r, 2, 6); q = nz(r, -8, 12); x = a * q; b = nz(r, -15, 20); c = q + b;
      return { prompt: "Solve for x", html: frac(X_, a) + o(b < 0 ? M : "+") + Math.abs(b) + EQ + sn(c), label: X_, answer: x,
        why: X_ + "/" + a + " = " + sn(c) + (b < 0 ? " + " + -b : mi + b) + " = " + sn(q) + ", so " + X_ + " = " + a + " × " + sp(q) + " = " + sn(x) };
    }
    a = ri(r, 2, 7); b = nz(r, -9, 9); c = a * (x + b);
    return { prompt: "Solve for x", html: a + "(" + lin([[1, X_], [b]]) + ")" + EQ + sn(c), label: X_, answer: x,
      why: lin([[1, X_], [b]]) + " = " + sn(c) + " ÷ " + a + " = " + sn(x + b) + ", so " + X_ + " = " + sn(x) };
  });

  T(LINEAR, "lin2", [2, 3], "eq", function (r, t) {
    var x = nz(r, -9, 12), a, b, c, d, e, k;
    if (t === 2) {
      do { a = nz(r, -4, 9); c = nz(r, -4, 9); } while (a === c || (a < 0 && c < 0));
      b = nz(r, -20, 20); d = a * x + b - c * x;
      return { prompt: "Solve for x", html: lin([[a, X_], [b]]) + EQ + lin([[c, X_], [d]]), label: X_, answer: x,
        why: "Collect the " + X_ + " terms: " + lin([[a - c, X_]]) + " = " + sn(d) + (b < 0 ? " + " + -b : mi + b) + " = " + sn(d - b) +
          ", so " + X_ + " = " + sn(d - b) + " ÷ " + sp(a - c) + " = " + sn(x) };
    }
    if (r() < 0.5) {
      do { a = ri(r, 2, 6); c = ri(r, 2, 6); } while (a === c);
      b = nz(r, -6, 6); d = nz(r, -6, 6); e = a * (x + b) - c * (x + d);
      return { prompt: "Solve for x", html: a + "(" + lin([[1, X_], [b]]) + ")" + EQ + c + "(" + lin([[1, X_], [d]]) + ")" + (e ? o(e < 0 ? M : "+") + Math.abs(e) : ""),
        label: X_, answer: x,
        why: "Expand: " + lin([[a, X_], [a * b]]) + " = " + lin([[c, X_], [c * d + e]]) + ", so " + lin([[a - c, X_]]) + " = " + sn(c * d + e - a * b) + " and " + X_ + " = " + sn(x) };
    }
    do { b = ri(r, 2, 6); d = ri(r, 2, 6); } while (b === d);
    k = nz(r, -5, 8); a = b * k - x; c = d * k - x;
    return { prompt: "Solve for x", html: frac(lin([[1, X_], [a]]), b) + EQ + frac(lin([[1, X_], [c]]), d), label: X_, answer: x,
      why: "Cross-multiply: " + d + "(" + lin([[1, X_], [a]]) + ") = " + b + "(" + lin([[1, X_], [c]]) + "), so " + lin([[d - b, X_]]) + " = " + sn(b * c - d * a) + " and " + X_ + " = " + sn(x) };
  });

  T(LINEAR, "sys", [1, 2, 3], "eq", function (r, t) {
    var x, y, a, b, c, d, p, q, D, askX = r() < 0.5;
    if (t === 1) {
      do { x = ri(r, 1, 15); y = ri(r, 1, 15); } while (x === y);
      p = x + y; q = x - y;
      return { prompt: "Simultaneous equations", html: sys([lin([[1, X_], [1, Y_]]) + EQ + p, lin([[1, X_], [-1, Y_]]) + EQ + sn(q)]),
        label: askX ? X_ : Y_, answer: askX ? x : y,
        why: askX ? "Add them: 2" + X_ + " = " + p + " + " + sp(q) + " = " + (p + q) + ", so " + X_ + " = " + x :
          "Subtract them: 2" + Y_ + " = " + p + mi + sp(q) + " = " + (p - q) + ", so " + Y_ + " = " + y };
    }
    var R = t === 2 ? 5 : 9;
    do { a = ri(r, 1, R); b = nz(r, -R, R); c = nz(r, -R, R); d = nz(r, -R, R); D = a * d - b * c; }
    while (!D || (t === 2 && Math.abs(D) > 20));
    x = t === 2 ? nz(r, -5, 9) : nz(r, -9, 12); y = t === 2 ? nz(r, -5, 9) : nz(r, -9, 12);
    p = a * x + b * y; q = c * x + d * y;
    var top = askX ? sp(p) + "·" + sp(d) + mi + sp(b) + "·" + sp(q) : sp(a) + "·" + sp(q) + mi + sp(p) + "·" + sp(c);
    return { prompt: "Simultaneous equations", html: sys([lin([[a, X_], [b, Y_]]) + EQ + sn(p), lin([[c, X_], [d, Y_]]) + EQ + sn(q)]),
      label: askX ? X_ : Y_, answer: askX ? x : y,
      why: "Cramer's rule: det = " + sp(a) + "·" + sp(d) + mi + sp(b) + "·" + sp(c) + " = " + sn(D) + ", " + (askX ? X_ : Y_) + " = (" + top + ") ÷ " + sp(D) +
        " = " + sn((askX ? x : y) * D) + " ÷ " + sp(D) + " = " + sn(askX ? x : y) };
  });

  T(LINEAR, "line", [1, 2], "eq", function (r, t) {
    var m = nz(r, -5, 6), b0 = ri(r, -9, 9), x1, x2, x3, F = v("f");
    function f(x) { return m * x + b0; }
    if (t === 1) {
      x1 = ri(r, -4, 5); x2 = x1 + ri(r, 1, 6);
      if (r() < 0.5) { x3 = x1; x1 = x2; x2 = x3; }
      return { prompt: "Slope of the line through", html: "(" + sn(x1) + ", " + sn(f(x1)) + ")" + w("and") + "(" + sn(x2) + ", " + sn(f(x2)) + ")",
        label: v("m"), answer: m,
        why: "(" + sn(f(x2)) + mi + sp(f(x1)) + ") ÷ (" + sn(x2) + mi + sp(x1) + ") = " + sn(f(x2) - f(x1)) + " ÷ " + sp(x2 - x1) + " = " + sn(m) };
    }
    x1 = ri(r, -3, 4); x2 = x1 + ri(r, 2, 5); x3 = x2 + ri(r, 2, 8);
    return { prompt: F + " is a linear function", html: stack([F + "(" + sn(x1) + ")" + EQ + sn(f(x1)), F + "(" + sn(x2) + ")" + EQ + sn(f(x2))]),
      label: F + "(" + sn(x3) + ")", answer: f(x3),
      why: "Slope = (" + sn(f(x2)) + mi + sp(f(x1)) + ") ÷ " + (x2 - x1) + " = " + sn(m) + ", so " + F + "(" + sn(x3) + ") = " + sn(f(x2)) + " + " + sp(m) + " × " + (x3 - x2) + " = " + sn(f(x3)) };
  });

  T(LINEAR, "sing", [2, 3], "eq", function (r, t) {
    var K = v("k"), k, divs, f, g;
    if (t === 2) {
      for (;;) {
        k = nz(r, -9, 12);
        var pos = ri(r, 0, 3), partner = nz(r, -6, 8), P = k * partner;
        divs = divisors(P, 12);
        if (!divs.length) continue;
        f = pick(r, divs) * sgn(r); g = P / f;
        // cells a b / c d: k's diagonal partner is 'partner', and the other diagonal multiplies to P
        var cells = [0, 0, 0, 0], other = [[3, 1, 2], [2, 0, 3], [1, 0, 3], [0, 1, 2]][pos], main = pos === 0 || pos === 3;
        cells[pos] = K; cells[other[0]] = partner; cells[other[1]] = f; cells[other[2]] = g;
        return { prompt: "This matrix is singular. Find " + K, html: mat([[cells[0], cells[1]], [cells[2], cells[3]]]), label: K, answer: k,
          why: "det = " + (main ? K + "·" + sp(partner) + mi + sp(f) + "·" + sp(g) : sp(f) + "·" + sp(g) + mi + K + "·" + sp(partner)) +
            " = 0, so " + K + " = " + sn(P) + " ÷ " + sp(partner) + " = " + sn(k) };
      }
    }
    for (;;) {
      var r1 = ri(r, 1, 8), r2 = -ri(r, 1, 8), p = ri(r, -5, 5), q = -(r1 + r2) - p;
      if (Math.abs(q) > 9) continue;
      var bc = p * q - r1 * r2;
      if (!bc) continue;
      divs = divisors(bc, 12);
      if (!divs.length) continue;
      f = pick(r, divs) * sgn(r); g = bc / f;
      return { prompt: "This matrix is singular. Find the positive " + K, html: mat([[lin([[1, K], [p]]), f], [g, lin([[1, K], [q]])]]), label: K, answer: r1,
        why: "det = (" + lin([[1, K], [p]]) + ")(" + lin([[1, K], [q]]) + ")" + mi + sp(f) + "·" + sp(g) + " = " + lin([[1, pw(K, 2)], [-(r1 + r2), K], [r1 * r2]]) +
          " = (" + lin([[1, K], [-r1]]) + ")(" + lin([[1, K], [-r2]]) + "), so " + K + " = " + r1 + " (or " + sn(r2) + ")" };
    }
  });

  // The 21X hand: choose X (a whole number, never 0) so the cards total exactly 21. N = cards in the hand.
  function qneg(q) { return X21.qsub(X21.Q(0), q); }
  function qsum(vals) {
    return vals.map(function (q, i) { return i === 0 ? X21.qhtml(q) : q.n < 0n ? mi + X21.qhtml(qneg(q)) : " + " + X21.qhtml(q); }).join("");
  }
  function linQ(lf, X) {
    var a = lf.a, b = lf.b;
    var s = X21.qeq(a, X21.Q(1)) ? X : X21.qeq(a, X21.Q(-1)) ? M + X : X21.qhtml(a) + X;
    if (b.n !== 0n) s += b.n < 0n ? mi + X21.qhtml(qneg(b)) : " + " + X21.qhtml(b);
    return s;
  }
  T(LINEAR, "x21", [2, 3], "eq", function (r, t, ctx) {
    var X = v("X"), n = t === 2 ? 2 : 3, pool = ctx.cards.filter(function (c) { return c.level <= t; }), hand = null, sols;
    for (var tries = 0; tries < 500 && !hand; tries++) {
      var h = shuffle(pool.slice(), r).slice(0, n);
      if (!h.some(function (c) { return c.vars.X; }) || (t === 3 && !h.some(function (c) { return c.level >= 2; }))) continue;
      sols = X21.solveX(h, 30);
      if (sols.length && sols.length <= 2 && Math.abs(sols[0]) <= (t === 2 ? 8 : 10)) hand = h;
    }
    if (!hand) {                                     // the rulebook's example hand
      hand = ["6X", "2X+4", "X/2"].map(function (f) { return ctx.cards.filter(function (c) { return c.formula === f; })[0]; });
      sols = X21.solveX(hand, 30);
    }
    var x = sols[0], ev = X21.evalHand(hand, x), lf = X21.linearForm(hand);
    return {
      prompt: "21X: choose " + X + " so the cards total 21", cards: hand,
      html: '<div class="hand">' + hand.map(function (c) { return X21.cardHtml(c); }).join("") + '</div><div class="nline">' + v("N") + " = " + hand.length + " cards</div>",
      label: X, answer: x, check: function (val) { return X21.makes21(hand, val); },
      why: (lf && lf.a.n !== 0n ? "Total = " + linQ(lf, X) + " = 21, so " + X + " = " + sn(x) + ". " : "") +
        "At " + X + " = " + sn(x) + ": " + qsum(ev.values) + " = 21" + (sols.length > 1 ? " (" + X + " = " + sn(sols[1]) + " works too)" : "")
    };
  });

  /* ------------------------- linear algebra: vectors & matrices ------------------------- */
  function mpow(m, e) { return '<span class="msup">' + m + "<sup>" + e + "</sup></span>"; }

  T(LINEAR, "dot", [1, 2], "mat", function (r, t) {
    var n = t === 1 ? 2 : 3, lo = t === 1 ? -5 : -6, u = [], vv = [];
    for (var i = 0; i < n; i++) { u.push(nz(r, lo, 9)); vv.push(nz(r, lo, 9)); }
    var pairs = u.map(function (x, k) { return [x, vv[k]]; });
    return { prompt: "Dot product", html: col(u) + o("·") + col(vv), answer: pairs.reduce(function (s, p) { return s + p[0] * p[1]; }, 0), why: dotWhy(pairs) };
  });

  T(LINEAR, "comb", [1], "mat", function (r) {
    var n = ri(r, 2, 3), u = [], vv = [], al = pick(r, [2, 3, 4, -1, -2]), be = pick(r, [1, 2, 3, -1, -2, -3]), i = ri(r, 0, n - 1);
    for (var k = 0; k < n; k++) { u.push(ri(r, -5, 8)); vv.push(ri(r, -5, 8)); }
    var U = v("u"), V = v("v"), val = al * u[i] + be * vv[i];
    return { prompt: "Linear combination: " + ORD[i + 1] + " entry", html: U + EQ + col(u) + '<span class="gap"></span>' + V + EQ + col(vv),
      label: "(" + lin([[al, U], [be, V]]) + ")" + sub(i + 1), answer: val,
      why: sp(al) + "·" + sp(u[i]) + " + " + sp(be) + "·" + sp(vv[i]) + " = " + sumText([al * u[i], be * vv[i]]) + " = " + sn(val) };
  });

  T(LINEAR, "det2", [1, 2], "mat", function (r, t) {
    var a, b, c, d;
    if (t === 1) { a = ri(r, 1, 9); b = ri(r, 1, 9); c = ri(r, 1, 9); d = ri(r, 1, 9); }
    else do { a = nz(r, -9, 12); b = nz(r, -9, 12); c = nz(r, -9, 12); d = nz(r, -9, 12); } while (a > 0 && b > 0 && c > 0 && d > 0);
    var D = a * d - b * c;
    return { prompt: "Determinant", html: mat([[a, b], [c, d]], true), answer: D,
      why: v("ad") + mi + v("bc") + " = " + sp(a) + "·" + sp(d) + mi + sp(b) + "·" + sp(c) + " = " + sn(a * d) + mi + sp(b * c) + " = " + sn(D) };
  });

  function det2v(m) { return m[0][0] * m[1][1] - m[0][1] * m[1][0]; }
  function minor(m, i, j) {
    return m.filter(function (_, p) { return p !== i; }).map(function (row) { return row.filter(function (_, q) { return q !== j; }); });
  }
  function det3v(m) { return m[0][0] * det2v(minor(m, 0, 0)) - m[0][1] * det2v(minor(m, 0, 1)) + m[0][2] * det2v(minor(m, 0, 2)); }
  T(LINEAR, "det3", [3], "mat", function (r) {
    var m, D;
    do {
      m = [0, 1, 2].map(function () { return [0, 1, 2].map(function () { return ri(r, -3, 5); }); });
      shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8], r).slice(0, ri(r, 2, 4)).forEach(function (k) { m[Math.floor(k / 3)][k % 3] = 0; });
      D = det3v(m);
    } while (Math.abs(D) > 99 || (D === 0 && r() < 0.85));
    var best = null;                                 // expand along the line with the most zeros
    for (var k = 0; k < 6; k++) {
      var line = [0, 1, 2].map(function (j) { return k < 3 ? [k, j] : [j, k - 3]; });
      var z = line.filter(function (p) { return m[p[0]][p[1]] === 0; }).length;
      if (!best || z > best.z) best = { z: z, line: line, name: k < 3 ? "row " + (k + 1) : "column " + (k - 2), signs: k % 2 ? "− + −" : "+ − +" };
    }
    var terms = best.line.filter(function (p) { return m[p[0]][p[1]] !== 0; }).map(function (p) {
      return { c: ((p[0] + p[1]) % 2 ? -1 : 1) * m[p[0]][p[1]], minor: det2v(minor(m, p[0], p[1])) };
    });
    var why = !terms.length ? "A whole " + best.name + " is zero, so the determinant is 0" :
      "Expand along " + best.name + " (signs " + best.signs + "), each entry times its 2×2 minor: " + terms.map(function (tm, i) {
        return (i === 0 ? sn(tm.c) : tm.c < 0 ? mi + -tm.c : " + " + tm.c) + "·" + sp(tm.minor);
      }).join("") + " = " + sn(D);
    return { prompt: "Determinant", html: mat(m, true), answer: D, why: why };
  });

  T(LINEAR, "matvec", [1, 2], "mat", function (r, t) {
    var n = t === 1 ? 2 : 3, A = [], x = [], i = ri(r, 0, n - 1);
    for (var p = 0; p < n; p++) {
      A.push([]);
      for (var q = 0; q < n; q++) A[p].push(t === 1 ? ri(r, -3, 7) : ri(r, -2, 5));
      x.push(t === 1 ? nz(r, -4, 6) : nz(r, -3, 5));
    }
    var pairs = A[i].map(function (a, q) { return [a, x[q]]; });
    return { prompt: "Matrix × vector: " + ORD[i + 1] + " entry", html: mat(A) + col(x), label: w("entry " + (i + 1)),
      answer: pairs.reduce(function (s, pr) { return s + pr[0] * pr[1]; }, 0), why: "Row " + (i + 1) + " · the vector = " + dotWhy(pairs) };
  });

  T(LINEAR, "matmul", [2, 3], "mat", function (r, t) {
    var n = t === 2 ? 2 : 3, lo = t === 2 ? -3 : -2, hi = t === 2 ? 6 : 4, A = [], B = [], i = ri(r, 0, n - 1), j = ri(r, 0, n - 1);
    for (var p = 0; p < n; p++) {
      A.push([]); B.push([]);
      for (var q = 0; q < n; q++) { A[p].push(ri(r, lo, hi)); B[p].push(ri(r, lo, hi)); }
    }
    var pairs = A[i].map(function (a, k) { return [a, B[k][j]]; });
    return { prompt: "Matrix product: row " + (i + 1) + ", column " + (j + 1), html: mat(A) + mat(B), label: w("entry (" + (i + 1) + ", " + (j + 1) + ")"),
      answer: pairs.reduce(function (s, pr) { return s + pr[0] * pr[1]; }, 0),
      why: "Row " + (i + 1) + " of the left · column " + (j + 1) + " of the right = " + dotWhy(pairs) };
  });

  T(LINEAR, "trace", [2], "mat", function (r) {
    var a = ri(r, -4, 6), b = nz(r, -4, 6), c = nz(r, -4, 6), d = ri(r, -4, 6), A = v("A"), B = v("B"), tr = fn("tr");
    if (r() < 0.5) {
      var s = a * a + 2 * b * c + d * d;
      return { prompt: "Trace", html: A + EQ + mat([[a, b], [c, d]]), label: tr + "(" + pw(A, 2) + ")", answer: s,
        why: tr + "(" + pw(A, 2) + ") = " + pw(v("a"), 2) + " + 2" + v("bc") + " + " + pw(v("d"), 2) + " = " + sumText([a * a, 2 * b * c, d * d]) + " = " + sn(s) };
    }
    var e = ri(r, -3, 6), f = ri(r, -3, 6), g = ri(r, -3, 6), h = ri(r, -3, 6), s2 = a * e + b * g + c * f + d * h;
    return { prompt: "Trace", html: A + EQ + mat([[a, b], [c, d]]) + '<span class="gap"></span>' + B + EQ + mat([[e, f], [g, h]]),
      label: tr + "(" + A + B + ")", answer: s2,
      why: "(" + A + B + ")" + sub(11) + " + (" + A + B + ")" + sub(22) + " = " + prodSum([[a, e], [b, g]]) + " + " + prodSum([[c, f], [d, h]]) + " = " + sn(s2) };
  });

  T(LINEAR, "eig", [3], "mat", function (r) {
    var l1, l2, a, b, c, d, bc, big = r() < 0.6, divs;
    for (;;) {
      l1 = ri(r, -5, 9); l2 = ri(r, -5, 9);
      if (l1 === l2) continue;
      if (l1 < l2) { a = l1; l1 = l2; l2 = a; }
      a = ri(r, -4, 9); d = l1 + l2 - a;
      if (Math.abs(d) > 9) continue;
      bc = a * d - l1 * l2;
      if (bc === 0) {
        if (r() < 0.85) continue;
        b = nz(r, -6, 6); c = 0;
        if (r() < 0.5) { c = b; b = 0; }
        break;
      }
      divs = divisors(bc, 9);
      if (!divs.length) continue;
      b = pick(r, divs) * sgn(r); c = bc / b;
      break;
    }
    var tr = l1 + l2, det = l1 * l2, L = v("λ");
    return { prompt: (big ? "Larger" : "Smaller") + " eigenvalue", html: mat([[a, b], [c, d]]), label: L, answer: big ? l1 : l2,
      why: "Trace " + sn(tr) + ", det " + sn(det) + ": " + lin([[1, pw(L, 2)], [-tr, L], [det]]) + " = (" + lin([[1, L], [-l1]]) + ")(" + lin([[1, L], [-l2]]) +
        ") = 0, so " + L + " = " + sn(l1) + " or " + sn(l2) };
  });

  T(LINEAR, "inv", [3], "mat", function (r) {
    var a, b, c, d, det, divs;
    for (;;) {
      det = r() < 0.75 ? 1 : -1; a = nz(r, -5, 7); d = nz(r, -5, 7);
      var bc = a * d - det;
      if (!bc) continue;
      divs = divisors(bc, 9);
      if (!divs.length) continue;
      b = pick(r, divs) * sgn(r); c = bc / b;
      break;
    }
    var inv = [[d * det, -b * det], [-c * det, a * det]], i = ri(r, 0, 1), j = ri(r, 0, 1);
    return { prompt: "Inverse: row " + (i + 1) + ", column " + (j + 1), html: mpow(mat([[a, b], [c, d]]), M + "1"), label: w("entry (" + (i + 1) + ", " + (j + 1) + ")"),
      answer: inv[i][j],
      why: "det = " + sp(a) + "·" + sp(d) + mi + sp(b) + "·" + sp(c) + " = " + sn(det) + ". Swap the diagonal, negate the other two" +
        (det < 0 ? ", then divide by " + M + "1" : "") + ": " + mat(inv) };
  });

  var TRIPLES = [[3, 4, 5], [5, 12, 13], [8, 15, 17], [7, 24, 25], [6, 8, 10], [9, 12, 15], [20, 21, 29], [12, 16, 20]];
  var QUADS = [[1, 2, 2, 3], [2, 3, 6, 7], [1, 4, 8, 9], [4, 4, 7, 9], [2, 6, 9, 11], [6, 6, 7, 11], [3, 4, 12, 13],
    [2, 5, 14, 15], [2, 10, 11, 15], [1, 12, 12, 17], [8, 9, 12, 17], [6, 10, 15, 19], [2, 4, 4, 6], [4, 8, 8, 12]];
  T(LINEAR, "norm", [2, 3], "mat", function (r, t) {
    var row = pick(r, t === 2 ? TRIPLES : QUADS), n = row.length - 1, len = row[n];
    var comps = shuffle(row.slice(0, n), r).map(function (x) { return x * sgn(r); });
    return { prompt: "Length of the vector", html: '<span class="nrm">' + col(comps) + "</span>", answer: len,
      why: "√(" + comps.map(function (x) { return x * x; }).join(" + ") + ") = √" + len * len + " = " + len };
  });

  T(LINEAR, "cross", [3], "mat", function (r) {
    var u = [], vv = [], k = ri(r, 0, 2), U = v("u"), V = v("v");
    for (var i = 0; i < 3; i++) { u.push(ri(r, -3, 5)); vv.push(ri(r, -3, 5)); }
    var I = (k + 1) % 3, J = (k + 2) % 3, val = u[I] * vv[J] - u[J] * vv[I];
    return { prompt: "Cross product: " + ORD[k + 1] + " entry", html: col(u) + o("×") + col(vv), label: w("entry " + (k + 1)), answer: val,
      why: U + sub(I + 1) + V + sub(J + 1) + mi + U + sub(J + 1) + V + sub(I + 1) + " = " + sp(u[I]) + "·" + sp(vv[J]) + mi + sp(u[J]) + "·" + sp(vv[I]) + " = " + sn(val) };
  });

  T(LINEAR, "detprop", [2, 3], "mat", function (r, t) {
    var n = ri(r, 2, 3), dA = nz(r, -5, 6), dB = nz(r, -4, 5), k = pick(r, [2, 3, -1, -2]), kn = Math.pow(k, n);
    var A = v("A"), B = v("B"), det = fn("det"), K = k === -1 ? M : sn(k), Kn = sp(k) + "<sup>" + n + "</sup>";
    var form = t === 2 ? pick(r, ["kA", "AB", "AtB", "A2"]) : pick(r, ["kAB", "kAinvB", "A2B", "kAt"]);
    var useB = /B/.test(form), lab, ans, why, notes = [];
    if (form === "kAinvB") {
      var ds = [];
      for (var f = 1; f <= 6; f++) if ((kn * dB) % f === 0) ds.push(f);
      dA = pick(r, ds) * sgn(r);
    }
    switch (form) {
      case "kA": lab = K + A; ans = kn * dA; why = Kn + " · " + sp(dA); break;
      case "AB": lab = A + B; ans = dA * dB; why = sp(dA) + " · " + sp(dB); break;
      case "AtB": lab = pw(A, "T") + B; ans = dA * dB; why = sp(dA) + " · " + sp(dB); break;
      case "A2": lab = pw(A, 2); ans = dA * dA; why = sp(dA) + "²"; break;
      case "kAB": lab = K + A + B; ans = kn * dA * dB; why = Kn + " · " + sp(dA) + " · " + sp(dB); break;
      case "kAinvB": lab = K + pw(A, M + "1") + B; ans = kn * dB / dA; why = Kn + " · " + sp(dB) + " ÷ " + sp(dA); break;
      case "A2B": lab = pw(A, 2) + B; ans = dA * dA * dB; why = sp(dA) + "² · " + sp(dB); break;
      default: lab = K + pw(A, "T"); ans = kn * dA; why = Kn + " · " + sp(dA);
    }
    if (/^k/.test(form)) notes.push("Scaling an " + n + " × " + n + " matrix by " + sn(k) + " scales its determinant by " + Kn + ".");
    if (/t/.test(form)) notes.push("Transposing doesn't change a determinant.");
    if (/inv/.test(form)) notes.push(fn("det") + " " + pw(A, M + "1") + " = 1 ÷ " + fn("det") + " " + A + ".");
    return {
      prompt: "Determinant rules", label: det + "(" + lab + ")", answer: ans,
      html: stack([(useB ? A + ", " + B + " " + w("are") : A + " " + w("is")) + " " + n + " × " + n,
        det + " " + A + EQ + sn(dA) + (useB ? '<span class="gap"></span>' + det + " " + B + EQ + sn(dB) : "")]),
      why: det + "(" + lab + ") = " + why + " = " + sn(ans) + (notes.length ? ". " + notes.join(" ") : "")
    };
  });

  /* ============================ rounds ============================ */
  var CATS = {
    mental: { name: "Mental maths", list: MENTAL, required: [] },
    linear: { name: "Linear algebra", list: LINEAR, required: ["x21"] }      // every linear round has one 21X hand
  };
  // the tier each of the 10 questions is drawn from: a warm-up, then harder
  var RAMPS = {
    gentle:   [1, 1, 1, 1, 1, 1, 2, 2, 2, 2],
    standard: [1, 1, 1, 2, 2, 2, 2, 3, 3, 3],
    spicy:    [1, 2, 2, 2, 3, 3, 3, 3, 3, 3]
  };
  // ctx: {cards} (the 21X deck; without it the 21X hand question is left out)
  function makeRound(cat, diff, seed, ctx) {
    ctx = ctx || {};
    var r = mulberry32(seed), C = CATS[cat], ramp = RAMPS[diff] || RAMPS.standard;
    var pool = C.list.filter(function (t) { return t.type !== "x21" || (ctx.cards && ctx.cards.length); });
    var slots = ramp.map(function (tier) { return { tier: tier, tpl: null }; }), used = {}, fams = {};
    function take(s, tpl) { s.tpl = tpl; used[tpl.type] = true; fams[tpl.fam] = (fams[tpl.fam] || 0) + 1; }
    C.required.forEach(function (type) {
      var tpl = pool.filter(function (t) { return t.type === type; })[0];
      if (!tpl) return;
      var open = slots.filter(function (s) { return tpl.tiers.indexOf(s.tier) >= 0; });
      if (open.length) take(pick(r, open), tpl);
    });
    slots.forEach(function (s) {
      if (s.tpl) return;
      var fit = pool.filter(function (t) { return t.tiers.indexOf(s.tier) >= 0; });
      var fresh = fit.filter(function (t) { return !used[t.type]; });
      if (fresh.length) fit = fresh;
      var least = Math.min.apply(null, fit.map(function (t) { return fams[t.fam] || 0; }));   // keep the topics mixed
      take(s, pick(r, fit.filter(function (t) { return (fams[t.fam] || 0) === least; })));
    });
    return slots.map(function (s, k) {
      var q = s.tpl.gen(r, s.tier, ctx);
      q.type = s.tpl.type; q.fam = s.tpl.fam; q.tier = s.tier; q.n = k + 1;
      if (q.label === undefined) q.label = "";
      return q;
    });
  }
  function isRight(q, val) { return typeof val === "number" && (q.check ? q.check(val) : val === q.answer); }

  /* ============================ days & streaks ============================ */
  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  function dayKey(d) { d = d || new Date(); return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()); }
  function keyDate(k) { var p = k.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function addDays(k, n) { var d = keyDate(k); d.setDate(d.getDate() + n); return dayKey(d); }
  // everyone gets the same 10 questions for a given day, category and difficulty
  function dailySeed(k, cat, diff) { return hashStr(GEN + "|" + k + "|" + cat + "|" + diff); }
  // days: {"2026-10-27": {mental: record, linear: record}}; a day counts once any daily round is done
  function played(day) { return !!day && Object.keys(day).length > 0; }
  function streak(days, today) {
    var k = played(days[today]) ? today : addDays(today, -1), n = 0;
    while (played(days[k])) { n++; k = addDays(k, -1); }
    return n;
  }
  function bestStreak(days) {
    var best = 0, run = 0, prev = null;
    Object.keys(days).filter(function (k) { return played(days[k]); }).sort().forEach(function (k) {
      run = prev && addDays(prev, 1) === k ? run + 1 : 1;
      best = Math.max(best, run); prev = k;
    });
    return best;
  }

  var api = {
    ROUND: ROUND, GEN: GEN, CATS: CATS, RAMPS: RAMPS, MENTAL: MENTAL, LINEAR: LINEAR,
    mulberry32: mulberry32, hashStr: hashStr, shuffle: shuffle, det3v: det3v,
    makeRound: makeRound, isRight: isRight,
    dayKey: dayKey, keyDate: keyDate, addDays: addDays, dailySeed: dailySeed, played: played, streak: streak, bestStreak: bestStreak
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.TOT = api;
})(typeof window !== "undefined" ? window : this);
