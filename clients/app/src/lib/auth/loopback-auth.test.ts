import { afterEach, expect, test } from "bun:test";
import { isPlatformLocal, startLoopbackAuth } from "./loopback-auth";
const originalWindow = window;
function useLocation(origin: string, port: string) {
  const location = { origin, port, href: origin };
  // Model only the host capabilities consumed by this handoff; navigation
  // should record the URL without initiating a document load in happy-dom.
  Reflect.set(globalThis, "window", { location });
  return location;
}
afterEach(() => {
  Reflect.set(globalThis, "window", originalWindow);
  sessionStorage.clear();
});
test("loopback persists a fresh state and destination and sends only the callback to cloud", async () => {
  const location = useLocation("http://localhost:4567", "4567");
  await startLoopbackAuth("/assistant/checkout?package=super", {
    intent: "signup",
  });
  const firstState = sessionStorage.getItem("cadet:loopback:state");
  expect(firstState).toMatch(/^[a-f0-9]{64}$/);
  expect(sessionStorage.getItem("cadet:loopback:returnTo")).toBe(
    "/assistant/checkout?package=super",
  );
  const target = new URL(location.href);
  // The login target is this bundle's environment seed (production under
  // test — no VITE_ENVIRONMENT baked), not an injected URL.
  expect(target.origin).toBe("https://mycadet.ai");
  expect(target.pathname).toBe("/account/signup");
  expect(target.searchParams.get("returnTo")).toBe(
    `/accounts/cli/callback?port=4567&state=${firstState}`,
  );
  await startLoopbackAuth();
  expect(sessionStorage.getItem("cadet:loopback:state")).not.toBe(firstState);
  expect(new URL(location.href).pathname).toBe("/account/login");
});
test("a platform served on its environment's own origin bypasses cloud loopback", () => {
  useLocation("https://mycadet.ai", "");
  expect(isPlatformLocal()).toBe(true);
});
