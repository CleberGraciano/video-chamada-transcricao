import { bootstrapApplication } from '@angular/platform-browser';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter, Routes, withComponentInputBinding } from '@angular/router';
import { AppComponent } from './app/app.component';
import { HomeComponent } from './app/pages/home.component';

const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'room/:id', loadComponent: () => import('./app/pages/room.component').then(m => m.RoomComponent) },
  { path: '**', redirectTo: '' }
];

bootstrapApplication(AppComponent, {
  providers: [
    provideHttpClient(),
    provideRouter(routes, withComponentInputBinding())
  ]
}).catch(err => console.error(err));
