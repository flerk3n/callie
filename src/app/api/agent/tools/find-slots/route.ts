import { NextResponse } from "next/server";
import { requireAgentConversation } from "@/agent/context";
import { findSlotsForConversation, findSlotsToolSchema, RelativeSchedulingError } from "@/agent/tools";

export async function POST(request: Request) {
  const context = await requireAgentConversation(request);
  if ("error" in context) return context.error;
  const parsed = findSlotsToolSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid slot-search request", details: parsed.error.flatten() }, { status: 400 });
  try {
    return NextResponse.json(await findSlotsForConversation(context.conversation.userId, context.conversation.id, parsed.data));
  } catch (error) {
    if (error instanceof RelativeSchedulingError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("agent.find_slots_failed", error);
    return NextResponse.json({ error: "Calendar availability could not be checked." }, { status: 502 });
  }
}
