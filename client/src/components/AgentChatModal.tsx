/**
 * @file AgentChatModal.tsx
 * @description Autonomous FinOps Copilot Dialog powered by Groq OSS 120B & AG Studio 3.0 Agent tools.
 *
 * Implements:
 * - Real-time conversational interface connected to /api/studio-agent/chat
 * - Execution of agentic tools (inspectBlastRadius, refreshChannel3Quotes, triggerScenario)
 * - Quick-prompt pills for rapid scenario assessment
 * - Light and Dark theme support
 */

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCascadeState } from '@/context/CascadeStateContext';
import { useDialog } from './ui/useDialog';
import {
  Bot,
  User,
  Send,
  Sparkles,
  X,
  Wrench,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  TrendingUp,
  Cpu,
  Layers,
  HelpCircle,
  RefreshCw
} from 'lucide-react';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  toolResults?: Array<{ name: string; result: any }>;
}

const QUICK_PROMPTS = [
  'Assess schedule delay & idle labor exposure',
  'Compare supplier quotes for this project',
  'Explain the current policy decisions',
  'Which unfinished phases depend on blocked work?',
];

export const AgentChatModal: React.FC = () => {
  const { isAgentChatOpen, setIsAgentChatOpen, refreshState, activeProjectId, health } = useCascadeState();
  const dialogRef = useDialog(isAgentChatOpen, () => setIsAgentChatOpen(false));
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content:
        'Ask about schedule dependencies, invoice delays, or supplier quotes for this project. Requests to run tools can update project state.',
      timestamp: new Date().toLocaleTimeString(),
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => { setMessages((previous) => previous.filter((message) => message.id === 'welcome')); setInputValue(''); }, [activeProjectId]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isAgentChatOpen) {
      scrollToBottom();
    }
  }, [messages, isAgentChatOpen]);

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputValue).trim();
    if (!text || isSending) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date().toLocaleTimeString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setIsSending(true);

    try {
      const history = messages
        .filter((m) => m.id !== 'welcome')
        .map((m) => ({ role: m.role, content: m.content }));

      const res = await fetch('/api/studio-agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          projectId: activeProjectId,
          conversationHistory: history,
        }),
      });

      if (!res.ok) {
        throw new Error(`Agent API returned ${res.status}`);
      }

      const data = await res.json();

      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: data.content || 'Analysis complete.',
        timestamp: new Date().toLocaleTimeString(),
        toolResults: data.toolResults || [],
      };

      setMessages((prev) => [...prev, assistantMessage]);

      if (data.toolResults && data.toolResults.length > 0) {
        await refreshState(true);
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          role: 'assistant',
          content: `CascadeOS FinOps Engine: ${String(err)}. All core financial invariants remain guarded.`,
          timestamp: new Date().toLocaleTimeString(),
        },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  if (!isAgentChatOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setIsAgentChatOpen(false)}
          className="fixed inset-0 dialog-backdrop"
        />

        {/* Modal Window */}
        <motion.div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label="FinOps assistant"
          tabIndex={-1}
          initial={{ scale: 0.95, opacity: 0, y: 15 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 15 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className="dialog-panel chat-panel relative w-full max-w-2xl overflow-hidden flex flex-col z-10"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-3.5 border-b border-neutral-200 dark:border-white/[0.08] bg-neutral-50 dark:bg-[#090b10]">
            <div className="flex items-center space-x-2.5">
              <div className="w-7 h-7 rounded-md bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 flex items-center justify-center text-neutral-700 dark:text-neutral-300">
                <Bot className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">FinOps Copilot</h3>
                  <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-neutral-100 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-400 border border-neutral-200 dark:border-neutral-800">
                    {health?.llmModel ?? 'Project assistant'}
                  </span>
                </div>
              </div>
            </div>

            <button
              aria-label="Close FinOps assistant"
              onClick={() => setIsAgentChatOpen(false)}
              className="p-1.5 rounded-lg bg-neutral-100 dark:bg-neutral-900 text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white hover:bg-neutral-200 dark:hover:bg-neutral-800 border border-neutral-200 dark:border-neutral-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Messages Body */}
          <div className="flex-1 p-5 overflow-y-auto space-y-3.5" role="log" aria-live="polite" aria-label="Conversation">
            {messages.map((msg) => {
              const isAssistant = msg.role === 'assistant';
              return (
                <div
                  key={msg.id}
                  className={`flex items-start space-x-2.5 ${isAssistant ? '' : 'flex-row-reverse space-x-reverse'}`}
                >
                  <div
                    className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 text-xs ${
                      isAssistant
                        ? 'bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-300'
                        : 'bg-neutral-900 dark:bg-neutral-800 text-white'
                    }`}
                  >
                    {isAssistant ? <Bot className="w-3.5 h-3.5" /> : <User className="w-3.5 h-3.5" />}
                  </div>

                  <div
                    className={`max-w-[85%] rounded-2xl p-3.5 text-xs font-sans leading-relaxed ${
                      isAssistant
                        ? 'bg-neutral-100 dark:bg-neutral-900/60 text-neutral-800 dark:text-neutral-200 border border-neutral-200 dark:border-white/[0.06]'
                        : 'bg-neutral-900 dark:bg-neutral-800 text-white'
                    }`}
                  >
                    <div className="whitespace-pre-wrap">{msg.content}</div>

                    {/* Tool Results */}
                    {msg.toolResults && msg.toolResults.length > 0 && (
                      <div className="mt-2.5 pt-2.5 border-t border-neutral-200 dark:border-white/[0.06] space-y-1.5">
                        <div className="flex items-center space-x-1 text-[10px] font-mono text-neutral-500 font-medium uppercase">
                          <Wrench className="w-3 h-3" />
                          <span>Tools Executed:</span>
                        </div>
                        {msg.toolResults.map((tr, idx) => (
                          <div
                            key={idx}
                            className="p-2 rounded-lg bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 font-mono text-[10px] space-y-0.5"
                          >
                            <div className="text-neutral-900 dark:text-white font-medium">{tr.name}</div>
                            <div className="text-neutral-500 text-[9px] break-all">
                              {typeof tr.result === 'object'
                                ? JSON.stringify(tr.result, null, 2)
                                : String(tr.result)}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="mt-1 text-[10px] text-neutral-400 dark:text-neutral-500 text-right font-mono">
                      {msg.timestamp}
                    </div>
                  </div>
                </div>
              );
            })}

            {isSending && (
              <div className="flex items-start space-x-2.5">
                <div className="w-6 h-6 rounded-md bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 flex items-center justify-center text-neutral-500">
                  <Bot className="w-3.5 h-3.5" />
                </div>
                <div className="bg-neutral-100 dark:bg-neutral-900/60 border border-neutral-200 dark:border-white/[0.06] rounded-2xl px-3.5 py-2 text-xs text-neutral-500 flex items-center space-x-2 font-mono">
                  <RefreshCw className="w-3 h-3 animate-spin text-neutral-500" />
                  <span>FinOps Copilot reasoning...</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Quick Prompts Bar */}
          <div className="px-5 py-2 bg-neutral-50 dark:bg-neutral-950/60 border-t border-neutral-200 dark:border-white/[0.06] overflow-x-auto flex space-x-1.5 scrollbar-none">
            {QUICK_PROMPTS.map((prompt, i) => (
              <button
                key={i}
                onClick={() => handleSendMessage(prompt)}
                disabled={isSending}
                className="whitespace-nowrap px-2.5 py-0.5 rounded-full text-[10px] font-mono bg-white hover:bg-neutral-100 dark:bg-neutral-900 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white border border-neutral-200 dark:border-neutral-800 transition-colors flex items-center space-x-1 disabled:opacity-50"
              >
                <Sparkles className="w-2.5 h-2.5" />
                <span>{prompt}</span>
              </button>
            ))}
          </div>

          {/* Input Form */}
          <div className="chat-composer p-3 bg-neutral-50 dark:bg-[#090b10] border-t border-neutral-200 dark:border-white/[0.08]">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="flex items-center space-x-2"
            >
              <input
                aria-label="Message to FinOps assistant"
                type="text"
                placeholder="Ask about idle hours, Channel3 savings, or schedule reroutes..."
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                disabled={isSending}
                className="flex-1 px-3.5 py-2 bg-white dark:bg-neutral-950 border border-neutral-300 dark:border-neutral-800 rounded-xl text-neutral-900 dark:text-white text-xs font-mono placeholder:text-neutral-400 focus:outline-none focus:border-neutral-500 transition-colors"
              />
              <button
                type="submit"
                disabled={isSending || !inputValue.trim()}
                className="px-3.5 py-2 bg-neutral-900 hover:bg-neutral-800 dark:bg-white dark:hover:bg-neutral-200 text-white dark:text-neutral-950 font-medium text-xs font-mono rounded-xl transition-all flex items-center space-x-1 disabled:opacity-50"
              >
                <span>Send</span>
                <Send className="w-3 h-3" />
              </button>
            </form>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default AgentChatModal;
