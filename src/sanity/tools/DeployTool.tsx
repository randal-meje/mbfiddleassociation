import { useState } from 'react';
import { useClient, useCurrentUser } from 'sanity';
import { Box, Button, Card, Heading, Stack, Text } from '@sanity/ui';
import { RocketIcon } from '@sanity/icons';

type Status =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'success'; at: Date }
  | { kind: 'error'; message: string };

interface Props {
  endpoint: string;
}

export function DeployTool({ endpoint }: Props) {
  const client = useClient({ apiVersion: '2024-10-01' });
  const user = useCurrentUser();
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  async function onDeploy() {
    const token = client.config().token;
    if (!token) {
      setStatus({ kind: 'error', message: 'Not signed in to Sanity.' });
      return;
    }
    setStatus({ kind: 'loading' });
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        setStatus({ kind: 'error', message: `Deploy failed (HTTP ${res.status}).` });
        return;
      }
      setStatus({ kind: 'success', at: new Date() });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Network error.';
      setStatus({ kind: 'error', message });
    }
  }

  return (
    <Card padding={4}>
      <Stack space={4} style={{ maxWidth: 560 }}>
        <Heading size={2}>Deploy site</Heading>
        <Text size={1} muted>
          Publishes all saved Sanity changes to mbfiddleassociation.org. The build takes
          about 1–2 minutes. You can keep editing while it runs; click Deploy again when
          you want those changes live.
        </Text>
        <Box>
          <Button
            icon={RocketIcon}
            text={status.kind === 'loading' ? 'Deploying…' : 'Deploy site'}
            tone="primary"
            disabled={status.kind === 'loading' || !user}
            onClick={onDeploy}
          />
        </Box>
        {status.kind === 'success' && (
          <Text size={1}>Deploy triggered at {status.at.toLocaleTimeString()}.</Text>
        )}
        {status.kind === 'error' && (
          <Text size={1} style={{ color: 'crimson' }}>
            {status.message}
          </Text>
        )}
      </Stack>
    </Card>
  );
}
