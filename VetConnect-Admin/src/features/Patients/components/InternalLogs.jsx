import React from 'react';
import { Box, Typography, Paper, TextField, Button, List, IconButton, Chip } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import MenuItem from '@mui/material/MenuItem';

export default function InternalLogs({ notes, newNote, setNewNote, category, setCategory, onAdd, onDelete }) {
  return (
    <Box sx={{ p: 4, bgcolor: 'white', flexGrow: 1 }}>
      <Typography variant="h6" fontWeight="bold" color="#5D4037" sx={{ mb: 2 }}>Internal Staff Log</Typography>
      <Box sx={{ display: 'flex', gap: 1, mb: 4 }}>
        <TextField select size="small" value={category} onChange={(e) => setCategory(e.target.value)} sx={{ minWidth: 150 }}>
          <MenuItem value="General">General</MenuItem>
          <MenuItem value="Financial">Financial</MenuItem>
          <MenuItem value="Behavioral">Behavioral</MenuItem>
          <MenuItem value="Medical">Medical</MenuItem>
        </TextField>
        <TextField fullWidth size="small" placeholder="Add detailed note..." value={newNote} onChange={(e) => setNewNote(e.target.value)} />
        <Button variant="contained" onClick={onAdd} sx={{ bgcolor: '#8B4513' }}>Log</Button>
      </Box>
      <List>
        {notes.slice().reverse().map((note, i) => (
          <Paper key={note.id || i} variant="outlined" sx={{ mb: 1.5, p: 2, borderLeft: '5px solid #8B4513', display: 'flex', justifyContent: 'space-between' }}>
            <Box>
              <Chip label={note.category} size="small" sx={{ mb: 1, height: 18, fontSize: '0.6rem' }} />
              <Typography variant="body2">{note.text}</Typography>
              <Typography variant="caption" color="textSecondary">{new Date(note.date).toLocaleString()} • {note.staff}</Typography>
            </Box>
            <IconButton size="small" color="error" onClick={() => onDelete(note.id)}><DeleteIcon fontSize="small" /></IconButton>
          </Paper>
        ))}
      </List>
    </Box>
  );
}