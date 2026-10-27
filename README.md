# Train of Thought

**▶ Live: [michaelzhang4.github.io/21x](https://michaelzhang4.github.io/21x/)**

A phone-friendly, **single-file** web app for getting your head into gear on the morning
train. Every day there are two rounds of ten questions, **Mental maths** and
**Linear algebra**, each with a timer and a score.

## How a round works

- The ten questions ramp up: warm-ups first, then harder ones. Everyone gets the same
  questions on the same day (they're generated from the date), and a new set arrives at midnight.
- Every answer is a whole number. Type it on the built-in keypad (with **±** for negatives) and submit.
- Your **score** is how many you get right. Your **time** is the total time spent answering:
  the clock only runs while a question is waiting for you.
- Get one wrong (or skip it) and you see the right answer with a short worked solution.
  The worked answers show the mental shortcut, like `(70 − 3)² = 4900 − 420 + 9`.
- Pause any time. Locking your phone pauses too. A daily round in progress is saved, so if
  you reach your stop halfway through, you can finish it later that day.
- The results screen reviews every question and compares the round with your last seven.
  **History** tracks your streak, averages and fastest perfect rounds.
- **Extra rounds** give you ten random questions that don't count towards your history.

## What's in the rounds

**Mental maths:** addition and subtraction (with carries), times tables and 2-digit
multiplication, exact division, percentages and percentage change, fractions of amounts,
squares, square roots, powers, order of operations, negatives, remainders, averages,
series (1 + 2 + ⋯ + n, sums of odd numbers) and shortcuts (×5, ×25, ×11, ×99, ×101, ×125,
(m − d)(m + d)).

**Linear algebra:** half equations, half vectors and matrices.

- Equations: linear equations (with brackets and fractions), simultaneous equations, slopes and
  linear functions, and singular matrices ("find k").
- Vectors and matrices: dot and cross products, linear combinations, 2×2 and 3×3 determinants,
  matrix–vector and matrix–matrix products, trace, eigenvalues, inverses, vector lengths and
  determinant rules (det(2AB), det(Aᵀ), det(A⁻¹B) …).
- **One 21X hand per round.** From the algebraic blackjack card game *21X*: choose a whole number
  **X** (never 0) so the cards total exactly 21, where **N** is the number of cards in the hand.
  The hands are dealt from the 54 Core cards in `data/cards.csv`. Any X that makes 21 counts.

**Difficulty** (Settings) changes the ramp. **Gentle** has six warm-ups and four medium
questions. **Standard** has three warm-ups, four medium and three hard. **Spicy** has one
warm-up, three medium and six hard. Each difficulty has its own daily set.

## On your phone

Open the live link, then use **Share → Add to Home Screen** (iOS) or **⋮ → Install app**
(Android). It then opens full screen and works offline, which helps in tunnels. History and
settings are stored only in your browser on that device.

## Repository layout

| Path | What it is |
| --- | --- |
| `index.html` | The built, self-contained app (what GitHub Pages serves) |
| `build/lib.js` | Question generators, daily rounds, streaks (no DOM; Node-testable) |
| `build/cards.js` | The 21X card engine: exact rationals, card formula parser/renderer, "make 21" solver |
| `build/app.js` | Browser UI: screens, keypad, clock, history |
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
node build/test.js     # every question template re-solved independently over thousands of seeds, rounds, streaks, 21X engine
node build/verify.js   # re-extracts the embedded scripts and card list from the built HTML and checks them
```

`test.js` doesn't trust the generators' own answers. It parses each rendered question back
(matrices, equations, card hands) and works the answer out again a different way, for 400
seeds of every template at every difficulty tier.

If you change a generator, bump `GEN` in `build/lib.js`. That reseeds every daily set, so a
day's questions never mix two versions.

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
