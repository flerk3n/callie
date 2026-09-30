import { timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { conversations } from "@/db/schema";

export async function getAgentConversation(request: Request) {
  const expectedSecret = process.env.ELEVENLABS_WEBHOOK_SECRET;
  const suppliedSecret = request.headers.get("x-callie-webhook-secret");
  const elevenConversationId = request.headers.get("x-eleven-conversation-id");

  if (!expectedSecret || !suppliedSecret || !elevenConversationId) return null;
  const expected = Buffer.from(expectedSecret);
  const supplied = Buffer.from(suppliedSecret);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;

  const db = getDb();
  return db.query.conversations.findFirst({
    where: (conversation, { eq: equals }) => equals(conversation.elevenConversationId, elevenConversationId),
  });
}

export async function requireAgentConversation(request: Request) {
  const conversation = await getAgentConversation(request);
  if (!conversation) {
    return { error: NextResponse.json({ error: "Unauthorized agent tool call" }, { status: 401 }) } as const;
  }
  return { conversation } as const;
}

export async function markConversationStatus(conversationId: string, status: typeof conversations.$inferInsert.status, draft?: unknown) {
  const db = getDb();
  await db
    .update(conversations)
    .set({
      status: status ?? "collecting",
      ...(draft ? { schedulingDraft: draft } : {}),
      ...(status === "complete" ? { completedAt: new Date() } : {}),
    })
    .where(eq(conversations.id, conversationId));
}
