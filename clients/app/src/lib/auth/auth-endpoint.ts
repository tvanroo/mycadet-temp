import { currentCloudUrl } from "@app/lib/client-environment";
import { getElectronBridge } from "@app/runtime/electron-bridge";

/** Browser clients use their same-origin proxy; Electron uses its cloud origin. */
export function authEndpoint(path: string): string {
  if (!getElectronBridge()) return `/_allauth/browser/v1/${path}`;
  return new URL(`/_allauth/app/v1/${path}`, currentCloudUrl()).href;
}
