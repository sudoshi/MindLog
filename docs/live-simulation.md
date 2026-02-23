# MindLog Live Data Simulation System

## Table of Contents

1. [Introduction](#introduction)
2. [Architecture](#architecture)
3. [Patient Simulation](#patient-simulation)
4. [Clinical Response Simulation](#clinical-response-simulation)
5. [Data Generation Algorithms](#data-generation-algorithms)
6. [Installation & Setup](#installation--setup)
7. [Configuration](#configuration)
8. [CLI Reference](#cli-reference)
9. [Scheduling](#scheduling)
10. [Monitoring & Logging](#monitoring--logging)
11. [Database Impact](#database-impact)
12. [Troubleshooting](#troubleshooting)
13. [Extending the System](#extending-the-system)

---

## Introduction

### Purpose

The MindLog Live Data Simulation System maintains a realistic, continuously-updated demo environment for mental health professionals. It simulates authentic patient behavior and clinical workflows, creating a "living" demonstration that showcases the platform's capabilities without requiring manual data entry.

### Key Features

- **Realistic Patient Behavior**: Generates daily check-ins, mood scores, sleep logs, exercise data, symptoms, triggers, and journal entries based on clinically-validated patterns
- **Risk-Stratified Activity**: Patient engagement and mood patterns vary appropriately by risk level (low, moderate, high, critical)
- **Clinical Workflow Simulation**: Automatically acknowledges alerts, generates clinical notes, and handles safety events
- **Time-Aware Generation**: Activity patterns reflect realistic time-of-day distributions (morning, afternoon, evening)
- **Correlated Data**: Sleep quality affects mood, exercise provides mood boosts, symptoms correlate inversely with wellbeing
- **Idempotent Operations**: Safe to run multiple times; won't create duplicate entries

### Design Philosophy

The simulation is designed around these principles:

1. **Clinical Authenticity**: Mental health professionals should not be able to distinguish simulated data from real patient data
2. **Statistical Realism**: Mood trajectories, adherence rates, and symptom patterns follow clinically-documented distributions
3. **Operational Safety**: Only operates on designated demo environments; refuses to modify production data
4. **Minimal Footprint**: Runs quickly (<1 second typical), logs concisely, handles errors gracefully

---

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────────┐
│                    Scheduling Layer                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │  Cron Job   │  │  Manual CLI │  │ BullMQ Job  │              │
│  │  (Primary)  │  │  (Testing)  │  │  (Future)   │              │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘              │
└─────────┼────────────────┼────────────────┼─────────────────────┘
          │                │                │
          └────────────────┼────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                 live-simulation.ts                               │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                   Main Orchestrator                      │    │
│  │  • Environment validation                                │    │
│  │  • Time-of-day detection                                 │    │
│  │  • Patient/clinician loading                             │    │
│  │  • Statistics collection                                 │    │
│  └─────────────────────────────────────────────────────────┘    │
│                           │                                      │
│           ┌───────────────┴───────────────┐                     │
│           ▼                               ▼                      │
│  ┌─────────────────────┐      ┌─────────────────────┐           │
│  │ Patient Simulation  │      │ Clinical Simulation │           │
│  │                     │      │                     │           │
│  │ • Daily entries     │      │ • Alert handling    │           │
│  │ • Sleep logs        │      │ • Note generation   │           │
│  │ • Exercise logs     │      │ • Safety response   │           │
│  │ • Symptom logs      │      │                     │           │
│  │ • Trigger logs      │      │                     │           │
│  │ • Journal entries   │      │                     │           │
│  │ • Medication logs   │      │                     │           │
│  └─────────────────────┘      └─────────────────────┘           │
└─────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                      PostgreSQL Database                         │
│  daily_entries, sleep_logs, exercise_logs, symptom_logs,        │
│  trigger_logs, journal_entries, medication_adherence_logs,      │
│  clinical_alerts, clinician_notes, safety_events                │
└─────────────────────────────────────────────────────────────────┘
```

### File Structure

```
packages/db/
├── src/
│   └── live-simulation.ts       # Main simulation engine (~750 lines)
├── scripts/
│   └── setup-simulation-cron.sh # Cron installation script
├── SIMULATION.md                # Quick-start documentation
└── package.json                 # npm scripts

docs/
└── live-simulation.md           # This documentation
```

### Dependencies

- **postgres** (via `@mindlog/db`): Database connectivity
- **Node.js 18+**: Runtime environment
- **tsx**: TypeScript execution without compilation

---

## Patient Simulation

### Check-in Probability

Patient check-in rates vary by risk level to reflect real-world engagement patterns:

| Risk Level | Daily Check-in Rate | Clinical Rationale |
|------------|--------------------|--------------------|
| Low        | 95%                | Stable patients maintain consistent routines |
| Moderate   | 80%                | Some days missed due to fluctuating motivation |
| High       | 65%                | Struggling with routine adherence |
| Critical   | 50%                | Significant engagement challenges |

### Mood Score Generation

Mood scores (1-10 scale) are generated using a multi-factor algorithm:

```
Final Mood = Base Mood + Day-of-Week Modifier + Sleep Effect + Exercise Effect + Random Variation
```

#### Base Mood by Risk Level

| Risk Level | Base Range | Description |
|------------|------------|-------------|
| Low        | 7-10       | Generally positive outlook |
| Moderate   | 4-8        | Variable, situation-dependent |
| High       | 3-6        | Frequently struggling |
| Critical   | 2-5        | Persistent difficulties |

#### Day-of-Week Modifiers

| Day       | Modifier | Rationale |
|-----------|----------|-----------|
| Monday    | -0.3     | "Monday blues" effect |
| Tuesday   | 0        | Baseline |
| Wednesday | 0        | Baseline |
| Thursday  | 0        | Baseline |
| Friday    | +0.2     | Weekend anticipation |
| Saturday  | +0.5     | Weekend effect |
| Sunday    | +0.3     | Rest/recovery day |

#### Sleep Correlation

Sleep quality (1-10) is generated first, then affects mood:

- Sleep 8-10: Mood +0.5
- Sleep 6-7: No effect
- Sleep 4-5: Mood -0.5
- Sleep 1-3: Mood -1.0

#### Exercise Effect

When exercise is logged (probability varies by risk):
- Any exercise: Mood +0.3 to +0.8

### Coping Score

Coping ability scores correlate with mood:

```
Coping = Mood + Random(-1.5, +1.5)
Clamped to range [1, 10]
```

### Sleep Log Generation

| Field | Generation Logic |
|-------|------------------|
| Hours | 5-9 hours, weighted toward 7 (Gaussian distribution) |
| Quality | Correlated with hours; 7+ hours → higher quality |
| Bed Time | Evening check-in: 9pm-midnight; Morning: 8pm-11pm |
| Wake Time | Bed time + hours slept |

### Exercise Log Generation

| Risk Level | Exercise Probability | Typical Duration |
|------------|---------------------|------------------|
| Low        | 70%                 | 30-90 minutes |
| Moderate   | 50%                 | 20-60 minutes |
| High       | 30%                 | 15-45 minutes |
| Critical   | 20%                 | 10-30 minutes |

Exercise types: Walking, Running, Yoga, Gym workout, Swimming, Cycling, Home exercise, Sports

### Symptom Generation

Symptoms are selected from the patient's tracked symptom list, with probability and count based on risk:

| Risk Level | Symptom Probability | Typical Count |
|------------|--------------------| --------------|
| Low        | 10%                | 1-2 mild |
| Moderate   | 40%                | 2-3 moderate |
| High       | 70%                | 3-5 significant |
| Critical   | 90%                | 4+ severe |

Symptom intensity inversely correlates with mood score.

### Trigger Generation

Triggers are activated based on risk level and recent patterns:

| Trigger Type | Base Probability | Notes |
|--------------|------------------|-------|
| Work stress  | 30%              | Higher on weekdays |
| Sleep issues | Variable         | Correlates with sleep quality |
| Relationships| 15%              | Tends to cluster |
| Financial    | 10%              | Random distribution |
| Health       | 20%              | Correlates with symptoms |

### Journal Entry Generation

| Risk Level | Journal Probability | Typical Content |
|------------|--------------------| ----------------|
| Low        | 30%                | Reflective, gratitude-focused |
| Moderate   | 40%                | Processing events, mixed tone |
| High       | 50%                | Venting, seeking understanding |
| Critical   | 60%                | Crisis processing, reaching out |

Journal templates are selected based on mood score and risk level, with randomized elements for variety.

### Medication Adherence

| Risk Level | Adherence Rate | Pattern |
|------------|----------------|---------|
| Low        | 92%            | Consistent routine |
| Moderate   | 78%            | Occasional misses |
| High       | 65%            | Struggling with routine |
| Critical   | 50%            | Needs support |

---

## Clinical Response Simulation

### Alert Acknowledgment

The simulation processes unacknowledged alerts older than 1 hour:

| Alert Severity | Acknowledgment Rate | Typical Response Time |
|----------------|--------------------|-----------------------|
| Critical       | 80%                | 1-4 hours |
| Warning        | 60%                | 4-8 hours |
| Info           | 40%                | 8-24 hours |

Acknowledgment notes are generated with appropriate clinical language:

- **Critical**: "Reviewed immediately. Patient contacted and safety assessed."
- **Warning**: "Noted and will follow up at next appointment."
- **Info**: "Acknowledged. Continuing to monitor."

### Clinical Note Generation

Routine notes are generated for patients who had recent check-ins:

| Note Type | Trigger | Content |
|-----------|---------|---------|
| Observation | Recent mood changes | Pattern observations |
| Progress | Scheduled intervals | Treatment progress |
| Risk Review | High/critical patients | Risk assessment update |

### Safety Event Handling

When a patient reports very low mood (≤3) or safety symptoms:

1. **Symptom Log Created**: Safety symptom recorded with intensity
2. **Clinical Alert Raised**: Critical severity alert generated
3. **Safety Event Record**: Linked to symptom log and daily entry
4. **Clinician Notification**: Alert queued for immediate review

---

## Data Generation Algorithms

### Gaussian Random Distribution

Used for realistic variation around target values:

```typescript
function gaussianRandom(mean: number, stdDev: number): number {
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z * stdDev;
}
```

### Time-of-Day Detection

The simulation adjusts behavior based on when it runs:

| Time Window | Classification | Focus |
|-------------|----------------|-------|
| 5am - 11am  | Morning        | Wake-up entries, medication logs |
| 11am - 5pm  | Afternoon      | Midday check-ins, appointments |
| 5pm - 5am   | Evening        | End-of-day journals, reflections |

### Mood Continuity

To prevent unrealistic mood swings, the simulation considers recent mood history:

1. Fetch last 3 days of mood scores for patient
2. Calculate trend (improving, stable, declining)
3. Weight new mood toward continuing trend (70%) vs. random (30%)
4. Apply daily variation within risk-appropriate bounds

### Journal Content Templates

Journal entries are constructed from templates with variable elements:

```typescript
const templates = {
  low_risk_good_mood: [
    "Feeling {adjective} today. {activity} really helped.",
    "Had a {quality} day. {reflection}",
    "Grateful for {gratitude}. {looking_forward}"
  ],
  high_risk_struggling: [
    "Today was {difficulty}. {coping_attempt}",
    "Struggling with {challenge}. {support_note}",
    "Not my best day. {small_win}"
  ]
};
```

---

## Installation & Setup

### Prerequisites

| Requirement | Version | Purpose |
|-------------|---------|---------|
| Node.js     | 18+     | Runtime |
| npm         | 9+      | Package management |
| PostgreSQL  | 14+     | Database |
| Demo data   | -       | Patient/clinician records |

### Quick Start

```bash
# 1. Ensure demo data exists
npm run db:seed-demo

# 2. Set database connection
export DATABASE_URL="postgresql://user:password@localhost:5432/mindlogdemo"

# 3. Test simulation
npm run db:simulate -- --dry-run --verbose

# 4. Run for real
npm run db:simulate

# 5. Set up automatic scheduling
chmod +x packages/db/scripts/setup-simulation-cron.sh
./packages/db/scripts/setup-simulation-cron.sh
```

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | - | PostgreSQL connection string |
| `LOG_FILE` | No | `/tmp/mindlog-simulation.log` | Output log path |

### Using .env Files

The simulation will automatically source `.env` files:

1. Project root: `/path/to/MindLog/.env`
2. Package directory: `/path/to/MindLog/packages/db/.env`

```env
# .env
DATABASE_URL=postgresql://username:password@localhost:5432/mindlogdemo
```

---

## Configuration

### Risk Level Configuration

Located in `live-simulation.ts`:

```typescript
const CONFIG = {
  checkinRates: {
    low: 0.95,
    moderate: 0.80,
    high: 0.65,
    critical: 0.50,
  },
  moodRanges: {
    low: { min: 7, max: 10, volatility: 0.5 },
    moderate: { min: 4, max: 8, volatility: 1.5 },
    high: { min: 3, max: 6, volatility: 2.0 },
    critical: { min: 2, max: 5, volatility: 2.5 },
  },
  exerciseRates: {
    low: 0.70,
    moderate: 0.50,
    high: 0.30,
    critical: 0.20,
  },
  medicationAdherence: {
    low: 0.92,
    moderate: 0.78,
    high: 0.65,
    critical: 0.50,
  },
};
```

### Adjusting Simulation Intensity

To generate more or less data per run, modify these constants:

```typescript
// Maximum alerts to acknowledge per run
const MAX_ALERTS_PER_RUN = 20;

// Maximum clinical notes to generate per run
const MAX_NOTES_PER_RUN = 10;

// Journal probability multiplier (1.0 = normal, 2.0 = double)
const JOURNAL_RATE_MULTIPLIER = 1.0;
```

---

## CLI Reference

### Basic Usage

```bash
npm run db:simulate [-- OPTIONS]
```

### Options

| Option | Description |
|--------|-------------|
| `--verbose` | Print patient-by-patient activity details |
| `--dry-run` | Preview changes without writing to database |
| `--help` | Display help information |

### Examples

```bash
# Normal run (quiet)
npm run db:simulate

# See what would happen without making changes
npm run db:simulate -- --dry-run

# Detailed output for each patient
npm run db:simulate -- --verbose

# Combine options
npm run db:simulate -- --dry-run --verbose
```

### Output Format

```
════════════════════════════════════════════════════════
  MindLog Live Simulation — Evening Run
════════════════════════════════════════════════════════

[2026-02-23 04:19:59] ✓ Running on organization: MindLog Demo Clinic
[2026-02-23 04:19:59] ✓ Found 146 active patients
[2026-02-23 04:19:59] ✓ Found 7 clinicians
[2026-02-23 04:19:59] ✓ Simulating patient activity...
[2026-02-23 04:19:59]    John Smith - mood: 8, coping: 7
[2026-02-23 04:19:59]    Jane Doe - no check-in this period
...

════════════════════════════════════════════════════════
  SIMULATION COMPLETE
════════════════════════════════════════════════════════

  Duration: 0.54s

  Patient Activity:
    • Patients processed:    117
    • Daily entries created: 117
    • Sleep logs:            117
    • Exercise logs:         62
    • Symptoms logged:       62
    • Triggers logged:       22
    • Journals created:      43
    • Medication logs:       293

  Clinical Activity:
    • Alerts acknowledged:   16
    • Notes created:         17
    • Safety events:         0

════════════════════════════════════════════════════════
```

---

## Scheduling

### Cron Setup Script

```bash
# Install cron job
./packages/db/scripts/setup-simulation-cron.sh

# Check if installed
./packages/db/scripts/setup-simulation-cron.sh --status

# Remove cron job
./packages/db/scripts/setup-simulation-cron.sh --remove

# Preview without installing
./packages/db/scripts/setup-simulation-cron.sh --dry-run
```

### Manual Crontab Configuration

```bash
crontab -e
```

Add:

```cron
# MindLog Live Simulation - runs at 6am, 2pm, 10pm
0 6,14,22 * * * cd /path/to/MindLog && DATABASE_URL="postgresql://..." npm run db:simulate >> /tmp/mindlog-simulation.log 2>&1
```

### Schedule Explanation

| Time | Run | Primary Activity |
|------|-----|------------------|
| 06:00 | Morning | Wake-up entries, overnight summaries |
| 14:00 | Afternoon | Midday check-ins, lunch-time entries |
| 22:00 | Evening | End-of-day journals, evening reflections |

### Alternative Scheduling Options

#### systemd Timer (Linux)

```ini
# /etc/systemd/system/mindlog-simulation.timer
[Unit]
Description=MindLog Simulation Timer

[Timer]
OnCalendar=*-*-* 06,14,22:00:00
Persistent=true

[Install]
WantedBy=timers.target
```

#### Windows Task Scheduler

Create a scheduled task running:
```cmd
cmd /c "cd C:\path\to\MindLog && npm run db:simulate"
```

#### Docker/Kubernetes

```yaml
# CronJob manifest
apiVersion: batch/v1
kind: CronJob
metadata:
  name: mindlog-simulation
spec:
  schedule: "0 6,14,22 * * *"
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: simulation
            image: mindlog/api:latest
            command: ["npm", "run", "db:simulate"]
            env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: db-credentials
                  key: url
```

---

## Monitoring & Logging

### Log File Location

Default: `/tmp/mindlog-simulation.log`

Override with: `LOG_FILE=/var/log/mindlog-sim.log ./setup-simulation-cron.sh`

### Viewing Logs

```bash
# Follow in real-time
tail -f /tmp/mindlog-simulation.log

# Last 100 lines
tail -100 /tmp/mindlog-simulation.log

# Search for errors
grep -i error /tmp/mindlog-simulation.log

# Today's runs
grep "$(date +%Y-%m-%d)" /tmp/mindlog-simulation.log
```

### Log Rotation

Add to `/etc/logrotate.d/mindlog-simulation`:

```
/tmp/mindlog-simulation.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
}
```

### Health Checks

#### Verify Recent Activity

```sql
-- Check entries from last 24 hours
SELECT
  DATE_TRUNC('hour', created_at) as hour,
  COUNT(*) as entries
FROM daily_entries
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY 1
ORDER BY 1;
```

#### Verify Mood Distribution

```sql
-- Should match risk level expectations
SELECT
  p.risk_level,
  COUNT(*) as count,
  ROUND(AVG(d.mood)::numeric, 1) as avg_mood,
  MIN(d.mood) as min,
  MAX(d.mood) as max
FROM daily_entries d
JOIN patients p ON d.patient_id = p.id
WHERE d.entry_date >= CURRENT_DATE - 7
GROUP BY p.risk_level
ORDER BY
  CASE p.risk_level
    WHEN 'critical' THEN 1
    WHEN 'high' THEN 2
    WHEN 'moderate' THEN 3
    WHEN 'low' THEN 4
  END;
```

### Alerting

Example Prometheus alert rule:

```yaml
groups:
- name: mindlog-simulation
  rules:
  - alert: SimulationNotRunning
    expr: time() - mindlog_simulation_last_run_timestamp > 32400  # 9 hours
    for: 5m
    labels:
      severity: warning
    annotations:
      summary: "MindLog simulation hasn't run in 9+ hours"
```

---

## Database Impact

### Tables Modified

| Table | Operation | Frequency per Run |
|-------|-----------|-------------------|
| `daily_entries` | INSERT | 1 per active patient |
| `sleep_logs` | INSERT | 1 per daily entry |
| `exercise_logs` | INSERT | ~50% of entries |
| `symptom_logs` | INSERT | Variable by risk |
| `trigger_logs` | INSERT | Variable by risk |
| `journal_entries` | INSERT | 30-60% of entries |
| `medication_adherence_logs` | INSERT | Per patient medication |
| `clinical_alerts` | UPDATE | Acknowledgments |
| `clinician_notes` | INSERT | ~10 per run |
| `safety_events` | INSERT | Rare (low mood events) |

### Storage Estimates

| Timeframe | Daily Entries | Total Records | Est. Size |
|-----------|---------------|---------------|-----------|
| 1 week    | ~400          | ~2,000        | ~5 MB |
| 1 month   | ~1,700        | ~8,500        | ~20 MB |
| 1 year    | ~20,000       | ~100,000      | ~250 MB |

### Performance Considerations

- **Execution time**: Typically <1 second for 150 patients
- **Database connections**: Single connection, sequential operations
- **Lock contention**: Minimal; uses row-level inserts
- **Index maintenance**: Standard PostgreSQL auto-vacuum handles this

### Data Cleanup

To reset simulation data:

```sql
-- Remove last N days of simulated entries
DELETE FROM daily_entries
WHERE entry_date > CURRENT_DATE - 7;

-- Full reset (careful!)
TRUNCATE daily_entries, sleep_logs, exercise_logs,
         symptom_logs, trigger_logs, journal_entries,
         medication_adherence_logs CASCADE;
```

---

## Troubleshooting

### Simulation Won't Start

**Symptom**: Error about missing DATABASE_URL

**Solution**:
```bash
export DATABASE_URL="postgresql://user:pass@localhost:5432/mindlogdemo"
# or create .env file
```

**Symptom**: "No demo organization found"

**Solution**: Seed demo data first:
```bash
npm run db:seed-demo
```

### No Data Being Created

**Symptom**: Simulation runs but shows 0 entries created

**Possible causes**:
1. All patients already have entries for today
2. Running in `--dry-run` mode
3. Database connection issues

**Solution**: Check for existing entries:
```sql
SELECT COUNT(*) FROM daily_entries WHERE entry_date = CURRENT_DATE;
```

### Cron Job Not Running

**Symptom**: No new entries appearing at scheduled times

**Diagnosis**:
```bash
# Check if cron is running
systemctl status cron

# Check if job is installed
crontab -l | grep mindlog

# Check cron logs
grep CRON /var/log/syslog | tail -20
```

**Common fixes**:
1. Ensure full paths in cron command
2. Ensure DATABASE_URL is set in cron environment
3. Check log file for errors

### Unrealistic Data Patterns

**Symptom**: Mood scores don't match risk levels

**Solution**: Run the low-risk enrichment first to establish baselines:
```bash
npm run db:enrich-low-risk
```

### Database Connection Errors

**Symptom**: PostgresError in logs

**Diagnosis**:
```bash
# Test connection
psql $DATABASE_URL -c "SELECT 1"
```

**Common fixes**:
1. Check password escaping in URL (use %40 for @)
2. Verify database exists
3. Check pg_hba.conf for connection permissions

---

## Extending the System

### Adding New Data Types

1. Create generation function in `live-simulation.ts`:

```typescript
async function generateNewDataType(
  patient: Patient,
  entryId: string,
  stats: SimulationStats
): Promise<void> {
  // Generation logic
  await sql`INSERT INTO new_table ...`;
  stats.newTypeCreated++;
}
```

2. Call from `simulatePatientActivity()`:

```typescript
await generateNewDataType(patient, entry.id, stats);
```

3. Add to statistics output

### Customizing Probability Functions

Override defaults by creating a configuration file:

```typescript
// simulation-config.ts
export const customConfig = {
  checkinRates: {
    low: 0.98,  // Higher than default
    // ...
  }
};
```

### Adding New Clinical Responses

1. Add to `simulateClinicalResponses()`:

```typescript
async function handleNewClinicalAction(
  clinicians: Clinician[],
  stats: SimulationStats
): Promise<void> {
  // Implementation
}
```

2. Call from main clinical simulation loop

### Testing Changes

```bash
# Run with verbose output to see effects
npm run db:simulate -- --dry-run --verbose

# Compare before/after statistics
psql $DATABASE_URL -c "SELECT COUNT(*) FROM daily_entries"
npm run db:simulate
psql $DATABASE_URL -c "SELECT COUNT(*) FROM daily_entries"
```

---

## Appendix

### A. Sample Generated Data

#### Daily Entry
```json
{
  "patient_id": "uuid-...",
  "entry_date": "2026-02-23",
  "mood": 8,
  "coping": 7,
  "completion_pct": 80,
  "core_complete": true,
  "wellness_complete": true
}
```

#### Sleep Log
```json
{
  "patient_id": "uuid-...",
  "entry_date": "2026-02-23",
  "hours_slept": 7.5,
  "quality": 8,
  "bed_time": "22:30:00",
  "wake_time": "06:00:00"
}
```

#### Journal Entry
```json
{
  "patient_id": "uuid-...",
  "title": "Evening reflection",
  "content": "Had a productive day today. Work was manageable and I made time for a walk during lunch. Feeling grateful for the support from my care team.",
  "mood_at_writing": 8
}
```

### B. Risk Level Reference

| Level | Description | Typical Presentation |
|-------|-------------|---------------------|
| Low | Stable, maintenance phase | Consistent engagement, positive trajectory |
| Moderate | Active treatment | Variable mood, working on coping skills |
| High | Intensive support needed | Frequent struggles, requires close monitoring |
| Critical | Crisis risk | Safety concerns, daily contact recommended |

### C. Related Documentation

- [Database Schema](/docs/database-schema.md)
- [API Reference](/docs/api-reference.md)
- [Demo Data Seeding](/packages/db/README.md)

---

*Last updated: February 2026*
*Version: 1.0*
