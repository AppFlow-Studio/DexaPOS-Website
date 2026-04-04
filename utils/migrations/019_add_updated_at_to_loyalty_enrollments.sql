-- Add updated_at column to loyalty_enrollments table
ALTER TABLE loyalty_enrollments
ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT now();
