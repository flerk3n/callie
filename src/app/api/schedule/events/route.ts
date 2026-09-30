import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { CalendarConflictError, createConfirmedEvent, createEventSchema } from "@/calendar/service";

const requestSchema = createEventSchema.extend({ confirmed: z.literal(true) });

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "A confirmed, valid event is required.", details: parsed.error.flatten() }, { status: 400 });

  try {
    const event = await createConfirmedEvent(session.user.id, parsed.data);
    return NextResponse.json({ event }, { status: 201 });
  } catch (error) {
    if (error instanceof CalendarConflictError) return NextResponse.json({ error: error.message }, { status: 409 });
    console.error("schedule.event_create_failed", error);
    return NextResponse.json({ error: "Unable to create the Calendar event." }, { status: 502 });
  }
}
