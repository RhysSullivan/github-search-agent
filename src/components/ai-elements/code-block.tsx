"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Element } from "hast";
import { CheckIcon, CopyIcon } from "lucide-react";
import {
  type ComponentProps,
  createContext,
  type HTMLAttributes,
  useContext,
  useEffect,
  useRef,
  useState,
  memo,
  useMemo,
} from "react";
import { type BundledLanguage, codeToHtml, type ShikiTransformer } from "shiki";

type CodeBlockProps = HTMLAttributes<HTMLDivElement> & {
  code: string;
  language: BundledLanguage;
  showLineNumbers?: boolean;
};

type CodeBlockContextType = {
  code: string;
};

const CodeBlockContext = createContext<CodeBlockContextType>({
  code: "",
});

const lineNumberTransformer: ShikiTransformer = {
  name: "line-numbers",
  line(node: Element, line: number) {
    node.children.unshift({
      type: "element",
      tagName: "span",
      properties: {
        className: [
          "inline-block",
          "min-w-10",
          "mr-4",
          "text-right",
          "select-none",
          "text-muted-foreground",
        ],
      },
      children: [{ type: "text", value: String(line) }],
    });
  },
};

export async function highlightCode(
  code: string,
  language: BundledLanguage,
  showLineNumbers = false
) {
  const transformers: ShikiTransformer[] = showLineNumbers
    ? [lineNumberTransformer]
    : [];

  return await Promise.all([
    codeToHtml(code, {
      lang: language,
      theme: "one-light",
      transformers,
    }),
    codeToHtml(code, {
      lang: language,
      theme: "one-dark-pro",
      transformers,
    }),
  ]);
}

type CodeBlockPropsWithLazy = CodeBlockProps & {
  lazy?: boolean;
  isVisible?: boolean;
};

export const CodeBlock = memo(({
  code,
  language,
  showLineNumbers = false,
  className,
  children,
  lazy = false,
  isVisible = true,
  ...props
}: CodeBlockPropsWithLazy) => {
  const [html, setHtml] = useState<string>("");
  const [darkHtml, setDarkHtml] = useState<string>("");
  const [isHighlighting, setIsHighlighting] = useState(false);
  const mounted = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // For large code blocks, use a simpler fallback
  const isLarge = useMemo(() => code.length > 50000, [code.length]);

  useEffect(() => {
    // If lazy and not visible, don't highlight yet
    if (lazy && !isVisible) {
      return;
    }

    // For very large code blocks, skip highlighting to improve performance
    if (isLarge) {
      setHtml("");
      setDarkHtml("");
      return;
    }

    setIsHighlighting(true);
    let cancelled = false;
    mounted.current = true;

    // Use requestIdleCallback if available for better performance
    const highlight = async () => {
      try {
        const [light, dark] = await highlightCode(code, language, showLineNumbers);
        if (!cancelled && mounted.current) {
          setHtml(light);
          setDarkHtml(dark);
        }
      } catch (error) {
        console.error("Code highlighting error:", error);
      } finally {
        setIsHighlighting(false);
      }
    };

    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      const id = requestIdleCallback(highlight, { timeout: 2000 });
      return () => {
        cancelIdleCallback(id);
        cancelled = true;
        mounted.current = false;
      };
    } else {
      // Fallback for browsers without requestIdleCallback
      const timeoutId = setTimeout(highlight, 0);
      return () => {
        clearTimeout(timeoutId);
        cancelled = true;
        mounted.current = false;
      };
    }
  }, [code, language, showLineNumbers, lazy, isVisible, isLarge]);

  // For large code blocks, render plain text with basic styling
  if (isLarge) {
    return (
      <CodeBlockContext.Provider value={{ code }}>
        <div
          ref={containerRef}
          className={cn(
            "group relative w-full overflow-x-auto overflow-y-auto rounded-md border bg-background text-foreground max-h-[60vh]",
            className
          )}
          {...props}
        >
          <pre className="m-0 bg-background p-4 text-sm overflow-x-auto whitespace-pre font-mono">
            <code>{code}</code>
          </pre>
          {children && (
            <div className="absolute top-2 right-2 flex items-center gap-2">
              {children}
            </div>
          )}
        </div>
      </CodeBlockContext.Provider>
    );
  }

  // Show loading state while highlighting
  const showPlainText = !html && !darkHtml && !isHighlighting;

  return (
    <CodeBlockContext.Provider value={{ code }}>
      <div
        ref={containerRef}
        className={cn(
          "group relative w-full overflow-x-auto overflow-y-hidden rounded-md border bg-background text-foreground",
          className
        )}
        {...props}
      >
        <div className="relative">
          {showPlainText ? (
            <pre className="m-0 bg-background p-4 text-sm overflow-x-auto whitespace-pre font-mono text-foreground">
              <code>{code}</code>
            </pre>
          ) : (
            <>
              <div
                className="overflow-x-auto dark:hidden [&>pre]:m-0 [&>pre]:bg-background! [&>pre]:p-4 [&>pre]:text-foreground! [&>pre]:text-sm [&>pre]:overflow-x-auto [&>pre]:whitespace-pre [&_code]:font-mono [&_code]:text-sm"
                // biome-ignore lint/security/noDangerouslySetInnerHtml: "this is needed."
                dangerouslySetInnerHTML={{ __html: html }}
              />
              <div
                className="hidden overflow-x-auto dark:block [&>pre]:m-0 [&>pre]:bg-background! [&>pre]:p-4 [&>pre]:text-foreground! [&>pre]:text-sm [&>pre]:overflow-x-auto [&>pre]:whitespace-pre [&_code]:font-mono [&_code]:text-sm"
                // biome-ignore lint/security/noDangerouslySetInnerHtml: "this is needed."
                dangerouslySetInnerHTML={{ __html: darkHtml }}
              />
            </>
          )}
          {children && (
            <div className="absolute top-2 right-2 flex items-center gap-2">
              {children}
            </div>
          )}
        </div>
      </div>
    </CodeBlockContext.Provider>
  );
});

CodeBlock.displayName = "CodeBlock";

export type CodeBlockCopyButtonProps = ComponentProps<typeof Button> & {
  onCopy?: () => void;
  onError?: (error: Error) => void;
  timeout?: number;
};

export const CodeBlockCopyButton = ({
  onCopy,
  onError,
  timeout = 2000,
  children,
  className,
  ...props
}: CodeBlockCopyButtonProps) => {
  const [isCopied, setIsCopied] = useState(false);
  const { code } = useContext(CodeBlockContext);

  const copyToClipboard = async () => {
    if (typeof window === "undefined" || !navigator?.clipboard?.writeText) {
      onError?.(new Error("Clipboard API not available"));
      return;
    }

    try {
      await navigator.clipboard.writeText(code);
      setIsCopied(true);
      onCopy?.();
      setTimeout(() => setIsCopied(false), timeout);
    } catch (error) {
      onError?.(error as Error);
    }
  };

  const Icon = isCopied ? CheckIcon : CopyIcon;

  return (
    <Button
      className={cn("shrink-0", className)}
      onClick={copyToClipboard}
      size="icon"
      variant="ghost"
      {...props}
    >
      {children ?? <Icon size={14} />}
    </Button>
  );
};
