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
import { Fragment, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import type { GatewayModelId } from "@ai-sdk/gateway";
import { useStickToBottom } from "use-stick-to-bottom";
import {
  MessageAction,
  MessageActions,
  MessageResponse,
} from "@/components/ai-elements/message";
import { CopyIcon, RefreshCcwIcon } from "lucide-react";
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
import type { ToolUIPart } from "ai";

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
  { title: "Code Exploration", description: "Navigate & understand codebases" },
];

const promptSuggestions = [
  "Explain how remote connections in OpenCode are implemented",
  "List my open PRs with CI failures",
  "Show me TypeScript best practices",
  "Analyze this repository structure",
];

const ChatBotDemo = () => {
  const [input, setInput] = useState("");
  const [model, setModel] = useState<GatewayModelId>("openai/gpt-5-mini");
  const [webSearch, setWebSearch] = useState(false);
  const { messages, sendMessage, status, regenerate } = useChat();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const stickToBottomInstance = useStickToBottom({
    initial: "smooth",
    resize: "smooth",
  });

  // Attach the scrollRef to our scroll container using ref callback
  const setScrollRef = (element: HTMLDivElement | null) => {
    scrollContainerRef.current = element;
    if (element && stickToBottomInstance.scrollRef) {
      stickToBottomInstance.scrollRef(element);
    }
  };

  const handleSubmit = (message: PromptInputMessage) => {
    const hasText = Boolean(message.text);
    const hasAttachments = Boolean(message.files?.length);

    if (!(hasText || hasAttachments)) {
      return;
    }

    sendMessage(
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
  };

  const handleSuggestionClick = (suggestion: string) => {
    setInput(suggestion);
  };

  return (
    <div
      ref={setScrollRef}
      className="relative flex h-[calc(100vh-3.5rem)] w-full flex-col overflow-y-auto overflow-x-hidden"
    >
      {messages.length === 0 ? (
        <>
          <div className="max-w-4xl mx-auto w-full flex flex-col flex-1 px-6 pt-12">
            <div className="text-center mb-12">
              <h1 className="text-4xl font-semibold mb-2">
                Welcome to Better Pilot
              </h1>
              <p className="text-muted-foreground">
                Your AI-powered GitHub search assistant
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-12 max-w-md mx-auto">
              {features.map((feature, index) => (
                <Card
                  key={index}
                  className="flex flex-col gap-0 py-3 px-4 border-border/50"
                >
                  <CardHeader className="p-0 pb-1.5">
                    <CardTitle className="text-sm font-medium leading-tight">
                      {feature.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0 flex items-start">
                    <CardDescription className="text-xs leading-relaxed">
                      {feature.description}
                    </CardDescription>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          <div className="grid shrink-0 gap-4 pt-4 pb-2">
            <div className="w-full px-4 pb-4 max-w-4xl mx-auto">
              <div className="mb-4">
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
              <PromptInput onSubmit={handleSubmit} globalDrop multiple>
                <PromptInputHeader>
                  <PromptInputAttachments>
                    {(attachment) => (
                      <PromptInputAttachment data={attachment} />
                    )}
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
                  />
                </PromptInputFooter>
              </PromptInput>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="max-w-4xl mx-auto w-full flex flex-col flex-1 px-6 pt-6">
            <Conversation instance={stickToBottomInstance}>
              <ConversationContent>
                {messages.map((message) => (
                  <div key={message.id} className="[content-visibility:auto]">
                    {message.role === "assistant" &&
                      message.parts.filter((part) => part.type === "source-url")
                        .length > 0 && (
                        <Sources>
                          <SourcesTrigger
                            count={
                              message.parts.filter(
                                (part) => part.type === "source-url"
                              ).length
                            }
                          />
                          {message.parts
                            .filter((part) => part.type === "source-url")
                            .map((part, i) => (
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
                          const isLastMessage =
                            message.id === messages.at(-1)?.id;
                          return (
                            <Fragment key={`${message.id}-${i}`}>
                              <Message from={message.role}>
                                <MessageContent>
                                  <MessageResponse>{part.text}</MessageResponse>
                                </MessageContent>
                              </Message>
                              {message.role === "assistant" && (
                                <MessageActions className="mt-2">
                                  {isLastMessage && (
                                    <MessageAction
                                      onClick={() => regenerate()}
                                      label="Retry"
                                    >
                                      <RefreshCcwIcon className="size-3" />
                                    </MessageAction>
                                  )}
                                  <MessageAction
                                    onClick={() =>
                                      navigator.clipboard.writeText(part.text)
                                    }
                                    label="Copy"
                                  >
                                    <CopyIcon className="size-3" />
                                  </MessageAction>
                                </MessageActions>
                              )}
                            </Fragment>
                          );
                        case "reasoning":
                          return (
                            <Reasoning
                              key={`${message.id}-${i}`}
                              className="w-full"
                              isStreaming={
                                status === "streaming" &&
                                i === message.parts.length - 1 &&
                                message.id === messages.at(-1)?.id
                              }
                            >
                              <ReasoningTrigger />
                              <ReasoningContent>{part.text}</ReasoningContent>
                            </Reasoning>
                          );
                        default:
                          // Handle tool parts
                          if (part.type.startsWith("tool-")) {
                            const toolPart = part as ToolUIPart;
                            return (
                              <Tool
                                key={`${message.id}-${i}`}
                                defaultOpen={false}
                                className="w-full"
                              >
                                <ToolHeader
                                  type={toolPart.type}
                                  state={toolPart.state}
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
                ))}
              </ConversationContent>
              <ConversationScrollButton />
            </Conversation>
          </div>

          <div className="grid shrink-0 gap-4 pt-4 pb-2">
            <div className="w-full px-4 pb-4 max-w-4xl mx-auto">
              <PromptInput onSubmit={handleSubmit} globalDrop multiple>
                <PromptInputHeader>
                  <PromptInputAttachments>
                    {(attachment) => (
                      <PromptInputAttachment data={attachment} />
                    )}
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
                  />
                </PromptInputFooter>
              </PromptInput>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default ChatBotDemo;
