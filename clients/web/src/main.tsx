// Run localStorage migrations before any other app import.
// MUST stay above the boot import — boot's module graph reads localStorage
// at module level.
import "@mycadet/assistant-ui/utils/run-storage-migrations";

import { start } from "@mycadet/assistant-ui/boot";
import { router } from "@mycadet/assistant-ui/routes";

start(router);
