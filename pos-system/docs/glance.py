"""Rebuilds CHECKLIST.md's summary table from the checkboxes themselves.

Hand-maintained, the table drifted until it claimed the whole receipts feature
was unbuilt. Counted from the boxes, it cannot.
"""
import pathlib, re

p = pathlib.Path("pos-system/docs/CHECKLIST.md")
lines = p.read_text().split("\n")

MARK = re.compile(r"^\s*- \[(.)\]\[(.)\]")
SECTION = re.compile(r"^## ([A-R]) · ([^—]+?)\s*—")

sections, current = [], None
for line in lines:
    head = SECTION.match(line)
    if head:
        current = {"key": head.group(1), "name": head.group(2).strip(), "items": []}
        sections.append(current)
        continue
    box = MARK.match(line)
    if box and current is not None:
        current["items"].append((box.group(1), box.group(2)))

def tally(marks):
    """Reads one column of boxes into the words the table uses."""
    counts = {}
    for mark in marks:
        word = {"x": "done", "~": "partial", " ": "open", "-": "deferred", "·": "n/a"}.get(mark, "open")
        counts[word] = counts.get(word, 0) + 1
    order = ["done", "partial", "open", "deferred", "n/a"]
    return ", ".join(f"{counts[word]} {word}" for word in order if word in counts) or "—"

rows = ["| Feature | Items | Frontend | Backend |", "|---|---:|---:|---:|"]
total = complete = 0
for section in sections:
    front = [item[0] for item in section["items"]]
    back = [item[1] for item in section["items"]]
    rows.append(f"| {section['key']} · {section['name']} | {len(section['items'])} "
                f"| {tally(front)} | {tally(back)} |")
    total += len(section["items"])
    complete += sum(1 for f, b in section["items"] if f in "x·" and b in "x·")

rows.append("")
rows.append(f"**{total} items · {complete} complete** — both halves done, or done on the half that "
            f"exists. Counted from the boxes below by `docs/glance.py`, not maintained by hand: the "
            f"table drifted far enough at one point to claim the whole receipts feature was unbuilt.")

start = next(i for i, line in enumerate(lines) if line.startswith("## Progress at a glance"))
end = next(i for i in range(start + 1, len(lines)) if lines[i].startswith("### Where the backend stands"))

body = lines[start + 1:end]
first_table = next(i for i, line in enumerate(body) if line.startswith("| Feature"))
last = max(i for i, line in enumerate(body) if line.strip().startswith("|") or line.strip().startswith("**"))

new = lines[:start + 1] + body[:first_table] + rows + [""] + lines[end:]
p.write_text("\n".join(new))
print(f"{total} items, {complete} complete")
