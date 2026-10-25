# 21X trainer

**▶ Live: [michaelzhang4.github.io/21x](https://michaelzhang4.github.io/21x/)**

A phone-friendly, **single-file** web app for practising *21X*, the algebraic blackjack
card game. Every card is an expression in **X** (a whole number you choose, never 0) and
**N** (how many cards you hold). Pick an X that makes your hand total exactly 21. Over 21 is
bust, and so is exactly 20.

> ⚠️ Unofficial fan project. *21X* is a card game by [Naylor Games](https://naylorgames.com/)
> (designer Leo Samson). This project is not affiliated with or endorsed by Naylor Games.

## Modes

- **Solo challenge**: the rulebook's single-player mode. Race to put **21 difficulty
  icons** into your score area by making hands that total exactly 21. You can mulligan
  any time, draw up to 5 cards, and there's no standing. A stopwatch runs, and your best
  times are saved for each deck and penalty setting.
- **Duel vs bot**: the multiplayer rules against a bot (Easy, Medium or Hard).
  - Draw up to 5 cards.
  - **Call 21** to win the game instantly. A wrong call knocks you out of that game.
  - **Stand** to lock in your total and start a **60-second timer** your opponent must
    beat. Ties go to the player who stood.
  - The winner scores the icons on their hand. First to 21 points wins the match.
- **Practice**: no clock. You get hints (is 21 possible? which X?), optional live totals,
  and a tip whenever you mulligan a hand that could have made 21.
- **Cards** (a gallery with zoom, plus indexed sequences for the Celebrity cards) and
  **How to play**.

The app has a custom keypad with a ± key, because phone number keyboards often have no
minus. It also has exact fraction arithmetic (4X/N, X/2 … are never rounded), and you can
pause it. When added to your home screen it runs full-screen and works offline.

## Rules implemented

Taken from the official rulebook (via [RulesPal](https://rulespal.com/21x/rulebook)) and
cross-checked against published reviews:

- **N** is the number of cards in your hand (2 to start, max 5).
- **X** is a non-zero whole number, the same on every card. You can change it until you
  call or stand.
- Totals may be fractions. Over 21 is bust, and **exactly 20 is bust** too.
- Difficulty icons: ▲ level 1 (integers, + − ×), ■▲ level 2 (÷2, brackets, powers),
  ⬟■▲ level 3 (harder division and expressions).
- **Celebrity cards** (Xth prime, Xth triangle number, Fib(X), sum of factors of X, the Xth
  digit of π or e): the value is the term X places along the sequence. A negative X counts
  as positive, then the result is negated.
- **V & Y cards**: **Y** is a second number you choose, and it must be positive. **V** is
  1 + games won this session (in solo, 1 + hands in your score area).

App-specific choices:

- In Solo, a wrong call adds a time penalty (10 s by default, adjustable). The rulebook has
  no penalty because checking your maths is slow at the table, but here checking is instant.
- The duel bot "thinks" for a time that depends on its level and how hard its hand looks.
  It only searches a limited range of X.

## About the cards

The official card list isn't published. `data/cards.csv` holds the 87 cards in the app:

| Set | Cards | Source |
| --- | --- | --- |
| Core level 1 / 2 / 3 | 18 / 18 / 18 | all 28 Core cards shown in the rulebook or in published reviews (marked `published`), plus fan-made cards (`fan`) built to the rulebook's level definitions |
| Celebrity | 6 | the six sequence cards described in the rulebook |
| V & Y | 27 | fan-made, in the spirit of the Limited Edition expansion (Y, V and factorials) |

If you own the game, you can edit the CSV to match your deck and rebuild. The formulas use
the printed notation: `2X+4`, `4N/X`, `X(N+2)`, `(X-N)^2`, `N!`, `XY/N`, `prime(X)`,
`tri(X)`, `fib(X)`, `sigma(X)`, `pidigit(X)`, `edigit(X)`. Writing two terms next to each
other multiplies them, and `-X^2` means −(X²).

## Repository layout

| Path | What it is |
| --- | --- |
| `index.html` | The built, self-contained app (what GitHub Pages serves) |
| `data/cards.csv` | The card list (id, set, level, formula, name, origin) |
| `build/lib.js` | Pure game logic: exact rationals, formula parser/renderer, solver, solo game, bot (no DOM; Node-testable) |
| `build/app.js` | Browser UI: screens, keypad, game modes |
| `build/template.html` | HTML shell + CSS, with placeholders for the scripts and the card list |
| `build/build.ps1` | Assembles `index.html` from the template, scripts and CSV |
| `build/test.js`, `build/verify.js` | Validation harnesses (Node) |
| `manifest.webmanifest`, `sw.js`, `icon-*.png` | Home-screen install and offline support |

## Building from source

```powershell
# from the repo root (Windows PowerShell or PowerShell 7)
powershell -ExecutionPolicy Bypass -File "build/build.ps1"
```

Validate (requires [Node.js](https://nodejs.org/) 18+):

```bash
node build/test.js     # unit tests (rules, parser, sequences, solver, solo game, bot) + deck statistics
node build/verify.js   # re-extracts the embedded card list and scripts from the built HTML and checks them
```

## Publishing

GitHub Pages serves `index.html` straight from the `main` branch: **Settings → Pages →
Build and deployment → Deploy from a branch → `main` / `(root)`**. After pushing a rebuilt
`index.html`, the site updates within a minute or two.

On your phone, open the live link. Then use **Share → Add to Home Screen** (iOS) or
**⋮ → Add to Home screen / Install app** (Android) to get a full-screen app.

## License

The **code** in this repository is released under the [MIT License](LICENSE).

The game *21X*, its name and rules belong to Naylor Games and are **not** covered by the MIT
license. They are summarised here for practice and fan use only. Please buy the real game.
