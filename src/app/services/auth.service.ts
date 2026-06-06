import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Router } from '@angular/router';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private isLoggedInSubject = new BehaviorSubject<boolean>(this.hasToken());
  public isLoggedIn$: Observable<boolean> = this.isLoggedInSubject.asObservable();

  constructor(private router: Router) {}

  private hasToken(): boolean {
    if (typeof window !== 'undefined' && window.localStorage) {
      return !!localStorage.getItem('weather_dashboard_session');
    }
    return false;
  }

  public login(email: string, password: string): boolean {
    if (email && password && email.trim().toLowerCase() === 'admin@weather.com' && password === 'admin123') {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem('weather_dashboard_session', JSON.stringify({ email, loginTime: Date.now() }));
      }
      this.isLoggedInSubject.next(true);
      return true;
    }
    return false;
  }

  public logout(): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.removeItem('weather_dashboard_session');
    }
    this.isLoggedInSubject.next(false);
    this.router.navigate(['/login']);
  }

  public isAuthenticated(): boolean {
    return this.isLoggedInSubject.value;
  }
}

