import { Component, inject } from '@angular/core';
import { CommonModule, DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LogSessionStore } from '../../../../shared/log-session-store';
import { LogEntry } from '../../../../models/log.models';

@Component({
  selector: 'app-log-stage',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe, DecimalPipe],
  templateUrl: './log-stage.component.html',
})
export class LogStageComponent {
  readonly store = inject(LogSessionStore);

  // 1. Copies ONLY the message body
  copyMessage(entry: LogEntry): void {
    const text = entry.message || entry.raw || '';
    this.store.copyToClipboard(text, 'Message copied!');
  }

  // 2. Copies the complete formatted row
  copyFullRow(entry: LogEntry): void {
    const formatted =
      entry.raw ||
      `[${entry.timestamp}] [${entry.level}] [${entry.source || 'default'}]: ${entry.message}`;
    this.store.copyToClipboard(formatted, 'Full row copied!');
  }
}
