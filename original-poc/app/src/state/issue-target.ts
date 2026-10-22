import type { Issue, Project } from "@ui-editor/poc-model";
import type { Selection, ViewId } from "./store";

/** 検証の問題の場所（path）から、開くビューと選ぶものを決める。 */
export function issueTarget(
  project: Project,
  issue: Pick<Issue, "path">,
): { view: ViewId; selection: Selection } | undefined {
  const [head, a, b, c] = issue.path;
  if (head === "entities" && typeof a === "number") {
    const entity = project.entities[a];
    if (!entity) return { view: "er", selection: null };
    const field = b === "fields" && typeof c === "number" ? entity.fields[c]?.id : undefined;
    return { view: "er", selection: { kind: "entity", id: entity.id, field } };
  }
  if (head === "data" && typeof a === "string") {
    return { view: "data", selection: { kind: "data", entity: a } };
  }
  if ((head === "screens" || head === "dialogs") && typeof a === "number") {
    const container = (head === "screens" ? project.screens : project.dialogs)[a];
    return { view: "flow", selection: container ? { kind: "container", id: container.id } : null };
  }
  if (head === "layout") {
    return { view: a === "er" ? "er" : "flow", selection: null };
  }
  if (head === "entry") return { view: "flow", selection: null };
  return undefined;
}
