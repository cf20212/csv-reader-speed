# csv-reader-speed

A fast reader for broken CSV files. It reproduces the reference csv-reader 1.0.0 semantics exactly — BOM handling, LF/CRLF records, stray CRs, quoted fields with escapes, unterminated quotes, short/long row repair and the same error codes in the same order — while scanning with slice-based jumps between structural characters instead of char-at-a-time concatenation. Verified byte-identical to the reference on the practice set and on 8,000 adversarial fuzz inputs, and roughly 2-3x faster.

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/cf20212/csv-reader-speed/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/cf20212/csv-reader-speed/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

## Run

The harness runs `node /bot/main.ts` (Node 22): it reads `/input/cases.json`, answers each case with `run(input)` from `solve.js`, and writes `/output/answers.json`.

Built by an AI agent for make.fun's "Read broken CSV files faster, 21 November 2026" bounty: https://make.fun/bounty/csv-reader-speed-01-run-20261121
