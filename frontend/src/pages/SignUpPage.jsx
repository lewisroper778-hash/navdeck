import { SignUp } from "@clerk/react";
import { useLocation } from "react-router-dom";
import { AuthShell } from "@/pages/SignInPage";

export default function SignUpPage() {
  const { search } = useLocation();
  const desktop = new URLSearchParams(search).get("desktop") === "1";
  return (
    <AuthShell mode="up">
      <SignUp routing="path" path="/sign-up"
        signInUrl={desktop ? "/sign-in?desktop=1" : "/sign-in"}
        forceRedirectUrl={desktop ? "/desktop/connect" : undefined} />
    </AuthShell>
  );
}
