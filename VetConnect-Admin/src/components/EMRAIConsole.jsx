/**
 * EMRAIConsole.jsx — Zero-Risk Embedded AI Assistant
 * 
 * A dedicated AI chat interface for the EMR Drawer.
 * Cloned from PetHistoryAIDrawer logic to ensure zero-risk to PatientDashboard.
 * Optimized for side-by-side clinical record analysis.
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  Box, Typography, IconButton, TextField, Button, Chip, CircularProgress,
  Divider,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import SendIcon from '@mui/icons-material/Send';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import ReplayIcon from '@mui/icons-material/Replay';
import ReactMarkdown from 'react-markdown';
import { FONT, TYPE, COLORS } from '../theme/designTokens';
import { chatWithHistory } from '../utils/llmService';
import { buildPetHistoryPrompt } from '../utils/buildPetHistoryPrompt';
import { normalizeMarkdownTables } from '../utils/normalizeMarkdownTables';

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
  {
    label: 'Vaccination Audit',
    prompt: "Audit the patient's vaccination history. List what is up-to-date, what is overdue, and what is due within the next 60 days based on the record.",
  },
  {
    label: 'Medication Review',
    prompt: "Perform a medication reconciliation. List all active or recently mentioned medications, dosages, and any noted instructions or owner compliance issues.",
  },
];

function buildMarkdownComponents() {
  return {
    h1: ({ children }) => (
      <Typography sx={{ fontFamily: FONT, fontSize: '0.9rem', fontWeight: 900, color: COLORS.brand, mt: 1, mb: 0.5, textTransform: 'uppercase' }}>
        {children}
      </Typography>
    ),
    h2: ({ children }) => (
      <Typography sx={{ fontFamily: FONT, fontSize: '0.85rem', fontWeight: 900, color: COLORS.brand, mt: 0.75, mb: 0.25 }}>
        {children}
      </Typography>
    ),
    p: ({ children }) => (
      <Typography sx={{ fontFamily: FONT, fontSize: '0.78rem', color: COLORS.textPrimary, lineHeight: 1.6, mb: 0.5 }}>
        {children}
      </Typography>
    ),
    li: ({ children }) => (
      <li style={{ fontSize: '0.78rem', marginBottom: '2px', lineHeight: 1.5, color: COLORS.textPrimary }}>{children}</li>
    ),
    strong: ({ children }) => <strong style={{ fontWeight: 800, color: COLORS.brand }}>{children}</strong>,
    table: ({ children }) => (
      <div style={{ overflowX: 'auto', marginBottom: '10px' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.72rem', border: `2px solid ${COLORS.brand}` }}>
          {children}
        </table>
      </div>
    ),
    th: ({ children }) => (
      <th style={{ border: `1px solid ${COLORS.brand}`, padding: '4px 8px', fontWeight: 900, textAlign: 'left', backgroundColor: COLORS.panelBg, color: COLORS.brand }}>
        {children}
      </th>
    ),
    td: ({ children }) => (
      <td style={{ border: `1px solid ${COLORS.brand}`, padding: '4px 8px', color: COLORS.textPrimary }}>{children}</td>
    ),
  };
}

export default function EMRAIConsole({ pet, owner, records, vaccinations, workerUrl, onClose }) {
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
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

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

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: COLORS.surfaceAlt }}>
      {/* Console Header */}
      <Box sx={{
        px: 2, py: 1.5,
        bgcolor: COLORS.brand,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2 }}>
          <AutoAwesomeIcon sx={{ color: COLORS.cream, fontSize: 18 }} />
          <Typography sx={{ fontWeight: 900, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: 1.2, color: COLORS.cream, fontFamily: FONT }}>
            AI Assistant Console
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <IconButton size="small" onClick={handleReset} sx={{ color: COLORS.cream }}>
            <RestartAltIcon fontSize="small" />
          </IconButton>
          <IconButton size="small" onClick={onClose} sx={{ color: COLORS.cream }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
      </Box>

      {/* Disclaimer */}
      <Box sx={{ px: 2, py: 0.75, bgcolor: COLORS.cream, borderBottom: `2px solid ${COLORS.brand}` }}>
        <Typography sx={{ fontFamily: FONT, fontSize: '0.6rem', color: COLORS.brand, fontWeight: 700, fontStyle: 'italic' }}>
          AI-generated — verify against records.
        </Typography>
      </Box>

      {/* Chat Area */}
      <Box sx={{
        flex: 1, overflowY: 'auto', px: 2, py: 2,
        display: 'flex', flexDirection: 'column', gap: 2,
        '&::-webkit-scrollbar': { width: 4 },
        '&::-webkit-scrollbar-thumb': { bgcolor: COLORS.brand },
      }}>
        {messages.length === 0 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <Typography sx={{ fontFamily: FONT, fontSize: '0.8rem', fontWeight: 800, color: COLORS.brand, textAlign: 'center' }}>
              Analyze {pet?.name || 'this patient'}&apos;s history
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {QUICK_ACTIONS.map(qa => (
                <Button
                  key={qa.label}
                  onClick={() => handleSend(qa.prompt)}
                  sx={{
                    fontFamily: FONT, fontWeight: 800, fontSize: '0.68rem',
                    color: COLORS.brand, bgcolor: COLORS.cardBg,
                    border: `2px solid ${COLORS.brand}`, borderRadius: 0,
                    textTransform: 'none', px: 1.5, py: 0.5,
                    boxShadow: `2px 2px 0px ${COLORS.brand}`,
                    '&:hover': { bgcolor: COLORS.panelBg, transform: 'translate(-1px, -1px)', boxShadow: `3px 3px 0px ${COLORS.brand}` },
                  }}
                >
                  {qa.label}
                </Button>
              ))}
            </Box>
          </Box>
        )}

        {messages.map((msg, i) => (
          <Box key={i} sx={{ alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '95%' }}>
            <Box sx={{
              px: 1.5, py: 1,
              bgcolor: msg.role === 'user' ? COLORS.panelBg : COLORS.cardBg,
              border: `2px solid ${COLORS.brand}`,
              boxShadow: msg.role === 'assistant' ? `3px 3px 0px ${COLORS.brand}` : 'none',
            }}>
              {msg.role === 'assistant' ? (
                <Box sx={{ fontSize: '0.78rem', color: COLORS.textPrimary, lineHeight: 1.6, fontFamily: FONT }}>
                  <ReactMarkdown components={markdownComponents}>
                    {normalizeMarkdownTables(msg.content)}
                  </ReactMarkdown>
                </Box>
              ) : (
                <Typography sx={{ fontFamily: FONT, fontSize: '0.78rem', color: COLORS.textPrimary, fontWeight: 500 }}>
                  {msg.content}
                </Typography>
              )}
            </Box>
          </Box>
        ))}

        {loading && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1 }}>
            <CircularProgress size={12} thickness={6} sx={{ color: COLORS.brand }} />
            <Typography sx={{ fontFamily: FONT, fontSize: '0.65rem', color: COLORS.brand, fontWeight: 800 }}>ANALYZING...</Typography>
          </Box>
        )}

        {error && (
          <Typography sx={{ fontFamily: FONT, fontSize: '0.7rem', color: COLORS.danger, fontWeight: 800 }}>
            Error: {error}
          </Typography>
        )}
        <div ref={chatEndRef} />
      </Box>

      {/* Input */}
      <Box sx={{ px: 1.5, py: 1.5, borderTop: `2px solid ${COLORS.brand}`, bgcolor: COLORS.panelBg, display: 'flex', gap: 1 }}>
        <TextField
          fullWidth size="small" placeholder="Query history..."
          value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown} disabled={loading}
          sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0, fontSize: '0.75rem', fontFamily: FONT, bgcolor: COLORS.cardBg, '& fieldset': { border: `2px solid ${COLORS.brand}` } } }}
        />
        <Button
          variant="contained" onClick={() => handleSend()}
          disabled={!input.trim() || loading}
          sx={{ minWidth: 40, borderRadius: 0, bgcolor: COLORS.brand, boxShadow: 'none' }}
        >
          <SendIcon sx={{ fontSize: 16 }} />
        </Button>
      </Box>
    </Box>
  );
}
