# Rate Limiting Setup Guide

This project uses Vercel Firewall to rate limit chat requests:

- **10 requests/hour** for signed-out users
- **50 requests/hour** for signed-in users

## Setting Up Vercel Firewall Rules

You need to create two custom firewall rules in your Vercel dashboard:

### Rule 1: Authenticated Users (50 requests/hour)

1. Navigate to your project in the [Vercel Dashboard](https://vercel.com/dashboard/)
2. Select the **Firewall** tab
3. Click **Configure** in the top right corner
4. Select **+ New Rule**
5. Configure the rule:
   - **Name**: `Chat Rate Limit - Authenticated`
   - **Description**: `Rate limit chat requests for authenticated users (50/hour)`
   - **If conditions**:
     - First condition: `Request Path` equals `/api/chat`
     - Second condition: `@vercel/firewall` equals `chat-rate-limit-authenticated`
   - **Then**: `Rate Limit`
     - **Rate Limit ID**: `chat-rate-limit-authenticated`
     - **Time Window**: `1h` (1 hour)
     - **Request Limit**: `50`
     - **Key**: Leave default (will use `rateLimitKey` from code)
6. Click **Save Rule**

### Rule 2: Unauthenticated Users (10 requests/hour)

1. In the same Firewall configuration, click **+ New Rule** again
2. Configure the rule:
   - **Name**: `Chat Rate Limit - Unauthenticated`
   - **Description**: `Rate limit chat requests for unauthenticated users (10/hour)`
   - **If conditions**:
     - First condition: `Request Path` equals `/api/chat`
     - Second condition: `@vercel/firewall` equals `chat-rate-limit-unauthenticated`
   - **Then**: `Rate Limit`
     - **Rate Limit ID**: `chat-rate-limit-unauthenticated`
     - **Time Window**: `1h` (1 hour)
     - **Request Limit**: `10`
     - **Key**: `IP Address` (for unauthenticated users)
3. Click **Save Rule**

### Publishing Changes

1. Click **Review Changes** in the top right corner
2. Review the changes to be applied
3. Click **Publish** to apply the changes to your production deployment

## Testing in Preview Deployments

For your code to run when deployed in a preview deployment, you need to:

1. **Enable Protection Bypass for Automation**:
   - Go to your project settings
   - Navigate to **Deployment Protection**
   - Enable **Protection Bypass for Automation**

2. **Ensure System Environment Variables are automatically exposed**:
   - Go to your project settings
   - Navigate to **Environment Variables**
   - Ensure system environment variables are configured to be exposed in preview deployments

## How It Works

The rate limiting is implemented in `src/app/api/chat/route.ts`:

- For **authenticated users**: Uses the user ID as the rate limit key (from `getUserId()`)
- For **unauthenticated users**: Uses the IP address automatically (handled by Vercel)

The code checks the rate limit before processing any chat request and returns a `429 Too Many Requests` response if the limit is exceeded.

## Rate Limit IDs

The code uses these rate limit IDs that must match your Vercel Firewall rules:

- `chat-rate-limit-authenticated` - For signed-in users (50/hour)
- `chat-rate-limit-unauthenticated` - For signed-out users (10/hour)

Make sure these IDs match exactly in both your Vercel Firewall rules and the code.
