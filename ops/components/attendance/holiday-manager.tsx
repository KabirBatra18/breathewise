"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  declareHolidayAction,
  deleteHolidayAction,
} from "@/app/(app)/attendance/admin/holidays/actions";

interface Holiday {
  id: string;
  date: string;
  name: string;
  note: string | null;
}

export function HolidayManager({
  yearMonth,
  holidays,
}: {
  yearMonth: string;
  holidays: Holiday[];
}) {
  const [pending, startTransition] = useTransition();
  const [showAdd, setShowAdd] = useState(false);
  const [date, setDate] = useState(`${yearMonth}-01`);
  const [name, setName] = useState("");

  function add() {
    if (!name.trim() || !date) {
      toast.error("Date and name required.");
      return;
    }
    const fd = new FormData();
    fd.set("date", date);
    fd.set("name", name);
    startTransition(async () => {
      const res = await declareHolidayAction(fd);
      if (res.ok) {
        toast.success(`${name} added for ${date}.`);
        setShowAdd(false);
        setName("");
      } else {
        toast.error(res.error);
      }
    });
  }

  function remove(id: string, name: string) {
    const fd = new FormData();
    fd.set("id", id);
    startTransition(async () => {
      const res = await deleteHolidayAction(fd);
      if (res.ok) toast.success(`${name} removed.`);
      else toast.error(res.error);
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-3">
        <div>
          <CardTitle className="text-base">Public holidays</CardTitle>
          <CardDescription>
            Declared for this month — auto-credits 1.0 to every employee.
          </CardDescription>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowAdd((o) => !o)}
        >
          <Plus className="h-3.5 w-3.5" />
          {showAdd ? "Cancel" : "Declare"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {showAdd ? (
          <div className="space-y-3 rounded-md border bg-muted/30 p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="holiday-date">Date</Label>
                <Input
                  id="holiday-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="holiday-name">Name</Label>
                <Input
                  id="holiday-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Diwali / Republic Day"
                />
              </div>
            </div>
            <Button onClick={add} disabled={pending} size="sm">
              {pending ? "Declaring…" : "Declare holiday"}
            </Button>
          </div>
        ) : null}
        {holidays.length === 0 ? (
          <p className="rounded-md border-2 border-dashed py-4 text-center text-xs text-muted-foreground">
            No public holidays declared this month.
          </p>
        ) : (
          <div className="space-y-1">
            {holidays.map((h) => (
              <div
                key={h.id}
                className="flex items-center justify-between gap-3 rounded-md border bg-card px-3 py-2 text-sm"
              >
                <div>
                  <p className="font-medium">{h.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(h.date)}
                    {h.note ? ` · ${h.note}` : ""}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => remove(h.id, h.name)}
                  disabled={pending}
                  aria-label="Remove holiday"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(new Date(`${iso}T00:00:00`));
}
