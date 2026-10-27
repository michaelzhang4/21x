// Validate the ASSEMBLED html: pull the embedded card list and scripts back out and use them.
var fs = require("fs"), path = require("path"), vm = require("vm");
var html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

var csv = html.match(/<script type="text\/plain" id="cards-csv">([\s\S]*?)<\/script>/);
if (!csv) throw new Error("missing embedded card list");
var scripts = [], re = /<script>([\s\S]*?)<\/script>/g, m;
while ((m = re.exec(html))) scripts.push(m[1]);
if (scripts.length !== 3) throw new Error("expected 3 inline scripts, found " + scripts.length);

// run the embedded engine and generators exactly as the browser would (they attach to window)
var sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(scripts[0], sandbox);
vm.runInContext(scripts[1], sandbox);
var X21 = sandbox.window.X21, T = sandbox.window.TOT;
new vm.Script(scripts[2]);                       // app.js must at least parse

var cards = X21.loadCards(csv[1]), ok = cards.length === 54;
console.log("EMBEDDED BUILD CHECK (from final HTML)");
console.log(" cards: " + cards.length);
["mental", "linear"].forEach(function (cat) {
  Object.keys(T.RAMPS).forEach(function (diff) {
    var qs = T.makeRound(cat, { diff: diff, seed: 2026, cards: cards });
    var right = qs.filter(function (q) { return T.isRight(q, q.answer); }).length;
    ok = ok && qs.length === 10 && right === 10;
    console.log(" " + cat + "/" + diff + ": " + qs.length + " questions, " + right + " self-checked · " + qs.map(function (q) { return q.type; }).join(" "));
  });
});
var hand = ["6X", "2X+4", "X/2"].map(function (f) { return cards.filter(function (c) { return c.formula === f; })[0]; });
var two = T.makeRound("linear", { diff: "gentle", seed: 7, cards: cards, types: ["x21", "eig"] });
ok = ok && two.length === 10 && two.every(function (q) { return q.type === "x21" || q.type === "eig"; });
console.log(" picked types only (21X hands + eigenvalues): " + two.map(function (q) { return q.type; }).join(" "));
console.log(" rulebook hand 6X + 2X+4 + X/2 makes 21 at X = " + X21.solveX(hand, 30).join(", "));
console.log(" html size: " + html.length.toLocaleString() + " chars");
console.log(ok && X21.solveX(hand, 30)[0] === 2 ? "PASS" : "CHECK");
