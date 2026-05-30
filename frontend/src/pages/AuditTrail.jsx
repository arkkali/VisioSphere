import { useState, useEffect } from 'react';
import Sidebar from '../components/Sidebar';
import { fetchAuditLogs } from '../services/auditService';
import AuditStatsHeader from '../components/audit/AuditStatsHeader';
import AuditFiltersBar from '../components/audit/AuditFiltersBar';
import AuditTable from '../components/audit/AuditTable';
import AuditDetailModal from '../components/audit/AuditDetailModal';

const LOGS_PER_PAGE = 10;

const AuditTrail = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedLog, setSelectedLog] = useState(null);

  const [filterCategory, setFilterCategory] = useState('All');
  const [filterStatus, setFilterStatus] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await fetchAuditLogs();
        setLogs(data);
      } catch {
        setError('Failed to load audit logs. Please try again.');
        setLogs([]);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []); 

  const resetPage = () => setCurrentPage(1);

  const clearFilters = () => {
    setFilterCategory('All');
    setFilterStatus('All');
    setSearchQuery('');
    setDateFilter('all');
    setCurrentPage(1);
  };

  const exportToCSV = () => {
    if (filteredLogs.length === 0) return;
    const headers = ['ID', 'Timestamp', 'Category', 'Event', 'Actor Name', 'Actor Role', 'Status', 'Purpose'];
    const csvRows = filteredLogs.map(log => [
      log._id,
      `"${new Date(log.createdAt).toLocaleString()}"`,
      `"${log.category}"`,
      `"${log.event}"`,
      `"${log.actorName || ''}"`,
      `"${log.actorRole || ''}"`,
      `"${log.status}"`,
      `"${(log.purpose || '').replace(/"/g, '""')}"`
    ].join(','));
    const csvContent = [headers.join(','), ...csvRows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `VisioSphere_Audit_Logs_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  let filteredLogs = logs;

  if (filterCategory !== 'All')
    filteredLogs = filteredLogs.filter(log => log.category === filterCategory);

  if (filterStatus !== 'All')
    filteredLogs = filteredLogs.filter(log => log.status === filterStatus);

  if (searchQuery) {
    const query = searchQuery.toLowerCase();
    filteredLogs = filteredLogs.filter(log =>
      log.event?.toLowerCase().includes(query) ||
      log.actorName?.toLowerCase().includes(query) ||
      log.actorRole?.toLowerCase().includes(query) ||
      JSON.stringify(log.newValues || {}).toLowerCase().includes(query) ||
      JSON.stringify(log.oldValues || {}).toLowerCase().includes(query)
    );
  }

  if (dateFilter !== 'all') {
    const today = new Date();
    filteredLogs = filteredLogs.filter(log => {
      const logDate = new Date(log.createdAt);
      if (dateFilter === 'today') return logDate.toDateString() === today.toDateString();
      if (dateFilter === 'week') return logDate >= new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
      if (dateFilter === 'month') return logDate >= new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
      return true;
    });
  }

  const indexOfLastLog = currentPage * LOGS_PER_PAGE;
  const indexOfFirstLog = indexOfLastLog - LOGS_PER_PAGE;
  const paginatedLogs = filteredLogs.slice(indexOfFirstLog, indexOfLastLog);
  const totalPages = Math.ceil(filteredLogs.length / LOGS_PER_PAGE) || 1;
  const categories = ['All', ...new Set(logs.map(log => log.category).filter(Boolean))];

  return (
    <>
      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { transform: translateY(30px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      `}</style>
      <div className="flex bg-[#f5f7f9] dark:bg-slate-900 min-h-screen w-screen font-['Outfit',sans-serif] transition-colors duration-300">
        <Sidebar />
        <main className="flex-1 ml-0 md:ml-[250px] p-[16px] md:p-[20px] lg:p-[30px] flex flex-col">

          <AuditStatsHeader logs={logs} />

          {error && (
            <div className="mb-[20px] p-[16px] bg-[#fff1f2] dark:bg-rose-950/30 border border-[#fecdd3] dark:border-rose-800 rounded-[12px] text-[#e11d48] dark:text-rose-400 font-medium text-[0.95rem]">
              {error}
            </div>
          )}

          <AuditFiltersBar
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            filterCategory={filterCategory}
            setFilterCategory={setFilterCategory}
            filterStatus={filterStatus}
            setFilterStatus={setFilterStatus}
            dateFilter={dateFilter}
            setDateFilter={setDateFilter}
            categories={categories}
            onClear={clearFilters}
            onExport={exportToCSV}
            onPageReset={resetPage}
          />

          <AuditTable
            loading={loading}
            filteredLogs={filteredLogs}
            paginatedLogs={paginatedLogs}
            currentPage={currentPage}
            totalPages={totalPages}
            indexOfFirstLog={indexOfFirstLog}
            indexOfLastLog={indexOfLastLog}
            onViewDetails={setSelectedLog}
            onPageChange={setCurrentPage}
          />

          {selectedLog && (
            <AuditDetailModal
              log={selectedLog}
              onClose={() => setSelectedLog(null)}
            />
          )}

        </main>
      </div>
    </>
  );
};

export default AuditTrail;