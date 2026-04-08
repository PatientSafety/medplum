/**
 * DevicesTab tests — Verifies the device assignment tab in the patient chart.
 *
 * Tests:
 *   - Renders empty state when no devices assigned
 *   - Renders device list when devices exist
 *   - Separates active and inactive devices
 *   - Shows loading state
 */
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { DevicesTab } from './DevicesTab';

// Mock @mantine/modals and @mantine/notifications
vi.mock('@mantine/modals', () => ({
  modals: {
    openConfirmModal: vi.fn(),
  },
}));

vi.mock('@mantine/notifications', () => ({
  notifications: {
    show: vi.fn(),
  },
}));

describe('DevicesTab', () => {
  let medplum: MockClient;

  beforeEach(() => {
    medplum = new MockClient();
  });

  function renderWithProviders(): void {
    render(
      <MemoryRouter initialEntries={['/Patient/test-patient-123/devices']}>
        <MedplumProvider medplum={medplum}>
          <Routes>
            <Route path="/Patient/:patientId/devices" element={<DevicesTab />} />
          </Routes>
        </MedplumProvider>
      </MemoryRouter>
    );
  }

  test('renders empty state when no devices assigned', async () => {
    renderWithProviders();

    await waitFor(() => {
      expect(screen.getByText(/no devices assigned/i)).toBeVisible();
    });
  });

  test('renders assignment form', async () => {
    renderWithProviders();

    await waitFor(() => {
      expect(screen.getByText('Assign New Device')).toBeVisible();
      expect(screen.getByPlaceholderText(/PSI-2024/)).toBeVisible();
      expect(screen.getByRole('button', { name: /assign/i })).toBeVisible();
    });
  });

  test('renders active devices when they exist', async () => {
    // Create a test device
    await medplum.createResource({
      resourceType: 'Device',
      status: 'active',
      serialNumber: 'PSI-2024-000001',
      modelNumber: 'MD300W628-PS',
      deviceName: [{ name: 'SleepSat Pulse Oximeter', type: 'user-friendly-name' }],
      patient: { reference: 'Patient/test-patient-123' },
    });

    renderWithProviders();

    await waitFor(() => {
      expect(screen.getByText('Active Devices')).toBeVisible();
      expect(screen.getByText(/PSI-2024-000001/)).toBeVisible();
    });
  });

  test('separates active and inactive devices', async () => {
    // Active device
    await medplum.createResource({
      resourceType: 'Device',
      status: 'active',
      serialNumber: 'PSI-2024-000001',
      patient: { reference: 'Patient/test-patient-123' },
      deviceName: [{ name: 'SleepSat Pulse Oximeter', type: 'user-friendly-name' }],
    });

    // Inactive device
    await medplum.createResource({
      resourceType: 'Device',
      status: 'inactive',
      serialNumber: 'PSI-2023-000099',
      patient: { reference: 'Patient/test-patient-123' },
      deviceName: [{ name: 'SleepSat Pulse Oximeter', type: 'user-friendly-name' }],
    });

    renderWithProviders();

    await waitFor(() => {
      expect(screen.getByText('Active Devices')).toBeVisible();
      expect(screen.getByText('Previous Devices')).toBeVisible();
    });
  });
});
