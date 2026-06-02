import { mount, signal, tag } from "../../src/index.js";
import { AddTask  } from "../components/AddTask.js";
import { TaskList } from "../components/TaskList.js";
import { Stats    } from "../components/Stats.js";
import { EventLog } from "../components/EventLog.js";

/**
 * TodoPage — composes all todo components, owns shared state, and wires events.
 *
 * Mount it on any target:
 *   mount(TodoPage, '#app');
 */
export function TodoPage(props, ctx) {
  // ── Shared state ──────────────────────────────────────────────────────────
  let nextId  = 1;
  const tasks    = signal([]);
  const logLines = signal([]);

  const pushLog = msg => {
    logLines.val = [msg, ...logLines.val].slice(0, 30);
  };

  // ── Layout slot refs ──────────────────────────────────────────────────────
  let addSlot, statsSlot, listSlot, logSlot;

  // ── Mount children + wire events after layout is in the DOM ──────────────
  ctx.onMount(inst => {
    const addInst  = mount(AddTask,   addSlot.elt);
    const listInst = mount(TaskList,  listSlot.elt,  { tasks });
    const statsInst = mount(Stats,    statsSlot.elt, { tasks });
    const logInst  = mount(EventLog,  logSlot.elt,   { lines: logLines });

    addInst.on("add", text => {
      tasks.val = [...tasks.val, { id: nextId++, text, done: false }];
      pushLog(`add    "${text}"`);
    });

    listInst.on("toggle", ({ id, done }) => {
      tasks.val = tasks.val.map(t => t.id === id ? { ...t, done } : t);
      pushLog(`toggle #${id} → ${done ? "✓ done" : "open"}`);
    });

    listInst.on("remove", id => {
      tasks.val = tasks.val.filter(t => t.id !== id);
      pushLog(`remove #${id}`);
    });

    ctx.onCleanup(() => [addInst, listInst, statsInst, logInst].forEach(i => i.destroy()));
  });

  // ── Layout ────────────────────────────────────────────────────────────────
  return tag("div").css("page").child(
    tag("h1").text("Task Board"),
    tag("div").ref(el => (addSlot   = el)),
    tag("div").ref(el => (statsSlot = el)),
    tag("div").ref(el => (listSlot  = el)),
    tag("div").ref(el => (logSlot   = el)),
  );
}
