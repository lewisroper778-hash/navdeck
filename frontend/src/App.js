import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Show, useUser } from "@clerk/react";
import { Toaster } from "sonner";
import ClerkAuthProvider from "@/components/auth/ClerkAuthProvider";
import SignInPage from "@/pages/SignInPage";
import SignUpPage from "@/pages/SignUpPage";
import FlightsPage from "@/pages/FlightsPage";
import FlightProcessPage from "@/pages/FlightProcessPage";
import SimbriefPage from "@/pages/SimbriefPage";
import { ThemeProvider, cache, useTheme } from "@/lib/utils-app";

function CachedUser({ children }) {
  const { user, isLoaded } = useUser();
  if (!isLoaded || !user) return null;
  cache.setUser(user.id);
  return children;
}

function ThemedToaster() {
  const { theme } = useTheme();
  return <Toaster position="top-right" richColors theme={theme} />;
}

function Protected({ children }) {
  return (
    <>
      <Show when="signed-in"><CachedUser>{children}</CachedUser></Show>
      <Show when="signed-out">
        <Navigate to="/sign-in" replace />
      </Show>
    </>
  );
}

function App() {
  return (
    <div className="App">
      <ThemeProvider>
        <BrowserRouter>
          <ClerkAuthProvider>
            <ThemedToaster />
            <Routes>
              <Route path="/sign-in/*" element={<SignInPage />} />
              <Route path="/sign-up/*" element={<SignUpPage />} />
              <Route path="/" element={<Protected><FlightsPage /></Protected>} />
              <Route path="/flights/:id" element={<Protected><FlightProcessPage /></Protected>} />
              <Route path="/flights/:id/:phase" element={<Protected><FlightProcessPage /></Protected>} />
              <Route path="/settings" element={<Protected><SimbriefPage /></Protected>} />
            </Routes>
          </ClerkAuthProvider>
        </BrowserRouter>
      </ThemeProvider>
    </div>
  );
}

export default App;
