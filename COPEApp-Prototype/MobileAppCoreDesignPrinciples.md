## Core Design Principle

Full validated scales (PHQ-9, GAD-7, YMRS, etc.) are too burdensome for daily administration. The best approach is to use **single-item or ultra-brief adaptations** from these validated instruments for daily tracking, with **periodic full-scale assessments** (weekly or biweekly) to anchor the data clinically.

---

## Daily Survey Domains & Items

### 1. Mood (Depression Pole)
- **"How would you rate your mood today?"** — Visual analog scale or 1–10 slider
- Adapted from the PHQ-2 core item: **"How much have you been bothered by feeling down, depressed, or hopeless today?"** (Not at all / A little / Moderately / A lot / Extremely)
- **Anhedonia probe:** "How much did you enjoy or look forward to things today?" (critical for depression detection, drawn from PHQ-2)

### 2. Mood (Mania/Hypomania Pole) — *Essential for Bipolar*
- **"How elevated, energized, or 'wired' did you feel today?"** (Not at all → Extremely) — adapted from the Altman Self-Rating Mania Scale (ASRM)
- **"Did you feel more irritable or short-tempered than usual?"** (Yes/No + severity)
- **"How fast were your thoughts racing today?"** (None → Extremely fast)
- **"Did you feel less need for sleep but still felt energized?"** (Yes/No) — a cardinal hypomanic symptom

### 3. Anxiety
- **"How anxious or worried did you feel today?"** — adapted from the GAD-2 core item (Not at all → Extremely)
- **"Were you able to stop or control your worrying?"** (Easily / With some effort / With great difficulty / Not at all)
- **"Did you experience any physical anxiety symptoms?"** (racing heart, chest tightness, trembling, shortness of breath) — checklist, captures somatic dimension

### 4. Sleep
Sleep is arguably the **single most important early warning signal** for mood episodes in bipolar disorder.

- **"What time did you go to bed and wake up?"** (clock inputs)
- **"How many hours did you sleep?"** (numeric)
- **"How would you rate your sleep quality?"** (Very poor → Excellent) — adapted from Pittsburgh Sleep Quality Index (PSQI) single-item
- **"How long did it take you to fall asleep?"** (< 15 min / 15–30 / 30–60 / > 60)
- **"How many times did you wake during the night?"** (0, 1, 2, 3+)
- **"Did you feel rested upon waking?"** (Not at all → Completely)

### 5. Energy & Activity Level
- **"How would you rate your energy level today?"** (1–10 or Very low → Very high)
- **"How active were you today compared to your usual?"** (Much less / Somewhat less / About the same / Somewhat more / Much more) — bidirectional framing is key for bipolar, capturing both psychomotor retardation and activation
- Consider passive data integration (step count from HealthKit/Google Fit)

### 6. Suicidal Ideation & Self-Harm — *Non-negotiable Safety Screen*
- **"Have you had any thoughts of hurting yourself or that you'd be better off dead?"** (No / Brief passing thoughts / Frequent thoughts / Thoughts with a plan)
- Adapted from PHQ-9 Item 9 and Columbia Suicide Severity Rating Scale (C-SSRS) screening items
- **Must trigger an alert pathway** (in-app crisis resources, 988 Suicide & Crisis Lifeline, clinician notification) if positive

### 7. Medication Adherence
- **"Did you take your medication(s) as prescribed today?"** (Yes, all / Missed one / Missed more than one / Didn't take any)
- **"Did you experience any side effects?"** (Yes/No + free text)
- This is critical for bipolar lithium/mood stabilizer adherence monitoring

### 8. Substance Use
- **"Did you use alcohol or recreational substances today?"** (No / Alcohol / Cannabis / Other)
- Quantity if yes — adapted from AUDIT-C daily diary approach
- Strong confounder for all three conditions

### 9. Social Functioning & Isolation
- **"How much time did you spend with other people today?"** (None / A little / A moderate amount / A lot)
- **"Did you avoid social situations you would normally participate in?"** (Yes/No)
- Social withdrawal is a prodromal signal for depressive episodes; increased sociality can signal hypomania

### 10. Cognitive Functioning
- **"How well were you able to concentrate or make decisions today?"** (Very poorly → Very well)
- **"Did your mind feel foggy or unclear?"** (Not at all → Extremely)
- Captures cognitive symptoms often missed in mood tracking

### 11. Stress & Life Events
- **"How stressed did you feel today?"** (1–10) — adapted from Perceived Stress Scale single-item
- **"Did anything significant happen today (positive or negative)?"** (optional free text or tagged categories: work, relationship, financial, health)

### 12. Appetite & Eating
- **"How was your appetite today?"** (Much less than normal / Less / Normal / More / Much more)
- Bidirectional framing important — both loss and increase are diagnostically meaningful

---

## Periodic Full-Scale Assessments (Weekly/Biweekly)

Anchor the daily micro-assessments with validated full instruments:

| Instrument | Domain | Frequency |
|---|---|---|
| **PHQ-9** | Depression severity | Weekly |
| **GAD-7** | Anxiety severity | Weekly |
| **ASRM** (Altman Self-Rating Mania Scale) | Mania/hypomania | Weekly |
| **ISI** (Insomnia Severity Index) | Sleep disorders | Biweekly |
| **C-SSRS** (screening version) | Suicide risk | Weekly |
| **WHODAS 2.0** (brief) | Functional disability | Monthly |
| **SDS** (Sheehan Disability Scale) | Functional impairment | Monthly |
| **QIDS-SR** | Depression (alternative to PHQ-9, better sensitivity to change) | Biweekly |

---

## Architecture Considerations for Expo

Given your experience — a few thoughts on the technical side:

- **FHIR QuestionnaireResponse** resources for structured data capture, which would make this interoperable with EHR systems
- **OMOP mapping** of PRO (Patient-Reported Outcome) data for research analytics
- **Adaptive survey logic** — skip mania items for unipolar depression-only patients; tailor length based on patient burden
- **Push notification timing** — evening surveys capture the full day; morning surveys best for sleep data. Consider a split (AM sleep + PM mood/activity)
- **Passive phenotyping** — accelerometer, screen time, typing speed, and GPS mobility patterns have emerging evidence as digital biomarkers for mood states (NIMH-funded studies like BiAffect)
- **Clinician dashboard** — trend visualization with automated alerts for: sleep duration change >2 hours, elevated mania scores, any suicidal ideation endorsement, medication non-adherence streaks

This would be a compelling product for the bipolar population especially, where early detection of mood episode onset through daily tracking has strong evidence for improving outcomes. Want me to start prototyping the Expo app structure or build out a more detailed FHIR Questionnaire specification?
