// =============================================================================
// MindLog API — FHIR R4 Validation (lightweight, no SDK)
//
// Validates that our mapped FHIR resources contain the minimum required fields
// before they are served to clients.  This is intentionally simple — we do
// NOT perform full HL7 profile validation here (that would require the full
// FHIR validator jar).  Instead we check structural invariants that our
// mappers should always satisfy.
//
// Returns an array of validation issues (empty = valid).
// =============================================================================

export interface FhirValidationIssue {
  severity:   'error' | 'warning';
  code:       string;
  detail:     string;
  expression?: string;
}

// ---------------------------------------------------------------------------
// Generic resource structure check
// ---------------------------------------------------------------------------

function hasField(obj: Record<string, unknown>, path: string): boolean {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return false;
    current = (current as Record<string, unknown>)[part];
  }
  return current != null && current !== '';
}

// ---------------------------------------------------------------------------
// Per-resource validators
// ---------------------------------------------------------------------------

function validatePatient(resource: Record<string, unknown>): FhirValidationIssue[] {
  const issues: FhirValidationIssue[] = [];

  if (!hasField(resource, 'id'))
    issues.push({ severity: 'error', code: 'required', detail: 'Patient.id is required', expression: 'Patient.id' });

  if (!hasField(resource, 'name'))
    issues.push({ severity: 'error', code: 'required', detail: 'Patient.name is required', expression: 'Patient.name' });

  if (!hasField(resource, 'identifier'))
    issues.push({ severity: 'warning', code: 'recommended', detail: 'Patient.identifier (MRN) is recommended for EHR integration' });

  if (!hasField(resource, 'birthDate'))
    issues.push({ severity: 'warning', code: 'recommended', detail: 'Patient.birthDate is recommended' });

  return issues;
}

function validateObservation(resource: Record<string, unknown>): FhirValidationIssue[] {
  const issues: FhirValidationIssue[] = [];

  if (!hasField(resource, 'id'))
    issues.push({ severity: 'error', code: 'required', detail: 'Observation.id is required', expression: 'Observation.id' });

  if (!hasField(resource, 'status'))
    issues.push({ severity: 'error', code: 'required', detail: 'Observation.status is required', expression: 'Observation.status' });

  if (!hasField(resource, 'code'))
    issues.push({ severity: 'error', code: 'required', detail: 'Observation.code is required', expression: 'Observation.code' });

  if (!hasField(resource, 'subject'))
    issues.push({ severity: 'error', code: 'required', detail: 'Observation.subject is required', expression: 'Observation.subject' });

  return issues;
}

function validateMedicationRequest(resource: Record<string, unknown>): FhirValidationIssue[] {
  const issues: FhirValidationIssue[] = [];

  for (const field of ['id', 'status', 'intent', 'subject']) {
    if (!hasField(resource, field))
      issues.push({ severity: 'error', code: 'required', detail: `MedicationRequest.${field} is required`, expression: `MedicationRequest.${field}` });
  }

  return issues;
}

function validateCondition(resource: Record<string, unknown>): FhirValidationIssue[] {
  const issues: FhirValidationIssue[] = [];

  for (const field of ['id', 'clinicalStatus', 'code', 'subject']) {
    if (!hasField(resource, field))
      issues.push({ severity: 'error', code: 'required', detail: `Condition.${field} is required`, expression: `Condition.${field}` });
  }

  return issues;
}

function validateConsent(resource: Record<string, unknown>): FhirValidationIssue[] {
  const issues: FhirValidationIssue[] = [];

  for (const field of ['id', 'status', 'scope', 'category', 'patient']) {
    if (!hasField(resource, field))
      issues.push({ severity: 'error', code: 'required', detail: `Consent.${field} is required`, expression: `Consent.${field}` });
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validate a FHIR resource object.
 * Returns an array of issues.  Empty array = no issues found.
 */
export function validateResource(resource: Record<string, unknown>): FhirValidationIssue[] {
  const resourceType = resource['resourceType'] as string;

  switch (resourceType) {
    case 'Patient':              return validatePatient(resource);
    case 'Observation':          return validateObservation(resource);
    case 'MedicationRequest':    return validateMedicationRequest(resource);
    case 'Condition':            return validateCondition(resource);
    case 'Consent':              return validateConsent(resource);
    default:
      return [];   // Unknown resource type — no validation rules defined
  }
}

/**
 * Returns true if all resources in the array pass validation (no errors).
 * Warnings are non-blocking.
 */
export function isValid(resource: Record<string, unknown>): boolean {
  return validateResource(resource).every((i) => i.severity !== 'error');
}

/**
 * Build a FHIR OperationOutcome from validation issues.
 * Returned as a 422 response body when validation fails.
 */
export function buildOperationOutcome(
  issues: FhirValidationIssue[],
): object {
  return {
    resourceType: 'OperationOutcome',
    issue: issues.map((i) => ({
      severity:    i.severity,
      code:        i.code,
      details:     { text: i.detail },
      ...(i.expression && { expression: [i.expression] }),
    })),
  };
}
