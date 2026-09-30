import { NextResponse } from "next/server";
import { requireAgentConversation } from "@/agent/context";
import { getUsualMeetingForConversation, usualMeetingToolSchema } from "@/agent/tools";

export async function POST(request: Request) {
  const context = await requireAgentConversation(request);
  if ("error" in context) return context.error;
  const parsed = usualMeetingToolSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid usual-meeting request", details: parsed.error.flatten() }, { status: 400 });
  try {
    return NextResponse.json(await getUsualMeetingForConversation(context.conversation.userId, parsed.data));
  } catch (error) {
    console.error("agent.usual_meeting_failed", error);
    return NextResponse.json({ error: "The usual meeting context could not be retrieved." }, { status: 502 });
  }
}
