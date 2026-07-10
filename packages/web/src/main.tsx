import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { applyThemeMode, loadThemeMode } from "./theme";
import "./styles.css";

// 在 React 掛載前先套用上次選的深淺色,避免載入瞬間閃過另一個主題。
applyThemeMode(loadThemeMode());

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
