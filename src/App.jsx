import React, { useState, useEffect, useMemo } from 'react';
import { 
  ChevronLeft, 
  ChevronRight, 
  Check, 
  Activity, 
  Settings,
  Link2,
  CloudUpload,
  Cloud,
  AlertCircle,
  Calendar as CalendarIcon
} from 'lucide-react';
import { initializeApp, getApps } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  onSnapshot, 
  collection 
} from 'firebase/firestore';

// --- 사용자님의 실제 Firebase 설정 ---
const firebaseConfig = {
  apiKey: "AIzaSyBdPKMbJpAgnngJOCop8ySliTs4IEBoDHs",
  authDomain: "sroong-planner.firebaseapp.com",
  projectId: "sroong-planner",
  storageBucket: "sroong-planner.firebasestorage.app",
  messagingSenderId: "685280831568",
  appId: "1:685280831568:web:3b0afe4124ab5c448a4955",
  measurementId: "G-YYF96KTL87"
};

// 안전한 초기화
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const auth = getAuth(app);
const db = getFirestore(app);
const appId = 'srung-planner-sync';

const DAYS_SHORT = ['일', '월', '화', '수', '목', '금', '토'];

export default function App() {
  const [user, setUser] = useState(null);
  const [syncKey, setSyncKey] = useState(localStorage.getItem('srung_sync_key') || '');
  const [showSettings, setShowSettings] = useState(!localStorage.getItem('srung_sync_key'));
  const [showCalendar, setShowCalendar] = useState(false);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [plannerData, setPlannerData] = useState({});
  const [isDataLoading, setIsDataLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isAuthError, setIsAuthError] = useState(false);

  // 달력 뷰 상태
  const [viewDate, setViewDate] = useState(new Date());

  // 1. 인증 설정 (성공했던 완벽한 로직 복구)
  useEffect(() => {
    const initAuth = async () => {
      try {
        await signInAnonymously(auth);
        setIsAuthError(false);
      } catch (err) {
        console.error("Auth Error:", err);
        setIsAuthError(true);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsubscribe();
  }, []);

  const dateKey = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    const day = String(currentDate.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }, [currentDate]);

  // 2. 실시간 데이터 로드 (기존 폴더 이름 'user_plans' 복구!)
  useEffect(() => {
    if (!user || !syncKey || syncKey.length < 1) {
      setPlannerData({});
      return;
    }

    setIsDataLoading(true);
    // 기존에 데이터가 저장되어 있던 'user_plans'로 경로 복원
    const colRef = collection(db, 'artifacts', appId, 'public', 'data', 'user_plans');
    
    const unsubscribe = onSnapshot(colRef, (snapshot) => {
      const data = {};
      snapshot.forEach(d => {
        if (d.id.startsWith(syncKey + "_")) {
          const date = d.id.replace(syncKey + "_", "");
          data[date] = d.data();
        }
      });
      setPlannerData(data);
      setIsDataLoading(false);
    }, (error) => {
      console.error("Load Error:", error);
      setIsDataLoading(false);
    });

    return () => unsubscribe();
  }, [user, syncKey]);

  const defaultSchedule = Array.from({ length: 22 }, (_, i) => ({
    time: (i + 5) % 24,
    checked: false, plan: '', done: ''
  }));

  const dayData = useMemo(() => {
    return plannerData[dateKey] || { checkpoint: '', schedule: defaultSchedule };
  }, [plannerData, dateKey, defaultSchedule]);

  // 3. 데이터 저장
  const saveToCloud = async (newData) => {
    setPlannerData(prev => ({ ...prev, [dateKey]: newData }));
    
    if (!user || !syncKey) return;

    setIsSaving(true);
    try {
      const docId = `${syncKey}_${dateKey}`;
      const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'user_plans', docId);
      await setDoc(docRef, newData);
      setTimeout(() => setIsSaving(false), 500);
    } catch (err) {
      console.error("Save Error:", err);
      setIsSaving(false);
    }
  };

  const updateSchedule = (idx, field, val) => {
    const currentSchedule = dayData.schedule || defaultSchedule;
    const newSchedule = [...currentSchedule];
    newSchedule[idx] = { ...newSchedule[idx], [field]: val };
    saveToCloud({ ...dayData, schedule: newSchedule });
  };

  const changeDate = (offset) => {
    const newDate = new Date(currentDate);
    newDate.setDate(currentDate.getDate() + offset);
    setCurrentDate(newDate);
  };

  // --- 달력 계산 로직 ---
  const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year, month) => new Date(year, month, 1).getDay();

  const calendarDays = useMemo(() => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const days = [];
    const firstDay = getFirstDayOfMonth(year, month);
    const totalDays = getDaysInMonth(year, month);

    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let i = 1; i <= totalDays; i++) days.push(i);
    return days;
  }, [viewDate]);

  const handleDateSelect = (day) => {
    if (!day) return;
    const newDate = new Date(viewDate.getFullYear(), viewDate.getMonth(), day);
    setCurrentDate(newDate);
    setShowCalendar(false);
  };

  return (
    <div className="min-h-screen bg-[#FDF8F8] text-[#5C4D4D] p-3 font-serif select-none relative">
      <style>{`
        @font-face { font-family: 'RIDIBatang'; src: url('https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_twelve@1.0/RIDIBatang.woff') format('woff'); }
        .font-serif { font-family: 'RIDIBatang', serif; }
      `}</style>

      <div className="max-w-md mx-auto space-y-4 pb-10">
        <header className="bg-white rounded-2xl p-4 shadow-sm border border-[#E8D6D6]">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Activity size={24} className="text-[#C89B9B]" />
              <h1 className="text-xl font-bold text-[#C89B9B]">스룽 플래너</h1>
            </div>
            
            <div className="flex items-center gap-2">
              {syncKey && user && !isAuthError && (
                <div className="flex items-center transition-all duration-300">
                  {isSaving ? <CloudUpload size={18} className="text-blue-400 animate-bounce" /> : <Cloud size={18} className="text-green-400" />}
                </div>
              )}
              {/* 달력 버튼 */}
              <button 
                onClick={() => { setShowCalendar(!showCalendar); setViewDate(currentDate); }}
                className={`p-2 rounded-full transition-colors ${showCalendar ? 'bg-[#FDF8F8] text-[#C89B9B]' : 'text-gray-300 hover:text-[#C89B9B]'}`}
              >
                <CalendarIcon size={20} />
              </button>
              {/* 설정 버튼 */}
              <button 
                onClick={() => setShowSettings(!showSettings)} 
                className={`p-2 rounded-full transition-colors ${showSettings ? 'bg-[#FDF8F8] text-[#C89B9B]' : 'text-gray-300 hover:text-[#C89B9B]'}`}
              >
                <Settings size={20} />
              </button>
            </div>
          </div>

          {isAuthError && (
            <div className="mb-4 p-2 bg-orange-50 text-orange-600 text-[10px] rounded-lg border border-orange-100 flex items-center gap-2">
              <AlertCircle size={14} /> Firebase 콘솔에서 '익명 로그인'을 활성화해주세요.
            </div>
          )}

          {showCalendar && (
            <div className="mb-4 p-4 bg-[#FDF8F8] rounded-xl border border-[#E8D6D6] animate-in fade-in slide-in-from-top-2">
              <div className="flex items-center justify-between mb-4">
                <button onClick={() => setViewDate(new Date(viewDate.setMonth(viewDate.getMonth() - 1)))} className="p-1 text-[#C89B9B]"><ChevronLeft size={18}/></button>
                <span className="font-bold text-sm text-[#B48787]">{viewDate.getFullYear()}년 {viewDate.getMonth() + 1}월</span>
                <button onClick={() => setViewDate(new Date(viewDate.setMonth(viewDate.getMonth() + 1)))} className="p-1 text-[#C89B9B]"><ChevronRight size={18}/></button>
              </div>
              <div className="grid grid-cols-7 gap-1 mb-2 text-center text-[10px] font-bold text-[#D4B8B8]">
                {DAYS_SHORT.map(d => <div key={d} className={d === '일' ? 'text-red-400' : d === '토' ? 'text-blue-400' : ''}>{d}</div>)}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {calendarDays.map((day, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleDateSelect(day)}
                    disabled={!day}
                    className={`aspect-square text-[11px] rounded-lg transition-all ${!day ? 'invisible' : 'hover:bg-white hover:text-[#C89B9B]'} ${day && new Date(viewDate.getFullYear(), viewDate.getMonth(), day).toDateString() === currentDate.toDateString() ? 'bg-[#C89B9B] text-white font-bold' : ''}`}
                  >
                    {day}
                  </button>
                ))}
              </div>
              <button 
                onClick={() => { setCurrentDate(new Date()); setShowCalendar(false); }}
                className="w-full mt-3 py-1.5 bg-white border border-[#E8D6D6] rounded-lg text-[10px] text-[#B48787] font-bold"
              >
                오늘로 돌아가기
              </button>
            </div>
          )}

          {showSettings && (
            <div className="mb-4 p-3 bg-[#FDF8F8] rounded-xl border border-dashed border-[#C89B9B] space-y-2 animate-in fade-in slide-in-from-top-1">
              <p className="text-[10px] text-[#B48787] font-bold flex items-center gap-1"><Link2 size={12} /> 동기화 키</p>
              <input 
                type="text" 
                value={syncKey} 
                onChange={(e) => { 
                  const val = e.target.value;
                  setSyncKey(val); 
                  localStorage.setItem('srung_sync_key', val); 
                }} 
                placeholder="나만의 비밀키 입력" 
                className="w-full p-2 bg-white border border-[#E8D6D6] rounded-lg text-sm outline-none focus:ring-1 focus:ring-[#C89B9B]" 
              />
              <p className="text-[9px] text-[#B48787] italic">키를 바꾸면 해당 키에 저장된 내용으로 즉시 바뀝니다.</p>
            </div>
          )}

          <div className="flex items-center justify-between w-full bg-[#FDF8F8] rounded-xl border border-[#F3E9E9] p-1 shadow-inner">
            <button onClick={() => changeDate(-1)} className="p-2 text-[#B48787] active:scale-75 transition-transform"><ChevronLeft size={20} /></button>
            <span className="font-bold text-[#B48787] text-sm">{dateKey.replace(/-/g, '. ')}.</span>
            <button onClick={() => changeDate(1)} className="p-2 text-[#B48787] active:scale-75 transition-transform"><ChevronRight size={20} /></button>
          </div>
        </header>

        <div className={`space-y-4 transition-opacity duration-300 ${isDataLoading ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
          <section className="bg-white rounded-2xl shadow-sm border border-[#E8D6D6] overflow-hidden">
            <div className="bg-[#B48787] py-2 text-center text-white font-bold text-xs tracking-widest uppercase">Check Point</div>
            <div className="p-3">
              <textarea 
                value={dayData.checkpoint || ''} 
                onChange={(e) => saveToCloud({ ...dayData, checkpoint: e.target.value })} 
                placeholder="오늘 가장 중요한 일들을 적어보세요..." 
                className="w-full h-24 p-3 bg-[#FDF8F8] border border-[#F3E9E9] rounded-xl outline-none text-xs resize-none leading-relaxed" 
              />
            </div>
          </section>

          <main className="bg-white rounded-2xl shadow-sm border border-[#E8D6D6] overflow-hidden">
            <div className="flex flex-col divide-y divide-[#F3E9E9]">
              {(dayData.schedule || defaultSchedule).map((item, idx) => (
                <div key={idx} className="p-2 space-y-1 hover:bg-[#FDF8F8]/30">
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-bold text-[#B48787] w-12 text-center">{String(item.time).padStart(2, '0')}:00</span>
                    <div className="flex-1 flex items-center gap-2 bg-[#FDF8F8] rounded px-2 border border-transparent focus-within:border-[#E8D6D6]">
                      <button 
                        onClick={() => updateSchedule(idx, 'checked', !item.checked)} 
                        className={`w-4 h-4 rounded-full border transition-all ${item.checked ? 'bg-[#C89B9B] border-[#C89B9B] text-white shadow-sm' : 'bg-white border-[#D4B8B8]'}`}
                      >
                        {item.checked && <Check size={10} strokeWidth={3} />}
                      </button>
                      <input 
                        type="text" 
                        value={item.plan || ''} 
                        onChange={(e) => updateSchedule(idx, 'plan', e.target.value)} 
                        className={`w-full py-2 bg-transparent outline-none text-xs ${item.checked ? 'line-through text-gray-400' : 'text-[#5C4D4D]'}`} 
                        placeholder="할 일"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pl-14">
                    <input 
                      type="text" 
                      value={item.done || ''} 
                      onChange={(e) => updateSchedule(idx, 'done', e.target.value)} 
                      className="w-full py-1 bg-transparent outline-none text-[10px] text-[#8B7373] italic" 
                      placeholder="수행 결과 또는 기록"
                    />
                  </div>
                </div>
              ))}
            </div>
          </main>
        </div>

        <footer className="text-center py-6 text-[#D4B8B8] text-[9px] tracking-widest">
          <p>© 2026 SROONG PLANNER • ALL RIGHTS RESERVED</p>
        </footer>
      </div>
    </div>
  );
}