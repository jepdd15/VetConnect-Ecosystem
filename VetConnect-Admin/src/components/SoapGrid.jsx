import React from 'react';
import { Grid, TextField, Box } from '@mui/material';
import { FONT, COLORS } from '../theme/designTokens';

const ZEN_PLACEHOLDERS = {
  subjective: "Record client's primary concern, history of present illness (HPI), appetite, energy levels, and behavioral reported changes...",
  objectiveNotes: "Document systematic physical exam findings, clinical vitals, auscultation results, palpation abnormalities, and hydration markers...",
  assessment: "Synthesize clinical findings into differential diagnoses (Dx), rule-outs, current patient status, and medical prognosis...",
  plan: "Define treatment trajectory, diagnostic orders, pharmaceutical interventions, surgical steps, and post-consult recheck schedules..."
};

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
}) {
  const textFieldSx = { flex: 1, '& .MuiInputBase-root': { height: '100%', alignItems: 'flex-start' } };
  const inputPropsSx = { disableUnderline: true, sx: { fontFamily: FONT, fontSize: '1.25rem', color: COLORS.brand, lineHeight: 1.6 } };

  return (
    <Grid container spacing={0} sx={{ flex: 1, minHeight: 0, overflow: 'hidden', bgcolor: '#FFF' }}>

      {/* S - SUBJECTIVE (top-left) */}
      <Grid size={{ xs: 12, md: 6 }} sx={{ height: { xs: 'auto', md: '50%' }, borderRight: { md: '1px solid #F0F0F0' }, borderBottom: '1px solid #F0F0F0' }}>
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

      {/* O - OBJECTIVE (top-right) */}
      <Grid size={{ xs: 12, md: 6 }} sx={{ height: { xs: 'auto', md: '50%' }, borderBottom: '1px solid #F0F0F0' }}>
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

      {/* A - ASSESSMENT (bottom-left) */}
      <Grid size={{ xs: 12, md: 6 }} sx={{ height: { xs: 'auto', md: '50%' }, borderRight: { md: '1px solid #F0F0F0' } }}>
        <SoapQuadrant id="assessment" label="A - ASSESSMENT (DIAGNOSIS & PROGNOSIS)" onZoomField={setFullscreenField}>
          <DiagnosticBridge soapData={soapData} assistiveText={assistiveText} diagnosticOpen={diagnosticOpen}
            onAnalyze={() => { runAssistiveDiagnosis(); setDiagnosticOpen(true); }} onDismiss={() => setDiagnosticOpen(false)} />
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

      {/* P - PLAN (bottom-right) */}
      <Grid size={{ xs: 12, md: 6 }} sx={{ height: { xs: 'auto', md: '50%' } }}>
        <SoapQuadrant id="plan" label="P - PLAN (TREATMENT & RECHECKS)" onZoomField={setFullscreenField}>
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
