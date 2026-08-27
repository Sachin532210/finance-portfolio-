import { Bot, MessageSquarePlus, Send, Sparkles, Trash2, User } from "lucide-react";
import * as React from "react";

import { GeneratedByBadge } from "@/components/shared/misc";
import { Disclaimer, ErrorState, InfoNote, PageHeader } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, Skeleton } from "@/components/ui/data";
import { Textarea } from "@/components/ui/form";
import { ConfirmDialog } from "@/components/ui/overlay";
import { useAuth } from "@/context/auth-context";
import { useApiQuery, useMutation } from "@/hooks/use-api";
import { api } from "@/lib/api";
import { formatRelativeDate } from "@/lib/format";
import type { ChatMessage, Conversation } from "@/lib/types";
import { cn } from "@/lib/utils";

type AiStatus = {
  ai_enabled: boolean;
  model: string | null;
  mode: "AI" | "RULE_BASED";
  description: string;
  rate_limit: { per_minute: number; per_day: number };
  disclaimer: string;
};

type ChatResponse = {
  conversation_id: string;
  message: ChatMessage;
  generated_by: string;
  disclaimer: string;
};

export default function CoachPage() {
  const { user } = useAuth();

  const status = useApiQuery<AiStatus>("/ai/status");
  const suggestions = useApiQuery<{ suggestions: string[] }>("/ai/suggestions");
  const conversations = useApiQuery<Conversation[]>("/ai/conversations");

  const [conversationId, setConversationId] = React.useState<string | null>(null);
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [input, setInput] = React.useState("");
  const [deleteId, setDeleteId] = React.useState<string | null>(null);
  const [loadingHistory, setLoadingHistory] = React.useState(false);

  const scrollRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const openConversation = async (id: string) => {
    setConversationId(id);
    setLoadingHistory(true);
    try {
      const history = await api.get<ChatMessage[]>(`/ai/conversations/${id}/messages`);
      setMessages(history);
    } finally {
      setLoadingHistory(false);
    }
  };

  const startNew = () => {
    setConversationId(null);
    setMessages([]);
    inputRef.current?.focus();
  };

  const send = useMutation(
    async (text: string) =>
      api.post<ChatResponse>("/ai/chat", {
        message: text,
        conversation_id: conversationId,
      }),
    {
      onSuccess: (response) => {
        setConversationId(response.conversation_id);
        setMessages((current) => [...current, response.message]);
        conversations.refetch();
      },
      onError: () => {
        // Drop the optimistic user bubble so the transcript stays truthful.
        setMessages((current) => current.filter((m) => !m.id.startsWith("pending-")));
      },
    },
  );

  const submit = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || send.pending) return;

    setMessages((current) => [
      ...current,
      {
        id: `pending-${Date.now()}`,
        role: "user",
        content: trimmed,
        generated_by: "RULE_BASED",
        created_at: new Date().toISOString(),
      },
    ]);
    setInput("");
    void send.mutate(trimmed);
  };

  const removeConversation = useMutation(
    async (id: string) => api.delete(`/ai/conversations/${id}`),
    {
      successMessage: "Conversation deleted.",
      onSuccess: () => {
        conversations.refetch();
        startNew();
      },
    },
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Finance AI Coach"
        description="Ask anything about your money. Every answer is built from your actual data in this app."
        actions={
          <Button variant="outline" size="sm" onClick={startNew}>
            <MessageSquarePlus className="h-4 w-4" />
            New conversation
          </Button>
        }
      />

      {status.data ? (
        <InfoNote variant={status.data.ai_enabled ? "info" : "warning"}>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={status.data.ai_enabled ? "success" : "outline"}>
              {status.data.ai_enabled ? `AI (${status.data.model})` : "Built-in engine"}
            </Badge>
            <span>{status.data.description}</span>
          </div>
        </InfoNote>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-4">
        {/* ---------------- Conversation list ---------------- */}
        <Card className="hidden lg:block">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Conversations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 p-2">
            {conversations.loading && !conversations.data ? (
              <div className="space-y-2 p-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : !conversations.data || conversations.data.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                No conversations yet.
              </p>
            ) : (
              conversations.data.map((conversation) => (
                <div
                  key={conversation.id}
                  className={cn(
                    "group flex items-center gap-1 rounded-md transition-colors",
                    conversationId === conversation.id ? "bg-primary/10" : "hover:bg-accent",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => void openConversation(conversation.id)}
                    className="min-w-0 flex-1 px-2 py-2 text-left"
                  >
                    <p
                      className={cn(
                        "truncate text-sm",
                        conversationId === conversation.id ? "font-medium text-primary" : "",
                      )}
                    >
                      {conversation.title}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {formatRelativeDate(conversation.updated_at)}
                    </p>
                  </button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="mr-1 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                    onClick={() => setDeleteId(conversation.id)}
                    aria-label="Delete conversation"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* ---------------- Chat ---------------- */}
        <Card className="flex h-[calc(100vh-19rem)] min-h-[28rem] flex-col lg:col-span-3">
          <CardContent className="flex min-h-0 flex-1 flex-col p-0">
            <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
              {loadingHistory ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-16 w-3/4" />
                  ))}
                </div>
              ) : messages.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
                  <div className="rounded-full bg-primary/10 p-4">
                    <Bot className="h-7 w-7 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">
                      Hello {user?.name.split(" ")[0]}, what would you like to know?
                    </p>
                    <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                      I can see your income, expenses, budgets, savings, investments, debt and goals.
                      Ask me something specific and I will show the arithmetic.
                    </p>
                  </div>
                  {suggestions.data ? (
                    <div className="flex max-w-2xl flex-wrap justify-center gap-2">
                      {suggestions.data.suggestions.map((question) => (
                        <button
                          key={question}
                          type="button"
                          onClick={() => submit(question)}
                          className="rounded-full border border-border px-3 py-1.5 text-xs transition-colors hover:border-primary hover:text-primary"
                        >
                          {question}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : (
                messages.map((message) => (
                  <div
                    key={message.id}
                    className={cn(
                      "flex gap-3",
                      message.role === "user" ? "flex-row-reverse" : "flex-row",
                    )}
                  >
                    <div
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                        message.role === "user"
                          ? "bg-secondary text-secondary-foreground"
                          : "bg-primary/10 text-primary",
                      )}
                    >
                      {message.role === "user" ? (
                        <User className="h-4 w-4" />
                      ) : (
                        <Bot className="h-4 w-4" />
                      )}
                    </div>
                    <div
                      className={cn(
                        "min-w-0 max-w-[85%] space-y-1",
                        message.role === "user" ? "items-end text-right" : "",
                      )}
                    >
                      <div
                        className={cn(
                          "inline-block rounded-lg px-4 py-3 text-left text-sm leading-relaxed",
                          message.role === "user"
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted",
                        )}
                      >
                        {message.content.split("\n").map((line, index) =>
                          line.trim() === "" ? (
                            <div key={index} className="h-2" />
                          ) : (
                            <p key={index} className={index > 0 ? "mt-1" : ""}>
                              {line}
                            </p>
                          ),
                        )}
                      </div>
                      {message.role === "assistant" ? (
                        <div className="flex items-center gap-2">
                          <GeneratedByBadge by={message.generated_by} />
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))
              )}

              {send.pending ? (
                <div className="flex gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Bot className="h-4 w-4" />
                  </div>
                  <div className="flex items-center gap-1 rounded-lg bg-muted px-4 py-3">
                    {[0, 150, 300].map((delay) => (
                      <span
                        key={delay}
                        className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/60"
                        style={{ animationDelay: `${delay}ms` }}
                      />
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            {/* Suggestions above the input, once a conversation is going */}
            {messages.length > 0 && suggestions.data && !send.pending ? (
              <div className="no-scrollbar flex gap-2 overflow-x-auto border-t border-border px-4 py-2">
                {suggestions.data.suggestions.slice(0, 4).map((question) => (
                  <button
                    key={question}
                    type="button"
                    onClick={() => submit(question)}
                    className="shrink-0 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                  >
                    {question}
                  </button>
                ))}
              </div>
            ) : null}

            <form
              className="flex items-end gap-2 border-t border-border p-3 sm:p-4"
              onSubmit={(e) => {
                e.preventDefault();
                submit(input);
              }}
            >
              <Textarea
                ref={inputRef}
                value={input}
                rows={1}
                placeholder="Ask about your salary, spending, savings or a purchase..."
                className="max-h-32 min-h-[42px] resize-none"
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    submit(input);
                  }
                }}
              />
              <Button
                type="submit"
                size="icon"
                loading={send.pending}
                disabled={!input.trim()}
                aria-label="Send message"
              >
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" />
            How the coach works
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm leading-relaxed text-muted-foreground">
          <p>
            Your figures are assembled on the server and sent with each question - the browser never
            supplies them, so the answer cannot be manipulated from this page.
          </p>
          <p>
            Purchase verdicts always come from the app's own scoring engine. The language model
            explains that verdict; it cannot overrule it.
          </p>
          <p>
            Identifying details stay out of it. Your name, email and record ids are never included in
            what is sent.
          </p>
        </CardContent>
      </Card>

      <Disclaimer />

      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="Delete this conversation?"
        description="The conversation and all its messages are removed permanently."
        confirmLabel="Delete"
        onConfirm={() => {
          if (deleteId) void removeConversation.mutate(deleteId);
          setDeleteId(null);
        }}
      />
    </div>
  );
}
