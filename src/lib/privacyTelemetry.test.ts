import { expect, it } from "vitest";
import { sanitizeTelemetry } from "./privacyTelemetry";
it("drops credentials, private content, identifiers and attachment contexts", () => {
  const privateData = "PRIVATE_SYNTHETIC_VALUE";
  const cleaned = sanitizeTelemetry({
    event_id: "event",
    release: "1",
    user: { email: privateData },
    request: { headers: { Authorization: privateData } },
    extra: { transcript: privateData },
    contexts: { resume: privateData },
    breadcrumbs: [{ message: privateData }],
    exception: { values: [{ value: privateData }] },
    message: privateData,
    attachments: [privateData],
  });
  expect(JSON.stringify(cleaned)).not.toContain(privateData);
  expect(cleaned.event_id).toBe("event");
});
