/**
 * AI Command Center — natural-language business intelligence console.
 *
 * Provides a conversational interface for asking questions about the business.
 * Routes queries through the AI service layer which checks permissions, fetches
 * data from existing analytics services, and generates grounded responses.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Sparkles,
  Send,
  Lightbulb,
  AlertTriangle,
  TrendingUp,
  ExternalLink,
  CheckCircle2,
  Clock,
  ArrowRight,
  MessageSquare,
  BarChart3,
  ShieldAlert,
  Zap,
} from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { AccessDenied } from "@/components/ui/AccessDenied";
import { can } from "@/domain/identity/types";
import { useContextStore } from "@/state/context-store";
import {
  processQuery,
  buildAIContext,
  generateDailyBriefing,
} from "@/domain/ai/ai-service";
import { isAIAvailable } from "@/domain/ai/ai-provider";
import type {
  AIContext,
  AIResponse,
  AIFinding,
  AIRecommendation,
  AISourceReference,
  AISuggestedAction,
  AIDailyBriefing,
  AIMessage,
} from "@/domain/ai/types";
import clsx from "clsx";

// =====================================================================
// QUICK PROMPTS
// =====================================================================

const QUICK_PROMPTS = [
  { label: "What needs my attention today?", icon: AlertTriangle },
  { label: "Show today's business summary", icon: BarChart3 },
  { label: "What changed today?", icon: Zap },
  { label: "Why is revenue changing?", icon: TrendingUp },
  { label: "Which inventory items need attention?", icon: AlertTriangle },
  { label: "Which payments are overdue?", icon: Clock },
];

// =====================================================================
// COMPONENT
// =====================================================================

export default function AICommandCenter() {
  const navigate = useNavigate();
  const context = useContextStore((s) => s.context);
  const permissions = useContextStore((s) => s.permissions);
  const organizationId = context.organizationId;
  const propertyId = context.propertyId;

  const canView = can("analytics.dashboard.view", permissions);

  const [aiContext, setAIContext] = useState<AIContext | null>(null);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [lastResponse, setLastResponse] = useState<AIResponse | null>(null);
  const [briefing, setBriefing] = useState<AIDailyBriefing | null>(null);
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiAvailable, setAIAvailable] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!organizationId || !canView) return;
    const userId = permissions ? "current-user" : "";
    const perms = permissions ? Array.from(permissions.permissions) : [];
    const ctx = buildAIContext(organizationId, userId, perms, propertyId ?? undefined);
    setAIContext(ctx);
  }, [organizationId, propertyId, permissions, canView]);

  useEffect(() => {
    isAIAvailable().then(setAIAvailable);
  }, []);

  useEffect(() => {
    if (!aiContext) return;
    let ignore = false;
    setBriefingLoading(true);
    generateDailyBriefing(aiContext)
      .then((b) => {
        if (!ignore) setBriefing(b);
      })
      .finally(() => {
        if (!ignore) setBriefingLoading(false);
      });
    return () => { ignore = true; };
  }, [aiContext]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleAsk = useCallback(async (q?: string) => {
    const queryText = (q || question).trim();
    if (!queryText || !aiContext || loading) return;

    setQuestion("");
    setError(null);
    setLoading(true);

    const userMsg: AIMessage = {
      id: `msg-${Date.now()}-user`,
      conversationId: "current",
      role: "USER",
      content: queryText,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);

    try {
      const response = await processQuery({
        id: `q-${Date.now()}`,
        question: queryText,
        context: aiContext,
        conversationId: "current",
      });

      setLastResponse(response);

      const assistantMsg: AIMessage = {
        id: `msg-${Date.now()}-assistant`,
        conversationId: "current",
        role: "ASSISTANT",
        content: response.answer,
        queryId: response.queryId,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      setError("Failed to process your question. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [question, aiContext, loading]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleAsk();
    }
  };

  if (!canView) {
    return (
      <AccessDenied
        capability="access AI Command Center"
        permission="analytics.dashboard.view"
      />
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#FAFAF8]">
      {/* Header */}
      <div className="border-b border-[#E3E7E3] bg-white px-6 py-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#1B5E3B] to-[#123C2A]">
            <Sparkles className="h-5 w-5 text-[#D9A441]" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-[#17201B]">AMRUT AI</h1>
            <p className="text-sm text-[#66706A]">
              Your hospitality business intelligence
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span
              className={clsx(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
                aiAvailable
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-amber-50 text-amber-700",
              )}
            >
              <span
                className={clsx(
                  "h-1.5 w-1.5 rounded-full",
                  aiAvailable ? "bg-emerald-500" : "bg-amber-500",
                )}
              />
              {aiAvailable ? "AI Connected" : "Stub Mode"}
            </span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl px-6 py-6 space-y-6">
          {/* Daily Briefing */}
          {briefing && !briefingLoading && (
            <BriefingCard briefing={briefing} />
          )}

          {/* Query Input */}
          <div className="rounded-2xl border border-[#E3E7E3] bg-white p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#1B5E3B]/10">
                <MessageSquare className="h-4 w-4 text-[#1B5E3B]" />
              </div>
              <div className="flex-1">
                <textarea
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask anything about your business..."
                  rows={2}
                  className="w-full resize-none rounded-lg border border-[#E3E7E3] bg-[#F7F8F5] px-3 py-2 text-sm text-[#17201B] placeholder:text-[#66706A] focus:border-[#1B5E3B] focus:outline-none focus:ring-1 focus:ring-[#1B5E3B]/20"
                />
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-xs text-[#66706A]">
                    Press Enter to ask, Shift+Enter for new line
                  </span>
                  <button
                    onClick={() => handleAsk()}
                    disabled={!question.trim() || loading}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#1B5E3B] px-3 py-1.5 text-sm font-medium text-white transition hover:bg-[#164A35] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Send className="h-3.5 w-3.5" />
                    Ask
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Prompts */}
          {messages.length === 0 && (
            <div>
              <p className="mb-3 text-xs font-medium uppercase tracking-wide text-[#66706A]">
                Quick questions
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {QUICK_PROMPTS.map((prompt) => (
                  <button
                    key={prompt.label}
                    onClick={() => handleAsk(prompt.label)}
                    className="flex items-center gap-2.5 rounded-xl border border-[#E3E7E3] bg-white px-4 py-3 text-left text-sm text-[#17201B] transition hover:border-[#1B5E3B]/30 hover:bg-[#F7F8F5]"
                  >
                    <prompt.icon className="h-4 w-4 shrink-0 text-[#C9972E]" />
                    {prompt.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="flex items-center gap-3 rounded-xl border border-[#E3E7E3] bg-white p-4">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#1B5E3B] border-t-transparent" />
              <span className="text-sm text-[#66706A]">Analyzing your question...</span>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              <span className="text-sm text-red-700">{error}</span>
            </div>
          )}

          {/* Conversation Messages */}
          {messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              response={msg.role === "ASSISTANT" && lastResponse?.queryId === msg.queryId ? lastResponse ?? undefined : undefined}
              onNavigate={navigate}
            />
          ))}

          <div ref={messagesEndRef} />

          {/* Empty state */}
          {messages.length === 0 && !loading && !briefing && (
            <EmptyState
              icon={<Sparkles className="h-8 w-8 text-[#C9972E]" />}
              title="Ask AMRUT AI"
              description="Ask questions about your business — revenue, occupancy, inventory, customers, and more. Every answer is grounded in your actual data."
            />
          )}
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// BRIEFING CARD
// =====================================================================

function BriefingCard({ briefing }: { briefing: AIDailyBriefing }) {
  return (
    <div className="rounded-2xl border border-[#E3E7E3] bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-[#C9972E]" />
        <h2 className="text-sm font-semibold text-[#17201B]">Today's Intelligence</h2>
        <span className="ml-auto text-xs text-[#66706A]">{briefing.date}</span>
      </div>

      <p className="mb-4 text-sm text-[#66706A]">{briefing.summary}</p>

      {/* Highlights */}
      <div className="mb-4 grid grid-cols-3 gap-3">
        {briefing.highlights.map((h) => (
          <div key={`${h.category}-${h.metric}`} className="rounded-lg bg-[#F7F8F5] p-3">
            <p className="text-xs text-[#66706A]">{h.category}</p>
            <p className="text-lg font-semibold tabular-nums text-[#17201B]">
              {h.currency === "INR"
                ? `₹${(h.value / 100000).toFixed(1)}L`
                : h.value.toLocaleString()}
            </p>
            {h.change !== undefined && h.change !== 0 && (
              <p
                className={clsx(
                  "text-xs font-medium",
                  h.change > 0 ? "text-emerald-600" : "text-red-600",
                )}
              >
                {h.change > 0 ? "+" : ""}
                {h.change.toFixed(1)}%
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Priorities */}
      {briefing.priorities.length > 0 && (
        <div className="mb-3">
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-[#66706A]">
            Priorities
          </p>
          {briefing.priorities.map((p, i) => (
            <p key={i} className="text-sm text-[#17201B]">
              {i + 1}. {p}
            </p>
          ))}
        </div>
      )}

      {/* Attention Items */}
      {briefing.attentionItems.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-[#66706A]">
            Attention Required
          </p>
          <div className="space-y-1.5">
            {briefing.attentionItems.slice(0, 3).map((item) => (
              <div
                key={item.id}
                className="flex items-start gap-2 rounded-lg bg-amber-50 p-2.5"
              >
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                <div>
                  <p className="text-sm font-medium text-[#17201B]">{item.title}</p>
                  <p className="text-xs text-[#66706A]">{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// =====================================================================
// MESSAGE BUBBLE
// =====================================================================

function MessageBubble({
  message,
  response,
  onNavigate,
}: {
  message: AIMessage;
  response?: AIResponse;
  onNavigate: (path: string) => void;
}) {
  const isUser = message.role === "USER";

  return (
    <div className={clsx("flex gap-3", isUser ? "justify-end" : "justify-start")}>
      {!isUser && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[#1B5E3B] to-[#123C2A]">
          <Sparkles className="h-4 w-4 text-[#D9A441]" />
        </div>
      )}

      <div
        className={clsx(
          "max-w-[80%] rounded-2xl px-4 py-3",
          isUser
            ? "bg-[#1B5E3B] text-white"
            : "border border-[#E3E7E3] bg-white",
        )}
      >
        {/* Answer text */}
        <p
          className={clsx(
            "text-sm whitespace-pre-wrap",
            isUser ? "text-white" : "text-[#17201B]",
          )}
        >
          {message.content}
        </p>

        {/* Response details (only for assistant messages with response data) */}
        {response && !isUser && (
          <div className="mt-3 space-y-3 border-t border-[#E3E7E3] pt-3">
            {/* Findings */}
            {response.findings.length > 0 && (
              <FindingsSection findings={response.findings} />
            )}

            {/* Recommendations */}
            {response.recommendations.length > 0 && (
              <RecommendationsSection recommendations={response.recommendations} />
            )}

            {/* Sources */}
            {response.sources.length > 0 && (
              <SourcesSection
                sources={response.sources}
                onNavigate={onNavigate}
              />
            )}

            {/* Suggested Actions */}
            {response.suggestedActions.length > 0 && (
              <ActionsSection actions={response.suggestedActions} />
            )}

            {/* Confidence & Freshness */}
            <div className="flex items-center gap-3 text-xs text-[#66706A]">
              <span className="flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" />
                {response.confidence === "HIGH"
                  ? "Based on live data"
                  : response.confidence === "MEDIUM"
                    ? "Partial data available"
                    : "Limited data"}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {response.dataFreshness === "LIVE"
                  ? "Live data"
                  : response.dataFreshness === "PARTIAL"
                    ? "Partial data"
                    : "Data may be stale"}
              </span>
            </div>
          </div>
        )}
      </div>

      {isUser && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#E3E7E3]">
          <MessageSquare className="h-4 w-4 text-[#66706A]" />
        </div>
      )}
    </div>
  );
}

// =====================================================================
// FINDINGS
// =====================================================================

function FindingsSection({ findings }: { findings: AIFinding[] }) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[#66706A]">
        Key Findings
      </p>
      <div className="space-y-2">
        {findings.map((f, i) => (
          <div key={i} className="rounded-lg bg-[#F7F8F5] p-2.5">
            <p className="text-sm font-medium text-[#17201B]">{f.statement}</p>
            <p className="mt-0.5 text-xs text-[#66706A]">{f.evidence}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// =====================================================================
// RECOMMENDATIONS
// =====================================================================

function RecommendationsSection({
  recommendations,
}: {
  recommendations: AIRecommendation[];
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[#66706A]">
        Recommendations
      </p>
      <div className="space-y-2">
        {recommendations.map((r, i) => (
          <div
            key={i}
            className={clsx(
              "flex items-start gap-2 rounded-lg p-2.5",
              r.priority === "HIGH"
                ? "bg-red-50"
                : r.priority === "MEDIUM"
                  ? "bg-amber-50"
                  : "bg-blue-50",
            )}
          >
            <Lightbulb
              className={clsx(
                "mt-0.5 h-3.5 w-3.5 shrink-0",
                r.priority === "HIGH"
                  ? "text-red-500"
                  : r.priority === "MEDIUM"
                    ? "text-amber-500"
                    : "text-blue-500",
              )}
            />
            <div>
              <p className="text-sm font-medium text-[#17201B]">{r.statement}</p>
              <p className="text-xs text-[#66706A]">{r.reasoning}</p>
              {r.action && (
                <p className="mt-1 text-xs font-medium text-[#1B5E3B]">
                  Suggested: {r.action}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// =====================================================================
// SOURCES
// =====================================================================

function SourcesSection({
  sources,
  onNavigate,
}: {
  sources: AISourceReference[];
  onNavigate: (path: string) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[#66706A]">
        Sources
      </p>
      <div className="flex flex-wrap gap-2">
        {sources.map((s, i) => (
          <button
            key={i}
            onClick={() => s.route && onNavigate(s.route)}
            className="inline-flex items-center gap-1 rounded-full border border-[#E3E7E3] bg-white px-2.5 py-1 text-xs text-[#17201B] transition hover:border-[#1B5E3B]/30 hover:bg-[#F7F8F5]"
          >
            {s.label}
            {s.route && <ExternalLink className="h-3 w-3 text-[#66706A]" />}
          </button>
        ))}
      </div>
    </div>
  );
}

// =====================================================================
// SUGGESTED ACTIONS
// =====================================================================

function ActionsSection({ actions }: { actions: AISuggestedAction[] }) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[#66706A]">
        Suggested Actions
      </p>
      <div className="space-y-2">
        {actions.map((a) => (
          <div
            key={a.id}
            className="flex items-center justify-between rounded-lg border border-[#E3E7E3] bg-white p-3"
          >
            <div className="flex items-start gap-2">
              {a.category === "SAFE" ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
              ) : (
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              )}
              <div>
                <p className="text-sm font-medium text-[#17201B]">{a.label}</p>
                <p className="text-xs text-[#66706A]">{a.description}</p>
                <p className="mt-0.5 text-xs text-[#66706A]">Reason: {a.reason}</p>
              </div>
            </div>
            <button className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-[#1B5E3B] px-2.5 py-1.5 text-xs font-medium text-white transition hover:bg-[#164A35]">
              {a.category === "SENSITIVE" ? "Review" : "Execute"}
              <ArrowRight className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
