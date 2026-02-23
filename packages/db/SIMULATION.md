# MindLog Live Data Simulation

> **Full Documentation**: See [docs/live-simulation.md](/docs/live-simulation.md) for comprehensive documentation including architecture, algorithms, configuration, and extension guides.

This system automatically generates realistic patient activity and clinical responses every 8 hours, maintaining a "living" demo environment for mental health professional demonstrations.

## Overview

The simulation runs three times daily (6am, 2pm, 10pm) and generates:

- **Patient Activity**: Daily check-ins, mood scores, sleep/exercise logs, symptoms, triggers, journal entries, medication adherence
- **Clinical Responses**: Alert acknowledgments, routine clinical notes, safety event handling

Data is generated according to clinically realistic patterns based on each patient's risk level.

## Quick Start

### Run Manually

```bash
# From project root
npm run db:simulate

# With verbose output (see each patient)
npm run db:simulate -- --verbose

# Preview without making changes
npm run db:simulate -- --dry-run
```

### Set Up Automatic Scheduling

```bash
# Make the setup script executable
chmod +x packages/db/scripts/setup-simulation-cron.sh

# Set your database connection (or use .env file)
export DATABASE_URL="postgresql://user:password@localhost:5432/mindlogdemo"

# Install the cron job
./packages/db/scripts/setup-simulation-cron.sh

# Check status
./packages/db/scripts/setup-simulation-cron.sh --status

# Remove if needed
./packages/db/scripts/setup-simulation-cron.sh --remove
```

## Developer Setup Instructions

### Prerequisites

1. **Node.js 18+** and npm installed
2. **PostgreSQL** database with MindLog schema
3. **Demo data** seeded (run `npm run db:seed-demo` first)

### Step-by-Step Setup

#### 1. Clone and Install

```bash
git clone <repository-url>
cd MindLog
npm install
```

#### 2. Configure Database Connection

Create a `.env` file in the project root or `packages/db/`:

```env
DATABASE_URL=postgresql://username:password@localhost:5432/mindlogdemo
```

Or export directly:

```bash
export DATABASE_URL="postgresql://username:password@localhost:5432/mindlogdemo"
```

#### 3. Verify Database Has Demo Data

```bash
# Seed demo data if not already done
npm run db:seed-demo

# Optional: Enrich with clinical data
npm run db:enrich-demo
npm run db:enrich-low-risk
```

#### 4. Test the Simulation

```bash
# Run once in dry-run mode to verify
npm run db:simulate -- --dry-run --verbose

# Run for real
npm run db:simulate -- --verbose
```

#### 5. Install Cron Job

```bash
chmod +x packages/db/scripts/setup-simulation-cron.sh
./packages/db/scripts/setup-simulation-cron.sh
```

### Manual Crontab Setup

If you prefer to set up the cron job manually:

```bash
# Open crontab editor
crontab -e

# Add this line (adjust paths as needed):
0 6,14,22 * * * cd /path/to/MindLog && DATABASE_URL="postgresql://user:pass@localhost:5432/mindlogdemo" npm run db:simulate >> /tmp/mindlog-simulation.log 2>&1
```

## How It Works

### Risk-Based Simulation

| Risk Level | Check-in Rate | Mood Range | Volatility |
|------------|---------------|------------|------------|
| Low        | 95%           | 7-10       | ±0.5       |
| Moderate   | 80%           | 4-8        | ±1.5       |
| High       | 65%           | 3-6        | ±2.0       |
| Critical   | 50%           | 2-5        | ±2.5       |

### Time-of-Day Awareness

| Run Time | Focus          | Typical Activity                    |
|----------|----------------|-------------------------------------|
| 6:00 AM  | Morning        | Wake-up entries, medication logs    |
| 2:00 PM  | Afternoon      | Midday check-ins, appointment notes |
| 10:00 PM | Evening        | End-of-day journals, alert reviews  |

### Correlated Data Generation

- **Sleep** affects next-day mood (poor sleep → lower mood)
- **Exercise** provides mood boost (+0.3 to +0.8)
- **Symptoms** inversely correlate with mood
- **Coping scores** track within ±1.5 of mood

### Clinical Response Simulation

- Critical alerts: 80% acknowledged within 4 hours
- Warning alerts: 60% acknowledged within 8 hours
- Routine clinical notes generated for active patients
- Safety events trigger immediate clinical alerts

## Configuration

### Environment Variables

| Variable       | Description                          | Default                         |
|----------------|--------------------------------------|---------------------------------|
| `DATABASE_URL` | PostgreSQL connection string         | Required                        |
| `LOG_FILE`     | Simulation log file path             | `/tmp/mindlog-simulation.log`   |

### Command Line Options

| Option      | Description                              |
|-------------|------------------------------------------|
| `--verbose` | Show patient-by-patient activity         |
| `--dry-run` | Preview without making database changes  |

## Monitoring

### View Logs

```bash
# Follow log in real-time
tail -f /tmp/mindlog-simulation.log

# View recent runs
tail -100 /tmp/mindlog-simulation.log
```

### Check Cron Status

```bash
# List your cron jobs
crontab -l

# Check if simulation cron is installed
./packages/db/scripts/setup-simulation-cron.sh --status
```

### Verify Data Generation

```sql
-- Check today's entries
SELECT risk_level, COUNT(*), ROUND(AVG(mood)::numeric, 1) as avg_mood
FROM daily_entries d
JOIN patients p ON d.patient_id = p.id
WHERE d.entry_date = CURRENT_DATE
GROUP BY risk_level;

-- Check recent simulation activity
SELECT DATE(created_at), COUNT(*)
FROM daily_entries
GROUP BY DATE(created_at)
ORDER BY 1 DESC
LIMIT 7;
```

## Troubleshooting

### Simulation Won't Run

1. **Check DATABASE_URL is set**
   ```bash
   echo $DATABASE_URL
   ```

2. **Verify database connectivity**
   ```bash
   psql $DATABASE_URL -c "SELECT 1"
   ```

3. **Check for existing entries** (simulation skips if entry exists for today)
   ```sql
   SELECT COUNT(*) FROM daily_entries WHERE entry_date = CURRENT_DATE;
   ```

### Cron Job Not Running

1. **Check cron service is running**
   ```bash
   systemctl status cron  # Linux
   ```

2. **Verify cron job is installed**
   ```bash
   crontab -l | grep mindlog
   ```

3. **Check log file for errors**
   ```bash
   tail -50 /tmp/mindlog-simulation.log
   ```

### Data Looks Unrealistic

- Run `npm run db:enrich-low-risk` to establish baseline patterns for low-risk patients
- The simulation builds on existing data, so initial runs may show less variation

## Safety

- The simulation **only runs on the demo organization** ("MindLog Demo Clinic")
- It refuses to run if no demo organization is found
- Uses `ON CONFLICT DO NOTHING` to avoid duplicates
- All timestamps are clearly from the simulation system

## Files

```
packages/db/
├── src/
│   └── live-simulation.ts       # Main simulation engine
├── scripts/
│   └── setup-simulation-cron.sh # Cron setup script
└── SIMULATION.md                # This documentation
```

## Related Scripts

| Script                | Description                                |
|-----------------------|--------------------------------------------|
| `npm run db:seed-demo`       | Create initial demo patients and clinicians |
| `npm run db:enrich-demo`     | Add diagnoses, assessments, clinical notes  |
| `npm run db:enrich-low-risk` | Establish mood patterns for low-risk patients |
| `npm run db:simulate`        | Run live simulation once                    |
