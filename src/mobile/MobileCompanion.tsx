import React, { useState, useEffect } from 'react';
import {
  SessionRecord,
  BlePacket,
  reassemblePackets,
} from '../shared/contract.ts';
import {
  virtualBus,
  DeviceState,
  INITIAL_DEVICE_STATE,
  TransportMessage,
} from '../shared/transport.ts';
import {
  generateDemoHistory,
  HistoricalSessionSummary,
} from '../shared/engine.ts';
import { HomeScreen } from './HomeScreen.tsx';
import { ConnectScreen } from './ConnectScreen.tsx';
import { ReportView } from './ReportView.tsx';
import { TrendView } from './TrendView.tsx';
import { HistoryView } from './HistoryView.tsx';
import { SettingsView } from './SettingsView.tsx';
import { ReceivingSheet } from './ReceivingSheet.tsx';
import { SafetyBanner } from '../components/SafetyBanner.tsx';
import {
  Home,
  TrendingUp,
  History as HistoryIcon,
  Settings,
  ArrowLeft,
} from 'lucide-react';

interface MobileCompanionProps {
  initialSessions?: SessionRecord[];
  onTriggerRecord?: (type: 'Normal' | 'Wheeze' | 'Crackle' | 'Noisy') => void;
}

export const MobileCompanion: React.FC<MobileCompanionProps> = ({
  initialSessions = [],
  onTriggerRecord,
}) => {
  const [deviceState, setDeviceState] = useState<DeviceState>(INITIAL_DEVICE_STATE);
  const [isPaired, setIsPaired] = useState(true);
  const [activeTab, setActiveTab] = useState<'home' | 'trend' | 'history' | 'settings'>('home');
  const [selectedReport, setSelectedReport] = useState<SessionRecord | null>(null);

  // Stored Sessions in localStorage
  const [sessions, setSessions] = useState<SessionRecord[]>(() => {
    try {
      const stored = localStorage.getItem('pulmoscan_sessions');
      return stored ? JSON.parse(stored) : initialSessions;
    } catch {
      return initialSessions;
    }
  });

  // Longitudinal Demo History
  const [historySummaries, setHistorySummaries] = useState<HistoricalSessionSummary[]>(() => {
    try {
      const stored = localStorage.getItem('pulmoscan_history_summaries');
      return stored ? JSON.parse(stored) : generateDemoHistory();
    } catch {
      return generateDemoHistory();
    }
  });

  // Packet Receiving State
  const [isReceiving, setIsReceiving] = useState(false);
  const [receivedPackets, setReceivedPackets] = useState<BlePacket[]>([]);
  const [totalExpectedPackets, setTotalExpectedPackets] = useState(0);
  const [isRecovering, setIsRecovering] = useState(false);

  // Sync sessions with localStorage
  useEffect(() => {
    try {
      localStorage.setItem('pulmoscan_sessions', JSON.stringify(sessions));
    } catch {}
  }, [sessions]);

  // Subscribe to transport messages
  useEffect(() => {
    const unsubscribe = virtualBus.subscribe((msg: TransportMessage) => {
      if (msg.type === 'DEVICE_STATE') {
        setDeviceState((prev) => ({ ...prev, ...msg.payload }));
      } else if (msg.type === 'WIFI_REPORT') {
        // High-speed direct Wi-Fi sync: immediate payload delivery
        const newRecord: SessionRecord = msg.payload;
        setIsReceiving(true);
        setTotalExpectedPackets(1);
        setReceivedPackets([{ seq: 1, total: 1, data: '' }]);

        setTimeout(() => {
          setIsReceiving(false);
          setSessions((prev) => [newRecord, ...prev]);
          setSelectedReport(newRecord);
          // Haptic feedback
          if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
            navigator.vibrate([40, 60, 40]);
          }
        }, 350);
      } else if (msg.type === 'PACKET') {
        // Virtual BLE chunking stream
        const packet: BlePacket = msg.payload;
        setIsReceiving(true);
        setTotalExpectedPackets(packet.total);
        setReceivedPackets((prev) => {
          const exists = prev.some((p) => p.seq === packet.seq);
          const updated = exists ? prev : [...prev, packet];

          // Check if we reached the total
          if (updated.length >= packet.total) {
            // Reassemble
            const result = reassemblePackets(updated);
            if (result.success && result.data) {
              try {
                const sessionRecord: SessionRecord = JSON.parse(result.data);
                setTimeout(() => {
                  setIsReceiving(false);
                  setIsRecovering(false);
                  setReceivedPackets([]);
                  setSessions((prevSessions) => [sessionRecord, ...prevSessions]);
                  setSelectedReport(sessionRecord);
                  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
                    navigator.vibrate(60);
                  }
                }, 300);
              } catch (e) {
                console.error('Failed to parse reassembled session record', e);
                setIsReceiving(false);
              }
            } else {
              // Missing packets! Send NACK back
              setIsRecovering(true);
              const missing: number[] = [];
              for (let i = 1; i <= packet.total; i++) {
                if (!updated.some((p) => p.seq === i)) missing.push(i);
              }
              virtualBus.send({
                type: 'NACK',
                sender: 'companion',
                timestamp: Date.now(),
                payload: { missingSeqs: missing },
              });
            }
          }
          return updated;
        });
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const handleLoadDemoHistory = () => {
    const demo = generateDemoHistory();
    setHistorySummaries(demo);
    localStorage.setItem('pulmoscan_history_summaries', JSON.stringify(demo));
    setActiveTab('trend');
  };

  const handleClearAllData = () => {
    setSessions([]);
    localStorage.removeItem('pulmoscan_sessions');
    setSelectedReport(null);
  };

  const latestSession = sessions[0] || null;
  const validDaysCount = historySummaries.filter((h) => h.quality === 1 && !h.isCensored).length;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans selection:bg-teal-500 selection:text-white pb-safe">
      {/* Non-negotiable Medical Prototype Disclaimer */}
      <SafetyBanner compact />

      {/* Screen Rendering */}
      <main className="flex-1 overflow-y-auto">
        {!isPaired ? (
          <ConnectScreen
            deviceState={deviceState}
            onConnect={() => setIsPaired(true)}
          />
        ) : selectedReport ? (
          <div className="relative">
            <header className="sticky top-0 bg-white/90 backdrop-blur-md border-b border-slate-200/80 px-4 py-3 flex items-center justify-between z-30">
              <button
                onClick={() => setSelectedReport(null)}
                className="flex items-center gap-1.5 text-xs font-bold text-slate-700 hover:text-slate-900 py-1 px-2 rounded-lg hover:bg-slate-100 transition"
              >
                <ArrowLeft className="w-4 h-4 text-teal-600" />
                <span>Dashboard</span>
              </button>
              <span className="text-xs font-bold text-slate-800">Screening Report</span>
              <div className="w-12"></div>
            </header>

            <ReportView
              session={selectedReport}
              onClose={() => setSelectedReport(null)}
              onRecordAgain={() => {
                setSelectedReport(null);
                if (onTriggerRecord) onTriggerRecord('Normal');
              }}
            />
          </div>
        ) : (
          <>
            {activeTab === 'home' && (
              <HomeScreen
                latestSession={latestSession}
                deviceState={deviceState}
                validDaysCount={validDaysCount}
                onViewReport={() => {
                  if (latestSession) setSelectedReport(latestSession);
                }}
                onNavigateTab={(t) => setActiveTab(t)}
              />
            )}

            {activeTab === 'trend' && (
              <TrendView
                history={historySummaries}
                isDemoHistory={true}
              />
            )}

            {activeTab === 'history' && (
              <HistoryView
                sessions={sessions}
                onSelectSession={(s) => setSelectedReport(s)}
                onDeleteSession={(id) => {
                  setSessions((prev) => prev.filter((s) => s.id !== id));
                }}
              />
            )}

            {activeTab === 'settings' && (
              <SettingsView
                deviceState={deviceState}
                onLoadDemoHistory={handleLoadDemoHistory}
                onClearAllData={handleClearAllData}
              />
            )}
          </>
        )}
      </main>

      {/* Live Receiving Modal / Sheet */}
      <ReceivingSheet
        isOpen={isReceiving}
        receivedCount={receivedPackets.length}
        totalCount={totalExpectedPackets}
        transport={deviceState.transportMode}
        isRecovering={isRecovering}
      />

      {/* Bottom Tab Bar (390px Native App Style) */}
      {isPaired && !selectedReport && (
        <nav
          aria-label="Mobile Navigation"
          className="fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur-md border-t border-slate-200/90 py-2 px-6 flex items-center justify-around z-40 shadow-lg"
        >
          <button
            onClick={() => setActiveTab('home')}
            className={`flex flex-col items-center gap-1 transition ${
              activeTab === 'home' ? 'text-teal-600 font-bold' : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <Home className="w-5 h-5" />
            <span className="text-[10px]">Home</span>
          </button>

          <button
            onClick={() => setActiveTab('trend')}
            className={`flex flex-col items-center gap-1 transition ${
              activeTab === 'trend' ? 'text-teal-600 font-bold' : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <TrendingUp className="w-5 h-5" />
            <span className="text-[10px]">Trend</span>
          </button>

          <button
            onClick={() => setActiveTab('history')}
            className={`flex flex-col items-center gap-1 transition ${
              activeTab === 'history' ? 'text-teal-600 font-bold' : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <HistoryIcon className="w-5 h-5" />
            <span className="text-[10px]">History</span>
          </button>

          <button
            onClick={() => setActiveTab('settings')}
            className={`flex flex-col items-center gap-1 transition ${
              activeTab === 'settings' ? 'text-teal-600 font-bold' : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <Settings className="w-5 h-5" />
            <span className="text-[10px]">Settings</span>
          </button>
        </nav>
      )}
    </div>
  );
};
