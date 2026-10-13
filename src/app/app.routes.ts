import { Routes } from '@angular/router';
import { SelectorComponent } from './features/selector/selector.component';

export const routes: Routes = [
  {
    path: '',
    component: SelectorComponent,
  },
  {
    path: '**',
    redirectTo: '',
  },
];
