import { RocketIcon } from '@sanity/icons';
import type { Tool } from 'sanity';
import { DeployTool } from './DeployTool';

// Registers a "Deploy" item in the Studio nav that triggers a Netlify rebuild via a
// serverless function. `endpoint` is the full URL of that function — passed in from
// sanity.config.ts so this file has no env-reading responsibility.
export function deployTool(endpoint: string): Tool {
  return {
    title: 'Deploy',
    name: 'deploy',
    icon: RocketIcon,
    component: () => <DeployTool endpoint={endpoint} />,
  };
}
