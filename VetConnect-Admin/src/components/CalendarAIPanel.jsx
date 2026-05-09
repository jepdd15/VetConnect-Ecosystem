// CalendarAIPanel.jsx — AI Scheduling Assistant side panel for the Calendar page.
//
// Props are all flat (no internal Firestore coupling) — parent Calendar.jsx
// owns all state and handlers. This component is pure presentation + scroll management.
//
// Sky Blue theme (COLORS.sky / kpiBlueBg) — distinguishes scheduling AI
// from ClinicalAIPanel (purple / COLORS.grooming).

import React, { useRef, useEffect, useMemo } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Button,
  Chip,
  CircularProgress,
  InputBase,
} from '@mui/material';
import CloseIcon        from '@mui/icons-material/Close';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import RestartAltIcon   from '@mui/icons-material/RestartAlt';
import SendIcon         from '@mui/icons-material/Send';
import ReplayIcon       from '@mui/icons-material/Replay';
import SummarizeIcon    from '@mui/icons-material/Summarize';
import SearchIcon       from '@mui/icons-material/Search';
import PeopleIcon       from '@mui/icons-material/People';
import ViewWeekIcon     from '@mui/icons-material/ViewWeek';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ReactMarkdown    from 'react-markdown';
import { FONT, TYPE, COLORS } from '../theme/designTokens';
import { normalizeMarkdownTables } from '../utils/normalizeMarkdownTables';

// ─── Quick-action chip definitions ───────────────────────────────────────────

const QUICK_CHIPS = [
  { type: 'briefing',          label: "Tomorrow's Briefing",  Icon: SummarizeIcon   },
  { type: 'find_slot',         label: 'Find a Slot',          Icon: SearchIcon      },
  { type: 'staff_availability', label: 'Staff Availability',  Icon: PeopleIcon      },
  { type: 'week_summary',      label: 'This Week Summary',    Icon: ViewWeekIcon    },
  { type: 'conflicts',         label: 'Conflicts & Gaps',     Icon: WarningAmberIcon },
];

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * CalendarAIPanel — AI Scheduling Assistant side panel.
 *
 * Integrated as a 380px flex column to the right of the calendar grid.
 * The panel collapses the calendar (not an overlay) so staff can see
 * schedule and AI output side-by-side.
 *
 * @prop {boolean}       loading           - LLM call in-flight
 * @prop {Array}         messages          - [{role:'user'|'assistant', content:string}]
 * @prop {string}        error             - Error message from LLM, or ''
 * @prop {string}        followUpInput     - Current text input value
 * @prop {function}      onSendMessage     - (text:string) => void
 * @prop {function}      onFollowUpChange  - (value:string) => void
 * @prop {function}      onReset           - () => void — clears conversation
 * @prop {function}      onRetry           - () => void — retries last failed call
 * @prop {function}      onClose           - () => void — closes the panel
 * @prop {function}      onChipClick       - (chipType:string) => void
 * @prop {string|null}   contextLabel      - "Niki · Grooming · 10:00 AM" or null
 */
export default function CalendarAIPanel({
  loading,
  messages,
  error,
  followUpInput,
  onSendMessage,
  onFollowUpChange,
  onReset,
  onRetry,
  onClose,
  onChipClick,
  contextLabel,
}) {
  const chatEndRef = useRef(null);

  // Auto-scroll to bottom whenever messages update or loading changes.
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, loading]);

  // Stable markdown component map — prevents ReactMarkdown from re-mounting
  // its tree on every keystroke in the input field.
  const markdownComponents = useMemo(() => ({
    h1: ({ children }) => (
      <Typography sx={{ fontFamily: FONT, fontSize: '1rem', fontWeight: 900, color: COLORS.sky, mt: 1.5, mb: 0.5 }}>
        {children}
      </Typography>
    ),
    h2: ({ children }) => (
      <Typography sx={{ fontFamily: FONT, fontSize: '0.9rem', fontWeight: 900, color: COLORS.sky, mt: 1.25, mb: 0.5 }}>
        {children}
      </Typography>
    ),
    h3: ({ children }) => (
      <Typography sx={{ fontFamily: FONT, fontSize: '0.85rem', fontWeight: 800, color: COLORS.sky, mt: 1, mb: 0.25 }}>
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
      <th style={{ border: `1px solid ${COLORS.kpiBlueBorder}`, padding: '4px 8px', fontWeight: 800, textAlign: 'left', borderRadius: 0, backgroundColor: 'rgba(58,190,249,0.06)' }}>
        {children}
      </th>
    ),
    td: ({ children }) => (
      <td style={{ border: `1px solid ${COLORS.kpiBlueBorder}`, padding: '4px 8px', borderRadius: 0 }}>
        {children}
      </td>
    ),
    hr: () => (
      <hr style={{ border: 'none', borderTop: `1px solid ${COLORS.kpiBlueBorder}`, margin: '8px 0' }} />
    ),
  }), []);

  const isEmpty = messages.length === 0;

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (followUpInput?.trim() && !loading) {
        onSendMessage(followUpInput);
      }
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* ── HEADER ── */}
      <Box sx={{
        bgcolor: COLORS.sky,
        px: 2,
        py: 1.5,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        borderBottom: `2px solid ${COLORS.skyHover}`,
      }}>
        <CalendarMonthIcon sx={{ color: '#FFF', fontSize: 22 }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{
            fontFamily: FONT,
            ...TYPE.label,
            color: '#FFF',
            fontWeight: 900,
            letterSpacing: 1.5,
            fontSize: '0.65rem',
          }}>
            AI SCHEDULING ASSISTANT
          </Typography>
          {contextLabel && (
            <Typography sx={{
              fontFamily: FONT,
              fontSize: '0.7rem',
              fontWeight: 700,
              color: 'rgba(255,255,255,0.85)',
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {contextLabel}
            </Typography>
          )}
        </Box>

        {/* Reset button — visible when conversation has messages */}
        {messages.length > 0 && (
          <IconButton
            size="small"
            onClick={onReset}
            disabled={loading}
            title="Clear conversation"
            sx={{ color: '#FFF', opacity: 0.8, '&:hover': { opacity: 1 }, p: 0.5 }}
          >
            <RestartAltIcon sx={{ fontSize: 18 }} />
          </IconButton>
        )}

        {/* Close button */}
        <IconButton
          size="small"
          onClick={onClose}
          title="Close AI panel"
          sx={{ color: '#FFF', opacity: 0.8, '&:hover': { opacity: 1 }, p: 0.5 }}
        >
          <CloseIcon sx={{ fontSize: 18 }} />
        </IconButton>
      </Box>

      {/* ── DISCLAIMER BAR ── */}
      <Box sx={{
        bgcolor: COLORS.kpiBlueBg,
        borderBottom: `1px solid ${COLORS.kpiBlueBorder}`,
        px: 2,
        py: 0.75,
        flexShrink: 0,
      }}>
        <Typography sx={{
          fontFamily: FONT,
          fontSize: '0.65rem',
          color: COLORS.skyHover,
          fontStyle: 'italic',
          lineHeight: 1.4,
        }}>
          AI-generated scheduling suggestions for reference only. All booking and rescheduling decisions must be made by clinic staff.
        </Typography>
      </Box>

      {/* ── QUICK ACTION CHIPS — always visible, above chat area ── */}
      <Box sx={{
        px: 1.5,
        pt: 1.25,
        pb: 1,
        flexShrink: 0,
        bgcolor: COLORS.surface,
        borderBottom: `1px solid ${COLORS.kpiBlueBorder}`,
      }}>
        <Typography sx={{
          fontFamily: FONT,
          ...TYPE.label,
          color: COLORS.textMuted,
          mb: 0.75,
          fontSize: '0.6rem',
        }}>
          QUICK ACTIONS
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
          {QUICK_CHIPS.map(({ type, label, Icon }) => (
            <Chip
              key={type}
              label={label}
              size="small"
              icon={<Icon sx={{ fontSize: '13px !important' }} />}
              onClick={() => onChipClick(type)}
              disabled={loading}
              sx={{
                fontFamily: FONT,
                fontWeight: 900,
                fontSize: '0.6rem',
                borderRadius: 0,
                bgcolor: COLORS.kpiBlueBg,
                border: `1px solid ${COLORS.kpiBlueBorder}`,
                color: COLORS.sky,
                '& .MuiChip-icon': { color: COLORS.sky },
                '&:hover': { bgcolor: `${COLORS.kpiBlueBorder}40` },
                '&.Mui-disabled': { opacity: 0.4 },
              }}
            />
          ))}
        </Box>
      </Box>

      {/* ── SCROLLABLE CHAT AREA ── */}
      <Box sx={{
        flex: 1,
        overflowY: 'auto',
        p: 1.5,
        scrollbarWidth: 'thin',
        '&::-webkit-scrollbar': { width: '4px' },
        '&::-webkit-scrollbar-track': { background: 'transparent' },
        '&::-webkit-scrollbar-thumb': { background: '#E0E0E0' },
        '&::-webkit-scrollbar-thumb:hover': { background: COLORS.skyHover },
      }}>

        {/* Empty state */}
        {isEmpty && !loading && !error && (
          <Box sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            py: 4,
            opacity: 0.45,
          }}>
            <CalendarMonthIcon sx={{ fontSize: 48, color: COLORS.sky, mb: 1.5 }} />
            <Typography sx={{
              fontFamily: FONT,
              fontSize: '0.8rem',
              color: COLORS.textMuted,
              textAlign: 'center',
              lineHeight: 1.5,
            }}>
              Ask a question about your schedule, or click a quick action chip to get started.
            </Typography>
          </Box>
        )}

        {/* Initial loading indicator (no messages yet) */}
        {loading && messages.length <= 1 && !error && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 2 }}>
            <CircularProgress size={18} sx={{ color: COLORS.sky }} />
            <Typography sx={{ fontSize: '0.8rem', color: COLORS.sky, fontWeight: 700, fontFamily: FONT }}>
              Analyzing schedule...
            </Typography>
          </Box>
        )}

        {/* Conversation bubbles */}
        {messages.map((msg, idx) => (
          <Box
            key={idx}
            sx={{
              mb: 1.5,
              p: 1.25,
              borderRadius: 0,
              bgcolor: msg.role === 'user' ? COLORS.panelBg : COLORS.cardBg,
              borderLeft: msg.role === 'user'
                ? `3px solid ${COLORS.brand}`
                : `3px solid ${COLORS.sky}`,
              border: msg.role === 'user'
                ? `1px solid ${COLORS.borderLight}`
                : `1px solid ${COLORS.kpiBlueBorder}`,
              borderLeftWidth: '3px',
            }}
          >
            <Typography sx={{
              ...TYPE.label,
              color: msg.role === 'user' ? COLORS.brand : COLORS.sky,
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

        {/* Follow-up loading indicator (messages already exist) */}
        {loading && messages.length > 1 && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5, pl: 1 }}>
            <CircularProgress size={12} sx={{ color: COLORS.sky }} />
            <Typography sx={{ fontSize: '0.75rem', color: COLORS.sky, fontWeight: 700, fontFamily: FONT }}>
              Thinking...
            </Typography>
          </Box>
        )}

        {/* Error state with retry */}
        {error && (
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
              {error}
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
                  '&:hover': { borderColor: '#B71C1C', bgcolor: 'rgba(211,47,47,0.04)' },
                }}
              >
                Try Again
              </Button>
            )}
          </Box>
        )}

        {/* Scroll anchor */}
        <div ref={chatEndRef} />
      </Box>

      {/* ── INPUT BAR — always visible (not gated on first response) ── */}
      <Box sx={{
        borderTop: `2px solid ${COLORS.kpiBlueBorder}`,
        bgcolor: COLORS.kpiBlueBg,
        p: 1.5,
        flexShrink: 0,
        display: 'flex',
        gap: 1,
        alignItems: 'center',
      }}>
        <InputBase
          placeholder="Ask about scheduling, availability, conflicts..."
          value={followUpInput || ''}
          onChange={(e) => onFollowUpChange(e.target.value)}
          onKeyDown={handleKeyDown}
          multiline
          maxRows={4}
          inputProps={{ 'aria-label': 'Scheduling question for AI' }}
          sx={{
            flex: 1,
            fontSize: '0.8rem',
            fontFamily: FONT,
            bgcolor: COLORS.cardBg,
            border: `1px solid ${COLORS.kpiBlueBorder}`,
            borderRadius: 0,
            px: 1.25,
            py: 0.75,
            alignItems: 'flex-end',
            '&:focus-within': { borderColor: COLORS.sky },
          }}
        />
        <IconButton
          size="small"
          onClick={() => onSendMessage(followUpInput)}
          disabled={!followUpInput?.trim() || loading}
          sx={{
            bgcolor: COLORS.sky,
            color: '#FFF',
            borderRadius: 0,
            p: 0.75,
            flexShrink: 0,
            alignSelf: 'flex-end',
            '&:hover': { bgcolor: COLORS.skyHover },
            '&.Mui-disabled': { bgcolor: COLORS.kpiBlueBorder, color: '#FFF', opacity: 0.6 },
          }}
        >
          <SendIcon sx={{ fontSize: 16 }} />
        </IconButton>
      </Box>
    </Box>
  );
}
