import {
  Box, Group, Loader, Stack, Text, Title,
} from '@mantine/core';
import React from 'react';

interface PageHeaderProps {
  title: string;
  description: string;
  actions?: React.ReactNode;
  isFetching?: boolean;
  updatedAt?: number;
}

export function PageHeader({
  title, description, actions, isFetching = false, updatedAt,
}: PageHeaderProps) {
  return (
    <Group justify="space-between" align="flex-end" gap="md" mb="md" wrap="wrap">
      <Box>
        <Title order={2} size="h3">{title}</Title>
        <Text c="dimmed" size="sm" mt={2}>{description}</Text>
      </Box>
      <Stack
        gap={4}
        align="flex-end"
        w={{ base: '100%', sm: 'auto' }}
      >
        {actions}
        <Group gap={6} mih={18}>
          {isFetching && <Loader size={12} aria-label="Refreshing" />}
          <Text size="xs" c="dimmed" aria-live="polite">
            {isFetching
              ? 'Refreshing data'
              : updatedAt
                ? `Updated ${new Date(updatedAt).toLocaleTimeString()}`
                : 'Waiting for data'}
          </Text>
        </Group>
      </Stack>
    </Group>
  );
}
