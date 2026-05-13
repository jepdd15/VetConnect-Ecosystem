// ClinicalAIPanel.jsx — shared AI clinical reasoning side panel
// Used by: (1) MUI Drawer in default ClinicalWorkspace view, (2) persistent column in God View
//
// Modernized to 'Clinical Neubrutalist' aesthetic.

import React, { useRef, useEffect, useMemo } from 'react';
import {
  Box, Typography, IconButton, Button, CircularProgress,
  InputBase, Divider,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import PsychologyIcon from '@mui/icons-material/Psychology';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import SendIcon from '@mui/icons-material/Send';
import ReplayIcon from '@mui/icons-material/Replay';
import ReactMarkdown from 'react-markdown';
import { FONT, TYPE, COLORS } from '../theme/designTokens';
import { hasExamData } from '../utils/examUtils';
import { normalizeMarkdownTables } from '../utils/normalizeMarkdownTables';

// ─── Quick-action prompts ──────────────────────────────

const QUICK_ACTIONS = [
  {
    label: 'Analyze S+O Findings',
    icon: <AutoFixHighIcon sx={{ fontSize: 14 }} />,
    prompt: "Analyze the current Subjective and Objective findings. Synthesize them into a clinical summary and suggest the most likely primary concern.",
  },
  {
    label: 'Suggest Differentials',
    icon: <PsychologyIcon sx={{ fontSize: 14 }} />,
    prompt: "Based on the findings, suggest a list of differential diagnoses (Dx) ranked by likelihood. Include brief reasoning for each.",
  },
  {
    label: 'Recommend Diagnostic Plan',
    icon: <AutoFixHighIcon sx={{ fontSize: 14 }} />,
    prompt: "Recommend a prioritized diagnostic plan (tests, imaging, labs) to confirm the suspected diagnosis and rule out critical alternatives.",
  },
  {
    label: 'Synthesize Prognosis',
    icon: <PsychologyIcon sx={{ fontSize: 14 }} />,
    prompt: "Evaluate the current findings and diagnosis to provide a clinical prognosis and a realistic recovery trajectory for the owner.",
  },
  {
    label: 'Owner-Friendly Summary',
    icon: <SendIcon sx={{ fontSize: 14, transform: 'rotate(-45deg)' }} />,
    prompt: "Translate the technical assessment and medical plan into a clear, non-technical summary that I can share with the pet owner during discharge.",
  },
  {
    label: 'Treatment Plan Audit',
    icon: <AutoFixHighIcon sx={{ fontSize: 14 }} />,
    prompt: "Critically review my current 'Plan' against the 'Assessment.' Flag any missing standard-of-care steps or potential conflicts.",
  },
];

/**
 * ClinicalAIPanel — full AI reasoning UI.
 */
export default function ClinicalAIPanel({
  variant = 'drawer',
  soapData,
  llmEnabled,
  llmLoading,
  llmMessages = [],
  llmError,
  llmFollowUpInput,
  onAskAI,
  onLlmFollowUpChange,
  onLlmFollowUp,
  onResetAndAskAI,
  onRetry,
  onClose,
  petName,
}) {
  const chatEndRef = useRef(null);
  const hasInputData = !!(soapData?.subjective || hasExamData(soapData?.objectiveExam) || soapData?.objectiveNotes);
  const hasAssistantResponse = llmMessages.some(m => m.role === 'assistant');
  const isEmpty = llmMessages.length === 0;

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [llmMessages, llmLoading]);

  const markdownComponents = useMemo(() => ({
    h1: ({ children }) => (
      <Typography sx={{ fontFamily: FONT, fontSize: '1rem', fontWeight: 900, color: COLORS.brand, mt: 1.5, mb: 0.5, textTransform: 'uppercase' }}>
        {children}
      </Typography>
    ),
    h2: ({ children }) => (
      <Typography sx={{ fontFamily: FONT, fontSize: '0.9rem', fontWeight: 900, color: COLORS.brand, mt: 1.25, mb: 0.5 }}>
        {children}
      </Typography>
    ),
    h3: ({ children }) => (
      <Typography sx={{ fontFamily: FONT, fontSize: '0.85rem', fontWeight: 800, color: COLORS.brand, mt: 1, mb: 0.25 }}>
        {children}
      </Typography>
    ),
    p: ({ children }) => (
      <Typography sx={{ fontFamily: FONT, fontSize: '0.8rem', color: COLORS.textPrimary, lineHeight: 1.6, mb: 0.75 }}>
        {children}
      </Typography>
    ),
    li: ({ children }) => (
      <li style={{ fontSize: '0.8rem', marginBottom: '2px', lineHeight: 1.5, color: COLORS.textPrimary }}>
        {children}
      </li>
    ),
    strong: ({ children }) => <strong style={{ fontWeight: 800, color: COLORS.brand }}>{children}</strong>,
    table: ({ children }) => (
      <table style={{ borderCollapse: 'collapse', width: '100%', marginBottom: '10px', fontSize: '0.75rem', border: `2px solid ${COLORS.brand}` }}>
        {children}
      </table>
    ),
    th: ({ children }) => (
      <th style={{ border: `1px solid ${COLORS.brand}`, padding: '4px 8px', fontWeight: 900, textAlign: 'left', backgroundColor: COLORS.panelBg, color: COLORS.brand }}>
        {children}
      </th>
    ),
    td: ({ children }) => (
      <td style={{ border: `1px solid ${COLORS.brand}`, padding: '4px 8px', color: COLORS.textPrimary }}>
        {children}
      </td>
    ),
    hr: () => (
      <hr style={{ border: 'none', borderTop: `2px solid ${COLORS.brand}`, margin: '8px 0' }} />
    ),
  }), []);

  const handleActionClick = (prompt) => {
    // In ClinicalWorkspace, onAskAI usually triggers a specific flow.
    // We pass the prompt via the follow-up or direct analysis mechanism.
    if (onAskAI) onAskAI(prompt);
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', bgcolor: COLORS.surfaceAlt }}>

      {/* ── HEADER ── */}
      <Box sx={{
        bgcolor: COLORS.brand,
        px: 2, py: 2,
        flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 1.5,
        borderBottom: `3px solid ${COLORS.brand}`,
      }}>
        <PsychologyIcon sx={{ color: COLORS.cream, fontSize: 24 }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{
            fontFamily: FONT,
            ...TYPE.label,
            color: COLORS.cream,
            fontWeight: 900,
            letterSpacing: 1.5,
            fontSize: '0.75rem',
          }}>
            AI CLINICAL REASONING
          </Typography>
          {petName && (
            <Typography sx={{
              fontFamily: FONT,
              fontSize: '0.65rem',
              fontWeight: 800,
              color: COLORS.cream,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
            }}>
              {petName}
            </Typography>
          )}
        </Box>

        <Box sx={{ display: 'flex', gap: 0.5 }}>
          {(llmMessages.length > 0) && (
            <IconButton
              size="small"
              onClick={onResetAndAskAI}
              disabled={llmLoading}
              title="New Analysis"
              sx={{ color: COLORS.cream, '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' } }}
            >
              <RestartAltIcon fontSize="small" />
            </IconButton>
          )}
          {variant === 'drawer' && onClose && (
            <IconButton
              size="small"
              onClick={onClose}
              title="Close AI Panel"
              sx={{ color: COLORS.cream, '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' } }}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          )}
        </Box>
      </Box>

      {/* ── DISCLAIMER BAR ── */}
      <Box sx={{
        bgcolor: COLORS.cream,
        borderBottom: `2px solid ${COLORS.brand}`,
        px: 2, py: 1,
        flexShrink: 0,
      }}>
        <Typography sx={{
          fontFamily: FONT,
          fontSize: '0.65rem',
          color: COLORS.brand,
          fontWeight: 700,
          fontStyle: 'italic',
          lineHeight: 1.4,
        }}>
          AI-generated suggestions for reference only. All clinical decisions must be made by the attending veterinarian.
        </Typography>
      </Box>

      {/* ── SCROLLABLE CONTENT AREA ── */}
      <Box sx={{
        flex: 1,
        overflowY: 'auto',
        p: 2,
        '&::-webkit-scrollbar': { width: '5px' },
        '&::-webkit-scrollbar-thumb': { background: COLORS.brand },
      }}>

        {/* ── QUICK-ACTION CHIPS (empty state only) ── */}
        {isEmpty && (
          <Box sx={{ mb: 3 }}>
            <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.textMuted, mb: 1.5, fontSize: '0.6rem' }}>
              SUGGESTED ANALYTICS
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {QUICK_ACTIONS.map(qa => (
                <Button
                  key={qa.label}
                  variant="outlined"
                  size="small"
                  startIcon={qa.icon}
                  onClick={() => handleActionClick(qa.prompt)}
                  disabled={!hasInputData || !llmEnabled || llmLoading}
                  sx={{
                    fontFamily: FONT, fontWeight: 800, fontSize: '0.72rem',
                    color: COLORS.brand, bgcolor: COLORS.cardBg,
                    border: `2px solid ${COLORS.brand}`,
                    borderRadius: 0,
                    textTransform: 'none',
                    justifyContent: 'flex-start',
                    px: 2, py: 0.75,
                    boxShadow: `3px 3px 0px ${COLORS.brand}`,
                    transition: 'all 0.1s ease',
                    '&:hover': {
                      bgcolor: COLORS.panelBg,
                      transform: 'translate(-1px, -1px)',
                      boxShadow: `4px 4px 0px ${COLORS.brand}`,
                      borderColor: COLORS.brand,
                    },
                    '&.Mui-disabled': { opacity: 0.4, borderWidth: 2 },
                  }}
                >
                  {qa.label}
                </Button>
              ))}
            </Box>
          </Box>
        )}

        {/* ── EMPTY STATE ILLUSTRATION ── */}
        {isEmpty && !hasInputData && (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 6 }}>
            <PsychologyIcon sx={{ fontSize: 48, color: COLORS.brand, mb: 2, opacity: 0.1 }} />
            <Typography sx={{ fontFamily: FONT, fontSize: '0.8rem', color: COLORS.textMuted, textAlign: 'center', lineHeight: 1.6, px: 2 }}>
              Populate the Subjective or Objective clinical fields, then click an action above to trigger AI reasoning.
            </Typography>
          </Box>
        )}


        {/* ── LOADING STATE ── */}
        {llmLoading && llmMessages.length <= 1 && !llmError && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 2, px: 1 }}>
            <CircularProgress size={16} thickness={6} sx={{ color: COLORS.brand }} />
            <Typography sx={{ fontSize: '0.75rem', color: COLORS.brand, fontWeight: 700, fontFamily: FONT, letterSpacing: '0.05em' }}>
              REASONING...
            </Typography>
          </Box>
        )}

        {/* ── LLM CONVERSATION BUBBLES ── */}
        {llmMessages.map((msg, idx) => (
          <Box
            key={idx}
            sx={{
              mb: 2,
              p: 1.5,
              borderRadius: 0,
              bgcolor: msg.role === 'user' ? COLORS.panelBg : COLORS.cardBg,
              border: `2px solid ${COLORS.brand}`,
              borderLeftWidth: '4px',
              boxShadow: msg.role === 'assistant' ? `4px 4px 0px ${COLORS.brand}` : 'none',
            }}
          >
            <Typography sx={{
              ...TYPE.label,
              color: COLORS.brand,
              fontWeight: 1000,
              fontSize: '0.55rem',
              mb: 0.75,
              letterSpacing: '0.08em',
            }}>
              {msg.role === 'user' ? 'CLINICIAN' : 'AI ASSISTANT'}
            </Typography>
            {msg.role === 'assistant' ? (
              <Box sx={{ fontSize: '0.82rem', color: COLORS.textPrimary, lineHeight: 1.7, fontFamily: FONT }}>
                <ReactMarkdown components={markdownComponents}>
                  {normalizeMarkdownTables(msg.content)}
                </ReactMarkdown>
              </Box>
            ) : (
              <Typography sx={{ fontSize: '0.82rem', color: COLORS.textPrimary, lineHeight: 1.7, whiteSpace: 'pre-line', fontFamily: FONT, fontWeight: 500 }}>
                {msg.content}
              </Typography>
            )}
          </Box>
        ))}

        {llmLoading && llmMessages.length > 1 && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5, pl: 1 }}>
            <CircularProgress size={12} thickness={6} sx={{ color: COLORS.brand }} />
            <Typography sx={{ fontSize: '0.7rem', color: COLORS.brand, fontWeight: 800, fontFamily: FONT }}>
              SYNTHESIZING...
            </Typography>
          </Box>
        )}

        {/* ── ERROR DISPLAY ── */}
        {llmError && (
          <Box sx={{
            bgcolor: COLORS.dangerSurface,
            border: `2px solid ${COLORS.danger}`,
            p: 1.5,
            borderRadius: 0,
            mb: 2,
            boxShadow: `4px 4px 0px ${COLORS.danger}`,
          }}>
            <Typography sx={{ fontSize: '0.85rem', color: COLORS.danger, fontWeight: 900, fontFamily: FONT, mb: 0.5 }}>
              INTELLIGENCE OFFLINE
            </Typography>
            <Typography sx={{ fontSize: '0.75rem', color: COLORS.textSecondary, fontFamily: FONT, mb: 1.5, lineHeight: 1.4 }}>
              {llmError}
            </Typography>
            {onRetry && (
              <Button
                size="small"
                variant="contained"
                startIcon={<ReplayIcon sx={{ fontSize: 14 }} />}
                onClick={onRetry}
                sx={{
                  fontFamily: FONT, fontWeight: 900, fontSize: '0.65rem',
                  bgcolor: COLORS.danger, color: '#fff', borderRadius: 0,
                  boxShadow: 'none', '&:hover': { bgcolor: COLORS.dangerHover },
                }}
              >
                Retry Analysis
              </Button>
            )}
          </Box>
        )}

        <div ref={chatEndRef} />
      </Box>

      {/* ── FOLLOW-UP INPUT BAR ── */}
      {hasAssistantResponse && !llmLoading && (
        <Box sx={{
          borderTop: `3px solid ${COLORS.brand}`,
          bgcolor: COLORS.panelBg,
          p: 1.5,
          flexShrink: 0,
          display: 'flex', gap: 1, alignItems: 'center',
        }}>
          <InputBase
            placeholder="Ask a follow-up query..."
            value={llmFollowUpInput || ''}
            onChange={(e) => onLlmFollowUpChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                onLlmFollowUp();
              }
            }}
            inputProps={{ 'aria-label': 'Follow-up query for AI' }}
            sx={{
              flex: 1,
              fontSize: '0.85rem',
              fontFamily: FONT,
              bgcolor: COLORS.cardBg,
              border: `2px solid ${COLORS.brand}`,
              borderRadius: 0,
              px: 1.5,
              py: 1,
              '&:focus-within': { borderColor: COLORS.brand },
            }}
          />
          <IconButton
            size="small"
            onClick={onLlmFollowUp}
            disabled={!llmFollowUpInput?.trim()}
            sx={{
              bgcolor: COLORS.brand,
              color: COLORS.cream,
              borderRadius: 0,
              p: 1,
              '&:hover': { bgcolor: COLORS.accent },
              '&.Mui-disabled': { bgcolor: COLORS.borderLight, color: COLORS.textMuted },
            }}
          >
            <SendIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Box>
      )}

      {/* ── ACTION BAR (initial) ── */}
      {!hasAssistantResponse && llmEnabled && hasInputData && (
        <Box sx={{
          borderTop: `3px solid ${COLORS.brand}`,
          bgcolor: COLORS.panelBg,
          p: 1.5,
          flexShrink: 0,
        }}>
          <Button
            size="small"
            variant="contained"
            startIcon={llmLoading ? <CircularProgress size={14} sx={{ color: '#FFF' }} /> : <PsychologyIcon />}
            onClick={() => onAskAI()}
            disabled={llmLoading}
            fullWidth
            sx={{
              fontFamily: FONT, fontWeight: 900, fontSize: '0.72rem',
              textTransform: 'uppercase', letterSpacing: 1,
              bgcolor: COLORS.brand, color: COLORS.cream,
              borderRadius: 0, boxShadow: 'none',
              '&:hover': { bgcolor: COLORS.accent, boxShadow: 'none' },
              '&.Mui-disabled': { bgcolor: COLORS.borderLight, color: COLORS.textMuted },
            }}
          >
            {llmLoading ? 'Analyzing...' : 'Execute Clinical Analysis'}
          </Button>
        </Box>
      )}
    </Box>
  );
}
