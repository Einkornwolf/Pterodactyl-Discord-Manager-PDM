# Testing PDM

Use a supported version of Node.js (24.17+ or 26.x):

```sh
npm ci --ignore-scripts
npm test -- --runInBand
npm run test:ci
```

`npm run test:ci` runs the full suite with coverage. Open `coverage/lcov-report/index.html` for source-level coverage; `coverage/coverage-summary.json` and `coverage/lcov.info` are available for tooling. Jest includes **all** production JavaScript in its coverage inventory, including files that were not imported by a test.

CI enforces minimum coverage of 95% statements, 95% lines, 90% functions, and 70% branches. The initial foundation passes 470 tests with 98.06% statements, 98.75% lines, 95.48% functions, and 75.19% branches. These figures include the empty season-pass methods mentioned below; no production file is excluded to inflate the totals.

## Coverage map

| Behavior | Suites |
| --- | --- |
| Real SQLite persistence, object/user/shop operations | `dataBaseInterface.test.js` |
| Passwords, rounding, randomness, font fitting, file discovery and hot reload | `passwordGenerator.test.js`, `utilityCollection.test.js`, `bootstrapAndLoaders.test.js`, `nativeDependencies.test.js` |
| Axios headers, credentials, payloads, timeouts and error propagation | `http.test.js` |
| Panel accounts, allocations, server creation and retries, power actions, resources, ownership, runtime and deletion lists | `panelOperations.test.js` |
| Economy totals/rankings/daily reset, gift codes, boosters and user caches | `domainManagers.test.js` |
| Translation lookup and language changes, emoji parsing/fallbacks, log records and filesystem failures | `localizationAndLogging.test.js` |
| Bootstrap, every interaction registry/loader/reloader, event dispatch and collector-owned IDs | `bootstrapAndLoaders.test.js`, `eventDispatch.test.js` |
| Slash commands, admin/non-admin paths, balances, transfers, redemption, menus and runtime assignment | `commands.test.js`, `accountFlows.test.js`, `serverFlows.test.js`, `shopAndGiftFlows.test.js` |
| Account creation/linking/deletion/reset, booster claims, and language buttons | `accountFlows.test.js` |
| Server ownership checks, installation guards, power/rename/delete, renewals, live data and pagination | `serverFlows.test.js` |
| Shop form/cache/confirmation/cancellation/deletion, purchase validation/retries/charges, gift-code collectors | `shopAndGiftFlows.test.js` |
| Message rewards, integer/binary counting, controlled developer reload/eval/ban paths | `messageCommands.test.js` |
| Blackjack deck/aces/dealer rules/hit/stand/split/double/cancel/timeout, settlement and daily limits, all trivia difficulties and number guessing | `blackjackRules.test.js`, `minigameFlows.test.js` |
| Midnight reset, expiry reminders, suspension, deletion and missing-server cleanup | `scheduledJobs.test.js` |
| Season reward probabilities/scaling, daily dates and reward rendering | `seasonPass.test.js` |

Tests assert outcomes and side effects, including operations that must **not** happen after invalid input or a failed purchase. Discord builders are real, so test payloads are serialized by the installed Discord library. Discord sessions, panel HTTP, trivia HTTP, scheduled timers, and per-handler dependencies use isolated fakes. The SQLite adapter and native canvas encoding/decoding have separate real integration checks. No test logs into Discord, calls a live panel, sends an actual message, or starts recurring jobs.

`tests/setupEnv.js` supplies dummy configuration. `tests/helpers/memoryDatabase.js` is the storage boundary for domain tests; `handlerHarness.js` supplies users, collectors, and dependencies for interaction tests. Fake timers and controlled randomness keep retry, date, and game tests reproducible.

## Scope and remaining gaps

The six XP/level-completion methods in `SeasonPassManager` are empty TODOs. Their behavior needs a product specification and implementation before meaningful assertions can be written; `seasonPass.test.js` records this as a TODO rather than asserting a no-op. They remain visible in coverage. Error recovery that depends on live Discord/Pterodactyl availability is exercised at the boundary, rather than through live end-to-end requests.

The existing PR stack adds focused regression tests for its own cache, authorization, atomic transfer, concurrency, collector, runtime-override and logging changes. Preserve those tests when rebasing the stack onto this foundation.

## GitHub Actions

One workflow checks both supported Node.js lines for pushes to `main`, **all** PR base branches (including stacked PRs), and manual runs. Superseded runs are canceled; jobs have a time limit and read-only repository permissions. Actions are pinned to verified commit SHAs and kept current by Dependabot. npm uses its lockfile and download cache. The separate canvas smoke step is replaced by real native canvas tests in the suite. Only the Node 24 coverage report is uploaded, for seven days, to avoid duplicate artifacts.

Dependabot checks npm and GitHub Actions weekly. npm minor/patch updates and action updates are grouped to reduce unnecessary PR churn; major npm updates remain individually reviewable.
