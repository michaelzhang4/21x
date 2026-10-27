/* Train of Thought - DOM UI: screens, keypad, rounds (browser only) */
(function () {
  "use strict";
  var X21 = window.X21, T = window.TOT, esc = X21.esc, M = X21.MINUS;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var app = $("#app"), fxLayer = $("#fx");
  var LS = "tot:", CATS = ["mental", "linear"];

  /* ============================ data & settings ============================ */
  var CARDS = [], LOAD_ERR = "";
  try { CARDS = X21.loadCards($("#cards-csv").textContent); } catch (e) { LOAD_ERR = e.message; }
  var CTX = { cards: CARDS };

  function load(k, d) { try { var v = localStorage.getItem(LS + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem(LS + k, JSON.stringify(v)); } catch (e) {} }
  function drop(k) { try { localStorage.removeItem(LS + k); } catch (e) {} }
  var S = Object.assign({ diff: "standard", haptics: true }, load("settings", {}));
  if (!T.RAMPS[S.diff]) S.diff = "standard";
  function saveSettings() { save("settings", S); }
  var DAYS = load("days", {});                     // {"2026-10-27": {mental: record, linear: record}}
  function saveDays() { save("days", DAYS); }

  var CAT_INFO = {
    mental: { name: "Mental maths", blurb: "Arithmetic, percentages, squares and shortcuts" },
    linear: { name: "Linear algebra", blurb: "Equations, vectors, matrices and one 21X hand" }
  };
  var DIFF_INFO = {
    gentle: { name: "Gentle", note: "Six warm-ups, then four medium questions." },
    standard: { name: "Standard", note: "Three warm-ups, four medium, then three hard questions." },
    spicy: { name: "Spicy", note: "One warm-up, three medium, then six hard questions." }
  };

  function seed() { try { return crypto.getRandomValues(new Uint32Array(1))[0]; } catch (e) { return (Math.random() * 4294967296) >>> 0; } }
  function fmtTime(ms) {
    var t = Math.floor(Math.max(0, ms) / 100), m = Math.floor(t / 600), s = Math.floor(t / 10) % 60;
    return m + ":" + (s < 10 ? "0" : "") + s + "." + (t % 10);
  }
  function fmtSec(ms) { return (Math.max(0, ms) / 1000).toFixed(1) + " s"; }
  function sn(n) { return n < 0 ? M + -n : String(n); }
  function vibrate(p) { if (S.haptics) try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) {} }
  function today() { return T.dayKey(); }
  function niceDate(key, long) {
    return T.keyDate(key).toLocaleDateString(undefined, long ? { weekday: "long", day: "numeric", month: "long" } : { weekday: "short", day: "numeric", month: "short" });
  }
  function scoreOf(answers) { return answers.filter(function (a) { return a.ok; }).length; }
  function timeOf(answers) { return answers.reduce(function (s, a) { return s + a.ms; }, 0); }

  /* ============================ toasts & overlays ============================ */
  function toast(html) {
    Array.prototype.forEach.call(fxLayer.querySelectorAll(".toast"), function (el) { el.remove(); });
    var el = document.createElement("div");
    el.className = "toast"; el.innerHTML = html;
    fxLayer.appendChild(el);
    setTimeout(function () { el.remove(); }, 2700);
  }
  function overlay(html, dismissable) {
    closeOverlay();
    var el = document.createElement("div");
    el.className = "ov";
    el.innerHTML = '<div class="sheet">' + html + "</div>";
    if (dismissable) el.addEventListener("click", function (e) { if (e.target === el) closeOverlay(); });
    document.body.appendChild(el);
  }
  function closeOverlay() { var el = $(".ov"); if (el) el.remove(); }

  /* ============================ the clock ============================ */
  // Runs only while a question is waiting for an answer, so reading a worked solution
  // is free. Pausing (or the phone locking: rAF stops) freezes it.
  var clock = { t: 0, last: null, run: false, paused: false }, raf = 0;
  function frame(now) {
    if (clock.last !== null && clock.run && !clock.paused) clock.t += Math.min(now - clock.last, 250);
    clock.last = now;
    if (cur) tick();
    raf = requestAnimationFrame(frame);
  }
  function startClock(t0) { clock.t = t0 || 0; clock.last = null; clock.run = false; clock.paused = false; if (!raf) raf = requestAnimationFrame(frame); }
  function stopClock() { if (raf) cancelAnimationFrame(raf); raf = 0; clock.run = false; clock.paused = false; }

  /* ============================ a round ============================ */
  // cur: {cat, kind: "daily"|"extra", date, diff, seed, qs, i, answers: [{v, ok, ms}], input, phase: "ask"|"ok"|"fb"}
  var cur = null;
  function startRound(cat, kind, run) {
    endRound();
    var date = today(), diff = S.diff, sd = kind === "daily" ? T.dailySeed(date, cat, diff) : seed();
    if (run) { date = run.date; diff = run.diff; sd = run.seed; }
    cur = { cat: cat, kind: kind, date: date, diff: diff, seed: sd, qs: T.makeRound(cat, diff, sd, CTX), answers: run ? run.answers : [], input: "", phase: "ask" };
    cur.i = cur.answers.length;
    startClock(run ? run.t : 0);
    renderPlay();
    ask(run && run.qStart <= run.t ? run.qStart : null);
  }
  function ask(qStart) {
    cur.phase = "ask"; cur.input = "";
    cur.qStart = qStart == null ? clock.t : qStart;
    clock.run = true;
    renderAll();
  }
  function runKey(cat) { return "run-" + cat; }
  // a daily round in progress survives the app being closed (or the phone killing it)
  function saveRun() {
    if (!cur || cur.kind !== "daily") return;
    save(runKey(cur.cat), { date: cur.date, diff: cur.diff, seed: cur.seed, answers: cur.answers, t: Math.round(clock.t), qStart: Math.round(cur.qStart) });
  }
  function savedRun(cat) {
    var r = load(runKey(cat), null), t = today();
    if (!r || r.date !== t || doneToday(cat) || !Array.isArray(r.answers) || r.answers.length >= T.ROUND) return null;
    return r;
  }
  function doneToday(cat) { return !!(DAYS[today()] || {})[cat]; }

  function pressKey(k) {
    if (!cur || cur.phase !== "ask" || clock.paused) return;
    var s = cur.input;
    if (k === "back") s = s.slice(0, -1);
    else if (k === "neg") s = s.charAt(0) === "-" ? s.slice(1) : "-" + s;
    else {
      var digits = s.replace("-", "");
      if (digits.length >= 6) return;
      if (digits === "0") s = s.replace("0", "");     // no leading zeros
      s += k;
    }
    cur.input = s;
    renderAns();
  }
  function submit() {
    if (!cur || clock.paused) return;
    if (cur.phase === "ok" || cur.phase === "fb") return next();
    if (cur.input === "" || cur.input === "-") { toast("Type your answer first (or skip)"); return; }
    answer(parseInt(cur.input, 10));
  }
  function skip() { if (cur && cur.phase === "ask" && !clock.paused) answer(null); }
  function answer(val) {
    var q = cur.qs[cur.i], ok = T.isRight(q, val);
    clock.run = false;
    cur.answers.push({ v: val, ok: ok, ms: Math.max(0, Math.round(clock.t - cur.qStart)) });
    saveRun();
    cur.phase = ok ? "ok" : "fb";
    vibrate(ok ? 18 : [15, 50, 15]);
    renderAll();
    if (ok) cur.timer = setTimeout(next, 650);
  }
  function next() {
    if (!cur) return;
    clearTimeout(cur.timer);
    if (cur.phase !== "ok" && cur.phase !== "fb") return;
    cur.i++;
    if (cur.i >= cur.qs.length) return finish();
    ask();
  }
  function finish() {
    var r = cur, first = false;
    stopClock();
    var rec = {
      score: scoreOf(r.answers), ms: timeOf(r.answers), diff: r.diff, at: Date.now(),
      a: r.answers.map(function (a, k) { return { v: a.v, ok: a.ok, ms: a.ms, c: r.qs[k].answer, t: r.qs[k].type }; })
    };
    if (r.kind === "daily") {
      DAYS[r.date] = DAYS[r.date] || {};
      if (!DAYS[r.date][r.cat]) { DAYS[r.date][r.cat] = rec; first = true; saveDays(); }
      drop(runKey(r.cat));
    }
    cur = null;
    vibrate(rec.score === T.ROUND ? [30, 40, 30] : 30);
    resultsScreen({ cat: r.cat, kind: r.kind, date: r.date, diff: r.diff, qs: r.qs, answers: r.answers }, first);
  }
  function endRound() { if (cur) clearTimeout(cur.timer); stopClock(); cur = null; closeOverlay(); }

  /* ============================ play screen ============================ */
  var KEYS = ["1", "2", "3", "back", "4", "5", "6", "neg", "7", "8", "9", "0"];
  var KEYS_HTML = '<div class="keys" id="g-keys">' + KEYS.map(function (k) {
    var lab = k === "back" ? "⌫" : k === "neg" ? "±" : k, aria = k === "back" ? "delete" : k === "neg" ? "plus or minus" : k;
    return '<button class="key' + (k.length > 1 ? " alt" : "") + '" data-act="key" data-arg="' + k + '" aria-label="' + aria + '">' + lab + "</button>";
  }).join("") + "</div>";
  function lineHtml(answers, at, big) {
    var n = T.ROUND, stops = "";
    for (var k = 0; k < n; k++) {
      var a = answers[k];
      stops += '<i class="' + (a ? (a.ok ? "ok" : a.v === null ? "sk" : "no") : k === at ? "cur" : "") + '"></i>';
    }
    return '<span class="line' + (big ? " big" : "") + '" style="--f:' + Math.max(0, Math.min(at, n - 1) / (n - 1)).toFixed(3) + '" aria-hidden="true">' + stops + "</span>";
  }
  function renderPlay() {
    app.innerHTML = '<div class="game" id="g"><div class="bar"><button class="ib" data-act="pause" aria-label="Pause">❚❚</button>' +
      '<span class="ttl">' + CAT_INFO[cur.cat].name + '</span><span class="sp"></span>' +
      '<span class="chip">⏱ <span id="g-clock">' + fmtTime(clock.t) + '</span></span><button class="skip" id="g-skip" data-act="skip">Skip</button></div>' +
      '<span id="g-line"></span>' +
      '<div class="stage" id="g-stage"><div class="qp" id="g-prompt"></div><div class="qx" id="g-q"></div><div class="fbk" id="g-fb" aria-live="polite"></div></div>' +
      '<div class="pad"><div class="ans" id="g-ans"></div>' + KEYS_HTML + '<button class="go" id="g-go" data-act="go"></button></div></div>';
  }
  function setHtml(id, html) { var el = document.getElementById(id); if (el) el.innerHTML = html; return el; }
  function renderAll() {
    if (!cur || !$("#g")) return;
    var q = cur.qs[cur.i], ask = cur.phase === "ask";
    var lineEl = $("#g-line");
    lineEl.outerHTML = lineHtml(cur.answers, cur.i).replace('<span class="line', '<span id="g-line" class="line');
    setHtml("g-prompt", '<span class="dim">' + q.n + " / " + T.ROUND + "</span> · " + q.prompt);
    setHtml("g-q", q.html);
    renderAns(); renderFb();
    setHtml("g-go", ask ? "Submit" : cur.phase === "ok" ? "Next ›" : cur.i + 1 >= T.ROUND ? "See results ›" : "Next question ›");
    $("#g-keys").classList.toggle("off", !ask);
    $("#g-skip").disabled = !ask;
    fitQ();
  }
  function answerText(q) {
    var alt = q.cards ? X21.solveX(q.cards, 30).filter(function (x) { return x !== q.answer; }) : [];
    return (q.label ? q.label + " = " : "") + sn(q.answer) + (alt.length ? " (or " + alt.map(sn).join(", ") + ")" : "");
  }
  function renderAns() {
    var el = $("#g-ans");
    if (!el) return;
    var q = cur.qs[cur.i], a = cur.answers[cur.i], val;
    if (cur.phase === "ask") val = cur.input === "" ? '<span class="ph">?</span>' : esc(cur.input.replace("-", M));
    else if (a.v === null) val = '<span class="dim">skipped</span>';
    else val = '<span class="you">' + sn(a.v) + "</span>" + (a.ok ? " ✓" : "");
    el.className = "ans" + (cur.phase === "ok" ? " good" : cur.phase === "fb" ? " bad" : "");
    el.innerHTML = (q.label ? '<span class="lab">' + q.label + '</span><span class="eqs">=</span>' : "") + "<span>" + val + "</span>";
  }
  function renderFb() {
    var q = cur.qs[cur.i], a = cur.answers[cur.i], h = "";
    if (cur.phase === "ok") h = '<b class="good">✓ Correct</b> <span class="dim">' + fmtSec(a.ms) + "</span>";
    else if (cur.phase === "fb") {
      h = '<b class="bad">' + (a.v === null ? "Skipped." : "✗ Not quite.") + "</b> The answer is <b>" + answerText(q) + "</b>" +
        '<div class="why">' + q.why + "</div>";
    }
    setHtml("g-fb", h);
  }
  function tick() { var el = document.getElementById("g-clock"); if (el) el.textContent = fmtTime(clock.t); }
  // size the question to the space between the prompt and the keypad
  function fitQ() {
    var stage = $("#g-stage"), qx = $("#g-q");
    if (!stage || !qx) return;
    var cs = getComputedStyle(stage), gap = parseFloat(cs.rowGap) || 8;
    var W = stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    var H = stage.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - $("#g-prompt").offsetHeight - $("#g-fb").offsetHeight - 2 * gap - 4;
    var hand = qx.querySelector(".hand");
    if (hand) {
      var n = hand.children.length, g = 8, nl = qx.querySelector(".nline");
      qx.style.fontSize = "";
      var cw = Math.floor(Math.min(150, (W - (n - 1) * g) / n, (H - (nl ? nl.offsetHeight + 8 : 0)) / 1.4));
      hand.style.setProperty("--cw", Math.max(48, cw) + "px");
      hand.style.setProperty("--gap", g + "px");
      return;
    }
    var base = 54;
    qx.style.fontSize = base + "px";
    var s = Math.min(1, W / Math.max(1, qx.scrollWidth), H / Math.max(1, qx.scrollHeight));
    qx.style.fontSize = Math.max(15, Math.floor(base * s * 0.98)) + "px";
  }
  window.addEventListener("resize", function () { if (cur) fitQ(); });

  /* ============================ pause ============================ */
  function pause() {
    if (!cur || clock.paused) return;
    clock.paused = true;
    saveRun();
    var g = $("#g"); if (g) g.classList.add("paused");
    overlay("<h2>Paused</h2><p class=\"note\">The clock is stopped and the question is hidden." +
      (cur.kind === "daily" ? " Your progress is saved, so you can pick this round up later today." : "") + "</p>" +
      '<div class="btns"><button class="btn" data-act="home">' + (cur.kind === "daily" ? "Save &amp; exit" : "Quit round") + '</button><button class="btn gold" data-act="resume">Resume</button></div>');
  }
  function resume() {
    closeOverlay();
    clock.paused = false;
    var g = $("#g"); if (g) g.classList.remove("paused");
  }
  window.addEventListener("pagehide", function () { saveRun(); });

  /* ============================ results ============================ */
  function verdictFor(r) {
    if (r.kind === "extra") return '<span class="dim">Extra round: not saved to your history.</span>';
    var score = scoreOf(r.answers), ms = timeOf(r.answers), lines = [];
    // earlier daily rounds in this category at this difficulty
    var prev = Object.keys(DAYS).filter(function (k) { return k < r.date && DAYS[k][r.cat] && DAYS[k][r.cat].diff === r.diff; }).sort()
      .map(function (k) { return DAYS[k][r.cat]; });
    var perfect = prev.filter(function (p) { return p.score === T.ROUND; }).map(function (p) { return p.ms; });
    var best = perfect.length ? Math.min.apply(null, perfect) : null;
    if (score === T.ROUND) {
      lines.push(best === null ? '<span class="good">Perfect round!</span>' : ms < best ? '<span class="good">Perfect, and your fastest yet</span> <span class="dim">(was ' + fmtTime(best) + ")</span>" :
        '<span class="good">Perfect round.</span> <span class="dim">Fastest: ' + fmtTime(best) + "</span>");
    }
    var last = prev.slice(-7);
    if (last.length >= 2) {
      var avgS = last.reduce(function (s, p) { return s + p.score; }, 0) / last.length, avgT = last.reduce(function (s, p) { return s + p.ms; }, 0) / last.length, d = ms - avgT;
      lines.push('<span class="dim">Your last ' + last.length + " rounds averaged " + avgS.toFixed(1) + "/" + T.ROUND + " in " + fmtTime(avgT) + ".</span> " +
        (d < 0 ? '<span class="good">' + fmtSec(-d) + " faster</span>" : '<span class="warn">' + fmtSec(d) + " slower</span>"));
    }
    var st = T.streak(DAYS, today());
    if (r.date === today() && st >= 2) lines.push("🔥 " + st + " days in a row");
    return lines.join("<br>");
  }
  function reviewList(r) {
    return '<ol class="rev">' + r.qs.map(function (q, k) {
      var a = r.answers[k] || { v: null, ok: false, ms: 0 };
      var said = a.ok ? '<span class="good">✓ ' + (q.label ? q.label + " = " : "") + sn(a.v) + "</span>" :
        (a.v === null ? '<span class="dim">Skipped</span>' : 'You said <b class="bad">' + sn(a.v) + "</b>") + " · answer <b>" + answerText(q) + "</b>";
      return '<li class="' + (a.ok ? "ok" : "no") + '"><div class="rh"><span>' + q.n + ". " + q.prompt + "</span><span>" + fmtSec(a.ms) + "</span></div>" +
        '<div class="rq">' + q.html + '</div><div class="ra">' + said + '</div><div class="why">' + q.why + "</div></li>";
    }).join("") + "</ol>";
  }
  function resultsScreen(r) {
    screen = "results";
    window.scrollTo(0, 0);
    var score = scoreOf(r.answers), ms = timeOf(r.answers), other = r.cat === "mental" ? "linear" : "mental";
    var nextBtn = r.kind === "daily" && !doneToday(other) ? '<button class="btn gold" data-act="play" data-arg="' + other + '">' + CAT_INFO[other].name + " ›</button>" :
      '<button class="btn gold" data-act="extra">Extra round</button>';
    app.innerHTML = '<div class="menu">' + topBar(CAT_INFO[r.cat].name + (r.kind === "extra" ? " · extra" : "")) +
      '<p class="note" style="margin:-6px 0 14px">' + niceDate(r.date, true) + " · " + DIFF_INFO[r.diff].name + "</p>" +
      lineHtml(r.answers, T.ROUND, true) +
      '<div class="score"><div><b>' + score + '<span class="dim">/' + T.ROUND + "</span></b><small>correct</small></div><div><b>" + fmtTime(ms) + "</b><small>" +
      fmtSec(ms / Math.max(1, r.answers.length)) + " per question</small></div></div>" +
      '<div class="verdict">' + verdictFor(r) + "</div>" +
      '<div class="btns"><button class="btn" data-act="home">Home</button>' + nextBtn + "</div>" +
      (r.qs ? '<div class="sect" style="padding-bottom:4px"><h3>Review</h3>' + reviewList(r) + "</div>" :
        '<p class="note">These questions came from an older version of the app, so they can\'t be shown again.</p>') + "</div>";
  }
  function play(cat) {
    if (doneToday(cat)) return reviewToday(cat);
    startRound(cat, "daily", savedRun(cat));
  }
  function reviewToday(cat) {
    var t = today(), rec = DAYS[t][cat], qs = T.makeRound(cat, rec.diff, T.dailySeed(t, cat, rec.diff), CTX);
    if (!Array.isArray(rec.a) || qs.some(function (q, k) { return !rec.a[k] || rec.a[k].c !== q.answer; })) qs = null;
    endRound();
    resultsScreen({ cat: cat, kind: "daily", date: t, diff: rec.diff, qs: qs, answers: rec.a || [] });
  }
  function extraMenu() {
    overlay("<h2>Extra round</h2><p class=\"note\">Ten random questions at " + DIFF_INFO[S.diff].name.toLowerCase() +
      " difficulty. Extra rounds don't go into your history or streak.</p>" +
      '<div class="btns"><button class="btn gold" data-act="extrago" data-arg="mental">Mental maths</button><button class="btn gold" data-act="extrago" data-arg="linear">Linear algebra</button></div>' +
      '<div class="btns one"><button class="btn" data-act="close">Cancel</button></div>', true);
  }

  /* ============================ menu screens ============================ */
  var screen = "home";
  function topBar(title) { return '<div class="top"><button class="ib" data-act="home" aria-label="Back">‹</button><h2>' + title + "</h2></div>"; }
  function dayCard(cat) {
    var rec = (DAYS[today()] || {})[cat], run = !rec && savedRun(cat), st, line;
    if (rec) { st = '<span class="good">✓ ' + rec.score + "/" + T.ROUND + "</span> · " + fmtTime(rec.ms); line = lineHtml(rec.a || [], T.ROUND); }
    else if (run) { st = '<span class="warn">Resume · ' + (run.answers.length + 1) + "/" + T.ROUND + "</span>"; line = lineHtml(run.answers, run.answers.length); }
    else { st = '<span class="hl">Start ›</span>'; line = lineHtml([], -1); }
    return '<button class="day' + (rec ? " done" : "") + '" data-act="play" data-arg="' + cat + '"><span class="dh"><b>' + CAT_INFO[cat].name +
      '</b><span class="st">' + st + "</span></span><small>" + CAT_INFO[cat].blurb + "</small>" + line + "</button>";
  }
  function homeScreen() {
    var t = today(), st = T.streak(DAYS, t);
    app.innerHTML = '<div class="menu"><div class="hero"><span>' + niceDate(t, true) + "</span>" +
      (st ? '<span class="chip" title="days in a row">🔥 ' + st + "</span>" : "") + "</div>" +
      '<div class="logo">Train of <i>Thought</i></div><div class="tag">Ten questions a round, two rounds a day.</div>' +
      (LOAD_ERR ? '<div class="err">Card list error: ' + esc(LOAD_ERR) + ". The 21X hands are switched off.</div>" : "") +
      CATS.map(dayCard).join("") +
      '<div class="row3"><button class="btn" data-act="extra">Extra round</button><button class="btn" data-act="history">History</button><button class="btn" data-act="settings">Settings</button></div>' +
      '<div class="foot">' + DIFF_INFO[S.diff].name + ' difficulty · <a href="#" data-act="help">How it works</a><br>Your scores stay on this device.</div></div>';
  }
  function tile(big, small) { return '<div class="tile"><b>' + big + "</b><small>" + small + "</small></div>"; }
  function historyScreen() {
    var keys = Object.keys(DAYS).filter(function (k) { return T.played(DAYS[k]); }).sort().reverse(), perfect = 0;
    keys.forEach(function (k) { CATS.forEach(function (c) { if (DAYS[k][c] && DAYS[k][c].score === T.ROUND) perfect++; }); });
    function catStats(cat) {
      var recs = keys.filter(function (k) { return DAYS[k][cat]; }).map(function (k) { return DAYS[k][cat]; });
      if (!recs.length) return '<div class="sect"><h3>' + CAT_INFO[cat].name + '</h3><p class="note">No rounds yet.</p></div>';
      var last = recs.slice(0, 7), mine = recs.filter(function (r) { return r.diff === S.diff && r.score === T.ROUND; });
      var avgS = last.reduce(function (s, r) { return s + r.score; }, 0) / last.length, avgT = last.reduce(function (s, r) { return s + r.ms; }, 0) / last.length;
      var best = mine.length ? Math.min.apply(null, mine.map(function (r) { return r.ms; })) : null;
      return '<div class="sect"><h3>' + CAT_INFO[cat].name + '</h3><div class="tiles" style="margin:0">' +
        tile(avgS.toFixed(1) + '<span class="dim" style="font-size:.6em">/' + T.ROUND + "</span>", last.length > 1 ? "average score, last " + last.length : "score") +
        tile(fmtTime(avgT), last.length > 1 ? "average time, last " + last.length : "time") + tile(recs.length, recs.length === 1 ? "round" : "rounds") +
        tile(best === null ? "—" : fmtTime(best), "fastest 10/10, " + DIFF_INFO[S.diff].name.toLowerCase()) + "</div></div>";
    }
    function cell(r) { return r ? '<span class="pill' + (r.score === T.ROUND ? " p10" : "") + '">' + r.score + "/" + T.ROUND + "</span> " + fmtTime(r.ms) : '<span class="dim">—</span>'; }
    app.innerHTML = '<div class="menu">' + topBar("History") +
      '<div class="tiles">' + tile("🔥 " + T.streak(DAYS, today()), "day streak") + tile(T.bestStreak(DAYS), "best streak") +
      tile(keys.length, keys.length === 1 ? "day played" : "days played") + tile(perfect, "perfect rounds") + "</div>" +
      CATS.map(catStats).join("") +
      (keys.length ? '<div class="sect"><h3>Recent days</h3><table class="rec"><tr><th></th><th>Mental</th><th>Linear</th></tr>' +
        keys.slice(0, 60).map(function (k) { return "<tr><td>" + niceDate(k) + "</td><td>" + cell(DAYS[k].mental) + "</td><td>" + cell(DAYS[k].linear) + "</td></tr>"; }).join("") +
        "</table></div>" : '<p class="note">Finish a daily round and it will show up here.</p>') + "</div>";
  }
  function seg(act, opts, curv) {
    return '<div class="seg">' + opts.map(function (o) {
      return '<button data-act="' + act + '" data-arg="' + o[0] + '" class="' + (curv === o[0] ? "on" : "") + '">' + o[1] + "</button>";
    }).join("") + "</div>";
  }
  function tog(key, title, sub) {
    return '<div class="sw"><span>' + title + (sub ? "<small>" + sub + "</small>" : "") + '</span><button class="tog' + (S[key] ? " on" : "") +
      '" data-act="set" data-arg="' + key + '" role="switch" aria-checked="' + !!S[key] + '" aria-label="' + esc(title) + '"></button></div>';
  }
  function settingsScreen() {
    var n = Object.keys(DAYS).filter(function (k) { return T.played(DAYS[k]); }).length;
    app.innerHTML = '<div class="menu">' + topBar("Settings") +
      '<div class="sect"><h3>Difficulty</h3>' + seg("diff", [["gentle", "Gentle"], ["standard", "Standard"], ["spicy", "Spicy"]], S.diff) +
      '<p class="note">' + DIFF_INFO[S.diff].note + " Each difficulty has its own daily questions, and fastest times are compared within a difficulty. A round you've already started keeps its difficulty.</p></div>" +
      '<div class="sect"><h3>Feel</h3>' + tog("haptics", "Vibration", "A short buzz for right and wrong answers (Android only)") + "</div>" +
      '<div class="sect"><h3>History</h3><p class="note">' + n + (n === 1 ? " day" : " days") + ' recorded on this device.</p><button class="btn" data-act="wipe">Clear history</button></div></div>';
  }
  function helpScreen() {
    function li(a) { return "<ul>" + a.map(function (s) { return "<li>" + s + "</li>"; }).join("") + "</ul>"; }
    app.innerHTML = '<div class="menu">' + topBar("How it works") +
      '<div class="sect"><h3>Every day</h3><p>There are two daily rounds of ten questions: <b>Mental maths</b> and <b>Linear algebra</b>. ' +
      "The questions start as warm-ups and get harder. Everyone gets the same questions on the same day, and a new set arrives at midnight.</p>" +
      "<p>The clock only runs while a question is waiting for your answer. Your score is the number you get right, and your time is the total.</p></div>" +
      '<div class="sect"><h3>Answering</h3>' + li([
        "Every answer is a whole number. Use <b>±</b> for negatives.",
        "A wrong answer or a skip shows the right answer and a worked solution. Read it, then tap <b>Next</b>. The clock is stopped while you read.",
        "Pause any time with ❚❚. Locking your phone pauses too, and a daily round in progress is saved, so you can finish it later that day.",
        "Keyboard: type digits, <kbd>−</kbd> for the sign, <kbd>⌫</kbd> to delete, <kbd>Enter</kbd> to submit or move on, <kbd>Esc</kbd> to pause."]) + "</div>" +
      '<div class="sect"><h3>Mental maths</h3><p>Addition, subtraction, multiplication and division; percentages and fractions of amounts; squares, square roots and powers; ' +
      "order of operations; remainders; averages; series; and multiplication shortcuts like ×25, ×11, ×99 and (50 − 3)(50 + 3).</p>" +
      '<p class="note">The worked answers show the shortcut: round and adjust (47 + 38 = 47 + 40 − 2), split a factor (67 × 8 = 480 + 56), ' +
      "square from a round number ((70 − 3)² = 4900 − 420 + 9), or use digit sums for remainders.</p></div>" +
      '<div class="sect"><h3>Linear algebra</h3><p>Half equations, half vectors and matrices: linear equations, simultaneous equations (Cramer\'s rule), ' +
      "slopes and linear functions, singular matrices, dot and cross products, linear combinations, determinants (2×2 and 3×3), matrix–vector and matrix products, " +
      "trace, eigenvalues, inverses, vector lengths and determinant rules.</p>" +
      "<p>Each round also has one <b>21X hand</b>, from the algebraic blackjack card game. Choose a whole number <i class=\"v\">X</i> (never 0) so the cards add up to exactly 21. " +
      "<i class=\"v\">N</i> is the number of cards in the hand. Any <i class=\"v\">X</i> that makes 21 counts.</p></div>" +
      '<div class="sect"><h3>Difficulty</h3>' + li(["Gentle: " + DIFF_INFO.gentle.note, "Standard: " + DIFF_INFO.standard.note, "Spicy: " + DIFF_INFO.spicy.note]) + "</div>" +
      '<div class="sect"><h3>On the train</h3><p>Add the app to your home screen (iPhone: Share → Add to Home Screen; Android: ⋮ → Install app). ' +
      "It then opens full screen and works with no signal. Your history is saved only on this device.</p>" +
      '<p class="note">The 21X cards come from the fan-made 21X trainer this app grew out of. 21X is a card game by Naylor Games, and this project is not affiliated with them.</p></div></div>';
  }
  var SCREENS = { home: homeScreen, history: historyScreen, settings: settingsScreen, help: helpScreen };
  function go(name) { endRound(); screen = name; window.scrollTo(0, 0); SCREENS[name](); }
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) pause();
    else if (!cur && screen === "home") homeScreen();           // the date may have changed overnight
  });

  /* ============================ input wiring ============================ */
  var ACTS = {
    home: function () { if (cur) saveRun(); go("home"); },
    history: function () { go("history"); },
    settings: function () { go("settings"); },
    help: function () { go("help"); },
    play: play,
    extra: extraMenu,
    extrago: function (cat) { closeOverlay(); startRound(cat, "extra"); },
    pause: pause,
    resume: resume,
    key: pressKey,
    go: submit,
    skip: skip,
    close: closeOverlay,
    diff: function (v) { if (T.RAMPS[v]) { S.diff = v; saveSettings(); settingsScreen(); } },
    set: function (k) { S[k] = !S[k]; saveSettings(); settingsScreen(); },
    wipe: function () {
      overlay("<h2>Clear history?</h2><p class=\"note\">This deletes every saved round, your streak and any round in progress on this device.</p>" +
        '<div class="btns"><button class="btn" data-act="close">Cancel</button><button class="btn gold" data-act="wipeyes">Clear</button></div>');
    },
    wipeyes: function () { DAYS = {}; saveDays(); CATS.forEach(function (c) { drop(runKey(c)); }); closeOverlay(); toast("History cleared"); settingsScreen(); }
  };
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-act]");
    if (!b || b.disabled) return;
    e.preventDefault();
    var fn = ACTS[b.getAttribute("data-act")];
    if (fn) fn(b.getAttribute("data-arg"));
  });
  document.addEventListener("keydown", function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var k = e.key;
    if ($(".ov")) {
      if (k === "Escape") { if (cur && clock.paused) resume(); else if (!cur) closeOverlay(); e.preventDefault(); }
      return;
    }
    if (!cur) return;
    if (/^[0-9]$/.test(k)) pressKey(k);
    else if (k === "-" || k === "_" || k === "−") pressKey("neg");
    else if (k === "Backspace") pressKey("back");
    else if (k === "Enter") submit();
    else if (k === "Escape") pause();
    else return;
    e.preventDefault();
  });

  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("sw.js").catch(function () {});
  }
  go("home");
})();
