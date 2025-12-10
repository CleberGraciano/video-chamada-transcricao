import { Component } from '@angular/core';
import { RouterOutlet, RouterLink } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink],
  template: `
    <header>
      <div class="container">
        <a routerLink="/" style="text-decoration:none;color:#e2e8f0"><strong>Video Meet</strong></a>
      </div>
    </header>
    <main>
      <div class="container">
        <router-outlet></router-outlet>
      </div>
    </main>
  `
})
export class AppComponent {}
