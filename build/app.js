/* 21X trainer - DOM UI, screens & game controllers (browser only) */
(function () {
  "use strict";
  var G = window.X21, esc = G.esc, M = G.MINUS, qh = G.qhtml;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var app = $("#app"), fxLayer = $("#fx");
  var LS = "21x:";

  /* ============================ data & settings ============================ */
  var CARDS = [], LOAD_ERR = "";
  try { CARDS = G.loadCards($("#cards-csv").textContent); } catch (e) { LOAD_ERR = e.message; }

  function load(k, d) { try { var v = localStorage.getItem(LS + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem(LS + k, JSON.stringify(v)); } catch (e) {} }
  var DEFAULTS = { levels: [1, 2, 3], celebrity: false, limited: false, penalty: 10, bot: "medium", live: false, missed: true };
  var S = Object.assign({}, DEFAULTS, load("settings", {}));
  if (!Array.isArray(S.levels) || !S.levels.length) S.levels = [1, 2, 3];
  function saveSettings() { save("settings", S); }
  function deckList() { return G.deckIds(CARDS, { levels: S.levels, celebrity: S.celebrity, limited: S.limited }); }
  function deckLabel() {
    var lv = S.levels.slice().sort();
    return (lv.length === 3 ? "Core" : "Level " + lv.join("+")) + (S.celebrity ? " + Celebrity" : "") + (S.limited ? " + V&Y" : "");
  }
  // best solo times are kept per deck + penalty setting, so runs stay comparable
  function soloKey() { return "L" + S.levels.slice().sort().join("") + (S.celebrity ? "C" : "") + (S.limited ? "V" : "") + "-p" + S.penalty; }
  var BEST = load("best", {});

  function seed() { try { return crypto.getRandomValues(new Uint32Array(1))[0]; } catch (e) { return (Math.random() * 4294967296) >>> 0; } }
  function fmtTime(ms) {
    var t = Math.floor(Math.max(0, ms) / 100), m = Math.floor(t / 600), s = Math.floor(t / 10) % 60;
    return m + ":" + (s < 10 ? "0" : "") + s + "." + (t % 10);
  }
  function vibrate(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) {} }
  function card(id) { return CARDS[id]; }
  var DECK_ICON = '<svg viewBox="0 0 10 14" width="10" height="14" aria-hidden="true"><rect x=".5" y=".5" width="9" height="13" rx="1.6" fill="#163a2d" stroke="#d5a637"/></svg>';

  /* ============================ toasts & overlays ============================ */
  function toast(html) {
    Array.prototype.forEach.call(fxLayer.querySelectorAll(".toast"), function (el) { el.remove(); });
    var el = document.createElement("div");
    el.className = "toast"; el.innerHTML = html;
    fxLayer.appendChild(el);
    setTimeout(function () { el.remove(); }, 2700);
  }
  function banner(html) {
    Array.prototype.forEach.call(fxLayer.querySelectorAll(".banner"), function (el) { el.remove(); });
    var el = document.createElement("div");
    el.className = "banner"; el.innerHTML = html;
    fxLayer.appendChild(el);
    setTimeout(function () { el.remove(); }, 2200);
  }
  function overlay(html, cls, dismissable) {
    closeOverlay();
    var el = document.createElement("div");
    el.className = "ov";
    el.innerHTML = '<div class="sheet ' + (cls || "") + '">' + html + "</div>";
    if (dismissable) el.addEventListener("click", function (e) { if (e.target === el || e.target.closest(".card")) closeOverlay(); });
    document.body.appendChild(el);
  }
  function closeOverlay() { var el = $(".ov"); if (el) el.remove(); }

  /* ============================ pausable game clock ============================ */
  // One clock drives the solo stopwatch, the bot's thinking and the stand timer, so
  // pausing (or the phone locking: rAF stops) freezes all of them together.
  var clock = { t: 0, last: null, paused: false, jobs: [] }, raf = 0;
  function later(ms, fn) { var j = { at: clock.t + ms, fn: fn }; clock.jobs.push(j); return j; }
  function cancel(j) { if (j) j.dead = true; }
  function frame(now) {
    if (clock.last !== null && !clock.paused) clock.t += Math.min(now - clock.last, 250);
    clock.last = now;
    var due = [], keep = [];
    clock.jobs.forEach(function (j) { if (!j.dead) (j.at <= clock.t ? due : keep).push(j); });
    clock.jobs = keep;
    due.sort(function (a, b) { return a.at - b.at; }).forEach(function (j) { if (!j.dead) j.fn(); });
    if (cur && cur.tick) cur.tick();
    raf = requestAnimationFrame(frame);
  }
  function startClock() { clock.t = 0; clock.last = null; clock.paused = false; clock.jobs = []; if (!raf) raf = requestAnimationFrame(frame); }
  function stopClock() { if (raf) cancelAnimationFrame(raf); raf = 0; clock.jobs = []; clock.paused = false; }

  /* ============================ X / Y entry ============================ */
  var inp = { x: "", y: "", focus: "x", fresh: false };
  function resetInput() { inp.x = ""; inp.y = ""; inp.focus = "x"; inp.fresh = false; }
  function num(s) { return s === "" || s === "-" ? null : parseInt(s, 10); }
  function needsOf(ids) { var v = G.handVars(ids.map(card)); return { x: !!v.X, y: !!v.Y, v: !!v.V }; }
  // -> {x, y}, or null after saying what's missing
  function readXY(needs) {
    var x = num(inp.x), y = num(inp.y);
    if (needs.x && x === null) { toast("Enter a value for <b>X</b> first"); return null; }
    if (needs.x && x === 0) { toast("<b>X</b> can't be 0"); return null; }
    if (needs.y && !(y > 0)) { toast("Enter a positive <b>Y</b> too"); inp.focus = "y"; renderInputs(); return null; }
    return { x: needs.x ? x : 1, y: needs.y ? y : null };
  }
  function xyText(x, y, needs) {
    if (!needs.x && !needs.y) return "any X";
    return (needs.x ? "X = " + String(x).replace("-", M) : "") + (needs.y ? (needs.x ? ", " : "") + "Y = " + y : "");
  }
  function focusField() { var n = myNeeds(); return inp.focus === "y" && n.y ? "y" : n.x ? "x" : n.y ? "y" : null; }
  function pressKey(k) {
    if (!cur || !inputOpen()) return;
    var f = focusField();
    if (!f) return;
    var s = inp[f];
    if (k === "back") s = s.slice(0, -1);
    else if (k === "neg") {
      if (f === "y") { toast("<b>Y</b> must be positive"); return; }
      s = s.charAt(0) === "-" ? s.slice(1) : "-" + s;
    } else {
      if (inp.fresh) s = "";                          // after a check, typing starts a new number
      var digits = s.replace("-", "");
      if ((digits === "" && k === "0") || digits.length >= 6) return;
      s += k;
    }
    inp.fresh = false; inp[f] = s; inp.focus = f;
    inputChanged();
  }
  function stepKey(d) {
    if (!cur || !inputOpen()) return;
    var f = focusField();
    if (!f) return;
    var v = num(inp[f]) || 0;
    v = f === "y" ? Math.max(1, v + d) : v + d;
    if (v === 0) v += d;                              // X skips 0
    inp[f] = String(v); inp.fresh = false; inp.focus = f;
    inputChanged();
  }
  function inputChanged() {
    if (cur.fb) { cur.fb = null; renderHand(); }
    else if (S.live && cur.kind === "practice") renderHand();
    renderInputs(); renderVerdict();
  }

  /* ============================ shared game screen ============================ */
  var cur = null;          // the active game (solo / practice / duel)
  function myIds() { return cur.kind === "duel" ? cur.you.hand : cur.g.hand; }
  function myCards() { return myIds().map(card); }
  function myV() { return cur.kind === "duel" ? 1 + cur.wins.you : cur.g.V(); }
  function myNeeds() { return needsOf(myIds()); }
  function inputOpen() {
    if (cur.kind === "duel") return cur.phase === "play" || (cur.phase === "stand" && cur.stand.by === "bot");
    return !cur.g.done;
  }
  var KEYS_HTML = '<div class="keys">' + ["1", "2", "3", "4", "5", "back", "6", "7", "8", "9", "0", "neg"].map(function (k) {
    var lab = k === "back" ? "⌫" : k === "neg" ? "±" : k;
    var aria = k === "back" ? "delete" : k === "neg" ? "plus or minus" : k;
    return '<button class="key' + (k.length > 1 ? " alt" : "") + '" data-act="key" data-arg="' + k + '" aria-label="' + aria + '">' + lab + "</button>";
  }).join("") + "</div>";

  function renderGame() {
    app.innerHTML = '<div class="game" id="g"><div class="bar" id="g-bar"></div>' +
      (cur.kind === "duel" ? '<div class="opp" id="g-opp"></div>' : '<div class="scorebar"><i id="g-prog"></i></div>') +
      '<div class="table" id="g-table"><div class="info" id="g-info"></div><div class="hand" id="g-hand"></div><div class="verdict" id="g-verdict" aria-live="polite"></div></div>' +
      '<div class="pad"><div class="inputs" id="g-inputs"></div>' + KEYS_HTML + '<div class="acts" id="g-acts"></div></div></div>';
    refresh();
  }
  function refresh() { renderBar(); renderOpp(); renderInfo(); renderVerdict(); renderHand(); renderInputs(); renderActs(); }
  function setHtml(id, html) { var el = document.getElementById(id); if (el) el.innerHTML = html; return el; }
  function chip(html, cls) { return '<span class="chip' + (cls ? " " + cls : "") + '">' + html + "</span>"; }
  function mv(v) { return '<i class="mv">' + v + "</i>"; }

  function renderBar() {
    if (cur.kind === "duel") {
      setHtml("g-bar", '<button class="ib" data-act="pause" aria-label="Pause">❚❚</button><span class="ttl">Duel</span><span class="sp"></span>' +
        chip("You <b>" + cur.score.you + "</b> · <b>" + cur.score.bot + "</b> Bot") + chip("to 21", "dim"));
      return;
    }
    var g = cur.g;
    if (cur.practice) {
      setHtml("g-bar", '<button class="ib" data-act="quit" aria-label="Back">‹</button><span class="ttl">Practice</span><span class="sp"></span>' +
        chip("✓ " + g.scored.length + " solved") + '<button class="ib" data-act="hint" aria-label="Hint">💡</button>');
    } else {
      setHtml("g-bar", '<button class="ib" data-act="pause" aria-label="Pause">❚❚</button><span class="ttl">Solo</span><span class="sp"></span>' +
        chip('⏱ <span id="g-clock">' + fmtTime(soloElapsed()) + "</span>") +
        (cur.penalty ? chip("+" + cur.penalty / 1000 + " s", "pen") : "") +
        chip(G.shapesHtml(1) + " " + g.icons + "/" + g.target));
    }
    var p = $("#g-prog");
    if (p) p.style.width = (cur.practice ? 0 : Math.min(100, 100 * g.icons / g.target)) + "%";
  }
  function renderInfo() {
    var ids = myIds(), needs = myNeeds(), h = chip(mv("N") + " = " + ids.length);
    if (needs.v) h += chip(mv("V") + " = " + myV());
    if (cur.kind === "duel") {
      if (cur.phase === "stand") h += '<span class="timer" id="g-timer"></span>';
    } else h += chip(DECK_ICON + " " + cur.g.deck.left());
    setHtml("g-info", h);
    if (cur.tick) cur.tick();
  }
  function liveEval() {
    if (cur.kind !== "practice" || !S.live) return null;
    var needs = myNeeds(), x = num(inp.x), y = num(inp.y);
    if ((needs.x && !x) || (needs.y && !(y > 0))) return null;
    return G.evalHand(myCards(), { X: needs.x ? x : 1, Y: needs.y ? y : null, N: myIds().length, V: myV() });
  }
  function renderHand() {
    var el = $("#g-hand");
    if (!el) return;
    var ids = myIds(), fb = cur.fb, live = !fb && liveEval();
    el.innerHTML = ids.map(function (id, k) {
      var o = { cls: "zoomable" + (cur.seen[id] ? "" : " new"), attrs: ' data-act="zoom" data-arg="' + id + '"' };
      if (fb && fb.values) { o.value = fb.values[k]; o.vcls = fb.cls; }
      else if (live) { o.value = live.values[k]; o.vcls = "live"; }
      return G.cardHtml(card(id), o);
    }).join("");
    ids.forEach(function (id) { cur.seen[id] = true; });
    fitHand();
  }
  // size the cards to the space left between the header and the keypad
  function fitHand() {
    var table = $("#g-table"), hand = $("#g-hand");
    if (!table || !hand) return;
    var n = Math.max(2, hand.children.length), gap = 8, cs = getComputedStyle(table);
    var W = table.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    var H = table.clientHeight - $("#g-info").offsetHeight - $("#g-verdict").offsetHeight -
      2 * (parseFloat(cs.rowGap) || 8) - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - 4;
    var best = 0, bestCols = n;
    [n, Math.ceil(n / 2)].forEach(function (cols) {
      var rows = Math.ceil(n / cols);
      var cw = Math.min(170, (W - (cols - 1) * gap) / cols, (H - (rows - 1) * gap) / (rows * 1.4));
      if (cw > best + 0.5) { best = cw; bestCols = cols; }
    });
    best = Math.max(44, Math.floor(best));
    hand.style.setProperty("--cw", best + "px");
    hand.style.setProperty("--gap", gap + "px");
    hand.style.maxWidth = (bestCols * best + (bestCols - 1) * gap) + "px";
  }
  window.addEventListener("resize", function () { if (cur) fitHand(); });
  function statusNote(status) {
    return status === "win" ? ' <span class="good">= 21 ✓</span>' : status === "bust" ? ' <span class="bad">bust</span>' :
      status === "twenty" ? ' <span class="bad">20 is bust</span>' : status === "undef" ? ' <span class="bad">undefined</span>' : "";
  }
  function totalLine(ev) {
    if (!ev.total) return '<span class="bad">Undefined</span> <span class="dim">(÷0, or off the end of a sequence card)</span>';
    var approx = ev.total.d !== 1n && !/\./.test(G.qstr(ev.total)) ? ' <span class="dim">≈ ' + G.qapprox(ev.total) + "</span>" : "";
    return "Total " + qh(ev.total) + approx;
  }
  function renderVerdict() {
    var h = "";
    if (cur.kind === "duel") h = duelVerdict();
    else if (cur.fb && cur.fb.msg) h = cur.fb.msg;
    else {
      var live = liveEval();
      if (live) h = '<span class="dim">' + totalLine(live) + "</span>" + statusNote(live.status);
    }
    setHtml("g-verdict", h);
    fitHand();                                        // a two-line verdict leaves less room for cards
  }
  function fieldHtml(f, need, on) {
    var s = inp[f];
    var val = !need ? '<span class="na">any</span>' : s === "" ? '<span class="ph">?</span>' : esc(s.replace("-", M));
    return '<button class="field' + (on ? " on" : "") + '" data-act="focus" data-arg="' + f + '"' + (need ? "" : " disabled") +
      ' aria-label="' + f.toUpperCase() + ' value"><span class="lab">' + f.toUpperCase() + "</span>=<span>" + val + "</span></button>";
  }
  function renderInputs() {
    var needs = myNeeds(), f = focusField(), open = inputOpen(), dis = open && f ? "" : " disabled";
    var keys = $("#g .keys");
    if (keys) keys.classList.toggle("off", !!dis);
    setHtml("g-inputs", '<button class="step" data-act="step" data-arg="-1"' + dis + ' aria-label="minus one">' + M + "1</button>" +
      fieldHtml("x", needs.x, open && f === "x") + (needs.y ? fieldHtml("y", true, open && f === "y") : "") +
      '<button class="step" data-act="step" data-arg="1"' + dis + ' aria-label="plus one">+1</button>');
  }
  function renderActs() {
    if (cur.kind === "duel") return setHtml("g-acts", duelActs());
    var g = cur.g, n = g.hand.length;
    setHtml("g-acts",
      '<button class="act" data-act="mulligan">↺ Mulligan<small>2 new cards</small></button>' +
      '<button class="act" data-act="draw"' + (g.canDraw() ? "" : " disabled") + ">＋ Draw<small>" + (n < g.maxHand ? "N → " + (n + 1) : "max " + g.maxHand + " cards") + "</small></button>" +
      '<button class="act call" data-act="call">Call 21<small>check my X</small></button>');
  }
  function renderOpp() { if (cur.kind === "duel") duelOpp(); }
  function workingCards(ids, ev) {
    return '<div class="hand">' + ids.map(function (id, k) { return G.cardHtml(card(id), { value: ev.values[k], vcls: "good" }); }).join("") + "</div>";
  }

  /* ============================ solo & practice ============================ */
  function startSolo(practice) {
    var ids = deckList();
    if (ids.length < 10) { toast("Choose more cards in Settings (at least 10)"); return; }
    endGame();
    cur = {
      kind: practice ? "practice" : "solo", practice: practice,
      g: new G.Solo(CARDS, ids, { rng: G.mulberry32(seed()), endless: practice }),
      penalty: 0, fb: null, seen: {}, hint: 0, tick: practice ? null : soloTick
    };
    resetInput(); startClock(); renderGame();
  }
  function soloElapsed() { return clock.t + cur.penalty; }
  function soloTick() { var el = document.getElementById("g-clock"); if (el) el.textContent = fmtTime(soloElapsed()); }
  function newHandState() { cur.fb = null; cur.seen = {}; cur.hint = 0; resetInput(); }
  function soloCall() {
    var g = cur.g, needs = myNeeds(), xy = readXY(needs);
    if (!xy || g.done) return;
    var ids = g.hand.slice(), r = g.call(xy.x, xy.y);
    if (r.ok) {
      vibrate(25);
      banner("<b>21 ✓ " + xyText(xy.x, xy.y, needs) + " · +" + r.icons + " " + G.shapesHtml(1) + "</b>" + workingCards(ids, r.ev));
      newHandState();
      if (r.done) { refresh(); return soloFinish(); }
      refresh();
      return;
    }
    vibrate([15, 50, 15]);
    var pen = !cur.practice && S.penalty ? S.penalty : 0;
    cur.penalty += pen * 1000;
    cur.fb = {
      values: r.ev.values, cls: "bad",
      msg: '<span class="bad">✗</span> ' + totalLine(r.ev) + statusNote(r.ev.status) + (r.ev.status === "ok" ? ' <span class="dim">— not 21</span>' : "") +
        (pen ? ' <span class="warn">+' + pen + " s</span>" : "")
    };
    inp.fresh = true;
    renderBar(); renderHand(); renderVerdict();
  }
  function soloDraw() {
    if (cur.g.draw() === null) return;
    cur.fb = null; cur.hint = 0; inp.fresh = true;
    refresh();
  }
  function soloMulligan() {
    var g = cur.g;
    if (g.done) return;
    if (S.missed) {
      var needs = myNeeds(), an = G.analyze(g.handCards(), { V: g.V() });
      if (an.solutions.length) toast("Missed one: that hand made 21 with <b>" + xyText(an.solutions[0].x, an.solutions[0].y, needs) + "</b>");
    }
    g.mulligan();
    newHandState(); refresh();
  }
  function practiceHint() {
    if (!cur || !cur.practice) return;
    var g = cur.g, needs = myNeeds(), an = G.analyze(g.handCards(), { V: g.V() });
    if (cur.hint === 0) {
      cur.hint = 1;
      cur.fb = {
        msg: an.solutions.length ? '<span class="good">21 is possible with these cards.</span> <span class="dim">Tap 💡 again to see how.</span>' :
          '<span class="warn">No whole-number X makes 21 here.</span> <span class="dim">' +
          (an.best ? "Best valid total: " + qh(an.best.total) + " (" + xyText(an.best.x, an.best.y, needs) + ")." : "Every total is bust.") + " Draw or mulligan.</span>"
      };
      renderHand(); renderVerdict();
      return;
    }
    var pick = an.solutions[0] || an.best;
    if (!pick) return;
    inp.x = needs.x ? String(pick.x) : ""; inp.y = needs.y ? String(pick.y) : ""; inp.fresh = true;
    var ev = G.evalHand(g.handCards(), { X: pick.x, Y: pick.y, N: g.hand.length, V: g.V() });
    cur.fb = {
      values: ev.values, cls: an.solutions.length ? "good" : "live",
      msg: an.solutions.length ? '<span class="good">' + xyText(pick.x, pick.y, needs) + " makes 21.</span> <span class=\"dim\">Tap Call 21 to bank it.</span>" :
        '<span class="dim">Closest valid: ' + xyText(pick.x, pick.y, needs) + " → " + qh(ev.total) + ".</span>"
    };
    renderHand(); renderVerdict(); renderInputs();
  }
  function soloFinish() {
    var ms = soloElapsed(), key = soloKey(), list = BEST[key] || [], g = cur.g;
    var rec = { ms: Math.round(ms), date: Date.now(), hands: g.scored.length, wrong: g.stats.wrong, mull: g.stats.mulligans };
    list.push(rec);
    list.sort(function (a, b) { return a.ms - b.ms; });
    list = list.slice(0, 10); BEST[key] = list; save("best", BEST);
    var rank = list.indexOf(rec);
    cur.over = true; stopClock();
    overlay("<h2>" + g.icons + " icons — done!</h2>" +
      '<div class="huge">' + fmtTime(ms) + "</div>" +
      '<div class="note">' + (cur.penalty ? "incl. +" + cur.penalty / 1000 + " s penalties · " : "") + g.scored.length + " hands scored · " +
      g.stats.wrong + " wrong calls · " + g.stats.mulligans + " mulligans</div>" +
      (rank === 0 && list.length > 1 ? '<p class="good"><b>New personal best!</b></p>' : rank === 0 ? '<p class="good"><b>First recorded time!</b></p>' : '<p class="dim">#' + (rank + 1) + " of your top " + list.length + "</p>") +
      recordsTable(list, rec) +
      '<div class="note" style="margin-top:6px">' + esc(deckLabel()) + " · " + (S.penalty ? S.penalty + " s per wrong call" : "no penalty") + "</div>" +
      '<div class="btns"><button class="btn" data-act="quit">Menu</button><button class="btn gold" data-act="again">Play again</button></div>');
  }
  function recordsTable(list, mark) {
    return '<table class="rec">' + list.slice(0, 5).map(function (r, k) {
      var d = new Date(r.date);
      return "<tr" + (r === mark ? ' class="good"' : "") + "><td>" + (k + 1) + ". <b>" + fmtTime(r.ms) + "</b></td><td>" + r.hands + " hands · " + r.wrong + " wrong</td><td>" +
        d.toLocaleDateString() + "</td></tr>";
    }).join("") + "</table>";
  }

  /* ============================ duel vs bot ============================ */
  function startDuel() {
    var ids = deckList();
    if (ids.length < 10) { toast("Choose more cards in Settings (at least 10)"); return; }
    endGame();
    var rng = G.mulberry32(seed());
    cur = {
      kind: "duel", rng: rng, deck: new G.Deck(ids, rng), level: S.bot,
      score: { you: 0, bot: 0 }, wins: { you: 0, bot: 0 }, games: 0, jobs: [], seen: {}, tick: duelTick
    };
    startClock();
    duelNewGame(true);
  }
  function botCards() { return cur.bot.hand.map(card); }
  function botV() { return 1 + cur.wins.bot; }
  function deal(h) { var id = cur.deck.draw(); if (id !== null) h.push(id); return id; }
  function duelNewGame(first) {
    var d = cur;
    closeOverlay();
    cancel(d.botJob); d.jobs.forEach(cancel); d.jobs = [];
    if (d.you) { d.deck.toss(d.you.hand); d.deck.toss(d.bot.hand); }
    d.you = { hand: [], ev: null };
    d.bot = { hand: [], x: null, y: null, total: null, status: "Thinking…" };
    for (var k = 0; k < 2; k++) { deal(d.you.hand); deal(d.bot.hand); }
    d.phase = "play"; d.stand = null; d.endAt = 0; d.result = null; d.timeline = null; d.botEv = null;
    d.games++; d.fb = null; d.seen = {};
    resetInput();
    if (first) renderGame(); else refresh();
    botSchedule();
  }
  function botSchedule() {
    var d = cur;
    cancel(d.botJob);
    if (d.phase !== "play") return;
    d.bot.status = "Thinking…";
    d.botJob = later(G.botThinkMs(d.level, botCards(), d.rng), botAct);
  }
  function botAct() {
    var d = cur;
    if (!d || d.kind !== "duel" || d.phase !== "play") return;
    var dec = G.botDecide(botCards(), { V: botV() }, d.level, null);
    if (dec.act === "call") { d.bot.x = dec.x; d.bot.y = dec.y; return duelEnd("bot", "The bot called 21."); }
    if (dec.act === "stand") {
      d.bot.x = dec.x; d.bot.y = dec.y; d.bot.total = dec.total;
      d.phase = "stand"; d.stand = { by: "bot", total: dec.total }; d.endAt = clock.t + G.STAND_MS;
      d.bot.status = "Stands on " + G.qstr(dec.total);
      d.jobs.push(later(G.STAND_MS, duelBuzzer));
      vibrate(30);
      refresh();
      return;
    }
    if (dec.act === "draw") {
      d.bot.status = "Drawing…"; duelOpp();
      d.botJob = later(650, function () {
        if (d.phase !== "play") return;
        if (deal(d.bot.hand) === null) { d.bot.status = "Stuck"; duelOpp(); return; }
        botSchedule(); duelOpp();
      });
      return;
    }
    d.bot.status = "Stuck — no valid total"; duelOpp();
  }
  function duelDraw() {
    var d = cur;
    if (!inputOpen()) return;
    if (d.you.hand.length >= G.MAX_HAND) return;
    if (deal(d.you.hand) === null) { toast("The deck is empty"); return; }
    d.fb = null; inp.fresh = true;
    refresh();
  }
  function yourEval(xy) {
    var ev = G.evalHand(myCards(), { X: xy.x, Y: xy.y, N: cur.you.hand.length, V: myV() });
    cur.you.ev = ev; cur.you.x = xy.x; cur.you.y = xy.y;
    return ev;
  }
  function duelCall() {
    if (!inputOpen()) return;
    var xy = readXY(myNeeds());
    if (!xy) return;
    var ev = yourEval(xy);
    if (ev.status === "win") return duelEnd("you", "21! You win the game.");
    youOut("You called 21 but your total is " + qh(ev.total) + " — you're out of this game.");
  }
  function duelStand() {
    var d = cur;
    if (d.phase !== "play") return;
    var xy = readXY(myNeeds());
    if (!xy) return;
    var ev = yourEval(xy);
    if (ev.status === "win") return duelEnd("you", "That's exactly 21 — you win the game.");
    if (!G.isValid(ev.status)) {
      return youOut("You stood on " + qh(ev.total) + (ev.status === "twenty" ? " — exactly 20 is bust." : ev.status === "undef" ? " (undefined)." : " — that's bust."));
    }
    cancel(d.botJob);
    d.phase = "stand"; d.stand = { by: "you", total: ev.total }; d.endAt = clock.t + G.STAND_MS;
    // you're locked in, so the bot's whole reply can be decided now and replayed in real time
    d.timeline = G.botTimeline(CARDS, d.bot.hand, function () { return d.deck.draw(); }, { V: botV() }, d.level, ev.total, G.STAND_MS, d.rng);
    d.bot.status = "Thinking…";
    d.timeline.forEach(function (e) { d.jobs.push(later(e.t, function () { applyBot(e); })); });
    d.jobs.push(later(G.STAND_MS, duelBuzzer));
    d.fb = { values: ev.values, cls: "good" };
    refresh();
  }
  function applyBot(e) {
    var d = cur;
    if (e.done || d.phase !== "stand") return;
    e.done = true;
    if (e.act === "draw") { d.bot.hand.push(e.id); d.bot.status = "Drew a card…"; }
    else if (e.act === "call") { d.bot.x = e.x; d.bot.y = e.y; return duelEnd("bot", "The bot called 21."); }
    else if (e.act === "hold") { d.bot.x = e.x; d.bot.y = e.y; d.bot.total = e.total; d.bot.status = "Has an answer…"; }
    else d.bot.status = "Stuck";
    duelOpp();
  }
  function duelSkip() {
    var d = cur;
    if (d.phase !== "stand" || d.stand.by !== "you") return;
    var tl = d.timeline;                              // duelEnd() clears d.timeline mid-loop if the bot calls 21
    for (var i = 0; i < tl.length && d.phase === "stand"; i++) applyBot(tl[i]);
    if (d.phase === "stand") duelBuzzer();
  }
  function duelBuzzer() {
    var d = cur;
    if (d.phase !== "stand") return;
    var st = d.stand.total;
    if (d.stand.by === "you") {
      if (d.bot.total && G.qcmp(d.bot.total, st) > 0) return duelEnd("bot", "Time! The bot's " + qh(d.bot.total) + " beats your " + qh(st) + ".");
      return duelEnd("you", "Time! The bot couldn't beat your " + qh(st) + ".");
    }
    // the bot stood: your answer is whatever X (and Y) you have entered at the buzzer
    var needs = myNeeds(), x = num(inp.x), y = num(inp.y);
    if ((needs.x && !x) || (needs.y && !(y > 0))) return duelEnd("bot", "Time! No answer entered — hesitating players are out.");
    var ev = yourEval({ x: needs.x ? x : 1, y: needs.y ? y : null });
    if (!G.isValid(ev.status)) return duelEnd("bot", "Your " + qh(ev.total) + (ev.status === "twenty" ? " is exactly 20 — bust." : " is bust.") + " The bot's " + qh(st) + " wins.");
    var c = G.qcmp(ev.total, st);
    if (c > 0) return duelEnd("you", "Your " + qh(ev.total) + " beats the bot's " + qh(st) + "!");
    duelEnd("bot", c === 0 ? "Tie on " + qh(st) + " — ties go to the player who stood." : "The bot's " + qh(st) + " beats your " + qh(ev.total) + ".");
  }
  // a wrong call (or a bust stand) knocks you out; the bot then only needs a valid total
  function youOut(msg) {
    var d = cur, c = G.botCfg(d.level);
    var pick = null;
    if (d.stand && d.stand.by === "bot") pick = { x: d.bot.x, y: d.bot.y };
    else {
      var an = G.analyze(botCards(), { V: botV() }, { xMax: c.range, yMax: c.yMax, maxSolutions: 1 });
      pick = an.solutions[0] || an.best;
    }
    if (pick) { d.bot.x = pick.x; d.bot.y = pick.y; return duelEnd("bot", msg + " The bot wins by default."); }
    duelEnd(null, msg + " The bot has no valid total either — nobody scores.");
  }
  function duelEnd(winner, msg) {
    var d = cur;
    if (d.phase === "over") return;
    cancel(d.botJob); d.jobs.forEach(cancel); d.jobs = [];
    if (d.timeline) d.timeline.forEach(function (e) { if (!e.done && e.act === "draw") d.deck.toss([e.id]); });
    d.timeline = null;
    d.phase = "over";
    if (d.bot.x !== null) d.botEv = G.evalHand(botCards(), { X: d.bot.x, Y: d.bot.y, N: d.bot.hand.length, V: botV() });
    if (d.you.ev) d.fb = { values: d.you.ev.values, cls: G.isValid(d.you.ev.status) ? "good" : "bad" };
    var pts = 0;
    if (winner) {
      pts = G.handIcons((winner === "you" ? d.you.hand : d.bot.hand).map(card));
      d.score[winner] += pts; d.wins[winner]++;
    }
    d.bot.status = winner === "bot" ? "Wins this game" : winner === "you" ? "Loses this game" : "No winner";
    d.result = { winner: winner, msg: msg, pts: pts };
    d.matchOver = d.score.you >= G.TARGET || d.score.bot >= G.TARGET;
    vibrate(winner === "you" ? 40 : [20, 60, 20]);
    refresh();
    if (d.matchOver) {
      var won = d.score.you > d.score.bot;
      later(900, function () {
        overlay("<h2>" + (won ? "You win the match!" : d.score.you === d.score.bot ? "It's a draw!" : "The bot wins the match") + "</h2>" +
          '<div class="huge">' + d.score.you + " – " + d.score.bot + "</div>" +
          '<p class="note">' + d.games + " games · bot: " + G.botCfg(d.level).label + " · each game won scores the difficulty icons on the winning hand</p>" +
          '<div class="btns"><button class="btn" data-act="quit">Menu</button><button class="btn gold" data-act="again">Rematch</button></div>');
      });
    }
  }
  function duelTick() {
    var d = cur, el = document.getElementById("g-timer");
    if (!el || d.phase !== "stand") return;
    var left = Math.max(0, d.endAt - clock.t), s = Math.ceil(left / 1000);
    var html = "⏱ " + Math.floor(s / 60) + ":" + (s % 60 < 10 ? "0" : "") + (s % 60) + ' <span class="dim">' + (d.stand.by === "you" ? "bot's turn" : "beat " + G.qstr(d.stand.total)) + "</span>";
    if (el.innerHTML !== html) el.innerHTML = html;
    el.className = "timer" + (left < 10000 ? " low" : "");
  }
  function ocard(c, val) {
    return '<span class="oc lv' + c.level + (c.seq ? " seqc" : "") + (c.set === "limited" ? " lim" : "") + '" data-act="zoom" data-arg="' + c.i + '">' +
      '<span class="ocf">' + (c.seq ? esc(c.name) : c.r.h) + "</span>" + (val !== undefined ? '<span class="ocv">' + (val ? qh(val) : "?") + "</span>" : "") + "</span>";
  }
  function duelOpp() {
    var d = cur, b = d.bot, ev = d.phase === "over" ? d.botEv : null;
    var hot = (d.phase === "stand" && d.stand.by === "bot") || /called|stands|wins/i.test(b.status);
    setHtml("g-opp", '<div class="opp-h"><b>🤖 Bot</b><span class="dim">' + G.botCfg(d.level).label + " · " + mv("N") + " = " + b.hand.length + "</span>" +
      '<span class="st' + (hot ? " hot" : "") + '">' + esc(b.status) + "</span></div>" +
      '<div class="ochips">' + b.hand.map(function (id, k) { return ocard(card(id), ev ? ev.values[k] : undefined); }).join("") + "</div>" +
      (ev ? '<div class="opp-t">' + xyText(b.x, b.y, needsOf(b.hand)) + " → " + totalLine(ev) + statusNote(ev.status) + "</div>" : ""));
  }
  function duelVerdict() {
    var d = cur, r = d.result;
    if (d.phase === "over") {
      return '<span class="' + (r.winner === "you" ? "good" : r.winner ? "bad" : "warn") + '">' + r.msg + "</span>" +
        (r.pts ? ' <span class="dim">' + (r.winner === "you" ? "You" : "Bot") + " +" + r.pts + "</span>" : "");
    }
    if (d.phase === "stand" && d.stand.by === "you") return '<span class="good">You stand on ' + qh(d.stand.total) + '</span> <span class="dim">— the bot has 60 s to beat it</span>';
    if (d.phase === "stand") return '<span class="warn">Beat ' + qh(d.stand.total) + '!</span> <span class="dim">Your X counts when time runs out.</span>';
    return '<span class="dim">Make 21 and call it, or stand on your best.</span>';
  }
  function duelActs() {
    var d = cur, n = d.you.hand.length;
    if (d.phase === "over") {
      return d.matchOver ? '<button class="act" data-act="quit">Menu</button><button class="act call" data-act="again" style="grid-column:span 2">Rematch</button>' :
        '<button class="act call wide" data-act="next">Next game ▶</button>';
    }
    if (d.phase === "stand" && d.stand.by === "you") return '<button class="act wide" data-act="skip">⏩ Skip to the buzzer<small>you\'re locked in — the bot keeps its thinking time</small></button>';
    return '<button class="act" data-act="draw"' + (n < G.MAX_HAND ? "" : " disabled") + ">＋ Draw<small>" + (n < G.MAX_HAND ? "N → " + (n + 1) : "max 5") + "</small></button>" +
      (d.phase === "stand" ? '<button class="act" data-act="submit">✓ Submit<small>answer now</small></button>' :
        '<button class="act" data-act="stand">✋ Stand<small>lock my total</small></button>') +
      '<button class="act call" data-act="call">Call 21<small>I have it!</small></button>';
  }

  /* ============================ pause / quit ============================ */
  function pause() {
    if (!cur || cur.over || cur.kind === "practice" || (cur.kind === "duel" && cur.phase === "over")) return;
    if (clock.paused) return;
    clock.paused = true;
    var g = $("#g"); if (g) g.classList.add("paused");
    overlay('<h2>Paused</h2><p class="note">The clock is stopped and the cards are hidden.</p>' +
      '<div class="btns"><button class="btn" data-act="quit">Quit game</button><button class="btn gold" data-act="resume">Resume</button></div>');
  }
  function resume() {
    closeOverlay();
    clock.paused = false;
    var g = $("#g"); if (g) g.classList.remove("paused");
  }
  function endGame() { stopClock(); cur = null; closeOverlay(); fxLayer.innerHTML = ""; }
  document.addEventListener("visibilitychange", function () { if (document.hidden) pause(); });

  /* ============================ card zoom ============================ */
  function zoom(id) {
    var c = card(id);
    if (!c) return;
    var extra = "";
    if (c.seq) {
      var terms = G.seqPreview(c.seq, 60);
      extra = '<p class="note">Value = ' + G.SEQ_INFO[c.seq] + ". If X is negative, count as if it were positive, then make the result negative.</p>" +
        '<div class="seqt">' + terms.map(function (t, k) { return "<span><i>" + (k + 1) + "</i>" + t + "</span>"; }).join("") + "</div>";
    } else {
      extra = '<p class="note">' + esc(c.text) + "</p>";
    }
    overlay(G.cardHtml(c) + '<p class="note" style="margin-top:12px"><span class="ics">' + G.shapesHtml(c.level) + "</span>" +
      " Level " + c.level + " · " + c.icons + " icon" + (c.icons > 1 ? "s" : "") + " · " + G.SETS[c.set] +
      (c.origin === "published" ? " · published card" : " · fan-made") + "</p>" + extra +
      '<div class="btns" style="grid-template-columns:1fr"><button class="btn" data-act="close">Close</button></div>', "zoom", true);
  }

  /* ============================ menu screens ============================ */
  function big(act, title, sub) { return '<button class="big" data-act="' + act + '"><b>' + title + "</b><small>" + sub + "</small></button>"; }
  function topBar(title) { return '<div class="top"><button class="ib" data-act="home" aria-label="Back">‹</button><h2>' + title + "</h2></div>"; }
  function homeScreen() {
    var best = (BEST[soloKey()] || [])[0];
    app.innerHTML = '<div class="menu"><div class="logo">21<i>X</i></div><div class="tag">Algebraic blackjack · practice trainer</div>' +
      (LOAD_ERR ? '<div class="err">Card list error: ' + esc(LOAD_ERR) + "</div>" : "") +
      big("solo", "Solo challenge", "Official single-player rules: race to 21 difficulty icons" + (best ? " · best " + fmtTime(best.ms) : "")) +
      big("duel", "Duel vs bot", "Multiplayer rules: call 21, stand, beat the 60-second timer · " + G.botCfg(S.bot).label + " bot") +
      big("practice", "Practice", "No clock · hints" + (S.live ? ", live totals" : "") + " and missed-solution tips") +
      '<div class="row3"><button class="btn" data-act="rules">How to play</button><button class="btn" data-act="cards">Cards</button><button class="btn" data-act="settings">Settings</button></div>' +
      '<div class="foot">Deck: ' + esc(deckLabel()) + " · " + deckList().length + " cards<br>Unofficial fan-made trainer. 21X is a card game by Naylor Games.</div></div>";
  }
  function tog(key, title, sub) {
    return '<div class="sw"><span>' + title + (sub ? "<small>" + sub + "</small>" : "") + '</span><button class="tog' + (S[key] ? " on" : "") +
      '" data-act="set" data-arg="' + key + '" role="switch" aria-checked="' + !!S[key] + '" aria-label="' + esc(title) + '"></button></div>';
  }
  function seg(act, opts, curv) {
    return '<div class="seg">' + opts.map(function (o) {
      return '<button data-act="' + act + '" data-arg="' + o[0] + '" class="' + (String(curv) === String(o[0]) ? "on" : "") + '">' + o[1] + "</button>";
    }).join("") + "</div>";
  }
  var BOT_NOTE = {
    easy: "Slow (about 15–25 s per decision, longer for hard hands), only tries X from −6 to 6, stands on 17 or more.",
    medium: "About 8–14 s per decision, tries X from −15 to 15, stands on 18 or more.",
    hard: "About 4–7 s per decision, tries X from −60 to 60, stands on 19 or more."
  };
  function settingsScreen() {
    var n = deckList().length;
    app.innerHTML = '<div class="menu">' + topBar("Settings") +
      '<div class="sect"><h3>Deck</h3><div class="seg">' + [1, 2, 3].map(function (lv) {
        return '<button data-act="lvl" data-arg="' + lv + '" class="' + (S.levels.indexOf(lv) >= 0 ? "on" : "") + '">Level ' + lv + "</button>";
      }).join("") + "</div>" +
      tog("celebrity", "Celebrity cards", "6 gold sequence cards: primes, triangle numbers, Fibonacci, sum of factors, digits of π and e") +
      tog("limited", "V &amp; Y cards (fan-made)", "27 cards with Y (you choose it, always positive), V (1 + hands or games won) and factorials") +
      '<p class="note">' + n + " cards in the deck" + (n < 10 ? ' — <b class="bad">need at least 10</b>' : "") + ". The official solo rules use all Core cards (levels 1–3).</p></div>" +
      '<div class="sect"><h3>Solo: wrong-call penalty</h3>' + seg("pen", [[0, "None"], [5, "5 s"], [10, "10 s"], [30, "30 s"]], S.penalty) +
      '<p class="note">The rulebook has no penalty: checking your maths is the cost. Here checking is instant, so a penalty stops you guessing your way to 21. Best times are kept separately for each setting.</p></div>' +
      '<div class="sect"><h3>Duel: bot level</h3>' + seg("bot", [["easy", "Easy"], ["medium", "Medium"], ["hard", "Hard"]], S.bot) +
      '<p class="note">' + BOT_NOTE[S.bot] + "</p></div>" +
      '<div class="sect"><h3>Practice</h3>' + tog("live", "Live totals", "Show each card's value as you type X") +
      tog("missed", "Missed-21 tips", "When you mulligan a hand that could make 21, show the X that worked (practice and solo)") + "</div>" +
      '<div class="sect"><h3>Records</h3><button class="btn" data-act="resetrec">Clear best times</button></div></div>';
  }
  function cardsScreen() {
    function group(label, list) {
      if (!list.length) return "";
      return '<div class="gal-l">' + label + " · " + list.length + '</div><div class="gal">' + list.map(function (c) {
        return G.cardHtml(c, { cls: "zoomable" + (c.origin === "published" ? " pub" : ""), attrs: ' data-act="zoom" data-arg="' + c.i + '"' });
      }).join("") + "</div>";
    }
    function pick(set, lv) { return CARDS.filter(function (c) { return c.set === set && (!lv || c.level === lv); }); }
    var pub = CARDS.filter(function (c) { return c.origin === "published"; }).length;
    app.innerHTML = '<div class="menu">' + topBar("Cards") +
      '<p class="note">The official card list isn\'t published. <b>★</b> marks the ' + pub + " cards that appear in the rulebook or in published reviews; the rest are fan-made to the rulebook's level definitions. Tap a card to enlarge it. Edit <code>data/cards.csv</code> to match your own deck.</p>" +
      group("Core · Level 1", pick("core", 1)) + group("Core · Level 2", pick("core", 2)) + group("Core · Level 3", pick("core", 3)) +
      group("Celebrity", pick("celebrity")) + group("V &amp; Y · Level 1", pick("limited", 1)) + group("V &amp; Y · Level 2", pick("limited", 2)) +
      group("V &amp; Y · Level 3", pick("limited", 3)) + "</div>";
  }
  function rulesScreen() {
    var s1 = G.shapesHtml(1), s2 = G.shapesHtml(2), s3 = G.shapesHtml(3);
    function ic(h) { return '<span class="ics">' + h + "</span>"; }
    app.innerHTML = '<div class="menu">' + topBar("How to play") +
      '<div class="sect"><h3>The goal</h3><p>Make your cards add up to <b>exactly 21</b>. Every card is an algebra expression, and you choose the value of <i class="mv">X</i>. Go over 21 and you\'re bust.</p></div>' +
      '<div class="sect"><h3>The letters</h3><ul>' +
      "<li><b>" + mv("N") + "</b> is the number of cards in your hand: 2 at the start, and at most 5.</li>" +
      "<li><b>" + mv("X") + "</b> is a whole number you choose. It can be positive or negative but never 0. The same X applies to every card in your hand, and you can change it whenever you like until you call or stand.</li>" +
      "<li><b>" + mv("Y") + "</b> (V &amp; Y cards) is a second number you choose. It follows the same rules as X, except it must be positive.</li>" +
      "<li><b>" + mv("V") + "</b> (V &amp; Y cards) is 1 + the number of games you've won this session. In solo it's 1 + the number of hands in your score area.</li></ul></div>" +
      '<div class="sect"><h3>Totals</h3><ul><li>X must be whole, but your total doesn\'t have to be: 12.5 is fine.</li>' +
      "<li>Over 21 is <b>bust</b>. <b>Exactly 20 is bust too</b>. Most cards are even and hands start with N = 2, which would make 20 too easy.</li>" +
      "<li>Order of operations (BIDMAS): brackets, indices, × ÷, then + −. So −X² means −(X²).</li></ul></div>" +
      '<div class="sect"><h3>Difficulty icons</h3><ul>' +
      "<li>" + ic(s1) + " <b>Level 1</b>: integers, negatives, +, −, ×.</li>" +
      "<li>" + ic(s2) + " <b>Level 2</b>: division by 2, brackets, powers.</li>" +
      "<li>" + ic(s3) + " <b>Level 3</b>: harder division and expressions, the Celebrity sequences and factorials.</li></ul>" +
      "<p>A card's icon count is its level (1–3). Icons are what you score.</p></div>" +
      '<div class="sect"><h3>Celebrity cards (gold border)</h3><p>Each one shows a sequence. Its value is the term X places along it: the Xth prime, the Xth triangle number, Fib(X), the sum of the factors of X, or the Xth digit of π or e after the point. If X is negative, count as if X were positive, then make the result negative. Tap a card in play to see more terms.</p></div>' +
      '<div class="sect"><h3>Multiplayer rules (Duel)</h3><ul>' +
      "<li>Everyone plays at the same time with cards face up. There are no turns.</li>" +
      "<li><b>Draw</b> (twist): take the top card at any time, up to 5 cards. Each draw makes N bigger. You can't discard.</li>" +
      "<li><b>Call 21</b>: state your X and show your sum. If you're right you win the game. If you're wrong you're out until the next game.</li>" +
      "<li><b>Stand</b> (stick): lock in your total and X and start a <b>1-minute timer</b>. The others can keep drawing and calling 21, but nobody else can stand.</li>" +
      "<li>When the timer ends, everyone states their best valid total. Anyone still hesitating is out. Closest to 21 wins, and <b>the player who stood wins ties</b>.</li>" +
      "<li>The winner scores the difficulty icons on their cards. In the app, the first to 21 points wins the match.</li></ul></div>" +
      '<div class="sect"><h3>Single-player rules (Solo)</h3><ul>' +
      "<li>Goal: get <b>21 difficulty icons</b> into your score area as fast as you can. The rulebook uses all Core cards.</li>" +
      "<li>Make exactly 21, and the hand goes to your score area. You then get 2 new cards.</li>" +
      "<li><b>Mulligan</b> whenever you like: discard your whole hand and take 2 new cards.</li>" +
      "<li>There's no standing in solo. When the deck runs out, the discards are shuffled into a new deck.</li></ul></div>" +
      '<div class="sect"><h3>About this app</h3><ul>' +
      "<li>Checking is instant here, so in Solo a wrong call adds a time penalty (Settings). The rulebook has none.</li>" +
      "<li>The duel bot thinks for a while, depending on its level and how hard its hand looks, and only tries a limited range of X. Once you stand you're locked in, and you can skip ahead to the buzzer.</li>" +
      "<li>The official card list isn't public. This deck includes every card shown in the rulebook and published reviews, plus fan-made cards built to the same level rules (see Cards).</li>" +
      "<li>Optional harder variants from the rulebook, like non-integer X or more than 5 cards, aren't implemented.</li></ul>" +
      '<p class="note">Unofficial fan project, not affiliated with Naylor Games. Buy the real game at naylorgames.com.</p></div></div>';
  }
  var SCREENS = { home: homeScreen, settings: settingsScreen, cards: cardsScreen, rules: rulesScreen };
  function go(name) { endGame(); window.scrollTo(0, 0); SCREENS[name](); }

  /* ============================ input wiring ============================ */
  var ACTS = {
    home: function () { go("home"); },
    rules: function () { go("rules"); },
    cards: function () { go("cards"); },
    settings: function () { go("settings"); },
    solo: function () { startSolo(false); },
    practice: function () { startSolo(true); },
    duel: function () { startDuel(); },
    quit: function () { go("home"); },
    pause: pause,
    resume: resume,
    again: function () { var k = cur && cur.kind; closeOverlay(); if (k === "duel") startDuel(); else startSolo(k === "practice"); },
    next: function () { if (cur && cur.kind === "duel" && cur.phase === "over" && !cur.matchOver) duelNewGame(); },
    key: pressKey,
    step: function (d) { stepKey(+d); },
    focus: function (f) { if (cur && inputOpen()) { inp.focus = f; renderInputs(); } },
    call: function () { if (!cur || clock.paused) return; if (cur.kind === "duel") duelCall(); else soloCall(); },
    draw: function () { if (!cur || clock.paused) return; if (cur.kind === "duel") duelDraw(); else soloDraw(); },
    mulligan: function () { if (cur && cur.kind !== "duel" && !clock.paused) soloMulligan(); },
    stand: function () { if (cur && cur.kind === "duel" && !clock.paused) duelStand(); },
    submit: function () { if (cur && cur.kind === "duel" && cur.phase === "stand" && cur.stand.by === "bot") duelBuzzer(); },
    skip: function () { if (cur && cur.kind === "duel") duelSkip(); },
    hint: practiceHint,
    zoom: function (id) { zoom(+id); },
    close: closeOverlay,
    lvl: function (lv) {
      lv = +lv;
      var i = S.levels.indexOf(lv);
      if (i >= 0 && S.levels.length === 1) { toast("Keep at least one level"); return; }
      if (i >= 0) S.levels.splice(i, 1); else S.levels.push(lv);
      saveSettings(); settingsScreen();
    },
    set: function (k) { S[k] = !S[k]; saveSettings(); settingsScreen(); },
    pen: function (v) { S.penalty = +v; saveSettings(); settingsScreen(); },
    bot: function (v) { S.bot = v; saveSettings(); settingsScreen(); },
    resetrec: function () {
      overlay("<h2>Clear best times?</h2><p class=\"note\">This removes every saved solo time on this device.</p>" +
        '<div class="btns"><button class="btn" data-act="close">Cancel</button><button class="btn gold" data-act="resetyes">Clear</button></div>');
    },
    resetyes: function () { BEST = {}; save("best", BEST); closeOverlay(); toast("Best times cleared"); }
  };
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-act]");
    if (!b || b.disabled) return;
    var fn = ACTS[b.getAttribute("data-act")];
    if (fn) fn(b.getAttribute("data-arg"));
  });
  document.addEventListener("keydown", function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var k = e.key, ov = $(".ov");
    if (ov) { if (k === "Escape") { if (clock.paused) resume(); else if (!cur || !cur.over) closeOverlay(); e.preventDefault(); } return; }
    if (!cur) return;
    if (/^[0-9]$/.test(k)) pressKey(k);
    else if (k === "-" || k === "_") pressKey("neg");
    else if (k === "Backspace") pressKey("back");
    else if (k === "Enter") { if (cur.kind === "duel" && cur.phase === "over") ACTS.next(); else ACTS.call(); }
    else if (k === "ArrowUp" || k === "+" || k === "=") stepKey(1);
    else if (k === "ArrowDown") stepKey(-1);
    else if (k === "d" || k === "D") ACTS.draw();
    else if (k === "m" || k === "M") ACTS.mulligan();
    else if (k === "s" || k === "S") ACTS.stand();
    else if (k === "h" || k === "H") practiceHint();
    else if (k === "y" || k === "Y" || k === "x" || k === "X") ACTS.focus(k.toLowerCase());
    else if (k === "Escape") { if (cur.kind === "practice") go("home"); else pause(); }
    else return;
    e.preventDefault();
  });

  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("sw.js").catch(function () {});
  }
  go("home");
})();
