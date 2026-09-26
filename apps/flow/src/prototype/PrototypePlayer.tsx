import type { Project } from "@ui-editor/schema";
import { useMemo, useState } from "react";
import { Wireframe } from "../nodes/Wireframe";
import {
  activeOwner,
  enterScreen,
  hotspotsOf,
  initialState,
  runActions,
  type LogEntry,
  type PlayerState,
} from "./player";

/**
 * プロトタイプモード。画面を簡易描画し、ホットスポット（遷移の起点パーツ）をクリックすると
 * 次の画面・ダイアログに移る。
 */
export function PrototypePlayer({
  project,
  startId,
  onExit,
}: {
  project: Project;
  startId: string | undefined;
  onExit: (currentId: string) => void;
}) {
  const components = useMemo(
    () => new Map((project.components ?? []).map((c) => [c.id, c])),
    [project],
  );
  const owners = useMemo(
    () =>
      new Map(
        [...project.screens, ...(project.dialogs ?? [])].map((o) => [
          o.id,
          { owner: o, hotspots: hotspotsOf(project, o.root) },
        ]),
      ),
    [project],
  );
  const [start] = useState(() => {
    const s = initialState(project, startId);
    return { state: s, log: enterScreen(project, s).log };
  });
  const [state, setState] = useState<PlayerState>(start.state);
  const [history, setHistory] = useState<PlayerState[]>([]);
  const [log, setLog] = useState<LogEntry[]>(start.log);
  const [showHotspots, setShowHotspots] = useState(false);
  const [missFlash, setMissFlash] = useState(0);

  const active = activeOwner(state);
  const screen = project.screens.find((sc) => sc.id === state.screenId);

  const onPartClick = (nodeId: string) => {
    const hotspot = owners.get(active.id)?.hotspots.get(nodeId);
    if (!hotspot) return;
    const r = runActions(project, state, hotspot.actions);
    setHistory((h) => [...h, state]);
    setState(r.state);
    setLog((l) => [
      ...l,
      { text: `▶ ${active.id} / ${nodeId} の ${hotspot.event}`, skipped: false },
      ...r.log,
    ]);
  };

  const back = () => {
    const prev = history.at(-1);
    if (!prev) return;
    setHistory((h) => h.slice(0, -1));
    setState(prev);
    setLog((l) => [...l, { text: "◀ 戻る", skipped: false }]);
  };

  const restart = () => {
    setHistory([]);
    setState(start.state);
    setLog(start.log);
  };

  /** ホットスポット以外をクリックしたら、クリックできる場所を一瞬光らせる（Figma と同じ） */
  const onMiss = () => setMissFlash((n) => n + 1);

  const render = (id: string, isActive: boolean) => {
    const o = owners.get(id);
    if (!o) return <p className="proto-missing">「{id}」がありません</p>;
    return (
      <Wireframe
        root={o.owner.root}
        components={components}
        hotspotNodeIds={isActive ? new Set(o.hotspots.keys()) : undefined}
        onPartClick={isActive ? onPartClick : undefined}
      />
    );
  };

  return (
    <div className="proto">
      <div className="proto-bar">
        <button type="button" className="toolbar-button" onClick={() => onExit(active.id)}>
          ← 遷移図に戻る
        </button>
        <button type="button" className="toolbar-button" onClick={back} disabled={!history.length}>
          戻る
        </button>
        <button type="button" className="toolbar-button" onClick={restart}>
          最初から
        </button>
        <label className="proto-toggle">
          <input
            type="checkbox"
            checked={showHotspots}
            onChange={(e) => setShowHotspots(e.target.checked)}
          />
          クリックできる場所を表示
        </label>
        <span className="proto-where">
          {screen ? `${screen.name}（${screen.path}）` : state.screenId}
          {state.dialog && ` › ${owners.get(state.dialog)?.owner.name ?? state.dialog}`}
        </span>
      </div>
      <div className="proto-body">
        <div
          key={missFlash}
          className={`proto-stage${showHotspots ? " show-hotspots" : ""}${missFlash ? " flash" : ""}`}
          onClick={onMiss}
        >
          <div className="proto-screen">{render(state.screenId, !state.dialog)}</div>
          {state.dialog && (
            <div className="proto-backdrop">
              <div className="proto-dialog">{render(state.dialog, true)}</div>
            </div>
          )}
        </div>
        <ol className="proto-log">
          {log.map((l, i) => (
            <li key={i} className={l.skipped ? "skipped" : undefined}>
              {l.text}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
