import { relations } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

export const conversationStatus = pgEnum("conversation_status", [
  "collecting",
  "searching",
  "offering",
  "awaiting_confirmation",
  "booking",
  "complete",
  "abandoned",
]);

export const bookingStatus = pgEnum("booking_status", [
  "confirmed",
  "conflicted",
  "cancelled",
]);

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
  image: text("image"),
  timezone: text("timezone").default("UTC").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const calendarConnections = pgTable(
  "calendar_connections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    providerAccountId: text("provider_account_id").notNull(),
    calendarEmail: text("calendar_email").notNull(),
    refreshTokenEncrypted: text("refresh_token_encrypted").notNull(),
    scope: text("scope").notNull(),
    selectedCalendarId: text("selected_calendar_id").default("primary").notNull(),
    connectedAt: timestamp("connected_at", { withTimezone: true }).defaultNow().notNull(),
    disconnectedAt: timestamp("disconnected_at", { withTimezone: true }),
  },
  (table) => [
    index("calendar_connections_user_idx").on(table.userId),
  ],
);

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    elevenConversationId: text("eleven_conversation_id").unique(),
    status: conversationStatus("status").default("collecting").notNull(),
    schedulingDraft: jsonb("scheduling_draft").default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [index("conversations_user_created_idx").on(table.userId, table.createdAt)],
);

export const bookings = pgTable(
  "bookings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "restrict" }),
    googleEventId: text("google_event_id").notNull().unique(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    status: bookingStatus("status").default("confirmed").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("bookings_user_starts_idx").on(table.userId, table.startsAt),
    index("bookings_conversation_idx").on(table.conversationId),
  ],
);

export const meetingHabits = pgTable(
  "meeting_habits",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    normalizedName: text("normalized_name").notNull(),
    displayName: text("display_name").notNull(),
    durationMinutes: integer("duration_minutes").notNull(),
    source: text("source").$type<"callie_booking" | "calendar_history">().notNull(),
    observedCount: integer("observed_count").notNull(),
    lastObservedAt: timestamp("last_observed_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("meeting_habits_user_name_unique").on(table.userId, table.normalizedName),
    index("meeting_habits_user_updated_idx").on(table.userId, table.updatedAt),
  ],
);

export const usersRelations = relations(users, ({ many }) => ({
  calendarConnections: many(calendarConnections),
  conversations: many(conversations),
  bookings: many(bookings),
  meetingHabits: many(meetingHabits),
}));
