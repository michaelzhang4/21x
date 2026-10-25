// Validate the ASSEMBLED html: pull the embedded card list and scripts back out and use them.
var fs = require("fs"), path = require("path"), vm = require("vm");
var html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

var csv = html.match(/<script type="text\/plain" id="cards-csv">([\s\S]*?)<\/script>/);
if (!csv) throw new Error("missing embedded card list");
var scripts = [], re = /<script>([\s\S]*?)<\/script>/g, m;
while ((m = re.exec(html))) scripts.push(m[1]);
if (scripts.length !== 2) throw new Error("expected 2 inline scripts, found " + scripts.length);

// run the embedded lib exactly as the browser would (it attaches itself to window)
var sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(scripts[0], sandbox);
var G = sandbox.window.X21;
new vm.Script(scripts[1]);                       // app.js must at least parse

var cards = G.loadCards(csv[1]);
var sets = {};
cards.forEach(function (c) { var k = c.set + " L" + c.level; sets[k] = (sets[k] || 0) + 1; });
var core = G.deckIds(cards, { levels: [1, 2, 3] });
var g = new G.Solo(cards, core, { rng: G.mulberry32(5) });
var rendered = cards.map(function (c) { return G.cardHtml(c); }).join("").length;
var ex = G.evalHand(["6X", "2X+4", "X/2"].map(function (f) { return cards.filter(function (c) { return c.formula === f; })[0]; }), { X: 2, N: 3 });

console.log("EMBEDDED BUILD CHECK (from final HTML)");
console.log(" cards: " + cards.length + " | " + Object.keys(sets).sort().map(function (k) { return k + "=" + sets[k]; }).join(", "));
console.log(" core deck: " + core.length + " | solo deal: " + g.hand.length + " cards");
console.log(" rulebook example 6X + 2X+4 + X/2 at X=2, N=3: " + G.qstr(ex.total));
console.log(" rendered card HTML chars (no throw): " + rendered);
console.log(" html size: " + html.length.toLocaleString() + " chars");
console.log(cards.length === 87 && core.length === 54 && ex.status === "win" ? "PASS" : "CHECK");
