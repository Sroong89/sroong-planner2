import React, { useState, useEffect, useMemo } from 'react';
import { 
  ChevronLeft, 
  ChevronRight, 
  Check, 
  Infinity, 
  Settings,
  Link2,
  CloudUpload,
  Cloud 
} from 'lucide-react';
import { initializeApp, getApps } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  signInWithCustomToken, 
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  onSnapshot, 
  collection,
  query
} from 'firebase/firestore';

// --- 환경 변수 및 초기 설정 (Rule 1 & 3 준수) ---
const firebaseConfig = typeof __firebase_config !== 'undefined' 
  ? JSON.parse(__firebase_config) 
  : {
      apiKey: "AIzaSyBdPKMbJpAgnngJOCop8ySliTs4IEBoDHs",
      authDomain: "sroong-planner.firebaseapp.com",
      projectId: "sroong-planner",
      storageBucket: "sroong-planner.firebasestorage.app",
      messagingSenderId: "685280831568",
      appId: "1:685280831568:web:3b0afe4124ab5c448a4955",
      measurementId: "G-YYF96KTL87"
    };

const appId = typeof __app_id !== 'undefined' ? __app_id : 'srung-planner-sync';
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const auth = getAuth(app);
const db = getFirestore(app);

const DAYS = ['일', '월', '화', '수', '목', '금', '토'];

export default function App() {
  const [user, setUser] = useState(null);
  const [syncKey, setSyncKey] = useState(localStorage.getItem('srung_sync_key') || '');
  const [showSettings, setShowSettings] = useState(!localStorage.getItem('srung_sync_key'));
  const [currentDate, setCurrentDate] = useState(new Date());
  const [plannerData, setPlannerData] = useState({});
  const [isDataLoading, setIsDataLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [authError, setAuthError] = useState(null);

  // 1. 인증 설정 (Rule 3: 환경 제공 토큰 우선 사용)
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("인증 실패:", err);
        setAuthError("인증 설정에 문제가 발생했습니다. (잠시 후 다시 시도)");
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  const dateKey = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    const day = String(currentDate.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }, [currentDate]);

  // 2. 실시간 동기화 (Rule 1 & 2 준수: 단순 쿼리 사용)
  useEffect(() => {
    if (!user || !syncKey || syncKey.length < 1) {
      setPlannerData({});
      return;
    }

    setIsDataLoading(true);
    // Rule 1: /artifacts/{appId}/public/data/{collectionName}
    // 경로 세그먼트를 짝수로 유지하기 위해 문서 ID 조합 사용
    const dataCollectionRef = collection(db, 'artifacts', appId, 'public', 'data', 'planner_storage');
    
    // 복잡한 쿼리 없이 전체 데이터를 가져와서 메모리에서 필터링 (Rule 2 준수)
    const unsubscribe = onSnapshot(dataCollectionRef, (snapshot) => {
      const data = {};
      snapshot.forEach(d => {
        // 문서 ID가 "키_날짜" 형식인 것만 파싱
        if (d.id.startsWith(`${syncKey}_`)) {
          const date = d.id.replace(`${syncKey}_`, '');
          data[date] = d.data();
        }
      });
      setPlannerData(data);
      setIsDataLoading(false);
    }, (error) => {
      console.error("데이터 로드 오류:", error);
      setIsDataLoading(false);
    });

    return () => unsubscribe();
  }, [user, syncKey]);

  const defaultDayData = {
    checkpoint: '',
    schedule: Array.from({ length: 22 }, (_, i) => ({
      time: (i + 5) % 24,
      checked: false, plan: '', done: ''
    }))
  };

  const dayData = useMemo(() => {
    return plannerData[dateKey] || defaultDayData;
  }, [plannerData, dateKey]);

  // 3. 데이터 저장 (Rule 1: 짝수 세그먼트 경로 보장)
  const saveToCloud = async (newData) => {
    // 낙관적 업데이트: 로컬 상태 즉시 반영
    setPlannerData(prev => ({ ...prev, [dateKey]: newData }));

    if (!user || !syncKey) return;

    setIsSaving(true);
    try {
      // 6개 세그먼트로 구성된 경로 (artifacts/appId/public/data/planner_storage/docId)
      const docId = `${syncKey}_${dateKey}`;
      const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'planner_storage', docId);
      await setDoc(docRef, newData);
      setTimeout(() => setIsSaving(false), 500);
    } catch (err) {
      console.error("저장 실패:", err);
      setIsSaving(false);
    }
  };

  const updateSchedule = (idx, field, val) => {
    const currentSchedule = dayData.schedule || defaultDayData.schedule;
    const newSchedule = [...currentSchedule];
    newSchedule[idx] = { ...newSchedule[idx], [field]: val };
    saveToCloud({ ...dayData, schedule: newSchedule });
  };

  const changeDate = (offset) => {
    const newDate = new Date(currentDate);
    newDate.setDate(currentDate.getDate() + offset);
    setCurrentDate(newDate);
  };

  return (
    <div className="min-h-screen bg-[#FDF8F8] text-[#5C4D4D] p-3 font-serif">
      <style>{`
        @font-face { font-family: 'RIDIBatang'; src: url('https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_twelve@1.0/RIDIBatang.woff') format('woff'); }
        .font-serif { font-family: 'RIDIBatang', serif; }
        input::placeholder { color: #D4B8B8; font-size: 0.8rem; }
      `}</style>

      <div className="max-w-md mx-auto space-y-4 pb-10">
        <header className="bg-white rounded-2xl p-4 shadow-sm border border-[#E8D6D6]">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Infinity size={24} className="text-[#C89B9B]" />
              <h1 className="text-xl font-bold text-[#C89B9B]">스룽 플래너</h1>
            </div>
            
            <div className="flex items-center gap-2">
              {syncKey && user && (
                <div className="flex items-center transition-all duration-300">
                  {isSaving ? (
                    <CloudUpload size={18} className="text-blue-400 animate-bounce" />
                  ) : (
                    <Cloud size={18} className="text-green-400" />
                  )}
                </div>
              )}
              <button 
                onClick={() => setShowSettings(!showSettings)} 
                className={`p-2 rounded-full transition-colors ${showSettings ? 'bg-[#FDF8F8] text-[#C89B9B]' : 'text-gray-300'}`}
              >
                <Settings size={20} />
              </button>
            </div>
          </div>

          {authError && (
            <div className="mb-4 p-2 bg-red-50 text-red-500 text-[10px] text-center rounded-lg border border-red-100">
              {authError}
            </div>
          )}

          {showSettings && (
            <div className="mb-4 p-3 bg-[#FDF8F8] rounded-xl border border-dashed border-[#C89B9B] space-y-2 animate-in fade-in slide-in-from-top-1">
              <p className="text-[10px] text-[#B48787] font-bold flex items-center gap-1">
                <Link2 size={12} /> 동기화 키 (비밀번호)
              </p>
              <input 
                type="text" 
                value={syncKey} 
                onChange={(e) => { 
                  const val = e.target.value;
                  setSyncKey(val); 
                  localStorage.setItem('srung_sync_key', val); 
                }} 
                placeholder="비밀키를 입력하세요" 
                className="w-full p-2 bg-white border border-[#E8D6D6] rounded-lg text-sm outline-none focus:ring-1 focus:ring-[#C89B9B]" 
              />
              <p className="text-[9px] text-[#B48787] text-center italic">키를 바꾸면 해당 키에 저장된 기록이 나타납니다.</p>
            </div>
          )}

          <div className="flex flex-col items-center gap-3">
            <div className="flex items-center justify-between w-full bg-[#FDF8F8] rounded-xl border border-[#F3E9E9] p-1 shadow-inner">
              <button onClick={() => changeDate(-1)} className="p-2 text-[#B48787] active:scale-90 transition-transform"><ChevronLeft size={20} /></button>
              <button onClick={() => setCurrentDate(new Date())} className="font-bold text-[#B48787]">{dateKey.replace(/-/g, '. ')}.</button>
              <button onClick={() => changeDate(1)} className="p-2 text-[#B48787] active:scale-90 transition-transform"><ChevronRight size={20} /></button>
            </div>
          </div>
        </header>

        <div className={`space-y-4 transition-opacity duration-300 ${isDataLoading ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
          <section className="bg-white rounded-2xl shadow-sm border border-[#E8D6D6] overflow-hidden">
            <div className="bg-[#B48787] py-2 text-center text-white font-bold text-xs tracking-widest">오늘의 체크포인트</div>
            <div className="p-3">
              <textarea 
                value={dayData.checkpoint || ''} 
                onChange={(e) => saveToCloud({ ...dayData, checkpoint: e.target.value })} 
                placeholder="오늘의 중요한 메모를 남기세요..." 
                className="w-full h-24 p-3 bg-[#FDF8F8] border border-[#F3E9E9] rounded-xl outline-none text-xs resize-none leading-relaxed" 
              />
            </div>
          </section>

          <main className="bg-white rounded-2xl shadow-sm border border-[#E8D6D6] overflow-hidden">
            <div className="flex flex-col divide-y divide-[#F3E9E9]">
              {(dayData.schedule || defaultDayData.schedule).map((item, idx) => (
                <div key={idx} className="p-2 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-7 flex items-center justify-center bg-[#F3E9E9] rounded-md text-[9px] font-bold text-[#B48787] shrink-0 border border-[#E8D6D6]">
                      계획({String(item.time).padStart(2, '0')})
                    </div>
                    <div className="flex-1 flex items-center gap-2 bg-[#FDF8F8] rounded-md px-2 min-w-0">
                      <button 
                        onClick={() => updateSchedule(idx, 'checked', !item.checked)} 
                        className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 transition-all ${item.checked ? 'bg-[#C89B9B] border-[#C89B9B] text-white' : 'border-[#D4B8B8] bg-white'}`}
                      >
                        {item.checked && <Check size={10} strokeWidth={4} />}
                      </button>
                      <input 
                        type="text" 
                        value={item.plan || ''} 
                        onChange={(e) => updateSchedule(idx, 'plan', e.target.value)} 
                        placeholder="할 일" 
                        className={`w-full py-2 bg-transparent outline-none text-xs font-medium truncate ${item.checked ? 'text-[#B09C9C] line-through' : 'text-[#5C4D4D]'}`} 
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-7 flex items-center justify-center bg-white border border-[#F3E9E9] rounded-md text-[9px] font-bold text-[#D4B8B8] shrink-0">
                      실행({String(item.time).padStart(2, '0')})
                    </div>
                    <input 
                      type="text" 
                      value={item.done || ''} 
                      onChange={(e) => updateSchedule(idx, 'done', e.target.value)} 
                      placeholder="기록 남기기" 
                      className="flex-1 px-2 py-1 bg-transparent outline-none text-xs text-[#8B7373] italic truncate" 
                    />
                  </div>
                </div>
              ))}
            </div>
          </main>
        </div>

        <footer className="text-center py-4 text-[#D4B8B8] text-[9px]">
          <p>© 2026 스룽 플래너 • 실시간 연동 중</p>
        </footer>
      </div>
    </div>
  );
}