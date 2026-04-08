/**
 * DeviceCard — Displays a single assigned SleepSat device in the patient chart.
 *
 * Shows serial number, model, status badge, assignment date, and an unassign action.
 * Used inside DevicesTab as a list item.
 *
 * HIPAA: Device serial/model are NOT PHI. Patient linkage is server-side only.
 */
import { ActionIcon, Badge, Group, Menu, Paper, Stack, Text } from '@mantine/core';
import type { Device } from '@medplum/fhirtypes';
import { IconDeviceWatch, IconDots, IconUnlink } from '@tabler/icons-react';
import type { JSX } from 'react';

export interface DeviceCardProps {
  readonly device: Device;
  readonly onUnassign: (deviceId: string) => void;
}

/** Extracts the assignment date from the device notes, or falls back to meta. */
function getAssignmentDate(device: Device): string {
  const assignNote = device.note?.find((n) => n.text?.startsWith('Assigned'));
  if (assignNote?.text) {
    // "Assigned by Dr. Smith on 2026-03-29" → "2026-03-29"
    const match = assignNote.text.match(/\d{4}-\d{2}-\d{2}/);
    if (match) return match[0];
  }
  return device.meta?.lastUpdated?.split('T')[0] ?? 'Unknown';
}

export function DeviceCard({ device, onUnassign }: DeviceCardProps): JSX.Element {
  const isActive = device.status === 'active';
  const deviceName = device.deviceName?.[0]?.name ?? 'SleepSat Pulse Oximeter';
  const serial = device.serialNumber ?? 'N/A';
  const model = device.modelNumber ?? 'MD300W628-PS';
  const assignedDate = getAssignmentDate(device);

  return (
    <Paper withBorder p="md" radius="md">
      <Group justify="space-between" wrap="nowrap">
        <Group gap="md" wrap="nowrap">
          <IconDeviceWatch size={32} color="var(--mantine-color-blue-6)" />
          <Stack gap={2}>
            <Group gap="xs">
              <Text fw={500} size="sm">
                {deviceName}
              </Text>
              <Badge size="xs" color={isActive ? 'green' : 'gray'} variant="light">
                {isActive ? 'Active' : 'Inactive'}
              </Badge>
            </Group>
            <Text size="xs" c="dimmed">
              Serial: {serial} | Model: {model}
            </Text>
            <Text size="xs" c="dimmed">
              Assigned: {assignedDate}
            </Text>
          </Stack>
        </Group>

        {isActive && device.id && (
          <Menu position="bottom-end" withArrow>
            <Menu.Target>
              <ActionIcon variant="subtle" color="gray" size="sm">
                <IconDots size={16} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item
                color="red"
                leftSection={<IconUnlink size={14} />}
                onClick={() => onUnassign(device.id as string)}
              >
                Unassign Device
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        )}
      </Group>
    </Paper>
  );
}
