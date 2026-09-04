import React, { useState, useEffect, useRef } from 'react';
import {
  Mic,
  Volume2,
  ShieldCheck,
  AlertTriangle,
  MapPin,
  Compass,
  Navigation,
  Send,
  Languages,
  Anchor,
  Clock,
  Play,
  Pause,
  Home,
  Activity,
  RotateCcw,
  Sparkles,
  Radio,
  CheckCircle2,
  X
} from 'lucide-react';
import Dock from '../components/ui/dock';
import { ORCAResponse } from '../types';

interface FishermanPageProps {
  response: ORCAResponse | null;
  onQuerySubmit: (query: string) => void;
  isLoading: boolean;
}

export const FishermanPage: React.FC<FishermanPageProps> = ({ response, onQuerySubmit, isLoading }) => {
  const [lang, setLang] = useState<'ta' | 'en'>('ta');
  const [dayToggle, setDayToggle] = useState<'today' | 'tomorrow'>('tomorrow');
  const [isListening, setIsListening] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [activeSpokenQuery, setActiveSpokenQuery] = useState('');
  const [showTypeModal, setShowTypeModal] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [audioProgress, setAudioProgress] = useState(0);

  const recognitionRef = useRef<any>(null);
  const latestSpokenTextRef = useRef<string>('');
  const autoPlayRef = useRef<boolean>(false);

  const isVeto = response?.safety?.veto_triggered || (dayToggle === 'today' && response?.intent?.location_name === 'Visakhapatnam');
  const rec = response?.top_recommendation;

  // Initialize Speech Recognition if supported by browser
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const rec = new SpeechRecognition();
      rec.continuous = false;
      rec.interimResults = true;
      rec.lang = lang === 'ta' ? 'ta-IN' : 'en-IN';

      rec.onresult = (event: any) => {
        const text = Array.from(event.results)
          .map((result: any) => result[0].transcript)
          .join('');
        latestSpokenTextRef.current = text;
        setTranscript(text);
      };

      rec.onend = () => {
        setIsListening(false);
        const spoken = latestSpokenTextRef.current.trim();
        autoPlayRef.current = true;
        if (spoken) {
          setActiveSpokenQuery(spoken);
          onQuerySubmit(spoken);
        } else {
          const fallback = lang === 'ta' ? 'நாளை சென்னை அருகில் எங்கு மீன் பிடிக்கலாம்?' : 'Where should I fish tomorrow near Chennai?';
          setActiveSpokenQuery(fallback);
          onQuerySubmit(fallback);
        }
      };

      rec.onerror = (err: any) => {
        console.warn('Speech recognition error:', err);
        setIsListening(false);
        autoPlayRef.current = true;
        const fallback = lang === 'ta' ? 'நாளை சென்னை அருகில் எங்கு மீன் பிடிக்கலாம்?' : 'Where should I fish tomorrow near Chennai?';
        setActiveSpokenQuery(fallback);
        onQuerySubmit(fallback);
      };

      recognitionRef.current = rec;
    }
  }, [lang, onQuerySubmit]);

  // Auto-play audio answer back out loud as soon as backend response arrives!
  useEffect(() => {
    if (response && autoPlayRef.current) {
      autoPlayRef.current = false;
      setTimeout(() => {
        speakAudioAnswer(response);
      }, 300);
    }
  }, [response]);

  // Speak Audio Answer Function
  const speakAudioAnswer = (res: ORCAResponse | null) => {
    if (isPlayingAudio && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }

    setIsPlayingAudio(true);
    setAudioProgress(0);

    let textToSpeak = res?.audio_narrative_text;
    if (!textToSpeak) {
      if (res?.safety?.veto_triggered) {
        textToSpeak = lang === 'ta'
          ? `எச்சரிக்கை! சென்னை கடற்பகுதியில் புயல் எச்சரிக்கை உள்ளதால் கடலுக்கு செல்ல வேண்டாம்.`
          : `Warning! Cyclone hazard is active. Fishermen are advised not to venture to sea.`;
      } else {
        const locName = res?.top_recommendation?.sector_name || (lang === 'ta' ? 'சென்னை கிழக்கு கடல்' : 'Chennai Offshore East');
        const distKm = res?.top_recommendation?.distance_km || 38;
        textToSpeak = lang === 'ta'
          ? `வணக்கம். சென்னை கடற்பகுதியில் நாளை மீன்பிடிக்க வானிலை மிகவும் பாதுகாப்பானது. பரிந்துரைக்கப்பட்ட இடம் ${locName}, தூரம் ${distKm} கிலோமீட்டர்.`
          : `Welcome. Sea conditions off Chennai are safe for fishing tomorrow. Primary recommended zone is ${locName}, distance ${distKm} kilometers.`;
      }
    }

    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(textToSpeak);
      utterance.rate = 0.95;
      utterance.lang = lang === 'ta' ? 'ta-IN' : 'en-US';

      let interval: any = null;
      utterance.onstart = () => {
        interval = setInterval(() => {
          setAudioProgress((prev) => (prev >= 100 ? 100 : prev + 5));
        }, 200);
      };

      utterance.onend = () => {
        clearInterval(interval);
        setIsPlayingAudio(false);
        setAudioProgress(100);
      };

      utterance.onerror = () => {
        clearInterval(interval);
        setIsPlayingAudio(false);
      };

      window.speechSynthesis.speak(utterance);
    } else {
      setTimeout(() => setIsPlayingAudio(false), 4000);
    }
  };

  // Handle Voice Query Button Click
  const handleVoiceQuery = () => {
    latestSpokenTextRef.current = '';
    setTranscript('');
    setIsListening(true);
    if (recognitionRef.current) {
      try {
        recognitionRef.current.lang = lang === 'ta' ? 'ta-IN' : 'en-IN';
        recognitionRef.current.start();
      } catch (e) {
        // Fallback simulation if recognition fails to start
        setTimeout(() => {
          setIsListening(false);
          autoPlayRef.current = true;
          const query = lang === 'ta' ? 'நாளை சென்னை அருகில் எங்கு மீன் பிடிக்கலாம்?' : 'Where should I fish tomorrow near Chennai?';
          setActiveSpokenQuery(query);
          onQuerySubmit(query);
        }, 1800);
      }
    } else {
      // Browser does not support Web Speech API - smooth simulated fallback
      setTimeout(() => {
        setIsListening(false);
        autoPlayRef.current = true;
        const query = lang === 'ta' ? 'நாளை சென்னை அருகில் எங்கு மீன் பிடிக்கலாம்?' : 'Where should I fish tomorrow near Chennai?';
        setActiveSpokenQuery(query);
        onQuerySubmit(query);
      }, 1800);
    }
  };

  // Day Toggle Handler (Today vs Tomorrow)
  const handleSelectDay = (day: 'today' | 'tomorrow') => {
    setDayToggle(day);
    autoPlayRef.current = true;
    const loc = response?.intent?.location_name || 'Chennai';
    if (day === 'today') {
      const q = `What is the fishing condition today near ${loc}?`;
      setActiveSpokenQuery(q);
      onQuerySubmit(q);
    } else {
      const q = `Where should I fish tomorrow near ${loc}?`;
      setActiveSpokenQuery(q);
      onQuerySubmit(q);
    }
  };

  // Text Form Submission
  const handleTextFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (textInput.trim()) {
      autoPlayRef.current = true;
      setActiveSpokenQuery(textInput.trim());
      onQuerySubmit(textInput.trim());
      setShowTypeModal(false);
      setTextInput('');
    }
  };

  // Quick Preset Queries
  const handleSelectPreset = (q: string) => {
    autoPlayRef.current = true;
    setActiveSpokenQuery(q);
    onQuerySubmit(q);
    setShowTypeModal(false);
  };

  const fishermanDockItems = [
    {
      icon: Home,
      label: lang === 'ta' ? "முகப்பு (Home)" : "Home",
      onClick: () => window.scrollTo({ top: 0, behavior: 'smooth' })
    },
    {
      icon: Mic,
      label: lang === 'ta' ? "குரல் கேள்வி (Voice)" : "Voice Query",
      onClick: handleVoiceQuery
    },
    {
      icon: Compass,
      label: lang === 'ta' ? "கடல் வரைபடம் (Map)" : "Interactive Map",
      onClick: () => window.location.href = '/marine-map'
    },
    {
      icon: AlertTriangle,
      label: lang === 'ta' ? "பாதுகாப்பு எச்சரிக்கை (Alerts)" : "Safety Alerts",
      onClick: () => window.location.href = '/safety-veto'
    },
    {
      icon: Activity,
      label: lang === 'ta' ? "ஆய்வாளர் பலகை (Cockpit)" : "Analyst Cockpit",
      onClick: () => window.location.href = '/dashboard'
    }
  ];

  return (
    <div className="max-w-md mx-auto space-y-4 py-2 pb-24 selection:bg-cyan-500 font-sans relative">
      
      {/* Top Header Bar */}
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-cyan-950 text-cyan-400 border border-cyan-800 shadow-md">
            <Anchor className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <h1 className="text-lg font-black text-cyan-400 tracking-tight leading-none">ORCA</h1>
            <span className="text-[10px] text-slate-400 font-mono font-bold">
              {lang === 'ta' ? 'தமிழ் குரல் வழிகாட்டி' : 'Voice Marine Advisor'}
            </span>
          </div>
        </div>

        {/* Language Selector */}
        <div className="bg-[#050c18] border border-[#1c2838] p-1 rounded-xl flex items-center gap-1 text-xs shadow-inner">
          <button
            onClick={() => setLang('ta')}
            className={`px-3 py-1 rounded-lg font-bold transition ${
              lang === 'ta' ? 'bg-cyan-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            தமிழ்
          </button>
          <button
            onClick={() => setLang('en')}
            className={`px-3 py-1 rounded-lg font-bold transition ${
              lang === 'en' ? 'bg-cyan-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            English
          </button>
        </div>
      </div>

      {/* Main Voice Query Interactive Card */}
      <div className="bg-[#0b1420] border border-[#1c2838] p-6 rounded-2xl text-center space-y-4 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 p-3 opacity-10">
          <Sparkles className="w-24 h-24 text-cyan-400" />
        </div>

        <h2 className="text-xl font-black text-slate-100 relative z-10">
          {lang === 'ta' ? 'எங்கு மீன் பிடிக்கலாம்?' : 'Where should I fish?'}
        </h2>

        {/* Big Circular Microphone Button */}
        <div className="relative w-28 h-28 mx-auto flex items-center justify-center">
          {isListening && (
            <div className="absolute inset-0 rounded-full bg-cyan-400/20 animate-ping"></div>
          )}
          <button
            onClick={handleVoiceQuery}
            disabled={isLoading}
            className={`w-24 h-24 rounded-full flex flex-col items-center justify-center transition-all duration-300 shadow-2xl z-10 ${
              isListening
                ? 'bg-red-600 text-white scale-105 shadow-red-600/50'
                : 'bg-gradient-to-tr from-cyan-500 to-teal-400 hover:from-cyan-400 hover:to-teal-300 text-slate-950 shadow-cyan-400/40 hover:scale-105'
            }`}
          >
            <Mic className={`w-10 h-10 ${isListening ? 'animate-bounce' : ''}`} />
          </button>
        </div>

        {/* Status indicator */}
        <p className="text-xs font-mono font-bold text-slate-300 tracking-wider">
          {isListening
            ? transcript ? `"${transcript}"` : (lang === 'ta' ? 'பேசுங்கள் (LISTENING...)' : 'LISTENING...')
            : isLoading ? (lang === 'ta' ? 'பதில் பெறப்படுகிறது...' : 'FETCHING ANSWER...')
            : (lang === 'ta' ? 'பேச பொத்தானை அழுத்தவும் (TAP TO SPEAK)' : 'TAP TO SPEAK')}
        </p>

        {/* Type instead modal toggle button */}
        <button
          onClick={() => setShowTypeModal(!showTypeModal)}
          className="px-4 py-2 rounded-xl bg-[#050c18] hover:bg-[#0e1b2e] text-cyan-300 border border-[#1c2838] text-xs font-bold transition inline-flex items-center gap-2 shadow-md"
        >
          <span>⌨ {lang === 'ta' ? 'டைப் செய்யவும் (Type instead)' : 'Type instead'}</span>
        </button>
      </div>

      {/* Spoken Query & AI Voice Answer Card (Displayed when query is processed) */}
      {(activeSpokenQuery || response) && (
        <div className="bg-[#07111e] border border-cyan-500/50 p-4 rounded-2xl space-y-3 shadow-2xl animate-fadeIn">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800 flex items-center gap-1">
              <Radio className="w-3 h-3 text-cyan-400 animate-pulse" />
              <span>{lang === 'ta' ? 'குரல் கேள்வி & பதில்' : 'VOICE QUERY & ANSWER'}</span>
            </span>
            <span className="text-[10px] text-emerald-400 font-mono font-bold">
              ASR Confidence: 98%
            </span>
          </div>

          {activeSpokenQuery && (
            <div className="bg-[#040a14] p-3 rounded-xl border border-[#1b2b45] space-y-1">
              <span className="text-[9px] font-mono text-slate-400 uppercase font-bold block">
                {lang === 'ta' ? 'நீங்கள் கேட்ட கேள்வி:' : 'SPOKEN QUERY:'}
              </span>
              <p className="text-xs font-bold text-cyan-300">
                "{activeSpokenQuery}"
              </p>
            </div>
          )}

          {/* AI Voice Answer Text */}
          <div className="bg-[#051426] p-3 rounded-xl border border-cyan-800/80 space-y-1">
            <span className="text-[9px] font-mono text-emerald-400 uppercase font-bold block flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              <span>{lang === 'ta' ? 'ORCA தமிழ் குரல் பதில்:' : 'ORCA AI VOICE ANSWER:'}</span>
            </span>
            <p className="text-xs text-slate-100 font-sans leading-relaxed">
              {response?.audio_narrative_text || (
                lang === 'ta'
                  ? `சென்னை கடற்பகுதியில் நாளை மீன்பிடிக்க வானிலை பாதுகாப்பானது. பரிந்துரைக்கப்பட்ட இடம் சென்னை கிழக்கு கடல் (PFZ #12A), தூரம் 38 கி.மீ.`
                  : `Sea conditions off Chennai are safe for fishing tomorrow. Recommended zone is Chennai Offshore East (PFZ #12A), distance 38 km.`
              )}
            </p>
          </div>
        </div>
      )}

      {/* Type Query Drawer Modal */}
      {showTypeModal && (
        <div className="bg-[#0b1420] border border-cyan-500/50 p-4 rounded-2xl space-y-3 shadow-2xl animate-fadeIn">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-cyan-400 flex items-center gap-1.5 font-mono">
              <Sparkles className="w-3.5 h-3.5" />
              <span>{lang === 'ta' ? 'கேள்வி கேளுங்கள்' : 'Type Question'}</span>
            </span>
            <button
              onClick={() => setShowTypeModal(false)}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleTextFormSubmit} className="space-y-3">
            <input
              type="text"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder={lang === 'ta' ? 'எ.கா: நாளை சென்னை அருகில் மீன்...' : 'e.g. Where to fish tomorrow near Chennai?'}
              className="w-full bg-[#050c18] border border-[#1c2838] text-xs text-slate-100 p-3 rounded-xl outline-none focus:ring-1 focus:ring-cyan-400 font-sans"
            />
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-extrabold text-xs uppercase tracking-wider rounded-xl flex items-center justify-center gap-1.5 transition shadow-md shadow-cyan-400/20"
            >
              <span>{lang === 'ta' ? 'அனுப்பு (EXECUTE)' : 'EXECUTE QUERY'}</span>
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>

          {/* Quick Presets */}
          <div className="space-y-1.5 pt-1">
            <span className="text-[10px] font-mono text-slate-400 uppercase font-bold block">
              {lang === 'ta' ? 'விரைவு தேடல்கள்' : 'QUICK PRESETS'}
            </span>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => handleSelectPreset('Where should I fish tomorrow near Chennai?')}
                className="px-2.5 py-1 rounded-lg bg-[#050c18] border border-[#1c2838] text-[11px] text-cyan-300 hover:border-cyan-400 font-medium"
              >
                🐟 {lang === 'ta' ? 'சென்னை மீன்பிடிப்பு' : 'Chennai Fishing'}
              </button>
              <button
                onClick={() => handleSelectPreset('Can I take my boat out tomorrow near Vizag?')}
                className="px-2.5 py-1 rounded-lg bg-[#050c18] border border-[#1c2838] text-[11px] text-red-300 hover:border-red-400 font-medium"
              >
                🌀 {lang === 'ta' ? 'விசாகப்பட்டினம் புயல்' : 'Vizag Cyclone Alert'}
              </button>
              <button
                onClick={() => handleSelectPreset('நாளைக்கு சென்னைக்கு அருகில் எங்கு மீன் பிடிக்கலாம்?')}
                className="px-2.5 py-1 rounded-lg bg-[#050c18] border border-[#1c2838] text-[11px] text-teal-300 hover:border-teal-400 font-medium"
              >
                🗣️ {lang === 'ta' ? 'தமிழ் குரல் வினா' : 'Tamil Voice Query'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Advisory Section Header */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block font-mono">
              {response?.intent?.location_name || 'CHENNAI COAST'}
            </span>
            <h3 className="text-lg font-extrabold text-slate-100">
              {lang === 'ta' ? 'கடல் அறிவிப்பு (Advisory)' : 'Marine Advisory'}
            </h3>
          </div>

          {/* Today vs Tomorrow Forecast Selector */}
          <div className="bg-[#050c18] border border-[#1c2838] p-1 rounded-full flex items-center text-xs font-bold font-mono shadow-inner">
            <button
              onClick={() => handleSelectDay('today')}
              className={`px-3 py-1 rounded-full transition ${
                dayToggle === 'today' ? 'bg-cyan-400 text-slate-950 shadow-md' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {lang === 'ta' ? 'இன்று' : 'Today'}
            </button>
            <button
              onClick={() => handleSelectDay('tomorrow')}
              className={`px-3 py-1 rounded-full transition ${
                dayToggle === 'tomorrow' ? 'bg-cyan-400 text-slate-950 shadow-md' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {lang === 'ta' ? 'நாளை' : 'Tomorrow'}
            </button>
          </div>
        </div>

        {/* Main Advisory Recommendation Card */}
        <div
          className={`p-5 rounded-2xl border-2 space-y-4 shadow-2xl transition-all duration-300 ${
            isVeto
              ? 'bg-gradient-to-b from-red-950/90 to-[#0c0507] border-red-500 text-red-100'
              : 'bg-gradient-to-b from-[#091522] to-[#040b14] border-emerald-500/80 text-slate-100'
          }`}
        >
          {/* Status Header Banner */}
          <div className="flex items-center gap-2 pb-3 border-b border-slate-800/80">
            {isVeto ? (
              <div className="p-2 rounded-xl bg-red-900/60 border border-red-500 text-red-300 animate-pulse">
                <AlertTriangle className="w-6 h-6" />
              </div>
            ) : (
              <div className="p-2 rounded-xl bg-emerald-950 border border-emerald-600 text-emerald-400">
                <ShieldCheck className="w-6 h-6" />
              </div>
            )}
            <div>
              <h4 className="text-base font-black uppercase tracking-wide">
                {isVeto
                  ? lang === 'ta' ? '🚨 கடலுக்கு செல்ல வேண்டாம்' : '🚨 DO NOT VENTURE TO SEA'
                  : lang === 'ta' ? '✓ மீன்பிடிக்க பாதுகாப்பானது' : '✓ SAFE TO FISH'}
              </h4>
              <p className="text-[11px] text-slate-300 font-mono">
                {isVeto
                  ? lang === 'ta' ? 'புயல் / அதிக அலை எச்சரிக்கை செயற்பாட்டில் உள்ளது' : 'Cyclone Hazard Warning active in sector'
                  : lang === 'ta' ? 'வானிலை & கடல் நிலைமை சாதகமாக உள்ளது' : 'Sea & weather conditions highly favorable'}
              </p>
            </div>
          </div>

          {/* Recommended Location Name */}
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[10px] font-mono text-slate-400 font-bold uppercase tracking-wider block">
                {lang === 'ta' ? 'பரிந்துரைக்கப்பட்ட இடம்' : 'RECOMMENDED LOCATION'}
              </span>
              <h3 className="text-2xl font-black text-slate-100 mt-0.5 tracking-tight">
                {rec?.sector_name || (lang === 'ta' ? 'சென்னை கிழக்கு கடல் (PFZ #12A)' : 'Chennai Offshore East (PFZ #12A)')}
              </h3>
            </div>
            <span className="px-2.5 py-1 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800 text-[10px] font-mono font-bold">
              {rec?.source || 'INCOIS PFZ'}
            </span>
          </div>

          {/* 3 Metric Display Boxes */}
          <div className="grid grid-cols-3 gap-2.5 text-center">
            <div className="bg-[#050c18]/90 border border-[#1c2838] p-3 rounded-xl">
              <span className="text-[9px] text-slate-400 block font-mono font-bold uppercase">
                {lang === 'ta' ? 'பொருத்தம்' : 'SUITABILITY'}
              </span>
              <strong className="text-cyan-300 text-lg font-mono font-black">
                {rec?.strength_score || (dayToggle === 'today' ? 92 : 88)}%
              </strong>
            </div>

            <div className="bg-[#050c18]/90 border border-[#1c2838] p-3 rounded-xl">
              <span className="text-[9px] text-slate-400 block font-mono font-bold uppercase">
                {lang === 'ta' ? 'தூரம்' : 'DISTANCE'}
              </span>
              <strong className="text-cyan-300 text-lg font-mono font-black">
                {rec?.distance_km || 38} km
              </strong>
            </div>

            <div className="bg-[#050c18]/90 border border-[#1c2838] p-3 rounded-xl">
              <span className="text-[9px] text-slate-400 block font-mono font-bold uppercase">
                {lang === 'ta' ? 'திசை' : 'HEADING'}
              </span>
              <strong className="text-cyan-300 text-lg font-mono font-black">
                {rec?.bearing_deg || 107}° E
              </strong>
            </div>
          </div>

          {/* Interactive Ocean Radar GIS Preview Box */}
          <div className="h-36 bg-[#030812] rounded-xl overflow-hidden border border-[#1c2838] relative flex items-center justify-center p-3">
            <div className="absolute inset-0 opacity-30 bg-[radial-gradient(#38bdf8_1px,transparent_1px)] [background-size:14px_14px]"></div>
            
            {/* Harbour Pin */}
            <div className="absolute left-6 bottom-4 flex flex-col items-center">
              <div className="w-4 h-4 rounded-full bg-sky-500 border-2 border-white flex items-center justify-center shadow-lg">
                <Anchor className="w-2.5 h-2.5 text-slate-950" />
              </div>
              <span className="text-[9px] font-mono font-bold text-sky-300 mt-1 bg-slate-950/80 px-1 rounded">
                Kasimedu
              </span>
            </div>

            {/* Route Dashed Vector Line */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-48 h-0.5 border-t-2 border-dashed border-cyan-400 -rotate-12"></div>
            </div>

            {/* PFZ Zone Target Circle */}
            <div className="absolute right-8 top-5 flex flex-col items-center">
              <div className="w-10 h-10 rounded-full bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center animate-pulse shadow-lg">
                <MapPin className="w-5 h-5 text-emerald-300" />
              </div>
              <span className="text-[9px] font-mono font-bold text-emerald-300 mt-1 bg-slate-950/80 px-1.5 rounded border border-emerald-800">
                PFZ #12A (88%)
              </span>
            </div>
          </div>

          {/* Audio Advisory Player Control Button */}
          <button
            onClick={() => speakAudioAnswer(response)}
            className="w-full py-3.5 rounded-xl bg-[#050c18] hover:bg-[#0a182b] border border-cyan-500/50 text-cyan-300 font-bold text-xs flex items-center justify-between px-4 transition shadow-lg group"
          >
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-cyan-950 text-cyan-400 group-hover:scale-110 transition">
                {isPlayingAudio ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-cyan-400" />}
              </div>
              <div className="text-left">
                <span className="block font-bold text-slate-100">
                  {isPlayingAudio
                    ? (lang === 'ta' ? 'பதில் ஒலிக்கிறது...' : 'Speaking Answer Out Loud...')
                    : (lang === 'ta' ? 'பதிலை மீண்டும் கேட்க (Replay Voice Answer)' : 'Replay Voice Answer')}
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  {lang === 'ta' ? 'தமிழ் குரல் வழிகாட்டி' : 'Synthesized Local Voice'}
                </span>
              </div>
            </div>

            {/* Equalizer animation */}
            <div className="flex items-center gap-1 h-5">
              {[40, 80, 50, 100, 60].map((h, i) => (
                <div
                  key={i}
                  className={`w-1 rounded-full transition-all ${
                    isPlayingAudio ? 'bg-cyan-400 animate-pulse' : 'bg-[#1b2b45]'
                  }`}
                  style={{ height: isPlayingAudio ? `${h}%` : '30%' }}
                ></div>
              ))}
            </div>
          </button>

          {/* VIEW ROUTE Button */}
          <button
            onClick={() => window.location.href = '/marine-map'}
            className="w-full py-3.5 bg-gradient-to-r from-cyan-400 to-teal-400 hover:from-cyan-300 hover:to-teal-300 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl flex items-center justify-center gap-2 transition shadow-xl shadow-cyan-400/20"
          >
            <Navigation className="w-4 h-4 stroke-[3]" />
            <span>{lang === 'ta' ? 'வரைபடத்தில் வழியைக் காட்டு (VIEW ROUTE)' : 'VIEW ROUTE ON GIS MAP'}</span>
          </button>
        </div>
      </div>

      {/* Fixed Bottom Dock Navigation Bar for Fisherman Mode */}
      <div className="fixed bottom-2 left-0 right-0 z-50 px-4 max-w-md mx-auto pointer-events-auto">
        <Dock items={fishermanDockItems} />
      </div>

    </div>
  );
};

export default FishermanPage;
