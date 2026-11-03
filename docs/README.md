# Docs

## Feature commit catalog (PDF)

[`Synth-Feature-Commits.pdf`](./Synth-Feature-Commits.pdf) lists feature-oriented commits on `main`, grouped by product area (newsletter, admin, SEO, feed, chat, etc.). Bugfix-only and version-bump commits are omitted.

Regenerate after new releases:

```bash
python3 scripts/generate-feature-commits-pdf.py
```

Requires `fpdf2` (`pip install fpdf2`).
