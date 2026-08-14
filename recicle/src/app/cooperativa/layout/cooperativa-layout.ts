import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ToastHost } from '../shared/toast-host';

@Component({
  selector: 'app-cooperativa-layout',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, ToastHost],
  templateUrl: './cooperativa-layout.html',
  styleUrls: ['../shared/cooperativa-shared.css', './cooperativa-layout.css'],
})
export class CooperativaLayout {}
