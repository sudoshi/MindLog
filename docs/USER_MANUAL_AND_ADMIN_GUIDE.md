# MindLog v1.1 — User Manual & Administrator Guide

> **Version**: 1.1a | **Last updated**: 2026-02-24 | **Audience**: Patients, Clinicians, System Administrators

---

## Table of Contents

- [Part I — Introduction & Getting Started](#part-i--introduction--getting-started)
  - [1. About MindLog](#1-about-mindlog)
  - [2. System Requirements](#2-system-requirements)
- [Part II — Patient Mobile App](#part-ii--patient-mobile-app)
  - [3. Account Setup & Onboarding](#3-account-setup--onboarding)
  - [4. Today Screen (Home)](#4-today-screen-home)
  - [5. Daily Check-In Flow](#5-daily-check-in-flow)
  - [6. Journal](#6-journal)
  - [7. Insights](#7-insights)
  - [8. Assessments](#8-assessments)
  - [9. Medications](#9-medications)
  - [10. Profile & Settings](#10-profile--settings)
  - [11. Health Data Integration](#11-health-data-integration)
  - [12. Offline Mode & Data Sync](#12-offline-mode--data-sync)
- [Part III — Clinician Web Dashboard](#part-iii--clinician-web-dashboard)
  - [13. Authentication & Session Management](#13-authentication--session-management)
  - [14. Dashboard (Population Overview)](#14-dashboard-population-overview)
  - [15. Patient Roster](#15-patient-roster)
  - [16. Patient Detail](#16-patient-detail)
  - [17. Alert Management](#17-alert-management)
  - [18. Population Trends & Analytics](#18-population-trends--analytics)
  - [19. Reports](#19-reports)
  - [20. Cohort Builder](#20-cohort-builder)
  - [21. Global Search](#21-global-search)
- [Part IV — Administrator Guide](#part-iv--administrator-guide)
  - [22. System Architecture Overview](#22-system-architecture-overview)
  - [23. Deployment & Configuration](#23-deployment--configuration)
  - [24. Database Administration](#24-database-administration)
  - [25. User & Access Management](#25-user--access-management)
  - [26. Alert System & Rules Engine](#26-alert-system--rules-engine)
  - [27. Risk Scoring](#27-risk-scoring)
  - [28. AI Clinical Intelligence](#28-ai-clinical-intelligence)
  - [29. FHIR R4 Interoperability](#29-fhir-r4-interoperability)
  - [30. Research & Data Export](#30-research--data-export)
  - [31. Notifications & Communications](#31-notifications--communications)
  - [32. Security & Compliance](#32-security--compliance)
  - [33. Background Workers & Scheduling](#33-background-workers--scheduling)
  - [34. Monitoring & Observability](#34-monitoring--observability)
- [Part V — Appendices](#part-v--appendices)
  - [A. API Endpoint Reference](#a-api-endpoint-reference)
  - [B. Database Schema Reference](#b-database-schema-reference)
  - [C. Assessment Scales Reference](#c-assessment-scales-reference)
  - [D. Alert Rules Reference](#d-alert-rules-reference)
  - [E. Risk Scoring Factor Reference](#e-risk-scoring-factor-reference)
  - [F. FHIR Resource Mapping Reference](#f-fhir-resource-mapping-reference)
  - [G. Environment Variables Quick Reference](#g-environment-variables-quick-reference)
  - [H. Keyboard Shortcuts (Web Dashboard)](#h-keyboard-shortcuts-web-dashboard)
  - [I. Troubleshooting](#i-troubleshooting)
  - [J. Glossary](#j-glossary)

---

# Part I — Introduction & Getting Started

## 1. About MindLog

### 1.1 What is MindLog

MindLog is a digital mental wellness tracking platform designed for use in clinical settings. It enables patients to record daily mood, sleep, exercise, symptoms, triggers, coping strategies, and journal entries from a mobile app, while clinicians monitor population health, manage alerts, and generate clinical reports from a web dashboard. The platform supports validated clinical assessment scales (PHQ-9, GAD-7, ASRM, C-SSRS, ISI, WHODAS), AI-powered clinical intelligence, FHIR R4 interoperability for EHR integration, and research data export with HIPAA-compliant de-identification.

### 1.2 Who MindLog is For

MindLog serves three distinct audiences:

- **Patients (18+)**: Adults enrolled in outpatient behavioural health programs who use the mobile app to track daily wellness, complete assessments, and communicate with their care team.
- **Clinicians**: Psychiatrists, psychologists, nurses, and care coordinators who use the web dashboard to monitor patient caseloads, triage alerts, review trends, and generate clinical reports.
- **System administrators**: Technical staff responsible for deploying, configuring, and maintaining the MindLog platform infrastructure.

### 1.3 Platform Overview

MindLog consists of three application surfaces:

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Patient mobile app** | React Native + Expo SDK 52 | Daily check-ins, journaling, assessments, medication tracking |
| **Clinician web dashboard** | React 19 + Vite | Population monitoring, alert triage, clinical reports, cohort analysis |
| **Backend API** | Node.js 22 + Fastify 5 | Authentication, data processing, real-time alerts, AI inference |

All three connect to a shared PostgreSQL database with Row-Level Security (RLS) and Redis for real-time messaging and background job processing.

### 1.4 Regulatory Context

- **Market**: United States
- **Classification**: Software as a Medical Device (SaMD), likely FDA Class II
- **Compliance**: HIPAA (Health Insurance Portability and Accountability Act)
- **Patient age**: 18 years and older (v1.0)
- **Alert thresholds**: Provisional — require clinical sign-off before pilot deployment
- **Crisis contacts**: 988 Suicide & Crisis Lifeline, Crisis Text Line (text HOME to 741741)

### 1.5 Key Terminology and Glossary

| Term | Definition |
|------|-----------|
| **Check-in** | A daily wellness entry comprising mood, sleep, exercise, symptoms, triggers, coping strategies, and optional journal |
| **Daily entry** | The database record created by a check-in, stored in the `daily_entries` table |
| **Assessment** | A validated clinical questionnaire (e.g., PHQ-9 for depression, GAD-7 for anxiety) |
| **Risk score** | A composite 0–100 score derived from 7 clinical factors, updated nightly |
| **Risk band** | Severity classification: Low (0–24), Moderate (25–49), High (50–74), Critical (75–100) |
| **Alert** | An automated notification generated when a clinical rule is triggered (e.g., mood decline, missed check-in) |
| **Care team** | The set of clinicians assigned to a patient, each with a role (primary, secondary, covering, supervisor, researcher) |
| **Consent** | An explicit patient permission for data use (e.g., journal sharing, AI insights, research data) |
| **FHIR** | Fast Healthcare Interoperability Resources — the HL7 standard for exchanging healthcare data electronically |
| **RLS** | Row-Level Security — PostgreSQL feature ensuring patients see only their own data and clinicians see only their care team patients |
| **BAA** | Business Associate Agreement — a HIPAA-required contract when PHI is shared with a third-party service |
| **MFA** | Multi-Factor Authentication — a second verification step (TOTP code) required for clinician accounts |
| **Cohort** | A defined group of patients matching specific filter criteria, used for population analysis and research |

---

## 2. System Requirements

### 2.1 Patient Mobile App

| Requirement | Minimum |
|-------------|---------|
| **iOS** | 16.0 or later |
| **Android** | SDK 26 (Android 8.0 Oreo) or later |
| **Internet** | Required for initial setup; offline-first with sync for daily use |
| **Storage** | Approximately 80 MB for app installation |
| **Optional** | HealthKit (iOS) or Health Connect (Android) for passive health data integration |
| **Optional** | Face ID, Touch ID, or fingerprint sensor for biometric lock |

### 2.2 Clinician Web Dashboard

| Requirement | Minimum |
|-------------|---------|
| **Browser** | Chrome, Firefox, Safari, or Edge (latest 2 major versions) |
| **Viewport** | 1280px width recommended (responsive down to 1024px) |
| **JavaScript** | Must be enabled |
| **WebSocket** | Required for real-time alert notifications |
| **Network** | Stable internet connection recommended for real-time features |

### 2.3 Network and Connectivity

- All traffic between client applications and the API is encrypted via HTTPS (TLS 1.2+).
- The WebSocket endpoint at `/api/v1/ws` provides real-time alert broadcasting to connected clinician dashboards.
- The mobile app supports offline data entry with automatic synchronisation when connectivity is restored.

---

# Part II — Patient Mobile App

## 3. Account Setup & Onboarding

### 3.1 Receiving an Invite

MindLog uses an invite-only registration model. Your clinician sends an email invitation containing:

- A personalised message from your clinician (optional)
- An invite code for account creation
- A deep link (`mindlog://invite?token=...`) that opens the MindLog app directly

Invites expire after **7 days**. If your invite has expired, ask your clinician to resend it (they can resend up to 3 times). After 3 resends, a new invite must be created.

### 3.2 Creating Your Account

1. Open the MindLog app and tap **Create Account**.
2. Enter your **invite code** in the field provided. The app validates the code and displays:
   - A green checkmark with "Invited by [Clinician Name] at [Organisation Name]"
   - Your email address is pre-filled from the invite
3. Enter your **first name** and **last name**.
4. Enter your **date of birth** (DD/MM/YYYY format). You must be 18 or older.
5. Confirm your **email address** (pre-filled from the invite; editable).
6. Create a **password** (minimum 12 characters). A strength meter shows three segments:
   - Red: Weak
   - Yellow: Fair
   - Green: Strong
7. **Confirm your password** (a warning appears if passwords do not match).
8. Tap **Create Account** to complete registration.

### 3.3 Signing In

1. Open the MindLog app and tap **Sign In**.
2. Enter your **email address** and **password**.
3. Tap **Sign In**.
4. If your organisation has enabled MFA, enter the **6-digit code** from your authenticator app.

Session tokens expire after 15 minutes of inactivity but are automatically refreshed in the background. Refresh tokens are valid for 7 days.

### 3.4 Consent Wizard (3 Steps)

After creating your account, a three-screen consent wizard guides you through data permissions:

**Step 1 — Welcome**
- A personalised greeting: "Welcome, [First Name]!"
- Introduction to what MindLog does and how your data is protected
- Privacy note: "Your data is encrypted and only visible to you and clinicians on your care team."

**Step 2 — Required Consents**
- Displays the consents you agreed to during account creation (read-only):
  - Terms of Service
  - Privacy Policy
  - HIPAA Acknowledgment

**Step 3 — Optional Consents**
- Two toggleable permissions:
  - **Research Data Sharing**: "Allow your aggregated data to be used for clinical research (fully de-identified)"
  - **AI-Powered Insights**: "Enable AI to generate personalised clinical summaries and risk assessments"
- Both default to off. You can change these later in Settings > Privacy & Consent.

### 3.5 Clinical Intake (7 Steps)

After consents, a clinical intake wizard collects baseline information. Steps marked *(skippable)* can be bypassed by tapping **Skip**.

**Step 1 — Primary Concern** *(required)*
- "What brings you to MindLog?"
- Single-select from: Depression, Anxiety, Bipolar disorder, PTSD, Substance use, Other

**Step 2 — Current Medications** *(skippable)*
- "What medications are you currently taking?"
- Tap "+ Add medication" to enter medication name, dose, unit, frequency, and instructions
- Added medications appear in a list with a remove button

**Step 3 — Key Symptoms** *(skippable)*
- "Which symptoms have you been experiencing?"
- Multi-select checklist: Sleep disturbance, Fatigue / low energy, Difficulty concentrating, Anxiety, Irritability, and others from the symptom catalogue

**Step 4 — Mood Triggers** *(skippable)*
- "What typically triggers your mood changes?"
- Multi-select checklist: Work stress, Relationship conflicts, Sleep disruption, and others from the trigger catalogue

**Step 5 — Emergency Contact** *(skippable)*
- "Who should we contact in a crisis?"
- Fields: Name, phone number, relationship (Family, Friend, Therapist, etc.)

**Step 6 — Daily Reminders** *(required)*
- "What time would you like your daily check-in reminder?"
- Choose morning, afternoon, evening, or a custom time
- Toggle: "Enable push notifications" (requests device permission)

**Step 7 — All Set!**
- Confirmation screen: "You're all set! You're ready to start tracking your mental wellness. Check in daily for best results."
- Tap **Go to Today** to enter the app

### 3.6 Biometric Lock Setup

After onboarding, you can enable biometric authentication in Settings > Biometric Lock:

- **iOS**: Face ID or Touch ID
- **Android**: Fingerprint sensor

When enabled, MindLog locks after **5 minutes** in the background and requires biometric verification to reopen. This protects your health data if someone else accesses your device.

---

## 4. Today Screen (Home)

The Today screen is the first thing you see when opening MindLog. It provides a snapshot of your current wellness status and quick access to all daily activities.

### 4.1 Overview and Layout

- **Personalised greeting**: "Good morning/afternoon/evening, [Name]" with the current date
- **Connectivity indicator**: A chip showing "Synced" (green) when connected or "Offline" (red) when working without internet

### 4.2 Stats Grid

A 2x2 grid of stat cards at the top of the screen:

| Card | Content | Example |
|------|---------|---------|
| **Mood** | Today's mood emoji + score/10 + label | 😊 7/10 "Good" |
| **Streak** | Consecutive days checked in | 🔥 5d |
| **Progress** | Today's check-in completion percentage | 📊 60% |
| **Today** | Whether today's check-in is complete | ✓ Done / ○ Pending |

### 4.3 Quick-Mood Selection

A row of 5 emoji buttons for rapid mood logging without starting a full check-in:

| Emoji | Score | Colour |
|-------|-------|--------|
| 😢 | 2 | Red |
| 😕 | 4 | Orange |
| 😐 | 6 | Yellow |
| 🙂 | 8 | Light green |
| 😄 | 10 | Green |

Tapping an emoji triggers a spring animation and haptic feedback, immediately recording your mood for the day.

### 4.4 Mood Pip Selector

Below the quick-mood row, a full 1–10 scale with colour-coded circular pips. Each pip is numbered and colour-coded from red (1) through yellow (5) to green (10). Tap any pip to set your precise mood score.

### 4.5 Check-in Progress and CTA

A card showing your check-in status:

- **Not started**: "Start today's check-in" button (teal)
- **In progress**: "Continue check-in" button with a thin progress bar showing completion percentage
- **Completed**: "Check-in complete ✓" (greyed out)

Five section indicators show which parts of the check-in are done:
- 🌡️ Mood & Coping
- 💚 Wellness
- ⚡ Triggers
- 🔍 Symptoms
- 📓 Journal

Each shows ✓ (green) when completed or · (grey) when pending.

### 4.6 Medication Reminders Card

If you have medications configured, a card displays:

- 💊 **Medications** heading
- Count of medications to log: "3 medication(s) to log today"
- Preview of up to 3 unlogged medications
- "+N more..." if there are more than 3
- Or: "✓ All N medication(s) taken today" when all are logged

### 4.7 Assessment Banners

When clinical assessments are due, light blue banners appear:

- Scale name: "Weekly check-in due — PHQ-9"
- Estimated time: "~2 min · Tap to start"
- Tap to navigate to the assessment questionnaire

Up to 2 assessment banners display at once.

### 4.8 Passive Health Data Card

If health data permissions are granted:
- Displays yesterday's data: steps, sleep hours, resting heart rate, HRV (ms)
- Heading: "❤️ Yesterday's Health · [Date]"

If permissions are not granted:
- Displays: "🏃 Connect Health Data" with a CTA to enable HealthKit or Health Connect

### 4.9 Safety Resources Card

Always visible at the bottom of the Today screen:

- "Need immediate support?"
- **988 Suicide & Crisis Lifeline**: Call or text 988
- **Crisis Text Line**: Text HOME to 741741

---

## 5. Daily Check-In Flow

### 5.1 Overview

The daily check-in is a 9-step guided flow that captures a comprehensive picture of your day. Steps 2–8 are skippable — you can complete as much or as little as you like. Completing more steps improves the accuracy of your insights and your clinician's ability to support you.

### 5.2 Step 1: Mood & Sleep

- **Mood score**: 1–10 scale with emoji labels (😢 to 😄) and colour gradient
- **Sleep hours**: Numeric input (0–24 hours)
- **Exercise minutes**: Numeric input
- **Notes**: Optional free-text field

### 5.3 Step 2: Energy & Mania Screening *(skippable)*

- **Mania score**: 0–15 slider (ASRM-informed mood pole assessment)
- **Racing thoughts**: Yes/No toggle
- **Decreased sleep need**: Yes/No toggle

The heading reads: "How's your energy level today?"

### 5.4 Step 3: Wellbeing *(skippable)*

- **Anxiety score**: 0–3 scale (None / Mild / Moderate / Severe)
- **Somatic anxiety**: Yes/No toggle
- **Anhedonia score**: 0–3 scale (loss of interest/pleasure)
- **Suicidal ideation**: 0–3 scale:
  - 0 = None
  - 1 = Passing thoughts
  - 2 = Frequent thoughts
  - 3 = Plan or intent
- **Social score**: 0–10 scale
- **Social avoidance**: Yes/No toggle
- **Cognitive score**: 0–10 scale (brain fog / concentration)
- **Stress score**: 0–10 scale

### 5.5 Step 4: Lifestyle *(skippable)*

- **Substance use**: Dropdown (None, Alcohol, Cannabis, Other)
- **Substance quantity**: Numeric input (if substance selected)
- **Appetite score**: 0–10 scale
- **Life event note**: Free-text for significant events

### 5.6 Step 5: Coping Strategies *(skippable)*

A list of coping strategies loaded from your personal catalogue. For each strategy:
- Name and category displayed
- "I used this" toggle
- If used: "Did it help?" sub-toggle (Yes / No / Neutral)

### 5.7 Step 6: Triggers *(skippable)*

A list of mood triggers loaded from your personal catalogue. For each trigger:
- Name, category, and icon displayed
- Severity slider (0–10)

### 5.8 Step 7: Symptoms *(skippable)*

A list of symptoms loaded from your personal catalogue. For each symptom:
- Name and category displayed
- Intensity slider (0–10)

### 5.9 Step 8: Journal *(skippable)*

- **Title**: Optional text input (up to 200 characters)
- **Body**: Free-text area (up to 10,000 characters)
- **Share with clinician**: Yes/No toggle

If you navigated here from a voice transcription, the journal body is pre-filled with the transcript.

### 5.10 Step 9: Review & Submit

A summary card displays all entered data in read-only format:
- Section-by-section recap (e.g., "Mood: 7/10, Sleep: 7h, Exercise: 30 min")
- Completion percentage

Tap **Submit check-in** to save. A success haptic confirms submission and you are returned to the Today screen.

---

## 6. Journal

### 6.1 Journal Entry List

The Journal tab displays all your journal entries in reverse chronological order. Each entry card shows:

- **Date**: Formatted as "Mon, Feb 24"
- **Word count**: e.g., "347 words"
- **Sharing status**: "Shared with care team" (if applicable)

While entries are loading, three skeleton card placeholders with a shimmer effect are displayed. If you have no entries, an empty state displays: "No journal entries yet. Writing helps you understand your patterns."

### 6.2 Creating a Journal Entry

You can create a journal entry in two ways:
1. **Via check-in**: Step 8 of the daily check-in flow includes a journal section
2. **Direct**: Tap the "+ New" button on the Journal tab, which navigates to the check-in journal step

### 6.3 Voice Journaling

Tap the 🎙 microphone button on the Journal tab to open the voice recorder:

1. **Start recording**: Tap "🎙 Start Recording" — an animated waveform (20 bars) visualises audio levels
2. **Recording indicator**: A pulsing red dot with a countdown timer (maximum 5 minutes). The timer turns orange when less than 30 seconds remain.
3. **Stop and transcribe**: Tap "⏹ Stop & Transcribe" — a spinner appears with "Transcribing..."
4. **Review**: The transcript appears pre-filled in the journal entry for editing

Voice transcription uses the Whisper speech-to-text model. You are limited to **5 transcriptions per hour**.

### 6.4 Sharing Entries with Your Care Team

Each journal entry has a sharing toggle:
- **Shared**: Your care team clinicians can read the entry in the Journal tab of your patient detail page
- **Not shared**: The entry is private and visible only to you

Clinicians can only see the entries you explicitly share. They cannot see private entries, edit your entries, or share them further.

---

## 7. Insights

The Insights tab analyses your check-in data over the last 30 days to surface patterns and trends.

### 7.1 Mood Trends

A **7-day mood bar chart** displays your recent mood scores:
- Each day shows a colour-coded bar (height proportional to mood/10)
- Day labels (Mon–Sun) appear below each bar
- Days without a check-in show a faded bar
- Below the chart: "30-day average: X.X"

### 7.2 Stats Overview

A 2x2 grid of 30-day summary statistics:

| Stat | Description | Example |
|------|-------------|---------|
| **Check-ins** | Days checked in out of 30 | 22/30 |
| **Avg mood** | Mean mood score | 6.4/10 |
| **Avg sleep** | Mean sleep hours | 7.2 hours |
| **Avg exercise** | Mean daily exercise | 25 min/day |

### 7.3 Mood Correlations

After logging at least **7 check-ins**, two correlation cards appear:

- **🌙 Sleep → Mood**: Shows how your sleep hours correlate with next-day mood
- **🏃 Exercise → Mood**: Shows how exercise minutes correlate with mood

Each card displays:
- Correlation strength: Weak, Moderate, or Strong
- Direction: Positive (more sleep/exercise → better mood) or Negative
- Correlation coefficient (r value)

Before 7 check-ins, a placeholder shows: "Log N more check-ins to see correlations."

### 7.4 Top Triggers, Strategies, and Symptoms

**Most Common Triggers**: Your top 3 triggers ranked by frequency (e.g., "Work stress — 5×")

**What's Helping**: Your top 3 coping strategies ranked by frequency, with average mood on days used

### 7.5 AI-Powered Insights (When Enabled)

If AI insights are enabled for your organisation and you have granted AI consent:

- **Risk gauge**: A horizontal track showing your composite risk score (0–100) with colour bands:
  - Green (0–24): Low
  - Yellow (25–49): Moderate
  - Orange (50–74): High
  - Red (75–100): Critical
- **Risk delta**: Change since last assessment (e.g., "▲ +5 pts since last week" or "▼ −3 pts")
- **Key findings**: Up to 5 bullet points summarising clinical observations
- **Clinical narrative**: AI-generated summary of your recent wellness trajectory
- **HIPAA disclaimer**: "AI-generated insights are for informational purposes only and do not constitute medical advice."

If AI is not available, a locked state displays with an explanation. If you have not granted consent, a prompt links to Privacy Settings.

---

## 8. Assessments

### 8.1 What Are Validated Assessments

Validated assessments are standardised clinical questionnaires widely used in mental health care. MindLog supports six scales that your care team may request you to complete at regular intervals.

### 8.2 PHQ-9 (Patient Health Questionnaire — Depression)

- **Purpose**: Screens for depression severity
- **Questions**: 9 items about the last 2 weeks
- **Response options**: Not at all (0), Several days (1), More than half the days (2), Nearly every day (3)
- **Score range**: 0–27
- **Severity thresholds**:
  - 0–4: Minimal depression
  - 5–9: Mild depression
  - 10–14: Moderate depression
  - 15–19: Moderately severe depression
  - 20–27: Severe depression (care team notified)
- **LOINC code**: 44249-1
- **Reassessment interval**: 7 days

**Questions**:
1. Little interest or pleasure in doing things
2. Feeling down, depressed, or hopeless
3. Trouble falling/staying asleep or sleeping too much
4. Feeling tired or having little energy
5. Poor appetite or overeating
6. Feeling bad about yourself — or that you are a failure or have let yourself or your family down
7. Trouble concentrating on things, such as reading or watching television
8. Moving or speaking so slowly that others could have noticed — or the opposite, being fidgety or restless
9. Thoughts that you would be better off dead or of hurting yourself in some way

### 8.3 GAD-7 (Generalised Anxiety Disorder)

- **Purpose**: Screens for anxiety severity
- **Questions**: 7 items about the last 2 weeks
- **Response options**: Not at all (0), Several days (1), More than half the days (2), Nearly every day (3)
- **Score range**: 0–21
- **Severity thresholds**:
  - 0–4: Minimal anxiety
  - 5–9: Mild anxiety
  - 10–14: Moderate anxiety
  - 15–21: Severe anxiety (care team notified)
- **LOINC code**: 69737-5
- **Reassessment interval**: 7 days

**Questions**:
1. Feeling nervous, anxious, or on edge
2. Not being able to stop or control worrying
3. Worrying too much about different things
4. Trouble relaxing
5. Being so restless that it is hard to sit still
6. Becoming easily annoyed or irritable
7. Feeling afraid, as if something awful might happen

### 8.4 ASRM (Altman Self-Rating Mania Scale)

- **Purpose**: Screens for manic or hypomanic episodes
- **Questions**: 5 items about the last week
- **Response options**: Absent / no change (0), Slightly present (1), Present to a significant degree (2), Present to an extreme degree (3)
- **Score range**: 0–15
- **Threshold**: Score ≥ 6 indicates a possible manic/hypomanic episode (care team notified)
- **Reassessment interval**: 7 days

**Questions**:
1. Positive mood / elevated spirits
2. Increased self-confidence
3. Decreased need for sleep
4. Increased speech or talkativeness
5. Increased activity or energy

### 8.5 C-SSRS (Columbia Suicide Severity Rating Scale)

- **Purpose**: Screens for suicidal ideation and risk
- **Questions**: 4 binary (Yes/No) items about current state
- **Score range**: 0–4
- **Risk levels**:
  - 0: No ideation
  - 1: Passive ideation (care team follow-up)
  - 2–4: Elevated suicidal ideation (crisis alert, care team notified immediately)
- **LOINC code**: 89213-1
- **Reassessment interval**: 7 days

**Questions**:
1. Have you wished you were dead or wished you could go to sleep and not wake up?
2. Have you had any actual thoughts of killing yourself?
3. Have you been thinking about how you might do this?
4. Have you had any intention of acting on these thoughts?

A crisis notice is always visible during this assessment. If your score is ≥ 2, you are shown crisis contact information: **Call or text 988**.

### 8.6 ISI (Insomnia Severity Index)

- **Purpose**: Assesses insomnia severity
- **Questions**: 7 items
- **Response options**: 0–4 scale per item
- **Score range**: 0–28
- **Severity thresholds**:
  - 0–7: No clinically significant insomnia
  - 8–14: Subthreshold insomnia
  - 15–21: Clinical insomnia (moderate)
  - 22–28: Clinical insomnia (severe)
- **LOINC code**: 89794-0
- **Reassessment interval**: 14 days

### 8.7 WHODAS 2.0 (WHO Disability Assessment Schedule)

- **Purpose**: Assesses functional disability across life domains
- **Domains**: Cognition, mobility, self-care, getting along, life activities, participation
- **Reassessment interval**: 30 days

### 8.8 Reassessment Intervals and Reminders

| Scale | Interval | Notification |
|-------|----------|-------------|
| PHQ-9 | 7 days | Assessment banner on Today screen + push notification |
| GAD-7 | 7 days | Assessment banner on Today screen + push notification |
| ASRM | 7 days | Assessment banner on Today screen + push notification |
| C-SSRS | 7 days | Assessment banner on Today screen + push notification |
| ISI | 14 days | Assessment banner on Today screen |
| QIDS-SR | 14 days | Assessment banner on Today screen |
| WHODAS | 30 days | Assessment banner on Today screen |

Your clinician can also request an assessment at any time, which triggers a push notification.

---

## 9. Medications

### 9.1 Viewing Today's Medications

The Medications tab shows all active medications with today's adherence status. A progress bar at the top shows "N of M taken today." When all medications are logged: "All taken today!"

Each medication card displays:
- Medication name (bold)
- Dose and unit (e.g., "50 mg")
- Frequency (e.g., "Once daily (morning)")
- Instructions (if provided, italicised)
- Logged time (if taken): "Logged at 8:30 AM"

### 9.2 Logging Adherence

Each medication card has two buttons:
- **Taken** (green when active): Marks the medication as taken for today
- **Skip** (red when active): Marks as skipped

Both buttons trigger haptic feedback on press. A spinner appears during the network request.

### 9.3 Adding a New Medication

Tap **+ Add** to open the Add Medication modal:

| Field | Required | Details |
|-------|----------|---------|
| Medication name | Yes | Free-text input |
| Dose | No | Numeric input |
| Unit | No | Dropdown: mg, ml, mcg, etc. |
| Frequency | No | Horizontal chip scroll with presets: Once daily (morning), Once daily (evening), Once daily (bedtime), Twice daily, Three times daily, As needed, Weekly, Other |
| Instructions | No | Multi-line text input |
| Show in daily reminders | No | Toggle switch (default: on) |

Tap **Add Medication** to save. The "Add Medication" button is disabled until a name is entered.

A safety notice always appears at the bottom: "Never stop or change a medication without consulting your care team. Crisis? Call or text 988."

### 9.4 Medication History

Discontinued medications are listed in a separate section below active medications. Each shows the discontinuation date and reason (if provided).

---

## 10. Profile & Settings

### 10.1 Account Card

The Profile tab shows your account information:

- **Avatar**: Circle with your initials, coloured with the app's primary accent
- **Name and email**
- **Stats row** (3 columns with dividers):
  - Day streak (current consecutive check-in days)
  - Best streak (all-time longest streak)
  - Member since (month and year of account creation)

### 10.2 Appearance

Navigate to Settings > Appearance (or use the settings index page) to choose your theme:

| Option | Description |
|--------|-------------|
| ⚙️ System | Follows your device's light/dark mode setting |
| ☀️ Light | Always use light theme |
| 🌙 Dark | Always use dark theme |

The current selection is highlighted with a teal border and background.

### 10.3 Notification Preferences

Navigate to Settings > Notifications to configure:

| Setting | Default | Description |
|---------|---------|-------------|
| Daily reminder | On | Enable/disable the daily check-in reminder |
| Reminder time | Morning | HH:MM time picker for when the reminder fires |
| Medication reminders | On | Reminders for unlogged medications |
| Streak notifications | On | Celebrate streak milestones |
| Appointment reminders | On | Upcoming appointment alerts |

### 10.4 Biometric Lock Management

Navigate to Settings > Biometric Lock to:
- **Enable**: Enroll Face ID, Touch ID, or fingerprint
- **Disable**: Remove biometric requirement

When enabled, the app locks after 5 minutes in the background and requires biometric verification to reopen.

### 10.5 Privacy & Consent Management

Navigate to Settings > Privacy & Consent to:

- **View active consents**: See which consents are granted and when
- **Withdraw optional consents**: Toggle off any of:
  - AI Insights
  - Research Data Sharing
  - Journal Sharing
  - Emergency Contact Sharing
- **Required consents** (Terms of Service, Privacy Policy, HIPAA Acknowledgment) cannot be withdrawn while your account is active

Consent changes are recorded with timestamps and IP addresses in an append-only audit log.

### 10.6 Crisis Resources

The Profile tab includes a crisis resources card:

- 📞 **988 Suicide & Crisis Lifeline**: Call or text 988
- 💬 **Crisis Text Line**: Text HOME to 741741
- 🎖️ **Veterans Crisis Line**: Call 988, press 1

### 10.7 Signing Out

Tap **Sign Out** at the bottom of the Profile tab. A confirmation alert appears before clearing your session. After signing out, you are returned to the login screen.

The app version is displayed at the bottom: "MindLog v1.1a · US edition."

---

## 11. Health Data Integration

### 11.1 Supported Platforms

| Platform | Library | iOS Version | Android Version |
|----------|---------|-------------|----------------|
| Apple HealthKit | react-native-health | iOS 16+ | N/A |
| Health Connect | react-native-health-connect | N/A | Android 8.0+ |

### 11.2 Granting Permissions

When you tap "Connect Health Data" on the Today screen or during onboarding:

1. A system permission dialog appears listing the data types MindLog requests
2. You can grant or deny individual data types
3. MindLog only requests **read** permissions — it never writes to your health data

If you deny permissions, MindLog will prompt again after **30 days**. You can also grant permissions at any time through your device's Settings app.

### 11.3 Data Collected

| Data Type | Unit | Description |
|-----------|------|-------------|
| Steps | Count | Daily step count |
| Active calories | kcal | Calories burned through activity |
| Resting heart rate | bpm | Resting heart rate |
| Heart rate variability (HRV) | ms | Beat-to-beat interval variation |
| Sleep duration | Hours | Total sleep time |
| Sleep stages | % | Deep sleep and REM percentages |
| Oxygen saturation (SpO2) | % | Blood oxygen level |

### 11.4 Sync Frequency and Privacy

- Health data is fetched for **yesterday and today** each time the app syncs
- Data is uploaded to `POST /health-data/sync` as a batch
- Each snapshot is deduplicated by (patient, date, source)
- Syncs happen silently in the background — errors are not surfaced to you
- Your health data is protected by the same Row-Level Security as all other MindLog data

### 11.5 Revoking Health Data Access

To stop sharing health data with MindLog:

- **iOS**: Settings > Health > MindLog > revoke individual data types
- **Android**: Settings > Health Connect > MindLog > revoke permissions

MindLog will no longer collect new data but previously synced data remains in your account.

---

## 12. Offline Mode & Data Sync

### 12.1 How Offline Mode Works

MindLog is designed to work even when you don't have an internet connection. Data is stored locally on your device using WatermelonDB, a high-performance local database. The Today screen displays "Offline" in red when no connection is detected.

### 12.2 What Works Offline

| Feature | Offline Support |
|---------|----------------|
| Daily check-ins | Full — saved locally, synced later |
| Journal entries | Full — saved locally, synced later |
| Medication logging | Full — saved locally, synced later |
| Viewing past entries | Full — cached locally |
| Assessments | Partial — questionnaire works, submission queued |
| AI insights | Not available — requires server connection |
| Voice transcription | Not available — requires server connection |
| Health data sync | Queued — syncs when connection restored |

### 12.3 Sync on Reconnection

When internet connectivity is restored:
1. The app automatically detects the connection change
2. All queued entries are uploaded to the server in chronological order
3. The connectivity indicator changes from "Offline" to "Synced"
4. Any new data from the server (e.g., medication changes by your clinician) is downloaded

### 12.4 Conflict Resolution

If the same daily entry is modified both locally (offline) and on the server:
- **Last-write-wins**: The most recent modification takes precedence
- Conflicts are rare because daily entries are typically only edited on the same day they are created

---

# Part III — Clinician Web Dashboard

## 13. Authentication & Session Management

### 13.1 Logging In

1. Navigate to your organisation's MindLog web dashboard URL (e.g., `https://dashboard.mindlog.app`)
2. Enter your **email address** and **password**
3. Click **Sign In**

If credentials are invalid, the form displays an error. Login attempts are rate-limited to **10 per minute** per IP address to prevent brute-force attacks.

### 13.2 Multi-Factor Authentication

If your organisation requires MFA (recommended for all clinician accounts):

1. After entering your password, you are prompted for a **6-digit TOTP code**
2. Open your authenticator app (Google Authenticator, Authy, 1Password, etc.) and enter the current code
3. Click **Verify**

MFA enrollment is configured by your system administrator. Once enabled, MFA is required on every login.

### 13.3 Session Timeout and Re-authentication

- **Access tokens** expire after **15 minutes** of inactivity
- The dashboard automatically refreshes tokens in the background using a refresh token (valid for 7 days)
- If both tokens expire (e.g., browser left idle overnight), you are redirected to the login screen
- After 7 days of inactivity, you must sign in again with full credentials + MFA

### 13.4 Logging Out

Click your avatar or name in the sidebar footer, then click **Sign Out**. Your session is invalidated immediately.

---

## 14. Dashboard (Population Overview)

The Dashboard is the default landing page after login. It provides a population-level view of your entire caseload at a glance.

### 14.1 Layout and Navigation

The dashboard uses a sidebar + main content layout:

**Sidebar navigation** (left panel, width ~250px):
- 🏠 Dashboard
- 👥 Patients
- 🔔 Alerts (with live count badge)
- 📊 Trends
- 📋 Reports
- 🔬 Cohort Builder (admin only)
- ⚙️ Admin (admin only)

**Keyboard shortcuts**:
- `/` or `Cmd+K`: Open global search
- `N`: Open quick note panel (when on a patient detail page)

### 14.2 Five-Metric Summary Row

A horizontal row of five summary cards at the top of the dashboard:

| Metric | Description | Visual |
|--------|-------------|--------|
| **Critical alerts** | Count of unresolved critical-severity alerts | Red badge |
| **Active today** | Patients who have checked in today | Count / total |
| **Average mood** | Population mean mood score (7-day) | Score / 10 |
| **Average sleep** | Population mean sleep hours (7-day) | Hours |
| **Check-in rate** | Percentage of patients who checked in (7-day) | Percentage |

Each metric card is **clickable** — tapping opens a drilldown modal showing the individual patients contributing to that metric, with their name, mood, and last check-in date.

### 14.3 Caseload Mood Grid

A grid of small coloured cells, one per patient, arranged in rows. Each cell is colour-coded by the patient's most recent mood score (using the standard mood colour gradient from red to green). Hovering over a cell shows a tooltip with the patient's name and current mood.

### 14.4 Mood Distribution Chart

A bar chart grouping patients by mood range:
- **Low (1–3)**: Red
- **Moderate (4–5)**: Orange/yellow
- **Good (6–7)**: Light green
- **High (8–10)**: Green

### 14.5 Active Alerts Panel

Displays the **5 most recent** open alerts, each showing:
- Alert severity icon (🔴 critical, 🟡 warning, 🟢 info)
- Patient name (linked to patient detail)
- Alert title (e.g., "Mood decline detected — 3.2pt drop")
- Timestamp (relative: "2 hours ago")

A "View all alerts" link navigates to the full Alert Management page.

### 14.6 Check-in Activity Feed

The **8 most recent** check-ins from across your caseload:
- Patient name
- Mood dot (colour-coded)
- Mood score
- Timestamp

### 14.7 Real-Time Updates

The dashboard maintains a WebSocket connection to the API at `/api/v1/ws`. When a new alert is generated or a patient submits a check-in:

- The alert panel updates automatically (no page refresh needed)
- The sidebar Alerts badge count increments in real time
- A toast notification slides in from the top-right corner for critical alerts
- The mood grid and summary metrics refresh on the next data poll

---

## 15. Patient Roster

### 15.1 Patient List View

The Patients page displays a sortable, filterable table of all patients on your care team:

| Column | Content |
|--------|---------|
| **Name** | First + last name |
| **MRN** | Medical record number |
| **Risk** | Pill-shaped badge: Low (green), Moderate (yellow), High (orange), Critical (red) |
| **Status** | Badge: Active, Crisis, Inactive, Discharged |
| **Today's mood** | Colour-coded dot + score, or "—" if no check-in |
| **Streak** | Consecutive check-in days |
| **Last check-in** | Relative timestamp ("2h ago", "Yesterday", "3d ago") |
| **Alerts** | Count of unresolved alerts (red if critical) |

### 15.2 Filtering

Filter chips appear above the table. Click to toggle:

| Chip | Shows |
|------|-------|
| **All** | All patients on your care team |
| **Crisis** | Patients with status = "crisis" |
| **High Risk** | Patients with risk score ≥ 50 |
| **Not Logged Today** | Patients who have not checked in today |
| **Streak 7d+** | Patients with 7+ consecutive check-in days |

Multiple filters can be active simultaneously. Active filters are highlighted.

### 15.3 Sorting Options

Click any column header to sort. Options include:
- Risk level (highest first)
- Mood (lowest first — identifies patients needing attention)
- Streak (highest first — identifies engaged patients)
- Last check-in (oldest first — identifies disengaged patients)
- Name (alphabetical)

### 15.4 Search

A search bar at the top performs full-text search by:
- Patient name (first or last)
- MRN (medical record number)

Results filter the table in real time as you type.

### 15.5 Inviting a New Patient

Click **+ Invite Patient** to open the invite modal:

1. Enter the patient's **email address**
2. Optionally add a **personal message** (up to 500 characters) that will be included in the invite email
3. Click **Send Invite**

The invite appears in a **Pending Invites** table below the patient list, showing:
- Email address
- Sent date
- Expiry (7 days from creation)
- Resend button (available up to 3 times total)
- Cancel button

### 15.6 Navigating to Patient Detail

Click any row in the patient table to navigate to that patient's detail page.

---

## 16. Patient Detail

The Patient Detail page provides a comprehensive view of an individual patient's health data, organised into tabs.

### 16.1 Header Section

A persistent header at the top of the page displays:

- **Patient name** (large heading)
- **Status badge**: Active (green), Crisis (red), Inactive (grey), Discharged (muted)
- **Risk badge**: Low/Moderate/High/Critical with corresponding colour
- **Demographics**: Date of birth, MRN
- **Streak**: Current consecutive check-in days
- **Last check-in**: Relative timestamp
- **Care team**: Avatars + names of assigned clinicians with roles
- **Actions**: "Request Assessment" dropdown (PHQ-9, GAD-7, ASRM, C-SSRS, ISI)

### 16.2 Overview Tab

The default tab, showing:

- **Profile card**: Name, email, DOB, MRN, diagnosis, primary clinician, member since
- **Last check-in card**: Most recent mood, sleep, exercise, and key metrics
- **Care team list**: All assigned clinicians with roles (primary, secondary, covering, supervisor, researcher)
- **Quick actions**: Links to request assessment, create note, view alerts

### 16.3 Trends Tab

Visual analytics for the patient over the last 90 days:

**Mood trend line chart** (90 days):
- X-axis: dates
- Y-axis: mood score (1–10)
- Colour-coded data points by mood value
- Comparison toggle: overlay PHQ-9 scores on the same chart

**Assessment score history**:
- Multi-scale overlay chart supporting PHQ-9, GAD-7, ASRM, ISI, C-SSRS, and WHODAS
- Clinical cut-off reference lines drawn at severity thresholds (Mild, Moderate, Severe)
- Toggle individual scales on/off

**Activity heatmap grid** (90 days):
- Day-by-day grid where each cell's colour intensity represents check-in completeness
- Green = full check-in, yellow = partial, grey = no check-in

### 16.4 Journal Tab

Shared journal entries from the patient (only entries the patient has explicitly shared):

- Date and word count
- Entry body (truncated to a preview, expandable)
- No editing or sharing controls (read-only for clinicians)

If no entries are shared: "No shared journal entries. The patient controls which entries are shared."

### 16.5 Notes Tab

Clinician notes about this patient, organised by type:

**Note types**:
- Observation
- Intervention
- Appointment Summary
- Risk Assessment
- Handover
- Custom

Each note displays:
- Author name and title
- Date and time
- Note body
- Privacy indicator: 🔒 Private (only visible to the author) or 👁 Visible (shared with care team)

**Pagination**: 10 notes per page with Previous/Next navigation.

**Quick note creation**: Press `N` to open a slide-in panel from the right, or click the "+" button. Enter the note body (up to 5,000 characters), select a type, toggle privacy, and click Save.

### 16.6 Alerts Tab

This patient's alert history with filters:

| Filter | Shows |
|--------|-------|
| All | Complete alert history |
| Open | Unresolved alerts |
| Acknowledged | Alerts a clinician has acknowledged |
| Resolved | Resolved or auto-resolved alerts |

Each alert shows: severity, rule name, title, body, timestamp, and current status.

### 16.7 Medications Tab

**Active medications** section:
- Name, dose, frequency, instructions
- Adherence metric: "Taken X/Y times logged" with a mini bar chart

**Discontinued medications** section:
- Name, dose, discontinued date, reason

### 16.8 AI Insights Tab (When Enabled)

This tab is only visible when `AI_INSIGHTS_ENABLED=true` and the patient has granted AI consent. It uses a two-column layout:

**Left column (480px) — Risk Assessment & Signals**:

1. **Risk score arc gauge**: SVG semicircular gauge (0-100) with four colour segments (green/yellow/orange/red). Shows current score, risk band label, and a delta indicator (arrow + point change from previous assessment). The needle dot highlights the current position on the arc.

2. **Domain-grouped risk factor bars**: Ten graduated risk factors organised into five clinical domains (Safety, Mood, Engagement, Physical, Medication). Each domain is a collapsible section showing:
   - Domain total contribution
   - Per-factor graduated horizontal bar (contribution vs. maximum weight)
   - Numeric score and explanatory detail text for active factors
   - Literature-backed graduation logic (e.g., "Level 2 ideation, 8d ago, 0.8x recency decay")

3. **Trajectory sparklines**: SVG mini-charts (160x40px) showing 90-day longitudinal trends for risk score, PHQ-9, and GAD-7. Last data point highlighted with trend arrow and latest value.

4. **Early warning signals**: Urgency-sorted (urgent > elevated > routine) warning boxes from the latest deep analysis. Each warning shows urgency indicator, clinical domain badge, and signal description. Urgent items display a pulsing dot.

5. **Generate button**: Dropdown to trigger either "Deep Analysis" (30-day enriched snapshot, structured findings) or "Weekly Summary" (7-day narrative). Includes HIPAA disclaimer.

**Right column (flex) — Deep Insights & Chat**:

1. **Deep insight panel**: Structured display of the latest AI insight, with sections for:
   - Clinical trajectory badge (Improving/Stable/Declining/Acute) with rationale
   - Key findings (bulleted list)
   - Domain finding cards (2-column grid: Mood, Sleep, Anxiety, Social, Medications)
   - Treatment response assessment
   - Recommended focus areas (numbered priorities)
   - Cross-domain patterns
   - Expandable full narrative
   - Falls back to legacy single-narrative display for older insights without structured findings

2. **Insight history timeline**: Chronological list of past insights (last 10), each expandable to show the full narrative.

3. **AI chat**: Multi-turn clinical conversation about this specific patient. A 30-day clinical snapshot is injected as system context each turn. Full conversation history is preserved across turns. Previous discussions are listed with timestamps. Each message shows the model used and token count. Chat is synchronous (not queued). Typical response time is 2–8 seconds depending on the AI provider.

---

## 17. Alert Management

### 17.1 Organisation-Wide Alert Feed

The Alerts page displays all alerts across your organisation, newest first. Filter chips:

| Filter | Shows |
|--------|-------|
| All | All alerts |
| Critical | Severity = critical (red) |
| Warning | Severity = warning (orange) |
| Info | Severity = info (green) |
| Unacknowledged | Not yet acknowledged by a clinician |
| Resolved | Resolved or auto-resolved |

Each alert row shows: severity badge, patient name (linked), rule type, title, body, timestamp, and action buttons.

### 17.2 Alert Triage Workflow

Alerts follow a lifecycle:

```
Generated → Open → Acknowledged (with note) → Resolved
                                              → Escalated
```

**Acknowledge**: Click the alert, add an optional clinical note, and click "Acknowledge." The alert is marked with your name and timestamp.

**Resolve**: After following up, click "Resolve" to close the alert.

**Escalate**: If the situation requires supervisor attention, click "Escalate" — this changes severity and notifies designated escalation contacts.

### 17.3 Alert Types

| Rule Key | Alert Type | Trigger Condition | Default Severity |
|----------|-----------|-------------------|-----------------|
| RULE-001 | Mood decline | 2.5+ point mood drop in 24h | Warning |
| RULE-001 | Mood decline (critical) | 3.5+ point mood drop in 24h | Critical |
| RULE-002 | Missed check-in | 3+ consecutive days without check-in | Info |
| RULE-002 | Missed check-in (critical) | 5+ consecutive days | Warning |
| RULE-003 | Trigger escalation | Severity 7+ on 3+ days | Warning |
| RULE-004 | Safety flag | C-SSRS ≥ 2 or suicidal_ideation ≥ 2 | Critical |
| RULE-005 | Med non-adherence | 2+ missed doses | Warning |
| RULE-006 | Sleep disruption | Persistent sleep pattern deviation | Warning |
| RULE-007 | Exercise decline | Significant decrease in activity | Info |
| RULE-008 | Journal sentiment | Negative sentiment trend detected | Info |

### 17.4 Real-Time Alert Notifications

When a new alert is generated:
1. The WebSocket broadcasts `alert.created` to all connected clinicians in the organisation
2. A toast notification slides in from the top-right corner (critical alerts are persistent until dismissed)
3. The sidebar Alerts badge increments
4. If configured, email and/or push notifications are sent based on `alert_routing_rules`
5. For critical safety alerts: SMS can also be sent via Twilio

---

## 18. Population Trends & Analytics

The Trends page provides aggregate analytics across your patient caseload.

### 18.1 Time Range Selection

A segmented control at the top lets you choose the analysis window:
- **7 days** | **14 days** | **30 days** | **90 days**

### 18.2 Summary Stats

Three headline metrics for the selected period:
- **Avg mood**: Mean mood score across all patients
- **Check-in rate**: Percentage of patient-days with a check-in
- **Active patients**: Count of patients with at least one check-in in the period

### 18.3 Mood Distribution Bar Chart

Bar chart showing patient counts by mood range (Low 1–3, Moderate 4–5, Good 6–7, High 8–10) for the selected period.

### 18.4 Medication Adherence Gauge

A radial gauge showing the overall medication adherence percentage across your caseload (doses taken / doses expected).

### 18.5 30-Day Historical Mood Trend Line

A dual-axis line chart showing:
- **Left Y-axis**: Mean mood score (1–10)
- **Right Y-axis**: Check-in rate (0–100%)
- **X-axis**: Days

### 18.6 Risk Distribution

A stacked bar chart showing patient counts by risk band:
- Crisis (dark red)
- Critical (red)
- High (orange)
- Moderate (yellow)
- Low (green)
- Inactive (grey)

### 18.7 Tracking Engagement Metrics

A table summarising:
- **Today's check-in rate**: % of active patients who checked in today
- **7-day average rate**: Rolling mean
- **Average streak**: Mean consecutive check-in days across caseload

### 18.8 Caseload Summary Table

A table listing each patient with their key metrics for the selected time range: name, avg mood, check-in rate, streak, risk level, and latest assessment scores.

---

## 19. Reports

### 19.1 Report Types

| Type | Key | Description |
|------|-----|-------------|
| **Individual Patient** | `weekly_summary` | 30-day mood trend, trigger frequency, symptom burden, medication adherence for one patient |
| **Population Summary** | `monthly_summary` | Aggregate outcomes across your entire caseload |
| **Handover Report** | `clinical_export` | Flagged patients, active alerts, outstanding actions — designed for shift handovers |
| **CDA Handover** | `cda_handover` | CDA R2 XML document for EHR transfer (8 sections: demographics, medications, assessments, diagnoses, care plan, alerts, notes, vitals) |

### 19.2 Requesting a Report

1. Navigate to Reports page
2. Click **+ New Report**
3. Select **report type** from the dropdown
4. If Individual Patient or CDA Handover: select the **patient** from a searchable dropdown
5. Choose a **date range** (start and end dates)
6. Click **Generate Report**

The report is queued for background generation.

### 19.3 Report Lifecycle

Reports progress through statuses:

```
Queued → Generating → Ready → Expired (or Failed)
```

- **Queued**: Waiting in the BullMQ job queue
- **Generating**: Worker is producing the report
- **Ready**: Report is available for download
- **Failed**: An error occurred (retry available)
- **Expired**: Download link has expired (reports expire after a configured period)

When ready, a **Download** button appears with file size. Reports are served via presigned URLs from the storage bucket.

---

## 20. Cohort Builder

> **Admin only.** The Cohort Builder is restricted to users with the **admin** role. Non-admin clinicians will not see it in the sidebar and will see an "Access Restricted" message if they navigate to `/cohort` directly.

The Cohort Builder enables administrators to define, save, and analyse subsets of the patient population.

### 20.1 Filter Builder (Left Panel)

Build complex queries using a visual filter builder:

**Filter groups** support recursive AND/OR logic (maximum depth: 2):

```
AND
├── Age > 25
├── OR
│   ├── PHQ-9 ≥ 15
│   └── GAD-7 ≥ 10
└── Status = active
```

**Available field categories**:

| Category | Fields |
|----------|--------|
| Demographics | Age, gender, status, diagnosis, organisation |
| Assessments | Latest PHQ-9, GAD-7, ASRM, C-SSRS, ISI, WHODAS scores |
| Daily Metrics | Avg mood (30d), avg sleep, avg exercise, tracking streak |
| Clinical | Risk level, active medications count, care team size |
| Engagement | Last check-in date, check-in rate, days since registration |

**Operators**: `=`, `!=`, `>`, `>=`, `<`, `<=`, `in`, `contains`

As you build filters, a **live patient count** preview updates (debounced to avoid excessive queries).

### 20.2 Results Panel (Right Panel)

After applying filters:

**Summary bar**: Total patient count, avg PHQ-9, avg GAD-7, avg mood, avg streak

**Patient table** (sortable, 50 per page):
- Name, MRN, risk level, latest PHQ-9, latest GAD-7, avg mood, streak
- Click any row to navigate to that patient's detail page

**Distribution charts**:
- Risk distribution (pie chart: low/moderate/high/critical)
- Gender distribution

### 20.3 Saving and Managing Cohorts

- **Save**: Name (required), description (optional), colour tag (hex picker)
- **Saved cohorts** appear in a list panel with patient counts and last-run timestamps
- **Pin/unpin**: Star favourite cohorts to keep them at the top
- **Clone**: Duplicate a cohort's filters as a starting point for a new one
- **Delete**: Remove a saved cohort (with confirmation)

### 20.4 Export Options

From the results panel, click **Export** to choose:

| Format | Description |
|--------|-------------|
| **CSV** | Spreadsheet-compatible comma-separated values |
| **FHIR Bundle** | HL7 FHIR R4 Bundle containing Patient resources |
| **De-identified Research Export** | HIPAA Safe Harbour method — 18 PHI identifiers stripped. Formats: NDJSON, CSV, or FHIR Bundle. Download via presigned URL (48-hour expiry) |

---

## 21. Global Search

### 21.1 Activating Search

Press `/` or `Cmd+K` (`Ctrl+K` on Windows/Linux) from any page to open the global search overlay.

### 21.2 Search Scope

The search queries two data sources:

- **Patients**: Matches against patient name and MRN (fuzzy matching supported)
- **Clinical notes**: Full-text search against clinician note content (uses PostgreSQL GIN tsvector index)

### 21.3 Result Grouping and Keyboard Navigation

Results are grouped by type (Patients, Notes) with category headers. Use:
- **↑ / ↓ arrow keys**: Navigate between results
- **Enter**: Open the selected result (patient detail page or note context)
- **Escape**: Close the search overlay

---

# Part IV — Administrator Guide

## 22. System Architecture Overview

### 22.1 Component Diagram

```
┌─────────────────┐     ┌─────────────────┐
│  Patient Mobile  │     │ Clinician Web    │
│  App (Expo/RN)   │     │ Dashboard (React)│
└────────┬────────┘     └────────┬────────┘
         │ HTTPS                  │ HTTPS + WebSocket
         └──────────┬─────────────┘
                    ▼
         ┌─────────────────────┐
         │  API Server          │
         │  (Fastify 5 / Node  │
         │   22 / TypeScript)   │
         └──────┬──────┬───────┘
                │      │
         ┌──────▼──┐  ┌▼──────────┐
         │PostgreSQL│  │  Redis 7+ │
         │  15+     │  │           │
         │  (RLS)   │  │ Pub/Sub + │
         │          │  │ BullMQ    │
         └──────────┘  └─────┬────┘
                             │
                    ┌────────▼────────┐
                    │ Background       │
                    │ Workers (BullMQ) │
                    │ • Rules engine   │
                    │ • AI insights    │
                    │ • Report gen     │
                    │ • Research export│
                    │ • Nightly sched  │
                    └─────────────────┘
```

### 22.2 Database Architecture

- **PostgreSQL** with **Row-Level Security (RLS)** enforced at the database layer
- **48 tables** and **2 views** across 15 numbered migrations (001–015)
- **Append-only audit log** (`audit_log` table) for HIPAA compliance
- **Append-only consent records** (`consent_records` table) — never updated or deleted
- **postgres.js** client (raw SQL templates — no ORM)
- **RLS context setter**: `setRlsContext(userId, role)` must be called before every query

### 22.3 Real-Time Infrastructure

- **WebSocket** endpoint at `/api/v1/ws` for clinician dashboard real-time updates
- **Redis pub/sub** enables horizontal scaling — alert broadcasts reach all API instances
- **Events**: `alert.created`, `alert.updated`, `patient.status_changed`, `ping`, `pong`

---

## 23. Deployment & Configuration

### 23.1 Infrastructure Requirements

| Component | Minimum Version | Purpose |
|-----------|----------------|---------|
| Node.js | 22.x | API server and worker runtime |
| npm | 10.x | Package management |
| PostgreSQL | 15+ | Primary data store |
| Redis | 7+ | Job queues, pub/sub, rate limiting |
| Docker | 20+ | Optional: containerised PostgreSQL, Redis, MailHog |

### 23.2 Environment Variables Reference

**Database & Authentication** (required):

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/mindlog` |
| `SUPABASE_URL` | Supabase project URL | `https://xyz.supabase.co` |
| `SUPABASE_ANON_KEY` | Supabase anonymous key | `eyJ...` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key | `eyJ...` |
| `JWT_SECRET` | JWT signing secret (min 32 chars) | `your-secret-here` |

**API Server** (optional):

| Variable | Default | Description |
|----------|---------|-------------|
| `API_PORT` | `3000` | HTTP listening port |
| `API_HOST` | `0.0.0.0` | Bind address |
| `NODE_ENV` | `development` | `development` or `production` |
| `API_BASE_URL` | `http://localhost:3000` | Public-facing API base URL |
| `CORS_ORIGIN` | `http://localhost:5173` | Allowed CORS origin(s) |

**Token Expiry** (optional):

| Variable | Default | Description |
|----------|---------|-------------|
| `JWT_ACCESS_EXPIRY` | `15m` | Access token lifetime |
| `JWT_REFRESH_EXPIRY` | `7d` | Refresh token lifetime |

**Redis** (optional):

| Variable | Default | Description |
|----------|---------|-------------|
| `REDIS_URL` | `redis://localhost:6379` | Redis connection string |

**AI Insights** (optional — compliance-gated):

| Variable | Default | Description |
|----------|---------|-------------|
| `AI_PROVIDER` | `anthropic` | `anthropic` or `ollama` |
| `AI_INSIGHTS_ENABLED` | `false` | Master feature flag for AI |
| `ANTHROPIC_API_KEY` | — | Required if provider is `anthropic` |
| `ANTHROPIC_MODEL` | `claude-sonnet-4-5-20250929` | Anthropic model ID |
| `ANTHROPIC_BAA_SIGNED` | `false` | Set `true` only after BAA is signed |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama server URL |
| `OLLAMA_MODEL` | `alibayram/medgemma:27b` | Ollama model name |

**Email** (optional):

| Variable | Description |
|----------|-------------|
| `RESEND_API_KEY` | Resend API key for email delivery |
| `EMAIL_FROM` | Sender address (e.g., `MindLog <alerts@yourdomain.com>`) |

**SMS** (optional):

| Variable | Description |
|----------|-------------|
| `TWILIO_ACCOUNT_SID` | Twilio account SID |
| `TWILIO_AUTH_TOKEN` | Twilio auth token |
| `TWILIO_FROM_NUMBER` | Twilio sender phone number |

**Push Notifications** (optional):

| Variable | Description |
|----------|-------------|
| `EXPO_ACCESS_TOKEN` | Expo push service token |
| `EXPO_PUSH_ACCESS_TOKEN` | Alternative Expo push token |

**Storage** (optional):

| Variable | Description |
|----------|-------------|
| `STORAGE_BUCKET_REPORTS` | Supabase storage bucket name for reports |
| `STORAGE_URL` | Supabase storage URL |

**Compliance** (optional — do not hardcode to `true`):

| Variable | Default | Description |
|----------|---------|-------------|
| `ANTHROPIC_BAA_SIGNED` | `false` | Only set `true` after signing a BAA with Anthropic |
| `HIPAA_ASSESSMENT_COMPLETE` | `false` | Only set `true` after completing HIPAA security risk assessment |

**Monitoring** (optional):

| Variable | Description |
|----------|-------------|
| `SENTRY_DSN` | Sentry error tracking DSN |
| `WEB_APP_URL` | Web dashboard public URL |

### 23.3 Starting the Platform

**Demo / Development environment**:

```bash
# 1. Start infrastructure (PostgreSQL, Redis, MailHog)
npm run demo:infra

# 2. Run migrations + seed demo data
npm run demo:setup

# 3. Start API server (port 3000)
npm run demo:api

# 4. Start web dashboard (port 5173)
npm run demo:web

# 5. Start background workers (in a separate terminal)
npm run dev:worker
```

**Demo credentials**:
- Patient: `alice@mindlogdemo.com` / `Demo@Patient1!`
- Clinician: `dr.kim@mindlogdemo.com` / `Demo@Clinic1!`

### 23.4 Production Deployment

**Build all workspaces**:
```bash
npm run build
```

**Mobile builds** (via EAS):
```bash
npm run build:mobile:preview     # Preview build (internal testing)
npm run build:mobile:production  # Production build (app store submission)
npm run submit:mobile            # Submit to Apple App Store / Google Play
```

**CI/CD**:
The repository includes GitHub Actions workflows for:
- Linting (`npm run lint`)
- Type checking (`npm run typecheck`)
- Unit tests (`npm run test`)
- Build verification (`npm run build`)

### 23.5 Health Check Endpoint

```
GET /health
```

**Response** (HTTP 200 when healthy, 503 when degraded):

```json
{
  "status": "ok",
  "timestamp": "2026-02-24T12:00:00.000Z",
  "version": "0.1.0",
  "db": "connected"
}
```

The health endpoint does not require authentication and is silent in logs (no log spam from monitoring probes).

---

## 24. Database Administration

### 24.1 Migration System

Migrations are numbered SQL files in `packages/db/migrations/`:

| Migration | Description |
|-----------|-------------|
| 001 | Core tables: organisations, patients, clinicians, care teams, daily entries, journals, alerts, consent |
| 002 | Notification logs and consent type enums |
| 003 | Medications and adherence tracking |
| 004 | Expanded daily entries (16 clinical columns: mania, anxiety, anhedonia, SI, social, cognitive, stress) |
| 005 | Validated assessments table (PHQ-9, GAD-7, ASRM, C-SSRS, ISI, WHODAS, QIDS-SR) |
| 006 | Medical codes (ICD-10, SNOMED, RxNorm, OMOP) |
| 007 | OMOP concept mapping |
| 008 | Patient invites for registration workflow |
| 009 | Passive health snapshots (HealthKit/Health Connect) + patient colour scheme |
| 010 | AI insights tables (`patient_ai_insights`, `ai_usage_log`) |
| 011 | Risk score columns on patients + GIN tsvector index on clinician notes |
| 012 | Research exports + cohort definitions |
| 013 | Crisis safety plans (Stanley-Brown model) |
| 014 | AI discussion threads and messages |
| 015 | Cohort builder v2 (structured DSL filters, pinned cohorts, snapshots, materialised view) |

**Applying migrations**:
```bash
npm run db:migrate
```

The `_migrations` table tracks which migrations have been applied. Migrations are idempotent — running `db:migrate` multiple times is safe.

### 24.2 Seeding

| Command | Description |
|---------|-------------|
| `npm run db:seed` | Seeds production reference data (medical codes, default config) |
| `npm run db:seed-demo` | Seeds a full demo environment: 7 clinicians, 146 patients, 60-day history |

**Demo enrichment** (optional, run after `db:seed-demo`):
```bash
PGPASSWORD=<password> psql -h localhost -p 5432 -U <user> -d <db> \
  < packages/db/seeds/009_demo_enrichment.sql
```

This adds:
- Admin privileges for `np.zhang@mindlogdemo.com`
- 16 clinical fields backfilled on all daily entries
- 1,224 validated assessments (PHQ-9, GAD-7, ASRM)
- 218 patient diagnoses, 415 appointments

### 24.3 Row-Level Security (RLS)

All tables use PostgreSQL RLS policies. The API sets the RLS context before every query:

```typescript
await setRlsContext(userId, role);
const result = await sql`SELECT * FROM patients`;
```

**Access rules**:
- **Patients**: Can only read/write their own data
- **Clinicians**: Can access data for patients on their care team
- **Admins**: Can access all organisation data
- **Service role**: Bypasses RLS (used for background workers and admin operations)

### 24.4 Key Tables Quick Reference

**Core entities**:
- `patients` — Patient accounts (id, name, DOB, MRN, status, risk_score, organisation)
- `clinicians` — Clinician accounts (id, name, title, NPI, role, organisation)
- `organisations` — Organisations (id, name, settings)
- `care_team_members` — Links patients to clinicians with roles

**Clinical data**:
- `daily_entries` — Daily check-ins (mood, sleep, exercise, + 16 clinical fields)
- `validated_assessments` — Assessment results (scale, score, item_responses, completed_at)
- `patient_medications` — Medication records
- `medication_adherence_logs` — Daily adherence tracking
- `journal_entries` — Patient journal entries

**Safety & alerts**:
- `clinical_alerts` — Generated alerts (severity, status, rule_key)
- `safety_events` — Safety incident records
- `crisis_safety_plans` — Stanley-Brown safety plans (one per patient)

**Audit & compliance**:
- `audit_log` — HIPAA audit trail (actor, action, resource, patient, IP, timestamp)
- `consent_records` — Patient consent history (append-only)

**AI & research**:
- `patient_ai_insights` — AI-generated insights
- `ai_usage_log` — LLM token usage and cost tracking
- `ai_discussions` / `ai_discussion_messages` — AI chat threads
- `cohort_definitions` — Saved cohort filters
- `research_exports` — Research export jobs

### 24.5 Backup and Retention

- **Audit log**: Retain for a minimum of **7 years** per HIPAA requirements
- **Consent records**: Never deleted — append-only design ensures complete audit trail
- **Daily backups**: Configure PostgreSQL point-in-time recovery (PITR) for production
- **Export data**: Research exports include presigned URLs that expire after 48 hours

---

## 25. User & Access Management

### 25.1 Admin Dashboard

Navigate to `/admin` (accessible only to users with admin privileges):

- **System statistics**: Total patients, clinicians, alerts, audit entries
- **Recent activity feed**: Last 20 significant system events

### 25.2 Clinician Management

**Creating a clinician account**:
Clinician accounts are created via the API or admin UI with:
- Email, first name, last name, title
- NPI (National Provider Identifier) — optional
- Role assignment

**Available roles**:

| Role | Permissions |
|------|-------------|
| System Admin | Full platform access: user management, configuration, audit logs, FHIR endpoints |
| Clinical Admin | Patient management, report generation, team management |
| Psychiatrist | Full clinical access: assessments, medications, AI insights |
| Psychologist | Clinical access except medication management |
| Nurse | Standard clinical access: check-ins, alerts, notes |
| Read-Only | View patient data, no modifications |

**Account management**:
- Enable/disable accounts (disabled accounts cannot log in)
- Force MFA enrollment
- Password reset (sends a reset email)

### 25.3 Patient Management

**Invite workflow**:
1. Clinician creates an invite (email + optional message)
2. Patient receives email with invite code
3. Patient creates account using invite code
4. Patient completes consent wizard and clinical intake
5. Patient appears on clinician's care team

**Care team assignment**:
Each patient-clinician relationship has a role:
- `primary` — Primary treating clinician
- `secondary` — Additional care provider
- `covering` — Covering clinician (e.g., on-call)
- `supervisor` — Clinical supervisor (oversight)
- `researcher` — Research access only

**Patient status transitions**:
```
Active → Crisis (elevated risk detected)
Active → Inactive (extended non-engagement)
Active → Discharged (treatment completed)
Crisis → Active (risk resolved)
Inactive → Active (re-engagement)
Discharged → Active (re-admission)
```

### 25.4 Role-Based Access Control

| Feature | Patient | Clinician | Admin |
|---------|---------|-----------|-------|
| Own check-ins / journal / meds | ✅ | — | — |
| View care team patients | — | ✅ | ✅ |
| Manage alerts (own care team) | — | ✅ | ✅ |
| Manage alerts (any patient) | — | — | ✅ |
| Create reports | — | ✅ | ✅ |
| AI insights | — | ✅ | ✅ |
| FHIR endpoints | — | ✅ | ✅ |
| System stats / audit logs | — | — | ✅ |
| User management | — | — | ✅ |
| Cohort Builder & research exports | — | — | ✅ |

---

## 26. Alert System & Rules Engine

### 26.1 How Alerts Are Generated

The rules engine processes patient data on two triggers:

1. **Real-time**: When a patient submits a daily entry, a BullMQ job is enqueued on the `mindlog-rules` queue
2. **Nightly batch**: A scheduled job runs at **02:00 ET** daily to catch missed check-ins and delayed patterns

### 26.2 Built-In Rules

| Rule | Condition | Severity | Alert Title Template |
|------|-----------|----------|---------------------|
| RULE-001 | Mood drops ≥ 2.5 points in 24h | Warning | "Mood decline detected — {delta}pt drop" |
| RULE-001 | Mood drops ≥ 3.5 points in 24h | Critical | "Significant mood decline — {delta}pt drop" |
| RULE-002 | 3+ consecutive days without check-in | Info | "Missed check-in — {days} days" |
| RULE-002 | 5+ consecutive days without check-in | Warning | "Extended missed check-in — {days} days" |
| RULE-003 | Trigger severity ≥ 7 on 3+ days | Warning | "Trigger escalation — {trigger_name}" |
| RULE-004 | C-SSRS ≥ 2 or suicidal_ideation ≥ 2 | Critical | "Safety flag — elevated suicide risk" |
| RULE-005 | 2+ missed medication doses | Warning | "Medication non-adherence — {med_name}" |
| RULE-006 | Sleep pattern deviation | Warning | "Sleep disruption detected" |
| RULE-007 | Exercise decline | Info | "Exercise decline detected" |
| RULE-008 | Negative journal sentiment trend | Info | "Journal sentiment concern" |

### 26.3 Alert Lifecycle

```
Generated → Open → Acknowledged → Resolved
                                 → Escalated → Resolved
                → Auto-resolved (condition cleared)
```

- **Open**: Alert is active and waiting for clinician attention
- **Acknowledged**: Clinician has seen the alert and optionally added a note
- **Resolved**: Clinician has completed follow-up
- **Auto-resolved**: The triggering condition has cleared (e.g., patient resumed check-ins)
- **Escalated**: Alert has been elevated to supervisor attention

### 26.4 Alert Deduplication

The rules engine enforces **one open alert per rule per patient**. If RULE-001 is already open for a patient, a new mood decline does not create a duplicate alert. The existing alert's metadata is updated instead.

### 26.5 Alert Routing

The `alert_routing_rules` table controls who is notified and how:

| Field | Description |
|-------|-------------|
| `clinician_id` | Target clinician (or null for all care team) |
| `patient_id` | Specific patient (or null for all) |
| `alert_type` | Specific rule (or null for all) |
| `severity` | Specific severity (or null for all) |
| `channels` | Array: `in_app`, `email`, `push`, `sms` |

SMS notifications are reserved for **critical alerts only** to avoid alert fatigue.

### 26.6 Real-Time Delivery

1. Rules engine generates the alert and writes to `clinical_alerts`
2. Redis `PUBLISH` broadcasts the alert to all API instances
3. Each API instance forwards the alert via WebSocket to connected clinicians
4. Email/push/SMS notifications are sent based on routing rules

---

## 27. Risk Scoring

### 27.1 Composite Risk Score (0–100)

MindLog computes a deterministic, rule-based composite risk score for each patient. The score is:
- **Not AI-dependent** — uses only structured clinical data
- **Fully auditable** — factor weights, graduation logic, and literature references are transparent
- **Updated nightly** by the scheduled worker and on daily entry submission
- **Longitudinally tracked** — each computation writes to `patient_risk_history` for trend analysis

### 27.2 Graduated Scoring Architecture

Unlike simple binary scoring (triggered/not), MindLog uses **graduated contributions** — each rule contributes a score between 0 and its maximum weight based on severity, recency, and trend. The theoretical maximum raw score is **132**, deliberately over-allocated and capped at **100**.

**Why over-allocation?** Psychiatric risk is often characterised by moderate elevation across multiple domains simultaneously. If the maximum exactly equals 100, a patient must score extreme values in specific rules to reach the critical band. Over-allocation ensures patients with widespread moderate-severity factors are appropriately flagged.

### 27.3 Ten Scoring Factors

| Factor | Code | Max Weight | Domain | Graduation Logic | Literature Basis |
|--------|------|-----------|--------|------------------|-----------------|
| C-SSRS Ideation | R01 | 35 | Safety | Level 1-2: 10, Level 3: 25, Level 4-5: 35. Recency decay: 48h=1.0x, 7d=0.8x, 14d=0.6x, >14d=0.4x | OR 1.5-6.9 per ideation level (Columbia validation) |
| PHQ-9 + Trajectory | R02 | 20 | Mood | Severity: 10-14: 5, 15-19: 10, 20+: 15. +5 bonus if >=5pt increase from prior | MCID = 5 pts (Jacobson-Truax) |
| Low Mood Streak | R03 | 15 | Mood | 3 consecutive days mood <=3: 10, 5d: 13, 7d+: 15 | Digital phenotyping (sustained low mood as prodromal marker) |
| Engagement/Missed | R04 | 12 | Engagement | 3 missed: 5, 5+ missed: 10. Declining week-over-week trend: +2 bonus | Post-discharge disengagement highest-risk window |
| ASRM Mania | R05 | 10 | Mood | 6-9: 5, 10-13: 8, 14+: 10 | Sensitivity 85.5% at cutoff 6 (Altman) |
| Med Non-Adherence | R06 | 10 | Medication | 2d missed: 2, 3-4d: 5, 5+d: 8. Consecutive 3d+ streak: +2 bonus | AOR 3.09 for relapse |
| Social Withdrawal | R07 | 8 | Engagement | Avoidance alone: 3, +anhedonia: 5, acute (5/7 days): 8 | Dose-response with SI in MDD |
| Sleep Disruption | R08 | 7 | Physical | <5h on 3+/7d: 4, quality <=2 on 4+/7d: +3 (cap 7) | OR 2.10-3.0 for SI |
| GAD-7 Anxiety | R09 | 7 | Mood | 10-14: 3, 15+: 5. +2 bonus if >=5pt increase from prior | Comorbid anxiety amplifier |
| PHQ-9 Item 9 (SI) | R10 | 8 | Safety | q9=1: 3, q9=2: 5, q9=3: 8 | Direct SI screen from PHQ-9 |

### 27.4 Risk Domains

Factors are grouped into five clinical domains for the UI:

| Domain | Icon | Factors | Max Contribution |
|--------|------|---------|-----------------|
| **Safety** | Shield | R01 (C-SSRS), R10 (PHQ-9 Q9) | 43 |
| **Mood** | Brain | R02 (PHQ-9), R03 (Mood Streak), R05 (ASRM), R09 (GAD-7) | 52 |
| **Engagement** | Activity | R04 (Missed Check-ins), R07 (Social Withdrawal) | 20 |
| **Physical** | Heart | R08 (Sleep Disruption) | 7 |
| **Medication** | Pill | R06 (Non-Adherence) | 10 |

### 27.5 Risk Bands

| Range | Band | Badge Colour | Action Level |
|-------|------|-------------|--------------|
| 0–24 | Low | Green | Routine monitoring |
| 25–49 | Moderate | Yellow | Increased attention |
| 50–74 | High | Orange | Active intervention recommended |
| 75–100 | Critical | Red | Immediate attention required |

### 27.6 Longitudinal Tracking

Every risk score computation writes a row to the `patient_risk_history` table with the score, band, and full factor breakdown (JSONB). This enables:
- **Sparkline rendering** — 90-day risk trajectory on the AI Insights tab
- **Trend detection** — delta from previous assessment shown on the risk gauge
- **Clinical audit** — complete history of how and when risk levels changed

The risk history API endpoint is available at `GET /api/v1/insights/:patientId/risk-history?days=90`.

### 27.7 Clinical Advisory

> **Important**: Risk scoring thresholds and weights are **provisional** and require clinical sign-off before use in a pilot deployment. The risk score is a decision-support tool and does not replace clinical judgement. The literature references provide the evidence basis for each rule's weight and graduation logic, but clinical validation in the target population is required before production deployment.

---

## 28. AI Clinical Intelligence

### 28.1 Feature Gating

AI features are disabled by default and require two conditions:

1. **Environment**: `AI_INSIGHTS_ENABLED=true`
2. **Compliance**: Either `ANTHROPIC_BAA_SIGNED=true` (for Anthropic Cloud) or `AI_PROVIDER=ollama` (local inference, no BAA required)
3. **Per-patient**: The patient must have granted `ai_insights` consent

The `aiGate` middleware enforces these checks on all AI endpoints. Missing any condition returns HTTP 503.

### 28.2 LLM Providers

| Provider | Model | BAA Required | Cost | Latency |
|----------|-------|-------------|------|---------|
| **Anthropic Cloud** | Claude Sonnet | Yes (legally required for PHI) | ~$3/1M input, ~$15/1M output tokens | 2–5s |
| **Ollama Local** | MedGemma 27B | No (PHI stays on-premises) | $0 (local compute) | 5–15s |

The provider abstraction in `llmClient.ts` supports both backends. Switch providers by changing `AI_PROVIDER` in the environment. Node.js must be restarted after changing `.env` values.

### 28.3 Insight Types

| Type | Description | Frequency | Output |
|------|-------------|-----------|--------|
| `weekly_summary` | Narrative summary of the patient's week | Weekly (nightly scheduler) | Free-text narrative + key findings |
| `trend_narrative` | Analysis of mood, sleep, and assessment trends | On demand | Free-text narrative |
| `anomaly_detection` | Unusual pattern detection | Triggered by significant deviations | Urgency level + anomaly description |
| `risk_stratification` | Risk factor breakdown with recommendations | On demand or nightly | Score + factor breakdown (no LLM) |
| `nightly_deep_analysis` | Comprehensive structured clinical analysis | Nightly (for patients with new data) | Structured JSON with trajectory, domain findings, early warnings, recommendations |

### 28.3.1 Nightly Deep Analysis (v1.1a)

The most comprehensive insight type, `nightly_deep_analysis` builds an enriched clinical snapshot with ~12 parallel SQL queries and sends it to the LLM for structured analysis. The enriched snapshot includes:

- **Assessment trajectories**: Last 3 PHQ-9, GAD-7, and ASRM scores with deltas between assessments
- **Sleep pattern analysis**: 7-day average hours, variability, quality trend, short night count
- **Passive health summary**: Steps, HRV, resting HR, and trend directions
- **Medication adherence detail**: Per-medication rates and longest consecutive miss streak
- **Social trend analysis**: Average social score, avoidance day count, trend direction
- **Cross-domain correlations**: PostgreSQL `CORR()` calculations for sleep-mood, activity-mood, social-mood relationships
- **Prior insight context**: Summary of most recent insight for continuity
- **Active risk factors**: Current graduated risk factor details with domain grouping

The LLM returns a structured JSON response stored in `structured_findings` JSONB:

| Field | Description |
|-------|-------------|
| `clinical_trajectory` | `improving` / `stable` / `declining` / `acute` with rationale |
| `narrative` | 3-5 paragraph clinical narrative |
| `key_findings` | 4-8 prioritised clinical findings |
| `domain_findings` | Per-domain analysis (mood, sleep, anxiety, social, medications) |
| `early_warnings` | Prodromal signals with urgency level and domain tag |
| `treatment_response` | Assessment of current treatment effectiveness |
| `recommended_focus` | 2-4 prioritised clinical focus areas |
| `cross_domain_patterns` | Inter-domain correlations and patterns |

The nightly scheduler automatically fans out deep analysis jobs at 02:00 EST for all consented active patients who have new daily entries since their last analysis.

### 28.4 AI Chat (Clinician-Facing)

The AI chat feature allows clinicians to have multi-turn conversations about a specific patient:

- **Context injection**: A 30-day clinical snapshot is built and injected as a system prompt every turn, including: recent check-ins, assessment scores, medication adherence, active alerts, risk factors, and diagnoses
- **Full history**: The complete conversation history is sent with each turn for continuity
- **Synchronous**: Responses are generated in real time (not queued via BullMQ)
- **Storage**: Conversations are stored in `ai_discussions` and `ai_discussion_messages`
- **Multiple threads**: Clinicians can start new discussions or continue existing ones

### 28.5 HIPAA Safeguards

- **De-identification preamble**: All LLM prompts include instructions not to echo back patient identifiers
- **Clinical decision support disclaimer**: Every AI response includes a note that it does not constitute medical advice
- **Consent verification**: The API verifies `ai_insights` consent before every AI operation
- **No patient access**: AI insights are only shown to clinicians (not surfaced in the patient app unless explicitly enabled)

### 28.6 Cost Tracking

The `ai_usage_log` table records:
- Patient ID, insight type, model ID
- Input tokens, output tokens, estimated cost (cents)
- Timestamp

**Cost estimates** (Anthropic Cloud):
- Weekly summary: ~$0.02/patient/week
- AI chat turn: ~$0.01–$0.05/turn (varies with context size)
- Ollama local: $0 (hardware costs only)

### 28.7 Enabling AI Insights (Step-by-Step)

1. Choose your AI provider and set environment variables:
   ```bash
   # Option A: Anthropic Cloud (requires signed BAA)
   AI_PROVIDER=anthropic
   AI_INSIGHTS_ENABLED=true
   ANTHROPIC_API_KEY=sk-ant-...
   ANTHROPIC_BAA_SIGNED=true  # Only after legal review

   # Option B: Ollama Local (no BAA needed)
   AI_PROVIDER=ollama
   AI_INSIGHTS_ENABLED=true
   OLLAMA_BASE_URL=http://localhost:11434
   OLLAMA_MODEL=alibayram/medgemma:27b
   ```
2. Restart the API server and worker process
3. Ensure the patient has granted `ai_insights` consent (via the consent wizard or Settings > Privacy)
4. Navigate to the patient's AI Insights tab — or wait for the nightly scheduler to generate insights automatically
5. To trigger manually: click "Refresh AI Insights" on the patient detail page, or call `POST /api/v1/insights/:patientId/ai/trigger`

---

## 29. FHIR R4 Interoperability

### 29.1 Capability Statement

```
GET /api/v1/fhir/metadata
Content-Type: application/fhir+json; fhirVersion=4.0
```

Returns a FHIR CapabilityStatement resource describing all supported interactions, resources, and search parameters.

### 29.2 Supported FHIR Resources

| FHIR Resource | MindLog Source | Endpoint |
|---------------|---------------|----------|
| Patient | `patients` table | `GET /fhir/Patient/:id` |
| Observation | `daily_entries`, `passive_health_snapshots` | `GET /fhir/Observation?patient=:id` |
| MedicationRequest | `patient_medications` | `GET /fhir/MedicationRequest?patient=:id` |
| QuestionnaireResponse | `validated_assessments` | `GET /fhir/QuestionnaireResponse?patient=:id` |
| Condition | `patient_diagnoses` | `GET /fhir/Condition?patient=:id` |
| CarePlan | `crisis_safety_plans` | `GET /fhir/CarePlan?patient=:id` |
| Consent | `consent_records` | `GET /fhir/Consent?patient=:id` |

### 29.3 Patient/$everything Bundle

```
GET /api/v1/fhir/Patient/:id/$everything
```

Returns a FHIR Bundle containing all resources for the specified patient: Patient, Observations, MedicationRequests, QuestionnaireResponses, Conditions, CarePlan, and Consent records.

### 29.4 Content Type

All FHIR endpoints return `application/fhir+json; fhirVersion=4.0` as the Content-Type header.

### 29.5 Access Control

- All FHIR endpoints require authentication (JWT bearer token)
- Clinician must be on the patient's care team to access their FHIR resources
- Admin users can access any patient's FHIR resources
- Validation errors return FHIR OperationOutcome resources

### 29.6 LOINC Code Mapping

| Assessment | LOINC Code |
|-----------|-----------|
| PHQ-9 | 44249-1 |
| GAD-7 | 69737-5 |
| ISI | 89794-0 |
| C-SSRS | 89213-1 |
| ASRM | *(no LOINC — uses scale name as identifier)* |
| WHODAS | *(no LOINC — uses scale name as identifier)* |

### 29.7 CDA R2 XML Export

CDA R2 (Clinical Document Architecture) handover documents can be generated via the Reports system (report type: `cda_handover`). These XML documents contain 8 sections:

1. Demographics
2. Medications
3. Assessment results
4. Diagnoses
5. Care plan
6. Active alerts
7. Clinician notes
8. Vitals (passive health data)

---

## 30. Research & Data Export

### 30.1 Cohort Definitions

Cohort definitions are saved filter presets stored in the `cohort_definitions` table:

- **v1 filters**: Flat key-value filters (legacy)
- **v2 filters**: Structured DSL with recursive AND/OR groups (max depth 2), typed operators, and 20+ filterable fields

Cohorts store a `last_count` and `last_run_at` for quick reference without re-executing the query.

### 30.2 De-Identified Exports

Research exports follow the **HIPAA Safe Harbour** de-identification method, stripping 18 PHI identifiers:

1. Names
2. Geographic data (below state level)
3. Dates (except year) for ages > 89
4. Phone numbers
5. Fax numbers
6. Email addresses
7. SSN
8. MRN
9. Health plan numbers
10. Account numbers
11. Certificate/license numbers
12. Vehicle identifiers
13. Device identifiers
14. Web URLs
15. IP addresses
16. Biometric identifiers
17. Full-face photographs
18. Any other unique identifying number

**Export formats**: NDJSON, CSV, FHIR Bundle

**Download**: Via presigned URL with **48-hour expiry**.

### 30.3 OMOP / SNOMED / ICD-10 Code Search

The `medical_codes` table (seeded via migration 006) provides lookup for:
- **ICD-10**: Diagnosis codes
- **SNOMED CT**: Clinical terms
- **RxNorm**: Medication codes
- **OMOP**: Observational Medical Outcomes Partnership concepts

### 30.4 Research Export Worker

Research exports run as background jobs on the `mindlog-research-exports` BullMQ queue:

1. Admin requests export via the Cohort Builder (or API)
2. Job is queued with cohort filters and export format
3. Worker retrieves matching patient data
4. De-identification is applied (Safe Harbour method)
5. Output file is uploaded to storage
6. Presigned download URL is generated and stored in `research_exports`
7. Export status changes to `completed`

---

## 31. Notifications & Communications

### 31.1 Push Notifications (Mobile)

MindLog sends push notifications via the **Expo Push Service**, which routes to:
- **APNs** (Apple Push Notification service) for iOS
- **FCM** (Firebase Cloud Messaging) for Android

Notification types:
- Daily check-in reminders
- Medication reminders
- Assessment requests from clinicians
- Streak milestone celebrations
- Appointment reminders

### 31.2 Email Notifications

Email delivery via **Resend API**:
- Patient invite emails (with invite code and deep link)
- Alert summary digests for clinicians
- Password reset emails
- Assessment request notifications

### 31.3 SMS Notifications

SMS delivery via **Twilio** (reserved for critical alerts only):
- Safety flag alerts (C-SSRS ≥ 2)
- Crisis-level mood decline

SMS is intentionally restricted to prevent alert fatigue and minimise cost.

### 31.4 Assessment Request Notifications

When a clinician requests an assessment:
1. A push notification is sent to the patient's mobile app
2. The assessment banner appears on the patient's Today screen
3. If push notifications are disabled, the banner still appears on next app open

### 31.5 Patient Notification Preferences

Patients configure notifications in Settings > Notifications:

| Preference | Default | Controls |
|-----------|---------|----------|
| Daily reminder | On | Whether the daily check-in reminder fires |
| Reminder time | 09:00 | When the daily reminder fires |
| Medication reminders | On | Reminders for unlogged medications |
| Streak notifications | On | Celebration when streak milestones are hit |
| Appointment reminders | On | Upcoming appointment alerts |

---

## 32. Security & Compliance

### 32.1 Authentication

- **Identity provider**: Supabase Auth
- **Access tokens**: JWT with 15-minute expiry
- **Refresh tokens**: 7-day expiry
- **MFA**: TOTP (Time-based One-Time Password) for clinician accounts
- **Biometric lock**: Face ID / fingerprint on mobile (5-minute background timeout)
- **Password requirements**: Minimum 12 characters

### 32.2 Authorisation

Three-tier access model:

1. **Patient**: Access own data only
2. **Clinician**: Access care team patients' data
3. **Admin**: Access all organisation data

Enforced at two levels:
- **Application layer**: JWT role claims checked in route handlers
- **Database layer**: PostgreSQL Row-Level Security policies

### 32.3 Rate Limiting

| Endpoint | Limit | Window |
|----------|-------|--------|
| Global (all endpoints) | 1,000 requests | Per minute per IP |
| `POST /auth/login` | 10 attempts | Per minute per IP |
| `POST /auth/register` | 5 registrations | Per minute per IP |
| `POST /voice/transcribe` | 5 transcriptions | Per hour per patient |

Rate limit violations return HTTP 429 with a `Retry-After` header.

### 32.4 Security Headers (Helmet)

The API sets security headers via `@fastify/helmet`:
- `Strict-Transport-Security` (HSTS): Forces HTTPS
- `X-Content-Type-Options: nosniff`: Prevents MIME type sniffing
- `X-Frame-Options: DENY`: Prevents clickjacking
- `Referrer-Policy: strict-origin-when-cross-origin`: Limits referrer information

### 32.5 CORS Configuration

Cross-Origin Resource Sharing is configured via the `CORS_ORIGIN` environment variable:
- Development: `http://localhost:5173`
- Production: Your web dashboard domain

Only whitelisted origins can make API requests from a browser.

### 32.6 Logging and PHI Redaction (Pino)

MindLog uses **Pino** for structured logging:

- **Development**: Pretty-printed, colourised output
- **Production**: JSON format for log aggregation

**Redacted fields** (never appear in logs):
- `authorization` headers
- `password` fields
- `token` / `refresh_token` values
- `email` addresses (replaced with `[REDACTED]`)

### 32.7 HIPAA Audit Trail

The `audit_log` table captures all PHI access:

| Field | Description |
|-------|-------------|
| `actor_id` | User who performed the action (from JWT) |
| `actor_role` | Role of the actor (patient / clinician / admin) |
| `action` | Action type (see below) |
| `resource_type` | Table/entity accessed |
| `resource_id` | ID of the specific record |
| `patient_id` | Patient whose data was accessed |
| `ip_address` | Client IP address |
| `user_agent` | Client user agent string |
| `old_values` | Previous state (for updates) |
| `new_values` | New state (for creates/updates) |
| `success` | Boolean: whether the action succeeded |
| `failure_reason` | Reason for failure (if applicable) |
| `created_at` | Timestamp |

**Audit actions**: `read`, `create`, `update`, `delete`, `export`, `share`, `acknowledge`, `login`, `logout`, `consent_granted`, `consent_revoked`

**CSV export**: Administrators can export audit logs via the admin API for compliance reviews.

### 32.8 Consent Model

Consent records are **append-only** — revocations create new rows rather than updating existing ones:

| Consent Type | Required | Description |
|-------------|----------|-------------|
| `terms_of_service` | Yes | Agreement to terms of service |
| `privacy_policy` | Yes | Acknowledgment of privacy policy |
| `journal_sharing` | No | Share journal entries with care team |
| `data_research` | No | Allow de-identified data for research |
| `ai_insights` | No | Enable AI-generated clinical insights |
| `emergency_contact` | No | Share emergency contact information |

Each record includes: patient ID, consent type, granted (boolean), granted_at timestamp, IP address, and (if applicable) revoked_at timestamp.

### 32.9 Crisis Resources

MindLog displays crisis contact information prominently throughout the application:

| Resource | Contact | Available |
|----------|---------|-----------|
| **988 Suicide & Crisis Lifeline** | Call or text **988** | 24/7 |
| **Crisis Text Line** | Text **HOME** to **741741** | 24/7 |
| **Veterans Crisis Line** | Call **988**, press **1** | 24/7 |
| **SAMHSA National Helpline** | 1-800-662-4357 | 24/7 |
| **NAMI Helpline** | 1-800-950-6264 | Mon–Fri, 10am–10pm ET |

---

## 33. Background Workers & Scheduling

### 33.1 Worker Architecture

MindLog uses **BullMQ** (backed by Redis) for reliable background job processing. All workers run in a separate Node.js process from the API server.

### 33.2 Rules Engine Worker

| Property | Value |
|----------|-------|
| **Queue** | `mindlog-rules` |
| **Triggers** | Daily entry submission (real-time) + nightly batch (02:00 ET) |
| **Processing** | Evaluates all 8 alert rules against the patient's recent data |
| **Output** | Creates/updates `clinical_alerts` records |
| **Retries** | 3 attempts with exponential backoff |

### 33.3 AI Insights Worker

| Property | Value |
|----------|-------|
| **Queue** | `mindlog-ai-insights` |
| **Job types** | `weekly_summary`, `trend_narrative`, `anomaly_detection`, `risk_stratification` |
| **Gating** | Verifies AI feature flags + patient consent before processing |
| **Output** | Creates `patient_ai_insights` records + logs token usage |
| **Retries** | 2 attempts with exponential backoff |

### 33.4 Report Generator Worker

| Property | Value |
|----------|-------|
| **Queue** | `mindlog-reports` |
| **Report types** | `weekly_summary`, `monthly_summary`, `clinical_export`, `cda_handover` |
| **Processing** | Renders reports using Puppeteer (PDF) or XML builder (CDA) |
| **Output** | Uploads file to storage, updates `reports` record with presigned URL |
| **Retries** | 2 attempts |

### 33.5 Research Export Worker

| Property | Value |
|----------|-------|
| **Queue** | `mindlog-research-exports` |
| **Processing** | Retrieves cohort data, applies Safe Harbour de-identification, generates output file |
| **Formats** | NDJSON, CSV, FHIR Bundle |
| **Output** | Uploads to storage with 48-hour presigned URL |
| **Retries** | 2 attempts |

### 33.6 Nightly Scheduler

Runs at **02:00 ET** daily:

1. Generates population snapshots for each organisation
2. Enqueues missed check-in detection jobs (RULE-002)
3. Triggers AI insight generation for eligible patients
4. Updates risk scores for all active patients

### 33.7 Starting Workers

```bash
# Development (with auto-reload)
npm run dev:worker

# Production (compiled)
npm run start:worker
```

Workers must run alongside the API server. Without workers, alerts are not generated, reports are not rendered, and AI insights are not computed.

### 33.8 Monitoring and Retry Behaviour

- **Exponential backoff**: Failed jobs wait 2^attempt seconds before retry
- **Max attempts**: 2–3 depending on job type (configurable)
- **Dead letter**: Jobs that exhaust retries are moved to a dead-letter queue for manual inspection
- **Logging**: All job starts, completions, and failures are logged via Pino

---

## 34. Monitoring & Observability

### 34.1 Health Check Endpoint

```
GET /health
```

Returns `200 OK` with `{ status: "ok", db: "connected" }` when healthy, or `503 Service Unavailable` with `{ status: "degraded", db: "unreachable" }` when the database connection fails. Use this for load balancer health checks and uptime monitoring.

### 34.2 Sentry Integration

If `SENTRY_DSN` is configured, the API reports unhandled exceptions and promise rejections to Sentry with:
- Error stack traces
- Request context (method, URL, status code)
- User context (role, not PHI)

### 34.3 Structured Logging (Pino)

All application logs are structured JSON in production:

```json
{
  "level": 30,
  "time": 1708790400000,
  "msg": "Request completed",
  "req": { "method": "GET", "url": "/api/v1/patients" },
  "res": { "statusCode": 200 },
  "responseTime": 45
}
```

PHI fields are automatically redacted (see §32.6).

### 34.4 WebSocket Connection Monitoring

The API tracks connected WebSocket clients and sends periodic `ping` frames. If a client does not respond with `pong` within the timeout, the connection is closed.

### 34.5 BullMQ Job Dashboard

Redis-backed job queues can be monitored using tools like:
- **Bull Board** (web UI for BullMQ queues)
- **Redis CLI**: `redis-cli LLEN bull:mindlog-rules:wait` to check queue depth
- Custom monitoring via the BullMQ API

---

# Part V — Appendices

## A. API Endpoint Reference

All endpoints are prefixed with `/api/v1/` unless otherwise noted.

### Authentication

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/login` | No | Email + password login |
| POST | `/auth/refresh` | No | Refresh access token |
| POST | `/auth/register` | No | Patient registration (invite required) |
| POST | `/auth/mfa/verify` | Yes | Verify MFA TOTP code |
| POST | `/auth/mfa/enroll` | Yes | Enroll in MFA |

### Patients

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/patients` | Clinician | List patients on care team |
| GET | `/patients/me` | Patient | Get own profile |
| PUT | `/patients/me` | Patient | Update own profile |
| GET | `/patients/:id` | Clinician | Get patient by ID |
| PUT | `/patients/:id` | Clinician | Update patient profile |

### Daily Entries

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/daily-entries` | Patient | Create a daily check-in |
| GET | `/daily-entries` | Patient | List own daily entries |
| GET | `/daily-entries/:id` | Patient | Get a specific entry |

### Journal

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/journal` | Patient | Create a journal entry |
| GET | `/journal` | Patient | List own journal entries |
| GET | `/journal/:id` | Patient | Get a specific entry |
| PUT | `/journal/:id` | Patient | Update a journal entry |
| GET | `/journal/patient/:id` | Clinician | List patient's shared entries |

### Alerts

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/alerts` | Clinician | List alerts (care team only; admin sees all) |
| GET | `/alerts/:id` | Clinician | Get alert detail (care team only; admin sees all) |
| PATCH | `/alerts/:id/acknowledge` | Clinician | Acknowledge alert (care team only; admin any) |
| PATCH | `/alerts/:id/resolve` | Clinician | Resolve alert (care team only; admin any) |
| PATCH | `/alerts/:id/escalate` | Clinician | Escalate alert (care team only; admin any) |

### Assessments

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/assessments` | Patient | Submit a completed assessment |
| GET | `/assessments` | Patient | List own assessments |
| GET | `/assessments/pending` | Patient | List due assessments |
| GET | `/assessments/:id/fhir` | Clinician | Get FHIR QuestionnaireResponse |

### Medications

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/medications` | Patient | Add a medication |
| GET | `/medications` | Patient | List own medications |
| PUT | `/medications/:id` | Patient | Update a medication |
| POST | `/medications/:id/adherence` | Patient | Log adherence |
| PUT | `/medications/:id/discontinue` | Patient | Discontinue a medication |

### Insights

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/insights/me` | Patient | Get own insights (rule-based) |
| GET | `/insights/me/ai` | Patient | Get own AI insights |
| GET | `/insights/me/ai/history` | Patient | List own AI insight history |
| GET | `/insights/:patientId` | Clinician | Get patient insights |
| GET | `/insights/:patientId/ai` | Clinician | Get patient AI insights |
| POST | `/insights/:patientId/ai/trigger` | Clinician | Trigger AI insight generation |
| POST | `/insights/:patientId/ai/chat` | Clinician | Send AI chat message |
| GET | `/insights/:patientId/ai/discussions` | Clinician | List AI chat discussions |
| GET | `/insights/:patientId/ai/discussions/:id` | Clinician | Get discussion detail |

### Voice

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/voice/transcribe` | Patient | Upload audio for transcription (multipart) |

### Health Data

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/health-data/sync` | Patient | Upload HealthKit/Health Connect data |
| GET | `/health-data/me` | Patient | Get own health data history |

### Sync

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/sync` | Patient | Offline-first data sync endpoint |

### Safety

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| PUT | `/safety/plan` | Clinician | Upsert crisis safety plan |
| GET | `/safety/plan/:patientId` | Clinician | Get patient's safety plan |
| GET | `/safety/plan/:patientId/history` | Clinician | Get safety plan version history |
| POST | `/safety/plan/:patientId/sign` | Patient | Patient signs safety plan |

### Clinicians

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/clinicians/me` | Clinician | Get own profile |
| GET | `/clinicians` | Admin | List all clinicians |
| POST | `/clinicians/notes` | Clinician | Create a clinician note |
| GET | `/clinicians/notes/:patientId` | Clinician | List notes for a patient |

### Reports

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/reports` | Clinician | Request a new report |
| GET | `/reports` | Clinician | List own reports |
| GET | `/reports/:id` | Clinician | Get report detail + download URL |

### Invites

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/invites` | Clinician | Create a patient invite |
| GET | `/invites` | Clinician | List pending invites |
| POST | `/invites/:id/resend` | Clinician | Resend an invite (max 3) |
| DELETE | `/invites/:id` | Clinician | Cancel an invite |
| GET | `/invites/validate/:token` | No | Validate an invite token |

### Notifications

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/notifications/preferences` | Patient | Get notification preferences |
| PUT | `/notifications/preferences` | Patient | Update notification preferences |
| POST | `/notifications/token` | Patient | Register push notification token |

### Consent

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/consent` | Patient | List own consent records |
| PUT | `/consent` | Patient | Grant or revoke a consent |

### Catalogues

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/catalogues/triggers` | Patient | List trigger catalogue |
| GET | `/catalogues/symptoms` | Patient | List symptom catalogue |
| GET | `/catalogues/strategies` | Patient | List coping strategy catalogue |
| GET | `/catalogues/medical-codes` | Clinician | Search SNOMED/ICD-10/RxNorm/OMOP codes |

### Admin

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/admin/stats` | Admin | System statistics |
| GET | `/admin/audit-log` | Admin | Query audit log |
| GET | `/admin/audit-log/export` | Admin | Export audit log as CSV |

### FHIR

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/fhir/metadata` | No | FHIR CapabilityStatement |
| GET | `/fhir/Patient/:id` | Clinician | FHIR Patient resource |
| GET | `/fhir/Patient/:id/$everything` | Clinician | FHIR Patient Bundle (all resources) |
| GET | `/fhir/Observation` | Clinician | FHIR Observations (query by patient) |
| GET | `/fhir/MedicationRequest` | Clinician | FHIR MedicationRequests |
| GET | `/fhir/QuestionnaireResponse` | Clinician | FHIR QuestionnaireResponses |
| GET | `/fhir/Condition` | Clinician | FHIR Conditions |
| GET | `/fhir/CarePlan` | Clinician | FHIR CarePlans |
| GET | `/fhir/Consent` | Clinician | FHIR Consent records |

### Research

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/research/exports` | Admin | Request a de-identified export |
| GET | `/research/exports` | Admin | List research exports |
| GET | `/research/exports/:id` | Admin | Get export detail + download URL |
| POST | `/research/cohorts` | Admin | Create a cohort definition |
| GET | `/research/cohorts` | Admin | List cohort definitions |
| PUT | `/research/cohorts/:id` | Admin | Update a cohort |
| DELETE | `/research/cohorts/:id` | Admin | Delete a cohort |
| POST | `/research/cohorts/query` | Admin | Execute a cohort query |

### Search

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/search` | Clinician | Full-text search (patients + notes) |

### WebSocket

| Path | Auth | Description |
|------|------|-------------|
| `/ws` | Clinician | Real-time alert and event broadcasting |

### Health

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | No | Liveness check (DB connectivity) |

---

## B. Database Schema Reference

The complete database schema (48 tables, all columns, types, and constraints) is documented in [`db-schema.md`](db-schema.md).

### Commonly Confused Column Names

| Table | Correct Column | Incorrect Assumption |
|-------|---------------|---------------------|
| `validated_assessments` | `score` | ~~`total_score`~~ |
| `validated_assessments` | `scale` | ~~`scale_code`~~ |
| `validated_assessments` | `completed_at` | ~~`assessed_at`~~ |
| `daily_entries` | `mood` | ~~`mood_score`~~ |
| `daily_entries` | `coping` | ~~`coping_score`~~ |
| `consent_records` | `granted_at` | ~~`created_at`~~ |

---

## C. Assessment Scales Reference

### PHQ-9 (Patient Health Questionnaire-9)

- **LOINC**: 44249-1
- **Items**: 9 (scored 0–3 each)
- **Range**: 0–27
- **Bands**: 0–4 Minimal, 5–9 Mild, 10–14 Moderate, 15–19 Moderately severe, 20–27 Severe
- **Questions**:
  1. Little interest or pleasure in doing things
  2. Feeling down, depressed, or hopeless
  3. Trouble falling or staying asleep, or sleeping too much
  4. Feeling tired or having little energy
  5. Poor appetite or overeating
  6. Feeling bad about yourself — failure, letting down family
  7. Trouble concentrating on things (reading, watching TV)
  8. Moving or speaking slowly / being fidgety or restless
  9. Thoughts of being better off dead or hurting yourself

### GAD-7 (Generalised Anxiety Disorder-7)

- **LOINC**: 69737-5
- **Items**: 7 (scored 0–3 each)
- **Range**: 0–21
- **Bands**: 0–4 Minimal, 5–9 Mild, 10–14 Moderate, 15–21 Severe
- **Questions**:
  1. Feeling nervous, anxious, or on edge
  2. Not being able to stop or control worrying
  3. Worrying too much about different things
  4. Trouble relaxing
  5. Being so restless it's hard to sit still
  6. Becoming easily annoyed or irritable
  7. Feeling afraid, as if something awful might happen

### ASRM (Altman Self-Rating Mania Scale)

- **LOINC**: N/A (no assigned LOINC code)
- **Items**: 5 (scored 0–3 each)
- **Range**: 0–15
- **Threshold**: ≥ 6 indicates possible mania/hypomania
- **Questions**:
  1. Positive mood / elevated spirits
  2. Increased self-confidence
  3. Decreased need for sleep
  4. Increased speech or talkativeness
  5. Increased activity or energy

### C-SSRS (Columbia-Suicide Severity Rating Scale — Screener)

- **LOINC**: 89213-1
- **Items**: 4 (binary Yes=1 / No=0)
- **Range**: 0–4
- **Risk levels**: 0 = None, 1 = Passive ideation, ≥ 2 = Elevated (crisis alert)
- **Questions**:
  1. Wished you were dead or could go to sleep and not wake up?
  2. Had actual thoughts of killing yourself?
  3. Thought about how you might do this?
  4. Had any intention of acting on these thoughts?

### ISI (Insomnia Severity Index)

- **LOINC**: 89794-0
- **Items**: 7 (scored 0–4 each)
- **Range**: 0–28
- **Bands**: 0–7 No clinically significant insomnia, 8–14 Subthreshold, 15–21 Moderate, 22–28 Severe

### WHODAS 2.0 (WHO Disability Assessment Schedule)

- **LOINC**: N/A
- **Domains**: Cognition, Mobility, Self-care, Getting along, Life activities, Participation
- **Reassessment**: 30 days

---

## D. Alert Rules Reference

| Rule Key | Name | Condition | Severity | Window |
|----------|------|-----------|----------|--------|
| RULE-001 | Mood decline (warning) | Mood drops ≥ 2.5 pts in 24h | Warning | 24h |
| RULE-001 | Mood decline (critical) | Mood drops ≥ 3.5 pts in 24h | Critical | 24h |
| RULE-002 | Missed check-in (info) | 3+ consecutive days missed | Info | Rolling |
| RULE-002 | Missed check-in (warning) | 5+ consecutive days missed | Warning | Rolling |
| RULE-003 | Trigger escalation | Trigger severity ≥ 7 on 3+ days | Warning | 7d |
| RULE-004 | Safety flag | C-SSRS ≥ 2 or SI ≥ 2 | Critical | Immediate |
| RULE-005 | Med non-adherence | ≥ 2 missed doses | Warning | 7d |
| RULE-006 | Sleep disruption | Persistent sleep pattern deviation | Warning | 7d |
| RULE-007 | Exercise decline | Significant activity decrease | Info | 14d |
| RULE-008 | Journal sentiment | Negative sentiment trend | Info | 7d |

**Deduplication**: One open alert per rule per patient. Existing alerts are updated rather than duplicated.

---

## E. Risk Scoring Factor Reference

### Graduated Risk Scoring (v1.1a — 10 Rules)

| Factor | Code | Max Weight | Domain | Graduation Logic | Lookback | Data Source | Literature |
|--------|------|-----------|--------|------------------|----------|-------------|------------|
| C-SSRS Ideation | R01 | 35 | Safety | L1-2: 10, L3: 25, L4-5: 35. Recency decay: 48h=1.0x, 7d=0.8x, 14d=0.6x | 14 days | `validated_assessments` (scale='C-SSRS') | OR 1.5-6.9 per level (Columbia) |
| PHQ-9 + Trajectory | R02 | 20 | Mood | 10-14: 5, 15-19: 10, 20+: 15. +5 if >=5pt increase | 30 days | `validated_assessments` (scale='PHQ-9') | MCID 5pts (Jacobson-Truax) |
| Low Mood Streak | R03 | 15 | Mood | 3d consecutive: 10, 5d: 13, 7d+: 15 | Last 14 entries | `daily_entries` (mood) | Digital phenotyping evidence |
| Engagement/Missed | R04 | 12 | Engagement | 3 missed: 5, 5+: 10. Week-over-week decline: +2 | 14 days | `daily_entries` (absence) | Post-discharge OR |
| ASRM Mania | R05 | 10 | Mood | 6-9: 5, 10-13: 8, 14+: 10 | 14 days | `validated_assessments` (scale='ASRM') | Sensitivity 85.5% at cutoff 6 |
| Med Non-Adherence | R06 | 10 | Medication | 2d: 2, 3-4d: 5, 5+d: 8. 3d+ consecutive: +2 | 7 days | `medication_adherence_logs` | AOR 3.09 for relapse |
| Social Withdrawal | R07 | 8 | Engagement | Avoidance: 3, +anhedonia: 5, acute 5/7d: 8 | 7 days | `daily_entries` (social_avoidance, anhedonia_score) | Dose-response with SI |
| Sleep Disruption | R08 | 7 | Physical | <5h 3+/7d: 4, quality<=2 4+/7d: +3 (cap 7) | 7 days | `daily_entries` (sleep_hours), `sleep_logs` | OR 2.10-3.0 for SI |
| GAD-7 Anxiety | R09 | 7 | Mood | 10-14: 3, 15+: 5. +2 if >=5pt increase | 30 days | `validated_assessments` (scale='GAD-7') | Comorbid anxiety amplifier |
| PHQ-9 Item 9 (SI) | R10 | 8 | Safety | q9=1: 3, q9=2: 5, q9=3: 8 | 30 days | `validated_assessments` (item_responses->'q9') | Direct SI screen |

**Total maximum**: 132 (over-allocated). **Capped at 100**. Over-allocation ensures patients with multiple co-occurring moderate risks are properly flagged at the critical level.

**Risk bands**: 0-24 Low (green), 25-49 Moderate (yellow), 50-74 High (orange), 75-100 Critical (red).

**Domain grouping**: Safety (R01, R10 = 43 max), Mood (R02, R03, R05, R09 = 52 max), Engagement (R04, R07 = 20 max), Physical (R08 = 7 max), Medication (R06 = 10 max).

**Longitudinal tracking**: Each computation writes to `patient_risk_history` table. Available via `GET /api/v1/insights/:patientId/risk-history?days=90`.

---

## F. FHIR Resource Mapping Reference

| MindLog Table | FHIR R4 Resource | Key Mappings |
|--------------|-----------------|-------------|
| `patients` | Patient | name, birthDate, identifier (MRN), active |
| `daily_entries` | Observation | code (LOINC), valueQuantity (mood, sleep, exercise), effectiveDateTime |
| `passive_health_snapshots` | Observation | code (LOINC for steps, HR, HRV, SpO2), valueQuantity |
| `patient_medications` | MedicationRequest | medication (RxNorm if available), dosageInstruction, status |
| `validated_assessments` | QuestionnaireResponse | questionnaire (LOINC), item (responses), authored |
| `patient_diagnoses` | Condition | code (ICD-10/SNOMED), clinicalStatus, onsetDateTime |
| `crisis_safety_plans` | CarePlan | status, category, activity (plan elements) |
| `consent_records` | Consent | status, scope, category, dateTime |

**Code systems used**:
- LOINC: Assessment scales, vital signs
- SNOMED CT: Clinical terms, symptoms
- ICD-10-CM: Diagnosis codes
- RxNorm: Medication codes
- OMOP: Observational research concepts

---

## G. Environment Variables Quick Reference

| Variable | Required | Category | Default |
|----------|----------|----------|---------|
| `DATABASE_URL` | Yes | Database | — |
| `SUPABASE_URL` | Yes | Auth | — |
| `SUPABASE_ANON_KEY` | Yes | Auth | — |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Auth | — |
| `JWT_SECRET` | Yes | Auth | — |
| `JWT_ACCESS_EXPIRY` | No | Auth | `15m` |
| `JWT_REFRESH_EXPIRY` | No | Auth | `7d` |
| `API_PORT` | No | API | `3000` |
| `API_HOST` | No | API | `0.0.0.0` |
| `NODE_ENV` | No | API | `development` |
| `API_BASE_URL` | No | API | `http://localhost:3000` |
| `CORS_ORIGIN` | No | API | `http://localhost:5173` |
| `REDIS_URL` | No | Cache | `redis://localhost:6379` |
| `AI_PROVIDER` | No | AI | `anthropic` |
| `AI_INSIGHTS_ENABLED` | No | AI | `false` |
| `ANTHROPIC_API_KEY` | Conditional | AI | — |
| `ANTHROPIC_MODEL` | No | AI | `claude-sonnet-4-5-20250929` |
| `ANTHROPIC_BAA_SIGNED` | No | Compliance | `false` |
| `OLLAMA_BASE_URL` | No | AI | `http://localhost:11434` |
| `OLLAMA_MODEL` | No | AI | `alibayram/medgemma:27b` |
| `RESEND_API_KEY` | No | Email | — |
| `EMAIL_FROM` | No | Email | — |
| `TWILIO_ACCOUNT_SID` | No | SMS | — |
| `TWILIO_AUTH_TOKEN` | No | SMS | — |
| `TWILIO_FROM_NUMBER` | No | SMS | — |
| `EXPO_PUSH_ACCESS_TOKEN` | No | Push | — |
| `STORAGE_BUCKET_REPORTS` | No | Storage | `mindlog-reports` |
| `SENTRY_DSN` | No | Monitoring | — |
| `WEB_APP_URL` | No | Config | `http://localhost:5173` |
| `HIPAA_ASSESSMENT_COMPLETE` | No | Compliance | `false` |

---

## H. Keyboard Shortcuts (Web Dashboard)

| Shortcut | Action | Context |
|----------|--------|---------|
| `/` or `Cmd+K` | Open global search | Any page |
| `N` | Open quick note panel | Patient detail page |
| `Escape` | Close modal, panel, or search overlay | Any page |
| `Cmd+Enter` | Save note | Quick note panel |
| `↑` / `↓` | Navigate search results | Search overlay |
| `Enter` | Select search result | Search overlay |

---

## I. Troubleshooting

### Login Failures

| Symptom | Cause | Resolution |
|---------|-------|------------|
| "Invalid credentials" | Incorrect email or password | Verify email, reset password if needed |
| "MFA code invalid" | Wrong TOTP code or clock drift | Sync authenticator app time, try next code |
| "Rate limited" (429) | Too many login attempts | Wait 1 minute, then try again |
| "Account disabled" | Admin has disabled the account | Contact your administrator |

### Missing Health Data

| Symptom | Cause | Resolution |
|---------|-------|------------|
| No health data card on Today screen | Permissions not granted | Go to device Settings > HealthKit/Health Connect > MindLog and enable |
| Health data shows "—" for all fields | No data recorded by device | Ensure health device/watch is syncing to your phone |
| Data appears stale | Sync failed silently | Force-close and reopen the app |

### AI Insights Unavailable

| Symptom | Cause | Resolution |
|---------|-------|------------|
| "AI insights are not enabled" (503) | `AI_INSIGHTS_ENABLED=false` | Set to `true` in environment and restart API |
| "BAA required" (503) | `ANTHROPIC_BAA_SIGNED=false` and provider is `anthropic` | Sign BAA with Anthropic, set to `true`, or switch to `AI_PROVIDER=ollama` |
| "Consent required" | Patient hasn't granted AI consent | Patient must enable AI insights in Settings > Privacy |
| Insights tab missing | Feature flags not set | Check all 3 conditions: env flag, BAA/provider, patient consent |

### Offline Sync Conflicts

| Symptom | Cause | Resolution |
|---------|-------|------------|
| Duplicate entries after sync | Network timeout during submission | App deduplicates by (patient_id, entry_date); duplicates are merged |
| Old data overwriting new | Clock skew on device | Ensure device date/time is set to automatic |

### WebSocket Disconnection

| Symptom | Cause | Resolution |
|---------|-------|------------|
| Real-time alerts stopped | WebSocket connection dropped | Refresh the browser page; connection auto-reconnects |
| Badge counts not updating | Network proxy blocking WebSocket | Ensure proxy allows `wss://` connections on the API port |

### Worker Job Failures

| Symptom | Cause | Resolution |
|---------|-------|------------|
| Reports stuck in "Queued" | Worker process not running | Start workers: `npm run dev:worker` |
| AI insights failing | LLM provider unreachable | Check API key, provider URL, and network connectivity |
| "Redis connection refused" | Redis not running | Start Redis: `docker start mindlog-redis` or `npm run demo:infra` |

---

## J. Glossary

| Term | Definition |
|------|-----------|
| **Anhedonia** | Loss of interest or pleasure in activities previously enjoyed |
| **ASRM** | Altman Self-Rating Mania Scale — a 5-item screening tool for mania |
| **Audit log** | An append-only record of all data access events for HIPAA compliance |
| **BAA** | Business Associate Agreement — a HIPAA-mandated contract between a covered entity and a service provider handling PHI |
| **BullMQ** | A Node.js job queue library backed by Redis |
| **C-SSRS** | Columbia-Suicide Severity Rating Scale — a structured interview/screening tool for suicidal ideation |
| **Care team** | The set of clinicians assigned to a patient, each with a defined role |
| **CDA** | Clinical Document Architecture — an HL7 standard for clinical document exchange (XML format) |
| **Check-in** | A patient's daily wellness entry capturing mood, sleep, exercise, and clinical metrics |
| **Cohort** | A defined group of patients matching specific filter criteria |
| **Consent** | A recorded patient permission for specific data use |
| **CORS** | Cross-Origin Resource Sharing — a browser security mechanism controlling which domains can make API requests |
| **Daily entry** | The database record (`daily_entries` table) created by a patient's daily check-in |
| **De-identification** | The process of removing personally identifiable information from data |
| **EAS** | Expo Application Services — cloud build service for React Native apps |
| **FHIR** | Fast Healthcare Interoperability Resources — HL7's standard for healthcare data exchange |
| **GAD-7** | Generalised Anxiety Disorder-7 — a 7-item screening tool for anxiety |
| **HIPAA** | Health Insurance Portability and Accountability Act — US federal law governing healthcare data privacy |
| **HRV** | Heart Rate Variability — the variation in time between successive heartbeats |
| **ICD-10** | International Classification of Diseases, 10th Revision — standard diagnosis coding |
| **ISI** | Insomnia Severity Index — a 7-item screening tool for insomnia |
| **JWT** | JSON Web Token — a compact, URL-safe token format for authentication |
| **LOINC** | Logical Observation Identifiers Names and Codes — standard codes for clinical observations |
| **MFA** | Multi-Factor Authentication — requiring multiple verification methods for login |
| **MRN** | Medical Record Number — a unique patient identifier within a healthcare system |
| **NPI** | National Provider Identifier — a unique 10-digit identification number for healthcare providers |
| **OMOP** | Observational Medical Outcomes Partnership — a common data model for observational research |
| **PHI** | Protected Health Information — individually identifiable health data covered by HIPAA |
| **PHQ-9** | Patient Health Questionnaire-9 — a 9-item screening tool for depression |
| **Pino** | A fast, low-overhead Node.js logging library |
| **RLS** | Row-Level Security — a PostgreSQL feature that restricts row access based on user identity |
| **Risk band** | Classification of risk score: Low (0–24), Moderate (25–49), High (50–74), Critical (75–100) |
| **Risk score** | A composite 0–100 score derived from 7 weighted clinical factors |
| **RxNorm** | A standardised nomenclature for clinical drug names |
| **Safe Harbour** | A HIPAA de-identification method requiring removal of 18 categories of identifiers |
| **SaMD** | Software as a Medical Device — software intended for medical purposes (FDA regulated) |
| **SNOMED CT** | Systematized Nomenclature of Medicine — Clinical Terms (comprehensive clinical terminology) |
| **Stanley-Brown** | The Stanley-Brown Safety Planning Intervention — a structured crisis safety plan model |
| **TOTP** | Time-based One-Time Password — an MFA method using time-synchronised codes |
| **WebSocket** | A persistent, full-duplex communication protocol over a single TCP connection |
| **WHODAS** | WHO Disability Assessment Schedule — a general assessment of health and disability |

---

*This document was generated for MindLog v1.1a. For the latest version, check the project repository.*
