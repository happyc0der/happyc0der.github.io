"""Bridge between the portfolio demo page and the repo's `ledger` package.

Written for the demo; it is not part of happyc0der/ledger. Everything that decides anything
(field rules, the quote verifier, the consistency checks, the scorer, the evaluator and the
forecast roll-up) is the repo's code, imported unchanged. This file loads the recorded
2026-10-17 run, calls those functions and shapes JSON for the page. No model is called:
ledger/llm.py is replaced by a stub that raises.
"""
from __future__ import annotations

import copy
import json
import os

os.environ.setdefault("LEDGER_DATA", "/home/pyodide/data/company_nicrron")

from ledger import claims, evaluate, forecast, score_issues  # noqa: E402
from ledger.config import SETTINGS, SNAPSHOT  # noqa: E402
from ledger.consistency import checks_for as semantic_checks, compare, cross_deal  # noqa: E402
from ledger.data import load_company  # noqa: E402
from ledger.rules import Issue, checks_for as rule_checks, run_rules  # noqa: E402
from ledger.tools import deal_amount, list_price  # noqa: E402

S: dict = {}
SLOT_NAMES = [k for k in claims.SLOTS if k != "_hints"]
DERIVED = {"last_buyer_promise_date"}  # verify() takes this date from the activity holding the quote


def _j(x) -> str:
    return json.dumps(x, default=str)


def _issue(d: dict) -> Issue:
    return Issue(**{k: v for k, v in d.items() if k in Issue.__dataclass_fields__})


def _num(x):
    try:
        return None if x is None or (isinstance(x, float) and x != x) else float(x)
    except (TypeError, ValueError):
        return None


def _date(x):
    return None if x is None or str(x) in ("NaT", "nan", "") else str(x)[:10]


def _rows(oid: str) -> list[dict]:
    """The deal's activities exactly as the verifier sees them (claims._record: speaker roles resolved, PII tokenised)."""
    cache = S.setdefault("records", {})
    if oid not in cache:
        cache[oid] = claims._record(S["co"], oid)[1]
    return cache[oid]


# ---------------------------------------------------------------- start-up, in steps so the page can paint between them

def step_load() -> str:
    co = load_company()
    S["co"] = co
    S["ids"] = list(co.deals.opportunity_id)
    S["v3"] = {r["opportunity_id"]: r for r in evaluate.load_rows("v3")}
    S["naive"] = evaluate.load_rows("naive")
    lab = score_issues.load_labels()
    planted: dict[str, list] = {}
    for r in lab.itertuples():
        planted.setdefault(r.opportunity_id, []).append({"type": r.type, "detail": r.detail})
    S["planted"] = planted
    return _j({"deals": len(S["ids"]), "activities": len(co.activities), "v3_rows": len(S["v3"]),
               "naive_rows": len(S["naive"]), "planted": len(lab), "planted_deals": len(planted),
               "as_of": str(SNAPSHOT.date())})


def _all_issues(ledgers: dict) -> list[Issue]:
    co = S["co"]
    out = list(S["rules"])
    for oid in S["ids"]:
        if oid in ledgers:
            out += compare(co, oid, ledgers[oid])
    return out + cross_deal(co, ledgers)


def step_recompute() -> str:
    """Rules from the CRM fields, then every recorded claim re-verified against the record,
    then the consistency checks (per deal and across accounts) rebuilt from those claims."""
    co = S["co"]
    S["rules"] = run_rules(co)
    rb: dict = {}
    for i in S["rules"]:
        rb.setdefault(i.opportunity_id, []).append(i)
    S["rules_by"] = rb
    S["submitted"], S["ledgers"], S["day_dropped"] = {}, {}, {}
    kept = newly_dropped = 0
    for oid, r in S["v3"].items():
        recorded = {**r["ledger"], "quotes": dict(r["ledger_quotes"])}
        S["day_dropped"][oid] = list(r["ledger"].get("dropped") or [])
        S["submitted"][oid] = copy.deepcopy(recorded)
        v = claims.verify(copy.deepcopy(recorded), _rows(oid))
        kept += len(v["quotes"])
        newly_dropped += len(v["dropped"])
        S["ledgers"][oid] = v
    S["base_ledgers"] = copy.deepcopy(S["ledgers"])
    S["issues"] = _all_issues(S["ledgers"])
    S["base_keys"] = _keys_by_deal(S["issues"])
    S["edited"] = set()
    rec = {(i["opportunity_id"], i["type"]) for r in S["v3"].values() for i in r["issues"]}
    now = {(i.opportunity_id, i.type) for i in S["issues"]}
    return _j({"quotes_reverified": kept, "newly_dropped": newly_dropped,
               "day_dropped_claims": sum(len(v) for v in S["day_dropped"].values()),
               "day_dropped_deals": sorted(k for k, v in S["day_dropped"].items() if v),
               "recorded_findings": len(rec), "recomputed_findings": len(now),
               "identical": rec == now, "only_recorded": sorted(rec - now), "only_recomputed": sorted(now - rec)})


def _keys_by_deal(issues) -> dict:
    out: dict = {}
    for i in issues:
        out.setdefault(i.opportunity_id, set()).add(i.type)
    return out


def _score(issues, name: str) -> dict:
    s = score_issues.score(issues, S["ids"], name)
    per = {t: {k: v[k] for k in ("tp", "fp", "fn", "precision", "recall")} for t, v in s["per_type"].items()}
    return {"name": name, "findings": s["findings"], "precision": s["precision"], "recall": s["recall"],
            "syntactic": s["syntactic"], "semantic": s["semantic"], "clean_deals": s["clean_deals"],
            "clean_flagged": s["clean_flagged"], "per_type": per}


def step_score() -> str:
    naive = [_issue(i) for r in S["naive"] for i in r.get("issues", [])]
    S["score_rules"] = _score(S["rules"], "rules")
    S["score_naive"] = _score(naive, "naive")
    S["score_v3_day"] = _score(S["issues"], "v3")
    return scoreboard()


def step_evaluate() -> str:
    """evaluate.summarize: every amount, buyer-touch day gap and quote in a run checked against the CRM and the record."""
    out = {}
    for ver in ("v1", "v3"):
        s, _ = evaluate.summarize(S["co"], ver)
        out[ver] = {k: s[k] for k in ("deals", "fabrications", "fab_amount", "fab_gap", "fab_quote", "revenue_top20_pct",
                                      "brier", "pipeline_error_pct", "stated_pipeline", "true_pipeline")}
    S["evaluate"] = out
    return _j(out)


def forecast_now() -> str:
    by: dict = {}
    for i in S["issues"]:
        by.setdefault(i.opportunity_id, []).append({"type": i.type, "key": i.key})
    rows = [{"opportunity_id": oid, "rep": r["rep"], "win_probability": r["win_probability"],
             "amount_usd": r["amount_usd"], "issues": by.get(oid, [])} for oid, r in S["v3"].items()]
    backend = next((r.get("decision_backend") for r in S["v3"].values() if r.get("decision_backend")), "llm")
    fc = forecast.rollup(rows, backend=backend)
    co = S["co"]
    acct = dict(zip(co.deals.opportunity_id, co.deals.account))
    prod = dict(zip(co.deals.opportunity_id, co.deals["product"]))
    ex = sorted(fc["excluded"], key=lambda e: -e["amount"])
    for e in ex:
        e["account"], e["product"] = acct.get(e["opportunity_id"]), prod.get(e["opportunity_id"])
    return _j({"team": fc["team"], "per_rep": fc["per_rep"], "excluded": ex,
               "excluded_amount": sum(e["amount"] for e in ex), "calibration": fc["calibration"],
               "commit_p": fc["commit_p"], "best_case_p": fc["best_case_p"], "edited": len(S["edited"])})


def scoreboard() -> str:
    now = _score(S["issues"], "v3") if S["edited"] else S["score_v3_day"]
    return _j({"rules": S["score_rules"], "naive": S["score_naive"], "v3_day": S["score_v3_day"], "v3_now": now,
               "edited": sorted(S["edited"]), "evaluate": S.get("evaluate")})


# ---------------------------------------------------------------- the deal browser

def deal_list() -> str:
    co = S["co"]
    found = _keys_by_deal(S["issues"])
    out = []
    for d in co.deals.itertuples():
        oid = d.opportunity_id
        planted = {p["type"] for p in S["planted"].get(oid, [])}
        f = found.get(oid, set())
        out.append({"id": oid, "account": d.account, "product": d.product, "stage": d.stage, "rep": d.sales_agent,
                    "amount": deal_amount(co.products, co.deal(oid)), "planted": sorted(planted), "found": sorted(f),
                    "tp": len(f & planted), "fp": len(f - planted), "fn": len(planted - f),
                    "p": S["v3"][oid]["win_probability"], "edited": oid in S["edited"]})
    out.sort(key=lambda x: (x["account"], x["product"], x["id"]))
    return _j(out)


def _receipts(oid: str) -> list[dict]:
    """One receipt per claim slot: what was claimed, the quote, and what the verifier found."""
    sub, ver, rows = S["submitted"][oid], S["ledgers"][oid], _rows(oid)
    quotes = sub.get("quotes") or {}
    out = []
    for slot in SLOT_NAMES:
        claimed = sub.get(slot)
        parent = claims.PARENT.get(slot)
        q = quotes.get(slot) or (quotes.get(parent, "") if parent else "")
        r = {"slot": slot, "claimed": claimed, "kept": ver.get(slot), "quote": q, "parent": parent,
             "options": claims.SLOTS[slot] if isinstance(claims.SLOTS[slot], list) else None}
        if slot in claims.NO_QUOTE_NEEDED:
            r["status"] = "no-quote"
        elif slot in DERIVED:
            r["status"] = "derived" if ver.get(slot) not in claims.NULLISH else "empty"
        elif claimed in claims.NULLISH:
            r["status"] = "empty"
        elif ver.get(slot) in claims.NULLISH:
            r["status"] = "dropped"
            row = claims._find_row(rows, q) if q else None
            if not q:
                r["why"] = "no quote given"
            elif row is None:
                r["why"] = "quote not found verbatim in the record"
            elif claims._admissible(row, q) is None:
                r["why"] = f"found in #{row['n']}, a {row['role']} note by {row['author']}, not the buyer's words"
            elif slot == "decision_date":
                r["why"] = f"date not within 180 days after the message it is quoted from (#{row['n']}, {row['date']})"
            else:
                r["why"] = "dropped by the verifier"
        else:
            r["status"] = "kept"
            kq = ver["quotes"].get(slot) or (ver["quotes"].get(parent, "") if parent else "")
            row = claims._find_row(rows, kq) if kq else None
            if row is not None:
                r.update(row_n=row["n"], row_date=row["date"], role=row["role"], basis=row.get("basis"),
                         grade=(ver.get("grades") or {}).get(slot) or claims._admissible(row, kq))
        out.append(r)
    return out


def _checks(oid: str, issues: list[Issue]) -> list[dict]:
    co = S["co"]
    mine = [i for i in issues if i.opportunity_id == oid]
    rules_here = [i for i in mine if i.type.startswith("S")]
    # all of this deal's semantic issues, cross-deal M7 included, so its check shows fail when it fired
    sem = [i for i in mine if i.type.startswith("M")]
    cs = rule_checks(co, oid, rules_here) + semantic_checks(co, oid, S["ledgers"][oid], sem)
    return [{"type": c.type, "status": c.status, "reason": c.reason} for c in cs]


def deal_detail(oid: str) -> str:
    co = S["co"]
    d = co.deal(oid)
    contacts = co.contacts[co.contacts.opportunity_id == oid][["name", "title", "role"]].to_dict("records")
    mine = [i for i in S["issues"] if i.opportunity_id == oid]
    planted = S["planted"].get(oid, [])
    ptypes = {p["type"] for p in planted}
    v3 = S["v3"][oid]
    return _j({
        "id": oid,
        "crm": {"account": d.account, "product": d["product"], "rep": d.sales_agent, "stage": d.stage,
                "amount": _num(d.amount), "amount_used": deal_amount(co.products, d), "list_price": list_price(co.products, d["product"]),
                "created": _date(d.created_date), "expected_close": _date(d.expected_close),
                "last_activity_date": _date(d.last_activity_date), "next_step": None if str(d.next_step) == "nan" else d.next_step,
                "primary_contact": d.primary_contact},
        "contacts": contacts,
        "record": _rows(oid),
        "receipts": _receipts(oid),
        "issues": [{"type": i.type, "detail": i.detail, "evidence": i.evidence, "action": i.action, "source": i.source,
                    "grade": (i.extra or {}).get("evidence_grade"), "planted": i.type in ptypes} for i in mine],
        "missed": [p for p in planted if p["type"] not in {i.type for i in mine}],
        "planted": planted,
        "checks": _checks(oid, S["issues"]),
        "day": {"win_probability": v3["win_probability"], "objection": v3["objection"], "next_action": v3["next_action"],
                "buyer_quote": v3["buyer_quote"], "rationale": v3["rationale"], "dropped": S["day_dropped"].get(oid, [])},
        "edited": oid in S["edited"],
        "tries": _tries(oid),
    })


# ---------------------------------------------------------------- edits: change a claim, re-run the verifier and the checks

def _coerce(slot: str, v):
    if v in (None, ""):
        return None
    if slot == "units_discussed":
        try:
            return int(float(v))
        except (TypeError, ValueError):
            return v
    if slot == "total_stated_usd":
        try:
            return float(str(v).replace(",", "").replace("$", ""))
        except (TypeError, ValueError):
            return v
    return v


def recheck(oid: str, payload: str) -> str:
    p = json.loads(payload)
    sub = {slot: _coerce(slot, (p.get("slots") or {}).get(slot)) for slot in SLOT_NAMES}
    sub["quotes"] = {k: v for k, v in (p.get("quotes") or {}).items() if v}
    S["submitted"][oid] = copy.deepcopy(sub)
    S["ledgers"][oid] = claims.verify(copy.deepcopy(sub), _rows(oid))
    S["edited"].add(oid)
    return _after_edit(oid)


def reset(oid: str) -> str:
    r = S["v3"][oid]
    S["submitted"][oid] = copy.deepcopy({**r["ledger"], "quotes": dict(r["ledger_quotes"])})
    S["ledgers"][oid] = copy.deepcopy(S["base_ledgers"][oid])
    S["edited"].discard(oid)
    return _after_edit(oid)


def _after_edit(oid: str) -> str:
    S["issues"] = _all_issues(S["ledgers"])
    now = _keys_by_deal(S["issues"])
    others = []
    for k in set(now) | set(S["base_keys"]):
        if k != oid and now.get(k, set()) != S["base_keys"].get(k, set()):
            others.append({"id": k, "added": sorted(now.get(k, set()) - S["base_keys"].get(k, set())),
                           "removed": sorted(S["base_keys"].get(k, set()) - now.get(k, set()))})
    return _j({"detail": json.loads(deal_detail(oid)), "others": others, "score": json.loads(scoreboard())})


def _tries(oid: str) -> list[dict]:
    """Ready-made edits for the "try to fool it" buttons. What happens is decided by the repo's code, not here."""
    sub = S["submitted"][oid]
    base = {"slots": {k: sub.get(k) for k in SLOT_NAMES}, "quotes": dict(sub.get("quotes") or {})}
    rows = _rows(oid)
    out = []

    def edit(**slots_quotes):
        e = copy.deepcopy(base)
        for k, (v, q) in slots_quotes.items():
            e["slots"][k] = v
            if q is not None:
                e["quotes"][k] = q
        return e

    if sub.get("budget_status") != "frozen":
        slot, val, fake = "budget_status", "frozen", "Our budget is frozen until next fiscal year, so this is on hold."
    else:
        slot, val, fake = "commitment", "declined", "We have decided not to go ahead with this purchase."
    out.append({"id": "invent", "label": "Invent a buyer quote",
                "says": f"Claims {slot} = {val}, quoting a sentence nobody wrote: \u201c{fake}\u201d",
                "edit": edit(**{slot: (val, fake)})})
    rep_row = next((r for r in rows if r["role"] == "rep" and len(r["text"]) > 12), None)
    if rep_row:
        out.append({"id": "repwords", "label": "Cite the rep as the buyer",
                    "says": f"Claims commitment = verbal_yes, quoting the rep's own note #{rep_row['n']}.",
                    "edit": edit(commitment=("verbal_yes", rep_row["text"]))})
    buyer_row = next((r for r in rows if r["role"] == "buyer" and len(r["text"]) > 12), None)
    if buyer_row and sub.get("champion_status") != "left_company":
        out.append({"id": "misread", "label": "Real quote, wrong reading",
                    "says": f"Claims the contact left the company, citing the buyer's real message #{buyer_row['n']}.",
                    "edit": edit(champion_status=("left_company", buyer_row["text"]))})
    if sub.get("total_stated_usd") not in (None, "") and sub.get("units_discussed") not in (None, ""):
        t = float(sub["total_stated_usd"])
        out.append({"id": "total", "label": "Change the stated total",
                    "says": f"Claims the buyer's total was ${t * 1.25:,.0f} instead of ${t:,.0f}; the quote stays the same.",
                    "edit": edit(total_stated_usd=(round(t * 1.25), None))})
    return out
