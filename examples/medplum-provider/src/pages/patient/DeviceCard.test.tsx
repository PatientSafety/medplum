/**
 * DeviceCard tests — Device display card rendering and actions.
 *
 * Tests:
 *   - Renders device info (serial, model, status)
 *   - Shows "Active" badge for active devices
 *   - Shows "Inactive" badge for inactive devices
 *   - Shows action menu for active devices
 *   - Hides action menu for inactive devices
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import type { Device } from '@medplum/fhirtypes';
import { DeviceCard } from './DeviceCard';

describe('DeviceCard', () => {
  const onUnassign = vi.fn();

  const activeDevice: Device = {
    resourceType: 'Device',
    id: 'device-001',
    status: 'active',
    serialNumber: 'PSI-2024-001234',
    modelNumber: 'MD300W628-PS',
    deviceName: [{ name: 'SleepSat Pulse Oximeter', type: 'user-friendly-name' }],
    note: [{ text: 'Assigned by Dr. Smith on 2026-03-29' }],
  };

  const inactiveDevice: Device = {
    ...activeDevice,
    id: 'device-002',
    status: 'inactive',
    serialNumber: 'PSI-2023-000099',
    note: [{ text: 'Assigned on 2025-01-15' }, { text: 'Unassigned on 2026-03-01' }],
  };

  test('renders device serial number and model', () => {
    render(<DeviceCard device={activeDevice} onUnassign={onUnassign} />);

    expect(screen.getByText(/PSI-2024-001234/)).toBeVisible();
    expect(screen.getByText(/MD300W628-PS/)).toBeVisible();
  });

  test('renders device name', () => {
    render(<DeviceCard device={activeDevice} onUnassign={onUnassign} />);

    expect(screen.getByText('SleepSat Pulse Oximeter')).toBeVisible();
  });

  test('shows Active badge for active device', () => {
    render(<DeviceCard device={activeDevice} onUnassign={onUnassign} />);

    expect(screen.getByText('Active')).toBeVisible();
  });

  test('shows Inactive badge for inactive device', () => {
    render(<DeviceCard device={inactiveDevice} onUnassign={onUnassign} />);

    expect(screen.getByText('Inactive')).toBeVisible();
  });

  test('shows assignment date from note', () => {
    render(<DeviceCard device={activeDevice} onUnassign={onUnassign} />);

    expect(screen.getByText(/2026-03-29/)).toBeVisible();
  });

  test('renders action menu button for active device', () => {
    render(<DeviceCard device={activeDevice} onUnassign={onUnassign} />);

    // The three-dot menu button should be present
    const menuButtons = screen.getAllByRole('button');
    expect(menuButtons.length).toBeGreaterThan(0);
  });

  test('does not render action menu for inactive device', () => {
    render(<DeviceCard device={inactiveDevice} onUnassign={onUnassign} />);

    // Inactive devices should not have the action menu
    const menuButtons = screen.queryAllByRole('button');
    expect(menuButtons.length).toBe(0);
  });
});
