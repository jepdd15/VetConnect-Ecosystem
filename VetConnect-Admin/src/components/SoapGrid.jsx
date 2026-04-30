import React from 'react';
import { Grid, TextField, Box, Typography, Autocomplete, Chip } from '@mui/material';
import { FONT, COLORS } from '../theme/designTokens';
import { ZEN_PLACEHOLDERS } from '../utils/soapConstants';
import PhysicalExamChecklist from './PhysicalExamChecklist';

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
 * @prop {boolean}     [canToggleVaccine=false]      - T4.117: show vaccine Autocomplete when form is hidden
 * @prop {function}    [onManualVaccineToggle]        - kept for backward compat (unused since T4.117)
 * @prop {Array}       [vaccineProducts=[]]           - T4.117: species-filtered vaccine inventory products
 * @prop {function}    [onAddVaccineProduct]          - T4.117: (product) => void — adds vaccine to cart
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
  vaccineProducts = [], onAddVaccineProduct,
  intakeClientNotes = '', intakeStaffNotes = '',
  llmEnabled = false, llmLoading = false, llmMessages = [],
  onAskAI, onResetAndAskAI,
  onToggleAIPanel, isAIPanelOpen = false,
  onMarkAllNormal,
  disabled = false,
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
          <PhysicalExamChecklist
            examData={soapData.objectiveExam}
            onChange={(updated) => updateSoap('objectiveExam', updated)}
            onMarkAllNormal={onMarkAllNormal}
            disabled={disabled}
          />
        </SoapQuadrant>
      </Grid>

      {/* P - PLAN (bottom-right) */}
      <Grid size={{ xs: 12, md: 6 }} sx={{ height: { xs: 'auto', md: '50%' }, borderTop: { xs: '1px solid #F0F0F0', md: 'none' } }}>
        <SoapQuadrant id="plan" label="P - PLAN (TREATMENT & RECHECKS)" onZoomField={setFullscreenField}>
          {/* T4.117: Vaccine shortcut — species-filtered Autocomplete of vaccine-category
              inventory products. Selecting a product delegates to handleAddRx in
              ClinicalWorkspace (same code path as the sidebar search), ensuring
              consistent cart handling, stock reservation, and form auto-population. */}
          {canToggleVaccine && (
            <Autocomplete
              size="small"
              options={vaccineProducts}
              getOptionLabel={(opt) => opt.itemName || opt.name || ''}
              onChange={(_, product) => {
                if (product && onAddVaccineProduct) onAddVaccineProduct(product);
              }}
              renderOption={(props, option) => {
                const net = (option.stock || 0) - (option.reserved || 0);
                const isOut = net <= 0;
                return (
                  <Box component="li" {...props} sx={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                    <Typography sx={{ fontWeight: 900, fontSize: '0.8rem', color: isOut ? COLORS.textMuted : 'inherit' }}>
                      {option.itemName || option.name}
                    </Typography>
                    {isOut && (
                      <Chip
                        label="OUT OF STOCK"
                        size="small"
                        color="warning"
                        sx={{ height: 16, fontSize: '0.55rem', fontWeight: 1000, borderRadius: 0 }}
                      />
                    )}
                  </Box>
                );
              }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  placeholder="+ Administer Vaccine..."
                  variant="outlined"
                  size="small"
                  sx={{
                    mb: 1,
                    maxWidth: 300,
                    '& .MuiOutlinedInput-root': {
                      borderRadius: 0,
                      bgcolor: 'white',
                      fontWeight: 900,
                      fontSize: '0.75rem',
                      '& fieldset': { border: `2px solid ${COLORS.success}` },
                    },
                  }}
                />
              )}
              noOptionsText="No vaccines in inventory"
              clearOnBlur
              blurOnSelect
              sx={{ mb: 1 }}
            />
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
