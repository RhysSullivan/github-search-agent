# GitHub Search Agent

An AI-powered GitHub search assistant that combines advanced search capabilities with conversational AI to help you find repositories, code, issues, and more across GitHub. Built with Next.js, Bun, and powered by modern AI models.

## Features

- 🔍 **Advanced GitHub Search** - Search repositories, code, issues, PRs, users, commits, topics, and discussions
- 🤖 **AI-Powered Chat Interface** - Natural language queries powered by OpenAI GPT models via AI Gateway
- 🔐 **GitHub Authentication** - Sign in with GitHub for personalized results and higher rate limits
- 🌐 **Web Search Integration** - Authenticated users get access to web search via Exa API
- 📦 **Code Sandboxes** - Download and run code from repositories using Vercel Sandboxes
- ⚡ **Rate Limiting** - Built-in rate limiting (10 requests/hour for guests, 50/hour for authenticated users)
- 🎨 **Modern UI** - Beautiful, responsive interface with dark mode support

## Tech Stack

- **Framework**: [Next.js 16](https://nextjs.org/) with React 19
- **Runtime**: [Bun](https://bun.sh)
- **Backend**: [Convex](https://convex.dev) for serverless backend and database
- **Authentication**: [Better Auth](https://better-auth.com) with GitHub OAuth
- **AI**: [AI SDK](https://sdk.vercel.ai) with Gateway support for OpenAI models
- **Styling**: [Tailwind CSS 4](https://tailwindcss.com)
- **UI Components**: [Radix UI](https://radix-ui.com) + custom components
- **Deployment**: [Vercel](https://vercel.com)

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) (v1.3.0 or later)
- A [Convex](https://convex.dev) account and project
- A [GitHub OAuth App](https://github.com/settings/developers) for authentication
- (Optional) [Exa API](https://exa.ai) key for web search functionality
- (Optional) [OpenCode AI](https://opencode.ai) account for sandbox functionality

### Installation

1. Clone the repository:

```bash
git clone https://github.com/RhysSullivan/github-search-agent.git
cd github-search-agent
```

2. Install dependencies:

```bash
bun install
```

3. Set up environment variables:

Create a `.env.local` file in the root directory with the following variables:

```env
# Convex
NEXT_PUBLIC_CONVEX_URL=https://your-convex-deployment.convex.cloud
CONVEX_SITE_URL=https://your-convex-deployment.convex.site

# Better Auth
BETTER_AUTH_SECRET=your-secret-key-here
SITE_URL=http://localhost:3000

# GitHub OAuth
GITHUB_CLIENT_ID=your-github-oauth-client-id
GITHUB_CLIENT_SECRET=your-github-oauth-client-secret

# Exa API (optional - required for web search)
EXA_API_KEY=your-exa-api-key

# OpenCode AI (optional - required for sandboxes)
# Add OpenCode AI credentials if using sandbox features
```

4. Set up Convex:

```bash
bunx convex dev
```

Follow the prompts to link your Convex project.

5. Configure GitHub OAuth:
   - Go to [GitHub Developer Settings](https://github.com/settings/developers)
   - Create a new OAuth App
   - Set Authorization callback URL to: `http://localhost:3000/api/auth/callback/github` (for local dev)
   - Use the Client ID and Client Secret in your `.env.local`

### Development

Run the development server:

```bash
bun run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Building

Build the application for production:

```bash
bun run build
```

### Type Checking

Run TypeScript type checking:

```bash
bun run typecheck
```

### Linting

Run ESLint:

```bash
bun run lint
```

## Deployment

This project is optimized for deployment on [Vercel](https://vercel.com):

1. Push your code to GitHub
2. Import the project in Vercel
3. Configure environment variables in Vercel project settings
4. Deploy!

### Rate Limiting Setup

For production deployments, you'll need to configure Vercel Firewall rate limiting rules. See [RATE_LIMITING.md](./RATE_LIMITING.md) for detailed setup instructions.

## Project Structure

```
├── src/
│   ├── app/              # Next.js app directory
│   │   ├── api/          # API routes (chat, auth)
│   │   ├── page.tsx      # Main chat interface
│   │   └── layout.tsx    # Root layout
│   ├── components/       # React components
│   │   ├── ai-elements/  # AI-specific UI components
│   │   └── ui/           # Base UI components
│   ├── lib/              # Utility libraries
│   ├── tools/            # AI tool implementations
│   │   ├── search-github.ts    # GitHub search tool
│   │   ├── github-api.ts       # GitHub API proxy
│   │   ├── sandbox.ts          # Sandbox tool
│   │   ├── exa-search.ts       # Web search
│   │   └── exa-fetch.ts        # Page fetching
│   └── types/            # TypeScript type definitions
├── convex/               # Convex backend
│   ├── auth.ts           # Authentication logic
│   ├── schema.ts         # Database schema
│   └── ...               # Other backend functions
└── public/               # Static assets
```

## Features in Detail

### GitHub Search

The application provides comprehensive GitHub search capabilities:

- Search across all public GitHub data
- Advanced filtering by language, stars, date ranges, and more
- Search within specific repositories or organizations
- Code search within file contents
- Issue and PR search with status filters

### Authentication

- Sign in with GitHub OAuth
- Secure token storage in Convex database
- Higher rate limits for authenticated users
- Access to authenticated-only features (web search)

### AI Chat Interface

- Natural language queries
- Multi-turn conversations with context
- Support for multiple OpenAI models (GPT-5 Nano, Mini, and full GPT-5)
- Streaming responses for real-time feedback
- Tool calling for GitHub search and other operations

### Sandboxes

- Download repositories and run code
- Execute commands in isolated environments
- View command outputs and results

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is open source and available under the MIT License.

## Acknowledgments

- Built with [Bun](https://bun.sh) - a fast all-in-one JavaScript runtime
- Powered by [Vercel AI SDK](https://sdk.vercel.ai)
- UI components from [Radix UI](https://radix-ui.com)
- Backend by [Convex](https://convex.dev)
