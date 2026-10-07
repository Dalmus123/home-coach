#!/usr/bin/env python3
"""Inline style.css and the JS files into a single self-contained dist/index.html."""
import pathlib, re
root = pathlib.Path(__file__).parent
html = (root / "index.html").read_text()
css = (root / "style.css").read_text()
html = html.replace('<link rel="stylesheet" href="style.css">', "<style>\n" + css + "</style>")
def inline(m):
    js = (root / m.group(1)).read_text()
    assert "</script" not in js.lower()
    return "<script>\n" + js + "</script>"
html = re.sub(r'<script src="([\w.]+)"></script>', inline, html)
assert 'src="' not in html and 'href="style' not in html
(root / "dist").mkdir(exist_ok=True)
(root / "dist" / "index.html").write_text(html)
print("wrote dist/index.html", len(html), "bytes")
