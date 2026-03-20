import React from 'react';
import { Box, Typography, Paper, TextField, Button, List, IconButton, Chip } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import MenuItem from '@mui/material/MenuItem';
import EventNoteIcon from '@mui/icons-material/EventNote';

export default function InternalLogs({ notes, newNote, setNewNote, category, setCategory, onAdd, onDelete }) {
  return (
    <Box sx={{ p: 4, bgcolor: 'transparent', flexGrow: 1 }}>
      <Typography variant="h6" fontWeight="bold" color="#5D4037" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
        <EventNoteIcon /> Internal Staff Logs
      </Typography>
      
      {/* Input Area */}
      <Paper elevation={0} sx={{ p: 2, mb: 4, bgcolor: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(10px)', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 2 }}>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
          <TextField select size="small" label="Category" value={category} onChange={(e) => setCategory(e.target.value)} sx={{ minWidth: 150, bgcolor: 'white' }}>
            <MenuItem value="General">General</MenuItem>
            <MenuItem value="Financial">Financial</MenuItem>
            <MenuItem value="Behavioral">Behavioral</MenuItem>
            <MenuItem value="Medical">Medical</MenuItem>
          </TextField>
          <TextField fullWidth size="small" label="Log Entry" placeholder="Add detailed internal note..." value={newNote} onChange={(e) => setNewNote(e.target.value)} sx={{ bgcolor: 'white' }} multiline rows={2} />
          <Button variant="contained" onClick={onAdd} disabled={!newNote.trim()} sx={{ bgcolor: '#8B4513', height: 40, px: 3, fontWeight: 'bold' }}>Log</Button>
        </Box>
      </Paper>

      {/* Log List */}
      {notes.length === 0 ? (
        <Typography sx={{ textAlign: 'center', color: '#888', fontStyle: 'italic', mt: 4 }}>No internal logs found for this client.</Typography>
      ) : (
        <List sx={{ p: 0 }}>
          {/* Render notes from newest to oldest */}
          {[...notes].reverse().map((note, i) => {
            let catColor = 'default';
            if(note.category === 'Medical') catColor = 'primary';
            if(note.category === 'Financial') catColor = 'success';
            if(note.category === 'Behavioral') catColor = 'warning';

            return (
              <Paper key={note.id || i} elevation={0} sx={{ mb: 2, p: 2.5, borderLeft: '5px solid', borderColor: `${catColor}.main`, bgcolor: 'rgba(255,255,255,0.8)', backdropFilter: 'blur(5px)', display: 'flex', justifyContent: 'space-between', borderRadius: 2, borderTop: '1px solid #eee', borderRight: '1px solid #eee', borderBottom: '1px solid #eee' }}>
                <Box sx={{ flex: 1, pr: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
                    <Chip label={note.category} size="small" color={catColor} sx={{ height: 20, fontSize: '0.65rem', fontWeight: 'bold' }} />
                    <Typography variant="caption" color="textSecondary" fontWeight="bold">{new Date(note.date).toLocaleString()} • Logged by: {note.staff}</Typography>
                  </Box>
                  <Typography variant="body1" sx={{ color: '#333', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{note.text}</Typography>
                </Box>
                <IconButton size="small" color="error" onClick={() => onDelete(note.id)} sx={{ alignSelf: 'flex-start' }}>
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