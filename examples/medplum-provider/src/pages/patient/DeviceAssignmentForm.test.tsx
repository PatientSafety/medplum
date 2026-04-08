/**
 * DeviceAssignmentForm tests — Serial number validation and assignment flow.
 *
 * Tests:
 *   - Renders form fields
 *   - Validates serial number format
 *   - Rejects empty serial number
 *   - Submits valid serial number
 */
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { DeviceAssignmentForm } from './DeviceAssignmentForm';

vi.mock('@mantine/modals', () => ({
  modals: {
    openConfirmModal: vi.fn(({ onConfirm }) => {
      // Auto-confirm for tests
      if (onConfirm) onConfirm();
    }),
  },
}));

vi.mock('@mantine/notifications', () => ({
  notifications: {
    show: vi.fn(),
  },
}));

describe('DeviceAssignmentForm', () => {
  let medplum: MockClient;
  const onAssigned = vi.fn();

  beforeEach(() => {
    medplum = new MockClient();
    onAssigned.mockReset();
  });

  function renderForm(): void {
    render(
      <MedplumProvider medplum={medplum}>
        <DeviceAssignmentForm patientId="test-patient-123" onAssigned={onAssigned} />
      </MedplumProvider>
    );
  }

  test('renders serial number input and assign button', () => {
    renderForm();

    expect(screen.getByLabelText(/serial number/i)).toBeVisible();
    expect(screen.getByPlaceholderText(/PSI-2024/i)).toBeVisible();
    expect(screen.getByRole('button', { name: /assign/i })).toBeVisible();
  });

  test('shows error for empty serial number', async () => {
    renderForm();

    const button = screen.getByRole('button', { name: /assign/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText(/serial number is required/i)).toBeVisible();
    });
  });

  test('shows error for invalid serial number format', async () => {
    renderForm();
    const user = userEvent.setup();

    const input = screen.getByLabelText(/serial number/i);
    await user.type(input, 'ab'); // too short
    fireEvent.click(screen.getByRole('button', { name: /assign/i }));

    await waitFor(() => {
      expect(screen.getByText(/invalid serial number/i)).toBeVisible();
    });
  });

  test('accepts valid serial number format', async () => {
    // Create a test patient for the display name lookup
    await medplum.createResource({
      resourceType: 'Patient',
      id: 'test-patient-123',
      name: [{ given: ['John'], family: 'Doe' }],
    });

    renderForm();
    const user = userEvent.setup();

    const input = screen.getByLabelText(/serial number/i);
    await user.type(input, 'PSI-2024-001234');
    fireEvent.click(screen.getByRole('button', { name: /assign/i }));

    // Should proceed to confirmation modal (mocked to auto-confirm)
    await waitFor(() => {
      expect(onAssigned).toHaveBeenCalled();
    });
  });
});
