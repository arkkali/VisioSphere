import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { io } from 'socket.io-client';
import Sidebar from '../components/Sidebar';
import { useTheme } from '../context/ThemeContext';
import {
  Box,
  Button,
  FormControl,
  GlobalStyles,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Typography,
} from '@mui/material';
import AssessmentCard from '../components/assessments/AssessmentCard';
import AssessmentEditor from '../components/assessments/AssessmentEditor';
import {
  fetchAllResidents,
  fetchResidentsByNurse,
  fetchAssessments,
  createAssessment,
  updateAssessment,
  deleteAssessment,
  postComment,
} from '../services/assessmentService';
import axiosInstance from '../api/axiosInstance';

const DailyAssessments = () => {
  const { theme } = useTheme();
  const isDark = theme === 'dark' || (theme === 'default' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  const location = useLocation();
  const isNurseView = location.pathname.startsWith('/nurse');

  const [activeUser, setActiveUser] = useState({
    id: localStorage.getItem('adminId') || localStorage.getItem('nurseId') || 'U-001',
    name: localStorage.getItem('adminName') || localStorage.getItem('nurseName') || 'System User',
  });

  const [residents, setResidents] = useState([]);
  const [selectedResident, setSelectedResident] = useState('');
  const [assessments, setAssessments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [isCreating, setIsCreating] = useState(false);

  const [reportTitle, setReportTitle] = useState('');
  const [reportTags, setReportTags] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [editingId, setEditingId] = useState(null);

  const [expandedAssessmentIds, setExpandedAssessmentIds] = useState([]);
  const [commentText, setCommentText] = useState({});

  const showToast = useCallback((message, type = 'success') => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000);
  }, []);

  const resolveNurseId = async () => {
    const directNurseId = localStorage.getItem('nurseId');
    if (directNurseId) return directNurseId;

    const adminId = localStorage.getItem('adminId');
    if (adminId) {
      try {
        const { data } = await axiosInstance.get(`/nurses/linked-profile/${adminId}`);
        return data?.nurseId ?? null;
      } catch {
        return null;
      }
    }

    return null;
  };

  useEffect(() => {
    const loadData = async () => {
      try {
        if (isNurseView) {
          const nId = await resolveNurseId();
          const nName = localStorage.getItem('nurseName') || localStorage.getItem('adminName') || 'Nurse';
          if (nId) {
            setActiveUser({ id: nId, name: nName });
            const data = await fetchResidentsByNurse(nId);
            setResidents(data);
          } else {
            setResidents([]);
          }
        } else {
          setActiveUser({
            id: localStorage.getItem('adminId') || 'A-SECURE',
            name: localStorage.getItem('adminName') || 'Facility Admin',
          });
          const data = await fetchAllResidents();
          setResidents(data);
        }
      } catch {
        showToast('Failed to load residents data.', 'error');
      }
    };
    loadData();
  }, [isNurseView]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selectedResident) {
      setAssessments([]);
      return;
    }
    const loadAssessments = async () => {
      setLoading(true);
      try {
        const data = await fetchAssessments(selectedResident);
        setAssessments(data);
      } catch (err) {
        if (err.response?.status !== 404) {
          showToast('Failed to load past assessments', 'error');
        }
        setAssessments([]);
      } finally {
        setLoading(false);
      }
    };
    loadAssessments();
  }, [selectedResident]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const socket = io(import.meta.env.VITE_SOCKET_URL, { transports: ['websocket'] });

    const handleNewComment = (data) => {
      setAssessments((prev) =>
        prev.map((a) =>
          String(a._id) === String(data.assessmentId)
            ? { ...a, comments: [...(a.comments || []), data.comment] }
            : a
        )
      );
    };

    const handleNewReaction = (data) => {
      setAssessments((prev) =>
        prev.map((a) =>
          String(a._id) === String(data.assessmentId) ? { ...a, reactions: data.reactions } : a
        )
      );
    };

    socket.on('new_assessment_comment', handleNewComment);
    socket.on('new_assessment_reaction', handleNewReaction);

    return () => {
      socket.off('new_assessment_comment', handleNewComment);
      socket.off('new_assessment_reaction', handleNewReaction);
      socket.disconnect();
    };
  }, []);

  const reloadAssessments = async () => {
    if (!selectedResident) return;
    setLoading(true);
    try {
      const data = await fetchAssessments(selectedResident);
      setAssessments(data);
    } catch (err) {
      if (err.response?.status !== 404) showToast('Failed to reload assessments', 'error');
      setAssessments([]);
    } finally {
      setLoading(false);
    }
  };

  const toggleAssessment = (id) => {
    setExpandedAssessmentIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Block ids exist only in the browser: handleSave strips them before the
  // payload goes to the API, so anything loaded back from Mongo arrives with
  // NO id at all. Every helper below matches blocks by id, and
  // `undefined !== undefined` is false — so removeBlock(undefined) filtered
  // out EVERY block, and updateBlock wrote the same edit into all of them.
  // withBlockIds() re-attaches a stable id on load; nextBlockId() replaces
  // Date.now(), which collides when two blocks are added in the same
  // millisecond and produces two React children with the same key.
  const blockIdRef = useRef(0);
  const nextBlockId = () => `b-${Date.now().toString(36)}-${++blockIdRef.current}`;
  const withBlockIds = (list = []) =>
    list.map((b) => (b && b.id != null ? b : { ...b, id: nextBlockId() }));

  const addBlock = (type) => {
    const newBlock = { id: nextBlockId(), type, content: '', fileUrl: null };
    if (type === 'checklist') newBlock.content = [{ text: '', checked: false }];
    if (type === 'chart') newBlock.content = { chartType: 'temperature', chartTitle: 'Temperature Tracking', dataPoints: [{ label: '', value: 0 }] };
    setBlocks((prev) => [...prev, newBlock]);
  };

  // The `id == null` guard is belt and braces: if a block ever reaches here
  // without an id again, it is kept rather than silently deleted.
  const removeBlock = (id) =>
    setBlocks((prev) => prev.filter((b) => b.id == null || b.id !== id));

  const updateBlock = (id, field, value) => {
    if (id == null) return;
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, [field]: value } : b)));
  };

  // `name` is the stored filename and is what gets saved; `previewUrl` is a
  // signed link used only to display the file in this editing session and is
  // deliberately dropped by handleSave.
  const handleBlockFileUploaded = (id, name, previewUrl) => {
    if (id == null) return;
    setBlocks((prev) =>
      prev.map((b) => (b.id === id ? { ...b, fileUrl: name, previewUrl } : b)));
  };

  const cancelCreating = () => {
    setIsCreating(false);
    setEditingId(null);
    setReportTitle('');
    setReportTags([]);
    setBlocks([]);
  };

  const handleEditClick = (assessment) => {
    setReportTitle(assessment.title || '');
    setReportTags(assessment.tags || []);
    setBlocks(withBlockIds(assessment.blocks));
    setEditingId(assessment._id);
    setIsCreating(true);
    setExpandedAssessmentIds([]);
  };

  const handleSave = async () => {
    if (!selectedResident) {
      showToast('Please select a resident first', 'error');
      return;
    }
    if (!reportTitle.trim()) {
      showToast('Please enter a report title', 'error');
      return;
    }

    const residentInfo = residents.find((r) => r._id === selectedResident);
    const fullName = [residentInfo.firstName, residentInfo.lastName].filter(Boolean).join(' ');

    const payload = {
      residentId: residentInfo._id,
      residentName: fullName,
      authorId: activeUser.id,
      authorName: activeUser.name,
      title: reportTitle,
      tags: reportTags,
      // fileName is present on blocks that came back from the API, where
      // fileUrl has been swapped for a short-lived signed link. Saving that
      // link would store a URL that expires within the hour; the bare name is
      // the durable thing.
      blocks: blocks.map((b) => ({
        type: b.type,
        content: b.content,
        fileUrl: b.fileName || b.fileUrl,
      })),
    };

    try {
      if (editingId) {
        await updateAssessment(editingId, payload);
        showToast('Report updated successfully');
      } else {
        await createAssessment(payload);
        showToast('Report submitted successfully');
      }
      cancelCreating();
      reloadAssessments();
    } catch {
      showToast('Failed to submit report', 'error');
    }
  };

  const handleDeleteAssessment = async (assessmentId) => {
    if (!window.confirm('Are you sure you want to delete this assessment? This cannot be undone.')) return;
    const prev = [...assessments];
    setAssessments((a) => a.filter((x) => x._id !== assessmentId));
    try {
      await deleteAssessment(assessmentId);
      showToast('Assessment deleted successfully');
    } catch {
      setAssessments(prev);
      showToast('Failed to delete assessment', 'error');
    }
  };

  const handleCommentChange = (assessmentId, text) => {
    setCommentText((prev) => ({ ...prev, [assessmentId]: text }));
  };

  const handleSendComment = async (assessmentId) => {
    const text = commentText[assessmentId];
    if (!text?.trim()) return;
    try {
      await postComment(assessmentId, {
        senderId: activeUser.id,
        senderName: activeUser.name,
        senderRole: isNurseView ? 'Nurse' : 'Facility Administrator',
        text,
      });
      setCommentText((prev) => ({ ...prev, [assessmentId]: '' }));
      showToast('Comment sent successfully');
    } catch {
      showToast('Failed to add comment', 'error');
    }
  };

  return (
    <>
      <style>{`@keyframes slideInRight { from { opacity: 0; transform: translateX(100%); } to { opacity: 1; transform: translateX(0); } }`}</style>
      <GlobalStyles styles={{
        '.visio-autocomplete-dark .MuiAutocomplete-listbox': { backgroundColor: '#1e293b', padding: '4px' },
        '.visio-autocomplete-dark .MuiAutocomplete-option': { color: '#e2e8f0', borderRadius: '6px', marginBottom: '2px', fontSize: '0.9rem', fontWeight: 600, fontFamily: "'Outfit', sans-serif" },
        '.visio-autocomplete-dark .MuiAutocomplete-option:hover': { backgroundColor: '#334155 !important', color: '#fff' },
        '.visio-autocomplete-dark .MuiAutocomplete-option[aria-selected="true"]': { backgroundColor: 'rgba(0,168,232,0.2) !important', color: '#38bdf8 !important' },
        '.visio-autocomplete-dark .MuiAutocomplete-option[aria-selected="true"]:hover': { backgroundColor: 'rgba(0,168,232,0.3) !important' },
        '.visio-autocomplete-dark .MuiAutocomplete-noOptions': { color: '#64748b', backgroundColor: '#1e293b', fontSize: '0.85rem', fontFamily: "'Outfit', sans-serif" },
        '.visio-autocomplete-dark': { backgroundColor: '#1e293b', border: '1px solid #334155', boxShadow: '0 8px 32px rgba(0,0,0,0.6)', borderRadius: '10px', overflow: 'hidden' },
        '.visio-autocomplete-light .MuiAutocomplete-listbox': { backgroundColor: '#fff', padding: '4px' },
        '.visio-autocomplete-light .MuiAutocomplete-option': { color: '#0f172a', borderRadius: '6px', marginBottom: '2px', fontSize: '0.9rem', fontWeight: 600, fontFamily: "'Outfit', sans-serif" },
        '.visio-autocomplete-light .MuiAutocomplete-option:hover': { backgroundColor: '#f1f5f9 !important', color: '#00212e' },
        '.visio-autocomplete-light .MuiAutocomplete-option[aria-selected="true"]': { backgroundColor: '#e1f5fe !important', color: '#0284c7 !important' },
        '.visio-autocomplete-light .MuiAutocomplete-option[aria-selected="true"]:hover': { backgroundColor: '#bae6fd !important' },
        '.visio-autocomplete-light .MuiAutocomplete-noOptions': { color: '#94a3b8', backgroundColor: '#fff', fontSize: '0.85rem', fontFamily: "'Outfit', sans-serif" },
        '.visio-autocomplete-light': { backgroundColor: '#fff', border: '1px solid #e2e8f0', boxShadow: '0 8px 32px rgba(0,0,0,0.1)', borderRadius: '10px', overflow: 'hidden' },
        '.ql-snow .ql-stroke': { stroke: isDark ? '#cbd5e1 !important' : '#444 !important' },
        '.ql-snow .ql-fill, .ql-snow .ql-stroke.ql-fill': { fill: isDark ? '#cbd5e1 !important' : '#444 !important' },
        '.ql-snow .ql-picker': { color: isDark ? '#cbd5e1 !important' : '#444 !important' },
        '.ql-snow .ql-picker-options': { backgroundColor: isDark ? '#1e293b !important' : '#fff !important', borderColor: isDark ? '#334155 !important' : '#ccc !important' },
        '.ql-snow .ql-tooltip': { backgroundColor: isDark ? '#1e293b !important' : '#fff !important', borderColor: isDark ? '#334155 !important' : '#ccc !important', color: isDark ? '#fff !important' : '#444 !important', boxShadow: isDark ? '0 4px 12px rgba(0,0,0,0.5) !important' : '0 0px 5px #ddd !important' },
        '.ql-snow .ql-tooltip input[type=text]': { backgroundColor: isDark ? '#0f172a !important' : '#fff !important', color: isDark ? '#fff !important' : '#444 !important', borderColor: isDark ? '#334155 !important' : '#ccc !important' },
      }} />

      <div className="flex bg-[#F8FAFC] dark:bg-slate-900 min-h-screen w-screen font-['Outfit',sans-serif] transition-colors duration-300">
        <Sidebar />
        <main className="flex-1 ml-0 lg:ml-[250px] p-[24px] md:p-[40px] overflow-x-hidden">
          <div className="max-w-[1400px] mx-auto">

            <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, justifyContent: 'space-between', alignItems: { xs: 'flex-start', md: 'center' }, mb: 4, pb: 3, borderBottom: `2px solid ${isDark ? '#1e293b' : '#e2e8f0'}`, gap: 3 }}>
              <Box>
                <Typography variant="h4" sx={{ color: isDark ? '#fff' : '#00212e', fontWeight: 800, letterSpacing: '-0.5px' }}>Daily Assessments & Reports</Typography>
                <Typography variant="body1" sx={{ color: isDark ? '#94a3b8' : '#64748b', mt: 0.5, fontWeight: 500 }}>Monitor resident health and generate detailed reports.</Typography>
              </Box>
              <FormControl sx={{ minWidth: { xs: '100%', md: 280 } }} size="medium">
                <InputLabel sx={{ fontWeight: 600, color: isDark ? '#94a3b8' : '#64748b' }}>Select Resident</InputLabel>
                <Select
                  value={selectedResident}
                  label="Select Resident"
                  onChange={(e) => { setSelectedResident(e.target.value); setIsCreating(false); setExpandedAssessmentIds([]); }}
                  MenuProps={{ PaperProps: { sx: { bgcolor: isDark ? '#1e293b' : '#fff', color: isDark ? '#fff' : '#00212e' } } }}
                  sx={{ backgroundColor: isDark ? '#1e293b' : '#fff', fontWeight: 700, color: isDark ? '#fff' : '#00212e', borderRadius: 2, '& .MuiOutlinedInput-notchedOutline': { borderColor: isDark ? '#334155' : '#cbd5e1', borderWidth: 2 }, '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#00a8e8' }, '& .MuiSvgIcon-root': { color: isDark ? '#94a3b8' : 'inherit' } }}
                >
                  <MenuItem value=""><em>None Selected</em></MenuItem>
                  {residents.map((r) => (
                    <MenuItem key={r._id} value={r._id} sx={{ fontWeight: 600 }}>
                      {r.firstName} {r.lastName}
                      <span style={{ color: isDark ? '#64748b' : '#94a3b8', marginLeft: '8px', fontSize: '0.85rem' }}>({r.residentId})</span>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>

            {!selectedResident && !isCreating && (
              <Paper elevation={0} sx={{ borderRadius: 4, p: { xs: 4, md: 6 }, border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`, textAlign: 'center', backgroundColor: isDark ? '#1e293b' : '#fff' }}>
                <Box sx={{ mb: 5 }}>
                  <Typography variant="h3" sx={{ color: isDark ? '#fff' : '#00212e', fontWeight: 900, mb: 2 }}>Welcome back, {activeUser.name.split(' ')[0]}</Typography>
                  <Typography variant="h6" sx={{ color: isDark ? '#94a3b8' : '#64748b', maxWidth: 600, mx: 'auto', fontWeight: 500, lineHeight: 1.6 }}>Select a resident from the dropdown above to securely view their assessment history or document a new daily health report.</Typography>
                </Box>
                <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, justifyContent: 'center', gap: 3 }}>
                  <Paper elevation={0} sx={{ flex: 1, maxWidth: 300, background: isDark ? 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)' : 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)', border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`, p: 4, borderRadius: 3, transition: 'all 0.3s', '&:hover': { transform: 'translateY(-5px)', borderColor: '#00a8e8', boxShadow: isDark ? '0 12px 24px rgba(0,0,0,0.5)' : '0 12px 24px rgba(0,168,232,0.1)' } }}>
                    <Typography sx={{ fontSize: '3rem', fontWeight: 900, color: isDark ? '#38bdf8' : '#00a8e8', lineHeight: 1 }}>{residents.length}</Typography>
                    <Typography sx={{ fontSize: '0.9rem', color: isDark ? '#e2e8f0' : '#00435c', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', mt: 1 }}>{isNurseView ? 'Assigned Elders' : 'Total Residents Managed'}</Typography>
                  </Paper>
                  <Paper elevation={0} sx={{ flex: 1, maxWidth: 300, background: isDark ? 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)' : 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)', border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`, p: 4, borderRadius: 3, transition: 'all 0.3s', '&:hover': { transform: 'translateY(-5px)', borderColor: '#00a8e8', boxShadow: isDark ? '0 12px 24px rgba(0,0,0,0.5)' : '0 12px 24px rgba(0,168,232,0.1)' } }}>
                    <Typography sx={{ fontSize: '2.5rem', fontWeight: 900, color: isDark ? '#34d399' : '#10b981', lineHeight: 1.2 }}>Real-time</Typography>
                    <Typography sx={{ fontSize: '0.9rem', color: isDark ? '#e2e8f0' : '#00435c', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', mt: 1 }}>Guardian Sync Active</Typography>
                  </Paper>
                </Box>
              </Paper>
            )}

            {selectedResident && !isCreating && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, justifyContent: 'space-between', alignItems: { xs: 'flex-start', md: 'center' }, gap: 2 }}>
                  <Typography variant="h5" sx={{ color: isDark ? '#fff' : '#00212e', fontWeight: 800 }}>Resident History</Typography>
                  <Button
                    variant="contained"
                    onClick={() => setIsCreating(true)}
                    sx={{ backgroundColor: isDark ? '#0284c7' : '#00a8e8', color: '#fff', px: 3, py: 1.5, borderRadius: 2, fontWeight: 800, textTransform: 'none', fontSize: '1rem', boxShadow: isDark ? '0 4px 12px rgba(0,0,0,0.4)' : '0 4px 12px rgba(0,168,232,0.25)', '&:hover': { backgroundColor: isDark ? '#0369a1' : '#0088b8', transform: 'translateY(-2px)', boxShadow: isDark ? '0 6px 16px rgba(0,0,0,0.6)' : '0 6px 16px rgba(0,168,232,0.35)' } }}
                  >
                    + Document New Report
                  </Button>
                </Box>

                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', lg: '1fr 1fr 1fr' }, gap: 3, alignItems: 'flex-start' }}>
                  {loading ? (
                    <Typography sx={{ color: isDark ? '#94a3b8' : '#64748b', gridColumn: '1 / -1' }}>Loading secure records...</Typography>
                  ) : assessments.length === 0 ? (
                    <Paper elevation={0} sx={{ gridColumn: '1 / -1', p: 8, textAlign: 'center', border: `2px dashed ${isDark ? '#334155' : '#cbd5e1'}`, borderRadius: 4, backgroundColor: isDark ? '#1e293b' : '#fff' }}>
                      <Typography variant="h6" sx={{ color: isDark ? '#cbd5e1' : '#64748b', fontWeight: 600 }}>No past assessments found for this resident.</Typography>
                      <Typography sx={{ color: isDark ? '#64748b' : '#94a3b8', mt: 1 }}>Start by documenting a new report above.</Typography>
                    </Paper>
                  ) : (
                    assessments.map((assessment) => (
                      <AssessmentCard
                        key={assessment._id}
                        assessment={assessment}
                        isDark={isDark}
                        isExpanded={expandedAssessmentIds.includes(assessment._id)}
                        isNurseView={isNurseView}
                        commentText={commentText[assessment._id] || ''}
                        onToggle={() => toggleAssessment(assessment._id)}
                        onCommentChange={(text) => handleCommentChange(assessment._id, text)}
                        onSendComment={() => handleSendComment(assessment._id)}
                        onEditClick={() => handleEditClick(assessment)}
                        onDeleteClick={() => handleDeleteAssessment(assessment._id)}
                      />
                    ))
                  )}
                </Box>
              </Box>
            )}

            {isCreating && (
              <AssessmentEditor
                isDark={isDark}
                editingId={editingId}
                reportTitle={reportTitle}
                reportTags={reportTags}
                blocks={blocks}
                onTitleChange={setReportTitle}
                onTagsChange={setReportTags}
                onBlockUpdate={updateBlock}
                onBlockFileUploaded={handleBlockFileUploaded}
                onAddBlock={addBlock}
                onRemoveBlock={removeBlock}
                onSave={handleSave}
                onCancel={cancelCreating}
                onToast={showToast}
              />
            )}

          </div>
        </main>

        <Box sx={{ position: 'fixed', bottom: 24, right: 24, zIndex: 3000, display: 'flex', flexDirection: 'column', gap: 1.5, pointerEvents: 'none', maxWidth: 400 }}>
          {toasts.map((toast) => (
            <Paper
              key={toast.id}
              elevation={4}
              sx={{ p: 2, px: 3, borderRadius: 2, fontWeight: 700, pointerEvents: 'auto', borderLeft: '6px solid', borderColor: toast.type === 'success' ? '#10b981' : toast.type === 'error' ? '#e11d48' : '#00a8e8', animation: 'slideInRight 0.3s ease', backgroundColor: isDark ? '#1e293b' : '#fff' }}
            >
              <Typography sx={{ color: toast.type === 'success' ? (isDark ? '#34d399' : '#059669') : toast.type === 'error' ? (isDark ? '#fb7185' : '#be123c') : (isDark ? '#38bdf8' : '#0075a2'), fontWeight: 700 }}>
                {toast.message}
              </Typography>
            </Paper>
          ))}
        </Box>
      </div>
    </>
  );
};

export default DailyAssessments;