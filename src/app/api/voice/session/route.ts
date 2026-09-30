import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { getDb } from "@/db";
import { conversations } from "@/db/schema";

const tokenResponseSchema = z.object({ token: z.string().min(1), conversation_id: z.string().min(1) });

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in with Google before starting Callie." }, { status: 401 });

  const agentId = process.env.ELEVENLABS_AGENT_ID;
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!agentId || !apiKey) return NextResponse.json({ error: "Voice is not configured yet." }, { status: 503 });

  const url = new URL("https://api.elevenlabs.io/v1/convai/conversation/token");
  url.searchParams.set("agent_id", agentId);
  url.searchParams.set("participant_name", session.user.id);

  const response = await fetch(url, { headers: { "xi-api-key": apiKey }, cache: "no-store" });
  if (!response.ok) {
    console.error("elevenlabs.token_failed", response.status);
    return NextResponse.json({ error: "Unable to start a voice session." }, { status: 502 });
  }

  const payload = tokenResponseSchema.safeParse(await response.json());
  if (!payload.success) return NextResponse.json({ error: "Invalid voice session response." }, { status: 502 });

  const db = getDb();
  const [conversation] = await db
    .insert(conversations)
    .values({ userId: session.user.id, elevenConversationId: payload.data.conversation_id })
    .returning({ id: conversations.id });

  return NextResponse.json({ conversationToken: payload.data.token, conversationId: conversation.id });
}
