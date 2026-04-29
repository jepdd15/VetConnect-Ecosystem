/**
 * PetHistoryAIDrawer.jsx — T4.96
 *
 * Conversational AI assistant for a pet's complete medical history.
 * Renders as a right-anchored MUI Drawer with quick-action chips,
 * multi-turn chat, and react-markdown rendering.
 *
 * All data arrives via props (pet, owner, records, vaccinations) —
 * zero Firestore coupling inside this component.
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  Drawer, Box, Typography, IconButton, TextField, Button, Chip, CircularProgress,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import SendIcon from '@mui/icons-material/Send';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import ReactMarkdown from 'react-markdown';
import { FONT, TYPE, COLORS } from '../../../theme/designTokens';
import { chatWithHistory } from '../../../utils/llmService';
import { buildPetHistoryPrompt } from '../../../utils/buildPetHistoryPrompt';

// ─── Quick-action prompts shown in empty state ──────────────────────────────

const QUICK_ACTIONS = [
  {
    label: 'Summarize History',
    prompt: "Give me a concise summary of this patient's complete medical history, highlighting key diagnoses, recurring conditions, and current treatment status.",
  },
  {
    label: 'Pre-Visit Briefing',
    prompt: 'Prepare a pre-visit briefing for this patient. Include: current medications, pending vaccinations, last visit findings, any chronic conditions, and things to watch for.',
  },
  {
    label: 'Detect Patterns',
    prompt: "Analyze this patient's medical records for patterns: recurring conditions, weight trends, medication changes, and any concerning trajectories that warrant attention.",
  },
];

// ─── ReactMarkdown component map (matches ClinicalWorkspace pattern) ─────────

function buildMarkdownComponents() {
  return {
    h1: ({ children }) => (
      <Typography sx={{ fontFamily: FONT, fontSize: '0.95rem', fontWeight: 900, color: COLORS.grooming, mt: 1, mb: 0.5 }}>
        {children}
      </Typography>
    ),
    h2: ({ children }) => (
      <Typography sx={{ fontFamily: FONT, fontSize: '0.88rem', fontWeight: 900, color: COLORS.grooming, mt: 0.75, mb: 0.25 }}>
        {children}
      </Typography>
    ),
    h3: ({ children }) => (
      <Typography sx={{ fontFamily: FONT, fontSize: '0.83rem', fontWeight: 800, color: COLORS.grooming, mt: 0.5, mb: 0.25 }}>
        {children}
      </Typography>
    ),
    p: ({ children }) => (
      <Typography sx={{ fontFamily: FONT, fontSize: '0.8rem', color: COLORS.textPrimary, lineHeight: 1.6, mb: 0.5 }}>
        {children}
      </Typography>
    ),
    li: ({ children }) => (
      <li style={{ fontSize: '0.8rem', marginBottom: '2px', lineHeight: 1.5 }}>{children}</li>
    ),
    strong: ({ children }) => <strong>{children}</strong>,
    table: ({ children }) => (
      <table style={{ borderCollapse: 'collapse', width: '100%', marginBottom: '6px', fontSize: '0.75rem' }}>
        {children}
      </table>
    ),
    th: ({ children }) => (
      <th style={{ border: `1px solid ${COLORS.kpiPurpleBorder}`, padding: '3px 6px', fontWeight: 800, textAlign: 'left', backgroundColor: 'rgba(123,31,162,0.06)' }}>
        {children}
      </th>
    ),
    td: ({ children }) => (
      <td style={{ border: `1px solid ${COLORS.kpiPurpleBorder}`, padding: '3px 6px' }}>{children}</td>
    ),
    hr: () => (
      <hr style={{ border: 'none', borderTop: `1px solid ${COLORS.kpiPurpleBorder}`, margin: '6px 0' }} />
    ),
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * @param {object}   props
 * @param {boolean}  props.open         - Drawer open state
 * @param {function} props.onClose      - Close handler
 * @param {object}   props.pet          - Pet document
 * @param {object}   props.owner        - Owner document
 * @param {Array}    props.records      - medical_records array (newest-first)
 * @param {Array}    props.vaccinations - vaccinationStatus array
 * @param {string}   props.workerUrl    - Cloudflare Worker URL
 */
export default function PetHistoryAIDrawer({ open, onClose, pet, owner, records, vaccinations, workerUrl }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const chatEndRef = useRef(null);
  const markdownComponents = useMemo(() => buildMarkdownComponents(), []);

  // System prompt rebuilds only when the underlying data changes
  const systemPrompt = useMemo(
    () => buildPetHistoryPrompt({ pet, owner, records, vaccinations }),
    [pet, owner, records, vaccinations],
  );

  // Reset conversation whenever the viewed pet changes
  useEffect(() => {
    setMessages([]);
    setInput('');
    setError('');
  }, [pet?.id]);

  // Auto-scroll to bottom on new message or loading indicator
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleClose = useCallback(() => {
    setMessages([]);
    setInput('');
    setError('');
    onClose();
  }, [onClose]);

  const handleSend = useCallback(async (text) => {
    const trimmed = (text || input).trim();
    if (!trimmed || loading) return;

    const userMsg = { role: 'user', content: trimmed };
    const newMessages = [...messages, userMsg];

    // Sliding window: keep first message + last 19 to cap context at 20 turns
    const cappedMessages = newMessages.length > 20
      ? [newMessages[0], ...newMessages.slice(-19)]
      : newMessages;

    setMessages(cappedMessages);
    setInput('');
    setLoading(true);
    setError('');

    try {
      const result = await chatWithHistory({ messages: cappedMessages, systemPrompt, workerUrl });
      setMessages(prev => [...prev, { role: 'assistant', content: result.text }]);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [input, messages, loading, systemPrompt, workerUrl]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const handleReset = useCallback(() => {
    setMessages([]);
    setError('');
  }, []);

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={handleClose}
      variant="temporary"
      PaperProps={{
        sx: {
          width: 420,
          borderRadius: 0,
          border: `3px solid ${COLORS.brand}`,
          borderRight: 'none',
          boxShadow: `-6px 0 0 ${COLORS.brand}`,
          display: 'flex',
          flexDirection: 'column',
        },
      }}
    >
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <Box sx={{
        flexShrink: 0, px: 2.5, py: 1.5,
        bgcolor: COLORS.brand,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <AutoAwesomeIcon sx={{ color: '#FFF8E1', fontSize: 18 }} />
          <Box>
            <Typography sx={{ fontWeight: 900, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: 1, color: '#FFF8E1', fontFamily: FONT }}>
              AI Assistant
            </Typography>
            <Typography sx={{ fontSize: '0.65rem', fontWeight: 600, color: '#D7CCC8', fontFamily: FONT }}>
              {pet?.name || 'Patient'} History
            </Typography>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <IconButton
            size="small"
            onClick={handleReset}
            title="Reset conversation"
            sx={{ color: '#D7CCC8', '&:hover': { color: '#FFF8E1' } }}
          >
            <RestartAltIcon fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            onClick={handleClose}
            title="Close"
            sx={{ color: '#D7CCC8', '&:hover': { color: '#FFF8E1' } }}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
      </Box>

      {/* ── Disclaimer bar ─────────────────────────────────────────────────── */}
      <Box sx={{ px: 2, py: 0.75, bgcolor: COLORS.kpiPurpleBg, borderBottom: `1px solid ${COLORS.kpiPurpleBorder}` }}>
        <Typography sx={{ fontFamily: FONT, fontSize: '0.62rem', color: COLORS.grooming, fontStyle: 'italic', lineHeight: 1.4 }}>
          AI-generated — verify all information against the actual records. Not a substitute for clinical judgment.
        </Typography>
      </Box>

      {/* ── Quick-action chips (empty state only) ──────────────────────────── */}
      {messages.length === 0 && (
        <Box sx={{ px: 2, py: 1.5, display: 'flex', flexDirection: 'column', gap: 1, borderBottom: `1px solid ${COLORS.borderLight}`, flexShrink: 0 }}>
          <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.textMuted, fontSize: '0.6rem' }}>
            QUICK ACTIONS
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
            {QUICK_ACTIONS.map(qa => (
              <Chip
                key={qa.label}
                label={qa.label}
                size="small"
                onClick={() => handleSend(qa.prompt)}
                sx={{
                  fontFamily: FONT, fontWeight: 700, fontSize: '0.7rem',
                  bgcolor: COLORS.cardBg, color: COLORS.grooming,
                  border: `1.5px solid ${COLORS.kpiPurpleBorder}`,
                  borderRadius: 0,
                  '&:hover': { bgcolor: COLORS.kpiPurpleBg },
                }}
              />
            ))}
          </Box>
        </Box>
      )}

      {/* ── Chat area ──────────────────────────────────────────────────────── */}
      <Box sx={{
        flex: 1, overflowY: 'auto', px: 2, py: 1.5,
        display: 'flex', flexDirection: 'column', gap: 1.5,
        '&::-webkit-scrollbar': { width: 4 },
        '&::-webkit-scrollbar-thumb': { bgcolor: COLORS.timelineRail },
      }}>
        {/* Empty-state prompt */}
        {messages.length === 0 && (
          <Box sx={{ textAlign: 'center', py: 6, color: COLORS.textMuted }}>
            <AutoAwesomeIcon sx={{ fontSize: 36, opacity: 0.25, mb: 1 }} />
            <Typography sx={{ fontFamily: FONT, fontSize: '0.82rem', fontWeight: 600 }}>
              Ask anything about {pet?.name || 'this patient'}&apos;s medical history
            </Typography>
            <Typography sx={{ fontFamily: FONT, fontSize: '0.72rem', mt: 0.5 }}>
              Try a quick action above, or type your own question.
            </Typography>
          </Box>
        )}

        {/* Message bubbles */}
        {messages.map((msg, i) => (
          <Box
            key={i}
            sx={{ alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '90%' }}
          >
            <Typography sx={{
              fontFamily: FONT, fontSize: '0.58rem', fontWeight: 800,
              textTransform: 'uppercase', letterSpacing: '0.06em',
              color: msg.role === 'user' ? COLORS.textMuted : COLORS.grooming,
              mb: 0.25, px: 0.5,
            }}>
              {msg.role === 'user' ? 'You' : 'AI Assistant'}
            </Typography>

            <Box sx={{
              px: 1.5, py: 1,
              bgcolor: msg.role === 'user' ? COLORS.panelBg : COLORS.cardBg,
              border: `1.5px solid ${msg.role === 'user' ? COLORS.border : COLORS.kpiPurpleBorder}`,
              borderRadius: 0,
            }}>
              {msg.role === 'assistant' ? (
                <Box sx={{ fontSize: '0.8rem', color: COLORS.textPrimary, lineHeight: 1.6, fontFamily: FONT }}>
                  <ReactMarkdown components={markdownComponents}>
                    {msg.content}
                  </ReactMarkdown>
                </Box>
              ) : (
                <Typography sx={{ fontFamily: FONT, fontSize: '0.8rem', color: COLORS.textPrimary, lineHeight: 1.6 }}>
                  {msg.content}
                </Typography>
              )}
            </Box>
          </Box>
        ))}

        {/* Loading indicator */}
        {loading && (
          <Box sx={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 1, px: 1 }}>
            <CircularProgress size={14} sx={{ color: COLORS.grooming }} />
            <Typography sx={{ fontFamily: FONT, fontSize: '0.72rem', color: COLORS.textMuted, fontStyle: 'italic' }}>
              Analyzing records...
            </Typography>
          </Box>
        )}

        {/* Inline error display — no window.alert() */}
        {error && (
          <Box sx={{ px: 1.5, py: 1, bgcolor: COLORS.dangerSurface, border: `1.5px solid ${COLORS.danger}`, borderRadius: 0 }}>
            <Typography sx={{ fontFamily: FONT, fontSize: '0.78rem', color: COLORS.danger, fontWeight: 700 }}>
              {error}
            </Typography>
          </Box>
        )}

        <div ref={chatEndRef} />
      </Box>

      {/* ── Input area ─────────────────────────────────────────────────────── */}
      <Box sx={{
        flexShrink: 0, px: 2, py: 1.5,
        borderTop: `2px solid ${COLORS.border}`,
        bgcolor: COLORS.surfaceAlt,
        display: 'flex', gap: 1,
      }}>
        <TextField
          fullWidth
          size="small"
          placeholder="Ask about medical history..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
          multiline
          maxRows={3}
          sx={{
            fontFamily: FONT,
            '& .MuiOutlinedInput-root': {
              borderRadius: 0,
              fontSize: '0.82rem',
              fontFamily: FONT,
              bgcolor: COLORS.cardBg,
              '& fieldset': { borderColor: COLORS.border },
              '&:hover fieldset': { borderColor: COLORS.accentLight },
              '&.Mui-focused fieldset': { borderColor: COLORS.grooming },
            },
          }}
        />
        <Button
          variant="contained"
          onClick={() => handleSend()}
          disabled={!input.trim() || loading}
          sx={{
            minWidth: 44, px: 1, borderRadius: 0,
            bgcolor: COLORS.grooming, color: '#fff',
            '&:hover': { bgcolor: COLORS.kpiPurpleText },
            '&.Mui-disabled': { bgcolor: COLORS.borderLight },
          }}
        >
          <SendIcon fontSize="small" />
        </Button>
      </Box>
    </Drawer>
  );
}
