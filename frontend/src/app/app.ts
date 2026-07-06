import { Component, OnInit, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, CommonModule],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class AppComponent implements OnInit {
  userCount = signal(0);
  isLoading = signal(false);
  errorMessage = signal('');

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.fetchUserCount();
  }

  fetchUserCount() {
    this.http.get<{ count: number }>('http://localhost:3000/api/users/count')
      .subscribe({
        next: (response) => {
          this.userCount.set(response.count);
        },
        error: () => {
          this.errorMessage.set('Failed to fetch user count.');
        }
      });
  }

  addUser() {
    this.isLoading.set(true);
    this.errorMessage.set('');

    this.http.post<{ totalCount: number }>('http://localhost:3000/api/users/add', {})
      .subscribe({
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