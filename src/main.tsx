import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "@/App";
import { APP_NAME, APP_TAGLINE } from "@/config/brand";
import "@/index.css";

/**
 * Identity is applied to the document at runtime from brand config, so the
 * title and description a browser sees always match the shipped product. The
 * static <title> in index.html is only the pre-hydration placeholder.
 */
function applyDocumentIdentity(): void {
  document.title = APP_NAME;

  let description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
  if (description === null) {
    description = document.createElement("meta");
    description.name = "description";
    document.head.appendChild(description);
  }
  description.content = APP_TAGLINE;
}

applyDocumentIdentity();

const container = document.getElementById("root");
if (container === null) {
  throw new Error("Root container #root is missing from index.html");
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
