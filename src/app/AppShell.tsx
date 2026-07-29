import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import InspectedConditionsPage from "@features/inspectedConditions/pages/InspectedConditionsPage";
import IndicatorsPage from "@features/indicators/pages/IndicatorsPage";
import { BASENAME } from "@config/envMerge";
import { ToastHost } from "@core/toast";

export default function AppShell() {
  return (
    <BrowserRouter basename={BASENAME}>
      <Routes>
        <Route path="/" element={<IndicatorsPage />} />
        <Route path="/indicators" element={<Navigate to="/" replace />} />
        <Route path="/inspectedConditions" element={<InspectedConditionsPage />} />
      </Routes>
      {/* Floating notifications, above all routes */}
      <ToastHost />
    </BrowserRouter>
  );
}