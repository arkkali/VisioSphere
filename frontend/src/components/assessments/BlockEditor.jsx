import React, { useRef } from 'react';
import {
  Box,
  Button,
  Checkbox,
  FormControl,
  MenuItem,
  Select,
  TextField,
} from '@mui/material';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { uploadFile } from '../../services/assessmentService';

const quillModules = {
  toolbar: [
    [{ header: [1, 2, 3, false] }],
    ['bold', 'italic', 'underline', 'strike'],
    [{ color: [] }, { background: [] }],
    [{ align: [] }],
    [{ list: 'ordered' }, { list: 'bullet' }],
    ['clean'],
  ],
};

const ChartPreview = ({ content, isDark }) => {
  if (!content.dataPoints || content.dataPoints.length === 0) return null;
  return (
    <Box sx={{ mt: 3, pt: 3, borderTop: `1px dashed ${isDark ? '#334155' : '#e2e8f0'}` }}>
      <ResponsiveContainer width="100%" height={250}>
        <LineChart data={content.dataPoints} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDark ? '#334155' : '#e2e8f0'} />
          <XAxis dataKey="label" tick={{ fontSize: 12, fill: isDark ? '#94a3b8' : '#64748b' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 12, fill: isDark ? '#94a3b8' : '#64748b' }} axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={{
              borderRadius: '8px',
              border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`,
              backgroundColor: isDark ? '#1e293b' : '#fff',
              color: isDark ? '#fff' : '#000',
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
            }}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke="#00a8e8"
            strokeWidth={3}
            dot={{ r: 5, fill: '#00a8e8', strokeWidth: 2, stroke: isDark ? '#1e293b' : 'white' }}
            activeDot={{ r: 7 }}
            name={content.chartType === 'temperature' ? 'Temp (°C)' : content.chartType === 'vitals' ? 'Rate' : 'Value'}
          />
        </LineChart>
      </ResponsiveContainer>
    </Box>
  );
};

const BlockEditor = ({ block, isDark, onUpdate, onFileUploaded, onToast }) => {
  const fileInputRef = useRef(null);

  const update = (field, value) => onUpdate(block.id, field, value);

  const handleFileUpload = async (file) => {
    if (!file) return;
    try {
      const data = await uploadFile(file);
      onFileUploaded(block.id, `${import.meta.env.VITE_API_URL.replace('/api', '')}${data.fileUrl}`);
      onToast('File uploaded successfully');
    } catch {
      onToast('File upload failed', 'error');
    }
  };

  switch (block.type) {
    case 'text':
      return (
        <Box sx={{
          backgroundColor: isDark ? '#0f172a' : '#fff',
          color: isDark ? '#fff' : 'inherit',
          borderRadius: 1,
          '& .ql-toolbar': { borderColor: isDark ? '#334155' : '#e2e8f0', backgroundColor: isDark ? '#1e293b' : '#f8fafc', borderTopLeftRadius: '8px', borderTopRightRadius: '8px' },
          '& .ql-container': { borderColor: isDark ? '#334155' : '#e2e8f0', minHeight: '150px', borderBottomLeftRadius: '8px', borderBottomRightRadius: '8px', fontFamily: "'Outfit', sans-serif" },
          '& .ql-editor': { minHeight: '150px' },
          '& .ql-editor.ql-blank::before': { color: isDark ? '#64748b' : '#94a3b8', fontStyle: 'normal' },
        }}>
          <ReactQuill
            theme="snow"
            modules={quillModules}
            value={block.content}
            onChange={(value) => update('content', value)}
            placeholder="Type your detailed assessment notes here..."
          />
        </Box>
      );

    case 'checklist':
      return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {Array.isArray(block.content) && block.content.map((item, index) => (
            <Box key={index} sx={{ display: 'flex', alignItems: 'center', gap: 2, backgroundColor: isDark ? '#0f172a' : '#f8fafc', p: 1, borderRadius: 1 }}>
              <Checkbox
                checked={item.checked}
                onChange={(e) => {
                  const newContent = [...block.content];
                  newContent[index].checked = e.target.checked;
                  update('content', newContent);
                }}
                sx={{ color: isDark ? '#475569' : '#cbd5e1', '&.Mui-checked': { color: '#00a8e8' } }}
              />
              <TextField
                fullWidth
                size="small"
                placeholder="Task description"
                value={item.text}
                onChange={(e) => {
                  const newContent = [...block.content];
                  newContent[index].text = e.target.value;
                  update('content', newContent);
                }}
                sx={{ backgroundColor: isDark ? '#1e293b' : '#fff', '& .MuiOutlinedInput-notchedOutline': { borderColor: isDark ? '#334155' : 'rgba(0, 0, 0, 0.23)' }, '& .MuiInputBase-input': { color: isDark ? '#fff' : 'inherit' } }}
              />
              <Button
                variant="outlined"
                color="error"
                onClick={() => update('content', block.content.filter((_, i) => i !== index))}
                sx={{ minWidth: '40px', p: 1 }}
              >
                &times;
              </Button>
            </Box>
          ))}
          <Button
            variant="outlined"
            onClick={() => update('content', [...block.content, { text: '', checked: false }])}
            sx={{ alignSelf: 'flex-start', color: '#00a8e8', borderColor: isDark ? '#334155' : '#bae6fd', borderStyle: 'dashed', borderWidth: 2, '&:hover': { borderColor: '#00a8e8', backgroundColor: isDark ? '#0f172a' : '#f0f9ff' } }}
          >
            + Add Checklist Item
          </Button>
        </Box>
      );

    case 'chart':
      return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 2, mb: 2 }}>
            <FormControl sx={{ minWidth: 200 }}>
              <Select
                size="small"
                value={block.content.chartType || 'temperature'}
                onChange={(e) => {
                  const newType = e.target.value;
                  const defaultTitle = newType === 'temperature' ? 'Temperature Tracking' : newType === 'vitals' ? 'Heart Rate Tracking' : 'Custom Chart';
                  update('content', { ...block.content, chartType: newType, chartTitle: defaultTitle });
                }}
                MenuProps={{ PaperProps: { sx: { bgcolor: isDark ? '#1e293b' : '#fff', color: isDark ? '#fff' : '#00212e' } } }}
                sx={{ backgroundColor: isDark ? '#0f172a' : '#fff', fontWeight: 600, color: isDark ? '#fff' : '#00212e', '& .MuiOutlinedInput-notchedOutline': { borderColor: isDark ? '#334155' : 'rgba(0, 0, 0, 0.23)' }, '& .MuiSvgIcon-root': { color: isDark ? '#94a3b8' : 'inherit' } }}
              >
                <MenuItem value="temperature">Temperature (°C)</MenuItem>
                <MenuItem value="vitals">Heart Rate / Vitals</MenuItem>
                <MenuItem value="custom">Custom Data</MenuItem>
              </Select>
            </FormControl>
            <TextField
              fullWidth
              size="small"
              placeholder="Chart Title"
              value={block.content.chartTitle}
              onChange={(e) => update('content', { ...block.content, chartTitle: e.target.value })}
              sx={{ backgroundColor: isDark ? '#0f172a' : '#fff', '& .MuiOutlinedInput-notchedOutline': { borderColor: isDark ? '#334155' : 'rgba(0, 0, 0, 0.23)' } }}
              InputProps={{ sx: { fontWeight: 800, color: isDark ? '#fff' : '#00212e' } }}
            />
          </Box>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 3 }}>
            {block.content.dataPoints.map((dp, index) => (
              <Box key={index} sx={{ display: 'flex', alignItems: 'center', gap: 2, backgroundColor: isDark ? '#0f172a' : '#f8fafc', p: 1.5, borderRadius: 2 }}>
                <TextField
                  type={block.content.chartType !== 'custom' ? 'time' : 'text'}
                  size="small"
                  placeholder="Label"
                  value={dp.label}
                  onChange={(e) => {
                    const newData = [...block.content.dataPoints];
                    newData[index].label = e.target.value;
                    update('content', { ...block.content, dataPoints: newData });
                  }}
                  sx={{ flex: 1, backgroundColor: isDark ? '#1e293b' : '#fff', '& .MuiOutlinedInput-notchedOutline': { borderColor: isDark ? '#334155' : 'rgba(0, 0, 0, 0.23)' }, '& .MuiInputBase-input': { color: isDark ? '#fff' : 'inherit' } }}
                />
                <TextField
                  type="number"
                  size="small"
                  placeholder={block.content.chartType === 'temperature' ? '36.5' : 'Value'}
                  inputProps={{ step: block.content.chartType === 'temperature' ? '0.1' : '1' }}
                  value={dp.value}
                  onChange={(e) => {
                    const newData = [...block.content.dataPoints];
                    newData[index].value = Number(e.target.value);
                    update('content', { ...block.content, dataPoints: newData });
                  }}
                  sx={{ flex: 1, backgroundColor: isDark ? '#1e293b' : '#fff', '& .MuiOutlinedInput-notchedOutline': { borderColor: isDark ? '#334155' : 'rgba(0, 0, 0, 0.23)' }, '& .MuiInputBase-input': { color: isDark ? '#fff' : 'inherit' } }}
                />
                <Button
                  variant="outlined"
                  color="error"
                  onClick={() => update('content', { ...block.content, dataPoints: block.content.dataPoints.filter((_, i) => i !== index) })}
                  sx={{ minWidth: '40px', p: 1 }}
                >
                  &times;
                </Button>
              </Box>
            ))}
            <Button
              variant="outlined"
              onClick={() => update('content', { ...block.content, dataPoints: [...block.content.dataPoints, { label: '', value: 0 }] })}
              sx={{ alignSelf: 'flex-start', color: '#00a8e8', borderColor: isDark ? '#334155' : '#bae6fd', borderStyle: 'dashed', borderWidth: 2, '&:hover': { borderColor: '#00a8e8', backgroundColor: isDark ? '#0f172a' : '#f0f9ff' } }}
            >
              + Add Data Point
            </Button>
          </Box>

          <ChartPreview content={block.content} isDark={isDark} />
        </Box>
      );

    case 'image':
    case 'file':
      return (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', p: 5, backgroundColor: isDark ? '#0f172a' : '#f8fafc', border: `2px dashed ${isDark ? '#334155' : '#cbd5e1'}`, borderRadius: 3, '&:hover': { borderColor: '#00a8e8' }, transition: 'all 0.2s' }}>
          {block.fileUrl ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              {block.type === 'image' ? (
                <Box component="img" src={block.fileUrl} alt="Upload preview" sx={{ maxWidth: '100%', maxHeight: '400px', borderRadius: 2, boxShadow: 3 }} />
              ) : (
                <Button variant="contained" href={block.fileUrl} target="_blank" rel="noreferrer" sx={{ bgcolor: '#00a8e8', color: '#fff', '&:hover': { bgcolor: '#0088b8' } }}>
                  View Uploaded File
                </Button>
              )}
            </Box>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <input
                type="file"
                accept={block.type === 'image' ? 'image/*' : '*/*'}
                ref={fileInputRef}
                style={{ display: 'none' }}
                onChange={(e) => handleFileUpload(e.target.files[0])}
              />
              <Button
                variant="contained"
                sx={{ bgcolor: isDark ? '#00a8e8' : '#00212e', color: '#fff', py: 1.5, px: 4, fontWeight: 700, borderRadius: 2, '&:hover': { bgcolor: isDark ? '#0088b8' : '#00435c' } }}
                onClick={() => fileInputRef.current.click()}
              >
                Select {block.type === 'image' ? 'Image' : 'File'}
              </Button>
            </Box>
          )}
        </Box>
      );

    default:
      return null;
  }
};

export default BlockEditor;