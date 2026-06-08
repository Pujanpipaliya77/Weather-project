import { Component, OnInit, OnDestroy, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { Subscription, of } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap, catchError, tap } from 'rxjs/operators';
import { WeatherService, WeatherData } from '../../services/weather.service';
import { WeatherCardComponent } from '../../components/weather-card/weather-card.component';
import { ForecastCardComponent } from '../../components/forecast-card/forecast-card.component';
import * as L from 'leaflet';

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
export class DashboardComponent implements OnInit, OnDestroy, AfterViewInit {
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

  // Leaflet Map fields
  private map?: L.Map;
  private marker?: L.Marker;
  private weatherTileLayer?: L.TileLayer;
  public activeRadarLayer: string = 'temp'; // default radar layer

  constructor(
    private weatherService: WeatherService
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
            this.cleanupMap();
            return of(null);
          })
        );
      })
    ).subscribe((data) => {
      this.isLoading = false;
      if (data) {
        this.weatherData = data;
        setTimeout(() => this.updateMap(), 50);
      }
    });

    // Request user location permissions
    this.requestUserLocation();
  }

  ngOnDestroy(): void {
    if (this.searchSub) {
      this.searchSub.unsubscribe();
    }
    this.cleanupMap();
  }

  ngAfterViewInit(): void {
    // Handled dynamically in updateMap when DOM container is ready
  }

  private cleanupMap(): void {
    if (this.map) {
      try {
        this.map.remove();
      } catch (e) {
        console.warn('Error removing Leaflet map:', e);
      }
      this.map = undefined;
      this.marker = undefined;
      this.weatherTileLayer = undefined;
    }
  }

  private updateMap(): void {
    if (!this.weatherData) return;

    // Check if the DOM container is rendered in the browser yet
    const container = document.getElementById('weather-map');
    if (!container) {
      // Retry in 50ms after Angular finishes rendering the *ngIf block
      setTimeout(() => this.updateMap(), 50);
      return;
    }

    // Initialize the map if it hasn't been created yet
    if (!this.map) {
      // Configure Leaflet default marker icons to use CDN assets
      const iconDefault = L.icon({
        iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
        iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41]
      });
      L.Marker.prototype.options.icon = iconDefault;

      const lat = this.weatherData.lat;
      const lon = this.weatherData.lon;

      this.map = L.map('weather-map', {
        center: [lat, lon],
        zoom: 6,
        zoomControl: true
      });

      // Load OpenStreetMap tiles
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
        attribution: '© OpenStreetMap contributors'
      }).addTo(this.map);

      // Register click event on the map to search location by coordinates
      this.map.on('click', (e: L.LeafletMouseEvent) => {
        const { lat, lng } = e.latlng;
        this.lastCoords = { lat, lon: lng };
        this.searchMode = 'coords';
        this.loadWeatherByCoords(lat, lng);
      });
    }

    const lat = this.weatherData.lat;
    const lon = this.weatherData.lon;

    // Fly to coordinates smoothly
    this.map.flyTo([lat, lon], 9);

    // Clear previous marker
    if (this.marker) {
      this.map.removeLayer(this.marker);
    }

    const popupContent = `
      <div style="color: #0f172a; font-family: sans-serif; font-size: 13px; font-weight: bold; min-width: 120px;">
        <div style="font-size: 14px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; margin-bottom: 6px;">
          ${this.weatherData.city}, ${this.weatherData.country}
        </div>
        <div style="display: flex; align-items: center; gap: 4px;">
          <img src="https://openweathermap.org/img/wn/${this.weatherData.icon}.png" style="width: 30px; height: 30px;" />
          <span style="font-size: 16px; font-weight: 900;">${this.weatherData.temp}°C</span>
        </div>
        <div style="color: #64748b; font-weight: normal; font-size: 11px; margin-top: 4px; text-transform: capitalize;">
          ${this.weatherData.description}
        </div>
      </div>
    `;

    // Add marker at city center
    this.marker = L.marker([lat, lon])
      .addTo(this.map)
      .bindPopup(popupContent)
      .openPopup();

    // Redraw weather overlay
    this.updateWeatherLayer();
  }

  public setRadarLayer(layer: string): void {
    this.activeRadarLayer = layer;
    this.updateWeatherLayer();
  }

  private updateWeatherLayer(): void {
    if (!this.map) return;

    // Remove existing layer if any
    if (this.weatherTileLayer) {
      this.map.removeLayer(this.weatherTileLayer);
      this.weatherTileLayer = undefined;
    }

    if (this.activeRadarLayer === 'none') return;

    const key = this.weatherService.getSavedApiKey() || 'f79c371e35f27bae5b2161df36f7e38c';
    let owmLayer = 'temp_new';
    if (this.activeRadarLayer === 'precipitation') owmLayer = 'precipitation_new';
    if (this.activeRadarLayer === 'clouds') owmLayer = 'clouds_new';
    if (this.activeRadarLayer === 'wind') owmLayer = 'wind_new';

    const layerUrl = `https://tile.openweathermap.org/map/${owmLayer}/{z}/{x}/{y}.png?appid=${key}`;

    this.weatherTileLayer = L.tileLayer(layerUrl, {
      maxZoom: 18,
      opacity: 0.55,
      attribution: '© OpenWeatherMap'
    }).addTo(this.map);
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
        this.cleanupMap();
        this.isLoading = false;
        return of(null);
      })
    ).subscribe((data) => {
      this.isLoading = false;
      if (data) {
        this.weatherData = data;
        setTimeout(() => this.updateMap(), 50);
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
        this.cleanupMap();
        this.isLoading = false;
        return of(null);
      })
    ).subscribe((data) => {
      this.isLoading = false;
      if (data) {
        this.weatherData = data;
        setTimeout(() => this.updateMap(), 50);
      }
    });
  }

  onManualSearch(): void {
    const value = this.searchControl.value;
    if (value && value.trim().length >= 2) {
      const city = value.trim();
      this.lastSearchQuery = city;
      this.searchMode = 'city';
      this.loadWeather(city);
    }
  }

  onRetry(): void {
    // Request actual current geolocation
    this.requestUserLocation();
  }

  saveApiKey(): void {
    this.weatherService.setApiKey(this.apiKeyInput.trim());
    this.savedApiKey = this.apiKeyInput.trim();
    this.showApiKeyConfig = false;
    this.onRetry();
  }

  clearApiKey(): void {
    this.weatherService.setApiKey('');
    this.apiKeyInput = '';
    this.savedApiKey = '';
    this.showApiKeyConfig = false;
    this.onRetry();
  }
}
