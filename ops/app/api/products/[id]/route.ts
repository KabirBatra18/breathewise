import { NextResponse } from "next/server";
import { fetchProductForLine } from "@/app/(app)/quotes/actions";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const data = await fetchProductForLine(params.id);
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(data);
}
