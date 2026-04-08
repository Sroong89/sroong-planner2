import React, { useState, useEffect, useMemo } from 'react';
import { 
  ChevronLeft, 
  ChevronRight, 
  Check, 
  Infinity, 
  Settings,
  Link2
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
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
  collection 
} from 'firebase/firestore';

// --- 환경 변수 및 초기 설정 ---
const firebaseConfig = JSON.parse(__firebase_config);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'srung-planner-sync';
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const DAYS = ['일', '월', '화', '수', '목', '금', '토'];

export default function App() {
  const [user, setUser] = useState(null);
  const [syncKey, setSyncKey] = useState(localStorage.getItem('srung_sync_key') || '');
  const [showSettings, setShowSettings] = useState(false);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [plannerData, setPlannerData] = useState({});
  const [isDataLoading, setIsDataLoading] = useState(false);

  // 1. 인증 설정 (Rule 3 준수)
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

  // 2. 실시간 동기화 (Rule 1 & Rule 3 준수)
  useEffect(() => {
    // 인증이 완료되지 않았거나 키가 짧으면 실행 안 함
    if (!user || !syncKey || syncKey.length < 2) {
      setPlannerData({});
      return;
    }

    setIsDataLoading(true);
    // Rule 1: /artifacts/{appId}/public/data/{collectionName} 경로 사용
    // 경로: artifacts -> appId -> public -> data -> shared_plans (Col) -> syncKey (Doc) -> days (Col)
    const daysCollectionRef = collection(db, 'artifacts', appId, 'public', 'data', 'shared_plans', syncKey, 'days');
    
    const unsubscribe = onSnapshot(daysCollectionRef, (snapshot) => {
      const data = {};
      snapshot.forEach(d => { data[d.id] = d.data(); });
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

  const dayData = plannerData[dateKey] || defaultDayData;

  // 3. 데이터 저장 (Rule 1 & Rule 3 준수)
  const saveToCloud = async (newData) => {
    if (!user) return;
    if (!syncKey) {
      setPlannerData({ ...plannerData, [dateKey]: newData });
      return;
    }
    try {
      // 8개 세그먼트로 구성된 올바른 문서 경로 (짝수)
      const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'shared_plans', syncKey, 'days', dateKey);
      await setDoc(docRef, newData);
    } catch (err) {
      console.error("저장 실패:", err);
    }
  };

  const updateSchedule = (idx, field, val) => {
    const newSchedule = [...dayData.schedule];
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
            <button 
              onClick={() => setShowSettings(!showSettings)} 
              className={`p-2 rounded-full transition-colors ${syncKey ? 'text-[#C89B9B]' : 'text-gray-300'}`}
            >
              <Settings size={20} />
            </button>
          </div>

          {(!syncKey || showSettings) && (
            <div className="mb-4 p-3 bg-[#FDF8F8] rounded-xl border border-dashed border-[#C89B9B] space-y-2">
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
              {!syncKey && <p className="text-[9px] text-red-400 text-center">키를 입력해야 데이터가 사라지지 않습니다!</p>}
            </div>
          )}

          <div className="flex flex-col items-center gap-3">
            <div className="flex items-center justify-between w-full bg-[#FDF8F8] rounded-xl border border-[#F3E9E9] p-1 shadow-inner">
              <button onClick={() => changeDate(-1)} className="p-2 text-[#B48787] active:scale-90 transition-transform"><ChevronLeft size={20} /></button>
              <button onClick={() => setCurrentDate(new Date())} className="font-bold">{dateKey.replace(/-/g, '. ')}.</button>
              <button onClick={() => changeDate(1)} className="p-2 text-[#B48787] active:scale-90 transition-transform"><ChevronRight size={20} /></button>
            </div>
            <div className="flex justify-around w-full">
              {DAYS.map((day, idx) => (
                <span key={day} className={`text-xs font-bold ${currentDate.getDay() === idx ? 'text-[#C89B9B] border-b-2 border-[#C89B9B]' : 'text-[#D4B8B8]'}`}>{day}</span>
              ))}
            </div>
          </div>
        </header>

        <div className={`space-y-4 transition-opacity duration-300 ${isDataLoading ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
          <section className="bg-white rounded-2xl shadow-sm border border-[#E8D6D6] overflow-hidden">
            <div className="bg-[#B48787] py-2 text-center text-white font-bold text-xs tracking-widest">오늘의 체크포인트</div>
            <div className="p-3">
              <textarea 
                value={dayData.checkpoint} 
                onChange={(e) => saveToCloud({ ...dayData, checkpoint: e.target.value })} 
                placeholder="꼭 기억해야 할 내용들..." 
                className="w-full h-24 p-3 bg-[#FDF8F8] border border-[#F3E9E9] rounded-xl outline-none text-xs resize-none leading-relaxed" 
              />
            </div>
          </section>

          <main className="bg-white rounded-2xl shadow-sm border border-[#E8D6D6] overflow-hidden">
            <div className="flex flex-col divide-y divide-[#F3E9E9]">
              {dayData.schedule.map((item, idx) => (
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
                        value={item.plan} 
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
                      value={item.done} 
                      onChange={(e) => updateSchedule(idx, 'done', e.target.value)} 
                      placeholder="수행 기록" 
                      className="flex-1 px-2 py-1 bg-transparent outline-none text-xs text-[#8B7373] italic truncate" 
                    />
                  </div>
                </div>
              ))}
            </div>
          </main>
        </div>

        {isDataLoading && (
          <div className="fixed bottom-6 right-6 bg-white p-3 rounded-full shadow-xl border border-[#E8D6D6]">
            <Infinity size={24} className="text-[#C89B9B] animate-pulse" />
          </div>
        )}

        <footer className="text-center py-4 text-[#D4B8B8] text-[9px]">
          <p>© 2026 스룽 플래너 • 실시간 연동 중</p>
        </footer>
      </div>
    </div>
  );
}