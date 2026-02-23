import { Page, Locator, expect } from '@playwright/test';

/**
 * Page Object Model for modal components
 */
export class ModalsComponent {
  readonly page: Page;

  // Generic modal backdrop
  readonly modalBackdrop: Locator;

  // Invite Patient Modal
  readonly inviteModal: Locator;
  readonly inviteEmailInput: Locator;
  readonly inviteFirstNameInput: Locator;
  readonly inviteLastNameInput: Locator;
  readonly inviteMrnInput: Locator;
  readonly inviteSubmitBtn: Locator;
  readonly inviteCancelBtn: Locator;
  readonly inviteError: Locator;

  // Drilldown Modal
  readonly drilldownModal: Locator;
  readonly drilldownTitle: Locator;
  readonly drilldownStats: Locator;
  readonly drilldownPatients: Locator;
  readonly drilldownClose: Locator;
  readonly drilldownExportBtn: Locator;

  // Assessment Request Modal
  readonly assessmentModal: Locator;
  readonly assessmentScaleSelect: Locator;
  readonly assessmentSubmitBtn: Locator;
  readonly assessmentCancelBtn: Locator;

  // Quick Note Panel
  readonly quickNotePanel: Locator;
  readonly quickNotePatientSelect: Locator;
  readonly quickNoteTextarea: Locator;
  readonly quickNoteTypeSelect: Locator;
  readonly quickNoteSaveBtn: Locator;
  readonly quickNoteCancelBtn: Locator;

  constructor(page: Page) {
    this.page = page;

    // Generic backdrop
    this.modalBackdrop = page.locator('[style*="position: fixed"][style*="inset: 0"]');

    // Invite Modal
    this.inviteModal = page.locator('[data-testid="invite-modal"]');
    this.inviteEmailInput = page.locator('[data-testid="invite-email"], input[name="email"]');
    this.inviteFirstNameInput = page.locator('[data-testid="invite-firstname"], input[name="first_name"]');
    this.inviteLastNameInput = page.locator('[data-testid="invite-lastname"], input[name="last_name"]');
    this.inviteMrnInput = page.locator('[data-testid="invite-mrn"], input[name="mrn"]');
    this.inviteSubmitBtn = page.locator('[data-testid="invite-submit"], button:has-text("Send Invite")');
    this.inviteCancelBtn = page.locator('[data-testid="invite-cancel"], button:has-text("Cancel")');
    this.inviteError = page.locator('[data-testid="invite-error"]');

    // Drilldown Modal
    this.drilldownModal = page.locator('[data-testid="drilldown-modal"]');
    this.drilldownTitle = page.locator('[data-testid="drilldown-title"]');
    this.drilldownStats = page.locator('[data-testid="drilldown-stats"]');
    this.drilldownPatients = page.locator('[data-testid="drilldown-patient"]');
    this.drilldownClose = page.locator('[data-testid="drilldown-close"]');
    this.drilldownExportBtn = page.locator('[data-testid="drilldown-export"]');

    // Assessment Modal
    this.assessmentModal = page.locator('[data-testid="assessment-modal"]');
    this.assessmentScaleSelect = page.locator('[data-testid="assessment-scale"], select');
    this.assessmentSubmitBtn = page.locator('[data-testid="assessment-submit"], button:has-text("Request")');
    this.assessmentCancelBtn = page.locator('[data-testid="assessment-cancel"], button:has-text("Cancel")');

    // Quick Note Panel
    this.quickNotePanel = page.locator('[data-testid="quick-note-panel"]');
    this.quickNotePatientSelect = page.locator('[data-testid="quick-note-patient"]');
    this.quickNoteTextarea = page.locator('[data-testid="quick-note-text"], textarea');
    this.quickNoteTypeSelect = page.locator('[data-testid="quick-note-type"], select');
    this.quickNoteSaveBtn = page.locator('[data-testid="quick-note-save"], button:has-text("Save")');
    this.quickNoteCancelBtn = page.locator('[data-testid="quick-note-cancel"], button:has-text("Cancel")');
  }

  /**
   * Close any open modal by pressing Escape
   */
  async closeWithEscape() {
    await this.page.keyboard.press('Escape');
  }

  /**
   * Close modal by clicking backdrop
   */
  async closeByClickingBackdrop() {
    if (await this.modalBackdrop.isVisible()) {
      await this.modalBackdrop.click({ position: { x: 10, y: 10 } });
    }
  }

  // ---------- Invite Modal Methods ----------

  /**
   * Fill and submit invite form
   */
  async submitInvite(data: {
    email: string;
    firstName: string;
    lastName: string;
    mrn?: string;
  }) {
    await this.inviteEmailInput.fill(data.email);
    await this.inviteFirstNameInput.fill(data.firstName);
    await this.inviteLastNameInput.fill(data.lastName);
    if (data.mrn) {
      await this.inviteMrnInput.fill(data.mrn);
    }
    await this.inviteSubmitBtn.click();
  }

  /**
   * Cancel invite modal
   */
  async cancelInvite() {
    await this.inviteCancelBtn.click();
  }

  /**
   * Check if invite modal is open
   */
  async isInviteModalOpen(): Promise<boolean> {
    return this.inviteModal.isVisible();
  }

  // ---------- Drilldown Modal Methods ----------

  /**
   * Get drilldown modal title
   */
  async getDrilldownTitle(): Promise<string> {
    return (await this.drilldownTitle.textContent()) ?? '';
  }

  /**
   * Get count of patients in drilldown
   */
  async getDrilldownPatientCount(): Promise<number> {
    return this.drilldownPatients.count();
  }

  /**
   * Click patient in drilldown
   */
  async clickDrilldownPatient(index: number) {
    await this.drilldownPatients.nth(index).click();
  }

  /**
   * Export drilldown data
   */
  async exportDrilldown() {
    if (await this.drilldownExportBtn.isVisible()) {
      await this.drilldownExportBtn.click();
    }
  }

  /**
   * Close drilldown modal
   */
  async closeDrilldown() {
    await this.drilldownClose.click();
  }

  /**
   * Check if drilldown modal is open
   */
  async isDrilldownOpen(): Promise<boolean> {
    return this.drilldownModal.isVisible();
  }

  // ---------- Assessment Modal Methods ----------

  /**
   * Request assessment
   */
  async requestAssessment(scale: string) {
    await this.assessmentScaleSelect.selectOption(scale);
    await this.assessmentSubmitBtn.click();
  }

  /**
   * Cancel assessment request
   */
  async cancelAssessment() {
    await this.assessmentCancelBtn.click();
  }

  /**
   * Check if assessment modal is open
   */
  async isAssessmentModalOpen(): Promise<boolean> {
    return this.assessmentModal.isVisible();
  }

  // ---------- Quick Note Panel Methods ----------

  /**
   * Add a quick note
   */
  async addQuickNote(text: string, patientId?: string, noteType?: string) {
    if (patientId) {
      await this.quickNotePatientSelect.selectOption(patientId);
    }
    await this.quickNoteTextarea.fill(text);
    if (noteType) {
      await this.quickNoteTypeSelect.selectOption(noteType);
    }
    await this.quickNoteSaveBtn.click();
  }

  /**
   * Close quick note panel
   */
  async closeQuickNote() {
    await this.quickNoteCancelBtn.click();
  }

  /**
   * Check if quick note panel is open
   */
  async isQuickNotePanelOpen(): Promise<boolean> {
    return this.quickNotePanel.isVisible();
  }

  /**
   * Check if any modal is open
   */
  async isAnyModalOpen(): Promise<boolean> {
    return this.modalBackdrop.isVisible();
  }
}
