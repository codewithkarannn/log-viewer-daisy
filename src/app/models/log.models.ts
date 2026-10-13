export interface ApiResponse<T> {
  isSuccess: boolean;
  data: T | null;
  message?: string;
  errors?: string[];
}

export interface LogFileInfo {
  name: string;
  fullPath: string;
  size: number;
  lastModified: string | Date;
}
export interface LogEntrySummary {
  filePath  :  string;
  errorCount : number ;
  infoCount :number;
  warningCount :number;
  debugCount :number;
  totalCount :number;
}
export interface LogEntry {
  id: number;
  timestamp: string;
  level: string;
  source: string;
  message: string;
  raw?: string;
}

export interface PagedResult<T> {
  items: T[];
  totalItems: number;
}
