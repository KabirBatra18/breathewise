import { requireAuth } from "@/lib/auth/server";
import { ChangePasswordForm } from "./change-password-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata = { title: "Change password" };

export default async function ChangePasswordPage() {
  const user = await requireAuth();

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Change password
        </h1>
        <p className="text-sm text-muted-foreground">
          {user.mustChangePassword
            ? "You must set a fresh password before you can use the rest of the app."
            : "Set a new password for your account."}
        </p>
      </div>

      <Card className="max-w-xl">
        <CardHeader>
          <CardDescription>
            Pick something at least 8 characters that you haven&apos;t used
            for this account before. The current password is required to
            confirm it&apos;s really you.
          </CardDescription>
          <CardTitle>Set a new password</CardTitle>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>
    </div>
  );
}
