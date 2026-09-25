---
title: trading-agent
blurb: Cost-aware trading research harness and paper-trading runner for a $100 Alpaca ETF account, where no model has yet earned promotion over the baseline.
year: 2026
order: 16
featured: false
status: not yet public
stack: [Python, pandas, LightGBM, TabPFN, Chronos-2, Kronos, Alpaca, Zerodha Kite]
tags: [quant, ml, swe]
stats: ["14 models, 2 markets", "0 promoted to live", "44 tests"]
bullets:
  - "Built a cost-aware evaluation harness (purged walk-forward, CPCV, Deflated Sharpe, PBO, random-portfolio null) and ran 14 models, from vol-targeted baselines to LightGBM, CatBoost and TabPFN meta-labelling and the Chronos-2 and Kronos foundation models, on 8 US ETFs over 2011 to 2024."
  - "No candidate beat the vol-targeted equal-weight baseline after costs (best 0.68 Sharpe against 0.81), so none was promoted; zero-shot Kronos called 5-day direction right 46.6% of the time on US ETFs."
  - "Shipped the execution path anyway: Alpaca and Zerodha Kite adapters, a $100 paper account on a launchd schedule, drawdown throttle, persistent kill switch, deterministic client order IDs, and four separate gates before real money."
resume_bullets:
  - "Cost-aware evaluation harness (purged walk-forward, CPCV, Deflated Sharpe, PBO, random-portfolio null) over 14 models on 8 US ETFs, 2011 to 2024."
  - "No candidate beat vol-targeted equal weight after costs (best 0.68 Sharpe vs 0.81), so none was promoted; zero-shot Kronos called 5-day direction right 46.6%."
  - "Execution path shipped regardless: Alpaca and Zerodha Kite adapters, a $100 paper account on launchd, drawdown throttle, kill switch, four gates before real money."
---

I built this to answer one question before any money moves: which of the models the literature recommends still work on liquid US ETFs after retail costs. The answer so far is none of them, and the repo is built so that result cannot be tuned away.

The harness decides at the close and executes at the next open, runs a purged walk-forward with quarterly refits and a 5-day embargo, adds CPCV paths, a Deflated Sharpe computed over every trial ever recorded, the probability of backtest overfitting, and a random-portfolio placebo with the same exposure and switching rate. It simulates the $100 account itself: $10 minimum order, fractional shares, full spread and fees. Data from 2025 onward is an untouched holdout. Fourteen entrants ran on 8 ETFs over 2011 to 2024: buy-and-hold, equal weight, vol-targeted equal weight, trend, a jump-model regime switch, LightGBM, CatBoost and TabPFN meta-labelling on triple-barrier labels, Chronos-2 and Kronos as standalone signals, and an ensemble.

Vol-targeted equal weight scored a net Sharpe of 0.81. The best candidate, the regime switch, scored 0.68 and beat the baseline in 0 of 5 segments. The meta-labelled models turn the book over 16 to 19 times a year and drop from roughly 0.5 to 0.6 gross Sharpe to about 0.3 net. Chronos-2 called the 5-day direction right 51% of the time, below the 56% from always predicting up. Kronos, which reports a profitable CSI300 backtest in its own paper, hit 46.6% zero-shot and 47.4% after fine-tuning on the same ETFs. The probability of backtest overfitting across all 14 trials was 0.06, so the baselines win in and out of sample alike. The same harness on 5 NSE ETFs came closer: the regime switch reached 1.08 against 0.93 and won 3 of 5 segments, but its Deflated Sharpe was 0.81 and random portfolios with the same exposure reached 1.11 at their 95th percentile, so it stays on a watch list.

The execution side runs regardless, with the unpromoted baseline. Since 2026-09-24 it has paper traded on Alpaca under launchd: long-only, at most 35% per ETF, 10% target volatility, exposure halved at a 5% drawdown, a kill switch at a 10% drawdown or a 3% daily loss that stays tripped until reset by hand, and deterministic client order IDs so a re-run cannot double-submit. Real money needs four things at once: live keys, a config flag, a promoted model and a command-line flag, plus at least three months of paper results inside the backtest's range. A Zerodha Kite adapter and a systemd kit for a static-IP server cover the Indian side, which has only run in dry-run mode so far. The code is local, with 44 tests and no public repo yet.
