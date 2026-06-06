import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { Subject, Subscription, of } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap, catchError, tap } from 'rxjs/operators';
import { WeatherService, WeatherData } from '../../services/weather.service';
import { AuthService } from '../../services/auth.service';
import { WeatherCardComponent } from '../../components/weather-card/weather-card.component';
import { ForecastCardComponent } from '../../components/forecast-card/forecast-card.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    WeatherCardComponent,
    ForecastCardComponent
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css'
})
export class DashboardComponent implements OnInit, OnDestroy {
  weatherData: WeatherData | null = null;
  isLoading: boolean = false;
  errorMsg: string = '';
  lastSearchQuery: string = 'Bengaluru';
  searchMode: 'city' | 'coords' = 'city';
  lastCoords: { lat: number; lon: number } | null = null;

  // RxJS Autocomplete / Debouncing search stream
  searchControl = new FormControl('');
  private searchSub!: Subscription;

  // API Key management
  showApiKeyConfig: boolean = false;
  apiKeyInput: string = '';
  savedApiKey: string = '';

  constructor(
    private weatherService: WeatherService,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    this.savedApiKey = this.weatherService.getSavedApiKey();
    this.apiKeyInput = this.savedApiKey;

    // Set up debounced search stream using RxJS operators
    this.searchSub = this.searchControl.valueChanges.pipe(
      debounceTime(500),
      distinctUntilChanged(),
      tap((val) => {
        if (val && val.trim().length >= 2) {
          this.isLoading = true;
          this.errorMsg = '';
        }
      }),
      switchMap((val) => {
        if (!val || val.trim().length < 2) {
          return of(null);
        }
        const city = val.trim();
        this.lastSearchQuery = city;
        this.searchMode = 'city';
        return this.weatherService.getWeather(city).pipe(
          catchError((err) => {
            this.errorMsg = err.message || 'Failed to fetch weather data.';
            this.weatherData = null;
            return of(null);
          })
        );
      })
    ).subscribe((data) => {
      this.isLoading = false;
      if (data) {
        this.weatherData = data;
      }
    });

    // Request user location permissions
    this.requestUserLocation();
  }

  ngOnDestroy(): void {
    if (this.searchSub) {
      this.searchSub.unsubscribe();
    }
  }

  requestUserLocation(): void {
    this.isLoading = true;
    this.errorMsg = '';
    
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = position.coords.latitude;
          const lon = position.coords.longitude;
          this.lastCoords = { lat, lon };
          this.searchMode = 'coords';
          this.loadWeatherByCoords(lat, lon);
        },
        (error) => {
          console.warn('Geolocation permission denied or error. Defaulting to Bengaluru.', error);
          this.searchMode = 'city';
          this.lastSearchQuery = 'Bengaluru';
          this.loadWeather(this.lastSearchQuery);
        },
        { timeout: 8000 }
      );
    } else {
      this.searchMode = 'city';
      this.lastSearchQuery = 'Bengaluru';
      this.loadWeather(this.lastSearchQuery);
    }
  }

  loadWeather(city: string): void {
    this.isLoading = true;
    this.errorMsg = '';
    
    this.weatherService.getWeather(city).pipe(
      catchError((err) => {
        this.errorMsg = err.message || 'Failed to fetch weather data.';
        this.weatherData = null;
        this.isLoading = false;
        return of(null);
      })
    ).subscribe((data) => {
      this.isLoading = false;
      if (data) {
        this.weatherData = data;
      }
    });
  }

  loadWeatherByCoords(lat: number, lon: number): void {
    this.isLoading = true;
    this.errorMsg = '';
    
    this.weatherService.getWeatherByCoords(lat, lon).pipe(
      catchError((err) => {
        this.errorMsg = err.message || 'Failed to fetch weather data by coordinates.';
        this.weatherData = null;
        this.isLoading = false;
        return of(null);
      })
    ).subscribe((data) => {
      this.isLoading = false;
      if (data) {
        this.weatherData = data;
      }
    });
  }

  // Triggered by manual search button or enter key (bypasses debounce)
  onManualSearch(): void {
    const value = this.searchControl.value;
    if (value && value.trim().length >= 2) {
      const city = value.trim();
      this.lastSearchQuery = city;
      this.searchMode = 'city';
      this.loadWeather(city);
    }
  }

  // Retry trigger for request failures (yellow retry UI trigger)
  onRetry(): void {
    if (this.searchMode === 'coords' && this.lastCoords) {
      this.loadWeatherByCoords(this.lastCoords.lat, this.lastCoords.lon);
    } else {
      this.loadWeather(this.lastSearchQuery);
    }
  }

  // API Key operations
  saveApiKey(): void {
    this.weatherService.setApiKey(this.apiKeyInput.trim());
    this.savedApiKey = this.apiKeyInput.trim();
    this.showApiKeyConfig = false;
    
    // Reload weather with new API credentials
    this.onRetry();
  }

  clearApiKey(): void {
    this.weatherService.setApiKey('');
    this.apiKeyInput = '';
    this.savedApiKey = '';
    this.showApiKeyConfig = false;
    this.onRetry();
  }

  logout(): void {
    this.authService.logout();
  }
}

