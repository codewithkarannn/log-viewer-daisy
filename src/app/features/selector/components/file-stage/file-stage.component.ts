import { Component, inject } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LogSessionStore } from '../../../../shared/log-session-store';


@Component({
  selector: 'app-file-stage',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe],
  templateUrl: './file-stage.component.html',
})
export class FileStageComponent {
  readonly store = inject(LogSessionStore);
}
