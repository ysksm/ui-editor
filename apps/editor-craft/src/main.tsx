import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { loadExampleProject } from "./project/example";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App initialProject={loadExampleProject()} />
  </StrictMode>,
);
