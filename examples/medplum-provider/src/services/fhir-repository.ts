/**
 * FhirRepository — Anti-corruption layer between provider portal UI and Medplum SDK.
 *
 * Purpose:
 *   Per PatientSafety CLAUDE.md, no screen or component may import the Medplum SDK
 *   directly. This adapter wraps all FHIR operations so that a Medplum SDK update
 *   only requires changes here, not across every component.
 *
 * Architecture:
 *   Screens / Components → FhirRepository → MedplumClient → Medplum API
 *
 * HIPAA: No PHI in method names, logs, or error messages.
 * SOUP Class C: @medplum/core — FHIR R4 transport + OAuth2 auth.
 */
import type { MedplumClient } from '@medplum/core';
import type { AuditEvent, Device, Patient } from '@medplum/fhirtypes';

// ── Device Operations ─────────────────────────────────────────────────────────

/** Default SNOMED code for pulse oximeter devices. */
const PULSE_OXIMETER_CODE = {
  system: 'http://snomed.info/sct',
  code: '706767009',
  display: 'Pulse oximeter',
} as const;

/** Creates a new FHIR Device resource assigned to a patient. */
export async function createDeviceAssignment(
  medplum: MedplumClient,
  params: {
    serialNumber: string;
    patientId: string;
    organizationId?: string;
    assignedBy?: string;
  }
): Promise<Device> {
  const device: Device = {
    resourceType: 'Device',
    status: 'active',
    manufacturer: 'Patient Safety Inc.',
    deviceName: [{ name: 'SleepSat Pulse Oximeter', type: 'user-friendly-name' }],
    modelNumber: 'MD300W628-PS',
    serialNumber: params.serialNumber,
    type: { coding: [PULSE_OXIMETER_CODE] },
    patient: { reference: `Patient/${params.patientId}` },
    ...(params.organizationId && {
      owner: { reference: `Organization/${params.organizationId}` },
    }),
    note: [
      {
        text: `Assigned${params.assignedBy ? ` by ${params.assignedBy}` : ''} on ${new Date().toISOString().split('T')[0]}`,
      },
    ],
  };

  return medplum.createResource(device);
}

/** Searches for active Device resources assigned to a patient. */
export async function searchPatientDevices(
  medplum: MedplumClient,
  patientId: string
): Promise<Device[]> {
  return medplum.searchResources('Device', {
    patient: `Patient/${patientId}`,
    _sort: '-_lastUpdated',
    _count: '50',
  });
}

/** Checks if a serial number is already assigned to any patient. */
export async function findDeviceBySerial(
  medplum: MedplumClient,
  serialNumber: string
): Promise<Device | undefined> {
  const results = await medplum.searchResources('Device', {
    identifier: serialNumber,
    _count: '1',
  });

  if (results.length > 0) {
    return results[0];
  }

  // Also search by the serialNumber field directly
  const bySerial = await medplum.searchResources('Device', {
    _filter: `serialNumber eq "${serialNumber}"`,
    _count: '1',
  });

  return bySerial[0];
}

/** Unassigns a device by setting status to inactive and removing patient ref. */
export async function unassignDevice(
  medplum: MedplumClient,
  deviceId: string
): Promise<Device> {
  const device = await medplum.readResource('Device', deviceId);
  return medplum.updateResource({
    ...device,
    status: 'inactive',
    patient: undefined,
    note: [
      ...(device.note ?? []),
      { text: `Unassigned on ${new Date().toISOString().split('T')[0]}` },
    ],
  });
}

// ── Patient Operations ────────────────────────────────────────────────────────

/** Returns the display name for a patient (first name + last initial). */
export async function getPatientDisplayName(
  medplum: MedplumClient,
  patientId: string
): Promise<string> {
  const patient = await medplum.readResource('Patient', patientId);
  const name = patient.name?.[0];
  if (!name) return 'Patient';
  const given = name.given?.[0] ?? '';
  const family = name.family ?? '';
  return `${given} ${family.charAt(0)}.`.trim();
}

// ── Audit ─────────────────────────────────────────────────────────────────────

/**
 * Creates an AuditEvent for a device assignment action.
 *
 * SOC2 CC8.1: All device assignments must be logged with identity + timestamp.
 */
export async function createDeviceAssignmentAudit(
  medplum: MedplumClient,
  params: {
    deviceId: string;
    patientId: string;
    practitionerId: string;
    action: 'assign' | 'unassign';
  }
): Promise<AuditEvent> {
  return medplum.createResource<AuditEvent>({
    resourceType: 'AuditEvent',
    type: {
      system: 'http://dicom.nema.org/resources/ontology/DCM',
      code: '110110',
      display: 'Patient Record',
    },
    subtype: [
      {
        system: 'http://patientsafety.com/audit-events',
        code: `device-${params.action}`,
        display: params.action === 'assign' ? 'Device Assigned to Patient' : 'Device Unassigned from Patient',
      },
    ],
    action: params.action === 'assign' ? 'C' : 'U',
    recorded: new Date().toISOString(),
    outcome: '0', // success
    agent: [
      {
        who: { reference: `Practitioner/${params.practitionerId}` },
        requestor: true,
      },
    ],
    entity: [
      {
        what: { reference: `Device/${params.deviceId}` },
        role: { system: 'http://terminology.hl7.org/CodeSystem/object-role', code: '4', display: 'Domain Resource' },
      },
      {
        what: { reference: `Patient/${params.patientId}` },
        role: { system: 'http://terminology.hl7.org/CodeSystem/object-role', code: '1', display: 'Patient' },
      },
    ],
  });
}
