import React, { useRef, useEffect, useMemo } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Button,
  CircularProgress,
  TextField,
} from '@mui/material';
import CloseIcon        from '@mui/icons-material/Close';
import AutoAwesomeIcon   from '@mui/icons-material/AutoAwesome';
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

// ─── Quick-action definitions ───────────────────────────────────────────────

const QUICK_ACTIONS = [
  { type: 'briefing',          label: "Tomorrow's Briefing",  Icon: SummarizeIcon   },
  { type: 'find_slot',         label: 'Find a Slot',          Icon: SearchIcon      },
  { type: 'staff_availability', label: 'Staff Availability',  Icon: PeopleIcon      },
  { type: 'week_summary',      label: 'This Week Summary',    Icon: ViewWeekIcon    },
  { type: 'conflicts',         label: 'Conflicts & Gaps',     Icon: WarningAmberIcon },
  { type: 'burnout_radar',     label: 'Staff Burnout Radar',  Icon: WarningAmberIcon },
];

// ─── Component ────────────────────────────────────────────────────────────────

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

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, loading]);

  const markdownComponents = useMemo(() => ({
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
    <Box sx={{ 
      display: 'flex', 
      flexDirection: 'column', 
      height: '100%', 
      overflow: 'hidden',
      borderLeft: `3px solid ${COLORS.brand}`,
      boxShadow: `-8px 0 0 rgba(62, 39, 35, 0.15)`,
    }}>

      {/* ── HEADER ── */}
      <Box sx={{
        bgcolor: COLORS.brand,
        px: 2.5,
        py: 2,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
      }}>
        <AutoAwesomeIcon sx={{ color: COLORS.cream, fontSize: 20 }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{
            fontFamily: FONT,
            fontWeight: 900,
            fontSize: '0.9rem',
            textTransform: 'uppercase',
            letterSpacing: 1.5,
            color: COLORS.cream,
          }}>
            AI Scheduling Assistant
          </Typography>
          {contextLabel && (
            <Typography sx={{
              fontFamily: FONT,
              fontSize: '0.65rem',
              fontWeight: 800,
              color: COLORS.cream,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
            }}>
              {contextLabel}
            </Typography>
          )}
        </Box>

        <Box sx={{ display: 'flex', gap: 1 }}>
          {messages.length > 0 && (
            <IconButton
              size="small"
              onClick={onReset}
              disabled={loading}
              title="Reset conversation"
              sx={{ color: COLORS.cream, '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' } }}
            >
              <RestartAltIcon fontSize="small" />
            </IconButton>
          )}
          <IconButton
            size="small"
            onClick={onClose}
            title="Close"
            sx={{ color: COLORS.cream, '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' } }}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
      </Box>

      {/* ── DISCLAIMER BAR ── */}
      <Box sx={{
        bgcolor: COLORS.cream,
        borderBottom: `2px solid ${COLORS.brand}`,
        px: 2.5,
        py: 1,
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
          AI-generated scheduling suggestions for reference only. All booking and rescheduling decisions must be made by clinic staff.
        </Typography>
      </Box>

      {/* ── SCROLLABLE CHAT AREA ── */}
      <Box sx={{
        flex: 1,
        overflowY: 'auto',
        p: 2.5,
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        bgcolor: COLORS.surfaceAlt,
        scrollbarWidth: 'thin',
        '&::-webkit-scrollbar': { width: 5 },
        '&::-webkit-scrollbar-thumb': { bgcolor: COLORS.brand },
      }}>

        {/* Empty state & Quick Actions */}
        {isEmpty && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, pt: 1 }}>
            <Box sx={{ textAlign: 'center', opacity: 0.6 }}>
              <SummarizeIcon sx={{ fontSize: 48, color: COLORS.brand, opacity: 0.2, mb: 1.5 }} />
              <Typography sx={{ fontFamily: FONT, fontSize: '0.85rem', fontWeight: 800, color: COLORS.brand }}>
                Explore the Clinic Schedule
              </Typography>
              <Typography sx={{ fontFamily: FONT, fontSize: '0.75rem', mt: 0.5, color: COLORS.textSecondary }}>
                Ask a specific question or use a quick action below.
              </Typography>
            </Box>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.textMuted, fontSize: '0.6rem' }}>
                SUGGESTED ANALYTICS
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
                {QUICK_ACTIONS.map(({ type, label, Icon }) => (
                  <Button
                    key={type}
                    onClick={() => onChipClick(type)}
                    disabled={loading}
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
                      '&.Mui-disabled': { opacity: 0.4 },
                    }}
                  >
                    {label}
                  </Button>
                ))}
              </Box>
            </Box>
          </Box>
        )}

        {/* Initial loading indicator */}
        {loading && messages.length === 0 && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 2 }}>
            <CircularProgress size={16} thickness={6} sx={{ color: COLORS.brand }} />
            <Typography sx={{ fontSize: '0.75rem', color: COLORS.brand, fontWeight: 700, fontFamily: FONT, letterSpacing: '0.05em' }}>
              ANALYZING SCHEDULE...
            </Typography>
          </Box>
        )}

        {/* Conversation bubbles */}
        {messages.map((msg, idx) => (
          <Box
            key={idx}
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

        {/* Follow-up loading indicator */}
        {loading && messages.length > 0 && (
          <Box sx={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 1.5, px: 1, py: 1 }}>
            <CircularProgress size={16} thickness={6} sx={{ color: COLORS.brand }} />
            <Typography sx={{ fontFamily: FONT, fontSize: '0.75rem', color: COLORS.brand, fontWeight: 700, letterSpacing: '0.05em' }}>
              THINKING...
            </Typography>
          </Box>
        )}

        {/* Error state */}
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
                Retry Connection
              </Button>
            )}
          </Box>
        )}

        <div ref={chatEndRef} />
      </Box>

      {/* ── INPUT BAR ── */}
      <Box sx={{
        flexShrink: 0, px: 2, py: 2,
        borderTop: `3px solid ${COLORS.brand}`,
        bgcolor: COLORS.panelBg,
        display: 'flex', gap: 1,
      }}>
        <TextField
          fullWidth
          size="small"
          placeholder="Ask a scheduling query..."
          value={followUpInput || ''}
          onChange={(e) => onFollowUpChange(e.target.value)}
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
        <IconButton
          onClick={() => onSendMessage(followUpInput)}
          disabled={!followUpInput?.trim() || loading}
          sx={{
            minWidth: 50, borderRadius: 0,
            bgcolor: COLORS.brand, color: COLORS.cream,
            boxShadow: 'none',
            '&:hover': { bgcolor: COLORS.accent, boxShadow: 'none' },
            '&.Mui-disabled': { bgcolor: COLORS.borderLight, color: COLORS.textMuted },
          }}
        >
          <SendIcon fontSize="small" />
        </IconButton>
      </Box>
    </Box>
  );
}
