"use client";

import { useEffect, useState, useTransition } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { toast } from "sonner";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  resetPasswordAction,
  toggleActiveAction,
  type ActionResult,
} from "./actions";

type User = {
  id: string;
  username: string;
  fullName: string;
  role: string;
  isActive: boolean;
};

function ResetPasswordSubmit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : "Set new password"}
    </Button>
  );
}

export function UserRowActions({ user, isSelf }: { user: User; isSelf: boolean }) {
  const [resetOpen, setResetOpen] = useState(false);
  const [resetState, resetForm] = useFormState<ActionResult | null, FormData>(
    resetPasswordAction,
    null,
  );
  const [isToggling, startToggle] = useTransition();

  useEffect(() => {
    if (resetState?.ok) {
      toast.success(`Password reset for ${user.username}.`);
      setResetOpen(false);
    } else if (resetState && !resetState.ok) {
      toast.error(resetState.error);
    }
  }, [resetState, user.username]);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon-sm" />}
          aria-label={`Actions for ${user.username}`}
        >
          <MoreHorizontal className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setResetOpen(true)}>
            Reset password
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={isSelf || isToggling}
            onSelect={() => {
              startToggle(async () => {
                const fd = new FormData();
                fd.set("userId", user.id);
                await toggleActiveAction(fd);
                toast.success(
                  user.isActive
                    ? `${user.username} deactivated.`
                    : `${user.username} reactivated.`,
                );
              });
            }}
          >
            {user.isActive ? "Deactivate" : "Reactivate"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset password for {user.username}</DialogTitle>
            <DialogDescription>
              They&apos;ll be required to choose a new password on next login.
            </DialogDescription>
          </DialogHeader>
          <form action={resetForm} className="space-y-4">
            <input type="hidden" name="userId" value={user.id} />
            <div className="space-y-2">
              <Label htmlFor={`pw-${user.id}`}>New password</Label>
              <Input
                id={`pw-${user.id}`}
                name="password"
                type="text"
                autoComplete="off"
                minLength={6}
                required
              />
            </div>
            <DialogFooter>
              <ResetPasswordSubmit />
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
