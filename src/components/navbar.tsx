"use client";

import { authClient } from "@/lib/auth-client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { LogOut, User, Github, MessageSquare, MessageSquarePlus } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { GitHubLoginButton } from "@/components/github-login-button";

export function Navbar() {
  const { data: session, isPending } = authClient.useSession();
  const router = useRouter();

  const handleNewChat = () => {
    window.location.reload();
  };

  if (isPending) {
    return (
      <nav className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex h-14 items-center justify-end px-2 sm:px-4 gap-1 sm:gap-2">
          <Button variant="outline" size="sm" onClick={handleNewChat} className="px-2 sm:px-3">
            <MessageSquarePlus className="h-4 w-4" />
            <span className="hidden sm:inline">New Chat</span>
          </Button>
          <Button variant="outline" size="sm" asChild className="px-2 sm:px-3">
            <Link
              href="https://twitter.com/intent/tweet?screen_name=rhyssullivan&text=@rhyssullivan%20I%20have%20feedback%20about%20betterpilot%20"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2"
            >
              <MessageSquare className="h-4 w-4" />
              <span className="hidden sm:inline">Feedback</span>
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild className="px-2 sm:px-3">
            <Link
              href="https://github.com/RhysSullivan/github-search-agent"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2"
            >
              <Github className="h-4 w-4" />
              <span className="hidden sm:inline">Star on GitHub</span>
            </Link>
          </Button>
          <div className="h-8 w-8 rounded-full bg-muted animate-pulse" />
        </div>
      </nav>
    );
  }

  if (!session) {
    return (
      <nav className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex h-14 items-center justify-end px-2 sm:px-4 gap-1 sm:gap-2">
          <Button variant="outline" size="sm" onClick={handleNewChat} className="px-2 sm:px-3">
            <MessageSquarePlus className="h-4 w-4" />
            <span className="hidden sm:inline">New Chat</span>
          </Button>
          <Button variant="outline" size="sm" asChild className="px-2 sm:px-3">
            <Link
              href="https://twitter.com/intent/tweet?screen_name=rhyssullivan&text=@rhyssullivan%20I%20have%20feedback%20about%20betterpilot%20"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2"
            >
              <MessageSquare className="h-4 w-4" />
              <span className="hidden sm:inline">Feedback</span>
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild className="px-2 sm:px-3">
            <Link
              href="https://github.com/RhysSullivan/github-search-agent"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2"
            >
              <Github className="h-4 w-4" />
              <span className="hidden sm:inline">Star on GitHub</span>
            </Link>
          </Button>
          <GitHubLoginButton />
        </div>
      </nav>
    );
  }

  const handleLogout = async () => {
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          router.push("/");
        },
      },
    });
  };

  const userImage = session.user.image;
  const userEmail = session.user.email;
  const userName = session.user.name || userEmail?.split("@")[0] || "User";

  return (
    <nav className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-14 items-center justify-end px-2 sm:px-4 gap-1 sm:gap-2">
        <Button variant="outline" size="sm" onClick={handleNewChat} className="px-2 sm:px-3">
          <MessageSquarePlus className="h-4 w-4" />
          <span className="hidden sm:inline">New Chat</span>
        </Button>
        <Button variant="outline" size="sm" asChild className="px-2 sm:px-3">
          <Link
            href="https://twitter.com/intent/tweet?text=@rhyssullivan%20I%20have%20feedback%20about%20betterpilot%20"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2"
          >
            <MessageSquare className="h-4 w-4" />
            <span className="hidden sm:inline">Feedback</span>
          </Link>
        </Button>
        <Button variant="outline" size="sm" asChild className="px-2 sm:px-3">
          <Link
            href="https://github.com/RhysSullivan/github-search-agent"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2"
          >
            <Github className="h-4 w-4" />
            <span className="hidden sm:inline">Star on GitHub</span>
          </Link>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 rounded-full focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
              {userImage ? (
                <Image
                  src={userImage}
                  alt={userName}
                  width={32}
                  height={32}
                  className="rounded-full border-2 border-border"
                />
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground border-2 border-border">
                  <User className="h-4 w-4" />
                </div>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">{userName}</p>
                {userEmail && (
                  <p className="text-xs leading-none text-muted-foreground">
                    {userEmail}
                  </p>
                )}
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleLogout}
              variant="destructive"
              className="cursor-pointer"
            >
              <LogOut className="mr-2 h-4 w-4" />
              <span>Sign out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </nav>
  );
}

