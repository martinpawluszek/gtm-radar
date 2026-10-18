import { readFileSync } from "node:fs";
import { test } from "node:test";
import { strict as assert } from "node:assert";

// Exercise the real prompt's context decisions without importing the route or testing its copy.
const source = readFileSync("src/routes/outreach.tsx", "utf8");
const start = source.indexOf("  const buildPrompt = () => {");
const end = source.indexOf("    let roleGuidance: string;", start);
const context = source.slice(start, end).replace("  const buildPrompt = () => {", "");
const decide = new Function("target", "activity", "ACTIVITY_LABEL", "fmtDate", `${context}
  return { role, roleHint, hasResponse, firstName, lastReply };
`);
const target = { name: "Jorg Example", contact_role: "recruiter", status: "invite_accepted", notes: "Found for Regional Director application at Security Co", group_name: "a_cold" };
const run = (activity: unknown[]) => decide(target, activity, { response_received: "Response", message_sent: "Message" }, () => "date");

test("the application title is taken from notes for a recruiter", () => {
  assert.equal(run([]).roleHint, "Regional Director");
  assert.equal(run([]).role, "recruiter");
});

test("a sent message is not evidence of a received response", () => {
  assert.equal(run([{ activity_type: "message_sent", occurred_at: "2026-10-18", content: "Hello" }]).hasResponse, false);
});

test("a received response anywhere in the activity list is recognized", () => {
  const activities = Array.from({ length: 4 }, () => ({ activity_type: "message_sent", occurred_at: "2026-10-18", content: "Hello" }));
  activities.push({ activity_type: "response_received", occurred_at: "2026-10-17", content: "Reply" });
  assert.equal(run(activities).hasResponse, true);
});

test("closing-reply assessment uses the latest received response regardless of list order", () => {
  const result = run([
    { activity_type: "response_received", occurred_at: "2026-10-16", content: "Earlier reply" },
    { activity_type: "response_received", occurred_at: "2026-10-18", content: "Thanks, all the best" },
  ]);
  assert.equal(result.lastReply.content, "Thanks, all the best");
  assert.equal(result.firstName, "Jorg");
});