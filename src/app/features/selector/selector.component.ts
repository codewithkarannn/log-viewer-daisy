import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FileStageComponent } from './components/file-stage/file-stage.component';
import { LogStageComponent } from './components/log-stage/log-stage.component';
import { DirectoryStageComponent } from './components/directory-stage/directory-stage.component';
import { LogSessionStore } from '../../shared/log-session-store';


@Component({
  selector: 'app-selector',
  standalone: true,
  imports: [CommonModule, DirectoryStageComponent, FileStageComponent, LogStageComponent],
  providers: [LogSessionStore], // Creates a fresh, scoped store instance for this view

  templateUrl: './selector.component.html',
})
export class SelectorComponent {
  readonly store = inject(LogSessionStore);


}
