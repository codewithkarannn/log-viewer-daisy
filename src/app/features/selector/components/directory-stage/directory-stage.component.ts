import { Component, EventEmitter, inject, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LogSessionStore } from '../../../../shared/log-session-store';

@Component({
  selector: 'app-directory-stage',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './directory-stage.component.html',
})
export class DirectoryStageComponent {
  readonly store = inject(LogSessionStore);
}
