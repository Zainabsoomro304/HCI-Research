"""`hci report`: one index page linking the latest reports."""

from __future__ import annotations

import html

from hci.config import ANALYSIS_DIR
from hci.io import Export


def build_index(export: Export | None = None):
    root = ANALYSIS_DIR / "output"
    root.mkdir(parents=True, exist_ok=True)
    tag = export.sha256[:8] if export else None
    rows = []
    for kind in ("phase2", "phase3", "power"):
        runs = [
            p
            for p in root.iterdir()
            if p.is_dir() and kind in p.name and (kind == "power" or tag is None or tag in p.name)
        ]
        runs.sort(key=lambda p: p.stat().st_mtime, reverse=True)
        for run in runs[:1]:
            for report in run.glob("*report.html"):
                rows.append((kind, run.name, f"{run.name}/{report.name}"))
    synthetic = any("SYNTHETIC" in name for _, name, _ in rows)
    title = "SYNTHETIC - Study reports" if synthetic else "Study reports"
    banner = (
        '<p style="background:#fff3cd;padding:.6rem;font-weight:600">Includes reports built from SYNTHETIC data: not real participants.</p>'
        if synthetic
        else ""
    )
    links = "".join(
        f'<li><a href="{html.escape(link)}">{html.escape(kind)}: {html.escape(name)}</a></li>'
        for kind, name, link in rows
    )
    path = root / ("SYNTHETIC_index.html" if synthetic else "index.html")
    path.write_text(
        f'<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>{title}</title></head><body style="font-family:system-ui;max-width:50rem;margin:2rem auto"><h1>{title}</h1>{banner}<ul>{links}</ul></body></html>\n',
        encoding="utf-8",
    )
    return path
