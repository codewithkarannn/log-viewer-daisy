
import { inject, Injectable, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, catchError, of, tap } from 'rxjs';
import {
  ApiResponse,
  LogEntry,
  LogEntrySummary,
  LogFileInfo,
  PagedResult,
} from '../models/log.models';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class LogApiService {
  private readonly http = inject(HttpClient);
  readonly apiUrl = environment.apiUrl;

  // State Signals
  readonly apiConnected = signal<boolean | null>(null);
  readonly checkingHealth = signal<boolean>(false);
  readonly activeDirectory = signal<string>(environment.defaultRootDirectory || '');
  readonly files = signal<LogFileInfo[]>([]);
  readonly logEntrySummary=  signal<LogEntrySummary |  null>(null);
  readonly selectedFile = signal<LogFileInfo | null>(null);
  readonly loading = signal<boolean>(false);
  readonly error = signal<string | null>(null);

  /**
   * Pings the API health check endpoint.
   */
  checkHealth(): Observable<ApiResponse<any>> {
    this.checkingHealth.set(true);
    return this.http.get<ApiResponse<any>>(`${this.apiUrl}/api/Logs/HealthCheck`).pipe(
      tap({
        next: (res) => {
          this.apiConnected.set(res?.isSuccess ?? true);
          this.checkingHealth.set(false);
        },
        error: () => {
          this.apiConnected.set(false);
          this.checkingHealth.set(false);
        },
      }),
      catchError((err) => {
        this.apiConnected.set(false);
        this.checkingHealth.set(false);
        return of({ isSuccess: false, data: null, message: err.message });
      }),
    );
  }

  /**
   * Fetches log files within the specified server directory.
   */
  getFiles(rootDirectory: string): Observable<ApiResponse<LogFileInfo[]>> {
    this.loading.set(true);
    this.error.set(null);
    this.activeDirectory.set(rootDirectory);

    const params = new HttpParams().set('rootDirectory', rootDirectory);
    return this.http
      .get<ApiResponse<LogFileInfo[]>>(`${this.apiUrl}/api/Logs/GetFiles`, { params })
      .pipe(
        tap({
          next: (res) => {
            this.loading.set(false);
            if (res.isSuccess && res.data) {
              this.files.set(res.data);
            } else {
              this.files.set([]);
              this.error.set(res.message || 'No files found.');
            }
          },
          error: (err) => {
            this.loading.set(false);
            this.files.set([]);
            const message =
              err?.error?.message ||
              err?.message ||
              'Failed to connect to API or directory not found.';
            this.error.set(message);
          },
        }),
      );
  }

  getSummary(rootDirectory: string): Observable<ApiResponse<LogEntrySummary>> {
    const params = new HttpParams().set('filePath', rootDirectory);
    return this.http
      .get<ApiResponse<LogEntrySummary>>(`${this.apiUrl}/api/Logs/GetLogSummary`, { params })
      .pipe(
        tap({
          next: (res) => {
            this.loading.set(false);
            if (res.isSuccess && res.data) {
              this.logEntrySummary.set(res.data);
            } else {
              this.logEntrySummary.set(null);
              this.error.set(res.message || 'No logs found.');
            }
          },
          error: (err) => {
            this.loading.set(false);
            this.files.set([]);
            const message =
              err?.error?.message ||
              err?.message ||
              'Failed to connect to API or directory not found.';
            this.error.set(message);
          },
        }),
      );
  }

  /**
   * Reads parsed entries from a specific file path.
   */
  readFile(filePath: string): Observable<ApiResponse<LogEntry[]>> {
    const params = new HttpParams().set('filePath', filePath);
    return this.http.get<ApiResponse<LogEntry[]>>(`${this.apiUrl}/api/Logs/ReadFile`, { params });
  }

  /**
   * Fetches paged log entries for a specific file.
   */
  getLogsPaged(
    filePath: string,
    pageNumber: number = 1,
    pageSize: number = 50,
  ): Observable<ApiResponse<PagedResult<LogEntry>>> {
    const params = new HttpParams()
      .set('filePath', filePath)
      .set('pageNumber', pageNumber.toString())
      .set('pageSize', pageSize.toString());

    return this.http.get<ApiResponse<PagedResult<LogEntry>>>(
      `${this.apiUrl}/api/Logs/GetLogsPaged`,
      { params },
    );
  }

  /**
   * Selects a file and stores it in state.
   */
  setSelectedFile(file: LogFileInfo | null): void {
    this.selectedFile.set(file);
  }
}
