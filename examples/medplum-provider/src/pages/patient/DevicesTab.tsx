/**
 * DevicesTab — Patient chart tab for managing SleepSat BLE device assignments.
 *
 * Providers use this tab to:
 *   1. View devices assigned to the patient (DeviceCard list)
 *   2. Assign a new device by serial number (DeviceAssignmentForm)
 *   3. Unassign a broken/replaced device
 *
 * When a device is assigned, a Medplum Subscription triggers a notification bot
 * that sends the patient an email + SMS with a link to download the SatCloud app.
 *
 * HIPAA: Device serials are NOT PHI. Patient linkage displayed from existing chart context.
 * SOC2 CC8.1: AuditEvent logged for every assign/unassign action.
 */
import { Center, Loader, Stack, Text, Title } from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { usePatient } from '@medplum/react';
import { useMedplum, useMedplumProfile } from '@medplum/react';
import { IconDeviceWatch } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useEffect, useState } from 'react';
import type { Device } from '@medplum/fhirtypes';
import {
  createDeviceAssignmentAudit,
  searchPatientDevices,
  unassignDevice,
} from '../../services/fhir-repository';
import { DeviceAssignmentForm } from './DeviceAssignmentForm';
import { DeviceCard } from './DeviceCard';

export function DevicesTab(): JSX.Element {
  const patient = usePatient();
  const medplum = useMedplum();
  const profile = useMedplumProfile();
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);

  const loadDevices = useCallback(async (): Promise<void> => {
    if (!patient?.id) return;
    setLoading(true);
    try {
      const results = await searchPatientDevices(medplum, patient.id);
      setDevices(results);
    } catch {
      notifications.show({
        title: 'Error',
        message: 'Could not load devices.',
        color: 'red',
      });
    } finally {
      setLoading(false);
    }
  }, [medplum, patient?.id]);

  useEffect(() => {
    loadDevices();
  }, [loadDevices]);

  const handleUnassign = useCallback(
    (deviceId: string): void => {
      const device = devices.find((d) => d.id === deviceId);
      const serial = device?.serialNumber ?? deviceId;

      modals.openConfirmModal({
        title: 'Unassign Device',
        children: (
          <Text size="sm">
            Unassign SleepSat <strong>{serial}</strong> from this patient?
            <br />
            <br />
            The device will be marked inactive. This does not delete the device — it can be
            reassigned later.
          </Text>
        ),
        labels: { confirm: 'Unassign', cancel: 'Cancel' },
        confirmProps: { color: 'red' },
        onConfirm: async () => {
          try {
            await unassignDevice(medplum, deviceId);

            // SOC2 CC8.1: Log the unassignment
            if (profile?.id && patient?.id) {
              await createDeviceAssignmentAudit(medplum, {
                deviceId,
                patientId: patient.id,
                practitionerId: profile.id,
                action: 'unassign',
              });
            }

            notifications.show({
              title: 'Device unassigned',
              message: `SleepSat ${serial} has been unassigned.`,
              color: 'blue',
            });
            loadDevices();
          } catch {
            notifications.show({
              title: 'Error',
              message: 'Could not unassign device.',
              color: 'red',
            });
          }
        },
      });
    },
    [medplum, profile?.id, patient?.id, devices, loadDevices]
  );

  if (!patient?.id) {
    return (
      <Center h={200}>
        <Loader />
      </Center>
    );
  }

  const activeDevices = devices.filter((d) => d.status === 'active');
  const inactiveDevices = devices.filter((d) => d.status !== 'active');

  return (
    <Stack gap="lg" p="md">
      <DeviceAssignmentForm patientId={patient.id} onAssigned={loadDevices} />

      {loading ? (
        <Center h={100}>
          <Loader size="sm" />
        </Center>
      ) : devices.length === 0 ? (
        <Center h={100}>
          <Stack align="center" gap="xs">
            <IconDeviceWatch size={40} color="var(--mantine-color-gray-5)" />
            <Text c="dimmed" size="sm">
              No devices assigned to this patient yet.
            </Text>
          </Stack>
        </Center>
      ) : (
        <>
          {activeDevices.length > 0 && (
            <Stack gap="sm">
              <Title order={5}>Active Devices</Title>
              {activeDevices.map((device) => (
                <DeviceCard key={device.id} device={device} onUnassign={handleUnassign} />
              ))}
            </Stack>
          )}

          {inactiveDevices.length > 0 && (
            <Stack gap="sm">
              <Title order={6} c="dimmed">
                Previous Devices
              </Title>
              {inactiveDevices.map((device) => (
                <DeviceCard key={device.id} device={device} onUnassign={handleUnassign} />
              ))}
            </Stack>
          )}
        </>
      )}
    </Stack>
  );
}
