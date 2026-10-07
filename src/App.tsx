import { useState, useRef, useEffect } from 'react';
import {
  Wrench,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  RotateCcw,
  FileText,
  Clock,
  Mic,
  MicOff,
  Bot,
  Send,
  MapPin,
  ExternalLink,
  MessageSquare,
  X,
  Loader2,
  Sparkles
} from 'lucide-react';

interface AnalysisResult {
  issue: string;
  category: string;
  department: string;
  priority: 'Low' | 'Medium' | 'High';
  location: string;
}

type ComplaintStatus = 'Reported' | 'Assigned' | 'In Progress' | 'Resolved';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  mapSources?: Array<{ title: string; uri: string }>;
}

const EXAMPLE_COMPLAINTS = [
  'Projector in Room 204 is not working',
  'Water is leaking in Block B',
  'The classroom fan is not working'
];

const STATUS_STEPS: ComplaintStatus[] = [
  'Reported',
  'Assigned',
  'In Progress',
  'Resolved'
];

function getMockAnalysis(text: string): AnalysisResult {
  const lower = text.toLowerCase();

  if (lower.includes('projector')) {
    return {
      issue: 'Projector display failure',
      category: 'Audio / Visual Equipment',
      department: 'IT & Classroom Support',
      priority: 'Medium',
      location: 'Room 204'
    };
  }

  if (lower.includes('water') || lower.includes('leak')) {
    return {
      issue: 'Active water pipe leak',
      category: 'Plumbing & Water Supply',
      department: 'Campus Facilities Maintenance',
      priority: 'High',
      location: 'Block B'
    };
  }

  if (lower.includes('fan') || lower.includes('light') || lower.includes('ac')) {
    return {
      issue: 'Classroom ceiling fan malfunction',
      category: 'Electrical & HVAC',
      department: 'Electrical Maintenance Team',
      priority: 'Medium',
      location: 'Main Academic Building'
    };
  }

  const locationMatch = text.match(/(?:room\s+\d+|block\s+[a-z0-9]+|lab\s+\d+|hall\s+[a-z0-9]+)/i);

  return {
    issue: text.length > 60 ? `${text.slice(0, 60)}...` : text,
    category: 'General Campus Maintenance',
    department: 'Campus Operations Desk',
    priority: 'Medium',
    location: locationMatch ? locationMatch[0] : 'Campus Location'
  };
}

export default function App() {
  // Complaint State
  const [complaintText, setComplaintText] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [complaintId, setComplaintId] = useState<string | null>(null);
  const [ticketCount, setTicketCount] = useState<number>(1);
  const [status, setStatus] = useState<ComplaintStatus>('Reported');

  // Audio Transcription state
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isTranscribing, setIsTranscribing] = useState<boolean>(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Chatbot state
  const [isChatOpen, setIsChatOpen] = useState<boolean>(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content:
        'Hello! I am CampusBot, powered by Gemini 3.5. You can ask me about campus repairs, building locations, student facilities, or nearby services with Google Maps grounding.'
    }
  ]);
  const [chatInput, setChatInput] = useState<string>('');
  const [isChatLoading, setIsChatLoading] = useState<boolean>(false);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  // Attempt to acquire geolocation for Google Maps grounding
  useEffect(() => {
    if (typeof window !== 'undefined' && 'geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          });
        },
        () => {
          // Fallback or permission dismissed, proceed gracefully
        },
        { timeout: 5000 }
      );
    }
  }, []);

  // Auto-scroll chat when messages update
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages, isChatLoading]);

  // Basic validation rule: user must enter at least 10 characters
  const trimmedLength = complaintText.trim().length;
  const isAnalyzeDisabled = trimmedLength < 10;

  function handleSelectExample(exampleText: string) {
    setComplaintText(exampleText);
    setErrorMessage('');
  }

  function handleAnalyzeComplaint() {
    const trimmed = complaintText.trim();
    if (trimmed.length < 10) {
      setErrorMessage('Please enter at least 10 characters to analyze your campus complaint.');
      return;
    }

    setErrorMessage('');
    const mockResult = getMockAnalysis(trimmed);
    setAnalysis(mockResult);
    setComplaintId(null);
    setStatus('Reported');
  }

  function handleSubmitComplaint() {
    if (!analysis) return;
    const formattedNumber = String(ticketCount).padStart(3, '0');
    const newId = `CF-2026-${formattedNumber}`;
    setComplaintId(newId);
    setStatus('Reported');
    setTicketCount((prev) => prev + 1);
  }

  function handleReset() {
    setComplaintText('');
    setErrorMessage('');
    setAnalysis(null);
    setComplaintId(null);
    setStatus('Reported');
  }

  // Audio Recording & Transcription using gemini-3.5-transcribe
  async function startRecording() {
    try {
      setErrorMessage('');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        // Stop audio tracks
        stream.getTracks().forEach((track) => track.stop());

        const audioBlob = new Blob(audioChunksRef.current, { type: mediaRecorder.mimeType || 'audio/webm' });
        if (audioBlob.size === 0) return;

        // Convert Blob to base64
        setIsTranscribing(true);
        try {
          const reader = new FileReader();
          reader.readAsDataURL(audioBlob);
          reader.onloadend = async () => {
            const base64Audio = (reader.result as string).split(',')[1];
            const response = await fetch('/api/transcribe', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                audioData: base64Audio,
                mimeType: audioBlob.type || 'audio/webm'
              })
            });

            const data = await response.json();
            if (response.ok && data.text) {
              setComplaintText((prev) => (prev ? `${prev} ${data.text}` : data.text));
            } else {
              setErrorMessage(data.error || 'Failed to transcribe audio.');
            }
            setIsTranscribing(false);
          };
        } catch (err: any) {
          console.error(err);
          setErrorMessage('Error uploading audio for transcription.');
          setIsTranscribing(false);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err: any) {
      console.error(err);
      setErrorMessage('Microphone access denied or not supported in this browser.');
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }

  // Send message to Gemini Chatbot with Maps Grounding
  async function handleSendMessage(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const prompt = chatInput.trim();
    if (!prompt || isChatLoading) return;

    const userMsg: ChatMessage = {
      id: String(Date.now()),
      role: 'user',
      content: prompt
    };

    const newMessages = [...chatMessages, userMsg];
    setChatMessages(newMessages);
    setChatInput('');
    setIsChatLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
          userLocation
        })
      });

      const data = await response.json();
      if (response.ok) {
        const assistantMsg: ChatMessage = {
          id: String(Date.now() + 1),
          role: 'assistant',
          content: data.reply || 'No response generated.',
          mapSources: data.mapSources || []
        };
        setChatMessages((prev) => [...prev, assistantMsg]);
      } else {
        const errorMsg: ChatMessage = {
          id: String(Date.now() + 1),
          role: 'assistant',
          content: `Error: ${data.error || 'Failed to get response from Gemini.'}`
        };
        setChatMessages((prev) => [...prev, errorMsg]);
      }
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        id: String(Date.now() + 1),
        role: 'assistant',
        content: `Error connecting to assistant server: ${err.message}`
      };
      setChatMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsChatLoading(false);
    }
  }

  const currentStatusIndex = STATUS_STEPS.indexOf(status);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col relative">
      {/* 1. Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 sticky top-0 z-20">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <a
            href="#report-section"
            className="text-lg font-bold tracking-tight text-slate-900 flex items-center gap-2 focus-visible:outline-2 focus-visible:outline-blue-600 rounded"
          >
            <Wrench className="w-5 h-5 text-blue-600" aria-hidden="true" />
            <span>CampusFix</span>
          </a>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
            <a href="#report-section" className="hover:text-slate-900 transition-colors">
              Report Issue
            </a>
            <a href="#preview-section" className="hover:text-slate-900 transition-colors">
              Analysis Preview
            </a>
            <a href="#status-section" className="hover:text-slate-900 transition-colors">
              Complaint Status
            </a>
          </nav>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setIsChatOpen(!isChatOpen)}
              className="px-3 py-2 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors flex items-center gap-1.5 focus-visible:outline-2 focus-visible:outline-blue-600 cursor-pointer"
            >
              <Bot className="w-4 h-4 text-blue-600" aria-hidden="true" />
              <span>Ask CampusBot</span>
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-blue-600 flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Reset</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-8 md:py-10">
        {/* Brand Heading & Tagline */}
        <div className="mb-8">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900">
            CampusFix
          </h1>
          <p className="mt-1.5 text-base text-slate-600">
            Report campus problems. Get them to the right team.
          </p>
        </div>

        {/* Two-Column Responsive Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Complaint Details & Audio Microphone */}
          <section
            id="report-section"
            aria-labelledby="complaint-heading"
            className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6"
          >
            <div className="flex items-center justify-between pb-4 mb-5 border-b border-slate-100">
              <div>
                <h2 id="complaint-heading" className="text-lg font-semibold text-slate-900">
                  1. Student Complaint Details
                </h2>
                <p className="text-sm text-slate-500 mt-0.5">
                  Describe the campus issue (minimum 10 characters).
                </p>
              </div>

              {/* Character counter with clear 10-character indicator */}
              <div className="flex items-center gap-2">
                <span
                  className={`text-xs font-mono tabular-nums px-2 py-0.5 rounded ${
                    trimmedLength >= 10
                      ? 'text-emerald-700 bg-emerald-50'
                      : 'text-amber-700 bg-amber-50'
                  }`}
                >
                  {trimmedLength} / 10 min chars
                </span>
              </div>
            </div>

            {/* Problem Description Textarea */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label
                  htmlFor="complaint-textarea"
                  className="text-sm font-medium text-slate-700"
                >
                  Problem Description
                </label>

                {/* Audio Recording Button with gemini-3.5-transcribe */}
                <div className="flex items-center gap-2">
                  {isTranscribing && (
                    <span className="text-xs text-blue-600 flex items-center gap-1">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Transcribing with gemini-3.5-transcribe...
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={isRecording ? stopRecording : startRecording}
                    disabled={isTranscribing}
                    className={`text-xs px-2.5 py-1.5 rounded-md font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                      isRecording
                        ? 'bg-red-600 text-white animate-pulse'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                    title={isRecording ? 'Click to stop recording' : 'Record voice to transcribe'}
                  >
                    {isRecording ? (
                      <>
                        <MicOff className="w-3.5 h-3.5" />
                        <span>Stop Recording</span>
                      </>
                    ) : (
                      <>
                        <Mic className="w-3.5 h-3.5 text-blue-600" />
                        <span>Speak Complaint</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              <textarea
                id="complaint-textarea"
                rows={5}
                value={complaintText}
                onChange={(e) => {
                  setComplaintText(e.target.value);
                  if (errorMessage) setErrorMessage('');
                }}
                placeholder="Describe your campus problem... (e.g. Projector in Room 204 is not turning on during lectures)"
                className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20 transition-colors resize-y"
              />
            </div>

            {/* Validation Notification when less than 10 characters */}
            {trimmedLength > 0 && trimmedLength < 10 && (
              <p className="mt-2 text-xs text-amber-600 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                Please enter at least {10 - trimmedLength} more character{10 - trimmedLength === 1 ? '' : 's'} to enable analysis.
              </p>
            )}

            {/* Error Message */}
            {errorMessage && (
              <div
                role="alert"
                className="mt-3 flex items-start gap-2.5 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3.5 py-2.5"
              >
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" aria-hidden="true" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* 6. Example Complaint Buttons */}
            <div className="mt-5">
              <p className="text-xs font-medium text-slate-500 mb-2.5">
                Try an example complaint (click to fill):
              </p>
              <div className="flex flex-wrap gap-2">
                {EXAMPLE_COMPLAINTS.map((example) => {
                  const isSelected = complaintText === example;
                  return (
                    <button
                      key={example}
                      type="button"
                      onClick={() => handleSelectExample(example)}
                      className={`text-left text-xs px-3 py-2 rounded-lg border transition-colors focus-visible:outline-2 focus-visible:outline-blue-600 cursor-pointer ${
                        isSelected
                          ? 'bg-blue-50 border-blue-300 text-blue-900 font-medium'
                          : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                      }`}
                    >
                      "{example}"
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Analyze Complaint Action with Disabled State */}
            <div className="mt-6 pt-5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-4">
              <p className="text-xs text-slate-500">
                {isAnalyzeDisabled
                  ? 'Input validation active: Type at least 10 characters to enable.'
                  : 'Ready to route and preview complaint.'}
              </p>
              <button
                type="button"
                onClick={handleAnalyzeComplaint}
                disabled={isAnalyzeDisabled}
                className={`px-5 py-2.5 text-sm font-semibold rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap focus-visible:outline-2 focus-visible:outline-blue-600 ${
                  isAnalyzeDisabled
                    ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white cursor-pointer'
                }`}
              >
                <span>Analyze Complaint</span>
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          </section>

          {/* Right Column: Analysis Result Card & Submit */}
          <section
            id="preview-section"
            aria-labelledby="analysis-heading"
            className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6"
          >
            <div className="flex items-center justify-between pb-4 mb-5 border-b border-slate-100">
              <div>
                <h2 id="analysis-heading" className="text-lg font-semibold text-slate-900">
                  2. Analysis Result Preview
                </h2>
                <p className="text-sm text-slate-500 mt-0.5">
                  Structured routing preview
                </p>
              </div>
              <FileText className="w-5 h-5 text-slate-400" aria-hidden="true" />
            </div>

            {!analysis ? (
              <div className="py-12 px-4 text-center">
                <p className="text-sm font-medium text-slate-700">
                  No complaint analyzed yet
                </p>
                <p className="text-xs text-slate-500 mt-1.5 max-w-xs mx-auto leading-relaxed">
                  Enter at least 10 characters on the left, then click{' '}
                  <strong className="font-semibold text-slate-700">Analyze Complaint</strong> to see
                  the routing preview.
                </p>
              </div>
            ) : (
              <div>
                <dl className="divide-y divide-slate-100 text-sm">
                  <div className="py-3 flex flex-col sm:flex-row sm:justify-between gap-1">
                    <dt className="text-slate-500 font-medium">Issue</dt>
                    <dd className="text-slate-900 font-semibold sm:text-right">
                      {analysis.issue}
                    </dd>
                  </div>

                  <div className="py-3 flex flex-col sm:flex-row sm:justify-between gap-1">
                    <dt className="text-slate-500 font-medium">Category</dt>
                    <dd className="text-slate-900 sm:text-right">{analysis.category}</dd>
                  </div>

                  <div className="py-3 flex flex-col sm:flex-row sm:justify-between gap-1">
                    <dt className="text-slate-500 font-medium">Department</dt>
                    <dd className="text-slate-900 font-medium sm:text-right">
                      {analysis.department}
                    </dd>
                  </div>

                  <div className="py-3 flex flex-col sm:flex-row sm:justify-between gap-1">
                    <dt className="text-slate-500 font-medium">Priority</dt>
                    <dd className="sm:text-right font-semibold">
                      {analysis.priority === 'High' && (
                        <span className="text-red-600">High Priority (Urgent)</span>
                      )}
                      {analysis.priority === 'Medium' && (
                        <span className="text-amber-700">Medium Priority (Standard)</span>
                      )}
                      {analysis.priority === 'Low' && (
                        <span className="text-emerald-700">Low Priority (Routine)</span>
                      )}
                    </dd>
                  </div>

                  <div className="py-3 flex flex-col sm:flex-row sm:justify-between gap-1">
                    <dt className="text-slate-500 font-medium">Location</dt>
                    <dd className="text-slate-900 font-mono text-xs sm:text-sm sm:text-right">
                      {analysis.location}
                    </dd>
                  </div>
                </dl>

                <div className="mt-6 pt-5 border-t border-slate-100">
                  {!complaintId ? (
                    <button
                      type="button"
                      onClick={handleSubmitComplaint}
                      className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 active:bg-slate-950 text-white text-sm font-semibold rounded-lg transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-slate-900 cursor-pointer"
                    >
                      Submit Complaint
                    </button>
                  ) : (
                    <div className="bg-emerald-50/70 border border-emerald-200 rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-emerald-800 text-sm font-semibold">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" aria-hidden="true" />
                          <span>Complaint Submitted</span>
                        </div>
                        <span className="font-mono text-sm font-semibold text-slate-900 tabular-nums">
                          {complaintId}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 mt-1.5">
                        Routed to <strong className="font-medium text-slate-800">{analysis.department}</strong>.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>

        {/* 5. Complaint Status Section */}
        <section
          id="status-section"
          aria-labelledby="status-heading"
          className="mt-8 bg-white border border-slate-200 rounded-xl p-6"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-5 mb-6 border-b border-slate-100">
            <div>
              <h2 id="status-heading" className="text-lg font-semibold text-slate-900">
                3. Complaint Status
              </h2>
              <p className="text-sm text-slate-500 mt-0.5">
                {complaintId
                  ? `Tracking active complaint ID ${complaintId}`
                  : 'Submit a complaint above to generate an ID and track resolution stages.'}
              </p>
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Clock className="w-4 h-4 text-slate-400" aria-hidden="true" />
              <span>Current Stage:</span>
              <strong className="font-semibold text-slate-900">
                {complaintId ? status : 'Awaiting Submission'}
              </strong>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            {STATUS_STEPS.map((step, index) => {
              const isSubmitted = Boolean(complaintId);
              const isCurrent = isSubmitted && index === currentStatusIndex;
              const isCompleted = isSubmitted && index < currentStatusIndex;

              return (
                <button
                  key={step}
                  type="button"
                  disabled={!isSubmitted}
                  onClick={() => setStatus(step)}
                  className={`text-left p-4 rounded-lg border transition-colors focus-visible:outline-2 focus-visible:outline-blue-600 ${
                    !isSubmitted
                      ? 'border-slate-200 bg-slate-50/60 opacity-60 cursor-not-allowed'
                      : isCurrent
                      ? 'border-blue-600 bg-blue-50/40 cursor-pointer'
                      : isCompleted
                      ? 'border-emerald-200 bg-emerald-50/30 hover:bg-emerald-50/60 cursor-pointer'
                      : 'border-slate-200 bg-white hover:bg-slate-50 cursor-pointer'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs text-slate-500 font-mono tabular-nums mb-1">
                    <span>Step 0{index + 1}</span>
                    <span>
                      {!isSubmitted
                        ? 'Pending'
                        : isCompleted
                        ? 'Completed'
                        : isCurrent
                        ? 'Active'
                        : 'Upcoming'}
                    </span>
                  </div>
                  <div className="text-sm font-semibold text-slate-900">{step}</div>
                </button>
              );
            })}
          </div>
        </section>
      </main>

      {/* Floating Gemini Chatbot Panel */}
      <div className="fixed bottom-6 right-6 z-30">
        {!isChatOpen ? (
          <button
            type="button"
            onClick={() => setIsChatOpen(true)}
            className="flex items-center gap-2.5 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg hover:shadow-xl transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-blue-600"
          >
            <Bot className="w-5 h-5" />
            <span className="text-sm font-semibold">Ask CampusBot</span>
            <Sparkles className="w-4 h-4 text-blue-200" />
          </button>
        ) : (
          <div className="w-[360px] sm:w-[420px] h-[520px] bg-white border border-slate-300 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200">
            {/* Chatbot Header */}
            <div className="bg-slate-900 text-white px-4 py-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center">
                  <Bot className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold">CampusBot Assistant</h3>
                  <p className="text-[11px] text-slate-300">
                    Gemini 3.5 · Google Maps Grounding
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsChatOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-md transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Chatbot Messages List */}
            <div
              ref={chatScrollRef}
              className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-slate-50 text-sm"
            >
              {chatMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col ${
                    msg.role === 'user' ? 'items-end' : 'items-start'
                  }`}
                >
                  <div
                    className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm ${
                      msg.role === 'user'
                        ? 'bg-blue-600 text-white rounded-br-xs'
                        : 'bg-white text-slate-900 border border-slate-200 shadow-xs rounded-bl-xs'
                    }`}
                  >
                    <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>

                    {/* Google Maps Grounding Links */}
                    {msg.mapSources && msg.mapSources.length > 0 && (
                      <div className="mt-2.5 pt-2 border-t border-slate-200/60">
                        <p className="text-[11px] font-semibold text-slate-600 flex items-center gap-1 mb-1">
                          <MapPin className="w-3 h-3 text-red-500" />
                          <span>Google Maps Grounding Sources:</span>
                        </p>
                        <ul className="space-y-1">
                          {msg.mapSources.map((source, idx) => (
                            <li key={idx}>
                              <a
                                href={source.uri}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                              >
                                <span>{source.title}</span>
                                <ExternalLink className="w-3 h-3 shrink-0" />
                              </a>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {isChatLoading && (
                <div className="flex items-center gap-2 text-xs text-slate-500 bg-white border border-slate-200 rounded-lg p-2.5 w-fit">
                  <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                  <span>CampusBot is thinking...</span>
                </div>
              )}
            </div>

            {/* Quick Prompt Suggestions */}
            <div className="px-3 py-1.5 bg-slate-100 border-t border-slate-200 flex gap-1.5 overflow-x-auto text-[11px]">
              <button
                type="button"
                onClick={() => setChatInput('Where is the campus maintenance office?')}
                className="bg-white border border-slate-200 px-2 py-1 rounded-md text-slate-700 whitespace-nowrap hover:bg-slate-50"
              >
                Maintenance Office
              </button>
              <button
                type="button"
                onClick={() => setChatInput('Find nearby hardware and electronics repair shops')}
                className="bg-white border border-slate-200 px-2 py-1 rounded-md text-slate-700 whitespace-nowrap hover:bg-slate-50"
              >
                Nearby Repair Shops
              </button>
            </div>

            {/* Chat Input Box */}
            <form
              onSubmit={handleSendMessage}
              className="p-3 bg-white border-t border-slate-200 flex items-center gap-2"
            >
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Ask about repairs, locations, services..."
                className="flex-1 bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-blue-600"
              />
              <button
                type="submit"
                disabled={!chatInput.trim() || isChatLoading}
                className="p-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 text-white rounded-lg transition-colors cursor-pointer"
                title="Send message"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
