import { Page, Locator, expect } from '@playwright/test';

type PatientTab = 'overview' | 'trends' | 'journal' | 'notes' | 'alerts' | 'medications' | 'ai';

/**
 * Page Object Model for the Patient Detail page
 */
export class PatientDetailPage {
  readonly page: Page;

  // Header
  readonly header: Locator;
  readonly patientName: Locator;
  readonly patientAvatar: Locator;
  readonly statusBadge: Locator;
  readonly riskBadge: Locator;

  // Status/Risk dropdowns
  readonly statusSelect: Locator;
  readonly riskSelect: Locator;
  readonly saveButton: Locator;

  // Tab bar
  readonly tabBar: Locator;
  readonly overviewTab: Locator;
  readonly trendsTab: Locator;
  readonly journalTab: Locator;
  readonly notesTab: Locator;
  readonly alertsTab: Locator;
  readonly medicationsTab: Locator;
  readonly aiTab: Locator;

  // Tab content
  readonly tabContent: Locator;

  // Quick actions footer
  readonly quickActionsFooter: Locator;
  readonly addNoteBtn: Locator;
  readonly requestAssessmentBtn: Locator;
  readonly generateReportBtn: Locator;
  readonly escalateBtn: Locator;

  // Notes form
  readonly noteTextarea: Locator;
  readonly noteTypeSelect: Locator;
  readonly notePrivateCheckbox: Locator;
  readonly saveNoteBtn: Locator;

  // Assessment modal
  readonly assessmentModal: Locator;

  // Loading
  readonly loadingIndicator: Locator;

  // Toast
  readonly toast: Locator;

  // Back button
  readonly backButton: Locator;

  constructor(page: Page) {
    this.page = page;

    // Header
    this.header = page.locator('.patient-detail-header');
    this.patientName = page.locator('.detail-name');
    this.patientAvatar = page.locator('.detail-avatar');
    this.statusBadge = page.locator('.detail-badges .badge').first();
    this.riskBadge = page.locator('.detail-badges .badge:has-text("risk")');

    // Dropdowns
    this.statusSelect = page.locator('.detail-actions select').first();
    this.riskSelect = page.locator('.detail-actions select').nth(1);
    this.saveButton = page.locator('.detail-actions-btn:has-text("Save")');

    // Tab bar
    this.tabBar = page.locator('.detail-tab-bar');
    this.overviewTab = page.locator('.detail-tab:has-text("Overview")');
    this.trendsTab = page.locator('.detail-tab:has-text("Mood Trends")');
    this.journalTab = page.locator('.detail-tab:has-text("Journal")');
    this.notesTab = page.locator('.detail-tab:has-text("Notes")');
    this.alertsTab = page.locator('.detail-tab:has-text("Alerts")');
    this.medicationsTab = page.locator('.detail-tab:has-text("Medications")');
    this.aiTab = page.locator('.detail-tab:has-text("AI Insights")');

    // Tab content area
    this.tabContent = page.locator('.tab-card, .tab-entry-row, .tab-empty, .tab-loading').first();

    // Quick actions
    this.quickActionsFooter = page.locator('[style*="sticky"][style*="bottom"]');
    this.addNoteBtn = page.locator('button:has-text("Add Note")');
    this.requestAssessmentBtn = page.locator('button:has-text("Request Assessment")');
    this.generateReportBtn = page.locator('button:has-text("Generate Report")');
    this.escalateBtn = page.locator('button:has-text("Escalate")');

    // Notes form
    this.noteTextarea = page.locator('textarea[placeholder*="clinical observation"]');
    this.noteTypeSelect = page.locator('select:has(option[value="observation"])');
    this.notePrivateCheckbox = page.locator('input[type="checkbox"]:near(text("Private"))');
    this.saveNoteBtn = page.locator('button:has-text("Save Note")');

    // Assessment modal
    this.assessmentModal = page.locator('[data-testid="assessment-modal"], .modal');

    // Loading
    this.loadingIndicator = page.locator('text=Loading patient');

    // Toast
    this.toast = page.locator('[data-testid="toast"], [style*="fixed"][style*="bottom"][style*="right"]');

    // Back button
    this.backButton = page.locator('.detail-actions-btn:has-text("All Patients")');
  }

  /**
   * Navigate to a specific patient
   */
  async goto(patientId: string) {
    await this.page.goto(`/patients/${patientId}`);
    await this.waitForLoad();
  }

  /**
   * Wait for page to load
   */
  async waitForLoad() {
    await expect(this.loadingIndicator).not.toBeVisible({ timeout: 30000 });
    await expect(this.patientName).toBeVisible({ timeout: 10000 });
  }

  /**
   * Switch to a specific tab
   */
  async switchTab(tab: PatientTab) {
    const tabMap: Record<PatientTab, Locator> = {
      overview: this.overviewTab,
      trends: this.trendsTab,
      journal: this.journalTab,
      notes: this.notesTab,
      alerts: this.alertsTab,
      medications: this.medicationsTab,
      ai: this.aiTab,
    };
    await tabMap[tab].click();
  }

  /**
   * Check if a tab is active
   */
  async isTabActive(tab: PatientTab): Promise<boolean> {
    const tabMap: Record<PatientTab, Locator> = {
      overview: this.overviewTab,
      trends: this.trendsTab,
      journal: this.journalTab,
      notes: this.notesTab,
      alerts: this.alertsTab,
      medications: this.medicationsTab,
      ai: this.aiTab,
    };
    const classes = await tabMap[tab].getAttribute('class');
    return classes?.includes('active') ?? false;
  }

  /**
   * Get patient name
   */
  async getPatientName(): Promise<string> {
    return (await this.patientName.textContent()) ?? '';
  }

  /**
   * Change patient status
   */
  async setStatus(status: 'active' | 'crisis' | 'inactive' | 'discharged') {
    await this.statusSelect.selectOption(status);
  }

  /**
   * Change patient risk level
   */
  async setRiskLevel(risk: 'low' | 'moderate' | 'high' | 'critical') {
    await this.riskSelect.selectOption(risk);
  }

  /**
   * Save status/risk changes
   */
  async saveChanges() {
    if (await this.saveButton.isVisible()) {
      await this.saveButton.click();
    }
  }

  /**
   * Add a clinical note
   */
  async addNote(text: string, type = 'observation', isPrivate = false) {
    await this.switchTab('notes');
    await this.noteTextarea.fill(text);
    await this.noteTypeSelect.selectOption(type);
    if (isPrivate) {
      await this.notePrivateCheckbox.check();
    }
    await this.saveNoteBtn.click();
  }

  /**
   * Request an assessment
   */
  async requestAssessment() {
    await this.requestAssessmentBtn.click();
    await expect(this.assessmentModal).toBeVisible();
  }

  /**
   * Escalate to crisis
   */
  async escalateAlert() {
    await this.escalateBtn.click();
  }

  /**
   * Go back to patients list
   */
  async goBack() {
    await this.backButton.click();
  }

  /**
   * Generate report
   */
  async generateReport() {
    await this.generateReportBtn.click();
  }

  /**
   * Check if toast is visible
   */
  async hasToast(): Promise<boolean> {
    return this.toast.isVisible();
  }

  /**
   * Get toast text
   */
  async getToastText(): Promise<string> {
    if (await this.toast.isVisible()) {
      return (await this.toast.textContent()) ?? '';
    }
    return '';
  }

  /**
   * Verify patient detail page is displayed
   */
  async expectPatientDetailPage() {
    await expect(this.header).toBeVisible();
    await expect(this.tabBar).toBeVisible();
    await expect(this.quickActionsFooter).toBeVisible();
  }

  /**
   * Wait for tab content to load
   */
  async waitForTabContent() {
    await this.page.waitForLoadState('networkidle');
    // Wait for loading indicators to disappear
    const loadingText = this.page.locator('text=/Loading/i');
    await expect(loadingText).not.toBeVisible({ timeout: 15000 });
  }
}
