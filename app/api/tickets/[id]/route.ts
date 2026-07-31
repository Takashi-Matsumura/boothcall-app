import { NextResponse, type NextRequest } from "next/server";
import { applyAction, deleteTicket, getSnapshot } from "@/lib/store";
import type { TicketAction } from "@/lib/types";

export const dynamic = "force-dynamic";

const VALID_ACTIONS: readonly TicketAction[] = [
  "call",
  "complete",
  "skip",
  "revert",
];

type RouteParams = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const action = body?.action as TicketAction | undefined;

  if (!action || !VALID_ACTIONS.includes(action)) {
    return NextResponse.json(
      { error: "action must be one of: " + VALID_ACTIONS.join(", ") },
      { status: 400 },
    );
  }

  const ticket = applyAction(id, action);
  if (!ticket) {
    return NextResponse.json(
      { error: "ticket not found or invalid transition" },
      { status: 409 },
    );
  }

  return NextResponse.json({ ticket, snapshot: getSnapshot() });
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const deleted = deleteTicket(id);

  if (!deleted) {
    return NextResponse.json({ error: "ticket not found" }, { status: 404 });
  }

  return NextResponse.json({ snapshot: getSnapshot() });
}
