import React from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  Paper,
  TextField,
  Typography,
} from '@mui/material';
import BlockReadonly from './BlockReadonly';

const EMOJI_MAP = {
  heart: '❤️',
  thumbsUp: '👍',
  acknowledged: '😊',
};

const AssessmentCard = ({
  assessment,
  isDark,
  isExpanded,
  isNurseView,
  commentText,
  onToggle,
  onCommentChange,
  onSendComment,
  onEditClick,
  onDeleteClick,
}) => {
  const req = assessment;

  const renderInteractions = () => {
    if (isExpanded) return null;
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mt: 2 }}>
        {req.reactions && Object.values(req.reactions).some((v) => v) && (
          <Box sx={{ display: 'flex', gap: 1 }}>
            {Object.entries(req.reactions).map(([key, value]) =>
              value && EMOJI_MAP[key] ? (
                <Chip key={key} label={EMOJI_MAP[key]} size="small" sx={{ backgroundColor: isDark ? '#1e293b' : '#f0f9ff', border: `1px solid ${isDark ? '#334155' : '#bae6fd'}`, fontSize: '1rem' }} />
              ) : null
            )}
          </Box>
        )}
        {req.comments && req.comments.length > 0 && (
          <Box sx={{ mt: 1, p: 1.5, backgroundColor: isDark ? 'rgba(30, 41, 59, 0.5)' : '#f8fafc', borderRadius: 2, borderLeft: `4px solid ${isDark ? '#475569' : '#cbd5e1'}` }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5, flexWrap: 'wrap', gap: 1 }}>
              <Typography sx={{ fontSize: '13px', fontWeight: 700, color: isDark ? '#fff' : '#0f172a' }}>
                {req.comments[req.comments.length - 1].senderName}
                <Typography component="span" sx={{ fontSize: '11px', color: isDark ? '#94a3b8' : '#64748b', ml: 1 }}>
                  ({req.comments[req.comments.length - 1].senderRole})
                </Typography>
              </Typography>
              <Typography sx={{ fontSize: '11px', color: isDark ? '#64748b' : '#94a3b8', fontWeight: 600 }}>
                {req.comments[req.comments.length - 1].createdAt || req.comments[req.comments.length - 1].date
                  ? new Date(req.comments[req.comments.length - 1].createdAt || req.comments[req.comments.length - 1].date).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
                  : ''}
              </Typography>
            </Box>
            <Typography sx={{ fontSize: '13px', color: isDark ? '#cbd5e1' : '#475569', fontStyle: 'italic' }}>
              "{req.comments[req.comments.length - 1].text}"
            </Typography>
          </Box>
        )}
      </Box>
    );
  };

  return (
    <Card
      elevation={isExpanded ? 8 : 0}
      sx={{
        border: '1px solid',
        borderColor: isExpanded ? '#00a8e8' : isDark ? '#334155' : '#e2e8f0',
        backgroundColor: isDark ? '#1e293b' : '#fff',
        borderRadius: 3,
        transition: 'all 0.2s ease',
        cursor: 'pointer',
        '&:hover': { transform: 'translateY(-4px)', boxShadow: isDark ? '0 12px 24px rgba(0,0,0,0.5)' : '0 12px 24px rgba(0,0,0,0.05)', borderColor: isDark ? '#475569' : '#cbd5e1' },
      }}
    >
      <CardContent sx={{ p: 3, '&:last-child': { pb: 3 } }}>
        <Box onClick={onToggle} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
          <Box sx={{ pr: 2 }}>
            <Typography variant="h6" sx={{ color: isDark ? '#fff' : '#00212e', fontWeight: 800, mb: 1, lineHeight: 1.3, wordBreak: 'break-word' }}>
              {req.title}
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1.5 }}>
              <Chip
                label={new Date(req.createdAt || req.date).toLocaleDateString()}
                size="small"
                sx={{ backgroundColor: isDark ? 'rgba(2, 132, 199, 0.2)' : '#e1f5fe', color: isDark ? '#38bdf8' : '#0284c7', fontWeight: 800, borderRadius: 1.5 }}
              />
              {req.tags && req.tags.map((tag, i) => (
                <Chip key={i} label={tag} size="small" sx={{ backgroundColor: isDark ? '#334155' : '#f1f5f9', color: isDark ? '#cbd5e1' : '#475569', fontWeight: 700, borderRadius: 1.5 }} />
              ))}
            </Box>
          </Box>
          <Chip
            label={isExpanded ? 'Close ▴' : 'View ▾'}
            size="small"
            sx={{ backgroundColor: isDark ? '#334155' : '#f1f5f9', color: isDark ? '#cbd5e1' : '#475569', fontWeight: 700, cursor: 'pointer', '&:hover': { backgroundColor: isDark ? '#475569' : '#e2e8f0' } }}
          />
        </Box>

        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 2 }}>
          <Typography sx={{ fontSize: '0.85rem', color: isDark ? '#94a3b8' : '#64748b', fontWeight: 600 }}>By: {req.authorName}</Typography>
          <Typography sx={{ fontSize: '0.85rem', color: isDark ? '#94a3b8' : '#64748b', fontWeight: 600 }}>Blocks: {req.blocks?.length || 0}</Typography>
          <Typography sx={{ fontSize: '0.85rem', color: isDark ? '#94a3b8' : '#64748b', fontWeight: 600 }}>Comments: {req.comments?.length || 0}</Typography>
        </Box>

        {renderInteractions()}

        {isExpanded && (
          <Box sx={{ mt: 3, pt: 3, borderTop: `1px solid ${isDark ? '#334155' : '#e2e8f0'}` }}>
            <Paper elevation={0} sx={{ backgroundColor: isDark ? '#0f172a' : '#f8fafc', p: 2.5, borderRadius: 3, border: `1px solid ${isDark ? '#1e293b' : '#f1f5f9'}`, mb: 3 }}>
              <Typography variant="subtitle1" sx={{ color: isDark ? '#fff' : '#00212e', fontWeight: 800, mb: 2 }}>Report Content</Typography>
              {!req.blocks || req.blocks.length === 0 ? (
                <Typography sx={{ color: isDark ? '#64748b' : '#94a3b8', fontStyle: 'italic' }}>No data blocks were added.</Typography>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {req.blocks.map((block, idx) => (
                    <Box key={idx}>
                      <Typography sx={{ fontSize: '0.7rem', color: isDark ? '#94a3b8' : '#64748b', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 800, mb: 1 }}>
                        {block.type}
                      </Typography>
                      <BlockReadonly block={block} isDark={isDark} />
                    </Box>
                  ))}
                </Box>
              )}
            </Paper>

            <Box sx={{ mb: 3 }}>
              <Typography variant="subtitle1" sx={{ color: isDark ? '#fff' : '#00212e', fontWeight: 800, mb: 1.5 }}>Reactions</Typography>
              <Box sx={{ display: 'flex', gap: 1 }}>
                {req.reactions && Object.values(req.reactions).some((v) => v) ? (
                  Object.entries(req.reactions).map(([key, value]) =>
                    value && EMOJI_MAP[key] ? (
                      <Chip key={key} label={EMOJI_MAP[key]} sx={{ backgroundColor: isDark ? '#1e293b' : '#f0f9ff', border: `1px solid ${isDark ? '#334155' : '#bae6fd'}`, fontSize: '1.2rem', p: 1 }} />
                    ) : null
                  )
                ) : (
                  <Typography sx={{ color: isDark ? '#64748b' : '#94a3b8', fontSize: '0.9rem' }}>No guardian reactions yet.</Typography>
                )}
              </Box>
            </Box>

            <Box sx={{ mb: 3 }}>
              <Typography variant="subtitle1" sx={{ color: isDark ? '#fff' : '#00212e', fontWeight: 800, mb: 1.5 }}>Communication Log</Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mb: 2, maxHeight: '300px', overflowY: 'auto', pr: 1 }}>
                {req.comments && req.comments.length > 0 ? (
                  [...req.comments].reverse().map((c, i) => (
                    <Paper
                      key={i}
                      elevation={0}
                      sx={{
                        p: 2,
                        borderRadius: 3,
                        borderLeft: '4px solid',
                        borderColor: c.senderRole === 'Guardian' ? '#3b82f6' : '#10b981',
                        backgroundColor: c.senderRole === 'Guardian' ? (isDark ? 'rgba(59, 130, 246, 0.1)' : '#eff6ff') : (isDark ? 'rgba(16, 185, 129, 0.1)' : '#f0fdf4'),
                      }}
                    >
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1, flexWrap: 'wrap', gap: 1 }}>
                        <Typography sx={{ fontWeight: 700, color: isDark ? '#fff' : '#0f172a' }}>
                          {c.senderName}
                          <Typography component="span" sx={{ fontSize: '0.8rem', color: isDark ? '#94a3b8' : '#64748b', fontWeight: 400 }}> ({c.senderRole})</Typography>
                        </Typography>
                        <Typography sx={{ fontSize: '0.75rem', color: isDark ? '#64748b' : '#94a3b8', fontWeight: 600 }}>
                          {c.createdAt || c.date ? new Date(c.createdAt || c.date).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }) : ''}
                        </Typography>
                      </Box>
                      <Typography sx={{ color: isDark ? '#cbd5e1' : '#334155', fontSize: '0.9rem', lineHeight: 1.5 }}>{c.text}</Typography>
                    </Paper>
                  ))
                ) : (
                  <Typography sx={{ color: isDark ? '#64748b' : '#94a3b8', fontSize: '0.9rem' }}>No comments recorded.</Typography>
                )}
              </Box>

              <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 1.5 }}>
                <TextField
                  fullWidth
                  size="small"
                  placeholder="Type an official reply to the Guardian..."
                  value={commentText}
                  onChange={(e) => onCommentChange(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && onSendComment()}
                  sx={{ backgroundColor: isDark ? '#0f172a' : '#fff', '& .MuiOutlinedInput-root': { borderRadius: 2 }, '& .MuiOutlinedInput-notchedOutline': { borderColor: isDark ? '#334155' : 'rgba(0, 0, 0, 0.23)' }, '& .MuiInputBase-input': { color: isDark ? '#fff' : 'inherit' } }}
                />
                <Button
                  variant="contained"
                  onClick={onSendComment}
                  sx={{ backgroundColor: isDark ? '#0284c7' : '#00a8e8', color: '#fff', fontWeight: 800, textTransform: 'none', borderRadius: 2, px: 3, flexShrink: 0, boxShadow: 'none', '&:hover': { backgroundColor: isDark ? '#0369a1' : '#0088b8', boxShadow: 'none' } }}
                >
                  Reply
                </Button>
              </Box>
            </Box>

            <Divider sx={{ my: 3, borderColor: isDark ? '#334155' : 'rgba(0, 0, 0, 0.12)' }} />

            <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, justifyContent: 'flex-end', gap: 1.5 }}>
              <Button
                variant="outlined"
                onClick={onEditClick}
                sx={{ color: isDark ? '#cbd5e1' : '#475569', borderColor: isDark ? '#475569' : '#cbd5e1', fontWeight: 700, textTransform: 'none', borderRadius: 2, '&:hover': { backgroundColor: isDark ? '#1e293b' : '#f8fafc', borderColor: isDark ? '#94a3b8' : '#94a3b8' } }}
              >
                Edit Report Data
              </Button>
              {!isNurseView && (
                <Button
                  variant="contained"
                  color="error"
                  onClick={onDeleteClick}
                  sx={{ fontWeight: 700, textTransform: 'none', borderRadius: 2, backgroundColor: isDark ? '#be123c' : '#e11d48', boxShadow: 'none', '&:hover': { backgroundColor: isDark ? '#9f1239' : '#be123c', boxShadow: 'none' } }}
                >
                  Delete Permanently
                </Button>
              )}
            </Box>
          </Box>
        )}
      </CardContent>
    </Card>
  );
};

export default AssessmentCard;