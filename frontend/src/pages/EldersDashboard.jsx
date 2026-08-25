import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import html2canvas from 'html2canvas';
import { useTheme } from '../context/ThemeContext';
import Sidebar from '../components/Sidebar';
import ResidentTable from '../components/elders/ResidentTable';
import BulkActionBar from '../components/elders/BulkActionBar';
import AddResidentModal from '../components/elders/AddResidentModal';
import EditResidentModal from '../components/elders/EditResidentModal';
import DeleteResidentModal from '../components/elders/DeleteResidentModal';
import ImportPreviewModal from '../components/elders/ImportPreviewModal';
import ReportModal from '../components/elders/ReportModal';
import ArchiveModal from '../components/elders/ArchiveModal';
import { housesForCurrentUser, soleHouse } from '../constants/houses';
import {
  getAllResidents,
  updateResident,
  deleteResident,
  addResident,
  importResidents,
  batchImportResidents,
  saveReport,
  getArchivedReports,
} from '../services/eldersService';

// Houses come from the signed-in user's facility, never a hardcoded list —
// a Saint Anthony account must not be shown Graces' houses. These are lazy
// functions rather than constants because this module is imported at app
// start, BEFORE login has written the facility to localStorage.
const emptyNewResident  = () => ({ firstName: '', middleName: '', lastName: '', house: housesForCurrentUser()[0] || '' });
const emptyEditResident = () => ({ _id: '', firstName: '', middleName: '', lastName: '', house: housesForCurrentUser()[0] || '' });

const getFullName = (resident) => {
  if (!resident) return '';
  return [resident.firstName, resident.middleName, resident.lastName].filter(Boolean).join(' ');
};

const EldersDashboard = () => {
  const { theme } = useTheme();
  const isDark = theme === 'dark' || (theme === 'default' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  const location = useLocation();
  const isNurseView = location.pathname.startsWith('/nurse');

  const [residents, setResidents] = useState([]);
  const [loading, setLoading] = useState(true);
  // Only this facility's houses. 'Overall Facility' is meaningful only when
  // there is more than one house to aggregate, so a single-house facility
  // (Saint Anthony) opens straight on its house and never sees that tab.
  const HOUSES = useMemo(() => housesForCurrentUser(), []);
  const [selectedHouse, setSelectedHouse] = useState(() => {
    const h = housesForCurrentUser();
    return h.length > 1 ? 'Overall' : (h[0] || 'Overall');
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [filterAttendance, setFilterAttendance] = useState('All');
  const [filterNotes, setFilterNotes] = useState('All');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const [selectedCheckboxes, setSelectedCheckboxes] = useState(new Set());
  const [bulkAttendanceValue, setBulkAttendanceValue] = useState('');
  const [expandedNotesId, setExpandedNotesId] = useState(null);
  const [tempNotes, setTempNotes] = useState('');
  const [toasts, setToasts] = useState([]);

  const [newResident, setNewResident] = useState(emptyNewResident);
  const [editResident, setEditResident] = useState(emptyEditResident);
  const [deleteTargetIds, setDeleteTargetIds] = useState(new Set());
  const [previewData, setPreviewData] = useState([]);
  const [archivedReports, setArchivedReports] = useState([]);
  const [loadingArchives, setLoadingArchives] = useState(false);
  const [isSavingReport, setIsSavingReport] = useState(false);

  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);

  const showToast = useCallback((message, type = 'success') => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000);
  }, []);

  useEffect(() => {
    const loadData = async () => {
      try {
        const data = await getAllResidents();
        setResidents(data);
      } catch {
        setResidents([]);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []); 

  const houseResidents = selectedHouse === 'Overall'
    ? residents
    : residents.filter((r) => r.house === selectedHouse);

  const filteredResidents = houseResidents.filter((resident) => {
    const fullName = getFullName(resident);
    const matchesSearch =
      resident.residentId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      fullName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesAttendance = filterAttendance === 'All' || resident.attendance === filterAttendance;
    const matchesNotes =
      filterNotes === 'All' ||
      (filterNotes === 'WithNotes' && resident.notes && resident.notes.trim() !== '') ||
      (filterNotes === 'NoNotes' && (!resident.notes || resident.notes.trim() === ''));
    return matchesSearch && matchesAttendance && matchesNotes;
  });

  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentResidents = filteredResidents.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(filteredResidents.length / itemsPerPage);

  const isAllAttendanceConfirmed = residents.length > 0 && residents.every(
    (r) => r.attendance === 'Present' || r.attendance === 'Not Present'
  );

  const handleCheckboxChange = (residentId) => {
    const next = new Set(selectedCheckboxes);
    next.has(residentId) ? next.delete(residentId) : next.add(residentId);
    setSelectedCheckboxes(next);
  };

  const handleSelectAll = (e) => {
    setSelectedCheckboxes(e.target.checked ? new Set(currentResidents.map((r) => r._id)) : new Set());
  };

  const handleAttendanceChange = async (residentId, attendance) => {
    const original = residents.find((r) => r._id === residentId);
    setResidents((prev) => prev.map((r) => r._id === residentId ? { ...r, attendance } : r));
    try {
      const updated = await updateResident(residentId, {
        attendance: attendance && attendance.trim() !== '' ? attendance : null,
      });
      setResidents((prev) => prev.map((r) => r._id === residentId ? { ...r, attendance: updated.attendance } : r));
      if (attendance && attendance.trim() !== '') showToast(`Marked as ${attendance}`, 'success');
    } catch (err) {
      setResidents((prev) => prev.map((r) => r._id === residentId ? original : r));
      showToast(`Error updating attendance: ${err.response?.data?.message || err.message}`, 'error');
    }
  };

  const handleBulkAttendanceUpdate = async () => {
    if (selectedCheckboxes.size === 0) { showToast('Please select at least one resident.', 'error'); return; }
    if (!bulkAttendanceValue) { showToast('Please select an attendance status.', 'error'); return; }

    const ids = Array.from(selectedCheckboxes);
    const originals = residents.filter((r) => ids.includes(r._id));
    setResidents((prev) => prev.map((r) => ids.includes(r._id) ? { ...r, attendance: bulkAttendanceValue } : r));

    try {
      await Promise.all(ids.map((id) => updateResident(id, { attendance: bulkAttendanceValue })));
      setSelectedCheckboxes(new Set());
      setBulkAttendanceValue('');
      showToast(`${ids.length} resident(s) marked as ${bulkAttendanceValue}!`, 'success');
    } catch (err) {
      setResidents((prev) => prev.map((r) => {
        const original = originals.find((o) => o._id === r._id);
        return original ? original : r;
      }));
      showToast(`Error updating attendance: ${err.response?.data?.message || err.message}`, 'error');
    }
  };

  const handleNotesBoxOpen = (residentId) => {
    const resident = residents.find((r) => r._id === residentId);
    setTempNotes(resident?.notes || '');
    setExpandedNotesId(residentId);
  };

  const handleSaveNotes = async (residentId) => {
    try {
      const updated = await updateResident(residentId, { notes: tempNotes });
      setResidents((prev) => prev.map((r) => r._id === residentId ? { ...r, notes: updated.notes } : r));
      setExpandedNotesId(null);
      setTempNotes('');
      showToast('Notes saved successfully!', 'success');
    } catch (err) {
      showToast(`Error saving notes: ${err.response?.data?.message || err.message}`, 'error');
    }
  };

  const handleCloseNotes = () => { setExpandedNotesId(null); setTempNotes(''); };

  const handleRowClick = (residentId) => {
    expandedNotesId === residentId ? handleCloseNotes() : handleNotesBoxOpen(residentId);
  };

  const handleAddResident = async () => {
    if (!newResident.firstName.trim() || !newResident.lastName.trim()) {
      showToast('Please enter at least First Name and Last Name.', 'error');
      return;
    }
    try {
      const created = await addResident(newResident);
      setResidents((prev) => [...prev, created]);
      setShowAddModal(false);
      setNewResident(emptyNewResident());
      showToast('Resident added successfully!', 'success');
    } catch (err) {
      showToast(`Error adding resident: ${err.response?.data?.message || err.message}`, 'error');
    }
  };

  const handleSaveEdit = async () => {
    if (!editResident.firstName.trim() || !editResident.lastName.trim()) {
      showToast('First Name and Last Name are required.', 'error');
      return;
    }
    try {
      const updated = await updateResident(editResident._id, {
        firstName: editResident.firstName.trim(),
        middleName: editResident.middleName.trim(),
        lastName: editResident.lastName.trim(),
        house: editResident.house,
      });
      setResidents((prev) => prev.map((r) => r._id === editResident._id ? updated : r));
      setShowEditModal(false);
      setSelectedCheckboxes(new Set());
      showToast('Resident updated successfully!', 'success');
    } catch (err) {
      showToast(`Error updating resident: ${err.response?.data?.message || err.message}`, 'error');
    }
  };

  const handleDeleteResidents = () => {
    if (selectedCheckboxes.size === 0) { showToast('Please select at least one resident to delete.', 'error'); return; }
    setDeleteTargetIds(new Set(selectedCheckboxes));
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    try {
      await Promise.all(Array.from(deleteTargetIds).map((id) => deleteResident(id)));
      setResidents((prev) => prev.filter((r) => !deleteTargetIds.has(r._id)));
      showToast(`${deleteTargetIds.size} resident(s) deleted successfully!`, 'success');
    } catch (err) {
      showToast(`Error deleting residents: ${err.response?.data?.message || err.message}`, 'error');
    } finally {
      setSelectedCheckboxes(new Set());
      setDeleteTargetIds(new Set());
      setShowDeleteModal(false);
    }
  };

  const handleEdit = (residentId) => {
    const resident = residents.find((r) => r._id === residentId);
    if (!resident) return;
    setEditResident({
      _id: resident._id,
      firstName: resident.firstName,
      middleName: resident.middleName || '',
      lastName: resident.lastName,
      // See NursePage: with the field hidden, seeding from the stored value
      // would make a wrong house permanent.
      house: soleHouse() ?? resident.house,
    });
    setShowEditModal(true);
  };

  const handleExcelUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      const rows = await importResidents(formData);
      setPreviewData(rows);
      setPreviewModalOpen(true);
    } catch (err) {
      showToast(`Error parsing file: ${err.response?.data?.message || err.message}`, 'error');
    }
    e.target.value = '';
  };

  const handlePreviewEdit = (index, field, value) => {
    const next = [...previewData];
    next[index][field] = value;
    setPreviewData(next);
  };

  const handleConfirmImport = async () => {
    const validData = previewData
      .filter((row) => row.firstName && row.lastName)
      .map((row) => ({
        firstName: row.firstName.trim(),
        middleName: row.middleName ? row.middleName.trim() : '',
        lastName: row.lastName.trim(),
        house: selectedHouse === 'Overall' ? HOUSES[0] : selectedHouse,
      }));
    if (validData.length === 0) {
      showToast('No valid data to import. Please check First and Last names.', 'error');
      return;
    }
    try {
      const created = await batchImportResidents(validData);
      setResidents((prev) => [...prev, ...created]);
      showToast(`Successfully imported ${created.length} residents!`, 'success');
      setPreviewModalOpen(false);
      setPreviewData([]);
    } catch (err) {
      showToast(`Error saving imported data: ${err.response?.data?.message || err.message}`, 'error');
    }
  };

  const openArchives = async () => {
    setShowArchiveModal(true);
    setLoadingArchives(true);
    try {
      const data = await getArchivedReports();
      setArchivedReports(data);
    } catch {
      showToast('Error loading archived reports', 'error');
    } finally {
      setLoadingArchives(false);
    }
  };

  const handleDownloadPDF = async (dateStr) => {
    try {
      const doc = new jsPDF('p', 'mm', 'a4');
      let currentY = 15;

      doc.setFillColor(0, 33, 46);
      doc.rect(0, 0, 210, 30, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(22);
      doc.text('VISIOSPHERE', 14, 20);
      doc.setFontSize(10);
      doc.text('Master Facility Attendance Report', 14, 26);
      doc.text(`Date Generated: ${dateStr}`, 145, 26);
      currentY = 40;

      const chartContainer = document.getElementById('report-charts-container');
      if (chartContainer) {
        try {
          const canvas = await html2canvas(chartContainer, { scale: 3, backgroundColor: '#ffffff', logging: false });
          const imgData = canvas.toDataURL('image/png');
          const pdfWidth = 182;
          const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
          doc.addImage(imgData, 'PNG', 14, currentY, pdfWidth, pdfHeight);
          currentY += pdfHeight + 15;
        } catch (err) {
          console.error('Chart capture failed', err);
        }
      }

      const summaryHeaders = [['House', 'Total Elders', 'Present', 'Absent']];
      const summaryBody = HOUSES.map((houseName) => {
        const hRes = residents.filter((r) => r.house === houseName);
        return [
          houseName,
          hRes.length.toString(),
          hRes.filter((r) => r.attendance === 'Present').length.toString(),
          hRes.filter((r) => r.attendance === 'Not Present').length.toString(),
        ];
      });

      summaryBody.push([
        { content: 'FACILITY TOTAL', styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } },
        { content: residents.length.toString(), styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } },
        { content: residents.filter((r) => r.attendance === 'Present').length.toString(), styles: { fontStyle: 'bold', textColor: [16, 185, 129], fillColor: [241, 245, 249] } },
        { content: residents.filter((r) => r.attendance === 'Not Present').length.toString(), styles: { fontStyle: 'bold', textColor: [225, 29, 72], fillColor: [241, 245, 249] } },
      ]);

      autoTable(doc, {
        startY: currentY,
        head: summaryHeaders,
        body: summaryBody,
        theme: 'grid',
        headStyles: { fillColor: [0, 168, 232], textColor: [255, 255, 255], fontStyle: 'bold' },
        styles: { fontSize: 10, cellPadding: 5 },
        margin: { left: 14, right: 14 },
      });

      currentY = doc.lastAutoTable ? doc.lastAutoTable.finalY + 15 : currentY + 40;

      const detailedHeaders = [['Resident Name', 'Status', 'Monitoring Notes']];
      const detailedBody = [];

      HOUSES.forEach((houseName) => {
        const houseList = residents.filter((r) => r.house === houseName);
        if (houseList.length > 0) {
          detailedBody.push([
            { content: houseName, colSpan: 3, styles: { fillColor: [0, 33, 46], textColor: [255, 255, 255], fontStyle: 'bold' } },
          ]);
          houseList.forEach((resident) => {
            const isPresent = resident.attendance === 'Present';
            detailedBody.push([
              `[ ${isPresent ? 'X' : '  '} ]  ${getFullName(resident)}`,
              { content: isPresent ? 'Present' : (resident.attendance || 'Unmarked'), styles: { textColor: isPresent ? [16, 185, 129] : [225, 29, 72], fontStyle: 'bold' } },
              resident.notes || '-',
            ]);
          });
        }
      });

      autoTable(doc, {
        startY: currentY,
        head: detailedHeaders,
        body: detailedBody,
        theme: 'grid',
        headStyles: { fillColor: [226, 232, 240], textColor: [46, 58, 89], fontStyle: 'bold' },
        styles: { fontSize: 9, cellPadding: 4 },
        columnStyles: { 0: { cellWidth: 70 }, 1: { cellWidth: 30, halign: 'center' }, 2: { cellWidth: 82 } },
        margin: { left: 14, right: 14 },
      });

      doc.save(`VisioSphere_Facility_Report_${dateStr.replace(/\//g, '-')}.pdf`);
      showToast('Facility Report archived and downloaded successfully!', 'success');
      setShowReportModal(false);
    } catch (err) {
      console.error('PDF Generation Error:', err);
      showToast('An error occurred while generating the PDF.', 'error');
    }
  };

  const handleSaveAndDownloadReport = async () => {
    setIsSavingReport(true);
    const dateStr = new Date().toLocaleDateString();

    const reportData = {
      reportDate: dateStr,
      totalResidents: residents.length,
      totalPresent: residents.filter((r) => r.attendance === 'Present').length,
      totalNotPresent: residents.filter((r) => r.attendance === 'Not Present').length,
      housesSummary: HOUSES.map((houseName) => {
        const hRes = residents.filter((r) => r.house === houseName);
        return {
          house: houseName,
          headcount: hRes.length,
          present: hRes.filter((r) => r.attendance === 'Present').length,
          notPresent: hRes.filter((r) => r.attendance === 'Not Present').length,
        };
      }),
      absentResidents: residents
        .filter((r) => r.attendance === 'Not Present')
        .map((r) => ({ residentId: r.residentId, name: getFullName(r), house: r.house })),
      notesSnapshot: residents
        .filter((r) => r.notes && r.notes.trim() !== '')
        .map((r) => ({ residentId: r.residentId, name: getFullName(r), house: r.house, note: r.notes })),
    };

    try {
      await saveReport(reportData);
    } catch {
      showToast('Failed to archive report. Attempting to download PDF anyway.', 'warning');
    } finally {
      await handleDownloadPDF(dateStr);
      setIsSavingReport(false);
    }
  };

  const downloadArchivePDF = (report) => {
    try {
      const doc = new jsPDF('p', 'mm', 'a4');
      let currentY = 15;

      doc.setFillColor(0, 33, 46);
      doc.rect(0, 0, 210, 30, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(22);
      doc.text('VISIOSPHERE', 14, 20);
      doc.setFontSize(10);
      doc.text('Archived Facility Attendance Report', 14, 26);
      doc.text(`Date: ${report.reportDate || 'N/A'}`, 145, 26);
      currentY = 40;

      const summaryBody = (report.housesSummary || []).map((h) => [
        h.house || 'N/A',
        String(h.headcount || 0),
        String(h.present || 0),
        String(h.notPresent || 0),
      ]);

      summaryBody.push([
        { content: 'FACILITY TOTAL', styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } },
        { content: String(report.totalResidents || 0), styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } },
        { content: String(report.totalPresent || 0), styles: { fontStyle: 'bold', textColor: [16, 185, 129], fillColor: [241, 245, 249] } },
        { content: String(report.totalNotPresent || 0), styles: { fontStyle: 'bold', textColor: [225, 29, 72], fillColor: [241, 245, 249] } },
      ]);

      autoTable(doc, {
        startY: currentY,
        head: [['House', 'Total Elders', 'Present', 'Absent']],
        body: summaryBody,
        theme: 'grid',
        headStyles: { fillColor: [0, 168, 232], textColor: [255, 255, 255], fontStyle: 'bold' },
        styles: { fontSize: 10, cellPadding: 5 },
        margin: { left: 14, right: 14 },
      });

      currentY = doc.lastAutoTable ? doc.lastAutoTable.finalY + 15 : currentY + 40;
      const detailedBody = [];

      if (report.absentResidents?.length > 0) {
        detailedBody.push([{ content: 'ABSENT RESIDENTS', colSpan: 2, styles: { fillColor: [225, 29, 72], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' } }]);
        report.absentResidents.forEach((res) => detailedBody.push([res.house || 'N/A', res.name || 'N/A']));
      }

      if (report.notesSnapshot?.length > 0) {
        detailedBody.push([{ content: 'MONITORING NOTES', colSpan: 2, styles: { fillColor: [245, 158, 11], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' } }]);
        report.notesSnapshot.forEach((note) => detailedBody.push([`${note.name || 'N/A'} (${note.house || 'N/A'})`, note.note || 'N/A']));
      }

      if (detailedBody.length > 0) {
        autoTable(doc, {
          startY: currentY,
          head: [['Category', 'Details']],
          body: detailedBody,
          theme: 'grid',
          styles: { fontSize: 9, cellPadding: 4 },
          margin: { left: 14, right: 14 },
        });
      }

      doc.save(`VisioSphere_Archived_Report_${String(report.reportDate || new Date().toLocaleDateString()).replace(/\//g, '-')}.pdf`);
      showToast('Archived Report downloaded successfully!', 'success');
    } catch (err) {
      console.error('PDF Generation Error:', err);
      showToast('Failed to download Archived PDF.', 'error');
    }
  };

  const getBarChartData = () => ({
    xAxis: ['Charbel', 'Francis', 'Gabriel', 'Rose', 'Sebastian', 'Coson'],
    present: HOUSES.map((h) => residents.filter((r) => r.house === h && r.attendance === 'Present').length),
    absent: HOUSES.map((h) => residents.filter((r) => r.house === h && r.attendance === 'Not Present').length),
  });

  const overallPercentage = residents.length > 0
    ? Math.round((residents.filter((r) => r.attendance === 'Present').length / residents.length) * 100)
    : 0;

  const firstSelectedResident = selectedCheckboxes.size > 0 ? Array.from(selectedCheckboxes)[0] : null;

  return (
    <>
      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideDown { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideInRight { from { opacity: 0; transform: translateX(360px); } to { opacity: 1; transform: translateX(0); } }
      `}</style>
      <div className="flex bg-[#F8FAFC] dark:bg-slate-900 min-h-screen w-screen font-['Outfit',sans-serif] transition-colors duration-300">
        <Sidebar />
        <main className="flex-1 ml-0 md:ml-[250px] p-[14px] md:p-[20px] lg:p-[40px] bg-[#F8FAFC] dark:bg-slate-900 transition-colors duration-300">
          <div className="max-w-[1400px] mx-auto">

            <div className="flex flex-col lg:flex-row justify-between lg:items-center mb-[32px] pb-[24px] border-b-2 border-[#E5E7EB] dark:border-slate-800 gap-[14px] lg:gap-0 transition-colors duration-300">
              <div>
                <h1 className="text-[1.8rem] lg:text-[2.2rem] text-[#00212e] dark:text-white m-0 font-extrabold tracking-[-0.5px]">Residents Management</h1>
                <p className="text-[#2E3A59] dark:text-slate-400 text-[0.95rem] m-0 mt-[4px] font-medium">Daily Attendance & Master Checklist</p>
              </div>
              <div className="flex flex-col md:flex-row gap-[12px] items-center w-full lg:w-auto">
                <label className="w-full md:w-auto flex justify-center lg:justify-start items-center gap-[8px] bg-white dark:bg-slate-800 text-[#2E3A59] dark:text-slate-300 border-[1.5px] border-[#cbd5e1] dark:border-slate-600 p-[11px_22px] rounded-[9px] font-bold cursor-pointer transition-all duration-200 text-[0.88rem] hover:bg-[#e2e8f0] dark:hover:bg-slate-700 hover:text-[#00212e] dark:hover:text-white">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-[18px] h-[18px]">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="17 8 12 3 7 8"></polyline>
                    <line x1="12" y1="3" x2="12" y2="15"></line>
                  </svg>
                  Import Excel
                  <input type="file" accept=".xlsx,.xls,.csv" onChange={handleExcelUpload} style={{ display: 'none' }} />
                </label>
                <button
                  className="w-full md:w-auto flex justify-center lg:justify-start items-center gap-[8px] bg-[#00a8e8] dark:bg-[#0284c7] text-white border-none p-[11px_22px] rounded-[9px] font-bold cursor-pointer transition-all duration-200 text-[0.88rem] shadow-[0_4px_12px_rgba(0,168,232,0.25)] dark:shadow-[0_4px_12px_rgba(2,132,199,0.4)] hover:bg-[#0075a2] dark:hover:bg-[#0369a1] hover:shadow-[0_6px_16px_rgba(0,168,232,0.35)] dark:hover:shadow-[0_6px_16px_rgba(2,132,199,0.5)] hover:-translate-y-[2px]"
                  onClick={() => setShowAddModal(true)}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-[18px] h-[18px]">
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                  </svg>
                  Add New Resident
                </button>
              </div>
            </div>

            <div className="flex flex-col lg:flex-row justify-between lg:items-center mb-[20px] flex-wrap gap-[16px]">
              <div className="flex flex-col md:flex-row gap-[6px] md:gap-[10px] flex-wrap bg-white dark:bg-slate-800 p-[8px] rounded-[10px] shadow-sm border border-[#E5E7EB] dark:border-slate-700 w-full lg:w-auto transition-colors duration-300">
                {HOUSES.length > 1 && (
                <button
                  style={selectedHouse === 'Overall' ? { backgroundColor: isDark ? '#0ea5e9' : '#00212e', color: 'white' } : {}}
                  className={`w-full md:w-auto text-left md:text-center p-[8px_16px] bg-transparent border-none rounded-[6px] font-bold text-[0.85rem] cursor-pointer transition-all duration-200 whitespace-nowrap ${selectedHouse === 'Overall' ? 'shadow-md' : 'text-[#64748b] dark:text-slate-400 hover:text-[#00212e] dark:hover:text-white hover:bg-[#e2e8f0] dark:hover:bg-slate-700'}`}
                  onClick={() => { setSelectedHouse('Overall'); setSelectedCheckboxes(new Set()); setCurrentPage(1); }}
                >
                  Overall Facility
                </button>
                )}
                {HOUSES.length > 1 && (
                  <div className="hidden md:block w-[1px] bg-[#E5E7EB] dark:bg-slate-700 mx-[4px]"></div>
                )}
                {HOUSES.map((house) => (
                  <button
                    key={house}
                    style={selectedHouse === house ? { backgroundColor: isDark ? '#0ea5e9' : '#00212e', color: 'white' } : {}}
                    className={`w-full md:w-auto text-left md:text-center p-[8px_16px] bg-transparent border-none rounded-[6px] font-bold text-[0.85rem] cursor-pointer transition-all duration-200 whitespace-nowrap ${selectedHouse === house ? 'shadow-md' : 'text-[#64748b] dark:text-slate-400 hover:text-[#00212e] dark:hover:text-white hover:bg-[#e2e8f0] dark:hover:bg-slate-700'}`}
                    onClick={() => { setSelectedHouse(house); setSelectedCheckboxes(new Set()); setCurrentPage(1); }}
                  >
                    {house.replace('House of ', '')}
                  </button>
                ))}
              </div>

              <div className="flex flex-col md:flex-row gap-[12px] w-full lg:w-auto">
                <button
                  onClick={openArchives}
                  className="w-full md:w-auto flex justify-center items-center gap-[6px] p-[10px_16px] bg-white dark:bg-slate-800 text-[#2E3A59] dark:text-slate-300 border-[1.5px] border-[#cbd5e1] dark:border-slate-600 rounded-[6px] font-bold cursor-pointer text-[0.85rem] transition-all duration-200 hover:bg-[#e2e8f0] dark:hover:bg-slate-700"
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="21 8 21 21 3 21 3 8"></polyline>
                    <rect x="1" y="3" width="22" height="5"></rect>
                    <line x1="10" y1="12" x2="14" y2="12"></line>
                  </svg>
                  Archived Reports
                </button>
                <button
                  onClick={() => setShowReportModal(true)}
                  disabled={!isAllAttendanceConfirmed}
                  className={`w-full md:w-auto flex justify-center items-center gap-[6px] p-[10px_16px] border-none rounded-[6px] font-bold text-[0.85rem] transition-all duration-200 ${isAllAttendanceConfirmed ? 'bg-[#00212e] dark:bg-[#0284c7] text-white shadow-md cursor-pointer hover:bg-[#00435c] dark:hover:bg-[#0369a1] hover:-translate-y-[2px]' : 'bg-[#cbd5e1] dark:bg-slate-700 text-white dark:text-slate-500 cursor-not-allowed opacity-80 shadow-none'}`}
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                    <line x1="16" y1="13" x2="8" y2="13"></line>
                    <line x1="16" y1="17" x2="8" y2="17"></line>
                    <polyline points="10 9 9 9 8 9"></polyline>
                  </svg>
                  Generate Report
                </button>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-[12px] p-[20px] mb-[22px] border border-[#E5E7EB] dark:border-slate-700 shadow-sm transition-colors duration-300">
              <h2 className="text-[0.95rem] text-[#2E3A59] dark:text-slate-300 m-[0_0_16px_0] font-extrabold uppercase tracking-[0.5px]">Attendance Summary - {selectedHouse}</h2>
              <div className="bg-[#f8fafc] dark:bg-slate-900/50 border border-[#E5E7EB] dark:border-slate-700 rounded-[10px] p-[16px_20px]">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-0 border border-[#E5E7EB] dark:border-slate-700 rounded-[8px] overflow-hidden bg-white dark:bg-slate-800">
                  {[
                    { label: 'Total Residents:', value: houseResidents.length, color: 'text-[#00a8e8] dark:text-[#38bdf8]' },
                    { label: 'Present:', value: houseResidents.filter((r) => r.attendance === 'Present').length, color: 'text-[#10b981] dark:text-emerald-400' },
                    { label: 'Not Present:', value: houseResidents.filter((r) => r.attendance === 'Not Present').length, color: 'text-[#e11d48] dark:text-rose-500' },
                    { label: 'With Notes:', value: houseResidents.filter((r) => r.notes && r.notes.trim() !== '').length, color: 'text-[#f59e0b] dark:text-amber-400' },
                  ].map((stat, i, arr) => (
                    <div
                      key={stat.label}
                      className={`flex flex-col items-center gap-[6px] text-center p-[10px] lg:p-[12px_16px] ${i < arr.length - 1 ? 'border-r border-b md:border-b-0 border-[#E5E7EB] dark:border-slate-700' : ''}`}
                    >
                      <span className="text-[0.65rem] text-[#64748b] dark:text-slate-500 font-bold uppercase tracking-[0.5px]">{stat.label}</span>
                      <span className={`text-[2rem] font-black leading-none ${stat.color}`}>{stat.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {selectedCheckboxes.size > 0 && (
              <BulkActionBar
                selectedCount={selectedCheckboxes.size}
                bulkAttendanceValue={bulkAttendanceValue}
                setBulkAttendanceValue={setBulkAttendanceValue}
                onApply={handleBulkAttendanceUpdate}
                onEdit={() => handleEdit(firstSelectedResident)}
                onDelete={handleDeleteResidents}
                onClear={() => setSelectedCheckboxes(new Set())}
                isNurseView={isNurseView}
                showEdit={selectedCheckboxes.size === 1}
              />
            )}

            <div className="flex gap-[16px] mb-[20px] items-center flex-wrap">
              <div className="flex-1 flex items-center gap-[12px] bg-white dark:bg-slate-800 border border-[#E5E7EB] dark:border-slate-600 rounded-[8px] p-[12px_16px] shadow-sm min-w-[280px] focus-within:border-[#00a8e8] dark:focus-within:border-[#38bdf8] focus-within:shadow-[0_0_0_3px_rgba(0,168,232,0.1)] transition-all">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-[18px] h-[18px] text-[#94a3b8] dark:text-slate-500 shrink-0">
                  <circle cx="11" cy="11" r="8"></circle>
                  <path d="m21 21-4.35-4.35"></path>
                </svg>
                <input
                  type="text"
                  placeholder="Search by Resident ID or Name..."
                  value={searchTerm}
                  onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                  className="flex-1 border-none outline-none text-[0.95rem] font-medium text-[#00212e] dark:text-white bg-transparent placeholder:text-[#94a3b8] dark:placeholder:text-slate-500"
                />
              </div>
              <div className="flex gap-[10px] flex-wrap w-full lg:w-auto justify-between lg:justify-start">
                <select
                  value={filterAttendance}
                  onChange={(e) => { setFilterAttendance(e.target.value); setCurrentPage(1); }}
                  className="p-[12px_34px_12px_14px] bg-white dark:bg-slate-800 border border-[#E5E7EB] dark:border-slate-600 rounded-[8px] text-[#00212e] dark:text-white font-bold text-[0.85rem] cursor-pointer shadow-sm outline-none focus:border-[#00a8e8] dark:focus:border-[#38bdf8] appearance-none bg-[url('data:image/svg+xml,%3Csvg_xmlns=%22http://www.w3.org/2000/svg%22_width=%2212%22_height=%228%22_viewBox=%220_0_12_8%22%3E%3Cpath_fill=%22%2300212e%22_d=%22M1_1l5_5_5-5%22/%3E%3C/svg%3E')] dark:bg-[url('data:image/svg+xml,%3Csvg_xmlns=%22http://www.w3.org/2000/svg%22_width=%2212%22_height=%228%22_viewBox=%220_0_12_8%22%3E%3Cpath_fill=%22%23ffffff%22_d=%22M1_1l5_5_5-5%22/%3E%3C/svg%3E')] bg-no-repeat bg-[right_14px_center]"
                >
                  <option value="All">All Attendance</option>
                  <option value="Present">Present</option>
                  <option value="Not Present">Not Present</option>
                </select>
                <select
                  value={filterNotes}
                  onChange={(e) => { setFilterNotes(e.target.value); setCurrentPage(1); }}
                  className="p-[12px_34px_12px_14px] bg-white dark:bg-slate-800 border border-[#E5E7EB] dark:border-slate-600 rounded-[8px] text-[#00212e] dark:text-white font-bold text-[0.85rem] cursor-pointer shadow-sm outline-none focus:border-[#00a8e8] dark:focus:border-[#38bdf8] appearance-none bg-[url('data:image/svg+xml,%3Csvg_xmlns=%22http://www.w3.org/2000/svg%22_width=%2212%22_height=%228%22_viewBox=%220_0_12_8%22%3E%3Cpath_fill=%22%2300212e%22_d=%22M1_1l5_5_5-5%22/%3E%3C/svg%3E')] dark:bg-[url('data:image/svg+xml,%3Csvg_xmlns=%22http://www.w3.org/2000/svg%22_width=%2212%22_height=%228%22_viewBox=%220_0_12_8%22%3E%3Cpath_fill=%22%23ffffff%22_d=%22M1_1l5_5_5-5%22/%3E%3C/svg%3E')] bg-no-repeat bg-[right_14px_center]"
                >
                  <option value="All">All Notes</option>
                  <option value="WithNotes">With Notes</option>
                  <option value="NoNotes">No Notes</option>
                </select>
              </div>
            </div>

            <ResidentTable
              loading={loading}
              currentResidents={currentResidents}
              selectedHouse={selectedHouse}
              selectedCheckboxes={selectedCheckboxes}
              expandedNotesId={expandedNotesId}
              tempNotes={tempNotes}
              setTempNotes={setTempNotes}
              onCheckboxChange={handleCheckboxChange}
              onSelectAll={handleSelectAll}
              onAttendanceChange={handleAttendanceChange}
              onRowClick={handleRowClick}
              onSaveNotes={handleSaveNotes}
              onCloseNotes={handleCloseNotes}
              getFullName={getFullName}
              currentPage={currentPage}
              totalPages={totalPages}
              indexOfFirstItem={indexOfFirstItem}
              indexOfLastItem={indexOfLastItem}
              filteredCount={filteredResidents.length}
              onPageChange={(page) => setCurrentPage(page)}
            />
          </div>
        </main>

        {previewModalOpen && (
          <ImportPreviewModal
            previewData={previewData}
            onEdit={handlePreviewEdit}
            onConfirm={handleConfirmImport}
            onClose={() => { setPreviewModalOpen(false); setPreviewData([]); }}
          />
        )}

        {showReportModal && (
          <ReportModal
            barData={getBarChartData()}
            overallPercentage={overallPercentage}
            isDark={isDark}
            isSavingReport={isSavingReport}
            onSaveAndDownload={handleSaveAndDownloadReport}
            onClose={() => setShowReportModal(false)}
          />
        )}

        {showAddModal && (
          <AddResidentModal
            newResident={newResident}
            setNewResident={setNewResident}
            onSave={handleAddResident}
            onClose={() => { setShowAddModal(false); setNewResident(emptyNewResident()); }}
          />
        )}

        {showEditModal && (
          <EditResidentModal
            editResident={editResident}
            setEditResident={setEditResident}
            onSave={handleSaveEdit}
            onClose={() => { setShowEditModal(false); setEditResident(emptyEditResident()); }}
          />
        )}

        {showDeleteModal && (
          <DeleteResidentModal
            deleteTargetIds={deleteTargetIds}
            residents={residents}
            getFullName={getFullName}
            onConfirm={confirmDelete}
            onCancel={() => { setShowDeleteModal(false); setDeleteTargetIds(new Set()); }}
          />
        )}

        {showArchiveModal && (
          <ArchiveModal
            archivedReports={archivedReports}
            loadingArchives={loadingArchives}
            onDownload={downloadArchivePDF}
            onClose={() => setShowArchiveModal(false)}
          />
        )}

        <div className="fixed bottom-[24px] right-[24px] z-[2000] max-w-[400px] pointer-events-none flex flex-col gap-[12px]">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`bg-white dark:bg-slate-800 rounded-[8px] p-[16px_20px] shadow-lg border-l-[6px] animate-[slideInRight_0.3s_ease] pointer-events-auto font-bold text-[0.95rem] transition-colors duration-300 ${toast.type === 'success' ? 'border-l-[#10b981] text-[#059669] dark:text-emerald-400' : toast.type === 'error' ? 'border-l-[#f43f5e] text-[#e11d48] dark:text-rose-400' : 'border-l-[#00a8e8] text-[#0075a2] dark:text-[#38bdf8]'}`}
            >
              {toast.message}
            </div>
          ))}
        </div>
      </div>
    </>
  );
};

export default EldersDashboard;