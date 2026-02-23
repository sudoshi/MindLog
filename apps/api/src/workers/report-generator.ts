// =============================================================================
// MindLog API — Report generation worker
// BullMQ Worker: fetches patient data → renders HTML → Puppeteer PDF
//               → uploads to Supabase Storage → notifies clinician.
//
// HIPAA notes:
//   - PDFs stored in a private Supabase Storage bucket ('reports').
//   - Download links are presigned (7-day expiry) generated on-demand.
//   - No PHI transmitted outside Supabase/Resend without BAA.
//   - Bucket must be created manually in Supabase dashboard:
//       Name: reports  |  Public: NO  |  RLS: disabled (service role only)
// =============================================================================

import { Worker, Queue, type Job } from 'bullmq';
import { sql } from '@mindlog/db';
import { config } from '../config.js';
import { connection } from './rules-engine.js';

// ---------------------------------------------------------------------------
// Queue
// ---------------------------------------------------------------------------

export const REPORT_QUEUE_NAME = 'mindlog-reports';
export const reportQueue = new Queue(REPORT_QUEUE_NAME, { connection });

// ---------------------------------------------------------------------------
// Job data shape
// ---------------------------------------------------------------------------

export interface ReportJobData {
  reportId: string;
  patientId?: string;
  clinicianId: string;
  orgId: string;
  reportType: 'weekly_summary' | 'monthly_summary' | 'clinical_export' | 'cda_handover';
  periodStart: string; // YYYY-MM-DD
  periodEnd: string;   // YYYY-MM-DD
  title: string;
}

// ---------------------------------------------------------------------------
// DB query result shapes
// ---------------------------------------------------------------------------

interface PatientRow {
  id: string;
  first_name: string;
  last_name: string;
  mrn: string;
  date_of_birth: string;
  gender: string | null;
  diagnosis: string | null;
  risk_level: string | null;
  status: string;
}

interface ClinicianRow {
  first_name: string;
  last_name: string;
  email: string;
  push_token: string | null;
  alert_push_enabled: boolean;
  alert_email_enabled: boolean;
}

interface DailyEntryRow {
  entry_date: string;
  mood: number | null;
  coping: number | null;
  sleep_hours: number | null;
  sleep_minutes: number | null;
  exercise_minutes: number | null;
  submitted_at: string | null;
  notes: string | null;
}

interface AlertRow {
  created_at: string;
  severity: string;
  title: string;
  rule_key: string;
  status: string;
}

interface MedRow {
  name: string;
  dosage: string | null;
  frequency: string;
  total_doses: number;
  taken_doses: number;
}

interface NoteRow {
  created_at: string;
  note_type: string;
  body: string;
  clinician_first: string;
  clinician_last: string;
}

interface JournalRow {
  created_at: string;
  title: string | null;
  mood_at_writing: number | null;
}

// ---------------------------------------------------------------------------
// Data fetch
// ---------------------------------------------------------------------------

type ReportJobDataWithPatient = ReportJobData & { patientId: string };

async function fetchReportData(job: ReportJobDataWithPatient) {
  const { patientId, clinicianId, periodStart, periodEnd } = job;

  const [patient, clinician, entries, alerts, meds, notes, journals] = await Promise.all([
    // Patient demographics
    sql<PatientRow[]>`
      SELECT id, first_name, last_name, mrn, date_of_birth, gender,
             diagnosis, risk_level, status
      FROM patients WHERE id = ${patientId} LIMIT 1
    `,

    // Clinician info + notification prefs
    sql<ClinicianRow[]>`
      SELECT c.first_name, c.last_name, u.email,
             np.push_token,
             COALESCE(np.alert_push_enabled, TRUE)  AS alert_push_enabled,
             COALESCE(np.alert_email_enabled, TRUE) AS alert_email_enabled
      FROM clinicians c
      JOIN users u ON u.id = c.user_id
      LEFT JOIN notification_prefs np ON np.user_id = u.id
      WHERE c.id = ${clinicianId} LIMIT 1
    `,

    // Daily entries in range (with sleep + exercise via joins)
    sql<DailyEntryRow[]>`
      SELECT
        de.entry_date,
        de.mood,
        de.coping,
        sl.hours  AS sleep_hours,
        sl.minutes AS sleep_minutes,
        el.duration_minutes AS exercise_minutes,
        de.submitted_at,
        de.notes
      FROM daily_entries de
      LEFT JOIN sleep_logs sl ON sl.daily_entry_id = de.id
      LEFT JOIN exercise_logs el ON el.daily_entry_id = de.id
      WHERE de.patient_id = ${patientId}
        AND de.entry_date BETWEEN ${periodStart}::DATE AND ${periodEnd}::DATE
      ORDER BY de.entry_date ASC
    `,

    // Clinical alerts in range
    sql<AlertRow[]>`
      SELECT created_at, severity, title, rule_key, status
      FROM clinical_alerts
      WHERE patient_id = ${patientId}
        AND created_at::DATE BETWEEN ${periodStart}::DATE AND ${periodEnd}::DATE
      ORDER BY created_at DESC
      LIMIT 20
    `,

    // Medications + adherence for the period
    sql<MedRow[]>`
      SELECT
        ms.name, ms.dosage, ms.frequency,
        COUNT(ml.id)                               AS total_doses,
        COUNT(ml.id) FILTER (WHERE ml.taken = TRUE) AS taken_doses
      FROM medication_schedules ms
      LEFT JOIN medication_logs ml
        ON ml.medication_id = ms.id
        AND ml.logged_date BETWEEN ${periodStart}::DATE AND ${periodEnd}::DATE
      WHERE ms.patient_id = ${patientId}
        AND ms.is_active = TRUE
      GROUP BY ms.id, ms.name, ms.dosage, ms.frequency
    `,

    // Clinician notes on this patient in range (non-private only for report)
    sql<NoteRow[]>`
      SELECT cn.created_at, cn.note_type, cn.body,
             c.first_name AS clinician_first, c.last_name AS clinician_last
      FROM clinician_notes cn
      JOIN clinicians c ON c.id = cn.clinician_id
      WHERE cn.patient_id = ${patientId}
        AND cn.deleted_at IS NULL
        AND cn.is_private = FALSE
        AND cn.created_at::DATE BETWEEN ${periodStart}::DATE AND ${periodEnd}::DATE
      ORDER BY cn.created_at DESC
      LIMIT 10
    `,

    // Shared journal entries (titles only — bodies omitted; clinician reads separately)
    sql<JournalRow[]>`
      SELECT created_at, title, mood_at_writing
      FROM journal_entries
      WHERE patient_id = ${patientId}
        AND is_shared_with_care_team = TRUE
        AND created_at::DATE BETWEEN ${periodStart}::DATE AND ${periodEnd}::DATE
      ORDER BY created_at DESC
      LIMIT 10
    `,
  ]);

  return {
    patient: patient[0] ?? null,
    clinician: clinician[0] ?? null,
    entries,
    alerts,
    meds,
    notes,
    journals,
  };
}

// ---------------------------------------------------------------------------
// SVG mood trend chart (inline — no external dependencies)
// ---------------------------------------------------------------------------

function buildMoodSvg(entries: DailyEntryRow[]): string {
  const W = 560; const H = 100;
  const PAD = { top: 8, right: 8, bottom: 20, left: 24 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  const submitted = entries.filter((e) => e.mood !== null);
  if (submitted.length < 2) {
    return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <text x="${W / 2}" y="${H / 2}" text-anchor="middle" font-family="sans-serif" font-size="12" fill="#999">Not enough data</text>
    </svg>`;
  }

  const n = submitted.length;
  const points = submitted.map((e, i) => {
    const x = PAD.left + (i / (n - 1)) * chartW;
    const y = PAD.top + chartH - ((( e.mood! - 1) / 9) * chartH);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  // Gradient fill under line
  const fillPoints = [
    `${PAD.left},${PAD.top + chartH}`,
    ...submitted.map((e, i) => {
      const x = PAD.left + (i / (n - 1)) * chartW;
      const y = PAD.top + chartH - (((e.mood! - 1) / 9) * chartH);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }),
    `${PAD.left + chartW},${PAD.top + chartH}`,
  ].join(' ');

  // X-axis date labels (first, middle, last)
  const labelIndices = [0, Math.floor((n - 1) / 2), n - 1];
  const xLabels = labelIndices.map((i) => {
    const x = PAD.left + (i / (n - 1)) * chartW;
    const d = new Date(submitted[i]!.entry_date);
    const label = `${d.getMonth() + 1}/${d.getDate()}`;
    return `<text x="${x.toFixed(1)}" y="${H - 4}" text-anchor="middle" font-family="sans-serif" font-size="9" fill="#999">${label}</text>`;
  }).join('');

  // Y-axis tick marks at 2, 4, 6, 8, 10
  const yTicks = [2, 4, 6, 8, 10].map((v) => {
    const y = PAD.top + chartH - (((v - 1) / 9) * chartH);
    return `
      <line x1="${PAD.left - 3}" y1="${y.toFixed(1)}" x2="${PAD.left + chartW}" y2="${y.toFixed(1)}" stroke="#e5e7eb" stroke-width="0.5" stroke-dasharray="2,2"/>
      <text x="${PAD.left - 5}" y="${(y + 3).toFixed(1)}" text-anchor="end" font-family="sans-serif" font-size="9" fill="#999">${v}</text>
    `;
  }).join('');

  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="moodGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#2a9d8f" stop-opacity="0.3"/>
        <stop offset="100%" stop-color="#2a9d8f" stop-opacity="0"/>
      </linearGradient>
    </defs>
    ${yTicks}
    <polygon points="${fillPoints}" fill="url(#moodGrad)"/>
    <polyline points="${points}" fill="none" stroke="#2a9d8f" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    ${submitted.map((e, i) => {
      const x = PAD.left + (i / (n - 1)) * chartW;
      const y = PAD.top + chartH - (((e.mood! - 1) / 9) * chartH);
      const color = e.mood! <= 3 ? '#d62828' : e.mood! <= 6 ? '#faa307' : '#6a994e';
      return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" fill="${color}" stroke="white" stroke-width="1"/>`;
    }).join('')}
    ${xLabels}
  </svg>`;
}

// ---------------------------------------------------------------------------
// HTML template
// ---------------------------------------------------------------------------

function renderHtml(job: ReportJobDataWithPatient, data: Awaited<ReturnType<typeof fetchReportData>>): string {
  const { patient, clinician, entries, alerts, meds, notes, journals } = data;
  if (!patient) return '<html><body>Patient not found</body></html>';

  const reportTypeLabel: Record<string, string> = {
    weekly_summary: 'Weekly Summary',
    monthly_summary: 'Monthly Summary',
    clinical_export: 'Clinical Export',
  };

  const riskColor: Record<string, string> = {
    critical: '#d62828', high: '#e76f51', moderate: '#faa307', low: '#6a994e',
  };
  const severityColor: Record<string, string> = {
    critical: '#d62828', warning: '#faa307', info: '#2a9d8f',
  };

  // KPI derivations
  const submitted = entries.filter((e) => e.submitted_at !== null);
  const totalDays = Math.ceil((new Date(job.periodEnd).getTime() - new Date(job.periodStart).getTime()) / 86400000) + 1;
  const checkinRate = totalDays > 0 ? Math.round((submitted.length / totalDays) * 100) : 0;
  const moodValues = submitted.filter((e) => e.mood !== null).map((e) => e.mood!);
  const avgMood = moodValues.length > 0 ? (moodValues.reduce((a, b) => a + b, 0) / moodValues.length).toFixed(1) : '—';
  const sleepMins = submitted.filter((e) => e.sleep_hours !== null).map((e) => (e.sleep_hours! * 60) + (e.sleep_minutes ?? 0));
  const avgSleep = sleepMins.length > 0
    ? (() => { const m = Math.round(sleepMins.reduce((a, b) => a + b, 0) / sleepMins.length); return `${Math.floor(m / 60)}h ${m % 60}m`; })()
    : '—';

  const dob = new Date(patient.date_of_birth);
  const age = Math.floor((Date.now() - dob.getTime()) / 31557600000);
  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const fmtShort = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  const moodSvg = buildMoodSvg(entries);

  const entryRows = submitted.map((e) => {
    const moodCell = e.mood !== null
      ? `<span style="color:${e.mood <= 3 ? '#d62828' : e.mood <= 6 ? '#e76f51' : '#6a994e'};font-weight:600">${e.mood}</span>`
      : '—';
    const sleepCell = e.sleep_hours !== null ? `${e.sleep_hours}h${e.sleep_minutes ? ` ${e.sleep_minutes}m` : ''}` : '—';
    const exCell = e.exercise_minutes ? `${e.exercise_minutes}m` : '—';
    return `<tr>
      <td>${fmtShort(e.entry_date)}</td>
      <td style="text-align:center">${moodCell}</td>
      <td style="text-align:center">${e.coping ?? '—'}</td>
      <td style="text-align:center">${sleepCell}</td>
      <td style="text-align:center">${exCell}</td>
      <td style="color:#555;font-size:11px">${e.notes ? e.notes.slice(0, 80) + (e.notes.length > 80 ? '…' : '') : ''}</td>
    </tr>`;
  }).join('');

  const alertRows = alerts.map((a) => `<tr>
    <td>${fmtShort(a.created_at)}</td>
    <td><span style="color:${severityColor[a.severity] ?? '#555'};font-weight:600;font-size:11px;text-transform:uppercase">${a.severity}</span></td>
    <td>${a.title}</td>
    <td style="color:#888;font-size:11px">${a.rule_key}</td>
    <td style="color:#888;font-size:11px;text-transform:capitalize">${a.status.replace('_', ' ')}</td>
  </tr>`).join('');

  const medRows = meds.map((m) => {
    const adh = m.total_doses > 0 ? Math.round((Number(m.taken_doses) / Number(m.total_doses)) * 100) : null;
    return `<tr>
      <td>${m.name}</td>
      <td>${m.dosage ?? '—'}</td>
      <td style="text-transform:capitalize">${m.frequency.replace(/_/g, ' ')}</td>
      <td style="text-align:center;font-weight:600;color:${adh !== null && adh < 70 ? '#d62828' : '#6a994e'}">
        ${adh !== null ? `${adh}%` : '—'}
      </td>
    </tr>`;
  }).join('');

  const noteRows = notes.map((n) => `<tr>
    <td style="white-space:nowrap">${fmtShort(n.created_at)}</td>
    <td style="color:#888;font-size:11px;text-transform:capitalize;white-space:nowrap">${n.note_type.replace(/_/g, ' ')}</td>
    <td>${n.body.slice(0, 200)}${n.body.length > 200 ? '…' : ''}</td>
  </tr>`).join('');

  const journalRows = journals.map((j) => `<tr>
    <td style="white-space:nowrap">${fmtShort(j.created_at)}</td>
    <td>${j.title ?? '<em>Untitled</em>'}</td>
    <td style="text-align:center">${j.mood_at_writing ?? '—'}</td>
  </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 12px; color: #1a1a1a; background: #fff; line-height: 1.5; }
  .page { max-width: 740px; margin: 0 auto; padding: 32px; }
  /* Header */
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #2a9d8f; padding-bottom: 16px; margin-bottom: 20px; }
  .brand { font-size: 22px; font-weight: 700; color: #2a9d8f; letter-spacing: -0.5px; }
  .report-meta { text-align: right; }
  .report-type { font-size: 14px; font-weight: 600; color: #1a1a1a; }
  .report-date { font-size: 11px; color: #888; margin-top: 2px; }
  /* Patient block */
  .patient-block { background: #f8fafb; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 18px; margin-bottom: 20px; display: flex; gap: 40px; }
  .patient-field { margin-bottom: 4px; }
  .patient-label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: #888; }
  .patient-value { font-size: 13px; color: #1a1a1a; }
  /* KPI cards */
  .kpi-row { display: flex; gap: 12px; margin-bottom: 24px; }
  .kpi { flex: 1; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 14px; }
  .kpi-label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: #888; margin-bottom: 4px; }
  .kpi-value { font-size: 22px; font-weight: 700; color: #1a1a1a; }
  /* Sections */
  .section { margin-bottom: 24px; }
  .section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #2a9d8f; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; margin-bottom: 12px; }
  /* Tables */
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th { background: #f8fafb; border-bottom: 1px solid #e2e8f0; padding: 7px 8px; text-align: left; font-weight: 600; font-size: 10px; color: #555; text-transform: uppercase; letter-spacing: 0.3px; }
  td { border-bottom: 1px solid #f0f2f5; padding: 7px 8px; vertical-align: top; }
  tr:last-child td { border-bottom: none; }
  /* Footer */
  .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; font-size: 10px; color: #aaa; }
  .crisis-box { background: #fff5f5; border: 1px solid #fed7d7; border-radius: 6px; padding: 10px 14px; margin-bottom: 20px; font-size: 11px; color: #c53030; }
  .badge { display: inline-block; border-radius: 3px; padding: 1px 6px; font-size: 10px; font-weight: 600; }
  .empty { color: #aaa; font-style: italic; font-size: 11px; padding: 10px 0; }
  svg { display: block; }
</style>
</head>
<body>
<div class="page">

  <!-- Header -->
  <div class="header">
    <div>
      <div class="brand">MindLog</div>
      <div style="font-size:11px;color:#888;margin-top:2px">Clinical Documentation Platform</div>
    </div>
    <div class="report-meta">
      <div class="report-type">${reportTypeLabel[job.reportType] ?? job.reportType}</div>
      <div class="report-date">Period: ${fmtDate(job.periodStart)} – ${fmtDate(job.periodEnd)}</div>
      <div class="report-date">Generated: ${fmtDate(new Date().toISOString())}</div>
      ${clinician ? `<div class="report-date">Clinician: ${clinician.first_name} ${clinician.last_name}</div>` : ''}
    </div>
  </div>

  <!-- Patient demographics -->
  <div class="patient-block">
    <div>
      <div class="patient-label">Patient</div>
      <div class="patient-value" style="font-size:15px;font-weight:700">${patient.first_name} ${patient.last_name}</div>
      <div style="font-size:11px;color:#888;margin-top:2px">MRN: ${patient.mrn}</div>
    </div>
    <div>
      <div class="patient-label">Date of Birth</div>
      <div class="patient-value">${fmtDate(patient.date_of_birth)} (${age}y)</div>
      ${patient.gender ? `<div style="font-size:11px;color:#888;text-transform:capitalize">${patient.gender}</div>` : ''}
    </div>
    ${patient.diagnosis ? `<div>
      <div class="patient-label">Diagnosis</div>
      <div class="patient-value">${patient.diagnosis}</div>
    </div>` : ''}
    <div>
      <div class="patient-label">Risk Level</div>
      <div class="patient-value" style="font-weight:600;color:${riskColor[patient.risk_level ?? ''] ?? '#555'};text-transform:capitalize">
        ${patient.risk_level ?? 'Not set'}
      </div>
    </div>
    <div>
      <div class="patient-label">Status</div>
      <div class="patient-value" style="text-transform:capitalize">${patient.status}</div>
    </div>
  </div>

  <!-- KPI summary -->
  <div class="kpi-row">
    <div class="kpi">
      <div class="kpi-label">Avg Mood</div>
      <div class="kpi-value">${avgMood}<span style="font-size:13px;color:#888">/10</span></div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Check-in Rate</div>
      <div class="kpi-value">${checkinRate}<span style="font-size:13px;color:#888">%</span></div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Entries</div>
      <div class="kpi-value">${submitted.length}<span style="font-size:13px;color:#888"> / ${totalDays}d</span></div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Avg Sleep</div>
      <div class="kpi-value" style="font-size:18px">${avgSleep}</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Alerts</div>
      <div class="kpi-value" style="color:${alerts.filter((a) => a.severity === 'critical').length > 0 ? '#d62828' : '#1a1a1a'}">${alerts.length}</div>
    </div>
  </div>

  <!-- Mood trend chart -->
  <div class="section">
    <div class="section-title">Mood Trend</div>
    ${moodSvg}
  </div>

  <!-- Daily entries table -->
  <div class="section">
    <div class="section-title">Daily Entries (${submitted.length})</div>
    ${submitted.length === 0
      ? '<div class="empty">No submitted entries in this period.</div>'
      : `<table>
          <thead><tr><th>Date</th><th>Mood</th><th>Coping</th><th>Sleep</th><th>Exercise</th><th>Notes</th></tr></thead>
          <tbody>${entryRows}</tbody>
        </table>`
    }
  </div>

  <!-- Clinical alerts -->
  ${alerts.length > 0 ? `
  <div class="section">
    <div class="section-title">Clinical Alerts (${alerts.length})</div>
    <table>
      <thead><tr><th>Date</th><th>Severity</th><th>Alert</th><th>Rule</th><th>Status</th></tr></thead>
      <tbody>${alertRows}</tbody>
    </table>
  </div>` : ''}

  <!-- Medications -->
  ${meds.length > 0 ? `
  <div class="section">
    <div class="section-title">Medications &amp; Adherence</div>
    <table>
      <thead><tr><th>Medication</th><th>Dosage</th><th>Frequency</th><th style="text-align:center">Adherence</th></tr></thead>
      <tbody>${medRows}</tbody>
    </table>
  </div>` : ''}

  <!-- Shared journal entries (titles only) -->
  ${journals.length > 0 ? `
  <div class="section">
    <div class="section-title">Shared Journal Entries (${journals.length})</div>
    <table>
      <thead><tr><th>Date</th><th>Title</th><th>Mood</th></tr></thead>
      <tbody>${journalRows}</tbody>
    </table>
    <div style="font-size:10px;color:#aaa;margin-top:6px">Journal entry bodies are not included in this report. View full entries in the MindLog clinician dashboard.</div>
  </div>` : ''}

  <!-- Clinician notes -->
  ${notes.length > 0 ? `
  <div class="section">
    <div class="section-title">Clinical Notes (non-private)</div>
    <table>
      <thead><tr><th>Date</th><th>Type</th><th>Note</th></tr></thead>
      <tbody>${noteRows}</tbody>
    </table>
  </div>` : ''}

  <!-- Crisis resources -->
  <div class="crisis-box">
    🚨 <strong>Crisis Resources:</strong>&nbsp; 988 Suicide &amp; Crisis Lifeline: Call or text <strong>988</strong> &nbsp;·&nbsp;
    Crisis Text Line: Text <strong>HOME</strong> to <strong>741741</strong> &nbsp;·&nbsp;
    Veterans Crisis Line: Call <strong>988</strong>, Press 1
  </div>

  <!-- Footer -->
  <div class="footer">
    <div>
      MindLog Clinical Documentation &nbsp;·&nbsp; Confidential — Not for distribution outside care team
    </div>
    <div>
      Report ID: ${job.reportId.slice(0, 8).toUpperCase()}
    </div>
  </div>

</div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Supabase Storage helpers
// ---------------------------------------------------------------------------

const STORAGE_BUCKET = 'reports';
const SIGNED_URL_EXPIRY_SECONDS = 7 * 24 * 3600; // 7 days

async function uploadToStorage(
  fileBuffer: Buffer,
  objectPath: string,
  contentType = 'application/pdf',
): Promise<string> {
  const url = `${config.supabaseUrl}/storage/v1/object/${STORAGE_BUCKET}/${objectPath}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.supabaseServiceRoleKey}`,
      'Content-Type': contentType,
      'x-upsert': 'true',
    },
    body: new Uint8Array(fileBuffer) as unknown as BodyInit,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Supabase Storage upload failed (${res.status}): ${errText}`);
  }

  return `${STORAGE_BUCKET}/${objectPath}`;
}

async function createSignedUrl(objectPath: string): Promise<string> {
  // objectPath is already 'reports/orgId/...' — strip bucket prefix for the sign endpoint
  const pathWithoutBucket = objectPath.replace(`${STORAGE_BUCKET}/`, '');
  const url = `${config.supabaseUrl}/storage/v1/object/sign/${STORAGE_BUCKET}/${pathWithoutBucket}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.supabaseServiceRoleKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ expiresIn: SIGNED_URL_EXPIRY_SECONDS }),
  });

  if (!res.ok) {
    throw new Error(`Failed to create signed URL (${res.status})`);
  }

  const json = (await res.json()) as { signedURL: string };
  return `${config.supabaseUrl}/storage/v1${json.signedURL}`;
}

// ---------------------------------------------------------------------------
// Clinician notification after report ready
// ---------------------------------------------------------------------------

async function notifyClinicianReportReady(
  clinician: ClinicianRow,
  job: ReportJobDataWithPatient,
  signedUrl: string,
): Promise<void> {
  if (!config.resendApiKey) return;

  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
      <h2 style="color:#2a9d8f">📄 Clinical Report Ready</h2>
      <p style="font-size:15px">${job.title}</p>
      <p style="color:#666;font-size:13px">Period: ${job.periodStart} to ${job.periodEnd}</p>
      <a href="${signedUrl}"
         style="display:inline-block;padding:12px 24px;background:#2a9d8f;color:white;
                text-decoration:none;border-radius:8px;margin-top:16px;font-weight:600">
        Download PDF
      </a>
      <p style="color:#aaa;font-size:11px;margin-top:16px">
        This link expires in 7 days. Re-generate from the MindLog dashboard if needed.
      </p>
      <hr style="margin-top:24px;border:none;border-top:1px solid #eee"/>
      <p style="font-size:11px;color:#aaa">
        MindLog &nbsp;·&nbsp; 988 Suicide &amp; Crisis Lifeline: Call or text 988 &nbsp;·&nbsp;
        Crisis Text Line: Text HOME to 741741
      </p>
    </div>`;

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.resendApiKey}`,
    },
    body: JSON.stringify({
      from: config.emailFrom,
      to: [clinician.email],
      subject: `📄 Report Ready: ${job.title}`,
      html,
    }),
  }).catch((e: unknown) => {
    console.error('[report-generator] Resend notification failed:', e);
  });
}

// ---------------------------------------------------------------------------
// Core job processor
// ---------------------------------------------------------------------------

async function processReportJob(job: Job<ReportJobData>): Promise<void> {
  const { reportId, orgId } = job.data;

  console.info(`[report-generator] Starting job ${job.id} — report ${reportId}`);

  // Mark as generating
  await sql`
    UPDATE clinical_reports SET status = 'generating' WHERE id = ${reportId}
  `;

  try {
    // ── CDA Handover: generate XML, upload, skip Puppeteer ──────────────────
    if (job.data.reportType === 'cda_handover') {
      if (!job.data.patientId) throw new Error('cda_handover requires patientId');

      const { generateCda } = await import('../services/cdaGenerator.js');
      const xmlStr = await generateCda({
        patientId:   job.data.patientId,
        clinicianId: job.data.clinicianId,
        periodStart: job.data.periodStart,
        periodEnd:   job.data.periodEnd,
        title:       job.data.title,
      });

      const xmlBuffer = Buffer.from(xmlStr, 'utf8');
      const objectPath = `${orgId}/${reportId}.xml`;
      await uploadToStorage(xmlBuffer, objectPath, 'text/xml');
      const storageRef = `${STORAGE_BUCKET}/${objectPath}`;
      const signedUrl = await createSignedUrl(storageRef);
      const expiresAt = new Date(Date.now() + SIGNED_URL_EXPIRY_SECONDS * 1000).toISOString();

      await sql`
        UPDATE clinical_reports
        SET status          = 'ready',
            file_url        = ${signedUrl},
            file_size_bytes = ${xmlBuffer.byteLength},
            generated_at    = NOW(),
            expires_at      = ${expiresAt}
        WHERE id = ${reportId}
      `;

      console.info(`[report-generator] CDA done — report ${reportId} (${xmlBuffer.byteLength} bytes)`);
      return;
    }

    // ── Standard PDF reports ────────────────────────────────────────────────
    if (!job.data.patientId) throw new Error(`${job.data.reportType} requires patientId`);

    let pdfBuffer: Buffer;

    // 1. Fetch all data
    const data = await fetchReportData(job.data as ReportJobData & { patientId: string });
    if (!data.patient) throw new Error(`Patient ${job.data.patientId} not found`);

    // 2. Render HTML
    const html = renderHtml(job.data as ReportJobData & { patientId: string }, data);

    // 3. Puppeteer → PDF (dynamic import to keep startup fast)
    const { default: puppeteer } = await import('puppeteer');
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      const rawBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '15mm', bottom: '15mm', left: '12mm', right: '12mm' },
      });
      pdfBuffer = Buffer.from(rawBuffer);
    } finally {
      await browser.close();
    }

    // 4. Upload to Supabase Storage
    const objectPath = `${orgId}/${reportId}.pdf`;
    await uploadToStorage(pdfBuffer, objectPath);
    const storageRef = `${STORAGE_BUCKET}/${objectPath}`;
    const signedUrl = await createSignedUrl(storageRef);
    const expiresAt = new Date(Date.now() + SIGNED_URL_EXPIRY_SECONDS * 1000).toISOString();

    // 5. Update DB — mark ready
    await sql`
      UPDATE clinical_reports
      SET
        status           = 'ready',
        file_url         = ${signedUrl},
        file_size_bytes  = ${pdfBuffer.byteLength},
        generated_at     = NOW(),
        expires_at       = ${expiresAt}
      WHERE id = ${reportId}
    `;

    // 6. Notify clinician
    if (data.clinician?.alert_email_enabled) {
      await notifyClinicianReportReady(data.clinician, job.data as ReportJobData & { patientId: string }, signedUrl);
    }

    console.info(`[report-generator] Done — report ${reportId} (${pdfBuffer.byteLength} bytes)`);
  } catch (err) {
    console.error(`[report-generator] Failed — report ${reportId}:`, err);
    await sql`
      UPDATE clinical_reports SET status = 'failed' WHERE id = ${reportId}
    `;
    throw err; // re-throw so BullMQ marks job as failed
  }
}

// ---------------------------------------------------------------------------
// Worker factory
// ---------------------------------------------------------------------------

export function startReportWorker(): Worker<ReportJobData> {
  const worker = new Worker<ReportJobData>(REPORT_QUEUE_NAME, processReportJob, {
    connection,
    concurrency: 2, // at most 2 simultaneous Puppeteer instances
    limiter: { max: 10, duration: 60_000 }, // 10 reports/minute
  });

  worker.on('completed', (job) => {
    console.info(`[report-generator] Job ${job.id} completed`);
  });
  worker.on('failed', (job, err) => {
    console.error(`[report-generator] Job ${job?.id} failed:`, err.message);
  });

  console.info('[report-generator] Worker started');
  return worker;
}
