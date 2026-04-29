import React from 'react';
import { Grid, TextField, Box, Button, Typography } from '@mui/material';
import { FONT, COLORS } from '../theme/designTokens';
import { ZEN_PLACEHOLDERS } from '../utils/soapConstants';

/**
 * SoapGrid — shared 2x2 SOAP quadrant layout used by both the main
 * ClinicalWorkspace view and the God-View fullscreen overlay.
 *
 * @prop {object}      soapData
 * @prop {function}    updateSoap             - (field, value) => void
 * @prop {function}    setFullscreenField     - (fieldId) => void (Zen focus)
 * @prop {function}    getTriageLevel
 * @prop {function}    renderHistoricalLabel
 * @prop {function}    runAssistiveDiagnosis
 * @prop {string}      assistiveText
 * @prop {boolean}     diagnosticOpen
 * @prop {function}    setDiagnosticOpen
 *
 * Sub-component references — passed from parent to avoid circular import:
 * @prop {Component}   SoapQuadrant
 * @prop {Component}   VitalsGrid
 * @prop {Component}   DiagnosticBridge
 *
 * Plan quadrant extras (optional — God-View omits these):
 * @prop {boolean}     [showVaccineForm=false]
 * @prop {ReactNode}   [vaccineFormNode]
 * @prop {ReactNode}   [labResultsNode]
 * @prop {boolean}     [showDraftSave=false]
 * @prop {ReactNode}   [draftSaveNode]
 * @prop {ReactNode}   [followUpNode]
 * @prop {boolean}     [canToggleVaccine=false]      - T3.2: show "+ Administer Vaccine" button when form is hidden
 * @prop {function}    [onManualVaccineToggle]        - T3.2: callback to enable manual vaccine form
 *
 * Intake context (T3.70 — read-only, shown above Subjective field):
 * @prop {string}      [intakeClientNotes='']         - Client's booking notes from the appointment doc
 * @prop {string}      [intakeStaffNotes='']          - Staff triage/walk-in notes from the appointment doc
 *
 * LLM Clinical Reasoning props (T4.110 — button-level only; display panels moved to ClinicalAIPanel):
 * @prop {boolean}     [llmEnabled=false]      - Whether the LLM feature is active
 * @prop {boolean}     [llmLoading=false]       - Whether an LLM call is in-flight
 * @prop {Array}       [llmMessages=[]]         - Conversation history (used for button label switching)
 * @prop {function}    [onAskAI]                - Triggers initial LLM reasoning call
 * @prop {function}    [onResetAndAskAI]        - Clears conversation and re-analyzes
 * @prop {function}    [onToggleAIPanel]        - (open: boolean) => void — toggles the AI drawer
 * @prop {boolean}     [isAIPanelOpen=false]    - Whether the AI side panel is currently visible
 */
export default function SoapGrid({
  soapData, updateSoap, setFullscreenField,
  getTriageLevel, renderHistoricalLabel,
  runAssistiveDiagnosis, assistiveText, diagnosticOpen, setDiagnosticOpen,
  SoapQuadrant, VitalsGrid, DiagnosticBridge,
  showVaccineForm = false, vaccineFormNode = null,
  labResultsNode = null,
  showDraftSave = false, draftSaveNode = null,
  followUpNode = null,
  canToggleVaccine = false, onManualVaccineToggle,
  intakeClientNotes = '', intakeStaffNotes = '',
  llmEnabled = false, llmLoading = false, llmMessages = [],
  onAskAI, onResetAndAskAI,
  onToggleAIPanel, isAIPanelOpen = false,
}) {
  const textFieldSx = { flex: 1, '& .MuiInputBase-root': { height: '100%', alignItems: 'flex-start' } };
  const inputPropsSx = { disableUnderline: true, sx: { fontFamily: FONT, fontSize: '1.25rem', color: COLORS.brand, lineHeight: 1.6 } };

  return (
    <Grid container spacing={0} sx={{ flex: 1, minHeight: 0, overflow: 'hidden', bgcolor: '#FFF' }}>

      {/* S - SUBJECTIVE (top-left) */}
      <Grid size={{ xs: 12, md: 6 }} sx={{ height: { xs: 'auto', md: '50%' }, borderRight: { md: '1px solid #F0F0F0' }, borderBottom: '1px solid #F0F0F0' }}>
        <SoapQuadrant id="subjective" label="S - SUBJECTIVE (HISTORY & CLIENT REPORT)" onZoomField={setFullscreenField}>

          {/* T3.70: Read-only intake context box — shown above the vet's Subjective field */}
          {(intakeClientNotes || intakeStaffNotes) && (
            <Box sx={{
              bgcolor: COLORS.formBg,
              border: `1px solid ${COLORS.borderLight}`,
              borderRadius: 0,
              p: 1.5,
              mb: 1,
              maxHeight: 120,
              overflowY: 'auto',
            }}>
              <Typography variant="overline" sx={{
                fontWeight: 900, color: COLORS.textMuted, fontSize: '0.55rem',
                letterSpacing: 1.5, display: 'block', mb: 0.5,
              }}>
                INTAKE CONTEXT (READ-ONLY)
              </Typography>
              {intakeClientNotes && (
                <Typography sx={{ fontSize: '0.85rem', color: COLORS.medical, fontWeight: 700, mb: 0.5, lineHeight: 1.4 }}>
                  <strong>CLIENT:</strong> {intakeClientNotes}
                </Typography>
              )}
              {intakeStaffNotes && (
                <Typography sx={{ fontSize: '0.85rem', color: COLORS.warning, fontWeight: 700, lineHeight: 1.4 }}>
                  <strong>STAFF TRIAGE:</strong> {intakeStaffNotes}
                </Typography>
              )}
            </Box>
          )}

          <TextField
            multiline fullWidth variant="standard"
            placeholder={ZEN_PLACEHOLDERS.subjective}
            value={soapData.subjective || ''}
            onChange={(e) => updateSoap('subjective', e.target.value)}
            sx={textFieldSx}
            InputProps={inputPropsSx}
          />
        </SoapQuadrant>
      </Grid>

      {/* A - ASSESSMENT (top-right) — swapped from bottom-left (T4.109) */}
      <Grid size={{ xs: 12, md: 6 }} sx={{ height: { xs: 'auto', md: '50%' }, borderBottom: '1px solid #F0F0F0' }}>
        <SoapQuadrant id="assessment" label="A - ASSESSMENT (DIAGNOSIS & PROGNOSIS)" onZoomField={setFullscreenField}>
          <DiagnosticBridge
            soapData={soapData}
            llmEnabled={llmEnabled}
            llmLoading={llmLoading}
            llmMessages={llmMessages}
            onAnalyze={() => { runAssistiveDiagnosis(); setDiagnosticOpen(true); }}
            onAskAI={onAskAI}
            onResetAndAskAI={onResetAndAskAI}
            onToggleAIPanel={onToggleAIPanel}
            isAIPanelOpen={isAIPanelOpen}
          />
          <TextField
            multiline fullWidth variant="standard"
            placeholder={ZEN_PLACEHOLDERS.assessment}
            value={soapData.assessment || ''}
            onChange={(e) => updateSoap('assessment', e.target.value)}
            sx={textFieldSx}
            InputProps={{ disableUnderline: true, sx: { fontFamily: FONT, fontSize: '1.25rem', color: COLORS.success, fontWeight: 900, lineHeight: 1.6 } }}
          />
        </SoapQuadrant>
      </Grid>

      {/* O - OBJECTIVE (bottom-left) — swapped from top-right (T4.109) */}
      <Grid size={{ xs: 12, md: 6 }} sx={{ height: { xs: 'auto', md: '50%' }, borderRight: { md: '1px solid #F0F0F0' }, borderTop: { xs: '1px solid #F0F0F0', md: 'none' } }}>
        <SoapQuadrant id="objectiveNotes" label="O - OBJECTIVE (EXAM & VITALS)" onZoomField={setFullscreenField}>
          <VitalsGrid soapData={soapData} updateSoap={updateSoap} getTriageLevel={getTriageLevel} renderHistoricalLabel={renderHistoricalLabel} compact />
          <TextField
            multiline fullWidth variant="standard"
            placeholder={ZEN_PLACEHOLDERS.objectiveNotes}
            value={soapData.objectiveNotes || ''}
            onChange={(e) => updateSoap('objectiveNotes', e.target.value)}
            sx={textFieldSx}
            InputProps={inputPropsSx}
          />
        </SoapQuadrant>
      </Grid>

      {/* P - PLAN (bottom-right) */}
      <Grid size={{ xs: 12, md: 6 }} sx={{ height: { xs: 'auto', md: '50%' }, borderTop: { xs: '1px solid #F0F0F0', md: 'none' } }}>
        <SoapQuadrant id="plan" label="P - PLAN (TREATMENT & RECHECKS)" onZoomField={setFullscreenField}>
          {/* T3.2: Manual vaccine toggle button — shown when form is not yet visible and record is not locked */}
          {canToggleVaccine && (
            <Button
              size="small"
              onClick={onManualVaccineToggle}
              sx={{ fontWeight: 900, fontSize: '0.6rem', textTransform: 'uppercase', color: COLORS.success, mb: 1, borderRadius: 0 }}
            >
              + Administer Vaccine
            </Button>
          )}
          {showVaccineForm && vaccineFormNode}
          {labResultsNode}
          <TextField
            multiline fullWidth variant="standard"
            placeholder={ZEN_PLACEHOLDERS.plan}
            value={soapData.plan || ''}
            onChange={(e) => updateSoap('plan', e.target.value)}
            sx={textFieldSx}
            InputProps={inputPropsSx}
          />
          {followUpNode}
          {showDraftSave && draftSaveNode}
        </SoapQuadrant>
      </Grid>

    </Grid>
  );
}
