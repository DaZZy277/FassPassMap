import { Component } from '@angular/core';
 import { MapComponent } from './component/map-view.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [MapComponent],
  template: `
    <app-map></app-map>
  `
})
export class App {}

// Source - https://stackoverflow.com/q
// Posted by rony, modified by community. See post 'Timeline' for change history
// Retrieved 2025-11-10, License - CC BY-SA 4.0


