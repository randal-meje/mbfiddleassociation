import { defineCliConfig } from 'sanity/cli';

// `sanity dev` / `sanity deploy` read this file. Project identifiers come from the same env
// vars as sanity.config.ts so there's one source of truth.
const projectId = process.env.SANITY_STUDIO_PROJECT_ID;
const dataset = process.env.SANITY_STUDIO_DATASET ?? 'production';

export default defineCliConfig({
  api: { projectId, dataset },
  // Auto-update so the Studio stays current without manual bumps — the board will always
  // be on the latest stable Sanity build when they log in. `appId` pins the deployment
  // target so future `sanity deploy` runs don't prompt for it.
  deployment: {
    appId: 'cumeq8vsyp0nfs9yv6h5otqa',
    autoUpdates: true,
  },
});
