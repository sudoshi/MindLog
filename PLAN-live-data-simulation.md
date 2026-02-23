# MindLog Live Data Simulation System

## Project Plan

### Overview

Create an automated system that runs every 8 hours to simulate realistic patient activity and clinical responses, maintaining a "living" demo environment that mental health professionals will find authentic and compelling.

---

## 1. System Architecture

### 1.1 Scheduler Options

| Option | Pros | Cons | Recommendation |
|--------|------|------|----------------|
| **Cron job** | Simple, reliable, OS-native | Requires server access | ✅ Primary |
| **Node-cron in API** | Integrated, no external deps | Dies with server restart | Backup |
| **BullMQ recurring job** | Already in stack, persistent | More complex | Future enhancement |

**Decision**: Create a standalone script executable via cron, with optional integration into the existing BullMQ worker infrastructure.

### 1.2 Time-Aware Simulation Windows

| Run Time | Simulation Focus | Patient Activity | Clinical Activity |
|----------|------------------|------------------|-------------------|
| **06:00** | Morning | Wake-up entries, medication logs | Night shift handover notes |
| **14:00** | Afternoon | Midday check-ins, therapy notes | Appointment documentation |
| **22:00** | Evening | End-of-day entries, journal writes | Alert acknowledgments, risk reviews |

---

## 2. Patient Simulation Components

### 2.1 Daily Entry Generation

For each active patient, based on their risk profile:

```
Probability of check-in by risk level:
- Low risk:      95% daily adherence
- Moderate risk: 80% daily adherence
- High risk:     65% daily adherence
- Critical risk: 50% daily adherence (inconsistent engagement)
```

### 2.2 Mood Score Algorithms

**Low Risk Patients**
- Baseline: 7-9
- Daily variation: ±0.5
- Trend: Stable or slight improvement
- Weekend boost: +0.5
- Exercise correlation: +0.3-0.5

**Moderate Risk Patients**
- Baseline: 5-7
- Daily variation: ±1.5
- Trend: Variable (improving/stable/declining phases)
- Stress sensitivity: Higher impact from triggers
- Treatment response: Gradual improvement over weeks

**High Risk Patients**
- Baseline: 3-6
- Daily variation: ±2.0
- Trend: Requires active monitoring
- Crisis probability: 5% per week
- Rapid cycling possible

**Critical Risk Patients**
- Baseline: 2-5
- Daily variation: ±2.5
- Trend: Intensive support needed
- Safety check triggers: Automatic on low scores
- Requires daily clinical contact

### 2.3 Correlated Data Generation

Each daily entry includes correlated values:

| Field | Correlation | Logic |
|-------|-------------|-------|
| Sleep hours | Mood ↔ Sleep | Poor sleep → lower mood next day |
| Sleep quality | Mood correlation | r = 0.6 |
| Exercise | Mood boost | +0.3-0.8 on exercise days |
| Coping score | Mood tracking | Within ±1.5 of mood |
| Symptoms | Inverse mood | Low mood → more symptoms |
| Triggers | Mood impact | Active triggers → -0.5 to -2.0 |

### 2.4 Symptom & Trigger Selection

**Symptom probability by risk level:**
```
Low:      10% chance of 1-2 mild symptoms
Moderate: 40% chance of 2-3 symptoms
High:     70% chance of 3-5 symptoms
Critical: 90% chance of 4+ symptoms, safety symptoms possible
```

**Trigger activation:**
```
Based on recent mood trajectory + random life events
- Work stress: 30% base probability
- Sleep issues: Correlates with sleep log
- Relationship: 15% probability, clustered events
- Financial: 10% probability
```

### 2.5 Journal Entry Generation

**Frequency by risk level:**
- Low: 30% of days (reflective, positive)
- Moderate: 40% of days (processing, mixed)
- High: 50% of days (venting, seeking support)
- Critical: 60% of days (crisis processing, reaching out)

**Content templates** matched to mood state and risk level.

### 2.6 Medication Adherence

```
Adherence rates:
- Low risk:      92% (stable, routine)
- Moderate risk: 78% (occasional misses)
- High risk:     65% (struggling with routine)
- Critical:      50% (needs support)
```

---

## 3. Clinical Simulation Components

### 3.1 Alert Acknowledgment

**Auto-acknowledgment rules:**
- Critical alerts: 80% acknowledged within 4 hours
- Warning alerts: 60% acknowledged within 8 hours
- Info alerts: 40% acknowledged within 24 hours

**Response notes generated** with appropriate clinical language.

### 3.2 Clinical Note Generation

**Note types and frequency:**
| Note Type | Trigger | Frequency |
|-----------|---------|-----------|
| Progress note | Scheduled appointment | Per appointment |
| Risk assessment | High/critical patient | Weekly |
| Intervention note | Alert acknowledgment | Per alert |
| Observation | Pattern detection | Ad-hoc |

### 3.3 Risk Level Adjustments

**Automatic risk reassessment:**
- 7-day mood average < 4 → Consider upgrade to higher risk
- 14-day mood average > 7 with stability → Consider downgrade
- Safety symptom reported → Immediate critical flag
- 3+ missed check-ins → Flag for outreach

### 3.4 Safety Event Response

**For any safety symptom logged:**
1. Create safety_event record
2. Generate clinical_alert (critical)
3. Create intervention note
4. Log crisis protocol activation if score ≥ 7

---

## 4. Temporal Realism

### 4.1 Check-in Time Distribution

```
Morning entries (6am-10am):   35%
Afternoon entries (12pm-4pm): 25%
Evening entries (6pm-10pm):   40%
```

### 4.2 Weekly Patterns

| Day | Mood Modifier | Activity Level |
|-----|---------------|----------------|
| Monday | -0.3 | Lower exercise |
| Tuesday-Thursday | 0 | Normal |
| Friday | +0.2 | Anticipation |
| Saturday | +0.5 | Higher activity |
| Sunday | +0.3 | Rest/recovery |

### 4.3 Treatment Response Curves

**New patients** (first 30 days):
- Initial assessment phase
- Medication titration effects
- Establishing baseline

**Established patients** (30-90 days):
- Treatment response visible
- Patterns emerging
- Coping skills developing

**Maintenance patients** (90+ days):
- Stable trajectories
- Occasional life event disruptions
- Gradual improvement or stable maintenance

---

## 5. Implementation Plan

### Phase 1: Core Simulation Engine (Priority)

**File: `packages/db/src/live-simulation.ts`**

1. Patient check-in simulator
2. Mood calculation engine
3. Sleep/exercise correlation
4. Basic symptom/trigger generation

**Estimated complexity**: 400-500 lines

### Phase 2: Clinical Response Engine

1. Alert acknowledgment logic
2. Clinical note generation
3. Risk level assessment
4. Safety event handling

**Estimated complexity**: 300-400 lines

### Phase 3: Scheduling & Integration

1. Cron job setup script
2. BullMQ recurring job (optional)
3. Logging and monitoring
4. Error handling and recovery

**Estimated complexity**: 100-150 lines

### Phase 4: Configuration & Tuning

1. Configurable parameters (JSON/env)
2. Simulation speed controls
3. Risk level distribution settings
4. Debug/verbose modes

---

## 6. Database Considerations

### 6.1 Tables Modified

| Table | Operation | Frequency |
|-------|-----------|-----------|
| daily_entries | INSERT/UPDATE | Per patient per run |
| sleep_logs | INSERT | With daily entry |
| exercise_logs | INSERT | 60% of entries |
| symptom_logs | INSERT | Based on risk |
| trigger_logs | INSERT | Based on events |
| journal_entries | INSERT | 30-60% of entries |
| medication_adherence_logs | INSERT | Per medication |
| clinical_alerts | UPDATE | Acknowledgments |
| clinician_notes | INSERT | Per clinical action |
| safety_events | INSERT/UPDATE | On safety symptoms |

### 6.2 Data Integrity

- Use transactions for multi-table operations
- Respect unique constraints (patient_id + entry_date)
- Update `last_checkin_at` on patients table
- Maintain referential integrity

---

## 7. Monitoring & Logging

### 7.1 Simulation Metrics

Each run logs:
- Patients processed
- Entries created
- Alerts acknowledged
- Notes generated
- Errors encountered

### 7.2 Log Output

```
[2024-02-22 14:00:00] MindLog Live Simulation - Afternoon Run
[2024-02-22 14:00:01] Processing 146 active patients...
[2024-02-22 14:00:15] ✓ Created 89 daily entries
[2024-02-22 14:00:16] ✓ Generated 34 sleep logs
[2024-02-22 14:00:17] ✓ Generated 52 exercise logs
[2024-02-22 14:00:18] ✓ Acknowledged 12 alerts
[2024-02-22 14:00:19] ✓ Created 8 clinical notes
[2024-02-22 14:00:20] Simulation complete. Next run: 22:00
```

---

## 8. Cron Setup

### 8.1 Crontab Entry

```bash
# MindLog Live Data Simulation - runs at 6am, 2pm, 10pm
0 6,14,22 * * * cd /path/to/MindLog && npm run db:simulate >> /var/log/mindlog-sim.log 2>&1
```

### 8.2 npm Script

```json
{
  "scripts": {
    "db:simulate": "node --import tsx/esm src/live-simulation.ts"
  }
}
```

---

## 9. Safety Considerations

### 9.1 Demo Environment Only

- Script checks for `MINDLOG_ENV=demo` or specific org name
- Refuses to run on production databases
- Clearly marked demo data

### 9.2 Idempotency

- Check if today's entry exists before creating
- Use `ON CONFLICT` clauses
- Track last simulation timestamp

---

## 10. Success Criteria

1. **Realism**: Mental health professionals cannot distinguish simulated data from real patient data
2. **Consistency**: Mood trajectories follow clinically plausible patterns
3. **Responsiveness**: Clinical alerts receive timely acknowledgment
4. **Stability**: 8-hour cycle runs without errors
5. **Correlation**: Sleep, exercise, symptoms correlate appropriately with mood

---

## Appendix: File Structure

```
packages/db/src/
├── live-simulation.ts       # Main simulation engine
├── simulation/
│   ├── patient-activity.ts  # Patient check-in logic
│   ├── mood-engine.ts       # Mood calculation algorithms
│   ├── clinical-response.ts # Clinician activity simulation
│   ├── content-templates.ts # Journal/note templates
│   └── config.ts            # Tunable parameters
└── ...
```

---

## Approval Checklist

- [ ] Architecture approach approved
- [ ] Risk level algorithms reviewed
- [ ] Clinical response logic validated
- [ ] Scheduling mechanism confirmed
- [ ] Safety checks adequate

---

**Ready to proceed with implementation?**
