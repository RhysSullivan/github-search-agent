"use client";

import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ToolUIPart } from "ai";
import type { AppToolUIPart } from "@/types/chat";
import {
  CheckCircleIcon,
  ChevronDownIcon,
  CircleIcon,
  ClockIcon,
  WrenchIcon,
  XCircleIcon,
  ChevronDown,
} from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import {
  isValidElement,
  memo,
  useState,
  useMemo,
  createContext,
  useContext,
} from "react";
import { CodeBlock } from "./code-block";

type ToolContextType = {
  isOpen: boolean;
};

const ToolContext = createContext<ToolContextType>({ isOpen: false });

export type ToolProps = ComponentProps<typeof Collapsible>;

export const Tool = ({
  className,
  onOpenChange,
  open,
  defaultOpen,
  ...props
}: ToolProps) => {
  const [internalOpen, setInternalOpen] = useState(defaultOpen ?? false);
  const isOpen = open ?? internalOpen;

  const handleOpenChange = (newOpen: boolean) => {
    if (open === undefined) {
      setInternalOpen(newOpen);
    }
    onOpenChange?.(newOpen);
  };

  return (
    <ToolContext.Provider value={{ isOpen }}>
      <Collapsible
        className={cn("not-prose mb-4 w-full rounded-md border", className)}
        onOpenChange={handleOpenChange}
        open={isOpen}
        defaultOpen={defaultOpen}
        {...props}
      />
    </ToolContext.Provider>
  );
};

export type ToolHeaderProps = {
  title?: string;
  type: ToolUIPart["type"];
  state:
    | ToolUIPart["state"]
    | "approval-requested"
    | "approval-responded"
    | "output-denied";
  reason?: string;
  className?: string;
};

type ToolState =
  | ToolUIPart["state"]
  | "approval-requested"
  | "approval-responded"
  | "output-denied";

const getStatusBadge = (status: ToolState) => {
  const labels: Record<ToolState, string> = {
    "input-streaming": "Pending",
    "input-available": "Running",
    "approval-requested": "Awaiting Approval",
    "approval-responded": "Responded",
    "output-available": "Completed",
    "output-error": "Error",
    "output-denied": "Denied",
  };

  const icons: Record<ToolState, ReactNode> = {
    "input-streaming": <CircleIcon className="size-4" />,
    "input-available": <ClockIcon className="size-4 animate-pulse" />,
    "approval-requested": <ClockIcon className="size-4 text-yellow-600" />,
    "approval-responded": <CheckCircleIcon className="size-4 text-blue-600" />,
    "output-available": <CheckCircleIcon className="size-4 text-green-600" />,
    "output-error": <XCircleIcon className="size-4 text-red-600" />,
    "output-denied": <XCircleIcon className="size-4 text-orange-600" />,
  };

  return (
    <Badge
      className="gap-1 sm:gap-1.5 rounded-full text-[10px] sm:text-xs"
      variant="secondary"
    >
      {icons[status]}
      <span className="hidden sm:inline">{labels[status]}</span>
    </Badge>
  );
};

export const ToolHeader = ({
  className,
  title,
  type,
  state,
  reason,
  ...props
}: ToolHeaderProps) => {
  const toolName = title ?? type.split("-").slice(1).join("-");

  return (
    <CollapsibleTrigger
      className={cn(
        "sticky top-0 z-10 flex w-full items-center justify-between gap-2 sm:gap-4 rounded-t-md border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80 p-2 sm:p-3 data-[state=closed]:bg-transparent data-[state=closed]:backdrop-blur-none data-[state=closed]:border-b-0",
        className
      )}
      {...props}
    >
      <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
        <WrenchIcon className="size-3.5 sm:size-4 text-muted-foreground shrink-0" />
        {reason ? (
          <div className="rounded-md bg-muted px-1.5 sm:px-2.5 py-0.5 sm:py-1 text-[10px] sm:text-xs text-muted-foreground truncate max-w-[120px] sm:max-w-none">
            {reason}
          </div>
        ) : null}
      </div>
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        {getStatusBadge(state)}
        <span className="font-medium text-xs sm:text-sm truncate max-w-[100px] sm:max-w-none">
          {toolName}
        </span>
        <ChevronDownIcon className="size-3.5 sm:size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180 shrink-0" />
      </div>
    </CollapsibleTrigger>
  );
};

export type ToolContentProps = ComponentProps<typeof CollapsibleContent>;

export const ToolContent = ({ className, ...props }: ToolContentProps) => (
  <CollapsibleContent
    className={cn(
      "data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2 text-popover-foreground outline-none data-[state=closed]:animate-out data-[state=open]:animate-in max-h-[60vh] sm:max-h-[500px] overflow-y-auto",
      className
    )}
    {...props}
  />
);

export type ToolInputProps = ComponentProps<"div"> & {
  input: AppToolUIPart["input"] | ToolUIPart["input"];
};

export const ToolInput = ({ className, input, ...props }: ToolInputProps) => {
  const { isOpen } = useContext(ToolContext);

  // Extract reason if present and remove it from display
  const inputObj =
    typeof input === "object" && input !== null
      ? (input as Record<string, unknown>)
      : {};
  const inputWithoutReason = { ...inputObj };
  if (inputWithoutReason.reason !== undefined) {
    delete inputWithoutReason.reason;
  }

  return (
    <div className={cn("space-y-2 overflow-hidden p-4", className)} {...props}>
      <h4 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
        Parameters
      </h4>
      <div className="rounded-md bg-muted/50">
        <CodeBlock
          code={JSON.stringify(inputWithoutReason, null, 2)}
          language="json"
          lazy={true}
          isVisible={isOpen}
        />
      </div>
    </div>
  );
};

export type ToolOutputProps = ComponentProps<"div"> & {
  output: ToolUIPart["output"];
  errorText: ToolUIPart["errorText"];
  isVisible?: boolean;
};

// Threshold for truncation (characters)
const TRUNCATE_THRESHOLD = 10000;
const INITIAL_DISPLAY_LENGTH = 5000;

export const ToolOutput = memo(
  ({
    className,
    output,
    errorText,
    isVisible: isVisibleProp,
    ...props
  }: ToolOutputProps) => {
    const { isOpen } = useContext(ToolContext);
    const isVisible = isVisibleProp ?? isOpen;
    const [isExpanded, setIsExpanded] = useState(false);

    if (!(output || errorText)) {
      return null;
    }

    // Convert output to string for processing
    const outputString = useMemo(() => {
      if (errorText) {
        return errorText;
      }
      if (typeof output === "string") {
        return output;
      }
      if (typeof output === "object" && !isValidElement(output)) {
        return JSON.stringify(output, null, 2);
      }
      return String(output);
    }, [output, errorText]);

    const isLarge = outputString.length > TRUNCATE_THRESHOLD;
    const shouldTruncate = isLarge && !isExpanded;
    const displayedOutput = shouldTruncate
      ? outputString.slice(0, INITIAL_DISPLAY_LENGTH)
      : outputString;

    let Output: ReactNode;

    if (typeof output === "object" && !isValidElement(output)) {
      Output = (
        <CodeBlock
          code={displayedOutput}
          language="json"
          lazy={true}
          isVisible={isVisible}
        />
      );
    } else if (typeof output === "string") {
      Output = (
        <CodeBlock
          code={displayedOutput}
          language="json"
          lazy={true}
          isVisible={isVisible}
        />
      );
    } else {
      Output = <div>{output as ReactNode}</div>;
    }

    return (
      <div className={cn("space-y-2 p-4", className)} {...props}>
        <div className="flex items-center justify-between">
          <h4 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
            {errorText ? "Error" : "Result"}
          </h4>
          {isLarge && (
            <div className="text-xs text-muted-foreground">
              {outputString.length.toLocaleString()} characters
            </div>
          )}
        </div>
        <div
          className={cn(
            "overflow-x-auto rounded-md text-xs [&_table]:w-full",
            errorText
              ? "bg-destructive/10 text-destructive"
              : "bg-muted/50 text-foreground"
          )}
        >
          {errorText && !isLarge && <div className="p-2">{errorText}</div>}
          {errorText && isLarge && (
            <div className="p-2">
              {shouldTruncate ? displayedOutput : errorText}
            </div>
          )}
          {!errorText && Output}
          {isLarge && (
            <div className="flex items-center justify-center p-2 border-t">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsExpanded(!isExpanded)}
                className="text-xs"
              >
                {isExpanded ? (
                  <>
                    Show Less
                    <ChevronDown className="ml-1 size-3 rotate-180" />
                  </>
                ) : (
                  <>
                    Show More (
                    {(
                      outputString.length - INITIAL_DISPLAY_LENGTH
                    ).toLocaleString()}{" "}
                    more characters)
                    <ChevronDown className="ml-1 size-3" />
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }
);

ToolOutput.displayName = "ToolOutput";
