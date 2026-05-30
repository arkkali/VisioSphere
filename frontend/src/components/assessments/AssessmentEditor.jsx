import React from 'react';
import { Box, Button, Paper, TextField, Typography } from '@mui/material';
import BlockEditor from './BlockEditor';
import TagInput from './TagInput';

const PREDEFINED_TAGS = [
  'Routine Vitals',
  'Fall Incident',
  'Agitation/Pacing',
  'Medication Adjustment',
  'Dietary Note',
  'General Observation',
  'Physician Visit',
];

const AssessmentEditor = ({
  isDark,
  editingId,
  reportTitle,
  reportTags,
  blocks,
  onTitleChange,
  onTagsChange,
  onBlockUpdate,
  onBlockFileUploaded,
  onAddBlock,
  onRemoveBlock,
  onSave,
  onCancel,
  onToast,
}) => {
  return (
    <Paper
      elevation={0}
      sx={{
        borderRadius: 4,
        border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`,
        overflow: 'hidden',
        backgroundColor: isDark ? '#1e293b' : '#fff',
        boxShadow: isDark ? '0 10px 40px rgba(0,0,0,0.5)' : '0 10px 40px rgba(0,0,0,0.05)',
      }}
    >
      <Box
        sx={{
          p: { xs: 3, md: 4 },
          borderBottom: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`,
          display: 'flex',
          flexDirection: { xs: 'column', md: 'row' },
          justifyContent: 'space-between',
          alignItems: { xs: 'flex-start', md: 'center' },
          gap: 3,
          backgroundColor: isDark ? '#1e293b' : '#fff',
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0, mr: { md: 2 }, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TextField
            variant="standard"
            placeholder="Enter Official Report Title..."
            value={reportTitle}
            onChange={(e) => onTitleChange(e.target.value)}
            InputProps={{
              disableUnderline: true,
              sx: { fontSize: { xs: '1.8rem', md: '2.2rem' }, fontWeight: 900, color: isDark ? '#fff' : '#00212e' },
            }}
            sx={{
              '& .MuiInputBase-input': { color: isDark ? '#fff' : '#00212e' },
              '& .MuiInputBase-input::placeholder': { color: isDark ? '#475569' : '#94a3b8', opacity: 1 },
            }}
          />
          <TagInput tags={reportTags} onChange={onTagsChange} suggestions={PREDEFINED_TAGS} isDark={isDark} />
        </Box>

        <Box sx={{ display: 'flex', gap: 2, width: { xs: '100%', md: 'auto' }, flexShrink: 0 }}>
          <Button
            variant="outlined"
            onClick={onCancel}
            sx={{ flex: { xs: 1, md: 'none' }, py: 1.5, px: 3, borderRadius: 2, fontWeight: 800, textTransform: 'none', color: isDark ? '#cbd5e1' : '#64748b', borderColor: isDark ? '#475569' : '#cbd5e1', '&:hover': { borderColor: isDark ? '#94a3b8' : '#94a3b8', backgroundColor: isDark ? '#0f172a' : '#f8fafc' } }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={onSave}
            sx={{ flex: { xs: 1, md: 'none' }, py: 1.5, px: 4, borderRadius: 2, fontWeight: 800, textTransform: 'none', backgroundColor: isDark ? '#059669' : '#10b981', color: '#fff', boxShadow: isDark ? '0 4px 12px rgba(0,0,0,0.4)' : '0 4px 12px rgba(16,185,129,0.25)', whiteSpace: 'nowrap', '&:hover': { backgroundColor: isDark ? '#047857' : '#059669', transform: 'translateY(-2px)', boxShadow: isDark ? '0 6px 16px rgba(0,0,0,0.6)' : '0 6px 16px rgba(16,185,129,0.35)' } }}
          >
            {editingId ? 'Update Record' : 'Save & Publish'}
          </Button>
        </Box>
      </Box>

      <Box sx={{ p: { xs: 3, md: 5 }, minHeight: 500, backgroundColor: isDark ? '#0f172a' : '#f8fafc', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {blocks.length === 0 && (
          <Box sx={{ textAlign: 'center', py: 10 }}>
            <Typography variant="h5" sx={{ color: isDark ? '#fff' : '#00435c', fontWeight: 800, mb: 1 }}>Blank Document</Typography>
            <Typography sx={{ color: isDark ? '#94a3b8' : '#64748b' }}>Select a specialized module below to begin building your report.</Typography>
          </Box>
        )}

        {blocks.map((block) => (
          <Paper
            key={block.id}
            elevation={0}
            sx={{
              border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`,
              borderRadius: 3,
              overflow: 'hidden',
              transition: 'all 0.2s',
              '&:hover': { borderColor: isDark ? '#38bdf8' : '#00a8e8', boxShadow: isDark ? '0 8px 24px rgba(0,0,0,0.5)' : '0 8px 24px rgba(0,168,232,0.1)' },
              '&:focus-within': { borderColor: isDark ? '#38bdf8' : '#00a8e8', boxShadow: isDark ? '0 8px 24px rgba(0,0,0,0.6)' : '0 8px 24px rgba(0,168,232,0.15)' },
              backgroundColor: isDark ? '#1e293b' : '#fff',
            }}
          >
            <Box sx={{ p: 2, px: 3, borderBottom: `1px solid ${isDark ? '#334155' : '#f1f5f9'}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: isDark ? '#1e293b' : '#fff' }}>
              <Typography sx={{ fontSize: '0.75rem', fontWeight: 800, color: isDark ? '#38bdf8' : '#00a8e8', letterSpacing: '1px', textTransform: 'uppercase' }}>
                {block.type} Module
              </Typography>
              <Button
                onClick={() => onRemoveBlock(block.id)}
                sx={{ minWidth: 0, p: 0.5, color: isDark ? '#64748b' : '#94a3b8', '&:hover': { color: isDark ? '#f43f5e' : '#e11d48', backgroundColor: 'transparent' } }}
              >
                <Typography sx={{ fontSize: '1.5rem', lineHeight: 1 }}>&times;</Typography>
              </Button>
            </Box>
            <Box sx={{ p: 3, backgroundColor: isDark ? '#1e293b' : '#fff' }}>
              <BlockEditor
                block={block}
                isDark={isDark}
                onUpdate={onBlockUpdate}
                onFileUploaded={onBlockFileUploaded}
                onToast={onToast}
              />
            </Box>
          </Paper>
        ))}

        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, pt: 4 }}>
          <Typography sx={{ fontWeight: 800, color: isDark ? '#64748b' : '#64748b', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '1px' }}>
            Append Module
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', justifyContent: 'center' }}>
            {['text', 'checklist', 'chart', 'image', 'file'].map((type) => (
              <Button
                key={type}
                variant="outlined"
                onClick={() => onAddBlock(type)}
                sx={{ py: 1.5, px: 3, borderRadius: 2, fontWeight: 800, textTransform: 'none', color: isDark ? '#e2e8f0' : '#003543', borderColor: isDark ? '#475569' : '#cbd5e1', '&:hover': { color: isDark ? '#fff' : '#00a8e8', borderColor: isDark ? '#38bdf8' : '#00a8e8', backgroundColor: isDark ? '#1e293b' : '#f0f9ff', transform: 'translateY(-2px)' } }}
              >
                {type === 'text' && 'Notes / Text'}
                {type === 'checklist' && 'Checklist'}
                {type === 'chart' && 'Vitals Chart'}
                {type === 'image' && 'Attach Image'}
                {type === 'file' && 'Upload File'}
              </Button>
            ))}
          </Box>
        </Box>
      </Box>
    </Paper>
  );
};

export default AssessmentEditor;