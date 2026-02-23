// =============================================================================
// MindLog API — FHIR R4 Mappers
//
// Pure functions: MindLog DB rows → FHIR R4 resources.
// No I/O.  All IDs use full FHIR resource references.
//
// FHIR base URL is injected via FHIR_BASE_URL env var (default: API base URL)
// so that absolute resource references resolve correctly.
//
// HIPAA: these mappers include PHI.  Resources must only be served over TLS
// to authorised clinicians (enforced in the route layer).
// =============================================================================

// ---------------------------------------------------------------------------
// Shared types (minimal — avoid heavy FHIR SDK dependency)
// ---------------------------------------------------------------------------

export interface FhirCoding {
  system: string;
  code: string;
  display?: string;
}

export interface FhirCodeableConcept {
  coding: FhirCoding[];
  text?: string;
}

export interface FhirReference {
  reference: string;
  display?: string;
}

export interface FhirMeta {
  profile?: string[];
  lastUpdated?: string;
  versionId?: string;
}

// ---------------------------------------------------------------------------
// DB row shapes
// ---------------------------------------------------------------------------

export interface PatientRow {
  id: string;
  mrn: string;
  first_name: string;
  last_name: string;
  preferred_name: string | null;
  date_of_birth: string;     // YYYY-MM-DD
  gender: string | null;
  phone: string | null;
  email: string | null;
  address_line1: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  diagnosis: string | null;
  status: string;
  organisation_id: string;
  updated_at: string;
}

export interface DailyEntryRow {
  id: string;
  patient_id: string;
  entry_date: string;         // YYYY-MM-DD
  mood: number | null;
  coping: number | null;
  sleep_hours: number | null;
  sleep_quality: number | null;
  exercise_minutes: number | null;
  anxiety_score: number | null;
  mania_score: number | null;
  anhedonia_score: number | null;
  suicidal_ideation: number | null;
  stress_score: number | null;
  notes: string | null;
  submitted_at: string | null;
}

export interface MedicationRow {
  id: string;
  patient_id: string;
  medication_name: string;
  generic_name: string | null;
  rxnorm_code: string | null;
  dose_value: number | null;
  dose_unit: string | null;
  frequency: string;
  prescribed_at: string | null;
  discontinued_at: string | null;
  prescriber_name: string | null;
  prescriber_npi: string | null;
  notes: string | null;
}

export interface AssessmentRow {
  id: string;
  patient_id: string;
  scale_code: string;
  total_score: number;
  responses: Record<string, number>;
  severity_label: string | null;
  assessed_at: string;
  assessed_by: string | null;     // clinician UUID or null for patient self-report
  clinician_name: string | null;
}

export interface DiagnosisRow {
  id: string;
  patient_id: string;
  icd10_code: string | null;
  snomed_code: string | null;
  description: string;
  onset_date: string | null;
  status: string;            // 'active' | 'resolved' | 'remission'
  recorded_by: string | null;
  recorded_at: string;
}

export interface ConsentRow {
  id: string;
  patient_id: string;
  consent_type: string;
  granted: boolean;
  granted_at: string | null;
  revoked_at: string | null;
  ip_address: string | null;
}

// ---------------------------------------------------------------------------
// FHIR system URIs
// ---------------------------------------------------------------------------

const SYSTEM = {
  MRN:       'urn:mindlog:mrn',
  NPI:       'http://hl7.org/fhir/sid/us-npi',
  RXNORM:    'http://www.nlm.nih.gov/research/umls/rxnorm',
  SNOMED:    'http://snomed.info/sct',
  ICD10:     'http://hl7.org/fhir/sid/icd-10-cm',
  LOINC:     'http://loinc.org',
  UCUM:      'http://unitsofmeasure.org',
  CONDITION_STATUS: 'http://terminology.hl7.org/CodeSystem/condition-clinical',
  V3_ADMIN_GENDER:  'http://hl7.org/fhir/administrative-gender',
  CONSENT_SCOPE:    'http://terminology.hl7.org/CodeSystem/consentscope',
  CONSENT_CATEGORY: 'http://loinc.org',
  CARE_PLAN_CATEGORY: 'http://terminology.hl7.org/CodeSystem/care-plan-category',
  MINDLOG:   'urn:mindlog:codes',
} as const;

// LOINC codes for daily check-in observations
const DAILY_ENTRY_LOINC: Record<string, { code: string; display: string; unit: string }> = {
  mood:              { code: '72828-7', display: 'Mood score', unit: '{score}' },
  coping:            { code: '72831-1', display: 'Coping effectiveness score', unit: '{score}' },
  sleep_hours:       { code: '65968-7', display: 'Sleep duration', unit: 'h' },
  sleep_quality:     { code: '72833-7', display: 'Sleep quality score', unit: '{score}' },
  exercise_minutes:  { code: '55423-8', display: 'Exercise duration', unit: 'min' },
  anxiety_score:     { code: '70274-6', display: 'Generalized anxiety score', unit: '{score}' },
  mania_score:       { code: '72832-9', display: 'Mania symptom score', unit: '{score}' },
  anhedonia_score:   { code: '44255-8', display: 'Loss of interest/pleasure score', unit: '{score}' },
  suicidal_ideation: { code: '44260-8', display: 'Suicidal ideation screen score', unit: '{score}' },
  stress_score:      { code: '72835-2', display: 'Perceived stress score', unit: '{score}' },
};

// LOINC codes for validated assessments
const ASSESSMENT_LOINC: Record<string, { code: string; display: string }> = {
  'PHQ-9':  { code: '44249-1', display: 'PHQ-9 quick depression assessment panel' },
  'PHQ-2':  { code: '55757-9', display: 'PHQ-2 depression screening' },
  'GAD-7':  { code: '69737-5', display: 'GAD-7 anxiety severity scale' },
  'GAD-2':  { code: '69725-0', display: 'GAD-2 anxiety screening' },
  'ASRM':   { code: '96842-6', display: 'Altman Self-Rating Mania Scale' },
  'C-SSRS': { code: '96844-2', display: 'Columbia Suicide Severity Rating Scale' },
  'AUDIT':  { code: '75626-2', display: 'AUDIT alcohol use disorder screening' },
  'AUDIT-C':{ code: '72109-2', display: 'AUDIT-C alcohol use disorder screening' },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fhirRef(resourceType: string, id: string, baseUrl: string): string {
  return `${baseUrl}/${resourceType}/${id}`;
}

function genderCode(gender: string | null): string {
  switch (gender?.toLowerCase()) {
    case 'male':   return 'male';
    case 'female': return 'female';
    case 'other':  return 'other';
    default:       return 'unknown';
  }
}

function frequencyToFhir(frequency: string): { code: string; display: string; period: number; periodUnit: string } {
  switch (frequency) {
    case 'once_daily_morning':
    case 'once_daily_evening':
    case 'once_daily_bedtime':
      return { code: 'QD', display: 'Once daily', period: 1, periodUnit: 'd' };
    case 'twice_daily':
      return { code: 'BID', display: 'Twice daily', period: 1, periodUnit: 'd' };
    case 'three_times_daily':
      return { code: 'TID', display: 'Three times daily', period: 1, periodUnit: 'd' };
    case 'weekly':
      return { code: 'QW', display: 'Once weekly', period: 1, periodUnit: 'wk' };
    case 'as_needed':
      return { code: 'PRN', display: 'As needed', period: 1, periodUnit: 'd' };
    default:
      return { code: 'QD', display: frequency, period: 1, periodUnit: 'd' };
  }
}

// ---------------------------------------------------------------------------
// FHIR Patient mapper
// ---------------------------------------------------------------------------

export function mapPatient(row: PatientRow, baseUrl: string): object {
  return {
    resourceType: 'Patient',
    id: row.id,
    meta: {
      lastUpdated: row.updated_at,
      profile: ['http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient'],
    } satisfies FhirMeta,
    identifier: [
      {
        use: 'usual',
        type: {
          coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0203', code: 'MR', display: 'Medical record number' }],
        },
        system: SYSTEM.MRN,
        value: row.mrn,
      },
    ],
    name: [
      {
        use: 'official',
        family: row.last_name,
        given: row.preferred_name
          ? [row.first_name, row.preferred_name]
          : [row.first_name],
      },
    ],
    ...(row.gender   && { gender: genderCode(row.gender) }),
    ...(row.date_of_birth && { birthDate: row.date_of_birth }),
    ...(row.phone && {
      telecom: [
        { system: 'phone', value: row.phone, use: 'mobile' },
        ...(row.email ? [{ system: 'email', value: row.email }] : []),
      ],
    }),
    ...(!row.phone && row.email && {
      telecom: [{ system: 'email', value: row.email }],
    }),
    ...(row.address_line1 && {
      address: [{
        use: 'home',
        line: [row.address_line1],
        city: row.city ?? undefined,
        state: row.state ?? undefined,
        postalCode: row.postal_code ?? undefined,
        country: 'US',
      }],
    }),
    managingOrganization: {
      reference: fhirRef('Organization', row.organisation_id, baseUrl),
    },
    extension: [
      {
        url: 'urn:mindlog:patient-status',
        valueCode: row.status,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// FHIR Observation (daily entry fields)
// ---------------------------------------------------------------------------

export function mapDailyEntryObservations(
  row: DailyEntryRow,
  baseUrl: string,
): object[] {
  const observations: object[] = [];
  const effectiveDate = `${row.entry_date}T00:00:00Z`;
  const subject: FhirReference = { reference: fhirRef('Patient', row.patient_id, baseUrl) };

  const fields = [
    'mood', 'coping', 'sleep_hours', 'sleep_quality', 'exercise_minutes',
    'anxiety_score', 'mania_score', 'anhedonia_score', 'suicidal_ideation', 'stress_score',
  ] as const;

  for (const field of fields) {
    const value = row[field];
    if (value == null) continue;

    const loinc = DAILY_ENTRY_LOINC[field];
    if (!loinc) continue;

    observations.push({
      resourceType: 'Observation',
      id: `${row.id}-${field}`,
      meta: {
        profile: ['http://hl7.org/fhir/StructureDefinition/Observation'],
      },
      status: row.submitted_at ? 'final' : 'preliminary',
      category: [{
        coding: [{
          system: 'http://terminology.hl7.org/CodeSystem/observation-category',
          code: 'survey',
          display: 'Survey',
        }],
      }],
      code: {
        coding: [{ system: SYSTEM.LOINC, code: loinc.code, display: loinc.display }],
        text: loinc.display,
      },
      subject,
      effectiveDateTime: effectiveDate,
      valueQuantity: {
        value,
        unit: loinc.unit,
        system: SYSTEM.UCUM,
        code: loinc.unit,
      },
      ...(row.submitted_at && { issued: row.submitted_at }),
    });
  }

  // Free-text notes → Observation with valueString
  if (row.notes) {
    observations.push({
      resourceType: 'Observation',
      id: `${row.id}-notes`,
      status: 'final',
      category: [{
        coding: [{
          system: 'http://terminology.hl7.org/CodeSystem/observation-category',
          code: 'survey',
          display: 'Survey',
        }],
      }],
      code: {
        coding: [{ system: SYSTEM.LOINC, code: '48767-8', display: 'Annotation comment' }],
        text: 'Check-in notes',
      },
      subject,
      effectiveDateTime: effectiveDate,
      valueString: row.notes,
    });
  }

  return observations;
}

// ---------------------------------------------------------------------------
// FHIR MedicationRequest
// ---------------------------------------------------------------------------

export function mapMedicationRequest(row: MedicationRow, baseUrl: string): object {
  const freq = frequencyToFhir(row.frequency);
  const isActive = !row.discontinued_at;

  return {
    resourceType: 'MedicationRequest',
    id: row.id,
    status: isActive ? 'active' : 'stopped',
    intent: 'order',
    medicationCodeableConcept: {
      coding: [
        ...(row.rxnorm_code
          ? [{ system: SYSTEM.RXNORM, code: row.rxnorm_code, display: row.generic_name ?? row.medication_name }]
          : []),
        { system: SYSTEM.MINDLOG, code: row.medication_name },
      ],
      text: row.medication_name,
    },
    subject: { reference: fhirRef('Patient', row.patient_id, baseUrl) },
    ...(row.prescribed_at && { authoredOn: row.prescribed_at }),
    ...(row.prescriber_name && {
      requester: {
        display: row.prescriber_name,
        ...(row.prescriber_npi && {
          identifier: { system: SYSTEM.NPI, value: row.prescriber_npi },
        }),
      },
    }),
    dosageInstruction: [
      {
        timing: {
          code: {
            coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-GTSAbbreviation', code: freq.code, display: freq.display }],
          },
          repeat: {
            frequency: freq.code === 'BID' ? 2 : freq.code === 'TID' ? 3 : 1,
            period: freq.period,
            periodUnit: freq.periodUnit,
          },
        },
        ...(row.dose_value != null && row.dose_unit && {
          doseAndRate: [{
            type: {
              coding: [{ system: 'http://terminology.hl7.org/CodeSystem/dose-rate-type', code: 'ordered' }],
            },
            doseQuantity: {
              value: row.dose_value,
              unit: row.dose_unit,
              system: SYSTEM.UCUM,
              code: row.dose_unit,
            },
          }],
        }),
        ...(row.notes && { patientInstruction: row.notes }),
      },
    ],
    ...(row.discontinued_at && {
      dispenseRequest: {
        validityPeriod: { end: row.discontinued_at },
      },
    }),
  };
}

// ---------------------------------------------------------------------------
// FHIR QuestionnaireResponse (validated assessments)
// ---------------------------------------------------------------------------

export function mapQuestionnaireResponse(row: AssessmentRow, baseUrl: string): object {
  const loinc = ASSESSMENT_LOINC[row.scale_code];
  const items = Object.entries(row.responses ?? {}).map(([key, val]) => ({
    linkId: key,
    answer: [{ valueInteger: val }],
  }));

  return {
    resourceType: 'QuestionnaireResponse',
    id: row.id,
    questionnaire: loinc
      ? `http://loinc.org/q/${loinc.code}`
      : `urn:mindlog:assessment:${row.scale_code.toLowerCase()}`,
    status: 'completed',
    subject: { reference: fhirRef('Patient', row.patient_id, baseUrl) },
    authored: row.assessed_at,
    ...(row.assessed_by && {
      author: { reference: fhirRef('Practitioner', row.assessed_by, baseUrl) },
    }),
    item: [
      ...items,
      // Total score as a summary item
      {
        linkId: 'total-score',
        text: `${row.scale_code} total score`,
        answer: [{ valueInteger: row.total_score }],
      },
      ...(row.severity_label ? [{
        linkId: 'severity',
        text: 'Severity interpretation',
        answer: [{ valueString: row.severity_label }],
      }] : []),
    ],
    extension: [
      {
        url: 'urn:mindlog:scale-code',
        valueCode: row.scale_code,
      },
      ...(loinc ? [{
        url: 'urn:mindlog:loinc-code',
        valueCode: loinc.code,
      }] : []),
    ],
  };
}

// ---------------------------------------------------------------------------
// FHIR Condition (diagnoses)
// ---------------------------------------------------------------------------

export function mapCondition(row: DiagnosisRow, baseUrl: string): object {
  return {
    resourceType: 'Condition',
    id: row.id,
    clinicalStatus: {
      coding: [{
        system: SYSTEM.CONDITION_STATUS,
        code: row.status === 'active' ? 'active'
            : row.status === 'resolved' ? 'resolved'
            : 'remission',
      }],
    },
    verificationStatus: {
      coding: [{
        system: 'http://terminology.hl7.org/CodeSystem/condition-ver-status',
        code: 'confirmed',
      }],
    },
    category: [{
      coding: [{
        system: 'http://terminology.hl7.org/CodeSystem/condition-category',
        code: 'encounter-diagnosis',
        display: 'Encounter Diagnosis',
      }],
    }],
    code: {
      coding: [
        ...(row.icd10_code  ? [{ system: SYSTEM.ICD10,  code: row.icd10_code,  display: row.description }] : []),
        ...(row.snomed_code ? [{ system: SYSTEM.SNOMED, code: row.snomed_code, display: row.description }] : []),
      ],
      text: row.description,
    },
    subject: { reference: fhirRef('Patient', row.patient_id, baseUrl) },
    ...(row.onset_date && { onsetDateTime: row.onset_date }),
    ...(row.recorded_at && { recordedDate: row.recorded_at }),
    ...(row.recorded_by && {
      recorder: { reference: fhirRef('Practitioner', row.recorded_by, baseUrl) },
    }),
  };
}

// ---------------------------------------------------------------------------
// FHIR Consent (MindLog consent records → FHIR Consent)
// ---------------------------------------------------------------------------

const CONSENT_TYPE_MAP: Record<string, { scope: string; category: string; categoryDisplay: string }> = {
  terms_of_service: { scope: 'patient-privacy', category: '59284-0', categoryDisplay: 'Consent document' },
  privacy_policy:   { scope: 'patient-privacy', category: '57016-8', categoryDisplay: 'Privacy policy acknowledgement document' },
  data_research:    { scope: 'research',         category: '77602-8', categoryDisplay: 'Research consent' },
  ai_insights:      { scope: 'patient-privacy', category: '59284-0', categoryDisplay: 'AI-assisted care consent' },
};

export function mapConsent(row: ConsentRow, baseUrl: string): object {
  const typeInfo = CONSENT_TYPE_MAP[row.consent_type] ?? {
    scope: 'patient-privacy', category: '59284-0', categoryDisplay: 'Consent document',
  };

  return {
    resourceType: 'Consent',
    id: row.id,
    status: row.granted && !row.revoked_at ? 'active' : 'rejected',
    scope: {
      coding: [{
        system: SYSTEM.CONSENT_SCOPE,
        code: typeInfo.scope,
      }],
    },
    category: [{
      coding: [{
        system: SYSTEM.CONSENT_CATEGORY,
        code: typeInfo.category,
        display: typeInfo.categoryDisplay,
      }],
    }],
    patient: { reference: fhirRef('Patient', row.patient_id, baseUrl) },
    ...(row.granted_at && { dateTime: row.granted_at }),
    provision: {
      type: row.granted ? 'permit' : 'deny',
    },
    extension: [
      { url: 'urn:mindlog:consent-type', valueCode: row.consent_type },
      ...(row.revoked_at ? [{ url: 'urn:mindlog:revoked-at', valueDateTime: row.revoked_at }] : []),
    ],
  };
}

// ---------------------------------------------------------------------------
// FHIR Bundle builder
// ---------------------------------------------------------------------------

export interface BundleOptions {
  type: 'searchset' | 'collection' | 'document';
  total?: number;
  selfUrl?: string;
  nextUrl?: string;
}

export function mapBundle(
  entries: object[],
  opts: BundleOptions,
): object {
  return {
    resourceType: 'Bundle',
    id: crypto.randomUUID(),
    meta: {
      lastUpdated: new Date().toISOString(),
    },
    type: opts.type,
    ...(opts.total !== undefined && { total: opts.total }),
    link: [
      ...(opts.selfUrl ? [{ relation: 'self', url: opts.selfUrl }] : []),
      ...(opts.nextUrl ? [{ relation: 'next', url: opts.nextUrl }] : []),
    ],
    entry: entries.map((resource) => ({
      fullUrl: `urn:uuid:${(resource as Record<string, string>)['id'] ?? crypto.randomUUID()}`,
      resource,
      search: opts.type === 'searchset' ? { mode: 'match' } : undefined,
    })),
  };
}

// ---------------------------------------------------------------------------
// FHIR CapabilityStatement (metadata endpoint)
// ---------------------------------------------------------------------------

export function buildCapabilityStatement(baseUrl: string): object {
  return {
    resourceType: 'CapabilityStatement',
    id: 'mindlog-capabilities',
    url: `${baseUrl}/fhir/metadata`,
    version: '4.0.1',
    name: 'MindLogFHIRCapabilities',
    title: 'MindLog FHIR R4 Capability Statement',
    status: 'active',
    date: '2026-02-01',
    publisher: 'MindLog Health',
    description: 'FHIR R4 capability statement for the MindLog clinical monitoring platform. Supports read-only access to patient data for EHR integration.',
    kind: 'instance',
    fhirVersion: '4.0.1',
    format: ['application/fhir+json'],
    rest: [{
      mode: 'server',
      security: {
        cors: true,
        service: [{
          coding: [{
            system: 'http://terminology.hl7.org/CodeSystem/restful-security-service',
            code: 'SMART-on-FHIR',
          }],
        }],
        description: 'JWT bearer token authentication. Token must include clinician role claim.',
      },
      resource: [
        {
          type: 'Patient',
          interaction: [{ code: 'read' }, { code: 'search-type' }],
          searchParam: [{ name: '_id', type: 'token' }],
          operation: [{ name: 'everything', definition: 'http://hl7.org/fhir/OperationDefinition/Patient-everything' }],
        },
        {
          type: 'Observation',
          interaction: [{ code: 'search-type' }],
          searchParam: [
            { name: 'patient', type: 'reference' },
            { name: 'date', type: 'date' },
            { name: 'code', type: 'token' },
          ],
        },
        {
          type: 'MedicationRequest',
          interaction: [{ code: 'search-type' }],
          searchParam: [{ name: 'patient', type: 'reference' }, { name: 'status', type: 'token' }],
        },
        {
          type: 'QuestionnaireResponse',
          interaction: [{ code: 'search-type' }],
          searchParam: [{ name: 'patient', type: 'reference' }, { name: 'questionnaire', type: 'reference' }],
        },
        {
          type: 'Condition',
          interaction: [{ code: 'search-type' }],
          searchParam: [{ name: 'patient', type: 'reference' }, { name: 'clinical-status', type: 'token' }],
        },
        {
          type: 'CarePlan',
          interaction: [{ code: 'search-type' }],
          searchParam: [{ name: 'patient', type: 'reference' }],
        },
        {
          type: 'Consent',
          interaction: [{ code: 'search-type' }],
          searchParam: [{ name: 'patient', type: 'reference' }],
        },
      ],
    }],
  };
}
