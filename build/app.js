/* Train of Thought - DOM UI: screens, keypad, rounds (browser only).
   Nothing is tracked: the settings are the only thing kept, in this browser. */
(function () {
  "use strict";
  var X21 = window.X21, T = window.TOT, esc = X21.esc, M = X21.MINUS;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var app = $("#app"), fxLayer = $("#fx");
  var LS = "tot:", CATS = ["mental", "linear"];

  /* ============================ settings ============================ */
  var CARDS = [], LOAD_ERR = "";
  try { CARDS = X21.loadCards($("#cards-csv").textContent); } catch (e) { LOAD_ERR = e.message; }

  function load(k, d) { try { var v = localStorage.getItem(LS + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem(LS + k, JSON.stringify(v)); } catch (e) {} }
  // earlier versions kept a history of rounds (and the 21X trainer kept best times): clear them out
  ["tot:days", "tot:run-mental", "tot:run-linear", "21x:best", "21x:settings"].forEach(function (k) { try { localStorage.removeItem(k); } catch (e) {} });

  // off: the question types switched off (so any type added later starts switched on)
  var S = Object.assign({ diff: "standard", haptics: true, off: [] }, load("settings", {}));
  if (!T.RAMPS[S.diff]) S.diff = "standard";
  if (!Array.isArray(S.off)) S.off = [];
  function saveSettings() { save("settings", S); }
  function typesIn(cat) { return T.CATS[cat].list.filter(function (t) { return t.type !== "x21" || CARDS.length; }); }
  function typesOn(cat) { return typesIn(cat).filter(function (t) { return S.off.indexOf(t.type) < 0; }); }
  function allOn() { return CATS.reduce(function (a, c) { return a.concat(typesOn(c)); }, []); }

  var CAT_INFO = {
    mental: { name: "Mental maths" },
    linear: { name: "Linear algebra" }
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
  function overlay(html) {
    closeOverlay();
    var el = document.createElement("div");
    el.className = "ov";
    el.innerHTML = '<div class="sheet">' + html + "</div>";
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
  function startClock() { clock.t = 0; clock.last = null; clock.run = false; clock.paused = false; if (!raf) raf = requestAnimationFrame(frame); }
  function stopClock() { if (raf) cancelAnimationFrame(raf); raf = 0; clock.run = false; clock.paused = false; }

  /* ============================ a round ============================ */
  // cur: {diff, qs, i, answers: [{v, ok, ms}], input, phase: "ask"|"ok"|"fb"}. It lives only in memory.
  // A round draws from every type switched on, mental maths and linear algebra alike.
  var cur = null;
  function startRound() {
    var types = allOn();
    if (!types.length) { toast("Switch on some questions in Settings first"); return; }
    endRound();
    var qs = T.makeRound("all", { diff: S.diff, seed: seed(), cards: CARDS, types: types.map(function (t) { return t.type; }) });
    cur = { diff: S.diff, qs: qs, i: 0, answers: [], input: "", phase: "ask" };
    startClock();
    renderPlay();
    ask();
  }
  function ask() {
    cur.phase = "ask"; cur.input = "";
    cur.qStart = clock.t;
    clock.run = true;
    renderAll();
  }
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
    var r = cur;
    stopClock();
    cur = null;
    vibrate(scoreOf(r.answers) === T.ROUND ? [30, 40, 30] : 30);
    resultsScreen(r);
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
      '<span class="ttl">' + DIFF_INFO[cur.diff].name + ' round</span><span class="sp"></span>' +
      '<span class="chip">⏱ <span id="g-clock">' + fmtTime(clock.t) + '</span></span><button class="skip" id="g-skip" data-act="skip">Skip</button></div>' +
      '<span id="g-line"></span>' +
      '<div class="stage" id="g-stage"><div class="qp" id="g-prompt"></div><div class="qx" id="g-q"></div><div class="fbk" id="g-fb" aria-live="polite"></div></div>' +
      '<div class="pad"><div class="ans" id="g-ans"></div>' + KEYS_HTML + '<button class="go" id="g-go" data-act="go"></button></div></div>';
  }
  function setHtml(id, html) { var el = document.getElementById(id); if (el) el.innerHTML = html; return el; }
  function renderAll() {
    if (!cur || !$("#g")) return;
    var q = cur.qs[cur.i], asking = cur.phase === "ask";
    $("#g-line").outerHTML = lineHtml(cur.answers, cur.i).replace('<span class="line', '<span id="g-line" class="line');
    setHtml("g-prompt", '<span class="dim">' + q.n + " / " + T.ROUND + "</span> · " + q.prompt);
    setHtml("g-q", q.html);
    renderAns(); renderFb();
    setHtml("g-go", asking ? "Submit" : cur.phase === "ok" ? "Next ›" : cur.i + 1 >= T.ROUND ? "See results ›" : "Next question ›");
    $("#g-keys").classList.toggle("off", !asking);
    $("#g-skip").disabled = !asking;
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
    var g = $("#g"); if (g) g.classList.add("paused");
    overlay('<h2>Paused</h2><p class="note">The clock is stopped and the question is hidden.</p>' +
      '<div class="btns"><button class="btn" data-act="home">Quit round</button><button class="btn gold" data-act="resume">Resume</button></div>');
  }
  function resume() {
    closeOverlay();
    clock.paused = false;
    var g = $("#g"); if (g) g.classList.remove("paused");
  }
  document.addEventListener("visibilitychange", function () { if (document.hidden) pause(); });

  /* ============================ results ============================ */
  function reviewList(r) {
    return '<ol class="rev">' + r.qs.map(function (q, k) {
      var a = r.answers[k];
      var said = a.ok ? '<span class="good">✓ ' + (q.label ? q.label + " = " : "") + sn(a.v) + "</span>" :
        (a.v === null ? '<span class="dim">Skipped</span>' : 'You said <b class="bad">' + sn(a.v) + "</b>") + " · answer <b>" + answerText(q) + "</b>";
      return '<li class="' + (a.ok ? "ok" : "no") + '"><div class="rh"><span>' + q.n + ". " + q.prompt + "</span><span>" + fmtSec(a.ms) + "</span></div>" +
        '<div class="rq">' + q.html + '</div><div class="ra">' + said + '</div><div class="why">' + q.why + "</div></li>";
    }).join("") + "</ol>";
  }
  function resultsScreen(r) {
    window.scrollTo(0, 0);
    var score = scoreOf(r.answers), ms = timeOf(r.answers);
    app.innerHTML = '<div class="menu">' + topBar("Results") +
      '<p class="note" style="margin:-6px 0 14px">' + DIFF_INFO[r.diff].name + " · not saved anywhere</p>" +
      lineHtml(r.answers, T.ROUND, true) +
      '<div class="score"><div><b>' + score + '<span class="dim">/' + T.ROUND + "</span></b><small>correct</small></div><div><b>" + fmtTime(ms) + "</b><small>" +
      fmtSec(ms / Math.max(1, r.answers.length)) + " per question</small></div></div>" +
      (score === T.ROUND ? '<div class="verdict good">Perfect round!</div>' : "") +
      '<div class="btns"><button class="btn" data-act="home">Home</button><button class="btn gold" data-act="play">Another round ›</button></div>' +
      '<div class="sect" style="padding-bottom:4px"><h3>Review</h3>' + reviewList(r) + "</div></div>";
  }

  /* ============================ menu screens ============================ */
  function topBar(title) { return '<div class="top"><button class="ib" data-act="home" aria-label="Back">‹</button><h2>' + title + "</h2></div>"; }
  function roundCard() {
    var on = allOn(), all = CATS.reduce(function (n, c) { return n + typesIn(c).length; }, 0);
    var sub = !on.length ? '<span class="warn">Nothing switched on: pick some questions in Settings</span>' :
      on.length === all ? "Mental maths, linear algebra and 21X hands" :
      on.length <= 3 ? on.map(function (t) { return esc(t.label); }).join(", ") : on.length + " of " + all + " question types";
    return '<button class="day" data-act="play"><span class="dh"><b>Start</b><span class="st hl">10 questions ›</span></span><small>' +
      sub + "</small>" + lineHtml([], -1) + "</button>";
  }
  function homeScreen() {
    app.innerHTML = '<div class="menu"><div class="logo">Train of <i>Thought</i></div><div class="tag">Ten questions a round, picked at random from the types you choose.</div>' +
      (LOAD_ERR ? '<div class="err">Card list error: ' + esc(LOAD_ERR) + ". The 21X hands are switched off.</div>" : "") +
      roundCard() +
      '<div class="btns"><button class="btn" data-act="settings">Settings</button><button class="btn" data-act="help">How it works</button></div>' +
      '<div class="foot">' + DIFF_INFO[S.diff].name + " difficulty · nothing is tracked</div></div>";
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
  function typeSection(cat) {
    var list = typesIn(cat), on = typesOn(cat).length;
    return '<div class="sect"><div class="sh2"><h3>' + CAT_INFO[cat].name + '</h3><span class="note">' + on + " of " + list.length + ' on</span><span class="sp"></span>' +
      '<button class="mini" data-act="all" data-arg="' + cat + '">All</button><button class="mini" data-act="none" data-arg="' + cat + '">None</button></div>' +
      '<div class="chips">' + list.map(function (t) {
        var isOn = S.off.indexOf(t.type) < 0;
        return '<button class="chipt' + (isOn ? " on" : "") + '" data-act="type" data-arg="' + t.type + '" aria-pressed="' + isOn + '">' + esc(t.label) + "</button>";
      }).join("") + "</div></div>";
  }
  function settingsScreen() {
    app.innerHTML = '<div class="menu">' + topBar("Settings") +
      '<p class="note" style="margin-top:-4px">Each round picks 10 questions at random from all the types switched on here, across both sections.</p>' +
      (allOn().length ? "" : '<p class="note warn">Switch on at least one question type to play.</p>') +
      CATS.map(typeSection).join("") +
      '<div class="sect"><h3>Difficulty</h3>' + seg("diff", [["gentle", "Gentle"], ["standard", "Standard"], ["spicy", "Spicy"]], S.diff) +
      '<p class="note">' + DIFF_INFO[S.diff].note + " A few types only come in a hard version (like eigenvalues) or an easy one (like doubling). " +
      "With lots of types on, the difficulty decides which turn up; switch on just a few and they all do.</p></div>" +
      '<div class="sect"><h3>Feel</h3>' + tog("haptics", "Vibration", "A short buzz for right and wrong answers (Android only)") + "</div>" +
      '<p class="foot">Nothing is tracked: no scores, no history, no analytics. These settings are the only thing saved, in this browser.</p></div>';
  }
  function helpScreen() {
    function li(a) { return "<ul>" + a.map(function (s) { return "<li>" + s + "</li>"; }).join("") + "</ul>"; }
    app.innerHTML = '<div class="menu">' + topBar("How it works") +
      '<div class="sect"><h3>Rounds</h3><p>Tap <b>Start</b> for ten questions, picked at random from every question type you\'ve switched on in ' +
      "Settings. They start easy and get harder, and every round is new.</p>" +
      "<p>The clock only runs while a question is waiting for your answer. Your score is how many you get right, and your time is the total. " +
      "Nothing is kept once you leave the results.</p></div>" +
      '<div class="sect"><h3>Answering</h3>' + li([
        "Every answer is a whole number. Use <b>±</b> for negatives.",
        "A wrong answer or a skip shows the right answer and a worked solution. Read it, then tap <b>Next</b>. The clock is stopped while you read.",
        "Pause any time with ❚❚. Locking your phone pauses too.",
        "Keyboard: type digits, <kbd>−</kbd> for the sign, <kbd>⌫</kbd> to delete, <kbd>Enter</kbd> to submit or move on, <kbd>Esc</kbd> to pause."]) + "</div>" +
      '<div class="sect"><h3>Mental maths</h3><p>Addition, subtraction, multiplication and division; percentages and fractions of amounts; squares, square roots and powers; ' +
      "order of operations; remainders; averages; series; and multiplication shortcuts like ×25, ×11, ×99 and (50 − 3)(50 + 3).</p>" +
      '<p class="note">The worked answers show the shortcut: round and adjust (47 + 38 = 47 + 40 − 2), split a factor (67 × 8 = 480 + 56), ' +
      "square from a round number ((70 − 3)² = 4900 − 420 + 9), or use digit sums for remainders.</p></div>" +
      '<div class="sect"><h3>Linear algebra</h3><p>Equations: linear and simultaneous equations (Cramer\'s rule), slopes and linear functions, and singular matrices. ' +
      "Vectors and matrices: dot and cross products, linear combinations, determinants (2×2 and 3×3), matrix–vector and matrix products, trace, eigenvalues, " +
      "inverses, vector lengths and determinant rules. With both kinds switched on, a round mixes them evenly.</p>" +
      "<p><b>21X hands</b> come from the algebraic blackjack card game. Choose a whole number <i class=\"v\">X</i> (never 0) so the cards add up to exactly 21. " +
      "<i class=\"v\">N</i> is the number of cards in the hand. Any <i class=\"v\">X</i> that makes 21 counts.</p></div>" +
      '<div class="sect"><h3>Difficulty</h3>' + li(["Gentle: " + DIFF_INFO.gentle.note, "Standard: " + DIFF_INFO.standard.note, "Spicy: " + DIFF_INFO.spicy.note]) + "</div>" +
      '<div class="sect"><h3>On the train</h3><p>Add the app to your home screen (iPhone: Share → Add to Home Screen; Android: ⋮ → Install app). ' +
      "It then opens full screen and works with no signal.</p><p>Nothing is tracked: no scores, no history, no analytics. Your settings are the only thing saved, in this browser.</p>" +
      '<p class="note">The 21X cards come from the fan-made 21X trainer this app grew out of. 21X is a card game by Naylor Games, and this project is not affiliated with them.</p></div></div>';
  }
  var SCREENS = { home: homeScreen, settings: settingsScreen, help: helpScreen };
  function go(name) { endRound(); window.scrollTo(0, 0); SCREENS[name](); }

  /* ============================ input wiring ============================ */
  function setTypes(cat, on) {
    var ids = T.CATS[cat].list.map(function (t) { return t.type; });
    S.off = S.off.filter(function (t) { return ids.indexOf(t) < 0; }).concat(on ? [] : ids);
    saveSettings(); settingsScreen();
  }
  var ACTS = {
    home: function () { go("home"); },
    settings: function () { go("settings"); },
    help: function () { go("help"); },
    play: function () { startRound(); },
    pause: pause,
    resume: resume,
    key: pressKey,
    go: submit,
    skip: skip,
    close: closeOverlay,
    diff: function (v) { if (T.RAMPS[v]) { S.diff = v; saveSettings(); settingsScreen(); } },
    set: function (k) { S[k] = !S[k]; saveSettings(); settingsScreen(); },
    type: function (t) {
      var i = S.off.indexOf(t);
      if (i >= 0) S.off.splice(i, 1); else S.off.push(t);
      saveSettings(); settingsScreen();
    },
    all: function (cat) { setTypes(cat, true); },
    none: function (cat) { setTypes(cat, false); }
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
      if (k === "Escape") { if (cur && clock.paused) resume(); else closeOverlay(); e.preventDefault(); }
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
