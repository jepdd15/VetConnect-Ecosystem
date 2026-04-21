import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ArchiveOutlinedIcon from '@mui/icons-material/ArchiveOutlined';
import UnarchiveOutlinedIcon from '@mui/icons-material/UnarchiveOutlined';

/**
 * Shared action type configuration for service audit log components.
 * Used by ServiceActivityLog (global) and ServiceLogModal (per-service).
 *
 * Extracting to a shared file ensures both components stay in sync on
 * label copy, color tokens, and icon assignments.
 */
export const SERVICE_ACTION_CONFIG = {
  CREATED:  { label: 'Created',  color: '#1565C0', bg: '#EFF6FF', Icon: AddCircleOutlineIcon },
  UPDATED:  { label: 'Updated',  color: '#7B1FA2', bg: '#F3E8FF', Icon: EditOutlinedIcon },
  ARCHIVED: { label: 'Archived', color: '#E65100', bg: '#FFF3E0', Icon: ArchiveOutlinedIcon },
  RESTORED: { label: 'Restored', color: '#2E7D32', bg: '#F0FDF4', Icon: UnarchiveOutlinedIcon },
  DELETED:  { label: 'Deleted',  color: '#C62828', bg: '#FEF2F2', Icon: DeleteOutlineIcon },
};
