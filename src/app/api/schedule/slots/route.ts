import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getBusyIntervals } from "@/calendar/service";
import { findAvailableSlots, getSearchBoundaries } from "@/scheduler/availability";
import { slotSearchSchema } from "@/scheduler/types";

const requestSchema = slotSearchSchema.omit({ busyIntervals: true });

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid scheduling request", details: parsed.error.flatten() }, { status: 400 });

  try {
    const boundaries = getSearchBoundaries(parsed.data);
    const busyIntervals = await getBusyIntervals(session.user.id, boundaries.start, boundaries.end);
    const slots = findAvailableSlots(slotSearchSchema.parse({ ...parsed.data, busyIntervals }));
    return NextResponse.json({ slots, boundaries });
  } catch (error) {
    console.error("schedule.slots_failed", error);
    return NextResponse.json({ error: "Unable to check Calendar availability." }, { status: 502 });
  }
}
