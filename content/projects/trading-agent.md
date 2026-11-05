---
title: trading-agent
blurb: Cost-aware trading research harness and paper-trading runner on Alpaca and Interactive Brokers, where no model has been promoted to live trading.
year: 2026
order: 16
featured: false
status: not public
stack: [Python, pandas, LightGBM, TabPFN, Chronos-2, Kronos, Alpaca, Interactive Brokers, Zerodha Kite]
tags: [quant, ml, swe]
stats: ["14 US and 13 NSE models", "0 promoted to live", "136 tests"]
bullets:
  - "Built a cost-aware evaluation harness (purged walk-forward, CPCV, Deflated Sharpe, PBO, random-portfolio null) and ran 14 models, from vol-targeted baselines to LightGBM, CatBoost and TabPFN meta-labeling and the Chronos-2 and Kronos foundation models, on 8 US ETFs over 2011 to 2024."
  - "No candidate in that run beat the vol-targeted equal-weight baseline after costs (best 0.68 Sharpe against 0.81), so none was promoted; zero-shot Kronos called 5-day direction right 46.6% of the time on US ETFs, and its sampled paths, tested later as a regime signal, earned no higher average daily return than the plain 200-day trend rule on SPY, QQQ or Bitcoin."
  - "Shipped the execution path anyway: Alpaca, Interactive Brokers (through IB Gateway) and Zerodha Kite adapters, two paper accounts on a launchd schedule, simulated shadow accounts forward-testing unpromoted models, a decision journal, drawdown throttle, persistent kill switch, deterministic client order IDs, and four separate gates before real money."
resume_bullets:
  - "Built a cost-aware backtester (purged walk-forward, CPCV, Deflated Sharpe, probability of backtest overfitting, random-portfolio null); ran 14 models on 8 US ETFs."
  - "Rejected every first-round candidate, from LightGBM to Kronos: none beat volatility-targeted equal weight after costs (best Sharpe 0.68 vs 0.81)."
  - "Wrote a paper-trading runner with risk controls for Alpaca and Interactive Brokers: drawdown throttle, kill switch, four gates before real money."
---

I built this to answer one question before any money moves: which of the models the literature recommends still work on liquid US ETFs after retail costs. On the original 8 ETFs the answer so far is none of them, and the repo is built so that result cannot be tuned away.

The harness decides at the close and executes at the next open, runs a purged walk-forward with quarterly refits and a 5-day embargo, adds CPCV paths, a Deflated Sharpe computed over every trial ever recorded, the probability of backtest overfitting, and a random-portfolio placebo with the same exposure and switching rate. It simulates the $100 account planned for live trading: $10 minimum order, fractional shares, full spread and fees. Data from 2025 onward is an untouched holdout. Fourteen entrants ran on 8 ETFs over 2011 to 2024: four baselines, a jump-model regime switch, LightGBM, CatBoost and TabPFN meta-labeling on triple-barrier labels, Chronos-2 and Kronos as standalone signals, and an ensemble.

Vol-targeted equal weight scored a net Sharpe of 0.81. The best candidate, the regime switch, scored 0.68 and beat the baseline in 0 of 5 segments. The meta-labeled models turn the book over 16 to 19 times a year and drop from roughly 0.5 to 0.6 gross Sharpe to about 0.3 net. Chronos-2 called the 5-day direction right 51% of the time, below the 56% from always predicting up. Kronos, which reports a profitable CSI300 backtest in its own paper, hit 46.6% zero-shot and 47.4% after fine-tuning on the same ETFs. The probability of backtest overfitting across all 14 trials was 0.06, so the baselines win in and out of sample alike; with later trials on the same ETFs it reached 0.57 at 52. The same harness with 13 models on 5 NSE ETFs came closer: the regime switch reached 1.08 against 0.93 and won 3 of 5 segments, but matched random portfolios reached 1.11 at their 95th percentile, so it stays on a watch list.

On stock and bond ETFs, later tests found more growth than SPY only with leverage: the 200-day trend rule over six ETFs that include 2x funds made 11.9% a year against 11.6% from mid-2008 through 2024, with a 19% maximum drawdown against 48%, though random timing of the same funds earns a similar Sharpe. Rule-based lines on universes with Bitcoin pass the promotion rule against SPY, but those universes were chosen knowing Bitcoin's history, so they run only in shadow accounts. Rules built on sampled Kronos paths earned no higher average daily return than the plain 200-day trend rule over the full windows on SPY, QQQ or Bitcoin; the few higher Sharpes came mostly from holding less.

The execution side runs regardless, with rules that were not promoted. Alpaca paper trading began on 2026-09-24 with the vol-targeted baseline and a persistent kill switch at a 10% drawdown or a 3% daily loss. An Interactive Brokers paper account joined through IB Gateway on 2026-10-19, trading that six-ETF trend rule plus a pilot sleeve of micro futures, and the Alpaca account moved to the same rule on 2026-10-29, both with the kill switch widened to a 35% drawdown or an 8% daily loss. Nothing is cleared for real money, which needs four things at once: a live account, a config flag, a promoted model and a command-line flag.

Simulated shadow accounts forward-test unpromoted models on live Alpaca data with no orders sent, and a decision journal scores what each model predicted once the horizon has passed. A Zerodha Kite adapter covers the Indian side, which has only run in dry-run mode so far. The repo is private, with 136 offline tests that CI runs on each push to main.
