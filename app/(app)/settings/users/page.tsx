import { desc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/db/schema";
import { requireOwner } from "@/lib/auth/server";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { NewUserForm } from "./new-user-form";
import { UserRowActions } from "./user-row-actions";

export const metadata = { title: "Users" };

export default async function UsersPage() {
  const me = await requireOwner();
  const list = await db
    .select()
    .from(users)
    .orderBy(desc(users.createdAt));

  return (
    <div className="space-y-8 p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
        <p className="text-sm text-muted-foreground">
          Add and manage owner / employee / viewer accounts. Owner-only.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add a user</CardTitle>
          <CardDescription>
            Creates an employee or viewer with an initial password. They&apos;ll
            be asked to set a new one on first login.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <NewUserForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All users</CardTitle>
          <CardDescription>{list.length} account{list.length === 1 ? "" : "s"}.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Username</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last login</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-mono text-sm">
                    {u.username}
                    {u.id === me.id ? (
                      <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                    ) : null}
                  </TableCell>
                  <TableCell>{u.fullName}</TableCell>
                  <TableCell>
                    <Badge variant={u.role === "OWNER" ? "default" : "secondary"}>
                      {u.role}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {u.isActive ? (
                      <Badge variant="secondary">Active</Badge>
                    ) : (
                      <Badge variant="destructive">Inactive</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {u.lastLoginAt
                      ? new Intl.DateTimeFormat("en-IN", {
                          day: "numeric",
                          month: "short",
                          hour: "numeric",
                          minute: "2-digit",
                          timeZone: "Asia/Kolkata",
                        }).format(u.lastLoginAt)
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <UserRowActions
                      user={{
                        id: u.id,
                        username: u.username,
                        fullName: u.fullName,
                        role: u.role,
                        isActive: u.isActive,
                      }}
                      isSelf={u.id === me.id}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
