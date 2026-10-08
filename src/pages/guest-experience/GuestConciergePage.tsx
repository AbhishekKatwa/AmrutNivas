import { useEffect, useState } from "react";
import { ConciergeBell, Send } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingBlock } from "@/components/ui/Spinner";
import type { EntityId } from "@/domain/identity/types";
import { can, type ActiveContext } from "@/domain/identity/types";
import type { GuestConversation } from "@/domain/guest-experience/types";
import { listConversations, createConversation, sendMessage } from "@/domain/guest-experience/guest-experience-service";
import { toPublicError } from "@/lib/errors";
import { useContextStore, type ContextStatus } from "@/state/context-store";

const DEMO_CUSTOMER_ID = "cust_demo_1";

type PageView = "bootstrapping" | "unconfigured" | "unauthenticated" | "no_organization" | "scoped";

function pageStatusFor(status: ContextStatus, context: ActiveContext): PageView {
  if (status === "unconfigured") return "unconfigured";
  if (status === "unauthenticated") return "unauthenticated";
  if (status === "ready") return context.organizationId !== null ? "scoped" : "no_organization";
  return "bootstrapping";
}

export default function GuestConciergePage() {
  const status = useContextStore((s) => s.status);
  const context = useContextStore((s) => s.context);
  const permissions = useContextStore((s) => s.permissions);
  const bootstrap = useContextStore((s) => s.bootstrap);

  const view = pageStatusFor(status, context);
  const orgId = context.organizationId as EntityId | null;
  const customerId = DEMO_CUSTOMER_ID;

  const canView = can("guest_experience.conversation.view", permissions);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [conversations, setConversations] = useState<GuestConversation[]>([]);
  const [activeConv, setActiveConv] = useState<GuestConversation | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (status === "idle") void bootstrap();
  }, [status, bootstrap]);

  useEffect(() => {
    if (view !== "scoped" || !orgId || !canView || !customerId) return;
    setLoading(true);
    setError(null);
    try {
      const convs = [...listConversations(orgId, { customerId })];
      setConversations(convs);
      if (convs.length > 0 && !activeConv) {
        setActiveConv(convs[0]);
      }
    } catch (err) {
      setError(toPublicError(err).message);
    } finally {
      setLoading(false);
    }
  }, [view, orgId, customerId, canView]);

  function handleNewConversation() {
    if (!orgId || !customerId) return;
    try {
      const conv = createConversation({
        organizationId: orgId,
        propertyId: "prop_demo_1",
        customerId,
        type: "GENERAL",
        subject: "New conversation",
        status: "OPEN",
        handoffDepartment: null,
      });
      setConversations([...listConversations(orgId, { customerId })]);
      setActiveConv(conv);
    } catch (err) {
      setError(toPublicError(err).message);
    }
  }

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!activeConv || !message.trim()) return;
    try {
      sendMessage(activeConv.id, "GUEST", message, customerId);
      const convs = [...listConversations(orgId!, { customerId })];
      setConversations(convs);
      const updated = convs.find((c) => c.id === activeConv.id);
      if (updated) setActiveConv(updated);
      setMessage("");

      setTimeout(() => {
        if (!orgId) return;
        sendMessage(activeConv.id, "AI", "Thank you for your message. How can I assist you today?", null);
        const refreshed = [...listConversations(orgId, { customerId })];
        setConversations(refreshed);
        const latest = refreshed.find((c) => c.id === activeConv.id);
        if (latest) setActiveConv(latest);
      }, 1000);
    } catch (err) {
      setError(toPublicError(err).message);
    }
  }

  if (view === "bootstrapping" || loading) {
    return <LoadingBlock label="Loading concierge…" />;
  }

  if (!canView) {
    return (
      <EmptyState
        icon={<ConciergeBell />}
        title="AI Concierge"
        description="You don't have permission to view the concierge."
      />
    );
  }

  if (error) {
    return (
      <EmptyState
        icon={<ConciergeBell />}
        title="Something went wrong"
        description={error}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#17201B]">AI Concierge</h1>
          <p className="text-sm text-[#66706A] mt-1">
            Ask questions and get instant assistance
          </p>
        </div>
        <Button variant="primary" onClick={handleNewConversation}>
          New Conversation
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <Card>
            <div className="p-4">
              <h3 className="text-sm font-semibold text-[#17201B] mb-3">Conversations</h3>
              {conversations.length === 0 ? (
                <p className="text-sm text-[#66706A]">No conversations yet</p>
              ) : (
                <div className="space-y-2">
                  {conversations.map((conv) => (
                    <button
                      key={conv.id}
                      onClick={() => setActiveConv(conv)}
                      className={`w-full text-left p-3 rounded-lg transition-colors ${
                        activeConv?.id === conv.id ? "bg-[#F5F6F2]" : "hover:bg-[#FAFAF8]"
                      }`}
                    >
                      <p className="text-sm font-medium text-[#17201B]">{conv.subject}</p>
                      <p className="text-xs text-[#66706A] mt-1">
                        {new Date(conv.lastMessageAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Card>
            <div className="flex flex-col h-[600px]">
              <div className="p-4 border-b border-[#E3E7E3]">
                <h3 className="text-base font-semibold text-[#17201B]">
                  {activeConv ? activeConv.subject : "Select a conversation"}
                </h3>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {!activeConv ? (
                  <div className="flex items-center justify-center h-full">
                    <p className="text-sm text-[#66706A]">Start a new conversation or select an existing one</p>
                  </div>
                ) : activeConv.messages.length === 0 ? (
                  <div className="flex items-center justify-center h-full">
                    <p className="text-sm text-[#66706A]">Send a message to begin</p>
                  </div>
                ) : (
                  activeConv.messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex ${msg.sender === "GUEST" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[70%] rounded-lg p-3 ${
                          msg.sender === "GUEST"
                            ? "bg-[#1B5E3B] text-white"
                            : "bg-[#F5F6F2] text-[#17201B]"
                        }`}
                      >
                        <p className="text-sm">{msg.content}</p>
                        <p className={`text-xs mt-1 ${msg.sender === "GUEST" ? "text-white/70" : "text-[#66706A]"}`}>
                          {new Date(msg.createdAt).toLocaleTimeString("en-US", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {activeConv && (
                <form onSubmit={handleSend} className="p-4 border-t border-[#E3E7E3]">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Type your message..."
                      className="flex-1 px-3 py-2 border border-[#E3E7E3] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1B5E3B]"
                    />
                    <Button type="submit" variant="primary">
                      <Send className="w-4 h-4" />
                    </Button>
                  </div>
                </form>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
