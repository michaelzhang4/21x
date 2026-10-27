# Train of Thought

**▶ Live: [michaelzhang4.github.io/21x](https://michaelzhang4.github.io/21x/)**

A phone-friendly, **single-file** web app for getting your head into gear on the morning
train: tap **Start** for a round of ten questions, mixing mental maths, linear algebra and
21X hands, each round with a timer and a score. Nothing is tracked.

## How a round works

- Each round is ten questions picked at random from all the question types you've switched
  on, in either section (see below). They start with warm-ups and get harder, and every round is new.
- Every answer is a whole number. Type it on the built-in keypad (with **±** for negatives) and submit.
- Your **score** is how many you get right. Your **time** is the total time spent answering:
  the clock only runs while a question is waiting for you.
- Get one wrong (or skip it) and you see the right answer with a short worked solution.
  The worked answers show the mental shortcut, like `(70 − 3)² = 4900 − 420 + 9`.
- Pause any time. Locking your phone pauses too.
- The results screen reviews all ten questions. Once you leave it, the round is gone.

## Choosing the questions

**Settings** lists every question type for each round. Tap one to switch it on or off, or
use **All** / **None**. A round never repeats a type until each type you've switched on has
come up, so switching on just "Eigenvalues" and "21X hands" gives you five of each.

**Mental maths:** addition, subtraction, multiplication, division, squares, square roots,
percentages, fractions of amounts, order of operations, multiplication shortcuts (×5, ×25,
×11, ×99, ×101, ×125, (m − d)(m + d)), powers, series sums, remainders, negative numbers,
averages, doubling and halving.

**Linear algebra:**

- Equations: linear equations, two-sided equations (brackets, fractions), simultaneous
  equations, slopes and linear functions, singular matrices ("find k").
- Vectors and matrices: dot products, linear combinations, 2×2 and 3×3 determinants,
  matrix × vector, matrix products, trace, eigenvalues, inverses, vector lengths, cross
  products, determinant rules (det(2AB), det(Aᵀ), det(A⁻¹B) …). With both kinds switched on,
  a round mixes them evenly.
- **21X hands.** From the algebraic blackjack card game *21X*: choose a whole number **X**
  (never 0) so the cards total exactly 21, where **N** is the number of cards in the hand.
  The hands are dealt from the 54 Core cards in `data/cards.csv`. Any X that makes 21 counts.

**Difficulty** sets the ramp. **Gentle** has six warm-ups and four medium questions.
**Standard** has three warm-ups, four medium and three hard. **Spicy** has one warm-up, three
medium and six hard. A few types only come in a hard version (eigenvalues, inverses, 3×3
determinants, cross products) or an easy one (doubling and halving, linear combinations). With
lots of types on, the difficulty decides which turn up; switch on just a few and they all do.

## Privacy

Nothing is tracked: no scores, no history, no analytics, no network requests beyond loading the
page. Your settings (question types, difficulty, vibration) are the only thing saved, in your
browser's local storage. Opening this version also deletes the round history that earlier
versions of the app kept.

## On your phone

Open the live link, then use **Share → Add to Home Screen** (iOS) or **⋮ → Install app**
(Android). It then opens full screen and works offline, which helps in tunnels.

## Repository layout

| Path | What it is |
| --- | --- |
| `index.html` | The built, self-contained app (what GitHub Pages serves) |
| `build/lib.js` | Question generators and round building (no DOM; Node-testable) |
| `build/cards.js` | The 21X card engine: exact rationals, card formula parser/renderer, "make 21" solver |
| `build/app.js` | Browser UI: screens, keypad, clock, settings |
| `build/template.html` | HTML shell + CSS, with placeholders for the scripts and the card list |
| `build/build.ps1` | Assembles `index.html` from the template, scripts and CSV |
| `build/icons.ps1` | Draws `icon-180.png` and `icon-512.png` |
| `build/test.js`, `build/verify.js` | Validation harnesses (Node) |
| `data/cards.csv` | The 21X Core cards used for the 21X hands |
| `manifest.webmanifest`, `sw.js`, `icon-*.png` | Home-screen install and offline support |

## Building from source

```powershell
# from the repo root (Windows PowerShell or PowerShell 7)
powershell -ExecutionPolicy Bypass -File "build/build.ps1"
```

Validate (requires [Node.js](https://nodejs.org/) 18+):

```bash
node build/test.js     # every question template re-solved independently, round building and type picking, 21X engine
node build/verify.js   # re-extracts the embedded scripts and card list from the built HTML and checks them
```

`test.js` doesn't trust the generators' own answers. It parses each rendered question back
(matrices, equations, card hands) and works the answer out again a different way, for 400
seeds of every template at every difficulty tier. It also checks that rounds only use the
types you pick, and that every picked type comes up.

## Publishing

GitHub Pages serves `index.html` straight from the `main` branch: **Settings → Pages →
Build and deployment → Deploy from a branch → `main` / `(root)`**. After pushing a rebuilt
`index.html`, the site updates within a minute or two.

## History and credits

This repo started as a trainer for *21X*, the algebraic blackjack card game. The 21X hand
questions keep its card engine and Core card list. *21X* is a card game by
[Naylor Games](https://naylorgames.com/) (designer Leo Samson). This project is not affiliated
with or endorsed by Naylor Games.

## License

The **code** in this repository is released under the [MIT License](LICENSE). The game *21X*,
its name and rules belong to Naylor Games and are not covered by the MIT license.
