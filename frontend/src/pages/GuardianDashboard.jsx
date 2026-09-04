import { useState, useEffect, useCallback, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import GuardianTable from '../components/guardians/GuardianTable';
import GuardianFilters from '../components/guardians/GuardianFilters';
import GuardianBulkActionBar from '../components/guardians/GuardianBulkActionBar';
import AddGuardianModal from '../components/guardians/AddGuardianModal';
import EditGuardianModal from '../components/guardians/EditGuardianModal';
import DeleteGuardianModal from '../components/guardians/DeleteGuardianModal';
import AssignEldersDrawer from '../components/guardians/AssignEldersDrawer';
import {
  fetchAllGuardians,
  fetchAllResidents,
  addGuardian,
  updateGuardian,
  deleteGuardian,
  linkElder,
  unlinkElder,
} from '../services/guardianService';

const getFullName = (person) => {
  if (!person) return '';
  return [person.firstName, person.middleName, person.lastName].filter(Boolean).join(' ');
};

const EMPTY_NEW_GUARDIAN = {
  firstName: '',
  middleName: '',
  lastName: '',
  email: '',
  phone: '',
  gender: '',
  status: 'PENDING',
};

const GuardianDashboard = () => {
  const [guardians, setGuardians] = useState([]);
  const [residents, setResidents] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOrder, setSortOrder] = useState('default');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [selectedCheckboxes, setSelectedCheckboxes] = useState(new Set());
  const [toasts, setToasts] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showAssignDrawer, setShowAssignDrawer] = useState(false);

  const [deleteTargetIds, setDeleteTargetIds] = useState(new Set());
  const [assignSearchTerm, setAssignSearchTerm] = useState('');
  const [linkingGuardian, setLinkingGuardian] = useState(null);

  const [newGuardian, setNewGuardian] = useState(EMPTY_NEW_GUARDIAN);
  const [editGuardian, setEditGuardian] = useState({
    guardianId: '',
    firstName: '',
    middleName: '',
    lastName: '',
    email: '',
    phone: '',
    gender: '',
    status: '',
  });

  const location = useLocation();
  const isNurseView = location.pathname.includes('/nurse');

  const showToast = useCallback((message, type = 'success') => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000);
  }, []);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const [guardiansData, residentsData] = await Promise.all([
          fetchAllGuardians(),
          fetchAllResidents(),
        ]);
        setGuardians(guardiansData);
        setResidents(residentsData);
      } catch {
        showToast('Failed to load data from database', 'error');
        setGuardians([]);
        setResidents([]);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleNameInput = (setter, field, value) => {
    const lettersOnly = value.replace(/[^a-zA-Z\s-]/g, '');
    setter((prev) => ({ ...prev, [field]: lettersOnly }));
  };

  const handlePhoneInput = (setter, field, value) => {
    let numbersOnly = value.replace(/\D/g, '');
    if (numbersOnly.startsWith('63')) {
      numbersOnly = '0' + numbersOnly.slice(2);
    } else if (numbersOnly.length > 0 && numbersOnly[0] !== '0') {
      numbersOnly = '0' + numbersOnly;
    }
    setter((prev) => ({ ...prev, [field]: numbersOnly.slice(0, 11) }));
  };

  const handleCheckboxChange = (guardianId) => {
    setSelectedCheckboxes((prev) => {
      const next = new Set(prev);
      next.has(guardianId) ? next.delete(guardianId) : next.add(guardianId);
      return next;
    });
  };

  const handleSelectAll = (checked) => {
    setSelectedCheckboxes(checked ? new Set(currentGuardians.map((g) => g.guardianId)) : new Set());
  };

  const handleStatusChange = async (guardianId, newStatus) => {
    const previous = guardians.find((g) => g.guardianId === guardianId);
    if (!previous) return;

    setGuardians((prev) =>
      prev.map((g) => (g.guardianId === guardianId ? { ...g, status: newStatus } : g))
    );

    try {
      const updated = await updateGuardian(guardianId, {
        firstName: previous.firstName,
        middleName: previous.middleName,
        lastName: previous.lastName,
        email: previous.email,
        phone: previous.phone,
        gender: previous.gender,
        status: newStatus,
      });
      setGuardians((prev) => prev.map((g) => (g.guardianId === guardianId ? updated : g)));
      showToast('Account status updated successfully!', 'success');
    } catch (err) {
      setGuardians((prev) => prev.map((g) => (g.guardianId === guardianId ? previous : g)));
      showToast(`Failed to update status: ${err.response?.data?.message || err.message}`, 'error');
    }
  };

  const filteredGuardians = useMemo(() => {
    return guardians
      .filter((guardian) => {
        const fullName = getFullName(guardian);
        const assigned = guardian.assignedElders?.length > 0
          ? guardian.assignedElders.map((e) => `${e.firstName} ${e.lastName}`).join(', ')
          : 'None';
        const matchesSearch =
          guardian.guardianId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          guardian.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          assigned.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesStatus = statusFilter === 'ALL' || guardian.status?.toUpperCase() === statusFilter;
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
  }, [guardians, searchTerm, sortOrder, statusFilter]);

  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentGuardians = filteredGuardians.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(filteredGuardians.length / itemsPerPage);

  const handleAddGuardian = async () => {
    if (!newGuardian.firstName.trim() || !newGuardian.lastName.trim() || !newGuardian.email.trim()) {
      showToast('Please provide all required fields (*).', 'error');
      return;
    }
    if (newGuardian.phone && (newGuardian.phone.length !== 11 || !newGuardian.phone.startsWith('0'))) {
      showToast('Phone number must be exactly 11 digits and start with 0.', 'error');
      return;
    }
    try {
      const created = await addGuardian(newGuardian);
      setGuardians((prev) => [...prev, created]);
      setShowAddModal(false);
      setNewGuardian(EMPTY_NEW_GUARDIAN);
      showToast('Guardian account provisioned successfully!', 'success');
    } catch (err) {
      showToast(`Provisioning Error: ${err.response?.data?.message || err.message}`, 'error');
    }
  };

  const handleEditClick = (guardianId) => {
    const guardian = guardians.find((g) => g.guardianId === guardianId);
    if (!guardian) return;
    setEditGuardian({
      guardianId: guardian.guardianId,
      firstName: guardian.firstName,
      middleName: guardian.middleName || '',
      lastName: guardian.lastName,
      email: guardian.email || '',
      phone: guardian.phone || '',
      gender: guardian.gender || '',
      status: guardian.status || 'PENDING',
      // Drives the modal's lock: the status field is the system's until the
      // guardian has set their password.
      isPasswordSet: !!guardian.isPasswordSet,
    });
    setShowEditModal(true);
  };

  const handleSaveEdit = async () => {
    if (!editGuardian.firstName.trim() || !editGuardian.lastName.trim() || !editGuardian.email.trim()) {
      showToast('Please provide all required fields (*).', 'error');
      return;
    }
    if (editGuardian.phone && (editGuardian.phone.length !== 11 || !editGuardian.phone.startsWith('0'))) {
      showToast('Phone number must be exactly 11 digits and start with 0.', 'error');
      return;
    }
    try {
      const updated = await updateGuardian(editGuardian.guardianId, {
        firstName: editGuardian.firstName.trim(),
        middleName: editGuardian.middleName.trim(),
        lastName: editGuardian.lastName.trim(),
        email: editGuardian.email.trim(),
        phone: editGuardian.phone.trim(),
        gender: editGuardian.gender,
        status: editGuardian.status,
      });
      setGuardians((prev) => prev.map((g) => (g.guardianId === editGuardian.guardianId ? updated : g)));
      setShowEditModal(false);
      setSelectedCheckboxes(new Set());
      showToast('Guardian account updated successfully!', 'success');
    } catch (err) {
      showToast(`Update Error: ${err.response?.data?.message || err.message}`, 'error');
    }
  };

  const handleDeleteClick = () => {
    if (selectedCheckboxes.size === 0) return;
    setDeleteTargetIds(new Set(selectedCheckboxes));
    setShowDeleteModal(true);
  };

  const cancelDelete = () => {
    setShowDeleteModal(false);
    setDeleteTargetIds(new Set());
  };

  const confirmDelete = async () => {
    const snapshot = Array.from(deleteTargetIds);
    const previousGuardians = [...guardians];

    setGuardians((prev) => prev.filter((g) => !deleteTargetIds.has(g.guardianId)));
    setSelectedCheckboxes(new Set());
    setDeleteTargetIds(new Set());
    setShowDeleteModal(false);

    try {
      await Promise.all(snapshot.map((id) => deleteGuardian(id)));
      showToast(`${snapshot.length} account(s) deleted successfully.`, 'success');
    } catch {
      setGuardians(previousGuardians);
      setShowDeleteModal(false);
      showToast('Error deleting accounts. Changes reverted.', 'error');
    }
  };

  const openAssignDrawer = (guardianId) => {
    const guardian = guardians.find((g) => g.guardianId === guardianId);
    setLinkingGuardian(guardian);
    setAssignSearchTerm('');
    setShowAssignDrawer(true);
  };

  const handleLinkElder = async (residentId) => {
    const previous = { ...linkingGuardian };
    try {
      const updated = await linkElder(linkingGuardian.guardianId, residentId);
      setGuardians((prev) => prev.map((g) => (g.guardianId === updated.guardianId ? updated : g)));
      setLinkingGuardian(updated);
      showToast('Elder assigned successfully!', 'success');
    } catch (err) {
      setLinkingGuardian(previous);
      showToast(`Error assigning elder: ${err.response?.data?.message || err.message}`, 'error');
    }
  };

  const handleUnlinkElder = async (residentId) => {
    const previous = { ...linkingGuardian };
    try {
      const updated = await unlinkElder(linkingGuardian.guardianId, residentId);
      setGuardians((prev) => prev.map((g) => (g.guardianId === updated.guardianId ? updated : g)));
      setLinkingGuardian(updated);
      showToast('Elder unassigned successfully.', 'success');
    } catch (err) {
      setLinkingGuardian(previous);
      showToast(`Error unassigning elder: ${err.response?.data?.message || err.message}`, 'error');
    }
  };

  const availableResidentsToAssign = useMemo(() => {
    if (!linkingGuardian) return [];
    const assignedIds = (linkingGuardian.assignedElders || []).map((e) => e.residentId);
    return residents.filter(
      (r) =>
        !assignedIds.includes(r.residentId) &&
        (r.firstName.toLowerCase().includes(assignSearchTerm.toLowerCase()) ||
          r.lastName.toLowerCase().includes(assignSearchTerm.toLowerCase()) ||
          r.residentId.toLowerCase().includes(assignSearchTerm.toLowerCase()))
    );
  }, [residents, linkingGuardian, assignSearchTerm]);

  const firstSelectedGuardian = selectedCheckboxes.size > 0 ? Array.from(selectedCheckboxes)[0] : null;

  return (
    <>
      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideInRight { from { opacity: 0; transform: translateX(100%); } to { opacity: 1; transform: translateX(0); } }
        @keyframes modalPop { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background-color: #cbd5e1; border-radius: 10px; }
        .dark .custom-scrollbar::-webkit-scrollbar-thumb { background-color: #475569; }
      `}</style>

      <div className="flex bg-[#F8FAFC] dark:bg-slate-900 min-h-screen w-screen font-['Outfit',sans-serif] overflow-x-hidden transition-colors duration-300">
        <Sidebar />

        <main className="flex-1 ml-0 md:ml-[250px] p-[24px] lg:p-[40px] max-w-[100vw]">
          <div className="max-w-[1400px] mx-auto">

            <div className="flex flex-col lg:flex-row justify-between lg:items-center mb-[32px] pb-[24px] border-b border-[#e2e8f0] dark:border-slate-800 gap-[16px] transition-colors duration-300">
              <div>
                <h1 className="text-[2rem] lg:text-[2.5rem] text-[#00212e] dark:text-white m-0 font-extrabold tracking-[-0.5px]">Guardians Management</h1>
                <p className="text-[#64748b] dark:text-slate-400 text-[1rem] m-0 mt-[4px] font-medium">Provision and manage family and guardian accounts.</p>
              </div>
              <button
                className="w-full lg:w-auto flex justify-center items-center gap-[8px] bg-[#00a8e8] dark:bg-[#0284c7] text-white border-none p-[12px_24px] rounded-[8px] font-bold cursor-pointer transition-all duration-200 text-[0.9rem] shadow-[0_4px_12px_rgba(0,168,232,0.25)] dark:shadow-[0_4px_12px_rgba(2,132,199,0.4)] hover:bg-[#0088b8] dark:hover:bg-[#0369a1] hover:-translate-y-[2px]"
                onClick={() => setShowAddModal(true)}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-[18px] h-[18px]">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                Provision Account
              </button>
            </div>

            <GuardianBulkActionBar
              selectedCount={selectedCheckboxes.size}
              onEdit={() => handleEditClick(firstSelectedGuardian)}
              onDelete={handleDeleteClick}
              onClear={() => setSelectedCheckboxes(new Set())}
              isNurseView={isNurseView}
            />

            <GuardianFilters
              searchTerm={searchTerm}
              onSearchChange={(val) => { setSearchTerm(val); setCurrentPage(1); }}
              sortOrder={sortOrder}
              onSortChange={setSortOrder}
              statusFilter={statusFilter}
              onStatusChange={(val) => { setStatusFilter(val); setCurrentPage(1); }}
            />

            <GuardianTable
              loading={loading}
              currentGuardians={currentGuardians}
              selectedCheckboxes={selectedCheckboxes}
              onCheckboxChange={handleCheckboxChange}
              onSelectAll={handleSelectAll}
              onStatusChange={handleStatusChange}
              onAssignClick={openAssignDrawer}
              currentPage={currentPage}
              totalPages={totalPages}
              indexOfFirstItem={indexOfFirstItem}
              indexOfLastItem={indexOfLastItem}
              filteredTotal={filteredGuardians.length}
              onPageChange={setCurrentPage}
            />

          </div>
        </main>

        {showAssignDrawer && linkingGuardian && (
          <AssignEldersDrawer
            linkingGuardian={linkingGuardian}
            availableResidents={availableResidentsToAssign}
            assignSearchTerm={assignSearchTerm}
            onSearchChange={setAssignSearchTerm}
            onLink={handleLinkElder}
            onUnlink={handleUnlinkElder}
            onClose={() => setShowAssignDrawer(false)}
          />
        )}

        {showAddModal && (
          <AddGuardianModal
            newGuardian={newGuardian}
            onChange={(field, value) => setNewGuardian((prev) => ({ ...prev, [field]: value }))}
            onNameInput={(field, value) => handleNameInput(setNewGuardian, field, value)}
            onPhoneInput={(field, value) => handlePhoneInput(setNewGuardian, field, value)}
            onClose={() => setShowAddModal(false)}
            onSubmit={handleAddGuardian}
          />
        )}

        {showEditModal && (
          <EditGuardianModal
            editGuardian={editGuardian}
            onChange={(field, value) => setEditGuardian((prev) => ({ ...prev, [field]: value }))}
            onNameInput={(field, value) => handleNameInput(setEditGuardian, field, value)}
            onPhoneInput={(field, value) => handlePhoneInput(setEditGuardian, field, value)}
            onClose={() => setShowEditModal(false)}
            onSubmit={handleSaveEdit}
          />
        )}

        {showDeleteModal && (
          <DeleteGuardianModal
            deleteTargetIds={deleteTargetIds}
            guardians={guardians}
            onCancel={cancelDelete}
            onConfirm={confirmDelete}
          />
        )}

        <div className="fixed bottom-[24px] right-[24px] z-[3000] flex flex-col gap-[12px] max-w-[400px] pointer-events-none">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`p-[16px_20px] rounded-[8px] font-bold text-[0.95rem] shadow-lg animate-[slideInRight_0.3s_ease] pointer-events-auto border-l-[6px] bg-white dark:bg-slate-800 transition-colors duration-300 ${
                toast.type === 'success'
                  ? 'border-l-[#10b981] text-[#059669] dark:text-emerald-400'
                  : toast.type === 'error'
                  ? 'border-l-[#e11d48] text-[#be123c] dark:text-rose-400'
                  : 'border-l-[#00a8e8] text-[#0075a2] dark:text-[#38bdf8]'
              }`}
            >
              {toast.message}
            </div>
          ))}
        </div>
      </div>
    </>
  );
};

export default GuardianDashboard;