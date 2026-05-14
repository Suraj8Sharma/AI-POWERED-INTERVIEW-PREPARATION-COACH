-- Supabase migration for interview reports storage
-- Run this in your Supabase SQL Editor

-- Create interview_reports table
CREATE TABLE IF NOT EXISTS interview_reports (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    session_id TEXT NOT NULL,
    candidate_name TEXT,
    role TEXT NOT NULL,
    total_questions INTEGER NOT NULL,
    overall_score INTEGER NOT NULL,
    avg_technical INTEGER NOT NULL,
    avg_communication INTEGER NOT NULL,
    avg_confidence INTEGER,
    evaluations JSONB NOT NULL,
    tips TEXT[],
    pdf_path TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on user_id for faster queries
CREATE INDEX IF NOT EXISTS idx_interview_reports_user_id ON interview_reports(user_id);

-- Create index on created_at for sorting
CREATE INDEX IF NOT EXISTS idx_interview_reports_created_at ON interview_reports(created_at DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE interview_reports ENABLE ROW LEVEL SECURITY;

-- Create policy to allow users to see only their own reports
CREATE POLICY "Users can view their own reports" ON interview_reports
    FOR SELECT USING (auth.uid() = user_id);

-- Create policy to allow users to insert their own reports
CREATE POLICY "Users can insert their own reports" ON interview_reports
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Create policy to allow users to update their own reports
CREATE POLICY "Users can update their own reports" ON interview_reports
    FOR UPDATE USING (auth.uid() = user_id);

-- Create storage bucket for PDF reports
INSERT INTO storage.buckets (id, name, public)
VALUES ('interview-reports', 'interview-reports', false)
ON CONFLICT (id) DO NOTHING;

-- Create policy for storage bucket to allow users to upload their own PDFs
CREATE POLICY "Users can upload their own report PDFs" ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'interview-reports'
        AND auth.uid()::text = (storage.foldername(name))[1]
    );

-- Create policy for storage bucket to allow users to view their own PDFs
CREATE POLICY "Users can view their own report PDFs" ON storage.objects
    FOR SELECT USING (
        bucket_id = 'interview-reports'
        AND auth.uid()::text = (storage.foldername(name))[1]
    );