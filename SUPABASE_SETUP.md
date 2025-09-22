# Supabase Setup Guide for Zodiac

This guide will walk you through setting up your own Supabase backend for Zodiac instead of using the default instance.

## Prerequisites

- Node.js and npm installed
- A [Supabase](https://supabase.com) account (free tier works)
- A Google AI API key from [Google AI Studio](https://makersuite.google.com/app/apikey)

## Quick Start

### 1. Clone and Install

```bash
git clone https://github.com/faetalize/zodiac.git
cd zodiac
npm install
```

### 2. Supabase Setup

#### Create a New Project

1. Go to [app.supabase.com](https://app.supabase.com)
2. Click "New project"
3. Choose your organization
4. Set a project name and database password
5. Select a region close to you
6. Click "Create new project"

#### Get Your Project Credentials

1. In your project dashboard, click **Settings** (gear icon) → **API**
2. Copy these values:
   - **Project URL**: `https://xxxxxxxxxxxxx.supabase.co`
   - **anon/public key**: `eyJ...` (long JWT token)

#### Set Up Database Tables

1. Go to **SQL Editor** in the left sidebar
2. Click "New query"
3. Run this SQL to create the profiles table:

```sql
-- Create profiles table
CREATE TABLE profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  avatar TEXT,
  preferredName TEXT,
  systemPromptAddition TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Create RLS Policies
CREATE POLICY "Users can view their own profile" 
  ON profiles FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile" 
  ON profiles FOR UPDATE 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own profile" 
  ON profiles FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

-- Optional: Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, preferredName)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

#### Set Up Storage Bucket

1. Go to **Storage** in the left sidebar
2. Click **New bucket**
3. Configure:
   - Name: `profile_pictures`
   - Public bucket: **ON** (toggle enabled)
   - File size limit: `5` (MB)
   - Allowed MIME types: `image/jpeg, image/png, image/gif, image/webp`
4. Click **Create bucket**

5. Set up storage policies - go to **SQL Editor** and run:

```sql
-- Allow users to upload their own profile pictures
CREATE POLICY "Users can upload their own profile picture"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'profile_pictures' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow users to update their own profile pictures
CREATE POLICY "Users can update their own profile picture"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'profile_pictures' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow users to delete their own profile pictures
CREATE POLICY "Users can delete their own profile picture"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'profile_pictures' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow public to view all profile pictures
CREATE POLICY "Anyone can view profile pictures"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'profile_pictures');
```

#### Enable Authentication

1. Go to **Authentication** → **Providers**
2. Ensure **Email** is enabled (should be by default)
3. Configure email settings as needed

### 3. Configure Environment Variables

Create a `.env` file in the project root:

```bash
cp .env.example .env
```

Edit the `.env` file and add your Supabase credentials:

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key-here
```

The application will automatically use these environment variables. If not provided, it will fall back to the default Supabase instance.

### 4. Run the Application

```bash
# Development mode
npm run dev

# Or with Docker
npm run docker:dev
```

Visit `http://localhost:5173` and you're ready to go!

## Using the Application

### First Time Setup

1. **Create an Account**: Click "Login" → "Sign Up" to create your account
2. **Add Your API Key**: 
   - Get your Google AI API key from [Google AI Studio](https://makersuite.google.com/app/apikey)
   - Go to Settings and paste your API key
   - Click "Save API Key"
3. **Start Chatting**: You can now start conversations with Gemini!

## Docker Deployment

### Development with Docker

```bash
# Start development container
npm run docker:dev

# View logs
npm run docker:dev:logs

# Stop container
npm run docker:dev:stop
```

### Production Deployment

```bash
# Build production image
npm run docker:build

# Run production container
npm run docker:prod

# Stop production container
npm run docker:prod:stop
```

## Optional: Using Subscription Features

The app includes subscription features for Pro/Max tiers. These require Stripe integration and are optional. Without setup:
- The app works normally with user-provided API keys
- Subscription UI shows "Free" tier
- All core features remain available

To enable subscriptions, you'll need to:
1. Set up Stripe account
2. Create Supabase Edge Functions
3. Configure webhooks
4. Add the `user_subscriptions` table

Most users can skip this and use the app with their own API keys.
