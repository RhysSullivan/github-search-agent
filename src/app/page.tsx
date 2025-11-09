"use client";

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputActionAddAttachments,
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuTrigger,
  PromptInputAttachment,
  PromptInputAttachments,
  PromptInputBody,
  PromptInputHeader,
  type PromptInputMessage,
  PromptInputSelect,
  PromptInputSelectContent,
  PromptInputSelectItem,
  PromptInputSelectTrigger,
  PromptInputSelectValue,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import { Suggestions, Suggestion } from "@/components/ai-elements/suggestion";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useRef, useState, useMemo, useCallback, memo } from "react";
import { useChat } from "@ai-sdk/react";
import type { GatewayModelId } from "@ai-sdk/gateway";
import { useStickToBottom } from "use-stick-to-bottom";
import { authClient } from "@/lib/auth-client";
import {
  MessageAction,
  MessageActions,
  MessageResponse,
} from "@/components/ai-elements/message";
import { CopyIcon, RefreshCcwIcon, AlertCircleIcon } from "lucide-react";
import {
  Source,
  Sources,
  SourcesContent,
  SourcesTrigger,
} from "@/components/ai-elements/sources";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";
import type { AppToolUIPart, AppUIMessage } from "@/types/chat";

const models = [
  {
    name: "GPT 5 Mini",
    value: "openai/gpt-5-mini",
  },
];

const features = [
  {
    title: "GitHub Search",
    description: "Search repositories, code, issues & PRs",
  },
  {
    title: "Personalized Responses",
    description: "Sign in with GitHub for your PRs & issues",
  },
  { title: "Sandboxes", description: "Download repos & run code" },
  {
    title: "Public Data Only",
    description: "Only can search public data",
  },
];

const promptSuggestions = [
  "List my open PRs with CI failures",
  "How does dub.co implement OAuth?",
  "Explain how `createOpencodeClient` in OpenCode works to send commands to a remote client",
];

// Memoized message item component to prevent unnecessary re-renders
const MessageItem = memo(
  ({
    message,
    isLastMessage,
    isStreaming,
    onRegenerate,
  }: {
    message: AppUIMessage;
    isLastMessage: boolean;
    isStreaming: boolean;
    onRegenerate: () => void;
  }) => {
    // Pre-compute filtered parts once per message
    const sourceParts = useMemo(
      () => message.parts.filter((part) => part.type === "source-url"),
      [message.parts]
    );

    const handleCopyText = useCallback((text: string) => {
      navigator.clipboard.writeText(text);
    }, []);

    return (
      <div className="[content-visibility:auto]">
        {message.role === "assistant" && sourceParts.length > 0 && (
          <Sources>
            <SourcesTrigger count={sourceParts.length} />
            {sourceParts.map((part, i) => (
              <SourcesContent key={`${message.id}-${i}`}>
                <Source
                  key={`${message.id}-${i}`}
                  href={part.url}
                  title={part.url}
                />
              </SourcesContent>
            ))}
          </Sources>
        )}
        {message.parts.map((part, i) => {
          switch (part.type) {
            case "text":
              return (
                <div
                  key={`${message.id}-${i}`}
                  className="group/message flex w-full flex-col"
                >
                  <Message from={message.role}>
                    <MessageContent>
                      <MessageResponse>{part.text}</MessageResponse>
                    </MessageContent>
                  </Message>
                  {message.role === "assistant" && (
                    <MessageActions className="mt-2 opacity-0 transition-opacity group-hover/message:opacity-100">
                      {isLastMessage && (
                        <MessageAction onClick={onRegenerate} label="Retry">
                          <RefreshCcwIcon className="size-3" />
                        </MessageAction>
                      )}
                      <MessageAction
                        onClick={() => handleCopyText(part.text)}
                        label="Copy"
                      >
                        <CopyIcon className="size-3" />
                      </MessageAction>
                    </MessageActions>
                  )}
                  {message.role === "user" && (
                    <MessageActions className="mt-2 ml-auto justify-end opacity-0 transition-opacity group-hover/message:opacity-100">
                      <MessageAction
                        onClick={() => handleCopyText(part.text)}
                        label="Copy"
                      >
                        <CopyIcon className="size-3" />
                      </MessageAction>
                    </MessageActions>
                  )}
                </div>
              );
            case "reasoning":
              return (
                <Reasoning
                  key={`${message.id}-${i}`}
                  className="w-full"
                  isStreaming={
                    isStreaming &&
                    i === message.parts.length - 1 &&
                    isLastMessage
                  }
                >
                  <ReasoningTrigger />
                  <ReasoningContent>{part.text}</ReasoningContent>
                </Reasoning>
              );
            default:
              // Handle tool parts
              if (part.type.startsWith("tool-")) {
                const toolPart = part as AppToolUIPart;
                // Extract reason from input if present
                const inputObj =
                  typeof toolPart.input === "object" && toolPart.input !== null
                    ? (toolPart.input as Record<string, unknown>)
                    : {};
                const reason =
                  typeof inputObj.reason === "string"
                    ? inputObj.reason
                    : undefined;

                return (
                  <Tool
                    key={`${message.id}-${i}`}
                    defaultOpen={false}
                    className="w-full"
                  >
                    <ToolHeader
                      type={toolPart.type}
                      state={toolPart.state}
                      reason={reason}
                    />
                    <ToolContent>
                      {toolPart.input !== undefined && (
                        <ToolInput input={toolPart.input} />
                      )}
                      {(toolPart.output !== undefined ||
                        toolPart.errorText) && (
                        <ToolOutput
                          output={toolPart.output}
                          errorText={toolPart.errorText}
                        />
                      )}
                    </ToolContent>
                  </Tool>
                );
              }
              return null;
          }
        })}
      </div>
    );
  },
  (prevProps, nextProps) => {
    // Custom comparison function for better memoization
    // Only re-render if message ID changed, parts length changed, or streaming status changed
    if (prevProps.message.id !== nextProps.message.id) return false;
    if (prevProps.message.parts.length !== nextProps.message.parts.length)
      return false;
    if (prevProps.isLastMessage !== nextProps.isLastMessage) return false;
    if (prevProps.isStreaming !== nextProps.isStreaming) return false;

    // For streaming messages, always re-render to show updates
    if (nextProps.isStreaming && nextProps.isLastMessage) return false;

    return true;
  }
);

MessageItem.displayName = "MessageItem";

const ChatBotDemo = () => {
  const [input, setInput] = useState("");
  const [model, setModel] = useState<GatewayModelId>("openai/gpt-5-mini");
  const [webSearch, setWebSearch] = useState(false);
  const [rateLimitError, setRateLimitError] = useState<string | null>(null);
  const [botError, setBotError] = useState<string | null>(null);
  const { data: session } = authClient.useSession();
  const isAuthenticated = !!session;
  const { messages, sendMessage, status, regenerate, stop } = useChat({
    onError: async (error) => {
      const errorMessage = error.message || "";

      // Check if it's a 403 bot detection error
      if (
        errorMessage.includes("403") ||
        errorMessage.toLowerCase().includes("bot")
      ) {
        // Try to extract the error message from the response
        try {
          // The error might have a cause with response data
          if (error.cause && typeof error.cause === "object") {
            // Check if there's a response object
            if ("response" in error.cause) {
              const response = error.cause.response as Response | undefined;
              if (response && response.status === 403) {
                try {
                  const data = await response.json();
                  if (data.message) {
                    setBotError(data.message);
                    return;
                  }
                } catch {
                  // Response might not be JSON, fall through
                }
              }
            }
            // Check if message is directly in cause
            if (
              "message" in error.cause &&
              typeof error.cause.message === "string"
            ) {
              if (error.cause.message.toLowerCase().includes("bot")) {
                setBotError(error.cause.message);
                return;
              }
            }
          }
        } catch {
          // Fall through to default message
        }
        setBotError(
          "Your request was blocked because it appears to be from a bot. If you believe this is an error, please contact support."
        );
        return;
      }

      // Check if it's a 429 rate limit error
      if (
        errorMessage.includes("429") ||
        errorMessage.toLowerCase().includes("rate limit")
      ) {
        // Try to extract the error message from the response
        try {
          // The error might have a cause with response data
          if (error.cause && typeof error.cause === "object") {
            // Check if there's a response object
            if ("response" in error.cause) {
              const response = error.cause.response as Response | undefined;
              if (response && response.status === 429) {
                try {
                  const data = await response.json();
                  if (data.message === "You have been rate limited") {
                    // Format the error message on the client
                    const limitText = isAuthenticated
                      ? "20 messages per hour for signed in users"
                      : "10 messages per hour for signed out users, 20 for signed in";
                    setRateLimitError(
                      `You have been rate limited. The limit is ${limitText}. Tweet at rhys if you have a legitimate use case and need higher limits.`
                    );
                    return;
                  }
                } catch {
                  // Response might not be JSON, fall through
                }
              }
            }
            // Check if message is directly in cause
            if (
              "message" in error.cause &&
              typeof error.cause.message === "string"
            ) {
              if (error.cause.message === "You have been rate limited") {
                const limitText = isAuthenticated
                  ? "20 messages per hour for signed in users"
                  : "10 messages per hour for signed out users, 20 for signed in";
                setRateLimitError(
                  `You have been rate limited. The limit is ${limitText}. Tweet at rhys if you have a legitimate use case and need higher limits.`
                );
                return;
              }
            }
          }
        } catch {
          // Fall through to default message
        }
        const limitText = isAuthenticated
          ? "20 messages per hour for signed in users"
          : "10 messages per hour for signed out users, 20 for signed in";
        setRateLimitError(
          `You have been rate limited. The limit is ${limitText}. Tweet at rhys if you have a legitimate use case and need higher limits.`
        );
      }
    },
  });
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const stickToBottomInstance = useStickToBottom({
    initial: "instant",
    resize: "instant",
  });

  // Attach the scrollRef to our scroll container using ref callback
  const setScrollRef = (element: HTMLDivElement | null) => {
    scrollContainerRef.current = element;
    if (element && stickToBottomInstance.scrollRef) {
      stickToBottomInstance.scrollRef(element);
    }
  };

  const handleSubmit = async (message: PromptInputMessage) => {
    const hasText = Boolean(message.text);
    const hasAttachments = Boolean(message.files?.length);

    if (!(hasText || hasAttachments)) {
      return;
    }

    // Clear any previous rate limit errors
    setRateLimitError(null);
    // Clear any previous bot errors
    setBotError(null);

    // Wrap sendMessage to catch 429 errors
    try {
      await sendMessage(
        {
          text: message.text || "Sent with attachments",
          files: message.files,
        },
        {
          body: {
            model: model,
            webSearch: webSearch,
          },
        }
      );
      setInput("");
    } catch (error) {
      // Fallback error handling - onError should handle it, but this is a safety net
      if (error instanceof Error) {
        if (error.message.includes("429")) {
          // Error already handled by onError, but ensure we have a message
          if (!rateLimitError) {
            const limitText = isAuthenticated
              ? "20 messages per hour for signed in users"
              : "10 messages per hour for signed out users, 20 for signed in";
            setRateLimitError(
              `You have been rate limited. The limit is ${limitText}. Tweet at rhys if you have a legitimate use case and need higher limits.`
            );
          }
        } else if (
          error.message.includes("403") ||
          error.message.toLowerCase().includes("bot")
        ) {
          // Error already handled by onError, but ensure we have a message
          if (!botError) {
            setBotError(
              "Your request was blocked because it appears to be from a bot. If you believe this is an error, please contact support."
            );
          }
        }
      }
    }
  };

  const handleSuggestionClick = useCallback(
    (suggestion: string) => {
      handleSubmit({ text: suggestion });
    },
    [handleSubmit]
  );

  const handleRegenerate = useCallback(() => {
    regenerate();
  }, [regenerate]);

  // Memoize the last message ID to avoid recalculating
  const lastMessageId = useMemo(() => messages.at(-1)?.id, [messages]);

  // Helper function to render error message with Twitter link
  const renderRateLimitError = (error: string) => {
    const parts = error.split("rhys");
    if (parts.length === 2) {
      return (
        <>
          {parts[0]}
          <a
            href="https://twitter.com/rhyssullivan"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:text-blue-800 underline"
          >
            rhys
          </a>
          {parts[1]}
        </>
      );
    }
    return error;
  };

  return (
    <div className="relative flex h-[calc(100vh-3.5rem)] w-full flex-col overflow-hidden">
      <div
        ref={setScrollRef}
        className="relative flex flex-1 w-full flex-col overflow-y-auto overflow-x-hidden"
      >
        {messages.length === 0 ? (
          <>
            <div className="max-w-4xl mx-auto w-full flex flex-col flex-1 px-4 sm:px-6 pt-12 pb-4">
              <div className="text-center mb-12">
                <h1 className="text-2xl sm:text-4xl font-semibold mb-2">
                  Welcome to Better Pilot
                </h1>
                <p className="text-sm sm:text-base text-muted-foreground">
                  Your AI-powered GitHub search assistant
                </p>
              </div>

              <div className="hidden sm:grid grid-cols-2 gap-2 sm:gap-3 mb-8 sm:mb-12 max-w-md mx-auto">
                {features.map((feature, index) => (
                  <Card
                    key={index}
                    className="flex flex-col gap-0 py-2 px-3 sm:py-3 sm:px-4 border-border/50"
                  >
                    <CardHeader className="p-0 pb-1 sm:pb-1.5">
                      <CardTitle className="text-xs sm:text-sm font-medium leading-tight">
                        {feature.title}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0 flex items-start">
                      <CardDescription className="text-[10px] sm:text-xs leading-relaxed">
                        {feature.description}
                      </CardDescription>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="max-w-4xl mx-auto w-full flex flex-col flex-1 px-4 sm:px-6 pt-6 pb-4">
              <Conversation instance={stickToBottomInstance}>
                <ConversationContent>
                  {messages.map((message) => (
                    <MessageItem
                      key={message.id}
                      message={message as AppUIMessage}
                      isLastMessage={message.id === lastMessageId}
                      isStreaming={status === "streaming"}
                      onRegenerate={handleRegenerate}
                    />
                  ))}
                </ConversationContent>
                <ConversationScrollButton />
              </Conversation>
            </div>
          </>
        )}
      </div>

      <div className="sticky bottom-0 z-10">
        <div className="grid shrink-0 gap-4 pt-4 pb-2">
          <div className="w-full px-2 sm:px-4 pb-4 max-w-4xl mx-auto">
            {rateLimitError && (
              <Alert variant="destructive" className="mb-4">
                <AlertCircleIcon />
                <AlertTitle>Rate Limited</AlertTitle>
                <AlertDescription className="inline-block!">
                  {renderRateLimitError(rateLimitError)}
                </AlertDescription>
              </Alert>
            )}
            {botError && (
              <Alert variant="destructive" className="mb-4">
                <AlertCircleIcon />
                <AlertTitle>Bot Detected</AlertTitle>
                <AlertDescription>{botError}</AlertDescription>
              </Alert>
            )}
            {messages.length === 0 && (
              <div className="mb-4 min-w-0">
                <Suggestions>
                  {promptSuggestions.map((suggestion, index) => (
                    <Suggestion
                      key={index}
                      suggestion={suggestion}
                      onClick={handleSuggestionClick}
                    />
                  ))}
                </Suggestions>
              </div>
            )}
            <PromptInput onSubmit={handleSubmit} globalDrop multiple>
              <PromptInputHeader>
                <PromptInputAttachments>
                  {(attachment) => <PromptInputAttachment data={attachment} />}
                </PromptInputAttachments>
              </PromptInputHeader>
              <PromptInputBody>
                <PromptInputTextarea
                  onChange={(e) => setInput(e.target.value)}
                  value={input}
                />
              </PromptInputBody>
              <PromptInputFooter>
                <PromptInputTools>
                  <PromptInputActionMenu>
                    <PromptInputActionMenuTrigger />
                    <PromptInputActionMenuContent>
                      <PromptInputActionAddAttachments />
                    </PromptInputActionMenuContent>
                  </PromptInputActionMenu>

                  <PromptInputSelect
                    onValueChange={(value) => {
                      setModel(value);
                    }}
                    value={model}
                  >
                    <PromptInputSelectTrigger>
                      <PromptInputSelectValue />
                    </PromptInputSelectTrigger>
                    <PromptInputSelectContent>
                      {models.map((model) => (
                        <PromptInputSelectItem
                          key={model.value}
                          value={model.value}
                        >
                          {model.name}
                        </PromptInputSelectItem>
                      ))}
                    </PromptInputSelectContent>
                  </PromptInputSelect>
                </PromptInputTools>
                <PromptInputSubmit
                  disabled={!input && !status}
                  status={status}
                  onStop={stop}
                />
              </PromptInputFooter>
            </PromptInput>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatBotDemo;
