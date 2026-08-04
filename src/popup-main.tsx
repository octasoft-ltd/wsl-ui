import React from "react";
import ReactDOM from "react-dom/client";
import { PopupHost } from "./components/PopupHost";
import { QuickActionsPopup, type QuickActionsPopupData } from "./components/QuickActionsPopup";
import { ThemeProvider } from "./themes";
import "./i18n";
import "./index.css";

const popupContentRegistry = {
  "quick-actions": (popupData: QuickActionsPopupData, requestAction: (actionId: string, payload?: unknown) => void) => (
    <QuickActionsPopup {...popupData} onAction={requestAction} />
  ),
};

ReactDOM.createRoot(document.getElementById("popup-root") as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider>
      <PopupHost<QuickActionsPopupData>
        popupType="quick-actions"
        transparentSurface
      >
        {popupContentRegistry["quick-actions"]}
      </PopupHost>
    </ThemeProvider>
  </React.StrictMode>
);
