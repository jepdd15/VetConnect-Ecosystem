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
    <Box sx={{ p: 4, bgcolor: 'transparent', flexGrow: 1 }}>
      <Typography variant="h6" sx={{ fontFamily: FONT, fontWeight: 900, color: COLORS.accent, mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
        <EventNoteIcon sx={{ color: COLORS.accentWarm }} /> Internal Staff Logs
      </Typography>
      
      {/* Input Area */}
      <Paper elevation={0} sx={{ p: 2, mb: 4, ...PANEL.elevated }}>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
          <TextField select size="small" label="Category" value={category} onChange={(e) => setCategory(e.target.value)} sx={{ minWidth: 150, fontFamily: FONT, bgcolor: COLORS.cardBg, '& .MuiOutlinedInput-root': { fontFamily: FONT } }}>
            <MenuItem value="General">General</MenuItem>
            <MenuItem value="Financial">Financial</MenuItem>
            <MenuItem value="Behavioral">Behavioral</MenuItem>
            <MenuItem value="Medical">Medical</MenuItem>
          </TextField>
          <TextField fullWidth size="small" label="Log Entry" placeholder="Add detailed internal note..." value={newNote} onChange={(e) => setNewNote(e.target.value)} sx={{ bgcolor: COLORS.cardBg, '& .MuiOutlinedInput-root': { fontFamily: FONT } }} multiline rows={2} />
          <Button variant="contained" onClick={onAdd} disabled={!newNote.trim()} sx={{ bgcolor: COLORS.accentWarm, fontFamily: FONT, height: 40, px: 3, fontWeight: 'bold', '&:hover': { bgcolor: COLORS.accent } }}>Log</Button>
        </Box>
      </Paper>

      {/* Log List */}
      {notes.length === 0 ? (
        <Typography sx={{ textAlign: 'center', fontFamily: FONT, color: COLORS.textMuted, fontStyle: 'italic', mt: 4 }}>No internal logs found for this client.</Typography>
      ) : (
        <List sx={{ p: 0 }}>
          {[...notes].reverse().map((note, i) => {
            const catColor = getCatColor(note.category);
            return (
              <Paper key={note.id || i} elevation={0} sx={{ mb: 2, p: 2.5, borderLeft: `5px solid ${catColor}`, bgcolor: COLORS.cardBg, display: 'flex', justifyContent: 'space-between', borderRadius: 0, border: `1px solid ${COLORS.borderLight}` }}>
                <Box sx={{ flex: 1, pr: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
                    <Chip label={note.category} size="small" sx={{ height: 20, fontSize: '0.65rem', fontFamily: FONT, fontWeight: 'bold', bgcolor: `${catColor}1A`, color: catColor, border: `1px solid ${catColor}44` }} />
                    <Typography variant="caption" sx={{ fontFamily: FONT, color: COLORS.textMuted, fontWeight: 'bold' }}>{new Date(note.date).toLocaleString()} • Logged by: {note.staff}</Typography>
                  </Box>
                  <Typography variant="body1" sx={{ fontFamily: FONT, color: COLORS.textPrimary, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{note.text}</Typography>
                </Box>
                <IconButton size="small" sx={{ color: COLORS.danger, alignSelf: 'flex-start' }} onClick={() => onDelete(note.id)}>
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