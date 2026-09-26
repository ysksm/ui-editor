import type { Component, JsonValue, Node, Style } from "@ui-editor/schema";
import { Handle, Position } from "@xyflow/react";
import type { CSSProperties, ReactNode } from "react";

/**
 * 画面・ダイアログのノードツリーを簡易なワイヤーフレームで描く。
 * バインディングは評価せず、式をそのまま短く表示する。
 */
export interface WireframeProps {
  root: Node;
  components: ReadonlyMap<string, Component>;
  /** 遷移の起点になっているノード id。ここにエッジのハンドルを付ける。 */
  triggerNodeIds: ReadonlySet<string>;
  /** 遷移を新しく引き出せるノード id（編集モード）。 */
  connectableNodeIds?: ReadonlySet<string> | undefined;
  /** 起点のパーツがクリックされたとき（P5-3 のプロトタイプモード用）。 */
  onPartClick?: ((nodeId: string) => void) | undefined;
}

export function Wireframe(props: WireframeProps) {
  return <div className="wf">{renderNode(props.root, props, 0)}</div>;
}

/** コンポーネントの入れ子をたどる深さの上限。 */
const MAX_DEPTH = 4;

function renderNode(node: Node, ctx: WireframeProps, depth: number): ReactNode {
  const isTrigger = ctx.triggerNodeIds.has(node.id);
  const isConnectable = ctx.connectableNodeIds?.has(node.id) ?? false;
  const hasHandle = isTrigger || isConnectable;
  const body = renderBody(node, ctx, depth);
  const badges = [
    node.repeat ? (
      <span key="r" className="wf-badge" title={`repeat: ${node.repeat.each}`}>
        ×n
      </span>
    ) : null,
    typeof node.visible === "string" ? (
      <span key="v" className="wf-badge" title={`visible: ${node.visible}`}>
        if
      </span>
    ) : null,
  ].filter(Boolean);
  if (!hasHandle && badges.length === 0) return body;

  const onClick = isTrigger && ctx.onPartClick ? () => ctx.onPartClick!(node.id) : undefined;
  return (
    <div
      key={node.id}
      className={`wf-part${isTrigger ? " wf-trigger" : ""}${isConnectable ? " wf-connectable" : ""}${onClick ? " wf-clickable" : ""}`}
      style={flexItemStyle(node.style)}
      title={
        isTrigger
          ? `${node.id}（遷移の起点）`
          : isConnectable
            ? `${node.id}（右端の点から画面・ダイアログへ線を引くと遷移を追加）`
            : undefined
      }
      onClick={
        onClick &&
        ((e) => {
          e.stopPropagation();
          onClick();
        })
      }
    >
      {body}
      {badges.length > 0 && <span className="wf-badges">{badges}</span>}
      {hasHandle && (
        <Handle
          type="source"
          id={`part:${node.id}`}
          position={Position.Right}
          className="wf-handle"
          isConnectable={isConnectable}
          isConnectableEnd={false}
        />
      )}
    </div>
  );
}

function renderBody(node: Node, ctx: WireframeProps, depth: number): ReactNode {
  const p = node.props ?? {};
  switch (node.type) {
    case "Box":
      return (
        <div key={node.id} className="wf-box" style={boxStyle(node.style)}>
          {(node.children ?? []).map((c) => renderNode(c, ctx, depth + 1))}
        </div>
      );
    case "Text":
      return (
        <span key={node.id} className={`wf-text wf-text-${str(p.variant) || "body"}`}>
          {short(p.text)}
        </span>
      );
    case "Button":
      return (
        <span key={node.id} className={`wf-button wf-button-${str(p.variant) || "primary"}`}>
          {short(p.label) || "ボタン"}
        </span>
      );
    case "TextInput":
    case "NumberInput":
      return (
        <span key={node.id} className="wf-input">
          <span className="wf-input-label">{short(p.label)}</span>
          <span className="wf-input-box" />
        </span>
      );
    case "Checkbox":
      return (
        <span key={node.id} className="wf-check">
          ☐ {short(p.label)}
        </span>
      );
    case "Table":
      return renderTable(node);
    default: {
      const component = ctx.components.get(node.type);
      return (
        <div key={node.id} className="wf-instance">
          <span className="wf-instance-name">{node.type}</span>
          {component && depth < MAX_DEPTH
            ? renderNode(
                component.root,
                { ...ctx, triggerNodeIds: new Set(), connectableNodeIds: undefined },
                depth + 1,
              )
            : null}
        </div>
      );
    }
  }
}

function renderTable(node: Node): ReactNode {
  const columns = Array.isArray(node.props?.columns) ? node.props.columns : [];
  const headers = columns.map((c) =>
    c !== null && typeof c === "object" && !Array.isArray(c) ? short(c.header) : "",
  );
  return (
    <div
      key={node.id}
      className="wf-table"
      style={{ gridTemplateColumns: `repeat(${headers.length || 1}, 1fr)` }}
    >
      {headers.map((h, i) => (
        <span key={`h${i}`} className="wf-th">
          {h}
        </span>
      ))}
      {[0, 1].flatMap((r) => headers.map((_, i) => <span key={`r${r}-${i}`} className="wf-td" />))}
    </div>
  );
}

function boxStyle(style: Style | undefined): CSSProperties {
  return {
    ...flexItemStyle(style),
    display: style?.display === "flex" || style?.display === "inline-flex" ? "flex" : "block",
    flexDirection: style?.flexDirection,
    flexWrap: style?.flexWrap,
    justifyContent: style?.justifyContent,
    alignItems: style?.alignItems,
    border: style?.border ? "1px solid var(--wf-line)" : undefined,
  };
}

function flexItemStyle(style: Style | undefined): CSSProperties {
  return { flexGrow: style?.flexGrow };
}

function str(v: JsonValue | undefined): string {
  return typeof v === "string" ? v : v === undefined || v === null ? "" : String(v);
}

/** `{{ 式 }}` は短ければ式を、長ければ `{…}` を表示する。 */
function short(v: JsonValue | undefined): string {
  return str(v).replace(/\{\{\s*(.*?)\s*\}\}/g, (_, expr: string) =>
    expr.length <= 18 ? `{${expr}}` : "{…}",
  );
}
