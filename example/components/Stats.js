import { tag, effect } from "../../src/index.js";

/**
 * Stats — shows total / done task counts.
 *
 * Props:
 *   tasks  {signal}  signal([{ id, text, done }])
 *
 * Emits: —
 */
export function Stats(props, ctx) {
  let totalEl, doneEl;

  ctx.onMount(() =>
    effect(() => {
      const all  = props.tasks.val;
      const done = all.filter(t => t.done).length;
      totalEl.elt.textContent = all.length;
      doneEl.elt.textContent  = done;
    }),
  );

  return tag("div").css("stats").child(
    tag("div").css("stat").child(
      tag("div").css("value").text("0").ref(el => (totalEl = el)),
      tag("div").css("caption").text("Total"),
    ),
    tag("div").css("stat").child(
      tag("div").css("value").text("0").ref(el => (doneEl = el)),
      tag("div").css("caption").text("Done"),
    ),
  );
}
