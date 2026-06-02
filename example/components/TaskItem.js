import { tag, signal } from "../../src/index.js";

/**
 * TaskItem — a single task row with a checkbox and delete button.
 *
 * Props:
 *   id   {number}
 *   text {string}
 *   done {boolean}
 *
 * Emits:
 *   "toggle"  → { id, done }
 *   "remove"  → id
 */
export function TaskItem(props, ctx) {
  const done = signal(props.done ?? false);

  const toggle = () => {
    done.val = !done.val;
    ctx.emit("toggle", { id: props.id, done: done.val });
  };

  return tag("li").css("task-item").child(
    tag("input").attr("type", "checkbox").prop("checked", done).on("change", toggle),
    tag("span").css("label").text(props.text).classIf("done", done),
    tag("button").css("del").text("×").on("click", () => ctx.emit("remove", props.id)),
  );
}
