import { useEditor } from "@craftjs/core";
import { useEffect, useReducer, type PointerEvent as ReactPointerEvent } from "react";
import type { NodeFields } from "../project/convert";
import { updateStyle } from "./StylePanel";

type Edge = "right" | "bottom" | "corner";

/**
 * 選択中のノードの右端・下端・右下に出すリサイズハンドル。
 * ドラッグすると style の width / height を px で書き換える。
 * `container`（位置の基準になるスクロール領域）の中に絶対配置で重ねる。
 */
export function ResizeHandles({ container }: { container: HTMLElement | null }) {
  const { selectedId, dom, actions } = useEditor((state) => {
    const id = [...state.events.selected][0];
    const node = id ? state.nodes[id] : undefined;
    // style が変わるたびに描き直すため、props も購読する
    return { selectedId: id, dom: node?.dom ?? null, props: node?.data.props };
  });
  const [, rerender] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    if (!container) return;
    const observer =
      typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(rerender);
    observer?.observe(container);
    if (dom) observer?.observe(dom);
    container.addEventListener("scroll", rerender);
    return () => {
      observer?.disconnect();
      container.removeEventListener("scroll", rerender);
    };
  }, [container, dom]);

  if (!selectedId || !dom || !container || !dom.isConnected) return null;
  const box = dom.getBoundingClientRect();
  const origin = container.getBoundingClientRect();
  const left = box.left - origin.left + container.scrollLeft;
  const top = box.top - origin.top + container.scrollTop;

  const start = (edge: Edge) => (e: ReactPointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = box.width;
    const startH = box.height;
    const move = (ev: PointerEvent) => {
      const width = Math.max(8, Math.round(startW + ev.clientX - startX));
      const height = Math.max(8, Math.round(startH + ev.clientY - startY));
      actions.history.throttle(500).setProp(selectedId, (f: NodeFields) => {
        if (edge !== "bottom") f.style = updateStyle(f.style, "width", width);
        if (edge !== "right") f.style = updateStyle(f.style, "height", height);
      });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div className="resize-box" style={{ left, top, width: box.width, height: box.height }}>
      <div
        className="resize-handle resize-handle--right"
        title="幅"
        onPointerDown={start("right")}
      />
      <div
        className="resize-handle resize-handle--bottom"
        title="高さ"
        onPointerDown={start("bottom")}
      />
      <div
        className="resize-handle resize-handle--corner"
        title="幅と高さ"
        onPointerDown={start("corner")}
      />
    </div>
  );
}
