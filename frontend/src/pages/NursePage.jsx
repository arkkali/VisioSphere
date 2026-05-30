import React, { useState, useEffect, useRef } from 'react';
import Sidebar from '../components/Sidebar';
import nurseService from '../services/nurseService';
import NurseTable from '../components/nurses/NurseTable';
import AssignDrawer from '../components/nurses/AssignDrawer';
import AddNurseModal from '../components/nurses/AddNurseModal';
import EditNurseModal from '../components/nurses/EditNurseModal';
import DeleteNurseModal from '../components/nurses/DeleteNurseModal';

const HOUSES = [
  'House of St. Charbel',
  'House of St. Francis',
  'House of St. Gabriel',
  'House of St. Rose of Lima',
  'House of St. Sebastian',
  'Louis S. Coson Hall',
];

const getFullName = (person) => {
  if (!person) return 'Unknown';
  return [person.firstName, person.middleName, person.lastName].filter(Boolean).join(' ');
};

const EMPTY_NEW_NURSE = {
  firstName: '',
  middleName: '',
  lastName: '',
  email: '',
  houseAssigned: HOUSES[0],
};

const EMPTY_EDIT_NURSE = {
  nurseId: '',
  firstName: '',
  middleName: '',
  lastName: '',
  email: '',
  houseAssigned: HOUSES[0],
  status: 'Active',
};

const NursePage = () => {
  const [nurses, setNurses] = useState([]);
  const [elders, setElders] = useState([]);

  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('All');
  const [sortOrder, setSortOrder] = useState('default');
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const [selectedCheckboxes, setSelectedCheckboxes] = useState(new Set());
  const [toasts, setToasts] = useState([]);
  const toastIdCounter = useRef(0);

  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTargetIds, setDeleteTargetIds] = useState(new Set());

  const [assignDrawerOpen, setAssignDrawerOpen] = useState(false);
  const [activeNurseForAssign, setActiveNurseForAssign] = useState(null);
  const [elderSearchTerm, setElderSearchTerm] = useState('');

  const [newNurse, setNewNurse] = useState(EMPTY_NEW_NURSE);
  const [editNurse, setEditNurse] = useState(EMPTY_EDIT_NURSE);

  const showToast = (message, type = 'success') => {
    const id = toastIdCounter.current++;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  };

  useEffect(() => {
    nurseService.getAllNurses()
      .then((data) => setNurses(data))
      .catch(() => setNurses([]))
      .finally(() => setLoading(false));
  }, []);

  const fetchElders = async () => {
    try {
      const data = await nurseService.getAllResidents();
      setElders(data);
    } catch {
      showToast('Could not load elders list.', 'error');
    }
  };

  const handleCheckboxChange = (nurseId) => {
    const next = new Set(selectedCheckboxes);
    if (next.has(nurseId)) next.delete(nurseId);
    else next.add(nurseId);
    setSelectedCheckboxes(next);
  };

  const handleSelectAll = (e) => {
    if (e.target.checked) setSelectedCheckboxes(new Set(currentNurses.map((n) => n.nurseId)));
    else setSelectedCheckboxes(new Set());
  };

  const handleStatusChange = async (nurseId, newStatus) => {
    const previous = nurses.find((n) => n.nurseId === nurseId);
    setNurses((prev) => prev.map((n) => n.nurseId === nurseId ? { ...n, status: newStatus } : n));
    try {
      await nurseService.updateNurseStatus(nurseId, newStatus);
      showToast(`Status updated to ${newStatus}`, 'success');
    } catch {
      setNurses((prev) => prev.map((n) => n.nurseId === nurseId ? previous : n));
      showToast('Failed to update status', 'error');
    }
  };

  const filteredNurses = nurses
    .filter((nurse) => {
      const fullName = getFullName(nurse);
      const matchesSearch =
        nurse.nurseId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        fullName.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = filterStatus === 'All' || nurse.status === filterStatus;
      return matchesSearch && matchesStatus;
    })
    .sort((a, b) => {
      if (sortOrder === 'default') return 0;
      const nameA = getFullName(a).toLowerCase();
      const nameB = getFullName(b).toLowerCase();
      if (sortOrder === 'asc') return nameA.localeCompare(nameB);
      if (sortOrder === 'desc') return nameB.localeCompare(nameA);
      return 0;
    });

  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentNurses = filteredNurses.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(filteredNurses.length / itemsPerPage);

  const handleAddNurse = async () => {
    if (!newNurse.firstName.trim() || !newNurse.lastName.trim() || !newNurse.email.trim()) {
      showToast('Please fill in all required fields.', 'error');
      return;
    }
    if (!newNurse.email.includes('@')) {
      showToast('Please enter a valid email address.', 'error');
      return;
    }
    setIsSubmitting(true);
    try {
      const created = await nurseService.addNurse({ ...newNurse, isFirstLogin: true });
      setNurses((prev) => [...prev, created]);
      setShowAddModal(false);
      setNewNurse(EMPTY_NEW_NURSE);
      showToast('Nurse provisioned successfully! They must complete setup via email.', 'success');
    } catch (err) {
      const msg = err.response?.data?.error || err.response?.data?.message || err.message;
      showToast(`Error: ${msg}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenEdit = (nurseId) => {
    const nurse = nurses.find((n) => n.nurseId === nurseId);
    if (!nurse) return;
    setEditNurse({
      nurseId: nurse.nurseId,
      firstName: nurse.firstName,
      middleName: nurse.middleName || '',
      lastName: nurse.lastName,
      email: nurse.email || '',
      houseAssigned: nurse.houseAssigned,
      status: nurse.status || 'Active',
    });
    setShowEditModal(true);
  };

  const handleSaveEdit = async () => {
    if (!editNurse.firstName.trim() || !editNurse.lastName.trim() || !editNurse.email.trim()) {
      showToast('Please fill in all required fields.', 'error');
      return;
    }
    setIsSubmitting(true);
    try {
      const updated = await nurseService.updateNurse(editNurse.nurseId, {
        firstName: editNurse.firstName.trim(),
        middleName: editNurse.middleName.trim(),
        lastName: editNurse.lastName.trim(),
        email: editNurse.email.trim(),
        houseAssigned: editNurse.houseAssigned,
        status: editNurse.status,
      });
      setNurses((prev) => prev.map((n) => n.nurseId === editNurse.nurseId ? updated : n));
      setShowEditModal(false);
      setSelectedCheckboxes(new Set());
      showToast('Nurse updated successfully!', 'success');
    } catch (err) {
      const msg = err.response?.data?.error || err.response?.data?.message || err.message;
      showToast(`Error: ${msg}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteNurses = () => {
    if (selectedCheckboxes.size === 0) {
      showToast('Please select at least one nurse to delete.', 'error');
      return;
    }
    setDeleteTargetIds(new Set(selectedCheckboxes));
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    try {
      await Promise.all(Array.from(deleteTargetIds).map((id) => nurseService.deleteNurse(id)));
      const count = deleteTargetIds.size;
      setNurses((prev) => prev.filter((n) => !deleteTargetIds.has(n.nurseId)));
      setSelectedCheckboxes(new Set());
      setDeleteTargetIds(new Set());
      setShowDeleteModal(false);
      showToast(`${count} nurse(s) deleted successfully!`, 'success');
    } catch (err) {
      showToast(`Error deleting: ${err.response?.data?.message || err.message}`, 'error');
    }
  };

  const openAssignDrawer = (nurse) => {
    setActiveNurseForAssign(nurse);
    setAssignDrawerOpen(true);
    if (elders.length === 0) fetchElders();
  };

  const handleAssignElder = async (elder) => {
    if (!activeNurseForAssign) return;
    const currentAssigned = activeNurseForAssign.assignedElders || [];
    if (currentAssigned.length >= 10) {
      showToast('Maximum of 10 elders can be assigned to a nurse.', 'warning');
      return;
    }
    try {
      await nurseService.assignElder(activeNurseForAssign.nurseId, elder._id);
      const updated = { ...activeNurseForAssign, assignedElders: [...currentAssigned, elder] };
      setActiveNurseForAssign(updated);
      setNurses((prev) => prev.map((n) => n.nurseId === updated.nurseId ? updated : n));
      showToast(`${getFullName(elder)} assigned to ${activeNurseForAssign.firstName}.`, 'success');
    } catch {
      showToast('Failed to assign elder.', 'error');
    }
  };

  const handleUnassignElder = async (elderId) => {
    if (!activeNurseForAssign) return;
    try {
      await nurseService.unassignElder(activeNurseForAssign.nurseId, elderId);
      const updatedElders = (activeNurseForAssign.assignedElders || []).filter(
        (e) => String(e._id) !== String(elderId)
      );
      const updated = { ...activeNurseForAssign, assignedElders: updatedElders };
      setActiveNurseForAssign(updated);
      setNurses((prev) => prev.map((n) => n.nurseId === updated.nurseId ? updated : n));
      showToast('Elder unassigned successfully.', 'success');
    } catch {
      showToast('Failed to unassign elder.', 'error');
    }
  };

  const firstSelectedNurse = selectedCheckboxes.size > 0 ? Array.from(selectedCheckboxes)[0] : null;

  return (
    <>
      <style>{`
        @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideInRight { from { opacity: 0; transform: translateX(100%); } to { opacity: 1; transform: translateX(0); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      `}</style>

      <div className="flex bg-[#F8FAFC] dark:bg-slate-900 min-h-screen w-screen font-['Outfit',sans-serif] transition-colors duration-300">
        <Sidebar />
        <main className="flex-1 ml-0 md:ml-[250px] p-[24px] lg:p-[40px] bg-[#F8FAFC] dark:bg-slate-900 transition-colors duration-300">
          <div className="max-w-[1400px] mx-auto">

            <div className="flex flex-col md:flex-row justify-between md:items-center gap-[15px] mb-[30px] pb-[20px] border-b-2 border-[#E5E7EB] dark:border-slate-800 transition-colors duration-300">
              <div>
                <h1 className="text-[1.8rem] lg:text-[2.2rem] text-[#00212e] dark:text-white m-0 font-extrabold tracking-[-0.5px]">Nurses Management</h1>
                <p className="text-[#2E3A59] dark:text-slate-400 text-[0.95rem] m-0 mt-[4px] font-medium">Provision and manage medical staff accounts.</p>
              </div>
              <button
                className="w-full md:w-auto flex items-center justify-center gap-[8px] bg-[#00a8e8] dark:bg-[#0284c7] text-white border-none p-[12px_24px] rounded-[8px] font-bold cursor-pointer transition-all duration-300 text-[0.95rem] shadow-[0_4px_12px_rgba(0,168,232,0.25)] dark:shadow-[0_4px_12px_rgba(2,132,199,0.4)] hover:bg-[#0075a2] dark:hover:bg-[#0369a1] hover:shadow-[0_6px_16px_rgba(0,168,232,0.35)] dark:hover:shadow-[0_6px_16px_rgba(2,132,199,0.5)] hover:-translate-y-[2px]"
                onClick={() => setShowAddModal(true)}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-[18px] h-[18px]">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                Provision Account
              </button>
            </div>

            {selectedCheckboxes.size > 0 && (
              <div className="flex flex-col md:flex-row justify-between md:items-center bg-[#e1f5fe] dark:bg-[#0284c7]/20 border border-[#00a8e8] dark:border-[#38bdf8] rounded-[8px] p-[14px_20px] mb-[24px] gap-[12px] shadow-sm animate-[slideUp_0.2s_ease-out]">
                <span className="font-bold text-[#00435c] dark:text-[#38bdf8] text-[0.95rem] flex items-center gap-[8px] before:content-[''] before:w-[8px] before:h-[8px] before:bg-[#00a8e8] dark:before:bg-[#38bdf8] before:rounded-full before:inline-block">
                  {selectedCheckboxes.size} nurse(s) selected
                </span>
                <div className="flex flex-col md:flex-row gap-[12px] md:items-center justify-end w-full md:w-auto">
                  {selectedCheckboxes.size === 1 && (
                    <button
                      className="w-full md:w-auto flex items-center justify-center gap-[6px] p-[10px_20px] bg-[#00435c] dark:bg-slate-800 text-white border-none rounded-[6px] font-bold text-[0.85rem] cursor-pointer transition-all duration-200 whitespace-nowrap hover:bg-[#00212e] dark:hover:bg-slate-700 hover:-translate-y-[2px]"
                      onClick={() => handleOpenEdit(firstSelectedNurse)}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-[16px] h-[16px]">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                      </svg>
                      Edit Data
                    </button>
                  )}
                  <button
                    className="w-full md:w-auto flex items-center justify-center gap-[6px] p-[10px_20px] bg-[#ffe4e6] dark:bg-rose-950/30 text-[#e11d48] dark:text-rose-400 border border-[#fda4af] dark:border-rose-900/50 rounded-[6px] font-bold text-[0.85rem] cursor-pointer transition-colors duration-200 whitespace-nowrap hover:bg-[#fecdd3] dark:hover:bg-rose-900/50"
                    onClick={handleDeleteNurses}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-[16px] h-[16px]">
                      <polyline points="3 6 5 6 21 6"></polyline>
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                      <line x1="10" y1="11" x2="10" y2="17"></line>
                      <line x1="14" y1="11" x2="14" y2="17"></line>
                    </svg>
                    Delete ({selectedCheckboxes.size})
                  </button>
                  <button
                    className="w-full md:w-auto p-[10px_20px] bg-white dark:bg-slate-800 text-[#2E3A59] dark:text-slate-300 border border-[#A8A8A8] dark:border-slate-600 rounded-[6px] font-bold text-[0.85rem] cursor-pointer transition-colors duration-200 whitespace-nowrap hover:bg-[#E5E7EB] dark:hover:bg-slate-700"
                    onClick={() => setSelectedCheckboxes(new Set())}
                  >
                    Clear Selection
                  </button>
                </div>
              </div>
            )}

            <div className="flex flex-col lg:flex-row gap-[15px] lg:gap-[20px] mb-[24px] lg:items-center flex-wrap">
              <div className="flex-1 flex items-center gap-[12px] bg-white dark:bg-slate-800 border border-[#A8A8A8] dark:border-slate-600 rounded-[8px] p-[14px_16px] shadow-sm min-w-[100%] lg:min-w-[300px] focus-within:border-[#00a8e8] dark:focus-within:border-[#38bdf8] focus-within:shadow-[0_0_0_3px_rgba(0,168,232,0.1)] transition-all">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-[18px] h-[18px] text-[#A8A8A8] dark:text-slate-500 shrink-0">
                  <circle cx="11" cy="11" r="8"></circle>
                  <path d="m21 21-4.35-4.35"></path>
                </svg>
                <input
                  type="text"
                  placeholder="Search by Nurse ID or Name..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="flex-1 border-none outline-none text-[0.95rem] text-[#00212e] dark:text-white font-medium bg-transparent placeholder:text-[#A8A8A8] dark:placeholder:text-slate-500"
                />
              </div>

              <div className="w-full lg:w-auto flex gap-[8px] flex-wrap justify-between lg:justify-start">
                <button
                  className={`p-[10px_16px] border rounded-[6px] font-bold text-[0.8rem] tracking-[0.5px] cursor-pointer transition-colors duration-200 whitespace-nowrap uppercase ${sortOrder === 'asc' ? 'bg-[#00a8e8] dark:bg-[#0284c7] text-white border-[#00a8e8] dark:border-[#0284c7]' : 'bg-white dark:bg-slate-800 text-[#2E3A59] dark:text-slate-300 border-[#E5E7EB] dark:border-slate-600 hover:border-[#00a8e8] dark:hover:border-[#38bdf8] hover:text-[#00a8e8] dark:hover:text-[#38bdf8]'}`}
                  onClick={() => setSortOrder(sortOrder === 'asc' ? 'default' : 'asc')}
                >
                  A-Z ↓
                </button>
                <button
                  className={`p-[10px_16px] border rounded-[6px] font-bold text-[0.8rem] tracking-[0.5px] cursor-pointer transition-colors duration-200 whitespace-nowrap uppercase ${sortOrder === 'desc' ? 'bg-[#00a8e8] dark:bg-[#0284c7] text-white border-[#00a8e8] dark:border-[#0284c7]' : 'bg-white dark:bg-slate-800 text-[#2E3A59] dark:text-slate-300 border-[#E5E7EB] dark:border-slate-600 hover:border-[#00a8e8] dark:hover:border-[#38bdf8] hover:text-[#00a8e8] dark:hover:text-[#38bdf8]'}`}
                  onClick={() => setSortOrder(sortOrder === 'desc' ? 'default' : 'desc')}
                >
                  Z-A ↑
                </button>
              </div>

              <div className="w-full lg:w-auto flex gap-[8px] flex-wrap justify-between lg:justify-start">
                {['All', 'Active', 'Inactive', 'On Leave'].map((status) => (
                  <button
                    key={status}
                    className={`p-[10px_16px] border rounded-[6px] font-bold text-[0.8rem] tracking-[0.5px] cursor-pointer transition-colors duration-200 whitespace-nowrap uppercase ${filterStatus === status ? 'bg-[#00a8e8] dark:bg-[#0284c7] text-white border-[#00a8e8] dark:border-[#0284c7]' : 'bg-white dark:bg-slate-800 text-[#2E3A59] dark:text-slate-300 border-[#E5E7EB] dark:border-slate-600 hover:border-[#00a8e8] dark:hover:border-[#38bdf8] hover:text-[#00a8e8] dark:hover:text-[#38bdf8]'}`}
                    onClick={() => setFilterStatus(status)}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </div>

            <NurseTable
              loading={loading}
              currentNurses={currentNurses}
              selectedCheckboxes={selectedCheckboxes}
              onCheckboxChange={handleCheckboxChange}
              onSelectAll={handleSelectAll}
              onStatusChange={handleStatusChange}
              onOpenAssignDrawer={openAssignDrawer}
              currentPage={currentPage}
              totalPages={totalPages}
              indexOfFirstItem={indexOfFirstItem}
              indexOfLastItem={indexOfLastItem}
              filteredTotal={filteredNurses.length}
              onPageChange={setCurrentPage}
            />

          </div>
        </main>

        <AssignDrawer
          open={assignDrawerOpen}
          nurse={activeNurseForAssign}
          elders={elders}
          elderSearchTerm={elderSearchTerm}
          onSearchChange={setElderSearchTerm}
          onClose={() => setAssignDrawerOpen(false)}
          onAssign={handleAssignElder}
          onUnassign={handleUnassignElder}
        />

        <AddNurseModal
          show={showAddModal}
          onClose={() => setShowAddModal(false)}
          nurse={newNurse}
          onChange={(field, value) => setNewNurse((prev) => ({ ...prev, [field]: value }))}
          onSubmit={handleAddNurse}
          isSubmitting={isSubmitting}
        />

        <EditNurseModal
          show={showEditModal}
          onClose={() => setShowEditModal(false)}
          nurse={editNurse}
          onChange={(field, value) => setEditNurse((prev) => ({ ...prev, [field]: value }))}
          onSubmit={handleSaveEdit}
          isSubmitting={isSubmitting}
        />

        <DeleteNurseModal
          show={showDeleteModal}
          onClose={() => { setShowDeleteModal(false); setDeleteTargetIds(new Set()); }}
          onConfirm={confirmDelete}
          deleteTargetIds={deleteTargetIds}
          nurses={nurses}
        />

        <div className="fixed bottom-[24px] right-[24px] z-[2000] flex flex-col gap-[12px] max-w-[400px]">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`p-[16px_20px] rounded-[8px] font-bold text-[0.95rem] shadow-lg animate-[slideInRight_0.3s_ease-out] border-l-[6px] transition-colors duration-300 ${toast.type === 'success' ? 'bg-white dark:bg-slate-800 text-[#059669] dark:text-emerald-400 border-l-[#10b981]' : toast.type === 'error' ? 'bg-white dark:bg-slate-800 text-[#e11d48] dark:text-rose-400 border-l-[#f43f5e]' : 'bg-white dark:bg-slate-800 text-[#d97706] dark:text-amber-500 border-l-[#f59e0b]'}`}
            >
              {toast.message}
            </div>
          ))}
        </div>
      </div>
    </>
  );
};

export default NursePage;