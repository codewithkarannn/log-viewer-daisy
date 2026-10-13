import { Injectable, computed, inject, signal } from '@angular/core';
import { finalize } from 'rxjs';
import { LogApiService } from '../services/log-api.service';
import { LogEntry, LogEntrySummary, LogFileInfo } from '../models/log.models';


export type FlowStage = 'directory' | 'files' | 'logs';

const SESSION_STORAGE_KEY = 'log_viewer_active_session';

@Injectable()
export class LogSessionStore {
  readonly api = inject(LogApiService);

  // -------------------------------------------------------------
  // Workflow Navigation & Loading
  // -------------------------------------------------------------
  readonly currentStage = signal<FlowStage>('directory');
  readonly isTraversing = signal<boolean>(false);
  readonly traversalTitle = signal<string>('Processing...');
  readonly traversalMessage = signal<string>('Connecting to service...');
  readonly toastMessage = signal<string | null>(null);
  readonly copyFeedback = signal<string | null>(null);

  // -------------------------------------------------------------
  // Stage 1: Directory Selection State
  // -------------------------------------------------------------
  readonly directoryPath = signal<string>(this.api.activeDirectory());
  readonly directoryMode = signal<'server' | 'direct' | 'upload'>('server');
  readonly directFilePath = signal<string>('');
  readonly fileVerifying = signal<boolean>(false);
  readonly fileVerifyResult = signal<{ success: boolean; message?: string } | null>(null);
  readonly recentDirectories = signal<string[]>([
    '/Users/karanvishwakarma/Downloads/LOgs last 7day/backup_20260430_050548/',
    '/var/log',
    './logs',
  ]);

  // -------------------------------------------------------------
  // Stage 2: Files Browser State & Computeds
  // -------------------------------------------------------------
  readonly fileSearch = signal<string>('');
  readonly fileTypeFilter = signal<'ALL' | 'LOG' | 'TXT'>('ALL');
  readonly fileSortBy = signal<
    'date-desc' | 'date-asc' | 'name-asc' | 'name-desc' | 'size-desc' | 'size-asc'
  >('date-desc');

  readonly filteredFiles = computed(() => {
    let list = [...this.api.files()];
    const query = this.fileSearch().trim().toLowerCase();
    const type = this.fileTypeFilter();

    if (type === 'LOG') {
      list = list.filter((f) => f.name.toLowerCase().endsWith('.log'));
    } else if (type === 'TXT') {
      list = list.filter((f) => f.name.toLowerCase().endsWith('.txt'));
    }

    if (query) {
      list = list.filter(
        (f) => f.name.toLowerCase().includes(query) || f.fullPath.toLowerCase().includes(query),
      );
    }

    const sortBy = this.fileSortBy();
    list.sort((a, b) => {
      switch (sortBy) {
        case 'date-desc':
          return new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime();
        case 'date-asc':
          return new Date(a.lastModified).getTime() - new Date(b.lastModified).getTime();
        case 'name-asc':
          return a.name.localeCompare(b.name);
        case 'name-desc':
          return b.name.localeCompare(a.name);
        case 'size-desc':
          return b.size - a.size;
        case 'size-asc':
          return a.size - b.size;
        default:
          return 0;
      }
    });

    return list;
  });

  readonly totalDirectorySize = computed(() =>
    this.api.files().reduce((sum, f) => sum + (f.size || 0), 0),
  );

  // -------------------------------------------------------------
  // Stage 3: Logs State & Computeds
  // -------------------------------------------------------------
  readonly logs = signal<LogEntry[]>([]);
  readonly totalLogEntries = signal<number>(0);
  readonly currentPage = signal<number>(1);
  readonly pageSize = signal<number>(50);
  readonly pageSizeOptions = [25, 50, 100, 250, 500];
  readonly logSummary = signal<LogEntrySummary | null>(null);
  readonly logSearch = signal<string>('');
  readonly logLevelFilter = signal<'ALL' | 'ERROR' | 'WARN' | 'INFO' | 'DEBUG'>('ALL');
  readonly logSourceFilter = signal<string>('ALL');
  readonly wrapLines = signal<boolean>(true);

  readonly selectedLogEntry = signal<LogEntry | null>(null);
  readonly detailModalOpen = signal<boolean>(false);

  readonly filteredLogs = computed(() => {
    const list = this.logs();
    const query = this.logSearch().trim().toLowerCase();
    const level = this.logLevelFilter();
    const source = this.logSourceFilter();

    return list.filter((item) => {
      if (level !== 'ALL') {
        const itemLevel = (item.level || '').toUpperCase();
        if (level === 'ERROR' && !itemLevel.includes('ERROR') && !itemLevel.includes('FATAL'))
          return false;
        if (level === 'WARN' && !itemLevel.includes('WARN')) return false;
        if (level === 'INFO' && !itemLevel.includes('INFO')) return false;
        if (level === 'DEBUG' && !itemLevel.includes('DEBUG') && !itemLevel.includes('TRACE'))
          return false;
      }

      if (source !== 'ALL' && item.source !== source) return false;

      if (query) {
        const matchMessage = (item.message || '').toLowerCase().includes(query);
        const matchSource = (item.source || '').toLowerCase().includes(query);
        const matchTime = (item.timestamp || '').toLowerCase().includes(query);
        const matchRaw = (item.raw || '').toLowerCase().includes(query);
        if (!matchMessage && !matchSource && !matchTime && !matchRaw) return false;
      }

      return true;
    });
  });

  readonly uniqueSources = computed(() => {
    const set = new Set<string>();
    this.logs().forEach((entry) => {
      if (entry.source) set.add(entry.source);
    });
    return Array.from(set).sort();
  });

  readonly logMetrics = computed(() => {
    const items = this.logs();
    let errors = 0;
    let warnings = 0;
    let infos = 0;
    let debugs = 0;

    items.forEach((e) => {
      const lvl = (e.level || '').toUpperCase();
      if (lvl.includes('ERROR') || lvl.includes('FATAL')) errors++;
      else if (lvl.includes('WARN')) warnings++;
      else if (lvl.includes('INFO')) infos++;
      else if (lvl.includes('DEBUG') || lvl.includes('TRACE')) debugs++;
    });

    const total = items.length;
    return {
      total,
      errors,
      warnings,
      infos,
      debugs,
      errorPct: total > 0 ? Math.round((errors / total) * 100) : 0,
      warnPct: total > 0 ? Math.round((warnings / total) * 100) : 0,
      infoPct: total > 0 ? Math.round((infos / total) * 100) : 0,
    };
  });

  readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.totalLogEntries() / this.pageSize())),
  );

  // -------------------------------------------------------------
  // Constructor: Auto-Restore State on Page Refresh
  // -------------------------------------------------------------
  constructor() {
    this.restoreSessionOnReload();
  }

  // -------------------------------------------------------------
  // Actions: Directory Scanning
  // -------------------------------------------------------------
  scanDirectory(targetPath?: string): void {
    const path = (targetPath || this.directoryPath()).trim();
    if (!path) {
      this.showToast('Please provide a directory path.');
      return;
    }

    this.directoryPath.set(path);
    this.saveRecent(path);

    this.isTraversing.set(true);
    this.traversalTitle.set('Scanning Server Directory');
    this.traversalMessage.set(`Discovering .log and .txt files in: ${path}`);

    this.api
      .getFiles(path)
      .pipe(finalize(() => this.isTraversing.set(false)))
      .subscribe({
        next: (res) => {
          this.currentStage.set('files');
          this.persistSession(); // Save stage 2 on success

          if (res.isSuccess && res.data && res.data.length > 0) {
            this.showToast(`Found ${res.data.length} log files.`);
          } else {
            this.showToast(res.message || 'No log files found in directory.');
          }
        },
        error: (err) => {
          this.showToast(err?.error?.message || err?.message || 'Failed to read directory.');
        },
      });
  }

  // -------------------------------------------------------------
  // Actions: Select File & Load Logs
  // -------------------------------------------------------------
  selectFileAndTraverse(file: LogFileInfo): void {
    this.api.setSelectedFile(file);
    this.currentPage.set(1);

    this.isTraversing.set(true);
    this.traversalTitle.set('Loading Log Stream');
    this.traversalMessage.set(`Reading & parsing entries from ${file.name}...`);

    this.fetchLogsForFile(file.fullPath, 1, this.pageSize(), true);
  }

  fetchLogsForFile(filePath: string, page = 1, size = 50, traverseOnSuccess = false): void {
    this.api
      .getLogsPaged(filePath, page, size)
      .pipe(finalize(() => this.isTraversing.set(false)))
      .subscribe({
        next: (res) => {
          if (res.isSuccess && res.data) {
            const items = (res.data as any).items || (Array.isArray(res.data) ? res.data : []);
            const total =
              (res.data as any).totalCount ?? (res.data as any).totalItems ?? items.length;

            this.logs.set(items);
            this.totalLogEntries.set(total);

            if (traverseOnSuccess) {
              this.currentStage.set('logs');
              this.persistSession(); // Save stage 3 on success
              this.showToast(`Loaded ${items.length} records.`);
            }
          } else {
            this.fallbackReadFile(filePath, traverseOnSuccess);
          }
        },
        error: () => this.fallbackReadFile(filePath, traverseOnSuccess),
      });
  }

  fetchLogsSummary(filePath: string ): void {
    this.api
      .getSummary(filePath)
      .pipe(finalize(() => this.isTraversing.set(false)))
      .subscribe({
        next: (res) => {
          if (res.isSuccess && res.data) {
            this.logSummary.set(res.data);
            this.totalLogEntries.set(res.data.totalCount);
          }
        },
        error: (err) => this.showToast(err?.message || 'Error loading logs from server.'),
      });
  }

  private fallbackReadFile(filePath: string, traverseOnSuccess: boolean): void {
    this.api
      .readFile(filePath)
      .pipe(finalize(() => this.isTraversing.set(false)))
      .subscribe({
        next: (res) => {
          if (res.isSuccess && res.data) {
            this.logs.set(res.data);
            this.totalLogEntries.set(res.data.length);
            if (traverseOnSuccess) {
              this.currentStage.set('logs');
              this.persistSession();
            }
          }
        },
        error: (err) => this.showToast(err?.message || 'Error loading logs from server.'),
      });
  }

  refreshCurrentLogs(): void {
    const file = this.api.selectedFile();
    if (file) {
      this.isTraversing.set(true);
      this.traversalTitle.set('Refreshing Log Stream');
      this.traversalMessage.set('Fetching latest entries...');
      this.fetchLogsForFile(file.fullPath, this.currentPage(), this.pageSize(), false);
    }
  }

  // -------------------------------------------------------------
  // Actions: Direct File & Local Upload
  // -------------------------------------------------------------
  verifyAndSelectDirectFile(): void {
    const path = this.directFilePath().trim();
    if (!path) return;

    this.fileVerifying.set(true);
    this.fileVerifyResult.set(null);

    this.api
      .getLogsPaged(path, 1, 5)
      .pipe(finalize(() => this.fileVerifying.set(false)))
      .subscribe({
        next: (res) => {
          if (res.isSuccess && res.data) {
            const fileName = path.split('/').pop() || path;
            const info: LogFileInfo = {
              name: fileName,
              fullPath: path,
              size: 0,
              lastModified: new Date(),
            };
            this.selectFileAndTraverse(info);
          } else {
            this.fileVerifyResult.set({
              success: false,
              message: res.message || 'File not found or unreadable on server.',
            });
          }
        },
        error: (err) => {
          this.fileVerifyResult.set({
            success: false,
            message: err?.error?.message || err?.message || 'Error verifying direct file path.',
          });
        },
      });
  }

  loadLocalFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;
    const file = input.files[0];

    const info: LogFileInfo = {
      name: file.name,
      fullPath: (file as any).path || file.name,
      size: file.size,
      lastModified: new Date(file.lastModified),
    };

    const reader = new FileReader();
    this.isTraversing.set(true);
    this.traversalTitle.set('Parsing Local File');
    this.traversalMessage.set(`Reading ${file.name}...`);

    reader.onload = (e) => {
      this.isTraversing.set(false);
      const text = e.target?.result as string;
      const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
      const entries: LogEntry[] = lines.map((line, idx) => ({
        id: idx + 1,
        timestamp: new Date().toISOString(),
        level: line.toUpperCase().includes('ERROR')
          ? 'ERROR'
          : line.toUpperCase().includes('WARN')
            ? 'WARN'
            : 'INFO',
        source: 'ClientFile',
        message: line,
        raw: line,
      }));

      this.api.setSelectedFile(info);
      this.logs.set(entries);
      this.totalLogEntries.set(entries.length);
      this.currentStage.set('logs');
      this.persistSession();
      this.showToast(`Loaded ${entries.length} local records.`);
    };

    reader.onerror = () => {
      this.isTraversing.set(false);
      this.showToast('Failed to read local file.');
    };

    reader.readAsText(file);
  }

  // -------------------------------------------------------------
  // Pagination & Modals
  // -------------------------------------------------------------
  onPageChange(page: number): void {
    if (page < 1 || page > this.totalPages()) return;
    this.currentPage.set(page);
    const file = this.api.selectedFile();
    if (file) {
      this.fetchLogsForFile(file.fullPath, page, this.pageSize(), false);
    }
  }

  onPageSizeChange(newSize: number): void {
    this.pageSize.set(newSize);
    this.currentPage.set(1);
    const file = this.api.selectedFile();
    if (file) {
      this.fetchLogsForFile(file.fullPath, 1, newSize, false);
    }
  }

  openLogDetail(entry: LogEntry): void {
    this.selectedLogEntry.set(entry);
    this.detailModalOpen.set(true);
  }

  closeLogDetail(): void {
    this.detailModalOpen.set(false);
    this.selectedLogEntry.set(null);
  }

  goToStage(stage: FlowStage): void {
    this.currentStage.set(stage);
    this.persistSession();
  }

  showToast(msg: string): void {
    this.toastMessage.set(msg);
    setTimeout(() => this.toastMessage.set(null), 3000);
  }

  copyToClipboard(text: string, label = 'Copied!'): void {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      this.copyFeedback.set(label);
      setTimeout(() => this.copyFeedback.set(null), 2000);
    });
  }

  formatSize(bytes: number | undefined): string {
    if (!bytes) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

  private saveRecent(dir: string): void {
    const list = [dir, ...this.recentDirectories().filter((d) => d !== dir)].slice(0, 5);
    this.recentDirectories.set(list);
  }

  // -------------------------------------------------------------
  // Session Persistence Logic
  // -------------------------------------------------------------
  private persistSession(): void {
    const payload = {
      stage: this.currentStage(),
      directoryPath: this.directoryPath(),
      selectedFile: this.api.selectedFile(),
    };
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(payload));
  }

  private restoreSessionOnReload(): void {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return;

    try {
      const session = JSON.parse(raw);
      if (session.directoryPath) {
        this.directoryPath.set(session.directoryPath);
      }

      // If user was on Stage 2 (files), re-fetch directory files automatically
      if (session.stage === 'files' && session.directoryPath) {
        this.scanDirectory(session.directoryPath);
      }
      // If user was on Stage 3 (logs), re-fetch logs for that file
      else if (session.stage === 'logs' && session.selectedFile) {
        this.api.setSelectedFile(session.selectedFile);

        // Preload directory files in background so "Back to files" works immediately
        if (session.directoryPath) {
          this.api.getFiles(session.directoryPath).subscribe();
        }

        // Restore Stage 3
        this.fetchLogsForFile(session.selectedFile.fullPath, 1, this.pageSize(), true);
        this.fetchLogsSummary(session.selectedFile.fullPath);

      }
    } catch {
      // Ignore parse errors and let it default to directory stage
    }
  }
}
