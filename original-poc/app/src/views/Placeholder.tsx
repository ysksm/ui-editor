import type { ReactNode } from "react";

export function Placeholder({
  title,
  note,
  children,
}: {
  title: string;
  note: string;
  children?: ReactNode;
}) {
  return (
    <div className="placeholder">
      <h2>{title}</h2>
      <p className="muted">{note}</p>
      {children}
    </div>
  );
}
