import React from 'react';
import { Box, Typography, Paper, TextField, Button, List, IconButton, Chip } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import MenuItem from '@mui/material/MenuItem';
import EventNoteIcon from '@mui/icons-material/EventNote';

// Design Tokens
import { FONT, TYPE, COLORS, PANEL } from '../../../theme/designTokens';

// Map log categories to semantic token colors
const getCatColor = (cat) => {
  if (cat === 'Medical') return COLORS.medical;
  if (cat === 'Financial') return COLORS.success;
  if (cat === 'Behavioral') return COLORS.warning;
  return COLORS.accentLight; // 'General'
};

export default function InternalLogs({ notes, newNote, setNewNote, category, setCategory, onAdd, onDelete }) {
  return (
    <Box sx={{ p: 4, pb: 10, bgcolor: 'transparent', flexGrow: 1 }}>
      <Typography variant="h6" sx={{ fontFamily: FONT, fontWeight: 900, color: COLORS.accent, mb: 3, display: 'flex', alignItems: 'center', gap: 1.5, textTransform: 'uppercase', letterSpacing: 1 }}>
        <EventNoteIcon sx={{ color: COLORS.accentWarm }} /> Internal Staff Logs
      </Typography>
      
      {/* Input Area: Neubrutalist Panel */}
      <Paper elevation={0} sx={{ 
        p: 3, mb: 5, 
        borderRadius: 0, 
        border: `2px solid ${COLORS.brand}`, 
        bgcolor: COLORS.cream,
        boxShadow: `6px 6px 0px ${COLORS.brand}11`
      }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          
          {/* Category Selector: One-tap high-density buttons */}
          <Box>
            <Typography variant="caption" sx={{ fontFamily: FONT, fontWeight: 900, color: COLORS.textMuted, mb: 1, display: 'block', textTransform: 'uppercase' }}>
              Select Log Category
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {['General', 'Financial', 'Behavioral', 'Medical'].map((cat) => {
                const isSelected = category === cat;
                const catColor = getCatColor(cat);
                return (
                  <Button
                    key={cat}
                    onClick={() => setCategory(cat)}
                    size="small"
                    sx={{
                      fontFamily: FONT,
                      fontWeight: 900,
                      fontSize: '0.7rem',
                      borderRadius: 0,
                      px: 2,
                      py: 0.5,
                      border: `2px solid ${COLORS.brand}`,
                      bgcolor: isSelected ? catColor : COLORS.cardBg,
                      color: isSelected ? '#fff' : COLORS.textPrimary,
                      boxShadow: isSelected ? 'none' : `3px 3px 0px ${COLORS.brand}22`,
                      transform: isSelected ? 'translate(2px, 2px)' : 'none',
                      transition: 'all 0.1s ease',
                      '&:hover': {
                        bgcolor: isSelected ? catColor : COLORS.surfaceAlt,
                        borderColor: COLORS.brand
                      }
                    }}
                  >
                    {cat}
                  </Button>
                );
              })}
            </Box>
          </Box>

          <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-end' }}>
            <TextField 
              fullWidth size="small" 
              placeholder="Type internal staff note here... (e.g. client requested billing extension, pet was aggressive during physical exam)" 
              value={newNote} onChange={(e) => setNewNote(e.target.value)} 
              sx={{ 
                bgcolor: COLORS.cardBg, 
                '& .MuiOutlinedInput-root': { 
                  borderRadius: 0, 
                  fontFamily: FONT,
                  border: `2px solid ${COLORS.brand}`,
                  '&.Mui-focused fieldset': { borderColor: COLORS.brand, borderWidth: 2 }
                } 
              }} 
              multiline rows={3} 
            />
            <Button 
              variant="contained" 
              onClick={onAdd} 
              disabled={!newNote.trim()} 
              sx={{ 
                bgcolor: COLORS.accent, 
                color: COLORS.brand,
                fontFamily: FONT, 
                height: 80, // Match height of 3-row textarea approximately
                px: 4, 
                fontWeight: 900, 
                borderRadius: 0,
                border: `2px solid ${COLORS.brand}`,
                boxShadow: `6px 6px 0px ${COLORS.brand}`,
                '&:hover': { bgcolor: COLORS.brand, color: '#fff', boxShadow: 'none', transform: 'translate(2px, 2px)' },
                '&.Mui-disabled': { bgcolor: COLORS.borderLight, border: `2px solid ${COLORS.border}`, boxShadow: 'none', color: COLORS.textMuted }
              }}
            >
              POST LOG
            </Button>
          </Box>
        </Box>
      </Paper>

      {/* Log List */}
      {notes.length === 0 ? (
        <Box sx={{ py: 10, textAlign: 'center', border: `2px dashed ${COLORS.border}`, bgcolor: 'rgba(0,0,0,0.02)' }}>
          <Typography sx={{ fontFamily: FONT, color: COLORS.textMuted, fontWeight: 800, textTransform: 'uppercase', fontSize: '0.8rem' }}>
            No internal logs found for this client.
          </Typography>
        </Box>
      ) : (
        <List sx={{ p: 0 }}>
          {[...notes].reverse().map((note, i) => {
            const catColor = getCatColor(note.category);
            return (
              <Paper 
                key={note.id || i} 
                elevation={0} 
                sx={{ 
                  mb: 3, p: 3, 
                  borderRadius: 0,
                  border: `2px solid ${COLORS.brand}`, 
                  borderLeft: `8px solid ${catColor}`, 
                  bgcolor: COLORS.cardBg, 
                  display: 'flex', 
                  justifyContent: 'space-between',
                  boxShadow: `4px 4px 0px rgba(0,0,0,0.05)`,
                  position: 'relative'
                }}
              >
                <Box sx={{ flex: 1, pr: 4 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1.5 }}>
                    <Chip 
                      label={note.category} 
                      size="small" 
                      sx={{ 
                        height: 22, 
                        fontSize: '0.65rem', 
                        fontFamily: FONT, 
                        fontWeight: 900, 
                        borderRadius: 0,
                        bgcolor: catColor, 
                        color: '#fff',
                        textTransform: 'uppercase',
                        letterSpacing: 0.5
                      }} 
                    />
                    <Typography variant="caption" sx={{ fontFamily: FONT, color: COLORS.textMuted, fontWeight: 800, fontSize: '0.7rem' }}>
                      {new Date(note.date).toLocaleString()} • LOGGED BY: {note.staff.toUpperCase()}
                    </Typography>
                  </Box>
                  <Typography variant="body1" sx={{ fontFamily: FONT, color: COLORS.textPrimary, whiteSpace: 'pre-wrap', lineHeight: 1.6, fontWeight: 500, fontSize: '0.9rem' }}>
                    {note.text}
                  </Typography>
                </Box>
                <IconButton 
                  size="small" 
                  sx={{ 
                    color: COLORS.danger, 
                    alignSelf: 'flex-start',
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: 0,
                    '&:hover': { bgcolor: COLORS.danger, color: '#fff', borderColor: COLORS.danger }
                  }} 
                  onClick={() => onDelete(note.id)}
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Paper>
            );
          })}
        </List>
      )}
    </Box>
  );
}