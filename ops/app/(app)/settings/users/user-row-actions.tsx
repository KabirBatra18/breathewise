"use client";

import { useEffect, useState, useTransition } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { toast } from "sonner";
import { KeyRound, Lock, ShieldAlert, Trash2, Unlock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  deleteUserAction,
  emergencyTakeoverAction,
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

function SubmitPrimary({ label, busyLabel }: { label: string; busyLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? busyLabel : label}
    </Button>
  );
}

export function UserRowActions({ user, isSelf }: { user: User; isSelf: boolean }) {
  const [resetOpen, setResetOpen] = useState(false);
  const [takeoverOpen, setTakeoverOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const [resetState, resetForm] = useFormState<ActionResult | null, FormData>(
    resetPasswordAction,
    null,
  );
  const [takeoverState, takeoverForm] = useFormState<ActionResult | null, FormData>(
    emergencyTakeoverAction,
    null,
  );
  const [isToggling, startToggle] = useTransition();
  const [isDeleting, startDelete] = useTransition();

  useEffect(() => {
    if (resetState?.ok) {
      toast.success(`Password reset for ${user.username}.`);
      setResetOpen(false);
    } else if (resetState && !resetState.ok) {
      toast.error(resetState.error);
    }
  }, [resetState, user.username]);

  useEffect(() => {
    if (takeoverState?.ok) {
      toast.success(
        `Takeover complete. ${user.username} is locked out; record the new password somewhere safe.`,
      );
      setTakeoverOpen(false);
    } else if (takeoverState && !takeoverState.ok) {
      toast.error(takeoverState.error);
    }
  }, [takeoverState, user.username]);

  // Owners can never be edited from this row. Other owners must use
  // the DB directly to demote, by design (avoid one-click coups).
  const ownerLock = user.role === "OWNER" && !isSelf;

  return (
    <>
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setResetOpen(true)}
          disabled={ownerLock}
          title={ownerLock ? "Owner accounts can't be edited here" : "Set a new password for this user"}
        >
          <KeyRound className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Reset password</span>
          <span className="sm:hidden">Reset</span>
        </Button>

        <Button
          variant={user.isActive ? "outline" : "secondary"}
          size="sm"
          disabled={isSelf || isToggling || ownerLock}
          title={
            isSelf
              ? "You can't block yourself"
              : ownerLock
                ? "Owner accounts can't be blocked from here"
                : user.isActive
                  ? "Block this user — they cannot log in until you unblock them"
                  : "Unblock this user — they can log in again"
          }
          onClick={() => {
            startToggle(async () => {
              const fd = new FormData();
              fd.set("userId", user.id);
              await toggleActiveAction(fd);
              toast.success(
                user.isActive
                  ? `${user.username} blocked. They can no longer log in.`
                  : `${user.username} unblocked.`,
              );
            });
          }}
        >
          {user.isActive ? (
            <Lock className="h-3.5 w-3.5" />
          ) : (
            <Unlock className="h-3.5 w-3.5" />
          )}
          <span className="hidden sm:inline">
            {user.isActive ? "Block & lock out" : "Unblock"}
          </span>
          <span className="sm:hidden">{user.isActive ? "Block" : "Unblock"}</span>
        </Button>

        {/* Emergency takeover — combined deactivate + reset. Only
            offered for non-self, non-owner accounts. */}
        {!isSelf && !ownerLock ? (
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setTakeoverOpen(true)}
            title="Lock the user out AND set a new password I'll record — for hostile-employee situations"
          >
            <ShieldAlert className="h-3.5 w-3.5" />
            <span className="hidden md:inline">Emergency takeover</span>
            <span className="md:hidden">Takeover</span>
          </Button>
        ) : null}

        {/* Delete — only ever offered for non-self, non-owner. The
            server-side action will refuse if the user has any history. */}
        {!isSelf && !ownerLock ? (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setDeleteOpen(true)}
            aria-label={`Delete ${user.username}`}
            title="Delete this user entirely (only works if they have created nothing)"
            className="text-muted-foreground hover:bg-rose-100 hover:text-rose-700 dark:hover:bg-rose-950/40 dark:hover:text-rose-300"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        ) : null}
      </div>

      {/* ── Reset password dialog ─────────────────────────────── */}
      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset password for {user.username}</DialogTitle>
            <DialogDescription>
              The user&apos;s current password becomes invalid immediately.
              They&apos;ll be required to set a new password of their own
              choosing on next login.
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
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                Visible while you type so you can copy it. Send it to the
                user via a private channel — they&apos;ll change it on
                first login.
              </p>
            </div>
            <DialogFooter>
              <SubmitPrimary label="Set new password" busyLabel="Saving…" />
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Emergency takeover dialog ─────────────────────────── */}
      <Dialog open={takeoverOpen} onOpenChange={setTakeoverOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-rose-600" />
              Emergency takeover — {user.username}
            </DialogTitle>
            <DialogDescription className="space-y-2 pt-2">
              <span className="block">
                For hostile-employee situations. This does THREE things in
                one click:
              </span>
              <ol className="list-decimal space-y-0.5 pl-5 text-xs text-muted-foreground">
                <li>Resets their password to what you type below.</li>
                <li>
                  Locks the account immediately (they can&apos;t log in
                  with any password, including the new one).
                </li>
                <li>
                  Flags it so the next person who logs in is forced to
                  set yet another password — protects you if you ever
                  reactivate them.
                </li>
              </ol>
              <span className="block pt-1">
                <strong>Their work is already visible to you</strong> on
                every page — this is purely about cutting their access.
              </span>
            </DialogDescription>
          </DialogHeader>
          <form action={takeoverForm} className="space-y-4">
            <input type="hidden" name="userId" value={user.id} />
            <div className="space-y-2">
              <Label htmlFor={`takeover-pw-${user.id}`}>
                Set a new password (record it somewhere safe)
              </Label>
              <Input
                id={`takeover-pw-${user.id}`}
                name="newPassword"
                type="text"
                autoComplete="off"
                minLength={6}
                required
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                This is the only time the password will ever be shown
                back. Copy it now — we cannot recover or display it
                later (it&apos;s one-way encrypted in the database).
              </p>
            </div>
            <DialogFooter>
              <SubmitPrimary label="Take over account" busyLabel="Locking…" />
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirm ───────────────────────────────────── */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {user.username}?</AlertDialogTitle>
            <AlertDialogDescription>
              Hard-deletes the user account permanently. This only
              succeeds if {user.username} has <strong>never created
              anything</strong> (no quotes, invoices, clients, or
              payments). If they have, you&apos;ll get an explanatory
              error — use <em>Block &amp; lock out</em> instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeleting}
              onClick={(e) => {
                e.preventDefault();
                startDelete(async () => {
                  const fd = new FormData();
                  fd.set("userId", user.id);
                  const res = await deleteUserAction(fd);
                  if (res.ok) {
                    toast.success(`${user.username} deleted.`);
                    setDeleteOpen(false);
                  } else {
                    toast.error(res.error);
                  }
                });
              }}
              className="bg-rose-600 text-white hover:bg-rose-700"
            >
              {isDeleting ? "Deleting…" : "Delete user"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
