import { NextResponse } from "next/server";
import { requireAgentConversation } from "@/agent/context";
import { findEventsForConversation, findEventToolSchema } from "@/agent/tools";

export async function POST(request: Request) {
  const context = await requireAgentConversation(request);
  if ("error" in context) return context.error;
  const parsed = findEventToolSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid event-search request", details: parsed.error.flatten() }, { status: 400 });
  try {
    return NextResponse.json(await findEventsForConversation(context.conversation.userId, context.conversation.id, parsed.data));
  } catch (error) {
    console.error("agent.find_events_failed", error);
    return NextResponse.json({ error: "Calendar events could not be searched." }, { status: 502 });
  }
}
