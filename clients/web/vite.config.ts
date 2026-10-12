// The served entry composes the assistant-ui package's shared vite factory —
// base, dev proxy, chunk groups, public dir, and the local-mode plugin all
// describe the assistant bundle, which both this artifact and the desktop
// artifact are built from. Entry-specific overrides would be spread in here.
import { sharedViteConfig } from "../../packages/assistant-ui/vite.shared.config";

export default sharedViteConfig;
