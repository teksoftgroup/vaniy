import { tag, effect } from "../../src/index.js";

/**
 * EventLog — shows a scrollable list of event messages.
 *
 * Props:
 *   lines  {signal}  signal(string[])
 *
 * Emits: —
 */
export function EventLog(props, ctx) {
  let listEl;

  ctx.onMount(() =>
    effect(() => {
      listEl.elt.innerHTML = "";
      props.lines.val.forEach(msg => {
        const li = document.createElement("li");
        li.textContent = msg;
        listEl.elt.appendChild(li);
      });
    }),
  );

  return tag("div").css("event-log").child(
    tag("h2").text("Event log"),
    tag("ul").ref(el => (listEl = el)),
  );
}
