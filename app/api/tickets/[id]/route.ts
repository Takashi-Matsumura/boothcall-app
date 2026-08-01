import { NextResponse, type NextRequest } from "next/server";
import { applyAction, deleteTicket, getSnapshot } from "@/lib/store";
import type { ActionFailureReason, TicketAction } from "@/lib/types";

export const dynamic = "force-dynamic";

const VALID_ACTIONS: readonly TicketAction[] = [
  "call",
  "complete",
  "skip",
  "revert",
  "meishi-on",
  "meishi-off",
];

const STATUS_BY_REASON: Record<ActionFailureReason, number> = {
  not_found: 404,
  invalid_transition: 409,
  meishi_required: 409,
  card_reissued: 409,
};

const MESSAGE_BY_REASON: Record<ActionFailureReason, string> = {
  not_found: "ticket not found",
  invalid_transition: "invalid transition for current status",
  meishi_required: "cannot complete: business card not received",
  card_reissued: "cannot revert: card is already bound to another active ticket",
};

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

  const result = applyAction(id, action);
  if (!result.ok) {
    return NextResponse.json(
      {
        error: MESSAGE_BY_REASON[result.reason],
        reason: result.reason,
        ticket: result.ticket ?? null,
      },
      { status: STATUS_BY_REASON[result.reason] },
    );
  }

  return NextResponse.json({ ticket: result.ticket, snapshot: getSnapshot() });
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const deleted = deleteTicket(id);

  if (!deleted) {
    return NextResponse.json({ error: "ticket not found" }, { status: 404 });
  }

  return NextResponse.json({ snapshot: getSnapshot() });
}
