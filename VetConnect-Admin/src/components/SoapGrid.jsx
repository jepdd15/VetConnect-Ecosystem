import React from 'react';
import { Grid, TextField, Box, Typography, Autocomplete, Chip } from '@mui/material';
import { FONT, COLORS } from '../theme/designTokens';
import { ZEN_PLACEHOLDERS } from '../utils/soapConstants';
import { SEVERITY_SCALES } from '../utils/diagnosisConstants';
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
 * Objective quadrant extras:
 * @prop {ReactNode}   [labResultsNode]         - T4.120: moved from Plan to Objective (diagnostic findings)
 *
 * Plan quadrant extras (optional — God-View omits these):
 * @prop {boolean}     [showVaccineForm=false]
 * @prop {ReactNode}   [vaccineFormNode]
 * @prop {boolean}     [showDraftSave=false]
 * @prop {ReactNode}   [draftSaveNode]
 * @prop {ReactNode}   [followUpNode]
 * @prop {boolean}     [canToggleVaccine=false]      - T4.117: show vaccine Autocomplete when form is hidden
 * @prop {function}    [onManualVaccineToggle]        - kept for backward compat (unused since T4.117)
 * @prop {Array}       [vaccineProducts=[]]           - T4.117: species-filtered vaccine inventory products
 * @prop {function}    [onAddVaccineProduct]          - T4.117: (product) => void — adds vaccine to cart
 *
 * LLM Clinical Reasoning props (T4.110 — button-level only; display panels moved to ClinicalAIPanel):
 * @prop {boolean}     [llmEnabled=false]      - Whether the LLM feature is active
 * @prop {boolean}     [llmLoading=false]       - Whether an LLM call is in-flight
 * @prop {Array}       [llmMessages=[]]         - Conversation history (used for button label switching)
 * @prop {function}    [onAskAI]                - Triggers initial LLM reasoning call
 * @prop {function}    [onResetAndAskAI]        - Clears conversation and re-analyzes
 * @prop {function}    [onToggleAIPanel]        - (open: boolean) => void — toggles the AI drawer
 * @prop {boolean}     [isAIPanelOpen=false]    - Whether the AI side panel is currently visible
 *
 * T4.141 — Structured Diagnosis props:
 * @prop {Array}       [diagnosisCatalog=[]]        - Full merged catalog from useDiagnosisCatalog()
 * @prop {string}      [patientSpecies='']           - 'dog', 'cat', etc. — used for species filtering
 * @prop {function}    [onAddCustomDiagnosis]        - () => void — opens the custom diagnosis dialog
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
  llmEnabled = false, llmLoading = false, llmMessages = [],
  onAskAI, onResetAndAskAI,
  onToggleAIPanel, isAIPanelOpen = false,
  onMarkAllNormal,
  disabled = false,
  // T4.141: Structured diagnosis props
  diagnosisCatalog = [],
  patientSpecies = '',
  onAddCustomDiagnosis,
}) {
  const textFieldSx = { flex: 1, '& .MuiInputBase-root': { height: '100%', alignItems: 'flex-start' } };
  const inputPropsSx = { disableUnderline: true, sx: { fontFamily: FONT, fontSize: '1.25rem', color: COLORS.brand, lineHeight: 1.6 } };

  return (
    <Grid container spacing={0} sx={{ flex: 1, minHeight: 0, overflow: 'hidden', bgcolor: '#FFF' }}>

      {/* S - SUBJECTIVE (top-left) */}
      <Grid size={{ xs: 12, md: 6 }} sx={{ height: { xs: 'auto', md: '50%' }, overflow: { md: 'hidden' }, borderRight: { md: '1px solid #F0F0F0' }, borderBottom: '1px solid #F0F0F0' }}>
        <SoapQuadrant id="subjective" label="S - SUBJECTIVE (HISTORY & CLIENT REPORT)" onZoomField={setFullscreenField}>

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
      {/* T4.141: overflow changed from 'hidden' to 'auto' so the structured diagnosis form is not clipped */}
      <Grid size={{ xs: 12, md: 6 }} sx={{ height: { xs: 'auto', md: '50%' }, overflow: { md: 'auto' }, borderBottom: '1px solid #F0F0F0' }}>
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

          {/* T4.141: Structured diagnosis form — species-filtered Autocomplete + severity selectors */}
          {(() => {
            const speciesKey = (patientSpecies || '').toLowerCase().includes('cat') ? 'cat' : 'dog';
            const filteredCatalog = diagnosisCatalog.filter(
              (d) => !d.species || d.species.length === 0 || d.species.includes(speciesKey),
            );
            const catalogWithSentinel = [
              ...filteredCatalog,
              { id: '__custom__', name: '+ Add Custom Diagnosis', category: '__action__' },
            ];

            return (
              <>
                {/* Existing diagnoses rendered as removable chips */}
                {(soapData.diagnoses || []).length > 0 && (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1 }}>
                    {(soapData.diagnoses || []).map((dx, idx) => (
                      <Chip
                        key={dx.catalogId || idx}
                        label={`${dx.name}${dx.severity ? ` — ${dx.severity}` : ''}`}
                        onDelete={disabled ? undefined : () => {
                          const updated = [...(soapData.diagnoses || [])];
                          updated.splice(idx, 1);
                          updateSoap('diagnoses', updated);
                        }}
                        size="small"
                        sx={{
                          fontFamily: FONT, fontWeight: 900, fontSize: '0.7rem',
                          bgcolor: dx.severity ? COLORS.warningSurface : '#E8F5E9',
                          color: dx.severity ? COLORS.warning : COLORS.success,
                          borderRadius: 0,
                          '& .MuiChip-deleteIcon': { color: COLORS.textMuted },
                        }}
                      />
                    ))}
                  </Box>
                )}

                {/* Autocomplete — Add Diagnosis */}
                {!disabled && (
                  <Autocomplete
                    size="small"
                    options={catalogWithSentinel}
                    groupBy={(opt) => (opt.category === '__action__' ? '' : opt.category)}
                    getOptionLabel={(opt) => opt.name || ''}
                    value={null}
                    filterOptions={(opts, state) => {
                      const q = state.inputValue.toLowerCase();
                      return opts.filter(
                        (o) => o.id === '__custom__' || (o.name || '').toLowerCase().includes(q),
                      );
                    }}
                    onChange={(_, selected) => {
                      if (!selected) return;
                      if (selected.id === '__custom__') {
                        onAddCustomDiagnosis?.();
                        return;
                      }
                      // Prevent duplicate entries by catalogId
                      if ((soapData.diagnoses || []).some((d) => d.catalogId === selected.id)) return;
                      updateSoap('diagnoses', [
                        ...(soapData.diagnoses || []),
                        {
                          name: selected.name,
                          catalogId: selected.id,
                          category: selected.category,
                          severity: null,
                          notes: '',
                        },
                      ]);
                    }}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        variant="standard"
                        placeholder={
                          (soapData.diagnoses || []).length > 0
                            ? 'Add another diagnosis...'
                            : 'Search diagnosis catalog...'
                        }
                        InputProps={{
                          ...params.InputProps,
                          disableUnderline: true,
                          sx: { fontFamily: FONT, fontSize: '0.85rem', color: COLORS.success },
                        }}
                      />
                    )}
                    sx={{ mb: 1 }}
                    clearOnBlur
                    blurOnSelect
                    selectOnFocus
                  />
                )}

                {/* Per-diagnosis severity selectors — only for hasSeverity entries */}
                {(soapData.diagnoses || []).map((dx, idx) => {
                  const catalogEntry = diagnosisCatalog.find((c) => c.id === dx.catalogId);
                  if (!catalogEntry?.hasSeverity || !catalogEntry?.severityScale) return null;
                  const scaleOptions = SEVERITY_SCALES[catalogEntry.severityScale] || [];
                  if (scaleOptions.length === 0) return null;
                  return (
                    <Box key={`sev-${dx.catalogId || idx}`} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                      <Typography sx={{
                        fontFamily: FONT, fontSize: '0.65rem', fontWeight: 900,
                        color: COLORS.textMuted, minWidth: 100, textTransform: 'uppercase',
                      }}>
                        {dx.name.length > 20 ? `${dx.name.slice(0, 20)}…` : dx.name}
                      </Typography>
                      <Autocomplete
                        size="small"
                        options={scaleOptions}
                        getOptionLabel={(opt) => opt.label || opt.value || ''}
                        value={scaleOptions.find((s) => s.value === dx.severity) || null}
                        onChange={(_, sel) => {
                          if (disabled) return;
                          const updated = [...(soapData.diagnoses || [])];
                          updated[idx] = { ...updated[idx], severity: sel?.value || null };
                          updateSoap('diagnoses', updated);
                        }}
                        renderInput={(params) => (
                          <TextField
                            {...params}
                            variant="standard"
                            placeholder="Select severity / stage..."
                            InputProps={{
                              ...params.InputProps,
                              disableUnderline: true,
                              sx: { fontFamily: FONT, fontSize: '0.75rem' },
                            }}
                          />
                        )}
                        sx={{ flex: 1, maxWidth: 300 }}
                        clearOnBlur
                        blurOnSelect
                        disabled={disabled}
                      />
                    </Box>
                  );
                })}

                {/* T4.167: Per-diagnosis clinical notes — hidden by default, "add note" reveals */}
                {(soapData.diagnoses || []).map((dx, idx) => {
                  const hasNote = !!dx.notes;
                  return (
                    <Box key={`note-${dx.catalogId || idx}`} sx={{ mb: 0.5 }}>
                      {!hasNote && !dx._showNoteField && (
                        <Typography
                          component="span"
                          onClick={() => {
                            if (disabled) return;
                            const updated = [...(soapData.diagnoses || [])];
                            updated[idx] = { ...updated[idx], _showNoteField: true };
                            updateSoap('diagnoses', updated);
                          }}
                          sx={{
                            fontFamily: FONT, fontSize: '0.65rem', fontWeight: 700,
                            color: COLORS.accent, cursor: disabled ? 'default' : 'pointer',
                            textTransform: 'uppercase', letterSpacing: '0.03em',
                            '&:hover': { textDecoration: disabled ? 'none' : 'underline' },
                          }}
                        >
                          + add note for {dx.name.length > 25 ? `${dx.name.slice(0, 25)}...` : dx.name}
                        </Typography>
                      )}
                      {(hasNote || dx._showNoteField) && (
                        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, pl: 1 }}>
                          <Typography sx={{
                            fontFamily: FONT, fontSize: '0.65rem', fontWeight: 900,
                            color: COLORS.textMuted, minWidth: 100, textTransform: 'uppercase',
                            pt: 0.5,
                          }}>
                            {dx.name.length > 20 ? `${dx.name.slice(0, 20)}...` : dx.name}
                          </Typography>
                          <TextField
                            size="small" variant="standard" fullWidth
                            placeholder="Clinical notes for this diagnosis..."
                            value={dx.notes || ''}
                            onChange={(e) => {
                              if (disabled) return;
                              const updated = [...(soapData.diagnoses || [])];
                              updated[idx] = { ...updated[idx], notes: e.target.value };
                              updateSoap('diagnoses', updated);
                            }}
                            InputProps={{
                              disableUnderline: true,
                              sx: { fontFamily: FONT, fontSize: '0.8rem', color: COLORS.textMuted, fontStyle: 'italic' },
                            }}
                            disabled={disabled}
                          />
                        </Box>
                      )}
                    </Box>
                  );
                })}

                {/* Free-text Assessment Notes — replaces the legacy single TextField */}
                <TextField
                  multiline fullWidth variant="standard"
                  placeholder={ZEN_PLACEHOLDERS.assessment}
                  value={soapData.assessmentNotes || ''}
                  onChange={(e) => updateSoap('assessmentNotes', e.target.value)}
                  sx={textFieldSx}
                  InputProps={{
                    disableUnderline: true,
                    sx: { fontFamily: FONT, fontSize: '1.1rem', color: COLORS.success, fontWeight: 700, lineHeight: 1.6 },
                  }}
                  disabled={disabled}
                />
              </>
            );
          })()}
        </SoapQuadrant>
      </Grid>

      {/* O - OBJECTIVE (bottom-left) — swapped from top-right (T4.109) */}
      <Grid size={{ xs: 12, md: 6 }} sx={{ height: { xs: 'auto', md: '50%' }, overflow: { md: 'hidden' }, borderRight: { md: '1px solid #F0F0F0' }, borderTop: { xs: '1px solid #F0F0F0', md: 'none' } }}>
        <SoapQuadrant id="objectiveNotes" label="O - OBJECTIVE (EXAM & VITALS)" onZoomField={setFullscreenField}>
          <VitalsGrid soapData={soapData} updateSoap={updateSoap} getTriageLevel={getTriageLevel} renderHistoricalLabel={renderHistoricalLabel} compact />
          <PhysicalExamChecklist
            examData={soapData.objectiveExam}
            onChange={(updated) => updateSoap('objectiveExam', updated)}
            onMarkAllNormal={onMarkAllNormal}
            disabled={disabled}
          />
          {/* T4.120: Lab results moved to Objective — diagnostic findings belong here,
              not in Plan. Decision 6 from the lab redesign architecture review. */}
          {labResultsNode}
        </SoapQuadrant>
      </Grid>

      {/* P - PLAN (bottom-right) */}
      <Grid size={{ xs: 12, md: 6 }} sx={{ height: { xs: 'auto', md: '50%' }, overflow: { md: 'hidden' }, borderTop: { xs: '1px solid #F0F0F0', md: 'none' } }}>
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
          <TextField
            multiline fullWidth variant="standard"
            placeholder={ZEN_PLACEHOLDERS.plan}
            value={soapData.plan || ''}
            onChange={(e) => updateSoap('plan', e.target.value)}
            sx={textFieldSx}
            InputProps={inputPropsSx}
          />
          {/* Client-facing discharge instructions — separate from clinical Plan */}
          <Box sx={{ mt: 2, p: 1.5, bgcolor: '#FFF8E1', border: `2px solid ${COLORS.peach}`, borderRadius: 0 }}>
            <Typography sx={{ fontSize: '0.65rem', fontWeight: 900, color: COLORS.warning, textTransform: 'uppercase', letterSpacing: 1, mb: 0.5 }}>
              Client Discharge Notes
            </Typography>
            <TextField
              multiline fullWidth variant="standard"
              placeholder="e.g., Give medicine twice daily with food. Come back in 1 week if not better. Call us if your pet stops eating."
              value={soapData.clientInstructions || ''}
              onChange={(e) => updateSoap('clientInstructions', e.target.value)}
              disabled={disabled}
              sx={{
                ...textFieldSx,
                '& .MuiInputBase-root': {
                  ...textFieldSx['& .MuiInputBase-root'],
                  bgcolor: 'white',
                },
              }}
              InputProps={inputPropsSx}
            />
          </Box>
          {followUpNode}
          {showDraftSave && draftSaveNode}
        </SoapQuadrant>
      </Grid>

    </Grid>
  );
}
