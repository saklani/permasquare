// Simplified universal progress interface
export interface Progress {
  step: string;
  percent: number; // 0-100
  message?: string;
}

// Simple progress callback type
export type ProgressCallback = (progress: Progress) => void;

// Progress helper function
export function createProgress(step: string, percent: number, message?: string): Progress {
  return { step, percent, message };
}

// Progress steps for different operations
export const EXTRACTION_STEPS = {
  ANALYZING: 'analyzing',
  CRAWLING: 'crawling', 
  DOWNLOADING: 'downloading',
  COMPLETE: 'complete'
} as const;

export const DEPLOYMENT_STEPS = {
  PREPARING: 'preparing',
  UPLOADING: 'uploading',
  COMPLETING: 'completing',
  COMPLETE: 'complete'
} as const; 