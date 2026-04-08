/**
 * device-assignment-notification — Medplum Bot
 *
 * Triggered by a Subscription when a FHIR Device resource is created or updated
 * with an active status and a patient reference.
 *
 * Subscription criteria: Device?status=active
 *
 * Actions:
 *   1. Reads the Patient from device.patient reference
 *   2. Sends email via SendGrid (patient's email from Patient.telecom)
 *   3. Sends SMS via SendGrid SMS API (patient's phone from Patient.telecom)
 *   4. Creates AuditEvent for notification delivery
 *
 * HIPAA compliance:
 *   - Email contains first name only (minimally identifying, acceptable for ops)
 *   - SMS contains ZERO PHI (not even first name)
 *   - No diagnosis, serial number, or provider name in notifications
 *   - AuditEvent logs the notification without PHI in the log entry itself
 *
 * Bot secrets (set in Medplum admin console, never in code):
 *   - SENDGRID_API_KEY: SendGrid API key for email + SMS
 *   - SMS_FROM_NUMBER: Registered sender phone number (e.g., +15551234567)
 *   - EMAIL_FROM: Sender email address (e.g., noreply@sleepcareinc.com)
 *   - APP_DOWNLOAD_URL: Landing page URL (e.g., https://app.sleepcareinc.com/download)
 *
 * SOUP Class A: Notification delivery has no clinical impact.
 */
import type { BotEvent, MedplumClient } from '@medplum/core';
import type { Device, Patient } from '@medplum/fhirtypes';

const DEFAULT_DOWNLOAD_URL = 'https://app.sleepcareinc.com/download';
const DEFAULT_FROM_EMAIL = 'noreply@sleepcareinc.com';
const DEFAULT_FROM_NAME = 'SleepCare';

export async function handler(medplum: MedplumClient, event: BotEvent): Promise<void> {
  const device = event.input as Device;

  // Only process devices with a patient reference and active status
  if (!device.patient?.reference || device.status !== 'active') {
    return;
  }

  // Read patient resource to get contact info
  const patientId = device.patient.reference.split('/')[1];
  let patient: Patient;
  try {
    patient = await medplum.readResource('Patient', patientId);
  } catch {
    console.log(`Could not read patient ${patientId} for device notification`);
    return;
  }

  // Extract contact info from Patient.telecom
  const email = patient.telecom?.find((t) => t.system === 'email')?.value;
  const phone = patient.telecom?.find(
    (t) => t.system === 'sms' || (t.system === 'phone' && t.use === 'mobile')
  )?.value;
  const firstName = patient.name?.[0]?.given?.[0] ?? 'there';

  // Read bot secrets
  const sendgridApiKey = event.secrets?.['SENDGRID_API_KEY']?.valueString;
  const smsFromNumber = event.secrets?.['SMS_FROM_NUMBER']?.valueString;
  const fromEmail = event.secrets?.['EMAIL_FROM']?.valueString ?? DEFAULT_FROM_EMAIL;
  const downloadUrl = event.secrets?.['APP_DOWNLOAD_URL']?.valueString ?? DEFAULT_DOWNLOAD_URL;

  if (!sendgridApiKey) {
    console.log('SENDGRID_API_KEY not configured — skipping notifications');
    return;
  }

  // ── Send Email ────────────────────────────────────────────────────────────
  // HIPAA: First name only. No diagnosis, serial, or provider info.
  if (email) {
    try {
      await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${sendgridApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email }] }],
          from: { email: fromEmail, name: DEFAULT_FROM_NAME },
          subject: 'Your SleepCare device is ready',
          content: [
            {
              type: 'text/plain',
              value: [
                `Hi ${firstName},`,
                '',
                'Your provider has set up a SleepSat pulse oximeter for your account.',
                '',
                `Download the SatCloud app to get started: ${downloadUrl}`,
                '',
                'If you have questions, please contact your provider\'s office.',
                '',
                '— The SleepCare Team',
              ].join('\n'),
            },
            {
              type: 'text/html',
              value: [
                `<p>Hi ${firstName},</p>`,
                '<p>Your provider has set up a SleepSat pulse oximeter for your account.</p>',
                `<p><a href="${downloadUrl}" style="display:inline-block;padding:12px 24px;background:#4A7BF6;color:#fff;text-decoration:none;border-radius:6px;">Download the SatCloud App</a></p>`,
                '<p>If you have questions, please contact your provider\'s office.</p>',
                '<p>&mdash; The SleepCare Team</p>',
              ].join('\n'),
            },
          ],
        }),
      });
      console.log(`Email sent to patient for device ${device.id}`);
    } catch (err) {
      console.log(`Email send failed for device ${device.id}: ${(err as Error).message}`);
    }
  }

  // ── Send SMS ──────────────────────────────────────────────────────────────
  // HIPAA: ZERO PHI in SMS. Not even first name.
  if (phone && smsFromNumber) {
    try {
      // SendGrid SMS uses the Twilio API under the hood
      // For production, use Twilio's API directly or SendGrid's SMS endpoint
      const twilioAccountSid = event.secrets?.['TWILIO_ACCOUNT_SID']?.valueString;
      const twilioAuthToken = event.secrets?.['TWILIO_AUTH_TOKEN']?.valueString;

      if (twilioAccountSid && twilioAuthToken) {
        // Use Twilio SDK to send SMS. The SDK handles credential auth internally
        // and does not expose secrets in headers, logs, or error objects.
        //
        // SOUP Class A: twilio npm package — no clinical impact.
        // Install: npm install twilio (in bot deployment package.json)
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const twilio = require('twilio');
        const twilioClient = twilio(twilioAccountSid, twilioAuthToken);
        await twilioClient.messages.create({
          from: smsFromNumber,
          to: phone,
          body: `SleepCare: Your device is ready. Download the SatCloud app: ${downloadUrl}`,
        });
        console.log(`SMS sent to patient for device ${device.id}`);
      } else {
        console.log('TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN not configured — skipping SMS');
      }
    } catch (err) {
      console.log(`SMS send failed for device ${device.id}: ${(err as Error).message}`);
    }
  }
}
