import React, { useState, useEffect, useRef } from 'react';
import { Mic, StopCircle, ArrowUp, Square, Volume2, Sparkles } from 'lucide-react';

interface VoiceRecorderProps {
  onTranscriptChange: (text: string) => void;
  onSendQuery?: (text: string) => void;
  language?: 'EN' | 'TA';
  initialText?: string;
  className?: string;
}

export const VoiceRecorder: React.FC<VoiceRecorderProps> = ({
  onTranscriptChange,
  onSendQuery,
  language = 'EN',
  initialText = '',
  className = ''
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState(initialText);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [barHeights, setBarHeights] = useState<number[]>([]);
  
  const timerRef = useRef<any>(null);
  const recognitionRef = useRef<any>(null);

  // Sync initialText changes
  useEffect(() => {
    setTranscript(initialText);
  }, [initialText]);

  // Generate 32 bars with randomized initial heights
  useEffect(() => {
    const bars = Array.from({ length: 32 }, () => Math.floor(Math.random() * 65) + 20);
    setBarHeights(bars);
  }, []);

  // Update bar heights periodically during recording to simulate real audio spectrum
  useEffect(() => {
    let animInterval: any = null;
    if (isRecording) {
      animInterval = setInterval(() => {
        setBarHeights(Array.from({ length: 32 }, () => Math.floor(Math.random() * 85) + 15));
      }, 120);
    }
    return () => {
      if (animInterval) clearInterval(animInterval);
    };
  }, [isRecording]);

  // Recording timer tick
  useEffect(() => {
    if (isRecording) {
      setRecordSeconds(0);
      timerRef.current = setInterval(() => {
        setRecordSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRecording]);

  // Initialize SpeechRecognition
  const startSpeechRecognition = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (SpeechRecognition) {
      try {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = language === 'TA' ? 'ta-IN' : 'en-IN';

        recognition.onresult = (event: any) => {
          let currentTranscript = '';
          for (let i = event.resultIndex; i < event.results.length; i++) {
            currentTranscript += event.results[i][0].transcript;
          }
          if (currentTranscript.trim()) {
            setTranscript(currentTranscript);
            onTranscriptChange(currentTranscript);
          }
        };

        recognition.onerror = (err: any) => {
          console.warn('SpeechRecognition error, switching to preset demo transcript:', err);
          fallbackDemoTranscript();
        };

        recognition.onend = () => {
          setIsRecording(false);
        };

        recognition.start();
        recognitionRef.current = recognition;
      } catch (e) {
        fallbackDemoTranscript();
      }
    } else {
      fallbackDemoTranscript();
    }
  };

  const fallbackDemoTranscript = () => {
    const defaultText = language === 'TA'
      ? 'நாளைக்கு சென்னைக்கு அருகில் எங்கு மீன் பிடிக்கலாம்?'
      : 'Where should I fish tomorrow near Chennai?';
    setTranscript(defaultText);
    onTranscriptChange(defaultText);
  };

  const handleToggleRecord = () => {
    if (isRecording) {
      // Stop Recording
      setIsRecording(false);
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch (e) {}
      }
    } else {
      // Start Recording
      setIsRecording(true);
      startSpeechRecognition();
    }
  };

  const handleSend = () => {
    if (transcript.trim() && onSendQuery) {
      onSendQuery(transcript.trim());
    }
  };

  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  return (
    <div className={`space-y-3 font-mono ${className}`}>
      
      {/* Input Field with Action Button */}
      <div className="bg-[#050c18] border border-[#1c2838] focus-within:border-cyan-500/80 p-3 rounded-xl flex items-start gap-2.5 transition-all shadow-inner">
        <textarea
          rows={3}
          value={transcript}
          onChange={(e) => {
            setTranscript(e.target.value);
            onTranscriptChange(e.target.value);
          }}
          placeholder={language === 'TA' ? 'பேச மைக் பட்டனை அழுத்தவும்...' : 'Type or press mic to speak query...'}
          className="w-full bg-transparent text-xs text-slate-100 font-bold outline-none resize-none placeholder:text-slate-500"
        />

        {/* Action Button: Mic -> StopCircle -> Send */}
        <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
          {isRecording ? (
            <button
              type="button"
              onClick={handleToggleRecord}
              className="p-2 rounded-xl bg-red-950/80 text-red-500 border border-red-800 hover:bg-red-900 transition flex items-center justify-center shadow-lg shadow-red-950/60 group"
              title="Stop Recording"
            >
              <StopCircle className="w-5 h-5 animate-pulse drop-shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
            </button>
          ) : transcript.trim().length > 0 && onSendQuery ? (
            <button
              type="button"
              onClick={handleSend}
              className="p-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 transition flex items-center justify-center shadow-lg shadow-cyan-500/30"
              title="Execute Query"
            >
              <ArrowUp className="w-4 h-4 stroke-[3]" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleToggleRecord}
              className="p-2 rounded-xl bg-[#0e1929] hover:bg-[#18273c] text-cyan-400 hover:text-cyan-300 border border-[#1c2838] hover:border-cyan-500/50 transition flex items-center justify-center"
              title="Start Voice Recording"
            >
              <Mic className="w-4 h-4 text-cyan-400" />
            </button>
          )}
        </div>
      </div>

      {/* Animated Voice Recording & Visualizer Overlay */}
      <div
        className={`transition-all duration-300 overflow-hidden ${
          isRecording ? 'opacity-100 max-h-28 py-1' : 'opacity-0 max-h-0'
        }`}
      >
        <div className="bg-[#081220] border border-cyan-500/40 p-3 rounded-xl space-y-2 shadow-xl backdrop-blur-md">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-mono font-bold text-red-400">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.9)]" />
              <span>RECORDING {formatTimer(recordSeconds)}</span>
              <span className="text-[10px] text-slate-500 font-normal">({language === 'TA' ? 'தமிழ் குரல் பதிவு' : 'Live AIS Speech API'})</span>
            </div>

            <button
              type="button"
              onClick={handleToggleRecord}
              className="text-[10px] text-red-400 hover:text-red-300 uppercase font-bold flex items-center gap-1 bg-red-950/60 px-2 py-0.5 rounded border border-red-900"
            >
              <Square className="w-2.5 h-2.5 fill-red-400" />
              Done
            </button>
          </div>

          {/* 32-Bar Audio Wave Visualizer */}
          <div className="h-10 flex items-end justify-between gap-1 px-1 bg-[#040912] p-2 rounded-lg border border-[#142234]">
            {barHeights.map((h, i) => (
              <div
                key={i}
                className="w-1 md:w-1.5 rounded-full bg-gradient-to-t from-cyan-500 via-teal-400 to-emerald-300 transition-all duration-150 shadow-[0_0_6px_rgba(6,182,212,0.6)]"
                style={{
                  height: `${h}%`,
                  transitionDelay: `${i * 0.02}s`
                }}
              />
            ))}
          </div>

          {/* Live Transcript Preview */}
          <div className="flex items-center gap-1.5 text-[11px] text-cyan-300 font-mono">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400 shrink-0 animate-spin" />
            <span className="truncate">{transcript || (language === 'TA' ? 'குரல் கேட்கிறது...' : 'Listening to speech...')}</span>
          </div>
        </div>
      </div>

    </div>
  );
};
