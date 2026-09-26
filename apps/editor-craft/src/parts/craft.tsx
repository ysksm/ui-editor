import { useNode, type UserComponent } from "@craftjs/core";
import { BUILTIN_NODE_TYPES, type BuiltinNodeType } from "@ui-editor/schema";
import { useContext, type ReactNode } from "react";
import {
  INSTANCE,
  isContainerType,
  type InstanceFields,
  type NodeFields,
} from "../project/convert";
import { BuiltinView, cx, InstanceView, isHidden, repeatScope, ScopeContext, toCss } from "./view";

/**
 * Craft.js の resolver に登録するコンポーネント。
 * 見た目は view.tsx に任せ、ここでは Craft との接続（選択・ドラッグ）とエディタ用の目印だけを足す。
 */

function useCraftChrome(fields: NodeFields) {
  const {
    connectors: { connect, drag },
    selected,
    hovered,
  } = useNode((n) => ({ selected: n.events.selected, hovered: n.events.hovered }));
  const parentScope = useContext(ScopeContext);
  const { scope, count } = repeatScope(fields.repeat, parentScope);
  const className = cx(
    "craft-node",
    selected && "is-selected",
    hovered && !selected && "is-hovered",
    isHidden(fields.visible, scope) && "is-invisible",
  );
  const ref = (el: HTMLElement | null) => {
    if (el) connect(drag(el));
  };
  const badges = [
    count !== undefined && `×${count}`,
    fields.repeat && `repeat: ${fields.repeat.as}`,
    fields.visible !== undefined && "visible",
    fields.events && `on: ${Object.keys(fields.events).join(",")}`,
  ].filter((b): b is string => typeof b === "string");
  return { scope, className, ref, badges, selected };
}

function Badges({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <span className="craft-badges" aria-hidden>
      {items.map((b) => (
        <span key={b}>{b}</span>
      ))}
    </span>
  );
}

function makeBuiltin(type: BuiltinNodeType): UserComponent<NodeFields & { children?: ReactNode }> {
  const Part: UserComponent<NodeFields & { children?: ReactNode }> = (fields) => {
    const { scope, className, ref, badges } = useCraftChrome(fields);
    const container = isContainerType(type);
    const empty = container && !hasChildren(fields.children);
    return (
      <ScopeContext.Provider value={scope}>
        <BuiltinView
          type={type}
          props={fields.props}
          style={toCss(fields.style, scope)}
          scope={scope}
          className={cx(className, container && "craft-container", empty && "is-empty")}
          ref={ref}
        >
          {container ? (
            <>
              {fields.children}
              <Badges items={badges} />
            </>
          ) : undefined}
        </BuiltinView>
      </ScopeContext.Provider>
    );
  };
  Part.craft = { displayName: type, isCanvas: isContainerType(type) };
  return Part;
}

function hasChildren(children: ReactNode): boolean {
  if (children === undefined || children === null || children === false) return false;
  return !(Array.isArray(children) && children.length === 0);
}

export const ComponentInstance: UserComponent<InstanceFields> = (fields) => {
  const { scope, className, ref, badges } = useCraftChrome(fields);
  return (
    <div ref={ref} className={cx(className, "craft-instance")} style={toCss(fields.style, scope)}>
      <InstanceView component={fields.component} props={fields.props} scope={scope} />
      <Badges items={[fields.component, ...badges]} />
    </div>
  );
};
ComponentInstance.craft = { displayName: INSTANCE };

export const resolver: Record<string, UserComponent> = {
  ...Object.fromEntries(BUILTIN_NODE_TYPES.map((t) => [t, makeBuiltin(t)])),
  [INSTANCE]: ComponentInstance,
};
