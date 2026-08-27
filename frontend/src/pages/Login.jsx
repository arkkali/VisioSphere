import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import visioSphereLogo from '../assets/visioSphereLogo.png'; 
import matandaAnime from '../assets/MatandaAnime.png';
import { useTheme } from '../context/ThemeContext';
import { isNurseId, isAdminId, isEmail as isEmailIdentifier } from '../constants/idRoles';

/**
 * Pull the `facility` claim out of a JWT payload.
 *
 * Returns '' when the claim is absent (a token minted before facility
 * separation) — housesForCurrentUser() then yields an empty list, which is an
 * obvious, reportable bug rather than a silent fallback to every house.
 * JWTs are base64url, so the alphabet must be translated before atob().
 */
const facilityFromToken = (token) => {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(payload)).facility || '';
  } catch {
    return '';
  }
};

const nurseDisplayName = (nurse) => nurse.displayName?.trim()
  || `${nurse.firstName || ''} ${nurse.lastName || ''}`.trim()
  || 'Nurse';

const UserIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
    <circle cx="12" cy="7" r="4"></circle>
  </svg>
);

const LockIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
  </svg>
);

const EyeIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
    <circle cx="12" cy="12" r="3"></circle>
  </svg>
);

const EyeOffIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
    <line x1="1" y1="1" x2="23" y2="23"></line>
  </svg>
);

const Login = () => {
  const navigate = useNavigate();
  const { setTheme } = useTheme();
  
  const [isSplashActive, setIsSplashActive] = useState(true);
  const [isSplashFading, setIsSplashFading] = useState(false);
  const [loginSuccess, setLoginSuccess] = useState(false);
  const [loggedInName, setLoggedInName] = useState('');
  const [loggedInRole, setLoggedInRole] = useState('');
  const [currentView, setCurrentView] = useState('login'); 
  const [isVisible, setIsVisible] = useState(false);
  const [isAnimatingIn, setIsAnimatingIn] = useState(false); 

  const [loginId, setLoginId] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  // Which credential fields the user has actually visited. The Login button is
  // disabled while either is empty, which left people staring at a dead button
  // with nothing telling them why. Messages appear only after a field has been
  // focused and left, so the form does not shout at someone who simply has not
  // started typing.
  const [touched, setTouched] = useState({ id: false, password: false });
  const markTouched = (field) => setTouched((t) => ({ ...t, [field]: true }));
  const [rememberMe, setRememberMe] = useState(false);
  
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [showDocModal, setShowDocModal] = useState(null);

  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockoutTimer, setLockoutTimer] = useState(0);
  const timerRef = useRef(null);
  const splashTimerRef = useRef(null);

  const [recoveryRole, setRecoveryRole] = useState('Admin');
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [otpStep, setOtpStep] = useState('request'); 
  const [otpCode, setOtpCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  
  const [twoFaCode, setTwoFaCode] = useState('');
  const [twoFaFailedAttempts, setTwoFaFailedAttempts] = useState(0);
  const [tempAuthData, setTempAuthData] = useState(null);

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const API_BASE_URL = import.meta.env.VITE_API_URL;

  useEffect(() => {
    splashTimerRef.current = setTimeout(() => {
      setIsSplashFading(true);
      setTimeout(() => {
        setIsSplashActive(false);
        setIsAnimatingIn(true); 
        setTimeout(() => {
            setIsVisible(true);
            setIsAnimatingIn(false); 
        }, 50); 
      }, 600); 
    }, 2500);

    const savedId = localStorage.getItem('visioSphere_savedId');
    const savedPass = localStorage.getItem('visioSphere_savedPass');
    
    if (savedId && savedPass) {
      setLoginId(savedId);
      setLoginPassword(savedPass);
      setRememberMe(true);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (splashTimerRef.current) clearTimeout(splashTimerRef.current);
    };
  }, []); 

  const switchView = (view) => {
    setCurrentView(view);
    setError('');
    setOtpStep('request');
    setRecoveryEmail('');
    setOtpCode('');
    setNewPassword('');
    setConfirmPassword('');
    setShowNewPassword(false);
    setTwoFaCode('');
    setTwoFaFailedAttempts(0);
    setTermsAccepted(false);
    setPrivacyAccepted(false);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    
    if (lockoutTimer > 0) return;

    setError('');
    setLoading(true);

    const checkId = loginId.trim();
    // Role comes from the id prefix; the ADMIN prefix varies per facility
    // (A- for Graces, STA- for Saint Anthony), so it must not be hardcoded.
    // See constants/idRoles.js.
    const isNurseLogin = isNurseId(checkId);
    const isAdminLogin = isAdminId(checkId);
    const isEmail = isEmailIdentifier(checkId);

    if (!isNurseLogin && !isAdminLogin && !isEmail) {
      setError('Invalid format or credentials provided.');
      setLoading(false);
      return;
    }

    try {
      let isNursePath = isNurseLogin; 
      let endpoint = isNursePath 
        ? `${API_BASE_URL}/nurses/auth/login` 
        : `${API_BASE_URL}/admin/login`;

      let payload = isNursePath
        ? { nurseId: checkId, password: loginPassword }
        : { customId: checkId, password: loginPassword };

      let response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (isEmail && (response.status === 404 || response.status === 401)) {
        isNursePath = true;
        endpoint = `${API_BASE_URL}/nurses/auth/login`;
        payload = { nurseId: checkId, password: loginPassword };
        
        response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }

      const data = await response.json();

      if (response.ok) {
        if (data.isFirstLogin) {
          setError("First-time login detected. Please use the Account Setup option to secure your account.");
          setLoading(false);
          return; 
        }

        if (data.requires2FA) {
          setTempAuthData({ ...data, isNursePath });
          setTwoFaCode('');
          setTwoFaFailedAttempts(0);
          setCurrentView('2fa');
          setLoading(false);
          return;
        }

        if (rememberMe) {
          localStorage.setItem('visioSphere_savedId', loginId);
          localStorage.setItem('visioSphere_savedPass', loginPassword);
        } else {
          localStorage.removeItem('visioSphere_savedId');
          localStorage.removeItem('visioSphere_savedPass');
        }

        setFailedAttempts(0);
        localStorage.setItem('token', data.token);
        // Facility is read out of the JWT rather than the response body, so the
        // client can never disagree with what the backend enforces. Drives the
        // house dropdowns in constants/houses.js.
        localStorage.setItem('facility', facilityFromToken(data.token));

        let userName = '';
        let userRole = '';
        let userId = '';
        let userTheme = 'default';

        const userData = data.admin || data.nurse || data.user || {};
        userTheme = userData.theme || 'default';

        if (isNursePath) {
          userName = nurseDisplayName(userData);
          userRole = 'Nurse';
          userId = userData.nurseId || loginId;
          
          localStorage.setItem('nurseId', userId);
          localStorage.setItem('nurseName', userName);
          localStorage.removeItem('adminId');
          localStorage.removeItem('adminName');
          localStorage.removeItem('adminProfilePic');

          if (userData.profilePic) {
            localStorage.setItem('nurseProfilePic', userData.profilePic);
          } else {
            localStorage.removeItem('nurseProfilePic');
          }
        } else {
          userName = userData.name || 'Admin';
          userRole = userData.role || 'Facility Admin';
          userId = userData.customId || loginId;

          localStorage.setItem('adminId', userId);
          localStorage.setItem('adminName', userName);
          localStorage.removeItem('nurseId');
          localStorage.removeItem('nurseName');
          localStorage.removeItem('nurseProfilePic');

          if (userData.profilePic) {
            localStorage.setItem('adminProfilePic', userData.profilePic);
          } else {
            localStorage.removeItem('adminProfilePic'); 
          }
        }

        localStorage.setItem('userId', userId);
        localStorage.setItem('userName', userName);
        localStorage.setItem('userRole', userRole);
        localStorage.setItem('appTheme', userTheme);

        setTheme(userTheme);
        setLoggedInName(userName);
        setLoggedInRole(userRole);
        setLoginSuccess(true);
        setLoading(false);

        setTimeout(() => {
          if (userRole === 'Nurse') {
            navigate('/nurse');
          } else {
            navigate('/admin');
          }
        }, 1800);

      } else {
        const newFailedCount = failedAttempts + 1;
        setFailedAttempts(newFailedCount);

        if (newFailedCount >= 3) {
          setError('Too many failed attempts. Please wait 1 minute.');
          setLockoutTimer(60);
          
          timerRef.current = setInterval(() => {
            setLockoutTimer((prev) => {
              if (prev <= 1) {
                clearInterval(timerRef.current);
                setFailedAttempts(0);
                return 0;
              }
              return prev - 1;
            });
          }, 1000);
        } else {
          setError(data.message || `Account not found or invalid credentials.`);
        }
        setLoading(false);
      }
    } catch (error) {
      console.error('Login error:', error);
      setError('Connection error. Please make sure the backend is running.');
      setLoading(false);
    }
  };

  const handleVerify2FA = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const isNursePath = tempAuthData?.isNursePath ?? !!tempAuthData?.nurse;
      const endpoint = isNursePath
        ? `${API_BASE_URL}/nurses/auth/verify-2fa`
        : `${API_BASE_URL}/admin/verify-2fa`;
      const payload = isNursePath
        ? { nurseId: tempAuthData.nurse.nurseId, pin: twoFaCode }
        : { customId: tempAuthData?.admin?.customId || loginId, pin: twoFaCode };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (response.ok) {
        if (rememberMe) {
          localStorage.setItem('visioSphere_savedId', loginId);
          localStorage.setItem('visioSphere_savedPass', loginPassword);
        }

        localStorage.setItem('token', data.token);
        // Facility is read out of the JWT rather than the response body, so the
        // client can never disagree with what the backend enforces. Drives the
        // house dropdowns in constants/houses.js.
        localStorage.setItem('facility', facilityFromToken(data.token));

        const userData = data.nurse || data.admin || {};
        const userTheme = userData.theme || 'default';

        let userName = '';
        let userRole = '';
        let userId = '';

        if (isNursePath) {
          userName = nurseDisplayName(userData);
          userRole = 'Nurse';
          userId = userData.nurseId || loginId;

          localStorage.setItem('nurseId', userId);
          localStorage.setItem('nurseName', userName);
          localStorage.removeItem('adminId');
          localStorage.removeItem('adminName');
          localStorage.removeItem('adminProfilePic');

          if (userData.profilePic) {
            localStorage.setItem('nurseProfilePic', userData.profilePic);
          } else {
            localStorage.removeItem('nurseProfilePic');
          }
        } else {
          userName = userData.name || 'Admin';
          userRole = userData.role || 'Facility Admin';
          userId = userData.customId || loginId;

          localStorage.setItem('adminId', userId);
          localStorage.setItem('adminName', userName);
          localStorage.removeItem('nurseId');
          localStorage.removeItem('nurseName');
          localStorage.removeItem('nurseProfilePic');

          if (userData.profilePic) {
            localStorage.setItem('adminProfilePic', userData.profilePic);
          } else {
            localStorage.removeItem('adminProfilePic');
          }
        }

        localStorage.setItem('userId', userId);
        localStorage.setItem('userName', userName);
        localStorage.setItem('userRole', userRole);
        localStorage.setItem('appTheme', userTheme);
        setTheme(userTheme);

        setLoggedInName(userName);
        setLoggedInRole(userRole);
        setLoginSuccess(true);
        setLoading(false);

        setTimeout(() => {
          if (userRole === 'Nurse') {
            navigate('/nurse');
          } else {
            navigate('/admin');
          }
        }, 1800);

      } else {
        const newFails = twoFaFailedAttempts + 1;
        setTwoFaFailedAttempts(newFails);
        
        if (newFails >= 3) {
          setError('Maximum 2FA attempts reached. Account locked for 1 minute.');
          setLockoutTimer(60);
          setCurrentView('login');
          setTempAuthData(null);
          
          timerRef.current = setInterval(() => {
            setLockoutTimer((prev) => {
              if (prev <= 1) {
                clearInterval(timerRef.current);
                setFailedAttempts(0);
                setTwoFaFailedAttempts(0);
                return 0;
              }
              return prev - 1;
            });
          }, 1000);
        } else {
          setError(data.message || `Invalid PIN. You have ${3 - newFails} attempts left.`);
        }
        setLoading(false);
      }
    } catch (error) {
      console.error('Verify 2FA error:', error);
      setError('Connection error.');
      setLoading(false);
    }
  };

  const handleRequestOTP = async (e) => {
    e.preventDefault();
    if (currentView === 'first-time' && (!termsAccepted || !privacyAccepted)) {
      return setError('Please read and accept the required terms to proceed.');
    }
    setError('');
    setLoading(true);

    try {
      const endpoint = recoveryRole === 'Nurse' 
        ? `${API_BASE_URL}/nurses/auth/request-otp`
        : `${API_BASE_URL}/admin/request-otp`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: recoveryEmail })
      });

      const data = await response.json();

      if (response.ok) {
        setOtpStep('verify');
      } else {
        setError(data.message || 'Failed to send OTP.');
      }
    } catch (error) {
      console.error('Request OTP error:', error);
      setError('Connection error.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const endpoint = recoveryRole === 'Nurse' 
        ? `${API_BASE_URL}/nurses/auth/verify-otp`
        : `${API_BASE_URL}/admin/verify-otp`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: recoveryEmail, otpCode })
      });

      const data = await response.json();

      if (response.ok) {
        setOtpStep('reset');
      } else {
        setError(data.message || 'Invalid OTP code.');
      }
    } catch (error) {
      console.error('Verify OTP error:', error);
      setError('Connection error.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      return setError('Passwords do not match');
    }

    setError('');
    setLoading(true);

    try {
      const endpoint = recoveryRole === 'Nurse' 
        ? `${API_BASE_URL}/nurses/auth/reset-password`
        : `${API_BASE_URL}/admin/reset-password`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: recoveryEmail, otpCode, newPassword, confirmPassword })
      });

      const data = await response.json();

      if (response.ok) {
        setCurrentView('reset-success');
        setTimeout(() => {
          switchView('login');
        }, 3000);
      } else {
        setError(data.message || 'Failed to reset password.');
      }
    } catch (error) {
      console.error('Reset password error:', error);
      setError('Connection error.');
    } finally {
      setLoading(false);
    }
  };

  const isLoginDisabled = loading || lockoutTimer > 0 || !loginId || !loginPassword;

  if (isSplashActive) {
    return (
      <>
        <style>{`
          @keyframes blurReveal {
            0% { filter: blur(20px); opacity: 0; transform: scale(0.8); }
            100% { filter: blur(0px); opacity: 1; transform: scale(1); }
          }
          @keyframes floatingLogo {
            0% { transform: translateY(0px); }
            50% { transform: translateY(-15px); }
            100% { transform: translateY(0px); }
          }
          @keyframes letterFade {
            0% { opacity: 0; transform: translateY(10px); }
            100% { opacity: 1; transform: translateY(0); }
          }
          @keyframes sweepGlow {
            0% { left: -100%; }
            100% { left: 200%; }
          }
          @keyframes progressFill {
            0% { width: 0%; opacity: 0.5; }
            50% { opacity: 1; }
            100% { width: 100%; opacity: 0.8; }
          }
          .letter { display: inline-block; opacity: 0; animation: letterFade 0.4s cubic-bezier(0.2, 0.8, 0.2, 1) forwards; }
          .l-1 { animation-delay: 0.1s; } .l-2 { animation-delay: 0.15s; } .l-3 { animation-delay: 0.2s; }
          .l-4 { animation-delay: 0.25s; } .l-5 { animation-delay: 0.3s; } .l-6 { animation-delay: 0.35s; }
          .l-7 { animation-delay: 0.4s; } .l-8 { animation-delay: 0.45s; } .l-9 { animation-delay: 0.5s; }
          .l-10 { animation-delay: 0.55s; } .l-11 { animation-delay: 0.6s; }
        `}</style>
        <div className={`fixed inset-0 w-screen h-screen bg-gradient-to-br from-[#00212e] via-[#00435c] to-[#001822] z-[99999] flex flex-col justify-center items-center font-['Outfit',sans-serif] transition-all duration-700 ease-in-out ${isSplashFading ? 'opacity-0 scale-105' : 'opacity-100 scale-100'} overflow-hidden`}>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,168,232,0.15)_0%,transparent_60%)]"></div>
          <div className="absolute w-[800px] h-[800px] border border-white/5 rounded-full top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-[spin_60s_linear_infinite]"></div>
          <div className="absolute w-[600px] h-[600px] border border-white/5 rounded-full top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-[spin_40s_linear_infinite_reverse]"></div>
          
          <div className="flex flex-col items-center z-10 [animation:blurReveal_0.8s_cubic-bezier(0.16,1,0.3,1)_forwards]">
            <div className="relative mb-[30px] [animation:floatingLogo_4s_ease-in-out_infinite]">
              <div className="absolute inset-0 bg-[#00a8e8] blur-[40px] opacity-20 rounded-full"></div>
              <img src={visioSphereLogo} alt="VisioSphere Logo" className="h-[120px] md:h-[150px] w-auto drop-shadow-[0_10px_25px_rgba(0,0,0,0.5)] relative z-10" style={{ filter: 'brightness(0) invert(1)' }} />
            </div>

            <h1 className="text-white text-[42px] md:text-[54px] font-extrabold tracking-tight m-0 drop-shadow-lg relative overflow-hidden pb-[5px]">
              <span className="letter l-1">V</span><span className="letter l-2">i</span><span className="letter l-3">s</span><span className="letter l-4">i</span><span className="letter l-5">o</span>
              <span className="letter l-6 text-[#00a8e8]">S</span><span className="letter l-7 text-[#00a8e8]">p</span><span className="letter l-8 text-[#00a8e8]">h</span><span className="letter l-9 text-[#00a8e8]">e</span><span className="letter l-10 text-[#00a8e8]">r</span><span className="letter l-11 text-[#00a8e8]">e</span>
              <div className="absolute top-0 bottom-0 w-[50px] bg-gradient-to-r from-transparent via-white/40 to-transparent skew-x-[-20deg] [animation:sweepGlow_2.5s_ease-in-out_infinite]"></div>
            </h1>

            <div className="mt-[20px] flex items-center gap-[12px] opacity-0 [animation:letterFade_0.5s_ease-out_0.8s_forwards]">
              <div className="h-[1px] w-[30px] bg-gradient-to-r from-transparent to-[#90e0ef]/60"></div>
              <p className="text-[#90e0ef] text-[13px] font-bold tracking-[0.3em] uppercase m-0 drop-shadow-md">System Initialization</p>
              <div className="h-[1px] w-[30px] bg-gradient-to-l from-transparent to-[#90e0ef]/60"></div>
            </div>
          </div>

          <div className="absolute bottom-[80px] w-[280px] h-[3px] bg-white/10 rounded-full overflow-hidden shadow-inner opacity-0 [animation:letterFade_0.5s_ease-out_1s_forwards]">
            <div className="h-full bg-gradient-to-r from-[#0075a2] via-[#00a8e8] to-[#90e0ef] rounded-full [animation:progressFill_2.5s_cubic-bezier(0.2,0.8,0.2,1)_forwards] shadow-[0_0_15px_rgba(0,168,232,0.8)] relative">
              <div className="absolute right-0 top-0 bottom-0 w-[20px] bg-white/50 blur-[2px]"></div>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <style>{`
        @keyframes scaleIn { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        @keyframes shrinkBar { from { width: 100%; } to { width: 0%; } }
        @keyframes fadeInOverlay { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUpContent { to { opacity: 1; transform: translateY(0); } }
        @keyframes fadeInPanel { from { opacity: 0; transform: translateY(15px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fadeSlideIn { from { opacity: 0; transform: translateX(-15px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes floatImage { 0% { transform: translateY(0px); } 50% { transform: translateY(-12px); } 100% { transform: translateY(0px); } }
      `}</style>

      {showDocModal && (
        <div className="fixed inset-0 z-[999999] flex items-center justify-center bg-[#00212e]/80 backdrop-blur-sm p-4 [animation:fadeInOverlay_0.3s_ease-out_forwards]">
          <div className="bg-white rounded-2xl w-full max-w-2xl p-6 md:p-8 shadow-2xl flex flex-col max-h-[85vh] [animation:scaleIn_0.3s_cubic-bezier(0.16,1,0.3,1)_forwards]">
            <h3 className="text-[24px] font-extrabold text-[#0f172a] mb-[16px] tracking-tight">
              {showDocModal === 'terms' ? 'Terms of Service' : 'Privacy Policy'}
            </h3>
            <div className="flex-1 overflow-y-auto pr-[10px] text-[#475569] text-[14px] leading-relaxed space-y-[16px]">
              <p className="font-bold text-[#0f172a]">Effective Date: {new Date().toLocaleDateString()}</p>
              <p>This system is the proprietary property of the Government-Supported Elder Care Facility management. Unauthorized access, use, or modification of this system or of the data contained herein is strictly prohibited and may subject you to criminal prosecution and civil penalties.</p>
              <p>By accessing this system, you agree that your actions may be monitored and recorded. You consent to the strict adherence to all operational protocols regarding patient and facility data confidentiality.</p>
              <p>All personal and medical records contained within this dashboard are protected under national health information privacy laws. You agree to utilize this information solely for authorized care administration and acknowledge that improper sharing of this data will result in immediate termination of access and potential legal action.</p>
              <p>If you require assistance or clarification regarding these policies, please contact your immediate supervisor or the Facility Administrator.</p>
            </div>
            <div className="mt-[24px] pt-[20px] border-t border-[#e2e8f0] flex justify-end">
              <button onClick={() => setShowDocModal(null)} className="px-[24px] py-[12px] bg-[#f1f5f9] hover:bg-[#e2e8f0] text-[#0f172a] font-bold rounded-xl transition-colors duration-200">
                Acknowledge & Close
              </button>
            </div>
          </div>
        </div>
      )}

      <div className={`relative min-h-screen w-screen overflow-y-auto lg:overflow-hidden bg-[#D8F3FF] flex flex-col lg:flex-row transition-opacity duration-1000 ${isAnimatingIn ? "opacity-0" : isVisible ? "opacity-100" : "opacity-0"} font-['Outfit',sans-serif]`}>
        
        {loginSuccess && (
          <div className="fixed inset-0 w-screen h-screen bg-[#00212e]/95 backdrop-blur-md z-[9999] flex justify-center items-center [animation:fadeInOverlay_0.4s_ease-out_forwards]">
            <div className="text-center text-white opacity-0 translate-y-[20px] [animation:slideUpContent_0.6s_cubic-bezier(0.16,1,0.3,1)_forwards_0.2s] flex flex-col items-center">
              <div className="w-[70px] h-[70px] border-[3px] border-white/10 border-t-[#00a8e8] rounded-full mx-auto mb-[30px] animate-spin"></div>
              
              {loggedInRole.includes('Admin') ? (
                <>
                  <h2 className="text-[38px] md:text-[46px] m-0 mb-[6px] font-extrabold tracking-tight text-white drop-shadow-md">Welcome back, Admin</h2>
                  <h3 className="text-[20px] md:text-[24px] text-[#90e0ef] m-0 mb-[24px] font-medium tracking-wide">{loggedInName}</h3>
                </>
              ) : (
                <>
                  <h2 className="text-[38px] md:text-[46px] m-0 mb-[6px] font-extrabold tracking-tight text-white drop-shadow-md">Welcome back, Nurse</h2>
                  <h3 className="text-[20px] md:text-[24px] text-[#90e0ef] m-0 mb-[24px] font-medium tracking-wide">{loggedInName}</h3>
                </>
              )}
              
              <p className="text-[16px] text-white/80 m-0 font-light tracking-wide animate-pulse">Preparing your dashboard...</p>
            </div>
          </div>
        )}

        <svg
          className={`absolute bottom-0 left-0 w-[90%] h-[90%] z-[0] pointer-events-none transition-all duration-1000 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${isAnimatingIn ? 'translate-y-[80%] scale-110 opacity-0' : isVisible ? 'translate-y-[61%] scale-150 opacity-100' : 'translate-y-[80%] scale-110 opacity-0'}`}
          style={{ transform: `rotate(130deg) translateY(${isVisible ? '61%' : '80%'}) scale(${isVisible ? 1.51 : 1.1})` }}
          xmlns="http://www.w3.org/2000/svg"
          width="1440"
          height="600"
          viewBox="0 0 1580 650"
          preserveAspectRatio="none"
        >
          <g mask="url(#mask)">
            <path
              d="M 0,221 C 57.6,201 172.8,131 288,121 C 403.2,111 460.8,172.4 576,171 C 691.2,169.6 748.8,108.8 864,114 C 979.2,119.2 1036.8,207.4 1152,197 C 1267.2,186.6 1382.4,89 1440,62 L 1440 560 L 0 560 Z"
              fill="rgba(34, 104, 177, 1)"
            />
            <path
              d="M 0,310 C 96,340.6 288,445.6 480,463 C 672,480.4 768,399 960,397 C 1152,395 1344,441.8 1440,453 L 1440 560 L 0 560 Z"
              fill="rgba(85, 158, 235, 1)"
            />
          </g>
          <defs>
            <mask id="mask">
              <rect width="1640" height="560" fill="#fff" />
            </mask>
          </defs>
        </svg>

        <div
          className={`absolute top-[24px] left-[24px] lg:top-[40px] lg:left-[48px] flex items-center z-10 transition-all duration-1000 delay-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
            isAnimatingIn ? "opacity-0 -translate-x-12" : isVisible ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-12"
          }`}
        >
          <img
            src={visioSphereLogo}
            alt="VisioSphere Logo"
            className="h-[50px] md:h-[65px] w-auto drop-shadow-lg hover:scale-105 transition-transform duration-300 cursor-pointer"
          />
          <span className="text-white text-[26px] md:text-[34px] font-bold -ml-[4px] tracking-wide drop-shadow-md">
            VisioSphere
          </span>
        </div>

        <div className="flex-none lg:flex-1 flex flex-col justify-center items-center p-[80px_20px_40px] lg:p-[40px] relative z-10 min-h-[40vh] lg:min-h-screen pt-[120px] lg:pt-[40px]">
          <div
            className={`flex flex-col items-center justify-center w-full max-w-[600px] transition-all duration-1000 delay-[400ms] ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
              isAnimatingIn ? "opacity-0 translate-y-[40px] scale-95" : isVisible ? "opacity-100 translate-y-0 scale-100 lg:translate-x-[40px]" : "opacity-0 translate-y-[40px] scale-95"
            }`}
          >
            <img
              src={matandaAnime}
              alt="Elderly Care Illustration"
              className="w-full h-auto object-contain drop-shadow-[0_20px_40px_rgba(0,33,46,0.15)] [animation:floatImage_6s_ease-in-out_infinite]"
            />
          </div>
        </div>

        <div className={`flex-1 flex justify-center items-center p-[20px] lg:p-[60px] z-10 relative transition-all duration-1000 delay-[500ms] ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
            isAnimatingIn ? "opacity-0 translate-x-[40px]" : isVisible ? "opacity-100 translate-x-0" : "opacity-0 translate-x-[40px]"
          }`}
        >
          <div className="w-full max-w-[460px] bg-white p-[40px_30px] lg:p-[50px_40px] rounded-[32px] shadow-[0_25px_50px_-12px_rgba(0,33,46,0.15)] border border-[#e2e8f0]/60 box-border transition-all duration-300 hover:shadow-[0_30px_60px_-15px_rgba(0,33,46,0.2)]">
            {currentView === 'login' && (
              <div className="[animation:fadeInPanel_0.4s_ease-out_forwards]">
                <div className="[animation:fadeSlideIn_0.4s_ease-out_forwards]">
                  <h2 className="text-[#00212e] text-[30px] font-extrabold m-0 mb-[10px] tracking-tight">System Login</h2>
                  <p className="text-[#64748b] text-[15px] m-0 mb-[35px] font-medium leading-relaxed">Secure access to your care management dashboard.</p>
                  
                  {error && <div className="text-[#e74c3c] bg-[#e74c3c]/10 p-[14px] rounded-xl text-[14px] mb-[25px] font-medium leading-[1.4] border border-[#e74c3c]/20 [animation:scaleIn_0.2s_ease-out]">{error}</div>}
                  
                  <form onSubmit={handleLogin}>
                    <div className="mb-[24px] text-left group relative">
                      <label className="block mb-[10px] text-[#475569] font-bold text-[12px] tracking-[0.08em] uppercase transition-colors group-focus-within:text-primary-blue">EMAIL/EMPLOYEE ID</label>
                      <div className="relative w-full flex items-center">
                        <div className="absolute left-[16px] z-10 text-[#94a3b8] flex items-center justify-center pointer-events-none transition-colors group-focus-within:text-primary-blue">
                          <UserIcon />
                        </div>
                        <input 
                          type="text" 
                          autoComplete="off"
                          className="w-full p-[14px_18px_14px_48px] border border-[#cbd5e1] rounded-xl text-[15px] transition-all duration-300 bg-[#f8fafc] text-[#0f172a] placeholder:text-[#94a3b8] focus:outline-none focus:border-primary-blue focus:bg-white focus:ring-[4px] focus:ring-[#00a8e8]/15 focus:scale-[1.01] disabled:bg-[#f1f5f9] disabled:text-[#94a3b8] disabled:cursor-not-allowed box-border font-medium shadow-sm hover:border-[#94a3b8]" 
                          placeholder="Enter credentials"
                          value={loginId}
                          onChange={(e) => setLoginId(e.target.value)}
                          onBlur={() => markTouched('id')}
                          disabled={loading || lockoutTimer > 0}
                          required 
                        />
                      </div>
                    </div>
                      {touched.id && !loginId && (
                        <p role="alert" className="mt-[8px] text-[12px] font-bold text-[#dc2626]">
                          Email or Employee ID is required.
                        </p>
                      )}
                    
                    <div className="mb-[20px] text-left group relative">
                      <label className="block mb-[10px] text-[#475569] font-bold text-[12px] tracking-[0.08em] uppercase transition-colors group-focus-within:text-primary-blue">Password</label>
                      <div className="relative w-full flex items-center">
                        <div className="absolute left-[16px] z-10 text-[#94a3b8] flex items-center justify-center pointer-events-none transition-colors group-focus-within:text-primary-blue">
                          <LockIcon />
                        </div>
                        <input 
                          type={showLoginPassword ? "text" : "password"} 
                          autoComplete="off"
                          className="w-full p-[14px_48px_14px_48px] border border-[#cbd5e1] rounded-xl text-[15px] transition-all duration-300 bg-[#f8fafc] text-[#0f172a] placeholder:text-[#94a3b8] focus:outline-none focus:border-primary-blue focus:bg-white focus:ring-[4px] focus:ring-[#00a8e8]/15 focus:scale-[1.01] disabled:bg-[#f1f5f9] disabled:text-[#94a3b8] disabled:cursor-not-allowed box-border font-medium shadow-sm hover:border-[#94a3b8]" 
                          placeholder="Enter password"
                          value={loginPassword}
                          onChange={(e) => setLoginPassword(e.target.value)}
                          onBlur={() => markTouched('password')}
                          disabled={loading || lockoutTimer > 0}
                          required 
                        />
                        <button 
                          type="button" 
                          onClick={() => setShowLoginPassword(!showLoginPassword)}
                          tabIndex="-1"
                          disabled={loading || lockoutTimer > 0}
                          className="absolute right-[16px] bg-none border-none text-[#94a3b8] hover:text-[#475569] flex items-center justify-center p-0 transition-all duration-200 z-10 hover:scale-110 active:scale-95"
                          style={{
                            cursor: (loading || lockoutTimer > 0) ? 'default' : 'pointer',
                            opacity: (loading || lockoutTimer > 0) ? 0.5 : 1
                          }}
                        >
                          {showLoginPassword ? <EyeOffIcon /> : <EyeIcon />}
                        </button>
                      </div>
                    </div>
                      {touched.password && !loginPassword && (
                        <p role="alert" className="mt-[8px] text-[12px] font-bold text-[#dc2626]">
                          Password is required.
                        </p>
                      )}

                    <div className="flex items-center justify-between mb-[30px] group">
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={rememberMe}
                            onChange={(e) => setRememberMe(e.target.checked)}
                            disabled={loading || lockoutTimer > 0}
                            size="small"
                            sx={{
                              color: '#cbd5e1',
                              '&.Mui-checked': { color: '#00a8e8' },
                              padding: '4px',
                              transition: 'transform 0.2s',
                              '&:hover': { transform: 'scale(1.1)' }
                            }}
                          />
                        }
                        label={
                          <span className="text-[12px] font-bold text-[#475569] uppercase tracking-[0.05em] cursor-pointer group-hover:text-primary-blue transition-colors">
                            REMEMBER ME
                          </span>
                        }
                        sx={{ m: 0, marginLeft: '-4px' }}
                      />
                    </div>
                    
                    {(!loginId || !loginPassword) && lockoutTimer === 0 && !loading && (
                      <p className="mb-[12px] text-[13px] font-semibold text-[#64748b] text-center">
                        Complete both required fields to enable Login.
                      </p>
                    )}
                    <button 
                      type="submit" 
                      className="w-full p-[16px] bg-gradient-to-r from-primary-blue to-[#0089bd] text-white border-none rounded-xl text-[16px] font-bold tracking-wide transition-all duration-300 hover:not(:disabled):to-[#0075a2] hover:not(:disabled):-translate-y-[2px] hover:not(:disabled):shadow-[0_10px_25px_rgba(0,168,232,0.4)] active:not(:disabled):scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed shadow-[0_4px_14px_rgba(0,168,232,0.25)] relative overflow-hidden group" 
                      disabled={isLoginDisabled}
                      style={{
                        background: lockoutTimer > 0 ? '#94a3b8' : undefined,
                        cursor: isLoginDisabled ? 'not-allowed' : undefined
                      }}
                    >
                      <span className="relative z-10">
                        {lockoutTimer > 0 
                          ? `Locked (${lockoutTimer}s)` 
                          : loading ? 'Signing in...' : 'Login'}
                      </span>
                      {!isLoginDisabled && <div className="absolute inset-0 h-full w-full bg-white/20 scale-x-0 group-hover:scale-x-100 origin-left transition-transform duration-500 ease-out z-0"></div>}
                    </button>
                  </form>
                </div>

                <div className="flex justify-center items-center gap-[12px] mt-[35px] pt-[25px] border-t border-[#f1f5f9]">
                  <button type="button" className="text-[#64748b] hover:text-primary-blue bg-none border-none text-[14px] font-bold cursor-pointer p-[5px] transition-all duration-200 hover:-translate-y-[1px] disabled:opacity-50 disabled:cursor-not-allowed" onClick={() => switchView('first-time')} disabled={loading}>
                    Account Setup
                  </button>
                  <span className="text-[#cbd5e1] select-none text-[10px]">●</span>
                  <button type="button" className="text-[#64748b] hover:text-primary-blue bg-none border-none text-[14px] font-bold cursor-pointer p-[5px] transition-all duration-200 hover:-translate-y-[1px] disabled:opacity-50 disabled:cursor-not-allowed" onClick={() => switchView('troubles')} disabled={loading}>
                    Recovery & Help
                  </button>
                </div>
              </div>
            )}

            {currentView === '2fa' && (
              <div className="[animation:fadeInPanel_0.4s_ease-out_forwards]">
                <h2 className="text-[#00212e] text-[30px] font-extrabold m-0 mb-[10px] tracking-tight">Security Check</h2>
                <p className="text-[#64748b] text-[15px] m-0 mb-[35px] font-medium leading-relaxed">Enter your secure PIN to continue.</p>
                {error && <div className="text-[#e74c3c] bg-[#e74c3c]/10 p-[14px] rounded-xl text-[14px] mb-[25px] font-medium leading-[1.4] border border-[#e74c3c]/20 [animation:scaleIn_0.2s_ease-out]">{error}</div>}
                
                <form onSubmit={handleVerify2FA}>
                  <div className="mb-[35px] text-left group relative">
                    <label className="block mb-[10px] text-[#475569] font-bold text-[12px] tracking-[0.08em] uppercase transition-colors group-focus-within:text-primary-blue">6-Digit PIN</label>
                    <div className="relative w-full flex items-center">
                      <div className="absolute left-[16px] z-10 text-[#94a3b8] flex items-center justify-center pointer-events-none transition-colors group-focus-within:text-primary-blue">
                        <LockIcon />
                      </div>
                      <input 
                        type={showLoginPassword ? "text" : "password"} 
                        autoComplete="off"
                        className="w-full p-[16px_48px_16px_48px] tracking-[10px] text-[20px] text-center font-bold border border-[#cbd5e1] rounded-xl transition-all duration-300 bg-[#f8fafc] text-[#0f172a] placeholder:text-[#cbd5e1] focus:outline-none focus:border-primary-blue focus:bg-white focus:ring-[4px] focus:ring-[#00a8e8]/15 focus:scale-[1.01] disabled:bg-[#f1f5f9] disabled:text-[#94a3b8] disabled:cursor-not-allowed box-border shadow-sm hover:border-[#94a3b8]" 
                        placeholder="••••••"
                        value={twoFaCode}
                        onChange={(e) => setTwoFaCode(e.target.value.replace(/\D/g, ''))}
                        disabled={loading}
                        required 
                        maxLength="6"
                      />
                      <button 
                        type="button" 
                        onClick={() => setShowLoginPassword(!showLoginPassword)}
                        tabIndex="-1"
                        className="absolute right-[16px] bg-none border-none text-[#94a3b8] hover:text-[#475569] flex items-center justify-center p-0 cursor-pointer z-10 transition-all duration-200 hover:scale-110 active:scale-95"
                      >
                        {showLoginPassword ? <EyeOffIcon /> : <EyeIcon />}
                      </button>
                    </div>
                  </div>
                  <button type="submit" className="w-full p-[16px] bg-gradient-to-r from-primary-blue to-[#0089bd] text-white border-none rounded-xl text-[16px] font-bold tracking-wide transition-all duration-300 hover:not(:disabled):to-[#0075a2] hover:not(:disabled):-translate-y-[2px] hover:not(:disabled):shadow-[0_10px_25px_rgba(0,168,232,0.4)] active:not(:disabled):scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed shadow-[0_4px_14px_rgba(0,168,232,0.25)] relative overflow-hidden group" disabled={loading || twoFaCode.length < 4}>
                    <span className="relative z-10">{loading ? 'Verifying...' : 'Verify & Login'}</span>
                    {!(loading || twoFaCode.length < 4) && <div className="absolute inset-0 h-full w-full bg-white/20 scale-x-0 group-hover:scale-x-100 origin-left transition-transform duration-500 ease-out z-0"></div>}
                  </button>
                </form>
                <div className="mt-[30px] text-center">
                  <button type="button" className="text-[#64748b] hover:text-[#0f172a] bg-none border-none text-[14px] font-bold cursor-pointer p-[5px] transition-all duration-200 hover:-translate-y-[1px] disabled:opacity-50 disabled:cursor-not-allowed" onClick={() => switchView('login')}>Return to Login</button>
                </div>
              </div>
            )}

            {currentView === 'troubles' && (
              <div className="[animation:fadeInPanel_0.4s_ease-out_forwards]">
                <h2 className="text-[#00212e] text-[30px] font-extrabold m-0 mb-[10px] tracking-tight">Having Troubles?</h2>
                <p className="text-[#64748b] text-[15px] m-0 mb-[35px] font-medium leading-relaxed">Select an option below to recover your account or find help.</p>
                <div className="flex flex-col gap-[16px] mt-[25px]">
                  <button className="w-full p-[16px] bg-[#f8fafc] text-[#0f172a] border border-[#cbd5e1] rounded-xl cursor-pointer text-[15px] font-bold transition-all duration-300 hover:not(:disabled):bg-white hover:not(:disabled):border-primary-blue hover:not(:disabled):text-primary-blue hover:not(:disabled):shadow-lg hover:not(:disabled):-translate-y-[2px] active:not(:disabled):scale-[0.98] shadow-sm" onClick={() => switchView('forgot-password')}>Reset Password</button>
                  <button className="w-full p-[16px] bg-[#f8fafc] text-[#0f172a] border border-[#cbd5e1] rounded-xl cursor-pointer text-[15px] font-bold transition-all duration-300 hover:not(:disabled):bg-white hover:not(:disabled):border-primary-blue hover:not(:disabled):text-primary-blue hover:not(:disabled):shadow-lg hover:not(:disabled):-translate-y-[2px] active:not(:disabled):scale-[0.98] shadow-sm" onClick={() => switchView('faqs')}>Frequently Asked Questions</button>
                </div>
                <div className="mt-[35px] text-center pt-[25px] border-t border-[#f1f5f9]">
                  <button type="button" className="text-[#64748b] hover:text-[#0f172a] bg-none border-none text-[14px] font-bold cursor-pointer p-[5px] transition-all duration-200 hover:-translate-y-[1px] disabled:opacity-50 disabled:cursor-not-allowed" onClick={() => switchView('login')}>Back to Login</button>
                </div>
              </div>
            )}

            {(currentView === 'first-time' || currentView === 'forgot-password') && (
              <div className="[animation:fadeInPanel_0.4s_ease-out_forwards]">
                <h2 className="text-[#00212e] text-[30px] font-extrabold m-0 mb-[10px] tracking-tight">{currentView === 'first-time' ? 'Account Setup' : 'Reset Password'}</h2>
                <p className="text-[#64748b] text-[15px] m-0 mb-[35px] font-medium leading-relaxed">
                  {otpStep === 'request' && 'Enter your registered email address and role to receive a verification code.'}
                  {otpStep === 'verify' && 'Enter the 6-digit secure code sent to your email.'}
                  {otpStep === 'reset' && 'Create your new permanent password.'}
                </p>
                {error && <div className="text-[#e74c3c] bg-[#e74c3c]/10 p-[14px] rounded-xl text-[14px] mb-[25px] font-medium leading-[1.4] border border-[#e74c3c]/20 [animation:scaleIn_0.2s_ease-out]">{error}</div>}
                
                {otpStep === 'request' && (
                  <form onSubmit={handleRequestOTP}>
                    <div className="mb-[20px] text-left group relative">
                      <label className="block mb-[10px] text-[#475569] font-bold text-[12px] tracking-[0.08em] uppercase transition-colors group-focus-within:text-primary-blue">Account Type</label>
                      <select 
                        className="w-full p-[14px_18px] border border-[#cbd5e1] rounded-xl text-[15px] transition-all duration-300 bg-[#f8fafc] text-[#0f172a] focus:outline-none focus:border-primary-blue focus:bg-white focus:ring-[4px] focus:ring-[#00a8e8]/15 focus:scale-[1.01] font-bold shadow-sm hover:border-[#94a3b8] cursor-pointer"
                        value={recoveryRole}
                        onChange={(e) => setRecoveryRole(e.target.value)}
                        disabled={loading}
                      >
                        <option value="Admin">Admin</option>
                        <option value="Nurse">Nurse</option>
                      </select>
                    </div>
                    <div className="mb-[35px] text-left group relative">
                      <label className="block mb-[10px] text-[#475569] font-bold text-[12px] tracking-[0.08em] uppercase transition-colors group-focus-within:text-primary-blue">Email Address</label>
                      <div className="relative w-full flex items-center">
                        <div className="absolute left-[16px] z-10 text-[#94a3b8] flex items-center justify-center pointer-events-none transition-colors group-focus-within:text-primary-blue">
                          <UserIcon />
                        </div>
                        <input type="email" autoComplete="off" className="w-full p-[14px_18px_14px_48px] border border-[#cbd5e1] rounded-xl text-[15px] transition-all duration-300 bg-[#f8fafc] text-[#0f172a] placeholder:text-[#94a3b8] focus:outline-none focus:border-primary-blue focus:bg-white focus:ring-[4px] focus:ring-[#00a8e8]/15 focus:scale-[1.01] disabled:bg-[#f1f5f9] disabled:text-[#94a3b8] disabled:cursor-not-allowed box-border font-medium shadow-sm hover:border-[#94a3b8]" placeholder="Enter your email" value={recoveryEmail} onChange={(e) => setRecoveryEmail(e.target.value)} required />
                      </div>
                    </div>

                    {currentView === 'first-time' && (
                      <div className="flex flex-col my-[20px] mb-[30px]">
                        <div className="flex items-center gap-[8px] mb-[12px]">
                          <Checkbox
                            checked={termsAccepted}
                            onChange={(e) => setTermsAccepted(e.target.checked)}
                            disabled={loading}
                            size="small"
                            sx={{
                              color: '#cbd5e1',
                              '&.Mui-checked': { color: '#00a8e8' },
                              padding: 0,
                              transition: 'transform 0.2s',
                              '&:hover': { transform: 'scale(1.1)' }
                            }}
                          />
                          <span className="text-[13.5px] text-[#475569] font-medium leading-[1.5]">
                            I agree to the <a href="#" onClick={(e) => { e.preventDefault(); setShowDocModal('terms'); }} className="text-primary-blue no-underline font-bold hover:underline transition-colors">Terms of Service</a>. (Required)
                          </span>
                        </div>
                        <div className="flex items-center gap-[8px]">
                          <Checkbox
                            checked={privacyAccepted}
                            onChange={(e) => setPrivacyAccepted(e.target.checked)}
                            disabled={loading}
                            size="small"
                            sx={{
                              color: '#cbd5e1',
                              '&.Mui-checked': { color: '#00a8e8' },
                              padding: 0,
                              transition: 'transform 0.2s',
                              '&:hover': { transform: 'scale(1.1)' }
                            }}
                          />
                          <span className="text-[13.5px] text-[#475569] font-medium leading-[1.5]">
                            I consent to the data <a href="#" onClick={(e) => { e.preventDefault(); setShowDocModal('privacy'); }} className="text-primary-blue no-underline font-bold hover:underline transition-colors">Privacy Policy</a>. (Required)
                          </span>
                        </div>
                      </div>
                    )}

                    <button type="submit" className="w-full mt-[10px] p-[16px] bg-gradient-to-r from-primary-blue to-[#0089bd] text-white border-none rounded-xl text-[16px] font-bold tracking-wide transition-all duration-300 hover:not(:disabled):to-[#0075a2] hover:not(:disabled):-translate-y-[2px] hover:not(:disabled):shadow-[0_10px_25px_rgba(0,168,232,0.4)] active:not(:disabled):scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed shadow-[0_4px_14px_rgba(0,168,232,0.25)] relative overflow-hidden group" disabled={loading || (currentView === 'first-time' && (!termsAccepted || !privacyAccepted))}>
                      <span className="relative z-10">{loading ? 'Sending...' : 'Send Code'}</span>
                      {!(loading || (currentView === 'first-time' && (!termsAccepted || !privacyAccepted))) && <div className="absolute inset-0 h-full w-full bg-white/20 scale-x-0 group-hover:scale-x-100 origin-left transition-transform duration-500 ease-out z-0"></div>}
                    </button>
                  </form>
                )}

                {otpStep === 'verify' && (
                  <form onSubmit={handleVerifyOTP}>
                    <div className="mb-[35px] text-left group relative">
                      <label className="block mb-[10px] text-[#475569] font-bold text-[12px] tracking-[0.08em] uppercase transition-colors group-focus-within:text-primary-blue">6-Digit OTP</label>
                      <input type="text" autoComplete="off" className="w-full p-[14px_18px] tracking-[8px] text-center border border-[#cbd5e1] rounded-xl text-[18px] transition-all duration-300 bg-[#f8fafc] text-[#0f172a] placeholder:text-[#cbd5e1] focus:outline-none focus:border-primary-blue focus:bg-white focus:ring-[4px] focus:ring-[#00a8e8]/15 focus:scale-[1.01] disabled:bg-[#f1f5f9] disabled:text-[#94a3b8] disabled:cursor-not-allowed box-border font-bold shadow-sm hover:border-[#94a3b8]" placeholder="••••••" value={otpCode} onChange={(e) => setOtpCode(e.target.value)} maxLength="6" required />
                    </div>
                    <button type="submit" className="w-full p-[16px] bg-gradient-to-r from-primary-blue to-[#0089bd] text-white border-none rounded-xl text-[16px] font-bold tracking-wide transition-all duration-300 hover:not(:disabled):to-[#0075a2] hover:not(:disabled):-translate-y-[2px] hover:not(:disabled):shadow-[0_10px_25px_rgba(0,168,232,0.4)] active:not(:disabled):scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed shadow-[0_4px_14px_rgba(0,168,232,0.25)] relative overflow-hidden group" disabled={loading}>
                      <span className="relative z-10">{loading ? 'Verifying...' : 'Verify Code'}</span>
                      {!loading && <div className="absolute inset-0 h-full w-full bg-white/20 scale-x-0 group-hover:scale-x-100 origin-left transition-transform duration-500 ease-out z-0"></div>}
                    </button>
                  </form>
                )}

                {otpStep === 'reset' && (
                  <form onSubmit={handleResetPassword}>
                    <div className="mb-[20px] text-left group relative">
                      <label className="block mb-[10px] text-[#475569] font-bold text-[12px] tracking-[0.08em] uppercase transition-colors group-focus-within:text-primary-blue">New Password</label>
                      <div className="relative w-full flex items-center">
                        <div className="absolute left-[16px] z-10 text-[#94a3b8] flex items-center justify-center pointer-events-none transition-colors group-focus-within:text-primary-blue">
                          <LockIcon />
                        </div>
                        <input type={showNewPassword ? "text" : "password"} autoComplete="off" className="w-full p-[14px_48px_14px_48px] border border-[#cbd5e1] rounded-xl text-[15px] transition-all duration-300 bg-[#f8fafc] text-[#0f172a] placeholder:text-[#94a3b8] focus:outline-none focus:border-primary-blue focus:bg-white focus:ring-[4px] focus:ring-[#00a8e8]/15 focus:scale-[1.01] disabled:bg-[#f1f5f9] disabled:text-[#94a3b8] disabled:cursor-not-allowed box-border font-medium shadow-sm hover:border-[#94a3b8]" placeholder="Enter new password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
                        <button type="button" className="absolute right-[16px] bg-none border-none text-[#94a3b8] hover:text-[#475569] flex items-center justify-center p-0 cursor-pointer z-10 transition-all duration-200 hover:scale-110 active:scale-95" onClick={() => setShowNewPassword(!showNewPassword)} tabIndex="-1">
                          {showNewPassword ? <EyeOffIcon /> : <EyeIcon />}
                        </button>
                      </div>
                    </div>
                    <div className="mb-[25px] text-left group relative">
                      <label className="block mb-[10px] text-[#475569] font-bold text-[12px] tracking-[0.08em] uppercase transition-colors group-focus-within:text-primary-blue">Confirm Password</label>
                      <div className="relative w-full flex items-center">
                        <div className="absolute left-[16px] z-10 text-[#94a3b8] flex items-center justify-center pointer-events-none transition-colors group-focus-within:text-primary-blue">
                          <LockIcon />
                        </div>
                        <input type={showNewPassword ? "text" : "password"} autoComplete="off" className="w-full p-[14px_48px_14px_48px] border border-[#cbd5e1] rounded-xl text-[15px] transition-all duration-300 bg-[#f8fafc] text-[#0f172a] placeholder:text-[#94a3b8] focus:outline-none focus:border-primary-blue focus:bg-white focus:ring-[4px] focus:ring-[#00a8e8]/15 focus:scale-[1.01] disabled:bg-[#f1f5f9] disabled:text-[#94a3b8] disabled:cursor-not-allowed box-border font-medium shadow-sm hover:border-[#94a3b8]" placeholder="Confirm new password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
                      </div>
                    </div>

                    <button type="submit" className="w-full mt-[10px] p-[16px] bg-gradient-to-r from-primary-blue to-[#0089bd] text-white border-none rounded-xl text-[16px] font-bold tracking-wide transition-all duration-300 hover:not(:disabled):to-[#0075a2] hover:not(:disabled):-translate-y-[2px] hover:not(:disabled):shadow-[0_10px_25px_rgba(0,168,232,0.4)] active:not(:disabled):scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed shadow-[0_4px_14px_rgba(0,168,232,0.25)] relative overflow-hidden group" disabled={loading}>
                      <span className="relative z-10">{loading ? 'Saving...' : 'Set Password'}</span>
                      {!loading && <div className="absolute inset-0 h-full w-full bg-white/20 scale-x-0 group-hover:scale-x-100 origin-left transition-transform duration-500 ease-out z-0"></div>}
                    </button>
                  </form>
                )}
                
                <div className="mt-[30px] text-center pt-[20px] border-t border-[#f1f5f9]">
                  <button type="button" className="text-[#64748b] hover:text-[#0f172a] bg-none border-none text-[14px] font-bold cursor-pointer p-[5px] transition-all duration-200 hover:-translate-y-[1px] disabled:opacity-50 disabled:cursor-not-allowed" onClick={() => switchView('login')}>Return to Login</button>
                </div>
              </div>
            )}

            {currentView === 'reset-success' && (
              <div className="text-center py-[30px] [animation:fadeInPanel_0.4s_ease-out_forwards]">
                <div className="w-[80px] h-[80px] bg-[#f0fdf4] rounded-full flex items-center justify-center mx-auto mb-[24px] shadow-[0_0_0_10px_rgba(240,253,244,0.5)] [animation:scaleIn_0.5s_cubic-bezier(0.175,0.885,0.32,1.275)]">
                  <svg viewBox="0 0 24 24" width="40" height="40" stroke="#22c55e" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                </div>
                <h2 className="text-[#00212e] text-[30px] font-extrabold m-0 mb-[12px] tracking-tight">Success!</h2>
                <p className="text-[#64748b] text-[15px] m-0 mb-[35px] font-medium leading-relaxed">Your account has been secured. Returning to login screen...</p>
                <div className="w-full h-[6px] bg-[#f1f5f9] rounded-full overflow-hidden mt-[20px]">
                  <div className="w-full h-full bg-gradient-to-r from-primary-blue to-[#0089bd] rounded-full [animation:shrinkBar_3s_linear_forwards]"></div>
                </div>
              </div>
            )}

            {currentView === 'faqs' && (
              <div className="[animation:fadeInPanel_0.4s_ease-out_forwards]">
                <h2 className="text-[#00212e] text-[30px] font-extrabold m-0 mb-[10px] tracking-tight">Support FAQs</h2>
                <div className="mt-[25px] text-[14px] text-[#334155] leading-relaxed text-left space-y-[16px]">
                  <div className="bg-[#f8fafc] p-[20px] rounded-xl border border-[#cbd5e1] shadow-sm transition-all duration-300 hover:shadow-md hover:border-primary-blue/30 hover:-translate-y-[2px]">
                    <strong className="text-[#0f172a] block mb-[6px] text-[15px] font-bold">How do I request an account?</strong>
                    <span className="text-[#64748b] font-medium">Accounts are strictly provisioned by your Facility Administrator. Please contact them directly.</span>
                  </div>
                  <div className="bg-[#f8fafc] p-[20px] rounded-xl border border-[#cbd5e1] shadow-sm transition-all duration-300 hover:shadow-md hover:border-primary-blue/30 hover:-translate-y-[2px]">
                    <strong className="text-[#0f172a] block mb-[6px] text-[15px] font-bold">What is Account Setup?</strong>
                    <span className="text-[#64748b] font-medium">A required security process to establish a permanent password for a newly provisioned account.</span>
                  </div>
                </div>
                <div className="mt-[30px] text-center pt-[20px] border-t border-[#f1f5f9]">
                  <button type="button" className="text-[#64748b] hover:text-[#0f172a] bg-none border-none text-[14px] font-bold cursor-pointer p-[5px] transition-all duration-200 hover:-translate-y-[1px] disabled:opacity-50 disabled:cursor-not-allowed" onClick={() => switchView('login')}>Back to Login</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default Login;