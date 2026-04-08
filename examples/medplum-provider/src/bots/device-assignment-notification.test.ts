/**
 * device-assignment-notification bot tests.
 *
 * Verifies:
 *   - Bot extracts patient contact info correctly
 *   - Bot sends email via SendGrid
 *   - Bot sends SMS via Twilio
 *   - Bot handles missing email/phone gracefully
 *   - Bot skips notification when no patient reference
 *   - Email/SMS contain NO PHI (no last name, no diagnosis, no serial)
 */
import { MockClient } from '@medplum/mock';
import type { BotEvent } from '@medplum/core';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { handler } from './device-assignment-notification';

// Mock fetch for SendGrid/Twilio API calls
const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 202 });
global.fetch = mockFetch;

describe('device-assignment-notification bot', () => {
  let medplum: MockClient;

  beforeEach(() => {
    medplum = new MockClient();
    mockFetch.mockClear();
  });

  function createEvent(
    device: Record<string, unknown>,
    secrets?: Record<string, { valueString: string }>
  ): BotEvent {
    return {
      input: device,
      secrets: secrets ?? {
        SENDGRID_API_KEY: { valueString: 'SG.test-key' },
        SMS_FROM_NUMBER: { valueString: '+15551234567' },
        TWILIO_ACCOUNT_SID: { valueString: 'AC_test' },
        TWILIO_AUTH_TOKEN: { valueString: 'auth_test' },
        APP_DOWNLOAD_URL: { valueString: 'https://app.sleepcareinc.com/download' },
      },
      contentType: 'application/fhir+json',
      bot: { reference: 'Bot/test-bot' },
    } as unknown as BotEvent;
  }

  test('sends email when patient has email address', async () => {
    // Create patient with email
    const patient = await medplum.createResource({
      resourceType: 'Patient',
      name: [{ given: ['Jane'], family: 'Smith' }],
      telecom: [
        { system: 'email', value: 'jane@example.com' },
        { system: 'phone', use: 'mobile', value: '+15559876543' },
      ],
    });

    const device = {
      resourceType: 'Device',
      id: 'device-001',
      status: 'active',
      patient: { reference: `Patient/${patient.id}` },
      serialNumber: 'PSI-2024-001234',
    };

    await handler(medplum, createEvent(device));

    // Verify email was sent (first fetch call)
    expect(mockFetch).toHaveBeenCalled();
    const emailCall = mockFetch.mock.calls.find(
      (call: [string, ...unknown[]]) => (call[0] as string).includes('sendgrid')
    );
    expect(emailCall).toBeDefined();

    // Verify email content contains no PHI beyond first name
    const emailBody = JSON.parse((emailCall![1] as { body: string }).body);
    const textContent = emailBody.content[0].value;
    expect(textContent).toContain('Hi Jane');
    expect(textContent).not.toContain('Smith'); // No last name
    expect(textContent).not.toContain('PSI-2024'); // No serial number
    expect(textContent).toContain('app.sleepcareinc.com/download');
  });

  test('sends SMS when patient has phone number', async () => {
    const patient = await medplum.createResource({
      resourceType: 'Patient',
      name: [{ given: ['Bob'], family: 'Jones' }],
      telecom: [
        { system: 'phone', use: 'mobile', value: '+15559876543' },
      ],
    });

    const device = {
      resourceType: 'Device',
      id: 'device-002',
      status: 'active',
      patient: { reference: `Patient/${patient.id}` },
    };

    await handler(medplum, createEvent(device));

    // Verify SMS was sent (Twilio call)
    const smsCall = mockFetch.mock.calls.find(
      (call: [string, ...unknown[]]) => (call[0] as string).includes('twilio')
    );
    expect(smsCall).toBeDefined();

    // Verify SMS body has zero PHI
    const smsBody = (smsCall![1] as { body: string }).body;
    expect(smsBody).not.toContain('Bob');
    expect(smsBody).not.toContain('Jones');
    expect(smsBody).toContain('app.sleepcareinc.com/download');
  });

  test('skips notification when no patient reference', async () => {
    const device = {
      resourceType: 'Device',
      id: 'device-003',
      status: 'active',
      // No patient reference
    };

    await handler(medplum, createEvent(device));

    // No fetch calls should have been made
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test('skips notification when device is inactive', async () => {
    const device = {
      resourceType: 'Device',
      id: 'device-004',
      status: 'inactive',
      patient: { reference: 'Patient/some-id' },
    };

    await handler(medplum, createEvent(device));

    expect(mockFetch).not.toHaveBeenCalled();
  });

  test('handles missing SENDGRID_API_KEY gracefully', async () => {
    const patient = await medplum.createResource({
      resourceType: 'Patient',
      name: [{ given: ['Test'] }],
      telecom: [{ system: 'email', value: 'test@example.com' }],
    });

    const device = {
      resourceType: 'Device',
      id: 'device-005',
      status: 'active',
      patient: { reference: `Patient/${patient.id}` },
    };

    // No secrets provided
    await handler(medplum, createEvent(device, {}));

    // Should not attempt to send anything
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test('handles patient with no telecom gracefully', async () => {
    const patient = await medplum.createResource({
      resourceType: 'Patient',
      name: [{ given: ['NoContact'] }],
      // No telecom
    });

    const device = {
      resourceType: 'Device',
      id: 'device-006',
      status: 'active',
      patient: { reference: `Patient/${patient.id}` },
    };

    // Should not throw
    await handler(medplum, createEvent(device));
  });
});
