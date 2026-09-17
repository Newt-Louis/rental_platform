-- A submitter can take a pending Tờ trình back for changes (withdraw).
-- The workflow keeps its decided steps as history; its pending steps are SKIPPED.
ALTER TYPE "WorkflowStatus" ADD VALUE 'WITHDRAWN';
