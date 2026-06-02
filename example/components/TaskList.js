import { tag, mount, effect } from "../../src/index.js";
import { TaskItem } from "./TaskItem.js";

/**
 * TaskList — renders a reactive list of TaskItem components.
 *
 * Props:
 *   tasks  {signal}  signal([{ id, text, done }])
 *
 * Emits:
 *   "toggle"  → { id, done }  (bubbled from TaskItem)
 *   "remove"  → id            (bubbled from TaskItem)
 */
export function TaskList(props, ctx) {
  let listEl;
  const mounted = [];

  ctx.onMount(() => {
    const stopEffect = effect(() => {
      mounted.forEach(i => i.destroy());
      mounted.length = 0;
      listEl.elt.innerHTML = "";

      const all = props.tasks.val;

      if (!all.length) {
        const p = document.createElement("p");
        p.className = "empty";
        p.textContent = "No tasks yet — add one above.";
        listEl.elt.appendChild(p);
        return;
      }

      all.forEach(task => {
        const item = mount(TaskItem, listEl.elt, {
          id:   task.id,
          text: task.text,
          done: task.done,
        });
        item.on("toggle", data => ctx.emit("toggle", data));
        item.on("remove", id   => ctx.emit("remove", id));
        mounted.push(item);
      });
    });

    return [stopEffect, () => mounted.forEach(i => i.destroy())];
  });

  return tag("div").css("task-list").child(
    tag("h2").text("Tasks"),
    tag("ul").ref(el => (listEl = el)),
  );
}
