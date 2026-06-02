import { tag } from "../../src/index.js";

/**
 * AddTask — text input + button.
 *
 * Emits:
 *   "add"  → string  (the trimmed task text)
 */
export function AddTask(props, ctx) {
  let inputEl;

  const submit = () => {
    const text = inputEl.elt.value.trim();
    if (!text) return;
    ctx.emit("add", text);
    inputEl.elt.value = "";
    inputEl.elt.focus();
  };

  return tag("div").css("add-task").child(
    tag("input")
      .attr("type", "text")
      .attr("placeholder", "New task…")
      .ref(el => (inputEl = el))
      .on("keydown", e => { if (e.key === "Enter") submit(); }),
    tag("button").text("Add").on("click", submit),
  );
}
