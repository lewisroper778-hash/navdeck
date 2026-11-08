import { SignUp } from "@clerk/react";
import { AuthShell } from "@/pages/SignInPage";

export default function SignUpPage() {
  return (
    <AuthShell mode="up">
      <SignUp routing="path" path="/sign-up" signInUrl="/sign-in" />
    </AuthShell>
  );
}
