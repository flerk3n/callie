import { NextResponse } from "next/server";
import { requireAgentConversation } from "@/agent/context";
import { bookEventForConversation, bookEventToolSchema } from "@/agent/tools";

export async function POST(request: Request) {
  const context = await requireAgentConversation(request);
  if ("error" in context) return context.error;
  const parsed = bookEventToolSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid booking request", details: parsed.error.flatten() }, { status: 400 });
  try {
    return NextResponse.json(await bookEventForConversation(context.conversation.userId, context.conversation.id, parsed.data));
  } catch (error) {
    console.error("agent.book_event_failed", error);
    return NextResponse.json({ error: "The event could not be booked." }, { status: 502 });
  }
}
