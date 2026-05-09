// ClinicalAIPanel.jsx — shared AI clinical reasoning side panel
// Used by: (1) MUI Drawer in default ClinicalWorkspace view, (2) persistent column in God View
//
// Props flow directly from ClinicalWorkspace parent — zero internal Firestore coupling.
// variant='drawer'  → close button visible, intended for the right-side overlay
// variant='column'  → no close button, always-visible in God View third column

import React, { useRef, useEffect, useMemo } from 'react';
import {
  Box, Typography, IconButton, Button, Chip, CircularProgress,
  InputBase,
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

/**
 * ClinicalAIPanel — full AI reasoning UI extracted from DiagnosticBridge.
 *
 * Renders the multi-turn LLM conversation panel (purple) in a single
 * scrollable column, embedded in either a MUI Drawer or a persistent flex column.
 *
 * @prop {'drawer'|'column'} variant       - 'drawer' shows close button; 'column' is persistent
 * @prop {object}   soapData               - Current SOAP data (for button disabled state)
 * @prop {boolean}  llmEnabled             - Whether LLM feature is active
 * @prop {boolean}  llmLoading             - LLM call in-flight
 * @prop {Array}    llmMessages            - Conversation history [{role, content}]
 * @prop {string}   llmError               - Error message if LLM call failed
 * @prop {string}   llmFollowUpInput       - Current follow-up text value
 * @prop {function} onAskAI                - Triggers initial LLM call
 * @prop {function} onLlmFollowUpChange    - Updates follow-up input value
 * @prop {function} onLlmFollowUp          - Sends follow-up message
 * @prop {function} onResetAndAskAI        - Clears conversation and re-analyzes
 * @prop {function|null} onClose           - Close handler; null = persistent (no close button)
 * @prop {string}   petName                - Pet name for header subtitle
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

  // Auto-scroll to bottom whenever messages update or loading state changes
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [llmMessages, llmLoading]);

  // Memoized at empty deps — stable object reference so ReactMarkdown never
  // re-mounts its tree on every keystroke in the follow-up input.
  const markdownComponents = useMemo(() => ({
    h1: ({ children }) => (
      <Typography sx={{ fontFamily: FONT, fontSize: '1rem', fontWeight: 900, color: COLORS.grooming, mt: 1.5, mb: 0.5 }}>
        {children}
      </Typography>
    ),
    h2: ({ children }) => (
      <Typography sx={{ fontFamily: FONT, fontSize: '0.9rem', fontWeight: 900, color: COLORS.grooming, mt: 1.25, mb: 0.5 }}>
        {children}
      </Typography>
    ),
    h3: ({ children }) => (
      <Typography sx={{ fontFamily: FONT, fontSize: '0.85rem', fontWeight: 800, color: COLORS.grooming, mt: 1, mb: 0.25 }}>
        {children}
      </Typography>
    ),
    p: ({ children }) => (
      <Typography sx={{ fontFamily: FONT, fontSize: '0.8rem', color: COLORS.textPrimary, lineHeight: 1.6, mb: 0.75 }}>
        {children}
      </Typography>
    ),
    li: ({ children }) => (
      <li style={{ fontSize: '0.8rem', marginBottom: '2px', lineHeight: 1.5 }}>
        {children}
      </li>
    ),
    strong: ({ children }) => <strong>{children}</strong>,
    table: ({ children }) => (
      <table style={{ borderCollapse: 'collapse', width: '100%', marginBottom: '8px', fontSize: '0.75rem' }}>
        {children}
      </table>
    ),
    th: ({ children }) => (
      <th style={{ border: `1px solid ${COLORS.kpiPurpleBorder}`, padding: '4px 8px', fontWeight: 800, textAlign: 'left', borderRadius: 0, backgroundColor: 'rgba(123,31,162,0.06)' }}>
        {children}
      </th>
    ),
    td: ({ children }) => (
      <td style={{ border: `1px solid ${COLORS.kpiPurpleBorder}`, padding: '4px 8px', borderRadius: 0 }}>
        {children}
      </td>
    ),
    hr: () => (
      <hr style={{ border: 'none', borderTop: `1px solid ${COLORS.kpiPurpleBorder}`, margin: '8px 0' }} />
    ),
  }), []);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* ── HEADER ── */}
      <Box sx={{
        bgcolor: COLORS.brand,
        px: 2,
        py: 1.5,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        borderBottom: `2px solid ${COLORS.grooming}`,
      }}>
        <PsychologyIcon sx={{ color: COLORS.grooming, fontSize: 22 }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{
            fontFamily: FONT,
            ...TYPE.label,
            color: '#FFF8E1',
            fontWeight: 900,
            letterSpacing: 1.5,
            fontSize: '0.65rem',
          }}>
            AI CLINICAL REASONING
          </Typography>
          {petName && (
            <Typography sx={{
              fontFamily: FONT,
              fontSize: '0.7rem',
              fontWeight: 700,
              color: COLORS.grooming,
              opacity: 0.9,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
            }}>
              {petName}
            </Typography>
          )}
        </Box>

        {/* Reset button — always visible */}
        {(llmMessages.length > 0) && (
          <IconButton
            size="small"
            onClick={onResetAndAskAI}
            disabled={llmLoading}
            title="New Analysis"
            sx={{ color: '#FFF8E1', opacity: 0.7, '&:hover': { opacity: 1 }, p: 0.5 }}
          >
            <RestartAltIcon sx={{ fontSize: 18 }} />
          </IconButton>
        )}

        {/* Close button — only in drawer variant */}
        {variant === 'drawer' && onClose && (
          <IconButton
            size="small"
            onClick={onClose}
            title="Close AI Panel"
            sx={{ color: '#FFF8E1', opacity: 0.7, '&:hover': { opacity: 1 }, p: 0.5 }}
          >
            <CloseIcon sx={{ fontSize: 18 }} />
          </IconButton>
        )}
      </Box>

      {/* ── DISCLAIMER BAR ── */}
      <Box sx={{
        bgcolor: COLORS.kpiPurpleBg,
        borderBottom: `1px solid ${COLORS.kpiPurpleBorder}`,
        px: 2,
        py: 0.75,
        flexShrink: 0,
      }}>
        <Typography sx={{
          fontFamily: FONT,
          fontSize: '0.65rem',
          color: COLORS.kpiPurpleText,
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
        scrollbarWidth: 'thin',
        '&::-webkit-scrollbar': { width: '4px' },
        '&::-webkit-scrollbar-track': { background: 'transparent' },
        '&::-webkit-scrollbar-thumb': { background: '#E0E0E0' },
        '&::-webkit-scrollbar-thumb:hover': { background: COLORS.grooming },
      }}>

        {/* ── QUICK-ACTION CHIPS (empty state only) ── */}
        {isEmpty && (
          <Box sx={{ mb: 2 }}>
            <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.textMuted, mb: 1, fontSize: '0.6rem' }}>
              QUICK ACTIONS
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
              <Chip
                label="Analyze S+O"
                size="small"
                icon={<AutoFixHighIcon sx={{ fontSize: '14px !important' }} />}
                onClick={() => { onAnalyze(); onAskAI(); }}
                disabled={!hasInputData}
                sx={{
                  fontFamily: FONT,
                  fontWeight: 900,
                  fontSize: '0.65rem',
                  borderRadius: 0,
                  bgcolor: COLORS.kpiPurpleBg,
                  border: `1px solid ${COLORS.kpiPurpleBorder}`,
                  color: COLORS.grooming,
                  '& .MuiChip-icon': { color: COLORS.grooming },
                  '&:hover': { bgcolor: `${COLORS.kpiPurpleBorder}50` },
                  '&.Mui-disabled': { opacity: 0.4 },
                }}
              />
              <Chip
                label="Suggest Differentials"
                size="small"
                icon={<PsychologyIcon sx={{ fontSize: '14px !important' }} />}
                onClick={() => {
                  onAnalyze();
                  onAskAI();
                }}
                disabled={!hasInputData || !llmEnabled}
                sx={{
                  fontFamily: FONT,
                  fontWeight: 900,
                  fontSize: '0.65rem',
                  borderRadius: 0,
                  bgcolor: COLORS.kpiPurpleBg,
                  border: `1px solid ${COLORS.kpiPurpleBorder}`,
                  color: COLORS.grooming,
                  '& .MuiChip-icon': { color: COLORS.grooming },
                  '&:hover': { bgcolor: `${COLORS.kpiPurpleBorder}50` },
                  '&.Mui-disabled': { opacity: 0.4 },
                }}
              />
              <Chip
                label="Recommend Diagnostics"
                size="small"
                icon={<AutoFixHighIcon sx={{ fontSize: '14px !important' }} />}
                onClick={() => {
                  onAnalyze();
                  onAskAI();
                }}
                disabled={!hasInputData || !llmEnabled}
                sx={{
                  fontFamily: FONT,
                  fontWeight: 900,
                  fontSize: '0.65rem',
                  borderRadius: 0,
                  bgcolor: COLORS.kpiPurpleBg,
                  border: `1px solid ${COLORS.kpiPurpleBorder}`,
                  color: COLORS.grooming,
                  '& .MuiChip-icon': { color: COLORS.grooming },
                  '&:hover': { bgcolor: `${COLORS.kpiPurpleBorder}50` },
                  '&.Mui-disabled': { opacity: 0.4 },
                }}
              />
            </Box>
          </Box>
        )}

        {/* ── EMPTY STATE ILLUSTRATION (no input yet) ── */}
        {isEmpty && !hasInputData && (
          <Box sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            py: 4,
            opacity: 0.4,
          }}>
            <PsychologyIcon sx={{ fontSize: 48, color: COLORS.grooming, mb: 1.5 }} />
            <Typography sx={{ fontFamily: FONT, fontSize: '0.8rem', color: COLORS.textMuted, textAlign: 'center', lineHeight: 1.5 }}>
              Fill in the Subjective or Objective fields, then click &ldquo;Analyze S+O&rdquo; to start AI clinical reasoning.
            </Typography>
          </Box>
        )}


        {/* ── INITIAL LOADING STATE ── */}
        {llmLoading && llmMessages.length <= 1 && !llmError && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 2 }}>
            <CircularProgress size={18} sx={{ color: COLORS.grooming }} />
            <Typography sx={{ fontSize: '0.8rem', color: COLORS.grooming, fontWeight: 700, fontFamily: FONT }}>
              Analyzing clinical data...
            </Typography>
          </Box>
        )}

        {/* ── LLM CONVERSATION BUBBLES ── */}
        {llmMessages.map((msg, idx) => (
          <Box
            key={idx}
            sx={{
              mb: 1.5,
              p: 1.25,
              borderRadius: 0,
              bgcolor: msg.role === 'user'
                ? COLORS.panelBg
                : COLORS.cardBg,
              borderLeft: msg.role === 'user'
                ? `3px solid ${COLORS.brand}`
                : `3px solid ${COLORS.grooming}`,
              border: msg.role === 'user'
                ? `1px solid ${COLORS.borderLight}`
                : `1px solid ${COLORS.kpiPurpleBorder}`,
              borderLeftWidth: '3px',
            }}
          >
            <Typography sx={{
              ...TYPE.label,
              color: msg.role === 'user' ? COLORS.brand : COLORS.grooming,
              fontWeight: 900,
              fontSize: '0.55rem',
              mb: 0.5,
            }}>
              {msg.role === 'user' ? 'YOU' : 'AI ASSISTANT'}
            </Typography>
            {msg.role === 'assistant' ? (
              <Box sx={{ fontSize: '0.8rem', color: COLORS.textPrimary, lineHeight: 1.6, fontFamily: FONT }}>
                <ReactMarkdown components={markdownComponents}>
                  {normalizeMarkdownTables(msg.content)}
                </ReactMarkdown>
              </Box>
            ) : (
              <Typography sx={{ fontSize: '0.8rem', color: COLORS.textPrimary, lineHeight: 1.5, whiteSpace: 'pre-line', fontFamily: FONT }}>
                {msg.content.length > 300 ? `${msg.content.substring(0, 300)}...` : msg.content}
              </Typography>
            )}
          </Box>
        ))}

        {/* Inline "Thinking..." indicator during follow-up calls */}
        {llmLoading && llmMessages.length > 1 && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5, pl: 1 }}>
            <CircularProgress size={12} sx={{ color: COLORS.grooming }} />
            <Typography sx={{ fontSize: '0.75rem', color: COLORS.grooming, fontWeight: 700, fontFamily: FONT }}>
              Thinking...
            </Typography>
          </Box>
        )}

        {/* ── ERROR DISPLAY WITH RETRY ── */}
        {llmError && (
          <Box sx={{
            bgcolor: COLORS.dangerSurface,
            border: `1px solid ${COLORS.danger}`,
            p: 1.5,
            borderRadius: 0,
            mb: 1,
          }}>
            <Typography sx={{
              fontSize: '0.82rem',
              color: COLORS.danger,
              fontWeight: 800,
              fontFamily: FONT,
              mb: 0.5,
            }}>
              AI temporarily unavailable
            </Typography>
            <Typography sx={{
              fontSize: '0.72rem',
              color: COLORS.textMuted,
              fontFamily: FONT,
              mb: 1,
              lineHeight: 1.4,
            }}>
              {llmError}
            </Typography>
            {onRetry && (
              <Button
                size="small"
                variant="outlined"
                startIcon={<ReplayIcon sx={{ fontSize: 14 }} />}
                onClick={onRetry}
                sx={{
                  fontFamily: FONT,
                  fontWeight: 900,
                  fontSize: '0.65rem',
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  borderRadius: 0,
                  borderColor: COLORS.danger,
                  color: COLORS.danger,
                  '&:hover': {
                    borderColor: '#B71C1C',
                    bgcolor: 'rgba(211,47,47,0.04)',
                  },
                }}
              >
                Try Again
              </Button>
            )}
          </Box>
        )}

        {/* Scroll anchor — always at the bottom of content */}
        <div ref={chatEndRef} />
      </Box>

      {/* ── FOLLOW-UP INPUT BAR (pinned bottom) ── */}
      {hasAssistantResponse && !llmLoading && (
        <Box sx={{
          borderTop: `2px solid ${COLORS.kpiPurpleBorder}`,
          bgcolor: COLORS.kpiPurpleBg,
          p: 1.5,
          flexShrink: 0,
          display: 'flex',
          gap: 1,
          alignItems: 'center',
        }}>
          <InputBase
            placeholder="Ask a follow-up question..."
            value={llmFollowUpInput || ''}
            onChange={(e) => onLlmFollowUpChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                onLlmFollowUp();
              }
            }}
            inputProps={{ 'aria-label': 'Follow-up question for AI' }}
            sx={{
              flex: 1,
              fontSize: '0.8rem',
              fontFamily: FONT,
              bgcolor: COLORS.cardBg,
              border: `1px solid ${COLORS.kpiPurpleBorder}`,
              borderRadius: 0,
              px: 1.25,
              py: 0.75,
              '&:focus-within': { borderColor: COLORS.grooming },
            }}
          />
          <IconButton
            size="small"
            onClick={onLlmFollowUp}
            disabled={!llmFollowUpInput?.trim()}
            sx={{
              bgcolor: COLORS.grooming,
              color: '#FFF',
              borderRadius: 0,
              p: 0.75,
              '&:hover': { bgcolor: '#6A1B9A' },
              '&.Mui-disabled': { bgcolor: COLORS.kpiPurpleBorder, color: '#FFF', opacity: 0.6 },
            }}
          >
            <SendIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Box>
      )}

      {/* ── ACTION BAR (when no conversation yet) ── */}
      {!hasAssistantResponse && llmEnabled && hasInputData && (
        <Box sx={{
          borderTop: `2px solid ${COLORS.kpiPurpleBorder}`,
          bgcolor: COLORS.kpiPurpleBg,
          p: 1.5,
          flexShrink: 0,
          display: 'flex',
          gap: 1,
        }}>
          <Button
            size="small"
            variant="contained"
            startIcon={llmLoading ? <CircularProgress size={14} sx={{ color: '#FFF' }} /> : <PsychologyIcon />}
            onClick={onAskAI}
            disabled={llmLoading}
            fullWidth
            sx={{
              fontFamily: FONT,
              fontWeight: 900,
              fontSize: '0.65rem',
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              bgcolor: COLORS.grooming,
              borderRadius: 0,
              '&:hover': { bgcolor: '#6A1B9A' },
              '&.Mui-disabled': { opacity: 0.5 },
            }}
          >
            {llmLoading ? 'Analyzing...' : 'Analyze with AI'}
          </Button>
        </Box>
      )}
    </Box>
  );
}
