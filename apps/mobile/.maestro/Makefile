# =============================================================================
# Maestro E2E Test Runner — MindLog Mobile
# =============================================================================

MAESTRO := maestro
FLOW_DIR := flows
SCREENSHOT_DIR := screenshots

.PHONY: all smoke safety-sweep auth onboarding today checkin journal insights \
        assessments medications profile settings accessibility edge_cases safety \
        single studio clean

# ── Full suite ────────────────────────────────────────────────────────────────

all: auth onboarding today checkin journal insights assessments medications \
     profile settings accessibility edge_cases safety
	@echo "✅ All 46 flows complete"

# ── Smoke test (4 critical flows) ────────────────────────────────────────────

smoke:
	$(MAESTRO) test $(FLOW_DIR)/auth/01_sign_in_happy_path.yaml
	$(MAESTRO) test $(FLOW_DIR)/today/01_screen_loads.yaml
	$(MAESTRO) test $(FLOW_DIR)/checkin/01_full_flow.yaml
	$(MAESTRO) test $(FLOW_DIR)/safety/01_crisis_today.yaml
	@echo "✅ Smoke test passed"

# ── Safety sweep (crisis contacts on every screen) ───────────────────────────

safety-sweep:
	$(MAESTRO) test $(FLOW_DIR)/safety/
	@echo "✅ Safety sweep passed"

# ── Category runners ─────────────────────────────────────────────────────────

auth:
	$(MAESTRO) test $(FLOW_DIR)/auth/

onboarding:
	$(MAESTRO) test $(FLOW_DIR)/onboarding/

today:
	$(MAESTRO) test $(FLOW_DIR)/today/

checkin:
	$(MAESTRO) test $(FLOW_DIR)/checkin/

journal:
	$(MAESTRO) test $(FLOW_DIR)/journal/

insights:
	$(MAESTRO) test $(FLOW_DIR)/insights/

assessments:
	$(MAESTRO) test $(FLOW_DIR)/assessments/

medications:
	$(MAESTRO) test $(FLOW_DIR)/medications/

profile:
	$(MAESTRO) test $(FLOW_DIR)/profile/

settings:
	$(MAESTRO) test $(FLOW_DIR)/settings/

accessibility:
	$(MAESTRO) test $(FLOW_DIR)/accessibility/

edge_cases:
	$(MAESTRO) test $(FLOW_DIR)/edge_cases/

safety:
	$(MAESTRO) test $(FLOW_DIR)/safety/

# ── Utilities ─────────────────────────────────────────────────────────────────

single:
	$(MAESTRO) test $(FLOW)

studio:
	$(MAESTRO) studio

clean:
	rm -rf $(SCREENSHOT_DIR)/*.png
	@echo "🗑  Screenshots cleaned"
