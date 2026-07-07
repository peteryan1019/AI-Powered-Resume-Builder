import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { JsonPipe } from '@angular/common';
import { Navbar } from './navbar/navbar';


@Component({
  selector: 'app-root',
  imports: [RouterOutlet, JsonPipe, NavBar],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class AppComponent implements OnInit {
  user: any = null;
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

  googleLogin() {
    window.location.href = "http://localhost:3000/auth/google";
  }

  checkUser() {
    this.http.get("http://localhost:3000/auth/me", {
      withCredentials: true,
    }).subscribe({
      next: (res: any) => {
        this.user = res.user;
        console.log(res);
      },
      error: (err) => {
        this.user = null;
        console.log("Not logged in", err);
      },
    });
  }

  logout() {
    this.http.post("http://localhost:3000/auth/logout", {}, {
      withCredentials: true,
    }).subscribe(() => {
      this.user = null;
    });
  }

}
