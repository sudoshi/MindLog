// =============================================================================
// MindLog API — CDA R2 Handover Document Generator
//
// Generates a HL7 Clinical Document Architecture (CDA) Release 2 XML document
// for patient handover (cover clinician transitions).
//
// Spec: HL7 CDA R2 — http://www.hl7.org/implement/standards/product_brief.cfm?product_id=7
// Profile: C-CDA 2.1 Continuity of Care Document (CCD)
//
// HIPAA: document contains PHI.  Must only be served over TLS to authorised
// clinicians.  Generated files are stored in the private 'reports' bucket.
//
// Sections implemented:
//   1. Allergies and Intolerances  (placeholder — not tracked in v1)
//   2. Medications                 (patient_medications)
//   3. Problems / Diagnoses        (omop_assignments + patients.diagnosis)
//   4. Results (Observations)      (daily_entries — last 30 days mood/sleep)
//   5. Vital Signs                 (daily_entries — last 30 days)
//   6. Assessment Scales           (validated_assessments — last 90 days)
//   7. Plan of Treatment           (crisis_safety_plan if present)
//   8. Social History              (substance use from daily_entries)
// =============================================================================

import { sql } from '@mindlog/db';

// ---------------------------------------------------------------------------
// Input type
// ---------------------------------------------------------------------------

export interface CdaInput {
  patientId:   string;
  clinicianId: string;
  periodStart: string;   // YYYY-MM-DD
  periodEnd:   string;   // YYYY-MM-DD
  title?:      string;
}

// ---------------------------------------------------------------------------
// XML helpers
// ---------------------------------------------------------------------------

function esc(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function indent(xml: string, spaces = 2): string {
  let depth = 0;
  return xml
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('</')) depth = Math.max(0, depth - 1);
      const result = ' '.repeat(depth * spaces) + trimmed;
      if (!trimmed.startsWith('</') && !trimmed.endsWith('/>') && trimmed.startsWith('<') && !trimmed.includes('</'))
        depth++;
      return result;
    })
    .join('\n');
}

// ---------------------------------------------------------------------------
// DB rows
// ---------------------------------------------------------------------------

interface PatientCdaRow {
  id: string;
  mrn: string;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  gender: string | null;
  phone: string | null;
  email: string | null;
  diagnosis: string | null;
}

interface ClinicianCdaRow {
  first_name: string;
  last_name: string;
  title: string | null;
  npi: string | null;
  email: string;
  organisation_name: string;
}

interface MedCdaRow {
  medication_name: string;
  generic_name: string | null;
  rxnorm_code: string | null;
  dose_value: number | null;
  dose_unit: string | null;
  frequency: string;
  prescribed_at: string | null;
  discontinued_at: string | null;
}

interface EntryRow {
  entry_date: string;
  mood: number | null;
  sleep_hours: number | null;
  exercise_minutes: number | null;
  suicidal_ideation: number | null;
  substance_use: string | null;
  notes: string | null;
}

interface AssessmentCdaRow {
  scale_code: string;
  total_score: number;
  severity_label: string | null;
  assessed_at: string;
}

interface SafetyPlanCdaRow {
  warning_signs: string[];
  internal_coping_strategies: string[];
  crisis_line_phone: string;
  crisis_line_name: string;
  means_restriction_notes: string | null;
}

// ---------------------------------------------------------------------------
// CDA section builders
// ---------------------------------------------------------------------------

function buildMedicationsSection(meds: MedCdaRow[]): string {
  if (meds.length === 0) {
    return `<component><section>
      <templateId root="2.16.840.1.113883.10.20.22.2.1.1"/>
      <code code="10160-0" codeSystem="2.16.840.1.113883.6.1" displayName="History of Medication Use"/>
      <title>Medications</title>
      <text><paragraph>No medications recorded.</paragraph></text>
    </section></component>`;
  }

  const rows = meds
    .map((m) => {
      const status = m.discontinued_at ? 'Discontinued' : 'Active';
      const dose   = m.dose_value != null ? `${m.dose_value} ${esc(m.dose_unit ?? '')}` : 'As directed';
      return `<tr>
        <td>${esc(m.medication_name)}</td>
        <td>${dose}</td>
        <td>${esc(m.frequency.replace(/_/g, ' '))}</td>
        <td>${status}</td>
        <td>${m.prescribed_at ? m.prescribed_at.split('T')[0]! : 'Unknown'}</td>
      </tr>`;
    })
    .join('');

  return `<component><section>
    <templateId root="2.16.840.1.113883.10.20.22.2.1.1"/>
    <code code="10160-0" codeSystem="2.16.840.1.113883.6.1" displayName="History of Medication Use"/>
    <title>Medications</title>
    <text>
      <table border="1" width="100%">
        <thead><tr><th>Medication</th><th>Dose</th><th>Frequency</th><th>Status</th><th>Start Date</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </text>
    ${meds
      .filter((m) => !m.discontinued_at)
      .map(
        (m) => `<entry typeCode="DRIV">
        <substanceAdministration classCode="SBADM" moodCode="EVN">
          <templateId root="2.16.840.1.113883.10.20.22.4.16"/>
          <statusCode code="active"/>
          <consumable><manufacturedProduct>
            <templateId root="2.16.840.1.113883.10.20.22.4.23"/>
            <manufacturedMaterial>
              <code ${m.rxnorm_code ? `code="${esc(m.rxnorm_code)}" codeSystem="2.16.840.1.113883.6.88" codeSystemName="RxNorm"` : `nullFlavor="UNK"`}
                    displayName="${esc(m.medication_name)}"/>
            </manufacturedMaterial>
          </manufacturedProduct></consumable>
        </substanceAdministration>
      </entry>`,
      )
      .join('')}
  </section></component>`;
}

function buildProblemsSection(diagnosis: string | null): string {
  const text = diagnosis ?? 'No active diagnoses recorded in MindLog.';
  return `<component><section>
    <templateId root="2.16.840.1.113883.10.20.22.2.5.1"/>
    <code code="11450-4" codeSystem="2.16.840.1.113883.6.1" displayName="Problem List"/>
    <title>Problems</title>
    <text><paragraph>${esc(text)}</paragraph></text>
  </section></component>`;
}

function buildResultsSection(entries: EntryRow[]): string {
  if (entries.length === 0) {
    return `<component><section>
      <templateId root="2.16.840.1.113883.10.20.22.2.3.1"/>
      <code code="30954-2" codeSystem="2.16.840.1.113883.6.1" displayName="Relevant diagnostic tests and/or laboratory data"/>
      <title>Check-in Observations</title>
      <text><paragraph>No check-in data in the selected period.</paragraph></text>
    </section></component>`;
  }

  const rows = entries
    .map((e) => `<tr>
      <td>${esc(e.entry_date)}</td>
      <td>${e.mood ?? '—'}</td>
      <td>${e.sleep_hours ?? '—'}</td>
      <td>${e.exercise_minutes ?? '—'}</td>
      <td>${e.suicidal_ideation ?? '—'}</td>
    </tr>`)
    .join('');

  return `<component><section>
    <templateId root="2.16.840.1.113883.10.20.22.2.3.1"/>
    <code code="30954-2" codeSystem="2.16.840.1.113883.6.1" displayName="Relevant diagnostic tests and/or laboratory data"/>
    <title>Check-in Observations</title>
    <text>
      <table border="1" width="100%">
        <thead><tr><th>Date</th><th>Mood (1-10)</th><th>Sleep (h)</th><th>Exercise (min)</th><th>SI Screener (0-3)</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </text>
  </section></component>`;
}

function buildAssessmentsSection(assessments: AssessmentCdaRow[]): string {
  if (assessments.length === 0) {
    return `<component><section>
      <code code="8716-3" codeSystem="2.16.840.1.113883.6.1" displayName="Vital signs"/>
      <title>Clinical Assessments</title>
      <text><paragraph>No validated assessments in the selected period.</paragraph></text>
    </section></component>`;
  }

  const rows = assessments
    .map((a) => `<tr>
      <td>${esc(a.scale_code)}</td>
      <td>${a.total_score}</td>
      <td>${esc(a.severity_label ?? '—')}</td>
      <td>${a.assessed_at.split('T')[0]}</td>
    </tr>`)
    .join('');

  return `<component><section>
    <code code="8716-3" codeSystem="2.16.840.1.113883.6.1" displayName="Vital signs"/>
    <title>Clinical Assessments</title>
    <text>
      <table border="1" width="100%">
        <thead><tr><th>Scale</th><th>Total Score</th><th>Severity</th><th>Date</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </text>
  </section></component>`;
}

function buildSafetyPlanSection(plan: SafetyPlanCdaRow | null): string {
  if (!plan) {
    return `<component><section>
      <code code="18776-5" codeSystem="2.16.840.1.113883.6.1" displayName="Plan of treatment"/>
      <title>Crisis Safety Plan</title>
      <text><paragraph>No crisis safety plan on file.</paragraph></text>
    </section></component>`;
  }

  const warningSigns = plan.warning_signs.map((w) => `<item>${esc(w)}</item>`).join('');
  const copingStrats = plan.internal_coping_strategies.map((c) => `<item>${esc(c)}</item>`).join('');

  return `<component><section>
    <code code="18776-5" codeSystem="2.16.840.1.113883.6.1" displayName="Plan of treatment"/>
    <title>Crisis Safety Plan</title>
    <text>
      <paragraph><b>Warning Signs:</b></paragraph>
      <list listType="ordered">${warningSigns || '<item>None specified</item>'}</list>
      <paragraph><b>Internal Coping Strategies:</b></paragraph>
      <list listType="ordered">${copingStrats || '<item>None specified</item>'}</list>
      ${plan.means_restriction_notes ? `<paragraph><b>Means Restriction:</b> ${esc(plan.means_restriction_notes)}</paragraph>` : ''}
      <paragraph><b>Crisis Line:</b> ${esc(plan.crisis_line_name)} — ${esc(plan.crisis_line_phone)}</paragraph>
    </text>
  </section></component>`;
}

function buildSocialHistorySection(entries: EntryRow[]): string {
  const substanceEntries = entries.filter((e) => e.substance_use && e.substance_use !== 'none');
  const text = substanceEntries.length > 0
    ? substanceEntries
        .map((e) => `${e.entry_date}: ${e.substance_use}`)
        .join('; ')
    : 'No substance use recorded in the selected period.';

  return `<component><section>
    <templateId root="2.16.840.1.113883.10.20.22.2.17"/>
    <code code="29762-2" codeSystem="2.16.840.1.113883.6.1" displayName="Social History"/>
    <title>Social History</title>
    <text><paragraph>${esc(text)}</paragraph></text>
  </section></component>`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a CDA R2 XML string for the given patient + period.
 * Returns the raw XML — caller is responsible for writing to storage.
 */
export async function generateCda(input: CdaInput): Promise<string> {
  const { patientId, clinicianId, periodStart, periodEnd } = input;

  // Fetch all data in parallel
  const [patientRows, clinicianRows, medRows, entryRows, assessmentRows, safetyPlanRows] =
    await Promise.all([
      sql<PatientCdaRow[]>`
        SELECT p.id, p.mrn, p.first_name, p.last_name, p.date_of_birth,
               p.gender, p.phone, p.email, p.diagnosis
        FROM patients p WHERE p.id = ${patientId}::UUID LIMIT 1
      `,
      sql<ClinicianCdaRow[]>`
        SELECT c.first_name, c.last_name, c.title, c.npi, c.email,
               o.name AS organisation_name
        FROM clinicians c
        JOIN organisations o ON o.id = c.organisation_id
        WHERE c.id = ${clinicianId}::UUID LIMIT 1
      `,
      sql<MedCdaRow[]>`
        SELECT pm.medication_name, pm.generic_name, mc.rxnorm_code,
               pm.dose_value, pm.dose_unit, pm.frequency,
               pm.prescribed_at, pm.discontinued_at
        FROM patient_medications pm
        LEFT JOIN medication_catalogue mc ON mc.id = pm.catalogue_id
        WHERE pm.patient_id  = ${patientId}::UUID
          AND pm.show_in_app = TRUE
        ORDER BY pm.prescribed_at DESC NULLS LAST
      `,
      sql<EntryRow[]>`
        SELECT entry_date, mood, sleep_hours, exercise_minutes,
               suicidal_ideation, substance_use, notes
        FROM daily_entries
        WHERE patient_id   = ${patientId}::UUID
          AND entry_date  >= ${periodStart}::DATE
          AND entry_date  <= ${periodEnd}::DATE
          AND submitted_at IS NOT NULL
        ORDER BY entry_date DESC
      `,
      sql<AssessmentCdaRow[]>`
        SELECT scale_code, total_score, severity_label, assessed_at
        FROM validated_assessments
        WHERE patient_id   = ${patientId}::UUID
          AND assessed_at >= ${periodStart}::DATE
          AND assessed_at <= ${periodEnd}::DATE
        ORDER BY assessed_at DESC
      `,
      sql<SafetyPlanCdaRow[]>`
        SELECT warning_signs, internal_coping_strategies,
               crisis_line_phone, crisis_line_name,
               means_restriction_notes
        FROM crisis_safety_plans
        WHERE patient_id = ${patientId}::UUID AND is_active = TRUE
        LIMIT 1
      `,
    ]);

  const patient  = patientRows[0];
  const clinician = clinicianRows[0];
  if (!patient || !clinician) {
    throw new Error('Patient or clinician not found');
  }

  const docId      = crypto.randomUUID();
  const createdAt  = new Date().toISOString().replace('T', 'T').split('.')[0]! + '+00:00';
  const docTitle   = input.title ?? `MindLog Handover — ${patient.first_name} ${patient.last_name}`;

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet type="text/xsl" href="CDA.xsl"?>
<ClinicalDocument
  xmlns="urn:hl7-org:v3"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:voc="urn:hl7-org:v3/voc"
  xsi:schemaLocation="urn:hl7-org:v3 CDA.xsd">
<typeId root="2.16.840.1.113883.1.3" extension="POCD_HD000040"/>
<templateId root="2.16.840.1.113883.10.20.22.1.2"/>
<id root="2.16.840.1.113883.4.6" extension="${docId}"/>
<code code="34133-9" codeSystem="2.16.840.1.113883.6.1"
      codeSystemName="LOINC" displayName="Summarization of Episode Note"/>
<title>${esc(docTitle)}</title>
<effectiveTime value="${createdAt}"/>
<confidentialityCode code="N" codeSystem="2.16.840.1.113883.5.25"/>
<languageCode code="en-US"/>

<!-- ── Record Target (Patient) ─────────────────────────── -->
<recordTarget>
  <patientRole>
    <id root="2.16.840.1.113883.4.6" extension="${esc(patient.mrn)}"/>
    <patient>
      <name use="L">
        <given>${esc(patient.first_name)}</given>
        <family>${esc(patient.last_name)}</family>
      </name>
      ${patient.gender ? `<administrativeGenderCode code="${patient.gender === 'male' ? 'M' : patient.gender === 'female' ? 'F' : 'UN'}" codeSystem="2.16.840.1.113883.5.1"/>` : ''}
      ${patient.date_of_birth ? `<birthTime value="${patient.date_of_birth.replace(/-/g, '')}"/>` : ''}
    </patient>
    ${patient.phone ? `<telecom value="tel:${esc(patient.phone)}" use="MC"/>` : ''}
    ${patient.email ? `<telecom value="mailto:${esc(patient.email)}"/>` : ''}
  </patientRole>
</recordTarget>

<!-- ── Author (Clinician) ──────────────────────────────── -->
<author>
  <time value="${createdAt}"/>
  <assignedAuthor>
    ${clinician.npi ? `<id root="2.16.840.1.113883.4.6" extension="${esc(clinician.npi)}"/>` : '<id nullFlavor="UNK"/>'}
    <assignedPerson>
      <name>
        ${clinician.title ? `<prefix>${esc(clinician.title)}</prefix>` : ''}
        <given>${esc(clinician.first_name)}</given>
        <family>${esc(clinician.last_name)}</family>
      </name>
    </assignedPerson>
    <representedOrganization>
      <name>${esc(clinician.organisation_name)}</name>
    </representedOrganization>
  </assignedAuthor>
</author>

<!-- ── Document Body ──────────────────────────────────── -->
<component><structuredBody>
${buildProblemsSection(patient.diagnosis)}
${buildMedicationsSection(medRows)}
${buildResultsSection(entryRows)}
${buildAssessmentsSection(assessmentRows)}
${buildSafetyPlanSection(safetyPlanRows[0] ?? null)}
${buildSocialHistorySection(entryRows)}
</structuredBody></component>
</ClinicalDocument>`;

  return indent(xml);
}
