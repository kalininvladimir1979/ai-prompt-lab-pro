export function comparePromptLines(baseline = "", candidate = "") {
  const before = String(baseline).split("\n");
  const after = String(candidate).split("\n");
  const rows = [];
  let left = 0;
  let right = 0;
  while (left < before.length || right < after.length) {
    if (before[left] === after[right]) { rows.push({ type: "same", value: before[left] || " " }); left += 1; right += 1; }
    else if (left < before.length && right < after.length && !before.slice(left + 1).includes(after[right]) && !after.slice(right + 1).includes(before[left])) {
      rows.push({ type: "removed", value: before[left] }); rows.push({ type: "added", value: after[right] }); left += 1; right += 1;
    }
    else if (right < after.length && !before.slice(left).includes(after[right])) { rows.push({ type: "added", value: after[right] }); right += 1; }
    else if (left < before.length && !after.slice(right).includes(before[left])) { rows.push({ type: "removed", value: before[left] }); left += 1; }
    else { rows.push({ type: "removed", value: before[left] }); rows.push({ type: "added", value: after[right] }); left += 1; right += 1; }
  }
  return { rows, added: rows.filter((row) => row.type === "added").length, removed: rows.filter((row) => row.type === "removed").length };
}
