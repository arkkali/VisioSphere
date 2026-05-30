import { useNavigate } from 'react-router-dom';

const NotFoundPage = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen w-screen bg-[#f1f5f9] flex flex-col items-center justify-center font-['Outfit',sans-serif]">
      <div className="text-center">
        <h1 className="text-[120px] font-black text-[#00a8e8] leading-none m-0">404</h1>
        <h2 className="text-[24px] font-black text-[#00212e] mt-4 mb-2 tracking-tight">Page Not Found</h2>
        <p className="text-[#64748b] font-medium mb-8">The page you are looking for does not exist or you do not have access.</p>
        <button
          onClick={() => navigate('/')}
          className="px-8 py-3 bg-[#00a8e8] text-white font-bold rounded-xl hover:bg-[#0089bd] transition-colors duration-200 shadow-md"
        >
          Return to Login
        </button>
      </div>
    </div>
  );
};

export default NotFoundPage;