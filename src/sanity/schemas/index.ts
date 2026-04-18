import type { SchemaTypeDefinition } from 'sanity';
import { pageSchema } from './page';
import { newsPostSchema } from './newsPost';
import { inducteeSchema } from './inductee';
import { eventSchema } from './event';

// Schemas arrive as we migrate each content bucket. Each PLAN step adds one type here.
export const schemaTypes: SchemaTypeDefinition[] = [
  pageSchema,
  newsPostSchema,
  inducteeSchema,
  eventSchema,
];
