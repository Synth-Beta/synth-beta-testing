#!/usr/bin/env python3
"""
Build a PDF catalog of feature-oriented commits on main.
Usage: python3 scripts/generate-feature-commits-pdf.py [--output path.pdf]
"""

from __future__ import annotations

import argparse
import re
import subprocess
from collections import defaultdict
from datetime import datetime
from pathlib import Path

from fpdf import FPDF

ROOT = Path(__file__).resolve().parents[1]

SKIP_RE = re.compile(
    r"^("
    r"Fix(ed|ing)?\b|fix\b|"
    r"Merge\b|Revert\b|Clean up\b|Remove temporary|"
    r"\d+\.\d+(\.\d+)?(\s|$)|version\b|Bump\b|"
    r"typo|eslint|lint\b|graphify|"
    r"Fixed some|Fixing the|fix web bug|fixing confirmation|"
    r"Remaining code"
    r")",
    re.I,
)

# Commits that look like fixes but message doesn't start with Fix
SKIP_SUBSTR = (
    "patch files",
    "loader inside the API",
    "without crashing",
    "from scanning",
    "on the indexed columns",
    "name lookup that crashed",
    "Return the newsletter source error",
    "Keep the newsletter loader",
    "Load newsletter listening from the tables",
    "Open proofread on the newest",
    "Fill the newsletter again without repeating",
    "e7d99c44",  # merge noise - not in log no-merges
)

FEATURE_START = re.compile(
    r"^("
    r"Add\b|Ship\b|Introduce|Implement|Launch|Enable|Personalize|Rebuild|Expand|"
    r"Create\b|Build\b|Wire\b|Schedule|Publish|Report\b|Show\b|Bring back|"
    r"First phase|Allow\b|Let\b|Match\b|Steer\b|Open\b|Replace admin|"
    r"Post signup|Post Slack|Calendar page|Community:|Feed v|Web home:|Shared:|"
    r"Making sure new users|Making slgiht|Improving the ui|Expanding the|"
    r"Removed tour tracekr and added|Pick 5|Creating endpoint|"
    r"Lastfm replacing|Add permanent|Remove retired admin|"
    r"Vary each Setlist|Schedule Setlist|"
    r"Keep newsletter news|Keep generic Setlist|Keep both sites|"
    r"Send The Synth Setlist|Week-1 notifications|"
    r"Admin proofread|Changing the mobile tour|"
    r"fixed few bugs and added isolation|"
    r"Restructure\b|Integrate\b|Support\b|New\b|Move\b|Deliver\b|"
    r"Introduce\b|Overhaul\b|Redesign\b|Revamp\b"
    r")",
    re.I,
)

AREA_RULES: list[tuple[str, re.Pattern[str]]] = [
    ("Newsletter & email", re.compile(r"newsletter|setlist|brevo|proofread|edition|digest", re.I)),
    ("Admin & ops", re.compile(r"admin|slack|ingest|hygiene|bug board|proofread tab", re.I)),
    ("SEO & growth", re.compile(r"seo|indexnow|crawler|target page", re.I)),
    ("Feed, home & discovery", re.compile(r"feed|home|discover|weave|pin new shows|just-announced", re.I)),
    ("Community, chat & social", re.compile(r"chat|community|comment|mention|thread|message|review|share", re.I)),
    ("Notifications & push", re.compile(r"notification|push|apns", re.I)),
    ("Pick Five & partners", re.compile(r"pick\s*5|pickfive|partner", re.I)),
    ("Events & JamBase", re.compile(r"jambase|event|calendar page|ticket", re.I)),
    ("Onboarding & auth", re.compile(r"onboard|signup|welcome|confirm|auth|tour", re.I)),
    ("Music & taste", re.compile(r"last\.?fm|spotify|genre|glee|streaming|listen", re.I)),
    ("Mobile app", re.compile(r"mobile|expo|1\.\d+\.\d+", re.I)),
]


def git_log() -> list[tuple[str, str, str]]:
    out = subprocess.check_output(
        ["git", "log", "main", "--no-merges", "--format=%H|%ad|%s", "--date=short"],
        cwd=ROOT,
        text=True,
    )
    rows = []
    for line in out.strip().splitlines():
        parts = line.split("|", 2)
        sha, date, subject = parts[0], parts[1], parts[2]
        rows.append((sha[:8], date, subject))
    return rows


def is_feature(subject: str, sha: str) -> bool:
    if SKIP_RE.search(subject):
        return False
    if any(s in subject for s in SKIP_SUBSTR):
        return False
    if FEATURE_START.search(subject):
        return True
    # Secondary: strong feature nouns without leading Fix
    if re.search(r"\b(new feature|endpoint for|dashboard|webhook|analytics)\b", subject, re.I):
        return True
    if subject.startswith("Add ") or subject.startswith("Ship "):
        return True
    return False


def classify_area(subject: str) -> str:
    for name, pat in AREA_RULES:
        if pat.search(subject):
            return name
    return "Platform & other"


def sanitize(text: str) -> str:
    out = (
        text.replace("\u2014", "-")
        .replace("\u2013", "-")
        .replace("\u2018", "'")
        .replace("\u2019", "'")
        .replace("\u201c", '"')
        .replace("\u201d", '"')
        .replace("\u00b7", "-")
    )
    return out.encode("latin-1", "replace").decode("latin-1")


def describe_feature(subject: str) -> str:
    """One-line expansion for the PDF body (derived from commit subject)."""
    s = subject.strip()
    if s.endswith("."):
        return s
    return s + "."


def build_pdf(rows: list[tuple[str, str, str, str, str]], out_path: Path) -> None:
    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_page()

    pdf.set_font("Helvetica", "B", 20)
    pdf.cell(0, 12, "Synth Beta Testing", ln=True)
    pdf.set_font("Helvetica", "", 11)
    pdf.multi_cell(
        0,
        6,
        "Feature commit catalog (main branch). "
        f"Generated {datetime.now().strftime('%Y-%m-%d %H:%M %Z')}. "
        "Commits selected by message heuristics (Add/Ship/Implement and related); "
        "chore-only fixes and version bumps are omitted.",
    )
    pdf.ln(4)
    pdf.set_font("Helvetica", "B", 12)
    pdf.cell(0, 8, f"Total feature commits: {len(rows)}", ln=True)
    pdf.ln(6)

    by_area: dict[str, list[tuple[str, str, str, str]]] = defaultdict(list)
    for sha, date, subject, area, desc in rows:
        by_area[area].append((sha, date, subject, desc))

    area_order = [a for a, _ in AREA_RULES] + ["Platform & other"]
    seen_areas = set()
    for area in area_order:
        if area not in by_area:
            continue
        seen_areas.add(area)
        items = sorted(by_area[area], key=lambda x: x[1], reverse=True)
        pdf.set_font("Helvetica", "B", 14)
        pdf.set_fill_color(240, 240, 245)
        pdf.cell(0, 10, f"{area} ({len(items)})", ln=True, fill=True)
        pdf.ln(2)
        for sha, date, subject, desc in items:
            if pdf.get_y() > 270:
                pdf.add_page()
            pdf.set_font("Helvetica", "B", 10)
            pdf.multi_cell(0, 5, sanitize(subject))
            pdf.set_font("Helvetica", "", 9)
            pdf.set_text_color(80, 80, 80)
            pdf.cell(0, 4, f"{date}  -  {sha}", ln=True)
            pdf.set_text_color(0, 0, 0)
            pdf.set_font("Helvetica", "", 10)
            pdf.multi_cell(0, 5, sanitize(desc))
            pdf.ln(3)
        pdf.ln(4)

    for area in by_area:
        if area not in seen_areas:
            pdf.add_page()
            pdf.set_font("Helvetica", "B", 14)
            pdf.cell(0, 10, area, ln=True)
            for sha, date, subject, desc in by_area[area]:
                pdf.set_font("Helvetica", "B", 10)
                pdf.multi_cell(0, 5, sanitize(subject))
                pdf.set_font("Helvetica", "", 9)
                pdf.cell(0, 4, f"{date}  -  {sha}", ln=True)
                pdf.set_font("Helvetica", "", 10)
                pdf.multi_cell(0, 5, sanitize(desc))
                pdf.ln(3)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    pdf.output(str(out_path))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--output",
        default=str(ROOT / "docs" / "Synth-Feature-Commits.pdf"),
        help="Output PDF path",
    )
    args = parser.parse_args()

    feature_rows = []
    for sha, date, subject in git_log():
        if not is_feature(subject, sha):
            continue
        area = classify_area(subject)
        desc = describe_feature(subject)
        feature_rows.append((sha, date, subject, area, desc))

    out = Path(args.output)
    build_pdf(feature_rows, out)
    print(f"Wrote {len(feature_rows)} feature commits to {out}")


if __name__ == "__main__":
    main()
