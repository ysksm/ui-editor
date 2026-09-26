import {
  analyzeExpression,
  collectBindings,
  createScope,
  evaluateTemplate,
  suggest,
  unknownNames,
  type BindingSite,
  type Scope,
} from "@ui-editor/runtime";
import type { Project } from "@ui-editor/schema";
import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { initialState, sampleLocals } from "./sample-scope";

/** バインディング式の試し書き（候補表示つき）と、プロジェクト内の式の一覧。 */
export function BindingView({ project }: { project: Project }) {
  const sites = useMemo(() => collectBindings(project), [project]);
  const [site, setSite] = useState<BindingSite | undefined>();
  const [template, setTemplate] = useState(
    "{{ data.alarms.filter(a => !a.acknowledged).length }} 件の未確認アラーム",
  );
  const [localsText, setLocalsText] = useState(() =>
    JSON.stringify(sampleLocals(project, undefined), null, 2),
  );

  const locals = useMemo(() => {
    try {
      return { value: JSON.parse(localsText) as Record<string, unknown> };
    } catch {
      return { error: "JSON として読めません" };
    }
  }, [localsText]);

  const scope: Scope = createScope({
    data: project.sampleData,
    state: initialState(project),
    locals: locals.value,
  });
  const result = evaluateTemplate(template, scope);

  const pick = (s: BindingSite) => {
    setSite(s);
    setTemplate(`{{ ${s.expression} }}`);
    setLocalsText(JSON.stringify(sampleLocals(project, s), null, 2));
  };

  return (
    <div className="split">
      <section className="main">
        <h3>式を試す</h3>
        <p className="muted small">
          <code>{"{{ 式 }}"}</code> を含む文字列を評価する。<kbd>Ctrl</kbd>+<kbd>Space</kbd> または{" "}
          <code>.</code> で候補を表示、<kbd>↑</kbd>
          <kbd>↓</kbd> で選び <kbd>Tab</kbd> / <kbd>Enter</kbd> で確定。
        </p>
        <TemplateInput value={template} onChange={setTemplate} scope={scope} />
        <div className="result">
          <div className="muted small">結果（{typeLabel(result.value)}）</div>
          <pre className="code">{formatResult(result.value)}</pre>
          {result.errors.map((e, i) => (
            <div key={i} className="error-text">
              <code>{e.expression}</code>: {e.error}
            </div>
          ))}
        </div>
        <h3>スコープ</h3>
        <p className="muted small">
          <code>data</code>（サンプルデータ）と <code>state</code>（初期値）は自動で入る。
          それ以外の名前（<code>params</code> / <code>props</code> / <code>event</code> /
          ループ変数など）を JSON で指定する。
          {site && (
            <>
              {" "}
              選んだ式の場所で使える名前: <code>{site.names.join(", ")}</code>
            </>
          )}
        </p>
        <textarea
          className={locals.error ? "source small-source invalid" : "source small-source"}
          spellCheck={false}
          value={localsText}
          onChange={(e) => setLocalsText(e.target.value)}
        />
        {locals.error && <div className="error-text">{locals.error}</div>}
      </section>
      <aside className="sidebar wide">
        <h3>プロジェクト内の式（{sites.length}）</h3>
        <ul className="list">
          {sites.map((s, i) => {
            const problem =
              analyzeExpression(s.expression).error ??
              unknownNames(s.expression, s.names).join(", ");
            return (
              <li key={i}>
                <button
                  className={s === site ? "list-item column active" : "list-item column"}
                  onClick={() => pick(s)}
                  title={problem ? `${problem}` : undefined}
                >
                  <span className="muted small">{s.location}</span>
                  <code className={problem ? "error-text" : undefined}>{s.expression}</code>
                  {problem && (
                    <span className="error-text small">{problem ? `✗ ${problem}` : ""}</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </aside>
    </div>
  );
}

/** 候補表示つきの入力欄。 */
function TemplateInput(props: { value: string; onChange: (v: string) => void; scope: Scope }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [caret, setCaret] = useState(props.value.length);

  // カーソルが {{ }} の中にあるときだけ候補を出す
  const before = props.value.slice(0, caret);
  const openAt = before.lastIndexOf("{{");
  const inBinding = openAt !== -1 && before.lastIndexOf("}}") < openAt;
  const result = open && inBinding ? suggest(before.slice(openAt + 2), props.scope) : undefined;
  const items = result?.items.slice(0, 12) ?? [];

  const accept = (label: string) => {
    if (!result) return;
    const from = openAt + 2 + result.from;
    const next = props.value.slice(0, from) + label + props.value.slice(caret);
    props.onChange(next);
    setOpen(false);
    requestAnimationFrame(() => {
      const pos = from + label.length;
      ref.current?.setSelectionRange(pos, pos);
      setCaret(pos);
    });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === " " && e.ctrlKey) {
      e.preventDefault();
      setOpen(true);
      setActive(0);
      return;
    }
    if (items.length === 0) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length);
    } else if (e.key === "Tab" || e.key === "Enter") {
      e.preventDefault();
      accept(items[Math.min(active, items.length - 1)]!.label);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div className="suggest-wrap">
      <textarea
        ref={ref}
        className="source template-input"
        spellCheck={false}
        value={props.value}
        onChange={(e) => {
          props.onChange(e.target.value);
          setCaret(e.target.selectionStart);
          // 識別子や . を打っている間は候補を出し続ける
          const typed = e.target.value.slice(0, e.target.selectionStart);
          setOpen(/[\w$.]$/.test(typed));
          setActive(0);
        }}
        onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
        onKeyDown={onKeyDown}
        onBlur={() => setOpen(false)}
      />
      {items.length > 0 && (
        <ul className="suggestions">
          {items.map((s, i) => (
            <li
              key={s.label}
              className={i === active ? "active" : undefined}
              onMouseDown={(e) => {
                e.preventDefault();
                accept(s.label);
              }}
            >
              <span className={`kind ${s.kind}`}>
                {{ name: "名", field: "項", method: "関" }[s.kind]}
              </span>
              <code>{s.label}</code>
              <span className="muted small">{s.detail}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function typeLabel(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return `配列 ${value.length} 件`;
  return typeof value;
}

function formatResult(value: unknown): string {
  if (value === undefined) return "undefined";
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}
