/**
 * DeviceAssignmentForm — Provider enters a SleepSat serial number to assign
 * the device permanently to the current patient.
 *
 * Flow:
 *   1. Provider types serial number
 *   2. Frontend validates format
 *   3. Checks if serial is already assigned (via FHIR search)
 *   4. Confirmation modal with patient name
 *   5. Creates FHIR Device resource on confirm
 *   6. Medplum Subscription triggers notification bot (email + SMS)
 *
 * HIPAA: Serial numbers are NOT PHI. Patient name shown only in the modal
 *        (already visible on the patient chart page).
 */
import { Button, Group, Paper, Text, TextInput, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { useMedplum, useMedplumProfile } from '@medplum/react';
import { IconDeviceFloppy, IconDeviceWatch } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useState } from 'react';
import {
  createDeviceAssignment,
  createDeviceAssignmentAudit,
  findDeviceBySerial,
  getPatientDisplayName,
} from '../../services/fhir-repository';

/**
 * Serial number format: alphanumeric with optional dashes.
 * Examples: PSI-2024-001234, SN123456, MD300-W628-PS-001
 * Intentionally permissive — exact format varies by manufacturing batch.
 */
const SERIAL_REGEX = /^[A-Za-z0-9][\w-]{3,30}$/;

export interface DeviceAssignmentFormProps {
  readonly patientId: string;
  readonly onAssigned: () => void;
}

export function DeviceAssignmentForm({ patientId, onAssigned }: DeviceAssignmentFormProps): JSX.Element {
  const medplum = useMedplum();
  const profile = useMedplumProfile();
  const [loading, setLoading] = useState(false);

  const form = useForm({
    initialValues: { serialNumber: '' },
    validate: {
      serialNumber: (value) => {
        if (!value.trim()) return 'Serial number is required';
        if (!SERIAL_REGEX.test(value.trim())) return 'Invalid serial number format';
        return null;
      },
    },
  });

  const handleAssign = useCallback(
    async (values: { serialNumber: string }): Promise<void> => {
      const serial = values.serialNumber.trim();
      setLoading(true);

      try {
        // Check if serial is already assigned to another patient
        const existing = await findDeviceBySerial(medplum, serial);
        if (existing?.patient?.reference) {
          const existingPatientId = existing.patient.reference.split('/')[1];
          if (existingPatientId === patientId && existing.status === 'active') {
            notifications.show({
              title: 'Already assigned',
              message: 'This device is already assigned to this patient.',
              color: 'yellow',
            });
            setLoading(false);
            return;
          }
          if (existing.status === 'active') {
            form.setFieldError('serialNumber', 'This device is already assigned to another patient');
            setLoading(false);
            return;
          }
        }

        // Get patient display name for confirmation
        const displayName = await getPatientDisplayName(medplum, patientId);

        // Show confirmation modal
        setLoading(false);
        modals.openConfirmModal({
          title: 'Assign Device',
          children: (
            <Text size="sm">
              Assign SleepSat <strong>{serial}</strong> to <strong>{displayName}</strong>?
              <br />
              <br />
              The patient will receive an email and text message with a link to download the SatCloud app.
              This assignment is permanent — the patient owns this device.
            </Text>
          ),
          labels: { confirm: 'Assign Device', cancel: 'Cancel' },
          confirmProps: { color: 'blue' },
          onConfirm: async () => {
            setLoading(true);
            try {
              const practitionerName = profile?.name?.[0]
                ? `${profile.name[0].given?.[0] ?? ''} ${profile.name[0].family ?? ''}`.trim()
                : undefined;

              const device = await createDeviceAssignment(medplum, {
                serialNumber: serial,
                patientId,
                assignedBy: practitionerName,
              });

              // SOC2 CC8.1: Log the assignment with practitioner identity
              if (profile?.id && device.id) {
                await createDeviceAssignmentAudit(medplum, {
                  deviceId: device.id,
                  patientId,
                  practitionerId: profile.id,
                  action: 'assign',
                });
              }

              notifications.show({
                title: 'Device assigned',
                message: `SleepSat ${serial} assigned. Patient will be notified via email and text.`,
                color: 'green',
              });

              form.reset();
              onAssigned();
            } catch (err) {
              notifications.show({
                title: 'Assignment failed',
                message: 'Could not assign device. Please try again.',
                color: 'red',
              });
            } finally {
              setLoading(false);
            }
          },
        });
      } catch (err) {
        notifications.show({
          title: 'Validation failed',
          message: 'Could not validate serial number. Please try again.',
          color: 'red',
        });
        setLoading(false);
      }
    },
    [medplum, patientId, profile, form, onAssigned]
  );

  return (
    <Paper withBorder p="md" radius="md">
      <Group gap="xs" mb="sm">
        <IconDeviceWatch size={20} />
        <Title order={5}>Assign New Device</Title>
      </Group>
      <form onSubmit={form.onSubmit(handleAssign)}>
        <Group align="flex-end" gap="sm">
          <TextInput
            label="Serial Number"
            placeholder="e.g. PSI-2024-001234"
            description="Enter the serial number printed on the SleepSat device"
            style={{ flex: 1 }}
            {...form.getInputProps('serialNumber')}
            disabled={loading}
          />
          <Button
            type="submit"
            loading={loading}
            leftSection={<IconDeviceFloppy size={16} />}
          >
            Assign
          </Button>
        </Group>
      </form>
    </Paper>
  );
}
