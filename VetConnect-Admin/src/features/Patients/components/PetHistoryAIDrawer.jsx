/**
 * PetHistoryAIDrawer.jsx — T4.96
 *
 * Conversational AI assistant for a pet's complete medical history.
 * Modernized to 'Clinical Neubrutalist' aesthetic.
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  Drawer, Box, Typography, IconButton, TextField, Button, Chip, CircularProgress,
  Divider,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import SendIcon from '@mui/icons-material/Send';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import ReplayIcon from '@mui/icons-material/Replay';
import ReactMarkdown from 'react-markdown';
import { FONT, TYPE, COLORS } from '../../../theme/designTokens';
import { chatWithHistory } from '../../../utils/llmService';
import { buildPetHistoryPrompt } from '../../../utils/buildPetHistoryPrompt';
import { normalizeMarkdownTables } from '../../../utils/normalizeMarkdownTables';

// ─── Quick-action prompts shown in empty state ──────────────────────────────

const QUICK_ACTIONS = [
  {
    label: 'Summarize History',
    prompt: "Give me a concise summary of this patient's complete medical history, highlighting key diagnoses, recurring conditions, and current treatment status.",
  },
  {
    label: 'Compliance Audit',
    prompt: "Review the 'Plan' (P) sections of all past SOAP records. Cross-reference them with subsequent visits to identify any recommended follow-ups, tests, or treatments that were missed or delayed. Flag any gaps in clinical compliance.",
  },
  {
    label: 'Signalment Risks',
    prompt: "Based on this patient's breed, age, and species, scan the entire medical history for early indicators or subtle mentions of breed-specific predispositions or age-related degenerative changes (e.g., mobility issues, organ function shifts).",
  },
  {
    label: 'Episode Mapping',
    prompt: "Identify recurring clinical episodes (e.g., skin flares, GI issues, ear infections). Map these episodes over time to identify seasonal patterns, frequency, and which treatments have historically been most effective.",
  },
  {
    label: 'Detect Patterns',
    prompt: "Analyze this patient's medical records for broader patterns: weight trends, medication changes, and any concerning trajectories that warrant attention.",
  },
  {
    label: 'Vaccination Audit',
    prompt: "Audit the patient's vaccination history. List what is up-to-date, what is overdue, and what is due within the next 60 days based on the record.",
  },
  {
    label: 'Medication Review',
    prompt: "Perform a medication reconciliation. List all active or recently mentioned medications, dosages, and any noted instructions or owner compliance issues.",
  },
  {
    label: 'Weight Trajectory',
    prompt: "Extract all weight data points. Provide a summary of the 12-month weight trend and flag any significant fluctuations (>5% change) that warrant clinical review.",
  },
  {
    label: 'Biometric Trends',
    prompt: "Analyze the relationship between Weight, BCS, and Vital signs across the entire history. Identify any 'Sarcopenic' patterns (weight loss despite stable BCS) or progressive shifts in Heart Rate, Respiratory Rate, or Temperature that warrant clinical investigation.",
  },
];

// ─── ReactMarkdown component map (Modernized) ─────────

function buildMarkdownComponents() {
  return {
    h1: ({ children }) => (
      <Typography sx={{ fontFamily: FONT, fontSize: '0.95rem', fontWeight: 900, color: COLORS.brand, mt: 1, mb: 0.5, textTransform: 'uppercase' }}>
        {children}
      </Typography>
    ),
    h2: ({ children }) => (
      <Typography sx={{ fontFamily: FONT, fontSize: '0.88rem', fontWeight: 900, color: COLORS.brand, mt: 0.75, mb: 0.25 }}>
        {children}
      </Typography>
    ),
    h3: ({ children }) => (
      <Typography sx={{ fontFamily: FONT, fontSize: '0.83rem', fontWeight: 800, color: COLORS.brand, mt: 0.5, mb: 0.25 }}>
        {children}
      </Typography>
    ),
    p: ({ children }) => (
      <Typography sx={{ fontFamily: FONT, fontSize: '0.8rem', color: COLORS.textPrimary, lineHeight: 1.6, mb: 0.5 }}>
        {children}
      </Typography>
    ),
    li: ({ children }) => (
      <li style={{ fontSize: '0.8rem', marginBottom: '2px', lineHeight: 1.5, color: COLORS.textPrimary }}>{children}</li>
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
      <td style={{ border: `1px solid ${COLORS.brand}`, padding: '4px 8px', color: COLORS.textPrimary }}>{children}</td>
    ),
    hr: () => (
      <hr style={{ border: 'none', borderTop: `2px solid ${COLORS.brand}`, margin: '8px 0' }} />
    ),
  };
}

export default function PetHistoryAIDrawer({ open, onClose, pet, owner, records, vaccinations, workerUrl }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const chatEndRef = useRef(null);
  const markdownComponents = useMemo(() => buildMarkdownComponents(), []);

  const systemPrompt = useMemo(
    () => buildPetHistoryPrompt({ pet, owner, records, vaccinations }),
    [pet, owner, records, vaccinations],
  );

  useEffect(() => {
    setMessages([]);
    setInput('');
    setError('');
  }, [pet?.id]);

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

  const handleRetry = useCallback(() => {
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    if (!lastUserMsg) return;
    setError('');
    setMessages(prev => {
      if (prev.length > 0 && prev[prev.length - 1].role === 'user') {
        return prev.slice(0, -1);
      }
      return prev;
    });
    setTimeout(() => handleSend(lastUserMsg.content), 0);
  }, [messages, handleSend]);

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={handleClose}
      variant="temporary"
      PaperProps={{
        sx: {
          width: 440,
          borderRadius: 0,
          border: `3px solid ${COLORS.brand}`,
          borderRight: 'none',
          boxShadow: `-8px 0 0 rgba(62, 39, 35, 0.15)`, // Subtle depth
          display: 'flex',
          flexDirection: 'column',
        },
      }}
    >
      {/* ── Header (Neubrutalist Header) ── */}
      <Box sx={{
        flexShrink: 0, px: 2.5, py: 2,
        bgcolor: COLORS.brand,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <AutoAwesomeIcon sx={{ color: COLORS.cream, fontSize: 20 }} />
          <Box>
            <Typography sx={{ fontWeight: 900, fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: 1.5, color: COLORS.cream, fontFamily: FONT }}>
              AI Assistant
            </Typography>
            <Typography sx={{ fontSize: '0.65rem', fontWeight: 800, color: COLORS.cream, fontFamily: FONT, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {pet?.name || 'Patient'} Records Analysis
            </Typography>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', gap: 1 }}>
          <IconButton
            size="small"
            onClick={handleReset}
            title="Reset conversation"
            sx={{ color: COLORS.cream, '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' } }}
          >
            <RestartAltIcon fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            onClick={handleClose}
            title="Close"
            sx={{ color: COLORS.cream, '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' } }}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
      </Box>

      {/* ── Disclaimer bar (Neutral) ── */}
      <Box sx={{ px: 2.5, py: 1, bgcolor: COLORS.cream, borderBottom: `2px solid ${COLORS.brand}` }}>
        <Typography sx={{ fontFamily: FONT, fontSize: '0.65rem', color: COLORS.brand, fontWeight: 700, fontStyle: 'italic', lineHeight: 1.4 }}>
          AI-generated — verify all information against clinical records. Not a substitute for clinical judgment.
        </Typography>
      </Box>

      {/* ── Chat Content area ── */}
      <Box sx={{
        flex: 1, overflowY: 'auto', px: 2.5, py: 2,
        display: 'flex', flexDirection: 'column', gap: 2,
        bgcolor: COLORS.surfaceAlt,
        '&::-webkit-scrollbar': { width: 5 },
        '&::-webkit-scrollbar-thumb': { bgcolor: COLORS.brand },
      }}>
        
        {/* Empty-state & Quick Actions */}
        {messages.length === 0 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, pt: 2 }}>
            <Box sx={{ textAlign: 'center', color: COLORS.textMuted }}>
              <AutoAwesomeIcon sx={{ fontSize: 48, opacity: 0.1, mb: 2 }} />
              <Typography sx={{ fontFamily: FONT, fontSize: '0.85rem', fontWeight: 800, color: COLORS.brand }}>
                Explore {pet?.name || 'this patient'}&apos;s medical history
              </Typography>
              <Typography sx={{ fontFamily: FONT, fontSize: '0.75rem', mt: 0.5, color: COLORS.textSecondary }}>
                Ask a specific question or use a quick action below.
              </Typography>
            </Box>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.textMuted, fontSize: '0.6rem' }}>
                SUGGESTED ANALYTICS
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {QUICK_ACTIONS.map(qa => (
                  <Button
                    key={qa.label}
                    onClick={() => handleSend(qa.prompt)}
                    sx={{
                      fontFamily: FONT, fontWeight: 800, fontSize: '0.72rem',
                      color: COLORS.brand, bgcolor: COLORS.cardBg,
                      border: `2px solid ${COLORS.brand}`,
                      borderRadius: 0,
                      textTransform: 'none',
                      px: 2, py: 0.75,
                      boxShadow: `3px 3px 0px ${COLORS.brand}`,
                      transition: 'all 0.1s ease',
                      '&:hover': {
                        bgcolor: COLORS.panelBg,
                        transform: 'translate(-1px, -1px)',
                        boxShadow: `4px 4px 0px ${COLORS.brand}`,
                      },
                    }}
                  >
                    {qa.label}
                  </Button>
                ))}
              </Box>
            </Box>
            <Divider sx={{ borderBottomWidth: 2, borderColor: COLORS.brand, opacity: 0.1 }} />
          </Box>
        )}

        {/* Message bubbles */}
        {messages.map((msg, i) => (
          <Box
            key={i}
            sx={{ alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '92%' }}
          >
            <Typography sx={{
              fontFamily: FONT, fontSize: '0.6rem', fontWeight: 1000,
              textTransform: 'uppercase', letterSpacing: '0.08em',
              color: msg.role === 'user' ? COLORS.textMuted : COLORS.brand,
              mb: 0.5, px: 0.5, textAlign: msg.role === 'user' ? 'right' : 'left'
            }}>
              {msg.role === 'user' ? 'Clinician' : 'AI Assistant'}
            </Typography>

            <Box sx={{
              px: 2, py: 1.5,
              bgcolor: msg.role === 'user' ? COLORS.panelBg : COLORS.cardBg,
              border: `2px solid ${COLORS.brand}`,
              borderRadius: 0,
              boxShadow: msg.role === 'assistant' ? `4px 4px 0px ${COLORS.brand}` : 'none',
            }}>
              {msg.role === 'assistant' ? (
                <Box sx={{ fontSize: '0.82rem', color: COLORS.textPrimary, lineHeight: 1.7, fontFamily: FONT }}>
                  <ReactMarkdown components={markdownComponents}>
                    {normalizeMarkdownTables(msg.content)}
                  </ReactMarkdown>
                </Box>
              ) : (
                <Typography sx={{ fontFamily: FONT, fontSize: '0.82rem', color: COLORS.textPrimary, lineHeight: 1.7, fontWeight: 500 }}>
                  {msg.content}
                </Typography>
              )}
            </Box>
          </Box>
        ))}

        {/* Loading indicator */}
        {loading && (
          <Box sx={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 1.5, px: 1, py: 1 }}>
            <CircularProgress size={16} thickness={6} sx={{ color: COLORS.brand }} />
            <Typography sx={{ fontFamily: FONT, fontSize: '0.75rem', color: COLORS.brand, fontWeight: 700, letterSpacing: '0.05em' }}>
              RECONSTRUCTING HISTORY...
            </Typography>
          </Box>
        )}

        {error && (
          <Box sx={{
            px: 2, py: 1.5,
            bgcolor: COLORS.dangerSurface,
            border: `2px solid ${COLORS.danger}`,
            borderRadius: 0,
            boxShadow: `4px 4px 0px ${COLORS.danger}`,
          }}>
            <Typography sx={{ fontFamily: FONT, fontSize: '0.85rem', color: COLORS.danger, fontWeight: 900, mb: 0.5 }}>
              INTELLIGENCE OFFLINE
            </Typography>
            <Typography sx={{ fontFamily: FONT, fontSize: '0.75rem', color: COLORS.textSecondary, mb: 1.5 }}>
              {error}
            </Typography>
            <Button
              size="small"
              variant="contained"
              startIcon={<ReplayIcon sx={{ fontSize: 14 }} />}
              onClick={handleRetry}
              sx={{
                fontFamily: FONT, fontWeight: 900, fontSize: '0.65rem',
                bgcolor: COLORS.danger, color: '#fff', borderRadius: 0,
                boxShadow: 'none', '&:hover': { bgcolor: COLORS.dangerHover },
              }}
            >
              Retry Connection
            </Button>
          </Box>
        )}

        <div ref={chatEndRef} />
      </Box>

      {/* ── Input area (Hardened) ── */}
      <Box sx={{
        flexShrink: 0, px: 2, py: 2,
        borderTop: `3px solid ${COLORS.brand}`,
        bgcolor: COLORS.panelBg,
        display: 'flex', gap: 1,
      }}>
        <TextField
          fullWidth
          size="small"
          placeholder="Ask a medical query..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
          multiline
          maxRows={4}
          sx={{
            fontFamily: FONT,
            '& .MuiOutlinedInput-root': {
              borderRadius: 0,
              fontSize: '0.85rem',
              fontFamily: FONT,
              bgcolor: COLORS.cardBg,
              '& fieldset': { border: `2px solid ${COLORS.brand}` },
              '&:hover fieldset': { borderColor: COLORS.brand },
              '&.Mui-focused fieldset': { borderWidth: 2, borderColor: COLORS.brand },
            },
          }}
        />
        <Button
          variant="contained"
          onClick={() => handleSend()}
          disabled={!input.trim() || loading}
          sx={{
            minWidth: 50, borderRadius: 0,
            bgcolor: COLORS.brand, color: COLORS.cream,
            boxShadow: 'none',
            '&:hover': { bgcolor: COLORS.accent, boxShadow: 'none' },
            '&.Mui-disabled': { bgcolor: COLORS.borderLight, color: COLORS.textMuted },
          }}
        >
          <SendIcon fontSize="small" />
        </Button>
      </Box>
    </Drawer>
  );
}
