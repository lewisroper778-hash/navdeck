import "@/App.css";
import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Show, useAuth, useUser } from "@clerk/react";
import { Toaster } from "sonner";
import ClerkAuthProvider from "@/components/auth/ClerkAuthProvider";
import SignInPage from "@/pages/SignInPage";
import SignUpPage from "@/pages/SignUpPage";
import FlightsPage from "@/pages/FlightsPage";
import HomePage from "@/pages/HomePage";
import { ThemeProvider, cache, useTheme } from "@/lib/utils-app";
import ErrorBoundary, { reportError } from "@/components/ErrorBoundary";
import Splash from "@/components/Splash";

const VatsimPage = lazy(() => import("@/pages/VatsimPage"));
const LogbookPage = lazy(() => import("@/pages/LogbookPage"));
const FlightProcessPage = lazy(() => import("@/pages/FlightProcessPage"));
const SimbriefPage = lazy(() => import("@/pages/SimbriefPage"));

function CachedUser({ children }) {
  const { user, isLoaded } = useUser();
  if (!isLoaded || !user) return <Splash />;
  cache.setUser(user.id);
  return children;
}

function ThemedToaster() {
  const { theme } = useTheme();
  return <Toaster position="top-right" richColors theme={theme} />;
}

function Protected({ children }) {
  const { isLoaded } = useAuth();
  useEffect(() => {
    if (isLoaded) return;
    const t = setTimeout(() => reportError("Clerk not loaded after 12s"), 12000);
    return () => clearTimeout(t);
  }, [isLoaded]);
  if (!isLoaded) return <Splash />;
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
    <ErrorBoundary>
    <div className="App">
      <ThemeProvider>
        <BrowserRouter>
          <ClerkAuthProvider>
            <ThemedToaster />
            <Suspense fallback={<Splash />}>
            <Routes>
              <Route path="/sign-in/*" element={<SignInPage />} />
              <Route path="/sign-up/*" element={<SignUpPage />} />
              <Route path="/" element={<Protected><HomePage /></Protected>} />
              <Route path="/flights" element={<Protected><FlightsPage /></Protected>} />
              <Route path="/vatsim" element={<Protected><VatsimPage /></Protected>} />
              <Route path="/logbook" element={<Protected><LogbookPage /></Protected>} />
              <Route path="/flights/:id" element={<Protected><FlightProcessPage /></Protected>} />
              <Route path="/flights/:id/:phase" element={<Protected><FlightProcessPage /></Protected>} />
              <Route path="/settings" element={<Protected><SimbriefPage /></Protected>} />
            </Routes>
            </Suspense>
          </ClerkAuthProvider>
        </BrowserRouter>
      </ThemeProvider>
    </div>
    </ErrorBoundary>
  );
}

export default App;
