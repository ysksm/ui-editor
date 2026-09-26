import { useEditor } from "@craftjs/core";
import type { Action, Events } from "@ui-editor/schema";
import { useState } from "react";
import type { NodeFields } from "../project/convert";
import { useWorkspace } from "./workspace";

const EVENT_NAMES = ["click", "change", "rowClick"];

function describe(action: Action): string {
  switch (action.type) {
    case "navigate":
      return `画面遷移 → ${action.to}`;
    case "openDialog":
      return `ダイアログ → ${action.dialog}`;
    case "closeDialog":
      return "ダイアログを閉じる";
    case "setState":
      return `setState ${action.path}`;
    case "updateData":
      return `updateData ${action.collection}`;
  }
}

/**
 * よく使うアクション（画面遷移・ダイアログを開く/閉じる）を GUI で付ける。
 * params や setState / updateData は「詳細（JSON）」の events で編集する。
 */
export function EventsEditor({ nodeId }: { nodeId: string }) {
  const { project } = useWorkspace();
  const { events, actions } = useEditor((state) => ({
    events: (state.nodes[nodeId]?.data.props as NodeFields | undefined)?.events,
  }));
  const [event, setEvent] = useState("click");
  const [type, setType] = useState<"navigate" | "openDialog" | "closeDialog">("openDialog");
  const [target, setTarget] = useState("");

  const setEvents = (update: (e: Events) => void) =>
    actions.setProp(nodeId, (f: NodeFields) => {
      // f は immer の draft なので structuredClone できない
      const next = JSON.parse(JSON.stringify(f.events ?? {})) as Events;
      update(next);
      for (const [k, list] of Object.entries(next)) if (list.length === 0) delete next[k];
      f.events = Object.keys(next).length > 0 ? next : undefined;
    });

  const targets =
    type === "navigate"
      ? project.screens.map((s) => ({ id: s.id, name: s.name }))
      : type === "openDialog"
        ? (project.dialogs ?? []).map((d) => ({ id: d.id, name: d.name }))
        : [];

  const add = () => {
    const to = target || targets[0]?.id;
    let action: Action;
    if (type === "closeDialog") action = { type };
    else if (!to) return;
    else action = type === "navigate" ? { type, to } : { type, dialog: to };
    setEvents((e) => {
      e[event] = [...(e[event] ?? []), action];
    });
  };

  return (
    <div className="events-editor">
      {Object.entries(events ?? {}).map(([name, list]) =>
        list.map((action, i) => (
          <div className="event-row" key={`${name}-${i}`}>
            <code>{name}</code>
            <span>{describe(action)}</span>
            <button
              type="button"
              aria-label={`${name} の ${i + 1} 番目を削除`}
              onClick={() => setEvents((e) => e[name]?.splice(i, 1))}
            >
              ×
            </button>
          </div>
        )),
      )}
      <div className="event-row event-row--new">
        <select aria-label="イベント" value={event} onChange={(e) => setEvent(e.target.value)}>
          {EVENT_NAMES.map((n) => (
            <option key={n}>{n}</option>
          ))}
        </select>
        <select
          aria-label="アクション"
          value={type}
          onChange={(e) => {
            setType(e.target.value as typeof type);
            setTarget("");
          }}
        >
          <option value="navigate">画面遷移</option>
          <option value="openDialog">ダイアログを開く</option>
          <option value="closeDialog">ダイアログを閉じる</option>
        </select>
        {targets.length > 0 && (
          <select aria-label="行き先" value={target} onChange={(e) => setTarget(e.target.value)}>
            {targets.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        )}
        <button type="button" onClick={add}>
          追加
        </button>
      </div>
    </div>
  );
}
