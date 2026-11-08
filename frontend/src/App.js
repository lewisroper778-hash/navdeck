import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Show } from "@clerk/react";
import { Toaster } from "sonner";
import ClerkAuthProvider from "@/components/auth/ClerkAuthProvider";
import SignInPage from "@/pages/SignInPage";
import SignUpPage from "@/pages/SignUpPage";
import DashboardPage from "@/pages/DashboardPage";
import FlightDetailPage from "@/pages/FlightDetailPage";
import SettingsPage from "@/pages/SettingsPage";

function Protected({ children }) {
  return (
    <>
      <Show when="signed-in">{children}</Show>
      <Show when="signed-out">
        <Navigate to="/sign-in" replace />
      </Show>
    </>
  );
}

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <ClerkAuthProvider>
          <Toaster position="top-right" richColors />
          <Routes>
            <Route path="/sign-in/*" element={<SignInPage />} />
            <Route path="/sign-up/*" element={<SignUpPage />} />
            <Route
              path="/"
              element={
                <Protected>
                  <DashboardPage />
                </Protected>
              }
            />
            <Route
              path="/flights/:id"
              element={
                <Protected>
                  <FlightDetailPage />
                </Protected>
              }
            />
            <Route
              path="/settings"
              element={
                <Protected>
                  <SettingsPage />
                </Protected>
              }
            />
          </Routes>
        </ClerkAuthProvider>
      </BrowserRouter>
    </div>
  );
}

export default App;
