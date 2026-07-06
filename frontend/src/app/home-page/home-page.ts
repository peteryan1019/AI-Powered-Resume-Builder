import { CommonModule } from '@angular/common';
import { Component, OnInit, signal, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-home-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './home-page.html'
})
export class HomePage implements OnInit {
  private readonly http = inject(HttpClient);

  userCount = signal(0);
  isLoading = signal(false);
  errorMessage = signal('');

  ngOnInit(): void {
    this.fetchUserCount();
  }

  fetchUserCount(): void {
    this.http.get<{ count: number }>('http://localhost:3000/api/users/count').subscribe({
      next: (response) => this.userCount.set(response.count),
      error: () => this.errorMessage.set('Failed to fetch user count.')
    });
  }

  addUser(): void {
    this.isLoading.set(true);
    this.errorMessage.set('');

    this.http.post<{ totalCount: number }>('http://localhost:3000/api/users/add', {}).subscribe({
      next: (response) => {
        this.userCount.set(response.totalCount);
        this.isLoading.set(false);
      },
      error: () => {
        this.errorMessage.set('Failed to add user.');
        this.isLoading.set(false);
      }
    });
  }
}
