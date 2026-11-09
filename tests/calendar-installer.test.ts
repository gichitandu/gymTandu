import { it, expect, vi } from "vitest";
import {
  provision,
  jsonList,
  workerUrl,
} from "../calendar-relay/setup-windows.mjs";
const uuid = "01234567-1234-1234-1234-123456789abc";
const secret = "d".repeat(64);
function mock(existingDatabase = false, existingSecret = false) {
  let created = existingDatabase;
  const logs: string[] = [];
  const run = vi.fn(async (args: string[], options: any = {}) => {
    if (args[0] === "d1" && args[1] === "list")
      return JSON.stringify(
        created ? [{ name: "gymtrack-calendar", uuid }] : [],
      );
    if (args[0] === "d1" && args[1] === "create") created = true;
    if (args[0] === "secret" && args[1] === "list")
      return JSON.stringify(
        existingSecret ? [{ name: "CALENDAR_RELAY_SECRET" }] : [],
      );
    return "";
  });
  const deps = {
    run,
    log: (s: string) => logs.push(s),
    writeConfig: vi.fn(),
    ask: vi.fn(async (message: string) =>
      message.includes("URL HTTPS")
        ? "https://gymtrack-calendar.my-account.workers.dev"
        : "",
    ),
    clipboard: vi.fn(),
    secretFactory: () => secret,
  };
  return { deps, logs };
}
it("provisions a new service, sends secrets only on stdin, and clears the clipboard", async () => {
  const { deps, logs } = mock();
  const url = await provision(deps);
  expect(url).toBe("https://gymtrack-calendar.my-account.workers.dev");
  expect(deps.writeConfig).toHaveBeenCalledWith(uuid);
  expect(
    deps.run.mock.calls.find(
      ([args]) => args[0] === "secret" && args[1] === "put",
    )?.[1],
  ).toEqual({ input: secret + "\n", sensitive: true });
  expect(deps.clipboard.mock.calls).toEqual([[secret], [""]]);
  expect(logs.join("\n")).not.toContain(secret);
  expect(deps.run.mock.calls.some(([args]) => args.includes(secret))).toBe(
    false,
  );
});
it("a retry reuses the database and leaves the existing secret untouched", async () => {
  const { deps } = mock(true, true);
  await provision(deps);
  expect(
    deps.run.mock.calls.some(
      ([args]) => args[1] === "create" || args[1] === "put",
    ),
  ).toBe(false);
  expect(deps.clipboard).not.toHaveBeenCalled();
});
it("stops on a database listing failure before touching schema or deployment", async () => {
  const { deps } = mock();
  deps.run.mockImplementation(async () => {
    throw Error("access denied");
  });
  await expect(provision(deps)).rejects.toThrow("access denied");
  expect(deps.writeConfig).not.toHaveBeenCalled();
  expect(deps.clipboard).not.toHaveBeenCalled();
});
it("clears clipboard even when uploading the new secret fails", async () => {
  const { deps } = mock();
  const original = deps.run.getMockImplementation()!;
  deps.run.mockImplementation(async (args, options) => {
    if (args[0] === "secret" && args[1] === "put") throw Error("upload failed");
    return original(args, options);
  });
  await expect(provision(deps)).rejects.toThrow("upload failed");
  expect(deps.clipboard.mock.calls).toEqual([[secret], [""]]);
});
it("rejects ambiguous command output and unrelated or non-HTTPS URLs", () => {
  expect(() => jsonList("Error fetching account")).toThrow();
  expect(() => jsonList("{}")).toThrow();
  expect(() => workerUrl("https://evil.test")).toThrow();
  expect(() => workerUrl("http://gymtrack-calendar.a.workers.dev")).toThrow();
  expect(() =>
    workerUrl("https://gymtrack-calendar.a.workers.dev.evil.test"),
  ).toThrow();
});
