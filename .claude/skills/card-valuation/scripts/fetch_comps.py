#!/usr/bin/env python3
"""Fetch sold comparables for a single card.

This is the deterministic core of the valuation skill. It reads
config/pricing-sources.json to decide which sources to query, how to weight
them, and how recent a sale must be to count. Run it from SKILL.md rather than
reimplementing comp-gathering inline, so that behavior stays driven by the
config file.

Network fetching is stubbed here (the lesson example ships without live
credentials); the structure mirrors the production integration.
"""

import argparse
import json
import os
from datetime import datetime, timedelta, timezone

CONFIG_PATH = os.path.join(os.path.dirname(__file__), "..", "config", "pricing-sources.json")


def load_config(path=CONFIG_PATH):
    with open(path) as f:
        return json.load(f)


def query_source(source, card, recency_cutoff):
    """Query one source for sold comps newer than recency_cutoff.

    In production this dispatches on source['type'] (csv_bulk, live_api,
    scrape). Here it returns an empty list so the script runs end-to-end
    without network access.
    """
    # dispatch = {"csv_bulk": _load_csv, "live_api": _call_api, "scrape": _scrape}
    # return dispatch[source["type"]](source, card, recency_cutoff)
    return []


def fetch_comps(card):
    config = load_config()
    cutoff = datetime.now(timezone.utc) - timedelta(days=config["recency_window_days"])

    comps = []
    for source in config["sources"]:
        if not source.get("enabled"):
            continue
        results = query_source(source, card, cutoff)
        for r in results:
            r["source"] = source["id"]
            r["weight"] = source["weight"]
        comps.extend(results)

    return {
        "card": card,
        "recency_window_days": config["recency_window_days"],
        "comp_count": len(comps),
        "comps": comps,
    }


def main():
    p = argparse.ArgumentParser(description="Fetch sold comps for a card.")
    p.add_argument("--subject", required=True)
    p.add_argument("--set", required=True)
    p.add_argument("--number", required=True)
    p.add_argument("--variant", default="base")
    args = p.parse_args()

    card = {
        "subject": args.subject,
        "set": args.set,
        "number": args.number,
        "variant": args.variant,
    }
    print(json.dumps(fetch_comps(card), indent=2))


if __name__ == "__main__":
    main()
