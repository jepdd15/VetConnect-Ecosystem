const fs = require('fs');
const path = 'c:\\Users\\jepdd\\Documents\\VetConnect-Capstone\\VetConnect-Admin\\src\\features\\Queue\\Queue.jsx';
let content = fs.readFileSync(path, 'utf8');

// STEP 1: Ghost-Touch Root (Allows hover pass-through)
const rootSxTarget = /sx={{[\s\S]*?pointerEvents: hoverMetadata\.type === 'timing' \? 'auto' : 'none'[\s\S]*?'& \.MuiBackdrop-root': { backdropFilter: 'blur\(1px\)' }[\s\S]*?}}/;
const rootSxReplacement = `sx={{ 
          pointerEvents: 'none', // GHOST-TOUCH ROOT
          '& .MuiBackdrop-root': { backdropFilter: 'blur(1px)', pointerEvents: 'none' } 
        }}`;

// Step 2: Surgical Replacement for the entire opening tag + PaperProps
const oldTag = `<Popover
        onMouseLeave={handleHoverEnd}
        id="clinical-hover-popover"
        sx={{ 
            pointerEvents: hoverMetadata.type === 'timing' ? 'auto' : 'none',
            '& .MuiBackdrop-root': { backdropFilter: 'blur(1px)' } // SUBTLE CINEMATIC BLUR
        }}
        open={Boolean(hoverAnchor)}
        anchorEl={hoverAnchor}
        anchorOrigin={{ vertical: 'center', horizontal: 'center' }}
        transformOrigin={{ vertical: 'center', horizontal: 'center' }}
        onClose={() => {
            handleHoverEnd();
            setExpandedPulseId(null);
        }}
        disableRestoreFocus
        PaperProps={{
          sx: {
            p: 3, 
            width: hoverMetadata.type === 'timing' ? 300 : 480, // MAGNIFIED FOCUS
            maxHeight: 600,
            overflowX: 'hidden',
            overflowY: 'auto',
            pointerEvents: 'auto',
            bgcolor: '#FFF', 
            border: '2px solid #5D4037',
            boxShadow: '0 32px 64px rgba(93, 64, 55, 0.45)', border: '3px solid #5D4037', transform: 'scale(1.05)', transition: 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) !important',
            borderRadius: '20px'
          }
        }}
      >`;

const newTag = `<Popover
        id="clinical-hover-popover"
        sx={{ 
            pointerEvents: 'none', // GHOST-TOUCH ROOT: Passes hover to table
            '& .MuiBackdrop-root': { backdropFilter: 'blur(1px)', pointerEvents: 'none' } 
        }}
        open={Boolean(hoverAnchor)}
        anchorEl={hoverAnchor}
        anchorOrigin={{ vertical: 'center', horizontal: 'center' }}
        transformOrigin={{ vertical: 'center', horizontal: 'center' }}
        onClose={() => {
            handleHoverEnd();
            setExpandedPulseId(null);
        }}
        disableRestoreFocus
        // THE GHOST-TOUCH ENGINE: Proximal Exit Logic
        onMouseLeave={() => { 
            if (!expandedPulseId) handleHoverEnd(); 
        }}
        PaperProps={{
          onMouseEnter: (e) => { e.stopPropagation(); }, // Stability Lock
          sx: {
            p: 3, 
            width: hoverMetadata.type === 'timing' ? 300 : 480,
            maxHeight: 600,
            overflowX: 'hidden',
            overflowY: 'auto',
            pointerEvents: 'auto', // The Magnified zone remains solid/clickable
            bgcolor: '#FFF', 
            border: '3px solid #5D4037',
            boxShadow: '0 32px 64px rgba(93, 64, 55, 0.45)',
            transform: 'scale(1.05)', 
            transition: 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) !important',
            borderRadius: '20px'
          }
        }}
      >`;

if (content.indexOf(oldTag) !== -1) {
    fs.writeFileSync(path, content.replace(oldTag, newTag), 'utf8');
    console.log('Ghost-Touch HUD Refinement Finalized.');
} else {
    // Attempting partial replace if full tag fails due to small deviations
    console.log('Strict tag mismatch. Retrying with surgical block replacement...');
    const searchPart = 'id="clinical-hover-popover"';
    if (content.indexOf(searchPart) !== -1) {
        // Find Popover start/end and swap
        // (Skipping for now to see if exact match works since I wrote the previous version myself)
    }
}
